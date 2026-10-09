-- =============================================================================
-- REQ-2026-003-P003-fornecedores-produtos-up.sql — PROPOSTA — NÃO EXECUTAR EM BANCO REAL
-- Objetivo : fornecedores e produtos em INGLÊS, multiempresa (17 tabelas):
--            supplier_groups, suppliers, supplier_contacts, supplier_addresses,
--            supplier_bank_accounts (SENSÍVEL), supplier_withholdings, supplier_documents,
--            product_categories, product_brands, products, product_codes, product_units,
--            product_suppliers, product_warehouse_settings, product_alternatives,
--            product_components, product_documents
--            + regras de integridade: kit sem auto-referência e sem ciclo; um principal
--            por tabela filha; uma única unidade base por produto.
-- Origem   : REQ-2026-003; REQ-2026-002 (DESENHO v5 §3.2-§3.4, §5, §6);
--            documentacao/banco/levantamento/campos/PROVEEDORES.md (PRV-001..PRV-171) e
--            documentacao/banco/levantamento/campos/PRODUCTOS.md (PRO-001..PRO-170)
-- Dialeto  : PostgreSQL >= 14 (gen_random_uuid() nativo). Validado só em PG 16.15 descartável.
-- Situação : DEFINIÇÃO DE ESTRUTURA-ALVO (greenfield). NÃO é migration pronta: o esquema real
--            está NAO_VERIFICADO (REQ-2026-003 §6). Em banco existente só entra após a
--            reconciliação (PLANO-MIGRACAO-INGLES.md: renomeação + views de compatibilidade).
-- Depende de: P001 (companies, branches, warehouses, users; app_company_id(), set_updated_at())
--            P002 (currencies[code], incoterms[code], payment_terms[company_id,id],
--            payment_methods[id], units_of_measure[id], taxes[id]) — contrato do brief.
-- Pós-valid: documentacao/banco/validacoes/TESTE-P003-fornecedores-produtos.sql
-- Impacto API: nenhum até o código passar a usar os nomes em inglês (adaptador/view de
--            compatibilidade). Valores de domínio ficam como no código (JURIDICA, MERCADERIA...).
-- Rollback : REQ-2026-003-P003-fornecedores-produtos-down.sql — só para banco DESCARTÁVEL.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Convenções desta proposta
-- ---------------------------------------------------------------------------
-- * Toda tabela: id uuid, company_id NOT NULL, UNIQUE (company_id, id), created_at/updated_at.
-- * FKs entre tabelas de negócio SEMPRE compostas (company_id, x_id) -> x (company_id, id).
--   Como company_id é NOT NULL, a FK composta de coluna opcional (x_id NULL) simplesmente
--   não é verificada (MATCH SIMPLE), o que é o comportamento desejado.
-- * Catálogos globais de P002 (currencies, incoterms, payment_methods, units_of_measure, taxes)
--   são referenciados por FK simples (sem company_id), conforme o contrato de dependências.
-- * Filhos de fornecedor/produto usam ON DELETE CASCADE para o pai: são partes do mesmo
--   agregado (o código atual os grava na mesma transação). A baixa de negócio é lógica
--   (is_active), não DELETE.
-- * Texto: tipo text + CHECK de comprimento (o código atual usa slice/Máx. em cada campo;
--   a DIV-08 de PRODUCTOS pede rejeitar em vez de truncar em silêncio).
-- * Quantidades/custos: numeric(18,4) (PRO-025..PRO-030: o código aceita decimais, a UI usa
--   passos de 0,001/0,0001); fatores de conversão numeric(18,6) (frações como 1/12 — precisão
--   DEFINIR); percentuais numeric(5,2) (PRV-028/039/111) e numeric(7,4) para merma (PRO-041);
--   dinheiro de fornecedor numeric(18,2) (PRV-029, DEFINIR 2 ou 4 casas). Nunca float.
-- * Domínios (CHECK) usam os valores EXATOS do código; onde o código não limita o valor
--   (tax_id_type, file_url), a coluna fica sem CHECK de valor: -- DEFINIR.

-- ---------------------------------------------------------------------------
-- 1. supplier_groups  (atual: grupos_proveedor)  PRV-127..PRV-131
-- ---------------------------------------------------------------------------
CREATE TABLE supplier_groups (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES companies(id),
  code        text,                                  -- PRV-128 -- DEFINIR: único por empresa? (sem UNIQUE até decidir)
  name        text        NOT NULL CHECK (length(btrim(name)) > 0),   -- PRV-129
  is_active   boolean     NOT NULL DEFAULT true,     -- PRV-131 (catálogo lido com activo = true)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_groups_company_id_id_key UNIQUE (company_id, id)
);

