# ORDEN ÚNICA CLAUDE — PRO-365 / NEXIT-DOC-UX-COMPETENCIA-R01 — 23/11/2026

> **ESTADO DE EJECUCIÓN AL 24/11/2026:** R01 ya desarrollada por Claude en el commit `294f4e29619e54e71d8afcab425d7f3f171881ae`; auditoría ChatGPT [parcial conforme técnico, CI verde, homologación visual pendiente](../testes/AUD-CHATGPT-NEXIT-PRO-365-UX-COMPETENCIA-R01-2026-11-24.md). Las dos capturas ahora se encuentran aquí en el Git: **su disponibilidad habilita la comparación visual**, pero **NO autoriza automáticamente una ronda R02, cambios adicionales, pruebas manuales, VM, deploy o merge**. Cualquier correctivo después del análisis requiere autorización separada.

## Decisión inequívoca del responsable

**REFERENCIA VISUAL PRINCIPAL Y OBLIGATORIA:** las DOS capturas de la **competencia** compartidas por el responsable el 23/11/2026. **NO** confundirlas con la captura de NEXIT ni con la captura del sistema propio BSERP. BSERP está más próximo a la referencia y puede servir para identificar diferencias, **PERO NO ES LA FUENTE DE VERDAD DE DISEÑO**. La pantalla actual de NEXIT `/documentos` ha sido rechazada visualmente por el responsable; no se trata de una sugerencia decorativa.

**ACTUALIZACIÓN 24/11/2026 — LAS DOS CAPTURAS ORIGINALES YA ESTÁN EN EL GIT.** Abrir directamente [Referencia 1: Filtros/Resumen/Tabla](../referencias-visuais/PRO-365/01_Concorrencia_Filtros_Resumo_Tabela.png) y [Referencia 2: Filtros/Leyenda/Estados](../referencias-visuais/PRO-365/02_Concorrencia_Filtros_Leyenda_Estados.png). Índice visual: [README de referencias](../referencias-visuais/PRO-365/README.md). Son PNG originales sin modificaciones, SHA-256 comprobado, no capturas de BSERP o NEXIT. **Claude debe ver AMBAS desde el Git antes de volver a comparar. NO pedir al responsable que vuelva a enviarlas.** No declarar paridad visual sin cotejo con NEXIT renderizado. Los dos archivos están en la propia rama/PR #7.

**Objetivo:** pantalla de documentos electrónicos de NEXIT comparable a la referencia en **jerarquía visual, organización funcional, legibilidad, densidad profesional, controles e iconografía**; implementar con design tokens y código propios, sin copiar código, imágenes, CSS o identidad gráfica de la competencia. Mantener NEXIT multiempresa y condiciones reales de acceso.

## Fuente de código y origen exacto del problema

- Repositorio `proceit-tech/distribuidora`, PR **#7 DRAFT**, rama `feature/NEXIT-2026-001-banco-demo`. Baseline `5417cae6bf9cba0d799b63f26dee7e4105876e25`; confirmar HEAD al iniciar. Nueva issue [PRO-365](https://linear.app/proceit/issue/PRO-365/nexit-ux-p0-alinear-documentos-electronicos-con-la-referencia-visual), bajo PRO-195.
- Tras la actualización de VM: NEX-082 y NEX-083 aplicadas y verificadas en DB real; nueva imagen `nexit-app:teste` construida; el último resultado recibido NO acredita que `nexit-app` haya sido recreado y revisado después del build. **No acceder a la VM ni hacer despliegue con esta orden.**
- En `app/(private)/documentos/page.tsx:992–1003` se presenta **una sola etiqueta principal** de `estadoPrincipalFila()`, típicamente `Rechazado`, en vez del conjunto de indicadores de fase por documento. En `page.tsx:1119–1126`, PRO-195-UX-R01 trasladó `iconosEstado(d)` al **Historial técnico** cerrado por defecto. Esta fue la regresión UX a corregir.
- `lib/facturacion/presentacion-sifen.ts:238–241` ya proporciona cuatro estados INDEPENDIENTES, `Envío · XML/CDC · SIFEN · Correo`, con símbolos, colores y texto accesible; reutilizar, no duplicar lógica fiscal.
- `lib/facturacion/documentos-tabla.ts:88–105` separa ACCIONES KuDE/XML/Consulta/Correo: XML y Correo están deshabilitados porque NO hay endpoint comprobado; NO hacerlos clicables por estética.
- `lib/facturacion/shared.ts:167–173` hace conteos por estado persistido; `RECHAZADO` deriva de `d.estado_sifen = 'RECHAZADO'`. La captura de NEXIT muestra 15 rechazados, pero no demuestra error en el estado fiscal. **PROHIBIDO cambiar/ocultar/reclasificar estados o totales para mejorar apariencia**. Retirar el texto grande `Rechazado` de la celda no equivale a eliminar esa condición real: debe expresarse por el indicador SIFEN, tooltip y detalles pertinentes.

