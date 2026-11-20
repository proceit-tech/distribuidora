-- ============================================================================
-- DistribuNex | Migration 017 - Función para administrador inicial
-- Ejecutar DESPUÉS de 016_correciones_criticas_y_numeracion.sql
-- ============================================================================
BEGIN;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '016') THEN
        RAISE EXCEPTION 'La migration 016 debe ejecutarse antes de la 017.';
    END IF;
END $$;

-- Crea un usuario administrador y le asigna el perfil ADMINISTRADOR de su
-- empresa. La contraseña se convierte a bcrypt en la base: nunca se guarda en
-- texto plano. Use esta función solo desde un canal administrativo seguro.
CREATE OR REPLACE FUNCTION crear_usuario_administrador_inicial(
    p_empresa_id uuid,
    p_sucursal_id uuid,
    p_nombre varchar,
    p_apellido varchar,
    p_usuario varchar,
    p_email varchar,
    p_contrasena varchar
)
RETURNS uuid AS $$
DECLARE v_usuario_id uuid; v_perfil_id uuid;
BEGIN
    IF length(trim(COALESCE(p_contrasena, ''))) < 12 THEN
        RAISE EXCEPTION 'La contraseña temporal debe tener al menos 12 caracteres.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM empresas WHERE id = p_empresa_id AND activo) THEN
        RAISE EXCEPTION 'La empresa no existe o está inactiva.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = p_sucursal_id AND empresa_id = p_empresa_id AND activo) THEN
        RAISE EXCEPTION 'La sucursal no pertenece a la empresa o está inactiva.';
    END IF;
    SELECT id INTO v_perfil_id
      FROM perfiles
     WHERE empresa_id = p_empresa_id AND codigo = 'ADMINISTRADOR' AND activo;
    IF v_perfil_id IS NULL THEN
        RAISE EXCEPTION 'Primero ejecute SELECT inicializar_empresa_distribunex(''%''::uuid); para crear los perfiles de la empresa.', p_empresa_id;
    END IF;
    IF EXISTS (SELECT 1 FROM usuarios WHERE empresa_id = p_empresa_id AND usuario = p_usuario) THEN
        RAISE EXCEPTION 'Ya existe el usuario % para esta empresa.', p_usuario;
    END IF;
    IF p_email IS NOT NULL AND EXISTS (SELECT 1 FROM usuarios WHERE empresa_id = p_empresa_id AND lower(email) = lower(p_email)) THEN
        RAISE EXCEPTION 'Ya existe el e-mail % para esta empresa.', p_email;
    END IF;

    INSERT INTO usuarios (
        empresa_id, sucursal_id, nombre, apellido, usuario, email,
        password_hash, estado, password_changed_at
    ) VALUES (
        p_empresa_id, p_sucursal_id, trim(p_nombre), trim(p_apellido), lower(trim(p_usuario)),
        NULLIF(lower(trim(p_email)), ''), crypt(p_contrasena, gen_salt('bf', 12)), 'ACTIVO', now()
    ) RETURNING id INTO v_usuario_id;

    INSERT INTO usuario_perfil (usuario_id, perfil_id)
    VALUES (v_usuario_id, v_perfil_id);

    INSERT INTO eventos_seguridad (empresa_id, usuario_id, tipo, detalle)
    VALUES (p_empresa_id, v_usuario_id, 'OTRO', jsonb_build_object('evento', 'USUARIO_ADMINISTRADOR_INICIAL_CREADO'));

    RETURN v_usuario_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION crear_usuario_administrador_inicial(uuid, uuid, varchar, varchar, varchar, varchar, varchar) IS
    'Crea el administrador inicial con bcrypt. Debe cambiarse la contraseña temporal en el primer acceso.';

INSERT INTO schema_migrations (version, description)
VALUES ('017', 'Función segura para crear el usuario administrador inicial')
ON CONFLICT (version) DO NOTHING;
COMMIT;

-- --------------------------------------------------------------------------
-- EJECUTAR DESPUÉS DE LA MIGRATION (ajuste los valores antes de usar):
--
-- 1) Si la empresa aún no fue inicializada:
--    SELECT inicializar_empresa_distribunex('<empresa_uuid>');
--
-- 2) Crear el administrador de prueba:
--    SELECT crear_usuario_administrador_inicial(
--      '<empresa_uuid>', '<sucursal_uuid>', 'Magno', 'Oliveira',
--      'admin', 'admin@distribunex.local', 'CambiarAhora!2026'
--    );
--
-- 3) Al iniciar sesión por primera vez, cambie la contraseña temporal.
-- --------------------------------------------------------------------------