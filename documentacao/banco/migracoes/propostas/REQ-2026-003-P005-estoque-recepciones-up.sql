-- =============================================================================
-- REQ-2026-003-P005-estoque-recepciones-up.sql — PROPOSTA — NÃO EXECUTAR EM BANCO REAL
-- Objetivo : estoque e recepções de compra em INGLÊS, multiempresa:
--            stock_lots, stock_balances, inventory_movements,
--            inventory_movement_lines, goods_receipts, goods_receipt_lines.
-- Origem   : REQ-2026-003; REQ-2026-002 (DESENHO §6.3, §6.4, §6.4.1 D-08, §6.5,
--            D-09/D-11); documentacao/banco/levantamento/campos/ESTOQUE-COMPRAS.md
--            (STK-*, MOV-*, REC-*, DIV-*, Q-*).
-- Dialeto  : PostgreSQL >= 14 (sem NULLS NOT DISTINCT: a unicidade do saldo usa
--            índice com COALESCE). Validado só em PG 16 descartável (dn_p005).
-- Situação : DEFINIÇÃO DE ESTRUTURA-ALVO (greenfield). NÃO é migration pronta:
--            o esquema real está NAO_VERIFICADO e o módulo é DEMONSTRATIVO
--            (hoje tudo vive em localStorage; não existe SQL de estoque).
-- Depende de: P001 (companies, branches, warehouses, users; app_company_id(),
--            set_updated_at()); P003 (products, suppliers — contrato:
--            unique (company_id, id) em ambas). Nada de P002/P004/P006 é usado.
--            NÃO cria stock_transfers nem operation_authorizations (ver §11).
-- Pós-valid: documentacao/banco/validacoes/TESTE-P005-estoque-recepciones.sql
-- Impacto API: nenhum até o código passar a usar estes nomes. Hoje não há API de
--            estoque; POST /api/movimientos-stock e POST /api/recepciones são
--            propostos (MOV-029, REC-021) e DEVEM gravar recepção + movimentos +
--            saldos em UMA transação (DIV-11), travando as linhas de saldo com
--            SELECT … FOR UPDATE (DIV-05). company_id/created_by vêm da sessão.
-- Rollback : REQ-2026-003-P005-estoque-recepciones-down.sql — só banco DESCARTÁVEL.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Convenções desta proposta
-- ---------------------------------------------------------------------------
-- * Quantidades: numeric(18,4). A tela aceita 3 casas (step=0.001); a 4ª dá folga
--   para conversão de unidade (ESTOQUE-COMPRAS.md, "Modelo-alvo").
-- * Custo: numeric(18,4). A tela mostra Gs. sem decimais, mas o input de custo não
--   restringe casas e o custo médio/moeda estrangeira exigem decimais (REC-031).
--   NÃO há coluna de moeda: o documento não captura moeda (DIV-21, Q-10) -> PENDÊNCIA.
-- * Códigos de domínio (REGISTRADO, DISPONIBLE, PROPIO…) ficam EXATAMENTE como no
--   código, sem tradução.
-- * Dados desnormalizados do DEMO (código/nome de produto, depósito, fornecedor,
--   unidade; MOV-009..017, REC-007/008/012/013/024..027, STK-003..013) NÃO têm
--   coluna: resolvem-se por JOIN (Q-12 pergunta se haverá snapshot -> PENDÊNCIA).
-- * Derivados NÃO persistidos: total_units/total_cost/pending_quantity/line_total
--   (REC-017/018/030/032, "persistir só se auditoria exigir: DEFINIR"), total
--   físico/virtual, nível, valor de inventário (STK-022/023/027/029).
-- * Permissões sensíveis (REQ-2026-002): a proteção é da camada de dados, não do SQL.

