-- REQ-2026-003-P004-listas-preco-down.sql — SOMENTE BANCO DESCARTÁVEL. Remove apenas objetos criados por P004.
-- NÃO usar em banco com dados: DROP TABLE apaga dados de listas de preço. Em banco real o rollback é a restauração
-- do backup feito antes da janela aprovada (PLANO-MIGRACAO-INGLES.md §6).
-- A tabela customers (P002) NÃO é apagada: só se remove a FK/índice que P004 adicionou; a coluna
-- customers.price_list_id e seus dados permanecem (voltam a ficar sem FK, como em P002).
BEGIN;
ALTER TABLE IF EXISTS customers DROP CONSTRAINT IF EXISTS customers_price_list_fk;
-- customers_price_list_idx pertence a P002 e permanece.
DROP TABLE IF EXISTS price_list_item_tiers, price_list_items, price_list_rules, price_lists;
COMMIT;
