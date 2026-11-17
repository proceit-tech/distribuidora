-- =====================================================================
-- NEX-080 — Facturación PRO-342-R05: el CDC es un DATO OPACO informado por la API del proveedor. NEXIT no lo valida, no lo genera, no lo reconstruye ni lo completa: lo recibe, lo guarda
-- LITERALMENTE como fue informado y lo presenta. El estado fiscal informado por la API para el documento (identificado por la cuenta autenticada y tipoDoc/dEst/dPunExp/dNumDoc/dSerieNum)
-- se registra sin condicionarlo a una validación propia del CDC.
-- Orden: documentacao/ordens/ORD-CLAUDE-NEXIT-PRO-342-R05-CDC-DATO-API-2026-11-17.md · Rectificación: documentacao/definicoes/PRO-342-RECTIFICACION-CDC-DATO-API-2026-11-17.md
-- Requiere NEX-047, NEX-050, NEX-054, NEX-062, NEX-070, NEX-077 y NEX-079. Incremental: NO edita ninguna migración anterior (NEX-047…079 quedan intactas en el repositorio).
-- ESTADO: versionada y NO aplicada. NO ejecutar sin autorización expresa del responsable (backup previo, scripts/preflight-NEX-080.sql). Verificación: scripts/verificar-NEX-080.sql.
-- Reversión protegida: scripts/reversion-NEX-080.sql (aborta si ya hay datos que las reglas anteriores no admiten o evidencia R05 registrada).
--
-- Qué cambia:
--   1) Restricciones de formato del CDC (44 dígitos y coherencia con tipo/establecimiento/punto/número) en documentos_electronicos.cdc, documento_electronico_intentos.cdc_informado y
--      nce_origen.fe_cdc → reemplazadas por límites de TRANSPORTE (texto de 1..256 caracteres; PostgreSQL no admite NUL). Se respaldan sus definiciones para la reversión.
--      El índice único (empresa_id, cdc) NO se modifica (decisión no deducible de la orden: se conserva y una colisión NO bloquea el estado, ver 4).
--   2) Evidencia de la proyección del CDC en cada intento (solo altas): cdc_anterior y cdc_proyeccion.
--   3) fe_documentos_inmutable (trigger de NEX-047): el CDC del documento ya no es «una sola vez»: lo cambia ÚNICAMENTE la proyección R05 de una respuesta ACEPTADA de la API del mismo documento
--      (variable de transacción nex.r05_proyeccion_cdc = id del documento, que solo fija fe_cdc_proyectar_r05). Nunca pasa a NULL. nexit_runtime no tiene UPDATE sobre la tabla (NEX-047).
--   4) Funciones NUEVAS de registro (nombres *_r05; las de NEX-050/054/062/077/079 quedan intactas para compatibilidad de despliegue y NO las usa la aplicación R05):
--        · fe_documento_registrar_consulta_r05 (manual), _flujo_nce_r05 (flujo NCE), _auto_r05 (automática con token de NEX-077) y fe_documento_registrar_envio_r05.
--      Reglas: permisos, alcance de sucursal, documento de la empresa, lease/fencing, estados pendientes, guarda de estado final (no retrocede; solo APROBADO → CANCELADO) y lote solo con ACK
--      ENVIADO: IGUALES a NEX-079. ELIMINADO: CDC_DIVERGENTE, exigencia de CDC para un final o para «XML firmado», fe_cdc_coherente y el filtro de 44 dígitos de cdc_informado.
--      Proyección: el documento muestra el ÚLTIMO CDC informado por una respuesta ACEPTADA del mismo documento; ausente/vacío no borra el anterior; un cambio queda trazado
--      (cdc_anterior + cdc_proyeccion = CAMBIO) y la evidencia anterior no se toca. Si el CDC informado ya figura en OTRO documento de la empresa, el estado igual se registra pero el CDC no se
--      proyecta (NO_PROYECTADO_OTRO_DOCUMENTO). Una respuesta no aceptada (error, contradicción de estado) queda como evidencia y no proyecta nada (NO_PROYECTADO).
--   5) fe_documento_crear_nce (misma firma; reemplaza la de NEX-070 con UN solo cambio): la FE asociada debe estar APROBADA y TENER CDC (presencia); no se valida su composición.
-- =====================================================================
DO $$
DECLARE
  n_doc integer;
  n_int integer;
  n_nce integer;
