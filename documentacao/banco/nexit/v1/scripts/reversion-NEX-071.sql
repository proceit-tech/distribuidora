-- =====================================================================
-- REVERSIÓN de NEX-071 (observación original de la NCE). Ejecutar SOLO con autorización del responsable, con backup previo, en UNA transacción:
--   psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-071.sql
-- SEGURIDAD: se NIEGA a revertir si existe alguna fila en nce_observaciones_originales (es la única prueba de lo que escribió el operador en esas NCE). Antes, desplegar la versión de la aplicación anterior
-- a E1-R03 (que usa fe_documento_crear_nce directamente). fe_documento_crear_nce NO se toca. Después borrar la fila 'NEX-071' de schema_migrations.
-- =====================================================================
DO $$
BEGIN
  PERFORM set_config('lock_timeout', '60s', true);
  IF to_regclass('public.nce_observaciones_originales') IS NULL THEN
    RAISE EXCEPTION 'NEX-071 no está aplicada (nce_observaciones_originales no existe): nada que revertir.';
  END IF;
  LOCK TABLE public.nce_observaciones_originales IN EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM public.nce_observaciones_originales) THEN
    RAISE EXCEPTION 'REVERSIÓN ABORTADA: ya existen notas de crédito con observación original registrada.';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.nex_aplicar_grants_facturacion_nce_observacion();
DROP FUNCTION IF EXISTS public.fe_documento_crear_nce_obs(uuid, uuid, uuid, uuid, text, uuid, integer, jsonb, text, numeric, jsonb, text);
DROP TABLE public.nce_observaciones_originales;
