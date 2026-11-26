-- REVERSIÓN manual de NEX-039 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con
-- copia de seguridad previa:  psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-039.sql
-- ABORTA si alguna unidad tiene vínculo SIFEN o si el registro de reconciliación tiene filas (se perdería la equivalencia y su trazabilidad).
-- Después hay que borrar la fila 'NEX-039' de schema_migrations.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.unidades_medida WHERE unidad_sifen_codigo IS NOT NULL) THEN
    RAISE EXCEPTION 'Hay unidades con equivalencia SIFEN: expórtelas antes (no se pierde el vínculo en silencio).';
  END IF;
  IF to_regclass('public.fiscal_reconciliacion_log') IS NOT NULL AND EXISTS (SELECT 1 FROM public.fiscal_reconciliacion_log) THEN
    RAISE EXCEPTION 'fiscal_reconciliacion_log tiene filas: consérvelo antes de revertir.';
  END IF;
END $$;

-- Restaura el envoltorio de grants de NEX-037 (base + proveedores) y retira la función de permisos fiscales.
CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_runtime() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.nex_aplicar_grants_runtime_base();
  PERFORM public.nex_aplicar_grants_proveedores();
END $$;
DROP FUNCTION IF EXISTS public.nex_aplicar_grants_fiscal();

DROP TRIGGER IF EXISTS unidades_medida_espejo_sifen_trg ON public.unidades_medida;
DROP FUNCTION IF EXISTS public.unidades_medida_espejo_sifen();
DROP INDEX IF EXISTS public.unidades_medida_unidad_sifen_idx;
ALTER TABLE public.unidades_medida DROP CONSTRAINT IF EXISTS unidades_medida_unidad_sifen_fk, DROP COLUMN IF EXISTS unidad_sifen_codigo;
DROP TABLE IF EXISTS public.fiscal_reconciliacion_log;
DROP TABLE IF EXISTS public.unidades_medida_sifen;
