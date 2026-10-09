-- =============================================================================
-- REQ-2026-003-P004-listas-preco-up.sql — PROPOSTA — NÃO EXECUTAR EM BANCO REAL
-- Objetivo : listas de preço em INGLÊS e multiempresa: price_lists,
--            price_list_items, price_list_item_tiers, price_list_rules; e a FK
--            composta customers (company_id, price_list_id) -> price_lists
--            (company_id, id), que P002 deixou propositalmente sem FK.
-- Origem   : REQ-2026-003; REQ-2026-002 (DESENHO v5 §3.1, §3.3, §3.4);
--            documentacao/banco/levantamento/campos/LISTAS-PRECIO.md (LPR-001..LPR-130,
--            DLP-01..DLP-21) e CLIENTES.md (CLI-027 = customers.price_list_id).
-- Dialeto  : PostgreSQL >= 14 (gen_random_uuid() nativo). Validado só em PG 16.15
--            descartável (banco dn_p004).
-- Situação : DEFINIÇÃO DE ESTRUTURA-ALVO (greenfield). NÃO é migration pronta:
--            o esquema real de listas_precio está NAO_VERIFICADO (só 6 colunas
--            provadas: id, empresa_id, codigo, nombre, moneda_codigo, activo) e o
--            módulo é DEMONSTRATIVO (telas gravam só em localStorage). Em banco
--            existente, entra só após a reconciliação (PLANO-MIGRACAO-INGLES.md).
-- Depende de: P001 (companies, users, app_company_id(), set_updated_at()) e
--            P002 (currencies, customers, customer_groups, commercial_zones,
--            sales_channels, units_of_measure) e P003 (products).
--            Contrato de chaves: todas as tabelas de negócio com unique (company_id, id);
--            currencies.code (PK text) e units_of_measure.id (PK uuid) são globais.
--            customers.price_list_id (uuid, NULL) já existe, SEM FK, vindo de P002.
-- Pós-valid: documentacao/banco/validacoes/TESTE-P004-listas-preco.sql
-- Impacto API: nenhum até o código passar a usar os nomes em inglês. Hoje só
--            GET/POST /api/clientes toca listas_precio (route.ts:479,519-525,767-773).
--            DLP-10: o JOIN de leitura de clientes deve passar a usar (company_id, id).
-- Rollback : REQ-2026-003-P004-listas-preco-down.sql — só para banco DESCARTÁVEL.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- Convenções desta proposta
-- ---------------------------------------------------------------------------
-- * Valores de domínio ficam em espanhol, EXATAMENTE como no código (DLP-09, pergunta 11).
-- * Onde o mapeamento diz DEFINIR, a coluna é anulável/sem CHECK e há "-- DEFINIR:".
--   Tudo isso está reunido no bloco final "PENDÊNCIAS DE DEFINIÇÃO".
-- * Dinheiro/quantidade: numeric(18,4) — o código aceita decimais (clientes em USD,
--   LPR-021/048..050) e PYG usa inteiros no código (pergunta 13). 18 dígitos cobre
--   PYG com folga; 4 casas evitam perda em preços unitários/escalas. Nunca float.
-- * Percentuais: numeric(7,4) — LPR-014/019 (step 0.01, sem faixa no código); comporta
--   até 999,9999 sem forçar a faixa 0..100 (CHECK de faixa é DEFINIR).
-- * Nenhuma FK usa ON DELETE CASCADE/SET NULL: o mapeamento não define remoção.
--   (SET NULL numa FK composta anularia company_id — proibido.)

