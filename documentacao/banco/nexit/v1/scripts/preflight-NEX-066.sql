-- PRE-VERIFICACIÓN de NEX-066 (recuperación durable de la intención de registro de movimientos). SOLO LECTURA: no modifica nada. La ejecuta el responsable en la VM ANTES de aplicar la migración:
--   docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < preflight-NEX-066.sql
-- Cualquier fila con ok = false significa NO APLICAR hasta conciliar.
BEGIN READ ONLY;

\echo '== 1. Dependencias (todas deben dar ok = true) =='
SELECT 'NEX-014 aplicada (motor inventario_registrar_movimiento)' AS control, to_regprocedure('public.inventario_registrar_movimiento(uuid,uuid,text,text,date,uuid,uuid,jsonb,text,uuid,text,text,text)') IS NOT NULL AS ok
UNION ALL SELECT 'usuario_tiene_permiso disponible', to_regprocedure('public.usuario_tiene_permiso(uuid,uuid,text,text)') IS NOT NULL
UNION ALL SELECT 'envoltorio de grants (NEX-037/052)', to_regprocedure('public.nex_aplicar_grants_runtime_base()') IS NOT NULL
UNION ALL SELECT 'movimientos_inventario con clave_idempotencia', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'movimientos_inventario' AND column_name = 'clave_idempotencia')
UNION ALL SELECT 'índice único (empresa, clave_idempotencia) de NEX-014', to_regclass('public.movimientos_inventario_idem_key') IS NOT NULL
UNION ALL SELECT 'rol nexit_runtime existe', EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime')
UNION ALL SELECT 'gen_random_uuid() disponible', to_regprocedure('gen_random_uuid()') IS NOT NULL
UNION ALL SELECT 'NEX-066 ausente (no se reaplica)', to_regclass('public.movimientos_intenciones') IS NULL;

\echo '== 2. Estado de migraciones registrado =='
SELECT version, nombre FROM public.schema_migrations WHERE version IN ('NEX-014', 'NEX-052', 'NEX-066') ORDER BY version;

\echo '== 3. Informativo: movimientos con clave de idempotencia (la migración no los toca) =='
SELECT count(*) AS movimientos_con_clave FROM public.movimientos_inventario WHERE clave_idempotencia IS NOT NULL;

ROLLBACK;
