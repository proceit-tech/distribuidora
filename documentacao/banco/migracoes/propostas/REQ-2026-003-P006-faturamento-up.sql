-- =============================================================================
-- REQ-2026-003-P006-faturamento-up.sql — PROPOSTA — NÃO EXECUTAR EM BANCO REAL
-- Objetivo : faturamento em INGLÊS e multiempresa: invoices, invoice_lines,
--            invoice_taxes, invoice_payments, invoice_exports,
--            invoice_public_procurements + document_sequences (contadores de
--            numeração, PROPOSTA condicional) e as regras de integridade que o
--            mapeamento prova (unicidade de numeração, coerência de linha/impostos,
--            imutabilidade da fatura emitida/aprovada).
--            O DASHBOARD é DERIVADO: nenhuma tabela é criada para ele (ver a view
--            PROPOSTA, comentada, no §9).
--            NÃO viram tabela (sem tela): notas de crédito, notas de remisión,
--            "todos los documentos", monitor SIFEN.
-- Origem   : REQ-2026-003; documentacao/banco/levantamento/campos/FACTURACION-DASHBOARD.md
--            (FAC-001..FAC-113, DIV-01..DIV-23, Regras 1-19, Perguntas 1-12).
-- Dialeto  : PostgreSQL >= 14 (gen_random_uuid() nativo). Validado só em PG 16
--            descartável (TESTE-P006-faturamento.sql).
-- Situação : DEFINIÇÃO DE ESTRUTURA-ALVO (greenfield). NÃO é migration pronta: o
--            esquema real está NAO_VERIFICADO (REQ-2026-003 §6) e o módulo é hoje
--            100% DEMO (localStorage; nenhuma tabela atual de facturas).
-- Depende de: P001 (companies, branches, users; app_company_id(), set_updated_at()),
--            P002 (customers com unique (company_id,id); currencies PK code;
--            taxes PK id), P003 (products com unique (company_id,id)).
--            Os nomes seguem o contrato de dependências do brief; as colunas das
--            tabelas externas NÃO foram vistas — só (company_id,id) / code / id.
-- Pós-valid: documentacao/banco/validacoes/TESTE-P006-faturamento.sql
-- Impacto API: nenhum até existir POST/GET /api/facturas (hoje inexistentes). A
--            camada de dados deve: criar a fatura em BORRADOR, inserir filhos,
--            calcular a numeração via next_document_number() e só então mudar o
--            estado (ver §6 e §7).
-- Rollback : REQ-2026-003-P006-faturamento-down.sql — só para banco DESCARTÁVEL.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Convenções
-- ---------------------------------------------------------------------------
-- Dinheiro e quantidade: numeric(18,4). Justificativa (FAC-063/064/065 e Regra 8):
--   a tela mostra 0 casas para PYG e 2 para USD/BRL/EUR; o preço unitário pode
--   ter fração e a quantidade usa step=0.001. Com 2 casas o modelo multimoeda
--   perderia centavos; 4 casas cobre quantidade (3) e preço/valores (2-4).
--   O arredondamento OFICIAL por moeda NÃO está definido (DIV-04; Pergunta 7).
-- Códigos de domínio ficam como no código (BORRADOR, APROBADA, CONTADO...).
-- Alcance por sucursal (invoices.branch_id) é aplicado pela camada de dados; o RLS
-- abaixo isola apenas por empresa.

