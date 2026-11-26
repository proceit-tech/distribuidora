-- =====================================================================
-- REVERSIÓN de NEX-077 (lease con token de la consulta automática y registro automático con cdc_informado). Ejecutar SOLO con autorización del responsable, con backup previo, en UNA transacción:
--   psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-077.sql
-- Antes, detener la aplicación o desplegar una versión que no use fe_consulta_reservar_token / fe_consulta_programar_token / fe_documento_registrar_consulta_auto (sin ellas el worker
-- de PRO-338-R02 no consulta: se desactiva solo y lo informa en el log). Los intentos ya registrados (con cdc_informado) NO se tocan: son evidencia. Después borrar la fila 'NEX-077' de schema_migrations.
-- =====================================================================
DO $$
BEGIN
  PERFORM set_config('lock_timeout', '60s', true);
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documentos_electronicos' AND column_name = 'consulta_lease_token') THEN
    RAISE EXCEPTION 'NEX-077 no está aplicada (consulta_lease_token no existe): nada que revertir.';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.nex_aplicar_grants_facturacion_consulta_lease();
DROP FUNCTION IF EXISTS public.fe_documento_registrar_consulta_auto(uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb, uuid);
DROP FUNCTION IF EXISTS public.fe_consulta_programar_token(uuid, uuid, timestamptz, boolean, uuid);
DROP FUNCTION IF EXISTS public.fe_consulta_reservar_token(integer, integer, text[]);
-- Las reservas vigentes se liberan (el lease de NEX-062 vuelve a ser el único control).
UPDATE public.documentos_electronicos SET consulta_lease_hasta = NULL WHERE consulta_lease_token IS NOT NULL;
ALTER TABLE public.documentos_electronicos DROP COLUMN consulta_lease_token;
