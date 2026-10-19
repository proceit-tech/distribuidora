# Auditoria por menu — Stock

**Rota principal:** `/stock`  
**Branch:** `feature/NEXIT-2026-001-banco-demo`  
**Estado:** ABERTA — NÃO AUDITADA INTEGRALMENTE — NÃO HOMOLOGADA  
**Responsável pela auditoria estática:** ChatGPT. **Implementação:** Claude Code somente mediante tarefa autorizada. **Homologação operacional/visual:** responsável na VM.

## Escopo e rastreabilidade

Este arquivo é a fonte única da auditoria do menu **Stock**. Registrar, com caminho e linha, cada página/subtela, componente, API, serviço, permissão de menu/servidor, tabela, trigger, migration, testes e dependências com outros módulos. Não confundir inventário com execução ou homologação. Ver `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` e `documentacao/v1/AUDITORIA-GERAL-NEXIT-V1-2026-10-12.md`.

## Itens obrigatórios da auditoria completa

- [ ] Todas as rotas e subtelas: navegação, abas, ações, modais, estados de erro e vazio.
- [ ] Campos: origem, exigência, máscara, validação client/server, persistência e retorno.
- [ ] APIs: métodos, status HTTP, consultas, filtros, paginação, transação, concorrência e tratamento de exceções.
- [ ] Autenticação, permissões de ação, isolamento multiempresa e alcance de sucursal.
- [ ] SQL: relações, constraints, índices, FK, trigger, integridade e scripts vinculados.
- [ ] Integrações e dependências entre menus; compatibilidade de dados.
- [ ] Casos de teste: positivos, negativos, limites e regressões; evidências de execução.
- [ ] UX: responsividade 1440/768/375, foco, acessibilidade, textos, confirmação de ações, screenshots reais.
- [ ] Conclusão com todos os achados numerados, severidade, evidência e critério de aceite.

## Achados confirmados até agora (parciais)

Nenhum defeito deste menu documentado ainda nesta ficha. Isso NÃO significa ausência de defeitos.

## Pendências

Auditoria exaustiva deste menu ainda não executada. Não atribuir percentual de cobertura sem inventário de arquivos e linhas revisadas.

## Regra de migrations

O responsável mostrou NEX-001…051 já aplicadas na VM. Proibido editar scripts aplicados, checksums ou reexecutar SQL histórico como se fosse nova migration. Qualquer nova alteração estrutural exige justificativa, aprovação e migration incremental a partir de NEX-052.

## Dependência crítica de Productos: unidade-base e alcance (12/10/2026)

**STK-X01 / BLOQUEANTE / integridade semântica:** a API de edição `app/api/productos/[id]/route.ts:253-296` atualiza `productos.unidad_medida_id` sem guarda de movimentos/stock; `NEX-009` e `NEX-014` contabilizam `stock_saldos.cantidad`, `inventario_costos` e `movimiento_lineas.cantidad` numericamente por produto, sem congelamento da unidade-base na movimentação. Trocar UNI→CJ sem conversão auditada reinterpreta saldos/histórico/custos. Auditar restrição de alteração da base após primeiro fato de inventário antes de qualquer mudança de schema.

**STK-X02 / ALTA / alcance:** `lib/stock/shared.ts` implementa filtro por `usuario_deposito`/`alcance_depositos` na consulta; `app/api/productos/route.ts` e `[id]/route.ts` não aplicam esse filtro ao saldo nem à lista de depósitos. Exigir consistência com a política de visibilidade de Stock ao recuperar dados via Productos.

**STK-X03 / precisão futura:** apresentação em `producto_unidades.factor_conversion` suporta 6 casas (`NEX-007`), mas movimentos/stock apenas 4 (`NEX-009/014`). Conversão aprovada DEC-PRD-U03 requer rejeitar quantidade não representável, sem arredondamento silencioso. A emissão FE atual não deve ser presumida uma baixa de estoque.

**Fonte:** `AUD-PRODUCTOS-V1.md`, seção XIV; auditoria completa de Stock continua aberta. Sem teste de banco/VM.

## Revisão da regra STK-X01 — unidade-base com versões históricas (12/10/2026)

O responsável esclareceu que deseja **histórico das unidades-base de um produto, somente uma base vigente por vez**, e não um bloqueio permanente de mudança após a primeira movimentação. Apresentações comerciais podem continuar múltiplas.