-- ---------------------------------------------------------------------------
-- 1. stock_lots  (atual: StockLoteDemo embutido em StockDemo.lotes — STK-045..047, STK-082)
-- ---------------------------------------------------------------------------
CREATE TABLE stock_lots (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES companies(id),
  product_id  uuid        NOT NULL,                                   -- STK-082
  lot_code    text        NOT NULL,                                   -- STK-046: texto livre, sem formato no código
  expiry_date date,                                                   -- STK-047: '' no código = NULL
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_lots_company_id_id_key UNIQUE (company_id, id),
  -- Permite FK composta (company_id, product_id, lot_id): o lote só pode ser usado
  -- com o PRÓPRIO produto (o DEMO garante isso pelo aninhamento do array, STK-082).
  CONSTRAINT stock_lots_company_product_id_key UNIQUE (company_id, product_id, id),
  CONSTRAINT stock_lots_company_product_code_key UNIQUE (company_id, product_id, lot_code),  -- STK-046
  -- No código lote '' significa "sem lote" (movimientos-stock-storage.ts:244-247);
  -- por isso um lote real não pode ter código vazio.
  CONSTRAINT stock_lots_code_chk CHECK (length(btrim(lot_code)) > 0),
  CONSTRAINT stock_lots_product_fk FOREIGN KEY (company_id, product_id) REFERENCES products (company_id, id)
);
-- DEFINIR (STK-047/DIV-23): vencimento obrigatório quando o produto exige
-- (requiereVencimiento) e lote obrigatório para stock_control_mode='LOTE' — o código
-- NÃO aplica; sem CHECK aqui (a regra depende de colunas de products, P003).

