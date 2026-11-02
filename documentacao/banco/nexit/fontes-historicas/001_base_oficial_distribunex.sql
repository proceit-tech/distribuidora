-- ============================================================================
-- DistribuNex | Migration 001 - Base oficial del sistema (REVISADA)
-- PostgreSQL 15+
-- Ejecutar UNA VEZ dentro de la base de datos "distribuidora" desde pgAdmin.
-- No ejecute la copia anterior: esta es la versión revisada antes de producción.
-- Esta migration no crea usuarios de aplicación ni datos ficticios.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version             varchar(50) PRIMARY KEY,
    description         varchar(255) NOT NULL,
    executed_at         timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------------------------
-- Configuración organizacional
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS empresas (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo              varchar(30) NOT NULL UNIQUE,
    razon_social        varchar(200) NOT NULL,
    nombre_fantasia     varchar(200),
    ruc                 varchar(20),
    dv                  varchar(5),
    email               varchar(150),
    telefono            varchar(30),
    direccion           varchar(300),
    activo              boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sucursales (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          uuid NOT NULL REFERENCES empresas(id),
    codigo              varchar(30) NOT NULL,
    nombre              varchar(150) NOT NULL,
    direccion           varchar(300),
    telefono            varchar(30),
    activo              boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, codigo)
);

CREATE TABLE IF NOT EXISTS depositos (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sucursal_id         uuid NOT NULL REFERENCES sucursales(id),
    codigo              varchar(30) NOT NULL,
    nombre              varchar(150) NOT NULL,
    permite_terceros    boolean NOT NULL DEFAULT true,
    activo              boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (sucursal_id, codigo)
);

CREATE TABLE IF NOT EXISTS ubicaciones_deposito (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    deposito_id         uuid NOT NULL REFERENCES depositos(id),
    codigo              varchar(50) NOT NULL,
    nombre              varchar(150),
    activo              boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (deposito_id, codigo)
);

CREATE TABLE IF NOT EXISTS monedas (
    codigo              varchar(3) PRIMARY KEY,
    nombre              varchar(50) NOT NULL,
    simbolo             varchar(10),
    decimales           smallint NOT NULL DEFAULT 0 CHECK (decimales BETWEEN 0 AND 6),
    activo              boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS unidades_medida (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo              varchar(20) NOT NULL UNIQUE,
    nombre              varchar(80) NOT NULL,
    activo              boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS impuestos (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo              varchar(30) NOT NULL UNIQUE,
    nombre              varchar(100) NOT NULL,
    porcentaje          numeric(7,4) NOT NULL CHECK (porcentaje >= 0),
    activo              boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS condiciones_pago (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo              varchar(30) NOT NULL UNIQUE,
    nombre              varchar(100) NOT NULL,
    dias_vencimiento    integer NOT NULL DEFAULT 0 CHECK (dias_vencimiento >= 0),
    requiere_credito    boolean NOT NULL DEFAULT false,
    activo              boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS listas_precio (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          uuid NOT NULL REFERENCES empresas(id),
    codigo              varchar(30) NOT NULL,
    nombre              varchar(120) NOT NULL,
    moneda_codigo       varchar(3) NOT NULL REFERENCES monedas(codigo),
    activo              boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, codigo)
);

-- --------------------------------------------------------------------------
-- Seguridad, usuarios, perfiles, menús y auditoría
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          uuid NOT NULL REFERENCES empresas(id),
    sucursal_id         uuid REFERENCES sucursales(id),
    nombre              varchar(100) NOT NULL,
    apellido            varchar(100) NOT NULL,
    usuario             varchar(80) NOT NULL,
    email               varchar(150),
    password_hash       varchar(255) NOT NULL,
    estado              varchar(20) NOT NULL DEFAULT 'ACTIVO'
                            CHECK (estado IN ('ACTIVO','INACTIVO','BLOQUEADO')),
    ultimo_acceso_at    timestamptz,
    password_changed_at timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, usuario),
    UNIQUE (empresa_id, email)
);

CREATE TABLE IF NOT EXISTS perfiles (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          uuid NOT NULL REFERENCES empresas(id),
    codigo              varchar(50) NOT NULL,
    nombre              varchar(100) NOT NULL,
    descripcion         varchar(300),
    es_administrador    boolean NOT NULL DEFAULT false,
    activo              boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, codigo)
);

