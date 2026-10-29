# AUD-NEXIT-STOCK-DESKTOP-R01 — Auditoría del menú «Inventario → Stock»

**Fecha:** 2026-10-18. **Snapshot funcional auditado:** `ee57f3a681d3d33aa71e0428b0cbb59efac20c6c` (branch `feature/NEXIT-2026-001-banco-demo`, árbol `c9df1d56ec196d252e5d492c9f9be9fb60355cb9`).
**Producto:** ERP NEXIT exclusivamente **desktop**; no exigir interfaz móvil, botón hamburguesa ni captura de celular.
**Veredicto:** **CORRECCIONES SOLICITADAS — 1 ALTA + 2 MEDIAS, con una reserva semántica que requiere validación de la política de visibilidad del catálogo. NO HOMOLOGADO**.
**Operación realizada:** revisión estática del código y documentación versionados en GitHub. NO se ejecutaron pruebas, endpoints reales, CI, PostgreSQL, VM, SQL ni navegador; no se alteró código funcional ni se emitió orden de implementación a Claude.

## 1. Fuentes y cobertura de la auditoría

Gobierno leído: `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, secciones pertinentes de `PROGRESSO-NEXIT-V1.md`, `documentacao/v1/auditoria-por-menu/AUD-STOCK-V1.md` e inventario transversal `AUD-INVENTARIO-INTEGRADA-V1-2026-10-13.md` con reauditorías R02–R05.

| Capa | Código y contrato examinado |
|---|---|
| Listado desktop | `app/(private)/stock/page.tsx` (766 líneas): resumen SKU/Disponible/Bajo mínimo/Sin stock, filtros estado/propiedad/clasificación/depósito, URL `?deposito=`, búsqueda, clasificación, paginación 25, moneda, costes y valores, accesos a detalle y Movimientos/Reposición |
| Detalle por producto | `app/(private)/stock/[id]/page.tsx` (393 líneas), `page.module.css`: físico/virtual, dueño, terceros, costo/venta, tabla por depósito, mínimo/punto/máximo, lotes/vencimientos, acciones Entrada/Transferir, mensaje de alcance |
| Autorización HTTP | `app/(private)/stock/layout.tsx`; `app/api/stock/route.ts` (34) y `app/api/stock/[id]/route.ts` (39): sesión obligatoria, `STOCK.VER`, UUID, empresa y usuario de sesión, 404/401/403/500, consulta-only (sin POST de saldo) |
| Servicio y vista | `lib/stock/shared.ts` (180): selección productos, `PERMITIDOS` por usuario/depósito, saldos por estado/propiedad/lote, costos valorizados por depósito, precio de referencia, parámetros; `lib/stock/vista.ts` (95): nivel y vista por depósito, costo unitario decimal textual; `lib/stock/cliente-api.ts` y `types/stock.ts` |
| Dependencias | `app/(private)/reposicion/layout.tsx` exige `STOCK.VER`; enlaces Movimientos usan `lib/inventario/acceso.ts` con combinación VER/CREAR; `lib/depositos/carga.ts` valida URL `?deposito=` frente a depósitos autorizados |
| Integridad de datos | NEX-009 (stock_saldos/inventario_costos), NEX-014 (Movimientos), NEX-046 (depósitos y atribuciones), NEX-052 (unidad-base e invariantes, **sin verificar ejecución real**), patrón de snapshot `lib/reportes/snapshot.ts` + Valorización |
| Pruebas existentes | `lib/inventario/stock.casos.ts`, `lib/stock/stock-reposicion.casos.ts`, `lib/inventario/cruzados.casos.ts`, `documentacao/banco/nexit/v1/pruebas/T04-costos-inventario.sql` consultadas selectivamente. Son simulaciones/helpers/SQL históricos; no se ejecutaron. |

**Cobertura honesta:** se rastrearon los puntos relevantes de lista, ficha, API, servicio, helper y SQL vinculado para este menú. No se declara lectura semántica de todos los procedimientos del motor Movimientos ni revisión profunda de los menús Depósitos/Reposición/Kardex; tendrán auditoría propia.

## 2. Hallazgos vigentes

### STK-D01 — ALTA — Productos de depósitos ajenos pueden aparecer con «Sin stock» bajo alcance limitado

**Evidencia:**
- `lib/stock/shared.ts:31–49` consulta **todos** los productos activos con `controla_stock` de la empresa sin restringirlos a depósitos asignados. La condición para incluir productos inactivos con stock (`EXISTS stock_saldos`) también **carece del filtro de depósitos autorizados**.
- `lib/stock/shared.ts:51–66` filtra `stock_saldos` y `inventario_costos` por `PERMITIDOS` (empresa/usuario) como corresponde; `:100–107,153–154` genera cantidad visible 0 y `nivel = SIN_STOCK` si ningún saldo proviene de depósitos autorizados.
- `app/(private)/stock/page.tsx:151–155,250,395–407,439–461,610–692` usa el conjunto completo en la vista consolidada, KPI «Sin stock» y búsqueda. `app/api/stock/[id]/route.ts:26–33` da la ficha del mismo producto aunque nunca tenga saldo en depósitos que el actor puede ver.
- Un producto **inactivo** con saldo exclusivamente en depósito B (sin autorización) entra al conjunto por `EXISTS` y se presenta al actor del depósito A con sin stock: revela indirectamente que existe alguna existencia fuera del alcance, aunque **no** revela cantidades de B.

**Secuencia conceptual derivada directamente del SQL:** empresa E con depósitos A y B, usuario U limitado a A, producto P activo con 15 unidades en B, 0 en A: GET Stock/U incluye P y devuelve `disponible=0`, clasifica `SIN_STOCK`, infla SKU/Sin stock. El usuario puede interpretar como falta de existencias de su ámbito aun cuando no haya relación operativa de P con A. Con U sin depósitos asignados, todos los activos quedan con 0. La frase «visión consolidada de depósitos autorizados» agrava la ambigüedad sobre universo de productos.

**MATIZ DE POLÍTICA:** `lib/stock/shared.ts:11–13` declara **intencionalmente** que «los productos sin saldo visible no cambian; solo se filtran saldos y costos». Por tanto no se debe suponer que mostrar el catálogo empresarial está prohibido. El **defecto cierto** es que se mezclan catálogo global y KPI/estado de stock local sin declarar a cuál población aplican, y el caso de producto inactivo se incluye por saldo fuera de alcance. **Resolver primero la política:** si el usuario con STOCK.VER puede ver productos globales, conservar catálogo pero diferenciar «sin saldo en los depósitos autorizados» de «producto con stock agotado» y ajustar la métrica; si el alcance también debe proteger metadata de productos, filtrar universo conforme autorización sin eliminar la visibilidad legítima de productos configurados con saldo 0. Conservar una fila legítima de producto agotado autorizado (no hacer INNER JOIN solo con saldos positivos).

**Prueba dirigida requerida:** U→A vs P con saldo solo B, P agotado con configuración en A, U sin depósitos, P inactivo con saldo solo B, admin con TODOS, precio/costo ocultos fuera de alcance, empresa distinta. Sin ampliar o reducir acceso silenciosamente.

### STK-D02 — MEDIA — Moneda-base es variable global del módulo y una carga desmontada puede alterarla

**Evidencia:** `app/(private)/stock/page.tsx:39–40`: `let MONEDA_BASE = "PYG"` **fuera** del componente. En `:115–149` la promesa `cargarStock().then(r => { MONEDA_BASE = r.monedaBase; if(activo){...setStock...} })` modifica la variable **antes** de comprobar si el componente sigue montado. `:685–689` formatea costos y valores con `MONEDA_BASE`; un render posterior tras otra interacción puede etiquetar importes de la nueva respuesta usando moneda de una petición antigua.

**Escenario:** montar Stock para empresa/moneda A, navegar sin terminar su GET, cambiar contexto/autenticar y montar Stock para B, resolver primero B y después A: `activo=false` evita actualizar filas de A, pero **no** evita `MONEDA_BASE = monedaA`, compartido en el mismo módulo JS. Una nueva renderización de B puede rotular monedaA sobre valores B. No se afirma haber reproducido el flujo de cambio de empresa en navegador; el error de orden e isolamento del estado es directo.

**Corrección:** `monedaBase` en `useState` del componente o derivada del resultado actual; comprobar `activo` antes de todos los efectos de respuesta; formatear desde estado del mismo payload con default no engañoso durante carga. Test de promesa A tarda → B se resuelve → A responde tarde; etiquetas deben pertenecer a B.

### STK-D03 — MEDIA — Saldos, costos y metadatos se leen sin snapshot consistente durante movimientos concurrentes

**Evidencia:** `lib/stock/shared.ts:31–87` ejecuta **nueve** `db.query` en `Promise.all` sobre un Pool; los SELECT ocurren en conexiones/transacciones independientes, cada una con snapshot READ COMMITTED. El saldo `stock_saldos` y `inventario_costos` se mutan dentro de una misma operación física por Movimientos, pero un GET de Stock puede ver saldos nuevos junto a costo viejo (o viceversa), especialmente al abrir ficha justo durante entrada/transferencia/anulación. `:102–175` compone esas fuentes como un resultado único, mezcla físico/costo y valor sin advertencia. Contrastado con `lib/reportes/snapshot.ts:9–35` y `lib/reportes/valorizacion.ts:65–82`, que usan **UNA conexión** + `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` para mantener instantánea coherente.

**Impacto:** inconsistencia transitoria de métricas físicas y monetarias en la lectura sin que necesariamente exista un asiento incorrecto en el banco. Esto es **riesgo de concurrencia demostrado por la arquitectura**; no se reprodujo en PostgreSQL real y no debe llamarse corrupción persistente.

**Corrección:** evaluar el mismo patrón de snapshot de lectura de Valorización para el conjunto de consultas Stock, preservando permisos, empresa, filtro depósito, lote, unidades, coste exacto y ausencia de escrituras. Comprobar costo/cantidad en lectura concurrente simulada/controlada y después por prueba operacional autorizada. No bloquear globalmente movimientos, no alterar DDL ni introducir otra fuente de costos.

## 3. Comportamientos anteriores corregidos/aceptados en el código — NO reabrir

- **INV-01:** «Sin stock» = disponible 0; «Bajo mínimo» significa disponible por debajo del mínimo, distinto de necesidad de Reposición por punto. `lib/stock/vista.ts:18–24,78`; UI explica esta diferencia.
- **INV-02:** enlaces a historial solo con `MOVIMIENTOS.VER`; Nuevo movimiento con **VER+CREAR** y no se ofrece para `UNIDAD_ETIQUETADA`; cada destino valida permiso real. Reposición comparte `STOCK.VER`, por lo que `/reposicion` es destino autorizado de Stock, **NO es CTA indebido**.
- **INV-03:** coste de inventario se etiqueta con moneda base; referencia de venta tiene **su propia moneda**. No se suman monedas heterogéneas en tarjetas, que solo presentan 4 KPIs físicos.
- **INV-04 / INV-R02-01:** `valorInventarioTexto`, `cantidad_valorizada::text`, división decimal exacta `costoUnitarioTexto` half-up 4 posiciones y precio de venta decimal textual `multiplicarDecimales`. No reabrir el bug float previo del **costo unitario**; los campos numéricos legacy en `StockItem` siguen existiendo para cantidades KPI y detalle.
- **INV-R02-02:** `depositosAutorizados` incluye depósitos activos/inactivos con/sin saldo; `interpretarDepositoUrl` distingue permitido, ausente y no disponible; no muestra consolidado sin aviso de URL inválida.
- **INV-R02-03:** pruebas/validadores de carga para Depósitos/Reposición corregidos en otros menús. No atribuirlos a Stock.
- **STK-X01/X04 / U07/U08/U09:** hay decisiones transversales de unidad-base/versiones/factor y NEX-052, pero una auditoría Stock solo lectura no autoriza reimplementar protección de inventario ni cambiar unidades históricas. Verificar estado real de migration únicamente por procedimiento del responsable; no declararla ausente.
- Stock no ofrece POST/PUT/DELETE ni ajuste de cantidad. El motor Movimientos es la única vía de escritura física; los saldos de `TERCERO` no se agregan a `PROPIO`.

## 4. Observaciones de negocio/escala, NO defectos confirmados en esta revisión

- **STK-O01:** una vista filtrada a depósito muestra productos **solo si hay línea de saldo diferente de cero** (`vistaPorDeposito` devuelve null sin `depositos`). Un producto configurado con mínimo/punto para depósito A pero agotado a cero puede no aparecer allí, mientras Reposición sí lo incluye por la configuración. Es una decisión histórica **explícita** en `lib/stock/stock-reposicion.casos.ts` (test «producto sin saldo en el depósito: no aparece»), así que no se reabre sin decisión de negocio. Puede inducir confusión al comparar módulos; documentar en UX.
- **STK-O02:** KPI «Disponible» agrega unidades de productos heterogéneos (piezas, cajas, kg); responde al contrato actual de la portada, no representa una magnitud homogénea. Si se requiere dato físico global comparável, decidir semántica por unidades antes de cambiar.
- **STK-O03:** lista carga el catálogo y saldos completos de la empresa y pagina en memoria 25; sin latencia o volumen medidos, riesgo de performance, no defecto probado.
- **STK-O04:** enlaces Entrada/Transferir se basan en depósito con saldo y permiso MOVIMIENTOS.VER+CREAR, pero la respuesta de Stock no incluye `deposito.activo` para distinguir histórico inactivo. NEX-046 prohíbe inactivar con saldo positivo si está aplicada; para dato legacy incoherente o migración no aplicada, la API Movimientos debe rechazar. Caso condicional, no asumir error operativo presente.
- **STK-O05:** catálogo de Stock expone costo promedio y referencia venta a perfil con `STOCK.VER`, por diseño anterior; política comercial de confidencialidad podría requerir permiso adicional, pero sin aprobación explícita no se clasifica como fuga.
- **STK-O06:** en el detalle sin saldo autorizado, la pantalla `Stock no encontrado` devuelve un mensaje genérico y no distingue producto inexistente/no controla stock/sin saldo. Esto es intencionalmente neutro frente al alcance; no tratar como error salvo petición de usabilidad.

## 5. Plan de verificación focal si el responsable autoriza correcciones

1. Política explícita de universo de productos por depósito (activo/inactivo), cero saldo legítimo, producto fuera de alcance y usuario sin depósitos. Mantener aislado el saldo/costo de B y tenants distintos.
2. Estado monetario por instancia de Stock; simular dos GET de empresas de monedas diferentes con orden de respuesta invertido y desmontaje de la primera.
3. Lectura Stock concurrente con registro de entrada/transferencia/cancelación, validación consistente saldo/cantidad valorizada/valor en mismo snapshot; preservar lectura no bloqueante y control por empresa/depósito.
4. Solo tests locales pertinentes de helpers/UI/servicio SQL simulado y lint de archivos tocados; sin tsc/build/lint global, CI manual o suite general por iniciativa de IA. Nada de cambios SQL/VM/PG real o deploy por IA.

**Estado final:** auditoría estática do **Menu 8 Stock** documentada con 3 hallazgos abiertos (1 ALTA + 2 MEDIAS), 6 observaciones. NO HOMOLOGADA; próximo menú secuencial de Inventario será **Movimientos**, separado, tras pedido del responsable.
