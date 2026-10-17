-- =====================================================================
-- NEX-062 — Facturación (PRO-94): NOTA DE CRÉDITO ELECTRÓNICA (NCE) V1. Requiere NEX-047/048/049/050/054 (documentos, emisión, envío, consulta), NEX-057 (puntos y bitácora) y NEX-060 (secuencias por tipo).
-- Incremental: NO edita NEX-001…061. NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo y consulta del historial real schema_migrations).
-- Reversión: scripts/reversion-NEX-062.sql. ESTADO: versionada y NO aplicada. Especificación: documentacao/v1/REQUISITOS-NCE-V1-EMISION-2026-10-16.md.
--
-- Qué hace
--  · nce_origen / nce_lineas: relación NCE → FE original (con el CDC al emitir y el motivo SIFEN 2/3/4/8) y registro de QUÉ línea original (ordinal de Detalles[] de la FE) acredita cada NCE, con la cantidad y el
--    monto acreditados. Solo altas (inmutables). El saldo y el motivo histórico se DERIVAN de estos registros y del estado fiscal de cada NCE (no hay contadores que puedan desincronizarse).
--  · fe_nce_clasificar(): CONSUME (estado SIFEN APROBADO), LIBRE (RECHAZADO, CANCELADO, INUTILIZADO o rechazo del gateway) o BLOQUEA (todo lo demás: pendiente, sin consultar, envío indeterminado, error
--    reenviable, estado no reconocido). Una NCE que bloquea impide emitir otra de la misma FE hasta que se reconcilie. El motivo queda fijado por la primera NCE APROBADA y NO se pierde si luego se cancela.
--  · fe_documento_crear_nce(): crea la NCE bajo bloqueo de la FE original (FOR UPDATE: dos peticiones simultáneas se serializan y no pueden acreditar dos veces), valida FE aprobada con CDC, moneda, motivo
--    fijado, ausencia de NCE pendientes, saldos por línea (cantidad y monto) y reserva el número de la secuencia NCE del punto (FOR SHARE del punto + FOR UPDATE de la secuencia, como NEX-060). Idempotente por
--    clave (misma clave y mismo contenido → mismo documento sin consumir número). Si algo falla el número no se consume.
--  · fe_documento_iniciar_envio(): admite tipo NCE (además de FE). Una NCE rechazada por el gateway NO se reenvía (se emite una nueva): evita que un reenvío aprobado más tarde acredite dos veces.
--  · Consulta automática en el servidor: columnas proxima_consulta_at / consulta_lease_hasta / consultas_auto en documentos_electronicos y las funciones fe_consulta_reservar (lote con lease y SKIP LOCKED,
--    seguro con varias instancias) y fe_consulta_programar. La CADENCIA concreta NO es normativa y se parametriza en la aplicación (proyecto común posterior para todos los documentos).
--  · fe_punto_secuencia_configurar(): el administrador de puntos informa y confirma el ÚLTIMO número realmente emitido de la secuencia NCE de un punto existente (nunca presume 0, nunca retrocede, nunca
--    por debajo de lo ya emitido de ese tipo). Bitácora con acción SECUENCIA.
-- Qué NO hace: no mueve inventario, cuentas a cobrar/pagar ni pagos; no llama al gateway; no toca FE emitidas, numeración FE ni migrations anteriores; no implementa cancelación desde NEXIT.
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.fe_punto_secuencias') IS NULL OR to_regprocedure('public.fe_documento_iniciar_envio(uuid,uuid,uuid,boolean)') IS NULL
     OR to_regprocedure('public.fe_documento_registrar_consulta(uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,text,jsonb)') IS NULL
     OR to_regclass('public.fe_puntos_expedicion_log') IS NULL OR to_regprocedure('public.sucursal_en_alcance(uuid,uuid,uuid)') IS NULL
     OR position('nex\_aplicar\_grants\_%' IN pg_get_functiondef('public.nex_aplicar_grants_runtime()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'NEX-062 requiere NEX-047…050, NEX-054, NEX-057, NEX-060 (secuencias por tipo) y NEX-052 (envoltorio de grants).';
  END IF;
  IF to_regclass('public.nce_origen') IS NOT NULL THEN
    RAISE EXCEPTION 'NEX-062 parece aplicada (nce_origen ya existe); no se reaplica por suposición.';
  END IF;
END $$;

-- ── 1) Relación NCE → FE y líneas acreditadas ─────────────────────────────────────────────────────────
CREATE TABLE public.nce_origen (
  empresa_id  uuid        NOT NULL REFERENCES public.empresas (id),
  nce_id      uuid        NOT NULL,
  fe_id       uuid        NOT NULL,
  fe_cdc      text        NOT NULL CHECK (fe_cdc ~ '^[0-9]{44}$'),
  motivo      smallint    NOT NULL CHECK (motivo IN (2, 3, 4, 8)),
  observacion text        CHECK (observacion IS NULL OR char_length(observacion) <= 5000),
  creado_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, nce_id),
  CONSTRAINT nce_origen_nce_fk FOREIGN KEY (empresa_id, nce_id) REFERENCES public.documentos_electronicos (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT nce_origen_fe_fk  FOREIGN KEY (empresa_id, fe_id)  REFERENCES public.documentos_electronicos (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT nce_origen_distintos_chk CHECK (nce_id <> fe_id)
);
CREATE INDEX nce_origen_fe_idx ON public.nce_origen (empresa_id, fe_id);

CREATE TABLE public.nce_lineas (
  empresa_id uuid          NOT NULL,
  nce_id     uuid          NOT NULL,
  fe_id      uuid          NOT NULL,
  linea      integer       NOT NULL CHECK (linea BETWEEN 1 AND 999),
  cantidad   numeric(20,8) NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
  monto      numeric(24,8) NOT NULL CHECK (monto > 0),
  PRIMARY KEY (empresa_id, nce_id, linea),
  CONSTRAINT nce_lineas_origen_fk FOREIGN KEY (empresa_id, nce_id) REFERENCES public.nce_origen (empresa_id, nce_id) ON DELETE CASCADE
);
CREATE INDEX nce_lineas_fe_idx ON public.nce_lineas (empresa_id, fe_id, linea);

COMMENT ON TABLE public.nce_origen IS 'NEX-062: cada NCE referencia UNA FE original (con su CDC) y su motivo SIFEN (2 devolución, 3 descuento, 4 bonificación, 8 ajuste de precio). Solo altas.';
COMMENT ON TABLE public.nce_lineas IS 'NEX-062: línea original de la FE (ordinal de Detalles[] de la solicitud persistida) que acredita cada NCE: cantidad (solo devolución) y monto con IVA incluido. Solo altas.';

CREATE OR REPLACE FUNCTION public.nce_solo_altas() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND public.nex_reinicio_demo_activo(OLD.empresa_id) THEN RETURN OLD; END IF;
  -- La eliminación en cascada del documento (reinicio DEMO) llega como DELETE con el reinicio activo; fuera de eso, las tablas son de solo altas.
  RAISE EXCEPTION '% es de solo altas: no se modifica ni se borra.', TG_TABLE_NAME USING ERRCODE = 'P0001';
END $$;

CREATE TRIGGER nce_origen_inmutable_fila_trg BEFORE UPDATE OR DELETE ON public.nce_origen FOR EACH ROW EXECUTE FUNCTION public.nce_solo_altas();
CREATE TRIGGER nce_origen_inmutable_truncate_trg BEFORE TRUNCATE ON public.nce_origen FOR EACH STATEMENT EXECUTE FUNCTION public.nce_solo_altas();
CREATE TRIGGER nce_lineas_inmutable_fila_trg BEFORE UPDATE OR DELETE ON public.nce_lineas FOR EACH ROW EXECUTE FUNCTION public.nce_solo_altas();
CREATE TRIGGER nce_lineas_inmutable_truncate_trg BEFORE TRUNCATE ON public.nce_lineas FOR EACH STATEMENT EXECUTE FUNCTION public.nce_solo_altas();

-- Integridad de tipos: la NCE debe ser tipo NCE, la original tipo FE, y ambas de la misma empresa (la FK ya ancla empresa_id).
CREATE OR REPLACE FUNCTION public.nce_origen_valida() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.documentos_electronicos WHERE empresa_id = NEW.empresa_id AND id = NEW.nce_id AND tipo = 'NCE')
     OR NOT EXISTS (SELECT 1 FROM public.documentos_electronicos WHERE empresa_id = NEW.empresa_id AND id = NEW.fe_id AND tipo = 'FE' AND cdc = NEW.fe_cdc) THEN
    RAISE EXCEPTION 'nce_origen exige una NCE y una FE de la misma empresa, con el CDC de la FE' USING ERRCODE = 'P0001', DETAIL = 'NEX:NCE_ORIGEN_INVALIDO';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER nce_origen_valida_trg BEFORE INSERT ON public.nce_origen FOR EACH ROW EXECUTE FUNCTION public.nce_origen_valida();

-- ── 2) Clasificación de una NCE respecto del saldo de su FE ────────────────────────────────────────────────
-- CONSUME: aprobada por SIFEN. LIBRE: rechazada/cancelada/inutilizada, o rechazada por el gateway (ERROR_ENVIO/RECHAZO). BLOQUEA: cualquier otro estado (nunca se infiere rechazo por falta de respuesta).
CREATE OR REPLACE FUNCTION public.fe_nce_clasificar(p_estado_local text, p_estado_sifen text, p_envio_error_tipo text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_estado_sifen = 'APROBADO' THEN 'CONSUME'
    WHEN p_estado_sifen IN ('RECHAZADO', 'CANCELADO', 'INUTILIZADO') THEN 'LIBRE'
    WHEN p_estado_local = 'ERROR_ENVIO' AND p_envio_error_tipo = 'RECHAZO' THEN 'LIBRE'
    ELSE 'BLOQUEA'
  END
$$;

-- ── 3) Creación de la NCE ──────────────────────────────────────────────────────────────────────────────────
-- p_lineas: [{"linea": <ordinal 1..n de Detalles[] de la FE>, "cantidad": <solo motivo 2; 0 en los demás>, "monto": <crédito con IVA incluido de la línea>}].
CREATE OR REPLACE FUNCTION public.fe_documento_crear_nce(
  p_empresa uuid, p_usuario uuid, p_sucursal uuid, p_punto uuid, p_clave text, p_fe uuid, p_motivo integer, p_lineas jsonb, p_moneda text, p_total numeric, p_payload jsonb)
