# NEXIT V1 — Auditoria integrada de Reportes
## Reportes operativos · Stock general · Valorización de inventario · Kardex de movimientos · Stock crítico y reposición · Lotes y vencimientos

**Data do registro:** 13/10/2026 (data operacional adotada na documentação do projeto). **Responsável:** ChatGPT — auditoria **estática** dirigida do GitHub. **Branch:** `feature/NEXIT-2026-001-banco-demo`. **SHA-base do código inspecionado:** `aee2af3926603fb9c9db4bba1ed72bc874b5c2a2` (verificar novo HEAD antes de implementar). **Estado:** CORREÇÕES/DECISÕES PENDENTES; **NÃO HOMOLOGADO**.

**Pedido do responsável:** auditar todos os menus Reportes enquanto Claude implementa Inventario; eliminar processos repetidos; **Valorización de inventario é a prioridade funcional máxima**. **Esta é proposta e auditoria, não autorização para Claude alterar Reportes durante a tarefa ativa de Inventario.** Não mexer no código, migrations ou VM nesta rodada. A decisão anterior do responsável torna **cinco relatórios obrigatórios na V1** (`documentacao/v1/REPORTES-V1-ALCANCE-APROBADO.md`); simplificar a apresentação sem remover relatórios obrigatórios por presunção.

