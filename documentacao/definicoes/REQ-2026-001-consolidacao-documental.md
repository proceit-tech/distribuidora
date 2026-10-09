# REQ-2026-001 — Consolidar documentação e diagnóstico técnico do DistribuNex

Status: PRONTO_PARA_AUDITORIA
Tipo: documentação e levantamento técnico; SEM alterar comportamento funcional.
Responsável por implementação/levantamento: Claude
Revisor independente: ChatGPT
Homologação: responsável PROCEIT

## Objetivo
Documentar fielmente a aplicação, regras de negócio já implementadas, APIs, fluxos, persistência, tabelas, integrações e gaps, antes de iniciar novas funcionalidades. Identificar distinção real/demo sem perder trabalho aprovado nas telas.

## Escopo
RN-01: Ler TODOS os arquivos de código atuais do repositório na branch do requisito (incluindo componentes grandes, tipos, mocks, API routes, config, package e README); gerar mapa de módulos, dependências e fluxo de dados com referências a caminhos/linhas.
RN-02: Para cada módulo, registrar: telas, regras atuais demonstradas pelo código, endpoints, tabelas, validações, permissões, estados, armazenamento e comportamento demo/produção; não inventar regras inexistentes.
RN-03: Levantar estrutura real do PostgreSQL do ambiente definido para o sistema por introspecção SOMENTE LEITURA, sob acesso autorizado; tabelas, colunas, índices, constraints, funções, triggers e políticas. Nunca executar DROP/CREATE em banco existente. Se sem acesso, documentar NAO_VERIFICADO.
RN-04: Verificar autenticação, sessão, autorização, fronteiras empresa/sucursal/depósito, dados sensíveis e segregação de DEMO_MODE, com evidências no código e recomendações alinhadas ao OWASP ASVS.
RN-05: Mapear fluxos críticos de cadastros, recebimentos, movimentos, estoque, listas de preço, faturamento e emissão eletrônica. Documentar o que existe e o que é apenas expectativa de produto; confirmar contratos fiscais antes de especificar campos.
RN-06: Identificar scripts SQL existentes fora do repositório com autorização do responsável, mas não importar automaticamente dumps de produção que contenham dados/segredos. Preparar plano de migrations incrementais sem gerar schema por suposição.
RN-07: Propor plano técnico priorizado em pequenos requisitos futuros, sem implementar funcionalidades nesta etapa.
RN-08: Executar somente validações não destrutivas disponíveis no ambiente de desenvolvimento (por exemplo npm ci, lint, build e testes já existentes), registrar comandos, resultados e limitações.

## Critérios de aceite
CA-01: Matriz de TODOS os módulos/rotas e status REAL/DEMO/PARCIAL/NAO_VERIFICADO.
CA-02: Mapa de APIs, entidades e dependências com evidências de arquivos.
CA-03: Inventário SQL real OU justificativa NAO_VERIFICADO explícita.
CA-04: Lista priorizada de riscos, inconsistências e dívida técnica com referências.
CA-05: Proposta dos próximos requisitos individualizados e sequenciados, preservando UI existente.
CA-06: TST-REQ-2026-001.md com verificações executadas, resultados e lacunas.
CA-07: Claude marca PRONTO_PARA_AUDITORIA, publica commit/PR e informa SHA; ChatGPT audita em AUD-R01.

## Não escopo
Não modificar funcionalidades, não reestruturar rotas, não migrar dados, não trocar autenticação, não fazer deploy, não alterar VM, não criar migrations baseadas em suposições.

## Entregáveis propostos
`documentacao/definicoes/ARQUITETURA-ATUAL.md`, `MAPA-MODULOS.md`, `MODELO-DADOS-ATUAL.md`, `REGRAS-EXISTENTES.md`, `PLANO-EVOLUCAO.md` e `documentacao/testes/TST-REQ-2026-001.md`.

## Dependências
Acesso ao banco vigente e ambiente de execução devem ser explicitamente autorizados pelo responsável antes de inspeção; somente código GitHub está disponível à auditoria inicial.

## Histórico
| Data | Autor | Status | Observação |
|---|---|---|---|
| 2026-10-08 | ChatGPT/responsável | DEFINIDO | Definição inicial |
| 2026-10-08 | Claude | EM_IMPLEMENTACAO | Branch `feature/REQ-2026-001-consolidacao-documental` a partir de `main` @ `7f4230a` |
| 2026-10-08 | Claude | PRONTO_PARA_AUDITORIA | Documentos entregues; RN-03 e scripts externos de RN-06 como NAO_VERIFICADO (sem acesso autorizado); npm ci/lint/build NAO_EXECUTADO (registro npm inacessível). Aguardando AUD-REQ-2026-001-R01 |
| 2026-10-08 | Claude | PRONTO_PARA_AUDITORIA | Complemento antes da R01, a pedido do responsável: §7 de `ARQUITETURA-ATUAL.md` (entidades de acesso para o REQ-2026-002) e renumeração das propostas de `PLANO-EVOLUCAO.md`, porque o número 002 foi definido para multiempresa |

## Caminhos alterados
- `documentacao/definicoes/ARQUITETURA-ATUAL.md` (novo)
- `documentacao/definicoes/MAPA-MODULOS.md` (novo)
- `documentacao/definicoes/MODELO-DADOS-ATUAL.md` (novo)
- `documentacao/definicoes/REGRAS-EXISTENTES.md` (novo)
- `documentacao/definicoes/PLANO-EVOLUCAO.md` (novo)
- `documentacao/testes/TST-REQ-2026-001.md` (novo)
- `documentacao/definicoes/REQ-2026-001-consolidacao-documental.md` (status e histórico)
