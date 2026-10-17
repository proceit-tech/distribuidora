-- =====================================================================
-- REVERSIÓN de NEX-063 (puntos por tipo documental, series y paso atómico entre series). Ejecutar SOLO con autorización del responsable, con backup previo, en UNA transacción: psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-063.sql.
-- ABORTA sin cambios si existen datos que solo tienen sentido con NEX-063: secuencias con serie, tipos desactivados o documentos emitidos con serie (volver atrás reutilizaría o ignoraría su
-- numeración). Restaura fe_documento_crear_fe (NEX-060), fe_documento_crear_nce (NEX-062) y el trigger de NEX-060; elimina las funciones y columnas nuevas. NO toca documentos, CDC ni numeración.
-- Después hay que borrar la fila 'NEX-063' de schema_migrations (como en las demás reversiones).
-- =====================================================================
DO $$
BEGIN
  -- NEX063-R01-02: PRIMERO los bloqueos, DESPUÉS todas las comprobaciones (ninguna lectura previa al bloqueo decide nada). Orden: puntos → secuencias → documentos, igual que la emisión
  -- (punto FOR SHARE → secuencia FOR UPDATE → INSERT del documento) y que la configuración (punto FOR UPDATE → secuencia FOR UPDATE). EXCLUSIVE en puntos y secuencias excluye FOR SHARE/FOR UPDATE,
  -- INSERT, UPDATE y DELETE concurrentes (emisión FE/NCE, configuración y estados) hasta el fin de la transacción (psql -1), que cubre también los DROP finales; SHARE en documentos impide altas con serie
  -- mientras se comprueba. LOCK TABLE solo existe dentro de una transacción: sin psql -1 la reversión falla sin cambiar nada. Si no obtiene los bloqueos en 60 s se interrumpe (atómica, sin cambios);
  -- ante un deadlock con una sesión en orden contrario PostgreSQL aborta una de las dos. Nunca continúa con una comprobación obsoleta.
  PERFORM set_config('lock_timeout', '60s', true);
  LOCK TABLE public.fe_puntos_expedicion IN EXCLUSIVE MODE;
  LOCK TABLE public.fe_punto_secuencias IN EXCLUSIVE MODE;
  LOCK TABLE public.documentos_electronicos IN SHARE MODE;

  IF to_regclass('public.fe_estado_previo_nex065') IS NOT NULL THEN
    RAISE EXCEPTION 'REVERSIÓN ABORTADA: NEX-065 sigue aplicada. Revierta en orden inverso: reversion-NEX-065.sql, reversion-NEX-064.sql y después esta.';
  END IF;
  IF to_regprocedure('public.fe_punto_alta_tipo(uuid,uuid,uuid,text,text,text,text,integer,boolean,boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'REVERSIÓN ABORTADA: NEX-064 sigue aplicada y depende de NEX-063. Revierta primero scripts/reversion-NEX-064.sql (orden inverso al de aplicación).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fe_punto_secuencias' AND column_name = 'serie') THEN
    RAISE EXCEPTION 'NEX-063 no está aplicada (fe_punto_secuencias.serie no existe): nada que revertir.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fe_punto_secuencias WHERE serie IS NOT NULL) THEN
    RAISE EXCEPTION 'REVERSIÓN ABORTADA: hay secuencias con serie (AA…ZZ). Volver a NEX-060/062 las dejaría sin serie y reutilizaría números. Concilie con el responsable.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.documentos_electronicos WHERE serie IS NOT NULL) THEN
    RAISE EXCEPTION 'REVERSIÓN ABORTADA: existen documentos emitidos con serie (dSerieNum). No se revierte la numeración por series.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fe_punto_secuencias WHERE NOT activo) THEN
    RAISE EXCEPTION 'REVERSIÓN ABORTADA: hay tipos desactivados por punto; NEX-062 no distingue su estado y los dejaría emitiendo. Actívelos o decida su baja antes de revertir.';
  END IF;
END $$;

DROP TRIGGER IF EXISTS fe_punto_secuencias_inmutable_trg ON public.fe_punto_secuencias;
DROP FUNCTION IF EXISTS public.nex_aplicar_grants_facturacion_series();
DROP FUNCTION IF EXISTS public.fe_punto_estado(uuid, uuid, uuid, boolean);
DROP FUNCTION IF EXISTS public.fe_secuencia_estado(uuid, uuid, uuid, text, boolean);
DROP FUNCTION IF EXISTS public.fe_secuencia_configurar(uuid, uuid, uuid, text, text, integer, boolean, boolean);
DROP FUNCTION IF EXISTS public.fe_punto_registrar(uuid, uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.fe_documento_crear_fe(
  p_empresa uuid, p_usuario uuid, p_sucursal uuid, p_punto uuid, p_clave text, p_cliente uuid, p_receptor_documento text, p_receptor_nombre text,
  p_moneda text, p_total numeric, p_payload jsonb)
RETURNS TABLE (o_documento_id uuid, o_numero text, o_reutilizado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_entrada text := encode(sha256(convert_to(p_payload::text, 'UTF8')), 'hex');
  v_est text;
  v_punto public.fe_puntos_expedicion%ROWTYPE;
  v_sec public.fe_punto_secuencias%ROWTYPE;
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

  -- Reserva del número. Orden de bloqueos: fila del punto (FOR SHARE: impide activar/desactivar en medio de la emisión, pero NO serializa tipos distintos entre sí) → fila de la secuencia
  -- FE (FOR UPDATE: serializa las emisiones FE de ese punto). Si algo falla después, todo se revierte y el número no se consume.
  SELECT * INTO v_punto FROM public.fe_puntos_expedicion WHERE empresa_id = p_empresa AND id = p_punto AND sucursal_id = p_sucursal AND activo FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'el punto de expedición no existe para la sucursal o está inactivo' USING ERRCODE = 'P0001', DETAIL = 'NEX:PUNTO_INVALIDO';
  END IF;
  SELECT * INTO v_sec FROM public.fe_punto_secuencias WHERE empresa_id = p_empresa AND punto_id = p_punto AND tipo_documento = 'FE' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'el punto de expedición no tiene secuencia FE configurada: informe y confirme el último número emitido' USING ERRCODE = 'P0001', DETAIL = 'NEX:SECUENCIA_NO_CONFIGURADA';
  END IF;
  IF v_sec.ultimo_numero >= 9999999 THEN
    RAISE EXCEPTION 'la secuencia FE del punto de expedición agotó su numeración' USING ERRCODE = 'P0001', DETAIL = 'NEX:NUMERACION_AGOTADA';
  END IF;
  v_num := v_sec.ultimo_numero + 1;
  v_numero := lpad(v_num::text, 7, '0');
  UPDATE public.fe_punto_secuencias SET ultimo_numero = v_num, actualizado_at = now() WHERE empresa_id = p_empresa AND punto_id = p_punto AND tipo_documento = 'FE';

  v_payload := p_payload || jsonb_build_object('dEst', v_est, 'dPunExp', v_punto.codigo, 'dNumDoc', v_numero, 'dSerieNum', NULL,
                                               'dFeEmiDE', to_char(now() AT TIME ZONE 'America/Asuncion', 'YYYY-MM-DD"T"HH24:MI:SS'));

  INSERT INTO public.documentos_electronicos (empresa_id, sucursal_id, tipo, establecimiento, punto_expedicion, numero, serie, fecha_emision, cliente_id, receptor_documento,
                                              receptor_nombre, moneda, total, clave_idempotencia, creado_por)
  VALUES (p_empresa, p_sucursal, 'FE', v_est, v_punto.codigo, v_numero, NULL, now(), p_cliente, nullif(btrim(coalesce(p_receptor_documento, '')), ''),
          p_receptor_nombre, p_moneda, p_total, p_clave, p_usuario)
  RETURNING id INTO v_id;

  INSERT INTO public.documento_electronico_solicitudes (empresa_id, documento_id, version, payload, payload_hash, entrada_hash, creado_por)
  VALUES (p_empresa, v_id, 1, v_payload, encode(sha256(convert_to(v_payload::text, 'UTF8')), 'hex'), v_entrada, p_usuario);

  RETURN QUERY SELECT v_id, v_numero, false;
END $$;

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
  v_afec integer; v_tasa numeric; v_prop numeric; v_cant_p numeric; v_prec_p numeric;
  v_tb numeric; v_den numeric; v_base numeric; v_liq numeric; v_bexe numeric;
  v_exe numeric := 0; v_exo numeric := 0; v_s5 numeric := 0; v_s10 numeric := 0; v_i5 numeric := 0; v_i10 numeric := 0; v_b5 numeric := 0; v_b10 numeric := 0;
  v_sub jsonb;
  v_cambio numeric; v_gs numeric; v_total_det numeric;
  v_total_n4 numeric;
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
    -- R05-01: valores fiscales DERIVADOS por ítem, recalculados con la misma fórmula y el mismo redondeo (mitad hacia arriba a 8 decimales) del motor TypeScript (lib/facturacion/calculo.ts, MT v150 / NT 13).
    v_afec := (v_det->>'iAfecIVA')::integer; v_tasa := (v_det->>'dTasaIVA')::numeric; v_prop := (v_det->>'dPropIVA')::numeric;
    v_cant_p := (v_det->>'dCantProSer')::numeric; v_prec_p := (v_det->>'dPUniProSer')::numeric;
    v_tb := round(v_cant_p * v_prec_p, 8);
    v_den := 10000 + v_tasa * v_prop;
    v_base := CASE WHEN v_afec IN (1, 4) THEN round(100 * v_tb * v_prop / v_den, 8) ELSE 0 END;
    v_liq := CASE WHEN v_afec IN (1, 4) THEN round(v_base * v_tasa / 100, 8) ELSE 0 END;
    v_bexe := CASE WHEN v_afec = 4 THEN round(100 * v_tb * (100 - v_prop) / v_den, 8) ELSE 0 END;
    IF v_afec NOT IN (1, 2, 3, 4) OR v_tasa NOT IN (0, 5, 10)
       OR (v_det->>'dTotBruOpeItem')::numeric IS DISTINCT FROM v_tb OR (v_det->>'dTotOpeItem')::numeric IS DISTINCT FROM v_tb
       OR (v_det->>'dBasGravIVA')::numeric IS DISTINCT FROM v_base OR (v_det->>'dLiqIVAItem')::numeric IS DISTINCT FROM v_liq OR (v_det->>'dBasExe')::numeric IS DISTINCT FROM v_bexe THEN
      RAISE EXCEPTION 'los importes fiscales derivados del ítem % (bruto, base gravada, liquidación de IVA, base exenta) no son coherentes con su cantidad, precio, afectación, proporción y tasa', l.ord USING ERRCODE = 'P0001', DETAIL = 'NEX:PAYLOAD_INVALIDO';
    END IF;
    IF v_afec = 3 THEN v_exe := v_exe + v_tb;
    ELSIF v_afec = 2 THEN v_exo := v_exo + v_tb;
    ELSIF v_afec = 1 THEN
      IF v_tasa = 5 THEN v_s5 := v_s5 + v_tb; ELSE v_s10 := v_s10 + v_tb; END IF;
    ELSE
      v_exe := v_exe + v_bexe;
      IF v_tasa = 5 THEN v_s5 := v_s5 + v_base + v_liq; ELSE v_s10 := v_s10 + v_base + v_liq; END IF;
    END IF;
    IF v_afec IN (1, 4) THEN
      IF v_tasa = 5 THEN v_i5 := v_i5 + v_liq; v_b5 := v_b5 + v_base; ELSE v_i10 := v_i10 + v_liq; v_b10 := v_b10 + v_base; END IF;
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
  -- R05-01: los subtotales del payload son exactamente la suma de los ítems recalculados (una sola fila de Subtotales; descuentos/anticipos/redondeo en cero).
  v_sub := p_payload->'Subtotales'->0;
  -- ZERO-02: moneda del catálogo; en PYG sin cambio ni condición de cambio; en USD/BRL el cambio ORIGINAL de la FE (no el cadastral), dCondTiCam = 1 y F023 dTotalGs = dTotGralOpe × dTiCam EXACTO
  -- (≤ 8 decimales y ≤ 15 dígitos enteros, sin redondeo ni truncamiento; ausente, inexacto o fuera de límite → no se reserva número).
  v_total_det := v_exe + v_exo + v_s5 + v_s10;
  -- NCE-DB-01/02: el total (p_total, dTotGralOpe y la suma de los ítems) debe caber EXACTO en documentos_electronicos.total numeric(20,4) (≤ 4 decimales, < 10^16) y, en PYG, ser entero. Sin redondeo ni
  -- truncamiento; si no cumple, no se reserva número. (La coerción numeric(20,4) del INSERT redondearía en silencio y dejaría total ≠ líneas/JSON.)
  v_total_n4 := trim_scale(p_total);
  IF p_total <> v_total_det OR scale(v_total_n4) > 4 OR p_total >= 10000000000000000 OR (p_moneda = 'PYG' AND scale(v_total_n4) > 0) THEN
    RAISE EXCEPTION 'el total de la nota de crédito debe poder guardarse exacto (hasta 4 decimales; entero en guaraníes) y coincidir con la suma de sus ítems' USING ERRCODE = 'P0001', DETAIL = 'NEX:PAYLOAD_INVALIDO';
  END IF;
  IF p_moneda NOT IN ('PYG', 'USD', 'BRL') THEN
    RAISE EXCEPTION 'la moneda de la nota de crédito no es válida' USING ERRCODE = 'P0001', DETAIL = 'NEX:PAYLOAD_INVALIDO';
  END IF;
  IF p_moneda = 'PYG' THEN
    IF nullif(p_payload->'dTiCam', 'null'::jsonb) IS NOT NULL OR nullif(p_payload->'dCondTiCam', 'null'::jsonb) IS NOT NULL OR (v_sub->>'dTotalGs')::numeric IS DISTINCT FROM v_total_det THEN
      RAISE EXCEPTION 'una nota de crédito en guaraníes no lleva tipo de cambio y su dTotalGs es el total' USING ERRCODE = 'P0001', DETAIL = 'NEX:PAYLOAD_INVALIDO';
    END IF;
  ELSE
    v_cambio := (v_sol->>'dTiCam')::numeric;
    IF v_cambio IS NULL OR v_cambio <= 0 OR scale(trim_scale(v_cambio)) > 4 OR (v_sol->>'dTiCam') IS DISTINCT FROM (p_payload->>'dTiCam')
       OR (p_payload->>'dCondTiCam')::numeric IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'la nota de crédito en moneda extranjera debe conservar el tipo de cambio original de la factura (dTiCam) y dCondTiCam = 1' USING ERRCODE = 'P0001', DETAIL = 'NEX:PAYLOAD_INVALIDO';
    END IF;
    v_gs := v_total_det * v_cambio;
    IF (v_sub->>'dTotalGs') IS NULL OR scale(trim_scale(v_gs)) > 8 OR v_gs < 0 OR v_gs >= 1000000000000000 OR (v_sub->>'dTotalGs')::numeric IS DISTINCT FROM v_gs THEN
      RAISE EXCEPTION 'el equivalente en guaraníes (dTotalGs) debe ser exactamente dTotGralOpe × tipo de cambio original, con hasta 8 decimales y 15 dígitos enteros' USING ERRCODE = 'P0001', DETAIL = 'NEX:PAYLOAD_INVALIDO';
    END IF;
  END IF;
  IF jsonb_array_length(p_payload->'Subtotales') <> 1
     OR (v_sub->>'dSubExe')::numeric IS DISTINCT FROM v_exe OR (v_sub->>'dSubExo')::numeric IS DISTINCT FROM v_exo
     OR (v_sub->>'dSub5')::numeric IS DISTINCT FROM v_s5 OR (v_sub->>'dSub10')::numeric IS DISTINCT FROM v_s10
     OR (v_sub->>'dTotOpe')::numeric IS DISTINCT FROM (v_exe + v_exo + v_s5 + v_s10) OR (v_sub->>'dTotGralOpe')::numeric IS DISTINCT FROM (v_exe + v_exo + v_s5 + v_s10)
     OR (v_sub->>'dIVA5')::numeric IS DISTINCT FROM v_i5 OR (v_sub->>'dIVA10')::numeric IS DISTINCT FROM v_i10
     OR (v_sub->>'dLiqTotIVA5')::numeric IS DISTINCT FROM v_i5 OR (v_sub->>'dLiqTotIVA10')::numeric IS DISTINCT FROM v_i10 OR (v_sub->>'dTotIVA')::numeric IS DISTINCT FROM (v_i5 + v_i10)
     OR (v_sub->>'dBaseGrav5')::numeric IS DISTINCT FROM v_b5 OR (v_sub->>'dBaseGrav10')::numeric IS DISTINCT FROM v_b10 OR (v_sub->>'dTBasGraIVA')::numeric IS DISTINCT FROM (v_b5 + v_b10)
     OR coalesce((v_sub->>'dTotDesc')::numeric, 0) <> 0 OR coalesce((v_sub->>'dTotDescGlotem')::numeric, 0) <> 0 OR coalesce((v_sub->>'dTotAntItem')::numeric, 0) <> 0
     OR coalesce((v_sub->>'dTotAnt')::numeric, 0) <> 0 OR coalesce((v_sub->>'dPorcDescTotal')::numeric, 0) <> 0 OR coalesce((v_sub->>'dDescTotal')::numeric, 0) <> 0
     OR coalesce((v_sub->>'dAnticipo')::numeric, 0) <> 0 OR coalesce((v_sub->>'dRedon')::numeric, 0) <> 0
     THEN
    RAISE EXCEPTION 'los subtotales de la nota de crédito no coinciden con la suma de sus ítems (exento, exonerado, gravado, bases e IVA)' USING ERRCODE = 'P0001', DETAIL = 'NEX:PAYLOAD_INVALIDO';
  END IF;
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

CREATE OR REPLACE FUNCTION public.fe_secuencias_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id OR NEW.punto_id IS DISTINCT FROM OLD.punto_id OR NEW.tipo_documento IS DISTINCT FROM OLD.tipo_documento THEN
      RAISE EXCEPTION 'la empresa, el punto y el tipo de documento de una secuencia son inmutables' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.ultimo_numero < OLD.ultimo_numero THEN
      RAISE EXCEPTION 'la numeración de una secuencia fiscal nunca retrocede' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' AND public.nex_reinicio_demo_activo(OLD.empresa_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'una secuencia fiscal no se elimina ni se vacía' USING ERRCODE = 'P0001';
END $$;

CREATE TRIGGER fe_punto_secuencias_inmutable_trg BEFORE UPDATE OR DELETE ON public.fe_punto_secuencias FOR EACH ROW EXECUTE FUNCTION public.fe_secuencias_inmutable();

DROP FUNCTION IF EXISTS public.fe_secuencia_reservar(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.fe_punto_maximo_emitido_serie(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.fe_secuencia_siguiente(text, integer);
DROP FUNCTION IF EXISTS public.fe_serie_orden(text);
ALTER TABLE public.fe_punto_secuencias DROP COLUMN serie, DROP COLUMN activo;
