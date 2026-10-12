-- TESTE-P001-isolamento.sql — executar em banco DESCARTÁVEL após REQ-2026-003-P001-up.sql.
-- Casos: V-ISO (A/B), V-FK, V-UQ, V-ENUM, ESC-13. Falha = exceção (psql -v ON_ERROR_STOP=1).
\set ON_ERROR_STOP 1
\i _helpers-teste.sql

-- ---- carga mínima (superusuário; contorna RLS) ----
INSERT INTO companies (id, code, legal_name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','empresa_a','Empresa A S.A.'),
  ('bbbbbbbb-0000-0000-0000-000000000001','empresa_b','Empresa B S.A.');
INSERT INTO branches (id, company_id, code, name) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000b1','aaaaaaaa-0000-0000-0000-000000000001','001','Casa Matriz A'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1','bbbbbbbb-0000-0000-0000-000000000001','001','Casa Matriz B');
INSERT INTO warehouses (id, company_id, branch_id, code, name) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000b1','D1','Depósito A1'),
  ('bbbbbbbb-0000-0000-0000-0000000000d1','bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-0000000000b1','D1','Depósito B1');
INSERT INTO users (id, company_id, username, first_name, password_hash) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000a1','aaaaaaaa-0000-0000-0000-000000000001','admin','Ana','x'),
  ('bbbbbbbb-0000-0000-0000-0000000000a1','bbbbbbbb-0000-0000-0000-000000000001','admin','Beto','x');
INSERT INTO roles (id, company_id, code, name) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000c1','aaaaaaaa-0000-0000-0000-000000000001','ADMIN','Administrador A'),
  ('bbbbbbbb-0000-0000-0000-0000000000c1','bbbbbbbb-0000-0000-0000-000000000001','ADMIN','Administrador B');
INSERT INTO permissions (id, code, resource, action, class) VALUES
  ('00000000-0000-0000-0000-0000000000f1','CLIENTES.VER','CLIENTES','VER','OPERACIONAL'),
  ('00000000-0000-0000-0000-0000000000f2','PRODUCTOS_COSTO.VER','PRODUCTOS_COSTO','VER','DATO_SENSIBLE');
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dn_app_test;

-- ---- V-UQ: mesmo username em empresas diferentes é permitido; repetido na mesma, não ----
SELECT expect_error('V-UQ username repetido na empresa A',
  $$INSERT INTO users (company_id, username, first_name, password_hash) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','admin','Outra','x')$$, '23505');
SELECT expect_error('V-UQ code de empresa repetido',
  $$INSERT INTO companies (code, legal_name) VALUES ('empresa_a','Duplicada')$$, '23505');

-- ---- V-FK: FK composta impede ligar linhas de empresas diferentes ----
SELECT expect_error('V-FK depósito da empresa A em sucursal da B',
  $$INSERT INTO warehouses (company_id, branch_id, code, name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-0000000000b1','X','X')$$, '23503');
SELECT expect_error('V-FK usuário A com perfil de B',
  $$INSERT INTO user_roles (company_id, user_id, role_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000a1','bbbbbbbb-0000-0000-0000-0000000000c1')$$, '23503');
SELECT expect_error('V-FK usuário A com sucursal de B',
  $$INSERT INTO user_branches (company_id, user_id, branch_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000a1','bbbbbbbb-0000-0000-0000-0000000000b1')$$, '23503');
SELECT expect_error('V-FK usuário A com depósito de B',
  $$INSERT INTO user_warehouses (company_id, user_id, warehouse_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000a1','bbbbbbbb-0000-0000-0000-0000000000d1')$$, '23503');
SELECT expect_error('V-FK sessão com usuário de outra empresa',
  $$INSERT INTO user_sessions (company_id, user_id, token_hash, expires_at) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-0000000000a1','h1', now()+interval '1 hour')$$, '23503');
SELECT expect_error('V-FK criado_por de outra empresa',
  $$INSERT INTO users (company_id, username, first_name, password_hash, created_by, created_by_type) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','x1','X','x','bbbbbbbb-0000-0000-0000-0000000000a1','USUARIO')$$, '23503');

-- ---- V-ENUM / ESC-13 ----
SELECT expect_error('V-ENUM estado de usuário inválido',
  $$UPDATE users SET status='ZOMBI' WHERE username='admin'$$, '23514');
SELECT expect_error('ESC-13 perfil com permissão controlada',
  $$INSERT INTO role_permissions (company_id, role_id, permission_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000f2')$$, 'P0001');
INSERT INTO role_permissions (company_id, role_id, permission_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000f1');

-- ---- V-ISO: RLS com o papel da aplicação ----
BEGIN;
SET LOCAL ROLE dn_app_test;
SELECT expect_count('V-ISO sem app.company_id nada é visível (users)', 'SELECT 1 FROM users', 0);
SELECT expect_count('V-ISO sem app.company_id nada é visível (companies)', 'SELECT 1 FROM companies', 0);
SELECT set_config('app.company_id','aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT expect_count('V-ISO A vê só os seus usuários', 'SELECT 1 FROM users', 1);
SELECT expect_count('V-ISO A vê só a sua empresa', 'SELECT 1 FROM companies', 1);
SELECT expect_count('V-ISO A não vê o usuário de B por id', $$SELECT 1 FROM users WHERE id='bbbbbbbb-0000-0000-0000-0000000000a1'$$, 0);
SELECT expect_count('V-ISO A vê só seus depósitos', 'SELECT 1 FROM warehouses', 1);
SELECT expect_error('V-ISO A não grava linha com company_id de B',
  $$INSERT INTO branches (company_id, code, name) VALUES ('bbbbbbbb-0000-0000-0000-000000000001','999','Invasora')$$, '42501');
SELECT expect_affected('V-ISO A não altera linha de B', $$UPDATE roles SET name='hack' WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não apaga linha de B', $$DELETE FROM branches WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_error('V-ISO A não troca company_id de uma linha sua para B',
  $$UPDATE branches SET company_id='bbbbbbbb-0000-0000-0000-000000000001' WHERE code='001'$$, '42501');
COMMIT;
BEGIN;
SET LOCAL ROLE dn_app_test;
SELECT set_config('app.company_id','bbbbbbbb-0000-0000-0000-000000000001', true);
SELECT expect_count('V-ISO B vê só os seus perfis', 'SELECT 1 FROM roles', 1);
SELECT expect_count('V-ISO B não vê role_permissions de A', 'SELECT 1 FROM role_permissions', 0);
COMMIT;

\echo 'TESTE-P001: TODOS OS CASOS PASSARAM'
