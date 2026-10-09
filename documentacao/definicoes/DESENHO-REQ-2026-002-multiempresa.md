# DESENHO-REQ-2026-002 — Multiempresa, usuários, perfis e menus

Requisito: `REQ-2026-002-multiempresa-usuarios-perfiles-menus.md` · Autor: Claude · Data: 2026-10-08
Base analisada: `main` @ `ff77929` (o código é o mesmo de `7f4230a`; só o REQ foi acrescentado)
Situação: **PROPOSTA PARA APROVAÇÃO.** Nenhum código, nenhum SQL executável e nenhuma migration fazem parte desta entrega. Este documento e a `MATRIZ-PERMISOS-REQ-2026-002.md` precisam ser auditados (AUD-REQ-2026-002-R01) e aprovados pelo responsável antes da implementação.

Documentos de apoio, no PR do REQ-2026-001 (branch `feature/REQ-2026-001-consolidacao-documental`): `ARQUITETURA-ATUAL.md` §2 e §7, `MODELO-DADOS-ATUAL.md`, `PLANO-EVOLUCAO.md`.

## 1. Pontos de partida

### 1.1 O que já existe e se mantém
| Item | Evidência | Decisão de desenho |
|---|---|---|
| Login por empresa + usuário + senha | `app/api/auth/login/route.ts:128` | Mantido (RN-03 do REQ) |
| `empresa_id` da sessão em todas as gravações | `clientes/route.ts:827`; `proveedores/route.ts:651`; `productos/route.ts:272` | Mantido; vira regra obrigatória da camada de acesso |
| Perfis e estado do usuário relidos a cada requisição | `lib/auth/session.ts:109-125` | Mantido: é o que garante revogação imediata (RN-09) |
| Tabelas `perfiles`, `permisos`, `perfil_permiso`, `usuario_perfil` | `lib/auth/permissions.ts:15-23` | Reaproveitadas, sujeitas à conciliação com o banco real |
| Bloqueio por tentativas e `eventos_seguridad` | `login/route.ts:150-252` | Mantido; ampliado para eventos de administração |
| Validação de catálogo por empresa (`validarReferenciaEmpresa`) | `clientes/route.ts:272` | Generalizada para todas as APIs |

### 1.2 O que precisa ser corrigido
| ID | Problema | Evidência | Correção proposta (seção) |
|---|---|---|---|
| G-01 | Nenhuma rota verifica permissão | `permissions.ts` com 0 importadores | §4 Camada de autorização |
| G-02 | Menu completo quando não há permissões | `lib/navigation/menu.ts:321-322`; `server-context.ts:37-38` | §6 Menu |
| G-03 | Perfil pode, em tese, ser de outra empresa (o código não confere) | `session.ts:116-117`; `permissions.ts:17-22` | §3 Modelo (FK composta) |
| G-04 | Dois critérios de administrador (`codigo = 'ADMIN'` × `es_administrador`) | `server-context.ts:15`; `permissions.ts:22` | §4.3 |
| G-05 | `POST /api/productos` aceita IDs de outras empresas | `productos/route.ts:272-410` | §3.3 e §4.4 |
| G-06 | Sem sucursal nem alcance de depósito | `ARQUITETURA-ATUAL.md` §7 | §5 Alcance |
| G-07 | Empresa desativada não derruba sessões | `session.ts:109-125` | §4.2 |
| G-08 | Demo concede administrador por cookie constante | `session.ts:13,92` | §8 Demo |
| G-09 | Auditoria só de login; `app.usuario_id` só no login | `login/route.ts:220` | §7 Auditoria |
| G-10 | Sem API nem telas de administração de usuários e perfis | menu `/administracion/*` sem página | §9 APIs e telas |

## 2. Decisões pendentes (D-01 a D-05) e recomendação

O responsável decide; a recomendação abaixo é a hipótese adotada no restante do desenho.

