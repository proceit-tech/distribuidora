# PROGRESSO-NEXIT-V1

Branch: `feature/NEXIT-2026-001-banco-demo`. Regra: uma funcionalidade por vez; sem mock/localStorage/dados fixos no modo real; commit+push ao terminar cada item.

| # | Item | Estado | Commit |
|---|---|---|---|
| 1 | Menu e acesso por perfil | **ENTREGUE (pendente: typecheck/build no seu ambiente)** | ver git log |
| 2 | Clientes | **ENTREGUE (pendente: build + teste manual na tela)** | ver git log |
| 3 | Proveedores | **ENTREGUE (pendente: build + teste manual na tela)** | ver git log |
| 4 | Productos | **ENTREGUE (pendente: build + teste manual na tela)** | ver git log |
| 5 | Listas de precios | **ENTREGUE (NEX-018 já aplicada no `nexit` real; pendente: build + teste manual na tela)** | ver git log |
| 6 | Movimientos | **ENTREGUE (pendente: build + teste manual na tela; sem migração nova)** | ver git log |
| 7 | Stock | **ENTREGUE (pendente: build + teste manual na tela; sem migração nova)** | ver git log |
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
- **Campos preservados (regra definitiva: não se remove funcionalidade por falta de suporte no banco — complementa-se o banco):** Familia, Línea, Precio de venta de referencia (+ Valor venta referencia), Inventario inicial (cantidad, costo e depósito de apertura), Stock actual e Costo promedio continuam na ficha e na lista, agora ligados ao PostgreSQL pela migration **NEX-017** (`NEX-017-familias-lineas-precio-referencia.sql`; não altera NEX-001..016; não aplicada na VM/banco `nexit`). Detalhe completo: `documentacao/banco/nexit/v1/docs/08-PRODUCTOS-FAMILIAS-LINEAS-PRECIO-INVENTARIO.md`.
  - **Familia/Línea**: tabelas novas `familias_producto` e `lineas_producto` (por `empresa_id`, FKs compostas; linha pertence a uma família da mesma empresa; `productos.linea_id` só aceita linha da própria família). APIs `GET/POST /api/productos/familias` e `/api/productos/lineas[?familiaId=]`; os selects usam dados reais (vazios se não houver cadastro). Telas administrativas: pendentes. `seeds/S-004-casa-mingo-familias-lineas.sql` (51 famílias/203 linhas **reais, fornecidos pela CASA MINGO em Excel**; verificado 1:1 contra a lista original; devem ficar disponíveis nas futuras telas administrativas de Famílias e Linhas). Simulado em PG16 descartável (NEX-016 → NEX-017 → S-004 só para `casa_mingo`: 51/203, outro cliente 0/0, selects de Productos mostram os dados). **Aplicação no banco real `nexit`: pendente (passo autorizado, executado por você na VM).**
  - **Preço de venda de referência**: sem tabela nova de preços — é um item da lista de venda marcada `listas_precio.es_referencia` (uma por empresa, moeda da lista = moeda base da empresa). Sem preço = `null` ("Sin precio"), nunca 0. Funções `producto_fijar_precio_referencia`/`lista_precio_referencia` e vista `v_producto_precio_referencia`.
  - **Inventário inicial**: no cadastro gera movimento real `ENTRADA`/`ABERTURA` (`inventario_registrar_movimiento`) na mesma transação do produto e do preço; exige `MOVIMIENTOS.CREAR`, depósito e custo unitário (não se inventa custo nem regra de valorização). Na edição aparece só leitura (nº do movimento). Produtos por lote/série: abertura via Movimientos.
  - **Stock actual / Costo promedio**: somente leitura, de `v_stock_producto`/`stock_saldos` (por depósito) e `inventario_costos` (`v_producto_costo_promedio`).
  - Procedencia segue texto livre (`origen_etiqueta`). Removidos apenas os pills "DEMO"/"INVENTARIO MINGO" e valores demonstrativos.
- Testes: SQL `T12` (30 verificações) + bateria completa 351 PASS/0 falhas em PG16 descartável (migrações do zero, reaplicação idempotente); API com rotas reais + `permissions.ts` real conectadas como **`nexit_runtime`**: regressão de Productos 55 + 59 novas (401/403 por perfil, familias/líneas isoladas por empresa, línea de outra família/empresa → 400, precio de referencia alta/atualização/remoção sem duplicar, abertura com movimento/saldo/custo reais, 403 sem `MOVIMIENTOS.CREAR` ou sem alcance de depósito, ROLLBACK total em falhas, edição não altera stock, empresa B não vê nada de A).
- NÃO executado: typecheck completo/build/lint (npm sem registry; `tsc` parcial sem erros além do ruído por falta de `react`/`next`/`@types/node`), HTTP real, teste visual.
- Pendências de Productos: telas administrativas de Famílias, Linhas, Categorias e Marcas; histórico de preços e preço por lista (item 5 Listas de precios); ajustes de stock só via Movimientos (item 6); `lib/mocks/productos*.ts` e `ProductoDemo` seguem só porque Stock/Movimientos/Recepciones (mocks) os importam; sem exclusão de produtos (apenas inativar); documentos = nome + URL; ubicación preferida por depósito sem campo na tela; `demo_reiniciar` não limpa as tabelas novas (só afeta empresas DEMO).

