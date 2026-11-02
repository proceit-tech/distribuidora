-- ============================================================================
-- DistribuNex | Migration 010 - Integridad comercial y flujos de stock
-- Ejecutar DESPUÉS de 009_kardex_stock_inmutable.sql
-- ============================================================================
BEGIN;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '009') THEN
        RAISE EXCEPTION 'La migration 009 debe ejecutarse antes de la 010.';
    END IF;
END $$;

-- Chave idempotente para que a aplicação possa repetir uma operação após uma
-- falha de rede sem duplicar o movimento físico no kardex.
ALTER TABLE movimientos_stock ADD COLUMN IF NOT EXISTS idempotency_key varchar(150);
CREATE UNIQUE INDEX IF NOT EXISTS ux_movimientos_stock_idempotencia
    ON movimientos_stock (empresa_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION trg_validar_recepcion_compra_integridad()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = NEW.sucursal_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'La sucursal de la recepción debe pertenecer a la misma empresa.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM depositos WHERE id = NEW.deposito_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El depósito de la recepción debe pertenecer a la misma empresa.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM proveedores WHERE id = NEW.proveedor_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El proveedor de la recepción debe pertenecer a la misma empresa.'; END IF;
    IF NEW.orden_compra_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ordenes_compra WHERE id = NEW.orden_compra_id AND empresa_id = NEW.empresa_id AND proveedor_id = NEW.proveedor_id) THEN RAISE EXCEPTION 'La orden de compra debe pertenecer a la misma empresa y proveedor.'; END IF;
    IF NEW.recibido_por IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.recibido_por AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El receptor debe pertenecer a la misma empresa.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_orden_compra_integridad()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = NEW.sucursal_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'La sucursal de la orden debe pertenecer a la misma empresa.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM proveedores WHERE id = NEW.proveedor_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El proveedor de la orden debe pertenecer a la misma empresa.'; END IF;
    IF NEW.solicitud_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM solicitudes_compra WHERE id = NEW.solicitud_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'La solicitud de compra debe pertenecer a la misma empresa.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_orden_compra_linea_integridad()
RETURNS trigger AS $$
DECLARE e uuid;
BEGIN
    SELECT empresa_id INTO e FROM ordenes_compra WHERE id = NEW.orden_compra_id;
    IF e IS NULL OR NOT EXISTS (SELECT 1 FROM productos WHERE id = NEW.producto_id AND empresa_id = e) THEN RAISE EXCEPTION 'El producto de la orden debe pertenecer a la misma empresa.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_recepcion_compra_linea_integridad()
RETURNS trigger AS $$
DECLARE e uuid; d uuid; o uuid; p uuid;
BEGIN
    SELECT empresa_id, deposito_id, orden_compra_id INTO e, d, o FROM recepciones_compra WHERE id = NEW.recepcion_id;
    IF e IS NULL OR NOT EXISTS (SELECT 1 FROM productos WHERE id = NEW.producto_id AND empresa_id = e) THEN RAISE EXCEPTION 'El producto de la recepción debe pertenecer a la misma empresa.'; END IF;
    IF NEW.ubicacion_id IS NOT NULL THEN PERFORM fn_validar_ubicacion_deposito(NEW.ubicacion_id, d, 'línea de recepción'); END IF;
    IF NEW.orden_linea_id IS NOT NULL THEN
        SELECT producto_id INTO p FROM orden_compra_lineas WHERE id = NEW.orden_linea_id AND orden_compra_id = o;
        IF p IS NULL OR p <> NEW.producto_id THEN RAISE EXCEPTION 'La línea de orden debe pertenecer a la orden de la recepción y corresponder al producto.'; END IF;
    END IF;
    IF NEW.lote_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lotes_stock WHERE id = NEW.lote_id AND producto_id = NEW.producto_id) THEN RAISE EXCEPTION 'El lote debe corresponder al producto recibido.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_entrega_integridad()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = NEW.sucursal_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'La sucursal de la entrega debe pertenecer a la misma empresa.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM clientes WHERE id = NEW.cliente_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El cliente de la entrega debe pertenecer a la misma empresa.'; END IF;
    IF NEW.pedido_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pedidos WHERE id = NEW.pedido_id AND empresa_id = NEW.empresa_id AND cliente_id = NEW.cliente_id) THEN RAISE EXCEPTION 'El pedido debe pertenecer a la misma empresa y cliente.'; END IF;
    IF NEW.venta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ventas WHERE id = NEW.venta_id AND empresa_id = NEW.empresa_id AND cliente_id = NEW.cliente_id) THEN RAISE EXCEPTION 'La venta debe pertenecer a la misma empresa y cliente.'; END IF;
    IF NEW.direccion_entrega_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM direcciones_cliente WHERE id = NEW.direccion_entrega_id AND cliente_id = NEW.cliente_id) THEN RAISE EXCEPTION 'La dirección debe pertenecer al cliente de la entrega.'; END IF;
    IF NEW.hoja_ruta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM hojas_ruta WHERE id = NEW.hoja_ruta_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'La hoja de ruta debe pertenecer a la misma empresa.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_entrega_linea_integridad()
