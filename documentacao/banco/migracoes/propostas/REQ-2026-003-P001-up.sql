-- =============================================================================
-- REQ-2026-003-P001-up.sql — PROPOSTA — NÃO EXECUTAR EM BANCO REAL
-- Objetivo : núcleo multiempresa e de acesso em INGLÊS (companies, branches,
--            warehouses, users, roles, permissions, role_permissions, user_roles,
--            user_branches, user_warehouses, user_sessions, security_events)
--            + funções-base de isolamento (RLS) usadas por todas as propostas.
-- Origem   : REQ-2026-003; REQ-2026-002 (DESENHO v5 §3.2, §5, §6) e D-01..D-12;
--            documentacao/banco/levantamento/campos/AUTH-ADMIN.md
-- Dialeto  : PostgreSQL >= 14 (usa gen_random_uuid() nativo, NULLS NOT DISTINCT
--            NÃO é usado). Validado só em PG 16.15 descartável (TST-REQ-2026-003).
-- Situação : DEFINIÇÃO DE ESTRUTURA-ALVO (greenfield). NÃO é migration pronta:
--            o esquema real está NAO_VERIFICADO (REQ-2026-003 §6). Em banco
--            existente, esta estrutura só entra após a reconciliação
--            (PLANO-MIGRACAO-INGLES.md: renomeação + views de compatibilidade).
-- Pré-cond.: extensão pgcrypto NÃO é necessária aqui (hash de senha fica na app
--            ou em função própria do login; ver README das propostas).
-- Pós-valid: documentacao/banco/validacoes/TESTE-P001-isolamento.sql
-- Impacto API: nenhum até o código passar a usar os nomes em inglês (adaptador/
--            view de compatibilidade; PLANO-MIGRACAO-INGLES.md §3).
-- Rollback : REQ-2026-003-P001-down.sql — só para banco DESCARTÁVEL.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Convenções de isolamento
-- ---------------------------------------------------------------------------
-- Toda tabela de negócio: company_id NOT NULL; unique (company_id, id) para
-- permitir FK composta (company_id, x_id) -> x (company_id, id), o que impede,
-- no próprio banco, ligar linhas de empresas diferentes (RN-01, RN-11).

CREATE OR REPLACE FUNCTION app_company_id() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT NULLIF(current_setting('app.company_id', true), '')::uuid
$$;
COMMENT ON FUNCTION app_company_id() IS
  'Empresa da transação, definida pela camada de dados (set_config(...,true)). NULL = nenhuma linha visível.';

CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- 1. companies  (atual: empresas)  — raiz do tenant, não tem company_id
-- ---------------------------------------------------------------------------
CREATE TABLE companies (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code               text        NOT NULL CHECK (code = lower(code) AND code ~ '^[a-z0-9_.-]{1,40}$'),
  legal_name         text        NOT NULL CHECK (length(btrim(legal_name)) > 0),
  tax_id             text,                         -- RUC (sem DV)
  tax_id_check_digit text,                         -- DV
  status             text        NOT NULL DEFAULT 'ACTIVA' CHECK (status IN ('ACTIVA','SUSPENDIDA')),
  access_version     integer     NOT NULL DEFAULT 1,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT companies_code_key UNIQUE (code)      -- usado no login (empresa + usuário + senha, D-01)
);
-- O código atual lê "empresas.activo" (boolean). Compatibilidade: is_active é
-- derivada de status (ver view de compatibilidade no PLANO-MIGRACAO-INGLES.md).

-- ---------------------------------------------------------------------------
-- 2. branches  (atual: sucursales — NAO referenciada no código)
-- ---------------------------------------------------------------------------
CREATE TABLE branches (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             uuid        NOT NULL REFERENCES companies(id),
  code                   text        NOT NULL,
  name                   text        NOT NULL,
  sifen_establishment    text,                     -- establecimiento SIFEN (3 dígitos); DEFINIR com REQ de faturamento
  is_active              boolean     NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branches_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT branches_company_code_key  UNIQUE (company_id, code),
  CONSTRAINT branches_sifen_est_chk CHECK (sifen_establishment IS NULL OR sifen_establishment ~ '^[0-9]{3}$')
);

-- ---------------------------------------------------------------------------
-- 3. warehouses  (atual: depositos — usado por /api/productos)
-- ---------------------------------------------------------------------------
CREATE TABLE warehouses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid        NOT NULL REFERENCES companies(id),
  branch_id       uuid        NOT NULL,
  code            text        NOT NULL,
  name            text        NOT NULL,
  is_third_party  boolean     NOT NULL DEFAULT false,  -- depósito de terceiros (DESENHO §6.5)
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouses_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT warehouses_company_code_key  UNIQUE (company_id, code),
  CONSTRAINT warehouses_branch_fk FOREIGN KEY (company_id, branch_id) REFERENCES branches (company_id, id)
);

