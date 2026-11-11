# PRO-342 — REGLA DEFINITIVA SIMPLIFICADA / CDC INFORMADO POR EL GATEWAY

**Fecha de decisión del responsable:** 11/11/2026
**Proyecto:** NEXIT / CASA MINGO
**Analista:** ChatGPT; **desarrollador:** Claude
**Estado:** decisión de negocio vinculante. **No es autorización de programación, SQL, tests, consultas reales, VM ni despliegue.**
**Prevalencia:** este documento **REEMPLAZA ÍNTEGRAMENTE** la propuesta anterior de validaciones adicionales de CDC, cálculo de RUC/DV/fecha/dígito, configuración de emisores alternativos, vínculo artificial con serie AA, pruebas criptográficas del PDF y cualquier complejidad añadida que impida registrar un CDC legítimo del gateway. Los informes anteriores son diagnósticos históricos, no nuevas órdenes activas.

## ACLARACIÓN DEL ANALISTA — RESULTADO FINAL SIN CDC (AUD PRO-342-R02)

**La decisión fiscal `Aprobado` / `Rechazado` y la entrega del CDC son DOS datos diferentes de la API.** Si `consulta_de`, para el documento solicitado y bajo su conexión correspondiente, comunica un estado fiscal final verificable `Aprobado` o `Rechazado` con código/mensaje pero **no devuelve CDC**, registrar ese estado final y su historial, manteniendo `cdc=NULL` hasta que el proveedor lo informe. **No degradar un `Rechazado` auténtico a `RESPUESTA_INVALIDA` exclusivamente por no traer CDC** ni seguir consultando indefinidamente por esa razón. El rechazo no se inventa a partir de HTTP, mensaje genérico ni `XML firmado`: debe venir expresamente del campo oficial de estado del proveedor para el documento consultado. Si la respuesta trae un CDC ajeno o distinto del ya registrado, conservar las protecciones de divergencia y no tomarla como estado final confiable. Las reglas normales de cancelación/inutilización y estados finales previos permanecen intactas.

**No crear CDC para cerrar un estado.** La ausencia de CDC se muestra como dato pendiente del proveedor, sin reabrir envíos ni reconstruir el documento. La regla obliga a la implementación TypeScript y a la persistencia SQL (NEX-079 versionada y flujo compatible existente); no autoriza ejecutar migrations ni editar históricos.

---

## RECTIFICACIÓN DEFINITIVA — RESPUESTA «XML firmado» Y RECONSULTAS (11/11/2026)

**Decisión expresa del responsable, prioridad sobre TODO el texto anterior:**
- **«XML firmado» es el PRIMER ESTADO de la API/gateway, NO es estado fiscal definitivo.** Un primer resultado `XML firmado` NUNCA significa `Aprobado` ni `Rechazado`.
- **No terminar la consulta después del primer resultado.** El scheduler existente debe VOLVER A CONSULTAR EL MISMO DOCUMENTO tantas veces como permita la política de reintentos hasta recibir del SIFEN **`Aprobado` o `Rechazado`**. Registrar CADA intento y respuesta (HTTP, fecha, estado bruto, código, mensaje, error o estado final). Si hay errores temporales, mantener pendiente y reprogramar; ante bloqueo persistente, alertar al operador, sin inventar respuesta definitiva.
- **«XML firmado» puede traer KuDE habilitado**, pero esa habilitación NO implica aprobación fiscal. No usar el KuDE como prueba de estado final.
- **No asumir que «XML firmado» entrega CDC.** Si la API no lo incluyó, NEXIT deja CDC ausente; si una respuesta de la API efectivamente lo incluye para ese documento, registrarlo EXACTAMENTE tal como llegó, sin deducirlo de XML firmado, del KuDE ni del JSON enviado. Nunca generar CDC ni alterar el que ya está persistido.
- **No reenviar el JSON por necesidad de reconsulta.** Otro documento/JSON tiene el CDC que su propia respuesta de API informe; las consultas repetidas del MISMO documento no crean otro CDC.
- **Estados separados:** `ENVIADO` = ACK del gateway; `XML firmado` = fase inicial/intermedia; `KuDE habilitado` = disponibilidad del PDF; `Aprobado/Rechazado` = decisión final SIFEN. Nunca mezclar.

**Criterios de aceptación vinculantes:** (1) primer retorno XML firmado queda guardado sin marcar final; (2) hay consultas posteriores automáticas del mismo documento hasta respuesta final o incidencia operativa; (3) llegada de Aprobado/Rechazado se persiste con código/mensaje/fecha; (4) ausencia de CDC en XML firmado no produce CDC artificial; (5) KuDE habilitado no cierra el seguimiento; (6) un solo envío JSON y lote íntegro, sin reenvío al consultar.

