-- ============================================================================
-- DistribuNex | Migration 006 - Finanzas, cobranzas, pagos y caja
-- Ejecutar DESPUÉS de 005_logistica_entregas_devoluciones.sql
-- ============================================================================
BEGIN;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '005') THEN
        RAISE EXCEPTION 'La migration 005 debe ejecutarse antes de la 006.';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS cuentas_bancarias (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id),
    banco varchar(150) NOT NULL, titular varchar(200) NOT NULL, moneda_codigo varchar(3) NOT NULL REFERENCES monedas(codigo),
    numero_cuenta varchar(100), numero_cuenta_enmascarado varchar(100), activo boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, banco, numero_cuenta)
);

CREATE TABLE IF NOT EXISTS cajas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id), sucursal_id uuid NOT NULL REFERENCES sucursales(id),
    codigo varchar(30) NOT NULL, nombre varchar(100) NOT NULL, moneda_codigo varchar(3) NOT NULL REFERENCES monedas(codigo),
    activo boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (empresa_id, codigo)
);
CREATE TABLE IF NOT EXISTS sesiones_caja (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id), caja_id uuid NOT NULL REFERENCES cajas(id), usuario_apertura_id uuid NOT NULL REFERENCES usuarios(id),
    fecha_apertura timestamptz NOT NULL DEFAULT now(), monto_apertura numeric(18,4) NOT NULL DEFAULT 0 CHECK (monto_apertura >= 0),
    estado varchar(20) NOT NULL DEFAULT 'ABIERTA' CHECK (estado IN ('ABIERTA','CERRADA','ANULADA')),
    usuario_cierre_id uuid REFERENCES usuarios(id), fecha_cierre timestamptz, monto_declarado numeric(18,4), monto_sistema numeric(18,4), diferencia numeric(18,4), observacion_cierre varchar(500),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_sesion_caja_abierta ON sesiones_caja (caja_id) WHERE estado = 'ABIERTA';

CREATE TABLE IF NOT EXISTS cuentas_cobrar (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id), cliente_id uuid NOT NULL REFERENCES clientes(id), venta_id uuid REFERENCES ventas(id),
    documento_tipo varchar(30) NOT NULL, documento_numero varchar(100) NOT NULL, fecha_emision date NOT NULL, fecha_vencimiento date,
    moneda_codigo varchar(3) NOT NULL REFERENCES monedas(codigo), monto_original numeric(18,4) NOT NULL CHECK (monto_original >= 0), saldo numeric(18,4) NOT NULL CHECK (saldo >= 0),
    estado varchar(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','PARCIAL','PAGADA','VENCIDA','ANULADA')),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (empresa_id, documento_tipo, documento_numero), CHECK (saldo <= monto_original)
);

CREATE TABLE IF NOT EXISTS cobros (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id), cliente_id uuid NOT NULL REFERENCES clientes(id),
    numero bigint NOT NULL, fecha timestamptz NOT NULL DEFAULT now(), moneda_codigo varchar(3) NOT NULL REFERENCES monedas(codigo),
    medio_pago_id uuid NOT NULL REFERENCES medios_pago(id), caja_sesion_id uuid REFERENCES sesiones_caja(id), cuenta_bancaria_id uuid REFERENCES cuentas_bancarias(id),
    importe numeric(18,4) NOT NULL CHECK (importe > 0), referencia varchar(150), estado varchar(20) NOT NULL DEFAULT 'CONFIRMADO' CHECK (estado IN ('BORRADOR','CONFIRMADO','ANULADO')),
    recibido_por uuid REFERENCES usuarios(id), observacion varchar(500), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (empresa_id, numero)
);
CREATE TABLE IF NOT EXISTS aplicaciones_cobro (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cobro_id uuid NOT NULL REFERENCES cobros(id) ON DELETE CASCADE, cuenta_cobrar_id uuid NOT NULL REFERENCES cuentas_cobrar(id),
    importe_aplicado numeric(18,4) NOT NULL CHECK (importe_aplicado > 0), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (cobro_id, cuenta_cobrar_id)
);

