# AUD-CHATGPT — PRO-365-R02 / UX Documentos electrónicos — 24/11/2026

**VEREDICTO: NO CONFORME PARA ENTREGA — CI APP ROJO (1 fallo PRO365-R02-10); corrección visual estática focal válida; homologación visual/browser PENDIENTE. NO VM / NO MERGE.**

## 1. Identidad del alcance auditado

- Repo: `proceit-tech/distribuidora`, PR **#7 DRAFT**, branch `feature/NEXIT-2026-001-banco-demo`.
- Base del correctivo visual: `0cd3488a61a0557621ee7cfa60db641d58ccc98c` (contiene dos **PNG originales de la competencia** en `documentacao/referencias-visuais/PRO-365/`, índice README, orden PRO-365 y R01 auditada).
- Commit funcional Claude R02: **`6625f4f19e71de3ece8cb2e3b3234a0df158286c`** (1 commit, 10 archivos: `CLAUDE.md`, `app/(private)/documentos/page.tsx`, `page.module.css`, nuevo `documentacao/analises/PRO-365-R02-ENTREGA-UX-COMPETENCIA-2026-11-24.md`, 5 archivos `*.casos.ts` actualizados y `scripts/casos-clientes/run.js`). Sin migrations, SQL, APIs, gateway, código fiscal, KuDE, stock o permisos alterados.
- La entrega de Claude declara que abrió ambas imágenes en Git; proporcionó matriz por imagen, documentó funciones no soportadas, pruebas manuales NO ejecutadas y que la pantalla no está homologada por navegador.

## 2. CI automático — hallazgo BLOQUEANTE F001

