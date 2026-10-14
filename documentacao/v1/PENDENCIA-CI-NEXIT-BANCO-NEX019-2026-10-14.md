# Pendência de CI — workflow `nexit-banco-ci`, execução 38579656906 (14/10/2026)

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
