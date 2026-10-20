-- =====================================================================
-- NEX-066 — Movimientos: recuperación DURABLE de la intención de registro (REQ-MOV-O07 / PRO-188 / MOV-O07).
-- Problema: la clave de idempotencia K1 y el snapshot del movimiento vivían solo en la memoria de la pantalla; tras un COMMIT con respuesta perdida, un refresh / cierre / logout destruía K1 y
-- una nueva visita creaba K2, permitiendo repetir físicamente la misma entrada o salida.
-- Solución (PostgreSQL = fuente de verdad):
--  · movimientos_intenciones: una fila por intención (empresa + usuario + K1 + snapshot canónico + huella). Estados DURABLES: RESERVADA (pudo o no ejecutarse), CONFIRMADA (con el movimiento original) y
--    RECHAZADA_DEFINITIVA (el servidor ejecutó, revirtió y comprobó que NO existe movimiento). La «indeterminación» y el «requiere revisión» (7 días) son DERIVADAS de RESERVADA: nunca se expira ni se libera sola.
--  · AUD-R08 / MOV-R08-01: una CONFIRMADA cuyo resultado el operador aún no recibió (respuesta HTTP perdida tras el COMMIT) NO libera una clave nueva. `reconocida_at` marca el RECONOCIMIENTO (ACK) explícito y
--    autenticado del operador; mientras sea NULL la intención sigue siendo PENDIENTE (se recupera con K1 y el número original). El ACK no toca stock ni movimientos.
--  · Índice único parcial (empresa, usuario) WHERE reconocida_at IS NULL AND estado IN (RESERVADA, CONFIRMADA): la base impide una segunda intención sin resolver/reconocer del mismo operador (dos pestañas, dos
--    sesiones, llamadas simultáneas).
--  · Funciones SECURITY DEFINER (el rol de la aplicación NO accede a la tabla): reservar (COMMIT independiente ANTES de tocar stock), pendiente/consultar (solo lectura), tomar (bloquea la fila: serializa
--    las ejecuciones de la misma K1), confirmar (en la MISMA transacción que inventario_registrar_movimiento), reconocer (ACK idempotente, serializado con reservar) y rechazar (solo si no existe movimiento con esa clave).
--  · Titularidad: toda lectura/mutación exige empresa + usuario de la SESIÓN; K1 no es una credencial. Permiso MOVIMIENTOS.CREAR verificado en cada función.
-- NO modifica NEX-014 ni el motor inventario_registrar_movimiento. Incremental. Requiere NEX-014 (movimientos operativos), NEX-052 (envoltorio de grants nex_aplicar_grants_*).
-- ESTADO: versionada y NO aplicada. Ningún agente de IA la aplica: la ejecuta SOLO el responsable en la VM con backup previo (docs/PROCEDIMIENTO-NEX-066.md): preflight (scripts/preflight-NEX-066.sql),
-- aplicación por el runner, verificación (scripts/verificar-NEX-066.sql) y reversión segura (scripts/reversion-NEX-066.sql). Orden: primero esta migración y después el código de la aplicación.
-- =====================================================================
DO $$
BEGIN
  IF to_regprocedure('public.inventario_registrar_movimiento(uuid,uuid,text,text,date,uuid,uuid,jsonb,text,uuid,text,text,text)') IS NULL
     OR to_regprocedure('public.usuario_tiene_permiso(uuid,uuid,text,text)') IS NULL
     OR to_regclass('public.movimientos_inventario') IS NULL THEN
    RAISE EXCEPTION 'NEX-066 requiere los movimientos operativos (NEX-014).';
  END IF;
  IF to_regprocedure('public.nex_aplicar_grants_runtime_base()') IS NULL THEN
    RAISE EXCEPTION 'NEX-066 requiere la separación de grants (NEX-037/NEX-052).';
  END IF;
  IF to_regclass('public.movimientos_intenciones') IS NOT NULL THEN
    RAISE EXCEPTION 'movimientos_intenciones ya existe: NEX-066 parece aplicada; no se reaplica por suposición.';
  END IF;
END $$;