-- ---------------------------------------------------------------------------
-- 1. invoices  (atual: — só localStorage "distribunex.demo.facturas.v1")
-- ---------------------------------------------------------------------------
CREATE TABLE invoices (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),   -- FAC-001
  company_id                  uuid        NOT NULL REFERENCES companies(id),       -- FAC-002 (vem da sessão, nunca do corpo)
  -- FAC-003: branch_id NOT NULL porque TODO o escopo da tela (coluna "Escopo" do
  -- mapeamento) é "alcance por sucursal via invoices.branch_id". DEFINIR: ver PENDÊNCIAS (10).
  branch_id                   uuid        NOT NULL,
  customer_id                 uuid        NOT NULL,                                -- FAC-017/018 (UI exige clienteId)
  internal_number             text        NOT NULL,                                -- FAC-004
  status                      text        NOT NULL DEFAULT 'BORRADOR',             -- FAC-005 (DEFINIR: o código cria sempre APROBADA)
  establishment_code          text        NOT NULL DEFAULT '001',                  -- FAC-006
  establishment_description   text        NOT NULL,                                -- FAC-007/DIV-13: sem default (o 'CASA MINGO S.A.' do demo é o emissor, não a sucursal)
  issuance_point_code         text        NOT NULL DEFAULT '001',                  -- FAC-008
  issuance_point_description  text        NOT NULL,                                -- FAC-009/DIV-13: sem default (o 'Casa Central' do demo é fixo, mesmo no punto 002)
  sequence_number             text        NOT NULL,                                -- FAC-010 (7 dígitos; gerado por next_document_number())
  -- FAC-011/DIV-23: o código usa a data UTC (toISOString) como default, o que erra
  -- a data fiscal perto da meia-noite de Asunción. Sem default no banco: a camada
  -- de dados informa a data no fuso da empresa. DEFINIR: fuso (PENDÊNCIAS 9).
  issue_date                  date        NOT NULL,
  currency_code               text        NOT NULL DEFAULT 'PYG',                  -- FAC-012
  operation_condition         text        NOT NULL DEFAULT 'CONTADO',              -- FAC-013
  transaction_type            text        NOT NULL DEFAULT 'VENTA_MERCADERIA',     -- FAC-014
  presence_indicator          text        NOT NULL DEFAULT 'PRESENCIAL',           -- FAC-015
  additional_information      text        DEFAULT '',                              -- FAC-016
  -- Snapshot do receptor (FAC-017..FAC-030): imutabilidade fiscal; Pergunta 9
  -- (manter colunas customer_* × só customer_id) segue ABERTA — mantidas como no mapeamento.
  customer_code               text        NOT NULL,                                -- FAC-019
  customer_nature             text        NOT NULL DEFAULT 'CONTRIBUYENTE',        -- FAC-020
  customer_taxpayer_type      text        NOT NULL DEFAULT 'PERSONA_JURIDICA',     -- FAC-021
  customer_document_type      text        NOT NULL DEFAULT 'RUC',                  -- FAC-022 (DEFINIR valores: sem CHECK)
  customer_tax_id             text        DEFAULT '',                              -- FAC-023 (sem validação de formato/DV no código)
  customer_tax_id_check_digit text        DEFAULT '',                              -- FAC-024
  customer_legal_name         text        NOT NULL DEFAULT 'SIN NOMBRE',           -- FAC-025
  customer_email              text        DEFAULT '',                              -- FAC-026
  customer_phone              text        DEFAULT '',                              -- FAC-027
  customer_mobile             text        DEFAULT '',                              -- FAC-028
  customer_address            text        DEFAULT '',                              -- FAC-029/DIV-01 (de qual customer_addresses copiar: DEFINIR)
  customer_house_number       text        NOT NULL DEFAULT '0',                    -- FAC-030
  -- Total gravado (FAC-084 = totalGeneral = totalOperacion FAC-075). Os demais
  -- agregados (liquidacionIva5/10, totalIva, totalBaseGravadaIva, totalOperacion)
  -- são deriváveis e NÃO são persistidos (FAC-075/078/079/080/083).
  total_amount                numeric(18,4) NOT NULL CHECK (total_amount >= 0),    -- FAC-084
  -- FAC-085/DIV-06: o mock tem 44 caracteres e o gerado 43. Por isso SEM CHECK de
  -- tamanho (nem 43, nem 44): só "apenas dígitos" (os dois exemplos o são).
  -- DEFINIR: estrutura oficial (44 dígitos com DV) — PENDÊNCIAS (1).
  cdc                         text,
  sifen_message               text,                                                -- FAC-086
  created_by                  uuid,                                                -- FAC-089 (DEFINIR: nullable, o código não registra o emissor)
  created_at                  timestamptz NOT NULL DEFAULT now(),                  -- FAC-087
  updated_at                  timestamptz NOT NULL DEFAULT now(),                  -- FAC-088
  CONSTRAINT invoices_company_id_id_key UNIQUE (company_id, id),
  -- FAC-004 + DIV-07: a regra atual é "maior valor global + 1"; aqui a unicidade é por empresa.
  CONSTRAINT invoices_company_internal_number_key UNIQUE (company_id, internal_number),
  -- FAC-010 + DIV-07 + Regra 10: número do documento = estabelecimento + ponto de
  -- expedição + sequência, ÚNICO POR EMPRESA (regra atual: global, sem validar o
  -- número digitado à mão). Timbrado/tipo de documento NÃO entram: o código não os tem (Pergunta 1).
  CONSTRAINT invoices_company_fiscal_number_key
    UNIQUE (company_id, establishment_code, issuance_point_code, sequence_number),
  -- FAC-085: UNIQUE com NULL permite várias faturas sem CDC (ainda não aprovadas).
  CONSTRAINT invoices_company_cdc_key UNIQUE (company_id, cdc),
  CONSTRAINT invoices_branch_fk   FOREIGN KEY (company_id, branch_id)   REFERENCES branches  (company_id, id),
  CONSTRAINT invoices_customer_fk FOREIGN KEY (company_id, customer_id) REFERENCES customers (company_id, id),
  CONSTRAINT invoices_created_by_fk FOREIGN KEY (company_id, created_by) REFERENCES users    (company_id, id),
  CONSTRAINT invoices_currency_fk FOREIGN KEY (currency_code) REFERENCES currencies (code),
  CONSTRAINT invoices_internal_number_chk CHECK (internal_number ~ '^FAC-[0-9]{6,}$'),  -- padStart(6) do código
  CONSTRAINT invoices_status_chk CHECK (status IN ('BORRADOR','EMITIDA','APROBADA','RECHAZADA','ANULADA')),
  CONSTRAINT invoices_establishment_chk CHECK (establishment_code ~ '^[0-9]{3}$'),
  CONSTRAINT invoices_issuance_point_chk CHECK (issuance_point_code ~ '^[0-9]{3}$'),
  CONSTRAINT invoices_sequence_chk CHECK (sequence_number ~ '^[0-9]{7}$'),             -- padStart(7) do código
  -- FAC-012: o CHECK espelha o que o código aceita; a FK acima é o contrato de dependência.
  -- DEFINIR (Pergunta 7): se outras moedas entrarem, só o CHECK precisa mudar.
  CONSTRAINT invoices_currency_chk CHECK (currency_code IN ('PYG','USD','BRL','EUR')),
  CONSTRAINT invoices_operation_condition_chk CHECK (operation_condition IN ('CONTADO','CREDITO')),
  CONSTRAINT invoices_transaction_type_chk CHECK (transaction_type IN
    ('VENTA_MERCADERIA','PRESTACION_SERVICIO','MIXTO','MUESTRAS_MEDICAS','DONACION','OTRO')),
  CONSTRAINT invoices_presence_indicator_chk CHECK (presence_indicator IN ('PRESENCIAL','INTERNET','TELEFONO','OTRO')),
  CONSTRAINT invoices_customer_nature_chk CHECK (customer_nature IN ('CONTRIBUYENTE','NO_CONTRIBUYENTE')),
  CONSTRAINT invoices_customer_taxpayer_type_chk CHECK (customer_taxpayer_type IN ('PERSONA_JURIDICA','PERSONA_FISICA')),
  CONSTRAINT invoices_cdc_digits_chk CHECK (cdc IS NULL OR cdc ~ '^[0-9]+$')
);
CREATE INDEX invoices_company_created_idx  ON invoices (company_id, created_at DESC);          -- Regra 17: listado por creadoEn desc
CREATE INDEX invoices_company_branch_idx   ON invoices (company_id, branch_id, issue_date DESC);
CREATE INDEX invoices_company_customer_idx ON invoices (company_id, customer_id);
CREATE INDEX invoices_company_status_idx   ON invoices (company_id, status);

