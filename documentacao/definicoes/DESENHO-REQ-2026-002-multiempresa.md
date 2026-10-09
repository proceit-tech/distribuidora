# DESENHO-REQ-2026-002 — Multiempresa, usuários, perfis e menus

Requisito: `REQ-2026-002-multiempresa-usuarios-perfiles-menus.md` · Autor: Claude
Versão: **2 (correções da AUD-REQ-2026-002-R01)** · Data: 2026-10-08
Código analisado: `main` @ `0dbb013` (o código funcional é idêntico ao de `7f4230a`; desde então só entraram documentos)
Situação: **PROPOSTA PARA APROVAÇÃO.** Nenhum código, nenhum SQL executável e nenhuma migration fazem parte desta entrega. Os trechos SQL deste documento são ilustrativos e servem para fixar o contrato; não são DDL definitivo (F-001).

Documentos de apoio, no PR #2 (`feature/REQ-2026-001-consolidacao-documental` @ `fd16292`): `ARQUITETURA-ATUAL.md` §2 e §7, `MODELO-DADOS-ATUAL.md` §1.1, `MAPA-MODULOS.md` §1 e §6, `documentacao/banco/INTROSPECCAO-SOMENTE-LEITURA.md`.

## 0. Resposta aos achados da R01

| Achado | Severidade | Onde foi tratado |
|---|---|---|
| F-001 Autorização depende de esquema não inspecionado | ALTA | §3 vira modelo-alvo **condicionado** à fase 0; §10.1 lista a introspecção e as verificações de integridade pré-migração; nenhuma DDL definitiva |
| F-002 Escalada de privilégios | ALTA | **§4** (novo): regras de delegação, autoelevação, último administrador, bootstrap, versão e auditoria antes/depois; testes em §11.2 |
| F-003 Alcance por sucursal/depósito | MEDIA | **§6** reescrito: definição formal dos conjuntos, coerência depósito × sucursal, transferências, depósitos de terceiros, remoção de atribuição; testes em §11.3 |
| F-004 RLS e contexto transacional | MEDIA | **§5** (novo): contrato da camada de dados, papéis SQL, `FORCE RLS`, rollback, reutilização do pool, cache do Next.js; testes em §11.1 |
| F-005 Janela de autorização incompleta | MEDIA | **§10** reescrito: isolamento aplicado já na fase 1; permissões em modo observação até o catálogo existir; portões de entrada/saída por fase |
| F-006 Contrato temporal de revogação | MEDIA | **§8** (novo): tabela evento × efeito × momento, bloqueio de linha contra condição de corrida, sem cache de autorização; testes em §11.4 |
| F-007 Catálogos globais | BAIXA | §3.4: classificação tabela a tabela, com decisão pendente pós-introspecção |
| Condição R02: decisões D-01 a D-05 | — | §2: recomendação do Claude, parecer do auditor e coluna de decisão do responsável |
| Condição R02: matriz de cobertura das rotas | — | `MATRIZ-PERMISOS-REQ-2026-002.md` §4 e §7 (verificação 26/26 páginas, 5/5 APIs, 32/32 itens de menu) |

## 1. Pontos de partida

### 1.1 O que já existe e se mantém
| Item | Evidência | Decisão de desenho |
|---|---|---|
| Login por empresa + usuário + senha | `app/api/auth/login/route.ts:128` | Mantido (RN-03) |
| `empresa_id` da sessão em todas as gravações | `app/api/clientes/route.ts:827`; `app/api/proveedores/route.ts:651`; `app/api/productos/route.ts:272` | Mantido; vira regra obrigatória da camada de dados |
| Perfis e estado do usuário relidos a cada requisição | `lib/auth/session.ts:109-125` | Mantido; base da revogação imediata (§8) |
| Tabelas `perfiles`, `permisos`, `perfil_permiso`, `usuario_perfil` | `lib/auth/permissions.ts:15-23` | Reaproveitadas, sujeitas à fase 0 |
| Bloqueio por tentativas e `eventos_seguridad` | `login/route.ts:150-252` | Mantido; ampliado (§9) |
| Validação de catálogo por empresa | `clientes/route.ts:272` (`validarReferenciaEmpresa`) | Generalizada (§5.5) |

### 1.2 O que precisa ser corrigido
| ID | Problema | Evidência | Seção |
|---|---|---|---|
| G-01 | Nenhuma rota verifica permissão | `lib/auth/permissions.ts`: 0 importadores | §7 |
| G-02 | Menu completo quando não há permissões | `lib/navigation/menu.ts:321-322`; `lib/auth/server-context.ts:37-38` | §7.4 |
| G-03 | O código não confere se o perfil é da empresa do usuário | `session.ts:116-117`; `permissions.ts:17-22` | §3.2, §5 |
| G-04 | Dois critérios de administrador (`'ADMIN'` × `es_administrador`) | `server-context.ts:15`; `permissions.ts:22` | §4.1 |
| G-05 | `POST /api/productos` aceita IDs de outras empresas | `productos/route.ts:272-410` | §5.5 |
| G-06 | Sem sucursal nem alcance | `ARQUITETURA-ATUAL.md` §7 | §6 |
| G-07 | Empresa desativada não derruba sessões | `session.ts:109-125` | §8 |
| G-08 | Demo concede administrador por cookie constante | `session.ts:13,92`; `permissions.ts:10` | §7.5 |
| G-09 | Auditoria só de login; `app.usuario_id` só no login | `login/route.ts:220` | §9 |
| G-10 | Sem administração de usuários e perfis | menu `/administracion/*` sem página | §12 |

## 2. Decisões (D-01 a D-08)

Quem decide é o responsável PROCEIT. A coluna "Decisão" fica `PENDENTE` até ele registrar a decisão no PR ou no REQ. O restante do desenho usa a recomendação como hipótese.