-- ---------------------------------------------------------------------------
-- 2. suppliers  (atual: proveedores)  PRV-001..PRV-052
-- ---------------------------------------------------------------------------
CREATE TABLE suppliers (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),   -- PRV-001
  company_id                uuid        NOT NULL REFERENCES companies(id),       -- PRV-002 (vem da sessão)
  code                      text,           -- PRV-003 'PRV-NNNNNN'. -- DEFINIR: quem gera/sequência por empresa (DIV-04); por isso anulável
  person_type               text        NOT NULL DEFAULT 'JURIDICA'
                                        CONSTRAINT suppliers_person_type_chk CHECK (person_type IN ('JURIDICA','FISICA')),  -- PRV-004
  supplier_group_id         uuid,           -- PRV-006 (a UI hoje guarda o NOME, DIV-05)
  tax_id_type               text        NOT NULL DEFAULT 'RUC'                   -- PRV-008
                                        CONSTRAINT suppliers_tax_id_type_chk CHECK (tax_id_type = upper(tax_id_type) AND char_length(tax_id_type) BETWEEN 1 AND 30),
                                        -- DEFINIR: lista de valores (a UI oferece RUC, CEDULA, PASAPORTE, CEDULA_EXTRANJERA, CUIT, OTRO; a API não limita) => sem CHECK de valor
  tax_id                    text        NOT NULL                                  -- PRV-009 (RUC sem DV; sem espaços)
                                        CONSTRAINT suppliers_tax_id_chk CHECK (char_length(tax_id) BETWEEN 1 AND 50 AND tax_id !~ '[[:space:]]'),
  tax_id_check_digit        text        CONSTRAINT suppliers_dv_chk CHECK (tax_id_check_digit ~ '^[0-9]$'),  -- PRV-010 -- DEFINIR: módulo 11 não é validado
  legal_name                text        NOT NULL CONSTRAINT suppliers_legal_name_chk CHECK (length(btrim(legal_name)) > 0 AND char_length(legal_name) <= 200),  -- PRV-011
  trade_name                text        CONSTRAINT suppliers_trade_name_chk CHECK (char_length(trade_name) <= 200),   -- PRV-012
  country_code              text        NOT NULL DEFAULT 'PRY'                    -- PRV-013 ISO alfa-3; PRV-014 (country_name) NÃO é armazenado: deriva-se por join de geo_countries
                                        CONSTRAINT suppliers_country_code_chk CHECK (country_code ~ '^[A-Z]{3}$'),
                                        -- sem FK: a chave de geo_countries não está no contrato de P002 (ver PENDÊNCIAS)
  email                     text        CONSTRAINT suppliers_email_chk CHECK (char_length(email) <= 150 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),   -- PRV-015
  phone                     text        CONSTRAINT suppliers_phone_chk CHECK (char_length(phone) <= 50),     -- PRV-016
  website                   text        CONSTRAINT suppliers_website_chk CHECK (char_length(website) <= 300 AND website ~* '^https?://[^[:space:]]+$'),  -- PRV-017 (a API exige http/https)
  payment_term_id           uuid,           -- PRV-019 (payment_terms por empresa, contrato P002; DEFINIR §3.4)
  default_currency_code     text        CONSTRAINT suppliers_currency_fk REFERENCES currencies(code),        -- PRV-021 (a UI usa PYG por padrão; sem default no banco)
  preferred_payment_method_id uuid      CONSTRAINT suppliers_payment_method_fk REFERENCES payment_methods(id),  -- PRV-024 (contrato P002: payment_methods é GLOBAL; o mapeamento previa FK composta)
  preferred_payment_day     integer     CONSTRAINT suppliers_pay_day_chk CHECK (preferred_payment_day BETWEEN 1 AND 31),  -- PRV-026
  lead_time_days            integer     CONSTRAINT suppliers_lead_time_chk CHECK (lead_time_days >= 0),      -- PRV-027
  commercial_discount_pct   numeric(5,2) NOT NULL DEFAULT 0                       -- PRV-028 percentual 0..100 com 2 casas (UI step 0.01)
                                        CONSTRAINT suppliers_discount_chk CHECK (commercial_discount_pct BETWEEN 0 AND 100),
  minimum_purchase_amount   numeric(18,2) NOT NULL DEFAULT 0                      -- PRV-029 moeda = default_currency_code. -- DEFINIR: 2 ou 4 casas
                                        CONSTRAINT suppliers_min_amount_chk CHECK (minimum_purchase_amount >= 0),
  allows_advances           boolean     NOT NULL DEFAULT false,   -- PRV-030
  requires_purchase_order   boolean     NOT NULL DEFAULT false,   -- PRV-031
  payments_email            text        CONSTRAINT suppliers_pay_email_chk CHECK (char_length(payments_email) <= 150 AND payments_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),  -- PRV-032
  relationship_start_date   date,       -- PRV-033
  relationship_end_date     date,       -- PRV-034 (não inativa o fornecedor automaticamente -- DEFINIR)
  homologation_status       text        NOT NULL DEFAULT 'PENDIENTE'
                                        CONSTRAINT suppliers_homologation_chk CHECK (homologation_status IN ('PENDIENTE','EN_EVALUACION','HOMOLOGADO','RECHAZADO','SUSPENDIDO','VENCIDO')),  -- PRV-035 -- DEFINIR: VENCIDO automático por data?
  homologation_date         date,       -- PRV-036 -- DEFINIR: exigir quando HOMOLOGADO?
  homologation_expiry_date  date,       -- PRV-037
  risk_level                text        NOT NULL DEFAULT 'NO_EVALUADO'
                                        CONSTRAINT suppliers_risk_chk CHECK (risk_level IN ('NO_EVALUADO','BAJO','MEDIO','ALTO','CRITICO')),   -- PRV-038
  current_rating            numeric(5,2) CONSTRAINT suppliers_rating_chk CHECK (current_rating BETWEEN 0 AND 100),  -- PRV-039 -- DEFINIR: origem do cálculo
  incoterm_code             text        CONSTRAINT suppliers_incoterm_fk REFERENCES incoterms(code),          -- PRV-040
  delivery_terms            text        CONSTRAINT suppliers_delivery_terms_chk CHECK (char_length(delivery_terms) <= 500),   -- PRV-042
  preferred_transport_method text       CONSTRAINT suppliers_transport_chk CHECK (preferred_transport_method IN ('TERRESTRE','MARITIMO','AEREO','FERROVIARIO','MULTIMODAL','OTRO')),  -- PRV-043
  order_confirmation_days   integer     CONSTRAINT suppliers_confirm_days_chk CHECK (order_confirmation_days >= 0),   -- PRV-044
  allows_partial_delivery   boolean     NOT NULL DEFAULT true,    -- PRV-045 (default TRUE no código: UI e API)
  notes                     text        CONSTRAINT suppliers_notes_chk CHECK (char_length(notes) <= 2000),   -- PRV-046
  is_active                 boolean     NOT NULL DEFAULT true,    -- PRV-047 (baixa lógica)
  is_blocked                boolean     NOT NULL DEFAULT false,   -- PRV-048 -- DEFINIR: efeito do bloqueio e quem o altera
  block_reason              text,       -- PRV-049 -- DEFINIR: obrigatório quando bloqueado? (sem CHECK)
  created_by                uuid,       -- PRV-052 (auditoria transversal; DEFINIR)
  created_at                timestamptz NOT NULL DEFAULT now(),       -- PRV-050
  updated_at                timestamptz NOT NULL DEFAULT now(),       -- PRV-051
  CONSTRAINT suppliers_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT suppliers_company_code_key  UNIQUE (company_id, code),  -- NULLs distintos: vários sem código até a regra de geração ser definida
  CONSTRAINT suppliers_company_document_key UNIQUE (company_id, tax_id_type, tax_id),  -- PRV-009: o código traduz 23505 de '…empresa_documento…' para 409; alcance exato -- DEFINIR
  CONSTRAINT suppliers_group_fk       FOREIGN KEY (company_id, supplier_group_id) REFERENCES supplier_groups (company_id, id),
  CONSTRAINT suppliers_payment_term_fk FOREIGN KEY (company_id, payment_term_id)  REFERENCES payment_terms (company_id, id),
  CONSTRAINT suppliers_created_by_fk  FOREIGN KEY (company_id, created_by)        REFERENCES users (company_id, id),
  -- Regras confirmadas no código (PROVEEDORES regras 4 e 5):
  CONSTRAINT suppliers_pry_ruc_chk  CHECK (country_code <> 'PRY' OR tax_id_type = 'RUC'),   -- país PRY exige RUC
  CONSTRAINT suppliers_ruc_chk      CHECK (tax_id_type <> 'RUC' OR (tax_id ~ '^[0-9]{3,8}$' AND tax_id_check_digit IS NOT NULL)),  -- RUC: 3..8 dígitos + DV
  CONSTRAINT suppliers_dv_only_ruc_chk CHECK (tax_id_type = 'RUC' OR tax_id_check_digit IS NULL),  -- DV só existe para RUC (DIV-30)
  CONSTRAINT suppliers_relationship_dates_chk CHECK (relationship_end_date IS NULL OR relationship_start_date IS NULL OR relationship_end_date >= relationship_start_date),
  CONSTRAINT suppliers_homologation_dates_chk CHECK (homologation_expiry_date IS NULL OR homologation_date IS NULL OR homologation_expiry_date >= homologation_date)
);
CREATE INDEX suppliers_company_active_idx ON suppliers (company_id, is_active, legal_name);   -- listagem ORDER BY razon_social

