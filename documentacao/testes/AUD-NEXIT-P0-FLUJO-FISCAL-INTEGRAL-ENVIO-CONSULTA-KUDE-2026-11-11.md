# AUDITORÍA CRÍTICA P0 — NEXIT / Integridad integral ENVÍO → LOTE → CONSULTA SIFEN → HISTORIAL → KuDE

**Fecha:** 11/11/2026
**Empresa afectada:** CASA MINGO S.A.
**Branch fuente inspeccionada:** `feature/NEXIT-2026-001-banco-demo`.
**Ámbito:** `lib/facturacion/{configuracion-gateway,envio,gateway,gateway-credenciales,shared,reconciliacion,estados,consulta-automatica,puntos}.ts`, `payload-fe.ts`, `kude.casos.ts`, `NEX-047/050/054/061/063/069/077` y capturas operativas del responsable del 11/11/2026.
**Método:** revisión ESTÁTICA de fuente + capturas de pantalla, **NO** revisión de base real ni lectura de logs privados de VM/gateway. No se ha realizado envío, consulta SIFEN, SQL, pruebas, build, despliegue ni cambio de registro.

## 0. Resumen ejecutivo

**RIESGO P0**: un KuDE de **DISTINTO EMISOR** fue mostrado bajo la cabecera del documento de CASA MINGO; la última consulta fiscal está marcada `CDC_DIVERGENTE`, el lote visible contiene `[omitido]`, el estado fiscal sigue `SIN_CONSULTA`, y la factura nueva **no aparece en el portal del proveedor con los filtros de la captura**. El código NO proporciona una trazabilidad completa del gateway/credenciales utilizados en cada solicitud.

**IMPORTANTE**: que el KuDE sea ajeno demuestra un problema en la **obtención/correlación del PDF**, pero NO prueba por sí solo que el JSON se envió a otro servidor. Tampoco «Probar conexión» demuestra `recepcion_de`: sólo llama `/api/login`. Ni un `HTTP 200` equivale a aprobación SIFEN.

**DECISIÓN OPERACIONAL RECOMENDADA:** detener TEMPORALMENTE emisiones nuevas CASA MINGO, no reenviar, no consultar de nuevo de forma masiva, no modificar CDC, lote, secuencias, serie, URL/credenciales o estados hasta establecer correlación real. Mantener el documento y todos los intentos originales.

## 1. Línea temporal y evidencia de usuario

1. FE nueva `001-001-0000001 (AA)`, receptor JOSE FRANCO, importe **PYG 1.000**, emisión **11/11/2026 09:10:27**. NEXIT indica `Envío: Enviado`.
2. Lote mostrado en detalle: `[omitido]-1-001-001-0000001-20261111091028-793231042`. **El lote presentado ya no es una transcripción íntegra del identificador original del proveedor.** Investigar si el campo persistido también se alteró y en qué versión desplegada; NO reconstruir su prefijo.
3. Captura de Configuración: empresa CASA MINGO, API usuario `80003314`, URL `https://gateway.e-factura-hub.com`, `Conexión correcta` **11/11/2026 09:17**. Esto es **posterior** a la emisión 09:10. No evidencia qué destino/credenciales se usaron 09:10.
4. Última consulta de la nueva FE **11/11/2026 09:30:57**: `HTTP 200`, `XML firmado`, `CDC distinto del registrado`; no hay CDC local ni resultado fiscal final. La interpretación de `XML firmado` NO es `APROBADO` ni `RECHAZADO` oficial. Se debe guardar exactamente el texto original como estado del gateway/historial, y clasificar transitorio sin inventar aprobación.
5. El KuDE abierto con título del documento `001-001-0000001 (AA)` contiene PDF de **DISTRIBUIDORA DEL PARAGUAY S.A.**, RUC, receptor/fecha e importes distintos; muestra factura `001-001-0000001` con fecha antigua, mientras KuDE de `001-003-0009020` anterior presenta correctamente **CASA MINGO S.A.** Las páginas PDF reales no fueron inspeccionadas por herramienta ni se analizó contenido binario; el contraste visual es inequívoco.
6. Portal E-FacturaHub: CASA MINGO seleccionada y 5 FE rechazadas visibles; nueva factura no está en la lista de la captura. **«Ocultar pendientes» está marcado**, y filtros de fecha restringen la lista, por lo que ausencia visual NO prueba ausencia total en el proveedor.

## 2. Auditoría del ENVÍO

