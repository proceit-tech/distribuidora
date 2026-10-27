# MATRIZ-PERMISOS-REQ-2026-002 — Matriz de permissões proposta

Requisito: REQ-2026-002 (RN-04 a RN-08, D-02, D-04) · Autor: Claude · Data: 2026-10-09 · Versão 5 (decisões D-11 e D-12 e AUD-REQ-2026-002-R04; histórico na §9)
Situação: **D-04 APROVADA CONDICIONALMENTE** pelo responsável (`DECISOES-REQ-2026-002-APROVACAO.md`): a matriz precisa da revisão por área de negócio (§8) e dos testes por operação antes da implementação. Os perfis da §3 são ilustrativos, como diz o REQ; nenhum é obrigatório. O catálogo real de `permisos` no banco é NAO_VERIFICADO e será conciliado com esta matriz na fase 0 (`DESENHO-REQ-2026-002-multiempresa.md` §10).

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
| `PERMISOS_SENSIBLES` | — | — | — | — | ● | — | — | ● | E | AUSENTE | ASIGNAR = solicitar dado sensível para outro usuário; APROBAR = aprovar como segundo aprovador independente (D-10, desenho §4.7) |
| `PERMISOS_CRITICOS` | — | — | — | — | ● | — | — | ● | E | AUSENTE | **Novo na versão 4 (D-09).** ASIGNAR = solicitar ação crítica para outro usuário; APROBAR = aprovar a concessão, com as mesmas regras de independência |
| `CONFIGURACION` | ● | — | ● | — | — | — | — | — | E | AUSENTE | Fora deste REQ |
| `AUDITORIA` | ● | — | — | — | — | ● | — | — | E | AUSENTE | Só leitura |

Total proposto: **39 recursos e 142 permissões** (contagem dos ● acima), mais 8 de plataforma. Mudanças por versão na §9.

### 2.1 Classes de permissão (desenho §4.1)

| Classe | Permissões | Perfil administrador recebe? | Quem pode incluir num perfil ou atribuir |
|---|---|---|---|
| `DATO_SENSIBLE` (5) | `PRODUCTOS_COSTO.VER`; `CLIENTES_CREDITO.VER`, `CLIENTES_CREDITO.EDITAR`; `PROVEEDORES_BANCARIO.VER`, `PROVEEDORES_BANCARIO.EDITAR` | **Não** (D-06) | Nenhum perfil (ESC-13). Só concessão individual: solicitante com `PERMISOS_SENSIBLES.ASIGNAR` + segundo aprovador independente com `PERMISOS_SENSIBLES.APROBAR` (D-10), ou exceção formal PROCEIT (desenho §4.7) |
| `ACCION_CRITICA` (4) | `AJUSTES_STOCK.APROBAR`, `PAGOS.APROBAR`, `FACTURAS.ANULAR`, `NOTAS_CREDITO.APROBAR` | **Não** (D-09) | Nenhum perfil (ESC-13). Só concessão individual: solicitante com `PERMISOS_CRITICOS.ASIGNAR` + aprovador independente com `PERMISOS_CRITICOS.APROBAR`, ou exceção formal PROCEIT. Na execução, quem criou o registro não aprova (ESC-15) |
| `ADMINISTRATIVA` (18) | Todas de `USUARIOS` (5), `PERFILES` (5), `PERMISOS_SENSIBLES` (2), `PERMISOS_CRITICOS` (2), `CONFIGURACION` (2), `AUDITORIA` (2) | Sim | Só administrador (ESC-05). Ter `*.APROBAR` não basta para aprovar: é preciso independência (IND-01 a IND-07) |
| `OPERACIONAL` (115) | As demais | Sim | Quem tem a permissão e `PERFILES.EDITAR`/`ASIGNAR` (ESC-01) |

As 9 permissões `DATO_SENSIBLE` e `ACCION_CRITICA` ("controladas") nunca são implícitas em outra: `PROVEEDORES.VER` não mostra contas bancárias; `PRODUCTOS.VER` não mostra custo; `PAGOS.CREAR` não aprova; ser administrador não dá nenhuma delas (D-02, D-06, D-09).