-- ---------------------------------------------------------------------------
-- 3. Filhos de fornecedor
-- ---------------------------------------------------------------------------
-- 3.1 supplier_contacts (atual: proveedor_contactos)  PRV-058..PRV-075
CREATE TABLE supplier_contacts (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid        NOT NULL REFERENCES companies(id),    -- PRV-060
  supplier_id             uuid        NOT NULL,                              -- PRV-059
  first_name              text        NOT NULL CHECK (length(btrim(first_name)) > 0 AND char_length(first_name) <= 100),   -- PRV-061
  last_name               text        CHECK (char_length(last_name) <= 100),    -- PRV-062
  job_title               text        CHECK (char_length(job_title) <= 100),    -- PRV-063
  department              text        CHECK (char_length(department) <= 100),   -- PRV-064 (área; não confundir com departamento geográfico)
  phone                   text        CHECK (char_length(phone) <= 50),         -- PRV-065
  mobile                  text        CHECK (char_length(mobile) <= 50),        -- PRV-066
  email                   text        CHECK (char_length(email) <= 150 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),  -- PRV-067
  is_primary              boolean     NOT NULL DEFAULT false,   -- PRV-068 (no máx. um principal: índice parcial abaixo)
  receives_quotations     boolean     NOT NULL DEFAULT false,   -- PRV-069
  receives_purchase_orders boolean    NOT NULL DEFAULT false,   -- PRV-070
  receives_logistics      boolean     NOT NULL DEFAULT false,   -- PRV-071
  receives_returns        boolean     NOT NULL DEFAULT false,   -- PRV-072
  receives_payments       boolean     NOT NULL DEFAULT false,   -- PRV-073
  receives_quality        boolean     NOT NULL DEFAULT false,   -- PRV-074
  receives_notifications  boolean     NOT NULL DEFAULT true,    -- PRV-075 (único flag com default true)
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_contacts_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT supplier_contacts_supplier_fk FOREIGN KEY (company_id, supplier_id) REFERENCES suppliers (company_id, id) ON DELETE CASCADE
);
CREATE INDEX supplier_contacts_supplier_idx ON supplier_contacts (company_id, supplier_id);
CREATE UNIQUE INDEX supplier_contacts_one_primary_uq ON supplier_contacts (company_id, supplier_id) WHERE is_primary;   -- substitui '…contacto_principal…'

-- 3.2 supplier_addresses (atual: proveedor_direcciones)  PRV-076..PRV-092
CREATE TABLE supplier_addresses (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid        NOT NULL REFERENCES companies(id),   -- PRV-078
  supplier_id      uuid        NOT NULL,                             -- PRV-077
  address_type     text        NOT NULL CONSTRAINT supplier_addresses_type_chk CHECK (address_type IN ('FISCAL','COMERCIAL','RETIRO','PAGOS','OTRA')),  -- PRV-079
  description      text        NOT NULL CHECK (length(btrim(description)) > 0 AND char_length(description) <= 150),   -- PRV-080
  street_address   text        NOT NULL CHECK (length(btrim(street_address)) > 0 AND char_length(street_address) <= 300),  -- PRV-081 (evita colisão com o nome da tabela)
  house_number     text        CHECK (char_length(house_number) <= 20),   -- PRV-082
  country_code     text        NOT NULL CONSTRAINT supplier_addresses_country_chk CHECK (country_code ~ '^[A-Z]{3}$'),   -- PRV-083 (PRV-084 country_name não é armazenado). Sem FK: ver PENDÊNCIAS
  department_code  integer     CONSTRAINT supplier_addresses_dep_chk CHECK (department_code > 0),   -- PRV-085 (geo_departments.code)
  district_code    integer     CONSTRAINT supplier_addresses_dis_chk CHECK (district_code > 0),     -- PRV-086
  city_code        integer     CONSTRAINT supplier_addresses_city_chk CHECK (city_code > 0),        -- PRV-087
  department_name  text        CHECK (char_length(department_name) <= 150),   -- PRV-088 texto livre para países sem catálogo
  district_name    text        CHECK (char_length(district_name) <= 150),     -- PRV-089
  city_name        text        CHECK (char_length(city_name) <= 150),         -- PRV-090
  postal_code      text        CHECK (char_length(postal_code) <= 30),        -- PRV-091
  is_primary       boolean     NOT NULL DEFAULT false,   -- PRV-092 (um principal por tipo: índice parcial abaixo)
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_addresses_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT supplier_addresses_supplier_fk FOREIGN KEY (company_id, supplier_id) REFERENCES suppliers (company_id, id) ON DELETE CASCADE,
  -- Regra confirmada (regra 14): PRY exige os três códigos; fora de PRY os códigos são NULL (usa-se o texto livre).
  -- A API também grava NULL nos textos quando PRY; aqui isso NÃO é imposto (DIV-07: a UI atual só tem texto) -- DEFINIR
  CONSTRAINT supplier_addresses_geo_codes_chk CHECK (
    (country_code = 'PRY' AND department_code IS NOT NULL AND district_code IS NOT NULL AND city_code IS NOT NULL)
    OR (country_code <> 'PRY' AND department_code IS NULL AND district_code IS NULL AND city_code IS NULL))
);
CREATE INDEX supplier_addresses_supplier_idx ON supplier_addresses (company_id, supplier_id);
CREATE UNIQUE INDEX supplier_addresses_one_primary_per_type_uq ON supplier_addresses (company_id, supplier_id, address_type) WHERE is_primary;  -- '…direccion_principal_tipo…'

-- 3.3 supplier_bank_accounts (atual: proveedor_cuentas_bancarias)  PRV-093..PRV-106
-- SENSIVEL: PROVEEDORES_BANCARIO.VER / PROVEEDORES_BANCARIO.EDITAR (REQ-2026-002, classe DATO_SENSIBLE)
-- A tabela inteira é dado financeiro sensível. A proteção por permissão (e o mascaramento de
-- account_number, iban, swift_code, holder_tax_id) é da camada de dados, NÃO do SQL (DIV-23).
CREATE TABLE supplier_bank_accounts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid        NOT NULL REFERENCES companies(id),   -- PRV-095
  supplier_id     uuid        NOT NULL,                             -- PRV-094
  bank_name       text        NOT NULL CHECK (length(btrim(bank_name)) > 0 AND char_length(bank_name) <= 150),        -- PRV-096 SENSIVEL: PROVEEDORES_BANCARIO.VER
  bank_branch     text        CHECK (char_length(bank_branch) <= 150),                                                  -- PRV-097 SENSIVEL: PROVEEDORES_BANCARIO.VER
  account_holder  text        NOT NULL CHECK (length(btrim(account_holder)) > 0 AND char_length(account_holder) <= 200), -- PRV-098 SENSIVEL: PROVEEDORES_BANCARIO.VER (titular x razão social não é verificado -- DEFINIR)
  holder_tax_id   text        CHECK (char_length(holder_tax_id) <= 100),                                                -- PRV-099 SENSIVEL: PROVEEDORES_BANCARIO.VER (documento fiscal do titular)
  account_type    text        NOT NULL DEFAULT 'CORRIENTE'
                              CONSTRAINT supplier_bank_accounts_type_chk CHECK (account_type IN ('CORRIENTE','AHORRO','CAJA_AHORRO','OTRA')),  -- PRV-100 SENSIVEL: PROVEEDORES_BANCARIO.VER -- DEFINIR: AHORRO x CAJA_AHORRO
  account_number  text        NOT NULL CHECK (length(btrim(account_number)) > 0 AND char_length(account_number) <= 100),  -- PRV-101 SENSIVEL: PROVEEDORES_BANCARIO.VER -- DEFINIR: criptografia/mascaramento
  currency_code   text        NOT NULL REFERENCES currencies(code),                                                     -- PRV-102 SENSIVEL: PROVEEDORES_BANCARIO.VER
  alias           text        CHECK (char_length(alias) <= 100),                                                        -- PRV-103 SENSIVEL: PROVEEDORES_BANCARIO.VER
  swift_code      text        CHECK (char_length(swift_code) <= 30),                                                    -- PRV-104 SENSIVEL: PROVEEDORES_BANCARIO.VER (sem validação BIC)
  iban            text        CHECK (char_length(iban) <= 50),                                                          -- PRV-105 SENSIVEL: PROVEEDORES_BANCARIO.VER (sem validação IBAN)
  is_primary      boolean     NOT NULL DEFAULT false,                                                                   -- PRV-106 SENSIVEL: PROVEEDORES_BANCARIO.VER
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_bank_accounts_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT supplier_bank_accounts_supplier_fk FOREIGN KEY (company_id, supplier_id) REFERENCES suppliers (company_id, id) ON DELETE CASCADE,
  -- A API traduz 23505 de '…cuenta_bancaria…' em «ya registrada para este proveedor»: alcance exato NAO_VERIFICADO -- DEFINIR
  CONSTRAINT supplier_bank_accounts_number_key UNIQUE (company_id, supplier_id, account_number)
);
CREATE INDEX supplier_bank_accounts_supplier_idx ON supplier_bank_accounts (company_id, supplier_id);
CREATE UNIQUE INDEX supplier_bank_accounts_one_primary_uq ON supplier_bank_accounts (company_id, supplier_id) WHERE is_primary;  -- API 619: no máx. uma principal

