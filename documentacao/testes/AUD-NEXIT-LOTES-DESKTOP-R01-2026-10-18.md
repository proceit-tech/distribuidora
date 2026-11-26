# AUD-NEXIT-LOTES-DESKTOP-R01 — Revisión independiente por función: Lotes y vencimientos

**Fecha:** 18/10/2026. **Reporte 5 de 5:** Reportes → Lotes y vencimientos. **Ruta:** `/reportes/lotes`. **Branch:** `feature/NEXIT-2026-001-banco-demo`.
**Estado:** AUDITORÍA ESTÁTICA INDIVIDUAL DOCUMENTADA, CON HALLAZGOS ABIERTOS; **NO HOMOLOGADO**. No autoriza a Claude a corregir código, modificar migrations, ejecutar SQL ni hacer deploy.
**Corte verificable de código actual (SHA de blob, no commit ni versión desplegada):** página `app/(private)/reportes/lotes/page.tsx` `05dc10a2ad0da0b4a08e07f748b8b2c03882e069` (364 líneas); servicio `lib/reportes/lotes.ts` `cf37b30af02c8b52f69c75f6b357f88cc7ed317d` (264); helpers `lotes-plan.ts` `f07abe2c59354984d15601779a01efdc36146116` (134); exportador `export-lotes.ts` `ab8108aa2c298656a0093bb1d8d2bade8ba2a8ff` (98); cliente `cliente-lotes.ts` `9bedec7877a75969c8606bdbad24d20e30ee2016` (60); test existente `lotes.casos.ts` `9ba1a62eb4d65a136ad1b333552a0ca18c94c4be` (565).
**Metodología:** lectura de CLAUDE.md y documentacao/PROTOCOLO-IA.md actuales, sección de Reportes en PROGRESSO-NEXIT-V1, REPORTES-V1-ALCANCE-APROBADO, auditoría integrada R01–R20, ficha histórica AUD-REPORTE-LOTES-V1 (AUD-LOT-R01/R02/R03), auditoría transversal AUD-NEXIT-REPORTES-DESKTOP-R01 y fuentes reales: página íntegra, GET y GET /exportar, parser/SQL, helpers puros, cliente HTTP, tabla Excel/PDF, tipos, guardas/snapshot/alcance compartidos y matriz LOT-T01…T10 existente. Consulta parcial de migración NEX-007 y metadatos NEX-009 del registro histórico; **no se pudo verificar todas las constraints/trigger actuales de stock_lotes en su DDL completo**, por lo que ninguna regla implícita de modo LOTE se presume.
**Ejecución:** **0 tests ejecutados por ChatGPT**, 0 HTTP autenticado, PostgreSQL, VM, Docker, navegador, lector real de PDF/Excel, lint, build, tsc o CI manual. Históricos de Claude/test simulados versionados ≠ ejecución en este turno. ERP exclusivamente desktop; pruebas visuales móviles fuera de alcance.

## 1. Función de negocio y exclusiones — riesgo de vencimiento, no movimiento ni plan de compras

**Pregunta:** «¿Qué lotes reales de productos existen, cuál es su fecha de vencimiento, cuántos días les quedan, en qué depósitos autorizados están y cuál es su saldo por estado y propiedad para actuar antes de vencer?».

**Dueños y separación:**
- `Stock/Movimientos`: fuente de stock físico y de los lotes con fecha registrada; solo Movimientos modifica saldos. Reportes → Lotes es **solo lectura y exportación**, no crea lote, vencimiento, movimiento, ajuste, transferencia ni compra.
- `Lotes y vencimientos`: foto de riesgo de caducidad del **lote real** por el campo opcional `fecha_vencimiento`, con horizonte parametrizado, sin inventar fecha para nulos ni convertir cuarentena en vencido.
- `Stock general`: cantidad general de productos/depósitos/lotes/estados. `Kardex`: registro histórico causal. `Reposición/Stock crítico`: necesidad de abastecimiento, otra regla independiente. `Valorización`: costos reales, **no calcular aquí**.
- Productos sin control por lote no deben tener vencimientos inferidos. El servicio actual lee `stock_lotes` y filas de `stock_saldos` con `lote_id`, pero **NO aplica un predicado explícito `pr.modo_control_stock='LOTE'`**. Ver LOT-O01 antes de clasificarlo como bug: faltan pruebas de DDL/invariantes de alta/cambio de modo.

