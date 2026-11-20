-- ============================================================================
-- DistribuNex | Migration 012 - Tesorería, bancos y conciliación
-- Ejecutar DESPUÉS de 011_almacenamiento_terceros_costos_picking.sql
-- ============================================================================
BEGIN;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '011') THEN
        RAISE EXCEPTION 'La migration 011 debe ejecutarse antes de la 012.';
    END IF;
END $$;

ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS sentido varchar(10);
UPDATE movimientos_caja
   SET sentido = CASE WHEN tipo = 'EGRESO' THEN 'EGRESO' ELSE 'INGRESO' END
 WHERE sentido IS NULL;
ALTER TABLE movimientos_caja
    ALTER COLUMN sentido SET NOT NULL,
    ADD CONSTRAINT ck_movimientos_caja_sentido CHECK (sentido IN ('INGRESO','EGRESO'));

CREATE TABLE IF NOT EXISTS extractos_bancarios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id), cuenta_bancaria_id uuid NOT NULL REFERENCES cuentas_bancarias(id),
    periodo_desde date NOT NULL, periodo_hasta date NOT NULL, saldo_inicial numeric(18,4), saldo_final numeric(18,4),
    referencia_archivo text, estado varchar(20) NOT NULL DEFAULT 'IMPORTADO' CHECK (estado IN ('BORRADOR','IMPORTADO','CONCILIADO','CERRADO','ANULADO')),
    importado_por uuid REFERENCES usuarios(id), creado_at timestamptz NOT NULL DEFAULT now(), cerrado_at timestamptz,
    CHECK (periodo_hasta >= periodo_desde), UNIQUE (cuenta_bancaria_id, periodo_desde, periodo_hasta)
);

CREATE TABLE IF NOT EXISTS movimientos_bancarios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), extracto_id uuid NOT NULL REFERENCES extractos_bancarios(id) ON DELETE CASCADE,
    fecha date NOT NULL, referencia_externa varchar(150), descripcion varchar(500) NOT NULL,
    tipo varchar(10) NOT NULL CHECK (tipo IN ('CREDITO','DEBITO')), importe numeric(18,4) NOT NULL CHECK (importe > 0), saldo_banco numeric(18,4),
    estado varchar(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','CONCILIADO','IGNORADO','ANULADO')),
    payload_origen jsonb, created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (extracto_id, referencia_externa)
);

CREATE TABLE IF NOT EXISTS conciliaciones_bancarias (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), movimiento_bancario_id uuid NOT NULL REFERENCES movimientos_bancarios(id) ON DELETE CASCADE,
    cobro_id uuid REFERENCES cobros(id), pago_proveedor_id uuid REFERENCES pagos_proveedor(id), movimiento_caja_id uuid REFERENCES movimientos_caja(id),
    importe_conciliado numeric(18,4) NOT NULL CHECK (importe_conciliado > 0), observacion varchar(500), conciliado_por uuid REFERENCES usuarios(id),
    conciliado_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((CASE WHEN cobro_id IS NULL THEN 0 ELSE 1 END) + (CASE WHEN pago_proveedor_id IS NULL THEN 0 ELSE 1 END) + (CASE WHEN movimiento_caja_id IS NULL THEN 0 ELSE 1 END) = 1),
    UNIQUE (movimiento_bancario_id, cobro_id), UNIQUE (movimiento_bancario_id, pago_proveedor_id), UNIQUE (movimiento_bancario_id, movimiento_caja_id)
);

-- Um mesmo documento não pode gerar dois movimentos de caixa com a mesma natureza.
CREATE UNIQUE INDEX IF NOT EXISTS ux_movimientos_caja_origen
    ON movimientos_caja (caja_sesion_id, tipo, origen_tipo, origen_id)
    WHERE origen_tipo IS NOT NULL AND origen_id IS NOT NULL;

CREATE OR REPLACE FUNCTION trg_validar_extracto_bancario()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM cuentas_bancarias WHERE id = NEW.cuenta_bancaria_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'La cuenta bancaria debe pertenecer a la misma empresa.'; END IF;
    IF NEW.importado_por IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.importado_por AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El usuario debe pertenecer a la misma empresa.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_conciliacion_bancaria()