-- 3.4 supplier_withholdings (atual: proveedor_retenciones)  PRV-107..PRV-116
CREATE TABLE supplier_withholdings (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid        NOT NULL REFERENCES companies(id),   -- PRV-109
  supplier_id           uuid        NOT NULL,                             -- PRV-108
  withholding_type      text        NOT NULL CONSTRAINT supplier_withholdings_type_chk CHECK (withholding_type IN ('IVA','RENTA','OTRA')),  -- PRV-110
  rate_pct              numeric(5,2) NOT NULL CONSTRAINT supplier_withholdings_rate_chk CHECK (rate_pct BETWEEN 0 AND 100),  -- PRV-111 -- DEFINIR: alíquotas legais permitidas
  certificate_required  boolean     NOT NULL DEFAULT false,   -- PRV-112 -- DEFINIR: relação com o documento CERTIFICADO_RETENCION
  valid_from            date,       -- PRV-113 (sobreposição de vigências não é controlada -- DEFINIR)
  valid_to              date,       -- PRV-114
  notes                 text        CHECK (char_length(notes) <= 1000),   -- PRV-115
  tax_id                uuid        REFERENCES taxes(id),   -- PRV-116 imposto do catálogo global taxes (não é o tax_id de suppliers!)
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_withholdings_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT supplier_withholdings_supplier_fk FOREIGN KEY (company_id, supplier_id) REFERENCES suppliers (company_id, id) ON DELETE CASCADE,
  CONSTRAINT supplier_withholdings_valid_chk CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);
CREATE INDEX supplier_withholdings_supplier_idx ON supplier_withholdings (company_id, supplier_id);

-- 3.5 supplier_documents (atual: proveedor_documentos)  PRV-117..PRV-126
CREATE TABLE supplier_documents (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid        NOT NULL REFERENCES companies(id),   -- PRV-119
  supplier_id    uuid        NOT NULL,                             -- PRV-118
  document_type  text        NOT NULL DEFAULT 'OTRO'
                 CONSTRAINT supplier_documents_type_chk CHECK (document_type IN ('CONTRATO','CONSTANCIA_RUC','CERTIFICADO_BANCARIO','CERTIFICADO_RETENCION','LICENCIA','OTRO')),  -- PRV-120
                 -- SENSIVEL (condicional): CERTIFICADO_BANCARIO contém dados bancários -- DEFINIR se cai sob PROVEEDORES_BANCARIO.VER
  file_name      text        NOT NULL CHECK (length(btrim(file_name)) > 0 AND char_length(file_name) <= 255),   -- PRV-121
  file_url       text        NOT NULL CHECK (length(btrim(file_url)) > 0),   -- PRV-122 -- DEFINIR: esquema permitido (https), upload real e tamanho (hoje URL digitada, sem validação)
  issue_date     date,       -- PRV-123
  expiry_date    date,       -- PRV-124 (sem alertas de vencimento no código)
  notes          text        CHECK (char_length(notes) <= 1000),   -- PRV-125
  created_by     uuid,       -- PRV-126 (cargado_por = session.user.id). Anulável: -- DEFINIR (registros migrados sem autor)
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_documents_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT supplier_documents_supplier_fk FOREIGN KEY (company_id, supplier_id) REFERENCES suppliers (company_id, id) ON DELETE CASCADE,
  CONSTRAINT supplier_documents_created_by_fk FOREIGN KEY (company_id, created_by) REFERENCES users (company_id, id),
  CONSTRAINT supplier_documents_dates_chk CHECK (expiry_date IS NULL OR issue_date IS NULL OR expiry_date >= issue_date)
);
CREATE INDEX supplier_documents_supplier_idx ON supplier_documents (company_id, supplier_id);

-- ---------------------------------------------------------------------------
-- 4. Catálogos por empresa de produto  (PRO-120..PRO-124)
-- ---------------------------------------------------------------------------
CREATE TABLE product_categories (            -- atual: categorias_producto
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES companies(id),
  code        text,       -- PRO-121 -- DEFINIR: unicidade por empresa
  name        text        NOT NULL CHECK (length(btrim(name)) > 0),   -- PRO-122
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_categories_company_id_id_key UNIQUE (company_id, id)
  -- Sem parent_id: hierarquia categoria/família/linha é pergunta aberta Q-03 (ver PENDÊNCIAS).
);

CREATE TABLE product_brands (                -- atual: marcas_producto
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES companies(id),
  code        text,       -- a UI exibe `codigo · nombre` mas o SELECT atual não o traz (DIV-18) -- DEFINIR
  name        text        NOT NULL CHECK (length(btrim(name)) > 0),   -- PRO-124
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_brands_company_id_id_key UNIQUE (company_id, id)
);