| ID | Pergunta | Recomendação do Claude | Parecer da AUD-R01 | Decisão do responsável |
|---|---|---|---|---|
| D-01 | Um humano em várias empresas | Contas separadas por empresa nesta versão; login empresa + usuário + senha. Uma futura identidade única só exige uma tabela `identidades` ligando contas, sem mudar o isolamento | Aprovar condicionalmente; documentar a migração futura | PENDENTE |
| D-02 | Agregação de vários perfis | União das permissões concedidas, sem negação. A união **nunca** amplia empresa nem alcance (§6), e permissões sensíveis só existem por concessão específica (não são implícitas em outras) | Aprovar | PENDENTE |
| D-03 | Funções exclusivas da plataforma PROCEIT | Criar, suspender e reativar empresas; criar o primeiro administrador (bootstrap); manter o catálogo de permissões; suporte com acesso temporário e motivado. Contas de plataforma separadas, com **MFA obrigatório**, sem nenhum bypass no código (§4.6) | Aprovar com restrições: MFA, auditoria de suporte, escopo explícito, sem bypass informal | PENDENTE |
| D-04 | Lista de permissões e alcance | `MATRIZ-PERMISOS-REQ-2026-002.md`, incluindo concessão inicial e fluxo de mudança (§5 e §6 da matriz) | Pendente: validar cobertura, concessão inicial, mudanças e revogação | PENDENTE |
| D-05 | Usuário sem sucursal/depósito atribuído | Nega acesso aos recursos de nível sucursal/depósito; acesso amplo só com alcance `TODAS`/`TODOS` explícito | Aprovar | PENDENTE |
| D-06 (nova) | O perfil administrador da empresa inclui as permissões sensíveis? | Sim, porque o administrador já pode concedê-las a si mesmo por outros meios; toda leitura de dado sensível é auditada | — | PENDENTE |
| D-07 (nova) | Retenção da auditoria | `auditoria_acceso` só por inserção, guardada por **5 anos**, no mínimo; `eventos_seguridad`, 1 ano. Prazos a confirmar com o contador ou o jurídico da PROCEIT | — (o achado RN-10 pedia retenção) | PENDENTE |
| D-08 (nova) | Transferência entre sucursais | Em duas etapas (envio e recebimento), cada uma exigindo só o seu depósito (§6.4) | — (F-003 pediu definir) | PENDENTE |

Ações ANULAR e ASIGNAR e a segregação de permissões sensíveis: aprovadas pela AUD-R01, pendentes de registro do responsável.

## 3. Modelo de dados-alvo (condicionado à fase 0)

**Condição (F-001):** o que segue é o modelo-**alvo**. As migrations serão escritas só depois da introspecção (§10.1) e da conciliação coluna a coluna. Colunas que já existirem não são recriadas; colunas com outro nome ou tipo geram uma decisão registrada, e não uma migration presumida.

### 3.1 Princípios
1. Toda tabela de negócio tem `empresa_id NOT NULL`, exceto os catálogos classificados como globais na §3.4.
2. **Chave composta contra referência cruzada (RN-11):** `UNIQUE (empresa_id, id)` em cada tabela de empresa, e FKs entre tabelas da mesma empresa no formato `(empresa_id, x_id) REFERENCES x (empresa_id, id)`.
3. Unicidade sempre composta com a empresa: `(empresa_id, lower(usuario))`, `(empresa_id, codigo)`.
4. RLS como segunda barreira (§5.3), ativada tabela a tabela na fase 5.

### 3.2 Entidades de acesso

| Entidade | Situação no código | Colunas-alvo | Regras |
|---|---|---|---|
| `empresas` | existe | `id, codigo, razon_social, ruc, estado` (`ACTIVA` \| `SUSPENDIDA`), `version_acceso` | `codigo` único global (usado no login) |
| `sucursales` | não referenciada; confirmar na fase 0 | `id, empresa_id, codigo, nombre, establecimiento_sifen, activo` | `UNIQUE (empresa_id, codigo)` |
| `depositos` | existe | + `sucursal_id` (FK composta), `es_de_terceros`, `activo` | Todo depósito pertence a uma sucursal da mesma empresa |
| `usuarios` | existe | + `alcance_sucursales` (`TODAS` \| `ASIGNADAS`), `alcance_depositos` (`TODOS` \| `ASIGNADOS`), `baja_at`, `debe_cambiar_contrasena`, `version_acceso` | `sucursal_id` atual = sucursal padrão, obrigatoriamente dentro do alcance |
| `usuario_sucursal`, `usuario_deposito` | inexistentes | `empresa_id, usuario_id, sucursal_id` / `deposito_id`, `asignado_por, asignado_at` | FKs compostas |
| `perfiles` | existe (`empresa_id` NAO_VERIFICADO) | `id, empresa_id, codigo, nombre, es_administrador, es_sistema, activo, version` | Ver §4 |
| `permisos` | existe (global) | `id, codigo, recurso, accion, modulo, nivel_alcance` (`EMPRESA` \| `SUCURSAL` \| `DEPOSITO`), `es_sensible`, `es_administrativa` | Catálogo mantido pela plataforma |
| `perfil_permiso` | existe | + `empresa_id` | FK composta para `perfiles` |
| `usuario_perfil` | existe | + `empresa_id, asignado_por, asignado_at` | FK composta para `usuarios` e `perfiles` (fecha G-03) |
| `auditoria_acceso` | inexistente no código | `id, empresa_id, actor_tipo` (`USUARIO` \| `PLATAFORMA`), `actor_id, accion, entidad, entidad_id, antes jsonb, despues jsonb, motivo, ip, user_agent, created_at` | Só inserção (§9) |
| `usuarios_plataforma`, `accesos_soporte` | inexistentes | Contas PROCEIT com MFA; concessões de suporte com prazo | §4.6 |

Os menus continuam em código (`lib/navigation/menu.ts`), cada item ligado a uma permissão. O que varia por empresa são os perfis.

### 3.3 Tabelas de negócio
As 46 tabelas de `MODELO-DADOS-ATUAL.md` §2 entram no inventário de tenant da fase 0. As tabelas filhas (`cliente_contactos`, `producto_codigos` etc.) recebem `empresa_id` próprio (redundante, mas permite FK composta e RLS simples), com backfill a partir do pai.

