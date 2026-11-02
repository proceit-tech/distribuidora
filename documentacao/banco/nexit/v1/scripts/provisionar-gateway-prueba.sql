-- Parte SQL del provisionamiento del gateway FE de PRUEBA (PRO-133, AUD-PRO133-R01/R02). La invoca scripts/provisionar-gateway-prueba.sh; no se ejecuta a mano ni por el runner de migraciones.
-- Parámetros psql: -v modo=verificar|aplicar|revertir  -v razon='CASA MINGO'  -v ref=CASAMINGO  -v url=https://…  -v timeout=30000  -v propio=si|no  -v empresa_id=<uuid|vacío>
-- IDEMPOTENTE y SIN credenciales: solo lee/escribe fe_gateway_config (URL + referencia lógica). La empresa se identifica por RAZÓN SOCIAL (no se presume su código) y debe ser ÚNICA.
-- R03-01/R04-01: tanto APLICAR como REVERTIR exigen, dentro de la MISMA transacción que escribe, que la empresa identificada por razón social tenga EXACTAMENTE el UUID esperado (empresa_id: el
--   obtenido en el preflight al aplicar, el registrado por el provisionador al revertir); si la identificación cambió, no se toca nada (EMPRESA_DISTINTA_NO_SE_TOCA).
-- R03-04: el shell invoca este archivo con psql -1 (una sola transacción); la salida incluye «EMPRESA_ID=<uuid>».
-- Salida: «RESULTADO=<código>», «EMPRESA_ID=<uuid>» y «COMPARTIDA=<n>» (cuántas OTRAS empresas usan la misma credencial_ref). Nunca toca migraciones, numeración, documentos ni otras tablas.
-- R02-05: la existencia de fe_gateway_config se comprueba FUERA del bloque DO (\if): sin NEX-047 el bloque con el tipo de la tabla ni siquiera se compila y se devuelve SIN_NEX047.
-- R02-01: la reversión solo desactiva la fila si (a) el propio provisionador la creó/reactivó (propio=si, según su archivo de estado) y (b) la fila coincide EXACTAMENTE con la URL y la referencia gestionadas;
--         en cualquier otro caso no cambia nada.
SELECT to_regclass('public.fe_gateway_config') IS NOT NULL AS tiene_tabla \gset
SELECT set_config('nexit.modo', :'modo', false) AS a, set_config('nexit.razon', :'razon', false) AS b, set_config('nexit.ref', :'ref', false) AS c,
       set_config('nexit.url', :'url', false) AS d, set_config('nexit.timeout', :'timeout', false) AS e, set_config('nexit.propio', :'propio', false) AS g, set_config('nexit.empresa_id', :'empresa_id', false) AS i, set_config('nexit.empresa_out', '', false) AS j,
       set_config('nexit.resultado', 'SIN_RESULTADO', false) AS f, set_config('nexit.compartida', '0', false) AS h \gset

\if :tiene_tabla
DO $$
DECLARE
  v_modo text := current_setting('nexit.modo');
  v_empresa uuid;
  v_n integer;
  v_cfg record;
  v_existe boolean;
  v_igual boolean;
  v_res text;