-- ---------------------------------------------------------------------------
-- 2. stock_balances  (atual: StockDemo + depositos[] — STK-001, 018..021, 024, 025, 032, 034, 036, 040..043, 048, 049, 081)
-- ---------------------------------------------------------------------------
-- SALDO MATERIALIZADO por (produto, depósito, estado, lote, propriedade, proprietário).
-- Fonte da verdade = movimentos; este saldo é atualizado na mesma transação do
-- movimento, com a linha travada (SELECT … FOR UPDATE), e deve ser reconstruível
-- pela soma dos movimentos (V-MIG, fora desta proposta).
-- DIVERGÊNCIA com o mapeamento: o resumo sugere PK natural; aqui vale o padrão do
-- projeto (id uuid + unique (company_id, id)) e a chave natural vira índice único.
CREATE TABLE stock_balances (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid          NOT NULL REFERENCES companies(id),
  product_id   uuid          NOT NULL,                                -- STK-002
  warehouse_id uuid          NOT NULL,                                -- STK-036 / STK-050 (texto->FK)
  -- STK-018..021/049: 4 estados do código. Os 5 estados da transferência D-08
  -- (EN_TRANSITO, RECIBIDA, RECIBIDA_CON_DIFERENCIA, CANCELADA, CONCILIADA) NÃO
  -- são estados de SALDO e não entram aqui. Q-03 (a 'diferencia en tránsito' seria
  -- um 5º estado de saldo?) está em aberto -> se sim, altera este CHECK.
  stock_state  text          NOT NULL,
  lot_id       uuid,                                                  -- STK-081: NULL = produto sem lote
  ownership    text          NOT NULL DEFAULT 'PROPIO',               -- STK-024
  owner_id     uuid,                                                  -- STK-025: DEFINIR qual cadastro (Q-06) -> sem FK
  quantity     numeric(18,4) NOT NULL DEFAULT 0,                      -- saldo; >= 0 (regra: o código valida suficiência antes de debitar)
  created_at   timestamptz   NOT NULL DEFAULT now(),
  updated_at   timestamptz   NOT NULL DEFAULT now(),                  -- STK-034
  CONSTRAINT stock_balances_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT stock_balances_state_chk CHECK (stock_state IN ('DISPONIBLE','RESERVADO','CUARENTENA','TRANSITO')),
  CONSTRAINT stock_balances_ownership_chk CHECK (ownership IN ('PROPIO','TERCERO')),
  -- SALDO NUNCA NEGATIVO: o código bloqueia com erro de texto toda saída sem saldo
  -- suficiente (Regras confirmadas 5, 7). O DEMO escondia negativos com Math.max(0,…)
  -- (DIV-05); no alvo o CHECK impede o negativo e o servidor valida por depósito.
  CONSTRAINT stock_balances_qty_chk CHECK (quantity >= 0),
  -- STK-025: "NULL quando PROPIO". Obrigatoriedade de owner_id em TERCERO é DEFINIR (Q-06).
  CONSTRAINT stock_balances_owner_chk CHECK (ownership <> 'PROPIO' OR owner_id IS NULL),
  CONSTRAINT stock_balances_product_fk   FOREIGN KEY (company_id, product_id)   REFERENCES products (company_id, id),
  CONSTRAINT stock_balances_warehouse_fk FOREIGN KEY (company_id, warehouse_id) REFERENCES warehouses (company_id, id),
  -- (company_id, product_id, lot_id): o lote tem de ser do produto. Com lot_id NULL
  -- a FK não é avaliada (MATCH SIMPLE) = produto sem lote.
  CONSTRAINT stock_balances_lot_fk FOREIGN KEY (company_id, product_id, lot_id) REFERENCES stock_lots (company_id, product_id, id)
);
-- Chave natural (STK-001): lot_id e owner_id podem ser NULL, e NULLs são distintos
-- num UNIQUE comum; COALESCE para o uuid nulo (nunca gerado por gen_random_uuid()).
CREATE UNIQUE INDEX stock_balances_natural_key ON stock_balances (
  company_id, product_id, warehouse_id, stock_state,
  COALESCE(lot_id,   '00000000-0000-0000-0000-000000000000'::uuid),
  ownership,
  COALESCE(owner_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX stock_balances_warehouse_idx ON stock_balances (company_id, warehouse_id);

-- ---------------------------------------------------------------------------
-- 3. inventory_movements  (atual: MovimientoStockDemo — cabeçalho; MOV-001..007, 012..017, 024..028, 030..032)
-- ---------------------------------------------------------------------------
CREATE TABLE inventory_movements (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),   -- MOV-001
  company_id               uuid        NOT NULL REFERENCES companies(id),       -- MOV-030
  movement_number          text        NOT NULL,                                -- MOV-002 (sequência por empresa no servidor; DEFINIR por sucursal, Q-11)
  movement_type            text        NOT NULL,                                -- MOV-003 (sem DEFAULT: o 'ENTRADA' da tela é só default de UI)
  source_type              text        NOT NULL,                                -- MOV-004 ("origen" do código = TIPO de origem, não depósito)
  status                   text        NOT NULL DEFAULT 'REGISTRADO',           -- MOV-005
  movement_date            date        NOT NULL,                                -- MOV-006: data de negócio (DIV-19: fuso da empresa, DEFINIR)
  movement_time            time        NOT NULL,                                -- MOV-007: hora local de negócio; o instante real é created_at
  branch_id                uuid,                                                -- MOV-031: DEFINIR se persiste -> nullable
  source_warehouse_id      uuid,                                                -- MOV-012
  destination_warehouse_id uuid,                                                -- MOV-015
  reference_document       text,                                                -- MOV-024: texto livre ('' = NULL); sem FK (ver §4 sobre o vínculo estruturado)
  reason                   text,                                                -- MOV-025: opcional no código, inclusive em AJUSTE_* (D-09/D-11 exigiriam: DEFINIR)
  notes                    text,                                                -- MOV-026
  authorization_id         uuid,                                                -- MOV-032: DEFINIR (Q-04); operation_authorizations NÃO existe nesta proposta -> sem FK
  created_by               uuid        NOT NULL,                                -- MOV-027 (hoje literal 'admin'; no alvo vem da sessão)
  created_at               timestamptz NOT NULL DEFAULT now(),                  -- MOV-028
  updated_at               timestamptz NOT NULL DEFAULT now(),                  -- só muda na anulação (REGISTRADO -> ANULADO)
  CONSTRAINT inventory_movements_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT inventory_movements_number_key UNIQUE (company_id, movement_number),
  CONSTRAINT inventory_movements_number_chk CHECK (movement_number ~ '^MOV-[0-9]{6}$'),   -- MOV-002 (6 dígitos: teto 999999 por empresa; DEFINIR reinício, regra 10)
  CONSTRAINT inventory_movements_type_chk CHECK (movement_type IN
    ('ENTRADA','SALIDA','TRANSFERENCIA','AJUSTE_POSITIVO','AJUSTE_NEGATIVO','RESERVA',
     'LIBERACION_RESERVA','CUARENTENA','LIBERACION_CUARENTENA')),                         -- 9 valores do código
  CONSTRAINT inventory_movements_source_type_chk CHECK (source_type IN
    ('MANUAL','COMPRA','VENTA','DEVOLUCION','TRANSFERENCIA','AJUSTE','INVENTARIO')),      -- DIV-16: coerência tipo x origen NÃO é validada no código -> sem CHECK cruzado (DEFINIR)
  CONSTRAINT inventory_movements_status_chk CHECK (status IN ('REGISTRADO','ANULADO')),    -- só 2 no código; estados D-08 NÃO entram aqui
  -- Matriz tipo x depósitos (Regras confirmadas 2; DIV-14/15): a UI exige origem para
  -- SALIDA/TRANSFERENCIA/RESERVA/LIBERACION_RESERVA/CUARENTENA/LIBERACION_CUARENTENA/
  -- AJUSTE_NEGATIVO e destino para ENTRADA/TRANSFERENCIA/AJUSTE_POSITIVO; o mapeamento
  -- manda aplicar no servidor e gravar origem/destino SÓ quando o tipo exige (DIV-14).
  CONSTRAINT inventory_movements_warehouses_chk CHECK (
    (source_warehouse_id IS NOT NULL) = (movement_type IN
      ('SALIDA','TRANSFERENCIA','RESERVA','LIBERACION_RESERVA','CUARENTENA','LIBERACION_CUARENTENA','AJUSTE_NEGATIVO'))
    AND
    (destination_warehouse_id IS NOT NULL) = (movement_type IN ('ENTRADA','TRANSFERENCIA','AJUSTE_POSITIVO'))
  ),
  -- Regras confirmadas 2: TRANSFERENCIA exige origem != destino.
  CONSTRAINT inventory_movements_transfer_chk CHECK (
    movement_type <> 'TRANSFERENCIA' OR source_warehouse_id <> destination_warehouse_id),
  CONSTRAINT inventory_movements_branch_fk FOREIGN KEY (company_id, branch_id)               REFERENCES branches (company_id, id),
  CONSTRAINT inventory_movements_src_wh_fk FOREIGN KEY (company_id, source_warehouse_id)      REFERENCES warehouses (company_id, id),
  CONSTRAINT inventory_movements_dst_wh_fk FOREIGN KEY (company_id, destination_warehouse_id) REFERENCES warehouses (company_id, id),
  CONSTRAINT inventory_movements_created_by_fk FOREIGN KEY (company_id, created_by)           REFERENCES users (company_id, id)
);
CREATE INDEX inventory_movements_date_idx ON inventory_movements (company_id, movement_date);
CREATE INDEX inventory_movements_type_idx ON inventory_movements (company_id, movement_type);
CREATE INDEX inventory_movements_src_wh_idx ON inventory_movements (company_id, source_warehouse_id) WHERE source_warehouse_id IS NOT NULL;
CREATE INDEX inventory_movements_dst_wh_idx ON inventory_movements (company_id, destination_warehouse_id) WHERE destination_warehouse_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. inventory_movement_lines  (MOV-008, 018..022, 041)
-- ---------------------------------------------------------------------------
-- Hoje 1 produto por movimento (Regras confirmadas 1); N linhas por movimento é
-- DEFINIR (Q-07): a tabela permite N, sem UNIQUE por movimento.
-- Linha IMUTÁVEL: sem updated_at (nunca é atualizada; ver §8).
CREATE TABLE inventory_movement_lines (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid          NOT NULL REFERENCES companies(id),
  movement_id           uuid          NOT NULL,                       -- MOV-041
  product_id            uuid          NOT NULL,                       -- MOV-008
  quantity              numeric(18,4) NOT NULL,                       -- MOV-018: sempre positiva; o sinal vem do tipo
  lot_id                uuid,                                         -- MOV-019
  expiry_date           date,                                         -- MOV-020 (ou só em stock_lots: DEFINIR)
  ownership             text          NOT NULL DEFAULT 'PROPIO',      -- MOV-021
  owner_id              uuid,                                         -- MOV-022: DEFINIR (Q-06) -> sem FK
  -- VÍNCULO ESTRUTURADO recepção -> movimento (REC-037, DEFINIR): hoje o código liga só
  -- pelo texto do número REC em reference_document. Coluna ANULÁVEL e DEFINIR; o índice
  -- único parcial abaixo garante que uma linha de recepção gera estoque UMA vez
  -- (idempotência de recepção, DIV-11).
  goods_receipt_line_id uuid,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT inventory_movement_lines_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT inventory_movement_lines_qty_chk CHECK (quantity > 0),                              -- MOV-018
  CONSTRAINT inventory_movement_lines_ownership_chk CHECK (ownership IN ('PROPIO','TERCERO')),   -- MOV-021
  CONSTRAINT inventory_movement_lines_owner_chk CHECK (ownership <> 'PROPIO' OR owner_id IS NULL),
  CONSTRAINT inventory_movement_lines_movement_fk FOREIGN KEY (company_id, movement_id) REFERENCES inventory_movements (company_id, id),
  CONSTRAINT inventory_movement_lines_product_fk  FOREIGN KEY (company_id, product_id)  REFERENCES products (company_id, id),
  CONSTRAINT inventory_movement_lines_lot_fk      FOREIGN KEY (company_id, product_id, lot_id) REFERENCES stock_lots (company_id, product_id, id)
);
-- (a FK goods_receipt_line_id -> goods_receipt_lines é adicionada no fim de §6, quando a tabela já existe)
CREATE INDEX inventory_movement_lines_movement_idx ON inventory_movement_lines (company_id, movement_id);
CREATE INDEX inventory_movement_lines_product_idx  ON inventory_movement_lines (company_id, product_id);
CREATE UNIQUE INDEX inventory_movement_lines_receipt_line_key
  ON inventory_movement_lines (company_id, goods_receipt_line_id) WHERE goods_receipt_line_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. goods_receipts  (atual: RecepcionDemo — REC-001..006, 009..011, 014, 015, 019, 020, 035, 036)
-- ---------------------------------------------------------------------------
CREATE TABLE goods_receipts (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),   -- REC-001
  company_id               uuid        NOT NULL REFERENCES companies(id),       -- REC-035
  receipt_number           text        NOT NULL,                                -- REC-002 (sequência por empresa no servidor; Q-11)
  status                   text        NOT NULL DEFAULT 'RECIBIDA',             -- REC-003: única criada pelo código; BORRADOR/ANULADA sem fluxo (DIV-10, Q-13)
  receipt_date             date        NOT NULL,                                -- REC-004 (DIV-19)
  receipt_time             time        NOT NULL,                                -- REC-005
  branch_id                uuid,                                                -- REC-036: DEFINIR se persiste -> nullable (coerente com o depósito se informada: trigger §9)
  warehouse_id             uuid        NOT NULL,                                -- REC-011 (deve ∈ D(u) — checado na camada de dados, §6.4)
  supplier_id              uuid        NOT NULL,                                -- REC-006
  purchase_order_id        uuid,                                                -- REC-009: DEFINIR; purchase_orders NÃO existe (/ordenes sem página) -> sem FK
  purchase_order_number    text,                                                -- REC-010: texto livre
  supplier_document_number text,                                                -- REC-014: UQ por fornecedor NÃO provada -> sem UNIQUE (DEFINIR)
  notes                    text,                                                -- REC-015
  created_by               uuid        NOT NULL,                                -- REC-019
  created_at               timestamptz NOT NULL DEFAULT now(),                  -- REC-020
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT goods_receipts_company_id_id_key UNIQUE (company_id, id),
  -- IDEMPOTÊNCIA DE RECEPÇÃO (chave natural): o mesmo número não entra duas vezes
  -- na empresa; um reenvio da mesma recepção falha em vez de duplicar o estoque.
  CONSTRAINT goods_receipts_number_key UNIQUE (company_id, receipt_number),
  CONSTRAINT goods_receipts_number_chk CHECK (receipt_number ~ '^REC-[0-9]{6}$'),
  -- 'RECIBIDA' também é estado de transferência (D-08), mas em OUTRA tabela (REC-003).
  CONSTRAINT goods_receipts_status_chk CHECK (status IN ('BORRADOR','RECIBIDA','ANULADA')),
  CONSTRAINT goods_receipts_branch_fk    FOREIGN KEY (company_id, branch_id)    REFERENCES branches (company_id, id),
  CONSTRAINT goods_receipts_warehouse_fk FOREIGN KEY (company_id, warehouse_id) REFERENCES warehouses (company_id, id),
  CONSTRAINT goods_receipts_supplier_fk  FOREIGN KEY (company_id, supplier_id)  REFERENCES suppliers (company_id, id),
  CONSTRAINT goods_receipts_created_by_fk FOREIGN KEY (company_id, created_by)  REFERENCES users (company_id, id)
);
CREATE INDEX goods_receipts_date_idx     ON goods_receipts (company_id, receipt_date);
CREATE INDEX goods_receipts_supplier_idx ON goods_receipts (company_id, supplier_id);
CREATE INDEX goods_receipts_warehouse_idx ON goods_receipts (company_id, warehouse_id);

