-- PRE-VERIFICACIÓN de NEX-083 (FK empresa_id → empresas(id) en fe_estado_previo_nex065 y fe_stock_pendientes_preparacion; NEXIT-T01-FK-R02 / PRO-363). SOLO LECTURA.
-- La ejecuta el responsable, con autorización expresa y en la ventana prevista, ANTES de aplicar NEX-083 con el runner:
--   psql -X -v ON_ERROR_STOP=1 -f preflight-NEX-083.sql
-- Cualquier fila con ok = false en la sección 1 significa NO APLICAR hasta conciliar. No escribe nada (transacción READ ONLY + ROLLBACK). Nada de esto fue ejecutado por Claude.
-- No hace SELECT directo de tablas que pueden no existir: las dos tablas se consultan por catálogo (pg_class/pg_attribute/pg_constraint) y sus datos solo vía query_to_xml dentro de CASE
-- (la consulta no se evalúa cuando la tabla falta). schema_migrations se lee igual. No muestra valores de empresa_id ni de las filas: solo conteos.
-- Ambas tablas tienen REVOKE ALL para PUBLIC y nexit_runtime: ejecutar con el rol propietario del esquema (el mismo que usará el runner); con otro rol las secciones de datos fallan por permiso.
-- Checksums esperados (SHA-256 de los archivos de la rama al 23/11/2026): NEX-065 24537d45…, NEX-081 2cf6bcec…, NEX-082 c57c120c… (valor completo en cada control).
BEGIN READ ONLY;

