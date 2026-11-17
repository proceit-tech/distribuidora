-- =====================================================================
-- NEX-081 — Facturación PRO-354-R02: política por EMPRESA «Bloquear facturación por stock insuficiente» y BAJAS PENDIENTES de stock de la FE (sin saldo físico negativo).
-- Orden: documentacao/ordens/ORD-CLAUDE-NEXIT-PRO-354-R02-POLITICA-STOCK-CONFIGURABLE-2026-11-17.md · Gate: documentacao/analises/PRO-354-R01-GATE-impacto-costos-stock-insuficiente-2026-11-17.md
-- Qué agrega (incremental: NO edita ningún archivo de migración anterior; NEX-080 pertenece a PRO-342 y no se toca):
--  1) empresas.bloquear_stock_insuficiente boolean NOT NULL DEFAULT TRUE. Al aplicarla TODAS las empresas quedan en TRUE = comportamiento actual exacto (NEX-067: sin stock no se factura).
--     Se cambia SOLO con fe_politica_stock_actualizar (FACTURACION_ELECTRONICA.CONFIGURAR, bloqueo de la fila de la empresa, evento auditado en eventos_seguridad). La aplicación no tiene UPDATE sobre empresas.
--  2) documento_electronico_stock_pendientes: UNA fila por (FE, producto) con faltante: facturado, ya descontado al emitir, pendiente, depósito elegido. PK propia (uuid); no toca la PK histórica
--     (empresa, documento, depósito) de documento_electronico_stock_salidas. Inmutable salvo la única transición PENDIENTE → CONFIRMADA (actor, fecha y movimiento complementario). Sin acceso directo de la aplicación.
--  3) fe_stock_pendientes_preparacion: tabla INTERNA de un solo uso por transacción (txid, empresa, clave): la escribe y la borra fe_documento_crear_fe_stock_pendiente; la lee la baja. Sin acceso de la aplicación,
--     así que el faltante NO se puede inyectar desde fuera de la función que revalida la política.
--  4) fe_stock_baja_documento se REDEFINE (CREATE OR REPLACE, misma firma) con el cuerpo de NEX-067 y SOLO tres cambios: (a) lee la preparación de su propia transacción; (b) concilia
--     salidas + pendientes = facturado; (c) una FE con pendientes cuenta como baja ya registrada. Sin preparación el resultado es IDÉNTICO a NEX-067. La reversión restaura el cuerpo de NEX-067.
--  5) fe_documento_crear_fe_stock_pendiente(14 parámetros de fe_documento_crear_fe_receptor + p_pendientes, p_bloquear_revisado): envuelve SIN COPIARLA la emisión vigente (NEX-076) y, en la MISMA
--     transacción, revalida bajo bloqueo la política (FALSE), los pendientes (producto controlado sin lotes, depósito propio/activo/de la sucursal/en alcance), que el disponible quedó en CERO
--     tras la salida inmediata (el faltante es real) y registra los pendientes. Reintento de la misma clave: no escribe; exige los mismos pendientes.
--  6) fe_stock_politica_contexto (lectura): política vigente, depósitos elegibles para el faltante y productos con control de lotes evidenciado (stock_lotes).
--  7) fe_stock_pendientes_listar (lectura, STOCK.VER + alcance de depósito) y fe_stock_pendiente_confirmar (MOVIMIENTOS.CREAR + alcance): SALIDA/VENTA complementaria por el motor ordinario
--     (inventario_registrar_movimiento, costo promedio vigente) con clave 'FE-STOCK-PEND:<id>', SOLO con saldo real suficiente y FE ENVIADA no rechazada/cancelada/inutilizada/no reconocida.
--     El movimiento complementario queda protegido contra la anulación manual (igual que la salida de NEX-067).
-- NO hace (gate PRO-354 D1–D3 / RF07): saldo físico negativo, cambios a stock_saldos_cant_chk (>= 0) ni a inventario_costos, deuda valorizada, regularización, cambio del método de costo,
-- reposición que confirme sola, cambio del momento de la baja (PRO-310), reproceso de FE históricas, NCE, CDC, KuDE, gateway, numeración ni Documentos electrónicos.
-- DEPENDENCIAS: NEX-014 (motor), NEX-067 (baja FE), NEX-076 (emisión vigente). No depende funcionalmente de NEX-077..080; el runner aplica las pendientes EN ORDEN, por lo que NEX-080 (PRO-342) se aplicaría
-- antes: ver docs/PROCEDIMIENTO-NEX-081.md (gate operacional).
-- ESTADO: versionada y NO aplicada. Ningún agente de IA la aplica. Pre-verificación: scripts/preflight-NEX-081.sql · Verificación: scripts/verificar-NEX-081.sql · Reversión: scripts/reversion-NEX-081.sql.
-- =====================================================================
DO $$
BEGIN
  IF to_regprocedure('public.inventario_registrar_movimiento(uuid,uuid,text,text,date,uuid,uuid,jsonb,text,uuid,text,text,text)') IS NULL
     OR to_regprocedure('public.usuario_puede_deposito(uuid,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'NEX-081 requiere el motor de movimientos de inventario (NEX-014).';
  END IF;
  IF to_regprocedure('public.fe_stock_baja_documento(uuid,uuid,uuid,jsonb)') IS NULL OR to_regclass('public.documento_electronico_stock_salidas') IS NULL THEN
    RAISE EXCEPTION 'NEX-081 requiere la baja de stock de la FE (NEX-067).';
  END IF;
  -- La baja instalada debe ser la de NEX-067 (no otra redefinición): se reconoce por su conciliación y por no leer todavía la preparación de NEX-081.
  IF position('NEX:STOCK_REPARTO_INVALIDO' IN pg_get_functiondef('public.fe_stock_baja_documento(uuid,uuid,uuid,jsonb)'::regprocedure)) = 0
     OR position('fe_stock_pendientes_preparacion' IN pg_get_functiondef('public.fe_stock_baja_documento(uuid,uuid,uuid,jsonb)'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'fe_stock_baja_documento no es la versión de NEX-067: no se redefine por suposición.';
  END IF;
  IF to_regprocedure('public.fe_documento_crear_fe_receptor(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb,jsonb,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'NEX-081 requiere la emisión vigente de FE (NEX-076).';
  END IF;
  IF to_regprocedure('public.nex_aplicar_grants_runtime_base()') IS NULL
     OR position('nex\_aplicar\_grants\_%' IN pg_get_functiondef('public.nex_aplicar_grants_runtime()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'NEX-081 requiere el envoltorio de grants que descubre los ayudantes nex_aplicar_grants_* (NEX-037/NEX-052).';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'empresas' AND column_name = 'bloquear_stock_insuficiente')
     OR to_regclass('public.documento_electronico_stock_pendientes') IS NOT NULL OR to_regclass('public.fe_stock_pendientes_preparacion') IS NOT NULL THEN
    RAISE EXCEPTION 'NEX-081 parece aplicada (columna o tablas ya existen): no se reaplica por suposición.';
  END IF;
END $$;

-- 1) Política por empresa (tenant de NEXIT; no es del comprador). DEFAULT TRUE: ninguna empresa cambia al aplicar.
ALTER TABLE public.empresas ADD COLUMN bloquear_stock_insuficiente boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.empresas.bloquear_stock_insuficiente IS 'NEX-081 / PRO-354-R02: TRUE (por defecto) = no se emite FE con stock insuficiente (NEX-067). FALSE = se emite descontando solo el disponible y el faltante queda como baja pendiente (sin saldo negativo). Solo cambia con fe_politica_stock_actualizar (auditado).';

-- 2) Bajas pendientes (una por FE y producto).
CREATE TABLE public.documento_electronico_stock_pendientes (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          uuid          NOT NULL REFERENCES public.empresas (id),
  documento_id        uuid          NOT NULL,
  producto_id         uuid          NOT NULL,
  deposito_id         uuid          NOT NULL,
  cantidad_facturada  numeric(18,4) NOT NULL,
  cantidad_descontada numeric(18,4) NOT NULL,
  cantidad_pendiente  numeric(18,4) NOT NULL,
  estado              text          NOT NULL DEFAULT 'PENDIENTE',
  creado_por          uuid          NOT NULL,
  creado_at           timestamptz   NOT NULL DEFAULT now(),
  confirmado_por      uuid,
  confirmado_at       timestamptz,
  movimiento_id       uuid,
  CONSTRAINT fe_stock_pend_empresa_id_uk UNIQUE (empresa_id, id),
  CONSTRAINT fe_stock_pend_documento_producto_uk UNIQUE (empresa_id, documento_id, producto_id),
  CONSTRAINT fe_stock_pend_movimiento_uk UNIQUE (empresa_id, movimiento_id),
  CONSTRAINT fe_stock_pend_cantidades_chk CHECK (cantidad_pendiente > 0 AND cantidad_descontada >= 0 AND cantidad_facturada > 0 AND cantidad_descontada + cantidad_pendiente = cantidad_facturada),
  CONSTRAINT fe_stock_pend_estado_chk CHECK (
    (estado = 'PENDIENTE' AND confirmado_por IS NULL AND confirmado_at IS NULL AND movimiento_id IS NULL)
    OR (estado = 'CONFIRMADA' AND confirmado_por IS NOT NULL AND confirmado_at IS NOT NULL AND movimiento_id IS NOT NULL)),
  CONSTRAINT fe_stock_pend_documento_fk FOREIGN KEY (empresa_id, documento_id) REFERENCES public.documentos_electronicos (empresa_id, id),
  CONSTRAINT fe_stock_pend_producto_fk FOREIGN KEY (empresa_id, producto_id) REFERENCES public.productos (empresa_id, id),
  CONSTRAINT fe_stock_pend_deposito_fk FOREIGN KEY (empresa_id, deposito_id) REFERENCES public.depositos (empresa_id, id),
  CONSTRAINT fe_stock_pend_movimiento_fk FOREIGN KEY (empresa_id, movimiento_id) REFERENCES public.movimientos_inventario (empresa_id, id)
);
CREATE INDEX fe_stock_pend_abiertas_idx ON public.documento_electronico_stock_pendientes (empresa_id, producto_id, deposito_id) WHERE estado = 'PENDIENTE';
COMMENT ON TABLE public.documento_electronico_stock_pendientes IS 'NEX-081 / PRO-354-R02: faltante de stock de una FE emitida con la política FALSE (facturado = descontado al emitir + pendiente). No es saldo negativo ni deuda valorizada. Inmutable salvo PENDIENTE → CONFIRMADA.';

CREATE FUNCTION public.fe_stock_pendientes_inmutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF public.nex_reinicio_demo_activo(OLD.empresa_id) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.estado = 'PENDIENTE' AND NEW.estado = 'CONFIRMADA'
     AND NEW.id = OLD.id AND NEW.empresa_id = OLD.empresa_id AND NEW.documento_id = OLD.documento_id AND NEW.producto_id = OLD.producto_id AND NEW.deposito_id = OLD.deposito_id
     AND NEW.cantidad_facturada = OLD.cantidad_facturada AND NEW.cantidad_descontada = OLD.cantidad_descontada AND NEW.cantidad_pendiente = OLD.cantidad_pendiente
     AND NEW.creado_por = OLD.creado_por AND NEW.creado_at = OLD.creado_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'documento_electronico_stock_pendientes es inmutable (solo se confirma un pendiente, una vez)' USING ERRCODE = 'P0001';
END $$;

CREATE TRIGGER fe_stock_pendientes_inmutable_trg BEFORE UPDATE OR DELETE ON public.documento_electronico_stock_pendientes
  FOR EACH ROW EXECUTE FUNCTION public.fe_stock_pendientes_inmutable();

-- El movimiento complementario (confirmación) tampoco se anula manualmente: misma regla que la salida de la FE (NEX-067, fe_stock_movimiento_protegido).
CREATE FUNCTION public.fe_stock_pendiente_movimiento_protegido() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.estado = 'ANULADO' AND OLD.estado IS DISTINCT FROM 'ANULADO'
     AND EXISTS (SELECT 1 FROM public.documento_electronico_stock_pendientes p WHERE p.empresa_id = OLD.empresa_id AND p.movimiento_id = OLD.id) THEN
    RAISE EXCEPTION 'el movimiento % confirma una baja pendiente de una factura electrónica y no se puede anular manualmente', OLD.numero_movimiento
      USING ERRCODE = 'P0001', DETAIL = 'NEX:MOVIMIENTO_VINCULADO_FE';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER fe_stock_pendiente_movimiento_protegido_trg BEFORE UPDATE OF estado ON public.movimientos_inventario
  FOR EACH ROW EXECUTE FUNCTION public.fe_stock_pendiente_movimiento_protegido();

-- 3) Preparación interna (una fila por transacción de emisión con faltante; se borra antes de terminar la función que la crea).
CREATE TABLE public.fe_stock_pendientes_preparacion (
  txid        bigint NOT NULL,
  empresa_id  uuid   NOT NULL,
  clave       text   NOT NULL,
  pendientes  jsonb  NOT NULL,
  PRIMARY KEY (txid, empresa_id, clave)
);
COMMENT ON TABLE public.fe_stock_pendientes_preparacion IS 'NEX-081: uso interno de fe_documento_crear_fe_stock_pendiente → fe_stock_baja_documento dentro de UNA transacción. Sin acceso para la aplicación; siempre vacía fuera de una emisión.';

-- 4) Baja de stock de UNA FE: cuerpo de NEX-067 con la conciliación salidas + pendientes (ver encabezado). Sin preparación: idéntica a NEX-067.
CREATE OR REPLACE FUNCTION public.fe_stock_baja_documento(p_empresa uuid, p_usuario uuid, p_documento uuid, p_asignaciones jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_doc public.documentos_electronicos%ROWTYPE;
  v_payload jsonb;
  v_hoy date := (now() AT TIME ZONE 'America/Asuncion')::date;
  v_hora time := (now() AT TIME ZONE 'America/Asuncion')::time(0);
  v_asig jsonb := COALESCE(p_asignaciones, '[]'::jsonb);
  v_creados integer := 0;
  v_dep uuid;
  v_mov uuid;
  v_num text;
  v_clave text;
  v_referencia text;
  v_huella text;
  v_pend jsonb;
  a record;
  b record;
  e record;
  det record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('fe.stock:' || p_empresa::text || ':' || p_documento::text, 0));

  SELECT * INTO v_doc FROM public.documentos_electronicos WHERE empresa_id = p_empresa AND id = p_documento FOR UPDATE;
  IF NOT FOUND OR v_doc.tipo <> 'FE' THEN
    RAISE EXCEPTION 'la factura electrónica no existe en esta empresa' USING ERRCODE = 'P0001', DETAIL = 'NEX:DOCUMENTO_NO_ENCONTRADO';
  END IF;
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CREAR') OR NOT public.sucursal_en_alcance(p_empresa, p_usuario, v_doc.sucursal_id) THEN
    RAISE EXCEPTION 'el usuario no puede dar de baja stock de esta factura' USING ERRCODE = '42501';
  END IF;

  -- Repetición: si la FE ya tiene su baja, no se hace nada (idempotente).
  -- NEX-081: una FE con faltante pendiente también cuenta como «baja ya registrada» (puede no tener ninguna salida si el disponible era cero).
  IF EXISTS (SELECT 1 FROM public.documento_electronico_stock_salidas WHERE empresa_id = p_empresa AND documento_id = p_documento)
     OR EXISTS (SELECT 1 FROM public.documento_electronico_stock_pendientes WHERE empresa_id = p_empresa AND documento_id = p_documento) THEN
    RETURN 0;
  END IF;

  IF jsonb_typeof(v_asig) <> 'array' THEN
    RAISE EXCEPTION 'el reparto de stock no es válido' USING ERRCODE = 'P0001', DETAIL = 'NEX:STOCK_REPARTO_INVALIDO';
  END IF;

  -- NEX-081 (PRO-354-R02): faltante PENDIENTE preparado en ESTA MISMA transacción por fe_documento_crear_fe_stock_pendiente (única que escribe la tabla de preparación; la aplicación no tiene acceso).
  -- Sin preparación (camino de política TRUE y cualquier otro llamador) v_pend es vacío y la conciliación es EXACTAMENTE la de NEX-067.
  SELECT pp.pendientes INTO v_pend FROM public.fe_stock_pendientes_preparacion pp
   WHERE pp.txid = txid_current() AND pp.empresa_id = p_empresa AND pp.clave = v_doc.clave_idempotencia;
  v_pend := COALESCE(v_pend, '[]'::jsonb);
  IF jsonb_typeof(v_pend) <> 'array' THEN
    RAISE EXCEPTION 'el faltante pendiente no es válido' USING ERRCODE = 'P0001', DETAIL = 'NEX:STOCK_REPARTO_INVALIDO';
  END IF;

  SELECT s.payload INTO v_payload FROM public.documento_electronico_solicitudes s WHERE s.empresa_id = p_empresa AND s.documento_id = p_documento ORDER BY s.version DESC LIMIT 1;

  -- PRO-203 / F-002: TODOS los detalles fiscales deben ser verificables. Detalles ausente, vacío o que no sea un arreglo, un detalle sin código o sin cantidad numérica positiva, o con un código que no
  -- corresponde a un producto de la empresa, se RECHAZAN (la FE no se crea). Los servicios legítimos (controla_stock = false) siguen admitidos y no generan movimiento; una mercadería con control de
  -- stock nunca puede quedar fuera de la conciliación de abajo.
  IF v_payload IS NULL OR jsonb_typeof(v_payload->'Detalles') IS DISTINCT FROM 'array' OR jsonb_array_length(v_payload->'Detalles') = 0 THEN
    RAISE EXCEPTION 'la factura no tiene detalles fiscales válidos para conciliar el stock' USING ERRCODE = 'P0001', DETAIL = 'NEX:STOCK_PAYLOAD_INVALIDO';
  END IF;
  FOR det IN
    SELECT x.d AS d, p.id AS producto_id
      FROM jsonb_array_elements(v_payload->'Detalles') AS x(d)
      LEFT JOIN public.productos p ON p.empresa_id = p_empresa AND p.codigo = x.d->>'dCodInt'
  LOOP
    IF jsonb_typeof(det.d) IS DISTINCT FROM 'object' OR btrim(COALESCE(det.d->>'dCodInt', '')) = '' OR det.producto_id IS NULL THEN
      RAISE EXCEPTION 'un detalle fiscal no corresponde a un producto conocido de la empresa' USING ERRCODE = 'P0001', DETAIL = 'NEX:STOCK_PAYLOAD_INVALIDO';
    END IF;
    IF jsonb_typeof(det.d->'dCantProSer') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'un detalle fiscal no tiene cantidad numérica' USING ERRCODE = 'P0001', DETAIL = 'NEX:STOCK_PAYLOAD_INVALIDO';
    END IF;
    IF (det.d->>'dCantProSer')::numeric <= 0 THEN
      RAISE EXCEPTION 'un detalle fiscal tiene cantidad no positiva' USING ERRCODE = 'P0001', DETAIL = 'NEX:STOCK_PAYLOAD_INVALIDO';
    END IF;
  END LOOP;

  -- Forma de cada asignación (cantidad > 0 con hasta 4 decimales; producto y depósito de la empresa; depósito activo, propio, de la sucursal de la FE y en el alcance del usuario).
  FOR a IN SELECT x FROM jsonb_array_elements(v_asig) x LOOP
    IF (a.x->>'producto_id') IS NULL OR (a.x->>'deposito_id') IS NULL OR (a.x->>'cantidad') IS NULL
       OR (a.x->>'cantidad')::numeric <= 0 OR (a.x->>'cantidad')::numeric <> round((a.x->>'cantidad')::numeric, 4) THEN
      RAISE EXCEPTION 'el reparto de stock contiene una asignación inválida' USING ERRCODE = 'P0001', DETAIL = 'NEX:STOCK_REPARTO_INVALIDO';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.depositos d WHERE d.empresa_id = p_empresa AND d.id = (a.x->>'deposito_id')::uuid AND d.activo AND NOT d.es_de_terceros AND d.sucursal_id = v_doc.sucursal_id)
       OR NOT public.usuario_puede_deposito(p_empresa, p_usuario, (a.x->>'deposito_id')::uuid) THEN
      RAISE EXCEPTION 'un depósito del reparto no es válido para esta factura (inactivo, de otra sucursal o fuera de su alcance)' USING ERRCODE = '42501', DETAIL = 'NEX:STOCK_DEPOSITO_NO_AUTORIZADO';
    END IF;
  END LOOP;

  -- Conciliación con el payload PERSISTIDO: por cada producto que controla stock, la suma repartida = la cantidad facturada (y nada para otros productos).
  FOR e IN
    SELECT COALESCE(es.producto_id, da.producto_id) AS producto_id, es.cantidad AS esperado, da.cantidad AS repartido
      FROM (SELECT p.id AS producto_id, sum((d->>'dCantProSer')::numeric) AS cantidad
              FROM jsonb_array_elements(COALESCE(v_payload->'Detalles', '[]'::jsonb)) d
              JOIN public.productos p ON p.empresa_id = p_empresa AND p.codigo = d->>'dCodInt' AND p.controla_stock
             GROUP BY p.id) es
      -- NEX-081: salidas inmediatas + faltante pendiente = cantidad facturada (por producto que controla stock). Sin pendientes, idéntico a NEX-067.
      FULL JOIN (SELECT (z.x->>'producto_id')::uuid AS producto_id, sum((z.x->>'cantidad')::numeric) AS cantidad
                   FROM (SELECT ea FROM jsonb_array_elements(v_asig) ea UNION ALL SELECT ep FROM jsonb_array_elements(v_pend) ep) z(x) GROUP BY 1) da ON da.producto_id = es.producto_id
  LOOP
    IF e.esperado IS DISTINCT FROM e.repartido THEN
      RAISE EXCEPTION 'el reparto de stock no coincide con la cantidad facturada' USING ERRCODE = 'P0001', DETAIL = 'NEX:STOCK_REPARTO_INVALIDO';
    END IF;
  END LOOP;

  IF jsonb_array_length(v_asig) = 0 THEN
    RETURN 0;
  END IF;

  v_referencia := 'FE ' || v_doc.establecimiento || '-' || v_doc.punto_expedicion || '-' || v_doc.numero;

  -- Un movimiento SALIDA/VENTA por depósito (orden determinista por depósito → sin interbloqueos entre ventas simultáneas).
  FOR v_dep IN SELECT DISTINCT (x->>'deposito_id')::uuid AS d FROM jsonb_array_elements(v_asig) x ORDER BY 1 LOOP
    v_clave := 'FE-STOCK:' || p_documento::text || ':' || v_dep::text;
    SELECT md5(jsonb_agg(jsonb_build_object('p', x->>'producto_id', 'l', x->>'lote_id', 'c', round((x->>'cantidad')::numeric, 4)) ORDER BY x->>'producto_id', x->>'lote_id')::text)
      INTO v_huella FROM jsonb_array_elements(v_asig) x WHERE (x->>'deposito_id')::uuid = v_dep;

    v_num := public.nex_siguiente_numero_movimiento(p_empresa);
    INSERT INTO public.movimientos_inventario (empresa_id, numero_movimiento, tipo_movimiento, tipo_origen, fecha_movimiento, hora_movimiento, sucursal_id, deposito_origen_id,
                                               cliente_id, documento_referencia, motivo, observacion, creado_por, clave_idempotencia, huella_solicitud)
    VALUES (p_empresa, v_num, 'SALIDA', 'VENTA', v_hoy, v_hora, v_doc.sucursal_id, v_dep, v_doc.cliente_id, v_referencia, 'Venta por factura electrónica',
            'Baja automática al emitir ' || v_referencia, p_usuario, v_clave, v_huella)
    RETURNING id INTO v_mov;

    -- Líneas en orden determinista; el saldo se bloquea (FOR UPDATE) y se compara ANTES de llamar al motor de líneas, para informar con un error propio.
    FOR b IN SELECT (x->>'producto_id')::uuid AS producto_id, NULLIF(x->>'lote_id', '')::uuid AS lote_id, sum((x->>'cantidad')::numeric) AS cantidad
               FROM jsonb_array_elements(v_asig) x WHERE (x->>'deposito_id')::uuid = v_dep GROUP BY 1, 2 ORDER BY 1, 2 NULLS FIRST LOOP
      -- Mismo orden de bloqueo que el motor (costo primero, saldo después) para no invertir el orden frente a movimientos manuales simultáneos.
      INSERT INTO public.inventario_costos (empresa_id, producto_id, deposito_id) VALUES (p_empresa, b.producto_id, v_dep) ON CONFLICT (empresa_id, producto_id, deposito_id) DO NOTHING;
      PERFORM 1 FROM public.inventario_costos WHERE empresa_id = p_empresa AND producto_id = b.producto_id AND deposito_id = v_dep FOR UPDATE;
      PERFORM 1 FROM public.stock_saldos s
        WHERE s.empresa_id = p_empresa AND s.producto_id = b.producto_id AND s.deposito_id = v_dep AND s.estado_stock = 'DISPONIBLE' AND s.propiedad = 'PROPIO'
          AND s.propietario_id IS NULL AND s.lote_id IS NOT DISTINCT FROM b.lote_id AND s.cantidad >= b.cantidad FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'stock disponible insuficiente para facturar (producto %, depósito %, cantidad %)',
          (SELECT codigo FROM public.productos WHERE empresa_id = p_empresa AND id = b.producto_id), (SELECT codigo FROM public.depositos WHERE empresa_id = p_empresa AND id = v_dep), b.cantidad
          USING ERRCODE = 'P0001', DETAIL = 'NEX:STOCK_INSUFICIENTE';
      END IF;
      PERFORM public.inventario_agregar_linea(p_empresa, v_mov, b.producto_id, b.cantidad, NULL, b.lote_id, 'PROPIO', NULL, NULL, NULL, NULL);
    END LOOP;

    INSERT INTO public.documento_electronico_stock_salidas (empresa_id, documento_id, deposito_id, movimiento_id, creado_por) VALUES (p_empresa, p_documento, v_dep, v_mov, p_usuario);
    v_creados := v_creados + 1;
  END LOOP;

  RETURN v_creados;
END $$;

-- 5) Política: cambio auditado (solo FACTURACION_ELECTRONICA.CONFIGURAR; empresa de la sesión). La fila de la empresa se bloquea: una emisión con faltante en curso (FOR SHARE) termina antes o ve el valor nuevo.
CREATE FUNCTION public.fe_politica_stock_actualizar(p_empresa uuid, p_usuario uuid, p_bloquear boolean)
RETURNS TABLE (o_bloquear boolean, o_cambio boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_actual boolean;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CONFIGURAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.CONFIGURAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_bloquear IS NULL THEN
    RAISE EXCEPTION 'indique si se bloquea la facturación por stock insuficiente' USING ERRCODE = 'P0001', DETAIL = 'NEX:POLITICA_STOCK_INVALIDA';
  END IF;

  SELECT e.bloquear_stock_insuficiente INTO v_actual FROM public.empresas e WHERE e.id = p_empresa FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'la empresa no existe' USING ERRCODE = '42501';
  END IF;
  IF v_actual = p_bloquear THEN
    RETURN QUERY SELECT v_actual, false;
    RETURN;
  END IF;

  UPDATE public.empresas SET bloquear_stock_insuficiente = p_bloquear WHERE id = p_empresa;
  INSERT INTO public.eventos_seguridad (empresa_id, usuario_id, tipo, detalle)
  VALUES (p_empresa, p_usuario, 'FE_POLITICA_STOCK_ACTUALIZADA', jsonb_build_object('campo', 'bloquear_stock_insuficiente', 'anterior', v_actual, 'nuevo', p_bloquear));

  RETURN QUERY SELECT p_bloquear, true;
END $$;

-- 6) Contexto de la previa/emisión (SOLO LECTURA): política vigente, depósitos elegibles para registrar un faltante (propios, activos, de la sucursal, en el alcance del usuario; el mismo filtro de la baja)
--    y productos con control de lotes EVIDENCIADO (tienen lotes registrados: el faltante de esos productos queda bloqueado hasta una definición específica; no se inventan lotes).
CREATE FUNCTION public.fe_stock_politica_contexto(p_empresa uuid, p_usuario uuid, p_sucursal uuid, p_productos uuid[])
RETURNS TABLE (o_bloquear boolean, o_depositos jsonb, o_con_lote uuid[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF NOT public.sucursal_en_alcance(p_empresa, p_usuario, p_sucursal) THEN
    RAISE EXCEPTION 'la sucursal está fuera del alcance del usuario' USING ERRCODE = '42501';
  END IF;
  IF p_productos IS NOT NULL AND cardinality(p_productos) > 999 THEN
    RAISE EXCEPTION 'demasiados productos (máximo 999)' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
    SELECT e.bloquear_stock_insuficiente,
           COALESCE((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'codigo', d.codigo, 'nombre', d.nombre) ORDER BY d.codigo, d.id)
                       FROM public.depositos d
                      WHERE d.empresa_id = p_empresa AND d.activo AND NOT d.es_de_terceros AND d.sucursal_id = p_sucursal
                        AND public.usuario_puede_deposito(p_empresa, p_usuario, d.id)), '[]'::jsonb),
           COALESCE((SELECT array_agg(DISTINCT l.producto_id ORDER BY l.producto_id)
                       FROM public.stock_lotes l WHERE l.empresa_id = p_empresa AND l.producto_id = ANY (COALESCE(p_productos, ARRAY[]::uuid[]))), ARRAY[]::uuid[])
      FROM public.empresas e WHERE e.id = p_empresa;
