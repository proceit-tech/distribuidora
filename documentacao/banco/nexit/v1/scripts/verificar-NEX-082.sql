-- VERIFICACIÓN POSTERIOR de NEX-082 (triggers de actualizado_at; NEXIT-T01-R01 / PRO-361). SOLO LECTURA. La ejecuta el responsable DESPUÉS de aplicar NEX-082 con el runner:
--   psql -X -v ON_ERROR_STOP=1 -f verificar-NEX-082.sql
-- Toda fila de la sección 1 debe dar ok = true. No escribe nada (transacción READ ONLY + ROLLBACK). Nada de esto fue ejecutado por Claude.
-- Detecta: instalación incompleta, trigger con el nombre correcto pero definición distinta (función, momento, evento, nivel, columnas, WHEN, argumentos, deshabilitado),
-- triggers extra que ejecuten actualizar_fecha(), guardas fiscales de fe_punto_secuencias alteradas, registro NEX-082 ausente o con otro checksum y versiones posteriores inesperadas.
-- Checksum esperado de NEX-082 (SHA-256 del archivo versionado): c57c120cfbdeeb17e375d0834913a5a8c36d670f18a0ab6fed6eedf7b80c2165.
-- tgtype esperado 19 = ROW (1) + BEFORE (2) + UPDATE (16). Guardas: inmutable_trg 27 = ROW + BEFORE + DELETE (8) + UPDATE; truncate_trg 34 = BEFORE + TRUNCATE (32), por sentencia.
BEGIN READ ONLY;

\echo '== 1. Estado posterior (todas deben dar ok = true) =='
WITH esperado(tabla, trg) AS (VALUES ('fe_punto_secuencias', 'fe_punto_secuencias_actualizado_trg'),
                                     ('movimientos_intenciones', 'movimientos_intenciones_actualizado_trg'),
                                     ('compras_entradas_intenciones', 'compras_entradas_intenciones_actualizado_trg')),
