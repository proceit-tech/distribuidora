-- VERIFICACIÓN POSTERIOR de NEX-083 (FK empresa_id → empresas(id) en fe_estado_previo_nex065 y fe_stock_pendientes_preparacion; NEXIT-T01-FK-R02 / PRO-363). SOLO LECTURA.
-- La ejecuta el responsable DESPUÉS de aplicar NEX-083 con el runner:
--   psql -X -v ON_ERROR_STOP=1 -f verificar-NEX-083.sql
-- Toda fila de la sección 1 debe dar ok = true. No escribe nada (transacción READ ONLY + ROLLBACK). Nada de esto fue ejecutado por Claude.
-- Ejecutar con el rol propietario del esquema (las dos tablas no tienen privilegios para PUBLIC ni nexit_runtime; las secciones de datos fallarían por permiso con otro rol).
-- Detecta: instalación incompleta; FK con el nombre correcto pero definición distinta (columnas, tabla/columna referida, ON UPDATE/ON DELETE, MATCH, diferible) o NO VALIDADA;
-- FK extra en las dos tablas; huérfanos; preparación no vacía; grants nuevos a nexit_runtime/PUBLIC; tabla incumplidora de T01 restante; registro NEX-083 ausente o con otro checksum.
-- Checksum esperado de NEX-083 (SHA-256 del archivo versionado): 88de3731ef433c28ff348659831523ef9d1ca1960e29a2b94dd49642c3c4e1cc.
-- Acciones de pg_constraint: confupdtype/confdeltype 'a' = NO ACTION; confmatchtype 's' = SIMPLE.
BEGIN READ ONLY;

\echo '== 1. Estado posterior (todas deben dar ok = true) =='
WITH esperado(tabla, fk) AS (VALUES ('fe_estado_previo_nex065', 'fe_estado_previo_nex065_empresa_fk'),
                                    ('fe_stock_pendientes_preparacion', 'fe_stock_pendientes_preparacion_empresa_fk')),
emp AS (SELECT c.oid, (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'id' AND NOT a.attisdropped) AS id_attnum
          FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname = 'empresas' AND c.relkind = 'r'),