RETURNS trigger AS $$
DECLARE ep uuid; ev uuid; pp uuid; pv uuid; e uuid;
BEGIN
    SELECT pedido_id, venta_id, empresa_id INTO ep, ev, e FROM entregas WHERE id = NEW.entrega_id;
    IF NOT EXISTS (SELECT 1 FROM productos WHERE id = NEW.producto_id AND empresa_id = e) THEN RAISE EXCEPTION 'El producto de la entrega debe pertenecer a la misma empresa.'; END IF;
    IF NEW.pedido_linea_id IS NOT NULL THEN
        SELECT producto_id INTO pp FROM pedido_lineas WHERE id = NEW.pedido_linea_id AND pedido_id = ep;
        IF pp IS NULL OR pp <> NEW.producto_id THEN RAISE EXCEPTION 'La línea de pedido debe pertenecer al pedido de la entrega y corresponder al producto.'; END IF;
    END IF;
    IF NEW.venta_linea_id IS NOT NULL THEN
        SELECT producto_id INTO pv FROM venta_lineas WHERE id = NEW.venta_linea_id AND venta_id = ev;
        IF pv IS NULL OR pv <> NEW.producto_id THEN RAISE EXCEPTION 'La línea de venta debe pertenecer a la venta de la entrega y corresponder al producto.'; END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_devolucion_cliente_integridad()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = NEW.sucursal_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'La sucursal debe pertenecer a la misma empresa.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM depositos WHERE id = NEW.deposito_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El depósito debe pertenecer a la misma empresa.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM clientes WHERE id = NEW.cliente_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El cliente debe pertenecer a la misma empresa.'; END IF;
    IF NEW.venta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ventas WHERE id = NEW.venta_id AND empresa_id = NEW.empresa_id AND cliente_id = NEW.cliente_id) THEN RAISE EXCEPTION 'La venta debe pertenecer a la misma empresa y cliente.'; END IF;
    IF NEW.entrega_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM entregas WHERE id = NEW.entrega_id AND empresa_id = NEW.empresa_id AND cliente_id = NEW.cliente_id) THEN RAISE EXCEPTION 'La entrega debe pertenecer a la misma empresa y cliente.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_devolucion_cliente_linea_integridad()
RETURNS trigger AS $$
DECLARE v uuid; e uuid; p uuid; d uuid;
BEGIN
    SELECT venta_id, empresa_id, deposito_id INTO v, e, d FROM devoluciones_cliente WHERE id = NEW.devolucion_id;
    IF NOT EXISTS (SELECT 1 FROM productos WHERE id = NEW.producto_id AND empresa_id = e) THEN RAISE EXCEPTION 'El producto de la devolución debe pertenecer a la misma empresa.'; END IF;
    IF NEW.venta_linea_id IS NOT NULL THEN
        SELECT producto_id INTO p FROM venta_lineas WHERE id = NEW.venta_linea_id AND venta_id = v;
        IF p IS NULL OR p <> NEW.producto_id THEN RAISE EXCEPTION 'La línea de venta debe corresponder a la venta y producto de la devolución.'; END IF;
    END IF;
    IF NEW.ubicacion_id IS NOT NULL THEN PERFORM fn_validar_ubicacion_deposito(NEW.ubicacion_id, d, 'línea de devolución cliente'); END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_reserva_stock_integridad()