### 2.1 Camino funcional demostrado por fuente
- `lib/facturacion/emision.ts`: al seleccionar sucursal/punto se obtienen `establecimiento_sifen` y `fe_puntos_expedicion.codigo` dentro del tenant, exige FE activa.
- `NEX-063:fe_documento_crear_fe`: reserva número y **serie**, guarda `documentos_electronicos.serie` y construye JSON `dEst, dPunExp, dNumDoc, dSerieNum` (líneas 174–187), incluyendo **AA**.
- `lib/facturacion/envio.ts:195–225`: preflight, creación idempotente y `enviarDocumento`; este último VUELVE a leer configuración, llama `fe_documento_iniciar_envio` y `enviarDocumentoGateway`.
- `envio.ts:70–85`: `configuracionGateway` lee de `fe_gateway_config` activa filtrada por empresa: `base_url`, `credencial_ref` y `timeout_ms`.
- `gateway-credenciales.ts:23–30`: si referencia es `NEXIT_DB`, credenciales pertenecen al tenant y usuario, leídas por `fe_gateway_credenciales_leer`; si es otra referencia, `gateway.ts:54–65` usa variables de entorno de esa referencia (compatibilidad histórica).
- `gateway.ts:688–733`: autentica `POST {baseUrl}/api/login`, envía JSON EXACTO `POST {baseUrl}/api/recepcion_de`, interpreta respuesta y aplica saneamiento; token cache segregado por tenant+URL+ref+huella de credenciales.
- `gateway.ts:673–675`: `status='success'` y `nro_lote` no vacío de hasta 60 caracteres → `estadoLocal='ENVIADO'` = **confirmación de recepción por gateway**, jamás aprobación SIFEN; también se acepta CDC o eco de identidad coherentes.
- `NEX-050:fe_documento_registrar_envio` inserta intento `ENVIO`, registra `estado_local`, `lote`, `mensaje`, `cdc` validado si procede. La persistencia **sí existe en código**.
- **GAP P0-ENV-01:** la tabla de intentos NO guarda `base_url`, `credencial_ref`, versión de credenciales, identidad de usuario API efectiva, `host` o id de transacción REAL del proveedor por cada llamada. `request_id` se genera localmente mediante `crypto.randomUUID()` al persistir y NO se demuestra que se haya enviado al proveedor; no sirve como correlación contractual. Las modificaciones de config quedan en `fe_gateway_config_log`, pero sin relación inequívoca con el intento.
- **GAP P0-ENV-02:** el código de UI `Probar conexión` en `configuracion-gateway.ts:167–190` sólo hace `POST /api/login`. No demuestra autorización de `/api/recepcion_de` ni la cuenta efectiva asociada a lotes/documentos. La hora de prueba posterior no demuestra configuración efectiva anterior.
- **GAP P0-ENV-03:** el saneador `gateway.ts::resultadoFiscalSinSecretos` también procesa `lote`; la captura muestra prefijo `[omitido]`. No declarar aún su causa exacta en producción: debe cotejarse código realmente desplegado vs Git y campos `i.lote` / `d.lote` / JSON de respuesta para determinar si se mutiló antes de guardar. **Nunca reconstruir el valor por conjetura**.
- **GAP P0-ENV-04:** configuración leída en preflight y otra vez antes de transmitir, sin snapshot único documentado por intento. Si las credenciales cambian entre fases o después, se vuelve imposible rastrear por pantalla qué configuración se usó realmente. La SQL NEX-061/069 versionada **sí** actualiza `credencial_ref='NEXIT_DB'` al guardar; hay que verificar esa función REAL en base y el valor actual/histórico, no afirmar que se usó antigua ref sin prueba.
- **GAP P0-ENV-05:** `status:success + nro_lote` presume que el gateway ha asociado respuesta al JSON enviado sin eco obligatorio de emisor/serie, según contrato actual. Si la autenticación pertenece a otra cuenta o gateway devuelve un lote de tercero, esta correlación no basta para descartar el riesgo. No reintentar sin verificar.

### 2.2 Numeración/serie
`001-001-0000001 (AA)` no es igual, a nivel de identidad completa, a `001-001-0000001` sin serie. El JSON NEX-063 versionado incluye `dSerieNum:'AA'`; el request KuDE también debe enviarlo. La factura extranjera en PDF lleva el mismo EEE/PPP/número visible **sin prueba de que el proveedor haya respetado o diferenciado la serie**. Verificar payload JSON versión 1 persistido y cuerpo real de solicitudes; nunca editar/retroceder secuencia para «probar».