END $$;

-- 7) Emisión con faltante pendiente (SOLO política FALSE). Todo o nada en UNA transacción: FE + numeración + salidas del disponible + pendientes.
--    p_pendientes: [{producto_id, deposito_id, cantidad}] (uno por producto). p_bloquear_revisado: la política que el operador revisó (debe ser FALSE y seguir siéndolo).
CREATE FUNCTION public.fe_documento_crear_fe_stock_pendiente(
  p_empresa uuid, p_usuario uuid, p_sucursal uuid, p_punto uuid, p_clave text, p_cliente uuid, p_receptor_documento text, p_receptor_nombre text,
  p_moneda text, p_total numeric, p_payload jsonb, p_asignaciones jsonb, p_direccion_entrega uuid, p_vendedor uuid, p_pendientes jsonb, p_bloquear_revisado boolean)
RETURNS TABLE (o_documento_id uuid, o_numero text, o_reutilizado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid; v_numero text; v_reutilizado boolean;
  v_bloquear boolean;
  v_existe boolean;
  v_norm jsonb := '[]'::jsonb;
  v_payload jsonb;
  x jsonb;
  v_prod uuid; v_dep uuid; v_cant numeric;
  r record;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CREAR') OR NOT public.sucursal_en_alcance(p_empresa, p_usuario, p_sucursal) THEN
    RAISE EXCEPTION 'el usuario no puede emitir facturas en esta sucursal' USING ERRCODE = '42501';
  END IF;
  IF p_pendientes IS NULL OR jsonb_typeof(p_pendientes) <> 'array' OR jsonb_array_length(p_pendientes) = 0 OR jsonb_array_length(p_pendientes) > 999 THEN
    RAISE EXCEPTION 'el faltante pendiente no es válido' USING ERRCODE = 'P0001', DETAIL = 'NEX:STOCK_PENDIENTE_INVALIDO';
  END IF;

  -- Política AUTORITATIVA bajo bloqueo de la fila de la empresa (un cambio de política concurrente espera a esta transacción o se ve aquí). Jamás se toma del navegador.
  SELECT e.bloquear_stock_insuficiente INTO v_bloquear FROM public.empresas e WHERE e.id = p_empresa FOR SHARE;
  IF NOT FOUND OR v_bloquear IS DISTINCT FROM false OR p_bloquear_revisado IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'la política de stock insuficiente de la empresa cambió desde la revisión (o bloquea la facturación sin stock)' USING ERRCODE = 'P0001', DETAIL = 'NEX:STOCK_POLITICA_CAMBIO';
  END IF;

  -- Forma y pertenencia de cada pendiente (uno por producto; producto de la empresa que controla stock y SIN control de lotes evidenciado; depósito propio, activo, de la sucursal y en el alcance).
  FOR x IN SELECT e FROM jsonb_array_elements(p_pendientes) e LOOP
    IF jsonb_typeof(x) <> 'object' OR (SELECT count(*) FROM jsonb_object_keys(x)) <> 3
       OR jsonb_typeof(x->'producto_id') IS DISTINCT FROM 'string' OR jsonb_typeof(x->'deposito_id') IS DISTINCT FROM 'string' OR jsonb_typeof(x->'cantidad') IS DISTINCT FROM 'string'
       OR (x->>'producto_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR (x->>'deposito_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR (x->>'cantidad') !~ '^[0-9]{1,14}(\.[0-9]{1,4})?$' OR (x->>'cantidad')::numeric <= 0 THEN
      RAISE EXCEPTION 'el faltante pendiente contiene un elemento inválido' USING ERRCODE = 'P0001', DETAIL = 'NEX:STOCK_PENDIENTE_INVALIDO';
    END IF;
    v_prod := (x->>'producto_id')::uuid; v_dep := (x->>'deposito_id')::uuid; v_cant := (x->>'cantidad')::numeric;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_norm) n WHERE (n->>'producto_id')::uuid = v_prod) THEN
      RAISE EXCEPTION 'el faltante pendiente repite un producto' USING ERRCODE = 'P0001', DETAIL = 'NEX:STOCK_PENDIENTE_INVALIDO';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.productos p WHERE p.empresa_id = p_empresa AND p.id = v_prod AND p.controla_stock) THEN
      RAISE EXCEPTION 'el faltante pendiente es de un producto sin control de stock o de otra empresa' USING ERRCODE = 'P0001', DETAIL = 'NEX:STOCK_PENDIENTE_INVALIDO';
    END IF;
    IF EXISTS (SELECT 1 FROM public.stock_lotes l WHERE l.empresa_id = p_empresa AND l.producto_id = v_prod) THEN
      RAISE EXCEPTION 'el producto % controla lotes: su faltante no se puede dejar pendiente (requiere definición específica)', (SELECT codigo FROM public.productos WHERE empresa_id = p_empresa AND id = v_prod)
        USING ERRCODE = 'P0001', DETAIL = 'NEX:STOCK_PENDIENTE_LOTE';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.depositos d WHERE d.empresa_id = p_empresa AND d.id = v_dep AND d.activo AND NOT d.es_de_terceros AND d.sucursal_id = p_sucursal)
       OR NOT public.usuario_puede_deposito(p_empresa, p_usuario, v_dep) THEN
      RAISE EXCEPTION 'el depósito del faltante no es válido para esta factura (inactivo, de otra sucursal o fuera de su alcance)' USING ERRCODE = '42501', DETAIL = 'NEX:STOCK_DEPOSITO_NO_AUTORIZADO';
    END IF;
    v_norm := v_norm || jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'deposito_id', v_dep, 'cantidad', round(v_cant, 4)));
  END LOOP;

  SELECT EXISTS (SELECT 1 FROM public.documentos_electronicos d WHERE d.empresa_id = p_empresa AND d.clave_idempotencia = p_clave) INTO v_existe;

  -- La preparación SOLO se crea para una FE nueva; la baja (misma transacción) la concilia. Se borra siempre antes de devolver.
  IF NOT v_existe THEN
    INSERT INTO public.fe_stock_pendientes_preparacion (txid, empresa_id, clave, pendientes) VALUES (txid_current(), p_empresa, p_clave, v_norm);
  END IF;

  SELECT c.o_documento_id, c.o_numero, c.o_reutilizado INTO v_id, v_numero, v_reutilizado
    FROM public.fe_documento_crear_fe_receptor(p_empresa, p_usuario, p_sucursal, p_punto, p_clave, p_cliente, p_receptor_documento, p_receptor_nombre, p_moneda, p_total, p_payload, p_asignaciones, p_direccion_entrega, p_vendedor) c;

  DELETE FROM public.fe_stock_pendientes_preparacion WHERE txid = txid_current() AND empresa_id = p_empresa AND clave = p_clave;

  IF v_reutilizado THEN
    -- Reintento (o carrera de la misma clave): no se escribe nada; los pendientes deben ser EXACTAMENTE los persistidos.
    IF (SELECT COALESCE(jsonb_agg(jsonb_build_array(p.producto_id::text, p.deposito_id::text, round(p.cantidad_pendiente, 4)::text) ORDER BY p.producto_id), '[]'::jsonb)
          FROM public.documento_electronico_stock_pendientes p WHERE p.empresa_id = p_empresa AND p.documento_id = v_id)
       IS DISTINCT FROM
       (SELECT COALESCE(jsonb_agg(jsonb_build_array(n->>'producto_id', n->>'deposito_id', round((n->>'cantidad')::numeric, 4)::text) ORDER BY (n->>'producto_id')::uuid), '[]'::jsonb)
          FROM jsonb_array_elements(v_norm) n) THEN
      RAISE EXCEPTION 'la clave de idempotencia ya se usó con otro faltante de stock' USING ERRCODE = 'P0001', DETAIL = 'NEX:IDEMPOTENCIA_CONFLICTO';
    END IF;
    RETURN QUERY SELECT v_id, v_numero, v_reutilizado;
    RETURN;
  END IF;

  -- FE nueva: la baja de NEX-067 (redefinida arriba) ya concilió salidas + pendientes = facturado y bajó el disponible bajo bloqueo. Aquí:
  --  · el faltante es REAL: después de la salida inmediata no queda disponible del producto en los depósitos elegibles (si queda, el reparto revisado no tomó todo el disponible → revisar de nuevo);
  --  · se registran los pendientes con facturado / descontado / pendiente.
  SELECT s.payload INTO v_payload FROM public.documento_electronico_solicitudes s WHERE s.empresa_id = p_empresa AND s.documento_id = v_id ORDER BY s.version DESC LIMIT 1;

  FOR r IN
    SELECT (n->>'producto_id')::uuid AS producto_id, (n->>'deposito_id')::uuid AS deposito_id, (n->>'cantidad')::numeric AS pendiente,
           (SELECT sum((d->>'dCantProSer')::numeric) FROM jsonb_array_elements(COALESCE(v_payload->'Detalles', '[]'::jsonb)) d
              JOIN public.productos p ON p.empresa_id = p_empresa AND p.codigo = d->>'dCodInt' AND p.id = (n->>'producto_id')::uuid) AS facturado,
           COALESCE((SELECT sum((a->>'cantidad')::numeric) FROM jsonb_array_elements(COALESCE(p_asignaciones, '[]'::jsonb)) a WHERE (a->>'producto_id')::uuid = (n->>'producto_id')::uuid), 0) AS descontado
      FROM jsonb_array_elements(v_norm) n ORDER BY 1
  LOOP
    PERFORM 1 FROM public.stock_saldos s
      JOIN public.depositos d ON d.empresa_id = s.empresa_id AND d.id = s.deposito_id AND d.activo AND NOT d.es_de_terceros AND d.sucursal_id = p_sucursal
     WHERE s.empresa_id = p_empresa AND s.producto_id = r.producto_id AND s.estado_stock = 'DISPONIBLE' AND s.propiedad = 'PROPIO' AND s.cantidad > 0
       AND public.usuario_puede_deposito(p_empresa, p_usuario, d.id)
       FOR UPDATE OF s;
    IF FOUND THEN
      RAISE EXCEPTION 'hay stock disponible del producto % que el reparto revisado no descuenta: revise la factura de nuevo', (SELECT codigo FROM public.productos WHERE empresa_id = p_empresa AND id = r.producto_id)
        USING ERRCODE = 'P0001', DETAIL = 'NEX:STOCK_PENDIENTE_CON_DISPONIBLE';
    END IF;
    IF r.facturado IS NULL OR r.facturado <> r.descontado + r.pendiente THEN
      RAISE EXCEPTION 'el faltante pendiente no coincide con la cantidad facturada' USING ERRCODE = 'P0001', DETAIL = 'NEX:STOCK_REPARTO_INVALIDO';
    END IF;
    INSERT INTO public.documento_electronico_stock_pendientes (empresa_id, documento_id, producto_id, deposito_id, cantidad_facturada, cantidad_descontada, cantidad_pendiente, creado_por)
    VALUES (p_empresa, v_id, r.producto_id, r.deposito_id, r.facturado, r.descontado, r.pendiente, p_usuario);
  END LOOP;

  RETURN QUERY SELECT v_id, v_numero, v_reutilizado;
