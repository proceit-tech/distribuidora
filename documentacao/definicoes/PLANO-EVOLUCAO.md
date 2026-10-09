# DistribuNex — Riscos e plano de evolução

Requisito: REQ-2026-001 (RN-04, RN-06, RN-07, CA-04, CA-05) · Autor: Claude · Data: 2026-10-08 · Base: `main` @ `7f4230a`

Este documento **propõe**; não implementa nada. Cada REQ futuro precisa ser definido pelo ChatGPT/responsável (status `DEFINIDO`) antes de ser implementado. Princípio comum a todos: **preservar as telas existentes**. A evolução troca a fonte de dados por trás da tela (do `localStorage` para a API), sem redesenhar a interface.

## 1. Riscos, inconsistências e dívida técnica (CA-04)

Severidade: **CRÍTICA** (impede uso com dados reais), **ALTA**, **MÉDIA**, **BAIXA**. As referências ao OWASP ASVS são da versão 5.0, por capítulo.

| ID | Sev. | Achado | Evidência | Recomendação | ASVS |
|---|---|---|---|---|---|
| R-01 | CRÍTICA | Em `DEMO_MODE=true`, a sessão é o cookie constante `demo-casa-mingo`: quem o enviar é administrador. A credencial demo (`admin123`) está no código e pré-preenchida na tela | `lib/auth/session.ts:13,92`; `app/api/auth/login/route.ts:21-23`; `components/auth/login-form.tsx:31,140` | Demo só em ambiente isolado, sem dados reais; sessão demo com token aleatório; credencial demo fora do código; impedir `DEMO_MODE` quando `NODE_ENV=production` com banco configurado | V6, V7, V13 |
| R-02 | CRÍTICA | Nenhuma autorização por perfil: `permissions.ts` não é usado; o menu mostra tudo; qualquer usuário autenticado lê e grava todos os cadastros da empresa | `lib/auth/permissions.ts` (0 importações); `lib/auth/server-context.ts:37`; APIs sem checagem | Verificar permissão no servidor, em cada rota (negação por padrão), e filtrar o menu pelas permissões reais — escopo do REQ-2026-002 | V8 |
| R-03 | CRÍTICA | O sistema não é operável com dados reais: 23 de 26 telas gravam só no navegador; estoque, recepções, movimentos e faturas não têm tabela | `MAPA-MODULOS.md` §1; `MODELO-DADOS-ATUAL.md` §4 | Migrar módulo a módulo (REQs 006 a 012) | — |
| R-04 | CRÍTICA | Não há esquema SQL versionado; as migrations 001–017 citadas no README não estão no repositório; o banco não foi inspecionado | `git log --all -- '*.sql'` vazio; `README.md:14-18` | REQ-2026-003 proposto (linha de base do banco) antes de qualquer mudança de dados | V15 |
| R-05 | ALTA | A fatura demo é marcada `APROBADA`, com CDC fictício, e a interface mostra "Documento aprobado". Exibida ao cliente, pode ser confundida com documento fiscal válido | `lib/mocks/facturas-storage.ts:208-212` | Identificar visualmente como "SIMULACIÓN — sin validez fiscal" já no próximo REQ de faturamento; emissão real só com SIFEN | V2 |
| R-06 | ALTA | `POST /api/productos` grava IDs de categoria, marca, imposto, unidade, fornecedor, depósito e produtos relacionados sem validar que pertencem à empresa (referência cruzada entre tenants). Em proveedores, o `impuesto_id` da retenção também não é validado | `app/api/productos/route.ts:272-410`; `app/api/proveedores/route.ts:824` | Validar cada FK com `empresa_id` (como já faz `validarReferenciaEmpresa`) e considerar RLS | V8 |
| R-07 | ALTA | Contrato quebrado em `/clientes/nuevo`: a API não envia `paises` e a tela não envia `paisNombre`. Em modo real, o cadastro de cliente falha | `clientes/nuevo/page.tsx:135,290,490`; `app/api/clientes/route.ts:572,667` | Corrigir no REQ de clientes, com teste de integração do contrato | V2 |
| R-08 | ALTA | Mensagens internas do banco e de exceções devolvidas ao cliente (`error.message`, inclusive com o código `P0001`/`23514` do Postgres) | `clientes/route.ts:1128`; `proveedores/route.ts:893,897`; `productos/route.ts:431-433` | Separar erros de validação (mensagem controlada) de erros internos (mensagem genérica + log com ID de correlação) | V16 |
| R-09 | ALTA | Dados de inventário de prospect (562 itens, com preço e quantidade, `INVENTARIO_MINGO`) e nome do prospect versionados no código; o repositório estava público | `lib/mocks/productos.ts`; `recepciones-storage.ts:247`; `facturas/nuevo/page.tsx:84` | Tornar o repositório privado (pendente com o responsável); substituir por dados fictícios num REQ próprio; avaliar se o histórico precisa ser limpo | V14 |
| R-10 | ALTA | Nenhum teste automatizado, nenhum CI; lint/build não puderam ser executados neste ambiente | `package.json` (sem script `test`); `TST-REQ-2026-001.md` | REQ-2026-004 proposto (base de testes e CI) | V15 |
| R-11 | MÉDIA | Integração entre módulos inconsistente: produto novo não entra no stock; recepção de produto novo falha; cliente da API não aparece na lista; fatura não baixa stock nem usa lista de preço | `ARQUITETURA-ATUAL.md` §4 | Resolver ao migrar cada módulo para o banco, com transações únicas | V2 |
| R-12 | MÉDIA | Recepção aplica os movimentos item a item, sem atomicidade | `lib/mocks/recepciones-storage.ts:216` | Transação única no servidor | V2 |
| R-13 | MÉDIA | Cálculos fiscais e de custo inconsistentes: alíquota inferida pelo nome do imposto; o custo exibido no stock é o preço de venda; preço da fatura = custo médio (0) | `facturas/nuevo/page.tsx:261-292`; `stock/page.tsx:54` | Alíquota pelo cadastro do imposto; custo médio real; preço vindo da lista vigente | V2 |
| R-14 | MÉDIA | DV de RUC sem verificação (mód. 11); formatos de data diferentes entre APIs (`dd/mm/yyyy` × `yyyy-mm-dd`) | `clientes/route.ts:676,224`; `proveedores/route.ts:223,573`; `productos/route.ts:79` | Função única de RUC/DV e padrão ISO-8601 na API | V2 |
| R-15 | MÉDIA | Proteção de rota só no layout; não há `proxy`/middleware nem verificação centralizada; as APIs repetem a lógica de sessão | `app/(private)/layout.tsx:11-15` | Manter a verificação no servidor por rota (o Next recomenda checar perto dos dados) e acrescentar uma camada de acesso a dados com sessão e permissão | V8 |
| R-16 | MÉDIA | A sessão valida bcrypt (custo 12) a cada requisição: latência e CPU altas sob carga; não há expiração por inatividade nem rotação | `lib/auth/session.ts:121` | Comparar um hash SHA-256 do token (o token já tem 256 bits de entropia) e adicionar timeout de inatividade | V7 |
| R-17 | MÉDIA | IP do log vem de `x-forwarded-for` sem proxy confiável definido; o bloqueio por usuário permite que terceiros bloqueiem contas | `login/route.ts:25,184` | Confiar só no cabeçalho do Traefik; somar limitação por IP | V6, V16 |
| R-18 | MÉDIA | Dados bancários de fornecedores serão gravados em texto claro (quando a API for usada) | `proveedores/route.ts:792` | Definir classificação, mascaramento na leitura e acesso por permissão específica | V14 |
| R-19 | BAIXA | 24 itens de menu e 9 links do dashboard apontam para páginas inexistentes | `MAPA-MODULOS.md` §2; `dashboard/page.tsx` | Ocultar até existir a funcionalidade, ou marcar "Próximamente" | — |
| R-20 | BAIXA | 10 arquivos vazios; CSS module sem uso; tipos duplicados (`types/navigation.ts`); `"use client"` em arquivo de tipos; `await import` no topo de `permissions.ts`; três abordagens de estilo | `MAPA-MODULOS.md` §4 | Limpeza num REQ técnico, sem efeito visual | V15 |
| R-21 | BAIXA | `xlsx` 0.18.5 (versão do npm) tem vulnerabilidades conhecidas na **leitura** de planilhas; hoje só exporta | `package.json`; `stock/page.tsx:459` | Confirmar com `npm audit` (NAO_EXECUTADO) e avaliar a distribuição oficial do SheetJS antes de qualquer importação | V15 |
| R-22 | BAIXA | O README descreve um ambiente que não existe (`.env.local.example`, migrations) | `README.md:14-18` | Atualizar no REQ-2026-003 proposto | — |
| R-23 | MÉDIA | A integração Vercel continua ativa: cada push, inclusive de branches de documentação, gera um deploy (status "Deployment has completed" em todos os SHAs de 2026-10-08). A PROCEIT decidiu deixar o Vercel, e o repositório é público | `gh api repos/proceit-tech/distribuidora/commits/<sha>/status` (TST V15) | Desconectar o projeto no Vercel quando a VM estiver servindo o sistema (até lá, a integração serve de evidência de build) | V13 |