-- ---------------------------------------------------------------------------
-- 2. invoice_lines  (FAC-055..FAC-067)
-- ---------------------------------------------------------------------------
CREATE TABLE invoice_lines (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),   -- FAC-056
  company_id            uuid          NOT NULL REFERENCES companies(id),
  invoice_id            uuid          NOT NULL,                                -- FAC-067
  line_number           integer       NOT NULL CHECK (line_number >= 1),       -- FAC-066 (DEFINIR: o código usa a posição no array)
  product_id            uuid          NOT NULL,                                -- FAC-057
  product_code          text          NOT NULL,                                -- FAC-058 (snapshot)
  description           text          NOT NULL,                                -- FAC-059 (snapshot; hoje ignora descripcionFactura do produto)
  vat_treatment         text          NOT NULL,                                -- FAC-060
  vat_rate              smallint      NOT NULL,                                -- FAC-061
  -- FAC-061/DIV-03/Pergunta 5: o código deduz o % do NOME do imposto. Se o %IVA
  -- virar impuestoId, esta coluna é o vínculo (global taxes). Nullable = não
  -- compromete a regra. Sem CHECK de coerência com vat_rate (DEFINIR).
  tax_id                uuid          REFERENCES taxes(id),
  unit_of_measure_name  text          NOT NULL DEFAULT 'Unidad',               -- FAC-062 (snapshot do nome; FK p/ units_of_measure DEFINIR)
  quantity              numeric(18,4) NOT NULL DEFAULT 1,                      -- FAC-063
  unit_price            numeric(18,4) NOT NULL,                                -- FAC-064 (hoje = custo médio, DIV-02)
  line_total            numeric(18,4) NOT NULL,                                -- FAC-065
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT invoice_lines_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT invoice_lines_number_key UNIQUE (company_id, invoice_id, line_number),
  CONSTRAINT invoice_lines_invoice_fk FOREIGN KEY (company_id, invoice_id) REFERENCES invoices (company_id, id),
  CONSTRAINT invoice_lines_product_fk FOREIGN KEY (company_id, product_id) REFERENCES products (company_id, id),
  CONSTRAINT invoice_lines_vat_treatment_chk CHECK (vat_treatment IN ('GRAVADO','EXENTO')),
  CONSTRAINT invoice_lines_vat_rate_chk CHECK (vat_rate IN (0,5,10)),
  -- FAC-063/064 + DIV-08: min=0.001 / min=0 existem só no HTML; o JS aceita 0 ou
  -- negativo. O banco passa a exigir o que a tela promete.
  CONSTRAINT invoice_lines_quantity_chk CHECK (quantity > 0),
  CONSTRAINT invoice_lines_unit_price_chk CHECK (unit_price >= 0),
  -- FAC-065 (Regra 8): subtotal = cantidad x precioUnitario, sem arredondamento no
  -- código (float JS). A fórmula está provada; o ARREDONDAMENTO por moeda não
  -- (DIV-04). Por isso a tolerância é meia unidade da última casa de numeric(18,4):
  -- aceita qualquer arredondamento a 4 casas sem escolher um.
  CONSTRAINT invoice_lines_total_chk CHECK (abs(line_total - quantity * unit_price) <= 0.00005)
);
CREATE INDEX invoice_lines_product_idx ON invoice_lines (company_id, product_id);

