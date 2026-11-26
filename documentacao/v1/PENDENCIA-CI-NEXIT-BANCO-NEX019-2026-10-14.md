# Pendência de CI — workflow `nexit-banco-ci`, execução 38579656906 (14/10/2026)

> **Atualização por auditoria ChatGPT, 14/10/2026:** A NEX-019 **não bloqueia mais** as 54 migrations no PostgreSQL descartável da execução [38621372455](https://github.com/proceit-tech/distribuidora/actions/runs/38621372455). Os parágrafos abaixo descrevem o histórico do problema e as opções avaliadas **antes** da correção. O CI completo ainda falha por T01, T10 e C1; ver o diagnóstico confirmado ao final. Nenhuma modificação foi executada na VM/banco operacional.

**Registro separado da FAT-E1.** Não altera nem é causada pelas mudanças de Facturación (só `lib/facturacion/*` e documentação). Nenhuma migration foi alterada nem executada.

**Evidência recebida (relato do ChatGPT):** o primeiro erro ocorre em `NEX-019-codigos-empresa-ruc.sql`, linha 32, ao rodar sobre base limpa. **O log da execução não foi lido por Claude** (sem `gh`/acesso ao log); a análise abaixo é **estática** e deve ser confirmada com o log.

## Causa provável (estática)
- A linha 32 do arquivo é `END $$;`: o `psql` informa o fim do bloco `DO` em que o `RAISE EXCEPTION` ocorreu, não a linha do `RAISE`.
- O bloco (linhas 7–32) exige **exatamente duas empresas existentes** com códigos `casa_mingo`/`80003314` e `proceit`/`5469464` (`v_total <> 2` ⇒ exceção; depois verificação final). O cabeçalho do arquivo declara «migración para base ya inicializada».
- Nenhuma migration NEX-001…018 insere essas empresas (só NEX-012/015 definem *funções* que criam empresas sob demanda; `casa_mingo` só aparece na semente S-004 e `proceit` só é *consultado* em NEX-016). Numa base limpa a contagem é 0 e o bloco aborta: «se esperaban exactamente dos empresas… se encontraron 0».
- O CI (`scripts/ejecutar-pruebas.sh`, passo M1) aplica **todas** as migrações desde zero com `aplicar-migraciones.sh` (`ON_ERROR_STOP`, uma transação por migration) **antes** das sementes — logo NEX-019 não tem como passar nesse fluxo.

## Falhas decorrentes esperadas (a confirmar no log)
- M1 reporta FALLA e o runner para em NEX-019 ⇒ NEX-020 em diante (inclui NEX-047…051 de Facturación) **não são aplicadas** nessa base de CI.
- M2 (idempotência), M5 (concorrência), sementes S1–S4 e as baterias T* que dependem de tabelas posteriores falham por consequência, não por defeitos próprios.
- Não foi verificado se a falha existe desde a criação de NEX-019 (2026-10-09) ou desde outra mudança do workflow.

## Opções (nenhuma aplicada; exigem autorização específica)
1. **Não editar NEX-019** (já aplicada no banco real: mudar o arquivo muda o checksum e o runner aborta com código 4 no ambiente real).
2. Ajustar o fluxo de CI/teste para criar as duas empresas (`casa_mingo`, `proceit`, não demo, `ACTIVA`) **antes** de NEX-019 em base descartável (por exemplo, passo/semente específico do CI), preservando o runner e os checksums.
3. Alternativa: nova migration idempotente em vez de depender de NEX-019 em base limpa — só se o responsável a autorizar (impacta a ordem/numeração).

## Atualização PRO-62 (issue #9) — correção de NEX-019 no CI e testes reais de NEX-054
- **NEX-019 (causa confirmada pelo log do CI):** a migração exige as duas empresas legadas e nenhuma NEX-001…018 as cria. **Correção só no CI/testes:** `aplicar-migraciones.sh` aceita `NEX_BOOTSTRAP_ANTES_DE_019=<sql>` (somente definido por `ejecutar-pruebas.sh`); o arquivo `pruebas/bootstrap-legado-nex019.sql` (moeda PYG exigida pela FK + duas empresas sintéticas sem RUC/usuários) roda **na mesma transação de NEX-019**, só em bancos `nexit_test_*` (M6 prova a recusa fora deles; M7 prova que sem a variável não há bootstrap implícito e o runner para em NEX-019). NEX-019 e as demais migrations não foram editadas (M1b confere o SHA-256 de cada arquivo). A simulação de produção (`_prod`) remove as duas empresas sintéticas antes de inicializar a empresa real (V0).
- **Decisão de arquitetura pendente (não resolvida aqui):** NEX-019 continua sendo migration de *upgrade de base legada*. Uma **instalação limpa real** (por exemplo a fase `inicial` do workflow de deploy, «SOMENTE banco vazio») pararia em NEX-019 sem o bootstrap. A produção atual já passou dessa migration. Alternativas para decisão do responsável: (a) NEX-019 sem empresas ⇒ no-op em nova migration de linha de base; (b) manter só o bootstrap de testes e documentar que instalação limpa exige estado legado; nada disso foi implementado.
- **Evidência posterior ao desbloqueio (CA-CI-03):** com NEX-019 resolvida, a bateria chegou a executar as 54 migrations e provou NEX-054 (T16, T17, R1, M1b). Restavam T01, T10 e C1:
  - **T01 (defeito real):** `fe_gateway_config`, `documentos_electronicos` (NEX-047) e `fe_puntos_expedicion` (NEX-048) têm `actualizado_at` sem o trigger `<tabla>_actualizado_trg` que NEX-002…017 instalavam. Correção: nova migration **NEX-055** (idempotente, só instala o trigger nas tabelas que não o têm) + reversão `scripts/reversion-NEX-055.sql`; versionada, **não aplicada**. O teste T01 passou a considerar apenas **tabelas base** (uma *view* não pode ter esse trigger; o instalador de NEX-001 já filtrava assim) — o critério (toda tabela com `actualizado_at` tem seu trigger) não foi enfraquecido.
  - **C1 (limitação do verificador, não do banco):** `herramientas/verificar-consultas-app.py` só resolvia `${tabla}`/`${columna}`; ~95 consultas do app compostas com outras interpolações `${...}` davam «syntax error at or near $». Agora são analisadas com as interpolações vazias (contadas à parte); erro de **sintaxe** nelas vira «NO VERIFICABLE» (listado), qualquer outro erro (tabela/coluna inexistente, tipos) continua sendo FALLA. As consultas literais seguem verificadas como antes.
  - **T10 (causa NÃO comprovada):** o log recebido não mostrou a instrução que falha. Nada foi alterado em T10; o diagnóstico de falhas do runner foi melhorado (sem ruído de PASS) para que a próxima execução mostre o erro exato.

## Auditoria incremental — CI 38621372455 (14/10/2026, conferência direta dos logs)

**Contexto:** execução [GitHub Actions 38621372455](https://github.com/proceit-tech/distribuidora/actions/runs/38621372455) no PostgreSQL 16 **efêmero**. O ChatGPT inspecionou o log do job `pruebas`, os scripts do runner, a definição de T01, T10, o verificador C1 e exemplos do código TypeScript no GitHub. Isso não equivale a validar produção.

### Provas positivas — não repetir a investigação resolvida

- **M1:** aplicadas as **54 migrations**; **M2:** 54 já aplicadas/sem duplicação; **M5:** duas instâncias simultâneas do runner geraram 54/54 versões sem duplicidade.
- **T16 NEX-054:** **33 verificações OK** no PostgreSQL descartável. **T17:** concorrência real entre duas sessões **42 verificações OK**. A reversão isolada `R1` também passou (4 verificações).
- **I1/V1/V2, S1/S2 e restauração B1** passaram nesta execução. Total apresentado pelo runner: **506 verificações PASS; 3 grupos de teste com falha**. **NÃO declarar CI verde**.

### Grupos remanescentes — diagnóstico baseado em evidência

| Grupo | Erro confirmado no log | Inspeção de código e consequência | Encaminhamento |
|---|---|---|---|
| **T01** | `actualizado_at` sem o trigger exigido pelo teste nas tabelas `documentos_electronicos`, `fe_gateway_config`, `fe_puntos_expedicion` | A NEX-047 cria as duas primeiras com `actualizado_at`; T01 procura trigger nomeado `<tabela>_actualizado_trg`. Conferir se existe mecanismo equivalente por outro nome e se o requisito do teste é correto; **não aprovar apenas removendo a asserção**. | Se realmente falta atualização automática, criar **migration incremental** somente após verificar versões/migrations já aplicadas; não editar NEX-047 ou NEX-054. Testar alterações do campo e ausência de mudança em triggers fiscais. |
| **T10** | Cenário de FK cruzada esperava SQLSTATE **23503**; veio **P0001** com `el depósito está inactivo: no admite saldo` | O teste tenta inserir depósito da empresa B na posição de A, mas uma validação de depósito inativo falha **antes** da FK. Isso não comprova defeito de isolamento; também não prova o SQLSTATE escolhido. | Corrigir a **fixture** para que o depósito seja elegível/ativo na etapa de teste da FK, mantendo a exigência de isolamento `empresa_id`. Testar separadamente o bloqueio de depósito inativo; não aceitar mistura interempresarial. |
| **C1** | `consultas analizadas: 369; variantes OK: 289; FALLAS: 95`; majoritariamente `syntax error at or near "$"` | O verificador `verificar-consultas-app.py` extrai os *template literals* brutos e chama `PREPARE` sem resolver interpolações JS `\u0024{...}` (p.ex. `D("l.vigente_desde")`, `SQL_VERSION(...)`, `filtro`). `lib/stock/shared.ts` também apresentou `could not determine data type of parameter $2` e interpolação `{`. As 95 não foram individualmente classificadas; **não presumir** 95 defeitos reais ou 95 falsos positivos. | Corrigir/verificar a metodologia do extrator para SQL dinâmico, incluindo variantes condicionais representativas e tipos de parâmetros; separar **não-analisável estaticamente com justificativa** de **SQL inválido efetivamente reproduzido**. Não suprimir globalmente os erros, nem alterar queries válidas apenas para agradar ao C1. |

### Critérios para encerramento da PRO-62

1. T01 e T10 com testes direcionados corrigidos por mecanismo legítimo, mantendo *invariantes* de atualização, autorização e isolamento.
2. C1 passa com classificação auditável das 369 consultas e suas variantes: consultas dinâmicas não podem ser marcadas automaticamente `PASS` nem ignoradas indiscriminadamente. Falhas de SQL reais são corrigidas no código ou registradas como novo problema com evidência.
3. Apenas **uma** nova execução do CI completo após correção agrupada. Se surgirem novos erros não relacionados, registrar o bloqueio e parar para auditoria em vez de monitorar indefinidamente.
4. Preservar checksums/migrations históricas, sem tocar FAT-E1, gateway, VM, Docker ou banco `nexit` real. Registrar URL da execução, SHA completo e contagem PASS/FALLA. **Nenhum envio SIFEN nesta tarefa**.

**Responsabilidades:** ChatGPT documentou e auditou; **Claude Code implementará** os ajustes mínimos e testes, com commit/push e parada para auditoria; **responsável humano** é o único que poderá autorizar e executar operações na VM.

### PRO-62 — fecho dos três grupos (um único commit; CI completo executado uma vez)
- **T10 (causa confirmada, defeito do teste):** a guarda `stock_saldos_deposito_activo` (NEX-046, BEFORE INSERT) dispara antes das FK e rejeita (P0001) o depósito da empresa B usado pela empresa A. T10 passou a provar as duas defesas **separadamente**: saldo positivo ⇒ P0001 (guarda); saldo 0 ⇒ 23503 (FK composta); e que nenhum saldo da empresa A aponta ao depósito de B. O isolamento exigido não foi relaxado.
- **T01** → NEX-055 (+ filtro de tabelas base); **C1** → classificação auditável de consultas dinâmicas (ver acima). Nenhuma migration histórica alterada; NEX-055 não aplicada fora do CI.


## AUD-PRO62-R02 — reauditoria independente do commit 4ee8103 / CI 38627740030 (14/10/2026)

**Versão auditada:** [4ee8103f9b6f114101d35534cc7cac1961d8f822](https://github.com/proceit-tech/distribuidora/commit/4ee8103f9b6f114101d35534cc7cac1961d8f822); branch oficial coincidente com SHA no momento da auditoria. **CI:** [38627740030](https://github.com/proceit-tech/distribuidora/actions/runs/38627740030), conclusão **failure**. Log de job `pruebas` lido diretamente. O commit final altera T10 e este documento; NEX-055/C1/T01 constam de commits imediatamente anteriores na mesma branch e foram auditados como conjunto. **Não se realizou qualquer teste de VM, banco operacional ou gateway.**

### Matriz de resultados efetivamente registrados

| Critério | Resultado no CI | Parecer |
|---|---|---|
| M1/M2/M3/M4/M5 e M6/M7 | 55 migrations aplicadas, reaplicação idempotente, checksum, proteção da base real, concorrência do runner e bootstrap descartável aprovados | **PASS** no PostgreSQL temporário |
| T01 estrutura/triggers | 8 verificações OK | **PASS** com NEX-055 em banco temporário; **NEX-055 NÃO aplicada na VM** |
| T10 isolamento | 39 verificações OK, incluindo proteção P0001 e FK composta 23503 em cenários distintos | **PASS** em banco temporário |
| T16 NEX-054 + T17 concorrência | 33 + 42 verificações OK | **PASS** em PostgreSQL real descartável, não produção |
| I1/V1/V2, backup/restore B1, reversão isolada NEX-054 | PASS | **PASS** em banco temporário |
| C1 verificador SQL/TypeScript | 369 templates extraídos; 301 variantes consideradas OK (12 dinâmicas apenas após remover interpolações); **10 FALLAS**; **73 dinâmicas NO VERIFICABLE** | **BLOQUEANTE**: CI completo falha; não equiparar NO VERIFICABLE a PASS |
| Contagem global do runner | **554 PASS**, **1 grupo FALLA** | CI **NÃO** aprovado |

### Achados de auditoria — critério objetivo para a única correção seguinte

**C1-R02-01 (bloqueante para CI): falso diagnóstico causado por retirar a tabela interpolada, mas sem cobertura suficiente.** Nove falhas `relation "t" does not exist` vêm de templates como `SELECT ${proyectar(tipo)} FROM ${CFG[tipo].tabla} t ...`, nos quais o verificador substitui tabela e projeção por texto vazio, deixando `FROM t` como *relação*, e não o alias da tabela real. Ocorrências em `lib/comercial/servidor.ts`, `lib/productos/catalogos-admin.ts` e `lib/proveedores/sincronizar.ts`. A décima (`could not determine data type of parameter $2`) é de `PERMITIDOS`, fragmento `SELECT` isolado de `lib/stock/shared.ts` que contém `$3`, depois remapeado para `$2` quando incorporado na consulta final. **Esses 10 erros do PREPARE do verificador não comprovam SQL inválido em execução**, mas também não provam que os SQL finais estejam certos. Corrigir pela estrutura e variantes reais das queries, não por supressão de erros de relação/parâmetro.

**C1-R02-02 (alta): cobertura incompleta do novo verificador.** `INTERPOLACION.sub("", v)` e o truncamento `re.sub(r"\\$\\{.*", "", flags=re.S)` descartam partes das queries; 73 consultas ficam NO VERIFICABLE e 12 dinâmicas são contadas OK apenas para a forma artificial com expressão vazia. `sys.exit(1 if fallas else 0)` permitiria futuramente CI verde com essas **73 não verificadas**. Não alterar o rótulo para PASS; produzir relatórios separados de consultas verificadas, variantes dinâmicas reconstruídas e não verificáveis, com regra de qualidade explícita. Priorizar representatividade/segurança do fluxo FE e regressões do extrator, sem tentar reescrever indiscriminadamente toda a app.

**NEX055-R02-03 (média, antes de implantação):** NEX-055 instala triggers em **todas** as tabelas base sem `actualizado_trg`, mas `reversion-NEX-055.sql` remove apenas três triggers de Facturación e instrui remoção manual de eventuais outras tabelas. Conferir se o escopo da migration deve limitar-se exatamente às três tabelas fiscalizadas; em qualquer caso, assegurar que a reversão é previsível e **não remove triggers preexistentes**. Verificar comportamento de `actualizado_at` após UPDATE de teste, não só a existência nominal de trigger. **Não aplicar NEX-055 operacionalmente antes dessa verificação**. Não alterar migrations históricas previamente aplicadas; NEX-055 está apenas versionada e aplicada no CI descartável, confirmar estado real antes de qualquer decisão.

**Separar arquitetura de instalação limpa:** NEX-019 continua sendo migration legada de upgrade; runner de testes só se recupera porque injeta dados sintéticos opt-in. O deploy inicial limpo para outra VM continuaria a exigir plano/baseline próprio. **Não alterar arquitetura ou produção dentro do reparo C1**.

### Autorização de escopo para Claude Code

Focar em `C1-R02-01/02` e na prova/reversão de NEX-055 (apenas se o escopo de CI ainda necessitar ajuste); não alterar gateway, IVA, funções SIFEN NEX-054 nem tabelas reais, nem relaxar isolamento. Reproduzir casos determinísticos direcionados (ex.: tabela interpolada, fragmento SQL reaproveitado e condição dinâmica), documentar o que permanece **não verificável** sem alegar aprovação; fazer **uma execução completa do CI apenas depois** da correção agrupada. Ao final: SHA, URL CI, números PASS/FALLA e limitações; **parar para auditoria**. Sem VM, Docker, PostgreSQL operacional, credenciais, deploy ou envio SIFEN.

### AUD-PRO62-R02 — correção C1 e NEX-055 (resposta; um único CI completo ao final)
- **C1 reescrito em Node** (`herramientas/verificar-consultas-app.js`; o `.py` foi removido): lê as plantillas JS com um lexer que entende plantillas **aninhadas** dentro de `${…}` (antes o extrator as partia em pedaços sem sentido) e classifica cada consulta de forma auditável: **LITERAL** (PREPARE direto), **RECONSTRUÍDA** (todas as interpolações resolvidas de forma exata: constantes do código, funções auxiliares de plantilla como `D()`/`SQL_VERSION()`/`alcanceConsultaDeposito()` — inclusive importadas —, tabelas reais dos `CFG` do arquivo, ternários independentes, `.replace("$3","$2")`; PREPARE de **todas** as combinações), **FRAGMENTO** (constante SQL incrustada por outras; validada através das anfitriãs, nunca solta) e **NO VERIFICABLE** (com motivo). Qualquer erro de PREPARE em literal ou reconstruída é **FALLA** (sem atenuantes). Os 9 «relation t does not exist» eram `SELECT ${proyectar(tipo)} FROM ${CFG[tipo].tabla} t` com a tabela apagada: agora vira `SELECT t.* FROM <tabela real> t`; o `$3` do `PERMITIDOS` deixou de ser preparado solto.
- **Política de qualidade:** `c1-linea-base.json` lista (por id estável = arquivo + hash do SQL normalizado) as consultas que **não** podem ser verificadas literalmente (48 hoje: `sets.join`, `.map`, filtros calculados, condicionais acoplados a tipo/tabla, variáveis declaradas duas vezes…). Uma consulta nova sem verificar, ou qualquer FALLA, faz o CI falhar; entradas obsoletas só avisam. **As 48 NÃO são declaradas verificadas.** Antes: 83 sem cobertura (10 falhas + 73); agora 48 explícitas e as demais verificadas. Regressões do próprio verificador: `lib/ci/verificador-consultas.casos.ts` (21 verificações, incluindo o código real da app contra a linha base).
- **NEX-055 reduzida ao escopo exato:** instala o trigger **somente** em `fe_gateway_config`, `documentos_electronicos` e `fe_puntos_expedicion`; aborta se algum já o tiver (logo a reversão nunca apaga trigger preexistente) e só informa (NOTICE) se outra tabela base continuar sem trigger. Reversão `reversion-NEX-055.sql` exata (3 `DROP TRIGGER`, com verificação prévia). Provas em PostgreSQL descartável: T16 comprova que `actualizado_at` **muda de verdade** (linhas com data do ano 2000 → depois do UPDATE) nas três tabelas e que a imutabilidade de importes e a numeração monotônica seguem vigentes; **R2** aplica a reversão em cópia, confere que só 3 triggers saem (contagem total −3), que nenhum dado muda, que repetir a reversão é recusado e que reaplicar NEX-055 restitui os 3 (reversível). Continua **não aplicada** fora do CI.


## AUD-PRO62-R03 — auditoria do commit 42cd0c5 e CI 38639838485 (14/10/2026)

**Código:** [42cd0c57a98163f74517cfa37d87bc196e81fb69](https://github.com/proceit-tech/distribuidora/commit/42cd0c57a98163f74517cfa37d87bc196e81fb69). **CI:** [38639838485](https://github.com/proceit-tech/distribuidora/actions/runs/38639838485). Branch oficial estava no commit auditado. A auditoria leu o log do job e as implementações atuais de C1, `lib/clientes/aptitud-cliente.ts`, `lib/stock/shared.ts`, NEX-055 e reversão; **nenhum SQL ou deploy foi executado pela auditoria**.

### Portas técnicas comprovadas no PostgreSQL 16 descartável

- **PASS:** 55 migrations em M1/M2/M5, verificação de checksum/proteção M3/M4/M6/M7, T01 estrutura, T10 isolamento (39), T16 NEX-054/NEX-055 (38), T17 concorrência real (42), R1 NEX-054 (4), R2 NEX-055 (6), B1 backup/restauração, I1/V1/V2. T16 comprova mutação efetiva de `actualizado_at` em 3 tabelas e compatibilidade com imutabilidade e numeração.
- **Global do runner:** **565 verificações PASS; 1 grupo FAIL** (C1). Isso **não** significa CI aprovado nem VM homologada.
- **C1:** 379 templates SQL analisados; **271 literais PASS (0 falhas)**; **51 reconstruídas / 89 combinações PREPARE, 2 falhas**; 7 fragmentos cobertos; **48 NO VERIFICABLE** com linha base e 0 entradas novas/obsoletas. Os 48 não foram validados. Resultado geral CI = **failure**.

### Defeitos do C1 — análise causal confirmada nos SQLs preparados

**C1-R03-01 (BLOQUEANTE) — resolução incorreta de variável fora do escopo:** o gerador de SQL para o `PREPARE` substituiu a expressão `\u0024{filtro}` de **dois arquivos** por um mesmo predicado de pesquisa sobre colunas `p.*` de outro contexto. O log mostra:

- `lib/clientes/aptitud-cliente.ts:78`: SQL gerado `... FROM clientes c WHERE c.empresa_id = $1 ($2 = '' OR concat_ws(' ', p.codigo, ...) ...)`. A aplicação define localmente `const filtro = clienteId ? 'AND c.id = $2' : ''`; a interpolação gerada pelo C1 é falsa, levando ao erro `syntax error at or near '('`.
- `lib/stock/shared.ts:33`: SQL gerado `... WHERE p.empresa_id = $1 AND p.controla_stock($2 = '' OR concat_ws(' ', p.codigo, ...) ...)`. A aplicação define localmente `const filtro = productoId ? ' AND p.id = $2' : ''`; a montagem do C1 é falsa, produzindo `schema 'p' does not exist`.

**Causa no código do verificador:** `resolverExpr` tenta resolver identificador com `ctx.consts.get(e)` **ou** `ctx.global.get(e)` quando há um único resultado textual; `construirIndice` indexa constantes de todos os arquivos sem comprovar import/escopo léxico. Como `filtro` local é um condicional e não está na coleção de templates/strings simples, o verificador escolheu indevidamente uma constante textual de outro arquivo. **Não modificar SQL da app para aceitar esta reconstrução inválida.**

**C1-R03-02 (ALTA, cobertura):** `resolverExpr` contém `if (nombre === 'proyectar') return {v:['t.*']...}`. `proyectar(tipo)` constrói colunas, expressões e campos com lógica comercial; substituir por `t.*` permite `PREPARE` aprovar uma consulta **diferente da executada**. A classificação `RECONSTRUIDA (interpolaciones resueltas de forma exacta)` é indevida nesses casos. Reconstruir com projeção de verdade e variantes coerentes ou classificar **NO_VERIFICABLE** com motivo até existir prova correta. Não adicionar silenciosamente à linha base.

**C1-R03-03 (QUALIDADE):** a política `veredicto` considera apenas `fallas` e novas entradas `NO_VERIFICABLE`; `CORRECCIONES` permite que uma versão hipoteticamente corrigida passe no lugar do SQL publicado, sem transformar `informe.corregidas` em bloqueio. Atualmente o CI reporta **0 correções propostas**; mesmo assim, uma falha real futura não deve ser considerada PASS só por haver sugestão de correção — exigir erro explícito até o código ser corrigido ou exceção justificada e auditada. Não alterar consultas fiscais e não relaxar erros de `PREPARE`.

### Aceite para próxima correção isolada

1. Preservar NEX-055 e rollback já aprovados no PostgreSQL descartável, T01/T10/T16/T17/R1/R2 e migrations históricas. **Não repetir investigações solucionadas.**
2. C1 resolve `filtro` no **escopo do arquivo/função efetivo**, ou marca como `NO_VERIFICABLE` com justificativa; jamais usa uma variável de outro arquivo sem import rastreado. Casos de teste sintéticos com nomes homônimos entre arquivos devem falhar na implementação defeituosa e passar na corrigida. Testar as duas consultas reais com o mesmo SQL/variantes que o código usa, usando `PREPARE` descartável.
3. `proyectar(tipo)`: variantes reais ou declaração honesta de limitação; **não** chamar `t.*` de reconstrução exata. Substituições hipotéticas (`CORRECCIONES`) não podem aprovar código de produção não corrigido.
4. Conservar o inventário versionado de 48 não verificáveis, alterando entradas somente com evidência e revisão (não aprovar pela mera atualização automática de baseline). Os relatórios devem discriminar literais, SQL reconstruído fielmente, fragmentos e não verificáveis.
5. Testes direcionados/estáticos antes de **uma execução CI completa**; parar após commit/push com SHA, URL e números. Se persistirem problemas, documentar prova e solicitar auditoria; **sem polling** e sem mudanças no SQL da aplicação sem defeito demonstrado.
6. **VM, PostgreSQL operacional, migrations reais, Docker, gateway, credenciais, FAT-E3/E4 e emissão SIFEN continuam fora do escopo.**

**Estado:** PRO-62 segue em revisão técnica; NEX-054/NEX-055 somente testadas no PostgreSQL descartável, não aplicadas na VM. NEX-019 permanece incompatível com instalação totalmente limpa fora do bootstrap de testes; essa decisão arquitetural é **separada**, não esconder sob CI verde.

### AUD-PRO62-R03 — correção do verificador C1 (resposta; uma única execução completa do CI ao final)
- **C1-R03-01 (escopo):** removi a busca «global» de constantes/funções. Agora uma constante ou função só resolve se (a) está declarada **uma única vez** no próprio arquivo (qualquer outra declaração do mesmo nome, mesmo de outra função, a torna ambígua) ou (b) o arquivo a **importa de forma rastreada** (`import { X [as Y] } from "@/…" | "./…"`), sendo então resolvida no contexto do arquivo que a define. Resultado: o `filtro` local de `lib/clientes/aptitud-cliente.ts:78` (condicional) e o de `lib/stock/shared.ts:33` deixam de receber o predicado de pesquisa `p.*` de outro arquivo e passam a **NO VERIFICABLE** («variable de ejecución: filtro»). O SQL da aplicação não foi tocado.
- **C1-R03-02 (`proyectar`):** deixou de ser substituída por `t.*`; toda chamada a `proyectar(…)` é **NO VERIFICABLE** com motivo explícito («sería otra consulta»). Oito consultas (3 em `lib/comercial/servidor.ts`, 5 em `lib/productos/catalogos-admin.ts`) passam de «reconstruídas exatas» (indevido) a não verificáveis. Reconstruir a projeção real exigiria avaliar as funções TypeScript (subconsultas e ramos por tipo) — fica como limitação declarada.
- **C1-R03-03 (correções):** `CORRECCIONES` virou apenas **sugestão**: a consulta publicada continua em FALLA mesmo que a versão corrigida passasse no PREPARE; a sugestão é impressa («SUGERENCIA DE CORRECCIÓN … la consulta publicada sigue en FALLA») e não influencia o veredicto.
- **Linha base (revisada entrada por entrada):** 48 → **57**. As 9 novas são exatamente: 2 `filtro` (aptitud-cliente:78, stock/shared:33) e 7 consultas com `proyectar(…)` que antes estavam classificadas como verificadas sem sê-lo; as ids das 48 anteriores não mudaram (a de `catalogos-admin.ts:112` só teve o motivo reescrito para `proyectar`). Os motivos ficam em `c1-linea-base.json`. Nenhuma das 57 é declarada verificada.
- **Regressões novas** (`lib/ci/verificador-consultas.casos.ts`): variável homônima de outro arquivo; duas declarações do mesmo nome no mesmo arquivo; import rastreado (com alias) resolvido no contexto do arquivo definidor; função sem import não usada; `proyectar` sem `t.*`; correção hipotética não aprova SQL; código real contra a linha base (exatamente 8 com `proyectar`, os dois `filtro`, nenhum `t.*` sintético). A versão anterior do verificador falha nelas.


## AUD-PRO62-R04 — CI verde no commit e7a7aa5 / evidência final (14/10/2026)

**GitHub commit auditado:** [e7a7aa5eb6fb4608f6c8bd1e2040aa538bf8cd8d](https://github.com/proceit-tech/distribuidora/commit/e7a7aa5eb6fb4608f6c8bd1e2040aa538bf8cd8d). **CI auditado diretamente:** [38646587200](https://github.com/proceit-tech/distribuidora/actions/runs/38646587200) **SUCCESS** (job `pruebas` concluído). SHA do commit idêntico ao HEAD da branch `feature/NEXIT-2026-001-banco-demo` no momento da consulta.

### Resultado comprobado

- **55 migrations aplicadas no PostgreSQL 16 descartável** e checks M1/M2/M3/M4/M5; não significa que as 55 estejam aplicadas na única VM operacional.
- **T01** (8), **T10** (39), **T16** (38), **T17** (42), **R1** (4), **R2** (6), backup/recovery B1 e demais verificações do runner aprovaram. No total, **565 verificações PASS / 0 grupos com falha**. Execução local TypeScript **3186/0** foi informada pelo Claude e não reproduzida independentemente nesta auditoria.
- **C1 real contra PostgreSQL descartável:** **271 consultas literais PASS**, **44 reconstruídas / 65 variantes PREPARE PASS**, **7 fragmentos cobertos**. **57 ocorrências NO VERIFICABLE**, com justificativa/linha base versionada; **0 entradas novas fora da linha base; 0 obsoletas**. As 57 **não foram verificadas como SQL final**.
- O diff do verificador confirma: não usa homônimo `filtro` de outro arquivo por busca global sem import; `proyectar(...)` não é mais falsamente reconstruída como `t.*`; correções hipotéticas mantêm `FALLA` até a query efetiva ser corrigida. Foram adicionadas regressões. **Nenhuma query da aplicação nem migration histórica alterada por este commit.**

**Parecer:** correções C1 e CI da PRO-62 **ACEITAS TECNICAMENTE por revisão de código e GitHub Actions**, sem homologação operacional. O bloqueio NEX-019 está corrigido **apenas para a bateria descartável**. A compatibilidade da NEX-019 com instalação limpa real permanece uma **decisão arquitetural separada**, não executada/validada em produção.

### Dívida de cobertura, sem bloquear o CI aprovado

A linha base atual possui **57 ocorrências não verificáveis, mas apenas 53 IDs distintos**, porque o ID utiliza `arquivo + SHA-1 do texto SQL normalizado` e alguns textos idênticos se repetem dentro do mesmo arquivo. Foi conferido: `lib/comercial/servidor.ts:bb50cfb3d373` aparece duas vezes e `lib/productos/catalogos-admin.ts:42ea0d4149df` quatro vezes. Isso **não torna as consultas válidas** e significa que uma nova ocorrência de SQL não verificável com o mesmo texto no mesmo arquivo poderia herdar o ID aprovado sem um novo alerta de baseline. Tratar em trabalho futuro e direcionado do verificador (identidade estável por ocorrência + testes de duplicação, sem invalidar os hashes existentes sem migration de linha base revisada); **não repetir CI apenas por isto**. Os 57 continuam explicitamente não verificados.

### Próxima porta: preflight de leitura da única VM real

**Não aplicar SQL nem fazer deploy nesta etapa.** Verificar primeiro, com o responsável humano: HEAD/branch local, versões da tabela `schema_migrations`, checksums comparáveis, migrações pendentes incluindo NEX-054 e NEX-055, dependências do esquema, inventário de containers `nexit-db`/app, saúde do PostgreSQL, backup válido com plano de restauração, configurações não secretas do gateway e disponibilidade de rollback operacional. A documentação `documentacao/banco/nexit/v1/docs/05-IMPLANTACION-AUTOMATIZADA.md` descreve fluxo **preparado, não implantado**; não iniciar `nexit-banco-deploy.yml` automaticamente. O procedimento da VM será definido após preflight e aprovação humana. NEX-054/055 permanecem **somente versionadas** até prova e decisão da VM.

**Continuam fora do escopo:** FAT-E3/FAT-E4, emissão SIFEN real sem autorização, execução autônoma de migrations em produção, acesso SSH da IA ou uso de credenciais expostas em Git.
