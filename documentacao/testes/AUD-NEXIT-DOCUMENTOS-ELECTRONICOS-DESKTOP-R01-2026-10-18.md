# AUD-NEXIT-DOCUMENTOS-ELECTRONICOS-DESKTOP-R01 — Auditoría funcional y comparación con referencias de mercado

**Fecha:** 18/10/2026. **Menú:** Facturación → Documentos electrónicos. **Ruta:** /documentos. **Rama:** feature/NEXIT-2026-001-banco-demo. **Estado:** diagnóstico estático documentado — NO HOMOLOGADO — sin autorización de implementación para Claude.

## 1. Método, evidencia y limitaciones

**Fuentes:** 2 capturas aportadas por el responsable como referencia visual/funcional de la competencia; CLAUDE.md y documentacao/PROTOCOLO-IA.md actuales; navegación, ficha del menú, progreso NEXIT, código de app/(private)/documentos/page.tsx (514 líneas), layout, APIs app/api/documentos/route.ts y [id]/{route,enviar/route,consultar/route}.ts; lib/facturacion/{shared,estados,refresco-documentos,servidor,envio,gateway,reconciliacion}.ts, componentes de fecha y pruebas versionadas facturacion.casos.ts/fat-e2.casos.ts. Referencia: página blob 9f326f1ccbc4ef187541e5f98bcd3a5a7ff0c7e0; shared.ts blob 8bd124890d52de044a1c933e6420c23c572a21cb. Estos blobs no prueban versión desplegada.

**Límite:** 0 tests ejecutados por ChatGPT, 0 navegador React, PostgreSQL real, VM, Docker, gateway/SIFEN real, exportación PDF/XML, build, lint, CI o deploy. Las imágenes no prueban cómo funciona internamente el competidor. No inventar URL/contrato del gateway, descargas ni acciones fiscales. ERP solamente DESKTOP.

**Objetivo del menú:** centro operativo para localizar, fiscalizar, diagnosticar, consultar evidencia, exportar archivos realmente disponibles y ejecutar acciones autorizadas sin duplicar documentos; separar SIEMPRE estado local/gateway, estado fiscal SIFEN y estado de e-mail. No duplicar la emisión FE/NCE ni tratar envío a gateway como aprobación SIFEN.

## 2. Inventario actual verificado en NEXIT

| Función | Estado de código | Evidencia |
| --- | --- | --- |
| Menú /documentos y guard de autorización | Implementado | lib/navigation/menu.ts:212–220; app/(private)/documentos/layout.tsx:1–7 exige FACTURACION_ELECTRONICA.VER |
| Buscar número/CDC/RUC/receptor | Implementado | page.tsx:75–133,280–283; shared.ts:116–138 (comodines escapados, q hasta 80) |
| Tipos FE/NCE/NDE/NRE/AFE | Catálogo visual implementado, contrato externo PARCIAL | estados.ts:6–16; gateway.ts:25–28: consulta confirmada FE y NCE, no los tres restantes |
| Filtro sucursal/estado SIFEN y fecha emisión | Implementado | page.tsx:285–329; shared.ts:101–109,125–133 |
| Ordenación + paginación | Implementado | page.tsx:349–359,493–509; shared.ts:36–42,142–157; PAGE_SIZE=20 |
| 8 tarjetas KPI y filtros por tarjeta | Implementado, semántica a corregir | page.tsx:55–68,260–274; shared.ts:55–63,170–198 |
| Estados envío local, SIFEN y correo independientes | Implementado | estados.ts:18–60; page.tsx:387–392 |
| Detalle CDC/lote/fechas/mensaje/NCE original | Implementado | page.tsx:402–415 |
| Historial 100 intentos, fase/actor/HTTP | Parcial como cronología limitada | shared.ts:217–229; page.tsx:446–472 |
| Consulta manual estado SIFEN | Implementado sujeto a tipo/credenciales | API [id]/consultar/route.ts exige EDITAR; shared.ts:251–291 y gateway.ts:308–340 |
| Enviar/reenvío mismo documento controlado | Implementado sujeto a estado | API [id]/enviar/route.ts exige CREAR; page.tsx:419–440; envio.ts:160–192 |
| Corregir NCE rechazada → nueva emisión | Implementado de forma específica | page.tsx:424–434; módulo /notas-credito preserva nuevo número y saldos |
| Refresco automático de lectura cuando hay pendientes | Implementado | refresco-documentos.ts; page.tsx:135–166: GET visible a 30/60/120s, no reenvía |
| KuDE PDF / XML | NO DISPONIBLE en menú | page.tsx:417 lo declara explícitamente; gateway.ts:8–12 sin endpoint confirmado |
| Historial/eventos SIFEN y acciones de cancelación/inutilización | No localizados en este menú | GET [id] lista intentos; no rutas/acciones de evento probadas |
| Filtros por lote y fecha de firma | Campos disponibles solo como datos del documento | shared.ts:68–73 expone lote y fechaFirma; normalizarConsulta no los filtra |
| Acciones masivas, selección, export XLSX/CSV analítico | No localizados en /documentos | page.tsx:275–514 sin checkbox de selección ni exportador del listado |
| E-mail operativo, cola/reenviar/blacklist | No localizado como acción en este menú | estado_email leído y agregado, sin controles de envíos desde /documentos |

