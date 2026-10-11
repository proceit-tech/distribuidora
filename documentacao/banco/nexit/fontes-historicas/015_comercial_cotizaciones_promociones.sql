-- ============================================================================
-- DistribuNex | Migration 015 - Comercial, cotizaciones y promociones
-- Ejecutar DESPUÉS de 014_reportes_operativos.sql
-- ============================================================================
BEGIN;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '014') THEN
        RAISE EXCEPTION 'La migration 014 debe ejecutarse antes de la 015.';
    END IF;
END $$;

-- Completa as sequências oficiais que possuem número próprio. A inclusão é
-- feita aqui (e para sucursais futuras) sem alterar as numerações existentes.
ALTER TABLE numeraciones_documento
    DROP CONSTRAINT IF EXISTS numeraciones_documento_tipo_documento_check;
ALTER TABLE numeraciones_documento
    ADD CONSTRAINT numeraciones_documento_tipo_documento_check CHECK (tipo_documento IN (
        'COTIZACION','PEDIDO','VENTA','FACTURA_ELECTRONICA','NOTA_CREDITO_ELECTRONICA','NOTA_DEBITO_ELECTRONICA',
        'SOLICITUD_COMPRA','ORDEN_COMPRA','RECEPCION_COMPRA','DEVOLUCION_CLIENTE','DEVOLUCION_PROVEEDOR',
        'TRANSFERENCIA_STOCK','AJUSTE_STOCK','CONTEO_STOCK','HOJA_RUTA','ENTREGA','PICKING','RENDICION_REPARTIDOR',
        'COBRO','PAGO'
    ));

INSERT INTO numeraciones_documento (empresa_id, sucursal_id, tipo_documento, proximo_numero)
SELECT s.empresa_id, s.id, t.tipo_documento, 1
  FROM sucursales s
 CROSS JOIN (VALUES
    ('COTIZACION'),('NOTA_DEBITO_ELECTRONICA'),('SOLICITUD_COMPRA'),('CONTEO_STOCK'),
    ('HOJA_RUTA'),('ENTREGA'),('PICKING'),('RENDICION_REPARTIDOR')
 ) AS t(tipo_documento)
 WHERE s.activo
ON CONFLICT (empresa_id, sucursal_id, tipo_documento) WHERE sucursal_id IS NOT NULL DO NOTHING;

CREATE TABLE IF NOT EXISTS canales_venta (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES empresas(id),
    codigo varchar(30) NOT NULL, nombre varchar(100) NOT NULL,
    activo boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, codigo)
);

CREATE TABLE IF NOT EXISTS zonas_comerciales (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES empresas(id),
    codigo varchar(30) NOT NULL, nombre varchar(100) NOT NULL,
    descripcion varchar(300), activo boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, codigo)
);

CREATE TABLE IF NOT EXISTS vendedores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES empresas(id), usuario_id uuid REFERENCES usuarios(id),
    codigo varchar(30) NOT NULL, nombre varchar(200) NOT NULL,
    zona_id uuid REFERENCES zonas_comerciales(id), canal_venta_id uuid REFERENCES canales_venta(id),
    porcentaje_comision numeric(7,4) NOT NULL DEFAULT 0 CHECK (porcentaje_comision BETWEEN 0 AND 100),
    activo boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, codigo), UNIQUE (usuario_id)
);

CREATE TABLE IF NOT EXISTS cliente_zona_comercial (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    zona_id uuid NOT NULL REFERENCES zonas_comerciales(id),
    fecha_desde date NOT NULL DEFAULT current_date, fecha_hasta date,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (fecha_hasta IS NULL OR fecha_hasta >= fecha_desde),
    UNIQUE (cliente_id, zona_id, fecha_desde)
);

