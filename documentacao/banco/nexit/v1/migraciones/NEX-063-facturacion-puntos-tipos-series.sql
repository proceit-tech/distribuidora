-- =====================================================================
-- NEX-063 — Facturación (decisión DECISION-PUNTOS-TIPOS-SERIES-2026-10-17): puntos de expedición con CONFIGURACIÓN POR TIPO DOCUMENTAL, SERIE SIFEN y paso atómico entre series.
-- Requiere NEX-060, NEX-061 y NEX-062 (en ese orden). Incremental: NO edita ninguna migración anterior (no se sabe cuáles checksums están instalados en el banco real).
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable: preflight (scripts/preflight-NEX-063.sql), backup previo, aplicación por el runner, verificación
-- (scripts/verificar-NEX-063.sql) y recuperación (scripts/reversion-NEX-063.sql). ESTADO: versionada y NO aplicada. Ningún agente de IA la aplica.
--
-- Qué hace
--  · Identidad de la numeración = empresa + establecimiento SIFEN + punto de expedición + tipo de documento (iTiDE). El punto administrativo (fe_puntos_expedicion) se registra UNA vez y se comparte;
--    cada tipo (FE, NCE, NRE, NDE, AFE) tiene su configuración y su contador independientes en fe_punto_secuencias (ya existente desde NEX-060). Timbrado/ambiente NO son dimensión del contador.
--  · fe_punto_secuencias.serie (NULL = «Sin serie», o dos letras AA…ZZ): la primera numeración de una identidad NO lleva serie (dSerieNum es opcional, MT v150 C010). Agotado 9999999 sin serie sigue
--    AA-0000001; agotada AA, AB; … AZ → BA; … ZZ-9999999 detiene (nunca se reinicia). Nunca se asume «AA» ni «0» para una identidad nueva o histórica.
--  · fe_punto_secuencias.activo: disponibilidad POR TIPO (activar FE nunca activa NCE). Las filas existentes quedan activas (se conserva el comportamiento actual).
--  · fe_secuencia_reservar(): reserva atómica (FOR UPDATE de la fila de la secuencia) del siguiente (serie, número); fe_documento_crear_fe y fe_documento_crear_nce la usan: el paso de 9999999 a
--    la serie siguiente ocurre en la misma transacción, sin colisión ni reutilización. Documentos con serie: documentos_electronicos.serie ya existía (NEX-047) con índice único incluida la serie.
--  · Administración: fe_punto_registrar (punto inactivo, sin tipo por omisión), fe_secuencia_configurar (UNA confirmación del último número y de la serie), fe_secuencia_estado (activar o
--    desactivar un tipo sin perder serie ni número), fe_punto_estado (activar o desactivar el punto administrativo sin volver a pedir números).
--  · fe_documento_crear_fe / fe_documento_crear_nce: mismas firmas, permisos, idempotencia, payload, CDC y documentos que antes; cambian SOLO la reserva (serie + número) y la exigencia de que el tipo
--    esté activo en el punto. La FE usa exclusivamente su secuencia FE y la NCE exclusivamente la NCE.
--  · NO habilita NRE/NDE/AFE: se pueden CONFIGURAR sus contadores, pero no existe flujo de emisión de esos tipos.
-- Qué NO hace: no toca documentos, CDC, payloads, solicitudes, intentos, claves de idempotencia ni la numeración ya emitida; no cambia el gateway; no reinicia ni reduce ningún contador.
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.fe_punto_secuencias') IS NULL OR to_regprocedure('public.fe_documento_crear_nce(uuid,uuid,uuid,uuid,text,uuid,integer,jsonb,text,numeric,jsonb)') IS NULL
     OR to_regprocedure('public.fe_punto_secuencia_configurar(uuid,uuid,uuid,text,integer,boolean)') IS NULL OR to_regclass('public.fe_gateway_credenciales') IS NULL THEN
    RAISE EXCEPTION 'NEX-063 requiere NEX-060, NEX-061 y NEX-062 aplicadas (en ese orden).';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fe_punto_secuencias' AND column_name = 'serie') THEN
    RAISE EXCEPTION 'fe_punto_secuencias.serie ya existe: NEX-063 parece aplicada; no se reaplica por suposición.';
  END IF;
END $$;