RETURNS trigger AS $$
DECLARE e uuid; p uuid;
BEGIN
    SELECT pe.empresa_id, pl.producto_id INTO e, p FROM pedido_lineas pl JOIN pedidos pe ON pe.id = pl.pedido_id WHERE pl.id = NEW.pedido_linea_id;
    IF e IS NULL OR e <> NEW.empresa_id OR p <> NEW.producto_id THEN RAISE EXCEPTION 'La reserva debe corresponder a la empresa y producto de la línea de pedido.'; END IF;
    IF fn_empresa_propietario_stock(NEW.propietario_id) <> NEW.empresa_id OR fn_empresa_deposito(NEW.deposito_id) <> NEW.empresa_id THEN RAISE EXCEPTION 'El propietario y depósito de la reserva deben pertenecer a la misma empresa.'; END IF;
    PERFORM fn_validar_ubicacion_deposito(NEW.ubicacion_id, NEW.deposito_id, 'reserva de stock');
    IF NEW.lote_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lotes_stock WHERE id = NEW.lote_id AND producto_id = NEW.producto_id AND propietario_id = NEW.propietario_id) THEN RAISE EXCEPTION 'El lote de la reserva no corresponde al producto y propietario.'; END IF;
    IF NEW.unidad_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM unidades_identificadas WHERE id = NEW.unidad_id AND producto_id = NEW.producto_id AND propietario_id = NEW.propietario_id) THEN RAISE EXCEPTION 'La unidad identificada no corresponde al producto y propietario.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_transferencia_stock_integridad()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM depositos WHERE id = NEW.deposito_origen_id AND empresa_id = NEW.empresa_id) OR NOT EXISTS (SELECT 1 FROM depositos WHERE id = NEW.deposito_destino_id AND empresa_id = NEW.empresa_id) THEN
        RAISE EXCEPTION 'Los depósitos de la transferencia deben pertenecer a la misma empresa.';
    END IF;
    IF NEW.creado_por IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.creado_por AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El creador debe pertenecer a la misma empresa.'; END IF;
    IF NEW.recibido_por IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.recibido_por AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El receptor debe pertenecer a la misma empresa.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_transferencia_stock_linea_integridad()
RETURNS trigger AS $$
DECLARE e uuid; do_id uuid; dd_id uuid;
BEGIN
    SELECT empresa_id, deposito_origen_id, deposito_destino_id INTO e, do_id, dd_id FROM transferencias_stock WHERE id = NEW.transferencia_id;
    IF e IS NULL OR NOT EXISTS (SELECT 1 FROM productos WHERE id = NEW.producto_id AND empresa_id = e) OR fn_empresa_propietario_stock(NEW.propietario_id) <> e THEN RAISE EXCEPTION 'Producto y propietario deben pertenecer a la empresa de la transferencia.'; END IF;
    PERFORM fn_validar_ubicacion_deposito(NEW.ubicacion_origen_id, do_id, 'línea transferencia origen');
    PERFORM fn_validar_ubicacion_deposito(NEW.ubicacion_destino_id, dd_id, 'línea transferencia destino');
    IF NEW.lote_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lotes_stock WHERE id = NEW.lote_id AND producto_id = NEW.producto_id AND propietario_id = NEW.propietario_id) THEN RAISE EXCEPTION 'El lote no corresponde al producto y propietario.'; END IF;
    IF NEW.unidad_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM unidades_identificadas WHERE id = NEW.unidad_id AND producto_id = NEW.producto_id AND propietario_id = NEW.propietario_id) THEN RAISE EXCEPTION 'La unidad no corresponde al producto y propietario.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_conteo_ajuste_linea_integridad()
RETURNS trigger AS $$
DECLARE e uuid; d uuid;
BEGIN
    IF TG_TABLE_NAME = 'conteo_inventario_lineas' THEN
        SELECT empresa_id, deposito_id INTO e, d FROM conteos_inventario WHERE id = NEW.conteo_id;
    ELSE
        SELECT empresa_id, deposito_id INTO e, d FROM ajustes_stock WHERE id = NEW.ajuste_id;
    END IF;
    IF e IS NULL OR NOT EXISTS (SELECT 1 FROM productos WHERE id = NEW.producto_id AND empresa_id = e) OR fn_empresa_propietario_stock(NEW.propietario_id) <> e THEN RAISE EXCEPTION 'Producto y propietario deben pertenecer a la empresa del inventario.'; END IF;
    PERFORM fn_validar_ubicacion_deposito(NEW.ubicacion_id, d, 'línea de conteo o ajuste');
    IF NEW.lote_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lotes_stock WHERE id = NEW.lote_id AND producto_id = NEW.producto_id AND propietario_id = NEW.propietario_id) THEN RAISE EXCEPTION 'El lote no corresponde al producto y propietario.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_factura_proveedor_recepcion_integridad()