**Contrato temporal:**
- Paraguay `America/Asuncion` de PostgreSQL, `HOY=(now() AT TIME ZONE 'America/Asuncion')::date`. No usar reloj local del navegador para clasificar.
- `VENCIDO` si fecha < hoy; `PROXIMO` si hoy ≤ fecha ≤ hoy + horizonte; `VIGENTE` si fecha > hoy + horizonte; `SIN_FECHA` si fecha NULL. En fecha igual a hoy **todavía no se considera vencido**.
- `diasRestantes=vencimiento-HOY`; diferencia negativa si ya venció. Horizonte 0…3650 días; fechas YYYY-MM-DD reales, intervalo inclusivo y ordenado.
- El resultado es una foto con `hoy` explícito, no una automatización/alerta de medianoche ni histórico de vencimientos.

**Contrato físico:**
- Propiedad `PROPIO` por disponible, reservado, cuarentena; `fisico=disponible+reservado+cuarentena`. `TERCERO` independiente, inclusive tránsito de terceros. Nunca sumar terceros con propio.
- Saldos PostgreSQL `numeric::text`; agrupar cantidad por `unidades_medida.id` UUID, no nombre. Dos unidades homónimas quedan separadas/desambiguadas; contar **lotes distintos** sí es aditivo.
- Filtro `CON` selecciona saldo por fila positivo; `SIN` se calcula en `ex` a partir del **saldo total del lote** dentro de depósitos autorizados (o un depósito explícito). Un depósito en cero no convierte el lote con saldo en otro en «sin saldo»; si filtra depósito, el significado se limita al elegido.
- Depósitos de usuario: activos e inactivos de la empresa; un sin-depósitos retorna **sin lotes ni totales/metadatos de lotes**; lotes huérfanos sin ningún saldo registrado visibles únicamente para alcance `TODOS`, sin depósito explícito.
- `LOTE`: fila única por lote; `DEPOSITO`: por lote×depósito, misma clasificación de caducidad; la cantidad de lotes en KPI siempre cuenta cada lote una vez.

## 2. Matriz de funciones y cobertura

| Función | Archivo(s) / líneas | Examen estático |
| --- | --- | --- |
| Menú y autorización | `lib/navigation/menu.ts`, `app/(private)/reportes/layout.tsx`, `app/api/reportes/lotes/route.ts:8–29` | REPORTES.VER, sesión/empresa/actor, 401/403/503 por guarda |
| Exportar seguro | `app/api/reportes/lotes/exportar/route.ts:9–38` | REPORTES.VER+EXPORTAR revalidado, XLSX/PDF, sin POST y límite de 50.000 filas, 413 |
| Filtros validados server | `lotes.ts:45–80` | vista LOTE/DEPOSITO, clase, existencia, IDs UUID, texto q/lote, horizonte 0–3650, período fechas reales; LOT-D01 hereda mismatch q/lote |
| Client validator/controlador | `lotes-plan.ts:14–95`, `cliente-lotes.ts:20–45`, `page.tsx:25–112` | LOT-R02-01/02 anteriores preservados: invalid date/horizonte sin throws y sin consulta; error 200 malformado; compuerta de GET tardío. LOT-D02 hereda debounce 300ms |
| Fecha/classificación | `lotes.ts:16–24,83,103–110,165–169` | Date hoy Paraguay, cuatro clases y días; clasificación correcta en código |
| Físico/lotes | `lotes.ts:141–190` | `stock_lotes JOIN productos` con `stock_saldos` y depósitos autorizados, propio/tercero y estados; sin fecha inventada |
| Existencia | `lotes.ts:135–139,181–190`, `export-lotes.ts:14–17` | ex.saldo por lote en scope, o por depósito seleccionado; huérfanos sujetos al permiso |
| Totales | `lotes.ts:192–224`, `types/reportes.ts:517–545`, `page.tsx:157–169,267–291` | contadores por clase y lote, sumas de cantidad UUID por unidad, terceros por estado, no total heterogéneo |
| Consulta filas | `lotes.ts:226–264` | orden vencido/próximo/vigente/sin fecha y vencimiento/código, paginación, 50.001 protegido, columnas exactas |
| UI desktop | `page.tsx:100–364` | dos vistas, buscador, lote, depósito/activo-inactivo, categoría, marca, familia, situación, existencia, horizonte, fechas; estados vacíos/error/tabla; LOT-D03 rótulo contador |
| XLSX/PDF | `export-lotes.ts:19–98`, `lib/reportes/export.ts` | mismas vistas, fecha Paraguay/sello, lote/depósito/vencimiento/estados, totales UUID, PDF ancho con anclas; prueba humana ausente |
| Tests ya versionados | `lib/reportes/lotes.casos.ts` (565 líneas), LOT-T01…T10 + R03 | decimal, fechas límites, 413/50k, 0 deps, huérfanos, inactivos, GTIN alternativo, UUID homónimos, existencia y validador; lectura únicamente |
| Coherencia de modo LOTE | `lotes.ts:170–179`, `NEX-007-productos.sql:27–29`, NEX-009 referido en ficha histórica | JOIN no filtra `modo_control_stock`; consultar invariantes de DDL/producto antes de declarar defecto LOT-O01 |

