# Decisões do responsável — REQ-2026-002

Data de registro: 2026-10-08
Origem: decisões explícitas do responsável PROCEIT recebidas no ChatGPT.
Referências: PR #3 `https://github.com/proceit-tech/distribuidora/pull/3`; `documentacao/testes/AUD-REQ-2026-002-R02.md`.
Natureza: aprovação das decisões de negócio e diretrizes arquiteturais. **NÃO** equivale a aprovação de implementação, execução de testes, migrações ou homologação final.

| Decisão | Deliberação | Condição obrigatória |
|---|---|---|
| D-01 Contas por empresa | APROVADO | Manter login empresa + usuário + senha, contas separadas por empresa nesta versão |
| D-02 União de permissões | APROVADO | União de perfis válidos nunca ultrapassa os limites da empresa e do alcance atribuídos |
| D-03 Administração global PROCEIT | APROVADO | Identidades de plataforma segregadas, MFA obrigatório, acesso de suporte explícito, temporário e auditado, sem bypass |
| D-04 Matriz 37 recursos/138 permissões | APROVADO CONDICIONALMENTE | Revisar a lista por área de negócio, validar concessão inicial, revogação e testes de cada operação antes de implementar; versionar correções da matriz |
| D-05 Escopo vazio | APROVADO | Sem atribuição de sucursal/depósito implica negação nesse nível; alcance TODAS/TODOS só por concessão explícita |
| D-06 Acesso sensível do administrador | AJUSTAR | **Não** conceder automaticamente acesso a custo de produtos, crédito de clientes ou dados bancários de fornecedores apenas por ser administrador. Exigir concessões explícitas e auditáveis por recurso/ação, inclusive para administradores; impedir autoconcessão não autorizada |
| D-07 Retenção de auditoria | APROVADO CONDICIONALMENTE | Cinco anos como objetivo proposto, não como prazo legal universal. Classificar eventos, validar prazos com jurídico/contabilidade e regras de privacidade antes de política automatizada de expurgo; definir acesso, descarte e proteção dos backups |
| D-08 Transferência entre sucursais | APROVADO | Fluxo de envio -> EM_TRANSITO -> recebimento, validação independente dos dois depósitos, estados de cancelamento/perda e reconciliação, com testes |

## Implicações imediatas
1. Atualizar `DESENHO-REQ-2026-002-multiempresa.md`, `MATRIZ-PERMISOS-REQ-2026-002.md` e TST com estas decisões, sobretudo alterando qualquer regra em que `es_administrador` receba permissões sensíveis implicitamente.
2. Registrar no PR as mudanças e o SHA, preservando R01 e R02.
3. Solicitar nova auditoria independente **AUD-REQ-2026-002-R03** para verificar implementação documental das decisões; não gerar código nem scripts SQL funcionais por enquanto.
4. Introspecção PostgreSQL somente leitura (REQ-2026-003) e CI/testes (REQ-2026-004) continuam dependências.
5. Nenhum status HOMOLOGADO pode ser lançado em nome do responsável por estas decisões.

## Pontos ainda abertos (sem alterar a deliberação)
- D-04: revisão final dos detalhes das permissões e testes por módulo.
- D-07: prazos efetivos e base legal por classe de registro.
- Esquema real do banco ainda não inspecionado.