RETURNS trigger AS $$
DECLARE ef uuid; pf uuid; er uuid; pr uuid;
BEGIN
    SELECT empresa_id, proveedor_id INTO ef, pf FROM facturas_proveedor WHERE id = NEW.factura_proveedor_id;
    SELECT empresa_id, proveedor_id INTO er, pr FROM recepciones_compra WHERE id = NEW.recepcion_id;
    IF ef IS NULL OR er IS NULL OR ef <> er OR pf <> pr THEN RAISE EXCEPTION 'Factura y recepción deben pertenecer a la misma empresa y proveedor.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_devolucion_proveedor_integridad()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = NEW.sucursal_id AND empresa_id = NEW.empresa_id) OR NOT EXISTS (SELECT 1 FROM depositos WHERE id = NEW.deposito_id AND empresa_id = NEW.empresa_id) OR NOT EXISTS (SELECT 1 FROM proveedores WHERE id = NEW.proveedor_id AND empresa_id = NEW.empresa_id) THEN
        RAISE EXCEPTION 'Sucursal, depósito y proveedor de la devolución deben pertenecer a la misma empresa.';
    END IF;
    IF NEW.recepcion_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM recepciones_compra WHERE id = NEW.recepcion_id AND empresa_id = NEW.empresa_id AND proveedor_id = NEW.proveedor_id) THEN
        RAISE EXCEPTION 'La recepción debe pertenecer a la misma empresa y proveedor.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_devolucion_proveedor_linea_integridad()
RETURNS trigger AS $$
DECLARE e uuid; r uuid; p uuid; d uuid;
BEGIN
    SELECT empresa_id, recepcion_id, deposito_id INTO e, r, d FROM devoluciones_proveedor WHERE id = NEW.devolucion_id;
    IF e IS NULL OR NOT EXISTS (SELECT 1 FROM productos WHERE id = NEW.producto_id AND empresa_id = e) THEN RAISE EXCEPTION 'El producto de la devolución debe pertenecer a la misma empresa.'; END IF;
    IF NEW.recepcion_linea_id IS NOT NULL THEN SELECT producto_id INTO p FROM recepcion_compra_lineas WHERE id = NEW.recepcion_linea_id AND recepcion_id = r; IF p IS NULL OR p <> NEW.producto_id THEN RAISE EXCEPTION 'La línea de recepción no corresponde a la devolución y producto.'; END IF; END IF;
    IF NEW.ubicacion_id IS NOT NULL THEN PERFORM fn_validar_ubicacion_deposito(NEW.ubicacion_id, d, 'línea de devolución proveedor'); END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_linea_nota_credito_integridad()
RETURNS trigger AS $$
DECLARE v uuid; d uuid; p uuid; e uuid;
BEGIN
    SELECT venta_id, devolucion_cliente_id, empresa_id INTO v, d, e FROM notas_credito_cliente WHERE id = NEW.nota_credito_id;
    IF NOT EXISTS (SELECT 1 FROM productos WHERE id = NEW.producto_id AND empresa_id = e) THEN RAISE EXCEPTION 'El producto de la nota de crédito debe pertenecer a la misma empresa.'; END IF;
    IF NEW.venta_linea_id IS NOT NULL THEN SELECT producto_id INTO p FROM venta_lineas WHERE id = NEW.venta_linea_id AND venta_id = v; IF p IS NULL OR p <> NEW.producto_id THEN RAISE EXCEPTION 'La línea de venta no corresponde a la nota de crédito.'; END IF; END IF;
    IF NEW.devolucion_linea_id IS NOT NULL THEN SELECT producto_id INTO p FROM devolucion_cliente_lineas WHERE id = NEW.devolucion_linea_id AND devolucion_id = d; IF p IS NULL OR p <> NEW.producto_id THEN RAISE EXCEPTION 'La línea de devolución no corresponde a la nota de crédito.'; END IF; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_linea_nota_debito_integridad()
RETURNS trigger AS $$
DECLARE v uuid; p uuid; e uuid;
BEGIN
    SELECT venta_id, empresa_id INTO v, e FROM notas_debito_cliente WHERE id = NEW.nota_debito_id;
    IF NOT EXISTS (SELECT 1 FROM productos WHERE id = NEW.producto_id AND empresa_id = e) THEN RAISE EXCEPTION 'El producto de la nota de débito debe pertenecer a la misma empresa.'; END IF;
    IF NEW.venta_linea_id IS NOT NULL THEN SELECT producto_id INTO p FROM venta_lineas WHERE id = NEW.venta_linea_id AND venta_id = v; IF p IS NULL OR p <> NEW.producto_id THEN RAISE EXCEPTION 'La línea de venta no corresponde a la nota de débito.'; END IF; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ordenes_compra_validar_integridad BEFORE INSERT OR UPDATE ON ordenes_compra FOR EACH ROW EXECUTE FUNCTION trg_validar_orden_compra_integridad();
