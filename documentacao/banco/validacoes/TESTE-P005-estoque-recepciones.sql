-- TESTE-P005-estoque-recepciones.sql — executar em banco DESCARTÁVEL, a partir de documentacao/banco/validacoes/,
-- após P001 + (P003: products, suppliers, com unique (company_id, id)) + REQ-2026-003-P005-estoque-recepciones-up.sql.
-- Casos: V-REQ, V-UQ, V-ENUM, V-RANGE, V-DEF, V-FK (cross-tenant por família), V-ISO (RLS), regras de integridade
-- (mesma empresa, saldo >= 0, imutabilidade, idempotência de recepção, coerência de sucursal, concorrência de saldo).
-- Falha = exceção (psql -v ON_ERROR_STOP=1). Usa a extensão dblink (contrib) SÓ para simular duas sessões; ela é
-- criada e removida aqui. Requer superusuário do banco descartável.
\set ON_ERROR_STOP 1
\i _helpers-teste.sql

-- =============================================================================
-- Carga A/B (superusuário; contorna RLS)
-- =============================================================================
INSERT INTO companies (id, code, legal_name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','emp_a5','Empresa A S.A.'),
  ('bbbbbbbb-0000-0000-0000-000000000001','emp_b5','Empresa B S.A.');
INSERT INTO branches (id, company_id, code, name) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000b1','aaaaaaaa-0000-0000-0000-000000000001','001','Matriz A'),
  ('aaaaaaaa-0000-0000-0000-0000000000b2','aaaaaaaa-0000-0000-0000-000000000001','002','Filial A'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1','bbbbbbbb-0000-0000-0000-000000000001','001','Matriz B');
INSERT INTO warehouses (id, company_id, branch_id, code, name) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000b1','D1','Depósito A1'),
  ('aaaaaaaa-0000-0000-0000-0000000000d2','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000b1','D2','Depósito A2'),
  ('aaaaaaaa-0000-0000-0000-0000000000d3','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000b2','D3','Depósito A3 (filial)'),
  ('bbbbbbbb-0000-0000-0000-0000000000d1','bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-0000000000b1','D1','Depósito B1');
INSERT INTO users (id, company_id, username, first_name, password_hash) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000a1','aaaaaaaa-0000-0000-0000-000000000001','admin','Ana','x'),
  ('bbbbbbbb-0000-0000-0000-0000000000a1','bbbbbbbb-0000-0000-0000-000000000001','admin','Beto','x');
-- dependências reais de P002/P003 (products, suppliers)
INSERT INTO units_of_measure (id, code, name) VALUES ('00000000-0000-0000-0000-0000000000c9','UN','Unidad');
INSERT INTO products (id, company_id, code, description, invoice_description, unit_of_measure_id) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000e1','aaaaaaaa-0000-0000-0000-000000000001','PA1','PA1','PA1','00000000-0000-0000-0000-0000000000c9'),
  ('aaaaaaaa-0000-0000-0000-0000000000e2','aaaaaaaa-0000-0000-0000-000000000001','PA2','PA2','PA2','00000000-0000-0000-0000-0000000000c9'),
  ('bbbbbbbb-0000-0000-0000-0000000000e1','bbbbbbbb-0000-0000-0000-000000000001','PB1','PB1','PB1','00000000-0000-0000-0000-0000000000c9');
INSERT INTO geo_countries (code, name) VALUES ('PRY','Paraguay');
INSERT INTO suppliers (id, company_id, code, tax_id, tax_id_check_digit, legal_name) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000f1','aaaaaaaa-0000-0000-0000-000000000001','SA1','80000001','1','Proveedor SA1'),
  ('bbbbbbbb-0000-0000-0000-0000000000f1','bbbbbbbb-0000-0000-0000-000000000001','SB1','80000002','2','Proveedor SB1');
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dn_app_test;

-- ---- stock_lots ----
INSERT INTO stock_lots (id, company_id, product_id, lot_code, expiry_date) VALUES
  ('aaaaaaaa-0000-0000-0000-000000001001','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000e1','L1','2027-12-31'),
  ('aaaaaaaa-0000-0000-0000-000000001002','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000e2','L2',NULL),
  ('bbbbbbbb-0000-0000-0000-000000001001','bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-0000000000e1','L1',NULL);
-- mesmo lot_code em empresa/produto diferente é permitido (acima: 'L1' em A/PA1 e B/PB1)

-- ---- stock_balances (A: PA1/D1 DISPONIBLE=10 sem lote; B: PB1/D1 DISPONIBLE=5) ----
INSERT INTO stock_balances (id, company_id, product_id, warehouse_id, stock_state, quantity) VALUES
  ('aaaaaaaa-0000-0000-0000-000000002001','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000e1','aaaaaaaa-0000-0000-0000-0000000000d1','DISPONIBLE',10),
  ('bbbbbbbb-0000-0000-0000-000000002001','bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-0000000000e1','bbbbbbbb-0000-0000-0000-0000000000d1','DISPONIBLE',5);

-- ---- inventory_movements: um de cada tipo válido (matriz tipo x depósitos) ----
INSERT INTO inventory_movements (id, company_id, movement_number, movement_type, source_type, movement_date, movement_time,
                                 source_warehouse_id, destination_warehouse_id, created_by) VALUES
  ('aaaaaaaa-0000-0000-0000-00000000aa01','aaaaaaaa-0000-0000-0000-000000000001','MOV-000001','ENTRADA','COMPRA','2026-09-17','10:00',NULL,'aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000a1'),
  ('aaaaaaaa-0000-0000-0000-00000000aa02','aaaaaaaa-0000-0000-0000-000000000001','MOV-000002','SALIDA','VENTA','2026-09-17','10:01','aaaaaaaa-0000-0000-0000-0000000000d1',NULL,'aaaaaaaa-0000-0000-0000-0000000000a1'),
  ('aaaaaaaa-0000-0000-0000-00000000aa03','aaaaaaaa-0000-0000-0000-000000000001','MOV-000003','TRANSFERENCIA','TRANSFERENCIA','2026-09-17','10:02','aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000d2','aaaaaaaa-0000-0000-0000-0000000000a1'),
  ('aaaaaaaa-0000-0000-0000-00000000aa04','aaaaaaaa-0000-0000-0000-000000000001','MOV-000004','AJUSTE_POSITIVO','AJUSTE','2026-09-17','10:03',NULL,'aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000a1'),
  ('aaaaaaaa-0000-0000-0000-00000000aa05','aaaaaaaa-0000-0000-0000-000000000001','MOV-000005','AJUSTE_NEGATIVO','AJUSTE','2026-09-17','10:04','aaaaaaaa-0000-0000-0000-0000000000d1',NULL,'aaaaaaaa-0000-0000-0000-0000000000a1'),
  ('aaaaaaaa-0000-0000-0000-00000000aa06','aaaaaaaa-0000-0000-0000-000000000001','MOV-000006','RESERVA','MANUAL','2026-09-17','10:05','aaaaaaaa-0000-0000-0000-0000000000d1',NULL,'aaaaaaaa-0000-0000-0000-0000000000a1'),
  ('aaaaaaaa-0000-0000-0000-00000000aa07','aaaaaaaa-0000-0000-0000-000000000001','MOV-000007','LIBERACION_RESERVA','MANUAL','2026-09-17','10:06','aaaaaaaa-0000-0000-0000-0000000000d1',NULL,'aaaaaaaa-0000-0000-0000-0000000000a1'),
  ('aaaaaaaa-0000-0000-0000-00000000aa08','aaaaaaaa-0000-0000-0000-000000000001','MOV-000008','CUARENTENA','INVENTARIO','2026-09-17','10:07','aaaaaaaa-0000-0000-0000-0000000000d1',NULL,'aaaaaaaa-0000-0000-0000-0000000000a1'),
  ('aaaaaaaa-0000-0000-0000-00000000aa09','aaaaaaaa-0000-0000-0000-000000000001','MOV-000009','LIBERACION_CUARENTENA','DEVOLUCION','2026-09-17','10:08','aaaaaaaa-0000-0000-0000-0000000000d1',NULL,'aaaaaaaa-0000-0000-0000-0000000000a1'),
  ('bbbbbbbb-0000-0000-0000-00000000bb01','bbbbbbbb-0000-0000-0000-000000000001','MOV-000001','ENTRADA','COMPRA','2026-09-17','10:00',NULL,'bbbbbbbb-0000-0000-0000-0000000000d1','bbbbbbbb-0000-0000-0000-0000000000a1');
-- (MOV-000001 existe em A e em B: mesmo número em empresas diferentes é permitido)

INSERT INTO inventory_movement_lines (id, company_id, movement_id, product_id, quantity) VALUES
  ('aaaaaaaa-0000-0000-0000-00000000ac01','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000aa01','aaaaaaaa-0000-0000-0000-0000000000e1',10),
  ('bbbbbbbb-0000-0000-0000-00000000bc01','bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-00000000bb01','bbbbbbbb-0000-0000-0000-0000000000e1',5);

-- ---- goods_receipts / goods_receipt_lines ----
INSERT INTO goods_receipts (id, company_id, receipt_number, receipt_date, receipt_time, warehouse_id, supplier_id, created_by) VALUES
  ('aaaaaaaa-0000-0000-0000-00000000ad01','aaaaaaaa-0000-0000-0000-000000000001','REC-000001','2026-09-17','11:00','aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000f1','aaaaaaaa-0000-0000-0000-0000000000a1'),
  ('bbbbbbbb-0000-0000-0000-00000000bd01','bbbbbbbb-0000-0000-0000-000000000001','REC-000001','2026-09-17','11:00','bbbbbbbb-0000-0000-0000-0000000000d1','bbbbbbbb-0000-0000-0000-0000000000f1','bbbbbbbb-0000-0000-0000-0000000000a1');
INSERT INTO goods_receipt_lines (id, company_id, goods_receipt_id, product_id, ordered_quantity, received_quantity, unit_cost) VALUES
  ('aaaaaaaa-0000-0000-0000-00000000ae01','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000ad01','aaaaaaaa-0000-0000-0000-0000000000e1',100,80,1500.5),
  ('bbbbbbbb-0000-0000-0000-00000000be01','bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-00000000bd01','bbbbbbbb-0000-0000-0000-0000000000e1',0,5,10);

-- =============================================================================
-- V-DEF
-- =============================================================================
SELECT expect_count('V-DEF movimento nasce REGISTRADO', $$SELECT 1 FROM inventory_movements WHERE status='REGISTRADO'$$, 10);
SELECT expect_count('V-DEF recepção nasce RECIBIDA', $$SELECT 1 FROM goods_receipts WHERE status='RECIBIDA'$$, 2);
SELECT expect_count('V-DEF ownership PROPIO e owner_id NULL no saldo', $$SELECT 1 FROM stock_balances WHERE ownership='PROPIO' AND owner_id IS NULL$$, 2);
SELECT expect_count('V-DEF ordered_quantity default 0 (linha de recepção B)', $$SELECT 1 FROM goods_receipt_lines WHERE ordered_quantity=0$$, 1);
SELECT expect_count('V-MATRIZ os 9 tipos de movimento válidos foram aceitos (empresa A)',
  $$SELECT 1 FROM inventory_movements WHERE company_id='aaaaaaaa-0000-0000-0000-000000000001'$$, 9);

-- =============================================================================
-- V-ENUM
-- =============================================================================
SELECT expect_error('V-ENUM movement_type inválido',
  $$INSERT INTO inventory_movements (company_id, movement_number, movement_type, source_type, movement_date, movement_time, destination_warehouse_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','MOV-000900','COMPRA','COMPRA','2026-09-17','10:00','aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000a1')$$, '23514');
SELECT expect_error('V-ENUM source_type inválido',
  $$INSERT INTO inventory_movements (company_id, movement_number, movement_type, source_type, movement_date, movement_time, destination_warehouse_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','MOV-000901','ENTRADA','ZZZ','2026-09-17','10:00','aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000a1')$$, '23514');
SELECT expect_error('V-ENUM status de movimento inválido (EN_TRANSITO é D-08, só desenho)',
  $$INSERT INTO inventory_movements (company_id, movement_number, movement_type, source_type, status, movement_date, movement_time, destination_warehouse_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','MOV-000902','ENTRADA','COMPRA','EN_TRANSITO','2026-09-17','10:00','aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000a1')$$, '23514');
SELECT expect_error('V-ENUM stock_state inválido (CONCILIADA é estado de transferência, não de saldo)',
  $$INSERT INTO stock_balances (company_id, product_id, warehouse_id, stock_state, quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000e2','aaaaaaaa-0000-0000-0000-0000000000d1','CONCILIADA',1)$$, '23514');
SELECT expect_error('V-ENUM ownership inválido (saldo)',
  $$INSERT INTO stock_balances (company_id, product_id, warehouse_id, stock_state, ownership, quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000e2','aaaaaaaa-0000-0000-0000-0000000000d1','DISPONIBLE','OUTRO',1)$$, '23514');
SELECT expect_error('V-ENUM ownership inválido (linha de movimento)',
  $$INSERT INTO inventory_movement_lines (company_id, movement_id, product_id, quantity, ownership) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000aa01','aaaaaaaa-0000-0000-0000-0000000000e1',1,'OUTRO')$$, '23514');
SELECT expect_error('V-ENUM status de recepção inválido',
  $$UPDATE goods_receipts SET status='RECIBIDA_CON_DIFERENCIA' WHERE id='aaaaaaaa-0000-0000-0000-00000000ad01'$$, '23514');
-- estados válidos dos saldos e da recepção
INSERT INTO stock_balances (company_id, product_id, warehouse_id, stock_state, quantity) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000e1','aaaaaaaa-0000-0000-0000-0000000000d1','RESERVADO',0),
  ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000e1','aaaaaaaa-0000-0000-0000-0000000000d1','CUARENTENA',0),
  ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000e1','aaaaaaaa-0000-0000-0000-0000000000d1','TRANSITO',0);
SELECT expect_count('V-ENUM os 4 estados de saldo aceitos para PA1/D1', $$SELECT 1 FROM stock_balances WHERE product_id='aaaaaaaa-0000-0000-0000-0000000000e1' AND warehouse_id='aaaaaaaa-0000-0000-0000-0000000000d1'$$, 4);

-- =============================================================================
-- V-REQ (NOT NULL críticos)
-- =============================================================================
SELECT expect_error('V-REQ movement_number NULL',
  $$INSERT INTO inventory_movements (company_id, movement_number, movement_type, source_type, movement_date, movement_time, destination_warehouse_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001',NULL,'ENTRADA','COMPRA','2026-09-17','10:00','aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000a1')$$, '23502');
SELECT expect_error('V-REQ created_by NULL (movimento)',
  $$INSERT INTO inventory_movements (company_id, movement_number, movement_type, source_type, movement_date, movement_time, destination_warehouse_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','MOV-000903','ENTRADA','COMPRA','2026-09-17','10:00','aaaaaaaa-0000-0000-0000-0000000000d1',NULL)$$, '23502');
SELECT expect_error('V-REQ movement_date NULL',
  $$INSERT INTO inventory_movements (company_id, movement_number, movement_type, source_type, movement_date, movement_time, destination_warehouse_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','MOV-000904','ENTRADA','COMPRA',NULL,'10:00','aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000a1')$$, '23502');
SELECT expect_error('V-REQ company_id NULL (movimento)',
  $$INSERT INTO inventory_movements (company_id, movement_number, movement_type, source_type, movement_date, movement_time, destination_warehouse_id, created_by) VALUES (NULL,'MOV-000905','ENTRADA','COMPRA','2026-09-17','10:00','aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000a1')$$, '23502');
SELECT expect_error('V-REQ product_id NULL (linha de movimento)',
  $$INSERT INTO inventory_movement_lines (company_id, movement_id, product_id, quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000aa01',NULL,1)$$, '23502');
SELECT expect_error('V-REQ supplier_id NULL (recepção)',
  $$INSERT INTO goods_receipts (company_id, receipt_number, receipt_date, receipt_time, warehouse_id, supplier_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','REC-000901','2026-09-17','11:00','aaaaaaaa-0000-0000-0000-0000000000d1',NULL,'aaaaaaaa-0000-0000-0000-0000000000a1')$$, '23502');
SELECT expect_error('V-REQ warehouse_id NULL (recepção)',
  $$INSERT INTO goods_receipts (company_id, receipt_number, receipt_date, receipt_time, warehouse_id, supplier_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','REC-000902','2026-09-17','11:00',NULL,'aaaaaaaa-0000-0000-0000-0000000000f1','aaaaaaaa-0000-0000-0000-0000000000a1')$$, '23502');
SELECT expect_error('V-REQ created_by NULL (recepção)',
  $$INSERT INTO goods_receipts (company_id, receipt_number, receipt_date, receipt_time, warehouse_id, supplier_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','REC-000903','2026-09-17','11:00','aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000f1',NULL)$$, '23502');
SELECT expect_error('V-REQ received_quantity NULL (linha de recepção)',
  $$INSERT INTO goods_receipt_lines (company_id, goods_receipt_id, product_id, received_quantity, unit_cost) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000ad01','aaaaaaaa-0000-0000-0000-0000000000e2',NULL,1)$$, '23502');
SELECT expect_error('V-REQ unit_cost NULL (linha de recepção)',
  $$INSERT INTO goods_receipt_lines (company_id, goods_receipt_id, product_id, received_quantity, unit_cost) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000ad01','aaaaaaaa-0000-0000-0000-0000000000e2',1,NULL)$$, '23502');
SELECT expect_error('V-REQ lot_code NULL',
  $$INSERT INTO stock_lots (company_id, product_id, lot_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000e1',NULL)$$, '23502');
SELECT expect_error('V-REQ stock_state NULL',
  $$INSERT INTO stock_balances (company_id, product_id, warehouse_id, stock_state, quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000e2','aaaaaaaa-0000-0000-0000-0000000000d1',NULL,1)$$, '23502');

-- =============================================================================
-- V-RANGE / V-FMT
-- =============================================================================
SELECT expect_error('V-RANGE linha de movimento com quantidade 0',
  $$INSERT INTO inventory_movement_lines (company_id, movement_id, product_id, quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000aa01','aaaaaaaa-0000-0000-0000-0000000000e1',0)$$, '23514');
SELECT expect_error('V-RANGE linha de movimento com quantidade negativa',
  $$INSERT INTO inventory_movement_lines (company_id, movement_id, product_id, quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000aa01','aaaaaaaa-0000-0000-0000-0000000000e1',-1)$$, '23514');
SELECT expect_error('V-RANGE received_quantity = 0',
  $$INSERT INTO goods_receipt_lines (company_id, goods_receipt_id, product_id, received_quantity, unit_cost) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000ad01','aaaaaaaa-0000-0000-0000-0000000000e2',0,1)$$, '23514');
SELECT expect_error('V-RANGE ordered_quantity negativa',
  $$INSERT INTO goods_receipt_lines (company_id, goods_receipt_id, product_id, ordered_quantity, received_quantity, unit_cost) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000ad01','aaaaaaaa-0000-0000-0000-0000000000e2',-1,1,1)$$, '23514');
SELECT expect_error('V-RANGE unit_cost negativo',
  $$INSERT INTO goods_receipt_lines (company_id, goods_receipt_id, product_id, received_quantity, unit_cost) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000ad01','aaaaaaaa-0000-0000-0000-0000000000e2',1,-0.01)$$, '23514');
SELECT expect_error('V-FMT movement_number fora do formato MOV-######',
  $$INSERT INTO inventory_movements (company_id, movement_number, movement_type, source_type, movement_date, movement_time, destination_warehouse_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','MOV-12','ENTRADA','COMPRA','2026-09-17','10:00','aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000a1')$$, '23514');
SELECT expect_error('V-FMT receipt_number fora do formato REC-######',
  $$INSERT INTO goods_receipts (company_id, receipt_number, receipt_date, receipt_time, warehouse_id, supplier_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','OC-000123','2026-09-17','11:00','aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000f1','aaaaaaaa-0000-0000-0000-0000000000a1')$$, '23514');
SELECT expect_error('V-FMT lot_code vazio (no código lote vazio = sem lote)',
  $$INSERT INTO stock_lots (company_id, product_id, lot_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000e1','   ')$$, '23514');
SELECT expect_error('V-RANGE owner_id preenchido com ownership PROPIO (saldo)',
  $$INSERT INTO stock_balances (company_id, product_id, warehouse_id, stock_state, ownership, owner_id, quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000e2','aaaaaaaa-0000-0000-0000-0000000000d1','DISPONIBLE','PROPIO','aaaaaaaa-0000-0000-0000-0000000000f1',1)$$, '23514');
-- TERCERO com owner_id é aceito (a quem pertence o owner_id é DEFINIR: sem FK)
INSERT INTO stock_balances (company_id, product_id, warehouse_id, stock_state, ownership, owner_id, quantity)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000e2','aaaaaaaa-0000-0000-0000-0000000000d1','DISPONIBLE','TERCERO','aaaaaaaa-0000-0000-0000-0000000000f1',3);

-- ---- matriz tipo x depósitos (CHECK) ----
SELECT expect_error('V-MATRIZ ENTRADA com depósito de origem',
  $$INSERT INTO inventory_movements (company_id, movement_number, movement_type, source_type, movement_date, movement_time, source_warehouse_id, destination_warehouse_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','MOV-000910','ENTRADA','COMPRA','2026-09-17','10:00','aaaaaaaa-0000-0000-0000-0000000000d2','aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000a1')$$, '23514');
SELECT expect_error('V-MATRIZ ENTRADA sem destino',
  $$INSERT INTO inventory_movements (company_id, movement_number, movement_type, source_type, movement_date, movement_time, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','MOV-000911','ENTRADA','COMPRA','2026-09-17','10:00','aaaaaaaa-0000-0000-0000-0000000000a1')$$, '23514');
SELECT expect_error('V-MATRIZ SALIDA sem origem',
  $$INSERT INTO inventory_movements (company_id, movement_number, movement_type, source_type, movement_date, movement_time, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','MOV-000912','SALIDA','VENTA','2026-09-17','10:00','aaaaaaaa-0000-0000-0000-0000000000a1')$$, '23514');
SELECT expect_error('V-MATRIZ SALIDA com destino preenchido (DIV-14: destino só quando o tipo exige)',
  $$INSERT INTO inventory_movements (company_id, movement_number, movement_type, source_type, movement_date, movement_time, source_warehouse_id, destination_warehouse_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','MOV-000913','SALIDA','VENTA','2026-09-17','10:00','aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000d2','aaaaaaaa-0000-0000-0000-0000000000a1')$$, '23514');
SELECT expect_error('V-MATRIZ TRANSFERENCIA com origem = destino',
  $$INSERT INTO inventory_movements (company_id, movement_number, movement_type, source_type, movement_date, movement_time, source_warehouse_id, destination_warehouse_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','MOV-000914','TRANSFERENCIA','TRANSFERENCIA','2026-09-17','10:00','aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000a1')$$, '23514');
SELECT expect_error('V-MATRIZ TRANSFERENCIA sem destino',
  $$INSERT INTO inventory_movements (company_id, movement_number, movement_type, source_type, movement_date, movement_time, source_warehouse_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','MOV-000915','TRANSFERENCIA','TRANSFERENCIA','2026-09-17','10:00','aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000a1')$$, '23514');
SELECT expect_error('V-MATRIZ AJUSTE_POSITIVO com origem',
  $$INSERT INTO inventory_movements (company_id, movement_number, movement_type, source_type, movement_date, movement_time, source_warehouse_id, destination_warehouse_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','MOV-000916','AJUSTE_POSITIVO','AJUSTE','2026-09-17','10:00','aaaaaaaa-0000-0000-0000-0000000000d2','aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000a1')$$, '23514');
SELECT expect_error('V-MATRIZ CUARENTENA sem origem',
  $$INSERT INTO inventory_movements (company_id, movement_number, movement_type, source_type, movement_date, movement_time, destination_warehouse_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','MOV-000917','CUARENTENA','AJUSTE','2026-09-17','10:00','aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000a1')$$, '23514');

-- =============================================================================
-- V-UQ (unicidade)
-- =============================================================================
SELECT expect_error('V-UQ movement_number repetido na empresa A',
  $$INSERT INTO inventory_movements (company_id, movement_number, movement_type, source_type, movement_date, movement_time, destination_warehouse_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','MOV-000001','ENTRADA','COMPRA','2026-09-17','10:00','aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000a1')$$, '23505');
SELECT expect_error('V-UQ receipt_number repetido na empresa A (IDEMPOTÊNCIA de recepção)',
  $$INSERT INTO goods_receipts (company_id, receipt_number, receipt_date, receipt_time, warehouse_id, supplier_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','REC-000001','2026-09-17','11:00','aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000f1','aaaaaaaa-0000-0000-0000-0000000000a1')$$, '23505');
SELECT expect_affected('V-UQ reenvio da mesma recepção com ON CONFLICT (company_id, receipt_number) DO NOTHING não duplica',
  $$INSERT INTO goods_receipts (company_id, receipt_number, receipt_date, receipt_time, warehouse_id, supplier_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','REC-000001','2026-09-17','11:00','aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000f1','aaaaaaaa-0000-0000-0000-0000000000a1') ON CONFLICT (company_id, receipt_number) DO NOTHING$$, 0);
SELECT expect_count('V-UQ continua 1 recepção REC-000001 em A', $$SELECT 1 FROM goods_receipts WHERE company_id='aaaaaaaa-0000-0000-0000-000000000001' AND receipt_number='REC-000001'$$, 1);
SELECT expect_error('V-UQ lot_code repetido no mesmo produto',
  $$INSERT INTO stock_lots (company_id, product_id, lot_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000e1','L1')$$, '23505');
INSERT INTO stock_lots (company_id, product_id, lot_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000e2','L1');   -- mesmo código, outro produto: permitido
SELECT expect_error('V-UQ produto repetido na mesma recepção',
  $$INSERT INTO goods_receipt_lines (company_id, goods_receipt_id, product_id, received_quantity, unit_cost) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000ad01','aaaaaaaa-0000-0000-0000-0000000000e1',1,1)$$, '23505');
SELECT expect_error('V-UQ saldo repetido (mesma chave natural, lote NULL)',
  $$INSERT INTO stock_balances (company_id, product_id, warehouse_id, stock_state, quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000e1','aaaaaaaa-0000-0000-0000-0000000000d1','DISPONIBLE',1)$$, '23505');
INSERT INTO stock_balances (company_id, product_id, warehouse_id, stock_state, lot_id, quantity)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000e1','aaaaaaaa-0000-0000-0000-0000000000d1','DISPONIBLE','aaaaaaaa-0000-0000-0000-000000001001',4);   -- com lote: outra linha, permitido
SELECT expect_error('V-UQ saldo repetido (mesma chave natural, com lote)',
  $$INSERT INTO stock_balances (company_id, product_id, warehouse_id, stock_state, lot_id, quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000e1','aaaaaaaa-0000-0000-0000-0000000000d1','DISPONIBLE','aaaaaaaa-0000-0000-0000-000000001001',1)$$, '23505');
SELECT expect_error('V-UQ saldo TERCERO repetido para o mesmo proprietário',
  $$INSERT INTO stock_balances (company_id, product_id, warehouse_id, stock_state, ownership, owner_id, quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000e2','aaaaaaaa-0000-0000-0000-0000000000d1','DISPONIBLE','TERCERO','aaaaaaaa-0000-0000-0000-0000000000f1',1)$$, '23505');
-- IDEMPOTÊNCIA da entrada de estoque por linha de recepção: 1 linha de recepção gera estoque UMA vez
INSERT INTO inventory_movements (id, company_id, movement_number, movement_type, source_type, movement_date, movement_time, destination_warehouse_id, reference_document, created_by)
  VALUES ('aaaaaaaa-0000-0000-0000-00000000aa10','aaaaaaaa-0000-0000-0000-000000000001','MOV-000010','ENTRADA','COMPRA','2026-09-17','11:00','aaaaaaaa-0000-0000-0000-0000000000d1','REC-000001','aaaaaaaa-0000-0000-0000-0000000000a1');
INSERT INTO inventory_movement_lines (company_id, movement_id, product_id, quantity, goods_receipt_line_id)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000aa10','aaaaaaaa-0000-0000-0000-0000000000e1',80,'aaaaaaaa-0000-0000-0000-00000000ae01');
SELECT expect_error('V-UQ a mesma linha de recepção não pode gerar entrada duas vezes',
  $$INSERT INTO inventory_movement_lines (company_id, movement_id, product_id, quantity, goods_receipt_line_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000aa10','aaaaaaaa-0000-0000-0000-0000000000e1',80,'aaaaaaaa-0000-0000-0000-00000000ae01')$$, '23505');
-- linhas de movimento sem vínculo de recepção (NULL) podem repetir-se
INSERT INTO inventory_movement_lines (company_id, movement_id, product_id, quantity) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000aa10','aaaaaaaa-0000-0000-0000-0000000000e2',1),
  ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000aa10','aaaaaaaa-0000-0000-0000-0000000000e2',1);

-- =============================================================================
-- V-FK: FK composta impede ligar linhas de empresas diferentes (1+ por família)
-- =============================================================================
-- família: inventory_movements -> warehouses (origem e destino), branches, users
SELECT expect_error('V-FK movimento A com depósito de ORIGEM de B',
  $$INSERT INTO inventory_movements (company_id, movement_number, movement_type, source_type, movement_date, movement_time, source_warehouse_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','MOV-000920','SALIDA','VENTA','2026-09-17','10:00','bbbbbbbb-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000a1')$$, '23503');
SELECT expect_error('V-FK movimento A com depósito de DESTINO de B',
  $$INSERT INTO inventory_movements (company_id, movement_number, movement_type, source_type, movement_date, movement_time, destination_warehouse_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','MOV-000921','ENTRADA','COMPRA','2026-09-17','10:00','bbbbbbbb-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000a1')$$, '23503');
SELECT expect_error('V-FK movimento A com sucursal de B',
  $$INSERT INTO inventory_movements (company_id, movement_number, movement_type, source_type, movement_date, movement_time, branch_id, destination_warehouse_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','MOV-000922','ENTRADA','COMPRA','2026-09-17','10:00','bbbbbbbb-0000-0000-0000-0000000000b1','aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000a1')$$, '23503');
SELECT expect_error('V-FK movimento A criado por usuário de B',
  $$INSERT INTO inventory_movements (company_id, movement_number, movement_type, source_type, movement_date, movement_time, destination_warehouse_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','MOV-000923','ENTRADA','COMPRA','2026-09-17','10:00','aaaaaaaa-0000-0000-0000-0000000000d1','bbbbbbbb-0000-0000-0000-0000000000a1')$$, '23503');
-- família: inventory_movement_lines -> movimento / produto / lote / linha de recepção
SELECT expect_error('V-FK linha da empresa A em movimento da empresa B (movimento e linhas na MESMA empresa)',
  $$INSERT INTO inventory_movement_lines (company_id, movement_id, product_id, quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-00000000bb01','aaaaaaaa-0000-0000-0000-0000000000e1',1)$$, '23503');
SELECT expect_error('V-FK linha da empresa B em movimento da empresa A',
  $$INSERT INTO inventory_movement_lines (company_id, movement_id, product_id, quantity) VALUES ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000aa01','bbbbbbbb-0000-0000-0000-0000000000e1',1)$$, '23503');
SELECT expect_error('V-FK linha de movimento A com produto de B',
  $$INSERT INTO inventory_movement_lines (company_id, movement_id, product_id, quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000aa01','bbbbbbbb-0000-0000-0000-0000000000e1',1)$$, '23503');
SELECT expect_error('V-FK linha de movimento A com lote de B',
  $$INSERT INTO inventory_movement_lines (company_id, movement_id, product_id, quantity, lot_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000aa01','aaaaaaaa-0000-0000-0000-0000000000e1',1,'bbbbbbbb-0000-0000-0000-000000001001')$$, '23503');
SELECT expect_error('V-FK linha de movimento com lote de OUTRO produto da mesma empresa',
  $$INSERT INTO inventory_movement_lines (company_id, movement_id, product_id, quantity, lot_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000aa01','aaaaaaaa-0000-0000-0000-0000000000e1',1,'aaaaaaaa-0000-0000-0000-000000001002')$$, '23503');
SELECT expect_error('V-FK linha de movimento A com linha de recepção de B',
  $$INSERT INTO inventory_movement_lines (company_id, movement_id, product_id, quantity, goods_receipt_line_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000aa01','aaaaaaaa-0000-0000-0000-0000000000e1',1,'bbbbbbbb-0000-0000-0000-00000000be01')$$, '23503');
-- família: stock_lots / stock_balances
SELECT expect_error('V-FK lote A com produto de B',
  $$INSERT INTO stock_lots (company_id, product_id, lot_code) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-0000000000e1','LX')$$, '23503');
SELECT expect_error('V-FK saldo A com produto de B',
  $$INSERT INTO stock_balances (company_id, product_id, warehouse_id, stock_state, quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-0000000000e1','aaaaaaaa-0000-0000-0000-0000000000d2','DISPONIBLE',1)$$, '23503');
SELECT expect_error('V-FK saldo A com depósito de B',
  $$INSERT INTO stock_balances (company_id, product_id, warehouse_id, stock_state, quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000e2','bbbbbbbb-0000-0000-0000-0000000000d1','DISPONIBLE',1)$$, '23503');
SELECT expect_error('V-FK saldo A com lote de B',
  $$INSERT INTO stock_balances (company_id, product_id, warehouse_id, stock_state, lot_id, quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000e1','aaaaaaaa-0000-0000-0000-0000000000d2','DISPONIBLE','bbbbbbbb-0000-0000-0000-000000001001',1)$$, '23503');
SELECT expect_error('V-FK saldo com lote de outro produto (lote só vale para o seu produto)',
  $$INSERT INTO stock_balances (company_id, product_id, warehouse_id, stock_state, lot_id, quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000e1','aaaaaaaa-0000-0000-0000-0000000000d2','DISPONIBLE','aaaaaaaa-0000-0000-0000-000000001002',1)$$, '23503');
-- família: goods_receipts
SELECT expect_error('V-FK recepção A com depósito de B',
  $$INSERT INTO goods_receipts (company_id, receipt_number, receipt_date, receipt_time, warehouse_id, supplier_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','REC-000920','2026-09-17','11:00','bbbbbbbb-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000f1','aaaaaaaa-0000-0000-0000-0000000000a1')$$, '23503');
SELECT expect_error('V-FK recepção A com fornecedor de B',
  $$INSERT INTO goods_receipts (company_id, receipt_number, receipt_date, receipt_time, warehouse_id, supplier_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','REC-000921','2026-09-17','11:00','aaaaaaaa-0000-0000-0000-0000000000d1','bbbbbbbb-0000-0000-0000-0000000000f1','aaaaaaaa-0000-0000-0000-0000000000a1')$$, '23503');
SELECT expect_error('V-FK recepção A criada por usuário de B',
  $$INSERT INTO goods_receipts (company_id, receipt_number, receipt_date, receipt_time, warehouse_id, supplier_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','REC-000922','2026-09-17','11:00','aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000f1','bbbbbbbb-0000-0000-0000-0000000000a1')$$, '23503');
SELECT expect_error('V-FK recepção A com sucursal de B',
  $$INSERT INTO goods_receipts (company_id, receipt_number, receipt_date, receipt_time, branch_id, warehouse_id, supplier_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','REC-000923','2026-09-17','11:00','bbbbbbbb-0000-0000-0000-0000000000b1','aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000f1','aaaaaaaa-0000-0000-0000-0000000000a1')$$, '23503');
SELECT expect_error('V-FK linha de recepção A em recepção de B',
  $$INSERT INTO goods_receipt_lines (company_id, goods_receipt_id, product_id, received_quantity, unit_cost) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-00000000bd01','aaaaaaaa-0000-0000-0000-0000000000e2',1,1)$$, '23503');
SELECT expect_error('V-FK linha de recepção A com produto de B',
  $$INSERT INTO goods_receipt_lines (company_id, goods_receipt_id, product_id, received_quantity, unit_cost) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000ad01','bbbbbbbb-0000-0000-0000-0000000000e1',1,1)$$, '23503');
SELECT expect_error('V-FK linha de recepção com lote de outro produto',
  $$INSERT INTO goods_receipt_lines (company_id, goods_receipt_id, product_id, received_quantity, unit_cost, lot_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000ad01','aaaaaaaa-0000-0000-0000-0000000000e2',1,1,'aaaaaaaa-0000-0000-0000-000000001001')$$, '23503');

-- =============================================================================
-- Regra: coerência sucursal x depósito na recepção (REC-036)
-- =============================================================================
SELECT expect_error('REG-BRANCH sucursal da recepção diferente da do depósito',
  $$INSERT INTO goods_receipts (company_id, receipt_number, receipt_date, receipt_time, branch_id, warehouse_id, supplier_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','REC-000930','2026-09-17','11:00','aaaaaaaa-0000-0000-0000-0000000000b2','aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000f1','aaaaaaaa-0000-0000-0000-0000000000a1')$$, 'P0001');
INSERT INTO goods_receipts (company_id, receipt_number, receipt_date, receipt_time, branch_id, warehouse_id, supplier_id, created_by)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001','REC-000931','2026-09-17','11:00','aaaaaaaa-0000-0000-0000-0000000000b2','aaaaaaaa-0000-0000-0000-0000000000d3','aaaaaaaa-0000-0000-0000-0000000000f1','aaaaaaaa-0000-0000-0000-0000000000a1');
SELECT expect_error('REG-BRANCH mudar o depósito para outra sucursal mantendo branch_id',
  $$UPDATE goods_receipts SET warehouse_id='aaaaaaaa-0000-0000-0000-0000000000d1' WHERE receipt_number='REC-000931' AND company_id='aaaaaaaa-0000-0000-0000-000000000001'$$, 'P0001');

-- =============================================================================
-- Regra: SALDO NUNCA NEGATIVO
-- =============================================================================
SELECT expect_error('REG-SALDO insert de saldo negativo',
  $$INSERT INTO stock_balances (company_id, product_id, warehouse_id, stock_state, quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000e2','aaaaaaaa-0000-0000-0000-0000000000d2','DISPONIBLE',-1)$$, '23514');
SELECT expect_error('REG-SALDO débito maior que o saldo (10 - 11)',
  $$UPDATE stock_balances SET quantity = quantity - 11 WHERE id='aaaaaaaa-0000-0000-0000-000000002001'$$, '23514');
SELECT expect_affected('REG-SALDO débito exato até zero é permitido (10 - 10), depois repõe',
  $$UPDATE stock_balances SET quantity = quantity - 10 WHERE id='aaaaaaaa-0000-0000-0000-000000002001'$$, 1);
UPDATE stock_balances SET quantity = 10 WHERE id='aaaaaaaa-0000-0000-0000-000000002001';

-- =============================================================================
-- Regra: IMUTABILIDADE de inventory_movements / inventory_movement_lines
-- =============================================================================
SELECT expect_error('REG-IMUT alterar movement_type de movimento registrado',
  $$UPDATE inventory_movements SET movement_type='AJUSTE_POSITIVO' WHERE id='aaaaaaaa-0000-0000-0000-00000000aa01'$$, 'P0001');
SELECT expect_error('REG-IMUT alterar motivo (reason) de movimento registrado',
  $$UPDATE inventory_movements SET reason='corrigido depois' WHERE id='aaaaaaaa-0000-0000-0000-00000000aa01'$$, 'P0001');
SELECT expect_error('REG-IMUT alterar data do movimento',
  $$UPDATE inventory_movements SET movement_date='2020-01-01' WHERE id='aaaaaaaa-0000-0000-0000-00000000aa01'$$, 'P0001');
SELECT expect_error('REG-IMUT trocar o depósito do movimento',
  $$UPDATE inventory_movements SET destination_warehouse_id='aaaaaaaa-0000-0000-0000-0000000000d2' WHERE id='aaaaaaaa-0000-0000-0000-00000000aa01'$$, 'P0001');
SELECT expect_error('REG-IMUT DELETE de movimento (anulação é por estado)',
  $$DELETE FROM inventory_movements WHERE id='aaaaaaaa-0000-0000-0000-00000000aa01'$$, 'P0001');
SELECT expect_error('REG-IMUT UPDATE de linha de movimento',
  $$UPDATE inventory_movement_lines SET quantity=999 WHERE id='aaaaaaaa-0000-0000-0000-00000000ac01'$$, 'P0001');
SELECT expect_error('REG-IMUT DELETE de linha de movimento',
  $$DELETE FROM inventory_movement_lines WHERE id='aaaaaaaa-0000-0000-0000-00000000ac01'$$, 'P0001');
SELECT expect_error('REG-IMUT transição de status inválida (REGISTRADO -> valor fora do domínio)',
  $$UPDATE inventory_movements SET status='REVERTIDO' WHERE id='aaaaaaaa-0000-0000-0000-00000000aa01'$$, 'P0001');
-- anulação por estado: permitida e carimba updated_at
SELECT expect_affected('REG-IMUT anular por estado (REGISTRADO -> ANULADO) é permitido',
  $$UPDATE inventory_movements SET status='ANULADO' WHERE id='aaaaaaaa-0000-0000-0000-00000000aa09'$$, 1);
SELECT expect_count('REG-IMUT updated_at foi atualizado pela anulação', $$SELECT 1 FROM inventory_movements WHERE id='aaaaaaaa-0000-0000-0000-00000000aa09' AND status='ANULADO' AND updated_at > created_at$$, 1);
SELECT expect_error('REG-IMUT ANULADO é final: não volta para REGISTRADO',
  $$UPDATE inventory_movements SET status='REGISTRADO' WHERE id='aaaaaaaa-0000-0000-0000-00000000aa09'$$, 'P0001');
SELECT expect_error('REG-IMUT não se acrescenta linha a movimento ANULADO',
  $$INSERT INTO inventory_movement_lines (company_id, movement_id, product_id, quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000aa09','aaaaaaaa-0000-0000-0000-0000000000e1',1)$$, 'P0001');
SELECT expect_error('REG-IMUT DELETE de movimento ANULADO também é proibido',
  $$DELETE FROM inventory_movements WHERE id='aaaaaaaa-0000-0000-0000-00000000aa09'$$, 'P0001');
SELECT expect_error('V-FK linha de movimento para movimento inexistente',
  $$INSERT INTO inventory_movement_lines (company_id, movement_id, product_id, quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000ffff','aaaaaaaa-0000-0000-0000-0000000000e1',1)$$, '23503');
-- receptor de estoque: a linha de recepção já usada por movimento não pode ser apagada (FK)
SELECT expect_error('REG-REC linha de recepção com estoque lançado não pode ser apagada',
  $$DELETE FROM goods_receipt_lines WHERE id='aaaaaaaa-0000-0000-0000-00000000ae01'$$, '23503');

-- =============================================================================
-- Fluxo transacional de lançamento de recepção (padrão exigido do servidor, DIV-11) + reconciliação (V-MIG)
-- =============================================================================
-- Recepção REC-000002 de 25 un. de PA2 no depósito A2: recepção + linha + movimento ENTRADA + upsert de saldo, tudo numa transação.
BEGIN;
INSERT INTO goods_receipts (id, company_id, receipt_number, receipt_date, receipt_time, warehouse_id, supplier_id, created_by)
  VALUES ('aaaaaaaa-0000-0000-0000-00000000ad02','aaaaaaaa-0000-0000-0000-000000000001','REC-000002','2026-09-18','09:00','aaaaaaaa-0000-0000-0000-0000000000d2','aaaaaaaa-0000-0000-0000-0000000000f1','aaaaaaaa-0000-0000-0000-0000000000a1');
INSERT INTO goods_receipt_lines (id, company_id, goods_receipt_id, product_id, received_quantity, unit_cost)
  VALUES ('aaaaaaaa-0000-0000-0000-00000000ae02','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000ad02','aaaaaaaa-0000-0000-0000-0000000000e2',25,100);
INSERT INTO inventory_movements (id, company_id, movement_number, movement_type, source_type, movement_date, movement_time, destination_warehouse_id, reference_document, created_by)
  VALUES ('aaaaaaaa-0000-0000-0000-00000000aa11','aaaaaaaa-0000-0000-0000-000000000001','MOV-000011','ENTRADA','COMPRA','2026-09-18','09:00','aaaaaaaa-0000-0000-0000-0000000000d2','REC-000002','aaaaaaaa-0000-0000-0000-0000000000a1');
INSERT INTO inventory_movement_lines (company_id, movement_id, product_id, quantity, goods_receipt_line_id)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000aa11','aaaaaaaa-0000-0000-0000-0000000000e2',25,'aaaaaaaa-0000-0000-0000-00000000ae02');
INSERT INTO stock_balances (company_id, product_id, warehouse_id, stock_state, quantity)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000e2','aaaaaaaa-0000-0000-0000-0000000000d2','DISPONIBLE',25);
COMMIT;
-- Saída de 10: trava a linha, confere suficiência, grava movimento + linha e debita.
BEGIN;
SELECT quantity FROM stock_balances WHERE company_id='aaaaaaaa-0000-0000-0000-000000000001' AND product_id='aaaaaaaa-0000-0000-0000-0000000000e2'
   AND warehouse_id='aaaaaaaa-0000-0000-0000-0000000000d2' AND stock_state='DISPONIBLE' AND lot_id IS NULL AND ownership='PROPIO' FOR UPDATE;
INSERT INTO inventory_movements (id, company_id, movement_number, movement_type, source_type, movement_date, movement_time, source_warehouse_id, created_by)
  VALUES ('aaaaaaaa-0000-0000-0000-00000000aa12','aaaaaaaa-0000-0000-0000-000000000001','MOV-000012','SALIDA','VENTA','2026-09-18','10:00','aaaaaaaa-0000-0000-0000-0000000000d2','aaaaaaaa-0000-0000-0000-0000000000a1');
INSERT INTO inventory_movement_lines (company_id, movement_id, product_id, quantity)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000aa12','aaaaaaaa-0000-0000-0000-0000000000e2',10);
UPDATE stock_balances SET quantity = quantity - 10 WHERE company_id='aaaaaaaa-0000-0000-0000-000000000001' AND product_id='aaaaaaaa-0000-0000-0000-0000000000e2'
   AND warehouse_id='aaaaaaaa-0000-0000-0000-0000000000d2' AND stock_state='DISPONIBLE' AND lot_id IS NULL AND ownership='PROPIO';
COMMIT;
SELECT expect_count('V-MIG saldo PA2/A2 (15) = soma(ENTRADA) - soma(SALIDA) dos movimentos REGISTRADOS',
  $$SELECT 1 FROM stock_balances b WHERE b.product_id='aaaaaaaa-0000-0000-0000-0000000000e2' AND b.warehouse_id='aaaaaaaa-0000-0000-0000-0000000000d2' AND b.stock_state='DISPONIBLE' AND b.ownership='PROPIO'
     AND b.quantity = (SELECT COALESCE(sum(CASE m.movement_type WHEN 'ENTRADA' THEN l.quantity WHEN 'SALIDA' THEN -l.quantity END),0)
                         FROM inventory_movement_lines l JOIN inventory_movements m ON (m.company_id,m.id)=(l.company_id,l.movement_id)
                        WHERE l.product_id=b.product_id AND m.status='REGISTRADO'
                          AND COALESCE(m.destination_warehouse_id,m.source_warehouse_id)=b.warehouse_id)$$, 1);
-- transação que falha no meio não deixa estoque pela metade (atomicidade, DIV-11)
DO $$
BEGIN
  BEGIN
    INSERT INTO goods_receipts (id, company_id, receipt_number, receipt_date, receipt_time, warehouse_id, supplier_id, created_by)
      VALUES ('aaaaaaaa-0000-0000-0000-00000000ad03','aaaaaaaa-0000-0000-0000-000000000001','REC-000003','2026-09-18','09:00','aaaaaaaa-0000-0000-0000-0000000000d2','aaaaaaaa-0000-0000-0000-0000000000f1','aaaaaaaa-0000-0000-0000-0000000000a1');
    INSERT INTO goods_receipt_lines (company_id, goods_receipt_id, product_id, received_quantity, unit_cost)
      VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000ad03','aaaaaaaa-0000-0000-0000-0000000000e2',0,1);   -- viola received_quantity > 0
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
SELECT expect_count('V-ATOM recepção REC-000003 não ficou gravada após o erro', $$SELECT 1 FROM goods_receipts WHERE receipt_number='REC-000003'$$, 0);

-- =============================================================================
-- V-ISO: RLS com o papel da aplicação (SELECT/INSERT/UPDATE/DELETE cruzados) nas 6 tabelas
-- =============================================================================
BEGIN;
SET LOCAL ROLE dn_app_test;
SELECT expect_count('V-ISO sem app.company_id nada é visível (stock_lots)', 'SELECT 1 FROM stock_lots', 0);
SELECT expect_count('V-ISO sem app.company_id nada é visível (stock_balances)', 'SELECT 1 FROM stock_balances', 0);
SELECT expect_count('V-ISO sem app.company_id nada é visível (inventory_movements)', 'SELECT 1 FROM inventory_movements', 0);
SELECT expect_count('V-ISO sem app.company_id nada é visível (inventory_movement_lines)', 'SELECT 1 FROM inventory_movement_lines', 0);
SELECT expect_count('V-ISO sem app.company_id nada é visível (goods_receipts)', 'SELECT 1 FROM goods_receipts', 0);
SELECT expect_count('V-ISO sem app.company_id nada é visível (goods_receipt_lines)', 'SELECT 1 FROM goods_receipt_lines', 0);
SELECT expect_error('V-ISO sem app.company_id não se grava movimento',
  $$INSERT INTO inventory_movements (company_id, movement_number, movement_type, source_type, movement_date, movement_time, destination_warehouse_id, created_by) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','MOV-000950','ENTRADA','COMPRA','2026-09-17','10:00','aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-0000000000a1')$$, '42501');
SELECT set_config('app.company_id','aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT expect_count('V-ISO A vê só os seus lotes (3)', 'SELECT 1 FROM stock_lots', 3);
SELECT expect_count('V-ISO A não vê o lote de B por id', $$SELECT 1 FROM stock_lots WHERE id='bbbbbbbb-0000-0000-0000-000000001001'$$, 0);
SELECT expect_count('V-ISO A não vê saldo de B', $$SELECT 1 FROM stock_balances WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_count('V-ISO A vê só os seus movimentos (12)', 'SELECT 1 FROM inventory_movements', 12);
SELECT expect_count('V-ISO A não vê o movimento de B por id', $$SELECT 1 FROM inventory_movements WHERE id='bbbbbbbb-0000-0000-0000-00000000bb01'$$, 0);
SELECT expect_count('V-ISO A não vê linhas de movimento de B', $$SELECT 1 FROM inventory_movement_lines WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_count('V-ISO A não vê recepção de B', $$SELECT 1 FROM goods_receipts WHERE id='bbbbbbbb-0000-0000-0000-00000000bd01'$$, 0);
SELECT expect_count('V-ISO A não vê linhas de recepção de B', $$SELECT 1 FROM goods_receipt_lines WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
-- INSERT cruzado (company_id de B) em cada tabela
SELECT expect_error('V-ISO A não grava lote com company_id de B',
  $$INSERT INTO stock_lots (company_id, product_id, lot_code) VALUES ('bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-0000000000e1','LZ')$$, '42501');
SELECT expect_error('V-ISO A não grava saldo com company_id de B',
  $$INSERT INTO stock_balances (company_id, product_id, warehouse_id, stock_state, quantity) VALUES ('bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-0000000000e1','bbbbbbbb-0000-0000-0000-0000000000d1','RESERVADO',1)$$, '42501');
SELECT expect_error('V-ISO A não grava movimento com company_id de B',
  $$INSERT INTO inventory_movements (company_id, movement_number, movement_type, source_type, movement_date, movement_time, destination_warehouse_id, created_by) VALUES ('bbbbbbbb-0000-0000-0000-000000000001','MOV-000951','ENTRADA','COMPRA','2026-09-17','10:00','bbbbbbbb-0000-0000-0000-0000000000d1','bbbbbbbb-0000-0000-0000-0000000000a1')$$, '42501');
SELECT expect_error('V-ISO A não grava linha de movimento com company_id de B',
  $$INSERT INTO inventory_movement_lines (company_id, movement_id, product_id, quantity) VALUES ('bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-00000000bb01','bbbbbbbb-0000-0000-0000-0000000000e1',1)$$, '42501');
SELECT expect_error('V-ISO A não grava recepção com company_id de B',
  $$INSERT INTO goods_receipts (company_id, receipt_number, receipt_date, receipt_time, warehouse_id, supplier_id, created_by) VALUES ('bbbbbbbb-0000-0000-0000-000000000001','REC-000951','2026-09-17','11:00','bbbbbbbb-0000-0000-0000-0000000000d1','bbbbbbbb-0000-0000-0000-0000000000f1','bbbbbbbb-0000-0000-0000-0000000000a1')$$, '42501');
SELECT expect_error('V-ISO A não grava linha de recepção com company_id de B',
  $$INSERT INTO goods_receipt_lines (company_id, goods_receipt_id, product_id, received_quantity, unit_cost) VALUES ('bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-00000000bd01','bbbbbbbb-0000-0000-0000-0000000000e1',1,1)$$, '42501');
-- UPDATE / DELETE cruzados afetam 0 linhas
SELECT expect_affected('V-ISO A não altera saldo de B', $$UPDATE stock_balances SET quantity=0 WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não altera lote de B', $$UPDATE stock_lots SET expiry_date='2030-01-01' WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não anula movimento de B', $$UPDATE inventory_movements SET status='ANULADO' WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não altera recepção de B', $$UPDATE goods_receipts SET notes='hack' WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não altera linha de recepção de B', $$UPDATE goods_receipt_lines SET unit_cost=0 WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não apaga saldo de B', $$DELETE FROM stock_balances WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não apaga movimento de B (RLS filtra antes do trigger de imutabilidade)', $$DELETE FROM inventory_movements WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não apaga linha de movimento de B', $$DELETE FROM inventory_movement_lines WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não apaga recepção de B', $$DELETE FROM goods_receipts WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_affected('V-ISO A não apaga lote de B', $$DELETE FROM stock_lots WHERE company_id='bbbbbbbb-0000-0000-0000-000000000001'$$, 0);
SELECT expect_error('V-ISO A não troca company_id de saldo seu para B',
  $$UPDATE stock_balances SET company_id='bbbbbbbb-0000-0000-0000-000000000001' WHERE id='aaaaaaaa-0000-0000-0000-000000002001'$$, '42501');
SELECT expect_error('V-ISO A não troca company_id de recepção sua para B',
  $$UPDATE goods_receipts SET company_id='bbbbbbbb-0000-0000-0000-000000000001' WHERE id='aaaaaaaa-0000-0000-0000-00000000ad01'$$, '42501');
-- imutabilidade vale também sob RLS para o próprio dono
SELECT expect_error('V-ISO+IMUT A não apaga seu próprio movimento (trigger)', $$DELETE FROM inventory_movements WHERE id='aaaaaaaa-0000-0000-0000-00000000aa02'$$, 'P0001');
SELECT expect_affected('V-ISO+IMUT A anula seu próprio movimento por estado', $$UPDATE inventory_movements SET status='ANULADO' WHERE id='aaaaaaaa-0000-0000-0000-00000000aa08'$$, 1);
COMMIT;
BEGIN;
SET LOCAL ROLE dn_app_test;
SELECT set_config('app.company_id','bbbbbbbb-0000-0000-0000-000000000001', true);
SELECT expect_count('V-ISO B vê só o seu saldo', 'SELECT 1 FROM stock_balances', 1);
SELECT expect_count('V-ISO B vê só o seu movimento', 'SELECT 1 FROM inventory_movements', 1);
SELECT expect_count('V-ISO B vê só a sua recepção', 'SELECT 1 FROM goods_receipts', 1);
SELECT expect_count('V-ISO B não vê o movimento anulado por A', $$SELECT 1 FROM inventory_movements WHERE status='ANULADO'$$, 0);
COMMIT;

-- =============================================================================
-- Regra: CONCORRÊNCIA de saldo — duas sessões reais (dblink) e SELECT … FOR UPDATE
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS dblink;
-- saldo de teste isolado: PA2 em A3, DISPONIBLE = 10
INSERT INTO stock_balances (id, company_id, product_id, warehouse_id, stock_state, quantity)
  VALUES ('aaaaaaaa-0000-0000-0000-000000002099','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000e2','aaaaaaaa-0000-0000-0000-0000000000d3','DISPONIBLE',10);

-- Rodada 1: sessão C1 trava a linha; NOWAIT na sessão principal falha; C2 espera no FOR UPDATE e,
-- ao ser liberada, enxerga o valor JÁ debitado por C1 (2), não o antigo (10) -> a app recusa a saída de 8.
SELECT dblink_connect('c1', format('dbname=%s port=%s host=%s application_name=dn_p005_c1', current_database(), current_setting('port'), split_part(current_setting('unix_socket_directories'), ',', 1)));
SELECT dblink_connect('c2', format('dbname=%s port=%s host=%s application_name=dn_p005_c2', current_database(), current_setting('port'), split_part(current_setting('unix_socket_directories'), ',', 1)));
SELECT dblink_exec('c1', 'BEGIN');
SELECT * FROM dblink('c1', $$SELECT 1 FROM stock_balances WHERE id='aaaaaaaa-0000-0000-0000-000000002099' FOR UPDATE$$) AS t(travou int);   -- C1 segura o lock até o COMMIT
SELECT expect_error('CONC linha travada por C1: FOR UPDATE NOWAIT da sessão principal falha (55P03)',
  $$SELECT 1 FROM stock_balances WHERE id='aaaaaaaa-0000-0000-0000-000000002099' FOR UPDATE NOWAIT$$, '55P03');
SELECT dblink_send_query('c2', $$SELECT quantity FROM stock_balances WHERE id='aaaaaaaa-0000-0000-0000-000000002099' FOR UPDATE$$) AS c2_enviou;
DO $$
DECLARE i int := 0;
BEGIN
  LOOP
    EXIT WHEN EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name = 'dn_p005_c2' AND wait_event_type = 'Lock');
    i := i + 1;
    IF i > 100 THEN RAISE EXCEPTION 'TESTE FALHOU [CONC]: C2 não ficou bloqueada esperando o lock de C1'; END IF;
    PERFORM pg_sleep(0.05);
  END LOOP;
  RAISE NOTICE 'OK   [CONC C2 ficou BLOQUEADA aguardando C1 (wait_event_type=Lock)]';
END $$;
SELECT dblink_exec('c1', $$UPDATE stock_balances SET quantity = quantity - 8 WHERE id='aaaaaaaa-0000-0000-0000-000000002099'$$);
SELECT dblink_exec('c1', 'COMMIT');
DO $$
DECLARE q numeric;
BEGIN
  SELECT t.quantity INTO q FROM dblink_get_result('c2') AS t(quantity numeric);
  IF q IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'TESTE FALHOU [CONC]: após o commit de C1, C2 deveria ler saldo 2, leu %', q;
  END IF;
  RAISE NOTICE 'OK   [CONC C2 liberada leu o saldo ATUAL (2) e pode recusar a saída de 8]';
END $$;
SELECT * FROM dblink_get_result('c2') AS t(quantity numeric);   -- drena o fim do resultado de C2
SELECT expect_count('CONC saldo final da rodada 1 = 2', $$SELECT 1 FROM stock_balances WHERE id='aaaaaaaa-0000-0000-0000-000000002099' AND quantity = 2$$, 1);

-- Rodada 2: sem FOR UPDATE, duas saídas concorrentes de 8 sobre saldo 10 -> a segunda é barrada pelo CHECK (saldo >= 0).
UPDATE stock_balances SET quantity = 10 WHERE id='aaaaaaaa-0000-0000-0000-000000002099';
SELECT dblink_exec('c1', 'BEGIN');
SELECT dblink_exec('c1', $$UPDATE stock_balances SET quantity = quantity - 8 WHERE id='aaaaaaaa-0000-0000-0000-000000002099'$$);   -- C1 segura o lock da linha
SELECT dblink_send_query('c2', $$UPDATE stock_balances SET quantity = quantity - 8 WHERE id='aaaaaaaa-0000-0000-0000-000000002099'$$) AS c2_enviou;
DO $$
DECLARE i int := 0;
BEGIN
  LOOP
    EXIT WHEN EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name = 'dn_p005_c2' AND wait_event_type = 'Lock');
    i := i + 1;
    IF i > 100 THEN RAISE EXCEPTION 'TESTE FALHOU [CONC]: C2 não ficou bloqueada (rodada 2)'; END IF;
    PERFORM pg_sleep(0.05);
  END LOOP;
END $$;
SELECT dblink_exec('c1', 'COMMIT');
SELECT expect_error('CONC segunda saída concorrente de 8 sobre saldo 2 é barrada pelo CHECK (saldo nunca negativo)',
  $$SELECT * FROM dblink_get_result('c2') AS t(r text)$$, '23514');
SELECT expect_count('CONC saldo final da rodada 2 = 2 (só uma saída valeu)', $$SELECT 1 FROM stock_balances WHERE id='aaaaaaaa-0000-0000-0000-000000002099' AND quantity = 2$$, 1);
SELECT dblink_disconnect('c1');
SELECT dblink_disconnect('c2');
DROP EXTENSION dblink;

\echo 'TESTE-P005: TODOS OS CASOS PASSARAM'
