# ORDEN ÚNICA ACTIVA — CLAUDE — PRO-337 P0 UX / INFORME DE VENTAS SIN COLUMNAS RECORTADAS

**Fecha:** 29/10/2026 · **Fuente:** captura REAL reiterada por CASA MINGO del Informe de Ventas, remitida tras la auditoría R03 de PRO-335.  
**Issue:** [PRO-337](https://linear.app/proceit/issue/PRO-337) · **paquete:** [PRO-329](https://linear.app/proceit/issue/PRO-329).  
**Repo:** `proceit-tech/distribuidora` · **branch:** `feature/NEXIT-2026-001-banco-demo`.  
**Analista, autor del requisito y auditor independiente:** ChatGPT. **Claude únicamente desarrolla.** Operación de VM/DB/deploy y validación en navegador real requieren autorización independiente del responsable.  
**Antecedente:** [AUDITORÍA TRANSVERSAL 29/10](../analises/AUD-NEXIT-FORMATO-MONETARIO-TODAS-TELAS-E-LAYOUT-VENTAS-2026-10-29.md), [AUD PRO-335 R03](../testes/AUD-NEXIT-PRO-335-FORMATO-MONETARIO-R03-2026-10-29.md). PRO-335 ya está conforme **ESTÁTICAMENTE**, pero no fue homologada. La PRO-337 NO se implementó hasta hoy.

## 1. DEFECTO CONFIRMADO EN LA CAPTURA NUEVA Y EN EL CÓDIGO

La captura REAL de CASA MINGO muestra dos tarjetas con anchura ~50/50. En **«No computan por estado fiscal»**, la sexta columna `Importe informativo` queda cortada: el título aparece truncado como `Importe inf...`, y los importes quedan ocultos. La tarjeta de **«Anomalías: aprobados sin información fiscal conciliable»** es muy grande para su contenido vacío y tiene un título excesivamente largo. Esto **NO** fue corregido por PRO-335 (esa issue formateó PYG/USD, NO resolvió la grilla).

**Causa exacta comprobada:**
- `app/(private)/reportes/ventas/page.module.css::.informativo` actualmente tiene `grid-template-columns: repeat(auto-fit, minmax(420px, 1fr))`; para pantallas anchas forma **2 tarjetas casi iguales** aunque la primera contiene 6 columnas y la segunda 5.
- `.informativo > section { overflow:hidden }` hace que el exceso de tabla quede RECORTADO.
- `.tablaChica th,td { white-space:nowrap; padding:7px 12px }` obliga a un ancho de tabla mayor al permitido y no existe wrapper `overflow-x:auto` para la tabla.
- Grid estira la tarjeta de anomalías con `align-items:stretch` implícito, creando un panel alto y vacío.
- `app/(private)/reportes/ventas/page.tsx` líneas ~307–349 monta directamente `<table className={propios.tablaChica}>` en ambas tarjetas, con títulos demasiado largos y subtítulos extensos.

## 2. REGLAS VISUALES VINCULANTES — NO RESOLVER SOLO CON FUENTES MÁS PEQUEÑAS

1. **PRIORIDAD: Ningún dato cortado u oculto:** la tabla de seis columnas debe permitir leer TODOS los encabezados y el valor monetario en cada fila, incluyendo `Importe informativo` completo. No usar `overflow:hidden` para esconder celdas, ni `text-overflow:ellipsis` para importes ni títulos fiscales.
2. **DESKTOP ancho real:** asignar **más espacio a «Documentos no computados» que a «Anomalías fiscales»**, por ejemplo columnas con proporción aproximada **2.2fr / 1fr**, solo cuando el área interna pueda contener la tabla informativa completa. Evitar que el panel de anomalías vacío ocupe 50% de la pantalla. Si la tabla no entra con todas las seis columnas sin cortar, **apilar dos tarjetas a ancho completo** antes de mostrar cortes.
3. **RESPONSIVO:** en anchos menores (aprox. viewport 1366px o según ancho REAL de contenedor), apilar primero a 100% y después anomalías a 100%. Usar reglas CSS `minmax(0,...)` y `min-width:0` para impedir min-content overflow. Responsive real por espacio disponible y zoom, preferir container queries si resuelven mejor que media query. No depender solo del ancho de viewport cuando el app tiene sidebar.
4. **FALLBACK EN MÓVIL:** para tablet/móvil/zoom alto, incluir `div` específico por tabla con `overflow-x:auto`/máximo ancho 100% y foco por teclado (p.ej. `tabIndex=0`, etiqueta accesible); **solo SCROLL HORIZONTAL LOCAL cuando matemáticamente necesario**; nunca scroll horizontal de toda la página ni tabla cortada. No introducir scroll vertical propio ni altura máxima fija a los registros. La persona debe poder llegar al último importe y leerlo.
5. **CABECERAS COMPACTAS:** reemplazar títulos con los textos aprobados **«Documentos no computados»** y **«Anomalías fiscales»**, manteniendo en subtítulo el significado completo: estados no aprobados no afectan los netos; anomalías aprobadas sin información fiscal conciliable se excluyen. Los títulos deben ser más discretos, ~13px, peso coherente y subtítulos visualmente subordinados, sin truncar. Para las columnas anchas, permitir salto controlado de línea en encabezados largos (p.ej. `Enviados sin aprobación`) si evita scroll en desktop; las CIFRAS NO se dividen ni se truncan.
6. **ALTURA NATURAL:** `align-items:start` para que la tarjeta con `Sin anomalías en el período` ocupe solo la altura de contenido, sin estirarse artificialmente hasta la altura de cuatro filas de la tabla contigua. Mantener espaciado, bordes redondeados y coherencia con otros cards del NEXIT.
7. **DATOS Y MONEDAS INTACTOS:** seis columnas exactamente `Tipo | Estado fiscal | Moneda | Documentos | Enviados sin aprobación | Importe informativo`; cinco columnas de anomalías permanecen. No borrar columnas/filas, no reordenar sumas, ni dividir el valor por 1.000. El formato PRO-335 PYG **0 decimales** y USD/BRL **2 decimales** sigue como está. `fmtImporteMoneda(e.total,e.moneda)` debe ser el mismo.
8. **ACCESIBILIDAD Y FUNCIONES:** preservar el significado de `aria-label` por sección, tabla semántica `thead/tbody/th/td`, estado vacío, navegación de teclado, contraste y scroll visible. Mantener todos los filtros, resumen, opciones `Resumen/Documentos/Productos/Clientes/Vendedores/Meses`, estado fiscal y permisos de exportación. No alterar layout global de otros reportes.

## 3. ARCHIVOS ÚNICOS AUTORIZADOS PARA EDITAR

- `app/(private)/reportes/ventas/page.module.css` — rediseñar SÓLO `.informativo`, card, `.tablaChica`, subtítulos y breakpoint/container query relevante. Si necesita clases para scroll, crearlas localmente aquí.
- `app/(private)/reportes/ventas/page.tsx` — SOLO estructura de los dos cards: cambiar títulos/subtítulos, colocar wrapper scroll local alrededor de CADA `<table>`, clases y accesibilidad asociada. **No tocar** consultas, estado, filtros, lógica de sumas, `fmtImporteMoneda`, exportaciones, menús ni KPI.
- **Opcional como código fuente, no ejecutado:** `lib/reportes/ventas-layout.casos.ts` (NUEVO), para casos estructurales de seis columnas, wrapper horizontal, títulos/estado vacío, grilla responsive; incorporar a un runner existente únicamente si ya existe y está dentro de alcance permitido, caso contrario informar que quedaron como pruebas fuente aisladas. La prueba visual final exige navegador, que está expresamente fuera de esta orden.

**PROHIBIDO modificar** `components/ui/lista-padrao/reporte.module.css` (global para otros reportes), `lib/reportes/**` salvo archivo NUEVO de casos arriba, `app/api/**`, SQL/migrations, funciones de exportación, `CLAUDE.md`, `PROGRESSO-NEXIT-V1.md`, órdenes, auditorías, PRO-335, PRO-328/330, NEX-076, PRO-327, certificados y emisión de FE/NCE. Si un obstáculo verdadero requiere otro archivo, PARAR y describir razón; no ampliar scope por cuenta propia.

## 4. MATRIZ DE ACEPTACIÓN (CASOS ESCRITOS; VALIDACIÓN REAL PENDIENTE)

- **CA-01**: viewport ancho 1600–1920px con sidebar: seis encabezados legibles y valores `Importe informativo` completos SIN scroll horizontal desktop; card informativo más ancho que anomalías.
- **CA-02**: viewport 1024–1366px (incluido sidebar): apilar cards si no caben, última columna legible; no dejar anomalías 50% ancho mientras tabla se corta.
- **CA-03**: viewport 360px/768px y zoom 125%/200%: cards caben ancho disponible; scroll horizontal en la TABLA solo si necesario; accesible con teclado; ninguna parte de la página genera desbordamiento global.
- **CA-04**: 4 estados NO COMPUTAN con PYG y USD y valores grandes/negativos: importe íntegro, alineación numérica legible, valores y conteos no cambian; ningún ellipsis para números.
- **CA-05**: sin estados / sin anomalías, un panel bajo con mensaje completo; no panel vacío gigantesco ni subtítulo cortado.
- **CA-06**: anomalías con cinco columnas, textos de motivo largos sin ocultar importes; wrapper de la segunda tabla también funciona.
- **CA-07**: títulos `Documentos no computados`, `Anomalías fiscales` más compactos; explicar exclusión fiscal en subtítulo sin perder significado.
- **CA-08**: botón PDF/Excel, permisos, filtros, seis vistas, moneda por fila, cálculos y reportes inalterados, PRO-335 sigue conforme.

## 5. PROTOCOLO CLAUDE Y ENTREGA

1. Leer `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, esta orden, [auditoría fuente](../analises/AUD-NEXIT-FORMATO-MONETARIO-TODAS-TELAS-E-LAYOUT-VENTAS-2026-10-29.md), `page.tsx` y `page.module.css` COMPLETOS. Verificar rama, `git status --short` y sincronización `git fetch` + `merge --ff-only`, sin perder cambios locales.
2. Desarrollar SOLO PRO-337, sin abreviar la solución a cambio de fuente o fuente de datos. No usar API ni cambiar query, PHP, PostgreSQL, Excel/PDF.
3. **NO EJECUTAR** tests, lint, typecheck, build, CI manual, SQL, VM, Docker, gateway, navegador productivo, emisión ni deploy. Escribir casos fuente (si agregados) sin ejecutar. Una revisión en navegador es obligatoria para HOMOLOGAR, pero será una autorización posterior específica.
4. Commit+push focal a branch `feature/NEXIT-2026-001-banco-demo`, reportar SHA COMPLETO, archivos modificados, casos escritos, descripción de breakpoints/containers, **TESTES NÃO EXECUTADOS**, lo que falta verificar visualmente.
5. **PARAR** para auditoría independiente ChatGPT. No iniciar PRO-333, PRO-331, PRO-332, PRO-334, ni otra issue automáticamente. PRO-335 permanece `In Review`, con conformidad solo estática.

**CRITERIO FINAL:** la última columna del card «Documentos no computados» no se pierde NUNCA. En escritorio se ve completa SIN necesidad de scroll, mediante una disposición que asigna la anchura que la tabla exige. En pantallas estrechas, la tabla puede tener scroll horizontal LOCAL y accesible sin recortar datos.
