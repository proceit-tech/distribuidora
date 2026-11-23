-- REVERSIÓN MANUAL de NEX-082 (NO es una migración: el runner no la ejecuta ni la descubre; no está en migraciones/). Solo con autorización EXPRESA del responsable,
-- backup previo verificado y ventana sin emisión FE/NCE, movimientos ni entradas de compra:
--   psql -X -v ON_ERROR_STOP=1 -1 -f reversion-NEX-082.sql
-- Nada de esto fue ejecutado por Claude.
--
-- Qué hace: elimina EXACTAMENTE los tres triggers que instaló NEX-082 (fe_punto_secuencias_actualizado_trg, movimientos_intenciones_actualizado_trg,
-- compras_entradas_intenciones_actualizado_trg). Sin CASCADE (DROP TRIGGER es RESTRICT por omisión), sin tocar datos, funciones, grants, otras tablas ni las guardas fiscales.
-- Qué NO hace: NO borra la fila 'NEX-082' de schema_migrations y NO modifica ningún checksum histórico (ver «Conciliación manual» al final).
--
-- Prevalidación FAIL-CLOSED (aborta todo ante estado mixto o no atribuible a NEX-082):
--   P0 lock_timeout local vigente (exige transacción única psql -1);
--   P1 procedencia: schema_migrations registra 'NEX-082' con el checksum EXACTO del archivo versionado (c57c120c…2165) y no hay versiones NEX posteriores registradas
--      (una migración posterior podría depender de estos triggers: revisarla antes);
--   P2 las tres tablas existen como tabla base;
--   P3 identidad completa: los TRES triggers existen con la definición exacta de NEX-082 (BEFORE UPDATE FOR EACH ROW, habilitados, sin args/columnas/WHEN, actualizar_fecha());
--      si falta alguno o alguno difiere, es estado mixto: ABORTAR y conciliar a mano (no se borra un trigger que no se puede atribuir a NEX-082);
--   P4 las guardas fiscales de fe_punto_secuencias existen (se comprueba antes y después: la reversión no las toca).
-- Los bloqueos SHARE ROW EXCLUSIVE se toman ANTES de comprobar (en el mismo orden que NEX-082), para que la comprobación no quede obsoleta.
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  t text;
  v_tablas constant text[] := ARRAY['fe_punto_secuencias', 'movimientos_intenciones', 'compras_entradas_intenciones'];
  v_fn oid := to_regprocedure('public.actualizar_fecha()');
  v_n integer;