RETURNS trigger AS $$
DECLARE e uuid; importe_banco numeric(18,4); tipo_banco varchar(10); total numeric(18,4); et uuid; importe_documento numeric(18,4);
BEGIN
    SELECT ex.empresa_id, mb.importe, mb.tipo INTO e, importe_banco, tipo_banco FROM movimientos_bancarios mb JOIN extractos_bancarios ex ON ex.id = mb.extracto_id WHERE mb.id = NEW.movimiento_bancario_id FOR UPDATE;
    IF e IS NULL THEN RAISE EXCEPTION 'El movimiento bancario no existe.'; END IF;
    IF NEW.cobro_id IS NOT NULL THEN
        -- Bloqueia também o documento conciliado: duas linhas em extratos
        -- diferentes não podem conciliar o mesmo cobro simultaneamente.
        PERFORM 1 FROM cobros WHERE id = NEW.cobro_id FOR UPDATE;
        SELECT empresa_id, importe INTO et, importe_documento FROM cobros WHERE id = NEW.cobro_id AND estado = 'CONFIRMADO';
        IF tipo_banco <> 'CREDITO' THEN RAISE EXCEPTION 'Un cobro solo puede conciliarse con un crédito bancario.'; END IF;
        SELECT COALESCE(SUM(importe_conciliado), 0) INTO total FROM conciliaciones_bancarias WHERE cobro_id = NEW.cobro_id AND id <> NEW.id;
    ELSIF NEW.pago_proveedor_id IS NOT NULL THEN
        PERFORM 1 FROM pagos_proveedor WHERE id = NEW.pago_proveedor_id FOR UPDATE;
        SELECT empresa_id, importe INTO et, importe_documento FROM pagos_proveedor WHERE id = NEW.pago_proveedor_id AND estado = 'CONFIRMADO';
        IF tipo_banco <> 'DEBITO' THEN RAISE EXCEPTION 'Un pago solo puede conciliarse con un débito bancario.'; END IF;
        SELECT COALESCE(SUM(importe_conciliado), 0) INTO total FROM conciliaciones_bancarias WHERE pago_proveedor_id = NEW.pago_proveedor_id AND id <> NEW.id;
    ELSE
        PERFORM 1 FROM movimientos_caja WHERE id = NEW.movimiento_caja_id FOR UPDATE;
        SELECT empresa_id, importe INTO et, importe_documento FROM movimientos_caja WHERE id = NEW.movimiento_caja_id;
        SELECT COALESCE(SUM(importe_conciliado), 0) INTO total FROM conciliaciones_bancarias WHERE movimiento_caja_id = NEW.movimiento_caja_id AND id <> NEW.id;
    END IF;
    IF et IS NULL OR et <> e THEN RAISE EXCEPTION 'El documento conciliado debe pertenecer a la misma empresa del movimiento bancario.'; END IF;
    IF total + NEW.importe_conciliado > importe_documento THEN RAISE EXCEPTION 'La conciliación supera el importe del documento.'; END IF;
    SELECT COALESCE(SUM(importe_conciliado), 0) INTO total FROM conciliaciones_bancarias WHERE movimiento_bancario_id = NEW.movimiento_bancario_id AND id <> NEW.id;
    IF total + NEW.importe_conciliado > importe_banco THEN RAISE EXCEPTION 'La conciliación supera el importe del movimiento bancario.'; END IF;
    IF NEW.conciliado_por IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.conciliado_por AND empresa_id = e) THEN RAISE EXCEPTION 'El usuario conciliador debe pertenecer a la misma empresa.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- O estado do lançamento bancário é derivado das suas conciliações. Assim, uma