RETURNS TABLE (o_documento_id uuid, o_numero text, o_reutilizado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_entrada text := encode(sha256(convert_to(p_payload::text, 'UTF8')), 'hex');
  v_previo public.documentos_electronicos%ROWTYPE;
  v_fe public.documentos_electronicos%ROWTYPE;
  v_sol jsonb;
  v_est text;
  v_punto public.fe_puntos_expedicion%ROWTYPE;
  v_sec public.fe_punto_secuencias%ROWTYPE;
  v_motivo_hist smallint;
  v_n_det integer;
  v_distintas integer;
  v_suma numeric := 0;
  v_num integer;
  v_numero text;
  v_id uuid;
  v_payload jsonb;
  l record;
  v_orig_cant numeric;
  v_orig_total numeric;
  v_usado_cant numeric;
  v_usado_monto numeric;
  v_k text;
  v_det jsonb;
  v_orig jsonb;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_clave IS NULL OR char_length(p_clave) NOT BETWEEN 8 AND 120 THEN
    RAISE EXCEPTION 'la clave de idempotencia es obligatoria (8 a 120 caracteres)' USING ERRCODE = 'P0001';
  END IF;
  IF p_motivo IS NULL OR p_motivo NOT IN (2, 3, 4, 8) THEN
    RAISE EXCEPTION 'el motivo de la nota de crédito no es válido (2, 3, 4 u 8)' USING ERRCODE = 'P0001', DETAIL = 'NEX:MOTIVO_INVALIDO';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR p_payload ? 'cdc' OR p_payload ? 'dNumDoc' OR (p_payload->>'iTiDE') IS DISTINCT FROM '5'
     OR (p_payload->>'iMotEmi') IS DISTINCT FROM p_motivo::text OR (p_payload->'Subtotales'->0->>'dTotGralOpe')::numeric IS DISTINCT FROM p_total
     OR jsonb_typeof(p_lineas) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'el payload de la nota de crédito no es válido (debe ser iTiDE 5, con el motivo y el total indicados, sin cdc ni número)' USING ERRCODE = 'P0001', DETAIL = 'NEX:PAYLOAD_INVALIDO';
  END IF;

  -- Idempotencia: misma clave y mismo contenido → el documento ya creado, sin consumir número.
  SELECT d.* INTO v_previo FROM public.documentos_electronicos d WHERE d.empresa_id = p_empresa AND d.clave_idempotencia = p_clave;
  IF FOUND THEN
    IF v_previo.tipo <> 'NCE' OR NOT public.sucursal_en_alcance(p_empresa, p_usuario, v_previo.sucursal_id)
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

  -- Exclusión mutua por FE original: dos NCE simultáneas de la misma factura se serializan aquí (el FOR UPDATE se mantiene hasta el fin de la transacción).
  SELECT * INTO v_fe FROM public.documentos_electronicos WHERE empresa_id = p_empresa AND id = p_fe AND tipo = 'FE' FOR UPDATE;
  IF NOT FOUND OR NOT public.sucursal_en_alcance(p_empresa, p_usuario, v_fe.sucursal_id) THEN
    RAISE EXCEPTION 'la factura original no existe o está fuera del alcance del usuario' USING ERRCODE = 'P0001', DETAIL = 'NEX:FE_NO_ENCONTRADA';
  END IF;
  IF v_fe.estado_sifen <> 'APROBADO' OR v_fe.cdc IS NULL OR NOT public.fe_cdc_coherente(v_fe.tipo, v_fe.establecimiento, v_fe.punto_expedicion, v_fe.numero, v_fe.cdc) THEN
    RAISE EXCEPTION 'la factura original debe estar APROBADA por SIFEN y tener su CDC' USING ERRCODE = 'P0001', DETAIL = 'NEX:FE_NO_APROBADA';
  END IF;
  IF v_fe.moneda <> p_moneda THEN
    RAISE EXCEPTION 'la nota de crédito debe estar en la moneda de la factura original' USING ERRCODE = 'P0001', DETAIL = 'NEX:MONEDA_DISTINTA';
  END IF;
  -- Asociación y receptor del payload = los de la FE original (snapshot: nunca del cadastro vigente).
  SELECT s.payload INTO v_sol FROM public.documento_electronico_solicitudes s WHERE s.empresa_id = p_empresa AND s.documento_id = p_fe ORDER BY s.version DESC LIMIT 1;
  IF v_sol IS NULL OR (p_payload->'DocumentosAsociados'->0->>'dCdCDERef') IS DISTINCT FROM v_fe.cdc OR (p_payload->'DocumentosAsociados'->0->>'iTipDocAso') IS DISTINCT FROM '1'
     OR jsonb_array_length(p_payload->'DocumentosAsociados') <> 1
     OR (p_payload->>'dNomRec') IS DISTINCT FROM (v_sol->>'dNomRec') OR (p_payload->>'dRucRec') IS DISTINCT FROM (v_sol->>'dRucRec') OR (p_payload->>'iNatRec') IS DISTINCT FROM (v_sol->>'iNatRec')
     OR (p_payload->>'cMoneOpe') IS DISTINCT FROM (v_sol->>'cMoneOpe') OR (p_payload->>'dTiCam') IS DISTINCT FROM (v_sol->>'dTiCam') THEN
    RAISE EXCEPTION 'la nota de crédito debe asociar el CDC de la factura original y conservar su receptor, moneda y tipo de cambio' USING ERRCODE = 'P0001', DETAIL = 'NEX:ASOCIACION_INVALIDA';
  END IF;
  -- GAP-04: TODO el receptor heredado debe ser idéntico al de la FE original (no solo nombre/RUC/natureza): defensa en profundidad frente a un payload adulterado.
  FOREACH v_k IN ARRAY ARRAY['iNatRec','iTiOpe','cPaisRec','iTiContRec','dRucRec','dDVRec','iTipIDRec','dDTipIDRec','dNumIDRec','dNomRec','dNomFanRec','dDirRec','dNumCasRec','dTelRec','dCelRec','dEmailRec','dEmailAdic','dEmailAdmin','dCodCliente'] LOOP
    IF nullif(p_payload->v_k, 'null'::jsonb) IS DISTINCT FROM nullif(v_sol->v_k, 'null'::jsonb) THEN
      RAISE EXCEPTION 'el receptor de la nota de crédito (%) difiere del de la factura original', v_k USING ERRCODE = 'P0001', DETAIL = 'NEX:ASOCIACION_INVALIDA';
    END IF;
  END LOOP;
  IF jsonb_typeof(p_payload->'Detalles') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'Detalles') <> jsonb_array_length(p_lineas) THEN
    RAISE EXCEPTION 'los ítems del payload no corresponden a las líneas acreditadas' USING ERRCODE = 'P0001', DETAIL = 'NEX:PAYLOAD_INVALIDO';
  END IF;
  v_n_det := jsonb_array_length(v_sol->'Detalles');

  -- Cualquier NCE de esta FE pendiente / indeterminada / reenviable bloquea toda emisión adicional (de cualquier motivo).
  IF EXISTS (SELECT 1 FROM public.nce_origen o JOIN public.documentos_electronicos n ON n.empresa_id = o.empresa_id AND n.id = o.nce_id
              WHERE o.empresa_id = p_empresa AND o.fe_id = p_fe AND public.fe_nce_clasificar(n.estado_local, n.estado_sifen, n.envio_error_tipo) = 'BLOQUEA') THEN
    RAISE EXCEPTION 'la factura tiene una nota de crédito pendiente de resultado: espere su resolución antes de emitir otra' USING ERRCODE = 'P0001', DETAIL = 'NEX:NCE_PENDIENTE';
  END IF;

  -- Motivo fijado por la primera NCE APROBADA (también si luego se canceló).
  SELECT o.motivo INTO v_motivo_hist FROM public.nce_origen o JOIN public.documentos_electronicos n ON n.empresa_id = o.empresa_id AND n.id = o.nce_id
   WHERE o.empresa_id = p_empresa AND o.fe_id = p_fe AND n.estado_sifen IN ('APROBADO', 'CANCELADO') ORDER BY n.creado_at, n.id LIMIT 1;
  IF v_motivo_hist IS NOT NULL AND v_motivo_hist <> p_motivo THEN
    RAISE EXCEPTION 'esta factura ya tiene una nota de crédito aprobada con otro motivo (%): no se mezclan motivos', v_motivo_hist USING ERRCODE = 'P0001', DETAIL = 'NEX:MOTIVO_FIJADO';
  END IF;

  -- Líneas: ordinal válido y único, importes positivos, saldos por línea (solo NCE APROBADAS consumen).
  SELECT count(DISTINCT (x->>'linea')::int) INTO v_distintas FROM jsonb_array_elements(p_lineas) x;
  IF v_distintas <> jsonb_array_length(p_lineas) THEN
    RAISE EXCEPTION 'una línea de la factura original no puede repetirse en la nota de crédito' USING ERRCODE = 'P0001', DETAIL = 'NEX:LINEA_INVALIDA';
  END IF;
  FOR l IN SELECT (x->>'linea')::int AS linea, coalesce((x->>'cantidad')::numeric, 0) AS cantidad, (x->>'monto')::numeric AS monto, t.ord AS ord FROM jsonb_array_elements(p_lineas) WITH ORDINALITY t(x, ord) LOOP
    IF l.linea IS NULL OR l.linea < 1 OR l.linea > v_n_det OR l.monto IS NULL OR l.monto <= 0 OR (p_motivo = 2 AND l.cantidad <= 0) OR (p_motivo <> 2 AND l.cantidad <> 0) THEN
      RAISE EXCEPTION 'línea % de la nota de crédito no válida', l.linea USING ERRCODE = 'P0001', DETAIL = 'NEX:LINEA_INVALIDA';
    END IF;
    v_orig_cant := (v_sol->'Detalles'->(l.linea - 1)->>'dCantProSer')::numeric;
    v_orig_total := (v_sol->'Detalles'->(l.linea - 1)->>'dTotOpeItem')::numeric;
    -- GAP-04: el ítem del payload (misma posición que la línea acreditada) conserva los datos fiscales de la línea original y su importe es exactamente el crédito.
    v_det := p_payload->'Detalles'->(l.ord - 1)::int;
    v_orig := v_sol->'Detalles'->(l.linea - 1);
    IF v_det IS NULL OR jsonb_typeof(v_det) <> 'object'
       OR nullif(btrim(v_det->>'dCodInt'), '') IS DISTINCT FROM nullif(btrim(v_orig->>'dCodInt'), '') OR nullif(btrim(v_det->>'dGtin'), '') IS DISTINCT FROM nullif(btrim(v_orig->>'dGtin'), '')
       OR btrim(coalesce(v_det->>'dDesProSer', '')) IS DISTINCT FROM btrim(coalesce(v_orig->>'dDesProSer', ''))
       OR (v_det->>'cUniMed')::numeric IS DISTINCT FROM (v_orig->>'cUniMed')::numeric OR (v_det->>'iAfecIVA')::numeric IS DISTINCT FROM (v_orig->>'iAfecIVA')::numeric
       OR (v_det->>'dTasaIVA')::numeric IS DISTINCT FROM (v_orig->>'dTasaIVA')::numeric OR (v_det->>'dPropIVA')::numeric IS DISTINCT FROM (v_orig->>'dPropIVA')::numeric
       OR (v_det->>'dTotOpeItem')::numeric IS DISTINCT FROM l.monto
       OR (p_motivo = 2 AND ((v_det->>'dCantProSer')::numeric IS DISTINCT FROM l.cantidad OR (v_det->>'dPUniProSer')::numeric IS DISTINCT FROM (v_orig->>'dPUniProSer')::numeric))
       OR (p_motivo <> 2 AND ((v_det->>'dCantProSer')::numeric IS DISTINCT FROM 1 OR (v_det->>'dPUniProSer')::numeric IS DISTINCT FROM l.monto)) THEN
      RAISE EXCEPTION 'el ítem % del payload no corresponde a la línea original acreditada', l.ord USING ERRCODE = 'P0001', DETAIL = 'NEX:PAYLOAD_INVALIDO';
    END IF;
    SELECT coalesce(sum(nl.cantidad), 0), coalesce(sum(nl.monto), 0) INTO v_usado_cant, v_usado_monto
      FROM public.nce_lineas nl JOIN public.documentos_electronicos n ON n.empresa_id = nl.empresa_id AND n.id = nl.nce_id
     WHERE nl.empresa_id = p_empresa AND nl.fe_id = p_fe AND nl.linea = l.linea AND n.estado_sifen = 'APROBADO';
    IF v_usado_monto + l.monto > v_orig_total THEN
      RAISE EXCEPTION 'el crédito de la línea % supera el saldo disponible de la factura original', l.linea USING ERRCODE = 'P0001', DETAIL = 'NEX:SALDO_MONTO';
    END IF;
    IF p_motivo = 2 AND v_usado_cant + l.cantidad > v_orig_cant THEN
      RAISE EXCEPTION 'la cantidad devuelta de la línea % supera la cantidad disponible', l.linea USING ERRCODE = 'P0001', DETAIL = 'NEX:SALDO_CANTIDAD';
    END IF;
    v_suma := v_suma + l.monto;
  END LOOP;
  IF v_suma <> p_total THEN
    RAISE EXCEPTION 'el total de la nota de crédito no concilia con la suma de sus líneas' USING ERRCODE = 'P0001', DETAIL = 'NEX:TOTAL_NO_CONCILIA';
  END IF;

  -- Reserva del número NCE: FOR SHARE del punto (impide activarlo/desactivarlo en medio) y FOR UPDATE de la secuencia NCE (serializa las NCE del punto; no interfiere con FE).
  SELECT * INTO v_punto FROM public.fe_puntos_expedicion WHERE empresa_id = p_empresa AND id = p_punto AND sucursal_id = p_sucursal AND activo FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'el punto de expedición no existe para la sucursal o está inactivo' USING ERRCODE = 'P0001', DETAIL = 'NEX:PUNTO_INVALIDO';
  END IF;
  SELECT * INTO v_sec FROM public.fe_punto_secuencias WHERE empresa_id = p_empresa AND punto_id = p_punto AND tipo_documento = 'NCE' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'el punto de expedición no tiene secuencia NCE configurada: informe y confirme el último número emitido' USING ERRCODE = 'P0001', DETAIL = 'NEX:SECUENCIA_NO_CONFIGURADA';
  END IF;
  IF v_sec.ultimo_numero >= 9999999 THEN
    RAISE EXCEPTION 'la secuencia NCE del punto de expedición agotó su numeración' USING ERRCODE = 'P0001', DETAIL = 'NEX:NUMERACION_AGOTADA';
  END IF;
  v_num := v_sec.ultimo_numero + 1;
  v_numero := lpad(v_num::text, 7, '0');
  UPDATE public.fe_punto_secuencias SET ultimo_numero = v_num, actualizado_at = now() WHERE empresa_id = p_empresa AND punto_id = p_punto AND tipo_documento = 'NCE';

  v_payload := p_payload || jsonb_build_object('dEst', v_est, 'dPunExp', v_punto.codigo, 'dNumDoc', v_numero, 'dSerieNum', NULL,
                                               'dFeEmiDE', to_char(now() AT TIME ZONE 'America/Asuncion', 'YYYY-MM-DD"T"HH24:MI:SS'));

  INSERT INTO public.documentos_electronicos (empresa_id, sucursal_id, tipo, establecimiento, punto_expedicion, numero, serie, fecha_emision, cliente_id, receptor_documento,
                                              receptor_nombre, moneda, total, clave_idempotencia, creado_por)
  VALUES (p_empresa, p_sucursal, 'NCE', v_est, v_punto.codigo, v_numero, NULL, now(), v_fe.cliente_id, v_fe.receptor_documento, v_fe.receptor_nombre, p_moneda, p_total, p_clave, p_usuario)
  RETURNING id INTO v_id;

  INSERT INTO public.documento_electronico_solicitudes (empresa_id, documento_id, version, payload, payload_hash, entrada_hash, creado_por)
  VALUES (p_empresa, v_id, 1, v_payload, encode(sha256(convert_to(v_payload::text, 'UTF8')), 'hex'), v_entrada, p_usuario);

  INSERT INTO public.nce_origen (empresa_id, nce_id, fe_id, fe_cdc, motivo, observacion) VALUES (p_empresa, v_id, p_fe, v_fe.cdc, p_motivo, nullif(btrim(coalesce(p_payload->>'dInfAdic', '')), ''));
  INSERT INTO public.nce_lineas (empresa_id, nce_id, fe_id, linea, cantidad, monto)
  SELECT p_empresa, v_id, p_fe, (x->>'linea')::int, coalesce((x->>'cantidad')::numeric, 0), (x->>'monto')::numeric FROM jsonb_array_elements(p_lineas) x;

  RETURN QUERY SELECT v_id, v_numero, false;
