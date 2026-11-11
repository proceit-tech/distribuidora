-- =====================================================================
-- NEX-079 — Facturación PRO-342-R01: referencia NO SECRETA de la conexión usada en CADA intento (envío y consulta) y CDC informado también en la consulta MANUAL y en la del flujo NCE.
-- Orden: documentacao/ordens/ORD-CLAUDE-NEXIT-PRO-342-R01-CORRECAO-FLUXO-FISCAL-INTEGRAL-2026-11-11.md · Especificación: documentacao/definicoes/PRO-342-SOLUCAO-UNICA-AUDITORIAS-CONSOLIDADAS-2026-11-11.md
-- Requiere NEX-050 (cdc_informado), NEX-054 (fe_documento_registrar_consulta), NEX-061 (credenciales_version), NEX-062 (flujo NCE) y NEX-077 (consulta automática con token).
-- Incremental y ADITIVA: NO edita NEX-047…078. Las funciones existentes quedan INTACTAS con su firma; se agregan SOBRECARGAS con un parámetro final p_conexion jsonb. La aplicación usa la
-- sobrecarga y, si NEX-079 no está aplicada (42883), la firma anterior (sin conexión, y sin cdc_informado en la consulta manual/flujo, como hoy).
-- ESTADO: versionada y NO aplicada. NO ejecutar sin autorización expresa del responsable (backup previo). Reversión: scripts/reversion-NEX-079.sql.
--
-- Qué cambia:
--   1) documento_electronico_intentos.conexion (jsonb, solo altas como el resto de la tabla): {host, credencialRef, credencialesVersion, origenCredenciales}. NUNCA usuario/RUC de la API, clave,
--      token ni hashes de ellos. Es la evidencia de con qué gateway y qué versión de credenciales se hizo ESE intento (la configuración puede cambiar después).
--   2) Sobrecargas de registro con p_conexion:
--        · fe_documento_registrar_consulta (manual, NEX-054): mismas reglas + cdc_informado (antes la consulta manual no lo guardaba).
--          PRO-342-R03-01 (las tres vías): un estado final solo con CDC válido y coherente (informado o ya guardado del mismo documento); nunca con CDC NULL.
--        · fe_documento_registrar_consulta_flujo_nce (NEX-062): mismas reglas + cdc_informado.
--        · fe_documento_registrar_consulta_auto (NEX-077): mismas reglas (token vigente) + conexión.
--        · fe_documento_registrar_envio (NEX-050): mismas reglas + conexión. El lote se guarda tal como lo informó el gateway (ya validado por la aplicación), solo si el documento aún no tiene uno
--          y (PRO-342-R03) solo con estado ENVIADO (ACK correlacionado con este documento).
--   Ninguna función calcula, completa ni corrige un CDC: el CDC del documento solo se fija UNA vez con el que informó la API (coherente con tipo/establecimiento/punto/número, criterio ya
--   existente fe_cdc_coherente) y nunca se sobrescribe. Un estado intermedio (PENDIENTE, p. ej. «XML firmado») deja el documento pendiente: la consulta automática lo vuelve a consultar; solo un
--   estado final (APROBADO, RECHAZADO, CANCELADO, INUTILIZADO) lo saca de la reserva (fe_consulta_reservar_token ya filtra por estado_sifen pendiente).
-- =====================================================================
DO $$
BEGIN
  IF to_regprocedure('public.fe_documento_registrar_consulta(uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,text,jsonb)') IS NULL
     OR to_regprocedure('public.fe_documento_registrar_consulta_flujo_nce(uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,text,jsonb)') IS NULL
     OR to_regprocedure('public.fe_documento_registrar_consulta_auto(uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,text,jsonb,uuid)') IS NULL
     OR to_regprocedure('public.fe_documento_registrar_envio(uuid,uuid,uuid,text,text,text,text,integer,text,text,text,text,text,text,jsonb)') IS NULL
     OR to_regprocedure('public.fe_cdc_coherente(text,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'NEX-079 requiere NEX-050, NEX-054, NEX-062 y NEX-077 (funciones de registro de envío y consulta).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documento_electronico_intentos' AND column_name = 'cdc_informado')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fe_gateway_config' AND column_name = 'credenciales_version')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documentos_electronicos' AND column_name = 'consulta_lease_token') THEN
    RAISE EXCEPTION 'NEX-079 requiere NEX-050 (cdc_informado), NEX-061 (credenciales_version) y NEX-077 (consulta_lease_token).';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documento_electronico_intentos' AND column_name = 'conexion') THEN
    RAISE EXCEPTION 'NEX-079 parece aplicada; no se reaplica por suposición.';
  END IF;
