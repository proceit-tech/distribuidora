-- =============================================================================
-- REQ-2026-003-P002-catalogos-clientes-up.sql — PROPOSTA — NÃO EXECUTAR EM BANCO REAL
-- Objetivo : catálogos compartilhados e módulo de clientes em INGLÊS:
--            GLOBAIS  : geo_countries, geo_departments, geo_districts, geo_cities,
--                       currencies, payment_methods, incoterms, units_of_measure, taxes
--            POR EMPRESA: payment_terms, customer_groups, salespeople, delivery_routes,
--                       commercial_zones, sales_channels
--            CLIENTES : customers, customer_contacts, customer_addresses, customer_documents
-- Origem   : REQ-2026-003; REQ-2026-002 (DESENHO §3.3, §3.4, §4.1, §5.5);
--            documentacao/banco/levantamento/campos/CLIENTES.md (principal) e, nas
--            linhas cujo alvo é geo_*, currencies, payment_methods, incoterms,
--            units_of_measure, taxes, payment_terms: PROVEEDORES.md (PRV-020..164),
--            PRODUCTOS.md (PRO-125..133). LISTAS-PRECIO.md não acrescentou linhas.
-- Dialeto  : PostgreSQL >= 14 (gen_random_uuid() nativo). Validado só em PG 16.15 descartável.
-- Situação : DEFINIÇÃO DE ESTRUTURA-ALVO (greenfield). NÃO é migration pronta:
--            o esquema real está NAO_VERIFICADO (REQ-2026-003 §6). Em banco existente
--            esta estrutura só entra após a reconciliação (PLANO-MIGRACAO-INGLES.md).
-- Depende de: REQ-2026-003-P001-up.sql (companies, users, app_company_id(), set_updated_at()).
--            Nenhuma outra proposta é necessária: customers.price_list_id nasce SEM FK
--            (a FK composta para price_lists é adicionada em P004).
-- Pós-valid: documentacao/banco/validacoes/TESTE-P002-catalogos-clientes.sql
-- Impacto API: nenhum até o código passar a usar os nomes em inglês (adaptador/view de
--            compatibilidade). O DTO de clientes devolve hoje códigos SIFEN crus
--            (recipient_nature_code etc.): o mapeamento texto<->código é do DTO (DIV-08).
-- Rollback : REQ-2026-003-P002-catalogos-clientes-down.sql — só para banco DESCARTÁVEL.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Convenções desta proposta
-- ---------------------------------------------------------------------------
-- * Catálogos GLOBAIS (sem company_id e SEM RLS): só aqueles em que o código prova que o
--   SQL não filtra por empresa (monedas, incoterms, referencia_geografica_*, unidades_medida,
--   impuestos) ou em que o contrato de dependências (brief) os define como globais.
--   São mantidos pela plataforma: a camada de dados deve dar ao papel da aplicação apenas
--   SELECT nestas tabelas (o GRANT fica fora desta proposta, como o papel dn_app em P001).
-- * Tabelas por empresa: company_id NOT NULL, UNIQUE (company_id, id), FKs entre tabelas
--   de negócio sempre compostas (company_id, x_id) -> x (company_id, id), RLS ENABLE+FORCE.
-- * Sem ON DELETE em FKs de negócio (NO ACTION): política de exclusão é DEFINIR (CLIENTES.md
--   "Regras que dependem de definição" 9); a baixa lógica é feita por is_active.
-- * Valores de domínio ficam EXATAMENTE como no código ('FISCAL', 'JURIDICA', 'A_DEMANDA'...).

-- ===========================================================================
-- PARTE A — CATÁLOGOS GLOBAIS (plataforma)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- A1. geo_countries  (atual: referencia_geografica_paises)  CLI-162, PRV-147..149
-- ---------------------------------------------------------------------------
CREATE TABLE geo_countries (
  code        text        PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),   -- ISO alfa-3 (PRY, ARG, BRA...); CLI-008 FK geo_countries(code)
  name        text        NOT NULL CHECK (length(btrim(name)) > 0),  -- PRV-148
  is_active   boolean     NOT NULL DEFAULT true,                     -- PRV-149 (filtro activo = true)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE geo_countries IS 'Catálogo global de países. Nuevo cliente espera catalogos.paises e a API não o entrega (DIV-02): o endpoint comum é DEFINIR (CLI-162).';

