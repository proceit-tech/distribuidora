# Roteiro de implementação incremental V1 — Clientes, Proveedores, Productos, Stock, Movimientos e relatórios XLSX

Requisito: REQ-2026-003 (continuação) · PR #4 · Status: **PLANO — nenhum código foi alterado**. Cada passo abaixo é um **PR de código próprio**, com testes e autorização; nenhum PR começa antes do portão indicado. Base: `DIAGNOSTICO-V1.md`, `PLANO-MIGRACAO-INGLES.md`, `CUSTEIO-V1.md`, `DECISOES-PENDENTES-CUSTEIO-REQ-2026-003.md`.

## 1. Portões (valem para todos os passos)

| Portão | Condição | Estado hoje |
|---|---|---|
| G0 | Introspecção somente leitura do banco real recebida e comparada (`ROTEIRO-INTROSPECCAO-REAL.md`) | **Pendente (externo)** |
| G1 | Plano de migração por domínio aprovado após G0 (ensaio em cópia, rollback, IDs) | Pendente |
| G2 | Decisões D-C1..D-C9 aprovadas e registradas | Pendente |
| G3 | CI verde para SQL e app (REQ-2026-004) | Em início (branch/PR separado) |
| G4 | Camada de dados com `withTenantTx` + `PRODUCTOS_COSTO.VER` concedido (P008.4/P008.5) — só para o passo de relatórios | Pendente |
| G5 | Autorização expressa do responsável para qualquer execução no banco real / deploy | Pendente |

Sem G0 e G1 **não existe PR de migração**. Sem G4 **não existe relatório de custo exposto**.

## 2. Sequência de PRs

| # | PR | Conteúdo | Portões | Compatibilidade com o ambiente |
|---|---|---|---|---|
| I-0 | Camada de dados | `lib/data` com `withTenantTx` (empresa da sessão definida por `SET LOCAL`), `assertMismaEmpresa`; refatorar as 4 APIs existentes sem mudar contrato | G0, G3 | Mantém os nomes legados em espanhol até a migração |
| I-1 | Clientes | Corrigir bloqueio DIV-01/02 de Nuevo (país), `PUT`/baixa, listar a partir da API (sai de `localStorage`) | I-0 | Contrato de API só muda com requisito aprovado |
| I-2 | Proveedores | Telas ligadas à API real; edição e baixa | I-0 | idem |
| I-3 | Productos | Telas na API; **custo médio deixa de ser digitado** (passa a ser derivado de `inventory_costs`); `PUT` | I-0, G2 | idem |
| I-4 | Migração por domínio (expand/contract) | Migrations numeradas `REQ-2026-003-NNN-up/down` por domínio (catálogos → clientes → proveedores → productos), cada uma com ensaio em cópia | G0, G1, G5 | Views de compatibilidade só onde provadas por teste (R02-F-006) |
| I-5 | Stock e movimentos | API de movimentos que chama `inventory_post_line` (saldo+custo+linha na mesma transação); telas de stock/movimentos na API; saldo de abertura (D-C8) | I-4, G2 | Papel da app sem `UPDATE` direto em saldo/custo |
| I-6 | Vínculo venda→saída | Ao emitir fatura (ainda `BORRADOR`) ligar `invoice_lines.inventory_movement_line_id` | I-5 | Não toca SIFEN; faturas antigas ficam `SIN_COSTO` |
| I-7 | Relatório de estoque valorizado | Endpoint + tela + XLSX sobre `inventory_valuation_v`, filtros empresa/sucursal/depósito, subtotal por depósito e total geral, moeda base | I-5, G4 | `security_invoker` exige PG ≥ 15 (verificar em G0) |
| I-8 | Relatório de vendas ao custo | Endpoint + tela + XLSX sobre `sales_at_cost_v`; linhas `SIN_COSTO` separadas e contadas; margem só após D-C9 | I-6, G4 | idem |

## 3. Critérios de aceite por PR

- Testes automatizados no CI (SQL e API) e TST documentado com comandos reproduzíveis.
- Multiempresa: teste A/B em cada endpoint (nenhum dado cruzado), IDs recebidos validados contra a empresa.
- Relatórios: total geral = soma dos subtotais = soma de `inventory_costs`; reconciliação saldo×valor = 0 linhas; XLSX com os mesmos números da tela; exportação auditada (`access_audit`).
- Nada de `localStorage`/mock em relatório declarado real; se faltar dado: `NAO_DISPONIVEL` com a dependência.
- Nenhuma nota 10/10 sem verificação no banco real.

## 4. Sobre o prazo do cliente (2026-10-10, 08:00)

Com G0, G2 (D-C8 em especial), G4 e G5 pendentes, **não é possível prometer** os dois relatórios reais para essa hora. Alternativa honesta, se o responsável quiser: relatório **pontual** gerado por consulta de leitura sobre dados que já existam e sejam conferidos (sem prometer custo histórico das faturas antigas), com autorização expressa e sem declarar o sistema pronto. Isso é uma decisão do responsável e exige G0 pelo menos.