### 3.4 Classificação dos catálogos (F-007)

O código atual trata como globais as tabelas lidas sem filtro de empresa. A classificação final é decidida **depois** da introspecção; nada é global por omissão.

| Tabela | Hoje no código | Proposta | Motivo | Situação |
|---|---|---|---|---|
| `referencia_geografica_*` (4) | global | Global | Dado oficial, igual para todos | Confirmar na fase 0 |
| `monedas` | global | Global | Códigos ISO 4217 | Confirmar na fase 0 |
| `incoterms` | global | Global | Padrão internacional | Confirmar na fase 0 |
| `impuestos` | global | Global, com habilitação por empresa (`empresa_impuesto`) | A alíquota é legal, mas nem toda empresa usa todas | **Decisão pendente** |
| `unidades_medida` | global | Global (códigos SIFEN); apresentações por empresa ficam em `producto_unidades` | O SIFEN exige códigos oficiais | **Decisão pendente** |
| `condiciones_pago` | global | **Por empresa** | Prazo comercial varia por empresa | **Decisão pendente**; exige migration com backfill por empresa |
| `permisos` | global | Global (catálogo da plataforma) | D-03 | — |
| `grupos_*`, `listas_precio`, `rutas_entrega`, `zonas_comerciales`, `vendedores`, `canales_venta`, `medios_pago`, `categorias_producto`, `marcas_producto`, `depositos` | por empresa | Por empresa | — | Já filtradas por empresa no código |

## 4. Proteção contra escalada de privilégios (F-002)

### 4.1 Definições
- **Conjunto efetivo** `P(u)`: união das permissões dos perfis ativos do usuário `u`, na empresa dele (D-02).
- **Administrador da empresa**: usuário com ao menos um perfil ativo `es_administrador = true` da própria empresa. É o único critério; o código literal `ADMIN` (`server-context.ts:15`) deixa de ter significado.
- O perfil `es_administrador` tem `P` = todas as permissões de empresa do catálogo (sensíveis incluídas, conforme D-06), **nunca** permissões `PLATAFORMA.*`.
- **Permissões administrativas** (`es_administrativa`): `USUARIOS.*`, `PERFILES.*`, `AUDITORIA.*`, `CONFIGURACION.*`.

### 4.2 Regras de delegação

Valem para qualquer operação de administração, inclusive as feitas por quem é administrador:

| ID | Regra | Retorno quando violada |
|---|---|---|
| ESC-01 | **Subconjunto:** ninguém concede o que não tem. Criar ou editar um perfil exige que o conjunto de permissões resultante seja ⊆ `P(ator)`. Atribuir um perfil exige que as permissões dele sejam ⊆ `P(ator)` | 403 |
| ESC-02 | **Sem autoalteração:** o ator não altera os próprios perfis, o próprio alcance, o próprio estado nem a própria flag de administrador. Senha e dados pessoais seguem pelo fluxo de "mi cuenta" | 403 |
| ESC-03 | **Perfil próprio:** editar um perfil que o próprio ator tem também obedece à ESC-01, calculada sobre `P(ator)` **antes** da mudança. Assim, ninguém amplia o próprio acesso editando o perfil que usa | 403 |
| ESC-04 | **Flag de administrador:** só um administrador pode criar um perfil `es_administrador`, marcar essa flag ou atribuir esse perfil | 403 |
| ESC-05 | **Permissões administrativas e sensíveis:** só um administrador pode incluí-las num perfil (mesmo que outro ator as tenha) | 403 |
| ESC-06 | **Alcance:** o ator só atribui sucursais e depósitos que estão no próprio alcance (`S(ator)`, `D(ator)`); só quem tem `TODAS`/`TODOS` concede `TODAS`/`TODOS` | 403 |
| ESC-07 | **Último administrador:** nenhuma operação pode deixar a empresa sem ao menos um administrador **ativo**: remover perfil, bloquear, dar baixa, desativar o perfil, desmarcar a flag. A checagem roda na mesma transação, depois de `SELECT … FROM empresas WHERE id = $1 FOR UPDATE`, que serializa as alterações de administração por empresa | 409 "La empresa debe conservar al menos un administrador activo." |
| ESC-08 | **Perfil de sistema:** o perfil `es_sistema` (administrador criado no bootstrap) não pode ser apagado, desativado nem ter as permissões editadas | 409 |
| ESC-09 | **Catálogo fechado:** só códigos existentes em `permisos`; `PLATAFORMA.*` nunca é aceito numa API de empresa | 422 |
| ESC-10 | **Concorrência:** toda edição de usuário ou de perfil envia a versão lida (`version_acceso` / `version`); se outra pessoa alterou antes, a resposta é 409 e nada é gravado (bloqueio otimista) | 409 |
| ESC-11 | **Identificadores de outra empresa:** perfil, usuário, sucursal ou depósito de outra empresa no corpo ou na URL tem o mesmo tratamento de "não existe" | 404 |

### 4.3 Versão e auditoria
- Cada mudança de perfis, alcance ou estado incrementa `usuarios.version_acceso`. Cada mudança de permissões de um perfil incrementa `perfiles.version`.
- Toda operação grava em `auditoria_acceso`, na mesma transação, o **antes e o depois** (conjuntos de perfis, permissões e alcance; nunca senha, hash ou token), o ator e o motivo, quando houver.
- Uma tentativa negada por ESC-01 a ESC-07 gera `ACCESO_DENEGADO` em `eventos_seguridad`, com a regra violada.

### 4.4 Bootstrap seguro de uma empresa
1. Só uma conta de plataforma com `PLATAFORMA.EMPRESAS_CREAR` (com MFA) executa o procedimento.
2. Numa única transação: cria a empresa, uma sucursal inicial, o perfil `ADMINISTRADOR` (`es_administrador`, `es_sistema`) e o primeiro usuário, com alcance `TODAS`/`TODOS`, senha temporária aleatória e `debe_cambiar_contrasena = true`.
3. A senha temporária é mostrada uma única vez a quem executou e entregue por canal separado; nunca vai para log, repositório ou auditoria.
4. No primeiro login, o usuário só consegue trocar a senha.
5. A função `017_administrador_inicial` citada no README é avaliada na fase 0: se já fizer isso, é reaproveitada; se tiver senha fixa, é substituída.

