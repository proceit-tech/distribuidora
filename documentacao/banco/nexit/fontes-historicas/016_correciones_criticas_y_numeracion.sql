-- ============================================================================
-- DistribuNex | Migration 016 - Correcciones críticas y numeración atómica
-- Ejecutar DESPUÉS de 015_comercial_cotizaciones_promociones.sql
-- ============================================================================
BEGIN;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '015') THEN
        RAISE EXCEPTION 'La migration 015 debe ejecutarse antes de la 016.';
    END IF;
END $$;

-- depósitos pertenecen a una empresa a través de su sucursal. Esta función
-- evita referencias inválidas a una columna empresa_id inexistente en depósitos.
CREATE OR REPLACE FUNCTION fn_deposito_pertenece_empresa(p_deposito_id uuid, p_empresa_id uuid)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM depositos d
        JOIN sucursales s ON s.id = d.sucursal_id
        WHERE d.id = p_deposito_id AND s.empresa_id = p_empresa_id
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Reserva la siguiente numeración dentro de la misma transacción. Nunca se
-- calcula con MAX(numero), por lo que dos usuarios no reciben el mismo número.
CREATE OR REPLACE FUNCTION fn_tomar_siguiente_numero(
    p_empresa_id uuid, p_sucursal_id uuid, p_tipo_documento varchar
)
RETURNS bigint AS $$
DECLARE v_numero bigint;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM empresas WHERE id = p_empresa_id AND activo) THEN
        RAISE EXCEPTION 'La empresa indicada no existe o está inactiva.';
    END IF;
    IF p_sucursal_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM sucursales WHERE id = p_sucursal_id AND empresa_id = p_empresa_id AND activo
    ) THEN
        RAISE EXCEPTION 'La sucursal indicada no pertenece a la empresa o está inactiva.';
    END IF;

    IF p_sucursal_id IS NOT NULL THEN
        UPDATE numeraciones_documento
           SET proximo_numero = proximo_numero + 1
         WHERE empresa_id = p_empresa_id
           AND sucursal_id = p_sucursal_id
           AND tipo_documento = p_tipo_documento
           AND activo
         RETURNING proximo_numero - 1 INTO v_numero;
        IF FOUND THEN RETURN v_numero; END IF;
    END IF;

    UPDATE numeraciones_documento
       SET proximo_numero = proximo_numero + 1
     WHERE empresa_id = p_empresa_id
       AND sucursal_id IS NULL
       AND tipo_documento = p_tipo_documento
       AND activo
     RETURNING proximo_numero - 1 INTO v_numero;
    IF FOUND THEN RETURN v_numero; END IF;

    RAISE EXCEPTION 'No existe una numeración activa para %, empresa % y sucursal %.',
        p_tipo_documento, p_empresa_id, COALESCE(p_sucursal_id::text, 'GENERAL');
END;
$$ LANGUAGE plpgsql;

-- Sustituye validaciones de 010 que usaban depósitos.empresa_id.
CREATE OR REPLACE FUNCTION trg_validar_recepcion_compra_integridad()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = NEW.sucursal_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'La sucursal de la recepción debe pertenecer a la misma empresa.'; END IF;
    IF NOT fn_deposito_pertenece_empresa(NEW.deposito_id, NEW.empresa_id) THEN RAISE EXCEPTION 'El depósito de la recepción debe pertenecer a la misma empresa.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM proveedores WHERE id = NEW.proveedor_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El proveedor de la recepción debe pertenecer a la misma empresa.'; END IF;
    IF NEW.orden_compra_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ordenes_compra WHERE id = NEW.orden_compra_id AND empresa_id = NEW.empresa_id AND proveedor_id = NEW.proveedor_id) THEN RAISE EXCEPTION 'La orden de compra debe pertenecer a la misma empresa y proveedor.'; END IF;
    IF NEW.recibido_por IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.recibido_por AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El receptor debe pertenecer a la misma empresa.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_devolucion_cliente_integridad()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = NEW.sucursal_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'La sucursal debe pertenecer a la misma empresa.'; END IF;
    IF NOT fn_deposito_pertenece_empresa(NEW.deposito_id, NEW.empresa_id) THEN RAISE EXCEPTION 'El depósito debe pertenecer a la misma empresa.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM clientes WHERE id = NEW.cliente_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El cliente debe pertenecer a la misma empresa.'; END IF;
    IF NEW.venta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ventas WHERE id = NEW.venta_id AND empresa_id = NEW.empresa_id AND cliente_id = NEW.cliente_id) THEN RAISE EXCEPTION 'La venta debe pertenecer a la misma empresa y cliente.'; END IF;
    IF NEW.entrega_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM entregas WHERE id = NEW.entrega_id AND empresa_id = NEW.empresa_id AND cliente_id = NEW.cliente_id) THEN RAISE EXCEPTION 'La entrega debe pertenecer a la misma empresa y cliente.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_transferencia_stock_integridad()