fn AS (SELECT to_regprocedure('public.actualizar_fecha()') AS oid),
real AS (
  SELECT e.tabla, e.trg, c.oid AS relid, g.oid AS tgoid, g.tgfoid, g.tgtype, g.tgenabled, g.tgnargs, g.tgattr, g.tgqual, g.tgconstraint, g.tgisinternal
    FROM esperado e
    LEFT JOIN pg_class c ON c.relnamespace = 'public'::regnamespace AND c.relname = e.tabla AND c.relkind = 'r'
    LEFT JOIN pg_trigger g ON g.tgrelid = c.oid AND g.tgname = e.trg
),
sm AS (SELECT to_regclass('public.schema_migrations') IS NOT NULL AS existe)
SELECT orden, control, ok FROM (
  SELECT 10 + row_number() OVER (ORDER BY r.tabla) AS orden, r.trg || ' existe en public.' || r.tabla AS control, r.tgoid IS NOT NULL AS ok FROM real r
  UNION ALL SELECT 20 + row_number() OVER (ORDER BY r.tabla),
    r.trg || ': definición exacta (BEFORE UPDATE FOR EACH ROW, habilitado O, sin args/columnas/WHEN, no de restricción, EXECUTE FUNCTION public.actualizar_fecha())',
    coalesce(r.tgoid IS NOT NULL AND NOT r.tgisinternal AND r.tgfoid = (SELECT oid FROM fn) AND r.tgtype = 19 AND r.tgenabled = 'O' AND r.tgnargs = 0
             AND cardinality(r.tgattr::int2[]) = 0 AND r.tgqual IS NULL AND r.tgconstraint = 0, false)
    FROM real r
  UNION ALL SELECT 30, 'instalación completa: 3 de 3 triggers con definición exacta',
    (SELECT count(*) FROM real r WHERE r.tgoid IS NOT NULL AND NOT r.tgisinternal AND r.tgfoid = (SELECT oid FROM fn) AND r.tgtype = 19 AND r.tgenabled = 'O'
       AND r.tgnargs = 0 AND cardinality(r.tgattr::int2[]) = 0 AND r.tgqual IS NULL AND r.tgconstraint = 0) = 3
  UNION ALL SELECT 31, 'en las tres tablas, EXACTAMENTE un trigger ejecuta actualizar_fecha() (sin duplicados con otro nombre)',
    (SELECT count(*) FROM pg_trigger g JOIN real r ON r.relid = g.tgrelid WHERE NOT g.tgisinternal AND g.tgfoid = (SELECT oid FROM fn)) = 3
    AND NOT EXISTS (SELECT 1 FROM real r WHERE (SELECT count(*) FROM pg_trigger g WHERE g.tgrelid = r.relid AND NOT g.tgisinternal AND g.tgfoid = (SELECT oid FROM fn)) <> 1)
  UNION ALL SELECT 32, 'public.actualizar_fecha() conserva el comportamiento de NEX-001 (NEW.actualizado_at := now(); sin SECURITY DEFINER/SET)',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
             WHERE p.oid = (SELECT oid FROM fn) AND p.prorettype = 'trigger'::regtype AND l.lanname = 'plpgsql' AND p.pronargs = 0 AND p.prokind = 'f'
               AND NOT p.prosecdef AND p.proconfig IS NULL
               AND btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g')) = 'BEGIN NEW.actualizado_at := now(); RETURN NEW; END')
  UNION ALL SELECT 40, 'fe_punto_secuencias conserva sus guardas: inmutable_trg (fila, UPDATE/DELETE) y truncate_trg (TRUNCATE), habilitadas, fe_secuencias_inmutable()',
    to_regprocedure('public.fe_secuencias_inmutable()') IS NOT NULL
    AND (SELECT count(*) FROM pg_trigger g JOIN real r ON r.relid = g.tgrelid AND r.tabla = 'fe_punto_secuencias'
          WHERE NOT g.tgisinternal AND g.tgenabled <> 'D' AND g.tgfoid = to_regprocedure('public.fe_secuencias_inmutable()')
            AND ((g.tgname = 'fe_punto_secuencias_inmutable_trg' AND g.tgtype = 27) OR (g.tgname = 'fe_punto_secuencias_truncate_trg' AND g.tgtype = 34))) = 2
  UNION ALL SELECT 41, 'fe_punto_secuencias: el trigger de actualizado_at se dispara ANTES que la guarda de inmutabilidad (orden por nombre, solo cambia actualizado_at)',
    'fe_punto_secuencias_actualizado_trg' COLLATE "C" < 'fe_punto_secuencias_inmutable_trg' COLLATE "C"
  UNION ALL SELECT 42, 'triggers de usuario: fe_punto_secuencias = 3, movimientos_intenciones = 1, compras_entradas_intenciones = 1 (nada extra)',
    (SELECT array_agg(n ORDER BY t) FROM (SELECT r.tabla AS t, (SELECT count(*) FROM pg_trigger g WHERE g.tgrelid = r.relid AND NOT g.tgisinternal) AS n FROM real r) x)
    = ARRAY[1::bigint, 3::bigint, 1::bigint]
  UNION ALL SELECT 50, 'T01: ninguna tabla base de public con actualizado_at queda sin <tabla>_actualizado_trg',
    NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'actualizado_at' AND NOT a.attisdropped
                 WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
                   AND NOT EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = c.oid AND g.tgname = c.relname || '_actualizado_trg'))
  UNION ALL SELECT 60, 'NEX-082 registrada en schema_migrations con el checksum del archivo versionado (c57c120c…2165)',
    CASE WHEN (SELECT existe FROM sm) THEN (xpath('/row/ok/text()', query_to_xml(
      $q$SELECT count(*) = 1 AS ok FROM public.schema_migrations WHERE version = 'NEX-082' AND checksum = 'c57c120cfbdeeb17e375d0834913a5a8c36d670f18a0ab6fed6eedf7b80c2165'$q$, false, true, '')))[1]::text = 'true' ELSE false END
  UNION ALL SELECT 61, 'NEX-060, NEX-066 y NEX-075 siguen registradas',
    CASE WHEN (SELECT existe FROM sm) THEN (xpath('/row/ok/text()', query_to_xml(
      $q$SELECT count(*) = 3 AS ok FROM public.schema_migrations WHERE version IN ('NEX-060', 'NEX-066', 'NEX-075')$q$, false, true, '')))[1]::text = 'true' ELSE false END
) x ORDER BY orden;

\echo '== 2. Informativo: definición de cada trigger de las tres tablas, tal como la reconstruye PostgreSQL =='
SELECT c.relname AS tabla, g.tgname, g.tgenabled, pg_get_triggerdef(g.oid) AS definicion
  FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid
 WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('fe_punto_secuencias', 'movimientos_intenciones', 'compras_entradas_intenciones') AND NOT g.tgisinternal
 ORDER BY c.relname, g.tgname;

\echo '== 3. Informativo: registro de NEX-082 y versiones posteriores (cualquier versión > NEX-082 es inesperada al 23/11/2026 y debe revisarse) =='
SELECT CASE WHEN to_regclass('public.schema_migrations') IS NULL THEN '(schema_migrations no existe)'
            ELSE (xpath('/row/v/text()', query_to_xml($q$SELECT string_agg(version || ' ' || left(checksum, 12) || ' ' || aplicada_at::text || ' ' || aplicada_por, ' | ' ORDER BY version) AS v
                                                          FROM public.schema_migrations WHERE version >= 'NEX-082'$q$, false, true, '')))[1]::text
       END AS registro_desde_nex082;

ROLLBACK;
