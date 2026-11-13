-- =====================================================================
-- NEX-057 — Facturación (PRO-129, Etapa A): gestión administrativa de los PUNTOS DE EXPEDICIÓN (permiso FACTURACION_ELECTRONICA.PUNTOS, funciones SECURITY DEFINER y bitácora inmutable).
-- Requiere NEX-048 (fe_puntos_expedicion, fe_documento_crear_fe) y NEX-052 (envoltorio de grants que descubre los ayudantes nex_aplicar_grants_*). Incremental: NO edita NEX-001…056.
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo). Reversión: scripts/reversion-NEX-057.sql. ESTADO: versionada y NO aplicada.
--
-- Qué hace:
--  · Permiso FACTURACION_ELECTRONICA.PUNTOS («administrador fiscal»): se registra SIN asignarlo a ningún perfil (el administrador de la empresa lo tiene por definición; el resto, por
--    decisión expresa del responsable).
--  · fe_punto_crear(): da de alta un punto (código de 3 dígitos 001–999, nombre) en una sucursal del alcance del usuario con establecimiento SIFEN, **INACTIVO**, con el ÚLTIMO NÚMERO REALMENTE
--    EMITIDO informado explícitamente (sin valor por defecto; 0 = nunca se emitió con ese establecimiento y punto, incluso en otros sistemas) y una confirmación expresa. Nunca se crea un punto
--    automáticamente ni con secuencia cero por omisión.
--  · fe_punto_activar(): exige volver a CONFIRMAR el último número emitido (igual al guardado, o MAYOR si entretanto se emitió fuera de Nexit; jamás menor) y recién entonces activa el punto.
--    Solo un punto activo puede numerar (fe_documento_crear_fe). Un número menor que el ya emitido por Nexit para ese establecimiento y punto se rechaza.
--  · fe_punto_desactivar(): desactiva (no elimina; la identidad y la numeración monotónica se conservan).
--  · fe_puntos_expedicion_log: bitácora inmutable (solo altas) de cada alta/activación/desactivación con valor anterior, nuevo y usuario.
--  · IDENTIDAD FISCAL ÚNICA (AUD-PRO129-R01-01): NEX-002 no impide que dos sucursales de la misma empresa compartan el establecimiento SIFEN, y cada punto lleva su PROPIA secuencia: dos puntos con
--    el mismo (empresa, establecimiento, código) colisionarían en la numeración. Se protege la identidad fiscal (empresa + establecimiento + código), no solo la sucursal: (a) fe_punto_crear rechaza
--    el alta si CUALQUIER otro punto (activo o no) de otra sucursal tiene esa identidad; (b) fe_punto_activar rechaza la activación si otro punto ACTIVO de otra sucursal la tiene; (c) un trigger
--    BEFORE INSERT/UPDATE OF activo, sucursal_id impide que DOS puntos activos compartan la identidad aunque se escriban por otra vía (carga manual); (d) un advisory lock transaccional por
--    identidad serializa altas/activaciones concurrentes. El trigger NO se dispara cuando fe_documento_crear_fe actualiza ultimo_numero (no toca activo ni sucursal_id): la emisión no cambia.
--    NO se impone una restricción global sobre sucursales.establecimiento_sifen (decisión funcional no autorizada), no se tocan documentos, contadores ni NEX-048.
--    LIMITACIÓN: cambiar después sucursales.establecimiento_sifen de una sucursal con puntos no se vigila aquí (fuera del alcance de la gestión de puntos).
--  La emisión (fe_documento_crear_fe) sigue siendo la ÚNICA autoridad que incrementa ultimo_numero; el trigger de NEX-048 sigue impidiendo cambiar la identidad, retroceder o eliminar.
--  El rol nexit_runtime solo ejecuta estas funciones: NO lee la bitácora (AUD-PRO129-R01-02: la tabla no tiene RLS por empresa y ninguna API actual la consume; si se necesita verla, se
--  añadirá una función de consulta filtrada por empresa) y no escribe la tabla de puntos directamente.
-- Qué NO hace: no inserta puntos, no toca el timbrado (lo gestiona el gateway) ni credenciales, no edita ultimo_numero hacia abajo.
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.fe_puntos_expedicion') IS NULL OR to_regprocedure('public.fe_documento_crear_fe(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'NEX-057 requiere NEX-048 (fe_puntos_expedicion y fe_documento_crear_fe).';
  END IF;
  IF to_regprocedure('public.nex_reinicio_demo_activo(uuid)') IS NULL OR to_regprocedure('public.sucursal_en_alcance(uuid,uuid,uuid)') IS NULL
     OR position('nex\_aplicar\_grants\_%' IN pg_get_functiondef('public.nex_aplicar_grants_runtime()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'NEX-057 requiere NEX-046 (sucursal_en_alcance), NEX-012 (nex_reinicio_demo_activo) y NEX-052 (envoltorio de grants que reaplica todos los ayudantes).';
  END IF;
  IF EXISTS (SELECT 1 FROM public.permisos WHERE codigo = 'FACTURACION_ELECTRONICA.PUNTOS') OR to_regclass('public.fe_puntos_expedicion_log') IS NOT NULL THEN
    RAISE EXCEPTION 'NEX-057 parece aplicada (el permiso o la bitácora ya existen); no se reaplica por suposición.';
  END IF;
END $$;

INSERT INTO public.permisos (codigo, recurso, accion, modulo, nivel_alcance, clase)
VALUES ('FACTURACION_ELECTRONICA.PUNTOS', 'FACTURACION_ELECTRONICA', 'PUNTOS', 'facturacion', 'SUCURSAL', 'ADMINISTRATIVA');

CREATE TABLE public.fe_puntos_expedicion_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid        NOT NULL REFERENCES public.empresas (id),
  punto_id    uuid        NOT NULL,
  usuario_id  uuid        NOT NULL,
  accion      text        NOT NULL CHECK (accion IN ('CREAR', 'ACTIVAR', 'DESACTIVAR')),
  anterior    jsonb,
  nuevo       jsonb       NOT NULL,
  creado_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fe_puntos_expedicion_log_punto_fk   FOREIGN KEY (empresa_id, punto_id)   REFERENCES public.fe_puntos_expedicion (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT fe_puntos_expedicion_log_usuario_fk FOREIGN KEY (empresa_id, usuario_id) REFERENCES public.usuarios (empresa_id, id) ON DELETE CASCADE
);

CREATE INDEX fe_puntos_expedicion_log_punto_idx ON public.fe_puntos_expedicion_log (empresa_id, punto_id, creado_at DESC);

COMMENT ON TABLE public.fe_puntos_expedicion_log IS 'Bitácora inmutable de la gestión de puntos de expedición (alta, activación, desactivación) con valor anterior, nuevo y usuario. Solo altas; el borrado solo ocurre en el reinicio DEMO.';

CREATE OR REPLACE FUNCTION public.fe_puntos_expedicion_log_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.nex_reinicio_demo_activo(OLD.empresa_id) THEN RETURN OLD; END IF;
  END IF;
  RAISE EXCEPTION 'fe_puntos_expedicion_log es de solo altas: no se modifica ni se borra.' USING ERRCODE = 'P0001';
END $$;

CREATE TRIGGER fe_puntos_expedicion_log_inmutable_fila_trg BEFORE UPDATE OR DELETE ON public.fe_puntos_expedicion_log
  FOR EACH ROW EXECUTE FUNCTION public.fe_puntos_expedicion_log_inmutable();
CREATE TRIGGER fe_puntos_expedicion_log_inmutable_truncate_trg BEFORE TRUNCATE ON public.fe_puntos_expedicion_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.fe_puntos_expedicion_log_inmutable();

-- Identidad fiscal (empresa + establecimiento + código) ya usada por OTRO punto de OTRA sucursal. p_solo_activos = true: solo cuenta puntos activos (activación y trigger); false: cualquiera (alta).
CREATE OR REPLACE FUNCTION public.fe_punto_identidad_en_uso(p_empresa uuid, p_establecimiento text, p_codigo text, p_sucursal uuid, p_excluir_punto uuid, p_solo_activos boolean) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fe_puntos_expedicion x JOIN public.sucursales sx ON sx.empresa_id = x.empresa_id AND sx.id = x.sucursal_id
     WHERE x.empresa_id = p_empresa AND x.codigo = p_codigo AND sx.establecimiento_sifen = p_establecimiento AND x.sucursal_id <> p_sucursal
       AND (p_excluir_punto IS NULL OR x.id <> p_excluir_punto) AND (NOT p_solo_activos OR x.activo));
$$;

-- Serializa, dentro de la transacción, toda alta/activación de la misma identidad fiscal (empresa + establecimiento + código): sin esto, dos sesiones concurrentes podrían pasar ambas la comprobación.
CREATE OR REPLACE FUNCTION public.fe_punto_bloquear_identidad(p_empresa uuid, p_establecimiento text, p_codigo text) RETURNS void
LANGUAGE sql SET search_path = public, pg_temp AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('fe_punto|' || p_empresa::text || '|' || p_establecimiento || '|' || p_codigo, 57));
$$;

-- Defensa en profundidad: aunque un punto se escriba por otra vía (carga manual del responsable), DOS puntos ACTIVOS no pueden compartir la identidad fiscal. Solo se dispara al insertar o al
-- cambiar activo / sucursal_id: la emisión (que solo actualiza ultimo_numero y actualizado_at) no lo activa.
CREATE OR REPLACE FUNCTION public.fe_puntos_expedicion_identidad() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_est text;
BEGIN
  IF NOT NEW.activo THEN RETURN NEW; END IF;
  SELECT establecimiento_sifen INTO v_est FROM public.sucursales WHERE empresa_id = NEW.empresa_id AND id = NEW.sucursal_id;
  IF v_est IS NULL THEN RETURN NEW; END IF;
  PERFORM public.fe_punto_bloquear_identidad(NEW.empresa_id, v_est, NEW.codigo);
  IF public.fe_punto_identidad_en_uso(NEW.empresa_id, v_est, NEW.codigo, NEW.sucursal_id, NEW.id, true) THEN
    RAISE EXCEPTION 'otro punto activo de otra sucursal ya usa el establecimiento % y el código %: la numeración colisionaría', v_est, NEW.codigo USING ERRCODE = 'P0001', DETAIL = 'NEX:IDENTIDAD_FISCAL_DUPLICADA';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER fe_puntos_expedicion_identidad_trg BEFORE INSERT OR UPDATE OF activo, sucursal_id ON public.fe_puntos_expedicion
  FOR EACH ROW EXECUTE FUNCTION public.fe_puntos_expedicion_identidad();

-- Último número que Nexit ya emitió para ese establecimiento y punto (0 si ninguno): el «último número emitido» confirmado nunca puede ser menor.
CREATE OR REPLACE FUNCTION public.fe_punto_maximo_emitido(p_empresa uuid, p_establecimiento text, p_codigo text) RETURNS integer
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT coalesce(max(numero::int), 0) FROM public.documentos_electronicos
   WHERE empresa_id = p_empresa AND establecimiento = p_establecimiento AND punto_expedicion = p_codigo AND numero ~ '^[0-9]{7}$';
$$;

CREATE OR REPLACE FUNCTION public.fe_punto_crear(p_empresa uuid, p_usuario uuid, p_sucursal uuid, p_codigo text, p_nombre text, p_ultimo_numero integer, p_confirmado boolean)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_est text;
  v_id uuid;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'PUNTOS') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.PUNTOS en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_confirmado IS NOT TRUE THEN
    RAISE EXCEPTION 'confirme que el último número emitido es correcto' USING ERRCODE = 'P0001', DETAIL = 'NEX:CONFIRMACION_REQUERIDA';
  END IF;
  IF p_ultimo_numero IS NULL OR p_ultimo_numero NOT BETWEEN 0 AND 9999998 THEN
    RAISE EXCEPTION 'informe el último número realmente emitido (0 a 9999998)' USING ERRCODE = 'P0001', DETAIL = 'NEX:NUMERO_INVALIDO';
  END IF;
  IF p_codigo IS NULL OR p_codigo !~ '^[0-9]{3}$' OR p_codigo = '000' THEN
    RAISE EXCEPTION 'el código del punto debe tener 3 dígitos (001 a 999)' USING ERRCODE = 'P0001', DETAIL = 'NEX:CODIGO_INVALIDO';
  END IF;
  IF p_nombre IS NULL OR char_length(btrim(p_nombre)) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'el nombre del punto debe tener de 1 a 60 caracteres' USING ERRCODE = 'P0001', DETAIL = 'NEX:NOMBRE_INVALIDO';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sucursales WHERE empresa_id = p_empresa AND id = p_sucursal AND activo) OR NOT public.sucursal_en_alcance(p_empresa, p_usuario, p_sucursal) THEN
    RAISE EXCEPTION 'la sucursal no existe, está inactiva o está fuera del alcance del usuario' USING ERRCODE = 'P0001', DETAIL = 'NEX:SUCURSAL_INVALIDA';
  END IF;
  SELECT establecimiento_sifen INTO v_est FROM public.sucursales WHERE empresa_id = p_empresa AND id = p_sucursal;
  IF v_est IS NULL THEN
    RAISE EXCEPTION 'la sucursal no tiene establecimiento SIFEN configurado' USING ERRCODE = 'P0001', DETAIL = 'NEX:SIN_ESTABLECIMIENTO';
  END IF;
  PERFORM public.fe_punto_bloquear_identidad(p_empresa, v_est, p_codigo);
  IF public.fe_punto_identidad_en_uso(p_empresa, v_est, p_codigo, p_sucursal, NULL, false) THEN
    RAISE EXCEPTION 'el establecimiento % con el código % ya está configurado en otra sucursal: dos puntos con la misma identidad fiscal colisionarían en la numeración', v_est, p_codigo USING ERRCODE = 'P0001', DETAIL = 'NEX:IDENTIDAD_FISCAL_DUPLICADA';
  END IF;
  IF p_ultimo_numero < public.fe_punto_maximo_emitido(p_empresa, v_est, p_codigo) THEN
    RAISE EXCEPTION 'el último número informado es menor que el ya emitido por Nexit para ese establecimiento y punto' USING ERRCODE = 'P0001', DETAIL = 'NEX:NUMERO_MENOR_QUE_EMITIDOS';
  END IF;

  BEGIN
    INSERT INTO public.fe_puntos_expedicion (empresa_id, sucursal_id, codigo, nombre, ultimo_numero, activo)
    VALUES (p_empresa, p_sucursal, p_codigo, btrim(p_nombre), p_ultimo_numero, false) RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'ya existe un punto con ese código en la sucursal' USING ERRCODE = 'P0001', DETAIL = 'NEX:PUNTO_DUPLICADO';
  END;

  INSERT INTO public.fe_puntos_expedicion_log (empresa_id, punto_id, usuario_id, accion, anterior, nuevo)
  VALUES (p_empresa, v_id, p_usuario, 'CREAR', NULL, jsonb_build_object('sucursal_id', p_sucursal, 'codigo', p_codigo, 'nombre', btrim(p_nombre), 'ultimo_numero', p_ultimo_numero, 'activo', false));

  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.fe_punto_activar(p_empresa uuid, p_usuario uuid, p_punto uuid, p_ultimo_numero integer, p_confirmado boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_p public.fe_puntos_expedicion%ROWTYPE;
  v_est text;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'PUNTOS') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.PUNTOS en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_confirmado IS NOT TRUE THEN
    RAISE EXCEPTION 'confirme que el último número emitido es correcto' USING ERRCODE = 'P0001', DETAIL = 'NEX:CONFIRMACION_REQUERIDA';
  END IF;
  IF p_ultimo_numero IS NULL OR p_ultimo_numero NOT BETWEEN 0 AND 9999998 THEN
    RAISE EXCEPTION 'informe el último número realmente emitido (0 a 9999998)' USING ERRCODE = 'P0001', DETAIL = 'NEX:NUMERO_INVALIDO';
  END IF;

  -- Primero se lee SIN bloquear para conocer la identidad; se serializa por identidad (advisory lock) y recién entonces se bloquea la fila y se re-lee con el estado confirmado.
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
  IF v_p.activo THEN
    RAISE EXCEPTION 'el punto ya está activo' USING ERRCODE = 'P0001', DETAIL = 'NEX:PUNTO_YA_ACTIVO';
  END IF;
  IF public.fe_punto_identidad_en_uso(p_empresa, v_est, v_p.codigo, v_p.sucursal_id, v_p.id, true) THEN
    RAISE EXCEPTION 'otro punto activo de otra sucursal ya usa el establecimiento % y el código %: desactívelo antes o use otro código', v_est, v_p.codigo USING ERRCODE = 'P0001', DETAIL = 'NEX:IDENTIDAD_FISCAL_DUPLICADA';
  END IF;
  -- La numeración solo crece: se confirma el valor guardado o se informa uno MAYOR (se emitió fuera de Nexit); uno menor repetiría números ya usados.
  IF p_ultimo_numero < v_p.ultimo_numero OR p_ultimo_numero < public.fe_punto_maximo_emitido(p_empresa, v_est, v_p.codigo) THEN
    RAISE EXCEPTION 'el último número informado es menor que el registrado o que el ya emitido por Nexit: la numeración no retrocede' USING ERRCODE = 'P0001', DETAIL = 'NEX:NUMERO_MENOR_QUE_EMITIDOS';
  END IF;

  UPDATE public.fe_puntos_expedicion SET ultimo_numero = p_ultimo_numero, activo = true, actualizado_at = now() WHERE empresa_id = p_empresa AND id = p_punto;

  INSERT INTO public.fe_puntos_expedicion_log (empresa_id, punto_id, usuario_id, accion, anterior, nuevo)
  VALUES (p_empresa, p_punto, p_usuario, 'ACTIVAR', jsonb_build_object('ultimo_numero', v_p.ultimo_numero, 'activo', false), jsonb_build_object('ultimo_numero', p_ultimo_numero, 'activo', true));
