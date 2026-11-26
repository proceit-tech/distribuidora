-- =====================================================================
-- NEX-041 — Productos: documentos como ARCHIVOS privados con versiones y exclusión lógica, foto principal privada y auditoría (PRD-REV-03/04).
-- Requiere NEX-007, NEX-037 y NEX-039 (envoltorio de grants). Mismo modelo que Proveedores (NEX-036) adaptado a la entidad Producto.
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo). Reversión: scripts/reversion-NEX-041.sql.
-- Prerrequisito operativo: volumen privado y variable NEXIT_ARCHIVOS_DIR (documentacao/infra/VOLUMEN-ARCHIVOS-PRIVADOS.md).
--
-- DOCUMENTOS
--   · Los registros anteriores (con enlace url_archivo) se CONSERVAN sin cambios y se muestran como «enlace anterior» hasta que se les cargue un
--     archivo. url_archivo deja de ser obligatorio; cada documento tiene archivo o enlace.
--   · Nada se destruye: eliminar = marcar eliminado_at/por (restaurable); reemplazar = nueva versión; la versión anterior queda en
--     producto_documento_versiones y puede recuperarse. El rol de la aplicación pierde DELETE sobre documentos y no tiene escritura sobre versiones salvo INSERT.
--   · productos.carga_documentos_inicial_abierta: el creador con PRODUCTOS.CREAR puede cargar documentos y la foto solo mientras el alta esté abierta
--     (se cierra al finalizar el alta o en la primera edición). Los productos existentes quedan CERRADOS.
-- FOTO PRINCIPAL
--   · imagen_* guarda UNA foto privada por producto (PNG/JPG, mismas reglas de archivo). Es independiente de los documentos técnicos y NO reemplaza a
--     imagen_url, que se conserva intacta para las fotos anteriores. Cambiar o quitar la foto no borra el archivo anterior (queda en la auditoría).
-- AUDITORÍA
--   · producto_eventos: solo altas (triggers que rechazan UPDATE/DELETE/TRUNCATE, como proveedor_eventos en NEX-037) con grants resistentes a la
--     reaplicación (nex_aplicar_grants_productos, llamada por el envoltorio de nex_aplicar_grants_runtime).
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.producto_documentos') IS NULL OR to_regclass('public.productos') IS NULL THEN
    RAISE EXCEPTION 'NEX-041 requiere NEX-007 (productos y producto_documentos).';
  END IF;
  IF to_regprocedure('public.nex_aplicar_grants_runtime_base()') IS NULL
     OR to_regprocedure('public.nex_aplicar_grants_proveedores()') IS NULL
     OR to_regprocedure('public.nex_aplicar_grants_fiscal()') IS NULL THEN
    RAISE EXCEPTION 'NEX-041 requiere NEX-037 y NEX-039 (envoltorio de grants del runtime).';
  END IF;
  IF to_regclass('public.producto_documento_versiones') IS NOT NULL THEN
    RAISE EXCEPTION 'producto_documento_versiones ya existe: NEX-041 parece aplicada; no se reaplica por suposición.';
  END IF;
END $$;

-- 1) Documentos como archivos
ALTER TABLE public.producto_documentos ALTER COLUMN url_archivo DROP NOT NULL;

ALTER TABLE public.producto_documentos
  ADD COLUMN almacen_clave   varchar(120),
  ADD COLUMN tamano_bytes    bigint CHECK (tamano_bytes IS NULL OR (tamano_bytes > 0 AND tamano_bytes <= 10485760)),
  ADD COLUMN tipo_mime       varchar(100),
  ADD COLUMN sha256          char(64) CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  ADD COLUMN version_vigente integer NOT NULL DEFAULT 1 CHECK (version_vigente >= 1),
  ADD COLUMN eliminado_at    timestamptz,
  ADD COLUMN eliminado_por   uuid,
  ADD CONSTRAINT producto_documentos_eliminado_por_fk FOREIGN KEY (empresa_id, eliminado_por) REFERENCES public.usuarios (empresa_id, id),
  ADD CONSTRAINT producto_documentos_eliminado_chk CHECK ((eliminado_at IS NULL) = (eliminado_por IS NULL)),
  ADD CONSTRAINT producto_documentos_fuente_chk CHECK (url_archivo IS NOT NULL OR almacen_clave IS NOT NULL),
  ADD CONSTRAINT producto_documentos_archivo_chk CHECK (almacen_clave IS NULL OR (tamano_bytes IS NOT NULL AND tipo_mime IS NOT NULL AND sha256 IS NOT NULL));

