-- =====================================================================
-- REVERSIÓN de NEX-078 (empresas.fe_max_lineas, PRO-339-R01). Ejecutar SOLO con autorización del responsable, con backup previo, en UNA transacción:
--   psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-078.sql
-- ANTES desplegar una versión de la aplicación anterior a PRO-339-R01: la versión R01 falla cerrado sin la columna (rechaza toda FE nueva con 422).
-- Si alguna empresa ya tiene un máximo propio configurado, la reversión se DETIENE (para no perder una política vigente sin decisión expresa): volver esas empresas a NULL
-- es una operación administrativa separada y autorizada. Después borrar la fila 'NEX-078' de schema_migrations. Las FE emitidas no se tocan.
-- =====================================================================
DO $$
BEGIN
  PERFORM set_config('lock_timeout', '60s', true);
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'empresas' AND column_name = 'fe_max_lineas') THEN
    RAISE EXCEPTION 'NEX-078 no está aplicada (empresas.fe_max_lineas no existe): nada que revertir.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.empresas WHERE fe_max_lineas IS NOT NULL) THEN
    RAISE EXCEPTION 'Hay empresas con un máximo de líneas FE configurado: no se revierte sin decisión expresa del responsable.';
  END IF;
END $$;

ALTER TABLE public.empresas DROP CONSTRAINT IF EXISTS empresas_fe_max_lineas_chk;
ALTER TABLE public.empresas DROP COLUMN fe_max_lineas;
