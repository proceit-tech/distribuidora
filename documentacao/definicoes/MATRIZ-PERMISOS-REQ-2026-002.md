# MATRIZ-PERMISOS-REQ-2026-002 — Matriz de permissões proposta

Requisito: REQ-2026-002 (RN-04 a RN-08, D-02, D-04) · Autor: Claude · Data: 2026-10-08 · Versão 2 (correções da AUD-REQ-2026-002-R01)
Situação: **PROPOSTA PARA APROVAÇÃO.** Os perfis da §3 são ilustrativos, como diz o REQ; nenhum é obrigatório. O catálogo real de `permisos` no banco é NAO_VERIFICADO e será conciliado com esta matriz na fase 0 (`DESENHO-REQ-2026-002-multiempresa.md` §10).

## 1. Ações

Formato do código: `RECURSO.ACCION`, em maiúsculas e em espanhol, como já usa `lib/navigation/menu.ts`.

| Ação | Significado | Origem |
|---|---|---|
| VER | Listar e abrir registros; ver o item no menu | REQ RN-06 |
| CREAR | Criar registro | REQ RN-06 |
| EDITAR | Alterar registro existente | REQ RN-06 |
| ELIMINAR | Baixa lógica ou desativação (não há exclusão física de dados de negócio) | REQ RN-06 |
| APROBAR | Mudar o estado para aprovado ou confirmado (ordem de compra, ajuste, lista de preço, nota de crédito) | REQ RN-06 |
| EXPORTAR | Gerar planilha ou arquivo a partir do módulo | REQ RN-06 |
| ANULAR | Anular documento já emitido ou registrado (fatura, movimento) por estorno | **Proposta nova**: anular não é editar nem eliminar e tem impacto fiscal e de estoque |
| ASIGNAR | Atribuir perfis a usuários | **Proposta nova**: separa quem edita dados do usuário de quem concede acesso |

Legenda: **●** permissão existe no catálogo · **—** não se aplica ao recurso.
Nível de alcance (§5 do desenho): **E** empresa · **S** sucursal · **D** depósito.

## 2. Catálogo de permissões

Coluna "Hoje": situação atual da tela (ver `MAPA-MODULOS.md` no REQ-2026-001). **AUSENTE** = item de menu sem página: a permissão fica no catálogo, mas o item permanece oculto até existir (`implementado: false`).

### Maestros
| Recurso | VER | CREAR | EDITAR | ELIMINAR | APROBAR | EXPORTAR | ANULAR | Alcance | Hoje | Observação |
|---|---|---|---|---|---|---|---|---|---|---|
| `CLIENTES` | ● | ● | ● | ● | — | ● | — | E | DEMO/PARCIAL | |
| `CLIENTES_CREDITO` | ● | — | ● | — | — | — | — | E | DEMO | **Sensível.** Limite de crédito, bloqueio de vendas e motivo (`clientes.limite_credito`, `bloqueado_ventas`) |
| `PROVEEDORES` | ● | ● | ● | ● | — | ● | — | E | DEMO | |
| `PROVEEDORES_BANCARIO` | ● | — | ● | — | — | — | — | E | DEMO | **Sensível.** Contas bancárias (`proveedor_cuentas_bancarias`); sem esta permissão, os dados vêm mascarados |
| `PRODUCTOS` | ● | ● | ● | ● | — | ● | — | E | DEMO | |
| `PRODUCTOS_COSTO` | ● | — | — | — | — | — | — | E | DEMO | **Sensível.** Custo médio e custo de referência |
| `LISTAS_PRECIO` | ● | ● | ● | ● | ● | ● | — | E | DEMO | APROBAR = ativar a lista |
| `VENDEDORES` | ● | ● | ● | ● | — | ● | — | E | AUSENTE | |
| `ZONAS_RUTAS` | ● | ● | ● | ● | — | — | — | E | AUSENTE | O menu usa hoje `RUTAS.VER` |

### Compras
| Recurso | VER | CREAR | EDITAR | ELIMINAR | APROBAR | EXPORTAR | ANULAR | Alcance | Hoje |
|---|---|---|---|---|---|---|---|---|---|
| `SOLICITUDES_COMPRA` | ● | ● | ● | ● | ● | ● | — | S | AUSENTE |
| `ORDENES_COMPRA` | ● | ● | ● | ● | ● | ● | ● | S | AUSENTE |
| `RECEPCIONES` | ● | ● | — | — | — | ● | ● | D | DEMO |
| `DEVOLUCIONES_COMPRA` | ● | ● | — | — | ● | ● | ● | D | AUSENTE |

