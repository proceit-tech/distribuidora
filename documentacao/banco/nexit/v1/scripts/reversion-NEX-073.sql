-- REVERSIÓN de NEX-073 (fecha de emisión elegida). UNA transacción. Restaura fe_documento_crear_fe a la definición de NEX-065 (copia literal) y elimina el marcador.
-- ANTES: desplegar la aplicación anterior (la actual envía dFecEmiSol cuando la fecha difiere de hoy y NEX-065 lo dejaría en el snapshot). Los documentos ya creados con otra fecha conservan su fecha (no se tocan).
-- DESPUÉS: borrar la fila NEX-073 de schema_migrations.
BEGIN;

CREATE OR REPLACE FUNCTION public.fe_documento_crear_fe(
  p_empresa uuid, p_usuario uuid, p_sucursal uuid, p_punto uuid, p_clave text, p_cliente uuid, p_receptor_documento text, p_receptor_nombre text,
  p_moneda text, p_total numeric, p_payload jsonb)
RETURNS TABLE (o_documento_id uuid, o_numero text, o_reutilizado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_entrada text := encode(sha256(convert_to(p_payload::text, 'UTF8')), 'hex');
  v_est text;
  v_punto public.fe_puntos_expedicion%ROWTYPE;
  v_serie text;
  v_num integer;
  v_numero text;
  v_id uuid;
  v_payload jsonb;
  v_previo public.documentos_electronicos%ROWTYPE;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_clave IS NULL OR char_length(p_clave) NOT BETWEEN 8 AND 120 THEN
    RAISE EXCEPTION 'la clave de idempotencia es obligatoria (8 a 120 caracteres)' USING ERRCODE = 'P0001';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR p_payload ? 'cdc' OR p_payload ? 'dNumDoc' OR (p_payload->>'iTiDE') IS DISTINCT FROM '1'
     OR (p_payload->'Subtotales'->0->>'dTotGralOpe')::numeric IS DISTINCT FROM p_total THEN
    RAISE EXCEPTION 'el payload de la factura no es válido (debe ser iTiDE 1, sin cdc ni número, con el mismo total)' USING ERRCODE = 'P0001', DETAIL = 'NEX:PAYLOAD_INVALIDO';
  END IF;

  -- Idempotencia: misma clave y mismo contenido → el documento ya creado, sin consumir número.
  SELECT d.* INTO v_previo FROM public.documentos_electronicos d WHERE d.empresa_id = p_empresa AND d.clave_idempotencia = p_clave;
  IF FOUND THEN
    IF NOT public.sucursal_en_alcance(p_empresa, p_usuario, v_previo.sucursal_id)
       OR NOT EXISTS (SELECT 1 FROM public.documento_electronico_solicitudes s WHERE s.empresa_id = p_empresa AND s.documento_id = v_previo.id AND s.entrada_hash = v_entrada) THEN
      RAISE EXCEPTION 'la clave de idempotencia ya se usó con otro contenido' USING ERRCODE = 'P0001', DETAIL = 'NEX:IDEMPOTENCIA_CONFLICTO';
    END IF;
    RETURN QUERY SELECT v_previo.id, v_previo.numero, true;
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sucursales WHERE empresa_id = p_empresa AND id = p_sucursal AND activo) OR NOT public.sucursal_en_alcance(p_empresa, p_usuario, p_sucursal) THEN
    RAISE EXCEPTION 'la sucursal no existe, está inactiva o está fuera del alcance del usuario' USING ERRCODE = 'P0001', DETAIL = 'NEX:SUCURSAL_INVALIDA';
  END IF;
  SELECT establecimiento_sifen INTO v_est FROM public.sucursales WHERE empresa_id = p_empresa AND id = p_sucursal;
  IF v_est IS NULL THEN
    RAISE EXCEPTION 'la sucursal no tiene establecimiento SIFEN configurado' USING ERRCODE = 'P0001', DETAIL = 'NEX:SIN_ESTABLECIMIENTO';
  END IF;
  IF p_cliente IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clientes WHERE empresa_id = p_empresa AND id = p_cliente AND activo AND NOT bloqueado_ventas) THEN
    RAISE EXCEPTION 'el cliente no existe, está inactivo o bloqueado para ventas' USING ERRCODE = 'P0001', DETAIL = 'NEX:CLIENTE_INVALIDO';
  END IF;

  -- NEX-065: la compuerta de emisión es SOLO el estado del TIPO (fe_secuencia_reservar → fe_punto_secuencias.activo); el estado físico del punto ya no interviene. NEX-063: reserva (serie, número) con paso atómico a la serie siguiente. Orden de bloqueos: fila del punto (FOR SHARE: impide activar/desactivar en medio de la emisión, pero NO serializa tipos distintos entre sí) → fila de la secuencia
  -- FE (FOR UPDATE: serializa las emisiones FE de ese punto). Si algo falla después, todo se revierte y el número no se consume.
  SELECT * INTO v_punto FROM public.fe_puntos_expedicion WHERE empresa_id = p_empresa AND id = p_punto AND sucursal_id = p_sucursal FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'el punto de expedición no existe para la sucursal' USING ERRCODE = 'P0001', DETAIL = 'NEX:PUNTO_INVALIDO';
  END IF;
  SELECT r.o_serie, r.o_numero INTO v_serie, v_num FROM public.fe_secuencia_reservar(p_empresa, p_punto, 'FE') r;
  v_numero := lpad(v_num::text, 7, '0');

  v_payload := p_payload || jsonb_build_object('dEst', v_est, 'dPunExp', v_punto.codigo, 'dNumDoc', v_numero, 'dSerieNum', v_serie,
                                               'dFeEmiDE', to_char(now() AT TIME ZONE 'America/Asuncion', 'YYYY-MM-DD"T"HH24:MI:SS'));

  INSERT INTO public.documentos_electronicos (empresa_id, sucursal_id, tipo, establecimiento, punto_expedicion, numero, serie, fecha_emision, cliente_id, receptor_documento,
                                              receptor_nombre, moneda, total, clave_idempotencia, creado_por)
  VALUES (p_empresa, p_sucursal, 'FE', v_est, v_punto.codigo, v_numero, v_serie, now(), p_cliente, nullif(btrim(coalesce(p_receptor_documento, '')), ''),
          p_receptor_nombre, p_moneda, p_total, p_clave, p_usuario)
  RETURNING id INTO v_id;

  INSERT INTO public.documento_electronico_solicitudes (empresa_id, documento_id, version, payload, payload_hash, entrada_hash, creado_por)
  VALUES (p_empresa, v_id, 1, v_payload, encode(sha256(convert_to(v_payload::text, 'UTF8')), 'hex'), v_entrada, p_usuario);

  RETURN QUERY SELECT v_id, v_numero, false;
END $$;

COMMENT ON FUNCTION public.fe_documento_crear_fe(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb) IS 'NEX-065: crea la FE; la compuerta de estado es el tipo FE del punto (no el estado físico del punto).';
DROP FUNCTION IF EXISTS public.fe_emision_fecha_soportada();

COMMIT;
