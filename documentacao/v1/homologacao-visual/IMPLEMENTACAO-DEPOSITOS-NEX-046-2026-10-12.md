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

## Decisão do responsável — CRUD completo com atribuições de usuários (2026-10-12)

**APROVADO para desenvolvimento, ainda NÃO implementado nem homologado.** O módulo Depósitos da V1 deve ser completo: cadastro, consulta, edição, ativação/inativação (sem exclusão física) **e administração dos usuários autorizados a cada depósito**. Um depósito sem gestão de atribuições não atende ao escopo aprovado. Esta decisão prevalece sobre a lacuna de atribuição usuário↔depósito indicada anteriormente; não confundir autorização para desenvolver com autorização para executar SQL na VM.

**Contrato funcional obrigatório para Claude Code:**
1. Ler a versão atual de `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, trechos pertinentes de `PROGRESSO-NEXIT-V1.md` e as decisões canônicas de Inventário; sincronizar a branch com segurança e inspecionar migrations, tela, APIs e funções SQL efetivamente existentes antes de editar. Não repetir documentação ou listas de arquivos.
2. Na tela de Depósitos, apresentar os usuários da empresa e quais estão autorizados no depósito, respeitando perfis/permissões e alcance por empresa, sucursal e depósito. Permitir **atribuir e revogar** autorização de usuários em fluxo administrativo explícito, com confirmação quando a revogação retirar acesso operacional. Distinguir claramente usuário com alcance TODOS (não depende de vínculo individual) de usuário com alcance ASIGNADOS (usa `usuario_deposito`); não apresentar controles de vínculo que prometam restringir quem tem TODOS.
3. Reutilizar `usuarios`, `usuario_deposito`, `usuario_sucursal`, `alcance_depositos`, `alcance_sucursales` e a arquitetura de autorização existente; multiempresa inegociável, operações com verificação server-side e SQL. Não criar uma segunda matriz paralela de acessos, não conceder `INVENTARIO.*` a todos os perfis por padrão e não modificar usuário ou perfil de forma implícita.
4. Atualizar **a NEX-046 ainda não aplicada** e sua reversão, se necessário, para incluir funções SQL específicas de gestão de atribuições com privilégio EXECUTE restrito ao runtime, integridade por empresa e consistência com os controles de acesso existentes. Como NEX-046 não foi aplicada, é permitido revisá-la nesta etapa; **antes de fechar, confrontar com o registro de migrations e o estado documentado de aplicação**; se houver evidência de execução, não alterar checksum e preparar incremental. Não executar SQL/VM/Docker.
5. Revisar os quatro riscos da auditoria: (a) concorrência entre inativação e criação de saldo, bloquear inativação com saldo de qualquer estado/propriedade sem race; (b) autoatribuição silenciosa do criador com ASIGNADOS — tornar explícita ou devidamente justificada na experiência e não alterar alcance geral do usuário; (c) transferência de sucursal e efeito sobre usuários/depósitos/movimentos com vínculos preexistentes — preservar consistência; (d) não perder depósito histórico ao inativar. Código de depósito continua imutável; não permitir exclusão física via aplicação.
6. Integrar navegação e ações ao padrão visual de Clientes/Productos/Catálogos, com estados vazios, erro por campo, confirmação, proteção de alterações e informação clara sobre permissões. Sem mocks no fluxo real. Preservar Stock, Movimientos, Reposición e seus cálculos/transações.
7. Verificações locais pertinentes sem homologação por Claude; ChatGPT audita o commit, responsável valida no único ambiente real. Ao terminar, commit + push na branch oficial e apenas resultado curto, bloqueios reais e SHA; parar.

**Critérios de aceite:** o administrador autorizado consegue criar depósito e administrar usuários com ASIGNADOS; atribuição concede acesso somente ao depósito autorizado e à empresa certa; revogação remove acesso sem apagar histórico; contas TODOS têm indicação correta de acesso amplo; usuários fora da empresa não aparecem nem são vinculáveis; as APIs rejeitam acesso não autorizado; inativação com saldo é segura; alteração de sucursal não deixa vínculos inconsistentes; nenhum lançamento ou custo é modificado por operações cadastrais. O responsável define homologação após publicação deliberada.
