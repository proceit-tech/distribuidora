-- REVERSIÓN manual de NEX-053 (NO es una migración: el runner no la ejecuta). Solo con autorización del responsable y con copia de seguridad previa:
--   psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-053.sql
-- Elimina el ayudante nex_aplicar_grants_clientes(). Los privilegios actuales NO se tocan; pero la próxima ejecución de nex_aplicar_grants_runtime() volverá a conceder DELETE
-- sobre cliente_documentos y a retirar INSERT de versiones y eventos (el defecto CLI-A06). Después hay que borrar la fila 'NEX-053' de schema_migrations.
DO $$
BEGIN
  IF to_regprocedure('public.nex_aplicar_grants_clientes()') IS NULL THEN
    RAISE EXCEPTION 'nex_aplicar_grants_clientes no existe: NEX-053 no está aplicada.';
  END IF;
END $$;

DROP FUNCTION public.nex_aplicar_grants_clientes();
