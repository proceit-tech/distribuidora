-- ============================================================================
-- DistribuNex | Migration 004 - Compras e inventario operativo
-- Ejecutar DESPUÉS de 003_configuracion_inicial_y_seguridad.sql
-- ============================================================================
BEGIN;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '003') THEN
        RAISE EXCEPTION 'La migration 003 debe ejecutarse antes de la 004.';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS direcciones_proveedor (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proveedor_id uuid NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
    descripcion varchar(100) NOT NULL,
    direccion varchar(300) NOT NULL,
    ciudad varchar(100), departamento varchar(100),
    es_principal boolean NOT NULL DEFAULT false,
    activo boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS solicitudes_compra (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES empresas(id), sucursal_id uuid NOT NULL REFERENCES sucursales(id),
    numero bigint NOT NULL, fecha date NOT NULL DEFAULT current_date,
    estado varchar(20) NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','SOLICITADA','APROBADA','RECHAZADA','CERRADA','ANULADA')),
    observacion varchar(500), solicitado_por uuid REFERENCES usuarios(id), aprobado_por uuid REFERENCES usuarios(id), aprobado_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, numero)
);
CREATE TABLE IF NOT EXISTS solicitud_compra_lineas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), solicitud_id uuid NOT NULL REFERENCES solicitudes_compra(id) ON DELETE CASCADE,
    producto_id uuid NOT NULL REFERENCES productos(id), cantidad_solicitada numeric(18,4) NOT NULL CHECK (cantidad_solicitada > 0),
    cantidad_aprobada numeric(18,4) CHECK (cantidad_aprobada IS NULL OR cantidad_aprobada >= 0), observacion varchar(300)
);

CREATE TABLE IF NOT EXISTS ordenes_compra (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES empresas(id), sucursal_id uuid NOT NULL REFERENCES sucursales(id), proveedor_id uuid NOT NULL REFERENCES proveedores(id),
    solicitud_id uuid REFERENCES solicitudes_compra(id), numero bigint NOT NULL, fecha date NOT NULL DEFAULT current_date,
    fecha_entrega_estimada date, estado varchar(20) NOT NULL DEFAULT 'BORRADOR'
        CHECK (estado IN ('BORRADOR','ENVIADA','PARCIAL','RECIBIDA','CERRADA','ANULADA')),
    moneda_codigo varchar(3) NOT NULL REFERENCES monedas(codigo), condicion_pago_id uuid REFERENCES condiciones_pago(id),
    subtotal numeric(18,4) NOT NULL DEFAULT 0, descuento_total numeric(18,4) NOT NULL DEFAULT 0,
    impuesto_total numeric(18,4) NOT NULL DEFAULT 0, total numeric(18,4) NOT NULL DEFAULT 0,
    creado_por uuid REFERENCES usuarios(id), aprobado_por uuid REFERENCES usuarios(id), observacion varchar(500),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (empresa_id, numero)
);
CREATE TABLE IF NOT EXISTS orden_compra_lineas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), orden_compra_id uuid NOT NULL REFERENCES ordenes_compra(id) ON DELETE CASCADE,
    producto_id uuid NOT NULL REFERENCES productos(id), descripcion varchar(300) NOT NULL,
    cantidad numeric(18,4) NOT NULL CHECK (cantidad > 0), cantidad_recibida numeric(18,4) NOT NULL DEFAULT 0 CHECK (cantidad_recibida >= 0),
    precio_unitario numeric(18,4) NOT NULL CHECK (precio_unitario >= 0), descuento_porcentaje numeric(7,4) NOT NULL DEFAULT 0 CHECK (descuento_porcentaje BETWEEN 0 AND 100),
    impuesto_porcentaje numeric(7,4) NOT NULL DEFAULT 0 CHECK (impuesto_porcentaje >= 0), total_linea numeric(18,4) NOT NULL CHECK (total_linea >= 0),
    CHECK (cantidad_recibida <= cantidad)
);

