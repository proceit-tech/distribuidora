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
--  La emisión (fe_documento_crear_fe) sigue siendo la ÚNICA autoridad que incrementa ultimo_numero; el trigger de NEX-048 sigue impidiendo cambiar la identidad, retroceder o eliminar.
--  El rol nexit_runtime solo ejecuta estas funciones y lee la bitácora; no escribe la tabla de puntos directamente.
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
  IF v_p.activo THEN
    RAISE EXCEPTION 'el punto ya está activo' USING ERRCODE = 'P0001', DETAIL = 'NEX:PUNTO_YA_ACTIVO';
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

  GRANT SELECT ON public.fe_puntos_expedicion_log TO nexit_runtime;
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.fe_puntos_expedicion_log FROM nexit_runtime;
  REVOKE ALL ON FUNCTION public.fe_punto_crear(uuid, uuid, uuid, text, text, integer, boolean) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_punto_activar(uuid, uuid, uuid, integer, boolean) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_punto_desactivar(uuid, uuid, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fe_punto_maximo_emitido(uuid, text, text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.fe_punto_crear(uuid, uuid, uuid, text, text, integer, boolean) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_punto_activar(uuid, uuid, uuid, integer, boolean) TO nexit_runtime;
  GRANT EXECUTE ON FUNCTION public.fe_punto_desactivar(uuid, uuid, uuid) TO nexit_runtime;
END $$;

SELECT public.nex_aplicar_grants_facturacion_puntos();
