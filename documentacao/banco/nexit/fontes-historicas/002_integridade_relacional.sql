-- ============================================================================
-- DistribuNex | Migration 002 - Integridad relacional oficial
-- PostgreSQL 15+
-- Ejecutar DESPUÉS de 001_base_oficial_distribunex.sql
-- Agrega validaciones cruzadas que una FK simple no puede garantizar.
-- ============================================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '001') THEN
        RAISE EXCEPTION 'La migration 001 debe ejecutarse antes de la 002.';
    END IF;
END $$;

-- --------------------------------------------------------------------------
-- Funciones auxiliares para resolver empresa por entidad
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_empresa_propietario_stock(p_propietario_id uuid)
RETURNS uuid AS $$
DECLARE v_empresa_id uuid;
BEGIN
    SELECT COALESCE(ps.empresa_id, c.empresa_id)
      INTO v_empresa_id
      FROM propietarios_stock ps
      LEFT JOIN clientes c ON c.id = ps.cliente_id
     WHERE ps.id = p_propietario_id;

    IF v_empresa_id IS NULL THEN
        RAISE EXCEPTION 'Propietario de stock inexistente o sin empresa: %', p_propietario_id;
    END IF;
    RETURN v_empresa_id;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION fn_empresa_deposito(p_deposito_id uuid)
RETURNS uuid AS $$
DECLARE v_empresa_id uuid;
BEGIN
    SELECT s.empresa_id INTO v_empresa_id
      FROM depositos d
      JOIN sucursales s ON s.id = d.sucursal_id
     WHERE d.id = p_deposito_id;
    IF v_empresa_id IS NULL THEN
        RAISE EXCEPTION 'Depósito inexistente: %', p_deposito_id;
    END IF;
    RETURN v_empresa_id;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION fn_validar_ubicacion_deposito(p_ubicacion_id uuid, p_deposito_id uuid, p_campo text)
RETURNS void AS $$
DECLARE v_deposito_id uuid;
BEGIN
    IF p_ubicacion_id IS NULL THEN
        RETURN;
    END IF;
    IF p_deposito_id IS NULL THEN
        RAISE EXCEPTION '% requiere depósito cuando se informa ubicación.', p_campo;
    END IF;
    SELECT deposito_id INTO v_deposito_id FROM ubicaciones_deposito WHERE id = p_ubicacion_id;
    IF v_deposito_id IS NULL THEN
        RAISE EXCEPTION 'Ubicación inexistente en %: %', p_campo, p_ubicacion_id;
    END IF;
    IF v_deposito_id <> p_deposito_id THEN
        RAISE EXCEPTION 'La ubicación % no pertenece al depósito informado en %.', p_ubicacion_id, p_campo;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- --------------------------------------------------------------------------
-- Seguridad y alcance
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_validar_usuario_sucursal()
RETURNS trigger AS $$
DECLARE v_empresa_sucursal uuid;
BEGIN
    IF NEW.sucursal_id IS NOT NULL THEN
        SELECT empresa_id INTO v_empresa_sucursal FROM sucursales WHERE id = NEW.sucursal_id;
        IF v_empresa_sucursal IS NULL OR v_empresa_sucursal <> NEW.empresa_id THEN
            RAISE EXCEPTION 'La sucursal del usuario debe pertenecer a la misma empresa.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_usuario_perfil()
RETURNS trigger AS $$
DECLARE v_empresa_usuario uuid; v_empresa_perfil uuid;
BEGIN
    SELECT empresa_id INTO v_empresa_usuario FROM usuarios WHERE id = NEW.usuario_id;
    SELECT empresa_id INTO v_empresa_perfil FROM perfiles WHERE id = NEW.perfil_id;
    IF v_empresa_usuario IS NULL OR v_empresa_perfil IS NULL OR v_empresa_usuario <> v_empresa_perfil THEN
        RAISE EXCEPTION 'Usuario y perfil deben pertenecer a la misma empresa.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_usuario_alcance()
