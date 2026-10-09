# DistribuNex — Arquitetura atual

Requisito: REQ-2026-001 · Autor: Claude · Data: 2026-10-08
Base analisada: branch `main`, commit `7f4230a` (17 commits na `main`).
Situação: **protótipo comercial**. Somente a autenticação e três APIs de cadastro têm persistência em PostgreSQL. Todas as telas de operação gravam no `localStorage` do navegador.

> Convenção: referências `arquivo:linha` apontam para o commit acima. "Inferido do código" significa que a informação vem da leitura estática, sem execução nem acesso ao banco.

## 1. Visão geral

| Camada | Tecnologia (de `package.json`) | Observação |
|---|---|---|
| Framework | Next.js 16.2.6 (App Router), React 19.2.6 | Grupos de rota `app/(private)` e `app/(public)` |
| Linguagem | TypeScript 5.9.3, `strict: true` (`tsconfig.json:7`) | Alias `@/*` → raiz (`tsconfig.json:17`) |
| Estilos | CSS Modules (predominante), Tailwind 4 importado em `app/globals.css:1`, `styled-jsx` global em `app/(private)/clientes/nuevo/page.tsx:1563` | Três abordagens convivem |
| Banco | PostgreSQL via `pg` 8.23 (`lib/db/index.ts`) | Pool único, `max: 10` (`lib/db/index.ts:18`) |
| Planilhas | `xlsx` 0.18.5, importado dinamicamente em `app/(private)/stock/page.tsx:459` | Só exportação |
| Lint | ESLint 9 + `eslint-config-next` (`eslint.config.mjs`) | Não há script `test` nem typecheck no `package.json` |

Tamanho: 121 arquivos fora de `documentacao/`; 79 arquivos `.ts/.tsx` com 33.542 linhas; 10.883 linhas de CSS; 26 páginas e 5 route handlers.

```
Navegador
 ├─ Telas (Client Components "use client")
 │    ├─ 23 telas de negócio ──► lib/mocks/*-storage.ts ──► localStorage / sessionStorage   (DEMO)
 │    ├─ clientes/nuevo ──────► /api/clientes (fetch)                                       (REAL ou DEMO)
 │    └─ login-form ──────────► /api/auth/login, sidebar ──► /api/auth/logout                (REAL ou DEMO)
 │
Servidor Next.js
 ├─ app/(private)/layout.tsx ──► getShellContext() ──► getCurrentSession()   (guarda de rota)
 ├─ app/api/auth/{login,logout} ─┐
 ├─ app/api/clientes ────────────┼──► lib/db (Pool pg) ──► PostgreSQL (esquema fora do repositório)
 ├─ app/api/proveedores ─────────┤      (sem chamador na UI)
 └─ app/api/productos ───────────┘      (sem chamador na UI)
```

## 2. Componentes do servidor

### 2.1 Proteção de rotas
- Não existe `middleware.ts`/`proxy.ts`. A proteção das telas é feita no layout privado, que redireciona para `/login` quando `getShellContext()` retorna `null` (`app/(private)/layout.tsx:11-15`).
- `app/page.tsx` redireciona para `/dashboard` ou `/login` conforme a sessão.
- `app/(public)/login/page.tsx` redireciona para `/dashboard` se já houver sessão.
- Cada route handler de API verifica a sessão por conta própria, mas só fora do modo demo (ver 2.4).

### 2.2 Sessão (`lib/auth/session.ts`)
- Cookie `distribunex_session` (nome configurável por `SESSION_COOKIE_NAME`), com valor `"<uuid>.<segredo base64url de 32 bytes>"` (`createSessionToken`).
- Banco: o segredo é armazenado como `crypt(segredo, gen_salt('bf', 12))` em `sesiones_usuario.token_hash` (`app/api/auth/login/route.ts:237`). Cada requisição autenticada valida o segredo com `crypt()` (`lib/auth/session.ts:121`), ou seja, um bcrypt de custo 12 por requisição.
- Duração absoluta de 8 horas (`lib/auth/session.ts:12`), sem expiração por inatividade e sem renovação.
- A consulta exige sessão não revogada e não expirada, usuário `ACTIVO` e não bloqueado, e agrega os códigos de perfil (`lib/auth/session.ts:109-128`).