-- conciliação parcial continua pendente e não depende de atualização pela API.
CREATE OR REPLACE FUNCTION fn_recalcular_estado_movimiento_bancario(p_movimiento_id uuid)
RETURNS void AS $$
DECLARE v_importe numeric(18,4); v_estado varchar(20); v_total numeric(18,4);
BEGIN
    SELECT importe, estado INTO v_importe, v_estado
      FROM movimientos_bancarios WHERE id = p_movimiento_id FOR UPDATE;
    IF NOT FOUND OR v_estado IN ('IGNORADO','ANULADO') THEN RETURN; END IF;
    SELECT COALESCE(SUM(importe_conciliado), 0) INTO v_total
      FROM conciliaciones_bancarias WHERE movimiento_bancario_id = p_movimiento_id;
    UPDATE movimientos_bancarios
       SET estado = CASE WHEN v_total = v_importe THEN 'CONCILIADO' ELSE 'PENDIENTE' END
     WHERE id = p_movimiento_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_recalcular_estado_movimiento_bancario()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM fn_recalcular_estado_movimiento_bancario(OLD.movimiento_bancario_id);
        RETURN OLD;
    END IF;
    PERFORM fn_recalcular_estado_movimiento_bancario(NEW.movimiento_bancario_id);
    IF TG_OP = 'UPDATE' AND NEW.movimiento_bancario_id IS DISTINCT FROM OLD.movimiento_bancario_id THEN
        PERFORM fn_recalcular_estado_movimiento_bancario(OLD.movimiento_bancario_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_generar_movimiento_caja_cobro()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.estado = 'CONFIRMADO' AND NEW.caja_sesion_id IS NOT NULL THEN
        INSERT INTO movimientos_caja (empresa_id, caja_sesion_id, tipo, sentido, origen_tipo, origen_id, importe, descripcion, usuario_id)
        VALUES (NEW.empresa_id, NEW.caja_sesion_id, 'INGRESO', 'INGRESO', 'COBRO', NEW.id, NEW.importe, 'Cobro N.º ' || NEW.numero, NEW.recibido_por)
        ON CONFLICT DO NOTHING;
    ELSIF TG_OP = 'UPDATE' AND NEW.estado IS DISTINCT FROM OLD.estado THEN
        IF NEW.estado = 'CONFIRMADO' AND NEW.caja_sesion_id IS NOT NULL THEN
            INSERT INTO movimientos_caja (empresa_id, caja_sesion_id, tipo, sentido, origen_tipo, origen_id, importe, descripcion, usuario_id)
            VALUES (NEW.empresa_id, NEW.caja_sesion_id, 'INGRESO', 'INGRESO', 'COBRO', NEW.id, NEW.importe, 'Cobro N.º ' || NEW.numero, NEW.recibido_por)
            ON CONFLICT DO NOTHING;
        ELSIF OLD.estado = 'CONFIRMADO' AND NEW.estado = 'ANULADO' AND OLD.caja_sesion_id IS NOT NULL THEN
            IF NOT EXISTS (SELECT 1 FROM sesiones_caja WHERE id = OLD.caja_sesion_id AND estado = 'ABIERTA') THEN RAISE EXCEPTION 'No se puede anular un cobro de una caja cerrada; registre primero un reverso autorizado en una caja abierta.'; END IF;
            INSERT INTO movimientos_caja (empresa_id, caja_sesion_id, tipo, sentido, origen_tipo, origen_id, importe, descripcion, usuario_id)
            VALUES (NEW.empresa_id, OLD.caja_sesion_id, 'EGRESO', 'EGRESO', 'REVERSO_COBRO', NEW.id, OLD.importe, 'Reverso de cobro N.º ' || OLD.numero, NEW.recibido_por)
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_generar_movimiento_caja_pago()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.estado = 'CONFIRMADO' AND NEW.caja_sesion_id IS NOT NULL THEN
        INSERT INTO movimientos_caja (empresa_id, caja_sesion_id, tipo, sentido, origen_tipo, origen_id, importe, descripcion, usuario_id)
        VALUES (NEW.empresa_id, NEW.caja_sesion_id, 'EGRESO', 'EGRESO', 'PAGO_PROVEEDOR', NEW.id, NEW.importe, 'Pago N.º ' || NEW.numero, NEW.registrado_por)
        ON CONFLICT DO NOTHING;
    ELSIF TG_OP = 'UPDATE' AND NEW.estado IS DISTINCT FROM OLD.estado THEN
        IF NEW.estado = 'CONFIRMADO' AND NEW.caja_sesion_id IS NOT NULL THEN
            INSERT INTO movimientos_caja (empresa_id, caja_sesion_id, tipo, sentido, origen_tipo, origen_id, importe, descripcion, usuario_id)
            VALUES (NEW.empresa_id, NEW.caja_sesion_id, 'EGRESO', 'EGRESO', 'PAGO_PROVEEDOR', NEW.id, NEW.importe, 'Pago N.º ' || NEW.numero, NEW.registrado_por)
            ON CONFLICT DO NOTHING;
        ELSIF OLD.estado = 'CONFIRMADO' AND NEW.estado = 'ANULADO' AND OLD.caja_sesion_id IS NOT NULL THEN
            IF NOT EXISTS (SELECT 1 FROM sesiones_caja WHERE id = OLD.caja_sesion_id AND estado = 'ABIERTA') THEN RAISE EXCEPTION 'No se puede anular un pago de una caja cerrada; registre primero un reverso autorizado en una caja abierta.'; END IF;
            INSERT INTO movimientos_caja (empresa_id, caja_sesion_id, tipo, sentido, origen_tipo, origen_id, importe, descripcion, usuario_id)
            VALUES (NEW.empresa_id, OLD.caja_sesion_id, 'INGRESO', 'INGRESO', 'REVERSO_PAGO_PROVEEDOR', NEW.id, OLD.importe, 'Reverso de pago N.º ' || OLD.numero, NEW.registrado_por)
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_calcular_cierre_caja()
RETURNS trigger AS $$
DECLARE v_sistema numeric(18,4);
BEGIN
    IF NEW.estado = 'CERRADA' AND OLD.estado IS DISTINCT FROM 'CERRADA' THEN
        IF NEW.monto_declarado IS NULL THEN RAISE EXCEPTION 'El cierre de caja requiere el monto declarado.'; END IF;
        SELECT NEW.monto_apertura + COALESCE(SUM(CASE WHEN sentido = 'INGRESO' THEN importe ELSE -importe END), 0)
          INTO v_sistema FROM movimientos_caja WHERE caja_sesion_id = NEW.id;
        NEW.monto_sistema := v_sistema;
        NEW.diferencia := NEW.monto_declarado - v_sistema;
        IF NEW.fecha_cierre IS NULL THEN NEW.fecha_cierre := now(); END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_bloquear_modificacion_movimiento_caja()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'El movimiento de caja es inmutable. Utilice un movimiento de ajuste o reverso.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_extractos_bancarios_validar_integridad BEFORE INSERT OR UPDATE ON extractos_bancarios FOR EACH ROW EXECUTE FUNCTION trg_validar_extracto_bancario();
CREATE TRIGGER trg_conciliaciones_bancarias_validar_integridad BEFORE INSERT OR UPDATE ON conciliaciones_bancarias FOR EACH ROW EXECUTE FUNCTION trg_validar_conciliacion_bancaria();
CREATE TRIGGER trg_conciliaciones_bancarias_recalcular_estado AFTER INSERT OR UPDATE OR DELETE ON conciliaciones_bancarias FOR EACH ROW EXECUTE FUNCTION trg_recalcular_estado_movimiento_bancario();
CREATE TRIGGER trg_cobros_generar_movimiento_caja AFTER INSERT OR UPDATE OF estado ON cobros FOR EACH ROW EXECUTE FUNCTION trg_generar_movimiento_caja_cobro();
CREATE TRIGGER trg_pagos_generar_movimiento_caja AFTER INSERT OR UPDATE OF estado ON pagos_proveedor FOR EACH ROW EXECUTE FUNCTION trg_generar_movimiento_caja_pago();
CREATE TRIGGER trg_sesiones_caja_calcular_cierre BEFORE UPDATE OF estado ON sesiones_caja FOR EACH ROW EXECUTE FUNCTION trg_calcular_cierre_caja();
CREATE TRIGGER trg_movimientos_caja_inmutable BEFORE UPDATE OR DELETE ON movimientos_caja FOR EACH ROW EXECUTE FUNCTION trg_bloquear_modificacion_movimiento_caja();

CREATE INDEX IF NOT EXISTS ix_movimientos_bancarios_pendientes ON movimientos_bancarios (estado, fecha) WHERE estado = 'PENDIENTE';
CREATE INDEX IF NOT EXISTS ix_conciliaciones_bancarias_movimiento ON conciliaciones_bancarias (movimiento_bancario_id);
CREATE INDEX IF NOT EXISTS ix_extractos_bancarios_cuenta_periodo ON extractos_bancarios (cuenta_bancaria_id, periodo_desde DESC);

INSERT INTO schema_migrations (version, description)
VALUES ('012', 'Tesorería: bancos, conciliación, caja inmutable y arqueo automático')
ON CONFLICT (version) DO NOTHING;
COMMIT;