\echo '== 1. Dependencias, estructura, inventario T01 e integridad (todas deben dar ok = true) =='
WITH tablas(nombre) AS (VALUES ('fe_estado_previo_nex065'), ('fe_stock_pendientes_preparacion')),
rel AS (
  SELECT t.nombre, c.oid, c.relkind, c.relowner FROM tablas t
    LEFT JOIN pg_class c ON c.relnamespace = 'public'::regnamespace AND c.relname = t.nombre
),
emp AS (SELECT c.oid FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname = 'empresas' AND c.relkind = 'r'),
sm AS (SELECT to_regclass('public.schema_migrations') IS NOT NULL AS existe),
foto AS (SELECT coalesce((SELECT r.relkind = 'r' FROM rel r WHERE r.nombre = 'fe_estado_previo_nex065'), false) AND EXISTS (SELECT 1 FROM emp) AS existe),
prep AS (SELECT coalesce((SELECT r.relkind = 'r' FROM rel r WHERE r.nombre = 'fe_stock_pendientes_preparacion'), false) AS existe),
cols AS (
  SELECT r.nombre, ARRAY(SELECT a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
                           FROM pg_attribute a WHERE a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum) AS def
    FROM rel r
),
pk AS (
  SELECT r.nombre, (SELECT array_agg(pg_get_constraintdef(k.oid)) FROM pg_constraint k WHERE k.conrelid = r.oid AND k.contype = 'p') AS def FROM rel r
),
sin_fk AS (
  SELECT coalesce(array_agg(c.relname::text ORDER BY c.relname), '{}') AS lista
    FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'empresa_id' AND NOT a.attisdropped AND a.attnum > 0
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND c.relname <> 'empresas'
     AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = c.oid AND k.contype = 'f' AND k.conkey[1] = a.attnum)
)
SELECT orden, control, ok FROM (
  SELECT 1 AS orden, 'schema_migrations existe (NEX-001)' AS control, (SELECT existe FROM sm) AS ok
  UNION ALL SELECT 2, 'NEX-065 registrada con checksum 24537d45e715fa0d90eac571423a29236a59c5a98bfbfccd13d60a0144de133c',
    CASE WHEN (SELECT existe FROM sm) THEN (xpath('/row/ok/text()', query_to_xml(
      $q$SELECT count(*) = 1 AS ok FROM public.schema_migrations WHERE version = 'NEX-065' AND checksum = '24537d45e715fa0d90eac571423a29236a59c5a98bfbfccd13d60a0144de133c'$q$, false, true, '')))[1]::text = 'true' ELSE false END
  UNION ALL SELECT 3, 'NEX-081 registrada con checksum 2cf6bcec9033ddb12a2e59bf0376eeb7992787f2ee8811fd4dd50db7efd8359f',
    CASE WHEN (SELECT existe FROM sm) THEN (xpath('/row/ok/text()', query_to_xml(
      $q$SELECT count(*) = 1 AS ok FROM public.schema_migrations WHERE version = 'NEX-081' AND checksum = '2cf6bcec9033ddb12a2e59bf0376eeb7992787f2ee8811fd4dd50db7efd8359f'$q$, false, true, '')))[1]::text = 'true' ELSE false END
  UNION ALL SELECT 4, 'NEX-082 registrada con checksum c57c120cfbdeeb17e375d0834913a5a8c36d670f18a0ab6fed6eedf7b80c2165 (debe aplicarse ANTES que NEX-083)',
    CASE WHEN (SELECT existe FROM sm) THEN (xpath('/row/ok/text()', query_to_xml(
      $q$SELECT count(*) = 1 AS ok FROM public.schema_migrations WHERE version = 'NEX-082' AND checksum = 'c57c120cfbdeeb17e375d0834913a5a8c36d670f18a0ab6fed6eedf7b80c2165'$q$, false, true, '')))[1]::text = 'true' ELSE false END
  UNION ALL SELECT 5, 'NEX-083 NO registrada y ninguna versión NEX posterior registrada',
    CASE WHEN (SELECT existe FROM sm) THEN (xpath('/row/ok/text()', query_to_xml(
      $q$SELECT count(*) = 0 AS ok FROM public.schema_migrations WHERE version ~ '^NEX-[0-9]{3}$' AND version >= 'NEX-083'$q$, false, true, '')))[1]::text = 'true' ELSE false END
  UNION ALL SELECT 10 + row_number() OVER (ORDER BY r.nombre), 'public.' || r.nombre || ' existe como tabla base (relkind r)', coalesce(r.relkind = 'r', false) FROM rel r
  UNION ALL SELECT 13, 'public.empresas existe como tabla base', EXISTS (SELECT 1 FROM emp)
  UNION ALL SELECT 20, 'fe_estado_previo_nex065: columnas exactas de NEX-065 (empresa_id, punto_id, tipo_documento, punto_activo, secuencia_activo, efectivo_previo, migrado_at; NOT NULL)',
    (SELECT def FROM cols WHERE nombre = 'fe_estado_previo_nex065') = ARRAY['empresa_id uuid NOT NULL', 'punto_id uuid NOT NULL', 'tipo_documento text NOT NULL',
      'punto_activo boolean NOT NULL', 'secuencia_activo boolean NOT NULL', 'efectivo_previo boolean NOT NULL', 'migrado_at timestamp with time zone NOT NULL']
  UNION ALL SELECT 21, 'fe_stock_pendientes_preparacion: columnas exactas de NEX-081 (txid bigint, empresa_id uuid, clave text, pendientes jsonb; NOT NULL)',
    (SELECT def FROM cols WHERE nombre = 'fe_stock_pendientes_preparacion') = ARRAY['txid bigint NOT NULL', 'empresa_id uuid NOT NULL', 'clave text NOT NULL', 'pendientes jsonb NOT NULL']
  UNION ALL SELECT 22, 'PK de la foto NEX-065 = (empresa_id, punto_id, tipo_documento)',
    (SELECT def FROM pk WHERE nombre = 'fe_estado_previo_nex065') IS NOT DISTINCT FROM ARRAY['PRIMARY KEY (empresa_id, punto_id, tipo_documento)']
  UNION ALL SELECT 23, 'PK de la preparación NEX-081 = (txid, empresa_id, clave)',
    (SELECT def FROM pk WHERE nombre = 'fe_stock_pendientes_preparacion') IS NOT DISTINCT FROM ARRAY['PRIMARY KEY (txid, empresa_id, clave)']
  UNION ALL SELECT 24, 'public.empresas(id) es uuid y PK de una sola columna (referenciable)',
    EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = (SELECT oid FROM emp) AND a.attname = 'id' AND NOT a.attisdropped AND a.atttypid = 'uuid'::regtype)
    AND EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = (SELECT oid FROM emp) AND k.contype = 'p'
                  AND k.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = (SELECT oid FROM emp) AND a.attname = 'id')]::int2[])
  UNION ALL SELECT 30, 'ninguna FOREIGN KEY existente en las dos tablas (sin estado parcial ni instalación manual)',
    NOT EXISTS (SELECT 1 FROM pg_constraint k JOIN rel r ON r.oid = k.conrelid WHERE k.contype = 'f')
  UNION ALL SELECT 31, 'nombres libres: fe_estado_previo_nex065_empresa_fk y fe_stock_pendientes_preparacion_empresa_fk no existen en public',
    NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.connamespace = 'public'::regnamespace
                  AND k.conname IN ('fe_estado_previo_nex065_empresa_fk', 'fe_stock_pendientes_preparacion_empresa_fk'))
  UNION ALL SELECT 40, 'inventario T01 (catálogo): las tablas con empresa_id sin FK anclada son EXACTAMENTE fe_estado_previo_nex065 y fe_stock_pendientes_preparacion',
    (SELECT lista FROM sin_fk) = ARRAY['fe_estado_previo_nex065', 'fe_stock_pendientes_preparacion']
  UNION ALL SELECT 50, 'rol actual dueño (o miembro del rol dueño) de las dos tablas (ALTER TABLE lo exige)',
    NOT EXISTS (SELECT 1 FROM rel r WHERE r.oid IS NULL OR NOT pg_has_role(current_user, r.relowner, 'USAGE'))
  UNION ALL SELECT 51, 'rol actual con privilegio REFERENCES sobre public.empresas',
    EXISTS (SELECT 1 FROM emp) AND has_table_privilege(current_user, (SELECT oid FROM emp), 'REFERENCES')
  UNION ALL SELECT 60, 'foto NEX-065: 0 filas con empresa_id nulo o sin empresa (se CONSERVAN todas sus filas; no se exige vacía)',
    CASE WHEN (SELECT existe FROM foto) THEN (xpath('/row/ok/text()', query_to_xml(
      $q$SELECT count(*) = 0 AS ok FROM public.fe_estado_previo_nex065 f WHERE f.empresa_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = f.empresa_id)$q$, false, true, '')))[1]::text = 'true' ELSE false END
  UNION ALL SELECT 61, 'preparación NEX-081 VACÍA ahora (la migración lo vuelve a exigir bajo bloqueo; si hay filas, hay una emisión en curso o un estado anómalo)',
    CASE WHEN (SELECT existe FROM prep) THEN (xpath('/row/ok/text()', query_to_xml(
      $q$SELECT count(*) = 0 AS ok FROM public.fe_stock_pendientes_preparacion$q$, false, true, '')))[1]::text = 'true' ELSE false END
  UNION ALL SELECT 70, 'lock_timeout de sesión no es 5s (el runner fija 5s con SET LOCAL dentro de su transacción; esto solo descarta un entorno raro)', current_setting('lock_timeout') <> '5s'
) x ORDER BY orden;