END $$;

-- 8) «Bajas pendientes de stock» (SOLO LECTURA): STOCK.VER y solo depósitos del alcance del usuario. Saldo registrado = disponible propio real (>= 0); proyectado = registrado − pendientes abiertos
--    (un proyectado negativo NO es saldo físico ni contable: es solo una lectura informativa).
CREATE FUNCTION public.fe_stock_pendientes_listar(p_empresa uuid, p_usuario uuid, p_estado text, p_deposito uuid, p_buscar text)
RETURNS TABLE (o_id uuid, o_documento_id uuid, o_documento text, o_fecha_emision timestamptz, o_estado_local text, o_estado_sifen text,
               o_producto_codigo text, o_producto_descripcion text, o_deposito_id uuid, o_deposito_codigo text, o_deposito_nombre text,
               o_facturado numeric, o_descontado numeric, o_pendiente numeric, o_saldo_registrado numeric, o_pendiente_abierto numeric, o_saldo_proyectado numeric,
               o_estado text, o_creado_at timestamptz, o_confirmado_at timestamptz, o_confirmado_por text, o_movimiento_numero text, o_fe_confirmable boolean, o_con_lote boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_buscar text := NULLIF(btrim(COALESCE(p_buscar, '')), '');
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'STOCK', 'VER') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso STOCK.VER en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_estado IS NOT NULL AND p_estado NOT IN ('PENDIENTE', 'CONFIRMADA') THEN
    RAISE EXCEPTION 'estado inválido' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
    SELECT p.id, p.documento_id, d.establecimiento || '-' || d.punto_expedicion || '-' || d.numero, d.fecha_emision, d.estado_local, d.estado_sifen,
           pr.codigo::text, pr.descripcion::text, p.deposito_id, dp.codigo::text, dp.nombre::text,
           p.cantidad_facturada, p.cantidad_descontada, p.cantidad_pendiente, sal.registrado, ab.abierto, sal.registrado - ab.abierto,
           p.estado, p.creado_at, p.confirmado_at, NULLIF(btrim(COALESCE(u.nombre, '') || ' ' || COALESCE(u.apellido, '')), ''), m.numero_movimiento,
           (d.estado_local = 'ENVIADO' AND d.estado_sifen IN ('SIN_CONSULTA', 'PENDIENTE', 'APROBADO')),
           EXISTS (SELECT 1 FROM public.stock_lotes l WHERE l.empresa_id = p.empresa_id AND l.producto_id = p.producto_id)
      FROM public.documento_electronico_stock_pendientes p
      JOIN public.documentos_electronicos d ON d.empresa_id = p.empresa_id AND d.id = p.documento_id
      JOIN public.productos pr ON pr.empresa_id = p.empresa_id AND pr.id = p.producto_id
      JOIN public.depositos dp ON dp.empresa_id = p.empresa_id AND dp.id = p.deposito_id
      LEFT JOIN public.usuarios u ON u.empresa_id = p.empresa_id AND u.id = p.confirmado_por
      LEFT JOIN public.movimientos_inventario m ON m.empresa_id = p.empresa_id AND m.id = p.movimiento_id
      CROSS JOIN LATERAL (SELECT COALESCE(sum(s.cantidad), 0) AS registrado FROM public.stock_saldos s
                           WHERE s.empresa_id = p.empresa_id AND s.producto_id = p.producto_id AND s.deposito_id = p.deposito_id
                             AND s.estado_stock = 'DISPONIBLE' AND s.propiedad = 'PROPIO') sal
      CROSS JOIN LATERAL (SELECT COALESCE(sum(q.cantidad_pendiente), 0) AS abierto FROM public.documento_electronico_stock_pendientes q
                           WHERE q.empresa_id = p.empresa_id AND q.producto_id = p.producto_id AND q.deposito_id = p.deposito_id AND q.estado = 'PENDIENTE') ab
     WHERE p.empresa_id = p_empresa
       AND public.usuario_puede_deposito(p_empresa, p_usuario, p.deposito_id)
       AND (p_estado IS NULL OR p.estado = p_estado)
       AND (p_deposito IS NULL OR p.deposito_id = p_deposito)
       AND (v_buscar IS NULL OR pr.codigo ILIKE '%' || v_buscar || '%' OR pr.descripcion ILIKE '%' || v_buscar || '%'
            OR (d.establecimiento || '-' || d.punto_expedicion || '-' || d.numero) ILIKE '%' || v_buscar || '%')
     ORDER BY (p.estado = 'PENDIENTE') DESC, d.fecha_emision DESC, d.numero DESC, pr.codigo, p.id
     LIMIT 500;
