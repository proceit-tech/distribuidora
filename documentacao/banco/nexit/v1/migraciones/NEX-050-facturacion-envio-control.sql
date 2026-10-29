-- =====================================================================
-- NEX-050 — Facturación F-02: control de reenvío tras rechazo, CDC informado como evidencia y datos de identidad para certificar la recepción.
-- Requiere NEX-049. Incremental: NO modifica NEX-047/048/049. NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable
-- (backup previo). Reversión: scripts/reversion-NEX-050.sql. ESTADO: versionada y NO aplicada.
--
--  · documentos_electronicos.envio_error_tipo: causa del ERROR_ENVIO. AUTENTICACION y TRANSITORIO (429) son reenviables sin riesgo; RECHAZO (el gateway
--    devolvió un error de validación) solo se reenvía con confirmación EXPLÍCITA (p_confirma_rechazo), sobre el MISMO documento y número: no se recicla
--    ni se genera otro número en silencio. Los ambiguos (408/409/423/425, duplicados, 5xx, timeout, red, respuesta que no identifica el documento) son
--    ENVIO_INDETERMINADO y siguen bloqueados hasta verificar en el gateway.
--  · documento_electronico_intentos.cdc_informado: el CDC tal como lo informó el gateway (coherente o no) queda como evidencia del intento. En el
--    documento solo se guarda un CDC coherente con su identidad (fe_cdc_coherente), como hasta ahora.
--  · fe_documento_iniciar_envio devuelve además tipo, establecimiento y punto para que el servidor compruebe que la respuesta corresponde a ESTE documento.
-- =====================================================================
DO $$
BEGIN
  IF to_regprocedure('public.fe_documento_iniciar_envio(uuid,uuid,uuid)') IS NULL OR to_regprocedure('public.fe_documento_registrar_envio(uuid,uuid,uuid,text,text,text,integer,text,text,text,text,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'NEX-050 requiere NEX-049 (envío de factura electrónica).';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documentos_electronicos' AND column_name = 'envio_error_tipo') THEN
    RAISE EXCEPTION 'documentos_electronicos.envio_error_tipo ya existe: NEX-050 parece aplicada; no se reaplica por suposición.';
  END IF;
END $$;

ALTER TABLE public.documentos_electronicos
  ADD COLUMN envio_error_tipo text CONSTRAINT documentos_electronicos_envio_error_tipo_chk CHECK (envio_error_tipo IS NULL OR envio_error_tipo IN ('AUTENTICACION','RECHAZO','TRANSITORIO')),
  ADD CONSTRAINT documentos_electronicos_envio_error_coherente_chk CHECK (envio_error_tipo IS NULL OR estado_local = 'ERROR_ENVIO');

ALTER TABLE public.documento_electronico_intentos
  ADD COLUMN cdc_informado text CONSTRAINT documento_electronico_intentos_cdc_informado_chk CHECK (cdc_informado IS NULL OR cdc_informado ~ '^[0-9]{44}$');

-- Las funciones cambian de firma: se reemplazan (el rol de la aplicación pierde las anteriores y recibe las nuevas por el wrapper de grants).
DROP FUNCTION public.fe_documento_iniciar_envio(uuid, uuid, uuid);
DROP FUNCTION public.fe_documento_registrar_envio(uuid, uuid, uuid, text, text, text, integer, text, text, text, text, text, jsonb);

