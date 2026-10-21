-- =====================================================================
-- NEX-059 — Facturación (PRO-129, AUD-PRO129-R03-01): fe_punto_crear lee el establecimiento SIFEN de la sucursal BAJO EL BLOQUEO de su fila (FOR SHARE) antes de fijar la identidad fiscal.
-- Requiere NEX-057 y NEX-058. Incremental: NO edita NEX-001…058 (no se sabe si NEX-057/058 ya están instaladas en el banco real: sus checksums no se tocan). Reemplaza SOLO el cuerpo de
-- fe_punto_crear (misma firma; los privilegios existentes se conservan y el envoltorio de grants de NEX-052 los reaplica). Reversión: scripts/reversion-NEX-059.sql (restaura el cuerpo de NEX-057).
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo y consulta del historial real schema_migrations). ESTADO: versionada y NO aplicada.
--
-- Problema (R03-01): fe_punto_crear leía sucursales.establecimiento_sifen SIN bloqueo; tomaba el lock de identidad con ese valor y comprobaba el uso; recién el trigger BEFORE INSERT de NEX-058 tomaba el
-- FOR SHARE, ya tarde. Si un UPDATE del establecimiento (admisible mientras la sucursal no tuviera puntos) confirmaba en ese intervalo, nacía un punto INACTIVO con una identidad fiscal ya registrada en
-- otra sucursal (alta administrativa inconsistente, sin función para borrarlo). No generaba dos puntos activos ni números duplicados, pero dejaba un registro inválido.
--
-- Solución: FOR SHARE sobre la fila de la sucursal al LEER el establecimiento (antes de la identidad, del advisory lock y del INSERT). Cubre las dos órdenes: (A) el alta llega primero → el UPDATE espera
-- y luego el trigger de NEX-058 lo rechaza (ya hay punto); (B) el UPDATE llega primero → el alta espera su confirmación, lee el establecimiento DEFINITIVO y rechaza la identidad ocupada.
-- Sin deadlock: el UPDATE de la sucursal toma su fila y NO toma el lock de identidad; fe_punto_activar no bloquea la fila de la sucursal (un UPDATE del establecimiento no puede ocurrir con el punto ya
-- creado por NEX-058); el orden fila de la sucursal → lock de identidad → fila del punto es el mismo en todas las rutas que usan ambos. No cambia fe_documento_crear_fe (NEX-048), ni NEX-057/058.
-- =====================================================================
DO $$
BEGIN
  IF to_regprocedure('public.fe_punto_crear(uuid,uuid,uuid,text,text,integer,boolean)') IS NULL OR to_regprocedure('public.fe_sucursal_establecimiento_protegido()') IS NULL
     OR to_regprocedure('public.fe_punto_identidad_en_uso(uuid,text,text,uuid,uuid,boolean)') IS NULL THEN
    RAISE EXCEPTION 'NEX-059 requiere NEX-057 (con identidad fiscal única) y NEX-058.';
  END IF;
  IF coalesce(obj_description('public.fe_punto_crear(uuid,uuid,uuid,text,text,integer,boolean)'::regprocedure, 'pg_proc'), '') LIKE 'NEX-059%' THEN
    RAISE EXCEPTION 'NEX-059 parece aplicada (fe_punto_crear ya lleva su marca); no se reaplica por suposición.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fe_punto_crear(p_empresa uuid, p_usuario uuid, p_sucursal uuid, p_codigo text, p_nombre text, p_ultimo_numero integer, p_confirmado boolean)
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
  -- AUD-PRO129-R03-01: el establecimiento se lee BAJO EL BLOQUEO de la fila de la sucursal (FOR SHARE, que dura hasta el fin de la transacción) ANTES de fijar la identidad, tomar el lock de identidad,
  -- comprobar el uso y insertar. Un cambio de establecimiento concurrente (que necesita el bloqueo exclusivo de la fila) espera a que esta transacción termine —y entonces el trigger de NEX-058 lo rechaza
  -- porque ya hay un punto—; y si el cambio ya estaba en curso, esta lectura espera a su confirmación y ve el valor DEFINITIVO. Orden de bloqueos: fila de la sucursal → lock de identidad → fila del punto.
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

COMMENT ON FUNCTION public.fe_punto_crear(uuid, uuid, uuid, text, text, integer, boolean) IS 'NEX-059: alta de punto de expedición (inactivo); lee el establecimiento de la sucursal bajo FOR SHARE antes de fijar la identidad fiscal.';
SELECT public.nex_aplicar_grants_facturacion_puntos();
