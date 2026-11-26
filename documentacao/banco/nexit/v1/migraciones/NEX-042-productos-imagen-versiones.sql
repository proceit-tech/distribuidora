-- =====================================================================
-- NEX-042 — Productos: historial privado de versiones de la foto principal (PRD-AUD-08).
-- Requiere NEX-041 (columnas imagen_* y envoltorio de grants con nex_aplicar_grants_productos). NO modifica NEX-041.
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo). Reversión: scripts/reversion-NEX-042.sql.
--
--   · Cada foto cargada queda como una fila INMUTABLE (solo altas) con su clave de almacenamiento, empresa y producto. La foto vigente sigue siendo
--     productos.imagen_* (una sola); reemplazar, quitar o recuperar cambia ese puntero y registra el evento en producto_eventos, pero ningún archivo
--     se borra ni pierde su referencia. La clave nunca se entrega en respuestas de la API.
--   · Las fotos ya cargadas con NEX-041 (si las hay) se registran como versión 1 de su producto.
--   · imagen_url (enlace anterior) no se toca.
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.productos') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'productos' AND column_name = 'imagen_clave') THEN
    RAISE EXCEPTION 'NEX-042 requiere NEX-041 (productos.imagen_clave).';
  END IF;
  IF to_regprocedure('public.nex_aplicar_grants_productos()') IS NULL THEN
    RAISE EXCEPTION 'NEX-042 requiere NEX-041 (nex_aplicar_grants_productos).';
  END IF;
  IF to_regclass('public.producto_imagen_versiones') IS NOT NULL THEN
    RAISE EXCEPTION 'producto_imagen_versiones ya existe: NEX-042 parece aplicada; no se reaplica por suposición.';
  END IF;
END $$;

CREATE TABLE public.producto_imagen_versiones (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid         NOT NULL REFERENCES public.empresas (id),
  producto_id    uuid         NOT NULL,
  version        integer      NOT NULL CHECK (version >= 1),
  almacen_clave  varchar(120) NOT NULL,
  nombre_archivo varchar(255) NOT NULL CHECK (length(btrim(nombre_archivo)) > 0),
  tamano_bytes   bigint       NOT NULL CHECK (tamano_bytes > 0 AND tamano_bytes <= 10485760),
  tipo_mime      varchar(100) NOT NULL CHECK (tipo_mime IN ('image/png', 'image/jpeg')),
  sha256         char(64)     NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  subido_por     uuid,
  subido_at      timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT producto_imagen_versiones_clave_key UNIQUE (almacen_clave),
  CONSTRAINT producto_imagen_versiones_version_key UNIQUE (empresa_id, producto_id, version),
  CONSTRAINT producto_imagen_versiones_producto_fk FOREIGN KEY (empresa_id, producto_id) REFERENCES public.productos (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT producto_imagen_versiones_usuario_fk FOREIGN KEY (empresa_id, subido_por) REFERENCES public.usuarios (empresa_id, id)
);

CREATE INDEX producto_imagen_versiones_producto_idx ON public.producto_imagen_versiones (empresa_id, producto_id, version DESC);

COMMENT ON TABLE public.producto_imagen_versiones IS 'Historial privado de fotos principales de un producto (una fila por archivo cargado); nunca se borra ni se modifica.';

-- Fotos vigentes cargadas con NEX-041: pasan a ser la versión 1 de su producto (el archivo ya existe; no se mueve ni se copia).
INSERT INTO public.producto_imagen_versiones (empresa_id, producto_id, version, almacen_clave, nombre_archivo, tamano_bytes, tipo_mime, sha256, subido_por, subido_at)
SELECT p.empresa_id, p.id, 1, p.imagen_clave, p.imagen_nombre, p.imagen_tamano, p.imagen_mime, p.imagen_sha256, p.imagen_actualizada_por, COALESCE(p.imagen_actualizada_at, now())
  FROM public.productos p
 WHERE p.imagen_clave IS NOT NULL;

-- Solo altas: ni UPDATE ni DELETE ni TRUNCATE (mismo criterio que producto_eventos).
CREATE OR REPLACE FUNCTION public.producto_imagen_versiones_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'producto_imagen_versiones es de solo altas: no se vacía.' USING ERRCODE = 'P0001';
  ELSIF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'producto_imagen_versiones es de solo altas: no se modifica.' USING ERRCODE = 'P0001';
  END IF;
  -- El borrado en cascada solo ocurre al eliminar el producto; el borrado directo se rechaza.
  IF pg_trigger_depth() = 1 THEN
    RAISE EXCEPTION 'producto_imagen_versiones es de solo altas: no se elimina.' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER producto_imagen_versiones_inmutable_fila_trg
  BEFORE UPDATE OR DELETE ON public.producto_imagen_versiones
  FOR EACH ROW EXECUTE FUNCTION public.producto_imagen_versiones_inmutable();

CREATE TRIGGER producto_imagen_versiones_inmutable_truncate_trg
  BEFORE TRUNCATE ON public.producto_imagen_versiones
  FOR EACH STATEMENT EXECUTE FUNCTION public.producto_imagen_versiones_inmutable();

-- Privilegios del rol de la aplicación: se amplía la función de Productos (la llama nex_aplicar_grants_runtime, sin tocar su envoltorio).
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_productos() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;

  REVOKE ALL ON public.producto_eventos, public.producto_documento_versiones, public.producto_imagen_versiones FROM nexit_runtime;
  GRANT SELECT, INSERT ON public.producto_eventos TO nexit_runtime;
  GRANT SELECT, INSERT ON public.producto_documento_versiones TO nexit_runtime;
  GRANT SELECT, INSERT ON public.producto_imagen_versiones TO nexit_runtime;

  REVOKE DELETE ON public.producto_documentos FROM nexit_runtime;
END $$;

SELECT public.nex_aplicar_grants_productos();