END $$;

-- 9) Confirmación MANUAL de una baja pendiente: SALIDA/VENTA complementaria por el motor ordinario, solo con saldo real suficiente (nunca a negativo) y FE enviada no rechazada/cancelada/inutilizada.
--    Idempotente: el pendiente se bloquea; si ya está confirmado devuelve su movimiento; la clave del movimiento es 'FE-STOCK-PEND:<id>'. La reposición nunca confirma sola.
CREATE FUNCTION public.fe_stock_pendiente_confirmar(p_empresa uuid, p_usuario uuid, p_pendiente uuid)
RETURNS TABLE (o_movimiento_id uuid, o_numero text, o_repetido boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_p public.documento_electronico_stock_pendientes%ROWTYPE;
  v_doc public.documentos_electronicos%ROWTYPE;
  v_ref text;
  v_mov uuid; v_num text; v_rep boolean;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'MOVIMIENTOS', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso MOVIMIENTOS.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('fe.stock.pend:' || p_empresa::text || ':' || COALESCE(p_pendiente::text, ''), 0));
  SELECT * INTO v_p FROM public.documento_electronico_stock_pendientes WHERE empresa_id = p_empresa AND id = p_pendiente FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'la baja pendiente no existe en esta empresa' USING ERRCODE = 'P0001', DETAIL = 'NEX:PENDIENTE_NO_ENCONTRADO';
  END IF;
  IF NOT public.usuario_puede_deposito(p_empresa, p_usuario, v_p.deposito_id) THEN
    RAISE EXCEPTION 'el usuario no tiene alcance sobre el depósito de esta baja pendiente' USING ERRCODE = '42501';
  END IF;
  IF v_p.estado = 'CONFIRMADA' THEN
    RETURN QUERY SELECT m.id, m.numero_movimiento, true FROM public.movimientos_inventario m WHERE m.empresa_id = p_empresa AND m.id = v_p.movimiento_id;
    RETURN;
  END IF;

  SELECT * INTO v_doc FROM public.documentos_electronicos WHERE empresa_id = p_empresa AND id = v_p.documento_id FOR SHARE;
  IF v_doc.estado_local IS DISTINCT FROM 'ENVIADO' OR v_doc.estado_sifen NOT IN ('SIN_CONSULTA', 'PENDIENTE', 'APROBADO') THEN
    RAISE EXCEPTION 'la factura no tiene la recepción confirmada o fue rechazada, cancelada, inutilizada o no reconocida: la baja pendiente no se puede confirmar'
      USING ERRCODE = 'P0001', DETAIL = 'NEX:PENDIENTE_FE_NO_CONFIRMABLE';
  END IF;
  IF EXISTS (SELECT 1 FROM public.stock_lotes l WHERE l.empresa_id = p_empresa AND l.producto_id = v_p.producto_id) THEN
    RAISE EXCEPTION 'el producto controla lotes: la confirmación requiere una definición específica' USING ERRCODE = 'P0001', DETAIL = 'NEX:STOCK_PENDIENTE_LOTE';
  END IF;

  -- Mismo orden de bloqueo que el motor (costo, luego saldo). Sin saldo real suficiente NO se confirma (jamás saldo negativo).
  INSERT INTO public.inventario_costos (empresa_id, producto_id, deposito_id) VALUES (p_empresa, v_p.producto_id, v_p.deposito_id) ON CONFLICT (empresa_id, producto_id, deposito_id) DO NOTHING;
  PERFORM 1 FROM public.inventario_costos WHERE empresa_id = p_empresa AND producto_id = v_p.producto_id AND deposito_id = v_p.deposito_id FOR UPDATE;
  PERFORM 1 FROM public.stock_saldos s
    WHERE s.empresa_id = p_empresa AND s.producto_id = v_p.producto_id AND s.deposito_id = v_p.deposito_id AND s.estado_stock = 'DISPONIBLE' AND s.propiedad = 'PROPIO'
      AND s.propietario_id IS NULL AND s.lote_id IS NULL AND s.cantidad >= v_p.cantidad_pendiente FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'stock disponible insuficiente para confirmar la baja pendiente (producto %, depósito %, cantidad %)',
      (SELECT codigo FROM public.productos WHERE empresa_id = p_empresa AND id = v_p.producto_id), (SELECT codigo FROM public.depositos WHERE empresa_id = p_empresa AND id = v_p.deposito_id), v_p.cantidad_pendiente
      USING ERRCODE = 'P0001', DETAIL = 'NEX:STOCK_INSUFICIENTE';
  END IF;

  v_ref := 'FE ' || v_doc.establecimiento || '-' || v_doc.punto_expedicion || '-' || v_doc.numero;
  SELECT c.o_movimiento_id, c.o_numero, c.o_repetido INTO v_mov, v_num, v_rep
    FROM public.inventario_registrar_movimiento(p_empresa, p_usuario, 'SALIDA', 'VENTA', NULL, v_p.deposito_id, NULL,
           jsonb_build_array(jsonb_build_object('producto_id', v_p.producto_id, 'cantidad', v_p.cantidad_pendiente)),
           'FE-STOCK-PEND:' || v_p.id::text, v_doc.cliente_id, 'Venta por factura electrónica (baja pendiente confirmada)',
           'Confirmación manual de la baja pendiente de ' || v_ref, v_ref) c;

  UPDATE public.documento_electronico_stock_pendientes
     SET estado = 'CONFIRMADA', confirmado_por = p_usuario, confirmado_at = now(), movimiento_id = v_mov
   WHERE empresa_id = p_empresa AND id = v_p.id;

  RETURN QUERY SELECT v_mov, v_num, false;
