# PROCEIT — Protocolo de desenvolvimento colaborativo por IA (v1.0)

Este repositório utiliza o GitHub como fonte única de verdade. Claude implementa; ChatGPT audita; o responsável humano realiza a homologação final. Nenhuma aprovação técnica substitui a homologação humana.

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
