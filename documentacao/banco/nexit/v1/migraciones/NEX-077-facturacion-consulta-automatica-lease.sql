-- =====================================================================
-- NEX-077 — Facturación PRO-338-R02 (AUD-R01 F001 / F003): propiedad verificable del LEASE de la consulta automática y CDC informado en cada consulta automática.
-- Orden: documentacao/ordens/ORD-CLAUDE-NEXIT-PRO-338-R02-CORRECCIONES-AUDITORIA-2026-10-29.md · Auditoría: documentacao/testes/AUD-NEXIT-PRO-338-CONSULTA-AUTOMATICA-R01-2026-10-29.md
-- Requiere NEX-050 (documento_electronico_intentos.cdc_informado) y NEX-062 (columnas de lease y funciones de consulta automática). Incremental: NO edita NEX-062 ni NEX-054; las funciones
-- NEX-062 fe_consulta_reservar / fe_consulta_programar / fe_documento_registrar_consulta_flujo_nce quedan intactas (la reconciliación NCE y la consulta manual las siguen usando).
-- ESTADO: versionada y NO aplicada. NO ejecutar sin autorización expresa del responsable (backup previo). Reversión: scripts/reversion-NEX-077.sql.
--
-- Problema (F001): fe_consulta_reservar entrega un LOTE con un lease común y fe_consulta_programar libera/reprograma SIN comprobar quién es el dueño de la reserva. Un documento del final del lote
-- podía consultarse con el lease ya vencido (otra instancia lo reserva en paralelo) y un worker atrasado podía liberar o reprogramar el lease de otro.
-- Solución: cada reserva lleva un TOKEN (fencing) nuevo. Programar y registrar la consulta exigen ese token con la fila bloqueada: un worker cuyo token fue reemplazado (lease vencido y
-- tomado por otro) no reprograma, no libera y no registra nada. La aplicación reserva UN documento por vez justo antes de consultarlo, con un lease mayor que el peor caso de las llamadas al gateway.
-- Problema (F003): fe_documento_registrar_consulta_flujo_nce no guarda cdc_informado en el intento. La función de registro automático lo guarda (CDC de 44 dígitos tal como lo informó el gateway,
-- coherente o no), además del JSON de respuesta saneado que ya se guardaba.
-- =====================================================================
DO $$
BEGIN
  IF to_regprocedure('public.fe_consulta_reservar(integer,integer,text[])') IS NULL
     OR to_regprocedure('public.fe_documento_registrar_consulta_flujo_nce(uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'NEX-077 requiere NEX-062 (consulta automática).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documento_electronico_intentos' AND column_name = 'cdc_informado') THEN
    RAISE EXCEPTION 'NEX-077 requiere NEX-050 (documento_electronico_intentos.cdc_informado).';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documentos_electronicos' AND column_name = 'consulta_lease_token') THEN
    RAISE EXCEPTION 'NEX-077 parece aplicada; no se reaplica por suposición.';
  END IF;
END $$;

ALTER TABLE public.documentos_electronicos ADD COLUMN consulta_lease_token uuid;
COMMENT ON COLUMN public.documentos_electronicos.consulta_lease_token IS 'NEX-077: dueño de la reserva vigente de la consulta automática (fencing). NULL = sin reserva.';

-- ── 1) Reserva con token ────────────────────────────────────────────────────────────────────────────────────────────
-- Mismos criterios de elegibilidad, orden, SKIP LOCKED y elección del actor que fe_consulta_reservar (NEX-062); cada fila recibe un token NUEVO que reemplaza a cualquier token vencido.
CREATE OR REPLACE FUNCTION public.fe_consulta_reservar_token(p_limite integer, p_lease_segundos integer, p_tipos text[])
RETURNS TABLE (o_empresa uuid, o_documento uuid, o_actor uuid, o_tipo text, o_intentos integer, o_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 100 OR p_lease_segundos IS NULL OR p_lease_segundos NOT BETWEEN 10 AND 3600 THEN
    RAISE EXCEPTION 'parámetros de reserva no válidos' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY
  WITH elegidos AS (
    SELECT d.empresa_id, d.id, d.tipo, d.sucursal_id, d.creado_por, d.consultas_auto
      FROM public.documentos_electronicos d
     WHERE d.estado_local IN ('ENVIADO', 'ENVIO_INDETERMINADO') AND d.estado_sifen IN ('SIN_CONSULTA', 'PENDIENTE', 'NO_RECONOCIDO')
       AND d.tipo = ANY (p_tipos) AND coalesce(d.proxima_consulta_at, '-infinity') <= now() AND coalesce(d.consulta_lease_hasta, '-infinity') < now()
     ORDER BY coalesce(d.proxima_consulta_at, d.creado_at), d.id
     LIMIT p_limite FOR UPDATE SKIP LOCKED),
  marcados AS (
    UPDATE public.documentos_electronicos d SET consulta_lease_hasta = now() + make_interval(secs => p_lease_segundos), consulta_lease_token = gen_random_uuid()
      FROM elegidos e WHERE d.empresa_id = e.empresa_id AND d.id = e.id RETURNING d.empresa_id, d.id, d.consulta_lease_token)
  SELECT e.empresa_id, e.id,
         coalesce(
           (SELECT u.id FROM public.usuarios u WHERE u.empresa_id = e.empresa_id AND u.id = e.creado_por AND u.estado = 'ACTIVO'
               AND (public.usuario_tiene_permiso(e.empresa_id, u.id, 'FACTURACION_ELECTRONICA', 'CREAR') OR public.usuario_tiene_permiso(e.empresa_id, u.id, 'FACTURACION_ELECTRONICA', 'EDITAR'))
               AND public.sucursal_en_alcance(e.empresa_id, u.id, e.sucursal_id)),
           (SELECT u.id FROM public.usuarios u WHERE u.empresa_id = e.empresa_id AND u.estado = 'ACTIVO'
               AND (public.usuario_tiene_permiso(e.empresa_id, u.id, 'FACTURACION_ELECTRONICA', 'CREAR') OR public.usuario_tiene_permiso(e.empresa_id, u.id, 'FACTURACION_ELECTRONICA', 'EDITAR'))
               AND public.sucursal_en_alcance(e.empresa_id, u.id, e.sucursal_id) ORDER BY u.creado_at, u.id LIMIT 1)),
         e.tipo, e.consultas_auto, m.consulta_lease_token
    FROM elegidos e JOIN marcados m ON m.empresa_id = e.empresa_id AND m.id = e.id;
END $$;

-- ── 2) Programar SOLO con el token vigente ─────────────────────────────────────────────────────────────────────────────
-- Devuelve false (sin tocar nada) si la reserva ya no es de quien llama: otro worker la tomó tras vencer el lease, o ya fue programada.
CREATE OR REPLACE FUNCTION public.fe_consulta_programar_token(p_empresa uuid, p_documento uuid, p_proxima timestamptz, p_incrementa boolean, p_token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_token IS NULL THEN
    RETURN false;
  END IF;
  UPDATE public.documentos_electronicos SET proxima_consulta_at = p_proxima, consulta_lease_hasta = NULL, consulta_lease_token = NULL,
         consultas_auto = consultas_auto + CASE WHEN coalesce(p_incrementa, false) THEN 1 ELSE 0 END
   WHERE empresa_id = p_empresa AND id = p_documento AND consulta_lease_token = p_token;
  RETURN FOUND;
END $$;

-- ── 3) Registro de la consulta automática: token vigente + cdc_informado ─────────────────────────────────────────────────
-- Mismas reglas que fe_documento_registrar_consulta_flujo_nce (NEX-062: CREAR o EDITAR, alcance, solo FE/NCE pendientes, CDC divergente, estado final solo con CDC coherente) y, además:
--   · exige que el documento siga reservado con p_token (fila bloqueada FOR UPDATE): un worker obsoleto no registra (NEX:LEASE_OBSOLETO) y la evidencia la obtiene el dueño vigente;
--   · guarda en el intento el CDC que informó el gateway (cdc_informado, 44 dígitos), coherente o no, como evidencia del diagnóstico.
CREATE OR REPLACE FUNCTION public.fe_documento_registrar_consulta_auto(
  p_empresa uuid, p_usuario uuid, p_documento uuid, p_resultado text, p_http integer, p_request_id text, p_estado_gateway text, p_estado_sifen text,
  p_cdc text, p_cod_respuesta text, p_mensaje text, p_fecha_firma text, p_fecha_envio text, p_respuesta jsonb, p_token uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d public.documentos_electronicos%ROWTYPE;
  v_resultado text := p_resultado;
  v_mensaje text := left(nullif(btrim(coalesce(p_mensaje, '')), ''), 500);
  v_cdc_informado text := CASE WHEN p_cdc ~ '^[0-9]{44}$' THEN p_cdc END;
BEGIN
  IF NOT (public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CREAR') OR public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'EDITAR')) THEN
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
  -- Fencing: solo el dueño VIGENTE de la reserva registra. Se evalúa con la fila bloqueada (una nueva reserva concurrente espera o ya se ve).
  IF p_token IS NULL OR d.consulta_lease_token IS DISTINCT FROM p_token THEN
    RAISE EXCEPTION 'la reserva de la consulta automática ya no pertenece a este proceso' USING ERRCODE = 'P0001', DETAIL = 'NEX:LEASE_OBSOLETO';
  END IF;
  IF d.tipo NOT IN ('FE', 'NCE') OR d.estado_local NOT IN ('ENVIADO', 'ENVIO_INDETERMINADO') OR d.estado_sifen NOT IN ('SIN_CONSULTA', 'PENDIENTE', 'NO_RECONOCIDO') THEN
    RAISE EXCEPTION 'el documento no está pendiente de resultado fiscal' USING ERRCODE = 'P0001', DETAIL = 'NEX:DOCUMENTO_NO_PENDIENTE';
  END IF;

  IF p_resultado = 'OK' AND p_cdc IS NOT NULL
     AND ((d.cdc IS NOT NULL AND p_cdc <> d.cdc) OR NOT public.fe_cdc_coherente(d.tipo, d.establecimiento, d.punto_expedicion, d.numero, p_cdc)) THEN
    v_resultado := 'CDC_DIVERGENTE';
  END IF;

  IF v_resultado = 'OK' AND p_estado_sifen IN ('APROBADO', 'RECHAZADO', 'CANCELADO', 'INUTILIZADO')
     AND (coalesce(p_cdc, d.cdc) IS NULL OR NOT public.fe_cdc_coherente(d.tipo, d.establecimiento, d.punto_expedicion, d.numero, coalesce(p_cdc, d.cdc))) THEN
    v_resultado := 'RESPUESTA_INVALIDA';
    v_mensaje := left('La consulta informa «' || p_estado_sifen || '» sin un CDC válido y coherente con el documento: no se modifica el estado fiscal.', 500);
  END IF;

  INSERT INTO public.documento_electronico_intentos (empresa_id, documento_id, tipo, resultado, http_status, request_id, estado_gateway, estado_sifen, cdc_informado, cod_respuesta, mensaje, respuesta, actor_id)
  VALUES (p_empresa, p_documento, 'CONSULTA', v_resultado, p_http, left(p_request_id, 80), p_estado_gateway,
          CASE WHEN v_resultado = 'OK' THEN p_estado_sifen END, v_cdc_informado, p_cod_respuesta, v_mensaje, p_respuesta, p_usuario);

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
    -- CDC divergente, errores y tiempos de espera: solo se anota la consulta; el estado fiscal y la última respuesta fiscal válida NO cambian.
    UPDATE public.documentos_electronicos SET ultima_consulta_at = now(), ultima_consulta_resultado = v_resultado, actualizado_at = now()
     WHERE empresa_id = p_empresa AND id = p_documento;
  END IF;

  RETURN v_resultado;
END $$;

-- ── 4) Privilegios ───────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_facturacion_consulta_lease() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;
  REVOKE ALL ON FUNCTION public.fe_consulta_reservar_token(integer, integer, text[]) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_consulta_programar_token(uuid, uuid, timestamptz, boolean, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_documento_registrar_consulta_auto(uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb, uuid) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.fe_consulta_reservar_token(integer, integer, text[]) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_consulta_programar_token(uuid, uuid, timestamptz, boolean, uuid) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_documento_registrar_consulta_auto(uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb, uuid) TO nexit_runtime;
END $$;
REVOKE ALL ON FUNCTION public.nex_aplicar_grants_facturacion_consulta_lease() FROM PUBLIC;
SELECT public.nex_aplicar_grants_facturacion_consulta_lease();