| ID | Pergunta | Recomendação | Motivo | Impacto se a decisão for outra |
|---|---|---|---|---|
| D-01 | Um mesmo humano em várias empresas: identidade única ou contas separadas? | **Contas separadas por empresa** nesta fase | Mantém o login atual (RN-03) e o isolamento é mais simples; nada no modelo impede criar depois uma tabela `identidades` ligando contas | Identidade única exige seletor de empresa após o login e sessão com empresa ativa trocável |
| D-02 | Agregação de vários perfis | **União das permissões concedidas**, sem negação explícita (como propõe o REQ) | Simples de explicar e testar | Negação explícita exige precedência e testes adicionais |
| D-03 | Funções exclusivas do administrador global PROCEIT | Criar, suspender e reativar empresas; manter o catálogo global de permissões; suporte com acesso auditado e com motivo | Separa plataforma de empresa (RN-08) | — |
| D-04 | Lista definitiva de permissões e alcance | Proposta na `MATRIZ-PERMISOS-REQ-2026-002.md` | — | — |
| D-05 (nova) | Usuário sem sucursal ou depósito atribuído vê o quê? | **Nada fora do nível empresa** (negação por padrão); "todas as sucursais" precisa ser marcado de forma explícita | Evita acesso amplo por omissão (mesma lógica de CA-06) | Se "vazio = tudo", um cadastro incompleto vira acesso total |

## 3. Modelo de dados proposto

**Não é DDL.** É o alvo conceitual. As migrations só serão escritas depois da linha de base do banco real (REQ-2026-003 proposto) e da conciliação coluna a coluna; colunas que já existirem não são recriadas.

### 3.1 Princípios
1. **Toda tabela de negócio tem `empresa_id NOT NULL`**, exceto os catálogos globais declarados (países, departamentos, distritos, cidades, moedas, unidades de medida, impostos, condições de pagamento, incoterms e o catálogo de permissões). A lista de globais precisa ser confirmada (RN-01).
2. **Chave composta para impedir referência cruzada (RN-11):** cada tabela de empresa ganha `UNIQUE (empresa_id, id)`, e as FKs entre tabelas da mesma empresa passam a ser `(empresa_id, x_id) REFERENCES x (empresa_id, id)`. Assim, o banco recusa um produto da empresa A apontando para uma categoria da empresa B, mesmo que a aplicação falhe.
3. **Unicidade sempre composta com a empresa**, por exemplo `(empresa_id, lower(usuario))` e `(empresa_id, codigo)` em perfis.
4. **RLS como segunda barreira, numa fase posterior (§3.4)**, depois que os testes de isolamento existirem.

### 3.2 Entidades de acesso

| Entidade | Situação | Colunas-alvo (as existentes são mantidas) | Regras |
|---|---|---|---|
| `empresas` | existe | `id, codigo, razon_social, ruc, activo, suspendida_at` | `codigo` único global (é usado no login) |
| `sucursales` | **nova** (nenhuma tabela é referenciada hoje; confirmar no banco) | `id, empresa_id, codigo, nombre, establecimiento_sifen, activo` | `UNIQUE (empresa_id, codigo)`; a sucursal liga-se ao estabelecimento SIFEN |
| `depositos` | existe | + `sucursal_id` (FK composta), se não existir | Todo depósito pertence a uma sucursal da mesma empresa |
| `usuarios` | existe | + `alcance_sucursales` (`TODAS` \| `ASIGNADAS`), `alcance_depositos` (`TODOS` \| `ASIGNADOS`), `baja_at`, `version_acceso` | `sucursal_id` atual vira "sucursal padrão" e precisa estar entre as atribuídas. Baixa é lógica (RN-03) |
| `usuario_sucursal` | **nova** | `empresa_id, usuario_id, sucursal_id` | FKs compostas; PK `(usuario_id, sucursal_id)` |
| `usuario_deposito` | **nova** | `empresa_id, usuario_id, deposito_id` | FKs compostas; o depósito deve estar numa sucursal atribuída ao usuário |
| `perfiles` | existe | `id, empresa_id, codigo, nombre, descripcion, es_administrador, es_sistema, activo` | Se hoje não houver `empresa_id`, a migration cria cópias por empresa (procedimento na fase 2). `es_sistema` impede apagar o perfil de administrador da empresa |
| `permisos` | existe (global) | `id, codigo` (`RECURSO.ACCION`), `recurso, accion, modulo, descripcion, nivel_alcance` (`EMPRESA` \| `SUCURSAL` \| `DEPOSITO`), `es_sensible` | Catálogo global mantido pela PROCEIT (D-03). Uma empresa não cria permissões, só as combina em perfis |
| `perfil_permiso` | existe | + `empresa_id` | FK composta para `perfiles`; FK simples para `permisos` (global) |
| `usuario_perfil` | existe | + `empresa_id`, `asignado_por`, `asignado_at` | FK composta para `usuarios` e para `perfiles`: torna impossível atribuir perfil de outra empresa (G-03) |
| `auditoria_acceso` | **nova** (ou reaproveitar a tabela de auditoria, se existir no banco) | `id, empresa_id, actor_usuario_id, accion, entidad, entidad_id, antes jsonb, despues jsonb, ip, user_agent, created_at` | Só inserção; sem senhas, hashes ou tokens (RN-10) |
| Administrador global | **nova** | `usuarios_plataforma` separada de `usuarios` | Não pertence a nenhuma empresa; login próprio, fora do escopo desta fase de implementação |