END $$;

-- ── 1) Conexión del intento (solo altas: el trigger de NEX-047 sigue impidiendo UPDATE/DELETE) ─────────────────────────────
ALTER TABLE public.documento_electronico_intentos
  ADD COLUMN conexion jsonb CONSTRAINT documento_electronico_intentos_conexion_chk
    CHECK (conexion IS NULL OR (jsonb_typeof(conexion) = 'object' AND octet_length(conexion::text) <= 1024
           AND NOT (conexion ?| ARRAY['password', 'clave', 'token', 'ruc', 'usuario', 'api_usuario', 'api_password'])));
COMMENT ON COLUMN public.documento_electronico_intentos.conexion IS
  'NEX-079 (PRO-342-R01): referencia NO secreta de la conexión del intento {host, credencialRef, credencialesVersion, origenCredenciales}. Nunca usuario, RUC, clave ni token de la API.';

-- Normaliza la referencia recibida: solo las claves permitidas, como texto/número acotado. Cualquier otra clave se descarta.
CREATE OR REPLACE FUNCTION public.fe_intento_conexion_segura(p_conexion jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN p_conexion IS NULL OR jsonb_typeof(p_conexion) <> 'object' THEN NULL ELSE
    nullif(jsonb_strip_nulls(jsonb_build_object(
      'host', left(p_conexion ->> 'host', 255),
      'credencialRef', left(p_conexion ->> 'credencialRef', 40),
      'credencialesVersion', CASE WHEN (p_conexion ->> 'credencialesVersion') ~ '^[0-9]{1,9}$' THEN (p_conexion ->> 'credencialesVersion')::integer END,
      'origenCredenciales', CASE WHEN p_conexion ->> 'origenCredenciales' IN ('BASE', 'ENTORNO') THEN p_conexion ->> 'origenCredenciales' END)), '{}'::jsonb)
  END
$$;

-- ── 2) Núcleo común de registro de consulta (privado: no se concede a nexit_runtime) ──────────────────────────────────────────
-- p_modo: MANUAL (NEX-054: EDITAR; cualquier estado, con guarda de estado final), FLUJO (NEX-062: CREAR o EDITAR, solo FE/NCE pendientes), AUTO (FLUJO + token vigente, NEX-077).
-- Reglas idénticas a las funciones existentes; además, en las tres vías: cdc_informado (44 dígitos tal como lo informó la API, coherente o no) y conexión del intento.
CREATE OR REPLACE FUNCTION public.fe_documento_registrar_consulta_nucleo(
  p_modo text, p_empresa uuid, p_usuario uuid, p_documento uuid, p_resultado text, p_http integer, p_request_id text, p_estado_gateway text, p_estado_sifen text,
  p_cdc text, p_cod_respuesta text, p_mensaje text, p_fecha_firma text, p_fecha_envio text, p_respuesta jsonb, p_token uuid, p_conexion jsonb)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d public.documentos_electronicos%ROWTYPE;
  v_resultado text := p_resultado;
  v_mensaje text := left(nullif(btrim(coalesce(p_mensaje, '')), ''), 500);
  v_cdc_informado text := CASE WHEN p_cdc ~ '^[0-9]{44}$' THEN p_cdc END;