CREATE TABLE IF NOT EXISTS cotizaciones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES empresas(id), sucursal_id uuid NOT NULL REFERENCES sucursales(id),
    cliente_id uuid NOT NULL REFERENCES clientes(id), vendedor_id uuid REFERENCES vendedores(id),
    canal_venta_id uuid REFERENCES canales_venta(id), lista_precio_id uuid REFERENCES listas_precio(id),
    numero bigint NOT NULL, fecha date NOT NULL DEFAULT current_date, fecha_validez date,
    estado varchar(20) NOT NULL DEFAULT 'BORRADOR'
        CHECK (estado IN ('BORRADOR','ENVIADA','ACEPTADA','RECHAZADA','VENCIDA','CANCELADA','CONVERTIDA')),
    moneda_codigo varchar(3) NOT NULL REFERENCES monedas(codigo),
    subtotal numeric(18,4) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    descuento_total numeric(18,4) NOT NULL DEFAULT 0 CHECK (descuento_total >= 0),
    impuesto_total numeric(18,4) NOT NULL DEFAULT 0 CHECK (impuesto_total >= 0),
    total numeric(18,4) NOT NULL DEFAULT 0 CHECK (total >= 0),
    observacion varchar(500), creado_por uuid REFERENCES usuarios(id), aprobado_por uuid REFERENCES usuarios(id),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (fecha_validez IS NULL OR fecha_validez >= fecha), UNIQUE (empresa_id, numero)
);

CREATE TABLE IF NOT EXISTS cotizacion_lineas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cotizacion_id uuid NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
    producto_id uuid NOT NULL REFERENCES productos(id), descripcion varchar(300) NOT NULL,
    cantidad numeric(18,4) NOT NULL CHECK (cantidad > 0),
    precio_lista numeric(18,4) NOT NULL CHECK (precio_lista >= 0),
    precio_unitario numeric(18,4) NOT NULL CHECK (precio_unitario >= 0),
    descuento_porcentaje numeric(7,4) NOT NULL DEFAULT 0 CHECK (descuento_porcentaje BETWEEN 0 AND 100),
    impuesto_porcentaje numeric(7,4) NOT NULL DEFAULT 0 CHECK (impuesto_porcentaje >= 0),
    total_linea numeric(18,4) NOT NULL CHECK (total_linea >= 0),
    promocion_id uuid, observacion varchar(300)
);

CREATE TABLE IF NOT EXISTS promociones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id),
    codigo varchar(50) NOT NULL, nombre varchar(150) NOT NULL,
    fecha_desde date NOT NULL, fecha_hasta date NOT NULL,
    prioridad smallint NOT NULL DEFAULT 0, acumulable boolean NOT NULL DEFAULT false,
    estado varchar(20) NOT NULL DEFAULT 'BORRADOR'
        CHECK (estado IN ('BORRADOR','ACTIVA','SUSPENDIDA','FINALIZADA','CANCELADA')),
    lista_precio_id uuid REFERENCES listas_precio(id), canal_venta_id uuid REFERENCES canales_venta(id),
    observacion varchar(500), creado_por uuid REFERENCES usuarios(id),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (fecha_hasta >= fecha_desde), UNIQUE (empresa_id, codigo)
);

CREATE TABLE IF NOT EXISTS promocion_productos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), promocion_id uuid NOT NULL REFERENCES promociones(id) ON DELETE CASCADE,
    producto_id uuid NOT NULL REFERENCES productos(id), cantidad_minima numeric(18,4) NOT NULL DEFAULT 1 CHECK (cantidad_minima > 0),
    tipo_beneficio varchar(20) NOT NULL CHECK (tipo_beneficio IN ('PORCENTAJE','IMPORTE','PRECIO_FIJO')),
    valor_beneficio numeric(18,4) NOT NULL CHECK (valor_beneficio >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (promocion_id, producto_id, cantidad_minima),
    CHECK (tipo_beneficio <> 'PORCENTAJE' OR valor_beneficio <= 100)
);

CREATE TABLE IF NOT EXISTS autorizaciones_comerciales (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id),
    tipo varchar(30) NOT NULL CHECK (tipo IN ('DESCUENTO','CREDITO','PRECIO_ESPECIAL','ANULACION_COMERCIAL')),
    entidad_tipo varchar(30) NOT NULL CHECK (entidad_tipo IN ('COTIZACION','PEDIDO','VENTA')),
    entidad_id uuid NOT NULL, solicitado_por uuid NOT NULL REFERENCES usuarios(id),
    aprobado_por uuid REFERENCES usuarios(id), estado varchar(20) NOT NULL DEFAULT 'PENDIENTE'
        CHECK (estado IN ('PENDIENTE','APROBADA','RECHAZADA','CANCELADA')),
    motivo varchar(500) NOT NULL, valor_solicitado numeric(18,4), valor_aprobado numeric(18,4),
    solicitada_at timestamptz NOT NULL DEFAULT now(), resuelta_at timestamptz, observacion_resolucion varchar(500),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_autorizacion_comercial_pendiente
    ON autorizaciones_comerciales (empresa_id, tipo, entidad_tipo, entidad_id)
    WHERE estado = 'PENDIENTE';

