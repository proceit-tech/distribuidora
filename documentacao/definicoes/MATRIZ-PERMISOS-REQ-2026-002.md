# MATRIZ-PERMISOS-REQ-2026-002 — Matriz de permissões proposta

Requisito: REQ-2026-002 (RN-04 a RN-08, D-02, D-04) · Autor: Claude · Data: 2026-10-08
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

Total proposto: 37 recursos e 138 permissões (contagem dos ● acima), mais 5 de plataforma.

### Permissões de plataforma (fora do alcance das empresas — D-03)
`PLATAFORMA.EMPRESAS_VER`, `PLATAFORMA.EMPRESAS_CREAR`, `PLATAFORMA.EMPRESAS_SUSPENDER`, `PLATAFORMA.PERMISOS_ADMINISTRAR`, `PLATAFORMA.SOPORTE_ACCESO`. Ficam só para `usuarios_plataforma`; a API de perfis de empresa rejeita esses códigos.

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

### 4.3 Conversão dos códigos atuais do menu
| Código atual (`menu.ts`) | Itens | Códigos propostos |
|---|---|---|
| `COMPRAS.VER` | Solicitudes, Órdenes, Recepciones, Devoluciones | `SOLICITUDES_COMPRA.VER`, `ORDENES_COMPRA.VER`, `RECEPCIONES.VER`, `DEVOLUCIONES_COMPRA.VER` |
| `INVENTARIO.VER` | Stock, Movimientos, Depósitos, Reposición | `STOCK.VER`, `MOVIMIENTOS_STOCK.VER`, `DEPOSITOS.VER`, `REPOSICION.VER` |
| `FINANZAS.VER` | 5 itens | `CUENTAS_COBRAR.VER`, `COBROS.VER`, `CUENTAS_PAGAR.VER`, `PAGOS.VER`, `CAJA.VER` |
| `FACTURACION_ELECTRONICA.VER` | Facturas, Notas de crédito, Notas de remisión, Documentos, Monitor SIFEN | `FACTURAS.VER`, `NOTAS_CREDITO.VER`, `NOTAS_REMISION.VER`, `DOCUMENTOS_ELECTRONICOS.VER`, `SIFEN.VER` |
| `RUTAS.VER` | Zonas y rutas | `ZONAS_RUTAS.VER` |
| Demais (`CLIENTES.VER` etc.) | 1 item cada | Mantidos |
| — | Dashboard (link fixo da barra lateral) | `DASHBOARD.VER` |

Se o banco real já tiver os códigos agregados, a migration da fase 2 converte cada perfil que tem o código agregado para o conjunto granular correspondente, sem perda de acesso.
