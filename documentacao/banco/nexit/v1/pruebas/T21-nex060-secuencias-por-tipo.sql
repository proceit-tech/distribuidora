-- T21 — NEX-060 (PRO-131, AUD-FISC P0): secuencia fiscal independiente por tipo de documento (empresa + establecimiento + punto + tipo). Cubre T-F01…T-F05, T-F08, T-F09, T-F14, T-F15, T-F16 y T-F22 de la
-- especificación AUD-FISC-2026-10-15 que corresponden al P0 (la emisión de NCE/NDE/NRE/AFE NO existe: las secuencias de esos tipos se prueban a nivel de datos). Base descartable; datos sintéticos.
\i _helpers.sql

DO $t$
DECLARE
  v_h text := crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12));
  v_a uuid; v_b uuid; v_m uuid; v_ua uuid; v_ub uuid; v_um uuid; v_sa uuid; v_sb uuid; v_sm uuid; v_sm2 uuid;
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_pm1 uuid; v_pm2 uuid; v_n int; v_antes text; v_det text; v_sx uuid; v_px uuid; v_pm3 uuid; v_pm4 uuid; v_doc uuid; v_ult text;
  v_payload jsonb := '{"iTiDE": 1, "Subtotales": [{"dTotGralOpe": 1000}]}'::jsonb;
  r record;
