-- TESTE-P003-fornecedores-produtos.sql — executar em banco DESCARTÁVEL após P001-up, P002 (ou STUBS de P002)
-- e REQ-2026-003-P003-fornecedores-produtos-up.sql. Falha = exceção (psql -v ON_ERROR_STOP=1).
-- Casos: V-ISO (A/B sob RLS), V-FK (cross-tenant por família), V-UQ, V-ENUM, V-REQ, V-RULE (regras de integridade
-- implementadas no SQL: RUC/PRY, endereços PRY, principais únicos, unidade base única, kits sem auto-referência/ciclo).
-- Nota: as linhas de catálogo de P002 abaixo usam só as colunas-chave do contrato (code/name/rate_percent); se o P002 real
-- exigir mais colunas NOT NULL, ajuste APENAS os INSERTs da seção «catálogos P002».
\set ON_ERROR_STOP 1
\i _helpers-teste.sql

-- ---- carga mínima (superusuário; contorna RLS) ----
INSERT INTO companies (id, code, legal_name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','empresa_a','Empresa A S.A.'), ('bbbbbbbb-0000-0000-0000-000000000001','empresa_b','Empresa B S.A.');
INSERT INTO branches (id, company_id, code, name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000b01','aaaaaaaa-0000-0000-0000-000000000001','001','Matriz A'), ('bbbbbbbb-0000-0000-0000-000000000b01','bbbbbbbb-0000-0000-0000-000000000001','001','Matriz B');
INSERT INTO warehouses (id, company_id, branch_id, code, name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000d01','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000b01','D1','Depósito A1'), ('bbbbbbbb-0000-0000-0000-000000000d01','bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000b01','D1','Depósito B1');
INSERT INTO users (id, company_id, username, first_name, password_hash) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000a01','aaaaaaaa-0000-0000-0000-000000000001','admin','Ana','x'), ('bbbbbbbb-0000-0000-0000-000000000a01','bbbbbbbb-0000-0000-0000-000000000001','admin','Beto','x');
-- catálogos P002
INSERT INTO currencies (code, name) VALUES ('PYG','Guaraní'), ('USD','Dólar');
INSERT INTO incoterms (code, name) VALUES ('FOB','Free on Board');
INSERT INTO payment_methods (id, code, name) VALUES ('d0000000-0000-0000-0000-000000000001','TRF','Transferencia');
INSERT INTO units_of_measure (id, code, name) VALUES ('c0000000-0000-0000-0000-000000000001','UN','Unidad'), ('c0000000-0000-0000-0000-000000000002','CJ','Caja');
INSERT INTO taxes (id, code, name, rate_percent) VALUES ('e0000000-0000-0000-0000-000000000001','IVA10','IVA 10%',10);
INSERT INTO payment_terms (id, company_id, code, name) VALUES ('aaaaaaaa-0000-0000-0000-000000000e01','aaaaaaaa-0000-0000-0000-000000000001','C30','Crédito 30'), ('bbbbbbbb-0000-0000-0000-000000000e01','bbbbbbbb-0000-0000-0000-000000000001','C30','Crédito 30');

-- fornecedores
INSERT INTO supplier_groups (id, company_id, code, name) VALUES ('aaaaaaaa-0000-0000-0000-000000000101','aaaaaaaa-0000-0000-0000-000000000001','G1','Grupo A'), ('bbbbbbbb-0000-0000-0000-000000000101','bbbbbbbb-0000-0000-0000-000000000001','G1','Grupo B');
INSERT INTO suppliers (id, company_id, code, tax_id, tax_id_check_digit, legal_name, supplier_group_id, payment_term_id, default_currency_code, incoterm_code, preferred_payment_method_id, created_by) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000201','aaaaaaaa-0000-0000-0000-000000000001','PRV-000001','80012345','7','Proveedor A1','aaaaaaaa-0000-0000-0000-000000000101','aaaaaaaa-0000-0000-0000-000000000e01','PYG','FOB','d0000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000a01'),
  ('bbbbbbbb-0000-0000-0000-000000000201','bbbbbbbb-0000-0000-0000-000000000001','PRV-000001','80012345','7','Proveedor B1','bbbbbbbb-0000-0000-0000-000000000101','bbbbbbbb-0000-0000-0000-000000000e01','PYG','FOB',NULL,'bbbbbbbb-0000-0000-0000-000000000a01');   -- mesmo code/RUC em outra empresa é permitido
INSERT INTO suppliers (id, company_id, code, tax_id_type, tax_id, legal_name, country_code) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000202','aaaaaaaa-0000-0000-0000-000000000001','PRV-000002','CUIT','30712345678','Proveedor A2 Argentina','ARG');
INSERT INTO supplier_contacts (company_id, supplier_id, first_name, is_primary, email) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000201','Carlos',true,'c@x.com'), ('bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000201','Berta',true,NULL);
INSERT INTO supplier_addresses (company_id, supplier_id, address_type, description, street_address, country_code, department_code, district_code, city_code, is_primary) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000201','FISCAL','Sede','Av. 1','PRY',1,1,1,true), ('bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000201','FISCAL','Sede','Av. 1','PRY',1,1,1,true);
INSERT INTO supplier_bank_accounts (company_id, supplier_id, bank_name, account_holder, account_number, currency_code, is_primary) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000201','Banco X','Proveedor A1','123456','PYG',true), ('bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000201','Banco X','Proveedor B1','123456','PYG',true);
INSERT INTO supplier_withholdings (company_id, supplier_id, withholding_type, rate_pct, tax_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000201','IVA',30,'e0000000-0000-0000-0000-000000000001'), ('bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000201','IVA',30,NULL);
INSERT INTO supplier_documents (company_id, supplier_id, document_type, file_name, file_url, created_by) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000201','CONTRATO','c.pdf','https://x/c.pdf','aaaaaaaa-0000-0000-0000-000000000a01'), ('bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000201','CONTRATO','c.pdf','https://x/c.pdf','bbbbbbbb-0000-0000-0000-000000000a01');

-- produtos
INSERT INTO product_categories (id, company_id, code, name) VALUES ('aaaaaaaa-0000-0000-0000-000000000301','aaaaaaaa-0000-0000-0000-000000000001','C1','Cat A'), ('bbbbbbbb-0000-0000-0000-000000000301','bbbbbbbb-0000-0000-0000-000000000001','C1','Cat B');
INSERT INTO product_brands (id, company_id, name) VALUES ('aaaaaaaa-0000-0000-0000-000000000401','aaaaaaaa-0000-0000-0000-000000000001','Marca A'), ('bbbbbbbb-0000-0000-0000-000000000401','bbbbbbbb-0000-0000-0000-000000000001','Marca B');
INSERT INTO products (id, company_id, code, description, invoice_description, unit_of_measure_id, product_type, category_id, brand_id, tax_id, created_by) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000501','aaaaaaaa-0000-0000-0000-000000000001','P-001','Producto 1','Producto 1','c0000000-0000-0000-0000-000000000001','MERCADERIA','aaaaaaaa-0000-0000-0000-000000000301','aaaaaaaa-0000-0000-0000-000000000401','e0000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000a01'),
  ('aaaaaaaa-0000-0000-0000-000000000502','aaaaaaaa-0000-0000-0000-000000000001','P-002','Producto 2','Producto 2','c0000000-0000-0000-0000-000000000001','MERCADERIA',NULL,NULL,NULL,NULL),
  ('aaaaaaaa-0000-0000-0000-000000000503','aaaaaaaa-0000-0000-0000-000000000001','K-001','Kit 1','Kit 1','c0000000-0000-0000-0000-000000000001','KIT',NULL,NULL,NULL,NULL),
  ('aaaaaaaa-0000-0000-0000-000000000504','aaaaaaaa-0000-0000-0000-000000000001','K-002','Kit 2','Kit 2','c0000000-0000-0000-0000-000000000001','KIT',NULL,NULL,NULL,NULL),
  ('aaaaaaaa-0000-0000-0000-000000000505','aaaaaaaa-0000-0000-0000-000000000001','K-003','Kit 3','Kit 3','c0000000-0000-0000-0000-000000000001','KIT',NULL,NULL,NULL,NULL),
  ('bbbbbbbb-0000-0000-0000-000000000501','bbbbbbbb-0000-0000-0000-000000000001','P-001','Producto B1','Producto B1','c0000000-0000-0000-0000-000000000001','MERCADERIA','bbbbbbbb-0000-0000-0000-000000000301','bbbbbbbb-0000-0000-0000-000000000401',NULL,'bbbbbbbb-0000-0000-0000-000000000a01'),   -- mesmo code em outra empresa é permitido
  ('bbbbbbbb-0000-0000-0000-000000000503','bbbbbbbb-0000-0000-0000-000000000001','K-001','Kit B1','Kit B1','c0000000-0000-0000-0000-000000000001','KIT',NULL,NULL,NULL,NULL);
INSERT INTO product_codes (company_id, product_id, code_type, code, is_primary) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000501','GTIN','7891234567895',true), ('bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000501','GTIN','7891234567895',true);
INSERT INTO product_units (company_id, product_id, unit_of_measure_id, presentation_name, conversion_factor, is_base_unit) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000501','c0000000-0000-0000-0000-000000000001','Unidad',1,true),
  ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000501','c0000000-0000-0000-0000-000000000002','Caja x12',12,false),
  ('bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000501','c0000000-0000-0000-0000-000000000001','Unidad',1,true);
INSERT INTO product_suppliers (company_id, product_id, supplier_id, reference_cost, currency_code, is_primary) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000501','aaaaaaaa-0000-0000-0000-000000000201',1000.5,'PYG',true), ('bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000501','bbbbbbbb-0000-0000-0000-000000000201',2000,'PYG',true);
INSERT INTO product_warehouse_settings (company_id, product_id, warehouse_id, min_stock) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000501','aaaaaaaa-0000-0000-0000-000000000d01',5), ('bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000501','bbbbbbbb-0000-0000-0000-000000000d01',5);
INSERT INTO product_alternatives (company_id, product_id, alternative_product_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000501','aaaaaaaa-0000-0000-0000-000000000502');
INSERT INTO product_components (company_id, kit_product_id, component_product_id, quantity) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000503','aaaaaaaa-0000-0000-0000-000000000501',2), ('bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000503','bbbbbbbb-0000-0000-0000-000000000501',1);
INSERT INTO product_documents (company_id, product_id, document_type, file_name, file_url, uploaded_by) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000501','FICHA_TECNICA','f.pdf','https://x/f.pdf','aaaaaaaa-0000-0000-0000-000000000a01'), ('bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000501','FICHA_TECNICA','f.pdf','https://x/f.pdf','bbbbbbbb-0000-0000-0000-000000000a01');
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dn_app_test;

-- ---- V-FK: FK composta impede ligar linhas de empresas diferentes (uma por família) ----
SELECT expect_error('V-FK fornecedor A com grupo de B',
  $$INSERT INTO suppliers (company_id, tax_id, tax_id_type, legal_name, country_code, supplier_group_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','111','OTRO','X','ARG','bbbbbbbb-0000-0000-0000-000000000101')$$, '23503');
SELECT expect_error('V-FK fornecedor A com condição de pagamento de B',
  $$INSERT INTO suppliers (company_id, tax_id, tax_id_type, legal_name, country_code, payment_term_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','111','OTRO','X','ARG','bbbbbbbb-0000-0000-0000-000000000e01')$$, '23503');
SELECT expect_error('V-FK fornecedor A com created_by de B',
  $$INSERT INTO suppliers (company_id, tax_id, tax_id_type, legal_name, country_code, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','111','OTRO','X','ARG','bbbbbbbb-0000-0000-0000-000000000a01')$$, '23503');
SELECT expect_error('V-FK contato de A em fornecedor de B',
  $$INSERT INTO supplier_contacts (company_id, supplier_id, first_name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000201','X')$$, '23503');
SELECT expect_error('V-FK endereço de A em fornecedor de B',
  $$INSERT INTO supplier_addresses (company_id, supplier_id, address_type, description, street_address, country_code, department_code, district_code, city_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000201','FISCAL','d','s','PRY',1,1,1)$$, '23503');
SELECT expect_error('V-FK conta bancária de A em fornecedor de B',
  $$INSERT INTO supplier_bank_accounts (company_id, supplier_id, bank_name, account_holder, account_number, currency_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000201','B','H','999','PYG')$$, '23503');
SELECT expect_error('V-FK retenção de A em fornecedor de B',
  $$INSERT INTO supplier_withholdings (company_id, supplier_id, withholding_type, rate_pct) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000201','IVA',10)$$, '23503');
SELECT expect_error('V-FK documento de fornecedor de A em fornecedor de B',
  $$INSERT INTO supplier_documents (company_id, supplier_id, file_name, file_url) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000201','f','u')$$, '23503');
SELECT expect_error('V-FK documento de fornecedor com created_by de B',
  $$INSERT INTO supplier_documents (company_id, supplier_id, file_name, file_url, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000201','f','u','bbbbbbbb-0000-0000-0000-000000000a01')$$, '23503');
SELECT expect_error('V-FK produto A com categoria de B',
  $$INSERT INTO products (company_id, code, description, invoice_description, unit_of_measure_id, category_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','X1','d','d','c0000000-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000301')$$, '23503');
SELECT expect_error('V-FK produto A com marca de B',
  $$INSERT INTO products (company_id, code, description, invoice_description, unit_of_measure_id, brand_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','X2','d','d','c0000000-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000401')$$, '23503');
SELECT expect_error('V-FK produto A com created_by de B',
  $$INSERT INTO products (company_id, code, description, invoice_description, unit_of_measure_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','X3','d','d','c0000000-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000a01')$$, '23503');
SELECT expect_error('V-FK código de A em produto de B',
  $$INSERT INTO product_codes (company_id, product_id, code_type, code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000501','OTRO','Z')$$, '23503');
SELECT expect_error('V-FK apresentação de A em produto de B',
  $$INSERT INTO product_units (company_id, product_id, unit_of_measure_id, presentation_name, conversion_factor) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000501','c0000000-0000-0000-0000-000000000001','U',1)$$, '23503');
SELECT expect_error('V-FK produto-fornecedor: produto de B',
  $$INSERT INTO product_suppliers (company_id, product_id, supplier_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000501','aaaaaaaa-0000-0000-0000-000000000201')$$, '23503');
SELECT expect_error('V-FK produto-fornecedor: fornecedor de B',
  $$INSERT INTO product_suppliers (company_id, product_id, supplier_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000502','bbbbbbbb-0000-0000-0000-000000000201')$$, '23503');
SELECT expect_error('V-FK política de estoque com depósito de B',
  $$INSERT INTO product_warehouse_settings (company_id, product_id, warehouse_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000502','bbbbbbbb-0000-0000-0000-000000000d01')$$, '23503');
SELECT expect_error('V-FK política de estoque com produto de B',
  $$INSERT INTO product_warehouse_settings (company_id, product_id, warehouse_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000501','aaaaaaaa-0000-0000-0000-000000000d01')$$, '23503');
SELECT expect_error('V-FK alternativo de B',
  $$INSERT INTO product_alternatives (company_id, product_id, alternative_product_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000502','bbbbbbbb-0000-0000-0000-000000000501')$$, '23503');
SELECT expect_error('V-FK componente de B em kit de A',
  $$INSERT INTO product_components (company_id, kit_product_id, component_product_id, quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000504','bbbbbbbb-0000-0000-0000-000000000501',1)$$, '23503');
SELECT expect_error('V-FK documento de produto de A em produto de B',
  $$INSERT INTO product_documents (company_id, product_id, file_name, file_url) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000501','f','u')$$, '23503');
SELECT expect_error('V-FK documento de produto com uploaded_by de B',
  $$INSERT INTO product_documents (company_id, product_id, file_name, file_url, uploaded_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000501','f','u','bbbbbbbb-0000-0000-0000-000000000a01')$$, '23503');
-- FKs simples para catálogos globais de P002
SELECT expect_error('V-FK moeda inexistente (fornecedor)',
  $$INSERT INTO suppliers (company_id, tax_id, tax_id_type, legal_name, country_code, default_currency_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','111','OTRO','X','ARG','XXX')$$, '23503');
SELECT expect_error('V-FK incoterm inexistente',
  $$INSERT INTO suppliers (company_id, tax_id, tax_id_type, legal_name, country_code, incoterm_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','111','OTRO','X','ARG','ZZZ')$$, '23503');
SELECT expect_error('V-FK moeda inexistente (conta bancária)',
  $$INSERT INTO supplier_bank_accounts (company_id, supplier_id, bank_name, account_holder, account_number, currency_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000201','B','H','888','XXX')$$, '23503');
SELECT expect_error('V-FK unidade de medida inexistente (produto)',
  $$INSERT INTO products (company_id, code, description, invoice_description, unit_of_measure_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','X4','d','d','c0000000-0000-0000-0000-0000000000ff')$$, '23503');
SELECT expect_error('V-FK imposto inexistente (produto)',
  $$INSERT INTO products (company_id, code, description, invoice_description, unit_of_measure_id, tax_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','X5','d','d','c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-0000000000ff')$$, '23503');

-- ---- V-UQ ----
SELECT expect_error('V-UQ código de fornecedor repetido na empresa',
  $$INSERT INTO suppliers (company_id, code, tax_id, tax_id_type, legal_name, country_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','PRV-000001','999','OTRO','X','ARG')$$, '23505');
SELECT expect_error('V-UQ mesmo (tipo, número) de documento na empresa',
  $$INSERT INTO suppliers (company_id, tax_id, tax_id_check_digit, legal_name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','80012345','7','Duplicado')$$, '23505');
SELECT expect_affected('V-UQ fornecedores sem código não colidem entre si (code NULL)',
  $$INSERT INTO suppliers (company_id, tax_id, tax_id_type, legal_name, country_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','n1','OTRO','Sem codigo 1','ARG'), ('aaaaaaaa-0000-0000-0000-000000000001','n2','OTRO','Sem codigo 2','ARG')$$, 2);
SELECT expect_error('V-UQ segundo contato principal do fornecedor',
  $$INSERT INTO supplier_contacts (company_id, supplier_id, first_name, is_primary) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000201','Outro',true)$$, '23505');
SELECT expect_affected('V-UQ contato não principal adicional é permitido',
  $$INSERT INTO supplier_contacts (company_id, supplier_id, first_name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000201','Outro')$$, 1);
SELECT expect_error('V-UQ segundo endereço principal do mesmo tipo',
  $$INSERT INTO supplier_addresses (company_id, supplier_id, address_type, description, street_address, country_code, department_code, district_code, city_code, is_primary) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000201','FISCAL','d','s','PRY',1,1,1,true)$$, '23505');
SELECT expect_affected('V-UQ endereço principal de OUTRO tipo é permitido',
  $$INSERT INTO supplier_addresses (company_id, supplier_id, address_type, description, street_address, country_code, department_code, district_code, city_code, is_primary) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000201','COMERCIAL','d','s','PRY',1,1,1,true)$$, 1);
SELECT expect_error('V-UQ conta bancária repetida para o fornecedor',
  $$INSERT INTO supplier_bank_accounts (company_id, supplier_id, bank_name, account_holder, account_number, currency_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000201','Outro','H','123456','USD')$$, '23505');
SELECT expect_error('V-UQ segunda conta bancária principal',
  $$INSERT INTO supplier_bank_accounts (company_id, supplier_id, bank_name, account_holder, account_number, currency_code, is_primary) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000201','Outro','H','777','USD',true)$$, '23505');
SELECT expect_error('V-UQ código de produto repetido na empresa',
  $$INSERT INTO products (company_id, code, description, invoice_description, unit_of_measure_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','P-001','d','d','c0000000-0000-0000-0000-000000000001')$$, '23505');
SELECT expect_error('V-UQ mesmo código/tipo repetido no produto',
  $$INSERT INTO product_codes (company_id, product_id, code_type, code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000501','GTIN','7891234567895')$$, '23505');
SELECT expect_error('V-UQ segundo código principal do produto',
  $$INSERT INTO product_codes (company_id, product_id, code_type, code, is_primary) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000501','OTRO','Z9',true)$$, '23505');
SELECT expect_error('V-UQ segunda unidade base do produto',
  $$INSERT INTO product_units (company_id, product_id, unit_of_measure_id, presentation_name, conversion_factor, is_base_unit) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000501','c0000000-0000-0000-0000-000000000002','Outra base',1,true)$$, '23505');
SELECT expect_affected('V-UQ uma base por produto: outro produto pode ter a sua',
  $$INSERT INTO product_units (company_id, product_id, unit_of_measure_id, presentation_name, conversion_factor, is_base_unit) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000502','c0000000-0000-0000-0000-000000000001','Unidad',1,true)$$, 1);
SELECT expect_error('V-UQ segundo fornecedor principal do produto',
  $$INSERT INTO product_suppliers (company_id, product_id, supplier_id, is_primary) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000501','aaaaaaaa-0000-0000-0000-000000000202',true)$$, '23505');
SELECT expect_error('V-UQ depósito repetido na política do produto',
  $$INSERT INTO product_warehouse_settings (company_id, product_id, warehouse_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000501','aaaaaaaa-0000-0000-0000-000000000d01')$$, '23505');

-- ---- V-ENUM: CHECK de estado/tipo com os valores EXATOS do código ----
SELECT expect_error('V-ENUM suppliers.person_type',            $$UPDATE suppliers SET person_type='X' WHERE id='aaaaaaaa-0000-0000-0000-000000000201'$$, '23514');
SELECT expect_error('V-ENUM suppliers.homologation_status',    $$UPDATE suppliers SET homologation_status='APROBADO' WHERE id='aaaaaaaa-0000-0000-0000-000000000201'$$, '23514');
SELECT expect_error('V-ENUM suppliers.risk_level',             $$UPDATE suppliers SET risk_level='EXTREMO' WHERE id='aaaaaaaa-0000-0000-0000-000000000201'$$, '23514');
SELECT expect_error('V-ENUM suppliers.preferred_transport_method', $$UPDATE suppliers SET preferred_transport_method='BARCO' WHERE id='aaaaaaaa-0000-0000-0000-000000000201'$$, '23514');
SELECT expect_error('V-ENUM supplier_addresses.address_type',  $$UPDATE supplier_addresses SET address_type='CASA' WHERE company_id='aaaaaaaa-0000-0000-0000-000000000001'$$, '23514');
SELECT expect_error('V-ENUM supplier_bank_accounts.account_type', $$UPDATE supplier_bank_accounts SET account_type='POUPANCA' WHERE company_id='aaaaaaaa-0000-0000-0000-000000000001'$$, '23514');
SELECT expect_error('V-ENUM supplier_withholdings.withholding_type', $$UPDATE supplier_withholdings SET withholding_type='ISR' WHERE company_id='aaaaaaaa-0000-0000-0000-000000000001'$$, '23514');
SELECT expect_error('V-ENUM supplier_documents.document_type', $$UPDATE supplier_documents SET document_type='FOTO' WHERE company_id='aaaaaaaa-0000-0000-0000-000000000001'$$, '23514');
SELECT expect_error('V-ENUM products.product_type',            $$UPDATE products SET product_type='OTRO' WHERE id='aaaaaaaa-0000-0000-0000-000000000502'$$, '23514');
SELECT expect_error('V-ENUM products.stock_control_mode',      $$UPDATE products SET stock_control_mode='SERIE' WHERE id='aaaaaaaa-0000-0000-0000-000000000502'$$, '23514');
SELECT expect_error('V-ENUM products.goods_relation',          $$UPDATE products SET goods_relation=3 WHERE id='aaaaaaaa-0000-0000-0000-000000000502'$$, '23514');
SELECT expect_error('V-ENUM product_codes.code_type',          $$UPDATE product_codes SET code_type='QR' WHERE company_id='aaaaaaaa-0000-0000-0000-000000000001'$$, '23514');
SELECT expect_error('V-ENUM product_alternatives.alternative_type', $$UPDATE product_alternatives SET alternative_type='RIVAL' WHERE company_id='aaaaaaaa-0000-0000-0000-000000000001'$$, '23514');
SELECT expect_error('V-ENUM product_documents.document_type',  $$UPDATE product_documents SET document_type='VIDEO' WHERE company_id='aaaaaaaa-0000-0000-0000-000000000001'$$, '23514');
SELECT expect_affected('V-ENUM valores válidos aceitos (SKU_PROVEEDOR, CAJA_AHORRO, EN_EVALUACION)',
  $$WITH a AS (UPDATE suppliers SET homologation_status='EN_EVALUACION' WHERE id='aaaaaaaa-0000-0000-0000-000000000201' RETURNING 1),
        b AS (UPDATE supplier_bank_accounts SET account_type='CAJA_AHORRO' WHERE company_id='aaaaaaaa-0000-0000-0000-000000000001' RETURNING 1),
        c AS (INSERT INTO product_codes (company_id, product_id, code_type, code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000501','SKU_PROVEEDOR','S-1') RETURNING 1)
    SELECT 1$$, 1);

-- ---- V-REQ: NOT NULL críticos ----
SELECT expect_error('V-REQ fornecedor sem razão social',   $$INSERT INTO suppliers (company_id, tax_id, tax_id_type, country_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','q1','OTRO','ARG')$$, '23502');
SELECT expect_error('V-REQ fornecedor sem número de documento', $$INSERT INTO suppliers (company_id, tax_id_type, legal_name, country_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','OTRO','X','ARG')$$, '23502');
SELECT expect_error('V-REQ fornecedor com razão social em branco', $$INSERT INTO suppliers (company_id, tax_id, tax_id_type, legal_name, country_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','q2','OTRO','   ','ARG')$$, '23514');
SELECT expect_error('V-REQ contato sem nome',              $$INSERT INTO supplier_contacts (company_id, supplier_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000201')$$, '23502');
SELECT expect_error('V-REQ endereço sem logradouro',       $$INSERT INTO supplier_addresses (company_id, supplier_id, address_type, description, country_code, department_code, district_code, city_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000201','OTRA','d','PRY',1,1,1)$$, '23502');
SELECT expect_error('V-REQ conta bancária sem número',     $$INSERT INTO supplier_bank_accounts (company_id, supplier_id, bank_name, account_holder, currency_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000201','B','H','PYG')$$, '23502');
SELECT expect_error('V-REQ conta bancária sem moeda',      $$INSERT INTO supplier_bank_accounts (company_id, supplier_id, bank_name, account_holder, account_number) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000201','B','H','555')$$, '23502');
SELECT expect_error('V-REQ retenção sem percentual',       $$INSERT INTO supplier_withholdings (company_id, supplier_id, withholding_type) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000201','IVA')$$, '23502');
SELECT expect_error('V-REQ documento de fornecedor sem URL', $$INSERT INTO supplier_documents (company_id, supplier_id, file_name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000201','f')$$, '23502');
SELECT expect_error('V-REQ produto sem company_id',        $$INSERT INTO products (code, description, invoice_description, unit_of_measure_id) VALUES ('Q1','d','d','c0000000-0000-0000-0000-000000000001')$$, '23502');
SELECT expect_error('V-REQ produto sem código',            $$INSERT INTO products (company_id, description, invoice_description, unit_of_measure_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','d','d','c0000000-0000-0000-0000-000000000001')$$, '23502');
SELECT expect_error('V-REQ produto sem descrição',         $$INSERT INTO products (company_id, code, invoice_description, unit_of_measure_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','Q2','d','c0000000-0000-0000-0000-000000000001')$$, '23502');
SELECT expect_error('V-REQ produto sem descrição de fatura', $$INSERT INTO products (company_id, code, description, unit_of_measure_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','Q3','d','c0000000-0000-0000-0000-000000000001')$$, '23502');
SELECT expect_error('V-REQ produto sem unidade base',      $$INSERT INTO products (company_id, code, description, invoice_description) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','Q4','d','d')$$, '23502');
SELECT expect_error('V-REQ apresentação sem fator',        $$INSERT INTO product_units (company_id, product_id, unit_of_measure_id, presentation_name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000502','c0000000-0000-0000-0000-000000000002','Caja')$$, '23502');
SELECT expect_error('V-REQ apresentação com fator 0',      $$INSERT INTO product_units (company_id, product_id, unit_of_measure_id, presentation_name, conversion_factor) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000502','c0000000-0000-0000-0000-000000000002','Caja',0)$$, '23514');
SELECT expect_error('V-REQ componente sem quantidade',     $$INSERT INTO product_components (company_id, kit_product_id, component_product_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000504','aaaaaaaa-0000-0000-0000-000000000502')$$, '23502');
SELECT expect_error('V-REQ componente com quantidade 0',   $$INSERT INTO product_components (company_id, kit_product_id, component_product_id, quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000504','aaaaaaaa-0000-0000-0000-000000000502',0)$$, '23514');

-- ---- V-RULE: regras de integridade implementadas no SQL ----
-- fornecedor: PRY/RUC/DV (regras 4 e 5 do mapeamento)
SELECT expect_error('V-RULE país PRY exige tipo RUC',      $$INSERT INTO suppliers (company_id, tax_id, tax_id_type, legal_name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','1234','CEDULA','X')$$, '23514');
SELECT expect_error('V-RULE RUC com mais de 8 dígitos',    $$INSERT INTO suppliers (company_id, tax_id, tax_id_check_digit, legal_name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','123456789','1','X')$$, '23514');
SELECT expect_error('V-RULE RUC sem DV',                   $$INSERT INTO suppliers (company_id, tax_id, legal_name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','1234567','X')$$, '23514');
SELECT expect_error('V-RULE DV com dois dígitos',          $$INSERT INTO suppliers (company_id, tax_id, tax_id_check_digit, legal_name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','1234567','12','X')$$, '23514');
SELECT expect_error('V-RULE DV em documento que não é RUC', $$INSERT INTO suppliers (company_id, tax_id, tax_id_type, tax_id_check_digit, legal_name, country_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','abc','OTRO','1','X','ARG')$$, '23514');
SELECT expect_error('V-RULE documento com espaços',        $$INSERT INTO suppliers (company_id, tax_id, tax_id_type, legal_name, country_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','12 34','OTRO','X','ARG')$$, '23514');
SELECT expect_error('V-RULE país em minúsculas',           $$INSERT INTO suppliers (company_id, tax_id, tax_id_type, legal_name, country_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','c1','OTRO','X','arg')$$, '23514');
SELECT expect_error('V-RULE desconto comercial > 100',     $$UPDATE suppliers SET commercial_discount_pct=100.01 WHERE id='aaaaaaaa-0000-0000-0000-000000000201'$$, '23514');
SELECT expect_error('V-RULE dia de pagamento 32',          $$UPDATE suppliers SET preferred_payment_day=32 WHERE id='aaaaaaaa-0000-0000-0000-000000000201'$$, '23514');
SELECT expect_error('V-RULE prazo de entrega negativo',    $$UPDATE suppliers SET lead_time_days=-1 WHERE id='aaaaaaaa-0000-0000-0000-000000000201'$$, '23514');
SELECT expect_error('V-RULE monto mínimo negativo',        $$UPDATE suppliers SET minimum_purchase_amount=-1 WHERE id='aaaaaaaa-0000-0000-0000-000000000201'$$, '23514');
SELECT expect_error('V-RULE calificación > 100',           $$UPDATE suppliers SET current_rating=101 WHERE id='aaaaaaaa-0000-0000-0000-000000000201'$$, '23514');
SELECT expect_error('V-RULE e-mail inválido',              $$UPDATE suppliers SET email='sem-arroba' WHERE id='aaaaaaaa-0000-0000-0000-000000000201'$$, '23514');
SELECT expect_error('V-RULE site que não é http/https',    $$UPDATE suppliers SET website='ftp://x.com' WHERE id='aaaaaaaa-0000-0000-0000-000000000201'$$, '23514');
SELECT expect_error('V-RULE fim da relação anterior ao início', $$UPDATE suppliers SET relationship_start_date='2026-02-01', relationship_end_date='2026-01-01' WHERE id='aaaaaaaa-0000-0000-0000-000000000201'$$, '23514');
SELECT expect_error('V-RULE vencimento da homologação anterior à homologação', $$UPDATE suppliers SET homologation_date='2026-02-01', homologation_expiry_date='2026-01-01' WHERE id='aaaaaaaa-0000-0000-0000-000000000201'$$, '23514');
SELECT expect_error('V-RULE retenção > 100%',              $$UPDATE supplier_withholdings SET rate_pct=100.5 WHERE company_id='aaaaaaaa-0000-0000-0000-000000000001'$$, '23514');
SELECT expect_error('V-RULE vigência da retenção invertida', $$UPDATE supplier_withholdings SET valid_from='2026-02-01', valid_to='2026-01-01' WHERE company_id='aaaaaaaa-0000-0000-0000-000000000001'$$, '23514');
SELECT expect_error('V-RULE vencimento do documento anterior à emissão', $$UPDATE supplier_documents SET issue_date='2026-02-01', expiry_date='2026-01-01' WHERE company_id='aaaaaaaa-0000-0000-0000-000000000001'$$, '23514');
-- endereços: PRY exige códigos geográficos; fora de PRY os códigos ficam NULL (regra 14)
SELECT expect_error('V-RULE endereço PRY sem códigos geográficos', $$INSERT INTO supplier_addresses (company_id, supplier_id, address_type, description, street_address, country_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000201','OTRA','d','s','PRY')$$, '23514');
SELECT expect_error('V-RULE endereço fora de PRY com códigos geográficos', $$INSERT INTO supplier_addresses (company_id, supplier_id, address_type, description, street_address, country_code, department_code, district_code, city_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000201','OTRA','d','s','ARG',1,1,1)$$, '23514');
SELECT expect_affected('V-RULE endereço fora de PRY só com texto livre é aceito',
  $$INSERT INTO supplier_addresses (company_id, supplier_id, address_type, description, street_address, country_code, department_name, district_name, city_name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000202','OTRA','d','s','ARG','Buenos Aires','CABA','Palermo')$$, 1);
-- produto
SELECT expect_error('V-RULE GTIN com letras',              $$INSERT INTO product_codes (company_id, product_id, code_type, code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000502','GTIN','ABC12345')$$, '23514');
SELECT expect_error('V-RULE EAN com 7 dígitos',            $$INSERT INTO product_codes (company_id, product_id, code_type, code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000502','EAN','1234567')$$, '23514');
SELECT expect_affected('V-RULE CODIGO_ALTERNO aceita texto livre', $$INSERT INTO product_codes (company_id, product_id, code_type, code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000502','CODIGO_ALTERNO','ABC-1')$$, 1);
SELECT expect_error('V-RULE estoque mínimo negativo',      $$UPDATE products SET min_stock=-1 WHERE id='aaaaaaaa-0000-0000-0000-000000000502'$$, '23514');
SELECT expect_error('V-RULE custo médio negativo',         $$UPDATE products SET average_cost=-0.0001 WHERE id='aaaaaaaa-0000-0000-0000-000000000502'$$, '23514');
SELECT expect_error('V-RULE merma > 100%',                 $$UPDATE products SET shrinkage_percent=100.1 WHERE id='aaaaaaaa-0000-0000-0000-000000000502'$$, '23514');
SELECT expect_error('V-RULE país de origem inválido',      $$UPDATE products SET origin_country_code='PY' WHERE id='aaaaaaaa-0000-0000-0000-000000000502'$$, '23514');
SELECT expect_error('V-RULE código de produto em branco',  $$INSERT INTO products (company_id, code, description, invoice_description, unit_of_measure_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','  ','d','d','c0000000-0000-0000-0000-000000000001')$$, '23514');
SELECT expect_error('V-RULE descrição de fatura > 120',    $$UPDATE products SET invoice_description=repeat('x',121) WHERE id='aaaaaaaa-0000-0000-0000-000000000502'$$, '23514');
SELECT expect_error('V-RULE vencimento do documento de produto anterior à emissão', $$UPDATE product_documents SET issued_on='2026-02-01', expires_on='2026-01-01' WHERE company_id='aaaaaaaa-0000-0000-0000-000000000001'$$, '23514');
SELECT expect_error('V-RULE prioridade de alternativo 0',  $$UPDATE product_alternatives SET priority=0 WHERE company_id='aaaaaaaa-0000-0000-0000-000000000001'$$, '23514');
SELECT expect_error('V-RULE produto alternativo de si mesmo', $$INSERT INTO product_alternatives (company_id, product_id, alternative_product_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000502','aaaaaaaa-0000-0000-0000-000000000502')$$, '23514');
-- kits: auto-referência, só KIT tem componentes, sem ciclos (kits dentro de kits são permitidos)
SELECT expect_error('V-RULE kit não pode conter a si mesmo', $$INSERT INTO product_components (company_id, kit_product_id, component_product_id, quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000504','aaaaaaaa-0000-0000-0000-000000000504',1)$$, '23514');
SELECT expect_error('V-RULE produto MERCADERIA não pode ter componentes', $$INSERT INTO product_components (company_id, kit_product_id, component_product_id, quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000502','aaaaaaaa-0000-0000-0000-000000000501',1)$$, 'P0001');
SELECT expect_affected('V-RULE kit dentro de kit é permitido (K1 contém K2)', $$INSERT INTO product_components (company_id, kit_product_id, component_product_id, quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000503','aaaaaaaa-0000-0000-0000-000000000504',1)$$, 1);
SELECT expect_error('V-RULE ciclo direto (K2 contém K1, K1 contém K2)', $$INSERT INTO product_components (company_id, kit_product_id, component_product_id, quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000504','aaaaaaaa-0000-0000-0000-000000000503',1)$$, 'P0001');
SELECT expect_affected('V-RULE cadeia K2 -> K3 é permitida', $$INSERT INTO product_components (company_id, kit_product_id, component_product_id, quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000504','aaaaaaaa-0000-0000-0000-000000000505',1)$$, 1);
SELECT expect_error('V-RULE ciclo indireto (K3 -> K1 fecha K1->K2->K3->K1)', $$INSERT INTO product_components (company_id, kit_product_id, component_product_id, quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000505','aaaaaaaa-0000-0000-0000-000000000503',1)$$, 'P0001');
SELECT expect_error('V-RULE UPDATE de componente que criaria ciclo',
  $$UPDATE product_components SET component_product_id='aaaaaaaa-0000-0000-0000-000000000503' WHERE company_id='aaaaaaaa-0000-0000-0000-000000000001' AND kit_product_id='aaaaaaaa-0000-0000-0000-000000000504' AND component_product_id='aaaaaaaa-0000-0000-0000-000000000505'$$, 'P0001');
SELECT expect_error('V-RULE KIT com componentes não pode virar MERCADERIA', $$UPDATE products SET product_type='MERCADERIA' WHERE id='aaaaaaaa-0000-0000-0000-000000000503'$$, 'P0001');
SELECT expect_affected('V-RULE KIT sem componentes pode mudar de tipo (K3 -> MERCADERIA)', $$UPDATE products SET product_type='MERCADERIA' WHERE id='aaaaaaaa-0000-0000-0000-000000000505'$$, 1);
SELECT expect_error('V-RULE componente reapontado para produto de B (FK composta)',
  $$UPDATE product_components SET component_product_id='bbbbbbbb-0000-0000-0000-000000000501' WHERE company_id='aaaaaaaa-0000-0000-0000-000000000001' AND kit_product_id='aaaaaaaa-0000-0000-0000-000000000503' AND component_product_id='aaaaaaaa-0000-0000-0000-000000000501'$$, '23503');
-- updated_at automático
SELECT expect_affected('V-RULE updated_at avança no UPDATE',
  $$UPDATE products SET notes='n' WHERE id='aaaaaaaa-0000-0000-0000-000000000502' AND updated_at >= created_at$$, 1);
-- baixa em cascata do agregado (filhos acompanham o pai quando o pai é apagado em banco descartável)
INSERT INTO products (id, company_id, code, description, invoice_description, unit_of_measure_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000506','aaaaaaaa-0000-0000-0000-000000000001','P-TMP','Tmp','Tmp','c0000000-0000-0000-0000-000000000001');
INSERT INTO product_codes (company_id, product_id, code_type, code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000506','OTRO','TMP-1');
INSERT INTO product_units (company_id, product_id, unit_of_measure_id, presentation_name, conversion_factor, is_base_unit) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000506','c0000000-0000-0000-0000-000000000001','Unidad',1,true);
SELECT expect_affected('V-RULE apagar produto de teste', $$DELETE FROM products WHERE id='aaaaaaaa-0000-0000-0000-000000000506'$$, 1);
SELECT expect_count('V-RULE filhos do produto apagado saem com o pai (CASCADE)', $$SELECT 1 FROM product_codes WHERE product_id='aaaaaaaa-0000-0000-0000-000000000506' UNION ALL SELECT 1 FROM product_units WHERE product_id='aaaaaaaa-0000-0000-0000-000000000506'$$, 0);

-- ---- V-ISO: RLS com o papel da aplicação ----
BEGIN;
SET LOCAL ROLE dn_app_test;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['supplier_groups','suppliers','supplier_contacts','supplier_addresses','supplier_bank_accounts',
      'supplier_withholdings','supplier_documents','product_categories','product_brands','products','product_codes','product_units',
      'product_suppliers','product_warehouse_settings','product_alternatives','product_components','product_documents'] LOOP
    PERFORM expect_count('V-ISO sem app.company_id nada é visível ('||t||')', format('SELECT 1 FROM %I', t), 0);
  END LOOP;
END $$;
SELECT set_config('app.company_id','aaaaaaaa-0000-0000-0000-000000000001', true);
DO $$
DECLARE t text; n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['supplier_groups','suppliers','supplier_contacts','supplier_addresses','supplier_bank_accounts',
      'supplier_withholdings','supplier_documents','product_categories','product_brands','products','product_codes','product_units',
      'product_suppliers','product_warehouse_settings','product_alternatives','product_components','product_documents'] LOOP
    PERFORM expect_count('V-ISO A não vê linhas de B ('||t||')', format($q$SELECT 1 FROM %I WHERE company_id <> 'aaaaaaaa-0000-0000-0000-000000000001'$q$, t), 0);
    EXECUTE format('SELECT count(*) FROM %I', t) INTO n;
    IF n = 0 THEN RAISE EXCEPTION 'TESTE FALHOU [V-ISO A deveria ver linhas de %]', t; END IF;
  END LOOP;
END $$;
SELECT expect_count('V-ISO A não vê o fornecedor de B por id',  $$SELECT 1 FROM suppliers WHERE id='bbbbbbbb-0000-0000-0000-000000000201'$$, 0);
SELECT expect_count('V-ISO A não vê as contas bancárias de B',  $$SELECT 1 FROM supplier_bank_accounts WHERE supplier_id='bbbbbbbb-0000-0000-0000-000000000201'$$, 0);
SELECT expect_count('V-ISO A não vê o produto de B por id',     $$SELECT 1 FROM products WHERE id='bbbbbbbb-0000-0000-0000-000000000501'$$, 0);
SELECT expect_error('V-ISO A não grava fornecedor com company_id de B',
  $$INSERT INTO suppliers (company_id, tax_id, tax_id_type, legal_name, country_code) VALUES ('bbbbbbbb-0000-0000-0000-000000000001','x','OTRO','Invasor','ARG')$$, '42501');
SELECT expect_error('V-ISO A não grava conta bancária com company_id de B',
  $$INSERT INTO supplier_bank_accounts (company_id, supplier_id, bank_name, account_holder, account_number, currency_code) VALUES ('bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000201','B','H','1','PYG')$$, '42501');
SELECT expect_error('V-ISO A não grava produto com company_id de B',
  $$INSERT INTO products (company_id, code, description, invoice_description, unit_of_measure_id) VALUES ('bbbbbbbb-0000-0000-0000-000000000001','INV','d','d','c0000000-0000-0000-0000-000000000001')$$, '42501');
SELECT expect_error('V-ISO A não grava componente com company_id de B',
  $$INSERT INTO product_components (company_id, kit_product_id, component_product_id, quantity) VALUES ('bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000503','bbbbbbbb-0000-0000-0000-000000000501',1)$$, '42501');
SELECT expect_affected('V-ISO A não altera fornecedor de B',   $$UPDATE suppliers SET legal_name='hack' WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não altera produto de B',      $$UPDATE products SET description='hack' WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não altera conta bancária de B', $$UPDATE supplier_bank_accounts SET account_number='hack' WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não apaga fornecedor de B',    $$DELETE FROM suppliers WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não apaga produto de B',       $$DELETE FROM products WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não apaga componente de B',    $$DELETE FROM product_components WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_error('V-ISO A não troca company_id de fornecedor seu para B',
  $$UPDATE suppliers SET company_id='bbbbbbbb-0000-0000-0000-000000000001' WHERE id='aaaaaaaa-0000-0000-0000-000000000201'$$, '42501');
SELECT expect_error('V-ISO A não troca company_id de produto seu para B',
  $$UPDATE products SET company_id='bbbbbbbb-0000-0000-0000-000000000001' WHERE id='aaaaaaaa-0000-0000-0000-000000000501'$$, '42501');
SELECT expect_affected('V-ISO A altera o seu fornecedor',      $$UPDATE suppliers SET trade_name='ok' WHERE id='aaaaaaaa-0000-0000-0000-000000000201'$$, 1);
-- regra de kit também vale sob o papel da aplicação (trigger lê products sob RLS)
SELECT expect_error('V-ISO ciclo de kit negado sob RLS (K1->K2->K3 existe? K2->K1 fecha ciclo)',
  $$INSERT INTO product_components (company_id, kit_product_id, component_product_id, quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000504','aaaaaaaa-0000-0000-0000-000000000503',1)$$, 'P0001');
COMMIT;
BEGIN;
SET LOCAL ROLE dn_app_test;
SELECT set_config('app.company_id','bbbbbbbb-0000-0000-0000-000000000001', true);
SELECT expect_count('V-ISO B vê só o seu fornecedor',     'SELECT 1 FROM suppliers', 1);
SELECT expect_count('V-ISO B vê só os seus produtos',     'SELECT 1 FROM products', 2);
SELECT expect_count('V-ISO B não vê componentes de A',    $$SELECT 1 FROM product_components WHERE company_id='aaaaaaaa-0000-0000-0000-000000000001'$$, 0);
SELECT expect_count('V-ISO B vê só a sua conta bancária', 'SELECT 1 FROM supplier_bank_accounts', 1);
COMMIT;

\echo 'TESTE-P003: TODOS OS CASOS PASSARAM'