**A integridade de STK-X01 permanece obrigatória:** nenhuma mudança pode reinterpretar saldos, quantidades/custos ou movimentos antigos. `NEX-009/014` registram quantidades em escala 4 sem snapshot da unidade-base; `NEX-007` mantém somente o FK atual e marcação de apresentação base sem versionamento temporal. Exigir histórico da unidade-base e ligação factual às operações. **Decisão DEC-PRD-U07 tomada em 12/10/2026:** somente permitir mudar a unidade-base com todos os saldos do produto zerados e sem operações pendentes; manter histórico de bases, uma única vigente por vez. Especificação na seção XVI de `AUD-PRODUCTOS-V1.md`.

**Nenhum código/SQL/VM alterado.**


## Confirmação DEC-PRD-U07 — guarda de inventário para alteração de unidade-base (12/10/2026)

O responsável escolheu a política conservadora: mudança de base é permitida se e somente se **todo o estoque do produto na empresa** estiver zerado, em **todos os depósitos, estados (DISPONIBLE, RESERVADO, CUARENTENA, TRANSITO etc.) e propriedades (incluindo terceiros)**, sem operações pendentes. Um histórico de unidades-base deve ser preservado, com apenas uma base vigente. Movimentos encerrados não impedem a alteração, mas **nunca são reescritos**.

A futura proteção no banco e na API deve ser transacional e imune a corrida contra novos movimentos; não usar apenas saldos disponíveis, totais de tela ou depósitos ao alcance do operador como verificação de integridade. Investigar os vínculos operacionais efetivamente existentes em V1, sem inventar V2. Ver `AUD-PRODUCTOS-V1.md`, seção XVI.

**Estado:** regra aprovada, não implementada. Auditoria integral de Stock aberta; nenhum teste/SQL executado.

## Matriz operacional real V1 para mudança de unidade-base — complemento 12/10/2026

Consultar **`AUD-PRODUCTOS-V1.md` §XVII**: `stock_saldos` deve ser zero em **todos** estados, depósitos, lotes e propriedades, sem filtrar pelo alcance visual do operador. Qualquer `inventario_costos.cantidad_valorizada` remanescente e falta de conciliação bloqueiam; `costo_promedio` isoladamente preservado com quantidade zero não significa saldo. `stock_lotes` sem quantidade não bloqueia só por existir; movimentos com estado `REGISTRADO`/`ANULADO` são fatos concluídos, não pedidos pendentes. Reposição é planejamento somente leitura; Recepciones hoje usa mocks `localStorage` e não é fonte SQL de pendências.

**STK-X04 / BLOQUEANTE antes de permitir a mudança de base:** API Productos bloqueia apenas produto no PUT; `NEX-014:224-249,282-359` grava movimentos sem bloqueio compartilhado por `productos.id`. A mudança futura exige serialização transacional comum entre a guarda de saldo zero e novos movimentos. Snapshot histórico de unidade-base/versões não existe nos movimentos atuais; não reescrever fatos passados.

**Estado:** dependência identificada, sem código/SQL/VM aplicados; homologação pendente.

## Distinção entre pendência fiscal e pendência física — DEC-PRD-U08 (12/10/2026)

**Decisão aprovada:** com **todos os saldos de estoque zerados** e **nenhuma operação física pendente**, uma FE cujo payload fiscal já está efetivamente persistido e imutável **não bloqueia a mudança da unidade-base** apenas por seu envio, consulta ou resultado SIFEN estar pendente. O documento conserva unidade, quantidade, preço, IVA, total e demais dados fiscais históricos.

**A guarda física da DEC-PRD-U07 não foi flexibilizada:** saldo em qualquer estado/depósito/propriedade ou operação de inventário pendente impede a troca; estados de FE `PENDIENTE_ENVIO`, `ENVIANDO`, `ENVIO_INDETERMINADO` não são, isoladamente, movimentação de estoque. Acesso ao snapshot imutável e reenvio são da auditoria de Facturas; não recalcular movimentos históricos a partir da base atual.

**Evidência/pendência técnica:** `NEX-014` registra movimentos reais; `NEX-047/048` modelam estados fiscais e solicitação fiscal imutável, sem vínculo de linhas físicas que prove efeito. Mapear só pendências físicas reais, mantendo separação entre documentos e eventos; verificar futuras integrações com Inventario antes de implementação. Ver `AUD-PRODUCTOS-V1.md` §XVIII e `AUD-FACTURAS-V1.md` DEC-PRD-U08.

**Estado:** regra aprovada; nenhum PostgreSQL, SQL, código ou teste operacional executado; auditoria de Stock ABERTA.

## DEC-PRD-U09 — rastreabilidade de fator comercial por versão (12/10/2026)

