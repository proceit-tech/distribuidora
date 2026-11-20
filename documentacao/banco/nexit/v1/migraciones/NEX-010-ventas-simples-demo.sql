-- =====================================================================
-- NEX-010 — Venta simple por movimiento (reemplazable cuando exista Facturación)
-- DECISIÓN PENDIENTE DEL RESPONSABLE: el reporte "ventas al costo" necesita una fuente de ventas y Facturas está fuera de alcance.
-- Propuesta: SALIDA con origen VENTA + precio de venta opcional en la línea + cliente en la cabecera. Migración aislada para poder sustituirla.
-- Proyecto Nexit (REQ NEXIT-2026-001). ESTADO: V1 candidata oficial — pendiente de auditoría (ChatGPT) y aprobación del responsable.
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable.
-- Aplicar con documentacao/banco/nexit/v1/scripts/aplicar-migraciones.sh (transacción única + checksum).
-- =====================================================================

ALTER TABLE movimientos_inventario
  ADD COLUMN cliente_id uuid,
  ADD CONSTRAINT movimientos_inventario_cliente_fk FOREIGN KEY (empresa_id, cliente_id) REFERENCES clientes (empresa_id, id),
  ADD CONSTRAINT movimientos_inventario_cliente_chk CHECK (cliente_id IS NULL OR tipo_origen = 'VENTA');

ALTER TABLE movimiento_lineas
  ADD COLUMN precio_venta_unitario numeric(18,4),
  ADD COLUMN precio_venta_total    numeric(18,4),
  ADD COLUMN moneda_venta_codigo   text REFERENCES monedas (codigo),
  ADD CONSTRAINT movimiento_lineas_venta_chk CHECK (
    (precio_venta_unitario IS NULL AND precio_venta_total IS NULL AND moneda_venta_codigo IS NULL)
    OR (precio_venta_unitario >= 0 AND precio_venta_total >= 0 AND moneda_venta_codigo IS NOT NULL));

DROP FUNCTION inventario_registrar_linea(uuid, uuid, uuid, numeric, numeric, uuid, text, uuid);

CREATE OR REPLACE FUNCTION inventario_registrar_linea(
  p_empresa uuid, p_movimiento uuid, p_producto uuid, p_cantidad numeric,
  p_costo_unitario numeric DEFAULT NULL, p_lote uuid DEFAULT NULL,
  p_propiedad text DEFAULT 'PROPIO', p_propietario uuid DEFAULT NULL,
  p_precio_venta numeric DEFAULT NULL, p_moneda_venta text DEFAULT NULL)
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
  IF v_valued AND m.tipo_movimiento IN ('ENTRADA','AJUSTE_POSITIVO') AND (p_costo_unitario IS NULL OR p_costo_unitario < 0) THEN
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
      v_total := CASE WHEN v_valued THEN round(p_cantidad * p_costo_unitario, 4) END;
      v_unit  := CASE WHEN v_valued THEN p_costo_unitario END;
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

SELECT nex_instalar_triggers_actualizacion();