BEGIN
  IF p_modo IS NULL OR p_modo NOT IN ('MANUAL', 'FLUJO', 'AUTO') THEN
    RAISE EXCEPTION 'modo de registro de consulta no válido' USING ERRCODE = 'P0001';
  END IF;
  IF p_modo = 'MANUAL' AND NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'EDITAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.EDITAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_modo <> 'MANUAL' AND NOT (public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CREAR') OR public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'EDITAR')) THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_resultado IS NULL OR p_resultado NOT IN ('OK','NO_ENCONTRADO','ERROR_HTTP','TIMEOUT','RED','RESPUESTA_INVALIDA') THEN
    RAISE EXCEPTION 'resultado de consulta no válido' USING ERRCODE = 'P0001';
  END IF;
  IF p_resultado = 'OK' AND (p_estado_sifen IS NULL OR p_estado_sifen NOT IN ('PENDIENTE','APROBADO','RECHAZADO','CANCELADO','INUTILIZADO','NO_RECONOCIDO')) THEN
    RAISE EXCEPTION 'estado SIFEN no válido para una consulta satisfactoria' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO d FROM public.documentos_electronicos WHERE empresa_id = p_empresa AND id = p_documento FOR UPDATE;
  IF NOT FOUND OR NOT public.sucursal_en_alcance(p_empresa, p_usuario, d.sucursal_id) THEN
    RAISE EXCEPTION 'documento no encontrado' USING ERRCODE = 'P0001', DETAIL = 'NEX:DOCUMENTO_NO_ENCONTRADO';
  END IF;
  -- AUTO: solo el dueño VIGENTE de la reserva registra (fencing NEX-077), con la fila bloqueada.
  IF p_modo = 'AUTO' AND (p_token IS NULL OR d.consulta_lease_token IS DISTINCT FROM p_token) THEN
    RAISE EXCEPTION 'la reserva de la consulta automática ya no pertenece a este proceso' USING ERRCODE = 'P0001', DETAIL = 'NEX:LEASE_OBSOLETO';
  END IF;
  IF p_modo <> 'MANUAL'
     AND (d.tipo NOT IN ('FE', 'NCE') OR d.estado_local NOT IN ('ENVIADO', 'ENVIO_INDETERMINADO') OR d.estado_sifen NOT IN ('SIN_CONSULTA', 'PENDIENTE', 'NO_RECONOCIDO')) THEN
    RAISE EXCEPTION 'el documento no está pendiente de resultado fiscal' USING ERRCODE = 'P0001', DETAIL = 'NEX:DOCUMENTO_NO_PENDIENTE';
  END IF;

  -- El CDC informado no puede contradecir el ya guardado ni la identidad del documento: intento CDC_DIVERGENTE y el documento NO se toca (el CDC registrado nunca se sobrescribe).
  IF p_resultado = 'OK' AND p_cdc IS NOT NULL
     AND ((d.cdc IS NOT NULL AND p_cdc <> d.cdc) OR NOT public.fe_cdc_coherente(d.tipo, d.establecimiento, d.punto_expedicion, d.numero, p_cdc)) THEN
    v_resultado := 'CDC_DIVERGENTE';
  END IF;

  -- NEX-054: un estado final ya registrado no retrocede ni cambia (solo APROBADO → CANCELADO).
  IF v_resultado = 'OK' AND d.estado_sifen IN ('APROBADO','RECHAZADO','CANCELADO','INUTILIZADO')
     AND NOT (p_estado_sifen = d.estado_sifen OR (d.estado_sifen = 'APROBADO' AND p_estado_sifen = 'CANCELADO')) THEN
    v_resultado := 'RESPUESTA_INVALIDA';
    v_mensaje := left('La consulta informa «' || p_estado_sifen || '» pero el documento ya figura como «' || d.estado_sifen || '»: no se modifica el estado fiscal.', 500);
  END IF;

  -- PRO-342-R03-01: un XML firmado SIEMPRE tiene CDC. Un estado DEFINITIVO solo se registra con un CDC válido y coherente (el informado o el ya guardado del mismo documento):
  -- nunca un final con CDC NULL (como NEX-062/077). La aplicación bloquea antes también «XML firmado» sin CDC (y la firma antigua NEX-054, que no tiene esta guarda).
  IF v_resultado = 'OK' AND p_estado_sifen IN ('APROBADO', 'RECHAZADO', 'CANCELADO', 'INUTILIZADO')
     AND (coalesce(p_cdc, d.cdc) IS NULL OR NOT public.fe_cdc_coherente(d.tipo, d.establecimiento, d.punto_expedicion, d.numero, coalesce(p_cdc, d.cdc))) THEN
    v_resultado := 'RESPUESTA_INVALIDA';
    v_mensaje := left('La consulta informa «' || p_estado_sifen || '» sin un CDC válido y coherente con el documento: no se modifica el estado fiscal.', 500);
  END IF;

  INSERT INTO public.documento_electronico_intentos (empresa_id, documento_id, tipo, resultado, http_status, request_id, estado_gateway, estado_sifen, cdc_informado, cod_respuesta, mensaje, respuesta, actor_id, conexion)
  VALUES (p_empresa, p_documento, 'CONSULTA', v_resultado, p_http, left(p_request_id, 80), p_estado_gateway,
          CASE WHEN v_resultado = 'OK' THEN p_estado_sifen END, v_cdc_informado, p_cod_respuesta, v_mensaje, p_respuesta, p_usuario, public.fe_intento_conexion_segura(p_conexion));

  IF v_resultado = 'OK' THEN
    UPDATE public.documentos_electronicos SET
      estado_sifen = p_estado_sifen,
      estado_gateway_texto = left(p_estado_gateway, 120),
      cdc = coalesce(d.cdc, p_cdc),
      cod_respuesta = p_cod_respuesta,
      mensaje_respuesta = v_mensaje,
      fecha_firma_gateway = coalesce(left(p_fecha_firma, 60), d.fecha_firma_gateway),
      fecha_envio_gateway = coalesce(left(p_fecha_envio, 60), d.fecha_envio_gateway),
      estado_local = 'ENVIADO',
      ultima_consulta_at = now(), ultima_consulta_resultado = 'OK', actualizado_at = now()
     WHERE empresa_id = p_empresa AND id = p_documento;
  ELSE
    -- CDC divergente, errores, tiempos de espera y respuestas inválidas: solo se anota la consulta; estado fiscal, CDC y última respuesta fiscal válida NO cambian.
    UPDATE public.documentos_electronicos SET ultima_consulta_at = now(), ultima_consulta_resultado = v_resultado, actualizado_at = now()
     WHERE empresa_id = p_empresa AND id = p_documento;
  END IF;

  RETURN v_resultado;
