-- REVERSIÓN manual de NEX-033 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con
-- copia de seguridad previa:  psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-033.sql
-- ABORTA si existe algún nombre de más de 200 caracteres (nunca trunca). Después hay que borrar la fila 'NEX-033' de schema_migrations.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.proveedores WHERE char_length(razon_social) > 200 OR char_length(nombre_fantasia) > 200) THEN
    RAISE EXCEPTION 'Reversión abortada: hay razón social o nombre de fantasía con más de 200 caracteres (no se trunca).';
  END IF;
END $$;

DROP TRIGGER IF EXISTS proveedores_codigo_inmutable_trg ON public.proveedores;
DROP FUNCTION IF EXISTS public.proveedores_codigo_inmutable();

ALTER TABLE public.proveedores DROP CONSTRAINT IF EXISTS proveedores_legal_nombre_chk;
ALTER TABLE public.proveedores DROP CONSTRAINT IF EXISTS proveedores_trade_nombre_chk;
ALTER TABLE public.proveedores
  ADD CONSTRAINT proveedores_legal_nombre_chk CHECK (length(btrim(razon_social)) > 0 AND char_length(razon_social) <= 200),
  ADD CONSTRAINT proveedores_trade_nombre_chk CHECK (char_length(nombre_fantasia) <= 200);