**Preservar el contrato fiscal:** gateway con status success y nro_lote = recepción por gateway, NO APROBADO SIFEN. Un estado definitivo requiere identidad y CDC coherentes. Un envío TIMEOUT/RED/indeterminado NO se reenvía a ciegas. NCE rechazada definitiva no se edita con el mismo CDC; se reemite con nuevo número cuando la acción sea elegible.

## 3. Matriz de la competencia: todo lo visible y cómo superarlo

Estado: SI = ya está en NEXIT; PARCIAL = dato o función incompleta; FALTA = no implementado en esta pantalla; CONTRATO = depende de proveedor. Esto es una matriz de requisitos propuestos, NO una lista de defectos probados del sistema de la competencia.

| Código | Elemento observado / solicitado | Estado NEXIT | Especificación de aceptación |
| --- | --- | --- | --- |
| C01 | Filtros plegables | PARCIAL | Filtros principales y avanzados desplegables, diseñados para escritorio |
| C02 | Nro. lote | PARCIAL | Filtro dedicado y trazabilidad lote–documento–intento |
| C03 | Sucursal | SI | Respetar empresa, rol y sucursales autorizadas |
| C04 | Fecha emisión inicial/final | SI | Fechas reales, Paraguay, intervalo inclusivo |
| C05 | Fecha firma inicial/final | PARCIAL | Usar fechaFirma real, informar cuando no esté registrada |
| C06 | Aprobados/rechazados combinables | PARCIAL | Multiestados sin mezclar gateway con SIFEN |
| C07 | Ocultar cancelados e inutilizados | PARCIAL | Exclusiones independientes, elegibles y combinables |
| C08 | Mostrar historial de reprocesos | PARCIAL | Historial completo paginado de intentos/eventos y actor |
| C09 | Ocultar pendientes | PARCIAL | Definir exactamente pendiente envío, respuesta e inconclusos |
| C10 | Pendiente envío SIFEN | PARCIAL | Diferenciar pendiente, enviando, error e indeterminado |
| C11 | Pendiente retorno SIFEN | PARCIAL | Clasificar enviado sin resultado, no reconocido e inconcluso |
| C12 | FE/NCE/NDE/NRE/AFE, selección simultánea | PARCIAL | Multi-tipo; consulta operativa de tipos extras solo con contrato confirmado |
| C13 | Contadores SIFEN (envío/respuesta/aprobado/rechazado) | PARCIAL | KPI con semántica precisa y alcance explícito |
| C14 | E-mail enviado/error/pendiente/sin e-mail | PARCIAL | Separar NO_INFORMADO, SIN_EMAIL, PENDIENTE, ENVIADO y ERROR |
| C15 | Lista negra de e-mail | FALTA | Solo si el proveedor expone bloqueo real; sin inventar estado |
| C16 | Total de documentos | SI | Indicar filtrado vs global autorizado, ambos opcionales |
| C17 | Selección individual por checkbox | FALTA | Acciones masivas explícitas con revalidación fila a fila |
| C18 | Agrupación por columnas | FALTA | Opcional desktop: fecha/sucursal/tipo/estado; procesar en servidor |
| C19 | Nº/tipo, emisión, RUC, razón social, monto | SI parcial en tabla | Columnas configurables, moneda exacta, texto y orden claro |
| C20 | Iconos de PDF, XML, envío y evidencias | PARCIAL | Acciones con rótulos/tooltip/permiso y resultado real, no iconos ficticios |
| C21 | KuDE/PDF, XML y otros archivos | CONTRATO | Contrato externo, obtención segura servidor, integridad/CDC, descargas autorizadas |
| C22 | Selector/eventos por documento | CONTRATO | Mostrar eventos verificados y acciones legales solo con endpoint/permiso confirmados |
| C23 | Operaciones por selección | FALTA | Lotes de consultas/exports con idempotencia, límites y resultado individual |
| C24 | Enviar/reintentar correo | CONTRATO | Destinatario real, adjunto válido, plantilla, logging, rate limit y permisos |
| C25 | Leyenda de iconos/status | PARCIAL | Etiquetas inequívocas estado local, fiscal y correo |
| C26 | Buscar número, CDC, RUC y cliente | SI | Ampliar a lote y filtros avanzados manteniendo aislamiento |
| C27 | Diagnóstico de error por documento | PARCIAL | Código/mensaje/fase, causa comprobada, siguiente acción segura |
| C28 | Exportar listado XLSX/CSV | FALTA | Todas las filas filtradas autorizadas con encabezado/filtros/sello y decimales exactos |

