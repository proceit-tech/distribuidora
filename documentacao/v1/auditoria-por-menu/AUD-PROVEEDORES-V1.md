# Auditoria por menu — Proveedores

**Rota principal:** `/proveedores`  
**Branch:** `feature/NEXIT-2026-001-banco-demo`  
**Estado:** ABERTA — NÃO AUDITADA INTEGRALMENTE — NÃO HOMOLOGADA  
**Responsável pela auditoria estática:** ChatGPT. **Implementação:** Claude Code somente mediante tarefa autorizada. **Homologação operacional/visual:** responsável na VM.

## Escopo e rastreabilidade

Este arquivo é a fonte única da auditoria do menu **Proveedores**. Registrar, com caminho e linha, cada página/subtela, componente, API, serviço, permissão de menu/servidor, tabela, trigger, migration, testes e dependências com outros módulos. Não confundir inventário com execução ou homologação. Ver `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` e `documentacao/v1/AUDITORIA-GERAL-NEXIT-V1-2026-10-12.md`.

## Itens obrigatórios da auditoria completa

- [ ] Todas as rotas e subtelas: navegação, abas, ações, modais, estados de erro e vazio.
- [ ] Campos: origem, exigência, máscara, validação client/server, persistência e retorno.
- [ ] APIs: métodos, status HTTP, consultas, filtros, paginação, transação, concorrência e tratamento de exceções.
- [ ] Autenticação, permissões de ação, isolamento multiempresa e alcance de sucursal.
- [ ] SQL: relações, constraints, índices, FK, trigger, integridade e scripts vinculados.
- [ ] Integrações e dependências entre menus; compatibilidade de dados.
- [ ] Casos de teste: positivos, negativos, limites e regressões; evidências de execução.
- [ ] UX: responsividade 1440/768/375, foco, acessibilidade, textos, confirmação de ações, screenshots reais.
- [ ] Conclusão com todos os achados numerados, severidade, evidência e critério de aceite.

## Achados confirmados até agora (parciais)

A primeira passagem estática identificou **PRV-M01…PRV-M06** (seções I–IV). São achados comprováveis em Git e riscos explicitamente diferenciados, **não** reproduções no PostgreSQL/VM. A auditoria permanece ABERTA.

## Pendências

Primeira passagem INICIADA/PARCIAL em 12/10/2026. Há revisão dirigida de UI, rotas, persistência, governança, SQL e documentos; sem afirmar revisão semântica de cada linha de todos os arquivos, execução HTTP ou cobertura visual. Não atribuir percentual.

## Regra de migrations

O responsável mostrou NEX-001…051 já aplicadas na VM. Proibido editar scripts aplicados, checksums ou reexecutar SQL histórico como se fosse nova migration. Qualquer nova alteração estrutural exige justificativa, aprovação e migration incremental a partir de NEX-052.

## I. Auditoria estática por contrato real — primeira passagem (12/10/2026)