CREATE TABLE IF NOT EXISTS recepciones_compra (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES empresas(id), sucursal_id uuid NOT NULL REFERENCES sucursales(id), deposito_id uuid NOT NULL REFERENCES depositos(id),
    proveedor_id uuid NOT NULL REFERENCES proveedores(id), orden_compra_id uuid REFERENCES ordenes_compra(id), numero bigint NOT NULL,
    fecha_recepcion timestamptz NOT NULL DEFAULT now(), estado varchar(20) NOT NULL DEFAULT 'BORRADOR'
        CHECK (estado IN ('BORRADOR','CONFIRMADA','PARCIAL','ANULADA')),
    documento_proveedor varchar(100), observacion varchar(500), recibido_por uuid REFERENCES usuarios(id),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (empresa_id, numero)
);
CREATE TABLE IF NOT EXISTS recepcion_compra_lineas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), recepcion_id uuid NOT NULL REFERENCES recepciones_compra(id) ON DELETE CASCADE,
    orden_linea_id uuid REFERENCES orden_compra_lineas(id), producto_id uuid NOT NULL REFERENCES productos(id), lote_id uuid REFERENCES lotes_stock(id),
    ubicacion_id uuid REFERENCES ubicaciones_deposito(id), cantidad_ordenada numeric(18,4), cantidad_recibida numeric(18,4) NOT NULL CHECK (cantidad_recibida > 0),
    cantidad_rechazada numeric(18,4) NOT NULL DEFAULT 0 CHECK (cantidad_rechazada >= 0), costo_unitario numeric(18,4) NOT NULL CHECK (costo_unitario >= 0),
    motivo_diferencia varchar(300), created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS facturas_proveedor (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id), sucursal_id uuid NOT NULL REFERENCES sucursales(id),
    proveedor_id uuid NOT NULL REFERENCES proveedores(id), numero_documento varchar(100) NOT NULL, fecha_emision date NOT NULL,
    fecha_vencimiento date, moneda_codigo varchar(3) NOT NULL REFERENCES monedas(codigo), estado varchar(20) NOT NULL DEFAULT 'REGISTRADA'
        CHECK (estado IN ('BORRADOR','REGISTRADA','PARCIAL_PAGADA','PAGADA','ANULADA')),
    subtotal numeric(18,4) NOT NULL DEFAULT 0, impuesto_total numeric(18,4) NOT NULL DEFAULT 0, total numeric(18,4) NOT NULL DEFAULT 0,
    saldo numeric(18,4) NOT NULL DEFAULT 0 CHECK (saldo >= 0), observacion varchar(500), creado_por uuid REFERENCES usuarios(id),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (empresa_id, proveedor_id, numero_documento)
);
CREATE TABLE IF NOT EXISTS factura_proveedor_recepciones (
    factura_proveedor_id uuid NOT NULL REFERENCES facturas_proveedor(id) ON DELETE CASCADE,
    recepcion_id uuid NOT NULL REFERENCES recepciones_compra(id), PRIMARY KEY (factura_proveedor_id, recepcion_id)
);

CREATE TABLE IF NOT EXISTS devoluciones_proveedor (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id), sucursal_id uuid NOT NULL REFERENCES sucursales(id),
    deposito_id uuid NOT NULL REFERENCES depositos(id), proveedor_id uuid NOT NULL REFERENCES proveedores(id), recepcion_id uuid REFERENCES recepciones_compra(id),
    numero bigint NOT NULL, fecha timestamptz NOT NULL DEFAULT now(), estado varchar(20) NOT NULL DEFAULT 'BORRADOR'
        CHECK (estado IN ('BORRADOR','APROBADA','DESPACHADA','CERRADA','ANULADA')),
    motivo varchar(300) NOT NULL, creado_por uuid REFERENCES usuarios(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, numero)
);
CREATE TABLE IF NOT EXISTS devolucion_proveedor_lineas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), devolucion_id uuid NOT NULL REFERENCES devoluciones_proveedor(id) ON DELETE CASCADE,
    recepcion_linea_id uuid REFERENCES recepcion_compra_lineas(id), producto_id uuid NOT NULL REFERENCES productos(id), lote_id uuid REFERENCES lotes_stock(id),
    ubicacion_id uuid REFERENCES ubicaciones_deposito(id), cantidad numeric(18,4) NOT NULL CHECK (cantidad > 0), observacion varchar(300)
);