### Inventario
| Recurso | VER | CREAR | EDITAR | ELIMINAR | APROBAR | EXPORTAR | ANULAR | Alcance | Hoje | Observação |
|---|---|---|---|---|---|---|---|---|---|---|
| `STOCK` | ● | — | — | — | — | ● | — | D | DEMO | Só leitura; o saldo muda via movimentos |
| `MOVIMIENTOS_STOCK` | ● | ● | — | — | — | ● | ● | D | DEMO | Entrada, saída, reserva, quarentena, transferência |
| `AJUSTES_STOCK` | ● | ● | — | — | ● | — | ● | D | DEMO | **Proposta:** separar os ajustes (+/−) dos demais movimentos, porque mudam o valor do estoque. APROBAR para ajustes acima de um limite (a definir) |
| `DEPOSITOS` | ● | ● | ● | ● | — | — | — | E | AUSENTE | |
| `REPOSICION` | ● | ● | — | — | ● | ● | — | D | AUSENTE | |

### Ventas
| Recurso | VER | CREAR | EDITAR | ELIMINAR | APROBAR | EXPORTAR | ANULAR | Alcance | Hoje |
|---|---|---|---|---|---|---|---|---|---|
| `PEDIDOS` | ● | ● | ● | — | ● | ● | ● | S | AUSENTE |
| `VENTAS` | ● | — | — | — | — | ● | — | S | AUSENTE |
| `ENTREGAS` | ● | ● | ● | — | — | ● | ● | D | AUSENTE |

### Finanzas
| Recurso | VER | CREAR | EDITAR | ELIMINAR | APROBAR | EXPORTAR | ANULAR | Alcance | Hoje |
|---|---|---|---|---|---|---|---|---|---|
| `CUENTAS_COBRAR` | ● | — | — | — | — | ● | — | S | AUSENTE |
| `COBROS` | ● | ● | — | — | — | ● | ● | S | AUSENTE |
| `CUENTAS_PAGAR` | ● | — | — | — | — | ● | — | S | AUSENTE |
| `PAGOS` | ● | ● | — | — | ● | ● | ● | S | AUSENTE |
| `CAJA` | ● | ● | — | — | ● | ● | — | S | AUSENTE |

### Facturación
| Recurso | VER | CREAR | EDITAR | ELIMINAR | APROBAR | EXPORTAR | ANULAR | Alcance | Hoje | Observação |
|---|---|---|---|---|---|---|---|---|---|---|
| `FACTURAS` | ● | ● | — | — | — | ● | ● | S | DEMO | Fatura emitida não se edita; corrige-se com nota de crédito ou anulação |
| `NOTAS_CREDITO` | ● | ● | — | — | ● | ● | ● | S | AUSENTE | |
| `NOTAS_REMISION` | ● | ● | — | — | — | ● | ● | S | AUSENTE | |
| `DOCUMENTOS_ELECTRONICOS` | ● | — | — | — | — | ● | — | S | AUSENTE | O menu usa hoje `FACTURACION_ELECTRONICA.VER` |
| `SIFEN` | ● | — | — | — | — | — | — | S | AUSENTE | Monitor; reenvio entra no REQ do SIFEN |

### Reportes e Administración
| Recurso | VER | CREAR | EDITAR | ELIMINAR | APROBAR | EXPORTAR | ANULAR | ASIGNAR | Alcance | Hoje | Observação |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `DASHBOARD` | ● | — | — | — | — | — | — | — | E | DEMO | Os cartões respeitam o VER de cada módulo |
| `REPORTES` | ● | — | — | — | — | ● | — | — | S | AUSENTE | Os dados respeitam o alcance |
| `USUARIOS` | ● | ● | ● | ● | — | ● | — | — | E | AUSENTE | EDITAR inclui bloquear, reativar, redefinir senha e alcance |
| `PERFILES` | ● | ● | ● | ● | — | — | — | ● | E | AUSENTE | ASIGNAR = atribuir perfis a usuários |
| `CONFIGURACION` | ● | — | ● | — | — | — | — | — | E | AUSENTE | Fora deste REQ |
| `AUDITORIA` | ● | — | — | — | — | ● | — | — | E | AUSENTE | Só leitura |

