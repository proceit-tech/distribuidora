# DistribuNex — Mapa de módulos, rotas e APIs

Requisito: REQ-2026-001 (CA-01, CA-02) · Autor: Claude · Data: 2026-10-08 · Base: `main` @ `7f4230a`

## Legenda de status

| Status | Significado |
|---|---|
| **REAL** | Lê e grava no PostgreSQL por rota de API, com sessão do banco. Funciona sem `DEMO_MODE` |
| **DEMO** | Funciona só no navegador (`localStorage`/`sessionStorage`) ou com dados fixos no código. Nada chega ao servidor |
| **PARCIAL** | Parte do fluxo é REAL e parte é DEMO, ou o fluxo REAL tem um defeito conhecido que o impede de concluir |
| **NAO_VERIFICADO** | Depende do esquema do banco, que não foi inspecionado (sem acesso autorizado). Ver `MODELO-DADOS-ATUAL.md` |
| **AUSENTE** | Item de menu ou link sem página correspondente (abre o 404 do Next.js) |

Observação geral: todo status **REAL** também é **NAO_VERIFICADO em execução**, porque não houve banco nem teste de ponta a ponta neste levantamento. O build de cada SHA foi concluído pela integração Vercel (evidência em `TST-REQ-2026-001.md`, V15), o que prova que compila, não que funciona com banco. O status indica o que o código faz.

## 1. Matriz de rotas de tela (26 páginas)