END $$;

-- ── 4) Envío: admite NCE (además de FE). Una NCE rechazada por el gateway no se reenvía. ───────────────────────────────
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
  IF d.tipo NOT IN ('FE', 'NCE') THEN
    RAISE EXCEPTION 'solo se envían facturas y notas de crédito electrónicas en esta etapa' USING ERRCODE = 'P0001', DETAIL = 'NEX:TIPO_NO_ENVIABLE';
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
    UPDATE public.documentos_electronicos SET estado_local = 'ENVIO_INDETERMINADO', envio_error_tipo = NULL, actualizado_at = now() WHERE empresa_id = p_empresa AND id = p_documento;
    RETURN QUERY SELECT 'INDETERMINADO'::text, NULL::jsonb, d.numero, d.tipo, d.establecimiento, d.punto_expedicion;
    RETURN;
  END IF;
  -- NEX-062: una NCE rechazada por el gateway NO se reenvía (se emite una nueva con 'Corregir y emitir nueva'): un reenvío aprobado más tarde podría acreditar dos veces.
  IF d.tipo = 'NCE' AND d.estado_local = 'ERROR_ENVIO' AND d.envio_error_tipo = 'RECHAZO' THEN
    RAISE EXCEPTION 'el gateway rechazó esta nota de crédito: no se reenvía; emita una nueva con «Corregir y emitir nueva»' USING ERRCODE = 'P0001', DETAIL = 'NEX:NCE_RECHAZADA';
  END IF;
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

