-- ============================================================================
-- DistribuNex | Migration 007 - Integraciones, fiscal y comunicaciones
-- Ejecutar DESPUÉS de 006_finanzas_cobranzas.sql
-- ============================================================================
BEGIN;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '006') THEN
        RAISE EXCEPTION 'La migration 006 debe ejecutarse antes de la 007.';
    END IF;
END $$;

-- Archivos para cualquier entidad del sistema. El binario vive en almacenamiento
-- privado; la base guarda solamente su referencia, metadatos e integridad.
CREATE TABLE IF NOT EXISTS archivos_adjuntos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id),
    entidad_tipo varchar(50) NOT NULL, entidad_id uuid NOT NULL,
    nombre_original varchar(255) NOT NULL, clave_almacenamiento text NOT NULL,
    mime_type varchar(150) NOT NULL, tamano_bytes bigint NOT NULL CHECK (tamano_bytes >= 0),
    checksum_sha256 varchar(64), es_privado boolean NOT NULL DEFAULT true,
    subido_por uuid REFERENCES usuarios(id), created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, entidad_tipo, entidad_id, clave_almacenamiento)
);

CREATE TABLE IF NOT EXISTS plantillas_notificacion (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    codigo varchar(60) NOT NULL, canal varchar(20) NOT NULL CHECK (canal IN ('EMAIL','WHATSAPP','SMS','SISTEMA')),
    asunto varchar(250), contenido text NOT NULL, activo boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, codigo, canal)
);