-- ---------------------------------------------------------------------------
-- 5. products  (atual: productos)  PRO-001..PRO-055, PRO-063..PRO-065
-- ---------------------------------------------------------------------------
-- NÃO modelados aqui (dependem de DEFINIR e de P004/P005): stock_actual/initial_inventory
-- (saldo vem do kardex, Q-04/DIV-30), sale_reference_price/valor (preço vive em price_lists, Q-06).
CREATE TABLE products (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),    -- PRO-001
  company_id                  uuid        NOT NULL REFERENCES companies(id),        -- PRO-002
  code                        text        NOT NULL CONSTRAINT products_code_chk CHECK (length(btrim(code)) > 0 AND char_length(code) <= 80),   -- PRO-003 (API exige; geração automática -- DEFINIR Q-02)
  inventory_code              text,       -- PRO-004 código do inventário do cliente (hoje só DEMO). -- DEFINIR Q-08: campo próprio ou product_codes? Sem UNIQUE (o mock traz 5 repetidos)
  sifen_code                  text        CONSTRAINT products_sifen_code_chk CHECK (char_length(sifen_code) <= 20),   -- PRO-005 -- DEFINIR: formato e unicidade
  barcode                     text        CONSTRAINT products_barcode_chk CHECK (char_length(barcode) <= 80),         -- PRO-006 -- DEFINIR: qual prevalece entre barcode, product_codes e product_units.barcode
  description                 text        NOT NULL CONSTRAINT products_description_chk CHECK (length(btrim(description)) > 0 AND char_length(description) <= 300),   -- PRO-007
  invoice_description         text        NOT NULL CONSTRAINT products_invoice_desc_chk CHECK (length(btrim(invoice_description)) > 0 AND char_length(invoice_description) <= 120),  -- PRO-008
  product_type                text        NOT NULL DEFAULT 'MERCADERIA'
                              CONSTRAINT products_type_chk CHECK (product_type IN ('MERCADERIA','SERVICIO','KIT','ACTIVO_FIJO')),   -- PRO-009 -- DEFINIR: regras por tipo
  category_id                 uuid,       -- PRO-010
  brand_id                    uuid,       -- PRO-012
  family_id                   uuid,       -- PRO-014 DEMO. SEM FK: product_families não está no contrato (Q-03) -- DEFINIR
  line_id                     uuid,       -- PRO-015 DEMO. SEM FK: product_lines não está no contrato (Q-03) -- DEFINIR
  origin_label                text,       -- PRO-016 procedência (DEMO) -- DEFINIR: dado próprio ou redundante com origin_country_code
  unit_of_measure_id          uuid        NOT NULL REFERENCES units_of_measure(id),   -- PRO-017 unidade base do estoque (units_of_measure é GLOBAL no contrato P002)
  tax_id                      uuid        REFERENCES taxes(id),                       -- PRO-019 (taxes GLOBAL no contrato P002)
  tracks_stock                boolean     NOT NULL DEFAULT true,   -- PRO-021 -- DEFINIR: UI true x API false se omitido (DIV-10); interação com SERVICIO
  stock_control_mode          text        NOT NULL DEFAULT 'CANTIDAD'
                              CONSTRAINT products_stock_mode_chk CHECK (stock_control_mode IN ('CANTIDAD','LOTE','UNIDAD_ETIQUETADA')),   -- PRO-022
  allows_third_party_stock    boolean     NOT NULL DEFAULT false,  -- PRO-023
  requires_expiry             boolean     NOT NULL DEFAULT false,  -- PRO-024
  min_stock                   numeric(18,4) NOT NULL DEFAULT 0 CONSTRAINT products_min_stock_chk CHECK (min_stock >= 0),   -- PRO-025 numeric(18,4): o API aceita decimais
  max_stock                   numeric(18,4) CONSTRAINT products_max_stock_chk CHECK (max_stock >= 0),        -- PRO-026 (sem CHECK max >= min: -- DEFINIR)
  reorder_point               numeric(18,4) CONSTRAINT products_reorder_point_chk CHECK (reorder_point >= 0), -- PRO-027
  average_cost                numeric(18,4) NOT NULL DEFAULT 0 CONSTRAINT products_average_cost_chk CHECK (average_cost >= 0),
                              -- PRO-030 SENSIVEL: PRODUCTOS_COSTO.VER (REQ-2026-002, DATO_SENSIBLE). -- DEFINIR Q-05: custo médio editável à mão x calculado por movimentos
  tariff_heading              text        CONSTRAINT products_tariff_chk CHECK (char_length(tariff_heading) <= 4),        -- PRO-033
  ncm                         text        CONSTRAINT products_ncm_chk CHECK (char_length(ncm) <= 8),                      -- PRO-034 -- DEFINIR: formato
  dncp_general_code           text        CONSTRAINT products_dncp_gen_chk CHECK (char_length(dncp_general_code) <= 8),   -- PRO-035
  dncp_specific_code          text        CONSTRAINT products_dncp_spec_chk CHECK (char_length(dncp_specific_code) <= 4), -- PRO-036
  origin_country_code         text        CONSTRAINT products_origin_country_chk CHECK (origin_country_code ~ '^[A-Z]{3}$'),   -- PRO-037 (sem FK: chave de geo_countries fora do contrato)
  origin_country_name         text        CONSTRAINT products_origin_country_name_chk CHECK (char_length(origin_country_name) <= 30),  -- PRO-038 -- DEFINIR: some se origin_country_code virar FK
  invoice_additional_info     text        CONSTRAINT products_invoice_info_chk CHECK (char_length(invoice_additional_info) <= 500),  -- PRO-039
  goods_relation              smallint    CONSTRAINT products_goods_relation_chk CHECK (goods_relation IN (1,2)),   -- PRO-040 1 = tolerância de quebra; 2 = de perda
  shrinkage_percent           numeric(7,4) CONSTRAINT products_shrink_pct_chk CHECK (shrinkage_percent BETWEEN 0 AND 100),   -- PRO-041
  shrinkage_quantity          numeric(18,4) CONSTRAINT products_shrink_qty_chk CHECK (shrinkage_quantity >= 0),               -- PRO-042 (unidade -- DEFINIR)
  is_sellable                 boolean     NOT NULL DEFAULT true,   -- PRO-043
  is_purchasable              boolean     NOT NULL DEFAULT true,   -- PRO-044
  requires_quality_inspection boolean     NOT NULL DEFAULT false,  -- PRO-045
  shelf_life_days             integer     CONSTRAINT products_shelf_life_chk CHECK (shelf_life_days >= 0),   -- PRO-046
  net_weight_kg               numeric(18,4) CONSTRAINT products_net_weight_chk CHECK (net_weight_kg >= 0),     -- PRO-047
  gross_weight_kg             numeric(18,4) CONSTRAINT products_gross_weight_chk CHECK (gross_weight_kg >= 0), -- PRO-048
  length_cm                   numeric(18,4) CONSTRAINT products_length_chk CHECK (length_cm >= 0),             -- PRO-049
  width_cm                    numeric(18,4) CONSTRAINT products_width_chk CHECK (width_cm >= 0),               -- PRO-050
  height_cm                   numeric(18,4) CONSTRAINT products_height_chk CHECK (height_cm >= 0),             -- PRO-051
  volume_m3                   numeric(18,4) CONSTRAINT products_volume_chk CHECK (volume_m3 >= 0),             -- PRO-052 (campo independente, não calculado)
  image_url                   text,       -- PRO-053 -- DEFINIR Q-07: política de URL/armazenamento
  notes                       text        CONSTRAINT products_notes_chk CHECK (char_length(notes) <= 1000),   -- PRO-054
  is_active                   boolean     NOT NULL DEFAULT true,   -- PRO-055 (baixa lógica x física -- DEFINIR)
  created_by                  uuid,       -- PRO-065 (anulável: -- DEFINIR; o INSERT atual não registra autor)
  created_at                  timestamptz NOT NULL DEFAULT now(),  -- PRO-063
  updated_at                  timestamptz NOT NULL DEFAULT now(),  -- PRO-064
  CONSTRAINT products_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT products_company_code_key  UNIQUE (company_id, code),   -- o API traduz 23505 para 409; colunas reais NAO_VERIFICADO (Q-13)
  CONSTRAINT products_category_fk   FOREIGN KEY (company_id, category_id) REFERENCES product_categories (company_id, id),
  CONSTRAINT products_brand_fk      FOREIGN KEY (company_id, brand_id)    REFERENCES product_brands (company_id, id),
  CONSTRAINT products_created_by_fk FOREIGN KEY (company_id, created_by)  REFERENCES users (company_id, id)
);
CREATE INDEX products_company_active_idx ON products (company_id, is_active, description);   -- listagem ORDER BY activo DESC, descripcion
CREATE INDEX products_category_idx ON products (company_id, category_id);
CREATE INDEX products_brand_idx    ON products (company_id, brand_id);