-- ── 5) Consulta automática en el servidor (reutilizable; sin navegador) ─────────────────────────────────────────────
ALTER TABLE public.documentos_electronicos
  ADD COLUMN proxima_consulta_at   timestamptz,
  ADD COLUMN consulta_lease_hasta  timestamptz,
  ADD COLUMN consultas_auto        integer NOT NULL DEFAULT 0 CHECK (consultas_auto >= 0);
CREATE INDEX documentos_electronicos_consulta_auto_idx ON public.documentos_electronicos (proxima_consulta_at) WHERE estado_local IN ('ENVIADO', 'ENVIO_INDETERMINADO') AND estado_sifen IN ('SIN_CONSULTA', 'PENDIENTE', 'NO_RECONOCIDO');

-- Reserva un lote de documentos pendientes de resultado fiscal y fija un LEASE (otra instancia no los toma mientras dure). SKIP LOCKED: varias instancias nunca reciben el mismo documento.
-- Devuelve además el usuario con el que se registrará la consulta: el creador del documento si conserva permiso de consulta y alcance; si no, un usuario activo de la empresa que lo tenga.
CREATE OR REPLACE FUNCTION public.fe_consulta_reservar(p_limite integer, p_lease_segundos integer, p_tipos text[])
RETURNS TABLE (o_empresa uuid, o_documento uuid, o_actor uuid, o_tipo text, o_intentos integer)
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
    UPDATE public.documentos_electronicos d SET consulta_lease_hasta = now() + make_interval(secs => p_lease_segundos)
      FROM elegidos e WHERE d.empresa_id = e.empresa_id AND d.id = e.id RETURNING d.empresa_id, d.id)
  SELECT e.empresa_id, e.id,
         coalesce(
           CASE WHEN public.usuario_tiene_permiso(e.empresa_id, e.creado_por, 'FACTURACION_ELECTRONICA', 'EDITAR') AND public.sucursal_en_alcance(e.empresa_id, e.creado_por, e.sucursal_id) THEN e.creado_por END,
           (SELECT u.id FROM public.usuarios u WHERE u.empresa_id = e.empresa_id AND u.estado = 'ACTIVO' AND public.usuario_tiene_permiso(e.empresa_id, u.id, 'FACTURACION_ELECTRONICA', 'EDITAR')
               AND public.sucursal_en_alcance(e.empresa_id, u.id, e.sucursal_id) ORDER BY u.creado_at, u.id LIMIT 1)),
         e.tipo, e.consultas_auto
    FROM elegidos e JOIN marcados m ON m.empresa_id = e.empresa_id AND m.id = e.id;
