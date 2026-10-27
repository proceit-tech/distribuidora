# DIAGNÓSTICO V1 — trabalho existente, escopo reduzido e viabilidade dos relatórios urgentes

Requisito: REQ-2026-003 · PR #4 · Código analisado: `main` @ `0dbb013` (o código funcional é idêntico ao de `1272447`) · Data: 2026-10-09
Base: `PRIORIDADE-V1-RELATORIOS-CUSTO-ESTOQUE.md` (`8e1b914`). Este documento **não altera código, não executa migrations e não toca em banco real.**

## 1. Origem do trabalho reaproveitado (nada foi refeito)

O mapeamento e os SQL propostos já existiam em uma sessão anterior do Claude e **não tinham sido publicados**: estavam na worktree local `dn-003` (branch `docs/REQ-2026-003-mapeamento-banco`, sem commit). Foram publicados sem reescrita no commit `c5fe4fe` (reaplicado sobre `8e1b914`).

| Conteúdo | Arquivos | Tamanho |
|---|---|---|
| Mapa campo a campo por módulo | `levantamento/campos/{AUTH-ADMIN,CLIENTES,PROVEEDORES,PRODUCTOS,LISTAS-PRECIO,ESTOQUE-COMPRAS,FACTURACION-DASHBOARD}.md` | **1.322 linhas de tabela**: 1.144 campos (`AUT` 132, `CLI` 162, `PRV` 171, `PRO` 199, `LPR` 130, `STK` 82, `MOV` 41, `REC` 58, `FAC` 113, `DSH` 56) e 178 divergências (`DIV`/`DLP`) |
| Propostas SQL em inglês | `migracoes/propostas/REQ-2026-003-P001…P006-*-up.sql` e `-down.sql` | 65 tabelas no total após P006 |
| Testes de isolamento e integridade | `validacoes/TESTE-P001…P006-*.sql`, `_helpers-teste.sql` | ver `testes/TST-REQ-2026-003.md` |

Os arquivos mantêm a numeração `P00N` (propostas) e **não** estão em `migracoes/` com o nome final `REQ-2026-003-001-up.sql`: nada é migration pronta (esquema real NAO_VERIFICADO).

## 2. Diagnóstico por módulo

| Módulo | O que já foi feito | O que falta | Prioridade V1 |
|---|---|---|---|
| Segurança (empresas, usuários, perfis, permissões, sucursais, depósitos) | Mapa `AUT` (132 campos); P001 (12 tabelas, FK composta, RLS `FORCE`, funções `app_company_id()`/`set_updated_at()`); desenho e matriz do REQ-2026-002 (D-01 a D-12) | Login atual só usa `empresa_id` da sessão; permissões nunca são lidas no servidor (`permissions.ts` não importado); sem camada de dados com `withTenantTx`; banco real não inspecionado | **P0 — obrigatório** |
| Clientes | Mapa `CLI` (162); P002 (31 tabelas somadas a P001: catálogos globais + `customers` e filhas) | Listado e Ficha só em `localStorage`; só existe `POST`/`GET` na API e o formulário Nuevo não funciona com banco real (DIV-01 do mapa); falta `PUT`/baixa | **P1** (Entrega 1) |
| Proveedores | Mapa `PRV` (171); P003 (fornecedores e filhas) | Nenhuma tela chama `/api/proveedores`; falta edição e baixa | **P1** (Entrega 1) |
| Productos | Mapa `PRO` (199); P003 (`products`, códigos, unidades, depósitos por produto); `costo_promedio` já é gravado por `POST /api/productos` (`route.ts:272`) | Telas só em `localStorage`; **custo médio é digitado à mão** (Q-05); sem `PUT`; produto não tem moeda de custo | **P1** (Entrega 1) — dono do custo |
| Depósitos | Em P001 (`warehouses`) | Tabela `depositos` existe segundo o SQL de produtos, mas só colunas provadas pelo código; sem CRUD | **P1** (Entrega 2) |
| Stock | Mapa `STK` (82); P005 (`stock_balances`, `stock_lots`) | **Sem API, sem SQL, sem tabela no código.** Tela e Excel em `localStorage`; valorização incoerente (§3) | **P1** (Entrega 2) |
| Movimientos | Mapa `MOV` (41); P005 (`inventory_movements`, `inventory_movement_lines`) | **Sem API.** Movimento não guarda custo; saída de venda não gera movimento; sem transação | **P1** (Entrega 2) |
| Listas de precio | Mapa `LPR` (130); P004 | Telas em `localStorage`; só 6 colunas de `listas_precio` provadas pelo código | **P2** (Entrega 4) |
| Facturas / ventas | Mapa `FAC` (113); P006 (65 tabelas) | Tudo em `localStorage`; **item de fatura não guarda custo** (§3); SIFEN simulado | **P1 apenas o necessário para o relatório** (linhas de venda com custo congelado); resto adiado |
| Recepciones | Mapa `REC` (58); P005 (`goods_receipts`) | Demonstrativo; **não recalcula o custo médio** (DIV-21) | **P2** — só se alimentar custo |
| Dashboard | Mapa `DSH` (56) | Todos os números são literais no código; link "Ver reporte" aponta para `/reportes`, que não existe | Fora da V1 |
| Reportes + Excel | — | Não existe relatório de vendas ao custo; Excel só em `/stock` | **P0 urgente** (§3) |