**Esta rectificación prevalece sobre frases históricas del documento que decían o presuponían que el XML firmado siempre trae CDC.** Ningún cambio funcional, SQL, test, worker, VM o deploy queda autorizado por la rectificación.

---

## 1. La regla de negocio no es complicada

**El CDC se registra únicamente si la API lo informa. «XML firmado» es estado inicial y exige nuevas consultas hasta «Aprobado» o «Rechazado».**

1. NEXIT genera el JSON fiscal del documento, con empresa/punto/número/serie y demás datos que YA utiliza. Lo manda SIN generar ni informar CDC.
2. La API/gateway recibe el JSON y devuelve la respuesta y el lote. El lote se registra **exactamente** como fue recibido, sin reemplazar el RUC por `[omitido]` ni alterar ningún carácter.
3. En la consulta de estado, NEXIT envía **la identidad del documento, sin CDC**. Si la respuesta de la API identifica el XML firmado y trae el CDC de ese documento, **registrar EXACTAMENTE ESE CDC**. No esperar a `Aprobado`, no calcular uno nuevo, no reconstruir desde campos, no cortar, completar, enmascarar ni reescribir.
4. El CDC identifica **ese documento fiscal/JSON**. **Si se emite OTRO DOCUMENTO con OTRO JSON, el gateway informará el CDC de ese otro documento**; NEXIT no reutiliza, copia ni calcula por su cuenta el CDC de la factura anterior. Una nueva consulta del MISMO documento NO significa otro JSON ni autoriza sustituir el CDC ya grabado.
5. La consulta de SIFEN continúa hasta recibir el **resultado fiscal informado por la API**, que se conserva con código, mensaje, fecha y estado, sea `Aprobado`, `Rechazado`, error o paso intermedio.
6. `XML firmado` significa que el gateway informa **XML firmado**, NO que SIFEN ya lo aprobó. Guardar el CDC recibido y conservar `XML firmado` como estado/mensaje técnico hasta que la API reporte resultado SIFEN. **CDC existente y aprobación fiscal son eventos diferentes.**
7. Cada envío y consulta deja intento/historia, con resultado real. **Nunca ocultar un intento como «Sin consultar» sin mostrar que existió una consulta técnica.**
8. KuDE: solicitar desde la **misma empresa/conexión y el documento correcto** con los campos ya existentes, recibir el PDF del gateway y presentarlo tal como lo devuelve. NEXIT NO fabrica ni altera PDF, NO genera otro CDC para el KuDE ni selecciona un documento viejo por tener el mismo número. Si el proveedor devuelve un documento ajeno, mostrar un error de respuesta no correspondiente y pedir corrección al proveedor, sin inventar reglas de cálculo de CDC o modificar el archivo.
9. No reenviar JSON por una divergencia de estado, KuDE o CDC. No modificar documentos, números, series, lotes, CDC ni estados fiscales previos manualmente.

**Regla técnica mínima de asociación:** un CDC retornado por la API se guarda en el registro del **mismo documento solicitado y recibido**. Se mantiene el aislamiento de empresa, permisos y documento de la petición. No agregar cálculo local independiente de RUC, DV, fecha o dígito como condición nueva para aceptar el CDC del XML firmado; no promover respuestas de otro documento o textos arbitrarios a CDC operacional.

## 2. Qué se debe CORREGIR en NEXIT y nada más

### ENVÍO
- Resolver una única configuración de gateway de la empresa para la transmisión; no volver a leer otra config silenciosamente entre preparar y transmitir.
- Conservar el JSON original/identidad del documento; no inventar ni mandar CDC.
- Grabar HTTP, confirmación del gateway y **lote literal original**. `ENVIADO` significa recibido por el gateway, no SIFEN aprobado.
- Mantener idempotencia: jamás repetir un `POST` de un documento que puede haber sido recibido sin decisión operacional.

### CONSULTA DE ESTADO
- Enviar los identificadores persistidos de esa factura, sin CDC, con la conexión vinculada a su emisión.
- Grabar CDC literal de la respuesta del XML firmado, cuando la API lo devuelva; **no bloquearlo sólo porque todavía no haya APROBADO**.
- Registrar cada intento, HTTP, estado/mensaje bruto, código fiscal cuando exista, fecha y resultado técnico.
- Si la API responde `XML firmado`, mantener el flujo pendiente y continuar la consulta normal programada; no inventar `Aprobado`/`Rechazado`. Cuando la API informe el resultado SIFEN, registrarlo como tal.
- Si ya existía CDC para la factura, **no sobrescribir** por una respuesta distinta: investigar asociación del intento, nunca fabricar otro CDC.
- La consulta manual y la automática tienen la **misma regla** de guardar historia y CDC de la API.