### 4.5 Mudança de permissões e revogação
- Permissões nunca são guardadas no cookie nem em cache: cada requisição recalcula `P(u)` (§8). Por isso, retirar uma permissão vale a partir da requisição seguinte.
- Bloquear, dar baixa ou trocar a senha revoga as sessões abertas do usuário na mesma transação (§8).

### 4.6 Plataforma PROCEIT (D-03)
- Contas em `usuarios_plataforma`, separadas, com MFA obrigatório e login separado.
- **Não existe bypass no código**: nem flag, nem usuário mágico, nem variável de ambiente que libere tudo.
- Suporte dentro de uma empresa: concessão em `accesos_soporte`, com empresa, motivo, permissões (somente leitura por padrão) e expiração (padrão: 60 minutos). O acesso aparece na auditoria **da própria empresa** e pode ser revogado antes do prazo.
- Uma conta de plataforma não usa as telas da empresa sem uma concessão ativa.

## 5. Isolamento completo entre empresas (F-004, RN-01, RN-02, RN-11)

### 5.1 Contrato da camada de dados
1. **Só a camada de dados (`lib/data/**`) e a camada de autenticação (`lib/auth/**`) importam `@/lib/db`.** Regra `no-restricted-imports` no ESLint e um teste estático garantem isso. Route handlers, Server Components e Server Actions chamam funções da camada de dados, nunca SQL.
2. **Toda função da camada de dados recebe o `AccessContext` como primeiro parâmetro** e executa as consultas dentro de `withTenantTx(ctx, fn)`, inclusive as leituras (com `BEGIN READ ONLY`). `pool.query` direto é proibido por lint.
3. **Toda consulta filtra `empresa_id = ctx.empresaId` explicitamente**, mesmo depois da RLS (duas barreiras independentes).
4. **Busca por ID** é sempre `WHERE id = $1 AND empresa_id = $2`. Sem linha → 404, sem revelar se o ID existe em outra empresa.
5. **Exportações** usam as mesmas funções da listagem: mesmo filtro, mesmo alcance.
6. **Catálogos globais** (§3.4) são lidos por funções separadas (`withGlobalRead`), que listam explicitamente as tabelas permitidas e são só leitura para usuários de empresa.

### 5.2 `withTenantTx`
```ts
async function withTenantTx<T>(ctx: AccessContext, fn: (tx: Tx) => Promise<T>, opts?: { readOnly?: boolean }) {
  const client = await pool.connect();
  try {
    await client.query(opts?.readOnly ? "BEGIN READ ONLY" : "BEGIN");
    await client.query(
      "SELECT set_config('app.empresa_id', $1, true), set_config('app.usuario_id', $2, true), set_config('app.ip', $3, true)",
      [ctx.empresaId, ctx.usuarioId, ctx.ip ?? ""],
    );
    await revalidarAcceso(client, ctx);   // §8.3: trava compartilhada em empresa e usuário + versão
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
```
- `set_config(..., true)` vale **só até o fim da transação**. No `COMMIT` ou no `ROLLBACK`, o PostgreSQL descarta os valores, então uma conexão devolvida ao pool não carrega a empresa anterior. Nunca se usa `SET` de sessão.
- Qualquer erro, inclusive de validação, provoca `ROLLBACK`; nada é gravado pela metade.
- Se a conexão estiver quebrada, `release(err)` a descarta do pool.

### 5.3 Papéis SQL e RLS (fase 5)
| Papel | Uso | Atributos |
|---|---|---|
| `distribunex_owner` | Dono das tabelas | `NOLOGIN`; ninguém se conecta com ele |
| `distribunex_migrator` | Aplicar migrations pelo pipeline | `LOGIN`, `BYPASSRLS`; credencial só no segredo do pipeline; nunca usado pela aplicação |
| `distribunex_app` | Aplicação | `LOGIN`, **sem** `BYPASSRLS`, não é dono; só `SELECT/INSERT/UPDATE` nas tabelas de negócio; **sem `DELETE`** (baixa lógica); só `INSERT` em `auditoria_acceso` |
| `distribunex_auth` | Login e leitura de sessão antes de existir contexto de empresa | Só `SELECT` em `empresas` (colunas de login), `usuarios` (colunas de login) e `sesiones_usuario`; `UPDATE` só de tentativas e sessão; `INSERT` em `eventos_seguridad`. Nenhum acesso a tabelas de negócio |
| `distribunex_plataforma` | Operações da plataforma (bootstrap, suspensão) | Usado só pelo serviço de plataforma, com auditoria |

- Cada tabela de empresa recebe `ENABLE` e `FORCE ROW LEVEL SECURITY`, com a política `USING (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid)` e o mesmo `WITH CHECK`. Sem contexto, a expressão fica nula e nenhuma linha passa: a política falha fechada.
- Funções `SECURITY DEFINER`: proibidas para dados de empresa. As que existirem (consulta Q7 da introspecção) são revisadas uma a uma; se forem mantidas, recebem `SET search_path = pg_catalog, public` fixo e conferem `app.empresa_id` internamente.
- O tipo de `id` (`uuid`) é presumido a partir de `randomUUID()` no código; confirmar na fase 0.

### 5.4 Next.js
- As rotas e páginas privadas são sempre dinâmicas (dependem de `cookies()`); dados de empresa **nunca** entram no cache de dados do Next.js (`unstable_cache`, `fetch` com cache) nem num cache em memória entre requisições. Só é permitido o `cache()` do React, que vale para uma requisição.
- Logs de erro trazem `empresa_id` e um ID de correlação, sem dados pessoais nem mensagens do banco para o cliente.

### 5.5 Referências recebidas no corpo
`assertMismaEmpresa(tx, tabla, id, ctx)` em **todo** ID recebido (fecha G-05 antes mesmo das FKs compostas), com a lista de tabelas permitidas tipada, como já faz `validarReferenciaEmpresa`. Depois da fase 5, as FKs compostas garantem o mesmo no banco.

