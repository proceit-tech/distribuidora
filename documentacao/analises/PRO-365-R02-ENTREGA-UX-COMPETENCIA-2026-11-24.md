# PRO-365-R02 — Corrección visual con referencias reales — Entrega de Claude (24/11/2026)

Orden: PRO-365-R02 «Corrección visual con referencias reales» (responsable PROCEIT, 24/11/2026). HEAD base: `0cd3488a61a0557621ee7cfa60db641d58ccc98c`. Rama `feature/NEXIT-2026-001-banco-demo`, PR #7 sigue en DRAFT. R01 (`294f4e2`) no se repitió: R02 parte de ella.

Referencias usadas (abiertas y comparadas, R02-01):

- Imagen 1: `documentacao/referencias-visuais/PRO-365/01_Concorrencia_Filtros_Resumo_Tabela.png` (filtros, «Resumen de estados» en tarjetas y tabla).
- Imagen 2: `documentacao/referencias-visuais/PRO-365/02_Concorrencia_Filtros_Leyenda_Estados.png` (filtros compactos, leyenda en una franja y estados por fila).

## 1. Archivos modificados

| Archivo | Motivo |
|---|---|
| `app/(private)/documentos/page.tsx` | Estructura de filtros, «Resumen de estados» y leyenda compacta |
| `app/(private)/documentos/page.module.css` | Estilos locales de filtros, tarjetas KPI, densidad de tabla, iconos 28/36px y leyenda |
| `lib/facturacion/documentos-ux-competencia-pro365.casos.ts` | Casos nuevos PRO365-R02-01..12 y A05/A06b actualizados |
| `lib/facturacion/documentos-ux-r01.casos.ts` | UXR01-01, 04, 43 y 45 actualizados al diseño R02 |
| `lib/facturacion/documentos-ux-r02.casos.ts` | UXR02-30 (ancho 1100px) |
| `lib/facturacion/documentos-pro195-r01.casos.ts` | R01-10a (ancho 1100px) |
| `lib/facturacion/colores-tipo-documentos.casos.ts` | PRO334-20 (ancho 1100px) |
| `scripts/casos-clientes/run.js` | Solo el título de la suite PRO-365 |
| `documentacao/analises/PRO-365-R02-ENTREGA-UX-COMPETENCIA-2026-11-24.md` | Este informe |
| `CLAUDE.md` | Solo el banner de estado superior |

No se tocaron helpers de dominio (`documentos-tabla.ts`, `presentacion-sifen.ts`, `estados.ts`), APIs, SQL, migraciones, gateway, CDC, KuDE, stock, permisos ni el CSS compartido `lista.module.css`.

## 2. Matriz por imagen × NEXIT tras R01 × ajuste R02

### Imagen 1 — filtros, resumen y tabla

| Elemento de la referencia | NEXIT tras R01 | Ajuste R02 |
|---|---|---|
| Bloque «Filtros» en tarjeta propia con etiqueta sobre cada campo | Barra compartida (`ui.toolbar`) en una línea, sin etiquetas visibles en búsqueda/tipo/estado | **Tarjeta propia** con etiqueta en cada campo y rejilla compacta que se adapta al ancho |
| Filtros por Nro. Lote, Fecha Firma, casillas Aprobados/Rechazados/Ocultar cancelados/inutilizados/pendientes, historial de reprocesos | No existen | **PENDIENTE** (orden separada; necesitan soporte del backend). No se fingieron |
| Casillas de tipo (NDE, NRE, FE, NCE, AFE) | Select de tipo FE/NCE | Select conservado (NEXIT solo emite FE/NCE). NDE/NRE/AFE fuera de alcance |
| «Referencia» de iconos y «Documentos» FE/NCE/NDE/NRE/AFE | Leyenda de R01 en dos líneas | Leyenda compacta en una franja (ver imagen 2) |
| Botón «Buscar» | Filtros automáticos | Sin botón: los filtros siguen aplicándose solos (búsqueda con espera de 300 ms) |
| «Resumen de estados» con título, tarjetas uniformes (título en mayúsculas, cifra grande de color, símbolo en recuadro tenue a la derecha) | Chips en una línea con punto de color, Total primero | **Tarjetas** con título en mayúsculas, cifra de 20px con color semántico, símbolo en recuadro tenue, rejilla uniforme y **Total al final**; título de sección «Resumen de estados» |
| Subtítulo visible por tarjeta («Estado de envío a SIFEN») | Ayuda solo accesible | Se mantiene la ayuda como descripción accesible + `title` (más compacto); diferencia deliberada |
| Tarjetas «Email: pendiente» y «Lista negra» | No existen (el backend no tiene esos grupos) | **PENDIENTE**: no se inventan contadores |
| Barra «Seleccionar todos / Consultar seleccionados / Reenviar rechazados», «Exportar», «Solo vigentes rechazadas» | Casilla por fila y barra de selección propia | **PENDIENTE** (acciones masivas y exportación necesitan orden y API) |
| Zona «Arrastrar encabezados para agrupar» | No existe | **PENDIENTE** |
| Tabla densa: Acciones · Nro. Factura · Fecha Emisión · RUC/CI · Razón Social · Monto · Estado · Eventos | Diez columnas, 1180px, iconos de estado de 36px | Mismas diez columnas y orden; **1100px**, celdas 6px/10px, encabezado 8px/10px, iconos de estado **28px** en escritorio (36px en móvil) |
| Acciones: PDF, XML, consulta, correo | KuDE, XML (deshabilitado), Consulta, Correo (deshabilitado) | Sin cambios |
| Estado: tres o cuatro iconos de color | Cuatro iconos independientes | Sin cambio de lógica; más compactos |
| Eventos: «Seleccionar evento» desplegable | Texto compacto | Sin cambio: el desplegable necesita una API de eventos que no existe (**PENDIENTE**) |

