-- REVERSIÓN manual de NEX-043 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con
-- copia de seguridad previa:  psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-043.sql
-- ABORTA si alguna unidad de medida está vinculada a un código 111–140 (se perdería la equivalencia). Retira solo esas 30 filas con fuente
-- 'NT023-T5'; las 34 de NEX-039 quedan intactas. Después hay que borrar la fila 'NEX-043' de schema_migrations.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.unidades_medida WHERE unidad_sifen_codigo BETWEEN 111 AND 140) THEN
    RAISE EXCEPTION 'Hay unidades de medida vinculadas a códigos SIFEN 111–140: desvincúlelas o expórtelas antes (no se pierde el vínculo en silencio).';
  END IF;
END $$;

DELETE FROM public.unidades_medida_sifen WHERE codigo BETWEEN 111 AND 140 AND fuente = 'NT023-T5';