- [App CI run 45387975226](https://github.com/proceit-tech/distribuidora/actions/runs/45387975226): **FAIL** (también [run 45387965629](https://github.com/proceit-tech/distribuidora/actions/runs/45387965629): FAIL). Pasaron 5 jobs técnicos: `docker build + inspección`, `typecheck`, `lint aplicación`, `next build + standalone`, `lint casos/runner`. Fallaron `Casos de regresión` y, por dependencia, `Compuerta de liberación`.
- Log del job de casos ID `138423806594`: **6.791 comprobaciones contadas, 1 fallo, 0 errores de inventario**. El único fallo identificado: **`PRO365-R02-10`**, sobre el texto compacto de la leyenda; la suite PRO-365 tiene 28 comprobaciones, no se debe llamar a todas PASS.
- **Causa demostrada por comparación de fuente y test**: `lib/facturacion/documentos-ux-competencia-pro365.casos.ts:146–148` contiene la expresión `/<span><strong>Estado:<\/strong> Envío · XML\/CDC · SIFEN · Correo<\/span>/`, que exige etiquetas **adyacentes sin salto de línea**. En `app/(private)/documentos/page.tsx:920–923` la misma leyenda existe con `<span>` en su propia línea y `<strong>Estado:</strong> Envío · XML/CDC · SIFEN · Correo` en la siguiente, como JSX legible. El test de fuente es demasiado rígido frente a whitespace; no prueba un defecto de estado fiscal, gateway ni base. El mensaje de accesibilidad `srSolo` y el `padding: 4px 14px` sí aparecen en los archivos, por lo que el fallo está localizado en la coincidencia literal de marcado. **Es un falso negativo del verificador estático**, sin afirmar que la interfaz ya fue validada en navegador.
- Corrección mínima sugerida **BAJO NUEVA AUTORIZACIÓN FOCAL**: actualizar SOLO ese matcher de test para permitir saltos/espacios entre el `<span>`, `<strong>` y el cierre, conservando exigencia de los cuatro ejes y de la descripción accesible. Ejemplo de intención: `/<span>\s*<strong>Estado:<\/strong>\s*Envío · XML\/CDC · SIFEN · Correo\s*<\/span>/`. Evitar maquillar el fallo suprimiendo aserción, forzando PASS, silenciando CI o deformando el JSX para satisfacer un regex frágil; no tocar runtime UI ni más suites. Tras push, **observar CI automático** y parar para auditoría. Sin tests/lint/typecheck/build manuales.

- [Banco CI run 45387975218](https://github.com/proceit-tech/distribuidora/actions/runs/45387975218): **SUCCESS**, PostgreSQL efímero con 83 migrations/versiones, **T01 OK (8 verificaciones), 1.125 PASS, 0 fallos**. No significa homologación fiscal ni VM actualizada.

## 3. Comparación funcional/visual con ambas referencias

Las dos capturas de la competencia están presentes en GitHub, y son el marco visual obligatorio; BSERP no es la referencia principal. ChatGPT contrastó las pantallas del usuario con el diff R02 y el informe de Claude, **pero no vio NEXIT R02 renderizado** (no se abrió navegador). Por tanto, se clasifica como conformidad de fuente, no paridad visual.

| Elemento | R02 en fuente | Condición |
|---|---|---|
| Filtros | **Implementado** tarjeta propia con etiquetas, emisión desde/hasta, sucursal, búsqueda, tipo y estado SIFEN en orden; mismos setters/filtros automáticos, sin endpoints inventados | Similaridad en pantalla **no validada** |
| Filtros de lote, fecha firma, estado de envío y checkboxes | **No implementados**; registrados como pendientes de API/orden | No simular, tampoco afirmar paridad total |
| KPIs | **Implementado** `Resumen de estados` con ocho tarjetas (7 grupos + total), símbolos y colores semánticos, total último; cifras del resumen del servidor y botones-filtro mantenidos | Rendimiento y disposición en 1366/1920 sin navegador **no verificados** |
| Tabla | **Implementado** ancho mínimo de 1180 a 1100px, menor padding, diez columnas preservadas, iconos de estados reducidos de 36 a 28px en desktop / 36px mobile | Área táctil menor en tablet horizontal, no comprobada visualmente |
| Leyenda | **Implementado** texto breve visible + símbolos; significado detallado en texto accesible. `PRO365-R02-10` falla por patrón textual obsoleto | CI **BLOQUEADO** |
| Cuatro indicadores por documento | **Preservados desde R01**: Envío, XML/CDC, SIFEN, Correo por `iconosEstado` | No cambiar rechazo SIFEN real para estética |
| Acciones PDF/XML/Consulta/Correo | **Preservadas**; XML/correo deshabilitados sin endpoint probado | No habilitar acciones falsas |
| Eventos | **Preservado R01**: columna compacta, sin repetir largas indisponibilidades | Sin API nueva |
| Agrupación, exportación, consulta masiva, selector 25/50/100, eventos desplegables | No implementados, declarados pendientes de contrato/orden | No son defectos de R02 si están fuera de alcance |
| Browser 1366/1920/320–720 | **No ejecutado**, no se publicó captura de NEXIT R02 renderizado | Homologación visual sigue pendiente |

## 4. Observaciones adicionales (no afirmar defecto sin reproducción)

1. **R02-OBS-01:** R02 altera el layout exclusivamente; no la lógica `iconosEstado`, estados persistidos, SQL/ACL ni el contrato del KuDE. La evidencia estática no identifica regresión fiscal nueva en ese ámbito.
2. **R02-OBS-02:** `table.tablaDocs` conserva `min-width:1100px`; el propio informe de Claude reconoce scroll horizontal posible a 1366px con sidebar. KPI pueden formar dos filas irregulares (p. ej. 6+2); responsive real no fue probado.
3. **R02-OBS-03:** CSS `.estado .icono` reduce área a 28px en desktop. En pantallas móviles <=720 vuelve a 36px; en tablets con viewport mayor puede tener menos superficie táctil. Contraste calculado en casos de fuente, no medido en navegador.
4. **R02-OBS-04:** título histórico del runner de suite PRO-195 todavía menciona `estado principal único`, aunque la pantalla ya usa cuatro iconos. No afecta este CI y no justifica extender el correctivo focal.
5. **R02-OBS-05:** evitar afirmar que un documento `APROBADO` continúa vigente si hay un evento `CANCELADO` acreditado en fuente independiente; situación pendiente de validación visual semántica desde la auditoría R01, sin cambiar motor fiscal.

## 5. Gate / próxima acción

**NO APROBAR PRO-365-R02** mientras el CI app falla. Registrar **F001 — test de leyenda demasiado estricto por whitespace**, clasificándolo como falso negativo verificado por código. Proponer una corrección **R02-C01** autorizable, SOLO `lib/facturacion/documentos-ux-competencia-pro365.casos.ts`, exclusivamente matcher `PRO365-R02-10`; esperar CI automático total verde y nueva auditoría. No iniciar R03, no retocar código UI, no SQL/VM/Docker/gateway, no merge/deploy.

Aunque el CI quede verde, **NO declarar homologación visual** hasta contar con render real NEXIT R02 comparado con ambas capturas de competencia por el responsable. PRO-365 conserva estado In Review, PR #7 DRAFT.

**Este dictamen no ejecuta ningún test ni cambia código funcional.**