### 5.6 Operações sem usuário (futuras)
Rotinas agendadas e integrações (por exemplo, o SIFEN) rodam com um contexto explícito de empresa, criado por um serviço de plataforma auditado. Não existe contexto "sistema" com acesso a todas as empresas.

## 6. Alcance por sucursal e depósito (F-003, RN-07)

### 6.1 Conjuntos permitidos
Para um usuário `u` da empresa `e`, recalculados a cada requisição:

- `S(u)` = todas as sucursais ativas de `e`, se `alcance_sucursales = TODAS`; senão, as sucursais atribuídas que estão ativas.
- `D(u)` = todos os depósitos ativos cuja sucursal ∈ `S(u)`, se `alcance_depositos = TODOS`; senão, os depósitos atribuídos que estão ativos **e** cuja sucursal ∈ `S(u)`.

O depósito sempre fica dentro da sucursal. Um depósito atribuído de uma sucursal que não está em `S(u)` não dá acesso.

### 6.2 Coerência na gravação
| Situação ao salvar o alcance | Resultado |
|---|---|
| Depósito atribuído cuja sucursal não está atribuída (com `ASIGNADAS`) | 422 "El depósito pertenece a una sucursal no asignada." |
| Sucursal padrão fora de `S(u)` | 422 |
| Sucursal ou depósito de outra empresa | 404 (ESC-11) |
| `alcance_sucursales = TODAS` com `alcance_depositos = ASIGNADOS` | Permitido (ex.: vendedor de todas as sucursais sem acesso a depósito) |
| `ASIGNADAS` sem nenhuma sucursal | Permitido; o usuário só acessa recursos de nível empresa (D-05) |
| Perfil administrador | Alcance forçado para `TODAS`/`TODOS` (o administrador poderia se conceder de qualquer forma) |

### 6.3 Regra de autorização
Uma ação é permitida quando: (1) a permissão está em `P(u)`, (2) o alvo é da empresa do usuário e (3) o alvo está no alcance exigido pelo nível da permissão:

| Nível | Exigência |
|---|---|
| EMPRESA | (1) e (2) |
| SUCURSAL | + `registro.sucursal_id ∈ S(u)`; na criação, a sucursal informada ∈ `S(u)` |
| DEPOSITO | + cada depósito envolvido ∈ `D(u)`, conforme §6.4 |

As listagens filtram por `S(u)`/`D(u)`. Os totais (por exemplo, o stock consolidado) somam só o que está no alcance, e a tela indica "en sus depósitos".

### 6.4 Operações de estoque
| Operação | Origem | Destino | Observação |
|---|---|---|---|
| Entrada, recepção, ajuste positivo | — | ∈ `D(u)` | |
| Saída, ajuste negativo, reserva, liberação, quarentena | ∈ `D(u)` | — | |
| Transferência na mesma sucursal | ∈ `D(u)` | ∈ `D(u)` | Uma etapa; os dois saldos mudam na mesma transação |
| Transferência entre sucursais — envio | ∈ `D(u)` | qualquer depósito ativo da empresa | O saldo sai da origem e vai para "em trânsito" (o modelo já tem `transito`, `lib/mocks/movimientos-stock-storage.ts:145`) |
| Transferência entre sucursais — recebimento | — | ∈ `D(u)` do recebedor | Outro usuário pode receber. Até o recebimento, a mercadoria aparece em trânsito para os dois lados |

Em todas: o alcance é conferido **dentro da transação** que grava o movimento, depois de travar as linhas de saldo envolvidas (`SELECT … FOR UPDATE`, em ordem fixa de `deposito_id` para evitar deadlock). Assim, o alcance e o saldo são validados no mesmo instante da gravação.

### 6.5 Depósitos de terceiros
O campo "propietario" já aparece nas recepções demo (`lib/mocks/recepciones-storage.ts:247`). Proposta: `depositos.es_de_terceros` e o proprietário no saldo/lote. As regras de alcance são as mesmas; a valorização do estoque exclui o de terceiros. Não há permissão extra nesta fase.

### 6.6 Efeito de remover uma atribuição
- Vale a partir da próxima requisição (§8).
- Os registros históricos continuam existindo e ficam invisíveis para quem perdeu o alcance; o administrador continua vendo tudo.
- Rascunhos e transferências em trânsito para aquela sucursal ou depósito continuam lá e podem ser concluídos por qualquer usuário que tenha o alcance.
- A remoção é auditada com antes e depois.

## 7. Autorização no servidor e menu

### 7.1 Contrato (`lib/auth/access.ts`, `server-only`)
```ts
type AccessContext = {
  sessionId: string; usuarioId: string; empresaId: string; ip: string | null;
  versionAcceso: number;                      // usuarios.version_acceso lida nesta requisição
  permisos: ReadonlySet<string>;              // P(u)
  esAdministrador: boolean;
  sucursales: ReadonlySet<string>;            // S(u) já resolvido
  depositos: ReadonlySet<string>;             // D(u) já resolvido
  modo: "OBSERVAR" | "APLICAR";               // §10
  demo: boolean;
};
getAccessContext(): Promise<AccessContext | null>
requirePermission(codigo, alvo?: { sucursalId?: string; depositoIds?: string[] }): Promise<AccessContext>
can(ctx, codigo): boolean
```

### 7.2 Regras
1. **Negação por padrão:** toda rota e toda página privada declara a permissão exigida (lista completa em `MATRIZ-PERMISOS-REQ-2026-002.md` §4). Um teste estático falha se algum `route.ts` não chamar `requirePermission` ou se alguma página privada não estiver sob um layout que exija `.VER`.
2. Sem sessão → 401 (páginas redirecionam para `/login`). Com sessão e sem permissão ou fora do alcance → 403, com a mensagem "No tiene permiso para realizar esta acción." e o evento `ACCESO_DENEGADO`.
3. As páginas atuais são Client Components inteiros. A checagem fica num `layout.tsx` de servidor por módulo (por exemplo, `app/(private)/clientes/layout.tsx`), sem mexer na tela. Os botões de ação recebem `can()` e ficam ocultos ou desabilitados; o servidor continua sendo a barreira.

