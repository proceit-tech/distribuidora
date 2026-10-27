-- TESTE-P007-custeio.sql — executar em banco DESCARTÁVEL, a partir de documentacao/banco/validacoes/,
-- após P001→P007 (up). Usa o script executar-propostas.sh ou os comandos de REPRODUCAO-TESTES.md.
-- Casos: fórmula do custo médio ponderado móvel, custo congelado, transferência (conservação de valor),
-- arredondamento e resíduo, saldo zero, bloqueios, atomicidade, mercadoria de terceiros, reconciliação,
-- vínculo venda→saída, bases dos relatórios (subtotais/total geral), RLS e concorrência real (dblink).
-- Valores calculados à mão em documentacao/banco/levantamento/CUSTEIO-V1.md §6 (mesmos números).
-- Falha = exceção (psql -v ON_ERROR_STOP=1). Requer superusuário do banco descartável e a extensão dblink (contrib).
\set ON_ERROR_STOP 1
\i _helpers-teste.sql

CREATE OR REPLACE FUNCTION expect_true(test_name text, cond boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'TESTE FALHOU [%]: condição falsa', test_name; END IF;
  RAISE NOTICE 'OK   [%]', test_name;
END $$;

-- ---------------------------------------------------------------------------
-- carga mínima (superusuário; contorna RLS)
-- ---------------------------------------------------------------------------
INSERT INTO geo_countries (code, name) VALUES ('PRY','Paraguay');
INSERT INTO currencies (code, name, minor_units) VALUES ('PYG','Guaraní',0),('USD','Dólar',2);
INSERT INTO units_of_measure (id, code, name) VALUES ('00000000-0000-0000-0000-0000000000c9','UN','Unidad');
INSERT INTO companies (id, code, legal_name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','empresa_a','Empresa A S.A.'),
  ('bbbbbbbb-0000-0000-0000-000000000001','empresa_b','Empresa B S.A.');
INSERT INTO branches (id, company_id, code, name) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000b1','aaaaaaaa-0000-0000-0000-000000000001','001','Casa Matriz A'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1','bbbbbbbb-0000-0000-0000-000000000001','001','Casa Matriz B');
INSERT INTO warehouses (id, company_id, branch_id, code, name) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000b1','D1','Depósito A1'),
  ('aaaaaaaa-0000-0000-0000-0000000000d2','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000b1','D2','Depósito A2'),
  ('bbbbbbbb-0000-0000-0000-0000000000d1','bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-0000000000b1','D1','Depósito B1');
INSERT INTO users (id, company_id, username, first_name, password_hash) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000a1','aaaaaaaa-0000-0000-0000-000000000001','admin','Ana','x'),
  ('bbbbbbbb-0000-0000-0000-0000000000a1','bbbbbbbb-0000-0000-0000-000000000001','admin','Beto','x');
INSERT INTO products (id, company_id, code, description, invoice_description, unit_of_measure_id) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000e1','aaaaaaaa-0000-0000-0000-000000000001','PA1','Producto A1','Producto A1','00000000-0000-0000-0000-0000000000c9'),
  ('aaaaaaaa-0000-0000-0000-0000000000e2','aaaaaaaa-0000-0000-0000-000000000001','PA2','Producto A2','Producto A2','00000000-0000-0000-0000-0000000000c9'),
  ('aaaaaaaa-0000-0000-0000-0000000000e3','aaaaaaaa-0000-0000-0000-000000000001','PA3','Producto A3','Producto A3','00000000-0000-0000-0000-0000000000c9'),
  ('bbbbbbbb-0000-0000-0000-0000000000e1','bbbbbbbb-0000-0000-0000-000000000001','PB1','Producto B1','Producto B1','00000000-0000-0000-0000-0000000000c9');
INSERT INTO customers (id, company_id, recipient_nature_code, operation_type_code, person_type, taxpayer_type_code, country_code, document_type, tax_id, tax_id_check_digit, legal_name) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000c1','aaaaaaaa-0000-0000-0000-000000000001',1,1,'JURIDICA',2,'PRY','RUC','80012345','7','Cliente A');

-- atalhos
CREATE FUNCTION ca() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT 'aaaaaaaa-0000-0000-0000-000000000001'::uuid $$;
CREATE FUNCTION cb() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT 'bbbbbbbb-0000-0000-0000-000000000001'::uuid $$;
CREATE FUNCTION d1() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT 'aaaaaaaa-0000-0000-0000-0000000000d1'::uuid $$;
CREATE FUNCTION d2() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT 'aaaaaaaa-0000-0000-0000-0000000000d2'::uuid $$;
CREATE FUNCTION pa1() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT 'aaaaaaaa-0000-0000-0000-0000000000e1'::uuid $$;
CREATE FUNCTION pa2() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT 'aaaaaaaa-0000-0000-0000-0000000000e2'::uuid $$;
CREATE FUNCTION pa3() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT 'aaaaaaaa-0000-0000-0000-0000000000e3'::uuid $$;
CREATE SEQUENCE t_mov;
-- cria o cabeçalho do movimento (empresa A) e devolve o id
CREATE FUNCTION mv(p_type text, p_source text, p_src uuid, p_dst uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE i uuid := gen_random_uuid(); n int := nextval('t_mov');
BEGIN
  INSERT INTO inventory_movements (id, company_id, movement_number, movement_type, source_type, movement_date, movement_time,
                                   source_warehouse_id, destination_warehouse_id, created_by)
  VALUES (i, ca(), 'MOV-' || lpad(n::text, 6, '0'), p_type, p_source, '2026-10-09', '10:00', p_src, p_dst,
          'aaaaaaaa-0000-0000-0000-0000000000a1');
  RETURN i;
END $$;
-- estado do custo (qtd|valor|médio) de produto/depósito
CREATE FUNCTION ic(p uuid, w uuid) RETURNS text LANGUAGE sql AS $$
  SELECT valued_quantity::text || '|' || total_value::text || '|' || average_cost::text
    FROM inventory_costs WHERE company_id = ca() AND product_id = p AND warehouse_id = w $$;
CREATE FUNCTION bal(p uuid, w uuid) RETURNS numeric LANGUAGE sql AS $$
  SELECT COALESCE(sum(quantity), 0) FROM stock_balances
   WHERE company_id = ca() AND product_id = p AND warehouse_id = w AND ownership = 'PROPIO' $$;
CREATE FUNCTION lcost(l uuid) RETURNS text LANGUAGE sql AS $$
  SELECT unit_cost::text || '|' || total_cost::text || '|' || cost_currency_code FROM inventory_movement_lines WHERE id = l $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dn_app_test;

-- ---- fórmula pura (DEC-003-02): (10×100 + 10×130)/20 = 115 ----
SELECT expect_true('FORMULA custo médio = (qtd1×c1 + qtd2×c2)/(qtd1+qtd2)', weighted_average_cost(10, 1000, 10, 1300) = 115.0000);
SELECT expect_true('FORMULA denominador zero devolve 0', weighted_average_cost(0, 0, 0, 0) = 0);

-- ---------------------------------------------------------------------------
-- Cenário 1 (PA1 em D1) — CUSTEIO-V1.md §6.1
-- ---------------------------------------------------------------------------
SELECT inventory_post_line(ca(), mv('ENTRADA','COMPRA',NULL,d1()), pa1(), 10, 100) AS l1 \gset
SELECT expect_true('E1 ENTRADA 10@100: qtd 10, valor 1000, médio 100', ic(pa1(), d1()) = '10.0000|1000.0000|100.0000');
SELECT expect_true('E1 linha grava custo 100|1000|PYG', lcost(:'l1') = '100.0000|1000.0000|PYG');
SELECT expect_true('E1 saldo físico 10', bal(pa1(), d1()) = 10);
SELECT inventory_post_line(ca(), mv('ENTRADA','COMPRA',NULL,d1()), pa1(), 10, 130);
SELECT expect_true('E2 ENTRADA 10@130: qtd 20, valor 2300, médio 115', ic(pa1(), d1()) = '20.0000|2300.0000|115.0000');
SELECT inventory_post_line(ca(), mv('SALIDA','VENTA',d1(),NULL), pa1(), 5) AS s1 \gset
SELECT expect_true('S1 SALIDA 5: custo congelado 115 / total 575', lcost(:'s1') = '115.0000|575.0000|PYG');
SELECT expect_true('S1 sobra qtd 15, valor 1725, médio 115', ic(pa1(), d1()) = '15.0000|1725.0000|115.0000');
SELECT inventory_post_line(ca(), mv('ENTRADA','COMPRA',NULL,d1()), pa1(), 5, 200);
SELECT expect_true('E3 ENTRADA 5@200: qtd 20, valor 2725, médio 136.25', ic(pa1(), d1()) = '20.0000|2725.0000|136.2500');
SELECT inventory_post_line(ca(), mv('SALIDA','VENTA',d1(),NULL), pa1(), 5) AS s2 \gset
SELECT expect_true('S2 SALIDA 5: 136.25 / 681.25', lcost(:'s2') = '136.2500|681.2500|PYG');
SELECT expect_true('S2 sobra qtd 15, valor 2043.75', ic(pa1(), d1()) = '15.0000|2043.7500|136.2500');
SELECT expect_true('HIST custo da 1ª saída NÃO mudou com as entradas posteriores', lcost(:'s1') = '115.0000|575.0000|PYG');
SELECT expect_error('HIST linha de movimento é imutável (UPDATE do custo)',
  format($$UPDATE inventory_movement_lines SET total_cost = 1 WHERE id = %L$$, :'s1'), 'P0001');
SELECT expect_error('HIST linha de movimento é imutável (DELETE)',
  format($$DELETE FROM inventory_movement_lines WHERE id = %L$$, :'s1'), 'P0001');

-- Transferência D1→D2 de 6: sai ao médio de D1 (2043.75×6/15 = 817.5) e entra no mesmo valor em D2
SELECT inventory_post_line(ca(), mv('TRANSFERENCIA','TRANSFERENCIA',d1(),d2()), pa1(), 6) AS t1 \gset
SELECT expect_true('T1 TRANSFERENCIA 6: custo 136.25 / 817.5', lcost(:'t1') = '136.2500|817.5000|PYG');
SELECT expect_true('T1 origem D1: qtd 9, valor 1226.25', ic(pa1(), d1()) = '9.0000|1226.2500|136.2500');
SELECT expect_true('T1 destino D2: qtd 6, valor 817.5, médio 136.25', ic(pa1(), d2()) = '6.0000|817.5000|136.2500');
SELECT expect_true('T1 valor conservado (1226.25 + 817.5 = 2043.75)',
  (SELECT sum(total_value) FROM inventory_costs WHERE product_id = pa1()) = 2043.75);
SELECT expect_true('T1 saldos físicos D1=9, D2=6', bal(pa1(), d1()) = 9 AND bal(pa1(), d2()) = 6);

-- Bloqueios e atomicidade: o estado não muda quando a operação falha
SELECT count(*) AS lines_before FROM inventory_movement_lines \gset
SELECT expect_error('BLOQ SALIDA 100 sem saldo suficiente',
  $$SELECT inventory_post_line(ca(), mv('SALIDA','VENTA',d1(),NULL), pa1(), 100)$$, 'P0001');
SELECT expect_true('ATOM após falha: custo, saldo e nº de linhas intactos',
  ic(pa1(), d1()) = '9.0000|1226.2500|136.2500' AND bal(pa1(), d1()) = 9
  AND (SELECT count(*) FROM inventory_movement_lines) = :lines_before);
SELECT expect_error('BLOQ ENTRADA sem custo não é valorizada nem aceita',
  $$SELECT inventory_post_line(ca(), mv('ENTRADA','COMPRA',NULL,d1()), pa1(), 1)$$, 'P0001');
SELECT expect_error('BLOQ ENTRADA com custo negativo',
  $$SELECT inventory_post_line(ca(), mv('ENTRADA','COMPRA',NULL,d1()), pa1(), 1, -5)$$, 'P0001');
SELECT expect_error('BLOQ quantidade zero', $$SELECT inventory_post_line(ca(), mv('SALIDA','VENTA',d1(),NULL), pa1(), 0)$$, 'P0001');
SELECT expect_error('BLOQ tipo que não altera valor (RESERVA)',
  $$SELECT inventory_post_line(ca(), mv('RESERVA','MANUAL',d1(),NULL), pa1(), 1)$$, 'P0001');
SELECT expect_error('ISO movimento de A usado com a empresa B',
  format($$SELECT inventory_post_line(cb(), %L, 'bbbbbbbb-0000-0000-0000-0000000000e1', 1, 10)$$, mv('ENTRADA','COMPRA',NULL,d1())), 'P0001');
SELECT mv('ENTRADA','COMPRA',NULL,d1()) AS mv_void \gset
UPDATE inventory_movements SET status = 'ANULADO' WHERE id = :'mv_void';
SELECT expect_error('BLOQ movimento ANULADO não recebe linha',
  format($$SELECT inventory_post_line(ca(), %L, %L, 1, 10)$$, :'mv_void', pa1()), 'P0001');

-- Mercadoria de terceiros: movimenta saldo, não entra no valor (D-C7)
SELECT inventory_post_line(ca(), mv('ENTRADA','COMPRA',NULL,d1()), pa1(), 10, NULL, NULL, 'TERCERO', NULL) AS tc \gset
SELECT expect_true('TERC linha sem custo', (SELECT unit_cost IS NULL AND total_cost IS NULL AND cost_currency_code IS NULL FROM inventory_movement_lines WHERE id = :'tc'));
SELECT expect_true('TERC valor do estoque inalterado', ic(pa1(), d1()) = '9.0000|1226.2500|136.2500');
SELECT expect_true('TERC saldo de terceiros existe (10) e o próprio segue 9',
  (SELECT quantity FROM stock_balances WHERE company_id = ca() AND product_id = pa1() AND warehouse_id = d1() AND ownership = 'TERCERO') = 10 AND bal(pa1(), d1()) = 9);

-- ---------------------------------------------------------------------------
-- Cenário 2 (PA2 em D1) — arredondamento e resíduo — CUSTEIO-V1.md §6.2
-- ---------------------------------------------------------------------------
SELECT inventory_post_line(ca(), mv('ENTRADA','COMPRA',NULL,d1()), pa2(), 1, 4);
SELECT inventory_post_line(ca(), mv('ENTRADA','COMPRA',NULL,d1()), pa2(), 2, 3);
SELECT expect_true('R0 PA2: qtd 3, valor 10, médio 3.3333', ic(pa2(), d1()) = '3.0000|10.0000|3.3333');
SELECT inventory_post_line(ca(), mv('SALIDA','VENTA',d1(),NULL), pa2(), 1) AS r1 \gset
SELECT inventory_post_line(ca(), mv('SALIDA','VENTA',d1(),NULL), pa2(), 1) AS r2 \gset
SELECT inventory_post_line(ca(), mv('SALIDA','VENTA',d1(),NULL), pa2(), 1) AS r3 \gset
SELECT expect_true('R1 saída 1: 10/3 = 3.3333', lcost(:'r1') = '3.3333|3.3333|PYG');
SELECT expect_true('R2 saída 2: 6.6667/2 = 3.3334 (meio arredonda para cima)', lcost(:'r2') = '3.3334|3.3334|PYG');
SELECT expect_true('R3 última unidade leva o resíduo: 3.3333', lcost(:'r3') = '3.3333|3.3333|PYG');
SELECT expect_true('R4 soma dos custos das saídas = valor que entrou (10.0000)',
  (SELECT sum(total_cost) FROM inventory_movement_lines WHERE id IN (:'r1', :'r2', :'r3')) = 10.0000);
SELECT expect_true('R5 saldo zero: qtd 0, valor 0 (guarda o último médio só como referência)', ic(pa2(), d1()) = '0.0000|0.0000|3.3333');
SELECT inventory_post_line(ca(), mv('ENTRADA','COMPRA',NULL,d1()), pa2(), 2, 5);
SELECT expect_true('R6 nova entrada após saldo zero recomeça: médio 5 (sem memória do antigo)', ic(pa2(), d1()) = '2.0000|10.0000|5.0000');

-- ---------------------------------------------------------------------------
-- Reconciliação saldo × valor
-- ---------------------------------------------------------------------------
SELECT expect_count('REC saldo e valor reconciliados após todas as operações', $$SELECT 1 FROM inventory_cost_reconciliation_v$$, 0);
INSERT INTO stock_balances (company_id, product_id, warehouse_id, stock_state, quantity)
  VALUES (ca(), pa3(), d1(), 'DISPONIBLE', 3);   -- gravação fora de inventory_post_line (simula erro de aplicação)
INSERT INTO inventory_costs (company_id, product_id, warehouse_id, valued_quantity, total_value, average_cost)
  VALUES (ca(), pa3(), d1(), 2, 20, 10);
SELECT expect_count('REC divergência (3 no saldo × 2 valorizadas) é detectada', $$SELECT 1 FROM inventory_cost_reconciliation_v$$, 1);
DELETE FROM inventory_costs WHERE product_id = pa3();
DELETE FROM stock_balances WHERE product_id = pa3();
SELECT expect_count('REC volta a zero depois da limpeza', $$SELECT 1 FROM inventory_cost_reconciliation_v$$, 0);

-- ---------------------------------------------------------------------------
-- Vínculo venda → saída e bases dos relatórios
-- ---------------------------------------------------------------------------
-- venda de 2 unidades de PA1 em D1: custo = 1226.25 × 2 / 9 = 272.5 ; sobra 7 / 953.75
SELECT inventory_post_line(ca(), mv('SALIDA','VENTA',d1(),NULL), pa1(), 2) AS sv \gset
SELECT expect_true('V0 saída da venda: 136.25 / 272.5', lcost(:'sv') = '136.2500|272.5000|PYG');
INSERT INTO invoices (id, company_id, branch_id, customer_id, internal_number, sequence_number, establishment_description,
                      issuance_point_description, issue_date, customer_code, total_amount, currency_code)
VALUES ('aaaaaaaa-0000-0000-0000-00000000f001', ca(), 'aaaaaaaa-0000-0000-0000-0000000000b1', 'aaaaaaaa-0000-0000-0000-0000000000c1',
        'FAC-700001', '0000701', 'Casa Central', 'Casa Central', '2026-10-09', 'CLI-000001', 0, 'PYG'),
       ('aaaaaaaa-0000-0000-0000-00000000f002', ca(), 'aaaaaaaa-0000-0000-0000-0000000000b1', 'aaaaaaaa-0000-0000-0000-0000000000c1',
        'FAC-700002', '0000702', 'Casa Central', 'Casa Central', '2026-10-09', 'CLI-000001', 0, 'PYG');
INSERT INTO invoice_lines (company_id, invoice_id, line_number, product_id, product_code, description, vat_treatment, vat_rate,
                           quantity, unit_price, line_total, inventory_movement_line_id) VALUES
  (ca(), 'aaaaaaaa-0000-0000-0000-00000000f001', 1, pa1(), 'PA1', 'Item com custo',  'GRAVADO', 10, 2, 300, 600, :'sv'),
  (ca(), 'aaaaaaaa-0000-0000-0000-00000000f001', 2, pa2(), 'PA2', 'Item sem custo',  'GRAVADO', 10, 1, 110, 110, NULL),
  (ca(), 'aaaaaaaa-0000-0000-0000-00000000f002', 1, pa2(), 'PA2', 'Fatura BORRADOR', 'GRAVADO', 10, 1, 110, 110, NULL);
-- só a F001 vira EMITIDA (a F002 fica BORRADOR e não pode aparecer no relatório); a trava de totais de P006 não é objeto deste teste
ALTER TABLE invoices DISABLE TRIGGER invoices_guard_trg;
UPDATE invoices SET status = 'EMITIDA' WHERE id = 'aaaaaaaa-0000-0000-0000-00000000f001';
ALTER TABLE invoices ENABLE TRIGGER invoices_guard_trg;
SELECT expect_count('REL vendas: só faturas EMITIDA/APROBADA (2 linhas da F001; a BORRADOR fica de fora)', $$SELECT 1 FROM sales_at_cost_v$$, 2);
SELECT expect_count('REL linha com custo congelado: 136.25 / 272.5 e status CON_COSTO',
  $$SELECT 1 FROM sales_at_cost_v WHERE product_code='PA1' AND cost_status='CON_COSTO' AND unit_cost=136.25 AND total_cost=272.5 AND sale_line_total=600$$, 1);
SELECT expect_count('REL linha sem vínculo: SIN_COSTO e custo NULL (nada é inventado)',
  $$SELECT 1 FROM sales_at_cost_v WHERE product_code='PA2' AND cost_status='SIN_COSTO' AND total_cost IS NULL AND unit_cost IS NULL$$, 1);
INSERT INTO inventory_movements (id, company_id, movement_number, movement_type, source_type, movement_date, movement_time, destination_warehouse_id, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-00000000aa01', cb(), 'MOV-900001', 'ENTRADA', 'COMPRA', '2026-10-09', '10:00', 'bbbbbbbb-0000-0000-0000-0000000000d1', 'bbbbbbbb-0000-0000-0000-0000000000a1');
SELECT inventory_post_line(cb(), 'bbbbbbbb-0000-0000-0000-00000000aa01', 'bbbbbbbb-0000-0000-0000-0000000000e1', 1, 50) AS lb \gset
SELECT expect_error('FK vínculo da venda (empresa A) com linha de movimento da empresa B',
  format($$INSERT INTO invoice_lines (company_id, invoice_id, line_number, product_id, product_code, description, vat_treatment, vat_rate, quantity, unit_price, line_total, inventory_movement_line_id)
           VALUES (ca(), 'aaaaaaaa-0000-0000-0000-00000000f002', 3, pa1(), 'PA1', 'x', 'GRAVADO', 10, 1, 1, 1, %L)$$, :'lb'), '23503');
SELECT expect_error('UQ uma linha de saída não pode custear duas linhas de fatura',
  format($$INSERT INTO invoice_lines (company_id, invoice_id, line_number, product_id, product_code, description, vat_treatment, vat_rate, quantity, unit_price, line_total, inventory_movement_line_id)
           VALUES (ca(), 'aaaaaaaa-0000-0000-0000-00000000f002', 2, pa1(), 'PA1', 'x', 'GRAVADO', 10, 1, 1, 1, %L)$$, :'sv'), '23505');

-- Estoque valorizado: linhas, subtotal por depósito e total geral (GROUPING SETS), moeda base
SELECT expect_true('VAL valor de PA1 em D1 = 953.75 (7 un.) e em D2 = 817.5 (6 un.)',
  ic(pa1(), d1()) = '7.0000|953.7500|136.2500' AND ic(pa1(), d2()) = '6.0000|817.5000|136.2500');
CREATE TEMP TABLE val_rollup AS
SELECT warehouse_code, currency_code, sum(valued_quantity) AS qty, sum(total_value) AS value, GROUPING(warehouse_code) AS g_wh
  FROM inventory_valuation_v WHERE company_id = ca() GROUP BY GROUPING SETS ((warehouse_code, currency_code), (currency_code));
SELECT expect_true('VAL subtotal D1 = 963.75 (PA1 953.75 + PA2 10)',
  (SELECT value FROM val_rollup WHERE warehouse_code = 'D1') = 963.7500);
SELECT expect_true('VAL subtotal D2 = 817.5', (SELECT value FROM val_rollup WHERE warehouse_code = 'D2') = 817.5000);
SELECT expect_true('VAL total geral = 1781.25 = soma dos subtotais = soma de inventory_costs',
  (SELECT value FROM val_rollup WHERE g_wh = 1) = 1781.2500
  AND (SELECT sum(value) FROM val_rollup WHERE g_wh = 0) = 1781.2500
  AND (SELECT sum(total_value) FROM inventory_costs WHERE company_id = ca()) = 1781.2500);
SELECT expect_count('VAL produto com saldo zero não aparece no relatório', $$SELECT 1 FROM inventory_valuation_v WHERE product_code = 'PA3'$$, 0);

-- ---------------------------------------------------------------------------
-- RLS (papel da aplicação, sem BYPASSRLS)
-- ---------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE dn_app_test;
SELECT set_config('app.company_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT expect_count('ISO A não enxerga o custo de B', $$SELECT 1 FROM inventory_costs WHERE company_id = cb()$$, 0);
SELECT expect_count('ISO A não enxerga o estoque valorizado de B (view security_invoker)', $$SELECT 1 FROM inventory_valuation_v WHERE company_id = cb()$$, 0);
SELECT expect_count('ISO A enxerga o seu (3 linhas valorizadas)', $$SELECT 1 FROM inventory_valuation_v$$, 3);
SELECT expect_error('ISO A não grava custo para B',
  $$INSERT INTO inventory_costs (company_id, product_id, warehouse_id) VALUES (cb(), 'bbbbbbbb-0000-0000-0000-0000000000e1', 'bbbbbbbb-0000-0000-0000-0000000000d1')$$, '42501');
SELECT expect_affected('ISO A não altera custo de B', $$UPDATE inventory_costs SET total_value = 0 WHERE company_id = cb()$$, 0);
SELECT expect_error('ISO A não usa inventory_post_line com a empresa B',
  $$SELECT inventory_post_line(cb(), gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-0000000000e1', 1, 10)$$, 'P0001');
COMMIT;

-- ---------------------------------------------------------------------------
-- Concorrência real: duas saídas de 6 sobre saldo 10 -> uma passa, a outra é recusada (dblink)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS dblink;
SELECT inventory_post_line(ca(), mv('ENTRADA','COMPRA',NULL,d1()), pa3(), 10, 100);
SELECT mv('SALIDA','VENTA',d1(),NULL) AS mc1 \gset
SELECT mv('SALIDA','VENTA',d1(),NULL) AS mc2 \gset
SELECT dblink_connect('c1', format('dbname=%s port=%s host=%s application_name=dn_p007_c1', current_database(), current_setting('port'), split_part(current_setting('unix_socket_directories'), ',', 1)));
SELECT dblink_connect('c2', format('dbname=%s port=%s host=%s application_name=dn_p007_c2', current_database(), current_setting('port'), split_part(current_setting('unix_socket_directories'), ',', 1)));
SELECT dblink_exec('c1', 'BEGIN');
SELECT * FROM dblink('c1', format($$SELECT inventory_post_line(%L, %L, %L, 6)$$, ca(), :'mc1', pa3())) AS t(l uuid);   -- C1 segura o lock até o COMMIT
SELECT dblink_send_query('c2', format($$SELECT inventory_post_line(%L, %L, %L, 6)$$, ca(), :'mc2', pa3())) AS c2_enviou;
DO $$
DECLARE i int := 0;
BEGIN
  LOOP
    EXIT WHEN EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name = 'dn_p007_c2' AND wait_event_type = 'Lock');
    i := i + 1;
    IF i > 100 THEN RAISE EXCEPTION 'TESTE FALHOU [CONC]: C2 não ficou bloqueada esperando C1'; END IF;
    PERFORM pg_sleep(0.05);
  END LOOP;
  RAISE NOTICE 'OK   [CONC C2 ficou BLOQUEADA aguardando C1]';
END $$;
SELECT dblink_exec('c1', 'COMMIT');
SELECT expect_error('CONC a segunda saída de 6 sobre saldo restante 4 é recusada',
  $$SELECT * FROM dblink_get_result('c2') AS t(l uuid)$$, 'P0001');
SELECT dblink_disconnect('c1');
SELECT dblink_disconnect('c2');
DROP EXTENSION dblink;
SELECT expect_true('CONC só uma saída valeu: qtd 4, valor 400, saldo 4', ic(pa3(), d1()) = '4.0000|400.0000|100.0000' AND bal(pa3(), d1()) = 4);
SELECT expect_count('CONC reconciliação da empresa A segue vazia (a linha da B é a carga sem saldo do teste de RLS)', $$SELECT 1 FROM inventory_cost_reconciliation_v WHERE company_id = ca()$$, 0);

SELECT 'TESTE-P007: TODOS OS CASOS PASSARAM' AS resultado;
