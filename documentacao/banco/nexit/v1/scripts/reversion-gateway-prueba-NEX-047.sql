-- REVERSIÓN manual de configurar-gateway-prueba-NEX-047.sql (NO es una migración). Desactiva —no borra— la configuración de gateway de la empresa: el envío vuelve a responder 409 antes de reservar número.
--   docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 -1 -v empresa=<codigo-de-empresa> -f - < reversion-gateway-prueba-NEX-047.sql
-- No toca documentos, numeración ni credenciales (las variables NEXIT_FE_<REF>_* de app.env se retiran aparte, si se desea).
UPDATE public.fe_gateway_config g SET activo = false, actualizado_at = now()
  FROM public.empresas e WHERE e.id = g.empresa_id AND e.codigo = :'empresa' AND g.activo;
SELECT e.codigo AS empresa, g.credencial_ref, g.activo FROM public.fe_gateway_config g JOIN public.empresas e ON e.id = g.empresa_id WHERE e.codigo = :'empresa';
