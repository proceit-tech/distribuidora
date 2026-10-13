# Auditoria por menu — Reporte Kardex

**Rota principal:** `/reportes/kardex`  
**Branch:** `feature/NEXIT-2026-001-banco-demo`  
**Estado:** ABERTA — NÃO AUDITADA INTEGRALMENTE — NÃO HOMOLOGADA  
**Responsável pela auditoria estática:** ChatGPT. **Implementação:** Claude Code somente mediante tarefa autorizada. **Homologação operacional/visual:** responsável na VM.

## Escopo e rastreabilidade

Este arquivo é a fonte única da auditoria do menu **Reporte Kardex**. Registrar, com caminho e linha, cada página/subtela, componente, API, serviço, permissão de menu/servidor, tabela, trigger, migration, testes e dependências com outros módulos. Não confundir inventário com execução ou homologação. Ver `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` e `documentacao/v1/AUDITORIA-GERAL-NEXIT-V1-2026-10-12.md`.

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

## Auditoria transversal de Reportes — 13/10/2026

**Auditoria estática integrada:** [AUD-REPORTES-INTEGRADA-V1-2026-10-13.md](./AUD-REPORTES-INTEGRADA-V1-2026-10-13.md), referência única para achados e critérios cruzados dos cinco relatórios + índice. **SHA-base:** `aee2af3926603fb9c9db4bba1ed72bc874b5c2a2`. Reporte **histórico**, com saldos acumulados e contramovimentos, distinto do registro operacional de Movimientos; não fabricar histórico de custo a uma data sem snapshot.

**Status:** achados e propostas registrados, **sem código, SQL, PostgreSQL, browser, VM, Docker ou deploy nesta rodada**. Não representa autorização automática para Claude alterar Reportes enquanto a tarefa conjunta de Inventario estiver ativa; **NÃO HOMOLOGADO**.


## AUD-KDX-R01 — auditoria dirigida do Kardex de movimientos (13/10/2026)

