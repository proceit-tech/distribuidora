-- =====================================================================
-- NEX-009 — Inventario, movimientos y costos (promedio ponderado móvil)
-- Saldos de stock, movimientos inmutables, costo promedio ponderado móvil por producto y depósito (P007) e inventario_registrar_linea().
-- Fuera de alcance de la 1.ª demostración: recepciones, facturación (se omiten goods_receipts* e invoice*).
-- Proyecto Nexit (REQ NEXIT-2026-001). ESTADO: V1 candidata oficial — pendiente de auditoría (ChatGPT) y aprobación del responsable.
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable.
-- Aplicar con documentacao/banco/nexit/v1/scripts/aplicar-migraciones.sh (transacción única + checksum).
-- =====================================================================

CREATE TABLE stock_lotes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid        NOT NULL REFERENCES empresas (id),
  producto_id  uuid        NOT NULL,                                   
  codigo_lote    text        NOT NULL,                                   
  fecha_vencimiento date,                                                   
  creado_at  timestamptz NOT NULL DEFAULT now(),
  actualizado_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_lotes_empresa_id_id_key UNIQUE (empresa_id, id),
  
  
  CONSTRAINT stock_lotes_empresa_producto_id_key UNIQUE (empresa_id, producto_id, id),
  CONSTRAINT stock_lotes_empresa_producto_codigo_key UNIQUE (empresa_id, producto_id, codigo_lote),  
  
  
  CONSTRAINT stock_lotes_codigo_chk CHECK (length(btrim(codigo_lote)) > 0),
  CONSTRAINT stock_lotes_producto_fk FOREIGN KEY (empresa_id, producto_id) REFERENCES productos (empresa_id, id)
);

CREATE TABLE stock_saldos (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid          NOT NULL REFERENCES empresas (id),
  producto_id   uuid          NOT NULL,                                
  deposito_id uuid          NOT NULL,                                
  
  
  
  
  estado_stock  text          NOT NULL,
  lote_id       uuid,                                                  
  propiedad    text          NOT NULL DEFAULT 'PROPIO',               
  propietario_id     uuid,                                                  
  cantidad     numeric(18,4) NOT NULL DEFAULT 0,                      
  creado_at   timestamptz   NOT NULL DEFAULT now(),
  actualizado_at   timestamptz   NOT NULL DEFAULT now(),                  
  CONSTRAINT stock_saldos_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT stock_saldos_estado_chk CHECK (estado_stock IN ('DISPONIBLE','RESERVADO','CUARENTENA','TRANSITO')),
  CONSTRAINT stock_saldos_propiedad_chk CHECK (propiedad IN ('PROPIO','TERCERO')),
  
  
  
  CONSTRAINT stock_saldos_cant_chk CHECK (cantidad >= 0),
  
  CONSTRAINT stock_saldos_propietario_chk CHECK (propiedad <> 'PROPIO' OR propietario_id IS NULL),
  CONSTRAINT stock_saldos_producto_fk   FOREIGN KEY (empresa_id, producto_id)   REFERENCES productos (empresa_id, id),
  CONSTRAINT stock_saldos_deposito_fk FOREIGN KEY (empresa_id, deposito_id) REFERENCES depositos (empresa_id, id),
  
  
  CONSTRAINT stock_saldos_lote_fk FOREIGN KEY (empresa_id, producto_id, lote_id) REFERENCES stock_lotes (empresa_id, producto_id, id)
);

