-- ============================================================================
-- DistribuNex | Migration 014 - Vistas de reportes operativos y gerenciales
-- Ejecutar DESPUÉS de 013_auditoria_seguridad_cierres.sql
-- ============================================================================
BEGIN;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '013') THEN
        RAISE EXCEPTION 'La migration 013 debe ejecutarse antes de la 014.';
    END IF;
END $$;

-- Estoques por produto, proprietário, depósito, localização, lote e estado.
-- quantidade_disponivel = físico - reservado; não mistura stock próprio com
-- mercadoria de clientes armazenada na distribuidora.
CREATE OR REPLACE VIEW vw_stock_actual AS
SELECT
    p.empresa_id,
    e.id AS existencia_id,
    p.id AS producto_id, p.codigo AS producto_codigo, p.descripcion AS producto_descripcion,
    um.codigo AS unidad_medida_codigo,
    ps.id AS propietario_id, ps.tipo AS propietario_tipo,
    c.id AS cliente_propietario_id, c.codigo AS cliente_propietario_codigo,
    c.razon_social AS cliente_propietario_nombre,
    d.id AS deposito_id, d.codigo AS deposito_codigo, d.nombre AS deposito_nombre,
    u.id AS ubicacion_id, u.codigo AS ubicacion_codigo, u.nombre AS ubicacion_nombre,
    l.id AS lote_id, l.codigo_lote, l.fecha_vencimiento,
    e.estado_stock, e.cantidad_fisica, e.cantidad_reservada,
    e.cantidad_fisica - e.cantidad_reservada AS cantidad_disponible,
    p.stock_minimo, p.punto_reposicion, p.modo_control_stock, p.requiere_vencimiento
FROM existencias e
JOIN productos p ON p.id = e.producto_id
JOIN unidades_medida um ON um.id = p.unidad_medida_id
JOIN propietarios_stock ps ON ps.id = e.propietario_id
LEFT JOIN clientes c ON c.id = ps.cliente_id
JOIN depositos d ON d.id = e.deposito_id
LEFT JOIN ubicaciones_deposito u ON u.id = e.ubicacion_id
LEFT JOIN lotes_stock l ON l.id = e.lote_id;

-- Resumo por produto para reposição: somente stock próprio, disponível e ativo.
CREATE OR REPLACE VIEW vw_alertas_stock AS
SELECT
    p.empresa_id, p.id AS producto_id, p.codigo AS producto_codigo, p.descripcion AS producto_descripcion,
    um.codigo AS unidad_medida_codigo, d.id AS deposito_id, d.codigo AS deposito_codigo, d.nombre AS deposito_nombre,
    COALESCE(SUM(e.cantidad_fisica) FILTER (WHERE e.estado_stock = 'DISPONIBLE'), 0) AS cantidad_fisica_disponible,
    COALESCE(SUM(e.cantidad_reservada) FILTER (WHERE e.estado_stock = 'DISPONIBLE'), 0) AS cantidad_reservada_disponible,
    COALESCE(SUM(e.cantidad_fisica - e.cantidad_reservada) FILTER (WHERE e.estado_stock = 'DISPONIBLE'), 0) AS cantidad_disponible,
    p.stock_minimo, p.punto_reposicion,
    CASE
        WHEN COALESCE(SUM(e.cantidad_fisica - e.cantidad_reservada) FILTER (WHERE e.estado_stock = 'DISPONIBLE'), 0) <= 0 THEN 'SIN_STOCK'
        WHEN COALESCE(SUM(e.cantidad_fisica - e.cantidad_reservada) FILTER (WHERE e.estado_stock = 'DISPONIBLE'), 0) <= p.stock_minimo THEN 'BAJO'
        WHEN p.punto_reposicion IS NOT NULL
         AND COALESCE(SUM(e.cantidad_fisica - e.cantidad_reservada) FILTER (WHERE e.estado_stock = 'DISPONIBLE'), 0) <= p.punto_reposicion THEN 'REPOSICION'
        ELSE 'NORMAL'
    END AS nivel_alerta
