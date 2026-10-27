-- =============================================================================
-- REQ-2026-003-P007-custeio-up.sql — PROPOSTA — NÃO EXECUTAR EM BANCO REAL
-- Objetivo : custo médio ponderado móvel (DEC-003-02), custo histórico congelado nas
--            saídas e vendas (DEC-003-01/02) e as bases dos relatórios de estoque
--            valorizado e de vendas ao custo. Responde R01-F-003 e R01-F-007.
-- Origem   : REQ-2026-003; DECISOES-REQ-2026-003-CUSTEIO-E-ENTREGA-REAL.md;
--            AUD-REQ-2026-003-R01; levantamento/CUSTEIO-V1.md (fórmulas e exemplos).
-- Dialeto  : PostgreSQL >= 15 (views com security_invoker). Validado só em PG 16
--            descartável.
-- Situação : ESTRUTURA-ALVO (greenfield). NÃO é migration pronta: o esquema real
--            está NAO_VERIFICADO e o legado não tem saldo, custo histórico nem vendas
--            persistidas. Nenhum custo é inventado para dados antigos.
-- Depende de: P001 (companies), P002 (currencies), P003 (products), P005
--            (stock_balances, inventory_movements, inventory_movement_lines),
--            P006 (invoices, invoice_lines).
-- Pós-valid: documentacao/banco/validacoes/TESTE-P007-custeio.sql
-- Impacto API: nenhum até existir API de movimentos. Quando existir, TODA gravação de
--            linha de movimento valorizável deve passar por inventory_post_line()
--            (saldo + custo + linha na MESMA transação) e o papel da aplicação não deve
--            ter UPDATE direto em inventory_costs nem stock_balances (fase de implementação).
-- Rollback : REQ-2026-003-P007-custeio-down.sql — só banco DESCARTÁVEL.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Moeda base da empresa e casas decimais por moeda (R01-F-007)
-- ---------------------------------------------------------------------------
-- Todo custo e todo valor de estoque é guardado NA MOEDA BASE DA EMPRESA. Compra em
-- outra moeda é convertida pelo chamador antes de gravar (fonte e data da taxa:
-- DEFINIR). Nunca se soma moedas diferentes.
ALTER TABLE companies
  ADD COLUMN base_currency_code text NOT NULL DEFAULT 'PYG' REFERENCES currencies (code);
COMMENT ON COLUMN companies.base_currency_code IS
  'Moeda do custo e do valor do estoque. Padrão PYG = DEFINIR (confirmação do responsável).';

ALTER TABLE currencies
  ADD COLUMN minor_units smallint CONSTRAINT currencies_minor_units_chk CHECK (minor_units BETWEEN 0 AND 4);
COMMENT ON COLUMN currencies.minor_units IS
  'Casas decimais de exibição/arredondamento de relatório (PYG 0, USD/BRL/EUR 2). O custo interno usa 4 casas.';
UPDATE currencies SET minor_units = CASE code WHEN 'PYG' THEN 0 WHEN 'USD' THEN 2 WHEN 'BRL' THEN 2 WHEN 'EUR' THEN 2 END
 WHERE code IN ('PYG','USD','BRL','EUR');

