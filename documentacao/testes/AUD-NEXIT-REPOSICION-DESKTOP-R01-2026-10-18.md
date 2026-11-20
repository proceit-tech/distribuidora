# AUD-NEXIT-REPOSICION-DESKTOP-R01 — Inventario → Reposición (18/10/2026)

**Menu 11 — ruta `/reposicion` — branch `feature/NEXIT-2026-001-banco-demo`**
**Estado:** AUDITORÍA ESTÁTICA DE MENU DOCUMENTADA CON HALLAZGOS ABIERTOS — NO HOMOLOGADA. No existe autorización de implementación para Claude en esta fase.
**Corte verificable (blob SHA, no confundir con commit HEAD):** pantalla `489fc532e4612c72f5d6dac69c61fda946ffe824`, datos SQL `1f1bcccc2236f0a94cd63d1849afc17933ad095f`, cálculo `2f08843b569eeb3a2113d715c00354829a858e0a`, carga `574c9688b0bd46cd9495469e75c974dab926155c`, API `7cc999769c6859cdc9a5e2c03b9206f16f0afd2c`.
**Método:** lectura de CLAUDE.md y documentacao/PROTOCOLO-IA.md actuales, PROGRESSO-NEXIT-V1.md pertinente, DEFINICAO-MENUS-INVENTARIO-V1, AUD-INVENTARIO-INTEGRADA (R01–R05), ficha canónica; revisión línea a línea de pantalla (531 líneas), API GET, helpers SQL de lectura/cálculo/carga/validación/permisos, precarga de Movimientos y casos existentes de Inventario/Stock/Reposición. Auditoría estática en GitHub, no navegación real.
**Ejecución por ChatGPT:** **0 casos de prueba**; sin HTTP autenticado, PostgreSQL real, VM, Docker, deploy, browser, screenshot, build, tsc, lint ni suite global. Las suites existentes fueron leídas, no ejecutadas. ERP exclusivamente desktop; mobile está fuera de alcance.

## 1. Matriz de cobertura del menú actual

| Área | Evidencia de código actual | Estado de auditoría |
| --- | --- | --- |
| Navegación/guardas | lib/navigation/menu.ts, `app/(private)/reposicion/layout.tsx`: `STOCK.VER` | Conformes en código con la política aprobada |
| API de lectura | `app/api/reposicion/route.ts`: GET solamente, sesión, 401/403/503/500 y permisos de Movimientos solo como metadata | Conformes en código; no se enviaron requests reales |
| Empresa/depósitos | `lib/reposicion/datos.ts:9–49`: empresa sesión, depósitos activos autorizados, `PROPIO` y categorías de saldo, políticas por depósito | Conforme con contrato de lectura; ver REP-O02/O03 |
| Plan | `lib/reposicion/datos.ts:50–130` y `lib/reposicion/calculo.ts`: global de referencia cuando hay plan por depósito, umbrales y metas | Mantiene contratos ya reaudidados; no reabrir AUD-REP-03/04 |
| Disponibilidad | propia `DISPONIBLE`; RESERVADO/CUARENTENA separados, TRANSITO solo bajo hipótesis explícita de simulación | Conforme con reglas; fuente es un conjunto de SELECT sin snapshot (REP-D04) |
| Origen compartido | `calcularPlanReposicion` asigna excedente por producto, origen, urgencia y destino; no lo asigna dos veces en plan base | Conserva pruebas históricas; simulación individual no reoptimiza plan (REP-D02) |
| Filtros desktop | búsqueda código/nombre/marca; filtros depósito, marca y situación; orden, página 25, detalle expandido | Conforme a estructura visible, no probado en navegador |
| Indicadores | necesidad, sin stock, bajo mínimo, transferencia posible, con alcance completo autorizado y filtros solo en tabla | Coherente con texto aclaratorio del menú |
| Simulación | `cantidadSimulada`, `incluirTransitoEfectivo`, `transferenciasPlanificadas`, input local | No guarda ni reserva; revisar REP-D01/D02 |
| Enlace operativo | `enlaceNuevoMovimiento`, `puedeAbrirNuevoMovimiento` exige `MOVIMIENTOS.VER+CREAR` y recarga catálogos/validación en destino | Conforme: enlace no registra movimiento |
| Error/carga | `cargarReposicion` valida HTTP, forma de cada entrada y lista de depósitos; compuerta para solicitudes retrasadas y botón Reintentar | No reabrir INV-R02-03; ver estado de carga vigente REP-D03 |
| Dependencias | Productos > Inventario dueño de mínimo/punto/máximo; Stock lectura; Movimientos único motor; Reportes > Stock crítico reutiliza `calcularPlanReposicion` | Separación de responsabilidades respetada |
| Pruebas examinadas | `lib/inventario/reposicion.casos.ts`, `lib/stock/stock-reposicion.casos.ts`, `lib/inventario/cruzados.casos.ts`; contrato INV-R02/R05 | Prueban helpers/estructura y reparto base, no escenarios nuevos identificados |

