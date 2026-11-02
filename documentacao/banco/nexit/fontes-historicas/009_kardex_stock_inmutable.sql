-- ============================================================================
-- DistribuNex | Migration 009 - Kardex, existencias y unidades identificadas
-- Ejecutar DESPUÉS de 008_notas_credito_debito_fiscal.sql
-- ============================================================================
BEGIN;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '008') THEN
        RAISE EXCEPTION 'La migration 008 debe ejecutarse antes de la 009.';
    END IF;
END $$;

-- Cada movimiento define explícitamente el estado de stock que afecta. El
-- movimiento es el único origen del kardex; no se corrige borrándolo ni editándolo.
ALTER TABLE movimientos_stock
    ADD COLUMN IF NOT EXISTS estado_stock_origen varchar(20) NOT NULL DEFAULT 'DISPONIBLE'
        CHECK (estado_stock_origen IN ('DISPONIBLE','RESERVADO','CUARENTENA','TRANSITO')),
    ADD COLUMN IF NOT EXISTS estado_stock_destino varchar(20) NOT NULL DEFAULT 'DISPONIBLE'
        CHECK (estado_stock_destino IN ('DISPONIBLE','RESERVADO','CUARENTENA','TRANSITO')),
    ADD COLUMN IF NOT EXISTS aplicado_at timestamptz;

CREATE OR REPLACE FUNCTION fn_ajustar_existencia(
    p_producto_id uuid, p_propietario_id uuid, p_deposito_id uuid, p_ubicacion_id uuid,
    p_lote_id uuid, p_estado varchar, p_delta_fisica numeric(18,4), p_delta_reservada numeric(18,4)
)
RETURNS void AS $$
DECLARE v_id uuid; v_fisica numeric(18,4); v_reservada numeric(18,4); v_nueva_fisica numeric(18,4); v_nueva_reservada numeric(18,4);
BEGIN
    SELECT id, cantidad_fisica, cantidad_reservada INTO v_id, v_fisica, v_reservada
      FROM existencias
     WHERE producto_id = p_producto_id AND propietario_id = p_propietario_id AND deposito_id = p_deposito_id
       AND ubicacion_id IS NOT DISTINCT FROM p_ubicacion_id AND lote_id IS NOT DISTINCT FROM p_lote_id AND estado_stock = p_estado
     FOR UPDATE;

    IF NOT FOUND THEN
        IF p_delta_fisica < 0 OR p_delta_reservada < 0 OR p_delta_reservada > p_delta_fisica THEN
            RAISE EXCEPTION 'No existe stock suficiente para producto %, propietario %, depósito %.', p_producto_id, p_propietario_id, p_deposito_id;
        END IF;
        BEGIN
            INSERT INTO existencias (producto_id, propietario_id, deposito_id, ubicacion_id, lote_id, estado_stock, cantidad_fisica, cantidad_reservada)
            VALUES (p_producto_id, p_propietario_id, p_deposito_id, p_ubicacion_id, p_lote_id, p_estado, p_delta_fisica, p_delta_reservada);
        EXCEPTION WHEN unique_violation THEN
            -- Outra transação criou a mesma dimensão; reaplica sobre a linha já existente.
            PERFORM fn_ajustar_existencia(p_producto_id, p_propietario_id, p_deposito_id, p_ubicacion_id, p_lote_id, p_estado, p_delta_fisica, p_delta_reservada);
        END;
        RETURN;
    END IF;

    v_nueva_fisica := v_fisica + p_delta_fisica;
    v_nueva_reservada := v_reservada + p_delta_reservada;
    IF v_nueva_fisica < 0 OR v_nueva_reservada < 0 OR v_nueva_reservada > v_nueva_fisica THEN
        RAISE EXCEPTION 'El movimiento dejaría una existencia negativa o una reserva superior al stock físico.';
    END IF;
    UPDATE existencias SET cantidad_fisica = v_nueva_fisica, cantidad_reservada = v_nueva_reservada WHERE id = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_preparar_movimiento_stock_kardex()
RETURNS trigger AS $$
BEGIN
    IF NEW.tipo = 'CONTEO' THEN
        RAISE EXCEPTION 'El conteo no altera stock directamente; debe generar un AJUSTE_POSITIVO o AJUSTE_NEGATIVO aprobado.';
    END IF;
    IF NEW.tipo IN ('RESERVA_PEDIDO','LIBERACION_RESERVA') AND NEW.deposito_origen_id IS NULL THEN
        RAISE EXCEPTION 'La reserva o liberación requiere depósito origen.';
    END IF;
    IF NEW.tipo = 'RESERVA_PEDIDO' AND NEW.estado_stock_origen <> 'DISPONIBLE' THEN
        RAISE EXCEPTION 'Una reserva solo puede tomarse del stock DISPONIBLE.';
    END IF;
    IF NEW.tipo = 'LIBERACION_RESERVA' AND NEW.estado_stock_origen <> 'DISPONIBLE' THEN
        RAISE EXCEPTION 'Una liberación debe afectar el mismo stock DISPONIBLE reservado.';
    END IF;
    NEW.aplicado_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_aplicar_movimiento_stock_kardex()
