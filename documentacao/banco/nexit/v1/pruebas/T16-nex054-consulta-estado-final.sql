-- T16 — NEX-054 (FAT-E2-R01-02): fe_documento_registrar_consulta protege las transiciones del estado SIFEN FINAL en PostgreSQL real.
-- Secuencial (una sola sesión); la carrera con dos sesiones está en T17-concurrencia-consulta.sh. Los documentos de prueba son sintéticos (RUC/CDC ficticios) y la base es descartable.
\i _helpers.sql

CREATE OR REPLACE FUNCTION pg_temp.cdc(p_num text, p_seg text DEFAULT '123456789') RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT '01' || '80000005' || '6' || '001' || '002' || p_num || '1' || '20261014' || '1' || p_seg || '0'
$$;
CREATE OR REPLACE FUNCTION pg_temp.doc(p_emp uuid, p_usr uuid, p_suc uuid, p_num text, p_sifen text, p_cdc text) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO documentos_electronicos (empresa_id, sucursal_id, tipo, establecimiento, punto_expedicion, numero, cdc, fecha_emision, receptor_nombre, moneda, total, estado_local, estado_sifen, creado_por)
  VALUES (p_emp, p_suc, 'FE', '001', '002', p_num, p_cdc, now(), 'Receptor sintético T16', 'PYG', 1000, CASE WHEN p_sifen = 'SIN_CONSULTA' THEN 'PENDIENTE_ENVIO' ELSE 'ENVIADO' END, p_sifen, p_usr)
  RETURNING id
$$;
CREATE OR REPLACE FUNCTION pg_temp.reg(p_emp uuid, p_usr uuid, p_doc uuid, p_res text, p_gw text, p_sifen text, p_cdc text) RETURNS text LANGUAGE sql AS $$
  SELECT public.fe_documento_registrar_consulta(p_emp, p_usr, p_doc, p_res, CASE WHEN p_res = 'OK' THEN 200 ELSE 400 END, 'req-t16', p_gw, p_sifen, p_cdc, '0260',
                                                'msg ' || coalesce(p_sifen, '-'), '2026-10-14 10:00:00', '2026-10-14 10:00:05', '{"t":"t16"}'::jsonb)
$$;
CREATE OR REPLACE FUNCTION pg_temp.estado(p_doc uuid) RETURNS text LANGUAGE sql AS $$
  SELECT estado_sifen || '/' || estado_local || '/' || coalesce(cdc, '-') || '/' || coalesce(ultima_consulta_resultado, '-') FROM documentos_electronicos WHERE id = p_doc
$$;
CREATE OR REPLACE FUNCTION pg_temp.hist(p_doc uuid) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(resultado || ':' || coalesce(estado_sifen, '-'), ',' ORDER BY ctid), '') FROM documento_electronico_intentos WHERE documento_id = p_doc AND tipo = 'CONSULTA'
$$;

DO $t$
DECLARE
  v_h text := crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12));
  v_a uuid; v_b uuid; v_ua uuid; v_ub uuid; v_s1 uuid; v_s2 uuid;
  d uuid; d2 uuid; r text; f record;
  v_sig text := 'public.fe_documento_registrar_consulta(uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,text,jsonb)';
