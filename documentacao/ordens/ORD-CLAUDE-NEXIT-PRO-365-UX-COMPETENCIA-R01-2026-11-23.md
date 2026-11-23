# ORDEN ÚNICA CLAUDE — PRO-365 / NEXIT-DOC-UX-COMPETENCIA-R01 — 23/11/2026

## Decisión inequívoca del responsable

**REFERENCIA VISUAL PRINCIPAL Y OBLIGATORIA:** las DOS capturas de la **competencia** compartidas por el responsable el 23/11/2026. **NO** confundirlas con la captura de NEXIT ni con la captura del sistema propio BSERP. BSERP está más próximo a la referencia y puede servir para identificar diferencias, **PERO NO ES LA FUENTE DE VERDAD DE DISEÑO**. La pantalla actual de NEXIT `/documentos` ha sido rechazada visualmente por el responsable; no se trata de una sugerencia decorativa.

Las capturas de competencia son material de referencia aportado por el usuario en el chat, **no están adjuntas a este archivo Git**. En la ejecución, coteja ambas imágenes facilitadas por el responsable. Si Claude no tiene acceso visual directo a las dos capturas, **no inventar similitud visual o un "95% igual"**: pedir que se adjunten al mismo hilo de desarrollo antes de afirmar conformidad. La descripción funcional de esta orden sí es vinculante y no depende de inventar datos de las imágenes.

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

## Alcance de archivos y seguridad

Autorizada exclusivamente la **autoría de UI de Documentos electrónicos y casos escritos de regresión** en archivos existentes directamente necesarios, especialmente `app/(private)/documentos/page.tsx`, `app/(private)/documentos/page.module.css` y los casos pertinentes. Reutilizar `lib/facturacion/presentacion-sifen.ts` sin modificar su contrato fiscal; tocar helpers puros SOLO si demuestra necesidad y sin reinterpretar estados. Ninguna biblioteca visual nueva sin justificación y autorización.

**NO MODIFICAR:** migraciones NEX-001…083, esquema, SQL, runner, gateway SIFEN, parser/respuestas, CSV/XLSX, stock, secuencias, CDC, folios, NCE/FE, PDF/KuDE funcional, permisos, usuarios, empresas, APIs ni otros sistemas (BSERP/FACTUNEX). No borrar/cambiar `RECHAZADO` real, no añadir/grant permisos, no iniciar PRO-357, PRO-313, PRO-199 ni reabrir la corrección de DB.

**NO EJECUTAR MANUALMENTE** pruebas/lint/build/typecheck/CI, SQL/psql, VM, Docker, gateway, deploy o merge. CI automático desencadenado por push puede observarse e informarse sin confundirse con homologación visual. PR #7 queda DRAFT.

## Entrega y parada

Publicar **un lote de código** con SHA completo, diff y lista de archivos, matriz de comparación con ambas capturas, qué se corrigió en iconos/estados/acciones/eventos/filtros,  casos de regresión escritos **NO EJECUTADOS**, accesibilidad y riesgos. No afirmar equivalencia visual ni cerrar la tarea sin comparar las imágenes; si las capturas no están disponibles para Claude, decláralo expresamente en el informe y solicita su adjunto.

**STOP obligatorio tras commit/push para auditoría ChatGPT.** No iniciar segunda ronda ni desplegar en VM por iniciativa propia.
