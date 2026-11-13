# AUD-NEXIT-VALORIZACION-DESKTOP-R01 — auditoría funcional independiente de Valorización de inventario

**Fecha:** 18/10/2026. **Reporte 2:** Reportes → Valorización de inventario. **Ruta:** `/reportes/valorizacion`. **Branch:** `feature/NEXIT-2026-001-banco-demo`.
**Veredicto:** auditoría **ESTÁTICA** documentada con hallazgos abiertos; **NO HOMOLOGADO**. No autoriza a Claude a modificar código, SQL o migraciones.
**Corte verificable:** `lib/reportes/valorizacion.ts` blob `84d08176dc695ee17abf36c07c6d373942290395`; `app/(private)/reportes/valorizacion/page.tsx` según la misma rama; `lib/reportes/valorizacion-cobertura.ts` y exportación según rama. Un blob SHA no equivale al commit desplegado.
**Metodología:** consulta en GitHub de los protocolos actuales `CLAUDE.md` y `documentacao/PROTOCOLO-IA.md`, el `PROGRESSO-NEXIT-V1.md` pertinente, alcance V1, histórico integrado `AUD-REPORTES-INTEGRADA-V1-2026-10-13.md` (R01–R20), auditoría transversal `AUD-NEXIT-REPORTES-DESKTOP-R01-2026-10-18.md`, ficha canónica, pantalla completa (334 líneas), 2 endpoints GET, servicio de 233 líneas con SQL embebido, helpers de clasificación y vigencia, tipo de respuesta, cliente/exportador, guardas, snapshot, alcance y casos de `lib/reportes/valorizacion.casos.ts` (331 líneas). No se ejecutó código ni se inspeccionó base real.
**Resultados de ejecución hoy:** 0 pruebas ejecutadas; 0 PostgreSQL/VM/Docker/HTTP autenticado/browser/capturas/build/lint/tsc/Excel o PDF abierto de forma independiente. La suite versionada contiene pruebas simuladas históricas, no son evidencia de ejecución en este turno.
**UX:** aplicación solo desktop. No reabrir cambios móviles.

## 1. Función de negocio: valorización patrimonial, no stock operativo ni reposición

**Pregunta exacta:** «¿Cuál es el importe del inventario propio registrado a costo real por producto, depósito y categoría, cuál es la cobertura de ese costo respecto de las existencias físicas y dónde hay inconsistencias?»

- **Fuente exclusiva de costo:** `inventario_costos.cantidad_valorizada` y `inventario_costos.valor_total`, en moneda base de la empresa. El costo unitario es `valor_total/cantidad_valorizada` si esta es positiva, con 4 decimales de presentación en SQL. No sustituir cantidad valorizada por saldo físico ni usar listas de precio de venta para inventar costos.
- **Fuente de conciliación física:** `stock_saldos`, solo propiedad `PROPIO`, estados distintos de `TRANSITO`. Stock de terceros y tránsito no representan patrimonio propio valorizable.
- **Instantánea actual:** foto de consulta, **no valorización histórica arbitraria** ni cierre contable. `conSnapshotLectura` usa una conexión, transacción `REPEATABLE READ READ ONLY`, consultas secuenciales y cierre/rollback.
- **Clasificación exacta por pareja producto×depósito antes de agrupar:** `CON_COSTO` (cantidad valorizada igual a física y física positiva), `PARCIAL` (cantidad valorizada menor a física), `SIN_COSTO` (físico positivo sin cantidad valorizada), `EXCEDENTE` (cantidad valorizada superior a física), `RESIDUO` (valor monetario sin cantidad valorizada), `SIN_STOCK` (sin cobertura patrimonial). Las diferencias de signo distinto **no** se cancelan entre depósitos.
- **Vistas:** DETALLE = producto×depósito (cantidad, costo unitario, importe y situación); PRODUCTO = subtotal único del producto en sus depósitos (suma de diferencias positivas por par y costo promedio del mismo producto); DEPOSITO y CATEGORIA = valores monetarios, conteos de productos y estados, **sin sumar cantidades heterogéneas**.
- **No cambia datos:** no registra costo, compra, venta, reposición ni ajuste; solo consulta y exporta. `Inventario → Stock` responde cantidad operativa, `Inventario → Movimientos` ejecuta efectos, `Inventario → Reposición` proyecta necesidades, `Reportes → Stock general` documenta cantidad y `Kardex` explica evolución.

## 2. Inventario técnico función por función