CREATE TABLE IF NOT EXISTS transferencias_stock (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id),
    deposito_origen_id uuid NOT NULL REFERENCES depositos(id), deposito_destino_id uuid NOT NULL REFERENCES depositos(id), numero bigint NOT NULL,
    fecha_solicitud timestamptz NOT NULL DEFAULT now(), fecha_despacho timestamptz, fecha_recepcion timestamptz,
    estado varchar(20) NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','SOLICITADA','DESPACHADA','RECIBIDA','CANCELADA')),
    observacion varchar(500), creado_por uuid REFERENCES usuarios(id), recibido_por uuid REFERENCES usuarios(id),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (deposito_origen_id <> deposito_destino_id), UNIQUE (empresa_id, numero)
);
CREATE TABLE IF NOT EXISTS transferencia_stock_lineas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), transferencia_id uuid NOT NULL REFERENCES transferencias_stock(id) ON DELETE CASCADE,
    producto_id uuid NOT NULL REFERENCES productos(id), propietario_id uuid NOT NULL REFERENCES propietarios_stock(id), lote_id uuid REFERENCES lotes_stock(id), unidad_id uuid REFERENCES unidades_identificadas(id),
    ubicacion_origen_id uuid REFERENCES ubicaciones_deposito(id), ubicacion_destino_id uuid REFERENCES ubicaciones_deposito(id),
    cantidad_solicitada numeric(18,4) NOT NULL CHECK (cantidad_solicitada > 0), cantidad_despachada numeric(18,4) NOT NULL DEFAULT 0 CHECK (cantidad_despachada >= 0),
    cantidad_recibida numeric(18,4) NOT NULL DEFAULT 0 CHECK (cantidad_recibida >= 0), CHECK (cantidad_despachada <= cantidad_solicitada), CHECK (cantidad_recibida <= cantidad_despachada)
);

CREATE TABLE IF NOT EXISTS conteos_inventario (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id), deposito_id uuid NOT NULL REFERENCES depositos(id),
    numero bigint NOT NULL, fecha_inicio timestamptz NOT NULL DEFAULT now(), fecha_cierre timestamptz,
    estado varchar(20) NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','EN_CONTEO','PENDIENTE_APROBACION','APROBADO','ANULADO')),
    observacion varchar(500), creado_por uuid REFERENCES usuarios(id), aprobado_por uuid REFERENCES usuarios(id),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (empresa_id, numero)
);
CREATE TABLE IF NOT EXISTS conteo_inventario_lineas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conteo_id uuid NOT NULL REFERENCES conteos_inventario(id) ON DELETE CASCADE,
    producto_id uuid NOT NULL REFERENCES productos(id), propietario_id uuid NOT NULL REFERENCES propietarios_stock(id), lote_id uuid REFERENCES lotes_stock(id), ubicacion_id uuid REFERENCES ubicaciones_deposito(id),
    cantidad_sistema numeric(18,4) NOT NULL DEFAULT 0 CHECK (cantidad_sistema >= 0), cantidad_contada numeric(18,4) NOT NULL DEFAULT 0 CHECK (cantidad_contada >= 0),
    diferencia numeric(18,4) GENERATED ALWAYS AS (cantidad_contada - cantidad_sistema) STORED, observacion varchar(300)
);