ALTER TABLE pedidos
    ADD COLUMN IF NOT EXISTS cotizacion_id uuid REFERENCES cotizaciones(id),
    ADD COLUMN IF NOT EXISTS vendedor_id uuid REFERENCES vendedores(id),
    ADD COLUMN IF NOT EXISTS canal_venta_id uuid REFERENCES canales_venta(id);
ALTER TABLE ventas
    ADD COLUMN IF NOT EXISTS cotizacion_id uuid REFERENCES cotizaciones(id),
    ADD COLUMN IF NOT EXISTS vendedor_id uuid REFERENCES vendedores(id),
    ADD COLUMN IF NOT EXISTS canal_venta_id uuid REFERENCES canales_venta(id);
ALTER TABLE cotizacion_lineas
    ADD CONSTRAINT fk_cotizacion_linea_promocion FOREIGN KEY (promocion_id) REFERENCES promociones(id);

CREATE OR REPLACE FUNCTION trg_validar_vendedor()
RETURNS trigger AS $$
BEGIN
    IF NEW.usuario_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.usuario_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El usuario del vendedor debe pertenecer a la misma empresa.'; END IF;
    IF NEW.zona_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM zonas_comerciales WHERE id = NEW.zona_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'La zona del vendedor debe pertenecer a la misma empresa.'; END IF;
    IF NEW.canal_venta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM canales_venta WHERE id = NEW.canal_venta_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El canal del vendedor debe pertenecer a la misma empresa.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_cliente_zona_comercial()
RETURNS trigger AS $$
DECLARE v_empresa_cliente uuid; v_empresa_zona uuid;
BEGIN
    SELECT empresa_id INTO v_empresa_cliente FROM clientes WHERE id = NEW.cliente_id;
    SELECT empresa_id INTO v_empresa_zona FROM zonas_comerciales WHERE id = NEW.zona_id;
    IF v_empresa_cliente IS NULL OR v_empresa_cliente <> v_empresa_zona THEN RAISE EXCEPTION 'El cliente y la zona comercial deben pertenecer a la misma empresa.'; END IF;
    IF EXISTS (SELECT 1 FROM cliente_zona_comercial z WHERE z.cliente_id = NEW.cliente_id AND z.id <> NEW.id
        AND daterange(z.fecha_desde, COALESCE(z.fecha_hasta, 'infinity'::date), '[]') && daterange(NEW.fecha_desde, COALESCE(NEW.fecha_hasta, 'infinity'::date), '[]')) THEN
        RAISE EXCEPTION 'El cliente ya tiene una zona comercial asignada para el período indicado.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_cotizacion()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = NEW.sucursal_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'La sucursal debe pertenecer a la misma empresa.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM clientes WHERE id = NEW.cliente_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El cliente debe pertenecer a la misma empresa.'; END IF;
    IF NEW.vendedor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vendedores WHERE id = NEW.vendedor_id AND empresa_id = NEW.empresa_id AND activo) THEN RAISE EXCEPTION 'El vendedor debe estar activo y pertenecer a la misma empresa.'; END IF;
    IF NEW.canal_venta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM canales_venta WHERE id = NEW.canal_venta_id AND empresa_id = NEW.empresa_id AND activo) THEN RAISE EXCEPTION 'El canal de venta debe estar activo y pertenecer a la misma empresa.'; END IF;
    IF NEW.lista_precio_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM listas_precio WHERE id = NEW.lista_precio_id AND empresa_id = NEW.empresa_id AND moneda_codigo = NEW.moneda_codigo AND activo) THEN RAISE EXCEPTION 'La lista de precio debe pertenecer a la empresa, estar activa y usar la misma moneda.'; END IF;
    IF NEW.creado_por IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.creado_por AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El creador debe pertenecer a la misma empresa.'; END IF;
    IF NEW.aprobado_por IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.aprobado_por AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El aprobador debe pertenecer a la misma empresa.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_cotizacion_linea()