### Imagen 2 — filtros compactos, leyenda y estados

| Elemento de la referencia | NEXIT tras R01 | Ajuste R02 |
|---|---|---|
| Fila de filtros: Emisión desde · Emisión hasta · Sucursal · Receptor/RUC/Nro./CDC · Estado de envío · Estado SIFEN | Orden distinto, sin etiquetas | **Mismo orden**: Emisión desde · Emisión hasta · Sucursal · Receptor/RUC/Nro./CDC · Tipo · Estado SIFEN, con las mismas etiquetas |
| Filtro «Estado de envío» | No existe en la pantalla | **PENDIENTE**: la API acepta `estadoLocal`, pero exponerlo es un cambio de estado de pantalla sin pruebas; queda para orden separada |
| Botón «Filtrar» | Filtros automáticos | Sin botón (comportamiento conservado); «Limpiar filtros» y el contador a la derecha |
| Leyenda «Estado: ✓ Envío · XML · SIFEN · Correo» en una franja | Leyenda en dos líneas con explicación larga visible | **Una franja**: «Estado: Envío · XML/CDC · SIFEN · Correo» + símbolos; la explicación larga queda solo para lectores de pantalla |
| «Mostrar 25 registros» | 20 por página | **PENDIENTE** (la API acepta `tamano`, pero no se agregó sin orden) |
| Buscar sobre la tabla | Búsqueda en filtros | Sin cambio (una sola búsqueda) |
| Estados por fila: check, nube, prohibido, sobre | Cuatro iconos (Envío, XML/CDC, SIFEN, Correo) | Mismo orden y significado; RECHAZADO real en el icono SIFEN con código y motivo en el detalle (de R01) |
| Paginación Anterior / 1 / Siguiente | Paginación propia | Sin cambio |

## 3. Cambios concretos

- **Filtros:** tarjeta `tarjetaFiltros` con rejilla `auto-fill` (mínimo 160px), etiqueta sobre cada campo (contraste 8,2:1), campos de 36px, búsqueda en dos columnas (toda la fila en móvil), contador y «Limpiar filtros» a la derecha. Son los mismos seis filtros y el mismo comportamiento.
- **KPIs:** sección «Resumen de estados» con título; ocho tarjetas de 64px en rejilla (mínimo 170px) con título, cifra REAL del servidor (incluido RECHAZADO, «—» mientras el recorte es de otro contexto), símbolo de su grupo en un recuadro tenue y Total al final. Siguen siendo botones-filtro (`aria-pressed`). Colores: pendiente de envío ámbar, pendiente de respuesta azul, aprobado verde, rechazado rojo, e-mail enviado violeta, error de e-mail rojo, sin e-mail gris y Total turquesa.
- **Tabla:** ancho mínimo 1100px (antes 1180px), celdas más bajas y encabezado más compacto. Columnas y orden sin cambios.
- **Acciones:** sin cambios; XML y Correo siguen deshabilitados con su motivo.
- **Estados:** iconos de 28px en escritorio y 36px en móvil (área táctil). Sin cambios de lógica.
- **Leyenda:** una franja compacta.
- **Eventos:** sin cambios respecto de R01 (ya compacto).

## 4. Contraste (calculado a mano, no medido en navegador)

Cifra y símbolo de cada grupo, sobre blanco / su fondo tenue / tarjeta activa `#f3fbfb`:

