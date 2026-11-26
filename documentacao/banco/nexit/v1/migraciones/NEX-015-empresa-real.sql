-- =====================================================================
-- NEX-015 — Inicialización de la empresa REAL y administrador (sin contraseñas en el código)
-- · nex_inicializar_empresa(...): crea empresa + casa central + depósito + medios de pago + perfiles + administrador. Repetible: si la empresa ya existe NO modifica nada.
-- · nex_restablecer_clave(...): cambia el hash de un usuario, revoca sus sesiones y registra el evento.
-- · Ambas reciben el HASH bcrypt ($2a$) generado fuera del servidor (scripts/generar-hash-clave.sh); la contraseña nunca llega a SQL, a Git ni a los logs.
-- · Son funciones de ADMINISTRACIÓN: el rol de la aplicación (nexit_runtime) no puede ejecutarlas.
-- · demo_crear_empresa pasa a reutilizar la misma estructura base (una sola definición de "empresa recién creada").
-- Proyecto Nexit (NEXIT-2026-001). ESTADO: V1 candidata oficial — NO ejecutar en la VM sin autorización expresa del responsable.
-- =====================================================================

CREATE OR REPLACE FUNCTION nex_validar_hash_bcrypt(p_hash text) RETURNS void
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_hash IS NULL OR p_hash !~ '^\$2a\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$' THEN
    RAISE EXCEPTION 'se espera un hash bcrypt con prefijo $2a$ (pgcrypto no valida $2b$/$2y$), no una contraseña en claro' USING ERRCODE = 'P0001';
  END IF;
  IF substring(p_hash FROM 5 FOR 2)::int < 10 THEN
    RAISE EXCEPTION 'costo bcrypt insuficiente (mínimo 10)' USING ERRCODE = 'P0001';
  END IF;
END $$;

-- Estructura base común de una empresa nueva. Devuelve el id del usuario administrador.
CREATE OR REPLACE FUNCTION nex_estructura_base_empresa(
  p_empresa uuid, p_usuario text, p_nombre text, p_apellido text, p_email text, p_password_hash text,
  p_sucursal_nombre text, p_deposito_codigo text, p_deposito_nombre text) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE s uuid; u uuid; pf_admin uuid; pf_cons uuid;
BEGIN
  INSERT INTO sucursales (empresa_id, codigo, nombre, establecimiento_sifen) VALUES (p_empresa, 'CASA-CENTRAL', p_sucursal_nombre, '001') RETURNING id INTO s;
  INSERT INTO depositos (empresa_id, sucursal_id, codigo, nombre) VALUES (p_empresa, s, p_deposito_codigo, p_deposito_nombre);
  INSERT INTO medios_pago (empresa_id, codigo, nombre, tipo) VALUES
    (p_empresa, 'EFECTIVO', 'Efectivo', 'EFECTIVO'), (p_empresa, 'TRANSFERENCIA', 'Transferencia bancaria', 'TRANSFERENCIA'),
    (p_empresa, 'CHEQUE', 'Cheque', 'CHEQUE'), (p_empresa, 'TARJETA', 'Tarjeta', 'TARJETA');
  INSERT INTO perfiles (empresa_id, codigo, nombre, es_administrador, es_sistema) VALUES (p_empresa, 'ADMIN', 'Administrador', true, true) RETURNING id INTO pf_admin;
  INSERT INTO perfiles (empresa_id, codigo, nombre, es_sistema) VALUES (p_empresa, 'CONSULTA', 'Solo consulta', true) RETURNING id INTO pf_cons;
  INSERT INTO perfil_permiso (empresa_id, perfil_id, permiso_id)
  SELECT p_empresa, pf_cons, id FROM permisos WHERE accion = 'VER' AND clase = 'OPERACIONAL';
  INSERT INTO usuarios (empresa_id, sucursal_id, usuario, nombre, apellido, email, password_hash, alcance_sucursales, alcance_depositos)
  VALUES (p_empresa, s, p_usuario, p_nombre, p_apellido, p_email, p_password_hash, 'TODAS', 'TODOS') RETURNING id INTO u;
  INSERT INTO usuario_perfil (empresa_id, usuario_id, perfil_id) VALUES (p_empresa, u, pf_admin);
  RETURN u;
END $$;

CREATE OR REPLACE FUNCTION nex_inicializar_empresa(
  p_codigo text, p_razon_social text, p_ruc text, p_dv text,
  p_usuario_admin text, p_nombre_admin text, p_apellido_admin text, p_email_admin text, p_password_hash text,
  p_sucursal_nombre text DEFAULT 'Casa central', p_deposito_nombre text DEFAULT 'Depósito principal') RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE e uuid; ex record;