### 2.3 Login e logout
- `POST /api/auth/login` (`app/api/auth/login/route.ts`):
  - entrada: `empresa`, `usuario`, `contrasena`, com limites de 30, 80 e 200 caracteres (`:86`);
  - busca o usuário por `lower(empresas.codigo)` e `lower(usuarios.usuario)`;
  - a senha é verificada com `password_hash = crypt($2, password_hash)`;
  - após 5 falhas, o usuário fica bloqueado por 15 minutos (`:184-185`);
  - registra `eventos_seguridad` com `LOGIN_FALLIDO` ou `LOGIN_EXITOSO`, incluindo IP (`x-forwarded-for` validado com `isIP`) e user-agent;
  - em transação, executa `set_config('app.usuario_id' …)` (`:220`), o que sugere triggers de auditoria no banco (NAO_VERIFICADO), zera tentativas e cria a sessão;
  - cookie `httpOnly`, `sameSite: "lax"`, `secure` somente em produção (`:42-50`).
- `POST /api/auth/logout`: revoga a sessão (`revocada_at = now()`, `app/api/auth/logout/route.ts:42`) e apaga o cookie.

### 2.4 Modo demonstração
Existem **duas** chaves de modo demo, que não são equivalentes:

| Onde | Condição | Arquivo |
|---|---|---|
| Sessão, login, logout, permissões | `DEMO_MODE === "true"` | `lib/auth/session.ts:28`, `app/api/auth/login/route.ts:96` |
| APIs de clientes, proveedores e productos | `DEMO_MODE === "true"` **ou** ausência de `DATABASE_URL` | `app/api/clientes/route.ts:5-7`, `app/api/proveedores/route.ts:5-7`, `app/api/productos/route.ts:5-7` |

Em modo demo:
- o login aceita somente `casa_mingo` / `admin` / `admin123`, fixos no código (`app/api/auth/login/route.ts:21-23`);
- o cookie recebe o valor constante `demo-casa-mingo` (`lib/auth/session.ts:13`), e qualquer navegador que envie esse valor obtém uma sessão de administrador;
- as APIs devolvem listas vazias e simulam a criação de registros, sem persistir nada.

### 2.5 Autorização
- `lib/auth/permissions.ts` define `userHasPermission(user, recurso, accion)`, mas **nenhum arquivo o importa**: é código sem uso. Ele também faz `await import("@/lib/db")` no topo do módulo (`lib/auth/permissions.ts:1`), antes dos demais imports.
- `getShellContext` envia `permissions: []` ao shell (`lib/auth/server-context.ts:37`). Com a lista vazia, `resolveNavigation` mostra o menu inteiro (`lib/navigation/menu.ts:321-322`, comentário "Para el mockup").
- Nenhuma API verifica permissão por recurso. Basta ter uma sessão válida para ler e criar clientes, proveedores e productos.

### 2.6 Banco (`lib/db/index.ts`)
- O `Pool` é criado no import do módulo, que lança erro se `DATABASE_URL` não existir (`lib/db/index.ts:6`). Os módulos o importam de forma dinâmica para não quebrar o modo demo.
- Em desenvolvimento, o pool é reaproveitado em `global.distribunexPool`.
- O esquema SQL **não está no repositório** e nunca esteve: nenhum commit de nenhuma branch contém um arquivo `.sql`. O README cita migrations até `017_administrador_inicial.sql` e um `.env.local.example`, e nenhum dos dois existe. Ver `MODELO-DADOS-ATUAL.md`.

## 3. Componentes do cliente

### 3.1 Shell
- `components/layout/app-shell/app-shell.tsx`: guarda no `localStorage` (`distribunex.shell.sidebar-collapsed`) se a barra lateral está recolhida.
- `components/layout/sidebar/sidebar.tsx`: grupos do menu, link fixo para o Dashboard, dados da empresa e do usuário, e logout (`POST /api/auth/logout`, depois `window.location.href = "/login"`).
- `lib/navigation/menu.ts`: 31 itens em 8 grupos. Somente 9 têm página. Ver `MAPA-MODULOS.md`.
- `types/navigation.ts` duplica os tipos de `types/shell.ts`. Só o ícone o usa (`components/layout/navigation-icon/navigation-icon.tsx:3`).

