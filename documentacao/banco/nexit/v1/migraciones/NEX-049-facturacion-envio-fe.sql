-- =====================================================================
-- NEX-049 — Facturación F-02: envío de la Factura Electrónica al gateway (exclusión mutua del envío, registro de cada intento de envío con su fase, lote
-- informado). Requiere NEX-048 (y, por ella, NEX-047 y NEX-046). Incremental: NO modifica NEX-047 ni NEX-048.
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo). Reversión: scripts/reversion-NEX-049.sql.
-- ESTADO: versionada y NO aplicada.
--
--  · estado_local pasa a admitir ENVIANDO (envío en curso). fe_documento_iniciar_envio() lo marca bajo bloqueo de la fila y devuelve el payload inmutable
--    de la solicitud: dos clics, dos pestañas o un reintento NO pueden transmitir el mismo documento a la vez. Un ENVIANDO que nunca se cerró (caída del
--    proceso) pasa a ENVIO_INDETERMINADO: nunca se reenvía a ciegas; hay que reconciliar con la consulta del gateway antes.
--  · fe_documento_registrar_envio() cierra el envío: guarda el intento (tipo ENVIO, fase y resultado), el estado local resultante que decide el servidor
--    (ENVIADO / ERROR_ENVIO / ENVIO_INDETERMINADO) y, solo si el gateway los informó, lote y CDC coherente. NO toca estado_sifen: la aprobación fiscal
--    solo se establece con la consulta de estado; un HTTP 200 de recepción no es aprobación.
--  · Sin envío real desde SQL, sin credenciales, sin movimiento de stock.
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.documento_electronico_solicitudes') IS NULL OR to_regprocedure('public.fe_documento_crear_fe(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb)') IS NULL
     OR to_regprocedure('public.nex_aplicar_grants_facturacion_emision()') IS NULL THEN
    RAISE EXCEPTION 'NEX-049 requiere NEX-048 (emisión de factura electrónica).';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documentos_electronicos' AND column_name = 'envio_iniciado_at') THEN
    RAISE EXCEPTION 'documentos_electronicos.envio_iniciado_at ya existe: NEX-049 parece aplicada; no se reaplica por suposición.';
  END IF;
END $$;

ALTER TABLE public.documentos_electronicos
  ADD COLUMN envio_iniciado_at timestamptz,
  ADD COLUMN lote text CONSTRAINT documentos_electronicos_lote_chk CHECK (lote IS NULL OR char_length(lote) BETWEEN 1 AND 60);

ALTER TABLE public.documentos_electronicos DROP CONSTRAINT documentos_electronicos_estado_local_check;
ALTER TABLE public.documentos_electronicos
  ADD CONSTRAINT documentos_electronicos_estado_local_check CHECK (estado_local IN ('PENDIENTE_ENVIO','ENVIANDO','ENVIO_INDETERMINADO','ENVIADO','ERROR_ENVIO'));

ALTER TABLE public.documento_electronico_intentos
  ADD COLUMN fase text CONSTRAINT documento_electronico_intentos_fase_chk CHECK (fase IS NULL OR fase IN ('AUTENTICACION','TRANSMISION','CONSULTA')),
  ADD COLUMN lote text CONSTRAINT documento_electronico_intentos_lote_chk CHECK (lote IS NULL OR char_length(lote) BETWEEN 1 AND 60);

-- fe_documentos_inmutable (NEX-047) ya permite modificar estados, lote y envio_iniciado_at, y fija el CDC una sola vez.

