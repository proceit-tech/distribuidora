# Auditoria por menu — Reporte Lotes y vencimientos

**Rota principal:** `/reportes/lotes`  
**Branch:** `feature/NEXIT-2026-001-banco-demo`  
**Estado:** ABERTA — NÃO AUDITADA INTEGRALMENTE — NÃO HOMOLOGADA  
**Responsável pela auditoria estática:** ChatGPT. **Implementação:** Claude Code somente mediante tarefa autorizada. **Homologação operacional/visual:** responsável na VM.

## Escopo e rastreabilidade

Este arquivo é a fonte única da auditoria do menu **Reporte Lotes y vencimientos**. Registrar, com caminho e linha, cada página/subtela, componente, API, serviço, permissão de menu/servidor, tabela, trigger, migration, testes e dependências com outros módulos. Não confundir inventário com execução ou homologação. Ver `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` e `documentacao/v1/AUDITORIA-GERAL-NEXIT-V1-2026-10-12.md`.

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

**Auditoria estática integrada:** [AUD-REPORTES-INTEGRADA-V1-2026-10-13.md](./AUD-REPORTES-INTEGRADA-V1-2026-10-13.md), referência única para achados e critérios cruzados dos cinco relatórios + índice. **SHA-base:** `aee2af3926603fb9c9db4bba1ed72bc874b5c2a2`. Reporte **de risco por vencimento**, complementar à leitura de lotes de Stock; preservar horizonte, classificação e XLSX/PDF; não duplicar painel geral de estoque.

**Status:** achados e propostas registrados, **sem código, SQL, PostgreSQL, browser, VM, Docker ou deploy nesta rodada**. Não representa autorização automática para Claude alterar Reportes enquanto a tarefa conjunta de Inventario estiver ativa; **NÃO HOMOLOGADO**.


## AUD-LOT-R01 — auditoria estática independente do reporte Lotes y vencimientos (13/10/2026)

**Estado desta rodada:** primeira auditoria substancial do quinto relatório. **Branch/HEAD base:** `feature/NEXIT-2026-001-banco-demo` / `ee58076fcac2094d1c338bb06ea4575cebbf5667` (4/5 demais reportes com aceite estático anterior). **Fontes lidas:** `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md`, `documentacao/v1/REPORTES-V1-ALCANCE-APROBADO.md`, esta auditoria e integrada; `app/(private)/reportes/{layout,page}.tsx`, `app/(private)/reportes/lotes/page.tsx`, `app/api/reportes/lotes/{route,exportar/route}.ts`, `lib/reportes/{lotes,cliente-lotes,export-lotes,guard,snapshot,alcance,stock-general,formato,export,export-xlsx.casos}.ts`, `lib/navigation/menu.ts`, `types/reportes.ts`, `scripts/casos-clientes/run.js`, migrations `NEX-009` e `NEX-014` (DDL e vínculos). **Não** foram executados testes, PostgreSQL, build, navegador, VM, Docker, SQL, migration ou deploy pelo ChatGPT. Dados reais e situação de aplicação de migrations não foram inspecionados. Referências anteriores a 66 testes PostgreSQL em progresso são evidência **histórica relatada**, não prova atual da implementação reavaliada.

### Cobertura, existente e preservações

- Implementado: página `/reportes/lotes` e layout com `guardPage("REPORTES","VER")`; item ativo no índice e `V1_HREFS`/menu `REPORTES.VER`. GET em `/api/reportes/lotes` exige `REPORTES.VER`, GET `/api/reportes/lotes/exportar` exige adicionalmente `REPORTES.EXPORTAR` por `autorizarReporte`; erros 400, 401, 403, 413 e 503 têm rotas explícitas. No servidor, filtro `empresa_id`, `depositosPermitidos`, 2 vistas `LOTE` e `DEPOSITO`, 4 classes de vencimento pela data local `America/Asuncion`, vencimento nulo, horizonte parametrizado 0–3650 dias, propriedade PROPIO e TERCERO separadas, filtros de categoria/marca/família/lote/depósito/datas/existência, paginação e XLSX/PDF. `NEX-009` define `stock_lotes`, `stock_saldos`, quantidade `numeric(18,4)`, FK composta de lote/produto/empresa, validade opcional; `NEX-014` preserva motor imutável de Movimientos.
- Não encontrado arquivo `lib/reportes/lotes.casos.ts` nem chamada específica a `verificarCasosReportesLotes` no runner atual `scripts/casos-clientes/run.js:43-47,83-89`; o teste XLSX compartilhado apenas verifica compatibilidade superficial de colunas de Lotes (não a SQL real). Sem inspeção visual real 1440/768/375. **Não homologado**.

