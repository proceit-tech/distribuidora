-- =====================================================================
-- NEX-073 — Facturación PRO-93 / PRO-294: FECHA DE EMISIÓN elegida por el operador (D002 dFeEmiDE y documentos_electronicos.fecha_emision).
-- Problema: fe_documento_crear_fe (NEX-065) fija SIEMPRE dFeEmiDE y fecha_emision con now(). La pantalla ofrece elegir la fecha, pero sin esta función esa elección no llegaría al documento.
-- Qué cambia (solo fe_documento_crear_fe; misma firma, mismo propietario y mismos permisos; los envoltorios NEX-067/NEX-068 la siguen llamando sin cambios):
--   * Clave OPCIONAL de entrada «dFecEmiSol» (AAAA-MM-DD) en p_payload. Sin ella el comportamiento es EXACTAMENTE el de NEX-065 (now()).
--   * Con ella: debe ser una fecha real dentro de la SELECCIÓN comercial (hoy−30 … hoy+5, día local America/Asuncion) y dentro de la ventana FISCALMENTE HABILITADA de transmisión normal con margen (hoy−4 … hoy+4; DNIT e-Kuatia: emisión→transmisión ≤120 h, anterior o posterior; ±5 días es una frontera sin margen).
--     Fuera de rango: NEX:FECHA_FUERA_DE_RANGO / NEX:FECHA_NO_HABILITADA, ANTES de reservar numeración. Nunca se sustituye en silencio por la de hoy.
--   * Convención de la hora: el operador elige solo la FECHA; dFeEmiDE = fecha elegida + la hora LOCAL de Asunción en que se reserva el número (no se simula una hora elegida). Como la hora es la de la reserva, N días equivalen a N×24 h nominales: ±5 días = 120 h exactas, SIN margen para el envío ni reintentos; se habilita ±4 días (96 h, 24 h de margen).
--   * dFeEmiDE = fecha elegida + hora local actual de Asunción; fecha_emision = ese mismo instante. La clave dFecEmiSol NO queda en el snapshot (no viaja al proveedor).
--   * El hash de idempotencia (entrada_hash) sigue calculándose sobre p_payload TAL COMO ENTRÓ (con dFecEmiSol si existe): la misma clave con otra fecha es otro contenido (conflicto).
--   * fe_emision_fecha_soportada(): marcador para que la aplicación NO envíe una fecha distinta de hoy si esta migración no está aplicada (si no, la función antigua ignoraría la fecha).
-- NO modifica documentos existentes ni numeración, secuencias, series, stock, entrega, NCE ni NEX-072. Los límites coinciden con lib/facturacion/fecha-emision.ts.
-- ESTADO: versionada y NO aplicada. Ningún agente de IA la aplica: la ejecuta SOLO el responsable en la VM (docs/PROCEDIMIENTO-NEX-073.md). Primero la migración, después el código.
-- =====================================================================
DO $$
BEGIN
  IF to_regprocedure('public.fe_documento_crear_fe(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb)') IS NULL OR to_regprocedure('public.fe_secuencia_reservar(uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'NEX-073 requiere la emisión de FE con secuencias por tipo (NEX-065).';
  END IF;
  IF to_regprocedure('public.fe_emision_fecha_soportada()') IS NOT NULL THEN
    RAISE EXCEPTION 'fe_emision_fecha_soportada ya existe: NEX-073 parece aplicada; no se reaplica por suposición.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fe_emision_fecha_soportada() RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ SELECT true $$;
COMMENT ON FUNCTION public.fe_emision_fecha_soportada() IS 'NEX-073: marcador; fe_documento_crear_fe acepta la clave de entrada dFecEmiSol.';
REVOKE ALL ON FUNCTION public.fe_emision_fecha_soportada() FROM PUBLIC;

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
  v_hoy date := (now() AT TIME ZONE 'America/Asuncion')::date;
  v_fecha date;
  v_instante timestamptz := now();
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

  -- Idempotencia: misma clave y mismo contenido → el documento ya creado, sin consumir número ni revalidar la fecha.
  SELECT d.* INTO v_previo FROM public.documentos_electronicos d WHERE d.empresa_id = p_empresa AND d.clave_idempotencia = p_clave;
  IF FOUND THEN
    IF NOT public.sucursal_en_alcance(p_empresa, p_usuario, v_previo.sucursal_id)
       OR NOT EXISTS (SELECT 1 FROM public.documento_electronico_solicitudes s WHERE s.empresa_id = p_empresa AND s.documento_id = v_previo.id AND s.entrada_hash = v_entrada) THEN
      RAISE EXCEPTION 'la clave de idempotencia ya se usó con otro contenido' USING ERRCODE = 'P0001', DETAIL = 'NEX:IDEMPOTENCIA_CONFLICTO';
    END IF;
    RETURN QUERY SELECT v_previo.id, v_previo.numero, true;
    RETURN;
  END IF;

  -- NEX-073: fecha de emisión elegida (opcional). Validada ANTES de reservar numeración.
  IF p_payload ? 'dFecEmiSol' THEN
    IF jsonb_typeof(p_payload->'dFecEmiSol') <> 'string' OR (p_payload->>'dFecEmiSol') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION 'la fecha de emisión no es válida' USING ERRCODE = 'P0001', DETAIL = 'NEX:FECHA_INVALIDA';
    END IF;
    BEGIN
      v_fecha := (p_payload->>'dFecEmiSol')::date;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'la fecha de emisión no es válida' USING ERRCODE = 'P0001', DETAIL = 'NEX:FECHA_INVALIDA';
    END;
    IF to_char(v_fecha, 'YYYY-MM-DD') <> (p_payload->>'dFecEmiSol') THEN
      RAISE EXCEPTION 'la fecha de emisión no es válida' USING ERRCODE = 'P0001', DETAIL = 'NEX:FECHA_INVALIDA';
    END IF;
    IF v_fecha < v_hoy - 30 OR v_fecha > v_hoy + 5 THEN
      RAISE EXCEPTION 'la fecha de emisión debe estar entre 30 días atrás y 5 días adelante de hoy' USING ERRCODE = 'P0001', DETAIL = 'NEX:FECHA_FUERA_DE_RANGO';
    END IF;
    IF v_fecha < v_hoy - 4 OR v_fecha > v_hoy + 4 THEN
      RAISE EXCEPTION 'la fecha de emisión queda fuera de la ventana de transmisión normal con margen (hasta 4 días atrás o adelante; el resto requiere un tratamiento adicional no implementado)' USING ERRCODE = 'P0001', DETAIL = 'NEX:FECHA_NO_HABILITADA';
    END IF;
    v_instante := ((v_fecha + (now() AT TIME ZONE 'America/Asuncion')::time) AT TIME ZONE 'America/Asuncion');
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

  -- (NEX-065/NEX-063, sin cambios) Reserva (serie, número) bajo bloqueo de la fila del punto y de la secuencia FE. Si algo falla después, todo se revierte y el número no se consume.
  SELECT * INTO v_punto FROM public.fe_puntos_expedicion WHERE empresa_id = p_empresa AND id = p_punto AND sucursal_id = p_sucursal FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'el punto de expedición no existe para la sucursal' USING ERRCODE = 'P0001', DETAIL = 'NEX:PUNTO_INVALIDO';
  END IF;
  SELECT r.o_serie, r.o_numero INTO v_serie, v_num FROM public.fe_secuencia_reservar(p_empresa, p_punto, 'FE') r;
  v_numero := lpad(v_num::text, 7, '0');

  v_payload := (p_payload - 'dFecEmiSol') || jsonb_build_object('dEst', v_est, 'dPunExp', v_punto.codigo, 'dNumDoc', v_numero, 'dSerieNum', v_serie,
                                                                 'dFeEmiDE', to_char(v_instante AT TIME ZONE 'America/Asuncion', 'YYYY-MM-DD"T"HH24:MI:SS'));

  INSERT INTO public.documentos_electronicos (empresa_id, sucursal_id, tipo, establecimiento, punto_expedicion, numero, serie, fecha_emision, cliente_id, receptor_documento,
                                              receptor_nombre, moneda, total, clave_idempotencia, creado_por)
  VALUES (p_empresa, p_sucursal, 'FE', v_est, v_punto.codigo, v_numero, v_serie, v_instante, p_cliente, nullif(btrim(coalesce(p_receptor_documento, '')), ''),
          p_receptor_nombre, p_moneda, p_total, p_clave, p_usuario)
  RETURNING id INTO v_id;

  INSERT INTO public.documento_electronico_solicitudes (empresa_id, documento_id, version, payload, payload_hash, entrada_hash, creado_por)
  VALUES (p_empresa, v_id, 1, v_payload, encode(sha256(convert_to(v_payload::text, 'UTF8')), 'hex'), v_entrada, p_usuario);

  RETURN QUERY SELECT v_id, v_numero, false;
END $$;

COMMENT ON FUNCTION public.fe_documento_crear_fe(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb) IS 'NEX-073: como NEX-065 y, si p_payload trae dFecEmiSol, valida y fija esa fecha de emisión (nunca la deja en el snapshot).';
