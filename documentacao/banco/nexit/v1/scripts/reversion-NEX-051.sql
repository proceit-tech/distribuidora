-- REVERSIÓN manual de NEX-051 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con copia de seguridad previa:
--   psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-051.sql
-- ABORTA si algún perfil tiene asignado FACTURACION_ELECTRONICA.PRECIO (retírelo antes desde la administración de perfiles). Los documentos ya emitidos
-- conservan su payload; esta reversión no los modifica. Después hay que borrar la fila 'NEX-051' de schema_migrations.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.permisos WHERE codigo = 'FACTURACION_ELECTRONICA.PRECIO') THEN
    RAISE EXCEPTION 'el permiso FACTURACION_ELECTRONICA.PRECIO no existe: NEX-051 no está aplicada.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.perfil_permiso pp JOIN public.permisos pe ON pe.id = pp.permiso_id WHERE pe.codigo = 'FACTURACION_ELECTRONICA.PRECIO') THEN
    RAISE EXCEPTION 'hay perfiles con FACTURACION_ELECTRONICA.PRECIO asignado: retírelo desde la administración de perfiles antes de revertir.';
  END IF;
END $$;

DELETE FROM public.permisos WHERE codigo = 'FACTURACION_ELECTRONICA.PRECIO';