-- ---------------------------------------------------------------------------
-- 6. goods_receipt_lines  (atual: RecepcionItemDemo — REC-016, 022, 023, 028, 029, 031, 033, 034, 058)
-- ---------------------------------------------------------------------------
CREATE TABLE goods_receipt_lines (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),   -- REC-022
  company_id       uuid          NOT NULL REFERENCES companies(id),
  goods_receipt_id uuid          NOT NULL,                                -- REC-058
  product_id       uuid          NOT NULL,                                -- REC-023
  ordered_quantity numeric(18,4) NOT NULL DEFAULT 0,                      -- REC-028: digitada à mão, sem OC (DIV-22); não limita a recebida
  received_quantity numeric(18,4) NOT NULL,                               -- REC-029: vira a quantity do movimento ENTRADA (o 1 do form é só default de UI)
  -- SENSIVEL: PRODUCTOS_COSTO.VER (custo; DEFINIR se a recepção reutiliza esta permissão)
  unit_cost        numeric(18,4) NOT NULL,                                -- REC-031: sem moeda (PENDÊNCIA); default de UI = products.average_cost
  lot_id           uuid,                                                  -- REC-033: obrigatório p/ produto LOTE NÃO validado no código
  expiry_date      date,                                                  -- REC-034
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT goods_receipt_lines_company_id_id_key UNIQUE (company_id, id),
  -- REC-023 / Regras confirmadas 12: o mesmo produto não se repete na recepção (regra de UI aplicada no servidor).
  CONSTRAINT goods_receipt_lines_product_key UNIQUE (company_id, goods_receipt_id, product_id),
  CONSTRAINT goods_receipt_lines_ordered_chk  CHECK (ordered_quantity >= 0),
  CONSTRAINT goods_receipt_lines_received_chk CHECK (received_quantity > 0),
  CONSTRAINT goods_receipt_lines_cost_chk     CHECK (unit_cost >= 0),
  CONSTRAINT goods_receipt_lines_receipt_fk FOREIGN KEY (company_id, goods_receipt_id) REFERENCES goods_receipts (company_id, id),
  CONSTRAINT goods_receipt_lines_product_fk FOREIGN KEY (company_id, product_id)       REFERENCES products (company_id, id),
  CONSTRAINT goods_receipt_lines_lot_fk     FOREIGN KEY (company_id, product_id, lot_id) REFERENCES stock_lots (company_id, product_id, id)
);
CREATE INDEX goods_receipt_lines_product_idx ON goods_receipt_lines (company_id, product_id);

