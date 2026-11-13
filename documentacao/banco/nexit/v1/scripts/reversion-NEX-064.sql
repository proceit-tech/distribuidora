-- REVERSIÓN manual de NEX-064 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con copia de seguridad previa:
--   psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-064.sql
-- Elimina únicamente la función de alta fiscal única fe_punto_alta_tipo y su ayudante de privilegios. NO toca puntos, secuencias, documentos ni NEX-063. Volver al código anterior de la aplicación
-- (que registra el punto y configura el tipo en dos llamadas). Después hay que borrar la fila 'NEX-064' de schema_migrations.
DO $$
BEGIN
  IF to_regclass('public.fe_estado_previo_nex065') IS NOT NULL THEN
    RAISE EXCEPTION 'REVERSIÓN ABORTADA: NEX-065 sigue aplicada y reemplazó fe_punto_alta_tipo. Revierta primero scripts/reversion-NEX-065.sql (orden inverso al de aplicación).';
  END IF;
  IF to_regprocedure('public.fe_punto_alta_tipo(uuid,uuid,uuid,text,text,text,text,integer,boolean,boolean)') IS NULL THEN
    RAISE EXCEPTION 'NEX-064 no está aplicada (fe_punto_alta_tipo no existe): nada que revertir.';
  END IF;
END $$;

DROP FUNCTION public.nex_aplicar_grants_facturacion_alta_tipo();
DROP FUNCTION public.fe_punto_alta_tipo(uuid, uuid, uuid, text, text, text, text, integer, boolean, boolean);
