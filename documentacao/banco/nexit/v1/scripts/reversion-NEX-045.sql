-- REVERSIÓN manual de NEX-045 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con
-- copia de seguridad previa:  psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-045.sql
-- ABORTA si tipos_cambio tiene filas (se perdería el historial de cotizaciones). Conserva canales y zonas con sus datos; solo retira los
-- índices de unicidad agregados y devuelve al rol de la aplicación el acceso de solo lectura que tenía. Después hay que borrar la fila 'NEX-045'
-- de schema_migrations.
DO $$
BEGIN
  IF to_regclass('public.tipos_cambio') IS NULL THEN
    RAISE EXCEPTION 'tipos_cambio no existe: NEX-045 no está aplicada.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tipos_cambio) THEN
    RAISE EXCEPTION 'tipos_cambio tiene filas: exporte el historial de cotizaciones antes de revertir (no se pierde en silencio).';
  END IF;
END $$;

-- Restaura el envoltorio de grants de NEX-041 (base + proveedores + fiscal + productos) y retira la función comercial.
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_runtime() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.nex_aplicar_grants_runtime_base();
  PERFORM public.nex_aplicar_grants_proveedores();
  PERFORM public.nex_aplicar_grants_fiscal();
  PERFORM public.nex_aplicar_grants_productos();
END $$;
DROP FUNCTION IF EXISTS public.nex_aplicar_grants_comercial();

DROP TRIGGER IF EXISTS tipos_cambio_inmutable_truncate_trg ON public.tipos_cambio;
DROP TRIGGER IF EXISTS tipos_cambio_inmutable_fila_trg ON public.tipos_cambio;
DROP FUNCTION IF EXISTS public.tipos_cambio_inmutable();
DROP TABLE IF EXISTS public.tipos_cambio;

DROP INDEX IF EXISTS public.canales_venta_empresa_codigo_ci_key;
DROP INDEX IF EXISTS public.canales_venta_empresa_nombre_key;
DROP INDEX IF EXISTS public.zonas_comerciales_empresa_codigo_ci_key;
DROP INDEX IF EXISTS public.zonas_comerciales_empresa_nombre_key;

-- El rol de la aplicación vuelve a SOLO LECTURA sobre canales y zonas (estado de NEX-013).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    REVOKE ALL ON public.canales_venta, public.zonas_comerciales FROM nexit_runtime;
    GRANT SELECT ON public.canales_venta, public.zonas_comerciales TO nexit_runtime;
  END IF;
END $$;