CREATE TABLE IF NOT EXISTS pagos_proveedor (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id), proveedor_id uuid NOT NULL REFERENCES proveedores(id),
    numero bigint NOT NULL, fecha timestamptz NOT NULL DEFAULT now(), moneda_codigo varchar(3) NOT NULL REFERENCES monedas(codigo),
    medio_pago_id uuid NOT NULL REFERENCES medios_pago(id), caja_sesion_id uuid REFERENCES sesiones_caja(id), cuenta_bancaria_id uuid REFERENCES cuentas_bancarias(id),
    importe numeric(18,4) NOT NULL CHECK (importe > 0), referencia varchar(150), estado varchar(20) NOT NULL DEFAULT 'CONFIRMADO' CHECK (estado IN ('BORRADOR','CONFIRMADO','ANULADO')),
    registrado_por uuid REFERENCES usuarios(id), observacion varchar(500), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (empresa_id, numero)
);
CREATE TABLE IF NOT EXISTS aplicaciones_pago_proveedor (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pago_id uuid NOT NULL REFERENCES pagos_proveedor(id) ON DELETE CASCADE, factura_proveedor_id uuid NOT NULL REFERENCES facturas_proveedor(id),
    importe_aplicado numeric(18,4) NOT NULL CHECK (importe_aplicado > 0), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (pago_id, factura_proveedor_id)
);

CREATE TABLE IF NOT EXISTS movimientos_caja (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id), caja_sesion_id uuid NOT NULL REFERENCES sesiones_caja(id),
    tipo varchar(20) NOT NULL CHECK (tipo IN ('APERTURA','INGRESO','EGRESO','CIERRE','AJUSTE')),
    origen_tipo varchar(30), origen_id uuid, importe numeric(18,4) NOT NULL CHECK (importe > 0), descripcion varchar(500) NOT NULL,
    usuario_id uuid REFERENCES usuarios(id), created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rendiciones_repartidor (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id), hoja_ruta_id uuid NOT NULL REFERENCES hojas_ruta(id), repartidor_id uuid NOT NULL REFERENCES usuarios(id),
    numero bigint NOT NULL, fecha timestamptz NOT NULL DEFAULT now(), estado varchar(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','PRESENTADA','APROBADA','RECHAZADA','ANULADA')),
    total_cobrado numeric(18,4) NOT NULL DEFAULT 0 CHECK (total_cobrado >= 0), total_rendido numeric(18,4) NOT NULL DEFAULT 0 CHECK (total_rendido >= 0), diferencia numeric(18,4) NOT NULL DEFAULT 0,
    caja_sesion_id uuid REFERENCES sesiones_caja(id), aprobado_por uuid REFERENCES usuarios(id), observacion varchar(500), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (empresa_id, numero)
);
CREATE TABLE IF NOT EXISTS rendicion_cobros (
    rendicion_id uuid NOT NULL REFERENCES rendiciones_repartidor(id) ON DELETE CASCADE, cobro_id uuid NOT NULL REFERENCES cobros(id), PRIMARY KEY (rendicion_id, cobro_id)
);

-- As FKs não garantem que as partes financeiras pertençam à mesma empresa nem
-- impedem sobreaplicações. Estas regras são obrigatórias em ambiente oficial.
CREATE OR REPLACE FUNCTION trg_validar_sesion_caja()
RETURNS trigger AS $$
DECLARE v_empresa_caja uuid; v_empresa_apertura uuid;
BEGIN
    SELECT empresa_id INTO v_empresa_caja FROM cajas WHERE id = NEW.caja_id;
    SELECT empresa_id INTO v_empresa_apertura FROM usuarios WHERE id = NEW.usuario_apertura_id;
    IF v_empresa_caja IS NULL OR v_empresa_caja <> NEW.empresa_id THEN RAISE EXCEPTION 'La caja debe pertenecer a la misma empresa.'; END IF;
    IF v_empresa_apertura IS NULL OR v_empresa_apertura <> NEW.empresa_id THEN RAISE EXCEPTION 'El usuario de apertura debe pertenecer a la misma empresa.'; END IF;
    IF NEW.usuario_cierre_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.usuario_cierre_id AND empresa_id = NEW.empresa_id) THEN
        RAISE EXCEPTION 'El usuario de cierre debe pertenecer a la misma empresa.';
    END IF;
    IF NEW.estado = 'CERRADA' AND (NEW.fecha_cierre IS NULL OR NEW.usuario_cierre_id IS NULL) THEN
        RAISE EXCEPTION 'Una sesión cerrada requiere fecha y usuario de cierre.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_caja()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = NEW.sucursal_id AND empresa_id = NEW.empresa_id) THEN
        RAISE EXCEPTION 'La sucursal de la caja debe pertenecer a la misma empresa.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_cuenta_cobrar()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM clientes WHERE id = NEW.cliente_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El cliente debe pertenecer a la misma empresa.'; END IF;
    IF NEW.venta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ventas WHERE id = NEW.venta_id AND empresa_id = NEW.empresa_id AND cliente_id = NEW.cliente_id) THEN
        RAISE EXCEPTION 'La venta debe pertenecer a la misma empresa y cliente de la cuenta por cobrar.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_cobro()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM clientes WHERE id = NEW.cliente_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El cliente debe pertenecer a la misma empresa.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM medios_pago WHERE id = NEW.medio_pago_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El medio de pago debe pertenecer a la misma empresa.'; END IF;
    IF NEW.estado = 'CONFIRMADO' AND NEW.caja_sesion_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sesiones_caja WHERE id = NEW.caja_sesion_id AND empresa_id = NEW.empresa_id AND estado = 'ABIERTA') THEN RAISE EXCEPTION 'La sesión de caja debe estar abierta y pertenecer a la misma empresa.'; END IF;
    IF NEW.cuenta_bancaria_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cuentas_bancarias WHERE id = NEW.cuenta_bancaria_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'La cuenta bancaria debe pertenecer a la misma empresa.'; END IF;
    IF NEW.recibido_por IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.recibido_por AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El usuario debe pertenecer a la misma empresa.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_aplicacion_cobro()
