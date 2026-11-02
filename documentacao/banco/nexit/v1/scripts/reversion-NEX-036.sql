-- REVERSIÓN manual de NEX-036 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con
-- copia de seguridad previa:  psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-036.sql
-- ABORTA si hay documentos cargados como archivo, versiones, documentos eliminados, retenciones vinculadas a un certificado o
-- retenciones desactivadas: son datos que la estructura anterior no puede representar y los archivos quedarían sin referencia.
-- Exportar y decidir de forma explícita antes de revertir; no hay reversión parcial. Después hay que borrar la fila 'NEX-036' de schema_migrations.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.proveedor_documentos WHERE almacen_clave IS NOT NULL OR eliminado_at IS NOT NULL OR version_vigente > 1) THEN
    RAISE EXCEPTION 'Hay documentos de proveedores cargados como archivo, eliminados o con versiones: no se revierte NEX-036 para no perder archivos ni historial.';
  END IF;
  IF to_regclass('public.proveedor_documento_versiones') IS NOT NULL AND EXISTS (SELECT 1 FROM public.proveedor_documento_versiones) THEN
    RAISE EXCEPTION 'proveedor_documento_versiones contiene versiones: expórtelas antes de revertir NEX-036.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.proveedor_retenciones WHERE documento_certificado_id IS NOT NULL OR NOT activa) THEN
    RAISE EXCEPTION 'Hay retenciones desactivadas o vinculadas a un certificado: no se revierte NEX-036 para no perder ese estado.';
  END IF;
END $$;

DROP TRIGGER IF EXISTS proveedor_retenciones_activacion_trg ON public.proveedor_retenciones;
DROP FUNCTION IF EXISTS public.proveedor_retencion_validar_activacion();
ALTER TABLE public.proveedor_retenciones
  DROP CONSTRAINT IF EXISTS proveedor_retenciones_certificado_fk,
  DROP COLUMN IF EXISTS documento_certificado_id,
  DROP COLUMN IF EXISTS activa;

ALTER TABLE public.proveedores DROP COLUMN IF EXISTS carga_documentos_inicial_abierta;

DROP TABLE IF EXISTS public.proveedor_documento_versiones;
DROP INDEX IF EXISTS public.proveedor_documentos_activos_idx;
DROP INDEX IF EXISTS public.proveedor_documentos_clave_uq;
ALTER TABLE public.proveedor_documentos
  DROP CONSTRAINT IF EXISTS proveedor_documentos_archivo_chk,
  DROP CONSTRAINT IF EXISTS proveedor_documentos_fuente_chk,
  DROP CONSTRAINT IF EXISTS proveedor_documentos_eliminado_chk,
  DROP CONSTRAINT IF EXISTS proveedor_documentos_eliminado_por_fk,
  DROP COLUMN IF EXISTS eliminado_por,
  DROP COLUMN IF EXISTS eliminado_at,
  DROP COLUMN IF EXISTS version_vigente,
  DROP COLUMN IF EXISTS sha256,
  DROP COLUMN IF EXISTS tipo_mime,
  DROP COLUMN IF EXISTS tamano_bytes,
  DROP COLUMN IF EXISTS almacen_clave;
ALTER TABLE public.proveedor_documentos ALTER COLUMN url_archivo SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    GRANT DELETE ON public.proveedor_documentos TO nexit_runtime;
  END IF;
END $$;