## 2. Plano de migrations (RN-06)

1. **Nada é criado por suposição.** O ponto de partida é o esquema real, obtido conforme o plano em `MODELO-DADOS-ATUAL.md` §5.
2. A linha de base (estrutura existente, sem dados nem segredos) é versionada uma única vez, como referência; ela não é reaplicada em bancos que já existem.
3. Toda mudança posterior é incremental: `documentacao/banco/REQ-AAAA-NNN-001-up.sql` e `-down.sql`, com o cabeçalho do protocolo (tenant, transação, impacto, rollback, validação).
4. Ordem de aplicação: banco de desenvolvimento → homologação → produção, esta última **só com aprovação do responsável**, via pipeline e com backup antes.
5. Tabelas novas (stock, movimentos, recepções, faturas) partem dos tipos em `types/*.ts` como insumo, mas cada uma tem modelagem aprovada no seu REQ.

## 3. Próximos requisitos propostos (CA-05)

Sequência pensada para tirar risco primeiro e depois entregar valor módulo a módulo. Estimativas são referência, para calibrar o catálogo de horas.

> **Numeração.** O número REQ-2026-002 já foi definido pelo responsável para **multiempresa, usuários, perfis e menus** (`REQ-2026-002-multiempresa-usuarios-perfiles-menus.md`, na `main` em `ff77929`). As propostas abaixo usam os números seguintes; a autorização por perfil, que antes aparecia como proposta própria, passa a ser coberta pelo REQ-2026-002.

