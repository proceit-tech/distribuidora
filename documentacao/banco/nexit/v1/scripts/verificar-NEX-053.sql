-- VERIFICACIÓN de NEX-053 (CLI-A06). Cada fila debe dar «ok» = true.
-- PARTE 1 (solo lectura): estado actual de los privilegios del rol de la aplicación sobre los documentos de clientes.
SELECT 'ayudante instalado' AS control, to_regprocedure('public.nex_aplicar_grants_clientes()') IS NOT NULL AS ok
UNION ALL SELECT 'documentos: INSERT y UPDATE, sin DELETE', NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime')
       OR (has_table_privilege('nexit_runtime', 'public.cliente_documentos', 'INSERT') AND has_table_privilege('nexit_runtime', 'public.cliente_documentos', 'UPDATE') AND NOT has_table_privilege('nexit_runtime', 'public.cliente_documentos', 'DELETE'))
UNION ALL SELECT 'versiones: SELECT e INSERT, sin UPDATE/DELETE', NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime')
       OR (has_table_privilege('nexit_runtime', 'public.cliente_documento_versiones', 'SELECT') AND has_table_privilege('nexit_runtime', 'public.cliente_documento_versiones', 'INSERT')
           AND NOT has_table_privilege('nexit_runtime', 'public.cliente_documento_versiones', 'UPDATE') AND NOT has_table_privilege('nexit_runtime', 'public.cliente_documento_versiones', 'DELETE'))
UNION ALL SELECT 'eventos: SELECT e INSERT, sin UPDATE/DELETE', NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime')
       OR (has_table_privilege('nexit_runtime', 'public.cliente_documento_eventos', 'SELECT') AND has_table_privilege('nexit_runtime', 'public.cliente_documento_eventos', 'INSERT')
           AND NOT has_table_privilege('nexit_runtime', 'public.cliente_documento_eventos', 'UPDATE') AND NOT has_table_privilege('nexit_runtime', 'public.cliente_documento_eventos', 'DELETE'));

-- PARTE 2 (SOLO EN UN ENTORNO DE PRUEBA SEGURO, no en producción): reaplicar el envoltorio y repetir la PARTE 1; el resultado debe ser idéntico.
--   SELECT public.nex_aplicar_grants_runtime();