CREATE TABLE public.movimientos_intenciones (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        uuid        NOT NULL REFERENCES public.empresas (id),
  usuario_id        uuid        NOT NULL,
  clave             text        NOT NULL,
  snapshot          jsonb       NOT NULL,
  huella            text        NOT NULL,
  estado            text        NOT NULL DEFAULT 'RESERVADA',
  movimiento_id     uuid,
  numero_movimiento text,
  detalle_rechazo   text,
  creado_at         timestamptz NOT NULL DEFAULT now(),
  actualizado_at    timestamptz NOT NULL DEFAULT now(),
  resuelta_at       timestamptz,
  reconocida_at     timestamptz,
  CONSTRAINT movimientos_intenciones_usuario_fk FOREIGN KEY (empresa_id, usuario_id) REFERENCES public.usuarios (empresa_id, id),
  CONSTRAINT movimientos_intenciones_clave_uk   UNIQUE (empresa_id, clave),
  CONSTRAINT movimientos_intenciones_clave_chk  CHECK (length(btrim(clave)) BETWEEN 8 AND 120),
  CONSTRAINT movimientos_intenciones_snapshot_chk CHECK (jsonb_typeof(snapshot) = 'object' AND pg_column_size(snapshot) <= 8192),
  CONSTRAINT movimientos_intenciones_estado_chk CHECK (estado IN ('RESERVADA', 'CONFIRMADA', 'RECHAZADA_DEFINITIVA')),
  CONSTRAINT movimientos_intenciones_resultado_chk CHECK ((estado = 'CONFIRMADA') = (movimiento_id IS NOT NULL AND numero_movimiento IS NOT NULL)),
  CONSTRAINT movimientos_intenciones_resuelta_chk CHECK ((estado = 'RESERVADA') = (resuelta_at IS NULL)),
  CONSTRAINT movimientos_intenciones_reconocida_chk CHECK (reconocida_at IS NULL OR estado = 'CONFIRMADA')
);
COMMENT ON TABLE public.movimientos_intenciones IS 'NEX-066: intención de registro de un movimiento (K1 + snapshot) por empresa y usuario. Sin acceso directo para la aplicación; solo funciones SECURITY DEFINER.';

-- Una sola intención SIN RESOLVER O SIN RECONOCER (RESERVADA, o CONFIRMADA aún no reconocida) por empresa + usuario: garantía de la base (RN-03), no de la interfaz.
CREATE UNIQUE INDEX movimientos_intenciones_pendiente_uk ON public.movimientos_intenciones (empresa_id, usuario_id) WHERE reconocida_at IS NULL AND estado IN ('RESERVADA', 'CONFIRMADA');

REVOKE ALL ON public.movimientos_intenciones FROM PUBLIC;

-- 1) Reservar (se hace COMMIT ANTES de cualquier operación que pueda alterar stock). Idempotente para la misma K1 del mismo usuario y la misma solicitud.
CREATE OR REPLACE FUNCTION public.movimiento_intencion_reservar(p_empresa uuid, p_usuario uuid, p_clave text, p_snapshot jsonb)
RETURNS TABLE (o_clave text, o_estado text, o_snapshot jsonb, o_creado_at timestamptz, o_nueva boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_prev   public.movimientos_intenciones%ROWTYPE;
  v_huella text;
BEGIN
  IF p_empresa IS NULL OR p_usuario IS NULL THEN
    RAISE EXCEPTION 'empresa y usuario son obligatorios' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'MOVIMIENTOS', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso MOVIMIENTOS.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_clave IS NULL OR length(btrim(p_clave)) NOT BETWEEN 8 AND 120 THEN
    RAISE EXCEPTION 'la clave del registro no es válida' USING ERRCODE = 'P0001';
  END IF;
  IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot) <> 'object' OR pg_column_size(p_snapshot) > 8192 THEN
    RAISE EXCEPTION 'los datos del registro no son válidos' USING ERRCODE = 'P0001';
  END IF;

  -- Serializa a las pestañas / sesiones / llamadas simultáneas del mismo operador.
  PERFORM pg_advisory_xact_lock(hashtextextended('movimientos.int:' || p_empresa::text || ':' || p_usuario::text, 0));
  v_huella := md5(p_snapshot::text);

  SELECT * INTO v_prev FROM public.movimientos_intenciones WHERE empresa_id = p_empresa AND clave = p_clave;
  IF FOUND THEN
    -- Respuesta neutra: no se revela si la clave pertenece a otro usuario.
    IF v_prev.usuario_id <> p_usuario OR v_prev.huella <> v_huella THEN
      RAISE EXCEPTION 'la clave del registro no está disponible' USING ERRCODE = 'P0001', DETAIL = 'NEX:INTENCION_CONFLICTO';
    END IF;
    RETURN QUERY SELECT v_prev.clave, v_prev.estado, v_prev.snapshot, v_prev.creado_at, false;
    RETURN;
  END IF;

  -- Pendiente = RESERVADA o CONFIRMADA todavía no reconocida por el operador (MOV-R08-01).
  IF EXISTS (SELECT 1 FROM public.movimientos_intenciones WHERE empresa_id = p_empresa AND usuario_id = p_usuario AND reconocida_at IS NULL AND estado IN ('RESERVADA', 'CONFIRMADA')) THEN
    RAISE EXCEPTION 'hay un registro anterior sin resolver' USING ERRCODE = 'P0001', DETAIL = 'NEX:INTENCION_PENDIENTE';
  END IF;

  RETURN QUERY
    INSERT INTO public.movimientos_intenciones (empresa_id, usuario_id, clave, snapshot, huella)
    VALUES (p_empresa, p_usuario, p_clave, p_snapshot, v_huella)
    RETURNING movimientos_intenciones.clave, movimientos_intenciones.estado, movimientos_intenciones.snapshot, movimientos_intenciones.creado_at, true;
