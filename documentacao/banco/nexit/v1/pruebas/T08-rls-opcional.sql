-- T08 — RLS opcional (NEX-OPT): se aplica SOLO en una copia descartable. Demuestra el aislamiento a nivel de base.
-- Requiere que existan demo-modelo y otra empresa (la prueba crea demo-rls).
\i _helpers.sql
SELECT crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12)) AS h \gset
SELECT demo_crear_empresa('demo-rls', 'RLS prueba', 'admin', :'h') AS eb \gset
SELECT id AS ea FROM empresas WHERE codigo = 'demo-modelo' \gset
SELECT count(*) AS na FROM clientes WHERE empresa_id = :'ea' \gset
\i ../migraciones/opcional/NEX-OPT-rls-empresa.sql
SET ROLE nexit_runtime;
SELECT pg_temp.ok((SELECT count(*) FROM clientes) = 0, 'RLS: sin app.empresa_id el rol de ejecución ve 0 filas');
SELECT set_config('app.empresa_id', :'ea', false);
SELECT pg_temp.ok((SELECT count(*) FROM clientes) = :na AND (SELECT count(DISTINCT empresa_id) FROM clientes) = 1, 'RLS: con app.empresa_id=A solo ve los clientes de A (' || :na || ')');
SELECT pg_temp.ok((SELECT count(*) FROM productos WHERE empresa_id = :'eb') = 0, 'RLS: A no ve productos de B aunque los pida explícitamente');
SELECT pg_temp.falla(format($f$INSERT INTO cliente_contactos (empresa_id, cliente_id, nombre) SELECT %L, id, 'x' FROM clientes LIMIT 1$f$, :'eb'), NULL, 'RLS: A no puede escribir filas de B');
SELECT set_config('app.empresa_id', :'eb', false);
SELECT pg_temp.ok((SELECT count(*) FROM clientes WHERE empresa_id = :'ea') = 0, 'RLS: con app.empresa_id=B no ve nada de A');
RESET ROLE;