## 3. Auditoría de la CONSULTA SIFEN e historial

- `shared.ts:378–415`: `consultarEstado` lee documento/tenant, configuración ACTUAL, llama `/api/consulta_de` con `{dEst,dPunExp,dNumDoc,dSerieNum,tipoDoc}` **sin CDC**, `decidirConsulta` y una función SQL de registro. El resultado final SIFEN debe venir de la API, no de HTTP 200.
- `gateway.ts:240–282` extrae `response.Estado`, `response.DE.CDC`, `response.DE.Retorno.CodRespuesta/Mensaje`.
- `estados.ts:82–99`: sólo `aprobado/rechazado/cancelado/inutilizado/pendiente` se mapean; **«XML firmado» → NO_RECONOCIDO**, y debe mostrarse texto original del gateway, histórico e información transitoria. NO proclamar `APROBADO`.
- `reconciliacion.ts:19–35` exige CDC coherente para estados finales; `NEX-054/062/077` evitan avanzar cuando `CDC_DIVERGENTE`, pero el intento queda en tabla. La lista muestra estado principal `SIN_CONSULTA`, aunque hubo consulta que fue descartada como fiscal.
- **GAP P0-EST-01:** la pantalla no diferencia con suficiente claridad «se consultó y el gateway dijo XML firmado, pero su identidad/CDC no se pudo validar» de «nunca se consultó». Debe mostrar siempre fecha, estado bruto, resultado técnico, código/mensaje y fuente de evidencia del último intento, separados de estado SIFEN confirmado.
- **GAP P0-EST-02:** tanto `lib/facturacion/gateway.ts:494–497::cdcCoherente` como `NEX-047:68–74::fe_cdc_coherente` validan tipo/EEE/PPP/número, **NO el RUC emisor del CDC**. Dos emisores podrían tener la misma combinación EEE/PPP/número. **Riesgo de atribuir un resultado fiscal de otro emisor** aunque CDC pase esa validación. Se requiere contrato oficial de verificación de emisor para fijar estado, sin generar ni reescribir CDC y manteniendo autorización por tenant. Este hallazgo afecta CONSULTA/REGISTRO, diferente de una norma histórica PRO-326 que prohibió comparar CDC/RUC para mostrar KuDE.
- **GAP P0-EST-03:** el saneamiento histórico previo de `sinSecretos` reemplazaba substrings del CDC con `[omitido]`; últimas correcciones R03–R05 no demuestran versión desplegada. Si el CDC tiene `[omitido]`, la consulta válida queda falsa divergente; se precisa inspección real de `cdc_informado`, ruta JSON, contraseña usada (COMPARACIÓN DENTRO DE ENTORNO AUTORIZADO SIN EXHIBIRLA) y SQL desplegado. Nunca reconstruir ni editar CDC manualmente.
- **GAP P0-EST-04:** el scheduler existe (`instrumentation.ts → consulta-automatica.ts`, ciclo 60s, 10 documentos); requiere NEX-077 para reserva con lease. Su actividad REAL en la VM y la aplicación de la NEX-077 NO están verificadas. El intento manual 09:30 no prueba ejecución automática. La consulta visual GET no consulta SIFEN.
- La historia en `documento_electronico_intentos` está prevista como append-only, conserva intentos sin tocar el estado final si la respuesta no es verificable. No se debe declarar «no graba nada» a nivel técnico; el incumplimiento observado es que no consolida ni presenta el estado adecuado y el historial no garantiza correlación completa.

## 4. Auditoría KuDE — PDF de otra empresa