### Achados confirmados — todos ANTES de aceite estático

#### LOT-R01-01 — ALTA — conversão insegura de `numeric` para `float8` / JS Number

**Evidência:** `lib/reportes/lotes.ts:75` define `const N = (c) => c::float8` e aplica esse cast em `:160-175,188-210` a todos os saldos, somas e classes; `types/reportes.ts:487-525` usa `number` para quantidades; `app/(private)/reportes/lotes/page.tsx:237-240` e `lib/reportes/export-lotes.ts:36-47` exibem/exportam valores que já perderam os decimais; `lib/reportes/formato.ts:3` formata `number`. A coluna fonte é `stock_saldos.cantidad numeric(18,4)` (`NEX-009:42`) e somas podem ultrapassar a precisão IEEE-754. **Defeito estrutural** de fidelidade de números com frações e totais extensos, independentemente de haver saldo assim na VM.

**Aceite:** SQL devolve `numeric::text` para quantidades/saldos/totais (não converter para `Number`), TS/API string decimal canônica e soma exata em PostgreSQL ou helpers inteiros de precisão equivalente. UI/PDF usam `fmtCantidadTexto` e detalhamento de terceiros por texto; XLSX grava números apenas quando exatamente representáveis no contrato de no máximo 15 dígitos e texto exato no restante (`celdaXlsx`). Testes com quantidades 4 decimais, inteiros grandes, saldo 0, terceiros, todos os totais, leitura real de células XLSX e tokens PDF, sem truncamento nem alteração de módulos aceitos.

#### LOT-R01-02 — ALTA — múltiplas consultas sem fotografia consistente

**Evidência:** `lib/reportes/lotes.ts:78-89,158-216` recebe `Pick<Pool,"query">` e executa isoladamente consultas de alcance, empresa, `porClase`, `tot`, linhas, catálogos e horário, sem `BEGIN ... REPEATABLE READ READ ONLY`. Em concorrência, um movimento entre as consultas altera `stock_saldos`; indicadores, totais e linhas podem divergir na **mesma resposta**, inclusive nas exportações. `lib/reportes/snapshot.ts:12-34` já fornece `conSnapshotLectura` aplicado em reportes aceitos.

**Aceite:** reutilizar `conSnapshotLectura` com uma conexão e uma transação REPEATABLE READ READ ONLY em todas as consultas relevantes da solicitação, incluindo alcance e hora; `COMMIT/ROLLBACK/release` mesmo após falha ou retorno antecipado 403/413; teste que modifica fonte simulada entre consultas e confirma consistência, com testes de rollback/erro/413. Não prometer snapshot idêntico entre requisição de tela e exportação feitas em momentos diferentes.

#### LOT-R01-03 — ALTA (controle de escopo) — lotes sem saldo podem ser expostos a usuário sem depósito autorizado

**Evidência:** `lotes.ts:87-90` calcula `deps` permitidos. `par` considera apenas depósitos permitidos (`:119-121`), porém `base` aceita `OR NOT EXISTS (SELECT 1 FROM stock_saldos x WHERE x.empresa_id=$1 AND x.lote_id=l.id)` (`:143-146`) mesmo que `deps=[]`: lotes globais **sem qualquer linha de saldo** podem ser retornados com `existencia=SIN` ou `TODOS`, revelando produto/lote/data a usuário sem depósito permitido. No cenário sem saldo global o lote não pertence a um depósito físico específico; sua política de visualização **precisa ser explícita**, não um bypass tácito por ausência de depósito.