**Regra aprovada:** apresentações comerciais já usadas são imutáveis quanto à unidade/fator que definem a conversão. Alterar Caja de 12 para 10 UNI gera nova versão ativa dessa apresentação, preservando a antiga; outras apresentações comerciais seguem ativas. Um movimento antigo deve continuar interpretado pelo fator original, e novo movimento adota a versão atual somente a partir de sua vigência.

**Risco operacional:** `NEX-009/014` movimenta `cantidad` em unidade-base, sem FK/versão da apresentação no `movimiento_lineas` atual. `lib/productos/sincronizar.ts` ainda permite UPDATE/DELETE da apresentação; a futura associação ou snapshot de quantidade comercial, base e fator é necessária para auditoria e reversões. Não alterar movimentos e custos anteriores nem inferir novos saldos pela atualização do cadastro.

**Estado:** DEC-PRD-U09 aprovada na fonte canônica `AUD-PRODUCTOS-V1.md` §XIX, Stock ainda em auditoria, sem execução SQL/VM.

## Auditoria transversal do Inventario (13/10/2026)

**Revisão estática conjunta de Stock, Movimientos, Depósitos e Reposición.** Fonte canônica transversal: [AUD-INVENTARIO-INTEGRADA-V1-2026-10-13.md](./AUD-INVENTARIO-INTEGRADA-V1-2026-10-13.md). SHA-base: `02d730e6e13ed2b0183563835e27757c18b50259`. **Não homologado; nenhuma implementação, PostgreSQL, VM, Docker ou navegador executados nesta revisão.**

**Stock** mantém somente consulta, detalhe e atalhos; análise de moeda/valor e permissões de atalhos em INV-01…04. Nenhuma edição direta de saldos.

**Estado:** propostas de simplificação pendentes de decisão do responsável; achados técnicos numerados e critérios de aceite no contrato compartilhado. Não interpretar este registro como autorização automática para o Claude alterar o menu.


## Auditoria atual — Stock DESKTOP (18/10/2026)

**Snapshot de código:** `ee57f3a681d3d33aa71e0428b0cbb59efac20c6c`. **Relatório imutável de revisão por menu:** [AUD-NEXIT-STOCK-DESKTOP-R01](../../testes/AUD-NEXIT-STOCK-DESKTOP-R01-2026-10-18.md). A auditoria transversal de 13/10 continua fonte histórica, e INV-01…04/INV-R02-01/02 estão **corrigidos estaticamente em código**; não reabrir sem nova regressão. **Software exclusivamente desktop**; ignorar tarefas/casos históricos para celulares. Nenhum PostgreSQL, VM, browser, endpoints reais ou testes executados neste parecer; **não homologado**.

| ID | Prioridade | Achado atual verificado em código | Estado |
|---|---|---|---|
| **STK-D01** | **ALTA (semântica/alcance)** | `lib/stock/shared.ts:31–49` mantém produtos ativos da empresa, e inativos com saldo em QUALQUER depósito, enquanto `:51–66` filtra somente saldos e custos por depósito autorizado. Produto sem linha em depósito autorizado vira «Sin stock» e infla SKU/KPI; risco de inferência de existência de saldo fora de alcance no caso inativo. **O catálogo global é intencional no comentário `:11–13`; resolver política explícita antes de mudar consulta**. | **ABERTO** |
| **STK-D02** | **MÉDIA** | `stock/page.tsx:39–40,115–123,685–689`: moeda-base é variável de escopo do módulo; promessa de instância desmontada ainda escreve em `MONEDA_BASE` e pode rotular valores do usuário/contexto seguinte com moeda antiga | **ABERTO** |
| **STK-D03** | **MÉDIA (concorrência de leitura)** | `lib/stock/shared.ts:31–87`: 9 consultas independentes ao Pool com `Promise.all`, sem snapshot único; movimento concorrente pode mostrar saldo de instante distinto de custo/valor. `lib/reportes/snapshot.ts` já fornece padrão de leitura REPEATABLE READ | **ABERTO**, risco de arquitetura sem repro PG real |

**Observações separadas de bugs:** STK-O01 produto configurado em depósito sem saldo zero não entra em `vistaPorDeposito` por decisão/teste anterior; STK-O02 KPI soma unidades de medida diferentes (semântica a confirmar); STK-O03 listagem paginada localmente 25, latência não medida; STK-O04 ação de movimento para depósito histórico inativo é só risco condicional; STK-O05 custos e preços visíveis sob STOCK.VER é contrato anterior (política de sigilo pode exigir revisão); STK-O06 404 genérico de detalhe não é erro de autorização comprovado.

