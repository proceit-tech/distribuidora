-- ============================================================================
-- DistribuNex | Migration 005 - Logística, entregas y devoluciones
-- Ejecutar DESPUÉS de 004_compras_inventario.sql
-- ============================================================================
BEGIN;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '004') THEN
        RAISE EXCEPTION 'La migration 004 debe ejecutarse antes de la 005.';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS vehiculos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id),
    codigo varchar(30) NOT NULL, placa varchar(20), descripcion varchar(150) NOT NULL,
    capacidad_peso numeric(18,4), capacidad_volumen numeric(18,4), activo boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, codigo), UNIQUE (empresa_id, placa)
);

CREATE TABLE IF NOT EXISTS rutas_entrega (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id), sucursal_id uuid NOT NULL REFERENCES sucursales(id),
    codigo varchar(30) NOT NULL, nombre varchar(120) NOT NULL, zona varchar(100), activo boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (empresa_id, codigo)
);

CREATE TABLE IF NOT EXISTS hojas_ruta (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id), sucursal_id uuid NOT NULL REFERENCES sucursales(id),
    ruta_id uuid REFERENCES rutas_entrega(id), vehiculo_id uuid REFERENCES vehiculos(id), repartidor_id uuid REFERENCES usuarios(id),
    numero bigint NOT NULL, fecha date NOT NULL DEFAULT current_date,
    estado varchar(20) NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','PROGRAMADA','EN_RUTA','CERRADA','ANULADA')),
    hora_salida timestamptz, hora_regreso timestamptz, observacion varchar(500), creado_por uuid REFERENCES usuarios(id),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (empresa_id, numero)
);

CREATE TABLE IF NOT EXISTS entregas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id), sucursal_id uuid NOT NULL REFERENCES sucursales(id),
    pedido_id uuid REFERENCES pedidos(id), venta_id uuid REFERENCES ventas(id), cliente_id uuid NOT NULL REFERENCES clientes(id),
    direccion_entrega_id uuid REFERENCES direcciones_cliente(id), hoja_ruta_id uuid REFERENCES hojas_ruta(id), numero bigint NOT NULL,
    estado varchar(25) NOT NULL DEFAULT 'PROGRAMADA' CHECK (estado IN ('PROGRAMADA','EN_RUTA','ENTREGADA','PARCIAL','NO_ENTREGADA','DEVUELTA','CERRADA','ANULADA')),
    fecha_programada date NOT NULL DEFAULT current_date, fecha_entrega timestamptz,
    receptor_nombre varchar(200), receptor_documento varchar(50), observacion varchar(500), creado_por uuid REFERENCES usuarios(id),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (empresa_id, numero),
    CHECK (pedido_id IS NOT NULL OR venta_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS entrega_lineas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entrega_id uuid NOT NULL REFERENCES entregas(id) ON DELETE CASCADE,
    pedido_linea_id uuid REFERENCES pedido_lineas(id), venta_linea_id uuid REFERENCES venta_lineas(id), producto_id uuid NOT NULL REFERENCES productos(id),
    cantidad_programada numeric(18,4) NOT NULL CHECK (cantidad_programada > 0), cantidad_entregada numeric(18,4) NOT NULL DEFAULT 0 CHECK (cantidad_entregada >= 0),
    cantidad_devuelta numeric(18,4) NOT NULL DEFAULT 0 CHECK (cantidad_devuelta >= 0), observacion varchar(300),
    CHECK (cantidad_entregada + cantidad_devuelta <= cantidad_programada)
);
CREATE TABLE IF NOT EXISTS incidencias_entrega (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entrega_id uuid NOT NULL REFERENCES entregas(id) ON DELETE CASCADE,
    tipo varchar(30) NOT NULL CHECK (tipo IN ('CLIENTE_AUSENTE','DIRECCION_INCORRECTA','RECHAZO','FALTANTE','DANIO','OTRO')),
    descripcion varchar(500) NOT NULL, registrada_por uuid REFERENCES usuarios(id), resuelta_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS evidencias_entrega (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entrega_id uuid NOT NULL REFERENCES entregas(id) ON DELETE CASCADE,
    tipo varchar(20) NOT NULL CHECK (tipo IN ('FOTO','FIRMA','DOCUMENTO','UBICACION')),
    url_archivo text, latitud numeric(10,7), longitud numeric(10,7), observacion varchar(300), created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS devoluciones_cliente (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id), sucursal_id uuid NOT NULL REFERENCES sucursales(id),
    deposito_id uuid NOT NULL REFERENCES depositos(id), cliente_id uuid NOT NULL REFERENCES clientes(id), venta_id uuid REFERENCES ventas(id), entrega_id uuid REFERENCES entregas(id),
    numero bigint NOT NULL, fecha timestamptz NOT NULL DEFAULT now(),
    estado varchar(25) NOT NULL DEFAULT 'SOLICITADA' CHECK (estado IN ('SOLICITADA','APROBADA','RECIBIDA','RECHAZADA','CERRADA','ANULADA')),
    destino_stock varchar(20) NOT NULL DEFAULT 'CUARENTENA' CHECK (destino_stock IN ('DISPONIBLE','CUARENTENA','BAJA')),
    motivo varchar(300) NOT NULL, observacion varchar(500), creado_por uuid REFERENCES usuarios(id), aprobado_por uuid REFERENCES usuarios(id),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (empresa_id, numero)
);
CREATE TABLE IF NOT EXISTS devolucion_cliente_lineas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), devolucion_id uuid NOT NULL REFERENCES devoluciones_cliente(id) ON DELETE CASCADE,
    venta_linea_id uuid REFERENCES venta_lineas(id), producto_id uuid NOT NULL REFERENCES productos(id), lote_id uuid REFERENCES lotes_stock(id), unidad_id uuid REFERENCES unidades_identificadas(id),
    ubicacion_id uuid REFERENCES ubicaciones_deposito(id), cantidad numeric(18,4) NOT NULL CHECK (cantidad > 0), estado_calidad varchar(20) NOT NULL DEFAULT 'PENDIENTE'
        CHECK (estado_calidad IN ('PENDIENTE','APROBADA','CUARENTENA','BAJA')), observacion varchar(300)
);

