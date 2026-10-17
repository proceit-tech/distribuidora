-- T26 — NEX-062 (PRO-94): Nota de Crédito Electrónica V1 en PostgreSQL real (secuencial, una sola sesión). Base descartable; datos sintéticos (RUC/CDC ficticios).
-- NOTA: preparado por la IA SIN ejecutar (sin acceso a PostgreSQL); lo corre el runner (ejecutar-pruebas.sh) del responsable sobre una base descartable con NEX-001…062 aplicadas.
\i _helpers.sql

-- Payload NCE coherente con la FE original (GAP-04: la función SQL confronta receptor e ítems): ítem de la línea p_linea con el importe/cantidad del crédito.
CREATE OR REPLACE FUNCTION pg_temp.pay(p_base jsonb, p_sol jsonb, p_motivo int, p_linea int, p_cant numeric, p_monto numeric) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  d jsonb := p_sol->'Detalles'->(p_linea - 1); det jsonb; v_cant numeric; v_prec numeric; v_afec int := (d->>'iAfecIVA')::int; v_tasa numeric := (d->>'dTasaIVA')::numeric; v_prop numeric := (d->>'dPropIVA')::numeric;
  v_tb numeric; v_den numeric; v_base numeric; v_liq numeric; v_bexe numeric; v_exe numeric := 0; v_exo numeric := 0; v_s5 numeric := 0; v_s10 numeric := 0; v_i5 numeric := 0; v_i10 numeric := 0; v_b5 numeric := 0; v_b10 numeric := 0; v_sub jsonb;
BEGIN
  v_cant := CASE WHEN p_motivo = 2 THEN p_cant ELSE 1 END;
  v_prec := CASE WHEN p_motivo = 2 THEN (d->>'dPUniProSer')::numeric ELSE p_monto END;
  v_tb := round(v_cant * v_prec, 8); v_den := 10000 + v_tasa * v_prop;
  v_base := CASE WHEN v_afec IN (1, 4) THEN round(100 * v_tb * v_prop / v_den, 8) ELSE 0 END;
  v_liq := CASE WHEN v_afec IN (1, 4) THEN round(v_base * v_tasa / 100, 8) ELSE 0 END;
  v_bexe := CASE WHEN v_afec = 4 THEN round(100 * v_tb * (100 - v_prop) / v_den, 8) ELSE 0 END;
  IF v_afec = 3 THEN v_exe := v_tb; ELSIF v_afec = 2 THEN v_exo := v_tb;
  ELSIF v_afec = 1 THEN IF v_tasa = 5 THEN v_s5 := v_tb; ELSE v_s10 := v_tb; END IF;
  ELSE v_exe := v_bexe; IF v_tasa = 5 THEN v_s5 := v_base + v_liq; ELSE v_s10 := v_base + v_liq; END IF; END IF;
  IF v_afec IN (1, 4) THEN IF v_tasa = 5 THEN v_i5 := v_liq; v_b5 := v_base; ELSE v_i10 := v_liq; v_b10 := v_base; END IF; END IF;
  det := d || jsonb_build_object('dCantProSer', v_cant, 'dPUniProSer', v_prec, 'dTotBruOpeItem', v_tb, 'dTotOpeItem', v_tb, 'dBasGravIVA', v_base, 'dLiqIVAItem', v_liq, 'dBasExe', v_bexe);
  v_sub := jsonb_build_object('dSubExe', v_exe, 'dSubExo', v_exo, 'dSub5', v_s5, 'dSub10', v_s10, 'dTotOpe', v_exe + v_exo + v_s5 + v_s10, 'dTotDesc', 0, 'dTotDescGlotem', 0, 'dTotAntItem', 0, 'dTotAnt', 0,
    'dPorcDescTotal', 0, 'dDescTotal', 0, 'dAnticipo', 0, 'dRedon', 0, 'dTotGralOpe', v_exe + v_exo + v_s5 + v_s10, 'dIVA5', v_i5, 'dIVA10', v_i10, 'dLiqTotIVA5', v_i5, 'dLiqTotIVA10', v_i10,
    'dTotIVA', v_i5 + v_i10, 'dBaseGrav5', v_b5, 'dBaseGrav10', v_b10, 'dTBasGraIVA', v_b5 + v_b10, 'dTotalGs', v_exe + v_exo + v_s5 + v_s10);
  RETURN jsonb_set(jsonb_set(jsonb_set(p_base, '{iMotEmi}', to_jsonb(p_motivo)), '{Subtotales}', jsonb_build_array(v_sub)), '{Detalles}', jsonb_build_array(det));
