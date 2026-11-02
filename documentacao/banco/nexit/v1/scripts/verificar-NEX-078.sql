-- VERIFICACIÓN POSTERIOR de NEX-078 (empresas.fe_max_lineas, PRO-339-R01). SOLO LECTURA. Cada fila debe dar ok = true. La ejecuta el responsable en la VM INMEDIATAMENTE después de aplicar la migración:
--   docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < verificar-NEX-078.sql
BEGIN READ ONLY;
SELECT 'empresas.fe_max_lineas existe, integer y admite NULL' AS control,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'empresas' AND column_name = 'fe_max_lineas' AND data_type = 'integer' AND is_nullable = 'YES') AS ok
UNION ALL SELECT 'sin DEFAULT (NULL = 999)', (SELECT column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'empresas' AND column_name = 'fe_max_lineas') IS NULL
UNION ALL SELECT 'CHECK NULL o 1..999', EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.empresas'::regclass AND conname = 'empresas_fe_max_lineas_chk' AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%fe_max_lineas IS NULL%' AND pg_get_constraintdef(oid) LIKE '%>= 1%' AND pg_get_constraintdef(oid) LIKE '%<= 999%')
UNION ALL SELECT 'al aplicar, NINGUNA empresa tiene un máximo propio (todas NULL = 999)', NOT EXISTS (SELECT 1 FROM public.empresas WHERE fe_max_lineas IS NOT NULL)
UNION ALL SELECT 'la aplicación (nexit_runtime) lee la columna', NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') OR has_column_privilege('nexit_runtime', 'public.empresas', 'fe_max_lineas', 'SELECT');
ROLLBACK;
