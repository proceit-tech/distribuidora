-- PRE-VERIFICACIÓN de NEX-078 (empresas.fe_max_lineas, PRO-339-R01). SOLO LECTURA. La ejecuta el responsable en la VM ANTES de aplicar la migración:
--   docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < preflight-NEX-078.sql
-- Cualquier fila con ok = false en la sección 1 significa NO APLICAR hasta conciliar. No escribe nada (transacción READ ONLY + ROLLBACK).
BEGIN READ ONLY;

\echo '== 1. Dependencias y estado (todas deben dar ok = true) =='
SELECT 'tabla empresas (NEX-002)' AS control, to_regclass('public.empresas') IS NOT NULL AS ok
UNION ALL SELECT 'NEX-078 ausente: empresas.fe_max_lineas no existe (no se reaplica)', NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'empresas' AND column_name = 'fe_max_lineas')
UNION ALL SELECT 'restricción empresas_fe_max_lineas_chk ausente', NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empresas_fe_max_lineas_chk')
UNION ALL SELECT 'la aplicación (nexit_runtime) ya lee empresas', NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') OR has_table_privilege('nexit_runtime', 'public.empresas', 'SELECT');

\echo '== 2. Empresas registradas (solo lectura; NEX-078 NO cambia ninguna) =='
SELECT count(*) AS empresas FROM public.empresas;

\echo '== 3. Estado de migraciones registrado =='
SELECT version, nombre FROM public.schema_migrations WHERE version IN ('NEX-076', 'NEX-077', 'NEX-078') ORDER BY version;

ROLLBACK;
