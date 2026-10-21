-- NEX-016 — administracion global separada de los administradores de empresas.
-- No crea empresas ni usuarios automáticamente. Aplicar con runner versionado.
CREATE TABLE administradores_plataforma (
  usuario_id uuid PRIMARY KEY REFERENCES usuarios(id) ON DELETE RESTRICT,
  empresa_id uuid NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_at timestamptz NOT NULL DEFAULT now(),
  creado_por uuid REFERENCES usuarios(id),
  CONSTRAINT administradores_plataforma_usuario_empresa_fk
    FOREIGN KEY (empresa_id, usuario_id) REFERENCES usuarios(empresa_id, id)
);
CREATE INDEX administradores_plataforma_empresa_idx ON administradores_plataforma(empresa_id);
CREATE OR REPLACE FUNCTION nex_validar_admin_plataforma() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM empresas e WHERE e.id = NEW.empresa_id AND e.codigo = 'proceit' AND NOT e.es_demo AND e.estado = 'ACTIVA') THEN
    RAISE EXCEPTION 'administrador global debe pertenecer a PROCEIT real y activa';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM usuario_perfil up JOIN perfiles p
      ON p.id = up.perfil_id AND p.empresa_id = up.empresa_id
    WHERE up.usuario_id = NEW.usuario_id AND up.empresa_id = NEW.empresa_id
      AND p.codigo = 'ADMIN' AND p.es_administrador AND p.activo
  ) THEN
    RAISE EXCEPTION 'administrador global requiere perfil ADMIN en PROCEIT';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER administradores_plataforma_validar
BEFORE INSERT OR UPDATE ON administradores_plataforma
FOR EACH ROW EXECUTE FUNCTION nex_validar_admin_plataforma();
-- Solo DB admin puede elevar usuarios; nunca conceder INSERT/UPDATE/DELETE a runtime.
REVOKE ALL ON administradores_plataforma FROM PUBLIC;
REVOKE ALL ON FUNCTION nex_validar_admin_plataforma() FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexit_runtime') THEN
    GRANT SELECT ON administradores_plataforma TO nexit_runtime;
  END IF;
END $$;
