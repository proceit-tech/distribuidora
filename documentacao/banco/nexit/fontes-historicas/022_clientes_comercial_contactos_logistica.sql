-- =============================================================================
-- 022 - Clientes: configuración comercial, contactos, direcciones y logística
-- DistribuNex
--
-- Migración aditiva. No elimina ni cambia datos ya registrados.
-- Requiere que estén aplicadas las migraciones 018, 019, 020 y 021.
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '021') THEN
        RAISE EXCEPTION
            'Debe ejecutar primero las migraciones hasta la versión 021.';
    END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- Grupos comerciales de clientes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grupos_cliente (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      uuid NOT NULL REFERENCES empresas(id),
    codigo          varchar(30) NOT NULL,
    nombre          varchar(120) NOT NULL,
    descripcion     varchar(300),
    activo          boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, codigo)
);

-- -----------------------------------------------------------------------------
-- Preferencias comerciales, crédito, entrega y comunicación del cliente.
-- Los datos propios del receptor SIFEN creados en 018/019 se preservan.
-- -----------------------------------------------------------------------------
ALTER TABLE clientes
    ADD COLUMN IF NOT EXISTS grupo_cliente_id uuid REFERENCES grupos_cliente(id),
    ADD COLUMN IF NOT EXISTS moneda_codigo_predeterminada varchar(3) REFERENCES monedas(codigo),
    ADD COLUMN IF NOT EXISTS descuento_comercial_pct numeric(7,4) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS limite_credito_temporal numeric(18,2),
    ADD COLUMN IF NOT EXISTS fecha_vencimiento_credito date,
    ADD COLUMN IF NOT EXISTS bloqueado_ventas boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS motivo_bloqueo_ventas varchar(500),
    ADD COLUMN IF NOT EXISTS bloqueado_ventas_at timestamptz,
    ADD COLUMN IF NOT EXISTS bloqueado_ventas_por uuid REFERENCES usuarios(id),
    ADD COLUMN IF NOT EXISTS dia_preferido_cobro smallint,
    ADD COLUMN IF NOT EXISTS ruta_entrega_id uuid REFERENCES rutas_entrega(id),
    ADD COLUMN IF NOT EXISTS zona_comercial_id uuid REFERENCES zonas_comerciales(id),
    ADD COLUMN IF NOT EXISTS vendedor_id uuid REFERENCES vendedores(id),
    ADD COLUMN IF NOT EXISTS frecuencia_entrega varchar(20),
    ADD COLUMN IF NOT EXISTS dias_entrega smallint[],
    ADD COLUMN IF NOT EXISTS requiere_orden_compra boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS email_facturacion varchar(150),
    ADD COLUMN IF NOT EXISTS email_cobranzas varchar(150),
    ADD COLUMN IF NOT EXISTS recibe_documento_electronico boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS observacion_comercial varchar(1000),
    ADD COLUMN IF NOT EXISTS observacion_logistica varchar(1000);

ALTER TABLE clientes
    DROP CONSTRAINT IF EXISTS ck_clientes_descuento_comercial,
    ADD CONSTRAINT ck_clientes_descuento_comercial
        CHECK (descuento_comercial_pct BETWEEN 0 AND 100),
    DROP CONSTRAINT IF EXISTS ck_clientes_credito_temporal,
    ADD CONSTRAINT ck_clientes_credito_temporal
        CHECK (limite_credito_temporal IS NULL OR limite_credito_temporal >= 0),
    DROP CONSTRAINT IF EXISTS ck_clientes_dia_cobro,
    ADD CONSTRAINT ck_clientes_dia_cobro
        CHECK (dia_preferido_cobro IS NULL OR dia_preferido_cobro BETWEEN 1 AND 31),
    DROP CONSTRAINT IF EXISTS ck_clientes_frecuencia_entrega,
    ADD CONSTRAINT ck_clientes_frecuencia_entrega
        CHECK (frecuencia_entrega IS NULL OR frecuencia_entrega IN (
            'DIARIA', 'SEMANAL', 'QUINCENAL', 'MENSUAL', 'A_DEMANDA'
        )),
    DROP CONSTRAINT IF EXISTS ck_clientes_dias_entrega,
    ADD CONSTRAINT ck_clientes_dias_entrega
        CHECK (
            dias_entrega IS NULL
            OR dias_entrega <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[]
        ),
    DROP CONSTRAINT IF EXISTS ck_clientes_bloqueo_ventas,
    ADD CONSTRAINT ck_clientes_bloqueo_ventas
        CHECK (
            bloqueado_ventas = false
            OR btrim(coalesce(motivo_bloqueo_ventas, '')) <> ''
        ),
    DROP CONSTRAINT IF EXISTS ck_clientes_vencimiento_credito,
    ADD CONSTRAINT ck_clientes_vencimiento_credito
        CHECK (
            fecha_vencimiento_credito IS NULL
            OR limite_credito_temporal IS NOT NULL
        );

