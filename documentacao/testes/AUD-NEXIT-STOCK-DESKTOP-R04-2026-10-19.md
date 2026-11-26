# AUD-NEXIT-STOCK-DESKTOP-R04 — Reauditoria independente C24 / STK-D01 (somente Stock)

**Data:** 19/10/2026. **Auditor:** ChatGPT. **Sistema:** ERP NEXIT / DistribuNex, somente desktop.  
**Repositório:** `proceit-tech/distribuidora`; **branch:** `feature/NEXIT-2026-001-banco-demo`.  
**Commit funcional examinado / HEAD no início da auditoria:** `bfcf5ac68ba71f20758df4342752b14fc30723e2`. [Commit](https://github.com/proceit-tech/distribuidora/commit/bfcf5ac68ba71f20758df4342752b14fc30723e2).

## 1. Parecer executivo

**C24 / STK-D01: NÚCLEO DE AUTORIZAÇÃO CONFORME NO CÓDIGO, mas CORREÇÃO SOLICITADA por dois resíduos de UI/semântica (2 MÉDIAS).**

O `EXISTS` dos produtos inativos foi restringido a depósitos autorizados, os produtos ativos seguem visíveis como catálogo da própria empresa e a resposta carrega `COMPLETO | PARCIAL | SIN_DEPOSITOS`. O filtro principal de saldos, lotes/custos e autorizações não foi ampliado e Stock permanece somente leitura.

**R04-01 MÉDIA:** ao filtrar por depósito, os rótulos de indisponibilidade continuam baseados no alcance agregado do usuário, não no depósito selecionado, produzindo afirmação objetivamente falsa.  
**R04-02 MÉDIA:** usuário sem depósitos recebe o aviso e KPI de quantidade em «—», mas a tabela e o detalhe continuam apresentando zeros como medições reais (e custo zero em tela de listagem).

**Não homologado.** A C24 transversal continua ABERTA (Dashboard/PRO-137, Stock general/Reportes e Productos/KIT/PRO-161). STK-D03/PRO-179 permanece investigação separada sem alteração/transação autorizada.

## 2. Fontes e escopo

Consultados no GitHub `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, progresso pertinente, contrato `documentacao/v1/DEFINICAO-MENUS-INVENTARIO-V1.md`, ficha `documentacao/v1/auditoria-por-menu/AUD-STOCK-V1.md`, auditorias Stock R02/R03, e o **diff dos dez arquivos do commit**: `lib/stock/shared.ts`, `lib/stock/vista.ts`, `lib/stock/cliente-api.ts`, `types/stock.ts`, `app/api/stock/[id]/route.ts`, `app/(private)/stock/page.tsx`, `app/(private)/stock/[id]/page.tsx`, `lib/stock/alcance-c24.casos.ts`, runner dos casos e `PROGRESSO-NEXIT-V1.md`. Consultados também `app/api/stock/route.ts`, `stock/layout.tsx` e regressões pertinentes.

Sem alterações no diff aos módulos Dashboard, Reportes, Productos, motor Movimientos, SQL/migrations, ACL de sessão ou outros menus. A inspeção foi **estática**, não E2E nem PostgreSQL real.

## 3. Aceites conformes no recorte

| Critério | Evidência do commit | Parecer |
| --- | --- | --- |
| Produtos ativos da empresa permanecem visíveis mesmo sem saldo | `lib/stock/shared.ts:32–50`, `p.empresa_id=$1 AND p.controla_stock`, `p.activo OR EXISTS`, sem INNER JOIN dependente de saldos | CONFORME |
| Produto inativo somente se existir saldo positivo em depósito permitido | `shared.ts:19–29,46–50`: `s.cantidad > 0` no `EXISTS` mais `filtroAlcanceS`, com parâmetro de usuário no `paramsAlcance` | CONFORME ESTATICAMENTE |
| Saldos e custos continuam isolados | `shared.ts:52–67` restringe consulta de saldo/custo pelo `PERMITIDOS` com `empresa_id`, `usuario_deposito`/TODOS | CONFORME ESTATICAMENTE |
| Distinção de alcance entregue às telas | `vista.ts:68–96`; `shared.ts:98–103,184`; `app/api/stock/[id]/route.ts:33`; `types/stock.ts` | CONFORME |
| No cartão de lista, sem depósitos não há quantidade/nível fictício | `stock/page.tsx:418–466`, texto de aviso e três KPIs «—»; SKU sinalizado como catálogo | CONFORME APENAS NOS CARTÕES |
| Visão por depósito preservada | `stock/page.tsx:136–140` aplica `vistaPorDeposito` e `lib/stock/vista.ts` permanece sem mudança nessa função | SEM REGRESSÃO NO DIFF |
| Módulo somente leitura / GET | API Stock lista/detalhe, sem POST/PUT/DELETE no diff, guarda `STOCK.VER` preservada | CONFORME |

O SQL interpolado do `EXISTS` usa o mesmo alias `s` e os parâmetros de empresa/produto/usuário que as consultas de saldo, sem indício de índice incorreto no exame estático. Não provar por isso a execução do plano no PostgreSQL.

## 4. Achados corretivos

### C24-R04-01 — MÉDIA — Rótulo agregado incorreto na visão por depósito

**Evidência:** `app/(private)/stock/page.tsx:136–140` recalcula o item para depósito escolhido; `:460–463` renderiza `descripcionSinStock(alcance)` e `:667` `etiquetaNivel(item.nivel, alcance)`. Ambas dependem do **alcance do usuário**, não de `deposito`. `lib/stock/vista.ts:78–95` retorna «Sin disponible en depósitos autorizados» em PARCIAL.

**Contraprova conceitual reproduzível pela lógica:** usuário U autorizado nos depósitos A e B, mas não em C. Produto P: A tem 5 DISPONIBLE; B tem 3 RESERVADO e 0 DISPONIBLE. Ao selecionar B, `vistaPorDeposito` retorna P com `nivel=SIN_STOCK`; UI mostra «Sin disponible en depósitos autorizados», embora o autorizado A tenha 5 disponíveis. A afirmação é falsa porque a consulta exibida é **somente B**.

**Correção localizada:** quando `deposito !== "TODOS"`, o rótulo e a legenda do indicador devem se referir exclusivamente **ao depósito selecionado**, p.ex. «Sin disponible en este depósito». Em `TODOS`, manter semântica da C24 por alcance COMPLETO/PARCIAL/SIN_DEPOSITOS. Não alterar `clasificarNivel` nem política de visibilidade e não somar outros depósitos.

**Teste focal:** U parcial com A DISPONIBLE e B apenas RESERVADO; B selecionado => «este depósito», A selecionado => disponível; U completo com B selecionado também usa rótulo local; `TODOS` mantém distinção por alcance. Testar tanto linha quanto card, não apenas helper isolado.

### C24-R04-02 — MÉDIA — SIN_DEPOSITOS ainda apresenta zeros como saldo/custo real

**Evidência:** `stock/page.tsx:418–422` informa «no hay saldos, costos ni indicadores», mas `:638–653` apresenta `0 Unidad` e `R 0 / C 0 / T 0` para todos os produtos ativos do catálogo; `:673–680` pode mostrar «Valor costo: 0 [moeda-base]» e «Venta referencia: 0». No detalhe `stock/[id]/page.tsx:124–167,200–243`, o usuário sem depósitos vê cards `Disponible/Reservado/Cuarentena/Tránsito` e totais físico/virtual como `0`, embora não possua alcance para afirmar ausência física. O badge de nível é «Sin acceso a depósitos», mas os números não são mascarados.

**Impacto:** inconsistência entre aviso e números mostrados; operador pode interpretar zero como falta de produto, não como inexistência de autorização. O valor zero é montado pela agregação de fontes vazias, **não é prova de vazamento de saldos reais ou custo de outro depósito**.

**Correção localizada:** condicionar **somente a apresentação** de saldos, estados R/C/T, total físico/virtual e valores calculados de estoque, na listagem e no detalhe, para que `SIN_DEPOSITOS` mostre «—» ou indicação inequívoca de não autorizado. Manter SKU/metadados do catálogo ativo conforme política C24, e distinguir claramente preço de referência cadastral de valor de venda do **disponível**. Não alterar agregações SQL, `StockItem` para inventar `null` financeiro, permissões ou APIs; se for necessária mudança de contrato, documentar antes. Em COMPLETO/PARCIAL, zeros legítimos permanecem visíveis.

**Teste focal:** GET com usuário autorizado em zero depósitos e produto ativo; verificar bindings de lista e detalhe (não só os cartões agregados), ausência de números e valores de estoque que aparentem ser efetivos, sem suprimir catálogo; quando autorizado, zero verdadeiro continua zero.

## 5. Lacunas de teste e limitações

O novo `lib/stock/alcance-c24.casos.ts` tem **dez asserts** sobre `leerStock` real com `db.query` simulado, para os cenários enumerados na implementação. O mock interpreta o SQL via regex e aplica alcance/empresa em memória; isso é evidência relevante do formato da consulta, mas **não executa o planejador, parâmetros ou isolamento do PostgreSQL**. A asserção estrutural da UI checa aviso e KPI «—», **não** verifica todos os números da tabela/detalhe nem a legenda após seleção de depósito. A consulta `productoId` do detalhe também não possui teste específico com parâmetro `$2` + usuário `$3`; analisar como lacuna de regressão, não como falha comprovada de SQL.

**Claude reportou, não reexecutados pelo ChatGPT:** `alcance-c24` 10/0; Stock 19/0; residuais 67/0; carga-instancia 7/0; stock-reposición 275/0. Total direcionado reportado **378/0**. ESLint e tipos pontuais reportados sem falha. Sem navegador/React, HTTP, PostgreSQL, VM, SQL, CI/manual ou deploy pelo auditor.

**`cruzados` preexistente:** `lib/inventario/cruzados.casos.ts:144` contém asserção histórica que restringe a última migration ao padrão `/^NEX-05[3-9]/`, incompatível com migrations posteriores NEX-064/065. O arquivo não foi modificado neste commit; falha informada pelo Claude, não executada pelo auditor. Não ampliar C24 para corrigir este teste legado.

**Nota anterior preservada:** a tela de detalhe em `stock/[id]/page.tsx:50–74` retorna ao receber 404 sem zerar `item` após mudança de `params.id`; isso só vira defeito reproduzido se React reutilizar a mesma instância ao navegar entre IDs. Já era observação condicional em Stock R02, não recontar como novo bug sem evidência.

## 6. Continuidade e governança

- **C24 Stock / STK-D01:** núcleo de filtro/tenant e contrato de alcance **CONFORMES ESTATICAMENTE**, mas **CORREÇÃO SOLICITADA** para C24-R04-01 e C24-R04-02. Não declarar encerrada a etapa Stock.
- **C24 transversal:** PRO-137 e PRO-161 continuam sem aceite global; Dashboard/Stock general/Productos não foram implementados aqui.
- **PRO-178 / STK-D02:** aceite técnico AUD-R03 preservado; não reabrir sem regressão nova.
- **PRO-179 / STK-D03:** investigação de snapshot isolada, não implementar transação agora.
- **PRO-78:** In Review; não homologado/não Done. Claude somente implementa os dois ajustes pontuais mediante autorização do responsável, testes focados, commit/push e parada para nova reauditoria independente **AUD-R05**. Não iniciar o menu Movimientos por conta própria.
