-- CASA MINGO | PREFLIGHT DE STOCK PARA 561 PRODUCTOS IMPORTADOS CON CANTIDADES REALES
-- Solo lectura. NO inserta stock, no altera costos, no altera saldos.
-- 465 positivos originales, 89 ceros explicitos, 7 sin dato=10; total 91864.
-- Objetivo: cantidades exactas del Excel y 10 unidades SOLO en 7 vacios
-- Deposito DEP-PRINCIPAL. Los 2 productos PRD-000001/2 NO estan incluidos.
\set ON_ERROR_STOP on
\echo '=== Empresa y deposito ==='
SELECT e.id AS empresa_id, e.codigo, e.razon_social, e.estado,
       d.id AS deposito_id, d.codigo AS deposito, d.activo
FROM empresas e JOIN depositos d ON d.empresa_id=e.id AND d.codigo='DEP-PRINCIPAL'
WHERE e.id='12463e0f-55f7-4a0c-aad1-dc0681ca68b7'::uuid
  AND e.codigo='80003314' AND e.razon_social='CASA MINGO S.A.';

\echo '=== Personal con permiso y alcance de deposito ==='
SELECT u.id AS usuario_uuid, u.usuario, u.estado, u.alcance_depositos,
       usuario_tiene_permiso(u.empresa_id,u.id,'MOVIMIENTOS','CREAR') AS puede_crear_movimiento,
       usuario_puede_deposito(u.empresa_id,u.id,d.id) AS puede_operar_deposito
FROM usuarios u JOIN depositos d ON d.empresa_id=u.empresa_id AND d.codigo='DEP-PRINCIPAL'
WHERE u.empresa_id='12463e0f-55f7-4a0c-aad1-dc0681ca68b7'::uuid
ORDER BY u.usuario;

\echo '=== Integridad de 561 productos y saldos ==='
WITH elegibles AS (
 SELECT p.id,p.codigo,p.activo,p.controla_stock,p.modo_control_stock
 FROM productos p
 WHERE p.empresa_id='12463e0f-55f7-4a0c-aad1-dc0681ca68b7'::uuid
   AND p.codigo ~ '^[0-9]{1,20}$'
), stock AS (
 SELECT s.producto_id,
        COALESCE(SUM(s.cantidad) FILTER (
            WHERE s.estado_stock='DISPONIBLE' AND s.propiedad='PROPIO'
        ),0) AS disponible_en_principal,
        COALESCE(SUM(s.cantidad),0) AS cualquier_saldo_en_principal
 FROM stock_saldos s
 WHERE s.empresa_id='12463e0f-55f7-4a0c-aad1-dc0681ca68b7'::uuid
   AND s.deposito_id='a207eebb-aca7-42d3-bdab-373f4f08523b'::uuid
 GROUP BY s.producto_id
)
SELECT COUNT(*) AS productos_importados,
       COUNT(*) FILTER (WHERE p.activo AND p.controla_stock AND p.modo_control_stock='CANTIDAD') AS aptos_stock,
       COUNT(*) FILTER (WHERE NOT p.activo OR NOT p.controla_stock OR p.modo_control_stock<>'CANTIDAD') AS no_aptos,
       COUNT(*) FILTER (WHERE COALESCE(s.disponible_en_principal,0)>0) AS ya_con_stock_disponible,
       COUNT(*) FILTER (WHERE COALESCE(s.cualquier_saldo_en_principal,0)<>0) AS con_cualquier_saldo
FROM elegibles p LEFT JOIN stock s ON s.producto_id=p.id;

\echo '=== Productos inaptos o con saldo previo (si hay, parar) ==='
SELECT p.codigo,p.descripcion,p.activo,p.controla_stock,p.modo_control_stock,
       COALESCE(SUM(s.cantidad),0) AS saldo_existente_principal
FROM productos p
LEFT JOIN stock_saldos s ON s.empresa_id=p.empresa_id AND s.producto_id=p.id
   AND s.deposito_id='a207eebb-aca7-42d3-bdab-373f4f08523b'::uuid
WHERE p.empresa_id='12463e0f-55f7-4a0c-aad1-dc0681ca68b7'::uuid
  AND p.codigo ~ '^[0-9]{1,20}$'
GROUP BY p.id,p.codigo,p.descripcion,p.activo,p.controla_stock,p.modo_control_stock
HAVING NOT p.activo OR NOT p.controla_stock OR p.modo_control_stock<>'CANTIDAD' OR COALESCE(SUM(s.cantidad),0)<>0
ORDER BY p.codigo;
-- ATENCION: este preflight no autoriza entrada sin costo ni sustitue backup.