Não foram refeitos: mapeamento, SQL P001–P006 e testes. Correções feitas neste commit: ver `testes/TST-REQ-2026-003.md` (§Correções).

## 3. Viabilidade dos relatórios urgentes (pedido do cliente para 2026-10-10, 08:00)

Classificação: **EXISTE** / **PARCIAL** / **AUSENTE**. Evidência: leitura do código `0dbb013`; nada executado contra banco.

### 3.1 Stock valorizado — PARCIAL (somente demonstração)
- **Existe:** tela `/stock` com exportação XLSX (`app/(private)/stock/page.tsx:459-625`, hoja "Resumen" e hoja "Stock valorizado", biblioteca `xlsx@0.18.5` em `package.json:16`).
- **Não é custo.** `costoUnitario(item)` devolve `precioVentaReferencia` (`stock/page.tsx:54-58`) e `valorCosto` multiplica por `disponible` (`:60-65`). Há ainda um `MARKUP_DEMO = 0.2` (`:52`) que gera um "precio de venta" a partir desse valor. O tipo tem `costoPromedio` e `valorInventario` (`types/stock.ts:81-82`), mas a tela os ignora (DIV-01 do mapa). Resultado: o Excel de hoje confunde **preço comercial com custo**.
- **Quantidades não são reais.** `StockDemo` vem de `lib/mocks/stock.ts` e `localStorage`; **não existe API nem tabela de stock/movimentos no código** (`app/api` só tem `auth`, `clientes`, `productos`, `proveedores`). O saldo inicial é derivado do cadastro de demonstração (`lib/mocks/stock.ts:60-110`).
- **Custo existe só no cadastro.** `productos.costo_promedio` é persistido por `POST /api/productos` (`route.ts:272`, `:289`), digitado à mão. No seed, `costoPromedio = 0` (DIV-01).
- **Método de valorização em uso:** nenhum. `valorInventario = totalFisico × costoPromedio` (`lib/mocks/movimientos-stock-storage.ts:161-164`) usa o custo **atual** do cadastro; recepções não recalculam custo médio (DIV-21).
- **Faltam para ser real:** saldos por depósito no PostgreSQL, escolha do método de custo, moeda/unidade de medida, e as permissões `PRODUCTOS_COSTO.VER` (D-06/D-10).