CREATE TABLE IF NOT EXISTS notificaciones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id),
    usuario_id uuid REFERENCES usuarios(id), cliente_id uuid REFERENCES clientes(id), plantilla_id uuid REFERENCES plantillas_notificacion(id),
    canal varchar(20) NOT NULL CHECK (canal IN ('EMAIL','WHATSAPP','SMS','SISTEMA')),
    destinatario varchar(300) NOT NULL, asunto varchar(250), contenido text NOT NULL,
    estado varchar(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','ENVIANDO','ENVIADA','ERROR','CANCELADA')),
    programada_at timestamptz NOT NULL DEFAULT now(), enviada_at timestamptz,
    referencia_tipo varchar(50), referencia_id uuid, idempotency_key varchar(150),
    creado_por uuid REFERENCES usuarios(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_notificaciones_idempotencia
    ON notificaciones (empresa_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS notificacion_intentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), notificacion_id uuid NOT NULL REFERENCES notificaciones(id) ON DELETE CASCADE,
    numero_intento integer NOT NULL CHECK (numero_intento > 0), proveedor varchar(100),
    estado varchar(20) NOT NULL CHECK (estado IN ('ENVIADO','ENTREGADO','ERROR')),
    respuesta jsonb, mensaje_error text, enviado_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (notificacion_id, numero_intento)
);

-- Patrón transactional outbox: una operación confirmada en la BD deja un evento
-- durable para que el worker lo entregue sin perder información ante reinicios.
CREATE TABLE IF NOT EXISTS eventos_integracion (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id),
    tipo_evento varchar(100) NOT NULL, agregado_tipo varchar(50) NOT NULL, agregado_id uuid NOT NULL,
    payload jsonb NOT NULL, estado varchar(20) NOT NULL DEFAULT 'PENDIENTE'
        CHECK (estado IN ('PENDIENTE','PROCESANDO','PROCESADO','ERROR','CANCELADO')),
    disponible_at timestamptz NOT NULL DEFAULT now(), procesado_at timestamptz, intentos integer NOT NULL DEFAULT 0 CHECK (intentos >= 0),
    ultimo_error text, idempotency_key varchar(150), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_eventos_integracion_idempotencia
    ON eventos_integracion (empresa_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Registro inmutable de callbacks recibidos desde el proveedor fiscal. Ningún
-- secreto ni certificado se almacena aquí; la firma se valida en la aplicación.
CREATE TABLE IF NOT EXISTS webhooks_entrantes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid REFERENCES empresas(id),
    proveedor varchar(100) NOT NULL, evento_externo_id varchar(150), tipo_evento varchar(100),
    cabeceras jsonb, payload jsonb NOT NULL, firma_valida boolean, recibido_at timestamptz NOT NULL DEFAULT now(),
    estado_procesamiento varchar(20) NOT NULL DEFAULT 'PENDIENTE'
        CHECK (estado_procesamiento IN ('PENDIENTE','PROCESADO','ERROR','IGNORADO')),
    procesado_at timestamptz, error_procesamiento text
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_webhooks_proveedor_evento
    ON webhooks_entrantes (proveedor, evento_externo_id) WHERE evento_externo_id IS NOT NULL;

-- Historial de cada estado comunicado por la API fiscal o por un webhook.
CREATE TABLE IF NOT EXISTS eventos_documento_fiscal (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), documento_electronico_id uuid NOT NULL REFERENCES documentos_electronicos(id) ON DELETE CASCADE,
    fuente varchar(20) NOT NULL CHECK (fuente IN ('SOLICITUD','RESPUESTA_API','WEBHOOK','MANUAL')),
    estado varchar(25) NOT NULL CHECK (estado IN ('PENDIENTE_ENVIO','EN_PROCESO','APROBADO','RECHAZADO','ERROR_TECNICO','ANULADO','CANCELADO')),
    codigo_respuesta varchar(100), mensaje text, payload jsonb, ocurrido_at timestamptz NOT NULL DEFAULT now(), registrado_por uuid REFERENCES usuarios(id)
);

-- Se amplía el contrato con el proveedor fiscal: la API continúa firmando y
-- enviando el XML; DistribuNex conserva trazabilidad, XML/PDF y estado recibido.
ALTER TABLE documentos_electronicos
    ADD COLUMN IF NOT EXISTS configuracion_api_fiscal_id uuid REFERENCES configuraciones_api_fiscal(id),
    ADD COLUMN IF NOT EXISTS referencia_externa varchar(150),
    ADD COLUMN IF NOT EXISTS estado_gobierno varchar(50),
    ADD COLUMN IF NOT EXISTS fecha_respuesta_gobierno timestamptz,
    ADD COLUMN IF NOT EXISTS ultimo_envio_at timestamptz,
    ADD COLUMN IF NOT EXISTS xml_url text,
    ADD COLUMN IF NOT EXISTS xml_checksum_sha256 varchar(64),
    ADD COLUMN IF NOT EXISTS version_proveedor varchar(50);
CREATE UNIQUE INDEX IF NOT EXISTS ux_documentos_electronicos_referencia_externa
    ON documentos_electronicos (empresa_id, referencia_externa) WHERE referencia_externa IS NOT NULL;

ALTER TABLE solicitudes_api_fiscal
    ADD COLUMN IF NOT EXISTS idempotency_key varchar(150),
    ADD COLUMN IF NOT EXISTS proximo_intento_at timestamptz,
    ADD COLUMN IF NOT EXISTS http_status integer,
    ADD COLUMN IF NOT EXISTS duracion_ms integer CHECK (duracion_ms >= 0);
CREATE UNIQUE INDEX IF NOT EXISTS ux_solicitudes_api_fiscal_idempotencia
    ON solicitudes_api_fiscal (idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION trg_validar_archivo_adjunto()
RETURNS trigger AS $$
BEGIN
    IF NEW.subido_por IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.subido_por AND empresa_id = NEW.empresa_id) THEN
        RAISE EXCEPTION 'El usuario que sube el archivo debe pertenecer a la misma empresa.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_notificacion()
RETURNS trigger AS $$
BEGIN
    IF NEW.usuario_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.usuario_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El usuario destinatario debe pertenecer a la misma empresa.'; END IF;
    IF NEW.cliente_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM clientes WHERE id = NEW.cliente_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El cliente destinatario debe pertenecer a la misma empresa.'; END IF;
    IF NEW.plantilla_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM plantillas_notificacion WHERE id = NEW.plantilla_id AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'La plantilla debe pertenecer a la misma empresa.'; END IF;
    IF NEW.creado_por IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.creado_por AND empresa_id = NEW.empresa_id) THEN RAISE EXCEPTION 'El creador de la notificación debe pertenecer a la misma empresa.'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_documento_electronico_api()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM ventas WHERE id = NEW.venta_id AND empresa_id = NEW.empresa_id) THEN
        RAISE EXCEPTION 'La venta del documento electrónico debe pertenecer a la misma empresa.';
    END IF;
    IF NEW.configuracion_api_fiscal_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM configuraciones_api_fiscal WHERE id = NEW.configuracion_api_fiscal_id AND empresa_id = NEW.empresa_id
    ) THEN
        RAISE EXCEPTION 'La configuración fiscal debe pertenecer a la misma empresa.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_validar_evento_documento_fiscal()
