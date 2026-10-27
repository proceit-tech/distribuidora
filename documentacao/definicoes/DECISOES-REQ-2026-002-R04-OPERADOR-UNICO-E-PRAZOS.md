# Decisões oficiais complementares — REQ-2026-002 (após AUD-R04)

Data: 2026-10-09
Origem: decisão expressa do responsável da PROCEIT comunicada ao ChatGPT.
Referências: PR #3; `documentacao/testes/AUD-REQ-2026-002-R04.md`.
Situação: REGRAS DE NEGÓCIO APROVADAS. Não autoriza implementação, migrações, deployment ou homologação.

## D-11 — Empresa com único operador — APROVADO
Quando a empresa contar com um único operador e não houver segunda pessoa independente para segregar criação e aprovação de ação crítica, **é obrigatória autorização formal da PROCEIT para CADA operação crítica**.

1. A operação permanece pendente e sem efeito até a autorização formal.
2. É proibida autoaprovação, inclusive pelo uso de outras contas da mesma pessoa.
3. A solicitação identifica empresa, operador, tipo de ação, registro/objeto afetado, justificativa e documento formal de respaldo da empresa.
4. Um responsável identificado da PROCEIT, com autenticação multifator (MFA) e competência explícita na plataforma, analisa e autoriza ou rejeita aquela operação específica.
5. Registrar solicitante, beneficiário, responsável PROCEIT, data/hora, decisão, motivo, documento vinculado e ID da operação na auditoria da empresa e na trilha da plataforma.
6. Uma autorização não vale para outras operações nem funciona como concessão permanente para autoaprovação.
7. Verificar na execução que a autorização corresponde ao objeto e à versão da operação e continua válida. Evitar reutilização/replay e corridas de aprovação.
8. Se a PROCEIT rejeitar, a operação não é aprovada nem executada. O fluxo de múltiplos operadores continua sujeito à segregação normal.

## D-12 — Prazos iniciais para concessões — APROVADOS
- Permissões de **DATO_SENSIBLE**: validade inicial de **180 dias**.
- Permissões de **ACCION_CRITICA**: validade inicial de **365 dias**.
- Solicitação sem decisão: expira após **7 dias**.
- Aprovador independente: deve possuir o poder de aprovar há **pelo menos 7 dias** antes de decidir.

### Condições obrigatórias
1. Os valores são parâmetros controlados e auditados; toda alteração exige permissão adequada, motivo, registro da versão anterior e nova e respeito às políticas de segurança.
2. Os prazos não representam direito permanente: bloqueio, revogação ou expiração retiram imediatamente a capacidade de novas ações conforme contrato de autorização.
3. Renovação não ocorre automaticamente sem nova solicitação e aprovação conforme regras D-09/D-10.
4. A antecedência mínima de 7 dias do aprovador não pode ser contornada por troca de conta, perfil ou administrador, nem por parâmetros alterados retroativamente.
5. A exceção formal PROCEIT prevista para ausência de aprovador independente não é dispensa de MFA, autorização ou auditoria.
6. Casos urgentes devem seguir processo formal de plataforma, sem alteração silenciosa dos prazos nem bypass.

## Instruções de atualização ao Claude
- Ler este documento e a AUD-R04.
- Incorporar D-11 no `DESENHO-REQ-2026-002-multiempresa.md`, especialmente §4.7.7, descrevendo o fluxo de autorização **por operação**, e não uma permissão geral.
- Incorporar D-12 ao desenho, à matriz e ao TST como prazos oficialmente aprovados; documentar parametrização controlada e casos de teste de limite, expiração, alteração, revogação, reuso e concorrência.
- Definir evidências necessárias para independência de aprovadores e processo de verificação de identidade; evitar afirmar que linhagem de contas elimina conluio.
- Preservar as auditorias R01-R04 e os arquivos de decisões anteriores.
- Publicar commit SHA e pedir AUD-REQ-2026-002-R05 caso o desenho seja alterado substantivamente.
- **Não alterar código funcional nem criar/executar DDL** nesta etapa. Dependências: REQ-2026-003 introspecção PostgreSQL real; REQ-2026-004 CI e testes; D-04 validação funcional da matriz e D-07 validação de retenção.

## Limites
A aprovação humana de D-11/D-12 não concede nota 10/10 ao software, não comprova testes nem representa HOMOLOGADO.
