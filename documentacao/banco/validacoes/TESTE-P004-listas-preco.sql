-- TESTE-P004-listas-preco.sql — executar em banco DESCARTÁVEL, a partir de documentacao/banco/validacoes,
-- após P001 + P002/P003 (ou STUBS) + REQ-2026-003-P004-listas-preco-up.sql.
-- Casos: V-REQ, V-ENUM, V-UQ, V-FK (uma por família de FK composta), V-ISO (RLS), V-DEF e regras do próprio SQL.
-- Falha = exceção (psql -v ON_ERROR_STOP=1).
-- ATENÇÃO (dependências): a seção "carga de dependências" insere em tabelas de P002/P003 usando SÓ as colunas
-- id, company_id (+ code/name/legal_name onde existem). Com as tabelas REAIS (que têm mais NOT NULL) essa seção
-- deve ser adaptada; foi executada contra STUBS mínimos no banco dn_p004. O restante não depende disso.
-- Convenção de ids: aaaaaaaa-.../bbbbbbbb-... = empresa A/B; sufixo a1 usuário, 91 grupo, 92 zona, 93 canal,
-- 94 cliente, 95/96 produto, 11/12 listas, 21 item, 31 escala, 41 regra.
\set ON_ERROR_STOP 1
\i _helpers-teste.sql

