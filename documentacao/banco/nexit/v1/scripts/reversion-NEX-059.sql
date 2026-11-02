-- REVERSIÓN manual de NEX-059 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con copia de seguridad previa:
--   psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-059.sql
-- Restaura el cuerpo de fe_punto_crear de NEX-057 (sin el FOR SHARE sobre la sucursal). No toca datos. IMPORTANTE: reabre la carrera R03-01 (alta de punto vs cambio de establecimiento). Después hay que
-- borrar la fila 'NEX-059' de schema_migrations.
DO $$
BEGIN
  IF coalesce(obj_description('public.fe_punto_crear(uuid,uuid,uuid,text,text,integer,boolean)'::regprocedure, 'pg_proc'), '') NOT LIKE 'NEX-059%' THEN
    RAISE EXCEPTION 'NEX-059 no está aplicada (fe_punto_crear no lleva su marca).';
  END IF;
END $$;

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

COMMENT ON FUNCTION public.fe_punto_crear(uuid, uuid, uuid, text, text, integer, boolean) IS NULL;
SELECT public.nex_aplicar_grants_facturacion_puntos();
