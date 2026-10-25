# NEXIT — FE-V1 E03: documento fiscal, revisiones JSON, transmisiones y consultas (R02)

**Fecha:** 25/10/2026. **Estado:** ANÁLISIS FUNCIONAL/TÉCNICO EN CURSO; SIN ORDEN A CLAUDE, SIN MIGRACIÓN NI DESPLIEGUE. **Este R02 SUSTITUYE las interpretaciones equivocadas del R01 sobre atribuir estados SIFEN a cada envío.** Mantener R01 solamente como historial del análisis.
**Issues:** PRO-312 / PRO-311 / PRO-309. **Interfaz:** es-PY.
**Repo/branch:** `proceit-tech/distribuidora` / `feature/NEXIT-2026-001-banco-demo`.

## 1. ACLARACIÓN FUNCIONAL EXPRESA DEL RESPONSABLE (PRIORIDAD SOBRE R01)

> **SIFEN devuelve el estado del DOCUMENTO FISCAL, no el de cada intento de transmisión.** Mientras no se modifique el JSON fiscal, es el MISMO documento, sin nueva versión ni nuevo documento. Enviar un DE una vez y consultar su estado hasta una respuesta fiscal definitiva. NO reenviar periódicamente el mismo JSON/CDC mientras el SIFEN continúa procesándolo. Si llega RECHAZADO definitivo y hay un campo incorrecto, el usuario corrige el documento (por ejemplo: faltaba el número de casa del receptor), se conserva el JSON anterior y se genera un **JSON corregido con versión nueva**; recién entonces se somete otra vez a validación, respetando CDC/numeración. APROBADO finaliza el procesamiento fiscal. Consultas SIFEN son el seguimiento del documento fiscal, sin inventar una atribución a un POST individual.

Esta corrección reemplaza explícitamente:
- D-E03-04 de R01 en la parte que pedía atribuir estado SIFEN APROBADO/RECHAZADO al intento de envío individual. **Cada intento tiene su resultado TRANSPORTE, pero el estado fiscal pertenece al documento** (con evidencia del momento y, tras corrección, de la versión revisada cuando demostrable).
- D-E03-06 de R01: **no se pregunta a qué envío cronológico asignar la consulta**. La consulta se vincula al documento fiscal y su CDC/lote cuando haya, no a un envío arbitrario.
- La idea de que tres envíos con el mismo JSON son tres procesos fiscales con tres estados SIFEN autónomos. **No**.

## 2. Reglas confirmadas — identidades diferentes

| Nivel | Identidad | Estado/evidencias |
|---|---|---|
| DOCUMENTO FISCAL | `documentos_electronicos.id`, empresa, sucursal, número, serie, CDC | Estado SIFEN consolidado del documento; un solo registro en lista estándar. Su identidad fiscal no se modifica retroactivamente. |
| REVISIÓN FISCAL (JSON) | `documento_electronico_solicitudes(empresa_id, documento_id, version)` | `version`, snapshot original inmutable, hash, actor, motivo/campos corregidos, fecha; nuevas versiones solo para correcciones reales, no para una consulta. La revisión rechazada conserva su evidencia y veredicto histórico. |
| INTENTO DE TRANSPORTE | Cada inicio/envío real, incluso el JSON idéntico por incidente técnicamente permitido | ID único, revisión/hash transmitido (o preparado/no transmitido), HTTP, autenticación, gateway, fase, error, respuesta, hora y operador. **No tiene un estado SIFEN independiente**. Sin sobrescribir ni eliminar. |
| CONSULTA DEL DOCUMENTO | Cada consulta efectiva al gateway/SIFEN | Estado del documento consultado, CDC/lote/protocolo cuando informados, hora, request/response, resultado de consulta. **No crea una nueva revisión, otro documento ni una fila de envío**. |

**Regla de emisión:** si se conoce que el DE/CDC está pendiente/en proceso, se consulta el mismo documento hasta respuesta definitiva. `TIMEOUT`, `RED` y recibo ambiguo NO autorizan reenvío ciego; primero reconciliar por documento/CDC/lote. Un fallo de autenticación comprobado antes del HTTP de recepción es `NO TRANSMITIDO`, no RECHAZADO por SIFEN. Diferenciar rechazo técnico del gateway y RECHAZADO fiscal definitivo: no disparar corrección fiscal por 4xx técnico.

**Corrección:** ante RECHAZADO definitivo, crear versión nueva y conservar vieja, validar diferencia de payload, permitir reenvío solo luego de corrección real válida y comprobaciones de CDC/identidad. Corregir un campo que no cambia identidad y está permitido legalmente puede permanecer en el mismo documento, con su número/CDC; cuando corresponde nueva identidad legal, crear **otro `documentos_electronicos.id`**, mantener original intacto y una referencia explícita entre ambos. **Decisión B ya confirmada:** ambos documentos se listan separados, cada uno con su historial. La política concreta de campos y validez de reutilización se define por normativa y contrato del gateway, no se inventa.