## 3. Hallazgos de este menú — numeración individual, herencia sin duplicación

### LOT-D01 — ALTA HEREDADA de RPT-D01 — filtros de texto API vs comparación de vigencia

**Evidencia:** `lotes.ts:76` normaliza `q`/`lote` usando `.trim().slice(0,80/40)`; `page.tsx:25–57` preserva texto digitado en `qEst/loteEst`; `lotes-plan.ts:77–95` compara filtros estrictamente sin normalizar; `cliente-lotes.ts:4–12` envía texto original. `q="ACEITE "` o `lote="L-1 "` genera 200 válido con filtros del servidor `"ACEITE"/"L-1"`, pero `respuestaLotesVigente` retorna falso → reporte oculto/exportación indisponible, incluso después de estabilizar el texto. Separado de validación correcta del horizonte.
**Criterio:** helper común de canonización al aplicar filtros y verificar respuesta, no relajar guardas de vigencia o 401/403/500; pruebas espacios inicial/final, solo espacios, 80/81 y 40/41, q+lote y XLSX/PDF. **Ya contado global RPT-D01; no sumar de nuevo.**

### LOT-D02 — MEDIA HEREDADA de RPT-D02 — filtro de búsqueda vivo distinto del aplicado mantiene foto antigua durante debounce

**Evidencia:** `page.tsx:42–57,98–106,142–150,157–169,305–333`; `planificarConsulta` combina `qEst/loteEst` estabilizados aunque el usuario haya digitado q/lote diferentes. Mientras pasan 300ms, consultaClave sigue siendo de A, `datos` de A satisfacen `respuestaLotesVigente`, indicadores/tabla/exportaciones pueden verse de A con buscador B. El veto de horizonte/fechas inválidas funciona y NO debe reabrirse LOT-R02-01/02.
**Criterio:** marcar resultado pendiente e invalidar/rotular B en la primera tecla, conservando debounce HTTP, validación temporal y compuerta; test A/B a 0/100/300ms, respuesta atrasada, B HTTP error, q y lote. **Ya contado global RPT-D02.**

### LOT-D03 — BAJA NUEVA — contador de resultados muestra «0 lotes» antes de una consulta válida o tras error

