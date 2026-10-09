-- REQ-2026-003-P006-faturamento-down.sql — SOMENTE BANCO DESCARTÁVEL. Remove apenas objetos criados por P006.
-- NÃO usar em banco com dados: DROP TABLE apaga dados (faturas são documentos fiscais). Em banco real o rollback
-- é a restauração do backup feito antes da janela aprovada (PLANO-MIGRACAO-INGLES.md §6).
-- Não remove set_updated_at()/app_company_id() (pertencem a P001) nem tabelas de outras propostas.
BEGIN;
DROP TABLE IF EXISTS invoice_public_procurements, invoice_exports, invoice_payments, invoice_taxes,
                     invoice_lines, invoices, document_sequences CASCADE;
DROP FUNCTION IF EXISTS next_document_number(text, text, text);
DROP FUNCTION IF EXISTS invoice_children_guard();
DROP FUNCTION IF EXISTS invoices_guard();
DROP FUNCTION IF EXISTS invoices_validate_totals(uuid, uuid, numeric);
COMMIT;
