-- REVERSIÓN manual de NEX-062 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con copia de seguridad previa:
--   psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-062.sql
-- Restaura fe_documento_iniciar_envio de NEX-050 (solo FE), elimina las funciones y tablas de la NCE V1 y las columnas de consulta automática, y devuelve la restricción de acciones de la bitácora
-- de puntos. ABORTA (sin cambiar nada) si ya existe alguna NCE o alguna relación nce_origen: eliminarlas borraría evidencia fiscal. No toca FE, secuencias ni ninguna migration anterior.
-- Después hay que borrar la fila 'NEX-062' de schema_migrations.
DO $$
BEGIN
  IF to_regclass('public.nce_origen') IS NULL THEN
    RAISE EXCEPTION 'NEX-062 no está aplicada (nce_origen no existe).';
  END IF;
  IF EXISTS (SELECT 1 FROM public.documentos_electronicos WHERE tipo = 'NCE') OR EXISTS (SELECT 1 FROM public.nce_origen) THEN
    RAISE EXCEPTION 'REVERSIÓN ABORTADA: existen notas de crédito electrónicas; revertir borraría evidencia fiscal.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fe_puntos_expedicion_log WHERE accion = 'SECUENCIA') THEN
    RAISE EXCEPTION 'REVERSIÓN ABORTADA: la bitácora de puntos tiene acciones SECUENCIA (se perdería la trazabilidad de la secuencia NCE).';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fe_documento_iniciar_envio(p_empresa uuid, p_usuario uuid, p_documento uuid, p_confirma_rechazo boolean DEFAULT false)
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

DROP FUNCTION public.fe_documento_crear_nce(uuid, uuid, uuid, uuid, text, uuid, integer, jsonb, text, numeric, jsonb);
DROP FUNCTION public.fe_consulta_reservar(integer, integer, text[]);
DROP FUNCTION public.fe_consulta_programar(uuid, uuid, timestamptz, boolean);
DROP FUNCTION public.fe_documento_registrar_consulta_flujo_nce(uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb);
DROP FUNCTION public.fe_punto_secuencia_configurar(uuid, uuid, uuid, text, integer, boolean);
DROP FUNCTION public.nex_aplicar_grants_facturacion_nce();
DROP INDEX public.documentos_electronicos_consulta_auto_idx;
ALTER TABLE public.documentos_electronicos DROP COLUMN proxima_consulta_at, DROP COLUMN consulta_lease_hasta, DROP COLUMN consultas_auto;
DROP TABLE public.nce_lineas;
DROP TABLE public.nce_origen;
DROP FUNCTION public.nce_origen_valida();
DROP FUNCTION public.nce_solo_altas();
DROP FUNCTION public.fe_nce_clasificar(text, text, text);
ALTER TABLE public.fe_puntos_expedicion_log DROP CONSTRAINT IF EXISTS fe_puntos_expedicion_log_accion_check;
ALTER TABLE public.fe_puntos_expedicion_log ADD CONSTRAINT fe_puntos_expedicion_log_accion_check CHECK (accion IN ('CREAR', 'ACTIVAR', 'DESACTIVAR'));

SELECT public.nex_aplicar_grants_facturacion_envio();
