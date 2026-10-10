# PROGRESSO-NEXIT-V1

Branch: `feature/NEXIT-2026-001-banco-demo`. Regra: uma funcionalidade por vez; sem mock/localStorage/dados fixos no modo real; commit+push ao terminar cada item.

| # | Item | Estado | Commit |
|---|---|---|---|
| 1 | Menu e acesso por perfil | **ENTREGUE (pendente: typecheck/build no seu ambiente)** | ver git log |
| 2 | Clientes | **ENTREGUE (pendente: build + teste manual na tela)** | ver git log |
| 3 | Proveedores | **ENTREGUE (pendente: build + teste manual na tela)** | ver git log |
| 4 | Productos | **ENTREGUE (pendente: build + teste manual na tela)** | ver git log |
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

## Item 3 — Proveedores (sem mock/localStorage)
- Lista (`proveedores/page.tsx`): `GET /api/proveedores` (filtra `empresa_id` da sessão); busca/filtros/paginação sobre dados reais; vazia ("Aún no hay proveedores registrados") se não houver; estados de carga/erro; aviso `?ok=creado|actualizado`.
- Cadastro (`nuevo`) e edição (`[id]`): mesmo formulário `_components/proveedor-form.tsx` (layout intacto). Catálogos vêm do PostgreSQL (grupos, condições e meios de pagamento, moedas, Incoterms, países, departamento→distrito→cidade em cascata para PRY); removidas as listas fixas.
- API: `POST /api/proveedores` (`PROVEEDORES.CREAR`), novo `GET`/`PUT /api/proveedores/[id]` (`VER` / `EDITAR`). Validação e gravação compartilhadas em `lib/proveedores/shared.ts`; `empresa_id` e `creado_por` sempre da sessão; referências (grupo, meio de pagamento) validadas contra a empresa; duplicidade de documento → 409; transação com ROLLBACK. `PUT` reemplaza contatos/direcciones/cuentas/retenciones/documentos pelo que o formulário envia; `pais_nombre` é recalculado.
- Sem `DATABASE_URL` e sem `DEMO_MODE=true` → 503 (nunca dados simulados).
- Removidos: `lib/mocks/proveedores.ts`, `lib/mocks/proveedores-storage.ts`, `ProveedorDemo`/`NuevoProveedorDemo`, pills "DEMO" e "Modo demostración".
- Testes (PG16 descartável, rotas reais + `permissions.ts` real, driver mínimo local no lugar de `pg`): 48 verificações, 0 falhas — 401/403 por perfil (sem permissão, só VER, VER+CREAR, VER+EDITAR, só EDITAR), lista vazia, catálogos só da empresa, criação com 5 tipos de filhos, `empresa_id` do body ignorado, duplicado 409, grupo/meio de outra empresa 400, rollback, empresa B não vê/edita/lê proveedores da A (404), mesmo RUC em empresas distintas, edição/inativação, 503 sem banco.
- NÃO executado: typecheck completo/build/lint (npm sem registry; `tsc` parcial sem erros de tipos de Proveedores além dos ruídos por falta de `react`/`next`), HTTP real, teste visual. Não há exclusão de proveedores (só inativar por `activo`). Upload real de documentos não existe: documento = nome + URL.

## Item 4 — Productos (sem mock/localStorage)
- Lista (`productos/page.tsx`): `GET /api/productos` (filtra `empresa_id` da sessão); busca/filtros/paginação sobre dados reais; **stock disponível real** (`v_stock_producto`) e alerta "bajo el mínimo"; vazia ("Aún no hay productos registrados") se não houver; estados de carga/erro.
- Cadastro (`nuevo`) e edição (`[id]`): mesmo formulário `_components/producto-form.tsx` (layout intacto), catálogos do PostgreSQL (categorias, marcas, unidades, impostos, proveedores, depósitos, países e produtos da empresa para alternativos/kits).
- API: `POST /api/productos` (`PRODUCTOS.CREAR`), novo `GET`/`PUT /api/productos/[id]` (`VER`/`EDITAR`). Validação/gravação compartilhadas em `lib/productos/shared.ts`; `empresa_id`/`creado_por` da sessão; código `PRD-nnnnnn` automático se vazio; país de origem tomado do catálogo; FKs compostas impedem categoria/marca/proveedor/depósito/produto de outra empresa; `PUT` substitui códigos, presentaciones, proveedores, depósitos, alternativos, componentes (kit) e documentos; `costo_promedio` NÃO é gravado pelo formulário (custo é de Inventário).
- Corrigido: o formulário enviava datas `yyyy-mm-dd` e a API só aceitava `dd/mm/yyyy`; POST exigia código mesmo com placeholder "Automático".
- Removidos da tela por não terem coluna/catálogo no banco: **Familia, Línea** (listas fixas do cliente), **Precio/Valor de venta de referencia** (pertence a Listas de precios), **Inventario inicial / Stock actual demo / Costo promedio** (pertencem a Movimientos/Stock). Procedencia passou a texto livre (`origen_etiqueta`). Removidos pills "DEMO"/"INVENTARIO MINGO" e o texto "Modo demostración".
- Testes (PG16 descartável, rotas reais + `permissions.ts` real): 55 verificações, 0 falhas — 401/403 por perfil, lista vazia, catálogos só da empresa, criação com hijos, body com `empresa_id` ignorado, duplicado 409, referências de outra empresa 400, rollback, B não vê/edita A (404), mesmo código em empresas distintas, stock real na lista, edição/inativação, KIT (componentes, ciclo, troca de tipo), 503 sem banco.
- NÃO executado: typecheck completo/build/lint (npm sem registry), HTTP real, teste visual.
- Pendências de Productos: Familia/Línea precisam de catálogo + migração (NEX-017+) e decisão sua; preço de referência virá em Listas de precios; `lib/mocks/productos*.ts` e tipos legados `ProductoDemo` seguem no repositório só porque Stock/Movimientos/Recepciones (mocks, ainda não migrados) os importam — apagar com os itens 6/7; sem exclusão de produtos (apenas inativar); documentos = nome + URL (sem upload); ubicación preferida por depósito não tem campo na tela.

## Pendências conhecidas de Clientes
- Editar contatos, direcciones, documentos adicionais e demais tabelas filhas de um cliente existente ainda não é possível (só são criados em `clientes/nuevo`); o `PUT` altera apenas a ficha principal.
- Não há exclusão de clientes (apenas inativar/bloquear vendas).
- Build/typecheck/lint não executados; sem teste HTTP/visual; a correção do mapeamento de `tipo_operacion` (commit `f20fa7a`, feita pelo proprietário) não foi reexecutada por mim.
- Regras provisórias D-C1..D-C9 não implementadas como aprovadas; Validação de DV do RUC (algoritmo) pendente de decisão.

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