-- ---------------------------------------------------------------------------
-- 4. users  (atual: usuarios)
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid        NOT NULL REFERENCES companies(id),
  home_branch_id        uuid,                                 -- atual: usuarios.sucursal_id (sessão); NÃO é alcance (D-05)
  username              text        NOT NULL CHECK (username = lower(username) AND length(username) BETWEEN 1 AND 80),
  first_name            text        NOT NULL,
  last_name             text,
  email                 text,
  password_hash         text        NOT NULL,                 -- bcrypt; nunca exposto por API
  status                text        NOT NULL DEFAULT 'ACTIVO' CHECK (status IN ('ACTIVO','BLOQUEADO','BAJA')),  -- ACTIVO confirmado no código; os demais vêm do DESENHO §8
  branch_scope          text        NOT NULL DEFAULT 'ASIGNADAS' CHECK (branch_scope IN ('TODAS','ASIGNADAS')),    -- D-05: vazio nega
  warehouse_scope       text        NOT NULL DEFAULT 'ASIGNADOS' CHECK (warehouse_scope IN ('TODOS','ASIGNADOS')),
  failed_login_attempts integer     NOT NULL DEFAULT 0 CHECK (failed_login_attempts >= 0),
  locked_until          timestamptz,
  last_login_at         timestamptz,
  must_change_password  boolean     NOT NULL DEFAULT false,
  deactivated_at        timestamptz,
  access_version        integer     NOT NULL DEFAULT 1,
  created_by            uuid,
  created_by_type       text        NOT NULL DEFAULT 'PLATAFORMA' CHECK (created_by_type IN ('USUARIO','PLATAFORMA','IMPORTADO')),  -- IND-02, DESENHO §4.7.10
  document_hash         text,                                 -- HMAC do documento (IND-04)
  email_verified        boolean     NOT NULL DEFAULT false,
  mfa_enabled           boolean     NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT users_company_username_key UNIQUE (company_id, username),
  CONSTRAINT users_home_branch_fk FOREIGN KEY (company_id, home_branch_id) REFERENCES branches (company_id, id),
  CONSTRAINT users_created_by_fk  FOREIGN KEY (company_id, created_by)     REFERENCES users (company_id, id),
  CONSTRAINT users_created_by_chk CHECK ((created_by_type = 'USUARIO') = (created_by IS NOT NULL))
);
CREATE INDEX users_company_status_idx ON users (company_id, status);

-- ---------------------------------------------------------------------------
-- 5. permissions (catálogo GLOBAL, mantido pela plataforma)  (atual: permisos)
-- ---------------------------------------------------------------------------
CREATE TABLE permissions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL UNIQUE,                         -- RECURSO.ACCION (ex.: CLIENTES.VER)
  resource     text NOT NULL,
  action       text NOT NULL,
  module       text,
  scope_level  text NOT NULL DEFAULT 'EMPRESA' CHECK (scope_level IN ('EMPRESA','SUCURSAL','DEPOSITO')),
  class        text NOT NULL DEFAULT 'OPERACIONAL' CHECK (class IN ('OPERACIONAL','ADMINISTRATIVA','DATO_SENSIBLE','ACCION_CRITICA')),
  CONSTRAINT permissions_resource_action_key UNIQUE (resource, action),
  CONSTRAINT permissions_code_chk CHECK (code = resource || '.' || action)
);

-- ---------------------------------------------------------------------------
-- 6. roles  (atual: perfiles) — perfis por empresa
-- ---------------------------------------------------------------------------
CREATE TABLE roles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid        NOT NULL REFERENCES companies(id),
  code              text        NOT NULL,
  name              text        NOT NULL,
  is_administrator  boolean     NOT NULL DEFAULT false,
  is_system         boolean     NOT NULL DEFAULT false,
  is_active         boolean     NOT NULL DEFAULT true,
  version           integer     NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roles_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT roles_company_code_key  UNIQUE (company_id, code)
);

-- Permissões controladas (DATO_SENSIBLE e ACCION_CRITICA) NUNCA entram em perfil (ESC-13).
CREATE TABLE role_permissions (
  company_id     uuid NOT NULL,
  role_id        uuid NOT NULL,
  permission_id  uuid NOT NULL REFERENCES permissions(id),
  PRIMARY KEY (company_id, role_id, permission_id),
  CONSTRAINT role_permissions_role_fk FOREIGN KEY (company_id, role_id) REFERENCES roles (company_id, id) ON DELETE CASCADE
);
CREATE INDEX role_permissions_permission_idx ON role_permissions (permission_id);

