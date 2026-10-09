-- T09 — Movimientos operativos sobre una empresa REAL (no DEMO): alta transaccional, idempotencia, permisos/alcance, reservas, anulación, kardex.
-- Valores esperados calculados a mano (ver comentarios). Se ejecuta como superusuario del clúster de pruebas; la sección final repite el flujo como nexit_runtime.
\i _helpers.sql
CREATE OR REPLACE FUNCTION pg_temp.falla_detalle(p_sql text, p_detalle text, msg text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE d text;
BEGIN
  BEGIN EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS d = PG_EXCEPTION_DETAIL;
    IF d = p_detalle THEN RAISE NOTICE 'PASS: % (rechazado: %)', msg, d; RETURN; END IF;
    RAISE EXCEPTION 'FALLA: % — detalle inesperado "%" (%)', msg, d, SQLERRM;
  END;
  RAISE EXCEPTION 'FALLA: % — debió ser rechazada', msg;
END $$;

SELECT crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12)) AS h \gset
SELECT nex_inicializar_empresa('emp-t09', 'Empresa T09 SA (prueba)', '8012345', '6', 'admin.t09', 'Admin', 'T09', 'admin.t09@example.invalid', :'h') AS e \gset
SELECT id AS u  FROM usuarios WHERE empresa_id = :'e' AND usuario = 'admin.t09' \gset
SELECT id AS d1 FROM depositos WHERE empresa_id = :'e' AND codigo = 'DEP-PRINCIPAL' \gset
SELECT sucursal_id AS s1 FROM depositos WHERE id = :'d1' \gset
INSERT INTO depositos (empresa_id, sucursal_id, codigo, nombre) VALUES (:'e', :'s1', 'DEP-2', 'Segundo depósito');
SELECT id AS d2 FROM depositos WHERE empresa_id = :'e' AND codigo = 'DEP-2' \gset
-- usuarios con permisos distintos
INSERT INTO perfiles (empresa_id, codigo, nombre) VALUES (:'e', 'OPERADOR', 'Operador de stock');
INSERT INTO perfil_permiso (empresa_id, perfil_id, permiso_id)
  SELECT :'e', (SELECT id FROM perfiles WHERE empresa_id = :'e' AND codigo = 'OPERADOR'), id FROM permisos WHERE codigo IN ('MOVIMIENTOS.CREAR', 'MOVIMIENTOS.VER');
INSERT INTO usuarios (empresa_id, usuario, nombre, password_hash, alcance_depositos) VALUES
  (:'e', 'operador', 'Operador', :'h', 'ASIGNADOS'), (:'e', 'consulta', 'Consulta', :'h', 'TODOS');
SELECT id AS uop FROM usuarios WHERE empresa_id = :'e' AND usuario = 'operador' \gset
SELECT id AS ucon FROM usuarios WHERE empresa_id = :'e' AND usuario = 'consulta' \gset
INSERT INTO usuario_perfil (empresa_id, usuario_id, perfil_id) VALUES
  (:'e', :'uop', (SELECT id FROM perfiles WHERE empresa_id = :'e' AND codigo = 'OPERADOR')),
  (:'e', :'ucon', (SELECT id FROM perfiles WHERE empresa_id = :'e' AND codigo = 'CONSULTA'));
INSERT INTO usuario_deposito (empresa_id, usuario_id, deposito_id) VALUES (:'e', :'uop', :'d1');   -- el operador solo ve DEP-PRINCIPAL
-- productos
INSERT INTO productos (empresa_id, codigo, descripcion, descripcion_factura, unidad_medida_id) SELECT :'e', c, 'Producto ' || c, 'Producto ' || c, (SELECT id FROM unidades_medida WHERE codigo = 'UN') FROM unnest(ARRAY['PA','PB']) c;
INSERT INTO productos (empresa_id, codigo, descripcion, descripcion_factura, unidad_medida_id, controla_stock) VALUES (:'e', 'SERV', 'Servicio', 'Servicio', (SELECT id FROM unidades_medida WHERE codigo = 'UN'), false);
SELECT id AS pa FROM productos WHERE empresa_id = :'e' AND codigo = 'PA' \gset
SELECT id AS pb FROM productos WHERE empresa_id = :'e' AND codigo = 'PB' \gset
SELECT id AS ps FROM productos WHERE empresa_id = :'e' AND codigo = 'SERV' \gset

