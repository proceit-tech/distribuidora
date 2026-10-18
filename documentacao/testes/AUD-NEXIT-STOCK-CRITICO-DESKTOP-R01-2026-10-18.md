# AUD-NEXIT-STOCK-CRITICO-DESKTOP-R01 — Revisión individual por función: Stock crítico y reposición

**Fecha:** 18/10/2026. **Reporte 4/5:** Reportes → Stock crítico y reposición. **Ruta:** `/reportes/stock-critico`. **Rama:** `feature/NEXIT-2026-001-banco-demo`.
**Estado:** AUDITORÍA ESTÁTICA INDEPENDIENTE CON HALLAZGOS ABIERTOS — **NO HOMOLOGADO**. No autoriza correcciones por Claude, SQL ni migrations.
**Fuentes leídas:** `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, secciones pertinentes de `PROGRESSO-NEXIT-V1.md`, `documentacao/v1/REPORTES-V1-ALCANCE-APROBADO.md`, `documentacao/v1/auditoria-por-menu/AUD-REPORTES-INTEGRADA-V1-2026-10-13.md` hasta R20, índice y ficha histórica de Stock crítico, revisión transversal RPT-D01/D02 y auditoría operativa `AUD-NEXIT-REPOSICION-DESKTOP-R01-2026-10-18.md`. Lectura completa de página, API consulta/exportación, fuente de datos, plan, cliente, exportador, tipos, motor `calcularPlanReposicion` y datos `leerEntradasReposicion`, guardas de reportes, snapshot y pruebas preexistentes. Todo desde GitHub.
**Corte técnico (SHA de blob, no confundir con HEAD ni deploy):** página `3e0bdf858234f43738e38f82f07d31efbd5ffcf3` (314 líneas); fuente `lib/reportes/stock-critico.ts` `2a4af562072982afd81104bfce1bc960b0ae1173` (134); reglas de informe `stock-critico-plan.ts` `ffb849b5390f13831906de1bf70a1dde3ebfa71d` (200); export `export-stock-critico.ts` `6c5164aeff59e3ae0496f8261761773652551822` (94); cliente `196ea8808006a1440e73c7a0166964713d7aa5a2`; motor reposición y lectura versionados en la misma rama.
**Ejecución:** **0 pruebas ejecutadas por ChatGPT**, 0 PostgreSQL/VM/Docker/HTTP/browser/Excel-PDF externos, 0 build/tsc/lint o CI manual. Los casos locales `lib/reportes/stock-critico.casos.ts` (508 líneas) fueron **leídos**, no ejecutados. Los resultados históricos de Claude no son evidencia de ejecución actual. Solo desktop; no generar defectos móviles.

## 1. Función del reporte, responsabilidades y contrato

**Pregunta de negocio:** «¿Qué productos y depósitos requieren reposición, cuáles están en sobrestock, qué cantidad sugiere el plan común, cuánto puede venir de transferencia y cuánto quedaría para compra, y qué importe de costo *de referencia* puede calcularse?».

**Responsabilidad exclusiva:** reporte documental de excepciones/alertas y exportación, **no** planificación interactiva ni mutación. `Inventario → Reposición` administra simulaciones/preparación de transferencias; `Inventario → Movimientos` registra efectos; `Productos → Inventario` guarda metas/umbrales; `Inventario → Stock` muestra saldos operativos; `Reportes → Valorización` determina valor patrimonial de inventario. No crear compra, OC, reserva ni movimiento desde este informe.

**Contrato comprobado estáticamente:**
- **Motor único:** `lib/reportes/stock-critico.ts:107–110` usa `leerEntradasReposicion` y `calcularPlanReposicion(datos.entradas,{incluirTransito:false})`; calcula sobre el conjunto COMPLETO y recién después filtra. No duplica fórmula.
- **Ámbito:** productos activos que controlan stock, depósitos activos y autorizados por empresa/usuario de la sesión; solo propiedad PROPIO, disponibilidad sin tránsito; filtra categoría, marca, familia, texto, depósito y estado. **No** agrega físico de terceros.
- **Política por depósito:** configuración `producto_deposito_configuracion` prevalece donde existe; consolidado por producto es **solo referencia** si hay parámetros por depósito, no añade plan/compra ni doble cuenta. Con política solo global, la fila consolidada es el plan real y no se convierte arbitrariamente en plan de un depósito filtrado (caso histórico T-C04). 
- **Necesidad:** `SIN_STOCK`, `BAJO_MINIMO`, `EN_PUNTO` y `SOBRESTOCK` **informativo, independiente** del gatillo de reposición. SIN_GATILLO indica «cantidad de reposición» sin umbral, no genera una compra. SIN_PARAMETROS no crea alertas.
- **Meta:** máximo - posición, o cantidad de reposición definida; si ninguna existe, `sugerida=null` en motor y `sinMeta=1` en informe; **no inventar cantidad 0 como meta de negocio**. Hay una representación técnica numérica 0 en el DTO acompañada del contador `sinMeta`; las superficies deben preservar esa distinción.
- **Origen compartido:** depósito origen con parámetros propios cede solo disponible por encima de su punto/mínimo; varios destinos comparten un cupo global por producto asignado **una vez** por prioridad, sin sobrerreservar; sin parámetros no dona automáticamente. Compra = remanente de meta conocida.
- **Sobrestock:** físico propio (disponible+reservado+cuarentena) > máximo definido en el MISMO ámbito; no interviene en transferencias/compras.
- **Costo:** `inventario_costos` de depósitos permitidos (valor/cantidad valorizada) → costo unitario del depósito destino, o promedio ponderado del producto; multiplicación decimal exacta por cantidad sugerida. `null` si falta costo o meta; la cifra es estimación de **referencia**, no inventario valorizado, precio de compra ni importe comprometido.
- **Vistas:** PRODUCTO = sumar únicamente destinos/plan del **mismo** producto; DEPOSITO = detalle del plan por depósito. Los KPI se calculan con detalles filtrados de la solicitud completa (no solo la página), nunca suma física entre productos/unidades heterogéneas.
- **Seguridad/operación:** ruta protegida por `REPORTES.VER`, consulta GET con sesión y revalidación de permiso, exportación GET `VER+EXPORTAR`, 400 de filtros, 403 de depósito no autorizado, error 500, 503 por guard. `conSnapshotLectura` `REPEATABLE READ READ ONLY` asegura una transacción para consulta, incluyendo el uso de `Promise.all` contra **el mismo cliente** de `leerEntradasReposicion`; no confundir con la pantalla `/reposicion` que usa Pool sin snapshot (REP-D04). Sin SQL de escritura.

## 2. Matriz de cobertura función a función

| Función | Fuente y ubicación | Evaluación estática |
| --- | --- | --- |
| Menú, breadcrumb, permisos | `lib/navigation/menu.ts`, `app/(private)/reportes/layout.tsx`, `page.tsx:100–129` | Acceso exclusivo lectura; botón export condicionada al permiso real |
| API consulta y error | `app/api/reportes/stock-critico/route.ts:8–29`, `cliente-stock-critico.ts:20–37` | Parámetros de sesión, GET, parseo cerrado de filtros y respuesta validada |
| API XLSX/PDF | `.../exportar/route.ts:9–38`, `export-stock-critico.ts:16–94` | Filtro vigente, nueva foto por export, todo el resultado hasta 50.000 filas, permiso EXPORTAR |
| Controles | `page.tsx:23–99,165–225` | Vista PRODUCTO/DEPOSITO, q, depósito, categoría, marca, familia, situación, página y error/reintento; SC-D01/D02 |
| Composición | `stock-critico.ts:65–110`, `reposicion/datos.ts:11–141` | Fuente PROPIO/activos y parámetros; snapshot y empresa; misma entrada del plan operativo |
| Asignación de origen | `reposicion/calculo.ts`, `stock-critico-plan.ts:58–87` | El motor conjunto evita doble transferencia; no recalcular por filtro |
| Crítico/sobrestock | `stock-critico-plan.ts:58–87,108–116` | Separación necesidad vs sobrestock informativo; plan en unidad por producto; no inventa meta |
| Agrupación y totales | `stock-critico-plan.ts:134–169` | Agrupación por productoId con cantidades sumables del mismo producto; `valorReferencia` monetario suma solo estimaciones disponibles; SC-D03/D04 |
| UI de resumen | `page.tsx:131–157,236–284` | 5 KPI y tabla; diferencias de rótulo e información parcial SC-D04/D05 |
| XLSX/PDF | `export-stock-critico.ts:34–94` | 2 vistas, notas, filas y totales, decimal monetario; SC-D03 y SC-D04 |
| Excepciones | `stock-critico.ts:25–33`, `stock-critico-plan.ts:108–126` | ALERTAS por defecto incluye necesidad o sobrestock; filtros aplicados al plan completo |
| Pruebas publicadas | `stock-critico.casos.ts:1–508` | T-C01…C09 prueban motor igual, distribución origen, metas nulas individuales, normalización API, costo monetario, snapshots, XLSX/PDF y permisos; **no** prueba caso mixto meta conocida + desconocida en fila agrupada, ni suma exclusivamente `null` para total monetario, ni diferencias UI/Excel en ese caso |

## 3. Hallazgos abiertos de este reporte (con herencia separada)

### SC-D01 — ALTA, HEREDADA de RPT-D01 — servidor normaliza texto, página conserva búsqueda cruda

**Evidencia:** `stock-critico.ts:49` devuelve `filtros.q=(q??"").trim().slice(0,80)`. `page.tsx:36–43` estabiliza `filtros.q` sin canonizar, `stock-critico-plan.ts:14–17,93–95` exige `datos.filtros.q===aplicados.q`. Buscar `" ABC "` envía un GET válido y servidor consulta `"ABC"`, pero la página puede ocultar respuesta 200 con datos y exportación. **Ya contabilizado como RPT-D01 global; NO recontar.**
**Criterio:** normalización compartida por servidor/cliente/vigencia, manteniendo filtros distinguidos genuinos y error/permiso; pruebas 0, espacios, largo 80/81, 200, XLSX/PDF.

### SC-D02 — MEDIA, HEREDADA de RPT-D02 — resultados/export anteriores siguen vigentes durante los 300 ms antes de nueva búsqueda

**Evidencia:** `page.tsx:36–43,76–84,116–127,131–157`: q digitada y qAplicada divergen durante debounce; `actual` aún asocia datos y permisos del filtro A mientras el texto indica B. La compuerta descarta respuesta iniciada anterior después de la nueva consulta, no evita esta ventana.
**Criterio:** indicar filtro pendiente e invalidar/rotular resultado/export anterior inmediatamente, sin GET por tecla. Tests fake timers 0/100/300ms y B 500. **Ya contabilizado como RPT-D02 global.**

### SC-D03 — MEDIA NUEVA — Excel/PDF pierde advertencia de «sin meta» cuando hay otras metas conocidas en el mismo producto

**Evidencia:** `stock-critico-plan.ts:67–69,134–153` codifica cada destino sin meta como `sugerida=0` con `sinMeta=1`, agrega producto sumando cantidades conocidas y `sinMeta` en paralelo. La pantalla `page.tsx:18–19,261–263` muestra, si `sinMeta>0` y suma>0, `"{cantidad} + {N} sin meta"`. El exportador `export-stock-critico.ts:34–35,49–53` en cambio usa `conMeta=(sinMeta>0 && cantidad===0)?"Sin meta":cantidad`; si cantidad>0, emite solo el número, omitiendo la cantidad de destinos sin meta en la **fila**. `tablaStockCritico` incluye nota general `t.sinMeta`, pero no vincula cuáles productos están incompletos.
**Escenario por inspección:** producto A, destino Norte sugerida 8, destino Sur necesita reposición pero sin meta: vista PRODUCTO pantalla «8 + 1 sin meta» y Excel/PDF muestran «8» en `Cant. sugerida` y «8»/importe parcial según traslado/compra, sin aviso de incompletitud a nivel de producto. El caso histórico T-C03 solo comprueba `sinMeta` único (cantidad 0); T-C04 comprueba varias metas conocidas, no **mixto**.
**Impacto:** el archivo documental puede parecer una sugerencia completa mientras representa solo las metas conocidas; riesgo operativo de decisiones de abastecimiento insuficientes.
**Criterio de aceptación:** al exportar PRODUCTO, incluir «+ N sin meta» o columna dedicada `destinosSinMeta` sin reemplazar valores cuantitativos exactos por texto ambiguo (si Excel debe seguir numérico, columna/nota específica por fila); pantalla y PDF deben conservar la distinción; también reflejar parcialidad de compra/transferencia. Tests con dos destinos mismo producto uno sin meta, otro con meta, y dos productos distintos, ambas vistas y XLSX real/PDF; no inventar cantidad ni modificar el motor común.

### SC-D04 — MEDIA NUEVA — el KPI/total monetario «Valor de referencia» muestra cero cuando ninguna necesidad es valorizable

**Evidencia:** `stock-critico-plan.ts:74,82` produce `valorReferencia:null` si hay necesidad con meta pero falta costo o si falta meta. `totalesCritico:165–168` ejecuta `sumarDecimales(detalles.map(x=>x.valorReferencia))`; `lib/inventario/decimal.ts:31–37` devuelve **texto "0"** cuando todos los valores son `null` o lista vacía. La pantalla `page.tsx:152–155` y `export-stock-critico.ts:67,84–89` muestran ese 0 como `VALOR DE REFERENCIA`/total general (aunque aclaran casos «sin costo» o «sin meta» en notas).
**Caso determinístico:** usuario filtra «ALERTAS» y encuentra solo 3 destinos con necesidades positivas sin `inventario_costos` o sin meta. Cada `fila.valorReferencia=null`, pero KPI y TOTAL GENERAL monetario quedan «0»; no hay base para concluir que reponerlos costaría cero. Otros productos sin necesidad y sin importe tampoco justifican crear falsa precisión.
**Impacto:** presentación financiera incompleta que puede confundirse con estimación total nula. El código no modifica inventario_costos ni inventa costo unitario cero por destino; el hallazgo es la semántica del agregado.
**Criterio:** distinguir «Sin estimación» o «Importe parcial» cuando `necesitan>0` y `sinCosto+sinMeta>0`; si hay importes conocidos, indicar cobertura de la estimación, conservando suma numérica de porción conocida por separado. No comparar como cierre contable; filtros situación TODAS/sin alertas deben aclarar 0 legítimo. Tests sin costos, sin metas, mezcla, solo sobrestock/OK, importe real cero con costo válido y Excel/PDF.

### SC-D05 — BAJA NUEVA — rótulo «Disponible» no delimita que la vista PRODUCTO suma únicamente destinos del plan

**Evidencia:** `stock-critico-plan.ts:134–149` suma `disponible` solo de las posiciones reales que llegaron a `filtrados` (pueden ser menos que el total físico de la empresa o del alcance), mientras `page.tsx:241–258` etiqueta la columna **«Disponible»** para ambas vistas. El exportador ya distingue `export-stock-critico.ts:45`: PRODUCTO → `Disponible (destinos)`. `types/reportes.ts:404–406` también define la misma restricción.
**Impacto:** lector interpreta stock disponible total del producto cuando visualiza exclusivamente destinos del filtro/situación o del plan. No es error aritmético ni exposición indebida; el rótulo no describe el denominador.
**Criterio:** vista PRODUCTO usa «Disponible (destinos)» y ayuda contextual breve; DEPOSITO conserva «Disponible». Probar 3 depósitos, solo 1 destino en estado ALERTAS; contrastar suma del producto en Stock general; archivo/tabla consistentes.

**Recuento de este reporte:** **1 ALTA heredada + 2 MEDIAS (1 heredada + 2 nuevas = 3 MEDIAS) + 1 BAJA nueva**. Al global del módulo solo se agregan **+2 MEDIAS y +1 BAJA**; después de Stock general, Valorización, Kardex y Stock crítico, el acumulado es **2 ALTAS + 7 MEDIAS + 3 BAJAS**, sin multiplicar los hallazgos transversales RPT-D01/D02.

## 4. Decisiones/observaciones no probadas (no mezclar con defectos)

- **SC-O01 — reporte documental vs planificación local:** `Inventario → Reposición` puede simular cantidades en cliente; Stock crítico es foto del plan **base**, no de simulaciones ni promesas operativas, y reutiliza motor de asignación. No esperar igualdad con simulación ni con fotos en tiempos distintos.
- **SC-O02 — consolidado sin depósito:** producto cuya política es solo global genera fila real `CONSOLIDADO`. Con filtro de un depósito concreto, el informe intencionalmente excluye ese global (`filtrarDetalles`), incluso si tiene saldo físico allí; es contrato T-C04. Explicar en UX si usuario cree que no hay alerta. No reescribir esa regla sin decisión explícita.
- **SC-O03 — alcance/catálogo:** `leerEntradasReposicion` carga productos activos de la empresa y limita saldos a depósitos activos permitidos, con `alcanceParcial`. Catálogo global puede generar «Sin stock» dentro del recorte aunque haya saldo fuera del alcance (mismo tema STK-D01). No afirmar fuga de saldos ni etiquetar bug adicional sin política definida.
- **SC-O04 — moneda/costos:** `inventario_costos` es solo referencia por destino/producto; no necesariamente coincide con costo de compra futura/lead time/proveedor. `costoUnitario` divide decimal exacto de cantidades valorizadas, sin costes inventados. No generar una valoración patrimonial desde este menú.
- **SC-O05 — escala:** cálculo de `calcularPlanReposicion` en servidor/lectura de producto completo antes de filtrar, bajo snapshot: 50.000 limita salida pero no costo CPU/memoria intermediaria; medir antes de proponer paginar fuentes/romper prioridad de origen compartido.
- **SC-O06 — parámetros de cantidad:** `leerEntradasReposicion` usa `::float8` para unidades de stock (heredado del motor), no para importe; se redondea a 4 decimales. No reclamar precisión exacta física sin reproducir o decidir contrato de cantidad operacional, preservando `numeric::text` en dinero.
- **SC-O07 — seguridad de sucursal:** criterio de alcance de depósitos TODOS/ASIGNADOS no intersecta sucursal explícitamente; tema transversal de Depósitos/Reposición, decidir política antes de clasificar IDOR. El GET rechaza depositoId fuera de deps con 403.
- **SC-O08 — precios y nulidad:** incluso con costo de referencia real, costos/depositos con cantidad valorizada cero retornan null. Un importe monetario residual sin cantidad podría afectar promedio del producto si se suma en fallback; exige análisis cruzado con Valorización, no declarar doble conteo automáticamente.
- **SC-O09 — estado real/visual:** lectura de GitHub no prueba migraciones/grants reales ni capturas a 1440/1920, ni descarga real en Excel/lector PDF. No fingir homologación.

## 5. Matriz de pruebas focales futuras (no ejecutadas)

| ID | Escenario y aceptación |
| --- | --- |
| SC-R01-T01 | Producto con destino sin stock (0), bajo mínimo y en punto: alertas/gatillo/meta exactas vs `calcularPlanReposicion` |
| SC-R01-T02 | 3 destinos/1 origen, prioridad: suma transferencias ≤ excedente transferible y remanente a compra |
| SC-R01-T03 | Global producto + parámetros por depósito: solo planes efectivos, consolidado marcado referencia, no duplica monto/compra |
| SC-R01-T04 | Sin máximo/cantidad (sin meta) y otro destino con meta 8 del **mismo producto**: UI "8 + 1 sin meta" y Excel/PDF señalan incompletitud sin falsear cantidades |
| SC-R01-T05 | 3 necesidades sin costo, otras con costo y sin meta: KPI Valor de referencia distingue sin estimación/parcial de verdadero cero |
| SC-R01-T06 | Vista PRODUCTO con 3 depósitos, solo 1 en ALERTAS: `Disponible (destinos)` no equivale a disponibilidad global, UI/export consistentes |
| SC-R01-T07 | Stock propio, terceros, reservado/cuarentena/tránsito; sobrestock físico informativo separado de reposición por disponible |
| SC-R01-T08 | Filtros q con espacios final/inicial, solo espacios, longitud 80/81, debounce de 300 ms, GET fuera de orden y export bloqueada |
| SC-R01-T09 | Costo `inventario_costos` depósito/por producto, sin costo, cantidad cero, costo numérico cero válido, moneda base y exactitud decimal |
| SC-R01-T10 | REPORTES.VER-only consulta; VER+EXPORTAR XLSX/PDF; 401/403/400/503; UUID fuera de empresa/depósito |
| SC-R01-T11 | Paginación 50, 50.000/50.001 filas de vista, filtros combinados antes/después del plan, totales sobre filtro completo |
| SC-R01-T12 | Snapshot real de 1 solicitud con movimiento y edición de mínimos concurrentes; costo/recomendación consistentes y fuente única |
| SC-R01-T13 | Comparar Reportes → Stock crítico contra Inventario → Reposición sobre el MISMO corte/alcance y sin simulación; sin modificar Stock |
| SC-R01-T14 | Excel y PDF en PRODUCTO/DEPOSITO, textos y totales, no mezcla unidades heterogéneas, estado sin meta conocido/desconocido |
| SC-R01-T15 | UI desktop 1440/1920 real, truncamientos, filtros, tabla horizontal, warnings visibles, fecha/moneda y alertas accesibles |

## 6. Veredicto

**Reporte 4 auditado por función — NO HOMOLOGADO.** Los hallazgos SC-D01/D02 son heredados de la revisión transversal. **Nuevos exclusivos:** SC-D03 (MEDIA, información sin meta parcial desaparece del renglón Excel/PDF), SC-D04 (MEDIA, total de dinero sin estimación se muestra como 0), SC-D05 (BAJA, rótulo de Disponible no especifica destinos en la pantalla). **No se encontró una nueva ruptura probada del motor compartido ni de la asignación de orígenes**; los tests históricos T-C01…C09 y aceptaciones R06/R07/R08 permanecen documentados, pero no ejecutados en esta sesión. Sin código funcional, migrations, VM o instrucciones Claude. **Siguiente reporte individual a solicitud: Lotes y vencimientos (5/5).**
