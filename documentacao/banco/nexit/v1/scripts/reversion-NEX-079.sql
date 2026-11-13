-- =====================================================================
-- REVERSIÓN de NEX-079 (conexión por intento y CDC informado en la consulta manual / flujo NCE). Ejecutar SOLO con autorización del responsable, con backup previo, en UNA transacción:
--   psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-079.sql
-- Antes, desplegar una versión que no use las sobrecargas con p_conexion (la versión PRO-342-R01 vuelve sola a las firmas anteriores si no existen: 42883).
-- La columna conexion es EVIDENCIA (solo altas): si ya hay intentos con conexión registrada, la reversión ABORTA y no borra nada. Las funciones existentes (NEX-050/054/062/077) no se tocan.
-- Después borrar la fila 'NEX-079' de schema_migrations.
-- =====================================================================
DO $$
BEGIN
  PERFORM set_config('lock_timeout', '60s', true);
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documento_electronico_intentos' AND column_name = 'conexion') THEN
    RAISE EXCEPTION 'NEX-079 no está aplicada (documento_electronico_intentos.conexion no existe): nada que revertir.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.documento_electronico_intentos WHERE conexion IS NOT NULL) THEN
    RAISE EXCEPTION 'Hay intentos con conexión registrada (evidencia): la reversión no borra evidencia. Mantener NEX-079.';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.nex_aplicar_grants_facturacion_intentos_conexion();
DROP FUNCTION IF EXISTS public.fe_documento_registrar_envio(uuid, uuid, uuid, text, text, text, text, integer, text, text, text, text, text, text, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.fe_documento_registrar_consulta_auto(uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb, uuid, jsonb);
DROP FUNCTION IF EXISTS public.fe_documento_registrar_consulta_flujo_nce(uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.fe_documento_registrar_consulta(uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.fe_documento_registrar_consulta_nucleo(text, uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb, uuid, jsonb);
DROP FUNCTION IF EXISTS public.fe_intento_conexion_segura(jsonb);
ALTER TABLE public.documento_electronico_intentos DROP COLUMN conexion;