BEGIN
  IF to_regprocedure('public.fe_documento_registrar_consulta_nucleo(text,uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,text,jsonb,uuid,jsonb)') IS NULL
     OR to_regprocedure('public.fe_documento_registrar_envio(uuid,uuid,uuid,text,text,text,text,integer,text,text,text,text,text,text,jsonb,jsonb)') IS NULL
     OR to_regprocedure('public.fe_intento_conexion_segura(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'NEX-080 requiere NEX-079 (núcleo de consulta, registro de envío con conexión).';
  END IF;
  IF to_regprocedure('public.fe_documento_crear_nce(uuid,uuid,uuid,uuid,text,uuid,integer,jsonb,text,numeric,jsonb)') IS NULL
     OR to_regclass('public.nce_descuentos') IS NULL OR to_regclass('public.nce_origen') IS NULL THEN
    RAISE EXCEPTION 'NEX-080 requiere NEX-062 y NEX-070 (fe_documento_crear_nce, nce_origen, nce_descuentos).';
  END IF;
  IF to_regprocedure('public.fe_documentos_inmutable()') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documentos_electronicos' AND column_name = 'consulta_lease_token')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documento_electronico_intentos' AND column_name = 'conexion') THEN
    RAISE EXCEPTION 'NEX-080 requiere NEX-047 (trigger de inmutabilidad), NEX-077 (consulta_lease_token) y NEX-079 (conexion).';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documento_electronico_intentos' AND column_name = 'cdc_proyeccion')
     OR to_regclass('public.nex080_respaldo') IS NOT NULL THEN
    RAISE EXCEPTION 'NEX-080 parece aplicada; no se reaplica por suposición.';
  END IF;

  -- Las restricciones a reemplazar deben ser EXACTAMENTE las conocidas (si el esquema real difiere, no se aplica por suposición).
  SELECT count(*) INTO n_doc FROM pg_constraint WHERE conrelid = 'public.documentos_electronicos'::regclass AND contype = 'c'
     AND (pg_get_constraintdef(oid) LIKE '%fe_cdc_coherente(%' OR pg_get_constraintdef(oid) LIKE '%(cdc ~ %');
  SELECT count(*) INTO n_int FROM pg_constraint WHERE conrelid = 'public.documento_electronico_intentos'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%(cdc_informado ~ %';
  SELECT count(*) INTO n_nce FROM pg_constraint WHERE conrelid = 'public.nce_origen'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%(fe_cdc ~ %';
  IF n_doc <> 2 OR n_int <> 1 OR n_nce <> 1 THEN
    RAISE EXCEPTION 'NEX-080: restricciones de CDC inesperadas (documentos=%, intentos=%, nce_origen=%; se esperaban 2, 1 y 1). Revisar el esquema real antes de aplicar.', n_doc, n_int, n_nce;
  END IF;
  -- El índice único se conserva TAL CUAL (no se presupone otro).
  IF to_regclass('public.documentos_electronicos_cdc_key') IS NULL THEN
    RAISE EXCEPTION 'NEX-080: falta el índice documentos_electronicos_cdc_key (NEX-047); revisar el esquema real.';
  END IF;
END $$;

-- ── 0) Respaldo para la reversión protegida (definiciones exactas vigentes en ESTA base, no supuestas) ───────────────────────────
CREATE TABLE public.nex080_respaldo (
  clase      text        NOT NULL CHECK (clase IN ('FUNCION', 'RESTRICCION')),
  tabla      text,
  nombre     text        NOT NULL,
  definicion text        NOT NULL,
  creado_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clase, nombre)
);
COMMENT ON TABLE public.nex080_respaldo IS 'NEX-080 (PRO-342-R05): definiciones previas de funciones y restricciones reemplazadas, para scripts/reversion-NEX-080.sql. Sin datos de negocio.';
REVOKE ALL ON public.nex080_respaldo FROM PUBLIC;

INSERT INTO public.nex080_respaldo (clase, tabla, nombre, definicion)
SELECT 'FUNCION', NULL, 'public.fe_documentos_inmutable()', pg_get_functiondef('public.fe_documentos_inmutable()'::regprocedure)
UNION ALL
SELECT 'FUNCION', NULL, 'public.fe_documento_crear_nce(uuid,uuid,uuid,uuid,text,uuid,integer,jsonb,text,numeric,jsonb)',
       pg_get_functiondef('public.fe_documento_crear_nce(uuid,uuid,uuid,uuid,text,uuid,integer,jsonb,text,numeric,jsonb)'::regprocedure)
UNION ALL
SELECT 'RESTRICCION', c.conrelid::regclass::text, c.conname, pg_get_constraintdef(c.oid)
  FROM pg_constraint c
 WHERE c.contype = 'c'
   AND ((c.conrelid = 'public.documentos_electronicos'::regclass AND (pg_get_constraintdef(c.oid) LIKE '%fe_cdc_coherente(%' OR pg_get_constraintdef(c.oid) LIKE '%(cdc ~ %'))
     OR (c.conrelid = 'public.documento_electronico_intentos'::regclass AND pg_get_constraintdef(c.oid) LIKE '%(cdc_informado ~ %')
     OR (c.conrelid = 'public.nce_origen'::regclass AND pg_get_constraintdef(c.oid) LIKE '%(fe_cdc ~ %'));

-- ── 1) Restricciones: CDC = texto opaco con límite de transporte (sin formato, sin coherencia, sin truncar) ───────────────────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT tabla, nombre FROM public.nex080_respaldo WHERE clase = 'RESTRICCION' LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tabla, r.nombre);
  END LOOP;
END $$;

ALTER TABLE public.documentos_electronicos
  ADD CONSTRAINT documentos_electronicos_cdc_texto_chk CHECK (cdc IS NULL OR char_length(cdc) BETWEEN 1 AND 256);
ALTER TABLE public.documento_electronico_intentos
  ADD CONSTRAINT documento_electronico_intentos_cdc_informado_texto_chk CHECK (cdc_informado IS NULL OR char_length(cdc_informado) BETWEEN 1 AND 256);
ALTER TABLE public.nce_origen
  ADD CONSTRAINT nce_origen_fe_cdc_texto_chk CHECK (char_length(fe_cdc) BETWEEN 1 AND 256);