-- ===== Permisos =====
SELECT pg_temp.ok(usuario_tiene_permiso(:'e', :'u', 'MOVIMIENTOS', 'ANULAR'), 'permisos: el administrador tiene la acción crítica MOVIMIENTOS.ANULAR');
SELECT pg_temp.ok(usuario_tiene_permiso(:'e', :'uop', 'MOVIMIENTOS', 'CREAR') AND NOT usuario_tiene_permiso(:'e', :'uop', 'MOVIMIENTOS', 'ANULAR'), 'permisos: el operador crea pero no anula');
SELECT pg_temp.ok(usuario_tiene_permiso(:'e', :'ucon', 'CLIENTES', 'VER') AND NOT usuario_tiene_permiso(:'e', :'ucon', 'MOVIMIENTOS', 'CREAR'), 'permisos: consulta solo ve');
SELECT pg_temp.falla($f$INSERT INTO perfil_permiso (empresa_id, perfil_id, permiso_id) SELECT empresa_id, id, (SELECT id FROM permisos WHERE codigo='MOVIMIENTOS.ANULAR') FROM perfiles WHERE codigo='OPERADOR' AND es_sistema = false$f$, 'P0001', 'permisos: MOVIMIENTOS.ANULAR no puede asignarse a un perfil (ESC-13)');

-- ===== Alta y valoración =====
-- M1: A 10@100 + B 4@50 ; M2: A 5@130  => A: 15 u / 1650 / 110 ; B: 4 u / 200 / 50
SELECT o_movimiento_id AS m1, o_numero AS n1, o_repetido AS r1 FROM inventario_registrar_movimiento(:'e', :'u', 'ENTRADA', 'COMPRA', NULL, NULL, :'d1',
  jsonb_build_array(jsonb_build_object('producto_id', :'pa', 'cantidad', 10, 'costo_unitario', 100), jsonb_build_object('producto_id', :'pb', 'cantidad', 4, 'costo_unitario', 50)),
  'clave-t09-m1-0001') \gset
SELECT pg_temp.ok(:'n1' = 'MOV-000001' AND :'r1' = 'f', 'alta: primer movimiento MOV-000001, no repetido');
SELECT o_movimiento_id AS m2 FROM inventario_registrar_movimiento(:'e', :'u', 'ENTRADA', 'COMPRA', NULL, NULL, :'d1',
  jsonb_build_array(jsonb_build_object('producto_id', :'pa', 'cantidad', 5, 'costo_unitario', 130)), 'clave-t09-m2-0002') \gset
SELECT pg_temp.ok((SELECT cantidad_valorizada = 15 AND valor_total = 1650 AND costo_promedio = 110 FROM inventario_costos WHERE empresa_id = :'e' AND producto_id = :'pa' AND deposito_id = :'d1'), 'alta: A = 15 u, valor 1650, promedio 110');
SELECT pg_temp.ok((SELECT sucursal_id = :'s1' FROM movimientos_inventario WHERE id = :'m1'), 'alta: la sucursal se deriva del depósito');

-- ===== Idempotencia =====
SELECT pg_temp.ok((SELECT count(*) FROM movimientos_inventario WHERE empresa_id = :'e') = 2, 'idempotencia: 2 movimientos antes del reintento');
SELECT o_movimiento_id AS m1b, o_repetido AS r1b FROM inventario_registrar_movimiento(:'e', :'u', 'ENTRADA', 'COMPRA', NULL, NULL, :'d1',
  jsonb_build_array(jsonb_build_object('producto_id', :'pb', 'cantidad', 4.0000, 'costo_unitario', 50.00), jsonb_build_object('producto_id', :'pa', 'cantidad', 10, 'costo_unitario', 100)),
  'clave-t09-m1-0001') \gset
SELECT pg_temp.ok(:'m1b' = :'m1' AND :'r1b' = 't', 'idempotencia: misma clave y misma solicitud (otro orden y escala numérica) devuelve el movimiento original');
SELECT pg_temp.ok((SELECT count(*) FROM movimientos_inventario WHERE empresa_id = :'e') = 2
              AND (SELECT cantidad_valorizada FROM inventario_costos WHERE empresa_id = :'e' AND producto_id = :'pa' AND deposito_id = :'d1') = 15, 'idempotencia: el reintento no duplicó movimiento ni stock');