## Item 5 — Listas de precios (sem mock/localStorage)
- Telas existentes preservadas (`listas-precio/page.tsx`, `nuevo`, `[id]`, `_components/lista-precio-form.tsx`); removidos `lib/mocks/listas-precio*.ts`, localStorage, pills "DEMO" e o rodapé "Modo demostración". Aviso pós-gravação via `?ok=creado|actualizado`.
- API: `GET/POST /api/listas-precio` (`?modo=catalogos` devolve moedas, grupos, zonas, canais, clientes, produtos com custo médio e preço de referência, listas base), `GET/PUT /api/listas-precio/[id]` (`LISTAS_PRECIO.VER/CREAR/EDITAR` no backend; `empresa_id`/`creado_por` da sessão; 401/403/404; 503 sem `DATABASE_URL`). Validação/gravação em `lib/listas-precio/shared.ts`; PUT substitui itens, escalões e regras na mesma transação (rollback total em erro). Código automático `LP-nnn` por empresa; tipos VENTA e COMPRA mantidos.
- Campos preservados: tipo, moeda (do catálogo `monedas`), estado, modo de preço, lista base (sem ciclos), ajuste geral, vigência, prioridade, desconto máximo, IVA incluído, alcance (grupo/cliente/zona/canal), preço por produto (custo, base, lista, margem, quantidade mínima), regras comerciais. Complementos de tela sem mudar o layout: escalões por produto, desconto/vigência/ativo por produto e seletor de referência + vigência por regra (já existiam no banco e não eram editáveis).
- **Lista de referência (NEX-017) integrada, sem estrutura duplicada:** aparece na lista como `REF-VENTA` (`es_referencia`); seus itens são os mesmos `lista_precio_items` do "Precio de venta de referencia" de Productos. Editar o preço aqui altera o preço em Productos e vice-versa. Fica travada: tipo VENTA, preço fixo, sem lista base/alcance, ativa, código imutável.
- **Migração `NEX-018-listas-precio-integridad.sql` (nova; já aplicada no `nexit` real, conforme informado pelo proprietário):** CHECKs de vigência/percentuais/quantidades/preços, `referencia_id` das regras exige existir na mesma empresa e no tipo indicado, moeda do item = moeda da lista (inclusive bloqueia trocar a moeda da lista com preços em outra).
- Testes: SQL `T13` (30 verificações, incluído em `ejecutar-pruebas.sh`) + bateria completa em PG16 descartável; API com rotas reais + `permissions.ts` real como `nexit_runtime` (63 verificações: 401/403/404, criar/editar/persistência, validações, rollback, isolamento entre empresas, integração com o preço de referência de Productos, 503).
- NÃO executado: build/lint completos (sem registry no sandbox; `tsc` parcial sem erros além do ruído ambiental), HTTP real, teste visual.
- Pendências: cálculo de preço por regra (aplicação em vendas) pertence ao módulo de vendas; ajuste massivo continua só no formulário (-5/-10/+5 %).