END $$;

-- Programa la próxima consulta y libera el lease. p_incrementa cuenta el intento automático.
CREATE OR REPLACE FUNCTION public.fe_consulta_programar(p_empresa uuid, p_documento uuid, p_proxima timestamptz, p_incrementa boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.documentos_electronicos SET proxima_consulta_at = p_proxima, consulta_lease_hasta = NULL,
         consultas_auto = consultas_auto + CASE WHEN coalesce(p_incrementa, false) THEN 1 ELSE 0 END
   WHERE empresa_id = p_empresa AND id = p_documento;
END $$;

-- ── 6) Secuencia NCE del punto (confirmada por el administrador de puntos) ───────────────────────────────────────────
ALTER TABLE public.fe_puntos_expedicion_log DROP CONSTRAINT IF EXISTS fe_puntos_expedicion_log_accion_check;
ALTER TABLE public.fe_puntos_expedicion_log ADD CONSTRAINT fe_puntos_expedicion_log_accion_check CHECK (accion IN ('CREAR', 'ACTIVAR', 'DESACTIVAR', 'SECUENCIA'));

CREATE OR REPLACE FUNCTION public.fe_punto_secuencia_configurar(p_empresa uuid, p_usuario uuid, p_punto uuid, p_tipo text, p_ultimo_numero integer, p_confirmado boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_p public.fe_puntos_expedicion%ROWTYPE;
  v_est text;
  v_s public.fe_punto_secuencias%ROWTYPE;
  v_anterior integer;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'PUNTOS') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.PUNTOS en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_tipo IS NULL OR p_tipo <> 'NCE' THEN
    RAISE EXCEPTION 'por ahora solo se configura la secuencia de la Nota de Crédito (NCE) en el punto' USING ERRCODE = 'P0001', DETAIL = 'NEX:TIPO_NO_CONFIGURABLE';
  END IF;
  IF p_confirmado IS NOT TRUE THEN
    RAISE EXCEPTION 'confirme que el último número emitido es correcto' USING ERRCODE = 'P0001', DETAIL = 'NEX:CONFIRMACION_REQUERIDA';
  END IF;
  IF p_ultimo_numero IS NULL OR p_ultimo_numero NOT BETWEEN 0 AND 9999998 THEN
    RAISE EXCEPTION 'informe el último número realmente emitido (0 a 9999998)' USING ERRCODE = 'P0001', DETAIL = 'NEX:NUMERO_INVALIDO';
  END IF;

  SELECT * INTO v_p FROM public.fe_puntos_expedicion WHERE empresa_id = p_empresa AND id = p_punto FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'el punto de expedición no existe' USING ERRCODE = 'P0001', DETAIL = 'NEX:PUNTO_INVALIDO';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sucursales WHERE empresa_id = p_empresa AND id = v_p.sucursal_id AND activo) OR NOT public.sucursal_en_alcance(p_empresa, p_usuario, v_p.sucursal_id) THEN
    RAISE EXCEPTION 'la sucursal no existe, está inactiva o está fuera del alcance del usuario' USING ERRCODE = 'P0001', DETAIL = 'NEX:SUCURSAL_INVALIDA';
  END IF;
  SELECT establecimiento_sifen INTO v_est FROM public.sucursales WHERE empresa_id = p_empresa AND id = v_p.sucursal_id;
  IF v_est IS NULL THEN
    RAISE EXCEPTION 'la sucursal no tiene establecimiento SIFEN configurado' USING ERRCODE = 'P0001', DETAIL = 'NEX:SIN_ESTABLECIMIENTO';
  END IF;

  SELECT * INTO v_s FROM public.fe_punto_secuencias WHERE empresa_id = p_empresa AND punto_id = p_punto AND tipo_documento = 'NCE' FOR UPDATE;
  v_anterior := CASE WHEN FOUND THEN v_s.ultimo_numero ELSE NULL END;
  -- La numeración solo crece: se confirma el valor guardado o uno MAYOR (se emitió fuera de Nexit); jamás menor que lo ya guardado ni que lo ya emitido por Nexit de ESTE tipo.
  IF p_ultimo_numero < coalesce(v_anterior, 0) OR p_ultimo_numero < public.fe_punto_maximo_emitido(p_empresa, v_est, v_p.codigo, 'NCE') THEN
    RAISE EXCEPTION 'el último número informado es menor que el registrado o que el ya emitido por Nexit para la NCE: la numeración no retrocede' USING ERRCODE = 'P0001', DETAIL = 'NEX:NUMERO_MENOR_QUE_EMITIDOS';
  END IF;

  IF v_anterior IS NULL THEN
    INSERT INTO public.fe_punto_secuencias (empresa_id, punto_id, tipo_documento, ultimo_numero, origen) VALUES (p_empresa, p_punto, 'NCE', p_ultimo_numero, 'CARGA_MANUAL');
  ELSE
    UPDATE public.fe_punto_secuencias SET ultimo_numero = p_ultimo_numero, actualizado_at = now() WHERE empresa_id = p_empresa AND punto_id = p_punto AND tipo_documento = 'NCE';
  END IF;

  INSERT INTO public.fe_puntos_expedicion_log (empresa_id, punto_id, usuario_id, accion, anterior, nuevo)
  VALUES (p_empresa, p_punto, p_usuario, 'SECUENCIA', jsonb_build_object('tipo_documento', 'NCE', 'ultimo_numero', v_anterior), jsonb_build_object('tipo_documento', 'NCE', 'ultimo_numero', p_ultimo_numero));
