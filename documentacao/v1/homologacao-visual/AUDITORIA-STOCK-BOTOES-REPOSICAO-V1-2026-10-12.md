# AUD — Stock: botones, saldos, valoración y Reposición

**Fecha:** 2026-10-12. **Auditor:** ChatGPT. **Estado:** DEFECTO DE NAVEGACIÓN CONFIRMADO; resto revisión estática NO HOMOLOGADA. **Alcance:** capturas reales del responsable de Stock listado, ficha del producto y botones, código GitHub branch `feature/NEXIT-2026-001-banco-demo`.

## Fuentes internas revisadas
`CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `app/(private)/stock/page.tsx`, `app/(private)/stock/[id]/page.tsx`, `app/api/stock/route.ts`, `lib/stock/shared.ts`, `lib/navigation/menu.ts`. La ruta `app/(private)/reposicion/page.tsx` consultada devuelve no encontrada; `/reposicion` no figura en `V1_HREFS`. No hubo SQL, navegación funcional ni descargas de navegador; no se auditaron en esta etapa todas las consultas de Movimientos.

## Matriz de botones
| ID | Elemento | Evidencia | Dictamen | Prioridad |
|---|---|---|---|---|
| STK-01 | Exportar Excel | `onClick={exportarListadoExcel}`, importa `xlsx`, construye workbook/resumen y llama `writeFile` | Implementado en frontend; probar archivo descargado, totales, filtros y valores sin precio | QA P1 |
| STK-02 | Valorizado por marca | `onClick={exportarValorizadoMarca}`, agrupa marcas y genera `Stock_Costo_por_Marca_*.xlsx` | Implementado; revisar conciliación con tarjeta Valor a costo | QA P1 |
| STK-03 | Movimientos | Link a `/movimientos`, ruta en V1_HREFS | Enlace existente; validar autorización y navegación; auditar módulo aparte | QA P1 |
| STK-04 | Reposición | Link a `/reposicion`; no se encontró `app/(private)/reposicion/page.tsx`; ruta ausente de `V1_HREFS` | **Botón roto: destino sin página implementada** | DEFECTO P0 |
| STK-05 | Ver detalle | Link a `/stock/[id]`, página existe y lista `depositos` | Implementado; verificar con stock real | QA |
| STK-06 | Exportación de stock | Filas vienen de `filtrados` y se agregan por `valorCosto` / `valorVentaReferencia` | Revisar alcance por depósito al aplicar filtros: filtro acepta el producto si **algún** depósito coincide, sin necesariamente recalcular saldo/valor al depósito filtrado | Investigación P1 |

## Matriz de datos y consistencia
| ID | Tema | Evidencia | Dictamen | Prioridad |
|---|---|---|---|---|
| STK-07 | Stock total | Screenshot 1 SKU, 271 disponible, 0 R/C/T | Captura compatible con lectura; no prueba contabilidad inventario | QA |
| STK-08 | Costo | Screenshot 271 × Gs.180.000 = Gs.48.780.000 | Matemáticamente consistente | Conforme a captura |
| STK-09 | Venta referencia | Screenshot 271 × Gs.336.000 = Gs.91.056.000 | Matemáticamente consistente; valor teórico, no venta realizada | Conforme a captura |
| STK-10 | Valores vs propiedad | API lista `propiedad`, `propietario` y valorización | Verificar separación de stock propio/terceros en sumas contables e inventario disponible | Investigación P1 |
| STK-11 | DISPONIBLE/RESERVADO/CUARENTENA/TRÁNSITO | `lib/stock/shared.ts`: total físico = disponible+reservado+cuarentena; total virtual = físico+tránsito | Definición explícita; no confundir virtual con disponibilidad vendible | Conforme conceptual/QA |
| STK-12 | Baixo/sem stock/sobreestoque | `nivel` depende disponible<=0; disponible<stockMinimo; totalFisico>stockMaximo | Ponto de reposição é guardado/exibido mas **não dispara planejamento**; demanda definição explícita | Lacuna funcional P1 |
| STK-13 | Localização | `lib/stock/shared.ts` atribui `ubicacion: ""` na visão por depósito; detalhe exibe coluna Ubicación vazia | **Evidência de ausência de localização real** no detalhamento consultado. Não inventar localização. | Defeito funcional P1 caso haja localização na origem |
| STK-14 | SKU / código inventário / marca/família/linha | Filtros e listagem possuem esses campos; API usa produtos empresa | Confirmar matches e classificações históricas, sem fazer backfill automático | QA |
| STK-15 | Valorização por custo médio | `inventario_costos` alimenta custo e valor | Conferir conciliação por depósito, unidades, moeda base e propriedade | P1 investigação |
| STK-16 | Reposición | Produto possui stock mínimo, punto reposición, stock máximo | Desenvolver fluxo V1 de **sugestões de reposição**, não gerar compras automaticamente sem aprovação | P0 funcional |
| STK-17 | Auditoria/MOV | Stock API GET somente leitura, mudanças via Movimientos | Boa separação; checar atomicidade e eventos no módulo seguinte | QA |
| STK-18 | Filtro depósito | `stock/page.tsx` mantém agregados em produto e filtra existência de depósito | Usuário pode interpretar valor como saldo do depósito selecionado, quando permanece consolidado | **Risco de apresentação incorreta** P1 |
| STK-19 | Estoque físico vs valor referencia | Ausência de preço pode render zero em total; API retém null por produto | Melhor exibir ausente sem falsificar valor; não somar quantidades de unidades incompatíveis como indicador de "unidades" sem contexto | UX P2 |

## Reposición — requisitos mínimos propostos (NÃO IMPLEMENTADOS)
- Nova página `/reposicion` ligada ao botão de Stock e adicionada ao filtro de rotas V1, com permissão STOCK.VER para leitura e políticas de escrita separadas somente se houver ação real.
- Tabela por produto e, se modelo suportar, depósito; colunas: código, produto, depósito, disponível, reservado, trânsito, mínimo, punto reposición, máximo, quantidade sugerida, estado e referência ao detalhe.
- Definição inicial **sugerida, a aprovar:** quando posição de estoque projetada (disponível+trânsito, descontando reservas apenas se contagem apropriada) cair abaixo do punto reposición, sugerir completar até máximo. Não gravar movimentos/compras/reservas automaticamente; evitar deduzir a mesma reserva duas vezes.
- Filtrar por marca, família, depósito e criticidade. Informar sem ponto/máximo configurado em vez de produzir sugestão falsa. Excel opcional com mesma regra e totals.
- Determinar lead time, múltiplos de compra, fornecedor e depósitos somente após ler modelo existente; não fabricar dados.
- Tela no padrão visual V1, navegação de volta a Stock e para Movimientos, estado vazio, erros reais, responsividade.
- Validar GET real por empresa/permiso, sem mocks.

## Benchmark ERP
- Odoo Reordering Rules: gatilho mínimo/máximo, quantidades por múltiplo, provisões e prazos: https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/inventory/warehouses_storage/replenishment/reordering_rules.html
- Microsoft Dynamics 365 On-hand: detalha disponibilidade física, prevista e reservas por dimensão/depósito: https://learn.microsoft.com/en-us/dynamics365/supply-chain/inventory/inventory-on-hand-list
- Dynamics 365 Replenishment: vários métodos, incluindo mínimo/máximo: https://learn.microsoft.com/en-us/dynamics365/supply-chain/warehousing/replenishment

## Gate e sequência
1. Corrigir botão Reposición ou implementar tela real antes de considerar Stock homologado.
2. Conferir fonte das localizações, filtro por depósito, propriedade e conciliação de saldos.
3. Validar exports com dados e seu conteúdo, não apenas handler.
4. Auditar Movimientos e política de valorização antes de autorizar escrita de estoque.
5. Não criar migration ou regra operacional por suposição; usar DDL e testes da aplicação.

**Status:** Matriz documental, nenhum código ou dado da VM alterado.
