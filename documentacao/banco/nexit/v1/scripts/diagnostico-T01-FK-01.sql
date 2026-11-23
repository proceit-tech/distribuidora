-- =====================================================================
-- diagnostico-T01-FK-01.sql — NEXIT-T01-FK-R01 / PRO-363 (23/11/2026)
-- Inventario EXCLUSIVAMENTE DE LECTURA del incumplimiento de T01-estructura.sql:38–45
-- («toda tabla con empresa_id tiene una FK anclada en empresa_id»).
--
-- NO EJECUTADO por Claude. Uso previsto (operador autorizado, base descartable o con autorización expresa):
--   psql -X -v ON_ERROR_STOP=1 -f documentacao/banco/nexit/v1/scripts/diagnostico-T01-FK-01.sql
-- Ejecutar con el rol propietario del esquema (o superusuario): information_schema solo muestra las
-- columnas sobre las que el rol tiene algún privilegio; por eso cada control se repite contra pg_catalog
-- y la sección 2 señala cualquier diferencia entre ambas vistas.
--
-- Garantías: transacción READ ONLY terminada en ROLLBACK; sin DDL, DML, GRANT ni SET global; los recuentos
-- dinámicos usan query_to_xml (SELECT puro) sobre tablas que el propio catálogo confirma existentes.
-- Inventario estático esperado (análisis de NEX-001..082, ver documentacao/analises/NEXIT-T01-FK-R01-*.md):
--   fe_estado_previo_nex065 (NEX-065) y fe_stock_pendientes_preparacion (NEX-081).
-- =====================================================================
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

-- 0) Contexto: rol, base, migraciones relevantes (sin leer datos de negocio).
SELECT current_user AS rol, current_database() AS base,
       current_setting('transaction_isolation') AS aislamiento,
       current_setting('transaction_read_only') AS solo_lectura,
       to_regclass('public.schema_migrations') IS NOT NULL AS hay_schema_migrations;

-- schema_migrations existe desde NEX-001 (precondición de T01, línea 20); si faltara, este SELECT falla y nada se modifica.
SELECT v.version, s.version IS NOT NULL AS registrada, s.checksum, s.aplicada_at
  FROM (VALUES ('NEX-065'), ('NEX-081'), ('NEX-082'), ('NEX-083')) v(version)
  LEFT JOIN public.schema_migrations s ON s.version = v.version
 ORDER BY v.version;

-- 1) Predicado LITERAL de T01-estructura.sql:39–45 (information_schema), listando las tablas en vez de un booleano.
SELECT 'T01_LITERAL' AS fuente, c.table_name AS tabla_incumplidora
  FROM information_schema.columns c
  JOIN information_schema.tables t ON t.table_schema = 'public' AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
 WHERE c.table_schema = 'public' AND c.column_name = 'empresa_id' AND c.table_name <> 'empresas'
   AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = ('public.' || c.table_name)::regclass AND k.contype = 'f'
                     AND k.conkey[1] = (SELECT attnum FROM pg_attribute WHERE attrelid = k.conrelid AND attname = 'empresa_id'))
 ORDER BY 2;

-- 2) Mismo criterio por pg_catalog (independiente de privilegios). Incluye tablas particionadas ('p').
--    en_information_schema = false indica que el rol no ve la tabla por information_schema (T01 la omitiría).
WITH tablas AS (
  SELECT cl.oid, cl.relname, cl.relkind, cl.relpersistence, a.attnum, a.attnotnull, format_type(a.atttypid, a.atttypmod) AS tipo
    FROM pg_class cl
    JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attname = 'empresa_id' AND NOT a.attisdropped AND a.attnum > 0
   WHERE cl.relkind IN ('r', 'p') AND cl.relname <> 'empresas'
)
SELECT 'PG_CATALOG' AS fuente, t.relname AS tabla_incumplidora, t.relkind, t.relpersistence, t.tipo AS tipo_empresa_id,
       t.attnotnull AS empresa_id_not_null,
       EXISTS (SELECT 1 FROM information_schema.columns ic WHERE ic.table_schema = 'public' AND ic.table_name = t.relname AND ic.column_name = 'empresa_id') AS en_information_schema,
       (SELECT pg_get_constraintdef(p.oid) FROM pg_constraint p WHERE p.conrelid = t.oid AND p.contype = 'p') AS clave_primaria,
       (SELECT count(*) FROM pg_constraint f WHERE f.conrelid = t.oid AND f.contype = 'f') AS fks_totales
  FROM tablas t
 WHERE NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = t.oid AND k.contype = 'f' AND k.conkey[1] = t.attnum)
 ORDER BY t.relname;