-- ---------------------------------------------------------------------------
-- 1. price_lists  (atual: listas_precio) — por EMPRESA (pergunta 15: sem sucursal)
-- ---------------------------------------------------------------------------
CREATE TABLE price_lists (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),         -- LPR-001 (tipo real NAO_VERIFICADO)
  company_id                  uuid          NOT NULL REFERENCES companies(id),      -- LPR-002 (atual empresa_id; vem da sessão)
  code                        text          NOT NULL,                              -- LPR-003 (atual codigo); LP-NNN gerado fora do SQL (DLP-20)
  name                        text          NOT NULL,                              -- LPR-004 (atual nombre); obrigatório no código
  description                 text,                                                -- LPR-005 (UI normaliza vazio)
  list_type                   text          NOT NULL DEFAULT 'VENTA',              -- LPR-006
  currency_code               text          NOT NULL DEFAULT 'PYG',                -- LPR-007 (atual moneda_codigo); FK global
  status                      text          NOT NULL DEFAULT 'ACTIVA',             -- LPR-008; VENCIDA incluída (DLP-05, DEFINIR)
  pricing_mode                text          NOT NULL DEFAULT 'PRECIO_FIJO',        -- LPR-009 (só rótulo; DLP-06)
  includes_tax                boolean       NOT NULL DEFAULT true,                 -- LPR-010 (IVA incluído; pergunta 18)
  base_price_list_id          uuid,                                                -- LPR-011 (lista base; sem checagem de ciclo no código)
  general_adjustment_pct      numeric(7,4)  NOT NULL DEFAULT 0,                    -- LPR-014 (negativo = desconto; faixa DEFINIR)
  valid_from                  date          NOT NULL DEFAULT current_date,         -- LPR-015 (obrigatório; default = hoje)
  valid_to                    date,                                                -- LPR-016 (NULL = "Sin vencimiento")
  priority                    integer       NOT NULL DEFAULT 10,                   -- LPR-017 (sentido maior/menor DEFINIR)
  allows_additional_discount  boolean       NOT NULL DEFAULT true,                 -- LPR-018
  max_discount_pct            numeric(7,4)  NOT NULL DEFAULT 5,                    -- LPR-019 (faixa 0..100 DEFINIR)
  customer_group_id           uuid,                                                -- LPR-020 (NULL = todos)
  customer_id                 uuid,                                                -- LPR-022 (NULL = sem cliente específico)
  commercial_zone_id          uuid,                                                -- LPR-025 (NULL = todas)
  sales_channel_id            uuid,                                                -- LPR-027 (NULL = todos)
  is_active                   boolean       NOT NULL DEFAULT true,                 -- LPR-031 (atual activo); convive com status (DLP-13)
  notes                       text,                                                -- LPR-032 (observación)
  created_by                  uuid,                                                -- LPR-036 DEFINIR: o código não registra autor
  created_at                  timestamptz   NOT NULL DEFAULT now(),                -- LPR-033
  updated_at                  timestamptz   NOT NULL DEFAULT now(),                -- LPR-034
  CONSTRAINT price_lists_company_id_id_key UNIQUE (company_id, id),
  -- DEFINIR: unicidade de code por empresa (LPR-003/DLP-12: a tela hoje aceita código manual repetido).
  -- Proposta mantida porque é a chave natural usada em buscas; pode rejeitar dados demo/legados.
  CONSTRAINT price_lists_company_code_key  UNIQUE (company_id, code),
  CONSTRAINT price_lists_list_type_chk     CHECK (list_type IN ('VENTA','COMPRA')),
  CONSTRAINT price_lists_status_chk        CHECK (status IN ('BORRADOR','ACTIVA','INACTIVA','VENCIDA')),
  CONSTRAINT price_lists_pricing_mode_chk  CHECK (pricing_mode IN ('PRECIO_FIJO','AJUSTE_PORCENTAJE','MARGEN_SOBRE_COSTO')),
  CONSTRAINT price_lists_currency_fk       FOREIGN KEY (currency_code)                    REFERENCES currencies (code),
  CONSTRAINT price_lists_base_fk           FOREIGN KEY (company_id, base_price_list_id)   REFERENCES price_lists (company_id, id),
  CONSTRAINT price_lists_customer_group_fk FOREIGN KEY (company_id, customer_group_id)    REFERENCES customer_groups (company_id, id),
  CONSTRAINT price_lists_customer_fk       FOREIGN KEY (company_id, customer_id)          REFERENCES customers (company_id, id),
  CONSTRAINT price_lists_zone_fk           FOREIGN KEY (company_id, commercial_zone_id)   REFERENCES commercial_zones (company_id, id),
  CONSTRAINT price_lists_channel_fk        FOREIGN KEY (company_id, sales_channel_id)     REFERENCES sales_channels (company_id, id),
  CONSTRAINT price_lists_created_by_fk     FOREIGN KEY (company_id, created_by)           REFERENCES users (company_id, id)
  -- DEFINIR (sem CHECK, por ordem do brief): valid_to >= valid_from (LPR-016); general_adjustment_pct e
  --   max_discount_pct em faixa (LPR-014/019); priority em faixa (LPR-017); ciclo/auto-referência de
  --   base_price_list_id (LPR-011); lista base só VENTA/ativa e na mesma moeda (DLP-14, regra 5 só na UI).
);
COMMENT ON TABLE price_lists IS
  'Cabeçalho da lista de preços (atual listas_precio). Por empresa. Escopo comercial (grupo/cliente/zona/canal) é opcional; semântica E/OU de combinação é DEFINIR (DLP-16).';
