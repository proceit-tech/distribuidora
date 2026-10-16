-- T25 — NEX-061 (PRO-133 UI): configuración del gateway de facturación electrónica por empresa. Permiso CONFIGURAR (solo el administrador de SU empresa), aislamiento entre empresas, la clave NUNCA se devuelve,
-- el rol de la aplicación no tiene ningún privilegio sobre las credenciales, versión de credenciales, control de intentos y bitácora sin secretos. Base descartable; datos sintéticos.
\i _helpers.sql

DO $t$
DECLARE
  v_h text := crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12));
  v_a uuid; v_b uuid; v_ua uuid; v_ub uuid; v_n int; v_r record;
  v_clave text := 'Cl4ve-sintetica-T25!$x';
  v_url text := 'https://gateway-bebidas-py.e-factura-hub.com';
BEGIN
  v_a := nex_inicializar_empresa('emp-t25a', 'CASA MINGO T25 SA (prueba)', '8025101', '1', 'admin.t25a', 'Ana', 'A', NULL, v_h);
  v_b := nex_inicializar_empresa('emp-t25b', 'Otra Empresa T25 SA (prueba)', '8025102', '1', 'admin.t25b', 'Beto', 'B', NULL, v_h);
  SELECT id INTO v_ua FROM usuarios WHERE empresa_id = v_a;
  SELECT id INTO v_ub FROM usuarios WHERE empresa_id = v_b;

  -- Permiso: existe, sin asignar a perfiles; solo el administrador de SU empresa lo tiene
  PERFORM pg_temp.ok((SELECT count(*) = 1 FROM permisos WHERE codigo = 'FACTURACION_ELECTRONICA.CONFIGURAR' AND clase = 'ADMINISTRATIVA'), 'NEX-061: el permiso FACTURACION_ELECTRONICA.CONFIGURAR existe (ADMINISTRATIVA)');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM perfil_permiso pp JOIN permisos pe ON pe.id = pp.permiso_id WHERE pe.codigo = 'FACTURACION_ELECTRONICA.CONFIGURAR'), 'el permiso no se asignó a ningún perfil');
  PERFORM pg_temp.ok(usuario_tiene_permiso(v_a, v_ua, 'FACTURACION_ELECTRONICA', 'CONFIGURAR') AND NOT usuario_tiene_permiso(v_a, v_ub, 'FACTURACION_ELECTRONICA', 'CONFIGURAR'), 'el administrador de la empresa lo tiene; el de otra empresa NO');

  -- Estructura y privilegios del rol de la aplicación
  PERFORM pg_temp.ok(to_regclass('public.fe_gateway_credenciales') IS NOT NULL AND to_regclass('public.fe_gateway_prueba_limite') IS NOT NULL AND to_regclass('public.fe_gateway_config_log') IS NOT NULL, 'existen las tablas de credenciales, límite y bitácora');
  PERFORM pg_temp.ok(NOT (has_table_privilege('nexit_runtime', 'public.fe_gateway_credenciales', 'SELECT') OR has_table_privilege('nexit_runtime', 'public.fe_gateway_credenciales', 'INSERT')
                          OR has_table_privilege('nexit_runtime', 'public.fe_gateway_credenciales', 'UPDATE') OR has_table_privilege('nexit_runtime', 'public.fe_gateway_credenciales', 'DELETE')), 'el rol de la aplicación NO tiene ningún privilegio sobre la tabla de credenciales');
  PERFORM pg_temp.ok(NOT (has_table_privilege('nexit_runtime', 'public.fe_gateway_prueba_limite', 'SELECT') OR has_table_privilege('nexit_runtime', 'public.fe_gateway_config_log', 'SELECT')), 'tampoco sobre el límite de intentos ni la bitácora');
  PERFORM pg_temp.ok(has_function_privilege('nexit_runtime', 'public.fe_gateway_config_ver(uuid,uuid)', 'EXECUTE') AND has_function_privilege('nexit_runtime', 'public.fe_gateway_config_guardar(uuid,uuid,text,text,text,integer)', 'EXECUTE')
                     AND has_function_privilege('nexit_runtime', 'public.fe_gateway_credenciales_leer(uuid,uuid)', 'EXECUTE') AND has_function_privilege('nexit_runtime', 'public.fe_gateway_prueba_iniciar(uuid,uuid)', 'EXECUTE'), 'la aplicación solo EJECUTA las funciones');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.fe_gateway_credenciales'::regclass AND tgname = 'fe_gateway_credenciales_actualizado_trg'), 'trigger de actualización de la tabla de credenciales (invariante T01)');

  -- Guardar: permiso, validaciones, aislamiento
  PERFORM pg_temp.falla(format($f$SELECT fe_gateway_config_guardar(%L, %L, %L, 'ruc', 'clave', 30000)$f$, v_a, v_ub, v_url), '42501', 'guardar: el administrador de OTRA empresa se rechaza (42501)');
  PERFORM pg_temp.falla(format($f$SELECT fe_gateway_config_guardar(%L, %L, 'http://malo', 'ruc', 'clave', 30000)$f$, v_a, v_ua), 'P0001', 'guardar: la URL debe ser https');
  PERFORM pg_temp.falla(format($f$SELECT fe_gateway_config_guardar(%L, %L, %L, '   ', 'clave', 30000)$f$, v_a, v_ua, v_url), 'P0001', 'guardar: usuario vacío se rechaza');
  PERFORM pg_temp.falla(format($f$SELECT fe_gateway_config_guardar(%L, %L, %L, 'ruc', NULL, 30000)$f$, v_a, v_ua, v_url), 'P0001', 'guardar: sin clave previa, la clave es obligatoria');
  PERFORM pg_temp.falla(format($f$SELECT fe_gateway_config_guardar(%L, %L, %L, 'ruc', 'clave', 5)$f$, v_a, v_ua, v_url), 'P0001', 'guardar: tiempo de espera fuera de rango');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM fe_gateway_config WHERE empresa_id = v_a) AND NOT EXISTS (SELECT 1 FROM fe_gateway_credenciales), 'los rechazos no crearon nada');

  PERFORM fe_gateway_config_guardar(v_a, v_ua, v_url, '80099999-9', v_clave, 30000);
  PERFORM pg_temp.ok((SELECT base_url = v_url AND activo AND credencial_ref = 'NEXIT_DB' AND credenciales_version = 1 AND ultima_prueba_estado IS NULL FROM fe_gateway_config WHERE empresa_id = v_a), 'guardar crea la configuración de la empresa (URL fija, activa, referencia NEXIT_DB, versión 1)');
  PERFORM pg_temp.ok((SELECT api_usuario = '80099999-9' AND api_password = v_clave FROM fe_gateway_credenciales WHERE empresa_id = v_a), 'las credenciales quedan en la base vinculadas a la empresa de la sesión');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM fe_gateway_credenciales WHERE empresa_id = v_b) AND NOT EXISTS (SELECT 1 FROM fe_gateway_config WHERE empresa_id = v_b), 'la empresa B no recibe nada');

  -- Ver: NUNCA devuelve la clave
  SELECT * INTO v_r FROM fe_gateway_config_ver(v_a, v_ua);
  PERFORM pg_temp.ok(v_r.o_api_usuario = '80099999-9' AND v_r.o_tiene_password AND v_r.o_base_url = v_url, 'ver: devuelve usuario, URL y «hay contraseña»');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_proc p, unnest(p.proargnames) AS n WHERE p.proname = 'fe_gateway_config_ver' AND n ~* 'pass|clave|secret' AND n <> 'o_tiene_password'), 'ver: ninguna columna de salida contiene la clave');
  PERFORM pg_temp.ok(to_jsonb(v_r)::text NOT LIKE '%' || v_clave || '%', 'ver: el resultado completo no contiene la clave');
  PERFORM pg_temp.falla(format('SELECT * FROM fe_gateway_config_ver(%L, %L)', v_a, v_ub), '42501', 'ver: otra empresa se rechaza');

  -- Editar: clave en blanco conserva; cambio sube versión y borra la prueba
  PERFORM fe_gateway_prueba_registrar(v_a, v_ua, 'OK', true);
  PERFORM pg_temp.ok((SELECT ultima_prueba_estado = 'OK' FROM fe_gateway_config WHERE empresa_id = v_a), 'una prueba con las credenciales guardadas actualiza el estado visible');
  PERFORM fe_gateway_config_guardar(v_a, v_ua, v_url, '80099999-9', NULL, 30000);
  PERFORM pg_temp.ok((SELECT api_password = v_clave FROM fe_gateway_credenciales WHERE empresa_id = v_a) AND (SELECT credenciales_version = 1 AND ultima_prueba_estado = 'OK' FROM fe_gateway_config WHERE empresa_id = v_a), 'clave en blanco: conserva la anterior; sin cambio no sube la versión ni borra la prueba');
  PERFORM fe_gateway_config_guardar(v_a, v_ua, v_url, '80099999-9', 'otra-clave-T25', 30000);
  PERFORM pg_temp.ok((SELECT api_password = 'otra-clave-T25' FROM fe_gateway_credenciales WHERE empresa_id = v_a) AND (SELECT credenciales_version = 2 AND ultima_prueba_estado IS NULL AND ultima_prueba_at IS NULL FROM fe_gateway_config WHERE empresa_id = v_a), 'cambiar la clave: nueva versión y se borra el resultado de la última prueba');

  -- Leer credenciales (emisión): pertenencia a la empresa
  PERFORM pg_temp.ok((SELECT o_api_password = 'otra-clave-T25' AND o_version = 2 FROM fe_gateway_credenciales_leer(v_a, v_ua)), 'la emisión lee las credenciales de SU empresa');
  PERFORM pg_temp.falla(format('SELECT * FROM fe_gateway_credenciales_leer(%L, %L)', v_a, v_ub), '42501', 'leer: un usuario de otra empresa se rechaza');
  PERFORM pg_temp.ok(fe_gateway_credenciales_existe(v_a) AND NOT fe_gateway_credenciales_existe(v_b), 'existe: solo la empresa configurada');

  -- Aislamiento: B guarda lo suyo sin tocar a A
  PERFORM fe_gateway_config_guardar(v_b, v_ub, v_url, 'ruc-b', 'clave-b', 30000);
  PERFORM pg_temp.ok((SELECT api_usuario = '80099999-9' AND api_password = 'otra-clave-T25' FROM fe_gateway_credenciales WHERE empresa_id = v_a) AND (SELECT api_usuario = 'ruc-b' FROM fe_gateway_credenciales WHERE empresa_id = v_b), 'cada empresa conserva SUS credenciales');

  -- Control de abuso: 3 s entre intentos y 5 por ventana de 5 minutos
  PERFORM pg_temp.ok(fe_gateway_prueba_iniciar(v_a, v_ua) = 0, 'primer intento permitido');
  PERFORM pg_temp.ok(fe_gateway_prueba_iniciar(v_a, v_ua) > 0, 'segundo intento inmediato: debe esperar');
  FOR v_n IN 2..5 LOOP
    UPDATE fe_gateway_prueba_limite SET ultimo_at = now() - interval '10 seconds' WHERE empresa_id = v_a;
    PERFORM pg_temp.ok(fe_gateway_prueba_iniciar(v_a, v_ua) = 0, format('intento %s permitido', v_n));
  END LOOP;
  UPDATE fe_gateway_prueba_limite SET ultimo_at = now() - interval '10 seconds' WHERE empresa_id = v_a;
  PERFORM pg_temp.ok(fe_gateway_prueba_iniciar(v_a, v_ua) > 0, 'el sexto intento dentro de la ventana se rechaza');
  UPDATE fe_gateway_prueba_limite SET ventana_inicio = now() - interval '6 minutes', ultimo_at = now() - interval '6 minutes' WHERE empresa_id = v_a;
  PERFORM pg_temp.ok(fe_gateway_prueba_iniciar(v_a, v_ua) = 0, 'pasada la ventana se permite de nuevo');
  PERFORM pg_temp.ok(fe_gateway_prueba_iniciar(v_b, v_ub) = 0, 'el límite es por empresa: B no se ve afectada');
  PERFORM pg_temp.falla(format('SELECT fe_gateway_prueba_iniciar(%L, %L)', v_a, v_ub), '42501', 'iniciar prueba: otra empresa se rechaza');

  -- Resultado de la prueba
  PERFORM pg_temp.falla(format($f$SELECT fe_gateway_prueba_registrar(%L, %L, 'INVENTADO', true)$f$, v_a, v_ua), 'P0001', 'registrar: estado inválido');
  PERFORM fe_gateway_prueba_registrar(v_a, v_ua, 'CREDENCIALES_INVALIDAS', false);
  PERFORM pg_temp.ok((SELECT ultima_prueba_estado IS NULL FROM fe_gateway_config WHERE empresa_id = v_a), 'una prueba con credenciales NO guardadas no cambia el estado visible');

  -- Bitácora: solo altas y sin secretos
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM fe_gateway_config_log WHERE detalle::text LIKE '%' || v_clave || '%' OR detalle::text LIKE '%otra-clave-T25%' OR detalle::text LIKE '%clave-b%'), 'la bitácora no contiene claves');
  PERFORM pg_temp.ok((SELECT count(*) >= 5 FROM fe_gateway_config_log WHERE empresa_id = v_a), 'la bitácora registra guardar y probar');
  PERFORM pg_temp.falla(format($f$UPDATE fe_gateway_config_log SET accion = 'PROBAR' WHERE empresa_id = %L$f$, v_a), 'P0001', 'la bitácora es de solo altas');

  RAISE NOTICE 'PASS: T25 completa';
END $t$;