CREATE TRIGGER trg_orden_compra_lineas_validar_integridad BEFORE INSERT OR UPDATE ON orden_compra_lineas FOR EACH ROW EXECUTE FUNCTION trg_validar_orden_compra_linea_integridad();
CREATE TRIGGER trg_recepciones_compra_validar_integridad BEFORE INSERT OR UPDATE ON recepciones_compra FOR EACH ROW EXECUTE FUNCTION trg_validar_recepcion_compra_integridad();
CREATE TRIGGER trg_recepcion_compra_lineas_validar_integridad BEFORE INSERT OR UPDATE ON recepcion_compra_lineas FOR EACH ROW EXECUTE FUNCTION trg_validar_recepcion_compra_linea_integridad();
CREATE TRIGGER trg_factura_proveedor_recepciones_validar_integridad BEFORE INSERT OR UPDATE ON factura_proveedor_recepciones FOR EACH ROW EXECUTE FUNCTION trg_validar_factura_proveedor_recepcion_integridad();
CREATE TRIGGER trg_devoluciones_proveedor_validar_integridad BEFORE INSERT OR UPDATE ON devoluciones_proveedor FOR EACH ROW EXECUTE FUNCTION trg_validar_devolucion_proveedor_integridad();
CREATE TRIGGER trg_devolucion_proveedor_lineas_validar_integridad BEFORE INSERT OR UPDATE ON devolucion_proveedor_lineas FOR EACH ROW EXECUTE FUNCTION trg_validar_devolucion_proveedor_linea_integridad();
CREATE TRIGGER trg_entregas_validar_integridad BEFORE INSERT OR UPDATE ON entregas FOR EACH ROW EXECUTE FUNCTION trg_validar_entrega_integridad();
CREATE TRIGGER trg_entrega_lineas_validar_integridad BEFORE INSERT OR UPDATE ON entrega_lineas FOR EACH ROW EXECUTE FUNCTION trg_validar_entrega_linea_integridad();
CREATE TRIGGER trg_devoluciones_cliente_validar_integridad BEFORE INSERT OR UPDATE ON devoluciones_cliente FOR EACH ROW EXECUTE FUNCTION trg_validar_devolucion_cliente_integridad();
CREATE TRIGGER trg_devolucion_cliente_lineas_validar_integridad BEFORE INSERT OR UPDATE ON devolucion_cliente_lineas FOR EACH ROW EXECUTE FUNCTION trg_validar_devolucion_cliente_linea_integridad();
CREATE TRIGGER trg_reservas_stock_validar_integridad BEFORE INSERT OR UPDATE ON reservas_stock FOR EACH ROW EXECUTE FUNCTION trg_validar_reserva_stock_integridad();
CREATE TRIGGER trg_transferencias_stock_validar_integridad BEFORE INSERT OR UPDATE ON transferencias_stock FOR EACH ROW EXECUTE FUNCTION trg_validar_transferencia_stock_integridad();
CREATE TRIGGER trg_transferencia_stock_lineas_validar_integridad BEFORE INSERT OR UPDATE ON transferencia_stock_lineas FOR EACH ROW EXECUTE FUNCTION trg_validar_transferencia_stock_linea_integridad();
CREATE TRIGGER trg_conteo_inventario_lineas_validar_integridad BEFORE INSERT OR UPDATE ON conteo_inventario_lineas FOR EACH ROW EXECUTE FUNCTION trg_validar_conteo_ajuste_linea_integridad();
CREATE TRIGGER trg_ajuste_stock_lineas_validar_integridad BEFORE INSERT OR UPDATE ON ajuste_stock_lineas FOR EACH ROW EXECUTE FUNCTION trg_validar_conteo_ajuste_linea_integridad();
CREATE TRIGGER trg_nota_credito_lineas_validar_integridad BEFORE INSERT OR UPDATE ON nota_credito_cliente_lineas FOR EACH ROW EXECUTE FUNCTION trg_validar_linea_nota_credito_integridad();
CREATE TRIGGER trg_nota_debito_lineas_validar_integridad BEFORE INSERT OR UPDATE ON nota_debito_cliente_lineas FOR EACH ROW EXECUTE FUNCTION trg_validar_linea_nota_debito_integridad();

CREATE INDEX IF NOT EXISTS ix_recepcion_compra_lineas_producto ON recepcion_compra_lineas (producto_id);
CREATE INDEX IF NOT EXISTS ix_reservas_stock_pedido_estado ON reservas_stock (pedido_linea_id, estado);
CREATE INDEX IF NOT EXISTS ix_entrega_lineas_producto ON entrega_lineas (producto_id);

INSERT INTO schema_migrations (version, description)
VALUES ('010', 'Integridad cruzada de compras, entregas, devoluciones, notas y reservas')
ON CONFLICT (version) DO NOTHING;
COMMIT;
