-- REVERSIÓN manual de NEX-042 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con
-- copia de seguridad previa:  psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-042.sql
-- ABORTA si producto_imagen_versiones tiene filas (se perdería la referencia a los archivos de fotos anteriores). No toca NEX-041.
-- Después hay que borrar la fila 'NEX-042' de schema_migrations.
DO $$
BEGIN
  IF to_regclass('public.producto_imagen_versiones') IS NULL THEN
    RAISE EXCEPTION 'producto_imagen_versiones no existe: NEX-042 no está aplicada.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.producto_imagen_versiones) THEN
    RAISE EXCEPTION 'producto_imagen_versiones tiene filas: conserve o exporte el historial de fotos antes de revertir.';
  END IF;
END $$;

-- Restaura la función de permisos de Productos tal como la dejó NEX-041.
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_productos() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;

  REVOKE ALL ON public.producto_eventos, public.producto_documento_versiones FROM nexit_runtime;
  GRANT SELECT, INSERT ON public.producto_eventos TO nexit_runtime;
  GRANT SELECT, INSERT ON public.producto_documento_versiones TO nexit_runtime;

  REVOKE DELETE ON public.producto_documentos FROM nexit_runtime;
END $$;

DROP TRIGGER IF EXISTS producto_imagen_versiones_inmutable_truncate_trg ON public.producto_imagen_versiones;
DROP TRIGGER IF EXISTS producto_imagen_versiones_inmutable_fila_trg ON public.producto_imagen_versiones;
DROP FUNCTION IF EXISTS public.producto_imagen_versiones_inmutable();
DROP TABLE IF EXISTS public.producto_imagen_versiones;