RETURNS trigger AS $$
DECLARE v_empresa uuid;
BEGIN
    SELECT empresa_id INTO v_empresa FROM cotizaciones WHERE id = NEW.cotizacion_id;
    IF v_empresa IS NULL OR NOT EXISTS (SELECT 1 FROM productos WHERE id = NEW.producto_id AND empresa_id = v_empresa) THEN RAISE EXCEPTION 'El producto debe pertenecer a la misma empresa de la cotización.'; END IF;
    IF NEW.promocion_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM promociones WHERE id = NEW.promocion_id AND empresa_id = v_empresa) THEN RAISE EXCEPTION 'La promoción debe pertenecer a la misma empresa de la cotización.'; END IF;
    IF NEW.promocion_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM promocion_productos WHERE promocion_id = NEW.promocion_id AND producto_id = NEW.producto_id) THEN RAISE EXCEPTION 'El producto de la línea debe estar incluido en la promoción informada.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_promocion()
RETURNS trigger AS $$
BEGIN
    IF NEW.lista_precio_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM listas_precio WHERE id = NEW.lista_precio_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'La lista de precio debe pertenecer a la misma empresa.'; END IF;
    IF NEW.canal_venta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM canales_venta WHERE id = NEW.canal_venta_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El canal debe pertenecer a la misma empresa.'; END IF;
    IF NEW.creado_por IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.creado_por AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El creador debe pertenecer a la misma empresa.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_promocion_producto()
RETURNS trigger AS $$
DECLARE v_empresa uuid;
BEGIN
    SELECT empresa_id INTO v_empresa FROM promociones WHERE id = NEW.promocion_id;
    IF v_empresa IS NULL OR NOT EXISTS (SELECT 1 FROM productos WHERE id = NEW.producto_id AND empresa_id = v_empresa) THEN RAISE EXCEPTION 'El producto debe pertenecer a la misma empresa de la promoción.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_autorizacion_comercial()
RETURNS trigger AS $$
DECLARE v_empresa_entidad uuid;
BEGIN
    CASE NEW.entidad_tipo
        WHEN 'COTIZACION' THEN SELECT empresa_id INTO v_empresa_entidad FROM cotizaciones WHERE id = NEW.entidad_id;
        WHEN 'PEDIDO' THEN SELECT empresa_id INTO v_empresa_entidad FROM pedidos WHERE id = NEW.entidad_id;
        WHEN 'VENTA' THEN SELECT empresa_id INTO v_empresa_entidad FROM ventas WHERE id = NEW.entidad_id;
    END CASE;
    IF v_empresa_entidad IS NULL OR v_empresa_entidad <> NEW.empresa_id THEN RAISE EXCEPTION 'La entidad comercial debe pertenecer a la misma empresa.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.solicitado_por AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El solicitante debe pertenecer a la misma empresa.'; END IF;
    IF NEW.aprobado_por IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.aprobado_por AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El aprobador debe pertenecer a la misma empresa.'; END IF;
    IF NEW.estado IN ('APROBADA','RECHAZADA') AND (NEW.aprobado_por IS NULL OR NEW.resuelta_at IS NULL) THEN RAISE EXCEPTION 'La autorización resuelta requiere aprobador y fecha de resolución.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_referencia_comercial_documento()
RETURNS trigger AS $$
BEGIN
    IF NEW.cotizacion_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cotizaciones WHERE id = NEW.cotizacion_id AND empresa_id = NEW.empresa_id AND cliente_id = NEW.cliente_id AND estado IN ('ACEPTADA','CONVERTIDA')) THEN RAISE EXCEPTION 'La cotización debe estar aceptada y pertenecer a la misma empresa y cliente.'; END IF;
    IF NEW.vendedor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vendedores WHERE id = NEW.vendedor_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El vendedor debe pertenecer a la misma empresa.'; END IF;
    IF NEW.canal_venta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM canales_venta WHERE id = NEW.canal_venta_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El canal debe pertenecer a la misma empresa.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_sucursal_crear_numeracion_cotizacion()