END $$;

-- ── 3) Sobrecargas públicas (misma firma que las existentes + p_conexion jsonb al final) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fe_documento_registrar_consulta(
  p_empresa uuid, p_usuario uuid, p_documento uuid, p_resultado text, p_http integer, p_request_id text, p_estado_gateway text, p_estado_sifen text,
  p_cdc text, p_cod_respuesta text, p_mensaje text, p_fecha_firma text, p_fecha_envio text, p_respuesta jsonb, p_conexion jsonb)
RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.fe_documento_registrar_consulta_nucleo('MANUAL', p_empresa, p_usuario, p_documento, p_resultado, p_http, p_request_id, p_estado_gateway, p_estado_sifen,
                                                      p_cdc, p_cod_respuesta, p_mensaje, p_fecha_firma, p_fecha_envio, p_respuesta, NULL, p_conexion)
$$;

CREATE OR REPLACE FUNCTION public.fe_documento_registrar_consulta_flujo_nce(
  p_empresa uuid, p_usuario uuid, p_documento uuid, p_resultado text, p_http integer, p_request_id text, p_estado_gateway text, p_estado_sifen text,
  p_cdc text, p_cod_respuesta text, p_mensaje text, p_fecha_firma text, p_fecha_envio text, p_respuesta jsonb, p_conexion jsonb)
RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.fe_documento_registrar_consulta_nucleo('FLUJO', p_empresa, p_usuario, p_documento, p_resultado, p_http, p_request_id, p_estado_gateway, p_estado_sifen,
                                                      p_cdc, p_cod_respuesta, p_mensaje, p_fecha_firma, p_fecha_envio, p_respuesta, NULL, p_conexion)
$$;

CREATE OR REPLACE FUNCTION public.fe_documento_registrar_consulta_auto(
  p_empresa uuid, p_usuario uuid, p_documento uuid, p_resultado text, p_http integer, p_request_id text, p_estado_gateway text, p_estado_sifen text,
  p_cdc text, p_cod_respuesta text, p_mensaje text, p_fecha_firma text, p_fecha_envio text, p_respuesta jsonb, p_token uuid, p_conexion jsonb)
RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.fe_documento_registrar_consulta_nucleo('AUTO', p_empresa, p_usuario, p_documento, p_resultado, p_http, p_request_id, p_estado_gateway, p_estado_sifen,
                                                      p_cdc, p_cod_respuesta, p_mensaje, p_fecha_firma, p_fecha_envio, p_respuesta, p_token, p_conexion)
$$;

