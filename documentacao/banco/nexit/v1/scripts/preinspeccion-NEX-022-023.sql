-- Pre-inspección SOLO LECTURA para NEX-022 / NEX-023. No modifica nada.  Uso: psql -X -f preinspeccion-NEX-022-023.sql
-- Revisar el resultado ANTES de aplicar (con backup): si algo difiere de lo esperado, no aplicar.

\echo '== 1) Migraciones ya registradas (NEX-021 debe estar aplicada; NEX-022/023 no)'
SELECT version, aplicada_at FROM schema_migrations WHERE version >= 'NEX-020' ORDER BY version;

\echo '== 2) Tipos actuales de las columnas (esperado antes: 200 y 200)'
SELECT column_name, data_type, character_maximum_length
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'clientes' AND column_name IN ('razon_social', 'nombre_fantasia');

\echo '== 3) Vistas que leen esas columnas y sus dependientes (drift: comparar con NEX-011; NO debe haber materializadas)'
WITH RECURSIVE dep(oid_vista, nivel) AS (
  SELECT DISTINCT c.oid, 1
    FROM pg_depend d JOIN pg_rewrite rw ON rw.oid = d.objid JOIN pg_class c ON c.oid = rw.ev_class
    JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
   WHERE d.classid = 'pg_rewrite'::regclass AND d.refclassid = 'pg_class'::regclass
     AND d.refobjid = 'public.clientes'::regclass AND a.attname IN ('razon_social', 'nombre_fantasia')
     AND c.relkind IN ('v', 'm')
  UNION
  SELECT c2.oid, dep.nivel + 1
    FROM dep JOIN pg_depend d2 ON d2.refobjid = dep.oid_vista AND d2.classid = 'pg_rewrite'::regclass AND d2.refclassid = 'pg_class'::regclass
    JOIN pg_rewrite rw2 ON rw2.oid = d2.objid JOIN pg_class c2 ON c2.oid = rw2.ev_class
   WHERE c2.oid <> dep.oid_vista AND c2.relkind IN ('v', 'm')
)
SELECT n.nspname AS esquema, c.relname AS vista, c.relkind AS tipo, max(dep.nivel) AS nivel,
       pg_get_userbyid(c.relowner) AS propietario, c.reloptions AS opciones, c.relacl AS privilegios
  FROM dep JOIN pg_class c ON c.oid = dep.oid_vista JOIN pg_namespace n ON n.oid = c.relnamespace
 GROUP BY n.nspname, c.relname, c.relkind, c.relowner, c.reloptions, c.relacl
 ORDER BY nivel, vista;

\echo '== 4) Clientes Innominado por empresa (NEX-023 exige como máximo 1 por empresa; listar duplicados)'
SELECT empresa_id, count(*) AS innominados FROM clientes WHERE tipo_documento = 'INNOMINADO' GROUP BY empresa_id ORDER BY innominados DESC;

\echo '== 5) Valores existentes más largos que los límites nuevos de aplicación (informativo; NEX-022 no los modifica)'
SELECT count(*) FILTER (WHERE length(razon_social) > 200) AS razon_gt200, max(length(razon_social)) AS razon_max,
       max(length(nombre_fantasia)) AS fantasia_max
  FROM clientes;