| Ordem | REQ | Objetivo | Depende de | Entregável verificável | Est. |
|---|---|---|---|---|---|
| 1 | **REQ-2026-003 — Linha de base do banco** (proposto) | Obter o esquema real (introspecção somente leitura + migrations 001–017), versionar a linha de base, conciliar com `MODELO-DADOS-ATUAL.md`, atualizar README e `.env.example` | Autorização e acesso somente leitura do responsável | `documentacao/banco/baseline/`, relatório de divergências | 4–8 h |
| 2 | **REQ-2026-004 — Base de testes e CI** (proposto) | Vitest (regras de `lib/mocks`, validações das APIs, autorização), PostgreSQL efêmero no CI para testes de integração, Playwright (login e menus por perfil), GitHub Actions: lint → typecheck → testes → build → `npm audit` | — (pode correr em paralelo ao 003) | Pipeline verde no PR | 8–12 h |
| 3 | **REQ-2026-002 — Multiempresa, usuários, perfis e menus** (definido) | R-02, R-06, R-19 e o aspecto de privilégio de R-01 (RN-12): autorização no servidor, menu filtrado, escopo por sucursal/depósito, administração de usuários e perfis, auditoria. Desenho em `DESENHO-REQ-2026-002-multiempresa.md` (PR próprio) | 003 (DDL), 004 (testes) | Testes CA-01 a CA-10 do REQ | ver desenho |
| 4 | **REQ-2026-005 — Endurecer sessão e erros** (proposto) | R-08, R-15, R-16, R-17 e o restante de R-01: erros sem vazamento, hash de sessão, timeout de inatividade, IP confiável, credencial demo fora do código | 004; pode ser feito junto com a fase 1 do 002 | Testes de sessão e de erro | 6–10 h |
| 5 | **REQ-2026-006 — Productos no banco** (proposto) | Tela atual de produtos ligada a `/api/productos` (GET lista/detalhe, POST, PUT); importação controlada | 002, 003 | Teste de integração CRUD + tenant | 12–20 h |
| 6 | **REQ-2026-007 — Clientes no banco** (proposto) | Lista, detalhe e edição na API; corrigir R-07; DV de RUC (R-14) | 002, 003 | Teste do contrato tela ↔ API | 10–16 h |
| 7 | **REQ-2026-008 — Proveedores no banco** (proposto) | Ligar a tela à API existente; dados bancários com mascaramento e permissão específica (R-18) | 002, 003 | Testes de integração | 8–14 h |
| 8 | **REQ-2026-009 — Depósitos, stock e movimentos transacionais** (proposto) | Tabelas aprovadas para saldos e movimentos, transações, anulação por estorno, custo médio, escopo por depósito do 002 | 006 | Testes das 9 regras de movimento | 20–32 h |
| 9 | **REQ-2026-010 — Recepciones** (proposto) | Recepção atômica gerando entrada e custo; decidir se entra Orden de Compra antes | 008, 009 | Teste de recepção parcial e total | 12–20 h |
| 10 | **REQ-2026-011 — Listas de precio** (proposto) | Persistir e aplicar as regras de preço (modo, escalas, vigência, prioridade) | 006, 007 | Testes do cálculo de preço | 12–20 h |
| 11 | **REQ-2026-012 — Faturamento interno (sem SIFEN)** (proposto) | Fatura no banco: preço da lista, alíquota pelo cadastro, baixa de stock, numeração por estabelecimento e ponto; marca de simulação (R-05) | 009, 011 | Testes de totais e de estoque | 16–24 h |
| 12 | **REQ-2026-013 — Emissão eletrônica SIFEN** (proposto) | Contrato fiscal confirmado (versão do manual técnico DNIT, ambiente de testes, certificado), XML, assinatura, envio, KuDE e eventos | 012 + decisão do responsável sobre provedor ou integração própria (o produto de fatura eletrônica da PROCEIT) | Homologação no ambiente de testes SIFEN | a estimar após o contrato |
| — | **REQ técnico — Limpeza e dados fictícios** (proposto) | R-09 e R-20: trocar dados do prospect por fictícios; remover arquivos vazios e duplicações; padronizar estilos sem mudança visual | 004 | Diff sem mudança visual (comparação de screenshots) | 4–8 h |

