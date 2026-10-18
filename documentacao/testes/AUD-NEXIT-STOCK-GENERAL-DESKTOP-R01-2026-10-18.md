# AUD-NEXIT-STOCK-GENERAL-DESKTOP-R01 — Revisión funcional independiente de Stock general

**Fecha:** 18/10/2026. **Menú:** Reportes → Stock general. **Ruta:** `/reportes/stock-general`. **Branch:** `feature/NEXIT-2026-001-banco-demo`.
**Estado:** AUDITORÍA ESTÁTICA DOCUMENTADA CON HALLAZGOS ABIERTOS; NO HOMOLOGADO. NO se autorizan correcciones a Claude ni cambios funcionales, SQL o migrations en esta etapa.
**Metodología:** revisión integral de `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, alcance aprobado `REPORTES-V1-ALCANCE-APROBADO.md`, auditorías integradas R09–R11, R19/R20, nueva revisión transversal RPT-D01/D02, fuente principal, funciones puras, página (336 líneas), GET, GET exportar, cliente HTTP, exportador, permisos/alcance/snapshot, tipo API, schema de unidades NEX-003 y suite local `stock-general.casos.ts` (468 líneas). **Solo lectura en GitHub:** 0 pruebas ejecutadas, sin request autenticado, PostgreSQL, VM, navegador, build, lint, tsc ni generación/verificación independiente de XLSX/PDF. Aceptaciones anteriores = históricas/estáticas, no pruebas reales de hoy.
**Corte de blobs de evidencia:** `stock-general.ts f494c956db9478e14f49f94f51299d77f9bfd9e7`, `stock-general-plan.ts` y pantalla/API según branch a 18/10; no confundir blob con commit HEAD implantado.

## 1. Función comercial y exclusiones — lectura estrictamente cuantitativa

**Pregunta que responde:** «¿Cuánto stock existe, de qué producto, en qué depósito y en qué lote; cuánto está disponible, reservado, en cuarentena o en tránsito, y cuánto es de terceros?»

**Uso esperado:** consulta analítica y documental de cantidades existentes, filtros avanzados y exportación que abarca todas las filas de la consulta (no solo la página visible). No registra movimientos, no ajusta saldos, no mantiene catálogo de productos, no calcula reposición ni valoración/costo/venta. `Inventario → Stock` es consulta operativa; `Reportes → Stock general` es reporte cuantitativo/descargable. `Inventario → Movimientos` es única fuente de efectos físicos; `Productos` define parámetros y unidad; `Depósitos` define accesos; `Valorización` es el dueño de costos, no Stock general.

**Definiciones funcionales comprobadas:**
- DISPONIBLE: cantidad PROPIA vendible; RESERVADO: apartado; CUARENTENA: no vendible; TRANSITO: no confirmado.
- `físico propio = disponible + reservado + cuarentena`; `virtual propio = físico propio + tránsito`. Los TERCEROS, en cualquier estado, se muestran en columnas propias separadas; jamás se suman a cantidades propias.
- Estado `SIN_STOCK` si disponible propio ≤ 0; `BAJO` si disponible es menor al mínimo positivo; `SOBRESTOCK` si físico supera máximo positivo; caso restante `NORMAL`. Clasificación de Stock, no planificación del punto de reposición.
- «Sin stock» en **filtro existencia** equivale a nada propio, incluido tránsito, ni de terceros en el recorte; es un concepto distinto de `SIN_STOCK` de la situación (disponible propio cero).
- Parámetros consolidados del **producto** si no se selecciona depósito; parámetros del **producto×depósito** si se elige depósito; si no hay configuración de depósito, no inventar mínimo ni máximo.
- Vista `PRODUCTO`: una fila agregada por producto. Vista `DETALLE`: una fila por producto×depósito×lote con saldo, o fila «sin saldo» honesta sin inventar ubicación/lote. Nunca sumar fila agregada y detalle juntos.
- La clasificación se calcula sobre TODO el saldo propio autorizado del ámbito, incluso si filtro de lote muestra solo parte de él; cantidad mostrada y totales por unidad sí corresponden al lote elegido.
- Los depósitos históricos **inactivos autorizados** permanecen disponibles en las consultas y se rotulan; los productos activos con stock controlado se listan aunque no tengan saldo autorizado, bajo la política transversal debatida en STK-D01. No presumir global empresarial cuando el usuario ve un recorte.
- Un informe es fotografía actual, no fecha histórica; la salida XLSX/PDF hace una **nueva consulta/snapshot**, no es materialización de la pantalla anterior.

## 2. Matriz de funciones: pantalla → fuente → cálculo → verificación

| Área / campo | Página / función | Fuente y criterio real | Resultado estático |
| --- | --- | --- | --- |
| Ruta/permiso | `lib/navigation/menu.ts`, `app/(private)/reportes/layout.tsx` | Menú + layout requieren `REPORTES.VER` | Guardada en código |
| GET | `app/api/reportes/stock-general/route.ts:8–29` | `autorizarReporte(["VER"])`, empresa/usuario de sesión, `leerStockGeneral` | No acepta tenant/usuario arbitrario de la URL |
| Excel/PDF | `.../exportar/route.ts:9–38` | `VER+EXPORTAR`; `formato=xlsx/pdf`, `todas=true` | Protegido en servidor; límite 50.000 |
| Alcance | `lib/reportes/alcance.ts:9–20` | `usuarios.alcance_depositos` + `usuario_deposito`, `empresa_id`, activos e inactivos | Alcance aplicado a `stock_saldos` |
| Snapshot | `lib/reportes/snapshot.ts:12–35` | Transacción `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, cliente único, commit/rollback/release | Código preserva consistencia de una solicitud |
| Producto | `stock-general.ts:107–126` | `productos` con `controla_stock`; código/inventario/GTIN principal, descripción, categoría/marca/familia/línea, unidad | Columnas pactadas presentes |
| Cantidades | `stock-general.ts:68–76,106–126,146–180`, `stock-general-plan.ts:35–44,86–100` | `stock_saldos` PROPIO/TERCERO, estados, `stock_lotes` para lote/vencimiento | No agrega costo; textos decimal exacto |
| Producto × depósito | `stock-general.ts:103–125` | `producto_deposito_configuracion` únicamente en filtro depósito | Política Stock preservada |
| Buscar | `stock-general.ts:30–57,95–102`; `page.tsx:180–189,243–246` | `q` ILIKE código/descr./cód. inventario/GTIN; lote por código; texto acotado por API | **SG-D01 heredado RPT-D01** |
| Filtrar | `page.tsx:191–253`; `stock-general-plan.ts:51–59` | vista, depósito, categoría, marca, familia, situación, existencia y lote | Correctos en modelo; prueba humana pendiente |
| Estado/indicadores | `page.tsx:135–178`; `stock-general-plan.ts:61–76` | productos, sin saldo, sin stock/bajo/sobrestock, tabla por unidad | **SG-D03 nuevo: identidad de unidad por nombre** |
| Tabla | `page.tsx:264–306`; `stock-general-plan.ts:79–100` | columnas compactas desktop, detalle según vista, stock tercero separado, total general no aditivo | Estructura correcta en lectura |
| Paginación | `page.tsx:97–100,318–327`; API tamaño 50, servidor 10–200, offset | Cantidad total de filas según vista | Carga protegida en código, no probada en navegador |
| Estados carga/error | `page.tsx:29–95,255–263,309–316`, `cliente-stock-general.ts:20–37` | GET invalidado en cambio de filtros, última respuesta iniciada; ante HTTP error `datos=null`, preserva catálogo de nombres | **SG-D02 heredado RPT-D02** |
| Respuesta JSON | `stock-general-plan.ts:103–143` | Forma básica requerida, decimal como texto, permissions.exportar boolean, catálogos bien formados | Validación estructural existente |
| Exportar | `export-stock-general.ts:18–99` | Mismas vistas/filtros, cantidad como texto numeric, encabezados/empresa/hora y notas por unidad, sin suma monetaria | Motor preservado, pero nota por unidad presenta SG-D03 |

