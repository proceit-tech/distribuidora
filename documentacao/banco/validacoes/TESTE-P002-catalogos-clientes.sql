-- TESTE-P002-catalogos-clientes.sql — executar em banco DESCARTÁVEL após P001-up e
-- REQ-2026-003-P002-catalogos-clientes-up.sql, a partir da pasta validacoes/ (usa \i _helpers-teste.sql).
-- Casos: V-REQ, V-UQ, V-FK (cross-tenant e catálogos globais), V-ENUM, V-FMT/regras de integridade,
-- V-DEF (gerador de código, updated_at), V-ISO (RLS). Falha = exceção (psql -v ON_ERROR_STOP=1).
\set ON_ERROR_STOP 1
\i _helpers-teste.sql

-- ---- carga mínima (superusuário; contorna RLS) ----
INSERT INTO companies (id, code, legal_name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','empresa_a','Empresa A S.A.'),
  ('bbbbbbbb-0000-0000-0000-000000000001','empresa_b','Empresa B S.A.');
INSERT INTO users (id, company_id, username, first_name, password_hash) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000a1','aaaaaaaa-0000-0000-0000-000000000001','admin','Ana','x'),
  ('bbbbbbbb-0000-0000-0000-0000000000a1','bbbbbbbb-0000-0000-0000-000000000001','admin','Beto','x');

-- catálogos globais
INSERT INTO geo_countries (code, name) VALUES ('PRY','Paraguay'),('ARG','Argentina'),('BRA','Brasil');
INSERT INTO geo_departments (code, name) VALUES (1,'Concepción'),(2,'San Pedro');
INSERT INTO geo_districts (department_code, code, name) VALUES (1,1,'Concepción'),(1,2,'Belén'),(2,1,'San Pedro del Ycuamandiyú');
INSERT INTO geo_cities (department_code, district_code, code, name) VALUES (1,1,1,'Concepción'),(2,1,1,'San Pedro');
INSERT INTO currencies (code, name, symbol) VALUES ('PYG','Guaraníes','Gs.'),('USD','Dólares','USD');
INSERT INTO payment_methods (id, code, name, type) VALUES ('00000000-0000-0000-0000-0000000000e1','EFE','Efectivo','EFECTIVO');
INSERT INTO incoterms (code, name) VALUES ('FOB','Free On Board'),('CIF',NULL);
INSERT INTO units_of_measure (id, code, name, sifen_code, sifen_description) VALUES ('00000000-0000-0000-0000-0000000000e2','UNI','Unidad','77','Unidad');
INSERT INTO taxes (id, code, name, rate_percent) VALUES ('00000000-0000-0000-0000-0000000000e3','IVA10','IVA 10%',10);

-- catálogos por empresa (A e B)
INSERT INTO payment_terms (id, company_id, code, name, due_days) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000f1','aaaaaaaa-0000-0000-0000-000000000001','CONTADO','Contado',0),
  ('bbbbbbbb-0000-0000-0000-0000000000f1','bbbbbbbb-0000-0000-0000-000000000001','CONTADO','Contado',0);
INSERT INTO customer_groups (id, company_id, code, name) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000f2','aaaaaaaa-0000-0000-0000-000000000001','MAY','Mayoristas'),
  ('bbbbbbbb-0000-0000-0000-0000000000f2','bbbbbbbb-0000-0000-0000-000000000001','MAY','Mayoristas');
INSERT INTO salespeople (id, company_id, code, name) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000f3','aaaaaaaa-0000-0000-0000-000000000001','V1','Vendedor A'),
  ('bbbbbbbb-0000-0000-0000-0000000000f3','bbbbbbbb-0000-0000-0000-000000000001','V1','Vendedor B');
INSERT INTO delivery_routes (id, company_id, code, name) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000f4','aaaaaaaa-0000-0000-0000-000000000001','R1','Ruta A'),
  ('bbbbbbbb-0000-0000-0000-0000000000f4','bbbbbbbb-0000-0000-0000-000000000001','R1','Ruta B');
INSERT INTO commercial_zones (id, company_id, code, name) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000f5','aaaaaaaa-0000-0000-0000-000000000001','Z1','Zona A'),
  ('bbbbbbbb-0000-0000-0000-0000000000f5','bbbbbbbb-0000-0000-0000-000000000001','Z1','Zona B');
INSERT INTO sales_channels (id, company_id, code, name) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000f6','aaaaaaaa-0000-0000-0000-000000000001','C1','Canal A'),
  ('bbbbbbbb-0000-0000-0000-0000000000f6','bbbbbbbb-0000-0000-0000-000000000001','C1','Canal B');

-- clientes: A1 contribuinte (código gerado), B1 contribuinte (mesmo RUC de A1 em outra empresa)
INSERT INTO customers (id, company_id, recipient_nature_code, operation_type_code, person_type, taxpayer_type_code,
                       country_code, document_type, tax_id, tax_id_check_digit, legal_name,
                       customer_group_id, payment_term_id, default_currency_code, sales_channel_id, salesperson_id,
                       delivery_route_id, commercial_zone_id, created_by)
VALUES ('aaaaaaaa-0000-0000-0000-0000000000c1','aaaaaaaa-0000-0000-0000-000000000001',1,1,'JURIDICA',2,'PRY','RUC','80012345','7','Cliente A1 S.A.',
        'aaaaaaaa-0000-0000-0000-0000000000f2','aaaaaaaa-0000-0000-0000-0000000000f1','PYG','aaaaaaaa-0000-0000-0000-0000000000f6',
        'aaaaaaaa-0000-0000-0000-0000000000f3','aaaaaaaa-0000-0000-0000-0000000000f4','aaaaaaaa-0000-0000-0000-0000000000f5',
        'aaaaaaaa-0000-0000-0000-0000000000a1'),
       ('bbbbbbbb-0000-0000-0000-0000000000c1','bbbbbbbb-0000-0000-0000-000000000001',1,1,'JURIDICA',2,'PRY','RUC','80012345','7','Cliente B1 S.A.',
        NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO customer_contacts (id, company_id, customer_id, first_name, email, is_primary) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c1','Carlos','c@a.com',true),
  ('bbbbbbbb-0000-0000-0000-0000000000d1','bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-0000000000c1','Dora','d@b.com',true);
INSERT INTO customer_addresses (id, company_id, customer_id, address_type, street, country_code, department_code, district_code, city_code, is_fiscal, is_default_delivery) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000e1','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c1','FISCAL','Calle 1','PRY',1,1,1,true,false),
  ('bbbbbbbb-0000-0000-0000-0000000000e1','bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-0000000000c1','FISCAL','Calle 2','PRY',2,1,1,true,false);
INSERT INTO customer_documents (id, company_id, customer_id, document_type, file_name, file_url, uploaded_by) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000b1','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c1','RUC','ruc.pdf','https://x/a','aaaaaaaa-0000-0000-0000-0000000000a1'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1','bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-0000000000c1','RUC','ruc.pdf','https://x/b','bbbbbbbb-0000-0000-0000-0000000000a1');
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dn_app_test;

-- ---- V-DEF: código do cliente gerado pelo banco; updated_at automático ----
SELECT expect_count('V-DEF código gerado CLI-000001 para A1', $$SELECT 1 FROM customers WHERE id='aaaaaaaa-0000-0000-0000-0000000000c1' AND code='CLI-000001'$$, 1);
SELECT expect_count('V-DEF código gerado é independente por empresa (B1 = CLI-000001)', $$SELECT 1 FROM customers WHERE id='bbbbbbbb-0000-0000-0000-0000000000c1' AND code='CLI-000001'$$, 1);
INSERT INTO customers (id, company_id, recipient_nature_code, operation_type_code, person_type, taxpayer_type_code, country_code, document_type, tax_id, tax_id_check_digit, legal_name)
VALUES ('aaaaaaaa-0000-0000-0000-0000000000c2','aaaaaaaa-0000-0000-0000-000000000001',1,1,'FISICA',1,'PRY','RUC','1234567','0','Cliente A2');
SELECT expect_count('V-DEF segundo cliente de A recebe CLI-000002', $$SELECT 1 FROM customers WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2' AND code='CLI-000002'$$, 1);
INSERT INTO customers (id, company_id, code, recipient_nature_code, operation_type_code, person_type, taxpayer_type_code, country_code, document_type, tax_id, tax_id_check_digit, legal_name)
VALUES ('aaaaaaaa-0000-0000-0000-0000000000c3','aaaaaaaa-0000-0000-0000-000000000001','MANUAL-1',1,1,'FISICA',1,'PRY','RUC','7654321','1','Cliente A3');
SELECT expect_count('V-DEF código informado é preservado', $$SELECT 1 FROM customers WHERE id='aaaaaaaa-0000-0000-0000-0000000000c3' AND code='MANUAL-1'$$, 1);
UPDATE customers SET created_at = created_at - interval '1 day', updated_at = now() - interval '1 day' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c3';
UPDATE customers SET trade_name='Fantasia A3' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c3';
SELECT expect_count('V-DEF updated_at é renovado pelo trigger', $$SELECT 1 FROM customers WHERE id='aaaaaaaa-0000-0000-0000-0000000000c3' AND updated_at > now() - interval '1 minute'$$, 1);
DELETE FROM customers WHERE id IN ('aaaaaaaa-0000-0000-0000-0000000000c3');

-- ---- V-UQ ----
SELECT expect_error('V-UQ código de cliente repetido na empresa', $$INSERT INTO customers (company_id, code, recipient_nature_code, operation_type_code, person_type, taxpayer_type_code, country_code, document_type, tax_id, tax_id_check_digit, legal_name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','CLI-000001',1,1,'FISICA',1,'PRY','RUC','999','9','Dup')$$, '23505');
SELECT expect_error('V-UQ mesma identificação (tipo+RUC+DV) na mesma empresa', $$INSERT INTO customers (company_id, recipient_nature_code, operation_type_code, person_type, taxpayer_type_code, country_code, document_type, tax_id, tax_id_check_digit, legal_name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001',1,1,'JURIDICA',2,'PRY','RUC','80012345','7','Dup RUC')$$, '23505');
INSERT INTO customers (company_id, recipient_nature_code, operation_type_code, person_type, taxpayer_type_code, country_code, document_type, tax_id, tax_id_check_digit, legal_name)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001',1,1,'JURIDICA',2,'PRY','RUC','80012345','8','Mesmo RUC outro DV');
SELECT expect_count('V-UQ mesmo RUC com DV diferente é outro cliente; mesmo RUC em empresa B já existe (A1 e B1)', $$SELECT 1 FROM customers WHERE tax_id='80012345'$$, 3);
INSERT INTO customers (company_id, recipient_nature_code, operation_type_code, person_type, taxpayer_type_code, country_code, document_type, identity_document_type_code, tax_id, legal_name)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001',2,2,'FISICA',1,'PRY','CEDULA_PARAGUAYA',1,'4111222','Pessoa Cédula');
SELECT expect_error('V-UQ mesma cédula (sem DV) na mesma empresa', $$INSERT INTO customers (company_id, recipient_nature_code, operation_type_code, person_type, taxpayer_type_code, country_code, document_type, identity_document_type_code, tax_id, legal_name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001',2,2,'FISICA',1,'PRY','CEDULA_PARAGUAYA',1,'4111222','Dup cédula')$$, '23505');
INSERT INTO customers (company_id, recipient_nature_code, operation_type_code, person_type, taxpayer_type_code, country_code, document_type, identity_document_type_code, tax_id, legal_name)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001',2,2,'FISICA',1,'PRY','INNOMINADO',5,'0','Innominado 1'),
         ('aaaaaaaa-0000-0000-0000-000000000001',2,2,'FISICA',1,'PRY','INNOMINADO',5,'0','Innominado 2');
SELECT expect_count('V-UQ INNOMINADO pode repetir (decisão menos comprometedora, Q5/DIV-19)', $$SELECT 1 FROM customers WHERE document_type='INNOMINADO'$$, 2);
UPDATE customers SET external_code='EXT-1' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c1';
UPDATE customers SET external_code='EXT-1' WHERE id='bbbbbbbb-0000-0000-0000-0000000000c1';
SELECT expect_error('V-UQ código externo repetido na empresa', $$UPDATE customers SET external_code='EXT-1' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23505');
SELECT expect_count('V-UQ vários clientes sem código externo são permitidos', $$SELECT 1 FROM customers WHERE company_id='aaaaaaaa-0000-0000-0000-000000000001' AND external_code IS NULL$$, 5);
-- catálogos por empresa: mesmo code em empresas diferentes OK (carga A/B já cobre), repetido na mesma não
SELECT expect_error('V-UQ code de grupo repetido na empresa', $$INSERT INTO customer_groups (company_id, code, name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','MAY','Outro')$$, '23505');
SELECT expect_error('V-UQ code de payment_terms repetido na empresa', $$INSERT INTO payment_terms (company_id, code, name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','CONTADO','Outro')$$, '23505');
SELECT expect_error('V-UQ code de vendedor repetido na empresa', $$INSERT INTO salespeople (company_id, code, name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','V1','Outro')$$, '23505');
SELECT expect_error('V-UQ code de rota repetido na empresa', $$INSERT INTO delivery_routes (company_id, code, name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','R1','Outro')$$, '23505');
SELECT expect_error('V-UQ code de zona repetido na empresa', $$INSERT INTO commercial_zones (company_id, code, name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','Z1','Outro')$$, '23505');
SELECT expect_error('V-UQ code de canal repetido na empresa', $$INSERT INTO sales_channels (company_id, code, name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','C1','Outro')$$, '23505');
-- catálogos globais
SELECT expect_error('V-UQ moeda repetida', $$INSERT INTO currencies (code, name) VALUES ('PYG','Outra')$$, '23505');
SELECT expect_error('V-UQ país repetido', $$INSERT INTO geo_countries (code, name) VALUES ('PRY','Outro')$$, '23505');
SELECT expect_error('V-UQ incoterm repetido', $$INSERT INTO incoterms (code, name) VALUES ('FOB','Outro')$$, '23505');
SELECT expect_error('V-UQ code de unidade repetido', $$INSERT INTO units_of_measure (code, name) VALUES ('UNI','Outra')$$, '23505');
SELECT expect_error('V-UQ code de imposto repetido', $$INSERT INTO taxes (code, name, rate_percent) VALUES ('IVA10','Outro',10)$$, '23505');
SELECT expect_error('V-UQ code de meio de pagamento repetido', $$INSERT INTO payment_methods (code, name) VALUES ('EFE','Outro')$$, '23505');
SELECT expect_error('V-UQ departamento repetido', $$INSERT INTO geo_departments (code, name) VALUES (1,'Outro')$$, '23505');
SELECT expect_error('V-UQ distrito repetido dentro do departamento', $$INSERT INTO geo_districts (department_code, code, name) VALUES (1,1,'Outro')$$, '23505');
INSERT INTO geo_districts (department_code, code, name) VALUES (2,2,'Mesmo código 2 em outro departamento');
SELECT expect_count('V-UQ mesmo código de distrito em departamentos diferentes é permitido (chave composta, DIV-20)', $$SELECT 1 FROM geo_districts WHERE code=1$$, 2);
SELECT expect_error('V-UQ cidade repetida no distrito', $$INSERT INTO geo_cities (department_code, district_code, code, name) VALUES (1,1,1,'Outra')$$, '23505');
-- filhos: principal/fiscal/entrega padrão únicos por cliente
SELECT expect_error('V-UQ dois contatos principais no mesmo cliente', $$INSERT INTO customer_contacts (company_id, customer_id, first_name, is_primary) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c1','Outro',true)$$, '23505');
INSERT INTO customer_contacts (company_id, customer_id, first_name, is_primary) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c1','Secundário',false),
                                                                                         ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c1','Terciário',false);
SELECT expect_count('V-UQ vários contatos não principais são permitidos', $$SELECT 1 FROM customer_contacts WHERE customer_id='aaaaaaaa-0000-0000-0000-0000000000c1'$$, 3);
SELECT expect_error('V-UQ dois endereços fiscais no mesmo cliente', $$INSERT INTO customer_addresses (company_id, customer_id, address_type, street, country_code, department_code, district_code, city_code, is_fiscal) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c1','FISCAL','Calle 9','PRY',1,1,1,true)$$, '23505');
INSERT INTO customer_addresses (company_id, customer_id, address_type, street, country_code, is_default_delivery) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c1','ENTREGA','Av. Entrega','ARG',true);
SELECT expect_error('V-UQ dois endereços de entrega padrão no mesmo cliente', $$INSERT INTO customer_addresses (company_id, customer_id, address_type, street, country_code, is_default_delivery) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c1','ENTREGA','Av. 2','ARG',true)$$, '23505');

-- ---- V-FK: FK composta impede ligar linhas de empresas diferentes ----
SELECT expect_error('V-FK cliente A com grupo de B', $$UPDATE customers SET customer_group_id='bbbbbbbb-0000-0000-0000-0000000000f2' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23503');
SELECT expect_error('V-FK cliente A com condição de pagamento de B', $$UPDATE customers SET payment_term_id='bbbbbbbb-0000-0000-0000-0000000000f1' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23503');
SELECT expect_error('V-FK cliente A com canal de B', $$UPDATE customers SET sales_channel_id='bbbbbbbb-0000-0000-0000-0000000000f6' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23503');
SELECT expect_error('V-FK cliente A com vendedor de B', $$UPDATE customers SET salesperson_id='bbbbbbbb-0000-0000-0000-0000000000f3' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23503');
SELECT expect_error('V-FK cliente A com rota de B', $$UPDATE customers SET delivery_route_id='bbbbbbbb-0000-0000-0000-0000000000f4' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23503');
SELECT expect_error('V-FK cliente A com zona de B', $$UPDATE customers SET commercial_zone_id='bbbbbbbb-0000-0000-0000-0000000000f5' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23503');
SELECT expect_error('V-FK bloqueio de A por usuário de B', $$UPDATE customers SET is_sales_blocked=true, sales_block_reason='x', sales_blocked_at=now(), sales_blocked_by='bbbbbbbb-0000-0000-0000-0000000000a1' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23503');
SELECT expect_error('V-FK created_by de outra empresa', $$UPDATE customers SET created_by='bbbbbbbb-0000-0000-0000-0000000000a1' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23503');
SELECT expect_error('V-FK contato de A em cliente de B', $$INSERT INTO customer_contacts (company_id, customer_id, first_name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-0000000000c1','X')$$, '23503');
SELECT expect_error('V-FK endereço de A em cliente de B', $$INSERT INTO customer_addresses (company_id, customer_id, street, country_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-0000000000c1','X','ARG')$$, '23503');
SELECT expect_error('V-FK documento de A em cliente de B', $$INSERT INTO customer_documents (company_id, customer_id, file_name, file_url) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-0000000000c1','x','https://x')$$, '23503');
SELECT expect_error('V-FK documento de A carregado por usuário de B', $$INSERT INTO customer_documents (company_id, customer_id, file_name, file_url, uploaded_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c1','x','https://x','bbbbbbbb-0000-0000-0000-0000000000a1')$$, '23503');
-- FKs para catálogos globais
SELECT expect_error('V-FK país inexistente no cliente', $$UPDATE customers SET country_code='XXX' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23503');
SELECT expect_error('V-FK moeda inexistente no cliente', $$UPDATE customers SET default_currency_code='EUR' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23503');
SELECT expect_error('V-FK país inexistente no endereço', $$INSERT INTO customer_addresses (company_id, customer_id, street, country_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c1','X','XXX')$$, '23503');
SELECT expect_error('V-FK cidade inexistente (distrito 2 do depto 1 não tem a cidade 1)', $$INSERT INTO customer_addresses (company_id, customer_id, street, country_code, department_code, district_code, city_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c1','X','PRY',1,2,1)$$, '23503');
SELECT expect_error('V-FK cidade do depto 2 com distrito do depto 1 (DIV-20)', $$INSERT INTO customer_addresses (company_id, customer_id, street, country_code, department_code, district_code, city_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c1','X','PRY',2,2,1)$$, '23503');
SELECT expect_error('V-FK geo parcial (MATCH FULL): só departamento', $$INSERT INTO customer_addresses (company_id, customer_id, street, country_code, department_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c1','X','ARG',1)$$, '23503');
SELECT expect_error('V-FK distrito com departamento inexistente', $$INSERT INTO geo_districts (department_code, code, name) VALUES (99,1,'X')$$, '23503');
SELECT expect_error('V-FK cidade com distrito inexistente', $$INSERT INTO geo_cities (department_code, district_code, code, name) VALUES (1,99,1,'X')$$, '23503');
INSERT INTO customer_addresses (company_id, customer_id, street, country_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c2','Av. Buenos Aires','ARG');
SELECT expect_count('V-FK endereço fora do PRY sem códigos geográficos é válido', $$SELECT 1 FROM customer_addresses WHERE street='Av. Buenos Aires'$$, 1);
-- price_list_id nasce sem FK (P004 a cria)
UPDATE customers SET price_list_id = gen_random_uuid() WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2';
SELECT expect_count('V-FK price_list_id aceita qualquer uuid em P002 (FK vem em P004)', $$SELECT 1 FROM customers WHERE price_list_id IS NOT NULL$$, 1);
UPDATE customers SET price_list_id = NULL WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2';

-- ---- V-REQ: NOT NULL críticos ----
SELECT expect_error('V-REQ cliente sem razão social', $$INSERT INTO customers (company_id, recipient_nature_code, operation_type_code, person_type, taxpayer_type_code, country_code, document_type, tax_id, tax_id_check_digit) VALUES ('aaaaaaaa-0000-0000-0000-000000000001',1,1,'FISICA',1,'PRY','RUC','11','1')$$, '23502');
SELECT expect_error('V-REQ razão social em branco', $$UPDATE customers SET legal_name='   ' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23514');
SELECT expect_error('V-REQ cliente sem país', $$INSERT INTO customers (company_id, recipient_nature_code, operation_type_code, person_type, taxpayer_type_code, document_type, tax_id, tax_id_check_digit, legal_name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001',1,1,'FISICA',1,'RUC','12','1','Sem país')$$, '23502');
SELECT expect_error('V-REQ cliente sem número de documento', $$INSERT INTO customers (company_id, recipient_nature_code, operation_type_code, person_type, taxpayer_type_code, country_code, document_type, tax_id_check_digit, legal_name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001',1,1,'FISICA',1,'PRY','RUC','1','Sem doc')$$, '23502');
SELECT expect_error('V-REQ cliente sem company_id', $$INSERT INTO customers (recipient_nature_code, operation_type_code, person_type, taxpayer_type_code, country_code, document_type, tax_id, tax_id_check_digit, legal_name) VALUES (1,1,'FISICA',1,'PRY','RUC','13','1','Sem empresa')$$, '23502');
SELECT expect_error('V-REQ cliente sem naturaleza', $$INSERT INTO customers (company_id, operation_type_code, person_type, taxpayer_type_code, country_code, document_type, tax_id, tax_id_check_digit, legal_name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001',1,'FISICA',1,'PRY','RUC','14','1','Sem naturaleza')$$, '23502');
SELECT expect_error('V-REQ contato sem nome', $$INSERT INTO customer_contacts (company_id, customer_id, phone) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c1','021')$$, '23502');
SELECT expect_error('V-REQ contato com nome em branco', $$INSERT INTO customer_contacts (company_id, customer_id, first_name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c1',' ')$$, '23514');
SELECT expect_error('V-REQ endereço sem logradouro', $$INSERT INTO customer_addresses (company_id, customer_id, country_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c1','ARG')$$, '23502');
SELECT expect_error('V-REQ endereço sem país', $$INSERT INTO customer_addresses (company_id, customer_id, street) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c1','X')$$, '23502');
SELECT expect_error('V-REQ documento sem nome de arquivo', $$INSERT INTO customer_documents (company_id, customer_id, file_url) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c1','https://x')$$, '23502');
SELECT expect_error('V-REQ documento sem URL', $$INSERT INTO customer_documents (company_id, customer_id, file_name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c1','x.pdf')$$, '23502');
SELECT expect_error('V-REQ grupo sem nome', $$INSERT INTO customer_groups (company_id, code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','G9')$$, '23502');
SELECT expect_error('V-REQ grupo sem company_id', $$INSERT INTO customer_groups (code, name) VALUES ('G9','Sem empresa')$$, '23502');
SELECT expect_error('V-REQ moeda sem nome', $$INSERT INTO currencies (code) VALUES ('BRL')$$, '23502');
SELECT expect_error('V-REQ imposto sem alíquota', $$INSERT INTO taxes (code, name) VALUES ('IVA5','IVA 5%')$$, '23502');

-- ---- V-ENUM: CHECKs de estado/domínio ----
SELECT expect_error('V-ENUM person_type inválido', $$UPDATE customers SET person_type='ROBO' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23514');
SELECT expect_error('V-ENUM naturaleza inválida (3)', $$UPDATE customers SET recipient_nature_code=3 WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23514');
SELECT expect_error('V-ENUM operação inválida (5)', $$UPDATE customers SET operation_type_code=5 WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23514');
SELECT expect_error('V-ENUM tipo de documento inválido', $$UPDATE customers SET document_type='DNI' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23514');
SELECT expect_error('V-ENUM código SIFEN de documento inválido (7)', $$UPDATE customers SET identity_document_type_code=7 WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23514');
SELECT expect_error('V-ENUM frequência SEGUN_PEDIDO (só DEMO) rejeitada', $$UPDATE customers SET delivery_frequency='SEGUN_PEDIDO' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23514');
UPDATE customers SET delivery_frequency='A_DEMANDA' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2';
SELECT expect_error('V-ENUM dia de entrega 8', $$UPDATE customers SET delivery_days='{1,8}' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23514');
SELECT expect_error('V-ENUM dia de entrega 0', $$UPDATE customers SET delivery_days='{0}' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23514');
SELECT expect_error('V-ENUM lista vazia de dias (deve ser NULL)', $$UPDATE customers SET delivery_days='{}' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23514');
SELECT expect_error('V-ENUM dia de entrega NULL dentro do array', $$UPDATE customers SET delivery_days=ARRAY[1,NULL]::smallint[] WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23514');
UPDATE customers SET delivery_days='{1,3,7}' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2';
SELECT expect_count('V-ENUM dias 1..7 aceitos (inclui domingo=7)', $$SELECT 1 FROM customers WHERE delivery_days='{1,3,7}'$$, 1);
SELECT expect_error('V-ENUM tipo de endereço inválido', $$INSERT INTO customer_addresses (company_id, customer_id, address_type, street, country_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c1','CASA','X','ARG')$$, '23514');
SELECT expect_error('V-ENUM tipo de documento de cliente inválido', $$INSERT INTO customer_documents (company_id, customer_id, document_type, file_name, file_url) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c1','FOTO','x','https://x')$$, '23514');
SELECT expect_error('V-ENUM código de moeda em minúsculas', $$INSERT INTO currencies (code, name) VALUES ('eur','Euro')$$, '23514');
SELECT expect_error('V-ENUM código de país com 2 letras', $$INSERT INTO geo_countries (code, name) VALUES ('PY','Paraguay2')$$, '23514');
SELECT expect_error('V-ENUM incoterm com 4 letras', $$INSERT INTO incoterms (code) VALUES ('FOBX')$$, '23514');
SELECT expect_error('V-ENUM alíquota > 100', $$INSERT INTO taxes (code, name, rate_percent) VALUES ('X','X',101)$$, '23514');

-- ---- Regras de integridade implementadas no SQL ----
-- taxpayer_type x person_type (regra 4)
SELECT expect_error('REGRA FISICA com taxpayer_type_code 2', $$UPDATE customers SET taxpayer_type_code=2 WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23514');
-- contribuinte (regra 6)
SELECT expect_error('REGRA contribuinte sem DV', $$UPDATE customers SET tax_id_check_digit=NULL WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23514');
SELECT expect_error('REGRA contribuinte com document_type diferente de RUC', $$UPDATE customers SET document_type='PASAPORTE' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23514');
SELECT expect_error('REGRA contribuinte com código SIFEN de identidade', $$UPDATE customers SET identity_document_type_code=1 WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23514');
-- não contribuinte (regra 7)
SELECT expect_error('REGRA não contribuinte com tipo RUC', $$INSERT INTO customers (company_id, recipient_nature_code, operation_type_code, person_type, taxpayer_type_code, country_code, document_type, identity_document_type_code, tax_id, legal_name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001',2,2,'FISICA',1,'PRY','RUC',1,'55','NC com RUC')$$, '23514');
SELECT expect_error('REGRA não contribuinte com DV', $$INSERT INTO customers (company_id, recipient_nature_code, operation_type_code, person_type, taxpayer_type_code, country_code, document_type, identity_document_type_code, tax_id, tax_id_check_digit, legal_name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001',2,2,'FISICA',1,'PRY','PASAPORTE',2,'AB1','3','NC com DV')$$, '23514');
SELECT expect_error('REGRA não contribuinte sem código SIFEN de identidade', $$INSERT INTO customers (company_id, recipient_nature_code, operation_type_code, person_type, taxpayer_type_code, country_code, document_type, tax_id, legal_name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001',2,2,'FISICA',1,'PRY','PASAPORTE','AB2','NC sem código')$$, '23514');
SELECT expect_error('REGRA código SIFEN incoerente com o tipo (PASAPORTE=2, não 1)', $$INSERT INTO customers (company_id, recipient_nature_code, operation_type_code, person_type, taxpayer_type_code, country_code, document_type, identity_document_type_code, tax_id, legal_name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001',2,2,'FISICA',1,'PRY','PASAPORTE',1,'AB3','NC incoerente')$$, '23514');
SELECT expect_error('REGRA tipo OTRO sem descrição', $$INSERT INTO customers (company_id, recipient_nature_code, operation_type_code, person_type, taxpayer_type_code, country_code, document_type, identity_document_type_code, tax_id, legal_name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001',2,2,'FISICA',1,'ARG','OTRO',9,'ZZ1','OTRO sem descrição')$$, '23514');
INSERT INTO customers (company_id, recipient_nature_code, operation_type_code, person_type, taxpayer_type_code, country_code, document_type, identity_document_type_code, identity_document_description, tax_id, legal_name)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001',2,4,'FISICA',1,'ARG','OTRO',9,'Documento Mercosur','ZZ2','Cliente exterior B2F');
SELECT expect_count('REGRA tipo OTRO com descrição é aceito (B2F, país ARG)', $$SELECT 1 FROM customers WHERE tax_id='ZZ2'$$, 1);
-- crédito (regra 9)
SELECT expect_error('REGRA limite de crédito negativo', $$UPDATE customers SET credit_limit=-1 WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23514');
SELECT expect_error('REGRA limite temporário negativo', $$UPDATE customers SET temporary_credit_limit=-5 WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23514');
SELECT expect_error('REGRA vencimento do crédito sem limite temporário', $$UPDATE customers SET temporary_credit_expires_on=current_date WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23514');
UPDATE customers SET credit_limit=1500000.5000, temporary_credit_limit=200000, temporary_credit_expires_on=current_date+30 WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2';
SELECT expect_count('REGRA crédito com decimais e limite temporário com vencimento é aceito', $$SELECT 1 FROM customers WHERE credit_limit=1500000.5 AND temporary_credit_expires_on IS NOT NULL$$, 1);
SELECT expect_error('REGRA desconto comercial > 100', $$UPDATE customers SET commercial_discount_pct=100.01 WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23514');
SELECT expect_error('REGRA desconto comercial negativo', $$UPDATE customers SET commercial_discount_pct=-1 WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23514');
SELECT expect_error('REGRA dia preferido de cobro 32', $$UPDATE customers SET preferred_collection_day=32 WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23514');
SELECT expect_error('REGRA dia preferido de cobro 0', $$UPDATE customers SET preferred_collection_day=0 WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23514');
-- e-mail (regra 13)
SELECT expect_error('REGRA e-mail principal inválido', $$UPDATE customers SET email='sem-arroba' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23514');
SELECT expect_error('REGRA e-mail de cobranças inválido', $$UPDATE customers SET collections_email='a@b' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23514');
SELECT expect_error('REGRA e-mail de contato inválido', $$UPDATE customer_contacts SET email='x y@z.com' WHERE id='aaaaaaaa-0000-0000-0000-0000000000d1'$$, '23514');
-- bloqueio de vendas (regra 12)
SELECT expect_error('REGRA bloquear sem motivo', $$UPDATE customers SET is_sales_blocked=true WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23514');
SELECT expect_error('REGRA bloquear com motivo em branco', $$UPDATE customers SET is_sales_blocked=true, sales_block_reason=' ' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23514');
SELECT expect_error('REGRA data de bloqueio sem bloqueio ativo', $$UPDATE customers SET sales_blocked_at=now() WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23514');
SELECT expect_error('REGRA autor de bloqueio sem bloqueio ativo', $$UPDATE customers SET sales_blocked_by='aaaaaaaa-0000-0000-0000-0000000000a1' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23514');
UPDATE customers SET is_sales_blocked=true, sales_block_reason='Mora', sales_blocked_at=now(), sales_blocked_by='aaaaaaaa-0000-0000-0000-0000000000a1' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2';
SELECT expect_count('REGRA bloqueio completo é aceito', $$SELECT 1 FROM customers WHERE is_sales_blocked AND sales_blocked_by IS NOT NULL$$, 1);
UPDATE customers SET is_sales_blocked=false, sales_blocked_at=NULL, sales_blocked_by=NULL WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2';
-- endereço (regras 16, 17)
SELECT expect_error('REGRA endereço PRY sem departamento/distrito/cidade', $$INSERT INTO customer_addresses (company_id, customer_id, street, country_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c1','X','PRY')$$, '23514');
SELECT expect_error('REGRA tipo FISCAL com is_fiscal=false', $$INSERT INTO customer_addresses (company_id, customer_id, address_type, street, country_code, is_fiscal) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c2','FISCAL','X','ARG',false)$$, '23514');
SELECT expect_error('REGRA latitude fora da faixa', $$INSERT INTO customer_addresses (company_id, customer_id, street, country_code, latitude) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c2','X','ARG',91)$$, '23514');
SELECT expect_error('REGRA longitude fora da faixa', $$INSERT INTO customer_addresses (company_id, customer_id, street, country_code, longitude) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c2','X','ARG',-181)$$, '23514');
-- documento (regra 19)
SELECT expect_error('REGRA documento vence antes da emissão', $$INSERT INTO customer_documents (company_id, customer_id, file_name, file_url, issued_on, expires_on) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c1','x','https://x','2026-05-02','2026-05-01')$$, '23514');
INSERT INTO customer_documents (company_id, customer_id, file_name, file_url, issued_on, expires_on) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c1','y','https://y','2026-05-01','2026-05-01');
SELECT expect_count('REGRA vencimento igual à emissão é aceito', $$SELECT 1 FROM customer_documents WHERE file_name='y'$$, 1);

-- ---- RLS ligado e FORÇADO nas tabelas de negócio; ausente nos catálogos globais ----
SELECT expect_count('V-ISO RLS ENABLE+FORCE em 10 tabelas de negócio',
  $$SELECT 1 FROM pg_class WHERE relname IN ('payment_terms','customer_groups','salespeople','delivery_routes','commercial_zones','sales_channels','customers','customer_contacts','customer_addresses','customer_documents') AND relrowsecurity AND relforcerowsecurity$$, 10);
SELECT expect_count('V-ISO catálogos globais sem RLS',
  $$SELECT 1 FROM pg_class WHERE relname IN ('geo_countries','geo_departments','geo_districts','geo_cities','currencies','payment_methods','incoterms','units_of_measure','taxes') AND relrowsecurity$$, 0);

-- ---- V-ISO: RLS com o papel da aplicação ----
BEGIN;
SET LOCAL ROLE dn_app_test;
SELECT expect_count('V-ISO sem app.company_id nada é visível (customers)', 'SELECT 1 FROM customers', 0);
SELECT expect_count('V-ISO sem app.company_id nada é visível (payment_terms)', 'SELECT 1 FROM payment_terms', 0);
SELECT expect_count('V-ISO catálogo global visível sem empresa (currencies)', 'SELECT 1 FROM currencies', 2);
SELECT expect_count('V-ISO catálogo global visível sem empresa (geo_cities)', 'SELECT 1 FROM geo_cities', 2);
SELECT expect_error('V-ISO sem app.company_id não grava cliente',
  $$INSERT INTO customers (company_id, recipient_nature_code, operation_type_code, person_type, taxpayer_type_code, country_code, document_type, tax_id, tax_id_check_digit, legal_name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001',1,1,'FISICA',1,'PRY','RUC','31','1','Sem contexto')$$, '42501');
COMMIT;
BEGIN;
SET LOCAL ROLE dn_app_test;
SELECT set_config('app.company_id','aaaaaaaa-0000-0000-0000-000000000001', true);
-- SELECT
SELECT expect_count('V-ISO A vê só seus clientes (A1,A2,dup DV,cédula,2 innominados,exterior=7)', 'SELECT 1 FROM customers', 7);
SELECT expect_count('V-ISO A não vê cliente de B por id', $$SELECT 1 FROM customers WHERE id='bbbbbbbb-0000-0000-0000-0000000000c1'$$, 0);
SELECT expect_count('V-ISO A não vê contato de B', $$SELECT 1 FROM customer_contacts WHERE id='bbbbbbbb-0000-0000-0000-0000000000d1'$$, 0);
SELECT expect_count('V-ISO A não vê endereço de B', $$SELECT 1 FROM customer_addresses WHERE id='bbbbbbbb-0000-0000-0000-0000000000e1'$$, 0);
SELECT expect_count('V-ISO A não vê documento de B', $$SELECT 1 FROM customer_documents WHERE id='bbbbbbbb-0000-0000-0000-0000000000b1'$$, 0);
SELECT expect_count('V-ISO A vê só 1 condição de pagamento', 'SELECT 1 FROM payment_terms', 1);
SELECT expect_count('V-ISO A vê só 1 grupo', 'SELECT 1 FROM customer_groups', 1);
SELECT expect_count('V-ISO A vê só 1 vendedor', 'SELECT 1 FROM salespeople', 1);
SELECT expect_count('V-ISO A vê só 1 rota', 'SELECT 1 FROM delivery_routes', 1);
SELECT expect_count('V-ISO A vê só 1 zona', 'SELECT 1 FROM commercial_zones', 1);
SELECT expect_count('V-ISO A vê só 1 canal', 'SELECT 1 FROM sales_channels', 1);
-- INSERT
SELECT expect_error('V-ISO A não grava cliente com company_id de B',
  $$INSERT INTO customers (company_id, recipient_nature_code, operation_type_code, person_type, taxpayer_type_code, country_code, document_type, tax_id, tax_id_check_digit, legal_name) VALUES ('bbbbbbbb-0000-0000-0000-000000000001',1,1,'FISICA',1,'PRY','RUC','32','1','Invasor')$$, '42501');
SELECT expect_error('V-ISO A não grava contato com company_id de B',
  $$INSERT INTO customer_contacts (company_id, customer_id, first_name) VALUES ('bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-0000000000c1','Invasor')$$, '42501');
SELECT expect_error('V-ISO A não grava grupo com company_id de B',
  $$INSERT INTO customer_groups (company_id, code, name) VALUES ('bbbbbbbb-0000-0000-0000-000000000001','HACK','Invasor')$$, '42501');
SELECT expect_error('V-ISO A não grava condição de pagamento com company_id de B',
  $$INSERT INTO payment_terms (company_id, code, name) VALUES ('bbbbbbbb-0000-0000-0000-000000000001','HACK','Invasor')$$, '42501');
-- INSERT no contexto certo funciona e o gerador de código respeita a empresa
INSERT INTO customers (company_id, recipient_nature_code, operation_type_code, person_type, taxpayer_type_code, country_code, document_type, tax_id, tax_id_check_digit, legal_name)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001',1,1,'FISICA',1,'PRY','RUC','33','1','Cliente via app');
SELECT expect_count('V-ISO código gerado sob RLS segue a sequência da empresa A (CLI-000008)', $$SELECT 1 FROM customers WHERE tax_id='33' AND code='CLI-000008'$$, 1);
-- UPDATE
SELECT expect_affected('V-ISO A não altera cliente de B', $$UPDATE customers SET trade_name='hack' WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não altera contato de B', $$UPDATE customer_contacts SET last_name='hack' WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não altera endereço de B', $$UPDATE customer_addresses SET notes='hack' WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não altera documento de B', $$UPDATE customer_documents SET notes='hack' WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não altera catálogo de B', $$UPDATE customer_groups SET name='hack' WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_error('V-ISO A não move cliente seu para a empresa B',
  $$UPDATE customers SET company_id='bbbbbbbb-0000-0000-0000-000000000001' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '42501');
-- DELETE
SELECT expect_affected('V-ISO A não apaga cliente de B', $$DELETE FROM customers WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não apaga contato de B', $$DELETE FROM customer_contacts WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não apaga endereço de B', $$DELETE FROM customer_addresses WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não apaga documento de B', $$DELETE FROM customer_documents WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não apaga catálogo de B', $$DELETE FROM sales_channels WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
-- FK composta continua valendo sob RLS (A não referencia grupo de B nem sabendo o id)
SELECT expect_error('V-ISO+FK A não referencia grupo de B (id conhecido)', $$UPDATE customers SET customer_group_id='bbbbbbbb-0000-0000-0000-0000000000f2' WHERE id='aaaaaaaa-0000-0000-0000-0000000000c2'$$, '23503');
COMMIT;
BEGIN;
SET LOCAL ROLE dn_app_test;
SELECT set_config('app.company_id','bbbbbbbb-0000-0000-0000-000000000001', true);
SELECT expect_count('V-ISO B vê só o seu cliente', 'SELECT 1 FROM customers', 1);
SELECT expect_count('V-ISO B vê só seu contato/endereço/documento',
  'SELECT 1 FROM customer_contacts UNION ALL SELECT 1 FROM customer_addresses UNION ALL SELECT 1 FROM customer_documents', 3);
SELECT expect_count('V-ISO B não vê catálogos de A (código MAY de B é o seu)', $$SELECT 1 FROM customer_groups WHERE id='aaaaaaaa-0000-0000-0000-0000000000f2'$$, 0);
COMMIT;

\echo 'TESTE-P002: TODOS OS CASOS PASSARAM'
