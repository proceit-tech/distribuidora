-- REVERSIÓN manual de NEX-029 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con
-- copia de seguridad previa:  psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-029.sql
-- ABORTA si la tabla de auditoría tiene filas: es el único registro de las tasas aplicadas y no se descarta en silencio
-- (exportarla antes y decidir explícitamente). No hay reversión parcial. Los límites ya convertidos en clientes NO se deshacen.
DO $$
BEGIN
  IF to_regclass('public.cliente_conversiones_moneda') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.cliente_conversiones_moneda) THEN
    RAISE EXCEPTION 'cliente_conversiones_moneda contiene auditoría de conversiones: expórtela antes de revertir NEX-029.';
  END IF;
END $$;

DROP TABLE IF EXISTS public.cliente_conversiones_moneda;