CREATE UNIQUE INDEX producto_documentos_clave_uq ON public.producto_documentos (almacen_clave) WHERE almacen_clave IS NOT NULL;
CREATE INDEX producto_documentos_activos_idx ON public.producto_documentos (empresa_id, producto_id) WHERE eliminado_at IS NULL;

CREATE TABLE public.producto_documento_versiones (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid         NOT NULL REFERENCES public.empresas (id),
  producto_id    uuid         NOT NULL,
  documento_id   uuid         NOT NULL,
  version        integer      NOT NULL CHECK (version >= 1),
  almacen_clave  varchar(120) NOT NULL,
  nombre_archivo varchar(255) NOT NULL CHECK (length(btrim(nombre_archivo)) > 0),
  tamano_bytes   bigint       NOT NULL CHECK (tamano_bytes > 0 AND tamano_bytes <= 10485760),
  tipo_mime      varchar(100) NOT NULL,
  sha256         char(64)     NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  subido_por     uuid,
  subido_at      timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT producto_documento_versiones_clave_key UNIQUE (almacen_clave),
  CONSTRAINT producto_documento_versiones_version_key UNIQUE (documento_id, version),
  CONSTRAINT producto_documento_versiones_documento_fk FOREIGN KEY (empresa_id, documento_id) REFERENCES public.producto_documentos (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT producto_documento_versiones_producto_fk FOREIGN KEY (empresa_id, producto_id) REFERENCES public.productos (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT producto_documento_versiones_usuario_fk FOREIGN KEY (empresa_id, subido_por) REFERENCES public.usuarios (empresa_id, id)
);

CREATE INDEX producto_documento_versiones_doc_idx ON public.producto_documento_versiones (empresa_id, documento_id, version DESC);

COMMENT ON TABLE public.producto_documento_versiones IS 'Historial de versiones de archivo de un documento de producto; nunca se borra ni se purga.';

ALTER TABLE public.productos
  ADD COLUMN carga_documentos_inicial_abierta boolean NOT NULL DEFAULT false;

-- 2) Foto principal privada (independiente de imagen_url y de los documentos técnicos)
ALTER TABLE public.productos
  ADD COLUMN imagen_clave          varchar(120),
  ADD COLUMN imagen_nombre         varchar(255),
  ADD COLUMN imagen_mime           varchar(100),
  ADD COLUMN imagen_tamano         bigint,
  ADD COLUMN imagen_sha256         char(64),
  ADD COLUMN imagen_actualizada_at timestamptz,
  ADD COLUMN imagen_actualizada_por uuid,
  ADD CONSTRAINT productos_imagen_actualizada_por_fk FOREIGN KEY (empresa_id, imagen_actualizada_por) REFERENCES public.usuarios (empresa_id, id),
  ADD CONSTRAINT productos_imagen_chk CHECK (
    (imagen_clave IS NULL AND imagen_nombre IS NULL AND imagen_mime IS NULL AND imagen_tamano IS NULL AND imagen_sha256 IS NULL AND imagen_actualizada_at IS NULL)
    OR (imagen_clave IS NOT NULL AND imagen_nombre IS NOT NULL AND length(btrim(imagen_nombre)) > 0 AND imagen_mime IN ('image/png', 'image/jpeg')
        AND imagen_tamano > 0 AND imagen_tamano <= 10485760 AND imagen_sha256 ~ '^[0-9a-f]{64}$' AND imagen_actualizada_at IS NOT NULL));

CREATE UNIQUE INDEX productos_imagen_clave_uq ON public.productos (imagen_clave) WHERE imagen_clave IS NOT NULL;

COMMENT ON COLUMN public.productos.imagen_url IS 'Enlace de imagen ANTERIOR (legado). Se conserva; la foto privada vive en imagen_clave.';

-- 3) Auditoría de Productos (solo altas)
CREATE TABLE public.producto_eventos (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid        NOT NULL REFERENCES public.empresas (id),
  producto_id   uuid        NOT NULL,
  entidad       text        NOT NULL CHECK (entidad IN ('PRODUCTO','DOCUMENTO','IMAGEN')),
  entidad_id    uuid,
  accion        text        NOT NULL CHECK (accion ~ '^[A-Z_]{3,40}$'),
  anterior      jsonb,
  nuevo         jsonb,
  usuario_id    uuid        NOT NULL,
  creado_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT producto_eventos_producto_fk FOREIGN KEY (empresa_id, producto_id) REFERENCES public.productos (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT producto_eventos_usuario_fk FOREIGN KEY (empresa_id, usuario_id) REFERENCES public.usuarios (empresa_id, id)
);

CREATE INDEX producto_eventos_producto_idx ON public.producto_eventos (empresa_id, producto_id, creado_at DESC);
CREATE INDEX producto_eventos_entidad_idx ON public.producto_eventos (empresa_id, entidad, entidad_id, creado_at DESC);

COMMENT ON TABLE public.producto_eventos IS 'Auditoría (solo altas) de documentos y foto de Productos: acción, valor anterior/nuevo, usuario y fecha.';

CREATE OR REPLACE FUNCTION public.producto_eventos_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'producto_eventos es de solo altas: no se vacía.' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'producto_eventos es de solo altas: no se modifica.' USING ERRCODE = 'P0001';
  END IF;
  -- DELETE: solo cuando el producto ya no existe (cascada del reinicio de empresas DEMO), nunca mientras exista.
  IF EXISTS (SELECT 1 FROM public.productos p WHERE p.empresa_id = OLD.empresa_id AND p.id = OLD.producto_id) THEN
    RAISE EXCEPTION 'producto_eventos es de solo altas: no se elimina.' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER producto_eventos_inmutable_fila_trg
  BEFORE UPDATE OR DELETE ON public.producto_eventos
  FOR EACH ROW EXECUTE FUNCTION public.producto_eventos_inmutable();

CREATE TRIGGER producto_eventos_inmutable_truncate_trg
  BEFORE TRUNCATE ON public.producto_eventos
  FOR EACH STATEMENT EXECUTE FUNCTION public.producto_eventos_inmutable();

-- 4) Privilegios del rol de la aplicación, idempotentes y resistentes a nex_aplicar_grants_runtime() (REVOKE ALL + reconcesión)
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_productos() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;

  -- Auditoría y versiones: solo lectura y altas. Jamás UPDATE ni DELETE.
  REVOKE ALL ON public.producto_eventos, public.producto_documento_versiones FROM nexit_runtime;
  GRANT SELECT, INSERT ON public.producto_eventos TO nexit_runtime;
  GRANT SELECT, INSERT ON public.producto_documento_versiones TO nexit_runtime;

  -- Documentos: exclusión lógica, sin DELETE físico.
  REVOKE DELETE ON public.producto_documentos FROM nexit_runtime;
END $$;

-- Convención de NEX-037/039: el envoltorio llama a la función base y a cada función de permisos por módulo.
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_runtime() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.nex_aplicar_grants_runtime_base();
  PERFORM public.nex_aplicar_grants_proveedores();
  PERFORM public.nex_aplicar_grants_fiscal();
  PERFORM public.nex_aplicar_grants_productos();
END $$;

SELECT public.nex_aplicar_grants_productos();
