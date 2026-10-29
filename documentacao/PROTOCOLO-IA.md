# PROCEIT — Protocolo de desenvolvimento colaborativo por IA (v1.0)

> **EXCEÇÃO AUTORIZADA PELO RESPONSÁVEL — 25/10/2026 / FE-V1:** Para **etapas E01–E10 da sequência `documentacao/ordens/ORD-CLAUDE-NEXIT-FE-V1-ETAPAS-R01-2026-10-25.md`**, Claude **não cria e não executa testes, lint, typecheck, build, CI manual ou verificações em banco/gateway/VM**. Faz exclusivamente o código da etapa expressamente autorizada, um commit/push e PARA para a auditoria de diff/arquivos completos pelo ChatGPT. **E01/PRO-314 é a única liberada neste momento**; restantes fases dependem do gate. Esta determinação específica prevalece sobre as normas padrão de testes deste protocolo só nas etapas FE V1, sem desativar pipelines automáticos nem dispensar homologação real humana. ChatGPT registra `não testado` e não declara homologação sem prova.

Este repositório utiliza o GitHub como fonte única de verdade do código e da documentação; o Linear é o controle das tarefas. **Claude desenvolve e testa unitariamente; ChatGPT é analista de negócios e sistemas, faz auditoria independente e administra todo o Linear; o responsável humano aplica e valida as entregas no único ambiente operacional real.** Nenhuma aprovação técnica substitui a homologação humana.


## Política obrigatória de testes — somente testes da funcionalidade, salvo solicitação expressa

**Decisão do responsável de 14/10/2026. Vale para Claude Code e ChatGPT em todas as tarefas, prevalecendo sobre solicitações anteriores de execução automática da suíte inteira.** O detalhamento normativo está em [CLAUDE.md](../CLAUDE.md), seção *Regra permanente — testes básicos por funcionalidade*.

- **Regra padrão:** executar apenas os **testes básicos/direcionados da funcionalidade alterada** e regressões diretamente pertinentes (inclusive autorização, isolamento multiempresa, integridade fiscal e SQL **quando afetados**). Selecionar o menor conjunto suficiente para o escopo, sem bateria geral.
- **Sem pedido expresso do responsável na tarefa atual, NÃO executar** suíte completa de TypeScript, testes globais, lint/typecheck de todo o projeto, build geral, bateria completa de PostgreSQL/migrations ou disparo manual de CI integral. Não iniciar, aguardar ou monitorar testes extensos em segundo plano. É permitido um teste pontual de compilação/validação sobre o código tocado se disponível.
- **GitHub Actions automático:** commits podem disparar CI obrigatório já configurado; não alterar proteção/workflow para evitar isso. Não disparar rerun ou workflow manual nem fazer polling. Não confundir `CI disparado` com `CI passou`.
- **Transparência:** informar número/resultado dos testes pontuais, o que ficou sem testar e os riscos. Não alegar aprovação global ou homologação com cobertura reduzida. Se um teste mais amplo parecer indispensável, registrar a limitação e aguardar decisão explícita, sem iniciá-lo.
- Esta política não altera os controles de segurança, a revisão do ChatGPT, o escopo por tarefa, nem a proibição de executar código, migrations ou testes no banco/VM operacional pela IA.

## Norma operacional permanente — leitura do contexto e separação de ambientes

Este protocolo vincula **Claude Code e ChatGPT**. No início **de toda solicitação de implementação, revisão, retomada, nova conversa ou após compactação**, ambas as IAs devem consultar no GitHub a versão atual de `CLAUDE.md`, deste `documentacao/PROTOCOLO-IA.md` e os trechos relevantes de `PROGRESSO-NEXIT-V1.md`, além de branch, commit e arquivos relacionados. Os documentos versionados prevalecem sobre lembranças imprecisas de chat. Usar leitura seletiva de código e progresso; não realizar auditorias gerais sem pedido.

