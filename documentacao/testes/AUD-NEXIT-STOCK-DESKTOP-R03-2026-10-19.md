# AUD-NEXIT-STOCK-DESKTOP-R03 — Reauditoria independente PRO-178 / STK-D02

**Data:** 19/10/2026. **Sistema:** NEXIT / DistribuNex V1, somente desktop. **Auditor:** ChatGPT.  
**Repositório:** `proceit-tech/distribuidora`. **Branch:** `feature/NEXIT-2026-001-banco-demo`.  
**Commit funcional auditado:** `8ceed1c3876ff489611034ab95dca417c9473d36` ([GitHub](https://github.com/proceit-tech/distribuidora/commit/8ceed1c3876ff489611034ab95dca417c9473d36)). **Referência anterior:** [AUD-R02 Stock](./AUD-NEXIT-STOCK-DESKTOP-R02-2026-10-19.md).

## 1. Parecer

**PRO-178 / STK-D02 MÉDIA: CONFORME NA AUDITORIA ESTÁTICA DIRIGIDA.** A variável mutável de módulo `MONEDA_BASE` foi removida. A moeda-base agora pertence ao estado da instância `StockPage`, inicialmente `null`, e é aplicada a partir da mesma resposta que fornece as linhas de Stock. O novo helper rejeita eventos de resposta/erro/finalização após limpeza da instância. **Nenhum bloqueio técnico novo foi demonstrado no recorte autorizado.**

**Não significa homologação operacional:** não houve React montado, navegador, HTTP real, PostgreSQL, VM, Docker, SQL, CI ou deploy pelo auditor. A tarefa permanece **In Review**, não Done; o menu **Stock NÃO HOMOLOGADO**.

## 2. Fontes e diff conferidos

- Governo: `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, trecho pertinente de `PROGRESSO-NEXIT-V1.md`, ficha `documentacao/v1/auditoria-por-menu/AUD-STOCK-V1.md`, auditorias R01/R02 e critérios da tarefa Linear PRO-178.
- Diff do commit: **7 arquivos**. Funcionais: `app/(private)/stock/page.tsx`, `lib/stock/carga-instancia.ts` (novo), `lib/stock/carga-instancia.casos.ts` (novo); ajuste de execução em `scripts/casos-clientes/run.js`; ajustes pontuais de asserts em `lib/inventario/stock.casos.ts` e `lib/inventario/residuales.casos.ts`; atualização de `PROGRESSO-NEXIT-V1.md`.
- Sem alterações no diff a `lib/stock/shared.ts`, endpoints de Stock, SQL/migrations, `/stock/[id]`, lógica de permissão, motor Movimientos, relatórios ou reposição. Os dois asserts legados trocam apenas a referência estrutural da carga/moeda.
- Código verificado no SHA funcional; o HEAD da branch foi confirmado nesse SHA no início desta reauditoria. Não foi realizada auditoria integral dos módulos externos não alterados.

## 3. Matriz de critérios de aceite

| Critério PRO-178 | Evidência no código do commit | Parecer |
| --- | --- | --- |
| Moeda sem variável global compartilhada | `stock/page.tsx:104–105` usa `useState<string \| null>(null)`; removido `MONEDA_BASE` em escopo do módulo | **CONFORME** |
| Moeda e linhas da resposta da mesma instância | `stock/page.tsx:116–134`: `iniciarCargaStock(cargarStock, …)`, `alCompletar` recebe resposta e moeda; atualiza `setMonedaBase(moneda)` e `setStock(r.stock)` na mesma chamada | **CONFORME NO CÓDIGO** |
| Resposta/erro depois de desmontar | `carga-instancia.ts:20–36`: booleano `activo` é invalidado no cleanup e verificado antes de cada callback `alCompletar`, `alFallar`, `alFinalizar` | **CONFORME** |
| Sem moeda PYG fictícia | `carga-instancia.ts:8–10` aceita apenas string não vazia após `trim` e retorna `null` no restante; `stock/page.tsx:670–674` mostra «—» para custo/valor sem moeda; não há fallback PYG | **CONFORME** |
| Moeda própria da venda referencial | `stock/page.tsx:673–674`: `item.monedaPrecio || monedaBase`, com «—» apenas quando nem preço/moeda estão disponíveis | **CONFORME** |
| Sem alteração da lógica de estoque, alcance e detalhe | Diff restrito a listagem/helper/casos/runner/progresso; imports, links, permissões e SQL de Stock preexistentes preservados | **SEM REGRESSÃO DIRETA NO DIFF** |

**Nota técnica:** React 18 pode agrupar as atualizações de estado realizadas no mesmo callback, mas o comportamento do componente efetivamente montado não foi exercitado. O caso do helper cobre a invalidação por instância e o acoplamento nominal da UI foi inspecionado; não equivale a ensaio end-to-end.

## 4. Testes e limites

**Reportados pelo Claude, não reexecutados pelo ChatGPT:** `carga-instancia` **7 verificações/0 falhas**; inventário Stock **19/0**; residuais **67/0**; Stock–Reposición **275/0**. Total reportado: **368/0**. ESLint e tipos pontuais informados como conformes; sem comprovação independente da execução.

Os sete casos novos exercitam as funções reais `iniciarCargaStock` e `monedaDeRespuesta` com promessas controladas: A desmontada e B válida, chegada fora de ordem de moedas distintas, erros e moeda ausente/inválida, resultado legítimo de custo/valor, moeda própria da referência de venda. Complementam com asserção estrutural de `page.tsx`. O teste simula callbacks do componente, não renderiza React; a formatação é exercitada por chamadas às funções reais e por lógica equivalente à expressão da tela.

**Auditor executou zero testes.** Sem reprodução operacional, sem ensaio multiusuário no backend, sem verificação de CI, sem aprovação de todas as páginas. As reservas de escopo estão explicitadas; não converter esse aceite técnico em homologação.

## 5. Pendências anteriores preservadas sem nova implementação

- **STK-D01 ALTA / gate C24 / PRO-137:** universo de produtos empresariais vs saldos autorizados e semântica «Sin stock». **Depende de decisão funcional**, não criar filtro arbitrário ou ticket duplicado.
- **STK-D03 MÉDIA / PRO-179:** leitura de múltiplas consultas do Pool sem snapshot; **risco de concorrência condicional**, ainda não demonstrado no PostgreSQL. Investigar conforme autorização própria antes de alterar isolamento transacional.
- **STK-O01…O06** continuam observações/políticas históricas, não bugs novos. Preservados INV-01…04, INV-R02-01/02, estoque só consulta, atributos PROPIO/TERCERO, permissão STOCK.VER, atalhos sob MOVIMIENTOS.VER+CREAR, isolamento de empresa/depósito, decimal textual e contratos NEX-009/014/046/052.

## 6. Estado e continuidade

- **PRO-178 / STK-D02:** **CONFORME ESTATICAMENTE**, **In Review**, não Done/não homologado; **sem nova rodada corretiva necessária por esse achado no recorte auditado**.
- **PRO-78 / Stock:** **In Review**, menu **NÃO HOMOLOGADO**; há gate funcional C24 e investigação condicional D03 separados.
- Nenhuma alteração de código/SQL/migrations pelo auditor. O próximo menu da sequência é **Inventario → Movimientos (09/22)** somente quando autorizado; não iniciar trabalho no Claude automaticamente.