**Evidencia:** `page.tsx:33–39` inicia `datos=null,cargando=false`; `:114–119` establece `total=actual?.pagina.totalFilas ?? 0`; `:195` siempre presenta `cargando ? "Cargando..." : `${num(total)} lotes`` incluso cuando `actual=null` porque es carga inicial previa a estabilización, horizonte/fechas inválidos, 403/500 o ausencia de consulta. `:293–301,337–344` distingue correctamente dichos estados en otras partes, pero el contador puede afirmar «0 lotes» sin foto válida. También ocurre al seleccionar un filtro inválido que anula `consulta` y deja `cargando=false`.
**Impacto:** rótulo de KPI equivocado para un estado aún no consultado / error; no implica el SQL haya devuelto 0 ni habilita exportación indebida. **Confirmado por el flujo de renderización**, no probado en navegador.
**Criterio:** el contador debe presentar «—»/«Sin consultar» en `!actual && !cargando`, «Cargando...» durante consulta, y solamente 0 cuando `actual` es una respuesta válida vacía. Pruebas carga inicial 300ms, horizonte inválido, fecha invertida, 401/403/500, GET válido vacío, cambio a filtro nuevo; mantener mensajes/retry actuales.

**Balance del último reporte:** 1 ALTA heredada + 1 MEDIA heredada + **1 BAJA nueva**. Total de los hallazgos individuales + transversales de Reportes, sin duplicar D01/D02 de los cinco menús: **2 ALTAS + 7 MEDIAS + 4 BAJAS = 13 pendientes**. No confundir con todos los hallazgos históricos R01–R20 cerrados.

## 4. Observaciones condicionadas / criterios de política — no son bugs de inventario demostrados

- **LOT-O01 — comprobación de modo de control:** `lotes.ts:170–179` no incluye `pr.modo_control_stock='LOTE'` ni `pr.controla_stock`, a pesar de que notas `:10–12,35` dicen incluir **solo** productos controlados por lote. La migración `NEX-007-productos.sql:27–29` permite modos `CANTIDAD/LOTE/UNIDAD_ETIQUETADA`. La auditoría histórica describe `stock_lotes` (NEX-009) con FK al producto, pero NO se confirmó si triggers/funciones impiden que exista lote asociado a un producto que haya cambiado a otro modo. Por tanto, existe un **predicado ausente**, pero NO un caso operativo reproducido: inspeccionar integridad vigente, política para lotes históricos después de cambio de modo y acceso antes de decidir si filtrar o bloquear cambio. Evitar borrar datos históricos sin decisión.
- **LOT-O02 — foto al pasar medianoche:** el informe utiliza hoy Paraguay del instante de GET. Si permanece abierto atravesando la medianoche, la foto antigua conserva el `hoy` anterior hasta nueva consulta; pantalla expresa la fecha de referencia. Decidir si el negocio exige refresco diario/avisos de caducidad automáticos. No calificarlo como error de cálculo en snapshot.
- **LOT-O03 — alcance sucursal/depósito:** helper compartido aplica empresa+TODOS/ASIGNADOS y preserva inactivos, sin cruce explícito con sucursales. Necesita decisión general Depósitos/Stock antes de alegar IDOR. Con 0 depósitos no se expone lote.
- **LOT-O04 — estados negativos/histórico anómalo:** `ex.saldo=0` totaliza lo propio+terceros; si hay compensaciones de negativos y positivos, podría clasificarse «Sin saldo» pese a posiciones no nulas. No se comprobó que los constraints/motor permitan negativos; no inventar escenario de producción.
- **LOT-O05 — controles de volumen:** límite de salida 50.000, pero CTE para todos los lotes/depósitos se reevalúa para clase, unidad, conteo y filas. Sin EXPLAIN/medición reales no afirmar lentitud. Mantener snapshot y precisión.
- **LOT-O06 — exportación es otra foto:** XLSX/PDF vuelve a consultar y puede tener nueva fecha de referencia si se cruza medianoche; no exigir bit-a-bit igualdad de una foto vieja de pantalla.
- **LOT-O07 — encabezados de fechas/ausencia:** filtros por intervalo excluyen fecha nula de forma natural; `SIN_FECHA` muestra NULL como ausencia. Si usuario necesita ver ambos al mismo tiempo con filtro de fecha, requiere definición UX nueva, no mezclar condición disyuntiva silenciosamente.
- **LOT-O08 — calidad de catálogo:** catálogo de categorías/marcas/familias activo incluye entradas sin lotes actualmente visibles; esto no expone saldos fuera del alcance. Confirmar política de listado antes de filtrar.
- **LOT-O09 — pruebas reales y versiones:** la consulta GitHub no confirma migraciones reales, deploy, privilegios de todos los perfiles, UTC/asuncion del servidor, PDF externo ni experiencia desktop. Ningún caso ejecutado durante esta revisión.

