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
