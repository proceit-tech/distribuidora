-- =====================================================================
-- NEX-074 — PRO-93 / PRO-72 / PRO-307 / PRO-109 / PRO-293 (recorte mínimo): usuarios por empresa con perfiles predefinidos, vendedor = usuario con el perfil «Vendedor», y vendedor estructurado en la FE.
-- Decisiones de producto aplicadas (REQ-NEXIT-PLATAFORMA-MULTIEMPRESA-PERFILES-R01): nueve perfiles comunes a todas las empresas (rótulos es-PY), un usuario puede tener varios perfiles, el administrador de empresa SOLO
-- asigna/retira perfiles existentes (no crea ni edita perfiles ni permisos), el emisor de la FE NO es automáticamente el vendedor. NO se crea ninguna tabla «vendedores»: vendedor = usuarios + usuario_perfil + perfil VENDEDOR.
--   1) nex_asegurar_perfiles_estandar(empresa): garantiza los nueve perfiles (ADMIN ya existe y solo cambia su rótulo; los otros ocho se crean SIN permisos: la matriz de permisos por perfil sigue PENDIENTE de aprobación y
--      lo no especificado queda DENEGADO). Se ejecuta aquí para todas las empresas existentes y, para empresas nuevas, al abrir el catálogo desde la aplicación (usr_perfiles_catalogo).
--   2) usr_crear / usr_actualizar / usr_cambiar_estado / usr_asignar_perfiles / usr_perfiles_catalogo: SECURITY DEFINER; solo un administrador de empresa activo de ESA empresa (nunca un administrador de plataforma) puede ejecutarlas;
--      contraseña inicial con bcrypt en la base (pgcrypto), debe cambiarla (debe_cambiar_contrasena); no se puede desactivarse a sí mismo ni dejar la empresa sin administrador; al bloquear o cambiar perfiles se revocan
--      las sesiones y se incrementa version_acceso; todo queda en eventos_seguridad.
--   3) documento_electronico_vendedor (inmutable) + fe_documento_crear_fe_vendedor (14 parámetros): envuelve SIN COPIARLA a fe_documento_crear_fe_con_stock_entrega y, en la MISMA transacción, valida que el vendedor sea un usuario
--      ACTIVO de la empresa con el perfil VENDEDOR activo y registra su ID + nombre-snapshot, separado del emisor (creado_por). Una repetición de la clave con OTRO vendedor (o sin vendedor registrado) es conflicto de idempotencia.
--   4) PRO-93-R03: (F002) FE anteriores a NEX-074 (sin vendedor registrado) se reconocen en el reintento sin atribuirles vendedor; (F003) usr_cambiar_contrasena_propia: fin de la contraseña inicial provisional (el login/sesión la exigen en la
--      aplicación); (F004) las operaciones que pueden reducir administradores se serializan por EMPRESA (bloqueo asesor transaccional) y el invariante se verifica dentro de la sección serializada; (F005) usr_asignar_alcance: sucursales y depósitos
--      del usuario con las relaciones existentes (fail-closed: nunca TODAS/TODOS automáticamente); (F007) el perfil de administrador se garantiza SIN asignarlo a nadie y los conflictos de legado se rechazan.
--   5) Datos de identificación del usuario (CI y teléfono): columnas propias en usuarios (texto; los ceros iniciales se conservan), CI única por empresa (índice parcial), validación en la base y en la aplicación; usr_crear / usr_actualizar
--      exigen nombre, apellido, CI, correo y teléfono. Los usuarios históricos conservan ci / telefono en NULL (no se inventan); documento_hash NO se usa como CI.
-- NO incluye (pendiente, fuera de este recorte): matriz de permisos por perfil, módulos contratados por empresa (RN-14: aún no existe el catálogo técnico de módulos), restablecimiento de contraseña por el administrador,
-- alta de empresa/primer administrador por MASTER. No modifica documentos existentes ni NEX-072/NEX-073.
-- ESTADO: versionada y NO aplicada. Ningún agente de IA la aplica: la ejecuta SOLO el responsable en la VM (docs/PROCEDIMIENTO-NEX-074.md). Primero la migración, después el código.
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.usuarios') IS NULL OR to_regclass('public.perfiles') IS NULL OR to_regclass('public.usuario_perfil') IS NULL
     OR to_regclass('public.sesiones_usuario') IS NULL OR to_regclass('public.eventos_seguridad') IS NULL OR to_regclass('public.administradores_plataforma') IS NULL THEN
    RAISE EXCEPTION 'NEX-074 requiere la seguridad base (NEX-002) y administradores de plataforma (NEX-016).';
  END IF;
  IF to_regprocedure('public.fe_documento_crear_fe_con_stock_entrega(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb,jsonb,uuid)') IS NULL
     OR to_regprocedure('public.nex_reinicio_demo_activo(uuid)') IS NULL THEN
    RAISE EXCEPTION 'NEX-074 requiere la emisión de FE con stock y entrega (NEX-067/NEX-068).';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'usuarios' AND column_name IN ('ci', 'telefono')) THEN
    RAISE EXCEPTION 'usuarios ya tiene las columnas ci/telefono: NEX-074 parece aplicada o hay una estructura paralela; no se reaplica por suposición.';
  END IF;
  IF to_regclass('public.documento_electronico_vendedor') IS NOT NULL THEN
    RAISE EXCEPTION 'documento_electronico_vendedor ya existe: NEX-074 parece aplicada; no se reaplica por suposición.';
  END IF;
