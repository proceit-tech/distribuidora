-- ============================================================================
-- DistribuNex | Migration 008 - Notas de crédito, débito y ciclo fiscal
-- Ejecutar DESPUÉS de 007_integraciones_comunicaciones.sql
-- ============================================================================
BEGIN;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '007') THEN
        RAISE EXCEPTION 'La migration 007 debe ejecutarse antes de la 008.';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS notas_credito_cliente (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id), sucursal_id uuid NOT NULL REFERENCES sucursales(id),
    cliente_id uuid NOT NULL REFERENCES clientes(id), venta_id uuid REFERENCES ventas(id), devolucion_cliente_id uuid REFERENCES devoluciones_cliente(id),
    numero bigint NOT NULL, fecha date NOT NULL DEFAULT current_date, moneda_codigo varchar(3) NOT NULL REFERENCES monedas(codigo),
    motivo varchar(300) NOT NULL, estado varchar(25) NOT NULL DEFAULT 'BORRADOR'
        CHECK (estado IN ('BORRADOR','CONFIRMADA','EMITIDA','ANULADA')),
    subtotal numeric(18,4) NOT NULL DEFAULT 0 CHECK (subtotal >= 0), descuento_total numeric(18,4) NOT NULL DEFAULT 0 CHECK (descuento_total >= 0),
    impuesto_total numeric(18,4) NOT NULL DEFAULT 0 CHECK (impuesto_total >= 0), total numeric(18,4) NOT NULL DEFAULT 0 CHECK (total >= 0),
    observacion varchar(500), creado_por uuid REFERENCES usuarios(id), confirmado_por uuid REFERENCES usuarios(id),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, numero), CHECK (venta_id IS NOT NULL OR devolucion_cliente_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS nota_credito_cliente_lineas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nota_credito_id uuid NOT NULL REFERENCES notas_credito_cliente(id) ON DELETE CASCADE,
    venta_linea_id uuid REFERENCES venta_lineas(id), devolucion_linea_id uuid REFERENCES devolucion_cliente_lineas(id), producto_id uuid NOT NULL REFERENCES productos(id),
    lote_id uuid REFERENCES lotes_stock(id), unidad_id uuid REFERENCES unidades_identificadas(id), cantidad numeric(18,4) NOT NULL CHECK (cantidad > 0),
    precio_unitario numeric(18,4) NOT NULL CHECK (precio_unitario >= 0), descuento_porcentaje numeric(7,4) NOT NULL DEFAULT 0 CHECK (descuento_porcentaje BETWEEN 0 AND 100),
    impuesto_porcentaje numeric(7,4) NOT NULL DEFAULT 0 CHECK (impuesto_porcentaje >= 0), total_linea numeric(18,4) NOT NULL CHECK (total_linea >= 0), observacion varchar(300)
);

CREATE TABLE IF NOT EXISTS notas_debito_cliente (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id), sucursal_id uuid NOT NULL REFERENCES sucursales(id),
    cliente_id uuid NOT NULL REFERENCES clientes(id), venta_id uuid REFERENCES ventas(id),
    numero bigint NOT NULL, fecha date NOT NULL DEFAULT current_date, moneda_codigo varchar(3) NOT NULL REFERENCES monedas(codigo),
    motivo varchar(300) NOT NULL, estado varchar(25) NOT NULL DEFAULT 'BORRADOR'
        CHECK (estado IN ('BORRADOR','CONFIRMADA','EMITIDA','ANULADA')),
    subtotal numeric(18,4) NOT NULL DEFAULT 0 CHECK (subtotal >= 0), descuento_total numeric(18,4) NOT NULL DEFAULT 0 CHECK (descuento_total >= 0),
    impuesto_total numeric(18,4) NOT NULL DEFAULT 0 CHECK (impuesto_total >= 0), total numeric(18,4) NOT NULL DEFAULT 0 CHECK (total >= 0),
    observacion varchar(500), creado_por uuid REFERENCES usuarios(id), confirmado_por uuid REFERENCES usuarios(id),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (empresa_id, numero)
);