END $$;

-- ── 6b) Consulta iniciada desde el flujo de NCE por un operador con CREAR (NCE-R02-02) ───────────────────────────────────
-- fe_documento_registrar_consulta (NEX-054, ya aplicada) exige EDITAR. El operador que solo tiene CREAR abre la pantalla de NCE y dispara la reconciliación de la FE/NCE pendiente; esta función registra
-- ESA consulta con su identidad real (actor_id = el operador; nunca se suplanta a otro usuario), exigiendo CREAR (o EDITAR), sucursal en alcance y limitándose a FE/NCE ya ENVIADAS y aún sin resultado
-- fiscal definitivo. Reutiliza las mismas guardas de NEX-054 (CDC coherente, el estado final no retrocede). No amplía EDITAR ni cambia NEX-054.
CREATE OR REPLACE FUNCTION public.fe_documento_registrar_consulta_flujo_nce(
  p_empresa uuid, p_usuario uuid, p_documento uuid, p_resultado text, p_http integer, p_request_id text, p_estado_gateway text, p_estado_sifen text,
  p_cdc text, p_cod_respuesta text, p_mensaje text, p_fecha_firma text, p_fecha_envio text, p_respuesta jsonb)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d public.documentos_electronicos%ROWTYPE;
  v_resultado text := p_resultado;
  v_mensaje text := left(nullif(btrim(coalesce(p_mensaje, '')), ''), 500);
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
  -- Solo FE/NCE ya enviadas y todavía sin resultado definitivo: un operador CREAR no reconsulta documentos en estado final ni de otros tipos.
  IF d.tipo NOT IN ('FE', 'NCE') OR d.estado_local NOT IN ('ENVIADO', 'ENVIO_INDETERMINADO') OR d.estado_sifen NOT IN ('SIN_CONSULTA', 'PENDIENTE', 'NO_RECONOCIDO') THEN
    RAISE EXCEPTION 'el documento no está pendiente de resultado fiscal' USING ERRCODE = 'P0001', DETAIL = 'NEX:DOCUMENTO_NO_PENDIENTE';
  END IF;

  IF p_resultado = 'OK' AND p_cdc IS NOT NULL
     AND ((d.cdc IS NOT NULL AND p_cdc <> d.cdc) OR NOT public.fe_cdc_coherente(d.tipo, d.establecimiento, d.punto_expedicion, d.numero, p_cdc)) THEN
    v_resultado := 'CDC_DIVERGENTE';
  END IF;

  -- NCE-R03-01: un estado fiscal DEFINITIVO solo se registra con un CDC válido y coherente con el documento (el informado o el ya guardado). Sin CDC se conserva la evidencia del intento como
  -- RESPUESTA_INVALIDA y NO se toca el estado fiscal, el CDC ni el saldo (la base no depende de que el servidor ya lo haya filtrado).
  IF v_resultado = 'OK' AND p_estado_sifen IN ('APROBADO', 'RECHAZADO', 'CANCELADO', 'INUTILIZADO')
     AND (coalesce(p_cdc, d.cdc) IS NULL OR NOT public.fe_cdc_coherente(d.tipo, d.establecimiento, d.punto_expedicion, d.numero, coalesce(p_cdc, d.cdc))) THEN
    v_resultado := 'RESPUESTA_INVALIDA';
    v_mensaje := left('La consulta informa «' || p_estado_sifen || '» sin un CDC válido y coherente con el documento: no se modifica el estado fiscal.', 500);
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
      estado_local = 'ENVIADO',
      ultima_consulta_at = now(), ultima_consulta_resultado = 'OK', actualizado_at = now()
     WHERE empresa_id = p_empresa AND id = p_documento;
  ELSE
    UPDATE public.documentos_electronicos SET ultima_consulta_at = now(), ultima_consulta_resultado = v_resultado, actualizado_at = now()
     WHERE empresa_id = p_empresa AND id = p_documento;
  END IF;

  RETURN v_resultado;