RETURNS trigger AS $$
DECLARE ec uuid; cc uuid; mc varchar(3); ic numeric(18,4); ex uuid; cx uuid; mx varchar(3); ox numeric(18,4); tc numeric(18,4); tx numeric(18,4);
BEGIN
    -- Bloqueia os dois documentos durante a aplicação para evitar sobreaplicação concorrente.
    PERFORM 1 FROM cobros WHERE id = NEW.cobro_id FOR UPDATE;
    PERFORM 1 FROM cuentas_cobrar WHERE id = NEW.cuenta_cobrar_id FOR UPDATE;
    SELECT empresa_id, cliente_id, moneda_codigo, importe INTO ec, cc, mc, ic FROM cobros WHERE id = NEW.cobro_id AND estado = 'CONFIRMADO';
    SELECT empresa_id, cliente_id, moneda_codigo, monto_original INTO ex, cx, mx, ox FROM cuentas_cobrar WHERE id = NEW.cuenta_cobrar_id AND estado NOT IN ('ANULADA','PAGADA');
    IF ec IS NULL OR ex IS NULL THEN RAISE EXCEPTION 'El cobro debe estar confirmado y la cuenta por cobrar vigente.'; END IF;
    IF ec <> ex OR cc <> cx OR mc <> mx THEN RAISE EXCEPTION 'Cobro y cuenta por cobrar deben coincidir en empresa, cliente y moneda.'; END IF;
    SELECT COALESCE(SUM(importe_aplicado), 0) INTO tc FROM aplicaciones_cobro WHERE cobro_id = NEW.cobro_id AND id <> NEW.id;
    SELECT COALESCE(SUM(importe_aplicado), 0) INTO tx FROM aplicaciones_cobro WHERE cuenta_cobrar_id = NEW.cuenta_cobrar_id AND id <> NEW.id;
    IF tc + NEW.importe_aplicado > ic THEN RAISE EXCEPTION 'La aplicación supera el importe disponible del cobro.'; END IF;
    IF tx + NEW.importe_aplicado > ox THEN RAISE EXCEPTION 'La aplicación supera el monto original de la cuenta por cobrar.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_pago_proveedor()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM proveedores WHERE id = NEW.proveedor_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El proveedor debe pertenecer a la misma empresa.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM medios_pago WHERE id = NEW.medio_pago_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El medio de pago debe pertenecer a la misma empresa.'; END IF;
    IF NEW.estado = 'CONFIRMADO' AND NEW.caja_sesion_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sesiones_caja WHERE id = NEW.caja_sesion_id AND empresa_id = NEW.empresa_id AND estado = 'ABIERTA') THEN RAISE EXCEPTION 'La sesión de caja debe estar abierta y pertenecer a la misma empresa.'; END IF;
    IF NEW.cuenta_bancaria_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cuentas_bancarias WHERE id = NEW.cuenta_bancaria_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'La cuenta bancaria debe pertenecer a la misma empresa.'; END IF;
    IF NEW.registrado_por IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.registrado_por AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El usuario debe pertenecer a la misma empresa.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_movimiento_caja()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sesiones_caja WHERE id = NEW.caja_sesion_id AND empresa_id = NEW.empresa_id AND estado = 'ABIERTA') THEN
        RAISE EXCEPTION 'El movimiento debe registrarse en una sesión de caja abierta de la misma empresa.';
    END IF;
    IF NEW.usuario_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.usuario_id AND empresa_id = NEW.empresa_id) THEN
        RAISE EXCEPTION 'El usuario del movimiento debe pertenecer a la misma empresa.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_rendicion_repartidor()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM hojas_ruta WHERE id = NEW.hoja_ruta_id AND empresa_id = NEW.empresa_id AND repartidor_id = NEW.repartidor_id) THEN
        RAISE EXCEPTION 'La hoja de ruta debe pertenecer a la empresa y al repartidor indicado.';
    END IF;
    IF NEW.caja_sesion_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sesiones_caja WHERE id = NEW.caja_sesion_id AND empresa_id = NEW.empresa_id AND estado = 'ABIERTA') THEN
        RAISE EXCEPTION 'La caja de la rendición debe estar abierta y pertenecer a la misma empresa.';
    END IF;
    IF NEW.aprobado_por IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.aprobado_por AND empresa_id = NEW.empresa_id) THEN
        RAISE EXCEPTION 'El aprobador debe pertenecer a la misma empresa.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_rendicion_cobro()
