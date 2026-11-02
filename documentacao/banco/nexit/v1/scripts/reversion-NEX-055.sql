-- REVERSIÓN manual de NEX-055 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con copia de seguridad previa:
--   psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-055.sql
-- Elimina EXACTAMENTE los tres triggers de actualizado_at que NEX-055 instaló (fe_gateway_config, documentos_electronicos, fe_puntos_expedicion). NEX-055 aborta si alguno ya existía, por lo
-- que esta reversión nunca borra un trigger preexistente. No toca datos ni otras tablas. Después hay que borrar la fila 'NEX-055' de schema_migrations.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fe_gateway_config', 'documentos_electronicos', 'fe_puntos_expedicion'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = ('public.' || t)::regclass AND g.tgname = t || '_actualizado_trg') THEN
      RAISE EXCEPTION 'reversion NEX-055: % no tiene el trigger %_actualizado_trg: NEX-055 no está aplicada.', t, t;
    END IF;
  END LOOP;
END $$;

DROP TRIGGER fe_gateway_config_actualizado_trg ON public.fe_gateway_config;
DROP TRIGGER documentos_electronicos_actualizado_trg ON public.documentos_electronicos;
DROP TRIGGER fe_puntos_expedicion_actualizado_trg ON public.fe_puntos_expedicion;
