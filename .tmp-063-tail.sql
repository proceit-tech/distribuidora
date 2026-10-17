
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