CREATE FUNCTION public.fe_documento_iniciar_envio(p_empresa uuid, p_usuario uuid, p_documento uuid, p_confirma_rechazo boolean DEFAULT false)
RETURNS TABLE (o_resultado text, o_payload jsonb, o_numero text, o_tipo text, o_establecimiento text, o_punto text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d public.documentos_electronicos%ROWTYPE;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO d FROM public.documentos_electronicos WHERE empresa_id = p_empresa AND id = p_documento FOR UPDATE;
  IF NOT FOUND OR NOT public.sucursal_en_alcance(p_empresa, p_usuario, d.sucursal_id) THEN
    RAISE EXCEPTION 'documento no encontrado' USING ERRCODE = 'P0001', DETAIL = 'NEX:DOCUMENTO_NO_ENCONTRADO';
  END IF;
  IF d.tipo <> 'FE' THEN
    RAISE EXCEPTION 'solo se envían facturas electrónicas en esta etapa' USING ERRCODE = 'P0001', DETAIL = 'NEX:TIPO_NO_ENVIABLE';
  END IF;
  IF d.estado_local = 'ENVIADO' THEN
    RAISE EXCEPTION 'el documento ya fue enviado al gateway' USING ERRCODE = 'P0001', DETAIL = 'NEX:YA_ENVIADO';
  END IF;
  IF d.estado_local = 'ENVIO_INDETERMINADO' THEN
    RAISE EXCEPTION 'el resultado del envío anterior es indeterminado: verifique el documento en el gateway antes de reenviar' USING ERRCODE = 'P0001', DETAIL = 'NEX:ENVIO_INDETERMINADO';
  END IF;
  IF d.estado_local = 'ENVIANDO' THEN
    IF d.envio_iniciado_at > now() - interval '2 minutes' THEN
      RAISE EXCEPTION 'el documento se está enviando en este momento' USING ERRCODE = 'P0001', DETAIL = 'NEX:ENVIO_EN_CURSO';
    END IF;
    -- Un envío iniciado hace más de 2 minutos que nunca se cerró (caída del proceso): ya pudo haber llegado al gateway. Se devuelve (no se lanza una
    -- excepción) para que el cambio de estado se confirme.
    UPDATE public.documentos_electronicos SET estado_local = 'ENVIO_INDETERMINADO', envio_error_tipo = NULL, actualizado_at = now() WHERE empresa_id = p_empresa AND id = p_documento;
    RETURN QUERY SELECT 'INDETERMINADO'::text, NULL::jsonb, d.numero, d.tipo, d.establecimiento, d.punto_expedicion;
    RETURN;
  END IF;
  -- Rechazo por validación del gateway: el mismo contenido solo se reenvía con confirmación explícita (mismo documento y número).
  IF d.estado_local = 'ERROR_ENVIO' AND d.envio_error_tipo = 'RECHAZO' AND NOT coalesce(p_confirma_rechazo, false) THEN
    RAISE EXCEPTION 'el gateway rechazó este documento: el reenvío del mismo contenido requiere confirmación explícita' USING ERRCODE = 'P0001', DETAIL = 'NEX:REENVIO_REQUIERE_CONFIRMACION';
  END IF;

  UPDATE public.documentos_electronicos SET estado_local = 'ENVIANDO', envio_error_tipo = NULL, envio_iniciado_at = now(), actualizado_at = now() WHERE empresa_id = p_empresa AND id = p_documento;

  RETURN QUERY SELECT 'INICIADO'::text, s.payload, d.numero, d.tipo, d.establecimiento, d.punto_expedicion FROM public.documento_electronico_solicitudes s
                WHERE s.empresa_id = p_empresa AND s.documento_id = p_documento ORDER BY s.version DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'el documento no tiene solicitud de emisión' USING ERRCODE = 'P0001', DETAIL = 'NEX:SIN_SOLICITUD';
  END IF;
END $$;

CREATE FUNCTION public.fe_documento_registrar_envio(
  p_empresa uuid, p_usuario uuid, p_documento uuid, p_fase text, p_resultado text, p_estado_local text, p_error_tipo text, p_http integer, p_request_id text,
  p_estado_gateway text, p_mensaje text, p_lote text, p_cdc text, p_cdc_informado text, p_respuesta jsonb)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d public.documentos_electronicos%ROWTYPE;
  v_mensaje text := left(nullif(btrim(coalesce(p_mensaje, '')), ''), 500);
  v_lote text := left(nullif(btrim(coalesce(p_lote, '')), ''), 60);
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

  INSERT INTO public.documento_electronico_intentos (empresa_id, documento_id, tipo, fase, resultado, http_status, request_id, estado_gateway, lote, cdc_informado, mensaje, respuesta, actor_id)
  VALUES (p_empresa, p_documento, 'ENVIO', p_fase, p_resultado, p_http, left(p_request_id, 80), left(p_estado_gateway, 120), v_lote, p_cdc_informado, v_mensaje, p_respuesta, p_usuario);

  UPDATE public.documentos_electronicos SET
    estado_local = p_estado_local,
    envio_error_tipo = CASE WHEN p_estado_local = 'ERROR_ENVIO' THEN p_error_tipo END,
    lote = coalesce(v_lote, lote),
    -- Un CDC solo se guarda en el documento si es coherente con su identidad y no hay otro registrado.
    cdc = CASE WHEN cdc IS NULL AND p_cdc IS NOT NULL AND public.fe_cdc_coherente(tipo, establecimiento, punto_expedicion, numero, p_cdc) THEN p_cdc ELSE cdc END,
    mensaje_respuesta = coalesce(v_mensaje, mensaje_respuesta),
    actualizado_at = now()
   WHERE empresa_id = p_empresa AND id = p_documento;

  RETURN p_estado_local;
END $$;

CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_facturacion_envio() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;

  REVOKE ALL ON FUNCTION public.fe_documento_iniciar_envio(uuid, uuid, uuid, boolean) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_documento_registrar_envio(uuid, uuid, uuid, text, text, text, text, integer, text, text, text, text, text, text, jsonb) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.fe_documento_iniciar_envio(uuid, uuid, uuid, boolean) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_documento_registrar_envio(uuid, uuid, uuid, text, text, text, text, integer, text, text, text, text, text, text, jsonb) TO nexit_runtime;
END $$;

SELECT public.nex_aplicar_grants_facturacion_envio();