-- FK adiada de §4 (goods_receipt_lines ainda não existia lá). FK composta: a linha de
-- recepção e a linha de movimento têm de ser da mesma empresa.
ALTER TABLE inventory_movement_lines
  ADD CONSTRAINT inventory_movement_lines_receipt_line_fk
  FOREIGN KEY (company_id, goods_receipt_line_id) REFERENCES goods_receipt_lines (company_id, id);

-- ---------------------------------------------------------------------------
-- 7. updated_at automático
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stock_lots','stock_balances','inventory_movements','goods_receipts','goods_receipt_lines'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t||'_set_updated_at', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 8. IMUTABILIDADE de inventory_movements e inventory_movement_lines
-- ---------------------------------------------------------------------------
-- Fonte da verdade do histórico (ESTOQUE-COMPRAS.md "Fonte da verdade × derivado"):
-- "imutáveis; correção = novo movimento / anulação". Portanto:
--  * DELETE proibido (anulação é por ESTADO: status REGISTRADO -> ANULADO);
--  * UPDATE só pode trocar status REGISTRADO -> ANULADO (e updated_at); ANULADO é final;
--  * linhas: sem UPDATE e sem DELETE; INSERT só em movimento REGISTRADO.
-- O que a anulação faz com o SALDO (estorno por movimento inverso ou não) é DEFINIR
-- (DIV-09, regra 3): este SQL NÃO altera stock_balances por conta própria.
-- Quem anulou/quando/por quê não está mapeado -> PENDÊNCIA (trilha de auditoria externa).
CREATE OR REPLACE FUNCTION inventory_movements_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'inventory_movements é imutável: use status ANULADO em vez de DELETE (movimento %)', OLD.movement_number
      USING ERRCODE = 'P0001';
  END IF;
  -- UPDATE: qualquer coluna que não seja status/updated_at é imutável.
  IF (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at') THEN
    RAISE EXCEPTION 'inventory_movements é imutável: só status pode mudar (movimento %)', OLD.movement_number
      USING ERRCODE = 'P0001';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status = 'REGISTRADO' AND NEW.status = 'ANULADO') THEN
    RAISE EXCEPTION 'transição de status inválida: % -> % (só REGISTRADO -> ANULADO)', OLD.status, NEW.status
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inventory_movements_guard_trg
  BEFORE UPDATE OR DELETE ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION inventory_movements_guard();