Menus **não** viram tabela: continuam em código (`lib/navigation/menu.ts`), cada item ligado a uma permissão. O que varia por empresa é o perfil, não a estrutura do menu. Isso evita dados de menu divergentes do código das telas.

### 3.3 Tabelas de negócio já referenciadas
- Todas as 46 tabelas de `MODELO-DADOS-ATUAL.md` §2 entram no inventário de tenant: confirmar `empresa_id`, `UNIQUE (empresa_id, id)` e as FKs compostas.
- As tabelas filhas (`cliente_contactos`, `producto_codigos` etc.) herdam a empresa pelo pai. Decisão proposta: incluir `empresa_id` também nelas (redundante, mas permite RLS simples e FKs compostas). A alternativa é RLS com `EXISTS` no pai, mais lenta.

### 3.4 Row Level Security (fase 4)
- Papel de banco da aplicação **sem** `BYPASSRLS` e que não é dono das tabelas; `ALTER TABLE … ENABLE` e `FORCE ROW LEVEL SECURITY`.
- Política padrão: `USING (empresa_id = current_setting('app.empresa_id', true)::uuid)` e `WITH CHECK` igual.
- O contexto é definido **dentro de cada transação** com `set_config('app.empresa_id', …, true)` (equivalente a `SET LOCAL`). Isso é obrigatório com o `Pool` do `pg`: um `SET` de sessão vazaria para a próxima requisição que reutilizar a conexão.
- Sem contexto definido, `current_setting(..., true)` retorna NULL e a política não devolve linhas (falha fechada).
- Operações de plataforma (D-03) usam um papel separado, auditado.

## 4. Camada de autorização no servidor

Segue a recomendação oficial do Next.js de verificar autenticação e autorização perto dos dados (camada de acesso a dados), e não apenas no layout ou em `proxy` (o antigo `middleware`), que fica opcional e só para redirecionamento otimista.

### 4.1 Contrato
Um único módulo `server-only` (proposto: `lib/auth/access.ts`):

```ts
type AccessContext = {
  sessionId: string;
  usuarioId: string;
  empresaId: string;
  permisos: ReadonlySet<string>;          // "CLIENTES.VER", ...
  esAdministradorEmpresa: boolean;
  alcance: {
    sucursales: "TODAS" | ReadonlySet<string>;
    depositos: "TODOS" | ReadonlySet<string>;
  };
  demo: boolean;
};

getAccessContext(): Promise<AccessContext | null>          // sessão + permissões + alcance em 1–2 consultas
requirePermission(codigo: string): Promise<AccessContext>  // 401 sem sessão; 403 sem permissão
can(ctx, codigo): boolean                                   // para montar a UI
assertSucursal(ctx, sucursalId) / assertDeposito(ctx, depositoId)  // 403 fora do alcance
withTenantTx(ctx, fn)  // BEGIN; set_config app.empresa_id/app.usuario_id/app.ip (local); fn; COMMIT
```