SELECT pg_temp.falla_detalle(format($f$SELECT * FROM inventario_registrar_movimiento(%L, %L, 'ENTRADA', 'COMPRA', NULL, NULL, %L, %L::jsonb, 'clave-t09-m1-0001')$f$, :'e', :'u', :'d1',
  jsonb_build_array(jsonb_build_object('producto_id', :'pa', 'cantidad', 11, 'costo_unitario', 100))::text), 'NEX:IDEMPOTENCIA_CONFLICTO', 'idempotencia: la misma clave con otra solicitud se rechaza');
SELECT pg_temp.falla($f$INSERT INTO movimientos_inventario (empresa_id, numero_movimiento, tipo_movimiento, tipo_origen, fecha_movimiento, hora_movimiento, deposito_destino_id, creado_por, clave_idempotencia)
  SELECT empresa_id, 'MOV-000099', 'ENTRADA', 'MANUAL', current_date, now()::time, deposito_destino_id, creado_por, clave_idempotencia FROM movimientos_inventario WHERE clave_idempotencia = 'clave-t09-m1-0001'$f$, '23505', 'idempotencia: el índice único impide la clave duplicada aun por INSERT directo');

-- ===== Validaciones y atomicidad =====
SELECT pg_temp.falla(format($f$SELECT * FROM inventario_registrar_movimiento(%L, %L, 'ENTRADA','COMPRA', NULL, NULL, %L, '[{"producto_id":"%s","cantidad":1,"costo_unitario":1}]'::jsonb)$f$, :'e', :'ucon', :'d1', :'pa'), '42501', 'permisos: el usuario de consulta no puede registrar movimientos');
SELECT pg_temp.falla(format($f$SELECT * FROM inventario_registrar_movimiento(%L, %L, 'ENTRADA','COMPRA', NULL, NULL, %L, '[{"producto_id":"%s","cantidad":1,"costo_unitario":1}]'::jsonb)$f$, :'e', :'uop', :'d2', :'pa'), '42501', 'alcance: el operador no tiene alcance sobre DEP-2');
SELECT pg_temp.ok((SELECT o_numero FROM inventario_registrar_movimiento(:'e', :'uop', 'ENTRADA', 'COMPRA', NULL, NULL, :'d1', jsonb_build_array(jsonb_build_object('producto_id', :'pb', 'cantidad', 1, 'costo_unitario', 50))) ) = 'MOV-000003', 'alcance: el operador sí registra en su depósito (B +1 @50)');
SELECT pg_temp.falla(format($f$SELECT * FROM inventario_registrar_movimiento(%L, %L, 'ENTRADA','COMPRA', current_date + 3, NULL, %L, '[{"producto_id":"%s","cantidad":1,"costo_unitario":1}]'::jsonb)$f$, :'e', :'u', :'d1', :'pa'), 'P0001', 'validación: fecha futura rechazada');
SELECT pg_temp.falla(format($f$SELECT * FROM inventario_registrar_movimiento(%L, %L, 'ENTRADA','COMPRA', NULL, NULL, %L, '[]'::jsonb)$f$, :'e', :'u', :'d1'), 'P0001', 'validación: movimiento sin líneas rechazado');
SELECT pg_temp.falla(format($f$SELECT * FROM inventario_registrar_movimiento(%L, %L, 'ENTRADA','ANULACION', NULL, NULL, %L, '[{"producto_id":"%s","cantidad":1,"costo_unitario":1}]'::jsonb)$f$, :'e', :'u', :'d1', :'pa'), 'P0001', 'validación: origen ANULACION no se puede crear a mano');
SELECT pg_temp.falla(format($f$SELECT * FROM inventario_registrar_movimiento(%L, %L, 'ENTRADA','COMPRA', NULL, NULL, %L, '[{"producto_id":"%s","cantidad":1,"costo_unitario":1}]'::jsonb)$f$, :'e', :'u', :'d1', :'ps'), 'P0001', 'validación: producto que no controla stock rechazado');
SELECT pg_temp.falla(format($f$SELECT * FROM inventario_registrar_movimiento(%L, %L, 'ENTRADA','COMPRA', NULL, NULL, %L, '[{"producto_id":"%s","cantidad":1.00001,"costo_unitario":1}]'::jsonb)$f$, :'e', :'u', :'d1', :'pa'), 'P0001', 'validación: más de 4 decimales rechazado (no se redondea en silencio)');
SELECT pg_temp.falla(format($f$SELECT * FROM inventario_registrar_movimiento(%L, %L, 'ENTRADA','COMPRA', NULL, NULL, %L, '[{"producto_id":"%s","cantidad":1}]'::jsonb)$f$, :'e', :'u', :'d1', :'pa'), 'P0001', 'validación: entrada propia sin costo rechazada');
SELECT pg_temp.falla(format($f$SELECT * FROM inventario_registrar_movimiento(%L, %L, 'ENTRADA','COMPRA', NULL, NULL, %L, '[{"producto_id":"%s","cantidad":1,"costo_unitario":1}]'::jsonb)$f$, :'e', :'u', :'d1', gen_random_uuid()), 'P0001', 'validación: producto inexistente (u de otra empresa) rechazado');
-- atomicidad: segunda línea sin saldo => no queda NADA (ni cabecera, ni primera línea, ni saldo)
SELECT count(*) AS nmov0 FROM movimientos_inventario WHERE empresa_id = :'e' \gset
SELECT pg_temp.falla(format($f$SELECT * FROM inventario_registrar_movimiento(%L, %L, 'SALIDA','MANUAL', NULL, %L, NULL,
   '[{"producto_id":"%s","cantidad":1},{"producto_id":"%s","cantidad":999}]'::jsonb)$f$, :'e', :'u', :'d1', :'pa', :'pb'), 'P0001', 'atomicidad: salida con 2.ª línea sin saldo se rechaza');