## 2. Hallazgos actuales — separados de correcciones históricas

### REP-D01 — MEDIA — recomendaciones visibles no reflejan cantidad simulada
**Evidencia:** `app/(private)/reposicion/page.tsx:357–420` obtiene `escrita=planEscrita(f)`, usa `transferenciasPlanificadas(f, escrita)` para calcular la cantidad preparada en el enlace, pero el rótulo principal continúa con `Transferir {cant(t.cantidad)}`, `Comprar {cant(f.sugeridaCompra)}` y `Necesidad/meta = f.sugerida` (líneas 384–386, 389–419). En detalle (líneas 463–483), «Simulado … transferir … comprar …» usa otras cantidades, creando dos recomendaciones visuales distintas sobre la misma fila.
**Secuencia derivada:** plan base transfiere 10 y compra 10; operador activa «Simular» e introduce 5. El link puede preparar transferencia de 5, el detalle muestra 5 y compra 0, pero la fila mantiene «Transferir 10 / Comprar 10» y meta base 20.
**Impacto:** recomendación operativa ambigua; aunque la URL al movimiento está validada y la API de stock revalida al registrar, la pantalla puede inducir a una decisión errónea. NO se prueba creación automática ni modificación de stock.
**Criterio:** identificar de forma visible y consistente «Plan base» versus «Simulación» en fila/resumen/detalle/enlace, o presentar solo una proyección claramente indicada. Pruebas focales simulación 0, inferior, igual y superior a la meta, más reset a plan base.

### REP-D02 — MEDIA / POLÍTICA A DEFINIR — simulación por destinos no redistribuye el origen compartido
**Evidencia:** `page.tsx:79–81` calcula una sola vez `calcularPlanReposicion(datos.entradas, {incluirTransito})`, sin pasar `plan`; `page.tsx:135,391–404` aplica la cantidad simulada solo dentro de `transferenciasPlanificadas(f, escrita)` sobre el cupo base de cada destino. `lib/reposicion/calculo.ts` reparte el origen compartido con las metas originales de todos los destinos, antes de la simulación; `transferenciasPlanificadas` nunca asigna al siguiente destino lo liberado por otro.
**Caso comprobable por la lógica:** origen con 50 transferibles, A tiene meta base 50 y B 45: A recibe 50, B recibe 0 y «comprar 45». Si el operador simula A=0, B sigue con 0 asignado aunque ahora exista excedente; el input por fila no recalcula la prioridad colectiva. Esto puede ser una limitación aceptada si la simulación se define expresamente como **ajuste individual limitado al plan base**; el contrato actual la denomina simulación local y no especifica esta consecuencia.
**Impacto:** interpretación incierta como simulación global de abastecimiento. **No clasificar sobreasignación real ni regresión de AUD-REP-04**: el plan base conserva la asignación única.
**Criterio/decisión:** definir si «Simular» es solo límite individual de transferencia calculada o recalcula el escenario global. En el primer caso, advertir expresamente que el excedente liberado NO se redistribuye ni modifica la compra de otros destinos; en el segundo, recalcular sin sobreasignación. Prueba 2 destinos/1 origen, simular 0 en A, comparar B y descartar simulación.

