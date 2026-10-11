-- T10 — Inicialización de la empresa real, restablecimiento de clave, sesiones (vencida/revocada/bloqueo), permisos de los nueve ítems y aislamiento entre dos empresas.
\i _helpers.sql
SELECT crypt(current_setting('nex.pw_prueba'), gen_salt('bf', 12)) AS h \gset
SELECT crypt('otra-clave-larga-456', gen_salt('bf', 12)) AS h2 \gset

-- ===== Inicialización =====
SELECT nex_inicializar_empresa('emp-t10a', 'Empresa A SA (prueba)', '8011111', '1', 'admin', 'Ana', 'A', NULL, :'h') AS ea \gset
SELECT nex_inicializar_empresa('emp-t10b', 'Empresa B SA (prueba)', '8022222', '2', 'admin', 'Beto', 'B', 'b@example.invalid', :'h') AS eb \gset
SELECT pg_temp.ok(:'ea' <> :'eb' AND (SELECT NOT es_demo FROM empresas WHERE id = :'ea'), 'inicialización: dos empresas reales (no DEMO)');
SELECT pg_temp.ok((SELECT count(*) FROM sucursales WHERE empresa_id = :'ea') = 1 AND (SELECT count(*) FROM depositos WHERE empresa_id = :'ea') = 1
              AND (SELECT count(*) FROM perfiles WHERE empresa_id = :'ea') = 2 AND (SELECT count(*) FROM medios_pago WHERE empresa_id = :'ea') = 4, 'inicialización: casa central, depósito, 2 perfiles y 4 medios de pago');
SELECT pg_temp.ok((SELECT count(*) FROM productos WHERE empresa_id = :'ea') = 0 AND (SELECT count(*) FROM clientes WHERE empresa_id = :'ea') = 0
              AND (SELECT count(*) FROM movimientos_inventario WHERE empresa_id = :'ea') = 0, 'inicialización: la empresa real nace SIN datos de negocio ni ficticios');
SELECT pg_temp.ok((SELECT password_hash <> current_setting('nex.pw_prueba') AND password_hash LIKE '$2a$12$%' AND password_hash = crypt(current_setting('nex.pw_prueba'), password_hash) FROM usuarios WHERE empresa_id = :'ea'), 'inicialización: la clave se guarda solo como hash bcrypt y valida');
SELECT pg_temp.ok((SELECT count(*) = 1 FROM eventos_seguridad WHERE empresa_id = :'ea' AND tipo = 'EMPRESA_INICIALIZADA'), 'inicialización: evento de seguridad registrado');
SELECT pg_temp.ok((SELECT ruc = '8011111' AND dv = '1' FROM empresas WHERE id = :'ea'), 'inicialización: RUC y DV por separado');
-- repetible: no cambia nada
SELECT count(*) AS nu0 FROM usuarios WHERE empresa_id = :'ea' \gset
SELECT nex_inicializar_empresa('emp-t10a', 'Nombre distinto', '8011111', '1', 'admin', 'Otro', 'Otro', NULL, :'h2') AS ea2 \gset
SELECT pg_temp.ok(:'ea2' = :'ea' AND (SELECT count(*) FROM usuarios WHERE empresa_id = :'ea') = :nu0
              AND (SELECT razon_social FROM empresas WHERE id = :'ea') = 'Empresa A SA (prueba)'
              AND (SELECT password_hash = crypt(current_setting('nex.pw_prueba'), password_hash) FROM usuarios WHERE empresa_id = :'ea'), 'inicialización repetible: no duplica ni sobrescribe nombre, usuario ni clave');
SELECT pg_temp.falla(format($f$SELECT nex_inicializar_empresa('emp-t10a','x','9999999','9','admin','a','b',NULL,%L)$f$, :'h'), 'P0001', 'inicialización: mismo código con otro RUC se rechaza');
SELECT pg_temp.falla(format($f$SELECT nex_inicializar_empresa('demo-falsa','Falsa SA','8033333','3','admin','a','b',NULL,%L)$f$, :'h'), 'P0001', 'inicialización: una empresa real no puede llamarse demo-*');
SELECT pg_temp.falla($f$SELECT nex_inicializar_empresa('emp-x1','X SA','8033333','3','admin','a','b',NULL,'ClaveEnClaro123')$f$, 'P0001', 'inicialización: una contraseña en claro se rechaza (solo hash)');
SELECT pg_temp.falla($f$SELECT nex_inicializar_empresa('emp-x2','X SA','8033333','3','admin','a','b',NULL,'$2b$12$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyz01234')$f$, 'P0001', 'inicialización: hash $2b$ rechazado (pgcrypto solo valida $2a$)');
SELECT pg_temp.falla($f$SELECT nex_inicializar_empresa('emp-x3','X SA','8033333','3','admin','a','b',NULL,'$2a$04$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyz01234')$f$, 'P0001', 'inicialización: costo bcrypt < 10 rechazado');
SELECT pg_temp.falla(format($f$SELECT nex_inicializar_empresa('emp-x4','X SA','12','3','admin','a','b',NULL,%L)$f$, :'h'), 'P0001', 'inicialización: RUC inválido rechazado');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM empresas WHERE codigo IN ('emp-x1','emp-x2','emp-x3','emp-x4','demo-falsa')), 'inicialización: los intentos rechazados no dejaron empresas a medias');