BEGIN
  v_a := nex_inicializar_empresa('emp-t16a', 'Empresa T16 A SA (prueba)', '8016101', '1', 'admin.t16a', 'Ana', 'A', NULL, v_h);
  v_b := nex_inicializar_empresa('emp-t16b', 'Empresa T16 B SA (prueba)', '8016102', '1', 'admin.t16b', 'Beto', 'B', NULL, v_h);
  SELECT id INTO v_ua FROM usuarios WHERE empresa_id = v_a;
  SELECT id INTO v_ub FROM usuarios WHERE empresa_id = v_b;
  SELECT id INTO v_s1 FROM sucursales WHERE empresa_id = v_a ORDER BY creado_at, id LIMIT 1;
  INSERT INTO sucursales (empresa_id, codigo, nombre, establecimiento_sifen) VALUES (v_a, 'S2-T16', 'Sucursal 2 T16', '002') RETURNING id INTO v_s2;

  -- 0) La función conserva firma, SECURITY DEFINER, search_path y ACL (EXECUTE solo para nexit_runtime, nunca PUBLIC) y es la versión protegida
  SELECT p.oid, p.prosecdef, p.proconfig, p.prosrc, p.proacl, pg_get_function_identity_arguments(p.oid) AS args INTO f FROM pg_proc p WHERE p.oid = to_regprocedure(v_sig);
  PERFORM pg_temp.ok(f.oid IS NOT NULL, 'NEX-054: la función conserva la firma de NEX-047 (14 parámetros)');
  PERFORM pg_temp.ok(f.prosecdef AND f.proconfig::text ~ 'search_path=public, pg_temp', 'NEX-054: sigue siendo SECURITY DEFINER con search_path fijo');
  PERFORM pg_temp.ok(position('NEX-054' IN f.prosrc) > 0 AND position('no se modifica el estado fiscal' IN f.prosrc) > 0, 'NEX-054: el cuerpo instalado es la versión con la guarda de estado final');
  PERFORM pg_temp.ok(has_function_privilege('nexit_runtime', f.oid, 'EXECUTE') AND NOT EXISTS (SELECT 1 FROM aclexplode(f.proacl) a WHERE a.grantee = 0),
                     'NEX-054: nexit_runtime puede ejecutarla y PUBLIC no (ACL conservada tras CREATE OR REPLACE)');

  -- 1) PENDIENTE → APROBADO con CDC coherente
  d := pg_temp.doc(v_a, v_ua, v_s1, '0160001', 'SIN_CONSULTA', NULL);
  r := pg_temp.reg(v_a, v_ua, d, 'OK', 'Pendiente', 'PENDIENTE', NULL);
  PERFORM pg_temp.ok(r = 'OK' AND pg_temp.estado(d) = 'PENDIENTE/ENVIADO/-/OK', 'SIN_CONSULTA → PENDIENTE: se acepta y el documento queda ENVIADO (el gateway lo conoce)');
  r := pg_temp.reg(v_a, v_ua, d, 'OK', 'Pendiente', 'PENDIENTE', NULL);
  PERFORM pg_temp.ok(r = 'OK', 'PENDIENTE → PENDIENTE: se acepta (no es un estado final)');
  r := pg_temp.reg(v_a, v_ua, d, 'OK', 'Aprobado', 'APROBADO', pg_temp.cdc('0160001'));
  PERFORM pg_temp.ok(r = 'OK' AND pg_temp.estado(d) = 'APROBADO/ENVIADO/' || pg_temp.cdc('0160001') || '/OK', 'PENDIENTE → APROBADO con CDC coherente: estado final y CDC guardados');

  -- 2) APROBADO no regresa a PENDIENTE ni cambia a RECHAZADO / NO_RECONOCIDO; la contradicción queda como evidencia
  SELECT mensaje_respuesta, fecha_firma_gateway, cod_respuesta INTO f FROM documentos_electronicos WHERE id = d;
  r := pg_temp.reg(v_a, v_ua, d, 'OK', 'Pendiente', 'PENDIENTE', NULL);
  PERFORM pg_temp.ok(r = 'RESPUESTA_INVALIDA' AND pg_temp.estado(d) = 'APROBADO/ENVIADO/' || pg_temp.cdc('0160001') || '/RESPUESTA_INVALIDA', 'APROBADO → PENDIENTE: bloqueado; el estado y el CDC no cambian');
  r := pg_temp.reg(v_a, v_ua, d, 'OK', 'Rechazado', 'RECHAZADO', pg_temp.cdc('0160001'));
  PERFORM pg_temp.ok(r = 'RESPUESTA_INVALIDA' AND pg_temp.estado(d) LIKE 'APROBADO/ENVIADO/%', 'APROBADO → RECHAZADO: bloqueado');
  r := pg_temp.reg(v_a, v_ua, d, 'OK', 'Estado raro', 'NO_RECONOCIDO', NULL);
  PERFORM pg_temp.ok(r = 'RESPUESTA_INVALIDA' AND pg_temp.estado(d) LIKE 'APROBADO/ENVIADO/%', 'APROBADO → NO_RECONOCIDO: bloqueado (un texto desconocido no degrada un estado final)');
  PERFORM pg_temp.ok(pg_temp.hist(d) = 'OK:PENDIENTE,OK:PENDIENTE,OK:APROBADO,RESPUESTA_INVALIDA:-,RESPUESTA_INVALIDA:-,RESPUESTA_INVALIDA:-', 'las consultas contradictorias se conservan en el historial (RESPUESTA_INVALIDA sin estado SIFEN), nada se pierde');
  PERFORM pg_temp.ok((SELECT mensaje_respuesta IS NOT DISTINCT FROM f.mensaje_respuesta AND fecha_firma_gateway IS NOT DISTINCT FROM f.fecha_firma_gateway AND cod_respuesta IS NOT DISTINCT FROM f.cod_respuesta FROM documentos_electronicos WHERE id = d),
                     'la consulta contradictoria no toca mensaje, fechas ni código del documento');
  PERFORM pg_temp.ok((SELECT estado_gateway FROM documento_electronico_intentos WHERE documento_id = d AND resultado = 'RESPUESTA_INVALIDA' ORDER BY ctid LIMIT 1) = 'Pendiente'
                     AND (SELECT mensaje FROM documento_electronico_intentos WHERE documento_id = d AND resultado = 'RESPUESTA_INVALIDA' ORDER BY ctid LIMIT 1) LIKE '%ya figura como «APROBADO»%',
                     'el intento contradictorio guarda el estado informado por el gateway y el motivo');

  -- 3) El mismo estado se repite sin problema; APROBADO → CANCELADO es la única evolución legítima; CANCELADO es final
  r := pg_temp.reg(v_a, v_ua, d, 'OK', 'Aprobado', 'APROBADO', pg_temp.cdc('0160001'));
  PERFORM pg_temp.ok(r = 'OK', 'APROBADO → APROBADO: se acepta');
  r := pg_temp.reg(v_a, v_ua, d, 'OK', 'Cancelado', 'CANCELADO', pg_temp.cdc('0160001'));
  PERFORM pg_temp.ok(r = 'OK' AND pg_temp.estado(d) LIKE 'CANCELADO/ENVIADO/%', 'APROBADO → CANCELADO: se acepta');
  r := pg_temp.reg(v_a, v_ua, d, 'OK', 'Aprobado', 'APROBADO', pg_temp.cdc('0160001'));
  PERFORM pg_temp.ok(r = 'RESPUESTA_INVALIDA' AND pg_temp.estado(d) LIKE 'CANCELADO/ENVIADO/%', 'CANCELADO → APROBADO: bloqueado');
  r := pg_temp.reg(v_a, v_ua, d, 'OK', 'Cancelado', 'CANCELADO', pg_temp.cdc('0160001'));
  PERFORM pg_temp.ok(r = 'OK', 'CANCELADO → CANCELADO: se acepta');

  -- 4) RECHAZADO e INUTILIZADO son terminales; NO_RECONOCIDO y PENDIENTE no son finales (pueden evolucionar)
  d := pg_temp.doc(v_a, v_ua, v_s1, '0160002', 'RECHAZADO', pg_temp.cdc('0160002'));
  PERFORM pg_temp.ok(pg_temp.reg(v_a, v_ua, d, 'OK', 'Aprobado', 'APROBADO', pg_temp.cdc('0160002')) = 'RESPUESTA_INVALIDA' AND pg_temp.reg(v_a, v_ua, d, 'OK', 'Cancelado', 'CANCELADO', pg_temp.cdc('0160002')) = 'RESPUESTA_INVALIDA'
                     AND pg_temp.reg(v_a, v_ua, d, 'OK', 'Pendiente', 'PENDIENTE', NULL) = 'RESPUESTA_INVALIDA' AND pg_temp.reg(v_a, v_ua, d, 'OK', 'Rechazado', 'RECHAZADO', pg_temp.cdc('0160002')) = 'OK'
                     AND pg_temp.estado(d) LIKE 'RECHAZADO/ENVIADO/%', 'RECHAZADO: solo repite RECHAZADO; APROBADO, CANCELADO y PENDIENTE se bloquean');
  d := pg_temp.doc(v_a, v_ua, v_s1, '0160003', 'INUTILIZADO', pg_temp.cdc('0160003'));
  PERFORM pg_temp.ok(pg_temp.reg(v_a, v_ua, d, 'OK', 'Aprobado', 'APROBADO', pg_temp.cdc('0160003')) = 'RESPUESTA_INVALIDA' AND pg_temp.reg(v_a, v_ua, d, 'OK', 'Inutilizado', 'INUTILIZADO', pg_temp.cdc('0160003')) = 'OK'
                     AND pg_temp.estado(d) LIKE 'INUTILIZADO/ENVIADO/%', 'INUTILIZADO: solo repite INUTILIZADO');
  d := pg_temp.doc(v_a, v_ua, v_s1, '0160004', 'NO_RECONOCIDO', NULL);
  PERFORM pg_temp.ok(pg_temp.reg(v_a, v_ua, d, 'OK', 'Aprobado', 'APROBADO', pg_temp.cdc('0160004')) = 'OK' AND pg_temp.estado(d) LIKE 'APROBADO/ENVIADO/%', 'NO_RECONOCIDO → APROBADO: se acepta (no era un estado final)');
  d := pg_temp.doc(v_a, v_ua, v_s1, '0160005', 'PENDIENTE', NULL);
  PERFORM pg_temp.ok(pg_temp.reg(v_a, v_ua, d, 'OK', 'Rechazado', 'RECHAZADO', pg_temp.cdc('0160005')) = 'OK' AND pg_temp.estado(d) LIKE 'RECHAZADO/ENVIADO/%', 'PENDIENTE → RECHAZADO: se acepta');

  -- 5) CDC divergente: se anota CDC_DIVERGENTE y el documento no cambia (con estado final y con PENDIENTE)
  d := pg_temp.doc(v_a, v_ua, v_s1, '0160006', 'APROBADO', pg_temp.cdc('0160006'));
  r := pg_temp.reg(v_a, v_ua, d, 'OK', 'Aprobado', 'APROBADO', pg_temp.cdc('0160006', '987654321'));
  PERFORM pg_temp.ok(r = 'CDC_DIVERGENTE' AND pg_temp.estado(d) = 'APROBADO/ENVIADO/' || pg_temp.cdc('0160006') || '/CDC_DIVERGENTE', 'CDC distinto del guardado: CDC_DIVERGENTE y el documento conserva su CDC y estado');
  d2 := pg_temp.doc(v_a, v_ua, v_s1, '0160007', 'PENDIENTE', NULL);
  r := pg_temp.reg(v_a, v_ua, d2, 'OK', 'Aprobado', 'APROBADO', pg_temp.cdc('0160999'));
  PERFORM pg_temp.ok(r = 'CDC_DIVERGENTE' AND pg_temp.estado(d2) = 'PENDIENTE/ENVIADO/-/CDC_DIVERGENTE', 'CDC de OTRO número: CDC_DIVERGENTE y el estado PENDIENTE no se aprueba');

  -- 6) Resultados que no son OK nunca cambian un estado final (comportamiento original que se conserva)
  d := pg_temp.doc(v_a, v_ua, v_s1, '0160008', 'APROBADO', pg_temp.cdc('0160008'));
  PERFORM pg_temp.ok(pg_temp.reg(v_a, v_ua, d, 'NO_ENCONTRADO', NULL, NULL, NULL) = 'NO_ENCONTRADO' AND pg_temp.reg(v_a, v_ua, d, 'TIMEOUT', NULL, NULL, NULL) = 'TIMEOUT'
                     AND pg_temp.estado(d) = 'APROBADO/ENVIADO/' || pg_temp.cdc('0160008') || '/TIMEOUT', 'NO_ENCONTRADO y TIMEOUT solo anotan la consulta: el estado final no cambia');
  PERFORM pg_temp.falla(format('SELECT pg_temp.reg(%L, %L, %L, %L, %L, %L, NULL)', v_a, v_ua, d, 'OK', 'x', 'INVENTADO'), 'P0001', 'un estado SIFEN fuera de catálogo se rechaza');

  -- 7) Aislamiento por empresa, usuario y sucursal
  d := pg_temp.doc(v_a, v_ua, v_s1, '0160009', 'PENDIENTE', NULL);
  PERFORM pg_temp.falla(format('SELECT pg_temp.reg(%L, %L, %L, %L, %L, %L, NULL)', v_a, v_ub, d, 'OK', 'Pendiente', 'PENDIENTE'), '42501', 'el administrador de OTRA empresa no puede consultar un documento ajeno (sin permiso en la empresa A)');
  PERFORM pg_temp.falla(format('SELECT pg_temp.reg(%L, %L, %L, %L, %L, %L, NULL)', v_b, v_ub, d, 'OK', 'Pendiente', 'PENDIENTE'), 'P0001', 'la empresa B no ve el documento de la empresa A (documento no encontrado)');
  PERFORM pg_temp.ok(pg_temp.estado(d) = 'PENDIENTE/ENVIADO/-/-' OR pg_temp.estado(d) LIKE 'PENDIENTE/%', 'los intentos ajenos no modificaron el documento');
  d2 := pg_temp.doc(v_a, v_ua, v_s2, '0160010', 'PENDIENTE', NULL);
  UPDATE usuarios SET alcance_sucursales = 'ASIGNADAS' WHERE empresa_id = v_a AND id = v_ua;
  INSERT INTO usuario_sucursal (empresa_id, usuario_id, sucursal_id) VALUES (v_a, v_ua, v_s1) ON CONFLICT DO NOTHING;
  PERFORM pg_temp.ok(pg_temp.reg(v_a, v_ua, d, 'OK', 'Pendiente', 'PENDIENTE', NULL) = 'OK', 'usuario con alcance ASIGNADAS: consulta un documento de su sucursal');
  PERFORM pg_temp.falla(format('SELECT pg_temp.reg(%L, %L, %L, %L, %L, %L, NULL)', v_a, v_ua, d2, 'OK', 'Pendiente', 'PENDIENTE'), 'P0001', 'usuario con alcance ASIGNADAS: un documento de OTRA sucursal no existe para él');
  UPDATE usuarios SET alcance_sucursales = 'TODAS' WHERE empresa_id = v_a AND id = v_ua;
  PERFORM pg_temp.ok(pg_temp.reg(v_a, v_ua, d2, 'OK', 'Pendiente', 'PENDIENTE', NULL) = 'OK', 'con alcance TODAS el mismo documento sí se consulta');
  PERFORM pg_temp.ok((SELECT count(*) FROM documento_electronico_intentos WHERE documento_id = d2) = 1, 'la consulta rechazada por alcance no dejó intento (solo la autorizada)');
  RAISE NOTICE 'PASS: T16 completa';
END $t$;
