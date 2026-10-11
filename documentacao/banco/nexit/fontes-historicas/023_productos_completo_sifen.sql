-- =============================================================================
-- 023 - Productos completo: SIFEN, compras, logística, trazabilidad y kits
-- DistribuNex
-- Migración aditiva: conserva productos, precios, lotes y stock existentes.
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '022') THEN
        RAISE EXCEPTION 'Debe ejecutar primero las migraciones hasta la versión 022.';
    END IF;
END
$$;

-- Unidades: se mantiene el código interno actual y se agrega su equivalencia
-- para la Tabla 5 de unidades de medida utilizada por SIFEN.
ALTER TABLE unidades_medida
    ADD COLUMN IF NOT EXISTS codigo_sifen varchar(5),
    ADD COLUMN IF NOT EXISTS descripcion_sifen varchar(10);

CREATE UNIQUE INDEX IF NOT EXISTS ux_unidades_medida_codigo_sifen
    ON unidades_medida(codigo_sifen)
    WHERE codigo_sifen IS NOT NULL;

-- Datos de producto aplicables a SIFEN y a la operación interna.
ALTER TABLE productos
    ADD COLUMN IF NOT EXISTS tipo_producto varchar(20) NOT NULL DEFAULT 'MERCADERIA',
    ADD COLUMN IF NOT EXISTS codigo_sifen varchar(20),
    ADD COLUMN IF NOT EXISTS descripcion_factura varchar(120),
    ADD COLUMN IF NOT EXISTS partida_arancelaria varchar(4),
    ADD COLUMN IF NOT EXISTS ncm varchar(8),
    ADD COLUMN IF NOT EXISTS dncp_general varchar(8),
    ADD COLUMN IF NOT EXISTS dncp_especifico varchar(4),
    ADD COLUMN IF NOT EXISTS pais_origen_codigo varchar(3),
    ADD COLUMN IF NOT EXISTS pais_origen_nombre varchar(30),
    ADD COLUMN IF NOT EXISTS informacion_factura varchar(500),
    ADD COLUMN IF NOT EXISTS relacion_mercaderia smallint,
    ADD COLUMN IF NOT EXISTS porcentaje_merma numeric(9,6),
    ADD COLUMN IF NOT EXISTS cantidad_merma numeric(18,4),
    ADD COLUMN IF NOT EXISTS vendible boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS comprable boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS requiere_inspeccion_calidad boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS vida_util_dias integer,
    ADD COLUMN IF NOT EXISTS peso_neto_kg numeric(18,4),
    ADD COLUMN IF NOT EXISTS peso_bruto_kg numeric(18,4),
    ADD COLUMN IF NOT EXISTS largo_cm numeric(18,4),
    ADD COLUMN IF NOT EXISTS ancho_cm numeric(18,4),
    ADD COLUMN IF NOT EXISTS alto_cm numeric(18,4),
    ADD COLUMN IF NOT EXISTS volumen_m3 numeric(18,6),
    ADD COLUMN IF NOT EXISTS imagen_url text,
    ADD COLUMN IF NOT EXISTS observacion varchar(1000);

-- Se completa un valor inicial seguro para productos existentes. La pantalla
-- permitirá revisar o reemplazar la descripción antes de emitir electrónicamente.
UPDATE productos
SET descripcion_factura = left(descripcion, 120)
WHERE descripcion_factura IS NULL;

UPDATE productos
SET codigo_sifen = codigo
WHERE codigo_sifen IS NULL AND length(codigo) <= 20;