### Permissões de plataforma (fora do alcance das empresas — D-03)
`PLATAFORMA.EMPRESAS_VER`, `PLATAFORMA.EMPRESAS_CREAR`, `PLATAFORMA.EMPRESAS_SUSPENDER`, `PLATAFORMA.PERMISOS_ADMINISTRAR`, `PLATAFORMA.SOPORTE_ACCESO`, `PLATAFORMA.CONCESIONES_APROBAR` (exceção formal do desenho §4.7.5), `PLATAFORMA.OPERACIONES_AUTORIZAR` (autorização formal por operação crítica, D-11, desenho §4.7.11) e `PLATAFORMA.PARAMETROS_CONCESION_EDITAR` (prazos e antiguidade, D-12, desenho §4.7.8). São 8. Ficam só para `usuarios_plataforma` (com MFA obrigatório); a API de perfis de empresa rejeita esses códigos com 422 (ESC-09). Uso de `PLATAFORMA.SOPORTE_ACCESO` exige motivo e prazo e aparece na auditoria da empresa (desenho §4.6).

## 3. Perfis de referência (ilustrativos)

Exemplos para o responsável aprovar, ajustar ou descartar. Cada empresa cria os seus. O administrador da empresa (`es_administrador`) recebe todas as permissões da §2 da própria empresa **exceto as 9 controladas** (§2.1) e não aparece nesta tabela. Leitura: **V** ver · **C** criar · **E** editar · **X** eliminar · **A** aprovar · **Ex** exportar · **N** anular · **As** asignar.

| Recurso | Ventas | Depósito | Compras | Finanzas | Consulta |
|---|---|---|---|---|---|
| DASHBOARD | V | V | V | V | V |
| CLIENTES | V C E | — | — | V | V |
| CLIENTES_CREDITO | V† | — | — | V† E† | — |
| PROVEEDORES | — | V | V C E | V | V |
| PROVEEDORES_BANCARIO | — | — | — | V† E† | — |
| PRODUCTOS | V | V | V C E | V | V |
| PRODUCTOS_COSTO | — | — | V† | V† | — |
| LISTAS_PRECIO | V | — | — | V | V |
| VENDEDORES, ZONAS_RUTAS | V | — | — | — | V |
| SOLICITUDES_COMPRA | — | V C | V C E A | — | V |
| ORDENES_COMPRA | — | V | V C E A Ex | V | V |
| RECEPCIONES | — | V C | V | V | V |
| DEVOLUCIONES_COMPRA | — | V C | V C A | V | V |
| STOCK | V | V Ex | V | V | V |
| MOVIMIENTOS_STOCK | — | V C | V | — | V |
| AJUSTES_STOCK | — | V C | — | V A† | — |
| DEPOSITOS | — | V | V | — | V |
| REPOSICION | — | V C | V C A | — | V |
| PEDIDOS | V C E | V | — | V | V |
| VENTAS | V | — | — | V Ex | V |
| ENTREGAS | V | V C E | — | — | V |
| FACTURAS | V C | — | — | V Ex N† | V |
| NOTAS_CREDITO | V C | — | — | V C A† | V |
| NOTAS_REMISION | V | V C | — | — | V |
| CUENTAS_COBRAR | V | — | — | V Ex | V |
| COBROS | V | — | — | V C Ex N | V |
| CUENTAS_PAGAR | — | — | V | V Ex | V |
| PAGOS | — | — | V | V C A† Ex N | V |
| CAJA | — | — | — | V C A | — |
| DOCUMENTOS_ELECTRONICOS, SIFEN | V | — | — | V | — |
| REPORTES | V | V | V | V Ex | V |
| USUARIOS, PERFILES, CONFIGURACION, AUDITORIA | — | — | — | — | — |

Alcance sugerido nos exemplos: Ventas e Finanzas por **sucursal**; Depósito por **depósito**; Compras e Consulta com todas as sucursais. Isso cobre os cenários de referência do REQ: o vendedor vê só vendas e o que lhe foi concedido; o depósito vê estoque, recepções e movimentos.

