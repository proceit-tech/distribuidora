-- =====================================================================
-- NEX-076 — Facturación PRO-328 (P0 fiscal): la dirección SELECCIONADA en la FE NUEVA es el domicilio principal del receptor en el JSON enviado al SIFEN.
-- Orden: documentacao/ordens/ORD-CLAUDE-NEXIT-CM-PRO-328-DIRECCION-SELECCIONADA-2026-10-29.md. Análisis: documentacao/analises/AUD-NEXIT-CASA-MINGO-SOLICITUDES-2026-10-29.md (B.1–B.10).
-- Qué agrega (incremental y aditiva: NO modifica NEX-005, NEX-048, NEX-067, NEX-068, NEX-073, NEX-074 ni ninguna migración anterior, ni redefine funciones instaladas):
--  1) fe_direccion_receptor_elegida(empresa, usuario, cliente, dirección) — SOLO LECTURA, SECURITY DEFINER: exige FACTURACION_ELECTRONICA.CREAR y devuelve EXCLUSIVAMENTE id, país, calle, número de casa y los CÓDIGOS
--     oficiales de departamento / distrito / ciudad de ESA MISMA fila de direcciones_cliente, solo si pertenece a la empresa y al cliente pedidos (activo, no bloqueado para ventas) y es un destino elegible
--     (misma regla única fe_entrega_elegible de NEX-068). Cliente, dirección o empresa ajenos → cero filas (no se distingue ni se filtra información). Los códigos jamás se deducen de descripciones.
--  2) fe_documento_crear_fe_receptor(14 parámetros, mismos que fe_documento_crear_fe_vendedor de NEX-074): envuelve SIN COPIARLA a esa función y, en la MISMA transacción:
--     · FE NUEVA con dirección seleccionada: bloquea la fila de la dirección (FOR SHARE: una edición concurrente espera o ya se ve) y verifica que país, calle, número y códigos del receptor del payload
--       (cPaisRec, dDirRec, dNumCasRec, cDepRec, cDisRec, cCiuRec; en B2F sin geografía paraguaya) sean EXACTAMENTE los de esa fila. Si la dirección cambió, dejó de ser elegible o no coincide:
--       NEX:ENTREGA_INVALIDA y TODO se deshace (ni FE, ni numeración, ni baja de stock, ni vendedor, ni fotografía). Después de crear, comprueba que la fotografía de NEX-068 (documento_electronico_entregas)
--       sea de la MISMA dirección (UUID) y con la misma calle / número / país validados.
--     · Reintento (la clave ya existe): no se revalida el catálogo actual (la FE emitida es inmutable aunque la dirección se haya editado o eliminado); la identidad del destino se prueba SOLO por el UUID
--       persistido en documento_electronico_entregas: otro UUID, o UUID sin registro, o registro sin UUID enviado → NEX:IDEMPOTENCIA_CONFLICTO (jamás por comparación de texto). No escribe nada.
--     · Sin dirección seleccionada (cliente sin destinos): comportamiento anterior (domicilio fiscal; NEX-068 sigue exigiendo destino si el cliente tiene destinos elegibles).
--  3) Grants: la aplicación ejecuta la lectura y la emisión nueva; deja de ejecutar directamente fe_documento_crear_fe_vendedor (una sola vía de emisión). Sin SELECT nuevo sobre direcciones_cliente ni
--     sobre documento_electronico_entregas (sigue sin acceso directo). El ayudante ..._facturacion_vendedor_receptor se ejecuta DESPUÉS de ..._facturacion_vendedor (NEX-074) en el envoltorio global (orden alfabético).
-- No toca: NCE, KuDE (PRO-326), documentos ya emitidos, payloads, CDC, fotografías históricas, numeración, stock, IVA, pagos ni la tabla de direcciones.
-- ESTADO: versionada y NO aplicada. Ningún agente de IA la aplica: la ejecuta SOLO el responsable en la VM con backup previo y el runner oficial, después de la auditoría. Sin esta migración la aplicación NO usa la dirección
-- seleccionada: rechaza (422) la FE nueva con dirección seleccionada con un mensaje claro, sin volver en silencio al domicilio fiscal.
-- =====================================================================
DO $$
BEGIN
  IF to_regprocedure('public.fe_documento_crear_fe_vendedor(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb,jsonb,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'NEX-076 requiere la emisión de FE con vendedor (NEX-074).';
  END IF;
  IF to_regprocedure('public.fe_entrega_elegible(text,boolean,boolean)') IS NULL OR to_regclass('public.documento_electronico_entregas') IS NULL THEN
    RAISE EXCEPTION 'NEX-076 requiere la dirección de entrega de la FE (NEX-068).';
  END IF;
  IF to_regprocedure('public.usuario_tiene_permiso(uuid,uuid,text,text)') IS NULL OR to_regclass('public.direcciones_cliente') IS NULL THEN
    RAISE EXCEPTION 'NEX-076 requiere la seguridad base y los clientes (NEX-002/NEX-005).';
  END IF;
  IF to_regprocedure('public.nex_aplicar_grants_runtime_base()') IS NULL
     OR position('nex\_aplicar\_grants\_%' IN pg_get_functiondef('public.nex_aplicar_grants_runtime()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'NEX-076 requiere el envoltorio de grants que descubre los ayudantes nex_aplicar_grants_* (NEX-037/NEX-052).';
  END IF;
  IF to_regprocedure('public.fe_documento_crear_fe_receptor(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb,jsonb,uuid,uuid)') IS NOT NULL
     OR to_regprocedure('public.fe_direccion_receptor_elegida(uuid,uuid,uuid,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'fe_documento_crear_fe_receptor ya existe: NEX-076 parece aplicada; no se reaplica por suposición.';
  END IF;
END $$;

-- 1) Lectura autorizada de la dirección seleccionada (solo la fila pedida, solo los campos del receptor, con sus códigos oficiales).
CREATE FUNCTION public.fe_direccion_receptor_elegida(p_empresa uuid, p_usuario uuid, p_cliente uuid, p_direccion uuid)
RETURNS TABLE (o_id uuid, o_pais_codigo text, o_direccion text, o_numero_casa text, o_departamento_codigo integer, o_distrito_codigo integer, o_ciudad_codigo integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT d.id, d.pais_codigo, d.direccion::text, d.numero_casa::text, d.departamento_codigo, d.distrito_codigo, d.ciudad_codigo
      FROM public.direcciones_cliente d
      JOIN public.clientes c ON c.empresa_id = d.empresa_id AND c.id = d.cliente_id AND c.activo AND NOT c.bloqueado_ventas
     WHERE d.empresa_id = p_empresa AND d.cliente_id = p_cliente AND d.id = p_direccion
       AND public.fe_entrega_elegible(d.tipo, d.es_fiscal, d.es_entrega_default);
END $$;

-- 2) Emisión: la dirección validada es la del JSON del receptor y la de la fotografía, bajo bloqueo y en la misma transacción. Reintento: identidad del destino por UUID persistido.
CREATE FUNCTION public.fe_documento_crear_fe_receptor(
  p_empresa uuid, p_usuario uuid, p_sucursal uuid, p_punto uuid, p_clave text, p_cliente uuid, p_receptor_documento text, p_receptor_nombre text,
  p_moneda text, p_total numeric, p_payload jsonb, p_asignaciones jsonb, p_direccion_entrega uuid, p_vendedor uuid)
RETURNS TABLE (o_documento_id uuid, o_numero text, o_reutilizado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid; v_numero text; v_reutilizado boolean;
  v_existe boolean;
  v_dir record;
  v_b2f boolean;
  v_previa uuid;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'payload inválido' USING ERRCODE = 'P0001', DETAIL = 'NEX:PAYLOAD_INVALIDO';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.documentos_electronicos d WHERE d.empresa_id = p_empresa AND d.clave_idempotencia = p_clave) INTO v_existe;

  IF NOT v_existe AND p_direccion_entrega IS NOT NULL THEN
    -- FE nueva con dirección seleccionada: la MISMA fila, bloqueada hasta el fin de la transacción, debe ser EXACTAMENTE el receptor del payload.
    SELECT d.id, d.pais_codigo, d.direccion::text AS direccion, d.numero_casa::text AS numero_casa, d.departamento_codigo, d.distrito_codigo, d.ciudad_codigo,
           btrim(d.direccion) AS calle, btrim(d.numero_casa) AS numero
      INTO v_dir
      FROM public.direcciones_cliente d
      JOIN public.clientes c ON c.empresa_id = d.empresa_id AND c.id = d.cliente_id AND c.activo AND NOT c.bloqueado_ventas
     WHERE d.empresa_id = p_empresa AND d.cliente_id = p_cliente AND d.id = p_direccion_entrega
       AND public.fe_entrega_elegible(d.tipo, d.es_fiscal, d.es_entrega_default)
       FOR SHARE OF d;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'la dirección de entrega no pertenece al cliente de la factura o ya no está disponible' USING ERRCODE = 'P0001', DETAIL = 'NEX:ENTREGA_INVALIDA';
    END IF;

    v_b2f := (p_payload->>'iTiOpe') = '4';

    IF (p_payload->>'cPaisRec') IS DISTINCT FROM v_dir.pais_codigo
       OR (p_payload->>'dDirRec') IS DISTINCT FROM v_dir.calle
       OR (p_payload->>'dNumCasRec') IS DISTINCT FROM (CASE WHEN v_dir.numero ~ '^[0-9]{1,6}$' THEN (v_dir.numero::integer)::text END)
       OR (v_b2f AND (p_payload ? 'cDepRec' OR p_payload ? 'cDisRec' OR p_payload ? 'cCiuRec'))
       OR (NOT v_b2f AND ((p_payload->>'cDepRec') IS DISTINCT FROM v_dir.departamento_codigo::text
                          OR (p_payload->>'cDisRec') IS DISTINCT FROM v_dir.distrito_codigo::text
                          OR (p_payload->>'cCiuRec') IS DISTINCT FROM v_dir.ciudad_codigo::text)) THEN
      RAISE EXCEPTION 'la dirección seleccionada cambió o no coincide con el receptor revisado: revise la factura de nuevo' USING ERRCODE = 'P0001', DETAIL = 'NEX:ENTREGA_INVALIDA';
    END IF;
  END IF;

  SELECT c.o_documento_id, c.o_numero, c.o_reutilizado INTO v_id, v_numero, v_reutilizado
    FROM public.fe_documento_crear_fe_vendedor(p_empresa, p_usuario, p_sucursal, p_punto, p_clave, p_cliente, p_receptor_documento, p_receptor_nombre, p_moneda, p_total, p_payload, p_asignaciones, p_direccion_entrega, p_vendedor) c;

  IF v_reutilizado THEN
    -- Reintento (también la carrera de la misma clave): el destino de la FE existente se compara SOLO por su UUID persistido. Sin escritura.
    -- Sin fila (FE sin destino o anterior a NEX-068) v_previa es NULL: solo coincide con un reintento SIN dirección; cualquier otra combinación no prueba identidad → conflicto.
    SELECT e.direccion_id INTO v_previa FROM public.documento_electronico_entregas e WHERE e.empresa_id = p_empresa AND e.documento_id = v_id;
    IF v_previa IS DISTINCT FROM p_direccion_entrega THEN
      RAISE EXCEPTION 'la clave de idempotencia ya se usó con otra dirección seleccionada' USING ERRCODE = 'P0001', DETAIL = 'NEX:IDEMPOTENCIA_CONFLICTO';
    END IF;
  ELSIF p_direccion_entrega IS NOT NULL THEN
    -- La fotografía logística creada en esta transacción (NEX-068) es de la MISMA dirección validada y con los mismos datos que el JSON del receptor.
    IF NOT EXISTS (
         SELECT 1 FROM public.documento_electronico_entregas e
          WHERE e.empresa_id = p_empresa AND e.documento_id = v_id AND e.cliente_id = p_cliente AND e.direccion_id = v_dir.id
            AND (e.snapshot->>'direccion') IS NOT DISTINCT FROM v_dir.direccion
            AND (e.snapshot->>'numeroCasa') IS NOT DISTINCT FROM v_dir.numero_casa
            AND (e.snapshot->>'pais') IS NOT DISTINCT FROM v_dir.pais_codigo) THEN
      RAISE EXCEPTION 'la fotografía de la dirección seleccionada no coincide con el receptor de la factura' USING ERRCODE = 'P0001', DETAIL = 'NEX:ENTREGA_INVALIDA';
    END IF;
  END IF;

  RETURN QUERY SELECT v_id, v_numero, v_reutilizado;
END $$;

COMMENT ON FUNCTION public.fe_direccion_receptor_elegida(uuid, uuid, uuid, uuid) IS 'NEX-076 (PRO-328): país, calle, número y códigos oficiales de la dirección seleccionada (misma fila, empresa, cliente, elegible). Solo lectura.';
COMMENT ON FUNCTION public.fe_documento_crear_fe_receptor(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb, jsonb, uuid, uuid) IS 'NEX-076 (PRO-328): emisión de FE cuyo receptor es la dirección seleccionada, validada bajo bloqueo; reintento por UUID persistido.';

-- 3) Grants (el ayudante se ejecuta después de nex_aplicar_grants_facturacion_vendedor en el envoltorio global: orden alfabético).
CREATE FUNCTION public.nex_aplicar_grants_facturacion_vendedor_receptor() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;
  REVOKE ALL ON FUNCTION public.fe_direccion_receptor_elegida(uuid, uuid, uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_documento_crear_fe_receptor(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb, jsonb, uuid, uuid) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.fe_direccion_receptor_elegida(uuid, uuid, uuid, uuid) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_documento_crear_fe_receptor(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb, jsonb, uuid, uuid) TO nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_documento_crear_fe_vendedor(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb, jsonb, uuid, uuid) FROM nexit_runtime;
END $$;

REVOKE ALL ON FUNCTION public.fe_direccion_receptor_elegida(uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fe_documento_crear_fe_receptor(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb, jsonb, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nex_aplicar_grants_facturacion_vendedor_receptor() FROM PUBLIC;

SELECT public.nex_aplicar_grants_facturacion_vendedor_receptor();