END $$;

-- ── 7) Privilegios ───────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_facturacion_nce() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;

  -- La aplicación solo LEE las tablas de relación; las escribe únicamente fe_documento_crear_nce.
  REVOKE ALL ON public.nce_origen, public.nce_lineas FROM nexit_runtime;
  GRANT SELECT ON public.nce_origen, public.nce_lineas TO nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_documento_crear_nce(uuid, uuid, uuid, uuid, text, uuid, integer, jsonb, text, numeric, jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_documento_iniciar_envio(uuid, uuid, uuid, boolean) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_consulta_reservar(integer, integer, text[]) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_consulta_programar(uuid, uuid, timestamptz, boolean) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_punto_secuencia_configurar(uuid, uuid, uuid, text, integer, boolean) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_documento_registrar_consulta_flujo_nce(uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.nce_solo_altas() FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.nce_origen_valida() FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.fe_documento_crear_nce(uuid, uuid, uuid, uuid, text, uuid, integer, jsonb, text, numeric, jsonb) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_documento_iniciar_envio(uuid, uuid, uuid, boolean) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_consulta_reservar(integer, integer, text[]) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_consulta_programar(uuid, uuid, timestamptz, boolean) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_documento_registrar_consulta_flujo_nce(uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_punto_secuencia_configurar(uuid, uuid, uuid, text, integer, boolean) TO nexit_runtime;
END $$;

SELECT public.nex_aplicar_grants_facturacion_nce();