RETURNS trigger AS $$
BEGIN
    IF NEW.registrado_por IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM usuarios u JOIN documentos_electronicos d ON d.empresa_id = u.empresa_id
        WHERE u.id = NEW.registrado_por AND d.id = NEW.documento_electronico_id
    ) THEN
        RAISE EXCEPTION 'El usuario del evento fiscal debe pertenecer a la empresa del documento.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_archivos_adjuntos_validar_integridad BEFORE INSERT OR UPDATE ON archivos_adjuntos FOR EACH ROW EXECUTE FUNCTION trg_validar_archivo_adjunto();
CREATE TRIGGER trg_notificaciones_validar_integridad BEFORE INSERT OR UPDATE ON notificaciones FOR EACH ROW EXECUTE FUNCTION trg_validar_notificacion();
CREATE TRIGGER trg_documentos_electronicos_validar_api BEFORE INSERT OR UPDATE ON documentos_electronicos FOR EACH ROW EXECUTE FUNCTION trg_validar_documento_electronico_api();
CREATE TRIGGER trg_eventos_documento_fiscal_validar_integridad BEFORE INSERT OR UPDATE ON eventos_documento_fiscal FOR EACH ROW EXECUTE FUNCTION trg_validar_evento_documento_fiscal();

CREATE INDEX IF NOT EXISTS ix_archivos_adjuntos_entidad ON archivos_adjuntos (empresa_id, entidad_tipo, entidad_id);
CREATE INDEX IF NOT EXISTS ix_notificaciones_pendientes ON notificaciones (empresa_id, estado, programada_at) WHERE estado IN ('PENDIENTE','ERROR');
CREATE INDEX IF NOT EXISTS ix_eventos_integracion_pendientes ON eventos_integracion (estado, disponible_at) WHERE estado IN ('PENDIENTE','ERROR');
CREATE INDEX IF NOT EXISTS ix_webhooks_entrantes_pendientes ON webhooks_entrantes (estado_procesamiento, recibido_at) WHERE estado_procesamiento = 'PENDIENTE';
CREATE INDEX IF NOT EXISTS ix_eventos_documento_fiscal_documento ON eventos_documento_fiscal (documento_electronico_id, ocurrido_at DESC);
CREATE INDEX IF NOT EXISTS ix_solicitudes_api_fiscal_reintento ON solicitudes_api_fiscal (estado, proximo_intento_at) WHERE estado IN ('PENDIENTE','ERROR');

DO $$ DECLARE t text; BEGIN
    FOREACH t IN ARRAY ARRAY['plantillas_notificacion','notificaciones','eventos_integracion'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', t, t);
        EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
    END LOOP;
END $$;

INSERT INTO schema_migrations (version, description)
VALUES ('007', 'Integraciones durables, trazabilidad fiscal, adjuntos y notificaciones')
ON CONFLICT (version) DO NOTHING;
COMMIT;