### 4.2 Regras
1. **Negação por padrão:** toda rota de API e toda página privada declara a permissão exigida. Rota sem declaração não é exposta; um teste automatizado percorre `app/api/**/route.ts` e falha se algum handler não chamar `requirePermission`.
2. **401 × 403:** sem sessão → 401 (páginas: redirecionar para `/login`); com sessão e sem permissão → 403, com mensagem genérica em espanhol ("No tiene permiso para realizar esta acción.") e evento registrado.
3. **Permissões calculadas a cada requisição**, a partir de `usuario_perfil → perfiles (activos, da mesma empresa) → perfil_permiso → permisos`. Não são guardadas no cookie nem em cache entre requisições. Assim, mudar um perfil vale na próxima requisição (RN-09, CA-07). Se o custo pesar, um cache por `version_acceso` pode ser acrescentado depois.
4. A consulta da sessão passa a exigir **empresa ativa** (G-07) e perfis com o mesmo `empresa_id` do usuário (G-03).
5. **Bloquear, dar baixa ou desativar** um usuário também revoga as sessões abertas (`UPDATE sesiones_usuario SET revocada_at = now()`) na mesma transação. Isso é redundante com a checagem por requisição, mas deixa o efeito explícito e auditável.
6. **Páginas:** cada página privada chama `requirePermission("<RECURSO>.VER")` no servidor. Hoje as páginas são Client Components inteiros, então a proposta é um `layout.tsx` por módulo (`app/(private)/clientes/layout.tsx` etc.) que faz a checagem no servidor e não muda a tela. Botões de ação (Nuevo, Editar, Exportar, Anular) recebem `can()` por props ou contexto e ficam ocultos ou desabilitados, sem redesenho; o servidor continua sendo a barreira.

### 4.3 Administrador da empresa
- Um único critério: `perfiles.es_administrador = true` no perfil **da própria empresa**. O código literal `ADMIN` (`server-context.ts:15`) deixa de ter significado.
- O administrador recebe todas as permissões do catálogo com `nivel_alcance` de empresa, sucursal ou depósito, **limitadas à própria empresa**. Ele nunca recebe permissões de plataforma (`PLATAFORMA.*`), que nem existem para usuários de empresa (RN-08).
- Proteções contra autobloqueio:
  - não é possível remover o último administrador ativo da empresa;
  - não é possível tirar de si mesmo a permissão de administrar perfis;
  - o perfil `es_sistema` não pode ser apagado.

### 4.4 Validação de referências
Função genérica `assertMismaEmpresa(tx, tabla, id, empresaId)` aplicada a **todo** ID recebido no corpo (corrige G-05). Fica redundante com as FKs compostas depois da fase 2, mas é ela que gera a mensagem de erro amigável.

## 5. Alcance por sucursal e depósito (RN-07)

| Nível da permissão | Exemplo | Regra |
|---|---|---|
| EMPRESA | `CLIENTES.VER`, `PERFILES.EDITAR` | Vale para toda a empresa |
| SUCURSAL | `FACTURAS.CREAR`, `CAJA.VER` | O registro tem `sucursal_id`; listagens filtram pelas sucursais do usuário; criação e edição exigem sucursal atribuída |
| DEPOSITO | `MOVIMIENTOS_STOCK.CREAR`, `RECEPCIONES.CREAR` | Origem e destino precisam estar entre os depósitos do usuário; na transferência, a regra proposta é exigir **ambos** (decisão a confirmar na D-04) |

- Um ID fora do alcance, mesmo da própria empresa, responde 403 sem revelar se existe (CA-08). Em leituras por ID, a resposta é 404 para não confirmar a existência.
- O stock global (soma de depósitos) mostra só os depósitos do alcance do usuário.
- Exportações aplicam o mesmo filtro do que é listado na tela (CA-01: "incluindo exportações").

## 6. Menu filtrado (RN-05, CA-04, CA-06)

1. `getShellContext` passa a enviar as permissões reais. `resolveNavigation` muda para **falhar fechado**: lista vazia → menu vazio (só o Dashboard, que exige `DASHBOARD.VER`) e nunca o menu completo. A regra "lista vazia = tudo" (`menu.ts:321-322`) é removida.
2. Cada item do menu passa a usar o código granular da matriz (`ORDENES_COMPRA.VER` em vez do `COMPRAS.VER` compartilhado). Um grupo aparece se ao menos um item for visível.
3. Itens cujas páginas ainda não existem ficam **ocultos** por uma marca `implementado: false` no próprio `menu.ts`, independente de permissão (R-19). O usuário não vê links que levam ao 404.
4. O Dashboard mostra só os cartões e atalhos cujos módulos o usuário pode ver. Hoje os números são estáticos (DEMO); trocar os números não faz parte deste REQ.
5. O menu é calculado no servidor e enviado pronto. O cliente não recebe a lista completa para filtrar.