| Función / vista | Archivo y líneas | Observación estática |
| --- | --- | --- |
| Acceso menú y ruta | `lib/navigation/menu.ts`; `app/(private)/reportes/layout.tsx` | Requiere `REPORTES.VER`; no se inventa permiso de costo nuevo sin decisión |
| GET report | `app/api/reportes/valorizacion/route.ts:8–29` | `autorizarReporte(["VER"])`, empresa y usuario solo de sesión, resultados validados |
| Excel/PDF | `app/api/reportes/valorizacion/exportar/route.ts:9–38` | `VER+EXPORTAR` revalidado en servidor, formato xlsx/pdf, todas las filas del filtro hasta 50.000; lectura y snapshot nuevos |
| Guard / tenant | `lib/reportes/guard.ts`, `lib/reportes/alcance.ts:9–20`, `valorizacion.ts:82–85` | 401/403/503; depósitos activos/inactivos autorizados y `empresa_id` de sesión; UUID ajeno en filtro = 403 |
| Filtro texto/depósito/categoría/familia | `valorizacion.ts:33–61,87–92`; `page.tsx:162–203` | IDs validados y SQL parametrizado; `q` 80 caracteres y trim en API; incidencia VZ-D01 |
| Filtro existencia | `valorizacion.ts:42–45,93–95`; `page.tsx:205–212` | CON requiere físico o cantidad valorizada o valor; SIN selecciona `SIN_STOCK` del par, no todos los productos maestros vacíos |
| Filtro cobertura | `valorizacion.ts:46–47,98–99`; `page.tsx:213–223` | Lista cerrada; filtro del par antes de agregar; DIVERGENCIAS excluye CON_COSTO/SIN_STOCK |
| «Costo registrado» | `valorizacion.ts:96–97,117–118`; `page.tsx:224–230` | Filtra `cantv>0` / `cantv=0`, **no** `tiene_registro` ni `valor<>0`: incidencia VZ-D03 |
| Pares y stock propios | `valorizacion.ts:101–130` | Unión de pares en costos o saldos propios físicos, sin terceros/tránsito; costo y físico diferenciados |
| Cobertura | `valorizacion-cobertura.ts:21–49` y `valorizacion.ts:129–135` | Orden de clasificación SQL y helper coincide; filas de situación detectadas antes de GROUP BY |
| Subtotales/totales | `valorizacion.ts:137–214`, `page.tsx:135–160,249–304` | Valor decimal PostgreSQL como texto, sumas por par, cobertura %, conteos, inactivos; indicador «ALCANCE» VZ-D04 |
| Decimal/excel | `lib/reportes/export-valorizacion.ts:39–100`, `lib/reportes/export.ts`, `lib/reportes/formato.ts` | Cuatro esquemas de columnas, cantidad no aplicable `n/a`, importes `numeric` textuales; correcciones RPT-R03-01/02 históricamente registradas |
| Debounce/resultados | `page.tsx:21–101`; `valorizacion-cobertura.ts:97–105`; `cliente-valorizacion.ts:20–54` | Respuestas tardías descartadas tras disparar nuevo GET; sin presentación de errores de HTTP como datos; incidencias VZ-D01/D02 |
| Estados desktop | `page.tsx:104–334` | 4 vistas, filtros/select, tarjetas, tabla y pie, 50 filas/página, error/reintentar, sin datos, exportación; sin prueba visual de ancho real |
| Regresiones versionadas | `lib/reportes/valorizacion.casos.ts:1–331` | Fake DB, snapshot, clasificación, cantidades exactas, aislamiento, XLSX/PDF y R07 filtros; no cubre expresamente VZ-D03/D04 ni búsqueda con espacios |

## 3. Hallazgos abiertos de esta auditoría individual

### VZ-D01 — ALTA HEREDADA de RPT-D01 (NO duplicar conteo global) — texto normalizado por servidor no coincide con búsqueda aplicada de la página

**Evidencia:** `valorizacion.ts:55` convierte `q` con `.trim().slice(0,80)`. `page.tsx:33–40` estabiliza `filtros.q` cruda 300 ms. `valorizacion-cobertura.ts:98–104` compara `datos.filtros.q === aplicados.q`. Cadena visible `"ABC "` produce API `filtros.q="ABC"` y la pantalla invalida su propia respuesta 200 incluso si tenía filas. La exportación queda oculta porque `actual=null`.
**Aceptación:** canonizar búsqueda en un único helper cliente/API/igualdad, sin aceptar datos de filtro realmente diferente. Pruebas `" ABC "`, 80/81, solo espacios, paginación, 200 vacío y Excel/PDF. No reabrir RPT-R07-01 (se corrigió comparación por orden de claves, diferente de este caso).

### VZ-D02 — MEDIA HEREDADA de RPT-D02 — valor financiero anterior expuesto durante debounce de consulta nueva

