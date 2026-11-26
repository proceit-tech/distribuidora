-- REVERSIÓN MANUAL de NEX-083 (NO es una migración: el runner no la ejecuta ni la descubre; no está en migraciones/). Solo con autorización EXPRESA del responsable,
-- backup previo verificado y ventana sin emisión FE/NCE ni alta/edición de empresas:
--   psql -X -v ON_ERROR_STOP=1 -1 -f reversion-NEX-083.sql
-- Nada de esto fue ejecutado por Claude.
--
-- Qué hace: elimina EXACTAMENTE las dos FOREIGN KEY que instaló NEX-083 (fe_estado_previo_nex065_empresa_fk y fe_stock_pendientes_preparacion_empresa_fk).
-- Sin CASCADE (DROP CONSTRAINT es RESTRICT por omisión), sin tocar datos (la foto NEX-065 conserva todas sus filas), PK, funciones, triggers, grants, RLS ni otras tablas.
-- Qué NO hace: NO borra la fila 'NEX-083' de schema_migrations y NO modifica ningún checksum histórico (ver «Conciliación manual» al final). T01 volverá a FALLAR en la línea 45.
--
-- ORDEN respecto de otras reversiones: reversion-NEX-065.sql y reversion-NEX-081.sql eliminan (DROP TABLE) estas tablas y, con ellas, sus FK de forma implícita. Con el control de
-- migraciones vigente, NEX-083 se revierte PRIMERO (P1 de este script exige que no haya versiones posteriores; una reversión de NEX-065/081 con NEX-083 todavía registrada
-- dejaría schema_migrations afirmando dos FK inexistentes).
--
-- Prevalidación FAIL-CLOSED (aborta todo ante estado mixto o no atribuible a NEX-083):
--   P0 lock_timeout local vigente (exige transacción única psql -1);
--   P1 procedencia: schema_migrations registra 'NEX-083' con el checksum EXACTO del archivo versionado (88de3731…c1cc) y no hay versiones NEX posteriores registradas
--      (una migración posterior podría depender de estas FK: revisarla antes);
--   P2 las dos tablas y empresas existen como tabla base;
--   P3 identidad completa: las DOS FK existen con la definición exacta de NEX-083 (empresa_id → empresas(id), NO ACTION/NO ACTION, MATCH SIMPLE, NOT DEFERRABLE, validadas)
--      y son las únicas FK de esas tablas; si falta alguna, difiere o hay otra, es estado mixto: ABORTAR y conciliar a mano (no se borra lo que no se puede atribuir a NEX-083).
-- Los bloqueos SHARE ROW EXCLUSIVE se toman ANTES de comprobar, en el mismo orden que NEX-083 (hijas → empresas), para que la comprobación no quede obsoleta.
-- DROP CONSTRAINT de una FK pide ACCESS EXCLUSIVE en la hija y SHARE ROW EXCLUSIVE en empresas: con lock_timeout 5s falla en lugar de colgar si hay actividad.
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  t text;
  v_tablas constant text[] := ARRAY['fe_estado_previo_nex065', 'fe_stock_pendientes_preparacion'];
  v_n bigint;
  v_filas_foto bigint;