**Confirmado preservado:** Stock só GET e atalhos; Movimientos única escrita física; STOCK.VER no layout/API; empresa e depósitos do ator para saldo/custos; propriedade PROPIO/TERCERO; níveis SIN_STOCK/BAJO/SOBRESTOCK; tipo de controle por lote e vencimento; `depositosAutorizados` e `?deposito=` corretos; cálculo do custo unitário com decimal em texto; moeda de venda diferente da moeda de custo não somada no KPI; autorização Movimientos.VER+CREAR por atalhos; Reposición também requer STOCK.VER, logo não é link bloqueado por permissão.

**Estado:** auditoria estática do MENU 8 concluída com 1 ALTA + 2 MÉDIAS abertas e observações; **NÃO HOMOLOGADO**. Nenhuma ordem de correção ao Claude, SQL, migração, build/tsc/lint global ou execução de testes. **Próximo menu: Inventario → Movimientos**, quando solicitado.


## AUD-R02 Stock DESKTOP — 19/10/2026
- **Relatório:** `documentacao/testes/AUD-NEXIT-STOCK-DESKTOP-R02-2026-10-19.md`. HEAD funcional de referência `dc109a7d2028fe8c20e09f25b080a5c4e175dff1`; 13 arquivos de Stock idênticos à R01 de `ee57f3a681d3d33aa71e0428b0cbb59efac20c6c`. **NÃO HOMOLOGADO.**
- **STK-D01 ALTA — gate C24/PRO-137:** catálogo de produtos empresa-wide com estoque/custo filtrados por depósito; decide-se em negócio o universo de SKU visível e o significado de SIN_STOCK antes de mudar joins, filtros ou KPIs. Não duplicar execução de C24.
- **STK-D02 MÉDIA — bug confirmado:** `MONEDA_BASE` está global em `stock/page.tsx` e é modificada por GET tardio mesmo após unmount. Estado de moeda deve pertencer à instância/resultado vigente. Testes focais de duas respostas fora de ordem.
- **STK-D03 MÉDIA — risco condicional:** `leerStock` executa 9 SELECT no Pool sem snapshot comum; não reproduzido em PG. Testar concorrência autorizada antes de mexer em isolamento; `conSnapshotLectura` de Reportes é só referência.
- **Preservar:** INV-01…04/INV-R02-01/02, STOCK.VER, alcance de depósitos, valor decimal exato, propriedade PROPIO/TERCERO, vínculos Movimientos/Reposición, contratos NEX-009/014/046/052. STK-O01…O06 são observações. Apenas auditoria estática: zero testes/banco/browser/CI/SQL/deploy, sem alterações funcionais.
- **Linear:** pai `PRO-78` (não PRO-72, que é Vendedores planejado). STK-D01 vinculado ao gate existente PRO-137; STK-D02 tarefa corretiva e STK-D03 investigação condicionada. Próximo menu documentado: Inventario → Movimientos, mediante pedido.


## AUD-R03 Stock DESKTOP — PRO-178 / STK-D02 (19/10/2026)
- **Auditoria independente:** [AUD-NEXIT-STOCK-DESKTOP-R03](../../testes/AUD-NEXIT-STOCK-DESKTOP-R03-2026-10-19.md). Commit funcional `8ceed1c3876ff489611034ab95dca417c9473d36`. **PRO-178 / STK-D02 CONFORME ESTATICAMENTE**, sem novo bloqueio identificado no diff autorizado; não homologado.
- `MONEDA_BASE` global removida; moeda `useState<string | null>(null)` pertence à instância, segue a própria resposta de `cargarStock` e o helper `iniciarCargaStock` ignora callbacks tardios após cleanup. Sem moeda válida mostra «—» em custo/valor; preço de venda usa sua `monedaPrecio`.
- **Testes reportados pelo Claude, não executados pelo ChatGPT:** helper 7/0; Stock 19/0; residuais 67/0; Stock–Reposición 275/0. Cobertura de promessas controladas e wiring estrutural; sem React/HTTP real, PostgreSQL/VM, CI ou deploy. Dois asserts históricos foram adaptados sem relaxar autorização nem regra de estoque.
- **Continuam separados:** STK-D01 ALTA = C24/PRO-137, exige decisão funcional; STK-D03 MÉDIA = PRO-179, investigação concorrente condicionada sem repro em PG. STK-O01…O06 observações preservadas. **PRO-78 In Review; nenhum Done, sem HOMOLOGAÇÃO.**