-- ---------------------------------------------------------------------------
-- 6. Filhos de produto
-- ---------------------------------------------------------------------------
-- 6.1 product_codes (atual: producto_codigos)  PRO-056, PRO-067..PRO-070, PRO-161
CREATE TABLE product_codes (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid        NOT NULL REFERENCES companies(id),   -- PRO-168
  product_id   uuid        NOT NULL,                             -- PRO-161
  code_type    text        NOT NULL DEFAULT 'GTIN'
               CONSTRAINT product_codes_type_chk CHECK (code_type IN ('GTIN','GTIN_EMPAQUE','EAN','UPC','CODIGO_ALTERNO','SKU_PROVEEDOR','OTRO')),   -- PRO-067 -- DEFINIR Q-09: SKU_PROVEEDOR só existe no API
  code         text        NOT NULL CHECK (length(btrim(code)) > 0 AND char_length(code) <= 80),   -- PRO-068
  description  text        CHECK (char_length(description) <= 120),   -- PRO-069
  is_primary   boolean     NOT NULL DEFAULT false,   -- PRO-070
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_codes_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT product_codes_product_fk FOREIGN KEY (company_id, product_id) REFERENCES products (company_id, id) ON DELETE CASCADE,
  -- Mesmo código/tipo repetido no MESMO produto não tem sentido. Unicidade entre produtos: -- DEFINIR (PRO-068)
  CONSTRAINT product_codes_product_code_key UNIQUE (company_id, product_id, code_type, code),
  -- Regra confirmada (regra 6): GTIN/GTIN_EMPAQUE/EAN/UPC têm 8 a 14 dígitos.
  CONSTRAINT product_codes_gtin_format_chk CHECK (code_type NOT IN ('GTIN','GTIN_EMPAQUE','EAN','UPC') OR code ~ '^[0-9]{8,14}$')
);
CREATE INDEX product_codes_lookup_idx ON product_codes (company_id, code);    -- busca por código lido
CREATE UNIQUE INDEX product_codes_one_primary_uq ON product_codes (company_id, product_id) WHERE is_primary;   -- Q-10

-- 6.2 product_units (atual: producto_unidades)  PRO-057, PRO-072..PRO-080, PRO-162
CREATE TABLE product_units (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid        NOT NULL REFERENCES companies(id),
  product_id          uuid        NOT NULL,                             -- PRO-162
  unit_of_measure_id  uuid        NOT NULL REFERENCES units_of_measure(id),   -- PRO-072
  presentation_name   text        NOT NULL CHECK (length(btrim(presentation_name)) > 0 AND char_length(presentation_name) <= 100),   -- PRO-073
  conversion_factor   numeric(18,6) NOT NULL CONSTRAINT product_units_factor_chk CHECK (conversion_factor > 0),   -- PRO-074 em relação à unidade base. -- DEFINIR: precisão; exigir 1 para a base?
  is_base_unit        boolean     NOT NULL DEFAULT false,   -- PRO-075 (uma única base por produto: índice parcial abaixo). -- DEFINIR: redundância com products.unit_of_measure_id
  is_purchase_unit    boolean     NOT NULL DEFAULT false,   -- PRO-076
  is_sales_unit       boolean     NOT NULL DEFAULT true,    -- PRO-077 (default da UI; o API usa false se omitido, DIV-14)
  barcode             text        CHECK (char_length(barcode) <= 80),   -- PRO-078
  gross_weight_kg     numeric(18,4) CONSTRAINT product_units_weight_chk CHECK (gross_weight_kg >= 0),   -- PRO-079
  volume_m3           numeric(18,4) CONSTRAINT product_units_volume_chk CHECK (volume_m3 >= 0),         -- PRO-080
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_units_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT product_units_product_fk FOREIGN KEY (company_id, product_id) REFERENCES products (company_id, id) ON DELETE CASCADE
);
CREATE INDEX product_units_product_idx ON product_units (company_id, product_id);
CREATE UNIQUE INDEX product_units_one_base_uq ON product_units (company_id, product_id) WHERE is_base_unit;   -- Q-10: uma unidade base por produto

-- 6.3 product_suppliers (atual: producto_proveedores)  PRO-058, PRO-082..PRO-092, PRO-163
CREATE TABLE product_suppliers (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid        NOT NULL REFERENCES companies(id),
  product_id            uuid        NOT NULL,                             -- PRO-163
  supplier_id           uuid        NOT NULL,                             -- PRO-082
  supplier_code         text        CHECK (char_length(supplier_code) <= 80),          -- PRO-084 -- DEFINIR Q-09 (x product_codes SKU_PROVEEDOR)
  supplier_description  text        CHECK (char_length(supplier_description) <= 300),  -- PRO-085
  unit_of_measure_id    uuid        REFERENCES units_of_measure(id),                   -- PRO-086 unidade em que o fornecedor vende
  conversion_factor     numeric(18,6) NOT NULL DEFAULT 1 CONSTRAINT product_suppliers_factor_chk CHECK (conversion_factor >= 0),   -- PRO-087 (API: mín. 0)
  reference_cost        numeric(18,4) CONSTRAINT product_suppliers_cost_chk CHECK (reference_cost >= 0),
                        -- PRO-088 SENSIVEL: PRODUCTOS_COSTO.VER (custo de compra por fornecedor; DATO_SENSIBLE). -- DEFINIR Q-05
  currency_code         text        REFERENCES currencies(code),   -- PRO-089 (hoje tudo em PYG, Q-14)
  min_purchase_quantity numeric(18,4) CONSTRAINT product_suppliers_minqty_chk CHECK (min_purchase_quantity >= 0),   -- PRO-090
  lead_time_days        integer     CONSTRAINT product_suppliers_lead_chk CHECK (lead_time_days >= 0),   -- PRO-091 (x suppliers.lead_time_days: precedência -- DEFINIR)
  is_primary            boolean     NOT NULL DEFAULT false,   -- PRO-092
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_suppliers_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT product_suppliers_product_fk  FOREIGN KEY (company_id, product_id)  REFERENCES products (company_id, id) ON DELETE CASCADE,
  CONSTRAINT product_suppliers_supplier_fk FOREIGN KEY (company_id, supplier_id) REFERENCES suppliers (company_id, id)
);
CREATE INDEX product_suppliers_product_idx  ON product_suppliers (company_id, product_id);
CREATE INDEX product_suppliers_supplier_idx ON product_suppliers (company_id, supplier_id);
CREATE UNIQUE INDEX product_suppliers_one_primary_uq ON product_suppliers (company_id, product_id) WHERE is_primary;   -- Q-10

-- 6.4 product_warehouse_settings (atual: producto_deposito_configuracion)  PRO-059, PRO-094..PRO-100, PRO-164
CREATE TABLE product_warehouse_settings (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid        NOT NULL REFERENCES companies(id),
  product_id            uuid        NOT NULL,                             -- PRO-164
  warehouse_id          uuid        NOT NULL,                             -- PRO-094
  preferred_location_id uuid,       -- PRO-096. SEM FK: warehouse_locations não está no contrato (Q-12) -- DEFINIR
  min_stock             numeric(18,4) CONSTRAINT pws_min_chk CHECK (min_stock >= 0),            -- PRO-097 (x products.min_stock: precedência -- DEFINIR)
  max_stock             numeric(18,4) CONSTRAINT pws_max_chk CHECK (max_stock >= 0),            -- PRO-098
  reorder_point         numeric(18,4) CONSTRAINT pws_reorder_point_chk CHECK (reorder_point >= 0),   -- PRO-099
  reorder_quantity      numeric(18,4) CONSTRAINT pws_reorder_qty_chk CHECK (reorder_quantity >= 0),  -- PRO-100
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_warehouse_settings_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT product_warehouse_settings_product_fk   FOREIGN KEY (company_id, product_id)   REFERENCES products (company_id, id) ON DELETE CASCADE,
  CONSTRAINT product_warehouse_settings_warehouse_fk FOREIGN KEY (company_id, warehouse_id) REFERENCES warehouses (company_id, id),
  -- PRO-094: um produto não deveria repetir depósito (marcado DEFINIR no mapeamento; chave natural da tabela)
  CONSTRAINT product_warehouse_settings_product_wh_key UNIQUE (company_id, product_id, warehouse_id)
);
CREATE INDEX product_warehouse_settings_wh_idx ON product_warehouse_settings (company_id, warehouse_id);