## Fase A — comparación visual y contrato de presentación

Antes de editar, lee `CLAUDE.md`, esta orden, `documentacao/definicoes/REQ-DOC-UX-DESKTOP-2026-10-20.md`, la orden/historial PRO-195, PRO-342 y código COMPLETO más reciente de la pantalla, estilos, helpers y casos (un archivo por vez). Construye una **matriz referencia competencia × NEXIT × ajuste requerido**, cubriendo: barra de filtros, uso de anchura, número de columnas, selección, orden, tamaño y alineación de iconos, interpretación de los estados, eventos, expansión, leyenda, jerarquía tipográfica, paginación y mobile. No introducir datos ni funcionalidades deducidas sin contrato.

El modo visual de BSERP es una referencia secundaria de que se pueden presentar cuatro estados compactos sin texto `Rechazado` ocupando la fila; no convertirlo en la maqueta principal.

## Fase B — corrección UX permitida

1. **Estado por factura en la fila, nunca oculto:** mostrar **cuatro iconos independientes y simultáneos**, orden fijo **Envío | XML/CDC | SIFEN | Correo**. Cada icono con estado real, forma reconocible, contraste, nombre accesible `aria-label` y tooltip accesible en teclado, foco y toque. Una leyenda corta por encima de la tabla aclara los cuatro ejes una única vez; no llenar cada fila con textos de explicación. Un fallo SIFEN se ve en el icono SIFEN, no como una gran palabra en `Estado`. No usar icono de ACK como prueba de APROBADO ni confundir CDC firmado con aceptación fiscal.
2. **Acciones no son estados:** la columna `Acciones` conserva KuDE/PDF, XML, Consulta SIFEN y Correo cuando existen en el contrato, con iconos claros y clicables SOLO si hay funcionalidad autorizada, permiso y estado vigente. Para XML/Correo sin endpoint comprobado: deshabilitar con explicación real al foco/tooltip o no mostrar según la referencia; **no simular resultado**. Conservar consulta sin reenvío y bloqueo contra doble acción/respuesta tardía.
3. **Eventos:** mantener columna independiente, visualmente compacta como la competencia: estado/evento real o texto breve sin información acreditada; no repetir en todas las filas párrafos de `Cancelación: No disponible`, `Inutilización: No disponible`. Motivos ampliados van en tooltip, detalle o acción contextual deshabilitada. No inventar eventos ni habilitar cancelación/inutilización de número sin API/flujo homologado; PRO-313/PRO-199 no se reabren.
4. **Tabla y filtros:** priorizar el mismo patrón de jerarquía y densidad operativa de la competencia, usando la información disponible: acciones, número fiscal y tipo/serie, fecha/hora, RUC/CI, razón social, importe con moneda exacta, estados, eventos. Tabla blanca, filas compactas alineadas, separación clara, encabezados legibles, no desperdiciar ancho en leyendas repetidas. Si la competencia utiliza selector/filtros agrupados, adecuar solo los filtros implementados en la API y preservar los actuales; NO inventar filtros. Si hay KPIs/resúmenes, su prioridad y alcance deben seguir las capturas y deben representar datos del backend; nada de conteos falsos ni de cambios de agrupación SQL por iniciativa propia.
5. **Detalle progresivo:** expansión conserva lote, CDC literal, fecha de firma, código+mensaje fiscal real y copiar; histórico técnico permanece para intentos, JSON y trazas, **no como único sitio para saber los cuatro estados**. Si un documento es realmente RECHAZADO, se puede leer código/motivo en detalle; no ocultarlo.
6. **Diseño responsivo profesional:** revisión visual comparativa en desktop de 1366 y 1920 px y mobile (320–720), sin iconos minúsculos, sin columnas superpuestas, sin información crítica inaccesible. Accesibilidad teclado, focus, `aria-label`, tooltip no truncado por scroll, contraste y estados por símbolo+color.
7. **Sin regresión de negocio:** conservar filtros/orden/paginación/selección por contexto, UTC vs hora mostrada, bigint/NUMERIC sin pérdida, multiempresa/sucursal, ACL, FE/NCE, CDC, gateway, KuDE modal y datos existentes. Si un ajuste requiere API nueva, SQL o cambio de estado fiscal, **DETENER esa parte** y documentar dependencia en vez de extender el scope.

