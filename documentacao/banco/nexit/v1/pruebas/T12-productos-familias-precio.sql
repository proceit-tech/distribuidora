-- T12 — NEX-017: familias/líneas (aislamiento y coherencia), precio de venta de referencia (lista de referencia) y alta de producto + inventario inicial.
\i _helpers.sql
SELECT crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12)) AS h \gset
SELECT nex_inicializar_empresa('emp-t12a', 'Empresa A T12 SA (prueba)', '8012101', '1', 'admin.a', 'Ana', 'A', NULL, :'h') AS ea \gset
SELECT nex_inicializar_empresa('emp-t12b', 'Empresa B T12 SA (prueba)', '8012102', '2', 'admin.b', 'Beto', 'B', NULL, :'h') AS eb \gset
SELECT id AS ua FROM usuarios WHERE empresa_id = :'ea' AND usuario = 'admin.a' \gset
SELECT id AS da FROM depositos WHERE empresa_id = :'ea' LIMIT 1 \gset
SELECT id AS un FROM unidades_medida WHERE activo ORDER BY codigo LIMIT 1 \gset

-- ===== Familias y líneas =====
INSERT INTO familias_producto (empresa_id, codigo, nombre) VALUES (:'ea','FAM1','Vasos'), (:'eb','FAM1','Vasos');
SELECT id AS fa FROM familias_producto WHERE empresa_id = :'ea' \gset
SELECT id AS fb FROM familias_producto WHERE empresa_id = :'eb' \gset
INSERT INTO familias_producto (empresa_id, codigo, nombre) VALUES (:'ea','FAM2','Platos');
SELECT id AS fa2 FROM familias_producto WHERE empresa_id = :'ea' AND codigo = 'FAM2' \gset
INSERT INTO lineas_producto (empresa_id, familia_id, codigo, nombre) VALUES (:'ea', :'fa', 'L1', 'Cristal'), (:'eb', :'fb', 'L1', 'Cristal');
SELECT id AS la FROM lineas_producto WHERE empresa_id = :'ea' \gset
SELECT id AS lb FROM lineas_producto WHERE empresa_id = :'eb' \gset
SELECT pg_temp.ok((SELECT count(*) = 2 FROM familias_producto WHERE codigo = 'FAM1') AND (SELECT count(*) = 2 FROM lineas_producto WHERE codigo = 'L1'),
  'mismo código/nombre permitido en empresas distintas');
SELECT pg_temp.falla(format($f$INSERT INTO familias_producto (empresa_id, codigo, nombre) VALUES (%L,'fam1','Otra')$f$, :'ea'), '23505', 'código de familia único por empresa (sin distinguir mayúsculas)');
SELECT pg_temp.falla(format($f$INSERT INTO familias_producto (empresa_id, nombre) VALUES (%L,' vasos ')$f$, :'ea'), '23505', 'nombre de familia único por empresa');
SELECT pg_temp.falla(format($f$INSERT INTO familias_producto (empresa_id, nombre) VALUES (%L,'   ')$f$, :'ea'), '23514', 'nombre de familia vacío rechazado');
SELECT pg_temp.falla(format($f$INSERT INTO lineas_producto (empresa_id, familia_id, nombre) VALUES (%L,%L,'Intrusa')$f$, :'ea', :'fb'), '23503', 'una línea no puede colgar de la familia de OTRA empresa');
SELECT pg_temp.falla(format($f$INSERT INTO lineas_producto (empresa_id, familia_id, nombre) VALUES (%L,%L,'cristal')$f$, :'ea', :'fa'), '23505', 'nombre de línea único dentro de la familia');

-- ===== Productos: coherencia familia/línea =====
INSERT INTO productos (empresa_id, codigo, descripcion, descripcion_factura, unidad_medida_id, familia_id, linea_id, creado_por)
  VALUES (:'ea', 'P1', 'Vaso 1', 'Vaso 1', :'un', :'fa', :'la', :'ua');
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM productos WHERE empresa_id = :'ea' AND codigo = 'P1' AND familia_id = :'fa' AND linea_id = :'la'), 'producto con familia y línea coherentes');
SELECT pg_temp.falla(format($f$INSERT INTO productos (empresa_id, codigo, descripcion, descripcion_factura, unidad_medida_id, familia_id, linea_id) VALUES (%L,'P2','x','x',%L,%L,%L)$f$, :'ea', :'un', :'fa2', :'la'), '23503', 'la línea debe pertenecer a la familia del producto');
SELECT pg_temp.falla(format($f$INSERT INTO productos (empresa_id, codigo, descripcion, descripcion_factura, unidad_medida_id, familia_id) VALUES (%L,'P3','x','x',%L,%L)$f$, :'ea', :'un', :'fb'), '23503', 'el producto no puede usar la familia de otra empresa');
SELECT pg_temp.falla(format($f$INSERT INTO productos (empresa_id, codigo, descripcion, descripcion_factura, unidad_medida_id, linea_id) VALUES (%L,'P4','x','x',%L,%L)$f$, :'ea', :'un', :'la'), '23514', 'línea sin familia rechazada');
SELECT pg_temp.falla(format($f$DELETE FROM familias_producto WHERE id = %L$f$, :'fa'), '23503', 'no se borra una familia con líneas/productos');
SELECT pg_temp.ok((SELECT count(*) = 0 FROM familias_producto WHERE empresa_id = :'eb' AND id = :'fa'), 'la empresa B no ve familias de A');

-- ===== Precio de venta de referencia =====
SELECT id AS p1 FROM productos WHERE empresa_id = :'ea' AND codigo = 'P1' \gset
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM v_producto_precio_referencia WHERE empresa_id = :'ea') AND lista_precio_referencia(:'ea', false) IS NULL,
  'sin precio cargado: no hay lista ni precio (nada inventado)');
