-- =====================================================================
-- NEX-001 — Base del esquema
-- Extensiones, control de migraciones y funciones utilitarias (fecha de actualización, herencia de empresa_id).
-- Proyecto Nexit (REQ NEXIT-2026-001). ESTADO: PROPUESTA para revisión técnica.
-- NO ejecutar en la VM ni en el banco 'nexit' sin autorización expresa del responsable.
-- Aplicar con documentacao/banco/nexit/scripts/aplicar-migraciones.sh (transacción única + checksum).
-- =====================================================================


CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Control de migraciones: el runner (aplicar-migraciones.sh) inserta una fila por archivo con su SHA-256.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     text        PRIMARY KEY,
  nombre      text        NOT NULL,
  checksum    text        NOT NULL,
  aplicada_at timestamptz NOT NULL DEFAULT now(),
  aplicada_por text       NOT NULL DEFAULT current_user
);

CREATE OR REPLACE FUNCTION actualizar_fecha() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.actualizado_at := now();
  RETURN NEW;
END $$;

-- Instala (idempotente) el trigger de actualizado_at en toda tabla pública que tenga esa columna.
CREATE OR REPLACE FUNCTION nex_instalar_triggers_actualizacion() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name FROM information_schema.columns c
      JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
     WHERE c.table_schema = 'public' AND c.column_name = 'actualizado_at'
  LOOP
    EXECUTE format('CREATE OR REPLACE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION actualizar_fecha()',
                   r.table_name || '_actualizado_trg', r.table_name);
  END LOOP;
END $$;

-- El código desplegado inserta filas hijas sin empresa_id (solo el id del padre).
-- Este trigger completa empresa_id desde el padre ANTES de validar NOT NULL y FKs compuestas.
-- Su nombre ("_0_") lo hace ejecutar antes de los guards de cada tabla.
CREATE OR REPLACE FUNCTION nex_heredar_empresa() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  IF NEW.empresa_id IS NULL THEN
    EXECUTE format('SELECT empresa_id FROM %I WHERE id = ($1).%I', TG_ARGV[0], TG_ARGV[1]) INTO v USING NEW;
    NEW.empresa_id := v;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION nex_instalar_heredar_empresa(p_tabla text, p_padre text, p_fk text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('CREATE OR REPLACE TRIGGER %I BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION nex_heredar_empresa(%L, %L)',
                 p_tabla || '_0_heredar_empresa_trg', p_tabla, p_padre, p_fk);
END $$;

-- Completa pais_nombre (que el código desplegado escribe/lee) a partir del catálogo de países.
CREATE OR REPLACE FUNCTION nex_completar_pais_nombre() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.pais_nombre IS NULL AND NEW.pais_codigo IS NOT NULL THEN
    SELECT nombre INTO NEW.pais_nombre FROM referencia_geografica_paises WHERE codigo = NEW.pais_codigo;
  END IF;
  RETURN NEW;
END $$;