FROM productos p
JOIN unidades_medida um ON um.id = p.unidad_medida_id
JOIN propietarios_stock ps ON ps.empresa_id = p.empresa_id AND ps.tipo = 'EMPRESA' AND ps.activo
JOIN sucursales ds ON ds.empresa_id = p.empresa_id AND ds.activo
JOIN depositos d ON d.sucursal_id = ds.id AND d.activo
LEFT JOIN existencias e ON e.producto_id = p.id AND e.propietario_id = ps.id AND e.deposito_id = d.id
WHERE p.activo AND p.controla_stock
GROUP BY p.empresa_id, p.id, p.codigo, p.descripcion, um.codigo,
         d.id, d.codigo, d.nombre, p.stock_minimo, p.punto_reposicion;

CREATE OR REPLACE VIEW vw_lotes_por_vencer AS
SELECT
    s.empresa_id, s.producto_id, s.producto_codigo, s.producto_descripcion,
    s.propietario_id, s.propietario_tipo, s.cliente_propietario_id, s.cliente_propietario_nombre,
    s.deposito_id, s.deposito_codigo, s.deposito_nombre, s.lote_id, s.codigo_lote,
    s.fecha_vencimiento,
    s.fecha_vencimiento - current_date AS dias_para_vencer,
    SUM(s.cantidad_fisica) AS cantidad_fisica,
    SUM(s.cantidad_reservada) AS cantidad_reservada,
    SUM(s.cantidad_disponible) AS cantidad_disponible,
    CASE WHEN s.fecha_vencimiento < current_date THEN 'VENCIDO'
         WHEN s.fecha_vencimiento <= current_date + 30 THEN 'PROXIMO_A_VENCER'
         ELSE 'VIGENTE' END AS estado_vencimiento
FROM vw_stock_actual s
WHERE s.fecha_vencimiento IS NOT NULL AND s.cantidad_fisica > 0
GROUP BY s.empresa_id, s.producto_id, s.producto_codigo, s.producto_descripcion,
         s.propietario_id, s.propietario_tipo, s.cliente_propietario_id, s.cliente_propietario_nombre,
         s.deposito_id, s.deposito_codigo, s.deposito_nombre, s.lote_id, s.codigo_lote, s.fecha_vencimiento;

CREATE OR REPLACE VIEW vw_unidades_identificadas_actual AS
SELECT
    p.empresa_id, ui.id AS unidad_id, ui.etiqueta, ui.estado,
    p.id AS producto_id, p.codigo AS producto_codigo, p.descripcion AS producto_descripcion,
    ps.id AS propietario_id, ps.tipo AS propietario_tipo,
    c.id AS cliente_propietario_id, c.razon_social AS cliente_propietario_nombre,
    d.id AS deposito_id, d.codigo AS deposito_codigo,
    u.id AS ubicacion_id, u.codigo AS ubicacion_codigo,
    l.id AS lote_id, l.codigo_lote, COALESCE(ui.fecha_vencimiento, l.fecha_vencimiento) AS fecha_vencimiento,
    ui.created_at, ui.updated_at
FROM unidades_identificadas ui
JOIN productos p ON p.id = ui.producto_id
JOIN propietarios_stock ps ON ps.id = ui.propietario_id
LEFT JOIN clientes c ON c.id = ps.cliente_id
LEFT JOIN depositos d ON d.id = ui.deposito_id
LEFT JOIN ubicaciones_deposito u ON u.id = ui.ubicacion_id
LEFT JOIN lotes_stock l ON l.id = ui.lote_id;