COMMENT ON COLUMN public.documentos_electronicos.cdc IS
  'NEX-080 (PRO-342-R05): último CDC informado por una respuesta ACEPTADA de la API para este documento, guardado literalmente (dato opaco: NEXIT no lo valida ni lo genera). La evidencia de cada respuesta está en documento_electronico_intentos.';
COMMENT ON COLUMN public.documento_electronico_intentos.cdc_informado IS
  'NEX-080 (PRO-342-R05): CDC tal como lo informó la API en ESTE intento (literal, sin recortar ni validar); NULL si no lo informó o no era texto contractual.';

-- ── 2) Evidencia de la proyección del CDC (solo altas: el trigger de NEX-047 sigue impidiendo UPDATE/DELETE de intentos) ──────────
ALTER TABLE public.documento_electronico_intentos
  ADD COLUMN cdc_anterior text CONSTRAINT documento_electronico_intentos_cdc_anterior_chk CHECK (cdc_anterior IS NULL OR char_length(cdc_anterior) BETWEEN 1 AND 256),
  ADD COLUMN cdc_proyeccion text CONSTRAINT documento_electronico_intentos_cdc_proyeccion_chk
    CHECK (cdc_proyeccion IS NULL OR cdc_proyeccion IN ('INICIAL', 'SIN_CAMBIO', 'CAMBIO', 'AUSENTE', 'NO_PROYECTADO_OTRO_DOCUMENTO', 'NO_PROYECTADO')),
  ADD CONSTRAINT documento_electronico_intentos_cdc_cambio_chk CHECK ((cdc_proyeccion = 'CAMBIO') = (cdc_anterior IS NOT NULL));
COMMENT ON COLUMN public.documento_electronico_intentos.cdc_proyeccion IS
  'NEX-080 (PRO-342-R05): efecto del CDC de este intento sobre el CDC del documento: INICIAL (primero), SIN_CAMBIO, CAMBIO (ver cdc_anterior), AUSENTE (respuesta aceptada sin CDC: se conserva el anterior), NO_PROYECTADO_OTRO_DOCUMENTO (ya figura en otro documento de la empresa: estado registrado, CDC no proyectado), NO_PROYECTADO (respuesta no aceptada). NULL: intento anterior a NEX-080 o sin CDC ni respuesta aceptada.';
COMMENT ON COLUMN public.documento_electronico_intentos.cdc_anterior IS
  'NEX-080 (PRO-342-R05): CDC que tenía el documento antes de este intento, SOLO cuando cdc_proyeccion = CAMBIO (trazabilidad anterior → nuevo).';

-- ── 3) Inmutabilidad: el CDC solo cambia por la proyección R05 (misma función de NEX-047; único cambio: el bloque del CDC) ───────────
CREATE OR REPLACE FUNCTION public.fe_documentos_inmutable() RETURNS trigger
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
  -- UPDATE: la evidencia de intentos nunca cambia; en documentos solo cambian estados, datos de respuesta y el CDC (NEX-080: solo por la proyección R05, nunca a NULL).
  IF TG_TABLE_NAME = 'documento_electronico_intentos' THEN
    RAISE EXCEPTION 'documento_electronico_intentos es de solo altas: no se modifica.' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id OR NEW.sucursal_id IS DISTINCT FROM OLD.sucursal_id OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.establecimiento IS DISTINCT FROM OLD.establecimiento OR NEW.punto_expedicion IS DISTINCT FROM OLD.punto_expedicion
     OR NEW.numero IS DISTINCT FROM OLD.numero OR NEW.serie IS DISTINCT FROM OLD.serie OR NEW.fecha_emision IS DISTINCT FROM OLD.fecha_emision
     OR NEW.receptor_nombre IS DISTINCT FROM OLD.receptor_nombre OR NEW.receptor_documento IS DISTINCT FROM OLD.receptor_documento
     OR NEW.moneda IS DISTINCT FROM OLD.moneda OR NEW.total IS DISTINCT FROM OLD.total OR NEW.clave_idempotencia IS DISTINCT FROM OLD.clave_idempotencia
     OR NEW.creado_por IS DISTINCT FROM OLD.creado_por OR NEW.creado_at IS DISTINCT FROM OLD.creado_at THEN
    RAISE EXCEPTION 'la identidad y los importes de un documento electrónico son inmutables' USING ERRCODE = 'P0001', DETAIL = 'NEX:DOCUMENTO_INMUTABLE';
  END IF;
  -- El cliente no se reasigna. La única transición admitida es valor → NULL mientras se depura una empresa DEMO (FK ON DELETE SET NULL).
  IF NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
     AND NOT (OLD.cliente_id IS NOT NULL AND NEW.cliente_id IS NULL AND public.nex_reinicio_demo_activo(OLD.empresa_id)) THEN
    RAISE EXCEPTION 'el cliente de un documento electrónico es inmutable' USING ERRCODE = 'P0001', DETAIL = 'NEX:DOCUMENTO_INMUTABLE';
  END IF;
  -- NEX-080 (PRO-342-R05): un CDC registrado solo cambia a OTRO valor informado por la API en una respuesta aceptada del MISMO documento (fe_cdc_proyectar_r05 fija la variable de
  -- transacción con el id de ESTE documento). Nunca se borra (no pasa a NULL) ni cambia por cualquier otra vía.
  IF OLD.cdc IS NOT NULL AND NEW.cdc IS DISTINCT FROM OLD.cdc
     AND (NEW.cdc IS NULL OR coalesce(current_setting('nex.r05_proyeccion_cdc', true), '') <> OLD.id::text) THEN
    RAISE EXCEPTION 'el CDC de un documento electrónico solo cambia por un CDC informado por la API en una respuesta aceptada del mismo documento' USING ERRCODE = 'P0001', DETAIL = 'NEX:CDC_INMUTABLE';
  END IF;
  RETURN NEW;