RETURNS trigger AS $$
BEGIN
    INSERT INTO numeraciones_documento (empresa_id, sucursal_id, tipo_documento, proximo_numero)
    SELECT NEW.empresa_id, NEW.id, t.tipo_documento, 1
      FROM (VALUES
        ('COTIZACION'),('NOTA_DEBITO_ELECTRONICA'),('SOLICITUD_COMPRA'),('CONTEO_STOCK'),
        ('HOJA_RUTA'),('ENTREGA'),('PICKING'),('RENDICION_REPARTIDOR')
      ) AS t(tipo_documento)
    ON CONFLICT (empresa_id, sucursal_id, tipo_documento) WHERE sucursal_id IS NOT NULL DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vendedores_validar_integridad BEFORE INSERT OR UPDATE ON vendedores FOR EACH ROW EXECUTE FUNCTION trg_validar_vendedor();
CREATE TRIGGER trg_cliente_zona_comercial_validar_integridad BEFORE INSERT OR UPDATE ON cliente_zona_comercial FOR EACH ROW EXECUTE FUNCTION trg_validar_cliente_zona_comercial();
CREATE TRIGGER trg_cotizaciones_validar_integridad BEFORE INSERT OR UPDATE ON cotizaciones FOR EACH ROW EXECUTE FUNCTION trg_validar_cotizacion();
CREATE TRIGGER trg_cotizacion_lineas_validar_integridad BEFORE INSERT OR UPDATE ON cotizacion_lineas FOR EACH ROW EXECUTE FUNCTION trg_validar_cotizacion_linea();
CREATE TRIGGER trg_promociones_validar_integridad BEFORE INSERT OR UPDATE ON promociones FOR EACH ROW EXECUTE FUNCTION trg_validar_promocion();
CREATE TRIGGER trg_promocion_productos_validar_integridad BEFORE INSERT OR UPDATE ON promocion_productos FOR EACH ROW EXECUTE FUNCTION trg_validar_promocion_producto();
CREATE TRIGGER trg_autorizaciones_comerciales_validar_integridad BEFORE INSERT OR UPDATE ON autorizaciones_comerciales FOR EACH ROW EXECUTE FUNCTION trg_validar_autorizacion_comercial();
CREATE TRIGGER trg_pedidos_validar_referencia_comercial BEFORE INSERT OR UPDATE ON pedidos FOR EACH ROW EXECUTE FUNCTION trg_validar_referencia_comercial_documento();
CREATE TRIGGER trg_ventas_validar_referencia_comercial BEFORE INSERT OR UPDATE ON ventas FOR EACH ROW EXECUTE FUNCTION trg_validar_referencia_comercial_documento();
CREATE TRIGGER trg_sucursales_crear_numeracion_cotizacion AFTER INSERT ON sucursales FOR EACH ROW EXECUTE FUNCTION trg_sucursal_crear_numeracion_cotizacion();

DO $$ DECLARE t text; BEGIN
    FOREACH t IN ARRAY ARRAY['canales_venta','zonas_comerciales','vendedores','cotizaciones','promociones','autorizaciones_comerciales'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', t, t);
        EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
    END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS ix_vendedores_zona ON vendedores (empresa_id, zona_id) WHERE activo;
CREATE INDEX IF NOT EXISTS ix_cotizaciones_cliente_estado ON cotizaciones (cliente_id, estado, fecha DESC);
CREATE INDEX IF NOT EXISTS ix_promociones_vigencia ON promociones (empresa_id, estado, fecha_desde, fecha_hasta);
CREATE INDEX IF NOT EXISTS ix_promocion_productos_producto ON promocion_productos (producto_id, promocion_id);
CREATE INDEX IF NOT EXISTS ix_autorizaciones_comerciales_estado ON autorizaciones_comerciales (empresa_id, estado, solicitada_at DESC);

INSERT INTO schema_migrations (version, description)
VALUES ('015', 'Canales, vendedores, cotizaciones, promociones y autorizaciones comerciales')
ON CONFLICT (version) DO NOTHING;
COMMIT;