RETURNS trigger AS $$
DECLARE er uuid; ec uuid;
BEGIN
    SELECT empresa_id INTO er FROM rendiciones_repartidor WHERE id = NEW.rendicion_id;
    SELECT empresa_id INTO ec FROM cobros WHERE id = NEW.cobro_id AND estado = 'CONFIRMADO';
    IF er IS NULL OR ec IS NULL OR er <> ec THEN
        RAISE EXCEPTION 'La rendición y el cobro confirmado deben pertenecer a la misma empresa.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_aplicacion_pago_proveedor()
RETURNS trigger AS $$
DECLARE ep uuid; pp uuid; mp varchar(3); ip numeric(18,4); ef uuid; pf uuid; mf varchar(3); tf numeric(18,4); tp numeric(18,4); ta numeric(18,4);
BEGIN
    -- Bloqueia pagamento e factura durante a aplicação para evitar sobreaplicação concorrente.
    PERFORM 1 FROM pagos_proveedor WHERE id = NEW.pago_id FOR UPDATE;
    PERFORM 1 FROM facturas_proveedor WHERE id = NEW.factura_proveedor_id FOR UPDATE;
    SELECT empresa_id, proveedor_id, moneda_codigo, importe INTO ep, pp, mp, ip FROM pagos_proveedor WHERE id = NEW.pago_id AND estado = 'CONFIRMADO';
    SELECT empresa_id, proveedor_id, moneda_codigo, total INTO ef, pf, mf, tf FROM facturas_proveedor WHERE id = NEW.factura_proveedor_id AND estado IN ('REGISTRADA','PARCIAL_PAGADA');
    IF ep IS NULL OR ef IS NULL THEN RAISE EXCEPTION 'El pago debe estar confirmado y la factura vigente.'; END IF;
    IF ep <> ef OR pp <> pf OR mp <> mf THEN RAISE EXCEPTION 'Pago y factura deben coincidir en empresa, proveedor y moneda.'; END IF;
    SELECT COALESCE(SUM(importe_aplicado), 0) INTO tp FROM aplicaciones_pago_proveedor WHERE pago_id = NEW.pago_id AND id <> NEW.id;
    SELECT COALESCE(SUM(importe_aplicado), 0) INTO ta FROM aplicaciones_pago_proveedor WHERE factura_proveedor_id = NEW.factura_proveedor_id AND id <> NEW.id;
    IF tp + NEW.importe_aplicado > ip THEN RAISE EXCEPTION 'La aplicación supera el importe disponible del pago.'; END IF;
    IF ta + NEW.importe_aplicado > tf THEN RAISE EXCEPTION 'La aplicación supera el total de la factura.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- O saldo é derivado das aplicações confirmadas. Não fica a cargo da API ou da tela.
