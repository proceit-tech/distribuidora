# PRO-365 / NEXIT-DOC-UX-COMPETENCIA-R01 — Entrega de Claude (24/11/2026)

Orden: `documentacao/ordens/ORD-CLAUDE-NEXIT-PRO-365-UX-COMPETENCIA-R01-2026-11-23.md`. HEAD base: `0aea05698b848b55e6c06eddbebda09b0df77c49`. Rama `feature/NEXIT-2026-001-banco-demo`, PR #7 DRAFT.

## 0. Limitación declarada: capturas de la competencia NO recibidas

Las dos capturas de la competencia **no llegaron** a esta sesión: no hay adjuntos en el hilo, ni en la carpeta de subidas del proyecto, ni en el repositorio. Por eso:

- **No se afirma paridad visual** con la competencia ni se inventan detalles de sus pantallas.
- La matriz del punto 3 se llena con lo que la **orden escrita** describe de cada captura; las columnas «Competencia» deben ser confirmadas por el auditor con las imágenes.
- Se implementó solo la parte que la orden fija por texto (cuatro indicadores por fila, acciones separadas, Eventos compacto, sin «Rechazado» enorme). Una segunda ronda visual requiere las dos capturas adjuntas **y** una captura de NEXIT renderizada.

## 1. Qué cambió

Archivos funcionales: `app/(private)/documentos/page.tsx`, `app/(private)/documentos/page.module.css`. Ningún otro archivo funcional, API, SQL, migración, gateway, CDC, KuDE, stock ni permiso.

| Tema | Antes (PRO-195-UX-R01) | Ahora (PRO-365) |
|---|---|---|
| Estado por fila | UN estado principal con texto grande (p. ej. «Rechazado») + línea secundaria; los cuatro ejes solo en el Historial técnico | Los **cuatro iconos independientes** `iconosEstado(d)` en orden fijo Envío · XML/CDC · SIFEN · Correo, cada uno enfocable (role=img, aria-label, tooltip en mouse/foco/toque), + aviso «!» opcional (hueco fijo de 36px si no hay aviso para alinear filas). Sin texto de estado |
| RECHAZADO real | Texto rojo grande | Icono SIFEN cruz roja (tono error); el tooltip añade «Motivo registrado: …» solo si `detalleFiscalPrimario` registra rechazo y mensaje. Estado, contador y KPI sin cambios |
| Acciones | Columna Acciones (KuDE, XML, Consulta, Correo) | Sin cambios: misma columna, separada de los estados. XML y Correo siguen deshabilitados con motivo (sin endpoint); KuDE y Consulta con su ACL, guardas y debounce |
| Eventos | Texto + «Cancelación: No disponible» + «Inutilización: No disponible» en cada fila | Compacto: situación acreditada o «Sin información» (con «de eventos» para lectores de pantalla). La indisponibilidad va en el nombre accesible/tooltip del control y completa en la segunda capa. Nunca «sin eventos». No se emite ningún evento |
| Leyenda | Retirada en PRO-195 | **Una** leyenda compacta sobre la tabla (orden de los cuatro estados + símbolos), referida con `aria-describedby` |
| Filtros, orden, paginación, selección, KPIs | — | Sin cambios |
| CSS | Clases `estadoPrincipal`, `estadoAprobado/Rechazado/Pendiente/SinInfo/Anulado`, `estadoSecundario`, `eventosTexto`, `eventoOperacion` | Retiradas (sin uso). Nuevas: `iconoVacio`, `leyendaEstados`, `leyendaSimbolos`, `leyendaSimbolo`. `.estado` en una línea en escritorio; en móvil puede pasar a la línea siguiente |

`estadoPrincipalFila` sigue exportada en `lib/facturacion/documentos-tabla.ts` (la usan casos puros), pero la pantalla ya no la usa.

## 2. Criterios A01–A10 de la orden

| Criterio | Estado | Nota |
|---|---|---|
| A01 identificación, acciones, cuatro estados, eventos | Hecho en fuente | Diez columnas sin cambio de orden; la celda Estado ahora tiene los cuatro iconos |
| A02 no hace falta el Historial técnico | Hecho | Los cuatro iconos en la fila; la segunda capa los repite con nombre |
| A03 RECHAZADO fiel, ejes independientes | Hecho | `iconosEstado` no cambió (contrato fiscal intacto); solo se añade el motivo registrado al tooltip SIFEN |
| A04 XML/Correo no simulan uso | Sin cambios | `accionesFila` intacta |
| A05 Eventos compacto, «Sin información» ≠ «sin eventos» | Hecho | |
| A06 filtros actuales intactos, nuevos no fingidos | Sin cambios | Filtros nuevos: ver punto 4 |
| A07 KPI/contador RECHAZADO del backend | Sin cambios | No se tocó estado ni dato |
| A08 monto exacto | Sin cambios | `formatearImporteMoneda` intacto |
| A09 1366/1920 y móvil 320–720 | **No verificado visualmente** | Escritorio: tabla de 1180px mínimo con scroll local; celda Estado unos 180px en una línea. Móvil: tarjeta en grid; los estados tienen su línea (por debajo de 440px) o van junto al número (desde 440px), con salto de línea de seguridad |
| A10 comparación por imagen | **Bloqueado** | Faltan las capturas; ver punto 3 |

