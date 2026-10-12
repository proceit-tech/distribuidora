-- =====================================================================
-- NEX-051 — Facturación: permiso FACTURACION_ELECTRONICA.PRECIO (facturar a un precio distinto del precio de lista).
-- Requiere NEX-048 (permiso FACTURACION_ELECTRONICA.CREAR). Incremental: NO modifica NEX-047…050. NO ejecutar en la VM ni en el banco 'nexit' sin
-- autorización expresa del responsable (backup previo). Reversión: scripts/reversion-NEX-051.sql. ESTADO: versionada y NO aplicada.
--
--  · Solo registra el permiso. NO se asigna a ningún perfil: el responsable lo concede, perfil por perfil, desde la administración de perfiles.
--  · Sin la migración, o sin el permiso asignado, la aplicación factura SIEMPRE al precio de lista del catálogo (el servidor rechaza cualquier otro precio).
--  · Con el permiso, el servidor acepta un precio unitario IVA incluido positivo (hasta 4 decimales) que reemplaza al de lista en esa línea; el precio queda
--    en el payload inmutable del documento. No existe límite de descuento ni autorización por monto: son decisiones de negocio pendientes.
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.permisos WHERE codigo = 'FACTURACION_ELECTRONICA.CREAR') THEN
    RAISE EXCEPTION 'NEX-051 requiere NEX-048 (permiso FACTURACION_ELECTRONICA.CREAR).';
  END IF;
  IF EXISTS (SELECT 1 FROM public.permisos WHERE codigo = 'FACTURACION_ELECTRONICA.PRECIO') THEN
    RAISE EXCEPTION 'el permiso FACTURACION_ELECTRONICA.PRECIO ya existe: NEX-051 parece aplicada; no se reaplica por suposición.';
  END IF;
END $$;

INSERT INTO public.permisos (codigo, recurso, accion, modulo, nivel_alcance, clase)
VALUES ('FACTURACION_ELECTRONICA.PRECIO', 'FACTURACION_ELECTRONICA', 'PRECIO', 'facturacion', 'SUCURSAL', 'OPERACIONAL');