CREATE TABLE IF NOT EXISTS ajustes_stock (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id), deposito_id uuid NOT NULL REFERENCES depositos(id),
    numero bigint NOT NULL, fecha timestamptz NOT NULL DEFAULT now(), tipo varchar(20) NOT NULL CHECK (tipo IN ('POSITIVO','NEGATIVO','REGULARIZACION')),
    estado varchar(20) NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','PENDIENTE_APROBACION','APROBADO','ANULADO')),
    motivo varchar(300) NOT NULL, creado_por uuid REFERENCES usuarios(id), aprobado_por uuid REFERENCES usuarios(id),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (empresa_id, numero)
);
CREATE TABLE IF NOT EXISTS ajuste_stock_lineas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ajuste_id uuid NOT NULL REFERENCES ajustes_stock(id) ON DELETE CASCADE,
    producto_id uuid NOT NULL REFERENCES productos(id), propietario_id uuid NOT NULL REFERENCES propietarios_stock(id), lote_id uuid REFERENCES lotes_stock(id), unidad_id uuid REFERENCES unidades_identificadas(id),
    ubicacion_id uuid REFERENCES ubicaciones_deposito(id), cantidad numeric(18,4) NOT NULL CHECK (cantidad > 0), observacion varchar(300)
);

CREATE TABLE IF NOT EXISTS reservas_stock (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id), pedido_linea_id uuid NOT NULL REFERENCES pedido_lineas(id) ON DELETE CASCADE,
    producto_id uuid NOT NULL REFERENCES productos(id), propietario_id uuid NOT NULL REFERENCES propietarios_stock(id), deposito_id uuid NOT NULL REFERENCES depositos(id),
    ubicacion_id uuid REFERENCES ubicaciones_deposito(id), lote_id uuid REFERENCES lotes_stock(id), unidad_id uuid REFERENCES unidades_identificadas(id),
    cantidad numeric(18,4) NOT NULL CHECK (cantidad > 0), estado varchar(20) NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA','LIBERADA','CONSUMIDA','ANULADA')),
    created_at timestamptz NOT NULL DEFAULT now(), liberada_at timestamptz
);

-- Amplía la validación de la migration 002 para los documentos creados aquí.
-- El trigger existente se mantiene; CREATE OR REPLACE actualiza su función.
CREATE OR REPLACE FUNCTION fn_empresa_documento_stock(p_documento_tipo varchar, p_documento_id uuid)
RETURNS uuid AS $$
DECLARE v_empresa_id uuid;
BEGIN
    CASE p_documento_tipo
        WHEN 'PEDIDO' THEN SELECT empresa_id INTO v_empresa_id FROM pedidos WHERE id = p_documento_id;
        WHEN 'VENTA' THEN SELECT empresa_id INTO v_empresa_id FROM ventas WHERE id = p_documento_id;
        WHEN 'RECEPCION_COMPRA' THEN SELECT empresa_id INTO v_empresa_id FROM recepciones_compra WHERE id = p_documento_id;
        WHEN 'DEVOLUCION_PROVEEDOR' THEN SELECT empresa_id INTO v_empresa_id FROM devoluciones_proveedor WHERE id = p_documento_id;
        WHEN 'TRANSFERENCIA_STOCK' THEN SELECT empresa_id INTO v_empresa_id FROM transferencias_stock WHERE id = p_documento_id;
        WHEN 'AJUSTE_STOCK' THEN SELECT empresa_id INTO v_empresa_id FROM ajustes_stock WHERE id = p_documento_id;
        WHEN 'CONTEO_STOCK' THEN SELECT empresa_id INTO v_empresa_id FROM conteos_inventario WHERE id = p_documento_id;
        ELSE RAISE EXCEPTION 'El documento_tipo % no está habilitado para movimientos de stock.', COALESCE(p_documento_tipo, 'NULL');
    END CASE;
    IF v_empresa_id IS NULL THEN
        RAISE EXCEPTION 'El documento %/% no existe.', p_documento_tipo, p_documento_id;
    END IF;
    RETURN v_empresa_id;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION trg_validar_movimiento_stock()