### 7.3 Ordem das verificações numa API
Sessão válida → empresa ativa → usuário ativo → permissão → alvo da mesma empresa (404) → alvo no alcance (403) → validação dos dados (422) → gravação dentro de `withTenantTx`.

### 7.4 Menu (RN-05, CA-04, CA-06)
1. `getShellContext` passa a enviar as permissões reais, e `resolveNavigation` **falha fechado**: lista vazia → só os itens sem permissão exigida (nenhum, depois desta mudança). A regra "lista vazia = tudo" (`menu.ts:321-322`) é removida.
2. Os itens usam os códigos granulares da matriz (§4.3 da matriz). Um grupo aparece se ao menos um item estiver visível.
3. Itens sem página ficam ocultos por `implementado: false`, independentemente de permissão.
4. O menu é calculado no servidor; o cliente não recebe a lista completa.
5. Depois de um 403, o cliente chama `router.refresh()` para receber o menu atualizado.

### 7.5 Modo demonstração (RN-12)
1. Em `NODE_ENV=production`, o servidor não inicia com `DEMO_MODE=true`, nem sem `DATABASE_URL` (hoje as APIs caem em demo, `app/api/clientes/route.ts:5-7`).
2. A sessão demo deixa de ser o cookie constante e passa a ter token aleatório (detalhe no REQ-2026-005 proposto).
3. No demo, as permissões vêm de um perfil demo declarado em código e passam pelo **mesmo** `resolveNavigation`/`can()`/`requirePermission`. Some o `if (isDemoMode()) return true` (`permissions.ts:10`).

## 8. Revogação e contrato temporal (F-006, RN-09, CA-07)

### 8.1 Princípio
Nenhuma informação de autorização é guardada fora do banco: o cookie só tem o ID e o segredo da sessão. Empresa, usuário, perfis, permissões e alcance são lidos **a cada requisição**, e as gravações conferem de novo dentro da própria transação (§8.3).

### 8.2 Tabela de eventos
| Evento | O que acontece na mesma transação | A partir de quando vale | Sessões |
|---|---|---|---|
| Empresa suspensa | `empresas.estado = SUSPENDIDA`, `version_acceso + 1` | Próxima requisição de qualquer usuário da empresa; gravações em curso falham (§8.3) | Todas as sessões da empresa revogadas |
| Usuário bloqueado, baixa ou inativo | `usuarios.estado`, `version_acceso + 1` | Próxima requisição; gravações em curso falham | Todas as sessões do usuário revogadas |
| Senha trocada ou redefinida | novo hash | Imediato para as outras sessões | Todas, exceto a atual quando é o próprio usuário que troca |
| Perfil removido ou atribuído ao usuário | `usuario_perfil`, `version_acceso + 1` | Próxima requisição | Mantidas (o recálculo basta) |
| Permissão retirada de um perfil | `perfil_permiso`, `perfiles.version + 1` | Próxima requisição de todos os usuários com o perfil | Mantidas |
| Perfil desativado | `perfiles.activo = false`, `version + 1` | Próxima requisição | Mantidas |
| Alcance alterado | `usuario_sucursal`/`usuario_deposito`, `version_acceso + 1` | Próxima requisição | Mantidas |
| Sucursal ou depósito desativado | `activo = false` | Próxima requisição | Mantidas |
| Concessão de suporte expirada ou revogada | `accesos_soporte.revocada_at` | Próxima requisição | Sessão de suporte encerrada |

### 8.3 Condição de corrida
- **Leitura:** uma requisição que começou antes da revogação pode terminar e devolver dados que o usuário podia ver naquele instante. Esse limite é aceito e documentado.
- **Gravação:** `revalidarAcceso` (chamada dentro de `withTenantTx`, §5.2) faz `SELECT … FROM empresas WHERE id = $1 FOR SHARE` e `SELECT … FROM usuarios WHERE id = $2 FOR SHARE` e confere estado e `version_acceso` contra o contexto. A revogação faz `UPDATE` nessas mesmas linhas. O PostgreSQL serializa as duas operações:
  - se a gravação travou primeiro, a revogação espera ela terminar;
  - se a revogação gravou primeiro, a gravação vê o estado novo e falha com 401/403, sem gravar nada.
- **Permissões de perfil:** para operações sensíveis e administrativas, `revalidarAcceso` também relê as permissões dentro da transação. Para as demais, vale a leitura do início da requisição (diferença de milissegundos, aceita).
- **Sem cache:** nenhuma camada guarda autorização entre requisições. Se, no futuro, for preciso cache por desempenho, a chave inclui `empresas.version_acceso`, `usuarios.version_acceso` e as versões dos perfis, e o cache é descartado quando qualquer uma delas mudar.

## 9. Auditoria (RN-10)

| Evento | Dados |
|---|---|
| USUARIO_CREADO / USUARIO_EDITADO | antes e depois dos campos, sem senha |
| USUARIO_BLOQUEADO / REACTIVADO / BAJA | motivo; quantidade de sessões revogadas |
| CONTRASENA_RESTABLECIDA | só o fato e o ator |
| PERFIL_CREADO / EDITADO / DESACTIVADO | antes e depois |
| PERFIL_PERMISOS_CAMBIADOS | permissões adicionadas e removidas, versão |
| USUARIO_PERFILES_CAMBIADOS | perfis adicionados e removidos, versão |
| USUARIO_ALCANCE_CAMBIADO | sucursais e depósitos adicionados e removidos |
| EMPRESA_SUSPENDIDA / REACTIVADA, SOPORTE_ACCESO_* | ator de plataforma, motivo, prazo |
| ACCESO_DENEGADO (`eventos_seguridad`) | permissão ou regra violada, rota, ID solicitado |
| DATO_SENSIBLE_CONSULTADO | recurso sensível e ID (contas bancárias, crédito, custo) |
| EXPORTACION | módulo, filtros, quantidade de linhas |

