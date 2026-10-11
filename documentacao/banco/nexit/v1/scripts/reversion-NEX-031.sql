-- REVERSIÓN manual de NEX-031 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con
-- copia de seguridad previa:  psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-031.sql
-- ABORTA si hay documentos eliminados lógicamente, versiones adicionales (>1) o eventos de auditoría: son la única trazabilidad y
-- los archivos asociados quedarían sin referencia. Exportar y decidir de forma explícita antes de revertir; no hay reversión parcial.
DO $$
BEGIN
  IF to_regclass('public.cliente_documento_eventos') IS NOT NULL AND EXISTS (SELECT 1 FROM public.cliente_documento_eventos) THEN
    RAISE EXCEPTION 'cliente_documento_eventos contiene auditoría: exportela antes de revertir NEX-031.';
  END IF;
  IF to_regclass('public.cliente_documento_versiones') IS NOT NULL AND EXISTS (SELECT 1 FROM public.cliente_documento_versiones WHERE version > 1) THEN
    RAISE EXCEPTION 'Hay versiones anteriores de documentos: no se revierte NEX-031 para no perder el historial.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cliente_documentos WHERE eliminado_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Hay documentos eliminados lógicamente: no se revierte NEX-031 para no hacerlos reaparecer ni perder la trazabilidad.';
  END IF;
END $$;

DROP TABLE IF EXISTS public.cliente_documento_eventos;
DROP TABLE IF EXISTS public.cliente_documento_versiones;
DROP INDEX IF EXISTS public.cliente_documentos_activos_idx;
ALTER TABLE public.cliente_documentos
  DROP CONSTRAINT IF EXISTS cliente_documentos_eliminado_chk,
  DROP CONSTRAINT IF EXISTS cliente_documentos_eliminado_por_fk,
  DROP COLUMN IF EXISTS eliminado_por,
  DROP COLUMN IF EXISTS eliminado_at,
  DROP COLUMN IF EXISTS version_vigente;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    GRANT DELETE ON public.cliente_documentos TO nexit_runtime;
  END IF;
END $$;