RETURNS trigger AS $$
DECLARE
    v_empresa_producto uuid; v_empresa_propietario uuid; v_producto_lote uuid; v_propietario_lote uuid;
    v_producto_unidad uuid; v_propietario_unidad uuid;
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
    IF NEW.tipo IN ('INGRESO_COMPRA','INGRESO_TERCERO','AJUSTE_POSITIVO','DEVOLUCION_CLIENTE') AND NEW.deposito_destino_id IS NULL THEN
        RAISE EXCEPTION 'El tipo de movimiento % requiere depósito destino.', NEW.tipo;
    END IF;
    IF NEW.tipo IN ('SALIDA_VENTA','SALIDA_TERCERO','AJUSTE_NEGATIVO','DEVOLUCION_PROVEEDOR') AND NEW.deposito_origen_id IS NULL THEN
        RAISE EXCEPTION 'El tipo de movimiento % requiere depósito origen.', NEW.tipo;
    END IF;
    IF NEW.tipo = 'TRANSFERENCIA' THEN
        IF NEW.deposito_origen_id IS NULL OR NEW.deposito_destino_id IS NULL THEN RAISE EXCEPTION 'Una transferencia requiere depósito origen y destino.'; END IF;
        IF NEW.deposito_origen_id = NEW.deposito_destino_id AND COALESCE(NEW.ubicacion_origen_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(NEW.ubicacion_destino_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
            RAISE EXCEPTION 'Una transferencia debe cambiar de depósito o ubicación.';
        END IF;
    END IF;
    IF NEW.documento_id IS NOT NULL THEN
        IF fn_empresa_documento_stock(NEW.documento_tipo, NEW.documento_id) <> NEW.empresa_id THEN
            RAISE EXCEPTION 'El documento origen del movimiento debe pertenecer a la misma empresa.';
        END IF;
    ELSIF NEW.documento_tipo IS NOT NULL THEN
        RAISE EXCEPTION 'No se puede informar documento_tipo sin documento_id.';
    END IF;
    IF NEW.lote_id IS NOT NULL THEN
        SELECT producto_id, propietario_id INTO v_producto_lote, v_propietario_lote FROM lotes_stock WHERE id = NEW.lote_id;
        IF v_producto_lote IS NULL OR v_producto_lote <> NEW.producto_id OR v_propietario_lote <> NEW.propietario_id THEN RAISE EXCEPTION 'El lote del movimiento debe corresponder al mismo producto y propietario.'; END IF;
    END IF;
    IF NEW.unidad_id IS NOT NULL THEN
        SELECT producto_id, propietario_id INTO v_producto_unidad, v_propietario_unidad FROM unidades_identificadas WHERE id = NEW.unidad_id;
        IF v_producto_unidad IS NULL OR v_producto_unidad <> NEW.producto_id OR v_propietario_unidad <> NEW.propietario_id THEN RAISE EXCEPTION 'La unidad etiquetada debe corresponder al mismo producto y propietario.'; END IF;
        IF NEW.cantidad <> 1 THEN RAISE EXCEPTION 'Un movimiento por unidad etiquetada debe tener cantidad igual a 1.'; END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE INDEX IF NOT EXISTS ix_ordenes_compra_proveedor_estado ON ordenes_compra (proveedor_id, estado, fecha DESC);
CREATE INDEX IF NOT EXISTS ix_recepciones_compra_deposito_fecha ON recepciones_compra (deposito_id, fecha_recepcion DESC);
CREATE INDEX IF NOT EXISTS ix_reservas_stock_busqueda ON reservas_stock (producto_id, propietario_id, deposito_id, estado);
CREATE INDEX IF NOT EXISTS ix_facturas_proveedor_vencimiento ON facturas_proveedor (proveedor_id, estado, fecha_vencimiento);

DO $$ DECLARE t text; BEGIN
    FOREACH t IN ARRAY ARRAY['direcciones_proveedor','solicitudes_compra','ordenes_compra','recepciones_compra','facturas_proveedor','devoluciones_proveedor','transferencias_stock','conteos_inventario','ajustes_stock'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', t, t);
        EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
    END LOOP;
END $$;

INSERT INTO schema_migrations (version, description)
VALUES ('004', 'Compras, recepciones, devoluciones, transferencias, conteos, ajustes y reservas de stock')
ON CONFLICT (version) DO NOTHING;
COMMIT;
