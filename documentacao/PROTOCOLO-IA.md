# PROCEIT — Protocolo de desenvolvimento colaborativo por IA (v1.0)

Este repositório utiliza o GitHub como fonte única de verdade. Claude implementa; ChatGPT audita; o responsável humano realiza a homologação final. Nenhuma aprovação técnica substitui a homologação humana.

## Norma operacional permanente — leitura do contexto e separação de ambientes

Este protocolo vincula **Claude Code e ChatGPT**. No início **de toda solicitação de implementação, revisão, retomada, nova conversa ou após compactação**, ambas as IAs devem consultar no GitHub a versão atual de `CLAUDE.md`, deste `documentacao/PROTOCOLO-IA.md` e os trechos relevantes de `PROGRESSO-NEXIT-V1.md`, além de branch, commit e arquivos relacionados. Os documentos versionados prevalecem sobre lembranças imprecisas de chat. Usar leitura seletiva de código e progresso; não realizar auditorias gerais sem pedido.

**Fluxo de responsabilidades sem exceções presumidas:**
1. Claude Code implementa tarefa única autorizada, prepara/atualiza código, documentação e arquivos SQL, testa em ambiente de teste autorizado, faz **commit e push GitHub** e **para**. Não acessa VM, Docker nem PostgreSQL real para aplicar scripts ou fazer deploy.
2. ChatGPT consulta o repositório e os documentos a cada tarefa, revisa a entrega, identifica defeitos concretos e orienta a execução. Pode publicar correções diretamente no GitHub somente mediante autorização do usuário; isso **não** significa aplicar SQL no banco real.
3. O responsável humano revisa/aprova, executa **git pull na VM**, comandos Docker, migrations/cargas SQL e deploy quando pertinente; homologa resultados. Git commit/push não significa banco atualizado ou aplicação publicada.
4. Nunca limpar/recriar banco, containers ou volumes como rotina. Proteger dados reais e versões de migration já aplicadas. Quando houver dúvida sobre estado efetivo, perguntar ou verificar no ambiente antes de autorizar execução.
5. Se GitHub ou documentos estiverem inacessíveis, declarar que não houve verificação e não inventar estado. Registrar mudanças de decisão no Git, para sobreviver à perda de contexto das duas IAs.

**Estado confirmado até esta atualização:** NEX-001 a NEX-020 aplicadas no banco real; NEX-021 versionada em `migraciones/`, ainda não aplicada. O trabalho pendente de países e localização opcional (Departamento → Distrito → Ciudad) está em V1; **Barrio está fora do escopo atual da V1**. Respeitar a branch `feature/NEXIT-2026-001-banco-demo`. Esta informação é uma fotografia; conferir `PROGRESSO-NEXIT-V1.md` e novos registros de execução para atualizações futuras.

**Decisão operacional — clone local e sincronização por Git:** o GitHub continua como única fonte oficial. Claude Code trabalha no clone local `C:\projetos\PROCEIT\distribuidora` (branch `feature/NEXIT-2026-001-banco-demo`), sem depender do GitHub MCP enquanto o Git pelo terminal funcionar. Antes de cada tarefa: `git status`, confirmar branch, `git fetch` e `git merge --ff-only`; nunca descartar modificações locais nem sobrescrever arquivos sem aprovação (conflito ⇒ interromper e informar). Ao terminar: testes locais pertinentes, commit e push, informar o SHA e parar para revisão do ChatGPT. Sem acesso à VM e sem migrations/SQL/deploy no banco real; o responsável não transfere arquivos manualmente.

**Relatório econômico obrigatório:** na resposta ao responsável, informar apenas resultado/estado, testes em números, bloqueios reais e SHA do commit. NÃO colar SQL, comandos SELECT, trechos de código, listas de arquivos alterados, diffs ou repetir regras já registradas no Git. Detalhes técnicos ficam nos próprios arquivos versionados e no diff/commit; documentar apenas decisões, estado, testes e informações que não estejam recuperáveis do código. Fornecer comandos ou caminhos somente quando solicitados expressamente ou quando forem indispensáveis para uma ação imediata do responsável. Evitar narrar microetapas ou operações de ferramenta.

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
Antes de alterar código, ler este protocolo, a definição relevante, regras locais do projeto (CLAUDE.md/AGENTS.md) e implementações relacionadas. Desenvolver mantendo compatibilidade e preservando convenções existentes. Criar SQL incremental, com ordem e rollback quando pertinente. Registrar testes automatizados, comandos executados e resultados em TST. Se houver mudanças fora de escopo, justificar na definição. Nunca dizer que executou testes não executados.
Entregar commit/PR e marcar PRONTO_PARA_AUDITORIA, identificando os caminhos alterados.

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