END $$;

-- 0) Identificación del usuario: CI y teléfono (texto). Los históricos quedan NULL. CI: solo dígitos (4 a 10; se aceptan puntos y espacios al escribirla y se guardan sin ellos, sin tocar los ceros iniciales); teléfono: dígitos con + inicial
--    opcional (6 a 15; espacios, guiones, puntos y paréntesis se descartan al guardar). Única la CI por empresa.
ALTER TABLE public.usuarios ADD COLUMN ci text, ADD COLUMN telefono text;
ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_ci_chk CHECK (ci IS NULL OR ci ~ '^[0-9]{4,10}$'),
  ADD CONSTRAINT usuarios_telefono_chk CHECK (telefono IS NULL OR telefono ~ '^\+?[0-9]{6,15}$');
CREATE UNIQUE INDEX usuarios_empresa_ci_key ON public.usuarios (empresa_id, ci) WHERE ci IS NOT NULL;
COMMENT ON COLUMN public.usuarios.ci IS 'NEX-074: cédula de identidad del usuario (texto, ceros iniciales conservados). NULL en usuarios históricos. No es documento_hash.';
COMMENT ON COLUMN public.usuarios.telefono IS 'NEX-074: teléfono de contacto del usuario (texto, ceros iniciales conservados). NULL en usuarios históricos.';

