-- =====================================================================
-- NEX-082 — Trigger de actualización de actualizado_at en las tres tablas creadas después de NEX-055 que no lo recibieron (falla T01 del CI, NEXIT-T01-R01 / PRO-361 / PRO-62).
-- Orden: documentacao/ordens/ORD-CLAUDE-NEXIT-T01-R01-NEX-082-TRIGGERS-2026-11-23.md. Diagnóstico: documentacao/analises/NEXIT-CI-R01-T01-DIAGNOSTICO-ACTUALIZADO-AT-2026-11-23.md.
-- Requiere NEX-001 (actualizar_fecha), NEX-060 (fe_punto_secuencias), NEX-066 (movimientos_intenciones) y NEX-075 (compras_entradas_intenciones), todas registradas en schema_migrations.
-- Incremental: NO edita NEX-001…081 ni sus checksums, ni T01-estructura.sql. NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable (backup previo,
-- scripts/preflight-NEX-082.sql, ventana sin emisión). Verificación: scripts/verificar-NEX-082.sql. Reversión MANUAL: scripts/reversion-NEX-082.sql. ESTADO: versionada y NO aplicada.
--
-- Alcance EXACTO (patrón NEX-055, sin recorrer el esquema y SIN nex_instalar_triggers_actualizacion()):
--   public.fe_punto_secuencias          -> fe_punto_secuencias_actualizado_trg
--   public.movimientos_intenciones      -> movimientos_intenciones_actualizado_trg
--   public.compras_entradas_intenciones -> compras_entradas_intenciones_actualizado_trg
-- Cada uno: CREATE TRIGGER <nombre> BEFORE UPDATE ON public.<tabla> FOR EACH ROW EXECUTE FUNCTION public.actualizar_fecha(). La función (NEX-001) solo hace NEW.actualizado_at := now().
-- No crea funciones, no modifica datos, índices, CHECKs, UNIQUE (K1), grants, stock, compras, CDC ni numeración. No usa IF NOT EXISTS ni CREATE OR REPLACE TRIGGER.
--
-- Transacción: el runner (scripts/aplicar-migraciones.sh) ejecuta este archivo y su fila de schema_migrations (SHA-256) en UNA transacción psql -1. Por eso NO hay BEGIN/COMMIT aquí.
-- lock_timeout se fija con SET LOCAL (solo esta transacción; no cambia configuración global). El bloque DO comprueba que el valor quedó vigente: fuera de una transacción explícita
-- SET LOCAL no tiene efecto y la migración ABORTA (no se ejecuta suelta, sin el registro del runner).
--
-- Bloqueos: CREATE TRIGGER toma SHARE ROW EXCLUSIVE sobre cada tabla, incompatible con UPDATE/INSERT/DELETE concurrentes (ROW EXCLUSIVE). Se toman PRIMERO, en orden fijo
-- (fe_punto_secuencias, movimientos_intenciones, compras_entradas_intenciones), ANTES de validar, y se mantienen hasta el COMMIT del runner. Con lock_timeout = 5s una emisión FE/NCE,
-- un registro de movimiento o una entrada de compra en curso hace FALLAR la migración en lugar de colgar la operación. Aplicación futura: ventana sin emisión FE/NCE, movimientos ni
-- entradas, backup y preflight previos, autorizados por un humano aparte.
--
-- Gates FAIL-CLOSED (cualquiera aborta la transacción completa, sin instalación parcial):
--   G0 lock_timeout local vigente (transacción explícita);  G1 schema_migrations existe, NEX-060/066/075 registradas y NEX-082 ausente;
--   G2 las tres tablas existen en public como tabla base (relkind 'r');  G3 cada una tiene actualizado_at timestamptz (no eliminada);
--   G4 public.actualizar_fecha() existe con el comportamiento de NEX-001 (trigger, plpgsql, sin argumentos, sin SECURITY DEFINER ni SET, cuerpo exacto normalizado);
--   G5 ninguno de los tres triggers existe y ningún trigger de esas tablas ejecuta ya actualizar_fecha() con otro nombre (estado parcial o instalación manual);
--   G6 estado de triggers conocido: fe_punto_secuencias tiene EXACTAMENTE sus dos guardas de NEX-060/063 (fe_punto_secuencias_inmutable_trg y fe_punto_secuencias_truncate_trg,
--      habilitadas, función fe_secuencias_inmutable()); las dos tablas de intenciones no tienen triggers de usuario.
-- Coexistencia con las guardas fiscales: los BEFORE de fila se disparan por orden de nombre; …_actualizado_trg corre antes que …_inmutable_trg y solo cambia actualizado_at, que la guarda
-- no valida. La guarda sigue comparando NEW/OLD de empresa, punto, tipo, serie y ultimo_numero: prohibición de retroceso e identidad fiscal intactas (en cualquier orden el resultado es el mismo).
-- now() es la hora de inicio de la transacción: el mismo valor que ya escriben todas las funciones versionadas (UPDATE … actualizado_at = now()); su resultado no cambia.
-- Al final se verifica por catálogo la definición exacta de los tres triggers y se informa (NOTICE) si otra tabla base sigue sin trigger (no se corrige aquí).
-- =====================================================================
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  t text;
  v_tablas constant text[] := ARRAY['fe_punto_secuencias', 'movimientos_intenciones', 'compras_entradas_intenciones'];
  v_fn oid;
  v_n integer;
  otras text;