**Evidencia:** `page.tsx:33–40,74–82,120–129,135–160`: al cambiar texto vivo se preserva `qAplicada` anterior durante 300 ms; `actual` y `puedeExportar` permanecen ligados al filtro anterior. Antes de lanzar el nuevo GET el operador ya ve otro texto, pero puede ver/descargar valor antiguo.
**Impacto:** lectura engañosa de importe monetario para filtro aún no aplicado. No es dato de otra empresa ni persistencia incorrecta.
**Aceptación:** estado de búsqueda pendiente e invalidez/rotulación inmediata de indicadores y descarga; mantener debounce y compuerta de respuestas. Test con 0/100/300 ms, error B, secuencia A/B, y permiso EXPORTAR.

### VZ-D03 — MEDIA NUEVA — «Costo registrado» mezcla presencia de registro monetario con cantidad valorizada mayor que cero

**Evidencia:** `page.tsx:224–230` presenta el filtro **«Costo registrado»**, opciones «Con costo»/«Sin costo». `valorizacion.ts:96–97` implementa «Con costo» por `cantv > 0` y «Sin costo» por `cantv = 0`; `valorizacion.ts:117–118` ya calcula `tiene_registro` vía `ic.id IS NOT NULL`, pero NO lo utiliza en ese filtro. `valorizacion-cobertura.ts:22–28` reconoce deliberadamente `RESIDUO` cuando `cantv=0 AND valor<>0`.
**Caso:** existe una fila real de `inventario_costos` para producto P, `cantidad_valorizada=0` y `valor_total=100000`. Se rotula «Valor sin cantidad»; pero el filtro «Con costo» la excluye y «Sin costo» la incluye a pesar de existir un registro con valor patrimonial. Esto es la semántica del código; **no** se confirma que existan residuales reales en producción.
**Impacto:** interpretación financiera errónea de reportes filtrados; el valor total de consultas sin filtros NO está probado como errado.
**Criterio/decisión:** acordar y reflejar en pantalla/exportador si «Con costo» significa (A) **cantidad valorizada positiva** o (B) **registro de costo existente**. Si (A), cambiar el rótulo a «Cantidad valorizada» y aclarar que residual con valor entra en «Sin cantidad valorizada»; si (B), usar `tiene_registro` de forma consistente, conservando tratamiento explícito de RESIDUO. No alterar clasificación de cobertura ni inventar costo unitario `valor/0`. Probar sin fila de costo, fila vacía cero/cero, 0/100000, cantidad positiva/valor cero, 10/50000, ambos signos si schema permite; las cuatro vistas y exports.

### VZ-D04 — MEDIA NUEVA — KPI «ALCANCE» representa depósitos con filas filtradas, no depósitos autorizados

**Evidencia:** `page.tsx:153–159` titula tarjeta «ALCANCE» y usa `t.depositos`. `valorizacion.ts:169–181` calcula `count(DISTINCT deposito_id)::int AS depositos FROM fil`; `fil` está limitado por búsqueda, categoría, familia, existencia, costo y cobertura (`valorizacion.ts:89–130`). Pero el conjunto de depósitos permitidos ya fue calculado como `permitidos` en `:83–85` y devuelto como `catalogos.depositos` en `:228`.
**Caso:** el usuario puede ver 5 depósitos. Solo dos tienen filas de la categoría filtrada; la tarjeta «ALCANCE» presenta «2 depósito(s)», aunque el alcance de autorización sigue siendo cinco. Si los filtros no encuentran nada, la tarjeta da 0, aunque el usuario aún tiene 5 permisos. El valor total sí corresponde al filtro activo.
**Impacto:** riesgo de interpretación equivocada de la cobertura/ausencia de datos de la entidad; no es bypass ni suma financiera incorrecta.
**Criterio:** rotular explícitamente «Depósitos con resultados» (mantener `t.depositos`) y separar, si se necesita, «Depósitos autorizados» como `actual.catalogos.depositos.length`; o definir terminología comercial equivalente. Asegurar que Excel/PDF indiquen alcance real de depósitos autorizados y cantidad de depósitos con resultado de forma inequívoca. Probar 5 permitidos/2 con filas; filtros vacíos; inactivos, multiempresa/ASIGNADOS.

## 4. Observaciones y verificaciones pendientes — sin hallazgo de bug probado

