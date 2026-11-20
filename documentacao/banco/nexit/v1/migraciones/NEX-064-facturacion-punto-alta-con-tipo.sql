-- =====================================================================
-- NEX-064 — Facturación (AUD-PRO129-UX-R01-01): ALTA FISCAL ÚNICA de punto de expedición + tipo documental, en UNA transacción.
-- Requiere NEX-063 (fe_punto_registrar, fe_secuencia_configurar, fe_punto_estado, fe_punto_secuencias.serie/activo). Incremental: NO edita ninguna migración anterior.
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable: backup previo, aplicación por el runner, verificación (scripts/verificar-NEX-064.sql) y recuperación
-- (scripts/reversion-NEX-064.sql). ESTADO: versionada y NO aplicada. Ningún agente de IA la aplica. Orden: primero esta migración y después el código de la aplicación.
--
-- Qué hace
--  · fe_punto_alta_tipo(): una sola llamada SQL (una sola transacción) que, según exista o no el punto administrativo (empresa + sucursal + código):
--      - punto NUEVO: lo registra (inactivo) y configura el primer tipo; si CUALQUIER validación o escritura falla, no queda ningún punto vacío (la función entera se revierte);
--      - punto EXISTENTE: lo reutiliza (id y nombre administrativo intactos; el nombre enviado se ignora) y añade ÚNICAMENTE la configuración del tipo nuevo; las demás secuencias no se tocan;
--      - tipo YA configurado: error NEX:TIPO_DUPLICADO (duplicidad del TIPO, no del punto), sin escribir nada ni reiniciar serie/contador.
--    Serializa las altas concurrentes de la misma identidad (empresa + establecimiento + código) con el mismo advisory lock de NEX-057; dos altas simultáneas de tipos distintos del mismo código
--    terminan con UN solo punto físico y dos configuraciones.
--  · p_activar deja el tipo disponible para emitir y, si el punto estaba inactivo (o es nuevo), también lo activa (una sola decisión del operador, sin etapas intermedias).
--  · Reutiliza fe_punto_registrar / fe_secuencia_configurar / fe_punto_estado: heredan permiso FACTURACION_ELECTRONICA.PUNTOS, alcance de sucursal, establecimiento SIFEN, identidad fiscal única entre
--    sucursales, confirmación expresa, serie (sin serie o AA–ZZ), rango 0…9999999, no retroceso, y bitácora.
-- Qué NO hace: no cambia la numeración ni las funciones de emisión FE/NCE, no habilita NRE/NDE/AFE, no toca documentos, CDC ni NEX-063.
-- =====================================================================
DO $$
BEGIN
  IF to_regprocedure('public.fe_punto_registrar(uuid,uuid,uuid,text,text)') IS NULL OR to_regprocedure('public.fe_secuencia_configurar(uuid,uuid,uuid,text,text,integer,boolean,boolean)') IS NULL
     OR to_regprocedure('public.fe_punto_estado(uuid,uuid,uuid,boolean)') IS NULL THEN
    RAISE EXCEPTION 'NEX-064 requiere NEX-063 aplicada.';
  END IF;
  IF to_regprocedure('public.fe_punto_alta_tipo(uuid,uuid,uuid,text,text,text,text,integer,boolean,boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'fe_punto_alta_tipo ya existe: NEX-064 parece aplicada; no se reaplica por suposición.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fe_punto_alta_tipo(p_empresa uuid, p_usuario uuid, p_sucursal uuid, p_codigo text, p_nombre text, p_tipo text, p_serie text, p_ultimo_numero integer, p_confirmado boolean, p_activar boolean DEFAULT false)
RETURNS TABLE (o_punto uuid, o_punto_creado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_est text;
  v_punto uuid;
  v_creado boolean := false;
  v_activo boolean;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'PUNTOS') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.PUNTOS en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('FE', 'NCE', 'NDE', 'NRE', 'AFE') THEN
    RAISE EXCEPTION 'seleccione el tipo de documento (FE, NCE, NDE, NRE o AFE)' USING ERRCODE = 'P0001', DETAIL = 'NEX:TIPO_INVALIDO';
  END IF;
  IF p_codigo IS NULL OR p_codigo !~ '^[0-9]{3}$' OR p_codigo = '000' THEN
    RAISE EXCEPTION 'el código del punto debe tener 3 dígitos (001 a 999)' USING ERRCODE = 'P0001', DETAIL = 'NEX:CODIGO_INVALIDO';
  END IF;

  -- Mismo orden de bloqueos que fe_punto_registrar (sucursal FOR SHARE → lock de identidad), para serializar altas concurrentes del mismo código.
  SELECT establecimiento_sifen INTO v_est FROM public.sucursales WHERE empresa_id = p_empresa AND id = p_sucursal AND activo FOR SHARE;
  IF NOT FOUND OR NOT public.sucursal_en_alcance(p_empresa, p_usuario, p_sucursal) THEN
    RAISE EXCEPTION 'la sucursal no existe, está inactiva o está fuera del alcance del usuario' USING ERRCODE = 'P0001', DETAIL = 'NEX:SUCURSAL_INVALIDA';
  END IF;
  IF v_est IS NULL THEN
    RAISE EXCEPTION 'la sucursal no tiene establecimiento SIFEN configurado' USING ERRCODE = 'P0001', DETAIL = 'NEX:SIN_ESTABLECIMIENTO';
  END IF;
  PERFORM public.fe_punto_bloquear_identidad(p_empresa, v_est, p_codigo);

  SELECT id, activo INTO v_punto, v_activo FROM public.fe_puntos_expedicion WHERE empresa_id = p_empresa AND sucursal_id = p_sucursal AND codigo = p_codigo;
  IF FOUND THEN
    -- Punto administrativo existente: se reutiliza; si el tipo ya está configurado es una duplicidad del TIPO y no se escribe nada.
    IF EXISTS (SELECT 1 FROM public.fe_punto_secuencias WHERE empresa_id = p_empresa AND punto_id = v_punto AND tipo_documento = p_tipo) THEN
      RAISE EXCEPTION 'el tipo % ya está configurado en el punto %-%: use «Configurar» para reconciliarlo (no se reinicia su serie ni su contador)', p_tipo, v_est, p_codigo USING ERRCODE = 'P0001', DETAIL = 'NEX:TIPO_DUPLICADO';
    END IF;
  ELSE
    v_punto := public.fe_punto_registrar(p_empresa, p_usuario, p_sucursal, p_codigo, p_nombre);
    v_creado := true;
    v_activo := false;
  END IF;

  -- Configuración del tipo (confirmación única, serie, número, no retroceso, bitácora). Si falla, TODO se revierte, incluido el punto recién registrado.
  PERFORM public.fe_secuencia_configurar(p_empresa, p_usuario, v_punto, p_tipo, p_serie, p_ultimo_numero, p_confirmado, p_activar);
  IF p_activar IS TRUE AND NOT v_activo THEN
    PERFORM public.fe_punto_estado(p_empresa, p_usuario, v_punto, true);
  END IF;

  RETURN QUERY SELECT v_punto, v_creado;
END $$;

COMMENT ON FUNCTION public.fe_punto_alta_tipo(uuid, uuid, uuid, text, text, text, text, integer, boolean, boolean) IS 'NEX-064: alta fiscal única (punto nuevo o existente + un tipo documental) en una sola transacción; duplicidad del TIPO, nunca del punto.';

CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_facturacion_alta_tipo() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    RETURN;
  END IF;

  REVOKE ALL ON FUNCTION public.fe_punto_alta_tipo(uuid, uuid, uuid, text, text, text, text, integer, boolean, boolean) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.fe_punto_alta_tipo(uuid, uuid, uuid, text, text, text, text, integer, boolean, boolean) TO nexit_runtime;
END $$;

SELECT public.nex_aplicar_grants_facturacion_alta_tipo();