**Fluxo de responsabilidades sem exceções presumidas (decisão do responsável em 24/10/2026):**
1. **Claude Code — desenvolvedor:** implementa somente a tarefa autorizada, altera código e testes unitários/focais, prepara scripts/migrations técnicos estritamente necessários quando houver mudança estrutural, executa verificações pontuais, faz **commit e push no GitHub**, informa SHA, testes e bloqueios e **para**. Não cria, edita ou movimenta tarefas no Linear; não define backlog/escopo, não mantém PROGRESSO ou documentação de gestão e não escreve auditorias independentes. Não acessa VM, Docker nem PostgreSQL real para aplicar scripts ou fazer deploy.
2. **ChatGPT — analista de negócios/sistemas, auditor e gestor:** coleta/interpreta requisitos, especifica regras e critérios de aceite, organiza backlog, prioridades, marcos e dependências; **cria e atualiza todas as issues do Linear**, inclusive estados, SHA, resultados, bloqueios e relações. Após o push, lê HEAD/diff/código/testes, produz a auditoria independente AUD-RNN no Git, atualiza `PROGRESSO-NEXIT-V1.md` e documentação de requisitos/gestão. Passa a issue para In Review após conferir a entrega; somente registra Done/Homologado com aceite humano. Pode publicar requisitos, auditorias e registros gerenciais no Git; só altera código da aplicação por pedido expresso. Isso **não** significa aplicar SQL no banco real.
3. O responsável humano revisa/aprova, executa **git pull na VM**, comandos Docker, migrations/cargas SQL e deploy quando pertinente; confere os resultados no único ambiente real. Git commit/push não significa banco atualizado ou aplicação publicada.
4. Nunca limpar/recriar banco, containers ou volumes como rotina. Proteger dados reais e versões de migration já aplicadas. Quando houver dúvida sobre estado efetivo, perguntar ou verificar no ambiente antes de autorizar execução.
5. Se GitHub ou documentos estiverem inacessíveis, declarar que não houve verificação e não inventar estado. Registrar mudanças de decisão no Git, para sobreviver à perda de contexto das duas IAs.

**Estado confirmado até esta atualização:** NEX-001 a NEX-020 aplicadas no banco real; NEX-021 versionada em `migraciones/`, ainda não aplicada. O trabalho pendente de países e localização opcional (Departamento → Distrito → Ciudad) está em V1; **Barrio está fora do escopo atual da V1**. Respeitar a branch `feature/NEXIT-2026-001-banco-demo`. Esta informação é uma fotografia; conferir `PROGRESSO-NEXIT-V1.md` e novos registros de execução para atualizações futuras.

**Decisão operacional — clone local e sincronização por Git:** o GitHub continua como única fonte oficial. Claude Code trabalha no clone local `C:\projetos\PROCEIT\distribuidora` (branch `feature/NEXIT-2026-001-banco-demo`), sem depender do GitHub MCP enquanto o Git pelo terminal funcionar. Antes de cada tarefa: `git status`, confirmar branch, `git fetch` e `git merge --ff-only`; nunca descartar modificações locais nem sobrescrever arquivos sem aprovação (conflito ⇒ interromper e informar). Ao terminar: testes locais pertinentes, commit e push, informar o SHA e parar para revisão do ChatGPT. Sem acesso à VM e sem migrations/SQL/deploy no banco real; o responsável não transfere arquivos manualmente.

**Relatório econômico obrigatório:** na resposta ao responsável, informar apenas resultado/estado, testes em números, bloqueios reais e SHA do commit. NÃO colar SQL, comandos SELECT, trechos de código, listas de arquivos alterados, diffs ou repetir regras já registradas no Git. Detalhes técnicos ficam nos próprios arquivos versionados e no diff/commit; documentar apenas decisões, estado, testes e informações que não estejam recuperáveis do código. Fornecer comandos ou caminhos somente quando solicitados expressamente ou quando forem indispensáveis para uma ação imediata do responsável. Evitar narrar microetapas ou operações de ferramenta.

**Regra permanente — documentação operacional como fonte única:** antes de solicitar ao responsável comandos, nomes de serviços/containers, caminhos, estrutura Docker, ambiente, banco, deploy ou qualquer dado já estabelecido, consultar primeiro os arquivos atuais do GitHub (incluindo documentação de infraestrutura/implantação e configuração Compose). ChatGPT e Claude Code devem recuperar contexto técnico pelo repositório, sem exigir que o responsável repita decisões ou diagnósticos antigos. Se faltar um dado, buscar nos arquivos pertinentes; só pedir confirmação quando realmente não estiver documentado ou quando o estado real puder ter mudado. Após confirmação, atualizar o documento operacional apropriado no GitHub para não repetir a pergunta. Documentar procedimentos reais de atualização da VM e containers, protegendo PostgreSQL e dados. Nunca registrar senhas, tokens ou segredos. Não inventar valores ausentes, nem executar ações na VM sem autorização. Relatórios no chat permanecem breves: resultado e SHA.