-- ── 4) Registro del envío con conexión (reglas de NEX-050 sin cambios + conexión) ─────────────────────────────────────────────
-- El JSON se transmite UNA vez (fe_documento_iniciar_envio + aplicación). Este registro guarda el intento y el lote EXACTO (el documento conserva el primer lote informado: nunca se sobrescribe).
CREATE OR REPLACE FUNCTION public.fe_documento_registrar_envio(
  p_empresa uuid, p_usuario uuid, p_documento uuid, p_fase text, p_resultado text, p_estado_local text, p_error_tipo text, p_http integer, p_request_id text,
  p_estado_gateway text, p_mensaje text, p_lote text, p_cdc text, p_cdc_informado text, p_respuesta jsonb, p_conexion jsonb)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d public.documentos_electronicos%ROWTYPE;
  v_mensaje text := left(nullif(btrim(coalesce(p_mensaje, '')), ''), 500);
  -- El lote llega validado (≤ 60 caracteres, sin caracteres de control) y se guarda TAL CUAL: sin recortar ni sanear su contenido.
  v_lote text := CASE WHEN p_lote IS NOT NULL AND char_length(p_lote) BETWEEN 1 AND 60 AND p_lote !~ '[[:cntrl:]]' AND p_lote !~ '^[[:space:]]|[[:space:]]$' THEN p_lote END;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_fase NOT IN ('AUTENTICACION','TRANSMISION') OR p_resultado NOT IN ('OK','ERROR_HTTP','TIMEOUT','RED','RESPUESTA_INVALIDA')
     OR p_estado_local NOT IN ('ENVIADO','ERROR_ENVIO','ENVIO_INDETERMINADO') OR (p_resultado = 'OK') <> (p_estado_local = 'ENVIADO')
     OR (p_estado_local = 'ERROR_ENVIO') <> (p_error_tipo IS NOT NULL) OR (p_error_tipo IS NOT NULL AND p_error_tipo NOT IN ('AUTENTICACION','RECHAZO','TRANSITORIO')) THEN
    RAISE EXCEPTION 'resultado de envío no válido' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO d FROM public.documentos_electronicos WHERE empresa_id = p_empresa AND id = p_documento FOR UPDATE;
  IF NOT FOUND OR NOT public.sucursal_en_alcance(p_empresa, p_usuario, d.sucursal_id) THEN
    RAISE EXCEPTION 'documento no encontrado' USING ERRCODE = 'P0001', DETAIL = 'NEX:DOCUMENTO_NO_ENCONTRADO';
  END IF;
  IF d.estado_local <> 'ENVIANDO' THEN
    RAISE EXCEPTION 'el documento no está en envío' USING ERRCODE = 'P0001', DETAIL = 'NEX:ENVIO_NO_INICIADO';
  END IF;

  INSERT INTO public.documento_electronico_intentos (empresa_id, documento_id, tipo, fase, resultado, http_status, request_id, estado_gateway, lote, cdc_informado, mensaje, respuesta, actor_id, conexion)
  VALUES (p_empresa, p_documento, 'ENVIO', p_fase, p_resultado, p_http, left(p_request_id, 80), left(p_estado_gateway, 120), CASE WHEN p_estado_local = 'ENVIADO' THEN v_lote END,
          CASE WHEN p_cdc_informado ~ '^[0-9]{44}$' THEN p_cdc_informado END, v_mensaje, p_respuesta, p_usuario, public.fe_intento_conexion_segura(p_conexion));

  UPDATE public.documentos_electronicos SET
    estado_local = p_estado_local,
    envio_error_tipo = CASE WHEN p_estado_local = 'ERROR_ENVIO' THEN p_error_tipo END,
    -- PRO-342-R01: el lote del documento se fija una sola vez (el primero informado); un intento posterior no lo reemplaza.
    -- PRO-342-R03: SOLO con ACK que identifica la recepción de ESTE documento (ENVIADO); un lote de respuesta indeterminada/de otro documento/de error nunca se atribuye al documento.
    lote = CASE WHEN p_estado_local = 'ENVIADO' THEN coalesce(lote, v_lote) ELSE lote END,
    -- Un CDC solo se guarda en el documento si es coherente con su identidad y no hay otro registrado.
    cdc = CASE WHEN cdc IS NULL AND p_cdc IS NOT NULL AND public.fe_cdc_coherente(tipo, establecimiento, punto_expedicion, numero, p_cdc) THEN p_cdc ELSE cdc END,
    mensaje_respuesta = coalesce(v_mensaje, mensaje_respuesta),
    actualizado_at = now()
   WHERE empresa_id = p_empresa AND id = p_documento;

  RETURN p_estado_local;
END $$;

-- ── 5) Privilegios ───────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_facturacion_intentos_conexion() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;
  -- El núcleo y el normalizador no se conceden: solo se ejecutan dentro de las sobrecargas (SECURITY DEFINER).
  REVOKE ALL ON FUNCTION public.fe_intento_conexion_segura(jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_documento_registrar_consulta_nucleo(text, uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb, uuid, jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_documento_registrar_consulta(uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb, jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_documento_registrar_consulta_flujo_nce(uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb, jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_documento_registrar_consulta_auto(uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb, uuid, jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_documento_registrar_envio(uuid, uuid, uuid, text, text, text, text, integer, text, text, text, text, text, text, jsonb, jsonb) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.fe_documento_registrar_consulta(uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb, jsonb) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_documento_registrar_consulta_flujo_nce(uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb, jsonb) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_documento_registrar_consulta_auto(uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb, uuid, jsonb) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_documento_registrar_envio(uuid, uuid, uuid, text, text, text, text, integer, text, text, text, text, text, text, jsonb, jsonb) TO nexit_runtime;
END $$;
REVOKE ALL ON FUNCTION public.nex_aplicar_grants_facturacion_intentos_conexion() FROM PUBLIC;
SELECT public.nex_aplicar_grants_facturacion_intentos_conexion();
