-- PRE-VERIFICACIÓN de NEX-082 (triggers de actualizado_at en fe_punto_secuencias, movimientos_intenciones y compras_entradas_intenciones; NEXIT-T01-R01 / PRO-361). SOLO LECTURA.
-- La ejecuta el responsable, con autorización expresa y en la ventana prevista, ANTES de aplicar NEX-082 con el runner:
--   psql -X -v ON_ERROR_STOP=1 -f preflight-NEX-082.sql
-- Cualquier fila con ok = false en la sección 1 significa NO APLICAR hasta conciliar. No escribe nada (transacción READ ONLY + ROLLBACK). Nada de esto fue ejecutado por Claude.
-- No hace SELECT directo de tablas que pueden no existir: las tres tablas se consultan solo por catálogo (pg_class/pg_attribute/pg_trigger). schema_migrations se lee solo si existe
-- (query_to_xml dentro de CASE: la consulta no se evalúa cuando la tabla falta).
-- Checksums esperados (SHA-256 de los archivos de la rama al 23/11/2026): NEX-060 c5f9d900…, NEX-066 7868c153…, NEX-075 d34449ff… (valor completo en cada control).
BEGIN READ ONLY;

\echo '== 1. Dependencias y estado (todas deben dar ok = true) =='
WITH tablas(nombre) AS (VALUES ('fe_punto_secuencias'), ('movimientos_intenciones'), ('compras_entradas_intenciones')),
rel AS (
  SELECT t.nombre, c.oid, c.relkind FROM tablas t
    LEFT JOIN pg_class c ON c.relnamespace = 'public'::regnamespace AND c.relname = t.nombre
),
sm AS (SELECT to_regclass('public.schema_migrations') IS NOT NULL AS existe),
fn AS (
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
     WHERE p.oid = to_regprocedure('public.actualizar_fecha()') AND p.prorettype = 'trigger'::regtype AND l.lanname = 'plpgsql' AND p.pronargs = 0 AND p.prokind = 'f'
       AND NOT p.prosecdef AND p.proconfig IS NULL
       AND btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g')) = 'BEGIN NEW.actualizado_at := now(); RETURN NEW; END') AS ok
)
SELECT orden, control, ok FROM (
  SELECT 1 AS orden, 'schema_migrations existe (NEX-001)' AS control, (SELECT existe FROM sm) AS ok
  UNION ALL SELECT 2, 'NEX-060 registrada con checksum c5f9d9006807ab76c0cf334779c1babcbb74b4874a03f61d6a16c13de53d6297',
    CASE WHEN (SELECT existe FROM sm) THEN (xpath('/row/ok/text()', query_to_xml(
      $q$SELECT count(*) = 1 AS ok FROM public.schema_migrations WHERE version = 'NEX-060' AND checksum = 'c5f9d9006807ab76c0cf334779c1babcbb74b4874a03f61d6a16c13de53d6297'$q$, false, true, '')))[1]::text = 'true' ELSE false END
  UNION ALL SELECT 3, 'NEX-066 registrada con checksum 7868c1537e74155a0dce8e8103e59398228479e841565b23b92420c9a62b26cf',
    CASE WHEN (SELECT existe FROM sm) THEN (xpath('/row/ok/text()', query_to_xml(
      $q$SELECT count(*) = 1 AS ok FROM public.schema_migrations WHERE version = 'NEX-066' AND checksum = '7868c1537e74155a0dce8e8103e59398228479e841565b23b92420c9a62b26cf'$q$, false, true, '')))[1]::text = 'true' ELSE false END
  UNION ALL SELECT 4, 'NEX-075 registrada con checksum d34449ff87c91d2a142708895e111d843a062d8dd6d666c64510719f9e89fb76 (en la VM NO está confirmada: puede dar false)',
    CASE WHEN (SELECT existe FROM sm) THEN (xpath('/row/ok/text()', query_to_xml(
      $q$SELECT count(*) = 1 AS ok FROM public.schema_migrations WHERE version = 'NEX-075' AND checksum = 'd34449ff87c91d2a142708895e111d843a062d8dd6d666c64510719f9e89fb76'$q$, false, true, '')))[1]::text = 'true' ELSE false END
  UNION ALL SELECT 5, 'NEX-082 NO registrada en schema_migrations',
    CASE WHEN (SELECT existe FROM sm) THEN (xpath('/row/ok/text()', query_to_xml(
      $q$SELECT count(*) = 0 AS ok FROM public.schema_migrations WHERE version = 'NEX-082'$q$, false, true, '')))[1]::text = 'true' ELSE false END
  UNION ALL SELECT 10 + row_number() OVER (ORDER BY r.nombre), 'public.' || r.nombre || ' existe como tabla base (relkind r)', coalesce(r.relkind = 'r', false) FROM rel r
  UNION ALL SELECT 20 + row_number() OVER (ORDER BY r.nombre), 'public.' || r.nombre || '.actualizado_at es timestamptz',
    EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = r.oid AND a.attname = 'actualizado_at' AND NOT a.attisdropped AND a.atttypid = 'timestamptz'::regtype) FROM rel r
  UNION ALL SELECT 30, 'public.actualizar_fecha() existe con el comportamiento de NEX-001 (trigger plpgsql, sin args, sin SECURITY DEFINER/SET, NEW.actualizado_at := now())', (SELECT ok FROM fn)
  UNION ALL SELECT 40 + row_number() OVER (ORDER BY r.nombre), r.nombre || '_actualizado_trg NO existe',
    NOT EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = r.oid AND g.tgname = r.nombre || '_actualizado_trg') FROM rel r
  UNION ALL SELECT 50, 'ningún trigger de las tres tablas ejecuta ya actualizar_fecha() con otro nombre (estado parcial / instalación manual)',
    NOT EXISTS (SELECT 1 FROM pg_trigger g JOIN rel r ON r.oid = g.tgrelid WHERE NOT g.tgisinternal AND g.tgfoid = to_regprocedure('public.actualizar_fecha()'))
  UNION ALL SELECT 51, 'sin estado parcial: 0 de 3 triggers NEX-082 presentes',
    (SELECT count(*) FROM pg_trigger g JOIN rel r ON r.oid = g.tgrelid WHERE g.tgname = r.nombre || '_actualizado_trg') = 0
  UNION ALL SELECT 60, 'fe_punto_secuencias tiene EXACTAMENTE sus dos guardas (inmutable_trg de fila y truncate_trg), habilitadas, función fe_secuencias_inmutable()',
    to_regprocedure('public.fe_secuencias_inmutable()') IS NOT NULL
    AND (SELECT count(*) FROM pg_trigger g JOIN rel r ON r.oid = g.tgrelid AND r.nombre = 'fe_punto_secuencias'
          WHERE NOT g.tgisinternal AND g.tgenabled <> 'D' AND g.tgfoid = to_regprocedure('public.fe_secuencias_inmutable()')
            AND ((g.tgname = 'fe_punto_secuencias_inmutable_trg' AND g.tgtype = 27) OR (g.tgname = 'fe_punto_secuencias_truncate_trg' AND g.tgtype = 34))) = 2
    AND (SELECT count(*) FROM pg_trigger g JOIN rel r ON r.oid = g.tgrelid AND r.nombre = 'fe_punto_secuencias' WHERE NOT g.tgisinternal) = 2
  UNION ALL SELECT 61, 'movimientos_intenciones y compras_entradas_intenciones sin triggers de usuario',
    NOT EXISTS (SELECT 1 FROM pg_trigger g JOIN rel r ON r.oid = g.tgrelid AND r.nombre IN ('movimientos_intenciones', 'compras_entradas_intenciones') WHERE NOT g.tgisinternal)
  UNION ALL SELECT 70, 'las tablas base con actualizado_at sin trigger son EXACTAMENTE las tres de NEX-082 (T01 fallaría solo por ellas)',
    coalesce((SELECT array_agg(c.relname::text ORDER BY c.relname) FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'actualizado_at' AND NOT a.attisdropped
       WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
         AND NOT EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = c.oid AND g.tgname = c.relname || '_actualizado_trg')), '{}')
    = ARRAY['compras_entradas_intenciones', 'fe_punto_secuencias', 'movimientos_intenciones']
  UNION ALL SELECT 80, 'session_replication_role = origin (los triggers instalados se disparan en esta sesión)', current_setting('session_replication_role') = 'origin'
) x ORDER BY orden;

