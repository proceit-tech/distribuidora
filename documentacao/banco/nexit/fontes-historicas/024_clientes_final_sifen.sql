-- =============================================================================
-- 024 - Clientes: referencia geografica, exoneraciones, retenciones e integracion
-- DistribuNex
--
-- Esta migracion es aditiva. No elimina datos existentes.
-- El archivo 025 carga los datos geograficos oficiales de Paraguay.
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '022') THEN
        RAISE EXCEPTION 'Debe ejecutar primero las migraciones hasta la version 022.';
    END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- Referencia geografica de Paraguay.
-- Los codigos son los utilizados por las direcciones del cliente y se cargan
-- desde la planilla oficial de referencia geografica en la migracion 025.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referencia_geografica_departamentos (
    codigo      integer PRIMARY KEY,
    nombre      varchar(120) NOT NULL,
    activo      boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CHECK (codigo > 0)
);

CREATE TABLE IF NOT EXISTS referencia_geografica_distritos (
    codigo              integer PRIMARY KEY,
    departamento_codigo integer NOT NULL REFERENCES referencia_geografica_departamentos(codigo),
    nombre              varchar(160) NOT NULL,
    activo              boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CHECK (codigo > 0)
);

CREATE TABLE IF NOT EXISTS referencia_geografica_ciudades (
    codigo              integer PRIMARY KEY,
    departamento_codigo integer NOT NULL REFERENCES referencia_geografica_departamentos(codigo),
    distrito_codigo     integer NOT NULL REFERENCES referencia_geografica_distritos(codigo),
    nombre              varchar(200) NOT NULL,
    activo              boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CHECK (codigo > 0)
);

CREATE TABLE IF NOT EXISTS referencia_geografica_barrios (
    ciudad_codigo   integer NOT NULL REFERENCES referencia_geografica_ciudades(codigo),
    codigo          integer NOT NULL,
    nombre          varchar(200) NOT NULL,
    activo          boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (ciudad_codigo, codigo),
    CHECK (codigo > 0)
);

CREATE INDEX IF NOT EXISTS ix_referencia_distritos_departamento
    ON referencia_geografica_distritos(departamento_codigo, nombre);

CREATE INDEX IF NOT EXISTS ix_referencia_ciudades_distrito
    ON referencia_geografica_ciudades(distrito_codigo, nombre);

CREATE INDEX IF NOT EXISTS ix_referencia_barrios_ciudad
    ON referencia_geografica_barrios(ciudad_codigo, nombre);

-- -----------------------------------------------------------------------------
-- Datos opcionales de operacion comercial e integracion B2B.
-- No se utiliza codigo_cliente_sifen en pantalla: el codigo interno del cliente
-- continua siendo generado automaticamente por el sistema.
-- -----------------------------------------------------------------------------
ALTER TABLE clientes
    ADD COLUMN IF NOT EXISTS canal_venta_id uuid REFERENCES canales_venta(id),
    ADD COLUMN IF NOT EXISTS codigo_externo varchar(80),
    ADD COLUMN IF NOT EXISTS gln varchar(13);

ALTER TABLE clientes
    DROP CONSTRAINT IF EXISTS ck_clientes_gln,
    ADD CONSTRAINT ck_clientes_gln
        CHECK (gln IS NULL OR gln ~ '^[0-9]{13}$');

CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_empresa_codigo_externo
    ON clientes(empresa_id, codigo_externo)
    WHERE codigo_externo IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_clientes_empresa_canal_venta
    ON clientes(empresa_id, canal_venta_id)
    WHERE activo;

-- -----------------------------------------------------------------------------
-- Exoneraciones del cliente. Son opcionales y se aplican al emitir el documento
-- cuando el certificado este vigente. El archivo de respaldo se registra en
-- cliente_documentos y se referencia, sin duplicar archivos.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cliente_exoneraciones (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id              uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    tipo                    varchar(30) NOT NULL,
    motivo                  varchar(300) NOT NULL,
    numero_certificado      varchar(100),
    entidad_emisora         varchar(200),
    porcentaje              numeric(7,4),
    fecha_vigencia_desde    date,
    fecha_vigencia_hasta    date,
    cliente_documento_id    uuid REFERENCES cliente_documentos(id),
    activo                  boolean NOT NULL DEFAULT true,
    observacion             varchar(500),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CHECK (tipo IN ('IVA', 'RENTA', 'MUNICIPAL', 'OTRA')),
    CHECK (porcentaje IS NULL OR porcentaje BETWEEN 0 AND 100),
    CHECK (
        fecha_vigencia_hasta IS NULL
        OR fecha_vigencia_desde IS NULL
        OR fecha_vigencia_hasta >= fecha_vigencia_desde
    )
);

CREATE INDEX IF NOT EXISTS ix_cliente_exoneraciones_vigentes
    ON cliente_exoneraciones(cliente_id, fecha_vigencia_desde, fecha_vigencia_hasta)
    WHERE activo;

-- -----------------------------------------------------------------------------
-- Retenciones que el cliente puede practicar al pagar las facturas de venta.
-- Es configuracion financiera opcional; no debe ser obligatoria para vender.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cliente_retenciones (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id              uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    tipo                    varchar(30) NOT NULL,
    impuesto_id             uuid REFERENCES impuestos(id),
    porcentaje              numeric(7,4) NOT NULL,
    certificado_obligatorio boolean NOT NULL DEFAULT false,
    numero_certificado      varchar(100),
    fecha_vigencia_desde    date,
    fecha_vigencia_hasta    date,
    activo                  boolean NOT NULL DEFAULT true,
    observacion             varchar(500),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CHECK (tipo IN ('IVA', 'RENTA', 'OTRA')),
    CHECK (porcentaje BETWEEN 0 AND 100),
    CHECK (
        fecha_vigencia_hasta IS NULL
        OR fecha_vigencia_desde IS NULL
        OR fecha_vigencia_hasta >= fecha_vigencia_desde
    )
);

CREATE INDEX IF NOT EXISTS ix_cliente_retenciones_activas
    ON cliente_retenciones(cliente_id)
    WHERE activo;

DO $$
DECLARE
    tabla text;
BEGIN
    FOREACH tabla IN ARRAY ARRAY[
        'referencia_geografica_departamentos',
        'referencia_geografica_distritos',
        'referencia_geografica_ciudades',
        'referencia_geografica_barrios',
        'cliente_exoneraciones',
        'cliente_retenciones'
    ]
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', tabla, tabla);
        EXECUTE format(
            'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
            tabla,
            tabla
        );
    END LOOP;
END
$$;

INSERT INTO schema_migrations (version, description)
VALUES ('024', 'Clientes: referencia geografica, exoneraciones, retenciones e integracion')
ON CONFLICT (version) DO NOTHING;

COMMIT;