-- =====================================================================
-- NEX-014 — Movimientos operativos: idempotencia, anulación, reservas/cuarentena, kardex y API segura de escritura
-- Completa los ítems 5 (Movimientos) y 6 (Stock) para producción:
--   * alta transaccional de un movimiento completo (cabecera + líneas) con CLAVE DE IDEMPOTENCIA y huella de la solicitud;
--   * anulación por MOVIMIENTO INVERSO (el histórico nunca se edita); D-C5 opción A = salida revertida al COSTO CONGELADO (provisional, pendiente de aprobación);
--   * reservas y cuarentena (cambio de estado de stock sin alterar el valor), con disponibilidad separada del físico;
--   * origen ABERTURA (saldo de apertura, D-C8) y ANULACION;
--   * kardex (v_kardex) con saldos acumulados por producto, depósito y propiedad;
--   * permisos y alcance de depósito verificados dentro de la función (usuario_tiene_permiso);
--   * el rol de ejecución pierde la ESCRITURA DIRECTA sobre saldos, costos y movimientos: solo puede usar estas funciones (SECURITY DEFINER).
-- Proyecto Nexit (NEXIT-2026-001). ESTADO: V1 candidata oficial — NO ejecutar en la VM sin autorización expresa del responsable.
-- =====================================================================

-- 1) Columnas de trazabilidad e idempotencia ----------------------------
ALTER TABLE movimientos_inventario
  ADD COLUMN clave_idempotencia text,
  ADD COLUMN huella_solicitud   text,
  ADD COLUMN anula_a_id         uuid,
  ADD CONSTRAINT movimientos_inventario_idem_chk  CHECK (clave_idempotencia IS NULL OR length(btrim(clave_idempotencia)) BETWEEN 8 AND 120),
  ADD CONSTRAINT movimientos_inventario_anula_fk  FOREIGN KEY (empresa_id, anula_a_id) REFERENCES movimientos_inventario (empresa_id, id),
  ADD CONSTRAINT movimientos_inventario_anula_chk CHECK ((tipo_origen = 'ANULACION') = (anula_a_id IS NOT NULL));

CREATE UNIQUE INDEX movimientos_inventario_idem_key  ON movimientos_inventario (empresa_id, clave_idempotencia) WHERE clave_idempotencia IS NOT NULL;
CREATE UNIQUE INDEX movimientos_inventario_anula_key ON movimientos_inventario (empresa_id, anula_a_id)         WHERE anula_a_id IS NOT NULL;

ALTER TABLE movimientos_inventario DROP CONSTRAINT movimientos_inventario_origen_tipo_chk;
ALTER TABLE movimientos_inventario ADD CONSTRAINT movimientos_inventario_origen_tipo_chk CHECK (tipo_origen IN
  ('MANUAL','COMPRA','VENTA','DEVOLUCION','TRANSFERENCIA','AJUSTE','INVENTARIO','ABERTURA','ANULACION'));

-- 2) Línea valorizada: ahora acepta un VALOR TOTAL exacto (lo usa la anulación para devolver exactamente el costo congelado)
DROP FUNCTION inventario_registrar_linea(uuid, uuid, uuid, numeric, numeric, uuid, text, uuid, numeric, text);