BEGIN
  -- P0
  IF current_setting('lock_timeout') <> '5s' THEN
    RAISE EXCEPTION 'reversion NEX-082: lock_timeout local no vigente (%): ejecutar con psql -1 (transacción única).', current_setting('lock_timeout') USING ERRCODE = 'P0001';
  END IF;

  -- P1: procedencia
  IF to_regclass('public.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'reversion NEX-082: no existe schema_migrations: no se puede atribuir el estado a NEX-082.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 'NEX-082' AND checksum = 'c57c120cfbdeeb17e375d0834913a5a8c36d670f18a0ab6fed6eedf7b80c2165') THEN
    RAISE EXCEPTION 'reversion NEX-082: schema_migrations no registra NEX-082 con el checksum del archivo versionado: los triggers no son atribuibles a NEX-082.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.schema_migrations WHERE version ~ '^NEX-[0-9]{3}$' AND version > 'NEX-082') THEN
    RAISE EXCEPTION 'reversion NEX-082: hay migraciones posteriores registradas; revisar dependencias antes de revertir.' USING ERRCODE = 'P0001';
  END IF;

  -- P2
  FOREACH t IN ARRAY v_tablas LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname = t AND c.relkind = 'r') THEN
      RAISE EXCEPTION 'reversion NEX-082: public.% no existe como tabla base: estado mixto.', t USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  LOCK TABLE public.fe_punto_secuencias IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.movimientos_intenciones IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.compras_entradas_intenciones IN SHARE ROW EXCLUSIVE MODE;

  -- P3: identidad exacta de los tres
  SELECT count(*) INTO v_n FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid
   WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY (v_tablas) AND g.tgname = c.relname || '_actualizado_trg'
     AND NOT g.tgisinternal AND v_fn IS NOT NULL AND g.tgfoid = v_fn AND g.tgtype = 19 AND g.tgenabled = 'O' AND g.tgnargs = 0
     AND cardinality(g.tgattr::int2[]) = 0 AND g.tgqual IS NULL AND g.tgconstraint = 0;
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'reversion NEX-082: % de 3 triggers con la definición exacta de NEX-082: estado mixto o modificado; ABORTADA, conciliar manualmente.', v_n USING ERRCODE = 'P0001';
  END IF;

  -- P4
  IF (SELECT count(*) FROM pg_trigger g WHERE g.tgrelid = 'public.fe_punto_secuencias'::regclass AND NOT g.tgisinternal
        AND g.tgname IN ('fe_punto_secuencias_inmutable_trg', 'fe_punto_secuencias_truncate_trg')) <> 2 THEN
    RAISE EXCEPTION 'reversion NEX-082: las guardas fiscales de fe_punto_secuencias no están completas: estado inesperado, no se revierte.' USING ERRCODE = 'P0001';
  END IF;

  -- Eliminación exacta (RESTRICT implícito, sin CASCADE)
  DROP TRIGGER fe_punto_secuencias_actualizado_trg ON public.fe_punto_secuencias;
  DROP TRIGGER movimientos_intenciones_actualizado_trg ON public.movimientos_intenciones;
  DROP TRIGGER compras_entradas_intenciones_actualizado_trg ON public.compras_entradas_intenciones;

  -- Comprobación posterior
  IF EXISTS (SELECT 1 FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid
              WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY (v_tablas) AND g.tgname = c.relname || '_actualizado_trg') THEN
    RAISE EXCEPTION 'reversion NEX-082: quedó algún trigger de NEX-082.' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM pg_trigger g WHERE g.tgrelid = 'public.fe_punto_secuencias'::regclass AND NOT g.tgisinternal
        AND g.tgname IN ('fe_punto_secuencias_inmutable_trg', 'fe_punto_secuencias_truncate_trg')) <> 2 THEN
    RAISE EXCEPTION 'reversion NEX-082: las guardas fiscales de fe_punto_secuencias cambiaron.' USING ERRCODE = 'P0001';
  END IF;
  RAISE NOTICE 'reversion NEX-082: tres triggers eliminados. schema_migrations conserva NEX-082: requiere conciliación MANUAL (ver comentario final del script).';
END $$;

-- ── Conciliación MANUAL y controlada de schema_migrations (NO se ejecuta aquí) ──
-- Tras esta reversión la fila 'NEX-082' sigue en schema_migrations: el runner la consideraría «ya aplicada» (mismo checksum) y NO reinstalaría los triggers; T01 volvería a FALLAR
-- y verificar-NEX-082.sql daría ok = false. Esa divergencia es intencional: la decide un humano, no este script.
-- Opciones, cada una con autorización expresa del responsable y registro en la bitácora de implantación:
--   a) Mantener NEX-082 retirada: en una transacción aparte, después de confirmar que los triggers ya no existen, borrar SOLO esa fila, verificando su checksum exacto:
--        DELETE FROM public.schema_migrations WHERE version = 'NEX-082' AND checksum = 'c57c120cfbdeeb17e375d0834913a5a8c36d670f18a0ab6fed6eedf7b80c2165';
--      (debe afectar exactamente 1 fila; si afecta 0, NO insistir: investigar). Una aplicación posterior del runner reinstalaría NEX-082 con todos sus gates.
--   b) Reinstalar: borrar la fila como en a) y volver a aplicar con el runner oficial (preflight + ventana).
-- Nunca editar el archivo NEX-082 ni ningún checksum de NEX-001…081 para «conciliar»: el runner aborta con código 4 ante un checksum distinto.
