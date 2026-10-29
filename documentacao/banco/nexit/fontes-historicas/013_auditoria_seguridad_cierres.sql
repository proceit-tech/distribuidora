-- ============================================================================
-- DistribuNex | Migration 013 - Auditoría, seguridad y cierres operativos
-- Ejecutar DESPUÉS de 012_tesoreria_bancos_conciliacion.sql
-- ============================================================================
BEGIN;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '012') THEN
        RAISE EXCEPTION 'La migration 012 debe ejecutarse antes de la 013.';
    END IF;
END $$;

-- Registro explícito de accesos, cierres de sesión, recuperaciones y eventos
-- de seguridad. El password, token y su hash nunca se guardan aquí.
CREATE TABLE IF NOT EXISTS eventos_seguridad (
    id bigserial PRIMARY KEY,
    empresa_id uuid REFERENCES empresas(id),
    usuario_id uuid REFERENCES usuarios(id),
    tipo varchar(40) NOT NULL CHECK (tipo IN (
        'LOGIN_EXITOSO','LOGIN_FALLIDO','LOGOUT','SESION_REVOCADA',
        'PASSWORD_CAMBIADA','PASSWORD_RECUPERADA','USUARIO_BLOQUEADO',
        'USUARIO_DESBLOQUEADO','PERMISO_DENEGADO','OTRO')),
    detalle jsonb,
    ip inet,
    user_agent varchar(500),
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS intentos_fallidos integer NOT NULL DEFAULT 0
        CHECK (intentos_fallidos >= 0),
    ADD COLUMN IF NOT EXISTS bloqueado_hasta timestamptz;

-- Un cierre no borra ni modifica información histórica; solamente impide que
-- se registren o alteren operaciones con fecha dentro del período cerrado.
CREATE TABLE IF NOT EXISTS cierres_operativos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES empresas(id),
    sucursal_id uuid REFERENCES sucursales(id),
    modulo varchar(20) NOT NULL CHECK (modulo IN ('TODOS','VENTAS','COMPRAS','INVENTARIO','FINANZAS')),
    fecha_desde date NOT NULL,
    fecha_hasta date NOT NULL,
    estado varchar(20) NOT NULL DEFAULT 'BORRADOR'
        CHECK (estado IN ('BORRADOR','CERRADO','ANULADO')),
    motivo varchar(500) NOT NULL,
    cerrado_por uuid REFERENCES usuarios(id),
    cerrado_at timestamptz,
    reabierto_por uuid REFERENCES usuarios(id),
    reabierto_at timestamptz,
    observacion_reapertura varchar(500),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (fecha_hasta >= fecha_desde)
);