- `auditoria_acceso` é só de inserção: o papel da aplicação não tem `UPDATE` nem `DELETE` nela.
- Retenção conforme D-07.
- `withTenantTx` define `app.usuario_id`, `app.empresa_id` e `app.ip`, o que também alimenta triggers de auditoria que já existam no banco (NAO_VERIFICADO).

## 10. Sequência de implementação (F-005)

Princípio: **o isolamento entre empresas não depende do catálogo de permissões e é aplicado desde a fase 1. A exigência de permissões só é ligada depois que o banco tem catálogo, perfis e pelo menos um administrador por empresa.** Nunca existe um "modo aberto" improvisado.

| Fase | Conteúdo | Portão de entrada | Portão de saída (evidência no TST) | DDL? |
|---|---|---|---|---|
| 0 | Introspecção somente leitura e verificações de integridade (§10.1) | Responsável autoriza e executa o roteiro | Relatório versionado; divergências registradas; decisões de §3.4 tomadas | Não |
| 1 | `lib/data` + `withTenantTx` + `assertMismaEmpresa` aplicados nas 5 APIs (isolamento **aplicado**); `access.ts` calculando permissões em **modo OBSERVAR**, que registra "negaria" sem bloquear; menu ainda no comportamento atual; testes de isolamento A/B | Fase 0 aprovada; CI do REQ-2026-004 | CA-01 e CA-05 de isolamento verdes; relatório do modo observação sem negações inesperadas | Não |
| 2 | Migrations mínimas: catálogo de permissões, perfis por empresa, perfil `ADMINISTRADOR` de sistema e garantia de um administrador por empresa (conversão de códigos antigos), alcance com backfill **explícito** `TODAS`/`TODOS` para os usuários existentes (preserva o comportamento atual e fica marcado para revisão), `version_acceso`, `auditoria_acceso` | Fase 1 | Verificações de §10.1 = 0 inconsistências; toda empresa com ≥ 1 administrador ativo; `up` → `down` → `up` testado | Sim |
| 3 | Modo **APLICAR**: menu falha fechado, `requirePermission` bloqueia, alcance aplicado. Liberação progressiva: desenvolvimento → homologação → uma empresa piloto → todas | Fase 2 | CA-03 a CA-07 verdes; teste com usuário sem permissões, perfil vazio e empresa suspensa | Não |
| 4 | APIs e telas de administração de usuários, perfis e alcance (§12); regras ESC-01 a ESC-11 | Fase 3 | Testes de escalada (§11.2) verdes | Não |
| 5 | FKs compostas e RLS, tabela a tabela, à medida que cada módulo sai do `localStorage` para o banco | Fase 2 e o módulo no banco | Testes de §11.1 com RLS ligada | Sim |

Regras da chave `AUTHZ_MODO`:
- Em produção, só `APLICAR` é aceito: a aplicação não inicia com `OBSERVAR`. Nenhum cliente usa o sistema com dados reais antes da fase 3.
- Voltar de `APLICAR` para `OBSERVAR` só é permitido fora de produção.
- Em nenhuma fase existe um valor que libere tudo.

