-- =====================================================================
-- NEX-036 — Proveedores: documentos como ARCHIVOS privados con versiones, exclusión lógica y auditoría; retenciones con estado de
-- activación y certificado vinculado (DEC-PRV-08, PRV-A07, PRV-A08). Requiere NEX-006 y NEX-034 (auditoría proveedor_eventos).
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo). Reversión: scripts/reversion-NEX-036.sql.
-- Prerrequisito operativo: volumen privado y variable NEXIT_ARCHIVOS_DIR (documentacao/infra/VOLUMEN-ARCHIVOS-PRIVADOS.md).
--
-- DOCUMENTOS
--   · Los registros anteriores (con enlace url_archivo) se CONSERVAN sin cambios y se muestran como «enlace anterior» hasta que se
--     les cargue un archivo. url_archivo deja de ser obligatorio; cada documento tiene archivo o enlace.
--   · Nada se destruye: eliminar = marcar eliminado_at/por (se puede restaurar); reemplazar = nueva versión; la versión anterior
--     queda en proveedor_documento_versiones y puede recuperarse. El rol de la aplicación pierde DELETE sobre documentos y versiones.
--   · La auditoría de documentos usa proveedor_eventos (entidad DOCUMENTO).
--   · proveedores.carga_documentos_inicial_abierta: misma política que Clientes (creador con CREAR puede cargar documentos solo
--     mientras el alta está abierta; se cierra al finalizar el alta o en la primera edición). Los proveedores existentes quedan CERRADOS.
-- RETENCIONES
--   · activa: una retención que exige certificado solo puede estar ACTIVA con un documento CERTIFICADO_RETENCION válido (con archivo,
--     no eliminado, no vencido, del mismo proveedor), vinculado en documento_certificado_id. El cadastro no calcula retenciones.
--   · Retenciones existentes: las que NO exigen certificado quedan activas; las que lo exigen quedan inactivas hasta que se vincule
--     un certificado válido y se active (decisión conservadora: no se presume documentación que nunca se verificó).
-- =====================================================================

ALTER TABLE public.proveedor_documentos ALTER COLUMN url_archivo DROP NOT NULL;

ALTER TABLE public.proveedor_documentos
  ADD COLUMN almacen_clave   varchar(120),
  ADD COLUMN tamano_bytes    bigint CHECK (tamano_bytes IS NULL OR (tamano_bytes > 0 AND tamano_bytes <= 10485760)),
  ADD COLUMN tipo_mime       varchar(100),
  ADD COLUMN sha256          char(64) CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  ADD COLUMN version_vigente integer NOT NULL DEFAULT 1 CHECK (version_vigente >= 1),
  ADD COLUMN eliminado_at    timestamptz,
  ADD COLUMN eliminado_por   uuid,
  ADD CONSTRAINT proveedor_documentos_eliminado_por_fk FOREIGN KEY (empresa_id, eliminado_por) REFERENCES public.usuarios (empresa_id, id),
  ADD CONSTRAINT proveedor_documentos_eliminado_chk CHECK ((eliminado_at IS NULL) = (eliminado_por IS NULL)),
  ADD CONSTRAINT proveedor_documentos_fuente_chk CHECK (url_archivo IS NOT NULL OR almacen_clave IS NOT NULL),
  ADD CONSTRAINT proveedor_documentos_archivo_chk CHECK (almacen_clave IS NULL OR (tamano_bytes IS NOT NULL AND tipo_mime IS NOT NULL AND sha256 IS NOT NULL));

CREATE UNIQUE INDEX proveedor_documentos_clave_uq ON public.proveedor_documentos (almacen_clave) WHERE almacen_clave IS NOT NULL;
CREATE INDEX proveedor_documentos_activos_idx ON public.proveedor_documentos (empresa_id, proveedor_id) WHERE eliminado_at IS NULL;

