# PROGRESSO-NEXIT-V1

Branch: `feature/NEXIT-2026-001-banco-demo`. Regra: uma funcionalidade por vez; sem mock/localStorage/dados fixos no modo real; commit+push ao terminar cada item.

| # | Item | Estado | Commit |
|---|---|---|---|
| 1 | Menu e acesso por perfil | **ENTREGUE (pendente: typecheck/build no seu ambiente)** | ver git log |
| 2 | Clientes | **ENTREGUE (pendente: build + teste manual na tela)** | ver git log |
| 3 | Proveedores | pendente | |
| 4 | Productos | pendente | |
| 5 | Listas de precios | pendente | |
| 6 | Movimientos | pendente | |
| 7 | Stock | pendente | |
| 8 | Dashboard e relatórios/XLSX | pendente | |

## Item 1 — o que existe
- `lib/auth/permissions.ts`: `getAccessContext` (perfis/permissões reais no PostgreSQL, sempre por `empresa_id` da sessão; administrador de plataforma via `administradores_plataforma`), `guardApi`, `denyIfNoPermission` (401/403), `guardPage`, `guardPlatformPage`.
- `lib/navigation/menu.ts`: menu por perfil. Administrador global (PROCEIT) vê só "Plataforma → Empresas". Empresa cliente vê apenas módulos V1 com página (clientes, proveedores, productos, listas de precios, stock, movimientos) conforme permissões; admin de empresa vê todos esses; sem perfil, nenhum. Nunca mostra Administração global a empresas clientes.
- `lib/auth/server-context.ts`: nome sem "null"; permissões reais no shell.
- APIs `clientes`, `productos`, `proveedores`: GET exige `VER`, POST exige `CREAR` (403 sem permissão).
- Layouts de módulo (`app/(private)/<modulo>/layout.tsx`): bloqueiam por URL (404) sem permissão; `facturas` e `recepciones` (fora da V1) retornam 404; `/administracion/*` só administrador de plataforma.
- `/administracion/empresas`: lista real de empresas (somente leitura). `/` redireciona PROCEIT para ela.

## Item 2 — Clientes (sem mock/localStorage)
- Lista (`clientes/page.tsx`): `GET /api/clientes` (filtra `empresa_id` da sessão); busca/filtros/paginação seguem no cliente sobre os dados reais; vazia se não houver clientes; estados de carga/erro.
- Detalhe/edição (`clientes/[id]/page.tsx`): `GET`/`PUT /api/clientes/[id]` (novo; `PUT` exige `CLIENTES.EDITAR`; empresa sempre da sessão; catálogos reais por id; bloqueio de vendas grava data/usuário; duplicidade de documento → 409).
- Cadastro (`clientes/nuevo`) já usava a API; agora volta a `/clientes?ok=creado`. Corrigido: a API não devolvia `paises` (select de país vazio) e F-01 (`$32::uuid`).
- Removidos: `lib/mocks/clientes.ts`, `lib/mocks/clientes-storage.ts`, `ClienteDemo`, pills DEMO e os catálogos fixos do detalhe.
- Testes (PG16 descartável): 72 consultas da app (inclui as novas) com PREPARE = 0 falhas, F-01 já não precisa de correção; UPDATE/SELECT reais: dono edita e persiste; outra empresa → 0 linhas (UPDATE e SELECT); FK composta rejeita grupo de outra empresa; bloqueio/desbloqueio; inativar.
- NÃO executado: typecheck completo/build/lint (npm sem registry), chamadas HTTP, teste visual. Contatos/direcções/documentos (tabelas filhas) só se criam em `nuevo`; a edição deles ainda não existe.

## Correções da revisão do ChatGPT/proprietário (item 1)
- `hasPermission` nega SEMPRE permissões operacionais ao administrador de plataforma; `getAccessContext` zera `permissions`/`isCompanyAdmin` quando é global. Acesso global = `hasPlatformAccess`/`guardPlatformApi`/`guardPlatformPage` (separado). `proceit/admin` não opera APIs/páginas de CASA MINGO (nem da própria PROCEIT): 403/404.
- APIs clientes/productos/proveedores: sem `DATABASE_URL` e sem `DEMO_MODE=true` → 503, nunca dados simulados.
- `/dashboard` redireciona o administrador global para `/administracion/empresas`.

## Pendências conhecidas
- Typecheck/lint/build **não foram executados** (npm sem acesso ao registry na sessão do Claude). Rodar `npm ci && npx tsc --noEmit && npm run lint && npm run build`.
- `/dashboard` e o link fixo "Dashboard" da sidebar ainda são mock (item 8).
- Sem página de edição de perfis/usuários/permissões (administração de empresa) — fora dos 8 itens.
- Permissões `EDITAR` ainda não aplicadas (não há PUT; entram em cada módulo).
- Telas dos módulos 2–7 ainda usam mock (cada item remove o seu).

## Testes do item 1 (executados)
- SQL de `getAccessContext` contra PG16 descartável (NEX-001..016 + S-001): `proceit/admin` → plataforma; `casa_mingo/admin` → admin de empresa, não plataforma; `casa_mingo/ventas` → {CLIENTES.VER, STOCK.VER}; `casa_mingo/sinperfil` → nada.
- `resolveNavigation` (node): PROCEIT → só /administracion/empresas; CASA MINGO admin → 6 módulos; perfil VENTAS → /clientes,/stock; sem perfil → vazio.
- Revisão: `hasPermission`/`hasPlatformAccess` (node, 6 casos PASS: plataforma não opera; admin de empresa não é plataforma; perfil limitado VER sim/CREAR não).
- **Não executados:** typecheck completo, lint, `next build`, chamadas HTTP reais (npm sem acesso ao registry na sessão do Claude). O 503 sem DATABASE_URL foi verificado só por leitura do código.
