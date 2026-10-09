-- REQ-2026-003-P001-down.sql — SOMENTE BANCO DESCARTÁVEL. Remove apenas objetos criados por P001.
-- NÃO usar em banco com dados: DROP TABLE apaga dados. Em banco real o rollback é a restauração do backup
-- feito antes da janela aprovada (PLANO-MIGRACAO-INGLES.md §6).
BEGIN;
DROP TABLE IF EXISTS security_events, user_sessions, user_warehouses, user_branches, user_roles,
                     role_permissions, roles, permissions, users, warehouses, branches, companies CASCADE;
DROP FUNCTION IF EXISTS role_permissions_block_controlled();
DROP FUNCTION IF EXISTS set_updated_at();
DROP FUNCTION IF EXISTS app_user_id();
DROP FUNCTION IF EXISTS app_company_id();
COMMIT;