| # | Rota | Arquivo (linhas) | Fonte de dados (leitura) | Escrita: chamada e destino | Status | Observações |
|---|---|---|---|---|---|---|
| 1 | `/` | `app/page.tsx` (13) | sessão | — (só leitura de sessão) | REAL | Redireciona para `/dashboard` ou `/login` |
| 2 | `/login` | `app/(public)/login/page.tsx` (9) + `components/auth/login-form.tsx` | `/api/auth/login` | `POST /api/auth/login` (`login-form.tsx:42`) → `sesiones_usuario` (PostgreSQL) ou cookie demo | PARCIAL | A empresa é fixa (`CASA_MINGO`, `login-form.tsx:8`) e não há campo para ela. A senha demo vem pré-preenchida (`:31`) |
| 3 | `/dashboard` | `dashboard/page.tsx` (430) | constantes no arquivo | nenhuma | DEMO | Indicadores estáticos. 9 dos 13 links levam a rotas inexistentes (`/ventas`, `/pedidos`, `/entregas`, `/finanzas/cuentas-por-cobrar`, `/reportes`) |
| 4 | `/clientes` | `clientes/page.tsx` (827) | `clientes-storage` | nenhuma (leitura: `clientes-storage`) | DEMO | Não lê a API. Cliente criado em `/clientes/nuevo` não aparece aqui |
| 5 | `/clientes/nuevo` | `clientes/nuevo/page.tsx` (2094) | `GET/POST /api/clientes` | `POST /api/clientes` (`clientes/nuevo/page.tsx:490`) → PostgreSQL; em demo, resposta simulada sem persistir | PARCIAL | Única tela ligada a API de negócio. Contrato quebrado: espera `paises` (`:290`), que a API não envia (`app/api/clientes/route.ts:572`), e não envia `paisNombre`, que a API exige (`route.ts:667`). Ver §5 |
| 6 | `/clientes/[id]` | `clientes/[id]/page.tsx` (2012) | `clientes-storage` | `actualizarClienteDemo` (`clientes/[id]/page.tsx:572`) → `localStorage` | DEMO | Detalhe e edição no navegador (`actualizarClienteDemo`, `:572`) |
| 7 | `/proveedores` | `proveedores/page.tsx` (876) | `proveedores-storage` | nenhuma | DEMO | |
| 8 | `/proveedores/nuevo` | `proveedores/nuevo/page.tsx` (31) + `_components/proveedor-form.tsx` | `proveedores-storage` | `crearProveedorDemo` (`proveedores/nuevo/page.tsx:15`) → `localStorage` | DEMO | `/api/proveedores` existe, mas não é chamada |
| 9 | `/proveedores/[id]` | `proveedores/[id]/page.tsx` (106) | `proveedores-storage` | `actualizarProveedorDemo` (`proveedores/[id]/page.tsx:52`) → `localStorage` | DEMO | Reaproveita o formulário |
| 10 | `/productos` | `productos/page.tsx` (1010) | `productos-storage` | nenhuma | DEMO | 562 produtos base de inventário de prospect |
| 11 | `/productos/nuevo` | `productos/nuevo/page.tsx` (38) + `_components/producto-form.tsx` | `productos-storage` | `crearProductoDemo` (`productos/nuevo/page.tsx:19`) → `localStorage` | DEMO | `/api/productos` existe, mas não é chamada. O produto criado não entra no stock |
| 12 | `/productos/[id]` | `productos/[id]/page.tsx` (103) | `productos-storage` | `actualizarProductoDemo` (`productos/[id]/page.tsx:54`) → `localStorage` | DEMO | A edição gera código novo (`lib/mocks/productos-storage.ts:126`) |
| 13 | `/listas-precio` | `listas-precio/page.tsx` (917) | `listas-precio-storage` | nenhuma | DEMO | Estado VENCIDA calculado na tela (`:38`) |
| 14 | `/listas-precio/nuevo` | `listas-precio/nuevo/page.tsx` (41) + `_components/lista-precio-form.tsx` | `listas-precio-storage` | `crearListaPrecioDemo` (`listas-precio/nuevo/page.tsx:21`) → `localStorage` | DEMO | |
| 15 | `/listas-precio/[id]` | `listas-precio/[id]/page.tsx` (109) | `listas-precio-storage` | `actualizarListaPrecioDemo` (`listas-precio/[id]/page.tsx:60`) → `localStorage` | DEMO | |
| 16 | `/recepciones` | `recepciones/page.tsx` (405) | `recepciones-storage` | nenhuma | DEMO | |
| 17 | `/recepciones/nuevo` | `recepciones/nuevo/page.tsx` (881) | `recepciones-storage` → `movimientos-stock-storage` | `crearRecepcionDemo` (`recepciones/nuevo/page.tsx:367`) → `localStorage` (recepções, movimentos e stock) | DEMO | Gera movimentos de ENTRADA e altera o stock (no navegador) |
| 18 | `/recepciones/[id]` | `recepciones/[id]/page.tsx` (316) | `recepciones-storage` | nenhuma | DEMO | Somente leitura |
| 19 | `/stock` | `stock/page.tsx` (1513) | `stock-storage` | nenhuma (exporta arquivo no navegador) | DEMO | Exporta Excel (`:458`, `:632`). O custo exibido é o preço de venda (`:54`) |
| 20 | `/stock/[id]` | `stock/[id]/page.tsx` (411) | `stock-storage` | nenhuma | DEMO | Somente leitura |
| 21 | `/movimientos` | `movimientos/page.tsx` (386) | `movimientos-stock-storage` | nenhuma | DEMO | |
| 22 | `/movimientos/nuevo` | `movimientos/nuevo/page.tsx` (806) | `stock-storage`, `movimientos-stock-storage` | `crearMovimientoStockDemo` (`movimientos/nuevo/page.tsx:234`) → `localStorage` (movimentos e stock) | DEMO | Depósitos fixos (`:29`); usuário fixo "admin" (`:93`) |
| 23 | `/movimientos/[id]` | `movimientos/[id]/page.tsx` (206) | `movimientos-stock-storage` | nenhuma | DEMO | Somente leitura; não há anulação |
| 24 | `/facturas` | `facturas/page.tsx` (392) | `facturas-storage` | nenhuma | DEMO | |
| 25 | `/facturas/nuevo` | `facturas/nuevo/page.tsx` (1624) | `facturas-storage`, clientes e productos do `localStorage` | `crearFacturaDemo` (`facturas/nuevo/page.tsx:402`) → `localStorage` | DEMO | Aprova automaticamente com CDC fictício (`lib/mocks/facturas-storage.ts:208-212`). Sem SIFEN |
| 26 | `/facturas/[id]` | `facturas/[id]/page.tsx` (414) | `facturas-storage` | nenhuma | DEMO | Somente leitura |

Total: 1 REAL, 2 PARCIAL e 23 DEMO.