## Anexo vinculante — comparación explícita de ambas capturas de la competencia

Estas observaciones **derivan de lo visible en las dos capturas aportadas por el responsable**, no prueban operaciones de backend. **Las dos imágenes son de la competencia** y se complementan: una vista con panel de filtros/resumen avanzado y una vista con filtros compactos, leyenda y fila operativa. **NO** asumir que la competencia tiene exactamente cuatro iconos en todas sus variantes: distinguir estados visibles y leyenda, y satisfacer el requisito NEXIT de cuatro fases independientes sin sobrecarga.

### Lista visual obligatoria de comparación

| Área | Referencia vista en competencia | Obligación NEXIT R01 |
|---|---|---|
| Encabezado | Título claro de Documentos/Facturas electrónicas, en una cabecera ordenada | Utilizar título y contexto actuales sin desperdiciar altura; no rediseñar navegación global |
| Filtros avanzados | Contenedor `Filtros` plegable; controles tipo Nro. lote, sucursal, fecha emisión, fecha firma; checkboxes para estados/ocultar ciertos grupos | Separar filtros rápidos y avanzados **SOLO si cada filtro tiene contrato real**; si fecha firma, lote u otros no existen en API, registrarlos como dependencia y no dibujar selectores falsos; conservar filtros actuales |
| Tipo de documento | Opciones FE, NCE, NDE, NRE, AFE con marca visual diferenciada | Mostrar solamente tipos soportados/habilitados; no inventar FE/NCE ni cambio de numeración/serie |
| Resumen | Sección de tarjetas compactas para pendientes de envío/respuesta, aprobados/rechazados, estado de correo, total y otras categorías | Mantener KPIs útiles con nombre/alcance inequívoco, fuente REAL y semántica independiente; no cambiar SQL global/filtrado sin autorización; categorías sin fuente quedan pendientes y NO simuladas |
| Selección | Casillas de selección, toolbar de consulta/reenvío agrupado y exportación visibles en la referencia | Conservar selección real actual; operaciones masivas/exportación SOLO si backend/ACL existen; de lo contrario indicar explícitamente no disponibles sin botones falsamente operativos |
| Agrupación | Área para organizar/arrastrar encabezados o agrupar columnas | No simular drag/drop o grupo si no hay lógica; documentar como fase futura separada |
| Tabla | Tabla blanca compacta con Acciones, Nro. Factura, Fecha Emisión, RUC/CI, Razón Social, Monto, Estado, Eventos; FE/NCE como marcas pequeñas | Usar esta jerarquía visual en NEXIT; alinear importes y monedas; condensar metadatos, sin sacrificar serie fiscal, orden y relación NCE/FE |
| Acciones | Iconografía operacional pequeña de colores (PDF, XML/archivo, consulta, correo), por documento | Separar completamente iconos **de acción** de iconos **de estado**. Disponibilidad real y tooltip obligatorio; XML y correo sin endpoint confirmado quedan inactivos |
| Estado | Símbolos pequeños y secuenciales en la línea; leyenda independiente de significados | Mostrar SIEMPRE por documento **Envío, XML/CDC, SIFEN y Correo**, desde `iconosEstado`; icono SIFEN expresa estado real (incluidos rechazados); texto grande `Rechazado` NO sustituye cuatro fases; no confundir ACK, XML y aprobación |
| Eventos | Selector/acción contextual compacta en cada línea | Evitar tres líneas repetidas por factura; mostrar situación acreditada o ausencia de información; no fingir `Documento cancelado` sin evento oficial correlacionado, sin habilitar cancelación/inutilización ficticia |
| Lista y paginación | Selector de registros por página, búsqueda local visible y controles compactos | Preservar paginación/búsqueda server-side, límites reales y filtros; no ofrecer 25/50/100 si API no lo soporta; la lista no debe ocultar columnas críticas |
| Usabilidad | Los iconos y textos principales caben en una misma línea operativa sin enormes tarjetas por factura | Densidad y contraste profesional a 1366 y 1920 px; no copiar los colores corporativos de competencia; mobile muestra cuatro estados y acciones accesibles sin superponer |

### Criterios explícitos de aceptación visual/funcional

