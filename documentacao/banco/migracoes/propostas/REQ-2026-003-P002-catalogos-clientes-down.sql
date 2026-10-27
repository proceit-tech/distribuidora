-- REQ-2026-003-P002-catalogos-clientes-down.sql — SOMENTE BANCO DESCARTÁVEL. Remove apenas objetos criados por P002.
-- NÃO usar em banco com dados: DROP TABLE apaga dados. Em banco real o rollback é a restauração do backup
-- feito antes da janela aprovada (PLANO-MIGRACAO-INGLES.md §6).
-- Não toca em P001 (companies, users, app_company_id(), set_updated_at()...).
-- ATENÇÃO: CASCADE também remove FKs que outras propostas (P003..P006) tenham criado apontando para estas tabelas
-- (p. ex. customers_price_list_fk de P004 some junto com customers). Em banco descartável, derrube P003..P006 antes.
BEGIN;
DROP TABLE IF EXISTS customer_documents, customer_addresses, customer_contacts, customers,
                     sales_channels, commercial_zones, delivery_routes, salespeople, customer_groups, payment_terms,
                     taxes, units_of_measure, incoterms, payment_methods, currencies,
                     geo_cities, geo_districts, geo_departments, geo_countries CASCADE;
DROP FUNCTION IF EXISTS customers_assign_code();
COMMIT;
