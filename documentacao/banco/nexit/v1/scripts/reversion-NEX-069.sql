-- =====================================================================
-- REVERSIÓN de NEX-069 (URL del gateway editable). Ejecutar SOLO con autorización del responsable, con backup previo, en UNA transacción:
--   psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-069.sql
-- Restaura fe_gateway_config_guardar tal como la define NEX-061 y elimina fe_gateway_url_valida. NO modifica datos: las URL ya guardadas se conservan. Antes de revertir, desplegar la versión
-- de la aplicación anterior a G01 (la nueva envía la URL editada). Después borrar la fila 'NEX-069' de schema_migrations.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fe_gateway_config_guardar(p_empresa uuid, p_usuario uuid, p_base_url text, p_api_usuario text, p_password text, p_timeout_ms integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_u text := btrim(coalesce(p_api_usuario, ''));
  v_prev public.fe_gateway_credenciales%ROWTYPE;
  v_existe boolean;
  v_cambia boolean;
BEGIN
  IF NOT public.usuario_tiene_permiso(p_empresa, p_usuario, 'FACTURACION_ELECTRONICA', 'CONFIGURAR') THEN
    RAISE EXCEPTION 'el usuario no tiene permiso FACTURACION_ELECTRONICA.CONFIGURAR en esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_base_url IS NULL OR p_base_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]{2,5})?$' THEN
    RAISE EXCEPTION 'la URL del gateway debe ser https sin ruta' USING ERRCODE = 'P0001', DETAIL = 'NEX:URL_INVALIDA';
  END IF;
  IF char_length(v_u) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'informe el usuario de la API (1 a 60 caracteres)' USING ERRCODE = 'P0001', DETAIL = 'NEX:USUARIO_INVALIDO';
  END IF;
  IF p_timeout_ms IS NULL OR p_timeout_ms NOT BETWEEN 1000 AND 60000 THEN
    RAISE EXCEPTION 'el tiempo de espera debe estar entre 1000 y 60000 ms' USING ERRCODE = 'P0001', DETAIL = 'NEX:TIMEOUT_INVALIDO';
  END IF;
  IF p_password IS NOT NULL AND char_length(p_password) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'la clave de la API debe tener de 1 a 200 caracteres' USING ERRCODE = 'P0001', DETAIL = 'NEX:PASSWORD_INVALIDA';
  END IF;

  SELECT * INTO v_prev FROM public.fe_gateway_credenciales WHERE empresa_id = p_empresa FOR UPDATE;
  v_existe := FOUND;
  IF NOT v_existe AND p_password IS NULL THEN
    RAISE EXCEPTION 'informe la clave de la API' USING ERRCODE = 'P0001', DETAIL = 'NEX:PASSWORD_REQUERIDA';
  END IF;
  v_cambia := NOT v_existe OR v_prev.api_usuario IS DISTINCT FROM v_u OR (p_password IS NOT NULL AND p_password IS DISTINCT FROM v_prev.api_password);

  INSERT INTO public.fe_gateway_config (empresa_id, base_url, credencial_ref, timeout_ms, activo)
  VALUES (p_empresa, p_base_url, 'NEXIT_DB', p_timeout_ms, true)
  ON CONFLICT (empresa_id) DO UPDATE SET base_url = EXCLUDED.base_url, timeout_ms = EXCLUDED.timeout_ms, activo = true,
    credencial_ref = CASE WHEN public.fe_gateway_config.credencial_ref = 'NEXIT_DB' THEN 'NEXIT_DB' ELSE EXCLUDED.credencial_ref END;

  IF NOT v_existe THEN
    INSERT INTO public.fe_gateway_credenciales (empresa_id, api_usuario, api_password, actualizado_por) VALUES (p_empresa, v_u, p_password, p_usuario);
  ELSE
    UPDATE public.fe_gateway_credenciales SET api_usuario = v_u, api_password = coalesce(p_password, api_password), actualizado_por = p_usuario WHERE empresa_id = p_empresa;
  END IF;

  IF v_cambia THEN
    UPDATE public.fe_gateway_config SET credenciales_version = credenciales_version + 1, ultima_prueba_at = NULL, ultima_prueba_estado = NULL WHERE empresa_id = p_empresa;
  END IF;

  INSERT INTO public.fe_gateway_config_log (empresa_id, usuario_id, accion, detalle)
  VALUES (p_empresa, p_usuario, 'GUARDAR', jsonb_build_object('usuario_api_cambio', NOT v_existe OR v_prev.api_usuario IS DISTINCT FROM v_u, 'clave_cambio', p_password IS NOT NULL AND (NOT v_existe OR p_password IS DISTINCT FROM v_prev.api_password), 'base_url', p_base_url));
END $$;

DROP FUNCTION IF EXISTS public.fe_gateway_url_valida(text);
SELECT public.nex_aplicar_grants_facturacion_gateway();
