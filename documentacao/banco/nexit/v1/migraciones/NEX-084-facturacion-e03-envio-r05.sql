-- NEX-084 — PRO-312-R02 / Lote A: contrato SQL de envío E03 «R05» (operación correlacionada, evidencia completa de cada POST, proyección acotada, cierre derivado de la evidencia,
-- salidas tardías y reversión coordinada). AUTORÍA SOLAMENTE: este archivo no se aplicó a ninguna base por decisión de esta orden; la aplicación en la VM es decisión del responsable.
--
-- Incremental y ADITIVA: NO edita NEX-001…083. No toca la aplicación vigente (lib/facturacion/envio.ts sigue usando fe_documento_iniciar_envio + fe_documento_registrar_envio_r05, intactas),
-- FE/NCE, CDC opaco (NEX-080), stock, KuDE ni la consulta manual o automática. No hay backfill: ninguna evidencia histórica se fabrica.
--
-- Decisiones del responsable incorporadas (orden ORD-CLAUDE-NEXIT-PRO-312-R02-NEX-084-2026-11-24):
--   D8-B      cuerpo HTTP ÍNTEGRO de cada POST: <= 1 MiB en la evidencia de NEX-072 (POST_INTENTADO, sin cambios); > 1 MiB en la tabla incremental
--             documento_electronico_envio_posts_grandes_r05 (texto íntegro + SHA-256 y bytes UTF-8 calculados aquí). Sin hash-only, sin ruta directa por tamaño, sin reducir las 999 líneas.
--             Límite DEFENSIVO 8 MiB (8388608 bytes), justificado: el snapshot que se transmite está acotado por NEX-048 (pg_column_size(payload) < 262144) y su serialización JSON no puede
--             superar ~6 veces ese tamaño binario (peor caso: caracteres de control escapados como \u00XX); 8 MiB cubre ese máximo con margen. Como el cuerpo se compara con el snapshot por
--             igualdad jsonb, solo un relleno de espacios lo haría crecer más: eso se rechaza (NEX:SOLICITUD_EXCEDE_LIMITE_DEFENSIVO) y el caso queda escrito para el Lote B.
--   D-C02-2-A evidencia insuficiente después de un POST posible → ENVIO_INDETERMINADO con motivo seguro, sin segundo POST, sin cierre paralelo; reconciliación posterior por consulta en la
--             misma cuenta. El CDC nunca es condición de ACK; un CDC con forma de credencial se omite (solo ese valor) sin invalidar la clasificación.
--   D4/D5 sin cambios (ventana de 2 minutos de NEX-062 y recuperación manual). D6: la igualdad del cuerpo con el snapshot la decide el banco. D7: sin hash del cuerpo bruto de respuesta ni HMAC.
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
   AND (origen <> 'HTTP' OR ((resultado = 'OK' AND http_status BETWEEN 200 AND 299) OR (resultado = 'ERROR_HTTP' AND http_status IS NOT NULL) OR (resultado IN ('TIMEOUT', 'RED') AND http_status IS NULL))))
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
  CONSTRAINT envio_cierres_r05_forma_chk CHECK ((resultado = 'OK') = (estado_local = 'ENVIADO') AND (estado_local = 'ERROR_ENVIO') = (error_tipo IS NOT NULL))
);
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
   AND ((tipo_salida = 'HTTP_RESPUESTA' AND http_status IS NOT NULL AND clase_error IS NULL)
     OR (tipo_salida = 'ERROR_TRANSMISION' AND http_status IS NULL AND clase_error IS NOT NULL AND respuesta_saneada IS NULL AND proyeccion IS NULL)))
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
-- Esquema P v1 (todas las claves obligatorias, ninguna adicional, <= 16384 bytes UTF-8):
--   {version:1, http:int, cuerpo:{json_valido:bool, raiz_objeto:bool, bytes:int>=0}, status:'AUSENTE'|'SUCCESS'|'ERROR'|'OTRO_TEXTO'|'OTRO_TIPO', token_invalido:bool, duplicado:bool,
--    contador_rechazados_positivo:bool, rechazados:{no_vacia:bool, propio:bool, n_entradas:0..32767}, aceptados:{n_entradas:0..32767, incluye_propio:bool, con_formato_fiscal:bool},
--    ecos:{dest|dpunexp|dnumdoc|dserienum|tipodoc: {n_variantes:0..32767, hay_coincide:bool, hay_contradice:bool, hay_no_interpretable:bool}},
--    lote:{clase:'AUSENTE'|'VALIDO'|'INVALIDO_LARGO'|'INVALIDO_FORMATO'|'INVALIDO_TIPO', clave:text<=40|null, texto:text<=60|null, n_ocurrencias:0..32767},
--    cdc:{presente:bool, valor:text<=256|null, motivo:'NO_TEXTO'|'EXCEDE_LIMITE'|'CARACTER_NUL'|'CREDENCIAL'|null},
--    identidad:{tipo, establecimiento, punto, numero, serie|null} (= fila del documento),
--    lectura:{texto_resultado:<=500|null, mensaje:<=300|null, errores_propios:[<=3 textos <=200], estado_gateway:<=120|null, request_id:<=80|null, campo_problema:<=40|null},
--    clasificacion_app:{regla, resultado, estado_local, error_tipo|null} (= clasificación SQL), confianza:{hechos_servidor:["http","identidad","clasificacion"]}}
CREATE OR REPLACE FUNCTION public.fe_e03_r05_validar_proyeccion(
  p jsonb, p_http integer, p_tipo text, p_establecimiento text, p_punto text, p_numero text, p_serie text)
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
  IF NOT public.fe_e03_r05_entero(p -> 'http', 100, 599) OR (p ->> 'http')::integer IS DISTINCT FROM p_http THEN
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
     OR NOT public.fe_e03_r05_texto(p #> '{lote,clave}', 40, true) OR NOT public.fe_e03_r05_texto(p #> '{lote,texto}', 60, true)
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
  -- Sin raíz objeto, nada de la raíz pudo leerse: todos los hechos de la raíz en su valor neutro.
  IF NOT v_raiz AND (p ->> 'status' <> 'AUSENTE' OR (p ->> 'duplicado')::boolean OR (p ->> 'contador_rechazados_positivo')::boolean
                     OR (p #>> '{rechazados,no_vacia}')::boolean OR (p #>> '{aceptados,n_entradas}')::integer > 0 OR v_lote_clase <> 'AUSENTE'
                     OR (v_cdc ->> 'presente')::boolean
                     OR EXISTS (SELECT 1 FROM jsonb_each(p -> 'ecos') x WHERE (x.value ->> 'n_variantes')::integer > 0)) THEN
    RAISE EXCEPTION 'proyección no válida: hechos de la raíz sin raíz objeto' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INVALIDA';
  END IF;
  IF NOT public.fe_e03_r05_claves_exactas(p -> 'identidad', ARRAY['tipo', 'establecimiento', 'punto', 'numero', 'serie'])
     OR (p #>> '{identidad,tipo}') IS DISTINCT FROM p_tipo OR (p #>> '{identidad,establecimiento}') IS DISTINCT FROM p_establecimiento
     OR (p #>> '{identidad,punto}') IS DISTINCT FROM p_punto OR (p #>> '{identidad,numero}') IS DISTINCT FROM p_numero
     OR (p #>> '{identidad,serie}') IS DISTINCT FROM p_serie
     OR jsonb_typeof(p #> '{identidad,tipo}') <> 'string' OR jsonb_typeof(p #> '{identidad,numero}') <> 'string' THEN
    RAISE EXCEPTION 'proyección no válida: identidad distinta de la del documento' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INVALIDA';
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
  IF NOT public.fe_e03_r05_claves_exactas(p -> 'confianza', ARRAY['hechos_servidor']) OR p #> '{confianza,hechos_servidor}' <> '["http", "identidad", "clasificacion"]'::jsonb THEN
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

-- Cotejo honesto de P con la respuesta saneada PERSISTIDA del mismo POST: solo los campos que sobreviven al saneado y se pueden recalcular igual que JavaScript (raíz objeto, status
-- textual, lote de la raíz con una sola ocurrencia y claves ASCII). Ecos, listas y CDC NO se cotejan aquí (dependen de normalizaciones de JavaScript): se declaran en campos_cotejados.
-- Respuesta ausente, truncada o redactada por el banco → no cotejable (se dice cuál). Una diferencia → NEX:PROYECCION_INCOHERENTE (la salida se registra sin P y el cierre queda indeterminado).
CREATE OR REPLACE FUNCTION public.fe_e03_r05_cotejar(p jsonb, p_respuesta jsonb, p_truncada boolean, p_redactada boolean)
RETURNS TABLE (o_cotejo text, o_campos text[])
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_campos text[] := ARRAY[]::text[];
  v_raiz boolean;
  v_status text;
  v_ascii boolean;
  v_n integer;
  v_valor jsonb;
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
  IF NOT v_raiz THEN
    RETURN QUERY SELECT 'COTEJADO_PARCIAL', v_campos; RETURN;
  END IF;

  IF p_respuesta ? 'status' AND jsonb_typeof(p_respuesta -> 'status') = 'string' THEN
    v_status := CASE p_respuesta ->> 'status' WHEN 'success' THEN 'SUCCESS' WHEN 'error' THEN 'ERROR' ELSE 'OTRO_TEXTO' END;
    IF v_status <> p ->> 'status' THEN
      RAISE EXCEPTION 'la proyección no coincide con la respuesta persistida (status)' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INCOHERENTE';
    END IF;
    v_campos := array_append(v_campos, 'status'::text);
  END IF;

  SELECT bool_and(k ~ '^[ -~]*$') INTO v_ascii FROM jsonb_object_keys(p_respuesta) AS t(k);
  IF coalesce(v_ascii, true) THEN
    SELECT count(*) INTO v_n FROM jsonb_each(p_respuesta) x
     WHERE regexp_replace(lower(x.key), '[^a-z0-9]', '', 'g') IN ('nrolote', 'lote', 'numerolote', 'nrodelote', 'numerodelote')
       AND jsonb_typeof(x.value) <> 'null' AND x.value <> '""'::jsonb;
    IF v_n <> (p #>> '{lote,n_ocurrencias}')::integer THEN
      RAISE EXCEPTION 'la proyección no coincide con la respuesta persistida (lote)' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INCOHERENTE';
    END IF;
    v_campos := array_append(v_campos, 'lote.n_ocurrencias'::text);
    IF v_n = 1 AND p #>> '{lote,clase}' = 'VALIDO' THEN
      SELECT x.value INTO v_valor FROM jsonb_each(p_respuesta) x
       WHERE regexp_replace(lower(x.key), '[^a-z0-9]', '', 'g') IN ('nrolote', 'lote', 'numerolote', 'nrodelote', 'numerodelote')
         AND jsonb_typeof(x.value) <> 'null' AND x.value <> '""'::jsonb;
      IF jsonb_typeof(v_valor) = 'string' THEN
        IF (v_valor #>> '{}') IS DISTINCT FROM (p #>> '{lote,texto}') THEN
          RAISE EXCEPTION 'la proyección no coincide con la respuesta persistida (texto del lote)' USING ERRCODE = 'P0001', DETAIL = 'NEX:PROYECCION_INCOHERENTE';
        END IF;
        v_campos := array_append(v_campos, 'lote.texto'::text);
      END IF;
    END IF;
  END IF;
  RETURN QUERY SELECT 'COTEJADO_PARCIAL', v_campos;
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

-- 6.2 Autenticación (sin mensajes ni secretos). INICIAL antes de cualquier POST; RENOVACION_TOKEN solo si el POST 1 recibió token inválido (según su P validada) y aún no hay POST 2.
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
       OR NOT EXISTS (SELECT 1 FROM public.documento_electronico_envio_proyecciones_r05 y
                       WHERE y.empresa_id = p_empresa AND y.documento_id = p_documento AND y.operacion_id = p_operacion AND y.nro_post = 1
                         AND y.proyeccion IS NOT NULL AND (y.proyeccion ->> 'token_invalido')::boolean) THEN
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
                         OR NOT EXISTS (SELECT 1 FROM public.documento_electronico_envio_proyecciones_r05 y
                                         WHERE y.empresa_id = p_empresa AND y.documento_id = p_documento AND y.operacion_id = p_operacion AND y.nro_post = 1
                                           AND y.proyeccion IS NOT NULL AND (y.proyeccion ->> 'token_invalido')::boolean)) THEN
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
  v_resp jsonb;
  v_resp_txt text;
  v_redactado boolean := false;
  v_bytes integer;
  v_sha text;
  v_mensaje text;
  v_p jsonb;
  c record;
  k record;
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

  -- Repetición de la misma salida: se devuelve la persistida; otra distinta se rechaza.
  SELECT * INTO v_ev FROM public.documento_electronico_envio_evidencias e
   WHERE e.empresa_id = p_empresa AND e.documento_id = p_documento AND e.operacion_id = p_operacion AND e.nro_post = p_nro_post AND e.tipo_evento IN ('HTTP_RESPUESTA', 'ERROR_TRANSMISION');
  IF FOUND THEN
    SELECT * INTO v_pr FROM public.documento_electronico_envio_proyecciones_r05 y WHERE y.empresa_id = p_empresa AND y.documento_id = p_documento AND y.evento_id = v_ev.id;
    IF v_ev.tipo_evento = p_tipo_salida AND v_ev.http_status IS NOT DISTINCT FROM p_http AND v_ev.respuesta_sha256 IS NOT DISTINCT FROM v_sha
       AND v_ev.respuesta_truncada = coalesce(p_respuesta_truncada, false)
       AND (p_tipo_salida = 'HTTP_RESPUESTA' OR v_ev.mensaje = p_clase_error)
       AND (p_tipo_salida = 'ERROR_TRANSMISION' OR v_pr.motivo_sin_proyeccion IS NOT DISTINCT FROM p_motivo_sin_proyeccion) THEN
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

  -- P: esquema cerrado → saneado → esquema otra vez → clasificación de la aplicación = clasificación SQL → cotejo con la respuesta persistida. Si algo falla, la transacción se revierte y
  -- la aplicación vuelve a registrar la MISMA salida sin P (motivo PROYECCION_RECHAZADA o CREDENCIALES_RESIDUALES): el cierre quedará indeterminado (D-C02-2-A).
  IF p_proyeccion IS NOT NULL THEN
    PERFORM public.fe_e03_r05_validar_proyeccion(p_proyeccion, p_http, d.tipo, d.establecimiento, d.punto_expedicion, d.numero, d.serie);
    v_p := public.fe_e03_r05_sanear_proyeccion(p_proyeccion);
    PERFORM public.fe_e03_r05_validar_proyeccion(v_p, p_http, d.tipo, d.establecimiento, d.punto_expedicion, d.numero, d.serie);
    SELECT * INTO c FROM public.fe_e03_clasificar_recepcion_r05(v_p, d.tipo);
    IF jsonb_build_object('regla', c.o_regla, 'resultado', c.o_resultado, 'estado_local', c.o_estado_local, 'error_tipo', c.o_error_tipo) <> v_p -> 'clasificacion_app' THEN
      RAISE EXCEPTION 'la clasificación de la aplicación no coincide con la clasificación del banco' USING ERRCODE = 'P0001', DETAIL = 'NEX:CLASIFICACION_NO_COINCIDE';
    END IF;
    SELECT * INTO k FROM public.fe_e03_r05_cotejar(v_p, v_resp, coalesce(p_respuesta_truncada, false), v_redactado);
  END IF;

  v_mensaje := CASE WHEN v_redactado THEN 'respuesta con credenciales redactadas' END;
  INSERT INTO public.documento_electronico_envio_evidencias (empresa_id, documento_id, version, operacion_id, tipo_evento, nro_post, http_status, respuesta_saneada, respuesta_truncada, respuesta_bytes, respuesta_sha256, mensaje, actor_id)
  VALUES (p_empresa, p_documento, o.version, p_operacion, 'HTTP_RESPUESTA', p_nro_post, p_http, v_resp, coalesce(p_respuesta_truncada, false), v_bytes, v_sha, v_mensaje, p_usuario)
  RETURNING id INTO v_id;

  IF v_p IS NOT NULL THEN
    INSERT INTO public.documento_electronico_envio_proyecciones_r05 (empresa_id, documento_id, version, operacion_id, evento_id, nro_post, proyeccion, regla, resultado, estado_local, error_tipo, cotejo, campos_cotejados, actor_id)
    VALUES (p_empresa, p_documento, o.version, p_operacion, v_id, p_nro_post, v_p, c.o_regla, c.o_resultado, c.o_estado_local, c.o_error_tipo, k.o_cotejo, k.o_campos, p_usuario);
    RETURN QUERY SELECT v_id, c.o_regla, k.o_cotejo, false; RETURN;
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

-- 6.6 Cierre derivado EXCLUSIVAMENTE de la evidencia persistida (sin respuesta, lote, CDC ni mensajes del llamador). El llamador declara la clasificación que espera; si no coincide con la
-- derivada → NEX:CIERRE_CONTRADICTORIO sin escribir nada. Repetición: misma clasificación → la persistida (o_reutilizado); otra → NEX:CIERRE_DISTINTO. Nunca escribe estado_sifen.
CREATE OR REPLACE FUNCTION public.fe_e03_cerrar_envio_r05(
  p_empresa uuid, p_usuario uuid, p_documento uuid, p_operacion uuid, p_testigo text, p_clasificacion_esperada jsonb)
RETURNS TABLE (o_estado_local text, o_intento_id uuid, o_regla text, o_reutilizado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d public.documentos_electronicos%ROWTYPE;
  o public.documento_electronico_envio_operaciones_r05%ROWTYPE;
  v_ci public.documento_electronico_envio_cierres_r05%ROWTYPE;
  v_ev public.documento_electronico_envio_evidencias%ROWTYPE;
  v_pr public.documento_electronico_envio_proyecciones_r05%ROWTYPE;
  a1 public.documento_electronico_envio_autenticaciones_r05%ROWTYPE;
  a2 public.documento_electronico_envio_autenticaciones_r05%ROWTYPE;
  v_motivo_nv text;
  v_no boolean;
  v_n_posts integer;
  v_ultimo smallint;
  v_tiene_salida boolean := false;
  v_tiene_pr boolean := false;
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
      RETURN QUERY SELECT v_ci.estado_local, v_ci.intento_id, v_ci.regla, true; RETURN;
    END IF;
    RAISE EXCEPTION 'la operación ya se cerró con otra clasificación' USING ERRCODE = 'P0001', DETAIL = 'NEX:CIERRE_DISTINTO';
  END IF;
  v_motivo_nv := public.fe_e03_r05_no_vigente(p_empresa, p_documento, p_operacion, d.estado_local);
  IF v_motivo_nv IS NOT NULL THEN
    RAISE EXCEPTION 'la operación de envío no admite el cierre (%)', v_motivo_nv USING ERRCODE = 'P0001', DETAIL = 'NEX:' || v_motivo_nv;
  END IF;

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
      RAISE EXCEPTION 'no hay evidencia para cerrar la operación (sin POST, sin autenticación fallida ni no transmisión)' USING ERRCODE = 'P0001', DETAIL = 'NEX:CIERRE_SIN_EVIDENCIA';
    END IF;
  ELSIF v_ultimo = 1 AND v_tiene_pr AND (v_pr.proyeccion ->> 'token_invalido')::boolean AND a2.id IS NOT NULL AND a2.resultado <> 'OK' THEN
    v_regla := 'AUT-2'; v_fase := 'AUTENTICACION'; v_resultado := a2.resultado; v_estado := 'ERROR_ENVIO'; v_error_tipo := 'AUTENTICACION'; v_http := a2.http_status;
  ELSIF v_ultimo = 1 AND v_tiene_pr AND (v_pr.proyeccion ->> 'token_invalido')::boolean THEN
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
  IF v_fase = 'AUTENTICACION' THEN
    v_mensaje := CASE v_resultado WHEN 'TIMEOUT' THEN 'Tiempo de espera agotado al autenticar con el gateway.'
                                  WHEN 'RED' THEN 'No fue posible comunicarse con el gateway.'
                                  ELSE 'El gateway rechazó la autenticación (credenciales de la empresa).' END;
  END IF;

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
                                                             http_status, motivo, clasificacion_sha256, lote_paridad, actor_id)
  VALUES (p_operacion, p_empresa, p_documento, o.version, v_evento, v_nuevos[1], v_regla, v_fase, v_resultado, v_estado, v_error_tipo, v_http, v_motivo, v_huella, v_paridad, p_usuario);

  RETURN QUERY SELECT v_estado_final, v_nuevos[1], v_regla, false;
END $$;

-- 6.7 Salida tardía: solo cuando la vía normal NO la admite (motivo con la precedencia de fe_e03_r05_no_vigente) y el POST no tiene salida normal. Append-only; no cambia estado ni cierre.
-- Una P inválida no impide conservar la salida: se guarda sin P. Repetición: misma huella → la persistida; otra → NEX:SALIDA_TARDIA_DISTINTA.
CREATE OR REPLACE FUNCTION public.fe_e03_registrar_salida_tardia_r05(
  p_empresa uuid, p_usuario uuid, p_documento uuid, p_operacion uuid, p_testigo text, p_nro_post smallint, p_tipo_salida text, p_http integer,
  p_respuesta jsonb, p_respuesta_truncada boolean, p_clase_error text, p_proyeccion jsonb)
RETURNS TABLE (o_salida_id uuid, o_motivo text, o_reutilizado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d public.documentos_electronicos%ROWTYPE;
  o public.documento_electronico_envio_operaciones_r05%ROWTYPE;
  v_t public.documento_electronico_envio_salidas_tardias_r05%ROWTYPE;
  v_post record;
  v_motivo text;
  v_resp jsonb;
  v_resp_txt text;
  v_bytes integer;
  v_sha text;
  v_p jsonb;
  v_huella text;
  v_id uuid;
BEGIN
  IF p_nro_post IS NULL OR p_nro_post NOT BETWEEN 1 AND 2 OR p_tipo_salida IS NULL
     OR NOT ((p_tipo_salida = 'HTTP_RESPUESTA' AND p_http BETWEEN 100 AND 599 AND p_clase_error IS NULL)
          OR (p_tipo_salida = 'ERROR_TRANSMISION' AND p_http IS NULL AND p_clase_error IN ('TIMEOUT', 'RED') AND p_respuesta IS NULL AND p_proyeccion IS NULL)) THEN
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

  IF p_respuesta IS NOT NULL THEN
    v_resp_txt := public.fe_e03_redactar_texto(p_respuesta::text);
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
  IF p_proyeccion IS NOT NULL THEN
    BEGIN
      PERFORM public.fe_e03_r05_validar_proyeccion(p_proyeccion, p_http, d.tipo, d.establecimiento, d.punto_expedicion, d.numero, d.serie);
      v_p := public.fe_e03_r05_sanear_proyeccion(p_proyeccion);
      PERFORM public.fe_e03_r05_validar_proyeccion(v_p, p_http, d.tipo, d.establecimiento, d.punto_expedicion, d.numero, d.serie);
    EXCEPTION WHEN raise_exception THEN
      v_p := NULL;
    END;
  END IF;
  v_huella := encode(sha256(convert_to(jsonb_build_object('tipo', p_tipo_salida, 'http', p_http, 'clase', p_clase_error, 'respuesta', v_sha,
                                                          'truncada', coalesce(p_respuesta_truncada, false), 'proyeccion', v_p)::text, 'UTF8')), 'hex');

  SELECT * INTO v_t FROM public.documento_electronico_envio_salidas_tardias_r05 t
   WHERE t.empresa_id = p_empresa AND t.documento_id = p_documento AND t.operacion_id = p_operacion AND t.nro_post = p_nro_post;
  IF FOUND THEN
    IF v_t.huella_sha256 = v_huella THEN
      RETURN QUERY SELECT v_t.id, v_t.motivo_tardia, true; RETURN;
    END IF;
    RAISE EXCEPTION 'el POST ya tiene otra salida tardía registrada' USING ERRCODE = 'P0001', DETAIL = 'NEX:SALIDA_TARDIA_DISTINTA';
  END IF;

  v_motivo := public.fe_e03_r05_no_vigente(p_empresa, p_documento, p_operacion, d.estado_local);
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'la vía normal todavía admite esta salida: regístrela con fe_e03_registrar_salida_r05' USING ERRCODE = 'P0001', DETAIL = 'NEX:SALIDA_ADMISIBLE';
  END IF;

  INSERT INTO public.documento_electronico_envio_salidas_tardias_r05 (empresa_id, documento_id, version, operacion_id, nro_post, post_evento_id, post_grande_id, tipo_salida, clase_error,
                                                                      http_status, respuesta_saneada, respuesta_truncada, respuesta_sha256, respuesta_bytes, proyeccion, motivo_tardia, huella_sha256, actor_id)
  VALUES (p_empresa, p_documento, o.version, p_operacion, p_nro_post, v_post.o_evento_id, v_post.o_grande_id, p_tipo_salida, p_clase_error,
          p_http, v_resp, coalesce(p_respuesta_truncada, false), v_sha, v_bytes, v_p, v_motivo, v_huella, p_usuario)
  RETURNING id INTO v_id;
  RETURN QUERY SELECT v_id, v_motivo, false;
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
COMMENT ON FUNCTION public.fe_e03_registrar_salida_r05(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, text, jsonb, text) IS 'NEX-084: salida de un POST con P validada (esquema cerrado, saneado, clasificación SQL = aplicación, cotejo) o con el motivo de su ausencia.';
COMMENT ON FUNCTION public.fe_e03_cerrar_envio_r05(uuid, uuid, uuid, uuid, text, jsonb) IS 'NEX-084: cierre derivado de la evidencia persistida; evidencia insuficiente → ENVIO_INDETERMINADO con motivo (D-C02-2-A); idempotente por operación.';
COMMENT ON FUNCTION public.fe_e03_registrar_salida_tardia_r05(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, text, jsonb) IS 'NEX-084: salida tardía append-only cuando la vía normal ya no la admite; no cambia estados.';

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

-- Ayudante R05 en dos estados: ACTIVO concede EXECUTE de escritura; REVERTIDO lo retira. Lecturas y SELECT en ambos. testigo_sha256 nunca se concede (privilegio por columnas).
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
  REVOKE ALL ON FUNCTION public.fe_e03_r05_validar_proyeccion(jsonb, integer, text, text, text, text, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_sanear_proyeccion(jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_clasificar_recepcion_r05(jsonb, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_cotejar(jsonb, jsonb, boolean, boolean) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_exigir_activo() FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_preparar(uuid, uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_hash_testigo(text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_operacion(uuid, uuid, uuid, uuid, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_no_vigente(uuid, uuid, uuid, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_r05_posts(uuid, uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_iniciar_envio_r05(uuid, uuid, uuid, boolean, uuid, text, jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_registrar_autenticacion_r05(uuid, uuid, uuid, uuid, text, text, text, text, integer) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_registrar_post_r05(uuid, uuid, uuid, uuid, text, smallint, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_registrar_salida_r05(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, text, jsonb, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_registrar_no_transmitido_r05(uuid, uuid, uuid, uuid, text, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_cerrar_envio_r05(uuid, uuid, uuid, uuid, text, jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_registrar_salida_tardia_r05(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, text, jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_e03_operacion_por_correlacion_r05(uuid, uuid, uuid, uuid) FROM PUBLIC;
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

  SELECT modo INTO v_modo FROM public.nex_e03_r05_estado WHERE id;
  IF v_modo = 'ACTIVO' THEN
    GRANT EXECUTE ON FUNCTION public.fe_e03_iniciar_envio_r05(uuid, uuid, uuid, boolean, uuid, text, jsonb) TO nexit_runtime;
    GRANT EXECUTE ON FUNCTION public.fe_e03_registrar_autenticacion_r05(uuid, uuid, uuid, uuid, text, text, text, text, integer) TO nexit_runtime;
    GRANT EXECUTE ON FUNCTION public.fe_e03_registrar_post_r05(uuid, uuid, uuid, uuid, text, smallint, text) TO nexit_runtime;
    GRANT EXECUTE ON FUNCTION public.fe_e03_registrar_salida_r05(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, text, jsonb, text) TO nexit_runtime;
    GRANT EXECUTE ON FUNCTION public.fe_e03_registrar_no_transmitido_r05(uuid, uuid, uuid, uuid, text, text) TO nexit_runtime;
    GRANT EXECUTE ON FUNCTION public.fe_e03_cerrar_envio_r05(uuid, uuid, uuid, uuid, text, jsonb) TO nexit_runtime;
    GRANT EXECUTE ON FUNCTION public.fe_e03_registrar_salida_tardia_r05(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, text, jsonb) TO nexit_runtime;
  ELSE
    REVOKE ALL ON FUNCTION public.fe_e03_iniciar_envio_r05(uuid, uuid, uuid, boolean, uuid, text, jsonb) FROM nexit_runtime;
    REVOKE ALL ON FUNCTION public.fe_e03_registrar_autenticacion_r05(uuid, uuid, uuid, uuid, text, text, text, text, integer) FROM nexit_runtime;
    REVOKE ALL ON FUNCTION public.fe_e03_registrar_post_r05(uuid, uuid, uuid, uuid, text, smallint, text) FROM nexit_runtime;
    REVOKE ALL ON FUNCTION public.fe_e03_registrar_salida_r05(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, text, jsonb, text) FROM nexit_runtime;
    REVOKE ALL ON FUNCTION public.fe_e03_registrar_no_transmitido_r05(uuid, uuid, uuid, uuid, text, text) FROM nexit_runtime;
    REVOKE ALL ON FUNCTION public.fe_e03_cerrar_envio_r05(uuid, uuid, uuid, uuid, text, jsonb) FROM nexit_runtime;
    REVOKE ALL ON FUNCTION public.fe_e03_registrar_salida_tardia_r05(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, text, jsonb) FROM nexit_runtime;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.nex_aplicar_grants_facturacion_e03_r05() FROM PUBLIC;

SELECT public.nex_aplicar_grants_facturacion_e03();
SELECT public.nex_aplicar_grants_facturacion_e03_r05();