-- ---------------------------------------------------------------------------
-- A2. geo_departments (atual: referencia_geografica_departamentos)  CLI-154/155, PRV-153..155
-- ---------------------------------------------------------------------------
CREATE TABLE geo_departments (
  code        integer     PRIMARY KEY CHECK (code > 0),              -- PRV-153: inteiro > 0
  name        text        NOT NULL CHECK (length(btrim(name)) > 0),
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- DEFINIR: o catálogo atual é só do Paraguai (não tem coluna de país); não se inventa country_code.

-- ---------------------------------------------------------------------------
-- A3. geo_districts (atual: referencia_geografica_distritos)  CLI-156..158, PRV-156..159
-- ---------------------------------------------------------------------------
-- Chave natural NAO_VERIFICADO (DIV-20): se o código de distrito fosse único no país, a chave
-- composta abaixo continuaria válida (é a opção MENOS restritiva). O catálogo filtra por
-- (departamento_codigo, codigo); por isso a chave é composta.
CREATE TABLE geo_districts (
  department_code integer     NOT NULL REFERENCES geo_departments (code),   -- CLI-158
  code            integer     NOT NULL CHECK (code > 0),                    -- PRV-156: inteiro > 0
  name            text        NOT NULL CHECK (length(btrim(name)) > 0),
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (department_code, code)
);

-- ---------------------------------------------------------------------------
-- A4. geo_cities (atual: referencia_geografica_ciudades)  CLI-159..161, PRV-160..164
-- ---------------------------------------------------------------------------
-- DIV-20: a validação atual do POST une cidade a distrito só por distrito_codigo; o alvo usa a
-- chave completa (departamento, distrito, cidade), que é a que o catálogo (GET) filtra.
CREATE TABLE geo_cities (
  department_code integer     NOT NULL,
  district_code   integer     NOT NULL,
  code            integer     NOT NULL CHECK (code > 0),                    -- PRV-160
  name            text        NOT NULL CHECK (length(btrim(name)) > 0),
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (department_code, district_code, code),
  CONSTRAINT geo_cities_district_fk FOREIGN KEY (department_code, district_code)
    REFERENCES geo_districts (department_code, code)                          -- CLI-161
);

-- ---------------------------------------------------------------------------
-- A5. currencies (atual: monedas)  CLI-151..153, PRV-137..140
-- ---------------------------------------------------------------------------
CREATE TABLE currencies (
  code        text        PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),       -- ISO 4217 (CLI-151: CHECK ^[A-Z]{3}$)
  name        text        NOT NULL CHECK (length(btrim(name)) > 0),
  symbol      text,                                                       -- PRV-139 ('Gs.', 'USD')
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- DEFINIR: casas decimais da moeda (PYG sem decimais, USD 2) não aparecem no código: não há coluna.

-- ---------------------------------------------------------------------------
-- A6. payment_methods (atual: medios_pago)  PRV-025, PRV-141..146
-- ---------------------------------------------------------------------------
-- DIVERGÊNCIA mapeamento x contrato: o código atual filtra medios_pago por empresa_id e valida
-- com validarReferenciaEmpresa (PRV-141, PRV-145, DIV-24 de PROVEEDORES). O contrato de
-- dependências do brief define payment_methods como GLOBAL (id uuid). Segue-se o contrato;
-- a decisão fica em PENDÊNCIAS (se for por empresa: adicionar company_id + UNIQUE(company_id,id)
-- + RLS e trocar as FKs de P003 para compostas).
CREATE TABLE payment_methods (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text        NOT NULL CHECK (length(btrim(code)) > 0),      -- PRV-142
  name        text        NOT NULL CHECK (length(btrim(name)) > 0),      -- PRV-143
  type        text,                                                       -- PRV-144: valores possíveis NAO_VERIFICADO -> sem CHECK
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_methods_code_key UNIQUE (code)                       -- DEFINIR: unicidade do código (mínimo para identificar o meio)
);

-- ---------------------------------------------------------------------------
-- A7. incoterms  PRV-041, PRV-150..152
-- ---------------------------------------------------------------------------
CREATE TABLE incoterms (
  code        text        PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),       -- varchar(3) (PRV-150); EXW, FOB, CIF...
  name        text,                                                       -- PRV-151: a UI hoje oferece os códigos sem nome -> anulável
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- A8. units_of_measure (atual: unidades_medida)  PRO-125..129
-- ---------------------------------------------------------------------------
-- Q-01 (PRODUCTOS.md): global x por empresa x global com habilitação por empresa está ABERTA.
-- O contrato do brief a define global; a habilitação por empresa (company_units_of_measure)
-- NÃO é criada aqui (ver PENDÊNCIAS).
CREATE TABLE units_of_measure (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code               text        NOT NULL CHECK (length(btrim(code)) > 0),   -- PRO-126
  name               text        NOT NULL CHECK (length(btrim(name)) > 0),   -- PRO-127
  sifen_code         text,                                                    -- PRO-128: código oficial SIFEN da unidade (dado fiscal do DE)
  sifen_description  text,                                                    -- PRO-129
  is_active          boolean     NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT units_of_measure_code_key UNIQUE (code)                          -- DEFINIR: unicidade do código
);

-- ---------------------------------------------------------------------------
-- A9. taxes (atual: impuestos)  PRO-130..133
-- ---------------------------------------------------------------------------
-- Q-01: global x habilitação por empresa (company_taxes / empresa_impuesto) NÃO é criada aqui.
CREATE TABLE taxes (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text          NOT NULL CHECK (length(btrim(code)) > 0),      -- PRO-131
  name          text          NOT NULL CHECK (length(btrim(name)) > 0),      -- PRO-132
  -- numeric(5,2): alíquota em % (0..100,00); proposto em PRO-133. Nunca float.
  rate_percent  numeric(5,2)  NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 100),
  is_active     boolean       NOT NULL DEFAULT true,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT taxes_code_key UNIQUE (code)                                    -- DEFINIR: unicidade do código
);