RETURNS trigger AS $$
BEGIN
    CASE NEW.tipo
        WHEN 'INGRESO_COMPRA','INGRESO_TERCERO','AJUSTE_POSITIVO','DEVOLUCION_CLIENTE' THEN
            PERFORM fn_ajustar_existencia(NEW.producto_id, NEW.propietario_id, NEW.deposito_destino_id, NEW.ubicacion_destino_id, NEW.lote_id, NEW.estado_stock_destino, NEW.cantidad, 0);
        WHEN 'SALIDA_VENTA','SALIDA_TERCERO','AJUSTE_NEGATIVO','DEVOLUCION_PROVEEDOR' THEN
            PERFORM fn_ajustar_existencia(NEW.producto_id, NEW.propietario_id, NEW.deposito_origen_id, NEW.ubicacion_origen_id, NEW.lote_id, NEW.estado_stock_origen, -NEW.cantidad, 0);
        WHEN 'TRANSFERENCIA' THEN
            PERFORM fn_ajustar_existencia(NEW.producto_id, NEW.propietario_id, NEW.deposito_origen_id, NEW.ubicacion_origen_id, NEW.lote_id, NEW.estado_stock_origen, -NEW.cantidad, 0);
            PERFORM fn_ajustar_existencia(NEW.producto_id, NEW.propietario_id, NEW.deposito_destino_id, NEW.ubicacion_destino_id, NEW.lote_id, NEW.estado_stock_destino, NEW.cantidad, 0);
        WHEN 'RESERVA_PEDIDO' THEN
            PERFORM fn_ajustar_existencia(NEW.producto_id, NEW.propietario_id, NEW.deposito_origen_id, NEW.ubicacion_origen_id, NEW.lote_id, NEW.estado_stock_origen, 0, NEW.cantidad);
        WHEN 'LIBERACION_RESERVA' THEN
            PERFORM fn_ajustar_existencia(NEW.producto_id, NEW.propietario_id, NEW.deposito_origen_id, NEW.ubicacion_origen_id, NEW.lote_id, NEW.estado_stock_origen, 0, -NEW.cantidad);
        ELSE RAISE EXCEPTION 'Tipo de movimiento de stock no soportado: %.', NEW.tipo;
    END CASE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_actualizar_unidad_identificada_kardex()
RETURNS trigger AS $$
DECLARE v_estado varchar(20);
BEGIN
    IF NEW.unidad_id IS NULL THEN RETURN NEW; END IF;
    CASE NEW.tipo
        WHEN 'RESERVA_PEDIDO' THEN v_estado := 'RESERVADA';
        WHEN 'LIBERACION_RESERVA','INGRESO_COMPRA','INGRESO_TERCERO','AJUSTE_POSITIVO' THEN v_estado := 'DISPONIBLE';
        WHEN 'DEVOLUCION_CLIENTE' THEN v_estado := CASE WHEN NEW.estado_stock_destino = 'CUARENTENA' THEN 'CUARENTENA' ELSE 'DEVUELTA' END;
        WHEN 'SALIDA_VENTA','SALIDA_TERCERO','DEVOLUCION_PROVEEDOR','AJUSTE_NEGATIVO' THEN v_estado := 'DESPACHADA';
        WHEN 'TRANSFERENCIA' THEN v_estado := 'DISPONIBLE';
        ELSE RETURN NEW;
    END CASE;
    IF NEW.tipo IN ('INGRESO_COMPRA','INGRESO_TERCERO','AJUSTE_POSITIVO','DEVOLUCION_CLIENTE','TRANSFERENCIA') THEN
        UPDATE unidades_identificadas SET deposito_id = NEW.deposito_destino_id, ubicacion_id = NEW.ubicacion_destino_id, estado = v_estado WHERE id = NEW.unidad_id;
    ELSIF NEW.tipo IN ('SALIDA_VENTA','SALIDA_TERCERO','DEVOLUCION_PROVEEDOR','AJUSTE_NEGATIVO') THEN
        UPDATE unidades_identificadas SET deposito_id = NULL, ubicacion_id = NULL, estado = v_estado WHERE id = NEW.unidad_id;
    ELSE
        UPDATE unidades_identificadas SET estado = v_estado WHERE id = NEW.unidad_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_bloquear_modificacion_movimiento_stock()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'El kardex es inmutable. Corrija el stock creando un movimiento compensatorio, nunca editando o eliminando uno existente.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_movimientos_stock_preparar_kardex BEFORE INSERT ON movimientos_stock FOR EACH ROW EXECUTE FUNCTION trg_preparar_movimiento_stock_kardex();
CREATE TRIGGER trg_movimientos_stock_aplicar_kardex AFTER INSERT ON movimientos_stock FOR EACH ROW EXECUTE FUNCTION trg_aplicar_movimiento_stock_kardex();
CREATE TRIGGER trg_movimientos_stock_unidad_kardex AFTER INSERT ON movimientos_stock FOR EACH ROW EXECUTE FUNCTION trg_actualizar_unidad_identificada_kardex();
CREATE TRIGGER trg_movimientos_stock_inmutable BEFORE UPDATE OR DELETE ON movimientos_stock FOR EACH ROW EXECUTE FUNCTION trg_bloquear_modificacion_movimiento_stock();

CREATE INDEX IF NOT EXISTS ix_existencias_disponibles ON existencias (producto_id, propietario_id, deposito_id, estado_stock)
    WHERE cantidad_fisica > cantidad_reservada;
CREATE INDEX IF NOT EXISTS ix_movimientos_stock_documento ON movimientos_stock (documento_tipo, documento_id, created_at DESC)
    WHERE documento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_movimientos_stock_aplicado ON movimientos_stock (empresa_id, aplicado_at DESC);

INSERT INTO schema_migrations (version, description)
VALUES ('009', 'Kardex inmutable, actualización de existencias y unidades identificadas')
ON CONFLICT (version) DO NOTHING;
COMMIT;