ALTER TABLE public.fe_punto_secuencias
  ADD COLUMN serie text CHECK (serie IS NULL OR serie ~ '^[A-Z]{2}$'),
  ADD COLUMN activo boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.fe_punto_secuencias.serie IS 'NEX-063: serie SIFEN actual (NULL = sin serie; AA…ZZ). Junto con ultimo_numero (0…9999999, 9999999 es válido) identifica la última numeración. Solo avanza.';
COMMENT ON COLUMN public.fe_punto_secuencias.activo IS 'NEX-063: disponibilidad de ESTE tipo documental en el punto (independiente del estado del punto y de los demás tipos). Desactivar no pierde serie ni número.';

-- Orden de las series: sin serie = 0, AA = 1 … AZ = 26, BA = 27 … ZZ = 676.
CREATE OR REPLACE FUNCTION public.fe_serie_orden(p_serie text) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_serie IS NULL THEN 0 ELSE 1 + (ascii(substr(p_serie, 1, 1)) - 65) * 26 + (ascii(substr(p_serie, 2, 1)) - 65) END
$$;

-- Numeración siguiente a (serie, último): espejo exacto de lib/facturacion/series.ts. Agotada (ZZ-9999999) devuelve (NULL, NULL).
CREATE OR REPLACE FUNCTION public.fe_secuencia_siguiente(p_serie text, p_ultimo integer) RETURNS TABLE (o_serie text, o_numero integer)
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_ultimo IS NULL OR p_ultimo NOT BETWEEN 0 AND 9999999 THEN
    RAISE EXCEPTION 'el último número debe estar entre 0 y 9999999' USING ERRCODE = 'P0001', DETAIL = 'NEX:NUMERO_INVALIDO';
  END IF;
  IF p_ultimo < 9999999 THEN
    RETURN QUERY SELECT p_serie, p_ultimo + 1;
  ELSIF p_serie IS NULL THEN
    RETURN QUERY SELECT 'AA'::text, 1;
  ELSIF p_serie = 'ZZ' THEN
    RETURN QUERY SELECT NULL::text, NULL::integer;
  ELSIF substr(p_serie, 2, 1) < 'Z' THEN
    RETURN QUERY SELECT substr(p_serie, 1, 1) || chr(ascii(substr(p_serie, 2, 1)) + 1), 1;
  ELSE
    RETURN QUERY SELECT chr(ascii(substr(p_serie, 1, 1)) + 1) || 'A', 1;
  END IF;
END $$;

-- La numeración (serie, número) solo avanza; identidad inmutable; el estado activo se puede alternar. Sustituye al trigger de NEX-060.
CREATE OR REPLACE FUNCTION public.fe_secuencias_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id OR NEW.punto_id IS DISTINCT FROM OLD.punto_id OR NEW.tipo_documento IS DISTINCT FROM OLD.tipo_documento THEN
      RAISE EXCEPTION 'la empresa, el punto y el tipo de documento de una secuencia son inmutables' USING ERRCODE = 'P0001';
    END IF;
    IF public.fe_serie_orden(NEW.serie) < public.fe_serie_orden(OLD.serie)
       OR (public.fe_serie_orden(NEW.serie) = public.fe_serie_orden(OLD.serie) AND NEW.ultimo_numero < OLD.ultimo_numero) THEN
      RAISE EXCEPTION 'la numeración de una secuencia fiscal nunca retrocede (ni de serie ni de número)' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' AND public.nex_reinicio_demo_activo(OLD.empresa_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'una secuencia fiscal no se elimina ni se vacía' USING ERRCODE = 'P0001';
END $$;

-- Máxima numeración (serie, número) ya emitida por Nexit para ese establecimiento, punto Y tipo; (NULL, 0) si ninguna. Pisos de las confirmaciones: nunca menor.
CREATE OR REPLACE FUNCTION public.fe_punto_maximo_emitido_serie(p_empresa uuid, p_establecimiento text, p_codigo text, p_tipo text) RETURNS TABLE (o_serie text, o_numero integer)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT m.serie, m.numero FROM (
    SELECT d.serie, d.numero::int AS numero FROM public.documentos_electronicos d
     WHERE d.empresa_id = p_empresa AND d.tipo = p_tipo AND d.establecimiento = p_establecimiento AND d.punto_expedicion = p_codigo AND d.numero ~ '^[0-9]{7}$'
     ORDER BY public.fe_serie_orden(d.serie) DESC, d.numero DESC LIMIT 1) m
  UNION ALL SELECT NULL::text, 0 WHERE NOT EXISTS (
    SELECT 1 FROM public.documentos_electronicos d WHERE d.empresa_id = p_empresa AND d.tipo = p_tipo AND d.establecimiento = p_establecimiento AND d.punto_expedicion = p_codigo AND d.numero ~ '^[0-9]{7}$')
