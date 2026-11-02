-- ============================================================================
-- DistribuNex | Migration 011 - Almacenaje de terceros, costos y picking
-- Ejecutar DESPUÉS de 010_integridade_comercial_fluxos_stock.sql
-- ============================================================================
BEGIN;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '010') THEN
        RAISE EXCEPTION 'La migration 010 debe ejecutarse antes de la 011.';
    END IF;
END $$;

-- Parámetros logísticos do produto utilizados em capacidade, picking e FEFO.
ALTER TABLE productos
    ADD COLUMN IF NOT EXISTS peso_unitario numeric(18,4) CHECK (peso_unitario IS NULL OR peso_unitario >= 0),
    ADD COLUMN IF NOT EXISTS volumen_unitario numeric(18,4) CHECK (volumen_unitario IS NULL OR volumen_unitario >= 0),
    ADD COLUMN IF NOT EXISTS unidades_por_caja integer CHECK (unidades_por_caja IS NULL OR unidades_por_caja > 0),
    ADD COLUMN IF NOT EXISTS deposito_predeterminado_id uuid REFERENCES depositos(id),
    ADD COLUMN IF NOT EXISTS ubicacion_predeterminada_id uuid REFERENCES ubicaciones_deposito(id),
    ADD COLUMN IF NOT EXISTS usa_fefo boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS costos_producto (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id), producto_id uuid NOT NULL REFERENCES productos(id),
    fecha timestamptz NOT NULL DEFAULT now(), tipo_origen varchar(30) NOT NULL CHECK (tipo_origen IN ('RECEPCION_COMPRA','AJUSTE_COSTO','INVENTARIO_INICIAL','OTRO')),
    origen_id uuid, cantidad numeric(18,4) NOT NULL CHECK (cantidad > 0), costo_unitario numeric(18,4) NOT NULL CHECK (costo_unitario >= 0),
    costo_anterior numeric(18,4), costo_resultante numeric(18,4) NOT NULL CHECK (costo_resultante >= 0),
    registrado_por uuid REFERENCES usuarios(id), observacion varchar(500), created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tipo_origen, origen_id)
);

-- Espaços físicos que podem ser próprios ou alocados a contratos de clientes.
CREATE TABLE IF NOT EXISTS espacios_almacenamiento (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id), deposito_id uuid NOT NULL REFERENCES depositos(id),
    codigo varchar(50) NOT NULL, nombre varchar(150) NOT NULL, tipo varchar(20) NOT NULL DEFAULT 'POSICION'
        CHECK (tipo IN ('POSICION','AREA','CAMARA','PALET','OTRO')),
    capacidad_peso numeric(18,4), capacidad_volumen numeric(18,4), capacidad_unidades numeric(18,4), activo boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (empresa_id, codigo)
);

ALTER TABLE contratos_almacenamiento
    ADD COLUMN IF NOT EXISTS propietario_id uuid REFERENCES propietarios_stock(id),
    ADD COLUMN IF NOT EXISTS dia_facturacion smallint NOT NULL DEFAULT 1 CHECK (dia_facturacion BETWEEN 1 AND 28),
    ADD COLUMN IF NOT EXISTS facturacion_automatica boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS contrato_almacenamiento_espacios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contrato_id uuid NOT NULL REFERENCES contratos_almacenamiento(id) ON DELETE CASCADE,
    espacio_id uuid NOT NULL REFERENCES espacios_almacenamiento(id), fecha_inicio date NOT NULL, fecha_fin date,
    capacidad_peso_asignada numeric(18,4), capacidad_volumen_asignada numeric(18,4), capacidad_unidades_asignada numeric(18,4),
    created_at timestamptz NOT NULL DEFAULT now(), CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio),
    UNIQUE (contrato_id, espacio_id, fecha_inicio)
);

CREATE TABLE IF NOT EXISTS servicios_almacenamiento (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id), contrato_id uuid NOT NULL REFERENCES contratos_almacenamiento(id),
    periodo_desde date NOT NULL, periodo_hasta date NOT NULL, concepto varchar(200) NOT NULL,
    cantidad numeric(18,4) NOT NULL DEFAULT 1 CHECK (cantidad > 0), precio_unitario numeric(18,4) NOT NULL CHECK (precio_unitario >= 0),
    total numeric(18,4) NOT NULL CHECK (total >= 0), moneda_codigo varchar(3) NOT NULL REFERENCES monedas(codigo),
    estado varchar(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','FACTURADO','ANULADO')),
    venta_id uuid REFERENCES ventas(id), creado_at timestamptz NOT NULL DEFAULT now(),
    CHECK (periodo_hasta >= periodo_desde), UNIQUE (contrato_id, periodo_desde, periodo_hasta, concepto)
);