**Auditoría:** no confundir `JSON PREPARADO` con `JSON EFECTIVAMENTE ENVIADO`. Persistir payload concreto inmediatamente antes de transmitir o en evento durable de inicio, vinculado a versión/hash y a resultado/fase; si no hay prueba de transmisión, la UI lo indica. Nunca reconstruir falsamente envíos anteriores ni atribuir un JSON retroactivamente sin prueba; preservar filas existentes.

**Filtro de lista — DECISIÓN EXPRESA CONFIRMADA POR EL RESPONSABLE EN R02 (25/10/2026):** `Mostrar todos los reprocesamientos` aparece DESMARCADO al abrir. **DESMARCADO:** una sola línea por `documentos_electronicos.id` con estado fiscal vigente y metadatos de la última revisión JSON; documentos fiscales originales y nuevas emisiones con identidad distinta siguen siendo **líneas independientes** y vinculadas (decisión B). **MARCADO:** una línea POR CADA VERSIÓN INMUTABLE DEL JSON FISCAL registrada para ese documento, ordenada de la más reciente a la más antigua, incluidas las rechazadas; un reenvío técnico del mismo JSON NO crea otra línea ni revisión. **DETALLE DE CADA VERSIÓN:** todas las tentativas reales de transporte de ese JSON (incluso si varias tienen hash idéntico), con resultados técnicos/HTTP y sus respuestas, y los eventos de consulta SIFEN del documento en secuencia cronológica y con vinculación a revisión solo cuando esté demostrada. Las consultas pertenecen fiscalmente al documento, no se atribuyen a un POST específico ni crean nuevas revisiones. Al activarse el filtro, los KPIs de documentos fiscales/ventas NO se multiplican por número de revisiones. Conservar todos los intentos/reintentos que ocurrieron realmente, sin reinterpretar registros viejos como transmisiones comprobadas. **Esta decisión sustituye expresamente la presentación por una línea para cada ENVÍO/REENVÍO propuesta y aceptada provisionalmente en R01; permanece la obligación de auditoría de cada envío individual, solo cambia su ubicación (dentro del detalle de versión).**

## 3. Flujo funcional E03 previsto

1. Usuario emite FE; validación/preflight y creación de documento fiscal + revisión V1 inmutable.
2. Una transmisión fiscal. Guardar evidencia del JSON concreto, versión, hash, envío o `NO TRANSMITIDO`, respuestas del gateway, identificadores de correlación. El éxito HTTP/entrega gateway no representa aprobación SIFEN.
3. Si gateway/SIFEN aún procesa, consultar **el documento/lote/CDC** periódicamente con cadencia técnica aprobada (no reenviar). Guardar cada consulta como evento en historial. Fallos conservan estado fiscal anterior; ambigüedad mantiene bloqueada la repetición hasta reconciliar.
4. Si `APROBADO` (o estado de aceptación final reconocido en el contrato): finalizar seguimiento fiscal de ese documento. No reemitir. Las fases downstream, como stock, se rigen por su propia etapa.
5. Si `RECHAZADO` fiscal final: registrar decisión con mensaje/código y revisión vigente. Habilitar una corrección controlada. Al guardar, crear V2 inmutable con diferencias verificables y validación legal de campos CDC. Emitir solo la nueva revisión cuando sea válida, manteniendo número/CDC si la norma lo permite; de lo contrario documento nuevo enlazado (B).
6. El documento consolidado refleja fase vigente; las revisiones y consultas viejas siguen siendo evidencia histórica, no se sobreescriben por respuesta de V2.
7. Con `Mostrar todos los reprocesamientos` la lista devuelve una fila por revisión fiscal JSON, NO por intento HTTP; los intentos antiguos siguen íntegramente auditables dentro del detalle de su versión, con resultado técnico propio. Consultas SIFEN permanecen en el historial del documento y se presentan en el contexto de la revisión únicamente si hay correlación fiable. Ningún contador de facturas/estado fiscal debe duplicarse por revisiones o intentos.

## 4. Hallazgos técnicos comprobados en branch