-- 6.5 product_alternatives (atual: producto_alternativos)  PRO-060, PRO-102..PRO-105, PRO-165
CREATE TABLE product_alternatives (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid        NOT NULL REFERENCES companies(id),
  product_id              uuid        NOT NULL,                             -- PRO-165
  alternative_product_id  uuid        NOT NULL,                             -- PRO-102
  alternative_type        text        NOT NULL DEFAULT 'SUSTITUTO'
                          CONSTRAINT product_alternatives_type_chk CHECK (alternative_type IN ('SUSTITUTO','COMPLEMENTARIO','UPSELL')),   -- PRO-104 (o API hoje aceita qualquer texto)
  priority                integer     NOT NULL DEFAULT 1 CONSTRAINT product_alternatives_priority_chk CHECK (priority >= 1),   -- PRO-105
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_alternatives_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT product_alternatives_product_fk FOREIGN KEY (company_id, product_id)             REFERENCES products (company_id, id) ON DELETE CASCADE,
  CONSTRAINT product_alternatives_alt_fk     FOREIGN KEY (company_id, alternative_product_id) REFERENCES products (company_id, id) ON DELETE CASCADE,
  -- PRO-102: o API não valida auto-referência (a UI sim). Um produto não é alternativa de si mesmo.
  CONSTRAINT product_alternatives_not_self_chk CHECK (alternative_product_id <> product_id)
  -- Par (produto, alternativo, tipo) único: -- DEFINIR (PRO-102), sem UNIQUE por ora
);
CREATE INDEX product_alternatives_product_idx ON product_alternatives (company_id, product_id);
CREATE INDEX product_alternatives_alt_idx     ON product_alternatives (company_id, alternative_product_id);

-- 6.6 product_components (atual: producto_componentes, coluna producto_kit_id)  PRO-061, PRO-107..PRO-111, PRO-166
CREATE TABLE product_components (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid        NOT NULL REFERENCES companies(id),
  kit_product_id        uuid        NOT NULL,                             -- PRO-166 (producto_kit_id): o produto do tipo KIT
  component_product_id  uuid        NOT NULL,                             -- PRO-107
  quantity              numeric(18,4) NOT NULL CONSTRAINT product_components_qty_chk CHECK (quantity > 0),   -- PRO-109 (unidade base do componente: -- DEFINIR)
  is_optional           boolean     NOT NULL DEFAULT false,   -- PRO-110 -- DEFINIR: baixa/faturamento de componente opcional
  sort_order            integer     NOT NULL DEFAULT 1 CONSTRAINT product_components_order_chk CHECK (sort_order >= 1),   -- PRO-111
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_components_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT product_components_kit_fk       FOREIGN KEY (company_id, kit_product_id)       REFERENCES products (company_id, id) ON DELETE CASCADE,
  CONSTRAINT product_components_component_fk FOREIGN KEY (company_id, component_product_id) REFERENCES products (company_id, id),
  -- Um kit não pode conter a si mesmo (PRO-107: o API não valida auto-referência).
  CONSTRAINT product_components_not_self_chk CHECK (component_product_id <> kit_product_id)
  -- Ciclos (A contém B, B contém A, ou mais longos) e "só KIT tem componentes" (regra 5): trigger abaixo.
);
CREATE INDEX product_components_kit_idx       ON product_components (company_id, kit_product_id);
CREATE INDEX product_components_component_idx ON product_components (company_id, component_product_id);

-- 6.7 product_documents (atual: producto_documentos)  PRO-062, PRO-113..PRO-119, PRO-167
CREATE TABLE product_documents (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid        NOT NULL REFERENCES companies(id),
  product_id     uuid        NOT NULL,                             -- PRO-167
  document_type  text        NOT NULL DEFAULT 'FICHA_TECNICA'
                 CONSTRAINT product_documents_type_chk CHECK (document_type IN ('FICHA_TECNICA','HOJA_SEGURIDAD','CERTIFICADO','IMAGEN','OTRO')),   -- PRO-113
  file_name      text        NOT NULL CHECK (length(btrim(file_name)) > 0 AND char_length(file_name) <= 255),   -- PRO-114
  file_url       text        NOT NULL CHECK (length(btrim(file_url)) > 0),   -- PRO-115 -- DEFINIR Q-07: https, upload real
  issued_on      date,       -- PRO-116 (DIV-04: formato dd/mm/yyyy do API x yyyy-mm-dd da UI; aqui é date)
  expires_on     date,       -- PRO-117
  notes          text        CHECK (char_length(notes) <= 500),   -- PRO-118
  uploaded_by    uuid,       -- PRO-119 (da sessão). Anulável: -- DEFINIR (migrados sem autor)
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_documents_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT product_documents_product_fk FOREIGN KEY (company_id, product_id) REFERENCES products (company_id, id) ON DELETE CASCADE,
  CONSTRAINT product_documents_uploaded_by_fk FOREIGN KEY (company_id, uploaded_by) REFERENCES users (company_id, id),
  CONSTRAINT product_documents_dates_chk CHECK (expires_on IS NULL OR issued_on IS NULL OR expires_on >= issued_on)
);
CREATE INDEX product_documents_product_idx ON product_documents (company_id, product_id);

-- ---------------------------------------------------------------------------
-- 7. Integridade de kits (componentes): só KIT tem componentes; sem ciclo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION product_components_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE kit_type text;
BEGIN
  -- Serializa as alterações de componentes da empresa para que duas transações
  -- concorrentes (A->B e B->A) não passem ambas pela detecção de ciclo.
  PERFORM pg_advisory_xact_lock(hashtextextended('product_components:' || NEW.company_id::text, 0));

  -- Regra 5 (route.ts:266-267): só produto do tipo KIT pode ter componentes.
  -- Se o kit não existir (ou for de outra empresa) a FK composta acusa o erro depois (23503).
  SELECT product_type INTO kit_type FROM products
   WHERE company_id = NEW.company_id AND id = NEW.kit_product_id;
  IF kit_type IS NOT NULL AND kit_type <> 'KIT' THEN
    RAISE EXCEPTION 'KIT: o produto % é do tipo % e não pode ter componentes', NEW.kit_product_id, kit_type USING ERRCODE = 'P0001';
  END IF;

  -- Ciclo: partindo do componente, descendo pelos kits, o kit novo não pode ser alcançado.
  -- UNION (não ALL) garante término mesmo se houver dados antigos cíclicos.
  IF EXISTS (
    WITH RECURSIVE down(id) AS (
      SELECT pc.component_product_id FROM product_components pc
       WHERE pc.company_id = NEW.company_id AND pc.kit_product_id = NEW.component_product_id AND pc.id <> NEW.id
      UNION
      SELECT pc.component_product_id FROM product_components pc JOIN down d ON pc.kit_product_id = d.id
       WHERE pc.company_id = NEW.company_id AND pc.id <> NEW.id
    )
    SELECT 1 FROM down WHERE id = NEW.kit_product_id
  ) THEN
    RAISE EXCEPTION 'KIT: ciclo de componentes (% -> % já alcança %)', NEW.kit_product_id, NEW.component_product_id, NEW.kit_product_id USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER product_components_guard_trg
  BEFORE INSERT OR UPDATE OF company_id, kit_product_id, component_product_id ON product_components
  FOR EACH ROW EXECUTE FUNCTION product_components_guard();

