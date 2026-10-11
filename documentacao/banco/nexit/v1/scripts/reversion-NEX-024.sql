-- REVERSIÓN manual de NEX-024 (NO es una migración: el runner no la ejecuta). Ejecutar SOLO con autorización del
-- responsable y con backup:  psql -1 -f reversion-NEX-024.sql. Elimina los DDI guardados (los números nacionales quedan).
-- Después, borrar la fila 'NEX-024' de schema_migrations (decisión del responsable) para poder reaplicarla.
ALTER TABLE public.clientes
  DROP CONSTRAINT IF EXISTS clientes_telefono_ddi_chk,
  DROP CONSTRAINT IF EXISTS clientes_celular_ddi_chk,
  DROP COLUMN IF EXISTS telefono_ddi,
  DROP COLUMN IF EXISTS celular_ddi;
