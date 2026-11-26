-- CASA MINGO | INSPECCION DE SOLO LECTURA — NO MODIFICA DATOS
-- No sustituye la revisión de las 5 claves duplicadas en el archivo Excel.
-- NEXIT Postgres 16: empresa identificada EXCLUSIVAMENTE por UUID verificado.
\set ON_ERROR_STOP on
\if :{?empresa_uuid}
\else
  \echo 'ABORTADO: falta -v empresa_uuid=UUID_REAL_DE_CASA_MINGO. Listar empresas primero.'
  \quit 2
\endif
\echo '=== Entorno y CASA MINGO ==='
SELECT current_database() AS base, current_user AS rol,
       id, codigo, razon_social, estado, es_demo, moneda_base_codigo
FROM empresas WHERE id=:'empresa_uuid'::uuid;
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
FROM empresas e WHERE e.id=:'empresa_uuid'::uuid;
\echo '=== Lista de precios de referencia ==='
SELECT l.codigo,l.nombre,l.moneda_codigo,l.incluye_impuesto,l.tipo_lista,l.estado,l.activo,l.es_referencia,
       (SELECT count(*) FROM lista_precio_items i WHERE i.empresa_id=l.empresa_id AND i.lista_precio_id=l.id) AS items
FROM listas_precio l JOIN empresas e ON e.id=l.empresa_id
WHERE e.id=:'empresa_uuid'::uuid AND l.es_referencia;
\echo '=== Empresa existente, familias sin categoria ==='
SELECT f.nombre, f.codigo, f.activo
FROM familias_producto f JOIN empresas e ON e.id=f.empresa_id
WHERE e.id=:'empresa_uuid'::uuid AND f.categoria_id IS NULL
ORDER BY f.nombre;
\echo '=== Deposit(os) activos (informativo, NO habilita apertura automatica) ==='
SELECT d.id,d.codigo,d.nombre,d.activo
FROM depositos d JOIN empresas e ON e.id=d.empresa_id
WHERE e.id=:'empresa_uuid'::uuid
ORDER BY d.nombre;

\echo '=== Comprobaciones bloqueantes de solo lectura ==='
-- set_config modifica solo la conexion psql actual, nunca tablas ni datos persistentes.
SELECT set_config('import_casa_mingo.preflight_empresa_uuid', :'empresa_uuid', false) AS empresa_uuid_verificado;

DO $comprobacion$
DECLARE v_id uuid := current_setting('import_casa_mingo.preflight_empresa_uuid')::uuid;
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM empresas
   WHERE id=v_id AND codigo='80003314' AND razon_social='CASA MINGO S.A.'
     AND estado='ACTIVA' AND es_demo=false AND moneda_base_codigo='PYG'
 ) THEN
  RAISE EXCEPTION 'PREFLIGHT FALLO: empresa UUID no coincide con CASA MINGO S.A. / 80003314 activa, no demo, PYG';
 END IF;
 IF (SELECT count(*) FROM unidades_medida
    WHERE codigo='UN' AND nombre='Unidad' AND activo AND unidad_sifen_codigo=77) <> 1 THEN
  RAISE EXCEPTION 'PREFLIGHT FALLO: unidad UN sin codigo SIFEN 77; ejecutar correccion GLOBAL por separado despues de respaldo';
 END IF;
 IF (SELECT count(*) FROM impuestos
    WHERE codigo='IVA10' AND porcentaje=10 AND activo) <> 1 THEN
  RAISE EXCEPTION 'PREFLIGHT FALLO: impuesto IVA10 incorrecto o ausente';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM listas_precio
    WHERE empresa_id=v_id AND es_referencia AND codigo='REF-VENTA'
      AND moneda_codigo='PYG' AND incluye_impuesto AND tipo_lista='VENTA'
      AND estado='ACTIVA' AND activo) THEN
  RAISE EXCEPTION 'PREFLIGHT FALLO: lista de referencia REF-VENTA no compatible';
 END IF;
END $comprobacion$;

\echo 'PREFLIGHT COMPLETADO: los parametros basicos permiten proceder a validar importacion tras respaldo.'
-- FIN SOLO LECTURA. No ejecutar COMMIT, updates, truncates ni stock.