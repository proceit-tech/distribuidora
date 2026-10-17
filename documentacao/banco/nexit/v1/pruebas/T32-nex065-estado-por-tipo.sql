-- T32 — NEX-065 (AUD-PRO129-UX-R04): el ESTADO DE EMISIÓN es POR TIPO. Identidad del documento = empresa + establecimiento + punto + serie + tipo + número; identidad de la secuencia y de su estado =
-- empresa + establecimiento + punto + TIPO. Secuencial (una sola sesión); la conversión de estados de la migración está en T33 y la concurrencia en T34. Base descartable; datos sintéticos.
-- NO es una prueba ejecutada por la IA: la corre el runner del responsable sobre una base descartable con NEX-001…065 aplicadas, NUNCA sobre el PostgreSQL operativo.
\i _helpers.sql
\i _helpers_nce.sql

DO $t$
DECLARE
  v_h text := crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12));
  v_a uuid; v_b uuid; v_ua uuid; v_ub uuid; v_sa uuid; v_sb uuid; v_op uuid; v_p uuid; v_pb uuid;
  v_fe record; v_n record; v_r record; v_antes jsonb; v_det text; v_cnt int;
  v_payload jsonb := '{"iTiDE": 1, "Subtotales": [{"dTotGralOpe": 1000}]}'::jsonb;
