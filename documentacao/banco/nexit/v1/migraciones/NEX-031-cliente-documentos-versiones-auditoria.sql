-- =====================================================================
-- NEX-031 — Documentos de Clientes: exclusión LÓGICA, historial de versiones recuperable y auditoría (decisiones finales 3 y 4,
-- 2026-10-11). Requiere NEX-028 (archivos) y NEX-030. NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del
-- responsable (backup previo). Reversión: scripts/reversion-NEX-031.sql. No modifica el contenido de ninguna fila existente.
--
-- Política: NINGÚN archivo se destruye físicamente por eliminar ni por reemplazar.
--   · Eliminar = marcar el documento como eliminado (eliminado_at/por); desaparece de las listas operacionales; el archivo y su
--     historial se conservan y el documento puede restaurarse.
--   · Reemplazar = nueva versión; la anterior permanece en cliente_documento_versiones y puede recuperarse.
--   · Cada acción queda en cliente_documento_eventos (solo altas): usuario, fecha/hora, acción y detalle.
-- cliente_documentos sigue siendo la fila "vigente" (puntero a la versión activa, para listar rápido). Retención: preservación
-- obligatoria; ninguna purga automática (el descarte definitivo requeriría una nueva aprobación).
-- =====================================================================

ALTER TABLE public.cliente_documentos
  ADD COLUMN version_vigente integer NOT NULL DEFAULT 1 CHECK (version_vigente >= 1),
  ADD COLUMN eliminado_at    timestamptz,
  ADD COLUMN eliminado_por   uuid,
  ADD CONSTRAINT cliente_documentos_eliminado_por_fk FOREIGN KEY (empresa_id, eliminado_por) REFERENCES public.usuarios (empresa_id, id),
  ADD CONSTRAINT cliente_documentos_eliminado_chk CHECK ((eliminado_at IS NULL) = (eliminado_por IS NULL));

CREATE INDEX cliente_documentos_activos_idx ON public.cliente_documentos (empresa_id, cliente_id) WHERE eliminado_at IS NULL;

-- Todas las versiones de archivo de un documento (la vigente incluida)
CREATE TABLE public.cliente_documento_versiones (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid         NOT NULL REFERENCES public.empresas (id),
  cliente_id    uuid         NOT NULL,
  documento_id  uuid         NOT NULL,
  version       integer      NOT NULL CHECK (version >= 1),
  almacen_clave varchar(120) NOT NULL,
  nombre_archivo varchar(255) NOT NULL CHECK (length(btrim(nombre_archivo)) > 0),
  tamano_bytes  bigint       NOT NULL CHECK (tamano_bytes > 0 AND tamano_bytes <= 10485760),
  tipo_mime     varchar(100) NOT NULL,
  sha256        char(64)     NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  subido_por    uuid,
  subido_at     timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT cliente_documento_versiones_clave_key UNIQUE (almacen_clave),
  CONSTRAINT cliente_documento_versiones_version_key UNIQUE (documento_id, version),
  CONSTRAINT cliente_documento_versiones_documento_fk FOREIGN KEY (empresa_id, documento_id) REFERENCES public.cliente_documentos (empresa_id, id),
  CONSTRAINT cliente_documento_versiones_cliente_fk FOREIGN KEY (empresa_id, cliente_id) REFERENCES public.clientes (empresa_id, id),
  CONSTRAINT cliente_documento_versiones_usuario_fk FOREIGN KEY (empresa_id, subido_por) REFERENCES public.usuarios (empresa_id, id)
);

CREATE INDEX cliente_documento_versiones_doc_idx ON public.cliente_documento_versiones (empresa_id, documento_id, version DESC);

-- Auditoría de acciones sobre documentos (solo altas)
CREATE TABLE public.cliente_documento_eventos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid        NOT NULL REFERENCES public.empresas (id),
  cliente_id   uuid        NOT NULL,
  documento_id uuid        NOT NULL,
  accion       text        NOT NULL CHECK (accion IN ('CARGA', 'REEMPLAZO', 'EDICION_DATOS', 'ELIMINACION_LOGICA', 'RESTAURACION', 'RECUPERACION_VERSION')),
  version      integer,
  usuario_id   uuid,
  detalle      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  creado_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cliente_documento_eventos_documento_fk FOREIGN KEY (empresa_id, documento_id) REFERENCES public.cliente_documentos (empresa_id, id),
  CONSTRAINT cliente_documento_eventos_cliente_fk FOREIGN KEY (empresa_id, cliente_id) REFERENCES public.clientes (empresa_id, id),
  CONSTRAINT cliente_documento_eventos_usuario_fk FOREIGN KEY (empresa_id, usuario_id) REFERENCES public.usuarios (empresa_id, id)
);

CREATE INDEX cliente_documento_eventos_doc_idx ON public.cliente_documento_eventos (empresa_id, documento_id, creado_at DESC);

COMMENT ON TABLE public.cliente_documento_versiones IS 'Historial de versiones de archivo de un documento de cliente; nunca se borra ni se purga.';
COMMENT ON TABLE public.cliente_documento_eventos IS 'Auditoría (solo altas) de cargas, reemplazos, ediciones, eliminaciones lógicas, restauraciones y recuperaciones de versión.';

SELECT nex_instalar_heredar_empresa('cliente_documento_versiones', 'cliente_documentos', 'documento_id');
SELECT nex_instalar_heredar_empresa('cliente_documento_eventos', 'cliente_documentos', 'documento_id');

-- Historial inicial: cada documento ya cargado como archivo (NEX-028) pasa a tener su versión 1. No se altera ninguna fila existente.
INSERT INTO public.cliente_documento_versiones
  (empresa_id, cliente_id, documento_id, version, almacen_clave, nombre_archivo, tamano_bytes, tipo_mime, sha256, subido_por, subido_at)
SELECT d.empresa_id, d.cliente_id, d.id, 1, d.almacen_clave, d.nombre_archivo, d.tamano_bytes, d.tipo_mime, d.sha256, d.cargado_por, d.creado_at
  FROM public.cliente_documentos d
 WHERE d.almacen_clave IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.cliente_documento_versiones v WHERE v.documento_id = d.id);

-- Garantía en base de datos de "sin eliminación física": el rol de la aplicación pierde DELETE sobre los documentos y sus historiales.
-- (La aplicación ya no emite DELETE; si se vuelve a ejecutar nex_aplicar_grants_runtime() habrá que repetir este REVOKE.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    REVOKE DELETE ON public.cliente_documentos FROM nexit_runtime;
    GRANT SELECT, INSERT ON public.cliente_documento_versiones TO nexit_runtime;
    GRANT SELECT, INSERT ON public.cliente_documento_eventos TO nexit_runtime;
  END IF;
END $$;