### 3.2 Reporte de ventas al costo — AUSENTE
- Não existe relatório de vendas. Facturas estão só em `localStorage` (`lib/mocks/facturas-storage.ts`); **nenhuma API, nenhuma tabela**.
- **`FacturaItem` não tem campo de custo** (`types/facturas.ts:48-59`: só `precioUnitario` e `subtotal`). Não há custo histórico em nenhuma venda já emitida; **não dá para reconstruí-lo** do que existe.
- Ao criar um item, o preço unitário **nasce igual a `costoPromedio`** (`facturas/nuevo/page.tsx:291-300`), ou seja, preço e custo se confundem na origem.
- Emitir fatura não gera movimento de saída de stock (não há vínculo entre `facturas-storage.ts` e os movimentos).
- O dashboard mostra "Ventas de los últimos 7 días" com números fixos (`dashboard/page.tsx:235-239`).

### 3.3 Conclusão de viabilidade
| Pergunta | Resposta com o que existe |
|---|---|
| Há quantidades reais? | **Não verificado.** No código só há `localStorage`. Se existir stock no PostgreSQL do cliente, o código atual não o lê |
| Há custos reais? | **Parcial:** `productos.costo_promedio` (digitado), sem histórico e sem moeda |
| Há método de valorização? | **Não.** Custo atual do cadastro × saldo |
| Há custo histórico por venda? | **Não** |
| Dá para entregar às 08:00 um relatório "real"? | **Não, sem inventar dados.** Seria necessário banco com saldos, custo congelado por movimento e relatório com permissão de custo |

Opções para as 08:00 (decisão do responsável, ver §5):
- **A. Demonstração rotulada DEMO** no protótipo (o cliente já viu o protótipo): corrigir o Excel de `/stock` para usar `costoPromedio` e rotular o arquivo "DEMO", e acrescentar um relatório de vendas ao custo **apenas com dados de demonstração**, também rotulado. É mudança de código funcional: exige PR de implementação separado e autorização.
- **B. Entrega real**, mais lenta: P001 + P003 (produtos/custo) + P005 (stock/movimentos com custo congelado) + camada de dados + relatórios + XLSX. Não cabe até as 08:00.
- **Nenhuma** das duas pode apresentar números de `localStorage` como resultado real.

## 4. Fichas por módulo (tela, API, tabelas, persistência)

| Módulo | Telas | API | Tabelas citadas pelo SQL do código | Persistência | Completo | Faltante | SQL já preparado | Dependências |
|---|---|---|---|---|---|---|---|---|
| Auth | `(public)/login` | `auth/login`, `auth/logout` | `usuarios`, `empresas`, `sesiones_usuario`, `eventos_seguridad` (perfis e permissões não são lidos pelo login) | Real (login) + DEMO (menu/permissões) | login e sessão | permissões no servidor; administração | P001 | — |
| Clientes | `/clientes`, `/nuevo`, `/[id]` | `clientes` (`GET`, `POST`) | `clientes`, `cliente_contactos`, `direcciones_cliente`, `cliente_documentos` (gravação) e 11 catálogos lidos (`listas_precio`, `condiciones_pago`, `monedas`, `referencia_geografica_*` etc.) | API real (só criar); telas DEMO | criar via API | listar/editar/baixa reais | P002 | P001 |
| Proveedores | `/proveedores`, `/nuevo`, `/[id]` | `proveedores` (`GET`, `POST`) | `proveedores` e filhas (21 tabelas distintas no SQL) | API real; telas DEMO | criar via API | telas ligadas à API | P003 | P001, P002 |
| Productos | `/productos`, `/nuevo`, `/[id]` | `productos` (`GET`, `POST`) | `productos` e filhas (18 tabelas distintas no SQL) | API real; telas DEMO | criar via API | telas ligadas; edição | P003 | P001, P002 |
| Listas | `/listas-precio` | — | `listas_precio` (6 colunas provadas) | DEMO | — | tudo | P004 | P002, P003 |
| Stock | `/stock`, `/stock/[id]` | — | `depositos`, `producto_deposito_configuracion` (indireto) | DEMO | tela e Excel (não são custo) | tudo | P005 | P001, P003 |
| Movimientos | `/movimientos` | — | — | DEMO | tela | tudo | P005 | Stock |
| Recepciones | `/recepciones` | — | — | DEMO | tela | tudo | P005 | Proveedores, Productos |
| Facturas | `/facturas`, `/nuevo`, `/[id]` | — | — | DEMO | tela | tudo | P006 | Clientes, Productos, Stock |

