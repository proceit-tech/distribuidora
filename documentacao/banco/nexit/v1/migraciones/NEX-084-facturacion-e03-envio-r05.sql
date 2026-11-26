-- NEX-084 — PRO-312-R02 / Lote A: contrato SQL de envío E03 «R05» (operación correlacionada, evidencia completa de cada POST, proyección acotada, cierre derivado de la evidencia,
-- salidas tardías y reversión coordinada). AUTORÍA SOLAMENTE: este archivo no se aplicó a ninguna base por decisión de esta orden; la aplicación en la VM es decisión del responsable.
--
-- Incremental y ADITIVA: NO edita NEX-001…083. No toca la aplicación vigente (lib/facturacion/envio.ts sigue usando fe_documento_iniciar_envio + fe_documento_registrar_envio_r05, intactas),
-- FE/NCE, CDC opaco (NEX-080), stock, KuDE ni la consulta manual o automática. No hay backfill: ninguna evidencia histórica se fabrica.
--
-- Decisiones del responsable incorporadas (orden ORD-CLAUDE-NEXIT-PRO-312-R02-NEX-084-2026-11-24):
--   D8-B      cuerpo HTTP ÍNTEGRO de cada POST: <= 1 MiB en la evidencia de NEX-072 (POST_INTENTADO, sin cambios); > 1 MiB en la tabla incremental
--             documento_electronico_envio_posts_grandes_r05 (texto íntegro + SHA-256 y bytes UTF-8 calculados aquí). Sin hash-only, sin ruta directa por tamaño, sin reducir las 999 líneas.
--             Límite DEFENSIVO PROVISIONAL de 8 MiB (8388608 bytes) [R02-C01 F004]: un texto HTTP > 8 MiB se rechaza ANTES del fetch (NEX:SOLICITUD_EXCEDE_LIMITE_DEFENSIVO) y no se
--             transmite. NO está demostrado que cubra toda factura válida: pg_column_size(payload) < 262144 (NEX-048) mide el almacenamiento jsonb (TOAST/compresión) y NO acota el texto
--             JSON serializado; además el texto canónico de jsonb no es el texto de JSON.stringify de la aplicación. Bloqueos del Lote B (gate B): compatibilidad con facturas válidas de
--             999 ítems no demostrada; tamaño canónico jsonb distinto de la serialización JavaScript; precisión numérica del snapshot histórico (D6-c) pendiente de verificación. Aquí no se
--             mide nada ni se amplía el límite. D8-B se preserva: texto íntegro, sin truncamiento, sin hash-only y sin vía alternativa por tamaño.
--   D-C02-2-A evidencia insuficiente después de un POST posible → ENVIO_INDETERMINADO con motivo seguro, sin segundo POST, sin cierre paralelo; reconciliación posterior por consulta en la
--             misma cuenta. El CDC nunca es condición de ACK; un CDC con forma de credencial se omite (solo ese valor) sin invalidar la clasificación.
--   D4/D5 sin cambios (ventana de 2 minutos de NEX-062 y recuperación manual). D6: la igualdad del cuerpo con el snapshot la decide el banco. D7: sin hash del cuerpo bruto de respuesta ni HMAC.
--
-- Corrección R02-C01 (auditoría AUD-CHATGPT-NEXIT-PRO-312-R02-NEX-084-2026-11-25, solo F001–F005; archivo aún no aplicado en ninguna base):
--   F001 paridad de P: token_invalido coherente con el HTTP (401 → true; fuera de 4xx → false), autenticación OK por HTTP = 200 exacto, renovación y POST 2 solo tras un POST 1 4xx
--        clasificado R-01; identidad estrictamente tipada contra el snapshot transmitido (serie TEXTO/NULO/AUSENTE como seriePayload); n_entradas 0..50; alias de lote en enum; cotejo
--        ampliado (status, ecos, contador, lote textual o entero seguro, CDC transportable, listas propias) sin declarar cotejado lo que el saneado, el truncamiento o jsonb perdieron.
--   F002 idempotencia: una salida normal se reutiliza solo con equivalencia semántica completa (incluida la P canónica, su motivo, regla y cotejo); la salida tardía distingue
--        SIN_PROYECCION / PROYECCION_DESCARTADA (motivo seguro) / PROYECCION_VALIDADA / PROYECCION_COTEJADA_PARCIAL y su huella las incluye.
--   F003 recuperación: cierre con retorno extendido y lectura fe_e03_estado_operacion_r05 (sin testigo, hash ni payload); verificación de integridad de datos (solo lectura).
--   R02-C02: R-C01-01 token 4xx cotejado sobre «message» (fe_e03_r05_token_mensaje); R-C01-02 primeros 50 ELEMENTOS con entradas expandidas sin tope de 50 (conteo saturado 0..32767);
--   R-C01-03 derivación única del cierre (fe_e03_r05_derivar_cierre) compartida con la lectura de recuperación de una operación ABIERTA.
--   F004 límite 8 MiB provisional (gate B), arriba.  F005 coherencia de preflight / verificación / reversión (scripts).
--
-- Objetos nuevos (prefijo _r05 / fe_e03_*_r05):
--   tablas   nex_e03_r05_estado (fila única ACTIVO/REVERTIDO, configuración de plataforma: sin empresa_id), documento_electronico_envio_operaciones_r05, …_posts_grandes_r05,
--            …_autenticaciones_r05, …_proyecciones_r05, …_cierres_r05, …_salidas_tardias_r05 (todas solo altas; DELETE únicamente en reinicio DEMO autorizado, TRUNCATE nunca).
--   funciones de escritura (SECURITY DEFINER, permiso FACTURACION_ELECTRONICA.CREAR + alcance de sucursal + modo ACTIVO verificado con bloqueo compartido): iniciar, autenticación, POST,
--            salida, no transmitido, cierre y salida tardía. De lectura: operación por correlación y conexión de referencia.
--   ayudante de privilegios nex_aplicar_grants_facturacion_e03_r05 (dos estados) y redefinición de nex_aplicar_grants_facturacion_e03 (NEX-072) que RETIRA a nexit_runtime las tres
--            funciones de escritura de NEX-072 (la aplicación no las usa: verificado en lib/; un único camino de escritura de evidencia, el R05).
--
-- Orden de bloqueos (toda escritura R05): 1) fila de nex_e03_r05_estado FOR SHARE y verificación del modo ACTIVO DESPUÉS de obtenerlo; 2) fila del documento FOR UPDATE; 3) altas.
-- La reversión (scripts/reversion-NEX-084.sql) toma la MISMA fila FOR UPDATE: espera a las escrituras en curso y las posteriores ven REVERTIDO aunque ya hubieran pasado el control de EXECUTE.
--
-- Transacción: el runner (scripts/aplicar-migraciones.sh) ejecuta este archivo y su fila de schema_migrations en UNA transacción psql -1; por eso no hay BEGIN/COMMIT aquí.

SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  t text;
BEGIN
  -- G0: transacción explícita con lock_timeout local corto
  IF current_setting('lock_timeout') <> '5s' THEN
    RAISE EXCEPTION 'NEX-084: lock_timeout local no vigente (%): aplicar SOLO con el runner oficial (transacción única psql -1).', current_setting('lock_timeout')
      USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX084_SIN_TRANSACCION';
  END IF;

  -- G1: control de migraciones (procedencia exacta de las funciones que se envuelven)
  IF to_regclass('public.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'NEX-084: falta public.schema_migrations (NEX-001).' USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX084_DEPENDENCIA';
  END IF;
  IF (SELECT count(*) FROM public.schema_migrations
       WHERE (version = 'NEX-062' AND checksum = '62ce6709d2bbd8362ea63d247761de8db26012f25aee4f6951cde6b641b54eb4')
          OR (version = 'NEX-072' AND checksum = 'e34de98d3a6172e366548125a2d3548b43de85e0fb10d20c95e244f208e39b7f')
          OR (version = 'NEX-079' AND checksum = '6a87a9a7e58a009b0815db89bb838b26efe000003b3d852ad6bf7c880491d77c')
          OR (version = 'NEX-080' AND checksum = '00c1aaf2c746869384f0d22f2b4076191ce89bdfcfe5bc365f1f226e1b391274')
          OR (version = 'NEX-083' AND checksum = '88de3731ef433c28ff348659831523ef9d1ca1960e29a2b94dd49642c3c4e1cc')) <> 5 THEN
    RAISE EXCEPTION 'NEX-084 requiere NEX-062, NEX-072, NEX-079, NEX-080 y NEX-083 registradas con el checksum de sus archivos versionados.' USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX084_DEPENDENCIA';
  END IF;
  IF EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 'NEX-084') THEN
    RAISE EXCEPTION 'NEX-084 ya está registrada en schema_migrations: no se reaplica por suposición.' USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX084_YA_REGISTRADA';
  END IF;
  IF EXISTS (SELECT 1 FROM public.schema_migrations WHERE version ~ '^NEX-[0-9]{3}$' AND version > 'NEX-084') THEN
    RAISE EXCEPTION 'NEX-084: hay migraciones posteriores registradas: orden de aplicación inesperado.' USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX084_ORDEN';
  END IF;

  -- G2: objetos de los que depende el contrato
  FOREACH t IN ARRAY ARRAY['empresas', 'usuarios', 'documentos_electronicos', 'documento_electronico_solicitudes', 'documento_electronico_intentos', 'documento_electronico_envio_evidencias'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname = t AND c.relkind = 'r') THEN
      RAISE EXCEPTION 'NEX-084: public.% no existe como tabla base.', t USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX084_DEPENDENCIA';
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'envio_evidencias_identidad_uk' AND conrelid = 'public.documento_electronico_envio_evidencias'::regclass)
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documento_electronico_intentos_doc_id_uk' AND conrelid = 'public.documento_electronico_intentos'::regclass)
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documento_electronico_intentos' AND column_name = 'conexion') THEN
    RAISE EXCEPTION 'NEX-084: faltan las restricciones de NEX-072 o la columna conexion de NEX-079.' USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX084_DEPENDENCIA';
  END IF;
  IF to_regprocedure('public.fe_documento_iniciar_envio(uuid,uuid,uuid,boolean)') IS NULL
     OR to_regprocedure('public.fe_documento_registrar_envio_r05(uuid,uuid,uuid,text,text,text,text,integer,text,text,text,text,text,jsonb,jsonb)') IS NULL
     OR to_regprocedure('public.fe_intento_conexion_segura(jsonb)') IS NULL
     OR to_regprocedure('public.fe_e03_redactar_texto(text)') IS NULL
     OR to_regprocedure('public.fe_e03_secreto_residual(text)') IS NULL
     OR to_regprocedure('public.fe_e03_evidencia_inmutable()') IS NULL
     OR to_regprocedure('public.fe_e03_iniciar_envio(uuid,uuid,uuid,boolean)') IS NULL
     OR to_regprocedure('public.fe_e03_registrar_evento(uuid,uuid,uuid,uuid,text,smallint,text,integer,jsonb,boolean,text)') IS NULL
     OR to_regprocedure('public.fe_e03_cerrar_envio(uuid,uuid,uuid,uuid,text,text,text,text,integer,text,text,text,text,text,text,jsonb)') IS NULL
     OR to_regprocedure('public.usuario_tiene_permiso(uuid,uuid,text,text)') IS NULL
     OR to_regprocedure('public.sucursal_en_alcance(uuid,uuid,uuid)') IS NULL
     OR to_regprocedure('public.nex_reinicio_demo_activo(uuid)') IS NULL
     OR to_regprocedure('public.nex_aplicar_grants_runtime()') IS NULL
     OR to_regprocedure('public.nex_aplicar_grants_facturacion_e03()') IS NULL THEN
    RAISE EXCEPTION 'NEX-084: faltan funciones de NEX-012/014/046/052/062/072/079/080.' USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX084_DEPENDENCIA';
  END IF;

  -- G3: ningún objeto R05 previo (no se instala sobre restos)
  IF to_regclass('public.nex_e03_r05_estado') IS NOT NULL OR to_regclass('public.documento_electronico_envio_operaciones_r05') IS NOT NULL
     OR to_regprocedure('public.fe_e03_iniciar_envio_r05(uuid,uuid,uuid,boolean,uuid,text,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'NEX-084: ya existen objetos R05: no se reinstala por suposición.' USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX084_OBJETOS_PREVIOS';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1) Modo de la plataforma (coordinación con la reversión)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE public.nex_e03_r05_estado (
  id          boolean     PRIMARY KEY DEFAULT true CHECK (id),
  modo        text        NOT NULL CHECK (modo IN ('ACTIVO', 'REVERTIDO')),
  cambiado_at timestamptz NOT NULL DEFAULT now(),
  motivo      text        CHECK (motivo IS NULL OR char_length(motivo) <= 300)
);
COMMENT ON TABLE public.nex_e03_r05_estado IS 'NEX-084: fila única de plataforma (sin empresa_id: no es dato de una empresa). ACTIVO = las escrituras R05 se admiten; REVERTIDO = se rechazan aunque una llamada ya estuviera en curso. Solo la cambia la reversión protegida (o una orden futura de reactivación).';

CREATE OR REPLACE FUNCTION public.nex_e03_r05_estado_guarda() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'nex_e03_r05_estado no se vacía ni se elimina: el modo se cambia con la reversión protegida.' USING ERRCODE = 'P0001', DETAIL = 'NEX:E03_R05_ESTADO_FIJO';
END $$;
CREATE TRIGGER nex_e03_r05_estado_fila_trg BEFORE DELETE ON public.nex_e03_r05_estado FOR EACH ROW EXECUTE FUNCTION public.nex_e03_r05_estado_guarda();
CREATE TRIGGER nex_e03_r05_estado_truncate_trg BEFORE TRUNCATE ON public.nex_e03_r05_estado FOR EACH STATEMENT EXECUTE FUNCTION public.nex_e03_r05_estado_guarda();
INSERT INTO public.nex_e03_r05_estado (id, modo, motivo) VALUES (true, 'ACTIVO', 'NEX-084: instalación');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 2) Tablas de evidencia R05 (solo altas)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Operación: una por INICIO de NEX-072 creado por la vía R05. Correlación previa (UUID del proceso) + HASH del testigo secreto del proceso (el testigo nunca se guarda).
CREATE TABLE public.documento_electronico_envio_operaciones_r05 (
  operacion_id     uuid        PRIMARY KEY,
  empresa_id       uuid        NOT NULL REFERENCES public.empresas (id),
  documento_id     uuid        NOT NULL,
  version          smallint    NOT NULL CHECK (version >= 1),
  correlacion_id   uuid        NOT NULL,
  testigo_sha256   text        NOT NULL CHECK (testigo_sha256 ~ '^[0-9a-f]{64}$'),
  actor_id         uuid        NOT NULL,
  confirma_rechazo boolean     NOT NULL,
  conexion         jsonb       NOT NULL CHECK (jsonb_typeof(conexion) = 'object' AND octet_length(conexion::text) <= 1024),
  payload_hash     text        NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  creado_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT envio_operaciones_r05_inicio_fk FOREIGN KEY (empresa_id, documento_id, version, operacion_id)
    REFERENCES public.documento_electronico_envio_evidencias (empresa_id, documento_id, version, id) ON DELETE CASCADE,
  CONSTRAINT envio_operaciones_r05_version_fk FOREIGN KEY (empresa_id, documento_id, version)
    REFERENCES public.documento_electronico_solicitudes (empresa_id, documento_id, version) ON DELETE CASCADE,
  CONSTRAINT envio_operaciones_r05_actor_fk FOREIGN KEY (empresa_id, actor_id) REFERENCES public.usuarios (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT envio_operaciones_r05_correlacion_uk UNIQUE (empresa_id, correlacion_id),
  CONSTRAINT envio_operaciones_r05_identidad_uk UNIQUE (empresa_id, documento_id, version, operacion_id)
);
CREATE INDEX envio_operaciones_r05_documento_idx ON public.documento_electronico_envio_operaciones_r05 (empresa_id, documento_id, creado_at);
COMMENT ON TABLE public.documento_electronico_envio_operaciones_r05 IS 'NEX-084: operación de envío R05 (raíz = evento INICIO de NEX-072). testigo_sha256 = SHA-256 UTF-8 del testigo secreto del proceso; la columna NO se concede a nexit_runtime. conexion = referencia normalizada (fe_intento_conexion_segura) del envío.';
COMMENT ON COLUMN public.documento_electronico_envio_operaciones_r05.testigo_sha256 IS 'Solo el hash; el testigo jamás se persiste, se registra ni se devuelve. Sin SELECT para nexit_runtime (privilegio por columnas).';

CREATE OR REPLACE FUNCTION public.fe_e03_r05_operacion_inicio_guarda() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.documento_electronico_envio_evidencias e
                  WHERE e.empresa_id = NEW.empresa_id AND e.documento_id = NEW.documento_id AND e.version = NEW.version AND e.id = NEW.operacion_id AND e.tipo_evento = 'INICIO') THEN
    RAISE EXCEPTION 'la operación R05 debe enlazar un evento INICIO de su documento y versión' USING ERRCODE = 'P0001', DETAIL = 'NEX:OPERACION_NO_ENCONTRADA';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER envio_operaciones_r05_inicio_trg BEFORE INSERT ON public.documento_electronico_envio_operaciones_r05 FOR EACH ROW EXECUTE FUNCTION public.fe_e03_r05_operacion_inicio_guarda();