-- -----------------------------------------------------------------------------
-- Se amplía la dirección existente. Continúa siendo compatible con entregas.
-- Los códigos y descripciones permiten construir el DE SIFEN sin depender de
-- texto libre. No se obliga una dirección a los clientes del exterior.
-- -----------------------------------------------------------------------------
ALTER TABLE direcciones_cliente
    ADD COLUMN IF NOT EXISTS tipo varchar(20) NOT NULL DEFAULT 'COMERCIAL',
    ADD COLUMN IF NOT EXISTS etiqueta varchar(100),
    ADD COLUMN IF NOT EXISTS numero_casa varchar(20),
    ADD COLUMN IF NOT EXISTS complemento varchar(200),
    ADD COLUMN IF NOT EXISTS pais_codigo varchar(3) NOT NULL DEFAULT 'PRY',
    ADD COLUMN IF NOT EXISTS pais_nombre varchar(30) NOT NULL DEFAULT 'Paraguay',
    ADD COLUMN IF NOT EXISTS departamento_codigo varchar(2),
    ADD COLUMN IF NOT EXISTS distrito_codigo varchar(4),
    ADD COLUMN IF NOT EXISTS ciudad_codigo varchar(5),
    ADD COLUMN IF NOT EXISTS codigo_postal varchar(15),
    ADD COLUMN IF NOT EXISTS contacto_nombre varchar(200),
    ADD COLUMN IF NOT EXISTS contacto_telefono varchar(30),
    ADD COLUMN IF NOT EXISTS horario_recepcion varchar(200),
    ADD COLUMN IF NOT EXISTS observacion varchar(500);

ALTER TABLE direcciones_cliente
    DROP CONSTRAINT IF EXISTS ck_direcciones_cliente_tipo,
    ADD CONSTRAINT ck_direcciones_cliente_tipo
        CHECK (tipo IN ('FISCAL', 'COMERCIAL', 'ENTREGA', 'SUCURSAL', 'OTRA'));

CREATE UNIQUE INDEX IF NOT EXISTS ux_direcciones_cliente_fiscal
    ON direcciones_cliente(cliente_id)
    WHERE es_fiscal AND activo;

CREATE UNIQUE INDEX IF NOT EXISTS ux_direcciones_cliente_entrega_default
    ON direcciones_cliente(cliente_id)
    WHERE es_entrega_default AND activo;