CREATE INDEX IF NOT EXISTS ix_eventos_seguridad_usuario_fecha
    ON eventos_seguridad (usuario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_eventos_seguridad_empresa_fecha
    ON eventos_seguridad (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_cierres_operativos_busqueda
    ON cierres_operativos (empresa_id, modulo, fecha_desde, fecha_hasta)
    WHERE estado = 'CERRADO';
CREATE INDEX IF NOT EXISTS ix_sesiones_usuario_activas
    ON sesiones_usuario (usuario_id, expira_at DESC)
    WHERE revocada_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_tokens_recuperacion_vigentes
    ON tokens_recuperacion_password (usuario_id, expira_at DESC)
    WHERE utilizado_at IS NULL;

CREATE OR REPLACE FUNCTION trg_validar_evento_seguridad()
RETURNS trigger AS $$
DECLARE v_empresa_usuario uuid;
BEGIN
    IF NEW.usuario_id IS NOT NULL THEN
        SELECT empresa_id INTO v_empresa_usuario FROM usuarios WHERE id = NEW.usuario_id;
        IF v_empresa_usuario IS NULL THEN
            RAISE EXCEPTION 'El usuario del evento de seguridad no existe.';
        END IF;
        IF NEW.empresa_id IS NULL THEN
            NEW.empresa_id := v_empresa_usuario;
        ELSIF NEW.empresa_id <> v_empresa_usuario THEN
            RAISE EXCEPTION 'El usuario y la empresa del evento de seguridad no coinciden.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_cierre_operativo()
RETURNS trigger AS $$
BEGIN
    IF NEW.sucursal_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM sucursales WHERE id = NEW.sucursal_id AND empresa_id = NEW.empresa_id
    ) THEN
        RAISE EXCEPTION 'La sucursal del cierre debe pertenecer a la misma empresa.';
    END IF;

    IF NEW.cerrado_por IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM usuarios WHERE id = NEW.cerrado_por AND empresa_id = NEW.empresa_id
    ) THEN
        RAISE EXCEPTION 'El usuario que cierra el período debe pertenecer a la misma empresa.';
    END IF;
    IF NEW.reabierto_por IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM usuarios WHERE id = NEW.reabierto_por AND empresa_id = NEW.empresa_id
    ) THEN
        RAISE EXCEPTION 'El usuario que reabre el período debe pertenecer a la misma empresa.';
    END IF;

    IF NEW.estado = 'CERRADO' THEN
        IF NEW.cerrado_por IS NULL THEN
            RAISE EXCEPTION 'Un cierre requiere el usuario responsable.';
        END IF;
        IF NEW.cerrado_at IS NULL THEN
            NEW.cerrado_at := now();
        END IF;
        IF EXISTS (
            SELECT 1
              FROM cierres_operativos c
             WHERE c.empresa_id = NEW.empresa_id
               AND c.modulo = NEW.modulo
               AND c.estado = 'CERRADO'
               AND c.id <> NEW.id
               AND c.fecha_desde <= NEW.fecha_hasta
               AND c.fecha_hasta >= NEW.fecha_desde
               AND (c.sucursal_id IS NULL OR NEW.sucursal_id IS NULL OR c.sucursal_id = NEW.sucursal_id)
        ) THEN
            RAISE EXCEPTION 'Ya existe un cierre activo que se superpone para este módulo, empresa y sucursal.';
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.estado = 'CERRADO' THEN
        IF NEW.estado <> 'ANULADO' THEN
            RAISE EXCEPTION 'Un cierre confirmado solo puede anularse; no se puede editar ni reabrir silenciosamente.';
        END IF;
        IF NEW.reabierto_por IS NULL OR NEW.observacion_reapertura IS NULL THEN
            RAISE EXCEPTION 'La anulación de un cierre requiere responsable y justificación.';
        END IF;
        IF NEW.reabierto_at IS NULL THEN
            NEW.reabierto_at := now();
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_periodo_esta_cerrado(
    p_empresa_id uuid, p_sucursal_id uuid, p_modulo varchar, p_fecha date
)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
          FROM cierres_operativos c
         WHERE c.empresa_id = p_empresa_id
           AND c.estado = 'CERRADO'
           AND c.modulo IN ('TODOS', p_modulo)
           AND p_fecha BETWEEN c.fecha_desde AND c.fecha_hasta
           AND (c.sucursal_id IS NULL OR c.sucursal_id = p_sucursal_id)
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- TG_ARGV: módulo, coluna de data, coluna de sucursal (vazia quando não há).
-- Toda correção de período fechado deve ser feita por um documento compensatório
-- em período aberto, preservando a trilha fiscal e o kardex.
CREATE OR REPLACE FUNCTION trg_bloquear_operacion_periodo_cerrado()
RETURNS trigger AS $$
DECLARE v_datos jsonb; v_empresa_id uuid; v_sucursal_id uuid; v_fecha date;
BEGIN
    v_datos := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
    v_empresa_id := (v_datos ->> 'empresa_id')::uuid;
    v_fecha := (v_datos ->> TG_ARGV[1])::date;
    IF TG_ARGV[2] <> '' AND v_datos ? TG_ARGV[2] AND v_datos ->> TG_ARGV[2] IS NOT NULL THEN
        v_sucursal_id := (v_datos ->> TG_ARGV[2])::uuid;
    END IF;
    IF v_empresa_id IS NULL OR v_fecha IS NULL THEN
        RAISE EXCEPTION 'No se puede validar el cierre: faltan empresa o fecha en %.', TG_TABLE_NAME;
    END IF;
    IF fn_periodo_esta_cerrado(v_empresa_id, v_sucursal_id, TG_ARGV[0], v_fecha) THEN
        RAISE EXCEPTION 'El período % está cerrado para % (%). Registre una operación compensatoria en un período abierto.', v_fecha, TG_ARGV[0], TG_TABLE_NAME;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auditoria genérica. A API deve definir, no início de cada transação:
--   SELECT set_config('app.usuario_id', '<uuid>', true);
--   SELECT set_config('app.ip', '<ip>', true);
-- O trigger continua funcionando em jobs automáticos, com usuario_id nulo.
CREATE OR REPLACE FUNCTION trg_registrar_auditoria()
RETURNS trigger AS $$
DECLARE v_anterior jsonb; v_nuevo jsonb; v_empresa_id uuid; v_usuario_id uuid; v_ip inet; v_usuario_text text; v_ip_text text;
BEGIN
    IF TG_OP <> 'INSERT' THEN v_anterior := to_jsonb(OLD) - 'password_hash'; END IF;
    IF TG_OP <> 'DELETE' THEN v_nuevo := to_jsonb(NEW) - 'password_hash'; END IF;

    v_empresa_id := COALESCE((v_nuevo ->> 'empresa_id')::uuid, (v_anterior ->> 'empresa_id')::uuid);
    v_usuario_text := NULLIF(current_setting('app.usuario_id', true), '');
    v_ip_text := NULLIF(current_setting('app.ip', true), '');
    IF v_usuario_text IS NOT NULL THEN v_usuario_id := v_usuario_text::uuid; END IF;
    IF v_ip_text IS NOT NULL THEN v_ip := v_ip_text::inet; END IF;

    INSERT INTO auditoria (empresa_id, usuario_id, accion, entidad, entidad_id, detalle_anterior, detalle_nuevo, ip)
    VALUES (v_empresa_id, v_usuario_id, TG_OP, TG_TABLE_NAME,
            COALESCE((v_nuevo ->> 'id')::uuid, (v_anterior ->> 'id')::uuid), v_anterior, v_nuevo, v_ip);
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_bloquear_modificacion_auditoria()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'La auditoría es inmutable y no puede actualizarse ni eliminarse.';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_revocar_sesiones_usuario(p_usuario_id uuid)
RETURNS integer AS $$
DECLARE v_total integer;
BEGIN
    UPDATE sesiones_usuario
       SET revocada_at = now()
     WHERE usuario_id = p_usuario_id
       AND revocada_at IS NULL;
    GET DIAGNOSTICS v_total = ROW_COUNT;
    INSERT INTO eventos_seguridad (usuario_id, tipo, detalle)
    VALUES (p_usuario_id, 'SESION_REVOCADA', jsonb_build_object('sesiones_revocadas', v_total));
    RETURN v_total;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_eventos_seguridad_validar_integridad
BEFORE INSERT OR UPDATE ON eventos_seguridad
FOR EACH ROW EXECUTE FUNCTION trg_validar_evento_seguridad();

CREATE TRIGGER trg_cierres_operativos_validar_integridad
BEFORE INSERT OR UPDATE ON cierres_operativos
FOR EACH ROW EXECUTE FUNCTION trg_validar_cierre_operativo();
CREATE TRIGGER trg_cierres_operativos_updated_at
BEFORE UPDATE ON cierres_operativos
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_auditoria_inmutable
BEFORE UPDATE OR DELETE ON auditoria
FOR EACH ROW EXECUTE FUNCTION trg_bloquear_modificacion_auditoria();