SELECT pg_temp.ok((SELECT count(*) FROM movimientos_inventario WHERE empresa_id = :'e') = :nmov0
              AND (SELECT cantidad_valorizada FROM inventario_costos WHERE empresa_id = :'e' AND producto_id = :'pa' AND deposito_id = :'d1') = 15
              AND (SELECT count(*) FROM movimiento_lineas WHERE empresa_id = :'e') = 4, 'atomicidad: sin cabecera, líneas ni saldos parciales');
-- estoque negativo: imposible por función y por restricción
SELECT pg_temp.falla($f$UPDATE stock_saldos SET cantidad = -1$f$, '23514', 'stock negativo: CHECK impide saldo < 0');
-- empresa ajena: usuario de A no opera en B (DEMO existe en el clúster tras S-002)
SELECT id AS eb FROM empresas WHERE codigo = 'demo-modelo' \gset
SELECT pg_temp.falla(format($f$SELECT * FROM inventario_registrar_movimiento(%L, %L, 'ENTRADA','COMPRA', NULL, NULL, (SELECT id FROM depositos WHERE empresa_id=%L LIMIT 1), '[{"producto_id":"%s","cantidad":1,"costo_unitario":1}]'::jsonb)$f$, :'eb', :'u', :'eb', :'pa'), '42501', 'multiempresa: un usuario de la empresa A no registra movimientos en la empresa B');

-- ===== Venta + anulación al costo congelado =====
-- M4: SALIDA/VENTA A 6 @150 => costo 660 (110/u); queda 9 u / 990
SELECT o_movimiento_id AS m4 FROM inventario_registrar_movimiento(:'e', :'u', 'SALIDA', 'VENTA', NULL, :'d1', NULL,
  jsonb_build_array(jsonb_build_object('producto_id', :'pa', 'cantidad', 6, 'precio_venta', 150, 'moneda_venta', 'PYG'))) \gset