**† = não faz parte do perfil.** É uma concessão individual típica para quem exerce aquela função, solicitada e aprovada pelo fluxo do desenho §4.7 (D-09, D-10). O perfil de exemplo contém só o que não tem †. `PAGOS.ANULAR` (sem †) é operacional; `FACTURAS.ANULAR` é ação crítica.

Segregação de funções (D-09, ESC-15): nas 4 ações críticas, quem cria ou solicita não aprova, **sem exceção para o administrador**. Para as aprovações operacionais (`SOLICITUDES_COMPRA.APROBAR`, `ORDENES_COMPRA.APROBAR`, `PEDIDOS.APROBAR` etc.), a mesma regra é proposta e fica para a revisão por área (§8). Empresas de um único operador (D-11 aprovada): sem aprovador independente, cada operação crítica exige a autorização formal da PROCEIT (desenho §4.7.7 e §4.7.11), além da concessão `*.APROBAR`; nenhuma permissão de empresa a substitui.

Prazos aprovados (D-12): concessão de `DATO_SENSIBLE` 180 dias; de `ACCION_CRITICA` 365 dias; solicitação sem decisão expira em 7 dias; aprovador com o poder há 7 dias. São parâmetros controlados só pela plataforma, com limites rígidos (desenho §4.7.8); nenhuma permissão de empresa os altera, e a revisão por área não os muda.

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
| Empresa nova (bootstrap, desenho §4.4) | Perfil de sistema `ADMINISTRADOR` com as permissões `OPERACIONAL` e `ADMINISTRATIVA` (**sem** nenhuma das 9 controladas, D-06/D-09) e o primeiro usuário com esse perfil e alcance `TODAS`/`TODOS` concedido explicitamente; recomendado: conta de aprovador independente criada pela plataforma | Plataforma PROCEIT, com MFA |
| Empresa existente na migração (fase 2) | Perfil `ADMINISTRADOR` de sistema, sem permissão controlada; os perfis existentes são convertidos pela tabela da §4.3; permissões controladas encontradas em perfis saem do perfil e viram solicitações pendentes de aprovação independente (nenhuma migra como acesso); os usuários existentes recebem alcance explícito `TODAS`/`TODOS` para não perder acesso, marcados para revisão | Migration aprovada pelo responsável |
| Usuário novo criado pelo administrador | **Nenhuma** permissão e nenhum alcance até que perfis e alcance sejam atribuídos (D-05, CA-06). Menu vazio | Administrador ou quem tem `USUARIOS.CREAR` + `PERFILES.ASIGNAR`, sujeito a ESC-01 a ESC-06; permissão controlada só pelo desenho §4.7 |
| Permissão controlada quando a empresa não tem aprovador independente (por exemplo, um único administrador) | Solicitação no canal `PLATAFORMA`; aprovação formal da PROCEIT vinculada ao pedido assinado do representante da empresa | Desenho §4.7.5 |
| Perfis de referência da §3 | **Não** são criados automaticamente. A tela de perfis oferece modelos ("plantillas") que o administrador pode copiar e ajustar | Administrador |

## 6. Mudança de permissões e revogação

| Mudança | Regras de escalada | Efeito | Auditoria |
|---|---|---|---|
| Adicionar permissão a um perfil | ESC-01, 03, 05, 09, 10 | Próxima requisição de todos os usuários com o perfil | `PERFIL_PERMISOS_CAMBIADOS`, antes/depois, versão |
| Incluir permissão controlada num perfil | ESC-13 | Recusado (422) | `ACCESO_DENEGADO` |
| Solicitar permissão controlada para um usuário | ESC-12, IND-01, IND-07 | Nenhum acesso enquanto `SOLICITADA` | `CONCESION_SOLICITADA` |
| Aprovar a solicitação | ESC-14 (IND-01 a IND-07), desenho §4.7.4 | Próxima requisição do beneficiário | `CONCESION_APROBADA` com aprovador e tipo |
| Rejeitar, cancelar, revogar ou expirar | Desenho §4.7.2 | Próxima requisição; uso em curso revalida dentro da transação | `CONCESION_RECHAZADA` / `CANCELADA` / `REVOCADA` / `EXPIRADA` |
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

## 8. Revisão por área de negócio (condição da D-04)