-- ---- carga mínima (superusuário; contorna RLS) ----
INSERT INTO companies (id, code, legal_name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','empresa_a','Empresa A S.A.'),
  ('bbbbbbbb-0000-0000-0000-000000000001','empresa_b','Empresa B S.A.');
INSERT INTO users (id, company_id, username, first_name, password_hash) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000a1','aaaaaaaa-0000-0000-0000-000000000001','admin','Ana','x'),
  ('bbbbbbbb-0000-0000-0000-0000000000a1','bbbbbbbb-0000-0000-0000-000000000001','admin','Beto','x');

-- ---- carga de dependências (P002/P003) ----
INSERT INTO currencies (code, name) VALUES ('PYG','Guaraní'),('USD','Dólar');
INSERT INTO geo_countries (code, name) VALUES ('PRY','Paraguay');
INSERT INTO units_of_measure (id, code, name) VALUES ('00000000-0000-0000-0000-0000000000e1','UN','Unidad');
INSERT INTO customer_groups (id, company_id, code, name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000091','aaaaaaaa-0000-0000-0000-000000000001','MAY','Mayoristas A'),
  ('bbbbbbbb-0000-0000-0000-000000000091','bbbbbbbb-0000-0000-0000-000000000001','MAY','Mayoristas B');
INSERT INTO commercial_zones (id, company_id, code, name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000092','aaaaaaaa-0000-0000-0000-000000000001','Z1','Zona A'),
  ('bbbbbbbb-0000-0000-0000-000000000092','bbbbbbbb-0000-0000-0000-000000000001','Z1','Zona B');
INSERT INTO sales_channels (id, company_id, code, name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000093','aaaaaaaa-0000-0000-0000-000000000001','C1','Canal A'),
  ('bbbbbbbb-0000-0000-0000-000000000093','bbbbbbbb-0000-0000-0000-000000000001','C1','Canal B');
INSERT INTO customers (id, company_id, code, recipient_nature_code, operation_type_code, person_type, taxpayer_type_code, country_code, document_type, tax_id, tax_id_check_digit, legal_name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000094','aaaaaaaa-0000-0000-0000-000000000001','CLI-000001',1,1,'JURIDICA',2,'PRY','RUC','80012345','7','Cliente A'),
  ('bbbbbbbb-0000-0000-0000-000000000094','bbbbbbbb-0000-0000-0000-000000000001','CLI-000001',1,1,'JURIDICA',2,'PRY','RUC','80012345','7','Cliente B');
INSERT INTO products (id, company_id, code, description, invoice_description, unit_of_measure_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000095','aaaaaaaa-0000-0000-0000-000000000001','P1','Produto A','Produto A','00000000-0000-0000-0000-0000000000e1'),
  ('bbbbbbbb-0000-0000-0000-000000000095','bbbbbbbb-0000-0000-0000-000000000001','P1','Produto B','Produto B','00000000-0000-0000-0000-0000000000e1'),
  ('aaaaaaaa-0000-0000-0000-000000000096','aaaaaaaa-0000-0000-0000-000000000001','P2','Produto A2','Produto A2','00000000-0000-0000-0000-0000000000e1');

-- ---- carga de P004 (A e B) ----
INSERT INTO price_lists (id, company_id, code, name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000011','aaaaaaaa-0000-0000-0000-000000000001','LP-001','Minorista A'),
  ('bbbbbbbb-0000-0000-0000-000000000011','bbbbbbbb-0000-0000-0000-000000000001','LP-001','Minorista B');  -- mesmo code em empresas diferentes: permitido
INSERT INTO price_list_items (id, company_id, price_list_id, product_id, unit_of_measure_id, currency_code, list_price, valid_from) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000021','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000011','aaaaaaaa-0000-0000-0000-000000000095','00000000-0000-0000-0000-0000000000e1','PYG',10000,'2026-01-01'),
  ('bbbbbbbb-0000-0000-0000-000000000021','bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000011','bbbbbbbb-0000-0000-0000-000000000095','00000000-0000-0000-0000-0000000000e1','PYG',20000,'2026-01-01');
INSERT INTO price_list_item_tiers (id, company_id, price_list_item_id, min_quantity, price) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000031','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000021',12,9500),
  ('bbbbbbbb-0000-0000-0000-000000000031','bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000021',12,19000);
INSERT INTO price_list_rules (id, company_id, price_list_id, priority, allows_additional_discount, max_discount_pct, valid_from) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000041','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000011',10,true,5,'2026-01-01'),
  ('bbbbbbbb-0000-0000-0000-000000000041','bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000011',10,true,5,'2026-01-01');
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dn_app_test;

-- ---- V-DEF: defaults provados pelo código (regra 4: tipo VENTA, PYG, ACTIVA, PRECIO_FIJO, IVA incluído, prioridade 10, desc. máx. 5) ----
SELECT expect_count('V-DEF defaults da lista nova',
  $$SELECT 1 FROM price_lists WHERE id='aaaaaaaa-0000-0000-0000-000000000011' AND list_type='VENTA' AND currency_code='PYG'
      AND status='ACTIVA' AND pricing_mode='PRECIO_FIJO' AND includes_tax AND priority=10 AND allows_additional_discount
      AND max_discount_pct=5 AND general_adjustment_pct=0 AND is_active AND valid_from=current_date AND valid_to IS NULL$$, 1);
SELECT expect_count('V-DEF defaults do item (min 1, desconto 0, margem 0, ativo)',
  $$SELECT 1 FROM price_list_items WHERE id='aaaaaaaa-0000-0000-0000-000000000021' AND min_quantity=1 AND discount_pct=0
      AND margin_pct=0 AND reference_cost=0 AND base_price=0 AND is_active$$, 1);
SELECT expect_count('V-DEF defaults da regra (GENERAL, min 1, ativa)',
  $$SELECT 1 FROM price_list_rules WHERE id='aaaaaaaa-0000-0000-0000-000000000041' AND application_type='GENERAL' AND min_quantity=1 AND is_active AND reference_id IS NULL$$, 1);

-- ---- V-UQ ----
SELECT expect_error('V-UQ code de lista repetido na empresa A',
  $$INSERT INTO price_lists (company_id, code, name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','LP-001','Duplicada')$$, '23505');
SELECT expect_error('V-UQ mesmo produto duas vezes na mesma lista (regra confirmada 6)',
  $$INSERT INTO price_list_items (company_id, price_list_id, product_id, unit_of_measure_id, currency_code, valid_from)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000011','aaaaaaaa-0000-0000-0000-000000000095','00000000-0000-0000-0000-0000000000e1','PYG','2026-02-01')$$, '23505');
SELECT expect_error('V-UQ (company_id,id) repetido em price_lists',
  $$INSERT INTO price_lists (id, company_id, code, name) VALUES ('aaaaaaaa-0000-0000-0000-000000000011','aaaaaaaa-0000-0000-0000-000000000001','LP-999','X')$$, '23505');
-- mesmo produto em OUTRA lista da mesma empresa é permitido
INSERT INTO price_lists (id, company_id, code, name) VALUES ('aaaaaaaa-0000-0000-0000-000000000012','aaaaaaaa-0000-0000-0000-000000000001','LP-002','Mayorista A');
INSERT INTO price_list_items (company_id, price_list_id, product_id, unit_of_measure_id, currency_code, valid_from)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000012','aaaaaaaa-0000-0000-0000-000000000095','00000000-0000-0000-0000-0000000000e1','PYG','2026-01-01');

-- ---- V-ENUM ----
SELECT expect_error('V-ENUM list_type inválido',
  $$UPDATE price_lists SET list_type='VENDA' WHERE code='LP-001' AND company_id='aaaaaaaa-0000-0000-0000-000000000001'$$, '23514');
SELECT expect_error('V-ENUM status inválido (valor traduzido não é aceito)',
  $$UPDATE price_lists SET status='ACTIVE' WHERE code='LP-001' AND company_id='aaaaaaaa-0000-0000-0000-000000000001'$$, '23514');
SELECT expect_error('V-ENUM pricing_mode inválido',
  $$UPDATE price_lists SET pricing_mode='FIXED' WHERE code='LP-001' AND company_id='aaaaaaaa-0000-0000-0000-000000000001'$$, '23514');
SELECT expect_error('V-ENUM application_type inválido',
  $$UPDATE price_list_rules SET application_type='REGION' WHERE id='aaaaaaaa-0000-0000-0000-000000000041'$$, '23514');
-- todos os valores do código são aceitos (VENCIDA incluída; COMPRA; os 5 tipos de aplicação)
SELECT expect_affected('V-ENUM status VENCIDA aceito', $$UPDATE price_lists SET status='VENCIDA' WHERE id='aaaaaaaa-0000-0000-0000-000000000012'$$, 1);
SELECT expect_affected('V-ENUM COMPRA / AJUSTE_PORCENTAJE aceitos',
  $$UPDATE price_lists SET list_type='COMPRA', pricing_mode='AJUSTE_PORCENTAJE', status='BORRADOR' WHERE id='aaaaaaaa-0000-0000-0000-000000000012'$$, 1);
SELECT expect_affected('V-ENUM MARGEN_SOBRE_COSTO / INACTIVA aceitos',
  $$UPDATE price_lists SET pricing_mode='MARGEN_SOBRE_COSTO', status='INACTIVA' WHERE id='aaaaaaaa-0000-0000-0000-000000000012'$$, 1);
SELECT expect_affected('V-ENUM application_type GRUPO_CLIENTE aceito', $$UPDATE price_list_rules SET application_type='GRUPO_CLIENTE' WHERE id='aaaaaaaa-0000-0000-0000-000000000041'$$, 1);
SELECT expect_affected('V-ENUM application_type CLIENTE aceito', $$UPDATE price_list_rules SET application_type='CLIENTE' WHERE id='aaaaaaaa-0000-0000-0000-000000000041'$$, 1);
SELECT expect_affected('V-ENUM application_type ZONA aceito', $$UPDATE price_list_rules SET application_type='ZONA' WHERE id='aaaaaaaa-0000-0000-0000-000000000041'$$, 1);
SELECT expect_affected('V-ENUM application_type CANAL_VENTA aceito', $$UPDATE price_list_rules SET application_type='CANAL_VENTA' WHERE id='aaaaaaaa-0000-0000-0000-000000000041'$$, 1);
SELECT expect_affected('V-ENUM application_type GENERAL aceito', $$UPDATE price_list_rules SET application_type='GENERAL' WHERE id='aaaaaaaa-0000-0000-0000-000000000041'$$, 1);

-- ---- V-REQ (NOT NULL críticos) ----
SELECT expect_error('V-REQ lista sem code',   $$INSERT INTO price_lists (company_id, name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','Sem code')$$, '23502');
SELECT expect_error('V-REQ lista sem name',   $$INSERT INTO price_lists (company_id, code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','LP-777')$$, '23502');
SELECT expect_error('V-REQ lista sem company_id', $$INSERT INTO price_lists (code, name) VALUES ('LP-778','Sem empresa')$$, '23502');
SELECT expect_error('V-REQ lista sem valid_from', $$INSERT INTO price_lists (company_id, code, name, valid_from) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','LP-779','X',NULL)$$, '23502');
SELECT expect_error('V-REQ item sem product_id',
  $$INSERT INTO price_list_items (company_id, price_list_id, unit_of_measure_id, currency_code, valid_from)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000011','00000000-0000-0000-0000-0000000000e1','PYG','2026-01-01')$$, '23502');
SELECT expect_error('V-REQ item sem valid_from',
  $$INSERT INTO price_list_items (company_id, price_list_id, product_id, unit_of_measure_id, currency_code)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000012','aaaaaaaa-0000-0000-0000-000000000095','00000000-0000-0000-0000-0000000000e1','PYG')$$, '23502');
SELECT expect_error('V-REQ escala sem min_quantity',
  $$INSERT INTO price_list_item_tiers (company_id, price_list_item_id, price) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000021',1)$$, '23502');
SELECT expect_error('V-REQ regra sem prioridade',
  $$INSERT INTO price_list_rules (company_id, price_list_id, allows_additional_discount, max_discount_pct, valid_from)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000011',true,5,'2026-01-01')$$, '23502');

-- ---- V-FK: FK composta impede ligar linhas de empresas diferentes (uma por família) ----
SELECT expect_error('V-FK lista base de outra empresa',
  $$INSERT INTO price_lists (company_id, code, name, base_price_list_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','FK1','X','bbbbbbbb-0000-0000-0000-000000000011')$$, '23503');
SELECT expect_error('V-FK grupo de cliente de outra empresa',
  $$INSERT INTO price_lists (company_id, code, name, customer_group_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','FK2','X','bbbbbbbb-0000-0000-0000-000000000091')$$, '23503');
SELECT expect_error('V-FK cliente de outra empresa',
  $$INSERT INTO price_lists (company_id, code, name, customer_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','FK3','X','bbbbbbbb-0000-0000-0000-000000000094')$$, '23503');
SELECT expect_error('V-FK zona de outra empresa',
  $$INSERT INTO price_lists (company_id, code, name, commercial_zone_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','FK4','X','bbbbbbbb-0000-0000-0000-000000000092')$$, '23503');
SELECT expect_error('V-FK canal de outra empresa',
  $$INSERT INTO price_lists (company_id, code, name, sales_channel_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','FK5','X','bbbbbbbb-0000-0000-0000-000000000093')$$, '23503');
SELECT expect_error('V-FK created_by de outra empresa',
  $$INSERT INTO price_lists (company_id, code, name, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','FK6','X','bbbbbbbb-0000-0000-0000-0000000000a1')$$, '23503');
SELECT expect_error('V-FK moeda inexistente em currencies',
  $$INSERT INTO price_lists (company_id, code, name, currency_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','FK7','X','XXX')$$, '23503');
SELECT expect_error('V-FK item em lista de outra empresa',
  $$INSERT INTO price_list_items (company_id, price_list_id, product_id, unit_of_measure_id, currency_code, valid_from)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000011','aaaaaaaa-0000-0000-0000-000000000095','00000000-0000-0000-0000-0000000000e1','PYG','2026-01-01')$$, '23503');
SELECT expect_error('V-FK item com produto de outra empresa',
  $$INSERT INTO price_list_items (company_id, price_list_id, product_id, unit_of_measure_id, currency_code, valid_from)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000012','bbbbbbbb-0000-0000-0000-000000000095','00000000-0000-0000-0000-0000000000e1','PYG','2026-01-01')$$, '23503');
SELECT expect_error('V-FK item com moeda inexistente',
  $$INSERT INTO price_list_items (company_id, price_list_id, product_id, unit_of_measure_id, currency_code, valid_from)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000012','aaaaaaaa-0000-0000-0000-000000000096','00000000-0000-0000-0000-0000000000e1','XXX','2026-01-01')$$, '23503');
SELECT expect_error('V-FK item com unidade inexistente',
  $$INSERT INTO price_list_items (company_id, price_list_id, product_id, unit_of_measure_id, currency_code, valid_from)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000012','aaaaaaaa-0000-0000-0000-000000000096','00000000-0000-0000-0000-0000000000ff','PYG','2026-01-01')$$, '23503');
SELECT expect_error('V-FK escala em item de outra empresa',
  $$INSERT INTO price_list_item_tiers (company_id, price_list_item_id, min_quantity, price) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000021',5,1)$$, '23503');
SELECT expect_error('V-FK regra em lista de outra empresa',
  $$INSERT INTO price_list_rules (company_id, price_list_id, priority, allows_additional_discount, max_discount_pct, valid_from)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000011',10,true,5,'2026-01-01')$$, '23503');
-- ALTER TABLE customers: FK composta customers -> price_lists (CLI-027 / LPR-037)
SELECT expect_error('V-FK cliente A com lista de preços de B (UPDATE)',
  $$UPDATE customers SET price_list_id='bbbbbbbb-0000-0000-0000-000000000011' WHERE id='aaaaaaaa-0000-0000-0000-000000000094'$$, '23503');
SELECT expect_error('V-FK cliente A novo com lista de B (INSERT)',
  $$INSERT INTO customers (company_id, code, recipient_nature_code, operation_type_code, person_type, taxpayer_type_code, country_code, document_type, tax_id, tax_id_check_digit, legal_name, price_list_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','CLI-2',1,1,'JURIDICA',2,'PRY','RUC','80012346','1','X','bbbbbbbb-0000-0000-0000-000000000011')$$, '23503');
SELECT expect_error('V-FK cliente A com lista inexistente',
  $$UPDATE customers SET price_list_id='aaaaaaaa-0000-0000-0000-0000000000ee' WHERE id='aaaaaaaa-0000-0000-0000-000000000094'$$, '23503');
SELECT expect_affected('V-FK cliente A com lista de A é aceito',
  $$UPDATE customers SET price_list_id='aaaaaaaa-0000-0000-0000-000000000011' WHERE id='aaaaaaaa-0000-0000-0000-000000000094'$$, 1);
SELECT expect_affected('V-FK cliente com lista NULL (opcional) é aceito',
  $$UPDATE customers SET price_list_id=NULL WHERE id='bbbbbbbb-0000-0000-0000-000000000094'$$, 1);
-- lados válidos das FKs de escopo (mesma empresa)
INSERT INTO price_lists (company_id, code, name, base_price_list_id, customer_group_id, customer_id, commercial_zone_id, sales_channel_id, created_by)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001','LP-003','Escopo completo A','aaaaaaaa-0000-0000-0000-000000000011','aaaaaaaa-0000-0000-0000-000000000091',
        'aaaaaaaa-0000-0000-0000-000000000094','aaaaaaaa-0000-0000-0000-000000000092','aaaaaaaa-0000-0000-0000-000000000093','aaaaaaaa-0000-0000-0000-0000000000a1');

-- ---- regras de integridade implementadas pelo SQL ----
SELECT expect_error('REGRA apagar lista usada por cliente é recusado (NO ACTION)',
  $$DELETE FROM price_lists WHERE id='aaaaaaaa-0000-0000-0000-000000000011'$$, '23503');
SELECT expect_error('REGRA apagar lista com itens é recusado (sem CASCADE)',
  $$DELETE FROM price_lists WHERE id='bbbbbbbb-0000-0000-0000-000000000011'$$, '23503');
SELECT expect_error('REGRA apagar item com escalas é recusado (sem CASCADE)',
  $$DELETE FROM price_list_items WHERE id='bbbbbbbb-0000-0000-0000-000000000021'$$, '23503');
INSERT INTO price_lists (id, company_id, code, name) VALUES ('aaaaaaaa-0000-0000-0000-000000000013','aaaaaaaa-0000-0000-0000-000000000001','LP-005','Base isolada');
INSERT INTO price_lists (company_id, code, name, base_price_list_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','LP-006','Deriva de LP-005','aaaaaaaa-0000-0000-0000-000000000013');
SELECT expect_error('REGRA apagar lista base em uso por outra lista é recusado',
  $$DELETE FROM price_lists WHERE id='aaaaaaaa-0000-0000-0000-000000000013'$$, '23503');
DO $$
DECLARE t0 timestamptz; t1 timestamptz;
BEGIN
  SELECT updated_at INTO t0 FROM price_lists WHERE id='aaaaaaaa-0000-0000-0000-000000000012';
  PERFORM pg_sleep(0.05);
  UPDATE price_lists SET name='Mayorista A v2' WHERE id='aaaaaaaa-0000-0000-0000-000000000012';
  SELECT updated_at INTO t1 FROM price_lists WHERE id='aaaaaaaa-0000-0000-0000-000000000012';
  IF t1 <= t0 THEN RAISE EXCEPTION 'TESTE FALHOU [trigger updated_at]: % <= %', t1, t0; END IF;
  RAISE NOTICE 'OK   [trigger updated_at em price_lists]';
  SELECT updated_at INTO t0 FROM price_list_items WHERE id='aaaaaaaa-0000-0000-0000-000000000021';
  PERFORM pg_sleep(0.05);
  UPDATE price_list_items SET list_price=11000 WHERE id='aaaaaaaa-0000-0000-0000-000000000021';
  SELECT updated_at INTO t1 FROM price_list_items WHERE id='aaaaaaaa-0000-0000-0000-000000000021';
  IF t1 <= t0 THEN RAISE EXCEPTION 'TESTE FALHOU [trigger updated_at items]: % <= %', t1, t0; END IF;
  RAISE NOTICE 'OK   [trigger updated_at em price_list_items]';
END $$;
SELECT expect_count('REGRA triggers set_updated_at nas 4 tabelas',
  $$SELECT 1 FROM pg_trigger WHERE tgname IN ('price_lists_set_updated_at','price_list_items_set_updated_at','price_list_item_tiers_set_updated_at','price_list_rules_set_updated_at')$$, 4);
SELECT expect_count('REGRA RLS ENABLE+FORCE nas 4 tabelas',
  $$SELECT 1 FROM pg_class WHERE relname IN ('price_lists','price_list_items','price_list_item_tiers','price_list_rules') AND relrowsecurity AND relforcerowsecurity$$, 4);

-- ---- V-DEF (pendências que o SQL deixa ABERTAS de propósito; se alguma virar CHECK, este teste deve ser trocado por V-RANGE) ----
SELECT expect_affected('V-DEF PENDENTE: valid_to < valid_from ainda é aceito (CHECK é DEFINIR, LPR-016)',
  $$UPDATE price_lists SET valid_from='2026-12-31', valid_to='2026-01-01' WHERE id='aaaaaaaa-0000-0000-0000-000000000012'$$, 1);
SELECT expect_affected('V-DEF PENDENTE: percentuais/preços fora de faixa ainda aceitos (DLP-12)',
  $$UPDATE price_list_items SET list_price=-1, discount_pct=150 WHERE id='aaaaaaaa-0000-0000-0000-000000000021'$$, 1);
SELECT expect_affected('V-DEF PENDENTE: regra de tipo CLIENTE sem reference_id ainda aceita (LPR-067)',
  $$UPDATE price_list_rules SET application_type='CLIENTE', reference_id=NULL WHERE id='aaaaaaaa-0000-0000-0000-000000000041'$$, 1);

-- ---- V-ISO: RLS com o papel da aplicação ----
BEGIN;
SET LOCAL ROLE dn_app_test;
SELECT expect_count('V-ISO sem app.company_id nada é visível (price_lists)', 'SELECT 1 FROM price_lists', 0);
SELECT expect_count('V-ISO sem app.company_id nada é visível (price_list_items)', 'SELECT 1 FROM price_list_items', 0);
SELECT expect_count('V-ISO sem app.company_id nada é visível (price_list_item_tiers)', 'SELECT 1 FROM price_list_item_tiers', 0);
SELECT expect_count('V-ISO sem app.company_id nada é visível (price_list_rules)', 'SELECT 1 FROM price_list_rules', 0);
SELECT expect_error('V-ISO sem app.company_id não grava lista',
  $$INSERT INTO price_lists (company_id, code, name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','ISO0','X')$$, '42501');
SELECT set_config('app.company_id','aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT expect_count('V-ISO A vê só as suas listas (LP-001, 002, 003, 005, 006)', 'SELECT 1 FROM price_lists', 5);
SELECT expect_count('V-ISO A vê só os seus itens', 'SELECT 1 FROM price_list_items', 2);
SELECT expect_count('V-ISO A vê só as suas escalas', 'SELECT 1 FROM price_list_item_tiers', 1);
SELECT expect_count('V-ISO A vê só as suas regras', 'SELECT 1 FROM price_list_rules', 1);
SELECT expect_count('V-ISO A não vê a lista de B por id', $$SELECT 1 FROM price_lists WHERE id='bbbbbbbb-0000-0000-0000-000000000011'$$, 0);
SELECT expect_count('V-ISO A não vê o item de B por id', $$SELECT 1 FROM price_list_items WHERE id='bbbbbbbb-0000-0000-0000-000000000021'$$, 0);
SELECT expect_error('V-ISO A não grava lista com company_id de B',
  $$INSERT INTO price_lists (company_id, code, name) VALUES ('bbbbbbbb-0000-0000-0000-000000000001','ISO1','Invasora')$$, '42501');
SELECT expect_error('V-ISO A não grava item com company_id de B',
  $$INSERT INTO price_list_items (company_id, price_list_id, product_id, unit_of_measure_id, currency_code, valid_from)
    VALUES ('bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000011','bbbbbbbb-0000-0000-0000-000000000095','00000000-0000-0000-0000-0000000000e1','USD','2026-01-01')$$, '42501');
SELECT expect_error('V-ISO A não grava escala com company_id de B',
  $$INSERT INTO price_list_item_tiers (company_id, price_list_item_id, min_quantity, price) VALUES ('bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000021',99,1)$$, '42501');
SELECT expect_error('V-ISO A não grava regra com company_id de B',
  $$INSERT INTO price_list_rules (company_id, price_list_id, priority, allows_additional_discount, max_discount_pct, valid_from)
    VALUES ('bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000011',1,true,5,'2026-01-01')$$, '42501');
SELECT expect_affected('V-ISO A não altera lista de B', $$UPDATE price_lists SET name='hack' WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não altera item de B', $$UPDATE price_list_items SET list_price=1 WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não altera escala de B', $$UPDATE price_list_item_tiers SET price=1 WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não altera regra de B', $$UPDATE price_list_rules SET priority=99 WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não apaga lista de B', $$DELETE FROM price_lists WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não apaga item de B', $$DELETE FROM price_list_items WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não apaga escala de B', $$DELETE FROM price_list_item_tiers WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não apaga regra de B', $$DELETE FROM price_list_rules WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_error('V-ISO A não move lista sua para a empresa B',
  $$UPDATE price_lists SET company_id='bbbbbbbb-0000-0000-0000-000000000001' WHERE code='LP-003'$$, '42501');
SELECT expect_affected('V-ISO A altera a própria lista', $$UPDATE price_lists SET notes='ok' WHERE code='LP-003'$$, 1);
COMMIT;
BEGIN;
SET LOCAL ROLE dn_app_test;
SELECT set_config('app.company_id','bbbbbbbb-0000-0000-0000-000000000001', true);
SELECT expect_count('V-ISO B vê só as suas listas', 'SELECT 1 FROM price_lists', 1);
SELECT expect_count('V-ISO B vê só os seus itens', 'SELECT 1 FROM price_list_items', 1);
SELECT expect_count('V-ISO B vê só as suas escalas', 'SELECT 1 FROM price_list_item_tiers', 1);
SELECT expect_count('V-ISO B vê só as suas regras', 'SELECT 1 FROM price_list_rules', 1);
SELECT expect_count('V-ISO B não vê lista de A por código/escopo', $$SELECT 1 FROM price_lists WHERE code IN ('LP-002','LP-003')$$, 0);
COMMIT;

\echo 'TESTE-P004: TODOS OS CASOS PASSARAM'