BEGIN
  IF current_setting('nexit.ref') !~ '^[A-Z][A-Z0-9_]{0,39}$' OR current_setting('nexit.url') !~ '^https://[A-Za-z0-9.-]+(:[0-9]{2,5})?$' OR current_setting('nexit.propio') NOT IN ('si', 'no') THEN
    PERFORM set_config('nexit.resultado', 'PARAMETROS_INVALIDOS', false); RETURN;
  END IF;
  -- Identidad real de la empresa: razón social (sin distinguir mayúsculas ni espacios repetidos); debe haber exactamente una.
  SELECT count(*), min(id::text)::uuid INTO v_n, v_empresa FROM public.empresas
   WHERE upper(regexp_replace(razon_social, '\s+', ' ', 'g')) LIKE '%' || upper(regexp_replace(current_setting('nexit.razon'), '\s+', ' ', 'g')) || '%';
  IF v_n <> 1 THEN
    PERFORM set_config('nexit.resultado', 'EMPRESA_NO_UNICA:' || v_n, false); RETURN;
  END IF;
  PERFORM set_config('nexit.empresa_out', v_empresa::text, false);
  SELECT * INTO v_cfg FROM public.fe_gateway_config WHERE empresa_id = v_empresa;
  v_existe := FOUND;
  v_igual := v_existe AND v_cfg.base_url = current_setting('nexit.url') AND v_cfg.credencial_ref = current_setting('nexit.ref');
  -- Otras empresas que usan la misma referencia de credenciales (cualquier estado): las variables NEXIT_FE_<REF>_* podrían ser compartidas.
  PERFORM set_config('nexit.compartida', (SELECT count(*) FROM public.fe_gateway_config WHERE credencial_ref = current_setting('nexit.ref') AND empresa_id <> v_empresa)::text, false);

  IF v_modo = 'verificar' THEN
    v_res := CASE WHEN NOT v_existe THEN 'VERIFICADO:sin_fila'
                  WHEN v_igual AND v_cfg.activo THEN 'VERIFICADO:activa_igual'
                  WHEN v_cfg.activo THEN 'VERIFICADO:activa_distinta' ELSE 'VERIFICADO:inactiva' END;
    PERFORM set_config('nexit.resultado', v_res, false); RETURN;
  END IF;

  -- R04-01: verificación de identidad ANTES de cualquier escritura (aplicar y revertir)
  IF current_setting('nexit.empresa_id') IS DISTINCT FROM v_empresa::text THEN
    PERFORM set_config('nexit.resultado', 'EMPRESA_DISTINTA_NO_SE_TOCA', false); RETURN;
  END IF;

  IF NOT (has_table_privilege(current_user, 'public.fe_gateway_config', 'INSERT') AND has_table_privilege(current_user, 'public.fe_gateway_config', 'UPDATE')) THEN
    PERFORM set_config('nexit.resultado', 'SIN_PRIVILEGIO', false); RETURN;
  END IF;

  IF v_modo = 'aplicar' THEN
    IF NOT v_existe THEN
      INSERT INTO public.fe_gateway_config (empresa_id, base_url, credencial_ref, timeout_ms, activo)
      VALUES (v_empresa, current_setting('nexit.url'), current_setting('nexit.ref'), current_setting('nexit.timeout')::integer, true);
      v_res := 'CONFIGURADA';
    ELSIF v_igual THEN
      -- Convergente: misma configuración. Una fila INACTIVA se reactiva (solo si es la gestionada: misma URL y referencia).
      IF NOT v_cfg.activo THEN UPDATE public.fe_gateway_config SET activo = true, actualizado_at = now() WHERE empresa_id = v_empresa; v_res := 'REACTIVADA'; ELSE v_res := 'YA_CONFIGURADA'; END IF;
    ELSE
      v_res := 'CONFLICTO_CONFIG_DISTINTA';   -- existe otra configuración: no se sustituye sin decisión humana
    END IF;
    PERFORM set_config('nexit.resultado', v_res, false); RETURN;
  END IF;

  IF v_modo = 'revertir' THEN
    IF NOT v_existe THEN v_res := 'SIN_FILA';
    ELSIF NOT v_igual THEN v_res := 'CONFIG_DISTINTA_NO_SE_TOCA';
    ELSIF current_setting('nexit.propio') <> 'si' THEN v_res := 'NO_PROPIA_NO_SE_TOCA';
    ELSIF NOT v_cfg.activo THEN v_res := 'YA_INACTIVA';
    ELSE UPDATE public.fe_gateway_config SET activo = false, actualizado_at = now() WHERE empresa_id = v_empresa; v_res := 'DESACTIVADA'; END IF;
    PERFORM set_config('nexit.resultado', v_res, false); RETURN;
  END IF;
  PERFORM set_config('nexit.resultado', 'MODO_INVALIDO', false);
END $$;
\else
SELECT set_config('nexit.resultado', 'SIN_NEX047', false) AS sin_tabla \gset
\endif

SELECT 'RESULTADO=' || current_setting('nexit.resultado');
SELECT 'EMPRESA_ID=' || current_setting('nexit.empresa_out');
SELECT 'COMPARTIDA=' || current_setting('nexit.compartida');
