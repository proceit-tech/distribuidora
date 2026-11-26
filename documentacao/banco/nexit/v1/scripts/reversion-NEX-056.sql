-- REVERSIÓN manual de NEX-056 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con copia de seguridad previa:
--   psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-056.sql
-- ABORTA si algún perfil tiene asignado FACTURACION_ELECTRONICA.AJUSTE_FISCAL (retírelo antes desde la administración de perfiles) o si la bitácora tiene registros (es evidencia de
-- cambios guardados en Productos: expórtela y archívela antes; esta reversión no la borra en silencio). No modifica productos ni documentos. Después hay que borrar la fila 'NEX-056'
-- de schema_migrations.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.permisos WHERE codigo = 'FACTURACION_ELECTRONICA.AJUSTE_FISCAL') OR to_regclass('public.producto_clasificacion_fiscal_log') IS NULL THEN
    RAISE EXCEPTION 'NEX-056 no está aplicada (falta el permiso o la bitácora).';
  END IF;
  IF EXISTS (SELECT 1 FROM public.perfil_permiso pp JOIN public.permisos pe ON pe.id = pp.permiso_id WHERE pe.codigo = 'FACTURACION_ELECTRONICA.AJUSTE_FISCAL') THEN
    RAISE EXCEPTION 'hay perfiles con FACTURACION_ELECTRONICA.AJUSTE_FISCAL asignado: retírelo desde la administración de perfiles antes de revertir.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.producto_clasificacion_fiscal_log) THEN
    RAISE EXCEPTION 'la bitácora producto_clasificacion_fiscal_log tiene registros: archívelos antes de revertir (no se borran en silencio).';
  END IF;
END $$;

DROP TABLE public.producto_clasificacion_fiscal_log;
DROP FUNCTION public.producto_clasificacion_fiscal_log_inmutable();
DROP FUNCTION public.nex_aplicar_grants_facturacion_ajuste();
DELETE FROM public.permisos WHERE codigo = 'FACTURACION_ELECTRONICA.AJUSTE_FISCAL';