END $$;

-- ── 4a) Proyección del CDC informado (privada: no se concede a nexit_runtime; la usan solo las funciones *_r05) ────────────────────
-- p_cdc_informado ya llega literal o NULL (ausente / vacío / no contractual). Nunca calcula, completa ni compara posiciones: solo igualdad literal.
CREATE OR REPLACE FUNCTION public.fe_cdc_proyectar_r05(p_empresa uuid, p_documento uuid, p_cdc_actual text, p_cdc_informado text) RETURNS text
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF p_cdc_informado IS NULL THEN
    RETURN 'AUSENTE';
  END IF;
  IF p_cdc_actual IS NOT DISTINCT FROM p_cdc_informado THEN
    RETURN 'SIN_CAMBIO';
  END IF;
  -- El índice único (empresa_id, cdc) se conserva: si el CDC ya figura en OTRO documento de la MISMA empresa no se proyecta (el estado de la respuesta igual se registra).
  IF EXISTS (SELECT 1 FROM public.documentos_electronicos WHERE empresa_id = p_empresa AND cdc = p_cdc_informado AND id <> p_documento) THEN
    RETURN 'NO_PROYECTADO_OTRO_DOCUMENTO';
  END IF;
  BEGIN
    PERFORM set_config('nex.r05_proyeccion_cdc', p_documento::text, true);
    UPDATE public.documentos_electronicos SET cdc = p_cdc_informado, actualizado_at = now() WHERE empresa_id = p_empresa AND id = p_documento;
    PERFORM set_config('nex.r05_proyeccion_cdc', '', true);
  EXCEPTION WHEN unique_violation THEN
    -- Carrera con otro documento que recibió el mismo CDC: no se proyecta; nada más se deshace (subtransacción).
    PERFORM set_config('nex.r05_proyeccion_cdc', '', true);
    RETURN 'NO_PROYECTADO_OTRO_DOCUMENTO';
  END;

  RETURN CASE WHEN p_cdc_actual IS NULL THEN 'INICIAL' ELSE 'CAMBIO' END;
END $$;

-- Límite de transporte del CDC operacional (sin recortar: lo que excede no se guarda como CDC, queda solo en la evidencia JSON).
CREATE OR REPLACE FUNCTION public.fe_cdc_texto_r05(p_cdc text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN p_cdc IS NOT NULL AND p_cdc <> '' AND char_length(p_cdc) <= 256 THEN p_cdc END
$$;

-- ── 4b) Núcleo de registro de consulta R05 (privado). Mismas reglas de NEX-079 SIN ninguna regla propia sobre el CDC ──────────────
-- p_modo: MANUAL (EDITAR; cualquier estado, con guarda de estado final), FLUJO (CREAR o EDITAR, solo FE/NCE pendientes), AUTO (FLUJO + token vigente de NEX-077).
CREATE OR REPLACE FUNCTION public.fe_documento_registrar_consulta_nucleo_r05(
  p_modo text, p_empresa uuid, p_usuario uuid, p_documento uuid, p_resultado text, p_http integer, p_request_id text, p_estado_gateway text, p_estado_sifen text,
  p_cdc text, p_cod_respuesta text, p_mensaje text, p_fecha_firma text, p_fecha_envio text, p_respuesta jsonb, p_token uuid, p_conexion jsonb)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d public.documentos_electronicos%ROWTYPE;
  v_resultado text := p_resultado;
  v_mensaje text := left(nullif(btrim(coalesce(p_mensaje, '')), ''), 500);
  -- CDC literal tal como lo informó la API (sin trim, sin formato); NULL si ausente, vacío o fuera del límite de transporte.
  v_cdc text := public.fe_cdc_texto_r05(p_cdc);
  v_proyeccion text;
  v_anterior text;