**Aceite:** quando `deps` vazio, nenhuma linha, indicador ou metadado de lote deve ser exposto. Para lotes globais sem vínculo a depósito, definir regra coerente que impeça usuário restrito de inferir dados operacionais fora do seu alcance (por exemplo, limitar sua inclusão a usuário com alcance TODOS da empresa, mantendo filtro `empresa_id`), e testá-la. Usuário `ASIGNADOS` sem acesso a depósito não pode listar lotes órfãos; cliente de outra empresa ou admin global não pode acessar dados. Não inventar proprietário do lote nem vinculação a depósito inexistente.

#### LOT-R01-04 — MÉDIA — depósitos inativos permitidos não aparecem na fotografia de inventário

**Evidência:** `lotes.ts:3,87` reutiliza `depositosPermitidos` (`stock-general.ts:59-65`), que tem `d.activo`. `lib/reportes/alcance.ts:3-18` e Stock general/Valorización/Kardex já exigem alcance com **ativos e inativos**: saldos remanescentes não podem desaparecer do relatório por mudança de status do depósito. Mesmo que NEX-046 impeça desativação nova com saldo, dados legados ou anomalias não devem ficar invisíveis.

**Aceite:** usar alcance compartilhado `depositosDelAlcance` (inclui inativos mas respeita empresa, usuário e assignments), rotular inativos em seletor e linhas/narrativa, conciliar com Stock general e garantir que nenhum depósito de outra empresa seja incluído. Só leitura; sem alterar NEX-046.

#### LOT-R01-05 — MÉDIA — dados obsoletos, resposta não validada e exportação incoerente com permissão/filtros

**Evidência:** `page.tsx:21-28,43-52,59-75,93-103,214-265` conserva `datos` ao trocar filtros e depois de erro, apresentando totais/linhas antigos; o efeito usa apenas `activo`, mas não exige correspondência explícita da resposta com filtros/página aplicados. O botão de exportação ignora `REPORTES.EXPORTAR` e estado de resposta vigente (disabled só durante loading), mesmo para usuário com `VER` sem `EXPORTAR`, para o qual o servidor devolve 403. O rascunho `horizonteTxt` inválido mantém o horizonte aplicado anterior (`:31-35`), confundindo filtro visível e resultados; `lib/reportes/cliente-lotes.ts:18-24` confia no JSON 200 sem validação estrutural de contrato.

**Aceite:** cliente robusto como Stock general/Kardex/Valorización: validade de filtros e página por igualdade campo a campo; descartar/ocultar resposta anterior durante recarga/erro, reaplicação de filtros e próxima página; normalizar e validar horizonte 0–3650 sem requisição silenciosamente divergente e erro de campo claro; informação `permisos.exportar` do backend em GET sem relaxar a exigência SERVER `VER+EXPORTAR`; botões somente quando dados vigentes e permissão expressa; resposta incompleta/numérica inválida rejeitada com mensagem recuperável; `Reintentar`, estados de erro/vazio; testes de corrida, falha API, 403/413/503, mudança de filtro/página e dados exportados com filtros efetivos.

#### LOT-R01-06 — MÉDIA — filtro anuncia GTIN mas só consulta código de barras principal

**Evidência:** `page.tsx:127-135` promete “Buscar producto por código, código de inventario, GTIN o descripción”; `lotes.ts:94` verifica `pr.codigo, descripcion, codigo_inventario, codigo_barras`, mas não `producto_codigos` (GTIN múltiplos cadastrados, `NEX-007`). Produtos podem ter GTIN válido secundário/embalagem sem coincidência com `codigo_barras`, ficando ausentes da busca.