-- -----------------------------------------------------------------------------
-- Contactos: se separan del cliente porque un cliente puede tener responsables
-- distintos de pedidos, facturación, cobranza y recepción.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cliente_contactos (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id                  uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    nombre                      varchar(100) NOT NULL,
    apellido                    varchar(100),
    cargo                       varchar(100),
    departamento                varchar(100),
    telefono                    varchar(30),
    celular                     varchar(30),
    email                       varchar(150),
    es_principal                boolean NOT NULL DEFAULT false,
    recibe_pedidos              boolean NOT NULL DEFAULT false,
    recibe_facturacion          boolean NOT NULL DEFAULT false,
    recibe_cobranzas            boolean NOT NULL DEFAULT false,
    recibe_documentos_electronicos boolean NOT NULL DEFAULT false,
    recibe_notificaciones       boolean NOT NULL DEFAULT true,
    activo                      boolean NOT NULL DEFAULT true,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_cliente_contacto_principal
    ON cliente_contactos(cliente_id)
    WHERE es_principal AND activo;

-- -----------------------------------------------------------------------------
-- Documentos comerciales: metadatos y URL segura. El archivo físico se gestiona
-- en el módulo de almacenamiento, no dentro de PostgreSQL.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cliente_documentos (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id          uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    tipo                varchar(30) NOT NULL,
    nombre_archivo      varchar(255) NOT NULL,
    url_archivo         text NOT NULL,
    fecha_emision       date,
    fecha_vencimiento   date,
    observacion         varchar(500),
    cargado_por         uuid REFERENCES usuarios(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CHECK (tipo IN ('RUC', 'CONTRATO', 'CREDITO', 'EXONERACION', 'OTRO')),
    CHECK (fecha_vencimiento IS NULL OR fecha_emision IS NULL OR fecha_vencimiento >= fecha_emision)
);

-- -----------------------------------------------------------------------------
-- Integridad por empresa: evita que se asignen catálogos, rutas o vendedores de
-- otra empresa a un cliente.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_validar_configuracion_cliente()
RETURNS trigger AS $$
DECLARE
    v_empresa_id uuid;
BEGIN
    IF NEW.grupo_cliente_id IS NOT NULL THEN
        SELECT empresa_id INTO v_empresa_id FROM grupos_cliente WHERE id = NEW.grupo_cliente_id;
        IF v_empresa_id IS DISTINCT FROM NEW.empresa_id THEN
            RAISE EXCEPTION 'El grupo de cliente no pertenece a la empresa del cliente.';
        END IF;
    END IF;

    IF NEW.lista_precio_id IS NOT NULL THEN
        SELECT empresa_id INTO v_empresa_id FROM listas_precio WHERE id = NEW.lista_precio_id;
        IF v_empresa_id IS DISTINCT FROM NEW.empresa_id THEN
            RAISE EXCEPTION 'La lista de precio no pertenece a la empresa del cliente.';
        END IF;
    END IF;

    IF NEW.ruta_entrega_id IS NOT NULL THEN
        SELECT empresa_id INTO v_empresa_id FROM rutas_entrega WHERE id = NEW.ruta_entrega_id;
        IF v_empresa_id IS DISTINCT FROM NEW.empresa_id THEN
            RAISE EXCEPTION 'La ruta de entrega no pertenece a la empresa del cliente.';
        END IF;
    END IF;

    IF NEW.zona_comercial_id IS NOT NULL THEN
        SELECT empresa_id INTO v_empresa_id FROM zonas_comerciales WHERE id = NEW.zona_comercial_id;
        IF v_empresa_id IS DISTINCT FROM NEW.empresa_id THEN
            RAISE EXCEPTION 'La zona comercial no pertenece a la empresa del cliente.';
        END IF;
    END IF;

    IF NEW.vendedor_id IS NOT NULL THEN
        SELECT empresa_id INTO v_empresa_id FROM vendedores WHERE id = NEW.vendedor_id;
        IF v_empresa_id IS DISTINCT FROM NEW.empresa_id THEN
            RAISE EXCEPTION 'El vendedor no pertenece a la empresa del cliente.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clientes_validar_configuracion ON clientes;
CREATE TRIGGER trg_clientes_validar_configuracion
BEFORE INSERT OR UPDATE OF grupo_cliente_id, lista_precio_id, ruta_entrega_id,
    zona_comercial_id, vendedor_id ON clientes
FOR EACH ROW EXECUTE FUNCTION fn_validar_configuracion_cliente();

-- updated_at estándar.
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['grupos_cliente', 'cliente_contactos', 'cliente_documentos']
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', t, t);
        EXECUTE format(
            'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
            t,
            t
        );
    END LOOP;
END
$$;

CREATE INDEX IF NOT EXISTS ix_clientes_empresa_grupo
    ON clientes(empresa_id, grupo_cliente_id)
    WHERE activo;

CREATE INDEX IF NOT EXISTS ix_clientes_empresa_vendedor
    ON clientes(empresa_id, vendedor_id)
    WHERE activo;

CREATE INDEX IF NOT EXISTS ix_cliente_contactos_cliente
    ON cliente_contactos(cliente_id)
    WHERE activo;

CREATE INDEX IF NOT EXISTS ix_cliente_documentos_cliente
    ON cliente_documentos(cliente_id);

INSERT INTO schema_migrations (version, description)
VALUES ('022', 'Clientes: configuración comercial, contactos, direcciones y logística')
ON CONFLICT (version) DO NOTHING;

COMMIT;