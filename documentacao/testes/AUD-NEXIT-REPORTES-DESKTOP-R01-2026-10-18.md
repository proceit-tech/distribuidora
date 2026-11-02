# AUD-NEXIT-REPORTES-DESKTOP-R01 — auditoría integral estática de Reportes (18/10/2026)

**Alcance de la ronda:** módulo `Reportes` completo: el índice `/reportes` y los cinco reportes obligatorios: `/reportes/stock-general`, `/reportes/valorizacion`, `/reportes/kardex`, `/reportes/stock-critico`, `/reportes/lotes`. **ERP exclusivamente desktop**. Rama `feature/NEXIT-2026-001-banco-demo`.
**Estado:** DIAGNÓSTICO DOCUMENTADO CON HALLAZGOS ABIERTOS — NO HOMOLOGADO. Claude NO tiene orden de corregir esta ronda.
**Método:** lectura de protocolos actuales `CLAUDE.md` y `documentacao/PROTOCOLO-IA.md`, progreso, menú, alcance V1 aprobado, fuente integrada `AUD-REPORTES-INTEGRADA-V1-2026-10-13.md` hasta R20, fuentes canónicas de Kardex y Lotes, páginas completas, layouts, los 5 GET y 5 GET /exportar, helpers cliente/filtros/validación, las 5 fuentes SQL de lectura, snapshot/alcance, helpers de planificación y suites existentes. **Solo GitHub**: cero ejecuciones de pruebas, TypeScript, lint, build, HTTP autenticado, Excel/PDF externos, PostgreSQL, VM, Docker o navegador; cero capturas reales. Cada línea citada corresponde a los blobs actuales listados más abajo (no es prueba de HEAD desplegado).

## 1. Inventario de menús, fuentes y protección

| Menú | Páginas/API y motor | Reglas cotejadas con el contrato |
| --- | --- | --- |
| Reportes operativos | `app/(private)/reportes/page.tsx` (48 líneas), `layout.tsx` | Índice, no sexto informe; `REPORTES.VER` protege todas las subrutas. Menú usa igual permiso. |
| Stock general | `app/(private)/reportes/stock-general/page.tsx` (336), `app/api/reportes/stock-general/{route,exportar/route}.ts`, `lib/reportes/{stock-general,stock-general-plan,cliente-stock-general,export-stock-general}.ts` | `numeric::text`, stock propio por estados/terceros, lote, unidad, depósito activo/inactivo autorizado, clasificador de Stock, foto `REPEATABLE READ`, Excel/PDF. `RPT-R10-01` corregido en auditoría previa, NO reabrirlo. |
| Valorización | `app/(private)/reportes/valorizacion/page.tsx` (334), dos API GET, `lib/reportes/{valorizacion,valorizacion-cobertura,cliente-valorizacion,export-valorizacion}.ts` | `inventario_costos` como único costo, valoración exacta, cobertura por pareja producto×depósito antes de agrupar, sin costo medio general de unidades diferentes, totales/snapshot/exportación. RPT-V01…V06 y R07 aceptados en historial; no se detectó regresión de dichos arreglos. |
| Kardex | `app/(private)/reportes/kardex/page.tsx` (423), dos API GET, `lib/reportes/{kardex,kardex-plan,cliente-kardex,export-kardex}.ts` | Libro por fecha de registro, estado/propiedad/propietario/lote, entradas/salidas/anulaciones, saldos acumulados, conciliación, unidad histórica por UUID si NEX-052 existe, Excel/PDF largo. R01–R05 anteriores con aceptación estática preservada. |
| Stock crítico y reposición | `app/(private)/reportes/stock-critico/page.tsx` (314), dos API GET, `lib/reportes/{stock-critico,stock-critico-plan,cliente-stock-critico,export-stock-critico}.ts` | Mismo `calcularPlanReposicion` que Inventario → Reposición, sobre dataset íntegro antes de filtrar, sin segundo motor, reporta sugerencia/costo de referencia, no crea compra/movimiento. `conSnapshotLectura` fija fuente para la respuesta. |
| Lotes y vencimientos | `app/(private)/reportes/lotes/page.tsx` (364), dos API GET, `lib/reportes/{lotes,lotes-plan,cliente-lotes,export-lotes}.ts` | Stock real por lote y depósito; fechas Paraguay, estados vencido/próximo/vigente/sin fecha, `numeric::text` por UUID de unidad, existencia global del lote sobre alcance, huérfanos solo `TODOS`, horizonte válido, fecha invalida bloquea la consulta. `LOT-R02-01/02` resueltos en R03 previo. |