\echo '== 2. Informativo: conteos (sin valores). La foto NEX-065 debe conservar este número de filas después de NEX-083 =='
SELECT 'fe_estado_previo_nex065' AS tabla,
       CASE WHEN to_regclass('public.fe_estado_previo_nex065') IS NULL THEN NULL
            ELSE (xpath('/row/n/text()', query_to_xml($q$SELECT count(*) AS n FROM public.fe_estado_previo_nex065$q$, false, true, '')))[1]::text::bigint END AS filas,
       CASE WHEN to_regclass('public.fe_estado_previo_nex065') IS NULL THEN NULL
            ELSE (xpath('/row/n/text()', query_to_xml($q$SELECT count(DISTINCT empresa_id) AS n FROM public.fe_estado_previo_nex065$q$, false, true, '')))[1]::text::bigint END AS empresas_distintas
UNION ALL
SELECT 'fe_stock_pendientes_preparacion',
       CASE WHEN to_regclass('public.fe_stock_pendientes_preparacion') IS NULL THEN NULL
            ELSE (xpath('/row/n/text()', query_to_xml($q$SELECT count(*) AS n FROM public.fe_stock_pendientes_preparacion$q$, false, true, '')))[1]::text::bigint END,
       NULL;

\echo '== 3. Informativo: constraints actuales de las dos tablas (antes de NEX-083 solo debe verse la PRIMARY KEY de cada una) =='
SELECT c.relname AS tabla, k.conname, k.contype, pg_get_constraintdef(k.oid) AS definicion, k.convalidated
  FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
 WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('fe_estado_previo_nex065', 'fe_stock_pendientes_preparacion')
 ORDER BY c.relname, k.conname;

\echo '== 4. Informativo: actividad que bloquearía ADD FOREIGN KEY (SHARE ROW EXCLUSIVE en las dos tablas y en empresas). En la ventana: sin emisión FE/NCE ni alta/edición de empresas =='
SELECT l.relation::regclass AS tabla, l.mode, l.granted, a.pid, a.state, a.xact_start, left(a.query, 120) AS consulta
  FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
 WHERE l.locktype = 'relation' AND a.pid <> pg_backend_pid()
   AND l.relation IN (SELECT c.oid FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('fe_estado_previo_nex065', 'fe_stock_pendientes_preparacion', 'empresas'))
   AND l.mode IN ('RowExclusiveLock', 'ShareUpdateExclusiveLock', 'ShareLock', 'ShareRowExclusiveLock', 'ExclusiveLock', 'AccessExclusiveLock')
 ORDER BY a.xact_start;

\echo '== 5. Informativo: últimas migraciones registradas (NEX-083 debe faltar; la última esperada es NEX-082) =='
SELECT CASE WHEN to_regclass('public.schema_migrations') IS NULL THEN '(schema_migrations no existe)'
            ELSE (xpath('/row/v/text()', query_to_xml($q$SELECT string_agg(version, ', ' ORDER BY version) AS v FROM (SELECT version FROM public.schema_migrations WHERE version >= 'NEX-078' ORDER BY version) s$q$, false, true, '')))[1]::text
       END AS versiones_desde_nex078;

ROLLBACK;
