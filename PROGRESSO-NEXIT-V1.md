# PROGRESSO-NEXIT-V1

Branch: `feature/NEXIT-2026-001-banco-demo`. Regra: uma funcionalidade por vez; sem mock/localStorage/dados fixos no modo real; commit+push ao terminar cada item.

| # | Item | Estado | Commit |
|---|---|---|---|
| 1 | Menu e acesso por perfil | **ENTREGUE (pendente: typecheck/build no seu ambiente)** | ver git log |
| 2 | Clientes | pendente | |
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

## Pendências conhecidas
- Typecheck/lint/build **não foram executados** (npm sem acesso ao registry na sessão do Claude). Rodar `npm ci && npx tsc --noEmit && npm run lint && npm run build`.
- `/dashboard` e o link fixo "Dashboard" da sidebar ainda são mock (item 8).
- Sem página de edição de perfis/usuários/permissões (administração de empresa) — fora dos 8 itens.
- Permissões `EDITAR` ainda não aplicadas (não há PUT; entram em cada módulo).
- Telas dos módulos 2–7 ainda usam mock (cada item remove o seu).

## Testes do item 1 (executados)
- SQL de `getAccessContext` contra PG16 descartável (NEX-001..016 + S-001): `proceit/admin` → plataforma; `casa_mingo/admin` → admin de empresa, não plataforma; `casa_mingo/ventas` → {CLIENTES.VER, STOCK.VER}; `casa_mingo/sinperfil` → nada.
- `resolveNavigation` (node): PROCEIT → só /administracion/empresas; CASA MINGO admin → 6 módulos; perfil VENTAS → /clientes,/stock; sem perfil → vazio.
- Não executado: chamadas HTTP reais, build.