-- ===== Restablecer clave =====
INSERT INTO sesiones_usuario (usuario_id, token_hash, expira_at) SELECT id, crypt('tok-1', gen_salt('bf', 8)), now() + interval '1 hour' FROM usuarios WHERE empresa_id = :'ea';
UPDATE usuarios SET intentos_fallidos = 5, bloqueado_hasta = now() + interval '15 minutes' WHERE empresa_id = :'ea';
SELECT nex_restablecer_clave('emp-t10a', 'admin', :'h2');
SELECT pg_temp.ok((SELECT password_hash = crypt('otra-clave-larga-456', password_hash) AND password_hash <> crypt(current_setting('nex.pw_prueba'), password_hash)
                          AND intentos_fallidos = 0 AND bloqueado_hasta IS NULL AND debe_cambiar_contrasena FROM usuarios WHERE empresa_id = :'ea'), 'restablecer: la nueva clave valida, la anterior no; desbloquea y exige cambio');
SELECT pg_temp.ok((SELECT count(*) = 0 FROM sesiones_usuario WHERE empresa_id = :'ea' AND revocada_at IS NULL) AND (SELECT count(*) = 1 FROM eventos_seguridad WHERE empresa_id = :'ea' AND tipo = 'CLAVE_RESTABLECIDA'), 'restablecer: sesiones revocadas y evento registrado');
SELECT pg_temp.falla($f$SELECT nex_restablecer_clave('demo-modelo','admin','$2a$12$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyz01234')$f$, 'P0001', 'restablecer: no opera sobre empresas DEMO');

-- ===== Sesiones, bloqueo y baja (consultas literales del login/sesión, como nexit_runtime) =====
UPDATE usuarios SET password_hash = :'h' WHERE empresa_id = :'ea';   -- vuelve a la clave de prueba
SET ROLE nexit_runtime;
DO $$
DECLARE u record; n int; sid uuid := gen_random_uuid(); ok boolean;
BEGIN
  SELECT u2.id, u2.empresa_id INTO u FROM usuarios u2 JOIN empresas e ON e.id = u2.empresa_id WHERE lower(e.codigo) = 'emp-t10a' AND e.activo AND lower(u2.usuario) = 'admin' AND u2.estado = 'ACTIVO';
  -- 5 contraseñas incorrectas => bloqueo de 15 minutos (misma sentencia que app/api/auth/login)
  FOR n IN 1..5 LOOP
    UPDATE usuarios SET intentos_fallidos = intentos_fallidos + 1,
           bloqueado_hasta = CASE WHEN intentos_fallidos + 1 >= 5 THEN now() + interval '15 minutes' ELSE bloqueado_hasta END WHERE id = u.id;
  END LOOP;
  PERFORM pg_temp.ok((SELECT intentos_fallidos = 5 AND bloqueado_hasta > now() + interval '14 minutes' FROM usuarios WHERE id = u.id), 'bloqueo: 5 fallos bloquean 15 minutos');
  INSERT INTO sesiones_usuario (id, usuario_id, token_hash, expira_at) VALUES (sid, u.id, crypt('tok-real', gen_salt('bf', 8)), now() + interval '1 hour');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM sesiones_usuario s JOIN usuarios x ON x.id = s.usuario_id WHERE s.id = sid AND s.revocada_at IS NULL AND s.expira_at > now()
        AND s.token_hash = crypt('tok-real', s.token_hash) AND x.estado = 'ACTIVO' AND (x.bloqueado_hasta IS NULL OR x.bloqueado_hasta <= now())), 'bloqueo: la sesión de un usuario bloqueado no es válida');
  UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = u.id;
  SELECT EXISTS (SELECT 1 FROM sesiones_usuario s JOIN usuarios x ON x.id = s.usuario_id WHERE s.id = sid AND s.revocada_at IS NULL AND s.expira_at > now()
        AND s.token_hash = crypt('tok-real', s.token_hash) AND x.estado = 'ACTIVO' AND (x.bloqueado_hasta IS NULL OR x.bloqueado_hasta <= now())) INTO ok;
  PERFORM pg_temp.ok(ok, 'sesión válida tras desbloqueo');