## Item 6 — Movimientos de inventario (sem mock/localStorage)
- Telas existentes preservadas (`movimientos/page.tsx`, `nuevo`, `[id]`); removidos localStorage, pills "DEMO", depósitos/produtos fixos e o rodapé "Modo demostración". Aviso pós-registro via `?ok=<MOV-nnnnnn>`.
- API: `GET/POST /api/movimientos` (`?modo=catalogos`: depósitos permitidos ao usuário, produtos que controlam stock com saldos por depósito, custo médio e lotes), `GET /api/movimientos/[id]`, `POST /api/movimientos/[id]/anular`. Permissões `MOVIMIENTOS.VER/CREAR` e `MOVIMIENTOS.ANULAR` (ação crítica, só administradores) no backend; `empresa_id`/usuário da sessão; 401/403/404/409; 503 sem `DATABASE_URL`.
- Toda escrita usa `inventario_registrar_movimiento` / `inventario_anular_movimiento` (o papel de execução não escreve saldos): atualiza `stock_saldos` e `inventario_costos`, bloqueia stock negativo, valida alcance de depósito, deixa histórico imutável (anulação = movimento inverso) e é idempotente (chave gerada pelo formulário; clique duplo não duplica).
- Tipos: entrada, saída, transferência, ajuste +/−, reserva/liberação, quarentena/liberação. Registra produto, depósito(s), quantidade, custo, tipo, origem, motivo, documento, usuário, data e hora (hora gravada pelo servidor).
- Adicionado ao formulário o campo **Costo unitario** (obrigatório em ENTRADA e AJUSTE_POSITIVO: o custo não se inventa) e, na tela de detalhe, custo, vínculo da anulação e botão de anulação com motivo.
- **Lotes:** produto por lote exige lote; entrada/ajuste + criam o lote (com vencimento), demais operações exigem lote existente.
- **Pendências documentadas (campos preservados):** (1) produtos com *unidade identificada* (série/etiqueta, `UNIDAD_ETIQUETADA`) são recusados com mensagem clara — o banco não tem tabela de unidades; (2) stock de TERCERO: o banco aceita `propiedad/propietario_id` mas não há cadastro de proprietários, então a tela só cria movimentos PROPIO (movimentos TERCERO existentes são exibidos); (3) a tela registra um produto por movimento (o banco suporta várias linhas; o detalhe já as lista); (4) os mocks `lib/mocks/movimientos-stock*.ts` e `types` `MovimientoStockDemo` seguem só porque `recepciones-storage` (mock) os importa; (5) o módulo Stock continua com mocks (próximo item).
- Testes (API com rotas reais + `permissions.ts` real, conectado como `nexit_runtime` em PG16 descartável, 69 verificações): 401/403/404, entrada, saída, transferência, ajustes, reserva/quarentena, lote, bloqueio de saldo negativo, idempotência, alcance de depósito, persistência (usuário/motivo/custo/data), anulação, isolamento A×B, conciliação kardex/valor, 503. Sem mudança de schema: bateria SQL anterior (382) não foi repetida.
- NÃO executado: build/lint completos (sem registry no sandbox; `tsc` parcial sem erros além do ruído ambiental), HTTP real, teste visual.

## Item 7 — Stock (sem mock/localStorage)
- Telas existentes preservadas (`stock/page.tsx`, `stock/[id]/page.tsx`): filtros, pesquisa, indicadores, detalhe, stock por depósito, lotes e exportações XLSX. Removidos `obtenerStockDemo`/`buscarStockDemo`, pills "DEMO"/"MINGO 2026", markup fictício (+20 %) e nomes fixos de arquivo.
- API (somente leitura): `GET /api/stock`, `GET /api/stock/[id]` (`STOCK.VER` no backend; `empresa_id` da sessão em todas as consultas; 401/403/404/503; sem dados fictícios se o banco falha). Lógica em `lib/stock/shared.ts`; cliente em `lib/stock/cliente-api.ts`.
- Dados reais: `stock_saldos` (por produto × depósito × estado × lote) alimentados pelos Movimientos; quantidades disponível, reservada, em quarentena, em trânsito, total físico e virtual (só PROPIO; TERCERO aparece à parte); custo promedio e valor de inventário de `inventario_costos` (nulo e exibido "—" sem saldo valorizado); preço de venda = lista de referência (NEX-017), nulo se não existir (nada é inventado); mínimo/máximo/ponto de reposição do produto definem o nível (SIN_STOCK/BAJO/NORMAL/SOBRESTOCK); moeda = moeda base da empresa.
- Testes (rotas reais + `permissions.ts` real como `nexit_runtime` em PG16 descartável, 20 verificações): 401/403, `MOVIMIENTOS.*` não dá `STOCK.VER`, empresa sem movimentos = saldos 0 sem custo/preço, saldos após movimentos reais (entradas, reserva, quarentena, transferência, lote), custo promedio 150, preço de referência, aislamento A×B (listado e detalhe 404), 503 sem `DATABASE_URL`. `tsc` parcial sem erros novos.
- NÃO executado: build/lint completos (sem registry no sandbox), HTTP real, teste visual.
- **Lacunas documentadas (campos preservados, sem migração):** (1) *Em trânsito* sempre 0: nenhum tipo de movimento atual gera `TRANSITO` (virá com despacho/recepção entre depósitos); (2) não há tabela de ubicações físicas dentro do depósito — a coluna "Ubicación" mostra o depósito; (3) não há cadastro de proprietários para stock de TERCERO — o proprietário aparece como "não registrado"; (4) mínimo/máximo por depósito (`producto_deposito_configuracion`) ainda não usado — vale o do produto; (5) `lib/mocks/stock*.ts` e `StockDemo` seguem só porque o mock `movimientos-stock-storage` os importa.

## Pendências futuras de Movimientos
- Unidades identificadas (série/etiqueta, `UNIDAD_ETIQUETADA`): exige tabela de unidades (próxima migração livre: NEX-020).
- Estoque de terceiros: exige cadastro de proprietários; hoje só se criam movimentos PROPIO.
- Múltiplos produtos por movimento: o banco suporta várias linhas; a tela registra um produto por movimento.

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