**Regra permanente — especificação primeiro, implementação só pelo Claude:** salvo quando o responsável solicitar explicitamente que ChatGPT escreva/edite código, ChatGPT deve apenas avaliar telas/requisitos, redigir especificações e critérios de aceite e publicá-los no GitHub; **não implementar código da aplicação por iniciativa própria**. Claude Code implementa exclusivamente após autorização do responsável. Para cada tela, manter evidências **ANTES e DEPOIS** em pasta própria de homologação visual, com nome de captura, commit/versão, ambiente, dimensões/zoom, avaliação, defeitos e status, garantindo rastreabilidade. Sempre tentar versionar prints originais no GitHub após revisão de privacidade e verificação de visibilidade; **se não conseguir enviar imagem, declarar explicitamente que ela NÃO está no Git e manter referência pendente, sem alegar registro completo**. Nem ChatGPT nem Claude podem marcar APROVADO sem aceite humano da tela publicada. Documentação consolidada é a memória permanente do projeto; não repetir perguntas ou decisões disponíveis no repositório.

## Estrutura obrigatória
- `documentacao/definicoes/`: requisitos e regras de negócio aprovadas para implementação.
- `documentacao/banco/`: scripts de banco de dados vinculados aos requisitos.
- `documentacao/testes/`: plano de testes, auditorias independentes e homologação.
- `documentacao/PROTOCOLO-IA.md`: este contrato de colaboração.

## Nomenclatura
Identificador estável: `REQ-AAAA-NNN` (sequencial por repositório, sem reutilização).
- Definição: `definicoes/REQ-AAAA-NNN-slug-curto.md`.
- SQL incremental: `banco/REQ-AAAA-NNN-001-up.sql` e `REQ-AAAA-NNN-001-down.sql`, se reversão for segura; na impossibilidade, explicar no requisito e script.
- Testes: `testes/TST-REQ-AAAA-NNN.md`.
- Auditoria: `testes/AUD-REQ-AAAA-NNN-R01.md`, R02, R03... (uma revisão imutável por rodada).
- Homologação humana: `testes/HOM-REQ-AAAA-NNN.md`.
O slug usa letras minúsculas ASCII e hífens. Não escrever arquivos vazios de funcionalidades futuras.

## Máquina de estados
RASCUNHO -> DEFINIDO -> EM_IMPLEMENTACAO -> PRONTO_PARA_AUDITORIA -> CORRECAO_SOLICITADA -> PRONTO_PARA_AUDITORIA -> APROVADO_TECNICAMENTE -> EM_HOMOLOGACAO -> HOMOLOGADO.
Quando homologação falhar: retornar a CORRECAO_SOLICITADA e abrir nova rodada de auditoria. Não confundir aprovação técnica com conclusão.

## Etapa 1 — definição
O requisito deve conter: contexto; objetivo; escopo/não escopo; personas e permissões; fluxo funcional; regras de negócio numeradas (RN-01...); dados e entidades; APIs/contratos; exceções; segurança; impacto em sistemas existentes; critérios de aceite numerados (CA-01...); casos de teste esperados; dependências, riscos e questões em aberto; estado; histórico de decisões.
Não implementar requisito marcado RASCUNHO ou com decisões bloqueantes em aberto.

## Etapa 2 — Claude desenvolve
Antes de alterar código, ler este protocolo, a definição relevante, regras locais do projeto (CLAUDE.md/AGENTS.md) e implementações relacionadas. Desenvolver mantendo compatibilidade e preservando convenções existentes. Criar SQL incremental, com ordem e rollback quando pertinente. Manter os testes automatizados junto ao código e informar os resultados na entrega; o registro gerencial dos resultados em PROGRESSO/TST e Linear cabe ao ChatGPT depois da inspeção do commit, exceto documentação técnica estritamente necessária. Se houver mudanças fora de escopo, justificar na definição. Nunca dizer que executou testes não executados.
Entregar commit/PR e informar SHA, testes e eventuais bloqueios ao ChatGPT. O estado de tarefa no **Linear será atualizado exclusivamente pelo ChatGPT**, após conferência da entrega. Não editar documentação gerencial, PROGRESSO ou AUD-* como rotina de desenvolvimento.

## Etapa 3 — ChatGPT audita
Ler definição, diff completo/arquivos relevantes, scripts SQL e TST. Verificar cobertura de cada RN e CA, coerência entre camadas, segurança e autenticação, multi-tenancy, integridade de dados, migração e rollback, erros/observabilidade, regressões, performance, tipagem, testes e manutenção.
Escrever nova `AUD-...-RNN.md` contendo SHA/PR inspecionado, matriz RN/CA -> implementação -> teste -> resultado, achados com IDs `F-001` etc., severidade BLOQUEANTE/ALTA/MEDIA/BAIXA, localização, evidência, impacto, correção esperada, testes de regressão e veredito.
Não modificar silenciosamente o código auditado. Se evidência indisponível, usar NAO_VERIFICADO e não declarar 10/10.

