-- =====================================================================
-- NEX-055 — Facturación: trigger de actualización de actualizado_at en las tablas de NEX-047/NEX-048 que no lo recibieron (hallazgo de la batería T01, PRO-62).
-- Requiere NEX-048. Incremental: NO edita NEX-047/048 ni ninguna migración previa. NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable
-- (backup previo). Reversión: scripts/reversion-NEX-055.sql. ESTADO: versionada y NO aplicada.
--
-- Causa: las migraciones NEX-002…017 llamaban a nex_instalar_triggers_actualizacion() (NEX-001) tras crear sus tablas; NEX-047 (fe_gateway_config, documentos_electronicos) y NEX-048
-- (fe_puntos_expedicion) crearon tablas con actualizado_at sin llamarla, y la invariante «toda tabla con actualizado_at tiene su trigger <tabla>_actualizado_trg» (T01) dejó de cumplirse.
-- Efecto: instala el MISMO trigger (BEFORE UPDATE … actualizar_fecha()) solo en las tablas base que carecen de él. Es idempotente y no modifica datos. Convive con los disparadores de
-- inmutabilidad (se ejecuta antes por orden alfabético y solo toca actualizado_at, que esos disparadores no protegen).
-- =====================================================================
DO $$
DECLARE r record; v text := '';
BEGIN
  IF to_regclass('public.fe_puntos_expedicion') IS NULL OR to_regclass('public.documentos_electronicos') IS NULL OR to_regprocedure('public.actualizar_fecha()') IS NULL THEN
    RAISE EXCEPTION 'NEX-055 requiere NEX-048 (documentos_electronicos, fe_puntos_expedicion) y NEX-001 (actualizar_fecha).';
  END IF;

  FOR r IN
    SELECT c.table_name FROM information_schema.columns c
      JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
     WHERE c.table_schema = 'public' AND c.column_name = 'actualizado_at'
       AND NOT EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = ('public.' || quote_ident(c.table_name))::regclass AND g.tgname = c.table_name || '_actualizado_trg')
     ORDER BY c.table_name
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.actualizar_fecha()', r.table_name || '_actualizado_trg', r.table_name);
    v := v || r.table_name || ' ';
  END LOOP;
  RAISE NOTICE 'NEX-055: trigger de actualización instalado en: %', coalesce(nullif(btrim(v), ''), '(ninguna tabla: ya cumplían)');
END $$;