SELECT producto_fijar_precio_referencia(:'ea', :'p1', 15000) AS mon \gset
SELECT pg_temp.ok(:'mon' = (SELECT moneda_base_codigo FROM empresas WHERE id = :'ea'), 'el precio se guarda con la moneda base de la empresa');
SELECT pg_temp.ok((SELECT precio = 15000 AND moneda = :'mon' FROM v_producto_precio_referencia WHERE empresa_id = :'ea' AND producto_id = :'p1'), 'precio de referencia recuperado con su moneda');
SELECT producto_fijar_precio_referencia(:'ea', :'p1', 17500.5);
SELECT pg_temp.ok((SELECT count(*) = 1 AND max(precio) = 17500.5 FROM v_producto_precio_referencia WHERE empresa_id = :'ea') AND (SELECT count(*) = 1 FROM listas_precio WHERE empresa_id = :'ea' AND es_referencia),
  'actualizar el precio no duplica ítems ni listas');
SELECT pg_temp.ok((SELECT count(*) = 0 FROM v_producto_precio_referencia WHERE empresa_id = :'eb') AND lista_precio_referencia(:'eb', false) IS NULL, 'la empresa B no ve el precio ni la lista de A');
SELECT pg_temp.falla(format($f$SELECT producto_fijar_precio_referencia(%L, %L, 10)$f$, :'eb', :'p1'), 'P0001', 'no se fija precio a un producto de otra empresa');
SELECT pg_temp.falla(format($f$SELECT producto_fijar_precio_referencia(%L, %L, -1)$f$, :'ea', :'p1'), 'P0001', 'precio negativo rechazado');
SELECT pg_temp.falla(format($f$INSERT INTO listas_precio (empresa_id, codigo, nombre, es_referencia) VALUES (%L,'REF2','otra',true)$f$, :'ea'), '23505', 'una sola lista de referencia por empresa');
SELECT pg_temp.falla(format($f$UPDATE listas_precio SET tipo_lista = 'COMPRA' WHERE empresa_id = %L AND es_referencia$f$, :'ea'), '23514', 'la lista de referencia debe ser de VENTA');
SELECT producto_fijar_precio_referencia(:'ea', :'p1', NULL) AS q \gset
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM v_producto_precio_referencia WHERE empresa_id = :'ea' AND producto_id = :'p1'), 'quitar el precio vuelve a "sin precio"');

-- ===== Inventario inicial: movimiento real (ENTRADA / ABERTURA) y saldos =====
SELECT o_numero AS num FROM inventario_registrar_movimiento(:'ea', :'ua', 'ENTRADA', 'ABERTURA', NULL, NULL, :'da',
  jsonb_build_array(jsonb_build_object('producto_id', :'p1', 'cantidad', 12, 'costo_unitario', 8000)), 'apertura-t12-p1', NULL, 'Inventario inicial', NULL, NULL) \gset
SELECT pg_temp.ok((SELECT disponible = 12 FROM v_stock_producto WHERE empresa_id = :'ea' AND producto_id = :'p1'), 'v_stock_producto refleja el inventario inicial');
SELECT pg_temp.ok((SELECT cantidad = 12 FROM stock_saldos WHERE empresa_id = :'ea' AND producto_id = :'p1' AND deposito_id = :'da'), 'saldo por empresa+producto+depósito');
SELECT pg_temp.ok((SELECT tipo_origen = 'ABERTURA' AND tipo_movimiento = 'ENTRADA' AND deposito_destino_id = :'da' FROM movimientos_inventario WHERE empresa_id = :'ea' AND numero_movimiento = :'num'), 'movimiento ABERTURA con depósito y trazabilidad');
SELECT pg_temp.ok((SELECT costo_promedio = 8000 AND cantidad_valorizada = 12 FROM v_producto_costo_promedio WHERE empresa_id = :'ea' AND producto_id = :'p1'), 'costo promedio sale de inventario_costos (cálculo aprobado, sin regla nueva)');
SELECT pg_temp.falla(format($f$SELECT * FROM inventario_registrar_movimiento(%L,%L,'ENTRADA','ABERTURA',NULL,NULL,%L,jsonb_build_array(jsonb_build_object('producto_id',%L,'cantidad',5)),NULL,NULL,NULL,NULL,NULL)$f$, :'ea', :'ua', :'da', :'p1'), 'P0001', 'apertura sin costo rechazada (no se inventa costo)');

-- ===== Rol de ejecución: permisos sobre las tablas nuevas =====
SET ROLE nexit_runtime;
SELECT pg_temp.ok(has_table_privilege('nexit_runtime','familias_producto','INSERT') AND has_table_privilege('nexit_runtime','lineas_producto','UPDATE')
              AND has_table_privilege('nexit_runtime','v_producto_precio_referencia','SELECT') AND has_table_privilege('nexit_runtime','v_producto_costo_promedio','SELECT'), 'nexit_runtime: escribe familias/líneas y lee las vistas nuevas');
SELECT pg_temp.ok(NOT has_table_privilege('nexit_runtime','stock_saldos','INSERT') AND NOT has_table_privilege('nexit_runtime','inventario_costos','UPDATE'), 'nexit_runtime: sigue sin escribir saldos/costos directamente');
SELECT pg_temp.ok(has_function_privilege('nexit_runtime','producto_fijar_precio_referencia(uuid,uuid,numeric)','EXECUTE') AND has_function_privilege('nexit_runtime','lista_precio_referencia(uuid,boolean)','EXECUTE'), 'nexit_runtime: ejecuta las funciones de precio de referencia');
RESET ROLE;