BEGIN
  IF p_codigo !~ '^[a-z0-9][a-z0-9_.-]{1,39}$' OR p_codigo LIKE 'demo-%' THEN
    RAISE EXCEPTION 'código de empresa inválido (minúsculas, números . _ -; no puede empezar con demo-)' USING ERRCODE = 'P0001';
  END IF;
  IF p_razon_social IS NULL OR length(btrim(p_razon_social)) < 3 THEN RAISE EXCEPTION 'razón social obligatoria' USING ERRCODE = 'P0001'; END IF;
  IF p_ruc IS NULL OR p_ruc !~ '^[0-9]{5,9}$' OR p_dv IS NULL OR p_dv !~ '^[0-9]$' THEN
    RAISE EXCEPTION 'RUC inválido: se espera la raíz numérica (5 a 9 dígitos) y el dígito verificador por separado' USING ERRCODE = 'P0001';
  END IF;
  IF p_usuario_admin !~ '^[a-z0-9._-]{3,80}$' THEN RAISE EXCEPTION 'usuario administrador inválido (minúsculas, números . _ -; mínimo 3)' USING ERRCODE = 'P0001'; END IF;
  IF p_nombre_admin IS NULL OR length(btrim(p_nombre_admin)) = 0 THEN RAISE EXCEPTION 'nombre del administrador obligatorio' USING ERRCODE = 'P0001'; END IF;
  PERFORM nex_validar_hash_bcrypt(p_password_hash);
  IF NOT EXISTS (SELECT 1 FROM impuestos WHERE codigo = 'IVA10') THEN
    RAISE EXCEPTION 'faltan catálogos globales: ejecute la semilla S-001 antes' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('empresa.init:' || p_codigo, 0));
  SELECT id, es_demo, ruc, dv INTO ex FROM empresas WHERE codigo = p_codigo;
  IF FOUND THEN
    IF ex.es_demo THEN RAISE EXCEPTION 'el código % pertenece a una empresa DEMO', p_codigo USING ERRCODE = 'P0001'; END IF;
    IF ex.ruc IS DISTINCT FROM p_ruc OR ex.dv IS DISTINCT FROM p_dv THEN
      RAISE EXCEPTION 'la empresa % ya existe con otro RUC: no se modifica', p_codigo USING ERRCODE = 'P0001';
    END IF;
    RAISE NOTICE 'la empresa % ya existe: no se modificó nada', p_codigo;
    RETURN ex.id;
  END IF;

  INSERT INTO empresas (codigo, razon_social, ruc, dv) VALUES (p_codigo, btrim(p_razon_social), p_ruc, p_dv) RETURNING id INTO e;
  PERFORM nex_estructura_base_empresa(e, p_usuario_admin, btrim(p_nombre_admin), NULLIF(btrim(p_apellido_admin), ''), NULLIF(btrim(p_email_admin), ''),
                                      p_password_hash, p_sucursal_nombre, 'DEP-PRINCIPAL', p_deposito_nombre);
  INSERT INTO eventos_seguridad (empresa_id, tipo, detalle) VALUES (e, 'EMPRESA_INICIALIZADA', jsonb_build_object('usuario_admin', p_usuario_admin));
  RETURN e;
END $$;

CREATE OR REPLACE FUNCTION nex_restablecer_clave(p_empresa_codigo text, p_usuario text, p_password_hash text, p_exigir_cambio boolean DEFAULT true) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE e uuid; u uuid;
BEGIN
  PERFORM nex_validar_hash_bcrypt(p_password_hash);
  SELECT id INTO e FROM empresas WHERE codigo = p_empresa_codigo AND NOT es_demo;
  IF e IS NULL THEN RAISE EXCEPTION 'empresa % inexistente (o DEMO)', p_empresa_codigo USING ERRCODE = 'P0001'; END IF;
  SELECT id INTO u FROM usuarios WHERE empresa_id = e AND usuario = p_usuario FOR UPDATE;
  IF u IS NULL THEN RAISE EXCEPTION 'usuario % inexistente en %', p_usuario, p_empresa_codigo USING ERRCODE = 'P0001'; END IF;
  UPDATE usuarios SET password_hash = p_password_hash, intentos_fallidos = 0, bloqueado_hasta = NULL, debe_cambiar_contrasena = p_exigir_cambio,
                      version_acceso = version_acceso + 1
   WHERE id = u;
  UPDATE sesiones_usuario SET revocada_at = now() WHERE empresa_id = e AND usuario_id = u AND revocada_at IS NULL;
  INSERT INTO eventos_seguridad (empresa_id, usuario_id, tipo, detalle) VALUES (e, u, 'CLAVE_RESTABLECIDA', '{}'::jsonb);
END $$;

-- demo_crear_empresa: misma firma y comportamiento, ahora sobre la estructura base compartida.
CREATE OR REPLACE FUNCTION demo_crear_empresa(
  p_codigo text, p_razon_social text, p_usuario text, p_password_hash text,
  p_prospecto text DEFAULT NULL, p_dias_vigencia integer DEFAULT 30) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE e uuid; s uuid; u uuid;
BEGIN
  IF p_codigo !~ '^demo-[a-z0-9-]{2,30}$' THEN
    RAISE EXCEPTION 'el código de una empresa DEMO debe cumplir ^demo-[a-z0-9-]{2,30}$' USING ERRCODE = 'P0001';
  END IF;
  IF p_usuario !~ '^[a-z0-9._-]{1,80}$' THEN
    RAISE EXCEPTION 'usuario inválido (minúsculas, números . _ -)' USING ERRCODE = 'P0001';
  END IF;
  PERFORM nex_validar_hash_bcrypt(p_password_hash);
  IF NOT EXISTS (SELECT 1 FROM impuestos WHERE codigo = 'IVA10') THEN
    RAISE EXCEPTION 'faltan catálogos globales: ejecute la semilla S-001 antes' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO empresas (codigo, razon_social, es_demo, demo_prospecto, demo_creada_at, demo_vence_at)
  VALUES (p_codigo, p_razon_social, true, p_prospecto, now(), now() + make_interval(days => p_dias_vigencia))
  RETURNING id INTO e;
  u := nex_estructura_base_empresa(e, p_usuario, 'Administrador', 'Demo', NULL, p_password_hash, 'Casa central', 'DEP-CENTRAL', 'Depósito central');
  SELECT sucursal_id INTO s FROM usuarios WHERE id = u;
  INSERT INTO depositos (empresa_id, sucursal_id, codigo, nombre) VALUES (e, s, 'DEP-SALON', 'Salón de ventas');
  PERFORM demo_poblar(e);
  RETURN e;
END $$;

-- Funciones de administración: nunca ejecutables por el rol de la aplicación (el runner reaplica la política de grants al final).
SELECT nex_aplicar_grants_runtime();