### REP-D03 — MEDIA — reintento conserva durante la nueva consulta indicadores, sugerencias y links anteriores
**Evidencia:** `page.tsx:57–67` `cargar()` inicia la solicitud sin invalidar `datos` o establecer `cargando`. Solo al resolver modifica `setDatos(r.datos)` y `setError(r.error)`. `page.tsx:79–133,199–220,357–431` continúa computando/renderizando `datos` viejos mientras el GET nuevo sigue en vuelo. La compuerta descarta respuestas que llegan fuera de orden — funciona correctamente —, pero no identifica visualmente los resultados anteriores como anteriores.
**Impacto:** tras cambios de stock/permisos y nueva petición, la pantalla conserva plan y enlaces de una consulta previa hasta recibir la respuesta. Como la API destino comprueba alcance/saldo, NO es bypass de autorización ni stock antiguo aceptado por SQL comprobado. El problema es contexto/consulta visible obsoleta.
**Criterio:** estado de carga/revalidación explícito; evitar presentar enlaces antiguos como plan vigente durante recarga, sin descartar simulación local del usuario por defecto. Pruebas carga inicial, recarga lenta, 401/403/500, error y reintento, dos GET fuera de orden, cambio de permisos.

### REP-D04 — MEDIA, riesgo de consistencia no reproducido — cinco consultas de planificación sin snapshot común
**Evidencia:** `lib/reposicion/datos.ts:15–48` ejecuta con `Promise.all` consultas independientes al `Pool` para productos, `stock_saldos`, `producto_deposito_configuracion`, depósitos visibles y conteo total. No hay transacción de lectura de snapshot/repeatable-read. El mismo problema conceptual fue documentado para Stock (STK-D03), pero aquí los resultados generan cantidades transferibles y compra sugerida, por lo que corresponde una observación propia del menú.
**Riesgo:** movimiento y edición de parámetros simultáneos pueden producir una combinación que nunca existió como corte coherente; alcance y catálogos también pueden cambiar a mitad de las consultas. Se trata de planificación y no de ejecución: Movimientos siempre revalida el saldo real.
**Criterio:** decidir/implementar lectura de snapshot coherente para los insumos dependientes de un mismo plan, reutilizando el patrón `lib/reportes/snapshot.ts` si corresponde y preservando los permisos/filtrado. Prueba dirigida con transacciones de stock/parametrización concurrentes en ambiente autorizado; sin prueba no alegar reproducción ni corrupción del ledger.

## 3. Observaciones adicionales — no bugs comprobados

- **REP-O01 — lote:** el plan considera saldo agregado por depósito/estado, no desagregado por lote. «Preparar transferencia» precarga producto/origen/destino/cantidad, no lote; `Movimientos` solicita lote para productos LOTE y vuelve a validar disponible por lote. Una propuesta agregada podría exigir dividirse en varios movimientos o disminuir cantidad al seleccionar lote. Confirmar UX y advertencia, sin afirmar baja automática.
- **REP-O02 — alcance cruzado:** `DEPOSITOS_VISIBLES` filtra alcance_depositos/usuario_deposito, empresa y activo, pero no agrega explícitamente el alcance de sucursales en su listado. Stock utiliza criterio de depósitos similar y la política entre TODOS vs alcance de sucursales debe decidirse transversalmente; no llamar fuga de datos sin contrato inequívoco.
- **REP-O03 — alcance consolidado:** con permisos limitados, parámetros globales se comparan contra solo el saldo de depósitos autorizados; `alcanceParcial` se informa. Es diseño documentado, no resultado empresarial total. Respetar mensaje «Solo se consideran los depósitos que usted tiene autorizados.»
- **REP-O04 — precisión/escala:** `lib/reposicion/datos.ts` convierte `numeric` a `float8` y `lib/reposicion/calculo.ts` usa `Number` + redondeo a 4 decimales; sin pérdida material reproducida, no declarar defecto contable. `Reportes > Stock crítico` comparte el motor y exige pruebas coordinadas si se cambia.
- **REP-O05 — simulación y consulta renovada:** `plan` persiste por `clave` al reintentar el GET, deliberadamente preservado por INV-R02. Puede quedar ligado a una meta/base anterior para el mismo producto/depósito; se debe informar cuándo se renovó el plan sin borrar el trabajo por sorpresa.
- **REP-O06 — rendimiento:** consulta productos activos control-stock (aunque no todos tengan parámetros) y calcula planes en navegador, página 25/filtros cliente. No hay medición que pruebe lentitud, no recomendar refactor global automáticamente.
- **REP-O07 — meta imposible:** parámetros incongruentes (mínimo/punto > máximo) generan `advertencias` y cantidad sugerida cero para posiciones elevadas. El comportamiento está probado históricamente y la pantalla avisa; evaluar validación en Productos antes de elevar a bug.