-- ---------------------------------------------------------------------------
-- 2. inventory_costs — custo por empresa × produto × depósito (DEFINIR: confirmar nível)
-- ---------------------------------------------------------------------------
-- Uma linha por produto e depósito. A linha é o ponto de serialização do custo: toda
-- movimentação a trava (SELECT … FOR UPDATE) antes de calcular. Guarda a QUANTIDADE
-- VALORIZADA (físico próprio) e o VALOR TOTAL; o custo médio é total_value / quantidade.
-- O valor total é a fonte da verdade (não o custo unitário arredondado) para que
-- entradas e saídas somem exatamente, sem deriva de arredondamento.
CREATE TABLE inventory_costs (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid          NOT NULL REFERENCES companies (id),
  product_id        uuid          NOT NULL,
  warehouse_id      uuid          NOT NULL,
  valued_quantity   numeric(18,4) NOT NULL DEFAULT 0,       -- físico PRÓPRIO: DISPONIBLE + RESERVADO + CUARENTENA (TRANSITO e TERCERO ficam fora)
  total_value       numeric(18,4) NOT NULL DEFAULT 0,       -- na moeda base da empresa
  average_cost      numeric(18,4) NOT NULL DEFAULT 0,       -- informativo: total_value / valued_quantity (arredondado a 4 casas)
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT inventory_costs_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT inventory_costs_natural_key UNIQUE (company_id, product_id, warehouse_id),
  CONSTRAINT inventory_costs_qty_chk   CHECK (valued_quantity >= 0),
  CONSTRAINT inventory_costs_value_chk CHECK (total_value >= 0),
  CONSTRAINT inventory_costs_avg_chk   CHECK (average_cost >= 0),
  -- Sem quantidade não há valor (o resíduo de arredondamento é absorvido na última saída).
  CONSTRAINT inventory_costs_zero_chk  CHECK (valued_quantity > 0 OR total_value = 0),
  CONSTRAINT inventory_costs_product_fk   FOREIGN KEY (company_id, product_id)   REFERENCES products   (company_id, id),
  CONSTRAINT inventory_costs_warehouse_fk FOREIGN KEY (company_id, warehouse_id) REFERENCES warehouses (company_id, id)
);
CREATE INDEX inventory_costs_warehouse_idx ON inventory_costs (company_id, warehouse_id);
CREATE TRIGGER inventory_costs_set_updated_at BEFORE UPDATE ON inventory_costs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
COMMENT ON TABLE inventory_costs IS
  'SENSIVEL: PRODUCTOS_COSTO.VER (DATO_SENSIBLE). Custo médio ponderado móvel por produto e depósito. Alterar só por inventory_post_line().';

-- ---------------------------------------------------------------------------
-- 3. Custo congelado nas linhas de movimento (imutáveis por P005)
-- ---------------------------------------------------------------------------
-- unit_cost/total_cost: ENTRADA e AJUSTE_POSITIVO = custo informado (valor que entra);
-- SALIDA, AJUSTE_NEGATIVO e TRANSFERENCIA = custo médio aplicado NA HORA da saída, gravado
-- e nunca recalculado (CMV estável). total_cost é a fonte; unit_cost é total_cost/quantity
-- arredondado a 4 casas (informativo). NULL = movimento sem efeito de valor
-- (RESERVA, CUARENTENA…, mercadoria de TERCERO).
ALTER TABLE inventory_movement_lines
  ADD COLUMN unit_cost          numeric(18,4),
  ADD COLUMN total_cost         numeric(18,4),
  ADD COLUMN cost_currency_code text REFERENCES currencies (code);
ALTER TABLE inventory_movement_lines
  ADD CONSTRAINT inventory_movement_lines_cost_chk CHECK (
    (unit_cost IS NULL AND total_cost IS NULL AND cost_currency_code IS NULL)
    OR (unit_cost >= 0 AND total_cost >= 0 AND cost_currency_code IS NOT NULL));
COMMENT ON COLUMN inventory_movement_lines.total_cost IS
  'SENSIVEL: PRODUCTOS_COSTO.VER. Custo congelado da linha (moeda base). Imutável (guard de P005).';

-- ---------------------------------------------------------------------------
-- 4. Vínculo venda → movimento de saída (o custo mora no movimento; não se duplica)
-- ---------------------------------------------------------------------------
ALTER TABLE invoice_lines ADD COLUMN inventory_movement_line_id uuid;
ALTER TABLE invoice_lines
  ADD CONSTRAINT invoice_lines_movement_line_fk FOREIGN KEY (company_id, inventory_movement_line_id)
  REFERENCES inventory_movement_lines (company_id, id);
CREATE UNIQUE INDEX invoice_lines_movement_line_key
  ON invoice_lines (company_id, inventory_movement_line_id) WHERE inventory_movement_line_id IS NOT NULL;
COMMENT ON COLUMN invoice_lines.inventory_movement_line_id IS
  'Linha SALIDA (source_type VENTA) que baixou o estoque e congelou o custo. NULL = sem custo histórico (faturas antigas/demonstrativas NÃO são reconstruídas).';