## 7. Auditoria (RN-10)

Registrar em `auditoria_acceso`, na mesma transação da alteração:

| Evento | Dados |
|---|---|
| USUARIO_CREADO / USUARIO_EDITADO | campos alterados (antes/depois), sem senha |
| USUARIO_BLOQUEADO / REACTIVADO / BAJA | motivo; sessões revogadas (quantidade) |
| CONTRASENA_RESTABLECIDA | apenas o fato e o ator, nunca o valor |
| PERFIL_CREADO / EDITADO / DESACTIVADO | nome, flags |
| PERFIL_PERMISOS_CAMBIADOS | permissões adicionadas e removidas |
| USUARIO_PERFILES_CAMBIADOS | perfis adicionados e removidos |
| USUARIO_ALCANCE_CAMBIADO | sucursais e depósitos adicionados e removidos |
| ACCESO_DENEGADO | permissão exigida, rota, ID solicitado (em `eventos_seguridad`) |
| EXPORTACION | módulo, filtros, quantidade de linhas |

`withTenantTx` define `app.usuario_id`, `app.empresa_id` e `app.ip` em toda transação, o que também alimenta triggers de auditoria que já existam no banco (NAO_VERIFICADO).

## 8. Modo demonstração (RN-12)

1. Em `NODE_ENV=production`, o servidor **não inicia** se `DEMO_MODE=true` e `DATABASE_URL` estiver definido. Ausência de `DATABASE_URL` em produção também é erro, e não fallback para demo (hoje as APIs caem em demo, `app/api/*/route.ts:7`).
2. A sessão demo deixa de ser o cookie constante: passa a ter token aleatório assinado (detalhe no REQ-2026-005 proposto).
3. No demo, as permissões vêm de um perfil demo declarado em código e passam pelo **mesmo** `resolveNavigation`/`can()`. Não existe mais `if (isDemoMode()) return true` (`permissions.ts:10`).
4. O fallback "mostrar tudo" do menu deixa de existir em qualquer modo.

## 9. APIs e telas de administração

Todas em espanhol na interface, seguindo o padrão visual existente (CSS Modules, mesmo shell). São telas **novas**, nos itens de menu que já existem.

| Método e rota | Permissão | Observações |
|---|---|---|
| `GET /api/auth/me` | sessão | Usuário, empresa, permissões e menu calculado |
| `GET /api/admin/usuarios` | `USUARIOS.VER` | Só usuários da empresa da sessão; filtros e paginação no servidor |
| `POST /api/admin/usuarios` | `USUARIOS.CREAR` | Senha inicial gerada e entregue uma vez, ou definida com política mínima (NIST 800-63B: tamanho, lista de senhas comuns). Nunca registrada em log |
| `PATCH /api/admin/usuarios/{id}` | `USUARIOS.EDITAR` | Dados cadastrais e sucursal padrão |
| `POST /api/admin/usuarios/{id}/bloquear`, `/reactivar`, `/baja` | `USUARIOS.EDITAR` / `USUARIOS.ELIMINAR` | Revoga sessões; impede bloquear a si mesmo e o último administrador |
| `POST /api/admin/usuarios/{id}/restablecer-contrasena` | `USUARIOS.EDITAR` | Revoga sessões do alvo |
| `PUT /api/admin/usuarios/{id}/perfiles` | `PERFILES.ASIGNAR` | Lista completa; só perfis ativos da mesma empresa |
| `PUT /api/admin/usuarios/{id}/alcance` | `USUARIOS.EDITAR` | Sucursais e depósitos da mesma empresa |
| `GET/POST /api/admin/perfiles`, `PATCH /api/admin/perfiles/{id}` | `PERFILES.VER/CREAR/EDITAR` | |
| `PUT /api/admin/perfiles/{id}/permisos` | `PERFILES.EDITAR` | Só códigos existentes no catálogo; não permite `PLATAFORMA.*` |
| `GET /api/admin/permisos` | `PERFILES.VER` | Catálogo agrupado por módulo, para a tela de perfis |
| `GET /api/admin/auditoria` | `AUDITORIA.VER` | Só eventos da empresa |