**Verificado en código:** todas las APIs de reporte GET utilizan `autorizarReporte(["VER"])`; todas las exportaciones `autorizarReporte(["VER","EXPORTAR"])` y vuelven a ejecutar el servicio con empresa/usuario de sesión. `lib/reportes/guard.ts` maneja 401/403/503. El límite de exportación es 50.000 filas por informe; las descargas generan una foto propia distinta de la respuesta anterior, por diseño. `conSnapshotLectura` hace una sola conexión `REPEATABLE READ READ ONLY` en cinco servicios. `REPORTES.VER` y `REPORTES.EXPORTAR` no se confunden. Sin operaciones de escritura de stock en Reportes.

## 2. Hallazgos NUEVOS (transversales, sin duplicarlos cinco veces)

### RPT-D01 — ALTA — la normalización de filtros por el servidor invalida respuestas válidas en los cinco reportes

**Evidencia origen (API, texto de búsqueda):**
- `lib/reportes/stock-general.ts:50–51`: `q` y `lote` se convierten con `.trim().slice(0,80/40)`.
- `lib/reportes/valorizacion.ts:55`: `q` se convierte con `.trim().slice(0,80)`.
- `lib/reportes/kardex.ts:70–71`: `q`, `documento` y `lote` se convierten con `.trim().slice(0,80/60/40)`.
- `lib/reportes/stock-critico.ts:49`: `q` se convierte con `.trim().slice(0,80)`.
- `lib/reportes/lotes.ts:76`: `q` y `lote` se convierten con `.trim().slice(0,80/40)`.

**Evidencia destino (React):** las cinco páginas mantienen texto digitado sin esa normalización en `filtros.q`/`filtros.lote` y sus versiones debounce; calculan `actual` comparando por igualdad estricta `datos.filtros` vs `aplicados` o `consulta.filtros`, usando respectivamente `respuestaStockGeneralVigente`, `respuestaValorizacionVigente`, `respuestaKardexVigente`, `respuestaVigente` y `respuestaLotesVigente`. La API retorna `filtros` ya normalizados, por lo que no satisfacen esa igualdad aunque la respuesta sea HTTP 200, válida y con datos.

**Caso concreto derivado directamente del código:** operador busca `ABC ` (con espacio al final). Cliente solicita `q=ABC%20`; servidor ejecuta `q="ABC"` y retorna `filtros.q="ABC"`; frontend compara con `aplicados.q="ABC "` y asigna `actual=null`. Resultado visible: el reporte queda sin datos y sin exportación pese a que la API produjo datos correctos. Ocurre también con espacios iniciales en búsqueda/documento/lote y textos largos que el servidor trunca (aunque otros campos sean válidos). **La causa está demostrada por inspección del contrato; el síntoma NO se comprobó en navegador.**

**Riesgo:** indisponibilidad funcional reproducible de los cinco reportes para entradas ordinarias, con posible confusión de «Sin datos» pese a que sí existen. No filtra datos de empresa ajena ni supone SQL erróneo.

**Criterio de aceptación:** definir una sola normalización pura por campo compartida entre captura, consulta y comparación (preferentemente canonizar al aplicar la búsqueda y mantener claridad sobre lo escrito); no retirar la guarda de «respuesta vigente». Tests con `" ABC "`, `"ABC "`, valor vacío/solo espacios, límite +1 y exportación que usa exactamente la consulta vigente; probar todos los cinco clientes/páginas. Mantener la validación de 401/403/500/malformado y el bloqueo de respuestas de consultas antiguas.

### RPT-D02 — MEDIA — una búsqueda digitada aún no estabilizada deja datos/exportación de filtro anterior como si fueran actuales

**Evidencia:** `app/(private)/reportes/stock-general/page.tsx:41–48,81–89`, `valorizacion/page.tsx:33–40,74–82`, `kardex/page.tsx:36–43,77–85`, `stock-critico/page.tsx:36–43,76–84`: los filtros de búsqueda se estabilizan en `useEffect` con `setTimeout(...,300)`; la guarda compara respuestas con `aplicados` ya estabilizados, NO con el texto `filtros.q`/`documento`/`lote` que el operador acaba de cambiar. `lotes/page.tsx:42–57,98–106` usa un controlador correcto para horizonte inválido, pero conserva `qEst/loteEst` anteriores durante debounce (solo valida horizonte vivo, no texto vivo).
**Caso:** con el reporte A y autorización EXPORTAR, usuario comienza una búsqueda B; antes de los 300 ms, la pantalla puede seguir mostrando y permitiendo exportar el reporte A porque `datos.filtros` iguala a `aplicados` anterior. La compuerta invalida respuestas de solicitudes reemplazadas DESPUÉS de iniciar consulta B, pero no protege el intervalo previo a esa iniciación.
**Criterio:** al primer carácter nuevo, señalar filtros «pendientes de aplicar» e invalidar presentación/exportación correspondiente hasta la respuesta B, sin lanzar HTTP en cada tecla ni perder selección de filtros. Para Lotes preservar el veto de horizonte/fecha inválidos; no reabrir LOT-R02-02 como si hubiese fallado. Probar 0 ms/100 ms/300 ms, respuesta A tardía, B con 500, datos anteriores y botones de exportación; revisar también los indicadores y totales financieros de Valorización.

