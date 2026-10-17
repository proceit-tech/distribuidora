-- T27 — NEX-063: puntos con CONFIGURACIÓN POR TIPO DOCUMENTAL, SERIE SIFEN (sin serie → AA…ZZ) y paso atómico entre series (DECISION-PUNTOS-TIPOS-SERIES-2026-10-17, CA-PUN-01…08).
-- Secuencial (una sola sesión); la carrera con dos sesiones está en T28. Base descartable; datos sintéticos. NO es una prueba ejecutada por la IA: la corre el runner del responsable sobre una
-- base descartable con NEX-001…063 aplicadas, NUNCA sobre el PostgreSQL operativo.
\i _helpers.sql
\i _helpers_nce.sql

DO $t$
DECLARE
  v_h text := crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12));
  v_a uuid; v_b uuid; v_ua uuid; v_ub uuid; v_sa uuid; v_sa2 uuid; v_sb uuid; v_op uuid;
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_pb uuid; v_perf uuid;
  v_payload jsonb := '{"iTiDE": 1, "Subtotales": [{"dTotGralOpe": 1000}]}'::jsonb;
  r record; v_det text; v_n int;
BEGIN
  v_a := nex_inicializar_empresa('emp-t27a', 'Empresa T27 A SA (prueba)', '8027101', '1', 'admin.t27a', 'Ana', 'A', NULL, v_h);
  v_b := nex_inicializar_empresa('emp-t27b', 'Empresa T27 B SA (prueba)', '8027102', '1', 'admin.t27b', 'Beto', 'B', NULL, v_h);
  SELECT id INTO v_ua FROM usuarios WHERE empresa_id = v_a;
  SELECT id INTO v_ub FROM usuarios WHERE empresa_id = v_b;
  SELECT id INTO v_sa FROM sucursales WHERE empresa_id = v_a ORDER BY creado_at, id LIMIT 1;
  SELECT id INTO v_sb FROM sucursales WHERE empresa_id = v_b ORDER BY creado_at, id LIMIT 1;
  UPDATE sucursales SET establecimiento_sifen = '001' WHERE id IN (v_sa, v_sb);
  INSERT INTO sucursales (empresa_id, codigo, nombre, establecimiento_sifen) VALUES (v_a, 'S2-T27', 'Sucursal 2 T27', '002') RETURNING id INTO v_sa2;

  -- Estructura y privilegios
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fe_punto_secuencias' AND column_name = 'serie') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fe_punto_secuencias' AND column_name = 'activo'), 'NEX-063: fe_punto_secuencias.serie y .activo existen');
  PERFORM pg_temp.ok(has_function_privilege('nexit_runtime', 'public.fe_secuencia_configurar(uuid,uuid,uuid,text,text,integer,boolean,boolean)', 'EXECUTE') AND has_function_privilege('nexit_runtime', 'public.fe_punto_registrar(uuid,uuid,uuid,text,text)', 'EXECUTE')
    AND NOT has_function_privilege('nexit_runtime', 'public.fe_secuencia_reservar(uuid,uuid,text)', 'EXECUTE'), 'grants: la aplicación ejecuta la administración y NO la reserva interna');

  -- CA-02: tabla de paso entre series (espejo de lib/facturacion/series.ts)
  PERFORM pg_temp.ok((SELECT o_serie IS NULL AND o_numero = 9999999 FROM fe_secuencia_siguiente(NULL, 9999998)), 'sin serie 9999998 → 9999999 (sin serie)');
  PERFORM pg_temp.ok((SELECT o_serie = 'AA' AND o_numero = 1 FROM fe_secuencia_siguiente(NULL, 9999999)), 'sin serie 9999999 → AA-0000001');
  PERFORM pg_temp.ok((SELECT o_serie = 'AB' AND o_numero = 1 FROM fe_secuencia_siguiente('AA', 9999999)), 'AA 9999999 → AB-0000001');
  PERFORM pg_temp.ok((SELECT o_serie = 'BA' AND o_numero = 1 FROM fe_secuencia_siguiente('AZ', 9999999)), 'AZ 9999999 → BA-0000001');
  PERFORM pg_temp.ok((SELECT o_serie = 'ZZ' AND o_numero = 1 FROM fe_secuencia_siguiente('ZY', 9999999)), 'ZY 9999999 → ZZ-0000001');
  PERFORM pg_temp.ok((SELECT o_serie IS NULL AND o_numero IS NULL FROM fe_secuencia_siguiente('ZZ', 9999999)), 'ZZ 9999999 → agotada (nunca reinicia)');
  PERFORM pg_temp.ok((SELECT o_serie = 'AC' AND o_numero = 6 FROM fe_secuencia_siguiente('AC', 5)), 'dentro de la serie solo avanza el número');

  -- CA-01 / CA-04: un punto se registra UNA vez, nace inactivo y SIN tipos; cada tipo es una configuración independiente
  v_p1 := fe_punto_registrar(v_a, v_ua, v_sa, '001', 'Caja 1');
  PERFORM pg_temp.ok(NOT (SELECT activo FROM fe_puntos_expedicion WHERE id = v_p1) AND NOT EXISTS (SELECT 1 FROM fe_punto_secuencias WHERE punto_id = v_p1), 'CA-04: el punto nace inactivo y sin ningún tipo (no hay FE implícito)');
  PERFORM pg_temp.falla(format('SELECT fe_secuencia_configurar(%L, %L, %L, ''FE'', NULL, 0, false)', v_a, v_ua, v_p1), 'P0001', 'CA-04: configurar sin confirmación expresa se rechaza');
  PERFORM pg_temp.falla(format('SELECT fe_secuencia_configurar(%L, %L, %L, ''XX'', NULL, 0, true)', v_a, v_ua, v_p1), 'P0001', 'tipo desconocido se rechaza');
  PERFORM pg_temp.falla(format('SELECT fe_secuencia_configurar(%L, %L, %L, ''FE'', ''A1'', 0, true)', v_a, v_ua, v_p1), 'P0001', 'serie inválida se rechaza');
  PERFORM fe_secuencia_configurar(v_a, v_ua, v_p1, 'FE', NULL, 0, true, true);
  PERFORM fe_secuencia_configurar(v_a, v_ua, v_p1, 'NCE', NULL, 0, true, true);
  PERFORM fe_secuencia_configurar(v_a, v_ua, v_p1, 'NRE', NULL, 0, true, false);
  PERFORM pg_temp.ok((SELECT count(*) = 3 FROM fe_punto_secuencias WHERE punto_id = v_p1 AND serie IS NULL AND ultimo_numero = 0), 'CA-01: FE, NCE y NRE del mismo punto 001/001, cada uno sin serie y en 0 (independientes)');
  PERFORM pg_temp.ok((SELECT activo FROM fe_punto_secuencias WHERE punto_id = v_p1 AND tipo_documento = 'FE') AND (SELECT activo FROM fe_punto_secuencias WHERE punto_id = v_p1 AND tipo_documento = 'NCE') AND NOT (SELECT activo FROM fe_punto_secuencias WHERE punto_id = v_p1 AND tipo_documento = 'NRE'), 'activar un tipo no activa los demás (NRE quedó inactivo)');
  PERFORM fe_punto_estado(v_a, v_ua, v_p1, true);
  PERFORM pg_temp.ok((SELECT activo FROM fe_puntos_expedicion WHERE id = v_p1), 'el punto se activa sin volver a pedir números');
  -- otro punto del mismo establecimiento, y otro establecimiento: contadores independientes
  v_p2 := fe_punto_registrar(v_a, v_ua, v_sa, '002', 'Caja 2');
  PERFORM fe_secuencia_configurar(v_a, v_ua, v_p2, 'NRE', NULL, 0, true, true);
  v_p3 := fe_punto_registrar(v_a, v_ua, v_sa2, '001', 'Caja Suc 2');
  PERFORM fe_secuencia_configurar(v_a, v_ua, v_p3, 'FE', NULL, 0, true, true);
  PERFORM fe_secuencia_configurar(v_a, v_ua, v_p3, 'NCE', NULL, 0, true, true);
  PERFORM fe_punto_estado(v_a, v_ua, v_p3, true);
  -- empresa B: mismas identidades sin compartir numeración
  v_pb := fe_punto_registrar(v_b, v_ub, v_sb, '001', 'Caja B');
  PERFORM fe_secuencia_configurar(v_b, v_ub, v_pb, 'FE', NULL, 7, true, true);
  PERFORM fe_punto_estado(v_b, v_ub, v_pb, true);
  PERFORM pg_temp.ok((SELECT ultimo_numero = 7 FROM fe_punto_secuencias WHERE punto_id = v_pb AND tipo_documento = 'FE') AND (SELECT ultimo_numero = 0 FROM fe_punto_secuencias WHERE punto_id = v_p1 AND tipo_documento = 'FE'), 'CA-01: la empresa B usa 001/001 con su propia numeración (7) sin tocar la de A (0)');

  -- Emisión FE: primera numeración sin serie; la FE no consume NCE ni NRE
  SELECT * INTO r FROM fe_documento_crear_fe(v_a, v_ua, v_sa, v_p1, 'clave-t27-0001', NULL, '1234567-1', 'Receptor T27', 'PYG', 1000, v_payload);
  PERFORM pg_temp.ok(r.o_numero = '0000001' AND (SELECT serie IS NULL FROM documentos_electronicos WHERE id = r.o_documento_id) AND (SELECT payload->>'dSerieNum' IS NULL FROM documento_electronico_solicitudes WHERE documento_id = r.o_documento_id), 'CA-01/03: la primera FE es 0000001 SIN serie (documento y payload sin dSerieNum)');
  PERFORM pg_temp.ok((SELECT ultimo_numero = 0 FROM fe_punto_secuencias WHERE punto_id = v_p1 AND tipo_documento = 'NCE') AND (SELECT ultimo_numero = 0 FROM fe_punto_secuencias WHERE punto_id = v_p1 AND tipo_documento = 'NRE'), 'CA-06: la FE no consumió NCE ni NRE');
  -- idempotencia: la repetición no consume
  SELECT * INTO r FROM fe_documento_crear_fe(v_a, v_ua, v_sa, v_p1, 'clave-t27-0001', NULL, '1234567-1', 'Receptor T27', 'PYG', 1000, v_payload);
  PERFORM pg_temp.ok(r.o_reutilizado AND (SELECT ultimo_numero = 1 FROM fe_punto_secuencias WHERE punto_id = v_p1 AND tipo_documento = 'FE'), 'idempotencia intacta: la repetición no consume número');

  -- CA-02: 9999998 → 9999999 → AA-0000001; AA 9999999 → AB-0000001; AZ → BA; ZY → ZZ; ZZ → bloqueado
  PERFORM fe_secuencia_configurar(v_a, v_ua, v_p1, 'FE', NULL, 9999998, true, false);
  SELECT * INTO r FROM fe_documento_crear_fe(v_a, v_ua, v_sa, v_p1, 'clave-t27-0002', NULL, '1234567-1', 'Receptor T27', 'PYG', 1000, v_payload);
  PERFORM pg_temp.ok(r.o_numero = '9999999' AND (SELECT serie IS NULL FROM documentos_electronicos WHERE id = r.o_documento_id), 'CA-02: 9999998 → 9999999 sin serie (valor final válido, no se trunca)');
  SELECT * INTO r FROM fe_documento_crear_fe(v_a, v_ua, v_sa, v_p1, 'clave-t27-0003', NULL, '1234567-1', 'Receptor T27', 'PYG', 1000, v_payload);
  PERFORM pg_temp.ok(r.o_numero = '0000001' AND (SELECT serie = 'AA' FROM documentos_electronicos WHERE id = r.o_documento_id) AND (SELECT payload->>'dSerieNum' = 'AA' FROM documento_electronico_solicitudes WHERE documento_id = r.o_documento_id)
    AND (SELECT serie = 'AA' AND ultimo_numero = 1 FROM fe_punto_secuencias WHERE punto_id = v_p1 AND tipo_documento = 'FE'), 'CA-02/03: agotado 9999999 sin serie, la siguiente es AA-0000001 (documento, payload dSerieNum y secuencia)');
  PERFORM pg_temp.ok((SELECT count(*) = 2 FROM documentos_electronicos WHERE empresa_id = v_a AND tipo = 'FE' AND numero = '0000001'), 'el 0000001 sin serie y el AA-0000001 coexisten (el índice único incluye la serie): sin colisión');
  PERFORM fe_secuencia_configurar(v_a, v_ua, v_p1, 'FE', 'AA', 9999999, true, false);
  SELECT * INTO r FROM fe_documento_crear_fe(v_a, v_ua, v_sa, v_p1, 'clave-t27-0004', NULL, '1234567-1', 'Receptor T27', 'PYG', 1000, v_payload);
  PERFORM pg_temp.ok((SELECT serie = 'AB' AND numero = '0000001' FROM documentos_electronicos WHERE id = r.o_documento_id), 'CA-02: AA 9999999 → AB-0000001');
  PERFORM fe_secuencia_configurar(v_a, v_ua, v_p1, 'FE', 'AZ', 9999999, true, false);
  SELECT * INTO r FROM fe_documento_crear_fe(v_a, v_ua, v_sa, v_p1, 'clave-t27-0005', NULL, '1234567-1', 'Receptor T27', 'PYG', 1000, v_payload);
  PERFORM pg_temp.ok((SELECT serie = 'BA' AND numero = '0000001' FROM documentos_electronicos WHERE id = r.o_documento_id), 'CA-02: AZ 9999999 → BA-0000001');
  PERFORM fe_secuencia_configurar(v_a, v_ua, v_p1, 'FE', 'ZY', 9999999, true, false);
  SELECT * INTO r FROM fe_documento_crear_fe(v_a, v_ua, v_sa, v_p1, 'clave-t27-0006', NULL, '1234567-1', 'Receptor T27', 'PYG', 1000, v_payload);
  PERFORM pg_temp.ok((SELECT serie = 'ZZ' AND numero = '0000001' FROM documentos_electronicos WHERE id = r.o_documento_id), 'CA-02: ZY 9999999 → ZZ-0000001');
  PERFORM fe_secuencia_configurar(v_a, v_ua, v_p1, 'FE', 'ZZ', 9999999, true, false);
  v_det := NULL;
  BEGIN
    PERFORM * FROM fe_documento_crear_fe(v_a, v_ua, v_sa, v_p1, 'clave-t27-0007', NULL, '1234567-1', 'Receptor T27', 'PYG', 1000, v_payload);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_det = PG_EXCEPTION_DETAIL;
  END;
  PERFORM pg_temp.ok(v_det = 'NEX:NUMERACION_AGOTADA' AND (SELECT serie = 'ZZ' AND ultimo_numero = 9999999 FROM fe_punto_secuencias WHERE punto_id = v_p1 AND tipo_documento = 'FE')
    AND NOT EXISTS (SELECT 1 FROM documentos_electronicos WHERE clave_idempotencia = 'clave-t27-0007'), 'CA-02: ZZ-9999999 detiene con NEX:NUMERACION_AGOTADA sin consumir ni reiniciar');

  -- La numeración nunca retrocede (ni de serie ni de número); el rechazo no altera nada
  PERFORM pg_temp.falla(format('SELECT fe_secuencia_configurar(%L, %L, %L, ''FE'', ''AA'', 5, true)', v_a, v_ua, v_p1), 'P0001', 'retroceder de serie (ZZ → AA) se rechaza');
  PERFORM pg_temp.falla(format($f$UPDATE fe_punto_secuencias SET serie = 'AA' WHERE punto_id = %L AND tipo_documento = 'FE'$f$, v_p1), 'P0001', 'el trigger impide bajar la serie por otra vía');
  PERFORM fe_secuencia_configurar(v_a, v_ua, v_p1, 'NCE', NULL, 0, true, false);
  PERFORM pg_temp.ok((SELECT ultimo_numero = 0 AND serie IS NULL FROM fe_punto_secuencias WHERE punto_id = v_p1 AND tipo_documento = 'NCE'), 'reconfirmar el mismo valor (NCE en 0) es válido y no cambia nada');

  -- CA-06: FE y NCE usan SOLO su configuración; un tipo inactivo no emite (y no consume); desactivar no pierde serie ni número
  PERFORM fe_secuencia_configurar(v_a, v_ua, v_p3, 'FE', NULL, 0, true, false);
  PERFORM fe_secuencia_estado(v_a, v_ua, v_p3, 'FE', false);
  v_det := NULL;
  BEGIN
    PERFORM * FROM fe_documento_crear_fe(v_a, v_ua, v_sa2, v_p3, 'clave-t27-0008', NULL, '1234567-1', 'Receptor T27', 'PYG', 1000, v_payload);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_det = PG_EXCEPTION_DETAIL;
  END;
  PERFORM pg_temp.ok(v_det = 'NEX:TIPO_INACTIVO' AND (SELECT ultimo_numero = 0 AND NOT activo FROM fe_punto_secuencias WHERE punto_id = v_p3 AND tipo_documento = 'FE') AND (SELECT activo FROM fe_punto_secuencias WHERE punto_id = v_p3 AND tipo_documento = 'NCE'),
    'CA-06: la FE inactiva en el punto no emite (NEX:TIPO_INACTIVO), no consume número y la NCE del mismo punto sigue activa');
  PERFORM pg_temp.falla(format('SELECT fe_secuencia_estado(%L, %L, %L, ''FE'', false)', v_a, v_ua, v_p3), 'P0001', 'desactivar un tipo ya inactivo se rechaza');
  PERFORM fe_secuencia_estado(v_a, v_ua, v_p3, 'FE', true);
  SELECT * INTO r FROM fe_documento_crear_fe(v_a, v_ua, v_sa2, v_p3, 'clave-t27-0009', NULL, '1234567-1', 'Receptor T27', 'PYG', 1000, v_payload);
  PERFORM pg_temp.ok(r.o_numero = '0000001', 'CA-01: est.002/punto001 FE inicia independiente en 0000001 (la FE de est.001 ya iba en la serie ZZ)');
  PERFORM fe_punto_estado(v_a, v_ua, v_p3, false);
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_fe(%L, %L, %L, %L, 'clave-t27-0010', NULL, '1234567-1', 'Receptor T27', 'PYG', 1000, %L)$f$, v_a, v_ua, v_sa2, v_p3, v_payload::text), 'P0001', 'un punto inactivo no emite ningún tipo');
  PERFORM pg_temp.ok((SELECT count(*) = 2 FROM fe_punto_secuencias WHERE punto_id = v_p3), 'desactivar el punto conserva todas sus configuraciones');
  PERFORM fe_punto_estado(v_a, v_ua, v_p3, true);

  -- CA-08: NRE/NDE/AFE se configuran pero no existe función de emisión que los consuma
  PERFORM pg_temp.ok((SELECT ultimo_numero = 0 FROM fe_punto_secuencias WHERE punto_id = v_p2 AND tipo_documento = 'NRE') AND to_regprocedure('public.fe_documento_crear_nre()') IS NULL, 'CA-08: la NRE está configurable pero sin flujo de emisión');

  -- Identidad fiscal: otra sucursal con el MISMO establecimiento no puede registrar el mismo código de punto (NEX-057/059 se conserva)
  INSERT INTO sucursales (empresa_id, codigo, nombre, establecimiento_sifen) VALUES (v_a, 'S3-T27', 'Sucursal 3 T27', '001');
  PERFORM pg_temp.falla(format('SELECT fe_punto_registrar(%L, %L, %L, ''001'', ''Duplicado'')', v_a, v_ua, (SELECT id FROM sucursales WHERE empresa_id = v_a AND codigo = 'S3-T27')), 'P0001', 'la identidad fiscal 001/001 ya usada en otra sucursal se rechaza al registrar');

  -- Permisos y aislamiento por empresa
  INSERT INTO usuarios (empresa_id, usuario, nombre, password_hash) VALUES (v_a, 'op.t27', 'Operador sin PUNTOS', v_h) RETURNING id INTO v_op;
  PERFORM pg_temp.falla(format('SELECT fe_punto_registrar(%L, %L, %L, ''009'', ''X'')', v_a, v_op, v_sa), '42501', 'sin FACTURACION_ELECTRONICA.PUNTOS no se registra un punto');
  PERFORM pg_temp.falla(format('SELECT fe_secuencia_configurar(%L, %L, %L, ''FE'', NULL, 0, true)', v_a, v_op, v_p1), '42501', 'sin PUNTOS no se configura un tipo');
  PERFORM pg_temp.falla(format('SELECT fe_secuencia_estado(%L, %L, %L, ''FE'', false)', v_a, v_op, v_p1), '42501', 'sin PUNTOS no se cambia el estado de un tipo');
  PERFORM pg_temp.falla(format('SELECT fe_punto_estado(%L, %L, %L, false)', v_a, v_op, v_p1), '42501', 'sin PUNTOS no se cambia el estado del punto');
  PERFORM pg_temp.falla(format('SELECT fe_secuencia_configurar(%L, %L, %L, ''FE'', NULL, 0, true)', v_b, v_ub, v_p1), 'P0001', 'aislamiento: la empresa B no configura un punto de A');
  PERFORM pg_temp.falla(format('SELECT fe_punto_estado(%L, %L, %L, false)', v_b, v_ub, v_p1), 'P0001', 'aislamiento: la empresa B no cambia el estado de un punto de A');
  PERFORM pg_temp.falla(format($f$SELECT * FROM fe_documento_crear_fe(%L, %L, %L, %L, 'clave-t27-0011', NULL, '1234567-1', 'Receptor T27', 'PYG', 1000, %L)$f$, v_b, v_ub, v_sb, v_p1, v_payload::text), 'P0001', 'aislamiento: B no emite con el punto de A');

  -- Bitácora: la configuración y los estados quedan registrados con serie, número y usuario
  SELECT count(*) INTO v_n FROM fe_puntos_expedicion_log WHERE empresa_id = v_a AND accion = 'SECUENCIA' AND (nuevo->>'tipo_documento') IS NOT NULL;
  PERFORM pg_temp.ok(v_n >= 8 AND EXISTS (SELECT 1 FROM fe_puntos_expedicion_log WHERE empresa_id = v_a AND accion = 'SECUENCIA' AND nuevo->>'serie' = 'ZZ'), 'la bitácora registra cada configuración (tipo, serie, número, estado)');

  -- R01-04: la NCE usa SU secuencia por su flujo fiscal (fe_documento_crear_nce) sin tocar la de FE: aquí la FE de 001/001 ya está AGOTADA (ZZ-9999999) y la NCE igualmente emite
  DECLARE
    v_fe1 record; v_fe2 record; v_n1 record; v_n2 record; v_n3 record;
  BEGIN
    SELECT * INTO v_fe1 FROM pg_temp.fe_aprobada(v_a, v_ua, v_sa, '0000090');
    SELECT * INTO v_fe2 FROM pg_temp.fe_aprobada(v_a, v_ua, v_sa, '0000091');
    PERFORM pg_temp.ok((SELECT serie = 'ZZ' AND ultimo_numero = 9999999 AND activo FROM fe_punto_secuencias WHERE punto_id = v_p1 AND tipo_documento = 'FE'), 'precondición: la secuencia FE de 001/001 está agotada (ZZ-9999999)');

    SELECT * INTO v_n1 FROM fe_documento_crear_nce(v_a, v_ua, v_sa, v_p1, 'clave-t27-nce-1', v_fe1.o_id, 3, '[{"linea":1,"cantidad":0,"monto":30000}]'::jsonb, 'PYG', 30000, pg_temp.nce_payload(v_fe1.o_cdc, 30000));
    PERFORM pg_temp.ok(v_n1.o_numero = '0000001' AND (SELECT tipo = 'NCE' AND serie IS NULL AND numero = '0000001' FROM documentos_electronicos WHERE id = v_n1.o_documento_id)
      AND (SELECT payload->>'dNumDoc' = '0000001' AND payload->>'dSerieNum' IS NULL FROM documento_electronico_solicitudes WHERE documento_id = v_n1.o_documento_id), 'R01-04: la NCE toma 0000001 sin serie de SU secuencia (documento y payload)');
    PERFORM pg_temp.ok((SELECT serie = 'ZZ' AND ultimo_numero = 9999999 FROM fe_punto_secuencias WHERE punto_id = v_p1 AND tipo_documento = 'FE') AND (SELECT ultimo_numero = 1 AND serie IS NULL FROM fe_punto_secuencias WHERE punto_id = v_p1 AND tipo_documento = 'NCE'),
      'R01-04: la NCE no alteró la secuencia FE (sigue ZZ-9999999) y avanzó solo la NCE (1)');
    PERFORM pg_temp.ok((SELECT count(*) = 1 FROM documentos_electronicos WHERE empresa_id = v_a AND tipo = 'NCE'), 'solo se creó la NCE (la FE no consumió nada)');

    -- tipo NCE inactivo: no emite, no consume
    UPDATE documentos_electronicos SET estado_sifen = 'RECHAZADO' WHERE id = v_n1.o_documento_id;
    PERFORM fe_secuencia_estado(v_a, v_ua, v_p1, 'NCE', false);
    v_det := NULL;
    BEGIN
      PERFORM * FROM fe_documento_crear_nce(v_a, v_ua, v_sa, v_p1, 'clave-t27-nce-2', v_fe1.o_id, 3, '[{"linea":1,"cantidad":0,"monto":30000}]'::jsonb, 'PYG', 30000, pg_temp.nce_payload(v_fe1.o_cdc, 30000));
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_det = PG_EXCEPTION_DETAIL;
    END;
    PERFORM pg_temp.ok(v_det = 'NEX:TIPO_INACTIVO' AND (SELECT ultimo_numero = 1 FROM fe_punto_secuencias WHERE punto_id = v_p1 AND tipo_documento = 'NCE') AND NOT EXISTS (SELECT 1 FROM documentos_electronicos WHERE clave_idempotencia = 'clave-t27-nce-2'),
      'R01-04: la NCE con el tipo inactivo falla con NEX:TIPO_INACTIVO sin consumir número');
    PERFORM fe_secuencia_estado(v_a, v_ua, v_p1, 'NCE', true);

    -- NCE sin configurar en el punto (v_p2 solo tiene NRE): no emite
    PERFORM fe_punto_estado(v_a, v_ua, v_p2, true);
    v_det := NULL;
    BEGIN
      PERFORM * FROM fe_documento_crear_nce(v_a, v_ua, v_sa, v_p2, 'clave-t27-nce-3', v_fe1.o_id, 3, '[{"linea":1,"cantidad":0,"monto":30000}]'::jsonb, 'PYG', 30000, pg_temp.nce_payload(v_fe1.o_cdc, 30000));
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_det = PG_EXCEPTION_DETAIL;
    END;
    PERFORM pg_temp.ok(v_det = 'NEX:SECUENCIA_NO_CONFIGURADA' AND (SELECT ultimo_numero = 0 FROM fe_punto_secuencias WHERE punto_id = v_p2 AND tipo_documento = 'NRE'), 'R01-04: la NCE sin configuración NCE en el punto falla (la NRE del punto no se usa ni se toca)');

    -- rollover NCE: sin serie 9999999 → AA-0000001 y la FE sigue intacta
    PERFORM fe_secuencia_configurar(v_a, v_ua, v_p1, 'NCE', NULL, 9999999, true, false);
    SELECT * INTO v_n2 FROM fe_documento_crear_nce(v_a, v_ua, v_sa, v_p1, 'clave-t27-nce-4', v_fe1.o_id, 3, '[{"linea":1,"cantidad":0,"monto":30000}]'::jsonb, 'PYG', 30000, pg_temp.nce_payload(v_fe1.o_cdc, 30000));
    PERFORM pg_temp.ok((SELECT serie = 'AA' AND numero = '0000001' FROM documentos_electronicos WHERE id = v_n2.o_documento_id) AND (SELECT payload->>'dSerieNum' = 'AA' FROM documento_electronico_solicitudes WHERE documento_id = v_n2.o_documento_id)
      AND (SELECT serie = 'ZZ' AND ultimo_numero = 9999999 FROM fe_punto_secuencias WHERE punto_id = v_p1 AND tipo_documento = 'FE'), 'R01-04: la NCE pasa de 9999999 sin serie a AA-0000001 (documento y payload) y la FE no cambia');
    PERFORM pg_temp.ok((SELECT count(*) = 2 FROM documentos_electronicos WHERE empresa_id = v_a AND tipo = 'NCE' AND numero = '0000001'), 'la NCE 0000001 sin serie y la AA-0000001 coexisten (sin colisión)');

    -- límite NCE: ZZ-9999999 detiene sin reiniciar
    UPDATE documentos_electronicos SET estado_sifen = 'RECHAZADO' WHERE id = v_n2.o_documento_id;
    PERFORM fe_secuencia_configurar(v_a, v_ua, v_p1, 'NCE', 'ZZ', 9999999, true, false);
    v_det := NULL;
    BEGIN
      PERFORM * FROM fe_documento_crear_nce(v_a, v_ua, v_sa, v_p1, 'clave-t27-nce-5', v_fe2.o_id, 3, '[{"linea":1,"cantidad":0,"monto":30000}]'::jsonb, 'PYG', 30000, pg_temp.nce_payload(v_fe2.o_cdc, 30000));
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_det = PG_EXCEPTION_DETAIL;
    END;
    PERFORM pg_temp.ok(v_det = 'NEX:NUMERACION_AGOTADA' AND (SELECT serie = 'ZZ' AND ultimo_numero = 9999999 FROM fe_punto_secuencias WHERE punto_id = v_p1 AND tipo_documento = 'NCE') AND NOT EXISTS (SELECT 1 FROM documentos_electronicos WHERE clave_idempotencia = 'clave-t27-nce-5'),
      'R01-04: NCE en ZZ-9999999 se detiene con NEX:NUMERACION_AGOTADA sin consumir ni reiniciar');
    -- idempotencia NCE: la repetición devuelve la NCE existente sin consumir
    SELECT * INTO v_n3 FROM fe_documento_crear_nce(v_a, v_ua, v_sa, v_p1, 'clave-t27-nce-4', v_fe1.o_id, 3, '[{"linea":1,"cantidad":0,"monto":30000}]'::jsonb, 'PYG', 30000, pg_temp.nce_payload(v_fe1.o_cdc, 30000));
    PERFORM pg_temp.ok(v_n3.o_reutilizado AND v_n3.o_documento_id = v_n2.o_documento_id, 'R01-04: la repetición idempotente de la NCE devuelve la misma sin consumir número');
  END;

  RAISE NOTICE 'T27 completada';
END $t$;