-- Inicia el envío: bajo bloqueo, solo desde PENDIENTE_ENVIO o ERROR_ENVIO. Devuelve el payload inmutable que se transmitirá.
CREATE OR REPLACE FUNCTION public.fe_documento_iniciar_envio(p_empresa uuid, p_usuario uuid, p_documento uuid)
RETURNS TABLE (o_resultado text, o_payload jsonb, o_numero text)
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
    RAISE EXCEPTION 'el resultado del envío anterior es indeterminado: reconcilie con la consulta de estado antes de reenviar' USING ERRCODE = 'P0001', DETAIL = 'NEX:ENVIO_INDETERMINADO';
  END IF;
  IF d.estado_local = 'ENVIANDO' THEN
    IF d.envio_iniciado_at > now() - interval '2 minutes' THEN
      RAISE EXCEPTION 'el documento se está enviando en este momento' USING ERRCODE = 'P0001', DETAIL = 'NEX:ENVIO_EN_CURSO';
    END IF;
    -- Un envío iniciado hace más de 2 minutos que nunca se cerró (caída del proceso): ya pudo haber llegado al gateway. Se devuelve (no se lanza una
    -- excepción) para que el cambio de estado se confirme.
    UPDATE public.documentos_electronicos SET estado_local = 'ENVIO_INDETERMINADO', actualizado_at = now() WHERE empresa_id = p_empresa AND id = p_documento;
    RETURN QUERY SELECT 'INDETERMINADO'::text, NULL::jsonb, d.numero;
    RETURN;
  END IF;

  UPDATE public.documentos_electronicos SET estado_local = 'ENVIANDO', envio_iniciado_at = now(), actualizado_at = now() WHERE empresa_id = p_empresa AND id = p_documento;

  RETURN QUERY SELECT 'INICIADO'::text, s.payload, d.numero FROM public.documento_electronico_solicitudes s
                WHERE s.empresa_id = p_empresa AND s.documento_id = p_documento ORDER BY s.version DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'el documento no tiene solicitud de emisión' USING ERRCODE = 'P0001', DETAIL = 'NEX:SIN_SOLICITUD';
  END IF;
END $$;

-- Cierra el envío. p_estado_local lo decide el servidor según el resultado; aquí solo se admiten los tres valores de cierre. No toca estado_sifen.
CREATE OR REPLACE FUNCTION public.fe_documento_registrar_envio(
  p_empresa uuid, p_usuario uuid, p_documento uuid, p_fase text, p_resultado text, p_estado_local text, p_http integer, p_request_id text,
  p_estado_gateway text, p_mensaje text, p_lote text, p_cdc text, p_respuesta jsonb)
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
     OR p_estado_local NOT IN ('ENVIADO','ERROR_ENVIO','ENVIO_INDETERMINADO') OR (p_resultado = 'OK') <> (p_estado_local = 'ENVIADO') THEN
    RAISE EXCEPTION 'resultado de envío no válido' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO d FROM public.documentos_electronicos WHERE empresa_id = p_empresa AND id = p_documento FOR UPDATE;
  IF NOT FOUND OR NOT public.sucursal_en_alcance(p_empresa, p_usuario, d.sucursal_id) THEN
    RAISE EXCEPTION 'documento no encontrado' USING ERRCODE = 'P0001', DETAIL = 'NEX:DOCUMENTO_NO_ENCONTRADO';
  END IF;
  IF d.estado_local <> 'ENVIANDO' THEN
    RAISE EXCEPTION 'el documento no está en envío' USING ERRCODE = 'P0001', DETAIL = 'NEX:ENVIO_NO_INICIADO';
  END IF;

  INSERT INTO public.documento_electronico_intentos (empresa_id, documento_id, tipo, fase, resultado, http_status, request_id, estado_gateway, lote, mensaje, respuesta, actor_id)
  VALUES (p_empresa, p_documento, 'ENVIO', p_fase, p_resultado, p_http, left(p_request_id, 80), left(p_estado_gateway, 120), v_lote, v_mensaje, p_respuesta, p_usuario);

  UPDATE public.documentos_electronicos SET
    estado_local = p_estado_local,
    lote = coalesce(v_lote, lote),
    -- Un CDC informado solo se guarda si es coherente con la identidad del documento y no hay otro registrado.
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

  REVOKE ALL ON FUNCTION public.fe_documento_iniciar_envio(uuid, uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_documento_registrar_envio(uuid, uuid, uuid, text, text, text, integer, text, text, text, text, text, jsonb) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.fe_documento_iniciar_envio(uuid, uuid, uuid) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_documento_registrar_envio(uuid, uuid, uuid, text, text, text, integer, text, text, text, text, text, jsonb) TO nexit_runtime;
END $$;

CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_runtime() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.nex_aplicar_grants_runtime_base();
  PERFORM public.nex_aplicar_grants_proveedores();
  PERFORM public.nex_aplicar_grants_fiscal();
  PERFORM public.nex_aplicar_grants_productos();
  PERFORM public.nex_aplicar_grants_comercial();
  PERFORM public.nex_aplicar_grants_depositos();
  PERFORM public.nex_aplicar_grants_facturacion();
  PERFORM public.nex_aplicar_grants_facturacion_emision();
  PERFORM public.nex_aplicar_grants_facturacion_envio();
END $$;

SELECT public.nex_aplicar_grants_facturacion_envio();