CREATE TABLE public.proveedor_documento_versiones (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid         NOT NULL REFERENCES public.empresas (id),
  proveedor_id   uuid         NOT NULL,
  documento_id   uuid         NOT NULL,
  version        integer      NOT NULL CHECK (version >= 1),
  almacen_clave  varchar(120) NOT NULL,
  nombre_archivo varchar(255) NOT NULL CHECK (length(btrim(nombre_archivo)) > 0),
  tamano_bytes   bigint       NOT NULL CHECK (tamano_bytes > 0 AND tamano_bytes <= 10485760),
  tipo_mime      varchar(100) NOT NULL,
  sha256         char(64)     NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  subido_por     uuid,
  subido_at      timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT proveedor_documento_versiones_clave_key UNIQUE (almacen_clave),
  CONSTRAINT proveedor_documento_versiones_version_key UNIQUE (documento_id, version),
  CONSTRAINT proveedor_documento_versiones_documento_fk FOREIGN KEY (empresa_id, documento_id) REFERENCES public.proveedor_documentos (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT proveedor_documento_versiones_proveedor_fk FOREIGN KEY (empresa_id, proveedor_id) REFERENCES public.proveedores (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT proveedor_documento_versiones_usuario_fk FOREIGN KEY (empresa_id, subido_por) REFERENCES public.usuarios (empresa_id, id)
);

CREATE INDEX proveedor_documento_versiones_doc_idx ON public.proveedor_documento_versiones (empresa_id, documento_id, version DESC);

COMMENT ON TABLE public.proveedor_documento_versiones IS 'Historial de versiones de archivo de un documento de proveedor; nunca se borra ni se purga.';

ALTER TABLE public.proveedores
  ADD COLUMN carga_documentos_inicial_abierta boolean NOT NULL DEFAULT false;

-- Retenciones: estado de activación y certificado vinculado.
ALTER TABLE public.proveedor_retenciones
  ADD COLUMN activa boolean NOT NULL DEFAULT true,
  ADD COLUMN documento_certificado_id uuid,
  ADD CONSTRAINT proveedor_retenciones_certificado_fk FOREIGN KEY (empresa_id, documento_certificado_id) REFERENCES public.proveedor_documentos (empresa_id, id);

UPDATE public.proveedor_retenciones SET activa = false WHERE certificado_obligatorio;

-- Defensa en base de datos: una retención que exige certificado solo se ACTIVA con un certificado válido del mismo proveedor.
-- Se evalúa al insertar o cuando cambian activa, certificado_obligatorio o el documento vinculado (no al editar otros datos).
CREATE OR REPLACE FUNCTION public.proveedor_retencion_validar_activacion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.activa AND NEW.certificado_obligatorio
     AND (TG_OP = 'INSERT'
          OR OLD.activa IS DISTINCT FROM NEW.activa
          OR OLD.certificado_obligatorio IS DISTINCT FROM NEW.certificado_obligatorio
          OR OLD.documento_certificado_id IS DISTINCT FROM NEW.documento_certificado_id) THEN
    IF NEW.documento_certificado_id IS NULL OR NOT EXISTS (
         SELECT 1 FROM public.proveedor_documentos d
          WHERE d.empresa_id = NEW.empresa_id AND d.id = NEW.documento_certificado_id AND d.proveedor_id = NEW.proveedor_id
            AND d.tipo = 'CERTIFICADO_RETENCION' AND d.almacen_clave IS NOT NULL AND d.eliminado_at IS NULL
            AND (d.fecha_vencimiento IS NULL OR d.fecha_vencimiento >= (now() AT TIME ZONE 'America/Asuncion')::date)) THEN
      RAISE EXCEPTION 'Una retención que exige certificado solo puede activarse con un certificado de retención válido.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER proveedor_retenciones_activacion_trg
  BEFORE INSERT OR UPDATE ON public.proveedor_retenciones
  FOR EACH ROW EXECUTE FUNCTION public.proveedor_retencion_validar_activacion();

-- Garantía de «sin eliminación física» para el rol de la aplicación (la aplicación ya no emite DELETE sobre documentos).
-- (Si se vuelve a ejecutar nex_aplicar_grants_runtime() habrá que repetir este REVOKE.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    REVOKE DELETE ON public.proveedor_documentos FROM nexit_runtime;
    GRANT SELECT, INSERT ON public.proveedor_documento_versiones TO nexit_runtime;
  END IF;
END $$;