CREATE TABLE IF NOT EXISTS nota_debito_cliente_lineas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nota_debito_id uuid NOT NULL REFERENCES notas_debito_cliente(id) ON DELETE CASCADE,
    venta_linea_id uuid REFERENCES venta_lineas(id), producto_id uuid NOT NULL REFERENCES productos(id), cantidad numeric(18,4) NOT NULL CHECK (cantidad > 0),
    precio_unitario numeric(18,4) NOT NULL CHECK (precio_unitario >= 0), descuento_porcentaje numeric(7,4) NOT NULL DEFAULT 0 CHECK (descuento_porcentaje BETWEEN 0 AND 100),
    impuesto_porcentaje numeric(7,4) NOT NULL DEFAULT 0 CHECK (impuesto_porcentaje >= 0), total_linea numeric(18,4) NOT NULL CHECK (total_linea >= 0), observacion varchar(300)
);

-- Una nota de crédito puede compensar una o varias cuentas por cobrar del mismo
-- cliente y moneda. El saldo de la cuenta se calcula automáticamente.
CREATE TABLE IF NOT EXISTS aplicaciones_nota_credito (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nota_credito_id uuid NOT NULL REFERENCES notas_credito_cliente(id) ON DELETE CASCADE,
    cuenta_cobrar_id uuid NOT NULL REFERENCES cuentas_cobrar(id), importe_aplicado numeric(18,4) NOT NULL CHECK (importe_aplicado > 0),
    created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (nota_credito_id, cuenta_cobrar_id)
);

-- El documento electrónico puede originarse en una venta, una nota de crédito
-- o una nota de débito. Se conserva una única factura electrónica por venta.
ALTER TABLE documentos_electronicos
    ADD COLUMN IF NOT EXISTS nota_credito_cliente_id uuid REFERENCES notas_credito_cliente(id),
    ADD COLUMN IF NOT EXISTS nota_debito_cliente_id uuid REFERENCES notas_debito_cliente(id),
    ALTER COLUMN venta_id DROP NOT NULL;
ALTER TABLE documentos_electronicos DROP CONSTRAINT IF EXISTS documentos_electronicos_venta_id_tipo_documento_key;
-- La 002 validaba obligatoriamente venta_id. La validación ampliada de esta
-- migration cubre venta, nota de crédito y nota de débito.
DROP TRIGGER IF EXISTS trg_documentos_electronicos_validar_integridad ON documentos_electronicos;
CREATE UNIQUE INDEX IF NOT EXISTS ux_documento_electronico_factura_venta
    ON documentos_electronicos (venta_id) WHERE venta_id IS NOT NULL AND tipo_documento = 'FACTURA_ELECTRONICA';
CREATE UNIQUE INDEX IF NOT EXISTS ux_documento_electronico_nota_credito
    ON documentos_electronicos (nota_credito_cliente_id) WHERE nota_credito_cliente_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_documento_electronico_nota_debito
    ON documentos_electronicos (nota_debito_cliente_id) WHERE nota_debito_cliente_id IS NOT NULL;

CREATE OR REPLACE FUNCTION trg_validar_nota_credito_cliente()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = NEW.sucursal_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'La sucursal debe pertenecer a la misma empresa.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM clientes WHERE id = NEW.cliente_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El cliente debe pertenecer a la misma empresa.'; END IF;
    IF NEW.venta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ventas WHERE id = NEW.venta_id AND empresa_id = NEW.empresa_id AND cliente_id = NEW.cliente_id) THEN RAISE EXCEPTION 'La venta debe pertenecer a la misma empresa y cliente.'; END IF;
    IF NEW.devolucion_cliente_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM devoluciones_cliente WHERE id = NEW.devolucion_cliente_id AND empresa_id = NEW.empresa_id AND cliente_id = NEW.cliente_id) THEN RAISE EXCEPTION 'La devolución debe pertenecer a la misma empresa y cliente.'; END IF;
    IF NEW.creado_por IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.creado_por AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El creador debe pertenecer a la misma empresa.'; END IF;
    IF NEW.confirmado_por IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.confirmado_por AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El confirmador debe pertenecer a la misma empresa.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_nota_debito_cliente()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = NEW.sucursal_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'La sucursal debe pertenecer a la misma empresa.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM clientes WHERE id = NEW.cliente_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El cliente debe pertenecer a la misma empresa.'; END IF;
    IF NEW.venta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ventas WHERE id = NEW.venta_id AND empresa_id = NEW.empresa_id AND cliente_id = NEW.cliente_id) THEN RAISE EXCEPTION 'La venta debe pertenecer a la misma empresa y cliente.'; END IF;
    IF NEW.creado_por IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.creado_por AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El creador debe pertenecer a la misma empresa.'; END IF;
    IF NEW.confirmado_por IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.confirmado_por AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El confirmador debe pertenecer a la misma empresa.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_aplicacion_nota_credito()