Total proposto: 37 recursos e 138 permissões (contagem dos ● acima), mais 5 de plataforma. Os números descrevem a proposta; a aprovação depende da decisão D-04 do responsável.

### Classificação para as regras de escalada (desenho §4)
- **Administrativas** (`es_administrativa`; só um administrador inclui num perfil, ESC-05): todas as de `USUARIOS`, `PERFILES`, `CONFIGURACION` e `AUDITORIA` (14 permissões).
- **Sensíveis** (`es_sensible`; só um administrador inclui num perfil, ESC-05; leitura auditada): todas as de `CLIENTES_CREDITO`, `PROVEEDORES_BANCARIO` e `PRODUCTOS_COSTO`, mais `AJUSTES_STOCK.APROBAR`, `PAGOS.APROBAR`, `FACTURAS.ANULAR` e `NOTAS_CREDITO.APROBAR` (9 permissões).
- Uma permissão sensível **nunca** é implícita em outra: `PROVEEDORES.VER` não mostra contas bancárias; `PRODUCTOS.VER` não mostra custo (D-02).

### Permissões de plataforma (fora do alcance das empresas — D-03)
`PLATAFORMA.EMPRESAS_VER`, `PLATAFORMA.EMPRESAS_CREAR`, `PLATAFORMA.EMPRESAS_SUSPENDER`, `PLATAFORMA.PERMISOS_ADMINISTRAR`, `PLATAFORMA.SOPORTE_ACCESO`. Ficam só para `usuarios_plataforma` (com MFA obrigatório); a API de perfis de empresa rejeita esses códigos com 422 (ESC-09). Uso de `PLATAFORMA.SOPORTE_ACCESO` exige motivo e prazo e aparece na auditoria da empresa (desenho §4.6).

## 3. Perfis de referência (ilustrativos)

Exemplos para o responsável aprovar, ajustar ou descartar. Cada empresa cria os seus. O administrador da empresa (`es_administrador`) recebe todas as permissões da §2 da própria empresa e não aparece nesta tabela. Leitura: **V** ver · **C** criar · **E** editar · **X** eliminar · **A** aprovar · **Ex** exportar · **N** anular · **As** asignar.

| Recurso | Ventas | Depósito | Compras | Finanzas | Consulta |
|---|---|---|---|---|---|
| DASHBOARD | V | V | V | V | V |
| CLIENTES | V C E | — | — | V | V |
| CLIENTES_CREDITO | V | — | — | V E | — |
| PROVEEDORES | — | V | V C E | V | V |
| PROVEEDORES_BANCARIO | — | — | — | V E | — |
| PRODUCTOS | V | V | V C E | V | V |
| PRODUCTOS_COSTO | — | — | V | V | — |
| LISTAS_PRECIO | V | — | — | V | V |
| VENDEDORES, ZONAS_RUTAS | V | — | — | — | V |
| SOLICITUDES_COMPRA | — | V C | V C E A | — | V |
| ORDENES_COMPRA | — | V | V C E A Ex | V | V |
| RECEPCIONES | — | V C | V | V | V |
| DEVOLUCIONES_COMPRA | — | V C | V C A | V | V |
| STOCK | V | V Ex | V | V | V |
| MOVIMIENTOS_STOCK | — | V C | V | — | V |
| AJUSTES_STOCK | — | V C | — | V A | — |
| DEPOSITOS | — | V | V | — | V |
| REPOSICION | — | V C | V C A | — | V |
| PEDIDOS | V C E | V | — | V | V |
| VENTAS | V | — | — | V Ex | V |
| ENTREGAS | V | V C E | — | — | V |
| FACTURAS | V C | — | — | V Ex N | V |
| NOTAS_CREDITO | V C | — | — | V C A | V |
| NOTAS_REMISION | V | V C | — | — | V |
| CUENTAS_COBRAR | V | — | — | V Ex | V |
| COBROS | V | — | — | V C Ex N | V |
| CUENTAS_PAGAR | — | — | V | V Ex | V |
| PAGOS | — | — | V | V C A Ex N | V |
| CAJA | — | — | — | V C A | — |
| DOCUMENTOS_ELECTRONICOS, SIFEN | V | — | — | V | — |
| REPORTES | V | V | V | V Ex | V |
| USUARIOS, PERFILES, CONFIGURACION, AUDITORIA | — | — | — | — | — |