-- ---------------------------------------------------------------------------
-- 3. invoice_taxes  (FAC-071..FAC-083: UMA linha por taxa 0/5/10)
-- ---------------------------------------------------------------------------
CREATE TABLE invoice_taxes (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid          NOT NULL REFERENCES companies(id),
  invoice_id           uuid          NOT NULL,
  vat_rate             smallint      NOT NULL,
  subtotal_amount      numeric(18,4) NOT NULL,                                 -- FAC-072/073/074 (exento / 5% / 10%)
  taxable_base_amount  numeric(18,4) NOT NULL DEFAULT 0,                       -- FAC-081/082 (base gravada; não existe para taxa 0)
  tax_amount           numeric(18,4) NOT NULL DEFAULT 0,                       -- FAC-076/077 (IVA)
  created_at           timestamptz   NOT NULL DEFAULT now(),
  updated_at           timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT invoice_taxes_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT invoice_taxes_rate_key UNIQUE (company_id, invoice_id, vat_rate),
  CONSTRAINT invoice_taxes_invoice_fk FOREIGN KEY (company_id, invoice_id) REFERENCES invoices (company_id, id),
  CONSTRAINT invoice_taxes_vat_rate_chk CHECK (vat_rate IN (0,5,10)),
  CONSTRAINT invoice_taxes_amounts_chk CHECK (subtotal_amount >= 0 AND taxable_base_amount >= 0 AND tax_amount >= 0),
  -- Coerência PROVADA por calcularTotalesFactura (Regra 12): o IVA é o RESTO
  -- (iva = subtotal - baseGravada), logo base + IVA = subtotal para 5% e 10%; a
  -- taxa 0 (exento) só tem subtotal — não há base nem IVA no código.
  -- NÃO há CHECK de base = round(subtotal/1,05|1,10): o arredondamento (inteiro,
  -- para qualquer moeda) é a divergência DIV-04, sem regra definida por moeda.
  CONSTRAINT invoice_taxes_coherence_chk CHECK (
    CASE WHEN vat_rate = 0 THEN taxable_base_amount = 0 AND tax_amount = 0
         ELSE taxable_base_amount + tax_amount = subtotal_amount END)
);

-- ---------------------------------------------------------------------------
-- 4. invoice_payments  (FAC-068..FAC-070)
-- ---------------------------------------------------------------------------
-- A UI só prova UM par medio/monto por fatura (FAC-068), mas o modelo-alvo admite N
-- (Pergunta 6/Regra 6): SEM unicidade por fatura (opção menos comprometedora).
-- Conciliação Σ pagamentos = total NÃO é imposta (DIV-05: o código não a faz).
CREATE TABLE invoice_payments (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid          NOT NULL REFERENCES companies(id),
  invoice_id  uuid          NOT NULL,
  method      text          NOT NULL DEFAULT 'EFECTIVO',                      -- FAC-069 (FK p/ payment_methods: DEFINIR)
  amount      numeric(18,4) NOT NULL DEFAULT 0,                               -- FAC-070
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT invoice_payments_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT invoice_payments_invoice_fk FOREIGN KEY (company_id, invoice_id) REFERENCES invoices (company_id, id),
  CONSTRAINT invoice_payments_method_chk CHECK (method IN ('EFECTIVO','TARJETA','TRANSFERENCIA','CHEQUE','OTRO')),
  CONSTRAINT invoice_payments_amount_chk CHECK (amount >= 0)                 -- min=0 da tela
);
CREATE INDEX invoice_payments_invoice_idx ON invoice_payments (company_id, invoice_id);