**Aceite:** `EXISTS` parametrizado em `producto_codigos` por `empresa_id`, `producto_id` e tipo fiscal/comercial apropriado ao filtro (GTIN/GTIN_EMPAQUE/EAN/UPC conforme modelo real), com escape LIKE, sem duplicar lotes devido a várias linhas por produto. Testes de principal, alternativo, wildcard, produto de outra empresa e filtros combinados.

#### LOT-R01-07 — MÉDIA — ausência de suíte de regressão específica integrada ao runner atual

**Evidência:** diretório atual não contém `lib/reportes/lotes.casos.ts`; `scripts/casos-clientes/run.js:43-47,83-89` chama suites de Stock, Valorización, Stock crítico, Kardex e exportador XLSX genérico, não executa casos de Lotes. `PROGRESSO-NEXIT-V1.md:142-152` descreve execução histórica de 66 verificações com PG16 descartável, mas esse registro não é uma suíte atual para revalidar os novos achados e não pode ser interpretado como prova desta revisão. Há um **único ambiente operacional real**, não criar/usar banco de teste ou staging do projeto.

**Aceite:** criar `lib/reportes/lotes.casos.ts`, ligá-lo ao runner atual e testar SQL gerado com simulador puro + helpers/serialização + execução local de XLSX/PDF reais em arquivos na memória; matriz Lotes T01…T10 com datas limite, múltiplos depósitos, propriedade, terceiros, trânsito, estoque zero, lotes órfãos/isolamento, busca GTIN, inativos, precisão, classes, snapshots, 401/403/413/503, paginação e duas vistas. Sem afirmar prova PostgreSQL real a partir de mock. Regressões dos quatro reportes aceitos, tsc, ESLint, build.

#### LOT-R01-08 — ALTA — total geral soma quantidades de UNIDADES DE MEDIDA distintas

**Evidência:** `lotes.ts:123-155` obtém apenas `um.nombre AS unidad`, depois `:160-181` faz `SUM(fisico)`, `SUM(terceros)`, `SUM(disponible)` de **todos os lotes/produtos** sem particionar por `unidad_medida_id`; `page.tsx:108-118,244-253` exibe números como “Físico propio”, “Terceros”, “TOTAL GENERAL”; `export-lotes.ts:54-74` repete no PDF/XLSX. Exemplo lógico: 10 kg + 7 cajas = 17 “físico propio”, operação semanticamente inválida. SIFEN tem descrições homônimas (87/108 Metros), portanto agrupar por texto também seria incorreto. O problema permanece mesmo que `float8` seja eliminado.

**Aceite:** agrupar quantidades por `unidades_medida.id` (UUID), nunca por `nombre`, representação ou `unidad_sifen_codigo`; não emitir quantidades como total geral bruto entre unidades heterogêneas. Contar lotes por classe separadamente (contagem aditiva válida); apresentar quantidades por grupos de unidade homogênea e propriedade, ou campo global `n/a` com detalhamento inequívoco. Aplicar a mesma semântica em cards, notas, duas vistas, XLSX/PDF e contrato da API. Não mexer no cadastro fiscal nem na decisão 108/MT. Testes 10 kg + 7 cajas, 2 unidades homônimas/UUIDs diferentes, lotes entre depósitos e múltiplos terceiros.

#### LOT-R01-09 — MÉDIA — filtro `SIN saldo` classifica falsamente um lote com saldo em outro depósito autorizado

**Evidência:** `lotes.ts:101-105,123-155` filtra `(fisico+terceros)=0` **na linha `base` (lote×depósito)**, antes de agregar `lot`. Sem filtro de depósito, um lote com 7 em A e linha `stock_saldos` com zero em B entra em `SIN` apenas por B e aparece como lote “sem saldo”, embora tenha 7 em A. A migration `NEX-009:42,51` permite quantidade zero, e rotina de Movimientos materializa linhas zero. No consolidado por lote o significado da existência deve ser aplicado ao saldo agregado dentro de TODOS os depósitos permitidos; em vista por depósito, sem filtro explícito, convém que `SIN` seja definido de modo consistente e avisado. Com depósito explícito, saldo zero local pode legitimamente ser exibido como tal, sem fingir que todo o lote está zerado.