SELECT pg_temp.ok((SELECT cantidad_valorizada = 9 AND valor_total = 990 FROM inventario_costos WHERE empresa_id = :'e' AND producto_id = :'pa' AND deposito_id = :'d1'), 'venta: A queda 9 u / 990');
SELECT pg_temp.ok((SELECT count(*) = 1 AND sum(margen_bruto) = 240 FROM v_ventas_al_costo WHERE empresa_id = :'e' AND movimiento_id = :'m4'), 'venta: ventas al costo muestra la venta (900 - 660 = 240)');
SELECT pg_temp.falla(format($f$SELECT * FROM inventario_anular_movimiento(%L, %L, %L, 'prueba de anulación')$f$, :'e', :'uop', :'m4'), '42501', 'anulación: el operador (sin acción crítica) no puede anular');
SELECT pg_temp.falla(format($f$SELECT * FROM inventario_anular_movimiento(%L, %L, %L, 'x')$f$, :'e', :'u', :'m4'), 'P0001', 'anulación: motivo obligatorio (mín. 5 caracteres)');
SELECT o_movimiento_id AS a4, o_numero AS na4, o_repetido AS ra4 FROM inventario_anular_movimiento(:'e', :'u', :'m4', 'Venta cargada por error', 'clave-anula-m4-001') \gset
SELECT pg_temp.ok((SELECT cantidad_valorizada = 15 AND valor_total = 1650 AND costo_promedio = 110 FROM inventario_costos WHERE empresa_id = :'e' AND producto_id = :'pa' AND deposito_id = :'d1'), 'anulación de venta: A vuelve a 15 u / 1650 / 110 (costo congelado, no el promedio actual)');
SELECT pg_temp.ok((SELECT estado = 'ANULADO' FROM movimientos_inventario WHERE id = :'m4')
              AND (SELECT tipo_movimiento = 'ENTRADA' AND tipo_origen = 'ANULACION' AND anula_a_id = :'m4' AND motivo = 'Venta cargada por error' AND documento_referencia = (SELECT numero_movimiento FROM movimientos_inventario WHERE id = :'m4') FROM movimientos_inventario WHERE id = :'a4'), 'anulación: original ANULADO; inverso ligado (anula_a_id, motivo, referencia)');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM v_ventas_al_costo WHERE empresa_id = :'e' AND movimiento_id = :'m4'), 'anulación: la venta anulada sale de ventas al costo');
SELECT o_movimiento_id AS a4b, o_repetido AS ra4b FROM inventario_anular_movimiento(:'e', :'u', :'m4', 'Venta cargada por error', 'clave-anula-m4-001') \gset
SELECT pg_temp.ok(:'a4b' = :'a4' AND :'ra4b' = 't', 'anulación idempotente: el reintento con la misma clave devuelve la anulación original');
SELECT pg_temp.falla_detalle(format($f$SELECT * FROM inventario_anular_movimiento(%L, %L, %L, 'segunda anulación')$f$, :'e', :'u', :'m4'), 'NEX:YA_ANULADO', 'anulación: no se anula dos veces');
SELECT pg_temp.falla(format($f$SELECT * FROM inventario_anular_movimiento(%L, %L, %L, 'anular la anulación')$f$, :'e', :'u', :'a4'), 'P0001', 'anulación: un movimiento de anulación no se anula');
SELECT pg_temp.falla(format($f$UPDATE movimientos_inventario SET estado = 'REGISTRADO' WHERE id = %L$f$, :'m4'), 'P0001', 'trazabilidad: ANULADO no vuelve a REGISTRADO');

-- Redondeo exacto: A +1 @100.3333 => 16 u / 1750.3333 ; salida 7 => 765.7708 ; anular => vuelve EXACTO a 1750.3333
SELECT o_movimiento_id AS m5 FROM inventario_registrar_movimiento(:'e', :'u', 'ENTRADA', 'COMPRA', NULL, NULL, :'d1', jsonb_build_array(jsonb_build_object('producto_id', :'pa', 'cantidad', 1, 'costo_unitario', 100.3333))) \gset
SELECT o_movimiento_id AS m6 FROM inventario_registrar_movimiento(:'e', :'u', 'SALIDA', 'MANUAL', NULL, :'d1', NULL, jsonb_build_array(jsonb_build_object('producto_id', :'pa', 'cantidad', 7))) \gset
SELECT pg_temp.ok((SELECT costo_total = 765.7708 FROM movimiento_lineas WHERE movimiento_id = :'m6'), 'redondeo: salida de 7 congela 765.7708');
SELECT inventario_anular_movimiento(:'e', :'u', :'m6', 'Prueba de redondeo exacto') \gset
SELECT pg_temp.ok((SELECT cantidad_valorizada = 16 AND valor_total = 1750.3333 FROM inventario_costos WHERE empresa_id = :'e' AND producto_id = :'pa' AND deposito_id = :'d1'), 'redondeo: la anulación devuelve EXACTAMENTE 1750.3333 (sin deriva de 0.0002)');