CREATE OR REPLACE VIEW vw_cuentas_cobrar_pendientes AS
SELECT
    cc.empresa_id, cc.id AS cuenta_cobrar_id, cc.documento_tipo, cc.documento_numero,
    cc.venta_id, cc.fecha_emision, cc.fecha_vencimiento, cc.moneda_codigo,
    cc.monto_original, cc.saldo, cc.estado,
    c.id AS cliente_id, c.codigo AS cliente_codigo, c.razon_social AS cliente_nombre,
    CASE WHEN cc.fecha_vencimiento IS NULL THEN 0
         ELSE GREATEST(current_date - cc.fecha_vencimiento, 0) END AS dias_vencido,
    CASE WHEN cc.fecha_vencimiento IS NOT NULL AND cc.fecha_vencimiento < current_date THEN true ELSE false END AS vencida
FROM cuentas_cobrar cc
JOIN clientes c ON c.id = cc.cliente_id
WHERE cc.estado IN ('PENDIENTE','PARCIAL','VENCIDA') AND cc.saldo > 0;

CREATE OR REPLACE VIEW vw_cuentas_pagar_pendientes AS
SELECT
    fp.empresa_id, fp.id AS factura_proveedor_id, fp.numero_documento,
    fp.fecha_emision, fp.fecha_vencimiento, fp.moneda_codigo,
    fp.total, fp.saldo, fp.estado,
    pr.id AS proveedor_id, pr.codigo AS proveedor_codigo, pr.razon_social AS proveedor_nombre,
    CASE WHEN fp.fecha_vencimiento IS NULL THEN 0
         ELSE GREATEST(current_date - fp.fecha_vencimiento, 0) END AS dias_vencido,
    CASE WHEN fp.fecha_vencimiento IS NOT NULL AND fp.fecha_vencimiento < current_date THEN true ELSE false END AS vencida
FROM facturas_proveedor fp
JOIN proveedores pr ON pr.id = fp.proveedor_id
WHERE fp.estado IN ('REGISTRADA','PARCIAL_PAGADA') AND fp.saldo > 0;

-- Totais sempre separados por moeda. A interface não deve somar moedas distintas.
CREATE OR REPLACE VIEW vw_ventas_diarias AS
SELECT
    v.empresa_id, v.sucursal_id, v.fecha, v.moneda_codigo,
    COUNT(*) AS cantidad_ventas,
    SUM(v.subtotal) AS subtotal, SUM(v.descuento_total) AS descuento_total,
    SUM(v.impuesto_total) AS impuesto_total, SUM(v.total) AS total
FROM ventas v
WHERE v.estado IN ('CONFIRMADA','FACTURADA')
GROUP BY v.empresa_id, v.sucursal_id, v.fecha, v.moneda_codigo;

CREATE OR REPLACE VIEW vw_compras_diarias AS
SELECT
    fp.empresa_id, fp.sucursal_id, fp.fecha_emision AS fecha, fp.moneda_codigo,
    COUNT(*) AS cantidad_facturas, SUM(fp.subtotal) AS subtotal,
    SUM(fp.impuesto_total) AS impuesto_total, SUM(fp.total) AS total
FROM facturas_proveedor fp
WHERE fp.estado <> 'ANULADA'
GROUP BY fp.empresa_id, fp.sucursal_id, fp.fecha_emision, fp.moneda_codigo;

CREATE OR REPLACE VIEW vw_entregas_operativas AS
SELECT
    e.empresa_id, e.sucursal_id, e.id AS entrega_id, e.numero, e.fecha_programada,
    e.fecha_entrega, e.estado, e.cliente_id, c.codigo AS cliente_codigo,
    c.razon_social AS cliente_nombre, e.hoja_ruta_id, hr.numero AS hoja_ruta_numero,
    re.codigo AS ruta_codigo, re.nombre AS ruta_nombre,
    vh.codigo AS vehiculo_codigo, vh.placa AS vehiculo_placa,
    COALESCE(ln.cantidad_lineas, 0) AS cantidad_lineas,
    COALESCE(ln.cantidad_programada, 0) AS cantidad_programada,
    COALESCE(ln.cantidad_entregada, 0) AS cantidad_entregada,
    COALESCE(ln.cantidad_devuelta, 0) AS cantidad_devuelta,
    COALESCE(inc.incidencias_abiertas, 0) AS incidencias_abiertas
