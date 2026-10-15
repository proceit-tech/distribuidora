# AUD-PRO131-R03 — Reauditoria independente da reversão NEX-060

**Analista:** ChatGPT · **Executor:** Claude Code  
**Commit inspecionado:** [`39ff031f161a0202c6d31de2e0e83f69ddaccbd6`](https://github.com/proceit-tech/distribuidora/commit/39ff031f161a0202c6d31de2e0e83f69ddaccbd6)  
**Projeto:** NEXIT V1 · **Linear:** [PRO-131](https://linear.app/proceit/issue/PRO-131) · **GitHub:** [issue #11](https://github.com/proceit-tech/distribuidora/issues/11)  
**Requisitos e histórico:** `documentacao/v1/AUD-FISC-2026-10-15-PUNTOS-TIPOS-GATEWAY.md`, `documentacao/testes/AUD-PRO131-R01-SECUENCIAS-FISCALES-2026-10-15.md`, `documentacao/testes/AUD-PRO131-R02-SECUENCIAS-FISCALES-2026-10-15.md`.

**Veredito:** **CORREÇÃO R02-01 CONFORME EM REVISÃO ESTÁTICA. PRO-131: PENDENTE DE EXECUÇÃO SQL / SEM HOMOLOGAÇÃO.**  
**Novos achados bloqueantes/altos/médios no diff:** nenhum identificado. **Não aprovar para implantação.**

## 1. Matriz de confronto — R02-01

| Critério | Evidência no código | Resultado |
|---|---|---|
| R02-01a: impedir perda da sequência não FE confirmada por corrida | `reversion-NEX-060.sql`: `LOCK TABLE public.fe_puntos_expedicion IN EXCLUSIVE MODE` **antes** do `LOCK TABLE public.fe_punto_secuencias IN EXCLUSIVE MODE`; `IF EXISTS(... tipo_documento <> 'FE')` só após ambos. | **CONFORME ESTATICAMENTE**: trava escrita concorrente antes do check. T24 A versionado, ainda não executado. |
| R02-01b: verificar todas as pré-condições sob locks | No mesmo `DO $$`: (i) ausência de NCE/NDE/NRE/AFE; (ii) ausência de ponto ativo sem FE; (iii) `greatest(legado, seqFE) >= maxFE`. | **CONFORME ESTATICAMENTE**. |
| R02-01c: reversão válida preservar histórico/idempotência e retomar contador | O rollback sincroniza contador legado apenas para cima, restaura `fe_documento_crear_fe` legado e destrói sequências apenas após preflight. T24 B inclui FE 0000011, rollback, FE 0000012, hash das linhas de documentos e chave de idempotência. | **CENÁRIO DE TESTE ESCRITO**; execução pendente. |
| R02-01d: cenários inválidos abortar sem efeitos | `psql -v ON_ERROR_STOP=1 -1 -f reversion-NEX-060.sql` cria transação única; exceção PL/pgSQL aborta a transação. T24 A/C procuram esquema intacto após aborto. | **CONFORME ESTATICAMENTE**; execução pendente. |
| R02-01e: teste de corrida | Novo `pruebas/T24-reversion-secuencias.sh` consta no `scripts/ejecutar-pruebas.sh`; três cenários usando clones transitórios do banco descartável. | **TESTE VERSIONADO, NÃO EXECUTADO.** |
| Escopo: preservar R01-01/02/03/05 | Diff do commit só altera reversão, testes correlatos, runner e progresso. Não modifica motor FE, emissão, payload, CDC, gateway ou interfaces. | **CONFORME.** |

## 2. Análise técnica de concorrência

O rollback passa a adquirir locks de tabela em ordem **pontos → sequências**. Em PostgreSQL, `EXCLUSIVE` é incompatível com `ROW EXCLUSIVE` dos escritores dessas tabelas. Assim, o check de existência de NCE/NDE/NRE/AFE não pode ser invalidado por uma inserção confirmada enquanto os locks são mantidos. Ao lado da utilização documentada de `psql -1`, o `DROP TABLE` está no mesmo contexto transacional. 

Uma sessão que começou a escrever antes dos locks terá de concluir/abortar antes da reversão verificar, ou causará espera/deadlock conservador. Se o banco detectar deadlock, **não presumir sucesso da reversão**: a transação envolvida aborta. O T24 tem caso específico para uma sequência NCE inserida em transação concorrente antes de confirmar.

**Nota de responsabilidade:** observações acima descrevem garantias esperadas da estratégia SQL; não substituem execução em PostgreSQL nem comprovam resultados do T24.

## 3. Testes e limites

- **Informado pelo Claude:** suítes TypeScript direcionadas PRO-131 + Puntos + Facturación + Fase A: 0 falhas; mutação ao remover lock de sequências detectada; ESLint local limpo. Sem contagem individual de assertivas.
- **Auditor ChatGPT:** revisou o diff, SQL e shell script de T24, integração com runner, protocolos `CLAUDE.md` e `documentacao/PROTOCOLO-IA.md` e trecho pertinente de `PROGRESSO-NEXIT-V1.md`; **não executou** nenhum teste.
- **Sem evidência de execução:** migration NEX-060, reversão, T16, T19, T20, T21, T22, T23 e T24 no PostgreSQL; CI automático não acompanhado. Não executar suíte integral, build, lint global ou CI manual por padrão (política vigente).
- **Ambiente operacional:** estado real de aplicação das migrations NEX-056 a NEX-059 e configuração operacional do banco **não confirmado nesta rodada**. Não considerar NEX-060 instalada.
- **Risco externo conhecido:** outro ERP pode usar a mesma identidade fiscal sem uma autoridade de numeração compartilhada; a presente correção não soluciona FISC-009.

## 4. Parecer e próximo portão

**R02-01 ENCERRADO POR REVISÃO ESTÁTICA**, sem necessidade de encaminhar outra implementação ao Claude agora. **PRO-131 continua EM_IMPLEMENTACAO / pendente prova SQL** no sentido de aceite técnico completo. Não marcar HOMOLOGADO nem APROVADO_TECNICAMENTE integralmente conforme o critério de evidências do protocolo.

**Próximo passo:** o responsável pode decidir se autoriza verificação técnica **direcionada**, estritamente em banco PostgreSQL efêmero e cluster descartável, mediante infraestrutura apropriada, dos testes SQL relevantes a PRO-131: migration NEX-060, T21, T22, T23 e T24, com regressões pontuais T19/T20 conforme impacto. Não executar no banco operacional. A inexistência de ambiente separado operacional não autoriza usar produção como laboratório.

**Dependências:** PRO-132, PRO-133 e PRO-134 permanecem bloqueadas no Linear até fechamento explícito da PRO-131. Não autorizar Claude a iniciar outras tarefas por padrão.
