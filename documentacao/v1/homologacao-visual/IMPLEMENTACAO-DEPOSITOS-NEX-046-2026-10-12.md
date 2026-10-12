# Implementação — Gestão de Depósitos (etapa B) e NEX-046

**2026-10-12 · Claude Code.** Migration **versionada e NÃO aplicada** (`migraciones/NEX-046-depositos-gestion.sql`; reversão `scripts/reversion-NEX-046.sql`). Sem SQL real, sem VM, sem deploy. Não validado em navegador nem em PostgreSQL; não homologado.

## O que entrega

- **Permissões** `INVENTARIO.VER / CREAR / EDITAR` (classe OPERACIONAL) criadas em `permisos`; **não são atribuídas a nenhum perfil**. O administrador da empresa as tem por definição; qualquer outro perfil só por decisão expressa do responsável (nenhuma concessão indiscriminada).
- **Funções SECURITY DEFINER** `deposito_crear`, `deposito_editar`, `deposito_cambiar_estado` (+ auxiliares `deposito_en_alcance`, `sucursal_en_alcance`): validam permissão, empresa e alcance **dentro** da transação. O rol da aplicação só recebe EXECUTE; **não ganha INSERT/UPDATE/DELETE em `depositos`**.
- **Sem exclusão física:** não existe DELETE para a aplicação; as FKs de movimentos/saldos impedem apagar depósito com histórico. Não se criou trigger de DELETE porque NEX-012 depura depósitos de empresas DEMO.
- **Código imutável** (trigger `depositos_codigo_inmutable`), também empresa e `es_de_terceros`. Unicidade do código sem diferenciar maiúsculas (índice novo; a migration **aborta sem alterar dados** se já houver códigos que só diferem em maiúsculas).
- **API** `/api/depositos` (GET/POST), `/api/depositos/[id]` (GET/PATCH), `/api/depositos/[id]/estado` (POST). `empresa_id` e usuário da sessão; fora do alcance = 404; PATCH rejeita o código.
- **Tela** `/depositos` (layout `INVENTARIO.VER`): lista com busca/estado/ordem, formulário no padrão de Catálogos (erro e foco por campo, aviso de alterações não salvas), editar nome/sucursal, ativar/inativar com confirmação. **Menu habilitado** (`V1_HREFS`) agora que página, APIs e permissões existem.
- **Integração:** Movimientos só oferece depósitos **ativos e autorizados** para operar; histórico de Movimientos e Stock mantêm os inativos do alcance; Reposición só planeja depósitos ativos. Nenhum cálculo, função de inventário, custo ou saldo foi alterado.

## Decisões tomadas por incompatibilidade concreta (para confirmação do auditor/responsável)

1. **Inativar com saldo é bloqueado** (`NEX:DEPOSITO_CON_SALDO`): `usuario_puede_deposito` exige depósito ativo, então um depósito inativo com saldo deixaria esse stock sem poder ser movido nem ter movimentos anulados. Inativar com histórico mas sem saldo é permitido (como decidido).
2. **O criador com alcance `ASIGNADOS` fica atribuído ao depósito novo** (senão não o veria nem operaria); o alcance dos demais usuários não muda. Não existe tela de atribuição de depósitos a usuários nesta etapa.
3. **Sucursal:** ativa e dentro do alcance do usuário (`alcance_sucursales`/`usuario_sucursal`) ao criar ou ao trocar; se não muda, é conservada.
4. **Depósitos de terceiros** (`es_de_terceros`): sem criação/edição por esta tela (semântica não decidida); as funções sempre criam `false`.
5. **Não decidido e não implementado:** unicidade de nome, auditoria própria de alterações de depósito, atribuição usuário↔depósito.

## Ordem de aplicação (responsável)

Backup → aplicar NEX-046 (runner existente) → atualizar o app. Se o app for atualizado antes da migration, a lista funciona para administradores, mas criar/editar/inativar falha até aplicar a migration. Atribuir `INVENTARIO.*` a perfis não administradores é decisão posterior.

## Movimiento não encontrado após anular

O detalhe substituía a tela por «Movimiento no encontrado» se a recarga pós-anulação não devolvia o movimento (ocultando o resultado). Agora conserva o que está mostrado e avisa que a anulação foi confirmada mas não pôde ser reconsultada. A API de anulação já usa o mesmo alcance do histórico.