FROM entregas e
JOIN clientes c ON c.id = e.cliente_id
LEFT JOIN hojas_ruta hr ON hr.id = e.hoja_ruta_id
LEFT JOIN rutas_entrega re ON re.id = hr.ruta_id
LEFT JOIN vehiculos vh ON vh.id = hr.vehiculo_id
LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cantidad_lineas, SUM(cantidad_programada) AS cantidad_programada,
           SUM(cantidad_entregada) AS cantidad_entregada, SUM(cantidad_devuelta) AS cantidad_devuelta
      FROM entrega_lineas WHERE entrega_id = e.id
) ln ON true
LEFT JOIN LATERAL (
    SELECT COUNT(*) AS incidencias_abiertas FROM incidencias_entrega
     WHERE entrega_id = e.id AND resuelta_at IS NULL
) inc ON true;

CREATE OR REPLACE VIEW vw_picking_pendiente AS
SELECT
    op.empresa_id, op.sucursal_id, op.deposito_id, d.codigo AS deposito_codigo,
    op.id AS orden_picking_id, op.numero, op.prioridad, op.estado,
    op.pedido_id, op.venta_id, op.created_at, op.iniciado_at,
    COUNT(opl.id) AS cantidad_lineas,
    COUNT(opl.id) FILTER (WHERE opl.estado = 'FALTANTE') AS lineas_faltantes,
    COALESCE(SUM(opl.cantidad_solicitada), 0) AS cantidad_solicitada,
    COALESCE(SUM(opl.cantidad_preparada), 0) AS cantidad_preparada
FROM ordenes_picking op
JOIN depositos d ON d.id = op.deposito_id
LEFT JOIN orden_picking_lineas opl ON opl.orden_picking_id = op.id
WHERE op.estado IN ('ASIGNADA','EN_PREPARACION','PARCIAL')
GROUP BY op.empresa_id, op.sucursal_id, op.deposito_id, d.codigo, op.id, op.numero,
         op.prioridad, op.estado, op.pedido_id, op.venta_id, op.created_at, op.iniciado_at;

CREATE OR REPLACE VIEW vw_documentos_fiscales AS
SELECT
    de.empresa_id, de.id AS documento_electronico_id, de.tipo_documento, de.estado,
    de.estado_gobierno, de.cdc, de.numero_fiscal, de.referencia_externa,
    de.fecha_emision, de.fecha_respuesta_gobierno, de.ultimo_envio_at,
    de.pdf_kude_url, de.xml_url, de.mensaje_estado,
    v.id AS venta_id, v.numero AS venta_numero,
    nc.id AS nota_credito_id, nc.numero AS nota_credito_numero,
    nd.id AS nota_debito_id, nd.numero AS nota_debito_numero,
    COALESCE(v.cliente_id, nc.cliente_id, nd.cliente_id) AS cliente_id,
    c.codigo AS cliente_codigo, c.razon_social AS cliente_nombre
FROM documentos_electronicos de
LEFT JOIN ventas v ON v.id = de.venta_id
LEFT JOIN notas_credito_cliente nc ON nc.id = de.nota_credito_cliente_id
LEFT JOIN notas_debito_cliente nd ON nd.id = de.nota_debito_cliente_id
LEFT JOIN clientes c ON c.id = COALESCE(v.cliente_id, nc.cliente_id, nd.cliente_id);

CREATE OR REPLACE VIEW vw_servicios_almacenamiento_pendientes AS
SELECT
    sa.empresa_id, sa.id AS servicio_id, sa.contrato_id, ca.codigo AS contrato_codigo,
    ca.cliente_id, c.codigo AS cliente_codigo, c.razon_social AS cliente_nombre,
    sa.periodo_desde, sa.periodo_hasta, sa.concepto, sa.cantidad,
    sa.precio_unitario, sa.total, sa.moneda_codigo, sa.estado