## 5. Pruebas focales sugeridas para corrección/aceptación futura (no ejecutadas)

| ID | Escenario / resultado requerido |
| --- | --- |
| LOT-IND-T01 | Vencimiento ayer/hoy/hoy+30/hoy+31/null en America/Asuncion, horizonte 30/0/3650, día de vencimiento no vencido |
| LOT-IND-T02 | Dos depósitos A/B, lote con 7 en A y cero en B: `CON` global sí, `SIN` global no; `SIN` al filtrar B sí |
| LOT-IND-T03 | Propio (disp/res/cuar) y terceros (incluye transito), decimal 0.1+0.2, 20 dígitos; nunca sumados entre sí |
| LOT-IND-T04 | Dos UUID de unidades «Metro» con nombre igual: totals separados/rotulados en pantalla XLSX/PDF |
| LOT-IND-T05 | Producto con código alterno GTIN/EAN/empaque, comodines `%/_`, no duplicar lotes |
| LOT-IND-T06 | 2 empresas; ASIGNADOS/TODOS/0 depósitos; activos e inactivos; huérfano solo TODOS y sin filtro concreto |
| LOT-IND-T07 | Fecha inválida 2026-13-01/2026-02-30, invertida; horizonte -1/abc/3651; sin GET ni spinner |
| LOT-IND-T08 | Q `"ACEITE "`, lote `"L1 "`, 80/81 caracteres, 40/41 caracteres: API válida visible y exportable tras canonizar |
| LOT-IND-T09 | Tras digitar B, filtro A no exportable/aparentemente vigente antes de 300ms; sin liberar acceso de filtros anteriores |
| LOT-IND-T10 | Contador no reporta 0 sin respuesta válida: inicial, error 403/500, horizonte inválido, carga y vacío legítimo |
| LOT-IND-T11 | Modo CANTIDAD/LOTE/UNIDAD_ETIQUETADA con/sem lotes históricos: confirmar SQL/invariante sin borrar evidencia histórica |
| LOT-IND-T12 | 50.000/50.001 filas, XLSX/PDF 2 vistas, fecha Paraguay, todas filas filtradas, 413, permiso REPORTES.VER/EXPORTAR |
| LOT-IND-T13 | Expiración cercana a cambio de fecha local y exportación posterior al GET, fotos con sellos distintos |
| LOT-IND-T14 | Browser desktop 1440/1920: tabla horizontal, conteos, error inicial/retry, filtros, cards por clase, unidad, controles de fecha y foco |
| LOT-IND-T15 | PostgreSQL autorizado: 0 depósitos (no listar), anomalía potencial de modo histórico, sin violar constraints/tenant, snapshot concurrente |

## 6. Veredicto y cierre de la serie

**Último de cinco reportes auditado por función y documentado.** Este menú mantiene **1 ALTA heredada + 1 MEDIA heredada + 1 BAJA nueva**, además de 9 observaciones sin defecto operacional confirmado. **La SQL principal de vencimientos, precisión numérica, propiedad, lotes por depósito, fechas Paraguay, 413 y snapshot preservan el contrato estático anteriormente aceptado R03; no hay evidencia de regresión material nueva en estos cálculos.** Las alertas previas LOT-R01/R02 se conservan como históricas cerradas y no se reabren sin regresión nueva.

**Serie de cinco reportes completa a nivel de documentación; ningún reporte homologado operativamente.** Total global de hallazgos nuevos/abiertos de estas auditorías: **2 ALTAS, 7 MEDIAS, 4 BAJAS**, ya descontados los problemas repetidos en cinco menús. Ningún test real ejecutado por ChatGPT; no actuar en Claude hasta autorización expresa posterior del responsable. Próxima fase sugerida: lectura conjunta de los cinco informes + priorización e implementación **separada, reporte por reporte**, solo a pedido.
