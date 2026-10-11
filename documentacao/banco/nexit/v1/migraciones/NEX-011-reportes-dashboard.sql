-- =====================================================================
-- NEX-011 — Vistas de Stock, Movimientos, Reportes de costo y Dashboard
-- Fuente única de datos reales para las pantallas Stock, Movimientos, Reportes (XLSX) y Dashboard.
-- Todas son security_invoker y exponen empresa_id: la API DEBE filtrar WHERE empresa_id = <sesión>.
-- Nada aquí contiene números literales: todo se deriva de las tablas de NEX-002..010.
-- Proyecto Nexit (NEXIT-2026-001). ESTADO: V1 candidata oficial — NO ejecutar en la VM sin autorización expresa del responsable.
-- =====================================================================

-- Stock por producto y depósito (todos los estados), con mínimos del producto.
CREATE VIEW v_stock_producto_deposito WITH (security_invoker = true) AS
SELECT s.empresa_id, s.producto_id, p.codigo AS producto_codigo, p.descripcion AS producto_descripcion,
       s.deposito_id, d.codigo AS deposito_codigo, d.nombre AS deposito_nombre,
       COALESCE(sum(s.cantidad) FILTER (WHERE s.estado_stock = 'DISPONIBLE'), 0) AS disponible,
       COALESCE(sum(s.cantidad) FILTER (WHERE s.estado_stock = 'RESERVADO'), 0)  AS reservado,
       COALESCE(sum(s.cantidad) FILTER (WHERE s.estado_stock = 'CUARENTENA'), 0) AS cuarentena,
       COALESCE(sum(s.cantidad) FILTER (WHERE s.estado_stock = 'TRANSITO'), 0)   AS transito,
       p.stock_minimo, p.punto_reposicion
  FROM stock_saldos s
  JOIN productos p ON p.empresa_id = s.empresa_id AND p.id = s.producto_id
  JOIN depositos d ON d.empresa_id = s.empresa_id AND d.id = s.deposito_id
 GROUP BY s.empresa_id, s.producto_id, p.codigo, p.descripcion, s.deposito_id, d.codigo, d.nombre, p.stock_minimo, p.punto_reposicion;

-- Stock consolidado por producto (PROPIO), incluye productos sin saldo; alerta de mínimo.
CREATE VIEW v_stock_producto WITH (security_invoker = true) AS
SELECT p.empresa_id, p.id AS producto_id, p.codigo AS producto_codigo, p.descripcion AS producto_descripcion,
       p.controla_stock, p.stock_minimo, p.punto_reposicion, p.activo,
       COALESCE(sum(s.cantidad) FILTER (WHERE s.estado_stock = 'DISPONIBLE' AND s.propiedad = 'PROPIO'), 0) AS disponible,
       COALESCE(sum(s.cantidad) FILTER (WHERE s.estado_stock = 'RESERVADO'  AND s.propiedad = 'PROPIO'), 0) AS reservado,
       COALESCE(sum(s.cantidad) FILTER (WHERE s.estado_stock = 'CUARENTENA' AND s.propiedad = 'PROPIO'), 0) AS cuarentena,
       COALESCE(sum(s.cantidad) FILTER (WHERE s.estado_stock = 'TRANSITO'   AND s.propiedad = 'PROPIO'), 0) AS transito,
       (p.controla_stock AND p.stock_minimo > 0
        AND COALESCE(sum(s.cantidad) FILTER (WHERE s.estado_stock = 'DISPONIBLE' AND s.propiedad = 'PROPIO'), 0) < p.stock_minimo) AS bajo_minimo
  FROM productos p
  LEFT JOIN stock_saldos s ON s.empresa_id = p.empresa_id AND s.producto_id = p.id
 GROUP BY p.empresa_id, p.id, p.codigo, p.descripcion, p.controla_stock, p.stock_minimo, p.punto_reposicion, p.activo;

-- Historial de movimientos con líneas (una fila por línea).
CREATE VIEW v_movimientos_detalle WITH (security_invoker = true) AS
SELECT m.empresa_id, m.id AS movimiento_id, m.numero_movimiento, m.fecha_movimiento, m.hora_movimiento,
       m.tipo_movimiento, m.tipo_origen, m.estado, m.documento_referencia, m.motivo, m.observacion,
       m.deposito_origen_id, dor.nombre AS deposito_origen, m.deposito_destino_id, dde.nombre AS deposito_destino,
       m.cliente_id, c.razon_social AS cliente,
       l.id AS linea_id, l.producto_id, p.codigo AS producto_codigo, p.descripcion AS producto_descripcion,
       l.cantidad, l.propiedad, l.costo_unitario, l.costo_total, l.moneda_costo_codigo,
       l.precio_venta_unitario, l.precio_venta_total, l.moneda_venta_codigo,
       m.creado_por, m.creado_at
  FROM movimientos_inventario m
  JOIN movimiento_lineas l ON l.empresa_id = m.empresa_id AND l.movimiento_id = m.id
  JOIN productos p ON p.empresa_id = l.empresa_id AND p.id = l.producto_id
  LEFT JOIN depositos dor ON dor.empresa_id = m.empresa_id AND dor.id = m.deposito_origen_id
  LEFT JOIN depositos dde ON dde.empresa_id = m.empresa_id AND dde.id = m.deposito_destino_id
  LEFT JOIN clientes c ON c.empresa_id = m.empresa_id AND c.id = m.cliente_id;