BEGIN
  v_a := nex_inicializar_empresa('emp-t21a', 'Empresa T21 A SA (prueba)', '8021101', '1', 'admin.t21a', 'Ana', 'A', NULL, v_h);
  v_b := nex_inicializar_empresa('emp-t21b', 'Empresa T21 B SA (prueba)', '8021102', '1', 'admin.t21b', 'Beto', 'B', NULL, v_h);
  v_m := nex_inicializar_empresa('emp-t21m', 'Empresa T21 M SA (prueba)', '8021103', '1', 'admin.t21m', 'Mia', 'M', NULL, v_h);
  SELECT id INTO v_ua FROM usuarios WHERE empresa_id = v_a;
  SELECT id INTO v_ub FROM usuarios WHERE empresa_id = v_b;
  SELECT id INTO v_um FROM usuarios WHERE empresa_id = v_m;
  SELECT id INTO v_sa FROM sucursales WHERE empresa_id = v_a ORDER BY creado_at, id LIMIT 1;
  SELECT id INTO v_sb FROM sucursales WHERE empresa_id = v_b ORDER BY creado_at, id LIMIT 1;
  SELECT id INTO v_sm FROM sucursales WHERE empresa_id = v_m ORDER BY creado_at, id LIMIT 1;
  UPDATE sucursales SET establecimiento_sifen = '001' WHERE id IN (v_sa, v_sb);
  UPDATE sucursales SET establecimiento_sifen = '040' WHERE id = v_sm;

  -- Estructura y privilegios
  PERFORM pg_temp.ok(to_regclass('public.fe_punto_secuencias') IS NOT NULL AND to_regprocedure('public.fe_punto_maximo_emitido(uuid,text,text,text)') IS NOT NULL, 'NEX-060: existen fe_punto_secuencias y fe_punto_maximo_emitido con tipo');
  PERFORM pg_temp.ok(has_table_privilege('nexit_runtime', 'public.fe_punto_secuencias', 'SELECT') AND NOT has_table_privilege('nexit_runtime', 'public.fe_punto_secuencias', 'INSERT')
    AND NOT has_table_privilege('nexit_runtime', 'public.fe_punto_secuencias', 'UPDATE') AND NOT has_table_privilege('nexit_runtime', 'public.fe_punto_secuencias', 'DELETE'), 'grants: la aplicación solo LEE las secuencias; las escriben las funciones SECURITY DEFINER');
  PERFORM pg_temp.ok(NOT has_function_privilege('nexit_runtime', 'public.fe_secuencias_conciliar_legado(uuid)', 'EXECUTE') AND NOT has_function_privilege('nexit_runtime', 'public.fe_punto_maximo_emitido(uuid,text,text,text)', 'EXECUTE')
    AND has_function_privilege('nexit_runtime', 'public.fe_documento_crear_fe(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb)', 'EXECUTE')
    AND has_function_privilege('nexit_runtime', 'public.fe_punto_crear(uuid,uuid,uuid,text,text,integer,boolean)', 'EXECUTE'), 'grants: el rol de la aplicación no ejecuta la conciliación ni el máximo; conserva la emisión y la gestión de puntos');
  PERFORM pg_temp.falla($f$INSERT INTO fe_punto_secuencias (empresa_id, punto_id, tipo_documento, ultimo_numero, origen) VALUES (gen_random_uuid(), gen_random_uuid(), 'XX', 0, 'CARGA_MANUAL')$f$, '23514', 'solo los cinco tipos conocidos (FE, NCE, NDE, NRE, AFE)');

  -- T-F01: punto creado: su secuencia FE es la informada y confirmada; ningún otro tipo nace configurado (ni en cero)
  v_p1 := fe_punto_crear(v_a, v_ua, v_sa, '001', 'Caja 1', 120, true);
  PERFORM pg_temp.ok((SELECT count(*) = 1 AND bool_and(tipo_documento = 'FE' AND ultimo_numero = 120 AND origen = 'ALTA_PUNTO') FROM fe_punto_secuencias WHERE punto_id = v_p1), 'T-F01: el alta crea SOLO la secuencia FE con el número informado; NCE/NDE/NRE/AFE no existen ni en cero');
  PERFORM pg_temp.ok((SELECT ultimo_numero = 0 FROM fe_puntos_expedicion WHERE id = v_p1), 'el contador legado del punto nace en 0 y queda congelado (la numeración vive en la secuencia)');
  PERFORM pg_temp.ok((SELECT (nuevo->>'tipo_documento') = 'FE' AND (nuevo->>'ultimo_numero')::int = 120 FROM fe_puntos_expedicion_log WHERE punto_id = v_p1 AND accion = 'CREAR'), 'bitácora: el alta registra el tipo y el número');
  PERFORM fe_punto_activar(v_a, v_ua, v_p1, 120, true);

  -- T-F04: ya hay FE 0000126 persistido por Nexit → no se puede reconfirmar la secuencia FE con un número menor (se prueba tras emitir más abajo); aquí, emisión FE normal
  SELECT * INTO r FROM fe_documento_crear_fe(v_a, v_ua, v_sa, v_p1, 'clave-t21-0001', NULL, '1234567-1', 'Receptor T21', 'PYG', 1000, v_payload);
  PERFORM pg_temp.ok(r.o_numero = '0000121' AND NOT r.o_reutilizado AND (SELECT ultimo_numero = 121 FROM fe_punto_secuencias WHERE punto_id = v_p1 AND tipo_documento = 'FE'), 'la factura toma 0000121 de la secuencia FE (120 + 1)');
  PERFORM pg_temp.ok((SELECT tipo = 'FE' AND numero = '0000121' AND establecimiento = '001' AND punto_expedicion = '001' FROM documentos_electronicos WHERE empresa_id = v_a AND clave_idempotencia = 'clave-t21-0001')
    AND (SELECT ultimo_numero = 0 FROM fe_puntos_expedicion WHERE id = v_p1), 'el documento FE queda con su número y el contador legado NO se escribe (un solo escritor)');

  -- T-F08 / T-F09: idempotencia intacta (no consume secuencia)
  SELECT * INTO r FROM fe_documento_crear_fe(v_a, v_ua, v_sa, v_p1, 'clave-t21-0001', NULL, '1234567-1', 'Receptor T21', 'PYG', 1000, v_payload);
  PERFORM pg_temp.ok(r.o_reutilizado AND r.o_numero = '0000121' AND (SELECT ultimo_numero = 121 FROM fe_punto_secuencias WHERE punto_id = v_p1 AND tipo_documento = 'FE'), 'T-F08: la misma clave y contenido devuelve el mismo documento y número sin consumir la secuencia');
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_fe(%L, %L, %L, %L, 'clave-t21-0001', NULL, '1234567-1', 'Receptor T21', 'PYG', 2000, %L)$f$, v_a, v_ua, v_sa, v_p1, '{"iTiDE": 1, "Subtotales": [{"dTotGralOpe": 2000}]}'), 'P0001', 'T-F09: la misma clave con otro contenido se rechaza');
  PERFORM pg_temp.ok((SELECT ultimo_numero = 121 FROM fe_punto_secuencias WHERE punto_id = v_p1 AND tipo_documento = 'FE') AND (SELECT count(*) = 1 FROM documentos_electronicos WHERE empresa_id = v_a), 'T-F09: el conflicto no creó documento ni consumió número');

  -- T-F02 / T-F05: NCE con su PROPIA secuencia (último 0 confirmado) en el mismo establecimiento/punto: no hereda el 121 de FE y coexiste con el mismo número
  PERFORM pg_temp.ok(fe_punto_maximo_emitido(v_a, '001', '001', 'FE') = 121 AND fe_punto_maximo_emitido(v_a, '001', '001', 'NCE') = 0, 'T-F05: el máximo emitido es por tipo: FE 121, NCE 0 (FE no fuerza al NCE)');
  INSERT INTO fe_punto_secuencias (empresa_id, punto_id, tipo_documento, ultimo_numero, origen) VALUES (v_a, v_p1, 'NCE', 0, 'CARGA_MANUAL');
  SELECT * INTO r FROM fe_documento_crear_fe(v_a, v_ua, v_sa, v_p1, 'clave-t21-0002', NULL, '1234567-1', 'Receptor T21', 'PYG', 1000, v_payload);
  PERFORM pg_temp.ok(r.o_numero = '0000122' AND (SELECT ultimo_numero = 0 FROM fe_punto_secuencias WHERE punto_id = v_p1 AND tipo_documento = 'NCE'), 'T-F02: la emisión FE avanza a 0000122 y NO altera la secuencia NCE (0)');
  UPDATE fe_punto_secuencias SET ultimo_numero = 1 WHERE punto_id = v_p1 AND tipo_documento = 'NCE';
  PERFORM pg_temp.ok((SELECT ultimo_numero = 122 FROM fe_punto_secuencias WHERE punto_id = v_p1 AND tipo_documento = 'FE') AND (SELECT ultimo_numero = 1 FROM fe_punto_secuencias WHERE punto_id = v_p1 AND tipo_documento = 'NCE'), 'contadores independientes: avanzar NCE no mueve FE');
  INSERT INTO documentos_electronicos (empresa_id, sucursal_id, tipo, establecimiento, punto_expedicion, numero, fecha_emision, receptor_nombre, moneda, total, estado_local, estado_sifen, creado_por)
  VALUES (v_a, v_sa, 'NCE', '001', '001', '0000001', now(), 'Receptor NCE T21', 'PYG', 1000, 'PENDIENTE_ENVIO', 'SIN_CONSULTA', v_ua);
  PERFORM pg_temp.ok(fe_punto_maximo_emitido(v_a, '001', '001', 'NCE') = 1 AND fe_punto_maximo_emitido(v_a, '001', '001', 'FE') = 122, 'un NCE 0000001 coexiste con FE 0000001…0000122 de la misma identidad 001-001 (unicidad de NEX-047 incluye el tipo)');
  -- T-F04: no se puede reactivar FE con un número menor al ya emitido de ESE tipo; NCE no cuenta
  PERFORM fe_punto_desactivar(v_a, v_ua, v_p1);
  PERFORM pg_temp.falla(format('SELECT fe_punto_activar(%L, %L, %L, 121, true)', v_a, v_ua, v_p1), 'P0001', 'T-F04: reactivar FE con 121 (< 122 ya emitido) se rechaza');
  PERFORM pg_temp.ok((SELECT ultimo_numero = 122 FROM fe_punto_secuencias WHERE punto_id = v_p1 AND tipo_documento = 'FE') AND (SELECT NOT activo FROM fe_puntos_expedicion WHERE id = v_p1), 'T-F04: el rechazo no alteró secuencia ni estado');
  PERFORM fe_secuencia_estado(v_a, v_ua, v_p1, 'FE', false);   -- NEX-065: el bloqueo de emisión es el del TIPO FE
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_fe(%L, %L, %L, %L, 'clave-t21-0003', NULL, '1234567-1', 'Receptor T21', 'PYG', 1000, %L)$f$, v_a, v_ua, v_sa, v_p1, v_payload::text), 'P0001', 'un punto inactivo no numera');
  PERFORM fe_secuencia_estado(v_a, v_ua, v_p1, 'FE', true);
  PERFORM fe_punto_activar(v_a, v_ua, v_p1, 122, true);
  PERFORM pg_temp.ok((SELECT activo FROM fe_puntos_expedicion WHERE id = v_p1) AND (SELECT ultimo_numero = 122 FROM fe_punto_secuencias WHERE punto_id = v_p1 AND tipo_documento = 'FE'), 'reactivar confirmando 122 mantiene FE en 122');
  SELECT (anterior->>'ultimo_numero') || '>' || (nuevo->>'ultimo_numero') INTO v_ult FROM fe_puntos_expedicion_log WHERE punto_id = v_p1 AND accion = 'ACTIVAR' ORDER BY creado_at DESC, id LIMIT 1;
  PERFORM pg_temp.ok(v_ult = '122>122', 'bitácora ACTIVAR: registra el número de la secuencia FE');

  -- T-F01: punto cargado a mano SIN secuencia: no numera (no se presume cero); la activación confirmada crea su secuencia FE
  INSERT INTO fe_puntos_expedicion (empresa_id, sucursal_id, codigo, nombre, activo) VALUES (v_a, v_sa, '002', 'Manual sin secuencia', true) RETURNING id INTO v_p2;
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_fe(%L, %L, %L, %L, 'clave-t21-0004', NULL, '1234567-1', 'Receptor T21', 'PYG', 1000, %L)$f$, v_a, v_ua, v_sa, v_p2, v_payload::text), 'P0001', 'T-F01: un punto sin secuencia FE no numera');
  v_det := NULL;
  BEGIN
    PERFORM * FROM fe_documento_crear_fe(v_a, v_ua, v_sa, v_p2, 'clave-t21-0004', NULL, '1234567-1', 'Receptor T21', 'PYG', 1000, v_payload);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_det = PG_EXCEPTION_DETAIL;
  END;
  PERFORM pg_temp.ok(v_det = 'NEX:SECUENCIA_NO_CONFIGURADA' AND NOT EXISTS (SELECT 1 FROM fe_punto_secuencias WHERE punto_id = v_p2) AND (SELECT count(*) = 2 FROM documentos_electronicos WHERE empresa_id = v_a AND tipo = 'FE'), 'T-F01: error NEX:SECUENCIA_NO_CONFIGURADA, sin secuencia presumida y sin consumir número ni crear documento');

  -- Inmutabilidad de la secuencia y congelamiento del legado
  PERFORM pg_temp.falla(format($f$UPDATE fe_punto_secuencias SET ultimo_numero = 5 WHERE punto_id = %L AND tipo_documento = 'FE'$f$, v_p1), 'P0001', 'la secuencia nunca retrocede');
  PERFORM pg_temp.falla(format($f$UPDATE fe_punto_secuencias SET tipo_documento = 'NDE' WHERE punto_id = %L AND tipo_documento = 'NCE'$f$, v_p1), 'P0001', 'el tipo de una secuencia es inmutable');
  PERFORM pg_temp.falla(format($f$DELETE FROM fe_punto_secuencias WHERE punto_id = %L AND tipo_documento = 'NCE'$f$, v_p1), 'P0001', 'una secuencia no se elimina');
  PERFORM pg_temp.falla('TRUNCATE fe_punto_secuencias', 'P0001', 'una secuencia no se vacía');
  PERFORM pg_temp.falla(format('UPDATE fe_puntos_expedicion SET ultimo_numero = 999 WHERE id = %L', v_p1), 'P0001', 'el contador legado está congelado (ni sube ni baja)');
  PERFORM pg_temp.ok((SELECT count(*) = 1 FROM fe_punto_secuencias WHERE punto_id = v_p1 AND tipo_documento = 'NCE'), 'los rechazos no alteraron las secuencias');

  -- T-F16: la identidad fiscal duplicada entre sucursales sigue protegida (NEX-057/059)
  INSERT INTO sucursales (empresa_id, codigo, nombre, establecimiento_sifen) VALUES (v_a, 'S2-T21', 'Sucursal 2 T21', '001') RETURNING id INTO v_sm2;
  PERFORM pg_temp.falla(format('SELECT fe_punto_crear(%L, %L, %L, %L, %L, 0, true)', v_a, v_ua, v_sm2, '001', 'Duplicado'), 'P0001', 'T-F16: otro punto con la misma identidad (001-001) en otra sucursal se rechaza');

  -- Aislamiento multiempresa: el usuario de B no emite sobre un punto de A
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_fe(%L, %L, %L, %L, 'clave-t21-0005', NULL, '1234567-1', 'Receptor T21', 'PYG', 1000, %L)$f$, v_b, v_ub, v_sb, v_p1, v_payload::text), 'P0001', 'aislamiento: la empresa B no emite con el punto de la A');
  v_p3 := fe_punto_crear(v_b, v_ub, v_sb, '001', 'Caja B', 0, true);
  PERFORM fe_punto_activar(v_b, v_ub, v_p3, 0, true);
  SELECT * INTO r FROM fe_documento_crear_fe(v_b, v_ub, v_sb, v_p3, 'clave-t21-0006', NULL, '1234567-1', 'Receptor T21', 'PYG', 1000, v_payload);
  PERFORM pg_temp.ok(r.o_numero = '0000001' AND (SELECT ultimo_numero = 122 FROM fe_punto_secuencias WHERE punto_id = v_p1 AND tipo_documento = 'FE'), 'aislamiento: la empresa B (mismo 001-001) numera su propia secuencia desde 0000001 sin tocar la de A; 0 vale porque se informó y confirmó');

  -- T-F14 / T-F15 / T-F22: migración del legado (empresa M): conciliar → FE hereda el contador SOLO si es coherente con los documentos; otros tipos NO se configuran
  INSERT INTO fe_puntos_expedicion (empresa_id, sucursal_id, codigo, nombre, ultimo_numero, activo) VALUES (v_m, v_sm, '001', 'Legado M1', 120, false) RETURNING id INTO v_pm1;
  INSERT INTO fe_puntos_expedicion (empresa_id, sucursal_id, codigo, nombre, ultimo_numero, activo) VALUES (v_m, v_sm, '002', 'Legado M2', 120, false) RETURNING id INTO v_pm2;
  INSERT INTO documentos_electronicos (empresa_id, sucursal_id, tipo, establecimiento, punto_expedicion, numero, fecha_emision, receptor_nombre, moneda, total, estado_local, estado_sifen, creado_por)
  VALUES (v_m, v_sm, 'FE', '040', '001', '0000115', now(), 'Receptor legado', 'PYG', 1000, 'PENDIENTE_ENVIO', 'SIN_CONSULTA', v_um),
         (v_m, v_sm, 'FE', '040', '002', '0000126', now(), 'Receptor legado', 'PYG', 1000, 'PENDIENTE_ENVIO', 'SIN_CONSULTA', v_um);
  SELECT md5(string_agg(d::text, '|' ORDER BY d.id)) INTO v_antes FROM documentos_electronicos d WHERE empresa_id = v_m;
  PERFORM pg_temp.falla(format('SELECT fe_secuencias_conciliar_legado(%L)', v_m), 'P0001', 'T-F15: FE 0000126 registrado con contador legado 120 → la migración ABORTA y exige conciliación');
  v_det := NULL;
  BEGIN
    PERFORM fe_secuencias_conciliar_legado(v_m);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_det = PG_EXCEPTION_DETAIL;
  END;
  PERFORM pg_temp.ok(v_det = 'NEX:LEGADO_INCONSISTENTE' AND NOT EXISTS (SELECT 1 FROM fe_punto_secuencias WHERE empresa_id = v_m), 'T-F15: aborto atómico (NEX:LEGADO_INCONSISTENTE): ni siquiera el punto coherente recibió secuencia');
  -- Conciliación manual del responsable del punto inconsistente (informa y confirma 126, nunca 121 por suposición) y recién entonces migra el resto
  INSERT INTO fe_punto_secuencias (empresa_id, punto_id, tipo_documento, ultimo_numero, origen) VALUES (v_m, v_pm2, 'FE', 126, 'CARGA_MANUAL');
  v_n := fe_secuencias_conciliar_legado(v_m);
  PERFORM pg_temp.ok(v_n = 1 AND (SELECT ultimo_numero = 120 AND origen = 'MIGRACION_NEX060' FROM fe_punto_secuencias WHERE punto_id = v_pm1 AND tipo_documento = 'FE')
    AND (SELECT ultimo_numero = 126 AND origen = 'CARGA_MANUAL' FROM fe_punto_secuencias WHERE punto_id = v_pm2 AND tipo_documento = 'FE'), 'T-F14: el punto coherente hereda FE 120; el conciliado a mano conserva 126; no se tocó ninguno ya configurado');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM fe_punto_secuencias WHERE empresa_id = v_m AND tipo_documento <> 'FE'), 'T-F14: NCE/NDE/NRE/AFE NO se crean ni copian el valor de FE: quedan no configuradas');
  PERFORM pg_temp.ok(fe_secuencias_conciliar_legado(v_m) = 0, 'la conciliación es idempotente (segunda ejecución: 0 filas)');
  PERFORM pg_temp.ok((SELECT md5(string_agg(d::text, '|' ORDER BY d.id)) FROM documentos_electronicos d WHERE empresa_id = v_m) = v_antes, 'T-F22: los documentos (tipo, número, CDC, estados, payload de la fila) son idénticos antes y después de migrar');
  PERFORM fe_punto_activar(v_m, v_um, v_pm1, 120, true);
  SELECT * INTO r FROM fe_documento_crear_fe(v_m, v_um, v_sm, v_pm1, 'clave-t21-0007', NULL, '1234567-1', 'Receptor T21', 'PYG', 1000, v_payload);
  PERFORM pg_temp.ok(r.o_numero = '0000121', 'tras migrar, el punto legado continúa en 0000121 (120 + 1) sin saltos ni colisiones');

  -- R01-02: sin secuencia FE el piso es el contador legado del punto (no 0 ni solo el máximo FE registrado)
  INSERT INTO fe_puntos_expedicion (empresa_id, sucursal_id, codigo, nombre, ultimo_numero, activo) VALUES (v_m, v_sm, '003', 'Legado M3', 300, false) RETURNING id INTO v_pm3;
  INSERT INTO documentos_electronicos (empresa_id, sucursal_id, tipo, establecimiento, punto_expedicion, numero, fecha_emision, receptor_nombre, moneda, total, estado_local, estado_sifen, creado_por)
  VALUES (v_m, v_sm, 'FE', '040', '003', '0000200', now(), 'Receptor legado', 'PYG', 1000, 'PENDIENTE_ENVIO', 'SIN_CONSULTA', v_um);
  PERFORM pg_temp.falla(format('SELECT fe_punto_activar(%L, %L, %L, 250, true)', v_m, v_um, v_pm3), 'P0001', 'R01-02: contador legado 300, FE registrado 200: confirmar 250 (>= 200) se rechaza por retroceder respecto del legado');
  PERFORM pg_temp.falla(format('SELECT fe_punto_activar(%L, %L, %L, 0, true)', v_m, v_um, v_pm3), 'P0001', 'R01-02: confirmar 0 se rechaza');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM fe_punto_secuencias WHERE punto_id = v_pm3) AND (SELECT NOT activo FROM fe_puntos_expedicion WHERE id = v_pm3), 'R01-02: los rechazos no crearon secuencia ni activaron el punto');
  PERFORM fe_punto_activar(v_m, v_um, v_pm3, 300, true);
  PERFORM pg_temp.ok((SELECT ultimo_numero = 300 AND origen = 'ACTIVACION_PUNTO' FROM fe_punto_secuencias WHERE punto_id = v_pm3 AND tipo_documento = 'FE'), 'R01-02: confirmando 300 (= legado) se crea la secuencia FE en 300');
  -- R01-01: el cero solo existe si alguien lo informa y confirma; la ausencia de secuencia no es 0
  INSERT INTO fe_puntos_expedicion (empresa_id, sucursal_id, codigo, nombre, activo) VALUES (v_m, v_sm, '004', 'Manual M4', false) RETURNING id INTO v_pm4;
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM fe_punto_secuencias WHERE punto_id = v_pm4), 'R01-01: un punto sin secuencia FE no tiene fila (no hay 0 presumido ni confirmado)');
  PERFORM pg_temp.falla(format('SELECT fe_punto_activar(%L, %L, %L, 0, false)', v_m, v_um, v_pm4), 'P0001', 'R01-01: activar sin confirmación expresa se rechaza aunque el número sea 0');
  PERFORM fe_punto_activar(v_m, v_um, v_pm4, 0, true);
  SELECT * INTO r FROM fe_documento_crear_fe(v_m, v_um, v_sm, v_pm4, 'clave-t21-0009', NULL, '1234567-1', 'Receptor T21', 'PYG', 1000, v_payload);
  PERFORM pg_temp.ok(r.o_numero = '0000001' AND (SELECT origen = 'ACTIVACION_PUNTO' FROM fe_punto_secuencias WHERE punto_id = v_pm4 AND tipo_documento = 'FE'), 'R01-01: informando y confirmando 0 expresamente el primer FE es 0000001');

  -- R01-05: FE 0000001 y NCE 0000001 en la MISMA empresa, establecimiento y punto (identidad completa), ambos persistidos sin conflicto de unicidad
  INSERT INTO sucursales (empresa_id, codigo, nombre, establecimiento_sifen) VALUES (v_a, 'S50-T21', 'Sucursal 50 T21', '050') RETURNING id INTO v_sx;
  v_px := fe_punto_crear(v_a, v_ua, v_sx, '001', 'Caja 50', 0, true);
  PERFORM fe_punto_activar(v_a, v_ua, v_px, 0, true);
  SELECT * INTO r FROM fe_documento_crear_fe(v_a, v_ua, v_sx, v_px, 'clave-t21-0008', NULL, '1234567-1', 'Receptor T21', 'PYG', 1000, v_payload);
  INSERT INTO fe_punto_secuencias (empresa_id, punto_id, tipo_documento, ultimo_numero, origen) VALUES (v_a, v_px, 'NCE', 0, 'CARGA_MANUAL');
  UPDATE fe_punto_secuencias SET ultimo_numero = 1 WHERE punto_id = v_px AND tipo_documento = 'NCE';
  INSERT INTO documentos_electronicos (empresa_id, sucursal_id, tipo, establecimiento, punto_expedicion, numero, fecha_emision, receptor_nombre, moneda, total, estado_local, estado_sifen, creado_por)
  VALUES (v_a, v_sx, 'NCE', '050', '001', '0000001', now(), 'Receptor NCE T21', 'PYG', 1000, 'PENDIENTE_ENVIO', 'SIN_CONSULTA', v_ua);
  PERFORM pg_temp.ok(r.o_numero = '0000001' AND (SELECT count(*) = 2 AND count(DISTINCT tipo) = 2 FROM documentos_electronicos WHERE empresa_id = v_a AND establecimiento = '050' AND punto_expedicion = '001' AND numero = '0000001')
    AND (SELECT string_agg(tipo_documento || '=' || ultimo_numero, ',' ORDER BY tipo_documento) = 'FE=1,NCE=1' FROM fe_punto_secuencias WHERE punto_id = v_px), 'R01-05: FE 0000001 y NCE 0000001 coexisten en la misma empresa + establecimiento 050 + punto 001, con sus secuencias FE=1 y NCE=1');

  RAISE NOTICE 'PASS: T21 completa';
END $t$;
