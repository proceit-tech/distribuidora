-- PRE-VERIFICACIÓN de NEX-069 (URL del gateway editable, PRO-207 / G01). SOLO LECTURA: no modifica nada. La ejecuta el responsable en la VM ANTES de aplicar la migración:
--   docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < preflight-NEX-069.sql
-- Cualquier fila con ok = false en la sección 1 significa NO APLICAR hasta conciliar. NEX-069 NO depende de NEX-066/067/068.
BEGIN READ ONLY;

\echo '== 1. Dependencias (todas deben dar ok = true) =='
SELECT 'NEX-061 aplicada (fe_gateway_config_guardar de 6 parámetros)' AS control, to_regprocedure('public.fe_gateway_config_guardar(uuid,uuid,text,text,text,integer)') IS NOT NULL AS ok
UNION ALL SELECT 'tabla fe_gateway_config con credenciales_version y ultima_prueba_estado', (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fe_gateway_config' AND column_name IN ('base_url', 'credenciales_version', 'ultima_prueba_at', 'ultima_prueba_estado')) = 4
UNION ALL SELECT 'fe_gateway_prueba_registrar condiciona por versión', to_regprocedure('public.fe_gateway_prueba_registrar(uuid,uuid,text,boolean,integer)') IS NOT NULL
UNION ALL SELECT 'ayudante de grants del gateway (NEX-061)', to_regprocedure('public.nex_aplicar_grants_facturacion_gateway()') IS NOT NULL
UNION ALL SELECT 'rol nexit_runtime existe', EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime')
UNION ALL SELECT 'NEX-069 ausente (no se reaplica)', to_regprocedure('public.fe_gateway_url_valida(text)') IS NULL;

\echo '== 2. Estado de migraciones registrado =='
SELECT version, nombre FROM public.schema_migrations WHERE version IN ('NEX-061', 'NEX-066', 'NEX-067', 'NEX-068', 'NEX-069') ORDER BY version;
SELECT count(*) AS total, max(version) AS ultima FROM public.schema_migrations;

\echo '== 3. Informativo: URL ya guardadas (sin secretos). Las que NO cumplan la regla nueva se conservan pero no podrán re-guardarse hasta corregirlas =='
SELECT empresa_id, base_url, credenciales_version, ultima_prueba_estado,
       base_url ~ '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,63}|xn--[a-z0-9-]{2,59})(:8443)?$' AS cumple_regla_nueva
  FROM public.fe_gateway_config ORDER BY empresa_id;

ROLLBACK;
