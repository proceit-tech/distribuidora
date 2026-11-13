-- REVERSIÓN manual de NEX-044 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con
-- copia de seguridad previa:  psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-044.sql
-- ABORTA si alguna familia ya tiene categoría asignada (se perdería la clasificación manual). Después hay que borrar la fila 'NEX-044' de schema_migrations.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'familias_producto' AND column_name = 'categoria_id') THEN
    RAISE EXCEPTION 'familias_producto.categoria_id no existe: NEX-044 no está aplicada.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.familias_producto WHERE categoria_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Hay familias con categoría asignada: expórtelas antes de revertir (no se pierde la clasificación en silencio).';
  END IF;
END $$;

DROP TRIGGER IF EXISTS familias_categoria_sin_incoherencia_trg ON public.familias_producto;
DROP TRIGGER IF EXISTS productos_jerarquia_coherente_trg ON public.productos;
DROP FUNCTION IF EXISTS public.familias_categoria_sin_incoherencia();
DROP FUNCTION IF EXISTS public.productos_jerarquia_coherente();
DROP INDEX IF EXISTS public.familias_producto_categoria_idx;
ALTER TABLE public.familias_producto
  DROP CONSTRAINT IF EXISTS familias_producto_categoria_fk,
  DROP COLUMN IF EXISTS categoria_id;
