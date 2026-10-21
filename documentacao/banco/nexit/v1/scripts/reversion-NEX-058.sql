-- REVERSIÓN manual de NEX-058 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con copia de seguridad previa:
--   psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-058.sql
-- Quita la protección de sucursales.establecimiento_sifen y el bloqueo de fila del alta de puntos. No toca datos (puntos, documentos ni sucursales). IMPORTANTE: al revertir se vuelve a permitir
-- cambiar el establecimiento de una sucursal con puntos (riesgo de identidades fiscales duplicadas, AUD-PRO129-R02-01). Revierta NEX-058 ANTES que NEX-057. Después hay que borrar la fila
-- 'NEX-058' de schema_migrations.
DO $$
BEGIN
  IF to_regprocedure('public.fe_sucursal_establecimiento_protegido()') IS NULL THEN
    RAISE EXCEPTION 'NEX-058 no está aplicada (falta la función de protección).';
  END IF;
END $$;

DROP TRIGGER fe_puntos_expedicion_bloquea_sucursal_trg ON public.fe_puntos_expedicion;
DROP FUNCTION public.fe_puntos_expedicion_bloquea_sucursal();
DROP TRIGGER sucursales_establecimiento_protegido_trg ON public.sucursales;
DROP FUNCTION public.fe_sucursal_establecimiento_protegido();