Telas: `/administracion/usuarios` (lista, novo, detalhe com abas Datos, Perfiles, Alcance), `/administracion/roles` (lista e editor de permissões em grade módulo × ação) e `/administracion/auditoria` (consulta). `/administracion/configuracion` fica fora deste REQ.

As APIs existentes recebem a permissão correspondente (lista completa na `MATRIZ-PERMISOS-REQ-2026-002.md` §4).

## 10. Plano de implementação em fases (após aprovação)

Cada fase é um PR com TST e auditoria próprios, ou rodadas sucessivas do mesmo REQ, conforme o responsável preferir.

| Fase | Conteúdo | Depende de | DDL? |
|---|---|---|---|
| 0 | Linha de base do banco e conciliação das tabelas de acesso (REQ-2026-003 proposto) | Acesso somente leitura autorizado | Não |
| 1 | Camada `access.ts`, `requirePermission` nas 5 APIs atuais, menu que falha fechado, `withTenantTx`, validação de FKs por empresa em productos e proveedores, demo pela mesma via de permissões, teste de rotas sem permissão | 0 (para confirmar colunas), REQ-2026-004 (testes) | Não, se `permisos`/`perfiles` já tiverem o necessário |
| 2 | Migrations: `empresa_id` e FKs compostas nas tabelas de acesso, `sucursales`, alcances, `auditoria_acceso`, carga do catálogo de permissões, perfil administrador por empresa | 1 | Sim, incremental com `up`/`down` |
| 3 | APIs e telas de administração de usuários, perfis e alcance; auditoria | 2 | Não |
| 4 | FKs compostas nas tabelas de negócio e RLS, tabela a tabela, com testes de isolamento | 2, cada módulo migrado para o banco | Sim |

## 11. Estratégia de testes (CA-09)

| CA | Teste | Tipo |
|---|---|---|
| CA-01 | Duas empresas A e B semeadas num PostgreSQL efêmero; para cada rota de API, o usuário de A tenta ler, criar e editar com IDs de B (no caminho, na query e no corpo), e exportar. Esperado: 403/404 e nenhuma linha de B alterada | integração |
| CA-02 | O administrador de A lista e cria usuários; não enxerga nem altera usuários de B | integração |
| CA-03 | Usuário com perfis Ventas + Depósito recebe a união; remover um perfil remove as permissões correspondentes | unidade + integração |
| CA-04 | Playwright: três usuários (Administrador, Ventas, Depósito) veem menus diferentes; o snapshot do menu de cada um é comparado | e2e |
| CA-05 | Chamada direta a `POST /api/clientes` por usuário sem `CLIENTES.CREAR` → 403, e a contagem de linhas não muda | integração |
| CA-06 | `resolveNavigation([])` devolve só o que não exige permissão; usuário sem perfis vê o menu vazio | unidade + e2e |
| CA-07 | Bloquear o usuário ou trocar o perfil durante a sessão: a próxima requisição responde 401/403 | integração |
| CA-08 | Usuário com depósito Central tenta movimentar estoque no depósito Norte (mesmo ID válido da empresa) → 403 | integração (quando o módulo de stock estiver no banco) |
| CA-09 | Este conjunto roda no CI e o link da execução vai no TST | CI |
| CA-10 | Cada migration aplicada e revertida (`up` → `down` → `up`) num banco criado a partir da linha de base | integração |
| Guarda | Teste estático: todo `route.ts` chama `requirePermission`; toda página privada está sob um layout que exige `.VER` | unidade |

## 12. Riscos do próprio desenho

| Risco | Mitigação |
|---|---|
| O banco real já ter outro modelo de perfis/permissões (por exemplo, sem `empresa_id` em `perfiles`) | Fase 0 antes de qualquer DDL; a migração de dados de perfis é desenhada só depois de ver o esquema real |
| Perfis existentes com códigos diferentes da matriz | Tabela de conversão na migration da fase 2, revisada pelo responsável |
| Custo da consulta de permissões a cada requisição | Uma consulta agregada por requisição; medir antes de pensar em cache |
| Telas cliente inteiras dificultam o gate por página | Layout de servidor por módulo, sem tocar na tela |
| RLS mal configurada bloquear tudo ou nada | Fase 4 por tabela, com testes de isolamento antes de ativar, e papel separado para migrations |