-- Anulación de una ENTRADA: sale al promedio vigente; si ya se consumió, se rechaza
SELECT o_movimiento_id AS m7 FROM inventario_registrar_movimiento(:'e', :'u', 'ENTRADA', 'COMPRA', NULL, NULL, :'d1', jsonb_build_array(jsonb_build_object('producto_id', :'pb', 'cantidad', 2, 'costo_unitario', 60))) \gset
-- B antes: 5 u (4@50 + 1@50) / 250 ; con M7: 7 u / 370 ; anular M7 => sale 2 u a 370*2/7 = 105.7143
SELECT inventario_anular_movimiento(:'e', :'u', :'m7', 'Compra devuelta al proveedor') \gset
SELECT pg_temp.ok((SELECT cantidad_valorizada = 5 AND valor_total = 264.2857 FROM inventario_costos WHERE empresa_id = :'e' AND producto_id = :'pb' AND deposito_id = :'d1'), 'anulación de entrada: B sale al promedio vigente (5 u / 264.2857; D-C5: compra devuelta sale al medio)');
SELECT o_movimiento_id AS m8 FROM inventario_registrar_movimiento(:'e', :'u', 'ENTRADA', 'COMPRA', NULL, NULL, :'d2', jsonb_build_array(jsonb_build_object('producto_id', :'pb', 'cantidad', 3, 'costo_unitario', 10))) \gset
SELECT inventario_registrar_movimiento(:'e', :'u', 'SALIDA', 'MANUAL', NULL, :'d2', NULL, jsonb_build_array(jsonb_build_object('producto_id', :'pb', 'cantidad', 3))) \gset
SELECT pg_temp.falla(format($f$SELECT * FROM inventario_anular_movimiento(%L, %L, %L, 'ya se vendió todo')$f$, :'e', :'u', :'m8'), 'P0001', 'anulación de entrada ya consumida: rechazada');
SELECT pg_temp.ok((SELECT estado = 'REGISTRADO' FROM movimientos_inventario WHERE id = :'m8'), 'anulación rechazada: el original permanece REGISTRADO (transacción revertida)');

-- ===== Transferencia =====
-- A en DEP-PRINCIPAL: 16 u / 1750.3333. Transferir 4 => valor 437.5833 ; D1 12 u / 1312.7500
SELECT o_movimiento_id AS m9 FROM inventario_registrar_movimiento(:'e', :'u', 'TRANSFERENCIA', 'TRANSFERENCIA', NULL, :'d1', :'d2', jsonb_build_array(jsonb_build_object('producto_id', :'pa', 'cantidad', 4))) \gset
SELECT pg_temp.ok((SELECT valor_total = 437.5833 AND cantidad_valorizada = 4 FROM inventario_costos WHERE empresa_id = :'e' AND producto_id = :'pa' AND deposito_id = :'d2')
              AND (SELECT valor_total = 1312.75 AND cantidad_valorizada = 12 FROM inventario_costos WHERE empresa_id = :'e' AND producto_id = :'pa' AND deposito_id = :'d1'), 'transferencia: valor conservado entre depósitos (437.5833 + 1312.75 = 1750.3333)');
SELECT inventario_anular_movimiento(:'e', :'u', :'m9', 'Transferencia equivocada') \gset
SELECT pg_temp.ok((SELECT valor_total = 1750.3333 AND cantidad_valorizada = 16 FROM inventario_costos WHERE empresa_id = :'e' AND producto_id = :'pa' AND deposito_id = :'d1')
              AND (SELECT cantidad_valorizada = 0 AND valor_total = 0 FROM inventario_costos WHERE empresa_id = :'e' AND producto_id = :'pa' AND deposito_id = :'d2'), 'anulación de transferencia: todo vuelve al origen, el destino queda en cero exacto');

