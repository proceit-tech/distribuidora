-- T30 — NEX-064 (AUD-PRO129-UX-R01-01): ALTA FISCAL ÚNICA punto + tipo en una transacción. Secuencial (una sola sesión); la carrera con dos sesiones está en T31. Base descartable; datos sintéticos.
-- NO es una prueba ejecutada por la IA: la corre el runner del responsable sobre una base descartable con NEX-001…064 aplicadas, NUNCA sobre el PostgreSQL operativo.
\i _helpers.sql

DO $t$
DECLARE
  v_h text := crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12));
  v_a uuid; v_b uuid; v_ua uuid; v_ub uuid; v_sa uuid; v_sa2 uuid; v_sb uuid; v_op uuid;
  v_p uuid; v_p2 uuid; r record; v_n int; v_antes jsonb;
BEGIN
  v_a := nex_inicializar_empresa('emp-t30a', 'Empresa T30 A SA (prueba)', '8030101', '1', 'admin.t30a', 'Ana', 'A', NULL, v_h);
  v_b := nex_inicializar_empresa('emp-t30b', 'Empresa T30 B SA (prueba)', '8030102', '1', 'admin.t30b', 'Beto', 'B', NULL, v_h);
  SELECT id INTO v_ua FROM usuarios WHERE empresa_id = v_a;
  SELECT id INTO v_ub FROM usuarios WHERE empresa_id = v_b;
  SELECT id INTO v_sa FROM sucursales WHERE empresa_id = v_a ORDER BY creado_at, id LIMIT 1;
  SELECT id INTO v_sb FROM sucursales WHERE empresa_id = v_b ORDER BY creado_at, id LIMIT 1;
  UPDATE sucursales SET establecimiento_sifen = '001' WHERE id IN (v_sa, v_sb);
  INSERT INTO sucursales (empresa_id, codigo, nombre, establecimiento_sifen) VALUES (v_a, 'S2-T30', 'Sucursal 2 T30', '002') RETURNING id INTO v_sa2;

  PERFORM pg_temp.ok(to_regprocedure('public.fe_punto_alta_tipo(uuid,uuid,uuid,text,text,text,text,integer,boolean,boolean)') IS NOT NULL AND has_function_privilege('nexit_runtime', 'public.fe_punto_alta_tipo(uuid,uuid,uuid,text,text,text,text,integer,boolean,boolean)', 'EXECUTE'), 'NEX-064: existe fe_punto_alta_tipo y la aplicación puede ejecutarla');

  -- P2: punto NUEVO + primer tipo en una llamada: queda el punto (con su nombre) y UNA configuración; activar deja punto y tipo activos
  SELECT * INTO r FROM fe_punto_alta_tipo(v_a, v_ua, v_sa, '001', 'Caja 1', 'FE', NULL, 0, true, true);
  v_p := r.o_punto;
  PERFORM pg_temp.ok(r.o_punto_creado AND (SELECT nombre = 'Caja 1' AND activo FROM fe_puntos_expedicion WHERE id = v_p) AND (SELECT count(*) = 1 AND bool_and(tipo_documento = 'FE' AND serie IS NULL AND ultimo_numero = 0 AND activo) FROM fe_punto_secuencias WHERE punto_id = v_p), 'P2: punto nuevo + FE en una sola operación, activos y sin serie (sin etapa intermedia)');

  -- P1: 001-001 con FE existente: alta de NCE reutiliza el punto administrativo, conserva el nombre y NO toca la secuencia FE
  UPDATE fe_punto_secuencias SET ultimo_numero = 120 WHERE punto_id = v_p AND tipo_documento = 'FE';
  v_antes := (SELECT to_jsonb(q) - 'actualizado_at' FROM fe_punto_secuencias q WHERE punto_id = v_p AND tipo_documento = 'FE');
  SELECT * INTO r FROM fe_punto_alta_tipo(v_a, v_ua, v_sa, '001', 'Otro nombre ignorado', 'NCE', 'AB', 55, true, true);
  PERFORM pg_temp.ok(r.o_punto = v_p AND NOT r.o_punto_creado AND (SELECT count(*) = 1 FROM fe_puntos_expedicion WHERE empresa_id = v_a AND sucursal_id = v_sa AND codigo = '001') AND (SELECT nombre = 'Caja 1' FROM fe_puntos_expedicion WHERE id = v_p),
    'P1: la NCE reutiliza el punto 001-001 (sin duplicado físico) y conserva su nombre administrativo');
  PERFORM pg_temp.ok((SELECT to_jsonb(q) - 'actualizado_at' FROM fe_punto_secuencias q WHERE punto_id = v_p AND tipo_documento = 'FE') = v_antes, 'P1: la secuencia FE (serie, último número, estado) quedó exactamente igual');
  PERFORM pg_temp.ok((SELECT serie = 'AB' AND ultimo_numero = 55 AND activo FROM fe_punto_secuencias WHERE punto_id = v_p AND tipo_documento = 'NCE'), 'P1: la NCE tiene su propia serie y último número');

  -- P3: tipo ya configurado: duplicidad del TIPO (no del punto), sin escribir nada ni reiniciar
  v_antes := (SELECT jsonb_agg(to_jsonb(q) - 'actualizado_at' ORDER BY tipo_documento) FROM fe_punto_secuencias q WHERE punto_id = v_p);
  SELECT count(*) INTO v_n FROM fe_puntos_expedicion_log WHERE punto_id = v_p;
  PERFORM pg_temp.falla(format('SELECT * FROM fe_punto_alta_tipo(%L, %L, %L, ''001'', ''Caja 1'', ''FE'', NULL, 0, true, false)', v_a, v_ua, v_sa), 'P0001', 'P3: la repetición del tipo FE se rechaza');
  PERFORM pg_temp.ok((SELECT jsonb_agg(to_jsonb(q) - 'actualizado_at' ORDER BY tipo_documento) FROM fe_punto_secuencias q WHERE punto_id = v_p) = v_antes AND (SELECT count(*) = v_n FROM fe_puntos_expedicion_log WHERE punto_id = v_p), 'P3: FE y NCE quedaron intactas (sin reinicio de serie/contador) y sin registros nuevos en la bitácora');
  DECLARE v_det text; BEGIN
    BEGIN
      PERFORM * FROM fe_punto_alta_tipo(v_a, v_ua, v_sa, '001', 'Caja 1', 'FE', NULL, 0, true, false);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_det = PG_EXCEPTION_DETAIL;
    END;
    PERFORM pg_temp.ok(v_det = 'NEX:TIPO_DUPLICADO', 'P3: el error es NEX:TIPO_DUPLICADO (duplicidad del TIPO, no del punto)');
  END;

  -- P2b: nuevo 001-002-NRE: alta transaccional punto + NRE; configurable pero sin función de emisión
  SELECT * INTO r FROM fe_punto_alta_tipo(v_a, v_ua, v_sa, '002', 'Remisiones', 'NRE', NULL, 0, true, false);
  v_p2 := r.o_punto;
  PERFORM pg_temp.ok(r.o_punto_creado AND (SELECT NOT activo FROM fe_puntos_expedicion WHERE id = v_p2) AND (SELECT NOT activo AND tipo_documento = 'NRE' FROM fe_punto_secuencias WHERE punto_id = v_p2) AND to_regprocedure('public.fe_documento_crear_nre()') IS NULL,
    'P2: 001-002-NRE se crea punto + tipo en una operación, inactivo (activar es opcional) y sin flujo de emisión NRE');

  -- Mismo tipo en otra empresa / otro establecimiento: independientes
  PERFORM fe_punto_alta_tipo(v_b, v_ub, v_sb, '001', 'Caja B', 'FE', NULL, 7, true, true);
  PERFORM fe_punto_alta_tipo(v_a, v_ua, v_sa2, '001', 'Caja Suc 2', 'FE', NULL, 0, true, true);
  PERFORM pg_temp.ok((SELECT ultimo_numero = 7 FROM fe_punto_secuencias s JOIN fe_puntos_expedicion p ON p.id = s.punto_id WHERE p.empresa_id = v_b AND s.tipo_documento = 'FE') AND (SELECT ultimo_numero = 120 FROM fe_punto_secuencias WHERE punto_id = v_p AND tipo_documento = 'FE')
    AND (SELECT count(*) = 2 FROM fe_puntos_expedicion WHERE empresa_id = v_a AND codigo = '001'), 'P4: la misma combinación en otra empresa / otro establecimiento es independiente');
  -- P4b: misma identidad física en otra sucursal del MISMO establecimiento: se rechaza (no se registra punto conflictivo)
  INSERT INTO sucursales (empresa_id, codigo, nombre, establecimiento_sifen) VALUES (v_a, 'S3-T30', 'Sucursal 3 T30', '001');
  SELECT count(*) INTO v_n FROM fe_puntos_expedicion WHERE empresa_id = v_a;
  PERFORM pg_temp.falla(format('SELECT * FROM fe_punto_alta_tipo(%L, %L, %L, ''001'', ''Conflicto'', ''FE'', NULL, 0, true, false)', v_a, v_ua, (SELECT id FROM sucursales WHERE empresa_id = v_a AND codigo = 'S3-T30')), 'P0001', 'P4: la identidad fiscal 001/001 ya usada en otra sucursal se rechaza');
  PERFORM pg_temp.ok((SELECT count(*) = v_n FROM fe_puntos_expedicion WHERE empresa_id = v_a), 'P4: no quedó ningún punto conflictivo');

  -- P5: rollback de la operación incompleta: el punto se registraría bien, pero la configuración falla (serie inválida / número fuera de rango / sin confirmación): NO queda punto vacío
  SELECT count(*) INTO v_n FROM fe_puntos_expedicion WHERE empresa_id = v_a;
  PERFORM pg_temp.falla(format('SELECT * FROM fe_punto_alta_tipo(%L, %L, %L, ''003'', ''Falla serie'', ''FE'', ''A1'', 0, true, true)', v_a, v_ua, v_sa), 'P0001', 'P5: serie inválida → se rechaza TODA la operación');
  PERFORM pg_temp.falla(format('SELECT * FROM fe_punto_alta_tipo(%L, %L, %L, ''003'', ''Falla numero'', ''FE'', NULL, 10000000, true, true)', v_a, v_ua, v_sa), 'P0001', 'P5: número fuera de rango → se rechaza TODA la operación');
  PERFORM pg_temp.falla(format('SELECT * FROM fe_punto_alta_tipo(%L, %L, %L, ''003'', ''Falla confirmacion'', ''FE'', NULL, 0, false, true)', v_a, v_ua, v_sa), 'P0001', 'P5: sin confirmación → se rechaza TODA la operación');
  PERFORM pg_temp.falla(format('SELECT * FROM fe_punto_alta_tipo(%L, %L, %L, ''003'', ''Falla tipo'', ''XX'', NULL, 0, true, true)', v_a, v_ua, v_sa), 'P0001', 'P5: tipo desconocido → se rechaza TODA la operación');
  PERFORM pg_temp.ok((SELECT count(*) = v_n FROM fe_puntos_expedicion WHERE empresa_id = v_a) AND NOT EXISTS (SELECT 1 FROM fe_puntos_expedicion WHERE empresa_id = v_a AND codigo = '003') AND NOT EXISTS (SELECT 1 FROM fe_puntos_expedicion_log l JOIN fe_puntos_expedicion x ON x.id = l.punto_id WHERE x.codigo = '003'),
    'P5: ningún punto 003 huérfano ni registro de bitácora tras las operaciones incompletas (rollback atómico)');

  -- Permisos y alcance
  INSERT INTO usuarios (empresa_id, usuario, nombre, password_hash) VALUES (v_a, 'op.t30', 'Operador sin PUNTOS', v_h) RETURNING id INTO v_op;
  PERFORM pg_temp.falla(format('SELECT * FROM fe_punto_alta_tipo(%L, %L, %L, ''004'', ''X'', ''FE'', NULL, 0, true, false)', v_a, v_op, v_sa), '42501', 'sin PUNTOS no se da de alta');
  PERFORM pg_temp.falla(format('SELECT * FROM fe_punto_alta_tipo(%L, %L, %L, ''004'', ''X'', ''FE'', NULL, 0, true, false)', v_b, v_ub, v_sa), 'P0001', 'aislamiento: la empresa B no da de alta sobre una sucursal de A');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM fe_puntos_expedicion WHERE codigo = '004'), 'los rechazos por permiso/aislamiento no crearon puntos');

  -- Numeración fiscal independiente y emisión: FE y NCE del mismo punto siguen cada una en su secuencia (la FE avanza, la NCE no)
  SELECT * INTO r FROM fe_documento_crear_fe(v_a, v_ua, v_sa, v_p, 'clave-t30-0001', NULL, '1234567-1', 'Receptor T30', 'PYG', 1000, '{"iTiDE": 1, "Subtotales": [{"dTotGralOpe": 1000}]}'::jsonb);
  PERFORM pg_temp.ok(r.o_numero = '0000121' AND (SELECT ultimo_numero = 55 AND serie = 'AB' FROM fe_punto_secuencias WHERE punto_id = v_p AND tipo_documento = 'NCE'), 'la FE toma 0000121 de su secuencia y la NCE del mismo punto no se altera');

  RAISE NOTICE 'T30 completada';
END $t$;