COMMENT ON COLUMN price_lists.status IS
  'BORRADOR/ACTIVA/INACTIVA são gravados pelo formulário; VENCIDA é calculada no listado (DLP-05) e está no CHECK só por existir no tipo TS. DEFINIR: persistir ou calcular; unificar com is_active (DLP-13).';
COMMENT ON COLUMN price_lists.is_active IS
  'Único indicador que o SQL de clientes usa (route.ts:285,522). Lista BORRADOR com is_active=true é oferecida a clientes hoje (DLP-13).';
COMMENT ON COLUMN price_lists.pricing_mode IS
  'Só rotula a listagem; nenhum cálculo do código o usa (DLP-06). Mesmo para general_adjustment_pct.';
CREATE INDEX price_lists_company_status_idx ON price_lists (company_id, status, is_active);
CREATE INDEX price_lists_base_idx           ON price_lists (company_id, base_price_list_id)  WHERE base_price_list_id IS NOT NULL;
CREATE INDEX price_lists_customer_idx       ON price_lists (company_id, customer_id)         WHERE customer_id IS NOT NULL;
CREATE INDEX price_lists_group_idx          ON price_lists (company_id, customer_group_id)   WHERE customer_group_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. price_list_items  (NOVA — hoje é o array "productos" dentro do JSON da lista)
-- ---------------------------------------------------------------------------
CREATE TABLE price_list_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),           -- LPR-040
  company_id          uuid          NOT NULL REFERENCES companies(id),       -- LPR-041 (herdado da lista)
  price_list_id       uuid          NOT NULL,                                -- LPR-029
  product_id          uuid          NOT NULL,                                -- LPR-042
  unit_of_measure_id  uuid          NOT NULL REFERENCES units_of_measure (id),  -- LPR-045; DEFINIR: units_of_measure (global) ou product_units (pergunta 12)
  currency_code       text          NOT NULL REFERENCES currencies (code),   -- LPR-047; copiada da lista ao adicionar (DLP-14: pode divergir; DEFINIR)
  reference_cost      numeric(18,4) NOT NULL DEFAULT 0,                      -- LPR-048 (SENSIVEL: PRODUCTOS_COSTO.VER — custo); vazio vira 0 no código
  base_price          numeric(18,4) NOT NULL DEFAULT 0,                      -- LPR-049
  list_price          numeric(18,4) NOT NULL DEFAULT 0,                      -- LPR-050 (preço efetivo da linha)
  margin_pct          numeric(7,4)  NOT NULL DEFAULT 0,                      -- LPR-051 persistido como no JSON; DEFINIR persistir x calcular. SENSIVEL: PRODUCTOS_COSTO.VER (revela o custo)
  discount_pct        numeric(7,4)  NOT NULL DEFAULT 0,                      -- LPR-052
  min_quantity        numeric(18,4) NOT NULL DEFAULT 1,                      -- LPR-053 (item usa min=1; DLP-11)
  valid_from          date          NOT NULL,                                -- LPR-054 (copiada da lista ao adicionar; sem default no SQL)
  valid_to            date,                                                  -- LPR-055 (NULL = sem fim)
  is_active           boolean       NOT NULL DEFAULT true,                   -- LPR-056
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT price_list_items_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT price_list_items_list_fk    FOREIGN KEY (company_id, price_list_id) REFERENCES price_lists (company_id, id),
  CONSTRAINT price_list_items_product_fk FOREIGN KEY (company_id, product_id)    REFERENCES products (company_id, id),
  -- Regra confirmada 6 / LPR-042: um produto entra uma única vez por lista (hoje bloqueado por productoId na UI).
  -- DLP-18/pergunta 5: o tipo TS prevê preço por unidade e por quantidade mínima, e a política de histórico
  -- (nova linha por vigência) é DEFINIR. NÃO se usa daterange/EXCLUDE: nenhuma regra de sobreposição de
  -- vigência está provada no código. Quando a pergunta 5 for respondida, trocar esta chave.
  CONSTRAINT price_list_items_list_product_key UNIQUE (company_id, price_list_id, product_id)
  -- DEFINIR (sem CHECK): list_price/base_price/reference_cost >= 0 (LPR-048..050); discount_pct 0..100 (LPR-052);
  --   min_quantity > 0 (LPR-053); valid_from >= lista.valid_from e valid_to >= valid_from (LPR-054/055).
);
COMMENT ON TABLE price_list_items IS
  'Preço por produto na lista. SENSIVEL: reference_cost e margin_pct dependem de PRODUCTOS_COSTO.VER (REQ-2026-002); a proteção é da camada de dados.';
CREATE INDEX price_list_items_list_idx    ON price_list_items (company_id, price_list_id);
CREATE INDEX price_list_items_product_idx ON price_list_items (company_id, product_id);

