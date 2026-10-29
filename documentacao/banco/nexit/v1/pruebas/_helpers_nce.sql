-- Ayudantes de las pruebas de NCE (T27/T28): payload NCE coherente con una FE original sintética. Se incluye con \i _helpers_nce.sql DESPUÉS de _helpers.sql; son funciones de la sesión (pg_temp).
-- Datos sintéticos; solo para bases descartables.
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

-- Solicitud (payload) de la FE original sintética: dos ítems (gravado 10 % y exento).
CREATE OR REPLACE FUNCTION pg_temp.sol_fe() RETURNS jsonb LANGUAGE sql AS $$
  SELECT '{"iTiDE":1,"dNomRec":"Cliente NCE","dRucRec":"80000009","iNatRec":1,"cMoneOpe":"PYG","dTiCam":null,"Detalles":[{"dCodInt":"P1","dGtin":null,"dDesProSer":"Gaseosa 2L","cUniMed":77,"dCantProSer":2,"dPUniProSer":50000,"dTotOpeItem":100000,"iAfecIVA":1,"dPropIVA":100,"dTasaIVA":10},{"dCodInt":"P2","dGtin":null,"dDesProSer":"Agua","cUniMed":77,"dCantProSer":10,"dPUniProSer":5000,"dTotOpeItem":50000,"iAfecIVA":3,"dPropIVA":0,"dTasaIVA":0}]}'::jsonb
$$;

-- Payload de una NCE (motivo 3, monto de la línea 1) que asocia el CDC de la FE original.
CREATE OR REPLACE FUNCTION pg_temp.nce_payload(p_cdc text, p_monto numeric) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.pay(jsonb_build_object('iTiDE', 5, 'iMotEmi', 3, 'dNomRec', 'Cliente NCE', 'dRucRec', '80000009', 'iNatRec', 1, 'cMoneOpe', 'PYG', 'dTiCam', NULL,
                                        'DocumentosAsociados', jsonb_build_array(jsonb_build_object('iTipDocAso', 1, 'dCdCDERef', p_cdc)), 'Subtotales', '[]'::jsonb, 'Detalles', '[]'::jsonb),
                     pg_temp.sol_fe(), 3, 1, 0, p_monto)
$$;

-- Inserta una FE original APROBADA (CDC coherente con su número) con su solicitud y devuelve su id y CDC.
CREATE OR REPLACE FUNCTION pg_temp.fe_aprobada(p_emp uuid, p_usr uuid, p_suc uuid, p_numero text, OUT o_id uuid, OUT o_cdc text) LANGUAGE plpgsql AS $$
BEGIN
  o_cdc := '01' || '80000005' || '6' || '001' || '001' || p_numero || '1' || '20261016' || '1' || '123456789' || '0';
  INSERT INTO documentos_electronicos (empresa_id, sucursal_id, tipo, establecimiento, punto_expedicion, numero, cdc, fecha_emision, receptor_nombre, moneda, total, estado_local, estado_sifen, creado_por)
  VALUES (p_emp, p_suc, 'FE', '001', '001', p_numero, o_cdc, now(), 'Cliente NCE', 'PYG', 150000, 'ENVIADO', 'APROBADO', p_usr) RETURNING id INTO o_id;
  INSERT INTO documento_electronico_solicitudes (empresa_id, documento_id, version, payload, payload_hash, entrada_hash, creado_por)
  VALUES (p_emp, o_id, 1, pg_temp.sol_fe(), encode(sha256(convert_to(pg_temp.sol_fe()::text, 'UTF8')), 'hex'), encode(sha256(convert_to('fe-nce-' || p_numero, 'UTF8')), 'hex'), p_usr);
END $$;
