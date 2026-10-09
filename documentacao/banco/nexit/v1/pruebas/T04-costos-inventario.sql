-- T04 — Inventario y costo promedio ponderado móvil (DEC-003-02 / P007). Valores esperados calculados a mano.
\i _helpers.sql
SELECT crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12)) AS h \gset
SELECT demo_crear_empresa('demo-costos', 'Empresa de costos (prueba)', 'admin', :'h') AS e \gset
SELECT id AS u FROM usuarios WHERE empresa_id = :'e' LIMIT 1 \gset
SELECT id AS d1 FROM depositos WHERE empresa_id = :'e' AND codigo = 'DEP-CENTRAL' \gset
SELECT id AS d2 FROM depositos WHERE empresa_id = :'e' AND codigo = 'DEP-SALON' \gset
-- producto nuevo, sin movimientos
INSERT INTO productos (empresa_id, codigo, descripcion, descripcion_factura, unidad_medida_id)
  VALUES (:'e', 'COSTO-X', 'Producto de prueba de costos', 'Producto de prueba de costos', (SELECT id FROM unidades_medida WHERE codigo = 'UN'));
SELECT id AS x FROM productos WHERE empresa_id = :'e' AND codigo = 'COSTO-X' \gset

-- entrada 10 @ 100, entrada 5 @ 130  => qty 15, valor 1650, promedio 110
SELECT demo_nuevo_movimiento(:'e', 'ENTRADA', 'COMPRA', CURRENT_DATE, NULL, :'d1', NULL, 't', :'u') AS m1 \gset
SELECT inventario_registrar_linea(:'e', :'m1', :'x', 10, 100) \gset
SELECT demo_nuevo_movimiento(:'e', 'ENTRADA', 'COMPRA', CURRENT_DATE, NULL, :'d1', NULL, 't', :'u') AS m2 \gset
SELECT inventario_registrar_linea(:'e', :'m2', :'x', 5, 130) \gset
SELECT pg_temp.ok((SELECT cantidad_valorizada = 15 AND valor_total = 1650 AND costo_promedio = 110 FROM inventario_costos WHERE empresa_id = :'e' AND producto_id = :'x' AND deposito_id = :'d1'), 'promedio ponderado: 10@100 + 5@130 = 15 u, valor 1650, promedio 110');

-- salida 6: costo congelado = 1650*6/15 = 660 (unit 110); queda 9 u / 990
SELECT demo_nuevo_movimiento(:'e', 'SALIDA', 'VENTA', CURRENT_DATE, :'d1', NULL, NULL, 't', :'u') AS m3 \gset
SELECT inventario_registrar_linea(:'e', :'m3', :'x', 6, NULL, NULL, 'PROPIO', NULL, 150, 'PYG') AS l3 \gset
SELECT pg_temp.ok((SELECT costo_total = 660 AND costo_unitario = 110 AND precio_venta_total = 900 FROM movimiento_lineas WHERE id = :'l3'), 'salida: costo congelado 660 (110/u) y venta 900 en la misma línea');
SELECT pg_temp.ok((SELECT cantidad_valorizada = 9 AND valor_total = 990 AND costo_promedio = 110 FROM inventario_costos WHERE empresa_id = :'e' AND producto_id = :'x' AND deposito_id = :'d1'), 'tras la salida: 9 u, valor 990, promedio 110 (la salida no cambia el promedio)');

-- entrada que no divide exacto: 1 u @ 100.3333 => qty 10, valor 1090.3333, promedio 109.0333
SELECT demo_nuevo_movimiento(:'e', 'ENTRADA', 'COMPRA', CURRENT_DATE, NULL, :'d1', NULL, 't', :'u') AS m4 \gset
SELECT inventario_registrar_linea(:'e', :'m4', :'x', 1, 100.3333) \gset
SELECT pg_temp.ok((SELECT cantidad_valorizada = 10 AND valor_total = 1090.3333 AND costo_promedio = 109.0333 FROM inventario_costos WHERE empresa_id = :'e' AND producto_id = :'x' AND deposito_id = :'d1'), 'redondeo a 4 decimales: promedio 109.0333');

-- transferencia 4 u a DEP-SALON: se conserva el valor (4 * 1090.3333/10 = 436.1333)
SELECT demo_nuevo_movimiento(:'e', 'TRANSFERENCIA', 'TRANSFERENCIA', CURRENT_DATE, :'d1', :'d2', NULL, 't', :'u') AS m5 \gset
SELECT inventario_registrar_linea(:'e', :'m5', :'x', 4) \gset
SELECT pg_temp.ok((SELECT sum(valor_total) FROM inventario_costos WHERE empresa_id = :'e' AND producto_id = :'x') = 1090.3333, 'transferencia conserva el valor total del producto (1090.3333)');
SELECT pg_temp.ok((SELECT valor_total FROM inventario_costos WHERE empresa_id = :'e' AND producto_id = :'x' AND deposito_id = :'d2') = 436.1333, 'el destino recibe el valor que salió del origen (436.1333)');