## 2. Matriz do menu (`lib/navigation/menu.ts`)

São 32 itens em 8 grupos, mais o link fixo do Dashboard na barra lateral (`components/layout/sidebar/sidebar.tsx:169`). **8 têm página e 24 estão AUSENTES.** Como o menu é exibido sem filtro de permissões (`lib/auth/server-context.ts:37-38`), todos aparecem para qualquer usuário.

| Grupo | Item → rota | Permissão declarada | Página |
|---|---|---|---|
| Maestros | Clientes → `/clientes` | `CLIENTES.VER` | DEMO/PARCIAL |
| | Proveedores → `/proveedores` | `PROVEEDORES.VER` | DEMO |
| | Productos → `/productos` | `PRODUCTOS.VER` | DEMO |
| | Listas de precios → `/listas-precio` | `LISTAS_PRECIO.VER` | DEMO |
| | Vendedores → `/vendedores` | `VENDEDORES.VER` | AUSENTE |
| | Zonas y rutas → `/zonas-rutas` | declarada | AUSENTE |
| Compras | Solicitudes → `/solicitudes` | declarada | AUSENTE |
| | Órdenes de compra → `/ordenes` | declarada | AUSENTE |
| | Recepciones → `/recepciones` | declarada | DEMO |
| | Devoluciones → `/devoluciones` | declarada | AUSENTE |
| Inventario | Stock → `/stock` | declarada | DEMO |
| | Movimientos → `/movimientos` | declarada | DEMO |
| | Depósitos → `/depositos` | declarada | AUSENTE |
| | Reposición → `/reposicion` | declarada | AUSENTE |
| Ventas | Pedidos → `/pedidos` | declarada | AUSENTE |
| | Ventas → `/ventas` | declarada | AUSENTE |
| | Entregas → `/entregas` | declarada | AUSENTE |
| Finanzas | Cuentas por cobrar, Cobros, Cuentas por pagar, Pagos, Caja → `/finanzas/*` | declaradas | AUSENTE (5) |
| Facturación | Facturas → `/facturas` | declarada | DEMO |
| | Notas de crédito → `/notas-credito` | declarada | AUSENTE |
| | Notas de remisión → `/notas-remision` | declarada | AUSENTE |
| | Todos los documentos → `/documentos` | `FACTURACION_ELECTRONICA.VER` | AUSENTE |
| | Monitor SIFEN → `/sifen` | `FACTURACION_ELECTRONICA.VER` | AUSENTE |
| Reportes | Reportes operativos → `/reportes` | `REPORTES.VER` | AUSENTE |
| Administración | Usuarios, Roles y permisos, Configuración, Auditoría → `/administracion/*` | `USUARIOS.VER`, `PERFILES.VER`, `CONFIGURACION.VER`, `AUDITORIA.VER` | AUSENTE (4) |

Os códigos de permissão do menu seguem o padrão `RECURSO.ACCION`. Não foi possível confirmar se eles correspondem aos registros da tabela `permisos` (NAO_VERIFICADO).

## 3. Mapa de APIs (5 route handlers)

Todas as APIs de cadastro usam `export const runtime = "nodejs"`, entram em modo demo quando `DEMO_MODE === "true"` ou falta `DATABASE_URL` (`:7`), exigem sessão fora do demo (401) e filtram as leituras pelo `empresa_id` da sessão.