END $$;

COMMENT ON FUNCTION public.fe_politica_stock_actualizar(uuid, uuid, boolean) IS 'NEX-081 / PRO-354-R02: cambia la política «Bloquear facturación por stock insuficiente» de la empresa (CONFIGURAR, auditado).';
COMMENT ON FUNCTION public.fe_stock_politica_contexto(uuid, uuid, uuid, uuid[]) IS 'NEX-081: política vigente, depósitos elegibles para el faltante y productos con lotes. Solo lectura.';
COMMENT ON FUNCTION public.fe_documento_crear_fe_stock_pendiente(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb, jsonb, uuid, uuid, jsonb, boolean) IS 'NEX-081: emisión de FE con faltante pendiente (política FALSE revalidada bajo bloqueo); envuelve fe_documento_crear_fe_receptor.';
COMMENT ON FUNCTION public.fe_stock_pendientes_listar(uuid, uuid, text, uuid, text) IS 'NEX-081: «Bajas pendientes de stock» (STOCK.VER, alcance de depósito). Solo lectura.';
COMMENT ON FUNCTION public.fe_stock_pendiente_confirmar(uuid, uuid, uuid) IS 'NEX-081: confirmación manual de una baja pendiente con saldo real suficiente (MOVIMIENTOS.CREAR, alcance, idempotente).';