- `shared.ts:429–456`: busca por ID+tenant+alcance, lee config ACTUAL y construye cuerpo `dEst,dPunExp,dNumDoc,dSerieNum,tipoDoc` desde la identidad PERSISTIDA. No envía CDC.
- `gateway.ts:757–760`: cuerpo KuDE FE de cinco campos; para NCE seis, `ncr`/`tipOpe:'4'`. El request de FE `001-001-0000001 (AA)` **DEBE** llevar `dSerieNum:'AA'` si esa es la serie en DB.
- `gateway.ts:813–837::interpretarKude` acepta `status:'success'` + Base64 decodificable y PDF sintácticamente válido; **NO verifica identidad o emisor del contenido PDF**. `gateway.ts:892–932` recupera PDF con la configuración ACTUAL y no conserva vínculo del origen del envío. `kude-modal.tsx` muestra el PDF devuelto y título del documento NEXIT, aunque el documento PDF sea de otra empresa.
- **GAP P0-KUDE-01 CONFIRMADO POR FUENTE Y CAPTURAS:** ausencia de correlación verificable entre emisor/número/serie del documento elegido y el PDF obtenido, permitiendo mostrar **documento ajeno**. El PDF de Distribuidora del Paraguay S.A. no es el KuDE de CASA MINGO `001-001-0000001 (AA)`, aunque ambos tengan 001/001/0000001.
- Históricamente **PRO-326 revocó expresamente validación CDC/RUC para mostrar cualquier PDF válido**, para permitir PDFs de documentos rechazados/sin CDC. El incidente P0 actual demuestra que **validade de PDF NO prueba titularidad**. La futura regla debe distinguir **permitir KuDE aun sin aprobación/CDC** de **nunca presentar un PDF atribuido al emisor equivocado**. No reinstalar validaciones antiguas por suposición: especificar una verificación viable y verificable con contrato real del proveedor (metadatos de origen, cuenta autenticada, XML firmado, serie/RUC extraídos de forma fiable o aclaración del proveedor). Si no hay método confiable, el sistema debe indicar que la pertenencia del PDF no pudo verificarse, en vez de atribuir PDF de tercero como propio. La decisión exacta de seguridad debe ser aprobada antes del cambio.
- **GAP P0-KUDE-02:** el proveedor puede ignorar serie o estar consultando otro registro con el mismo EEE/PPP/número de otra cuenta. Necesita respuesta/contrato real del gateway; **NO se ha demostrado dónde ocurre la confusión**.
- No alterar PDFs, ni usar CDC ajeno, ni consultar históricos de otra empresa para autorizar; preservar acceso tenant/permiso/SSRF y no exigir APROBADO para visualizar un KuDE legítimo.

## 5. Evidencia operacional indispensable, SOLO LECTURA y con aprobación

**Los accesos al banco, VM y gateway NO están disponibles para Claude; el operador autorizado realiza SELECT/logs sin modificar registros. Nunca copiar claves, tokens ni respuesta cruda sensible.**

A. Identificar `documentos_electronicos` CASA MINGO del `001-001-0000001` con serie `AA`, comparando `empresa_id, sucursal_id, estabelecimento, ponto_expedicion, numero, serie, fecha_emision, estado_local, estado_sifen, ultima_consulta_resultado, lote` (marcar presencia `[omitido]` y comparar con registros de intentos). Incluir otras cuatro `001-003-0009018..0009021`; NO cambiar estados.

B. Recuperar **intentos de ENVIO y CONSULTA** por documento: timestamps, `resultado`, `http_status`, `fase`, `estado_gateway`, `estado_sifen`, `lote` (solo presencia/higiene), `cdc_informado`, `cod_respuesta`, `mensaje`, `respuesta #>> '{response,Estado}'`, presencia de `[omitido]` en CDC/lot; no exponer CDC completo fuera del contexto fiscal autorizado. Diferenciar `XML firmado` de `Rechazado`, incluso si SQL descartó su efecto final.

C. Configuración actual sin claves: `fe_gateway_config.base_url, credencial_ref, credenciales_version, actualizado_at, ultima_prueba_at` por empresa; usuario API SIN contraseña en vista autorizada. Revisar la bitácora `fe_gateway_config_log` anterior y posterior a **09:10:28 / 09:17** (acciones GUARDAR/PROBAR, URL vieja/nueva y cambio de usuario/clave como booleanos). **IMPORTANTE:** registros de configuración no demuestran por sí solos el destino usado en intento; verificar otros logs existentes si hay evidencia y declarar «no demostrable» si no la hay.

D. Leer `documento_electronico_solicitudes` versión 1: identidad fiscal exacta `dEst,dPunExp,dNumDoc,dSerieNum,dFeEmiDE`, `payload_hash`; NO publicar JSON íntegro ni alterar. Comparar con request real solo si existe un registro fiable de transporte o soporte del proveedor.

E. Verificar versión de código REAL desplegada y funciones reales SQL de `NEX-050/054/061/063/069/077/078` por lectura de definiciones/firmas; el comentario «NO aplicada» de Git no prueba producción. Flags del worker `NEXIT_CONSULTA_AUTOMATICA, DEMO_MODE, DATABASE_URL` solo como estados booleanos, sin valores sensibles. Logs de `Consulta automática desactivada`/errores/reservas.