BEGIN
  v_a := nex_inicializar_empresa('emp-t32a', 'Empresa T32 A SA (prueba)', '8032101', '1', 'admin.t32a', 'Ana', 'A', NULL, v_h);
  v_b := nex_inicializar_empresa('emp-t32b', 'Empresa T32 B SA (prueba)', '8032102', '1', 'admin.t32b', 'Beto', 'B', NULL, v_h);
  SELECT id INTO v_ua FROM usuarios WHERE empresa_id = v_a;
  SELECT id INTO v_ub FROM usuarios WHERE empresa_id = v_b;
  SELECT id INTO v_sa FROM sucursales WHERE empresa_id = v_a ORDER BY creado_at, id LIMIT 1;
  SELECT id INTO v_sb FROM sucursales WHERE empresa_id = v_b ORDER BY creado_at, id LIMIT 1;
  UPDATE sucursales SET establecimiento_sifen = '001' WHERE id IN (v_sa, v_sb);

  -- Estado inicial: 001-001 con FE ACTIVA y NCE INACTIVA (alta única; el punto físico no tiene interruptor)
  SELECT o_punto INTO v_p FROM fe_punto_alta_tipo(v_a, v_ua, v_sa, '001', 'Caja 1', 'FE', NULL, 0, true, true);
  PERFORM fe_punto_alta_tipo(v_a, v_ua, v_sa, '001', 'Caja 1', 'NCE', 'AB', 55, true, false);
  PERFORM pg_temp.ok((SELECT activo FROM fe_punto_secuencias WHERE punto_id = v_p AND tipo_documento = 'FE') AND NOT (SELECT activo FROM fe_punto_secuencias WHERE punto_id = v_p AND tipo_documento = 'NCE'), 'precondición: FE activa y NCE inactiva en 001-001');
  PERFORM pg_temp.ok(NOT (SELECT activo FROM fe_puntos_expedicion WHERE id = v_p), 'el punto físico conserva su marca heredada (inactivo) y NO interviene: la compuerta es el tipo');

  -- T01/T02: FE activa permite emitir FE; NCE inactiva bloquea NCE
  SELECT * INTO v_r FROM fe_documento_crear_fe(v_a, v_ua, v_sa, v_p, 'clave-t32-0001', NULL, '1234567-1', 'Receptor T32', 'PYG', 1000, v_payload);
  PERFORM pg_temp.ok(v_r.o_numero = '0000001', 'FE activa, NCE inactiva: la FE emite (0000001)');
  SELECT * INTO v_fe FROM pg_temp.fe_aprobada(v_a, v_ua, v_sa, '0000090');
  v_det := NULL;
  BEGIN
    PERFORM * FROM fe_documento_crear_nce(v_a, v_ua, v_sa, v_p, 'clave-t32-nce-1', v_fe.o_id, 3, '[{"linea":1,"cantidad":0,"monto":30000}]'::jsonb, 'PYG', 30000, pg_temp.nce_payload(v_fe.o_cdc, 30000));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_det = PG_EXCEPTION_DETAIL;
  END;
  PERFORM pg_temp.ok(v_det = 'NEX:TIPO_INACTIVO' AND (SELECT ultimo_numero = 55 AND serie = 'AB' FROM fe_punto_secuencias WHERE punto_id = v_p AND tipo_documento = 'NCE'), 'FE activa, NCE inactiva: la NCE se bloquea (NEX:TIPO_INACTIVO) sin consumir número');

  -- Activar NCE no altera FE
  v_antes := (SELECT to_jsonb(q) - 'actualizado_at' FROM fe_punto_secuencias q WHERE punto_id = v_p AND tipo_documento = 'FE');
  PERFORM fe_secuencia_estado(v_a, v_ua, v_p, 'NCE', true);
  PERFORM pg_temp.ok((SELECT to_jsonb(q) - 'actualizado_at' FROM fe_punto_secuencias q WHERE punto_id = v_p AND tipo_documento = 'FE') = v_antes, 'activar NCE: la FE (estado, serie y número) quedó exactamente igual');
  SELECT * INTO v_n FROM fe_documento_crear_nce(v_a, v_ua, v_sa, v_p, 'clave-t32-nce-2', v_fe.o_id, 3, '[{"linea":1,"cantidad":0,"monto":30000}]'::jsonb, 'PYG', 30000, pg_temp.nce_payload(v_fe.o_cdc, 30000));
  PERFORM pg_temp.ok(v_n.o_numero = '0000056' AND (SELECT serie = 'AB' AND numero = '0000056' FROM documentos_electronicos WHERE id = v_n.o_documento_id), 'NCE activa: emite con SU serie y SU contador (AB-0000056)');

  -- Desactivar FE: la NCE permanece activa; reactivar FE es independiente
  v_antes := (SELECT to_jsonb(q) - 'actualizado_at' FROM fe_punto_secuencias q WHERE punto_id = v_p AND tipo_documento = 'NCE');
  PERFORM fe_secuencia_estado(v_a, v_ua, v_p, 'FE', false);
  PERFORM pg_temp.ok((SELECT to_jsonb(q) - 'actualizado_at' FROM fe_punto_secuencias q WHERE punto_id = v_p AND tipo_documento = 'NCE') = v_antes AND (SELECT activo FROM fe_punto_secuencias WHERE punto_id = v_p AND tipo_documento = 'NCE'), 'desactivar FE: la NCE permanece activa e intacta');
  v_det := NULL;
  BEGIN
    PERFORM * FROM fe_documento_crear_fe(v_a, v_ua, v_sa, v_p, 'clave-t32-0002', NULL, '1234567-1', 'Receptor T32', 'PYG', 1000, v_payload);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_det = PG_EXCEPTION_DETAIL;
  END;
  PERFORM pg_temp.ok(v_det = 'NEX:TIPO_INACTIVO' AND (SELECT ultimo_numero = 1 FROM fe_punto_secuencias WHERE punto_id = v_p AND tipo_documento = 'FE'), 'FE inactiva: bloquea la FE (sin consumir) mientras la NCE sigue disponible');
  UPDATE documentos_electronicos SET estado_sifen = 'RECHAZADO' WHERE id = v_n.o_documento_id;
  SELECT * INTO v_n FROM fe_documento_crear_nce(v_a, v_ua, v_sa, v_p, 'clave-t32-nce-3', v_fe.o_id, 3, '[{"linea":1,"cantidad":0,"monto":30000}]'::jsonb, 'PYG', 30000, pg_temp.nce_payload(v_fe.o_cdc, 30000));
  PERFORM pg_temp.ok(v_n.o_numero = '0000057', 'con la FE desactivada la NCE sigue emitiendo (AB-0000057)');
  PERFORM fe_secuencia_estado(v_a, v_ua, v_p, 'FE', true);
  SELECT * INTO v_r FROM fe_documento_crear_fe(v_a, v_ua, v_sa, v_p, 'clave-t32-0003', NULL, '1234567-1', 'Receptor T32', 'PYG', 1000, v_payload);
  PERFORM pg_temp.ok(v_r.o_numero = '0000002', 'reactivar la FE es independiente: continúa en 0000002');

  -- Alta de otro tipo con «activar» NO reactiva otros tipos del mismo punto
  PERFORM fe_secuencia_estado(v_a, v_ua, v_p, 'FE', false);
  PERFORM fe_secuencia_estado(v_a, v_ua, v_p, 'NCE', false);
  PERFORM fe_punto_alta_tipo(v_a, v_ua, v_sa, '001', 'ignorado', 'NRE', NULL, 0, true, true);
  PERFORM pg_temp.ok(NOT (SELECT activo FROM fe_punto_secuencias WHERE punto_id = v_p AND tipo_documento = 'FE') AND NOT (SELECT activo FROM fe_punto_secuencias WHERE punto_id = v_p AND tipo_documento = 'NCE'),
    'NEX-064→065: el alta de NRE con activar NO reactiva FE ni NCE (sin efecto colateral)');

  -- Interruptor del punto físico RETIRADO (llamada directa): ni activa ni desactiva nada
  v_antes := (SELECT jsonb_agg(to_jsonb(q) - 'actualizado_at' ORDER BY tipo_documento) FROM fe_punto_secuencias q WHERE punto_id = v_p);
  PERFORM pg_temp.falla(format('SELECT fe_punto_estado(%L, %L, %L, true)', v_a, v_ua, v_p), 'P0001', 'fe_punto_estado(true) está RETIRADA');
  PERFORM pg_temp.falla(format('SELECT fe_punto_estado(%L, %L, %L, false)', v_a, v_ua, v_p), 'P0001', 'fe_punto_estado(false) está RETIRADA');
  PERFORM pg_temp.ok((SELECT jsonb_agg(to_jsonb(q) - 'actualizado_at' ORDER BY tipo_documento) FROM fe_punto_secuencias q WHERE punto_id = v_p) = v_antes AND NOT (SELECT activo FROM fe_puntos_expedicion WHERE id = v_p), 'la llamada directa no cambió ningún tipo ni el punto');
  PERFORM pg_temp.ok(NOT has_function_privilege('nexit_runtime', 'public.fe_punto_estado(uuid,uuid,uuid,boolean)', 'EXECUTE') AND NOT has_function_privilege('nexit_runtime', 'public.fe_punto_activar(uuid,uuid,uuid,integer,boolean)', 'EXECUTE') AND NOT has_function_privilege('nexit_runtime', 'public.fe_punto_desactivar(uuid,uuid,uuid)', 'EXECUTE'),
    'el rol de la aplicación no puede ejecutar las funciones que mueven el estado físico del punto');
  -- AUD-PRO129-UX-R05-01: el envoltorio global (el que el runner ejecuta tras CADA migración) reejecuta TODOS los ayudantes nex_aplicar_grants_*; no debe reabrir las funciones retiradas
  PERFORM nex_aplicar_grants_runtime();
  PERFORM pg_temp.ok(NOT has_function_privilege('nexit_runtime', 'public.fe_punto_registrar(uuid,uuid,uuid,text,text)', 'EXECUTE') AND NOT has_function_privilege('nexit_runtime', 'public.fe_punto_estado(uuid,uuid,uuid,boolean)', 'EXECUTE')
    AND NOT has_function_privilege('nexit_runtime', 'public.fe_punto_crear(uuid,uuid,uuid,text,text,integer,boolean)', 'EXECUTE') AND NOT has_function_privilege('nexit_runtime', 'public.fe_punto_activar(uuid,uuid,uuid,integer,boolean)', 'EXECUTE')
    AND NOT has_function_privilege('nexit_runtime', 'public.fe_punto_desactivar(uuid,uuid,uuid)', 'EXECUTE'), 'tras nex_aplicar_grants_runtime() siguen SIN acceso para la aplicación: registrar, estado, crear, activar y desactivar del punto físico');
  PERFORM pg_temp.ok(has_function_privilege('nexit_runtime', 'public.fe_punto_alta_tipo(uuid,uuid,uuid,text,text,text,text,integer,boolean,boolean)', 'EXECUTE') AND has_function_privilege('nexit_runtime', 'public.fe_secuencia_configurar(uuid,uuid,uuid,text,text,integer,boolean,boolean)', 'EXECUTE')
    AND has_function_privilege('nexit_runtime', 'public.fe_secuencia_estado(uuid,uuid,uuid,text,boolean)', 'EXECUTE') AND has_function_privilege('nexit_runtime', 'public.fe_documento_crear_fe(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb)', 'EXECUTE')
    AND has_function_privilege('nexit_runtime', 'public.fe_documento_crear_nce(uuid,uuid,uuid,uuid,text,uuid,integer,jsonb,text,numeric,jsonb)', 'EXECUTE'), 'tras el envoltorio global se conservan alta única, configuración y estado por tipo, y emisión FE/NCE');

  -- T03: misma empresa/establecimiento/punto con series y números distintos; unicidad fiscal COMPLETA con serie NULL
  PERFORM fe_secuencia_estado(v_a, v_ua, v_p, 'FE', true);
  PERFORM fe_secuencia_configurar(v_a, v_ua, v_p, 'FE', 'AA', 9999999, true, false);
  SELECT * INTO v_r FROM fe_documento_crear_fe(v_a, v_ua, v_sa, v_p, 'clave-t32-0004', NULL, '1234567-1', 'Receptor T32', 'PYG', 1000, v_payload);
  PERFORM pg_temp.ok((SELECT serie = 'AB' AND numero = '0000001' FROM documentos_electronicos WHERE id = v_r.o_documento_id), 'FE pasa de AA-9999999 a AB-0000001 sin tocar la NCE (AB-0000057)');
  PERFORM pg_temp.ok((SELECT count(*) = 1 FROM documentos_electronicos WHERE empresa_id = v_a AND tipo = 'FE' AND numero = '0000001' AND serie IS NULL) AND (SELECT count(*) = 1 FROM documentos_electronicos WHERE empresa_id = v_a AND tipo = 'FE' AND numero = '0000001' AND serie = 'AB'),
    'el 0000001 sin serie y el AB-0000001 de la misma identidad de punto coexisten');
  v_det := NULL;
  BEGIN
    INSERT INTO documentos_electronicos (empresa_id, sucursal_id, tipo, establecimiento, punto_expedicion, numero, serie, fecha_emision, receptor_nombre, moneda, total, estado_local, estado_sifen, creado_por)
    VALUES (v_a, v_sa, 'FE', '001', '001', '0000001', NULL, now(), 'Duplicado sin serie', 'PYG', 1, 'ENVIADO', 'APROBADO', v_ua);
  EXCEPTION WHEN unique_violation THEN
    v_det := 'unique';
  END;
  PERFORM pg_temp.ok(v_det = 'unique', 'identidad fiscal completa: dos FE 001-001-0000001 SIN serie (NULL) violan la unicidad (el índice trata NULL como valor)');
  v_det := NULL;
  BEGIN
    INSERT INTO documentos_electronicos (empresa_id, sucursal_id, tipo, establecimiento, punto_expedicion, numero, serie, fecha_emision, receptor_nombre, moneda, total, estado_local, estado_sifen, creado_por)
    VALUES (v_a, v_sa, 'FE', '001', '001', '0000001', 'AB', now(), 'Duplicado con serie', 'PYG', 1, 'ENVIADO', 'APROBADO', v_ua);
  EXCEPTION WHEN unique_violation THEN
    v_det := 'unique';
  END;
  PERFORM pg_temp.ok(v_det = 'unique', 'dos FE 001-001-AB-0000001 también violan la unicidad');
  INSERT INTO documentos_electronicos (empresa_id, sucursal_id, tipo, establecimiento, punto_expedicion, numero, serie, fecha_emision, receptor_nombre, moneda, total, estado_local, estado_sifen, creado_por)
  VALUES (v_a, v_sa, 'NCE', '001', '001', '0000001', NULL, now(), 'Otro tipo mismo número', 'PYG', 1, 'ENVIADO', 'APROBADO', v_ua);
  PERFORM pg_temp.ok(true, 'el mismo número 0000001 sin serie en OTRO tipo (NCE) es válido (el tipo forma parte de la identidad)');

  -- Aislamiento multiempresa y permisos
  SELECT o_punto INTO v_pb FROM fe_punto_alta_tipo(v_b, v_ub, v_sb, '001', 'Caja B', 'FE', NULL, 7, true, true);
  PERFORM pg_temp.falla(format('SELECT fe_secuencia_estado(%L, %L, %L, ''FE'', false)', v_b, v_ub, v_p), 'P0001', 'aislamiento: la empresa B no cambia el estado de un tipo de un punto de A');
  PERFORM pg_temp.ok((SELECT activo FROM fe_punto_secuencias WHERE punto_id = v_p AND tipo_documento = 'FE') AND (SELECT ultimo_numero = 7 FROM fe_punto_secuencias WHERE punto_id = v_pb AND tipo_documento = 'FE'), 'las dos empresas con 001-001 FE tienen estado y contador independientes');
  INSERT INTO usuarios (empresa_id, usuario, nombre, password_hash) VALUES (v_a, 'op.t32', 'Operador sin PUNTOS', v_h) RETURNING id INTO v_op;
  PERFORM pg_temp.falla(format('SELECT fe_secuencia_estado(%L, %L, %L, ''FE'', false)', v_a, v_op, v_p), '42501', 'sin PUNTOS no se cambia el estado de un tipo');
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_fe(%L, %L, %L, %L, 'clave-t32-x', NULL, '1234567-1', 'Receptor T32', 'PYG', 1000, %L)$f$, v_b, v_ub, v_sb, v_p, v_payload::text), 'P0001', 'aislamiento: la empresa B no emite con el punto de A');

  RAISE NOTICE 'T32 completada';
END $t$;
