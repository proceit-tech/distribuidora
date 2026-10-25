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
CREATE UNIQUE INDEX envio_evidencias_intento_uk ON public.documento_electronico_envio_evidencias (empresa_id, documento_id, intento_id) WHERE intento_id IS NOT NULL;

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
    IF NEW.tipo_evento <> 'CIERRE' AND EXISTS (SELECT 1 FROM public.documento_electronico_envio_evidencias c
                                                WHERE c.empresa_id = NEW.empresa_id AND c.documento_id = NEW.documento_id AND c.operacion_id = NEW.operacion_id AND c.tipo_evento = 'CIERRE') THEN
      RAISE EXCEPTION 'la operación de envío ya está cerrada' USING ERRCODE = 'P0001', DETAIL = 'NEX:OPERACION_CERRADA';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER envio_evidencias_guarda_trg BEFORE INSERT ON public.documento_electronico_envio_evidencias
  FOR EACH ROW EXECUTE FUNCTION public.fe_e03_evidencia_guarda();

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
  p_respuesta jsonb DEFAULT NULL, p_respuesta_truncada boolean DEFAULT false, p_respuesta_bytes integer DEFAULT NULL, p_respuesta_sha256 text DEFAULT NULL, p_mensaje text DEFAULT NULL)
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

  -- Nunca se almacenan credenciales ni cabeceras de autorización.
  IF (p_respuesta IS NOT NULL AND p_respuesta::text ~* '"(authorization|password|passwd|token|access_token|refresh_token|secret|api_key|apikey)"\s*:')
     OR (v_mensaje IS NOT NULL AND v_mensaje ~* '(bearer\s+[a-z0-9._~+/=-]{10,}|authorization\s*:)') THEN
    RAISE EXCEPTION 'la evidencia contiene credenciales o cabeceras de autorización: no se registra' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVIDENCIA_CON_CREDENCIALES';
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
      RAISE EXCEPTION 'la respuesta saneada supera el límite: envíela truncada (respuesta_truncada) con su hash y tamaño' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_INVALIDO';
    END IF;
    IF (p_respuesta_sha256 IS NOT NULL AND p_respuesta_sha256 !~ '^[0-9a-f]{64}$') OR (p_respuesta_bytes IS NOT NULL AND p_respuesta_bytes < 0) THEN
      RAISE EXCEPTION 'hash o tamaño de respuesta no válidos' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_INVALIDO';
    END IF;

    INSERT INTO public.documento_electronico_envio_evidencias (empresa_id, documento_id, version, operacion_id, tipo_evento, nro_post, http_status, respuesta_saneada, respuesta_truncada, respuesta_bytes, respuesta_sha256, mensaje, actor_id)
    VALUES (p_empresa, p_documento, v_raiz.version, p_operacion, 'HTTP_RESPUESTA', p_nro_post, p_http_status, p_respuesta, coalesce(p_respuesta_truncada, false), p_respuesta_bytes, p_respuesta_sha256, v_mensaje, p_usuario)
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

  -- Coherencia mínima con la evidencia: un envío OK exige una respuesta HTTP registrada; la fase TRANSMISION exige un POST registrado.
  IF p_resultado = 'OK' AND NOT EXISTS (SELECT 1 FROM public.documento_electronico_envio_evidencias e WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.operacion_id = p_operacion AND e.tipo_evento = 'HTTP_RESPUESTA') THEN
    RAISE EXCEPTION 'no hay respuesta HTTP registrada para cerrar el envío como OK' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_CONTRADICTORIO';
  END IF;
  IF p_fase = 'TRANSMISION' AND NOT EXISTS (SELECT 1 FROM public.documento_electronico_envio_evidencias e WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.operacion_id = p_operacion AND e.tipo_evento = 'POST_INTENTADO') THEN
    RAISE EXCEPTION 'no hay POST registrado para cerrar una fase de transmisión' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_CONTRADICTORIO';
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
COMMENT ON FUNCTION public.fe_e03_registrar_evento(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, integer, text, text) IS 'NEX-072: registra POST_INTENTADO (antes del fetch), HTTP_RESPUESTA, NO_TRANSMITIDO o ERROR_TRANSMISION de la operación vigente. No cambia estados fiscales.';
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
  REVOKE ALL ON FUNCTION public.fe_e03_registrar_evento(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, integer, text, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_cerrar_envio(uuid, uuid, uuid, uuid, text, text, text, text, integer, text, text, text, text, text, text, jsonb) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.fe_e03_iniciar_envio(uuid, uuid, uuid, boolean) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_e03_registrar_evento(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, integer, text, text) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_e03_cerrar_envio(uuid, uuid, uuid, uuid, text, text, text, text, integer, text, text, text, text, text, text, jsonb) TO nexit_runtime;
END $$;
REVOKE ALL ON FUNCTION public.nex_aplicar_grants_facturacion_e03() FROM PUBLIC;
SELECT public.nex_aplicar_grants_facturacion_e03();