END $$;
RESET ROLE;
-- expirada y revocada (insert directo como administrador del clúster; la tabla exige expira_at > creado_at)
INSERT INTO sesiones_usuario (id, usuario_id, token_hash, creado_at, expira_at) SELECT gen_random_uuid(), id, crypt('tok-exp', gen_salt('bf', 8)), now() - interval '2 hours', now() - interval '1 hour' FROM usuarios WHERE empresa_id = :'ea';
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM sesiones_usuario WHERE empresa_id = :'ea' AND token_hash = crypt('tok-exp', token_hash) AND revocada_at IS NULL AND expira_at > now()), 'sesión vencida rechazada');
UPDATE usuarios SET estado = 'BAJA', baja_at = now() WHERE empresa_id = :'ea';
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM usuarios u2 JOIN empresas e ON e.id = u2.empresa_id WHERE lower(e.codigo) = 'emp-t10a' AND e.activo AND lower(u2.usuario) = 'admin' AND u2.estado = 'ACTIVO'), 'usuario dado de baja no puede iniciar sesión');
UPDATE usuarios SET estado = 'ACTIVO', baja_at = NULL WHERE empresa_id = :'ea';
UPDATE empresas SET estado = 'SUSPENDIDA' WHERE id = :'ea';
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM usuarios u2 JOIN empresas e ON e.id = u2.empresa_id WHERE lower(e.codigo) = 'emp-t10a' AND e.activo AND lower(u2.usuario) = 'admin' AND u2.estado = 'ACTIVO')
              AND NOT usuario_tiene_permiso(:'ea', (SELECT id FROM usuarios WHERE empresa_id = :'ea'), 'CLIENTES', 'VER'), 'empresa suspendida: no hay login ni permisos');
UPDATE empresas SET estado = 'ACTIVA' WHERE id = :'ea';

-- ===== Permisos de los nueve ítems =====
SELECT pg_temp.ok((SELECT count(DISTINCT recurso) FROM permisos WHERE accion = 'VER' AND recurso IN ('CLIENTES','PROVEEDORES','PRODUCTOS','MOVIMIENTOS','STOCK','LISTAS_PRECIO','REPORTES','DASHBOARD')) = 8,
  'permisos: existe VER para Clientes, Proveedores, Productos, Movimientos, Stock, Listas de precios, Reportes y Dashboard (Login/empresa no es un menú)');
SELECT pg_temp.ok((SELECT count(*) FROM permisos WHERE codigo IN ('CLIENTES.CREAR','CLIENTES.EDITAR','PROVEEDORES.CREAR','PROVEEDORES.EDITAR','PRODUCTOS.CREAR','PRODUCTOS.EDITAR','LISTAS_PRECIO.CREAR','LISTAS_PRECIO.EDITAR','MOVIMIENTOS.CREAR','REPORTES.EXPORTAR')) = 10, 'permisos: crear/editar/exportar definidos para los módulos con escritura');
SELECT pg_temp.ok((SELECT bool_and(usuario_tiene_permiso(:'ea', (SELECT id FROM usuarios WHERE empresa_id = :'ea'), recurso, 'VER')) FROM (VALUES ('CLIENTES'),('PROVEEDORES'),('PRODUCTOS'),('MOVIMIENTOS'),('STOCK'),('LISTAS_PRECIO'),('REPORTES'),('DASHBOARD')) t(recurso)), 'permisos: el administrador ve los 8 menús');

