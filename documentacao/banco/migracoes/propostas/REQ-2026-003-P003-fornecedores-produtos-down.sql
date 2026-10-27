-- REQ-2026-003-P003-fornecedores-produtos-down.sql — SOMENTE BANCO DESCARTÁVEL. Remove apenas objetos criados por P003.
-- NÃO usar em banco com dados: DROP TABLE apaga dados. Em banco real o rollback é a restauração do backup
-- feito antes da janela aprovada (PLANO-MIGRACAO-INGLES.md §6).
-- Atenção: CASCADE também removeria FKs de P004/P005/P006 que apontem para estas tabelas; derrube essas
-- propostas ANTES (ordem inversa: P006, P005, P004, P003).
-- Não remove set_updated_at() (pertence a P001).
BEGIN;
DROP TABLE IF EXISTS product_documents, product_components, product_alternatives, product_warehouse_settings,
                     product_suppliers, product_units, product_codes, products, product_brands, product_categories,
                     supplier_documents, supplier_withholdings, supplier_bank_accounts, supplier_addresses,
                     supplier_contacts, suppliers, supplier_groups CASCADE;
DROP FUNCTION IF EXISTS product_components_guard();
DROP FUNCTION IF EXISTS products_kit_type_guard();
COMMIT;