-- ---------------------------------------------------------------------------
-- 3. price_list_item_tiers  (NOVA — só mocks, sem UI: DLP-01)
-- ---------------------------------------------------------------------------
CREATE TABLE price_list_item_tiers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),           -- LPR-058
  company_id          uuid          NOT NULL REFERENCES companies(id),       -- LPR-059
  price_list_item_id  uuid          NOT NULL,                                -- LPR-057
  min_quantity        numeric(18,4) NOT NULL,                                -- LPR-060
  max_quantity        numeric(18,4),                                         -- LPR-061 (NULL = faixa aberta)
  price               numeric(18,4) NOT NULL,                                -- LPR-062 (preço absoluto da faixa)
  discount_pct        numeric(7,4)  NOT NULL DEFAULT 0,                      -- LPR-063 (redundante com price; fonte DEFINIR, pergunta 8)
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT price_list_item_tiers_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT price_list_item_tiers_item_fk FOREIGN KEY (company_id, price_list_item_id) REFERENCES price_list_items (company_id, id)
  -- DEFINIR (sem UNIQUE/CHECK): UNIQUE (item, min_quantity) (LPR-060); min_quantity > 0; max_quantity >= min_quantity (LPR-061);
  --   price >= 0 (LPR-062); discount_pct 0..100 (LPR-063); sobreposição de faixas (pergunta 8, "Regras que dependem" 6).
);
COMMENT ON TABLE price_list_item_tiers IS
  'Escalas por quantidade. Sem UI hoje (DLP-01): entra como estrutura proposta; escopo a confirmar (pergunta 8).';
CREATE INDEX price_list_item_tiers_item_idx ON price_list_item_tiers (company_id, price_list_item_id);

-- ---------------------------------------------------------------------------
-- 4. price_list_rules  (NOVA — array "reglasComerciales" dentro do JSON da lista)
-- ---------------------------------------------------------------------------
CREATE TABLE price_list_rules (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- LPR-064
  company_id                  uuid          NOT NULL REFERENCES companies(id),  -- LPR-065
  price_list_id               uuid          NOT NULL,                        -- LPR-030
  application_type            text          NOT NULL DEFAULT 'GENERAL',      -- LPR-066
  reference_id                uuid,                                          -- LPR-067 DEFINIR: polimórfico (grupo/cliente/zona/canal); SEM FK (pergunta 9). A tela nunca o preenche (DLP-03)
  priority                    integer       NOT NULL,                        -- LPR-070 (nova regra herda a da lista; cópia feita pela app, sem default no SQL)
  min_quantity                numeric(18,4) NOT NULL DEFAULT 1,              -- LPR-071 (DLP-11: vazio na tela vira 0; CHECK é DEFINIR)
  allows_additional_discount  boolean       NOT NULL,                        -- LPR-072 (herdado da lista pela app)
  max_discount_pct            numeric(7,4)  NOT NULL,                        -- LPR-073 (herdado da lista pela app)
  valid_from                  date          NOT NULL,                        -- LPR-074 (herdado da lista pela app)
  valid_to                    date,                                          -- LPR-075
  is_active                   boolean       NOT NULL DEFAULT true,           -- LPR-076
  created_at                  timestamptz   NOT NULL DEFAULT now(),
  updated_at                  timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT price_list_rules_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT price_list_rules_list_fk  FOREIGN KEY (company_id, price_list_id) REFERENCES price_lists (company_id, id),
  CONSTRAINT price_list_rules_type_chk CHECK (application_type IN ('GENERAL','GRUPO_CLIENTE','CLIENTE','ZONA','CANAL_VENTA'))
  -- DEFINIR (sem CHECK): reference_id obrigatório quando application_type <> 'GENERAL' (trocar o tipo hoje não
  --   limpa nem exige a referência: LPR-066); min_quantity > 0; max_discount_pct 0..100; valid_to >= valid_from.
);
COMMENT ON TABLE price_list_rules IS
  'Regras comerciais da lista. Papel frente ao cabeçalho (que também tem grupo/cliente/zona/canal) é DEFINIR (DLP-03, DLP-16, pergunta 9). Sem consumidor no código de venda.';
CREATE INDEX price_list_rules_list_idx ON price_list_rules (company_id, price_list_id);