**Aceite:** distinguir claramente `existencia` do LOTE consolidado (CON/SIN calculado sobre soma autorizada por lote) da existência por depósito quando explicitamente filtrado; não usar linha zero para marcar lote inteiro sem saldo. Vistas, indicadores, títulos, filtros e exports devem declarar a semântica escolhida. Testar lote 7 em A/0 em B, filtro depósito B, lotes inteiramente zerados, sem saldo registrado, e terceiros em estados diferentes.

### Plano de implementação autorizado — escopo apenas do relatório 5

**Ordem sugerida:** A) isolar consultas e snapshot de alcance, classes, linhas e totais; eliminar `float8` em toda a cadeia; B) corrigir escopo dos lotes órfãos/inativos, existência e agrupar unidades físicas; C) normalizar filtros/GTIN e UI, permissão/validação; D) suíte Lotes e exportadores/compatibilidade. Claude deve ler protocolos e progresso, confrontar os achados com código atual **antes** de editar e reportar divergência fundamentada, **não** presumir alteração no banco real. Nenhuma migration parece necessária pelos arquivos disponíveis; se for indispensável, versionar incrementalmente e **nunca aplicar**. Preservar motor de Movimientos, estoque operacional, NEX-009/NEX-014/NEX-039/NEX-043/NEX-052, o código fiscal SIFEN 108 e os **4 reportes aceitos**. Não editar documentos `AUD-*`; atualização de progresso pertinente somente após implementação. Testes locais / tsc / eslint / build, commit/push na branch oficial, entregar SHA e PARAR para reauditoria ChatGPT, sem VM/PG real/Docker/deploy.

### Veredito AUD-LOT-R01

**NÃO CONFORME / SEM ACEITE TÉCNICO ESTÁTICO.** Nove achados confirmados por inspeção do código, quatro classificados ALTOS (LOT-R01-01, 02, 03, 08) e cinco MÉDIOS (04, 05, 06, 07, 09). Não afirmar ocorrência de incidente real, regressão em ambiente operacional ou execução de testes. Os demais 4/5 reportes mantêm aceite estático. Responsável conserva execução e validação no **único ambiente real**; nenhuma homologação concedida.


## AUD-LOT-R02 — reauditoria do commit 8dfe29f (13/10/2026)