-- ===== Aislamiento entre dos empresas =====
SELECT id AS ua FROM usuarios WHERE empresa_id = :'ea' \gset
SELECT id AS ub FROM usuarios WHERE empresa_id = :'eb' \gset
SELECT id AS da FROM depositos WHERE empresa_id = :'ea' \gset
SELECT id AS db FROM depositos WHERE empresa_id = :'eb' \gset
INSERT INTO productos (empresa_id, codigo, descripcion, descripcion_factura, unidad_medida_id) SELECT e, 'COMUN', 'Producto común', 'Producto común', (SELECT id FROM unidades_medida WHERE codigo = 'UN') FROM (VALUES (:'ea'::uuid), (:'eb'::uuid)) t(e);
SELECT id AS pa FROM productos WHERE empresa_id = :'ea' AND codigo = 'COMUN' \gset
SELECT id AS pb FROM productos WHERE empresa_id = :'eb' AND codigo = 'COMUN' \gset
SELECT inventario_registrar_movimiento(:'ea', :'ua', 'ENTRADA', 'COMPRA', NULL, NULL, :'da', jsonb_build_array(jsonb_build_object('producto_id', :'pa', 'cantidad', 10, 'costo_unitario', 100))) \gset
SELECT inventario_registrar_movimiento(:'eb', :'ub', 'ENTRADA', 'COMPRA', NULL, NULL, :'db', jsonb_build_array(jsonb_build_object('producto_id', :'pb', 'cantidad', 3, 'costo_unitario', 999))) \gset
SELECT pg_temp.ok((SELECT numero_movimiento FROM movimientos_inventario WHERE empresa_id = :'ea') = 'MOV-000001' AND (SELECT numero_movimiento FROM movimientos_inventario WHERE empresa_id = :'eb') = 'MOV-000001', 'aislamiento: cada empresa tiene su propia numeración MOV-000001');
SELECT pg_temp.falla(format($f$SELECT * FROM inventario_registrar_movimiento(%L, %L, 'ENTRADA','COMPRA', NULL, NULL, %L, '[{"producto_id":"%s","cantidad":1,"costo_unitario":1}]'::jsonb)$f$, :'ea', :'ua', :'da', :'pb'), 'P0001', 'aislamiento: el producto de B no se puede mover desde A');
SELECT pg_temp.falla(format($f$SELECT * FROM inventario_registrar_movimiento(%L, %L, 'ENTRADA','COMPRA', NULL, NULL, %L, '[{"producto_id":"%s","cantidad":1,"costo_unitario":1}]'::jsonb)$f$, :'ea', :'ua', :'db', :'pa'), '42501', 'aislamiento: el depósito de B no es utilizable desde A');
SELECT pg_temp.falla(format($f$SELECT * FROM inventario_registrar_movimiento(%L, %L, 'ENTRADA','COMPRA', NULL, NULL, %L, '[{"producto_id":"%s","cantidad":1,"costo_unitario":1}]'::jsonb)$f$, :'ea', :'ub', :'da', :'pa'), '42501', 'aislamiento: el usuario de B no opera en A');
SELECT pg_temp.falla(format($f$INSERT INTO stock_saldos (empresa_id, producto_id, deposito_id, estado_stock, cantidad) VALUES (%L, %L, %L, 'DISPONIBLE', 1)$f$, :'ea', :'pb', :'da'), '23503', 'aislamiento: la FK compuesta impide mezclar producto de B con empresa A');
SELECT pg_temp.falla(format($f$INSERT INTO stock_saldos (empresa_id, producto_id, deposito_id, estado_stock, cantidad) VALUES (%L, %L, %L, 'DISPONIBLE', 1)$f$, :'ea', :'pa', :'db'), '23503', 'aislamiento: la FK compuesta impide mezclar depósito de B con empresa A');
SELECT pg_temp.ok((SELECT valor_total = 1000 FROM v_valoracion_stock WHERE empresa_id = :'ea') AND (SELECT valor_total = 2997 FROM v_valoracion_stock WHERE empresa_id = :'eb'), 'aislamiento: valoraciones independientes (1000 vs 2997) para el mismo código de producto');
SELECT pg_temp.ok((SELECT count(*) = 1 FROM v_kardex WHERE empresa_id = :'ea') AND (SELECT count(*) = 1 FROM v_kardex WHERE empresa_id = :'eb'), 'aislamiento: el kardex de cada empresa tiene solo sus renglones');
SELECT pg_temp.ok((SELECT productos_activos = 1 AND clientes_activos = 0 FROM v_dashboard_resumen WHERE empresa_id = :'ea'), 'aislamiento: el dashboard cuenta solo lo propio');
-- usuarios con el mismo nombre en empresas distintas
SELECT pg_temp.ok((SELECT count(*) = 2 FROM usuarios WHERE usuario = 'admin' AND empresa_id IN (:'ea', :'eb')), 'aislamiento: el usuario "admin" existe en ambas empresas sin conflicto');
-- DEMO no contamina empresas reales
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM productos p JOIN empresas e ON e.id = p.empresa_id WHERE NOT e.es_demo AND e.codigo IN ('emp-t10a','emp-t10b') AND p.codigo NOT IN ('COMUN')), 'DEMO: ningún dato de demostración llegó a las empresas reales');
