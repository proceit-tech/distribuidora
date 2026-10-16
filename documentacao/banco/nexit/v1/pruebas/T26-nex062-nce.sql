-- T26 — NEX-062 (PRO-94): Nota de Crédito Electrónica V1 en PostgreSQL real (secuencial, una sola sesión). Base descartable; datos sintéticos (RUC/CDC ficticios).
-- NOTA: preparado por la IA SIN ejecutar (sin acceso a PostgreSQL); lo corre el runner (ejecutar-pruebas.sh) del responsable sobre una base descartable con NEX-001…062 aplicadas.
\i _helpers.sql

DO $t$
DECLARE
  v_h text := crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12));
  v_a uuid; v_b uuid; v_ua uuid; v_ub uuid; v_sa uuid; v_p uuid; v_fe uuid; v_n1 uuid; v_n2 uuid; v_n3 uuid; v_cdc text; v_cdc_nce text;
  v_sol jsonb := '{"iTiDE":1,"dNomRec":"Cliente T26","dRucRec":"80000009","iNatRec":1,"cMoneOpe":"PYG","dTiCam":null,"Detalles":[{"dCantProSer":2,"dTotOpeItem":100000},{"dCantProSer":10,"dTotOpeItem":50000}]}'::jsonb;
  r record;
  v_cant int;
  -- payload NCE mínimo coherente con la FE (el servidor TypeScript construye el real; aquí solo lo que valida la función SQL)
  v_pay jsonb;