CREATE OR REPLACE FUNCTION inventario_registrar_linea(
  p_empresa uuid, p_movimiento uuid, p_producto uuid, p_cantidad numeric,
  p_costo_unitario numeric DEFAULT NULL, p_lote uuid DEFAULT NULL,
  p_propiedad text DEFAULT 'PROPIO', p_propietario uuid DEFAULT NULL,
  p_precio_venta numeric DEFAULT NULL, p_moneda_venta text DEFAULT NULL,
  p_valor_total numeric DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  m          movimientos_inventario%ROWTYPE;
  base_cur   text;
  v_in       boolean;
  v_out      boolean;
  src        uuid;
  dst        uuid;
  c          inventario_costos%ROWTYPE;
  c2         inventario_costos%ROWTYPE;
  v_total    numeric(18,4);
  v_unit     numeric(18,4);
  v_valued   boolean := (p_propiedad = 'PROPIO');
  line_id    uuid;
  bal        stock_saldos%ROWTYPE;
  w          uuid;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'cantidad inválida (%)', p_cantidad USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO m FROM movimientos_inventario WHERE empresa_id = p_empresa AND id = p_movimiento FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'el movimiento % no existe en esta empresa', p_movimiento USING ERRCODE = 'P0001';
  END IF;
  IF m.estado <> 'REGISTRADO' THEN
    RAISE EXCEPTION 'el movimiento % no está REGISTRADO', m.numero_movimiento USING ERRCODE = 'P0001';
  END IF;
  SELECT moneda_base_codigo INTO base_cur FROM empresas WHERE id = p_empresa;
  IF p_precio_venta IS NOT NULL THEN
    IF NOT (m.tipo_movimiento = 'SALIDA' AND m.tipo_origen = 'VENTA') THEN
      RAISE EXCEPTION 'el precio de venta solo se registra en SALIDA con origen VENTA (movimiento %)', m.numero_movimiento USING ERRCODE = 'P0001';
    END IF;
    IF p_precio_venta < 0 OR p_moneda_venta IS NULL THEN
      RAISE EXCEPTION 'precio de venta inválido o sin moneda (movimiento %)', m.numero_movimiento USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_in  := m.tipo_movimiento IN ('ENTRADA','AJUSTE_POSITIVO','TRANSFERENCIA');
  v_out := m.tipo_movimiento IN ('SALIDA','AJUSTE_NEGATIVO','TRANSFERENCIA');
  IF NOT (v_in OR v_out) THEN
    RAISE EXCEPTION 'el tipo % no altera el valor: fuera de inventario_registrar_linea()', m.tipo_movimiento USING ERRCODE = 'P0001';
  END IF;
  src := m.deposito_origen_id;
  dst := m.deposito_destino_id;

  -- Entrada de fora (ENTRADA/AJUSTE_POSITIVO) PRÓPRIA exige custo: não se inventa (DEC-003-02, item 6).
  IF v_valued AND m.tipo_movimiento IN ('ENTRADA','AJUSTE_POSITIVO') AND p_valor_total IS NULL AND (p_costo_unitario IS NULL OR p_costo_unitario < 0) THEN
    RAISE EXCEPTION 'la entrada valorizada exige costo unitario >= 0 (movimiento %)', m.numero_movimiento USING ERRCODE = 'P0001';
  END IF;

  -- Trava as linhas de custo em ordem determinística (evita deadlock em transferência).
  FOREACH w IN ARRAY (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY[src, dst]) x WHERE x IS NOT NULL) LOOP
    INSERT INTO inventario_costos (empresa_id, producto_id, deposito_id) VALUES (p_empresa, p_producto, w)
      ON CONFLICT (empresa_id, producto_id, deposito_id) DO NOTHING;
    PERFORM 1 FROM inventario_costos WHERE empresa_id = p_empresa AND producto_id = p_producto AND deposito_id = w FOR UPDATE;
  END LOOP;

  -- ---- saída (origem) ----
  IF v_out THEN
    SELECT * INTO bal FROM stock_saldos
     WHERE empresa_id = p_empresa AND producto_id = p_producto AND deposito_id = src AND estado_stock = 'DISPONIBLE'
       AND lote_id IS NOT DISTINCT FROM p_lote AND propiedad = p_propiedad AND propietario_id IS NOT DISTINCT FROM p_propietario FOR UPDATE;
    IF NOT FOUND OR bal.cantidad < p_cantidad THEN
      RAISE EXCEPTION 'saldo disponible insuficiente (movimiento %, pedido %)', m.numero_movimiento, p_cantidad USING ERRCODE = 'P0001';
    END IF;
    UPDATE stock_saldos SET cantidad = cantidad - p_cantidad WHERE id = bal.id;
    IF v_valued THEN
      SELECT * INTO c FROM inventario_costos WHERE empresa_id = p_empresa AND producto_id = p_producto AND deposito_id = src;
      IF c.cantidad_valorizada < p_cantidad THEN
        RAISE EXCEPTION 'cantidad valorizada insuficiente (% < %): saldo y costo divergen', c.cantidad_valorizada, p_cantidad USING ERRCODE = 'P0001';
      END IF;
      -- custo da saída: parcela proporcional do VALOR; a última unidade leva o resíduo (valor nunca sobra nem falta).
      IF p_cantidad = c.cantidad_valorizada THEN v_total := c.valor_total;
      ELSE v_total := round(c.valor_total * p_cantidad / c.cantidad_valorizada, 4); END IF;
      v_unit := round(v_total / p_cantidad, 4);
      UPDATE inventario_costos SET
          cantidad_valorizada = c.cantidad_valorizada - p_cantidad,
          valor_total     = c.valor_total - v_total,
          costo_promedio    = CASE WHEN c.cantidad_valorizada - p_cantidad > 0
                                 THEN round((c.valor_total - v_total) / (c.cantidad_valorizada - p_cantidad), 4)
                                 ELSE c.costo_promedio END     -- saldo zero: guarda o último médio só como referência
        WHERE id = c.id;
    END IF;
  END IF;

  -- ---- entrada (destino) ----
  IF v_in THEN
    IF m.tipo_movimiento <> 'TRANSFERENCIA' THEN
      v_total := CASE WHEN v_valued THEN COALESCE(p_valor_total, round(p_cantidad * p_costo_unitario, 4)) END;
      v_unit  := CASE WHEN NOT v_valued THEN NULL WHEN p_valor_total IS NOT NULL THEN round(p_valor_total / p_cantidad, 4) ELSE p_costo_unitario END;
    END IF;                                           -- transferência: mesmo valor que saiu da origem (conservação)
    INSERT INTO stock_saldos (empresa_id, producto_id, deposito_id, estado_stock, lote_id, propiedad, propietario_id, cantidad)
      VALUES (p_empresa, p_producto, dst, 'DISPONIBLE', p_lote, p_propiedad, p_propietario, 0)
      ON CONFLICT (empresa_id, producto_id, deposito_id, estado_stock,
                   COALESCE(lote_id, '00000000-0000-0000-0000-000000000000'::uuid), propiedad,
                   COALESCE(propietario_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
    UPDATE stock_saldos SET cantidad = cantidad + p_cantidad
     WHERE empresa_id = p_empresa AND producto_id = p_producto AND deposito_id = dst AND estado_stock = 'DISPONIBLE'
       AND lote_id IS NOT DISTINCT FROM p_lote AND propiedad = p_propiedad AND propietario_id IS NOT DISTINCT FROM p_propietario;
    IF v_valued THEN
      SELECT * INTO c2 FROM inventario_costos WHERE empresa_id = p_empresa AND producto_id = p_producto AND deposito_id = dst;
      UPDATE inventario_costos SET
          cantidad_valorizada = c2.cantidad_valorizada + p_cantidad,
          valor_total     = c2.valor_total + v_total,
          costo_promedio    = costo_promedio_ponderado(c2.cantidad_valorizada, c2.valor_total, p_cantidad, v_total)
        WHERE id = c2.id;
    END IF;
  END IF;

  INSERT INTO movimiento_lineas (empresa_id, movimiento_id, producto_id, cantidad, lote_id, propiedad, propietario_id,
                                 costo_unitario, costo_total, moneda_costo_codigo,
                                 precio_venta_unitario, precio_venta_total, moneda_venta_codigo)
    VALUES (p_empresa, p_movimiento, p_producto, p_cantidad, p_lote, p_propiedad, p_propietario,
            CASE WHEN v_valued THEN v_unit END, CASE WHEN v_valued THEN v_total END, CASE WHEN v_valued THEN base_cur END,
            p_precio_venta, CASE WHEN p_precio_venta IS NOT NULL THEN round(p_precio_venta * p_cantidad, 4) END,
            CASE WHEN p_precio_venta IS NOT NULL THEN p_moneda_venta END)
    RETURNING id INTO line_id;
  RETURN line_id;
END $$;

-- 3) Línea de cambio de estado (RESERVA, LIBERACION_RESERVA, CUARENTENA, LIBERACION_CUARENTENA): el físico y el valor no cambian.
CREATE OR REPLACE FUNCTION inventario_linea_estado(
  p_empresa uuid, p_movimiento uuid, p_producto uuid, p_cantidad numeric,
  p_lote uuid DEFAULT NULL, p_propiedad text DEFAULT 'PROPIO', p_propietario uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  m   movimientos_inventario%ROWTYPE;
  de  text; a text; bal stock_saldos%ROWTYPE; line_id uuid;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'cantidad inválida (%)', p_cantidad USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO m FROM movimientos_inventario WHERE empresa_id = p_empresa AND id = p_movimiento FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'el movimiento % no existe en esta empresa', p_movimiento USING ERRCODE = 'P0001'; END IF;
  IF m.estado <> 'REGISTRADO' THEN RAISE EXCEPTION 'el movimiento % no está REGISTRADO', m.numero_movimiento USING ERRCODE = 'P0001'; END IF;
  SELECT x.de, x.a INTO de, a FROM (VALUES
      ('RESERVA','DISPONIBLE','RESERVADO'), ('LIBERACION_RESERVA','RESERVADO','DISPONIBLE'),
      ('CUARENTENA','DISPONIBLE','CUARENTENA'), ('LIBERACION_CUARENTENA','CUARENTENA','DISPONIBLE')) AS x(t, de, a)
   WHERE x.t = m.tipo_movimiento;
  IF de IS NULL THEN RAISE EXCEPTION 'el tipo % no es un cambio de estado de stock', m.tipo_movimiento USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO bal FROM stock_saldos
   WHERE empresa_id = p_empresa AND producto_id = p_producto AND deposito_id = m.deposito_origen_id AND estado_stock = de
     AND lote_id IS NOT DISTINCT FROM p_lote AND propiedad = p_propiedad AND propietario_id IS NOT DISTINCT FROM p_propietario FOR UPDATE;
  IF NOT FOUND OR bal.cantidad < p_cantidad THEN
    RAISE EXCEPTION 'saldo % insuficiente para % (movimiento %, pedido %)', de, m.tipo_movimiento, m.numero_movimiento, p_cantidad USING ERRCODE = 'P0001';
  END IF;
  UPDATE stock_saldos SET cantidad = cantidad - p_cantidad WHERE id = bal.id;
  INSERT INTO stock_saldos (empresa_id, producto_id, deposito_id, estado_stock, lote_id, propiedad, propietario_id, cantidad)
    VALUES (p_empresa, p_producto, m.deposito_origen_id, a, p_lote, p_propiedad, p_propietario, 0)
    ON CONFLICT (empresa_id, producto_id, deposito_id, estado_stock,
                 COALESCE(lote_id, '00000000-0000-0000-0000-000000000000'::uuid), propiedad,
                 COALESCE(propietario_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  UPDATE stock_saldos SET cantidad = cantidad + p_cantidad
   WHERE empresa_id = p_empresa AND producto_id = p_producto AND deposito_id = m.deposito_origen_id AND estado_stock = a
     AND lote_id IS NOT DISTINCT FROM p_lote AND propiedad = p_propiedad AND propietario_id IS NOT DISTINCT FROM p_propietario;
  INSERT INTO movimiento_lineas (empresa_id, movimiento_id, producto_id, cantidad, lote_id, propiedad, propietario_id)
    VALUES (p_empresa, p_movimiento, p_producto, p_cantidad, p_lote, p_propiedad, p_propietario) RETURNING id INTO line_id;
  RETURN line_id;
END $$;

-- 4) Despachador interno: valida el producto y elige la regla (valorizada o de estado). No ejecutable por el rol de la aplicación.
CREATE OR REPLACE FUNCTION inventario_agregar_linea(
  p_empresa uuid, p_movimiento uuid, p_producto uuid, p_cantidad numeric,
  p_costo_unitario numeric DEFAULT NULL, p_lote uuid DEFAULT NULL,
  p_propiedad text DEFAULT 'PROPIO', p_propietario uuid DEFAULT NULL,
  p_precio_venta numeric DEFAULT NULL, p_moneda_venta text DEFAULT NULL, p_valor_total numeric DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE m movimientos_inventario%ROWTYPE; pr record;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 OR p_cantidad <> round(p_cantidad, 4) THEN
    RAISE EXCEPTION 'cantidad inválida (%): debe ser > 0 y tener hasta 4 decimales', p_cantidad USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO m FROM movimientos_inventario WHERE empresa_id = p_empresa AND id = p_movimiento;
  IF NOT FOUND THEN RAISE EXCEPTION 'el movimiento % no existe en esta empresa', p_movimiento USING ERRCODE = 'P0001'; END IF;
  SELECT activo, controla_stock, codigo INTO pr FROM productos WHERE empresa_id = p_empresa AND id = p_producto;
  IF NOT FOUND THEN RAISE EXCEPTION 'el producto % no existe en esta empresa', p_producto USING ERRCODE = 'P0001'; END IF;
  -- Un movimiento de anulación puede revertir un producto que luego fue desactivado; el alta nueva no.
  IF NOT pr.activo AND m.tipo_origen <> 'ANULACION' THEN RAISE EXCEPTION 'el producto % está inactivo', pr.codigo USING ERRCODE = 'P0001'; END IF;
  IF NOT pr.controla_stock THEN RAISE EXCEPTION 'el producto % no controla stock', pr.codigo USING ERRCODE = 'P0001'; END IF;
  IF m.tipo_movimiento IN ('RESERVA','LIBERACION_RESERVA','CUARENTENA','LIBERACION_CUARENTENA') THEN
    IF p_costo_unitario IS NOT NULL OR p_precio_venta IS NOT NULL OR p_valor_total IS NOT NULL THEN
      RAISE EXCEPTION 'un cambio de estado de stock no lleva costo ni precio (movimiento %)', m.numero_movimiento USING ERRCODE = 'P0001';
    END IF;
    RETURN inventario_linea_estado(p_empresa, p_movimiento, p_producto, p_cantidad, p_lote, p_propiedad, p_propietario);
  END IF;
  RETURN inventario_registrar_linea(p_empresa, p_movimiento, p_producto, p_cantidad, p_costo_unitario, p_lote,
                                    p_propiedad, p_propietario, p_precio_venta, p_moneda_venta, p_valor_total);
END $$;

-- 5) Permisos: misma regla que lib/auth/permissions.ts (perfil administrador, o permiso explícito en un perfil activo).
--    Los permisos controlados (ACCION_CRITICA, p. ej. MOVIMIENTOS.ANULAR) no pueden estar en perfiles (ESC-13): solo los administradores.
CREATE OR REPLACE FUNCTION usuario_tiene_permiso(p_empresa uuid, p_usuario uuid, p_recurso text, p_accion text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
      FROM usuarios u
      JOIN empresas e ON e.id = u.empresa_id AND e.estado = 'ACTIVA'
      JOIN usuario_perfil up ON up.empresa_id = u.empresa_id AND up.usuario_id = u.id
      JOIN perfiles pf ON pf.empresa_id = up.empresa_id AND pf.id = up.perfil_id AND pf.activo
      LEFT JOIN perfil_permiso pp ON pp.empresa_id = pf.empresa_id AND pp.perfil_id = pf.id
      LEFT JOIN permisos pe ON pe.id = pp.permiso_id
     WHERE u.empresa_id = p_empresa AND u.id = p_usuario AND u.estado = 'ACTIVO'
       AND (u.bloqueado_hasta IS NULL OR u.bloqueado_hasta <= now())
       AND (pf.es_administrador OR (pe.recurso = p_recurso AND pe.accion = p_accion)))
$$;

CREATE OR REPLACE FUNCTION usuario_puede_deposito(p_empresa uuid, p_usuario uuid, p_deposito uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM usuarios u JOIN depositos d ON d.empresa_id = u.empresa_id AND d.id = p_deposito AND d.activo
     WHERE u.empresa_id = p_empresa AND u.id = p_usuario
       AND (u.alcance_depositos = 'TODOS'
            OR EXISTS (SELECT 1 FROM usuario_deposito ud WHERE ud.empresa_id = u.empresa_id AND ud.usuario_id = u.id AND ud.deposito_id = p_deposito)))
$$;

-- 6) Alta transaccional de un movimiento completo.
--    p_lineas: arreglo JSON de {producto_id, cantidad, costo_unitario?, lote_id?, propiedad?, propietario_id?, precio_venta?, moneda_venta?}.
--    Idempotencia: con la misma p_clave_idempotencia y la MISMA solicitud devuelve el movimiento ya registrado (o_repetido = true);
--    con la misma clave y OTRA solicitud rechaza (conflicto). Todo ocurre en una sola transacción: o se registra completo o nada.
CREATE OR REPLACE FUNCTION inventario_registrar_movimiento(
  p_empresa uuid, p_usuario uuid, p_tipo text, p_origen text, p_fecha date,
  p_deposito_origen uuid, p_deposito_destino uuid, p_lineas jsonb,
  p_clave_idempotencia text DEFAULT NULL, p_cliente uuid DEFAULT NULL,
  p_motivo text DEFAULT NULL, p_observacion text DEFAULT NULL, p_documento_referencia text DEFAULT NULL)
RETURNS TABLE (o_movimiento_id uuid, o_numero text, o_repetido boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_hoy   date := (now() AT TIME ZONE 'America/Asuncion')::date;
  v_hora  time := (now() AT TIME ZONE 'America/Asuncion')::time(0);
  v_huella text;
  v_prev  movimientos_inventario%ROWTYPE;
  v_suc   uuid;
  v_new   uuid;
  v_num   text;
  l       jsonb;
  d       uuid;
BEGIN
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'el movimiento necesita al menos una línea' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_array_length(p_lineas) > 500 THEN RAISE EXCEPTION 'máximo 500 líneas por movimiento' USING ERRCODE = 'P0001'; END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('ENTRADA','SALIDA','TRANSFERENCIA','AJUSTE_POSITIVO','AJUSTE_NEGATIVO','RESERVA','LIBERACION_RESERVA','CUARENTENA','LIBERACION_CUARENTENA') THEN
    RAISE EXCEPTION 'tipo de movimiento inválido (%)', p_tipo USING ERRCODE = 'P0001';
  END IF;
  IF p_origen IS NULL OR p_origen NOT IN ('MANUAL','COMPRA','VENTA','DEVOLUCION','TRANSFERENCIA','AJUSTE','INVENTARIO','ABERTURA') THEN
    RAISE EXCEPTION 'origen inválido (%): ANULACION solo se genera con inventario_anular_movimiento', p_origen USING ERRCODE = 'P0001';
  END IF;
  IF p_fecha IS NULL THEN p_fecha := v_hoy; END IF;
  IF p_fecha > v_hoy THEN RAISE EXCEPTION 'la fecha del movimiento no puede ser futura (%)', p_fecha USING ERRCODE = 'P0001'; END IF;
  IF NOT usuario_tiene_permiso(p_empresa, p_usuario, 'MOVIMIENTOS', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso MOVIMIENTOS.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  FOREACH d IN ARRAY ARRAY[p_deposito_origen, p_deposito_destino] LOOP
    IF d IS NOT NULL AND NOT usuario_puede_deposito(p_empresa, p_usuario, d) THEN
      RAISE EXCEPTION 'el usuario no tiene alcance sobre el depósito % (o está inactivo)', d USING ERRCODE = '42501';
    END IF;
  END LOOP;

  -- huella canónica de la solicitud (líneas ordenadas): detecta la reutilización de una clave con datos distintos
  SELECT md5(jsonb_build_object(
           'tipo', p_tipo, 'origen', p_origen, 'fecha', p_fecha, 'dep_o', p_deposito_origen, 'dep_d', p_deposito_destino,
           'cliente', p_cliente, 'ref', p_documento_referencia,
           'lineas', (SELECT jsonb_agg(jsonb_build_object(
                         'p', x->>'producto_id', 'c', round((x->>'cantidad')::numeric, 4), 'k', round((x->>'costo_unitario')::numeric, 4),
                         'l', x->>'lote_id', 'pr', COALESCE(x->>'propiedad', 'PROPIO'), 'po', x->>'propietario_id',
                         'v', round((x->>'precio_venta')::numeric, 4), 'm', x->>'moneda_venta')
                       ORDER BY x->>'producto_id', (x->>'cantidad')::numeric, x->>'lote_id', (x->>'costo_unitario')::numeric)
                      FROM jsonb_array_elements(p_lineas) x))::text)
    INTO v_huella;

  IF p_clave_idempotencia IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('movimientos.idem:' || p_empresa::text || ':' || p_clave_idempotencia, 0));
    SELECT * INTO v_prev FROM movimientos_inventario WHERE empresa_id = p_empresa AND clave_idempotencia = p_clave_idempotencia;
    IF FOUND THEN
      IF v_prev.huella_solicitud IS DISTINCT FROM v_huella THEN
        RAISE EXCEPTION 'la clave de idempotencia ya fue usada con una solicitud distinta (movimiento %)', v_prev.numero_movimiento
          USING ERRCODE = 'P0001', DETAIL = 'NEX:IDEMPOTENCIA_CONFLICTO';
      END IF;
      RETURN QUERY SELECT v_prev.id, v_prev.numero_movimiento, true;
      RETURN;
    END IF;
  END IF;

  SELECT sucursal_id INTO v_suc FROM depositos WHERE empresa_id = p_empresa AND id = COALESCE(p_deposito_origen, p_deposito_destino);
  v_num := nex_siguiente_numero_movimiento(p_empresa);
  INSERT INTO movimientos_inventario (empresa_id, numero_movimiento, tipo_movimiento, tipo_origen, fecha_movimiento, hora_movimiento,
                                      sucursal_id, deposito_origen_id, deposito_destino_id, cliente_id, documento_referencia, motivo, observacion,
                                      creado_por, clave_idempotencia, huella_solicitud)
  VALUES (p_empresa, v_num, p_tipo, p_origen, p_fecha, v_hora, v_suc, p_deposito_origen, p_deposito_destino, p_cliente,
          p_documento_referencia, p_motivo, p_observacion, p_usuario, p_clave_idempotencia, v_huella)
  RETURNING id INTO v_new;

  -- Orden determinista de líneas (evita interbloqueos entre solicitudes concurrentes que tocan los mismos productos).
  FOR l IN SELECT x FROM jsonb_array_elements(p_lineas) x ORDER BY x->>'producto_id', x->>'lote_id', (x->>'cantidad')::numeric LOOP
    PERFORM inventario_agregar_linea(p_empresa, v_new, (l->>'producto_id')::uuid, (l->>'cantidad')::numeric,
              (l->>'costo_unitario')::numeric, (l->>'lote_id')::uuid, COALESCE(l->>'propiedad', 'PROPIO'), (l->>'propietario_id')::uuid,
              (l->>'precio_venta')::numeric, l->>'moneda_venta');
  END LOOP;
  RETURN QUERY SELECT v_new, v_num, false;
END $$;

-- 7) Anulación por movimiento inverso (D-C5 opción A — PROVISIONAL hasta la aprobación del responsable):
--    · SALIDA / AJUSTE_NEGATIVO: el inverso entra por el costo TOTAL congelado de cada línea original (nunca al promedio actual);
--    · ENTRADA / AJUSTE_POSITIVO: el inverso sale al promedio vigente y exige saldo disponible (si ya se consumió, se rechaza);
--    · TRANSFERENCIA: transferencia inversa; reservas/cuarentena: el cambio de estado contrario.
--    El original pasa a ANULADO (única mutación permitida) y el inverso queda ligado por anula_a_id.
CREATE OR REPLACE FUNCTION inventario_anular_movimiento(
  p_empresa uuid, p_usuario uuid, p_movimiento uuid, p_motivo text, p_clave_idempotencia text DEFAULT NULL)
RETURNS TABLE (o_movimiento_id uuid, o_numero text, o_repetido boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_hoy   date := (now() AT TIME ZONE 'America/Asuncion')::date;
  v_hora  time := (now() AT TIME ZONE 'America/Asuncion')::time(0);
  o       movimientos_inventario%ROWTYPE;
  v_prev  movimientos_inventario%ROWTYPE;
  v_tipo  text; v_dor uuid; v_dde uuid; v_new uuid; v_num text; r record; d uuid;
BEGIN
  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 5 THEN RAISE EXCEPTION 'la anulación exige un motivo (mínimo 5 caracteres)' USING ERRCODE = 'P0001'; END IF;
  IF NOT usuario_tiene_permiso(p_empresa, p_usuario, 'MOVIMIENTOS', 'ANULAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso para anular movimientos (acción crítica)' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO o FROM movimientos_inventario WHERE empresa_id = p_empresa AND id = p_movimiento FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'el movimiento % no existe en esta empresa', p_movimiento USING ERRCODE = 'P0001'; END IF;
  IF o.anula_a_id IS NOT NULL THEN RAISE EXCEPTION 'un movimiento de anulación no se puede anular (%)', o.numero_movimiento USING ERRCODE = 'P0001'; END IF;
  IF o.estado = 'ANULADO' THEN
    SELECT * INTO v_prev FROM movimientos_inventario WHERE empresa_id = p_empresa AND anula_a_id = o.id;
    IF p_clave_idempotencia IS NOT NULL AND v_prev.clave_idempotencia = p_clave_idempotencia THEN
      RETURN QUERY SELECT v_prev.id, v_prev.numero_movimiento, true; RETURN;
    END IF;
    RAISE EXCEPTION 'el movimiento % ya fue anulado por %', o.numero_movimiento, v_prev.numero_movimiento USING ERRCODE = 'P0001', DETAIL = 'NEX:YA_ANULADO';
  END IF;

  SELECT t.tipo, t.dor, t.dde INTO v_tipo, v_dor, v_dde FROM (VALUES
      ('ENTRADA','SALIDA', o.deposito_destino_id, NULL::uuid),
      ('AJUSTE_POSITIVO','AJUSTE_NEGATIVO', o.deposito_destino_id, NULL::uuid),
      ('SALIDA','ENTRADA', NULL::uuid, o.deposito_origen_id),
      ('AJUSTE_NEGATIVO','AJUSTE_POSITIVO', NULL::uuid, o.deposito_origen_id),
      ('TRANSFERENCIA','TRANSFERENCIA', o.deposito_destino_id, o.deposito_origen_id),
      ('RESERVA','LIBERACION_RESERVA', o.deposito_origen_id, NULL::uuid),
      ('LIBERACION_RESERVA','RESERVA', o.deposito_origen_id, NULL::uuid),
      ('CUARENTENA','LIBERACION_CUARENTENA', o.deposito_origen_id, NULL::uuid),
      ('LIBERACION_CUARENTENA','CUARENTENA', o.deposito_origen_id, NULL::uuid)) AS t(orig, tipo, dor, dde)
   WHERE t.orig = o.tipo_movimiento;
  FOREACH d IN ARRAY ARRAY[v_dor, v_dde] LOOP
    IF d IS NOT NULL AND NOT usuario_puede_deposito(p_empresa, p_usuario, d) THEN
      RAISE EXCEPTION 'el usuario no tiene alcance sobre el depósito % (o está inactivo)', d USING ERRCODE = '42501';
    END IF;
  END LOOP;

  IF p_clave_idempotencia IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('movimientos.idem:' || p_empresa::text || ':' || p_clave_idempotencia, 0));
    IF EXISTS (SELECT 1 FROM movimientos_inventario WHERE empresa_id = p_empresa AND clave_idempotencia = p_clave_idempotencia) THEN
      RAISE EXCEPTION 'la clave de idempotencia ya fue usada en otra operación' USING ERRCODE = 'P0001', DETAIL = 'NEX:IDEMPOTENCIA_CONFLICTO';
    END IF;
  END IF;

  v_num := nex_siguiente_numero_movimiento(p_empresa);
  INSERT INTO movimientos_inventario (empresa_id, numero_movimiento, tipo_movimiento, tipo_origen, fecha_movimiento, hora_movimiento,
                                      sucursal_id, deposito_origen_id, deposito_destino_id, documento_referencia, motivo, observacion,
                                      creado_por, clave_idempotencia, huella_solicitud, anula_a_id)
  VALUES (p_empresa, v_num, v_tipo, 'ANULACION', v_hoy, v_hora, o.sucursal_id, v_dor, v_dde,
          o.numero_movimiento, p_motivo, 'Anulación de ' || o.numero_movimiento, p_usuario,
          p_clave_idempotencia, md5('anula:' || o.id::text), o.id)
  RETURNING id INTO v_new;

  FOR r IN SELECT * FROM movimiento_lineas WHERE empresa_id = p_empresa AND movimiento_id = o.id ORDER BY producto_id, id LOOP
    PERFORM inventario_agregar_linea(p_empresa, v_new, r.producto_id, r.cantidad, NULL, r.lote_id, r.propiedad, r.propietario_id, NULL, NULL,
              CASE WHEN o.tipo_movimiento IN ('SALIDA','AJUSTE_NEGATIVO') THEN r.costo_total END);
  END LOOP;
  UPDATE movimientos_inventario SET estado = 'ANULADO' WHERE empresa_id = p_empresa AND id = o.id;
  RETURN QUERY SELECT v_new, v_num, false;
END $$;

-- 8) Kardex: un renglón por efecto en un depósito, con saldos acumulados por producto × depósito × propiedad.
--    Orden = orden de REGISTRO (número de movimiento), el mismo en que se calculó el costo; fecha_movimiento es solo informativa.
CREATE VIEW v_kardex WITH (security_invoker = true) AS
WITH efectos AS (
  SELECT m.empresa_id, l.producto_id, m.deposito_destino_id AS deposito_id, l.propiedad, m.id AS movimiento_id, l.id AS linea_id, l.creado_at AS linea_at,
         l.cantidad AS d_disponible, 0::numeric AS d_reservado, 0::numeric AS d_cuarentena
    FROM movimientos_inventario m JOIN movimiento_lineas l ON l.empresa_id = m.empresa_id AND l.movimiento_id = m.id
   WHERE m.tipo_movimiento IN ('ENTRADA','AJUSTE_POSITIVO','TRANSFERENCIA')
  UNION ALL
  SELECT m.empresa_id, l.producto_id, m.deposito_origen_id, l.propiedad, m.id, l.id, l.creado_at, -l.cantidad, 0, 0
    FROM movimientos_inventario m JOIN movimiento_lineas l ON l.empresa_id = m.empresa_id AND l.movimiento_id = m.id
   WHERE m.tipo_movimiento IN ('SALIDA','AJUSTE_NEGATIVO','TRANSFERENCIA')
  UNION ALL
  SELECT m.empresa_id, l.producto_id, m.deposito_origen_id, l.propiedad, m.id, l.id, l.creado_at,
         CASE m.tipo_movimiento WHEN 'RESERVA' THEN -l.cantidad WHEN 'CUARENTENA' THEN -l.cantidad ELSE l.cantidad END,
         CASE m.tipo_movimiento WHEN 'RESERVA' THEN l.cantidad WHEN 'LIBERACION_RESERVA' THEN -l.cantidad ELSE 0 END,
         CASE m.tipo_movimiento WHEN 'CUARENTENA' THEN l.cantidad WHEN 'LIBERACION_CUARENTENA' THEN -l.cantidad ELSE 0 END
    FROM movimientos_inventario m JOIN movimiento_lineas l ON l.empresa_id = m.empresa_id AND l.movimiento_id = m.id
   WHERE m.tipo_movimiento IN ('RESERVA','LIBERACION_RESERVA','CUARENTENA','LIBERACION_CUARENTENA')
)
SELECT e.empresa_id, e.producto_id, p.codigo AS producto_codigo, p.descripcion AS producto_descripcion,
       e.deposito_id, d.codigo AS deposito_codigo, d.nombre AS deposito_nombre, e.propiedad,
       m.id AS movimiento_id, m.numero_movimiento, m.fecha_movimiento, m.hora_movimiento, m.tipo_movimiento, m.tipo_origen, m.estado,
       m.documento_referencia, m.motivo, u.usuario AS usuario,
       e.d_disponible, e.d_reservado, e.d_cuarentena, (e.d_disponible + e.d_reservado + e.d_cuarentena) AS d_fisico,
       sum(e.d_disponible) OVER w AS saldo_disponible, sum(e.d_reservado) OVER w AS saldo_reservado, sum(e.d_cuarentena) OVER w AS saldo_cuarentena,
       sum(e.d_disponible + e.d_reservado + e.d_cuarentena) OVER w AS saldo_fisico,
       l.costo_unitario, l.costo_total, l.moneda_costo_codigo
  FROM efectos e
  JOIN movimientos_inventario m ON m.empresa_id = e.empresa_id AND m.id = e.movimiento_id
  JOIN movimiento_lineas l ON l.empresa_id = e.empresa_id AND l.id = e.linea_id
  JOIN productos p ON p.empresa_id = e.empresa_id AND p.id = e.producto_id
  JOIN depositos d ON d.empresa_id = e.empresa_id AND d.id = e.deposito_id
  LEFT JOIN usuarios u ON u.empresa_id = m.empresa_id AND u.id = m.creado_por
WINDOW w AS (PARTITION BY e.empresa_id, e.producto_id, e.deposito_id, e.propiedad
             ORDER BY m.numero_movimiento, e.linea_at, e.linea_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW);


-- 9) Rol de ejecución — política vigente a partir de NEX-014 (reemplaza la de NEX-013; el runner la vuelve a aplicar siempre):
--    lectura de todo salvo schema_migrations; escritura directa SOLO en cadastros y sesión; saldos, costos y movimientos SOLO vía funciones.
CREATE OR REPLACE FUNCTION nex_aplicar_grants_runtime() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE t text; f regprocedure;
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO nexit_runtime', current_database());
  GRANT USAGE ON SCHEMA public TO nexit_runtime;
  REVOKE CREATE ON SCHEMA public FROM nexit_runtime;
  REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM nexit_runtime;
  REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM nexit_runtime;

  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v') AND c.relname <> 'schema_migrations' LOOP
    EXECUTE format('GRANT SELECT ON %I TO nexit_runtime', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY[
      'clientes','cliente_contactos','direcciones_cliente','cliente_documentos',
      'proveedores','proveedor_contactos','proveedor_direcciones','proveedor_cuentas_bancarias','proveedor_retenciones','proveedor_documentos',
      'productos','producto_codigos','producto_unidades','producto_proveedores','producto_deposito_configuracion',
      'producto_alternativos','producto_componentes','producto_documentos',
      'listas_precio','lista_precio_items','lista_precio_escalones','lista_precio_reglas',
      'stock_lotes'] LOOP
    EXECUTE format('GRANT INSERT, UPDATE, DELETE ON %I TO nexit_runtime', t);
  END LOOP;
  -- stock_saldos, inventario_costos, movimientos_inventario y movimiento_lineas: SIN escritura directa (solo por inventario_registrar_movimiento / inventario_anular_movimiento).
  GRANT INSERT, UPDATE ON sesiones_usuario  TO nexit_runtime;
  GRANT INSERT         ON eventos_seguridad TO nexit_runtime;
  GRANT UPDATE (intentos_fallidos, bloqueado_hasta, ultimo_acceso_at) ON usuarios TO nexit_runtime;

  -- Funciones propias (no de extensiones): nadie las ejecuta por defecto; se concede solo lo necesario.
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
              AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM nexit_runtime', f);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.prokind = 'f'
              AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
              AND (p.prorettype = 'trigger'::regtype OR p.proname IN (
                   'inventario_registrar_movimiento','inventario_anular_movimiento','usuario_tiene_permiso','usuario_puede_deposito',
                   'nex_reinicio_demo_activo','costo_promedio_ponderado')) LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO nexit_runtime', f);
  END LOOP;
END $$;

SELECT nex_instalar_triggers_actualizacion();
SELECT nex_aplicar_grants_runtime();
