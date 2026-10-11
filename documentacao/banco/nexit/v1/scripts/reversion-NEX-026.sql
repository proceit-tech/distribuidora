-- REVERSIÓN manual de NEX-026 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y
-- con backup:  psql -1 -f reversion-NEX-026.sql. Elimina únicamente el catálogo; ningún dato de clientes depende de él.
-- Después, borrar la fila 'NEX-026' de schema_migrations (decisión del responsable) para poder reaplicarla.
DROP TABLE IF EXISTS public.paises_telefonia;