### RPT-D03 — BAJA — descripción del índice incompleta para Stock crítico

**Evidencia:** `app/(private)/reportes/page.tsx:9` describe Stock crítico como «Productos sin stock o bajo el mínimo y cantidad sugerida a reponer». El reporte contempla también `EN_PUNTO` con stock por encima del mínimo pero dentro del punto de reposición, conforme `lib/reposicion/calculo.ts` y la ayuda de Inventario → Reposición.
**Impacto:** mensaje del índice puede inducir a creer que solo se contemplan faltantes bajo mínimo; el vínculo y el cálculo no están rotos.
**Criterio:** incluir `En punto de reposición` en la descripción sintética, sin duplicar planeador ni alterar cálculo.

**Resumen de hallazgos:** **1 ALTA, 1 MEDIA y 1 BAJA** contabilizados una sola vez a nivel de módulo, aunque D01/D02 atraviesen los 5 reportes.

## 3. Revisión individual (conservación y regresiones dirigidas)

### 3.1 Reportes operativos — /reportes
Índice de cinco tarjetas activas más menú lateral de seis enlaces: pantalla `page.tsx:5–47` y navegación `lib/navigation/menu.ts:260–304`. No se encontró una sexta lógica ni un bypass de permiso: el layout REPORTES.VER protege. **D03** es la única nueva divergencia textual. La duplicidad «Reportes operativos» en sidebar + tarjeta/index es una decisión UX ya documentada `RPT-N01`, NO defecto técnico confirmado.

### 3.2 Stock general
Modelo correcto preservado: cantidades propias/terceros y estados separados, `PRODUCTO` y `DETALLE`, parámetros de depósito y consolidado, stock histórico de depósitos inactivos autorizados, filtro de lote que NO reemplaza el saldo completo para clasificar la situación, `numeric::text` y totales por unidad, instantánea consistente. **D01/D02** afectan búsqueda de producto y lote; no se confirma regresión de RPT-R10-01.
**Condición de negocio a vigilar:** `lib/reportes/stock-general.ts:114–125` incluye productos activos de la empresa aun sin saldo autorizado; al filtrar por depósito puede dar «Sin stock» aunque haya en otro no autorizado. La política de catálogo global/alcance ya está planteada en `STK-D01`: no es prueba de exposición de saldos ajenos. Requiere definición transversal, no cambiar `WHERE` unilateralmente.

### 3.3 Valorización de inventario
Modelo correcto preservado: dinero de `inventario_costos`, propio solamente, snapshot, cobertura de costo por producto×depósito clasificada antes de agregar, sin promedio de unidades heterogéneas, `numeric::text` e información de moneda. **D01/D02** alcanzan filtro de búsqueda y pueden confundir importes visibles por unos instantes; ninguna moneda inventada ni filtración de otra empresa comprobada. Se mantienen requisitos de revisión humana de costo y precisión/exportación.

### 3.4 Kardex de movimientos
Modelo correcto preservado: libro acumulado desde origen histórico, intervalos por registro, transferencia y anulación sin doble saldo neto, propiedades/propietarios, UUID de unidad y ventana de cambios NEX-052 cuando presente, `REPEATABLE READ`, exportación PDF/XLSX y conciliación. **D01/D02** afectan búsqueda, referencia/documento y lote. No se reabre KDX-R01…R05 aceptado estáticamente. La existencia real de `producto_unidad_base_historial` en la VM no fue verificada.

### 3.5 Stock crítico y reposición
Modelo correcto preservado: reporte de excepciones/exportación, misma función `calcularPlanReposicion` aplicada al conjunto completo antes de filtrar o agrupar; déficit y compra residual sin duplicar asignación de origen en plan base; costos de referencia diferenciados de Valorización. **D01/D02** afectan búsqueda y exportación. No inferir igualdad de fotografías entre este servicio, que usa snapshot, y la pantalla operacional `/reposicion`, que realiza lecturas independientes (observación REP-D04).