CREATE UNIQUE INDEX stock_saldos_natural_key ON stock_saldos (
  empresa_id, producto_id, deposito_id, estado_stock,
  COALESCE(lote_id,   '00000000-0000-0000-0000-000000000000'::uuid),
  propiedad,
  COALESCE(propietario_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX stock_saldos_deposito_idx ON stock_saldos (empresa_id, deposito_id);

CREATE TABLE movimientos_inventario (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),   
  empresa_id               uuid        NOT NULL REFERENCES empresas (id),       
  numero_movimiento          text        NOT NULL,                                
  tipo_movimiento            text        NOT NULL,                                
  tipo_origen              text        NOT NULL,                                
  estado                   text        NOT NULL DEFAULT 'REGISTRADO',           
  fecha_movimiento            date        NOT NULL,                                
  hora_movimiento            time        NOT NULL,                                
  sucursal_id                uuid,                                                
  deposito_origen_id      uuid,                                                
  deposito_destino_id uuid,                                                
  documento_referencia       text,                                                
  motivo                   text,                                                
  observacion                    text,                                                
  autorizacion_id         uuid,                                                
  creado_por               uuid        NOT NULL,                                
  creado_at               timestamptz NOT NULL DEFAULT now(),                  
  actualizado_at               timestamptz NOT NULL DEFAULT now(),                  
  CONSTRAINT movimientos_inventario_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT movimientos_inventario_numero_key UNIQUE (empresa_id, numero_movimiento),
  CONSTRAINT movimientos_inventario_numero_chk CHECK (numero_movimiento ~ '^MOV-[0-9]{6}$'),   
  CONSTRAINT movimientos_inventario_tipo_chk CHECK (tipo_movimiento IN
    ('ENTRADA','SALIDA','TRANSFERENCIA','AJUSTE_POSITIVO','AJUSTE_NEGATIVO','RESERVA',
     'LIBERACION_RESERVA','CUARENTENA','LIBERACION_CUARENTENA')),                         
  CONSTRAINT movimientos_inventario_origen_tipo_chk CHECK (tipo_origen IN
    ('MANUAL','COMPRA','VENTA','DEVOLUCION','TRANSFERENCIA','AJUSTE','INVENTARIO')),      
  CONSTRAINT movimientos_inventario_estado_chk CHECK (estado IN ('REGISTRADO','ANULADO')),    
  
  
  
  
  CONSTRAINT movimientos_inventario_warehouses_chk CHECK (
    (deposito_origen_id IS NOT NULL) = (tipo_movimiento IN
      ('SALIDA','TRANSFERENCIA','RESERVA','LIBERACION_RESERVA','CUARENTENA','LIBERACION_CUARENTENA','AJUSTE_NEGATIVO'))
    AND
    (deposito_destino_id IS NOT NULL) = (tipo_movimiento IN ('ENTRADA','TRANSFERENCIA','AJUSTE_POSITIVO'))
  ),
  
  CONSTRAINT movimientos_inventario_transfer_chk CHECK (
    tipo_movimiento <> 'TRANSFERENCIA' OR deposito_origen_id <> deposito_destino_id),
  CONSTRAINT movimientos_inventario_sucursal_fk FOREIGN KEY (empresa_id, sucursal_id)               REFERENCES sucursales (empresa_id, id),
  CONSTRAINT movimientos_inventario_src_dep_fk FOREIGN KEY (empresa_id, deposito_origen_id)      REFERENCES depositos (empresa_id, id),
  CONSTRAINT movimientos_inventario_dst_dep_fk FOREIGN KEY (empresa_id, deposito_destino_id) REFERENCES depositos (empresa_id, id),
  CONSTRAINT movimientos_inventario_creado_por_fk FOREIGN KEY (empresa_id, creado_por)           REFERENCES usuarios (empresa_id, id)
);

CREATE INDEX movimientos_inventario_fecha_idx ON movimientos_inventario (empresa_id, fecha_movimiento);

CREATE INDEX movimientos_inventario_tipo_idx ON movimientos_inventario (empresa_id, tipo_movimiento);

CREATE INDEX movimientos_inventario_src_dep_idx ON movimientos_inventario (empresa_id, deposito_origen_id) WHERE deposito_origen_id IS NOT NULL;

CREATE INDEX movimientos_inventario_dst_dep_idx ON movimientos_inventario (empresa_id, deposito_destino_id) WHERE deposito_destino_id IS NOT NULL;

CREATE TABLE movimiento_lineas (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid          NOT NULL REFERENCES empresas (id),
  movimiento_id           uuid          NOT NULL,                       
  producto_id            uuid          NOT NULL,                       
  cantidad              numeric(18,4) NOT NULL,                       
  lote_id                uuid,                                         
  fecha_vencimiento           date,                                         
  propiedad             text          NOT NULL DEFAULT 'PROPIO',      
  propietario_id              uuid,                                         
  creado_at            timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT movimiento_lineas_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT movimiento_lineas_cant_chk CHECK (cantidad > 0),                              
  CONSTRAINT movimiento_lineas_propiedad_chk CHECK (propiedad IN ('PROPIO','TERCERO')),   
  CONSTRAINT movimiento_lineas_propietario_chk CHECK (propiedad <> 'PROPIO' OR propietario_id IS NULL),
  CONSTRAINT movimiento_lineas_movimiento_fk FOREIGN KEY (empresa_id, movimiento_id) REFERENCES movimientos_inventario (empresa_id, id),
  CONSTRAINT movimiento_lineas_producto_fk  FOREIGN KEY (empresa_id, producto_id)  REFERENCES productos (empresa_id, id),
  CONSTRAINT movimiento_lineas_lote_fk      FOREIGN KEY (empresa_id, producto_id, lote_id) REFERENCES stock_lotes (empresa_id, producto_id, id)
);

CREATE INDEX movimiento_lineas_movimiento_idx ON movimiento_lineas (empresa_id, movimiento_id);

CREATE INDEX movimiento_lineas_producto_idx  ON movimiento_lineas (empresa_id, producto_id);

CREATE OR REPLACE FUNCTION movimientos_inventario_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'movimientos_inventario es inmutable: use el estado ANULADO en lugar de DELETE (movimiento %)', OLD.numero_movimiento
      USING ERRCODE = 'P0001';
  END IF;
  -- UPDATE: qualquer coluna que não seja estado/actualizado_at é imutável.
  IF (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at') THEN
    RAISE EXCEPTION 'movimientos_inventario es inmutable: solo el estado puede cambiar (movimiento %)', OLD.numero_movimiento
      USING ERRCODE = 'P0001';
  END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado AND NOT (OLD.estado = 'REGISTRADO' AND NEW.estado = 'ANULADO') THEN
    RAISE EXCEPTION 'transición de estado inválida: % -> % (solo REGISTRADO -> ANULADO)', OLD.estado, NEW.estado
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER movimientos_inventario_guard_trg
  BEFORE UPDATE OR DELETE ON movimientos_inventario
  FOR EACH ROW EXECUTE FUNCTION movimientos_inventario_guard();

CREATE OR REPLACE FUNCTION movimiento_lineas_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE s text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT estado INTO s FROM movimientos_inventario WHERE empresa_id = NEW.empresa_id AND id = NEW.movimiento_id;
    -- movimento inexistente / de outra empresa: não é com este guard; quem recusa é a FK composta (23503).
    IF FOUND AND s <> 'REGISTRADO' THEN
      RAISE EXCEPTION 'no se puede agregar una línea a un movimiento en estado %', s
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'movimiento_lineas es inmutable (% prohibido)', TG_OP USING ERRCODE = 'P0001';
END $$;

CREATE TRIGGER movimiento_lineas_guard_trg
  BEFORE INSERT OR UPDATE OR DELETE ON movimiento_lineas
  FOR EACH ROW EXECUTE FUNCTION movimiento_lineas_guard();

ALTER TABLE empresas
  ADD COLUMN moneda_base_codigo text NOT NULL DEFAULT 'PYG' REFERENCES monedas (codigo);

ALTER TABLE monedas
  ADD COLUMN decimales smallint CONSTRAINT monedas_minor_units_chk CHECK (decimales BETWEEN 0 AND 4);

CREATE TABLE inventario_costos (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        uuid          NOT NULL REFERENCES empresas (id),
  producto_id        uuid          NOT NULL,
  deposito_id      uuid          NOT NULL,
  cantidad_valorizada   numeric(18,4) NOT NULL DEFAULT 0,       
  valor_total       numeric(18,4) NOT NULL DEFAULT 0,       
  costo_promedio      numeric(18,4) NOT NULL DEFAULT 0,       
  creado_at        timestamptz   NOT NULL DEFAULT now(),
  actualizado_at        timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT inventario_costos_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT inventario_costos_natural_key UNIQUE (empresa_id, producto_id, deposito_id),
  CONSTRAINT inventario_costos_cant_chk   CHECK (cantidad_valorizada >= 0),
  CONSTRAINT inventario_costos_valor_chk CHECK (valor_total >= 0),
  CONSTRAINT inventario_costos_avg_chk   CHECK (costo_promedio >= 0),
  
  CONSTRAINT inventario_costos_cero_chk  CHECK (cantidad_valorizada > 0 OR valor_total = 0),
  CONSTRAINT inventario_costos_producto_fk   FOREIGN KEY (empresa_id, producto_id)   REFERENCES productos (empresa_id, id),
  CONSTRAINT inventario_costos_deposito_fk FOREIGN KEY (empresa_id, deposito_id) REFERENCES depositos (empresa_id, id)
);

CREATE INDEX inventario_costos_deposito_idx ON inventario_costos (empresa_id, deposito_id);

ALTER TABLE movimiento_lineas
  ADD COLUMN costo_unitario          numeric(18,4),
  ADD COLUMN costo_total         numeric(18,4),
  ADD COLUMN moneda_costo_codigo text REFERENCES monedas (codigo);

ALTER TABLE movimiento_lineas
  ADD CONSTRAINT movimiento_lineas_costo_chk CHECK (
    (costo_unitario IS NULL AND costo_total IS NULL AND moneda_costo_codigo IS NULL)
    OR (costo_unitario >= 0 AND costo_total >= 0 AND moneda_costo_codigo IS NOT NULL));

CREATE OR REPLACE FUNCTION costo_promedio_ponderado(prev_qty numeric, prev_value numeric, in_qty numeric, in_value numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN prev_qty + in_qty > 0 THEN round((prev_value + in_value) / (prev_qty + in_qty), 4) ELSE 0 END
$$;

CREATE OR REPLACE FUNCTION inventario_registrar_linea(
  p_empresa uuid, p_movimiento uuid, p_producto uuid, p_cantidad numeric,
  p_costo_unitario numeric DEFAULT NULL, p_lote uuid DEFAULT NULL,
  p_propiedad text DEFAULT 'PROPIO', p_propietario uuid DEFAULT NULL)
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
                                        costo_unitario, costo_total, moneda_costo_codigo)
    VALUES (p_empresa, p_movimiento, p_producto, p_cantidad, p_lote, p_propiedad, p_propietario,
            CASE WHEN v_valued THEN v_unit END, CASE WHEN v_valued THEN v_total END, CASE WHEN v_valued THEN base_cur END)
    RETURNING id INTO line_id;
  RETURN line_id;
END $$;

CREATE VIEW v_valoracion_stock WITH (security_invoker = true) AS
SELECT ic.empresa_id, w.sucursal_id, ic.deposito_id, w.codigo AS deposito_codigo, w.nombre AS deposito_nombre,
       ic.producto_id, p.codigo AS producto_codigo, p.descripcion AS producto_descripcion,
       ic.cantidad_valorizada, ic.costo_promedio, ic.valor_total, co.moneda_base_codigo AS moneda_codigo
  FROM inventario_costos ic
  JOIN depositos w ON w.empresa_id = ic.empresa_id AND w.id = ic.deposito_id
  JOIN productos   p ON p.empresa_id = ic.empresa_id AND p.id = ic.producto_id
  JOIN empresas co ON co.id = ic.empresa_id
 WHERE ic.cantidad_valorizada > 0;

CREATE VIEW v_conciliacion_costo_stock WITH (security_invoker = true) AS
SELECT ic.empresa_id, ic.producto_id, ic.deposito_id, ic.cantidad_valorizada,
       COALESCE(b.qty, 0) AS cantidad_saldo, ic.cantidad_valorizada - COALESCE(b.qty, 0) AS diferencia
  FROM inventario_costos ic
  LEFT JOIN (SELECT empresa_id, producto_id, deposito_id, sum(cantidad) AS qty
               FROM stock_saldos
              WHERE propiedad = 'PROPIO' AND estado_stock IN ('DISPONIBLE','RESERVADO','CUARENTENA')
              GROUP BY empresa_id, producto_id, deposito_id) b
         ON b.empresa_id = ic.empresa_id AND b.producto_id = ic.producto_id AND b.deposito_id = ic.deposito_id
 WHERE ic.cantidad_valorizada <> COALESCE(b.qty, 0);

SELECT nex_instalar_triggers_actualizacion();