| Método e rota | Arquivo | Chamador na UI | Entrada | Saída e erros | Tabelas (ver `MODELO-DADOS-ATUAL.md`) | Status |
|---|---|---|---|---|---|---|
| `POST /api/auth/login` | `app/api/auth/login/route.ts` | `login-form.tsx` | `{empresa, usuario, contrasena}` | 200 + cookie; 400 (formato/tamanho); 401 (credencial, bloqueio, inativo) | empresas, usuarios, sesiones_usuario, eventos_seguridad | REAL |
| `POST /api/auth/logout` | `app/api/auth/logout/route.ts` | `sidebar.tsx` | cookie | 200, cookie removido | sesiones_usuario | REAL |
| `GET /api/clientes` | `app/api/clientes/route.ts:422` | `clientes/nuevo` (somente `?modo=catalogos`) | `?modo=catalogos`; `?catalogo=departamentos\|distritos&departamento=\|ciudades&distrito=` (`:359-418`) | lista de clientes ou catálogos; 400/401/500 | clientes, catálogos de empresa e globais, referencia_geografica_* | REAL (lista sem chamador) |
| `POST /api/clientes` | `app/api/clientes/route.ts:585` | `clientes/nuevo` (`page.tsx:490`) | cliente + contatos + endereços + documentos | 201; 409 (`23505`); 400 com `error.message` (`:1128`); 500 | clientes, cliente_contactos, direcciones_cliente, cliente_documentos | PARCIAL (contrato quebrado) |
| `GET /api/proveedores` | `app/api/proveedores/route.ts:368` | nenhum | idem clientes | lista ou catálogos | proveedores e catálogos | REAL, sem uso |
| `POST /api/proveedores` | `app/api/proveedores/route.ts:517` | nenhum | proveedor + contatos + endereços + contas bancárias + retenções + documentos | 201; 409 por constraint (`:887`); 400 (`23503` em `:890`; `23514`/`P0001` com mensagem do banco em `:893`; `error.message` em `:897`) | proveedores, proveedor_* | REAL, sem uso |
| `GET /api/productos` | `app/api/productos/route.ts:93` | nenhum | — | catálogos de produto | categorias, marcas, unidades, impuestos, depositos, proveedores, productos | REAL, sem uso |
| `POST /api/productos` | `app/api/productos/route.ts:167` | nenhum | produto (41 colunas) + códigos, unidades, componentes, alternativos, fornecedores, config. por depósito, documentos | 201; 409 (`23505`); 400 com `e.message` (`:431-433`) | productos, producto_* | REAL, sem uso; sem validação de tenant nas FKs |

## 4. Componentes, bibliotecas e arquivos sem conteúdo

| Caminho | Papel | Usado por |
|---|---|---|
| `components/layout/app-shell/*`, `sidebar/*`, `navigation-icon/*` | Shell autenticado | `app/(private)/layout.tsx` |
| `components/auth/login-form.*` | Formulário de login | `/login` |
| `app/(private)/{proveedores,productos,listas-precio}/_components/*-form.tsx` | Formulários compartilhados entre `nuevo` e `[id]` | Respectivas páginas. Clientes não usa formulário compartilhado: `nuevo` e `[id]` têm formulários próprios, e `clientes/_components/cliente-form.tsx` está vazio |
| `lib/auth/session.ts`, `server-context.ts` | Sessão e contexto do shell | layout, APIs |
| `lib/auth/permissions.ts` | Verificação de permissão | **nenhum** |
| `lib/db/index.ts` | Pool PostgreSQL | APIs, sessão |
| `lib/mocks/*` (16 arquivos) | Dados e repositórios demo | Telas DEMO |
| `types/*` | Tipos de domínio. `types/movimientos-stock.ts` tem `"use client"` (desnecessário num arquivo de tipos). `types/navigation.ts` duplica `types/shell.ts`. O tipo de código de produto não inclui `SKU_PROVEEDOR`, que a API aceita | |

**Arquivos vazios versionados (10).** Nenhum é importado por outro arquivo:
- `app/(private)/clientes/_components/cliente-card.tsx` e `cliente-card.module.css`
- `app/(private)/clientes/_components/cliente-form.tsx` e `cliente-form.module.css`
- `app/(private)/productos/nuevo/page.module.css`
- `app/(private)/proveedores/[id]/page.module.css`
- `components/ui/toast/toast-provider.tsx`, `toast.tsx` e `toast.module.css`
- `lib/auth/demo-session.ts`

Também não é usado: `app/(private)/clientes/nuevo/page.module.css`, porque a tela usa `styled-jsx` global (`page.tsx:1563`).

## 5. Fluxos entre módulos (como estão hoje)