-- ===========================================================================
-- PARTE B — CATÁLOGOS POR EMPRESA
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- B1. payment_terms (atual: condiciones_pago — hoje GLOBAL; por empresa no alvo, DESENHO §3.4)
-- ---------------------------------------------------------------------------
-- CLI-025, CLI-145..150, PRV-020, PRV-132..136. Decisão "por empresa" vem do contrato do brief
-- (e do DESENHO §3.4); o BACKFILL (copiar o catálogo global para cada empresa) é da migração.
CREATE TABLE payment_terms (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid        NOT NULL REFERENCES companies (id),
  code           text        NOT NULL CHECK (length(btrim(code)) > 0),       -- CLI-146
  name           text        NOT NULL CHECK (length(btrim(name)) > 0),       -- CLI-147
  due_days       integer,                                                    -- CLI-149/PRV-135: tipo e obrigatoriedade DEFINIR (NAO_VERIFICADO) -> anulável, sem CHECK
  requires_credit boolean    NOT NULL DEFAULT false,                         -- CLI-150: nenhuma regra o usa (DEFINIR)
  is_active      boolean     NOT NULL DEFAULT true,                          -- CLI-148
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_terms_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT payment_terms_company_code_key  UNIQUE (company_id, code)
);

-- ---------------------------------------------------------------------------
-- B2. customer_groups (grupos_cliente)  CLI-113..117
-- ---------------------------------------------------------------------------
CREATE TABLE customer_groups (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES companies (id),                -- CLI-114
  code        text        NOT NULL CHECK (length(btrim(code)) > 0),          -- CLI-115 (tamanho NAO_VERIFICADO; o select mostra "codigo · nombre")
  name        text        NOT NULL CHECK (length(btrim(name)) > 0),          -- CLI-116
  is_active   boolean     NOT NULL DEFAULT true,                             -- CLI-117
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_groups_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT customer_groups_company_code_key  UNIQUE (company_id, code)      -- DEFINIR: unicidade do código por empresa (NAO_VERIFICADO)
);

-- ---------------------------------------------------------------------------
-- B3. salespeople (vendedores)  CLI-118..122
-- ---------------------------------------------------------------------------
-- A relação vendedor-usuário e o alcance por sucursal (Q8) são NAO_VERIFICADO/DEFINIR: não há
-- user_id nem branch_id aqui.
CREATE TABLE salespeople (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES companies (id),                -- CLI-119
  code        text        NOT NULL CHECK (length(btrim(code)) > 0),          -- CLI-120
  name        text        NOT NULL CHECK (length(btrim(name)) > 0),          -- CLI-121
  is_active   boolean     NOT NULL DEFAULT true,                             -- CLI-122
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT salespeople_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT salespeople_company_code_key  UNIQUE (company_id, code)
);

-- ---------------------------------------------------------------------------
-- B4. delivery_routes (rutas_entrega)  CLI-123..128
-- ---------------------------------------------------------------------------
CREATE TABLE delivery_routes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES companies (id),                -- CLI-124
  code        text        NOT NULL CHECK (length(btrim(code)) > 0),          -- CLI-125
  name        text        NOT NULL CHECK (length(btrim(name)) > 0),          -- CLI-126
  zone        text,                                                          -- CLI-128: só o GET o lê; texto x FK para commercial_zones é DEFINIR -> texto anulável, sem FK
  is_active   boolean     NOT NULL DEFAULT true,                             -- CLI-127
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_routes_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT delivery_routes_company_code_key  UNIQUE (company_id, code)
);

-- ---------------------------------------------------------------------------
-- B5. commercial_zones (zonas_comerciales)  CLI-129..133
-- ---------------------------------------------------------------------------
CREATE TABLE commercial_zones (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES companies (id),                -- CLI-130
  code        text        NOT NULL CHECK (length(btrim(code)) > 0),          -- CLI-131
  name        text        NOT NULL CHECK (length(btrim(name)) > 0),          -- CLI-132
  is_active   boolean     NOT NULL DEFAULT true,                             -- CLI-133
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_zones_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT commercial_zones_company_code_key  UNIQUE (company_id, code)
);

-- ---------------------------------------------------------------------------
-- B6. sales_channels (canales_venta)  CLI-134..138
-- ---------------------------------------------------------------------------
CREATE TABLE sales_channels (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES companies (id),                -- CLI-135
  code        text        NOT NULL CHECK (length(btrim(code)) > 0),          -- CLI-136
  name        text        NOT NULL CHECK (length(btrim(name)) > 0),          -- CLI-137
  is_active   boolean     NOT NULL DEFAULT true,                             -- CLI-138
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_channels_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT sales_channels_company_code_key  UNIQUE (company_id, code)
);