-- ---------------------------------------------------------------------------
-- 5. FK composta customers -> price_lists  (CLI-027 / LPR-037)
-- ---------------------------------------------------------------------------
-- customers.price_list_id nasceu em P002 sem FK porque price_lists ainda não existia.
-- Regra do código (route.ts:767-771): a lista deve ser da MESMA empresa (e ativa; "ativa" é validação
-- de gravação na API, não FK). NO ACTION: apagar lista em uso é recusado. MATCH SIMPLE: price_list_id NULL
-- (opcional) não é verificado. Em banco com dados, backfill de nomes DEMO -> ids é pré-requisito (DLP-08).
ALTER TABLE customers
  ADD CONSTRAINT customers_price_list_fk
  FOREIGN KEY (company_id, price_list_id) REFERENCES price_lists (company_id, id);
-- O índice customers_price_list_idx (company_id, price_list_id) já é criado por P002; P004 não o recria.

-- ---------------------------------------------------------------------------
-- 6. updated_at automático
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['price_lists','price_list_items','price_list_item_tiers','price_list_rules'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t||'_set_updated_at', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Row Level Security (mesmo padrão de P001 §10)
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['price_lists','price_list_items','price_list_item_tiers','price_list_rules'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY %I ON %I USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id())$p$,
                   t||'_tenant_isolation', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- PENDÊNCIAS DE DEFINIÇÃO (cada item = pergunta aberta em LISTAS-PRECIO.md; nada abaixo foi decidido)
-- ---------------------------------------------------------------------------
-- 1. Resolução de preço e sentido de priority (maior ou menor vence); papel de price_list_rules x cabeçalho;
--    combinação E/OU de grupo/cliente/zona/canal; se o grupo/zona/canal da lista ainda vale quando o cliente já
--    tem price_list_id fixo (perguntas 3, 9; DLP-16).
-- 2. pricing_mode e general_adjustment_pct: cálculo dinâmico a partir da lista base ou preços materializados
--    nos itens (pergunta 4; DLP-06). Nada no SQL os aplica.
-- 3. Chave de unicidade do item: foi usada UNIQUE (lista, produto) = regra confirmada 6 (UI). Sem daterange/
--    EXCLUDE porque nenhuma regra de vigência está provada. Falta decidir produto x unidade x min_quantity x
--    vigência e a política de histórico (pergunta 5; DLP-18).
-- 4. unit_of_measure_id: FK para units_of_measure (global) ou para product_units (pergunta 12; LPR-045).
-- 5. Moeda do item = moeda da lista? conversão? conjunto de moedas é o catálogo currencies ou as 4 fixas
--    PYG/USD/BRL/EUR (pergunta 6; DLP-14). Lista base na mesma moeda?
-- 6. CHECKs deliberadamente AUSENTES (todos DEFINIR): valid_to >= valid_from (lista, item, regra); preços e custo
--    >= 0; percentuais 0..100; min_quantity > 0; max_quantity >= min_quantity; faixa de priority; reference_id
--    obrigatório fora de GENERAL; ciclo/auto-referência da lista base (DLP-11, DLP-12).
-- 7. Escalas (price_list_item_tiers): entram no escopo? UNIQUE (item, min_quantity)? price x discount_pct, qual
--    é a fonte? sobreposição de faixas (perguntas 8; DLP-01).
-- 8. price_list_rules.reference_id: coluna polimórfica sem FK ou quatro FKs (pergunta 9; LPR-067).
-- 9. status VENCIDA persistida ou calculada; unificar status x is_active (pergunta 14; DLP-05, DLP-13).
-- 10. Unicidade de price_lists.code por empresa foi ADOTADA (UNIQUE) mas é DEFINIR (LPR-003); geração LP-NNN
--     com sequência por empresa e transação fica fora do SQL (DLP-20). Pode rejeitar dados demo/legados.
-- 11. margin_pct persistido como no JSON do código; alternativa: coluna calculada/view (LPR-051).
-- 12. Precisão: numeric(18,4) mantida; PYG sem decimais e arredondamento por moeda (DLP-15; pergunta 13).
-- 13. Autor (created_by) e trilha de alteração de preços: o código não registra (LPR-036; pergunta 17).
-- 14. Permissões: menu só tem LISTAS_PRECIO.VER; criar/editar/ativar inexistentes (pergunta 2; DLP-21).
--     Custo/margem do item: SENSIVEL PRODUCTOS_COSTO.VER (camada de dados, não do SQL).
-- 15. Enums em espanhol mantidos (VENTA/COMPRA, ACTIVA..., PRECIO_FIJO...): pergunta 11.
-- 16. Backfill de customers.price_list_id: clientes DEMO guardam NOME da lista; sem de-para a FK não pode ser
--     aplicada em dados legados (DLP-08; pergunta 16). IVA incluído x taxes (pergunta 18); lista COMPRA x
--     fornecedor/product_suppliers (Regras que dependem 9) — sem coluna criada.

COMMIT;