- **VZ-O01 — residuales y costo promedio agregado:** en `valorizacion.ts:62,138–145,188–189` costo de la vista PRODUCTO es `sum(valor)/sum(cantv)`. Si un depósito tiene `cantv=0, valor<>0` y otro del mismo producto tiene cantv positiva, el valor residual contribuye al promedio del grupo. Puede ser contablemente significativo; depende de tratamiento aprobado de residuales y del contrato `inventario_costos`. Antes de alterar, reproducir y decidir si se debe mostrar un aviso de promedio afectado, sin compensar divergencias, inventar precio o tratar el residual como costo unitario de un depósito sin cantidad.
- **VZ-O02 — corte de la foto:** la exportación vuelve a generar instantánea `REPEATABLE READ`, no puede garantizar mismos valores que la pantalla si hubo movimientos después. El timestamp debe seguir visible.
- **VZ-O03 — privilegio de datos de costo:** `REPORTES.VER` autoriza consulta de valor patrimonial conforme alcance aprobado; `REPORTES.EXPORTAR` solo descargas. Si empresa necesita restringir importes frente a reportes de stock no financiero, requiere nueva decisión de política, no limitar silenciosamente los cinco reportes.
- **VZ-O04 — alcance de sucursal:** `depositosDelAlcance` filtra por usuario/depósito/empresa, sin intersección explícita de sucursal. Mismo riesgo transversal discutido en DEP-O02; no etiquetar violación sin contrato definitivo.
- **VZ-O05 — filtros página/volumen:** la parser usa `Math.floor(Number(...))`; entradas no finitas/masivas requieren test focal de 400 vs 500, y exportación de 50.001 filas (413). No afirmar exposición o rendimiento degradado sin PG/perfilado.
- **VZ-O06 — catálogo, inactivos y ausencia:** todo `fil` procede de pares con costo o físico positivo; no debe esperarse que catálogo entero de productos sin stock/costo aparezca en «Sin existencia». Los depósitos inactivos con registro se incluyen deliberadamente, no bug.
- **VZ-O07 — conciliación en ambiente real:** comparar `inventario_costos` con `stock_saldos` bajo la misma fotografía, validar datos en moneda base y cobertura, roles reales y costos históricos en VM; ninguna base se consultó en este turno.

## 5. Matriz dirigida de aceptación futura (sin ejecutarla ahora)

| Caso | Escenario / resultado requerido |
| --- | --- |
| VZ-T01 | Una pareja P×D físico=10, cantv=10, valor=50000 → Con costo; coste unitario 5000.0000, dinero correcto |
| VZ-T02 | Físico=10, cantv=4, valor=20000 → PARCIAL, sin valorizar 6 sin valor monetario inventado |
| VZ-T03 | Físico=10, cantv=15 en un depósito y cantv=5 con físico=10 en otro → EXCEDENTE y PARCIAL no se compensan en conteos ni cantidades |
| VZ-T04 | Residual 0 unidades / 100000 moneda base; probar ambas interpretaciones de filtro «Costo registrado», 4 vistas y export |
| VZ-T05 | Usuario autoriza 5 depósitos; filtro deja 2 con filas → KPI diferencia autorizados vs resultados inequívoca |
| VZ-T06 | `q=" ACE "`, 80/81 caracteres y 300 ms de debounce; datos válidos visibles, ninguna exportación del filtro anterior como actual |
| VZ-T07 | DETALLE y PRODUCTO con un mismo producto en 2 depósitos; DEPOSITO/CATEGORIA solo monetario, `n/a` cuantitativo |
| VZ-T08 | Excel/PDF x 4 vistas con filtros activos, precisión monetaria, decimales largos, celdas n/a, 50.000/50.001 |
| VZ-T09 | Empresa A/B, usuario ASIGNADOS, depósito activo/inactivo autorizado, UUID ajeno → 403 y ningún dato de otro tenant |
| VZ-T10 | REPORTES.VER-only consulta sin exportar; VER+EXPORTAR descarga; 401/403/503; 200 malformado/500 y retry |
| VZ-T11 | Dos modificaciones de costo/stock paralelas al GET → foto consistente del conjunto, sin mezcla entre consultas |
| VZ-T12 | Browser desktop real a 1440/1920, tabla ancha, encabezados, moneda base, vacíos, paginación, accesibilidad y captura |
| VZ-T13 | Reconciliar `valorTotal`, `valorPorSituacion`, `productosConCosto`, `inactivos`, cero sin registro vs costo cero |
| VZ-T14 | Revisar casos históricos `valorizacion.casos.ts` y ruta real ZIP XML de XLSX/renderer PDF, solo tests dirigidos autorizados |

**Balance del menú:** **1 ALTA heredada (VZ-D01), 1 MEDIA heredada (VZ-D02), 2 MEDIAS nuevas específicas (VZ-D03/D04), 7 observaciones.** **Aumento del total global de Reportes: solo +2 MEDIAS nuevas**, porque los dos heredados ya figuran como RPT-D01/D02. Tras la anterior auditoría individual de Stock general (SG-D03, nueva ALTA), el resumen global acumulado de los hallazgos de 18/10 en Reportes es **2 ALTAS + 3 MEDIAS + 1 BAJA** (sin contar notas ni históricos ya cerrados).
**Fuera de alcance hoy:** corrección de código, migrations, acciones de Claude, homologación o despliegue. Históricos RPT-V01…V06, R03/R04/R07/R08 se conservan; problemas D01/D02 no equivalen a reabrir bug de orden JSON RPT-R07-01. **Próximo reporte individual a solicitud del propietario: Kardex de movimientos.**