-- ===========================================================================
-- PARTE C — CLIENTES
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- C1. customers (clientes)  CLI-001..051
-- ---------------------------------------------------------------------------
-- Códigos SIFEN numéricos (naturaleza, operação, tipo de contribuinte, tipo de documento de
-- identidade) ficam como NO código atual (smallint + CHECK): a pergunta aberta 6 (texto x código)
-- é do DTO e não muda o banco hoje. Os textos de domínio (person_type, document_type,
-- delivery_frequency) ficam como texto + CHECK, com os valores exatos do código.
CREATE TABLE customers (
  id                              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),                -- CLI-001
  company_id                      uuid          NOT NULL REFERENCES companies (id),                   -- CLI-003 (sempre da sessão)
  -- CLI-002: gerado pelo banco no código atual (INSERT não o informa; RETURNING o lê).
  -- Gerador: trigger customers_assign_code() abaixo ('CLI-' + 6 dígitos, por empresa, formato do DEMO).
  code                            varchar(50)   NOT NULL,
  -- ----- fiscal (SIFEN) -----
  recipient_nature_code           smallint      NOT NULL CHECK (recipient_nature_code IN (1, 2)),     -- CLI-004: 1=CONTRIBUYENTE, 2=NO_CONTRIBUYENTE
  operation_type_code             smallint      NOT NULL CHECK (operation_type_code IN (1, 2, 3, 4)), -- CLI-005: 1=B2B 2=B2C 3=B2G 4=B2F. DEFINIR: validar naturaleza x operação no servidor (a API NÃO valida) -> sem CHECK cruzado
  person_type                     text          NOT NULL CHECK (person_type IN ('JURIDICA', 'FISICA')), -- CLI-006
  -- CLI-007: redundante com person_type (FISICA=1, JURIDICA=2). DEFINIR se mantém os dois; enquanto
  -- existir, a coerência é garantida por customers_taxpayer_type_chk.
  taxpayer_type_code              smallint      NOT NULL CHECK (taxpayer_type_code IN (1, 2)),
  country_code                    text          NOT NULL REFERENCES geo_countries (code),             -- CLI-008 (CLI-009 country_name NÃO existe: derivado de geo_countries)
  document_type                   varchar(30)   NOT NULL CHECK (document_type IN
                                    ('RUC', 'CEDULA_PARAGUAYA', 'PASAPORTE', 'CEDULA_EXTRANJERA',
                                     'CARNET_RESIDENCIA', 'INNOMINADO', 'TARJETA_DIPLOMATICA', 'OTRO')), -- CLI-010
  identity_document_type_code     smallint      CHECK (identity_document_type_code IN (1, 2, 3, 4, 5, 6, 9)), -- CLI-011: NULL para contribuinte
  identity_document_description   varchar(100),                                                       -- CLI-012: obrigatória só se document_type = OTRO
  tax_id                          varchar(30)   NOT NULL CHECK (length(btrim(tax_id)) > 0),           -- CLI-013 (RUC sem DV, ou nº do documento). DEFINIR: separar tax_id de document_number (Q7)
  tax_id_check_digit              varchar(5),                                                         -- CLI-014: obrigatório só para CONTRIBUYENTE. DEFINIR: 1 caractere? validar módulo 11?
  legal_name                      varchar(200)  NOT NULL CHECK (length(btrim(legal_name)) > 0),       -- CLI-015. DEFINIR: normalizar para MAIÚSCULAS (DIV-12)
  trade_name                      varchar(200),                                                       -- CLI-016
  email                           varchar(150)  CHECK (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),         -- CLI-017 (regex da API, regra 13)
  cc_email                        varchar(150)  CHECK (cc_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),      -- CLI-018
  phone                           varchar(30),                                                        -- CLI-019
  mobile_phone                    varchar(30),                                                        -- CLI-020
  -- ----- crédito (SENSÍVEL) -----
  -- numeric(18,4): até 14 dígitos inteiros e 4 decimais; o código aceita decimais e há clientes
  -- em USD (CLI-021). DEFINIR (Q10): (18,2)? e a moeda do limite (rotulada "Gs." em qualquer moeda, DIV-25).
  credit_limit                    numeric(18,4) NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),         -- CLI-021  SENSIVEL: CLIENTES_CREDITO.VER / CLIENTES_CREDITO.EDITAR
  temporary_credit_limit          numeric(18,4) CHECK (temporary_credit_limit >= 0),                  -- CLI-022  SENSIVEL: CLIENTES_CREDITO.VER / CLIENTES_CREDITO.EDITAR. DEFINIR 0 x NULL (DEMO grava 0, banco NULL)
  temporary_credit_expires_on     date,                                                               -- CLI-023  SENSIVEL: CLIENTES_CREDITO.VER / CLIENTES_CREDITO.EDITAR
  -- ----- comercial -----
  customer_group_id               uuid,                                                               -- CLI-024
  payment_term_id                 uuid,                                                               -- CLI-025
  default_currency_code           text          REFERENCES currencies (code),                         -- CLI-026
  price_list_id                   uuid,                                                               -- CLI-027: SEM FK aqui; a FK composta customers_price_list_fk (company_id, price_list_id) -> price_lists é criada em P004
  sales_channel_id                uuid,                                                               -- CLI-028
  salesperson_id                  uuid,                                                               -- CLI-029
  external_code                   varchar(100),                                                       -- CLI-030 (unicidade INFERIDA da mensagem de erro 23505; DEFINIR índice parcial)
  gln                             varchar(13),                                                        -- CLI-031: GS1; DEFINIR CHECK ^[0-9]{13}$ -> sem CHECK
  commercial_discount_pct         numeric(5,2)  NOT NULL DEFAULT 0 CHECK (commercial_discount_pct >= 0 AND commercial_discount_pct <= 100), -- CLI-032: (5,2) cabe 100,00; casas decimais DEFINIR
  -- ----- bloqueio de vendas -----
  is_sales_blocked                boolean       NOT NULL DEFAULT false,                               -- CLI-033. DEFINIR: efeito do bloqueio e quem pode (nenhuma tela/API o aplica)
  sales_block_reason              varchar(500),                                                       -- CLI-034
  sales_blocked_at                timestamptz,                                                        -- CLI-035
  sales_blocked_by                uuid,                                                               -- CLI-036
  preferred_collection_day        smallint      CHECK (preferred_collection_day BETWEEN 1 AND 31),    -- CLI-037
  requires_purchase_order         boolean       NOT NULL DEFAULT false,                               -- CLI-038
  billing_email                   varchar(150)  CHECK (billing_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'), -- CLI-039
  collections_email               varchar(150)  CHECK (collections_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'), -- CLI-040
  receives_electronic_documents   boolean       NOT NULL DEFAULT true,                                -- CLI-041 (API: !== false)
  -- ----- logística -----
  delivery_route_id               uuid,                                                               -- CLI-042
  commercial_zone_id              uuid,                                                               -- CLI-043
  -- CLI-044: SEGUN_PEDIDO (Ficha/mocks DEMO) NÃO entra: a API o rejeitaria (DIV-10); BACKFILL -> A_DEMANDA é DEFINIR
  delivery_frequency              text          CHECK (delivery_frequency IN ('DIARIA', 'SEMANAL', 'QUINCENAL', 'MENSUAL', 'A_DEMANDA')),
  -- CLI-045: 1=Lunes ... 7=Domingo; NULL quando vazio (a API envia NULL com lista vazia, DIV-27).
  -- DEFINIR: smallint[] x tabela customer_delivery_days. A API ordena e remove repetidos;
  -- esse saneamento fica na camada de dados (CHECK de repetição exigiria função auxiliar).
  delivery_days                   smallint[]    CHECK (delivery_days IS NULL OR
                                    (cardinality(delivery_days) BETWEEN 1 AND 7
                                     AND delivery_days <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[])),
  commercial_notes                varchar(1000),                                                      -- CLI-046
  logistics_notes                 varchar(1000),                                                      -- CLI-047
  is_active                       boolean       NOT NULL DEFAULT true,                                -- CLI-048. DEFINIR: política de baixa/exclusão (sem PUT/PATCH na API)
  created_at                      timestamptz   NOT NULL DEFAULT now(),                               -- CLI-050
  updated_at                      timestamptz   NOT NULL DEFAULT now(),                               -- CLI-049 (trigger set_updated_at)
  created_by                      uuid,                                                               -- CLI-051: proposto NOT NULL; anulável porque clientes importados/DEMO não têm autor (DEFINIR auditoria)

  CONSTRAINT customers_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT customers_company_code_key  UNIQUE (company_id, code),                                  -- CLI-002
  CONSTRAINT customers_company_external_code_key UNIQUE (company_id, external_code),                 -- CLI-030 (NULLs distintos: só vale quando informado)

  -- FKs compostas (mesma empresa por construção)
  CONSTRAINT customers_customer_group_fk FOREIGN KEY (company_id, customer_group_id) REFERENCES customer_groups (company_id, id),
  CONSTRAINT customers_payment_term_fk   FOREIGN KEY (company_id, payment_term_id)   REFERENCES payment_terms   (company_id, id),
  CONSTRAINT customers_sales_channel_fk  FOREIGN KEY (company_id, sales_channel_id)  REFERENCES sales_channels  (company_id, id),
  CONSTRAINT customers_salesperson_fk    FOREIGN KEY (company_id, salesperson_id)    REFERENCES salespeople     (company_id, id),
  CONSTRAINT customers_delivery_route_fk FOREIGN KEY (company_id, delivery_route_id) REFERENCES delivery_routes (company_id, id),
  CONSTRAINT customers_commercial_zone_fk FOREIGN KEY (company_id, commercial_zone_id) REFERENCES commercial_zones (company_id, id),
  CONSTRAINT customers_sales_blocked_by_fk FOREIGN KEY (company_id, sales_blocked_by) REFERENCES users (company_id, id),
  CONSTRAINT customers_created_by_fk     FOREIGN KEY (company_id, created_by)        REFERENCES users (company_id, id),

  -- Regras de integridade que o SQL implementa (todas provadas no código: CLIENTES.md "Regras confirmadas")
  -- Regra 4: person_type <-> taxpayer_type_code (FISICA=1, JURIDICA=2)
  CONSTRAINT customers_taxpayer_type_chk CHECK (
    (person_type = 'FISICA' AND taxpayer_type_code = 1) OR (person_type = 'JURIDICA' AND taxpayer_type_code = 2)),
  -- Regra 6: contribuinte -> document_type RUC, DV obrigatório, sem tipo/descrição de identidade
  CONSTRAINT customers_contributor_chk CHECK (
    recipient_nature_code <> 1 OR
    (document_type = 'RUC' AND tax_id_check_digit IS NOT NULL AND length(btrim(tax_id_check_digit)) > 0
     AND identity_document_type_code IS NULL AND identity_document_description IS NULL)),
  -- Regra 7: não contribuinte -> tipo de documento da lista (não RUC), sem DV, código SIFEN derivado do tipo
  CONSTRAINT customers_noncontributor_chk CHECK (
    recipient_nature_code <> 2 OR
    (document_type <> 'RUC' AND tax_id_check_digit IS NULL
     AND identity_document_type_code IS NOT NULL
     AND identity_document_type_code = CASE document_type
         WHEN 'CEDULA_PARAGUAYA' THEN 1 WHEN 'PASAPORTE' THEN 2 WHEN 'CEDULA_EXTRANJERA' THEN 3
         WHEN 'CARNET_RESIDENCIA' THEN 4 WHEN 'INNOMINADO' THEN 5 WHEN 'TARJETA_DIPLOMATICA' THEN 6
         WHEN 'OTRO' THEN 9 END)),
  -- Regra 7: OTRO exige descrição (<=100)
  CONSTRAINT customers_other_doc_description_chk CHECK (
    document_type <> 'OTRO' OR (identity_document_description IS NOT NULL AND length(btrim(identity_document_description)) > 0)),
  -- Regra 9: informar vencimento do crédito exige limite temporário
  CONSTRAINT customers_temp_credit_chk CHECK (temporary_credit_expires_on IS NULL OR temporary_credit_limit IS NOT NULL),
  -- Regra 12: bloquear exige motivo; sem bloqueio não há data/autor do bloqueio (CASE ... ELSE NULL do INSERT).
  -- O motivo NÃO é anulado ao desbloquear (a Ficha DEMO o preserva): sem CHECK nesse sentido.
  CONSTRAINT customers_block_reason_chk CHECK (
    NOT is_sales_blocked OR (sales_block_reason IS NOT NULL AND length(btrim(sales_block_reason)) > 0)),
  CONSTRAINT customers_block_audit_chk CHECK (
    is_sales_blocked OR (sales_blocked_at IS NULL AND sales_blocked_by IS NULL))
);
COMMENT ON COLUMN customers.credit_limit IS 'SENSIVEL: CLIENTES_CREDITO.VER (ler) / CLIENTES_CREDITO.EDITAR (gravar) — proteção na camada de dados (REQ-2026-002 §4.1).';
COMMENT ON COLUMN customers.temporary_credit_limit IS 'SENSIVEL: CLIENTES_CREDITO.VER / CLIENTES_CREDITO.EDITAR.';
COMMENT ON COLUMN customers.temporary_credit_expires_on IS 'SENSIVEL: CLIENTES_CREDITO.VER / CLIENTES_CREDITO.EDITAR. Formato único de data na API é DEFINIR (DIV-11); o banco guarda date.';
COMMENT ON COLUMN customers.price_list_id IS 'Sem FK em P002. P004 adiciona customers_price_list_fk (company_id, price_list_id) -> price_lists (company_id, id).';

-- Unicidade da identificação por empresa (regra 8: tipo + número + DV; COALESCE do DV).
-- Q5 (aberta): o INNOMINADO ('0') pode repetir? A API atual o rejeita (DIV-19), mas é "provavelmente
-- não pretendido". Opção MENOS comprometedora: excluir INNOMINADO da unicidade (relaxar depois é fácil,
-- apertar com duplicados não). DEFINIR.
CREATE UNIQUE INDEX customers_company_identification_key
  ON customers (company_id, document_type, tax_id, coalesce(tax_id_check_digit, ''))
  WHERE document_type <> 'INNOMINADO';