-- Fechas que representam efeitos comerciais, financeiros e de estoque.
CREATE TRIGGER trg_pedidos_periodo_cerrado BEFORE INSERT OR UPDATE OR DELETE ON pedidos
FOR EACH ROW EXECUTE FUNCTION trg_bloquear_operacion_periodo_cerrado('VENTAS','fecha','sucursal_id');
CREATE TRIGGER trg_ventas_periodo_cerrado BEFORE INSERT OR UPDATE OR DELETE ON ventas
FOR EACH ROW EXECUTE FUNCTION trg_bloquear_operacion_periodo_cerrado('VENTAS','fecha','sucursal_id');
CREATE TRIGGER trg_notas_credito_periodo_cerrado BEFORE INSERT OR UPDATE OR DELETE ON notas_credito_cliente
FOR EACH ROW EXECUTE FUNCTION trg_bloquear_operacion_periodo_cerrado('VENTAS','fecha','sucursal_id');
CREATE TRIGGER trg_notas_debito_periodo_cerrado BEFORE INSERT OR UPDATE OR DELETE ON notas_debito_cliente
FOR EACH ROW EXECUTE FUNCTION trg_bloquear_operacion_periodo_cerrado('VENTAS','fecha','sucursal_id');
CREATE TRIGGER trg_solicitudes_compra_periodo_cerrado BEFORE INSERT OR UPDATE OR DELETE ON solicitudes_compra
FOR EACH ROW EXECUTE FUNCTION trg_bloquear_operacion_periodo_cerrado('COMPRAS','fecha','sucursal_id');
CREATE TRIGGER trg_ordenes_compra_periodo_cerrado BEFORE INSERT OR UPDATE OR DELETE ON ordenes_compra
FOR EACH ROW EXECUTE FUNCTION trg_bloquear_operacion_periodo_cerrado('COMPRAS','fecha','sucursal_id');
CREATE TRIGGER trg_recepciones_compra_periodo_cerrado BEFORE INSERT OR UPDATE OR DELETE ON recepciones_compra
FOR EACH ROW EXECUTE FUNCTION trg_bloquear_operacion_periodo_cerrado('COMPRAS','fecha_recepcion','sucursal_id');
CREATE TRIGGER trg_facturas_proveedor_periodo_cerrado BEFORE INSERT OR UPDATE OR DELETE ON facturas_proveedor
FOR EACH ROW EXECUTE FUNCTION trg_bloquear_operacion_periodo_cerrado('COMPRAS','fecha_emision','sucursal_id');
CREATE TRIGGER trg_devoluciones_proveedor_periodo_cerrado BEFORE INSERT OR UPDATE OR DELETE ON devoluciones_proveedor
FOR EACH ROW EXECUTE FUNCTION trg_bloquear_operacion_periodo_cerrado('COMPRAS','fecha','sucursal_id');
CREATE TRIGGER trg_movimientos_stock_periodo_cerrado BEFORE INSERT ON movimientos_stock
FOR EACH ROW EXECUTE FUNCTION trg_bloquear_operacion_periodo_cerrado('INVENTARIO','created_at','');
CREATE TRIGGER trg_cobros_periodo_cerrado BEFORE INSERT OR UPDATE OR DELETE ON cobros
FOR EACH ROW EXECUTE FUNCTION trg_bloquear_operacion_periodo_cerrado('FINANZAS','fecha','');
CREATE TRIGGER trg_pagos_proveedor_periodo_cerrado BEFORE INSERT OR UPDATE OR DELETE ON pagos_proveedor
FOR EACH ROW EXECUTE FUNCTION trg_bloquear_operacion_periodo_cerrado('FINANZAS','fecha','');
CREATE TRIGGER trg_movimientos_caja_periodo_cerrado BEFORE INSERT ON movimientos_caja
FOR EACH ROW EXECUTE FUNCTION trg_bloquear_operacion_periodo_cerrado('FINANZAS','created_at','');

-- Tabelas principais auditadas. A auditoria dos filhos é coberta pelo cabeçalho
-- e por documentos imutáveis (kardex e caixa), evitando volume desnecessário.
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'empresas','sucursales','usuarios','perfiles','clientes','proveedores','productos',
        'pedidos','ventas','ordenes_compra','recepciones_compra','transferencias_stock',
        'ajustes_stock','documentos_electronicos','cobros','pagos_proveedor',
        'extractos_bancarios','movimientos_bancarios','conciliaciones_bancarias','cierres_operativos'
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_auditoria ON %I', t, t);
        EXECUTE format('CREATE TRIGGER trg_%I_auditoria AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION trg_registrar_auditoria()', t, t);
    END LOOP;
END $$;

INSERT INTO schema_migrations (version, description)
VALUES ('013', 'Auditoría inmutable, eventos de seguridad y cierres operativos')
ON CONFLICT (version) DO NOTHING;
COMMIT;