**Fonte de verdade:** branch `feature/NEXIT-2026-001-banco-demo`, HEAD `f3eeea4ed294aacfea90b531f05eba415a217ab0`. **Pedido:** confrontar o relatório Kardex (histórico) com `Inventario > Movimientos` (motor operacional), sem alterar os três relatórios já aceitos estaticamente. Foram consultados `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, progresso pertinente, `documentacao/v1/REPORTES-V1-ALCANCE-APROBADO.md`, `lib/reportes/{kardex,cliente-kardex,export-kardex,kardex-textos,guard,stock-general,alcance,snapshot}.ts`, `app/(private)/reportes/kardex/page.tsx`, APIs `/api/reportes/kardex{,/exportar}`, `types/reportes.ts`, `documentacao/banco/nexit/v1/migraciones/NEX-014-movimientos-operativos.sql`, `documentacao/banco/nexit/v1/pruebas/T09-movimientos-operativos.sql`, testes de Movimientos e registro das suítes em `scripts/casos-clientes/run.js`. Auditoria **estática GitHub**: nenhuma execução de PostgreSQL, VM, Docker, navegador, suíte, TypeScript, ESLint, build, arquivo Excel/PDF, SQL/migration ou deploy. Estado real de migrations e dados não foi provado.

### Invariantes que já existem e devem permanecer

- `kardex.ts:103-136,217-249`: deriva efeitos das 9 operações do livro `movimientos_inventario + movimiento_lineas`. A função analítica `sum(...) OVER w` é calculada **antes de aplicar os filtros de linha e a paginação**. O período usa data de registro em `America/Asuncion`, com data operacional separada; não retroagir movimentos apenas porque a data escolhida é antiga.
- `NEX-014:367-432`: anulação cria um **novo movimento inverso** `tipo_origen='ANULACION'`, vinculado por `anula_a_id`, e marca o original `ANULADO`. O Kardex preserva ambos no livro e exibe vínculos `anulado_por/anula_a`; **não subtrair o lançamento original novamente por mudar de estado**.
- Transferência usa um efeito de saída por origem e um de entrada por destino; reserva, liberação e quarentena alteram distribuição entre disponível/reservado/quarentena **sem alterar físico**. `kardex.ts:113-124,145-150` e o SQL `NEX-014:435-471` sustentam esse contrato; não duplicar a soma no consolidado.
- Custo unitário e valor da **linha do movimento** vêm de `movimiento_lineas` em `kardex.ts:229-230`; não inferir **saldo valorizado histórico** a partir de `inventario_costos` atual. A exclusividade do relatório Valorización já auditado permanece.

### Achados estáticos R01

| ID | Severidade | Evidência objetiva | Critério de aceite |
|---|---|---|---|
| **RPT-KDX-01** | **ALTA — precisão de saldo e quantidades** | `lib/reportes/kardex.ts:145-157,187-209,225-228,270-299` converte `numeric` do PostgreSQL para `::float8` e `number` JS para quantidades, saldo inicial/final, efeitos e conciliación com epsilon `0.00005`; `types/reportes.ts:204-310` representa tudo como number e `export-kardex.ts:39-77` reproduz. | Transmitir decimais exatos em texto, usar helpers decimais já compartilhados e teste XLSX/PDF de células efetivas; nenhum erro de arredondamento que seja escondido por tolerância arbitrária, zero/ausente distintos. Preservar custos monetários da linha em texto e política de até quatro casas conforme motor. |
| **RPT-KDX-02** | **ALTA — snapshot entre livro, conciliação e tela** | `kardex.ts:152-185,217-240,269-309` usa consultas `db.query` do Pool e `Promise.all`, sem conexão fixa nem `REPEATABLE READ`. Se uma movimentação ocorrer entre total, reconciliação, detalhe e catálogos, uma **mesma resposta** pode conter fotografias diferentes. | Usar `conSnapshotLectura` com **uma conexão READ ONLY REPEATABLE READ** para escopo, totais, conciliação livro×Stock, detalhe/resumo e metadados; rollback/release em falha. Exportação usa a mesma fonte por requisição, sem prometer sincronia entre downloads feitos depois. |
| **RPT-KDX-03** | **ALTA — movimentos de terceiros ausentes do histórico** | `kardex.ts:103-111`: `mv` restringe `l.propiedad='PROPIO'`; entretanto `NEX-014:173-179,436-471` persiste `PROPIO` e `TERCERO`, e a vista histórica da migração particiona por `propiedad`. Contrato aprovado exige propriedade e rastreabilidade de movimentos reais. | Incluir livro **separado** para propriedade PROPIO/TERCERO e, quando aplicável, `propietario_id`; não misturar saldos de terceiros, nem atribuir custo próprio a mercadoria de terceiros. Filtros/identificação de propriedade e totals por unidade+propriedade em detalhe, resumo e arquivos; manter alcance da sessão. |
| **RPT-KDX-04** | **MÉDIA — depósitos inativos desaparecem do histórico** | `kardex.ts:4,78-80` usa `depositosPermitidos` de `stock-general.ts:58-64` (somente `d.activo` + permissão para operar); `lib/reportes/alcance.ts` e `NEX-046:199-207` distinguem consulta histórica dentro do alcance incluindo **inativos**. O histórico de movimento pode existir mesmo quando a NEX-046 impede inativar com saldo presente. | Leitura histórica deve respeitar `empresa_id` e vínculos do usuário, incluindo inativos **autorizados** se contrato aplicável, rotulados; não ampliar acesso a inativos fora do alcance e não modificar helper compartilhado de outros relatórios. Não alegar que saldos reais de inativos existam na VM. |
| **RPT-KDX-05** | **ALTA — resultados obsoletos visíveis após falha/filtro** | `app/(private)/reportes/kardex/page.tsx:41-50,58-76,94-135,222-398` altera `error` no catch mas mantém `datos` antigos; não exige que `datos.filtros` e página sejam vigentes antes de mostrar KPIs, conciliação, linhas, totais e exportações. `lib/reportes/cliente-kardex.ts:19-23` força cast do JSON sem validação estrutural. | Adotar padrão já auditado de Stock general/Valorización: validação HTTP+forma, última requisição ganha, filtro/página por **valores dos campos**, limpeza de dados obsoletos em falha, retry mantendo filtros, exportação só para resposta vigente e permissão confirmada. Testes de respostas fora de ordem, filtro debounced, 401/403/503, JSON inesperado e mudança de página. |
| **RPT-KDX-06** | **MÉDIA — UX de exportação sem autorização** | `page.tsx:94-102` mostra botões Excel/PDF mesmo com só `REPORTES.VER`; API de exportação `app/api/reportes/kardex/exportar/route.ts:10` **corretamente exige** `VER+EXPORTAR`, logo os botões conduzem a 403. | Indicar `permisos.exportar` a partir de `hasPermission` no GET consultivo; esconder/desabilitar ações se não autorizado, sem relaxar nenhuma checagem no endpoint de exportação. |
| **RPT-KDX-07** | **ALTA — soma de unidades diferentes em indicador e total geral** | `kardex.ts:152-209,269-283` e `page.tsx:105-130,292-370` totalizam saldos e entradas/saídas de **produtos distintos** sem agrupar por unidade. `types/reportes.ts` não atribui unidade à linha histórica, e Excel/PDF via `export-kardex.ts:91-129` repetem somas heterogêneas. | Trazer unidade-base do produto para cada linha, somar apenas **dentro de unidade e propriedade compatíveis**, ou exibir `n/a` nas quantidades globais heterogêneas. Transferências compensadas no âmbito consolidado sem mascarar variação por depósito. Resumo por unidade explícita e mesma semântica no detalhe, resumo, XLSX e PDF. |
| **RPT-KDX-08** | **MÉDIA — ausência de regressão específica do Kardex** | A árvore do repositório não contém `lib/reportes/kardex.casos.ts` e `scripts/casos-clientes/run.js:35-90` não registra `verificarCasosReportesKardex`. `export-xlsx.casos.ts` testa colunas e tabelas sintéticas, não concilia registros gerados por `inventario_registrar_movimiento` e `inventario_anular_movimiento`. | Escrever casos puros e simulados para leitura real do serviço e serialização real XLSX/XML e PDF: 9 tipos, anulação, transferências origem×destino, terceiros, lotes, saldo inicial/final, retroativos por registro, paginação, filtro estado/usuário/documento, 401/403/413, múltiplas empresas e depósitos. Indicar que fake DB **não é PostgreSQL real**. |
| **RPT-KDX-09** | **MÉDIA — moeda e significado dos custos históricos** | `kardex.ts:229-230` transporta `moneda_costo_codigo` por linha (positivo), mas `page.tsx:271-272` e `export-kardex.ts:58-59` exibem «Costo unit./total» na tabela principal sem a moeda associada, que só aparece ao expandir a linha na UI. `NEX-014:173-179` preenche a moeda base para movimentos próprios e não prevê valorização histórica de saldo. | Identificar moeda do custo no cabeçalho/célula da linha e XLSX/PDF, sem converter valores entre moedas e sem usar custo médio atual como saldo histórico; sem custo mostrar dado não disponível, não zero; nunca somar custos dos dois lados da mesma transferência como se duas entradas independentes. |

### Matriz mínima de testes e decisões de implementação futura

1. **KDX-T01**: entrada 10, saída 3, ajuste+2, anulação da saída (inverso +3) no mesmo produto×depósito×lote: livro preserva quatro movimentos, saldo final 12, original marcado ANULADO sem excluir seu efeito; vínculo e ordem de registro em tela/arquivos.
2. **KDX-T02**: transferência 4 de A→B, depois estorno B→A. Livro tem dois lados por transferência; no consolidado neto físico zero, por depósito a saída e entrada são rastreáveis. Se usuário vê apenas A, jamais mostrar dados sensíveis do depósito B como se autorizado (nome/quantidade condicionados ao acesso).
3. **KDX-T03**: reserva 3, liberação 1, quarentena 2: disponível/reservado/quarentena mudam, físico permanece; estorno de mudança de estado só quando permitido pelo motor.
4. **KDX-T04**: terceiro X e terceiro Y do mesmo produto×depósito×lote mais mercadoria própria: histórico, saldo e reconciliação separados pela identidade do proprietário; sem custo patrimonial atribuído a terceiros.
5. **KDX-T05**: período com `desde/hasta`, data de movimento retroativa e ordem de registro; saldo inicial calculado **antes do período**, saldos em cada página e saldo final reais, mesmo com filtros de linha e sem nenhum movimento visível.
6. **KDX-T06**: `numeric::text` com 0.0001, frações e >15 dígitos; sem misturar KG/UNIDAD/LITRO, USD/GS onde pertinente; XLSX real inspecionado célula a célula e PDF, custo presente/ausente.
7. **KDX-T07**: duas empresas, usuário restrito ao depósito A, depósito B inativo e atribuído/não atribuído, filtros diretos de UUID, acesso ao nome da contraparte da transferência e isolamento da consulta; 401/403/503 e `REPORTES.VER` sem `REPORTES.EXPORTAR`.
8. **KDX-T08**: simultaneidade simulada para demonstrar uma conexão e `READ ONLY REPEATABLE READ` na leitura de livro×Stock; 50.000 linhas exportadas, 50.001→413 sem estouro de recursos, rollback/release e mesmas regras em GET/XLSX/PDF.
9. **KDX-T09**: cliente HTTP 200 inválido, rede, erro, retry, filtros rápidos, campo de busca com debounce, página obsoleta, botões só na resposta vigente autorizada; navegador real 375/768/1440 **exclusivamente pelo responsável humano**.
10. **KDX-T10**: regressões de `Inventario > Movimientos`, `Inventario > Stock`, `Valorización`, `Stock crítico`, `Stock general`; Kardex **somente leitura**, sem segundo motor de escrita de movimentos/estoque, sem migration desnecessária.

### Veredito

**AUD-KDX-R01 CONCLUÍDA NO ESCOPO DIRIGIDO — NOVE ACHADOS CONFIRMADOS POR LEITURA DE CÓDIGO/CONTRATO; IMPLEMENTAÇÃO NÃO INICIADA; KARDEX NÃO ACEITO TECNICAMENTE NEM HOMOLOGADO.** O núcleo atual da sequência de efeitos e vínculos deve ser preservado, mas as correções são pré-condição de aceite. Não há evidência de necessidade de migration; qualquer evolução estrutural futura segue protocolos de scripts incrementais e jamais aplicação automática. Não reabrir Stock general, Valorización, Stock crítico, Lotes nem módulos operacionais por conveniência. Claude só implementa se autorizado, publica SHA, testes locais e para para reauditoria. Banco PostgreSQL/VM/navegador e homologação pertencem ao responsável.