F. En portal E-FacturaHub CASA MINGO, **desmarcar «Ocultar pendientes»** y buscar `001-001-0000001` con serie `AA` en todos estados y lotes, fechas apropiadas. No concluir ausencia total por la captura filtrada. Pedir a soporte del proveedor correlación del lote real, cuenta autenticada, RUC emisor, serie, fecha, estado SIFEN y nombre/certificado de emisor del PDF KuDE (sin reenviar). **Sólo si autorizado.**

## 6. Invariantes y criterios de aceptación sistémica

1. Config/tenant: cada ENVIO/CONSULTA/KuDE usa el gateway y el usuario API de empresa de sesión; cada intento registra evidencia INMUTABLE de destino y versión de configuración sin credenciales/segredos, de forma que se audite históricamente incluso después de cambiar URL. La bitácora no expone password/token.
2. FE nueva: reserva atómica, persistencia JSON exacto `dEst,dPunExp,dNumDoc,dSerieNum`; no reemisión ni reutilización de número; serie AA diferenciada contractualmente.
3. Envío: registrar request/response, HTTP, lote original íntegro y su correlación; estados `ENVIO_INDETERMINADO` para ambigüedad, `ENVIADO` SOLO para recepción confirmada del gateway e identidad suficiente, **nunca** aprobado por HTTP 200. No perder lote por saneamiento. Si la respuesta indica otra cuenta/identidad, bloquear su atribución.
4. Consulta: recibir CDC **EXCLUSIVAMENTE de la API**, validarlo íntegro por tipo/EEE/PPP/número y EMISOR contra fuente confiable; si hay primer CDC y respuesta válida de esa factura, persistir exactamente esos 44 dígitos y SIFEN estado/código/mensaje; si existente CDC contradice, no sobrescribir. Registrar **TODOS** los intentos y estados brutos incluyendo `XML firmado`, `Rechazado`, errores y tiempos de espera, con fecha y fuente separada del estado fiscal consolidado.
5. Worker: consulta automática real con NEX-077 verificable, logging operacional y reintentos sujetos a reglas; no crear cron/monitor nuevo. No hacer presuposiciones sobre deployment.
6. KuDE: permitir un PDF genuino de FE/NCE aun si SIFEN rechazado o CDC todavía NULL, **PERO NUNCA atribuir un PDF de otro emisor a CASA MINGO**. Cuando se puede corroborar por metadato oficial del proveedor, verificar origen/serie/receptor; ante contradicción, informar error seguro y no mostrar PDF ajeno como correcto. No modificar binario ni CDC.
7. Pruebas deben cubrir **código REAL** y el recorrido integral con DB+gateway simulados de forma coherente: CASA MINGO vs Distribuidora con mismo EEE/PPP/NNNNNNN, serie AA vs NULL, cambio de credenciales entre preflight/envío/consulta/KuDE, lote con RUC/clave como substring, recepción y rechazo, `XML firmado`, consulta automática, CDC correcto/ajeno, KUDE ajeno/proprio y casos de segundo envío duplicado. No ejecutar hasta aprobación expresa.
8. Cada fix debe entrar después de diagnóstico global y auditoría, con gate de migraciones y homologación operacional. Ninguna fase de este documento autoriza código funcional, SQL/migrations, pruebas ejecutadas, consultas a gateway real, VM, cambio de estados o deploy.

## 7. Plan de recuperación / orden de trabajo

**Fase A (ahora):** auditoría única, correlación histórica de envío-estado-KuDE usando datos EXISTENTES, con lectura operacional autorizada. Claude sólo analiza código y prepara SELECT de lectura sin ejecutarlos. No iniciar PRO-340 ni continuar R06 aislada.

**Fase B:** con evidencia real, emitir una única propuesta de corrección integral priorizada, determinando cuáles rutas deben cambiar y cuáles invariantes de PRO-326 deben ser revisadas por incompatibilidad con la seguridad. Seleccionar cambios mínimos comprobables, no una nueva serie de parches aislados.

**Fase C (aprobación separada):** código, casos escritos, auditoría independiente, ejecución de pruebas autorizadas y deploy controlado con migraciones necesarias. Reconsultas oficiales para conciliar documentos SOLO previa autorización, sin reenvío ni reescritura manual de CDC/estados/histórico.

**Resultado de esta auditoría:** INCIDENCIA P0 DEMOSTRADA EN UI y varios GAP confirmados estáticamente; **la causa de la selección del proveedor/credencial y de la respuesta SIFEN para el documento concreto NO se puede declarar sin evidencias reales de las 09:10/09:30 y versión desplegada**.
