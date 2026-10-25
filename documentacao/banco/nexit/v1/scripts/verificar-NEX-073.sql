-- VERIFICACIÓN de NEX-073 tras aplicarla. SOLO LECTURA (no crea documentos). Todo debe dar ok = true.
--   docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < verificar-NEX-073.sql
BEGIN READ ONLY;
SELECT 'marcador fe_emision_fecha_soportada()' AS control, to_regprocedure('public.fe_emision_fecha_soportada()') IS NOT NULL AS ok
UNION ALL SELECT 'fe_documento_crear_fe sigue con 11 parámetros', to_regprocedure('public.fe_documento_crear_fe(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb)') IS NOT NULL
UNION ALL SELECT 'la función conoce dFecEmiSol', position('dFecEmiSol' IN pg_get_functiondef(to_regprocedure('public.fe_documento_crear_fe(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb)'))) > 0
UNION ALL SELECT 'la aplicación NO ejecuta directamente fe_documento_crear_fe (NEX-067)', NOT has_function_privilege('nexit_runtime', 'public.fe_documento_crear_fe(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb)', 'EXECUTE');
ROLLBACK;