BEGIN
  IF p_modo IS NULL OR p_modo NOT IN ('MANUAL', 'FLUJO', 'AUTO') THEN
    RAISE EXCEPTION 'modo de registro de consulta no válido' USING ERRCODE = 'P0001';
  END IF;
  IF p_modo = 'MANUAL' AND NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'EDITAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.EDITAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_modo <> 'MANUAL' AND NOT (public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CREAR') OR public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'EDITAR')) THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  -- R05: CDC_DIVERGENTE ya no es un resultado que se registre (queda solo como valor histórico admitido por las restricciones de NEX-047).
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
  IF p_modo = 'AUTO' AND (p_token IS NULL OR d.consulta_lease_token IS DISTINCT FROM p_token) THEN
    RAISE EXCEPTION 'la reserva de la consulta automática ya no pertenece a este proceso' USING ERRCODE = 'P0001', DETAIL = 'NEX:LEASE_OBSOLETO';
  END IF;
  IF p_modo <> 'MANUAL'
     AND (d.tipo NOT IN ('FE', 'NCE') OR d.estado_local NOT IN ('ENVIADO', 'ENVIO_INDETERMINADO') OR d.estado_sifen NOT IN ('SIN_CONSULTA', 'PENDIENTE', 'NO_RECONOCIDO')) THEN
    RAISE EXCEPTION 'el documento no está pendiente de resultado fiscal' USING ERRCODE = 'P0001', DETAIL = 'NEX:DOCUMENTO_NO_PENDIENTE';
  END IF;

  -- Guarda INDEPENDIENTE del CDC (NEX-054): un estado final ya registrado no retrocede ni cambia (solo APROBADO → CANCELADO). La respuesta contradictoria queda como evidencia.
  IF v_resultado = 'OK' AND d.estado_sifen IN ('APROBADO','RECHAZADO','CANCELADO','INUTILIZADO')
     AND NOT (p_estado_sifen = d.estado_sifen OR (d.estado_sifen = 'APROBADO' AND p_estado_sifen = 'CANCELADO')) THEN
    v_resultado := 'RESPUESTA_INVALIDA';
    v_mensaje := left('La consulta informa «' || p_estado_sifen || '» pero el documento ya figura como «' || d.estado_sifen || '»: no se modifica el estado fiscal.', 500);
  END IF;

  IF v_resultado = 'OK' THEN
    -- El estado informado por la API se registra tal cual, con o sin CDC, cualquiera sea su forma.
    UPDATE public.documentos_electronicos SET
      estado_sifen = p_estado_sifen,
      estado_gateway_texto = left(p_estado_gateway, 120),
      cod_respuesta = p_cod_respuesta,
      mensaje_respuesta = v_mensaje,
      fecha_firma_gateway = coalesce(left(p_fecha_firma, 60), d.fecha_firma_gateway),
      fecha_envio_gateway = coalesce(left(p_fecha_envio, 60), d.fecha_envio_gateway),
      estado_local = 'ENVIADO',
      ultima_consulta_at = now(), ultima_consulta_resultado = 'OK', actualizado_at = now()
     WHERE empresa_id = p_empresa AND id = p_documento;
    v_proyeccion := public.fe_cdc_proyectar_r05(p_empresa, p_documento, d.cdc, v_cdc);
    v_anterior := CASE WHEN v_proyeccion = 'CAMBIO' THEN d.cdc END;
  ELSE
    -- Errores, tiempos de espera, respuestas inválidas o contradictorias: solo se anota la consulta; estado fiscal, CDC y última respuesta fiscal válida NO cambian.
    UPDATE public.documentos_electronicos SET ultima_consulta_at = now(), ultima_consulta_resultado = v_resultado, actualizado_at = now()
     WHERE empresa_id = p_empresa AND id = p_documento;
    v_proyeccion := CASE WHEN v_cdc IS NOT NULL THEN 'NO_PROYECTADO' END;
  END IF;

  INSERT INTO public.documento_electronico_intentos (empresa_id, documento_id, tipo, resultado, http_status, request_id, estado_gateway, estado_sifen, cdc_informado, cdc_anterior, cdc_proyeccion,
                                                     cod_respuesta, mensaje, respuesta, actor_id, conexion)
  VALUES (p_empresa, p_documento, 'CONSULTA', v_resultado, p_http, left(p_request_id, 80), p_estado_gateway,
          CASE WHEN v_resultado = 'OK' THEN p_estado_sifen END, v_cdc, v_anterior, v_proyeccion, p_cod_respuesta, v_mensaje, p_respuesta, p_usuario, public.fe_intento_conexion_segura(p_conexion));

  RETURN v_resultado;
END $$;

-- ── 4c) Funciones públicas de consulta R05 (nombres nuevos: la aplicación R05 NO usa las firmas anteriores) ───────────────────────
CREATE OR REPLACE FUNCTION public.fe_documento_registrar_consulta_r05(
  p_empresa uuid, p_usuario uuid, p_documento uuid, p_resultado text, p_http integer, p_request_id text, p_estado_gateway text, p_estado_sifen text,
  p_cdc text, p_cod_respuesta text, p_mensaje text, p_fecha_firma text, p_fecha_envio text, p_respuesta jsonb, p_conexion jsonb)
RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.fe_documento_registrar_consulta_nucleo_r05('MANUAL', p_empresa, p_usuario, p_documento, p_resultado, p_http, p_request_id, p_estado_gateway, p_estado_sifen,
                                                          p_cdc, p_cod_respuesta, p_mensaje, p_fecha_firma, p_fecha_envio, p_respuesta, NULL, p_conexion)
$$;

CREATE OR REPLACE FUNCTION public.fe_documento_registrar_consulta_flujo_nce_r05(
  p_empresa uuid, p_usuario uuid, p_documento uuid, p_resultado text, p_http integer, p_request_id text, p_estado_gateway text, p_estado_sifen text,
  p_cdc text, p_cod_respuesta text, p_mensaje text, p_fecha_firma text, p_fecha_envio text, p_respuesta jsonb, p_conexion jsonb)
RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.fe_documento_registrar_consulta_nucleo_r05('FLUJO', p_empresa, p_usuario, p_documento, p_resultado, p_http, p_request_id, p_estado_gateway, p_estado_sifen,
                                                          p_cdc, p_cod_respuesta, p_mensaje, p_fecha_firma, p_fecha_envio, p_respuesta, NULL, p_conexion)
$$;