### 3.6 Lotes y vencimientos
Modelo correcto preservado: cuatro clases según `America/Asuncion`, unidades UUID sin sumar cantidades incompatibles, huérfanos solo alcance TODOS, existencia del lote como total, validación de horizonte/fechas, `numeric::text` y snapshot único. **D01/D02** afectan los textos `q`/`lote` estabilizados; `planificarConsulta` previene consultas con horizonte inválido, pero no equivale a vigencia de la búsqueda digitada aún no estabilizada. Sin regresión identificada en LOT-R02-01/02 por lectura.

## 4. Observaciones transversales no probadas en el ambiente real

- **RPT-O01 — privacidad/alcan­ce:** validación multiempresa y depósito está parametrizada en SQL; cotejar roles reales, empresa 1/2 y alcance de sucursal/depósito en la VM antes de homologar. No declarar una fuga a partir de diferencias de catálogo.
- **RPT-O02 — exportaciones:** los cinco endpoints vuelven a consultar y generan nuevos snapshots; archivo ≠ GET previo si hay operación concurrente, por diseño. Validar XLSX/PDF y no comparar distintos instantes como divergencia material.
- **RPT-O03 — fechas/unidades:** Kardex depende de presencia y datos de NEX-052 para unidad histórica; no asumir schema aplicado. Lotes usa reloj Paraguay. Probar casos reales específicos.
- **RPT-O04 — volumen:** generación simultánea de reportes, límites 50.000 y formateo PDF en 1000+ páginas no se midieron; no declarar lentitud sin pruebas.
- **RPT-O05 — formatos de exportación:** cliente revoca el object URL inmediatamente tras `a.click()`; comportamiento exacto de descarga entre navegadores no se ensayó, no declararlo bug sin caso real.
- **RPT-O06 — coherencia funcional:** el reporte Stock crítico y el plan operacional comparten reglas, pero la simulación local de Inventario → Reposición y el resultado filtrado de Reportes tienen alcances/instantes diferentes. Documentar la distinción, no igualar todo a un número global.
- **RPT-O07 — entorno:** el GitHub no prueba la versión desplegada ni los permisos `REPORTES.VER/EXPORTAR` efectivamente aplicados. Ninguna consulta a la VM o al ledger real se hizo en esta revisión.

## 5. Matriz de pruebas, para la fase posterior a la auditoría integral

| Caso | Reportes/condiciones | Aceptación |
| --- | --- | --- |
| RPT-T21 | Los cinco: `q=' ABC '`, 80/81 caracteres | API 200 y datos de consulta canónica realmente visibles; exportar de la misma consulta |
| RPT-T22 | Stock general/Kardex/Lotes: `lote='L1 '`; Kardex documento con espacios | Lo normalizado no produce reporte en blanco artificial; sin falsos estados vacíos |
| RPT-T23 | Los cinco: escribir B sobre A con tecla en t=0 y esperar 300 ms | A queda marcado obsoleto y no se exporta como B; respuesta tardía A descartada |
| RPT-T24 | Los cinco: después de B, error HTTP/red/401/403/500 | Sin datos ni exportaciones aparentando resultado B; filtros conservados, retry recuperable |
| RPT-T25 | Stock general + Stock operativo | Producto con stock fuera de alcance y sin saldo autorizado: catálogo y etiqueta según política definitiva |
| RPT-T26 | Valorización | Costo físico/valor/totales en snapshot propio, fracciones, múltiples unidades y cobertura parcial |
| RPT-T27 | Kardex | Movimiento/anulación/transferencia, unidad histórica de dos UUID homónimos, largo de PDF y conciliación en mismo corte |
| RPT-T28 | Stock crítico + Reposición | Mismo producto/deposito, meta por depósito y origen compartido; comparar foto/alcance equivalente sin duplicar |
| RPT-T29 | Lotes | Vencido/hoy/próximo/sin fecha, lote 0+positivo por depósitos, GTIN alternativo, huérfano bajo perfiles |
| RPT-T30 | Exportaciones | 5 Excel + 5 PDF con filtro, unidad, moneda y paginación; control `REPORTES.EXPORTAR`, 403/413 |
| RPT-T31 | Navegador desktop real | Capturas de 1440px/1920px, filtros/orden/foco, scroll de tabla, botones, sin datos sensibles |
| RPT-T32 | Preflight del único entorno operativo | Commit efectivamente publicado, schema_migrations, grants reales, DEMO_MODE, backup y evidencia del operador sin ejecutar deploy por la IA |

**Resultado:** 6 entradas revisadas (índice + cinco reportes), 1 ALTA, 1 MEDIA, 1 BAJA transversal. No se infiere nueva homologación. Los cinco aceites estáticos **históricos** existían; esta ronda detectó nuevas brechas de UI que requieren cierre futuro, sin desacreditar automáticamente los motores SQL previamente aceptados. **Ningún cambio funcional autorizado a Claude; solo documentación.** Próxima revisión según orden que indique el responsable.