## 5. Decisões pendentes (bloqueiam a implementação, não o inventário)

1. **Escopo de "mañana 08hs":** demonstração (opção A) ou produção (opção B)? Se for A, autorizar um PR de implementação separado.
2. **Método de custo:** médio ponderado, último custo ou outro; data de referência; moeda e unidade (Q-05/DEFINIR nos mapas).
3. **Custo médio:** editável à mão (como hoje) ou calculado pelos movimentos de entrada.
4. **Stock "valorizado":** valorizar físico, disponível ou virtual (reserva, quarentena, trânsito).
5. **Origem do relatório de vendas:** fatura emitida (e estados `BORRADOR`/`ANULADA`?), ou movimento de saída.
6. Devoluções, descontos, IVA e moeda nos relatórios.
7. Banco real: quem executa o roteiro somente leitura (`validacoes/CONSULTAS-CATALOGO-SOMENTE-LEITURA.sql`) e onde estão as migrations 001–017.

## 6. Scripts SQL necessários e ordem

Esquema alvo em inglês (greenfield). A **transição dos nomes em espanhol** do banco real (`empresas`, `productos`, `empresa_id`…) depende da introspecção (NAO_VERIFICADO); a estratégia proposta é por etapas e compatível (nova estrutura em paralelo, `VIEW`s de compatibilidade e troca por módulo), nunca renomear tabela em uso. Será detalhada em `PLANO-MIGRACAO-INGLES.md` depois do levantamento real.

| Ordem | Script | Conteúdo | V1 |
|---|---|---|---|
| 1 | P001 | Empresas, sucursais, depósitos, usuários, perfis, permissões, sessões, eventos | Sim |
| 2 | P002 | Catálogos globais e clientes | Sim |
| 3 | P003 | Fornecedores e produtos (custo médio) | Sim |
| 4 | P005 | Stock, lotes, movimentos (falta: **custo congelado no movimento**) | Sim |
| 5 | P004 | Listas de preço | Entrega 4 |
| 6 | P006 | Faturamento (falta: **custo congelado na linha**) | Só o necessário para a venda |
Faltam como novas propostas, após as decisões do §5: coluna de custo unitário nas linhas de movimento e de fatura, e as consultas dos dois relatórios.

## 7. PRs de implementação sugeridos (incrementais, depois da autorização)

1. **PR-A Base de segurança:** camada de dados + `withTenantTx` + permissões no servidor (REQ-2026-002 fase 1–3).
2. **PR-B Cadastros:** clientes, proveedores, productos ligados à API (P002/P003).
3. **PR-C Estoque:** depósitos, saldos, movimentos transacionais com custo congelado (P005).
4. **PR-D Relatórios:** stock valorizado, vendas ao custo, XLSX, com `PRODUCTOS_COSTO.VER`.
5. **PR-E Comercial:** listas de preço (P004) e ajustes.

Antes de qualquer um: REQ-2026-004 (CI e testes) e a introspecção do banco real.

## Atualização — rodada de correção da AUD-REQ-2026-003-R01

Após as decisões `DEC-003-01..04` (`f9f8395`), este diagnóstico passa a ser complementado por: `CUSTEIO-V1.md` (método e fórmulas), P007 (estrutura de custo e views dos relatórios), `DICIONARIO-DADOS.md`, `RELACIONAMENTOS-ENTIDADES.md`, `DIVERGENCIAS-FRONTEND-BACKEND-BANCO.md`, `PLANO-MIGRACAO-INGLES.md` e `validacoes/REPRODUCAO-TESTES.md`. As linhas "Stock", "Movimientos" e "Reportes" da tabela do §2 passam a ter **estrutura SQL proposta e testada em banco descartável**; continuam **sem API, tela, XLSX nem dados reais** e o banco real segue NAO_VERIFICADO. O diagnóstico original acima não foi reescrito.
