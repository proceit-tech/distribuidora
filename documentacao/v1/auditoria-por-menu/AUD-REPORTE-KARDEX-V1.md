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


## AUD-KDX-R02 — reauditoria da entrega d7038b (13/10/2026)

**SHA auditado:** `d7038b1757fdd17adaff2a1627923b6c7484c9b2` na branch oficial `feature/NEXIT-2026-001-banco-demo`, HEAD no início da inspeção. **Método:** consulta GitHub dos protocolos `CLAUDE.md` e `documentacao/PROTOCOLO-IA.md`, progresso pertinente, diff do commit, arquivos do Kardex (serviço SQL, helper puro, API/guardas, página, tipos, clientes, exportador, suíte e runner), contrato `NEX-014`, migration versionada `NEX-052`, renderizador compartilhado `lib/reportes/pdf.ts`, matriz `AUD-KDX-R01`. **Não executados por ChatGPT** PostgreSQL real, frontend/navegador, Docker/VM, suíte, TypeScript, lint, Next build, XLSX/PDF em leitores externos, migrations nem deploy. Claude **relatou** 2.905 verificações locais, 0 falhas (+75 sobre 2.830), tsc/lint/build OK e inspeção local de XLSX e PDF; esses resultados não foram reproduzidos pelo ChatGPT. Nenhum novo script SQL e nenhum ajuste no motor operacional/Valorización/Stock crítico/Stock general/Lotes no commit. O diff inclui adaptação estritamente dos testes de Stock general à nova separação do Kardex.

### Matriz dos nove achados R01

| ID | Evidência revisada | Parecer estático |
|---|---|---|
| **RPT-KDX-01** | `kardex.ts:147-168,203-239,259-299` usa `numeric::text` em lugar de `float8`; `kardex-plan.ts:12-37` usa aritmética decimal exata e conciliação sem epsilon; `types/reportes.ts:204-337` formaliza quantidades textuais; `export-kardex.ts` envia texto decimal para serialização XLSX com conversão exata; teste `kardex.casos.ts:411-445`. | **CORRIGIDO EM SQL/CLIENTE/XLSX**, **pendência de fidelidade numérica no PDF (R02-01)** |
| **RPT-KDX-02** | `kardex.ts:82-84,162-193,202-314` usa uma conexão e `conSnapshotLectura` para alcance, livro, conciliação, linhas, catálogos e hora; teste simulado `:475-483` verifica BEGIN REPEATABLE READ READ ONLY, COMMIT/ROLLBACK/release. | **ACEITE ESTÁTICO**, sem comprovação em PG real |
| **RPT-KDX-03** | `kardex.ts:110-145` remove o filtro restritivo `l.propiedad='PROPIO'`; janela agrega por produto×depósito×lote×propiedad×propietario; `:171-190` faz FULL JOIN de conciliação com mesmos atributos; custo de terceiros ocultado no retorno. Suíte `:351-373`. | **ACEITE ESTÁTICO** |
| **RPT-KDX-04** | `kardex.ts:84-89,211-223` usa `depositosDelAlcance` (ativos/inativos atribuídos), marca inatividade e esconde nome de contraparte quando depósito não está no alcance; teste `:451-466`. | **ACEITE ESTÁTICO** |
| **RPT-KDX-05** | `cliente-kardex.ts:20-35`, `kardex-plan.ts:76-127` validam forma/HTTP e filtros por valor; `page.tsx:23-99` usa compuerta de resposta mais recente, limpa dados em falha, retry e só apresenta `actual`. Teste `:512-568` usa parser, resposta real simulada, chamadas cliente e lógica de compuerta, mas não React montado. | **ACEITE ESTÁTICO** |
| **RPT-KDX-06** | `app/api/reportes/kardex/route.ts:9-23` acrescenta indicação `permisos.exportar`; `app/api/reportes/kardex/exportar/route.ts` ainda exige `REPORTES.VER+EXPORTAR`; `page.tsx:77-132` condiciona visibilidade/download à resposta vigente e permissão. | **ACEITE ESTÁTICO** |
| **RPT-KDX-07** | `kardex.ts:135-168` agrupa por `unidad,propiedad,propietario_id`; `kardex-plan.ts:46-73` cria grupos, UI e exportação não exibem somatório geral heterogêneo; `kardex.casos.ts:411-449` valida três unidades e proprietários. **Unidade é extraída do cadastro atual do produto**, gerando dependência histórica R02-02. | **ACEITE ESTÁTICO NA POLÍTICA ATUAL, DEPENDÊNCIA R02-02** |
| **RPT-KDX-08** | `lib/reportes/kardex.casos.ts` (581 linhas) registrada em `scripts/casos-clientes/run.js`: KDX-T01 a KDX-T10, emulação de efeitos/anulações, proprietários, saldos, filtros, regressões, controle 413 com 50.001 e parse ZIP/XML e PDF. | **COBERTURA LOCAL RELEVANTE PUBLICADA**, não equivale a PostgreSQL real |
| **RPT-KDX-09** | `kardex.ts:216-218` mantém custo e moeda somente da linha própria, valor na saída da transferência; `export-kardex.ts:66-68` inclui «Moneda costo», UI `page.tsx:102-103` mostra moeda junto ao custo. Não reconstrói valorização patrimonial histórica. | **ACEITE ESTÁTICO** |