- `lib/facturacion/shared.ts::consultarEstado` llama al gateway usando **la identidad del documento** (tipo, establecimiento, punto, número, serie) y persiste resultado con `fe_documento_registrar_consulta` por **documento_id**. Eso es correcto y se debe conservar como referencia.
- `NEX-054-facturacion-consulta-estado-final.sql`: `RECHAZADO` es estado final y la guarda SQL bloquea cambios posteriores a `PENDIENTE`/`APROBADO` para ese documento. **El nuevo ciclo con corrección V2 requiere rediseñar explícitamente la máquina de estados y protección contra respuestas tardías, sin eliminar las evidencias V1 ni permitir reactivación accidental.** No editar migrations históricas; crear incremental futura.
- `NEX-048`: `documento_electronico_solicitudes` ya soporta `version` y payload/hash solo altas; `NEX-049/050` inician con la revisión más reciente pero guardan el intento final sin `version`/payload enviado, riesgo de perder correlación.
- `lib/facturacion/envio.ts` y `gateway.ts` almacenan resultado final; fases del gateway no están necesariamente persistidas individualmente y la llamada POST puede concluir con estado ambiguo. La E03 debe garantizar evidencia durable sin suponer entrega por timeout.
- `lib/facturacion/consulta-automatica.ts` por defecto sólo considera `NCE` y una cadencia provisional de 60–3600 segundos; seguimiento automático de **FE** queda en E08. No declarar hoy que FE recibe consulta automática.
- Endpoints y UI actuales NO implementan corrección de JSON rechazado, versionado transmisible nuevo, historial agrupado por versiones ni filtro `Mostrar todos`. E01/E02 revisadas solo estáticamente, sin homologación.

## 5. Sustento DNIT y límites

- DNIT, *Guía de mejores prácticas SIFEN para desarrolladores* (octubre 2024), pp. 5–6: no volver a enviar un mismo CDC sin resolución final; usar consulta de lote. Recomienda empezar alrededor de 10 minutos tras recepción y consultas posteriores con intervalos no menores de 10 minutos para lotes. **No trasladar esa cadencia directamente a endpoints de gateway que tengan un contrato distinto hasta verificarlo.**
  https://www.dnit.gov.py/documents/20123/420592/Gu%C3%ADa%2Bde%2BMejores%2BPr%C3%A1cticas%2Bpara%2Bla%2BGesti%C3%B3n%2Bdel%2BEnv%C3%ADo%2Bde%2BDE.pdf/38fe5830-98c0-2241-9895-671f86f1225f
- DNIT, *Preguntas frecuentes*, rechazo: corrección y nuevo sometimiento a validación del documento rechazado, reutilización de CDC condicionada a que no se modifique la estructura de datos que determina la identidad; en caso distinto corresponde nuevo DE y posible inutilización conforme a norma. **No generalizar 'cualquier JSON cambiado siempre mantiene CDC'.**
  https://www.dnit.gov.py/en/web/e-kuatia/preguntas-frecuentes
- DNIT *Manual Técnico SIFEN 150*, sección 6.5, contiene regla de CDC sobre corrección; implementación debe validar normativa fiscal vigente y contrato real del gateway del cliente.

## 6. Diseño técnico a cerrar por ChatGPT ANTES de dar orden a Claude

1. Relación `documento` ↔ `solicitud.version` ↔ `intento` ↔ JSON enviado (y huella), más consultas por `documento_id` y eventos por versión cuando demostrables; transacciones seguras e integridad multiempresa/sucursal.
2. Máquina de estados: RECHAZADO fiscal final de V1, corrección aprobada V2 en el mismo registro/CDC cuando legal, respuesta de V1 tardía no contamina V2; APROBADO/CANCELADO terminal y nunca envío duplicado.
3. Asegurar append-only y auditoría confiable, sin falsificar historia anterior, token/contraseña/headers removidos del JSON de respuesta.
4. UI y contador de KPI por documento y por intento; no duplicar aprobación fiscal ni venta/stock por tentativas; paginación y filtrado coherente al marcar `Mostrar todos`.
5. Definir eventos de `NO TRANSMITIDO` y salida `ENVIO_INDETERMINADO`, correlación request_gateway/lote/CDC; distinguir fallo de autenticación vs transmisión HTTP.
6. La política de campos corregibles requiere homologación normativa/contrato fiscal y un catálogo de cambios que afecten la identidad del CDC.
7. **DECISIÓN DE GRANULARIDAD CERRADA:** filas por VERSIÓN JSON con `Mostrar todos los reprocesamientos` (DESMARCADO por defecto); intentos individuales —incluso si el payload coincide— en detalle, consultas del documento sin crear fila. Actualizar la API de listado/paginación y resumen consistentemente para no contar el mismo documento varias veces.
8. **DECISIÓN FUNCIONAL PRÓXIMA:** cuándo fijar inmutable una nueva versión V2 durante el flujo `Corregir y reenviar`: al guardar cambios antes de enviarlos, o solo al confirmar la emisión tras el resumen fiscal. Ninguna edición de borrador cambia un histórico anterior; el gateway puede estar indisponible y la recuperación de intento debe preservar el snapshot inmutable.

**GATE:** documento de análisis, no orden. **Claude NO debe implementar E03, SQL, frontend ni migraciones.** El operador conserva la aplicación/homologación y backup previo de cualquier migration.