CREATE INDEX customers_company_name_idx   ON customers (company_id, legal_name);
CREATE INDEX customers_company_active_idx ON customers (company_id, is_active);
CREATE INDEX customers_group_idx          ON customers (company_id, customer_group_id)  WHERE customer_group_id IS NOT NULL;
CREATE INDEX customers_salesperson_idx    ON customers (company_id, salesperson_id)     WHERE salesperson_id IS NOT NULL;
CREATE INDEX customers_price_list_idx     ON customers (company_id, price_list_id)      WHERE price_list_id IS NOT NULL;

-- Código gerado pelo banco (CLI-002; DEMO: 'CLI-' + maior número + 1 com 6 dígitos).
-- Só gera quando o INSERT não informa code (o INSERT atual não o informa). O lock consultivo por
-- empresa evita códigos repetidos em inserções concorrentes. DEFINIR: o gerador real (NAO_VERIFICADO).
CREATE OR REPLACE FUNCTION customers_assign_code() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('customers.code:' || coalesce(NEW.company_id::text, ''), 0));
    SELECT 'CLI-' || lpad((coalesce(max(substring(c.code FROM '^CLI-([0-9]+)$')::bigint), 0) + 1)::text, 6, '0')
      INTO NEW.code
      FROM customers c
     WHERE c.company_id = NEW.company_id;
  END IF;
  RETURN NEW;