### HISTORIA
- Los intentos de ENVÍO/CONSULTA son append-only. Mejorar rastreabilidad de conexión utilizada (URL, referencia y versión **sin contraseña/token**) si los campos actuales no alcanzan.
- No reescribir CDC/lote viejos mutilados, ni recuperarlos desde senha, SQL o imágenes. Solo una respuesta **nueva y auténtica** del proveedor, obtenida con autorización operacional, puede aportar el identificador que faltaba.
- Diferenciar en la UI estado de transmisión, último estado informado por gateway y estado fiscal SIFEN confirmado.

### KUDE
- Mantener contrato actual FE (cinco campos, `tipoDoc:"FE"`) y NCE (seis, `tipoDoc:"ncr"`, `tipOpe:"4"`), conservando `dSerieNum` y ceros.
- Mantener la posibilidad de solicitar KuDE en estado pendiente/rechazado/sin CDC local, conforme PRO-326.
- Consultar el KuDE del mismo documento y configuración de gateway; si devuelve documento de otra empresa, **no asociarlo como propio**. El origen de los PDFs de prueba debe aclararse con el proveedor, sin cambiar RUC legal del cliente.
- No crear nuevas fórmulas para CDC, DV, fecha, serie o análisis heurístico del PDF. Resolver la discordancia en la fuente/documento devuelto por la API.

### CONSULTA AUTOMÁTICA
- Usar worker existente y NEX-077 si aplicada. No crear otro scheduler. Si no funciona en producción, el operador verificará su despliegue y migraciones con lectura autorizada.

## 3. Qué queda EXCLUIDO por decisión expresa

- Crear/calcular un CDC por algoritmos locales o verificarlo con nuevas fórmulas de RUC, DV, fecha/dígito antes de grabar uno recibido del XML firmado.
- Esperar `Aprobado` o `Rechazado` para guardar el primer CDC auténtico del XML firmado.
- Crear un RUC emisor alternativo o reconfigurar ambiente/contraseña sin petición específica.
- Construir reglas nuevas de serie `AA` dentro del CDC (no existe esa serie en CDC).
- Exigir leitura criptográfica/OCR do PDF o crear nuevas pantallas administrativas para «validar» un CDC ya informado por API.
- Nuevas versiones Rxx para el mismo defecto sin terminar el flujo simple, ni reenvío/reconstrucción de histórico.
- Tocar PRO-340, cambios no solicitados en facturación, stock, NCE y KuDE que no sean parte de la corrección efectiva.

## 4. Criterios de aceptación integrados

1. Enviar JSON una sola vez, registrar lote **exactamente** como llegó.
2. Un XML firmado con CDC devuelto por la API deja ese CDC **exacto** registrado de inmediato, aunque estado fiscal todavía no sea `Aprobado`.
3. Siguiente consulta del MISMO documento no genera otro CDC ni lo sobrescribe.
4. OTRO documento/JSON no copia CDC anterior: registra únicamente CDC que la API le informe para ese documento.
5. `Aprobado`, `Rechazado`, error y estados intermedios se almacenan íntegramente con código, mensaje, fecha y trazabilidad.
6. Consulta manual y automática funcionan con la misma semántica; worker existente, sin cron paralelo.
7. KuDE correcto viene del mismo documento y gateway, no de una factura antigua u otra empresa.
8. Ningún `[omitido]` altera CDC o lote operativo; passwords/tokens siguen ocultos en mensajes/logs.
9. NEX-077/NEX-078 verificadas antes de activar versión dependiente. Sin migraciones por IA sin autorización.
10. Preservar todas las filas históricas. Sin reenvíos ni edición manual de estados fiscales.

## 5. Gobierno

Esta es la **única regla de negocio autorizada**. ChatGPT especifica/audita; Claude SOLO desarrolla cuando el responsable lo autorice. Claude debe leer código completo/actual, uno por vez, publicar SHA y detenerse para auditoría. Ningún test, SQL, migration, consulta al gateway, VM, Docker o deploy queda autorizado aquí.

**PRO-342 P0 permanece abierta; PRO-338-R06 se integra sin crear nuevas complicaciones; PRO-340 continúa bloqueada.**