CREATE OR REPLACE FUNCTION fn_recalcular_cuenta_cobrar(p_cuenta_id uuid)
RETURNS void AS $$
DECLARE v_original numeric(18,4); v_aplicado numeric(18,4); v_estado varchar(20); v_vencimiento date;
BEGIN
    SELECT monto_original, estado, fecha_vencimiento INTO v_original, v_estado, v_vencimiento FROM cuentas_cobrar WHERE id = p_cuenta_id FOR UPDATE;
    IF NOT FOUND OR v_estado = 'ANULADA' THEN RETURN; END IF;
    SELECT COALESCE(SUM(ac.importe_aplicado), 0) INTO v_aplicado
      FROM aplicaciones_cobro ac JOIN cobros c ON c.id = ac.cobro_id
      WHERE ac.cuenta_cobrar_id = p_cuenta_id AND c.estado = 'CONFIRMADO';
    UPDATE cuentas_cobrar
       SET saldo = v_original - v_aplicado,
           estado = CASE WHEN v_aplicado = v_original THEN 'PAGADA'
                          WHEN v_aplicado > 0 THEN 'PARCIAL'
                          WHEN v_vencimiento IS NOT NULL AND v_vencimiento < current_date THEN 'VENCIDA'
                          ELSE 'PENDIENTE' END
     WHERE id = p_cuenta_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_recalcular_cuenta_cobrar()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM fn_recalcular_cuenta_cobrar(OLD.cuenta_cobrar_id);
        RETURN OLD;
    END IF;
    PERFORM fn_recalcular_cuenta_cobrar(NEW.cuenta_cobrar_id);
    IF TG_OP = 'UPDATE' AND NEW.cuenta_cobrar_id <> OLD.cuenta_cobrar_id THEN
        PERFORM fn_recalcular_cuenta_cobrar(OLD.cuenta_cobrar_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_recalcular_cuentas_cobrar_por_cobro()
RETURNS trigger AS $$
DECLARE r record;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.estado IS NOT DISTINCT FROM OLD.estado THEN RETURN NEW; END IF;
    FOR r IN SELECT cuenta_cobrar_id FROM aplicaciones_cobro WHERE cobro_id = NEW.id LOOP
        PERFORM fn_recalcular_cuenta_cobrar(r.cuenta_cobrar_id);
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_recalcular_factura_proveedor(p_factura_id uuid)
RETURNS void AS $$
DECLARE v_total numeric(18,4); v_aplicado numeric(18,4); v_estado varchar(20);
BEGIN
    SELECT total, estado INTO v_total, v_estado FROM facturas_proveedor WHERE id = p_factura_id FOR UPDATE;
    IF NOT FOUND OR v_estado = 'ANULADA' THEN RETURN; END IF;
    SELECT COALESCE(SUM(app.importe_aplicado), 0) INTO v_aplicado
      FROM aplicaciones_pago_proveedor app JOIN pagos_proveedor p ON p.id = app.pago_id
      WHERE app.factura_proveedor_id = p_factura_id AND p.estado = 'CONFIRMADO';
    UPDATE facturas_proveedor
       SET saldo = v_total - v_aplicado,
           estado = CASE WHEN v_aplicado = v_total THEN 'PAGADA'
                          WHEN v_aplicado > 0 THEN 'PARCIAL_PAGADA'
                          ELSE 'REGISTRADA' END
     WHERE id = p_factura_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_recalcular_factura_proveedor()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM fn_recalcular_factura_proveedor(OLD.factura_proveedor_id);
        RETURN OLD;
    END IF;
    PERFORM fn_recalcular_factura_proveedor(NEW.factura_proveedor_id);
    IF TG_OP = 'UPDATE' AND NEW.factura_proveedor_id <> OLD.factura_proveedor_id THEN
        PERFORM fn_recalcular_factura_proveedor(OLD.factura_proveedor_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_recalcular_facturas_por_pago()
RETURNS trigger AS $$
DECLARE r record;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.estado IS NOT DISTINCT FROM OLD.estado THEN RETURN NEW; END IF;
    FOR r IN SELECT factura_proveedor_id FROM aplicaciones_pago_proveedor WHERE pago_id = NEW.id LOOP
        PERFORM fn_recalcular_factura_proveedor(r.factura_proveedor_id);
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cajas_validar_integridad BEFORE INSERT OR UPDATE ON cajas FOR EACH ROW EXECUTE FUNCTION trg_validar_caja();
CREATE TRIGGER trg_sesiones_caja_validar_integridad BEFORE INSERT OR UPDATE ON sesiones_caja FOR EACH ROW EXECUTE FUNCTION trg_validar_sesion_caja();
CREATE TRIGGER trg_cuentas_cobrar_validar_integridad BEFORE INSERT OR UPDATE ON cuentas_cobrar FOR EACH ROW EXECUTE FUNCTION trg_validar_cuenta_cobrar();
CREATE TRIGGER trg_cobros_validar_integridad BEFORE INSERT OR UPDATE ON cobros FOR EACH ROW EXECUTE FUNCTION trg_validar_cobro();
CREATE TRIGGER trg_aplicaciones_cobro_validar_integridad BEFORE INSERT OR UPDATE ON aplicaciones_cobro FOR EACH ROW EXECUTE FUNCTION trg_validar_aplicacion_cobro();
CREATE TRIGGER trg_pagos_proveedor_validar_integridad BEFORE INSERT OR UPDATE ON pagos_proveedor FOR EACH ROW EXECUTE FUNCTION trg_validar_pago_proveedor();
CREATE TRIGGER trg_aplicaciones_pago_proveedor_validar_integridad BEFORE INSERT OR UPDATE ON aplicaciones_pago_proveedor FOR EACH ROW EXECUTE FUNCTION trg_validar_aplicacion_pago_proveedor();
CREATE TRIGGER trg_movimientos_caja_validar_integridad BEFORE INSERT OR UPDATE ON movimientos_caja FOR EACH ROW EXECUTE FUNCTION trg_validar_movimiento_caja();
CREATE TRIGGER trg_rendiciones_repartidor_validar_integridad BEFORE INSERT OR UPDATE ON rendiciones_repartidor FOR EACH ROW EXECUTE FUNCTION trg_validar_rendicion_repartidor();
CREATE TRIGGER trg_rendicion_cobros_validar_integridad BEFORE INSERT OR UPDATE ON rendicion_cobros FOR EACH ROW EXECUTE FUNCTION trg_validar_rendicion_cobro();
CREATE TRIGGER trg_aplicaciones_cobro_recalcular AFTER INSERT OR UPDATE OR DELETE ON aplicaciones_cobro FOR EACH ROW EXECUTE FUNCTION trg_recalcular_cuenta_cobrar();
CREATE TRIGGER trg_cobros_recalcular_saldos AFTER UPDATE OF estado ON cobros FOR EACH ROW EXECUTE FUNCTION trg_recalcular_cuentas_cobrar_por_cobro();
CREATE TRIGGER trg_aplicaciones_pago_recalcular AFTER INSERT OR UPDATE OR DELETE ON aplicaciones_pago_proveedor FOR EACH ROW EXECUTE FUNCTION trg_recalcular_factura_proveedor();
CREATE TRIGGER trg_pagos_recalcular_saldos AFTER UPDATE OF estado ON pagos_proveedor FOR EACH ROW EXECUTE FUNCTION trg_recalcular_facturas_por_pago();

CREATE INDEX IF NOT EXISTS ix_cuentas_cobrar_cliente_estado ON cuentas_cobrar (cliente_id, estado, fecha_vencimiento);
CREATE INDEX IF NOT EXISTS ix_facturas_proveedor_estado ON facturas_proveedor (proveedor_id, estado, fecha_vencimiento);
CREATE INDEX IF NOT EXISTS ix_cobros_cliente_fecha ON cobros (cliente_id, fecha DESC);
CREATE INDEX IF NOT EXISTS ix_pagos_proveedor_fecha ON pagos_proveedor (proveedor_id, fecha DESC);
CREATE INDEX IF NOT EXISTS ix_movimientos_caja_sesion ON movimientos_caja (caja_sesion_id, created_at);

DO $$ DECLARE t text; BEGIN
    FOREACH t IN ARRAY ARRAY['cuentas_bancarias','cajas','sesiones_caja','cuentas_cobrar','cobros','pagos_proveedor','rendiciones_repartidor'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', t, t);
        EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
    END LOOP;
END $$;

INSERT INTO schema_migrations (version, description)
VALUES ('006', 'Finanzas: cuentas corrientes, cobros, pagos, cajas y rendiciones')
ON CONFLICT (version) DO NOTHING;
COMMIT;