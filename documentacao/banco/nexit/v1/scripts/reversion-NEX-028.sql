-- REVERSIÓN manual de NEX-028 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con
-- copia de seguridad previa:  psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-028.sql
-- ABORTA si existen documentos cargados como archivo (almacen_clave NOT NULL): volver a url_archivo NOT NULL los dejaría sin
-- referencia y los archivos del volumen quedarían huérfanos. En ese caso, primero exportar/eliminar esos documentos de forma
-- explícita (decisión del responsable); no hay reversión parcial.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cliente_documentos WHERE almacen_clave IS NOT NULL) THEN
    RAISE EXCEPTION 'Hay documentos cargados como archivo (almacen_clave): no se revierte NEX-028 para no dejarlos sin referencia.';
  END IF;
END $$;

ALTER TABLE public.cliente_documentos
  DROP CONSTRAINT IF EXISTS cliente_documentos_almacen_clave_key,
  DROP CONSTRAINT IF EXISTS cliente_documentos_almacen_chk,
  DROP CONSTRAINT IF EXISTS cliente_documentos_origen_chk,
  DROP COLUMN IF EXISTS almacen_clave,
  DROP COLUMN IF EXISTS tamano_bytes,
  DROP COLUMN IF EXISTS tipo_mime,
  DROP COLUMN IF EXISTS sha256;
ALTER TABLE public.cliente_documentos ALTER COLUMN url_archivo SET NOT NULL;
COMMENT ON COLUMN public.cliente_documentos.url_archivo IS NULL;