-- ===== Reservas y cuarentena (el físico y el valor no cambian) =====
SELECT o_movimiento_id AS m10 FROM inventario_registrar_movimiento(:'e', :'u', 'RESERVA', 'MANUAL', NULL, :'d1', NULL, jsonb_build_array(jsonb_build_object('producto_id', :'pa', 'cantidad', 3))) \gset
SELECT pg_temp.ok((SELECT disponible = 13 AND reservado = 3 FROM v_stock_producto_deposito WHERE empresa_id = :'e' AND producto_id = :'pa' AND deposito_id = :'d1'), 'reserva: disponible 13, reservado 3 (físico 16)');
SELECT pg_temp.ok((SELECT valor_total = 1750.3333 AND cantidad_valorizada = 16 FROM inventario_costos WHERE empresa_id = :'e' AND producto_id = :'pa' AND deposito_id = :'d1'), 'reserva: el valor del stock no cambia (D-C2 opción A: físico propio incluye lo reservado)');
SELECT pg_temp.falla(format($f$SELECT * FROM inventario_registrar_movimiento(%L, %L, 'SALIDA','MANUAL', NULL, %L, NULL, '[{"producto_id":"%s","cantidad":14}]'::jsonb)$f$, :'e', :'u', :'d1', :'pa'), 'P0001', 'reserva: no se puede sacar más que el disponible aunque el físico alcance (16 > 13)');
SELECT pg_temp.falla(format($f$SELECT * FROM inventario_registrar_movimiento(%L, %L, 'RESERVA','MANUAL', NULL, %L, NULL, '[{"producto_id":"%s","cantidad":14}]'::jsonb)$f$, :'e', :'u', :'d1', :'pa'), 'P0001', 'reserva: no se reserva más que el disponible');
SELECT pg_temp.falla(format($f$SELECT * FROM inventario_registrar_movimiento(%L, %L, 'RESERVA','MANUAL', NULL, %L, NULL, '[{"producto_id":"%s","cantidad":1,"costo_unitario":5}]'::jsonb)$f$, :'e', :'u', :'d1', :'pa'), 'P0001', 'reserva: no admite costo');
SELECT inventario_registrar_movimiento(:'e', :'u', 'LIBERACION_RESERVA', 'MANUAL', NULL, :'d1', NULL, jsonb_build_array(jsonb_build_object('producto_id', :'pa', 'cantidad', 1))) \gset
SELECT pg_temp.ok((SELECT disponible = 14 AND reservado = 2 FROM v_stock_producto_deposito WHERE empresa_id = :'e' AND producto_id = :'pa' AND deposito_id = :'d1'), 'liberación parcial: disponible 14, reservado 2');
SELECT pg_temp.falla(format($f$SELECT * FROM inventario_anular_movimiento(%L, %L, %L, 'anular la reserva completa')$f$, :'e', :'u', :'m10'), 'P0001', 'anulación de reserva ya liberada en parte: rechazada (reservado 2 < 3)');
SELECT inventario_registrar_movimiento(:'e', :'u', 'LIBERACION_RESERVA', 'MANUAL', NULL, :'d1', NULL, jsonb_build_array(jsonb_build_object('producto_id', :'pa', 'cantidad', 2))) \gset
SELECT o_movimiento_id AS m11 FROM inventario_registrar_movimiento(:'e', :'u', 'CUARENTENA', 'MANUAL', NULL, :'d1', NULL, jsonb_build_array(jsonb_build_object('producto_id', :'pa', 'cantidad', 2))) \gset
SELECT pg_temp.ok((SELECT disponible = 14 AND reservado = 0 AND cuarentena = 2 FROM v_stock_producto_deposito WHERE empresa_id = :'e' AND producto_id = :'pa' AND deposito_id = :'d1'), 'cuarentena: disponible 14, cuarentena 2');
SELECT inventario_anular_movimiento(:'e', :'u', :'m11', 'Cuarentena aplicada por error') \gset
SELECT pg_temp.ok((SELECT disponible = 16 AND cuarentena = 0 FROM v_stock_producto_deposito WHERE empresa_id = :'e' AND producto_id = :'pa' AND deposito_id = :'d1'), 'anulación de cuarentena: disponible 16');

-- ===== Saldo de apertura (D-C8) y terceros =====
SELECT o_movimiento_id AS m12 FROM inventario_registrar_movimiento(:'e', :'u', 'ENTRADA', 'ABERTURA', NULL, NULL, :'d2', jsonb_build_array(jsonb_build_object('producto_id', :'pb', 'cantidad', 20, 'costo_unitario', 45.5))) \gset
SELECT pg_temp.ok((SELECT tipo_origen = 'ABERTURA' FROM movimientos_inventario WHERE id = :'m12') AND (SELECT valor_total = 910 FROM inventario_costos WHERE empresa_id = :'e' AND producto_id = :'pb' AND deposito_id = :'d2'), 'apertura: saldo inicial 20 @ 45.50 = 910 con origen ABERTURA');
SELECT o_movimiento_id AS m13 FROM inventario_registrar_movimiento(:'e', :'u', 'ENTRADA', 'MANUAL', NULL, NULL, :'d1', jsonb_build_array(jsonb_build_object('producto_id', :'pb', 'cantidad', 5, 'propiedad', 'TERCERO', 'propietario_id', gen_random_uuid()))) \gset
SELECT pg_temp.ok((SELECT costo_total IS NULL FROM movimiento_lineas WHERE movimiento_id = :'m13'), 'terceros: mercadería de terceros entra sin valor');