BEGIN
  v_a := nex_inicializar_empresa('emp-t26a', 'Empresa T26 A SA (prueba)', '8026101', '1', 'admin.t26a', 'Ana', 'A', NULL, v_h);
  v_b := nex_inicializar_empresa('emp-t26b', 'Empresa T26 B SA (prueba)', '8026102', '1', 'admin.t26b', 'Beto', 'B', NULL, v_h);
  SELECT id INTO v_ua FROM usuarios WHERE empresa_id = v_a;
  SELECT id INTO v_ub FROM usuarios WHERE empresa_id = v_b;
  SELECT id INTO v_sa FROM sucursales WHERE empresa_id = v_a ORDER BY creado_at, id LIMIT 1;
  UPDATE sucursales SET establecimiento_sifen = '001' WHERE id = v_sa;

  -- Estructura y privilegios
  PERFORM pg_temp.ok(to_regclass('public.nce_origen') IS NOT NULL AND to_regclass('public.nce_lineas') IS NOT NULL AND to_regprocedure('public.fe_documento_crear_nce(uuid,uuid,uuid,uuid,text,uuid,integer,jsonb,text,numeric,jsonb)') IS NOT NULL, 'NEX-062: existen nce_origen, nce_lineas y fe_documento_crear_nce');
  PERFORM pg_temp.ok(has_function_privilege('nexit_runtime', 'public.fe_documento_crear_nce(uuid,uuid,uuid,uuid,text,uuid,integer,jsonb,text,numeric,jsonb)', 'EXECUTE')
    AND has_function_privilege('nexit_runtime', 'public.fe_consulta_reservar(integer,integer,text[])', 'EXECUTE')
    AND NOT has_table_privilege('nexit_runtime', 'public.nce_origen', 'INSERT') AND NOT has_table_privilege('nexit_runtime', 'public.nce_lineas', 'INSERT'), 'grants: la aplicación ejecuta las funciones y NO escribe las tablas NCE directamente');

  v_p := fe_punto_crear(v_a, v_ua, v_sa, '001', 'Caja 1', 0, true);
  PERFORM fe_punto_activar(v_a, v_ua, v_p, 0, true);

  -- FE original APROBADA con CDC coherente y su solicitud (Detalles) persistida
  INSERT INTO documentos_electronicos (empresa_id, sucursal_id, tipo, establecimiento, punto_expedicion, numero, cdc, fecha_emision, receptor_nombre, moneda, total, estado_local, estado_sifen, creado_por)
  VALUES (v_a, v_sa, 'FE', '001', '001', '0000001', '01' || '80000005' || '6' || '001' || '001' || '0000001' || '1' || '20261016' || '1' || '123456789' || '0', now(), 'Cliente T26', 'PYG', 150000, 'ENVIADO', 'APROBADO', v_ua)
  RETURNING id, cdc INTO v_fe, v_cdc;
  INSERT INTO documento_electronico_solicitudes (empresa_id, documento_id, version, payload, payload_hash, entrada_hash, creado_por)
  VALUES (v_a, v_fe, 1, v_sol, encode(sha256(convert_to(v_sol::text, 'UTF8')), 'hex'), encode(sha256(convert_to('fe-t26', 'UTF8')), 'hex'), v_ua);

  v_pay := jsonb_build_object('iTiDE', 5, 'iMotEmi', 3, 'dNomRec', 'Cliente T26', 'dRucRec', '80000009', 'iNatRec', 1, 'cMoneOpe', 'PYG', 'dTiCam', NULL,
                              'DocumentosAsociados', jsonb_build_array(jsonb_build_object('iTipDocAso', 1, 'dCdCDERef', v_cdc)), 'Subtotales', jsonb_build_array(jsonb_build_object('dTotGralOpe', 30000)));

  -- Sin secuencia NCE confirmada no se emite (ni se reserva número)
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_nce(%L, %L, %L, %L, 'clave-t26-0001', %L, 3, '[{"linea":1,"cantidad":0,"monto":30000}]'::jsonb, 'PYG', 30000, %L)$f$, v_a, v_ua, v_sa, v_p, v_fe, v_pay), 'P0001', 'sin secuencia NCE confirmada: NEX:SECUENCIA_NO_CONFIGURADA');
  PERFORM fe_punto_secuencia_configurar(v_a, v_ua, v_p, 'NCE', 0, true);

  -- Emisión 1: motivo 3, 30.000 de la línea 1; toma 0000001 de la secuencia NCE (la de FE no se toca)
  SELECT * INTO r FROM fe_documento_crear_nce(v_a, v_ua, v_sa, v_p, 'clave-t26-0001', v_fe, 3, '[{"linea":1,"cantidad":0,"monto":30000}]'::jsonb, 'PYG', 30000, v_pay);
  v_n1 := r.o_documento_id;
  PERFORM pg_temp.ok(r.o_numero = '0000001' AND NOT r.o_reutilizado AND (SELECT ultimo_numero = 1 FROM fe_punto_secuencias WHERE punto_id = v_p AND tipo_documento = 'NCE')
    AND (SELECT ultimo_numero = 0 FROM fe_punto_secuencias WHERE punto_id = v_p AND tipo_documento = 'FE'), 'la NCE toma 0000001 de SU secuencia; la de FE queda intacta');
  PERFORM pg_temp.ok((SELECT tipo = 'NCE' AND estado_local = 'PENDIENTE_ENVIO' AND (SELECT payload->>'dNumDoc' FROM documento_electronico_solicitudes WHERE documento_id = v_n1) = '0000001' FROM documentos_electronicos WHERE id = v_n1)
    AND (SELECT motivo = 3 AND fe_cdc = v_cdc FROM nce_origen WHERE nce_id = v_n1), 'NCE creada como PENDIENTE_ENVIO, con número en el payload y origen (FE, CDC, motivo) registrado');

  -- Idempotencia: misma clave y contenido no consume número; mismo clave con otro contenido se rechaza
  SELECT * INTO r FROM fe_documento_crear_nce(v_a, v_ua, v_sa, v_p, 'clave-t26-0001', v_fe, 3, '[{"linea":1,"cantidad":0,"monto":30000}]'::jsonb, 'PYG', 30000, v_pay);
  PERFORM pg_temp.ok(r.o_reutilizado AND r.o_documento_id = v_n1 AND (SELECT ultimo_numero = 1 FROM fe_punto_secuencias WHERE punto_id = v_p AND tipo_documento = 'NCE'), 'idempotencia: la repetición devuelve la misma NCE sin consumir número');
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_nce(%L, %L, %L, %L, 'clave-t26-0001', %L, 3, '[{"linea":1,"cantidad":0,"monto":31000}]'::jsonb, 'PYG', 31000, %L)$f$, v_a, v_ua, v_sa, v_p, v_fe, jsonb_set(v_pay, '{Subtotales,0,dTotGralOpe}', '31000')), 'P0001', 'misma clave con otro contenido: NEX:IDEMPOTENCIA_CONFLICTO');

  -- Una NCE pendiente bloquea otra de la misma factura (sin consumir número)
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_nce(%L, %L, %L, %L, 'clave-t26-0002', %L, 3, '[{"linea":2,"cantidad":0,"monto":1000}]'::jsonb, 'PYG', 1000, %L)$f$, v_a, v_ua, v_sa, v_p, v_fe, jsonb_set(v_pay, '{Subtotales,0,dTotGralOpe}', '1000')), 'P0001', 'NCE pendiente bloquea otra: NEX:NCE_PENDIENTE');
  PERFORM pg_temp.ok((SELECT ultimo_numero = 1 FROM fe_punto_secuencias WHERE punto_id = v_p AND tipo_documento = 'NCE'), 'el rechazo previo a la reserva no consume número');

  -- Aprobar la NCE 1: consume saldo y fija el motivo
  v_cdc_nce := '05' || '80000005' || '6' || '001' || '001' || '0000001' || '1' || '20261016' || '1' || '123456789' || '0';
  UPDATE documentos_electronicos SET estado_local = 'ENVIADO', estado_sifen = 'APROBADO', cdc = v_cdc_nce WHERE id = v_n1;
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_nce(%L, %L, %L, %L, 'clave-t26-0003', %L, 2, '[{"linea":1,"cantidad":1,"monto":10000}]'::jsonb, 'PYG', 10000, %L)$f$, v_a, v_ua, v_sa, v_p, v_fe, jsonb_set(jsonb_set(v_pay, '{iMotEmi}', '2'), '{Subtotales,0,dTotGralOpe}', '10000')), 'P0001', 'motivo fijado por la primera NCE aprobada: NEX:MOTIVO_FIJADO');
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_nce(%L, %L, %L, %L, 'clave-t26-0004', %L, 3, '[{"linea":1,"cantidad":0,"monto":70001}]'::jsonb, 'PYG', 70001, %L)$f$, v_a, v_ua, v_sa, v_p, v_fe, jsonb_set(v_pay, '{Subtotales,0,dTotGralOpe}', '70001')), 'P0001', 'el crédito supera el saldo (100.000 − 30.000 aprobados): NEX:SALDO_MONTO');
  SELECT * INTO r FROM fe_documento_crear_nce(v_a, v_ua, v_sa, v_p, 'clave-t26-0005', v_fe, 3, '[{"linea":1,"cantidad":0,"monto":70000}]'::jsonb, 'PYG', 70000, jsonb_set(v_pay, '{Subtotales,0,dTotGralOpe}', '70000'));
  v_n2 := r.o_documento_id;
  PERFORM pg_temp.ok(r.o_numero = '0000002', 'el saldo restante exacto (70.000) se puede acreditar y la numeración continúa en 0000002');

  -- Rechazada: libera el saldo; la nueva NCE usa un número nuevo (el rechazado no se reutiliza)
  UPDATE documentos_electronicos SET estado_local = 'ENVIADO', estado_sifen = 'RECHAZADO' WHERE id = v_n2;
  SELECT * INTO r FROM fe_documento_crear_nce(v_a, v_ua, v_sa, v_p, 'clave-t26-0006', v_fe, 3, '[{"linea":1,"cantidad":0,"monto":70000}]'::jsonb, 'PYG', 70000, jsonb_set(v_pay, '{Subtotales,0,dTotGralOpe}', '70000'));
  v_n3 := r.o_documento_id;
  PERFORM pg_temp.ok(r.o_numero = '0000003', 'tras un rechazo definitivo el saldo queda libre y se emite una NCE NUEVA con otro número');

  -- Aislamiento por empresa: otra empresa no ve la FE (rechazo sin consumir número)
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_nce(%L, %L, %L, %L, 'clave-t26-0007', %L, 3, '[{"linea":1,"cantidad":0,"monto":1000}]'::jsonb, 'PYG', 1000, %L)$f$, v_b, v_ub, v_sa, v_p, v_fe, jsonb_set(v_pay, '{Subtotales,0,dTotGralOpe}', '1000')), NULL, 'otra empresa no puede acreditar la factura');

  -- Consulta automática: la NCE enviada y sin resultado se reserva con lease una sola vez
  UPDATE documentos_electronicos SET estado_local = 'ENVIADO', estado_sifen = 'PENDIENTE' WHERE id = v_n3;
  SELECT count(*) INTO v_cant FROM fe_consulta_reservar(10, 120, ARRAY['NCE']);
  PERFORM pg_temp.ok(v_cant >= 1, 'fe_consulta_reservar toma la NCE pendiente');
  SELECT count(*) INTO v_cant FROM fe_consulta_reservar(10, 120, ARRAY['NCE']) x WHERE x.o_documento = v_n3;
  PERFORM pg_temp.ok(v_cant = 0, 'con el lease vigente la misma NCE no se entrega a una segunda reserva');

  -- R02-02 (flujo_nce): un operador con SOLO CREAR registra la consulta de una FE/NCE pendiente con su identidad real; no puede usar la función EDITAR original; el estado final y otro tenant se rechazan
  DECLARE
    v_op uuid; v_perfil uuid; v_pend uuid; v_pend2 uuid; v_res text; v_cdc_pend text := '01' || '80000005' || '6' || '001' || '001' || '0000002' || '1' || '20261016' || '1' || '123456789' || '0';
  BEGIN
    INSERT INTO usuarios (empresa_id, usuario, nombre, password_hash) VALUES (v_a, 'op.t26.crear', 'Operador solo CREAR', v_h) RETURNING id INTO v_op;
    INSERT INTO perfiles (empresa_id, codigo, nombre) VALUES (v_a, 'solo-crear-t26', 'Solo CREAR (T26)') RETURNING id INTO v_perfil;
    INSERT INTO perfil_permiso (empresa_id, perfil_id, permiso_id) SELECT v_a, v_perfil, id FROM permisos WHERE codigo = 'FACTURACION_ELECTRONICA.CREAR';
    INSERT INTO usuario_perfil (empresa_id, usuario_id, perfil_id) VALUES (v_a, v_op, v_perfil);
    INSERT INTO usuario_sucursal (empresa_id, usuario_id, sucursal_id) VALUES (v_a, v_op, v_sa);
    PERFORM pg_temp.ok(usuario_tiene_permiso(v_a, v_op, 'FACTURACION_ELECTRONICA', 'CREAR') AND NOT usuario_tiene_permiso(v_a, v_op, 'FACTURACION_ELECTRONICA', 'EDITAR'), 'el operador de prueba tiene CREAR y NO EDITAR');

    INSERT INTO documentos_electronicos (empresa_id, sucursal_id, tipo, establecimiento, punto_expedicion, numero, fecha_emision, receptor_nombre, moneda, total, estado_local, estado_sifen, creado_por)
    VALUES (v_a, v_sa, 'FE', '001', '001', '0000002', now(), 'Cliente T26', 'PYG', 1000, 'ENVIADO', 'SIN_CONSULTA', v_ua) RETURNING id INTO v_pend;

    -- R03-01: respuesta DEFINITIVA sin CDC (documento sin CDC guardado) → RESPUESTA_INVALIDA, evidencia conservada y estado/CDC intactos
    INSERT INTO documentos_electronicos (empresa_id, sucursal_id, tipo, establecimiento, punto_expedicion, numero, fecha_emision, receptor_nombre, moneda, total, estado_local, estado_sifen, creado_por)
    VALUES (v_a, v_sa, 'FE', '001', '001', '0000003', now(), 'Cliente T26', 'PYG', 1000, 'ENVIADO', 'SIN_CONSULTA', v_ua) RETURNING id INTO v_pend2;
    v_res := fe_documento_registrar_consulta_flujo_nce(v_a, v_op, v_pend2, 'OK', 200, 'req-t26-sc', 'Aprobado', 'APROBADO', NULL, '0260', 'ok', NULL, NULL, '{}'::jsonb);
    PERFORM pg_temp.ok(v_res = 'RESPUESTA_INVALIDA' AND (SELECT estado_sifen = 'SIN_CONSULTA' AND cdc IS NULL FROM documentos_electronicos WHERE id = v_pend2)
      AND (SELECT count(*) = 1 AND bool_and(resultado = 'RESPUESTA_INVALIDA' AND estado_sifen IS NULL AND actor_id = v_op) FROM documento_electronico_intentos WHERE documento_id = v_pend2 AND tipo = 'CONSULTA'), 'R03-01: APROBADO sin CDC no cambia el estado ni el CDC y deja la tentativa como RESPUESTA_INVALIDA con el actor real');
    v_res := fe_documento_registrar_consulta_flujo_nce(v_a, v_op, v_pend2, 'OK', 200, 'req-t26-rc', 'Rechazado', 'RECHAZADO', NULL, '0260', 'x', NULL, NULL, '{}'::jsonb);
    PERFORM pg_temp.ok(v_res = 'RESPUESTA_INVALIDA' AND (SELECT estado_sifen = 'SIN_CONSULTA' FROM documentos_electronicos WHERE id = v_pend2), 'R03-01: RECHAZADO sin CDC tampoco cambia el estado fiscal');
    v_res := fe_documento_registrar_consulta_flujo_nce(v_a, v_op, v_pend2, 'OK', 200, 'req-t26-pe', 'Pendiente', 'PENDIENTE', NULL, '0260', 'x', NULL, NULL, '{}'::jsonb);
    PERFORM pg_temp.ok(v_res = 'OK' AND (SELECT estado_sifen = 'PENDIENTE' FROM documentos_electronicos WHERE id = v_pend2), 'R03-01: un estado NO definitivo (PENDIENTE) sin CDC sí se registra');
    v_res := fe_documento_registrar_consulta_flujo_nce(v_a, v_op, v_pend2, 'OK', 200, 'req-t26-dv', 'Aprobado', 'APROBADO', '01' || '80000005' || '6' || '001' || '001' || '0000009' || '1' || '20261016' || '1' || '123456789' || '0', '0260', 'x', NULL, NULL, '{}'::jsonb);
    PERFORM pg_temp.ok(v_res = 'CDC_DIVERGENTE' AND (SELECT estado_sifen = 'PENDIENTE' AND cdc IS NULL FROM documentos_electronicos WHERE id = v_pend2), 'R03-01: un CDC que no corresponde al número del documento sigue siendo CDC_DIVERGENTE y no cambia nada');

    PERFORM pg_temp.falla(format($f$SELECT fe_documento_registrar_consulta(%L, %L, %L, 'OK', 200, 'req-t26', 'Aprobado', 'APROBADO', NULL, '0260', 'ok', NULL, NULL, '{}'::jsonb)$f$, v_a, v_op, v_pend), '42501', 'la función original (EDITAR) sigue rechazando al operador solo CREAR');
    v_res := fe_documento_registrar_consulta_flujo_nce(v_a, v_op, v_pend, 'OK', 200, 'req-t26', 'Aprobado', 'APROBADO', v_cdc_pend, '0260', 'ok', NULL, NULL, '{}'::jsonb);
    PERFORM pg_temp.ok(v_res = 'OK' AND (SELECT estado_sifen = 'APROBADO' AND cdc = v_cdc_pend FROM documentos_electronicos WHERE id = v_pend)
      AND (SELECT count(*) = 1 AND bool_and(actor_id = v_op) FROM documento_electronico_intentos WHERE documento_id = v_pend AND tipo = 'CONSULTA'), 'flujo_nce: el operador solo CREAR registra la consulta y la auditoría lleva SU identidad (actor_id)');
    PERFORM pg_temp.falla(format($f$SELECT fe_documento_registrar_consulta_flujo_nce(%L, %L, %L, 'OK', 200, 'req-t26', 'x', 'RECHAZADO', NULL, '0260', 'x', NULL, NULL, '{}'::jsonb)$f$, v_a, v_op, v_pend), 'P0001', 'flujo_nce: un documento ya final no se reconsulta: NEX:DOCUMENTO_NO_PENDIENTE');
    PERFORM pg_temp.falla(format($f$SELECT fe_documento_registrar_consulta_flujo_nce(%L, %L, %L, 'OK', 200, 'req-t26', 'x', 'APROBADO', NULL, '0260', 'x', NULL, NULL, '{}'::jsonb)$f$, v_b, v_ub, v_pend), 'P0001', 'flujo_nce: otro tenant no ve el documento');
    PERFORM pg_temp.falla(format($f$SELECT fe_documento_registrar_consulta_flujo_nce(%L, %L, %L, 'OK', 200, 'req-t26', 'x', 'APROBADO', NULL, '0260', 'x', NULL, NULL, '{}'::jsonb)$f$, v_a, gen_random_uuid(), v_n3), '42501', 'flujo_nce: usuario inexistente/sin permiso (sin permiso CREAR ni EDITAR) rechazado');
  END;

  RAISE NOTICE 'T26 completada';
END $t$;
