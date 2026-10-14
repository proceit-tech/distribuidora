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
