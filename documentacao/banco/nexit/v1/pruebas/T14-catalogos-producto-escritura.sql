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

-- Sesiones reales (el secreto solo lo conoce quien llama; en la BD solo queda su hash bcrypt)
INSERT INTO sesiones_usuario (empresa_id, usuario_id, token_hash, expira_at) VALUES
  (:'ea', :'ua', crypt('secreto-a', gen_salt('bf', 10)), now() + interval '1 hour'),
  (:'eb', :'ub', crypt('secreto-b', gen_salt('bf', 10)), now() + interval '1 hour'),
  (:'ea', :'us', crypt('secreto-s', gen_salt('bf', 10)), now() + interval '1 hour');
SELECT id AS sa FROM sesiones_usuario WHERE usuario_id = :'ua' \gset
SELECT id AS sb FROM sesiones_usuario WHERE usuario_id = :'ub' \gset
SELECT id AS ss FROM sesiones_usuario WHERE usuario_id = :'us' \gset

SET ROLE nexit_runtime;
SELECT pg_temp.falla(format($f$INSERT INTO categorias_producto (empresa_id, nombre) VALUES (%L,'directo')$f$, :'ea'), '42501', 'runtime: sin INSERT directo en categorías');
SELECT pg_temp.falla('UPDATE marcas_producto SET nombre = nombre', '42501', 'runtime: sin UPDATE directo en marcas');
SELECT pg_temp.falla('DELETE FROM marcas_producto', '42501', 'runtime: sin DELETE en marcas');
SELECT catalogo_producto_guardar(:'sa', 'secreto-a', 'CATEGORIA', NULL, ' C1 ', ' Bebidas ', true) AS ca \gset
SELECT catalogo_producto_guardar(:'sa', 'secreto-a', 'MARCA', NULL, NULL, 'Marca 1', true) AS ma \gset
SELECT catalogo_producto_guardar(:'sb', 'secreto-b', 'CATEGORIA', NULL, 'C1', 'Bebidas', true) AS cb \gset
SELECT pg_temp.ok((SELECT codigo = 'C1' AND nombre = 'Bebidas' AND empresa_id = :'ea' FROM categorias_producto WHERE id = :'ca'), 'alta con credencial válida: empresa derivada de la sesión, sin espacios extremos');
SELECT pg_temp.ok((SELECT empresa_id = :'eb' FROM categorias_producto WHERE id = :'cb'), 'mismo nombre/código en otra empresa, con la sesión de esa empresa');
-- Intentos de representación (todos deben ser rechazados)
SELECT pg_temp.falla(format($f$SELECT catalogo_producto_guardar(%L,'x','MARCA',NULL,NULL,'Imp',true)$f$, :'ub'), '42501', 'ATAQUE: UUID del administrador de otra empresa como identidad');
SELECT pg_temp.falla(format($f$SELECT catalogo_producto_guardar(%L,'secreto-a','MARCA',NULL,NULL,'Imp',true)$f$, :'sb'), '42501', 'ATAQUE: id de sesión ajena con secreto propio');
SELECT pg_temp.falla(format($f$SELECT catalogo_producto_guardar(%L,'adivinado','MARCA',NULL,NULL,'Imp',true)$f$, :'sb'), '42501', 'ATAQUE: id de sesión ajena con secreto incorrecto');
SELECT pg_temp.falla(format($f$SELECT catalogo_producto_guardar(%L,(SELECT token_hash FROM sesiones_usuario WHERE id = %L),'MARCA',NULL,NULL,'Imp',true)$f$, :'sb', :'sb'), '42501', 'ATAQUE: el token_hash legible no sirve como secreto');
SELECT pg_temp.falla($f$SELECT catalogo_producto_guardar(NULL,NULL,'MARCA',NULL,NULL,'Imp',true)$f$, '42501', 'sin credencial');
SELECT pg_temp.falla(format($f$SELECT catalogo_producto_guardar(%L,%L,'MARCA',NULL,NULL,'x',true,%L)$f$, :'ub', :'ub', :'ea'), '42883', 'la firma antigua (empresa, usuario) ya no existe');
-- Permisos y datos
SELECT pg_temp.falla(format($f$SELECT catalogo_producto_guardar(%L,'secreto-s','MARCA',NULL,NULL,'x',true)$f$, :'ss'), '42501', 'credencial válida sin PRODUCTOS.CREAR');
SELECT pg_temp.falla(format($f$SELECT catalogo_producto_guardar(%L,'secreto-s','MARCA',%L,NULL,'x',true)$f$, :'ss', :'ma'), '42501', 'credencial válida sin PRODUCTOS.EDITAR');
SELECT pg_temp.falla(format($f$SELECT catalogo_producto_guardar(%L,'secreto-a','CATEGORIA',NULL,'c1','Otra',true)$f$, :'sa'), '23505', 'código único por empresa (sin distinguir mayúsculas)');
SELECT pg_temp.falla(format($f$SELECT catalogo_producto_guardar(%L,'secreto-a','CATEGORIA',NULL,NULL,'  BEBIDAS ',true)$f$, :'sa'), '23505', 'nombre único por empresa (mayúsculas y espacios)');
SELECT pg_temp.falla(format($f$SELECT catalogo_producto_guardar(%L,'secreto-a','CATEGORIA',%L,NULL,'Hack',true)$f$, :'sa', :'cb'), 'P0002', 'no edita registros de otra empresa');
SELECT pg_temp.falla(format($f$SELECT catalogo_producto_guardar(%L,'secreto-a','MARCA',NULL,NULL,'   ',true)$f$, :'sa'), 'P0001', 'nombre vacío rechazado');
SELECT pg_temp.falla(format($f$SELECT catalogo_producto_guardar(%L,'secreto-a','OTRO',NULL,NULL,'x',true)$f$, :'sa'), 'P0001', 'catálogo inválido rechazado');
SELECT catalogo_producto_guardar(:'sa', 'secreto-a', 'MARCA', :'ma', NULL, 'Marca 1', false) AS m2 \gset
SELECT pg_temp.ok(:'m2' = :'ma' AND (SELECT NOT activo FROM marcas_producto WHERE id = :'ma'), 'inactivar conserva el UUID');
SELECT catalogo_producto_guardar(:'sa', 'secreto-a', 'MARCA', :'ma', NULL, 'Marca 1 bis', NULL) AS m3 \gset
SELECT pg_temp.ok((SELECT NOT activo AND nombre = 'Marca 1 bis' FROM marcas_producto WHERE id = :'ma'), 'activo NULL conserva el estado');
RESET ROLE;
-- Sesión revocada / expirada / usuario bloqueado
UPDATE sesiones_usuario SET revocada_at = now() WHERE id = :'sa';
SET ROLE nexit_runtime;
SELECT pg_temp.falla(format($f$SELECT catalogo_producto_guardar(%L,'secreto-a','MARCA',NULL,NULL,'Rev',true)$f$, :'sa'), '42501', 'sesión revocada rechazada');
RESET ROLE;
SELECT pg_temp.ok((SELECT nombre = 'Bebidas' FROM categorias_producto WHERE id = :'cb'), 'categoría de la otra empresa intacta');