## 3. Hallazgos abiertos en ESTE menú

### SG-D01 — ALTA (transversal RPT-D01; no volver a contar como nuevo del módulo) — respuesta API correcta se oculta con texto no canonizado

**Evidencia:** `stock-general.ts:50–51` aplica `.trim().slice(0,80/40)` a `q`/`lote`; `page.tsx:41–48,81–83` pasa `filtros.q`/`lote` sin normalizar después del debounce; `stock-general-plan.ts:104–109` compara textualmente esos campos con `datos.filtros` devueltos por API. `cliente-stock-general.ts:12–34` serializa el valor crudo.

**Escenario determinístico:** buscar `"ABC "` → GET envia la cadena con espacio; API consulta `"ABC"` y responde `filtros.q="ABC"`; cliente espera `"ABC "`; `actual=null`, no visualiza filas y no permite exportar pese a HTTP 200 válido. También filtro `lote`, largo >80/40 y espacios iniciales/solos.

**Impacto:** falso vacío del reporte con consulta válida; alcance es UI, no se constató fuga de datos.

**Criterio:** normalización idéntica en cliente/servidor/igualdad sin retirar compuerta ni aceptar respuestas de filtros genuinamente antiguos. Probar `" ABC "`, espacios solos, truncamiento, q+lote y exportación. **Reutilizar el achado transversal existente RPT-D01, no duplicar tarea.**

