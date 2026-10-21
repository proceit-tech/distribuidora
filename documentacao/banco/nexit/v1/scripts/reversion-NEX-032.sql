-- REVERSIÓN manual de NEX-032 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con
-- copia de seguridad previa:  psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-032.sql
-- ABORTA si algún cliente ya tiene día del mes de entrega (se perdería un dato del usuario): exportarlo antes.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.clientes WHERE dia_mes_entrega IS NOT NULL) THEN
    RAISE EXCEPTION 'Hay clientes con dia_mes_entrega: exporte esos datos antes de revertir NEX-032.';
  END IF;
END $$;

ALTER TABLE public.clientes
  DROP CONSTRAINT IF EXISTS clientes_dia_mes_entrega_chk,
  DROP COLUMN IF EXISTS dia_mes_entrega;