RETURNS trigger AS $$
DECLARE v_empresa_usuario uuid; v_empresa_alcance uuid;
BEGIN
    SELECT empresa_id INTO v_empresa_usuario FROM usuarios WHERE id = NEW.usuario_id;
    IF NEW.tipo = 'SUCURSAL' THEN
        SELECT empresa_id INTO v_empresa_alcance FROM sucursales WHERE id = NEW.entidad_id;
    ELSIF NEW.tipo = 'DEPOSITO' THEN
        SELECT s.empresa_id INTO v_empresa_alcance FROM depositos d JOIN sucursales s ON s.id = d.sucursal_id WHERE d.id = NEW.entidad_id;
    ELSE
        RAISE EXCEPTION 'El alcance % todavía no está disponible; CAJA y RUTA se habilitarán con sus migrations oficiales.', NEW.tipo;
    END IF;
    IF v_empresa_alcance IS NULL OR v_empresa_alcance <> v_empresa_usuario THEN
        RAISE EXCEPTION 'El alcance asignado al usuario debe pertenecer a su misma empresa.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_auditoria_empresa_usuario()
RETURNS trigger AS $$
DECLARE v_empresa_usuario uuid;
BEGIN
    IF NEW.usuario_id IS NOT NULL AND NEW.empresa_id IS NOT NULL THEN
        SELECT empresa_id INTO v_empresa_usuario FROM usuarios WHERE id = NEW.usuario_id;
        IF v_empresa_usuario IS NULL OR v_empresa_usuario <> NEW.empresa_id THEN
            RAISE EXCEPTION 'La auditoría no puede asociar un usuario de otra empresa.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------------------------
-- Maestros comerciales
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_validar_cliente_empresa()
RETURNS trigger AS $$
DECLARE v_empresa_lista uuid;
BEGIN
    IF NEW.lista_precio_id IS NOT NULL THEN
        SELECT empresa_id INTO v_empresa_lista FROM listas_precio WHERE id = NEW.lista_precio_id;
        IF v_empresa_lista IS NULL OR v_empresa_lista <> NEW.empresa_id THEN
            RAISE EXCEPTION 'La lista de precio del cliente debe pertenecer a la misma empresa.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_proveedor_empresa()
RETURNS trigger AS $$
BEGIN
    IF NEW.condicion_pago_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM condiciones_pago WHERE id = NEW.condicion_pago_id AND activo) THEN
        RAISE EXCEPTION 'La condición de pago del proveedor no existe o está inactiva.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_producto_empresa()
RETURNS trigger AS $$
DECLARE v_empresa_id uuid;
BEGIN
    IF NEW.categoria_id IS NOT NULL THEN
        SELECT empresa_id INTO v_empresa_id FROM categorias_producto WHERE id = NEW.categoria_id;
        IF v_empresa_id IS NULL OR v_empresa_id <> NEW.empresa_id THEN
            RAISE EXCEPTION 'La categoría del producto debe pertenecer a la misma empresa.';
        END IF;
    END IF;
    IF NEW.marca_id IS NOT NULL THEN
        SELECT empresa_id INTO v_empresa_id FROM marcas_producto WHERE id = NEW.marca_id;
        IF v_empresa_id IS NULL OR v_empresa_id <> NEW.empresa_id THEN
            RAISE EXCEPTION 'La marca del producto debe pertenecer a la misma empresa.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_producto_precio()
RETURNS trigger AS $$
DECLARE v_empresa_producto uuid; v_empresa_lista uuid;
BEGIN
    SELECT empresa_id INTO v_empresa_producto FROM productos WHERE id = NEW.producto_id;
    SELECT empresa_id INTO v_empresa_lista FROM listas_precio WHERE id = NEW.lista_precio_id;
    IF v_empresa_producto IS NULL OR v_empresa_lista IS NULL OR v_empresa_producto <> v_empresa_lista THEN
        RAISE EXCEPTION 'Producto y lista de precio deben pertenecer a la misma empresa.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------------------------