-- Orden de separación para depósitos: reserva o stock disponible se transforma
-- en una lista rastreable de lote/unidad/ubicación a preparar.
CREATE TABLE IF NOT EXISTS ordenes_picking (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id), sucursal_id uuid NOT NULL REFERENCES sucursales(id), deposito_id uuid NOT NULL REFERENCES depositos(id),
    pedido_id uuid REFERENCES pedidos(id), venta_id uuid REFERENCES ventas(id), numero bigint NOT NULL, prioridad smallint NOT NULL DEFAULT 0,
    estado varchar(25) NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','ASIGNADA','EN_PREPARACION','PREPARADA','PARCIAL','CANCELADA')),
    preparado_por uuid REFERENCES usuarios(id), iniciado_at timestamptz, finalizado_at timestamptz, observacion varchar(500),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, numero), CHECK (pedido_id IS NOT NULL OR venta_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS orden_picking_lineas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), orden_picking_id uuid NOT NULL REFERENCES ordenes_picking(id) ON DELETE CASCADE,
    pedido_linea_id uuid REFERENCES pedido_lineas(id), venta_linea_id uuid REFERENCES venta_lineas(id), producto_id uuid NOT NULL REFERENCES productos(id),
    propietario_id uuid NOT NULL REFERENCES propietarios_stock(id), deposito_id uuid NOT NULL REFERENCES depositos(id), ubicacion_id uuid REFERENCES ubicaciones_deposito(id),
    lote_id uuid REFERENCES lotes_stock(id), unidad_id uuid REFERENCES unidades_identificadas(id), cantidad_solicitada numeric(18,4) NOT NULL CHECK (cantidad_solicitada > 0),
    cantidad_preparada numeric(18,4) NOT NULL DEFAULT 0 CHECK (cantidad_preparada >= 0), estado varchar(20) NOT NULL DEFAULT 'PENDIENTE'
        CHECK (estado IN ('PENDIENTE','PARCIAL','PREPARADA','FALTANTE','CANCELADA')),
    observacion varchar(300), CHECK (cantidad_preparada <= cantidad_solicitada), CHECK (pedido_linea_id IS NOT NULL OR venta_linea_id IS NOT NULL)
);

CREATE OR REPLACE FUNCTION trg_validar_producto_logistica()
RETURNS trigger AS $$
BEGIN
    IF NEW.deposito_predeterminado_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM depositos WHERE id = NEW.deposito_predeterminado_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El depósito predeterminado debe pertenecer a la misma empresa.'; END IF;
    IF NEW.ubicacion_predeterminada_id IS NOT NULL THEN
        PERFORM fn_validar_ubicacion_deposito(NEW.ubicacion_predeterminada_id, NEW.deposito_predeterminado_id, 'ubicación predeterminada del producto');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_costo_producto()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM productos WHERE id = NEW.producto_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El producto del costo debe pertenecer a la misma empresa.'; END IF;
    IF NEW.registrado_por IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.registrado_por AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El usuario del costo debe pertenecer a la misma empresa.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_espacio_almacenamiento()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM depositos WHERE id = NEW.deposito_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El depósito del espacio debe pertenecer a la misma empresa.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_contrato_almacenamiento()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM clientes WHERE id = NEW.cliente_id AND empresa_id = NEW.empresa_id) OR NOT EXISTS (SELECT 1 FROM depositos WHERE id = NEW.deposito_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'Cliente y depósito del contrato deben pertenecer a la misma empresa.'; END IF;
    IF NEW.estado = 'ACTIVO' AND NEW.propietario_id IS NULL THEN RAISE EXCEPTION 'Un contrato activo debe indicar el propietario de stock del cliente.'; END IF;
    IF NEW.propietario_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM propietarios_stock WHERE id = NEW.propietario_id AND cliente_id = NEW.cliente_id) THEN RAISE EXCEPTION 'El propietario del contrato debe corresponder al cliente.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_contrato_espacio()