END $$;

-- 2) Consultar la intención pendiente del operador (SOLO LECTURA): RESERVADA, o CONFIRMADA aún no reconocida (con el número original). Incluye la evidencia del movimiento si existe y la marca de revisión (> 7 días, solo RESERVADA) sin liberar nada.
CREATE OR REPLACE FUNCTION public.movimiento_intencion_pendiente(p_empresa uuid, p_usuario uuid)
RETURNS TABLE (o_clave text, o_estado text, o_snapshot jsonb, o_creado_at timestamptz, o_requiere_revision boolean, o_evidencia_numero text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'MOVIMIENTOS', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso MOVIMIENTOS.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT i.clave, i.estado, i.snapshot, i.creado_at, (i.estado = 'RESERVADA' AND i.creado_at < now() - interval '7 days'),
           CASE WHEN i.estado = 'CONFIRMADA' THEN i.numero_movimiento ELSE
             (SELECT m.numero_movimiento FROM public.movimientos_inventario m
               WHERE m.empresa_id = i.empresa_id AND m.clave_idempotencia = i.clave AND m.creado_por = i.usuario_id LIMIT 1) END
      FROM public.movimientos_intenciones i
     WHERE i.empresa_id = p_empresa AND i.usuario_id = p_usuario AND i.reconocida_at IS NULL AND i.estado IN ('RESERVADA', 'CONFIRMADA');
END $$;

-- 3) Tomar la intención para ejecutarla: bloquea la fila (serializa dos ejecuciones simultáneas de la misma K1). Solo el titular de la empresa.
CREATE OR REPLACE FUNCTION public.movimiento_intencion_tomar(p_empresa uuid, p_usuario uuid, p_clave text)
RETURNS TABLE (o_estado text, o_snapshot jsonb, o_numero text, o_movimiento_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v public.movimientos_intenciones%ROWTYPE;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'MOVIMIENTOS', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso MOVIMIENTOS.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v FROM public.movimientos_intenciones WHERE empresa_id = p_empresa AND usuario_id = p_usuario AND clave = p_clave FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'registro no encontrado' USING ERRCODE = 'P0002';
  END IF;
  RETURN QUERY SELECT v.estado, v.snapshot, v.numero_movimiento, v.movimiento_id;
END $$;

-- 4) Confirmar: en la MISMA transacción que inventario_registrar_movimiento. Exige la evidencia del movimiento con esa clave y autoría.
CREATE OR REPLACE FUNCTION public.movimiento_intencion_confirmar(p_empresa uuid, p_usuario uuid, p_clave text, p_movimiento uuid, p_numero text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.movimientos_inventario m WHERE m.empresa_id = p_empresa AND m.id = p_movimiento AND m.numero_movimiento = p_numero
                    AND m.clave_idempotencia = p_clave AND m.creado_por = p_usuario) THEN
    RAISE EXCEPTION 'no existe el movimiento original de esta intención' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.movimientos_intenciones
     SET estado = 'CONFIRMADA', movimiento_id = p_movimiento, numero_movimiento = p_numero, resuelta_at = now(), actualizado_at = now()
   WHERE empresa_id = p_empresa AND usuario_id = p_usuario AND clave = p_clave AND estado = 'RESERVADA';
  IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM public.movimientos_intenciones WHERE empresa_id = p_empresa AND usuario_id = p_usuario AND clave = p_clave AND estado = 'CONFIRMADA' AND movimiento_id = p_movimiento) THEN
    RAISE EXCEPTION 'la intención no está pendiente' USING ERRCODE = 'P0001';
  END IF;
END $$;

