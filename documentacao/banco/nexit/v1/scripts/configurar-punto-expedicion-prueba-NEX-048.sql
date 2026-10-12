-- Configuración MANUAL del punto de expedición de PRUEBA (decisión del responsable, 12/10/2026): establecimiento 001, punto 002, primera factura
-- 001-002-0050000  →  ultimo_numero = 49999 (la reserva suma 1). NO es una migración ni la ejecuta el runner; NO se aplicó. Solo el responsable, en el
-- ambiente de prueba y para la empresa emisora de prueba, con backup previo y DESPUÉS de aplicar NEX-048:
--   psql -v ON_ERROR_STOP=1 -1 -v empresa=<codigo-de-empresa> -v sucursal=<codigo-de-sucursal> -f configurar-punto-expedicion-prueba-NEX-048.sql
-- No es un valor por defecto de otras empresas. Verifique antes que el gateway no tenga ya emitidas facturas 001-002-0050000 o posteriores.
-- psql no expande variables dentro de bloques DO: se pasan por parámetros de sesión de la transacción.
SELECT set_config('nexit.empresa', :'empresa', true), set_config('nexit.sucursal', :'sucursal', true);

DO $$
DECLARE
  v_suc record;
BEGIN
  SELECT s.id, s.empresa_id, s.establecimiento_sifen INTO v_suc
    FROM public.sucursales s JOIN public.empresas e ON e.id = s.empresa_id
   WHERE e.codigo = current_setting('nexit.empresa') AND s.codigo = current_setting('nexit.sucursal');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'empresa o sucursal no encontradas';
  END IF;
  IF v_suc.establecimiento_sifen IS DISTINCT FROM '001' THEN
    RAISE EXCEPTION 'la sucursal debe tener establecimiento_sifen = 001 (tiene %)', v_suc.establecimiento_sifen;
  END IF;
  IF EXISTS (SELECT 1 FROM public.fe_puntos_expedicion WHERE empresa_id = v_suc.empresa_id AND sucursal_id = v_suc.id AND codigo = '002') THEN
    RAISE EXCEPTION 'el punto de expedición 002 ya existe: no se reinicia la numeración';
  END IF;
  INSERT INTO public.fe_puntos_expedicion (empresa_id, sucursal_id, codigo, nombre, ultimo_numero)
  VALUES (v_suc.empresa_id, v_suc.id, '002', 'Punto 002 (prueba)', 49999);
END $$;