-- ---------------------------------------------------------------------------
-- 5. invoice_exports e invoice_public_procurements  (1:0..1; FAC-031..FAC-054)
-- ---------------------------------------------------------------------------
-- A coluna "habilitado" (FAC-032/FAC-049) NÃO existe: a presença da linha é o
-- "habilitado". DIV-10: no código ele nunca volta a false; como "desligar" não é
-- uma operação da tela, a remoção da linha (enquanto BORRADOR) é o equivalente.
CREATE TABLE invoice_exports (
  id                            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                    uuid          NOT NULL REFERENCES companies(id),
  invoice_id                    uuid          NOT NULL,
  operation_type                text          NOT NULL DEFAULT '',   -- FAC-033 (DIV-11: default 'Exportación' no form × '' no mock => sem default de negócio)
  negotiation_condition         text          NOT NULL DEFAULT '',   -- FAC-034 (FK p/ incoterms: DEFINIR, Pergunta 11)
  destination_country           text          NOT NULL DEFAULT '',   -- FAC-035 (FK p/ geo_countries: DEFINIR)
  freight_company               text          NOT NULL DEFAULT '',   -- FAC-036
  transport_agent               text          NOT NULL DEFAULT '',   -- FAC-037
  export_city                   text          NOT NULL DEFAULT '',   -- FAC-044 (FK p/ geo_cities: DEFINIR)
  gross_weight                  numeric(18,4) NOT NULL DEFAULT 0,    -- FAC-045 (unidade de peso: DEFINIR; sem min no código => sem CHECK)
  net_weight                    numeric(18,4) NOT NULL DEFAULT 0,    -- FAC-046 (sem conferência neto <= bruto no código => sem CHECK)
  -- Campos ÓRFÃOS (existem no tipo, sem input na tela — DIV-09, INFERIDO, Pergunta 11):
  -- ficam NULLABLE até a primeira entrega confirmar se entram.
  payment_instructions          text,                                -- FAC-038
  bill_of_lading_number         text,                                -- FAC-039
  cargo_manifest_number         text,                                -- FAC-040
  barge_tug                     text,                                -- FAC-041
  transported_goods_description text,                                -- FAC-042
  transported_goods_quantity    numeric(18,4),                       -- FAC-043
  other_notes                   text,                                -- FAC-047
  created_at                    timestamptz   NOT NULL DEFAULT now(),
  updated_at                    timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT invoice_exports_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT invoice_exports_invoice_key UNIQUE (company_id, invoice_id),    -- 1:0..1
  CONSTRAINT invoice_exports_invoice_fk FOREIGN KEY (company_id, invoice_id) REFERENCES invoices (company_id, id)
);

CREATE TABLE invoice_public_procurements (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid        NOT NULL REFERENCES companies(id),
  invoice_id         uuid        NOT NULL,
  modality           text        NOT NULL DEFAULT '',     -- FAC-050 (texto livre, sem catálogo)
  entity_name        text        NOT NULL DEFAULT '',     -- FAC-051
  procurement_code   text        NOT NULL DEFAULT '',     -- FAC-052
  contract_number    text,                                -- FAC-053 (órfão, DIV-09)
  contract_date      date,                                -- FAC-054 (órfão; alvo NULL, não '')
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_public_procurements_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT invoice_public_procurements_invoice_key UNIQUE (company_id, invoice_id),  -- 1:0..1
  CONSTRAINT invoice_public_procurements_invoice_fk FOREIGN KEY (company_id, invoice_id) REFERENCES invoices (company_id, id)
);

-- ---------------------------------------------------------------------------
-- 6. document_sequences — PROPOSTA CONDICIONAL (Entidades novas; Pergunta 3)
-- ---------------------------------------------------------------------------
-- Problema (DIV-07, Regra 10): a regra ATUAL é "maior valor global + 1" sobre todas
-- as facturas do localStorage, sem separar empresa/estabelecimento/ponto, sem
-- transação e sem validar o número digitado. Em banco, dois emissores simultâneos
-- obteriam o mesmo MAX()+1. A unicidade (invoices_company_fiscal_number_key) é a
-- trava; esta tabela é a PROPOSTA para gerar o próximo número sem colisão:
-- next_document_number() faz SELECT ... FOR UPDATE na linha do contador, dentro da
-- transação de emissão. Se a transação der ROLLBACK o incremento também desfaz
-- (numeração sem lacunas por rollback). DEFINIR: Pergunta 3 (por empresa +
-- estabelecimento + punto? com timbrado? sem lacunas?). Se a resposta for outra,
-- só esta tabela e a função mudam; invoices não depende dela.
CREATE TABLE document_sequences (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid        NOT NULL REFERENCES companies(id),
  sequence_type         text        NOT NULL,
  establishment_code    text        NOT NULL DEFAULT '',
  issuance_point_code   text        NOT NULL DEFAULT '',
  last_value            bigint      NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_sequences_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT document_sequences_scope_key
    UNIQUE (company_id, sequence_type, establishment_code, issuance_point_code),
  CONSTRAINT document_sequences_type_chk CHECK (sequence_type IN ('FISCAL_SEQUENCE','INTERNAL_NUMBER')),
  -- FISCAL_SEQUENCE: por empresa + estabelecimento + ponto (3 dígitos cada), máx. 7 dígitos.
  -- INTERNAL_NUMBER ('FAC-' + número): por empresa (Regra 9), sem estabelecimento/ponto.
  CONSTRAINT document_sequences_scope_chk CHECK (
    (sequence_type = 'FISCAL_SEQUENCE'
       AND establishment_code ~ '^[0-9]{3}$' AND issuance_point_code ~ '^[0-9]{3}$'
       AND last_value BETWEEN 0 AND 9999999)
    OR (sequence_type = 'INTERNAL_NUMBER'
       AND establishment_code = '' AND issuance_point_code = '' AND last_value >= 0))
);

