-- REVERSIÓN manual de NEX-030 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con
-- copia de seguridad previa:  psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-030.sql
-- Elimina la columna de estado; clientes.creado_por (NEX-005) permanece. Después de revertir, el código que usa la columna dejará
-- de funcionar: revertir primero el despliegue de la aplicación o dejar la migración aplicada.
ALTER TABLE public.clientes DROP COLUMN IF EXISTS carga_documentos_inicial_abierta;