Alcance sugerido nos exemplos: Ventas e Finanzas por **sucursal**; Depósito por **depósito**; Compras e Consulta com todas as sucursais. Isso cobre os cenários de referência do REQ: o vendedor vê só vendas e o que lhe foi concedido; o depósito vê estoque, recepções e movimentos.

Pelas regras ESC-01 e ESC-05 do desenho, os perfis que contêm permissões sensíveis (como Finanzas e Compras acima) só podem ser criados ou atribuídos por um administrador.

Separação de funções sugerida (a confirmar): quem **cria** um ajuste de estoque, uma ordem de compra ou um pagamento não deveria **aprovar** o mesmo registro. Proposta: regra de aplicação "aprovador ≠ criador", exceto para o administrador da empresa, e configurável por empresa.

## 4. Permissão exigida por rota existente

### 4.1 APIs
| Rota | Hoje | Permissão proposta |
|---|---|---|
| `POST /api/auth/login`, `POST /api/auth/logout` | pública / sessão | Sem mudança |
| `GET /api/clientes` (lista) | só sessão | `CLIENTES.VER`; os campos de crédito exigem `CLIENTES_CREDITO.VER` |
| `GET /api/clientes?modo=catalogos` e `?catalogo=` | só sessão | `CLIENTES.CREAR` ou `CLIENTES.EDITAR` |
| `POST /api/clientes` | só sessão | `CLIENTES.CREAR`; os campos de crédito e bloqueio exigem `CLIENTES_CREDITO.EDITAR` |
| `GET /api/proveedores` | só sessão | `PROVEEDORES.VER` |
| `POST /api/proveedores` | só sessão | `PROVEEDORES.CREAR`; contas bancárias exigem `PROVEEDORES_BANCARIO.EDITAR` |
| `GET /api/productos` | só sessão | `PRODUCTOS.VER`; custos exigem `PRODUCTOS_COSTO.VER` |
| `POST /api/productos` | só sessão | `PRODUCTOS.CREAR` |

### 4.2 Páginas
| Página | Permissão |
|---|---|
| `/` | Pública; só redireciona conforme a sessão |
| `/login` | Pública |
| `/dashboard` | `DASHBOARD.VER` |
| `/clientes`, `/clientes/[id]` | `CLIENTES.VER` (salvar a edição: `CLIENTES.EDITAR`) |
| `/clientes/nuevo` | `CLIENTES.CREAR` |
| `/proveedores`, `/proveedores/[id]`, `/proveedores/nuevo` | `PROVEEDORES.VER` / `.EDITAR` / `.CREAR` |
| `/productos`, `/productos/[id]`, `/productos/nuevo` | `PRODUCTOS.VER` / `.EDITAR` / `.CREAR` |
| `/listas-precio`, `/listas-precio/[id]`, `/listas-precio/nuevo` | `LISTAS_PRECIO.VER` / `.EDITAR` / `.CREAR` |
| `/recepciones`, `/recepciones/[id]` | `RECEPCIONES.VER` |
| `/recepciones/nuevo` | `RECEPCIONES.CREAR` |
| `/stock`, `/stock/[id]` | `STOCK.VER` (botão Excel: `STOCK.EXPORTAR`) |
| `/movimientos`, `/movimientos/[id]` | `MOVIMIENTOS_STOCK.VER` |
| `/movimientos/nuevo` | `MOVIMIENTOS_STOCK.CREAR` (tipos de ajuste: `AJUSTES_STOCK.CREAR`) |
| `/facturas`, `/facturas/[id]` | `FACTURAS.VER` |
| `/facturas/nuevo` | `FACTURAS.CREAR` |

Enquanto essas telas forem DEMO (dados no navegador), a permissão controla o acesso à tela e ao menu. A proteção dos dados só passa a existir quando cada módulo for para o banco (REQs 006 a 012 propostos).

### 4.3 Menu: os 32 itens de `lib/navigation/menu.ts` e o link fixo do Dashboard