-- SECURITY INVOKER (padrão): roda sob o RLS do chamador; a empresa vem de
-- app_company_id(), nunca de parâmetro (evita pedir número de outra empresa).
CREATE OR REPLACE FUNCTION next_document_number(
  p_sequence_type       text,
  p_establishment_code  text DEFAULT '',
  p_issuance_point_code text DEFAULT ''
) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE
  v_company uuid := app_company_id();
  v_value   bigint;
BEGIN
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'next_document_number: app.company_id não definido' USING ERRCODE = 'DN006';
  END IF;
  -- 1) garante a linha do contador (concorrente: o 2º INSERT espera o 1º confirmar e não faz nada)
  INSERT INTO document_sequences (company_id, sequence_type, establishment_code, issuance_point_code)
  VALUES (v_company, p_sequence_type, p_establishment_code, p_issuance_point_code)
  ON CONFLICT (company_id, sequence_type, establishment_code, issuance_point_code) DO NOTHING;
  -- 2) trava a linha: quem chega depois espera o COMMIT/ROLLBACK de quem já travou
  SELECT last_value INTO v_value FROM document_sequences
   WHERE company_id = v_company AND sequence_type = p_sequence_type
     AND establishment_code = p_establishment_code AND issuance_point_code = p_issuance_point_code
   FOR UPDATE;
  v_value := v_value + 1;
  UPDATE document_sequences SET last_value = v_value
   WHERE company_id = v_company AND sequence_type = p_sequence_type
     AND establishment_code = p_establishment_code AND issuance_point_code = p_issuance_point_code;
  RETURN v_value;
END $$;
COMMENT ON FUNCTION next_document_number(text, text, text) IS
  'PROPOSTA (Pergunta 3). Próximo número do contador (empresa da sessão) com SELECT ... FOR UPDATE. Usar na MESMA transação que grava a fatura. Formato: lpad(n::text,7,''0'') p/ sequence_number; ''FAC-''||lpad(n::text,6,''0'') p/ internal_number.';

-- ---------------------------------------------------------------------------
-- 7. Imutabilidade da fatura EMITIDA/APROBADA (FAC-088: "nenhum fluxo de edição")
-- ---------------------------------------------------------------------------
-- Evidência: o mapeamento confirma que NÃO há edição (types/facturas.ts; FAC-088:
-- actualizadoEn "nunca alterado"; Regra 1: nenhuma transição além de criar APROBADA).
-- Regra implementada (trigger, não depende da aplicação):
--  a) Fatura em EMITIDA/APROBADA: DELETE bloqueado (DN001); UPDATE só pode mudar
--     status, sifen_message e cdc (cdc só de NULL para um valor; nunca trocado) —
--     qualquer outra coluna alterada => DN001. Voltar para BORRADOR é bloqueado
--     (reabriria a edição).
--  b) Filhos (linhas, impostos, pagamentos, exportação, contratação pública) de
--     fatura EMITIDA/APROBADA: INSERT/UPDATE/DELETE bloqueados (DN001).
--  c) Nascer já em EMITIDA/APROBADA é bloqueado (DN005): os filhos precisariam
--     existir antes; a fatura nasce BORRADOR, recebe os filhos e SÓ ENTÃO muda de estado.
--  d) Ao entrar em EMITIDA/APROBADA a coerência é conferida (DN003 sem linhas —
--     "Agregue al menos un producto", FAC-055; DN002 totais): total_amount e
--     invoice_taxes devem bater com as linhas, pela classificação provada na
--     Regra 12 (EXENTO ou %=0 => exento; %=5 => 5; demais => 10).
--  e) Estabelecimento coerente com a sucursal (DN004; FAC-006): se
--     branches.sifen_establishment está preenchido, establishment_code deve ser igual.
-- LIMITES (PENDÊNCIAS 2): a máquina de estados NÃO é imposta (Pergunta 4);
-- RECHAZADA/ANULADA/BORRADOR continuam editáveis e apagáveis, e a rota
-- EMITIDA -> RECHAZADA -> (editar) -> APROBADA é revalidada só nos totais.
-- Manutenção/importação autorizada: desabilitar o trigger é ato de DBA, fora do app.