$$;

-- Reserva atómica de la siguiente numeración de UN tipo en UN punto. El llamador ya tomó la fila del punto (FOR SHARE); aquí se toma la de la secuencia (FOR UPDATE). Orden de bloqueos: punto → secuencia.
CREATE OR REPLACE FUNCTION public.fe_secuencia_reservar(p_empresa uuid, p_punto uuid, p_tipo text) RETURNS TABLE (o_serie text, o_numero integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_s public.fe_punto_secuencias%ROWTYPE;
  v_sig record;
BEGIN
  SELECT * INTO v_s FROM public.fe_punto_secuencias WHERE empresa_id = p_empresa AND punto_id = p_punto AND tipo_documento = p_tipo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'el punto de expedición no tiene secuencia % configurada: informe y confirme el último número emitido', p_tipo USING ERRCODE = 'P0001', DETAIL = 'NEX:SECUENCIA_NO_CONFIGURADA';
  END IF;
  IF NOT v_s.activo THEN
    RAISE EXCEPTION 'el tipo de documento % no está activo en este punto de expedición', p_tipo USING ERRCODE = 'P0001', DETAIL = 'NEX:TIPO_INACTIVO';
  END IF;
  SELECT * INTO v_sig FROM public.fe_secuencia_siguiente(v_s.serie, v_s.ultimo_numero);
  IF v_sig.o_numero IS NULL THEN
    RAISE EXCEPTION 'la secuencia % del punto de expedición agotó su numeración (ZZ-9999999): escale al responsable, no se reinicia', p_tipo USING ERRCODE = 'P0001', DETAIL = 'NEX:NUMERACION_AGOTADA';
  END IF;
  UPDATE public.fe_punto_secuencias SET serie = v_sig.o_serie, ultimo_numero = v_sig.o_numero, actualizado_at = now() WHERE empresa_id = p_empresa AND punto_id = p_punto AND tipo_documento = p_tipo;
  RETURN QUERY SELECT v_sig.o_serie, v_sig.o_numero;
END $$;


-- ── Emisión de la Factura Electrónica (NEX-060) con reserva por serie ────────────────────────────────────────────
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

  -- NEX-063: reserva (serie, número) con paso atómico a la serie siguiente. Orden de bloqueos: fila del punto (FOR SHARE: impide activar/desactivar en medio de la emisión, pero NO serializa tipos distintos entre sí) → fila de la secuencia
  -- FE (FOR UPDATE: serializa las emisiones FE de ese punto). Si algo falla después, todo se revierte y el número no se consume.
  SELECT * INTO v_punto FROM public.fe_puntos_expedicion WHERE empresa_id = p_empresa AND id = p_punto AND sucursal_id = p_sucursal AND activo FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'el punto de expedición no existe para la sucursal o está inactivo' USING ERRCODE = 'P0001', DETAIL = 'NEX:PUNTO_INVALIDO';
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

COMMENT ON FUNCTION public.fe_documento_crear_fe(uuid, uuid, uuid, uuid, text, uuid, text, text, text, numeric, jsonb) IS 'NEX-063: crea la FE reservando (serie, número) de la secuencia FE del punto; exige el tipo activo.';

-- ── Emisión de la Nota de Crédito (NEX-062) con reserva por serie ────────────────────────────────────────────────
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
  v_serie text;
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

  -- NEX-063: reserva (serie, número) de la secuencia NCE con paso atómico a la serie siguiente. Reserva del número NCE: FOR SHARE del punto (impide activarlo/desactivarlo en medio) y FOR UPDATE de la secuencia NCE (serializa las NCE del punto; no interfiere con FE).
  SELECT * INTO v_punto FROM public.fe_puntos_expedicion WHERE empresa_id = p_empresa AND id = p_punto AND sucursal_id = p_sucursal AND activo FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'el punto de expedición no existe para la sucursal o está inactivo' USING ERRCODE = 'P0001', DETAIL = 'NEX:PUNTO_INVALIDO';
  END IF;
  SELECT r.o_serie, r.o_numero INTO v_serie, v_num FROM public.fe_secuencia_reservar(p_empresa, p_punto, 'NCE') r;
  v_numero := lpad(v_num::text, 7, '0');

  v_payload := p_payload || jsonb_build_object('dEst', v_est, 'dPunExp', v_punto.codigo, 'dNumDoc', v_numero, 'dSerieNum', v_serie,
                                               'dFeEmiDE', to_char(now() AT TIME ZONE 'America/Asuncion', 'YYYY-MM-DD"T"HH24:MI:SS'));

  INSERT INTO public.documentos_electronicos (empresa_id, sucursal_id, tipo, establecimiento, punto_expedicion, numero, serie, fecha_emision, cliente_id, receptor_documento,
                                              receptor_nombre, moneda, total, clave_idempotencia, creado_por)
  VALUES (p_empresa, p_sucursal, 'NCE', v_est, v_punto.codigo, v_numero, v_serie, now(), v_fe.cliente_id, v_fe.receptor_documento, v_fe.receptor_nombre, p_moneda, p_total, p_clave, p_usuario)
  RETURNING id INTO v_id;

  INSERT INTO public.documento_electronico_solicitudes (empresa_id, documento_id, version, payload, payload_hash, entrada_hash, creado_por)
  VALUES (p_empresa, v_id, 1, v_payload, encode(sha256(convert_to(v_payload::text, 'UTF8')), 'hex'), v_entrada, p_usuario);

  INSERT INTO public.nce_origen (empresa_id, nce_id, fe_id, fe_cdc, motivo, observacion) VALUES (p_empresa, v_id, p_fe, v_fe.cdc, p_motivo, nullif(btrim(coalesce(p_payload->>'dInfAdic', '')), ''));
  INSERT INTO public.nce_lineas (empresa_id, nce_id, fe_id, linea, cantidad, monto)
  SELECT p_empresa, v_id, p_fe, (x->>'linea')::int, coalesce((x->>'cantidad')::numeric, 0), (x->>'monto')::numeric FROM jsonb_array_elements(p_lineas) x;

  RETURN QUERY SELECT v_id, v_numero, false;
END $$;
COMMENT ON FUNCTION public.fe_documento_crear_nce(uuid, uuid, uuid, uuid, text, uuid, integer, jsonb, text, numeric, jsonb) IS 'NEX-063: crea la NCE reservando (serie, número) de la secuencia NCE del punto; exige el tipo activo.';

-- ── Administración de puntos y de la configuración por tipo ────────────────────────────────────────────────────────────

-- Alta del punto ADMINISTRATIVO (inactivo, sin tipo por omisión): sucursal/establecimiento, código 001…999 y nombre. La configuración fiscal de cada tipo se agrega después con fe_secuencia_configurar.
CREATE OR REPLACE FUNCTION public.fe_punto_registrar(p_empresa uuid, p_usuario uuid, p_sucursal uuid, p_codigo text, p_nombre text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_est text;
  v_activa boolean;
  v_id uuid;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'PUNTOS') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.PUNTOS en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_codigo IS NULL OR p_codigo !~ '^[0-9]{3}$' OR p_codigo = '000' THEN
    RAISE EXCEPTION 'el código del punto debe tener 3 dígitos (001 a 999)' USING ERRCODE = 'P0001', DETAIL = 'NEX:CODIGO_INVALIDO';
  END IF;
  IF p_nombre IS NULL OR char_length(btrim(p_nombre)) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'el nombre del punto debe tener de 1 a 60 caracteres' USING ERRCODE = 'P0001', DETAIL = 'NEX:NOMBRE_INVALIDO';
  END IF;
  -- Orden de bloqueos (como NEX-059/060): fila de la sucursal → lock de identidad → fila del punto.
  SELECT establecimiento_sifen, activo INTO v_est, v_activa FROM public.sucursales WHERE empresa_id = p_empresa AND id = p_sucursal FOR SHARE;
  IF NOT FOUND OR NOT v_activa OR NOT public.sucursal_en_alcance(p_empresa, p_usuario, p_sucursal) THEN
    RAISE EXCEPTION 'la sucursal no existe, está inactiva o está fuera del alcance del usuario' USING ERRCODE = 'P0001', DETAIL = 'NEX:SUCURSAL_INVALIDA';
  END IF;
  IF v_est IS NULL THEN
    RAISE EXCEPTION 'la sucursal no tiene establecimiento SIFEN configurado' USING ERRCODE = 'P0001', DETAIL = 'NEX:SIN_ESTABLECIMIENTO';
  END IF;
  PERFORM public.fe_punto_bloquear_identidad(p_empresa, v_est, p_codigo);
  IF public.fe_punto_identidad_en_uso(p_empresa, v_est, p_codigo, p_sucursal, NULL, false) THEN
    RAISE EXCEPTION 'el establecimiento % con el código % ya está configurado en otra sucursal: dos puntos con la misma identidad fiscal colisionarían en la numeración', v_est, p_codigo USING ERRCODE = 'P0001', DETAIL = 'NEX:IDENTIDAD_FISCAL_DUPLICADA';
  END IF;
  BEGIN
    INSERT INTO public.fe_puntos_expedicion (empresa_id, sucursal_id, codigo, nombre, ultimo_numero, activo) VALUES (p_empresa, p_sucursal, p_codigo, btrim(p_nombre), 0, false) RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'ya existe un punto con ese código en la sucursal' USING ERRCODE = 'P0001', DETAIL = 'NEX:PUNTO_DUPLICADO';
  END;
  INSERT INTO public.fe_puntos_expedicion_log (empresa_id, punto_id, usuario_id, accion, anterior, nuevo)
  VALUES (p_empresa, v_id, p_usuario, 'CREAR', NULL, jsonb_build_object('sucursal_id', p_sucursal, 'codigo', p_codigo, 'nombre', btrim(p_nombre), 'activo', false));
  RETURN v_id;
END $$;

-- Configura (o reconcilia hacia adelante) UN tipo de documento de un punto: serie actual (NULL = sin serie) y último número realmente emitido, con confirmación expresa ÚNICA. 0 solo si el responsable lo
-- declara. Nunca retrocede ni baja de lo ya emitido por Nexit de ESTE tipo. p_activar = true deja el tipo disponible; false lo deja (o lo conserva) como está.
CREATE OR REPLACE FUNCTION public.fe_secuencia_configurar(p_empresa uuid, p_usuario uuid, p_punto uuid, p_tipo text, p_serie text, p_ultimo_numero integer, p_confirmado boolean, p_activar boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_p public.fe_puntos_expedicion%ROWTYPE;
  v_est text;
  v_s public.fe_punto_secuencias%ROWTYPE;
  v_max record;
  v_existe boolean;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'PUNTOS') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.PUNTOS en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('FE', 'NCE', 'NDE', 'NRE', 'AFE') THEN
    RAISE EXCEPTION 'seleccione el tipo de documento (FE, NCE, NDE, NRE o AFE)' USING ERRCODE = 'P0001', DETAIL = 'NEX:TIPO_INVALIDO';
  END IF;
  IF p_confirmado IS NOT TRUE THEN
    RAISE EXCEPTION 'confirme que la serie y el último número emitido son correctos' USING ERRCODE = 'P0001', DETAIL = 'NEX:CONFIRMACION_REQUERIDA';
  END IF;
  IF p_serie IS NOT NULL AND p_serie !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'la serie debe estar vacía (sin serie) o tener dos letras mayúsculas (AA a ZZ)' USING ERRCODE = 'P0001', DETAIL = 'NEX:SERIE_INVALIDA';
  END IF;
  IF p_ultimo_numero IS NULL OR p_ultimo_numero NOT BETWEEN 0 AND 9999999 THEN
    RAISE EXCEPTION 'informe el último número realmente emitido (0 a 9999999)' USING ERRCODE = 'P0001', DETAIL = 'NEX:NUMERO_INVALIDO';
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

  SELECT * INTO v_max FROM public.fe_punto_maximo_emitido_serie(p_empresa, v_est, v_p.codigo, p_tipo);
  IF (public.fe_serie_orden(p_serie), p_ultimo_numero) < (public.fe_serie_orden(v_max.o_serie), v_max.o_numero) THEN
    RAISE EXCEPTION 'la serie y el número informados son menores que el último documento % ya emitido por Nexit en este punto: la numeración no retrocede', p_tipo USING ERRCODE = 'P0001', DETAIL = 'NEX:NUMERO_MENOR_QUE_EMITIDOS';
  END IF;

  SELECT * INTO v_s FROM public.fe_punto_secuencias WHERE empresa_id = p_empresa AND punto_id = p_punto AND tipo_documento = p_tipo FOR UPDATE;
  v_existe := FOUND;
  IF v_existe AND (public.fe_serie_orden(p_serie), p_ultimo_numero) < (public.fe_serie_orden(v_s.serie), v_s.ultimo_numero) THEN
    RAISE EXCEPTION 'la serie y el número informados son menores que los ya registrados para %: la numeración no retrocede', p_tipo USING ERRCODE = 'P0001', DETAIL = 'NEX:NUMERO_MENOR_QUE_EMITIDOS';
  END IF;

  IF NOT v_existe THEN
    INSERT INTO public.fe_punto_secuencias (empresa_id, punto_id, tipo_documento, serie, ultimo_numero, origen, activo)
    VALUES (p_empresa, p_punto, p_tipo, p_serie, p_ultimo_numero, 'CARGA_MANUAL', coalesce(p_activar, false));
  ELSE
    UPDATE public.fe_punto_secuencias SET serie = p_serie, ultimo_numero = p_ultimo_numero, activo = CASE WHEN p_activar IS TRUE THEN true ELSE activo END, actualizado_at = now()
     WHERE empresa_id = p_empresa AND punto_id = p_punto AND tipo_documento = p_tipo;
  END IF;

  INSERT INTO public.fe_puntos_expedicion_log (empresa_id, punto_id, usuario_id, accion, anterior, nuevo)
  VALUES (p_empresa, p_punto, p_usuario, 'SECUENCIA',
          CASE WHEN v_existe THEN jsonb_build_object('tipo_documento', p_tipo, 'serie', v_s.serie, 'ultimo_numero', v_s.ultimo_numero, 'activo', v_s.activo) END,
          jsonb_build_object('tipo_documento', p_tipo, 'serie', p_serie, 'ultimo_numero', p_ultimo_numero, 'activo', CASE WHEN v_existe THEN (v_s.activo OR p_activar IS TRUE) ELSE coalesce(p_activar, false) END));
END $$;

-- Activa o desactiva UN tipo en el punto (no toca los demás tipos ni pierde serie/número).
CREATE OR REPLACE FUNCTION public.fe_secuencia_estado(p_empresa uuid, p_usuario uuid, p_punto uuid, p_tipo text, p_activo boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_p public.fe_puntos_expedicion%ROWTYPE;
  v_s public.fe_punto_secuencias%ROWTYPE;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'PUNTOS') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.PUNTOS en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('FE', 'NCE', 'NDE', 'NRE', 'AFE') OR p_activo IS NULL THEN
    RAISE EXCEPTION 'tipo de documento o estado no válido' USING ERRCODE = 'P0001', DETAIL = 'NEX:TIPO_INVALIDO';
  END IF;
  SELECT * INTO v_p FROM public.fe_puntos_expedicion WHERE empresa_id = p_empresa AND id = p_punto FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'el punto de expedición no existe' USING ERRCODE = 'P0001', DETAIL = 'NEX:PUNTO_INVALIDO';
  END IF;
  IF NOT public.sucursal_en_alcance(p_empresa, p_usuario, v_p.sucursal_id) THEN
    RAISE EXCEPTION 'la sucursal está fuera del alcance del usuario' USING ERRCODE = 'P0001', DETAIL = 'NEX:SUCURSAL_INVALIDA';
  END IF;
  SELECT * INTO v_s FROM public.fe_punto_secuencias WHERE empresa_id = p_empresa AND punto_id = p_punto AND tipo_documento = p_tipo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'el tipo % no está configurado en este punto: configúrelo antes de activarlo', p_tipo USING ERRCODE = 'P0001', DETAIL = 'NEX:SECUENCIA_NO_CONFIGURADA';
  END IF;
  IF v_s.activo = p_activo THEN
    IF p_activo THEN
      RAISE EXCEPTION 'el tipo ya está activo' USING ERRCODE = 'P0001', DETAIL = 'NEX:TIPO_YA_ACTIVO';
    END IF;
    RAISE EXCEPTION 'el tipo ya está inactivo' USING ERRCODE = 'P0001', DETAIL = 'NEX:TIPO_YA_INACTIVO';
  END IF;
  UPDATE public.fe_punto_secuencias SET activo = p_activo, actualizado_at = now() WHERE empresa_id = p_empresa AND punto_id = p_punto AND tipo_documento = p_tipo;
  INSERT INTO public.fe_puntos_expedicion_log (empresa_id, punto_id, usuario_id, accion, anterior, nuevo)
  VALUES (p_empresa, p_punto, p_usuario, 'SECUENCIA', jsonb_build_object('tipo_documento', p_tipo, 'serie', v_s.serie, 'ultimo_numero', v_s.ultimo_numero, 'activo', v_s.activo),
          jsonb_build_object('tipo_documento', p_tipo, 'serie', v_s.serie, 'ultimo_numero', v_s.ultimo_numero, 'activo', p_activo));
END $$;

-- Activa o desactiva el punto ADMINISTRATIVO sin volver a pedir números (la numeración de cada tipo se confirmó una vez en su configuración). La identidad fiscal (empresa + establecimiento + código)
-- no puede estar activa en dos sucursales a la vez.
CREATE OR REPLACE FUNCTION public.fe_punto_estado(p_empresa uuid, p_usuario uuid, p_punto uuid, p_activo boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_p public.fe_puntos_expedicion%ROWTYPE;
  v_est text;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'PUNTOS') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.PUNTOS en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_activo IS NULL THEN
    RAISE EXCEPTION 'estado no válido' USING ERRCODE = 'P0001', DETAIL = 'NEX:TIPO_INVALIDO';
  END IF;
  SELECT * INTO v_p FROM public.fe_puntos_expedicion WHERE empresa_id = p_empresa AND id = p_punto;
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
  PERFORM public.fe_punto_bloquear_identidad(p_empresa, v_est, v_p.codigo);
  SELECT * INTO v_p FROM public.fe_puntos_expedicion WHERE empresa_id = p_empresa AND id = p_punto FOR UPDATE;
  IF v_p.activo = p_activo THEN
    IF p_activo THEN
      RAISE EXCEPTION 'el punto ya está activo' USING ERRCODE = 'P0001', DETAIL = 'NEX:PUNTO_YA_ACTIVO';
    END IF;
    RAISE EXCEPTION 'el punto ya está inactivo' USING ERRCODE = 'P0001', DETAIL = 'NEX:PUNTO_YA_INACTIVO';
  END IF;
  IF p_activo AND public.fe_punto_identidad_en_uso(p_empresa, v_est, v_p.codigo, v_p.sucursal_id, v_p.id, true) THEN
    RAISE EXCEPTION 'otro punto activo de otra sucursal ya usa el establecimiento % y el código %: desactívelo antes o use otro código', v_est, v_p.codigo USING ERRCODE = 'P0001', DETAIL = 'NEX:IDENTIDAD_FISCAL_DUPLICADA';
  END IF;
  UPDATE public.fe_puntos_expedicion SET activo = p_activo, actualizado_at = now() WHERE empresa_id = p_empresa AND id = p_punto;
  INSERT INTO public.fe_puntos_expedicion_log (empresa_id, punto_id, usuario_id, accion, anterior, nuevo)
  VALUES (p_empresa, p_punto, p_usuario, CASE WHEN p_activo THEN 'ACTIVAR' ELSE 'DESACTIVAR' END, jsonb_build_object('activo', NOT p_activo), jsonb_build_object('activo', p_activo));
END $$;

-- ── Privilegios ─────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_facturacion_series() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;

  REVOKE ALL ON FUNCTION public.fe_serie_orden(text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_secuencia_siguiente(text, integer) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_punto_maximo_emitido_serie(uuid, text, text, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_secuencia_reservar(uuid, uuid, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_punto_registrar(uuid, uuid, uuid, text, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_secuencia_configurar(uuid, uuid, uuid, text, text, integer, boolean, boolean) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_secuencia_estado(uuid, uuid, uuid, text, boolean) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_punto_estado(uuid, uuid, uuid, boolean) FROM PUBLIC;
  -- La aplicación solo ejecuta la administración y las emisiones (SECURITY DEFINER); las auxiliares de reserva/cálculo quedan internas.
  GRANT EXECUTE ON FUNCTION public.fe_punto_registrar(uuid, uuid, uuid, text, text) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_secuencia_configurar(uuid, uuid, uuid, text, text, integer, boolean, boolean) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_secuencia_estado(uuid, uuid, uuid, text, boolean) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_punto_estado(uuid, uuid, uuid, boolean) TO nexit_runtime;
END $$;

SELECT public.nex_aplicar_grants_facturacion_series();