### 3.2 Persistência demonstrativa (`lib/mocks`)
- Um par de arquivos por domínio: dados iniciais (`<dominio>.ts`) e repositório no navegador (`<dominio>-storage.ts`), com as chaves `distribunex.demo.<dominio>.v1` no `localStorage`. As mensagens de "flash" ficam no `sessionStorage`.
- Os dados demo de produtos são **562 itens** de um inventário real de prospect (`INVENTARIO_MINGO`, `lib/mocks/productos.ts`), com marca, procedência, preço de venda e quantidade. Todos têm `costoPromedio: 0` (`lib/mocks/productos.ts:753`). O stock inicial é derivado desses produtos (`lib/mocks/stock.ts:9`).
- Os dados ficam no navegador de quem testa: não são compartilhados entre usuários nem dispositivos, não têm controle de concorrência, e o usuário pode alterá-los livremente.
- `productos-storage` e `stock-storage` reinstalam os dados base quando encontram 20 itens ou menos e a base é maior (`lib/mocks/productos-storage.ts:56`, `lib/mocks/stock-storage.ts:67`).

## 4. Dependências entre módulos

| Módulo | Lê de | Escreve em | Observação |
|---|---|---|---|
| Recepciones | productos (localStorage), proveedores (localStorage, chave lida diretamente) | recepciones, **movimientos e stock** (via `crearMovimientoStockDemo`) | Única integração entre módulos com efeito em stock |
| Movimientos | stock (localStorage) | movimientos, stock | Lista de produtos vem do stock, não de productos |
| Stock | stock (localStorage) | — (somente exportação Excel) | |
| Facturas | clientes e productos (localStorage, chaves lidas diretamente) | facturas | Não baixa stock, não usa lista de preços |
| Listas de precio | productos e clientes (localStorage) | listas-precio | Preços não são consumidos por nenhum módulo |
| Productos | proveedores e productos (localStorage) | productos | Não cria registro de stock |
| Clientes (nuevo) | `/api/clientes` | `/api/clientes` | Lista e edição usam localStorage |
| Proveedores | localStorage | localStorage | A API existe, mas não é chamada |

Consequências diretas, inferidas do código:
- Um produto criado em Productos **não** aparece em Stock nem em Movimientos.
- Uma recepção desse produto falha com "El producto no existe en el stock demo." (`lib/mocks/movimientos-stock-storage.ts:189`).
- Um cliente criado em "Nuevo cliente" vai para a API, e não para o `localStorage`. Por isso não aparece na lista de clientes nem na factura.

## 5. Configuração e implantação

| Variável | Uso | Onde |
|---|---|---|
| `DATABASE_URL` | Pool PostgreSQL; sua ausência ativa o demo nas APIs | `lib/db/index.ts:3`, APIs `:7` |
| `DEMO_MODE` | Modo demonstração | `lib/auth/session.ts:28`, APIs |
| `SESSION_COOKIE_NAME` | Nome do cookie | `lib/auth/session.ts:9` |
| `NODE_ENV` | Cookie `secure`; cache do pool | login, logout, `lib/db` |

- O histórico mostra deploy demo no Vercel (commits `65a7ade` a `6fe68be`). Por decisão da PROCEIT, o Vercel deixa de ser usado. Na `main` não há Dockerfile; há uma proposta em revisão no PR #1 (`claude/docker`), fora do escopo deste REQ.
- O `.gitignore` ignora `.env*` (`.gitignore:12`), inclusive arquivos de exemplo.

## 6. Correções ao `INVENTARIO-TECNICO-INICIAL.md`

| Afirmação do inventário | Situação verificada no código |
|---|---|
| "Clientes: listagem/novo/detalhe + `app/api/clientes/route.ts` (SQL)" | Só `clientes/nuevo` chama a API. A listagem (`clientes/page.tsx`) e o detalhe/edição (`clientes/[id]/page.tsx:572`) usam o `localStorage` |
| "Proveedores … + `app/api/proveedores/route.ts` (SQL)" e "Productos … + `app/api/productos/route.ts` (SQL)" | Nenhuma tela chama essas APIs; todas as telas desses módulos usam o `localStorage` |
| "`lib/auth/permissions.ts` verifica direitos do usuário" | A função existe, mas nenhum arquivo a importa |
| "APIs de cadastros usam filtros por empresa_id em operações examinadas" | As leituras filtram por `empresa_id`. Na escrita, `POST /api/productos` grava `categoria_id`, `marca_id`, `impuesto_id`, `proveedor_id`, `deposito_id` e outros IDs **sem** validar que pertencem à empresa da sessão. `POST /api/proveedores` grava `impuesto_id` de retenção sem validação |
| Stack sem menção a estilos | Coexistem CSS Modules, Tailwind 4 e `styled-jsx` global |
| Não citado | Há 10 arquivos vazios versionados (lista em `MAPA-MODULOS.md` §4) |
| "Toda tela `page.tsx` deve ter … export default" | Verificado: as 26 páginas têm `export default` |