ALTER TABLE productos
    DROP CONSTRAINT IF EXISTS ck_productos_tipo_producto,
    ADD CONSTRAINT ck_productos_tipo_producto
        CHECK (tipo_producto IN ('MERCADERIA', 'SERVICIO', 'KIT', 'ACTIVO_FIJO')),
    DROP CONSTRAINT IF EXISTS ck_productos_ncm,
    ADD CONSTRAINT ck_productos_ncm
        CHECK (ncm IS NULL OR ncm ~ '^[0-9]{6,8}$'),
    DROP CONSTRAINT IF EXISTS ck_productos_partida_arancelaria,
    ADD CONSTRAINT ck_productos_partida_arancelaria
        CHECK (partida_arancelaria IS NULL OR partida_arancelaria ~ '^[0-9]{4}$'),
    DROP CONSTRAINT IF EXISTS ck_productos_dncp,
    ADD CONSTRAINT ck_productos_dncp
        CHECK (
            (dncp_general IS NULL AND dncp_especifico IS NULL)
            OR (dncp_general ~ '^[0-9]{8}$' AND dncp_especifico ~ '^[0-9]{3,4}$')
        ),
    DROP CONSTRAINT IF EXISTS ck_productos_relacion_mercaderia,
    ADD CONSTRAINT ck_productos_relacion_mercaderia
        CHECK (relacion_mercaderia IS NULL OR relacion_mercaderia IN (1, 2)),
    DROP CONSTRAINT IF EXISTS ck_productos_merma,
    ADD CONSTRAINT ck_productos_merma
        CHECK (
            relacion_mercaderia IS NULL
            OR (cantidad_merma IS NOT NULL AND cantidad_merma >= 0
                AND porcentaje_merma IS NOT NULL AND porcentaje_merma BETWEEN 0 AND 100)
        ),
    DROP CONSTRAINT IF EXISTS ck_productos_vida_util,
    ADD CONSTRAINT ck_productos_vida_util CHECK (vida_util_dias IS NULL OR vida_util_dias >= 0),
    DROP CONSTRAINT IF EXISTS ck_productos_dimensiones,
    ADD CONSTRAINT ck_productos_dimensiones CHECK (
        (peso_neto_kg IS NULL OR peso_neto_kg >= 0)
        AND (peso_bruto_kg IS NULL OR peso_bruto_kg >= 0)
        AND (largo_cm IS NULL OR largo_cm >= 0)
        AND (ancho_cm IS NULL OR ancho_cm >= 0)
        AND (alto_cm IS NULL OR alto_cm >= 0)
        AND (volumen_m3 IS NULL OR volumen_m3 >= 0)
    );

CREATE UNIQUE INDEX IF NOT EXISTS ux_productos_empresa_codigo_sifen
    ON productos(empresa_id, codigo_sifen)
    WHERE codigo_sifen IS NOT NULL;

-- Múltiples códigos: GTIN/EAN de producto, empaque, alternos o internos.
CREATE TABLE IF NOT EXISTS producto_codigos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id uuid NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    tipo varchar(25) NOT NULL,
    codigo varchar(80) NOT NULL,
    descripcion varchar(120),
    es_principal boolean NOT NULL DEFAULT false,
    activo boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (tipo IN ('GTIN', 'GTIN_EMPAQUE', 'EAN', 'UPC', 'CODIGO_ALTERNO', 'SKU_PROVEEDOR', 'OTRO')),
    CHECK (tipo NOT IN ('GTIN', 'GTIN_EMPAQUE', 'EAN', 'UPC') OR codigo ~ '^[0-9]{8,14}$'),
    UNIQUE (producto_id, tipo, codigo)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_producto_codigo_principal
    ON producto_codigos(producto_id)
    WHERE es_principal AND activo;

CREATE INDEX IF NOT EXISTS ix_producto_codigos_busqueda
    ON producto_codigos(codigo)
    WHERE activo;