CREATE OR REPLACE FUNCTION inventory_movement_lines_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE s text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT status INTO s FROM inventory_movements WHERE company_id = NEW.company_id AND id = NEW.movement_id;
    -- movimento inexistente / de outra empresa: não é com este guard; quem recusa é a FK composta (23503).
    IF FOUND AND s <> 'REGISTRADO' THEN
      RAISE EXCEPTION 'não é possível acrescentar linha a movimento em estado %', s
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'inventory_movement_lines é imutável (% proibido)', TG_OP USING ERRCODE = 'P0001';
END $$;
CREATE TRIGGER inventory_movement_lines_guard_trg
  BEFORE INSERT OR UPDATE OR DELETE ON inventory_movement_lines
  FOR EACH ROW EXECUTE FUNCTION inventory_movement_lines_guard();
-- DEFINIR (Q-07): se um movimento REGISTRADO pode receber linhas depois de criado
-- (hoje é 1 produto por movimento, gravado de uma vez). O guard acima só bloqueia
-- movimento ANULADO; fechar a janela exige decisão (ex.: criar linhas só na transação do cabeçalho).

-- ---------------------------------------------------------------------------
-- 9. Coerência sucursal x depósito na recepção (REC-036)
-- ---------------------------------------------------------------------------
-- REC-036: "coerente com warehouses.branch_id". Só vale quando branch_id é informada.
-- (Para inventory_movements NÃO se aplica: MOV-031 diz que em transferência entre
-- sucursais há duas -> DEFINIR; ver PENDÊNCIAS.)
CREATE OR REPLACE FUNCTION goods_receipts_check_branch() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE wb uuid;
BEGIN
  IF NEW.branch_id IS NOT NULL THEN
    SELECT branch_id INTO wb FROM warehouses WHERE company_id = NEW.company_id AND id = NEW.warehouse_id;
    -- depósito ou sucursal inexistente na empresa: quem recusa é a FK composta (23503), não este trigger.
    IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM branches WHERE company_id = NEW.company_id AND id = NEW.branch_id) THEN
      RETURN NEW;
    END IF;
    IF wb IS DISTINCT FROM NEW.branch_id THEN
      RAISE EXCEPTION 'branch_id da recepção difere da sucursal do depósito' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER goods_receipts_check_branch_trg
  BEFORE INSERT OR UPDATE OF branch_id, warehouse_id ON goods_receipts
  FOR EACH ROW EXECUTE FUNCTION goods_receipts_check_branch();