CREATE TABLE IF NOT EXISTS contratos_almacenamiento (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id), cliente_id uuid NOT NULL REFERENCES clientes(id), deposito_id uuid NOT NULL REFERENCES depositos(id),
    codigo varchar(50) NOT NULL, fecha_inicio date NOT NULL, fecha_fin date, estado varchar(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('BORRADOR','ACTIVO','SUSPENDIDO','CERRADO')),
    tarifa_mensual numeric(18,4), moneda_codigo varchar(3) REFERENCES monedas(codigo), observacion varchar(500),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (empresa_id, codigo),
    CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

-- Amplía los documentos aceptados por el trigger de movimientos de stock.
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
        WHEN 'DEVOLUCION_CLIENTE' THEN SELECT empresa_id INTO v_empresa_id FROM devoluciones_cliente WHERE id = p_documento_id;
        ELSE RAISE EXCEPTION 'El documento_tipo % no está habilitado para movimientos de stock.', COALESCE(p_documento_tipo, 'NULL');
    END CASE;
    IF v_empresa_id IS NULL THEN RAISE EXCEPTION 'El documento %/% no existe.', p_documento_tipo, p_documento_id; END IF;
    RETURN v_empresa_id;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE INDEX IF NOT EXISTS ix_entregas_hoja_estado ON entregas (hoja_ruta_id, estado);
CREATE INDEX IF NOT EXISTS ix_entregas_cliente_fecha ON entregas (cliente_id, fecha_programada DESC);
CREATE INDEX IF NOT EXISTS ix_devoluciones_cliente_estado ON devoluciones_cliente (cliente_id, estado, fecha DESC);
CREATE INDEX IF NOT EXISTS ix_contratos_almacenamiento_cliente ON contratos_almacenamiento (cliente_id, estado);

DO $$ DECLARE t text; BEGIN
    FOREACH t IN ARRAY ARRAY['vehiculos','rutas_entrega','hojas_ruta','entregas','devoluciones_cliente','contratos_almacenamiento'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', t, t);
        EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
    END LOOP;
END $$;

INSERT INTO schema_migrations (version, description)
VALUES ('005', 'Logística, rutas, entregas, devoluciones de clientes y almacenaje de terceros')
ON CONFLICT (version) DO NOTHING;
COMMIT;