-- REQ-2026-003-P007-custeio-down.sql — SOMENTE BANCO DESCARTÁVEL. Remove apenas o que P007 criou.
-- NÃO usar em banco com dados: apaga inventory_costs e as colunas de custo congelado das linhas de movimento
-- e das faturas. Em banco real o rollback é a restauração do backup feito antes da janela aprovada.
-- Ordem: este arquivo vem ANTES do down de P006/P005 (invoice_lines e inventory_movement_lines dependem de P007).
BEGIN;
DROP VIEW IF EXISTS inventory_cost_reconciliation_v, sales_at_cost_v, inventory_valuation_v;
DROP FUNCTION IF EXISTS inventory_post_line(uuid, uuid, uuid, numeric, numeric, uuid, text, uuid);
DROP FUNCTION IF EXISTS weighted_average_cost(numeric, numeric, numeric, numeric);
DROP INDEX IF EXISTS invoice_lines_movement_line_key;
ALTER TABLE invoice_lines DROP CONSTRAINT IF EXISTS invoice_lines_movement_line_fk;
ALTER TABLE invoice_lines DROP COLUMN IF EXISTS inventory_movement_line_id;
ALTER TABLE inventory_movement_lines DROP CONSTRAINT IF EXISTS inventory_movement_lines_cost_chk;
ALTER TABLE inventory_movement_lines DROP COLUMN IF EXISTS unit_cost, DROP COLUMN IF EXISTS total_cost, DROP COLUMN IF EXISTS cost_currency_code;
DROP TABLE IF EXISTS inventory_costs;
ALTER TABLE currencies DROP COLUMN IF EXISTS minor_units;
ALTER TABLE companies DROP COLUMN IF EXISTS base_currency_code;
COMMIT;