### SG-D02 — MEDIA (transversal RPT-D02) — mientras se digita nuevo filtro, datos previos aún son actuales durante debounce

**Evidencia:** `page.tsx:41–48` retrasa `qAplicada/loteAplicada` 300 ms; `actual` en `:81–83` compara contra aplicados de la consulta anterior, mientras `filtros.q` y `filtros.lote` ya contienen valores nuevos. Botones `:122–128` quedan presentes con `actual?.permisos.exportar` previo.

**Escenario:** consulta A visible y exportable; comenzar a escribir B; hasta que el debounce estabilice los textos, tabla/indicadores/Excel/PDF continúan operando con A, sin avisar que B aún no se aplicó. La compuerta `:50–74` descarta respuestas tardías después de iniciar B, no esta ventana.

**Criterio:** marcar búsqueda pendiente inmediatamente, bloquear o rotular adecuadamente resultado/exportación A antes de solicitud B, conservar debounce y selector de filtros, no dar HTTP por cada tecla. Probar con fake timers a 0/100/300ms, cambios de q y lote y error B. **Achado único transversal RPT-D02 en el módulo.**

### SG-D03 — ALTA NUEVA — «Resumen por unidad» suma identificadores de unidades distintas que comparten el mismo nombre

**Evidencia del contrato físico:**
- `documentacao/banco/nexit/v1/migraciones/NEX-003-catalogos-globales.sql:65–75`: `unidades_medida.id` UUID PK y `codigo` UNIQUE, **ninguna restricción UNIQUE(nombre)**; se permiten dos unidades distintas con descripción igual.
- `lib/reportes/stock-general.ts:107–125`: consulta solo `coalesce(um.nombre,'') AS unidad`, no transporta `um.id AS unidad_id`.
- `lib/reportes/stock-general-plan.ts:10–20,61–71`: `ProductoAgregado` solo trae `unidad` y `totalesStockGeneral` usa `Map<string, ProductoCalculado[]>` con clave `p.unidad`.
- `types/reportes.ts:49–60`: `StockGeneralUnidad` no tiene `unidadId`.
- `app/(private)/reportes/stock-general/page.tsx:154–175`: «Resumen por unidad de medida» itera `t.porUnidad` y muestra sumas combinadas.
- `lib/reportes/export-stock-general.ts:73–77,90–98`: `resumenPorUnidad` exporta la misma suma en notas de XLSX/PDF.
- `lib/reportes/stock-general.casos.ts`: casos para unidades con **nombres distintos** y cantidad exacta, no demuestra rechazo de dos UUID con igual nombre. Kardex corrigió este patrón en `RPT-KDX-R03-01/R05`; Lotes ya transporta UUID.

**Escenario explicativo:** producto P1 en unidad ID=A, código=CAJA-1, nombre «Caja», disponible 4; producto P2 en unidad ID=B, código=CAJA-2, nombre «Caja», disponible 7. Aunque sus unidades físicas pueden representar cantidades distintas, el resumen actual crea UN grupo «Caja», productos=2, disponible=11, omitiendo la distinción. Lo mismo pasa en las notas Excel/PDF. **Defecto cierto del algoritmo para un estado permitido por schema; no se verificó presencia de datos homónimos en la VM.**

**Impacto:** corrupción semántica de agregados cuantitativos, contradice el compromiso de jamás sumar unidades físicas incompatibles. No afecta el valor textual decimal de las filas individuales.

**Criterio de aceptación:** transportar `unidadId` real en el contrato Stock general y usarlo como clave de agrupación, manteniendo `unidad` como rótulo; para homónimas, desambiguar rótulo de forma determinística, incluso si solo una unidad aparece en la página pero ambas en totales. Excel/PDF deben mostrar ambas identidades y sus números sin mezclas; preservar `numeric::text`, filtro lote y Stock/Valorización/Kardex sin cambios. Regresión pura con dos UUID distintos/igual nombre, ambas vistas, 2 productos, dos depósitos y 5/7 fraccionarios, terceros, XLSX/PDF y paginación. **No editar NEX-003 ni crear migration si la columna ya existe en `unidades_medida`.**

## 4. Observaciones/decisiones sin nuevo bug verificado