FROM servicios_almacenamiento sa
JOIN contratos_almacenamiento ca ON ca.id = sa.contrato_id
JOIN clientes c ON c.id = ca.cliente_id
WHERE sa.estado = 'PENDIENTE';

-- Indicadores sem valor monetário agregado: os valores devem vir das views
-- diárias agrupadas por moeda, evitando totais incorretos em multi-moeda.
CREATE OR REPLACE FUNCTION fn_resumen_operativo_empresa(
    p_empresa_id uuid, p_fecha date DEFAULT current_date
)
RETURNS TABLE (
    empresa_id uuid, fecha date, pedidos_activos bigint, entregas_programadas bigint,
    entregas_completadas bigint, entregas_con_incidente bigint, pickings_pendientes bigint,
    productos_sin_stock bigint, productos_stock_bajo bigint, cuentas_cobrar_vencidas bigint,
    cuentas_pagar_vencidas bigint, documentos_fiscales_pendientes bigint, documentos_fiscales_rechazados bigint
) AS $$
BEGIN
    RETURN QUERY
    SELECT p_empresa_id, p_fecha,
        (SELECT COUNT(*) FROM pedidos p WHERE p.empresa_id = p_empresa_id
            AND p.estado IN ('CONFIRMADO','PREPARACION','PARCIAL')),
        (SELECT COUNT(*) FROM entregas e WHERE e.empresa_id = p_empresa_id AND e.fecha_programada = p_fecha
            AND e.estado NOT IN ('ANULADA','CERRADA')),
        (SELECT COUNT(*) FROM entregas e WHERE e.empresa_id = p_empresa_id AND e.fecha_entrega::date = p_fecha
            AND e.estado IN ('ENTREGADA','PARCIAL','CERRADA')),
        (SELECT COUNT(*) FROM vw_entregas_operativas eo WHERE eo.empresa_id = p_empresa_id
            AND eo.fecha_programada = p_fecha AND eo.incidencias_abiertas > 0),
        (SELECT COUNT(*) FROM vw_picking_pendiente pp WHERE pp.empresa_id = p_empresa_id),
        (SELECT COUNT(DISTINCT a.producto_id) FROM vw_alertas_stock a WHERE a.empresa_id = p_empresa_id AND a.nivel_alerta = 'SIN_STOCK'),
        (SELECT COUNT(DISTINCT a.producto_id) FROM vw_alertas_stock a WHERE a.empresa_id = p_empresa_id AND a.nivel_alerta IN ('BAJO','REPOSICION')),
        (SELECT COUNT(*) FROM vw_cuentas_cobrar_pendientes cc WHERE cc.empresa_id = p_empresa_id AND cc.vencida),
        (SELECT COUNT(*) FROM vw_cuentas_pagar_pendientes cp WHERE cp.empresa_id = p_empresa_id AND cp.vencida),
        (SELECT COUNT(*) FROM documentos_electronicos de WHERE de.empresa_id = p_empresa_id
            AND de.estado IN ('PENDIENTE_ENVIO','EN_PROCESO','ERROR_TECNICO')),
        (SELECT COUNT(*) FROM documentos_electronicos de WHERE de.empresa_id = p_empresa_id
            AND de.estado = 'RECHAZADO');
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION fn_resumen_operativo_empresa(uuid, date) IS
    'Indicadores operativos para el panel. Para importes, consultar vw_ventas_diarias y vw_compras_diarias agrupadas por moneda.';

INSERT INTO schema_migrations (version, description)
VALUES ('014', 'Vistas oficiales de stock, finanzas, logística, fiscal y panel operativo')
ON CONFLICT (version) DO NOTHING;
COMMIT;