-- =====================================================================
-- NEX-072 — Facturación E03-A1 (PRO-321 / PRO-312): evidencia HTTP inmutable de cada envío, por versión fiscal.
-- ESTADO: versionada y NO APLICADA (la aplica solo el responsable, con backup y verificación previa de schema_migrations). Incremental: NO modifica NEX-047/048/049/050/054/062 ni sus funciones.
--
-- Qué hace (y qué NO):
--  · Crea UNA tabla de eventos append-only `documento_electronico_envio_evidencias`: por operación de envío (operacion_id = id del evento raíz INICIO) y por versión de solicitud, deja constancia de
--    cada POST PRETENDIDO (texto HTTP exacto + SHA-256 de sus bytes UTF-8, grabado ANTES del fetch), de la respuesta HTTP saneada, de la ausencia comprobada de POST (NO_TRANSMITIDO), del error de
--    transmisión (TIMEOUT/RED) y del CIERRE, que se vincula al intento ENVIO legado realmente insertado en la MISMA transacción.
--  · Un POST_INTENTADO es lo que se está por invocar, NO prueba de entrega; ningún evento cambia el estado SIFEN ni el estado local del documento (eso sigue siendo de las funciones legadas).
--  · Tres funciones SECURITY DEFINER (permiso FACTURACION_ELECTRONICA.CREAR, sucursal_en_alcance, aislamiento por empresa) que ENVUELVEN —sin reemplazar— a las legadas:
--      fe_e03_iniciar_envio   → fe_documento_iniciar_envio (NEX-050/062)  + evento INICIO con la versión y el hash EXACTOS del snapshot devuelto.
--      fe_e03_registrar_evento                                            → POST_INTENTADO / HTTP_RESPUESTA / NO_TRANSMITIDO / ERROR_TRANSMISION.
--      fe_e03_cerrar_envio    → fe_documento_registrar_envio (NEX-050)    + evento CIERRE enlazado al intento insertado; idempotente por operación.
--  · Tabla nueva y vacía: NO hay backfill. Los envíos anteriores NO tienen evidencia de transmisión (la futura lectura debe señalar EVIDENCIA_TRANSMISION_NO_DISPONIBLE).
--  · Esta migración es INERTE para la aplicación actual: no instrumenta envio.ts/gateway.ts (E03-A2) ni agrega pantallas/API (E03-B). Sin credenciales, tokens ni cabeceras Authorization en ninguna columna.
--  · R03 (F002-R02 / F004-R02): el CIERRE OK exige además status=success y evidencia de recepción en la respuesta saneada del último POST; Basic/Bearer cortos se redactan y se detectan.
--  · R02 (E03-A1-F001..F004): NO_TRANSMITIDO es terminal por operación; el CIERRE se valida contra la cadena de POST/salidas; hash y bytes de la respuesta los calcula el banco sobre el objeto saneado persistido; los
--    secretos (claves y VALORES) se redactan antes de persistir y, si queda un residuo, se rechaza sin repetir el valor.
--  · Grants: nex_aplicar_grants_facturacion_e03() es descubierta por el envoltorio dinámico nex_aplicar_grants_runtime() (NEX-052); no se redefine ese envoltorio.
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.documentos_electronicos') IS NULL OR to_regclass('public.documento_electronico_solicitudes') IS NULL OR to_regclass('public.documento_electronico_intentos') IS NULL THEN
    RAISE EXCEPTION 'NEX-072 requiere NEX-047/048 (documentos, solicitudes e intentos electrónicos).';
  END IF;
  IF to_regprocedure('public.fe_documento_iniciar_envio(uuid,uuid,uuid,boolean)') IS NULL
     OR to_regprocedure('public.fe_documento_registrar_envio(uuid,uuid,uuid,text,text,text,text,integer,text,text,text,text,text,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'NEX-072 requiere NEX-050 (fe_documento_iniciar_envio de 4 parámetros y fe_documento_registrar_envio de 15 parámetros).';
  END IF;
  IF to_regprocedure('public.usuario_tiene_permiso(uuid,uuid,text,text)') IS NULL OR to_regprocedure('public.sucursal_en_alcance(uuid,uuid,uuid)') IS NULL
     OR to_regprocedure('public.nex_reinicio_demo_activo(uuid)') IS NULL THEN
    RAISE EXCEPTION 'NEX-072 requiere NEX-012 (nex_reinicio_demo_activo), NEX-014 (usuario_tiene_permiso) y NEX-046 (sucursal_en_alcance).';
  END IF;
  IF to_regprocedure('public.nex_aplicar_grants_runtime()') IS NULL
     OR position('nex\_aplicar\_grants\_%' IN pg_get_functiondef('public.nex_aplicar_grants_runtime()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'NEX-072 requiere NEX-052 (envoltorio de grants que reaplica todos los ayudantes nex_aplicar_grants_*).';
  END IF;
  IF to_regclass('public.documento_electronico_envio_evidencias') IS NOT NULL
     OR to_regprocedure('public.fe_e03_iniciar_envio(uuid,uuid,uuid,boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'NEX-072 parece aplicada (la tabla o las funciones ya existen); no se reaplica por suposición.';
  END IF;
END $$;

-- Clave compuesta que permite el vínculo (empresa, documento, intento) sin tocar filas: solo agrega una restricción de unicidad sobre la PK existente.
ALTER TABLE public.documento_electronico_intentos
  ADD CONSTRAINT documento_electronico_intentos_doc_id_uk UNIQUE (empresa_id, documento_id, id);

CREATE TABLE public.documento_electronico_envio_evidencias (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  orden               bigint      GENERATED ALWAYS AS IDENTITY,
  empresa_id          uuid        NOT NULL REFERENCES public.empresas (id),
  documento_id        uuid        NOT NULL,
  version             smallint    NOT NULL CHECK (version >= 1),
  operacion_id        uuid        NOT NULL,
  tipo_evento         text        NOT NULL CHECK (tipo_evento IN ('INICIO','POST_INTENTADO','HTTP_RESPUESTA','NO_TRANSMITIDO','ERROR_TRANSMISION','CIERRE')),
  nro_post            smallint    CHECK (nro_post IS NULL OR nro_post BETWEEN 1 AND 10),
  solicitud_http_texto text       CHECK (solicitud_http_texto IS NULL OR octet_length(solicitud_http_texto) <= 1048576),
  solicitud_sha256    text        CHECK (solicitud_sha256 IS NULL OR solicitud_sha256 ~ '^[0-9a-f]{64}$'),
  solicitud_bytes     integer     CHECK (solicitud_bytes IS NULL OR solicitud_bytes > 0),
  http_status         integer     CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  respuesta_saneada   jsonb       CHECK (respuesta_saneada IS NULL OR pg_column_size(respuesta_saneada) < 65536),
  respuesta_truncada  boolean     NOT NULL,
  respuesta_bytes     integer     CHECK (respuesta_bytes IS NULL OR respuesta_bytes >= 0),
  respuesta_sha256    text        CHECK (respuesta_sha256 IS NULL OR respuesta_sha256 ~ '^[0-9a-f]{64}$'),
  intento_id          uuid,
  mensaje             text        CHECK (mensaje IS NULL OR char_length(mensaje) <= 500),
  actor_id            uuid        NOT NULL,
  creado_at           timestamptz NOT NULL DEFAULT now(),
  -- Identidad fiscal y versión: el evento pertenece a UN documento y a UNA versión de solicitud existentes de la misma empresa.
  CONSTRAINT envio_evidencias_documento_fk FOREIGN KEY (empresa_id, documento_id) REFERENCES public.documentos_electronicos (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT envio_evidencias_version_fk   FOREIGN KEY (empresa_id, documento_id, version) REFERENCES public.documento_electronico_solicitudes (empresa_id, documento_id, version) ON DELETE CASCADE,
  CONSTRAINT envio_evidencias_actor_fk     FOREIGN KEY (empresa_id, actor_id) REFERENCES public.usuarios (empresa_id, id) ON DELETE CASCADE,
  -- Intento legado SOLO en el CIERRE: se liga al intento ENVIO insertado por fe_documento_registrar_envio en la misma transacción; nunca se retroasigna a intentos antiguos.
  CONSTRAINT envio_evidencias_intento_fk   FOREIGN KEY (empresa_id, documento_id, intento_id) REFERENCES public.documento_electronico_intentos (empresa_id, documento_id, id) ON DELETE CASCADE,
  CONSTRAINT envio_evidencias_identidad_uk UNIQUE (empresa_id, documento_id, version, id),
  -- Raíz autorreferente: el evento INICIO es su propia operación (id = operacion_id); los demás apuntan a una raíz de la MISMA empresa, documento y versión (el tipo raíz lo verifica el disparador).
  CONSTRAINT envio_evidencias_operacion_fk FOREIGN KEY (empresa_id, documento_id, version, operacion_id) REFERENCES public.documento_electronico_envio_evidencias (empresa_id, documento_id, version, id) ON DELETE CASCADE,
  -- Respuesta: el hash y los bytes los calcula el banco sobre el objeto saneado PERSISTIDO (jsonb::text en UTF-8); existen si y solo si hay objeto. «Truncada» solo con objeto parcial presente.
  CONSTRAINT envio_evidencias_respuesta_coherente_chk CHECK ((respuesta_saneada IS NULL) = (respuesta_sha256 IS NULL) AND (respuesta_saneada IS NULL) = (respuesta_bytes IS NULL) AND (NOT respuesta_truncada OR respuesta_saneada IS NOT NULL)),
  CONSTRAINT envio_evidencias_solicitud_coherente_chk CHECK ((solicitud_http_texto IS NULL) = (solicitud_sha256 IS NULL) AND (solicitud_http_texto IS NULL) = (solicitud_bytes IS NULL)),
  -- Forma de cada tipo de evento: nada se fabrica por defecto (un campo que no corresponde al tipo debe ser NULL).
  CONSTRAINT envio_evidencias_forma_chk CHECK (
       (tipo_evento = 'INICIO'            AND id = operacion_id AND nro_post IS NULL AND solicitud_http_texto IS NULL AND http_status IS NULL AND respuesta_saneada IS NULL AND NOT respuesta_truncada
                                          AND respuesta_bytes IS NULL AND respuesta_sha256 IS NULL AND intento_id IS NULL AND mensaje IS NULL)
    OR (tipo_evento = 'POST_INTENTADO'    AND id <> operacion_id AND nro_post IS NOT NULL AND solicitud_http_texto IS NOT NULL AND http_status IS NULL AND respuesta_saneada IS NULL AND NOT respuesta_truncada
                                          AND respuesta_bytes IS NULL AND respuesta_sha256 IS NULL AND intento_id IS NULL AND mensaje IS NULL)
    OR (tipo_evento = 'HTTP_RESPUESTA'    AND id <> operacion_id AND nro_post IS NOT NULL AND solicitud_http_texto IS NULL AND http_status IS NOT NULL AND intento_id IS NULL)
    OR (tipo_evento = 'NO_TRANSMITIDO'    AND id <> operacion_id AND nro_post IS NULL AND solicitud_http_texto IS NULL AND http_status IS NULL AND respuesta_saneada IS NULL AND NOT respuesta_truncada
                                          AND respuesta_bytes IS NULL AND respuesta_sha256 IS NULL AND intento_id IS NULL AND mensaje IS NOT NULL)
    OR (tipo_evento = 'ERROR_TRANSMISION' AND id <> operacion_id AND nro_post IS NOT NULL AND solicitud_http_texto IS NULL AND http_status IS NULL AND respuesta_saneada IS NULL AND NOT respuesta_truncada
                                          AND respuesta_bytes IS NULL AND respuesta_sha256 IS NULL AND intento_id IS NULL AND mensaje IS NOT NULL)
    OR (tipo_evento = 'CIERRE'            AND id <> operacion_id AND nro_post IS NULL AND solicitud_http_texto IS NULL AND respuesta_saneada IS NULL AND NOT respuesta_truncada
                                          AND respuesta_bytes IS NULL AND respuesta_sha256 IS NULL AND intento_id IS NOT NULL)
  )
);

-- Historial por documento/versión/operación en orden estable (identidad `orden`), y unicidades de la operación: un solo CIERRE, un POST por número, una sola salida por POST, un cierre por intento.
CREATE INDEX envio_evidencias_version_idx   ON public.documento_electronico_envio_evidencias (empresa_id, documento_id, version, orden);
CREATE INDEX envio_evidencias_operacion_idx ON public.documento_electronico_envio_evidencias (empresa_id, documento_id, operacion_id, orden);
CREATE UNIQUE INDEX envio_evidencias_cierre_uk  ON public.documento_electronico_envio_evidencias (empresa_id, documento_id, operacion_id) WHERE tipo_evento = 'CIERRE';
CREATE UNIQUE INDEX envio_evidencias_post_uk    ON public.documento_electronico_envio_evidencias (empresa_id, documento_id, operacion_id, nro_post) WHERE tipo_evento = 'POST_INTENTADO';
CREATE UNIQUE INDEX envio_evidencias_salida_uk  ON public.documento_electronico_envio_evidencias (empresa_id, documento_id, operacion_id, nro_post) WHERE tipo_evento IN ('HTTP_RESPUESTA', 'ERROR_TRANSMISION');
-- NO_TRANSMITIDO: a lo sumo uno por operación (y terminal: el disparador de guarda impide cualquier POST/respuesta/error después de él).
CREATE UNIQUE INDEX envio_evidencias_no_transmitido_uk ON public.documento_electronico_envio_evidencias (empresa_id, documento_id, operacion_id) WHERE tipo_evento = 'NO_TRANSMITIDO';
CREATE UNIQUE INDEX envio_evidencias_intento_uk ON public.documento_electronico_envio_evidencias (empresa_id, documento_id, intento_id) WHERE intento_id IS NOT NULL;

COMMENT ON COLUMN public.documento_electronico_envio_evidencias.respuesta_sha256 IS 'SHA-256 (UTF-8) del texto jsonb del objeto saneado persistido en respuesta_saneada, calculado por el banco. NO es el hash del cuerpo HTTP original; con respuesta_truncada = true cubre solo el objeto parcial persistido.';
COMMENT ON COLUMN public.documento_electronico_envio_evidencias.respuesta_bytes IS 'Tamaño en bytes UTF-8 del texto jsonb del objeto saneado persistido (mismo alcance que respuesta_sha256). No describe el cuerpo HTTP bruto.';
COMMENT ON COLUMN public.documento_electronico_envio_evidencias.respuesta_truncada IS 'true = el llamador entregó un objeto de respuesta parcial (el cuerpo bruto no se conserva ni se verifica aquí).';
COMMENT ON TABLE public.documento_electronico_envio_evidencias IS 'NEX-072 (E03-A1): log append-only de eventos de envío por operación y versión de solicitud. POST_INTENTADO = POST que se está por invocar (texto HTTP exacto y SHA-256 UTF-8 grabados antes del fetch), no prueba de entrega. Sin credenciales. Sin backfill: lo anterior a esta migración no tiene evidencia.';

-- Inmutabilidad: solo altas. DELETE solo durante el reinicio DEMO autorizado (misma regla de NEX-047); TRUNCATE nunca.
CREATE OR REPLACE FUNCTION public.fe_e03_evidencia_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION '% es un registro fiscal: no se vacía.', TG_TABLE_NAME USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF NOT public.nex_reinicio_demo_activo(OLD.empresa_id) THEN
      RAISE EXCEPTION '% es un registro fiscal: no se elimina.', TG_TABLE_NAME USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% es de solo altas: no se modifica.', TG_TABLE_NAME USING ERRCODE = 'P0001';
END $$;

CREATE TRIGGER envio_evidencias_inmutable_fila_trg BEFORE UPDATE OR DELETE ON public.documento_electronico_envio_evidencias
  FOR EACH ROW EXECUTE FUNCTION public.fe_e03_evidencia_inmutable();
CREATE TRIGGER envio_evidencias_inmutable_truncate_trg BEFORE TRUNCATE ON public.documento_electronico_envio_evidencias
  FOR EACH STATEMENT EXECUTE FUNCTION public.fe_e03_evidencia_inmutable();

-- Guarda de inserción: todo evento distinto de INICIO cuelga de una raíz INICIO de la misma empresa/documento/versión y de una operación que aún no tiene CIERRE.
CREATE OR REPLACE FUNCTION public.fe_e03_evidencia_guarda() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tipo_evento <> 'INICIO' THEN
    IF NOT EXISTS (SELECT 1 FROM public.documento_electronico_envio_evidencias r
                    WHERE r.empresa_id = NEW.empresa_id AND r.documento_id = NEW.documento_id AND r.version = NEW.version AND r.id = NEW.operacion_id AND r.tipo_evento = 'INICIO') THEN
      RAISE EXCEPTION 'la operación de envío no existe para este documento y versión' USING ERRCODE = 'P0001', DETAIL = 'NEX:OPERACION_NO_ENCONTRADA';
    END IF;
    -- NO_TRANSMITIDO es terminal para la captura de transmisión: después de él solo cabe el CIERRE, y no puede registrarse si la operación ya intentó un POST.
    IF NEW.tipo_evento NOT IN ('CIERRE', 'NO_TRANSMITIDO') AND EXISTS (SELECT 1 FROM public.documento_electronico_envio_evidencias n
                                                                       WHERE n.empresa_id = NEW.empresa_id AND n.documento_id = NEW.documento_id AND n.operacion_id = NEW.operacion_id AND n.tipo_evento = 'NO_TRANSMITIDO') THEN
      RAISE EXCEPTION 'la operación de envío ya se declaró NO TRANSMITIDA' USING ERRCODE = 'P0001', DETAIL = 'NEX:OPERACION_NO_TRANSMITIDA';
    END IF;
    IF NEW.tipo_evento = 'NO_TRANSMITIDO' AND EXISTS (SELECT 1 FROM public.documento_electronico_envio_evidencias p
                                                       WHERE p.empresa_id = NEW.empresa_id AND p.documento_id = NEW.documento_id AND p.operacion_id = NEW.operacion_id AND p.tipo_evento = 'POST_INTENTADO') THEN
      RAISE EXCEPTION 'NO_TRANSMITIDO no es válido: la operación ya intentó un POST' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_CONTRADICTORIO';
    END IF;
    IF NEW.tipo_evento <> 'CIERRE' AND EXISTS (SELECT 1 FROM public.documento_electronico_envio_evidencias c
                                                WHERE c.empresa_id = NEW.empresa_id AND c.documento_id = NEW.documento_id AND c.operacion_id = NEW.operacion_id AND c.tipo_evento = 'CIERRE') THEN
      RAISE EXCEPTION 'la operación de envío ya está cerrada' USING ERRCODE = 'P0001', DETAIL = 'NEX:OPERACION_CERRADA';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER envio_evidencias_guarda_trg BEFORE INSERT ON public.documento_electronico_envio_evidencias
  FOR EACH ROW EXECUTE FUNCTION public.fe_e03_evidencia_guarda();

-- ── Redacción de secretos (E03-A1-F004 / F004-R02). Alcance: claves sensibles con valor cadena, cabeceras/valores «Bearer» y «Basic» (Basic = Base64 válido de 4 caracteres o más, incluso corto, p. ej. «Basic dTpw»; «Bearer» desde 4
-- caracteres, salvo la palabra «token»), JWT y pares «token=…» / «password: …» dentro de VALORES de texto. Lo reconocido se reemplaza por [REDACTED] ANTES de persistir; si aún queda una clave sensible con un valor no redactado (p. ej. un
-- objeto), un Basic/Bearer/JWT sin redactar, la evidencia se rechaza SIN repetir el valor. La obligación primaria de no enviar credenciales es del saneado de origen (gateway.ts); esto es DEFENSA EN PROFUNDIDAD por patrones, no un
-- saneamiento infalible: puede redactar de más (p. ej. «token: inválido», «Basic auth») y no detecta secretos sin forma reconocible.
CREATE OR REPLACE FUNCTION public.fe_e03_redactar_texto(p_texto text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(
                 regexp_replace(
                   regexp_replace(p_texto,
                     '("(?:authorization|password|passwd|pwd|token|access_token|refresh_token|id_token|secret|client_secret|api_key|apikey)"\s*:\s*)"(?:[^"\\]|\\.)*"', '\1"[REDACTED]"', 'gi'),
                   '\mbearer\s+(?!token\M)[A-Za-z0-9._~+/=-]{4,}', 'Bearer [REDACTED]', 'gi'),
                 '\mbasic\s+(?:[A-Za-z0-9+/]{4})+(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?(?![A-Za-z0-9+/=])', 'Basic [REDACTED]', 'gi'),
               'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*', '[REDACTED]', 'g'),
             '(\m(?:authorization|password|passwd|pwd|token|access_token|refresh_token|secret|client_secret|api_key|apikey)\s*[:=]\s*)(?!\[REDACTED\])[^\s",\\}\]]{4,}', '\1[REDACTED]', 'gi'),
           '(\m(?:authorization)\s*[:=]\s*)(?!\[REDACTED\])[^\s",\\}\]]{1,3}\M', '\1[REDACTED]', 'gi')
$$;

CREATE OR REPLACE FUNCTION public.fe_e03_secreto_residual(p_texto text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_texto ~* '"(?:authorization|password|passwd|pwd|token|access_token|refresh_token|id_token|secret|client_secret|api_key|apikey)"\s*:\s*(?!"\[REDACTED\]"|null\M)'
      OR p_texto ~* '\mbearer\s+(?!\[REDACTED\]|token\M)[A-Za-z0-9._~+/=-]{4,}'
      OR p_texto ~* '\mbasic\s+(?!\[REDACTED\])(?:[A-Za-z0-9+/]{4})+(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?(?![A-Za-z0-9+/=])'
      OR p_texto ~ 'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.'
$$;

REVOKE ALL ON FUNCTION public.fe_e03_redactar_texto(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fe_e03_secreto_residual(text) FROM PUBLIC;

-- ── Recepción confirmada por el gateway (E03-A1-F002-R02). Un HTTP 2xx NO prueba recepción: interpretarRecepcion (gateway.ts) exige status = "success" y evidencia específica (lote válido, CDC coherente con el documento o eco
-- íntegro de dEst/dPunExp/dNumDoc), sin contradicciones. Estos ayudantes revisan la respuesta SANEADA que quedó persistida con la MISMA búsqueda de claves de gateway.ts (claves normalizadas, profundidad <= 5, arrays <= 20) pero de forma
-- ESTRICTA: examinan todas las coincidencias (no solo la primera) y cualquier contradicción o respuesta truncada impide el OK. Es un subconjunto de lo que gateway.ts acepta (puede rechazar más, nunca aceptar más) y NO infiere
-- aprobación SIFEN: solo habilita registrar ENVIADO (= el gateway recibió el documento).
CREATE OR REPLACE FUNCTION public.fe_e03_valores_por_clave(p_json jsonb, p_claves text[], p_prof integer DEFAULT 0) RETURNS SETOF jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  k text;
  v jsonb;
  x jsonb;
BEGIN
  IF p_prof > 5 OR p_json IS NULL OR jsonb_typeof(p_json) NOT IN ('object', 'array') THEN
    RETURN;
  END IF;
  IF jsonb_typeof(p_json) = 'array' THEN
    FOR x IN SELECT t.e FROM jsonb_array_elements(p_json) WITH ORDINALITY AS t(e, n) WHERE t.n <= 20 LOOP
      RETURN QUERY SELECT * FROM public.fe_e03_valores_por_clave(x, p_claves, p_prof + 1);
    END LOOP;
    RETURN;
  END IF;
  FOR k, v IN SELECT j.key, j.value FROM jsonb_each(p_json) AS j LOOP
    IF regexp_replace(lower(k), '[^a-z0-9]', '', 'g') = ANY (p_claves) AND jsonb_typeof(v) <> 'null' AND v <> '""'::jsonb THEN
      RETURN NEXT v;
    END IF;
    RETURN QUERY SELECT * FROM public.fe_e03_valores_por_clave(v, p_claves, p_prof + 1);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.fe_e03_respuesta_contiene(p_respuesta jsonb, p_claves text[], p_valor text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.fe_e03_valores_por_clave(p_respuesta, p_claves) v WHERE jsonb_typeof(v) IN ('string', 'number') AND btrim(v #>> '{}') = p_valor)
$$;

CREATE OR REPLACE FUNCTION public.fe_e03_recepcion_confirmada(p_respuesta jsonb, p_tipo text, p_establecimiento text, p_punto text, p_numero text) RETURNS boolean
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v jsonb;
  t text;
  v_lote boolean := false;
  v_cdc boolean := false;
  est text[] := ARRAY[]::text[];
  pun text[] := ARRAY[]::text[];
  num text[] := ARRAY[]::text[];
BEGIN
  -- Solo una respuesta íntegra de éxito declarado: raíz objeto con status exactamente "success" y sin la marca de contenido descartado ("truncado" de gateway.ts).
  IF p_respuesta IS NULL OR jsonb_typeof(p_respuesta) <> 'object' OR p_respuesta->'status' IS DISTINCT FROM to_jsonb('success'::text) OR p_respuesta ? 'truncado' THEN
    RETURN false;
  END IF;

  -- Rechazos declarados en cualquier parte reconocible (contador o lista no vacía): no es una recepción.
  FOR v IN SELECT * FROM public.fe_e03_valores_por_clave(p_respuesta, ARRAY['rechazados']) LOOP
    IF (jsonb_typeof(v) = 'array' AND jsonb_array_length(v) > 0) OR (jsonb_typeof(v) = 'number' AND (v #>> '{}')::numeric > 0) THEN
      RETURN false;
    END IF;
  END LOOP;

  -- Lote: cada candidato debe ser texto/número no vacío de a lo sumo 60 caracteres; al menos uno vale como evidencia.
  FOR v IN SELECT * FROM public.fe_e03_valores_por_clave(p_respuesta, ARRAY['lote', 'nrolote', 'numerolote', 'nrodelote', 'numerodelote']) LOOP
    IF jsonb_typeof(v) IN ('string', 'number') THEN
      t := btrim(v #>> '{}');
      IF t = '' OR char_length(t) > 60 THEN RETURN false; END IF;
      v_lote := true;
    END IF;
  END LOOP;

  -- CDC: todo candidato de 44 dígitos debe ser coherente con el documento (tipo, establecimiento, punto, número); uno incoherente contradice.
  FOR v IN SELECT * FROM public.fe_e03_valores_por_clave(p_respuesta, ARRAY['cdc']) LOOP
    IF jsonb_typeof(v) = 'string' AND btrim(v #>> '{}') ~ '^[0-9]{44}$' THEN
      IF NOT public.fe_cdc_coherente(p_tipo, p_establecimiento, p_punto, p_numero, btrim(v #>> '{}')) THEN RETURN false; END IF;
      v_cdc := true;
    END IF;
  END LOOP;

  -- Eco del número: si el gateway devuelve alguno de dEst/dPunExp/dNumDoc, los TRES deben estar presentes e iguales a los del documento (si no, contradice); el eco íntegro es evidencia de recepción.
  SELECT coalesce(array_agg(btrim(x #>> '{}')), ARRAY[]::text[]) INTO est FROM public.fe_e03_valores_por_clave(p_respuesta, ARRAY['dest']) x WHERE jsonb_typeof(x) IN ('string', 'number');
  SELECT coalesce(array_agg(btrim(x #>> '{}')), ARRAY[]::text[]) INTO pun FROM public.fe_e03_valores_por_clave(p_respuesta, ARRAY['dpunexp']) x WHERE jsonb_typeof(x) IN ('string', 'number');
  SELECT coalesce(array_agg(btrim(x #>> '{}')), ARRAY[]::text[]) INTO num FROM public.fe_e03_valores_por_clave(p_respuesta, ARRAY['dnumdoc']) x WHERE jsonb_typeof(x) IN ('string', 'number');
  IF cardinality(est) + cardinality(pun) + cardinality(num) > 0 THEN
    IF cardinality(est) = 0 OR cardinality(pun) = 0 OR cardinality(num) = 0
       OR EXISTS (SELECT 1 FROM unnest(est) a WHERE a <> p_establecimiento) OR EXISTS (SELECT 1 FROM unnest(pun) a WHERE a <> p_punto) OR EXISTS (SELECT 1 FROM unnest(num) a WHERE a <> p_numero) THEN
      RETURN false;
    END IF;

    RETURN true;
  END IF;

  RETURN v_lote OR v_cdc;
END $$;

REVOKE ALL ON FUNCTION public.fe_e03_valores_por_clave(jsonb, text[], integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fe_e03_respuesta_contiene(jsonb, text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fe_e03_recepcion_confirmada(jsonb, text, text, text, text) FROM PUBLIC;

-- ── 1) Inicio: envuelve fe_documento_iniciar_envio y fija la versión/hash EXACTOS del snapshot que esa función devolvió ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fe_e03_iniciar_envio(p_empresa uuid, p_usuario uuid, p_documento uuid, p_confirma_rechazo boolean DEFAULT false)
RETURNS TABLE (o_resultado text, o_payload jsonb, o_numero text, o_tipo text, o_establecimiento text, o_punto text, o_version smallint, o_payload_hash text, o_operacion_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d public.documentos_electronicos%ROWTYPE;
  r record;
  s record;
  v_op uuid;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;

  -- Fila fiscal bloqueada durante toda la transacción: nadie cambia la versión ni el estado entre la selección del snapshot y el evento INICIO.
  SELECT * INTO d FROM public.documentos_electronicos WHERE empresa_id = p_empresa AND id = p_documento FOR UPDATE;
  IF NOT FOUND OR NOT public.sucursal_en_alcance(p_empresa, p_usuario, d.sucursal_id) THEN
    RAISE EXCEPTION 'documento no encontrado' USING ERRCODE = 'P0001', DETAIL = 'NEX:DOCUMENTO_NO_ENCONTRADO';
  END IF;

  -- Todas las validaciones, el cambio a ENVIANDO y los errores del flujo actual son los de la función legada (se propagan tal cual).
  SELECT x.o_resultado, x.o_payload, x.o_numero, x.o_tipo, x.o_establecimiento, x.o_punto INTO r
    FROM public.fe_documento_iniciar_envio(p_empresa, p_usuario, p_documento, p_confirma_rechazo) x;

  -- Si el envío no se inició (p. ej. INDETERMINADO) no hay operación ni evidencia: no se habilita ningún POST.
  IF r.o_resultado IS DISTINCT FROM 'INICIADO' THEN
    RETURN QUERY SELECT r.o_resultado, r.o_payload, r.o_numero, r.o_tipo, r.o_establecimiento, r.o_punto, NULL::smallint, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT sol.version, sol.payload_hash, sol.payload INTO s FROM public.documento_electronico_solicitudes sol
   WHERE sol.empresa_id = p_empresa AND sol.documento_id = p_documento ORDER BY sol.version DESC LIMIT 1;
  IF NOT FOUND OR s.payload IS DISTINCT FROM r.o_payload THEN
    RAISE EXCEPTION 'la solicitud devuelta por el inicio de envío no coincide con la versión registrada' USING ERRCODE = 'P0001', DETAIL = 'NEX:SOLICITUD_NO_COINCIDE';
  END IF;

  v_op := gen_random_uuid();
  INSERT INTO public.documento_electronico_envio_evidencias (id, empresa_id, documento_id, version, operacion_id, tipo_evento, respuesta_truncada, actor_id)
  VALUES (v_op, p_empresa, p_documento, s.version, v_op, 'INICIO', false, p_usuario);

  RETURN QUERY SELECT r.o_resultado, r.o_payload, r.o_numero, r.o_tipo, r.o_establecimiento, r.o_punto, s.version, s.payload_hash, v_op;
END $$;

-- ── 2) Evento: POST pretendido (antes del fetch), respuesta HTTP saneada, ausencia comprobada de POST o error de transmisión ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fe_e03_registrar_evento(
  p_empresa uuid, p_usuario uuid, p_documento uuid, p_operacion uuid, p_tipo_evento text,
  p_nro_post smallint DEFAULT NULL, p_solicitud_http_texto text DEFAULT NULL, p_http_status integer DEFAULT NULL,
  p_respuesta jsonb DEFAULT NULL, p_respuesta_truncada boolean DEFAULT false, p_mensaje text DEFAULT NULL)
RETURNS TABLE (o_evento_id uuid, o_nro_post smallint, o_solicitud_sha256 text, o_solicitud_bytes integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d public.documentos_electronicos%ROWTYPE;
  v_raiz public.documento_electronico_envio_evidencias%ROWTYPE;
  v_ultima uuid;
  v_snapshot jsonb;
  v_nro smallint;
  v_texto bytea;
  v_sha text;
  v_bytes integer;
  v_mensaje text := left(nullif(btrim(coalesce(p_mensaje, '')), ''), 500);
  v_id uuid;
  v_resp jsonb;
  v_resp_txt text;
  v_resp_bytes integer;
  v_resp_sha text;
  v_redactado boolean := false;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_tipo_evento IS NULL OR p_tipo_evento NOT IN ('POST_INTENTADO', 'HTTP_RESPUESTA', 'NO_TRANSMITIDO', 'ERROR_TRANSMISION') THEN
    RAISE EXCEPTION 'tipo de evento no válido (INICIO y CIERRE solo los registran las funciones de inicio y cierre)' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_INVALIDO';
  END IF;

  SELECT * INTO d FROM public.documentos_electronicos WHERE empresa_id = p_empresa AND id = p_documento FOR UPDATE;
  IF NOT FOUND OR NOT public.sucursal_en_alcance(p_empresa, p_usuario, d.sucursal_id) THEN
    RAISE EXCEPTION 'documento no encontrado' USING ERRCODE = 'P0001', DETAIL = 'NEX:DOCUMENTO_NO_ENCONTRADO';
  END IF;

  -- La operación debe existir para ESTE documento y empresa, ser la vigente (la última iniciada) y no estar cerrada; el documento sigue en envío.
  SELECT * INTO v_raiz FROM public.documento_electronico_envio_evidencias WHERE empresa_id = p_empresa AND documento_id = p_documento AND id = p_operacion AND tipo_evento = 'INICIO';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'la operación de envío no existe para este documento' USING ERRCODE = 'P0001', DETAIL = 'NEX:OPERACION_NO_ENCONTRADA';
  END IF;
  SELECT e.id INTO v_ultima FROM public.documento_electronico_envio_evidencias e WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.tipo_evento = 'INICIO' ORDER BY e.orden DESC LIMIT 1;
  IF v_ultima IS DISTINCT FROM p_operacion THEN
    RAISE EXCEPTION 'la operación de envío ya no está vigente' USING ERRCODE = 'P0001', DETAIL = 'NEX:OPERACION_NO_VIGENTE';
  END IF;
  IF EXISTS (SELECT 1 FROM public.documento_electronico_envio_evidencias e WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.operacion_id = p_operacion AND e.tipo_evento = 'CIERRE') THEN
    RAISE EXCEPTION 'la operación de envío ya está cerrada' USING ERRCODE = 'P0001', DETAIL = 'NEX:OPERACION_CERRADA';
  END IF;
  IF d.estado_local <> 'ENVIANDO' THEN
    RAISE EXCEPTION 'el documento no está en envío' USING ERRCODE = 'P0001', DETAIL = 'NEX:ENVIO_NO_INICIADO';
  END IF;

  -- NO_TRANSMITIDO es terminal (E03-A1-F001): ningún POST, respuesta, error ni segundo NO_TRANSMITIDO después de él; solo cabe el CIERRE. La fila del documento está bloqueada, así que la comprobación es serial.
  IF EXISTS (SELECT 1 FROM public.documento_electronico_envio_evidencias e WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.operacion_id = p_operacion AND e.tipo_evento = 'NO_TRANSMITIDO') THEN
    RAISE EXCEPTION 'la operación de envío ya se declaró NO TRANSMITIDA: solo admite el cierre' USING ERRCODE = 'P0001', DETAIL = 'NEX:OPERACION_NO_TRANSMITIDA';
  END IF;

  -- Nunca se almacenan credenciales ni cabeceras de autorización (E03-A1-F004): se redactan claves y valores reconocibles, también en el motivo; un residuo se rechaza sin repetir el valor.
  IF v_mensaje IS NOT NULL THEN
    v_resp_txt := public.fe_e03_redactar_texto(v_mensaje);
    IF v_resp_txt IS DISTINCT FROM v_mensaje THEN v_redactado := true; END IF;
    v_mensaje := nullif(v_resp_txt, '');
  END IF;
  IF p_respuesta IS NOT NULL THEN
    v_resp_txt := public.fe_e03_redactar_texto(p_respuesta::text);
    IF v_resp_txt IS DISTINCT FROM p_respuesta::text THEN v_redactado := true; END IF;
    IF public.fe_e03_secreto_residual(v_resp_txt) THEN
      RAISE EXCEPTION 'la respuesta contiene credenciales que no se pudieron redactar: no se registra' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVIDENCIA_CON_CREDENCIALES';
    END IF;
    v_resp := v_resp_txt::jsonb;
  END IF;
  IF v_mensaje IS NOT NULL AND public.fe_e03_secreto_residual(v_mensaje) THEN
    RAISE EXCEPTION 'el motivo contiene credenciales que no se pudieron redactar: no se registra' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVIDENCIA_CON_CREDENCIALES';
  END IF;

  IF p_tipo_evento = 'POST_INTENTADO' THEN
    IF p_solicitud_http_texto IS NULL OR p_http_status IS NOT NULL OR p_respuesta IS NOT NULL OR p_nro_post IS NOT NULL THEN
      RAISE EXCEPTION 'POST_INTENTADO exige el texto HTTP exacto y no admite número, estado ni respuesta (el número lo asigna el servidor)' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_INVALIDO';
    END IF;
    -- Un POST nuevo solo cuando todos los anteriores de la operación ya tienen su salida (respuesta o error).
    IF (SELECT count(*) FROM public.documento_electronico_envio_evidencias e WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.operacion_id = p_operacion AND e.tipo_evento = 'POST_INTENTADO')
       <> (SELECT count(*) FROM public.documento_electronico_envio_evidencias e WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.operacion_id = p_operacion AND e.tipo_evento IN ('HTTP_RESPUESTA', 'ERROR_TRANSMISION')) THEN
      RAISE EXCEPTION 'hay un POST de esta operación sin respuesta ni error registrado' USING ERRCODE = 'P0001', DETAIL = 'NEX:POST_PENDIENTE';
    END IF;
    SELECT coalesce(max(e.nro_post), 0) + 1 INTO v_nro FROM public.documento_electronico_envio_evidencias e
     WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.operacion_id = p_operacion AND e.tipo_evento = 'POST_INTENTADO';
    IF v_nro > 10 THEN
      RAISE EXCEPTION 'demasiados POST en una misma operación de envío' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_INVALIDO';
    END IF;

    -- El cuerpo debe ser JSON válido y estructuralmente IGUAL al snapshot de la versión de la operación (no se acepta contenido dictado por el navegador).
    SELECT sol.payload INTO v_snapshot FROM public.documento_electronico_solicitudes sol WHERE sol.empresa_id = p_empresa AND sol.documento_id = p_documento AND sol.version = v_raiz.version;
    BEGIN
      IF p_solicitud_http_texto::jsonb IS DISTINCT FROM v_snapshot THEN
        RAISE EXCEPTION 'el cuerpo HTTP no coincide con la solicitud registrada de la versión %', v_raiz.version USING ERRCODE = 'P0001', DETAIL = 'NEX:CUERPO_NO_COINCIDE';
      END IF;
    EXCEPTION WHEN invalid_text_representation OR data_exception THEN
      RAISE EXCEPTION 'el cuerpo HTTP no es JSON válido' USING ERRCODE = 'P0001', DETAIL = 'NEX:CUERPO_NO_COINCIDE';
    END;

    -- Hash y tamaño sobre los bytes UTF-8 efectivos, calculados aquí (no se confía en valores del llamador).
    v_texto := convert_to(p_solicitud_http_texto, 'UTF8');
    v_bytes := octet_length(v_texto);
    v_sha := encode(sha256(v_texto), 'hex');

    INSERT INTO public.documento_electronico_envio_evidencias (empresa_id, documento_id, version, operacion_id, tipo_evento, nro_post, solicitud_http_texto, solicitud_sha256, solicitud_bytes, respuesta_truncada, actor_id)
    VALUES (p_empresa, p_documento, v_raiz.version, p_operacion, 'POST_INTENTADO', v_nro, p_solicitud_http_texto, v_sha, v_bytes, false, p_usuario)
    RETURNING id INTO v_id;

    RETURN QUERY SELECT v_id, v_nro, v_sha, v_bytes;
    RETURN;
  END IF;

  IF p_solicitud_http_texto IS NOT NULL THEN
    RAISE EXCEPTION 'solo POST_INTENTADO lleva el texto HTTP de la solicitud' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_INVALIDO';
  END IF;

  IF p_tipo_evento = 'NO_TRANSMITIDO' THEN
    -- Solo se afirma "no transmitido" si la operación nunca intentó un POST.
    IF EXISTS (SELECT 1 FROM public.documento_electronico_envio_evidencias e WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.operacion_id = p_operacion AND e.tipo_evento = 'POST_INTENTADO') THEN
      RAISE EXCEPTION 'NO_TRANSMITIDO no es válido: la operación ya intentó un POST' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_CONTRADICTORIO';
    END IF;
    IF v_mensaje IS NULL OR p_nro_post IS NOT NULL OR p_http_status IS NOT NULL OR p_respuesta IS NOT NULL THEN
      RAISE EXCEPTION 'NO_TRANSMITIDO exige un motivo y no admite número de POST, estado ni respuesta' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_INVALIDO';
    END IF;

    INSERT INTO public.documento_electronico_envio_evidencias (empresa_id, documento_id, version, operacion_id, tipo_evento, mensaje, respuesta_truncada, actor_id)
    VALUES (p_empresa, p_documento, v_raiz.version, p_operacion, 'NO_TRANSMITIDO', v_mensaje, false, p_usuario)
    RETURNING id INTO v_id;

    RETURN QUERY SELECT v_id, NULL::smallint, NULL::text, NULL::integer;
    RETURN;
  END IF;

  -- HTTP_RESPUESTA / ERROR_TRANSMISION: salida de un POST ya registrado de esta operación, una sola vez.
  IF p_nro_post IS NULL OR NOT EXISTS (SELECT 1 FROM public.documento_electronico_envio_evidencias e
                                        WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.operacion_id = p_operacion AND e.tipo_evento = 'POST_INTENTADO' AND e.nro_post = p_nro_post) THEN
    RAISE EXCEPTION 'el POST indicado no existe en esta operación' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_CONTRADICTORIO';
  END IF;
  IF EXISTS (SELECT 1 FROM public.documento_electronico_envio_evidencias e
              WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.operacion_id = p_operacion AND e.tipo_evento IN ('HTTP_RESPUESTA', 'ERROR_TRANSMISION') AND e.nro_post = p_nro_post) THEN
    RAISE EXCEPTION 'el POST indicado ya tiene su salida registrada' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_CONTRADICTORIO';
  END IF;

  IF p_tipo_evento = 'HTTP_RESPUESTA' THEN
    IF p_http_status IS NULL OR p_http_status NOT BETWEEN 100 AND 599 THEN
      RAISE EXCEPTION 'HTTP_RESPUESTA exige un estado HTTP válido' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_INVALIDO';
    END IF;
    IF p_respuesta IS NOT NULL AND pg_column_size(p_respuesta) >= 65536 THEN
      RAISE EXCEPTION 'la respuesta saneada supera el límite: envíela truncada (respuesta_truncada = true); el hash y el tamaño los calcula el banco' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_INVALIDO';
    END IF;
    IF v_resp IS NULL AND p_respuesta_truncada THEN
      RAISE EXCEPTION 'una respuesta truncada exige el objeto parcial saneado' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_INVALIDO';
    END IF;
    IF v_redactado THEN
      v_mensaje := left(coalesce(v_mensaje || ' · ', '') || 'respuesta con credenciales redactadas', 500);
    END IF;
    -- Hash y bytes: calculados AQUÍ sobre el objeto saneado persistido (texto jsonb en UTF-8); no se aceptan valores del llamador ni se presentan como hash del cuerpo HTTP original.
    IF v_resp IS NOT NULL THEN
      v_resp_bytes := octet_length(convert_to(v_resp::text, 'UTF8'));
      v_resp_sha := encode(sha256(convert_to(v_resp::text, 'UTF8')), 'hex');
    END IF;

    INSERT INTO public.documento_electronico_envio_evidencias (empresa_id, documento_id, version, operacion_id, tipo_evento, nro_post, http_status, respuesta_saneada, respuesta_truncada, respuesta_bytes, respuesta_sha256, mensaje, actor_id)
    VALUES (p_empresa, p_documento, v_raiz.version, p_operacion, 'HTTP_RESPUESTA', p_nro_post, p_http_status, v_resp, coalesce(p_respuesta_truncada, false), v_resp_bytes, v_resp_sha, v_mensaje, p_usuario)
    RETURNING id INTO v_id;
  ELSE
    -- ERROR_TRANSMISION (TIMEOUT / RED después de iniciar el POST): sin respuesta ni estado; el motivo es obligatorio.
    IF v_mensaje IS NULL OR p_http_status IS NOT NULL OR p_respuesta IS NOT NULL THEN
      RAISE EXCEPTION 'ERROR_TRANSMISION exige un motivo y no admite estado ni respuesta' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_INVALIDO';
    END IF;

    INSERT INTO public.documento_electronico_envio_evidencias (empresa_id, documento_id, version, operacion_id, tipo_evento, nro_post, mensaje, respuesta_truncada, actor_id)
    VALUES (p_empresa, p_documento, v_raiz.version, p_operacion, 'ERROR_TRANSMISION', p_nro_post, v_mensaje, false, p_usuario)
    RETURNING id INTO v_id;
  END IF;

  RETURN QUERY SELECT v_id, p_nro_post, NULL::text, NULL::integer;
END $$;

-- ── 3) Cierre: envuelve fe_documento_registrar_envio y enlaza el intento ENVIO realmente insertado, en la misma transacción; la repetición de la misma operación no crea otro intento ─────────
CREATE OR REPLACE FUNCTION public.fe_e03_cerrar_envio(
  p_empresa uuid, p_usuario uuid, p_documento uuid, p_operacion uuid,
  p_fase text, p_resultado text, p_estado_local text, p_error_tipo text, p_http integer, p_request_id text,
  p_estado_gateway text, p_mensaje text, p_lote text, p_cdc text, p_cdc_informado text, p_respuesta jsonb)
RETURNS TABLE (o_estado_local text, o_intento_id uuid, o_reutilizado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d public.documentos_electronicos%ROWTYPE;
  v_raiz public.documento_electronico_envio_evidencias%ROWTYPE;
  v_cierre public.documento_electronico_envio_evidencias%ROWTYPE;
  v_ultima uuid;
  v_antes uuid[];
  v_nuevos uuid[];
  v_estado text;
  v_n_posts integer;
  v_n_salidas integer;
  v_ultimo_post smallint;
  v_salida_tipo text;
  v_salida_http integer;
  v_no boolean;
  v_salida_resp jsonb;
  v_salida_trunc boolean;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO d FROM public.documentos_electronicos WHERE empresa_id = p_empresa AND id = p_documento FOR UPDATE;
  IF NOT FOUND OR NOT public.sucursal_en_alcance(p_empresa, p_usuario, d.sucursal_id) THEN
    RAISE EXCEPTION 'documento no encontrado' USING ERRCODE = 'P0001', DETAIL = 'NEX:DOCUMENTO_NO_ENCONTRADO';
  END IF;

  SELECT * INTO v_raiz FROM public.documento_electronico_envio_evidencias WHERE empresa_id = p_empresa AND documento_id = p_documento AND id = p_operacion AND tipo_evento = 'INICIO';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'la operación de envío no existe para este documento' USING ERRCODE = 'P0001', DETAIL = 'NEX:OPERACION_NO_ENCONTRADA';
  END IF;

  -- Confirmación repetida de la MISMA operación: se devuelve el cierre ya persistido (sin segundo intento, sin segundo evento, sin tocar el documento).
  SELECT * INTO v_cierre FROM public.documento_electronico_envio_evidencias WHERE empresa_id = p_empresa AND documento_id = p_documento AND operacion_id = p_operacion AND tipo_evento = 'CIERRE';
  IF FOUND THEN
    RETURN QUERY SELECT d.estado_local, v_cierre.intento_id, true;
    RETURN;
  END IF;

  SELECT e.id INTO v_ultima FROM public.documento_electronico_envio_evidencias e WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.tipo_evento = 'INICIO' ORDER BY e.orden DESC LIMIT 1;
  IF v_ultima IS DISTINCT FROM p_operacion THEN
    RAISE EXCEPTION 'la operación de envío ya no está vigente' USING ERRCODE = 'P0001', DETAIL = 'NEX:OPERACION_NO_VIGENTE';
  END IF;

  -- Coherencia del cierre con la evidencia (E03-A1-F002). Cadena de POST de la operación: cada POST numerado tiene a lo sumo una salida (HTTP_RESPUESTA o ERROR_TRANSMISION); solo cuenta la salida del ÚLTIMO POST.
  SELECT count(*) INTO v_n_posts FROM public.documento_electronico_envio_evidencias e
   WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.operacion_id = p_operacion AND e.tipo_evento = 'POST_INTENTADO';
  SELECT count(*) INTO v_n_salidas FROM public.documento_electronico_envio_evidencias e
   WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.operacion_id = p_operacion AND e.tipo_evento IN ('HTTP_RESPUESTA', 'ERROR_TRANSMISION');
  v_no := EXISTS (SELECT 1 FROM public.documento_electronico_envio_evidencias e WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.operacion_id = p_operacion AND e.tipo_evento = 'NO_TRANSMITIDO');
  SELECT max(e.nro_post) INTO v_ultimo_post FROM public.documento_electronico_envio_evidencias e
   WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.operacion_id = p_operacion AND e.tipo_evento = 'POST_INTENTADO';
  SELECT e.tipo_evento, e.http_status, e.respuesta_saneada, e.respuesta_truncada INTO v_salida_tipo, v_salida_http, v_salida_resp, v_salida_trunc FROM public.documento_electronico_envio_evidencias e
   WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.operacion_id = p_operacion AND e.tipo_evento IN ('HTTP_RESPUESTA', 'ERROR_TRANSMISION') AND e.nro_post = v_ultimo_post;

  IF p_resultado = 'OK' THEN
    -- Éxito: solo con la respuesta HTTP 2xx del ÚLTIMO POST (nunca con la de un POST anterior ni con un POST sin salida) y con el mismo estado HTTP que se cierra.
    IF p_fase <> 'TRANSMISION' OR v_n_posts = 0 OR v_n_posts <> v_n_salidas OR v_salida_tipo IS DISTINCT FROM 'HTTP_RESPUESTA'
       OR v_salida_http NOT BETWEEN 200 AND 299 OR p_http IS DISTINCT FROM v_salida_http THEN
      RAISE EXCEPTION 'el cierre OK no corresponde a la respuesta HTTP 2xx del último POST registrado' USING ERRCODE = 'P0001', DETAIL = 'NEX:CIERRE_CONTRADICTORIO';
    END IF;
    -- Un 2xx no basta (F002-R02): la respuesta saneada del último POST debe declarar éxito Y traer evidencia específica de recepción (lote válido, CDC coherente o eco íntegro del número), sin contradicciones, y no estar truncada.
    IF v_salida_trunc OR NOT public.fe_e03_recepcion_confirmada(v_salida_resp, d.tipo, d.establecimiento, d.punto_expedicion, d.numero) THEN
      RAISE EXCEPTION 'la respuesta del último POST no confirma la recepción del documento (sin éxito declarado o sin lote, CDC ni número que lo identifiquen)' USING ERRCODE = 'P0001', DETAIL = 'NEX:CIERRE_CONTRADICTORIO';
    END IF;
    -- Los datos de recepción que se cierran (lote, CDC) deben provenir de esa misma respuesta; nada se inventa.
    IF (nullif(btrim(coalesce(p_lote, '')), '') IS NOT NULL AND NOT public.fe_e03_respuesta_contiene(v_salida_resp, ARRAY['lote', 'nrolote', 'numerolote', 'nrodelote', 'numerodelote'], btrim(p_lote)))
       OR (p_cdc_informado IS NOT NULL AND NOT public.fe_e03_respuesta_contiene(v_salida_resp, ARRAY['cdc'], p_cdc_informado))
       OR (p_cdc IS NOT NULL AND NOT public.fe_e03_respuesta_contiene(v_salida_resp, ARRAY['cdc'], p_cdc)) THEN
      RAISE EXCEPTION 'el lote o el CDC del cierre no figuran en la respuesta registrada del último POST' USING ERRCODE = 'P0001', DETAIL = 'NEX:CIERRE_CONTRADICTORIO';
    END IF;
  ELSIF p_fase = 'AUTENTICACION' THEN
    -- Falla de autenticación: o nada se transmitió (NO_TRANSMITIDO comprobado, sin POST) o el último POST ya tiene su respuesta HTTP (p. ej. token rechazado) y la renovación falló. Nunca con un POST pendiente o con error de red.
    IF NOT ((v_n_posts = 0 AND v_no) OR (v_n_posts > 0 AND v_n_posts = v_n_salidas AND v_salida_tipo = 'HTTP_RESPUESTA')) THEN
      RAISE EXCEPTION 'el cierre por autenticación no corresponde a la evidencia registrada (NO_TRANSMITIDO o respuesta del último POST)' USING ERRCODE = 'P0001', DETAIL = 'NEX:CIERRE_CONTRADICTORIO';
    END IF;
  ELSE
    -- Fase de transmisión no exitosa: exige POST registrado y NO puede haber sido declarada NO_TRANSMITIDO.
    IF p_fase <> 'TRANSMISION' OR v_n_posts = 0 OR v_no THEN
      RAISE EXCEPTION 'no hay POST registrado para cerrar una fase de transmisión' USING ERRCODE = 'P0001', DETAIL = 'NEX:CIERRE_CONTRADICTORIO';
    END IF;
    IF v_n_salidas < v_n_posts THEN
      -- Último POST sin salida conocida: solo incertidumbre explícita (ENVIO_INDETERMINADO, sin estado HTTP inventado) y nunca un error "cierto".
      IF p_estado_local <> 'ENVIO_INDETERMINADO' OR p_http IS NOT NULL THEN
        RAISE EXCEPTION 'con un POST sin salida registrada el cierre solo puede ser ENVIO_INDETERMINADO sin estado HTTP' USING ERRCODE = 'P0001', DETAIL = 'NEX:CIERRE_CONTRADICTORIO';
      END IF;
    ELSIF v_salida_tipo = 'ERROR_TRANSMISION' THEN
      IF p_estado_local <> 'ENVIO_INDETERMINADO' OR p_http IS NOT NULL OR p_resultado NOT IN ('TIMEOUT', 'RED') THEN
        RAISE EXCEPTION 'el error de transmisión del último POST solo cierra como TIMEOUT/RED, ENVIO_INDETERMINADO y sin estado HTTP' USING ERRCODE = 'P0001', DETAIL = 'NEX:CIERRE_CONTRADICTORIO';
      END IF;
    ELSE
      -- Último POST con respuesta HTTP: el cierre debe reflejarla (mismo estado HTTP) y no declararse como error de red.
      IF p_http IS DISTINCT FROM v_salida_http OR p_resultado NOT IN ('ERROR_HTTP', 'RESPUESTA_INVALIDA') THEN
        RAISE EXCEPTION 'el cierre no coincide con la respuesta HTTP del último POST registrado' USING ERRCODE = 'P0001', DETAIL = 'NEX:CIERRE_CONTRADICTORIO';
      END IF;
    END IF;
  END IF;

  -- Intentos ENVIO existentes ANTES del cierre (la fila del documento está bloqueada: nadie inserta intentos de este documento en paralelo).
  SELECT coalesce(array_agg(i.id), ARRAY[]::uuid[]) INTO v_antes FROM public.documento_electronico_intentos i
   WHERE i.empresa_id = p_empresa AND i.documento_id = p_documento AND i.tipo = 'ENVIO';

  -- Estados, CDC, lote, validaciones y errores: los de la función legada (se propagan tal cual; si falla, no queda evidencia de cierre).
  v_estado := public.fe_documento_registrar_envio(p_empresa, p_usuario, p_documento, p_fase, p_resultado, p_estado_local, p_error_tipo, p_http, p_request_id, p_estado_gateway, p_mensaje, p_lote, p_cdc, p_cdc_informado, p_respuesta);

  SELECT coalesce(array_agg(i.id), ARRAY[]::uuid[]) INTO v_nuevos FROM public.documento_electronico_intentos i
   WHERE i.empresa_id = p_empresa AND i.documento_id = p_documento AND i.tipo = 'ENVIO' AND i.id <> ALL (v_antes);
  IF cardinality(v_nuevos) <> 1 THEN
    RAISE EXCEPTION 'no se pudo identificar el intento de envío registrado' USING ERRCODE = 'P0001', DETAIL = 'NEX:INTENTO_NO_IDENTIFICADO';
  END IF;

  INSERT INTO public.documento_electronico_envio_evidencias (empresa_id, documento_id, version, operacion_id, tipo_evento, http_status, intento_id, respuesta_truncada, actor_id)
  VALUES (p_empresa, p_documento, v_raiz.version, p_operacion, 'CIERRE', CASE WHEN p_http BETWEEN 100 AND 599 THEN p_http END, v_nuevos[1], false, p_usuario);

  RETURN QUERY SELECT v_estado, v_nuevos[1], false;
END $$;

COMMENT ON FUNCTION public.fe_e03_iniciar_envio(uuid, uuid, uuid, boolean) IS 'NEX-072: envuelve fe_documento_iniciar_envio y registra el evento INICIO con la versión/hash exactos del snapshot devuelto.';
COMMENT ON FUNCTION public.fe_e03_registrar_evento(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, text) IS 'NEX-072: registra POST_INTENTADO (antes del fetch), HTTP_RESPUESTA, NO_TRANSMITIDO o ERROR_TRANSMISION de la operación vigente. No cambia estados fiscales.';
COMMENT ON FUNCTION public.fe_e03_cerrar_envio(uuid, uuid, uuid, uuid, text, text, text, text, integer, text, text, text, text, text, text, jsonb) IS 'NEX-072: envuelve fe_documento_registrar_envio y registra CIERRE enlazado al intento insertado; idempotente por operación.';

-- ── Privilegios del rol de la aplicación (el envoltorio nex_aplicar_grants_runtime() descubre este ayudante y lo reaplica) ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_facturacion_e03() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;
  -- Sin DML directo: la aplicación solo LEE la evidencia (la futura API aplicará el alcance de la sesión) y escribe únicamente por las funciones.
  REVOKE ALL ON public.documento_electronico_envio_evidencias FROM nexit_runtime;
  GRANT SELECT ON public.documento_electronico_envio_evidencias TO nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_iniciar_envio(uuid, uuid, uuid, boolean) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_registrar_evento(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_cerrar_envio(uuid, uuid, uuid, uuid, text, text, text, text, integer, text, text, text, text, text, text, jsonb) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.fe_e03_iniciar_envio(uuid, uuid, uuid, boolean) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_e03_registrar_evento(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, text) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_e03_cerrar_envio(uuid, uuid, uuid, uuid, text, text, text, text, integer, text, text, text, text, text, text, jsonb) TO nexit_runtime;
END $$;
REVOKE ALL ON FUNCTION public.nex_aplicar_grants_facturacion_e03() FROM PUBLIC;
SELECT public.nex_aplicar_grants_facturacion_e03();