CREATE OR REPLACE FUNCTION public.fe_documento_registrar_consulta_auto_r05(
  p_empresa uuid, p_usuario uuid, p_documento uuid, p_resultado text, p_http integer, p_request_id text, p_estado_gateway text, p_estado_sifen text,
  p_cdc text, p_cod_respuesta text, p_mensaje text, p_fecha_firma text, p_fecha_envio text, p_respuesta jsonb, p_token uuid, p_conexion jsonb)
RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.fe_documento_registrar_consulta_nucleo_r05('AUTO', p_empresa, p_usuario, p_documento, p_resultado, p_http, p_request_id, p_estado_gateway, p_estado_sifen,
                                                          p_cdc, p_cod_respuesta, p_mensaje, p_fecha_firma, p_fecha_envio, p_respuesta, p_token, p_conexion)
$$;

-- ── 4d) Registro del envío R05: reglas de NEX-079 (permiso, documento en ENVIANDO, lote literal SOLO con ACK ENVIADO y sin sobrescribir) sin regla propia del CDC ──
-- Un único parámetro de CDC (p_cdc_informado): el informado por la API en el ACK. Se proyecta SOLO con ENVIADO (ACK correlacionado por lote o eco de número, nunca por el CDC).
CREATE OR REPLACE FUNCTION public.fe_documento_registrar_envio_r05(
  p_empresa uuid, p_usuario uuid, p_documento uuid, p_fase text, p_resultado text, p_estado_local text, p_error_tipo text, p_http integer, p_request_id text,
  p_estado_gateway text, p_mensaje text, p_lote text, p_cdc_informado text, p_respuesta jsonb, p_conexion jsonb)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d public.documentos_electronicos%ROWTYPE;
  v_mensaje text := left(nullif(btrim(coalesce(p_mensaje, '')), ''), 500);
  v_lote text := CASE WHEN p_lote IS NOT NULL AND char_length(p_lote) BETWEEN 1 AND 60 AND p_lote !~ '[[:cntrl:]]' AND p_lote !~ '^[[:space:]]|[[:space:]]$' THEN p_lote END;
  v_cdc text := public.fe_cdc_texto_r05(p_cdc_informado);
  v_proyeccion text;
  v_anterior text;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_fase NOT IN ('AUTENTICACION','TRANSMISION') OR p_resultado NOT IN ('OK','ERROR_HTTP','TIMEOUT','RED','RESPUESTA_INVALIDA')
     OR p_estado_local NOT IN ('ENVIADO','ERROR_ENVIO','ENVIO_INDETERMINADO') OR (p_resultado = 'OK') <> (p_estado_local = 'ENVIADO')
     OR (p_estado_local = 'ERROR_ENVIO') <> (p_error_tipo IS NOT NULL) OR (p_error_tipo IS NOT NULL AND p_error_tipo NOT IN ('AUTENTICACION','RECHAZO','TRANSITORIO')) THEN
    RAISE EXCEPTION 'resultado de envío no válido' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO d FROM public.documentos_electronicos WHERE empresa_id = p_empresa AND id = p_documento FOR UPDATE;
  IF NOT FOUND OR NOT public.sucursal_en_alcance(p_empresa, p_usuario, d.sucursal_id) THEN
    RAISE EXCEPTION 'documento no encontrado' USING ERRCODE = 'P0001', DETAIL = 'NEX:DOCUMENTO_NO_ENCONTRADO';
  END IF;
  IF d.estado_local <> 'ENVIANDO' THEN
    RAISE EXCEPTION 'el documento no está en envío' USING ERRCODE = 'P0001', DETAIL = 'NEX:ENVIO_NO_INICIADO';
  END IF;

  UPDATE public.documentos_electronicos SET
    estado_local = p_estado_local,
    envio_error_tipo = CASE WHEN p_estado_local = 'ERROR_ENVIO' THEN p_error_tipo END,
    -- PRO-342-R01/R03 (sin cambios): el lote se fija una sola vez y SOLO con ACK ENVIADO de ESTE documento.
    lote = CASE WHEN p_estado_local = 'ENVIADO' THEN coalesce(lote, v_lote) ELSE lote END,
    mensaje_respuesta = coalesce(v_mensaje, mensaje_respuesta),
    actualizado_at = now()
   WHERE empresa_id = p_empresa AND id = p_documento;

  IF p_estado_local = 'ENVIADO' THEN
    v_proyeccion := public.fe_cdc_proyectar_r05(p_empresa, p_documento, d.cdc, v_cdc);
    v_anterior := CASE WHEN v_proyeccion = 'CAMBIO' THEN d.cdc END;
  ELSE
    -- Respuesta indeterminada, de error o de otro documento: el CDC (si vino) queda solo como evidencia del intento.
    v_proyeccion := CASE WHEN v_cdc IS NOT NULL THEN 'NO_PROYECTADO' END;
  END IF;

  INSERT INTO public.documento_electronico_intentos (empresa_id, documento_id, tipo, fase, resultado, http_status, request_id, estado_gateway, lote, cdc_informado, cdc_anterior, cdc_proyeccion,
                                                     mensaje, respuesta, actor_id, conexion)
  VALUES (p_empresa, p_documento, 'ENVIO', p_fase, p_resultado, p_http, left(p_request_id, 80), left(p_estado_gateway, 120), CASE WHEN p_estado_local = 'ENVIADO' THEN v_lote END,
          v_cdc, v_anterior, v_proyeccion, v_mensaje, p_respuesta, p_usuario, public.fe_intento_conexion_segura(p_conexion));

  RETURN p_estado_local;