### 10.1 Fase 0 — verificações de integridade pré-migração
Roteiro de catálogo em `documentacao/banco/INTROSPECCAO-SOMENTE-LEITURA.md` (PR #2). Depois dele, contagens só leitura (os nomes de colunas são confirmados pela consulta Q3):

| ID | Pergunta | Esperado |
|---|---|---|
| I-01 | `perfiles` tem `empresa_id`? Quantos perfis sem empresa? | Define a migration de perfis |
| I-02 | `usuario_perfil` em que a empresa do perfil ≠ a do usuário | 0 |
| I-03 | Usuários ativos sem nenhum perfil ativo | Listar quantidade; decisão antes da fase 3 |
| I-04 | Empresas sem nenhum usuário ativo com perfil `es_administrador` | 0 (senão, bootstrap antes da fase 3) |
| I-05 | Códigos em `permisos` que não estão na matriz, e vice-versa | Tabela de conversão |
| I-06 | Duplicados de `(empresa_id, lower(usuario))` | 0 |
| I-07 | Por tabela de negócio: linhas com `empresa_id` nulo | 0 |
| I-08 | Por FK candidata a composta: linhas cuja referência é de outra empresa | 0 (senão, correção de dados aprovada antes da FK) |
| I-09 | Funções `SECURITY DEFINER` e triggers existentes | Lista revisada |
| I-10 | Papel usado pela aplicação: dono das tabelas? `BYPASSRLS`? | Define a migração de papéis |

## 11. Testes (CA-09)

Ambiente: PostgreSQL efêmero no CI (REQ-2026-004 proposto), semeado com empresas A e B, duas sucursais e três depósitos por empresa, e usuários de perfis diferentes.

### 11.1 Isolamento (F-004, CA-01, CA-05)
| Teste | Esperado |
|---|---|
| Para cada rota de API: usuário de A usa IDs de B no caminho, na query e no corpo; tenta exportar | 404/403; nenhuma linha de B lida ou alterada (contagem antes e depois) |
| Pool com 1 conexão: requisição de A, depois de B, na mesma conexão; B consulta `current_setting('app.empresa_id', true)` | Vazio no início da transação de B; só dados de B |
| Exceção no meio de uma gravação | `ROLLBACK`; nenhuma linha parcial; contexto não vaza |
| Consulta com RLS sem contexto (`app.empresa_id` não definido) | 0 linhas |
| `distribunex_app` tenta `DELETE`, `UPDATE` em `auditoria_acceso` ou acesso a outra empresa com RLS | Erro de permissão |
| Teste estático: `@/lib/db` importado fora de `lib/data` e `lib/auth` | Falha do teste |

### 11.2 Escalada de privilégios (F-002)
| Teste | Regra | Esperado |
|---|---|---|
| Usuário com `PERFILES.EDITAR` (sem `PRODUCTOS_COSTO.VER`) cria um perfil com `PRODUCTOS_COSTO.VER` | ESC-01 | 403 |
| O mesmo usuário adiciona a permissão ao perfil que ele próprio usa | ESC-03 | 403 |
| Usuário com `PERFILES.ASIGNAR` atribui a si mesmo um perfil | ESC-02 | 403 |
| Não administrador atribui o perfil administrador a outro | ESC-04 | 403 |
| Não administrador inclui `USUARIOS.CREAR` num perfil | ESC-05 | 403 |
| Usuário com alcance da sucursal 1 atribui a sucursal 2 a outro | ESC-06 | 403 |
| Duas requisições simultâneas removem os dois últimos administradores | ESC-07 | Uma passa, a outra 409; sobra 1 administrador |
| Apagar o perfil de sistema | ESC-08 | 409 |
| Enviar `PLATAFORMA.EMPRESAS_CREAR` num perfil | ESC-09 | 422 |
| Duas edições do mesmo perfil com a mesma versão | ESC-10 | A segunda recebe 409 |
| Atribuir perfil de outra empresa | ESC-11 | 404 |
| Cada tentativa acima | §4.3 | Evento `ACCESO_DENEGADO`; nenhuma alteração |

### 11.3 Alcance (F-003, CA-08)
| Teste | Esperado |
|---|---|
| Usuário com depósito Central faz saída no Norte (ID válido da empresa) | 403 |
| Transferência na mesma sucursal com destino fora de `D(u)` | 403; nenhum saldo alterado |
| Envio entre sucursais com origem em `D(u)` | OK; saldo em trânsito |
| Recebimento por usuário sem o depósito de destino | 403 |
| Salvar alcance com depósito de sucursal não atribuída | 422 |
| Remover a sucursal do usuário e repetir a listagem | Registros da sucursal somem na próxima requisição |
| Stock consolidado | Soma só `D(u)` |
| Exportação | Mesmo filtro da tela |

### 11.4 Revogação (F-006, CA-07)
| Teste | Esperado |
|---|---|
| Sessão aberta; plataforma suspende a empresa; próxima requisição | 401; sessão revogada |
| Sessão aberta; usuário bloqueado; próxima requisição | 401 |
| Perfil removido; próxima requisição a rota que exigia a permissão | 403; menu sem o item |
| Gravação longa em curso (transação travada) e bloqueio do usuário em paralelo | Ou a gravação termina antes e o bloqueio espera, ou a gravação falha sem gravar; nunca grava depois do bloqueio |
| Usuário sem nenhuma permissão | Menu vazio (CA-06) |

### 11.5 Implantação (F-005)
| Teste | Esperado |
|---|---|
| Fase 1 em OBSERVAR com dados legados | Nenhum bloqueio de permissão; isolamento A/B bloqueando; log de "negaria" |
| Aplicação iniciada em produção com `AUTHZ_MODO=OBSERVAR` ou `DEMO_MODE=true` | Não inicia |
| Fase 2: migrations `up` → `down` → `up` a partir da linha de base | Sem erro; verificações de §10.1 = 0 |
| Fase 3 com perfil vazio, usuário sem perfil e empresa suspensa | Menu vazio / 403 / 401 |

## 12. APIs e telas de administração (fase 4)

Interface em espanhol, no padrão visual existente.

| Método e rota | Permissão | Regras |
|---|---|---|
| `GET /api/auth/me` | sessão | Usuário, empresa, permissões e menu calculado |
| `GET /api/admin/usuarios` | `USUARIOS.VER` | Só a empresa da sessão |
| `POST /api/admin/usuarios` | `USUARIOS.CREAR` | Senha temporária gerada e mostrada uma vez; `debe_cambiar_contrasena` |
| `PATCH /api/admin/usuarios/{id}` | `USUARIOS.EDITAR` | ESC-02, ESC-10 |
| `POST /api/admin/usuarios/{id}/bloquear` · `/reactivar` | `USUARIOS.EDITAR` | ESC-02, ESC-07; revoga sessões (§8) |
| `POST /api/admin/usuarios/{id}/baja` | `USUARIOS.ELIMINAR` | ESC-02, ESC-07; revoga sessões |
| `POST /api/admin/usuarios/{id}/restablecer-contrasena` | `USUARIOS.EDITAR` | Revoga sessões do alvo |
| `PUT /api/admin/usuarios/{id}/perfiles` | `PERFILES.ASIGNAR` | ESC-01, 02, 04, 07, 10, 11 |
| `PUT /api/admin/usuarios/{id}/alcance` | `USUARIOS.EDITAR` | ESC-02, 06, 10; coerência §6.2 |
| `GET/POST /api/admin/perfiles`, `PATCH /api/admin/perfiles/{id}` | `PERFILES.VER/CREAR/EDITAR` | ESC-01, 03, 04, 05, 08, 10 |
| `PUT /api/admin/perfiles/{id}/permisos` | `PERFILES.EDITAR` | ESC-01, 03, 05, 08, 09, 10 |
| `GET /api/admin/permisos` | `PERFILES.VER` | Catálogo sem `PLATAFORMA.*` |
| `GET /api/admin/auditoria` | `AUDITORIA.VER` | Só a empresa da sessão |

Telas: `/administracion/usuarios` (lista, novo, detalhe com abas Datos, Perfiles, Alcance), `/administracion/roles` (grade módulo × ação, com as permissões que o ator não pode conceder desabilitadas) e `/administracion/auditoria`. `/administracion/configuracion` fica fora deste REQ.

## 13. Riscos do próprio desenho

| Risco | Mitigação |
|---|---|
| O banco real tem outro modelo de perfis e permissões | Fase 0 antes de qualquer DDL; conversão revisada pelo responsável |
| Usuários legítimos ficam sem acesso ao ligar o APLICAR | Fase 1 em OBSERVAR com relatório; backfill explícito na fase 2; liberação progressiva |
| Custo de recalcular permissões e de travar linhas a cada requisição | Uma consulta agregada por requisição; `FOR SHARE` só nas gravações; medir antes de otimizar |
| RLS mal configurada | Fase 5 por tabela, testes antes de ativar, papel de migração separado |
| Telas cliente inteiras dificultam o gate por página | Layout de servidor por módulo |