-- ---------------------------------------------------------------------------
-- 5. Funções de custo
-- ---------------------------------------------------------------------------
-- 5.1 Fórmula do DEC-003-02, em valores: novo custo médio = (valor anterior + valor da entrada) / (qtd anterior + qtd entrada)
CREATE OR REPLACE FUNCTION weighted_average_cost(prev_qty numeric, prev_value numeric, in_qty numeric, in_value numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN prev_qty + in_qty > 0 THEN round((prev_value + in_value) / (prev_qty + in_qty), 4) ELSE 0 END
$$;

-- 5.2 Aplica UMA linha de movimento: saldo + custo + linha, atomicamente (a transação é a do chamador).
--     Cobre ENTRADA, AJUSTE_POSITIVO (entrada valorizada), SALIDA, AJUSTE_NEGATIVO e TRANSFERENCIA,
--     no estado DISPONIBLE. RESERVA/CUARENTENA e transições de estado NÃO mudam valor e ficam fora (DEFINIR).
--     Anulação e devolução: ver CUSTEIO-V1.md §9 (D-C5) (DEFINIR; recomendação: movimento inverso ao custo congelado).
CREATE OR REPLACE FUNCTION inventory_post_line(
  p_company uuid, p_movement uuid, p_product uuid, p_quantity numeric,
  p_unit_cost numeric DEFAULT NULL, p_lot uuid DEFAULT NULL,
  p_ownership text DEFAULT 'PROPIO', p_owner uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  m          inventory_movements%ROWTYPE;
  base_cur   text;
  v_in       boolean;
  v_out      boolean;
  src        uuid;
  dst        uuid;
  c          inventory_costs%ROWTYPE;
  c2         inventory_costs%ROWTYPE;
  v_total    numeric(18,4);
  v_unit     numeric(18,4);
  v_valued   boolean := (p_ownership = 'PROPIO');
  line_id    uuid;
  bal        stock_balances%ROWTYPE;
  w          uuid;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'quantidade inválida (%)', p_quantity USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO m FROM inventory_movements WHERE company_id = p_company AND id = p_movement FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'movimento % não existe nesta empresa', p_movement USING ERRCODE = 'P0001';
  END IF;
  IF m.status <> 'REGISTRADO' THEN
    RAISE EXCEPTION 'movimento % não está REGISTRADO', m.movement_number USING ERRCODE = 'P0001';
  END IF;
  SELECT base_currency_code INTO base_cur FROM companies WHERE id = p_company;

  v_in  := m.movement_type IN ('ENTRADA','AJUSTE_POSITIVO','TRANSFERENCIA');
  v_out := m.movement_type IN ('SALIDA','AJUSTE_NEGATIVO','TRANSFERENCIA');
  IF NOT (v_in OR v_out) THEN
    RAISE EXCEPTION 'tipo % não altera valor: fora de inventory_post_line()', m.movement_type USING ERRCODE = 'P0001';
  END IF;
  src := m.source_warehouse_id;
  dst := m.destination_warehouse_id;

  -- Entrada de fora (ENTRADA/AJUSTE_POSITIVO) PRÓPRIA exige custo: não se inventa (DEC-003-02, item 6).
  IF v_valued AND m.movement_type IN ('ENTRADA','AJUSTE_POSITIVO') AND (p_unit_cost IS NULL OR p_unit_cost < 0) THEN
    RAISE EXCEPTION 'entrada valorizada exige custo unitário >= 0 (movimento %)', m.movement_number USING ERRCODE = 'P0001';
  END IF;

  -- Trava as linhas de custo em ordem determinística (evita deadlock em transferência).
  FOREACH w IN ARRAY (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY[src, dst]) x WHERE x IS NOT NULL) LOOP
    INSERT INTO inventory_costs (company_id, product_id, warehouse_id) VALUES (p_company, p_product, w)
      ON CONFLICT (company_id, product_id, warehouse_id) DO NOTHING;
    PERFORM 1 FROM inventory_costs WHERE company_id = p_company AND product_id = p_product AND warehouse_id = w FOR UPDATE;
  END LOOP;

  -- ---- saída (origem) ----
  IF v_out THEN
    SELECT * INTO bal FROM stock_balances
     WHERE company_id = p_company AND product_id = p_product AND warehouse_id = src AND stock_state = 'DISPONIBLE'
       AND lot_id IS NOT DISTINCT FROM p_lot AND ownership = p_ownership AND owner_id IS NOT DISTINCT FROM p_owner FOR UPDATE;
    IF NOT FOUND OR bal.quantity < p_quantity THEN
      RAISE EXCEPTION 'saldo disponível insuficiente (movimento %, pedido %)', m.movement_number, p_quantity USING ERRCODE = 'P0001';
    END IF;
    UPDATE stock_balances SET quantity = quantity - p_quantity WHERE id = bal.id;
    IF v_valued THEN
      SELECT * INTO c FROM inventory_costs WHERE company_id = p_company AND product_id = p_product AND warehouse_id = src;
      IF c.valued_quantity < p_quantity THEN
        RAISE EXCEPTION 'quantidade valorizada insuficiente (% < %): saldo e custo divergem', c.valued_quantity, p_quantity USING ERRCODE = 'P0001';
      END IF;
      -- custo da saída: parcela proporcional do VALOR; a última unidade leva o resíduo (valor nunca sobra nem falta).
      IF p_quantity = c.valued_quantity THEN v_total := c.total_value;
      ELSE v_total := round(c.total_value * p_quantity / c.valued_quantity, 4); END IF;
      v_unit := round(v_total / p_quantity, 4);
      UPDATE inventory_costs SET
          valued_quantity = c.valued_quantity - p_quantity,
          total_value     = c.total_value - v_total,
          average_cost    = CASE WHEN c.valued_quantity - p_quantity > 0
                                 THEN round((c.total_value - v_total) / (c.valued_quantity - p_quantity), 4)
                                 ELSE c.average_cost END     -- saldo zero: guarda o último médio só como referência
        WHERE id = c.id;
    END IF;
  END IF;

  -- ---- entrada (destino) ----
  IF v_in THEN
    IF m.movement_type <> 'TRANSFERENCIA' THEN
      v_total := CASE WHEN v_valued THEN round(p_quantity * p_unit_cost, 4) END;
      v_unit  := CASE WHEN v_valued THEN p_unit_cost END;
    END IF;                                           -- transferência: mesmo valor que saiu da origem (conservação)
    INSERT INTO stock_balances (company_id, product_id, warehouse_id, stock_state, lot_id, ownership, owner_id, quantity)
      VALUES (p_company, p_product, dst, 'DISPONIBLE', p_lot, p_ownership, p_owner, 0)
      ON CONFLICT (company_id, product_id, warehouse_id, stock_state,
                   COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid), ownership,
                   COALESCE(owner_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
    UPDATE stock_balances SET quantity = quantity + p_quantity
     WHERE company_id = p_company AND product_id = p_product AND warehouse_id = dst AND stock_state = 'DISPONIBLE'
       AND lot_id IS NOT DISTINCT FROM p_lot AND ownership = p_ownership AND owner_id IS NOT DISTINCT FROM p_owner;
    IF v_valued THEN
      SELECT * INTO c2 FROM inventory_costs WHERE company_id = p_company AND product_id = p_product AND warehouse_id = dst;
      UPDATE inventory_costs SET
          valued_quantity = c2.valued_quantity + p_quantity,
          total_value     = c2.total_value + v_total,
          average_cost    = weighted_average_cost(c2.valued_quantity, c2.total_value, p_quantity, v_total)
        WHERE id = c2.id;
    END IF;
  END IF;

  INSERT INTO inventory_movement_lines (company_id, movement_id, product_id, quantity, lot_id, ownership, owner_id,
                                        unit_cost, total_cost, cost_currency_code)
    VALUES (p_company, p_movement, p_product, p_quantity, p_lot, p_ownership, p_owner,
            CASE WHEN v_valued THEN v_unit END, CASE WHEN v_valued THEN v_total END, CASE WHEN v_valued THEN base_cur END)
    RETURNING id INTO line_id;
  RETURN line_id;
END $$;
COMMENT ON FUNCTION inventory_post_line IS
  'Referência executável do DEC-003-02: saldo + custo médio ponderado móvel + custo congelado, numa transação. Moeda base da empresa.';

-- ---------------------------------------------------------------------------
-- 6. RLS (padrão P001 §10)
-- ---------------------------------------------------------------------------
ALTER TABLE inventory_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_costs FORCE ROW LEVEL SECURITY;
CREATE POLICY inventory_costs_tenant_isolation ON inventory_costs
  USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id());

-- ---------------------------------------------------------------------------
-- 7. Bases dos relatórios (security_invoker: RLS do usuário que consulta)
-- ---------------------------------------------------------------------------
-- Quem pode ver custo, e em que sucursais/depósitos, é decidido pela camada de dados
-- (PRODUCTOS_COSTO.VER + alcance D(u), REQ-2026-002). As views não substituem essa checagem.
CREATE VIEW inventory_valuation_v WITH (security_invoker = true) AS
SELECT ic.company_id, w.branch_id, ic.warehouse_id, w.code AS warehouse_code, w.name AS warehouse_name,
       ic.product_id, p.code AS product_code, p.description AS product_description,
       ic.valued_quantity, ic.average_cost, ic.total_value, co.base_currency_code AS currency_code
  FROM inventory_costs ic
  JOIN warehouses w ON w.company_id = ic.company_id AND w.id = ic.warehouse_id
  JOIN products   p ON p.company_id = ic.company_id AND p.id = ic.product_id
  JOIN companies co ON co.id = ic.company_id
 WHERE ic.valued_quantity > 0;
COMMENT ON VIEW inventory_valuation_v IS
  'SENSIVEL: PRODUCTOS_COSTO.VER. Linhas do estoque valorizado. Subtotal por depósito e total geral: ROLLUP/GROUPING SETS na consulta (CUSTEIO-V1.md §8), por moeda.';

-- Vendas ao custo: só faturas EMITIDA/APROBADA (BORRADOR, RECHAZADA e ANULADA ficam de fora).
-- Linha sem vínculo de saída aparece com cost_status = 'SIN_COSTO' e custo NULL: o custo
-- histórico não é fabricado. A MARGEM não é calculada: a base (com ou sem IVA) e a moeda de
-- venda x moeda base estão em DEFINIR (CUSTEIO-V1.md §9).
CREATE VIEW sales_at_cost_v WITH (security_invoker = true) AS
SELECT i.company_id, i.branch_id, i.id AS invoice_id, i.internal_number, i.issue_date, i.status AS invoice_status,
       il.id AS invoice_line_id, il.line_number, il.product_id, il.product_code, il.description,
       il.quantity, i.currency_code AS sale_currency_code, il.unit_price, il.line_total AS sale_line_total,
       ml.cost_currency_code, ml.unit_cost, ml.total_cost,
       CASE WHEN ml.id IS NULL THEN 'SIN_COSTO' ELSE 'CON_COSTO' END AS cost_status
  FROM invoice_lines il
  JOIN invoices i ON i.company_id = il.company_id AND i.id = il.invoice_id
  LEFT JOIN inventory_movement_lines ml ON ml.company_id = il.company_id AND ml.id = il.inventory_movement_line_id
 WHERE i.status IN ('EMITIDA','APROBADA');
COMMENT ON VIEW sales_at_cost_v IS
  'SENSIVEL: PRODUCTOS_COSTO.VER. Venda x custo congelado. Não soma moedas diferentes; margem DEFINIR.';

-- Conferência saldo × valor: deve ficar vazia. Diferença = alguém gravou fora de inventory_post_line().
CREATE VIEW inventory_cost_reconciliation_v WITH (security_invoker = true) AS
SELECT ic.company_id, ic.product_id, ic.warehouse_id, ic.valued_quantity,
       COALESCE(b.qty, 0) AS balance_quantity, ic.valued_quantity - COALESCE(b.qty, 0) AS difference
  FROM inventory_costs ic
  LEFT JOIN (SELECT company_id, product_id, warehouse_id, sum(quantity) AS qty
               FROM stock_balances
              WHERE ownership = 'PROPIO' AND stock_state IN ('DISPONIBLE','RESERVADO','CUARENTENA')
              GROUP BY company_id, product_id, warehouse_id) b
         ON b.company_id = ic.company_id AND b.product_id = ic.product_id AND b.warehouse_id = ic.warehouse_id
 WHERE ic.valued_quantity <> COALESCE(b.qty, 0);

-- ---------------------------------------------------------------------------
-- PENDÊNCIAS DE DEFINIÇÃO (não bloqueiam este arquivo; ver CUSTEIO-V1.md §9)
-- ---------------------------------------------------------------------------
-- D-C1 nível do custo: produto × depósito (adotado aqui) ou só produto.
-- D-C2 físico x disponível na valorização (adotado: físico próprio, sem TRANSITO).
-- D-C3 IVA recuperável, frete e despesas incorporáveis ao custo de entrada.
-- D-C4 fonte e data da taxa de câmbio; moeda base por empresa (adotado PYG).
-- D-C5 anulação, devolução de venda/compra e correção retroativa (movimento inverso).
-- D-C6 lote: custo por lote x por produto (adotado por produto/depósito).
-- D-C7 mercadoria de TERCERO fora do valor do estoque (adotado).
-- D-C8 data de corte/fechamento de período e custo inicial (saldo de abertura).
-- D-C9 base da margem (com ou sem IVA).
COMMIT;