Antes da implementação de cada área, o responsável (ou quem ele indicar, por exemplo o cliente piloto) confirma a lista de permissões e o comportamento de cada operação. O Claude não marca nenhum item como revisado.

| Área | Recursos | Pontos a confirmar | Revisão |
|---|---|---|---|
| Maestros | CLIENTES, CLIENTES_CREDITO, PROVEEDORES, PROVEEDORES_BANCARIO, PRODUCTOS, PRODUCTOS_COSTO, LISTAS_PRECIO, VENDEDORES, ZONAS_RUTAS | ELIMINAR = baixa lógica; aprovação de lista de preço | PENDENTE |
| Compras | SOLICITUDES_COMPRA, ORDENES_COMPRA, RECEPCIONES, DEVOLUCIONES_COMPRA | Fluxo de aprovação de ordem; alcance por depósito na recepção | PENDENTE |
| Inventario | STOCK, MOVIMIENTOS_STOCK, AJUSTES_STOCK, DEPOSITOS, REPOSICION | Transferência D-08 (`CREAR` no envio e no recebimento, `ANULAR` no cancelamento, `AJUSTES_STOCK` na conciliação); limite para aprovação de ajuste | PENDENTE |
| Ventas | PEDIDOS, VENTAS, ENTREGAS | Quem aprova pedido; alcance por sucursal | PENDENTE |
| Finanzas | CUENTAS_COBRAR, COBROS, CUENTAS_PAGAR, PAGOS, CAJA | Ações críticas no administrador (§2.1) | PENDENTE |
| Facturación | FACTURAS, NOTAS_CREDITO, NOTAS_REMISION, DOCUMENTOS_ELECTRONICOS, SIFEN | Dependente do contrato SIFEN (REQ-2026-013 proposto) | PENDENTE |
| Administración | DASHBOARD, REPORTES, USUARIOS, PERFILES, PERMISOS_SENSIBLES, PERMISOS_CRITICOS, CONFIGURACION, AUDITORIA | Regras ESC e IND; vigências aprovadas (D-12: 180/365/7/7); relatório de concessões e de vencimentos; autorização por operação (D-11) | PENDENTE |

Cada operação aprovada aqui ganha os quatro casos do teste por operação (desenho §11.7). Uma mudança decidida na revisão gera nova versão da matriz (§9).

## 9. Histórico de versões da matriz

| Versão | Data | Origem | Mudança | Contagem |
|---|---|---|---|---|
| 1 | 2026-10-08 | Proposta inicial (`eee771d`) | Catálogo, perfis de exemplo, permissão por rota | 37 recursos, 138 permissões |
| 2 | 2026-10-08 | AUD-R01 (`0281e63`) | Classificação administrativa/sensível, concessão inicial, mudança e revogação, 32 itens de menu, verificação de cobertura | 37 / 138 |
| 3 | 2026-10-08 | D-01 a D-08 (`2a007e7`) e AUD-R02 | D-06: administrador sem dado sensível; classes `DATO_SENSIBLE` e `ACCION_CRITICA`; novo `PERMISOS_SENSIBLES.ASIGNAR`; transferência D-08 na área de Inventario; revisão por área (§8) | 38 / 139 |
| 4 | 2026-10-08 | D-09 e D-10 (`9c76906`) e AUD-R03 | D-09: as 4 ações críticas saem do administrador; D-10: segundo aprovador independente; nenhuma permissão controlada em perfil; novos `PERMISOS_SENSIBLES.APROBAR`, `PERMISOS_CRITICOS.ASIGNAR` e `PERMISOS_CRITICOS.APROBAR`; `PLATAFORMA.CONCESIONES_APROBAR`; † nos perfis de exemplo | 39 / 142 (+6 plataforma) |
| 5 | 2026-10-09 | D-11 e D-12 (`ee59738`) e AUD-R04 | Acrescentadas 2 permissões de plataforma (`OPERACIONES_AUTORIZAR`, `PARAMETROS_CONCESION_EDITAR`); prazos 180/365/7/7 como valores aprovados; D-11 por operação. Nenhuma permissão de empresa criada, removida ou movida de classe | 39 / 142 (+8 plataforma) |