| Item | # | Rota | Código atual | Código proposto | Página existe |
|---|---|---|---|---|---|
| Dashboard (link fixo, `components/layout/sidebar/sidebar.tsx:169`) | — | `/dashboard` | — (sempre visível) | `DASHBOARD.VER` | sim |
| Clientes | 1 | `/clientes` | `CLIENTES.VER` | `CLIENTES.VER` | sim |
| Proveedores | 2 | `/proveedores` | `PROVEEDORES.VER` | `PROVEEDORES.VER` | sim |
| Productos | 3 | `/productos` | `PRODUCTOS.VER` | `PRODUCTOS.VER` | sim |
| Listas de precios | 4 | `/listas-precio` | `LISTAS_PRECIO.VER` | `LISTAS_PRECIO.VER` | sim |
| Vendedores | 5 | `/vendedores` | `VENDEDORES.VER` | `VENDEDORES.VER` | não (oculto: `implementado: false`) |
| Zonas y rutas | 6 | `/zonas-rutas` | `RUTAS.VER` | `ZONAS_RUTAS.VER` | não (oculto: `implementado: false`) |
| Solicitudes | 7 | `/solicitudes` | `COMPRAS.VER` | `SOLICITUDES_COMPRA.VER` | não (oculto: `implementado: false`) |
| Órdenes de compra | 8 | `/ordenes` | `COMPRAS.VER` | `ORDENES_COMPRA.VER` | não (oculto: `implementado: false`) |
| Recepciones | 9 | `/recepciones` | `COMPRAS.VER` | `RECEPCIONES.VER` | sim |
| Devoluciones | 10 | `/devoluciones` | `COMPRAS.VER` | `DEVOLUCIONES_COMPRA.VER` | não (oculto: `implementado: false`) |
| Stock | 11 | `/stock` | `INVENTARIO.VER` | `STOCK.VER` | sim |
| Movimientos | 12 | `/movimientos` | `INVENTARIO.VER` | `MOVIMIENTOS_STOCK.VER` | sim |
| Depósitos | 13 | `/depositos` | `INVENTARIO.VER` | `DEPOSITOS.VER` | não (oculto: `implementado: false`) |
| Reposición | 14 | `/reposicion` | `INVENTARIO.VER` | `REPOSICION.VER` | não (oculto: `implementado: false`) |
| Pedidos | 15 | `/pedidos` | `PEDIDOS.VER` | `PEDIDOS.VER` | não (oculto: `implementado: false`) |
| Ventas | 16 | `/ventas` | `VENTAS.VER` | `VENTAS.VER` | não (oculto: `implementado: false`) |
| Entregas | 17 | `/entregas` | `ENTREGAS.VER` | `ENTREGAS.VER` | não (oculto: `implementado: false`) |
| Cuentas por cobrar | 18 | `/finanzas/cuentas-por-cobrar` | `FINANZAS.VER` | `CUENTAS_COBRAR.VER` | não (oculto: `implementado: false`) |
| Cobros | 19 | `/finanzas/cobros` | `FINANZAS.VER` | `COBROS.VER` | não (oculto: `implementado: false`) |
| Cuentas por pagar | 20 | `/finanzas/cuentas-por-pagar` | `FINANZAS.VER` | `CUENTAS_PAGAR.VER` | não (oculto: `implementado: false`) |
| Pagos | 21 | `/finanzas/pagos` | `FINANZAS.VER` | `PAGOS.VER` | não (oculto: `implementado: false`) |
| Caja | 22 | `/finanzas/caja` | `FINANZAS.VER` | `CAJA.VER` | não (oculto: `implementado: false`) |
| Facturas | 23 | `/facturas` | `FACTURACION_ELECTRONICA.VER` | `FACTURAS.VER` | sim |
| Notas de crédito | 24 | `/notas-credito` | `FACTURACION_ELECTRONICA.VER` | `NOTAS_CREDITO.VER` | não (oculto: `implementado: false`) |
| Notas de remisión | 25 | `/notas-remision` | `FACTURACION_ELECTRONICA.VER` | `NOTAS_REMISION.VER` | não (oculto: `implementado: false`) |
| Todos los documentos | 26 | `/documentos` | `FACTURACION_ELECTRONICA.VER` | `DOCUMENTOS_ELECTRONICOS.VER` | não (oculto: `implementado: false`) |
| Monitor SIFEN | 27 | `/sifen` | `FACTURACION_ELECTRONICA.VER` | `SIFEN.VER` | não (oculto: `implementado: false`) |
| Reportes operativos | 28 | `/reportes` | `REPORTES.VER` | `REPORTES.VER` | não (oculto: `implementado: false`) |
| Usuarios | 29 | `/administracion/usuarios` | `USUARIOS.VER` | `USUARIOS.VER` | não (oculto: `implementado: false`) |
| Roles y permisos | 30 | `/administracion/roles` | `PERFILES.VER` | `PERFILES.VER` | não (oculto: `implementado: false`) |
| Configuración | 31 | `/administracion/configuracion` | `CONFIGURACION.VER` | `CONFIGURACION.VER` | não (oculto: `implementado: false`) |
| Auditoría | 32 | `/administracion/auditoria` | `AUDITORIA.VER` | `AUDITORIA.VER` | não (oculto: `implementado: false`) |