**Fontes de evidência:** `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, progresso pertinente de `PROGRESSO-NEXIT-V1.md`, escopo aprovado de Reportes, `documentacao/v1/DEFINICAO-MENUS-INVENTARIO-V1.md`, menu/índice, cinco páginas, cinco APIs + exportações, `lib/reportes/{stock-general,valorizacion,kardex,stock-critico,lotes,export,formato,guard,...}.ts`, `types/reportes.ts`; fonte operacional de custos/movimentos descrita em NEX-009/014/017 e docs de inventário. **Zero testes de suíte, zero HTTP autenticado, zero PostgreSQL, zero VM/Docker, zero navegador/prints nesta revisão.** Histórico de testes PG16 descartável no `PROGRESSO` é relato de rodadas antigas e NÃO equivale a prova atual na VM.

## 1. Veredito da divisão funcional e recomendações de navegação

| Entrada atual | Decisão de arquitetura | Função exclusiva; não duplicar |
|---|---|---|
| **Reportes operativos** `/reportes` | **Manter a rota como índice**, preferencialmente retirar seu atalho da lista lateral se o usuário aprovar UX; não é um sexto relatório | Central de acesso aos cinco relatórios, com **Valorización** em destaque |
| **Valorización de inventario** `/reportes/valorizacion` | **PRINCIPAL — máxima prioridade**, tela financeira de confiança | Quanto vale **hoje** o inventário próprio, por produto/depósito/categoria; coberturas de custo e conciliação; valor exato em moeda-base; exportação auditável |
| **Stock general** `/reportes/stock-general` | Manter relatório **quantitativo/documental** exportável | Quanto existe por produto, depósito, lote/estado/propriedade; sem preço de venda, sem segunda valorização. `Stock` (Inventario) faz **consulta operacional**, aqui fica grade analítica/exportação |
| **Kardex de movimientos** `/reportes/kardex` | Manter relatório **histórico/de auditoria** | Evolução em período, saldos inicial/final, contramovimentos, documento/usuário e exportação; `Movimientos` (Inventario) é operação/detalhe, não repete saldos históricos agregados |
| **Stock crítico y reposición** `/reportes/stock-critico` | Manter como **relatório de exceções exportável**, NÃO um segundo planejador | Foto dos produtos críticos, parâmetros, sugestão **calculada pelo mesmo critério** de `/reposicion`; sem opções independentes de decisão/simulação, compra ou transferência |
| **Lotes y vencimientos** `/reportes/lotes` | Manter relatório de **risco/vencimento**, complementar ao detalhe de Stock | Lista filtrável e exportável de lotes vencidos/próximos/vigentes/sem data e respectivos saldos; não reproduzir a grade completa de Stock general |

**Navegação sugerida no sidebar, sujeita ao aceite visual do responsável:** 1. **Valorización de inventario**, 2. Stock general, 3. Kardex de movimientos, 4. Stock crítico (y reposición, como relatório), 5. Lotes y vencimientos. **Reportes operativos** segue disponível por `/reportes`, cards/índice e breadcrumbs, mas não necessita botão lateral redundante. Nenhuma remoção de rota/APIs/permissões, só eventual simplificação dos links. Prioridade visual NÃO implica autorização para mostrar valor a usuários que não tenham permissão `REPORTES.VER`.

## 2. Definição prioritária de Valorización de inventario (V1)

**Fonte monetária única:** `inventario_costos` — `cantidad_valorizada`, `valor_total`, custo médio real `valor_total / cantidad_valorizada` quando denominador positivo. `stock_saldos` é reconciliação **quantitativa**, não substitui `cantidad_valorizada` como base de custo. Somente `PROPIO`, em moeda-base da empresa; sem inventar preços de venda, lucros, margens, câmbio automático ou valorização histórica sem snapshot.

**Visões úteis:**
1. **Resumen financiero principal:** `Valor de inventario (moneda base)`, número de produtos com custo, cobertura de valorização/pendências quantitativas e indicador de divergências. Não apresentar **custo médio geral** de produtos de diferentes unidades.
2. **Por producto** (custo médio do **mesmo produto/unidade-base** e valor total; filtros por depósito/categoria/família). Priorizar busca de produtos com maior valor para revisão.
3. **Detalle por producto y depósito** (valor, custo médio real, quantidade física própria, quantidade valorizada, diferença e estado de cobertura); único nível com validação de quantidade por mesma unidade/produto.
4. **Por depósito** e **Por categoría**: agregados financeiros somáveis **somente de valor monetário da mesma moeda**. Exibir número de produtos, valor total e contagem de divergências; **não somar quantidades heterogêneas nem apresentar custo médio unitário global**.
5. **Excel/PDF:** mesmos filtros e mesmos subtotais/valores, impressão de empresa, moeda, horário de extração e escopo do usuário. A exportação é comprovação de **foto corrente**, não fechamento contábil homologado nem snapshot histórico.

**Pendências críticas a evidenciar sem fabricar dados:** produtos com saldo físico sem registro de custo, parcialmente valorizados, quantidade valorizada MAIOR que físico, saldo valorizado zero com valor residual e agregados cuja soma disfarça divergências. Identificar o problema e origem de dados; **não fazer ajuste automático de custos/saldos pelo relatório** (motor de inventário é quem escreve). Um dashboard aparentemente positivo não pode esconder stock sem custo.

**Política de datas:** V1 é `a la fecha de consulta`; não oferecer seletor de valorização histórica, lucro bruto, preço de venda referencial misturado ao custo ou balanço de período sem estrutura de snapshot e custo histórico.

## 3. Achados confirmados no código — priorização

| ID | Prioridade | Prova estática | Critério de aceite |
|---|---|---|---|
| **RPT-V01** | **ALTA — custo médio economicamente inválido em agregações heterogêneas** | `lib/reportes/valorizacion.ts:54-55` define `COSTO = sum(valor)/sum(cantv)`; `:111-131` agrupa por produto, depósito e categoria; `:135-151,157-168` calcula/exibe custo unitário agregado. `app/(private)/reportes/valorizacion/page.tsx:202-206,219-238` mostra «Cantidad valorizada» e «Costo promedio unit.» **inclusive por categoria, depósito e TOTAL GENERAL**. Produtos distintos podem ter unidades de medida diferentes; média do custo por «unidade» de itens incompatíveis não é informação válida. | **Manter valor total monetário**; custo médio apenas para produto de mesma unidade-base (e detalhe produto×depósito). Em total geral/categoria/depósito deixar custo unitário/quantidade somada como não aplicável ou apresentar somente valores que tenham unidade semanticamente homogênea. Atualizar Excel/PDF e testes com kg + unidad + litro. Não alterar cálculo de custo real do produto. |
| **RPT-V02** | **ALTA — potencial leitura inconsistente durante movimentos concorrentes** | `lib/reportes/valorizacion.ts:135-163,171-175` faz `Promise.all` de totais/contagem e depois outra consulta de linhas e catálogos pelo `db.query` de Pool, **sem uma transação/snapshot único**. `app/api/reportes/valorizacion/route.ts` e `.../exportar/route.ts` chamam o mesmo serviço. Se inventário mudar entre SELECTs, totais e linhas podem refletir instantes diferentes. Não há prova de que já tenha ocorrido no banco real. | Garantir **snapshot consistente por requisição** nas consultas de total/linhas/exportação (READ ONLY REPEATABLE READ em uma conexão, ou uma estratégia SQL equivalente). Conferir operações concorrentes, páginas e exportação geradas no mesmo instante lógico dentro de cada resposta. Não afirmar que consultas em momentos diferentes do usuário são uma mesma foto; registrar horário preciso. |
| **RPT-V03** | **MÉDIA/ALTA — cobertura parcial de custo pode ficar mascarada** | `valorizacion.ts:54,111-131,157-160` aplica `SITUACION` aos totais somados: produtos com divergências opostas podem se compensar na visão Categoria/Depósito e aparecer «Con costo»; `:139-142` conta `sin_costo` **somente quando `cantv=0`**, mas `fisicoNoValorizado` também inclui linhas parciais. | Classificar cobertura por produto×depósito **antes** da agregação; somar separadamente `sin costo`, `parcial`, `cantidad faltante`, `cantidad excedente`, sem cancelar divergências, inclusive no total geral e exportações. Nenhum ajuste automático. Testes de compensação (+5/-5) e saldo residual. |
| **RPT-V04** | **MÉDIA — falha de carga conserva totais potencialmente obsoletos** | `app/(private)/reportes/valorizacion/page.tsx:34-42` inicia busca, mas no `catch` apenas `setError` e **mantém `datos` da consulta anterior**. O mesmo padrão está nas páginas de Stock general e Stock crítico. Filtros novos podem aparecer com dados anteriores e um aviso de falha. | Em erro, não apresentar valores antigos como se refletissem filtros atuais. Limpar a resposta ou identificar inequivocamente «Última consulta válida», com filtros/horário originais; bloquear exportar se a consulta atual não é confiável. Não descartar filtros/rascunho. |
| **RPT-V05** | **MÉDIA — quantidade `numeric` rebaixada a `float8`** | `valorizacion.ts:139-141,157-160` converte físico e quantidade valorizada do PostgreSQL para `float8`. Totais monetários são preservados em `numeric::text`, o que é correto. Quantidade física de alta precisão pode sofrer arredondamento, embora não haja perda monetária comprovada. | Definir precisão de quantidade do contrato, manter valor monetário em `numeric`, testar quantidade fracionária próxima do limite. Evitar alteração de schema sem caso real. |
| **RPT-C01** | **ALTA — reporte Stock crítico usa política diferente de Reposición atual** | `lib/reportes/stock-critico.ts:12-30,38-44,100-145` afirma expressamente **política global por produto**, compara os parâmetros `productos.stock_minimo/punto_reposicion/stock_maximo` contra disponibilidade consolidada, mesmo na vista por depósito. Já `lib/reposicion/datos.ts` e `lib/reposicion/calculo.ts` consomem `producto_deposito_configuracion` e planejam transferências prioritárias por destino. `app/(private)/reportes/stock-critico/page.tsx:133-140` deixa explícita a política antiga. **Duas recomendações podem divergir para o mesmo caso.** | Um único motor/regra de necessidade **depois da estabilização de Inventario**. O relatório fornece fotografia/exportação da mesma política por depósito; consolidado é referência não aditiva; valores/quantidades sugeridos por origem não se repetem. Não reescrever simultaneamente `lib/reposicion/calculo.ts` enquanto Claude desenvolve Inventario. |
| **RPT-C02** | **MÉDIA — duplicação de função de planejamento** | `/reportes/stock-critico` tem controle `objetivo=MINIMO/MAXIMO`, indicadores `cantidad sugerida` e `valor sugerido`, filtros e detalhes; `/reposicion` já oferece cálculo próprio e simulação. | Deixar o relatório como **exportação de exceções com filtros**, sem simulação operacional independente; manter a disponibilidade dos dados aprovados V1, mas a lógica de sugestão deve ser compartilhada e o «valor sugerido» rotulado **custo estimado de abastecimento**, não valor atual do estoque. |
| **RPT-N01** | **BAIXA — duplicação de acesso, não de processo** | `lib/navigation/menu.ts:253-298` inclui seis links (o índice e cinco relatórios); `app/(private)/reportes/page.tsx:5-11,19-47` apenas repete como cards os cinco relatórios. | Após aprovação visual, retirar **somente** o índice do sidebar (manter rota) e posicionar Valorización primeiro; não eliminar nenhum dos cinco relatórios obrigatórios. |
| **RPT-N02** | **MÉDIA — botões de exportação sem distinção visual de permissão** | `app/(private)/reportes/valorizacion/page.tsx:90-95` mostra botões para quem lê a página; `lib/reportes/guard.ts` exige corretamente `REPORTES.EXPORTAR` na API. Usuário só VER recebe erro 403 ao clicar. | Se o contexto expuser `REPORTES.EXPORTAR`, ocultar/desabilitar download com explicação adequada; manter autorização **obrigatória no servidor**. Não ampliar direitos. |

### Defesas corretas a preservar

- `inventario_costos` é **única fonte de valorização financeira**, independente da lista de preços/valor de venda. Não misturar `valorSugerido` de reposição no saldo financeiro.
- `lib/reportes/formato.ts:17-31` formata **strings decimais** sem transformar dinheiro em `Number`. `lib/reportes/export.ts` tenta preservar valores exatos em XLSX, usando texto quando ultrapassa a capacidade segura adotada.
- `lib/reportes/guard.ts` exige VER, e downloads exigem também EXPORTAR; `empresa_id` vem da sessão, `depositosPermitidos` filtra alcance por usuário. **Não identificar exposição cross-empresa sem evidência.** `depositosPermitidos` filtra `d.activo`: revisar se há custo/saldo histórico remanescente em depósito inativo antes de afirmar conciliação plena.
- Kardex apresenta saldo histórico com `fecha de registro`, não custo histórico no momento desejado; lotes apresentam vencimento real (só quando produto controla lote), não data inventada; exportações suportam máximo de 50.000 linhas e 413 quando excedido.
- Não remover rotas ou alterar decisões do escopo V1 aprovado sem autorização humana específica. Nova apresentação não pode suprimir problemas monetários reais.

## 4. Matriz anti-duplicidade com Inventario

| Dado ou ação | Dono único da operação | Reporte correspondente |
|---|---|---|
| Saldo corrente e detalhe operacional | `Inventario > Stock` consulta; `Movimientos` grava | `Stock general` exporta, agrega e cruza dimensão produto/depósito/lote/estado |
| Entrada, saída, reserva, transferência e anulação | `Inventario > Movimientos` | `Kardex` rastreia período e acumula saldo; **nunca executa** |
| Produto, unidade-base, metas por depósito | `Productos > Inventario` | Stock crítico **lê** metas e exporta alertas; não edita |
| Plano/sugestão/encaminhamento de abastecimento | `Inventario > Reposición` | `Stock crítico` somente registra/filtra/exporta a mesma sugestão, sem motor próprio |
| Valor atual de custo por produto/depósito | `inventario_costos` gravado pelo motor SQL de Inventario | **`Valorización de inventario` é a autoridade de leitura e exportação financeira**; Stock só mostra indicativo contextual, não segundo valor oficial |
| Lote/vencimento e disponibilidade | Movimientos/Stock | `Lotes y vencimientos` consolida riscos com horizonte e PDF/XLSX |
| Índice de navegação | sidebar e `/reportes` | Não possui cálculos, sem processo novo |

## 5. Gates de testes propostos — foco Valorización

**VAL-T01**: mesmo produto com depósito A, B: `valor_total`, `cantidad_valorizada` e custo médio devem bater com `inventario_costos` e somar corretamente por produto, categoria, depósito e total **financeiro**. `stock_saldos` apenas conciliação física. Exibir a moeda-base.

**VAL-T02**: produtos A (UNIDAD), B (KG), C (LITRO) no mesmo depósito/categoria; soma monetária é válida, mas **não** mostrar custo médio misturado nem quantidade geral sem unidade.

**VAL-T03**: custo ausente, parcialmente valorizado, custo valorizado maior que físico, produto sem movimento, zero com valor residual, depósito com histórico inativo; exposição explícita das divergências, nenhum preço inventado.

**VAL-T04**: operador de alcance limitado a depósito B, multiempresa A/B, perfis com e sem REPORTES.VER e EXPORTAR; filtro por depósito fora do alcance 403; totais não anunciam «empresa inteira» com alcance parcial.

**VAL-T05**: entrada/transferência/anulação concorrente durante consulta de valorização: total/linhas/snapshots não divergentes na **mesma requisição**. Comparar tela e download filtrados obtidos sob base imutável; em operação concorrente os horários de duas requisições podem legitimamente divergir.

**VAL-T06**: valor numérico grande e custo fracionário preservados no banco, API, renderização, PDF e XLSX; unidade/custo e contagem de linhas. Checar 50.000 linhas e 413.

**RPT-T07**: Stock crítico usa a **mesma sugestão** que Reposición por produto/depósito, sem duplicar compra/transferência; casos de vários destinos/uma origem e política global + por depósito.

**RPT-T08**: Kardex saldo inicial/final e contramovimentos conciliam com Stock; Lotes por vencimento, estado e terceiro bate com saldos; navegação e exportações não alteram dados.

**RPT-T09**: respostas HTTP 401/403/400/500, formato inválido, filtros sucessivos, estado antigo após erro, responsividade 1440/768/375; screenshot real apenas com acesso e autorização humana, não inventar.

## 6. Encaminhamento e estado

- **Agora:** auditoria/documentação somente. **Não instruir Claude a implementar Reportes em paralelo** com a ordem de Inventario já autorizada (`documentacao/v1/ORDEM-IMPLEMENTACAO-INVENTARIO-INTEGRADA-V1-2026-10-13.md`). Evitar conflitos na branch/clonagem.
- **Depois:** obter aceite do responsável para prioridade de Valorización, ocultação do índice no sidebar (mantendo a rota) e papel estritamente documental de Stock crítico. Em seguida autorizar Claude a corrigir **primeiro Valorización** (RPT-V01…V04 prioritários), **depois** alinhar Stock crítico à Reposición estabilizada; demais reportes só ajustes que eliminam duplicação real ou falha confirmada.
- **Não homologado:** nenhuma evidência desta rodada em navegador, PG/VM, PDFs/XLSX gerados ao vivo. Não declarar custo e valor contábil 10/10 com defeitos de semântica/snapshot abertos.