-- vaciar el origen: la última salida lleva TODO el valor restante (sin residuo de redondeo)
SELECT demo_nuevo_movimiento(:'e', 'SALIDA', 'MANUAL', CURRENT_DATE, :'d1', NULL, NULL, 't', :'u') AS m6 \gset
SELECT inventario_registrar_linea(:'e', :'m6', :'x', 6) AS l6 \gset
SELECT pg_temp.ok((SELECT cantidad_valorizada = 0 AND valor_total = 0 FROM inventario_costos WHERE empresa_id = :'e' AND producto_id = :'x' AND deposito_id = :'d1'), 'vaciar el depósito deja valor 0 exacto (sin residuo)');
SELECT pg_temp.ok((SELECT costo_total = 654.2 FROM movimiento_lineas WHERE id = :'l6'), 'la última salida arrastra todo el valor restante (654.2000)');

-- conciliación saldo vs costo vacía
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM v_conciliacion_costo_stock WHERE empresa_id = :'e'), 'conciliación saldo/costo sin diferencias');
-- Saldo insuficiente
SELECT demo_nuevo_movimiento(:'e', 'SALIDA', 'MANUAL', CURRENT_DATE, :'d1', NULL, NULL, 't', :'u') AS m7 \gset
SELECT pg_temp.falla(format('SELECT inventario_registrar_linea(%L, %L, %L, 1)', :'e', :'m7', :'x'), 'P0001', 'salida sin saldo disponible rechazada');
-- Entrada valorizada exige costo
SELECT demo_nuevo_movimiento(:'e', 'ENTRADA', 'MANUAL', CURRENT_DATE, NULL, :'d1', NULL, 't', :'u') AS m8 \gset
SELECT pg_temp.falla(format('SELECT inventario_registrar_linea(%L, %L, %L, 1, NULL)', :'e', :'m8', :'x'), 'P0001', 'entrada propia sin costo unitario rechazada');
-- Precio de venta solo en SALIDA/VENTA
SELECT pg_temp.falla(format('SELECT inventario_registrar_linea(%L, %L, %L, 1, 10, NULL, ''PROPIO'', NULL, 99, ''PYG'')', :'e', :'m8', :'x'), 'P0001', 'precio de venta fuera de SALIDA/VENTA rechazado');
-- Mercadería de TERCEROS no se valoriza
SELECT inventario_registrar_linea(:'e', :'m8', :'x', 3, NULL, NULL, 'TERCERO', gen_random_uuid()) AS l8 \gset
SELECT pg_temp.ok((SELECT costo_total IS NULL FROM movimiento_lineas WHERE id = :'l8'), 'mercadería de terceros: sin costo (no valorizada)');

-- Inmutabilidad
SELECT pg_temp.falla(format($f$UPDATE movimiento_lineas SET cantidad = 99 WHERE id = %L$f$, :'l3'), 'P0001', 'línea de movimiento inmutable (UPDATE)');
SELECT pg_temp.falla(format($f$DELETE FROM movimiento_lineas WHERE id = %L$f$, :'l3'), 'P0001', 'línea de movimiento inmutable (DELETE)');
SELECT pg_temp.falla(format($f$DELETE FROM movimientos_inventario WHERE id = %L$f$, :'m3'), 'P0001', 'movimiento no se puede borrar (empresa DEMO fuera de reinicio)');
SELECT pg_temp.falla(format($f$UPDATE movimientos_inventario SET motivo = 'cambio' WHERE id = %L$f$, :'m3'), 'P0001', 'solo el estado del movimiento puede cambiar');
UPDATE movimientos_inventario SET estado = 'ANULADO' WHERE id = :'m3';
SELECT pg_temp.ok((SELECT estado FROM movimientos_inventario WHERE id = :'m3') = 'ANULADO', 'REGISTRADO -> ANULADO permitido');
SELECT pg_temp.falla(format($f$UPDATE movimientos_inventario SET estado = 'REGISTRADO' WHERE id = %L$f$, :'m3'), 'P0001', 'ANULADO no vuelve a REGISTRADO');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM v_ventas_al_costo WHERE movimiento_id = :'m3'), 'una venta ANULADA sale del reporte de ventas al costo');
