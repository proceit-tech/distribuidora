-- T19 — NEX-057 (PRO-129, Etapa A): gestión de puntos de expedición (permiso PUNTOS, funciones SECURITY DEFINER, bitácora inmutable, numeración confirmada y monotónica), en PostgreSQL real descartable.
\i _helpers.sql

DO $t$
DECLARE
  v_h text := crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12));
  v_a uuid; v_b uuid; v_ua uuid; v_ub uuid; v_sa uuid; v_sb uuid; v_p uuid; v_p2 uuid; r record;
  v_payload jsonb := '{"iTiDE": 1, "Subtotales": [{"dTotGralOpe": 1000}]}'::jsonb;
BEGIN
  v_a := nex_inicializar_empresa('emp-t19a', 'Empresa T19 A SA (prueba)', '8019101', '1', 'admin.t19a', 'Ana', 'A', NULL, v_h);
  v_b := nex_inicializar_empresa('emp-t19b', 'Empresa T19 B SA (prueba)', '8019102', '1', 'admin.t19b', 'Beto', 'B', NULL, v_h);
  SELECT id INTO v_ua FROM usuarios WHERE empresa_id = v_a;
  SELECT id INTO v_ub FROM usuarios WHERE empresa_id = v_b;
  SELECT id INTO v_sa FROM sucursales WHERE empresa_id = v_a ORDER BY creado_at, id LIMIT 1;
  SELECT id INTO v_sb FROM sucursales WHERE empresa_id = v_b ORDER BY creado_at, id LIMIT 1;
  UPDATE sucursales SET establecimiento_sifen = '019' WHERE id IN (v_sa, v_sb);

  -- Permiso: existe, no está asignado a ningún perfil y solo el administrador de SU empresa lo tiene
  PERFORM pg_temp.ok((SELECT count(*) = 1 FROM permisos WHERE codigo = 'FACTURACION_ELECTRONICA.PUNTOS' AND recurso = 'FACTURACION_ELECTRONICA' AND accion = 'PUNTOS'), 'NEX-057: el permiso FACTURACION_ELECTRONICA.PUNTOS existe');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM perfil_permiso pp JOIN permisos pe ON pe.id = pp.permiso_id WHERE pe.codigo = 'FACTURACION_ELECTRONICA.PUNTOS'), 'NEX-057: el permiso no se asignó a ningún perfil');
  PERFORM pg_temp.ok(usuario_tiene_permiso(v_a, v_ua, 'FACTURACION_ELECTRONICA', 'PUNTOS') AND NOT usuario_tiene_permiso(v_a, v_ub, 'FACTURACION_ELECTRONICA', 'PUNTOS'), 'el administrador de la empresa lo tiene; el de otra empresa no');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM fe_puntos_expedicion WHERE empresa_id IN (v_a, v_b)), 'la migración no inserta ningún punto de expedición');

  -- Alta: exige permiso de SU empresa, confirmación, último número explícito, código y sucursal válidos
  PERFORM pg_temp.falla(format('SELECT fe_punto_crear(%L, %L, %L, %L, %L, 10, true)', v_a, v_ub, v_sa, '001', 'Caja 1'), '42501', 'alta: un usuario sin el permiso en esa empresa se rechaza (42501)');
  PERFORM pg_temp.falla(format('SELECT fe_punto_crear(%L, %L, %L, %L, %L, 10, false)', v_a, v_ua, v_sa, '001', 'Caja 1'), 'P0001', 'alta: sin confirmación expresa se rechaza');
  PERFORM pg_temp.falla(format('SELECT fe_punto_crear(%L, %L, %L, %L, %L, NULL, true)', v_a, v_ua, v_sa, '001', 'Caja 1'), 'P0001', 'alta: sin último número informado se rechaza (no hay valor por defecto)');
  PERFORM pg_temp.falla(format('SELECT fe_punto_crear(%L, %L, %L, %L, %L, -1, true)', v_a, v_ua, v_sa, '001', 'Caja 1'), 'P0001', 'alta: número negativo se rechaza');
  PERFORM pg_temp.falla(format('SELECT fe_punto_crear(%L, %L, %L, %L, %L, 9999999, true)', v_a, v_ua, v_sa, '001', 'Caja 1'), 'P0001', 'alta: un punto con numeración agotada no se crea');
  PERFORM pg_temp.falla(format('SELECT fe_punto_crear(%L, %L, %L, %L, %L, 0, true)', v_a, v_ua, v_sa, '000', 'Caja 1'), 'P0001', 'alta: código 000 se rechaza');
  PERFORM pg_temp.falla(format('SELECT fe_punto_crear(%L, %L, %L, %L, %L, 0, true)', v_a, v_ua, v_sa, '1', 'Caja 1'), 'P0001', 'alta: código de un dígito se rechaza');
  PERFORM pg_temp.falla(format('SELECT fe_punto_crear(%L, %L, %L, %L, %L, 0, true)', v_a, v_ua, v_sa, '001', '   '), 'P0001', 'alta: nombre vacío se rechaza');
  PERFORM pg_temp.falla(format('SELECT fe_punto_crear(%L, %L, %L, %L, %L, 0, true)', v_a, v_ua, v_sb, '001', 'Caja 1'), 'P0001', 'aislamiento: una sucursal de OTRA empresa se rechaza');
  UPDATE sucursales SET establecimiento_sifen = NULL WHERE id = v_sa;
  PERFORM pg_temp.falla(format('SELECT fe_punto_crear(%L, %L, %L, %L, %L, 0, true)', v_a, v_ua, v_sa, '001', 'Caja 1'), 'P0001', 'alta: una sucursal sin establecimiento SIFEN se rechaza');
  UPDATE sucursales SET establecimiento_sifen = '019' WHERE id = v_sa;

  v_p := fe_punto_crear(v_a, v_ua, v_sa, '001', ' Caja 1 ', 120, true);
  PERFORM pg_temp.ok((SELECT codigo = '001' AND nombre = 'Caja 1' AND ultimo_numero = 120 AND NOT activo AND sucursal_id = v_sa FROM fe_puntos_expedicion WHERE id = v_p), 'alta: el punto nace INACTIVO con el último número informado (120)');
  PERFORM pg_temp.falla(format('SELECT fe_punto_crear(%L, %L, %L, %L, %L, 0, true)', v_a, v_ua, v_sa, '001', 'Otra'), 'P0001', 'alta: el código duplicado en la sucursal se rechaza');
  PERFORM pg_temp.ok((SELECT count(*) = 1 AND bool_and(accion = 'CREAR' AND usuario_id = v_ua AND anterior IS NULL AND (nuevo->>'ultimo_numero')::int = 120 AND (nuevo->>'activo')::boolean = false) FROM fe_puntos_expedicion_log WHERE punto_id = v_p), 'bitácora: el alta conserva usuario y valores');

  -- Un punto inactivo NO numera
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_fe(%L, %L, %L, %L, 'clave-t19-0001', NULL, '1234567-1', 'Receptor T19', 'PYG', 1000, %L)$f$, v_a, v_ua, v_sa, v_p, v_payload::text), 'P0001', 'un punto inactivo no emite documentos (numeración intacta)');
  PERFORM pg_temp.ok((SELECT ultimo_numero = 120 FROM fe_puntos_expedicion WHERE id = v_p), 'el rechazo no consumió número');

  -- Activación: confirmación y número monotónico
  PERFORM pg_temp.falla(format('SELECT fe_punto_activar(%L, %L, %L, 120, false)', v_a, v_ua, v_p), 'P0001', 'activar: sin confirmación se rechaza');
  PERFORM pg_temp.falla(format('SELECT fe_punto_activar(%L, %L, %L, 119, true)', v_a, v_ua, v_p), 'P0001', 'activar: un número menor que el registrado se rechaza (no retrocede)');
  PERFORM pg_temp.falla(format('SELECT fe_punto_activar(%L, %L, %L, 120, true)', v_a, v_ub, v_p), '42501', 'activar: un usuario de otra empresa se rechaza');
  PERFORM pg_temp.falla(format('SELECT fe_punto_activar(%L, %L, %L, 120, true)', v_b, v_ub, v_p), 'P0001', 'aislamiento: la empresa B no ve el punto de la empresa A');
  PERFORM fe_punto_activar(v_a, v_ua, v_p, 125, true);
  PERFORM pg_temp.ok((SELECT activo AND ultimo_numero = 125 FROM fe_puntos_expedicion WHERE id = v_p), 'activar: confirma un número MAYOR (se emitió fuera de Nexit) y activa');
  PERFORM pg_temp.falla(format('SELECT fe_punto_activar(%L, %L, %L, 125, true)', v_a, v_ua, v_p), 'P0001', 'activar: un punto ya activo se rechaza');
  PERFORM pg_temp.ok((SELECT count(*) = 2 FROM fe_puntos_expedicion_log WHERE punto_id = v_p) AND (SELECT (anterior->>'ultimo_numero')::int = 120 AND (nuevo->>'ultimo_numero')::int = 125 FROM fe_puntos_expedicion_log WHERE punto_id = v_p AND accion = 'ACTIVAR'), 'bitácora: la activación conserva el número anterior y el nuevo');

  -- La emisión continúa desde el número confirmado (la única autoridad que incrementa es fe_documento_crear_fe)
  SELECT * INTO r FROM fe_documento_crear_fe(v_a, v_ua, v_sa, v_p, 'clave-t19-0002', NULL, '1234567-1', 'Receptor T19', 'PYG', 1000, v_payload);
  PERFORM pg_temp.ok(r.o_numero = '0000126' AND (SELECT ultimo_numero = 126 FROM fe_puntos_expedicion WHERE id = v_p), 'la primera factura toma 0000126 = último número confirmado (125) + 1');

  -- Un número menor que el ya emitido por Nexit se rechaza al dar de alta/reactivar
  PERFORM fe_punto_desactivar(v_a, v_ua, v_p);
  PERFORM pg_temp.ok((SELECT NOT activo AND ultimo_numero = 126 FROM fe_puntos_expedicion WHERE id = v_p), 'desactivar: el punto queda inactivo y la numeración se conserva');
  PERFORM pg_temp.falla(format('SELECT fe_punto_desactivar(%L, %L, %L)', v_a, v_ua, v_p), 'P0001', 'desactivar: un punto ya inactivo se rechaza');
  PERFORM pg_temp.falla(format('SELECT fe_punto_activar(%L, %L, %L, 125, true)', v_a, v_ua, v_p), 'P0001', 'reactivar: confirmar un número menor que el emitido se rechaza (126 ya emitido)');
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_fe(%L, %L, %L, %L, 'clave-t19-0003', NULL, '1234567-1', 'Receptor T19', 'PYG', 1000, %L)$f$, v_a, v_ua, v_sa, v_p, v_payload::text), 'P0001', 'un punto desactivado no emite');
  PERFORM fe_punto_activar(v_a, v_ua, v_p, 126, true);
  PERFORM pg_temp.ok((SELECT activo AND ultimo_numero = 126 FROM fe_puntos_expedicion WHERE id = v_p), 'reactivar: confirmando el número emitido (126)');

  -- Un punto nuevo con número menor al ya emitido por Nexit con el mismo establecimiento/código (otra sucursal del mismo establecimiento) se rechaza
  PERFORM pg_temp.falla(format('SELECT fe_punto_crear(%L, %L, %L, %L, %L, 100, true)', v_a, v_ua, v_sa, '001', 'Caja 1 bis'), 'P0001', 'alta duplicada: sigue rechazada');

  -- Protecciones heredadas de NEX-048 (identidad fija, la numeración no retrocede, sin borrado) y de la bitácora
  PERFORM pg_temp.falla(format('UPDATE fe_puntos_expedicion SET ultimo_numero = 10 WHERE id = %L', v_p), 'P0001', 'la numeración nunca retrocede (trigger de NEX-048)');
  PERFORM pg_temp.falla(format('UPDATE fe_puntos_expedicion SET codigo = %L WHERE id = %L', '002', v_p), 'P0001', 'el código es inmutable');
  PERFORM pg_temp.falla(format('DELETE FROM fe_puntos_expedicion WHERE id = %L', v_p), 'P0001', 'un punto no se elimina');
  PERFORM pg_temp.falla(format('UPDATE fe_puntos_expedicion_log SET nuevo = %L WHERE punto_id = %L', '{}', v_p), 'P0001', 'bitácora: no se modifica');
  PERFORM pg_temp.falla(format('DELETE FROM fe_puntos_expedicion_log WHERE punto_id = %L', v_p), 'P0001', 'bitácora: no se borra');
  PERFORM pg_temp.falla('TRUNCATE fe_puntos_expedicion_log', 'P0001', 'bitácora: no se vacía');
  PERFORM pg_temp.falla(format($f$INSERT INTO fe_puntos_expedicion_log (empresa_id, punto_id, usuario_id, accion, nuevo) VALUES (%L, %L, %L, 'CREAR', '{}')$f$, v_b, v_p, v_ub), '23503', 'aislamiento: la bitácora no admite el punto de otra empresa');

  -- Otro punto en la misma sucursal y otra empresa con el mismo código (independientes por empresa/sucursal)
  v_p2 := fe_punto_crear(v_a, v_ua, v_sa, '002', 'Caja 2', 0, true);
  PERFORM pg_temp.ok((SELECT ultimo_numero = 0 AND NOT activo FROM fe_puntos_expedicion WHERE id = v_p2), 'un punto sin emisiones previas se registra con 0 solo porque se informó y confirmó explícitamente');
  PERFORM fe_punto_crear(v_b, v_ub, v_sb, '001', 'Caja B', 7, true);
  PERFORM pg_temp.ok((SELECT count(*) = 1 FROM fe_puntos_expedicion WHERE empresa_id = v_b) AND (SELECT count(*) = 2 FROM fe_puntos_expedicion WHERE empresa_id = v_a), 'cada empresa ve y gestiona solo los suyos');

  -- Privilegios del runtime: sin escritura directa, solo ejecuta las funciones y lee la bitácora; PUBLIC no ejecuta
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') OR (
        NOT has_table_privilege('nexit_runtime', 'public.fe_puntos_expedicion', 'INSERT') AND NOT has_table_privilege('nexit_runtime', 'public.fe_puntos_expedicion', 'UPDATE')
        AND NOT has_table_privilege('nexit_runtime', 'public.fe_puntos_expedicion', 'DELETE')
        AND has_table_privilege('nexit_runtime', 'public.fe_puntos_expedicion_log', 'SELECT') AND NOT has_table_privilege('nexit_runtime', 'public.fe_puntos_expedicion_log', 'INSERT')
        AND NOT has_table_privilege('nexit_runtime', 'public.fe_puntos_expedicion_log', 'UPDATE') AND NOT has_table_privilege('nexit_runtime', 'public.fe_puntos_expedicion_log', 'DELETE')
        AND has_function_privilege('nexit_runtime', 'public.fe_punto_crear(uuid,uuid,uuid,text,text,integer,boolean)', 'EXECUTE')
        AND has_function_privilege('nexit_runtime', 'public.fe_punto_activar(uuid,uuid,uuid,integer,boolean)', 'EXECUTE')
        AND has_function_privilege('nexit_runtime', 'public.fe_punto_desactivar(uuid,uuid,uuid)', 'EXECUTE')),
     'privilegios: nexit_runtime no escribe los puntos directamente; ejecuta las funciones y lee la bitácora');
  PERFORM pg_temp.ok(NOT has_function_privilege('public', 'public.fe_punto_crear(uuid,uuid,uuid,text,text,integer,boolean)', 'EXECUTE'), 'PUBLIC no ejecuta fe_punto_crear');
  PERFORM pg_temp.ok((SELECT bool_and(prosecdef AND 'search_path=public, pg_temp' = ANY (proconfig)) FROM pg_proc WHERE proname IN ('fe_punto_crear', 'fe_punto_activar', 'fe_punto_desactivar')), 'las funciones son SECURITY DEFINER con search_path fijo');
  PERFORM pg_temp.ok(to_regprocedure('public.nex_aplicar_grants_facturacion_puntos()') IS NOT NULL, 'el ayudante de grants existe y el envoltorio de NEX-052 lo reaplica');
  RAISE NOTICE 'PASS: T19 completa';
END $t$;
