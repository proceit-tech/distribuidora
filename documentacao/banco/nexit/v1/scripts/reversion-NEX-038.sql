-- REVERSIÓN manual de NEX-038 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con
-- copia de seguridad previa:  psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-038.sql
-- No pierde datos. Después hay que borrar la fila 'NEX-038' de schema_migrations.
DROP TRIGGER IF EXISTS productos_codigo_inmutable_trg ON public.productos;
DROP FUNCTION IF EXISTS public.productos_codigo_inmutable();