END $$;
-- NOT NULL é verificado depois dos triggers BEFORE; por isso o trigger pode preencher code.
CREATE TRIGGER customers_assign_code_trg
  BEFORE INSERT ON customers
  FOR EACH ROW EXECUTE FUNCTION customers_assign_code();

-- ---------------------------------------------------------------------------
-- C2. customer_contacts (cliente_contactos)  CLI-061..076
-- ---------------------------------------------------------------------------
CREATE TABLE customer_contacts (
  id                            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),           -- CLI-061
  company_id                    uuid         NOT NULL REFERENCES companies (id),              -- CLI-062 (BACKFILL a partir do pai)
  customer_id                   uuid         NOT NULL,                                        -- CLI-063
  first_name                    varchar(100) NOT NULL CHECK (length(btrim(first_name)) > 0),  -- CLI-064 (API: "Cada contacto debe tener nombre.")
  last_name                     varchar(100),                                                 -- CLI-065
  job_title                     varchar(100),                                                 -- CLI-066
  department                    varchar(100),                                                 -- CLI-067 (departamento organizacional, NÃO o geográfico)
  phone                         varchar(30),                                                  -- CLI-068
  mobile_phone                  varchar(30),                                                  -- CLI-069
  email                         varchar(150) CHECK (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),    -- CLI-070
  is_primary                    boolean      NOT NULL DEFAULT false,                          -- CLI-071
  receives_orders               boolean      NOT NULL DEFAULT false,                          -- CLI-072
  receives_invoices             boolean      NOT NULL DEFAULT false,                          -- CLI-073
  receives_collections          boolean      NOT NULL DEFAULT false,                          -- CLI-074
  receives_electronic_documents boolean      NOT NULL DEFAULT false,                          -- CLI-075
  receives_notifications        boolean      NOT NULL DEFAULT true,                           -- CLI-076 (sem controle na tela; DEFINIR exibir)
  created_at                    timestamptz  NOT NULL DEFAULT now(),
  updated_at                    timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT customer_contacts_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT customer_contacts_customer_fk FOREIGN KEY (company_id, customer_id) REFERENCES customers (company_id, id)  -- ON DELETE: DEFINIR (NO ACTION)
);
CREATE INDEX customer_contacts_customer_idx ON customer_contacts (company_id, customer_id);
-- CLI-071 (proposta): no máximo um contato principal por cliente (hoje só a tela garante, DIV-18).
CREATE UNIQUE INDEX customer_contacts_one_primary_key ON customer_contacts (company_id, customer_id) WHERE is_primary;