Decisões que o responsável precisa tomar antes dos REQs 003, 009 e 013 (as decisões D-01 a D-04 do REQ-2026-002 estão no desenho próprio):
1. Onde estão as migrations 001–017 e qual banco é a referência.
2. Se o MVP do cliente final inclui Compras (Orden de compra) e Ventas (Pedidos), ou só cadastros + estoque + faturamento.
3. Se a emissão SIFEN usa o produto de fatura eletrônica da própria PROCEIT.
4. Se o modo demo continua existindo (para vendas) num ambiente separado.

## 4. Registro de numeração dos requisitos

Atende AUD-REQ-2026-001-R01 F-003. Fonte única para os números usados nos documentos e testes. Um número só passa a valer quando o arquivo `REQ-AAAA-NNN-*.md` existe na `main`. Os números "propostos" são sugestões do Claude e podem ser trocados pelo responsável; se forem, esta tabela é atualizada no mesmo PR.

| Número | Título | Situação | Arquivos |
|---|---|---|---|
| REQ-2026-001 | Consolidação documental | Definido; em auditoria | `REQ-2026-001-consolidacao-documental.md`, `TST-REQ-2026-001.md`, `AUD-REQ-2026-001-R*.md` |
| REQ-2026-002 | Multiempresa, usuários, perfis e menus | Definido (`ff77929`); desenho em auditoria (PR #3) | `REQ-2026-002-multiempresa-usuarios-perfiles-menus.md`, `DESENHO-REQ-2026-002-multiempresa.md`, `MATRIZ-PERMISOS-REQ-2026-002.md`, `TST-REQ-2026-002.md`, `AUD-REQ-2026-002-R*.md` |
| REQ-2026-003 | Linha de base do banco (introspecção) | Proposto | — |
| REQ-2026-004 | Base de testes e CI | Proposto | — |
| REQ-2026-005 | Endurecer sessão e erros | Proposto | — |
| REQ-2026-006 a 013 | Productos, Clientes, Proveedores, Stock, Recepciones, Listas de precio, Faturamento, SIFEN | Propostos | — |

Regra para evitar duplicação: antes de definir um REQ novo, consultar esta tabela e a pasta `documentacao/definicoes/`; o próximo número livre é o primeiro que não tem arquivo `REQ-*` na `main` **nem** aparece aqui como proposto.