END $$;

DO $t$
DECLARE
  v_h text := crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12));
  v_a uuid; v_b uuid; v_ua uuid; v_ub uuid; v_sa uuid; v_p uuid; v_fe uuid; v_n1 uuid; v_n2 uuid; v_n3 uuid; v_cdc text; v_cdc_nce text;
  v_sol jsonb := '{"iTiDE":1,"dNomRec":"Cliente T26","dRucRec":"80000009","iNatRec":1,"cMoneOpe":"PYG","dTiCam":null,"Detalles":[{"dCodInt":"P1","dGtin":null,"dDesProSer":"Gaseosa 2L","cUniMed":77,"dCantProSer":2,"dPUniProSer":50000,"dTotOpeItem":100000,"iAfecIVA":1,"dPropIVA":100,"dTasaIVA":10},{"dCodInt":"P2","dGtin":null,"dDesProSer":"Agua","cUniMed":77,"dCantProSer":10,"dPUniProSer":5000,"dTotOpeItem":50000,"iAfecIVA":3,"dPropIVA":0,"dTasaIVA":0},{"dCodInt":"P3","dGtin":null,"dDesProSer":"Mixto","cUniMed":77,"dCantProSer":3,"dPUniProSer":11000,"dTotOpeItem":33000,"iAfecIVA":4,"dPropIVA":50,"dTasaIVA":10}]}'::jsonb;
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

  v_pay := jsonb_build_object('Detalles', '[]'::jsonb, 'iTiDE', 5, 'iMotEmi', 3, 'dNomRec', 'Cliente T26', 'dRucRec', '80000009', 'iNatRec', 1, 'cMoneOpe', 'PYG', 'dTiCam', NULL,
                              'DocumentosAsociados', jsonb_build_array(jsonb_build_object('iTipDocAso', 1, 'dCdCDERef', v_cdc)), 'Subtotales', jsonb_build_array(jsonb_build_object('dTotGralOpe', 30000)));

  -- Sin secuencia NCE confirmada no se emite (ni se reserva número)
  v_pay := pg_temp.pay(v_pay, v_sol, 3, 1, 0, 30000);

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
  v_pay := pg_temp.pay(v_pay, v_sol, 3, 1, 0, 30000);

  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_nce(%L, %L, %L, %L, 'clave-t26-0001', %L, 3, '[{"linea":1,"cantidad":0,"monto":31000}]'::jsonb, 'PYG', 31000, %L)$f$, v_a, v_ua, v_sa, v_p, v_fe, pg_temp.pay(v_pay, v_sol, 3, 1, 0, 31000)), 'P0001', 'misma clave con otro contenido: NEX:IDEMPOTENCIA_CONFLICTO');

  -- Una NCE pendiente bloquea otra de la misma factura (sin consumir número)
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_nce(%L, %L, %L, %L, 'clave-t26-0002', %L, 3, '[{"linea":2,"cantidad":0,"monto":1000}]'::jsonb, 'PYG', 1000, %L)$f$, v_a, v_ua, v_sa, v_p, v_fe, pg_temp.pay(v_pay, v_sol, 3, 2, 0, 1000)), 'P0001', 'NCE pendiente bloquea otra: NEX:NCE_PENDIENTE');
  PERFORM pg_temp.ok((SELECT ultimo_numero = 1 FROM fe_punto_secuencias WHERE punto_id = v_p AND tipo_documento = 'NCE'), 'el rechazo previo a la reserva no consume número');

  -- Aprobar la NCE 1: consume saldo y fija el motivo
  v_cdc_nce := '05' || '80000005' || '6' || '001' || '001' || '0000001' || '1' || '20261016' || '1' || '123456789' || '0';
  UPDATE documentos_electronicos SET estado_local = 'ENVIADO', estado_sifen = 'APROBADO', cdc = v_cdc_nce WHERE id = v_n1;
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_nce(%L, %L, %L, %L, 'clave-t26-0003', %L, 2, '[{"linea":1,"cantidad":1,"monto":10000}]'::jsonb, 'PYG', 10000, %L)$f$, v_a, v_ua, v_sa, v_p, v_fe, pg_temp.pay(v_pay, v_sol, 2, 1, 1, 10000)), 'P0001', 'motivo fijado por la primera NCE aprobada: NEX:MOTIVO_FIJADO');
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_nce(%L, %L, %L, %L, 'clave-t26-0004', %L, 3, '[{"linea":1,"cantidad":0,"monto":70001}]'::jsonb, 'PYG', 70001, %L)$f$, v_a, v_ua, v_sa, v_p, v_fe, pg_temp.pay(v_pay, v_sol, 3, 1, 0, 70001)), 'P0001', 'el crédito supera el saldo (100.000 − 30.000 aprobados): NEX:SALDO_MONTO');
  SELECT * INTO r FROM fe_documento_crear_nce(v_a, v_ua, v_sa, v_p, 'clave-t26-0005', v_fe, 3, '[{"linea":1,"cantidad":0,"monto":70000}]'::jsonb, 'PYG', 70000, pg_temp.pay(v_pay, v_sol, 3, 1, 0, 70000));
  v_n2 := r.o_documento_id;
  PERFORM pg_temp.ok(r.o_numero = '0000002', 'el saldo restante exacto (70.000) se puede acreditar y la numeración continúa en 0000002');

  -- Rechazada: libera el saldo; la nueva NCE usa un número nuevo (el rechazado no se reutiliza)
  UPDATE documentos_electronicos SET estado_local = 'ENVIADO', estado_sifen = 'RECHAZADO' WHERE id = v_n2;
  SELECT * INTO r FROM fe_documento_crear_nce(v_a, v_ua, v_sa, v_p, 'clave-t26-0006', v_fe, 3, '[{"linea":1,"cantidad":0,"monto":70000}]'::jsonb, 'PYG', 70000, pg_temp.pay(v_pay, v_sol, 3, 1, 0, 70000));
  v_n3 := r.o_documento_id;
  PERFORM pg_temp.ok(r.o_numero = '0000003', 'tras un rechazo definitivo el saldo queda libre y se emite una NCE NUEVA con otro número');

  -- Aislamiento por empresa: otra empresa no ve la FE (rechazo sin consumir número)
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_nce(%L, %L, %L, %L, 'clave-t26-0007', %L, 3, '[{"linea":1,"cantidad":0,"monto":1000}]'::jsonb, 'PYG', 1000, %L)$f$, v_b, v_ub, v_sa, v_p, v_fe, pg_temp.pay(v_pay, v_sol, 3, 2, 0, 1000)), NULL, 'otra empresa no puede acreditar la factura');

  -- Consulta automática: la NCE enviada y sin resultado se reserva con lease una sola vez
  UPDATE documentos_electronicos SET estado_local = 'ENVIADO', estado_sifen = 'PENDIENTE' WHERE id = v_n3;
  SELECT count(*) INTO v_cant FROM fe_consulta_reservar(10, 120, ARRAY['NCE']);
  PERFORM pg_temp.ok(v_cant >= 1, 'fe_consulta_reservar toma la NCE pendiente');
  SELECT count(*) INTO v_cant FROM fe_consulta_reservar(10, 120, ARRAY['NCE']) x WHERE x.o_documento = v_n3;
  PERFORM pg_temp.ok(v_cant = 0, 'con el lease vigente la misma NCE no se entrega a una segunda reserva');

  -- (sin NCE pendiente en la factura: el rechazo de los casos siguientes se debe a la validación del payload, no al bloqueo por pendiente)
  UPDATE documentos_electronicos SET estado_sifen = 'RECHAZADO' WHERE id = v_n3;
  -- GAP-04: payload adulterado (receptor, ítem fiscal, importe o cantidad) rechazado por la función SQL sin consumir número
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_nce(%L, %L, %L, %L, 'clave-t26-g401', %L, 3, '[{"linea":1,"cantidad":0,"monto":1000}]'::jsonb, 'PYG', 1000, %L)$f$, v_a, v_ua, v_sa, v_p, v_fe, jsonb_set(pg_temp.pay(v_pay, v_sol, 3, 1, 0, 1000), '{dDirRec}', '"Otra direccion"')), 'P0001', 'GAP-04: receptor con otro campo (dirección) → NEX:ASOCIACION_INVALIDA');
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_nce(%L, %L, %L, %L, 'clave-t26-g402', %L, 3, '[{"linea":1,"cantidad":0,"monto":1000}]'::jsonb, 'PYG', 1000, %L)$f$, v_a, v_ua, v_sa, v_p, v_fe, jsonb_set(pg_temp.pay(v_pay, v_sol, 3, 1, 0, 1000), '{Detalles,0,iAfecIVA}', '3')), 'P0001', 'GAP-04: ítem con otra afectación de IVA → NEX:PAYLOAD_INVALIDO');
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_nce(%L, %L, %L, %L, 'clave-t26-g403', %L, 3, '[{"linea":1,"cantidad":0,"monto":1000}]'::jsonb, 'PYG', 1000, %L)$f$, v_a, v_ua, v_sa, v_p, v_fe, jsonb_set(pg_temp.pay(v_pay, v_sol, 3, 1, 0, 1000), '{Detalles,0,dTotOpeItem}', '999')), 'P0001', 'GAP-04: importe del ítem distinto del crédito → NEX:PAYLOAD_INVALIDO');
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_nce(%L, %L, %L, %L, 'clave-t26-g404', %L, 3, '[{"linea":1,"cantidad":0,"monto":1000}]'::jsonb, 'PYG', 1000, %L)$f$, v_a, v_ua, v_sa, v_p, v_fe, jsonb_set(pg_temp.pay(v_pay, v_sol, 3, 1, 0, 1000), '{Detalles}', '[]')), 'P0001', 'GAP-04: ítems del payload que no corresponden a las líneas → NEX:PAYLOAD_INVALIDO');
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_nce(%L, %L, %L, %L, 'clave-t26-g405', %L, 3, '[{"linea":1,"cantidad":0,"monto":1000}]'::jsonb, 'PYG', 1000, %L)$f$, v_a, v_ua, v_sa, v_p, v_fe, jsonb_set(pg_temp.pay(v_pay, v_sol, 3, 1, 0, 1000), '{Detalles,0,dCantProSer}', '5')), 'P0001', 'GAP-04: motivo monetario con cantidad distinta de 1 → NEX:PAYLOAD_INVALIDO');
  PERFORM pg_temp.ok((SELECT ultimo_numero = 3 FROM fe_punto_secuencias WHERE punto_id = v_p AND tipo_documento = 'NCE'), 'GAP-04: ningún payload adulterado consumió número de la secuencia NCE');

  -- R05-01: valores fiscales derivados y subtotales incoherentes (con identidad, cantidad, importe y total correctos) → NEX:PAYLOAD_INVALIDO, sin consumir número
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_nce(%L, %L, %L, %L, 'clave-t26-h501', %L, 3, '[{"linea":1,"cantidad":0,"monto":1000}]'::jsonb, 'PYG', 1000, %L)$f$, v_a, v_ua, v_sa, v_p, v_fe, jsonb_set(pg_temp.pay(v_pay, v_sol, 3, 1, 0, 1000), '{Detalles,0,dLiqIVAItem}', '1')), 'P0001', 'R05-01: liquidación de IVA del ítem alterada');
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_nce(%L, %L, %L, %L, 'clave-t26-h502', %L, 3, '[{"linea":1,"cantidad":0,"monto":1000}]'::jsonb, 'PYG', 1000, %L)$f$, v_a, v_ua, v_sa, v_p, v_fe, jsonb_set(pg_temp.pay(v_pay, v_sol, 3, 1, 0, 1000), '{Detalles,0,dBasGravIVA}', '1')), 'P0001', 'R05-01: base gravada del ítem alterada');
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_nce(%L, %L, %L, %L, 'clave-t26-h503', %L, 3, '[{"linea":1,"cantidad":0,"monto":1000}]'::jsonb, 'PYG', 1000, %L)$f$, v_a, v_ua, v_sa, v_p, v_fe, jsonb_set(pg_temp.pay(v_pay, v_sol, 3, 1, 0, 1000), '{Detalles,0,dTotBruOpeItem}', '999')), 'P0001', 'R05-01: total bruto del ítem alterado');
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_nce(%L, %L, %L, %L, 'clave-t26-h504', %L, 3, '[{"linea":1,"cantidad":0,"monto":1000}]'::jsonb, 'PYG', 1000, %L)$f$, v_a, v_ua, v_sa, v_p, v_fe, jsonb_set(pg_temp.pay(v_pay, v_sol, 3, 1, 0, 1000), '{Subtotales,0,dIVA10}', '1')), 'P0001', 'R05-01: subtotal IVA 10 % alterado');
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_nce(%L, %L, %L, %L, 'clave-t26-h505', %L, 3, '[{"linea":1,"cantidad":0,"monto":1000}]'::jsonb, 'PYG', 1000, %L)$f$, v_a, v_ua, v_sa, v_p, v_fe, jsonb_set(pg_temp.pay(v_pay, v_sol, 3, 1, 0, 1000), '{Subtotales,0,dTotIVA}', '1')), 'P0001', 'R05-01: total de IVA alterado');
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_nce(%L, %L, %L, %L, 'clave-t26-h506', %L, 3, '[{"linea":1,"cantidad":0,"monto":1000}]'::jsonb, 'PYG', 1000, %L)$f$, v_a, v_ua, v_sa, v_p, v_fe, jsonb_set(pg_temp.pay(v_pay, v_sol, 3, 1, 0, 1000), '{Subtotales,0,dSub10}', '1')), 'P0001', 'R05-01: subtotal gravado 10 % alterado');
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_nce(%L, %L, %L, %L, 'clave-t26-h507', %L, 3, '[{"linea":1,"cantidad":0,"monto":1000}]'::jsonb, 'PYG', 1000, %L)$f$, v_a, v_ua, v_sa, v_p, v_fe, jsonb_set(pg_temp.pay(v_pay, v_sol, 3, 1, 0, 1000), '{Subtotales,0,dTotDesc}', '5')), 'P0001', 'R05-01: descuento global no permitido');
  PERFORM pg_temp.ok((SELECT ultimo_numero = 3 FROM fe_punto_secuencias WHERE punto_id = v_p AND tipo_documento = 'NCE'), 'R05-01: ningún payload con derivados incoherentes consumió número');
  -- Positivo fiscal: línea de IVA parcial (10 %, proporción 50 %): los derivados correctos se aceptan
  SELECT * INTO r FROM fe_documento_crear_nce(v_a, v_ua, v_sa, v_p, 'clave-t26-h508', v_fe, 3, '[{"linea":3,"cantidad":0,"monto":10500}]'::jsonb, 'PYG', 10500, pg_temp.pay(v_pay, v_sol, 3, 3, 0, 10500));
  PERFORM pg_temp.ok(r.o_numero = '0000004' AND NOT r.o_reutilizado, 'R05-01: con derivados y subtotales correctos (IVA parcial 50 %) la NCE se crea y toma 0000004');
  UPDATE documentos_electronicos SET estado_sifen = 'RECHAZADO' WHERE id = r.o_documento_id;

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

  -- NCE-DB-01 (PYG sin centavos): Devolución con cantidad fraccionaria cuyo TOTAL no es entero se rechaza sin consumir número; la cantidad entera sigue válida
  DECLARE
    v_f11 uuid; v_n_antes integer; rp record; v_nce uuid;
  BEGIN
    INSERT INTO documentos_electronicos (empresa_id, sucursal_id, tipo, establecimiento, punto_expedicion, numero, cdc, fecha_emision, receptor_nombre, moneda, total, estado_local, estado_sifen, creado_por)
    VALUES (v_a, v_sa, 'FE', '001', '001', '0000011', '01' || '80000005' || '6' || '001' || '001' || '0000011' || '1' || '20261016' || '1' || '123456789' || '0', now(), 'Cliente T26', 'PYG', 150000, 'ENVIADO', 'APROBADO', v_ua) RETURNING id INTO v_f11;
    INSERT INTO documento_electronico_solicitudes (empresa_id, documento_id, version, payload, payload_hash, entrada_hash, creado_por)
    VALUES (v_a, v_f11, 1, v_sol, encode(sha256(convert_to(v_sol::text, 'UTF8')), 'hex'), encode(sha256(convert_to('fe-t26-11', 'UTF8')), 'hex'), v_ua);
    SELECT ultimo_numero INTO v_n_antes FROM fe_punto_secuencias WHERE punto_id = v_p AND tipo_documento = 'NCE';
    PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_nce(%L, %L, %L, %L, 'clave-t26-py01', %L, 2, '[{"linea":2,"cantidad":0.0001,"monto":0.5}]'::jsonb, 'PYG', 0.5, %L)$f$, v_a, v_ua, v_sa, v_p, v_f11, pg_temp.pay(v_pay, v_sol, 2, 2, 0.0001, 0.5)), 'P0001', 'PYG-01: devolución 0.0001 × Gs. 5.000 = Gs. 0,5 → NEX:PAYLOAD_INVALIDO (total PYG con centavos)');
    PERFORM pg_temp.ok((SELECT ultimo_numero = v_n_antes FROM fe_punto_secuencias WHERE punto_id = v_p AND tipo_documento = 'NCE') AND NOT EXISTS (SELECT 1 FROM nce_origen WHERE fe_id = v_f11), 'PYG-03: el rechazo no consumió número ni dejó NCE ni créditos');
    SELECT * INTO rp FROM fe_documento_crear_nce(v_a, v_ua, v_sa, v_p, 'clave-t26-py02', v_f11, 2, '[{"linea":2,"cantidad":1,"monto":5000}]'::jsonb, 'PYG', 5000, pg_temp.pay(v_pay, v_sol, 2, 2, 1, 5000));
    PERFORM pg_temp.ok(NOT rp.o_reutilizado, 'PYG-02: devolución de 1 unidad × Gs. 5.000 (total entero) válida');

    -- NCE-DB-04: una línea acreditada no puede declarar otra FE que la de su NCE (FK compuesta empresa, NCE, FE); UPDATE y DELETE siguen prohibidos
    SELECT nce_id INTO v_nce FROM nce_origen WHERE empresa_id = v_a AND fe_id = v_f11;
    PERFORM pg_temp.falla(format($f$INSERT INTO nce_lineas (empresa_id, nce_id, fe_id, linea, cantidad, monto) VALUES (%L, %L, %L, 1, 0, 1)$f$, v_a, v_nce, v_fe), '23503', 'DB-04: fe_id distinto del vínculo de la NCE → violación de la FK compuesta');
    PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM nce_lineas WHERE nce_id = v_nce AND fe_id = v_f11), 'DB-04: la línea creada por la función conserva el fe_id de su NCE');
    PERFORM pg_temp.falla(format($f$UPDATE nce_lineas SET monto = monto + 1 WHERE nce_id = %L$f$, v_nce), 'P0001', 'DB-04: las líneas siguen siendo de solo altas (UPDATE)');
    PERFORM pg_temp.falla(format($f$DELETE FROM nce_lineas WHERE nce_id = %L$f$, v_nce), 'P0001', 'DB-04: las líneas siguen siendo de solo altas (DELETE)');
  END;

  -- ZERO-01 (worker): el actor de la consulta automática es un usuario REAL, ACTIVO y autorizado (CREAR o EDITAR) con alcance; el creador solo-CREAR sirve; si queda inactivo, el más antiguo autorizado
  DECLARE
    v_opw uuid; v_d1 uuid; v_d2 uuid; v_actor uuid;
  BEGIN
    SELECT id INTO v_opw FROM usuarios WHERE empresa_id = v_a AND usuario = 'op.t26.crear';
    INSERT INTO documentos_electronicos (empresa_id, sucursal_id, tipo, establecimiento, punto_expedicion, numero, fecha_emision, receptor_nombre, moneda, total, estado_local, estado_sifen, creado_por)
    VALUES (v_a, v_sa, 'NCE', '001', '001', '0000091', now(), 'Cliente T26', 'PYG', 1000, 'ENVIADO', 'SIN_CONSULTA', v_opw) RETURNING id INTO v_d1;
    INSERT INTO documentos_electronicos (empresa_id, sucursal_id, tipo, establecimiento, punto_expedicion, numero, fecha_emision, receptor_nombre, moneda, total, estado_local, estado_sifen, creado_por)
    VALUES (v_a, v_sa, 'NCE', '001', '001', '0000092', now(), 'Cliente T26', 'PYG', 1000, 'ENVIO_INDETERMINADO', 'PENDIENTE', v_opw) RETURNING id INTO v_d2;
    SELECT o_actor INTO v_actor FROM fe_consulta_reservar(100, 120, ARRAY['NCE']) WHERE o_documento = v_d1;
    PERFORM pg_temp.ok(v_actor = v_opw, 'ZERO-01 W01: NCE ENVIADO/SIN_CONSULTA creada por un operador solo CREAR activo: el actor de la consulta automática es ese operador');
    SELECT o_actor INTO v_actor FROM fe_consulta_reservar(100, 120, ARRAY['NCE']) WHERE o_documento = v_d2;
    PERFORM pg_temp.ok(v_actor IS NULL, 'la segunda reserva no entrega documentos con lease vigente (NCE ENVIO_INDETERMINADO ya reservada en la primera llamada)');
    UPDATE documentos_electronicos SET consulta_lease_hasta = NULL WHERE id = v_d2;
    UPDATE usuarios SET estado = 'BLOQUEADO' WHERE id = v_opw;
    SELECT o_actor INTO v_actor FROM fe_consulta_reservar(100, 120, ARRAY['NCE']) WHERE o_documento = v_d2;
    PERFORM pg_temp.ok(v_actor IS NOT NULL AND v_actor <> v_opw AND (SELECT estado = 'ACTIVO' FROM usuarios WHERE id = v_actor) AND usuario_tiene_permiso(v_a, v_actor, 'FACTURACION_ELECTRONICA', 'CREAR'), 'ZERO-01 W03: creador BLOQUEADO → se usa otro usuario ACTIVO autorizado de la empresa (nunca el inactivo)');
    PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM documentos_electronicos WHERE id = v_d2 AND estado_sifen = 'APROBADO'), 'el reservar no cambia el estado fiscal');
    UPDATE usuarios SET estado = 'ACTIVO' WHERE id = v_opw;
  END;

  -- ZERO-02 (F023): NCE en USD con el cambio ORIGINAL de la FE; dTotalGs = dTotGralOpe × dTiCam exacto
  DECLARE
    v_fx uuid; v_solx jsonb := v_sol || '{"cMoneOpe":"USD","dTiCam":7300}'::jsonb; v_pfx jsonb; r2 record;
  BEGIN
    INSERT INTO documentos_electronicos (empresa_id, sucursal_id, tipo, establecimiento, punto_expedicion, numero, cdc, fecha_emision, receptor_nombre, moneda, total, estado_local, estado_sifen, creado_por)
    VALUES (v_a, v_sa, 'FE', '001', '001', '0000010', '01' || '80000005' || '6' || '001' || '001' || '0000010' || '1' || '20261016' || '1' || '123456789' || '0', now(), 'Cliente T26', 'USD', 150, 'ENVIADO', 'APROBADO', v_ua) RETURNING id INTO v_fx;
    INSERT INTO documento_electronico_solicitudes (empresa_id, documento_id, version, payload, payload_hash, entrada_hash, creado_por)
    VALUES (v_a, v_fx, 1, v_solx, encode(sha256(convert_to(v_solx::text, 'UTF8')), 'hex'), encode(sha256(convert_to('fe-t26-usd', 'UTF8')), 'hex'), v_ua);
    v_pfx := jsonb_set(jsonb_set(jsonb_set(jsonb_set(pg_temp.pay(v_pay, v_solx, 3, 1, 0, 11), '{cMoneOpe}', '"USD"'), '{dTiCam}', '7300'), '{dCondTiCam}', '1'), '{DocumentosAsociados,0,dCdCDERef}', to_jsonb((SELECT cdc FROM documentos_electronicos WHERE id = v_fx)));
    v_pfx := jsonb_set(v_pfx, '{Subtotales,0,dTotalGs}', '80300');
    PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_nce(%L, %L, %L, %L, 'clave-t26-fx01', %L, 3, '[{"linea":1,"cantidad":0,"monto":11}]'::jsonb, 'USD', 11, %L)$f$, v_a, v_ua, v_sa, v_p, v_fx, jsonb_set(v_pfx, '{Subtotales,0,dTotalGs}', '80301')), 'P0001', 'ZERO-02 FX02: dTotalGs falsificado (+1) → NEX:PAYLOAD_INVALIDO');
    PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_nce(%L, %L, %L, %L, 'clave-t26-fx02', %L, 3, '[{"linea":1,"cantidad":0,"monto":11}]'::jsonb, 'USD', 11, %L)$f$, v_a, v_ua, v_sa, v_p, v_fx, v_pfx #- '{Subtotales,0,dTotalGs}'), 'P0001', 'ZERO-02 FX02: dTotalGs ausente → NEX:PAYLOAD_INVALIDO');
    PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_nce(%L, %L, %L, %L, 'clave-t26-fx03', %L, 3, '[{"linea":1,"cantidad":0,"monto":11}]'::jsonb, 'USD', 11, %L)$f$, v_a, v_ua, v_sa, v_p, v_fx, jsonb_set(v_pfx, '{dCondTiCam}', '2')), 'P0001', 'ZERO-02 FX03: dCondTiCam incompatible → NEX:PAYLOAD_INVALIDO');
    PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_nce(%L, %L, %L, %L, 'clave-t26-fx04', %L, 3, '[{"linea":1,"cantidad":0,"monto":11}]'::jsonb, 'USD', 11, %L)$f$, v_a, v_ua, v_sa, v_p, v_fx, jsonb_set(v_pfx, '{dTiCam}', '7301')), 'P0001', 'ZERO-02 FX03: cambio distinto del original de la FE → NEX:ASOCIACION_INVALIDA');
    PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_nce(%L, %L, %L, %L, 'clave-t26-fx05', %L, 3, '[{"linea":1,"cantidad":0,"monto":11}]'::jsonb, 'BRL', 11, %L)$f$, v_a, v_ua, v_sa, v_p, v_fx, v_pfx), 'P0001', 'ZERO-02: moneda distinta de la FE original → NEX:MONEDA_DISTINTA');
    SELECT * INTO r2 FROM fe_documento_crear_nce(v_a, v_ua, v_sa, v_p, 'clave-t26-fx06', v_fx, 3, '[{"linea":1,"cantidad":0,"monto":11}]'::jsonb, 'USD', 11, v_pfx);
    PERFORM pg_temp.ok(NOT r2.o_reutilizado AND (SELECT payload->'Subtotales'->0->>'dTotalGs' = '80300' AND payload->>'dTiCam' = '7300' FROM documento_electronico_solicitudes WHERE documento_id = r2.o_documento_id), 'ZERO-02 FX01: USD coherente (11 × 7300 = 80300) admitido y persistido con el cambio original');
  END;

  RAISE NOTICE 'T26 completada';
END $t$;