-- ---------------------------------------------------------------------------
-- C3. customer_addresses (direcciones_cliente)  CLI-077..102
-- ---------------------------------------------------------------------------
CREATE TABLE customer_addresses (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),                -- CLI-077
  company_id              uuid          NOT NULL REFERENCES companies (id),                   -- CLI-078
  customer_id             uuid          NOT NULL,                                             -- CLI-079
  description             varchar(100),                                                         -- CLI-080: = label ou, na falta, o tipo (duplica label). INFERIDO NOT NULL; DEFINIR fundir com label -> anulável
  address_type           text          NOT NULL DEFAULT 'COMERCIAL'
                                       CHECK (address_type IN ('FISCAL', 'COMERCIAL', 'ENTREGA', 'SUCURSAL', 'OTRA')), -- CLI-081
  label                   varchar(100),                                                         -- CLI-082
  street                  varchar(300)  NOT NULL CHECK (length(btrim(street)) > 0),             -- CLI-083
  house_number            varchar(20),                                                          -- CLI-084: DEFINIR obrigatório p/ endereço fiscal (SIFEN) -> sem CHECK
  address_line2           varchar(200),                                                         -- CLI-085
  country_code            text          NOT NULL REFERENCES geo_countries (code),               -- CLI-086 (CLI-087 country_name NÃO existe: derivável)
  department_code         integer,                                                              -- CLI-088
  district_code           integer,                                                              -- CLI-090
  city_code               integer,                                                              -- CLI-092
  -- CLI-089/091/093: nomes desnormalizados. DEFINIR eliminar (derivar pelo código). Mantidos anuláveis
  -- porque, fora do PRY, a API usaria o texto do corpo (não há outra fonte). Para PRY a camada de
  -- dados os preenche a partir de geo_* (regra 17).
  department_name         varchar(100),
  district_name           varchar(100),
  city_name               varchar(100),
  postal_code             varchar(15),                                                          -- CLI-094
  receiving_contact_name  varchar(200),                                                         -- CLI-095 (texto livre; não referencia customer_contacts)
  receiving_contact_phone varchar(30),                                                          -- CLI-096
  receiving_hours         varchar(200),                                                         -- CLI-097
  notes                   varchar(500),                                                         -- CLI-098
  is_fiscal               boolean       NOT NULL DEFAULT false,                                 -- CLI-099
  is_default_delivery     boolean       NOT NULL DEFAULT false,                                 -- CLI-100
  -- numeric(9,6): 6 casas (~0,1 m) e até 3 dígitos inteiros; faixa real garantida pelo CHECK. CLI-101/102 (sem controle na tela)
  latitude                numeric(9,6)  CHECK (latitude  BETWEEN -90  AND 90),
  longitude               numeric(9,6)  CHECK (longitude BETWEEN -180 AND 180),
  created_at              timestamptz   NOT NULL DEFAULT now(),
  updated_at              timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT customer_addresses_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT customer_addresses_customer_fk FOREIGN KEY (company_id, customer_id) REFERENCES customers (company_id, id),
  -- CLI-088/090/092 + DIV-20: departamento+distrito+cidade validados JUNTOS contra a chave completa.
  -- MATCH FULL = ou os três códigos são nulos, ou os três existem em geo_cities (a FK de cidade
  -- implica a de distrito e a de departamento).
  CONSTRAINT customer_addresses_geo_fk FOREIGN KEY (department_code, district_code, city_code)
    REFERENCES geo_cities (department_code, district_code, code) MATCH FULL,
  -- Regra 17: país PRY exige departamento, distrito e cidade
  CONSTRAINT customer_addresses_pry_geo_chk CHECK (
    country_code <> 'PRY' OR (department_code IS NOT NULL AND district_code IS NOT NULL AND city_code IS NOT NULL)),
  -- Regra 16: tipo FISCAL força is_fiscal
  CONSTRAINT customer_addresses_fiscal_chk CHECK (address_type <> 'FISCAL' OR is_fiscal)
);
CREATE INDEX customer_addresses_customer_idx ON customer_addresses (company_id, customer_id);
-- CLI-099/100 (propostas): um endereço fiscal e um de entrega padrão por cliente (hoje só a tela, DIV-18).
CREATE UNIQUE INDEX customer_addresses_one_fiscal_key  ON customer_addresses (company_id, customer_id) WHERE is_fiscal;
CREATE UNIQUE INDEX customer_addresses_one_default_delivery_key ON customer_addresses (company_id, customer_id) WHERE is_default_delivery;

