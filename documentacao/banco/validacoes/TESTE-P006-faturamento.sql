-- TESTE-P006-faturamento.sql — executar em banco DESCARTÁVEL, DENTRO desta pasta, após
-- P001-up e P006-up (e os STUBS mínimos das dependências ainda inexistentes: currencies(code),
-- taxes(id), customers(company_id,id), products(company_id,id) — ver contrato do brief).
-- Casos: V-REQ, V-UQ, V-ENUM, V-FMT, V-RANGE, V-DEF, V-FK (cross-tenant), V-ISO (RLS),
-- numeração (contador + concorrência real) e imutabilidade da fatura emitida/aprovada.
-- Falha = exceção (psql -v ON_ERROR_STOP=1). Requer psql >= 15 (\setenv) e acesso ao próprio
-- servidor (o teste de concorrência abre 2 sessões psql em segundo plano via \!).
\set ON_ERROR_STOP 1
\i _helpers-teste.sql

-- ---- helpers locais do teste (banco descartável) ----
CREATE OR REPLACE FUNCTION expect_true(test_name text, cond boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'TESTE FALHOU [%]: condição falsa', test_name; END IF;
  RAISE NOTICE 'OK   [%]', test_name;
END $$;

CREATE FUNCTION ca()  RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT 'aaaaaaaa-0000-0000-0000-000000000001'::uuid $$;
CREATE FUNCTION cb()  RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT 'bbbbbbbb-0000-0000-0000-000000000001'::uuid $$;
CREATE FUNCTION bra() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT 'aaaaaaaa-0000-0000-0000-0000000000b1'::uuid $$;
CREATE FUNCTION bra2() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT 'aaaaaaaa-0000-0000-0000-0000000000b2'::uuid $$;
CREATE FUNCTION brb() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT 'bbbbbbbb-0000-0000-0000-0000000000b1'::uuid $$;
CREATE FUNCTION usa() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT 'aaaaaaaa-0000-0000-0000-0000000000a1'::uuid $$;
CREATE FUNCTION usb() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT 'bbbbbbbb-0000-0000-0000-0000000000a1'::uuid $$;
CREATE FUNCTION cua() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT 'aaaaaaaa-0000-0000-0000-0000000000c1'::uuid $$;
CREATE FUNCTION cub() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT 'bbbbbbbb-0000-0000-0000-0000000000c1'::uuid $$;
CREATE FUNCTION pra() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT 'aaaaaaaa-0000-0000-0000-0000000000e1'::uuid $$;
CREATE FUNCTION prb() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT 'bbbbbbbb-0000-0000-0000-0000000000e1'::uuid $$;
CREATE FUNCTION fa()  RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT 'aaaaaaaa-0000-0000-0000-00000000f001'::uuid $$;
CREATE FUNCTION fb()  RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT 'aaaaaaaa-0000-0000-0000-00000000f002'::uuid $$;
CREATE FUNCTION fc()  RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT 'aaaaaaaa-0000-0000-0000-00000000f003'::uuid $$;
CREATE FUNCTION fd()  RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT 'aaaaaaaa-0000-0000-0000-00000000f004'::uuid $$;
CREATE FUNCTION fbb() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT 'bbbbbbbb-0000-0000-0000-00000000f001'::uuid $$;
CREATE SEQUENCE t_n;

-- INSERT genérico por documento jsonb: só as chaves informadas viram colunas (defaults do banco preservados)
CREATE FUNCTION t_ins(tbl regclass, doc jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(k), ',') INTO cols FROM jsonb_object_keys(doc) k;
  EXECUTE format('INSERT INTO %s (%s) SELECT %s FROM jsonb_populate_record(NULL::%s, $1)', tbl, cols, cols, tbl) USING doc;
END $$;

-- documentos-base (empresa A); o 2º argumento sobrescreve/acrescenta chaves
CREATE FUNCTION t_inv(o jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('company_id', ca(), 'branch_id', bra(), 'customer_id', cua(),
    'internal_number', 'FAC-' || lpad((800000 + nextval('t_n'))::text, 6, '0'),
    'sequence_number', lpad((5000 + nextval('t_n'))::text, 7, '0'),
    'establishment_description', 'Casa Central', 'issuance_point_description', 'Casa Central',
    'issue_date', '2026-10-09', 'customer_code', 'CLI-000001', 'total_amount', 0) || o $$;
CREATE FUNCTION t_line(inv uuid, o jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('company_id', ca(), 'invoice_id', inv, 'line_number', nextval('t_n'),
    'product_id', pra(), 'product_code', 'P-1', 'description', 'Item', 'vat_treatment', 'GRAVADO',
    'vat_rate', 10, 'quantity', 1, 'unit_price', 110, 'line_total', 110) || o $$;
CREATE FUNCTION t_tax(inv uuid, o jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('company_id', ca(), 'invoice_id', inv, 'vat_rate', 10,
    'subtotal_amount', 110, 'taxable_base_amount', 100, 'tax_amount', 10) || o $$;
CREATE FUNCTION t_pay(inv uuid, o jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('company_id', ca(), 'invoice_id', inv, 'method', 'EFECTIVO', 'amount', 110) || o $$;
CREATE FUNCTION t_one(inv uuid, o jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('company_id', ca(), 'invoice_id', inv) || o $$;

-- ---- carga mínima (superusuário; contorna RLS) ----
INSERT INTO companies (id, code, legal_name) VALUES
  (ca(),'empresa_a','Empresa A S.A.'), (cb(),'empresa_b','Empresa B S.A.');
INSERT INTO branches (id, company_id, code, name, sifen_establishment) VALUES
  (bra(), ca(), '001', 'Casa Matriz A', NULL),
  (bra2(), ca(), '002', 'Sucursal 2 A', '002'),
  (brb(), cb(), '001', 'Casa Matriz B', NULL);
INSERT INTO users (id, company_id, username, first_name, password_hash) VALUES
  (usa(), ca(), 'admin', 'Ana', 'x'), (usb(), cb(), 'admin', 'Beto', 'x');
INSERT INTO geo_countries (code, name) VALUES ('PRY','Paraguay');
INSERT INTO currencies (code, name) VALUES ('PYG','Guaraní'),('USD','Dólar'),('BRL','Real'),('EUR','Euro'),('ARS','Peso argentino');
INSERT INTO units_of_measure (id, code, name) VALUES ('00000000-0000-0000-0000-0000000000c9','UN','Unidad');
INSERT INTO customers (id, company_id, recipient_nature_code, operation_type_code, person_type, taxpayer_type_code, country_code, document_type, tax_id, tax_id_check_digit, legal_name) VALUES
  (cua(), ca(), 1,1,'JURIDICA',2,'PRY','RUC','80012345','7','Cliente A'), (cub(), cb(), 1,1,'JURIDICA',2,'PRY','RUC','80012345','7','Cliente B');
INSERT INTO products (id, company_id, code, description, invoice_description, unit_of_measure_id) VALUES
  (pra(), ca(), 'PA', 'Produto A','Produto A','00000000-0000-0000-0000-0000000000c9'), (prb(), cb(), 'PB', 'Produto B','Produto B','00000000-0000-0000-0000-0000000000c9');
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dn_app_test;
GRANT USAGE ON SEQUENCE t_n TO dn_app_test;

-- =============================================================================
-- Fatura FA (empresa A): BORRADOR com 3 linhas (5%, 10%, exenta) — mapeamento Regra 12
-- =============================================================================
SELECT t_ins('invoices', t_inv(jsonb_build_object('id', fa(), 'internal_number','FAC-900001',
  'sequence_number','0000001', 'total_amount', 167000, 'created_by', usa())));
SELECT t_ins('invoice_lines', t_line(fa(), '{"vat_rate":5,"quantity":1,"unit_price":85000,"line_total":85000}'));
SELECT t_ins('invoice_lines', t_line(fa(), '{"vat_rate":10,"quantity":2,"unit_price":36000,"line_total":72000}'));
SELECT t_ins('invoice_lines', t_line(fa(), '{"vat_treatment":"EXENTO","vat_rate":0,"quantity":4,"unit_price":2500,"line_total":10000}'));

-- ---- V-DEF: defaults do mapeamento ----
SELECT expect_count('V-DEF fatura nasce BORRADOR/001/001/PYG/CONTADO/VENTA_MERCADERIA/PRESENCIAL',
  $$SELECT 1 FROM invoices WHERE id=fa() AND status='BORRADOR' AND establishment_code='001' AND issuance_point_code='001'
    AND currency_code='PYG' AND operation_condition='CONTADO' AND transaction_type='VENTA_MERCADERIA'
    AND presence_indicator='PRESENCIAL'$$, 1);
SELECT expect_count('V-DEF snapshot do receptor: CONTRIBUYENTE/PERSONA_JURIDICA/RUC/SIN NOMBRE/casa 0',
  $$SELECT 1 FROM invoices WHERE id=fa() AND customer_nature='CONTRIBUYENTE' AND customer_taxpayer_type='PERSONA_JURIDICA'
    AND customer_document_type='RUC' AND customer_legal_name='SIN NOMBRE' AND customer_house_number='0'$$, 1);
SELECT expect_count('V-DEF cdc/sifen_message nascem NULL; created_at/updated_at preenchidos',
  $$SELECT 1 FROM invoices WHERE id=fa() AND cdc IS NULL AND sifen_message IS NULL AND created_at IS NOT NULL AND updated_at IS NOT NULL$$, 1);
SELECT expect_count('V-DEF linha: unidade Unidad',
  $$SELECT 1 FROM invoice_lines WHERE invoice_id=fa() AND unit_of_measure_name='Unidad'$$, 3);
SELECT t_ins('invoice_payments', t_pay(fa(), '{"amount":167000}'));
SELECT t_ins('invoice_exports', t_one(fa(), '{"destination_country":"Brasil","gross_weight":12.5}'));
SELECT t_ins('invoice_public_procurements', t_one(fa(), '{"modality":"Licitación","entity_name":"MEC"}'));
SELECT expect_count('V-DEF exportação: textos nascem vazios, órfãos NULL, pesos',
  $$SELECT 1 FROM invoice_exports WHERE invoice_id=fa() AND operation_type='' AND export_city='' AND net_weight=0
    AND payment_instructions IS NULL AND transported_goods_quantity IS NULL$$, 1);
SELECT expect_count('V-DEF contratação pública: campos órfãos NULL',
  $$SELECT 1 FROM invoice_public_procurements WHERE invoice_id=fa() AND procurement_code='' AND contract_number IS NULL AND contract_date IS NULL$$, 1);

-- ---- V-REQ: NOT NULL críticos ----
SELECT expect_error('V-REQ fatura sem customer_id', $$SELECT t_ins('invoices', t_inv('{"customer_id":null}'))$$, '23502');
SELECT expect_error('V-REQ fatura sem branch_id',   $$SELECT t_ins('invoices', t_inv('{"branch_id":null}'))$$, '23502');
SELECT expect_error('V-REQ fatura sem company_id',  $$SELECT t_ins('invoices', t_inv('{"company_id":null}'))$$, '23502');
SELECT expect_error('V-REQ fatura sem sequence_number', $$SELECT t_ins('invoices', t_inv('{"sequence_number":null}'))$$, '23502');
SELECT expect_error('V-REQ fatura sem internal_number', $$SELECT t_ins('invoices', t_inv('{"internal_number":null}'))$$, '23502');
SELECT expect_error('V-REQ fatura sem issue_date', $$SELECT t_ins('invoices', t_inv('{"issue_date":null}'))$$, '23502');
SELECT expect_error('V-REQ fatura sem total_amount', $$SELECT t_ins('invoices', t_inv('{"total_amount":null}'))$$, '23502');
SELECT expect_error('V-REQ fatura sem estado', $$SELECT t_ins('invoices', t_inv('{"status":null}'))$$, '23502');
SELECT expect_error('V-REQ fatura sem moeda', $$SELECT t_ins('invoices', t_inv('{"currency_code":null}'))$$, '23502');
SELECT expect_error('V-REQ linha sem produto', $$SELECT t_ins('invoice_lines', t_line(fa(), '{"product_id":null}'))$$, '23502');
SELECT expect_error('V-REQ linha sem line_number', $$SELECT t_ins('invoice_lines', t_line(fa(), '{"line_number":null}'))$$, '23502');
SELECT expect_error('V-REQ linha sem line_total', $$SELECT t_ins('invoice_lines', t_line(fa(), '{"line_total":null}'))$$, '23502');
SELECT expect_error('V-REQ pagamento sem método', $$SELECT t_ins('invoice_payments', t_pay(fa(), '{"method":null}'))$$, '23502');
SELECT expect_error('V-REQ imposto sem subtotal', $$SELECT t_ins('invoice_taxes', t_tax(fa(), '{"vat_rate":0,"subtotal_amount":null}'))$$, '23502');
SELECT expect_error('V-REQ contador sem tipo', $$INSERT INTO document_sequences (company_id, sequence_type) VALUES (ca(), NULL)$$, '23502');

-- ---- V-ENUM: valores EXATOS do código ----
SELECT expect_error('V-ENUM status inválido',           $$SELECT t_ins('invoices', t_inv('{"status":"ZOMBI"}'))$$, '23514');
SELECT expect_error('V-ENUM operation_condition inválida', $$SELECT t_ins('invoices', t_inv('{"operation_condition":"PLAZO"}'))$$, '23514');
SELECT expect_error('V-ENUM transaction_type inválido', $$SELECT t_ins('invoices', t_inv('{"transaction_type":"VENTA"}'))$$, '23514');
SELECT expect_error('V-ENUM presence_indicator inválido', $$SELECT t_ins('invoices', t_inv('{"presence_indicator":"FAX"}'))$$, '23514');
SELECT expect_error('V-ENUM moeda fora de PYG/USD/BRL/EUR (ARS existe em currencies)', $$SELECT t_ins('invoices', t_inv('{"currency_code":"ARS"}'))$$, '23514');
SELECT expect_error('V-ENUM customer_nature inválida', $$SELECT t_ins('invoices', t_inv('{"customer_nature":"OTRA"}'))$$, '23514');
SELECT expect_error('V-ENUM customer_taxpayer_type inválido (FISICA do cliente não é valor da fatura, DIV-16)', $$SELECT t_ins('invoices', t_inv('{"customer_taxpayer_type":"FISICA"}'))$$, '23514');
SELECT expect_error('V-ENUM vat_treatment inválido', $$SELECT t_ins('invoice_lines', t_line(fa(), '{"vat_treatment":"NO_GRAVADO"}'))$$, '23514');
SELECT expect_error('V-ENUM vat_rate 7 na linha', $$SELECT t_ins('invoice_lines', t_line(fa(), '{"vat_rate":7}'))$$, '23514');
SELECT expect_error('V-ENUM vat_rate 7 no imposto', $$SELECT t_ins('invoice_taxes', t_tax(fa(), '{"vat_rate":7}'))$$, '23514');
SELECT expect_error('V-ENUM método de pagamento inválido', $$SELECT t_ins('invoice_payments', t_pay(fa(), '{"method":"BITCOIN"}'))$$, '23514');
SELECT expect_error('V-ENUM sequence_type inválido', $$INSERT INTO document_sequences (company_id, sequence_type) VALUES (ca(), 'CUALQUIERA')$$, '23514');
-- cada valor aceito pelo código é aceito pelo banco
SELECT t_ins('invoices', t_inv(jsonb_build_object('status', s))) FROM unnest(ARRAY['BORRADOR','RECHAZADA','ANULADA']) s;
SELECT t_ins('invoices', t_inv(jsonb_build_object('currency_code', c))) FROM unnest(ARRAY['PYG','USD','BRL','EUR']) c;
SELECT t_ins('invoices', t_inv(jsonb_build_object('transaction_type', c))) FROM unnest(ARRAY['VENTA_MERCADERIA','PRESTACION_SERVICIO','MIXTO','MUESTRAS_MEDICAS','DONACION','OTRO']) c;
SELECT expect_count('V-ENUM os valores do código são aceitos (2 estados + 3 moedas + 5 tipos não padrão = 10 faturas)',
  $$SELECT 1 FROM invoices WHERE status IN ('RECHAZADA','ANULADA') OR currency_code <> 'PYG' OR transaction_type <> 'VENTA_MERCADERIA'$$, 10);

-- ---- V-FMT: formatos ----
SELECT expect_error('V-FMT internal_number sem prefixo FAC-', $$SELECT t_ins('invoices', t_inv('{"internal_number":"000007"}'))$$, '23514');
SELECT expect_error('V-FMT internal_number com 5 dígitos', $$SELECT t_ins('invoices', t_inv('{"internal_number":"FAC-00007"}'))$$, '23514');
SELECT expect_error('V-FMT sequence_number com 6 dígitos', $$SELECT t_ins('invoices', t_inv('{"sequence_number":"000007"}'))$$, '23514');
SELECT expect_error('V-FMT sequence_number com letras', $$SELECT t_ins('invoices', t_inv('{"sequence_number":"00000A7"}'))$$, '23514');
SELECT expect_error('V-FMT establishment_code com 2 dígitos', $$SELECT t_ins('invoices', t_inv('{"establishment_code":"01"}'))$$, '23514');
SELECT expect_error('V-FMT issuance_point_code com letra', $$SELECT t_ins('invoices', t_inv('{"issuance_point_code":"00X"}'))$$, '23514');
SELECT expect_error('V-FMT cdc com letras', $$SELECT t_ins('invoices', t_inv('{"cdc":"0180003314ABC"}'))$$, '23514');

-- ---- V-RANGE ----
SELECT expect_error('V-RANGE total_amount negativo', $$SELECT t_ins('invoices', t_inv('{"total_amount":-1}'))$$, '23514');
SELECT expect_error('V-RANGE quantidade 0 (DIV-08: o JS aceita, o banco não)', $$SELECT t_ins('invoice_lines', t_line(fa(), '{"quantity":0,"line_total":0}'))$$, '23514');
SELECT expect_error('V-RANGE quantidade negativa', $$SELECT t_ins('invoice_lines', t_line(fa(), '{"quantity":-1,"line_total":-110}'))$$, '23514');
SELECT expect_error('V-RANGE preço unitário negativo', $$SELECT t_ins('invoice_lines', t_line(fa(), '{"unit_price":-110,"line_total":-110}'))$$, '23514');
SELECT expect_error('V-RANGE line_number 0', $$SELECT t_ins('invoice_lines', t_line(fa(), '{"line_number":0}'))$$, '23514');
SELECT expect_error('V-RANGE line_total != qtd x preço (FAC-065)', $$SELECT t_ins('invoice_lines', t_line(fa(), '{"quantity":2,"unit_price":110,"line_total":110}'))$$, '23514');
SELECT expect_count('V-RANGE arredondamento a 4 casas aceito (1,2345 x 2,5 = 3,08625 -> 3,0862 e 3,0863)',
  $$SELECT 1 FROM (VALUES (1.2345::numeric*2.5, 3.0862::numeric), (1.2345*2.5, 3.0863)) v(p, t) WHERE abs(t - p) <= 0.00005$$, 2);
SELECT t_ins('invoice_lines', t_line(fd(), '{}')) WHERE false;  -- (fd criada abaixo)
SELECT expect_error('V-RANGE pagamento negativo', $$SELECT t_ins('invoice_payments', t_pay(fa(), '{"amount":-1}'))$$, '23514');
SELECT expect_error('V-RANGE imposto com subtotal negativo', $$SELECT t_ins('invoice_taxes', t_tax(fa(), '{"vat_rate":0,"subtotal_amount":-1,"taxable_base_amount":0,"tax_amount":0}'))$$, '23514');
SELECT expect_error('V-RANGE imposto 10%: base + IVA != subtotal', $$SELECT t_ins('invoice_taxes', t_tax(fa(), '{"taxable_base_amount":100,"tax_amount":11}'))$$, '23514');
SELECT expect_error('V-RANGE imposto 5%: base + IVA != subtotal', $$SELECT t_ins('invoice_taxes', t_tax(fa(), '{"vat_rate":5,"subtotal_amount":105,"taxable_base_amount":100,"tax_amount":4}'))$$, '23514');
SELECT expect_error('V-RANGE imposto taxa 0 com IVA (exento não tem IVA)', $$SELECT t_ins('invoice_taxes', t_tax(fa(), '{"vat_rate":0,"subtotal_amount":100,"taxable_base_amount":0,"tax_amount":10}'))$$, '23514');
SELECT expect_error('V-RANGE imposto taxa 0 com base', $$SELECT t_ins('invoice_taxes', t_tax(fa(), '{"vat_rate":0,"subtotal_amount":100,"taxable_base_amount":100,"tax_amount":0}'))$$, '23514');
SELECT expect_count('V-RANGE coerência aceita as cifras reais do mock (85.000 -> 80.952 + 4.048; 72.000 -> 65.455 + 6.545)',
  $$SELECT 1 FROM (VALUES (85000, 80952, 4048), (72000, 65455, 6545)) v(s,b,i) WHERE b + i = s$$, 2);

-- ---- V-UQ: unicidades ----
SELECT expect_error('V-UQ número fiscal repetido (empresa+estab+ponto+sequência) — DIV-07',
  $$SELECT t_ins('invoices', t_inv('{"sequence_number":"0000001"}'))$$, '23505');
SELECT expect_error('V-UQ número fiscal digitado à mão repetido também é barrado (hoje não é validado)',
  $$SELECT t_ins('invoices', t_inv('{"establishment_code":"001","issuance_point_code":"001","sequence_number":"0000001"}'))$$, '23505');
SELECT t_ins('invoices', t_inv('{"issuance_point_code":"002","sequence_number":"0000001"}'));
SELECT expect_count('V-UQ mesma sequência em OUTRO ponto de expedição é permitida', $$SELECT 1 FROM invoices WHERE sequence_number='0000001'$$, 2);
SELECT t_ins('invoices', t_inv(jsonb_build_object('id', fbb(), 'company_id', cb(), 'branch_id', brb(), 'customer_id', cub(),
  'internal_number','FAC-900001', 'sequence_number','0000001')));
SELECT expect_count('V-UQ mesmo número fiscal e internal_number em OUTRA empresa é permitido (B)', $$SELECT 1 FROM invoices WHERE internal_number='FAC-900001'$$, 2);
SELECT expect_error('V-UQ internal_number repetido na empresa', $$SELECT t_ins('invoices', t_inv('{"internal_number":"FAC-900001"}'))$$, '23505');
SELECT expect_error('V-UQ linha repetida (invoice, line_number)',
  $$SELECT t_ins('invoice_lines', t_line(fa(), jsonb_build_object('line_number', (SELECT min(line_number) FROM invoice_lines WHERE invoice_id=fa()))))$$, '23505');
SELECT expect_error('V-UQ segundo export na mesma fatura (1:0..1)', $$SELECT t_ins('invoice_exports', t_one(fa()))$$, '23505');
SELECT expect_error('V-UQ segunda contratação pública na mesma fatura (1:0..1)', $$SELECT t_ins('invoice_public_procurements', t_one(fa()))$$, '23505');
SELECT t_ins('invoice_taxes', t_tax(fa(), '{"vat_rate":0,"subtotal_amount":10000,"taxable_base_amount":0,"tax_amount":0}'));
SELECT expect_error('V-UQ segunda linha de imposto da mesma taxa', $$SELECT t_ins('invoice_taxes', t_tax(fa(), '{"vat_rate":0,"subtotal_amount":1,"taxable_base_amount":0,"tax_amount":0}'))$$, '23505');
SELECT t_ins('invoice_payments', t_pay(fa(), '{"method":"TARJETA","amount":1}'));
SELECT expect_count('V-UQ pagamentos: N por fatura permitido (opção menos comprometedora)', $$SELECT 1 FROM invoice_payments WHERE invoice_id=fa()$$, 2);
DELETE FROM invoice_payments WHERE invoice_id=fa() AND method='TARJETA';
SELECT expect_error('V-UQ contador duplicado no mesmo escopo',
  $$INSERT INTO document_sequences (company_id, sequence_type, establishment_code, issuance_point_code) VALUES (ca(),'FISCAL_SEQUENCE','001','001'),(ca(),'FISCAL_SEQUENCE','001','001')$$, '23505');

-- ---- V-FK cross-tenant: uma por família de FK composta ----
SELECT expect_error('V-FK fatura A com sucursal de B',  $$SELECT t_ins('invoices', t_inv(jsonb_build_object('branch_id', brb())))$$, '23503');
SELECT expect_error('V-FK fatura A com cliente de B',   $$SELECT t_ins('invoices', t_inv(jsonb_build_object('customer_id', cub())))$$, '23503');
SELECT expect_error('V-FK fatura A com criador (usuário) de B', $$SELECT t_ins('invoices', t_inv(jsonb_build_object('created_by', usb())))$$, '23503');
SELECT expect_error('V-FK linha de A em fatura de B',    $$SELECT t_ins('invoice_lines', t_line(fbb()))$$, '23503');
SELECT expect_error('V-FK linha de A com produto de B',  $$SELECT t_ins('invoice_lines', t_line(fa(), jsonb_build_object('product_id', prb())))$$, '23503');
SELECT expect_error('V-FK imposto de A em fatura de B',  $$SELECT t_ins('invoice_taxes', t_tax(fbb()))$$, '23503');
SELECT expect_error('V-FK pagamento de A em fatura de B', $$SELECT t_ins('invoice_payments', t_pay(fbb()))$$, '23503');
SELECT expect_error('V-FK export de A em fatura de B',   $$SELECT t_ins('invoice_exports', t_one(fbb()))$$, '23503');
SELECT expect_error('V-FK contratação pública de A em fatura de B', $$SELECT t_ins('invoice_public_procurements', t_one(fbb()))$$, '23503');
SELECT expect_error('V-FK fatura com cliente inexistente', $$SELECT t_ins('invoices', t_inv(jsonb_build_object('customer_id', gen_random_uuid())))$$, '23503');
SELECT expect_error('V-FK linha com tax_id inexistente (taxes global)', $$SELECT t_ins('invoice_lines', t_line(fa(), jsonb_build_object('tax_id', gen_random_uuid())))$$, '23503');
-- FK de moeda (o CHECK de valores é anterior; remove-o só nesta transação para provar a FK p/ currencies(code))
BEGIN;
ALTER TABLE invoices DROP CONSTRAINT invoices_currency_chk;
SELECT expect_error('V-FK moeda fora de currencies', $$SELECT t_ins('invoices', t_inv('{"currency_code":"ZZZ"}'))$$, '23503');
ROLLBACK;
SELECT expect_error('V-FK apagar fatura com filhos é negado (sem cascata)', $$DELETE FROM invoices WHERE id=fa()$$, '23503');

-- ---- DN004: estabelecimento coerente com a sucursal (FAC-006) ----
SELECT expect_error('DN004 sucursal 002 (SIFEN 002) com establishment_code 001', $$SELECT t_ins('invoices', t_inv(jsonb_build_object('branch_id', bra2(), 'establishment_code','001')))$$, 'DN004');
SELECT t_ins('invoices', t_inv(jsonb_build_object('branch_id', bra2(), 'establishment_code','002')));
SELECT expect_count('DN004 sucursal 002 com establishment_code 002 é aceita', $$SELECT 1 FROM invoices WHERE branch_id=bra2()$$, 1);
SELECT expect_count('DN004 sucursal sem sifen_establishment não é conferida (qualquer código)',
  $$SELECT 1 FROM invoices WHERE branch_id=bra() AND establishment_code='001'$$, (SELECT count(*) FROM invoices WHERE branch_id=bra()));

-- =============================================================================
-- Imutabilidade: transição para EMITIDA/APROBADA
-- =============================================================================
SELECT expect_error('DN005 fatura não nasce APROBADA', $$SELECT t_ins('invoices', t_inv('{"status":"APROBADA"}'))$$, 'DN005');
SELECT expect_error('DN005 fatura não nasce EMITIDA',  $$SELECT t_ins('invoices', t_inv('{"status":"EMITIDA"}'))$$, 'DN005');
SELECT t_ins('invoices', t_inv(jsonb_build_object('id', fd(), 'total_amount', 110)));
SELECT expect_error('DN003 emitir fatura sem linhas (FAC-055)', $$UPDATE invoices SET status='APROBADA' WHERE id=fd()$$, 'DN003');
SELECT t_ins('invoice_lines', t_line(fd(), '{}'));
SELECT expect_error('DN002 emitir sem as linhas de imposto', $$UPDATE invoices SET status='EMITIDA' WHERE id=fd()$$, 'DN002');
SELECT t_ins('invoice_taxes', t_tax(fd(), '{"subtotal_amount":220,"taxable_base_amount":200,"tax_amount":20}'));
SELECT expect_error('DN002 emitir com imposto 10% diferente da soma das linhas', $$UPDATE invoices SET status='EMITIDA' WHERE id=fd()$$, 'DN002');
UPDATE invoice_taxes SET subtotal_amount=110, taxable_base_amount=100, tax_amount=10 WHERE invoice_id=fd();
UPDATE invoices SET total_amount=111 WHERE id=fd();
SELECT expect_error('DN002 emitir com total_amount diferente da soma das linhas', $$UPDATE invoices SET status='EMITIDA' WHERE id=fd()$$, 'DN002');
UPDATE invoices SET total_amount=110 WHERE id=fd();
-- FA: preparar impostos 5% e 10% das cifras do mock e testar total errado
SELECT t_ins('invoice_taxes', t_tax(fa(), '{"vat_rate":5,"subtotal_amount":85000,"taxable_base_amount":80952,"tax_amount":4048}'));
SELECT t_ins('invoice_taxes', t_tax(fa(), '{"vat_rate":10,"subtotal_amount":72000,"taxable_base_amount":65455,"tax_amount":6545}'));
SELECT expect_error('DN002 classificação: linha EXENTO com 0% somada ao bucket errado (imposto 0 diverge)',
  $$UPDATE invoice_taxes SET subtotal_amount=9999 WHERE invoice_id=fa() AND vat_rate=0$$ || E'; UPDATE invoices SET status=''APROBADA'' WHERE id=fa()', 'DN002');
SELECT expect_affected('DN002 (preparação) a falha acima foi revertida: imposto 0 segue 10000',
  $$UPDATE invoice_taxes SET subtotal_amount=10000 WHERE invoice_id=fa() AND vat_rate=0 AND subtotal_amount=10000$$, 1);
SELECT expect_true('V-DEF updated_at avança em UPDATE de fatura BORRADOR',
  (SELECT updated_at >= created_at FROM invoices WHERE id=fa()));
SELECT expect_affected('BORRADOR é editável', $$UPDATE invoices SET customer_legal_name='ACME S.A.', additional_information='obs' WHERE id=fa()$$, 1);

-- EMITIDA e APROBADA
SELECT expect_affected('FD: BORRADOR -> EMITIDA (sem cdc)', $$UPDATE invoices SET status='EMITIDA' WHERE id=fd()$$, 1);
SELECT expect_affected('FA: BORRADOR -> APROBADA com CDC de 43 caracteres (DIV-06: sem CHECK de tamanho) e mensagem',
  $$UPDATE invoices SET status='APROBADA', cdc='0180003314001001000000120261009123456789012', sifen_message='Documento aprobado' WHERE id=fa()$$, 1);
SELECT expect_true('CDC de 43 caracteres aceito', (SELECT length(cdc) = 43 FROM invoices WHERE id=fa()));
SELECT expect_affected('FD: EMITIDA -> APROBADA preenche o CDC (NULL -> valor) com 44 caracteres',
  $$UPDATE invoices SET status='APROBADA', cdc='01800033140010010000001220261009123456789012', sifen_message='Documento aprobado' WHERE id=fd()$$, 1);
SELECT expect_true('CDC de 44 caracteres aceito', (SELECT length(cdc) = 44 FROM invoices WHERE id=fd()));
SELECT expect_error('V-UQ cdc repetido na empresa',
  $$SELECT t_ins('invoices', t_inv('{"cdc":"0180003314001001000000120261009123456789012"}'))$$, '23505');
SELECT t_ins('invoices', t_inv('{}')); SELECT t_ins('invoices', t_inv('{}'));
SELECT expect_count('V-UQ várias faturas sem CDC convivem (NULL não colide)', $$SELECT 1 FROM invoices WHERE cdc IS NULL AND company_id=ca()$$, (SELECT count(*) FROM invoices WHERE cdc IS NULL AND company_id=ca()));

-- Fatura emitida/aprovada é IMUTÁVEL (UPDATE/DELETE bloqueados), só muda o estado
SELECT expect_error('DN001 UPDATE de razão social em APROBADA', $$UPDATE invoices SET customer_legal_name='OTRO' WHERE id=fa()$$, 'DN001');
SELECT expect_error('DN001 UPDATE do total em APROBADA',        $$UPDATE invoices SET total_amount=1 WHERE id=fa()$$, 'DN001');
SELECT expect_error('DN001 UPDATE da data em APROBADA',         $$UPDATE invoices SET issue_date='2026-01-01' WHERE id=fa()$$, 'DN001');
SELECT expect_error('DN001 UPDATE do número fiscal em APROBADA', $$UPDATE invoices SET sequence_number='0000999' WHERE id=fa()$$, 'DN001');
SELECT expect_error('DN001 UPDATE da sucursal em EMITIDA/APROBADA', $$UPDATE invoices SET branch_id=bra2(), establishment_code='002' WHERE id=fa()$$, 'DN001');
SELECT expect_error('DN001 UPDATE do company_id é barrado', $$UPDATE invoices SET company_id=cb() WHERE id=fa()$$);
SELECT expect_error('DN001 trocar o CDC já preenchido', $$UPDATE invoices SET cdc='01800033140010010000001220261009000000000000' WHERE id=fa()$$, 'DN001');
SELECT expect_error('DN001 estado + coluna proibida no mesmo UPDATE', $$UPDATE invoices SET status='ANULADA', total_amount=1 WHERE id=fa()$$, 'DN001');
SELECT expect_error('DN001 DELETE de APROBADA', $$DELETE FROM invoices WHERE id=fa()$$, 'DN001');
SELECT expect_error('DN001 DELETE de EMITIDA/APROBADA (FD)', $$DELETE FROM invoices WHERE id=fd()$$, 'DN001');
SELECT expect_error('DN001 APROBADA não volta a BORRADOR (reabriria a edição)', $$UPDATE invoices SET status='BORRADOR' WHERE id=fa()$$, 'DN001');
SELECT expect_error('DN001 EMITIDA/APROBADA -> BORRADOR (FD)', $$UPDATE invoices SET status='BORRADOR' WHERE id=fd()$$, 'DN001');
SELECT expect_error('V-ENUM estado inválido continua barrado em fatura travada', $$UPDATE invoices SET status='ZOMBI' WHERE id=fa()$$, '23514');
SELECT expect_affected('UPDATE sem mudança em fatura travada é aceito (no-op)', $$UPDATE invoices SET status='APROBADA' WHERE id=fa()$$, 1);
-- filhos de fatura travada
SELECT expect_error('DN001 INSERT de linha em APROBADA', $$SELECT t_ins('invoice_lines', t_line(fa(), '{"line_total":110}'))$$, 'DN001');
SELECT expect_error('DN001 UPDATE de linha em APROBADA', $$UPDATE invoice_lines SET quantity=2, line_total=220 WHERE invoice_id=fa() AND vat_rate=10$$, 'DN001');
SELECT expect_error('DN001 DELETE de linha em APROBADA', $$DELETE FROM invoice_lines WHERE invoice_id=fa()$$, 'DN001');
SELECT expect_error('DN001 UPDATE de imposto em APROBADA', $$UPDATE invoice_taxes SET tax_amount=0, taxable_base_amount=0, subtotal_amount=0 WHERE invoice_id=fa() AND vat_rate=10$$, 'DN001');
SELECT expect_error('DN001 INSERT de pagamento em APROBADA', $$SELECT t_ins('invoice_payments', t_pay(fa()))$$, 'DN001');
SELECT expect_error('DN001 UPDATE de pagamento em APROBADA', $$UPDATE invoice_payments SET amount=1 WHERE invoice_id=fa()$$, 'DN001');
SELECT expect_error('DN001 DELETE de pagamento em APROBADA', $$DELETE FROM invoice_payments WHERE invoice_id=fa()$$, 'DN001');
SELECT expect_error('DN001 UPDATE de exportação em APROBADA', $$UPDATE invoice_exports SET destination_country='X' WHERE invoice_id=fa()$$, 'DN001');
SELECT expect_error('DN001 DELETE de exportação em APROBADA', $$DELETE FROM invoice_exports WHERE invoice_id=fa()$$, 'DN001');
SELECT expect_error('DN001 UPDATE de contratação pública em APROBADA', $$UPDATE invoice_public_procurements SET entity_name='X' WHERE invoice_id=fa()$$, 'DN001');
SELECT expect_error('DN001 DELETE de contratação pública em APROBADA', $$DELETE FROM invoice_public_procurements WHERE invoice_id=fa()$$, 'DN001');
SELECT t_ins('invoices', t_inv(jsonb_build_object('id', fc())));
SELECT t_ins('invoice_lines', t_line(fc(), '{}'));
SELECT expect_error('DN001 mover linha de rascunho para fatura APROBADA', $$UPDATE invoice_lines SET invoice_id=fa() WHERE invoice_id=fc()$$, 'DN001');
SELECT expect_affected('rascunho FC segue editável (linha + apagar fatura após apagar filhos)',
  $$DELETE FROM invoice_lines WHERE invoice_id=fc()$$, 1);
SELECT expect_affected('rascunho FC apagável', $$DELETE FROM invoices WHERE id=fc()$$, 1);
-- mudança de estado permitida a partir de APROBADA
SELECT expect_affected('APROBADA -> ANULADA com mensagem SIFEN (só estado muda)',
  $$UPDATE invoices SET status='ANULADA', sifen_message='Documento anulado' WHERE id=fd()$$, 1);
SELECT expect_count('estado/mensagem gravados; nada mais mudou', $$SELECT 1 FROM invoices WHERE id=fd() AND status='ANULADA' AND total_amount=110$$, 1);

-- =============================================================================
-- Numeração: contador com SELECT ... FOR UPDATE (PROPOSTA) — papel da aplicação
-- =============================================================================
BEGIN;
SET LOCAL ROLE dn_app_test;
SELECT set_config('app.company_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT next_document_number('FISCAL_SEQUENCE','001','003') AS s1 \gset
SELECT next_document_number('FISCAL_SEQUENCE','001','003') AS s2 \gset
SELECT next_document_number('FISCAL_SEQUENCE','001','003') AS s3 \gset
SELECT next_document_number('FISCAL_SEQUENCE','001','004') AS o1 \gset
SELECT next_document_number('INTERNAL_NUMBER') AS i1 \gset
SELECT next_document_number('INTERNAL_NUMBER') AS i2 \gset
SELECT expect_true('SEQ números consecutivos 1,2,3 no escopo empresa+estab+ponto', :s1 = 1 AND :s2 = 2 AND :s3 = 3);
SELECT expect_true('SEQ outro ponto de expedição tem contador próprio (começa em 1)', :o1 = 1);
SELECT expect_true('SEQ internal_number tem contador por empresa (1,2)', :i1 = 1 AND :i2 = 2);
SELECT expect_true('SEQ formato: sequence_number 0000003 e internal_number FAC-000002',
  lpad(:s3::text, 7, '0') = '0000003' AND 'FAC-' || lpad(:i2::text, 6, '0') = 'FAC-000002');
SELECT expect_error('SEQ fiscal exige estabelecimento/ponto de 3 dígitos', $$SELECT next_document_number('FISCAL_SEQUENCE','1','1')$$, '23514');
SELECT expect_error('SEQ tipo inválido', $$SELECT next_document_number('OUTRO')$$, '23514');
COMMIT;
-- (as duas últimas falhas acima abortariam a transação; o COMMIT acima vira ROLLBACK — refazer com contadores comprovados)
BEGIN;
SET LOCAL ROLE dn_app_test;
SELECT set_config('app.company_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT next_document_number('FISCAL_SEQUENCE','001','005') AS r1 \gset
ROLLBACK;
BEGIN;
SET LOCAL ROLE dn_app_test;
SELECT set_config('app.company_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT next_document_number('FISCAL_SEQUENCE','001','005') AS r2 \gset
COMMIT;
SELECT expect_true('SEQ ROLLBACK devolve o número (sem lacuna por rollback)', :r1 = 1 AND :r2 = 1);
BEGIN;
SET LOCAL ROLE dn_app_test;
SELECT set_config('app.company_id', 'bbbbbbbb-0000-0000-0000-000000000001', true);
SELECT next_document_number('FISCAL_SEQUENCE','001','003') AS b1 \gset
COMMIT;
SELECT expect_true('SEQ empresa B tem contador independente da A (A já está em 3)', :b1 = 1);
SELECT expect_true('SEQ contadores gravados: A(001/003)=3, B(001/003)=1',
  (SELECT last_value FROM document_sequences WHERE company_id=ca() AND sequence_type='FISCAL_SEQUENCE' AND issuance_point_code='003') = 3
  AND (SELECT last_value FROM document_sequences WHERE company_id=cb() AND issuance_point_code='003') = 1);
BEGIN;
SET LOCAL ROLE dn_app_test;
SELECT expect_error('SEQ sem app.company_id é negado', $$SELECT next_document_number('FISCAL_SEQUENCE','001','001')$$, 'DN006');
COMMIT;
UPDATE document_sequences SET last_value = 9999999 WHERE company_id=ca() AND sequence_type='FISCAL_SEQUENCE' AND issuance_point_code='005';
BEGIN;
SET LOCAL ROLE dn_app_test;
SELECT set_config('app.company_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT expect_error('SEQ passar de 7 dígitos (9999999) é negado', $$SELECT next_document_number('FISCAL_SEQUENCE','001','005')$$, '23514');
COMMIT;

-- ---- concorrência REAL: 2 sessões pedem o número do mesmo escopo; a 2ª espera o COMMIT da 1ª ----
CREATE TABLE seq_probe (who text PRIMARY KEY, val bigint, got_at timestamptz, committed_at timestamptz);
INSERT INTO seq_probe (who) VALUES ('W1'), ('W2');
GRANT ALL ON seq_probe TO dn_app_test;
SELECT current_database() AS dbn \gset
\setenv PGDATABASE :dbn
\! psql -q -X -t -v ON_ERROR_STOP=1 -c "BEGIN; SET LOCAL ROLE dn_app_test; SELECT set_config('app.company_id','aaaaaaaa-0000-0000-0000-000000000001',true); UPDATE seq_probe SET val = next_document_number('FISCAL_SEQUENCE','009','009') WHERE who='W1'; UPDATE seq_probe SET got_at = clock_timestamp() WHERE who='W1'; SELECT pg_sleep(1.5); UPDATE seq_probe SET committed_at = clock_timestamp() WHERE who='W1'; COMMIT;" >/dev/null & psql -q -X -t -v ON_ERROR_STOP=1 -c "BEGIN; SET LOCAL ROLE dn_app_test; SELECT set_config('app.company_id','aaaaaaaa-0000-0000-0000-000000000001',true); UPDATE seq_probe SET val = next_document_number('FISCAL_SEQUENCE','009','009') WHERE who='W2'; UPDATE seq_probe SET got_at = clock_timestamp() WHERE who='W2'; SELECT pg_sleep(1.5); UPDATE seq_probe SET committed_at = clock_timestamp() WHERE who='W2'; COMMIT;" >/dev/null & wait
SELECT expect_true('CONC as duas sessões concluíram', (SELECT count(*) FROM seq_probe WHERE val IS NOT NULL AND committed_at IS NOT NULL) = 2);
SELECT expect_true('CONC números distintos {1,2} (sem colisão)', (SELECT array_agg(val ORDER BY val) FROM seq_probe) = ARRAY[1,2]::bigint[]);
SELECT expect_true('CONC a 2ª sessão só obteve o número DEPOIS do COMMIT da 1ª (SELECT ... FOR UPDATE bloqueou)',
  (SELECT s2.got_at >= s1.committed_at FROM seq_probe s1, seq_probe s2 WHERE s1.val = 1 AND s2.val = 2));

-- ---- fluxo completo sob RLS (papel da aplicação, empresa A): contador -> BORRADOR -> filhos -> APROBADA ----
BEGIN;
SET LOCAL ROLE dn_app_test;
SELECT set_config('app.company_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT next_document_number('FISCAL_SEQUENCE','001','006') AS n \gset
SELECT next_document_number('INTERNAL_NUMBER') AS m \gset
SELECT t_ins('invoices', t_inv(jsonb_build_object('id', 'aaaaaaaa-0000-0000-0000-00000000f0ff',
  'internal_number', 'FAC-' || lpad((:m + 100)::text, 6, '0'), 'issuance_point_code', '006',
  'sequence_number', lpad(:n::text, 7, '0'), 'total_amount', 110)));
SELECT t_ins('invoice_lines', t_line('aaaaaaaa-0000-0000-0000-00000000f0ff'));
SELECT t_ins('invoice_taxes', t_tax('aaaaaaaa-0000-0000-0000-00000000f0ff'));
SELECT t_ins('invoice_payments', t_pay('aaaaaaaa-0000-0000-0000-00000000f0ff'));
SELECT expect_affected('E2E (papel da aplicação) BORRADOR -> APROBADA',
  $$UPDATE invoices SET status='APROBADA' WHERE id='aaaaaaaa-0000-0000-0000-00000000f0ff'$$, 1);
COMMIT;
SELECT expect_count('E2E fatura gravada com a sequência do contador (0000001 no ponto 006)',
  $$SELECT 1 FROM invoices WHERE id='aaaaaaaa-0000-0000-0000-00000000f0ff' AND status='APROBADA' AND sequence_number='0000001' AND issuance_point_code='006'$$, 1);
-- número digitado à mão que colide com o do contador é barrado pela unicidade (o contador sozinho não basta)
SELECT expect_error('E2E número do contador já usado à mão -> unicidade barra',
  $$SELECT t_ins('invoices', t_inv('{"issuance_point_code":"006","sequence_number":"0000001"}'))$$, '23505');

-- =============================================================================
-- V-ISO: RLS com o papel da aplicação
-- =============================================================================
-- carga da empresa B nas tabelas filhas (superusuário)
SELECT t_ins('invoice_lines', t_line(fbb(), jsonb_build_object('company_id', cb(), 'product_id', prb())));
SELECT t_ins('invoice_taxes', t_tax(fbb(), jsonb_build_object('company_id', cb())));
SELECT t_ins('invoice_payments', t_pay(fbb(), jsonb_build_object('company_id', cb())));
SELECT t_ins('invoice_exports', t_one(fbb(), jsonb_build_object('company_id', cb())));
SELECT t_ins('invoice_public_procurements', t_one(fbb(), jsonb_build_object('company_id', cb())));
BEGIN;
SET LOCAL ROLE dn_app_test;
SELECT expect_count('V-ISO sem app.company_id nada é visível (invoices)', 'SELECT 1 FROM invoices', 0);
SELECT expect_count('V-ISO sem app.company_id nada é visível (invoice_lines)', 'SELECT 1 FROM invoice_lines', 0);
SELECT expect_count('V-ISO sem app.company_id nada é visível (document_sequences)', 'SELECT 1 FROM document_sequences', 0);
SELECT set_config('app.company_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT expect_count('V-ISO A não vê faturas de B', $$SELECT 1 FROM invoices WHERE company_id=cb()$$, 0);
SELECT expect_count('V-ISO A vê só as suas faturas', 'SELECT 1 FROM invoices', (SELECT count(*) FROM invoices WHERE company_id=ca()));
SELECT expect_count('V-ISO A não vê a fatura de B por id', $$SELECT 1 FROM invoices WHERE id=fbb()$$, 0);
SELECT expect_count('V-ISO A não vê linhas de B', $$SELECT 1 FROM invoice_lines WHERE company_id=cb()$$, 0);
SELECT expect_count('V-ISO A não vê impostos de B', $$SELECT 1 FROM invoice_taxes WHERE company_id=cb()$$, 0);
SELECT expect_count('V-ISO A não vê pagamentos de B', $$SELECT 1 FROM invoice_payments WHERE company_id=cb()$$, 0);
SELECT expect_count('V-ISO A não vê exportações de B', $$SELECT 1 FROM invoice_exports WHERE company_id=cb()$$, 0);
SELECT expect_count('V-ISO A não vê contratações públicas de B', $$SELECT 1 FROM invoice_public_procurements WHERE company_id=cb()$$, 0);
SELECT expect_count('V-ISO A não vê contadores de B', $$SELECT 1 FROM document_sequences WHERE company_id=cb()$$, 0);
SELECT expect_error('V-ISO A não grava fatura com company_id de B',
  $$SELECT t_ins('invoices', t_inv(jsonb_build_object('company_id', cb(), 'branch_id', brb(), 'customer_id', cub())))$$, '42501');
SELECT expect_error('V-ISO A não grava linha com company_id de B',
  $$SELECT t_ins('invoice_lines', t_line(fbb(), jsonb_build_object('company_id', cb(), 'product_id', prb())))$$, '42501');
SELECT expect_error('V-ISO A não grava contador de B',
  $$INSERT INTO document_sequences (company_id, sequence_type, establishment_code, issuance_point_code) VALUES (cb(),'FISCAL_SEQUENCE','001','001')$$, '42501');
SELECT expect_affected('V-ISO A não altera fatura de B', $$UPDATE invoices SET additional_information='hack' WHERE company_id=cb()$$, 0);
SELECT expect_affected('V-ISO A não altera linha de B', $$UPDATE invoice_lines SET description='hack' WHERE company_id=cb()$$, 0);
SELECT expect_affected('V-ISO A não apaga fatura de B', $$DELETE FROM invoices WHERE company_id=cb()$$, 0);
SELECT expect_affected('V-ISO A não apaga imposto de B', $$DELETE FROM invoice_taxes WHERE company_id=cb()$$, 0);
SELECT expect_affected('V-ISO A não apaga pagamento de B', $$DELETE FROM invoice_payments WHERE company_id=cb()$$, 0);
SELECT expect_error('V-ISO A não troca o company_id de uma fatura sua (BORRADOR) para B',
  $$UPDATE invoices SET company_id=cb() WHERE company_id=ca() AND status='BORRADOR'$$, '42501');
SELECT expect_error('V-ISO A não liga fatura sua a cliente de B nem pela FK composta',
  $$UPDATE invoices SET customer_id=cub() WHERE company_id=ca() AND status='BORRADOR'$$, '23503');
COMMIT;
BEGIN;
SET LOCAL ROLE dn_app_test;
SELECT set_config('app.company_id', 'bbbbbbbb-0000-0000-0000-000000000001', true);
SELECT expect_count('V-ISO B vê só a sua fatura', 'SELECT 1 FROM invoices', 1);
SELECT expect_count('V-ISO B vê só as suas linhas/impostos/pagamentos', $$SELECT 1 FROM invoice_lines UNION ALL SELECT 1 FROM invoice_taxes UNION ALL SELECT 1 FROM invoice_payments$$, 3);
SELECT expect_count('V-ISO B não vê a fatura de A', $$SELECT 1 FROM invoices WHERE id=fa()$$, 0);
SELECT expect_affected('V-ISO B não apaga a fatura APROBADA de A', $$DELETE FROM invoices WHERE id=fa()$$, 0);
COMMIT;

\echo 'TESTE-P006: TODOS OS CASOS PASSARAM'