RETURNS trigger AS $$
DECLARE en uuid; cn uuid; mn varchar(3); tn numeric(18,4); ec uuid; cc uuid; mc varchar(3); oc numeric(18,4); an numeric(18,4); ac numeric(18,4);
BEGIN
    PERFORM 1 FROM notas_credito_cliente WHERE id = NEW.nota_credito_id FOR UPDATE;
    PERFORM 1 FROM cuentas_cobrar WHERE id = NEW.cuenta_cobrar_id FOR UPDATE;
    SELECT empresa_id, cliente_id, moneda_codigo, total INTO en, cn, mn, tn FROM notas_credito_cliente WHERE id = NEW.nota_credito_id AND estado IN ('CONFIRMADA','EMITIDA');
    SELECT empresa_id, cliente_id, moneda_codigo, monto_original INTO ec, cc, mc, oc FROM cuentas_cobrar WHERE id = NEW.cuenta_cobrar_id AND estado NOT IN ('ANULADA','PAGADA');
    IF en IS NULL OR ec IS NULL THEN RAISE EXCEPTION 'La nota debe estar confirmada o emitida y la cuenta por cobrar vigente.'; END IF;
    IF en <> ec OR cn <> cc OR mn <> mc THEN RAISE EXCEPTION 'Nota de crédito y cuenta por cobrar deben coincidir en empresa, cliente y moneda.'; END IF;
    SELECT COALESCE(SUM(importe_aplicado), 0) INTO an FROM aplicaciones_nota_credito WHERE nota_credito_id = NEW.nota_credito_id AND id <> NEW.id;
    SELECT COALESCE(SUM(importe_aplicado), 0) INTO ac FROM aplicaciones_nota_credito WHERE cuenta_cobrar_id = NEW.cuenta_cobrar_id AND id <> NEW.id;
    IF an + NEW.importe_aplicado > tn THEN RAISE EXCEPTION 'La aplicación supera el total disponible de la nota de crédito.'; END IF;
    IF ac + NEW.importe_aplicado > oc THEN RAISE EXCEPTION 'La aplicación supera el monto original de la cuenta por cobrar.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Sustituye la validación introducida en la 007 para admitir los tres orígenes.
CREATE OR REPLACE FUNCTION trg_validar_documento_electronico_api()
RETURNS trigger AS $$
DECLARE v_origenes integer;
BEGIN
    v_origenes := (CASE WHEN NEW.venta_id IS NULL THEN 0 ELSE 1 END) + (CASE WHEN NEW.nota_credito_cliente_id IS NULL THEN 0 ELSE 1 END) + (CASE WHEN NEW.nota_debito_cliente_id IS NULL THEN 0 ELSE 1 END);
    IF v_origenes <> 1 THEN RAISE EXCEPTION 'El documento electrónico debe tener exactamente un documento de origen.'; END IF;
    IF NEW.venta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ventas WHERE id = NEW.venta_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'La venta debe pertenecer a la misma empresa.'; END IF;
    IF NEW.nota_credito_cliente_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM notas_credito_cliente WHERE id = NEW.nota_credito_cliente_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'La nota de crédito debe pertenecer a la misma empresa.'; END IF;
    IF NEW.nota_debito_cliente_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM notas_debito_cliente WHERE id = NEW.nota_debito_cliente_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'La nota de débito debe pertenecer a la misma empresa.'; END IF;
    IF NEW.configuracion_api_fiscal_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM configuraciones_api_fiscal WHERE id = NEW.configuracion_api_fiscal_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'La configuración fiscal debe pertenecer a la misma empresa.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- El saldo ahora considera tanto cobros confirmados como notas de crédito activas.