END $$;

-- ── 5) fe_documento_crear_nce: definición de NEX-070 con UN único cambio (presencia del CDC de la FE en lugar de fe_cdc_coherente) ──
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
  v_fe_total numeric;
  v_usado_glob numeric;
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
  -- NEX-080 (PRO-342-R05): ÚNICO cambio respecto de NEX-070. El proveedor exige el CDC de la FE asociada (dCdCDERef): se conserva la exigencia de PRESENCIA del dato tal como lo informó la API,
  -- sin validar longitud, composición ni posiciones (antes fe_cdc_coherente). La comparación literal de dCdCDERef con v_fe.cdc (abajo) y el resto de la función no cambian.
  IF v_fe.estado_sifen <> 'APROBADO' OR v_fe.cdc IS NULL OR v_fe.cdc = '' THEN
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
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_lineas) x WHERE coalesce((x->>'servicio')::boolean, false))
     AND (p_motivo NOT IN (3, 4) OR jsonb_array_length(p_lineas) <> 1) THEN
    RAISE EXCEPTION 'el servicio DESCUENTO solo se admite en los motivos Descuento y Bonificación y como único ítem de la nota' USING ERRCODE = 'P0001', DETAIL = 'NEX:LINEA_INVALIDA';
  END IF;
  SELECT count(DISTINCT (x->>'linea')::int) INTO v_distintas FROM jsonb_array_elements(p_lineas) x WHERE NOT coalesce((x->>'servicio')::boolean, false);
  IF v_distintas <> (SELECT count(*) FROM jsonb_array_elements(p_lineas) x WHERE NOT coalesce((x->>'servicio')::boolean, false)) THEN
    RAISE EXCEPTION 'una línea de la factura original no puede repetirse en la nota de crédito' USING ERRCODE = 'P0001', DETAIL = 'NEX:LINEA_INVALIDA';
  END IF;
  FOR l IN SELECT (x->>'linea')::int AS linea, coalesce((x->>'cantidad')::numeric, 0) AS cantidad, (x->>'monto')::numeric AS monto, coalesce((x->>'servicio')::boolean, false) AS serv, t.ord AS ord FROM jsonb_array_elements(p_lineas) WITH ORDINALITY t(x, ord) LOOP
    IF (NOT l.serv AND (l.linea IS NULL OR l.linea < 1 OR l.linea > v_n_det)) OR (l.serv AND l.linea IS NOT NULL) OR l.monto IS NULL OR l.monto <= 0 OR (p_motivo = 2 AND l.cantidad <= 0) OR (p_motivo <> 2 AND l.cantidad <> 0) THEN
      RAISE EXCEPTION 'línea % de la nota de crédito no válida', l.linea USING ERRCODE = 'P0001', DETAIL = 'NEX:LINEA_INVALIDA';
    END IF;
    IF NOT l.serv THEN
      v_orig_cant := (v_sol->'Detalles'->(l.linea - 1)->>'dCantProSer')::numeric;
      v_orig_total := (v_sol->'Detalles'->(l.linea - 1)->>'dTotOpeItem')::numeric;
    END IF;
    -- GAP-04: el ítem del payload (misma posición que la línea acreditada) conserva los datos fiscales de la línea original y su importe es exactamente el crédito.
    v_det := p_payload->'Detalles'->(l.ord - 1)::int;
    -- G01/E07: el servicio DESCUENTO es un ítem FIJO del sistema (no una línea de la FE): código y descripción DESCUENTO, sin GTIN, unidad 77, cantidad 1, precio = monto, IVA 10% gravado (decisión del
    -- responsable, sin prorrateo) y sin stock. Se valida con el mismo rigor que una línea original.
    v_orig := CASE WHEN l.serv THEN jsonb_build_object('dCodInt', 'DESCUENTO', 'dGtin', NULL, 'dDesProSer', 'DESCUENTO', 'cUniMed', 77, 'iAfecIVA', 1, 'dTasaIVA', 10, 'dPropIVA', 100, 'dPUniProSer', l.monto)
                   ELSE v_sol->'Detalles'->(l.linea - 1) END;
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
    IF NOT l.serv THEN
      SELECT coalesce(sum(nl.cantidad), 0), coalesce(sum(nl.monto), 0) INTO v_usado_cant, v_usado_monto
        FROM public.nce_lineas nl JOIN public.documentos_electronicos n ON n.empresa_id = nl.empresa_id AND n.id = nl.nce_id
       WHERE nl.empresa_id = p_empresa AND nl.fe_id = p_fe AND nl.linea = l.linea AND n.estado_sifen = 'APROBADO';
      IF v_usado_monto + l.monto > v_orig_total THEN
        RAISE EXCEPTION 'el crédito de la línea % supera el saldo disponible de la factura original', l.linea USING ERRCODE = 'P0001', DETAIL = 'NEX:SALDO_MONTO';
      END IF;
      IF p_motivo = 2 AND v_usado_cant + l.cantidad > v_orig_cant THEN
        RAISE EXCEPTION 'la cantidad devuelta de la línea % supera la cantidad disponible', l.linea USING ERRCODE = 'P0001', DETAIL = 'NEX:SALDO_CANTIDAD';
      END IF;
    END IF;
    v_suma := v_suma + l.monto;
  END LOOP;
  -- G01/E07: saldo GLOBAL de crédito de la FE = Σ dTotOpeItem originales − (NCE APROBADAS: líneas acreditadas + servicios DESCUENTO). El DESCUENTO no se atribuye a una línea, así que este es su tope
  -- (y también limita a las notas por línea que vengan después de un descuento). Bajo el bloqueo de la FE original (FOR UPDATE) no hay carreras.
  SELECT coalesce(sum((d->>'dTotOpeItem')::numeric), 0) INTO v_fe_total FROM jsonb_array_elements(v_sol->'Detalles') d;
  SELECT coalesce((SELECT sum(nl.monto) FROM public.nce_lineas nl JOIN public.documentos_electronicos n ON n.empresa_id = nl.empresa_id AND n.id = nl.nce_id
                    WHERE nl.empresa_id = p_empresa AND nl.fe_id = p_fe AND n.estado_sifen = 'APROBADO'), 0)
       + coalesce((SELECT sum(nd.monto) FROM public.nce_descuentos nd JOIN public.documentos_electronicos n ON n.empresa_id = nd.empresa_id AND n.id = nd.nce_id
                    WHERE nd.empresa_id = p_empresa AND nd.fe_id = p_fe AND n.estado_sifen = 'APROBADO'), 0) INTO v_usado_glob;
  IF v_usado_glob + v_suma > v_fe_total THEN
    RAISE EXCEPTION 'el crédito de la nota supera el saldo disponible de la factura original' USING ERRCODE = 'P0001', DETAIL = 'NEX:SALDO_MONTO';
  END IF;
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

  -- NEX-065: la compuerta de emisión es SOLO el estado del TIPO (fe_punto_secuencias.activo); el estado físico del punto ya no interviene. NEX-063: reserva (serie, número) de la secuencia NCE con paso atómico a la serie siguiente. Reserva del número NCE: FOR SHARE del punto (impide activarlo/desactivarlo en medio) y FOR UPDATE de la secuencia NCE (serializa las NCE del punto; no interfiere con FE).
  SELECT * INTO v_punto FROM public.fe_puntos_expedicion WHERE empresa_id = p_empresa AND id = p_punto AND sucursal_id = p_sucursal FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'el punto de expedición no existe para la sucursal' USING ERRCODE = 'P0001', DETAIL = 'NEX:PUNTO_INVALIDO';
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
  SELECT p_empresa, v_id, p_fe, (x->>'linea')::int, coalesce((x->>'cantidad')::numeric, 0), (x->>'monto')::numeric FROM jsonb_array_elements(p_lineas) x WHERE NOT coalesce((x->>'servicio')::boolean, false);
  INSERT INTO public.nce_descuentos (empresa_id, nce_id, fe_id, monto)
  SELECT p_empresa, v_id, p_fe, (x->>'monto')::numeric FROM jsonb_array_elements(p_lineas) x WHERE coalesce((x->>'servicio')::boolean, false);

  RETURN QUERY SELECT v_id, v_numero, false;
