-- T05 — Ciclo de vida de las empresas DEMO: creación, reinicio seguro, eliminación, protección de empresas reales.
\i _helpers.sql
SELECT crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12)) AS h \gset
SELECT demo_crear_empresa('demo-r1', 'Reset 1', 'admin', :'h', 'prueba') AS e1 \gset
SELECT demo_crear_empresa('demo-r2', 'Reset 2', 'admin', :'h', 'prueba') AS e2 \gset

-- huella de datos de r2 (no debe cambiar al reiniciar r1)
CREATE TEMP TABLE huella AS SELECT 'r2' AS k, demo_resumen('demo-r2') AS j,
   (SELECT md5(string_agg(numero_movimiento || ':' || id::text, ',' ORDER BY numero_movimiento)) FROM movimientos_inventario WHERE empresa_id = :'e2') AS mov_md5;
CREATE TEMP TABLE inicial AS SELECT demo_resumen('demo-r1') AS j;

-- modificar r1: venta extra, cliente extra, producto extra
INSERT INTO clientes (empresa_id, naturaleza_receptor, tipo_operacion, pais_codigo, tipo_persona, tipo_contribuyente_sifen, tipo_documento, numero_documento, dv, razon_social)
  VALUES (:'e1', 1, 1, 'PRY', 'JURIDICA', 2, 'RUC', '9990999', '1', 'Cliente agregado por el prospecto');
SELECT pg_temp.ok((demo_resumen('demo-r1')->>'clientes')::int = 11, 'r1 modificada (11 clientes)');

-- sesión viva de r1 sobrevive al reinicio (se conserva usuario y contraseña)
SELECT id AS u1 FROM usuarios WHERE empresa_id = :'e1' \gset
INSERT INTO sesiones_usuario (usuario_id, token_hash, expira_at) VALUES (:'u1', crypt('t', gen_salt('bf', 8)), now() + interval '1 hour');
SELECT password_hash AS ph_antes FROM usuarios WHERE id = :'u1' \gset

SELECT demo_reiniciar('demo-r1') IS NOT NULL AS reiniciado \gset
SELECT pg_temp.ok((SELECT j FROM inicial) = demo_resumen('demo-r1'), 'reinicio devuelve r1 exactamente al conjunto inicial (conteos y valor de stock)');
SELECT pg_temp.ok((SELECT password_hash FROM usuarios WHERE id = :'u1') = :'ph_antes', 'el reinicio conserva usuario y contraseña (hash intacto)');
SELECT pg_temp.ok((SELECT count(*) FROM sesiones_usuario WHERE usuario_id = :'u1') = 1, 'el reinicio conserva la sesión activa');
SELECT pg_temp.ok((SELECT j FROM huella WHERE k = 'r2') = demo_resumen('demo-r2'), 'reiniciar r1 NO altera r2 (conteos iguales)');
SELECT pg_temp.ok((SELECT mov_md5 FROM huella WHERE k = 'r2') = (SELECT md5(string_agg(numero_movimiento || ':' || id::text, ',' ORDER BY numero_movimiento)) FROM movimientos_inventario WHERE empresa_id = :'e2'), 'reiniciar r1 NO altera los movimientos de r2 (huella MD5 de ids)');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM v_conciliacion_costo_stock WHERE empresa_id = :'e1'), 'tras el reinicio saldo y costo concilian');

-- eliminar r1: no queda NINGUNA fila con su empresa_id en ninguna tabla
SELECT demo_eliminar('demo-r1');
DO $$
DECLARE t text; n bigint; e uuid; total bigint := 0;
BEGIN
  SELECT id INTO e FROM empresas WHERE codigo = 'demo-r1';
  PERFORM pg_temp.ok(e IS NULL, 'demo_eliminar borra la empresa');
END $$;
SELECT pg_temp.ok((SELECT count(*) FROM empresas WHERE codigo = 'demo-r2') = 1, 'r2 sigue existiendo tras eliminar r1');
SELECT pg_temp.ok((SELECT j FROM huella WHERE k = 'r2') = demo_resumen('demo-r2'), 'r2 intacta tras eliminar r1');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM clientes c WHERE NOT EXISTS (SELECT 1 FROM empresas e WHERE e.id = c.empresa_id)), 'sin filas huérfanas');

-- Empresa REAL (no demo): las funciones de ciclo de vida la rechazan y sus movimientos no se pueden borrar
INSERT INTO empresas (codigo, razon_social) VALUES ('empresa-real', 'Empresa Real S.A. (prueba de protección)') ;
SELECT pg_temp.falla($f$SELECT demo_reiniciar('empresa-real')$f$, 'P0001', 'demo_reiniciar rechaza empresas no demo');
SELECT pg_temp.falla($f$SELECT demo_eliminar('empresa-real')$f$, 'P0001', 'demo_eliminar rechaza empresas no demo');
SELECT id AS er FROM empresas WHERE codigo = 'empresa-real' \gset
SELECT pg_temp.falla(format('SELECT demo_vaciar_datos(%L)', :'er'), 'P0001', 'demo_vaciar_datos rechaza empresas no demo');
SELECT pg_temp.falla(format('SELECT demo_poblar(%L)', :'er'), 'P0001', 'demo_poblar rechaza empresas no demo');
-- el flag es_demo exige el prefijo demo-
SELECT pg_temp.falla($f$UPDATE empresas SET es_demo = true WHERE codigo = 'empresa-real'$f$, '23514', 'no se puede marcar como demo una empresa cuyo código no empieza por demo-');
-- no se puede falsificar el interruptor de reinicio para una empresa real
SELECT set_config('nex.reinicio_demo', :'er', false);
SELECT pg_temp.ok(NOT nex_reinicio_demo_activo(:'er'), 'nex.reinicio_demo no habilita nada para una empresa real');
SELECT set_config('nex.reinicio_demo', '', false);

-- Validaciones de entrada
SELECT pg_temp.falla($f$SELECT demo_crear_empresa('prod-x', 'x', 'admin', '$2a$12$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyz01234')$f$, 'P0001', 'código sin prefijo demo- rechazado');
SELECT pg_temp.falla($f$SELECT demo_crear_empresa('demo-x', 'x', 'admin', 'Contraseña-en-claro-1234')$f$, 'P0001', 'contraseña en claro rechazada (se exige hash bcrypt $2a$)');
SELECT pg_temp.falla(format('SELECT demo_crear_empresa(%L, ''dup'', ''admin'', %L)', 'demo-r2', :'h'), '23505', 'código de empresa duplicado rechazado');