CREATE OR REPLACE FUNCTION fn_recalcular_cuenta_cobrar(p_cuenta_id uuid)
RETURNS void AS $$
DECLARE v_original numeric(18,4); v_cobrado numeric(18,4); v_creditado numeric(18,4); v_estado varchar(20); v_vencimiento date;
BEGIN
    SELECT monto_original, estado, fecha_vencimiento INTO v_original, v_estado, v_vencimiento FROM cuentas_cobrar WHERE id = p_cuenta_id FOR UPDATE;
    IF NOT FOUND OR v_estado = 'ANULADA' THEN RETURN; END IF;
    SELECT COALESCE(SUM(ac.importe_aplicado), 0) INTO v_cobrado FROM aplicaciones_cobro ac JOIN cobros c ON c.id = ac.cobro_id WHERE ac.cuenta_cobrar_id = p_cuenta_id AND c.estado = 'CONFIRMADO';
    SELECT COALESCE(SUM(anc.importe_aplicado), 0) INTO v_creditado FROM aplicaciones_nota_credito anc JOIN notas_credito_cliente nc ON nc.id = anc.nota_credito_id WHERE anc.cuenta_cobrar_id = p_cuenta_id AND nc.estado IN ('CONFIRMADA','EMITIDA');
    IF v_cobrado + v_creditado > v_original THEN RAISE EXCEPTION 'Las aplicaciones superan el monto original de la cuenta por cobrar.'; END IF;
    UPDATE cuentas_cobrar SET saldo = v_original - v_cobrado - v_creditado,
        estado = CASE WHEN v_cobrado + v_creditado = v_original THEN 'PAGADA' WHEN v_cobrado + v_creditado > 0 THEN 'PARCIAL' WHEN v_vencimiento IS NOT NULL AND v_vencimiento < current_date THEN 'VENCIDA' ELSE 'PENDIENTE' END
    WHERE id = p_cuenta_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_recalcular_cuenta_por_nota_credito()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN PERFORM fn_recalcular_cuenta_cobrar(OLD.cuenta_cobrar_id); RETURN OLD; END IF;
    PERFORM fn_recalcular_cuenta_cobrar(NEW.cuenta_cobrar_id);
    IF TG_OP = 'UPDATE' AND NEW.cuenta_cobrar_id <> OLD.cuenta_cobrar_id THEN PERFORM fn_recalcular_cuenta_cobrar(OLD.cuenta_cobrar_id); END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_recalcular_cuentas_por_nota_credito()
RETURNS trigger AS $$
DECLARE r record;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.estado IS NOT DISTINCT FROM OLD.estado THEN RETURN NEW; END IF;
    FOR r IN SELECT cuenta_cobrar_id FROM aplicaciones_nota_credito WHERE nota_credito_id = NEW.id LOOP PERFORM fn_recalcular_cuenta_cobrar(r.cuenta_cobrar_id); END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notas_credito_cliente_validar_integridad BEFORE INSERT OR UPDATE ON notas_credito_cliente FOR EACH ROW EXECUTE FUNCTION trg_validar_nota_credito_cliente();
CREATE TRIGGER trg_notas_debito_cliente_validar_integridad BEFORE INSERT OR UPDATE ON notas_debito_cliente FOR EACH ROW EXECUTE FUNCTION trg_validar_nota_debito_cliente();
CREATE TRIGGER trg_aplicaciones_nota_credito_validar_integridad BEFORE INSERT OR UPDATE ON aplicaciones_nota_credito FOR EACH ROW EXECUTE FUNCTION trg_validar_aplicacion_nota_credito();
CREATE TRIGGER trg_aplicaciones_nota_credito_recalcular AFTER INSERT OR UPDATE OR DELETE ON aplicaciones_nota_credito FOR EACH ROW EXECUTE FUNCTION trg_recalcular_cuenta_por_nota_credito();
CREATE TRIGGER trg_notas_credito_recalcular_saldos AFTER UPDATE OF estado ON notas_credito_cliente FOR EACH ROW EXECUTE FUNCTION trg_recalcular_cuentas_por_nota_credito();

CREATE INDEX IF NOT EXISTS ix_notas_credito_cliente_cliente_fecha ON notas_credito_cliente (cliente_id, fecha DESC);
CREATE INDEX IF NOT EXISTS ix_notas_debito_cliente_cliente_fecha ON notas_debito_cliente (cliente_id, fecha DESC);
CREATE INDEX IF NOT EXISTS ix_aplicaciones_nota_credito_cuenta ON aplicaciones_nota_credito (cuenta_cobrar_id);

DO $$ DECLARE t text; BEGIN
    FOREACH t IN ARRAY ARRAY['notas_credito_cliente','notas_debito_cliente'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', t, t);
        EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
    END LOOP;
END $$;

INSERT INTO schema_migrations (version, description)
VALUES ('008', 'Notas de crédito y débito, aplicaciones y origen fiscal de documentos')
ON CONFLICT (version) DO NOTHING;
COMMIT;