## 4. Contratos que permanecen implementados — no reabrir sin regresión

- **Motor único:** solo GET en Reposición, ningún `POST/PATCH/DELETE` de stock; ni compra ni transferencia automáticas.
- **Empresa/permiso:** `STOCK.VER` en layout/API, session.user.empresaId/usuarioId, `MOVIMIENTOS.VER+CREAR` para `Preparar transferencia`, revalidación en destino.
- **Saldo correcto para plan:** solo PROPIO disponible, reservado/cuarentena no se cuentan dos veces; tránsito es hipótesis desactivada por defecto.
- **Políticas:** por depósito prevalecen; consolidado es referencia cuando existe plan por depósito, no duplicar compra; «Cantidad sin gatillo» y «Sin meta» informadas.
- **Origen compartido:** AUD-REP-04 protegido por asignación global de excedente por prioridad, sin duplicación en **plan base**.
- **Cargas:** INV-R02-03 solucionado: validación registro a registro, listas vacías aceptadas, GET inválido no se convierte en éxito, respuestas anteriores descartadas.
- **Stock versus reposición:** «Bajo mínimo» de Stock y «En punto» de Reposición representan umbrales distintos según contrato INV-01.
- **Pantalla desktop:** filtros, orden, página y detalle expandido existen; no requerir viewport móvil.

## 5. Matriz de pruebas para fase posterior

| Caso | Aceptación necesaria |
| --- | --- |
| REP-T01 simulación de 5 ante base transferir 10/comprar 10 | Etiquetas, enlace y detalle coherentes o identificados como base vs simulado |
| REP-T02 A/B comparten origen 50; simular A=0 | Política individual/global explícita, y ningún origen asignado dos veces |
| REP-T03 recarga GET lenta con datos anteriores | Indicación de resultados anteriores y bloqueo/rotulación de CTA hasta verificar |
| REP-T04 GET fuera de orden, error 401/403/500 y reintento | Compuerta permanece correcta; no render de datos/permisos tras fallo |
| REP-T05 SELECT concurrentes con movimiento/edición de parámetros | Snapshot/consistencia probada en PostgreSQL autorizado o riesgo documentado |
| REP-T06 LOTE y UNIDAD_ETIQUETADA en atajo | Lote obligatorio y aviso; unidad identificada nunca produce enlace |
| REP-T07 dos empresas y alcance parcial | Saldos y costos ajenos nunca visibles; políticas reales sin alcance ampliado |
| REP-T08 reporte Stock crítico comparte motor | Semántica sin doble asignación y sin regresión tras cualquier cambio |
| REP-T09 desktop real | Orden, filtros, paginación, foco y link de transferencia verificados por responsable |

**Cierre:** **0 ALTAS, 4 MEDIAS documentadas (REP-D01…D04), 7 observaciones sin defecto operacional probado.** REP-D02 exige decisión semántica y REP-D04 prueba de concurrencia; no presentar como fallas ya reproducidas. **NO HOMOLOGADO**. Ninguna modificación de código funcional/migration, ejecución de tests, PostgreSQL, VM o browser en este turno. **Siguiente menú por índice: Facturación → Documentos electrónicos**, después de autorización del responsable, sin abrir tareas para Claude todavía.