\echo '== 2. Informativo: triggers de usuario actuales en las tres tablas (antes de NEX-082 solo deben verse las dos guardas de fe_punto_secuencias) =='
SELECT c.relname AS tabla, g.tgname AS trigger_actual, g.tgfoid::regprocedure AS funcion, g.tgtype, g.tgenabled
  FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid
 WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('fe_punto_secuencias', 'movimientos_intenciones', 'compras_entradas_intenciones') AND NOT g.tgisinternal
 ORDER BY c.relname, g.tgname;

\echo '== 3. Informativo: actividad que bloquearía CREATE TRIGGER (SHARE ROW EXCLUSIVE). Debe estar VACÍO en la ventana: sin emisión FE/NCE, movimientos ni entradas =='
SELECT l.relation::regclass AS tabla, l.mode, l.granted, a.pid, a.state, a.xact_start, left(a.query, 120) AS consulta
  FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
 WHERE l.locktype = 'relation' AND a.pid <> pg_backend_pid()
   AND l.relation IN (SELECT c.oid FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('fe_punto_secuencias', 'movimientos_intenciones', 'compras_entradas_intenciones'))
 ORDER BY a.xact_start;

\echo '== 4. Informativo: últimas migraciones registradas (NEX-082 debe faltar; la última esperada es NEX-081) =='
SELECT CASE WHEN to_regclass('public.schema_migrations') IS NULL THEN '(schema_migrations no existe)'
            ELSE (xpath('/row/v/text()', query_to_xml($q$SELECT string_agg(version, ', ' ORDER BY version) AS v FROM (SELECT version FROM public.schema_migrations WHERE version >= 'NEX-075' ORDER BY version) s$q$, false, true, '')))[1]::text
       END AS versiones_desde_nex075;

ROLLBACK;
