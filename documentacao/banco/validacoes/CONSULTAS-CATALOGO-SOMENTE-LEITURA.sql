-- DistribuNex — catálogo somente leitura, NÃO testa a aplicação nem altera dados.
-- Executar após confirmar servidor/database e permissão somente leitura.
-- Lista tabelas do schema public; revisar schemas reais antes de usar.
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema')
ORDER BY table_schema, table_name;

-- Campos por tabela, com tipos e nulidade
SELECT table_schema, table_name, ordinal_position, column_name,
       data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog','information_schema')
ORDER BY table_schema, table_name, ordinal_position;

-- Constraints
SELECT n.nspname AS schema_name, c.conrelid::regclass AS table_name,
       c.conname AS constraint_name, c.contype AS constraint_type,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema')
ORDER BY schema_name, table_name, constraint_name;