RETURNS trigger AS $$
BEGIN
    IF NOT fn_deposito_pertenece_empresa(NEW.deposito_origen_id, NEW.empresa_id)
       OR NOT fn_deposito_pertenece_empresa(NEW.deposito_destino_id, NEW.empresa_id) THEN
        RAISE EXCEPTION 'Los depósitos de la transferencia deben pertenecer a la misma empresa.';
    END IF;
    IF NEW.creado_por IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.creado_por AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El creador debe pertenecer a la misma empresa.'; END IF;
    IF NEW.recibido_por IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.recibido_por AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El receptor debe pertenecer a la misma empresa.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_devolucion_proveedor_integridad()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = NEW.sucursal_id AND empresa_id = NEW.empresa_id)
       OR NOT fn_deposito_pertenece_empresa(NEW.deposito_id, NEW.empresa_id)
       OR NOT EXISTS (SELECT 1 FROM proveedores WHERE id = NEW.proveedor_id AND empresa_id = NEW.empresa_id) THEN
        RAISE EXCEPTION 'Sucursal, depósito y proveedor de la devolución deben pertenecer a la misma empresa.';
    END IF;
    IF NEW.recepcion_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM recepciones_compra WHERE id = NEW.recepcion_id AND empresa_id = NEW.empresa_id AND proveedor_id = NEW.proveedor_id) THEN
        RAISE EXCEPTION 'La recepción debe pertenecer a la misma empresa y proveedor.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Sustituye validaciones de 011 por la misma regla de pertenencia de depósito.
CREATE OR REPLACE FUNCTION trg_validar_producto_logistica()
RETURNS trigger AS $$
BEGIN
    IF NEW.deposito_predeterminado_id IS NOT NULL
       AND NOT fn_deposito_pertenece_empresa(NEW.deposito_predeterminado_id, NEW.empresa_id) THEN
        RAISE EXCEPTION 'El depósito predeterminado debe pertenecer a la misma empresa.';
    END IF;
    IF NEW.ubicacion_predeterminada_id IS NOT NULL THEN
        PERFORM fn_validar_ubicacion_deposito(NEW.ubicacion_predeterminada_id, NEW.deposito_predeterminado_id, 'ubicación predeterminada del producto');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_espacio_almacenamiento()
RETURNS trigger AS $$
BEGIN
    IF NOT fn_deposito_pertenece_empresa(NEW.deposito_id, NEW.empresa_id) THEN
        RAISE EXCEPTION 'El depósito del espacio debe pertenecer a la misma empresa.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_contrato_almacenamiento()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM clientes WHERE id = NEW.cliente_id AND empresa_id = NEW.empresa_id)
       OR NOT fn_deposito_pertenece_empresa(NEW.deposito_id, NEW.empresa_id) THEN
        RAISE EXCEPTION 'Cliente y depósito del contrato deben pertenecer a la misma empresa.';
    END IF;
    IF NEW.estado = 'ACTIVO' AND NEW.propietario_id IS NULL THEN RAISE EXCEPTION 'Un contrato activo debe indicar el propietario de stock del cliente.'; END IF;
    IF NEW.propietario_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM propietarios_stock WHERE id = NEW.propietario_id AND cliente_id = NEW.cliente_id) THEN RAISE EXCEPTION 'El propietario del contrato debe corresponder al cliente.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_orden_picking()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = NEW.sucursal_id AND empresa_id = NEW.empresa_id)
       OR NOT fn_deposito_pertenece_empresa(NEW.deposito_id, NEW.empresa_id) THEN
        RAISE EXCEPTION 'Sucursal y depósito del picking deben pertenecer a la misma empresa.';
    END IF;
    IF NEW.pedido_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pedidos WHERE id = NEW.pedido_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El pedido debe pertenecer a la misma empresa.'; END IF;
    IF NEW.venta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ventas WHERE id = NEW.venta_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'La venta debe pertenecer a la misma empresa.'; END IF;
    IF NEW.preparado_por IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.preparado_por AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El preparador debe pertenecer a la misma empresa.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Uma unidade etiquetada só pode sair, reservar ou transferir a partir da sua
