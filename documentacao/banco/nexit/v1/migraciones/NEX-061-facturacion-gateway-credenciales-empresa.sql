-- =====================================================================
-- NEX-061 — Facturación (PRO-133, UI): configuración del gateway de facturación electrónica POR EMPRESA desde la interfaz administrativa del NEXIT, con las credenciales API guardadas en PostgreSQL.
-- Requiere NEX-047 (fe_gateway_config) y NEX-052 (envoltorio de grants que descubre los ayudantes nex_aplicar_grants_*). Incremental: NO edita NEX-001…060.
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo y consulta del historial real schema_migrations). Reversión: scripts/reversion-NEX-061.sql. ESTADO: versionada y NO aplicada.
--
-- Decisión expresa del responsable: la CLAVE de la API puede guardarse SIN cifrado en reposo (no KMS, no hash). Compensación: acceso restringido por diseño:
--  · La clave vive en una tabla APARTE (fe_gateway_credenciales) SIN ningún privilegio para el rol de la aplicación (nexit_runtime) —ni siquiera SELECT—; así ningún GET, listado ni reaplicación de grants
--    (los ayudantes de grants regraban fe_gateway_config completa) puede exponerla. Solo la leen/escriben funciones SECURITY DEFINER.
--  · fe_gateway_config_ver() NUNCA devuelve la clave (solo «tiene_password»). La bitácora no contiene secretos.
--  · Permiso FACTURACION_ELECTRONICA.CONFIGURAR («administrador fiscal»): se registra SIN asignarlo a ningún perfil (el administrador de la empresa lo tiene por definición; el resto, por decisión expresa).
--  · Todas las funciones reciben la empresa de la SESIÓN y verifican el permiso/pertenencia dentro de la función (aislamiento multiempresa); fe_gateway_credenciales_leer() la usa la emisión/consulta con el
--    usuario de la sesión (debe pertenecer a la empresa y tener algún permiso de facturación).
--  · Control de abuso de «Probar conexión»: fe_gateway_prueba_iniciar() limita a 5 intentos por ventana de 5 minutos y 3 segundos entre intentos, por empresa (compartido entre instancias).
--  · Cambiar usuario o clave incrementa credenciales_version y borra el resultado de la última prueba (la aplicación invalida su caché de token por huella de credenciales).
-- Reutiliza fe_gateway_config (URL, timeout, activo); credencial_ref queda en 'NEXIT_DB' (las credenciales ya no dependen de app.env, aunque la aplicación conserva un respaldo por variables de entorno para
-- empresas sin credenciales en la base). Qué NO hace: no toca documentos, numeración, CDC, payloads ni migraciones; no llama al gateway (la prueba de conexión la hace el servidor de la aplicación).
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.fe_gateway_config') IS NULL OR to_regclass('public.usuarios') IS NULL OR to_regprocedure('public.usuario_tiene_permiso(uuid,uuid,text,text)') IS NULL
     OR to_regprocedure('public.actualizar_fecha()') IS NULL OR to_regprocedure('public.nex_reinicio_demo_activo(uuid)') IS NULL
     OR position('nex\_aplicar\_grants\_%' IN pg_get_functiondef('public.nex_aplicar_grants_runtime()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'NEX-061 requiere NEX-047 (fe_gateway_config), NEX-012/014/001 (funciones base) y NEX-052 (envoltorio de grants).';
  END IF;
  IF to_regclass('public.fe_gateway_credenciales') IS NOT NULL OR EXISTS (SELECT 1 FROM public.permisos WHERE codigo = 'FACTURACION_ELECTRONICA.CONFIGURAR') THEN
    RAISE EXCEPTION 'NEX-061 parece aplicada (la tabla o el permiso ya existen); no se reaplica por suposición.';
  END IF;
END $$;

INSERT INTO public.permisos (codigo, recurso, accion, modulo, nivel_alcance, clase)
VALUES ('FACTURACION_ELECTRONICA.CONFIGURAR', 'FACTURACION_ELECTRONICA', 'CONFIGURAR', 'facturacion', 'EMPRESA', 'ADMINISTRATIVA');

-- Estado de la última prueba de conexión (no secreto) en la configuración existente.
ALTER TABLE public.fe_gateway_config
  ADD COLUMN credenciales_version integer     NOT NULL DEFAULT 0 CHECK (credenciales_version >= 0),
  ADD COLUMN ultima_prueba_at     timestamptz,
  ADD COLUMN ultima_prueba_estado text CHECK (ultima_prueba_estado IN ('OK', 'CREDENCIALES_INVALIDAS', 'NO_DISPONIBLE', 'TIMEOUT'));

-- Credenciales: tabla APARTE, sin privilegios para el rol de la aplicación.
CREATE TABLE public.fe_gateway_credenciales (
  empresa_id      uuid        PRIMARY KEY REFERENCES public.empresas (id),
  api_usuario     text        NOT NULL CHECK (char_length(btrim(api_usuario)) BETWEEN 1 AND 60),
  api_password    text        NOT NULL CHECK (char_length(api_password) BETWEEN 1 AND 200),
  actualizado_por uuid        NOT NULL,
  creado_at       timestamptz NOT NULL DEFAULT now(),
  actualizado_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fe_gateway_credenciales_usuario_fk FOREIGN KEY (empresa_id, actualizado_por) REFERENCES public.usuarios (empresa_id, id)
);
COMMENT ON TABLE public.fe_gateway_credenciales IS 'NEX-061: usuario y clave de la API del gateway por empresa (clave SIN cifrado en reposo por decisión expresa del responsable). Sin privilegios para nexit_runtime: solo las funciones SECURITY DEFINER la leen o escriben.';
CREATE TRIGGER fe_gateway_credenciales_actualizado_trg BEFORE UPDATE ON public.fe_gateway_credenciales FOR EACH ROW EXECUTE FUNCTION public.actualizar_fecha();

-- Límite de intentos de «Probar conexión» (sin secretos).
CREATE TABLE public.fe_gateway_prueba_limite (
  empresa_id     uuid        PRIMARY KEY REFERENCES public.empresas (id),
  ventana_inicio timestamptz NOT NULL,
  intentos       integer     NOT NULL CHECK (intentos >= 0),
  ultimo_at      timestamptz NOT NULL
);

-- Bitácora (solo altas, sin secretos).
CREATE TABLE public.fe_gateway_config_log (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid        NOT NULL REFERENCES public.empresas (id),
  usuario_id uuid        NOT NULL,
  accion     text        NOT NULL CHECK (accion IN ('GUARDAR', 'PROBAR')),
  detalle    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  creado_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fe_gateway_config_log_usuario_fk FOREIGN KEY (empresa_id, usuario_id) REFERENCES public.usuarios (empresa_id, id)
);
CREATE INDEX fe_gateway_config_log_empresa_idx ON public.fe_gateway_config_log (empresa_id, creado_at DESC);

CREATE OR REPLACE FUNCTION public.fe_gateway_config_log_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND public.nex_reinicio_demo_activo(OLD.empresa_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'fe_gateway_config_log es de solo altas: no se modifica ni se borra.' USING ERRCODE = 'P0001';
END $$;
CREATE TRIGGER fe_gateway_config_log_inmutable_fila_trg BEFORE UPDATE OR DELETE ON public.fe_gateway_config_log FOR EACH ROW EXECUTE FUNCTION public.fe_gateway_config_log_inmutable();
CREATE TRIGGER fe_gateway_config_log_inmutable_truncate_trg BEFORE TRUNCATE ON public.fe_gateway_config_log FOR EACH STATEMENT EXECUTE FUNCTION public.fe_gateway_config_log_inmutable();

-- Lectura de la configuración para la pantalla: NUNCA devuelve la clave.
CREATE OR REPLACE FUNCTION public.fe_gateway_config_ver(p_empresa uuid, p_usuario uuid)
RETURNS TABLE (o_base_url text, o_api_usuario text, o_tiene_password boolean, o_activo boolean, o_timeout_ms integer, o_ultima_prueba_at timestamptz, o_ultima_prueba_estado text, o_actualizado_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CONFIGURAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.CONFIGURAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT g.base_url, c.api_usuario, (c.api_password IS NOT NULL), g.activo, g.timeout_ms, g.ultima_prueba_at, g.ultima_prueba_estado, greatest(g.actualizado_at, c.actualizado_at)
      FROM public.fe_gateway_config g LEFT JOIN public.fe_gateway_credenciales c ON c.empresa_id = g.empresa_id
     WHERE g.empresa_id = p_empresa;
END $$;

-- Alta/modificación. p_password NULL = conservar la clave actual (la edición no la revela). Cambiar usuario o clave sube credenciales_version y borra el resultado de la última prueba.
CREATE OR REPLACE FUNCTION public.fe_gateway_config_guardar(p_empresa uuid, p_usuario uuid, p_base_url text, p_api_usuario text, p_password text, p_timeout_ms integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_u text := btrim(coalesce(p_api_usuario, ''));
  v_prev public.fe_gateway_credenciales%ROWTYPE;
  v_existe boolean;
  v_cambia boolean;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CONFIGURAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.CONFIGURAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_base_url IS NULL OR p_base_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]{2,5})?$' THEN
    RAISE EXCEPTION 'la URL del gateway debe ser https sin ruta' USING ERRCODE = 'P0001', DETAIL = 'NEX:URL_INVALIDA';
  END IF;
  IF char_length(v_u) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'informe el usuario de la API (1 a 60 caracteres)' USING ERRCODE = 'P0001', DETAIL = 'NEX:USUARIO_INVALIDO';
  END IF;
  IF p_timeout_ms IS NULL OR p_timeout_ms NOT BETWEEN 1000 AND 60000 THEN
    RAISE EXCEPTION 'el tiempo de espera debe estar entre 1000 y 60000 ms' USING ERRCODE = 'P0001', DETAIL = 'NEX:TIMEOUT_INVALIDO';
  END IF;
  IF p_password IS NOT NULL AND char_length(p_password) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'la clave de la API debe tener de 1 a 200 caracteres' USING ERRCODE = 'P0001', DETAIL = 'NEX:PASSWORD_INVALIDA';
  END IF;

  SELECT * INTO v_prev FROM public.fe_gateway_credenciales WHERE empresa_id = p_empresa FOR UPDATE;
  v_existe := FOUND;
  IF NOT v_existe AND p_password IS NULL THEN
    RAISE EXCEPTION 'informe la clave de la API' USING ERRCODE = 'P0001', DETAIL = 'NEX:PASSWORD_REQUERIDA';
  END IF;
  v_cambia := NOT v_existe OR v_prev.api_usuario IS DISTINCT FROM v_u OR (p_password IS NOT NULL AND p_password IS DISTINCT FROM v_prev.api_password);

  INSERT INTO public.fe_gateway_config (empresa_id, base_url, credencial_ref, timeout_ms, activo)
  VALUES (p_empresa, p_base_url, 'NEXIT_DB', p_timeout_ms, true)
  ON CONFLICT (empresa_id) DO UPDATE SET base_url = EXCLUDED.base_url, timeout_ms = EXCLUDED.timeout_ms, activo = true,
    credencial_ref = CASE WHEN public.fe_gateway_config.credencial_ref = 'NEXIT_DB' THEN 'NEXIT_DB' ELSE EXCLUDED.credencial_ref END;

  IF NOT v_existe THEN
    INSERT INTO public.fe_gateway_credenciales (empresa_id, api_usuario, api_password, actualizado_por) VALUES (p_empresa, v_u, p_password, p_usuario);
  ELSE
    UPDATE public.fe_gateway_credenciales SET api_usuario = v_u, api_password = coalesce(p_password, api_password), actualizado_por = p_usuario WHERE empresa_id = p_empresa;
  END IF;

  IF v_cambia THEN
    UPDATE public.fe_gateway_config SET credenciales_version = credenciales_version + 1, ultima_prueba_at = NULL, ultima_prueba_estado = NULL WHERE empresa_id = p_empresa;
  END IF;

  INSERT INTO public.fe_gateway_config_log (empresa_id, usuario_id, accion, detalle)
  VALUES (p_empresa, p_usuario, 'GUARDAR', jsonb_build_object('usuario_api_cambio', NOT v_existe OR v_prev.api_usuario IS DISTINCT FROM v_u, 'clave_cambio', p_password IS NOT NULL AND (NOT v_existe OR p_password IS DISTINCT FROM v_prev.api_password), 'base_url', p_base_url));
END $$;

-- Credenciales para la EMISIÓN/CONSULTA/PRUEBA (servidor de la aplicación). Solo con configuración activa; el usuario debe pertenecer a la empresa y tener algún permiso de facturación.
CREATE OR REPLACE FUNCTION public.fe_gateway_credenciales_leer(p_empresa uuid, p_usuario uuid)
RETURNS TABLE (o_api_usuario text, o_api_password text, o_version integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT (public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CREAR') OR public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'EDITAR')
          OR public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'VER') OR public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CONFIGURAR')) THEN
    RAISE EXCEPTION 'el usuario no tiene permisos de facturación electrónica en esta empresa' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT c.api_usuario, c.api_password, g.credenciales_version
      FROM public.fe_gateway_config g JOIN public.fe_gateway_credenciales c ON c.empresa_id = g.empresa_id
     WHERE g.empresa_id = p_empresa AND g.activo;
END $$;

-- ¿Hay credenciales guardadas? (para el estado de prontitud; sin secretos). Solo la empresa de la sesión.
CREATE OR REPLACE FUNCTION public.fe_gateway_credenciales_existe(p_empresa uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.fe_gateway_credenciales WHERE empresa_id = p_empresa);
$$;

-- Control de abuso: devuelve 0 si la prueba está permitida (y la cuenta), o los segundos a esperar.
CREATE OR REPLACE FUNCTION public.fe_gateway_prueba_iniciar(p_empresa uuid, p_usuario uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v public.fe_gateway_prueba_limite%ROWTYPE;
  v_espera integer;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CONFIGURAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.CONFIGURAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v FROM public.fe_gateway_prueba_limite WHERE empresa_id = p_empresa FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.fe_gateway_prueba_limite (empresa_id, ventana_inicio, intentos, ultimo_at) VALUES (p_empresa, now(), 1, now())
    ON CONFLICT (empresa_id) DO UPDATE SET intentos = public.fe_gateway_prueba_limite.intentos + 1, ultimo_at = now();
    RETURN 0;
  END IF;
  IF now() - v.ultimo_at < interval '3 seconds' THEN
    RETURN greatest(1, ceil(extract(epoch FROM (interval '3 seconds' - (now() - v.ultimo_at))))::integer);
  END IF;
  IF now() - v.ventana_inicio > interval '5 minutes' THEN
    UPDATE public.fe_gateway_prueba_limite SET ventana_inicio = now(), intentos = 1, ultimo_at = now() WHERE empresa_id = p_empresa;
    RETURN 0;
  END IF;
  IF v.intentos >= 5 THEN
    v_espera := greatest(1, ceil(extract(epoch FROM (interval '5 minutes' - (now() - v.ventana_inicio))))::integer);
    RETURN v_espera;
  END IF;
  UPDATE public.fe_gateway_prueba_limite SET intentos = intentos + 1, ultimo_at = now() WHERE empresa_id = p_empresa;
  RETURN 0;
END $$;

-- Resultado de la prueba (sin secretos). p_guardada = la prueba usó las credenciales GUARDADAS (solo entonces se actualiza el estado visible de la configuración).
CREATE OR REPLACE FUNCTION public.fe_gateway_prueba_registrar(p_empresa uuid, p_usuario uuid, p_estado text, p_guardada boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CONFIGURAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.CONFIGURAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_estado NOT IN ('OK', 'CREDENCIALES_INVALIDAS', 'NO_DISPONIBLE', 'TIMEOUT') THEN
    RAISE EXCEPTION 'estado de prueba inválido' USING ERRCODE = 'P0001', DETAIL = 'NEX:ESTADO_INVALIDO';
  END IF;
  IF p_guardada THEN
    UPDATE public.fe_gateway_config SET ultima_prueba_at = now(), ultima_prueba_estado = p_estado WHERE empresa_id = p_empresa;
  END IF;
  INSERT INTO public.fe_gateway_config_log (empresa_id, usuario_id, accion, detalle) VALUES (p_empresa, p_usuario, 'PROBAR', jsonb_build_object('estado', p_estado, 'credenciales_guardadas', p_guardada));
END $$;

CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_facturacion_gateway() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;

  -- La aplicación NO tiene ningún privilegio sobre las credenciales, el límite ni la bitácora: solo ejecuta las funciones.
  REVOKE ALL ON public.fe_gateway_credenciales, public.fe_gateway_prueba_limite, public.fe_gateway_config_log FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_gateway_config_ver(uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_gateway_config_guardar(uuid, uuid, text, text, text, integer) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_gateway_credenciales_leer(uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_gateway_credenciales_existe(uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_gateway_prueba_iniciar(uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_gateway_prueba_registrar(uuid, uuid, text, boolean) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_gateway_config_log_inmutable() FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.fe_gateway_config_ver(uuid, uuid) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_gateway_config_guardar(uuid, uuid, text, text, text, integer) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_gateway_credenciales_leer(uuid, uuid) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_gateway_credenciales_existe(uuid) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_gateway_prueba_iniciar(uuid, uuid) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_gateway_prueba_registrar(uuid, uuid, text, boolean) TO nexit_runtime;
END $$;

SELECT public.nex_aplicar_grants_facturacion_gateway();
