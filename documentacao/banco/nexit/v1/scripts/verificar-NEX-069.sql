-- VERIFICACIÓN POSTERIOR de NEX-069. SOLO LECTURA. Cada fila debe dar ok = true. La ejecuta el responsable en la VM INMEDIATAMENTE después de aplicar la migración:
--   docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < verificar-NEX-069.sql
BEGIN READ ONLY;
SELECT 'fe_gateway_url_valida existe' AS control, to_regprocedure('public.fe_gateway_url_valida(text)') IS NOT NULL AS ok
UNION ALL SELECT 'acepta https://dominio y :8443', public.fe_gateway_url_valida('https://gateway.e-factura-hub.com') AND public.fe_gateway_url_valida('https://api.proveedor.com.py:8443')
UNION ALL SELECT 'rechaza http, IP, localhost, internos, ruta, credenciales, puertos no permitidos, mayúsculas',
  NOT (public.fe_gateway_url_valida('http://gateway.e-factura-hub.com') OR public.fe_gateway_url_valida('https://127.0.0.1') OR public.fe_gateway_url_valida('https://10.0.0.5:8443')
    OR public.fe_gateway_url_valida('https://localhost') OR public.fe_gateway_url_valida('https://app.localhost') OR public.fe_gateway_url_valida('https://db.internal')
    OR public.fe_gateway_url_valida('https://gateway.e-factura-hub.com/api') OR public.fe_gateway_url_valida('https://u:p@gateway.e-factura-hub.com')
    OR public.fe_gateway_url_valida('https://gateway.e-factura-hub.com:8080') OR public.fe_gateway_url_valida('https://GATEWAY.e-factura-hub.com')
    OR public.fe_gateway_url_valida('https://2130706433') OR public.fe_gateway_url_valida('https://[::1]') OR public.fe_gateway_url_valida('https://sinpunto'))
UNION ALL SELECT 'fe_gateway_config_guardar sigue SECURITY DEFINER con search_path fijo y 6 parámetros', EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = 'public.fe_gateway_config_guardar(uuid,uuid,text,text,text,integer)'::regprocedure AND p.prosecdef AND p.proconfig::text LIKE '%search_path%')
UNION ALL SELECT 'el rol de la aplicación ejecuta guardar y NO tiene acceso a credenciales', has_function_privilege('nexit_runtime', 'public.fe_gateway_config_guardar(uuid,uuid,text,text,text,integer)', 'EXECUTE') AND NOT has_table_privilege('nexit_runtime', 'public.fe_gateway_credenciales', 'SELECT')
UNION ALL SELECT 'guardar ya contiene el cambio de URL como cambio de versión', (SELECT prosrc FROM pg_proc WHERE oid = 'public.fe_gateway_config_guardar(uuid,uuid,text,text,text,integer)'::regprocedure) LIKE '%v_url_prev IS DISTINCT FROM p_base_url%';
ROLLBACK;
