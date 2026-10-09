# Decisões oficiais complementares — REQ-2026-002 (após AUD-R03)

Data: 2026-10-08
Fonte: aprovação explícita do responsável PROCEIT na conversa ChatGPT.
Referência: PR #3 e `documentacao/testes/AUD-REQ-2026-002-R03.md`.
Status: REGRAS DE NEGÓCIO APROVADAS. Não autoriza implantação, migrações SQL ou homologação técnica.

## D-09 — Ações críticas com concessão explícita — APROVADO
As quatro operações: (1) APROVAR ajuste de estoque; (2) APROVAR pagamento; (3) ANULAR factura; (4) APROVAR nota de crédito, exigem autorização específica por recurso/ação, concedida explicitamente ao usuário, **inclusive se ele for administrador da empresa**. O perfil de administrador NÃO herda automaticamente essas quatro permissões.
- Concessão deve ser rastreável (ator, beneficiário, empresa, recurso, ação, motivo, data, situação).
- Aplicar também segregação de funções: quem cria/solicita não aprova a própria operação.
- A execução exige checagem server-side, alcance de empresa/sucursal/depósito e trilha de auditoria.
- Alteração ou retirada da concessão deve produzir efeito segundo o contrato de revogação do desenho.
- A matriz e o conjunto efetivo de permissões dos perfis devem refletir esta exceção. Não basta ocultar botões.

## D-10 — Dados sensíveis com segundo aprovador independente — APROVADO
Concessão de acesso a custo de produtos, crédito de clientes ou contas bancárias de fornecedores requer **segundo aprovador independente**, além do solicitante/concedente inicial.
- Proibir autoaprovação direta e por perfil, e impedir que duas contas controladas pelo mesmo operador se aprovem mutuamente. A mera criação de conta alternativa não satisfaz independência.
- Registrar solicitação, concedente/proponente, aprovador independente, beneficiário, motivo, empresa, permissões, timestamps, decisão e revogação.
- Concessão somente fica efetiva após aprovação válida; pendente/rejeitada não concede acesso.
- Exceção: quando não houver segundo aprovador independente na empresa, exigir autorização **formal da PROCEIT**, vinculada à solicitação da empresa, com auditoria e identificação de responsável de plataforma; não é bypass automático.
- Definir e testar estados SOLICITADA, APROVADA, REJEITADA, REVOGADA e expiração, quando aplicável; evitar condições de corrida na autorização.
- Revalidar alcance, poderes e independência no momento da aprovação e do uso; não revelar dados sensíveis antes disso.

## Instrução para Claude
1. Ler este documento, `DECISOES-REQ-2026-002-APROVACAO.md` e AUD-R03.
2. Atualizar `DESENHO-REQ-2026-002-multiempresa.md`, `MATRIZ-PERMISOS-REQ-2026-002.md` e `TST-REQ-2026-002.md`: registrar D-09/D-10 e remover qualquer herança implícita de ACCION_CRITICA ou concessão sensível por um só ator.
3. Detalhar fluxos de autorização, verificação de independência, bootstrap de empresa com único administrador, regras de revogação, logs e testes positivos/negativos, inclusive contas intermediárias.
4. Preservar AUD-R01, R02, R03 imutáveis; informar novo SHA e solicitar AUD-R04.
5. Ainda NÃO alterar código funcional nem scripts SQL: dependem da introspecção REQ-003, CI/REQ-004 e aprovação do desenho revisado.

## Pendências que permanecem
D-04 (revisão funcional da matriz); D-07 (validação jurídico-contábil da retenção); PostgreSQL não inspecionado; CI/testes não executados. Nenhuma destas decisões equivale a HOMOLOGADO.