-- 3) Cobertura completa: toda tabla public con empresa_id y sus FK ANCLADAS en empresa_id (conkey[1]),
--    con columnas locales/remotas, tabla referida, validez, diferibilidad y acciones.
SELECT cl.relname AS tabla,
       k.conname AS fk,
       ARRAY(SELECT a.attname FROM unnest(k.conkey) WITH ORDINALITY u(n, o) JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = u.n ORDER BY u.o) AS conkey_columnas,
       k.conkey, k.confrelid::regclass AS referida,
       ARRAY(SELECT a.attname FROM unnest(k.confkey) WITH ORDINALITY u(n, o) JOIN pg_attribute a ON a.attrelid = k.confrelid AND a.attnum = u.n ORDER BY u.o) AS confkey_columnas,
       k.confkey, k.convalidated, k.condeferrable, k.condeferred, k.confupdtype, k.confdeltype, k.confmatchtype,
       (k.confrelid = 'public.empresas'::regclass) AS hacia_empresas
  FROM pg_class cl
  JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
  JOIN pg_attribute ea ON ea.attrelid = cl.oid AND ea.attname = 'empresa_id' AND NOT ea.attisdropped AND ea.attnum > 0
  LEFT JOIN pg_constraint k ON k.conrelid = cl.oid AND k.contype = 'f' AND k.conkey[1] = ea.attnum
 WHERE cl.relkind IN ('r', 'p') AND cl.relname <> 'empresas'
 ORDER BY cl.relname, k.conname;

-- 4) FK ancladas en empresa_id NO VALIDADAS (convalidated = false): T01 las cuenta como presentes,
--    pero no prueban integridad. Deben ser 0 filas para cualquier cierre.
SELECT cl.relname AS tabla, k.conname AS fk_no_validada, pg_get_constraintdef(k.oid) AS definicion
  FROM pg_constraint k
  JOIN pg_class cl ON cl.oid = k.conrelid
  JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
  JOIN pg_attribute ea ON ea.attrelid = cl.oid AND ea.attname = 'empresa_id' AND ea.attnum = k.conkey[1]
 WHERE k.contype = 'f' AND NOT k.convalidated
 ORDER BY 1, 2;

-- 5) Recuentos agregados de cada tabla incumplidora (filas, empresas distintas, empresa_id NULL y huérfanos
--    respecto de empresas.id). Solo SELECT vía query_to_xml; no se muestran valores de filas.
WITH incumplidoras AS (
  SELECT cl.relname
    FROM pg_class cl
    JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attname = 'empresa_id' AND NOT a.attisdropped AND a.attnum > 0
   WHERE cl.relkind IN ('r', 'p') AND cl.relname <> 'empresas'
     AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = cl.oid AND k.contype = 'f' AND k.conkey[1] = a.attnum)
)
SELECT i.relname AS tabla,
       (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', i.relname), false, true, '')))[1]::text::bigint AS filas,
       (xpath('/row/n/text()', query_to_xml(format('SELECT count(DISTINCT empresa_id) AS n FROM public.%I', i.relname), false, true, '')))[1]::text::bigint AS empresas_distintas,
       (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I WHERE empresa_id IS NULL', i.relname), false, true, '')))[1]::text::bigint AS empresa_id_nulos,
       (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I x WHERE x.empresa_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = x.empresa_id)', i.relname), false, true, '')))[1]::text::bigint AS huerfanos
  FROM incumplidoras i
 ORDER BY 1;

-- 6) Referencia empresas(id): debe existir PK/UNIQUE válida sobre (id) para cualquier FK futura.
SELECT 'empresas(id) clave referenciable' AS control,
       EXISTS (SELECT 1 FROM pg_constraint p WHERE p.conrelid = 'public.empresas'::regclass AND p.contype IN ('p', 'u')
                 AND p.conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.empresas'::regclass AND attname = 'id')]::int2[]) AS ok;

-- 7) Contraste con el inventario estático (NEX-001..082): exactamente las dos tablas esperadas, ninguna más, ninguna menos.
WITH encontradas AS (
  SELECT cl.relname
    FROM pg_class cl
    JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attname = 'empresa_id' AND NOT a.attisdropped AND a.attnum > 0
   WHERE cl.relkind IN ('r', 'p') AND cl.relname <> 'empresas'
     AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = cl.oid AND k.contype = 'f' AND k.conkey[1] = a.attnum)
), esperadas(relname) AS (VALUES ('fe_estado_previo_nex065'), ('fe_stock_pendientes_preparacion'))
SELECT coalesce(e.relname, x.relname) AS tabla,
       CASE WHEN e.relname IS NULL THEN 'NO_ESPERADA (fuera del inventario estático: revisar)'
            WHEN x.relname IS NULL THEN 'ESPERADA_AUSENTE (ya corregida o esquema distinto: revisar)'
            ELSE 'ESPERADA_PRESENTE' END AS clasificacion
  FROM esperadas e FULL JOIN encontradas x ON x.relname = e.relname
 ORDER BY 2, 1;

ROLLBACK;
