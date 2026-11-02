-- T07 — Stock, Movimientos, Reportes de costo (XLSX) y Dashboard: todo derivado de la base, nada literal.
\i _helpers.sql
SELECT id AS e FROM empresas WHERE codigo = 'demo-modelo' \gset

-- Consistencia entre vistas y tablas
SELECT pg_temp.ok((SELECT valor_stock FROM v_dashboard_resumen WHERE empresa_id = :'e') = (SELECT sum(valor_total) FROM v_valoracion_stock WHERE empresa_id = :'e'), 'dashboard.valor_stock = suma de la valoración de stock');
SELECT pg_temp.ok((SELECT valor_stock FROM v_dashboard_resumen WHERE empresa_id = :'e') = (SELECT sum(valor_total) FROM v_dashboard_valor_por_deposito WHERE empresa_id = :'e'), 'dashboard: valor por depósito suma el total');
SELECT pg_temp.ok((SELECT clientes_activos FROM v_dashboard_resumen WHERE empresa_id = :'e') = (SELECT count(*) FROM clientes WHERE empresa_id = :'e' AND activo), 'dashboard.clientes_activos = conteo real');
SELECT pg_temp.ok((SELECT productos_bajo_minimo FROM v_dashboard_resumen WHERE empresa_id = :'e') = 2, 'dashboard.productos_bajo_minimo = 2 (ALI-001 y HIG-002 con mínimo 500)');
SELECT pg_temp.ok((SELECT sum(disponible) FROM v_stock_producto WHERE empresa_id = :'e') = (SELECT sum(cantidad) FROM stock_saldos WHERE empresa_id = :'e' AND estado_stock = 'DISPONIBLE' AND propiedad = 'PROPIO'), 'v_stock_producto concilia con stock_saldos');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM v_conciliacion_costo_stock WHERE empresa_id = :'e'), 'saldo físico y cantidad valorizada concilian');

-- El Dashboard cambia cuando cambian los datos (sin cifras literales)
SELECT ventas_mes AS v0, costo_ventas_mes AS c0, movimientos_mes AS m0 FROM v_dashboard_resumen WHERE empresa_id = :'e' \gset
SELECT id AS u FROM usuarios WHERE empresa_id = :'e' \gset
SELECT id AS d1 FROM depositos WHERE empresa_id = :'e' AND codigo = 'DEP-CENTRAL' \gset
SELECT id AS cli FROM clientes WHERE empresa_id = :'e' ORDER BY codigo LIMIT 1 \gset
SELECT id AS pr FROM productos WHERE empresa_id = :'e' AND codigo = 'BEB-001' \gset
SELECT demo_nuevo_movimiento(:'e', 'SALIDA', 'VENTA', CURRENT_DATE, :'d1', NULL, :'cli', 'venta prueba dashboard', :'u') AS mv \gset
SELECT inventario_registrar_linea(:'e', :'mv', :'pr', 10, NULL, NULL, 'PROPIO', NULL, 3000, 'PYG') \gset
SELECT pg_temp.ok((SELECT ventas_mes - :v0 FROM v_dashboard_resumen WHERE empresa_id = :'e') = 30000, 'dashboard.ventas_mes sube exactamente 10 x 3000 = 30000');
SELECT pg_temp.ok((SELECT costo_ventas_mes > :c0 AND movimientos_mes = :m0 + 1 FROM v_dashboard_resumen WHERE empresa_id = :'e'), 'dashboard: costo de ventas y movimientos del mes aumentan');
SELECT inventario_anular_movimiento(:'e', :'u', :'mv', 'Venta de prueba anulada') \gset
SELECT pg_temp.ok((SELECT ventas_mes = :v0 FROM v_dashboard_resumen WHERE empresa_id = :'e'), 'dashboard: anular la venta revierte ventas_mes');

-- Reporte de costo con subtotal por depósito y total general (ROLLUP), como alimentaría el XLSX
SELECT pg_temp.ok((
  SELECT count(*) FROM (
    SELECT deposito_codigo, producto_codigo, sum(valor_total) v
      FROM v_valoracion_stock WHERE empresa_id = :'e' GROUP BY ROLLUP (deposito_codigo, producto_codigo)) r
   WHERE deposito_codigo IS NULL AND producto_codigo IS NULL AND v = (SELECT valor_stock FROM v_dashboard_resumen WHERE empresa_id = :'e')) = 1, 'ROLLUP: el total general del reporte = valor de stock del dashboard');
SELECT pg_temp.ok((SELECT count(*) FROM v_ventas_al_costo WHERE empresa_id = :'e' AND estado_costo = 'CON_COSTO') = (SELECT count(*) FROM v_ventas_al_costo WHERE empresa_id = :'e'), 'toda venta del modelo tiene costo congelado');
SELECT pg_temp.ok((SELECT min(margen_pct) > 0 FROM v_ventas_al_costo WHERE empresa_id = :'e'), 'márgenes positivos en las ventas ficticias');
-- Historial de movimientos
SELECT pg_temp.ok((SELECT count(*) FROM v_movimientos_detalle WHERE empresa_id = :'e') = (SELECT count(*) FROM movimiento_lineas WHERE empresa_id = :'e'), 'v_movimientos_detalle: una fila por línea');
-- Listas de precios con ítems reales
SELECT pg_temp.ok((SELECT count(*) FROM lista_precio_items i JOIN listas_precio l ON l.id = i.lista_precio_id AND l.empresa_id = i.empresa_id WHERE i.empresa_id = :'e') = 48, 'listas de precios: 2 listas x 24 productos = 48 ítems');
SELECT pg_temp.ok((SELECT count(*) FROM lista_precio_escalones WHERE empresa_id = :'e') = 4, 'escalones por volumen cargados');