CREATE OR REPLACE FUNCTION invoices_validate_totals(p_company uuid, p_invoice uuid, p_total numeric)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  n_lines integer; ex numeric; s5 numeric; s10 numeric; t numeric; r smallint; exp_v numeric;
BEGIN
  SELECT count(*),
         coalesce(sum(line_total) FILTER (WHERE vat_treatment = 'EXENTO' OR vat_rate = 0), 0),
         coalesce(sum(line_total) FILTER (WHERE NOT (vat_treatment = 'EXENTO' OR vat_rate = 0) AND vat_rate = 5), 0),
         coalesce(sum(line_total) FILTER (WHERE NOT (vat_treatment = 'EXENTO' OR vat_rate = 0) AND vat_rate NOT IN (0, 5)), 0),
         coalesce(sum(line_total), 0)
    INTO n_lines, ex, s5, s10, t
    FROM invoice_lines WHERE company_id = p_company AND invoice_id = p_invoice;
  IF n_lines = 0 THEN
    RAISE EXCEPTION 'fatura sem linhas não pode ser emitida (FAC-055)' USING ERRCODE = 'DN003';
  END IF;
  IF p_total <> t THEN
    RAISE EXCEPTION 'total_amount % difere da soma das linhas %', p_total, t USING ERRCODE = 'DN002';
  END IF;
  FOREACH r IN ARRAY ARRAY[0, 5, 10]::smallint[] LOOP
    exp_v := CASE r WHEN 0 THEN ex WHEN 5 THEN s5 ELSE s10 END;
    IF (SELECT coalesce(sum(subtotal_amount), 0) FROM invoice_taxes
         WHERE company_id = p_company AND invoice_id = p_invoice AND vat_rate = r) <> exp_v THEN
      RAISE EXCEPTION 'invoice_taxes taxa % difere da soma das linhas (esperado %)', r, exp_v USING ERRCODE = 'DN002';
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION invoices_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_locked constant text[] := ARRAY['EMITIDA','APROBADA'];
  v_est    text;
  v_skip   constant text[] := ARRAY['status','sifen_message','cdc','updated_at'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = ANY (v_locked) THEN
      RAISE EXCEPTION 'fatura % não pode ser apagada', OLD.status USING ERRCODE = 'DN001';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
     OR NEW.establishment_code IS DISTINCT FROM OLD.establishment_code THEN
    SELECT sifen_establishment INTO v_est FROM branches
     WHERE company_id = NEW.company_id AND id = NEW.branch_id;
    IF v_est IS NOT NULL AND v_est <> NEW.establishment_code THEN
      RAISE EXCEPTION 'establishment_code % difere do estabelecimento SIFEN da sucursal (%)', NEW.establishment_code, v_est
        USING ERRCODE = 'DN004';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = ANY (v_locked) THEN
      RAISE EXCEPTION 'fatura nasce em BORRADOR; EMITIDA/APROBADA só por mudança de estado' USING ERRCODE = 'DN005';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = ANY (v_locked) THEN
    IF NEW.status = 'BORRADOR' THEN
      RAISE EXCEPTION 'fatura % não volta para BORRADOR', OLD.status USING ERRCODE = 'DN001';
    END IF;
    IF (to_jsonb(NEW) - v_skip) IS DISTINCT FROM (to_jsonb(OLD) - v_skip)
       OR (OLD.cdc IS NOT NULL AND NEW.cdc IS DISTINCT FROM OLD.cdc) THEN
      RAISE EXCEPTION 'fatura % é imutável: só status, sifen_message e cdc (uma vez) mudam', OLD.status
        USING ERRCODE = 'DN001';
    END IF;
  ELSIF NEW.status = ANY (v_locked) THEN
    -- entrada em EMITIDA/APROBADA: trava a própria linha (filhos novos esperam) e confere os totais
    PERFORM 1 FROM invoices WHERE company_id = OLD.company_id AND id = OLD.id FOR UPDATE;
    PERFORM invoices_validate_totals(NEW.company_id, NEW.id, NEW.total_amount);
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION invoice_children_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_status text;
  v_ids    uuid[] := ARRAY[]::uuid[];
  v_id     uuid;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN v_ids := v_ids || OLD.invoice_id; END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN v_ids := v_ids || NEW.invoice_id; END IF;
  FOREACH v_id IN ARRAY v_ids LOOP
    -- FOR SHARE: uma mudança concorrente de estado da fatura espera esta transação
    SELECT status INTO v_status FROM invoices
     WHERE company_id = CASE WHEN TG_OP = 'DELETE' THEN OLD.company_id ELSE NEW.company_id END
       AND id = v_id FOR SHARE;
    IF v_status IN ('EMITIDA','APROBADA') THEN
      RAISE EXCEPTION '% de fatura % é bloqueado em %', TG_OP, v_status, TG_TABLE_NAME USING ERRCODE = 'DN001';
    END IF;
  END LOOP;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE TRIGGER invoices_guard_trg
  BEFORE INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION invoices_guard();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['invoice_lines','invoice_taxes','invoice_payments','invoice_exports','invoice_public_procurements'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION invoice_children_guard()',
                   t||'_immutable_guard', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 8. updated_at automático e RLS (padrão P001 §9/§10)
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['invoices','invoice_lines','invoice_taxes','invoice_payments','invoice_exports',
                           'invoice_public_procurements','document_sequences'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t||'_set_updated_at', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY %I ON %I USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id())$p$,
                   t||'_tenant_isolation', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 9. DASHBOARD — DERIVADO, NENHUMA TABELA (DSH-*; DIV-19..DIV-22)
-- ---------------------------------------------------------------------------
-- Todos os números do dashboard são literais no código; no alvo são consultas
-- agregadas. PROPOSTA de view (COMENTADA, não criada) para os cards do listado
-- (FAC-109..FAC-112). Usa security_invoker para respeitar o RLS do chamador.
-- NÃO soma moedas diferentes (DIV-17) e NÃO decide quais estados contam como
-- "venda" (Pergunta 8): a view só agrupa; o filtro é da consulta.
--
-- CREATE VIEW invoice_status_summary WITH (security_invoker = true) AS
--   SELECT company_id, branch_id, currency_code, status,
--          count(*)          AS invoices_count,
--          sum(total_amount) AS total_amount
--     FROM invoices
--    GROUP BY company_id, branch_id, currency_code, status;

-- =============================================================================
-- PENDÊNCIAS DE DEFINIÇÃO
-- =============================================================================
--  1. CDC (Pergunta 2, DIV-06): 43 (gerado) × 44 (mock/oficial). Coluna text SEM CHECK
--     de tamanho, só dígitos. Definir estrutura oficial (44 com DV), quem gera e
--     quando é preenchido (NULL até aprovar). Timbrado/tipo de documento/código de
--     segurança/protocolo/XML/KuDE/datas de envio-aprovação: NÃO modelados (Pergunta 1).
--  2. Máquina de estados (Pergunta 4, DIV-12): transições e quem anula NÃO são impostas.
--     Só EMITIDA/APROBADA são travadas; BORRADOR/RECHAZADA/ANULADA continuam editáveis e
--     apagáveis (inclusive o caminho APROBADA -> ANULADA/RECHAZADA -> editar). Também
--     DEFINIR se cdc/sifen_message devem poder mudar em fatura travada (hoje: sim,
--     cdc uma única vez) e o fluxo de nota de crédito/anulação (sem tela, sem tabela).
--  3. Numeração (Pergunta 3, DIV-07): unicidade imposta por empresa + estabelecimento +
--     ponto + sequência (e internal_number por empresa). document_sequences /
--     next_document_number() são PROPOSTA: confirmar escopo, timbrado, lacunas e se
--     internal_number continua separado do número fiscal. Nada obriga a fatura a
--     usar o contador (o número digitado à mão continua válido se único).
--  4. Totais (DIV-04, Pergunta 7): arredondamento por moeda e tipo de câmbio. O SQL só
--     prova base + IVA = subtotal; NÃO impõe base = round(subtotal/1,05|1,10).
--  5. Pagamentos (DIV-05, Pergunta 6): N por fatura permitido; Σ pagamentos = total NÃO
--     imposto; CREDITO sem prazo/vencimento/parcelas; FK para payment_methods/payment_terms.
--  6. Preço e IVA (DIV-02/DIV-03, Pergunta 5): o preço do demo é o custo médio; o % vem
--     do NOME do imposto. invoice_lines.tax_id nullable guarda o vínculo futuro com
--     taxes; par vat_treatment x vat_rate NÃO validado (GRAVADO+0%, EXENTO+10%).
--  7. Snapshot do receptor (Pergunta 9, DIV-01): manter customer_*? campos obrigatórios
--     por naturaleza (RUC/DV)? de qual customer_addresses copiar o endereço?
--     customer_document_type sem CHECK (valores dependem de P002).
--  8. Exportação/contratação pública (Pergunta 11, DIV-09/10/11): 7+2 campos órfãos
--     nullable; FK para incoterms/geo_countries/geo_cities; unidade de peso; pesos sem CHECK.
--  9. Fuso/data (DIV-23): issue_date sem default (o UTC do código erra a data fiscal);
--     definir o fuso da empresa. Dashboard: KPIs, estados que contam como venda,
--     escopo por sucursal e permissão DASHBOARD.* (Pergunta 8) — nada persistido.
-- 10. Pontos de expedição e sucursais (Pergunta 10): issuance_points NÃO foi criada;
--     establishment_code/issuance_point_code são colunas text. Só há conferência com
--     branches.sifen_establishment quando preenchido. branch_id NOT NULL é decisão
--     desta proposta (FAC-003 está DEFINIR); created_by é nullable (FAC-089 DEFINIR).
-- 11. Permissões (DIV-18, REQ-2026-002 D-11): nenhuma coluna é sensível; emitir/anular
--     exige permissões inexistentes hoje (camada de dados). unit_price de linha vem do
--     custo médio no demo (DIV-02): se a regra de preço continuar assim, avaliar
--     -- SENSIVEL: PRODUCTOS_COSTO.VER na origem, não nesta tabela.
-- 12. liquidacionIva5/10 (Pergunta 12): iguais a iva5/iva10 no código; não persistidos.
-- Migração: ids/numeração DEMO (fac-<ts>, demo-prod-001, FAC-000001) NÃO migram (DIV-15).

COMMIT;
