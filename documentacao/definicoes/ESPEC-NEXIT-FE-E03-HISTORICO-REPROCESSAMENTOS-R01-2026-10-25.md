# NEXIT FE-V1 — E03 / Historial de procesamientos, reenvíos, JSONs y respuestas (modelo en definición R01)

**Fecha:** 25/10/2026. **Estado:** MODELO PARCIALMENTE APROBADO — diseño técnico y decisiones pendientes. **Sin autorización de implementación ni migración.**
**Tareas:** PRO-312 (historial/evidencia fiscal), PRO-311 (corrección de FE rechazada), PRO-315 (E02: paginación ya revisada estáticamente), PRO-309 (gate de negocio).
**Interfaz:** es-PY. **Branch:** `feature/NEXIT-2026-001-banco-demo`.

## 1. Decisiones expresas CONFIRMADAS

- **R-E03-01, lista estándar:** `Facturación → Documentos electrónicos` muestra **solo el procesamiento más reciente por documento fiscal independiente** por defecto; una casilla/filtro `Mostrar todos los reprocesamientos` permanece **desmarcada al abrir la página**. Cambiar el filtro nunca borra ni muta evidencias.
- **R-E03-02, granularidad confirmada por el responsable:** con `Mostrar todos los reprocesamientos` activo, se presenta **UNA FILA por cada ENVÍO o REENVÍO**, **aunque el JSON sea idéntico**. No se agrupan los reenvíos por igualdad de payload/hash ni solo por cambios de versión.
- **R-E03-03, consultas:** las **consultas de estado SIFEN no generan filas independientes** en el listado; deben ser **eventos vinculados al procesamiento correspondiente**, con su hora, resultado y JSON de respuesta cuando esté disponible.
- **R-E03-04, trazabilidad:** toda evidencia de procesamiento, respuesta, solicitud/version y resultado previo permanece consultable; la lista estándar es una proyección del más reciente, **no una supresión de datos**.
- **R-E03-05, interfaz:** nombre del filtro en español PY; el checkbox está apagado por defecto. Listado con todos los procesamientos y su estado propio; detalle contiene los intentos/consultas/respuestas del procesamiento.
- **R-E03-06, corrección con identidad fiscal nueva (DECISIÓN B):** si una corrección válida exige nueva identidad fiscal (nuevo documento/serie/número/CDC conforme al contrato fiscal), **la emisión nueva y la original deben tener filas independientes en la lista estándar**, cada una mostrando solo su propio procesamiento más reciente. Registrar referencia bidireccional de origen/corrección entre documentos sin fusionarlos en una misma fila, sin alterar el número o CDC histórico. El filtro «Mostrar todos los reprocesamientos» abre todos los envíos/reenvíos **de cada documento por separado**, sin mezclar procesamientos de originales y correcciones. La decisión no autoriza a cambiar CDC/número arbitrariamente ni implementa la corrección.
- **R-E03-07, responsables:** ChatGPT define y audita el modelo y Git/Linear; Claude solo implementa etapa autorizada, sin pruebas por orden del responsable; responsable humano valida y aplica migraciones/VM. **E03 NO está autorizada actualmente.**

## 2. Estado ACTUAL verificado en código, no inferido desde el diseño

- `documentos_electronicos` (NEX-047): **una fila por identidad fiscal**, con `estado_local`, `estado_sifen`, `estado_email`, identidad fija, CDC que no puede ser alterado después de informado y restricciones de inmutabilidad.
- `documento_electronico_solicitudes` (NEX-048): versiones `(empresa_id,documento_id,version)`, `payload jsonb`, `payload_hash`, `entrada_hash`, solo altas. **Preparar un payload NO prueba que se haya transmitido.**
- `documento_electronico_intentos` (NEX-047/049/050): evidencias inmutables tipo `ENVIO`/`CONSULTA`, resultado/HTTP, fase de cierre, request_id, lote, CDC informado, respuesta JSON saneada. **No tiene FK inequívoca a versión/hash ni la solicitud JSON efectivamente transmitida por cada envío; actualmente no hay una entidad de procesamiento distinta de la propia fila de intento.**
- `fe_documento_iniciar_envio` (NEX-050): selecciona `ORDER BY s.version DESC LIMIT 1`, bajo exclusión mutua `ENVIANDO`; actualmente devuelve payload sin vincular ID/versión del envío registrado.
- `fe_documento_registrar_envio`: persiste la evidencia de intento en cierre y actualiza estado local; `lib/facturacion/envio.ts` guarda el resultado final y `gateway.ts` expone fases de autenticación, transmisión y respuesta al llamador, **pero no demuestra persistencia completa individual de cada fase**.
- `fe_documento_registrar_consulta` (NEX-054) registra intentos y bloquea cambios contradictorios a un estado terminal; aún no relaciona cada consulta con el procesamiento que le precedió.
- E01/PRO-314 ofrece JSON a demanda de solicitud versionada y respuesta del intento; E02/PRO-315 ofrece paginación keyset de intentos; ambas conformes **solo en revisión estática**, 0 pruebas/homologación.
- `GET /api/documentos` y `leerDocumentos` muestran una sola fila por `documentos_electronicos.id` hoy; **no existe aún el modo `Mostrar todos los reprocesamientos`**. No declarar que las filas históricas ya funcionan.

