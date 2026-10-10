# Claude — protocolo PROCEIT / Nexit

O contexto do projeto vive no GitHub, não na memória da conversa. Claude implementa; ChatGPT audita (AUD-RNN); a homologação final é humana. Nunca marcar HOMOLOGADO, nunca editar arquivos AUD, nunca fazer merge em `main`.

## Regra permanente — contexto e responsabilidades (Claude Code + ChatGPT)
- **Antes de CADA tarefa, nova conversa, retorno de homologação ou compactação de contexto**, as duas IAs devem consultar no GitHub a versão mais recente de `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, e as seções pertinentes de `PROGRESSO-NEXIT-V1.md`; verificar branch/commit atual e arquivos da tarefa. Não se apoiar só na memória do chat ou em cópia local desatualizada.
- **Claude Code**: implementa exclusivamente a tarefa autorizada, prepara arquivos de código/SQL/docs, executa somente testes em ambiente de teste autorizado, faz **git commit e git push** na branch correta e para para auditoria. Não acessa VM, Docker ou PostgreSQL real; não aplica SQL/migrations e não faz deploy.
- **ChatGPT**: lê os mesmos documentos atualizados antes de auditorias/instruções de implementação, revisa commits e diffs, prepara orientações e, quando expressamente autorizado, pode editar/commitar arquivos no GitHub. Não deve afirmar que executou alterações na VM; comandos de implantação são entregues ao responsável humano.
- **Responsável humano**: decide e executa na VM `git pull`, scripts no `nexit-db`, Docker/deploy e homologação; nada disso é executado pelas IAs. **Não confundir commit/push no Git com execução de SQL ou deploy.**
- Se uma IA não conseguir ler os arquivos atuais, deve declarar a limitação e evitar orientação destrutiva ou decisões baseadas em versões antigas. Ao encontrar divergência entre texto e estado real do banco, registrar o fato e solicitar verificação — não reaplicar migrations por suposição.
- Revisão por **tarefa única**, sem auditoria geral ou leitura integral de arquivos gigantes; ler integralmente os dois documentos curtos de protocolo e apenas trechos necessários do progresso, requisitos e código para economizar tokens.
- Estado operacional confirmado pelo responsável: **NEX-020 já aplicada** no PostgreSQL real; **NEX-021 ainda proposta, não aplicada**. Não reaplicar NEX-020 nem assumir que arquivos de SQL publicados no Git foram executados.
- Pasta local de Claude Code: `C:\\projetos\\PROCEIT\\distribuidora` (conferir branch); branch de trabalho `feature/NEXIT-2026-001-banco-demo`. Preservar arquivos não versionados `Dockerfile` e `.dockerignore` se presentes. Não efetuar checkout destrutivo.
- **Decisão operacional (clone local + Git):** o GitHub é a única fonte oficial do código e da documentação; o GitHub MCP não é necessário enquanto o Git pelo terminal funcionar. Claude Code trabalha no clone local `C:\projetos\PROCEIT\distribuidora`, branch `feature/NEXIT-2026-001-banco-demo`. Antes de cada tarefa: `git status`, confirmar a branch, `git fetch` e sincronização segura (`git merge --ff-only origin/<branch>`). Nunca descartar modificações locais nem sobrescrever arquivos sem aprovação; em caso de conflito, interromper e informar. Ao finalizar: testes locais pertinentes, commit e push automáticos, informar o SHA e parar para revisão pelo ChatGPT. Nunca acessar a VM nem executar migrations, SQL ou deploy no banco real. O responsável não precisa copiar arquivos nem sincronizar o notebook.
- Não perder tokens discutindo assinaturas `Unverified`, trailers de coautoria ou conectores quando o Git terminal estiver funcionando.

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
- Banco: não alterar produção, contêineres ou VM; não modificar migrations aplicadas (NEX-001..020); mudança estrutural só em nova migration versionada (NEX-021 está em proposta e precisa aprovação), com necessidade comprovada e aprovação prévia. O papel `nexit_runtime` só escreve via funções SECURITY DEFINER.
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

## 6. Leitura seletiva e economia de contexto
O GitHub é a fonte de verdade; a conversa não guarda o histórico do projeto.
1. Ler `CLAUDE.md` e apenas o resumo atual de `PROGRESSO-NEXIT-V1.md` (topo + seção do módulo em curso).
2. Consultar só as seções e arquivos necessários à tarefa autorizada.
3. Não carregar migrations completas, arquivos grandes ou históricos extensos quando bastar uma função/tabela específica (`grep`/busca por símbolo, `sed -n` por faixa).
4. Buscar por símbolos, funções e trechos antes de abrir arquivos inteiros.
5. Não repetir testes ou análises já documentados, salvo quando necessários para validar a alteração atual.
6. Manter saídas de comandos curtas (`tail`, `head`, `grep -c`, filtros).
7. Ao concluir cada tarefa, registrar decisões, alterações e pendências no GitHub (`PROGRESSO-NEXIT-V1.md` + commit/push).
8. Após compactação, recuperar o contexto mínimo por `CLAUDE.md`, `PROGRESSO-NEXIT-V1.md` e `git log --oneline -5`/commit atual; não reconstruir a conversa.
9. Economizar contexto nunca altera o escopo nem descarta requisitos da última autorização do responsável.