-- Presentaciones y conversiones: unidad, caja, pack, pallet, etc.
CREATE TABLE IF NOT EXISTS producto_unidades (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id uuid NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    unidad_medida_id uuid NOT NULL REFERENCES unidades_medida(id),
    factor_conversion numeric(18,6) NOT NULL,
    es_unidad_base boolean NOT NULL DEFAULT false,
    es_unidad_compra boolean NOT NULL DEFAULT false,
    es_unidad_venta boolean NOT NULL DEFAULT false,
    codigo_barras varchar(80),
    peso_bruto_kg numeric(18,4),
    volumen_m3 numeric(18,6),
    activo boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (factor_conversion > 0),
    CHECK (peso_bruto_kg IS NULL OR peso_bruto_kg >= 0),
    CHECK (volumen_m3 IS NULL OR volumen_m3 >= 0),
    UNIQUE (producto_id, unidad_medida_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_producto_unidad_base
    ON producto_unidades(producto_id)
    WHERE es_unidad_base AND activo;

-- Datos de compra por proveedor, incluidos códigos y condiciones propias.
CREATE TABLE IF NOT EXISTS producto_proveedores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id uuid NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    proveedor_id uuid NOT NULL REFERENCES proveedores(id),
    codigo_proveedor varchar(80),
    descripcion_proveedor varchar(300),
    unidad_medida_id uuid REFERENCES unidades_medida(id),
    factor_conversion numeric(18,6) NOT NULL DEFAULT 1,
    costo_referencia numeric(18,4),
    moneda_codigo varchar(3) REFERENCES monedas(codigo),
    cantidad_minima_compra numeric(18,4),
    plazo_entrega_dias integer,
    es_principal boolean NOT NULL DEFAULT false,
    activo boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (factor_conversion > 0),
    CHECK (costo_referencia IS NULL OR costo_referencia >= 0),
    CHECK (cantidad_minima_compra IS NULL OR cantidad_minima_compra > 0),
    CHECK (plazo_entrega_dias IS NULL OR plazo_entrega_dias >= 0),
    UNIQUE (producto_id, proveedor_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_producto_proveedor_principal
    ON producto_proveedores(producto_id)
    WHERE es_principal AND activo;

-- Reglas de reposición por depósito. Las existencias siguen calculándose a
-- partir del kardex; aquí sólo se registran políticas de abastecimiento.
CREATE TABLE IF NOT EXISTS producto_deposito_configuracion (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id uuid NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    deposito_id uuid NOT NULL REFERENCES depositos(id),
    ubicacion_preferida_id uuid REFERENCES ubicaciones_deposito(id),
    stock_minimo numeric(18,4),
    stock_maximo numeric(18,4),
    punto_reposicion numeric(18,4),
    cantidad_reposicion numeric(18,4),
    activo boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (stock_minimo IS NULL OR stock_minimo >= 0),
    CHECK (stock_maximo IS NULL OR stock_maximo >= 0),
    CHECK (punto_reposicion IS NULL OR punto_reposicion >= 0),
    CHECK (cantidad_reposicion IS NULL OR cantidad_reposicion > 0),
    CHECK (stock_maximo IS NULL OR stock_minimo IS NULL OR stock_maximo >= stock_minimo),
    UNIQUE (producto_id, deposito_id)
);

-- Sustitutos y complementarios para ventas, compras y picking.
CREATE TABLE IF NOT EXISTS producto_alternativos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id uuid NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    producto_alternativo_id uuid NOT NULL REFERENCES productos(id),
    tipo varchar(20) NOT NULL DEFAULT 'SUSTITUTO',
    prioridad smallint NOT NULL DEFAULT 1,
    activo boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (tipo IN ('SUSTITUTO', 'COMPLEMENTARIO', 'UPSELL')),
    CHECK (producto_id <> producto_alternativo_id),
    CHECK (prioridad > 0),
    UNIQUE (producto_id, producto_alternativo_id, tipo)
);

-- Componentes de kits/combo. Los movimientos de stock se resolverán en el
-- módulo de ventas/picking; esta tabla define únicamente la composición.
CREATE TABLE IF NOT EXISTS producto_componentes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_kit_id uuid NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    producto_componente_id uuid NOT NULL REFERENCES productos(id),
    cantidad numeric(18,4) NOT NULL,
    es_opcional boolean NOT NULL DEFAULT false,
    orden smallint NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (producto_kit_id <> producto_componente_id),
    CHECK (cantidad > 0),
    UNIQUE (producto_kit_id, producto_componente_id)
);

-- Documentación técnica, ficha de seguridad, certificados e imagen de apoyo.
CREATE TABLE IF NOT EXISTS producto_documentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id uuid NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    tipo varchar(30) NOT NULL,
    nombre_archivo varchar(255) NOT NULL,
    url_archivo text NOT NULL,
    fecha_emision date,
    fecha_vencimiento date,
    observacion varchar(500),
    cargado_por uuid REFERENCES usuarios(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (tipo IN ('FICHA_TECNICA', 'HOJA_SEGURIDAD', 'CERTIFICADO', 'IMAGEN', 'OTRO')),
    CHECK (fecha_vencimiento IS NULL OR fecha_emision IS NULL OR fecha_vencimiento >= fecha_emision)
);

-- Integridad por empresa para las relaciones del producto.
CREATE OR REPLACE FUNCTION fn_validar_relaciones_producto()
RETURNS trigger AS $$
DECLARE
    v_empresa_producto uuid;
    v_empresa_relacion uuid;
BEGIN
    IF TG_TABLE_NAME = 'producto_proveedores' THEN
        SELECT empresa_id INTO v_empresa_producto FROM productos WHERE id = NEW.producto_id;
        SELECT empresa_id INTO v_empresa_relacion FROM proveedores WHERE id = NEW.proveedor_id;
        IF v_empresa_producto IS DISTINCT FROM v_empresa_relacion THEN
            RAISE EXCEPTION 'El proveedor no pertenece a la empresa del producto.';
        END IF;
    ELSIF TG_TABLE_NAME = 'producto_deposito_configuracion' THEN
        SELECT empresa_id INTO v_empresa_producto FROM productos WHERE id = NEW.producto_id;
        SELECT empresa_id INTO v_empresa_relacion FROM depositos WHERE id = NEW.deposito_id;
        IF v_empresa_producto IS DISTINCT FROM v_empresa_relacion THEN
            RAISE EXCEPTION 'El depósito no pertenece a la empresa del producto.';
        END IF;
    ELSE
        SELECT empresa_id INTO v_empresa_producto FROM productos WHERE id = NEW.producto_id;
        SELECT empresa_id INTO v_empresa_relacion FROM productos WHERE id = NEW.producto_alternativo_id;
        IF v_empresa_producto IS DISTINCT FROM v_empresa_relacion THEN
            RAISE EXCEPTION 'El producto alternativo no pertenece a la misma empresa.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_producto_proveedor_validar_empresa ON producto_proveedores;
CREATE TRIGGER trg_producto_proveedor_validar_empresa
BEFORE INSERT OR UPDATE ON producto_proveedores
FOR EACH ROW EXECUTE FUNCTION fn_validar_relaciones_producto();

DROP TRIGGER IF EXISTS trg_producto_deposito_validar_empresa ON producto_deposito_configuracion;
CREATE TRIGGER trg_producto_deposito_validar_empresa
BEFORE INSERT OR UPDATE ON producto_deposito_configuracion
FOR EACH ROW EXECUTE FUNCTION fn_validar_relaciones_producto();

DROP TRIGGER IF EXISTS trg_producto_alternativo_validar_empresa ON producto_alternativos;
CREATE TRIGGER trg_producto_alternativo_validar_empresa
BEFORE INSERT OR UPDATE ON producto_alternativos
FOR EACH ROW EXECUTE FUNCTION fn_validar_relaciones_producto();

CREATE OR REPLACE FUNCTION fn_validar_componentes_producto()
RETURNS trigger AS $$
DECLARE
    v_empresa_kit uuid;
    v_empresa_componente uuid;
    v_tipo_kit varchar(20);
BEGIN
    SELECT empresa_id, tipo_producto
      INTO v_empresa_kit, v_tipo_kit
      FROM productos WHERE id = NEW.producto_kit_id;
    SELECT empresa_id INTO v_empresa_componente
      FROM productos WHERE id = NEW.producto_componente_id;

    IF v_empresa_kit IS DISTINCT FROM v_empresa_componente THEN
        RAISE EXCEPTION 'El componente no pertenece a la misma empresa del kit.';
    END IF;
    IF v_tipo_kit <> 'KIT' THEN
        RAISE EXCEPTION 'Solo un producto de tipo KIT puede tener componentes.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_producto_componentes_validar ON producto_componentes;
CREATE TRIGGER trg_producto_componentes_validar
BEFORE INSERT OR UPDATE ON producto_componentes
FOR EACH ROW EXECUTE FUNCTION fn_validar_componentes_producto();

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'producto_codigos', 'producto_unidades', 'producto_proveedores',
        'producto_deposito_configuracion', 'producto_documentos'
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', t, t);
        EXECUTE format(
            'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
            t, t
        );
    END LOOP;
END
$$;

CREATE INDEX IF NOT EXISTS ix_producto_proveedores_producto ON producto_proveedores(producto_id) WHERE activo;
CREATE INDEX IF NOT EXISTS ix_producto_deposito_configuracion_producto ON producto_deposito_configuracion(producto_id) WHERE activo;
CREATE INDEX IF NOT EXISTS ix_producto_alternativos_producto ON producto_alternativos(producto_id) WHERE activo;
CREATE INDEX IF NOT EXISTS ix_producto_componentes_kit ON producto_componentes(producto_kit_id);
CREATE INDEX IF NOT EXISTS ix_producto_documentos_producto ON producto_documentos(producto_id);

INSERT INTO schema_migrations (version, description)
VALUES ('023', 'Productos: SIFEN, compras, logística, trazabilidad, códigos y kits')
ON CONFLICT (version) DO NOTHING;

COMMIT;