-- POST con cuerpo > 1 MiB (D8-B): texto íntegro y huella calculada por el banco. Un número de POST vive en UNA sola de las dos tablas (guarda abajo).
CREATE TABLE public.documento_electronico_envio_posts_grandes_r05 (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  orden                bigint      GENERATED ALWAYS AS IDENTITY,
  empresa_id           uuid        NOT NULL REFERENCES public.empresas (id),
  documento_id         uuid        NOT NULL,
  version              smallint    NOT NULL,
  operacion_id         uuid        NOT NULL,
  nro_post             smallint    NOT NULL CHECK (nro_post BETWEEN 1 AND 2),
  solicitud_http_texto text        NOT NULL CHECK (octet_length(solicitud_http_texto) > 1048576 AND octet_length(solicitud_http_texto) <= 8388608),
  solicitud_sha256     text        NOT NULL CHECK (solicitud_sha256 ~ '^[0-9a-f]{64}$'),
  solicitud_bytes      integer     NOT NULL CHECK (solicitud_bytes > 1048576 AND solicitud_bytes <= 8388608),
  actor_id             uuid        NOT NULL,
  creado_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT envio_posts_grandes_r05_operacion_fk FOREIGN KEY (empresa_id, documento_id, version, operacion_id)
    REFERENCES public.documento_electronico_envio_operaciones_r05 (empresa_id, documento_id, version, operacion_id) ON DELETE CASCADE,
  CONSTRAINT envio_posts_grandes_r05_actor_fk FOREIGN KEY (empresa_id, actor_id) REFERENCES public.usuarios (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT envio_posts_grandes_r05_nro_uk UNIQUE (empresa_id, documento_id, operacion_id, nro_post),
  CONSTRAINT envio_posts_grandes_r05_identidad_uk UNIQUE (empresa_id, documento_id, version, id)
);
COMMENT ON TABLE public.documento_electronico_envio_posts_grandes_r05 IS 'NEX-084 (D8-B): POST cuyo texto HTTP exacto supera 1 MiB (límite de NEX-072). Texto íntegro, SHA-256 y bytes UTF-8 calculados por el banco ANTES del fetch; igualdad jsonb con el snapshot verificada. Límite defensivo 8 MiB.';

-- Autenticaciones de la operación (sin mensajes ni secretos): nro 1 = INICIAL (HTTP o caché), nro 2 = RENOVACION_TOKEN tras token rechazado en el POST 1.
-- R02-C01 F001: OK por HTTP exige exactamente 200 (paridad con obtenerToken: r.status === 200, status «success» y token); otro 2xx es ERROR_HTTP. CACHE: OK sin HTTP, solo INICIAL.
CREATE TABLE public.documento_electronico_envio_autenticaciones_r05 (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  orden        bigint      GENERATED ALWAYS AS IDENTITY,
  empresa_id   uuid        NOT NULL REFERENCES public.empresas (id),
  documento_id uuid        NOT NULL,
  version      smallint    NOT NULL,
  operacion_id uuid        NOT NULL,
  nro          smallint    NOT NULL CHECK (nro BETWEEN 1 AND 2),
  motivo       text        NOT NULL CHECK (motivo IN ('INICIAL', 'RENOVACION_TOKEN')),
  origen       text        NOT NULL CHECK (origen IN ('HTTP', 'CACHE')),
  resultado    text        NOT NULL CHECK (resultado IN ('OK', 'ERROR_HTTP', 'TIMEOUT', 'RED')),
  http_status  integer     CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  actor_id     uuid        NOT NULL,
  creado_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT envio_autenticaciones_r05_operacion_fk FOREIGN KEY (empresa_id, documento_id, version, operacion_id)
    REFERENCES public.documento_electronico_envio_operaciones_r05 (empresa_id, documento_id, version, operacion_id) ON DELETE CASCADE,
  CONSTRAINT envio_autenticaciones_r05_actor_fk FOREIGN KEY (empresa_id, actor_id) REFERENCES public.usuarios (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT envio_autenticaciones_r05_nro_uk UNIQUE (empresa_id, documento_id, operacion_id, nro),
  CONSTRAINT envio_autenticaciones_r05_forma_chk CHECK (
       (nro = 1) = (motivo = 'INICIAL')
   AND (origen <> 'CACHE' OR (resultado = 'OK' AND http_status IS NULL AND motivo = 'INICIAL'))
   AND (origen <> 'HTTP' OR ((resultado = 'OK' AND http_status = 200) OR (resultado = 'ERROR_HTTP' AND http_status IS NOT NULL) OR (resultado IN ('TIMEOUT', 'RED') AND http_status IS NULL))))
);

-- Salida HTTP de un POST (evento HTTP_RESPUESTA de NEX-072) con su proyección P validada, o la razón por la que no hay P (forma persistida de la ausencia).
CREATE TABLE public.documento_electronico_envio_proyecciones_r05 (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  orden                 bigint      GENERATED ALWAYS AS IDENTITY,
  empresa_id            uuid        NOT NULL REFERENCES public.empresas (id),
  documento_id          uuid        NOT NULL,
  version               smallint    NOT NULL,
  operacion_id          uuid        NOT NULL,
  evento_id             uuid        NOT NULL,
  nro_post              smallint    NOT NULL CHECK (nro_post BETWEEN 1 AND 2),
  proyeccion            jsonb       CHECK (proyeccion IS NULL OR (jsonb_typeof(proyeccion) = 'object' AND octet_length(proyeccion::text) <= 16384)),
  motivo_sin_proyeccion text        CHECK (motivo_sin_proyeccion IS NULL OR motivo_sin_proyeccion IN ('PROYECCION_RECHAZADA', 'CREDENCIALES_RESIDUALES', 'CUERPO_NO_PROYECTABLE', 'FALLO_LOCAL')),
  regla                 text,
  resultado             text,
  estado_local          text,
  error_tipo            text,
  cotejo                text        CHECK (cotejo IS NULL OR cotejo IN ('COTEJADO_PARCIAL', 'NO_COTEJABLE_SIN_CUERPO', 'NO_COTEJABLE_TRUNCADA', 'NO_COTEJABLE_REDACTADA')),
  campos_cotejados      text[],
  actor_id              uuid        NOT NULL,
  creado_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT envio_proyecciones_r05_operacion_fk FOREIGN KEY (empresa_id, documento_id, version, operacion_id)
    REFERENCES public.documento_electronico_envio_operaciones_r05 (empresa_id, documento_id, version, operacion_id) ON DELETE CASCADE,
  CONSTRAINT envio_proyecciones_r05_evento_fk FOREIGN KEY (empresa_id, documento_id, version, evento_id)
    REFERENCES public.documento_electronico_envio_evidencias (empresa_id, documento_id, version, id) ON DELETE CASCADE,
  CONSTRAINT envio_proyecciones_r05_actor_fk FOREIGN KEY (empresa_id, actor_id) REFERENCES public.usuarios (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT envio_proyecciones_r05_evento_uk UNIQUE (empresa_id, documento_id, evento_id),
  CONSTRAINT envio_proyecciones_r05_post_uk UNIQUE (empresa_id, documento_id, operacion_id, nro_post),
  CONSTRAINT envio_proyecciones_r05_forma_chk CHECK (
       (proyeccion IS NULL) = (motivo_sin_proyeccion IS NOT NULL)
   AND (proyeccion IS NULL) = (regla IS NULL) AND (regla IS NULL) = (resultado IS NULL) AND (regla IS NULL) = (estado_local IS NULL) AND (regla IS NULL) = (cotejo IS NULL)
   AND (estado_local IS NULL OR estado_local IN ('ENVIADO', 'ERROR_ENVIO', 'ENVIO_INDETERMINADO'))
   AND (resultado IS NULL OR resultado IN ('OK', 'ERROR_HTTP', 'RESPUESTA_INVALIDA'))
   AND ((estado_local = 'ERROR_ENVIO') = (error_tipo IS NOT NULL) OR estado_local IS NULL)
   AND (error_tipo IS NULL OR error_tipo IN ('AUTENTICACION', 'RECHAZO', 'TRANSITORIO')))
);
COMMENT ON TABLE public.documento_electronico_envio_proyecciones_r05 IS 'NEX-084: proyección P v1 (<= 16384 bytes) del cuerpo de la respuesta de un POST, validada por esquema cerrado, saneada, clasificada en SQL (matriz R-01…R-07) y cotejada con los campos efectivamente preservados de la respuesta. Sin P: motivo persistido (el cierre queda indeterminado).';

-- Cierre R05: uno por operación, derivado de la evidencia (no de parámetros libres). Enlaza el intento ENVIO creado por fe_documento_registrar_envio_r05 y el evento CIERRE de NEX-072.
CREATE TABLE public.documento_electronico_envio_cierres_r05 (
  operacion_id         uuid        PRIMARY KEY,
  empresa_id           uuid        NOT NULL REFERENCES public.empresas (id),
  documento_id         uuid        NOT NULL,
  version              smallint    NOT NULL,
  evento_cierre_id     uuid        NOT NULL,
  intento_id           uuid        NOT NULL,
  regla                text        NOT NULL CHECK (char_length(regla) <= 40),
  fase                 text        NOT NULL CHECK (fase IN ('AUTENTICACION', 'TRANSMISION')),
  resultado            text        NOT NULL CHECK (resultado IN ('OK', 'ERROR_HTTP', 'TIMEOUT', 'RED', 'RESPUESTA_INVALIDA')),
  estado_local         text        NOT NULL CHECK (estado_local IN ('ENVIADO', 'ERROR_ENVIO', 'ENVIO_INDETERMINADO')),
  error_tipo           text        CHECK (error_tipo IS NULL OR error_tipo IN ('AUTENTICACION', 'RECHAZO', 'TRANSITORIO')),
  http_status          integer     CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  salida_ultimo_post   text        NOT NULL CHECK (salida_ultimo_post IN ('SIN_POST', 'SIN_SALIDA', 'ERROR_TRANSMISION', 'HTTP_RESPUESTA')),
  http_post            integer     CHECK (http_post IS NULL OR http_post BETWEEN 100 AND 599),
  http_autenticacion   integer     CHECK (http_autenticacion IS NULL OR http_autenticacion BETWEEN 100 AND 599),
  motivo               text        CHECK (motivo IS NULL OR motivo IN ('EVIDENCIA_INSUFICIENTE', 'NO_TRANSMITIDO')),
  clasificacion_sha256 text        NOT NULL CHECK (clasificacion_sha256 ~ '^[0-9a-f]{64}$'),
  lote_paridad         boolean,
  actor_id             uuid        NOT NULL,
  creado_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT envio_cierres_r05_operacion_fk FOREIGN KEY (empresa_id, documento_id, version, operacion_id)
    REFERENCES public.documento_electronico_envio_operaciones_r05 (empresa_id, documento_id, version, operacion_id) ON DELETE CASCADE,
  CONSTRAINT envio_cierres_r05_evento_fk FOREIGN KEY (empresa_id, documento_id, version, evento_cierre_id)
    REFERENCES public.documento_electronico_envio_evidencias (empresa_id, documento_id, version, id) ON DELETE CASCADE,
  CONSTRAINT envio_cierres_r05_intento_fk FOREIGN KEY (empresa_id, documento_id, intento_id)
    REFERENCES public.documento_electronico_intentos (empresa_id, documento_id, id) ON DELETE CASCADE,
  CONSTRAINT envio_cierres_r05_actor_fk FOREIGN KEY (empresa_id, actor_id) REFERENCES public.usuarios (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT envio_cierres_r05_intento_uk UNIQUE (empresa_id, documento_id, intento_id),
  CONSTRAINT envio_cierres_r05_forma_chk CHECK ((resultado = 'OK') = (estado_local = 'ENVIADO') AND (estado_local = 'ERROR_ENVIO') = (error_tipo IS NOT NULL)
                                              AND (salida_ultimo_post = 'HTTP_RESPUESTA') = (http_post IS NOT NULL))
);
COMMENT ON COLUMN public.documento_electronico_envio_cierres_r05.salida_ultimo_post IS 'R02-C01 F003: SIN_POST (no hubo POST), SIN_SALIDA (hubo POST y no consta su salida: AUSENCIA DE EVIDENCIA), ERROR_TRANSMISION (consta que no hubo HTTP: TIMEOUT/RED), HTTP_RESPUESTA (http_post = su estado). http_autenticacion = HTTP de la autenticación decisiva (o la última), separado del POST.';
COMMENT ON COLUMN public.documento_electronico_envio_cierres_r05.lote_paridad IS 'Solo en R-06f (ACK por lote): true si el lote de P también lo admite la regla vigente de NEX-080 (clases de caracteres del locale SQL). false = discrepancia Unicode real entre JS y SQL: el intento queda sin lote; se registra, no se corrige aquí (bloqueo B).';

-- Salidas tardías: la salida de un POST que llega cuando la vía normal ya no la admite (operación cerrada, no vigente o documento fuera de envío). Nunca reescribe el cierre ni el estado.
CREATE TABLE public.documento_electronico_envio_salidas_tardias_r05 (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  orden              bigint      GENERATED ALWAYS AS IDENTITY,
  empresa_id         uuid        NOT NULL REFERENCES public.empresas (id),
  documento_id       uuid        NOT NULL,
  version            smallint    NOT NULL,
  operacion_id       uuid        NOT NULL,
  nro_post           smallint    NOT NULL CHECK (nro_post BETWEEN 1 AND 2),
  post_evento_id     uuid,
  post_grande_id     uuid,
  tipo_salida        text        NOT NULL CHECK (tipo_salida IN ('HTTP_RESPUESTA', 'ERROR_TRANSMISION')),
  clase_error        text        CHECK (clase_error IS NULL OR clase_error IN ('TIMEOUT', 'RED')),
  http_status        integer     CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  respuesta_saneada  jsonb       CHECK (respuesta_saneada IS NULL OR pg_column_size(respuesta_saneada) < 65536),
  respuesta_truncada boolean     NOT NULL,
  respuesta_sha256   text        CHECK (respuesta_sha256 IS NULL OR respuesta_sha256 ~ '^[0-9a-f]{64}$'),
  respuesta_bytes    integer     CHECK (respuesta_bytes IS NULL OR respuesta_bytes >= 0),
  proyeccion         jsonb       CHECK (proyeccion IS NULL OR (jsonb_typeof(proyeccion) = 'object' AND octet_length(proyeccion::text) <= 16384)),
  estado_proyeccion  text        NOT NULL CHECK (estado_proyeccion IN ('NO_APLICA', 'SIN_PROYECCION', 'PROYECCION_DESCARTADA', 'PROYECCION_VALIDADA', 'PROYECCION_COTEJADA_PARCIAL')),
  motivo_sin_proyeccion text     CHECK (motivo_sin_proyeccion IS NULL OR motivo_sin_proyeccion IN ('PROYECCION_RECHAZADA', 'CREDENCIALES_RESIDUALES', 'CUERPO_NO_PROYECTABLE', 'FALLO_LOCAL')),
  motivo_descarte    text        CHECK (motivo_descarte IS NULL OR motivo_descarte IN ('PROYECCION_INVALIDA', 'PROYECCION_EXCEDIDA', 'PROYECCION_INCOHERENTE', 'CLASIFICACION_NO_COINCIDE',
                                                                                    'EVIDENCIA_CON_CREDENCIALES', 'IDENTIDAD_SNAPSHOT_DISTINTA', 'OTRO')),
  regla              text        CHECK (regla IS NULL OR char_length(regla) <= 40),
  resultado          text        CHECK (resultado IS NULL OR resultado IN ('OK', 'ERROR_HTTP', 'RESPUESTA_INVALIDA')),
  estado_local       text        CHECK (estado_local IS NULL OR estado_local IN ('ENVIADO', 'ERROR_ENVIO', 'ENVIO_INDETERMINADO')),
  error_tipo         text        CHECK (error_tipo IS NULL OR error_tipo IN ('AUTENTICACION', 'RECHAZO', 'TRANSITORIO')),
  cotejo             text        CHECK (cotejo IS NULL OR cotejo IN ('COTEJADO_PARCIAL', 'NO_COTEJABLE_SIN_CUERPO', 'NO_COTEJABLE_TRUNCADA', 'NO_COTEJABLE_REDACTADA')),
  campos_cotejados   text[],
  motivo_tardia      text        NOT NULL CHECK (motivo_tardia IN ('OPERACION_CERRADA', 'OPERACION_NO_VIGENTE', 'DOCUMENTO_NO_ENVIANDO')),
  huella_sha256      text        NOT NULL CHECK (huella_sha256 ~ '^[0-9a-f]{64}$'),
  actor_id           uuid        NOT NULL,
  creado_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT envio_salidas_tardias_r05_operacion_fk FOREIGN KEY (empresa_id, documento_id, version, operacion_id)
    REFERENCES public.documento_electronico_envio_operaciones_r05 (empresa_id, documento_id, version, operacion_id) ON DELETE CASCADE,
  CONSTRAINT envio_salidas_tardias_r05_post_evento_fk FOREIGN KEY (empresa_id, documento_id, version, post_evento_id)
    REFERENCES public.documento_electronico_envio_evidencias (empresa_id, documento_id, version, id) ON DELETE CASCADE,
  CONSTRAINT envio_salidas_tardias_r05_post_grande_fk FOREIGN KEY (empresa_id, documento_id, version, post_grande_id)
    REFERENCES public.documento_electronico_envio_posts_grandes_r05 (empresa_id, documento_id, version, id) ON DELETE CASCADE,
  CONSTRAINT envio_salidas_tardias_r05_actor_fk FOREIGN KEY (empresa_id, actor_id) REFERENCES public.usuarios (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT envio_salidas_tardias_r05_post_uk UNIQUE (empresa_id, documento_id, operacion_id, nro_post),
  CONSTRAINT envio_salidas_tardias_r05_forma_chk CHECK (
       num_nonnulls(post_evento_id, post_grande_id) = 1
   AND (respuesta_saneada IS NULL) = (respuesta_sha256 IS NULL) AND (respuesta_saneada IS NULL) = (respuesta_bytes IS NULL) AND (NOT respuesta_truncada OR respuesta_saneada IS NOT NULL)
   AND ((tipo_salida = 'HTTP_RESPUESTA' AND http_status IS NOT NULL AND clase_error IS NULL AND estado_proyeccion <> 'NO_APLICA')
     OR (tipo_salida = 'ERROR_TRANSMISION' AND http_status IS NULL AND clase_error IS NOT NULL AND respuesta_saneada IS NULL AND proyeccion IS NULL AND estado_proyeccion = 'NO_APLICA'))
   -- R02-C01 F002: A = SIN_PROYECCION (el llamador no envió P y declara por qué), B = PROYECCION_DESCARTADA (la P enviada no pasó validación/saneado/clasificación/cotejo: motivo seguro),
   -- C = PROYECCION_VALIDADA (P válida, respuesta no cotejable), D = PROYECCION_COTEJADA_PARCIAL. La clasificación de C/D es informativa: una salida tardía nunca cambia cierre ni estados.
   AND (estado_proyeccion = 'SIN_PROYECCION') = (motivo_sin_proyeccion IS NOT NULL)
   AND (estado_proyeccion = 'PROYECCION_DESCARTADA') = (motivo_descarte IS NOT NULL)
   AND (estado_proyeccion IN ('PROYECCION_VALIDADA', 'PROYECCION_COTEJADA_PARCIAL')) = (proyeccion IS NOT NULL)
   AND (proyeccion IS NULL) = (regla IS NULL) AND (regla IS NULL) = (resultado IS NULL) AND (regla IS NULL) = (estado_local IS NULL) AND (regla IS NULL) = (cotejo IS NULL)
   AND (regla IS NULL) = (campos_cotejados IS NULL)
   AND ((estado_local = 'ERROR_ENVIO') = (error_tipo IS NOT NULL) OR estado_local IS NULL)
   AND (estado_proyeccion <> 'PROYECCION_COTEJADA_PARCIAL' OR cotejo = 'COTEJADO_PARCIAL')
   AND (estado_proyeccion <> 'PROYECCION_VALIDADA' OR cotejo <> 'COTEJADO_PARCIAL'))
);
COMMENT ON TABLE public.documento_electronico_envio_salidas_tardias_r05 IS 'NEX-084: salida de un POST registrada fuera de la vía normal (append-only, vínculo compuesto al POST). No cambia estado, cierre ni intento; queda para conciliación (consulta en la misma cuenta).';

-- Inmutabilidad de todas las tablas R05 con empresa_id: misma regla que NEX-072 (DELETE solo en reinicio DEMO autorizado; TRUNCATE nunca).
CREATE TRIGGER envio_operaciones_r05_inmutable_fila_trg BEFORE UPDATE OR DELETE ON public.documento_electronico_envio_operaciones_r05 FOR EACH ROW EXECUTE FUNCTION public.fe_e03_evidencia_inmutable();
CREATE TRIGGER envio_operaciones_r05_inmutable_truncate_trg BEFORE TRUNCATE ON public.documento_electronico_envio_operaciones_r05 FOR EACH STATEMENT EXECUTE FUNCTION public.fe_e03_evidencia_inmutable();
CREATE TRIGGER envio_posts_grandes_r05_inmutable_fila_trg BEFORE UPDATE OR DELETE ON public.documento_electronico_envio_posts_grandes_r05 FOR EACH ROW EXECUTE FUNCTION public.fe_e03_evidencia_inmutable();
CREATE TRIGGER envio_posts_grandes_r05_inmutable_truncate_trg BEFORE TRUNCATE ON public.documento_electronico_envio_posts_grandes_r05 FOR EACH STATEMENT EXECUTE FUNCTION public.fe_e03_evidencia_inmutable();
CREATE TRIGGER envio_autenticaciones_r05_inmutable_fila_trg BEFORE UPDATE OR DELETE ON public.documento_electronico_envio_autenticaciones_r05 FOR EACH ROW EXECUTE FUNCTION public.fe_e03_evidencia_inmutable();
CREATE TRIGGER envio_autenticaciones_r05_inmutable_truncate_trg BEFORE TRUNCATE ON public.documento_electronico_envio_autenticaciones_r05 FOR EACH STATEMENT EXECUTE FUNCTION public.fe_e03_evidencia_inmutable();
CREATE TRIGGER envio_proyecciones_r05_inmutable_fila_trg BEFORE UPDATE OR DELETE ON public.documento_electronico_envio_proyecciones_r05 FOR EACH ROW EXECUTE FUNCTION public.fe_e03_evidencia_inmutable();
CREATE TRIGGER envio_proyecciones_r05_inmutable_truncate_trg BEFORE TRUNCATE ON public.documento_electronico_envio_proyecciones_r05 FOR EACH STATEMENT EXECUTE FUNCTION public.fe_e03_evidencia_inmutable();
CREATE TRIGGER envio_cierres_r05_inmutable_fila_trg BEFORE UPDATE OR DELETE ON public.documento_electronico_envio_cierres_r05 FOR EACH ROW EXECUTE FUNCTION public.fe_e03_evidencia_inmutable();
CREATE TRIGGER envio_cierres_r05_inmutable_truncate_trg BEFORE TRUNCATE ON public.documento_electronico_envio_cierres_r05 FOR EACH STATEMENT EXECUTE FUNCTION public.fe_e03_evidencia_inmutable();
CREATE TRIGGER envio_salidas_tardias_r05_inmutable_fila_trg BEFORE UPDATE OR DELETE ON public.documento_electronico_envio_salidas_tardias_r05 FOR EACH ROW EXECUTE FUNCTION public.fe_e03_evidencia_inmutable();
CREATE TRIGGER envio_salidas_tardias_r05_inmutable_truncate_trg BEFORE TRUNCATE ON public.documento_electronico_envio_salidas_tardias_r05 FOR EACH STATEMENT EXECUTE FUNCTION public.fe_e03_evidencia_inmutable();

-- Guarda de la evidencia de NEX-072 para operaciones R05: solo las funciones R05 escriben en ellas (marca local de transacción) y un número de POST no puede estar a la vez en NEX-072 y
-- en la tabla de POST grandes. Defensa en profundidad: además, nexit_runtime ya no ejecuta las funciones de escritura de NEX-072 (ver privilegios).
CREATE OR REPLACE FUNCTION public.fe_e03_r05_evidencia_guarda() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.tipo_evento <> 'INICIO' AND EXISTS (SELECT 1 FROM public.documento_electronico_envio_operaciones_r05 o
                                              WHERE o.empresa_id = NEW.empresa_id AND o.documento_id = NEW.documento_id AND o.operacion_id = NEW.operacion_id) THEN
    IF coalesce(current_setting('nexit.e03_r05', true), '') <> 'on' THEN
      RAISE EXCEPTION 'la operación de envío es R05: solo admite eventos registrados por las funciones R05' USING ERRCODE = 'P0001', DETAIL = 'NEX:OPERACION_R05_SOLO_FUNCIONES';
    END IF;
    IF NEW.tipo_evento = 'POST_INTENTADO' AND EXISTS (SELECT 1 FROM public.documento_electronico_envio_posts_grandes_r05 g
                                                       WHERE g.empresa_id = NEW.empresa_id AND g.documento_id = NEW.documento_id AND g.operacion_id = NEW.operacion_id AND g.nro_post = NEW.nro_post) THEN
      RAISE EXCEPTION 'el número de POST ya está registrado como POST grande' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_CONTRADICTORIO';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER envio_evidencias_r05_guarda_trg BEFORE INSERT ON public.documento_electronico_envio_evidencias FOR EACH ROW EXECUTE FUNCTION public.fe_e03_r05_evidencia_guarda();

CREATE OR REPLACE FUNCTION public.fe_e03_r05_post_grande_guarda() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF coalesce(current_setting('nexit.e03_r05', true), '') <> 'on' THEN
    RAISE EXCEPTION 'solo las funciones R05 registran POST grandes' USING ERRCODE = 'P0001', DETAIL = 'NEX:OPERACION_R05_SOLO_FUNCIONES';
  END IF;
  IF EXISTS (SELECT 1 FROM public.documento_electronico_envio_evidencias e
              WHERE e.empresa_id = NEW.empresa_id AND e.documento_id = NEW.documento_id AND e.operacion_id = NEW.operacion_id
                AND (e.tipo_evento IN ('NO_TRANSMITIDO', 'CIERRE') OR (e.tipo_evento = 'POST_INTENTADO' AND e.nro_post = NEW.nro_post))) THEN
    RAISE EXCEPTION 'POST grande incompatible con la evidencia de la operación (cerrada, no transmitida o número ya usado)' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_CONTRADICTORIO';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER envio_posts_grandes_r05_guarda_trg BEFORE INSERT ON public.documento_electronico_envio_posts_grandes_r05 FOR EACH ROW EXECUTE FUNCTION public.fe_e03_r05_post_grande_guarda();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 3) Ayudantes puros (sin acceso a tablas): tipos JSON, claves exactas, lote con el conjunto de espacios de JavaScript
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fe_e03_r05_claves_exactas(p jsonb, p_claves text[]) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RETURN false;
  END IF;
  RETURN (SELECT coalesce(array_agg(k ORDER BY k COLLATE "C"), ARRAY[]::text[]) FROM jsonb_object_keys(p) AS t(k))
       = (SELECT coalesce(array_agg(c ORDER BY c COLLATE "C"), ARRAY[]::text[]) FROM unnest(p_claves) AS u(c));
END $$;

CREATE OR REPLACE FUNCTION public.fe_e03_r05_bool(p jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
BEGIN
  RETURN p IS NOT NULL AND jsonb_typeof(p) = 'boolean';
END $$;

CREATE OR REPLACE FUNCTION public.fe_e03_r05_entero(p jsonb, p_min numeric, p_max numeric) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  v numeric;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'number' THEN
    RETURN false;
  END IF;
  v := (p #>> '{}')::numeric;
  RETURN v = trunc(v) AND v BETWEEN p_min AND p_max;
END $$;

CREATE OR REPLACE FUNCTION public.fe_e03_r05_texto(p jsonb, p_max integer, p_nulo boolean) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF p IS NULL THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(p) = 'null' THEN
    RETURN p_nulo;
  END IF;
  RETURN jsonb_typeof(p) = 'string' AND char_length(p #>> '{}') <= p_max;
END $$;

CREATE OR REPLACE FUNCTION public.fe_e03_r05_enum(p jsonb, p_valores text[]) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
BEGIN
  RETURN p IS NOT NULL AND jsonb_typeof(p) = 'string' AND (p #>> '{}') = ANY (p_valores);
END $$;

-- Lote admitido por la aplicación (gateway.ts: FORMATO_LOTE = 1..60 puntos de código sin U+0000–U+001F ni U+007F, y sin \s de JavaScript al inicio o al final). Se reproduce con listas
-- explícitas de puntos de código, NO con clases del locale (que es lo que usa NEX-080: la discrepancia se registra en el cierre, ver lote_paridad).
CREATE OR REPLACE FUNCTION public.fe_e03_r05_lote_valido(p text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_espacios constant integer[] := ARRAY[9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279];
  v_c integer;
  i integer;
BEGIN
  IF p IS NULL OR char_length(p) < 1 OR char_length(p) > 60 THEN
    RETURN false;
  END IF;
  FOR i IN 1 .. char_length(p) LOOP
    v_c := ascii(substr(p, i, 1));
    IF v_c < 32 OR v_c = 127 THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN NOT (ascii(left(p, 1)) = ANY (v_espacios) OR ascii(right(p, 1)) = ANY (v_espacios));
END $$;

-- Regla vigente de NEX-080 (registrar_envio_r05) para aceptar el lote: se replica solo para MEDIR la paridad; no se usa para decidir nada.
CREATE OR REPLACE FUNCTION public.fe_e03_r05_lote_nex080(p text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT p IS NOT NULL AND char_length(p) BETWEEN 1 AND 60 AND p !~ '[[:cntrl:]]' AND p !~ '^[[:space:]]|[[:space:]]$'
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 4) Proyección P v1: esquema cerrado, saneado, clasificación (matriz R-01…R-07 de interpretarRecepcion) y cotejo con la respuesta persistida
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Ayudantes del cotejo (R02-C01 F001), puros:
--   fe_e03_r05_alterado: un texto de la respuesta persistida que el saneado de la aplicación pudo haber cambiado («[omitido]» de secretos/JWT/Bearer o «…» de recorte > 1000 caracteres o
--   de profundidad): su valor original se desconoce y NO se coteja.
CREATE OR REPLACE FUNCTION public.fe_e03_r05_alterado(v jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT v IS NOT NULL AND jsonb_typeof(v) = 'string' AND (strpos(v #>> '{}', '[omitido]') > 0 OR right(v #>> '{}', 1) = '…')
$$;

-- Hay un punto de código fuera del plano básico (JavaScript lo cuenta como 2 unidades en .length: el largo del lote no se puede recalcular igual).
CREATE OR REPLACE FUNCTION public.fe_e03_r05_astral(p text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  i integer;
BEGIN
  IF p IS NULL THEN
    RETURN false;
  END IF;
  FOR i IN 1 .. char_length(p) LOOP
    IF ascii(substr(p, i, 1)) > 65535 THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END $$;

-- String.prototype.trim() de JavaScript (mismo conjunto de espacios y terminadores que fe_e03_r05_lote_valido).
CREATE OR REPLACE FUNCTION public.fe_e03_r05_trim_js(p text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_espacios constant integer[] := ARRAY[9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279];
  v text := p;
BEGIN
  WHILE char_length(v) > 0 AND ascii(left(v, 1)) = ANY (v_espacios) LOOP
    v := substr(v, 2);
  END LOOP;
  WHILE char_length(v) > 0 AND ascii(right(v, 1)) = ANY (v_espacios) LOOP
    v := left(v, char_length(v) - 1);
  END LOOP;
  RETURN v;
END $$;

-- Clase de UN eco explícito de la raíz (réplica de claseEco de gateway.ts): COINCIDE / CONTRADICE / NO_INTERPRETABLE, o NULL = ausencia. p_identidad = P.identidad ya validada contra el
-- snapshot transmitido; p_tipo_doc = tipoDocConsulta (FE/NCE; otro tipo → NULL).
CREATE OR REPLACE FUNCTION public.fe_e03_r05_clase_eco(p_campo text, v jsonb, p_identidad jsonb, p_tipo_doc text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_ref text;
BEGIN
  IF v IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_campo = 'dserienum' THEN
    IF p_identidad ->> 'serie_estado' = 'AUSENTE' THEN
      RETURN 'NO_INTERPRETABLE';
    END IF;
    IF jsonb_typeof(v) = 'null' THEN
      RETURN CASE WHEN p_identidad ->> 'serie_estado' = 'NULO' THEN 'COINCIDE' ELSE 'CONTRADICE' END;
    END IF;
    IF jsonb_typeof(v) <> 'string' OR (v #>> '{}') = '' THEN
      RETURN 'NO_INTERPRETABLE';
    END IF;
    RETURN CASE WHEN p_identidad ->> 'serie_estado' = 'TEXTO' AND (v #>> '{}') = (p_identidad ->> 'serie') THEN 'COINCIDE' ELSE 'CONTRADICE' END;
  END IF;
  IF jsonb_typeof(v) = 'null' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(v) <> 'string' OR (v #>> '{}') = '' THEN
    RETURN 'NO_INTERPRETABLE';
  END IF;
  IF p_campo = 'tipodoc' THEN
    IF p_tipo_doc IS NULL THEN
      RETURN 'NO_INTERPRETABLE';
    END IF;
    RETURN CASE WHEN upper(v #>> '{}') = upper(p_tipo_doc) THEN 'COINCIDE' ELSE 'CONTRADICE' END;
  END IF;
  v_ref := CASE p_campo WHEN 'dest' THEN p_identidad ->> 'establecimiento' WHEN 'dpunexp' THEN p_identidad ->> 'punto' ELSE p_identidad ->> 'numero' END;
  RETURN CASE WHEN (v #>> '{}') = v_ref THEN 'COINCIDE' ELSE 'CONTRADICE' END;
END $$;

-- Esquema P v1 (todas las claves obligatorias, ninguna adicional, <= 16384 bytes UTF-8). R02-C01: identidad con serie_estado, n_entradas 0..50, alias de lote en enum, confianza explícita.
--   {version:1, http:int, cuerpo:{json_valido:bool, raiz_objeto:bool, bytes:int>=0}, status:'AUSENTE'|'SUCCESS'|'ERROR'|'OTRO_TEXTO'|'OTRO_TIPO' (null u otro tipo JSON = OTRO_TIPO),
--    token_invalido:bool (401 → true; fuera de 4xx → false; resto de 4xx: regex de esTokenInvalido, hecho confiado), duplicado:bool, contador_rechazados_positivo:bool,
--    rechazados:{no_vacia:bool, propio:bool, n_entradas:0..50}, aceptados:{n_entradas:0..50, incluye_propio:bool, con_formato_fiscal:bool},
--    ecos:{dest|dpunexp|dnumdoc|dserienum|tipodoc: {n_variantes:0..32767, hay_coincide:bool, hay_contradice:bool, hay_no_interpretable:bool}},
--    lote:{clase:'AUSENTE'|'VALIDO'|'INVALIDO_LARGO'|'INVALIDO_FORMATO'|'INVALIDO_TIPO', clave:'nrolote'|'lote'|'numerolote'|'nrodelote'|'numerodelote'|null (alias normalizado de la
--          raíz), texto:text<=60|null (texto literal o String(entero seguro)), n_ocurrencias:0..32767},
--    cdc:{presente:bool, valor:text<=256|null, motivo:'NO_TEXTO'|'EXCEDE_LIMITE'|'CARACTER_NUL'|'CREDENCIAL'|null},
--    identidad:{tipo, establecimiento, punto, numero (textos = fila del documento y, si el snapshot los trae, = dEst/dPunExp/dNumDoc del snapshot transmitido),
--               serie_estado:'TEXTO'|'NULO'|'AUSENTE' (= seriePayload del snapshot: texto, null, ausente u otro tipo), serie:texto si TEXTO, si no null},
--    lectura:{texto_resultado:<=500|null, mensaje:<=300|null, errores_propios:[<=3 textos <=200], estado_gateway:<=120|null, request_id:<=80|null, campo_problema:<=40|null},
--    clasificacion_app:{regla, resultado, estado_local, error_tipo|null} (= clasificación SQL),
--    confianza:{verificados_sql:["http","identidad","token_invalido_fuera_4xx","clasificacion"],
--               cotejables:["cuerpo","status","ecos","contador_rechazados_positivo","lote","cdc","rechazados","aceptados"],
--               confiados_servidor:["token_invalido_4xx","duplicado","lectura","orden_alias","coercion_js","terceros_omitidos"]}}
--   verificados_sql: el banco los comprueba siempre. cotejables: se comprueban contra la respuesta persistida SOLO cuando esta los conserva (campos_cotejados dice cuáles se compararon).
--   confiados_servidor: hechos que el banco no puede recalcular (regex de token en 4xx y de duplicidad, textos de lectura, orden de claves alias perdido en jsonb, coerciones de
--   JavaScript como Number(), entradas de terceros retiradas por la aplicación): se aceptan como declarados y se dice explícitamente.
CREATE OR REPLACE FUNCTION public.fe_e03_r05_validar_proyeccion(
  p jsonb, p_http integer, p_tipo text, p_establecimiento text, p_punto text, p_numero text, p_snapshot jsonb)
RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  k text;
  e jsonb;
  v_raiz boolean;
  v_lote_clase text;
  v_lote_texto text;
  v_cdc jsonb;
  v_err jsonb;
  v_token boolean;
  v_serie_estado text;
  v_tipo_doc text := CASE p_tipo WHEN 'FE' THEN 'FE' WHEN 'NCE' THEN 'NCE' END;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'proyección no válida: no es un objeto' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INVALIDA';
  END IF;
  IF octet_length(convert_to(p::text, 'UTF8')) > 16384 THEN
    RAISE EXCEPTION 'la proyección supera 16384 bytes' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_EXCEDIDA';
  END IF;
  IF NOT public.fe_e03_r05_claves_exactas(p, ARRAY['version', 'http', 'cuerpo', 'status', 'token_invalido', 'duplicado', 'contador_rechazados_positivo', 'rechazados', 'aceptados',
                                                    'ecos', 'lote', 'cdc', 'identidad', 'lectura', 'clasificacion_app', 'confianza']) THEN
    RAISE EXCEPTION 'proyección no válida: claves de la raíz' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INVALIDA';
  END IF;
  IF NOT public.fe_e03_r05_entero(p -> 'version', 1, 1) THEN
    RAISE EXCEPTION 'proyección no válida: versión' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INVALIDA';
  END IF;
  IF p_http IS NULL OR NOT public.fe_e03_r05_entero(p -> 'http', 100, 599) OR (p ->> 'http')::integer IS DISTINCT FROM p_http THEN
    RAISE EXCEPTION 'proyección no válida: estado HTTP distinto del registrado' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INVALIDA';
  END IF;
  IF NOT public.fe_e03_r05_claves_exactas(p -> 'cuerpo', ARRAY['json_valido', 'raiz_objeto', 'bytes'])
     OR NOT public.fe_e03_r05_bool(p #> '{cuerpo,json_valido}') OR NOT public.fe_e03_r05_bool(p #> '{cuerpo,raiz_objeto}')
     OR NOT public.fe_e03_r05_entero(p #> '{cuerpo,bytes}', 0, 2147483647) THEN
    RAISE EXCEPTION 'proyección no válida: cuerpo' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INVALIDA';
  END IF;
  v_raiz := (p #>> '{cuerpo,raiz_objeto}')::boolean;
  IF v_raiz AND NOT (p #>> '{cuerpo,json_valido}')::boolean THEN
    RAISE EXCEPTION 'proyección no válida: raíz objeto sin JSON válido' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INVALIDA';
  END IF;
  IF NOT public.fe_e03_r05_enum(p -> 'status', ARRAY['AUSENTE', 'SUCCESS', 'ERROR', 'OTRO_TEXTO', 'OTRO_TIPO'])
     OR NOT public.fe_e03_r05_bool(p -> 'token_invalido') OR NOT public.fe_e03_r05_bool(p -> 'duplicado') OR NOT public.fe_e03_r05_bool(p -> 'contador_rechazados_positivo') THEN
    RAISE EXCEPTION 'proyección no válida: status o indicadores' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INVALIDA';
  END IF;
  -- R02-C01 F001: regla determinística de esTokenInvalido (gateway.ts) que el banco SÍ puede decidir: HTTP 401 → token inválido; fuera de 4xx → nunca. En el resto de 4xx el valor
  -- depende de la regex sobre la clave exacta «message»: R02-C02 (R-C01-01) la COTEJA contra la respuesta persistida cuando ésta la conserva (fe_e03_r05_token_mensaje, en el cotejo);
  -- solo cuando no es cotejable (sin respuesta, truncada, redactada, texto alterado o fuera del conjunto de caracteres demostrado) queda confiada al servidor
  -- (confiados_servidor.token_invalido_4xx_no_cotejable). Una P contradictoria no se persiste ni habilita renovación o POST 2.
  v_token := (p ->> 'token_invalido')::boolean;
  IF (p_http = 401 AND NOT v_token) OR ((p_http < 400 OR p_http >= 500) AND v_token) THEN
    RAISE EXCEPTION 'proyección no válida: token_invalido contradice el estado HTTP' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INVALIDA';
  END IF;
  -- R02-C02 (R-C01-02): entradasPorNumero toma los primeros 50 ELEMENTOS de cada lista y expande TODAS sus entradas (texto → 1; objeto → una por clave; array interno → una por índice,
  -- vía Object.entries): las entradas expandidas pueden ser más de 50. n_entradas = conteo de entradas saturado en 0..32767; propio / incluye_propio / con_formato_fiscal se calculan
  -- sobre TODAS las entradas de esos 50 elementos, también después de saturar el conteo.
  IF NOT public.fe_e03_r05_claves_exactas(p -> 'rechazados', ARRAY['no_vacia', 'propio', 'n_entradas'])
     OR NOT public.fe_e03_r05_bool(p #> '{rechazados,no_vacia}') OR NOT public.fe_e03_r05_bool(p #> '{rechazados,propio}')
     OR NOT public.fe_e03_r05_entero(p #> '{rechazados,n_entradas}', 0, 32767)
     OR ((p #>> '{rechazados,n_entradas}')::integer > 0) <> (p #>> '{rechazados,no_vacia}')::boolean
     OR ((p #>> '{rechazados,propio}')::boolean AND NOT (p #>> '{rechazados,no_vacia}')::boolean) THEN
    RAISE EXCEPTION 'proyección no válida: rechazados' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INVALIDA';
  END IF;
  IF NOT public.fe_e03_r05_claves_exactas(p -> 'aceptados', ARRAY['n_entradas', 'incluye_propio', 'con_formato_fiscal'])
     OR NOT public.fe_e03_r05_entero(p #> '{aceptados,n_entradas}', 0, 32767)
     OR NOT public.fe_e03_r05_bool(p #> '{aceptados,incluye_propio}') OR NOT public.fe_e03_r05_bool(p #> '{aceptados,con_formato_fiscal}')
     OR ((p #>> '{aceptados,incluye_propio}')::boolean AND NOT (p #>> '{aceptados,con_formato_fiscal}')::boolean)
     OR ((p #>> '{aceptados,con_formato_fiscal}')::boolean AND (p #>> '{aceptados,n_entradas}')::integer = 0) THEN
    RAISE EXCEPTION 'proyección no válida: aceptados' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INVALIDA';
  END IF;
  IF NOT public.fe_e03_r05_claves_exactas(p -> 'ecos', ARRAY['dest', 'dpunexp', 'dnumdoc', 'dserienum', 'tipodoc']) THEN
    RAISE EXCEPTION 'proyección no válida: ecos' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INVALIDA';
  END IF;
  FOREACH k IN ARRAY ARRAY['dest', 'dpunexp', 'dnumdoc', 'dserienum', 'tipodoc'] LOOP
    e := p -> 'ecos' -> k;
    IF NOT public.fe_e03_r05_claves_exactas(e, ARRAY['n_variantes', 'hay_coincide', 'hay_contradice', 'hay_no_interpretable'])
       OR NOT public.fe_e03_r05_entero(e -> 'n_variantes', 0, 32767)
       OR NOT public.fe_e03_r05_bool(e -> 'hay_coincide') OR NOT public.fe_e03_r05_bool(e -> 'hay_contradice') OR NOT public.fe_e03_r05_bool(e -> 'hay_no_interpretable')
       OR (((e ->> 'hay_coincide')::boolean OR (e ->> 'hay_contradice')::boolean OR (e ->> 'hay_no_interpretable')::boolean) <> ((e ->> 'n_variantes')::integer > 0)) THEN
      RAISE EXCEPTION 'proyección no válida: eco %', k USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INVALIDA';
    END IF;
  END LOOP;
  IF NOT public.fe_e03_r05_claves_exactas(p -> 'lote', ARRAY['clase', 'clave', 'texto', 'n_ocurrencias'])
     OR NOT public.fe_e03_r05_enum(p #> '{lote,clase}', ARRAY['AUSENTE', 'VALIDO', 'INVALIDO_LARGO', 'INVALIDO_FORMATO', 'INVALIDO_TIPO'])
     OR NOT (jsonb_typeof(p #> '{lote,clave}') = 'null' OR public.fe_e03_r05_enum(p #> '{lote,clave}', ARRAY['nrolote', 'lote', 'numerolote', 'nrodelote', 'numerodelote']))
     OR NOT public.fe_e03_r05_texto(p #> '{lote,texto}', 60, true)
     OR NOT public.fe_e03_r05_entero(p #> '{lote,n_ocurrencias}', 0, 32767) THEN
    RAISE EXCEPTION 'proyección no válida: lote' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INVALIDA';
  END IF;
  v_lote_clase := p #>> '{lote,clase}';
  v_lote_texto := p #>> '{lote,texto}';
  IF (v_lote_clase = 'AUSENTE') <> ((p #>> '{lote,n_ocurrencias}')::integer = 0)
     OR (v_lote_clase = 'AUSENTE') <> (jsonb_typeof(p #> '{lote,clave}') = 'null')
     OR (v_lote_clase = 'VALIDO') <> (v_lote_texto IS NOT NULL)
     OR (v_lote_clase = 'VALIDO' AND NOT public.fe_e03_r05_lote_valido(v_lote_texto)) THEN
    RAISE EXCEPTION 'proyección no válida: coherencia del lote' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INVALIDA';
  END IF;
  v_cdc := p -> 'cdc';
  IF NOT public.fe_e03_r05_claves_exactas(v_cdc, ARRAY['presente', 'valor', 'motivo']) OR NOT public.fe_e03_r05_bool(v_cdc -> 'presente')
     OR NOT public.fe_e03_r05_texto(v_cdc -> 'valor', 256, true)
     OR NOT (jsonb_typeof(v_cdc -> 'motivo') = 'null' OR public.fe_e03_r05_enum(v_cdc -> 'motivo', ARRAY['NO_TEXTO', 'EXCEDE_LIMITE', 'CARACTER_NUL', 'CREDENCIAL']))
     OR (NOT (v_cdc ->> 'presente')::boolean AND (jsonb_typeof(v_cdc -> 'valor') <> 'null' OR jsonb_typeof(v_cdc -> 'motivo') <> 'null'))
     OR ((v_cdc ->> 'presente')::boolean AND (jsonb_typeof(v_cdc -> 'valor') = 'null') = (jsonb_typeof(v_cdc -> 'motivo') = 'null')) THEN
    RAISE EXCEPTION 'proyección no válida: cdc' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INVALIDA';
  END IF;
  -- Sin raíz objeto, nada de la raíz pudo leerse: todos los hechos de la raíz en su valor neutro (también token_invalido salvo 401: esTokenInvalido usa JSON.parse(...).message).
  IF NOT v_raiz AND (p ->> 'status' <> 'AUSENTE' OR (p ->> 'duplicado')::boolean OR (p ->> 'contador_rechazados_positivo')::boolean
                     OR (p #>> '{rechazados,no_vacia}')::boolean OR (p #>> '{aceptados,n_entradas}')::integer > 0 OR v_lote_clase <> 'AUSENTE'
                     OR (v_cdc ->> 'presente')::boolean OR (v_token AND p_http <> 401)
                     OR EXISTS (SELECT 1 FROM jsonb_each(p -> 'ecos') x WHERE (x.value ->> 'n_variantes')::integer > 0)) THEN
    RAISE EXCEPTION 'proyección no válida: hechos de la raíz sin raíz objeto' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INVALIDA';
  END IF;

  -- R02-C01 F001: identidad estrictamente tipada = la identidad que la aplicación compara (fila del documento) y la del snapshot EFECTIVAMENTE transmitido (versión de la operación).
  IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'falta el snapshot transmitido de la operación' USING ERRCODE = 'P0001', DETAIL = 'NEX:IDENTIDAD_SNAPSHOT_DISTINTA';
  END IF;
  IF (p_snapshot ? 'dEst' AND (jsonb_typeof(p_snapshot -> 'dEst') <> 'string' OR (p_snapshot ->> 'dEst') IS DISTINCT FROM p_establecimiento))
     OR (p_snapshot ? 'dPunExp' AND (jsonb_typeof(p_snapshot -> 'dPunExp') <> 'string' OR (p_snapshot ->> 'dPunExp') IS DISTINCT FROM p_punto))
     OR (p_snapshot ? 'dNumDoc' AND (jsonb_typeof(p_snapshot -> 'dNumDoc') <> 'string' OR (p_snapshot ->> 'dNumDoc') IS DISTINCT FROM p_numero)) THEN
    RAISE EXCEPTION 'la identidad del snapshot transmitido no coincide con la del documento' USING ERRCODE = 'P0001', DETAIL = 'NEX:IDENTIDAD_SNAPSHOT_DISTINTA';
  END IF;
  -- seriePayload: dSerieNum texto → TEXTO; null → NULO; ausente u otro tipo → AUSENTE (un eco de serie no se puede comparar: NO_INTERPRETABLE).
  v_serie_estado := CASE WHEN NOT p_snapshot ? 'dSerieNum' THEN 'AUSENTE' WHEN jsonb_typeof(p_snapshot -> 'dSerieNum') = 'string' THEN 'TEXTO'
                         WHEN jsonb_typeof(p_snapshot -> 'dSerieNum') = 'null' THEN 'NULO' ELSE 'AUSENTE' END;
  IF NOT public.fe_e03_r05_claves_exactas(p -> 'identidad', ARRAY['tipo', 'establecimiento', 'punto', 'numero', 'serie_estado', 'serie'])
     OR jsonb_typeof(p #> '{identidad,tipo}') IS DISTINCT FROM 'string' OR jsonb_typeof(p #> '{identidad,establecimiento}') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p #> '{identidad,punto}') IS DISTINCT FROM 'string' OR jsonb_typeof(p #> '{identidad,numero}') IS DISTINCT FROM 'string'
     OR (p #>> '{identidad,tipo}') IS DISTINCT FROM p_tipo OR (p #>> '{identidad,establecimiento}') IS DISTINCT FROM p_establecimiento
     OR (p #>> '{identidad,punto}') IS DISTINCT FROM p_punto OR (p #>> '{identidad,numero}') IS DISTINCT FROM p_numero
     OR NOT public.fe_e03_r05_enum(p #> '{identidad,serie_estado}', ARRAY['TEXTO', 'NULO', 'AUSENTE']) OR (p #>> '{identidad,serie_estado}') IS DISTINCT FROM v_serie_estado
     OR (v_serie_estado = 'TEXTO' AND (jsonb_typeof(p #> '{identidad,serie}') IS DISTINCT FROM 'string' OR (p #>> '{identidad,serie}') IS DISTINCT FROM (p_snapshot ->> 'dSerieNum')))
     OR (v_serie_estado <> 'TEXTO' AND jsonb_typeof(p #> '{identidad,serie}') IS DISTINCT FROM 'null') THEN
    RAISE EXCEPTION 'proyección no válida: identidad distinta de la del documento o del snapshot transmitido' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INVALIDA';
  END IF;
  -- Ecos imposibles para esa identidad (claseEco): serie AUSENTE → todo eco de serie es NO_INTERPRETABLE; tipo sin valor contractual → todo eco de tipo es NO_INTERPRETABLE.
  IF (v_serie_estado = 'AUSENTE' AND ((p #>> '{ecos,dserienum,hay_coincide}')::boolean OR (p #>> '{ecos,dserienum,hay_contradice}')::boolean))
     OR (v_tipo_doc IS NULL AND ((p #>> '{ecos,tipodoc,hay_coincide}')::boolean OR (p #>> '{ecos,tipodoc,hay_contradice}')::boolean)) THEN
    RAISE EXCEPTION 'proyección no válida: eco incompatible con la identidad transmitida' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INVALIDA';
  END IF;

  IF NOT public.fe_e03_r05_claves_exactas(p -> 'lectura', ARRAY['texto_resultado', 'mensaje', 'errores_propios', 'estado_gateway', 'request_id', 'campo_problema'])
     OR NOT public.fe_e03_r05_texto(p #> '{lectura,texto_resultado}', 500, true) OR NOT public.fe_e03_r05_texto(p #> '{lectura,mensaje}', 300, true)
     OR NOT public.fe_e03_r05_texto(p #> '{lectura,estado_gateway}', 120, true) OR NOT public.fe_e03_r05_texto(p #> '{lectura,request_id}', 80, true)
     OR NOT public.fe_e03_r05_texto(p #> '{lectura,campo_problema}', 40, true)
     OR jsonb_typeof(p #> '{lectura,errores_propios}') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'proyección no válida: lectura' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INVALIDA';
  END IF;
  IF jsonb_array_length(p #> '{lectura,errores_propios}') > 3 THEN
    RAISE EXCEPTION 'proyección no válida: más de 3 errores propios' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INVALIDA';
  END IF;
  FOR v_err IN SELECT x FROM jsonb_array_elements(p #> '{lectura,errores_propios}') AS t(x) LOOP
    IF NOT public.fe_e03_r05_texto(v_err, 200, false) THEN
      RAISE EXCEPTION 'proyección no válida: errores propios' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INVALIDA';
    END IF;
  END LOOP;
  IF NOT public.fe_e03_r05_claves_exactas(p -> 'clasificacion_app', ARRAY['regla', 'resultado', 'estado_local', 'error_tipo'])
     OR NOT public.fe_e03_r05_texto(p #> '{clasificacion_app,regla}', 40, false)
     OR NOT public.fe_e03_r05_enum(p #> '{clasificacion_app,resultado}', ARRAY['OK', 'ERROR_HTTP', 'RESPUESTA_INVALIDA'])
     OR NOT public.fe_e03_r05_enum(p #> '{clasificacion_app,estado_local}', ARRAY['ENVIADO', 'ERROR_ENVIO', 'ENVIO_INDETERMINADO'])
     OR NOT (jsonb_typeof(p #> '{clasificacion_app,error_tipo}') = 'null' OR public.fe_e03_r05_enum(p #> '{clasificacion_app,error_tipo}', ARRAY['AUTENTICACION', 'RECHAZO', 'TRANSITORIO'])) THEN
    RAISE EXCEPTION 'proyección no válida: clasificación de la aplicación' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INVALIDA';
  END IF;
  IF NOT public.fe_e03_r05_claves_exactas(p -> 'confianza', ARRAY['verificados_sql', 'cotejables', 'confiados_servidor'])
     OR p #> '{confianza,verificados_sql}' <> '["http", "identidad", "token_invalido_fuera_4xx", "clasificacion"]'::jsonb
     OR p #> '{confianza,cotejables}' <> '["cuerpo", "status", "token_invalido_4xx", "ecos", "contador_rechazados_positivo", "lote", "cdc", "rechazados", "aceptados"]'::jsonb
     OR p #> '{confianza,confiados_servidor}' <> '["token_invalido_4xx_no_cotejable", "duplicado", "lectura", "orden_alias", "coercion_js", "terceros_omitidos"]'::jsonb THEN
    RAISE EXCEPTION 'proyección no válida: confianza' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INVALIDA';
  END IF;
EXCEPTION WHEN data_exception THEN
  -- Conversión imposible (p. ej. un tipo inesperado que escapó a un control previo): misma respuesta cerrada, sin repetir el valor.
  RAISE EXCEPTION 'proyección no válida: representación incompatible' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INVALIDA';
END $$;

-- Saneado de P antes de persistir: textos de lectura redactados; CDC con forma de credencial omitido (solo el valor: presente = true, motivo CREDENCIAL); lote con credencial → se rechaza
-- (un ACK cuyo lote no puede conservarse sin secreto no se certifica: queda sin P → cierre indeterminado, D-C02-2-A). Cualquier residuo en el total también se rechaza sin repetir el valor.
CREATE OR REPLACE FUNCTION public.fe_e03_r05_sanear_proyeccion(p jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_txt text;
  v_lectura jsonb;
  v_cdc text := p #>> '{cdc,valor}';
  v_lote text := p #>> '{lote,texto}';
  v jsonb := p;
BEGIN
  v_txt := public.fe_e03_redactar_texto((p -> 'lectura')::text);
  BEGIN
    v_lectura := v_txt::jsonb;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'la lectura de la proyección contiene credenciales que no se pudieron redactar' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVIDENCIA_CON_CREDENCIALES';
  END;
  v := jsonb_set(v, '{lectura}', v_lectura);
  IF v_cdc IS NOT NULL AND (public.fe_e03_redactar_texto(v_cdc) IS DISTINCT FROM v_cdc OR public.fe_e03_secreto_residual(v_cdc)) THEN
    v := jsonb_set(v, '{cdc}', jsonb_build_object('presente', true, 'valor', NULL, 'motivo', 'CREDENCIAL'));
  END IF;
  IF v_lote IS NOT NULL AND (public.fe_e03_redactar_texto(v_lote) IS DISTINCT FROM v_lote OR public.fe_e03_secreto_residual(v_lote)) THEN
    RAISE EXCEPTION 'el lote de la proyección tiene forma de credencial: no se certifica' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVIDENCIA_CON_CREDENCIALES';
  END IF;
  IF public.fe_e03_secreto_residual(v::text) THEN
    RAISE EXCEPTION 'la proyección contiene credenciales que no se pudieron redactar' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVIDENCIA_CON_CREDENCIALES';
  END IF;
  RETURN v;
END $$;

-- Clasificación SQL (fuente de verdad del cierre): réplica de interpretarRecepcion (gateway.ts) sobre los hechos de P. Fase siempre TRANSMISION. Reglas:
--   R-01 token inválido → ERROR_HTTP/ERROR_ENVIO/AUTENTICACION · R-02a rechazo propio · R-02b rechazo propio con eco problemático (INDET) · R-02c rechazos no atribuibles (INDET)
--   R-03 5xx (INDET) · R-04a 408/409/423/425 o duplicado (INDET) · R-04b 401/403 (AUTENTICACION) · R-04c 429 (TRANSITORIO) · R-04d 4xx NCE (INDET) · R-04e 4xx con eco problemático (INDET)
--   R-04f 4xx rechazo · R-05a error NCE (INDET) · R-05b error duplicado (INDET) · R-05c error FE rechazo · R-05d error FE con eco problemático (INDET)
--   R-06a…R-06h success: eco problemático / eco no coincide / aceptados ajenos / lote largo / lote inválido (INDET) · R-06f lote válido (OK) · R-06g eco íntegro (OK) · R-06h sin identificación
--   R-07 resto (INDET, RESPUESTA_INVALIDA).
CREATE OR REPLACE FUNCTION public.fe_e03_clasificar_recepcion_r05(p jsonb, p_tipo text)
RETURNS TABLE (o_regla text, o_resultado text, o_estado_local text, o_error_tipo text)
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_http integer := (p ->> 'http')::integer;
  v_token boolean := (p ->> 'token_invalido')::boolean;
  v_dup boolean := (p ->> 'duplicado')::boolean;
  v_contador boolean := (p ->> 'contador_rechazados_positivo')::boolean;
  v_no_vacia boolean := (p #>> '{rechazados,no_vacia}')::boolean;
  v_propio boolean := (p #>> '{rechazados,propio}')::boolean;
  v_acep_propio boolean := (p #>> '{aceptados,incluye_propio}')::boolean;
  v_con_formato boolean := (p #>> '{aceptados,con_formato_fiscal}')::boolean;
  v_raiz boolean := (p #>> '{cuerpo,raiz_objeto}')::boolean;
  v_status text := p ->> 'status';
  v_lote text := p #>> '{lote,clase}';
  v_nce boolean := p_tipo = 'NCE';
  v_problema boolean;
  v_hay_eco boolean;
  v_eco_ok boolean;
BEGIN
  SELECT coalesce(bool_or((x.value ->> 'hay_contradice')::boolean OR (x.value ->> 'hay_no_interpretable')::boolean), false) INTO v_problema FROM jsonb_each(p -> 'ecos') x;
  v_hay_eco := (p #>> '{ecos,dest,n_variantes}')::integer > 0 OR (p #>> '{ecos,dpunexp,n_variantes}')::integer > 0 OR (p #>> '{ecos,dnumdoc,n_variantes}')::integer > 0;
  v_eco_ok := NOT v_problema AND (p #>> '{ecos,dest,hay_coincide}')::boolean AND (p #>> '{ecos,dpunexp,hay_coincide}')::boolean AND (p #>> '{ecos,dnumdoc,hay_coincide}')::boolean;

  IF v_token THEN
    RETURN QUERY SELECT 'R-01', 'ERROR_HTTP', 'ERROR_ENVIO', 'AUTENTICACION'; RETURN;
  END IF;
  IF v_http < 500 AND (v_no_vacia OR v_contador) THEN
    IF v_propio AND NOT v_acep_propio AND NOT v_dup THEN
      IF v_problema THEN
        RETURN QUERY SELECT 'R-02b', 'ERROR_HTTP', 'ENVIO_INDETERMINADO', NULL::text; RETURN;
      END IF;
      RETURN QUERY SELECT 'R-02a', 'ERROR_HTTP', 'ERROR_ENVIO', 'RECHAZO'; RETURN;
    END IF;
    RETURN QUERY SELECT 'R-02c', 'ERROR_HTTP', 'ENVIO_INDETERMINADO', NULL::text; RETURN;
  END IF;
  IF v_http >= 500 THEN
    RETURN QUERY SELECT 'R-03', 'ERROR_HTTP', 'ENVIO_INDETERMINADO', NULL::text; RETURN;
  END IF;
  IF v_http >= 400 THEN
    IF v_http IN (408, 409, 423, 425) OR v_dup THEN
      RETURN QUERY SELECT 'R-04a', 'ERROR_HTTP', 'ENVIO_INDETERMINADO', NULL::text; RETURN;
    END IF;
    IF v_http IN (401, 403) THEN
      RETURN QUERY SELECT 'R-04b', 'ERROR_HTTP', 'ERROR_ENVIO', 'AUTENTICACION'; RETURN;
    END IF;
    IF v_http = 429 THEN
      RETURN QUERY SELECT 'R-04c', 'ERROR_HTTP', 'ERROR_ENVIO', 'TRANSITORIO'; RETURN;
    END IF;
    IF v_nce THEN
      RETURN QUERY SELECT 'R-04d', 'ERROR_HTTP', 'ENVIO_INDETERMINADO', NULL::text; RETURN;
    END IF;
    IF v_problema THEN
      RETURN QUERY SELECT 'R-04e', 'ERROR_HTTP', 'ENVIO_INDETERMINADO', NULL::text; RETURN;
    END IF;
    RETURN QUERY SELECT 'R-04f', 'ERROR_HTTP', 'ERROR_ENVIO', 'RECHAZO'; RETURN;
  END IF;
  IF v_http BETWEEN 200 AND 299 AND v_raiz THEN
    IF v_status = 'ERROR' THEN
      IF v_nce AND NOT v_dup THEN
        RETURN QUERY SELECT 'R-05a', 'ERROR_HTTP', 'ENVIO_INDETERMINADO', NULL::text; RETURN;
      END IF;
      IF v_dup THEN
        RETURN QUERY SELECT 'R-05b', 'ERROR_HTTP', 'ENVIO_INDETERMINADO', NULL::text; RETURN;
      END IF;
      IF v_problema THEN
        RETURN QUERY SELECT 'R-05d', 'ERROR_HTTP', 'ENVIO_INDETERMINADO', NULL::text; RETURN;
      END IF;
      RETURN QUERY SELECT 'R-05c', 'ERROR_HTTP', 'ERROR_ENVIO', 'RECHAZO'; RETURN;
    END IF;
    IF v_status = 'SUCCESS' THEN
      IF v_problema THEN
        RETURN QUERY SELECT 'R-06a', 'RESPUESTA_INVALIDA', 'ENVIO_INDETERMINADO', NULL::text; RETURN;
      END IF;
      IF v_hay_eco AND NOT v_eco_ok THEN
        RETURN QUERY SELECT 'R-06b', 'RESPUESTA_INVALIDA', 'ENVIO_INDETERMINADO', NULL::text; RETURN;
      END IF;
      IF v_con_formato AND NOT v_acep_propio THEN
        RETURN QUERY SELECT 'R-06c', 'RESPUESTA_INVALIDA', 'ENVIO_INDETERMINADO', NULL::text; RETURN;
      END IF;
      IF v_lote = 'INVALIDO_LARGO' THEN
        RETURN QUERY SELECT 'R-06d', 'RESPUESTA_INVALIDA', 'ENVIO_INDETERMINADO', NULL::text; RETURN;
      END IF;
      IF v_lote IN ('INVALIDO_FORMATO', 'INVALIDO_TIPO') THEN
        RETURN QUERY SELECT 'R-06e', 'RESPUESTA_INVALIDA', 'ENVIO_INDETERMINADO', NULL::text; RETURN;
      END IF;
      IF v_lote = 'VALIDO' THEN
        RETURN QUERY SELECT 'R-06f', 'OK', 'ENVIADO', NULL::text; RETURN;
      END IF;
      IF v_eco_ok THEN
        RETURN QUERY SELECT 'R-06g', 'OK', 'ENVIADO', NULL::text; RETURN;
      END IF;
      RETURN QUERY SELECT 'R-06h', 'RESPUESTA_INVALIDA', 'ENVIO_INDETERMINADO', NULL::text; RETURN;
    END IF;
  END IF;
  RETURN QUERY SELECT 'R-07', 'RESPUESTA_INVALIDA', 'ENVIO_INDETERMINADO', NULL::text;
END $$;

-- R02-C02 (R-C01-01): esTokenInvalido de gateway.ts para HTTP 4xx distinto de 401, recalculado sobre la respuesta saneada PERSISTIDA (la que cotejar ya recibió íntegra: no ausente,
-- no truncada, no redactada por el banco). Devuelve true / false cuando el resultado de la aplicación es DETERMINABLE y NULL cuando no es cotejable:
--   · raíz no objeto (array, número, texto, null JSON), clave exacta «message» ausente, null o no texto → false: JSON.parse(cuerpo).message no es texto y la regex no se evalúa
--     (el saneado conserva la clave «message», que no es clave secreta, y su tipo, porque está en la raíz);
--   · texto alterado por el saneado («[omitido]» de secretos o «…» de recorte, fe_e03_r05_alterado) → NULL: el original se desconoce;
--   · texto con algún carácter fuera de {U+0009–U+000D, U+0020–U+007E, U+00A1–U+00FF} → NULL (no cotejable por representación: no se afirma equivalencia Unicode general);
--   · dentro de ese conjunto, /token\s+(inv[aá]lid|vencid|expirad|no\s+v[aá]lid)|invalid\s+token|token\s+(is\s+)?(invalid|expired)/i es equivalente a la expresión de abajo:
--     \s de JavaScript ∩ conjunto = {U+0009–U+000D, U+0020} (U+00A0 queda fuera del conjunto); sin indicador «u», la insensibilidad a mayúsculas canoniza con toUpperCase de UN
--     carácter y nunca de no-ASCII a ASCII, por lo que en el conjunto solo identifica A–Z con a–z y Á (U+00C1) con á (U+00E1); ningún otro carácter del conjunto coincide con un
--     carácter del patrón. Se normaliza explícitamente (translate, sin depender de la intercalación ni de lower()) y se evalúa con «~» sensible a mayúsculas.
CREATE OR REPLACE FUNCTION public.fe_e03_r05_token_mensaje(p_respuesta jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  v jsonb;
  m text;
  i integer;
  c integer;
BEGIN
  IF p_respuesta IS NULL THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p_respuesta) <> 'object' OR NOT p_respuesta ? 'message' OR jsonb_typeof(p_respuesta -> 'message') <> 'string' THEN
    RETURN false;
  END IF;
  v := p_respuesta -> 'message';
  IF public.fe_e03_r05_alterado(v) THEN
    RETURN NULL;
  END IF;
  m := v #>> '{}';
  FOR i IN 1 .. char_length(m) LOOP
    c := ascii(substr(m, i, 1));
    IF NOT (c BETWEEN 9 AND 13 OR c BETWEEN 32 AND 126 OR c BETWEEN 161 AND 255) THEN
      RETURN NULL;
    END IF;
  END LOOP;
  m := translate(m, chr(9) || chr(10) || chr(11) || chr(12) || chr(13), '     ');
  m := translate(m, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' || chr(193), 'abcdefghijklmnopqrstuvwxyz' || chr(225));
  RETURN m ~ ('token +(inv[a' || chr(225) || ']lid|vencid|expirad|no +v[a' || chr(225) || ']lid)|invalid +token|token +(is +)?(invalid|expired)');
END $$;

-- Cotejo de P con la respuesta saneada PERSISTIDA del mismo POST (R02-C01 F001). Se recalcula en SQL, con las reglas de interpretarRecepcion, todo hecho que la respuesta persistida
-- CONSERVA, y se exige igualdad con P; una diferencia → NEX:PROYECCION_INCOHERENTE (la salida se registra sin P y el cierre queda indeterminado, D-C02-2-A). Lo que el saneado, el
-- truncamiento, la coerción o jsonb perdieron NO se declara cotejado (campos_cotejados enumera exactamente lo comparado):
--   · respuesta ausente / truncada / redactada por el banco → NO_COTEJABLE_* (sin comparar nada);
--   · status: clave exacta «status» (ausente → AUSENTE; no texto, incluido null → OTRO_TIPO; texto conservado → SUCCESS/ERROR/OTRO_TEXTO; texto alterado por el saneado → no se coteja);
--   · token_invalido con HTTP 4xx distinto de 401 (R02-C02 R-C01-01): fe_e03_r05_token_mensaje sobre la clave exacta «message»; determinable → igualdad exigida (un falso positivo,
--     p. ej. 403 {"status":"error"} con token_invalido = true, o un falso negativo → NEX:PROYECCION_INCOHERENTE, la P no se persiste y no habilita renovación ni POST 2);
--     NULL → no se coteja (queda confiado: confiados_servidor.token_invalido_4xx_no_cotejable). 401 y fuera de 4xx ya los decide el validador;
--   · ecos dEst/dPunExp/dNumDoc/dSerieNum/tipoDoc: todas las claves de la raíz que normalizan al campo, clase por fe_e03_r05_clase_eco contra la identidad transmitida (serie del snapshot);
--     un valor alterado, o un tipoDoc no ASCII (mayúsculas JS ≠ SQL), deja ESE eco sin cotejar;
--   · contador_rechazados_positivo: clave exacta «rechazados» ausente/null/número/booleano (Number() de JavaScript); texto, objeto o lista → coerción JS no recalculable, no se coteja;
--   · lote: n_ocurrencias siempre; con UNA ocurrencia, alias, clase y texto (texto literal, o String(entero seguro) para un número); con varias, el orden de claves que eligió
--     JavaScript se perdió en jsonb: solo el conteo. Un texto con puntos de código > U+FFFF (largo UTF-16 ≠ puntos de código) no permite recalcular la clase;
--   · cdc: presente siempre; con UNA ocurrencia, valor y motivo (NO_TEXTO / EXCEDE_LIMITE en puntos de código como cdcInformadoPorApi). Un CDC omitido por credencial no se coteja.
--     El CDC nunca es criterio de ACK;
--   · rechazados / aceptados: con UNA clave «response» objeto y sin OtrosDocumentosOmitidos (la aplicación no retiró terceros), el MISMO algoritmo que entradasPorNumero sobre los
--     primeros 50 ELEMENTOS (R02-C02 R-C01-02): texto → 1 entrada (trim de JS); objeto → una entrada por clave (trim de JS); array interno → una entrada por índice («0», «1»…: nunca
--     igual al número fiscal ni con formato fiscal); null, número y booleano → ignorados. Conteo saturado en 32767, sin acumular nombres; propio / incluye_propio / con_formato_fiscal
--     sobre TODAS las entradas. El saneado conserva 50 elementos de un array interno: si alguno llega con 50, el conteo original puede ser mayor y n_entradas solo se coteja como cota
--     inferior (campo «<lista>.conteo_cota_inferior»; sin saturar no se declara cotejado el conteo exacto). Con terceros retirados, varias claves alias o claves/textos alterados:
--     no se cotejan.
-- Las claves de la raíz (y de response) deben ser ASCII sin «[omitido]» para cotejar hechos que dependen de la normalización de claves (lower() de SQL ≠ toLowerCase() de JS fuera de ASCII).
CREATE OR REPLACE FUNCTION public.fe_e03_r05_cotejar(p jsonb, p_respuesta jsonb, p_truncada boolean, p_redactada boolean)
RETURNS TABLE (o_cotejo text, o_campos text[])
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_campos text[] := ARRAY[]::text[];
  v_raiz boolean;
  v_status text;
  v_claves_ok boolean;
  v_n integer;
  v_valor jsonb;
  v_clave text;
  v_campo text;
  v_clase text;
  v_var integer;
  v_co boolean;
  v_cn boolean;
  v_ni boolean;
  v_omitir boolean;
  v_contador boolean;
  v_idn jsonb := p -> 'identidad';
  v_tipo_doc text := CASE p #>> '{identidad,tipo}' WHEN 'FE' THEN 'FE' WHEN 'NCE' THEN 'NCE' END;
  v_numero_fiscal text := (p #>> '{identidad,establecimiento}') || '-' || (p #>> '{identidad,punto}') || '-' || (p #>> '{identidad,numero}');
  v_resp jsonb;
  v_lista jsonb;
  v_item jsonb;
  v_texto text;
  v_http integer := (p ->> 'http')::integer;
  v_token boolean;
  v_cnt integer;
  v_cota boolean;
  v_propio boolean;
  v_formato boolean;
  x record;
  y record;
BEGIN
  IF p_respuesta IS NULL THEN
    RETURN QUERY SELECT 'NO_COTEJABLE_SIN_CUERPO', v_campos; RETURN;
  END IF;
  IF p_truncada OR (jsonb_typeof(p_respuesta) = 'object' AND p_respuesta ? 'truncado') THEN
    RETURN QUERY SELECT 'NO_COTEJABLE_TRUNCADA', v_campos; RETURN;
  END IF;
  IF p_redactada THEN
    RETURN QUERY SELECT 'NO_COTEJABLE_REDACTADA', v_campos; RETURN;
  END IF;

  -- Una respuesta persistida implica cuerpo JSON válido (la aplicación guarda null si no lo es).
  IF NOT (p #>> '{cuerpo,json_valido}')::boolean THEN
    RAISE EXCEPTION 'la proyección declara cuerpo no JSON pero hay respuesta persistida' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INCOHERENTE';
  END IF;
  v_campos := array_append(v_campos, 'cuerpo.json_valido'::text);
  v_raiz := jsonb_typeof(p_respuesta) = 'object';
  IF v_raiz <> (p #>> '{cuerpo,raiz_objeto}')::boolean THEN
    RAISE EXCEPTION 'la proyección no coincide con la respuesta persistida (raíz)' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INCOHERENTE';
  END IF;
  v_campos := array_append(v_campos, 'cuerpo.raiz_objeto'::text);
  -- token_invalido con HTTP 4xx distinto de 401 (R02-C02 R-C01-01): ANTES del retorno por raíz no objeto, porque con raíz no objeto el resultado es determinable (false)
  IF v_http BETWEEN 400 AND 499 AND v_http <> 401 THEN
    v_token := public.fe_e03_r05_token_mensaje(p_respuesta);
    IF v_token IS NOT NULL THEN
      IF v_token <> (p ->> 'token_invalido')::boolean THEN
        RAISE EXCEPTION 'la proyección no coincide con la respuesta persistida (token_invalido)' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INCOHERENTE';
      END IF;
      v_campos := array_append(v_campos, 'token_invalido'::text);
    END IF;
  END IF;
  IF NOT v_raiz THEN
    RETURN QUERY SELECT 'COTEJADO_PARCIAL', v_campos; RETURN;
  END IF;

  -- status (raiz.status, clave exacta)
  IF NOT p_respuesta ? 'status' THEN
    v_status := 'AUSENTE';
  ELSIF jsonb_typeof(p_respuesta -> 'status') <> 'string' THEN
    v_status := 'OTRO_TIPO';
  ELSIF public.fe_e03_r05_alterado(p_respuesta -> 'status') THEN
    v_status := NULL;
  ELSE
    v_status := CASE p_respuesta ->> 'status' WHEN 'success' THEN 'SUCCESS' WHEN 'error' THEN 'ERROR' ELSE 'OTRO_TEXTO' END;
  END IF;
  IF v_status IS NOT NULL THEN
    IF v_status <> p ->> 'status' THEN
      RAISE EXCEPTION 'la proyección no coincide con la respuesta persistida (status)' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INCOHERENTE';
    END IF;
    v_campos := array_append(v_campos, 'status'::text);
  END IF;

  -- contador_rechazados_positivo (Number(raiz.rechazados) > 0, clave exacta)
  v_contador := CASE WHEN NOT p_respuesta ? 'rechazados' OR jsonb_typeof(p_respuesta -> 'rechazados') = 'null' THEN false
                     WHEN jsonb_typeof(p_respuesta -> 'rechazados') = 'number' THEN (p_respuesta ->> 'rechazados')::numeric > 0
                     WHEN jsonb_typeof(p_respuesta -> 'rechazados') = 'boolean' THEN (p_respuesta ->> 'rechazados')::boolean END;
  IF v_contador IS NOT NULL THEN
    IF v_contador <> (p ->> 'contador_rechazados_positivo')::boolean THEN
      RAISE EXCEPTION 'la proyección no coincide con la respuesta persistida (contador de rechazados)' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INCOHERENTE';
    END IF;
    v_campos := array_append(v_campos, 'contador_rechazados_positivo'::text);
  END IF;

  SELECT coalesce(bool_and(k ~ '^[ -~]*$' AND strpos(k, '[omitido]') = 0), true) INTO v_claves_ok FROM jsonb_object_keys(p_respuesta) AS t(k);
  IF v_claves_ok THEN
    -- Ecos de identidad
    FOREACH v_campo IN ARRAY ARRAY['dest', 'dpunexp', 'dnumdoc', 'dserienum', 'tipodoc'] LOOP
      v_var := 0; v_co := false; v_cn := false; v_ni := false; v_omitir := false;
      FOR x IN SELECT j.key, j.value FROM jsonb_each(p_respuesta) j WHERE regexp_replace(lower(j.key), '[^a-z0-9]', '', 'g') = v_campo LOOP
        IF public.fe_e03_r05_alterado(x.value) OR (v_campo = 'tipodoc' AND jsonb_typeof(x.value) = 'string' AND (x.value #>> '{}') !~ '^[ -~]*$') THEN
          v_omitir := true;
          EXIT;
        END IF;
        v_clase := public.fe_e03_r05_clase_eco(v_campo, x.value, v_idn, v_tipo_doc);
        IF v_clase IS NOT NULL THEN
          v_var := v_var + 1;
          v_co := v_co OR v_clase = 'COINCIDE';
          v_cn := v_cn OR v_clase = 'CONTRADICE';
          v_ni := v_ni OR v_clase = 'NO_INTERPRETABLE';
        END IF;
      END LOOP;
      IF NOT v_omitir THEN
        IF v_var <> (p #>> ARRAY['ecos', v_campo, 'n_variantes'])::integer OR v_co <> (p #>> ARRAY['ecos', v_campo, 'hay_coincide'])::boolean
           OR v_cn <> (p #>> ARRAY['ecos', v_campo, 'hay_contradice'])::boolean OR v_ni <> (p #>> ARRAY['ecos', v_campo, 'hay_no_interpretable'])::boolean THEN
          RAISE EXCEPTION 'la proyección no coincide con la respuesta persistida (eco %)', v_campo USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INCOHERENTE';
        END IF;
        v_campos := array_append(v_campos, ('ecos.' || v_campo)::text);
      END IF;
    END LOOP;

    -- Lote de la raíz
    SELECT count(*) INTO v_n FROM jsonb_each(p_respuesta) j
     WHERE regexp_replace(lower(j.key), '[^a-z0-9]', '', 'g') IN ('nrolote', 'lote', 'numerolote', 'nrodelote', 'numerodelote')
       AND jsonb_typeof(j.value) <> 'null' AND j.value <> '""'::jsonb;
    IF v_n <> (p #>> '{lote,n_ocurrencias}')::integer THEN
      RAISE EXCEPTION 'la proyección no coincide con la respuesta persistida (lote)' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INCOHERENTE';
    END IF;
    v_campos := array_append(v_campos, 'lote.n_ocurrencias'::text);
    IF v_n = 0 THEN
      v_campos := array_append(v_campos, 'lote.clase'::text);
    ELSIF v_n = 1 THEN
      SELECT regexp_replace(lower(j.key), '[^a-z0-9]', '', 'g'), j.value INTO v_clave, v_valor FROM jsonb_each(p_respuesta) j
       WHERE regexp_replace(lower(j.key), '[^a-z0-9]', '', 'g') IN ('nrolote', 'lote', 'numerolote', 'nrodelote', 'numerodelote')
         AND jsonb_typeof(j.value) <> 'null' AND j.value <> '""'::jsonb;
      IF v_clave IS DISTINCT FROM (p #>> '{lote,clave}') THEN
        RAISE EXCEPTION 'la proyección no coincide con la respuesta persistida (alias del lote)' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INCOHERENTE';
      END IF;
      v_campos := array_append(v_campos, 'lote.clave'::text);
      v_clase := NULL; v_texto := NULL;
      IF jsonb_typeof(v_valor) = 'string' THEN
        IF NOT public.fe_e03_r05_alterado(v_valor) AND NOT public.fe_e03_r05_astral(v_valor #>> '{}') THEN
          v_texto := v_valor #>> '{}';
          v_clase := CASE WHEN char_length(v_texto) > 60 THEN 'INVALIDO_LARGO' WHEN public.fe_e03_r05_lote_valido(v_texto) THEN 'VALIDO' ELSE 'INVALIDO_FORMATO' END;
        END IF;
      ELSIF jsonb_typeof(v_valor) = 'number' THEN
        -- Number.isSafeInteger: entero y |n| <= 2^53 − 1 → String(n); si no, tipo no admitido.
        IF (v_valor #>> '{}')::numeric = trunc((v_valor #>> '{}')::numeric) AND abs((v_valor #>> '{}')::numeric) <= 9007199254740991 THEN
          v_texto := ((v_valor #>> '{}')::numeric)::bigint::text;
          v_clase := 'VALIDO';
        ELSE
          v_clase := 'INVALIDO_TIPO';
        END IF;
      ELSE
        v_clase := 'INVALIDO_TIPO';
      END IF;
      IF v_clase IS NOT NULL THEN
        IF v_clase <> (p #>> '{lote,clase}') OR (v_clase = 'VALIDO' AND v_texto IS DISTINCT FROM (p #>> '{lote,texto}')) THEN
          RAISE EXCEPTION 'la proyección no coincide con la respuesta persistida (clase o texto del lote)' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INCOHERENTE';
        END IF;
        v_campos := array_append(v_campos, 'lote.clase'::text);
        IF v_clase = 'VALIDO' THEN
          v_campos := array_append(v_campos, 'lote.texto'::text);
        END IF;
      END IF;
    END IF;

    -- CDC de la raíz (dato opaco; solo transporte, nunca criterio de ACK)
    SELECT count(*) INTO v_n FROM jsonb_each(p_respuesta) j
     WHERE regexp_replace(lower(j.key), '[^a-z0-9]', '', 'g') = 'cdc' AND jsonb_typeof(j.value) <> 'null' AND j.value <> '""'::jsonb;
    IF (v_n > 0) <> (p #>> '{cdc,presente}')::boolean THEN
      RAISE EXCEPTION 'la proyección no coincide con la respuesta persistida (presencia del CDC)' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INCOHERENTE';
    END IF;
    v_campos := array_append(v_campos, 'cdc.presente'::text);
    IF v_n = 1 AND (p #>> '{cdc,motivo}') IS DISTINCT FROM 'CREDENCIAL' THEN
      SELECT j.value INTO v_valor FROM jsonb_each(p_respuesta) j
       WHERE regexp_replace(lower(j.key), '[^a-z0-9]', '', 'g') = 'cdc' AND jsonb_typeof(j.value) <> 'null' AND j.value <> '""'::jsonb;
      v_omitir := false;
      IF jsonb_typeof(v_valor) <> 'string' THEN
        v_omitir := NOT (jsonb_typeof(p #> '{cdc,valor}') = 'null' AND (p #>> '{cdc,motivo}') IS NOT DISTINCT FROM 'NO_TEXTO');
      ELSIF public.fe_e03_r05_alterado(v_valor) THEN
        v_omitir := NULL;
      ELSIF char_length(v_valor #>> '{}') > 256 THEN
        v_omitir := NOT (jsonb_typeof(p #> '{cdc,valor}') = 'null' AND (p #>> '{cdc,motivo}') IS NOT DISTINCT FROM 'EXCEDE_LIMITE');
      ELSE
        v_omitir := (p #>> '{cdc,valor}') IS DISTINCT FROM (v_valor #>> '{}') OR jsonb_typeof(p #> '{cdc,motivo}') <> 'null';
      END IF;
      IF v_omitir THEN
        RAISE EXCEPTION 'la proyección no coincide con la respuesta persistida (CDC)' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INCOHERENTE';
      END IF;
      IF v_omitir IS NOT NULL THEN
        v_campos := array_append(v_campos, 'cdc.valor'::text);
      END IF;
    END IF;

    -- Listas propias de response (sin terceros retirados)
    SELECT count(*) INTO v_n FROM jsonb_each(p_respuesta) j WHERE regexp_replace(lower(j.key), '[^a-z0-9]', '', 'g') = 'response' AND jsonb_typeof(j.value) = 'object';
    v_resp := NULL;
    IF v_n = 1 THEN
      SELECT j.value INTO v_resp FROM jsonb_each(p_respuesta) j WHERE regexp_replace(lower(j.key), '[^a-z0-9]', '', 'g') = 'response' AND jsonb_typeof(j.value) = 'object';
    END IF;
    IF v_n = 0 OR (v_resp IS NOT NULL AND NOT v_resp ? 'OtrosDocumentosOmitidos'
                   AND (SELECT coalesce(bool_and(k ~ '^[ -~]*$' AND strpos(k, '[omitido]') = 0), true) FROM jsonb_object_keys(v_resp) AS t(k))) THEN
      FOREACH v_campo IN ARRAY ARRAY['rechazados', 'aceptados'] LOOP
        v_lista := NULL; v_omitir := false; v_cnt := 0; v_cota := false; v_propio := false; v_formato := false;
        IF v_resp IS NOT NULL THEN
          SELECT count(*) INTO v_n FROM jsonb_each(v_resp) j WHERE regexp_replace(lower(j.key), '[^a-z0-9]', '', 'g') = v_campo;
          IF v_n > 1 THEN
            v_omitir := true;
          ELSIF v_n = 1 THEN
            SELECT j.value INTO v_lista FROM jsonb_each(v_resp) j WHERE regexp_replace(lower(j.key), '[^a-z0-9]', '', 'g') = v_campo;
          END IF;
        END IF;
        IF NOT v_omitir AND v_lista IS NOT NULL AND jsonb_typeof(v_lista) = 'array' THEN
          -- Primeros 50 ELEMENTOS (lista.slice(0, 50)); cada uno expande sus entradas como Object.entries.
          FOR v_item IN SELECT z.value FROM jsonb_array_elements(v_lista) WITH ORDINALITY AS z(value, n) WHERE z.n <= 50 ORDER BY z.n LOOP
            IF jsonb_typeof(v_item) = 'string' THEN
              IF public.fe_e03_r05_alterado(v_item) THEN
                v_omitir := true;
                EXIT;
              END IF;
              v_texto := public.fe_e03_r05_trim_js(v_item #>> '{}');
              v_cnt := least(v_cnt + 1, 32767);
              v_propio := v_propio OR v_texto = v_numero_fiscal;
              v_formato := v_formato OR v_texto ~ '^[0-9]{3}-[0-9]{3}-[0-9]{7}$';
            ELSIF jsonb_typeof(v_item) = 'object' THEN
              FOR y IN SELECT k FROM jsonb_object_keys(v_item) AS t(k) LOOP
                IF strpos(y.k, '[omitido]') > 0 THEN
                  v_omitir := true;
                END IF;
                v_texto := public.fe_e03_r05_trim_js(y.k);
                v_cnt := least(v_cnt + 1, 32767);
                v_propio := v_propio OR v_texto = v_numero_fiscal;
                v_formato := v_formato OR v_texto ~ '^[0-9]{3}-[0-9]{3}-[0-9]{7}$';
              END LOOP;
              EXIT WHEN v_omitir;
            ELSIF jsonb_typeof(v_item) = 'array' THEN
              -- Array interno: una entrada por índice; el saneado conservó a lo sumo 50 de sus elementos (con 50, el original pudo tener más → solo cota inferior).
              v_cnt := least(v_cnt + jsonb_array_length(v_item), 32767);
              v_cota := v_cota OR jsonb_array_length(v_item) >= 50;
            END IF;
            -- null, número y booleano: entradasPorNumero los ignora.
          END LOOP;
        END IF;
        IF NOT v_omitir THEN
          v_n := (p #>> ARRAY[v_campo, 'n_entradas'])::integer;
          IF (v_cota AND v_n < v_cnt) OR (NOT v_cota AND v_n <> v_cnt) THEN
            RAISE EXCEPTION 'la proyección no coincide con la respuesta persistida (% n_entradas)', v_campo USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INCOHERENTE';
          END IF;
          IF v_campo = 'rechazados' THEN
            IF v_propio <> (p #>> '{rechazados,propio}')::boolean THEN
              RAISE EXCEPTION 'la proyección no coincide con la respuesta persistida (rechazados)' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INCOHERENTE';
            END IF;
          ELSE
            IF v_propio <> (p #>> '{aceptados,incluye_propio}')::boolean OR v_formato <> (p #>> '{aceptados,con_formato_fiscal}')::boolean THEN
              RAISE EXCEPTION 'la proyección no coincide con la respuesta persistida (aceptados)' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INCOHERENTE';
            END IF;
          END IF;
          v_campos := array_append(v_campos, CASE WHEN v_cota AND v_cnt < 32767 THEN v_campo || '.conteo_cota_inferior' ELSE v_campo END);
        END IF;
      END LOOP;
    END IF;
  END IF;
  RETURN QUERY SELECT 'COTEJADO_PARCIAL', v_campos;
END $$;

-- Procesamiento común de una P (vía normal y tardía): esquema cerrado contra el snapshot transmitido → saneado → esquema otra vez → clasificación SQL = clasificación de la aplicación →
-- cotejo con la respuesta persistida. Devuelve la P saneada CANÓNICA (jsonb) y su clasificación/cotejo; cualquier falla se propaga con su DETAIL NEX:… seguro (sin valores).
CREATE OR REPLACE FUNCTION public.fe_e03_r05_procesar_proyeccion(
  p jsonb, p_http integer, p_tipo text, p_establecimiento text, p_punto text, p_numero text, p_snapshot jsonb, p_respuesta jsonb, p_truncada boolean, p_redactada boolean)
RETURNS TABLE (o_proyeccion jsonb, o_regla text, o_resultado text, o_estado_local text, o_error_tipo text, o_cotejo text, o_campos text[])
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_p jsonb;
  c record;
  k record;
BEGIN
  PERFORM public.fe_e03_r05_validar_proyeccion(p, p_http, p_tipo, p_establecimiento, p_punto, p_numero, p_snapshot);
  v_p := public.fe_e03_r05_sanear_proyeccion(p);
  PERFORM public.fe_e03_r05_validar_proyeccion(v_p, p_http, p_tipo, p_establecimiento, p_punto, p_numero, p_snapshot);
  SELECT * INTO c FROM public.fe_e03_clasificar_recepcion_r05(v_p, p_tipo);
  IF jsonb_build_object('regla', c.o_regla, 'resultado', c.o_resultado, 'estado_local', c.o_estado_local, 'error_tipo', c.o_error_tipo) <> v_p -> 'clasificacion_app' THEN
    RAISE EXCEPTION 'la clasificación de la aplicación no coincide con la clasificación del banco' USING ERRCODE = 'P0001', DETAIL = 'NEX:CLASIFICACION_NO_COINCIDE';
  END IF;
  SELECT * INTO k FROM public.fe_e03_r05_cotejar(v_p, p_respuesta, coalesce(p_truncada, false), coalesce(p_redactada, false));
  RETURN QUERY SELECT v_p, c.o_regla, c.o_resultado, c.o_estado_local, c.o_error_tipo, k.o_cotejo, k.o_campos;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 5) Ayudantes de escritura (internos, sin EXECUTE para nexit_runtime)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Modo ACTIVO verificado DESPUÉS de obtener el bloqueo compartido de coordinación (C02-045: retirar EXECUTE no cancela una llamada que ya pasó ese control).
CREATE OR REPLACE FUNCTION public.fe_e03_r05_exigir_activo() RETURNS void
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_modo text;
BEGIN
  SELECT modo INTO v_modo FROM public.nex_e03_r05_estado WHERE id FOR SHARE;
  IF v_modo IS DISTINCT FROM 'ACTIVO' THEN
    RAISE EXCEPTION 'el envío R05 está revertido: no se registran escrituras' USING ERRCODE = 'P0001', DETAIL = 'NEX:E03_R05_REVERTIDO';
  END IF;
END $$;

-- Preparación común: permiso CREAR, modo ACTIVO (bloqueo 1), documento FOR UPDATE (bloqueo 2) y alcance de sucursal; activa la marca local que habilita la evidencia R05.
CREATE OR REPLACE FUNCTION public.fe_e03_r05_preparar(p_empresa uuid, p_usuario uuid, p_documento uuid) RETURNS public.documentos_electronicos
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  d public.documentos_electronicos%ROWTYPE;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  PERFORM public.fe_e03_r05_exigir_activo();
  SELECT * INTO d FROM public.documentos_electronicos WHERE empresa_id = p_empresa AND id = p_documento FOR UPDATE;
  IF NOT FOUND OR NOT public.sucursal_en_alcance(p_empresa, p_usuario, d.sucursal_id) THEN
    RAISE EXCEPTION 'documento no encontrado' USING ERRCODE = 'P0001', DETAIL = 'NEX:DOCUMENTO_NO_ENCONTRADO';
  END IF;
  PERFORM set_config('nexit.e03_r05', 'on', true);
  RETURN d;
END $$;

-- Testigo: 43..128 caracteres base64url; se compara SOLO su SHA-256 UTF-8. El testigo y su hash nunca aparecen en mensajes.
CREATE OR REPLACE FUNCTION public.fe_e03_r05_hash_testigo(p_testigo text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF p_testigo IS NULL OR p_testigo !~ '^[A-Za-z0-9_-]{43,128}$' THEN
    RAISE EXCEPTION 'testigo de proceso no válido' USING ERRCODE = 'P0001', DETAIL = 'NEX:TESTIGO_INVALIDO';
  END IF;
  RETURN encode(sha256(convert_to(p_testigo, 'UTF8')), 'hex');
END $$;

-- Operación del documento, del mismo actor y con el mismo testigo (en ese orden, sin revelar cuál falló más allá de lo necesario).
CREATE OR REPLACE FUNCTION public.fe_e03_r05_operacion(p_empresa uuid, p_usuario uuid, p_documento uuid, p_operacion uuid, p_testigo text)
RETURNS public.documento_electronico_envio_operaciones_r05
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  o public.documento_electronico_envio_operaciones_r05%ROWTYPE;
  v_hash text := public.fe_e03_r05_hash_testigo(p_testigo);
BEGIN
  SELECT * INTO o FROM public.documento_electronico_envio_operaciones_r05 WHERE empresa_id = p_empresa AND documento_id = p_documento AND operacion_id = p_operacion;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'la operación de envío R05 no existe para este documento' USING ERRCODE = 'P0001', DETAIL = 'NEX:OPERACION_NO_ENCONTRADA';
  END IF;
  IF o.actor_id <> p_usuario OR o.testigo_sha256 <> v_hash THEN
    RAISE EXCEPTION 'la operación de envío pertenece a otro proceso' USING ERRCODE = 'P0001', DETAIL = 'NEX:TESTIGO_NO_COINCIDE';
  END IF;
  RETURN o;
END $$;

-- Vigencia de la vía normal: NULL = vigente; si no, el motivo con precedencia CERRADA > NO_VIGENTE > DOCUMENTO_NO_ENVIANDO (el mismo que usa la salida tardía).
CREATE OR REPLACE FUNCTION public.fe_e03_r05_no_vigente(p_empresa uuid, p_documento uuid, p_operacion uuid, p_estado_local text) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_ultima uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.documento_electronico_envio_evidencias e
              WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.operacion_id = p_operacion AND e.tipo_evento = 'CIERRE') THEN
    RETURN 'OPERACION_CERRADA';
  END IF;
  SELECT e.id INTO v_ultima FROM public.documento_electronico_envio_evidencias e
   WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.tipo_evento = 'INICIO' ORDER BY e.orden DESC LIMIT 1;
  IF v_ultima IS DISTINCT FROM p_operacion THEN
    RETURN 'OPERACION_NO_VIGENTE';
  END IF;
  IF p_estado_local IS DISTINCT FROM 'ENVIANDO' THEN
    RETURN 'DOCUMENTO_NO_ENVIANDO';
  END IF;
  RETURN NULL;
END $$;

-- R02-C01 F001: el POST 1 tiene token inválido COMPROBADO: salida normal HTTP 4xx con P validada (token_invalido coherente con el HTTP), clasificada R-01. Única puerta para renovar el
-- token y para el POST 2. Nunca tras ACK 2xx, 5xx, TIMEOUT/RED, salida sin P, P rechazada, salida tardía o ausencia de salida.
-- R02-C02 (R-C01-01): toda P persistida pasó por fe_e03_r05_procesar_proyeccion, cuyo cotejo exige, con HTTP 4xx distinto de 401 y respuesta íntegra, que token_invalido coincida con
-- esTokenInvalido recalculado sobre la clave exacta «message» (fe_e03_r05_token_mensaje). Un 4xx comprobadamente sin indicación de token (message ausente, null, no texto o texto sin la
-- indicación) con token_invalido = true queda sin P → esta puerta da false → sin renovación ni POST 2; el cierre deriva EI-SIN-P (indeterminado, D-C02-2-A).
CREATE OR REPLACE FUNCTION public.fe_e03_r05_token_rechazado_post1(p_empresa uuid, p_documento uuid, p_operacion uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.documento_electronico_envio_proyecciones_r05 y
                   JOIN public.documento_electronico_envio_evidencias ev ON ev.empresa_id = y.empresa_id AND ev.documento_id = y.documento_id AND ev.id = y.evento_id
                  WHERE y.empresa_id = p_empresa AND y.documento_id = p_documento AND y.operacion_id = p_operacion AND y.nro_post = 1
                    AND y.proyeccion IS NOT NULL AND y.regla = 'R-01' AND (y.proyeccion ->> 'token_invalido')::boolean
                    AND ev.tipo_evento = 'HTTP_RESPUESTA' AND ev.operacion_id = p_operacion AND ev.nro_post = 1 AND ev.http_status BETWEEN 400 AND 499)
$$;

-- POST de la operación, de ambas tablas (un número vive en una sola).
CREATE OR REPLACE FUNCTION public.fe_e03_r05_posts(p_empresa uuid, p_documento uuid, p_operacion uuid)
RETURNS TABLE (o_nro smallint, o_evento_id uuid, o_grande_id uuid, o_sha256 text, o_creado_at timestamptz)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT e.nro_post, e.id, NULL::uuid, e.solicitud_sha256, e.creado_at FROM public.documento_electronico_envio_evidencias e
   WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.operacion_id = p_operacion AND e.tipo_evento = 'POST_INTENTADO'
  UNION ALL
  SELECT g.nro_post, NULL::uuid, g.id, g.solicitud_sha256, g.creado_at FROM public.documento_electronico_envio_posts_grandes_r05 g
   WHERE g.empresa_id = p_empresa AND g.documento_id = p_documento AND g.operacion_id = p_operacion
$$;

-- R02-C01 F005: definición ÚNICA de «operación R05 abierta» (sin fila de cierre R05) y de su última actividad = el mayor creado_at entre la raíz de la operación, sus eventos NEX-072
-- (INICIO, POST_INTENTADO, salidas, NO_TRANSMITIDO, CIERRE), sus POST grandes, autenticaciones, proyecciones y salidas tardías. Reciente = última actividad >= corte − 10 minutos, con UN
-- corte por ejecución (lo fija el llamador). Solo para el propietario (verificar / reversión): sin EXECUTE para PUBLIC ni para nexit_runtime.
CREATE OR REPLACE FUNCTION public.fe_e03_r05_ultima_actividad(p_empresa uuid, p_documento uuid, p_operacion uuid) RETURNS timestamptz
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT greatest(
    (SELECT o.creado_at FROM public.documento_electronico_envio_operaciones_r05 o WHERE o.empresa_id = p_empresa AND o.documento_id = p_documento AND o.operacion_id = p_operacion),
    (SELECT max(e.creado_at) FROM public.documento_electronico_envio_evidencias e WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.operacion_id = p_operacion),
    (SELECT max(g.creado_at) FROM public.documento_electronico_envio_posts_grandes_r05 g WHERE g.empresa_id = p_empresa AND g.documento_id = p_documento AND g.operacion_id = p_operacion),
    (SELECT max(a.creado_at) FROM public.documento_electronico_envio_autenticaciones_r05 a WHERE a.empresa_id = p_empresa AND a.documento_id = p_documento AND a.operacion_id = p_operacion),
    (SELECT max(y.creado_at) FROM public.documento_electronico_envio_proyecciones_r05 y WHERE y.empresa_id = p_empresa AND y.documento_id = p_documento AND y.operacion_id = p_operacion),
    (SELECT max(t.creado_at) FROM public.documento_electronico_envio_salidas_tardias_r05 t WHERE t.empresa_id = p_empresa AND t.documento_id = p_documento AND t.operacion_id = p_operacion))
$$;

CREATE OR REPLACE FUNCTION public.fe_e03_r05_abiertas(p_corte timestamptz) RETURNS TABLE (o_abiertas bigint, o_recientes bigint, o_antiguas bigint)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT count(*), count(*) FILTER (WHERE x.ultima >= p_corte - interval '10 minutes'), count(*) FILTER (WHERE x.ultima < p_corte - interval '10 minutes')
    FROM (SELECT public.fe_e03_r05_ultima_actividad(o.empresa_id, o.documento_id, o.operacion_id) AS ultima
            FROM public.documento_electronico_envio_operaciones_r05 o
           WHERE NOT EXISTS (SELECT 1 FROM public.documento_electronico_envio_cierres_r05 c WHERE c.operacion_id = o.operacion_id)) x
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 6) Funciones de escritura R05
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 6.1 Inicio con correlación previa y testigo. Una correlación ya registrada NO vuelve a llamar a NEX-062: se exige el mismo documento, actor, confirmación, testigo, conexión y versión
-- vigente, y se devuelve la misma operación (o_reutilizado = true). INDETERMINADO de NEX-062 → sin operación y sin derecho de POST (una repetición posterior recibe de NEX-062 la excepción
-- NEX:ENVIO_INDETERMINADO: ambos significan «sin autorización de POST»; ninguno inventa raíz).
CREATE OR REPLACE FUNCTION public.fe_e03_iniciar_envio_r05(
  p_empresa uuid, p_usuario uuid, p_documento uuid, p_confirma_rechazo boolean, p_correlacion uuid, p_testigo text, p_conexion jsonb)
RETURNS TABLE (o_resultado text, o_payload jsonb, o_numero text, o_tipo text, o_establecimiento text, o_punto text, o_version smallint, o_payload_hash text,
               o_operacion_id uuid, o_reutilizado boolean, o_vigente boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d public.documentos_electronicos%ROWTYPE;
  o public.documento_electronico_envio_operaciones_r05%ROWTYPE;
  r record;
  s record;
  v_hash text;
  v_conexion jsonb := coalesce(public.fe_intento_conexion_segura(p_conexion), '{}'::jsonb);
  v_op uuid;
BEGIN
  IF p_correlacion IS NULL THEN
    RAISE EXCEPTION 'falta la correlación del proceso' USING ERRCODE = 'P0001', DETAIL = 'NEX:CORRELACION_INVALIDA';
  END IF;
  v_hash := public.fe_e03_r05_hash_testigo(p_testigo);
  d := public.fe_e03_r05_preparar(p_empresa, p_usuario, p_documento);

  SELECT * INTO o FROM public.documento_electronico_envio_operaciones_r05 WHERE empresa_id = p_empresa AND correlacion_id = p_correlacion;
  IF FOUND THEN
    IF o.documento_id <> p_documento OR o.actor_id <> p_usuario OR o.confirma_rechazo <> coalesce(p_confirma_rechazo, false) OR o.testigo_sha256 <> v_hash OR o.conexion <> v_conexion
       OR o.version <> (SELECT max(sol.version) FROM public.documento_electronico_solicitudes sol WHERE sol.empresa_id = p_empresa AND sol.documento_id = p_documento) THEN
      RAISE EXCEPTION 'la correlación ya se usó con otros datos de envío' USING ERRCODE = 'P0001', DETAIL = 'NEX:CORRELACION_DISTINTA';
    END IF;
    RETURN QUERY SELECT 'INICIADO'::text, sol.payload, d.numero, d.tipo, d.establecimiento, d.punto_expedicion, o.version, o.payload_hash, o.operacion_id, true,
                        public.fe_e03_r05_no_vigente(p_empresa, p_documento, o.operacion_id, d.estado_local) IS NULL
                   FROM public.documento_electronico_solicitudes sol WHERE sol.empresa_id = p_empresa AND sol.documento_id = p_documento AND sol.version = o.version;
    RETURN;
  END IF;

  SELECT x.o_resultado, x.o_payload, x.o_numero, x.o_tipo, x.o_establecimiento, x.o_punto INTO r
    FROM public.fe_documento_iniciar_envio(p_empresa, p_usuario, p_documento, p_confirma_rechazo) x;
  IF r.o_resultado IS DISTINCT FROM 'INICIADO' THEN
    RETURN QUERY SELECT r.o_resultado, r.o_payload, r.o_numero, r.o_tipo, r.o_establecimiento, r.o_punto, NULL::smallint, NULL::text, NULL::uuid, false, false;
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
  BEGIN
    INSERT INTO public.documento_electronico_envio_operaciones_r05 (operacion_id, empresa_id, documento_id, version, correlacion_id, testigo_sha256, actor_id, confirma_rechazo, conexion, payload_hash)
    VALUES (v_op, p_empresa, p_documento, s.version, p_correlacion, v_hash, p_usuario, coalesce(p_confirma_rechazo, false), v_conexion, s.payload_hash);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'la correlación ya se usó con otro documento' USING ERRCODE = 'P0001', DETAIL = 'NEX:CORRELACION_DISTINTA';
  END;

  RETURN QUERY SELECT r.o_resultado, r.o_payload, r.o_numero, r.o_tipo, r.o_establecimiento, r.o_punto, s.version, s.payload_hash, v_op, false, true;
END $$;

-- 6.2 Autenticación (sin mensajes ni secretos). INICIAL antes de cualquier POST; RENOVACION_TOKEN solo si el POST 1 recibió token inválido COMPROBADO (fe_e03_r05_token_rechazado_post1:
-- HTTP 4xx, P validada, regla R-01) y aún no hay POST 2. OK por HTTP = 200 exacto (CHECK de la tabla).
CREATE OR REPLACE FUNCTION public.fe_e03_registrar_autenticacion_r05(
  p_empresa uuid, p_usuario uuid, p_documento uuid, p_operacion uuid, p_testigo text, p_motivo text, p_origen text, p_resultado text, p_http integer)
RETURNS TABLE (o_nro smallint, o_reutilizado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d public.documentos_electronicos%ROWTYPE;
  o public.documento_electronico_envio_operaciones_r05%ROWTYPE;
  a public.documento_electronico_envio_autenticaciones_r05%ROWTYPE;
  v_nro smallint := CASE p_motivo WHEN 'INICIAL' THEN 1 WHEN 'RENOVACION_TOKEN' THEN 2 END;
  v_motivo_nv text;
BEGIN
  IF v_nro IS NULL OR p_origen IS NULL OR p_resultado IS NULL THEN
    RAISE EXCEPTION 'autenticación no válida' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_INVALIDO';
  END IF;
  d := public.fe_e03_r05_preparar(p_empresa, p_usuario, p_documento);
  o := public.fe_e03_r05_operacion(p_empresa, p_usuario, p_documento, p_operacion, p_testigo);

  SELECT * INTO a FROM public.documento_electronico_envio_autenticaciones_r05 WHERE empresa_id = p_empresa AND documento_id = p_documento AND operacion_id = p_operacion AND nro = v_nro;
  IF FOUND THEN
    IF a.origen = p_origen AND a.resultado = p_resultado AND a.http_status IS NOT DISTINCT FROM p_http THEN
      RETURN QUERY SELECT v_nro, true; RETURN;
    END IF;
    RAISE EXCEPTION 'la autenticación ya se registró con otro resultado' USING ERRCODE = 'P0001', DETAIL = 'NEX:AUTENTICACION_DISTINTA';
  END IF;

  v_motivo_nv := public.fe_e03_r05_no_vigente(p_empresa, p_documento, p_operacion, d.estado_local);
  IF v_motivo_nv IS NOT NULL THEN
    RAISE EXCEPTION 'la operación de envío no admite autenticaciones (%)', v_motivo_nv USING ERRCODE = 'P0001', DETAIL = 'NEX:' || v_motivo_nv;
  END IF;
  IF EXISTS (SELECT 1 FROM public.documento_electronico_envio_evidencias e WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.operacion_id = p_operacion AND e.tipo_evento = 'NO_TRANSMITIDO') THEN
    RAISE EXCEPTION 'la operación ya se declaró NO TRANSMITIDA' USING ERRCODE = 'P0001', DETAIL = 'NEX:OPERACION_NO_TRANSMITIDA';
  END IF;

  IF v_nro = 1 THEN
    IF EXISTS (SELECT 1 FROM public.fe_e03_r05_posts(p_empresa, p_documento, p_operacion)) THEN
      RAISE EXCEPTION 'la autenticación inicial debe registrarse antes del primer POST' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_CONTRADICTORIO';
    END IF;
  ELSE
    IF p_origen <> 'HTTP'
       OR (SELECT count(*) FROM public.fe_e03_r05_posts(p_empresa, p_documento, p_operacion)) <> 1
       OR NOT EXISTS (SELECT 1 FROM public.documento_electronico_envio_autenticaciones_r05 x
                       WHERE x.empresa_id = p_empresa AND x.documento_id = p_documento AND x.operacion_id = p_operacion AND x.nro = 1 AND x.resultado = 'OK')
       OR NOT public.fe_e03_r05_token_rechazado_post1(p_empresa, p_documento, p_operacion) THEN
      RAISE EXCEPTION 'la renovación del token exige el POST 1 con token inválido comprobado y sin POST 2' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_CONTRADICTORIO';
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.documento_electronico_envio_autenticaciones_r05 (empresa_id, documento_id, version, operacion_id, nro, motivo, origen, resultado, http_status, actor_id)
    VALUES (p_empresa, p_documento, o.version, p_operacion, v_nro, p_motivo, p_origen, p_resultado, p_http, p_usuario);
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'autenticación no válida (origen, resultado y estado HTTP incoherentes)' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_INVALIDO';
  END;
  RETURN QUERY SELECT v_nro, false;
END $$;

-- 6.3 POST (antes del fetch): número 1 tras una autenticación inicial OK; número 2 solo tras token inválido del POST 1 y renovación OK. Cuerpo = snapshot (igualdad jsonb decidida aquí).
-- <= 1 MiB → POST_INTENTADO de NEX-072; > 1 MiB y <= 8 MiB → tabla de POST grandes (D8-B). Repetir el mismo número con el mismo cuerpo, con la operación aún vigente, devuelve
-- o_reutilizado = true (respuesta del banco perdida, C02-012): el MISMO proceso (testigo) hace su único fetch solo si todavía no lo hizo (regla local); nunca un segundo fetch.
CREATE OR REPLACE FUNCTION public.fe_e03_registrar_post_r05(
  p_empresa uuid, p_usuario uuid, p_documento uuid, p_operacion uuid, p_testigo text, p_nro_post smallint, p_solicitud_http_texto text)
RETURNS TABLE (o_nro_post smallint, o_almacenamiento text, o_solicitud_sha256 text, o_solicitud_bytes integer, o_reutilizado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d public.documentos_electronicos%ROWTYPE;
  o public.documento_electronico_envio_operaciones_r05%ROWTYPE;
  v_prev record;
  v_snapshot jsonb;
  v_texto bytea;
  v_sha text;
  v_bytes integer;
  v_n integer;
  v_motivo_nv text;
BEGIN
  IF p_nro_post IS NULL OR p_nro_post NOT BETWEEN 1 AND 2 OR p_solicitud_http_texto IS NULL THEN
    RAISE EXCEPTION 'POST no válido: número 1 o 2 y texto HTTP exacto' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_INVALIDO';
  END IF;
  d := public.fe_e03_r05_preparar(p_empresa, p_usuario, p_documento);
  o := public.fe_e03_r05_operacion(p_empresa, p_usuario, p_documento, p_operacion, p_testigo);

  v_texto := convert_to(p_solicitud_http_texto, 'UTF8');
  v_bytes := octet_length(v_texto);
  v_sha := encode(sha256(v_texto), 'hex');

  -- La vigencia se comprueba ANTES de reutilizar (C02-013): si otro proceso convirtió el documento, ni siquiera el mismo proceso puede hacer su fetch pendiente.
  v_motivo_nv := public.fe_e03_r05_no_vigente(p_empresa, p_documento, p_operacion, d.estado_local);
  IF v_motivo_nv IS NOT NULL THEN
    RAISE EXCEPTION 'la operación de envío no admite POST (%)', v_motivo_nv USING ERRCODE = 'P0001', DETAIL = 'NEX:' || v_motivo_nv;
  END IF;
  SELECT * INTO v_prev FROM public.fe_e03_r05_posts(p_empresa, p_documento, p_operacion) x WHERE x.o_nro = p_nro_post;
  IF FOUND THEN
    IF v_prev.o_sha256 = v_sha THEN
      RETURN QUERY SELECT p_nro_post, CASE WHEN v_prev.o_grande_id IS NULL THEN 'EVIDENCIA_NEX072' ELSE 'POST_GRANDE_R05' END, v_sha, v_bytes, true; RETURN;
    END IF;
    RAISE EXCEPTION 'el POST % ya se registró con otro cuerpo', p_nro_post USING ERRCODE = 'P0001', DETAIL = 'NEX:POST_DISTINTO';
  END IF;
  IF EXISTS (SELECT 1 FROM public.documento_electronico_envio_evidencias e WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.operacion_id = p_operacion AND e.tipo_evento = 'NO_TRANSMITIDO') THEN
    RAISE EXCEPTION 'la operación ya se declaró NO TRANSMITIDA' USING ERRCODE = 'P0001', DETAIL = 'NEX:OPERACION_NO_TRANSMITIDA';
  END IF;

  SELECT count(*) INTO v_n FROM public.fe_e03_r05_posts(p_empresa, p_documento, p_operacion);
  IF p_nro_post <> v_n + 1 THEN
    RAISE EXCEPTION 'número de POST fuera de secuencia' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_CONTRADICTORIO';
  END IF;
  IF p_nro_post = 1 AND NOT EXISTS (SELECT 1 FROM public.documento_electronico_envio_autenticaciones_r05 a
                                     WHERE a.empresa_id = p_empresa AND a.documento_id = p_documento AND a.operacion_id = p_operacion AND a.nro = 1 AND a.resultado = 'OK') THEN
    RAISE EXCEPTION 'el POST 1 exige una autenticación inicial OK registrada' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_CONTRADICTORIO';
  END IF;
  IF p_nro_post = 2 AND (NOT EXISTS (SELECT 1 FROM public.documento_electronico_envio_autenticaciones_r05 a
                                      WHERE a.empresa_id = p_empresa AND a.documento_id = p_documento AND a.operacion_id = p_operacion AND a.nro = 2 AND a.resultado = 'OK')
                         OR NOT public.fe_e03_r05_token_rechazado_post1(p_empresa, p_documento, p_operacion)) THEN
    RAISE EXCEPTION 'el POST 2 exige token inválido comprobado en el POST 1 y renovación OK' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_CONTRADICTORIO';
  END IF;

  SELECT sol.payload INTO v_snapshot FROM public.documento_electronico_solicitudes sol WHERE sol.empresa_id = p_empresa AND sol.documento_id = p_documento AND sol.version = o.version;
  BEGIN
    IF p_solicitud_http_texto::jsonb IS DISTINCT FROM v_snapshot THEN
      RAISE EXCEPTION 'el cuerpo HTTP no coincide con la solicitud registrada de la versión %', o.version USING ERRCODE = 'P0001', DETAIL = 'NEX:CUERPO_NO_COINCIDE';
    END IF;
  EXCEPTION WHEN invalid_text_representation OR data_exception THEN
    RAISE EXCEPTION 'el cuerpo HTTP no es JSON válido' USING ERRCODE = 'P0001', DETAIL = 'NEX:CUERPO_NO_COINCIDE';
  END;

  IF v_bytes <= 1048576 THEN
    INSERT INTO public.documento_electronico_envio_evidencias (empresa_id, documento_id, version, operacion_id, tipo_evento, nro_post, solicitud_http_texto, solicitud_sha256, solicitud_bytes, respuesta_truncada, actor_id)
    VALUES (p_empresa, p_documento, o.version, p_operacion, 'POST_INTENTADO', p_nro_post, p_solicitud_http_texto, v_sha, v_bytes, false, p_usuario);
    RETURN QUERY SELECT p_nro_post, 'EVIDENCIA_NEX072'::text, v_sha, v_bytes, false; RETURN;
  END IF;
  IF v_bytes > 8388608 THEN
    RAISE EXCEPTION 'el cuerpo HTTP supera el límite defensivo de 8 MiB (no se transmite)' USING ERRCODE = 'P0001', DETAIL = 'NEX:SOLICITUD_EXCEDE_LIMITE_DEFENSIVO';
  END IF;
  INSERT INTO public.documento_electronico_envio_posts_grandes_r05 (empresa_id, documento_id, version, operacion_id, nro_post, solicitud_http_texto, solicitud_sha256, solicitud_bytes, actor_id)
  VALUES (p_empresa, p_documento, o.version, p_operacion, p_nro_post, p_solicitud_http_texto, v_sha, v_bytes, p_usuario);
  RETURN QUERY SELECT p_nro_post, 'POST_GRANDE_R05'::text, v_sha, v_bytes, false;
END $$;

-- 6.4 Salida de un POST por la vía normal: HTTP_RESPUESTA (con P validada o con el motivo de su ausencia) o ERROR_TRANSMISION (TIMEOUT/RED). Saneado de la respuesta como NEX-072.
-- Si la vía normal ya no la admite → NEX:OPERACION_CERRADA / OPERACION_NO_VIGENTE / DOCUMENTO_NO_ENVIANDO (la aplicación usa entonces la salida tardía).
-- R02-C01 F002: repetir la salida devuelve la persistida (o_reutilizado) SOLO con equivalencia semántica completa: empresa, documento, versión, operación y número de POST (por la
-- búsqueda); tipo de salida, HTTP, clase de error, SHA-256 y bytes de la respuesta saneada, indicador de truncamiento; P saneada canónica (jsonb), motivo de la ausencia de P,
-- clasificación (regla, resultado, estado local, tipo de error) y cotejo (resultado y campos). Misma respuesta con otra P, otro motivo o una P que ahora no valida → NEX:SALIDA_DISTINTA
-- sin reescribir nada (la escritura de la salida y de su proyección es atómica: un ACK de escritura perdido se recupera repitiendo exactamente la misma salida).
CREATE OR REPLACE FUNCTION public.fe_e03_registrar_salida_r05(
  p_empresa uuid, p_usuario uuid, p_documento uuid, p_operacion uuid, p_testigo text, p_nro_post smallint, p_tipo_salida text, p_http integer,
  p_respuesta jsonb, p_respuesta_truncada boolean, p_clase_error text, p_proyeccion jsonb, p_motivo_sin_proyeccion text)
RETURNS TABLE (o_evento_id uuid, o_regla text, o_cotejo text, o_reutilizado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d public.documentos_electronicos%ROWTYPE;
  o public.documento_electronico_envio_operaciones_r05%ROWTYPE;
  v_ev public.documento_electronico_envio_evidencias%ROWTYPE;
  v_pr public.documento_electronico_envio_proyecciones_r05%ROWTYPE;
  v_motivo_nv text;
  v_snapshot jsonb;
  v_resp jsonb;
  v_resp_txt text;
  v_redactado boolean := false;
  v_bytes integer;
  v_sha text;
  v_mensaje text;
  v_igual boolean;
  q record;
  v_id uuid;
BEGIN
  IF p_nro_post IS NULL OR p_nro_post NOT BETWEEN 1 AND 2 OR p_tipo_salida IS NULL OR p_tipo_salida NOT IN ('HTTP_RESPUESTA', 'ERROR_TRANSMISION') THEN
    RAISE EXCEPTION 'salida no válida' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_INVALIDO';
  END IF;
  IF p_tipo_salida = 'ERROR_TRANSMISION' AND (p_clase_error IS NULL OR p_clase_error NOT IN ('TIMEOUT', 'RED') OR p_http IS NOT NULL OR p_respuesta IS NOT NULL
                                               OR p_proyeccion IS NOT NULL OR p_motivo_sin_proyeccion IS NOT NULL) THEN
    RAISE EXCEPTION 'ERROR_TRANSMISION exige clase TIMEOUT o RED y no admite estado, respuesta ni proyección' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_INVALIDO';
  END IF;
  IF p_tipo_salida = 'HTTP_RESPUESTA' AND (p_http IS NULL OR p_http NOT BETWEEN 100 AND 599 OR p_clase_error IS NOT NULL
                                            OR (p_proyeccion IS NULL) = (p_motivo_sin_proyeccion IS NULL)
                                            OR (p_motivo_sin_proyeccion IS NOT NULL AND p_motivo_sin_proyeccion NOT IN ('PROYECCION_RECHAZADA', 'CREDENCIALES_RESIDUALES', 'CUERPO_NO_PROYECTABLE', 'FALLO_LOCAL'))) THEN
    RAISE EXCEPTION 'HTTP_RESPUESTA exige estado HTTP y exactamente una de: proyección o motivo de su ausencia' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_INVALIDO';
  END IF;
  d := public.fe_e03_r05_preparar(p_empresa, p_usuario, p_documento);
  o := public.fe_e03_r05_operacion(p_empresa, p_usuario, p_documento, p_operacion, p_testigo);

  IF NOT EXISTS (SELECT 1 FROM public.fe_e03_r05_posts(p_empresa, p_documento, p_operacion) x WHERE x.o_nro = p_nro_post) THEN
    RAISE EXCEPTION 'el POST indicado no existe en esta operación' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_CONTRADICTORIO';
  END IF;
  IF EXISTS (SELECT 1 FROM public.documento_electronico_envio_salidas_tardias_r05 t
              WHERE t.empresa_id = p_empresa AND t.documento_id = p_documento AND t.operacion_id = p_operacion AND t.nro_post = p_nro_post) THEN
    RAISE EXCEPTION 'la salida de este POST ya se registró como tardía' USING ERRCODE = 'P0001', DETAIL = 'NEX:SALIDA_TARDIA_REGISTRADA';
  END IF;
  SELECT sol.payload INTO v_snapshot FROM public.documento_electronico_solicitudes sol WHERE sol.empresa_id = p_empresa AND sol.documento_id = p_documento AND sol.version = o.version;

  -- Saneado de la respuesta (idéntico a NEX-072): claves y valores reconocibles redactados; un residuo se rechaza sin repetir el valor.
  IF p_respuesta IS NOT NULL THEN
    v_resp_txt := public.fe_e03_redactar_texto(p_respuesta::text);
    IF v_resp_txt IS DISTINCT FROM p_respuesta::text THEN v_redactado := true; END IF;
    IF public.fe_e03_secreto_residual(v_resp_txt) THEN
      RAISE EXCEPTION 'la respuesta contiene credenciales que no se pudieron redactar: no se registra' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVIDENCIA_CON_CREDENCIALES';
    END IF;
    v_resp := v_resp_txt::jsonb;
    IF pg_column_size(v_resp) >= 65536 THEN
      RAISE EXCEPTION 'la respuesta saneada supera el límite: envíela truncada' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_INVALIDO';
    END IF;
    v_bytes := octet_length(convert_to(v_resp::text, 'UTF8'));
    v_sha := encode(sha256(convert_to(v_resp::text, 'UTF8')), 'hex');
  ELSIF coalesce(p_respuesta_truncada, false) THEN
    RAISE EXCEPTION 'una respuesta truncada exige el objeto parcial saneado' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_INVALIDO';
  END IF;

  -- Repetición de la misma salida: equivalencia semántica completa → la persistida; cualquier diferencia → NEX:SALIDA_DISTINTA (nada se reescribe).
  SELECT * INTO v_ev FROM public.documento_electronico_envio_evidencias e
   WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.operacion_id = p_operacion AND e.nro_post = p_nro_post AND e.tipo_evento IN ('HTTP_RESPUESTA', 'ERROR_TRANSMISION');
  IF FOUND THEN
    SELECT * INTO v_pr FROM public.documento_electronico_envio_proyecciones_r05 y WHERE y.empresa_id = p_empresa AND y.documento_id = p_documento AND y.evento_id = v_ev.id;
    v_igual := v_ev.version = o.version AND v_ev.tipo_evento = p_tipo_salida AND v_ev.http_status IS NOT DISTINCT FROM p_http
               AND v_ev.respuesta_sha256 IS NOT DISTINCT FROM v_sha AND v_ev.respuesta_bytes IS NOT DISTINCT FROM v_bytes
               AND v_ev.respuesta_truncada = coalesce(p_respuesta_truncada, false)
               AND (p_tipo_salida = 'HTTP_RESPUESTA' OR v_ev.mensaje = p_clase_error)
               AND (p_tipo_salida = 'ERROR_TRANSMISION' OR v_pr.motivo_sin_proyeccion IS NOT DISTINCT FROM p_motivo_sin_proyeccion);
    IF v_igual AND p_tipo_salida = 'HTTP_RESPUESTA' THEN
      IF p_proyeccion IS NULL THEN
        v_igual := v_pr.proyeccion IS NULL;
      ELSE
        BEGIN
          SELECT * INTO q FROM public.fe_e03_r05_procesar_proyeccion(p_proyeccion, p_http, d.tipo, d.establecimiento, d.punto_expedicion, d.numero, v_snapshot,
                                                                     v_resp, coalesce(p_respuesta_truncada, false), v_redactado);
          v_igual := v_pr.proyeccion IS NOT DISTINCT FROM q.o_proyeccion AND v_pr.regla IS NOT DISTINCT FROM q.o_regla AND v_pr.resultado IS NOT DISTINCT FROM q.o_resultado
                     AND v_pr.estado_local IS NOT DISTINCT FROM q.o_estado_local AND v_pr.error_tipo IS NOT DISTINCT FROM q.o_error_tipo
                     AND v_pr.cotejo IS NOT DISTINCT FROM q.o_cotejo AND v_pr.campos_cotejados IS NOT DISTINCT FROM q.o_campos;
        EXCEPTION WHEN raise_exception OR data_exception THEN
          v_igual := false;
        END;
      END IF;
    END IF;
    IF v_igual THEN
      RETURN QUERY SELECT v_ev.id, v_pr.regla, v_pr.cotejo, true; RETURN;
    END IF;
    RAISE EXCEPTION 'el POST indicado ya tiene otra salida registrada' USING ERRCODE = 'P0001', DETAIL = 'NEX:SALIDA_DISTINTA';
  END IF;

  v_motivo_nv := public.fe_e03_r05_no_vigente(p_empresa, p_documento, p_operacion, d.estado_local);
  IF v_motivo_nv IS NOT NULL THEN
    RAISE EXCEPTION 'la vía normal ya no admite esta salida (%): regístrela como tardía', v_motivo_nv USING ERRCODE = 'P0001', DETAIL = 'NEX:' || v_motivo_nv;
  END IF;

  IF p_tipo_salida = 'ERROR_TRANSMISION' THEN
    INSERT INTO public.documento_electronico_envio_evidencias (empresa_id, documento_id, version, operacion_id, tipo_evento, nro_post, mensaje, respuesta_truncada, actor_id)
    VALUES (p_empresa, p_documento, o.version, p_operacion, 'ERROR_TRANSMISION', p_nro_post, p_clase_error, false, p_usuario)
    RETURNING id INTO v_id;
    RETURN QUERY SELECT v_id, NULL::text, NULL::text, false; RETURN;
  END IF;

  -- P: procesamiento común (esquema contra el snapshot transmitido, saneado, clasificación SQL = aplicación, cotejo). Si algo falla, la transacción se revierte y la aplicación vuelve a
  -- registrar la MISMA salida sin P (motivo PROYECCION_RECHAZADA o CREDENCIALES_RESIDUALES): el cierre quedará indeterminado (D-C02-2-A).
  IF p_proyeccion IS NOT NULL THEN
    SELECT * INTO q FROM public.fe_e03_r05_procesar_proyeccion(p_proyeccion, p_http, d.tipo, d.establecimiento, d.punto_expedicion, d.numero, v_snapshot,
                                                               v_resp, coalesce(p_respuesta_truncada, false), v_redactado);
  END IF;

  v_mensaje := CASE WHEN v_redactado THEN 'respuesta con credenciales redactadas' END;
  INSERT INTO public.documento_electronico_envio_evidencias (empresa_id, documento_id, version, operacion_id, tipo_evento, nro_post, http_status, respuesta_saneada, respuesta_truncada, respuesta_bytes, respuesta_sha256, mensaje, actor_id)
  VALUES (p_empresa, p_documento, o.version, p_operacion, 'HTTP_RESPUESTA', p_nro_post, p_http, v_resp, coalesce(p_respuesta_truncada, false), v_bytes, v_sha, v_mensaje, p_usuario)
  RETURNING id INTO v_id;

  IF p_proyeccion IS NOT NULL THEN
    INSERT INTO public.documento_electronico_envio_proyecciones_r05 (empresa_id, documento_id, version, operacion_id, evento_id, nro_post, proyeccion, regla, resultado, estado_local, error_tipo, cotejo, campos_cotejados, actor_id)
    VALUES (p_empresa, p_documento, o.version, p_operacion, v_id, p_nro_post, q.o_proyeccion, q.o_regla, q.o_resultado, q.o_estado_local, q.o_error_tipo, q.o_cotejo, q.o_campos, p_usuario);
    RETURN QUERY SELECT v_id, q.o_regla, q.o_cotejo, false; RETURN;
  END IF;
  INSERT INTO public.documento_electronico_envio_proyecciones_r05 (empresa_id, documento_id, version, operacion_id, evento_id, nro_post, motivo_sin_proyeccion, actor_id)
  VALUES (p_empresa, p_documento, o.version, p_operacion, v_id, p_nro_post, p_motivo_sin_proyeccion, p_usuario);
  RETURN QUERY SELECT v_id, NULL::text, NULL::text, false;
END $$;

-- 6.5 Ausencia comprobada de POST (motivo cerrado). Solo sin ningún POST (normal o grande). Terminal: después solo cabe el cierre.
CREATE OR REPLACE FUNCTION public.fe_e03_registrar_no_transmitido_r05(p_empresa uuid, p_usuario uuid, p_documento uuid, p_operacion uuid, p_testigo text, p_motivo text)
RETURNS TABLE (o_evento_id uuid, o_reutilizado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d public.documentos_electronicos%ROWTYPE;
  o public.documento_electronico_envio_operaciones_r05%ROWTYPE;
  v_ev public.documento_electronico_envio_evidencias%ROWTYPE;
  v_motivo_nv text;
  v_id uuid;
BEGIN
  IF p_motivo IS NULL OR p_motivo NOT IN ('SIN_CREDENCIALES', 'FALLO_LOCAL', 'CUERPO_NO_COINCIDE', 'SOLICITUD_EXCEDE_LIMITE') THEN
    RAISE EXCEPTION 'motivo de no transmisión no válido' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_INVALIDO';
  END IF;
  d := public.fe_e03_r05_preparar(p_empresa, p_usuario, p_documento);
  o := public.fe_e03_r05_operacion(p_empresa, p_usuario, p_documento, p_operacion, p_testigo);

  SELECT * INTO v_ev FROM public.documento_electronico_envio_evidencias e
   WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.operacion_id = p_operacion AND e.tipo_evento = 'NO_TRANSMITIDO';
  IF FOUND THEN
    IF v_ev.mensaje = p_motivo THEN
      RETURN QUERY SELECT v_ev.id, true; RETURN;
    END IF;
    RAISE EXCEPTION 'la operación ya se declaró NO TRANSMITIDA con otro motivo' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_CONTRADICTORIO';
  END IF;
  v_motivo_nv := public.fe_e03_r05_no_vigente(p_empresa, p_documento, p_operacion, d.estado_local);
  IF v_motivo_nv IS NOT NULL THEN
    RAISE EXCEPTION 'la operación de envío no admite este evento (%)', v_motivo_nv USING ERRCODE = 'P0001', DETAIL = 'NEX:' || v_motivo_nv;
  END IF;
  IF EXISTS (SELECT 1 FROM public.fe_e03_r05_posts(p_empresa, p_documento, p_operacion)) THEN
    RAISE EXCEPTION 'NO_TRANSMITIDO no es válido: la operación ya intentó un POST' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_CONTRADICTORIO';
  END IF;
  -- Un login fallido ya es la evidencia de la ausencia de POST (cierre AUT-1); NO_TRANSMITIDO lo contradiría (cerraría como RED indeterminado).
  IF EXISTS (SELECT 1 FROM public.documento_electronico_envio_autenticaciones_r05 a
              WHERE a.empresa_id = p_empresa AND a.documento_id = p_documento AND a.operacion_id = p_operacion AND a.resultado <> 'OK') THEN
    RAISE EXCEPTION 'NO_TRANSMITIDO no es válido: la autenticación registrada falló (el cierre se deriva de ella)' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_CONTRADICTORIO';
  END IF;

  INSERT INTO public.documento_electronico_envio_evidencias (empresa_id, documento_id, version, operacion_id, tipo_evento, mensaje, respuesta_truncada, actor_id)
  VALUES (p_empresa, p_documento, o.version, p_operacion, 'NO_TRANSMITIDO', p_motivo, false, p_usuario)
  RETURNING id INTO v_id;
  RETURN QUERY SELECT v_id, false;
END $$;

-- 6.6.0 R02-C02 (R-C01-03): derivación ÚNICA de la clasificación de cierre a partir de la evidencia persistida de UNA operación. Lectura pura: no bloquea, no escribe, no consulta la
-- vigencia, no autoriza ningún fetch. La usan fe_e03_cerrar_envio_r05 (que conserva bloqueo, guardas, comprobación de la clasificación esperada, persistencia e idempotencia) y
-- fe_e03_estado_operacion_r05 (clasificación PROVISIONAL de una operación abierta). o_derivable = false con o_motivo = 'CIERRE_SIN_EVIDENCIA' cuando el cierre todavía no es derivable
-- (sin POST, sin autenticación fallida y sin no transmisión). o_respuesta (respuesta saneada) y o_mensaje solo los consume el cierre para NEX-080; la lectura no los devuelve.
-- Solo para el propietario (funciones SECURITY DEFINER de NEX-084): sin EXECUTE para PUBLIC ni para nexit_runtime.
CREATE OR REPLACE FUNCTION public.fe_e03_r05_derivar_cierre(p_empresa uuid, p_documento uuid, p_operacion uuid)
RETURNS TABLE (o_derivable boolean, o_regla text, o_fase text, o_resultado text, o_estado_local text, o_error_tipo text, o_http integer, o_motivo text, o_mensaje text,
               o_lote text, o_cdc text, o_estado_gateway text, o_request_id text, o_respuesta jsonb, o_paridad boolean, o_salida text, o_http_post integer, o_http_autenticacion integer)
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_ev public.documento_electronico_envio_evidencias%ROWTYPE;
  v_pr public.documento_electronico_envio_proyecciones_r05%ROWTYPE;
  a1 public.documento_electronico_envio_autenticaciones_r05%ROWTYPE;
  a2 public.documento_electronico_envio_autenticaciones_r05%ROWTYPE;
  v_derivable boolean := true;
  v_no boolean;
  v_n_posts integer;
  v_ultimo smallint;
  v_tiene_salida boolean := false;
  v_tiene_pr boolean := false;
  v_salida text := 'SIN_POST';
  v_http_post integer;
  v_http_aut integer;
  v_regla text;
  v_fase text := 'TRANSMISION';
  v_resultado text;
  v_estado text;
  v_error_tipo text;
  v_http integer;
  v_mensaje text;
  v_lote text;
  v_cdc text;
  v_estado_gateway text;
  v_request_id text;
  v_respuesta jsonb;
  v_motivo text;
  v_paridad boolean;
BEGIN
  v_no := EXISTS (SELECT 1 FROM public.documento_electronico_envio_evidencias e WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.operacion_id = p_operacion AND e.tipo_evento = 'NO_TRANSMITIDO');
  SELECT count(*), max(x.o_nro) INTO v_n_posts, v_ultimo FROM public.fe_e03_r05_posts(p_empresa, p_documento, p_operacion) x;
  SELECT * INTO a1 FROM public.documento_electronico_envio_autenticaciones_r05 WHERE empresa_id = p_empresa AND documento_id = p_documento AND operacion_id = p_operacion AND nro = 1;
  SELECT * INTO a2 FROM public.documento_electronico_envio_autenticaciones_r05 WHERE empresa_id = p_empresa AND documento_id = p_documento AND operacion_id = p_operacion AND nro = 2;
  IF v_n_posts > 0 THEN
    SELECT * INTO v_ev FROM public.documento_electronico_envio_evidencias e
     WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.operacion_id = p_operacion AND e.nro_post = v_ultimo AND e.tipo_evento IN ('HTTP_RESPUESTA', 'ERROR_TRANSMISION');
    v_tiene_salida := FOUND;
    IF v_tiene_salida AND v_ev.tipo_evento = 'HTTP_RESPUESTA' THEN
      SELECT * INTO v_pr FROM public.documento_electronico_envio_proyecciones_r05 y WHERE y.empresa_id = p_empresa AND y.documento_id = p_documento AND y.evento_id = v_ev.id;
      v_tiene_pr := FOUND AND v_pr.proyeccion IS NOT NULL;
    END IF;
  END IF;

  IF v_no THEN
    -- Paridad con la aplicación vigente (envio.ts: sin credenciales o fallo interno → RED / TRANSMISION / indeterminado).
    v_regla := 'NT'; v_resultado := 'RED'; v_estado := 'ENVIO_INDETERMINADO'; v_motivo := 'NO_TRANSMITIDO';
    v_mensaje := 'Error interno durante el envío: el resultado es indeterminado.';
  ELSIF v_n_posts = 0 THEN
    IF a1.id IS NOT NULL AND a1.resultado <> 'OK' THEN
      v_regla := 'AUT-1'; v_fase := 'AUTENTICACION'; v_resultado := a1.resultado; v_estado := 'ERROR_ENVIO'; v_error_tipo := 'AUTENTICACION'; v_http := a1.http_status;
    ELSE
      v_derivable := false; v_motivo := 'CIERRE_SIN_EVIDENCIA';
    END IF;
  ELSIF v_ultimo = 1 AND public.fe_e03_r05_token_rechazado_post1(p_empresa, p_documento, p_operacion) AND a2.id IS NOT NULL AND a2.resultado <> 'OK' THEN
    v_regla := 'AUT-2'; v_fase := 'AUTENTICACION'; v_resultado := a2.resultado; v_estado := 'ERROR_ENVIO'; v_error_tipo := 'AUTENTICACION'; v_http := a2.http_status;
  ELSIF v_ultimo = 1 AND public.fe_e03_r05_token_rechazado_post1(p_empresa, p_documento, p_operacion) THEN
    v_regla := 'EI-TOKEN-SIN-POST2'; v_resultado := 'ERROR_HTTP'; v_estado := 'ENVIO_INDETERMINADO'; v_http := v_ev.http_status; v_respuesta := v_ev.respuesta_saneada;
    v_motivo := 'EVIDENCIA_INSUFICIENTE';
    v_mensaje := 'Evidencia insuficiente: el token fue rechazado y no consta la renovación ni el reenvío; verifique en el gateway (consulta) antes de reenviar.';
  ELSIF NOT v_tiene_salida THEN
    v_regla := 'EI-SIN-SALIDA'; v_resultado := 'RESPUESTA_INVALIDA'; v_estado := 'ENVIO_INDETERMINADO'; v_motivo := 'EVIDENCIA_INSUFICIENTE';
    v_mensaje := 'Evidencia insuficiente: no consta la salida del último POST; el gateway pudo haber recibido el documento. Verifique (consulta) antes de reenviar.';
  ELSIF v_ev.tipo_evento = 'ERROR_TRANSMISION' THEN
    v_regla := 'ET-' || v_ev.mensaje; v_resultado := v_ev.mensaje; v_estado := 'ENVIO_INDETERMINADO';
    v_mensaje := CASE v_ev.mensaje WHEN 'TIMEOUT' THEN 'Tiempo de espera agotado: el gateway pudo haber recibido el documento.'
                                   ELSE 'Error de red durante la transmisión: el gateway pudo haber recibido el documento.' END;
  ELSIF NOT v_tiene_pr THEN
    v_regla := 'EI-SIN-P'; v_resultado := CASE WHEN v_ev.http_status BETWEEN 200 AND 299 THEN 'RESPUESTA_INVALIDA' ELSE 'ERROR_HTTP' END; v_estado := 'ENVIO_INDETERMINADO';
    v_http := v_ev.http_status; v_respuesta := v_ev.respuesta_saneada; v_motivo := 'EVIDENCIA_INSUFICIENTE';
    v_mensaje := 'Evidencia insuficiente: la respuesta del gateway no pudo verificarse; verifique en el gateway (consulta) antes de reenviar.';
  ELSE
    v_regla := v_pr.regla; v_resultado := v_pr.resultado; v_estado := v_pr.estado_local; v_error_tipo := v_pr.error_tipo; v_http := v_ev.http_status; v_respuesta := v_ev.respuesta_saneada;
    v_mensaje := v_pr.proyeccion #>> '{lectura,texto_resultado}';
    v_estado_gateway := v_pr.proyeccion #>> '{lectura,estado_gateway}';
    v_request_id := v_pr.proyeccion #>> '{lectura,request_id}';
    v_cdc := v_pr.proyeccion #>> '{cdc,valor}';
    IF v_regla = 'R-06f' THEN
      v_lote := v_pr.proyeccion #>> '{lote,texto}';
      v_paridad := public.fe_e03_r05_lote_nex080(v_lote);
    END IF;
  END IF;
  -- R02-C01 F003: salida del último POST (ausencia de evidencia ≠ ausencia de HTTP) y HTTP del POST y de la autenticación, por separado.
  v_salida := CASE WHEN v_n_posts = 0 THEN 'SIN_POST' WHEN NOT v_tiene_salida THEN 'SIN_SALIDA' ELSE v_ev.tipo_evento END;
  v_http_post := CASE WHEN v_salida = 'HTTP_RESPUESTA' THEN v_ev.http_status END;
  v_http_aut := CASE WHEN v_regla = 'AUT-1' THEN a1.http_status WHEN a2.id IS NOT NULL THEN a2.http_status ELSE a1.http_status END;
  IF v_fase = 'AUTENTICACION' THEN
    v_mensaje := CASE v_resultado WHEN 'TIMEOUT' THEN 'Tiempo de espera agotado al autenticar con el gateway.'
                                  WHEN 'RED' THEN 'No fue posible comunicarse con el gateway.'
                                  ELSE 'El gateway rechazó la autenticación (credenciales de la empresa).' END;
  END IF;

  RETURN QUERY SELECT v_derivable, v_regla, CASE WHEN v_derivable THEN v_fase END, v_resultado, v_estado, v_error_tipo, v_http, v_motivo, v_mensaje, v_lote, v_cdc, v_estado_gateway,
                      v_request_id, v_respuesta, v_paridad, v_salida, v_http_post, v_http_aut;
END $$;

-- 6.6 Cierre derivado EXCLUSIVAMENTE de la evidencia persistida (sin respuesta, lote, CDC ni mensajes del llamador). El llamador declara la clasificación que espera; si no coincide con la
-- derivada → NEX:CIERRE_CONTRADICTORIO sin escribir nada. Repetición: misma clasificación → la persistida (o_reutilizado); otra → NEX:CIERRE_DISTINTO. Nunca escribe estado_sifen.
-- R02-C01 F003: el retorno (también en la repetición) da el resultado HISTÓRICO completo (regla, fase, resultado, tipo de error, motivo, salida del último POST, HTTP del POST y de la
-- autenticación por separado, lote y CDC tal como quedaron en el intento, fecha del cierre) y, separado, el estado ACTUAL del documento. Nunca testigo, su hash, secretos ni payload.
CREATE OR REPLACE FUNCTION public.fe_e03_cerrar_envio_r05(
  p_empresa uuid, p_usuario uuid, p_documento uuid, p_operacion uuid, p_testigo text, p_clasificacion_esperada jsonb)
RETURNS TABLE (o_estado_local text, o_intento_id uuid, o_regla text, o_reutilizado boolean, o_fase text, o_resultado text, o_error_tipo text, o_motivo text,
               o_salida_ultimo_post text, o_http_post integer, o_http_autenticacion integer, o_lote text, o_cdc text, o_cerrado_at timestamptz, o_estado_documento_actual text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d public.documentos_electronicos%ROWTYPE;
  o public.documento_electronico_envio_operaciones_r05%ROWTYPE;
  v_ci public.documento_electronico_envio_cierres_r05%ROWTYPE;
  v_der record;
  v_salida text;
  v_http_post integer;
  v_http_aut integer;
  v_motivo_nv text;
  v_regla text;
  v_fase text;
  v_resultado text;
  v_estado text;
  v_error_tipo text;
  v_http integer;
  v_mensaje text;
  v_lote text;
  v_cdc text;
  v_estado_gateway text;
  v_request_id text;
  v_respuesta jsonb;
  v_motivo text;
  v_paridad boolean;
  v_clasif jsonb;
  v_huella text;
  v_antes uuid[];
  v_nuevos uuid[];
  v_estado_final text;
  v_evento uuid;
BEGIN
  IF p_clasificacion_esperada IS NULL OR NOT public.fe_e03_r05_claves_exactas(p_clasificacion_esperada, ARRAY['regla', 'resultado', 'estado_local', 'error_tipo']) THEN
    RAISE EXCEPTION 'la clasificación esperada debe tener exactamente regla, resultado, estado_local y error_tipo' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_INVALIDO';
  END IF;
  d := public.fe_e03_r05_preparar(p_empresa, p_usuario, p_documento);
  o := public.fe_e03_r05_operacion(p_empresa, p_usuario, p_documento, p_operacion, p_testigo);

  SELECT * INTO v_ci FROM public.documento_electronico_envio_cierres_r05 WHERE operacion_id = p_operacion;
  IF FOUND THEN
    IF encode(sha256(convert_to(p_clasificacion_esperada::text, 'UTF8')), 'hex') = v_ci.clasificacion_sha256 THEN
      RETURN QUERY SELECT v_ci.estado_local, v_ci.intento_id, v_ci.regla, true, v_ci.fase, v_ci.resultado, v_ci.error_tipo, v_ci.motivo, v_ci.salida_ultimo_post, v_ci.http_post,
                          v_ci.http_autenticacion, i.lote, i.cdc_informado, v_ci.creado_at, d.estado_local
                     FROM public.documento_electronico_intentos i WHERE i.empresa_id = p_empresa AND i.documento_id = p_documento AND i.id = v_ci.intento_id;
      RETURN;
    END IF;
    RAISE EXCEPTION 'la operación ya se cerró con otra clasificación' USING ERRCODE = 'P0001', DETAIL = 'NEX:CIERRE_DISTINTO';
  END IF;
  v_motivo_nv := public.fe_e03_r05_no_vigente(p_empresa, p_documento, p_operacion, d.estado_local);
  IF v_motivo_nv IS NOT NULL THEN
    RAISE EXCEPTION 'la operación de envío no admite el cierre (%)', v_motivo_nv USING ERRCODE = 'P0001', DETAIL = 'NEX:' || v_motivo_nv;
  END IF;

  -- R02-C02 (R-C01-03): derivación ÚNICA compartida con la lectura de recuperación (fe_e03_r05_derivar_cierre). El cierre conserva preparar (bloqueo FOR UPDATE del documento),
  -- operación/testigo, vigencia, comprobación de p_clasificacion_esperada, registro NEX-080, evento CIERRE, fila de cierre e idempotencia.
  SELECT * INTO v_der FROM public.fe_e03_r05_derivar_cierre(p_empresa, p_documento, p_operacion);
  IF NOT v_der.o_derivable THEN
    RAISE EXCEPTION 'no hay evidencia para cerrar la operación (sin POST, sin autenticación fallida ni no transmisión)' USING ERRCODE = 'P0001', DETAIL = 'NEX:CIERRE_SIN_EVIDENCIA';
  END IF;
  v_regla := v_der.o_regla; v_fase := v_der.o_fase; v_resultado := v_der.o_resultado; v_estado := v_der.o_estado_local; v_error_tipo := v_der.o_error_tipo;
  v_http := v_der.o_http; v_motivo := v_der.o_motivo; v_mensaje := v_der.o_mensaje; v_lote := v_der.o_lote; v_cdc := v_der.o_cdc;
  v_estado_gateway := v_der.o_estado_gateway; v_request_id := v_der.o_request_id; v_respuesta := v_der.o_respuesta; v_paridad := v_der.o_paridad;
  v_salida := v_der.o_salida; v_http_post := v_der.o_http_post; v_http_aut := v_der.o_http_autenticacion;

  v_clasif := jsonb_build_object('regla', v_regla, 'resultado', v_resultado, 'estado_local', v_estado, 'error_tipo', v_error_tipo);
  IF v_clasif <> p_clasificacion_esperada THEN
    RAISE EXCEPTION 'la clasificación esperada no coincide con la derivada de la evidencia (regla %)', v_regla USING ERRCODE = 'P0001', DETAIL = 'NEX:CIERRE_CONTRADICTORIO';
  END IF;
  v_huella := encode(sha256(convert_to(v_clasif::text, 'UTF8')), 'hex');

  SELECT coalesce(array_agg(i.id), ARRAY[]::uuid[]) INTO v_antes FROM public.documento_electronico_intentos i
   WHERE i.empresa_id = p_empresa AND i.documento_id = p_documento AND i.tipo = 'ENVIO';
  v_estado_final := public.fe_documento_registrar_envio_r05(p_empresa, p_usuario, p_documento, v_fase, v_resultado, v_estado, v_error_tipo, v_http, v_request_id,
                                                            v_estado_gateway, v_mensaje, v_lote, v_cdc, v_respuesta, o.conexion);
  SELECT coalesce(array_agg(i.id), ARRAY[]::uuid[]) INTO v_nuevos FROM public.documento_electronico_intentos i
   WHERE i.empresa_id = p_empresa AND i.documento_id = p_documento AND i.tipo = 'ENVIO' AND i.id <> ALL (v_antes);
  IF cardinality(v_nuevos) <> 1 THEN
    RAISE EXCEPTION 'no se pudo identificar el intento de envío registrado' USING ERRCODE = 'P0001', DETAIL = 'NEX:INTENTO_NO_IDENTIFICADO';
  END IF;

  INSERT INTO public.documento_electronico_envio_evidencias (empresa_id, documento_id, version, operacion_id, tipo_evento, http_status, intento_id, respuesta_truncada, actor_id)
  VALUES (p_empresa, p_documento, o.version, p_operacion, 'CIERRE', v_http, v_nuevos[1], false, p_usuario)
  RETURNING id INTO v_evento;
  INSERT INTO public.documento_electronico_envio_cierres_r05 (operacion_id, empresa_id, documento_id, version, evento_cierre_id, intento_id, regla, fase, resultado, estado_local, error_tipo,
                                                             http_status, salida_ultimo_post, http_post, http_autenticacion, motivo, clasificacion_sha256, lote_paridad, actor_id)
  VALUES (p_operacion, p_empresa, p_documento, o.version, v_evento, v_nuevos[1], v_regla, v_fase, v_resultado, v_estado, v_error_tipo, v_http, v_salida, v_http_post, v_http_aut,
          v_motivo, v_huella, v_paridad, p_usuario);

  RETURN QUERY SELECT v_estado_final, v_nuevos[1], v_regla, false, v_fase, v_resultado, v_error_tipo, v_motivo, v_salida, v_http_post, v_http_aut, i.lote, i.cdc_informado, c.creado_at,
                      (SELECT x.estado_local FROM public.documentos_electronicos x WHERE x.empresa_id = p_empresa AND x.id = p_documento)
                 FROM public.documento_electronico_intentos i
                 JOIN public.documento_electronico_envio_cierres_r05 c ON c.operacion_id = p_operacion
                WHERE i.empresa_id = p_empresa AND i.documento_id = p_documento AND i.id = v_nuevos[1];
END $$;

-- 6.7 Salida tardía: solo cuando la vía normal NO la admite (motivo con la precedencia de fe_e03_r05_no_vigente) y el POST no tiene salida normal. Append-only; no cambia estado ni cierre.
-- R02-C01 F002: la P recibe el MISMO procesamiento que en la vía normal (fe_e03_r05_procesar_proyeccion), pero su falla no impide conservar la salida; el estado queda explícito:
--   A SIN_PROYECCION (sin P, con el motivo declarado como en la vía normal) · B PROYECCION_DESCARTADA (P enviada que no pasó: motivo seguro tomado del DETAIL NEX:…, sin valores)
--   C PROYECCION_VALIDADA (respuesta no cotejable) · D PROYECCION_COTEJADA_PARCIAL. La clasificación de C/D es informativa.
-- Huella = SHA-256 del jsonb canónico de: tipo, HTTP, clase de error, SHA-256 y bytes de la respuesta, truncamiento, estado de la P, motivo, motivo de descarte, P canónica, clasificación
-- y cotejo. Repetición con la misma huella → la persistida (o_reutilizado); otra → NEX:SALIDA_TARDIA_DISTINTA. Las escrituras del documento están serializadas por su bloqueo FOR UPDATE.
CREATE OR REPLACE FUNCTION public.fe_e03_registrar_salida_tardia_r05(
  p_empresa uuid, p_usuario uuid, p_documento uuid, p_operacion uuid, p_testigo text, p_nro_post smallint, p_tipo_salida text, p_http integer,
  p_respuesta jsonb, p_respuesta_truncada boolean, p_clase_error text, p_proyeccion jsonb, p_motivo_sin_proyeccion text)
RETURNS TABLE (o_salida_id uuid, o_motivo text, o_estado_proyeccion text, o_reutilizado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d public.documentos_electronicos%ROWTYPE;
  o public.documento_electronico_envio_operaciones_r05%ROWTYPE;
  v_t public.documento_electronico_envio_salidas_tardias_r05%ROWTYPE;
  v_post record;
  v_motivo text;
  v_snapshot jsonb;
  v_resp jsonb;
  v_resp_txt text;
  v_redactado boolean := false;
  v_bytes integer;
  v_sha text;
  v_estado text;
  v_descarte text;
  v_detalle text;
  v_p jsonb;
  v_regla text;
  v_resultado text;
  v_estado_local text;
  v_error_tipo text;
  v_cotejo text;
  v_campos text[];
  v_huella text;
  v_id uuid;
BEGIN
  IF p_nro_post IS NULL OR p_nro_post NOT BETWEEN 1 AND 2 OR p_tipo_salida IS NULL
     OR NOT ((p_tipo_salida = 'HTTP_RESPUESTA' AND p_http BETWEEN 100 AND 599 AND p_clase_error IS NULL AND (p_proyeccion IS NULL) <> (p_motivo_sin_proyeccion IS NULL)
              AND (p_motivo_sin_proyeccion IS NULL OR p_motivo_sin_proyeccion IN ('PROYECCION_RECHAZADA', 'CREDENCIALES_RESIDUALES', 'CUERPO_NO_PROYECTABLE', 'FALLO_LOCAL')))
          OR (p_tipo_salida = 'ERROR_TRANSMISION' AND p_http IS NULL AND p_clase_error IN ('TIMEOUT', 'RED') AND p_respuesta IS NULL AND p_proyeccion IS NULL
              AND p_motivo_sin_proyeccion IS NULL)) THEN
    RAISE EXCEPTION 'salida tardía no válida' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_INVALIDO';
  END IF;
  d := public.fe_e03_r05_preparar(p_empresa, p_usuario, p_documento);
  o := public.fe_e03_r05_operacion(p_empresa, p_usuario, p_documento, p_operacion, p_testigo);

  SELECT * INTO v_post FROM public.fe_e03_r05_posts(p_empresa, p_documento, p_operacion) x WHERE x.o_nro = p_nro_post;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'el POST indicado no existe en esta operación' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_CONTRADICTORIO';
  END IF;
  IF EXISTS (SELECT 1 FROM public.documento_electronico_envio_evidencias e
              WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.operacion_id = p_operacion AND e.nro_post = p_nro_post AND e.tipo_evento IN ('HTTP_RESPUESTA', 'ERROR_TRANSMISION')) THEN
    RAISE EXCEPTION 'el POST ya tiene su salida normal registrada' USING ERRCODE = 'P0001', DETAIL = 'NEX:SALIDA_DISTINTA';
  END IF;
  SELECT sol.payload INTO v_snapshot FROM public.documento_electronico_solicitudes sol WHERE sol.empresa_id = p_empresa AND sol.documento_id = p_documento AND sol.version = o.version;

  IF p_respuesta IS NOT NULL THEN
    v_resp_txt := public.fe_e03_redactar_texto(p_respuesta::text);
    IF v_resp_txt IS DISTINCT FROM p_respuesta::text THEN v_redactado := true; END IF;
    IF public.fe_e03_secreto_residual(v_resp_txt) THEN
      RAISE EXCEPTION 'la respuesta contiene credenciales que no se pudieron redactar: no se registra' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVIDENCIA_CON_CREDENCIALES';
    END IF;
    v_resp := v_resp_txt::jsonb;
    IF pg_column_size(v_resp) >= 65536 THEN
      RAISE EXCEPTION 'la respuesta saneada supera el límite: envíela truncada' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_INVALIDO';
    END IF;
    v_bytes := octet_length(convert_to(v_resp::text, 'UTF8'));
    v_sha := encode(sha256(convert_to(v_resp::text, 'UTF8')), 'hex');
  ELSIF coalesce(p_respuesta_truncada, false) THEN
    RAISE EXCEPTION 'una respuesta truncada exige el objeto parcial saneado' USING ERRCODE = 'P0001', DETAIL = 'NEX:EVENTO_INVALIDO';
  END IF;

  IF p_tipo_salida = 'ERROR_TRANSMISION' THEN
    v_estado := 'NO_APLICA';
  ELSIF p_proyeccion IS NULL THEN
    v_estado := 'SIN_PROYECCION';
  ELSE
    BEGIN
      SELECT x.o_proyeccion, x.o_regla, x.o_resultado, x.o_estado_local, x.o_error_tipo, x.o_cotejo, x.o_campos
        INTO v_p, v_regla, v_resultado, v_estado_local, v_error_tipo, v_cotejo, v_campos
        FROM public.fe_e03_r05_procesar_proyeccion(p_proyeccion, p_http, d.tipo, d.establecimiento, d.punto_expedicion, d.numero, v_snapshot,
                                                   v_resp, coalesce(p_respuesta_truncada, false), v_redactado) x;
      v_estado := CASE WHEN v_cotejo = 'COTEJADO_PARCIAL' THEN 'PROYECCION_COTEJADA_PARCIAL' ELSE 'PROYECCION_VALIDADA' END;
    EXCEPTION WHEN raise_exception OR data_exception THEN
      GET STACKED DIAGNOSTICS v_detalle = PG_EXCEPTION_DETAIL;
      v_p := NULL; v_regla := NULL; v_resultado := NULL; v_estado_local := NULL; v_error_tipo := NULL; v_cotejo := NULL; v_campos := NULL;
      v_estado := 'PROYECCION_DESCARTADA';
      v_descarte := CASE WHEN v_detalle IN ('NEX:PROYECCION_INVALIDA', 'NEX:PROYECCION_EXCEDIDA', 'NEX:PROYECCION_INCOHERENTE', 'NEX:CLASIFICACION_NO_COINCIDE',
                                            'NEX:EVIDENCIA_CON_CREDENCIALES', 'NEX:IDENTIDAD_SNAPSHOT_DISTINTA') THEN substr(v_detalle, 5) ELSE 'OTRO' END;
    END;
  END IF;
  v_huella := encode(sha256(convert_to(jsonb_build_object(
                'tipo', p_tipo_salida, 'http', p_http, 'clase', p_clase_error, 'respuesta', v_sha, 'bytes', v_bytes, 'truncada', coalesce(p_respuesta_truncada, false),
                'estado_proyeccion', v_estado, 'motivo_sin_proyeccion', p_motivo_sin_proyeccion, 'motivo_descarte', v_descarte, 'proyeccion', v_p,
                'regla', v_regla, 'resultado', v_resultado, 'estado_local', v_estado_local, 'error_tipo', v_error_tipo, 'cotejo', v_cotejo, 'campos', to_jsonb(v_campos))::text, 'UTF8')), 'hex');

  SELECT * INTO v_t FROM public.documento_electronico_envio_salidas_tardias_r05 t
   WHERE t.empresa_id = p_empresa AND t.documento_id = p_documento AND t.operacion_id = p_operacion AND t.nro_post = p_nro_post;
  IF FOUND THEN
    IF v_t.huella_sha256 = v_huella AND v_t.version = o.version THEN
      RETURN QUERY SELECT v_t.id, v_t.motivo_tardia, v_t.estado_proyeccion, true; RETURN;
    END IF;
    RAISE EXCEPTION 'el POST ya tiene otra salida tardía registrada' USING ERRCODE = 'P0001', DETAIL = 'NEX:SALIDA_TARDIA_DISTINTA';
  END IF;

  v_motivo := public.fe_e03_r05_no_vigente(p_empresa, p_documento, p_operacion, d.estado_local);
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'la vía normal todavía admite esta salida: regístrela con fe_e03_registrar_salida_r05' USING ERRCODE = 'P0001', DETAIL = 'NEX:SALIDA_ADMISIBLE';
  END IF;

  INSERT INTO public.documento_electronico_envio_salidas_tardias_r05 (empresa_id, documento_id, version, operacion_id, nro_post, post_evento_id, post_grande_id, tipo_salida, clase_error,
                                                                      http_status, respuesta_saneada, respuesta_truncada, respuesta_sha256, respuesta_bytes, proyeccion, estado_proyeccion,
                                                                      motivo_sin_proyeccion, motivo_descarte, regla, resultado, estado_local, error_tipo, cotejo, campos_cotejados,
                                                                      motivo_tardia, huella_sha256, actor_id)
  VALUES (p_empresa, p_documento, o.version, p_operacion, p_nro_post, v_post.o_evento_id, v_post.o_grande_id, p_tipo_salida, p_clase_error,
          p_http, v_resp, coalesce(p_respuesta_truncada, false), v_sha, v_bytes, v_p, v_estado,
          p_motivo_sin_proyeccion, v_descarte, v_regla, v_resultado, v_estado_local, v_error_tipo, v_cotejo, v_campos,
          v_motivo, v_huella, p_usuario)
  RETURNING id INTO v_id;
  RETURN QUERY SELECT v_id, v_motivo, v_estado, false;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 7) Lecturas (disponibles en ambos modos; sin testigo ni su hash)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Operación por correlación (recuperación de un inicio perdido): solo el mismo actor, con permiso CREAR y alcance. Devuelve si sigue vigente; el derecho de POST NO se deriva de aquí.
CREATE OR REPLACE FUNCTION public.fe_e03_operacion_por_correlacion_r05(p_empresa uuid, p_usuario uuid, p_documento uuid, p_correlacion uuid)
RETURNS TABLE (o_operacion_id uuid, o_version smallint, o_vigente boolean, o_cerrada boolean, o_creado_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d public.documentos_electronicos%ROWTYPE;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO d FROM public.documentos_electronicos WHERE empresa_id = p_empresa AND id = p_documento;
  IF NOT FOUND OR NOT public.sucursal_en_alcance(p_empresa, p_usuario, d.sucursal_id) THEN
    RAISE EXCEPTION 'documento no encontrado' USING ERRCODE = 'P0001', DETAIL = 'NEX:DOCUMENTO_NO_ENCONTRADO';
  END IF;
  RETURN QUERY
    SELECT o.operacion_id, o.version, public.fe_e03_r05_no_vigente(p_empresa, p_documento, o.operacion_id, d.estado_local) IS NULL,
           EXISTS (SELECT 1 FROM public.documento_electronico_envio_cierres_r05 c WHERE c.operacion_id = o.operacion_id), o.creado_at
      FROM public.documento_electronico_envio_operaciones_r05 o
     WHERE o.empresa_id = p_empresa AND o.documento_id = p_documento AND o.correlacion_id = p_correlacion AND o.actor_id = p_usuario;
END $$;

-- R02-C01 F003 / R02-C02 (R-C01-03): estado completo de UNA operación para recuperar una respuesta perdida (del inicio, de una autenticación, de un POST, de una salida o del cierre),
-- TAMBIÉN con la operación ABIERTA. Mismo actor de la operación, permiso FACTURACION_ELECTRONICA.CREAR y sucursal en alcance, comprobados ANTES de leer. Sin testigo ni su hash, sin
-- payload, sin respuesta saneada ni bruta, sin P, sin mensajes del gateway, sin secretos. Leer NO autoriza ningún fetch: la renovación y el POST 2 dependen exclusivamente de
-- fe_e03_r05_token_rechazado_post1 dentro de las escrituras, y el cierre vuelve a derivar todo bajo bloqueo.
--   · Vigencia: o_vigente y, si no, o_motivo_no_vigente (OPERACION_CERRADA / OPERACION_NO_VIGENTE / DOCUMENTO_NO_ENVIANDO, misma precedencia que las escrituras).
--   · Autenticación inicial (nro 1) y renovación (nro 2), por separado: existencia, origen (HTTP / CACHE), resultado y HTTP.
--   · Último POST (número, id del evento NEX-072 o del POST grande, almacenamiento, instante) y su salida NORMAL: SIN_POST / SIN_SALIDA (ausencia de evidencia) /
--     ERROR_TRANSMISION (con su clase TIMEOUT / RED: consta que no hubo HTTP) / HTTP_RESPUESTA (HTTP; CON_PROYECCION / SIN_PROYECCION; regla, resultado, estado local derivado y tipo
--     de error persistidos con la P; motivo sin P; estado del cotejo y campos cotejados).
--   · Salida TARDÍA del último POST: solo OBSERVACIÓN (tipo, HTTP, estado de la proyección A/B/C/D); nunca resultado operativo ni insumo del cierre.
--   · Clasificación de cierre DERIVABLE (provisional): la MISMA derivación del cierre (fe_e03_r05_derivar_cierre) en el formato exacto de p_clasificacion_esperada
--     {regla, resultado, estado_local, error_tipo}; o o_cierre_derivable = false con o_motivo_no_derivable = CIERRE_SIN_EVIDENCIA (todavía no derivable) u OPERACION_CERRADA (rige el
--     resultado histórico). Es provisional: el cierre la vuelve a derivar bajo el bloqueo del documento y solo la acepta si la operación sigue vigente.
--   · Resultado HISTÓRICO definitivo del cierre (si existe), separado de la clasificación provisional y del estado ACTUAL del documento: o_estado_documento_actual =
--     documentos_electronicos.estado_local y o_estado_sifen_actual = documentos_electronicos.estado_sifen (p. ej. APROBADO es estado_sifen, nunca estado_local); ninguno se modifica.
CREATE OR REPLACE FUNCTION public.fe_e03_estado_operacion_r05(p_empresa uuid, p_usuario uuid, p_documento uuid, p_operacion uuid)
RETURNS TABLE (o_operacion_id uuid, o_version smallint, o_correlacion_id uuid, o_creado_at timestamptz, o_vigente boolean, o_motivo_no_vigente text, o_no_transmitido boolean,
               o_aut1_existe boolean, o_aut1_origen text, o_aut1_resultado text, o_aut1_http integer,
               o_aut2_existe boolean, o_aut2_origen text, o_aut2_resultado text, o_aut2_http integer,
               o_n_posts integer, o_ultimo_post smallint, o_ultimo_post_id uuid, o_ultimo_post_almacenamiento text, o_ultimo_post_at timestamptz,
               o_salida_ultimo_post text, o_http_ultimo_post integer, o_error_transmision text, o_proyeccion_ultimo_post text,
               o_regla_salida text, o_resultado_salida text, o_estado_local_salida text, o_error_tipo_salida text, o_motivo_sin_proyeccion text,
               o_cotejo_salida text, o_campos_cotejados text[],
               o_tardia_tipo text, o_tardia_http integer, o_tardia_estado_proyeccion text,
               o_cierre_derivable boolean, o_clasificacion_derivable jsonb, o_motivo_no_derivable text,
               o_cerrada boolean, o_regla text, o_fase text, o_resultado_historico text, o_estado_local_historico text, o_error_tipo text,
               o_motivo text, o_intento_id uuid, o_http_post integer, o_http_autenticacion integer, o_lote text, o_cdc text, o_cerrado_at timestamptz,
               o_estado_documento_actual text, o_estado_sifen_actual text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d public.documentos_electronicos%ROWTYPE;
  o public.documento_electronico_envio_operaciones_r05%ROWTYPE;
  a1 public.documento_electronico_envio_autenticaciones_r05%ROWTYPE;
  a2 public.documento_electronico_envio_autenticaciones_r05%ROWTYPE;
  v_post record;
  v_der record;
  v_ev public.documento_electronico_envio_evidencias%ROWTYPE;
  v_y public.documento_electronico_envio_proyecciones_r05%ROWTYPE;
  v_t public.documento_electronico_envio_salidas_tardias_r05%ROWTYPE;
  v_n integer;
  v_salida text;
  v_http integer;
  v_proy text;
  v_mnv text;
  v_cerrada boolean;
  v_derivable boolean;
  v_clasif jsonb;
  v_mnd text;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO d FROM public.documentos_electronicos WHERE empresa_id = p_empresa AND id = p_documento;
  IF NOT FOUND OR NOT public.sucursal_en_alcance(p_empresa, p_usuario, d.sucursal_id) THEN
    RAISE EXCEPTION 'documento no encontrado' USING ERRCODE = 'P0001', DETAIL = 'NEX:DOCUMENTO_NO_ENCONTRADO';
  END IF;
  SELECT * INTO o FROM public.documento_electronico_envio_operaciones_r05
   WHERE empresa_id = p_empresa AND documento_id = p_documento AND operacion_id = p_operacion AND actor_id = p_usuario;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'la operación de envío R05 no existe para este documento' USING ERRCODE = 'P0001', DETAIL = 'NEX:OPERACION_NO_ENCONTRADA';
  END IF;

  SELECT * INTO a1 FROM public.documento_electronico_envio_autenticaciones_r05 WHERE empresa_id = p_empresa AND documento_id = p_documento AND operacion_id = p_operacion AND nro = 1;
  SELECT * INTO a2 FROM public.documento_electronico_envio_autenticaciones_r05 WHERE empresa_id = p_empresa AND documento_id = p_documento AND operacion_id = p_operacion AND nro = 2;

  SELECT count(*) INTO v_n FROM public.fe_e03_r05_posts(p_empresa, p_documento, p_operacion);
  SELECT * INTO v_post FROM public.fe_e03_r05_posts(p_empresa, p_documento, p_operacion) x ORDER BY x.o_nro DESC LIMIT 1;
  IF v_n = 0 THEN
    v_salida := 'SIN_POST';
  ELSE
    SELECT * INTO v_ev FROM public.documento_electronico_envio_evidencias e
     WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.operacion_id = p_operacion AND e.nro_post = v_post.o_nro AND e.tipo_evento IN ('HTTP_RESPUESTA', 'ERROR_TRANSMISION');
    IF FOUND THEN
      v_salida := v_ev.tipo_evento;
      v_http := v_ev.http_status;
      IF v_ev.tipo_evento = 'HTTP_RESPUESTA' THEN
        SELECT * INTO v_y FROM public.documento_electronico_envio_proyecciones_r05 y WHERE y.empresa_id = p_empresa AND y.documento_id = p_documento AND y.evento_id = v_ev.id;
        IF FOUND THEN
          v_proy := CASE WHEN v_y.proyeccion IS NOT NULL THEN 'CON_PROYECCION' ELSE 'SIN_PROYECCION' END;
        END IF;
      END IF;
    ELSE
      v_salida := 'SIN_SALIDA';
    END IF;
    -- Observación: salida tardía del mismo POST (append-only, no operativa).
    SELECT * INTO v_t FROM public.documento_electronico_envio_salidas_tardias_r05 t
     WHERE t.empresa_id = p_empresa AND t.documento_id = p_documento AND t.operacion_id = p_operacion AND t.nro_post = v_post.o_nro;
  END IF;

  v_mnv := public.fe_e03_r05_no_vigente(p_empresa, p_documento, o.operacion_id, d.estado_local);
  v_cerrada := EXISTS (SELECT 1 FROM public.documento_electronico_envio_cierres_r05 c WHERE c.operacion_id = p_operacion AND c.empresa_id = p_empresa AND c.documento_id = p_documento);
  IF v_cerrada THEN
    v_derivable := false; v_mnd := 'OPERACION_CERRADA';
  ELSE
    SELECT * INTO v_der FROM public.fe_e03_r05_derivar_cierre(p_empresa, p_documento, p_operacion);
    v_derivable := v_der.o_derivable;
    IF v_derivable THEN
      v_clasif := jsonb_build_object('regla', v_der.o_regla, 'resultado', v_der.o_resultado, 'estado_local', v_der.o_estado_local, 'error_tipo', v_der.o_error_tipo);
    ELSE
      v_mnd := v_der.o_motivo;
    END IF;
  END IF;

  RETURN QUERY
    SELECT o.operacion_id, o.version, o.correlacion_id, o.creado_at, v_mnv IS NULL, v_mnv,
           EXISTS (SELECT 1 FROM public.documento_electronico_envio_evidencias e
                    WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.operacion_id = p_operacion AND e.tipo_evento = 'NO_TRANSMITIDO'),
           a1.id IS NOT NULL, a1.origen, a1.resultado, a1.http_status,
           a2.id IS NOT NULL, a2.origen, a2.resultado, a2.http_status,
           v_n, v_post.o_nro, coalesce(v_post.o_evento_id, v_post.o_grande_id),
           CASE WHEN v_n = 0 THEN NULL WHEN v_post.o_grande_id IS NULL THEN 'EVIDENCIA_NEX072' ELSE 'POST_GRANDE_R05' END, v_post.o_creado_at,
           v_salida, v_http, CASE WHEN v_salida = 'ERROR_TRANSMISION' THEN v_ev.mensaje END, v_proy,
           v_y.regla, v_y.resultado, v_y.estado_local, v_y.error_tipo, v_y.motivo_sin_proyeccion, v_y.cotejo, v_y.campos_cotejados,
           v_t.tipo_salida, v_t.http_status, CASE WHEN v_t.tipo_salida = 'HTTP_RESPUESTA' THEN v_t.estado_proyeccion END,
           v_derivable, v_clasif, v_mnd,
           c.operacion_id IS NOT NULL, c.regla, c.fase, c.resultado, c.estado_local, c.error_tipo, c.motivo, c.intento_id, c.http_post,
           c.http_autenticacion, i.lote, i.cdc_informado, c.creado_at, d.estado_local, d.estado_sifen
      FROM (SELECT 1) uno
      LEFT JOIN public.documento_electronico_envio_cierres_r05 c ON c.operacion_id = p_operacion AND c.empresa_id = p_empresa AND c.documento_id = p_documento
      LEFT JOIN public.documento_electronico_intentos i ON i.empresa_id = p_empresa AND i.documento_id = p_documento AND i.id = c.intento_id;
END $$;

-- Conexión de referencia del documento (C02 §4.3 corregido): candidatas = intentos ENVIO con conexión (instante = creado_at) y operaciones R05 con al menos un POST (instante = último POST);
-- orden total (instante DESC, id DESC); la referencia es la primera. o_ambigua = existe una operación R05 INCIERTA (sin cierre, o cerrada indeterminada) con POST y conexión distinta de la
-- referencia. La comparación con la configuración actual (MISMA/DISTINTA/SIN_REFERENCIA) es del Lote B: una referencia de otra cuenta da DISTINTA (409 sin llamar al gateway).
CREATE OR REPLACE FUNCTION public.fe_e03_conexion_referencia_r05(p_empresa uuid, p_usuario uuid, p_documento uuid)
RETURNS TABLE (o_conexion jsonb, o_origen text, o_referencia_id uuid, o_instante timestamptz, o_ambigua boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d public.documentos_electronicos%ROWTYPE;
  v_ref record;
BEGIN
  IF NOT (public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CREAR') OR public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'EDITAR')) THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA en esta empresa' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO d FROM public.documentos_electronicos WHERE empresa_id = p_empresa AND id = p_documento;
  IF NOT FOUND OR NOT public.sucursal_en_alcance(p_empresa, p_usuario, d.sucursal_id) THEN
    RAISE EXCEPTION 'documento no encontrado' USING ERRCODE = 'P0001', DETAIL = 'NEX:DOCUMENTO_NO_ENCONTRADO';
  END IF;

  SELECT c.conexion, c.origen, c.id, c.instante INTO v_ref FROM (
    SELECT i.conexion, 'INTENTO'::text AS origen, i.id, i.creado_at AS instante FROM public.documento_electronico_intentos i
     WHERE i.empresa_id = p_empresa AND i.documento_id = p_documento AND i.tipo = 'ENVIO' AND i.conexion IS NOT NULL
    UNION ALL
    SELECT o.conexion, 'OPERACION_R05'::text, o.operacion_id, (SELECT max(x.o_creado_at) FROM public.fe_e03_r05_posts(p_empresa, p_documento, o.operacion_id) x)
      FROM public.documento_electronico_envio_operaciones_r05 o
     WHERE o.empresa_id = p_empresa AND o.documento_id = p_documento AND EXISTS (SELECT 1 FROM public.fe_e03_r05_posts(p_empresa, p_documento, o.operacion_id))
  ) c ORDER BY c.instante DESC, c.id DESC LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::jsonb, NULL::text, NULL::uuid, NULL::timestamptz, false; RETURN;
  END IF;
  RETURN QUERY SELECT v_ref.conexion, v_ref.origen, v_ref.id, v_ref.instante,
    EXISTS (SELECT 1 FROM public.documento_electronico_envio_operaciones_r05 o
             WHERE o.empresa_id = p_empresa AND o.documento_id = p_documento AND o.conexion <> v_ref.conexion
               AND EXISTS (SELECT 1 FROM public.fe_e03_r05_posts(p_empresa, p_documento, o.operacion_id))
               AND NOT EXISTS (SELECT 1 FROM public.documento_electronico_envio_cierres_r05 c WHERE c.operacion_id = o.operacion_id AND c.estado_local <> 'ENVIO_INDETERMINADO'));
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 8) Comentarios y privilegios
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
COMMENT ON FUNCTION public.fe_e03_iniciar_envio_r05(uuid, uuid, uuid, boolean, uuid, text, jsonb) IS 'NEX-084: inicio correlacionado (correlación + hash de testigo) que envuelve fe_documento_iniciar_envio; una correlación repetida no vuelve a iniciar.';
COMMENT ON FUNCTION public.fe_e03_registrar_post_r05(uuid, uuid, uuid, uuid, text, smallint, text) IS 'NEX-084: POST antes del fetch, texto íntegro (D8-B: <= 1 MiB en NEX-072, > 1 MiB en posts_grandes_r05, límite defensivo 8 MiB). La repetición no autoriza otro fetch.';
COMMENT ON FUNCTION public.fe_e03_registrar_salida_r05(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, text, jsonb, text) IS 'NEX-084: salida de un POST con P validada (esquema cerrado contra el snapshot, saneado, clasificación SQL = aplicación, cotejo) o con el motivo de su ausencia; repetición solo con equivalencia semántica completa.';
COMMENT ON FUNCTION public.fe_e03_cerrar_envio_r05(uuid, uuid, uuid, uuid, text, jsonb) IS 'NEX-084: cierre derivado de la evidencia persistida; evidencia insuficiente → ENVIO_INDETERMINADO con motivo (D-C02-2-A); idempotente por operación; retorno histórico completo + estado actual.';
COMMENT ON FUNCTION public.fe_e03_registrar_salida_tardia_r05(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, text, jsonb, text) IS 'NEX-084: salida tardía append-only cuando la vía normal ya no la admite (P en estado A/B/C/D, huella semántica); no cambia estados ni cierre.';
COMMENT ON FUNCTION public.fe_e03_estado_operacion_r05(uuid, uuid, uuid, uuid) IS 'NEX-084 (R02-C01 F003 / R02-C02 R-C01-03): estado de una operación, abierta o cerrada, para recuperación (mismo actor, permiso y alcance): autenticación inicial y renovación por separado, último POST y salida normal con regla/resultado/estado local/error/motivo sin P/cotejo, tardía solo como observación, clasificación de cierre derivable provisional (misma derivación del cierre) o no derivable, histórico del cierre separado de estado_local y estado_sifen actuales; sin testigo, hash, payload ni respuesta.';

-- NEX-072 conserva su tabla y funciones; la aplicación no usa sus funciones de escritura (verificado en lib/) y desde NEX-084 la única vía de escritura de evidencia para nexit_runtime
-- es R05. Se redefine su ayudante (se descubre por el envoltorio) para retirar esas tres funciones a nexit_runtime en cada reaplicación de privilegios.
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_facturacion_e03() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;
  REVOKE ALL ON public.documento_electronico_envio_evidencias FROM nexit_runtime;
  GRANT SELECT ON public.documento_electronico_envio_evidencias TO nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_iniciar_envio(uuid, uuid, uuid, boolean) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_registrar_evento(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_cerrar_envio(uuid, uuid, uuid, uuid, text, text, text, text, integer, text, text, text, text, text, text, jsonb) FROM PUBLIC;
  -- NEX-084: sin EXECUTE para la aplicación (camino único R05).
  REVOKE ALL ON FUNCTION public.fe_e03_iniciar_envio(uuid, uuid, uuid, boolean) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_registrar_evento(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, text) FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_e03_cerrar_envio(uuid, uuid, uuid, uuid, text, text, text, text, integer, text, text, text, text, text, text, jsonb) FROM nexit_runtime;
END $$;
REVOKE ALL ON FUNCTION public.nex_aplicar_grants_facturacion_e03() FROM PUBLIC;

-- Ayudante R05 en dos estados: ACTIVO concede EXECUTE de escritura; REVERTIDO lo retira. Las 3 lecturas y el SELECT en ambos. testigo_sha256 nunca se concede (privilegio por columnas).
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_facturacion_e03_r05() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_modo text;
BEGIN
  REVOKE ALL ON FUNCTION public.nex_e03_r05_estado_guarda() FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_operacion_inicio_guarda() FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_evidencia_guarda() FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_post_grande_guarda() FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_claves_exactas(jsonb, text[]) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_bool(jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_entero(jsonb, numeric, numeric) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_texto(jsonb, integer, boolean) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_enum(jsonb, text[]) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_lote_valido(text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_lote_nex080(text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_alterado(jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_astral(text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_trim_js(text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_clase_eco(text, jsonb, jsonb, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_token_mensaje(jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_validar_proyeccion(jsonb, integer, text, text, text, text, jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_sanear_proyeccion(jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_clasificar_recepcion_r05(jsonb, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_cotejar(jsonb, jsonb, boolean, boolean) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_procesar_proyeccion(jsonb, integer, text, text, text, text, jsonb, jsonb, boolean, boolean) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_exigir_activo() FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_preparar(uuid, uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_hash_testigo(text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_operacion(uuid, uuid, uuid, uuid, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_no_vigente(uuid, uuid, uuid, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_token_rechazado_post1(uuid, uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_posts(uuid, uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_ultima_actividad(uuid, uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_abiertas(timestamptz) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_derivar_cierre(uuid, uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_iniciar_envio_r05(uuid, uuid, uuid, boolean, uuid, text, jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_registrar_autenticacion_r05(uuid, uuid, uuid, uuid, text, text, text, text, integer) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_registrar_post_r05(uuid, uuid, uuid, uuid, text, smallint, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_registrar_salida_r05(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, text, jsonb, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_registrar_no_transmitido_r05(uuid, uuid, uuid, uuid, text, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_cerrar_envio_r05(uuid, uuid, uuid, uuid, text, jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_registrar_salida_tardia_r05(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, text, jsonb, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_operacion_por_correlacion_r05(uuid, uuid, uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_estado_operacion_r05(uuid, uuid, uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_conexion_referencia_r05(uuid, uuid, uuid) FROM PUBLIC;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;
  REVOKE ALL ON public.nex_e03_r05_estado FROM nexit_runtime;
  REVOKE ALL ON public.documento_electronico_envio_operaciones_r05 FROM nexit_runtime;
  REVOKE ALL ON public.documento_electronico_envio_posts_grandes_r05 FROM nexit_runtime;
  REVOKE ALL ON public.documento_electronico_envio_autenticaciones_r05 FROM nexit_runtime;
  REVOKE ALL ON public.documento_electronico_envio_proyecciones_r05 FROM nexit_runtime;
  REVOKE ALL ON public.documento_electronico_envio_cierres_r05 FROM nexit_runtime;
  REVOKE ALL ON public.documento_electronico_envio_salidas_tardias_r05 FROM nexit_runtime;
  GRANT SELECT ON public.nex_e03_r05_estado TO nexit_runtime;
  GRANT SELECT (operacion_id, empresa_id, documento_id, version, correlacion_id, actor_id, confirma_rechazo, conexion, payload_hash, creado_at)
    ON public.documento_electronico_envio_operaciones_r05 TO nexit_runtime;
  GRANT SELECT ON public.documento_electronico_envio_posts_grandes_r05 TO nexit_runtime;
  GRANT SELECT ON public.documento_electronico_envio_autenticaciones_r05 TO nexit_runtime;
  GRANT SELECT ON public.documento_electronico_envio_proyecciones_r05 TO nexit_runtime;
  GRANT SELECT ON public.documento_electronico_envio_cierres_r05 TO nexit_runtime;
  GRANT SELECT ON public.documento_electronico_envio_salidas_tardias_r05 TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_e03_operacion_por_correlacion_r05(uuid, uuid, uuid, uuid) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_e03_conexion_referencia_r05(uuid, uuid, uuid) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_e03_estado_operacion_r05(uuid, uuid, uuid, uuid) TO nexit_runtime;

  SELECT modo INTO v_modo FROM public.nex_e03_r05_estado WHERE id;
  IF v_modo = 'ACTIVO' THEN
    GRANT EXECUTE ON FUNCTION public.fe_e03_iniciar_envio_r05(uuid, uuid, uuid, boolean, uuid, text, jsonb) TO nexit_runtime;
    GRANT EXECUTE ON FUNCTION public.fe_e03_registrar_autenticacion_r05(uuid, uuid, uuid, uuid, text, text, text, text, integer) TO nexit_runtime;
    GRANT EXECUTE ON FUNCTION public.fe_e03_registrar_post_r05(uuid, uuid, uuid, uuid, text, smallint, text) TO nexit_runtime;
    GRANT EXECUTE ON FUNCTION public.fe_e03_registrar_salida_r05(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, text, jsonb, text) TO nexit_runtime;
    GRANT EXECUTE ON FUNCTION public.fe_e03_registrar_no_transmitido_r05(uuid, uuid, uuid, uuid, text, text) TO nexit_runtime;
    GRANT EXECUTE ON FUNCTION public.fe_e03_cerrar_envio_r05(uuid, uuid, uuid, uuid, text, jsonb) TO nexit_runtime;
    GRANT EXECUTE ON FUNCTION public.fe_e03_registrar_salida_tardia_r05(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, text, jsonb, text) TO nexit_runtime;
  ELSE
    REVOKE ALL ON FUNCTION public.fe_e03_iniciar_envio_r05(uuid, uuid, uuid, boolean, uuid, text, jsonb) FROM nexit_runtime;
    REVOKE ALL ON FUNCTION public.fe_e03_registrar_autenticacion_r05(uuid, uuid, uuid, uuid, text, text, text, text, integer) FROM nexit_runtime;
    REVOKE ALL ON FUNCTION public.fe_e03_registrar_post_r05(uuid, uuid, uuid, uuid, text, smallint, text) FROM nexit_runtime;
    REVOKE ALL ON FUNCTION public.fe_e03_registrar_salida_r05(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, text, jsonb, text) FROM nexit_runtime;
    REVOKE ALL ON FUNCTION public.fe_e03_registrar_no_transmitido_r05(uuid, uuid, uuid, uuid, text, text) FROM nexit_runtime;
    REVOKE ALL ON FUNCTION public.fe_e03_cerrar_envio_r05(uuid, uuid, uuid, uuid, text, jsonb) FROM nexit_runtime;
    REVOKE ALL ON FUNCTION public.fe_e03_registrar_salida_tardia_r05(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, text, jsonb, text) FROM nexit_runtime;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.nex_aplicar_grants_facturacion_e03_r05() FROM PUBLIC;

SELECT public.nex_aplicar_grants_facturacion_e03();
SELECT public.nex_aplicar_grants_facturacion_e03_r05();