END $$;

CREATE OR REPLACE FUNCTION public.fe_punto_desactivar(p_empresa uuid, p_usuario uuid, p_punto uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_p public.fe_puntos_expedicion%ROWTYPE;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'PUNTOS') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.PUNTOS en esta empresa' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_p FROM public.fe_puntos_expedicion WHERE empresa_id = p_empresa AND id = p_punto FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'el punto de expedición no existe' USING ERRCODE = 'P0001', DETAIL = 'NEX:PUNTO_INVALIDO';
  END IF;
  IF NOT public.sucursal_en_alcance(p_empresa, p_usuario, v_p.sucursal_id) THEN
    RAISE EXCEPTION 'la sucursal está fuera del alcance del usuario' USING ERRCODE = 'P0001', DETAIL = 'NEX:SUCURSAL_INVALIDA';
  END IF;
  IF NOT v_p.activo THEN
    RAISE EXCEPTION 'el punto ya está inactivo' USING ERRCODE = 'P0001', DETAIL = 'NEX:PUNTO_YA_INACTIVO';
  END IF;

  UPDATE public.fe_puntos_expedicion SET activo = false, actualizado_at = now() WHERE empresa_id = p_empresa AND id = p_punto;

  INSERT INTO public.fe_puntos_expedicion_log (empresa_id, punto_id, usuario_id, accion, anterior, nuevo)
  VALUES (p_empresa, p_punto, p_usuario, 'DESACTIVAR', jsonb_build_object('ultimo_numero', v_p.ultimo_numero, 'activo', true), jsonb_build_object('ultimo_numero', v_p.ultimo_numero, 'activo', false));
END $$;

CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_facturacion_puntos() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;

  -- La bitácora NO se lee con el rol de la aplicación (sin RLS por empresa y sin consumidor): solo la escriben las funciones SECURITY DEFINER.
  REVOKE ALL ON public.fe_puntos_expedicion_log FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_punto_identidad_en_uso(uuid, text, text, uuid, uuid, boolean) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_punto_bloquear_identidad(uuid, text, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_punto_crear(uuid, uuid, uuid, text, text, integer, boolean) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_punto_activar(uuid, uuid, uuid, integer, boolean) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_punto_desactivar(uuid, uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_punto_maximo_emitido(uuid, text, text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.fe_punto_crear(uuid, uuid, uuid, text, text, integer, boolean) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_punto_activar(uuid, uuid, uuid, integer, boolean) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_punto_desactivar(uuid, uuid, uuid) TO nexit_runtime;
END $$;

SELECT public.nex_aplicar_grants_facturacion_puntos();
