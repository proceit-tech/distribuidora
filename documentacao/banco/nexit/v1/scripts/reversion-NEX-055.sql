-- REVERSIÓN manual de NEX-055 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con copia de seguridad previa:
--   psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-055.sql
-- Elimina los triggers de actualizado_at que NEX-055 instaló en las tablas de Facturación (fe_gateway_config, documentos_electronicos, fe_puntos_expedicion); no toca datos.
-- Si NEX-055 informó (NOTICE) otras tablas, elimine también su <tabla>_actualizado_trg. Después hay que borrar la fila 'NEX-055' de schema_migrations.
DROP TRIGGER IF EXISTS fe_gateway_config_actualizado_trg ON public.fe_gateway_config;
DROP TRIGGER IF EXISTS documentos_electronicos_actualizado_trg ON public.documentos_electronicos;
DROP TRIGGER IF EXISTS fe_puntos_expedicion_actualizado_trg ON public.fe_puntos_expedicion;
