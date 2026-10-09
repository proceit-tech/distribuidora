-- T06 — Privilegios mínimos del rol de ejecución nexit_runtime (permitido / denegado).
\i _helpers.sql
SELECT id AS ea FROM empresas WHERE codigo = 'demo-modelo' \gset
SELECT id AS ub FROM usuarios WHERE empresa_id = :'ea' \gset
SET ROLE nexit_runtime;
-- Permitido
SELECT pg_temp.ok((SELECT count(*) FROM clientes) > 0, 'runtime: SELECT clientes');
SELECT pg_temp.ok((SELECT count(*) FROM v_dashboard_resumen) > 0, 'runtime: SELECT vistas de dashboard');
INSERT INTO clientes (empresa_id, naturaleza_receptor, tipo_operacion, pais_codigo, tipo_persona, tipo_contribuyente_sifen, tipo_documento, numero_documento, dv, razon_social)
  VALUES (:'ea', 1, 1, 'PRY', 'JURIDICA', 2, 'RUC', '9990888', '1', 'Alta por runtime');
SELECT pg_temp.ok(true, 'runtime: INSERT clientes');
INSERT INTO cliente_contactos (cliente_id, nombre) SELECT id, 'c' FROM clientes WHERE numero_documento = '9990888';
SELECT pg_temp.ok(true, 'runtime: INSERT hijo con herencia de empresa_id');
SELECT pg_temp.ok(nex_siguiente_numero_movimiento(:'ea') ~ '^MOV-[0-9]{6}$', 'runtime: nex_siguiente_numero_movimiento');
-- Denegado (42501 = insufficient_privilege)
SELECT pg_temp.falla('SELECT count(*) FROM schema_migrations', '42501', 'runtime: NO lee schema_migrations');
SELECT pg_temp.falla($f$INSERT INTO permisos (codigo, recurso, accion) VALUES ('X.Y','X','Y')$f$, '42501', 'runtime: NO escribe en permisos (catálogo)');
SELECT pg_temp.falla($f$INSERT INTO monedas (codigo, nombre) VALUES ('XXX','x')$f$, '42501', 'runtime: NO escribe en monedas (catálogo global)');
SELECT pg_temp.falla($f$UPDATE empresas SET razon_social = 'hack'$f$, '42501', 'runtime: NO modifica empresas');
SELECT pg_temp.falla($f$UPDATE usuarios SET password_hash = 'x'$f$, '42501', 'runtime: NO cambia password_hash');
SELECT pg_temp.falla($f$UPDATE usuarios SET estado = 'BAJA'$f$, '42501', 'runtime: NO cambia estado de usuarios');
SELECT pg_temp.falla($f$DELETE FROM movimientos_inventario$f$, '42501', 'runtime: NO borra movimientos');
SELECT pg_temp.falla($f$DELETE FROM movimiento_lineas$f$, '42501', 'runtime: NO borra líneas de movimiento');
SELECT pg_temp.falla($f$DELETE FROM eventos_seguridad$f$, '42501', 'runtime: NO borra eventos de seguridad');
SELECT pg_temp.falla($f$UPDATE movimiento_lineas SET cantidad = 1$f$, '42501', 'runtime: NO modifica líneas de movimiento');
SELECT pg_temp.falla($f$CREATE TABLE intruso (x int)$f$, '42501', 'runtime: NO crea objetos en public');
SELECT pg_temp.falla($f$SELECT demo_reiniciar('demo-modelo')$f$, '42501', 'runtime: NO ejecuta demo_reiniciar');
SELECT pg_temp.falla($f$SELECT demo_eliminar('demo-modelo')$f$, '42501', 'runtime: NO ejecuta demo_eliminar');
SELECT pg_temp.falla($f$SELECT demo_crear_empresa('demo-zz','x','a','$2a$12$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyz01234')$f$, '42501', 'runtime: NO ejecuta demo_crear_empresa');
SELECT pg_temp.falla($f$SELECT demo_poblar((SELECT id FROM empresas LIMIT 1))$f$, '42501', 'runtime: NO ejecuta demo_poblar');
SELECT pg_temp.falla($f$ALTER ROLE nexit_runtime SUPERUSER$f$, '42501', 'runtime: NO se eleva a superusuario');
RESET ROLE;
-- Nota documentada: sin RLS (aún), el rol ve filas de todas las empresas; el aislamiento depende de WHERE empresa_id = sesión en la API.