BEGIN
  -- G0: transacción explícita con lock_timeout local corto
  IF current_setting('lock_timeout') <> '5s' THEN
    RAISE EXCEPTION 'NEX-082: lock_timeout local no vigente (%): aplicar SOLO con el runner oficial (transacción única psql -1).', current_setting('lock_timeout')
      USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX082_SIN_TRANSACCION';
  END IF;

  -- G1: control de migraciones
  IF to_regclass('public.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'NEX-082: falta public.schema_migrations (NEX-001).' USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX082_DEPENDENCIA';
  END IF;
  IF (SELECT count(*) FROM public.schema_migrations WHERE version IN ('NEX-060', 'NEX-066', 'NEX-075')) <> 3 THEN
    RAISE EXCEPTION 'NEX-082 requiere NEX-060, NEX-066 y NEX-075 registradas en schema_migrations.' USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX082_DEPENDENCIA';
  END IF;
  IF EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 'NEX-082') THEN
    RAISE EXCEPTION 'NEX-082 ya está registrada en schema_migrations: no se reaplica por suposición.' USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX082_YA_REGISTRADA';
  END IF;

  -- G2: las tres tablas existen como tabla base en public (antes de cualquier ::regclass)
  FOREACH t IN ARRAY v_tablas LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname = t AND c.relkind = 'r') THEN
      RAISE EXCEPTION 'NEX-082: public.% no existe como tabla base (¿NEX-060/066/075 no aplicada?): no se instala en parte.', t USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX082_DEPENDENCIA';
    END IF;
  END LOOP;

  -- Bloqueos ANTES de validar el resto (mismo modo que CREATE TRIGGER: sin escalamiento), en orden fijo
  LOCK TABLE public.fe_punto_secuencias IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.movimientos_intenciones IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.compras_entradas_intenciones IN SHARE ROW EXCLUSIVE MODE;

  -- G3: columna actualizado_at timestamptz
  FOREACH t IN ARRAY v_tablas LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = ('public.' || quote_ident(t))::regclass AND a.attname = 'actualizado_at'
                      AND NOT a.attisdropped AND a.atttypid = 'timestamptz'::regtype) THEN
      RAISE EXCEPTION 'NEX-082: public.%.actualizado_at no existe o no es timestamptz.', t USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX082_COLUMNA';
    END IF;
  END LOOP;

  -- G4: función oficial con el comportamiento esperado de NEX-001
  v_fn := to_regprocedure('public.actualizar_fecha()');
  IF v_fn IS NULL OR NOT EXISTS (
       SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
        WHERE p.oid = v_fn AND p.prorettype = 'trigger'::regtype AND l.lanname = 'plpgsql' AND p.pronargs = 0 AND p.prokind = 'f'
          AND NOT p.prosecdef AND p.proconfig IS NULL
          AND btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g')) = 'BEGIN NEW.actualizado_at := now(); RETURN NEW; END') THEN
    RAISE EXCEPTION 'NEX-082: public.actualizar_fecha() no existe o no coincide con NEX-001 (NEW.actualizado_at := now()): función inesperada.' USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX082_FUNCION';
  END IF;

  -- G5: ninguno de los tres triggers existe; ningún trigger de esas tablas ejecuta ya actualizar_fecha()
  FOREACH t IN ARRAY v_tablas LOOP
    IF EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = ('public.' || quote_ident(t))::regclass AND g.tgname = t || '_actualizado_trg') THEN
      RAISE EXCEPTION 'NEX-082: % ya tiene %_actualizado_trg (instalación previa, manual o parcial): no se reaplica por suposición.', t, t USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX082_PREEXISTENTE';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = ('public.' || quote_ident(t))::regclass AND NOT g.tgisinternal AND g.tgfoid = v_fn) THEN
      RAISE EXCEPTION 'NEX-082: % ya tiene un trigger que ejecuta actualizar_fecha() con otro nombre: estado inesperado.', t USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX082_PREEXISTENTE';
    END IF;
  END LOOP;

  -- G6: estado de triggers conocido
  IF to_regprocedure('public.fe_secuencias_inmutable()') IS NULL THEN
    RAISE EXCEPTION 'NEX-082: falta public.fe_secuencias_inmutable() (NEX-060/063).' USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX082_GUARDAS';
  END IF;
  SELECT count(*) INTO v_n FROM pg_trigger g
   WHERE g.tgrelid = 'public.fe_punto_secuencias'::regclass AND NOT g.tgisinternal AND g.tgenabled <> 'D'
     AND g.tgfoid = 'public.fe_secuencias_inmutable()'::regprocedure
     AND ((g.tgname = 'fe_punto_secuencias_inmutable_trg' AND g.tgtype = 27) OR (g.tgname = 'fe_punto_secuencias_truncate_trg' AND g.tgtype = 34));
  IF v_n <> 2 OR (SELECT count(*) FROM pg_trigger g WHERE g.tgrelid = 'public.fe_punto_secuencias'::regclass AND NOT g.tgisinternal) <> 2 THEN
    RAISE EXCEPTION 'NEX-082: fe_punto_secuencias no tiene exactamente sus dos guardas fiscales (inmutable de fila y TRUNCATE) habilitadas: estado inesperado.' USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX082_GUARDAS';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid IN ('public.movimientos_intenciones'::regclass, 'public.compras_entradas_intenciones'::regclass) AND NOT g.tgisinternal) THEN
    RAISE EXCEPTION 'NEX-082: movimientos_intenciones o compras_entradas_intenciones ya tienen triggers de usuario: estado inesperado.' USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX082_ESTADO';
  END IF;

  -- Instalación: los tres triggers EXACTOS (sentencias estáticas, sin CASCADE ni OR REPLACE)
  CREATE TRIGGER fe_punto_secuencias_actualizado_trg BEFORE UPDATE ON public.fe_punto_secuencias FOR EACH ROW EXECUTE FUNCTION public.actualizar_fecha();
  CREATE TRIGGER movimientos_intenciones_actualizado_trg BEFORE UPDATE ON public.movimientos_intenciones FOR EACH ROW EXECUTE FUNCTION public.actualizar_fecha();
  CREATE TRIGGER compras_entradas_intenciones_actualizado_trg BEFORE UPDATE ON public.compras_entradas_intenciones FOR EACH ROW EXECUTE FUNCTION public.actualizar_fecha();

  -- Verificación interna: exactamente los tres, BEFORE UPDATE por fila (tgtype 19), habilitados, sin argumentos, sin columnas, sin WHEN, no de restricción, función oficial
  SELECT count(*) INTO v_n FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid
   WHERE c.relnamespace = 'public'::regnamespace AND NOT g.tgisinternal
     AND g.tgname = c.relname || '_actualizado_trg' AND c.relname = ANY (v_tablas)
     AND g.tgfoid = v_fn AND g.tgtype = 19 AND g.tgenabled = 'O' AND g.tgnargs = 0 AND cardinality(g.tgattr::int2[]) = 0
     AND g.tgqual IS NULL AND g.tgconstraint = 0;
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'NEX-082: la verificación posterior encontró % de 3 triggers con la definición exacta.', v_n USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX082_VERIFICACION';
  END IF;
  IF (SELECT count(*) FROM pg_trigger g WHERE g.tgrelid = 'public.fe_punto_secuencias'::regclass AND NOT g.tgisinternal AND g.tgenabled <> 'D'
        AND g.tgname IN ('fe_punto_secuencias_inmutable_trg', 'fe_punto_secuencias_truncate_trg')) <> 2 THEN
    RAISE EXCEPTION 'NEX-082: las guardas fiscales de fe_punto_secuencias no quedaron intactas.' USING ERRCODE = 'P0001', DETAIL = 'NEX:NEX082_VERIFICACION';
  END IF;

  -- Informativo (como NEX-055): otras tablas base sin trigger de actualización NO se tocan aquí; T01 las detectaría
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO otras
    FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'actualizado_at' AND NOT a.attisdropped
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
     AND NOT EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = c.oid AND g.tgname = c.relname || '_actualizado_trg');
  IF otras IS NOT NULL THEN RAISE NOTICE 'NEX-082: otras tablas base siguen sin trigger de actualización (no se tocan): %', otras; END IF;
END $$;
