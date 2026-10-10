-- T14 — NEX-020: Categorías y Marcas se escriben SOLO con catalogo_producto_guardar() (rol nexit_runtime sin escritura directa).
\i _helpers.sql
SELECT crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12)) AS h \gset
SELECT nex_inicializar_empresa('emp-t14a', 'Empresa A T14 SA (prueba)', '8014101', '1', 'admin.a', 'Ana', 'A', NULL, :'h') AS ea \gset
SELECT nex_inicializar_empresa('emp-t14b', 'Empresa B T14 SA (prueba)', '8014102', '2', 'admin.b', 'Beto', 'B', NULL, :'h') AS eb \gset
SELECT id AS ua FROM usuarios WHERE empresa_id = :'ea' AND usuario = 'admin.a' \gset
SELECT id AS ub FROM usuarios WHERE empresa_id = :'eb' AND usuario = 'admin.b' \gset
-- usuario sin permisos de Productos
INSERT INTO usuarios (empresa_id, usuario, nombre, password_hash) VALUES (:'ea', 'sinperm', 'Sin permisos', :'h');
SELECT id AS us FROM usuarios WHERE empresa_id = :'ea' AND usuario = 'sinperm' \gset

SET ROLE nexit_runtime;
SELECT pg_temp.falla(format($f$INSERT INTO categorias_producto (empresa_id, nombre) VALUES (%L,'directo')$f$, :'ea'), '42501', 'runtime: sin INSERT directo en categorías');
SELECT pg_temp.falla('UPDATE marcas_producto SET nombre = nombre', '42501', 'runtime: sin UPDATE directo en marcas');
SELECT pg_temp.falla('DELETE FROM marcas_producto', '42501', 'runtime: sin DELETE en marcas');
SELECT catalogo_producto_guardar(:'ea', :'ua', 'CATEGORIA', NULL, ' C1 ', ' Bebidas ', true) AS ca \gset
SELECT catalogo_producto_guardar(:'ea', :'ua', 'MARCA', NULL, NULL, 'Marca 1', true) AS ma \gset
SELECT catalogo_producto_guardar(:'eb', :'ub', 'CATEGORIA', NULL, 'C1', 'Bebidas', true) AS cb \gset
SELECT pg_temp.ok((SELECT codigo = 'C1' AND nombre = 'Bebidas' FROM categorias_producto WHERE id = :'ca'), 'alta normaliza espacios; mismo nombre/código permitido en otra empresa');
SELECT pg_temp.falla(format($f$SELECT catalogo_producto_guardar(%L,%L,'CATEGORIA',NULL,'c1','Otra',true)$f$, :'ea', :'ua'), '23505', 'código único por empresa (sin distinguir mayúsculas)');
SELECT pg_temp.falla(format($f$SELECT catalogo_producto_guardar(%L,%L,'CATEGORIA',NULL,NULL,'  BEBIDAS ',true)$f$, :'ea', :'ua'), '23505', 'nombre único por empresa (mayúsculas y espacios)');
SELECT pg_temp.falla(format($f$SELECT catalogo_producto_guardar(%L,%L,'MARCA',NULL,NULL,'x',true)$f$, :'ea', :'ub'), '42501', 'usuario de OTRA empresa rechazado');
SELECT pg_temp.falla(format($f$SELECT catalogo_producto_guardar(%L,%L,'MARCA',NULL,NULL,'x',true)$f$, :'ea', :'us'), '42501', 'usuario sin PRODUCTOS.CREAR rechazado');
SELECT pg_temp.falla(format($f$SELECT catalogo_producto_guardar(%L,%L,'CATEGORIA',%L,NULL,'Hack',true)$f$, :'ea', :'ua', :'cb'), 'P0002', 'no edita registros de otra empresa');
SELECT pg_temp.falla(format($f$SELECT catalogo_producto_guardar(%L,%L,'MARCA',NULL,NULL,'   ',true)$f$, :'ea', :'ua'), 'P0001', 'nombre vacío rechazado');
SELECT pg_temp.falla(format($f$SELECT catalogo_producto_guardar(%L,%L,'OTRO',NULL,NULL,'x',true)$f$, :'ea', :'ua'), 'P0001', 'catálogo inválido rechazado');
SELECT catalogo_producto_guardar(:'ea', :'ua', 'MARCA', :'ma', NULL, 'Marca 1', false) AS m2 \gset
SELECT pg_temp.ok(:'m2' = :'ma' AND (SELECT NOT activo FROM marcas_producto WHERE id = :'ma'), 'inactivar conserva el UUID');
SELECT catalogo_producto_guardar(:'ea', :'ua', 'MARCA', :'ma', NULL, 'Marca 1 bis', NULL) AS m3 \gset
SELECT pg_temp.ok((SELECT NOT activo AND nombre = 'Marca 1 bis' FROM marcas_producto WHERE id = :'ma'), 'activo NULL conserva el estado');
RESET ROLE;
SELECT pg_temp.ok((SELECT nombre = 'Bebidas' FROM categorias_producto WHERE id = :'cb'), 'categoría de la otra empresa intacta');
