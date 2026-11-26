# AUD-NEXIT-STOCK-DESKTOP-R05 — Reauditoria independente PRO-180/181 (C24-R04-01/02)

**Data:** 19/10/2026. **Auditor:** ChatGPT. **Sistema:** NEXIT/DistribuNex V1, somente desktop.  
**Repositório:** `proceit-tech/distribuidora`; **branch oficial:** `feature/NEXIT-2026-001-banco-demo`.  
**Commit funcional auditado:** `852c068c86a120631535d1f489fe525dad81a5c3` ([GitHub](https://github.com/proceit-tech/distribuidora/commit/852c068c86a120631535d1f489fe525dad81a5c3)); confirmado como HEAD da branch no início da revisão.  
**Auditoria anterior:** [AUD-R04 Stock](./AUD-NEXIT-STOCK-DESKTOP-R04-2026-10-19.md).  
**Tarefas:** PRO-180 e PRO-181, vinculadas a PRO-78.

## 1. Parecer

**PRO-180 / C24-R04-01: CONFORME ESTATICAMENTE.**  
**PRO-181 / C24-R04-02: CONFORME ESTATICAMENTE.**

Os dois resíduos de apresentação identificados na AUD-R04 foram tratados e **nenhum novo bloqueio corretivo foi identificado no diff autorizado**. A **etapa corretiva estática do menu Inventario → Stock (08/22) está concluída** no âmbito dos achados STK-D01/C24 do próprio Stock, STK-D02/PRO-178 e C24-R04-01/02. Isso não significa homologação operacional, encerramento da C24 transversal ou resolução de STK-D03.

**Estado:** Stock/PRO-78 permanece In Review, **NÃO HOMOLOGADO**, nenhuma tarefa marcada Done.

## 2. Fontes, perímetro e diff

Consultados os atuais `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, as partes pertinentes de `PROGRESSO-NEXIT-V1.md`, a definição de Inventario, o relatório AUD-R04 e o commit/diff. Conferidos arquivos completos/trechos relevantes da tela e do detalhe, `lib/stock/vista.ts`, `lib/stock/alcance-c24.casos.ts`, integrações de testes e regressões da moeda.

**Sete arquivos alterados no commit funcional:** `lib/stock/vista.ts`, `app/(private)/stock/page.tsx`, `app/(private)/stock/[id]/page.tsx`, `lib/stock/alcance-c24.casos.ts`, `lib/stock/carga-instancia.casos.ts`, `lib/inventario/stock.casos.ts`, `PROGRESSO-NEXIT-V1.md`.

**Sem alterações no diff** a `lib/stock/shared.ts`, `app/api/stock/route.ts`, `app/api/stock/[id]/route.ts`, ACL, `types/stock.ts`, SQL/migrations, estoque de outros módulos e código de PRO-179/STK-D03. O comportamento de produtos inativos por `EXISTS` filtrado foi preservado; `PRO-178` mantém moeda-base por instância na listagem.

## 3. Matriz de aceites e evidências

| Requisito | Evidência revisada | Parecer |
| --- | --- | --- |
| PRO-180: etiqueta da linha referida só ao depósito selecionado | `stock/page.tsx:664–672` usa `etiquetaNivelVista(item.nivel, alcance, deposito !== "TODOS")`; `vista.ts:97–108` retorna «Sin disponible en este depósito» quando `SIN_STOCK` com depósito selecionado | **CONFORME** |
| PRO-180: opção do filtro «Sin stock» segue o depósito | `stock/page.tsx:479–491` usa `etiquetaNivelVista("SIN_STOCK", alcance, deposito !== "TODOS")` | **CONFORME** |
| PRO-180: legenda do KPI segue o depósito | `stock/page.tsx:460–464` usa `descripcionSinStockVista(alcance, deposito !== "TODOS")` | **CONFORME** |
| PRO-180: `TODOS` preserva completo/parcial/sem depósitos | `vista.ts:97–109` delega em `etiquetaNivel`/`descripcionSinStock` quando não há depósito escolhido; `stock/page.tsx:136–140` mantém visão consolidada | **CONFORME** |
| PRO-181: lista sem depósitos não apresenta quantidade e R/C/T falsamente zerados | `stock/page.tsx:638–653` aplica `textoCantidad` com `alcance` e suprime unidade junto a «—» | **CONFORME** |
| PRO-181: lista sem depósitos não apresenta custo/valor indevido | `stock/page.tsx:673–680` usa `!sinAccesoADepositos(alcance)` para custo e valor; preço referencial cadastral permanece independente | **CONFORME** |
| PRO-181: detalhe sem depósitos mostra aviso e mascara saldos | `stock/[id]/page.tsx:141–149,153–180,212–247`: aviso; `textoCantidad` em disponível/reservado/quarentena/trânsito/físico/virtual/terceiros; sem custo médio nem valores derivados | **CONFORME** |
| PRO-181: preço cadastral permanece disponível e valor de venda do saldo é mascarado | `stock/[id]/page.tsx:224–235`, `textoImporteDeStock` apenas para valor derivado; referência com `monedaPrecio` | **CONFORME** |
| PRO-181: zero com depósitos autorizados permanece 0 | `vista.ts:112–125`: helpers devolvem o formatado quando alcance não é `SIN_DEPOSITOS`, inclusive zero | **CONFORME** |
| Preservação de regras STK-D01/STK-D02 | Diff sem mudança de consulta/autorização, `iniciarCargaStock` e moeda local preservados, testes de regressão adaptados apenas à expressão nova | **SEM REGRESSÃO ESTÁTICA NO DIFF** |

## 4. Testes e limitações verificadas

**Testes informados pelo Claude, não executados pelo ChatGPT:** `alcance-c24` 17 verificações/0 falhas (7 acrescentadas nesta rodada), `inventario/stock` 19/0, `residuales` 67/0, `carga-instancia` 7/0, `stock-reposicion` 275/0 — **385 verificações reportadas, 0 falhas**. Lint/tipos pontuais informados como aprovados, sem execução independente.

Os novos casos usam `leerStock` efetivo com `db.query` simulado e `vistaPorDeposito`/helpers reais em cenário A com 5 disponíveis e B com 3 reservadas. Regressam diferença de alcance completo/parcial, `TODOS`, rótulos, quantidades sem depósitos, zero verdadeiro e preservação da moeda/visibilidade de inativos. As ligações de React/UI são inspecionadas por padrões estruturais; **não houve renderização do componente React**. O mock SQL aplica heurísticas/regex, não comprova execução do PostgreSQL real.

**Auditor executou 0 testes**. Sem HTTP integrado, navegador, ambiente operacional/VM, Docker, banco, SQL, build global, CI manual ou deploy. O teste legado `lib/inventario/cruzados.casos.ts:144` que espera migration máxima da faixa NEX-053…059 é pendência preexistente e não foi alterado pelo commit auditado.

**Observações históricas preservadas** sem transformar em novos bloqueios não reproduzidos: STK-O01…O06 da AUD-R02; eventuais requisitos transversais de visibilidade Dashboard/Stock general/Productos; riscos condicionais de snapshot em STK-D03.

## 5. Estado pós-AUD-R05

- **PRO-180 e PRO-181:** aceitos na auditoria estática, **In Review**, sem homologação/Done.
- **PRO-178 / STK-D02:** conforme estaticamente na AUD-R03, não reaberto.
- **C24/STK-D01, apenas Stock:** núcleo aprovado em AUD-R04, resíduos PRO-180/181 agora conformes. **Etapa corretiva estática do menu concluída**, sem aceite operacional.
- **PRO-78 / Stock:** In Review, **NÃO HOMOLOGADO**.
- **PRO-137 / C24 transversal:** permanece ABERTA para Dashboard, Reportes/Stock general e Productos/KIT/PRO-161; nenhuma implementação desses módulos nesta rodada.
- **PRO-179 / STK-D03:** Todo, investigação de snapshot/concorrência ainda condicional, **não iniciada nem autorizada para alteração transacional**.
- **Próximo menu na ordem oficial: Inventario → Movimientos (09/22)**, somente se expressamente solicitado pelo responsável. Não iniciar tarefa nova no Claude automaticamente.
