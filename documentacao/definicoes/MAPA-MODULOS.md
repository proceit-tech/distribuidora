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

Observação geral: todo status **REAL** também é **NAO_VERIFICADO em execução**, porque não houve banco nem build neste levantamento (ver `TST-REQ-2026-001.md`). O status indica o que o código faz, não um teste de ponta a ponta.

## 1. Matriz de rotas de tela (26 páginas)

| # | Rota | Arquivo (linhas) | Fonte de dados | Status | Observações |
|---|---|---|---|---|---|
| 1 | `/` | `app/page.tsx` (13) | sessão | REAL | Redireciona para `/dashboard` ou `/login` |
| 2 | `/login` | `app/(public)/login/page.tsx` (9) + `components/auth/login-form.tsx` | `/api/auth/login` | PARCIAL | A empresa é fixa (`CASA_MINGO`, `login-form.tsx:8`) e não há campo para ela. A senha demo vem pré-preenchida (`:31`) |
| 3 | `/dashboard` | `dashboard/page.tsx` (430) | constantes no arquivo | DEMO | Indicadores estáticos. 9 dos 13 links levam a rotas inexistentes (`/ventas`, `/pedidos`, `/entregas`, `/finanzas/cuentas-por-cobrar`, `/reportes`) |
| 4 | `/clientes` | `clientes/page.tsx` (827) | `clientes-storage` | DEMO | Não lê a API. Cliente criado em `/clientes/nuevo` não aparece aqui |
| 5 | `/clientes/nuevo` | `clientes/nuevo/page.tsx` (2094) | `GET/POST /api/clientes` | PARCIAL | Única tela ligada a API de negócio. Contrato quebrado: espera `paises` (`:290`), que a API não envia (`app/api/clientes/route.ts:572`), e não envia `paisNombre`, que a API exige (`route.ts:667`). Ver §5 |
| 6 | `/clientes/[id]` | `clientes/[id]/page.tsx` (2012) | `clientes-storage` | DEMO | Detalhe e edição no navegador (`actualizarClienteDemo`, `:572`) |
| 7 | `/proveedores` | `proveedores/page.tsx` (876) | `proveedores-storage` | DEMO | |
| 8 | `/proveedores/nuevo` | `proveedores/nuevo/page.tsx` (31) + `_components/proveedor-form.tsx` | `proveedores-storage` | DEMO | `/api/proveedores` existe, mas não é chamada |
| 9 | `/proveedores/[id]` | `proveedores/[id]/page.tsx` (106) | `proveedores-storage` | DEMO | Reaproveita o formulário |
| 10 | `/productos` | `productos/page.tsx` (1010) | `productos-storage` | DEMO | 562 produtos base de inventário de prospect |
| 11 | `/productos/nuevo` | `productos/nuevo/page.tsx` (38) + `_components/producto-form.tsx` | `productos-storage` | DEMO | `/api/productos` existe, mas não é chamada. O produto criado não entra no stock |
| 12 | `/productos/[id]` | `productos/[id]/page.tsx` (103) | `productos-storage` | DEMO | A edição gera código novo (`lib/mocks/productos-storage.ts:126`) |
| 13 | `/listas-precio` | `listas-precio/page.tsx` (917) | `listas-precio-storage` | DEMO | Estado VENCIDA calculado na tela (`:38`) |
| 14 | `/listas-precio/nuevo` | `listas-precio/nuevo/page.tsx` (41) + `_components/lista-precio-form.tsx` | `listas-precio-storage` | DEMO | |
| 15 | `/listas-precio/[id]` | `listas-precio/[id]/page.tsx` (109) | `listas-precio-storage` | DEMO | |
| 16 | `/recepciones` | `recepciones/page.tsx` (405) | `recepciones-storage` | DEMO | |
| 17 | `/recepciones/nuevo` | `recepciones/nuevo/page.tsx` (881) | `recepciones-storage` → `movimientos-stock-storage` | DEMO | Gera movimentos de ENTRADA e altera o stock (no navegador) |
| 18 | `/recepciones/[id]` | `recepciones/[id]/page.tsx` (316) | `recepciones-storage` | DEMO | Somente leitura |
| 19 | `/stock` | `stock/page.tsx` (1513) | `stock-storage` | DEMO | Exporta Excel (`:458`, `:632`). O custo exibido é o preço de venda (`:54`) |
| 20 | `/stock/[id]` | `stock/[id]/page.tsx` (411) | `stock-storage` | DEMO | Somente leitura |
| 21 | `/movimientos` | `movimientos/page.tsx` (386) | `movimientos-stock-storage` | DEMO | |
| 22 | `/movimientos/nuevo` | `movimientos/nuevo/page.tsx` (806) | `stock-storage`, `movimientos-stock-storage` | DEMO | Depósitos fixos (`:29`); usuário fixo "admin" (`:93`) |
| 23 | `/movimientos/[id]` | `movimientos/[id]/page.tsx` (206) | `movimientos-stock-storage` | DEMO | Somente leitura; não há anulação |
| 24 | `/facturas` | `facturas/page.tsx` (392) | `facturas-storage` | DEMO | |
| 25 | `/facturas/nuevo` | `facturas/nuevo/page.tsx` (1624) | `facturas-storage`, clientes e productos do `localStorage` | DEMO | Aprova automaticamente com CDC fictício (`lib/mocks/facturas-storage.ts:208-212`). Sem SIFEN |
| 26 | `/facturas/[id]` | `facturas/[id]/page.tsx` (414) | `facturas-storage` | DEMO | Somente leitura |

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
