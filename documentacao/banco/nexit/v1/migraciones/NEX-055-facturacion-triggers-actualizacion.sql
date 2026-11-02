-- =====================================================================
-- NEX-055 — Facturación: trigger de actualización de actualizado_at en las tres tablas de NEX-047/NEX-048 que no lo recibieron (hallazgo de la batería T01, PRO-62).
-- Requiere NEX-048. Incremental: NO edita NEX-047/048 ni ninguna migración previa. NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable
-- (backup previo). Reversión: scripts/reversion-NEX-055.sql. ESTADO: versionada y NO aplicada.
--
-- Causa: las migraciones NEX-002…017 llamaban a nex_instalar_triggers_actualizacion() (NEX-001) tras crear sus tablas; NEX-047 (fe_gateway_config, documentos_electronicos) y NEX-048
-- (fe_puntos_expedicion) crearon tablas con actualizado_at sin llamarla, y la invariante «toda tabla con actualizado_at tiene su trigger <tabla>_actualizado_trg» (T01) dejó de cumplirse.
--
-- Alcance EXACTO: solo esas tres tablas (no se recorre el esquema). Instala el MISMO trigger (BEFORE UPDATE … actualizar_fecha()). Si alguna de las tres YA tiene el trigger se aborta
-- (estado inesperado: no se reaplica por suposición), de modo que la reversión (DROP de esos tres triggers) nunca elimina un trigger preexistente. No modifica datos. Convive con los
-- disparadores de inmutabilidad (se ejecuta antes por orden alfabético y solo cambia actualizado_at, que esos disparadores no protegen). Al final informa (NOTICE) si otra tabla base
-- sigue sin el trigger; eso NO se corrige aquí (T01 lo detectaría) para no ampliar el alcance sin revisión.
-- =====================================================================
DO $$
DECLARE
  t text;
  otras text;
BEGIN
  IF to_regclass('public.fe_gateway_config') IS NULL OR to_regclass('public.documentos_electronicos') IS NULL OR to_regclass('public.fe_puntos_expedicion') IS NULL
     OR to_regprocedure('public.actualizar_fecha()') IS NULL THEN
    RAISE EXCEPTION 'NEX-055 requiere NEX-047/NEX-048 (fe_gateway_config, documentos_electronicos, fe_puntos_expedicion) y NEX-001 (actualizar_fecha).';
  END IF;

  FOREACH t IN ARRAY ARRAY['fe_gateway_config', 'documentos_electronicos', 'fe_puntos_expedicion'] LOOP
    IF EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = ('public.' || t)::regclass AND g.tgname = t || '_actualizado_trg') THEN
      RAISE EXCEPTION 'NEX-055: % ya tiene su trigger de actualización; NEX-055 parece aplicada o fue instalado a mano: no se reaplica por suposición.', t;
    END IF;
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.actualizar_fecha()', t || '_actualizado_trg', t);
  END LOOP;

  SELECT string_agg(c.table_name, ', ' ORDER BY c.table_name) INTO otras
    FROM information_schema.columns c
    JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
   WHERE c.table_schema = 'public' AND c.column_name = 'actualizado_at'
     AND NOT EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = ('public.' || quote_ident(c.table_name))::regclass AND g.tgname = c.table_name || '_actualizado_trg');
  IF otras IS NOT NULL THEN RAISE NOTICE 'NEX-055: otras tablas base siguen sin trigger de actualización (no se tocan): %', otras; END IF;
END $$;