### 5.1 Cadastro de cliente
1. `/clientes/nuevo` carrega `GET /api/clientes?modo=catalogos` (`page.tsx:267`).
2. Em modo REAL: a resposta não traz `paises` (`route.ts:572`), então o seletor de país fica sem opções, e o formulário segue com `paisCodigo: "PRY"` (`page.tsx:135`).
3. O `POST` (`page.tsx:490`) não envia `paisNombre`, e a API responde 400 "Informe el país del cliente" (`route.ts:667`). Análise estática; não executado.
4. Em modo DEMO: a API devolve sucesso simulado, mas nada é salvo; a listagem (`clientes/page.tsx`) lê o `localStorage` e não mostra o novo cliente.

### 5.2 Compra → estoque (DEMO)
`recepciones/nuevo` → `crearRecepcionDemo` → para cada item, `crearMovimientoStockDemo(ENTRADA, origen COMPRA)` (`lib/mocks/recepciones-storage.ts:216`) → `aplicarMovimientoAStock` (`movimientos-stock-storage.ts:174`).
- Não é atômico: se um item falhar no meio, os anteriores já foram aplicados.
- Só aceita produtos que já existem no stock demo (`movimientos-stock-storage.ts:189`).
- A recepção nasce como `RECIBIDA` (`recepciones-storage.ts:209`). Não há orden de compra prévia, embora a tela mostre "ordenada".

### 5.3 Movimento manual de estoque (DEMO)
`movimientos/nuevo` → `crearMovimientoStockDemo` → aplica um de 9 tipos ao stock (regras em `REGRAS-EXISTENTES.md` §6).

### 5.4 Faturamento (DEMO)
`facturas/nuevo` lê clientes e productos direto do `localStorage` (`facturas-storage.ts:283`, `:304`) → calcula os totais → grava a factura já `APROBADA`, com CDC fictício.
- Não baixa stock.
- Não gera conta a receber.
- Não consulta a lista de preços: o preço sugerido é `costoPromedio`, que vale 0 em todos os produtos base.

### 5.5 Lista de preços (DEMO)
Lê productos e clientes. Os preços calculados não são consumidos por nenhum outro módulo.

## 6. O que não pode ir para produção nesta condição

Atende AUD-REQ-2026-001-R01 F-004. "Produção" = qualquer ambiente usado por cliente com dados reais. Enquanto a condição da coluna 2 existir, a funcionalidade **não** pode ser oferecida como transacional. A UI pronta não é prova de persistência.

| Funcionalidade | Condição atual que bloqueia | Evidência | Liberada por |
|---|---|---|---|
| Qualquer tela com status DEMO (23 telas da §1) | Grava só no navegador: os dados se perdem ao limpar o navegador, não são compartilhados entre usuários e podem ser alterados pelo próprio usuário | coluna "Escrita" da §1 | REQ do módulo (006 a 012 propostos) |
| Cadastro de cliente (`/clientes/nuevo`) | Contrato quebrado com a API (`paises`/`paisNombre`); listagem e edição em DEMO | §5.1 | REQ-2026-007 proposto |
| Faturas | Aprovação automática com CDC fictício; nenhuma relação com SIFEN, stock ou cobrança | `lib/mocks/facturas-storage.ts:208-212` | REQ-2026-012 e 013 propostos; até lá, rotular "SIMULACIÓN" |
| Stock, movimentos e recepções | Saldos calculados no navegador, sem transação nem concorrência | `lib/mocks/movimientos-stock-storage.ts:174` | REQ-2026-009 e 010 propostos |
| Listas de precio | Regras gravadas e nunca aplicadas | `REGRAS-EXISTENTES.md` LP-NI | REQ-2026-011 proposto |
| `POST /api/productos`, `POST /api/proveedores` | Sem tela que as use; productos sem validação de tenant nas FKs | §3; `PLANO-EVOLUCAO.md` R-06 | REQ-2026-002 e 006/008 propostos |
| Qualquer rota, com usuários de perfis diferentes | Sem verificação de permissão | `PLANO-EVOLUCAO.md` R-02 | REQ-2026-002 |
| Ambiente com `DEMO_MODE=true` ou sem `DATABASE_URL` | Cookie de sessão constante = administrador; APIs simulam sucesso | `lib/auth/session.ts:13,92`; `app/api/clientes/route.ts:5-7` | REQ-2026-002 (RN-12) e 005 proposto |
| Dados demo de produtos | Inventário de prospect real versionado | `lib/mocks/productos.ts` | REQ técnico de limpeza |