-- 4b) Reconocer (ACK) el resultado de una intención CONFIRMADA: autenticado (empresa+usuario de la sesión), idempotente (repetirlo devuelve lo mismo), serializado con reservar mediante el MISMO bloqueo
--     por empresa+usuario (nada puede reservar la siguiente mientras se reconoce la anterior), y NUNCA toca stock ni movimientos. Solo después del ACK queda libre una intención nueva.
CREATE OR REPLACE FUNCTION public.movimiento_intencion_reconocer(p_empresa uuid, p_usuario uuid, p_clave text)
RETURNS TABLE (o_estado text, o_numero text, o_reconocida_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v public.movimientos_intenciones%ROWTYPE;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'MOVIMIENTOS', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso MOVIMIENTOS.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('movimientos.int:' || p_empresa::text || ':' || p_usuario::text, 0));
  SELECT * INTO v FROM public.movimientos_intenciones WHERE empresa_id = p_empresa AND usuario_id = p_usuario AND clave = p_clave FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'registro no encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF v.estado <> 'CONFIRMADA' THEN
    RAISE EXCEPTION 'solo se reconoce un registro confirmado' USING ERRCODE = 'P0001', DETAIL = 'NEX:INTENCION_NO_CONFIRMADA';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.movimientos_inventario m WHERE m.empresa_id = p_empresa AND m.id = v.movimiento_id AND m.numero_movimiento = v.numero_movimiento
                    AND m.clave_idempotencia = p_clave AND m.creado_por = p_usuario) THEN
    RAISE EXCEPTION 'no existe el movimiento original de esta intención' USING ERRCODE = 'P0001';
  END IF;
  IF v.reconocida_at IS NULL THEN
    UPDATE public.movimientos_intenciones SET reconocida_at = now(), actualizado_at = now() WHERE id = v.id RETURNING reconocida_at INTO v.reconocida_at;
  END IF;
  RETURN QUERY SELECT v.estado, v.numero_movimiento, v.reconocida_at;
END $$;

-- 5) Rechazo definitivo: SOLO si el servidor ejecutó, revirtió y NO existe ningún movimiento con esa clave. Nunca por el paso del tiempo.
CREATE OR REPLACE FUNCTION public.movimiento_intencion_rechazar(p_empresa uuid, p_usuario uuid, p_clave text, p_detalle text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v public.movimientos_intenciones%ROWTYPE;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'MOVIMIENTOS', 'CREAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso MOVIMIENTOS.CREAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v FROM public.movimientos_intenciones WHERE empresa_id = p_empresa AND usuario_id = p_usuario AND clave = p_clave FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'registro no encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF v.estado <> 'RESERVADA' THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.movimientos_inventario m WHERE m.empresa_id = p_empresa AND m.clave_idempotencia = p_clave) THEN
    RAISE EXCEPTION 'existe un movimiento con esa clave: la intención no puede rechazarse' USING ERRCODE = 'P0001', DETAIL = 'NEX:INTENCION_NO_RECHAZABLE';
  END IF;
  UPDATE public.movimientos_intenciones
     SET estado = 'RECHAZADA_DEFINITIVA', detalle_rechazo = left(coalesce(p_detalle, ''), 300), resuelta_at = now(), actualizado_at = now()
   WHERE id = v.id;
END $$;

-- 6) Grants: la aplicación solo EJECUTA las cinco funciones; la tabla no es accesible. Ayudante descubierto por el envoltorio global nex_aplicar_grants_runtime().
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_movimientos_intenciones() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;
  REVOKE ALL ON public.movimientos_intenciones FROM PUBLIC;
  REVOKE ALL ON public.movimientos_intenciones FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.movimiento_intencion_reservar(uuid, uuid, text, jsonb) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.movimiento_intencion_pendiente(uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.movimiento_intencion_tomar(uuid, uuid, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.movimiento_intencion_confirmar(uuid, uuid, text, uuid, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.movimiento_intencion_rechazar(uuid, uuid, text, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.movimiento_intencion_reconocer(uuid, uuid, text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.movimiento_intencion_reservar(uuid, uuid, text, jsonb) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.movimiento_intencion_pendiente(uuid, uuid) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.movimiento_intencion_tomar(uuid, uuid, text) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.movimiento_intencion_confirmar(uuid, uuid, text, uuid, text) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.movimiento_intencion_rechazar(uuid, uuid, text, text) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.movimiento_intencion_reconocer(uuid, uuid, text) TO nexit_runtime;
END $$;

REVOKE ALL ON FUNCTION public.movimiento_intencion_reservar(uuid, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.movimiento_intencion_pendiente(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.movimiento_intencion_tomar(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.movimiento_intencion_confirmar(uuid, uuid, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.movimiento_intencion_rechazar(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.movimiento_intencion_reconocer(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nex_aplicar_grants_movimientos_intenciones() FROM PUBLIC;

SELECT public.nex_aplicar_grants_movimientos_intenciones();