-- posição física atual. A entrada inicial deve usar etiqueta sem depósito.
CREATE OR REPLACE FUNCTION trg_validar_unidad_identificada_en_movimiento()
RETURNS trigger AS $$
DECLARE v_producto uuid; v_propietario uuid; v_deposito uuid; v_ubicacion uuid; v_estado varchar(20);
BEGIN
    IF NEW.unidad_id IS NULL THEN RETURN NEW; END IF;
    SELECT producto_id, propietario_id, deposito_id, ubicacion_id, estado
      INTO v_producto, v_propietario, v_deposito, v_ubicacion, v_estado
      FROM unidades_identificadas WHERE id = NEW.unidad_id FOR UPDATE;
    IF NOT FOUND OR v_producto <> NEW.producto_id OR v_propietario <> NEW.propietario_id THEN
        RAISE EXCEPTION 'La unidad identificada no corresponde al producto y propietario del movimiento.';
    END IF;
    IF NEW.tipo IN ('SALIDA_VENTA','SALIDA_TERCERO','DEVOLUCION_PROVEEDOR','AJUSTE_NEGATIVO','TRANSFERENCIA','RESERVA_PEDIDO','LIBERACION_RESERVA') THEN
        IF v_deposito IS DISTINCT FROM NEW.deposito_origen_id OR v_ubicacion IS DISTINCT FROM NEW.ubicacion_origen_id THEN
            RAISE EXCEPTION 'La unidad etiquetada no está en el depósito y ubicación de origen informados.';
        END IF;
    END IF;
    IF NEW.tipo = 'RESERVA_PEDIDO' AND v_estado <> 'DISPONIBLE' THEN RAISE EXCEPTION 'Solo una unidad DISPONIBLE puede reservarse.'; END IF;
    IF NEW.tipo = 'LIBERACION_RESERVA' AND v_estado <> 'RESERVADA' THEN RAISE EXCEPTION 'Solo una unidad RESERVADA puede liberarse.'; END IF;
    IF NEW.tipo = 'TRANSFERENCIA' AND v_estado <> 'DISPONIBLE' THEN RAISE EXCEPTION 'Libere la reserva antes de transferir una unidad etiquetada.'; END IF;
    IF NEW.tipo IN ('INGRESO_COMPRA','INGRESO_TERCERO','AJUSTE_POSITIVO') AND v_deposito IS NOT NULL THEN
        RAISE EXCEPTION 'La unidad de ingreso ya posee ubicación; no puede ingresarse dos veces.';
    END IF;
    IF NEW.tipo = 'DEVOLUCION_CLIENTE' AND v_estado <> 'DESPACHADA' THEN
        RAISE EXCEPTION 'Una devolución de cliente por etiqueta requiere una unidad previamente despachada.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_movimientos_stock_validar_unidad_posicion
BEFORE INSERT ON movimientos_stock
FOR EACH ROW EXECUTE FUNCTION trg_validar_unidad_identificada_en_movimiento();

COMMENT ON FUNCTION fn_tomar_siguiente_numero(uuid, uuid, varchar) IS
    'Debe ser llamada por el servicio dentro de la misma transacción que crea el documento.';

INSERT INTO schema_migrations (version, description)
VALUES ('016', 'Correcciones de depósitos, numeración atómica y trazabilidad de unidades etiquetadas')
ON CONFLICT (version) DO NOTHING;
COMMIT;