-- Ventas al costo (reporte): venta registrada como SALIDA/VENTA x costo congelado en la misma línea.
-- DEFINIR (D-C pendientes): fórmula de margen; aquí solo se calcula cuando venta y costo están en la misma moneda.
CREATE VIEW v_ventas_al_costo WITH (security_invoker = true) AS
SELECT m.empresa_id, m.id AS movimiento_id, m.numero_movimiento, m.fecha_movimiento, m.estado,
       m.cliente_id, c.razon_social AS cliente, l.id AS linea_id,
       l.producto_id, p.codigo AS producto_codigo, p.descripcion AS producto_descripcion, l.cantidad,
       l.moneda_venta_codigo, l.precio_venta_unitario, l.precio_venta_total,
       l.moneda_costo_codigo, l.costo_unitario, l.costo_total,
       CASE WHEN l.moneda_venta_codigo IS NOT NULL AND l.moneda_venta_codigo = l.moneda_costo_codigo
            THEN l.precio_venta_total - l.costo_total END AS margen_bruto,
       CASE WHEN l.moneda_venta_codigo IS NOT NULL AND l.moneda_venta_codigo = l.moneda_costo_codigo AND l.precio_venta_total > 0
            THEN round((l.precio_venta_total - l.costo_total) / l.precio_venta_total * 100, 2) END AS margen_pct,
       CASE WHEN l.costo_total IS NULL THEN 'SIN_COSTO' ELSE 'CON_COSTO' END AS estado_costo
  FROM movimientos_inventario m
  JOIN movimiento_lineas l ON l.empresa_id = m.empresa_id AND l.movimiento_id = m.id
  JOIN productos p ON p.empresa_id = l.empresa_id AND p.id = l.producto_id
  LEFT JOIN clientes c ON c.empresa_id = m.empresa_id AND c.id = m.cliente_id
 WHERE m.tipo_movimiento = 'SALIDA' AND m.tipo_origen = 'VENTA' AND m.estado = 'REGISTRADO';

-- Dashboard: una fila por empresa; TODO derivado de las tablas (sin literales).
CREATE VIEW v_dashboard_resumen WITH (security_invoker = true) AS
SELECT e.id AS empresa_id, e.moneda_base_codigo,
       (SELECT count(*) FROM clientes x WHERE x.empresa_id = e.id AND x.activo)      AS clientes_activos,
       (SELECT count(*) FROM proveedores x WHERE x.empresa_id = e.id AND x.activo)   AS proveedores_activos,
       (SELECT count(*) FROM productos x WHERE x.empresa_id = e.id AND x.activo)     AS productos_activos,
       (SELECT count(*) FROM v_stock_producto x WHERE x.empresa_id = e.id AND x.controla_stock AND x.disponible > 0) AS productos_con_stock,
       (SELECT count(*) FROM v_stock_producto x WHERE x.empresa_id = e.id AND x.bajo_minimo) AS productos_bajo_minimo,
       (SELECT COALESCE(sum(valor_total), 0) FROM inventario_costos x WHERE x.empresa_id = e.id) AS valor_stock,
       (SELECT count(*) FROM movimientos_inventario x WHERE x.empresa_id = e.id AND x.estado = 'REGISTRADO'
           AND date_trunc('month', x.fecha_movimiento) = date_trunc('month', CURRENT_DATE)) AS movimientos_mes,
       (SELECT COALESCE(sum(v.precio_venta_total), 0) FROM v_ventas_al_costo v WHERE v.empresa_id = e.id
           AND v.moneda_venta_codigo = e.moneda_base_codigo
           AND date_trunc('month', v.fecha_movimiento) = date_trunc('month', CURRENT_DATE)) AS ventas_mes,
       (SELECT COALESCE(sum(v.costo_total), 0) FROM v_ventas_al_costo v WHERE v.empresa_id = e.id
           AND v.moneda_venta_codigo = e.moneda_base_codigo
           AND date_trunc('month', v.fecha_movimiento) = date_trunc('month', CURRENT_DATE)) AS costo_ventas_mes
  FROM empresas e;

-- Dashboard: valor de stock por depósito y ventas por día (últimos 30 días).
CREATE VIEW v_dashboard_valor_por_deposito WITH (security_invoker = true) AS
SELECT empresa_id, deposito_id, deposito_codigo, deposito_nombre, sum(total_valor) AS valor_total
  FROM (SELECT ic.empresa_id, ic.deposito_id, d.codigo AS deposito_codigo, d.nombre AS deposito_nombre, ic.valor_total AS total_valor
          FROM inventario_costos ic JOIN depositos d ON d.empresa_id = ic.empresa_id AND d.id = ic.deposito_id) t
 GROUP BY empresa_id, deposito_id, deposito_codigo, deposito_nombre;

CREATE VIEW v_dashboard_ventas_por_dia WITH (security_invoker = true) AS
SELECT v.empresa_id, v.fecha_movimiento AS fecha, v.moneda_venta_codigo AS moneda,
       sum(v.precio_venta_total) AS venta, sum(v.costo_total) AS costo, count(DISTINCT v.movimiento_id) AS movimientos
  FROM v_ventas_al_costo v
 WHERE v.fecha_movimiento >= CURRENT_DATE - 30 AND v.moneda_venta_codigo IS NOT NULL
 GROUP BY v.empresa_id, v.fecha_movimiento, v.moneda_venta_codigo;

-- Siguiente número de movimiento por empresa (MOV-000001...). Serializa por empresa.
CREATE OR REPLACE FUNCTION nex_siguiente_numero_movimiento(p_empresa uuid) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('movimientos.numero:' || p_empresa::text, 0));
  SELECT COALESCE(max(substring(numero_movimiento FROM '^MOV-([0-9]+)$')::bigint), 0) + 1 INTO n
    FROM movimientos_inventario WHERE empresa_id = p_empresa;
  RETURN 'MOV-' || lpad(n::text, 6, '0');
END $$;

SELECT nex_instalar_triggers_actualizacion();
