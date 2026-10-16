-- REVERSIÓN manual de NEX-061 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con copia de seguridad previa:
--   psql -v ON_ERROR_STOP=1 -1 [-v confirmo_perder_credenciales=1] -f reversion-NEX-061.sql
-- Elimina las funciones, las tablas de credenciales/límite/bitácora y las columnas de prueba de fe_gateway_config, y retira el permiso FACTURACION_ELECTRONICA.CONFIGURAR. NO toca documentos, numeración ni
-- el resto de fe_gateway_config (URL/referencia/activo). ABORTA si el permiso está asignado a algún perfil o si hay credenciales guardadas y no se pasó -v confirmo_perder_credenciales=1
-- (las credenciales se perderían: la aplicación volvería a usar solo las variables de entorno NEXIT_FE_<REF>_*). Después hay que borrar la fila 'NEX-061' de schema_migrations.
SELECT to_regclass('public.fe_gateway_credenciales') IS NOT NULL AS aplicada \gset
\if :aplicada
  SELECT :{?confirmo_perder_credenciales} AS confirmado \gset
  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM public.perfil_permiso pp JOIN public.permisos pe ON pe.id = pp.permiso_id WHERE pe.codigo = 'FACTURACION_ELECTRONICA.CONFIGURAR') THEN
      RAISE EXCEPTION 'REVERSIÓN ABORTADA: el permiso FACTURACION_ELECTRONICA.CONFIGURAR está asignado a perfiles; retírelo primero.';
    END IF;
  END $$;
  \if :confirmado
  \else
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM public.fe_gateway_credenciales) THEN
        RAISE EXCEPTION 'REVERSIÓN ABORTADA: hay credenciales guardadas que se perderían. Repita con -v confirmo_perder_credenciales=1 si es lo que desea.';
      END IF;
    END $$;
  \endif
  DROP FUNCTION public.fe_gateway_config_ver(uuid, uuid);
  DROP FUNCTION public.fe_gateway_config_guardar(uuid, uuid, text, text, text, integer);
  DROP FUNCTION public.fe_gateway_credenciales_leer(uuid, uuid);
  DROP FUNCTION public.fe_gateway_credenciales_existe(uuid);
  DROP FUNCTION public.fe_gateway_prueba_iniciar(uuid, uuid);
  DROP FUNCTION public.fe_gateway_prueba_registrar(uuid, uuid, text, boolean);
  DROP FUNCTION public.nex_aplicar_grants_facturacion_gateway();
  DROP TABLE public.fe_gateway_credenciales;
  DROP TABLE public.fe_gateway_prueba_limite;
  DROP TABLE public.fe_gateway_config_log;
  DROP FUNCTION public.fe_gateway_config_log_inmutable();
  ALTER TABLE public.fe_gateway_config DROP COLUMN credenciales_version, DROP COLUMN ultima_prueba_at, DROP COLUMN ultima_prueba_estado;
  DELETE FROM public.permisos WHERE codigo = 'FACTURACION_ELECTRONICA.CONFIGURAR';
\else
  SELECT 'NEX-061 no está aplicada: nada que revertir.' AS aviso;
\endif
