-- REVERSIÓN manual de NEX-054 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con copia de seguridad previa:
--   psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-054.sql
-- Restaura el cuerpo ORIGINAL de fe_documento_registrar_consulta (NEX-047, sin la guarda de estado final). No toca datos ni privilegios. Después hay que borrar la fila 'NEX-054'
-- de schema_migrations. Efecto: vuelve a ser posible que una consulta contradictoria sobrescriba un estado final (el defecto FAT-E2-R01-02).
DO $$
BEGIN
  IF to_regprocedure('public.fe_documento_registrar_consulta(uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,text,jsonb)') IS NULL
     OR position('NEX-054' IN pg_get_functiondef('public.fe_documento_registrar_consulta(uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,text,jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'NEX-054 no está aplicada (la función no contiene la guarda de estado final).';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fe_documento_registrar_consulta(
  p_empresa uuid, p_usuario uuid, p_documento uuid, p_resultado text, p_http integer, p_request_id text, p_estado_gateway text, p_estado_sifen text,
  p_cdc text, p_cod_respuesta text, p_mensaje text, p_fecha_firma text, p_fecha_envio text, p_respuesta jsonb)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d public.documentos_electronicos%ROWTYPE;
  v_resultado text := p_resultado;
  v_mensaje text := left(nullif(btrim(coalesce(p_mensaje, '')), ''), 500);
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'EDITAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.EDITAR en esta empresa' USING ERRCODE = '42501';
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

  -- El CDC informado no puede contradecir el ya guardado ni la identidad del documento (tipo, establecimiento, punto, número): se registra el intento
  -- como divergente y NO se toca el documento.
  IF p_resultado = 'OK' AND p_cdc IS NOT NULL
     AND ((d.cdc IS NOT NULL AND p_cdc <> d.cdc) OR NOT public.fe_cdc_coherente(d.tipo, d.establecimiento, d.punto_expedicion, d.numero, p_cdc)) THEN
    v_resultado := 'CDC_DIVERGENTE';
  END IF;

  INSERT INTO public.documento_electronico_intentos (empresa_id, documento_id, tipo, resultado, http_status, request_id, estado_gateway, estado_sifen, cod_respuesta, mensaje, respuesta, actor_id)
  VALUES (p_empresa, p_documento, 'CONSULTA', v_resultado, p_http, left(p_request_id, 80), p_estado_gateway,
          CASE WHEN v_resultado = 'OK' THEN p_estado_sifen END, p_cod_respuesta, v_mensaje, p_respuesta, p_usuario);

  IF v_resultado = 'OK' THEN
    UPDATE public.documentos_electronicos SET
      estado_sifen = p_estado_sifen,
      estado_gateway_texto = left(p_estado_gateway, 120),
      cdc = coalesce(d.cdc, p_cdc),
      cod_respuesta = p_cod_respuesta,
      mensaje_respuesta = v_mensaje,
      fecha_firma_gateway = coalesce(left(p_fecha_firma, 60), d.fecha_firma_gateway),
      fecha_envio_gateway = coalesce(left(p_fecha_envio, 60), d.fecha_envio_gateway),
      -- Que el gateway conozca el documento reconcilia un envío dudoso o fallido: ya fue recibido.
      estado_local = 'ENVIADO',
      ultima_consulta_at = now(), ultima_consulta_resultado = 'OK', actualizado_at = now()
     WHERE empresa_id = p_empresa AND id = p_documento;
  ELSE
    -- NO_ENCONTRADO, errores y tiempos de espera: solo se anota la consulta; el estado fiscal NO cambia (no se finge un rechazo).
    UPDATE public.documentos_electronicos SET ultima_consulta_at = now(), ultima_consulta_resultado = v_resultado, actualizado_at = now()
     WHERE empresa_id = p_empresa AND id = p_documento;
  END IF;

  RETURN v_resultado;
END $$;