| Grupo | Blanco | Fondo tenue | Activa |
|---|---|---|---|
| Turquesa `#0b6f74` | 5,93 | 5,29 | 5,65 |
| Ámbar `#8a5a00` | 5,93 | 5,38 | 5,65 |
| Azul `#1d5799` | 7,30 | 6,36 | 6,96 |
| Verde `#12703f` | 6,15 | 5,42 | 5,86 |
| Rojo `#b42318` | 6,57 | 5,75 | 6,26 |
| Violeta `#5b3fb3` | 7,48 | 6,39 | 7,13 |
| Gris `#4a5a6a` | 7,09 | 6,30 | 6,75 |

Todos superan 4,5:1. Títulos de tarjeta y etiquetas de filtro `#3d5165`: 8,19:1.

## 5. Criterios R02-01 a R02-12

| Criterio | Estado |
|---|---|
| R02-01 imágenes abiertas y comparadas | Hecho (punto 2) |
| R02-02 filtros revisados | Hecho; los que faltan quedan pendientes |
| R02-03 KPIs compactos con datos reales | Hecho |
| R02-04 tabla profesional | Hecho en fuente; sin verificación visual |
| R02-05 acciones y estados distintos | Sin cambios (conforme) |
| R02-06 cuatro indicadores en cada fila | Sin cambios (conforme) |
| R02-07 estados reales, rechazado sin reclasificar | Sin cambios (conforme) |
| R02-08 leyenda compacta | Hecho |
| R02-09 Eventos compacto | Sin cambios (conforme desde R01) |
| R02-10 FE/NCE, filtros, paginación, selección, permisos, precisión monetaria y accesibilidad | Preservados |
| R02-11 límites visuales documentados | Punto 8 |
| R02-12 funciones que necesitan API quedan pendientes | Punto 6 |

## 6. Funciones de la competencia no soportadas (PENDIENTE, orden separada)

Filtros por Nro. Lote, Fecha Firma, Estado de envío y casillas de estado; casillas de tipo NDE/NRE/AFE; tarjetas «Email: pendiente» y «Lista negra»; consulta y reenvío masivos; «Solo vigentes rechazadas»; Exportar; agrupación por encabezado; selector de registros por página; desplegable de eventos por fila; subtítulo visible en cada tarjeta. Ninguna se fingió.

## 7. Casos de regresión (ESCRITOS, NO EJECUTADOS)

- Nuevos: PRO365-R02-01..12 en `lib/facturacion/documentos-ux-competencia-pro365.casos.ts` (orden y etiquetas de filtros, sin filtros nuevos, CSS de filtros, título del resumen, ocho tarjetas con su color y símbolo y Total al final, cifra real y botón-filtro, tamaños de tarjeta, contraste AA calculado desde el CSS, densidad de tabla e iconos 28/36px, leyenda compacta, acciones intactas, sin barra compartida anterior).
- Actualizados porque exigían el diseño anterior (no para forzar un verde): UXR01-01, UXR01-04, UXR01-43, UXR01-45, UXR02-30, R01-10a, PRO334-20, PRO365-A05 y PRO365-A06b.
- Se verificó a mano que el CSS no tiene clases huérfanas ni referencias rotas (criterio de UXR01-46).
- No se ejecutaron tests, lint, typecheck, build, CI manual, SQL ni navegador.

## 8. Límites de la homologación visual

Nada se vio en un navegador: ni 1366, ni 1920, ni móvil, ni zoom. La rejilla de filtros y la de tarjetas se adaptan por `auto-fill`, así que la cantidad de columnas real depende del ancho disponible con la barra lateral. La pantalla **no está homologada**: la confirma el responsable comparándola con las dos capturas.

## 9. Riesgos de regresión

1. La rejilla de tarjetas puede quedar con una fila incompleta según el ancho (por ejemplo 6 + 2 en 1366); no rompe la lectura.
2. Iconos de estado de 28px en escritorio: el área táctil baja de 36 a 28px en pantallas de más de 720px con puntero táctil (tabletas en horizontal).
3. Total pasó al final del resumen: quien lo buscaba primero lo encuentra en otro lugar.
4. Con 1100px la tabla sigue necesitando scroll horizontal en 1366 con barra lateral abierta.
5. Los títulos largos de tarjeta pueden partir en dos líneas en anchos intermedios.

## 10. Recomendación para la auditoría ChatGPT

Revisar la matriz del punto 2 contra las dos PNG, los casos PRO365-R02-01..12 y los casos actualizados, y confirmar que no hay cambios fuera de la pantalla. Si se aprueba, pedir al responsable la verificación visual en 1366, 1920 y móvil y decidir si alguna función del punto 6 merece una orden propia (la más simple sería exponer «Estado de envío» y «registros por página», que la API ya acepta).