CREATE OR REPLACE FUNCTION role_permissions_block_controlled() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE c text;
BEGIN
  SELECT class INTO c FROM permissions WHERE id = NEW.permission_id;
  IF c IN ('DATO_SENSIBLE','ACCION_CRITICA') THEN
    RAISE EXCEPTION 'ESC-13: permissão controlada (%) não pode estar em perfil', c USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER role_permissions_block_controlled_trg
  BEFORE INSERT OR UPDATE ON role_permissions
  FOR EACH ROW EXECUTE FUNCTION role_permissions_block_controlled();

-- ---------------------------------------------------------------------------
-- 7. user_roles (atual: usuario_perfil), user_branches, user_warehouses
-- ---------------------------------------------------------------------------
CREATE TABLE user_roles (
  company_id   uuid        NOT NULL,
  user_id      uuid        NOT NULL,
  role_id      uuid        NOT NULL,
  assigned_by  uuid,
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id, role_id),
  CONSTRAINT user_roles_user_fk FOREIGN KEY (company_id, user_id) REFERENCES users (company_id, id) ON DELETE CASCADE,
  CONSTRAINT user_roles_role_fk FOREIGN KEY (company_id, role_id) REFERENCES roles (company_id, id),
  CONSTRAINT user_roles_assigned_by_fk FOREIGN KEY (company_id, assigned_by) REFERENCES users (company_id, id)
);

CREATE TABLE user_branches (
  company_id   uuid        NOT NULL,
  user_id      uuid        NOT NULL,
  branch_id    uuid        NOT NULL,
  assigned_by  uuid,
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id, branch_id),
  CONSTRAINT user_branches_user_fk   FOREIGN KEY (company_id, user_id)   REFERENCES users (company_id, id) ON DELETE CASCADE,
  CONSTRAINT user_branches_branch_fk FOREIGN KEY (company_id, branch_id) REFERENCES branches (company_id, id),
  CONSTRAINT user_branches_by_fk     FOREIGN KEY (company_id, assigned_by) REFERENCES users (company_id, id)
);

CREATE TABLE user_warehouses (
  company_id    uuid        NOT NULL,
  user_id       uuid        NOT NULL,
  warehouse_id  uuid        NOT NULL,
  assigned_by   uuid,
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id, warehouse_id),
  CONSTRAINT user_warehouses_user_fk FOREIGN KEY (company_id, user_id)      REFERENCES users (company_id, id) ON DELETE CASCADE,
  CONSTRAINT user_warehouses_wh_fk   FOREIGN KEY (company_id, warehouse_id) REFERENCES warehouses (company_id, id),
  CONSTRAINT user_warehouses_by_fk   FOREIGN KEY (company_id, assigned_by)  REFERENCES users (company_id, id)
);

-- ---------------------------------------------------------------------------
-- 8. user_sessions (atual: sesiones_usuario) e security_events (eventos_seguridad)
-- ---------------------------------------------------------------------------
CREATE TABLE user_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid        NOT NULL,
  user_id      uuid        NOT NULL,
  token_hash   text        NOT NULL,
  ip           inet,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  CONSTRAINT user_sessions_token_hash_key UNIQUE (token_hash),
  CONSTRAINT user_sessions_user_fk FOREIGN KEY (company_id, user_id) REFERENCES users (company_id, id),
  CONSTRAINT user_sessions_exp_chk CHECK (expires_at > created_at)
);
CREATE INDEX user_sessions_user_idx ON user_sessions (company_id, user_id) WHERE revoked_at IS NULL;

CREATE TABLE security_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES companies(id),
  user_id     uuid,
  event_type  text        NOT NULL,                   -- código do código atual: LOGIN_EXITOSO, LOGIN_FALLIDO (+ ACCESO_DENEGADO etc. do REQ-002)
  details     jsonb,
  ip          inet,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT security_events_user_fk FOREIGN KEY (company_id, user_id) REFERENCES users (company_id, id)
);
CREATE INDEX security_events_company_time_idx ON security_events (company_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 9. updated_at automático
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['companies','branches','warehouses','users','roles'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t||'_set_updated_at', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 10. Row Level Security (camada adicional; DESENHO §5.3, fase 5)
-- ---------------------------------------------------------------------------
-- O papel da aplicação (dn_app) é criado fora desta proposta. Sem app.company_id
-- definido, nenhuma linha é visível nem gravável. permissions é catálogo global.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['branches','warehouses','users','roles','role_permissions','user_roles',
                           'user_branches','user_warehouses','user_sessions','security_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY %I ON %I USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id())$p$,
                   t||'_tenant_isolation', t);
  END LOOP;
END $$;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
CREATE POLICY companies_tenant_isolation ON companies
  USING (id = app_company_id()) WITH CHECK (id = app_company_id());

COMMIT;