real AS (
  SELECT e.tabla, e.fk, c.oid AS relid,
         (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'empresa_id' AND NOT a.attisdropped) AS emp_attnum,
         k.oid AS conoid, k.contype, k.conkey, k.confrelid, k.confkey, k.confupdtype, k.confdeltype, k.confmatchtype, k.condeferrable, k.condeferred, k.convalidated
    FROM esperado e
    LEFT JOIN pg_class c ON c.relnamespace = 'public'::regnamespace AND c.relname = e.tabla AND c.relkind = 'r'
    LEFT JOIN pg_constraint k ON k.conrelid = c.oid AND k.conname = e.fk
),
exacta AS (
  SELECT r.tabla FROM real r
   WHERE r.conoid IS NOT NULL AND r.contype = 'f' AND r.conkey = ARRAY[r.emp_attnum]::int2[]
     AND r.confrelid = (SELECT oid FROM emp) AND r.confkey = ARRAY[(SELECT id_attnum FROM emp)]::int2[]
     AND r.confupdtype = 'a' AND r.confdeltype = 'a' AND r.confmatchtype = 's' AND NOT r.condeferrable AND NOT r.condeferred AND r.convalidated
),
sm AS (SELECT to_regclass('public.schema_migrations') IS NOT NULL AS existe),
rt AS (SELECT to_regrole('nexit_runtime') AS oid)
SELECT orden, control, ok FROM (
  SELECT 10 + row_number() OVER (ORDER BY r.tabla) AS orden, r.fk || ' existe en public.' || r.tabla AS control, r.conoid IS NOT NULL AS ok FROM real r
  UNION ALL SELECT 20 + row_number() OVER (ORDER BY r.tabla),
    r.fk || ': definición exacta (FOREIGN KEY (empresa_id) REFERENCES public.empresas(id), NO ACTION/NO ACTION, MATCH SIMPLE, NOT DEFERRABLE) y VALIDADA',
    EXISTS (SELECT 1 FROM exacta x WHERE x.tabla = r.tabla) FROM real r
  UNION ALL SELECT 30, 'instalación completa: 2 de 2 FK con definición exacta y convalidated = true', (SELECT count(*) FROM exacta) = 2
  UNION ALL SELECT 31, 'cada tabla tiene EXACTAMENTE una FOREIGN KEY (sin duplicados con otro nombre)',
    NOT EXISTS (SELECT 1 FROM real r WHERE r.relid IS NULL OR (SELECT count(*) FROM pg_constraint k WHERE k.conrelid = r.relid AND k.contype = 'f') <> 1)
  UNION ALL SELECT 32, 'ninguna FK NOT VALID en todo public', NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.connamespace = 'public'::regnamespace AND k.contype = 'f' AND NOT k.convalidated)
  UNION ALL SELECT 40, 'PK intactas: foto (empresa_id, punto_id, tipo_documento) y preparación (txid, empresa_id, clave)',
    (SELECT array_agg(pg_get_constraintdef(k.oid)) FROM pg_constraint k WHERE k.conrelid = to_regclass('public.fe_estado_previo_nex065') AND k.contype = 'p')
      IS NOT DISTINCT FROM ARRAY['PRIMARY KEY (empresa_id, punto_id, tipo_documento)']
    AND (SELECT array_agg(pg_get_constraintdef(k.oid)) FROM pg_constraint k WHERE k.conrelid = to_regclass('public.fe_stock_pendientes_preparacion') AND k.contype = 'p')
      IS NOT DISTINCT FROM ARRAY['PRIMARY KEY (txid, empresa_id, clave)']
  UNION ALL SELECT 41, 'sin constraints nuevos distintos de PK y FK en las dos tablas (sin CHECK/UNIQUE/EXCLUDE añadidos)',
    NOT EXISTS (SELECT 1 FROM pg_constraint k JOIN real r ON r.relid = k.conrelid WHERE k.contype NOT IN ('p', 'f'))
  UNION ALL SELECT 50, 'T01 (catálogo): ninguna tabla base de public con empresa_id queda sin FK anclada en empresa_id (conkey[1])',
    NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'empresa_id' AND NOT a.attisdropped AND a.attnum > 0
                 WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND c.relname <> 'empresas'
                   AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = c.oid AND k.contype = 'f' AND k.conkey[1] = a.attnum))
  UNION ALL SELECT 60, 'foto NEX-065: 0 huérfanos (comprobación de datos, además de convalidated)',
    CASE WHEN to_regclass('public.fe_estado_previo_nex065') IS NOT NULL AND to_regclass('public.empresas') IS NOT NULL THEN (xpath('/row/ok/text()', query_to_xml(
      $q$SELECT count(*) = 0 AS ok FROM public.fe_estado_previo_nex065 f WHERE NOT EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = f.empresa_id)$q$, false, true, '')))[1]::text = 'true' ELSE false END
  UNION ALL SELECT 61, 'preparación NEX-081 vacía fuera de una emisión',
    CASE WHEN to_regclass('public.fe_stock_pendientes_preparacion') IS NOT NULL THEN (xpath('/row/ok/text()', query_to_xml(
      $q$SELECT count(*) = 0 AS ok FROM public.fe_stock_pendientes_preparacion$q$, false, true, '')))[1]::text = 'true' ELSE false END
  UNION ALL SELECT 70, 'nexit_runtime sigue SIN privilegios sobre las dos tablas (NEX-083 no concede nada; si el rol no existe, ok)',
    (SELECT oid FROM rt) IS NULL
    OR NOT EXISTS (SELECT 1 FROM real r, unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p(priv)
                    WHERE r.relid IS NOT NULL AND has_table_privilege((SELECT oid FROM rt), r.relid, p.priv))
  UNION ALL SELECT 71, 'PUBLIC sigue sin privilegios sobre las dos tablas',
    NOT EXISTS (SELECT 1 FROM real r JOIN pg_class c ON c.oid = r.relid, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x WHERE x.grantee = 0)
  UNION ALL SELECT 80, 'NEX-083 registrada en schema_migrations con el checksum del archivo versionado (88de3731…c1cc)',
    CASE WHEN (SELECT existe FROM sm) THEN (xpath('/row/ok/text()', query_to_xml(
      $q$SELECT count(*) = 1 AS ok FROM public.schema_migrations WHERE version = 'NEX-083' AND checksum = '88de3731ef433c28ff348659831523ef9d1ca1960e29a2b94dd49642c3c4e1cc'$q$, false, true, '')))[1]::text = 'true' ELSE false END
  UNION ALL SELECT 81, 'NEX-065, NEX-081 y NEX-082 siguen registradas con sus checksums',
    CASE WHEN (SELECT existe FROM sm) THEN (xpath('/row/ok/text()', query_to_xml(
      $q$SELECT count(*) = 3 AS ok FROM public.schema_migrations
          WHERE (version = 'NEX-065' AND checksum = '24537d45e715fa0d90eac571423a29236a59c5a98bfbfccd13d60a0144de133c')
             OR (version = 'NEX-081' AND checksum = '2cf6bcec9033ddb12a2e59bf0376eeb7992787f2ee8811fd4dd50db7efd8359f')
             OR (version = 'NEX-082' AND checksum = 'c57c120cfbdeeb17e375d0834913a5a8c36d670f18a0ab6fed6eedf7b80c2165')$q$, false, true, '')))[1]::text = 'true' ELSE false END
) x ORDER BY orden;

\echo '== 2. Informativo: constraints de las dos tablas, tal como las reconstruye PostgreSQL =='
SELECT c.relname AS tabla, k.conname, k.contype, k.convalidated, pg_get_constraintdef(k.oid) AS definicion
  FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
 WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('fe_estado_previo_nex065', 'fe_stock_pendientes_preparacion')
 ORDER BY c.relname, k.conname;

\echo '== 3. Informativo: filas de la foto NEX-065 (comparar con la sección 2 del preflight: deben coincidir) =='
SELECT CASE WHEN to_regclass('public.fe_estado_previo_nex065') IS NULL THEN NULL
            ELSE (xpath('/row/n/text()', query_to_xml($q$SELECT count(*) AS n FROM public.fe_estado_previo_nex065$q$, false, true, '')))[1]::text::bigint END AS filas_foto_nex065;

\echo '== 4. Informativo: registro de NEX-083 y versiones posteriores (cualquier versión > NEX-083 es inesperada al 23/11/2026 y debe revisarse) =='
SELECT CASE WHEN to_regclass('public.schema_migrations') IS NULL THEN '(schema_migrations no existe)'
            ELSE (xpath('/row/v/text()', query_to_xml($q$SELECT string_agg(version || ' ' || left(checksum, 12) || ' ' || aplicada_at::text || ' ' || aplicada_por, ' | ' ORDER BY version) AS v
                                                          FROM public.schema_migrations WHERE version >= 'NEX-083'$q$, false, true, '')))[1]::text
       END AS registro_desde_nex083;

ROLLBACK;
