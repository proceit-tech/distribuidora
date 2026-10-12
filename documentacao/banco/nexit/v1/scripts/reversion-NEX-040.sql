-- REVERSIÓN manual de NEX-040 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con
-- copia de seguridad previa:  psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-040.sql
-- ABORTA si algún producto ya tiene clasificación IVA (se perdería). Después hay que borrar la fila 'NEX-040' de schema_migrations.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.productos WHERE afectacion_iva IS NOT NULL OR proporcion_gravada_iva IS NOT NULL) THEN
    RAISE EXCEPTION 'Hay productos con clasificación IVA: expórtela antes (no se pierde en silencio).';
  END IF;
END $$;

DROP TRIGGER IF EXISTS impuestos_tasa_en_uso_trg ON public.impuestos;
DROP FUNCTION IF EXISTS public.impuestos_tasa_en_uso();
DROP TRIGGER IF EXISTS productos_iva_coherencia_trg ON public.productos;
DROP FUNCTION IF EXISTS public.productos_iva_coherencia();
ALTER TABLE public.productos
  DROP CONSTRAINT IF EXISTS productos_iva_coherencia_chk,
  DROP CONSTRAINT IF EXISTS productos_proporcion_iva_chk,
  DROP CONSTRAINT IF EXISTS productos_afectacion_iva_chk,
  DROP COLUMN IF EXISTS proporcion_gravada_iva,
  DROP COLUMN IF EXISTS afectacion_iva;