-- ---------------------------------------------------------------------------
-- C4. customer_documents (cliente_documentos)  CLI-103..112
-- ---------------------------------------------------------------------------
CREATE TABLE customer_documents (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),                            -- CLI-103
  company_id    uuid         NOT NULL REFERENCES companies (id),                               -- CLI-104
  customer_id   uuid         NOT NULL,                                                         -- CLI-105
  document_type text         NOT NULL DEFAULT 'OTRO'
                             CHECK (document_type IN ('RUC', 'CONTRATO', 'CREDITO', 'EXONERACION', 'OTRO')), -- CLI-106. DEFINIR: 'CREDITO' é dado sensível (CLIENTES_CREDITO)?
  file_name     varchar(255) NOT NULL CHECK (length(btrim(file_name)) > 0),                    -- CLI-107
  -- CLI-108: apenas link (não há upload). A API não limita o tamanho nem valida o esquema; exigir https é
  -- DEFINIR (regras que dependem de definição 8) -> sem CHECK. RISCO conhecido: URL arbitrária (javascript:, http).
  file_url      text         NOT NULL CHECK (length(btrim(file_url)) > 0),
  issued_on     date,                                                                          -- CLI-109
  expires_on    date,                                                                          -- CLI-110
  notes         varchar(500),                                                                  -- CLI-111
  uploaded_by   uuid,                                                                          -- CLI-112: INFERIDO NOT NULL; anulável p/ documentos importados. DEFINIR
  created_at    timestamptz  NOT NULL DEFAULT now(),                                           -- CLI-112: data de carga (INSERT atual não a informa; DEFINIR created_at)
  updated_at    timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT customer_documents_company_id_id_key UNIQUE (company_id, id),
  CONSTRAINT customer_documents_customer_fk    FOREIGN KEY (company_id, customer_id) REFERENCES customers (company_id, id),
  CONSTRAINT customer_documents_uploaded_by_fk FOREIGN KEY (company_id, uploaded_by) REFERENCES users (company_id, id),
  -- Regra 19 / CLI-110
  CONSTRAINT customer_documents_dates_chk CHECK (issued_on IS NULL OR expires_on IS NULL OR expires_on >= issued_on)
);
CREATE INDEX customer_documents_customer_idx ON customer_documents (company_id, customer_id);

-- ---------------------------------------------------------------------------
-- D. updated_at automático (set_updated_at() vem de P001)
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['geo_countries','geo_departments','geo_districts','geo_cities','currencies',
                           'payment_methods','incoterms','units_of_measure','taxes',
                           'payment_terms','customer_groups','salespeople','delivery_routes',
                           'commercial_zones','sales_channels',
                           'customers','customer_contacts','customer_addresses','customer_documents'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t||'_set_updated_at', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- E. Row Level Security (somente tabelas de negócio; catálogos globais NÃO têm RLS)
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['payment_terms','customer_groups','salespeople','delivery_routes','commercial_zones',
                           'sales_channels','customers','customer_contacts','customer_addresses','customer_documents'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY %I ON %I USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id())$p$,
                   t||'_tenant_isolation', t);
  END LOOP;
END $$;

-- ===========================================================================
-- PENDÊNCIAS DE DEFINIÇÃO (resumo; cada uma está marcada com "DEFINIR" no ponto do SQL)
-- ===========================================================================
--  1. payment_methods: GLOBAL (contrato do brief) x POR EMPRESA (o código filtra medios_pago por empresa_id).
--  2. units_of_measure e taxes: globais x por empresa x globais com habilitação por empresa (Q-01); company_taxes / company_units_of_measure NÃO criadas.
--  3. payment_terms: por empresa (contrato) exige BACKFILL do catálogo global atual por empresa; due_days (tipo/obrigatoriedade) e requires_credit sem regra.
--  4. Unicidade de identificação: INNOMINADO fora do índice (Q5); separar tax_id de document_number (Q7); DV de 1 caractere e módulo 11 (Q10); RUC com 8 dígitos.
--  5. customers.taxpayer_type_code redundante com person_type: manter os dois? (Q6). Códigos SIFEN x texto no DTO (DIV-08).
--  6. Crédito: moeda do limite, precisão (18,4 x 18,2), 0 x NULL no limite temporário, permissão CLIENTES_CREDITO (camada de dados), documentos 'CREDITO' sensíveis?
--  7. Bloqueio de vendas: efeito nos módulos, quem bloqueia/desbloqueia, histórico (customer_credit_events NÃO criada).
--  8. delivery_days: smallint[] x tabela customer_delivery_days; delivery_frequency SEGUN_PEDIDO -> A_DEMANDA no BACKFILL.
--  9. Nomes geográficos desnormalizados em customer_addresses (department/district/city_name): eliminar? País (nome) não foi criado.
-- 10. Chave natural de geo_districts/geo_cities (DIV-20) e se geo_departments precisa de country_code; endpoint comum de países (DIV-02).
-- 11. Endereço fiscal: house_number obrigatório (SIFEN)? coordenadas e receives_notifications entram na tela?
-- 12. customer_documents.file_url: exigir https / bloquear esquemas perigosos; uploaded_by e created_by anuláveis (NOT NULL proposto); retenção/LGPD.
-- 13. Gerador de customers.code: o trigger deste arquivo reproduz o formato DEMO (CLI-000001); o gerador real é NAO_VERIFICADO.
-- 14. Política ON DELETE de contatos/endereços/documentos e de clientes com faturas (NO ACTION aqui); escopo por sucursal de clientes, vendedores, rotas e zonas (Q8).
-- 15. Unicidade de code em catálogos por empresa (grupos, vendedores, rotas, zonas, canais) e globais (payment_methods, units_of_measure, taxes): NAO_VERIFICADO; code NOT NULL assumido pelo rótulo "codigo · nombre".

COMMIT;