-- Inventario: producto, propietario, depósito, ubicación, lote y etiqueta
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_validar_lote_stock()
RETURNS trigger AS $$
DECLARE v_empresa_producto uuid; v_empresa_propietario uuid;
BEGIN
    SELECT empresa_id INTO v_empresa_producto FROM productos WHERE id = NEW.producto_id;
    v_empresa_propietario := fn_empresa_propietario_stock(NEW.propietario_id);
    IF v_empresa_producto <> v_empresa_propietario THEN
        RAISE EXCEPTION 'Producto y propietario del lote deben pertenecer a la misma empresa.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_unidad_identificada()
RETURNS trigger AS $$
DECLARE v_empresa_producto uuid; v_empresa_propietario uuid; v_producto_lote uuid; v_propietario_lote uuid;
BEGIN
    SELECT empresa_id INTO v_empresa_producto FROM productos WHERE id = NEW.producto_id;
    v_empresa_propietario := fn_empresa_propietario_stock(NEW.propietario_id);
    IF v_empresa_producto <> v_empresa_propietario THEN
        RAISE EXCEPTION 'Producto y propietario de la unidad etiquetada deben pertenecer a la misma empresa.';
    END IF;
    IF NEW.lote_id IS NOT NULL THEN
        SELECT producto_id, propietario_id INTO v_producto_lote, v_propietario_lote FROM lotes_stock WHERE id = NEW.lote_id;
        IF v_producto_lote IS NULL OR v_producto_lote <> NEW.producto_id OR v_propietario_lote <> NEW.propietario_id THEN
            RAISE EXCEPTION 'El lote de la unidad debe corresponder al mismo producto y propietario.';
        END IF;
    END IF;
    PERFORM fn_validar_ubicacion_deposito(NEW.ubicacion_id, NEW.deposito_id, 'unidades_identificadas');
    IF NEW.deposito_id IS NOT NULL AND fn_empresa_deposito(NEW.deposito_id) <> v_empresa_producto THEN
        RAISE EXCEPTION 'El depósito de la unidad debe pertenecer a la misma empresa.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_existencia()
RETURNS trigger AS $$
DECLARE v_empresa_producto uuid; v_empresa_propietario uuid; v_producto_lote uuid; v_propietario_lote uuid;
BEGIN
    SELECT empresa_id INTO v_empresa_producto FROM productos WHERE id = NEW.producto_id;
    v_empresa_propietario := fn_empresa_propietario_stock(NEW.propietario_id);
    IF v_empresa_producto <> v_empresa_propietario OR fn_empresa_deposito(NEW.deposito_id) <> v_empresa_producto THEN
        RAISE EXCEPTION 'Producto, propietario y depósito de la existencia deben pertenecer a la misma empresa.';
    END IF;
    PERFORM fn_validar_ubicacion_deposito(NEW.ubicacion_id, NEW.deposito_id, 'existencias');
    IF NEW.lote_id IS NOT NULL THEN
        SELECT producto_id, propietario_id INTO v_producto_lote, v_propietario_lote FROM lotes_stock WHERE id = NEW.lote_id;
        IF v_producto_lote IS NULL OR v_producto_lote <> NEW.producto_id OR v_propietario_lote <> NEW.propietario_id THEN
            RAISE EXCEPTION 'El lote de la existencia debe corresponder al mismo producto y propietario.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_movimiento_stock()
RETURNS trigger AS $$
DECLARE
    v_empresa_producto uuid;
    v_empresa_propietario uuid;
    v_producto_lote uuid;
    v_propietario_lote uuid;
    v_producto_unidad uuid;
    v_propietario_unidad uuid;
    v_empresa_documento uuid;
