-- =====================================================================
-- NEX-OPT — Row Level Security por empresa (OPCIONAL, NO se aplica en esta etapa)
-- El código desplegado NO fija app.empresa_id en cada transacción y el login consulta usuarios ANTES de conocer la empresa.
-- Activar RLS ahora rompería el login y todas las pantallas. Este archivo queda versionado y probado en el PostgreSQL
-- descartable para la etapa en que la aplicación implemente withTenantTx() + una función de login SECURITY DEFINER.
-- Con RLS FORCE, ni el dueño de las tablas salta la política; solo un superusuario/BYPASSRLS (no usar nexit_app en runtime).
-- =====================================================================
CREATE OR REPLACE FUNCTION app_empresa_id() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE AS $$ SELECT NULLIF(current_setting('app.empresa_id', true), '')::uuid $$;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT table_name FROM information_schema.columns c
            WHERE c.table_schema = 'public' AND c.column_name = 'empresa_id'
              AND EXISTS (SELECT 1 FROM information_schema.tables x WHERE x.table_schema = 'public' AND x.table_name = c.table_name AND x.table_type = 'BASE TABLE')
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_aislamiento_empresa', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (empresa_id = app_empresa_id()) WITH CHECK (empresa_id = app_empresa_id())', t || '_aislamiento_empresa', t);
  END LOOP;
  ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
  ALTER TABLE empresas FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS empresas_aislamiento_empresa ON empresas;
  CREATE POLICY empresas_aislamiento_empresa ON empresas USING (id = app_empresa_id()) WITH CHECK (id = app_empresa_id());
END $$;