### Achados novos

**RPT-KDX-R02-01 — ALTA — truncamento do PDF quebra fidelidade de quantidades/saldos.**

**Prova:** `export-kardex.ts:47-72,93-167` gera tabela com 24 colunas e `multilinea:true`; o gerador comum `lib/reportes/pdf.ts:138-149` faz `t.columnas[i].derecha ? [recortar(v,ancho-4,FS,...)] : partirTexto(...)`. Como `cantidad/dinero` têm `derecha=true`, saldos de ~20 dígitos e quatro decimais são renderizados com reticências mesmo quando seu `numeric::text` está exato. `pdf.ts:33-38` confirma que `recortar` elimina sufixos. **O próprio teste `kardex.casos.ts:444` passa se o número for completo OU se for recortado com `…`; não comprova fidelidade do PDF.** Claude identificou e relatou essa limitação. A perda é claramente indicada visualmente e a exportação Excel preserva o valor, mas **um PDF de auditoria histórica que omite dígitos da quantidade não atende à aceitação de fidelidade**.

**Aceite exigido:** números inteiros/decimais precisam estar **integralmente recuperáveis e legíveis no PDF**, incluindo saldo de 20+ dígitos, sem inserir reticências no valor oficial. O ajuste pode ser de apresentação específico do Kardex (colunas/páginas/linhas) ou do gerador compartilhado **apenas se testes de regressão confirmarem todos os outros quatro reportes**. Teste com geração e leitura real das strings do PDF deve **rejeitar** número incompleto; avaliar todas as colunas quantidade e totais, custo/multimoeda, RESUMEN/DETALLE e múltiplas páginas. Não sacrificar dados para caber A4. Evitar reabrir regras financeiras ou a serialização XLSX.

**RPT-KDX-R02-02 — MÉDIA CONDICIONAL — unidade histórica de movimentos fica incorreta após mudança de unidade-base (NEX-052).**

**Prova:** `kardex.ts:135,140,164,168,245-265` obtém `unidad` sempre por `LEFT JOIN unidades_medida um ON um.id=pr.unidad_medida_id` (unidade **atual** do produto). `NEX-052-productos-cambio-unidad-base-stock.sql:63-76,93-129` cria `producto_unidad_base_historial` com `unidad_anterior_id,unidad_nueva_id,cambiado_at` e permite mudar a unidade com todos os saldos e quantidades valorizadas zerados **sem apagar movimentos históricos**. Em eventual sequência produto em KG → saldo zero → mudança para UNIDAD → novos lançamentos, o Kardex atual rotula todos os lançamentos antigos em UNIDAD e agrupa KG históricos com UNIDAD atuais, contrariando unidade efetiva de cada movimento. Isto **não** significa que a NEX-052 esteja aplicada nem que o problema esteja ocorrendo na VM; segundo progresso lido, NEX-052 está versionada, não aplicada.

**Aceite exigido:** documentar e implementar leitura temporal da unidade da movimentação/época (ou explicitar claramente `unidad histórica no disponible` onde não reconstruível) antes de alegar um Kardex historicamente confiável após a evolução NEX-052. Verificar situação anterior à aplicação da migration (que **não deve** passar a exigir tabela ausente), uma troca KG→UNIDAD com histórico zero intermediário e a possibilidade de mais de uma troca, sem converter números automaticamente ou alterar SQL aplicado. Não tocar na NEX-052, no motor de Movimientos ou em migrations existentes. Se for impossível cobrir sem evolução estrutural, registrar restrição precisa e eventual migration incremental **somente versionada**, submetendo-a a auditoria antes de qualquer decisão de aplicação. Teste de transição entre épocas, saldo zero, exportações e grupo por unidade, não apenas regex ou helper puro.

### Veredito AUD-KDX-R02

**Kardex de movimientos: nove achados R01 materialmente atendidos no núcleo da inspeção estática, porém ACEITE TÉCNICO FINAL PENDENTE** por um defeito ALTA na fidelidade da exportação PDF e por uma dependência MÉDIA condicional de unidade histórica NEX-052. Não alterar código sem autorização do responsável; manter trabalho restrito ao Kardex e ao formato de exportação, sem reabrir os três reportes anteriormente aceitos. **Nenhum relatório HOMOLOGADO no banco/navegador reais**. A implementação publicada não exige migrations novas neste momento e nenhum SQL/deploy foi executado pelo ChatGPT. Registrar próximos commits e reauditar antes de avanço a Lotes.