BEGIN
    SELECT empresa_id INTO v_empresa_producto FROM productos WHERE id = NEW.producto_id;
    v_empresa_propietario := fn_empresa_propietario_stock(NEW.propietario_id);
    IF v_empresa_producto <> NEW.empresa_id OR v_empresa_propietario <> NEW.empresa_id THEN
        RAISE EXCEPTION 'Empresa, producto y propietario del movimiento deben coincidir.';
    END IF;
    IF NEW.deposito_origen_id IS NOT NULL AND fn_empresa_deposito(NEW.deposito_origen_id) <> NEW.empresa_id THEN
        RAISE EXCEPTION 'El depósito origen pertenece a otra empresa.';
    END IF;
    IF NEW.deposito_destino_id IS NOT NULL AND fn_empresa_deposito(NEW.deposito_destino_id) <> NEW.empresa_id THEN
        RAISE EXCEPTION 'El depósito destino pertenece a otra empresa.';
    END IF;
    PERFORM fn_validar_ubicacion_deposito(NEW.ubicacion_origen_id, NEW.deposito_origen_id, 'movimiento origen');
    PERFORM fn_validar_ubicacion_deposito(NEW.ubicacion_destino_id, NEW.deposito_destino_id, 'movimiento destino');

    IF NEW.tipo IN ('INGRESO_COMPRA','INGRESO_TERCERO','AJUSTE_POSITIVO','DEVOLUCION_CLIENTE')
       AND NEW.deposito_destino_id IS NULL THEN
        RAISE EXCEPTION 'El tipo de movimiento % requiere depósito destino.', NEW.tipo;
    END IF;
    IF NEW.tipo IN ('SALIDA_VENTA','SALIDA_TERCERO','AJUSTE_NEGATIVO','DEVOLUCION_PROVEEDOR')
       AND NEW.deposito_origen_id IS NULL THEN
        RAISE EXCEPTION 'El tipo de movimiento % requiere depósito origen.', NEW.tipo;
    END IF;
    IF NEW.tipo = 'TRANSFERENCIA' THEN
        IF NEW.deposito_origen_id IS NULL OR NEW.deposito_destino_id IS NULL THEN
            RAISE EXCEPTION 'Una transferencia requiere depósito origen y destino.';
        END IF;
        IF NEW.deposito_origen_id = NEW.deposito_destino_id
           AND COALESCE(NEW.ubicacion_origen_id, '00000000-0000-0000-0000-000000000000'::uuid)
               = COALESCE(NEW.ubicacion_destino_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
            RAISE EXCEPTION 'Una transferencia debe cambiar de depósito o ubicación.';
        END IF;
    END IF;

    IF NEW.documento_id IS NOT NULL THEN
        IF NEW.documento_tipo = 'PEDIDO' THEN
            SELECT empresa_id INTO v_empresa_documento FROM pedidos WHERE id = NEW.documento_id;
        ELSIF NEW.documento_tipo = 'VENTA' THEN
            SELECT empresa_id INTO v_empresa_documento FROM ventas WHERE id = NEW.documento_id;
        ELSE
            RAISE EXCEPTION 'El documento_tipo % no está habilitado en esta etapa para movimientos de stock.', COALESCE(NEW.documento_tipo, 'NULL');
        END IF;
        IF v_empresa_documento IS NULL OR v_empresa_documento <> NEW.empresa_id THEN
            RAISE EXCEPTION 'El documento origen del movimiento debe pertenecer a la misma empresa.';
        END IF;
    ELSIF NEW.documento_tipo IS NOT NULL THEN
        RAISE EXCEPTION 'No se puede informar documento_tipo sin documento_id.';
    END IF;
    IF NEW.lote_id IS NOT NULL THEN
        SELECT producto_id, propietario_id INTO v_producto_lote, v_propietario_lote FROM lotes_stock WHERE id = NEW.lote_id;
        IF v_producto_lote IS NULL OR v_producto_lote <> NEW.producto_id OR v_propietario_lote <> NEW.propietario_id THEN
            RAISE EXCEPTION 'El lote del movimiento debe corresponder al mismo producto y propietario.';
        END IF;
    END IF;
    IF NEW.unidad_id IS NOT NULL THEN
        SELECT producto_id, propietario_id INTO v_producto_unidad, v_propietario_unidad FROM unidades_identificadas WHERE id = NEW.unidad_id;
        IF v_producto_unidad IS NULL OR v_producto_unidad <> NEW.producto_id OR v_propietario_unidad <> NEW.propietario_id THEN
            RAISE EXCEPTION 'La unidad etiquetada debe corresponder al mismo producto y propietario.';
        END IF;
        IF NEW.cantidad <> 1 THEN
            RAISE EXCEPTION 'Un movimiento por unidad etiquetada debe tener cantidad igual a 1.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------------------------
-- Pedidos, ventas y documentos electrónicos
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_validar_pedido()
RETURNS trigger AS $$
DECLARE v_empresa_cliente uuid; v_empresa_sucursal uuid; v_cliente_direccion uuid; v_empresa_lista uuid; v_empresa_usuario uuid;
BEGIN
    SELECT empresa_id INTO v_empresa_cliente FROM clientes WHERE id = NEW.cliente_id;
    SELECT empresa_id INTO v_empresa_sucursal FROM sucursales WHERE id = NEW.sucursal_id;
    IF v_empresa_cliente IS NULL OR v_empresa_sucursal IS NULL OR v_empresa_cliente <> NEW.empresa_id OR v_empresa_sucursal <> NEW.empresa_id THEN
        RAISE EXCEPTION 'Cliente y sucursal del pedido deben pertenecer a la misma empresa.';
    END IF;
    IF NEW.direccion_entrega_id IS NOT NULL THEN
        SELECT cliente_id INTO v_cliente_direccion FROM direcciones_cliente WHERE id = NEW.direccion_entrega_id;
        IF v_cliente_direccion IS NULL OR v_cliente_direccion <> NEW.cliente_id THEN
            RAISE EXCEPTION 'La dirección de entrega debe pertenecer al cliente del pedido.';
        END IF;
    END IF;
    IF NEW.lista_precio_id IS NOT NULL THEN
        SELECT empresa_id INTO v_empresa_lista FROM listas_precio WHERE id = NEW.lista_precio_id;
        IF v_empresa_lista IS NULL OR v_empresa_lista <> NEW.empresa_id THEN
            RAISE EXCEPTION 'La lista de precio del pedido debe pertenecer a la misma empresa.';
        END IF;
    END IF;
    IF NEW.creado_por IS NOT NULL THEN
        SELECT empresa_id INTO v_empresa_usuario FROM usuarios WHERE id = NEW.creado_por;
        IF v_empresa_usuario IS NULL OR v_empresa_usuario <> NEW.empresa_id THEN
            RAISE EXCEPTION 'El usuario creador del pedido debe pertenecer a la misma empresa.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_pedido_linea()
RETURNS trigger AS $$
DECLARE v_empresa_pedido uuid; v_empresa_producto uuid;
BEGIN
    SELECT empresa_id INTO v_empresa_pedido FROM pedidos WHERE id = NEW.pedido_id;
    SELECT empresa_id INTO v_empresa_producto FROM productos WHERE id = NEW.producto_id;
    IF v_empresa_pedido IS NULL OR v_empresa_producto IS NULL OR v_empresa_pedido <> v_empresa_producto THEN
        RAISE EXCEPTION 'El producto de la línea debe pertenecer a la misma empresa del pedido.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_venta()
RETURNS trigger AS $$
DECLARE v_empresa_cliente uuid; v_empresa_sucursal uuid; v_empresa_pedido uuid; v_cliente_pedido uuid; v_empresa_usuario uuid;
BEGIN
    SELECT empresa_id INTO v_empresa_cliente FROM clientes WHERE id = NEW.cliente_id;
    SELECT empresa_id INTO v_empresa_sucursal FROM sucursales WHERE id = NEW.sucursal_id;
    IF v_empresa_cliente IS NULL OR v_empresa_sucursal IS NULL OR v_empresa_cliente <> NEW.empresa_id OR v_empresa_sucursal <> NEW.empresa_id THEN
        RAISE EXCEPTION 'Cliente y sucursal de la venta deben pertenecer a la misma empresa.';
    END IF;
    IF NEW.pedido_id IS NOT NULL THEN
        SELECT empresa_id, cliente_id INTO v_empresa_pedido, v_cliente_pedido FROM pedidos WHERE id = NEW.pedido_id;
        IF v_empresa_pedido IS NULL OR v_empresa_pedido <> NEW.empresa_id OR v_cliente_pedido <> NEW.cliente_id THEN
            RAISE EXCEPTION 'El pedido asociado debe pertenecer a la misma empresa y al mismo cliente de la venta.';
        END IF;
    END IF;
    IF NEW.creado_por IS NOT NULL THEN
        SELECT empresa_id INTO v_empresa_usuario FROM usuarios WHERE id = NEW.creado_por;
        IF v_empresa_usuario IS NULL OR v_empresa_usuario <> NEW.empresa_id THEN
            RAISE EXCEPTION 'El usuario creador de la venta debe pertenecer a la misma empresa.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_venta_linea()
RETURNS trigger AS $$
DECLARE v_empresa_venta uuid; v_empresa_producto uuid;
BEGIN
    SELECT empresa_id INTO v_empresa_venta FROM ventas WHERE id = NEW.venta_id;
    SELECT empresa_id INTO v_empresa_producto FROM productos WHERE id = NEW.producto_id;
    IF v_empresa_venta IS NULL OR v_empresa_producto IS NULL OR v_empresa_venta <> v_empresa_producto THEN
        RAISE EXCEPTION 'El producto de la línea debe pertenecer a la misma empresa de la venta.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_documento_electronico()
RETURNS trigger AS $$
DECLARE v_empresa_venta uuid;
BEGIN
    SELECT empresa_id INTO v_empresa_venta FROM ventas WHERE id = NEW.venta_id;
    IF v_empresa_venta IS NULL OR v_empresa_venta <> NEW.empresa_id THEN
        RAISE EXCEPTION 'La venta y el documento electrónico deben pertenecer a la misma empresa.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------------------------
-- Activación idempotente de triggers
-- --------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_usuarios_validar_sucursal ON usuarios;
CREATE TRIGGER trg_usuarios_validar_sucursal BEFORE INSERT OR UPDATE ON usuarios
FOR EACH ROW EXECUTE FUNCTION trg_validar_usuario_sucursal();

DROP TRIGGER IF EXISTS trg_usuario_perfil_validar_empresa ON usuario_perfil;
CREATE TRIGGER trg_usuario_perfil_validar_empresa BEFORE INSERT OR UPDATE ON usuario_perfil
FOR EACH ROW EXECUTE FUNCTION trg_validar_usuario_perfil();

DROP TRIGGER IF EXISTS trg_usuario_alcance_validar_empresa ON usuario_alcance;
CREATE TRIGGER trg_usuario_alcance_validar_empresa BEFORE INSERT OR UPDATE ON usuario_alcance
FOR EACH ROW EXECUTE FUNCTION trg_validar_usuario_alcance();

DROP TRIGGER IF EXISTS trg_auditoria_validar_empresa_usuario ON auditoria;
CREATE TRIGGER trg_auditoria_validar_empresa_usuario BEFORE INSERT OR UPDATE ON auditoria
FOR EACH ROW EXECUTE FUNCTION trg_validar_auditoria_empresa_usuario();

DROP TRIGGER IF EXISTS trg_clientes_validar_empresa ON clientes;
CREATE TRIGGER trg_clientes_validar_empresa BEFORE INSERT OR UPDATE ON clientes
FOR EACH ROW EXECUTE FUNCTION trg_validar_cliente_empresa();

DROP TRIGGER IF EXISTS trg_proveedores_validar_empresa ON proveedores;
CREATE TRIGGER trg_proveedores_validar_empresa BEFORE INSERT OR UPDATE ON proveedores
FOR EACH ROW EXECUTE FUNCTION trg_validar_proveedor_empresa();

DROP TRIGGER IF EXISTS trg_productos_validar_empresa ON productos;
CREATE TRIGGER trg_productos_validar_empresa BEFORE INSERT OR UPDATE ON productos
FOR EACH ROW EXECUTE FUNCTION trg_validar_producto_empresa();

DROP TRIGGER IF EXISTS trg_producto_precios_validar_empresa ON producto_precios;
CREATE TRIGGER trg_producto_precios_validar_empresa BEFORE INSERT OR UPDATE ON producto_precios
FOR EACH ROW EXECUTE FUNCTION trg_validar_producto_precio();

DROP TRIGGER IF EXISTS trg_lotes_stock_validar_integridad ON lotes_stock;
CREATE TRIGGER trg_lotes_stock_validar_integridad BEFORE INSERT OR UPDATE ON lotes_stock
FOR EACH ROW EXECUTE FUNCTION trg_validar_lote_stock();

DROP TRIGGER IF EXISTS trg_unidades_identificadas_validar_integridad ON unidades_identificadas;
CREATE TRIGGER trg_unidades_identificadas_validar_integridad BEFORE INSERT OR UPDATE ON unidades_identificadas
FOR EACH ROW EXECUTE FUNCTION trg_validar_unidad_identificada();

DROP TRIGGER IF EXISTS trg_existencias_validar_integridad ON existencias;
CREATE TRIGGER trg_existencias_validar_integridad BEFORE INSERT OR UPDATE ON existencias
FOR EACH ROW EXECUTE FUNCTION trg_validar_existencia();

DROP TRIGGER IF EXISTS trg_movimientos_stock_validar_integridad ON movimientos_stock;
CREATE TRIGGER trg_movimientos_stock_validar_integridad BEFORE INSERT OR UPDATE ON movimientos_stock
FOR EACH ROW EXECUTE FUNCTION trg_validar_movimiento_stock();

DROP TRIGGER IF EXISTS trg_pedidos_validar_integridad ON pedidos;
CREATE TRIGGER trg_pedidos_validar_integridad BEFORE INSERT OR UPDATE ON pedidos
FOR EACH ROW EXECUTE FUNCTION trg_validar_pedido();

DROP TRIGGER IF EXISTS trg_pedido_lineas_validar_integridad ON pedido_lineas;
CREATE TRIGGER trg_pedido_lineas_validar_integridad BEFORE INSERT OR UPDATE ON pedido_lineas
FOR EACH ROW EXECUTE FUNCTION trg_validar_pedido_linea();

DROP TRIGGER IF EXISTS trg_ventas_validar_integridad ON ventas;
CREATE TRIGGER trg_ventas_validar_integridad BEFORE INSERT OR UPDATE ON ventas
FOR EACH ROW EXECUTE FUNCTION trg_validar_venta();

DROP TRIGGER IF EXISTS trg_venta_lineas_validar_integridad ON venta_lineas;
CREATE TRIGGER trg_venta_lineas_validar_integridad BEFORE INSERT OR UPDATE ON venta_lineas
FOR EACH ROW EXECUTE FUNCTION trg_validar_venta_linea();

DROP TRIGGER IF EXISTS trg_documentos_electronicos_validar_integridad ON documentos_electronicos;
CREATE TRIGGER trg_documentos_electronicos_validar_integridad BEFORE INSERT OR UPDATE ON documentos_electronicos
FOR EACH ROW EXECUTE FUNCTION trg_validar_documento_electronico();

INSERT INTO schema_migrations (version, description)
VALUES ('002', 'Integridad relacional cruzada mediante triggers')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- Verificación posterior:
-- SELECT version, description, executed_at FROM schema_migrations ORDER BY version;
-- SELECT tgrelid::regclass AS tabla, tgname AS trigger FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1, 2;