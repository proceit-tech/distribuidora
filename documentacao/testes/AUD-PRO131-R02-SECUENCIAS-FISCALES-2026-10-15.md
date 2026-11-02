# AUD-PRO131-R02 — Reauditoria NEX-060 (numeração por tipo documental)

**Analista:** ChatGPT · **Executor:** Claude Code · **Commit revisado:** [`894d3df0b69a84d20a7dcfa3f6d5456faa6c1cdf`](https://github.com/proceit-tech/distribuidora/commit/894d3df0b69a84d20a7dcfa3f6d5456faa6c1cdf)  
**Branch:** `feature/NEXIT-2026-001-banco-demo` · **Linear:** [PRO-131](https://linear.app/proceit/issue/PRO-131) · **GitHub:** [issue #11](https://github.com/proceit-tech/distribuidora/issues/11)  
**Anterior:** [AUD-PRO131-R01](https://github.com/proceit-tech/distribuidora/blob/feature/NEXIT-2026-001-banco-demo/documentacao/testes/AUD-PRO131-R01-SECUENCIAS-FISCALES-2026-10-15.md).  
**Estado:** `CORRECAO_SOLICITADA`; **NEX-060 não autorizada para implantação**. Auditoria **estática**; nenhum teste SQL executado pelo auditor e nenhum acesso a PostgreSQL, VM, gateway ou navegador.

## 1. Matriz de reavaliação R01-01...05

| Achado anterior | Resultado R02 por inspeção do commit | Prova de código | Limitação |
|---|---|---|---|
| R01-01 — ausência de sequência apresentada como zero | **ACEITO ESTATICAMENTE.** Query passou a devolver null, modelos TypeScript são anuláveis, UI mostra "Sin configurar" e não pré-preenche o campo com 0. | [`lib/facturacion/puntos.ts`](https://github.com/proceit-tech/distribuidora/blob/894d3df0b69a84d20a7dcfa3f6d5456faa6c1cdf/lib/facturacion/puntos.ts#L89-L115); [`app/(private)/facturacion/puntos/page.tsx`](https://github.com/proceit-tech/distribuidora/blob/894d3df0b69a84d20a7dcfa3f6d5456faa6c1cdf/app/(private)/facturacion/puntos/page.tsx#L181-L212) | Sem navegador real; regressão estrutural informada pelo Claude. |
| R01-02 — ativação com número abaixo do legado | **ACEITO ESTATICAMENTE.** `v_piso := coalesce(v_actual, v_p.ultimo_numero)`; compara tanto com esse piso como com o maior FE registrado. | [`documentacao/banco/nexit/v1/migraciones/NEX-060-facturacion-secuencias-por-tipo.sql`](https://github.com/proceit-tech/distribuidora/blob/894d3df0b69a84d20a7dcfa3f6d5456faa6c1cdf/documentacao/banco/nexit/v1/migraciones/NEX-060-facturacion-secuencias-por-tipo.sql#L300-L320); T19/T21 | SQL não executado em PostgreSQL. |
| R01-03 — migração copia contador enquanto emissão antiga atualiza | **ACEITO EM CÓDIGO, NÃO COMPROVADO OPERACIONALMENTE.** `LOCK TABLE fe_puntos_expedicion IN EXCLUSIVE MODE` antecede a leitura e dura até o fim da transação; runner aplica cada migration via `psql -1`; gatilho de congelamento é instalado antes do commit. T23 simula atualização não confirmada. | [`documentacao/banco/nexit/v1/migraciones/NEX-060-facturacion-secuencias-por-tipo.sql`](https://github.com/proceit-tech/distribuidora/blob/894d3df0b69a84d20a7dcfa3f6d5456faa6c1cdf/documentacao/banco/nexit/v1/migraciones/NEX-060-facturacion-secuencias-por-tipo.sql#L82-L123); [`documentacao/banco/nexit/v1/scripts/aplicar-migraciones.sh`](https://github.com/proceit-tech/distribuidora/blob/894d3df0b69a84d20a7dcfa3f6d5456faa6c1cdf/documentacao/banco/nexit/v1/scripts/aplicar-migraciones.sh#L55-L67); T23 | T23 não executado; sua simulação desabilita o trigger APENAS em DB descartável após a migration, logo não substitui teste integral da transição. |
| R01-04 — rollback permite retornar a contador inválido | **CORREÇÃO PARCIAL.** Agora bloqueia tabela de pontos e verifica pontos ativos sem FE e contador final inferior ao máximo FE; **foi descoberta uma janela de concorrência nova no próprio rollback** (R02-01). | [`documentacao/banco/nexit/v1/scripts/reversion-NEX-060.sql`](https://github.com/proceit-tech/distribuidora/blob/894d3df0b69a84d20a7dcfa3f6d5456faa6c1cdf/documentacao/banco/nexit/v1/scripts/reversion-NEX-060.sql#L7-L35) | Reversão não executada e ainda insegura até R02-01. |
| R01-05 — teste ausente FE e NCE número 1 na mesma identidade | **ACEITO COMO CASO ESCRITO.** T21 cria FE e NCE com 0000001 na mesma empresa, estabelecimento 050 e ponto 001, com contadores próprios. | [`documentacao/banco/nexit/v1/pruebas/T21-nex060-secuencias-por-tipo.sql`](https://github.com/proceit-tech/distribuidora/blob/894d3df0b69a84d20a7dcfa3f6d5456faa6c1cdf/documentacao/banco/nexit/v1/pruebas/T21-nex060-secuencias-por-tipo.sql#L150-L165) | T21 não executado; disponibilidade do test SQL não significa teste aprovado. |

As migrations históricas NEX-047/048/057/058/059 permaneceram sem alterações. Emissão FE com `FOR SHARE` no ponto + `FOR UPDATE` na sequência FE, hash de idempotência, escrita dos documentos, CDC/payload e isolamento por empresa não foram alterados nesta rodada. O gateway, os tipos de transação e a grade por documento da PRO-132 não foram iniciados.

## 2. Novo achado

### AUD-PRO131-R02-01 — BLOQUEANTE: check de sequências antes do lock do rollback

**Arquivo:** [`documentacao/banco/nexit/v1/scripts/reversion-NEX-060.sql`](https://github.com/proceit-tech/distribuidora/blob/894d3df0b69a84d20a7dcfa3f6d5456faa6c1cdf/documentacao/banco/nexit/v1/scripts/reversion-NEX-060.sql#L7-L23).  
**Causa:** a reversão testa `IF EXISTS (SELECT ... FROM fe_punto_secuencias WHERE tipo_documento <> 'FE')` **antes** de adquirir `LOCK TABLE fe_puntos_expedicion IN EXCLUSIVE MODE`. Nenhum lock incompatível com `INSERT/UPDATE` em `fe_punto_secuencias` protege essa primeira leitura. O script elimina a tabela com `DROP TABLE public.fe_punto_secuencias` mais adiante.

**Interleaving concreto:**
1. Sessão R inicia reversão e verifica: ainda não há NCE → check passa.
2. Sessão C registra e confirma uma sequência NCE (ou outro tipo) e faz COMMIT enquanto R ainda não adquiriu bloqueio que a impeça.
3. Sessão R adquire bloqueio da tabela de pontos; **não reexecuta o check de NCE**.
4. Reversão efetua `DROP TABLE fe_punto_secuencias`, apagando a sequência NCE recém-confirmada. A proteção atual, criada para evitar perda de informação fiscal, é contornável por corrida.

**Severidade:** **BLOQUEANTE / risco de perda de dados de numeração fiscal**. Ainda que a configuração de NCE dependa da PRO-132, o rollback deve ser seguro perante cargas manuais/rotinas futuras.

**Correção obrigatória:** estabelecer, antes de qualquer consulta de pré-condição, locks transacionais **nas tabelas necessárias para estabilizar as verificações**, inclusive `fe_punto_secuencias` em modo incompatível com escritas `INSERT/UPDATE/DELETE` e `fe_puntos_expedicion` para impedir emissão concorrente. Rechecar **após** obter os locks se há sequências não FE, pontos ativos sem FE e contadores que retrocederiam. Manter locks até o final da reversão por `psql -1`. Planejar ordem compatível com locks usados por emissão/ativação (ponto → sequência), ou demonstrar ausência de deadlock; uma falha por deadlock pode abortar conservadoramente, nunca prosseguir após check obsoleto.

**Critérios de aceite:**
- CA-R02-01a: duas sessões, com inserção/atualização de sequência não FE concorrente com o início da reversão: a reversão **aborta inteiramente** ao constatar a sequência comprometida ou a inserção é bloqueada e falha; jamais apagar uma sequência confirmada pela outra sessão.
- CA-R02-01b: pré-condições são verificadas depois de todos os locks necessários; mudanças de outras sessões até o término não invalidam a decisão.
- CA-R02-01c: cenário de rollback sem NCE/NDE/NRE/AFE, sem ponto ativo sem FE, e sem retrocesso continua possível e conserva documentos, CDC, idempotência e números.
- CA-R02-01d: cenários inválidos deixam schema, contadores, documentos e trilha inalterados.
- CA-R02-01e: adicionar teste de concorrência direcionado ao rollback (preferir PostgreSQL descartável isolado, se disponível), ou registrar explicitamente que resta apenas teste estático e execução SQL está pendente.

## 3. Cobertura, riscos e aceite da etapa

- **Testes informados pelo Claude:** suíte TypeScript PRO-131 ampliada + regressões Puntos, Facturación, Fase A, FAT-E2, PRO-128; 0 falhas. Mutação do bloqueio da conciliação detectada; ESLint dos arquivos tocados limpo. O número exato de asserts não foi informado.
- **Não executados pelo Claude e pelo auditor:** NEX-060, reversão, T16/T19/T20/T21/T22/T23 no PostgreSQL; sem suíte global, build, CI manual, gateway e navegador. Não deduzir que CI automático passou.
- **Estado real das migrations NEX-056…059:** desconhecido. **Não aplicar NEX-060** sem inventário prévio, backup e autorização humana, mesmo depois que o bug do rollback seja resolvido.
- **FISC-009 externa:** se ERP externo emite na mesma identidade, confirmação manual inicial não prova exclusividade futura; pendência operacional fora do P0 atual.

**Decisão de coordenação:** manter [PRO-131](https://linear.app/proceit/issue/PRO-131) em `In Progress` / correção solicitada; [PRO-132](https://linear.app/proceit/issue/PRO-132), [PRO-133](https://linear.app/proceit/issue/PRO-133) e [PRO-134](https://linear.app/proceit/issue/PRO-134) permanecem bloqueadas. Não autorizar nova funcionalidade nem aplicação de migration.

**Próxima execução Claude (somente após comando do responsável):** corrigir **exclusivamente R02-01**, adicionar/verificar teste dirigido de segurança do rollback, preservar R01-01/02/03/05, protocolos e progresso; commit + push + SHA e parar para `AUD-PRO131-R03`. Não editar esta auditoria, não acessar VM/PG operacional e não rodar suíte integral/CI manual.