**Branch revisada:** `feature/NEXIT-2026-001-banco-demo`. Tarefa do responsável: auditar o menu Proveedores **enquanto Claude Code corrige Clientes/Productos**. **Nenhuma implementação de Proveedores foi autorizada nesta rodada.** Consultados: `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, progresso real de Proveedores em `PROGRESSO-NEXIT-V1.md`, dicionário `documentacao/banco/nexit/v1/docs/12-DICCIONARIO-PROVEEDORES.md`, `MATRIZ-NORMATIVA-CAMPO-A-CAMPO-PROVEEDORES-V1-2026-10-11.md`, adenda de 14 correções; páginas `app/(private)/proveedores/{page.tsx,nuevo/page.tsx,[id]/page.tsx,_components/proveedor-form.tsx,_components/pestanas/{informacion,bancos,documentos}.tsx}`, APIs `app/api/proveedores/{route.ts,[id]/route.ts,[id]/{gobernanza,eventos,cuentas/[cuentaId]/resolucion,documentos/finalizar}/route.ts}`, módulos `lib/proveedores/{normalizar,shared,sincronizar,cuentas,gobernanza,cliente-api,http,formulario}.ts`, migrations NEX-006/033…037 e contratos de NEX-014/052 para grants. Outras rotas de documento/banco e componentes foram inventariados, **não auditados linha a linha**. Nenhum SQL nem teste local/VM executado.

### Achados novos do código vigente — não reabrir os PRV-A01…A14 já corrigidos

| ID | Severidade | Evidência exata | Impacto / correção mínima esperada |
|---|---|---|---|
| **PRV-M01** | **ALTA — gravação concorrente** | `app/api/proveedores/[id]/route.ts:260-275`: faz `SELECT ... FOR UPDATE` e compara `body.version` somente quando `typeof body.version === 'string'`; sem campo `version`, a guarda é **ignorada** e o PUT completo prossegue. A UI regular envia `version` através de `lib/proveedores/formulario.ts:159-163`, mas um request direto ou cliente antigo não precisa enviá-lo. | Uma requisição sem versão pode sobrescrever alterações de outro operador. Tornar versão **obrigatória** em PUT e devolvê-la como 409 útil se ausente/inválida/divergente (mantendo validação após row lock); não reescrever todas as tabelas nem criar nova migration. Regressão API sem versão, versão anterior, igual e concorrência entre duas abas. |
| **PRV-M02** | **ALTA — referência legada inativada impede edição** | `lib/proveedores/shared.ts:23-38` aplica `activo=true` ao `grupoProveedorId` e `medioPagoId` em **todo POST/PUT**, mesmo quando ambos não mudaram; `app/api/proveedores/[id]/route.ts:292` chama sem contexto da versão antiga; `app/api/proveedores/route.ts:225-255` só devolve grupos e meios de pagamento ativos, e as abas usam essas opções. | O fornecedor anteriormente vinculado a grupo ou meio inativo pode não conseguir salvar telefone/endereço, mesmo sem trocar esses vínculos. Conferir FK atual no banco sob `FOR UPDATE`, aceitar **somente valor histórico idêntico** e negar novo inativo/fora da empresa; exibir vínculo inativo na ficha sem oferecer escolha nova. Regressão POST, PUT legado inalterado, alteração para ativo/inativo, cross-tenant. Não duplicar infraestrutura desnecessariamente; usar padrão já corrigido em Clientes. |
| **PRV-M03** | **ALTA — perda de rascunho e anexo pendente** | `app/(private)/proveedores/_components/proveedor-form.tsx:114-122,~296,~348`: computa `sucio` apenas de `form`, contém `pendientes` (documentos) separado, mas `Volver/Cancelar` são `Link` diretos, sem `useProtegerCambios`/`beforeunload`. A aba `documentos` é montada **condicionalmente** (`:~335`); `DocumentosFicha` mantém `nuevo`/`editando` em `useState` local na aba (`pestanas/documentos.tsx:~82-90`), portanto pode perder rascunho ao trocar aba sem qualquer confirmação. | Perda silenciosa de campos/contatos/contas e anexos na navegação; o rascunho de documento da edição se perde inclusive ao trocar abas. Reutilizar o hook de proteção que Clientes/Productos já usam, incluindo `pendientes`; proteger mudança de aba com borrador local de documento ou manter estado em nível persistente do form, sem wizard. Cobrir navegação interna, fechar/recarregar, voltar, trocar aba com borrador e saída limpa. |
| **PRV-M04** | **MÉDIA — finalização de documentos silenciosamente ignorada** | `app/(private)/proveedores/nuevo/page.tsx:44-58` faz `await fetch('/api/proveedores/{id}/documentos/finalizar', POST)` no caminho sem falhas de upload, mas **não verifica `.ok`** e ainda navega para `/proveedores?ok=creado`; `app/api/proveedores/[id]/documentos/finalizar/route.ts` pode retornar 401/403/404/500. | O provedor existe e os arquivos podem ter sido carregados, mas `carga_documentos_inicial_abierta` permanecer `true` sem aviso, permitindo que o criador que só tem CREAR continue a carregar arquivos. Tratar status HTTP e conexão; se falhar, **não criar outro fornecedor**, preservar seu ID e abrir a ficha com aviso/ação de retry, seguindo o fluxo já existente de recuperação. Regressão 403/500/timeout após upload, retry idempotente. |
| **PRV-M05** | **OBSERVAÇÃO de escala, NÃO bloqueador da V1** | `app/api/proveedores/route.ts:159-226` busca **todos** os fornecedores da empresa (sem `LIMIT/OFFSET`); `app/(private)/proveedores/page.tsx:~205-279,~380-460` carrega todas as linhas e filtra/pagina localmente com `PAGE_SIZE=8`. | Com carteira grande, HTTP e renderização podem degradar. Medir latência e quantidade real em ambiente autorizado antes de justificar paginação remota. Não reimplementar listagem por hipótese. |
| **PRV-M06** | **POLÍTICA DE ACESSO A CONFERIR, não declarar vulnerabilidade sem autorização** | `app/api/proveedores/[id]/route.ts:49-50,140-154,215` entrega **número/alias da conta bancária e `revisionPendiente.datos`** a qualquer sessão com `PROVEEDORES.VER`; `app/api/proveedores/[id]/eventos/route.ts:10-32` devolve antes/depois JSON da auditoria, inclusive eventos de conta. Separadamente existe permissão `PROVEEDORES.APROBAR_BANCO` para decidir alterações; o progresso `PROGRESSO-NEXIT-V1.md` registra visibilidade bancária como decisão ainda não concluída. | O comportamento é **real**, mas a autorização de leitura bancária por `VER` pode ser intencional. Antes de implementar filtro/mascaramento, confirmar a política aprovada de acesso; não presumir que `APROBAR_BANCO` implique permissão de ler cadastro, nem exibir dados fora da empresa. Não é bloqueador automático enquanto a regra não estiver definida. |

## II. Comportamentos corretos e decisões já implementadas — não refazer

- Sessão/permissões `PROVEEDORES.VER/CREAR/EDITAR` nas rotas básicas e `HOMOLOGAR/EVALUAR_RIESGO/BLOQUEAR/APROBAR_BANCO` nas ações próprias; consultas principais filtradas por `empresa_id` da sessão. Confirmação HTTP real/multiempresa permanece pendente, mas não há prova nesta leitura de falta generalizada de RBAC.
- Edição de contas bancárias aprovadas não sobrescreve dados: `lib/proveedores/sincronizar.ts:217-263` cria revisão pendente; `app/api/proveedores/[id]/cuentas/[cuentaId]/resolucion/route.ts` exige permissão específica e grava evento. `NEX-035` mantém índice de principal aprovado por moeda e `NEX-037` adiciona inativação segura de conta aprovada, reativação administrativa e eventos append-only. As correções PRV-AUD-01/02 já constam no progresso; **não reabrir**.
- Carga de arquivos privados com versões e restauração e retenções que exigem certificados: `NEX-036` modela dados, trigger de ativação e exclusão lógica. `NEX-037` reaplica grants idempotentes. O corpo de `sincronizarHijos` trata quatro coleções de forma seletiva, com exclusões explícitas e auditoria — **não confundir com o DELETE-ALL antigo da implantação inicial**.
- `NEX-006:227-231` instala triggers `nex_instalar_heredar_empresa` nas tabelas filhas de Proveedores. Por isso os `INSERT` em `lib/proveedores/sincronizar.ts` que enviam `proveedor_id` sem `empresa_id` explícito **não são defeito**: o trigger herda o tenant do fornecedor. A integridade ainda deve ser confirmada no PostgreSQL real.
- RUC Paraguai e DV módulo 11: `normalizarProveedor` chama `validarIdentificacion` no backend e o formulário o calcula; decimais de preço/percentual são tratados como texto para evitar arredondamento float. Adenda de 14 correções já incorporada; não repetir implementações.

## III. Recorte mínimo recomendado para estabilização de Proveedores, após terminar Clientes/Productos

**Priorizar PRV-M01…M04** — são quatro correções objetivas, predominantemente de API/UI, sem nova regra complexa. PRV-M05 só medir com volume real; PRV-M06 é política de acesso a conferir, sem bloquear a V1 por suposição. Não acrescentar fluxo de compras, pagamento, homologação avançada ou alteração de migrations antigas. **O responsável ainda NÃO autorizou o Claude a implementar Proveedores nesta conversa.**

**Regressões mínimas futuras:** PUT sem versão/obsoleta → 409; legado com grupo e meio inativos inalterados → salva; valores novos inativos/outro tenant → falham; formulários e documentos pendentes não desaparecem em navegação/abas; falha ao finalizar carga não é reportada como sucesso; campos bancários fora da mesma empresa nunca aparecem; estado final do banco e privacidade a verificar no ambiente sob comando humano.

## IV. Limites de evidência e status

**Auditado por leitura estática dirigida do GitHub.** 0 testes locais, 0 TypeScript/ESLint/build executados nesta análise; 0 APIs/PG/VM/SIFEN acessados, 0 imagens/screenshot visual; execução de NEX-033…037 na VM não foi confirmada nesta rodada. A documentação do repositório registra migrations NEX-001…051 como já aplicadas segundo responsável, mas qualquer nova alteração de schema exigiria nova NEX-054+ conforme estado atual de NEX-052/053; nunca editar/aplicar retroativamente migrations executadas sem verificar ledger.

**Estado:** PRV-M01 a PRV-M04 confirmados estaticamente como problemas funcionais; PRV-M05 performance não demonstrada, PRV-M06 política pendente de definição. **PROVEEDORES AUDITORIA ABERTA — NÃO HOMOLOGADO**. Nenhum código, SQL ou dado da VM modificado; não interferir na entrega Claude Code de Clientes e Productos.

## V. Handoff autorizado ao Claude Code — estabilização pontual Proveedores (12/10/2026)

**Autorização do responsável:** após receber os commits finais de Productos/Clientes, solicitou auditoria independente desses commits e **encaminhamento da implementação de Proveedores ao Claude**, incluindo observações reais dos menus anteriores se houvesse bloqueios. Pareceres publicados: `AUD-PRODUCTOS-V1.md` §XXIV, `AUD-CLIENTES-V1.md` §IX — **sem novo bloqueio de código comprovado**, apenas homologação operacional humana pendente. **Esta tarefa autoriza exclusivamente PRV-M01…M04.**

### Quatro correções autorizadas

1. **PRV-M01 / concorrência otimista:** tornar `body.version` **obrigatório e validado** em `PUT /api/proveedores/[id]`; ausência, versão malformada ou diferente da atualmente bloqueada com `FOR UPDATE` retornam **409** e nenhuma alteração em registro/filhos/eventos. Usar contrato atual `actualizado_at` com precisão suficiente e formato atual de GET; sem nova coluna/migration. Regressão via requisição direta sem token, obsoleto e correto, inclusive 2 abas simuladas.
2. **PRV-M02 / FKs históricos inativos:** permitir grupo e meio de pagamento originalmente atribuídos ao fornecedor se **inalterados e pertencentes à empresa**; novas escolhas devem estar ativas/da mesma empresa. Aplicar na comparação servidor após bloquear linha; exibir vínculo antigo como `(inactivo)` no selector se o catálogo ativo não o contém. Não anular/gravar null nem tornar inativos livremente selecionáveis. Usar padrão aprovado já implementado em Clientes; evitar ampliar o contrato de catálogos.
3. **PRV-M03 / rascunhos:** integrar `useProtegerCambios` ou equivalente já oficial em `proveedor-form`, incluindo mudanças do formulário, filhos e documentos pendentes. Evitar perda de documento em edição (`DocumentosFicha` estado local ao desmontar/trocar aba): persistir borrador entre abas ou pedir confirmação específica antes de descartá-lo; confirmar `Volver`, `Cancelar`, fechamento/recarregamento com alterações e permitir saída limpa sem alerta. Não duplicar modais nem complicar UX.
4. **PRV-M04 / finalizar carga documental:** em novo fornecedor verificar **resposta `.ok`** e falha de rede de `POST /documentos/finalizar`; nunca exibir sucesso completo sem finalizar. O fornecedor já foi salvo — **não realizar outro POST de criação** ao reintentar. Conservar o ID e oferecer recuperação segura via fluxo existente com aviso e reintento. Atenção: o criador com só `PROVEEDORES.CREAR` tem autorização transitória de upload/finalização, mas a página de ficha exige `PROVEEDORES.VER`; **não supor que encaminhar esse criador à ficha `/proveedores/[id]` resolverá o erro**. Resolver o caso dentro da autoridade existente (p.ex. retry direto da finalização para criador autorizado) sem conceder leitura/edit gerais indevidos. Regressões HTTP 401/403/500, timeout, sucesso e idempotência.

### Limites de escopo e verificações

- NÃO reabrir controles bancários/homologação/retenciones e documentos versionados já aprovados; não acrescentar outro módulo, wizard ou refatoração geral. **PRV-M05** (paginação remota) requer prova de lentidão e fica fora. **PRV-M06** (visibilidade de dados bancários sob `PROVEEDORES.VER`) é uma política NÃO decidida: não expor novos dados nem mudar RBAC/mascaramento por presunção. Se descobrir exposição efetiva entre empresas, interromper e apontar como blocker.
- Revisar coerência com NEX-006/033…037 e testes de Proveedores já existentes. Não editar migrations NEX-001…051 aplicadas; não alterar NEX-052/053 apenas por serem dependências já em validação de Clientes/Productos. Se encontrar necessidade estrutural real, explicar antes de gerar nova migration; esta rodada foi planejada para correções de código.
- Antes de tocar qualquer arquivo: `git status`, confirmar branch `feature/NEXIT-2026-001-banco-demo`, sincronização `git fetch` + fast-forward seguro (nunca descartar arquivos locais), ler integralmente `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, seção pertinente de `PROGRESSO-NEXIT-V1.md` e esta ficha/decisões oficiais vigentes.
- Executar testes locais relevantes de API/validador/UI e regressões de permissões multiempresa, versões, referências legadas e documentos. Rodar `tsc`, ESLint e `next build` e reportar números/falhas; não inventar resultado de navegador ou banco. Atualizar **somente o progresso canônico** quando necessário, sem editar `AUD-*`, arquivos de auditoria, nem duplicar documentos.
- Commit e push **somente na branch oficial**; informar SHA completo, testes e bloqueios reais, parar para auditoria ChatGPT. **Não acessar VM, Docker, PostgreSQL real, executar SQL/migrations, SIFEN ou deploy.** Produtos e Clientes não entram no escopo funcional desta tarefa; aprovação estática de R03 permanece, pendente homologação operacional pelo responsável.

**Status:** ESCOPO DE IMPLEMENTAÇÃO PRV-M01…M04 AUTORIZADO PARA CLAUDE CODE; **AINDA NÃO IMPLEMENTADO**. Proveedores ABERTO/NÃO HOMOLOGADO. Não há autorização para migrar ou homologar outros menus.