END $$;

COMMENT ON FUNCTION public.fe_documento_crear_nce(uuid, uuid, uuid, uuid, text, uuid, integer, jsonb, text, numeric, jsonb) IS
  'NEX-080 (PRO-342-R05): NEX-070 sin validación propia del CDC de la FE original: exige que esté APROBADA y que la API haya informado su CDC (presencia); el CDC se asocia literal (dCdCDERef).';

-- ── 6) Privilegios ───────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_facturacion_cdc_dato_api() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;
  -- Privadas (solo dentro de las funciones SECURITY DEFINER): proyección, límite de texto, núcleo y respaldo.
  REVOKE ALL ON public.nex080_respaldo FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_cdc_proyectar_r05(uuid, uuid, text, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_cdc_texto_r05(text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_documento_registrar_consulta_nucleo_r05(text, uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb, uuid, jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_documento_registrar_consulta_r05(uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb, jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_documento_registrar_consulta_flujo_nce_r05(uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb, jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_documento_registrar_consulta_auto_r05(uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb, uuid, jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_documento_registrar_envio_r05(uuid, uuid, uuid, text, text, text, text, integer, text, text, text, text, text, jsonb, jsonb) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.fe_documento_registrar_consulta_r05(uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb, jsonb) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_documento_registrar_consulta_flujo_nce_r05(uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb, jsonb) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_documento_registrar_consulta_auto_r05(uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb, uuid, jsonb) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_documento_registrar_envio_r05(uuid, uuid, uuid, text, text, text, text, integer, text, text, text, text, text, jsonb, jsonb) TO nexit_runtime;
  -- fe_documento_crear_nce conserva sus privilegios (CREATE OR REPLACE no los cambia); se reafirman como en NEX-070.
  REVOKE ALL ON FUNCTION public.fe_documento_crear_nce(uuid, uuid, uuid, uuid, text, uuid, integer, jsonb, text, numeric, jsonb) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.fe_documento_crear_nce(uuid, uuid, uuid, uuid, text, uuid, integer, jsonb, text, numeric, jsonb) TO nexit_runtime;
  -- La aplicación sigue LEYENDO documentos e intentos (SELECT de NEX-047, que abarca las columnas nuevas) y no tiene UPDATE/INSERT directos.
END $$;
REVOKE ALL ON FUNCTION public.nex_aplicar_grants_facturacion_cdc_dato_api() FROM PUBLIC;
SELECT public.nex_aplicar_grants_facturacion_cdc_dato_api();