CREATE OR REPLACE FUNCTION public.usr_normalizar_ci(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT nullif(regexp_replace(btrim(coalesce(p, '')), '[[:space:].]', '', 'g'), '') $$;
CREATE OR REPLACE FUNCTION public.usr_normalizar_telefono(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT nullif(regexp_replace(btrim(coalesce(p, '')), '[[:space:]().-]', '', 'g'), '') $$;

-- 1) Catálogo de nueve perfiles ------------------------------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nex_asegurar_perfiles_estandar(p_empresa uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record;
BEGIN
  -- Administrador de empresa (ADMIN): se garantiza el perfil, SIN asignarlo a ningún usuario (nadie es elevado a administrador). Un ADMIN existente que no sea administrador es un legado inconsistente: se rechaza para conciliarlo a mano.
  IF EXISTS (SELECT 1 FROM public.perfiles WHERE empresa_id = p_empresa AND codigo = 'ADMIN' AND NOT es_administrador) THEN
    RAISE EXCEPTION 'la empresa tiene un perfil ADMIN que no es administrador: concilie el legado antes de aplicar NEX-074' USING ERRCODE = 'P0001', DETAIL = 'NEX:PERFIL_CONFLICTO';
  END IF;
  UPDATE public.perfiles SET nombre = 'Administrador de empresa', actualizado_at = now()
   WHERE empresa_id = p_empresa AND codigo = 'ADMIN' AND es_administrador AND nombre <> 'Administrador de empresa';
  INSERT INTO public.perfiles (empresa_id, codigo, nombre, es_administrador, es_sistema)
  VALUES (p_empresa, 'ADMIN', 'Administrador de empresa', true, true)
  ON CONFLICT (empresa_id, codigo) DO NOTHING;

  -- Los otros ocho: si la empresa ya tenía un perfil propio con ese código (no del sistema, quizá con permisos), no se adopta en silencio.
  FOR r IN SELECT codigo FROM public.perfiles WHERE empresa_id = p_empresa AND NOT es_sistema
                AND codigo IN ('GERENTE','VENDEDOR','FACTURADOR','CONTADOR','COMPRAS','INVENTARIO_DEPOSITOS','FINANZAS','CONSULTAS_INFORMES') LOOP
    RAISE EXCEPTION 'la empresa ya tiene un perfil propio con el código %: concilie el legado antes de aplicar NEX-074', r.codigo USING ERRCODE = 'P0001', DETAIL = 'NEX:PERFIL_CONFLICTO';
  END LOOP;

  INSERT INTO public.perfiles (empresa_id, codigo, nombre, es_administrador, es_sistema)
  SELECT p_empresa, v.codigo, v.nombre, false, true
    FROM (VALUES ('GERENTE', 'Gerente'), ('VENDEDOR', 'Vendedor'), ('FACTURADOR', 'Facturador'), ('CONTADOR', 'Contador'), ('COMPRAS', 'Compras'),
                 ('INVENTARIO_DEPOSITOS', 'Inventario y depósitos'), ('FINANZAS', 'Finanzas'), ('CONSULTAS_INFORMES', 'Consultas e informes')) v (codigo, nombre)
  ON CONFLICT (empresa_id, codigo) DO NOTHING;
END $$;

SELECT public.nex_asegurar_perfiles_estandar(e.id) FROM public.empresas e;

-- 2) Ayudantes de autorización -----------------------------------------------------------------------------------------------------------------------------------------------
-- Administrador de EMPRESA: usuario ACTIVO de la empresa con un perfil activo es_administrador, que NO es administrador de plataforma (identidades separadas).
CREATE OR REPLACE FUNCTION public.usuario_es_admin_empresa(p_empresa uuid, p_usuario uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios u
      JOIN public.empresas e ON e.id = u.empresa_id AND e.estado = 'ACTIVA'
      JOIN public.usuario_perfil up ON up.empresa_id = u.empresa_id AND up.usuario_id = u.id
      JOIN public.perfiles pf ON pf.empresa_id = up.empresa_id AND pf.id = up.perfil_id AND pf.activo AND pf.es_administrador
     WHERE u.empresa_id = p_empresa AND u.id = p_usuario AND u.estado = 'ACTIVO'
       AND NOT EXISTS (SELECT 1 FROM public.administradores_plataforma ap WHERE ap.empresa_id = u.empresa_id AND ap.usuario_id = u.id AND ap.activo))
$$;

-- Vendedor válido: usuario ACTIVO de la empresa con el perfil VENDEDOR activo (nunca un administrador de plataforma).
CREATE OR REPLACE FUNCTION public.usuario_es_vendedor_activo(p_empresa uuid, p_usuario uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios u
      JOIN public.usuario_perfil up ON up.empresa_id = u.empresa_id AND up.usuario_id = u.id
      JOIN public.perfiles pf ON pf.empresa_id = up.empresa_id AND pf.id = up.perfil_id AND pf.activo AND pf.codigo = 'VENDEDOR'
     WHERE u.empresa_id = p_empresa AND u.id = p_usuario AND u.estado = 'ACTIVO'
       AND NOT EXISTS (SELECT 1 FROM public.administradores_plataforma ap WHERE ap.empresa_id = u.empresa_id AND ap.usuario_id = u.id AND ap.activo))
$$;

-- Administradores de empresa activos DISTINTOS del usuario indicado (protección del último administrador).
CREATE OR REPLACE FUNCTION public.usr_otros_admins(p_empresa uuid, p_excluir uuid) RETURNS integer
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT count(DISTINCT u.id)::integer FROM public.usuarios u
    JOIN public.usuario_perfil up ON up.empresa_id = u.empresa_id AND up.usuario_id = u.id
    JOIN public.perfiles pf ON pf.empresa_id = up.empresa_id AND pf.id = up.perfil_id AND pf.activo AND pf.es_administrador
   WHERE u.empresa_id = p_empresa AND u.id <> p_excluir AND u.estado = 'ACTIVO'
     AND NOT EXISTS (SELECT 1 FROM public.administradores_plataforma ap WHERE ap.empresa_id = u.empresa_id AND ap.usuario_id = u.id AND ap.activo)
$$;

-- Verifica al actor y devuelve nada; todas las usr_* empiezan por aquí.
CREATE OR REPLACE FUNCTION public.usr_exigir_admin(p_empresa uuid, p_actor uuid) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.usuario_es_admin_empresa(p_empresa, p_actor) THEN
    RAISE EXCEPTION 'solo el administrador de la empresa puede gestionar usuarios y perfiles' USING ERRCODE = '42501';
  END IF;
END $$;

-- F004: serializa por EMPRESA toda operación que pueda reducir los administradores activos (cambio de estado, retiro de perfiles). El bloqueo asesor es transaccional (se libera al terminar), la clave es la empresa y el orden es siempre
-- el mismo: primero el bloqueo de la empresa, después las filas del usuario. El actor se verifica antes y DESPUÉS de obtener el bloqueo (otra operación pudo quitarle el rol mientras esperaba).
CREATE OR REPLACE FUNCTION public.usr_serializar_admins(p_empresa uuid, p_actor uuid) RETURNS void
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.usr_exigir_admin(p_empresa, p_actor);
  PERFORM pg_advisory_xact_lock(hashtextextended('nexit:usr_admins:' || p_empresa::text, 0));
  PERFORM public.usr_exigir_admin(p_empresa, p_actor);
END $$;

-- Perfiles que el administrador puede asignar (los nueve del catálogo; los códigos son fijos y comunes a todas las empresas).
CREATE OR REPLACE FUNCTION public.usr_codigos_catalogo() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['ADMIN','GERENTE','VENDEDOR','FACTURADOR','CONTADOR','COMPRAS','INVENTARIO_DEPOSITOS','FINANZAS','CONSULTAS_INFORMES'] $$;

-- 3) Catálogo para la pantalla ---------------------------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.usr_perfiles_catalogo(p_empresa uuid, p_actor uuid)
RETURNS TABLE (o_id uuid, o_codigo text, o_nombre text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.usr_exigir_admin(p_empresa, p_actor);
  PERFORM public.nex_asegurar_perfiles_estandar(p_empresa);

  RETURN QUERY
    SELECT pf.id, pf.codigo, pf.nombre FROM public.perfiles pf
     WHERE pf.empresa_id = p_empresa AND pf.activo AND pf.codigo = ANY (public.usr_codigos_catalogo())
     ORDER BY array_position(public.usr_codigos_catalogo(), pf.codigo);
END $$;

-- Aplica el conjunto de perfiles del catálogo a un usuario (reemplazo SOLO dentro del catálogo; otras asignaciones heredadas, p. ej. CONSULTA, no se tocan).
CREATE OR REPLACE FUNCTION public.usr_aplicar_perfiles(p_empresa uuid, p_actor uuid, p_usuario uuid, p_codigos text[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c text;
BEGIN
  IF p_codigos IS NULL THEN p_codigos := ARRAY[]::text[]; END IF;
  FOREACH c IN ARRAY p_codigos LOOP
    IF NOT (c = ANY (public.usr_codigos_catalogo())) THEN
      RAISE EXCEPTION 'el perfil % no pertenece al catálogo de perfiles', c USING ERRCODE = 'P0001', DETAIL = 'NEX:PERFIL_INVALIDO';
    END IF;
  END LOOP;

  DELETE FROM public.usuario_perfil up USING public.perfiles pf
   WHERE up.empresa_id = p_empresa AND up.usuario_id = p_usuario AND pf.empresa_id = up.empresa_id AND pf.id = up.perfil_id
     AND pf.codigo = ANY (public.usr_codigos_catalogo()) AND NOT (pf.codigo = ANY (p_codigos));

  INSERT INTO public.usuario_perfil (empresa_id, usuario_id, perfil_id, asignado_por)
  SELECT p_empresa, p_usuario, pf.id, p_actor FROM public.perfiles pf
   WHERE pf.empresa_id = p_empresa AND pf.activo AND pf.codigo = ANY (p_codigos)
  ON CONFLICT (empresa_id, usuario_id, perfil_id) DO NOTHING;

  IF (SELECT count(*) FROM public.perfiles pf WHERE pf.empresa_id = p_empresa AND pf.activo AND pf.codigo = ANY (p_codigos)) <> (SELECT count(DISTINCT x) FROM unnest(p_codigos) x) THEN
    RAISE EXCEPTION 'algún perfil del catálogo no está disponible en la empresa' USING ERRCODE = 'P0001', DETAIL = 'NEX:PERFIL_INVALIDO';
  END IF;
END $$;

-- 4) Alta, edición, estado y perfiles --------------------------------------------------------------------------------------------------------------------------------------
-- Validación común de los datos del usuario (alta y edición). Todos obligatorios; mensajes con DETAIL por campo.
CREATE OR REPLACE FUNCTION public.usr_exigir_datos(p_nombre text, p_apellido text, p_ci text, p_email text, p_telefono text) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_apellido text := btrim(coalesce(p_apellido, ''));
  v_ci text := public.usr_normalizar_ci(p_ci);
  v_email text := btrim(coalesce(p_email, ''));
  v_tel text := public.usr_normalizar_telefono(p_telefono);
BEGIN
  IF char_length(v_nombre) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'el nombre es obligatorio (hasta 120 caracteres)' USING ERRCODE = 'P0001', DETAIL = 'NEX:NOMBRE_INVALIDO';
  END IF;
  IF char_length(v_apellido) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'el apellido es obligatorio (hasta 120 caracteres)' USING ERRCODE = 'P0001', DETAIL = 'NEX:APELLIDO_INVALIDO';
  END IF;
  IF v_ci IS NULL OR v_ci !~ '^[0-9]{4,10}$' THEN
    RAISE EXCEPTION 'la CI es obligatoria y debe tener de 4 a 10 dígitos' USING ERRCODE = 'P0001', DETAIL = 'NEX:CI_INVALIDA';
  END IF;
  IF v_email = '' OR char_length(v_email) > 200 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'el correo electrónico es obligatorio y debe ser válido' USING ERRCODE = 'P0001', DETAIL = 'NEX:EMAIL_INVALIDO';
  END IF;
  IF v_tel IS NULL OR v_tel !~ '^\+?[0-9]{6,15}$' THEN
    RAISE EXCEPTION 'el teléfono es obligatorio y debe tener de 6 a 15 dígitos' USING ERRCODE = 'P0001', DETAIL = 'NEX:TELEFONO_INVALIDO';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.usr_crear(
  p_empresa uuid, p_actor uuid, p_usuario text, p_nombre text, p_apellido text, p_ci text, p_email text, p_telefono text, p_password text, p_perfiles text[])
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_usuario text := lower(btrim(coalesce(p_usuario, '')));
  v_id uuid;
  v_c text;
BEGIN
  PERFORM public.usr_exigir_admin(p_empresa, p_actor);
  PERFORM public.nex_asegurar_perfiles_estandar(p_empresa);

  IF v_usuario !~ '^[a-z0-9][a-z0-9._-]{2,59}$' THEN
    RAISE EXCEPTION 'el usuario debe tener de 3 a 60 caracteres (letras minúsculas, números, punto, guion)' USING ERRCODE = 'P0001', DETAIL = 'NEX:USUARIO_INVALIDO';
  END IF;
  PERFORM public.usr_exigir_datos(p_nombre, p_apellido, p_ci, p_email, p_telefono);
  IF p_password IS NULL OR char_length(p_password) NOT BETWEEN 10 AND 200 OR lower(p_password) = v_usuario THEN
    RAISE EXCEPTION 'la contraseña inicial debe tener de 10 a 200 caracteres y no ser igual al usuario' USING ERRCODE = 'P0001', DETAIL = 'NEX:CONTRASENA_INVALIDA';
  END IF;

  BEGIN
    INSERT INTO public.usuarios (empresa_id, usuario, nombre, apellido, ci, email, telefono, password_hash, estado, debe_cambiar_contrasena, creado_por, creado_por_tipo)
    VALUES (p_empresa, v_usuario, btrim(p_nombre), btrim(p_apellido), public.usr_normalizar_ci(p_ci), btrim(p_email), public.usr_normalizar_telefono(p_telefono),
            crypt(p_password, gen_salt('bf', 12)), 'ACTIVO', true, p_actor, 'USUARIO')
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_c = CONSTRAINT_NAME;
    IF v_c = 'usuarios_empresa_ci_key' THEN
      RAISE EXCEPTION 'ya existe otro usuario con esa CI en la empresa' USING ERRCODE = 'P0001', DETAIL = 'NEX:CI_DUPLICADA';
    END IF;
    RAISE EXCEPTION 'ya existe un usuario con ese nombre en la empresa' USING ERRCODE = 'P0001', DETAIL = 'NEX:USUARIO_DUPLICADO';
  END;

  PERFORM public.usr_aplicar_perfiles(p_empresa, p_actor, v_id, p_perfiles);
  -- El evento no guarda CI, correo ni teléfono (datos personales): solo identifica al usuario creado.
  INSERT INTO public.eventos_seguridad (empresa_id, usuario_id, tipo, detalle)
  VALUES (p_empresa, p_actor, 'USUARIO_CREADO', jsonb_build_object('usuario_id', v_id, 'usuario', v_usuario, 'perfiles', to_jsonb(coalesce(p_perfiles, ARRAY[]::text[]))));

  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.usr_actualizar(p_empresa uuid, p_actor uuid, p_id uuid, p_nombre text, p_apellido text, p_ci text, p_email text, p_telefono text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_c text;
BEGIN
  PERFORM public.usr_exigir_admin(p_empresa, p_actor);
  PERFORM public.usr_exigir_datos(p_nombre, p_apellido, p_ci, p_email, p_telefono);

  BEGIN
    UPDATE public.usuarios SET nombre = btrim(p_nombre), apellido = btrim(p_apellido), ci = public.usr_normalizar_ci(p_ci), email = btrim(p_email),
           telefono = public.usr_normalizar_telefono(p_telefono), actualizado_at = now()
     WHERE empresa_id = p_empresa AND id = p_id
       AND NOT EXISTS (SELECT 1 FROM public.administradores_plataforma ap WHERE ap.empresa_id = usuarios.empresa_id AND ap.usuario_id = usuarios.id AND ap.activo);
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_c = CONSTRAINT_NAME;
    IF v_c = 'usuarios_empresa_ci_key' THEN
      RAISE EXCEPTION 'ya existe otro usuario con esa CI en la empresa' USING ERRCODE = 'P0001', DETAIL = 'NEX:CI_DUPLICADA';
    END IF;
    RAISE;
  END;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'el usuario no existe en la empresa' USING ERRCODE = 'P0001', DETAIL = 'NEX:USUARIO_NO_ENCONTRADO';
  END IF;
  INSERT INTO public.eventos_seguridad (empresa_id, usuario_id, tipo, detalle) VALUES (p_empresa, p_actor, 'USUARIO_ACTUALIZADO', jsonb_build_object('usuario_id', p_id));
END $$;

CREATE OR REPLACE FUNCTION public.usr_cambiar_estado(p_empresa uuid, p_actor uuid, p_id uuid, p_activo boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_u public.usuarios%ROWTYPE;
BEGIN
  PERFORM public.usr_serializar_admins(p_empresa, p_actor);
  SELECT * INTO v_u FROM public.usuarios u WHERE u.empresa_id = p_empresa AND u.id = p_id FOR UPDATE;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.administradores_plataforma ap WHERE ap.empresa_id = p_empresa AND ap.usuario_id = p_id AND ap.activo) THEN
    RAISE EXCEPTION 'el usuario no existe en la empresa' USING ERRCODE = 'P0001', DETAIL = 'NEX:USUARIO_NO_ENCONTRADO';
  END IF;
  IF v_u.estado = 'BAJA' THEN
    RAISE EXCEPTION 'un usuario dado de baja no se puede reactivar' USING ERRCODE = 'P0001', DETAIL = 'NEX:USUARIO_BAJA';
  END IF;
  IF NOT p_activo THEN
    IF p_id = p_actor THEN
      RAISE EXCEPTION 'no puede desactivar su propio usuario' USING ERRCODE = 'P0001', DETAIL = 'NEX:AUTODESACTIVACION';
    END IF;
    IF public.usuario_es_admin_empresa(p_empresa, p_id) AND public.usr_otros_admins(p_empresa, p_id) = 0 THEN
      RAISE EXCEPTION 'la empresa quedaría sin administrador activo' USING ERRCODE = 'P0001', DETAIL = 'NEX:ULTIMO_ADMIN';
    END IF;
    UPDATE public.usuarios SET estado = 'BLOQUEADO', version_acceso = version_acceso + 1, actualizado_at = now() WHERE empresa_id = p_empresa AND id = p_id;
    UPDATE public.sesiones_usuario SET revocada_at = now() WHERE empresa_id = p_empresa AND usuario_id = p_id AND revocada_at IS NULL;
  ELSE
    UPDATE public.usuarios SET estado = 'ACTIVO', intentos_fallidos = 0, bloqueado_hasta = NULL, version_acceso = version_acceso + 1, actualizado_at = now() WHERE empresa_id = p_empresa AND id = p_id;
  END IF;
  INSERT INTO public.eventos_seguridad (empresa_id, usuario_id, tipo, detalle)
  VALUES (p_empresa, p_actor, CASE WHEN p_activo THEN 'USUARIO_ACTIVADO' ELSE 'USUARIO_DESACTIVADO' END, jsonb_build_object('usuario_id', p_id));
END $$;

CREATE OR REPLACE FUNCTION public.usr_asignar_perfiles(p_empresa uuid, p_actor uuid, p_id uuid, p_perfiles text[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.usr_serializar_admins(p_empresa, p_actor);
  PERFORM public.nex_asegurar_perfiles_estandar(p_empresa);
  PERFORM 1 FROM public.usuarios u WHERE u.empresa_id = p_empresa AND u.id = p_id FOR UPDATE;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.administradores_plataforma ap WHERE ap.empresa_id = p_empresa AND ap.usuario_id = p_id AND ap.activo) THEN
    RAISE EXCEPTION 'el usuario no existe en la empresa' USING ERRCODE = 'P0001', DETAIL = 'NEX:USUARIO_NO_ENCONTRADO';
  END IF;

  PERFORM public.usr_aplicar_perfiles(p_empresa, p_actor, p_id, p_perfiles);

  -- Protección del último administrador (dentro de la sección serializada por empresa): tras el cambio la empresa debe conservar al menos un administrador activo.
  IF NOT public.usuario_es_admin_empresa(p_empresa, p_id) AND public.usr_otros_admins(p_empresa, p_id) = 0 THEN
    RAISE EXCEPTION 'la empresa quedaría sin administrador activo' USING ERRCODE = 'P0001', DETAIL = 'NEX:ULTIMO_ADMIN';
  END IF;

  -- Los permisos se recalculan en cada petición; además se invalidan las sesiones anteriores del usuario.
  UPDATE public.usuarios SET version_acceso = version_acceso + 1, actualizado_at = now() WHERE empresa_id = p_empresa AND id = p_id;
  IF p_id <> p_actor THEN
    UPDATE public.sesiones_usuario SET revocada_at = now() WHERE empresa_id = p_empresa AND usuario_id = p_id AND revocada_at IS NULL;
  END IF;
  INSERT INTO public.eventos_seguridad (empresa_id, usuario_id, tipo, detalle)
  VALUES (p_empresa, p_actor, 'USUARIO_PERFILES', jsonb_build_object('usuario_id', p_id, 'perfiles', to_jsonb(coalesce(p_perfiles, ARRAY[]::text[]))));
END $$;

-- F003: contraseña inicial provisional. La define el administrador al crear la cuenta; el PROPIO usuario debe reemplazarla antes de operar (la aplicación solo le permite este flujo mientras debe_cambiar_contrasena sea true).
-- Exige la contraseña actual (bcrypt en la base), valida la nueva (10-200 caracteres, distinta de la actual y del usuario), cierra las demás sesiones y registra el evento. No es un restablecimiento: no la puede ejecutar nadie por otro.
CREATE OR REPLACE FUNCTION public.usr_cambiar_contrasena_propia(p_empresa uuid, p_usuario uuid, p_sesion uuid, p_actual text, p_nueva text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_u public.usuarios%ROWTYPE;
BEGIN
  SELECT * INTO v_u FROM public.usuarios u WHERE u.empresa_id = p_empresa AND u.id = p_usuario AND u.estado = 'ACTIVO' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'usuario no válido' USING ERRCODE = '42501';
  END IF;
  IF p_actual IS NULL OR p_nueva IS NULL OR v_u.password_hash <> crypt(p_actual, v_u.password_hash) THEN
    RAISE EXCEPTION 'la contraseña actual no es correcta' USING ERRCODE = 'P0001', DETAIL = 'NEX:CONTRASENA_ACTUAL';
  END IF;
  IF char_length(p_nueva) NOT BETWEEN 10 AND 200 OR lower(p_nueva) = v_u.usuario OR p_nueva = p_actual THEN
    RAISE EXCEPTION 'la contraseña nueva debe tener de 10 a 200 caracteres y ser distinta de la actual y del usuario' USING ERRCODE = 'P0001', DETAIL = 'NEX:CONTRASENA_INVALIDA';
  END IF;

  UPDATE public.usuarios SET password_hash = crypt(p_nueva, gen_salt('bf', 12)), debe_cambiar_contrasena = false, intentos_fallidos = 0, bloqueado_hasta = NULL,
         version_acceso = version_acceso + 1, actualizado_at = now()
   WHERE empresa_id = p_empresa AND id = p_usuario;
  UPDATE public.sesiones_usuario SET revocada_at = now() WHERE empresa_id = p_empresa AND usuario_id = p_usuario AND revocada_at IS NULL AND id <> p_sesion;
  INSERT INTO public.eventos_seguridad (empresa_id, usuario_id, tipo, detalle) VALUES (p_empresa, p_usuario, 'CONTRASENA_CAMBIADA', jsonb_build_object('inicial', v_u.debe_cambiar_contrasena));
END $$;

-- F005: alcance del usuario con las relaciones EXISTENTES (usuario_sucursal / usuario_deposito). Fail-closed: se fija alcance «asignadas/asignados» y solo lo marcado; nunca TODAS/TODOS. No altera a quien ya tiene alcance total (cuenta de
-- arranque/plataforma): se rechaza. Sucursales y depósitos deben ser ACTIVOS de la misma empresa (las claves foráneas compuestas lo imponen además).
CREATE OR REPLACE FUNCTION public.usr_asignar_alcance(p_empresa uuid, p_actor uuid, p_usuario uuid, p_sucursales uuid[], p_depositos uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_u public.usuarios%ROWTYPE;
BEGIN
  PERFORM public.usr_exigir_admin(p_empresa, p_actor);
  SELECT * INTO v_u FROM public.usuarios u WHERE u.empresa_id = p_empresa AND u.id = p_usuario FOR UPDATE;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.administradores_plataforma ap WHERE ap.empresa_id = p_empresa AND ap.usuario_id = p_usuario AND ap.activo) THEN
    RAISE EXCEPTION 'el usuario no existe en la empresa' USING ERRCODE = 'P0001', DETAIL = 'NEX:USUARIO_NO_ENCONTRADO';
  END IF;
  IF v_u.alcance_sucursales = 'TODAS' OR v_u.alcance_depositos = 'TODOS' THEN
    RAISE EXCEPTION 'el usuario tiene alcance total y no se modifica desde aquí' USING ERRCODE = 'P0001', DETAIL = 'NEX:ALCANCE_TOTAL';
  END IF;
  p_sucursales := coalesce(p_sucursales, ARRAY[]::uuid[]);
  p_depositos := coalesce(p_depositos, ARRAY[]::uuid[]);
  IF (SELECT count(*) FROM public.sucursales s WHERE s.empresa_id = p_empresa AND s.activo AND s.id = ANY (p_sucursales)) <> (SELECT count(DISTINCT x) FROM unnest(p_sucursales) x)
     OR (SELECT count(*) FROM public.depositos d WHERE d.empresa_id = p_empresa AND d.activo AND d.id = ANY (p_depositos)) <> (SELECT count(DISTINCT x) FROM unnest(p_depositos) x) THEN
    RAISE EXCEPTION 'alguna sucursal o depósito no existe en la empresa o está inactivo' USING ERRCODE = 'P0001', DETAIL = 'NEX:ALCANCE_INVALIDO';
  END IF;

  DELETE FROM public.usuario_sucursal WHERE empresa_id = p_empresa AND usuario_id = p_usuario AND NOT (sucursal_id = ANY (p_sucursales));
  INSERT INTO public.usuario_sucursal (empresa_id, usuario_id, sucursal_id, asignado_por) SELECT p_empresa, p_usuario, x, p_actor FROM unnest(p_sucursales) x ON CONFLICT DO NOTHING;
  DELETE FROM public.usuario_deposito WHERE empresa_id = p_empresa AND usuario_id = p_usuario AND NOT (deposito_id = ANY (p_depositos));
  INSERT INTO public.usuario_deposito (empresa_id, usuario_id, deposito_id, asignado_por) SELECT p_empresa, p_usuario, x, p_actor FROM unnest(p_depositos) x ON CONFLICT DO NOTHING;
  INSERT INTO public.eventos_seguridad (empresa_id, usuario_id, tipo, detalle)
  VALUES (p_empresa, p_actor, 'USUARIO_ALCANCE', jsonb_build_object('usuario_id', p_usuario, 'sucursales', to_jsonb(p_sucursales), 'depositos', to_jsonb(p_depositos)));
END $$;

-- 5) Vendedor estructurado en la FE ---------------------------------------------------------------------------------------------------------------------------------------
CREATE TABLE public.documento_electronico_vendedor (
  empresa_id      uuid        NOT NULL REFERENCES public.empresas (id),
  documento_id    uuid        NOT NULL,
  vendedor_id     uuid        NOT NULL,
  vendedor_nombre text        NOT NULL CHECK (char_length(vendedor_nombre) BETWEEN 1 AND 255),
  emisor_id       uuid        NOT NULL,
  creado_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, documento_id),
  CONSTRAINT fe_vendedor_documento_fk FOREIGN KEY (empresa_id, documento_id) REFERENCES public.documentos_electronicos (empresa_id, id),
  CONSTRAINT fe_vendedor_usuario_fk FOREIGN KEY (empresa_id, vendedor_id) REFERENCES public.usuarios (empresa_id, id),
  CONSTRAINT fe_vendedor_emisor_fk FOREIGN KEY (empresa_id, emisor_id) REFERENCES public.usuarios (empresa_id, id)
);
COMMENT ON TABLE public.documento_electronico_vendedor IS 'NEX-074: vendedor comercial (ID + nombre al emitir) de cada FE, separado del emisor. Sin escritura directa para la aplicación; inmutable.';
CREATE INDEX fe_vendedor_vendedor_idx ON public.documento_electronico_vendedor (empresa_id, vendedor_id);

CREATE OR REPLACE FUNCTION public.fe_vendedor_inmutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF public.nex_reinicio_demo_activo(OLD.empresa_id) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'documento_electronico_vendedor es inmutable (vendedor comercial de la FE)' USING ERRCODE = 'P0001';
END $$;

CREATE TRIGGER fe_vendedor_inmutable_trg BEFORE UPDATE OR DELETE ON public.documento_electronico_vendedor
  FOR EACH ROW EXECUTE FUNCTION public.fe_vendedor_inmutable();

CREATE OR REPLACE FUNCTION public.fe_documento_crear_fe_vendedor(
  p_empresa uuid, p_usuario uuid, p_sucursal uuid, p_punto uuid, p_clave text, p_cliente uuid, p_receptor_documento text, p_receptor_nombre text,
  p_moneda text, p_total numeric, p_payload jsonb, p_asignaciones jsonb, p_direccion_entrega uuid, p_vendedor uuid)
RETURNS TABLE (o_documento_id uuid, o_numero text, o_reutilizado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid; v_numero text; v_reutilizado boolean;
  v_existe boolean;
  v_nombre text;
  v_previo uuid;
BEGIN
  IF p_vendedor IS NULL THEN
    RAISE EXCEPTION 'el vendedor es obligatorio' USING ERRCODE = 'P0001', DETAIL = 'NEX:VENDEDOR_REQUERIDO';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.documentos_electronicos d WHERE d.empresa_id = p_empresa AND d.clave_idempotencia = p_clave) INTO v_existe;

  IF NOT v_existe THEN
    IF NOT public.usuario_es_vendedor_activo(p_empresa, p_vendedor) THEN
      RAISE EXCEPTION 'el vendedor no existe en la empresa, está inactivo o no tiene el perfil Vendedor' USING ERRCODE = 'P0001', DETAIL = 'NEX:VENDEDOR_INVALIDO';
    END IF;
  END IF;

  SELECT c.o_documento_id, c.o_numero, c.o_reutilizado INTO v_id, v_numero, v_reutilizado
    FROM public.fe_documento_crear_fe_con_stock_entrega(p_empresa, p_usuario, p_sucursal, p_punto, p_clave, p_cliente, p_receptor_documento, p_receptor_nombre, p_moneda, p_total, p_payload, p_asignaciones, p_direccion_entrega) c;

  IF NOT v_reutilizado THEN
    SELECT btrim(regexp_replace(concat_ws(' ', u.nombre, u.apellido), '\s+', ' ', 'g')) INTO v_nombre FROM public.usuarios u WHERE u.empresa_id = p_empresa AND u.id = p_vendedor;
    INSERT INTO public.documento_electronico_vendedor (empresa_id, documento_id, vendedor_id, vendedor_nombre, emisor_id) VALUES (p_empresa, v_id, p_vendedor, v_nombre, p_usuario);
  ELSE
    -- FE posterior a NEX-074: el vendedor registrado debe ser el mismo. FE ANTERIOR (sin fila): no se le atribuye ningún vendedor ni se escribe nada; esta función solo devuelve el documento existente y la aplicación ya probó la
    -- equivalencia con los datos congelados de esa FE (o respondió 409). Sin fila no hay forma de que un documento NUEVO quede sin vendedor: la fila se inserta en la misma transacción que la creación.
    SELECT v.vendedor_id INTO v_previo FROM public.documento_electronico_vendedor v WHERE v.empresa_id = p_empresa AND v.documento_id = v_id;
    IF FOUND AND v_previo IS DISTINCT FROM p_vendedor THEN
      RAISE EXCEPTION 'la clave de idempotencia ya se usó con otro vendedor' USING ERRCODE = 'P0001', DETAIL = 'NEX:IDEMPOTENCIA_CONFLICTO';
    END IF;
  END IF;

  RETURN QUERY SELECT v_id, v_numero, v_reutilizado;
END $$;

-- 6) Grants: la aplicación solo ejecuta las funciones y lee; no escribe directamente en estas tablas. El ayudante se llama ..._facturacion_vendedor para ejecutarse DESPUÉS de ..._facturacion_stock_entrega (NEX-068),
--    que concede la emisión de 13 parámetros; aquí se retira ese acceso directo: la emisión pasa a ser SIEMPRE la de 14 parámetros (con vendedor).
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_facturacion_vendedor() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;
  REVOKE ALL ON public.documento_electronico_vendedor FROM PUBLIC;
  REVOKE ALL ON public.documento_electronico_vendedor FROM nexit_runtime;
  GRANT SELECT ON public.documento_electronico_vendedor TO nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_documento_crear_fe_vendedor(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb, jsonb, uuid, uuid) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.fe_documento_crear_fe_vendedor(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb, jsonb, uuid, uuid) TO nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_documento_crear_fe_con_stock_entrega(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb, jsonb, uuid) FROM nexit_runtime;
END $$;
REVOKE ALL ON FUNCTION public.nex_aplicar_grants_facturacion_vendedor() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_usuarios_vendedores() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;
  REVOKE ALL ON FUNCTION public.nex_asegurar_perfiles_estandar(uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.usr_aplicar_perfiles(uuid, uuid, uuid, text[]) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.usr_exigir_admin(uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.usr_exigir_datos(text, text, text, text, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.usr_normalizar_ci(text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.usr_normalizar_telefono(text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.usr_otros_admins(uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.usuario_es_admin_empresa(uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.usuario_es_vendedor_activo(uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.usr_perfiles_catalogo(uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.usr_crear(uuid, uuid, text, text, text, text, text, text, text, text[]) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.usr_actualizar(uuid, uuid, uuid, text, text, text, text, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.usr_cambiar_estado(uuid, uuid, uuid, boolean) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.usr_asignar_perfiles(uuid, uuid, uuid, text[]) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.usr_serializar_admins(uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.usr_cambiar_contrasena_propia(uuid, uuid, uuid, text, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.usr_asignar_alcance(uuid, uuid, uuid, uuid[], uuid[]) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.usr_perfiles_catalogo(uuid, uuid) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.usr_crear(uuid, uuid, text, text, text, text, text, text, text, text[]) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.usr_actualizar(uuid, uuid, uuid, text, text, text, text, text) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.usr_cambiar_estado(uuid, uuid, uuid, boolean) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.usr_asignar_perfiles(uuid, uuid, uuid, text[]) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.usr_cambiar_contrasena_propia(uuid, uuid, uuid, text, text) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.usr_asignar_alcance(uuid, uuid, uuid, uuid[], uuid[]) TO nexit_runtime;
END $$;
REVOKE ALL ON FUNCTION public.nex_aplicar_grants_usuarios_vendedores() FROM PUBLIC;

SELECT public.nex_aplicar_grants_usuarios_vendedores();
SELECT public.nex_aplicar_grants_facturacion_vendedor();