BEGIN
  -- P0
  IF current_setting('lock_timeout') <> '5s' THEN
    RAISE EXCEPTION 'reversion NEX-083: lock_timeout local no vigente (%): ejecutar con psql -1 (transacción única).', current_setting('lock_timeout') USING ERRCODE = 'P0001';
  END IF;

  -- P1: procedencia
  IF to_regclass('public.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'reversion NEX-083: no existe schema_migrations: no se puede atribuir el estado a NEX-083.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 'NEX-083' AND checksum = '88de3731ef433c28ff348659831523ef9d1ca1960e29a2b94dd49642c3c4e1cc') THEN
    RAISE EXCEPTION 'reversion NEX-083: schema_migrations no registra NEX-083 con el checksum del archivo versionado: las FK no son atribuibles a NEX-083.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.schema_migrations WHERE version ~ '^NEX-[0-9]{3}$' AND version > 'NEX-083') THEN
    RAISE EXCEPTION 'reversion NEX-083: hay migraciones posteriores registradas; revisar dependencias antes de revertir.' USING ERRCODE = 'P0001';
  END IF;

  -- P2
  FOREACH t IN ARRAY v_tablas || 'empresas'::text LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname = t AND c.relkind = 'r') THEN
      RAISE EXCEPTION 'reversion NEX-083: public.% no existe como tabla base: estado mixto.', t USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  LOCK TABLE public.fe_estado_previo_nex065 IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.fe_stock_pendientes_preparacion IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.empresas IN SHARE ROW EXCLUSIVE MODE;

  -- P3: identidad exacta de las dos y ninguna otra FK
  SELECT count(*) INTO v_n FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
   WHERE c.relnamespace = 'public'::regnamespace AND k.contype = 'f' AND c.relname = ANY (v_tablas)
     AND k.conname = c.relname || '_empresa_fk' AND k.convalidated AND NOT k.condeferrable AND NOT k.condeferred
     AND k.confrelid = 'public.empresas'::regclass AND k.confupdtype = 'a' AND k.confdeltype = 'a' AND k.confmatchtype = 's'
     AND k.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'empresa_id')]::int2[]
     AND k.confkey = ARRAY[(SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = 'public.empresas'::regclass AND a.attname = 'id')]::int2[];
  IF v_n <> 2 OR (SELECT count(*) FROM pg_constraint k WHERE k.conrelid IN ('public.fe_estado_previo_nex065'::regclass, 'public.fe_stock_pendientes_preparacion'::regclass) AND k.contype = 'f') <> 2 THEN
    RAISE EXCEPTION 'reversion NEX-083: % de 2 FK con la definición exacta de NEX-083 (o hay FK adicionales): estado mixto o modificado; ABORTADA, conciliar manualmente.', v_n USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_filas_foto FROM public.fe_estado_previo_nex065;

  -- Eliminación exacta (RESTRICT implícito, sin CASCADE)
  ALTER TABLE public.fe_estado_previo_nex065 DROP CONSTRAINT fe_estado_previo_nex065_empresa_fk;
  ALTER TABLE public.fe_stock_pendientes_preparacion DROP CONSTRAINT fe_stock_pendientes_preparacion_empresa_fk;

  -- Comprobación posterior
  IF EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid IN ('public.fe_estado_previo_nex065'::regclass, 'public.fe_stock_pendientes_preparacion'::regclass) AND k.contype = 'f') THEN
    RAISE EXCEPTION 'reversion NEX-083: quedó alguna FOREIGN KEY en las dos tablas.' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM pg_constraint k WHERE k.conrelid IN ('public.fe_estado_previo_nex065'::regclass, 'public.fe_stock_pendientes_preparacion'::regclass) AND k.contype = 'p') <> 2 THEN
    RAISE EXCEPTION 'reversion NEX-083: las PRIMARY KEY de las dos tablas cambiaron.' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM public.fe_estado_previo_nex065) <> v_filas_foto THEN
    RAISE EXCEPTION 'reversion NEX-083: la foto NEX-065 cambió de número de filas.' USING ERRCODE = 'P0001';
  END IF;
  RAISE NOTICE 'reversion NEX-083: dos FK eliminadas; foto NEX-065 intacta (% filas). schema_migrations conserva NEX-083: requiere conciliación MANUAL (ver comentario final del script).', v_filas_foto;
END $$;

-- ── Conciliación MANUAL y controlada de schema_migrations (NO se ejecuta aquí) ──
-- Tras esta reversión la fila 'NEX-083' sigue en schema_migrations: el runner la consideraría «ya aplicada» (mismo checksum) y NO reinstalaría las FK; T01 volvería a FALLAR
-- (línea 45) y verificar-NEX-083.sql daría ok = false. Esa divergencia es intencional: la decide un humano, no este script.
-- Opciones, cada una con autorización expresa del responsable y registro en la bitácora de implantación:
--   a) Mantener NEX-083 retirada: en una transacción aparte, después de confirmar que las FK ya no existen, borrar SOLO esa fila, verificando su checksum exacto:
--        DELETE FROM public.schema_migrations WHERE version = 'NEX-083' AND checksum = '88de3731ef433c28ff348659831523ef9d1ca1960e29a2b94dd49642c3c4e1cc';
--      (debe afectar exactamente 1 fila; si afecta 0, NO insistir: investigar). Una aplicación posterior del runner reinstalaría NEX-083 con todos sus gates.
--   b) Reinstalar: borrar la fila como en a), correr preflight-NEX-083.sql y volver a aplicar con el runner oficial en ventana.
-- Nunca editar el archivo NEX-083 ni ningún checksum de NEX-001…082 para «conciliar»: el runner aborta con código 4 ante un checksum distinto.