**Funciones extra (propuesta superior a la referencia):** E01 vista de «Requieren atención» con SLA/antigüedad por estado; E02 búsqueda central por CDC/lote/número fiscal con timeline; E03 diagnóstico HTTP, resultado, actor y correlación requestId; E04 fecha de última consulta y actualización manual con sello; E05 panel separado de estado fiscal, transmisión y e-mail; E06 conciliación con Monitor SIFEN sin motores duplicados; E07 alertas por CDC divergente, sin configuración, indeterminado y rechazos recurrentes; E08 export XLSX/CSV de rechazos para cierre mensual; E09 configuración URL de filtros; E10 autorización por empresa/sucursal/acción y redacción de secretos; E11 selección masiva segura solo con elegibilidad; E12 PDF/KuDE y XML firmados con validación hash/MIME; E13 eventos y reenvío de e-mail auditados; E14 soporte por tipo sujeto a contrato comprobado; E15 trazabilidad NCE→FE original y saldo fiscal, sin doble crédito.

## 4. Hallazgos nuevos de código: DOC-D01…DOC-D08

### DOC-D01 — ALTA — resultados viejos siguen visibles y accionables durante el cambio de filtros

**Evidencia:** page.tsx:108–133 calcula claveConsulta y dispara fetch; :168 calcula cargando cuando resultado.clave difiere de claveConsulta, pero :169–178 define datos/filas/resumen/crear/editar desde resultado.datos **sin comprobar su clave**. :275–509 sigue pintando KPI, filas y acciones durante carga. Al escribir texto también hay debounce de 300ms (:103–109).
**Caso derivado:** listado de sucursal A visible; operador cambia a B. Hasta respuesta B, filtros muestran B pero tabla y botones de A siguen presentándose. Backend revalida permisos y alcance, por lo que no se declara bypass; sí inducción a operaciones sobre otro recorte.
**Aceptación:** nunca usar resultado para UI ni acciones si clave no es vigente; invalidar también inmediatamente mientras se digita un filtro, conservando debounce HTTP. Test A→B→C, 0/100/300 ms, errores, filtros, página, orden, intento atrasado y permisos.