## 3. Matriz competencia × NEXIT × ajuste (pendiente de las imágenes)

| Elemento (según la orden) | Competencia | NEXIT tras PRO-365 | Ajuste / decisión |
|---|---|---|---|
| Encabezado y título | Sin captura | «Documentos electrónicos» con acciones de contorno | Sin cambio |
| Filtros avanzados (lote, fecha de firma, etc.) | Sin captura | Filtros actuales | PENDIENTE: necesita orden separada y soporte del backend |
| Tipo de documento FE/NCE | Sin captura | Código + color de acento por tipo | Sin cambio |
| Resumen/KPIs | Sin captura | KPIs actuales del backend | Sin cambio |
| Selección y acciones masivas | Sin captura | Casilla por fila, sin acciones masivas | PENDIENTE: acciones masivas (consulta/reenvío/exportación) necesitan orden separada |
| Agrupación por columna | Sin captura | No existe | PENDIENTE: necesita orden separada |
| Tabla y columnas | Sin captura | Diez columnas | Sin cambio de orden |
| Acciones por fila | Sin captura | KuDE, XML (deshabilitado), Consulta, Correo (deshabilitado) | Separadas de los estados |
| Estado (cuatro indicadores) | Sin captura | Cuatro iconos + aviso | **Implementado** |
| Eventos | Sin captura | Compacto | **Implementado** |
| Lista y paginación | Sin captura | 20 por página | Sin cambio; selector de tamaño de página PENDIENTE |
| Otros tipos (NDE/NRE/AFE) | Sin captura | No soportados | Fuera de alcance |

## 4. Fuera de alcance (requiere orden separada)

Filtros por lote o fecha de firma, acciones masivas (consulta, reenvío, exportación), agrupación por columna, selector de tamaño de página y nuevos tipos de documento. No se fingió ninguno.

## 5. Casos de regresión (ESCRITOS, NO EJECUTADOS)

- Nuevo: `lib/facturacion/documentos-ux-competencia-pro365.casos.ts` (PRO365-A01a…A07, 16 comprobaciones), registrado en `scripts/casos-clientes/run.js`.
- Actualizados porque exigían el diseño revocado por PRO-365 (no para forzar un verde): `documentos-pro195-r01` (R01-01b, R01-03c/d, R01-05b, R01-10c, R01R01-F003b/d/e), `documentos-ux-r01` (UXR01-07, 11, 13, 21, 22, 45), `documentos-ux-r02` (UXR02-30), `colores-tipo-documentos` (PRO334-16), `flujo-fiscal-pro342` (R04-UX01a, F8b/F8c), `facturacion.casos` (línea del estado por fila).
- No se ejecutaron tests, lint, typecheck, build, CI manual, SQL ni navegador. El CI automático que dispare el push no se siguió.
- El contraste de los trazos de los iconos (verde, azul, ámbar, rojo y gris) se calculó a mano con los colores del CSS: todos están entre 5,3:1 y 7,3:1 sobre blanco, hover y fila seleccionada.

## 6. Accesibilidad

Cada icono es enfocable con nombre accesible completo, y el tooltip se abre con mouse, foco y toque y se cierra con Escape. La leyenda está asociada a la tabla con `aria-describedby`. El color nunca es la única señal: cada estado tiene su propio símbolo. «Sin información» lleva «de eventos» para lectores de pantalla. La celda de estados es un grupo con nombre («Estados de …»).

## 7. Riesgos

1. Sin verificación visual en 1366, 1920 ni móvil (no se abrió el navegador).
2. Un documento con cancelación acreditada solo por evento (`eventosFe`) con `estadoSifen` todavía no CANCELADO ya no se ve como estado de la fila: aparece en la columna Eventos. El icono SIFEN muestra el estado fiscal persistido, sin reclasificarlo.
3. La línea secundaria «Error de envío (no es rechazo SIFEN)» ya no aparece como texto: ahora la lleva el icono Envío (cruz roja) en su tooltip.
4. La paridad con la competencia sigue pendiente hasta tener las dos capturas.