-- 10) Grants (ayudante descubierto por el envoltorio global, después de nex_aplicar_grants_facturacion_stock por orden alfabético): la aplicación SOLO ejecuta las funciones; tablas sin acceso directo.
CREATE FUNCTION public.nex_aplicar_grants_facturacion_stock_pendientes() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;
  REVOKE ALL ON public.documento_electronico_stock_pendientes FROM PUBLIC;
  REVOKE ALL ON public.documento_electronico_stock_pendientes FROM nexit_runtime;
  REVOKE ALL ON public.fe_stock_pendientes_preparacion FROM PUBLIC;
  REVOKE ALL ON public.fe_stock_pendientes_preparacion FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_stock_baja_documento(uuid, uuid, uuid, jsonb) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_politica_stock_actualizar(uuid, uuid, boolean) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_stock_politica_contexto(uuid, uuid, uuid, uuid[]) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_documento_crear_fe_stock_pendiente(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb, jsonb, uuid, uuid, jsonb, boolean) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_stock_pendientes_listar(uuid, uuid, text, uuid, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_stock_pendiente_confirmar(uuid, uuid, uuid) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.fe_politica_stock_actualizar(uuid, uuid, boolean) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_stock_politica_contexto(uuid, uuid, uuid, uuid[]) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_documento_crear_fe_stock_pendiente(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb, jsonb, uuid, uuid, jsonb, boolean) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_stock_pendientes_listar(uuid, uuid, text, uuid, text) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_stock_pendiente_confirmar(uuid, uuid, uuid) TO nexit_runtime;
END $$;

REVOKE ALL ON FUNCTION public.fe_stock_pendientes_inmutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fe_stock_pendiente_movimiento_protegido() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fe_stock_baja_documento(uuid, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fe_politica_stock_actualizar(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fe_stock_politica_contexto(uuid, uuid, uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fe_documento_crear_fe_stock_pendiente(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb, jsonb, uuid, uuid, jsonb, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fe_stock_pendientes_listar(uuid, uuid, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fe_stock_pendiente_confirmar(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nex_aplicar_grants_facturacion_stock_pendientes() FROM PUBLIC;

SELECT public.nex_aplicar_grants_facturacion_stock_pendientes();
