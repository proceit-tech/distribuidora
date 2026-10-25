-- PRE-VERIFICACIÓN de NEX-071 (observación original de la NCE, E1-R03). SOLO LECTURA: no modifica nada. La ejecuta el responsable en la VM ANTES de aplicar la migración:
--   docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < preflight-NEX-071.sql
-- Cualquier fila con ok = false en la sección 1 significa NO APLICAR hasta conciliar.
BEGIN READ ONLY;

\echo '== 1. Dependencias (todas deben dar ok = true) =='
SELECT 'NEX-070 aplicada (nce_descuentos)' AS control, to_regclass('public.nce_descuentos') IS NOT NULL AS ok
UNION ALL SELECT 'fe_documento_crear_nce de 11 parámetros', to_regprocedure('public.fe_documento_crear_nce(uuid,uuid,uuid,uuid,text,uuid,integer,jsonb,text,numeric,jsonb)') IS NOT NULL
UNION ALL SELECT 'nce_origen existe', to_regclass('public.nce_origen') IS NOT NULL
UNION ALL SELECT 'disparador de solo altas (nce_solo_altas)', to_regprocedure('public.nce_solo_altas()') IS NOT NULL
UNION ALL SELECT 'rol nexit_runtime existe', EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime')
UNION ALL SELECT 'NEX-071 ausente (no se reaplica)', to_regclass('public.nce_observaciones_originales') IS NULL AND to_regprocedure('public.fe_documento_crear_nce_obs(uuid,uuid,uuid,uuid,text,uuid,integer,jsonb,text,numeric,jsonb,text)') IS NULL;

\echo '== 2. Estado de migraciones registrado =='
SELECT version, nombre FROM public.schema_migrations WHERE version IN ('NEX-062', 'NEX-070', 'NEX-071') ORDER BY version;

\echo '== 3. Informativo: NCE existentes (ninguna se modifica; las anteriores quedan SIN observación original registrada) =='
SELECT count(*) AS nce_existentes FROM public.nce_origen;

ROLLBACK;