**Commit funcional revisado:** `8dfe29f19c5b3bee398802a9e976a10aed30fbe5` (`feature/NEXIT-2026-001-banco-demo`, HEAD no início desta revisão). **Contexto:** `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, progresso pertinente e a AUD-LOT-R01 consultados no GitHub. **Arquivos inspecionados:** commit/diff completo; `lib/reportes/{lotes,lotes-plan,cliente-lotes,export-lotes,lotes.casos,guard,snapshot,alcance,formato,export}.ts`, `app/(private)/reportes/lotes/page.tsx`, `app/api/reportes/lotes/{route,exportar/route}.ts`, `types/reportes.ts`, `scripts/casos-clientes/run.js`, `NEX-007-productos.sql`, `NEX-009-inventario-costos.sql`. Revisão estática seletiva, **sem executar PostgreSQL real, migrations, VM, Docker, deploy, navegador ou testes de integração pelo ChatGPT**. Claude **relatou** 3.042 verificações/0 falhas (+70), TypeScript, ESLint dos arquivos alterados e `next build` aprovados; isso **não foi reproduzido independentemente**. Testes Lotes usam emulador de semântica: **não executam o SQL literal em PostgreSQL**; algumas asserções apenas checam trechos textuais.

### Revalidação dos nove achados anteriores

| Achado | Parecer estático | Evidência |
|---|---|---|
| `LOT-R01-01` precisão `numeric` | **CORRIGIDO** | `lotes.ts:192-213,229-251` obtém `numeric::text`; `types/reportes.ts:487-545` usa strings; `page.tsx:19-20,140-150,250-268,309-312`, `export-lotes.ts:42-53,57-96` preservam/formatam texto numérico e `celdaXlsx` mantém >15 dígitos como texto. `Number` só em `dias`/horizonte, não quantidades. |
| `LOT-R01-02` snapshot | **CORRIGIDO ESTATICAMENTE** | `lotes.ts:99-115,118-264` usa `conSnapshotLectura` para alcance, catálogo, agregações, linhas, carimbo temporal, com `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`/`COMMIT/ROLLBACK/release` em `snapshot.ts:12-34`. |
| `LOT-R01-03` escopo de órfãos | **CORRIGIDO ESTATICAMENTE** | `lotes.ts:100-115` retorna sem linhas/metadados de lotes se não há depósitos; `:117-121,178-180` permite lotes globalmente sem saldo apenas sob `alcance_depositos=TODOS` sem filtro de depósito, ainda com `l.empresa_id=$1`. Não presume dados operacionais presentes. |
| `LOT-R01-04` depósitos inativos | **CORRIGIDO** | `depositosDelAlcance` em `lotes.ts:100`, `alcance.ts:9-18` inclui ativos/inativos autorizados; `lotes.ts:159,248` marca; `page.tsx:187-191,303-305` e `export-lotes.ts:12-17,42-49` rotulam. |
| `LOT-R01-05` interface/filtros/permissões | **PARCIALMENTE CORRIGIDO, 2 pendências R02** | `cliente-lotes.ts:20-40` valida forma/HTTP em retorno 200 e expressa erro; `page.tsx:50-95,125-136,277-285` implementa compuerta, resposta vigente, retry e `permisos.exportar` (backend revalida permissão). **Ver R02-01/02.** |
| `LOT-R01-06` GTIN | **CORRIGIDO ESTATICAMENTE** | `lotes.ts:84-85,124-129` usa `EXISTS` parametrizado em `producto_codigos` por empresa/produto/tipos; `NEX-007-productos.sql:76-95` confirma `tipo/codigo`. |
| `LOT-R01-07` regressões | **CORRIGIDO (infraestrutura)** | `lib/reportes/lotes.casos.ts` contém LOT-T01…T10 (simulação, helpers e XLSX/PDF local), agora incluído em `scripts/casos-clientes/run.js`; **não substitui PG real**. |
| `LOT-R01-08` unidades heterogêneas | **CORRIGIDO ESTATICAMENTE** | `lotes.ts:184-225` totaliza por `unidad_id` UUID, `types/reportes.ts:517-545` preserva quantidade por unidade; `page.tsx:140-150,250-274` e `export-lotes.ts:57-95` mostram contagem aditiva de lotes, mas não somam quantidade entre unidades. `SIFEN 108/MT` inalterado. |
| `LOT-R01-09` existência por lote | **CORRIGIDO NO SQL/CONTRATO ESTÁTICO** | `lotes.ts:135-139,180-190` faz CTE `ex` sobre `base` (soma por `lote_id` dos depósitos autorizados) e somente então `fil WHERE ex.saldo=0` para `SIN`; `DEPOSITO` explícito restringe `par` e `base` ao depósito selecionado. `lotes.casos.ts:366-389` ensaia 7 no depósito A e 0 no B, mas simulador modela algoritmo independentemente, e a verificação de SQL é estrutural. |

### NOVO `LOT-R02-01` — MÉDIA — data inválida causa exceção no validador do cliente e interrompe consulta

**Evidência:** `lib/reportes/lotes-plan.ts:23` declara `fechaValida = v === "" || (FECHA.test(v) && new Date(...).toISOString().slice(0,10) === v)`. Uma data bem formada lexicalmente mas inexistente como `2026-13-01` passa `FECHA`, cria `Invalid Date` e `toISOString()` lança `RangeError: Invalid time value`, comprovado em JavaScript/Node no âmbito desta auditoria (sem dependência PostgreSQL). `validarFiltrosLotes` chama `fechaValida` (`:26-29`) e `pedirLotes` chama `validarFiltrosLotes` ANTES do seu `try` de rede (`cliente-lotes.ts:21-29`); portanto, para filtros inválidos passados por API do cliente, a função **rejeita a Promise** em vez de devolver `{datos:null,error}`. `page.tsx:50-64` não tem `try/finally` em `cargar`: pode deixar `cargando=true`, sem mensagem/retry. Inputs nativos `type=date` mitigam casos de digitação, mas **não eliminam o defeito de contrato** do helper nem entradas programáticas. Teste LOT-T10 cobre `2026-02-30` (Date é normalizado), mas não mês 13 ou dia impossível que produz `Invalid Date`.

**Aceite:** validar `Date.getTime()` ou `Number.isNaN(Date.parse(...))` ANTES de `toISOString`; assegurar resultado total/sem throws em `validarFiltrosLotes` e `pedirLotes`, e recuperação em `cargar` mesmo ante erro inesperado. Regressão com `2026-13-01`, `2026-99-99`, `2026-02-30`, intervalo invertido e valor vazio; nenhuma chamada HTTP, erro legível, sem spinner permanente.

### NOVO `LOT-R02-02` — MÉDIA — horizonte digitado inválido pode disparar busca com valor antigo

**Evidência direta do fluxo React:** `page.tsx:39-48` computa `hz = validarHorizonteTexto(horizonteTxt)` e agenda `setTextoAplicado(a => ({ q, lote, horizonte: hz.valor ?? a.horizonte }))` **mesmo quando `hz.valor===null`**. Essa função sempre cria **objeto novo**, inclusive sem qualquer alteração efetiva dos filtros. Como `aplicados=useMemo(...[filtros,textoAplicado])`, após 300 ms o objeto novo atualiza `aplicados`, recria `cargar` (`:50-64`) e dispara `pedirLotes(aplicados,pagina)` no efeito (`:66-74`) **com o horizonte anterior válido**, enquanto o campo visível está inválido. `:81-83` apenas oculta `actual` via `!hz.error`; **não impede a requisição divergente**. Da mesma forma, mudar outro seletor com horizonte inválido dispara chamada com o valor antigo. O teste LOT-T10 `:432-436,459-462` verifica `pedirLotes` com um `f.horizonte` inválido e a **presença textual** de validação na página, mas não exercita esse ciclo React. Não afirmar que o usuário vê saldo antigo (a renderização já o oculta corretamente); o achado é a **requisição indevida, trabalho e contrato de filtro divergente**.

**Aceite:** inibir a solicitação no efeito quando `hz.error` ou validação de intervalo seja inválida, e garantir que `cargando` não fique preso; não chamar `setTextoAplicado` com objeto novo de valores idênticos, nem aplicar horizonte inválido silenciosamente. Quando o campo ficar válido, aplicar o valor **efetivamente mostrado** e voltar à página 1. Testar comportamento real do controlador/efeitos com instrumentação de requisições ou helper extraído puro, para horizonte `abc`, vazio, negativo, `3651`, mudança de depósito enquanto horizonte inválido e correção posterior. Preservar segurança do servidor e a compuerta de respostas.

### Veredito AUD-LOT-R02

**NOVE R01 materialmente corrigidos no escopo estático, com R01-05 incompleto** no tratamento de filtros inválidos. **SEM ACEITE TÉCNICO ESTÁTICO FINAL ainda**, somente duas pendências MÉDIAS (`LOT-R02-01/02`) na validação e no acionamento de consultas do cliente. Não reabrir SQL de inventário, agrupamento por UUID, snapshot, XLSX/PDF ou motor sem novo defeito concreto. Nada **HOMOLOGADO**: não foram executados PostgreSQL real, navegador, VM, Docker ou deploy. Claude deve corrigir os itens somente após autorização do responsável, publicar commit e parar para reauditoria do ChatGPT.
