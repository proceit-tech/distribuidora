-- Provisionamiento MANUAL del gateway de facturación electrónica de PRUEBA para UNA empresa (PRO-133; hoy: CASA MINGO). NO es una migración ni la ejecuta el runner; NO se aplicó.
-- Solo el responsable, con copia de seguridad previa y DESPUÉS de aplicar NEX-047 (tabla fe_gateway_config). No guarda credenciales: solo el NOMBRE lógico (credencial_ref) de las variables
-- NEXIT_FE_<REF>_RUC / NEXIT_FE_<REF>_PASSWORD que viven en app.env del servidor (fuera de Git). No toca numeración, documentos ni migraciones.
--   docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 -1 -v empresa=<codigo-de-empresa> -v ref=<REF> -f - < configurar-gateway-prueba-NEX-047.sql
--   (<REF>: mayúsculas/dígitos/guion bajo, p. ej. CASAMINGO → variables NEXIT_FE_CASAMINGO_RUC y NEXIT_FE_CASAMINGO_PASSWORD). Reversión: reversion-gateway-prueba-NEX-047.sql.
-- Seguridad: aborta si la empresa no existe o no es única, si NEX-047 no está aplicada o si la empresa YA tiene una fila (no se sobrescribe ni se reactiva por suposición).
-- Servidor de PRUEBA (ver REQUISITOS-FACTURACION-ELECTRONICA-API-EXTERNA-2026-10-12.md): login /api/login, envío /api/recepcion_de, consulta /api/consulta_de. psql no expande variables dentro de DO: parámetros de sesión.
SELECT set_config('nexit.empresa', :'empresa', true), set_config('nexit.ref', :'ref', true);

DO $$
DECLARE
  v_empresa uuid;
  v_n integer;
BEGIN
  IF to_regclass('public.fe_gateway_config') IS NULL THEN
    RAISE EXCEPTION 'NEX-047 no está aplicada (fe_gateway_config no existe).';
  END IF;
  IF current_setting('nexit.ref') !~ '^[A-Z][A-Z0-9_]{0,39}$' THEN
    RAISE EXCEPTION 'la referencia de credenciales debe cumplir ^[A-Z][A-Z0-9_]{0,39}$ (p. ej. CASAMINGO)';
  END IF;
  SELECT count(*), min(id::text)::uuid INTO v_n, v_empresa FROM public.empresas WHERE codigo = current_setting('nexit.empresa');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'la empresa % no existe o no es única (coincidencias: %)', current_setting('nexit.empresa'), v_n;
  END IF;
  IF EXISTS (SELECT 1 FROM public.fe_gateway_config WHERE empresa_id = v_empresa) THEN
    RAISE EXCEPTION 'la empresa ya tiene una configuración de gateway: no se sobrescribe. Revísela antes (SELECT empresa_id, base_url, credencial_ref, timeout_ms, activo FROM fe_gateway_config).';
  END IF;
  INSERT INTO public.fe_gateway_config (empresa_id, base_url, credencial_ref, timeout_ms, activo)
  VALUES (v_empresa, 'https://gateway-bebidas-py.e-factura-hub.com', current_setting('nexit.ref'), 30000, true);
END $$;

-- Verificación (sin secretos): una fila activa para la empresa.
SELECT e.codigo AS empresa, g.base_url, g.credencial_ref, g.timeout_ms, g.activo
  FROM public.fe_gateway_config g JOIN public.empresas e ON e.id = g.empresa_id WHERE e.codigo = :'empresa';