RETURNS trigger AS $$
DECLARE e uuid; d uuid; ee uuid; de uuid;
BEGIN
    SELECT empresa_id, deposito_id INTO e, d FROM contratos_almacenamiento WHERE id = NEW.contrato_id;
    SELECT empresa_id, deposito_id INTO ee, de FROM espacios_almacenamiento WHERE id = NEW.espacio_id;
    IF e IS NULL OR ee IS NULL OR e <> ee OR d <> de THEN RAISE EXCEPTION 'El espacio debe pertenecer al mismo depósito y empresa del contrato.'; END IF;
    IF EXISTS (
        SELECT 1 FROM contrato_almacenamiento_espacios ce
         WHERE ce.espacio_id = NEW.espacio_id AND ce.id <> NEW.id
           AND daterange(ce.fecha_inicio, COALESCE(ce.fecha_fin, 'infinity'::date), '[]')
               && daterange(NEW.fecha_inicio, COALESCE(NEW.fecha_fin, 'infinity'::date), '[]')
    ) THEN RAISE EXCEPTION 'El espacio ya está asignado a otro contrato durante el período indicado.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_servicio_almacenamiento()
RETURNS trigger AS $$
DECLARE e uuid; c uuid; m varchar(3);
BEGIN
    SELECT empresa_id, cliente_id, moneda_codigo INTO e, c, m FROM contratos_almacenamiento WHERE id = NEW.contrato_id;
    IF e IS NULL OR e <> NEW.empresa_id OR m IS NULL OR m <> NEW.moneda_codigo THEN RAISE EXCEPTION 'El servicio debe usar empresa y moneda del contrato.'; END IF;
    IF NEW.venta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ventas WHERE id = NEW.venta_id AND empresa_id = e AND cliente_id = c) THEN RAISE EXCEPTION 'La venta del servicio debe pertenecer al cliente y empresa del contrato.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_orden_picking()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = NEW.sucursal_id AND empresa_id = NEW.empresa_id) OR NOT EXISTS (SELECT 1 FROM depositos WHERE id = NEW.deposito_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'Sucursal y depósito del picking deben pertenecer a la misma empresa.'; END IF;
    IF NEW.pedido_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pedidos WHERE id = NEW.pedido_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El pedido debe pertenecer a la misma empresa.'; END IF;
    IF NEW.venta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ventas WHERE id = NEW.venta_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'La venta debe pertenecer a la misma empresa.'; END IF;
    IF NEW.preparado_por IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.preparado_por AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El preparador debe pertenecer a la misma empresa.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_orden_picking_linea()
RETURNS trigger AS $$
DECLARE e uuid; d uuid; pe uuid; ve uuid; p uuid;
BEGIN
    SELECT empresa_id, deposito_id, pedido_id, venta_id INTO e, d, pe, ve FROM ordenes_picking WHERE id = NEW.orden_picking_id;
    IF e IS NULL OR NOT EXISTS (SELECT 1 FROM productos WHERE id = NEW.producto_id AND empresa_id = e) OR fn_empresa_propietario_stock(NEW.propietario_id) <> e OR NEW.deposito_id <> d THEN RAISE EXCEPTION 'Producto, propietario y depósito deben corresponder a la orden de picking.'; END IF;
    IF NEW.pedido_linea_id IS NOT NULL THEN SELECT producto_id INTO p FROM pedido_lineas WHERE id = NEW.pedido_linea_id AND pedido_id = pe; IF p IS NULL OR p <> NEW.producto_id THEN RAISE EXCEPTION 'La línea de pedido no corresponde al picking.'; END IF; END IF;
    IF NEW.venta_linea_id IS NOT NULL THEN SELECT producto_id INTO p FROM venta_lineas WHERE id = NEW.venta_linea_id AND venta_id = ve; IF p IS NULL OR p <> NEW.producto_id THEN RAISE EXCEPTION 'La línea de venta no corresponde al picking.'; END IF; END IF;
    PERFORM fn_validar_ubicacion_deposito(NEW.ubicacion_id, d, 'línea de picking');
    IF NEW.lote_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lotes_stock WHERE id = NEW.lote_id AND producto_id = NEW.producto_id AND propietario_id = NEW.propietario_id) THEN RAISE EXCEPTION 'El lote no corresponde al producto y propietario.'; END IF;
    IF NEW.unidad_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM unidades_identificadas WHERE id = NEW.unidad_id AND producto_id = NEW.producto_id AND propietario_id = NEW.propietario_id AND deposito_id = d) THEN RAISE EXCEPTION 'La unidad no corresponde al producto, propietario y depósito.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_aplicar_costo_producto()
