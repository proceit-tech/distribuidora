-- REQ-2026-003-P005-estoque-recepciones-down.sql — SOMENTE BANCO DESCARTÁVEL. Remove apenas objetos criados por P005.
-- NÃO usar em banco com dados: DROP TABLE apaga estoque, movimentos e recepções. Em banco real o rollback é a
-- restauração do backup feito antes da janela aprovada (PLANO-MIGRACAO-INGLES.md §6).
-- Ordem de rollback: derrubar P006 (e qualquer proposta que referencie P005) ANTES deste arquivo; o CASCADE
-- removeria as FKs de quem referencia estas tabelas. Não toca em P001/P002/P003/P004 (products, suppliers, etc.).
BEGIN;
DROP TABLE IF EXISTS inventory_movement_lines, goods_receipt_lines, inventory_movements, goods_receipts,
                     stock_balances, stock_lots CASCADE;
DROP FUNCTION IF EXISTS inventory_movement_lines_guard();
DROP FUNCTION IF EXISTS inventory_movements_guard();
DROP FUNCTION IF EXISTS goods_receipts_check_branch();
COMMIT;