- **A01:** En desktop, la fila conserva identificación fiscal, serie si existe, FE/NCE, fecha/hora, cliente, moneda/importe, columna de Acciones, cuatro estados y Eventos, con alineación limpia. La captura de referencia manda en jerarquía, no en copia de estilos.
- **A02:** Ningún documento requiere abrir `Historial técnico` para identificar Envío, XML/CDC, SIFEN o Correo. Los cuatro se representan con iconos y tooltips de significado inequívoco.
- **A03:** Documento real `RECHAZADO`: indicador SIFEN señala rechazo; el detalle muestra código y motivo cuando están registrados. `APROBADO`, `PENDIENTE`, `XML firmado`, errores de red/gateway y correo permanecen categorías independientes sin reclasificar.
- **A04:** Acciones inactivas XML/correo no simulan uso; KuDE y consulta conservan ACL y sus guardas, sin reenvío accidental ni doble clic.
- **A05:** Eventos se leen en formato compacto. "Sin información" no equivale a "sin eventos". Cancelación/Inutilización indisponibles se explican en contexto, no como texto repetitivo por fila; nunca se emite un evento nuevo en este trabajo.
- **A06:** Los filtros actuales operan sin mezclas de recortes/empresas, sin hacer accionables datos obsoletos durante debounce y sin reset inesperado de selección/página; los filtros nuevos sin soporte se documentan, no se fingen.
- **A07:** KPI y contador RECHAZADO conservan el valor del backend sin alterar estados ni datos de producción. Antes de afirmar que hay errores de clasificación, solicitar evidencia del campo persistido, intentos SIFEN y código/mensaje, mediante diagnóstico **solo escrito**, jamás ejecutado por Claude.
- **A08:** Monto fiscal se representa con texto DECIMAL exacto, PYG y monedas extranjeras sin truncamiento/redondeos espurios; nombres/RUC/número no se cortan sin tooltip y identificación accesible.
- **A09:** A 1366px y 1920px, las cuatro fases son legibles, la tabla no desperdicia espacio ni produce superposición. En móvil, 320–720px conserva estados y acciones con foco/teclado/touch.
- **A10:** La comparación documenta de forma verificable, por cada una de las dos imágenes: elementos reproduzibles, no soportados, diferencias con NEXIT y decisiones UX; no declara "igual a la competencia" sin captura de NEXIT renderizada y examinada.

### Restricción adicional de implementación

Esta orden es un **correctivo UI R01, no un proyecto nuevo de backend**. No añadir nuevas opciones de filtros, agrupamiento, exportación, consulta masiva, envio masivo, blacklist, fechas firma o controles de reproceso cuando carecen de operación y autorización. Aunque figuren en la referencia, declararlos `PENDIENTE / requiere orden separada`. Preservar los indicadores ya existentes y su consulta de resumen, sin hacerlos desaparecer solo para ganar espacio; reorganizar únicamente la presentación en la medida requerida por la competencia.

## Alcance de archivos y seguridad

Autorizada exclusivamente la **autoría de UI de Documentos electrónicos y casos escritos de regresión** en archivos existentes directamente necesarios, especialmente `app/(private)/documentos/page.tsx`, `app/(private)/documentos/page.module.css` y los casos pertinentes. Reutilizar `lib/facturacion/presentacion-sifen.ts` sin modificar su contrato fiscal; tocar helpers puros SOLO si demuestra necesidad y sin reinterpretar estados. Ninguna biblioteca visual nueva sin justificación y autorización.

**NO MODIFICAR:** migraciones NEX-001…083, esquema, SQL, runner, gateway SIFEN, parser/respuestas, CSV/XLSX, stock, secuencias, CDC, folios, NCE/FE, PDF/KuDE funcional, permisos, usuarios, empresas, APIs ni otros sistemas (BSERP/FACTUNEX). No borrar/cambiar `RECHAZADO` real, no añadir/grant permisos, no iniciar PRO-357, PRO-313, PRO-199 ni reabrir la corrección de DB.

**NO EJECUTAR MANUALMENTE** pruebas/lint/build/typecheck/CI, SQL/psql, VM, Docker, gateway, deploy o merge. CI automático desencadenado por push puede observarse e informarse sin confundirse con homologación visual. PR #7 queda DRAFT.

## Entrega y parada

Publicar **un lote de código** con SHA completo, diff y lista de archivos, matriz de comparación con ambas capturas, qué se corrigió en iconos/estados/acciones/eventos/filtros,  casos de regresión escritos **NO EJECUTADOS**, accesibilidad y riesgos. No afirmar equivalencia visual ni cerrar la tarea sin comparar las imágenes; las capturas ya están versionadas bajo `documentacao/referencias-visuais/PRO-365/`; se deben abrir desde Git. Para validar paridad visual hace falta además evidencia renderizada de NEXIT. No solicitar al responsable reenviar las capturas.

**STOP obligatorio tras commit/push para auditoría ChatGPT.** No iniciar segunda ronda ni desplegar en VM por iniciativa propia.