### DOC-D02 — MEDIA — «Pendientes de envío» mezcla error e indeterminado; «Pendientes de respuesta» omite estados inconclusos

**Evidencia:** shared.ts:55–62 incluye PENDIENTE_ENVIO/ENVIANDO/ENVIO_INDETERMINADO/ERROR_ENVIO dentro de SQL_GRUPO.PEND_ENVIO; PEND_RESPUESTA solo ENVIADO + SIN_CONSULTA/PENDIENTE, excluye NO_RECONOCIDO. page.tsx:56–67 titula la tarjeta «Pendientes de envío».
**Aceptación:** separar pendiente real, en curso, error, indeterminado, enviado pendiente fiscal, no reconocido, rechazado, cancelado, inutilizado y aprobado. Ningún timeout resulta en reenvío automático.

### DOC-D03 — MEDIA — indicadores globales no siguen filtros y no explicitan el ámbito

**Evidencia:** shared.ts:170–198 obtiene conteo filtrado con WHERE filtros, pero resumen por indicadores usa únicamente WHERE ALCANCE. Es conducta deliberada según comentario en :195; sin rótulo «global» page.tsx:55–67 presenta KPI junto a lista filtrada.
**Aceptación:** declarar claramente KPI «Alcance global» y ofrecer KPI «Resultado filtrado» calculado en mismo recorte/snapshot; no duplicar números ni convertirlos en filtros confusos.

### DOC-D04 — MEDIA — valor fiscal numeric convertido a Number para visualización

**Evidencia:** shared.ts:70 retorna total::text, pero page.tsx:85 usa Number(d.total).toLocaleString, con pérdida de precisión para importes largos/fracciones. Riesgo de discrepancia con documentos SIFEN.
**Aceptación:** formateo decimal textual exacto por moneda, sin Number en cantidades monetarias. Test 16 dígitos PYG, USD/BRL, 0 y fracciones.

### DOC-D05 — MEDIA/RIESGO NO REPRODUCIDO — conteos y filas sin snapshot consistente

**Evidencia:** shared.ts:174–187 ejecuta conteo, resumen y sucursales con Promise.all sobre db.query y después ejecuta query separado de filas, sin BEGIN REPEATABLE READ. Cambios concurrentes de worker pueden provocar números/filas de instantes diferentes. No se accedió a PostgreSQL real.
**Aceptación:** un corte de lectura coherente de totales filtrados, globales, catálogo y página en conexión/transacción de solo lectura; medir concurrencia y retries.

### DOC-D06 — MEDIA — fechas API no validadas completamente

**Evidencia:** shared.ts:45,96–113 valida desde/hasta solo por regex, ignora silenciosamente inválidas y acepta rango invertido. Fecha con patrón correcto pero inexistente llega al cast ::date de shared.ts:132–133. CampoFecha protege entradas visuales comunes, no acceso directo a API.
**Aceptación:** calendario válido, desde <= hasta, 400 con mensaje claro, no remover silenciosamente un filtro inválido; frontera de Paraguay.

### DOC-D07 — MEDIA — «Sin e-mail» agrega «No informado» al mismo número

**Evidencia:** shared.ts:62 mezcla estados NO_INFORMADO/SIN_EMAIL para tarjeta SIN_EMAIL aunque estados.ts distingue ambos y page.tsx:65–67 rotula «Sin e-mail». No se ha comprobado que falte dirección de e-mail.
**Aceptación:** indicadores separados de no informado, sin dirección, pendiente, enviado, error y eventual bloqueo verificable. No simular funcionalidad de e-mail no implementada.

### DOC-D08 — BAJA — detalle expandido no se invalida cuando cambian filtros y resultados

**Evidencia:** page.tsx:97 almacena abiertos por id; :195–214 carga detalle al abrir. Cambios de filtro/orden/página y refrescos no borran ni señalan obsolescencia de intentos. Si reaparece mismo id tras nuevo GET, su historial anterior se muestra sin nuevo fetch.
**Aceptación:** invalidar/revalidar detalle al cambiar clave o señalar recorte/sello y recargar tras acción; pruebas A→B→A y envío/consulta con estado cambiado.

