-- Parte SQL del provisionamiento del gateway FE de PRUEBA (PRO-133, AUD-PRO133-R01). La invoca scripts/provisionar-gateway-prueba.sh; no se ejecuta a mano ni por el runner de migraciones.
-- Parámetros psql: -v modo=verificar|aplicar|revertir  -v razon='CASA MINGO'  -v ref=CASAMINGO  -v url=https://…  -v timeout=30000
-- IDEMPOTENTE y SIN credenciales: solo lee/escribe fe_gateway_config (URL + referencia lógica). La empresa se identifica por RAZÓN SOCIAL (no se presume su código) y debe ser ÚNICA.
-- Resultado: una línea final «RESULTADO=<código>» que el script de shell interpreta. Nunca toca migraciones, numeración, documentos ni otras tablas.
SELECT set_config('nexit.modo', :'modo', false) AS a, set_config('nexit.razon', :'razon', false) AS b, set_config('nexit.ref', :'ref', false) AS c,
       set_config('nexit.url', :'url', false) AS d, set_config('nexit.timeout', :'timeout', false) AS e, set_config('nexit.resultado', 'SIN_RESULTADO', false) AS f \gset

DO $$
DECLARE
  v_modo text := current_setting('nexit.modo');
  v_empresa uuid;
  v_n integer;
  v_cfg public.fe_gateway_config%ROWTYPE;
  v_res text;
  v_existe boolean;
BEGIN
  IF to_regclass('public.fe_gateway_config') IS NULL THEN
    PERFORM set_config('nexit.resultado', 'SIN_NEX047', false); RETURN;
  END IF;
  IF current_setting('nexit.ref') !~ '^[A-Z][A-Z0-9_]{0,39}$' OR current_setting('nexit.url') !~ '^https://[A-Za-z0-9.-]+(:[0-9]{2,5})?$' THEN
    PERFORM set_config('nexit.resultado', 'PARAMETROS_INVALIDOS', false); RETURN;
  END IF;
  -- Identidad real de la empresa: razón social (sin distinguir mayúsculas ni espacios repetidos); debe haber exactamente una.
  SELECT count(*), min(id::text)::uuid INTO v_n, v_empresa FROM public.empresas
   WHERE upper(regexp_replace(razon_social, '\s+', ' ', 'g')) LIKE '%' || upper(regexp_replace(current_setting('nexit.razon'), '\s+', ' ', 'g')) || '%';
  IF v_n <> 1 THEN
    PERFORM set_config('nexit.resultado', 'EMPRESA_NO_UNICA:' || v_n, false); RETURN;
  END IF;
  SELECT * INTO v_cfg FROM public.fe_gateway_config WHERE empresa_id = v_empresa;
  v_existe := FOUND;

  IF v_modo = 'verificar' THEN
    v_res := CASE WHEN NOT v_existe THEN 'VERIFICADO:sin_fila'
                  WHEN v_cfg.activo AND v_cfg.base_url = current_setting('nexit.url') AND v_cfg.credencial_ref = current_setting('nexit.ref') THEN 'VERIFICADO:activa_igual'
                  WHEN v_cfg.activo THEN 'VERIFICADO:activa_distinta' ELSE 'VERIFICADO:inactiva' END;
    PERFORM set_config('nexit.resultado', v_res, false); RETURN;
  END IF;

  IF NOT (has_table_privilege(current_user, 'public.fe_gateway_config', 'INSERT') AND has_table_privilege(current_user, 'public.fe_gateway_config', 'UPDATE')) THEN
    PERFORM set_config('nexit.resultado', 'SIN_PRIVILEGIO', false); RETURN;
  END IF;

  IF v_modo = 'aplicar' THEN
    IF NOT v_existe THEN
      INSERT INTO public.fe_gateway_config (empresa_id, base_url, credencial_ref, timeout_ms, activo)
      VALUES (v_empresa, current_setting('nexit.url'), current_setting('nexit.ref'), current_setting('nexit.timeout')::integer, true);
      v_res := 'CONFIGURADA';
    ELSIF v_cfg.base_url = current_setting('nexit.url') AND v_cfg.credencial_ref = current_setting('nexit.ref') THEN
      -- Convergente: misma configuración; solo se reactiva si estaba inactiva (decisión previa del propio provisionamiento).
      IF NOT v_cfg.activo THEN UPDATE public.fe_gateway_config SET activo = true, actualizado_at = now() WHERE empresa_id = v_empresa; v_res := 'REACTIVADA'; ELSE v_res := 'YA_CONFIGURADA'; END IF;
    ELSE
      v_res := 'CONFLICTO_CONFIG_DISTINTA';   -- existe otra configuración: no se sustituye sin decisión humana
    END IF;
    PERFORM set_config('nexit.resultado', v_res, false); RETURN;
  END IF;

  IF v_modo = 'revertir' THEN
    IF NOT v_existe THEN v_res := 'SIN_FILA';
    ELSIF v_cfg.activo THEN UPDATE public.fe_gateway_config SET activo = false, actualizado_at = now() WHERE empresa_id = v_empresa; v_res := 'DESACTIVADA';
    ELSE v_res := 'YA_INACTIVA'; END IF;
    PERFORM set_config('nexit.resultado', v_res, false); RETURN;
  END IF;
  PERFORM set_config('nexit.resultado', 'MODO_INVALIDO', false);
END $$;

SELECT 'RESULTADO=' || current_setting('nexit.resultado');