-- Um KIT que já tem componentes não pode mudar para outro tipo (senão a regra 5 seria burlada).
CREATE OR REPLACE FUNCTION products_kit_type_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.product_type = 'KIT' AND NEW.product_type <> 'KIT'
     AND EXISTS (SELECT 1 FROM product_components WHERE company_id = OLD.company_id AND kit_product_id = OLD.id) THEN
    RAISE EXCEPTION 'KIT: o produto % tem componentes e não pode deixar de ser KIT', OLD.id USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER products_kit_type_guard_trg
  BEFORE UPDATE OF product_type ON products
  FOR EACH ROW EXECUTE FUNCTION products_kit_type_guard();

-- ---------------------------------------------------------------------------
-- 8. updated_at automático (set_updated_at() vem de P001)
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['supplier_groups','suppliers','supplier_contacts','supplier_addresses',
      'supplier_bank_accounts','supplier_withholdings','supplier_documents','product_categories',
      'product_brands','products','product_codes','product_units','product_suppliers',
      'product_warehouse_settings','product_alternatives','product_components','product_documents'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t||'_set_updated_at', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 9. Row Level Security (mesmo padrão de P001 §10)
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['supplier_groups','suppliers','supplier_contacts','supplier_addresses',
      'supplier_bank_accounts','supplier_withholdings','supplier_documents','product_categories',
      'product_brands','products','product_codes','product_units','product_suppliers',
      'product_warehouse_settings','product_alternatives','product_components','product_documents'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY %I ON %I USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id())$p$,
                   t||'_tenant_isolation', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 10. Comentários de dados sensíveis (REQ-2026-002). A proteção por permissão é da camada de
--     dados (a API deve omitir/mascarar sem a concessão); o SQL só documenta e não bloqueia.
-- ---------------------------------------------------------------------------
COMMENT ON TABLE supplier_bank_accounts IS
  'SENSIVEL: PROVEEDORES_BANCARIO.VER/EDITAR (DATO_SENSIBLE, sem perfil padrão). Camada de dados deve omitir/mascarar sem a permissão.';
COMMENT ON COLUMN supplier_bank_accounts.account_number IS 'SENSIVEL: PROVEEDORES_BANCARIO.VER — mascarar; candidato a criptografia (DEFINIR).';
COMMENT ON COLUMN supplier_bank_accounts.iban          IS 'SENSIVEL: PROVEEDORES_BANCARIO.VER — mascarar.';
COMMENT ON COLUMN supplier_bank_accounts.swift_code    IS 'SENSIVEL: PROVEEDORES_BANCARIO.VER — mascarar.';
COMMENT ON COLUMN supplier_bank_accounts.holder_tax_id IS 'SENSIVEL: PROVEEDORES_BANCARIO.VER — documento fiscal do titular.';
COMMENT ON COLUMN supplier_documents.document_type     IS 'CERTIFICADO_BANCARIO contém dados bancários: DEFINIR se fica sob PROVEEDORES_BANCARIO.VER.';
COMMENT ON COLUMN products.average_cost                IS 'SENSIVEL: PRODUCTOS_COSTO.VER (DATO_SENSIBLE). Não devolver sem a concessão (Q-05).';
COMMENT ON COLUMN product_suppliers.reference_cost     IS 'SENSIVEL: PRODUCTOS_COSTO.VER (DATO_SENSIBLE). Custo de compra por fornecedor (Q-05).';

-- ---------------------------------------------------------------------------
-- PENDÊNCIAS DE DEFINIÇÃO (nada abaixo foi decidido neste arquivo)
-- ---------------------------------------------------------------------------
-- D-01 geo_*: a chave de geo_countries/departments/districts/cities não consta do contrato de P002;
--      country_code (suppliers, supplier_addresses, products.origin_country_code) e os códigos
--      department/district/city_code ficam SEM FK. Adicionar as FKs quando P002 fixar as chaves.
-- D-02 payment_methods é GLOBAL no contrato (FK simples); o mapeamento PRV-024 previa FK composta por empresa.
-- D-03 payment_terms: por empresa (contrato) x global (PRV-136; REQ-2026-002 §3.4).
-- D-04 suppliers.code / products.code: quem gera, formato e sequência por empresa (PRV-003, Q-02).
--      suppliers.code é anulável por isso.
-- D-05 suppliers.tax_id_type: lista de valores; UNIQUE (company_id, tax_id_type, tax_id) mantida porque o
--      código usa constraint '…empresa_documento…' (409); cálculo do DV (módulo 11); formato de não-RUC.
-- D-06 Homologação: VENCIDO automático por data? HOMOLOGADO exige datas? origem de current_rating?
-- D-07 is_blocked/block_reason: efeito sobre compras/pagamentos, motivo obrigatório (sem CHECK).
-- D-08 Retenções: alíquotas legais, certificado obrigatório, sobreposição de vigências, vínculo com taxes.
-- D-09 Contas bancárias: alcance da unicidade (hoje por fornecedor+número), AHORRO x CAJA_AHORRO,
--      criptografia/mascaramento, CERTIFICADO_BANCARIO sob PROVEEDORES_BANCARIO.
-- D-10 file_url (fornecedor e produto): esquema permitido, upload real, tamanho (Q-07).
-- D-11 minimum_purchase_amount: 2 ou 4 casas decimais; moeda própria ou a predeterminada (PRV-029).
-- D-12 Escopo por filial/depósito para fornecedores (hoje só empresa).
-- D-13 Hierarquia categoria/família/linha (Q-03): family_id e line_id sem FK, sem tabelas product_families/
--      product_lines; product_categories sem parent_id. origin_label x origin_country_code.
-- D-14 products.inventory_code (Q-08), unicidade de barcode/sifen_code/product_codes entre produtos,
--      SKU_PROVEEDOR x product_suppliers.supplier_code (Q-09), qual código de barras prevalece.
-- D-15 Estoque e preço de referência NÃO foram modelados em products (Q-04, Q-06, DIV-30): saldo vem de P005.
-- D-16 product_units: precisão do fator, exigir fator 1 na unidade base, redundância com
--      products.unit_of_measure_id (Q-10); regras por product_type; tracks_stock x SERVICIO.
-- D-17 Política de estoque global x por depósito (precedência, max >= min); preferred_location_id sem FK (Q-12).
-- D-18 Kits dentro de kits são PERMITIDOS (só ciclos são vedados); componente opcional; unidade da quantidade.
-- D-19 product_alternatives: unicidade do par (produto, alternativo, tipo); product_suppliers: unicidade do par.
-- D-20 created_by/uploaded_by anuláveis (auditoria transversal REQ-2026-002 §9).
-- D-21 Custo (Q-05): quais campos exige PRODUCTOS_COSTO.VER e se average_cost é calculado por movimentos.

COMMIT;