**Balance de defectos de código**: 1 ALTA, 6 MEDIAS (D02–D07), 1 BAJA (D08). D05 es riesgo sustentado en ausencia de snapshot, no incoherencia reproducida. **No sumar requisitos nuevos de la competencia a la contabilidad de bugs.**

## 5. Brechas de producto que bloquean la paridad funcional

- **GAP-01 P0 — evidencias fiscales:** KuDE/PDF y XML bloqueados porque gateway.ts:8–12 y page.tsx:417 no tienen contrato de descarga confirmado. Obtener ejemplo real/endpoint, método, auth, cuerpo, tipo de XML, CDC, hash, MIME, respuesta/error, auditoría de download antes de habilitar botones. No inventar URLs de proveedor.
- **GAP-02 P0 — indicadores y diagnóstico de excepciones:** estados SIFEN, gateway y e-mail disjuntos donde proceda, SLA, indeterminados, fallos por fase, cola «Requieren atención» y conciliación antes de reenviar.
- **GAP-03 P1 — filtros/visualización:** lote, fecha firma, multi-tipo/multiestado, ocultar estados, fechas validas, KPIs filtrados/globales explícitos, columnas operativas desktop configurables.
- **GAP-04 P1/CONTRATO — eventos SIFEN:** visualizar eventos confirmados por gateway. Cancelación/inutilización solo con normativa y contrato de emisión/respuesta, elegibilidad/permiso y persistencia de evidencia. No presumir que un evento visible es accionable.
- **GAP-05 P1/CONTRATO — correo:** obtener estados/fuentes de entrega de proveedor, destino/plantilla/archivos, bloqueo/blacklist, retry idempotente; seguridad por rol y dirección correcta. No crear envíos ficticios.
- **GAP-06 P2 — selección/agrupación/exportar:** selección por línea con límite y validación de estado en backend; descarga CSV/XLSX de todos los documentos filtrados autorizados, no solo 20 de página, cantidades exactas; agrupamiento servidor.
- **GAP-07 P1/CONTRATO — otros tipos:** catálogo reconoce NDE/NRE/AFE pero gateway.ts:25–28 solo consulta FE y NCE. No habilitar funciones externas de NDE/NRE/AFE sin contrato real y prueba específica de CDC/tipo/estado/eventos.

## 6. Diseño funcional propuesto: panel desktop

- Cabecera compacta y barra de filtros principales: búsqueda de número/CDC/RUC/receptor/lote, fecha emisión, sucursal, tipo y estado. Botón «Filtros avanzados» abre firma, e-mail, puntos, eventos y ocultaciones; indicador de filtros activos, restauración clara, sin uso de formularios móviles.
- Tarjetas en tres agrupaciones **Fiscal/SIFEN**, **Transmisión/gateway**, **Correo/entrega**, con nombres de categoría sin mezclas y ámbito explícito del filtro. Agregar «Requieren atención» separado para incidentes no terminales.
- Tabla con tipo+número+CDC identificable, fechas emisión/firma, RUC/razón social, moneda/total exacto, estado fiscal/envío/email, lote, última acción y menú contextual con acciones únicamente elegibles. Información detallada en expansión/drawer de escritorio.
- Histórico cronológico de cada documento: identidad fiscal, origen (incluida FE original NCE), intentos de envío/consulta, requestId y respuestas saneadas, eventual e-mail/eventos/documentos XML/KuDE con versiones, actores y confirmaciones. NUNCA borrar estados finales.
- Backend revalida tenant/sucursal/permiso/estado bajo lock para POST, no confía en estado mostrado. Al consultar SIFEN, exigir CDC coherente para estado final; al reenviar, preservar mismo número cuando corresponde, nunca reemitir automáticamente un indeterminado.
- Exportación XLSX/CSV con hora Paraguay, filtros, empresa, alcance y precisión monetaria, paginado/límite y auditoría.