Códigos agregados que deixam de existir: `COMPRAS.VER` (4 itens), `INVENTARIO.VER` (4), `FINANZAS.VER` (5), `FACTURACION_ELECTRONICA.VER` (5) e `RUTAS.VER` (1). Se o banco real já tiver esses códigos em perfis, a migration da fase 2 converte cada perfil com o código agregado para o conjunto granular correspondente, sem perda nem ganho de acesso (verificação I-05 do desenho).

### 4.4 Rotas futuras desta entrega (fase 4)
As APIs de administração e as permissões que cada uma exige estão no desenho §12. As telas `/administracion/usuarios`, `/administracion/roles` e `/administracion/auditoria` exigem `USUARIOS.VER`, `PERFILES.VER` e `AUDITORIA.VER`, respectivamente.

## 5. Concessão inicial

| Situação | O que é concedido | Quem concede |
|---|---|---|
| Empresa nova (bootstrap, desenho §4.4) | Perfil de sistema `ADMINISTRADOR` com todas as permissões de empresa (D-06) e o primeiro usuário com esse perfil e alcance `TODAS`/`TODOS` | Plataforma PROCEIT, com MFA |
| Empresa existente na migração (fase 2) | Perfil `ADMINISTRADOR` de sistema; os perfis existentes são convertidos pela tabela da §4.3; os usuários existentes recebem alcance explícito `TODAS`/`TODOS` para não perder acesso, marcados para revisão | Migration aprovada pelo responsável |
| Usuário novo criado pelo administrador | **Nenhuma** permissão e nenhum alcance até que perfis e alcance sejam atribuídos (D-05, CA-06). Menu vazio | Administrador ou quem tem `USUARIOS.CREAR` + `PERFILES.ASIGNAR`, sujeito a ESC-01 a ESC-06 |
| Perfis de referência da §3 | **Não** são criados automaticamente. A tela de perfis oferece modelos ("plantillas") que o administrador pode copiar e ajustar | Administrador |

## 6. Mudança de permissões e revogação

| Mudança | Regras de escalada | Efeito | Auditoria |
|---|---|---|---|
| Adicionar permissão a um perfil | ESC-01, 03, 05, 09, 10 | Próxima requisição de todos os usuários com o perfil | `PERFIL_PERMISOS_CAMBIADOS`, antes/depois, versão |
| Retirar permissão de um perfil | ESC-08, 10 | Próxima requisição; gravações sensíveis em curso revalidam dentro da transação (desenho §8.3) | idem |
| Atribuir ou retirar perfil de um usuário | ESC-01, 02, 04, 07, 10, 11 | Próxima requisição | `USUARIO_PERFILES_CAMBIADOS` |
| Desativar perfil | ESC-07, 08 | Próxima requisição | `PERFIL_DESACTIVADO` |
| Alterar alcance | ESC-02, 06, 10; coerência do desenho §6.2 | Próxima requisição | `USUARIO_ALCANCE_CAMBIADO` |
| Bloquear, dar baixa, suspender empresa | ESC-02, 07 | Sessões revogadas na mesma transação; gravações em curso falham | Eventos do desenho §9 |

O contrato temporal completo (evento × momento × sessões) está no desenho §8.2.

## 7. Verificação de cobertura

Executada com um script sobre o código de `0dbb013` e esta matriz (TST-REQ-2026-002, verificação D11):

| Conjunto | Total no código | Mapeados nesta matriz | Faltando |
|---|---|---|---|
| Páginas (`app/**/page.tsx`) | 26 | 26 (§4.2; 2 públicas) | 0 |
| Route handlers (`app/api/**/route.ts`) | 5 | 5 (§4.1) | 0 |
| Itens de menu (`lib/navigation/menu.ts`) | 32 | 32 (§4.3) | 0 |
| Códigos de permissão atuais do menu | 18 distintos | 18 (§4.3) | 0 |
| Link fixo do Dashboard | 1 | 1 | 0 |