CREATE TABLE IF NOT EXISTS permisos (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recurso             varchar(80) NOT NULL,
    accion              varchar(30) NOT NULL
                            CHECK (accion IN ('VER','CREAR','EDITAR','ANULAR','APROBAR','IMPRIMIR','EXPORTAR','ADMINISTRAR','REINTENTAR')),
    descripcion         varchar(250),
    UNIQUE (recurso, accion)
);

CREATE TABLE IF NOT EXISTS usuario_perfil (
    usuario_id          uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    perfil_id           uuid NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
    created_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (usuario_id, perfil_id)
);

CREATE TABLE IF NOT EXISTS perfil_permiso (
    perfil_id           uuid NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
    permiso_id          uuid NOT NULL REFERENCES permisos(id) ON DELETE CASCADE,
    PRIMARY KEY (perfil_id, permiso_id)
);

CREATE TABLE IF NOT EXISTS menus (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo              varchar(80) NOT NULL UNIQUE,
    nombre              varchar(100) NOT NULL,
    ruta                varchar(200),
    icono               varchar(80),
    orden               integer NOT NULL DEFAULT 0,
    menu_padre_id       uuid REFERENCES menus(id),
    permiso_id          uuid REFERENCES permisos(id),
    activo              boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS perfil_menu (
    perfil_id           uuid NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
    menu_id             uuid NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
    visible             boolean NOT NULL DEFAULT true,
    PRIMARY KEY (perfil_id, menu_id)
);

CREATE TABLE IF NOT EXISTS usuario_alcance (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id          uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo                varchar(20) NOT NULL CHECK (tipo IN ('SUCURSAL','DEPOSITO','CAJA','RUTA')),
    entidad_id          uuid NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (usuario_id, tipo, entidad_id)
);

CREATE TABLE IF NOT EXISTS sesiones_usuario (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id          uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    token_hash          varchar(255) NOT NULL UNIQUE,
    ip                  inet,
    user_agent          varchar(500),
    expira_at           timestamptz NOT NULL,
    revocada_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tokens_recuperacion_password (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id          uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    token_hash          varchar(255) NOT NULL UNIQUE,
    expira_at           timestamptz NOT NULL,
    utilizado_at        timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auditoria (
    id                  bigserial PRIMARY KEY,
    empresa_id          uuid REFERENCES empresas(id),
    usuario_id          uuid REFERENCES usuarios(id),
    accion              varchar(50) NOT NULL,
    entidad             varchar(100) NOT NULL,
    entidad_id          uuid,
    detalle_anterior    jsonb,
    detalle_nuevo       jsonb,
    ip                  inet,
    created_at          timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- Maestros comerciales
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clientes (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          uuid NOT NULL REFERENCES empresas(id),
    codigo              varchar(50) NOT NULL,
    tipo_persona        varchar(20) NOT NULL CHECK (tipo_persona IN ('FISICA','JURIDICA')),
    tipo_documento      varchar(20) NOT NULL DEFAULT 'RUC',
    numero_documento    varchar(30) NOT NULL,
    dv                  varchar(5),
    razon_social        varchar(200) NOT NULL,
    nombre_fantasia     varchar(200),
    email               varchar(150),
    telefono            varchar(30),
    limite_credito      numeric(18,2) NOT NULL DEFAULT 0 CHECK (limite_credito >= 0),
    condicion_pago_id   uuid REFERENCES condiciones_pago(id),
    lista_precio_id     uuid REFERENCES listas_precio(id),
    activo              boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, codigo)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_documento
    ON clientes (empresa_id, tipo_documento, numero_documento, COALESCE(dv, ''));

CREATE TABLE IF NOT EXISTS direcciones_cliente (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id          uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    descripcion         varchar(100) NOT NULL,
    direccion           varchar(300) NOT NULL,
    ciudad              varchar(100),
    departamento        varchar(100),
    latitud             numeric(10,7),
    longitud            numeric(10,7),
    es_fiscal           boolean NOT NULL DEFAULT false,
    es_entrega_default  boolean NOT NULL DEFAULT false,
    activo              boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS proveedores (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          uuid NOT NULL REFERENCES empresas(id),
    codigo              varchar(50) NOT NULL,
    tipo_documento      varchar(20) NOT NULL DEFAULT 'RUC',
    numero_documento    varchar(30) NOT NULL,
    dv                  varchar(5),
    razon_social        varchar(200) NOT NULL,
    email               varchar(150),
    telefono            varchar(30),
    condicion_pago_id   uuid REFERENCES condiciones_pago(id),
    activo              boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, codigo)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_proveedores_documento
    ON proveedores (empresa_id, tipo_documento, numero_documento, COALESCE(dv, ''));

CREATE TABLE IF NOT EXISTS categorias_producto (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          uuid NOT NULL REFERENCES empresas(id),
    codigo              varchar(50) NOT NULL,
    nombre              varchar(120) NOT NULL,
    categoria_padre_id  uuid REFERENCES categorias_producto(id),
    activo              boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, codigo)
);

CREATE TABLE IF NOT EXISTS marcas_producto (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          uuid NOT NULL REFERENCES empresas(id),
    nombre              varchar(120) NOT NULL,
    activo              boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, nombre)
);

CREATE TABLE IF NOT EXISTS productos (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          uuid NOT NULL REFERENCES empresas(id),
    codigo              varchar(80) NOT NULL,
    codigo_barras       varchar(80),
    descripcion         varchar(300) NOT NULL,
    categoria_id        uuid REFERENCES categorias_producto(id),
    marca_id            uuid REFERENCES marcas_producto(id),
    unidad_medida_id    uuid NOT NULL REFERENCES unidades_medida(id),
    impuesto_id         uuid REFERENCES impuestos(id),
    controla_stock      boolean NOT NULL DEFAULT true,
    modo_control_stock  varchar(25) NOT NULL DEFAULT 'CANTIDAD'
                            CHECK (modo_control_stock IN ('CANTIDAD','LOTE','UNIDAD_ETIQUETADA')),
    permite_terceros    boolean NOT NULL DEFAULT false,
    requiere_vencimiento boolean NOT NULL DEFAULT false,
    stock_minimo        numeric(18,4) NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
    stock_maximo        numeric(18,4),
    punto_reposicion    numeric(18,4),
    costo_promedio      numeric(18,4) NOT NULL DEFAULT 0 CHECK (costo_promedio >= 0),
    activo              boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, codigo),
    UNIQUE (empresa_id, codigo_barras)
);

CREATE TABLE IF NOT EXISTS producto_precios (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id         uuid NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    lista_precio_id     uuid NOT NULL REFERENCES listas_precio(id),
    precio              numeric(18,4) NOT NULL CHECK (precio >= 0),
    vigencia_desde      date NOT NULL DEFAULT CURRENT_DATE,
    vigencia_hasta      date,
    activo              boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CHECK (vigencia_hasta IS NULL OR vigencia_hasta >= vigencia_desde)
);
CREATE INDEX IF NOT EXISTS ix_producto_precios_busqueda
    ON producto_precios (producto_id, lista_precio_id, vigencia_desde DESC);

-- --------------------------------------------------------------------------
-- Inventario oficial: propio, terceros, lotes y unidades identificadas
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS propietarios_stock (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          uuid REFERENCES empresas(id),
    cliente_id          uuid REFERENCES clientes(id),
    tipo                varchar(15) NOT NULL CHECK (tipo IN ('EMPRESA','CLIENTE')),
    activo              boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CHECK ((tipo = 'EMPRESA' AND empresa_id IS NOT NULL AND cliente_id IS NULL)
        OR (tipo = 'CLIENTE' AND cliente_id IS NOT NULL AND empresa_id IS NULL)),
    UNIQUE (empresa_id),
    UNIQUE (cliente_id)
);

CREATE TABLE IF NOT EXISTS lotes_stock (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id         uuid NOT NULL REFERENCES productos(id),
    propietario_id      uuid NOT NULL REFERENCES propietarios_stock(id),
    codigo_lote         varchar(100) NOT NULL,
    fecha_fabricacion   date,
    fecha_vencimiento   date,
    estado              varchar(20) NOT NULL DEFAULT 'DISPONIBLE'
                            CHECK (estado IN ('DISPONIBLE','CUARENTENA','AGOTADO','VENCIDO')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CHECK (fecha_vencimiento IS NULL OR fecha_fabricacion IS NULL OR fecha_vencimiento >= fecha_fabricacion),
    UNIQUE (producto_id, propietario_id, codigo_lote)
);

CREATE TABLE IF NOT EXISTS unidades_identificadas (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id         uuid NOT NULL REFERENCES productos(id),
    propietario_id      uuid NOT NULL REFERENCES propietarios_stock(id),
    lote_id             uuid REFERENCES lotes_stock(id),
    deposito_id         uuid REFERENCES depositos(id),
    ubicacion_id        uuid REFERENCES ubicaciones_deposito(id),
    etiqueta            varchar(150) NOT NULL UNIQUE,
    estado              varchar(20) NOT NULL DEFAULT 'DISPONIBLE'
                            CHECK (estado IN ('DISPONIBLE','RESERVADA','DESPACHADA','CUARENTENA','DEVUELTA','BAJA')),
    fecha_vencimiento   date,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS existencias (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id         uuid NOT NULL REFERENCES productos(id),
    propietario_id      uuid NOT NULL REFERENCES propietarios_stock(id),
    deposito_id         uuid NOT NULL REFERENCES depositos(id),
    ubicacion_id        uuid REFERENCES ubicaciones_deposito(id),
    lote_id             uuid REFERENCES lotes_stock(id),
    estado_stock        varchar(20) NOT NULL DEFAULT 'DISPONIBLE'
                            CHECK (estado_stock IN ('DISPONIBLE','RESERVADO','CUARENTENA','TRANSITO')),
    cantidad_fisica     numeric(18,4) NOT NULL DEFAULT 0 CHECK (cantidad_fisica >= 0),
    cantidad_reservada  numeric(18,4) NOT NULL DEFAULT 0 CHECK (cantidad_reservada >= 0),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CHECK (cantidad_reservada <= cantidad_fisica)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_existencias_dimension
    ON existencias (
        producto_id,
        propietario_id,
        deposito_id,
        COALESCE(ubicacion_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(lote_id, '00000000-0000-0000-0000-000000000000'::uuid),
        estado_stock
    );

CREATE TABLE IF NOT EXISTS movimientos_stock (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          uuid NOT NULL REFERENCES empresas(id),
    producto_id         uuid NOT NULL REFERENCES productos(id),
    propietario_id      uuid NOT NULL REFERENCES propietarios_stock(id),
    deposito_origen_id  uuid REFERENCES depositos(id),
    deposito_destino_id uuid REFERENCES depositos(id),
    ubicacion_origen_id uuid REFERENCES ubicaciones_deposito(id),
    ubicacion_destino_id uuid REFERENCES ubicaciones_deposito(id),
    lote_id             uuid REFERENCES lotes_stock(id),
    unidad_id           uuid REFERENCES unidades_identificadas(id),
    tipo                varchar(40) NOT NULL CHECK (tipo IN (
                            'INGRESO_COMPRA','SALIDA_VENTA','RESERVA_PEDIDO','LIBERACION_RESERVA',
                            'TRANSFERENCIA','AJUSTE_POSITIVO','AJUSTE_NEGATIVO','CONTEO',
                            'INGRESO_TERCERO','SALIDA_TERCERO','DEVOLUCION_CLIENTE','DEVOLUCION_PROVEEDOR')),
    cantidad            numeric(18,4) NOT NULL CHECK (cantidad > 0),
    documento_tipo      varchar(50),
    documento_id        uuid,
    observacion         varchar(500),
    usuario_id          uuid REFERENCES usuarios(id),
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_movimientos_stock_producto_fecha ON movimientos_stock (producto_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_movimientos_stock_propietario_fecha ON movimientos_stock (propietario_id, created_at DESC);

-- --------------------------------------------------------------------------
-- Flujo comercial mínimo y trazabilidad de facturación electrónica por API
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedidos (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          uuid NOT NULL REFERENCES empresas(id),
    sucursal_id         uuid NOT NULL REFERENCES sucursales(id),
    cliente_id          uuid NOT NULL REFERENCES clientes(id),
    direccion_entrega_id uuid REFERENCES direcciones_cliente(id),
    numero              bigint NOT NULL,
    fecha               date NOT NULL DEFAULT CURRENT_DATE,
    estado              varchar(25) NOT NULL DEFAULT 'BORRADOR'
                            CHECK (estado IN ('BORRADOR','CONFIRMADO','PREPARACION','PARCIAL','DESPACHADO','ENTREGADO','CANCELADO')),
    moneda_codigo       varchar(3) NOT NULL REFERENCES monedas(codigo),
    lista_precio_id     uuid REFERENCES listas_precio(id),
    condicion_pago_id   uuid REFERENCES condiciones_pago(id),
    subtotal            numeric(18,4) NOT NULL DEFAULT 0,
    descuento_total     numeric(18,4) NOT NULL DEFAULT 0,
    impuesto_total      numeric(18,4) NOT NULL DEFAULT 0,
    total               numeric(18,4) NOT NULL DEFAULT 0,
    creado_por          uuid REFERENCES usuarios(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, numero)
);

CREATE TABLE IF NOT EXISTS pedido_lineas (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id           uuid NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    producto_id         uuid NOT NULL REFERENCES productos(id),
    descripcion         varchar(300) NOT NULL,
    cantidad            numeric(18,4) NOT NULL CHECK (cantidad > 0),
    cantidad_despachada numeric(18,4) NOT NULL DEFAULT 0 CHECK (cantidad_despachada >= 0),
    precio_unitario     numeric(18,4) NOT NULL CHECK (precio_unitario >= 0),
    descuento_porcentaje numeric(7,4) NOT NULL DEFAULT 0 CHECK (descuento_porcentaje BETWEEN 0 AND 100),
    impuesto_porcentaje numeric(7,4) NOT NULL DEFAULT 0 CHECK (impuesto_porcentaje >= 0),
    total_linea         numeric(18,4) NOT NULL CHECK (total_linea >= 0),
    CHECK (cantidad_despachada <= cantidad)
);

CREATE TABLE IF NOT EXISTS ventas (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          uuid NOT NULL REFERENCES empresas(id),
    sucursal_id         uuid NOT NULL REFERENCES sucursales(id),
    pedido_id           uuid REFERENCES pedidos(id),
    cliente_id          uuid NOT NULL REFERENCES clientes(id),
    numero              bigint NOT NULL,
    fecha               date NOT NULL DEFAULT CURRENT_DATE,
    estado              varchar(25) NOT NULL DEFAULT 'BORRADOR'
                            CHECK (estado IN ('BORRADOR','CONFIRMADA','FACTURADA','ANULADA')),
    moneda_codigo       varchar(3) NOT NULL REFERENCES monedas(codigo),
    condicion_pago_id   uuid REFERENCES condiciones_pago(id),
    subtotal            numeric(18,4) NOT NULL DEFAULT 0,
    descuento_total     numeric(18,4) NOT NULL DEFAULT 0,
    impuesto_total      numeric(18,4) NOT NULL DEFAULT 0,
    total               numeric(18,4) NOT NULL DEFAULT 0,
    creado_por          uuid REFERENCES usuarios(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, numero)
);

CREATE TABLE IF NOT EXISTS venta_lineas (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    venta_id            uuid NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    producto_id         uuid NOT NULL REFERENCES productos(id),
    descripcion         varchar(300) NOT NULL,
    cantidad            numeric(18,4) NOT NULL CHECK (cantidad > 0),
    precio_unitario     numeric(18,4) NOT NULL CHECK (precio_unitario >= 0),
    descuento_porcentaje numeric(7,4) NOT NULL DEFAULT 0 CHECK (descuento_porcentaje BETWEEN 0 AND 100),
    impuesto_porcentaje numeric(7,4) NOT NULL DEFAULT 0 CHECK (impuesto_porcentaje >= 0),
    total_linea         numeric(18,4) NOT NULL CHECK (total_linea >= 0)
);

CREATE TABLE IF NOT EXISTS documentos_electronicos (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          uuid NOT NULL REFERENCES empresas(id),
    venta_id            uuid NOT NULL REFERENCES ventas(id),
    tipo_documento      varchar(30) NOT NULL,
    idempotency_key     varchar(120) NOT NULL UNIQUE,
    estado              varchar(25) NOT NULL DEFAULT 'PENDIENTE_ENVIO'
                            CHECK (estado IN ('PENDIENTE_ENVIO','EN_PROCESO','APROBADO','RECHAZADO','ERROR_TECNICO','ANULADO','CANCELADO')),
    cdc                 varchar(80) UNIQUE,
    numero_fiscal       varchar(50),
    fecha_emision       timestamptz,
    mensaje_estado      text,
    pdf_kude_url        text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (venta_id, tipo_documento)
);

CREATE TABLE IF NOT EXISTS solicitudes_api_fiscal (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    documento_electronico_id uuid NOT NULL REFERENCES documentos_electronicos(id) ON DELETE CASCADE,
    intento             integer NOT NULL DEFAULT 1 CHECK (intento > 0),
    payload             jsonb NOT NULL,
    estado              varchar(20) NOT NULL DEFAULT 'PENDIENTE'
                            CHECK (estado IN ('PENDIENTE','ENVIADO','RESPONDIDO','ERROR')),
    enviado_at          timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (documento_electronico_id, intento)
);

CREATE TABLE IF NOT EXISTS respuestas_api_fiscal (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    solicitud_id        uuid NOT NULL REFERENCES solicitudes_api_fiscal(id) ON DELETE CASCADE,
    http_status         integer,
    payload             jsonb,
    mensaje             text,
    recibido_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS archivos_kude_pdf (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    documento_electronico_id uuid NOT NULL REFERENCES documentos_electronicos(id) ON DELETE CASCADE,
    nombre_archivo      varchar(255) NOT NULL,
    url_archivo         text NOT NULL,
    checksum_sha256     varchar(64),
    created_at          timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- Índices operativos y trigger estándar de actualización
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_clientes_razon_social ON clientes (empresa_id, razon_social);
CREATE INDEX IF NOT EXISTS ix_productos_descripcion ON productos (empresa_id, descripcion);
CREATE INDEX IF NOT EXISTS ix_pedidos_cliente_estado ON pedidos (cliente_id, estado, fecha DESC);
CREATE INDEX IF NOT EXISTS ix_ventas_cliente_fecha ON ventas (cliente_id, fecha DESC);
CREATE INDEX IF NOT EXISTS ix_documentos_electronicos_estado ON documentos_electronicos (estado, created_at DESC);

DO $$
DECLARE
    tabla text;
BEGIN
    FOREACH tabla IN ARRAY ARRAY[
        'empresas','sucursales','depositos','ubicaciones_deposito','unidades_medida','impuestos',
        'condiciones_pago','listas_precio','usuarios','perfiles','menus','clientes','direcciones_cliente',
        'proveedores','categorias_producto','marcas_producto','productos','producto_precios',
        'propietarios_stock','lotes_stock','unidades_identificadas','existencias','pedidos','ventas','documentos_electronicos'
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', tabla, tabla);
        EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', tabla, tabla);
    END LOOP;
END $$;

INSERT INTO monedas (codigo, nombre, simbolo, decimales)
VALUES ('PYG', 'Guaraní paraguayo', 'Gs.', 0)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO schema_migrations (version, description)
VALUES ('001', 'Base oficial: seguridad, maestros, inventario, ventas y API fiscal')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- Verificación rápida posterior a la ejecución:
-- SELECT version, description, executed_at FROM schema_migrations ORDER BY version;
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;