# Claude — protocolo PROCEIT / Nexit

O contexto do projeto vive no GitHub, não na memória da conversa. Claude implementa; ChatGPT audita (AUD-RNN); a homologação final é humana. Nunca marcar HOMOLOGADO, nunca editar arquivos AUD, nunca fazer merge em `main`.

## 1. Rotina obrigatória (antes de cada módulo e após qualquer compactação de contexto)
1. Ler este `CLAUDE.md` e `documentacao/PROTOCOLO-IA.md` (e a definição `documentacao/definicoes/REQ-*.md` aplicável).
2. Ler `PROGRESSO-NEXIT-V1.md`: o que está concluído, em revisão e pendente.
3. Ler a documentação funcional do módulo: V1 em `documentacao/v1/` (ex.: `REPORTES-V1-ALCANCE-APROBADO.md`) e planos em `documentacao/definicoes/`.
4. Ler migrations e scripts PostgreSQL (`documentacao/banco/nexit/v1/{migraciones,scripts,seeds,docs}`) para tabelas, campos, funções, permissões e relações. **Ler antes de executar**; não rodar de novo baterias de testes do banco só para conhecer a estrutura — executar apenas os testes necessários à alteração atual.
5. Inspecionar o código real dos módulos relacionados (APIs, `lib/`, telas) e reaproveitar o que existe.
6. Conferir o histórico recente (`git log --oneline -15`, `git status`) antes de editar.
7. Trabalhar somente no módulo autorizado na última mensagem do responsável.

## 2. Ciclo de entrega (um módulo/relatório por vez)
- Uma funcionalidade por vez; não executar fases inteiras; não iniciar o próximo módulo sem autorização.
- Reutilizar telas e componentes existentes; sem mock, localStorage ou dados fixos — usar API e PostgreSQL reais.
- Testes essenciais: segurança/permissões, isolamento por `empresa_id`, compilação (e os específicos da alteração).
- Ao concluir: atualizar `PROGRESSO-NEXIT-V1.md` (commit, funcionalidades, testes, pendências/limitações), commit e push imediatos na branch `feature/NEXIT-2026-001-banco-demo`; relato curto (feito, arquivos, testes, branch/commit, o que falta) e **parar** aguardando revisão.
- Trailers de commit: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` e `Claude-Session: <url da sessão>`.
- Sem rebase nem force-push. Push rejeitado: `git fetch origin <branch>` + `git merge --no-edit FETCH_HEAD` + push. Commits "Unverified" de terceiros não se reescrevem (assinatura é do lado do autor / squash do PR).

## 3. Regras de dados e segurança
- Multi-tenant: sempre `empresa_id` da sessão; permissões `RECURSO.ACCION` via `hasPermission`/`getAccessContext`; alcance de depósitos via `usuario_puede_deposito`.
- Banco: não alterar produção, contêineres ou VM; não modificar migrations aplicadas (NEX-001..019); mudança estrutural só em nova migration versionada (próxima livre: NEX-020), com necessidade comprovada e aprovação prévia. O papel `nexit_runtime` só escreve via funções SECURITY DEFINER.
- `DEMO_MODE=false` em produção; sem `DATABASE_URL` e sem `DEMO_MODE` ⇒ 503; nunca dados simulados diante de falha do banco.
- Sem segredos no GitHub. Sem dependências novas se o registry não estiver acessível (exportações de relatórios usam `lib/reportes/{export,xlsx,pdf}.ts`).
- Valores monetários: `numeric` como texto, somados no PostgreSQL; nunca float. Custos só de `inventario_costos`; nunca inventar custo, margem ou histórico.
- Não modificar Productos, Movimientos ou Stock sem erro real comprovado e justificado.
- Texto para o responsável em português; interface em espanhol (PY).

## 4. Documentação V1 e V2
- **V1** (`documentacao/v1/`, `documentacao/banco/nexit/v1/`, `PROGRESSO-NEXIT-V1.md`): escopo vigente; é o que se implementa.
- **V2** (`documentacao/v2/`, ex.: auditoria funcional e roadmap, SIFEN): **apenas planejamento**. Não implementar funcionalidades V2 nem antecipá-las, e não alterar a documentação V2, sem autorização expressa.

## 5. Protocolo de auditoria
Seguir `documentacao/PROTOCOLO-IA.md` (REQ/TST/AUD/HOM e máquina de estados). Corrigir cada achado AUD citando o commit, preservar auditorias anteriores e pedir nova rodada. A aprovação técnica não substitui a homologação humana. GitHub é canal ASSÍNCRONO entre IAs: não há execução automática nem mensagens diretas.
