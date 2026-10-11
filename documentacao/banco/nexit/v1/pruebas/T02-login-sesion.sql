-- T02 — Flujo de login/sesión con las consultas LITERALES del código desplegado (app/api/auth/login, lib/auth/session, logout).
-- Se ejecuta como el rol de ejecución nexit_runtime (SET ROLE), NO como superusuario.
\i _helpers.sql
SELECT pg_temp.ok(NOT (SELECT rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb FROM pg_roles WHERE rolname = 'nexit_runtime'), 'nexit_runtime no es superusuario ni BYPASSRLS');
SET ROLE nexit_runtime;
DO $$
DECLARE u record; v record; sid uuid := gen_random_uuid(); secret text := 'secreto-de-prueba-0123456789'; s record; ev int;
BEGIN
  -- 1) búsqueda de usuario por empresa + usuario (consulta del login)
  SELECT u2.id, u2.empresa_id, u2.bloqueado_hasta INTO u
    FROM usuarios u2 JOIN empresas e ON e.id = u2.empresa_id
   WHERE lower(e.codigo) = 'demo-modelo' AND e.activo AND lower(u2.usuario) = 'admin' AND u2.estado = 'ACTIVO' LIMIT 1;
  PERFORM pg_temp.ok(u.id IS NOT NULL, 'login: usuario admin de demo-modelo encontrado (empresas.activo)');
  -- 2) contraseña incorrecta
  SELECT id INTO v FROM usuarios WHERE id = u.id AND password_hash = crypt('contraseña-incorrecta', password_hash);
  PERFORM pg_temp.ok(v.id IS NULL, 'login: contraseña incorrecta rechazada');
  UPDATE usuarios SET intentos_fallidos = intentos_fallidos + 1,
         bloqueado_hasta = CASE WHEN intentos_fallidos + 1 >= 5 THEN now() + interval '15 minutes' ELSE bloqueado_hasta END WHERE id = u.id;
  INSERT INTO eventos_seguridad (empresa_id, usuario_id, tipo, detalle, ip, user_agent)
    VALUES (u.empresa_id, u.id, 'LOGIN_FALLIDO', jsonb_build_object('motivo', 'CREDENCIAL_INVALIDA'), '127.0.0.1'::inet, 'prueba');
  -- 3) contraseña correcta (la del entorno de prueba: ver ejecutar-pruebas.sh)
  SELECT id INTO v FROM usuarios WHERE id = u.id AND password_hash = crypt(current_setting('nex.pw_prueba'), password_hash);
  PERFORM pg_temp.ok(v.id IS NOT NULL, 'login: contraseña correcta aceptada');
  INSERT INTO sesiones_usuario (id, usuario_id, token_hash, ip, user_agent, expira_at)
    VALUES (sid, u.id, crypt(secret, gen_salt('bf', 12)), '127.0.0.1'::inet, 'prueba', now() + interval '8 hours');
  UPDATE usuarios SET ultimo_acceso_at = now(), intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = u.id;
  INSERT INTO eventos_seguridad (empresa_id, usuario_id, tipo, detalle, ip, user_agent)
    VALUES (u.empresa_id, u.id, 'LOGIN_EXITOSO', '{}'::jsonb, '127.0.0.1'::inet, 'prueba');
  PERFORM pg_temp.ok((SELECT empresa_id FROM sesiones_usuario WHERE id = sid) = u.empresa_id, 'sesión creada: trigger completó empresa_id desde el usuario');
  -- 4) lectura de sesión (lib/auth/session.ts, consulta literal)
  SELECT s2.id AS session_id, u3.empresa_id, array_remove(array_agg(DISTINCT p.codigo), NULL) AS perfiles INTO s
    FROM sesiones_usuario s2 JOIN usuarios u3 ON u3.id = s2.usuario_id
    LEFT JOIN usuario_perfil up ON up.usuario_id = u3.id LEFT JOIN perfiles p ON p.id = up.perfil_id AND p.activo
   WHERE s2.id = sid AND s2.revocada_at IS NULL AND s2.expira_at > now() AND s2.token_hash = crypt(secret, s2.token_hash)
     AND u3.estado = 'ACTIVO' AND (u3.bloqueado_hasta IS NULL OR u3.bloqueado_hasta <= now())
   GROUP BY s2.id, u3.empresa_id;
  PERFORM pg_temp.ok(s.session_id IS NOT NULL AND 'ADMIN' = ANY (s.perfiles), 'sesión válida y perfil ADMIN visible');
  -- 5) token incorrecto
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM sesiones_usuario WHERE id = sid AND token_hash = crypt('otro', token_hash)), 'token de sesión incorrecto rechazado');
  -- 6) logout
  UPDATE sesiones_usuario SET revocada_at = now() WHERE id = sid AND revocada_at IS NULL AND token_hash = crypt(secret, token_hash);
  PERFORM pg_temp.ok((SELECT revocada_at IS NOT NULL FROM sesiones_usuario WHERE id = sid), 'logout revoca la sesión');
  -- 7) permisos (lib/auth/permissions.ts, consulta literal): ADMIN es administrador
  PERFORM pg_temp.ok((SELECT EXISTS (SELECT 1 FROM usuario_perfil up JOIN perfiles pf ON pf.id = up.perfil_id AND pf.activo
        LEFT JOIN perfil_permiso pp ON pp.perfil_id = pf.id LEFT JOIN permisos pe ON pe.id = pp.permiso_id
       WHERE up.usuario_id = u.id AND (pf.es_administrador OR (pe.recurso = 'CLIENTES' AND pe.accion = 'VER')))), 'permisos: el administrador pasa la consulta de permisos');
END $$;
RESET ROLE;