-- ---------------------------------------------------------------------------
-- 10. Row Level Security (padrão P001 §10)
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stock_lots','stock_balances','inventory_movements','inventory_movement_lines',
                           'goods_receipts','goods_receipt_lines'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY %I ON %I USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id())$p$,
                   t||'_tenant_isolation', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 11. NÃO MODELADO nesta proposta (decisão, não esquecimento)
-- ---------------------------------------------------------------------------
-- * stock_transfers (D-08): os 5 estados EN_TRANSITO, RECIBIDA, RECIBIDA_CON_DIFERENCIA,
--   CANCELADA, CONCILIADA são SÓ DESENHO — não existem em tela, tipo ou storage
--   (DIV-08). Não foram misturados em movement_type, status de movimento ou
--   stock_state. Falta decidir (Q-02, Q-03): relação com inventory_movements e a
--   'diferencia en tránsito'. TRANSFERENCIA do código = uma etapa, mesma sucursal.
-- * operation_authorizations (D-09/D-11): authorization_id existe sem FK (MOV-032).
-- * stock_reservations (Q-05) e labeled_units: sem tela -> não propostos.
-- * purchase_orders / purchase_order_lines (Q-14): purchase_order_id sem FK.
-- * Localização interna do depósito (STK-039, 'ubicacion'): sem entidade.
--
-- =============================================================================
-- PENDÊNCIAS DE DEFINIÇÃO
-- =============================================================================
-- P-01 Q-02/Q-03 Transferência D-08 (5 estados, etapas -> movimentos, 'diferencia en tránsito' como 5º stock_state?).
-- P-02 Q-04/MOV-032 Ajuste crítico: movimento só após aprovação ou com status pendente? FK de authorization_id.
-- P-03 DIV-09/regra 3 Anulação de movimento: estorna saldo? movimento inverso? lote? recepção de origem? Quem/quando/motivo (sem colunas).
-- P-04 Q-06/STK-025/MOV-022 owner_id: qual cadastro (cliente, fornecedor, terceiro)? obrigatório em TERCERO? valorização exclui terceiros (DIV-34).
-- P-05 Q-07 N linhas por movimento? E acrescentar linha a movimento REGISTRADO.
-- P-06 Q-10/DIV-21 Moeda do custo e fórmula de custo médio; unit_cost sem moeda. SENSIVEL: PRODUCTOS_COSTO.VER (confirmar).
-- P-07 Q-11/DIV-20 Numeração MOV-/REC-: por empresa, sucursal ou depósito? Reinício? (CHECK atual = 6 dígitos).
-- P-08 Q-12 Snapshot de código/descrição no documento, ou sempre JOIN?
-- P-09 Q-13/DIV-10 Recepção: BORRADOR e ANULADA são requisitos reais? Anular estorna a entrada?
-- P-10 Q-14/DIV-22 Módulo de ordens de compra; purchase_order_id sem FK; ordered_quantity manual.
-- P-11 REC-014 Unicidade de supplier_document_number por fornecedor (não provada).
-- P-12 REC-037 Vínculo recepção -> movimento (goods_receipt_line_id é proposta anulável).
-- P-13 MOV-031/REC-036 branch_id persiste? Em movimento não há coerência com depósito (transferência entre sucursais).
-- P-14 DIV-19 Fuso da empresa para movement_date/movement_time/receipt_date/receipt_time.
-- P-15 DIV-16 Coerência movement_type x source_type (sem CHECK cruzado).
-- P-16 DIV-23/STK-047 Lote/vencimento obrigatórios por stock_control_mode/requiereVencimiento (depende de colunas de products).
-- P-17 Q-09/DIV-28 Mínimo/máximo/reposição globais ou por depósito (pertence a products / product_warehouse_settings).
-- P-18 Q-01 Granularidade de stock_balances (ownership/owner_id/lote em todo produto ou só LOTE?).
-- P-19 Totais da recepção e do saldo (total_units, total_cost, pending_quantity, line_total, totalFisico, nível, valor): não persistidos.
-- P-20 product_units / unidade de medida: nenhuma coluna de unidade foi mapeada nas linhas (vem por JOIN a products); quantidade na unidade base — confirmar.
-- P-21 DIV-30 Escopo por depósito D(u) e permissões MOVIMIENTOS_STOCK.CREAR/ANULAR, AJUSTES_STOCK.*: camada de dados, não SQL.

COMMIT;