- **SG-O01 — política de productos fuera de depósitos:** `stock-general.ts:114–125` empieza en productos de empresa y limita `stock_saldos` a depósitos del usuario. En ausencia de saldo visible, un producto activo puede aparecer como `SIN_STOCK` aunque tenga stock en otro depósito no autorizado. Tema global ya documentado como `STK-D01`; decidir si catálogo general es admisible con etiqueta «en alcance» antes de cambiar query. No se exponen cantidades ajenas en código leído.
- **SG-O02 — alcance de sucursal:** `depositosDelAlcance` filtra empresa+depósitos, no añade sucursal explícita. La relación `TODOS`/sucursal necesita decisión integral con Depósitos (DEP-O02). No declarar IDOR sin política de acceso definida.
- **SG-O03 — entrada inválida pagina:** `stock-general.ts:43–44` convierte `pagina` con `Math.floor(Number(...))`; `pagina=Infinity` resulta no finito, pudiendo producir error de consulta/500. Prueba focal de parámetros maliciosos e inmensos para decidir severidad; no se reproduce en PG ni se eleva aquí a fallo confirmado de producción.
- **SG-O04 — volume:** el informe agrega todos los productos dentro de la instantánea y genera documento en memoria hasta 50.000 filas. La respuesta exportada puede ser pesada, pero no se midieron memoria/latencia. No confundir límite 50.000 con garantía de rendimiento.
- **SG-O05 — catalogo activo sin configuración:** grupos sin depósitos autorizados ven productos activos con `SIN_STOCK`, `stock_saldos` filtrado a arreglo vacío. Es política de catálogo/visibilidad a resolver junto a SG-O01; no inventar saldo cero global.
- **SG-O06 — descargas independiente de GET:** un PDF de ahora puede diferir de la página vista hace 1 minuto por movimiento legítimo; nombres, filtros y sello de extracción deben explicitar que son fotos distintas.
- **SG-O07 — pruebas/homologación:** no hay evidencia de migraciones/grants activos ni captura desktop 1440/1920. Ninguna prueba fue ejecutada en esta revisión. La confirmación visual, SQL real y XLSX/PDF abierto depende del responsable.

## 5. Matriz dirigida para futura fase de corrección

| ID prueba | Resultado esperado |
| --- | --- |
| SG-R01-T01 | Q `"ABC "`/lote `"L1 "`: API 200 y resultado vigente visible/exportable con normalización compartida |
| SG-R01-T02 | Buscar B mientras A visible: ni indicador ni exportación A se presentan como B antes del debounce |
| SG-R01-T03 | Dos `unidades_medida.id` distintos con mismo `nombre`: `porUnidad` produce dos entradas físicas, con valores 4 y 7 separados |
| SG-R01-T04 | Dos unidades homónimas con decimales y terceros: sin suma entre UUID, `numeric` exacto en pantalla, Excel y PDF |
| SG-R01-T05 | El filtro lote L1 exhibe solo cantidad L1, situación con TODOS los lotes del ámbito, ambas vistas concilian |
| SG-R01-T06 | Una empresa A, empresa B, usuario ASIGNADOS, depósito activo e inactivo, UUID ajeno forzado en URL → 403/sin saldos |
| SG-R01-T07 | Perfil REPORTES.VER-only no exporta (UI y API 403); VER+EXPORTAR sí; sesión inválida 401, demo/no-db 503 |
| SG-R01-T08 | Filas/paginación 50 y exportación de 50.000 permitida; 50.001 devuelve 413 sin fuga de datos previos |
| SG-R01-T09 | Sin saldo y productos inactivos, propiedad PROPIO/TERCERO/AMBOS, virtual/físico y estado TRÁNSITO conforme V1 |
| SG-R01-T10 | Cambio de filtro, 200 malformado, error red, 403, respuestas fuera de orden, retry sin presentar datos viejos |
| SG-R01-T11 | Excel y PDF completos con columnas aprobadas, filtro/sello/empresa, unidades desambiguadas, notas y cantidad decimal exacta |
| SG-R01-T12 | Navegador desktop 1440/1920: ancho scroll, tabla, indicaciones Sin saldo, filtro lote/estado, foco, errores; evidencias humanas |

**Dictamen de este menú:** **2 ALTAS abiertas (SG-D01 heredada transversal, SG-D03 nueva), 1 MEDIA (SG-D02 heredada transversal), 7 observaciones.** No contabilizar SG-D01/SG-D02 otra vez en total global de Reportes; **solo SG-D03 es nuevo** frente a auditoría transversal R01. Se conserva el histórico de `AUD-RPT-R11` para el motor, pero el reporte tiene hallazgos abiertos actualmente. **NO HOMOLOGADO.** Próximo reporte para revisión independiente por pedido: **Valorización de inventario**.
