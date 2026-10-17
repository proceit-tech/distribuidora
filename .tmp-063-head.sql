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