## 7. Matriz de pruebas dirigidas para cuando se autorice implementación (NO ejecutada)

| Caso | Criterio |
| --- | --- |
| DOC-T01 | A visible → cambio a B: A deja inmediatamente de verse/ser accionable; GET A tardío no reaparece |
| DOC-T02 | Escribir q B: debounce 0/100/300 ms; filtro crudo vs aplicado, errores/retry sin resultados viejos |
| DOC-T03 | FE/NCE/NDE/NRE/AFE: tipo visible no se confunde con contrato operativo; tipos no confirmados devuelven rechazo controlado |
| DOC-T04 | 4 ejes de estado: pendiente/envío/error/indeterminado + SIFEN aprobado/rechazado/NO_RECONOCIDO, KPI y filtros correctos |
| DOC-T05 | KPI filtrados/globales empresa, sucursal, fecha, tipo, correo concilian con misma foto |
| DOC-T06 | Monto PYG 16+ dígitos / USD con decimales: presentación exacta sin Number |
| DOC-T07 | Fecha imposible/intervalo invertido/acceso API directo: 400, no borrar filtro silenciosamente |
| DOC-T08 | Total/resumen/lista bajo actualización concurrente de un documento: snapshot coherente |
| DOC-T09 | Empresa A/B, usuario sucursal A vs B: sin visualizar, exportar, descargar o enviar documento ajeno |
| DOC-T10 | Permisos VER/CREAR/EDITAR/archivos/eventos/email: acciones efectivas protegidas también en API |
| DOC-T11 | Timeout/rechazo gateway/recepción lote: no aprobar SIFEN ni duplicar reenvío |
| DOC-T12 | NCE rechazada vs pendiente/indeterminada: nueva corrección solo cuando elegible, sin liberar saldo antes |
| DOC-T13 | CDC incoherente, respuesta malformada o desconocida: no cambia estado final fiscal |
| DOC-T14 | XML/KuDE real: contrato, empresa, CDC, MIME, hash, control de acceso y errores verificados; sin contrato no hay acción |
| DOC-T15 | Evento fiscal confirmado: elegibilidad, idempotencia, actor y evidencia; solo endpoints probados |
| DOC-T16 | Estados de e-mail: desconocido/no destino/pendiente/entregado/error/bloqueado diferenciados; no reenvío ficticio |
| DOC-T17 | 3 documentos seleccionados, uno cambia de estado: preflight por fila y salida parcial auditada |
| DOC-T18 | Export XLSX/CSV >20 filas y filtros avanzados: todas las autorizadas, datos exactos, límite y sello |
| DOC-T19 | Historial >100 intentos, usuario inactivo, dos reconsultas concurrentes, correlación requestId y paginación |
| DOC-T20 | Capturas y navegación real DESKTOP 1440/1920: filtros, tarjetas, tabla, detalle, estados y foco |

## 8. Secuencia propuesta, pendiente de decisión humana

**A (correcciones actuales):** D01–D08 y pruebas dirigidas del menú. **B (función de consulta):** filtros/indicadores/UX desktop, KPI por recorte, diagnóstico por CDC/lote, export de estado. **C (contrato KuDE/XML):** exigir datos reales del gateway y descargas verificadas. **D (eventos/e-mail):** contratos/normativa y permisos antes de acciones. **E (agrupación/masivas):** solo después de idempotencia y revalidación individual. **F (tipos nuevos/homologación):** NDE/NRE/AFE cuando gateway confirme valores de consulta y servicios. Las etapas no están autorizadas para implementación.

**Veredicto:** Documentos electrónicos NO HOMOLOGADO. Ocho hallazgos de código (1 alta, 6 medias, 1 baja), 28 capacidades comparadas C01–C28 más 15 extras sugeridas E01–E15 y siete brechas de producto/dependencia. Mantener el backend SIFEN seguro y el control NCE; no copiar ciegamente las pantallas de competencia ni prometer PDF/XML/eventos/email sin contrato confirmado.