RETURNS trigger AS $$
BEGIN
    UPDATE productos SET costo_promedio = NEW.costo_resultante WHERE id = NEW.producto_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_bloquear_modificacion_costo_producto()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'El historial de costos es inmutable. Registre un AJUSTE_COSTO en lugar de editar o eliminar un costo.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_productos_validar_logistica BEFORE INSERT OR UPDATE ON productos FOR EACH ROW EXECUTE FUNCTION trg_validar_producto_logistica();
CREATE TRIGGER trg_costos_producto_validar_integridad BEFORE INSERT OR UPDATE ON costos_producto FOR EACH ROW EXECUTE FUNCTION trg_validar_costo_producto();
CREATE TRIGGER trg_costos_producto_aplicar AFTER INSERT ON costos_producto FOR EACH ROW EXECUTE FUNCTION trg_aplicar_costo_producto();
CREATE TRIGGER trg_costos_producto_inmutable BEFORE UPDATE OR DELETE ON costos_producto FOR EACH ROW EXECUTE FUNCTION trg_bloquear_modificacion_costo_producto();
CREATE TRIGGER trg_espacios_almacenamiento_validar_integridad BEFORE INSERT OR UPDATE ON espacios_almacenamiento FOR EACH ROW EXECUTE FUNCTION trg_validar_espacio_almacenamiento();
CREATE TRIGGER trg_contratos_almacenamiento_validar_integridad BEFORE INSERT OR UPDATE ON contratos_almacenamiento FOR EACH ROW EXECUTE FUNCTION trg_validar_contrato_almacenamiento();
CREATE TRIGGER trg_contrato_almacenamiento_espacios_validar_integridad BEFORE INSERT OR UPDATE ON contrato_almacenamiento_espacios FOR EACH ROW EXECUTE FUNCTION trg_validar_contrato_espacio();
CREATE TRIGGER trg_servicios_almacenamiento_validar_integridad BEFORE INSERT OR UPDATE ON servicios_almacenamiento FOR EACH ROW EXECUTE FUNCTION trg_validar_servicio_almacenamiento();
CREATE TRIGGER trg_ordenes_picking_validar_integridad BEFORE INSERT OR UPDATE ON ordenes_picking FOR EACH ROW EXECUTE FUNCTION trg_validar_orden_picking();
CREATE TRIGGER trg_orden_picking_lineas_validar_integridad BEFORE INSERT OR UPDATE ON orden_picking_lineas FOR EACH ROW EXECUTE FUNCTION trg_validar_orden_picking_linea();

DO $$ DECLARE t text; BEGIN
    FOREACH t IN ARRAY ARRAY['espacios_almacenamiento','contratos_almacenamiento','ordenes_picking'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', t, t);
        EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
    END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS ix_costos_producto_fecha ON costos_producto (producto_id, fecha DESC);
CREATE INDEX IF NOT EXISTS ix_espacios_almacenamiento_deposito ON espacios_almacenamiento (deposito_id, activo);
CREATE INDEX IF NOT EXISTS ix_servicios_almacenamiento_pendientes ON servicios_almacenamiento (empresa_id, estado, periodo_hasta) WHERE estado = 'PENDIENTE';
CREATE INDEX IF NOT EXISTS ix_ordenes_picking_estado ON ordenes_picking (deposito_id, estado, prioridad DESC, created_at);
CREATE INDEX IF NOT EXISTS ix_orden_picking_lineas_producto ON orden_picking_lineas (producto_id, lote_id, unidad_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_picking_unidad_activa ON orden_picking_lineas (unidad_id)
    WHERE unidad_id IS NOT NULL AND estado IN ('PENDIENTE','PARCIAL','PREPARADA');

INSERT INTO schema_migrations (version, description)
VALUES ('011', 'Almacenaje de terceros, historial de costos y picking por lote o unidad')
ON CONFLICT (version) DO NOTHING;
COMMIT;