## Etapa 4 — Claude corrige
Ler toda a auditoria mais recente; corrigir cada achado e registrar no TST o ID, commit, descrição, teste executado e resultado. Não apagar auditorias antigas. Na nova rodada, ChatGPT confere achados anteriores e eventuais regressões.

## Critério objetivo de 10/10
Conformidade demonstrada de todos RN/CA verificáveis; zero achados BLOQUEANTE/ALTA/MEDIA abertos; banco/migrações e rollback avaliados; testes obrigatórios realmente executados e aprovados; nenhuma alegação sem evidência; documentação atualizada. BAIXA pode permanecer apenas se aceita explicitamente pelo responsável humano e documentada. Caso dependências ou ambientes impeçam testes essenciais, veredito fica PENDENTE, não 10/10.

## Etapa final — usuário homologa
Após aprovação técnica, criar `HOM-...` com checklist, passos manuais e campos para data, ambiente, evidências, resultado e aceite explícito do responsável. Só a pessoa responsável pode marcar HOMOLOGADO.

## Coordenação operacional
A comunicação entre as IAs é ASSÍNCRONA por commits, pull requests e arquivos versionados, não por mensagens diretas automáticas. Cada IA deve receber uma solicitação/execução para ler o repositório; este documento não cria agentes, triggers nem automação por si só.
Trabalhar por branch `feature/REQ-AAAA-NNN-slug` e PR; auditorias preferencialmente no mesmo PR ou branch de documentação vinculado. Evitar alterações simultâneas na mesma branch. Reavaliar o SHA exato depois de cada correção.

## Regra vinculante — criação de scripts versus execução (11/10/2026)
Claude Code, em toda tarefa autorizada que exija mudança no esquema, **deve criar e versionar migrations/scripts SQL incrementais** seguindo a sequência e padrões reais do Git, sem pedir aprovação adicional para a criação do arquivo. A autorização da funcionalidade abrange seus artefatos de código, SQL e documentação. **Somente a execução/aplicação no banco real/VM** pertence ao responsável humano, depois de revisão e decisão de aplicação. Nunca modificar migration aplicada nem executar SQL em produção. GitHub é fonte única; ChatGPT e Claude leem normas, progresso e estrutura Git atual antes de cada tarefa. Esta decisão prevalece sobre textos anteriores que exigiam autorização até para elaborar scripts.

## Regra operacional definitiva — ambiente único (11/10/2026)
O Nexit possui **somente um ambiente operacional, com banco e dados reais**. Não existe ambiente separado de homologação, teste, staging ou laboratório do projeto. Não orientar o responsável a implantar em ambiente inexistente nem inventar fases de homologação. Fluxo: Claude versiona código e scripts SQL incrementais na branch; ChatGPT audita; o responsável decide quando aplicar no único ambiente real e verifica o comportamento da aplicação ali. Ao executar alteração de banco, preservar dados, avaliar backup e reversão antes da operação. O usuário não precisa repetir esta decisão. Referências históricas ao estado HOMOLOGADO significam, quando aplicável, aceite funcional do responsável no ambiente real, e não existência de ambiente adicional.

## Decisão expressa do responsável — 15/10/2026: IAs jamais acessam a VM
Claude Code **desenvolve, testa em simulações autorizadas e publica scripts executáveis** no GitHub; ChatGPT **audita os scripts**; o responsável humano **executa apenas o script aprovado** no único terminal operacional da VM e fornece o resultado sem segredos. **Não será concedido acesso SSH, Docker, PostgreSQL ou outro acesso remoto da VM às IAs; não pedir novamente.**

O entregável operacional precisa ser um procedimento enxuto com comando de entrada verificável (preferencialmente script único), pré-verificação de somente leitura, aplicação autorizada, validação, isolamento de escopo, rollback seguro e diagnóstico de falha. **Não transferir ao responsável a criação de SQL, alteração manual de `.env`, manipulação manual de credenciais ou sequências de operações internas.** Se faltar credencial, o script deve obtê-la de fonte privada já configurada ou, quando necessário, receber entrada sigilosa interativa diretamente no terminal do responsável (sem eco/log/histórico/argv, sem compartilhar segredos no chat). Não presumir clone Git no diretório de stack nem executar migrations desnecessárias. Código aprovado no GitHub não equivale a instalado na VM; só a evidência posterior do terminal comprova a execução.
