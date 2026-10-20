-- CASA MINGO | INSPECCION DE SOLO LECTURA — NO MODIFICA DATOS
-- No sustituye la revisión de las 5 claves duplicadas en el archivo Excel.
-- NEXIT Postgres 16, fuente de empresa = codigo 'casa_mingo'.
\set ON_ERROR_STOP on
\echo '=== Entorno y CASA MINGO ==='
SELECT current_database() AS base, current_user AS rol,
       id, codigo, razon_social, estado, es_demo, moneda_base_codigo
FROM empresas WHERE codigo='casa_mingo';
\echo '=== Unidad 77 / UNI / UN ==='
SELECT id, codigo, nombre, unidad_sifen_codigo, activo
FROM unidades_medida WHERE unidad_sifen_codigo=77 OR codigo='UN'
ORDER BY activo DESC, codigo;
\echo '=== IVA 10 ==='
SELECT id, codigo, nombre, porcentaje, activo
FROM impuestos WHERE codigo='IVA10' OR porcentaje=10
ORDER BY activo DESC, codigo;
\echo '=== Catalogos CASA MINGO ==='
SELECT e.codigo,
       (SELECT count(*) FROM categorias_producto x WHERE x.empresa_id=e.id) AS categorias,
       (SELECT count(*) FROM familias_producto x WHERE x.empresa_id=e.id) AS familias,
       (SELECT count(*) FROM lineas_producto x WHERE x.empresa_id=e.id) AS lineas,
       (SELECT count(*) FROM marcas_producto x WHERE x.empresa_id=e.id) AS marcas,
       (SELECT count(*) FROM productos x WHERE x.empresa_id=e.id) AS productos
FROM empresas e WHERE e.codigo='casa_mingo';
\echo '=== Lista de precios de referencia ==='
SELECT l.codigo,l.nombre,l.moneda_codigo,l.incluye_impuesto,l.tipo_lista,l.estado,l.activo,l.es_referencia,
       (SELECT count(*) FROM lista_precio_items i WHERE i.empresa_id=l.empresa_id AND i.lista_precio_id=l.id) AS items
FROM listas_precio l JOIN empresas e ON e.id=l.empresa_id
WHERE e.codigo='casa_mingo' AND l.es_referencia;
\echo '=== Empresa existente, familias sin categoria ==='
SELECT f.nombre, f.codigo, f.activo
FROM familias_producto f JOIN empresas e ON e.id=f.empresa_id
WHERE e.codigo='casa_mingo' AND f.categoria_id IS NULL
ORDER BY f.nombre;
\echo '=== Deposit(os) activos (informativo, NO habilita apertura automatica) ==='
SELECT d.id,d.codigo,d.nombre,d.activo
FROM depositos d JOIN empresas e ON e.id=d.empresa_id
WHERE e.codigo='casa_mingo'
ORDER BY d.nombre;
-- FIN SOLO LECTURA. No ejecutar COMMIT, updates, truncates ni stock.