## 3. Arquitectura TÉCNICA PROPUESTA, AÚN NO APROBADA

Separar cuatro identidades:
1. **Documento fiscal inmutable:** registro histórico, identidad fiscal y estado consolidado; relación explícita de correcciones si crean otro ID/CDC/número.
2. **Versión fiscal inmutable:** snapshot preparado (`documento_electronico_solicitudes`), versión y hash de carga.
3. **Procesamiento / envío de esa versión:** ID inmutable único de tentativa, correlación a versión+hash+solicitud enviada, actor, fecha, si realmente hubo intento HTTP y estado de transmisión; filas individuales incluso con mismo JSON.
4. **Eventos/consultas:** solicitudes/respuestas, HTTP, fases reales que el gateway proporcione y consultas SIFEN vinculadas al procesamiento, sin producir nueva fila de procesamiento por consulta.

Preferir ampliaciones incrementales seguras del modelo existente, manteniendo los registros existentes sin sobrescribir ni asociar retrospectivamente payloads no demostrados. Un envío ambiguo no se declara rechazado/aprobado; no inventar eventos de firma/acuse que el proveedor no retorna. Saneamiento de secretos, protección por `empresa_id`, sucursal/alcance, append-only, idempotencia y recuperación segura ante caída del proceso; `ENVIADO` en gateway no equivale a `APROBADO` por SIFEN. Evitar un único contador mutable que borre resultado propio de una tentativa al ocurrir consultas posteriores.

**Diseño de lectura a revisar:** lista con checkbox controlado por query al servidor; con casilla off, `ROW_NUMBER() OVER(PARTITION BY empresa_id, documento_id ORDER BY fecha_procesamiento DESC, id DESC)=1` o proyección equivalente **por documento fiscal, no por cadena de corrección**; con casilla on, fila por intento de envío/reenvío y documento. Mostrar referencia del documento corregido/nueva emisión en ambas fichas y permitir navegar a ella, con alcance empresa+sucursal en cada lectura. Conteos, filtros de estado, paginación y orden deben utilizar la misma proyección sin duplicar ni filtrar incorrectamente. No aplicar SQL de este documento todavía; falta definir las restricciones de referencia de corrección entre documentos y el tratamiento de cambios de identidad según norma fiscal.

## 4. Decisiones POR CERRAR con el responsable, de a una

- **D-E03-02 — CERRADA (opción B):** si una corrección requiere crear un documento fiscal nuevo con otro número o CDC, **el original y el nuevo son filas independientes en la lista estándar**, vinculados mediante referencia navegable. Se conserva la identidad fiscal y el historial de cada uno. La decisión de negocio no sustituye verificación legal de cuándo corresponde emitir otro documento.
- **D-E03-03 (PRÓXIMA CONSULTA):** intento iniciado que nunca alcanzó el endpoint de recepción (fallo de autenticación, caída de red antes del envío): ¿se lista como procesamiento `NO TRANSMITIDO` o solo se visualiza en detalle técnico? No confundir preflight antes de crear documento con intento efectivamente iniciado.
- **D-E03-04:** al consultarse SIFEN, ¿el estado propio de cada fila histórica presenta el último resultado verificado perteneciente a ese envío, mientras los eventos originales permanecen inmutables? Solución recomendada sí; evitar que cada fila muestre automáticamente el estado de la última revisión.
- **D-E03-05:** búsquedas por número antiguo/CDC/cliente, conteos KPI y cadena de correcciones; reglas de selección/resumen acordes al modo estándar vs completo.
- **D-E03-06:** estrategias de vinculación de consultas tardías cuando ya hay otro envío y recuperación de sesiones indeterminadas. Diseño técnico a resolver antes del SQL.

**DEPENDENCIAS REALES:** PRO-309/P04 corrección/CDC; PRO-311 implementación de corrección, NEX-054 final. No deducir cambio de CDC/número sin norma/contrato. Preparar migración SQL nueva (no editar NEX-047/048/049/050/054) solo tras cerrar contrato funcional y verificar en VM por operador las migraciones realmente aplicadas.

## 5. Gate

**PRO-312/E03 EN ANÁLISIS, NO PROGRAMAR.** Falta cerrar preguntas, dictaminar diseño SQL incremental, permisos, reintentos indeterminados, correlación cronológica y matriz de aceptación. Claude no tiene instrucciones de implementación de E03.