-- ===== Kardex y conciliación =====
SELECT pg_temp.ok(NOT EXISTS (
  WITH k AS (SELECT DISTINCT ON (producto_id, deposito_id, propiedad) producto_id, deposito_id, propiedad, saldo_disponible, saldo_reservado, saldo_cuarentena
               FROM v_kardex WHERE empresa_id = :'e' ORDER BY producto_id, deposito_id, propiedad, numero_movimiento DESC),
       s AS (SELECT producto_id, deposito_id, propiedad,
                    COALESCE(sum(cantidad) FILTER (WHERE estado_stock = 'DISPONIBLE'), 0) AS disp,
                    COALESCE(sum(cantidad) FILTER (WHERE estado_stock = 'RESERVADO'), 0) AS res,
                    COALESCE(sum(cantidad) FILTER (WHERE estado_stock = 'CUARENTENA'), 0) AS cua
               FROM stock_saldos WHERE empresa_id = :'e' GROUP BY 1, 2, 3)
  SELECT 1 FROM k FULL JOIN s USING (producto_id, deposito_id, propiedad)
   WHERE COALESCE(k.saldo_disponible, 0) <> COALESCE(s.disp, 0) OR COALESCE(k.saldo_reservado, 0) <> COALESCE(s.res, 0) OR COALESCE(k.saldo_cuarentena, 0) <> COALESCE(s.cua, 0)),
  'kardex: el último saldo acumulado coincide con stock_saldos en todos los productos, depósitos y estados');
SELECT pg_temp.ok((SELECT count(*) FROM v_kardex WHERE empresa_id = :'e' AND producto_id = :'pa' AND deposito_id = :'d1') >= 8, 'kardex: A en DEP-PRINCIPAL tiene su historial completo (incluye anulaciones)');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM v_conciliacion_costo_stock WHERE empresa_id = :'e'), 'conciliación: cantidad valorizada = cantidad de saldos propios en todos los productos y depósitos');
SELECT pg_temp.ok((SELECT count(*) FROM movimientos_inventario WHERE empresa_id = :'e' AND tipo_origen = 'ANULACION') = (SELECT count(*) FROM movimientos_inventario WHERE empresa_id = :'e' AND estado = 'ANULADO'), 'trazabilidad: cada movimiento ANULADO tiene exactamente un inverso');
SELECT pg_temp.ok((SELECT count(DISTINCT numero_movimiento) = count(*) FROM movimientos_inventario WHERE empresa_id = :'e'), 'numeración: números de movimiento únicos y correlativos por empresa');

-- ===== Como nexit_runtime (rol real de la aplicación): solo funciones, sin escritura directa =====
SET ROLE nexit_runtime;
SELECT o_numero AS nr FROM inventario_registrar_movimiento(:'e', :'u', 'ENTRADA', 'COMPRA', NULL, NULL, :'d1', jsonb_build_array(jsonb_build_object('producto_id', :'pb', 'cantidad', 1, 'costo_unitario', 50)), 'clave-runtime-0001') \gset
SELECT pg_temp.ok(:'nr' ~ '^MOV-[0-9]{6}$', 'runtime: registra movimientos mediante la función');
SELECT pg_temp.ok((SELECT count(*) > 0 FROM v_kardex WHERE empresa_id = :'e'), 'runtime: lee el kardex');
SELECT pg_temp.ok((SELECT o_repetido FROM inventario_registrar_movimiento(:'e', :'u', 'ENTRADA', 'COMPRA', NULL, NULL, :'d1', jsonb_build_array(jsonb_build_object('producto_id', :'pb', 'cantidad', 1, 'costo_unitario', 50)), 'clave-runtime-0001')), 'runtime: la idempotencia funciona igual');
SELECT o_numero AS ra FROM inventario_anular_movimiento(:'e', :'u', (SELECT id FROM movimientos_inventario WHERE numero_movimiento = :'nr' AND empresa_id = :'e'), 'Anulación desde runtime') \gset
SELECT pg_temp.ok(:'ra' ~ '^MOV-[0-9]{6}$', 'runtime: anula mediante la función (usuario con permiso)');
RESET ROLE;
