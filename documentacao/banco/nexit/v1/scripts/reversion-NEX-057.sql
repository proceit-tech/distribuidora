-- REVERSIÓN manual de NEX-057 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con copia de seguridad previa:
--   psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-057.sql
-- ABORTA si algún perfil tiene asignado FACTURACION_ELECTRONICA.PUNTOS (retírelo antes desde la administración de perfiles) o si la bitácora tiene registros (es evidencia de la gestión de la
-- numeración: expórtela y archívela antes; esta reversión no la borra en silencio). NO toca fe_puntos_expedicion (los puntos y su numeración se conservan) ni documentos. Después hay que borrar
-- la fila 'NEX-057' de schema_migrations.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.permisos WHERE codigo = 'FACTURACION_ELECTRONICA.PUNTOS') OR to_regclass('public.fe_puntos_expedicion_log') IS NULL THEN
    RAISE EXCEPTION 'NEX-057 no está aplicada (falta el permiso o la bitácora).';
  END IF;
  IF EXISTS (SELECT 1 FROM public.perfil_permiso pp JOIN public.permisos pe ON pe.id = pp.permiso_id WHERE pe.codigo = 'FACTURACION_ELECTRONICA.PUNTOS') THEN
    RAISE EXCEPTION 'hay perfiles con FACTURACION_ELECTRONICA.PUNTOS asignado: retírelo desde la administración de perfiles antes de revertir.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fe_puntos_expedicion_log) THEN
    RAISE EXCEPTION 'la bitácora fe_puntos_expedicion_log tiene registros: archívelos antes de revertir (no se borran en silencio).';
  END IF;
END $$;

DROP FUNCTION public.nex_aplicar_grants_facturacion_puntos();
DROP FUNCTION public.fe_punto_crear(uuid, uuid, uuid, text, text, integer, boolean);
DROP FUNCTION public.fe_punto_activar(uuid, uuid, uuid, integer, boolean);
DROP FUNCTION public.fe_punto_desactivar(uuid, uuid, uuid);
DROP FUNCTION public.fe_punto_maximo_emitido(uuid, text, text);
DROP TABLE public.fe_puntos_expedicion_log;
DROP FUNCTION public.fe_puntos_expedicion_log_inmutable();
DELETE FROM public.permisos WHERE codigo = 'FACTURACION_ELECTRONICA.PUNTOS';
