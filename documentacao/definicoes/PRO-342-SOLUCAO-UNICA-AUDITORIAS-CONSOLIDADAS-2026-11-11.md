# PRO-342 — REGLA DEFINITIVA SIMPLIFICADA / CDC INFORMADO POR EL GATEWAY

**Fecha de decisión del responsable:** 11/11/2026
**Proyecto:** NEXIT / CASA MINGO
**Analista:** ChatGPT; **desarrollador:** Claude
**Estado:** decisión de negocio vinculante. **No es autorización de programación, SQL, tests, consultas reales, VM ni despliegue.**
**Prevalencia:** este documento **REEMPLAZA ÍNTEGRAMENTE** la propuesta anterior de validaciones adicionales de CDC, cálculo de RUC/DV/fecha/dígito, configuración de emisores alternativos, vínculo artificial con serie AA, pruebas criptográficas del PDF y cualquier complejidad añadida que impida registrar un CDC legítimo del gateway. Los informes anteriores son diagnósticos históricos, no nuevas órdenes activas.

## REGLA DE NEGOCIO RECTIFICADA POR EL RESPONSABLE — XML FIRMADO SIEMPRE TIENE CDC (11/11/2026)

**El responsable confirma el contrato operacional de este gateway: si el XML está firmado, tiene CDC; si la API no entrega CDC, NO existe confirmación válida de «XML firmado» para NEXIT.** La autorización anterior para registrar `Aprobado` o `Rechazado` con `cdc=NULL` fue un error de análisis y queda **EXPRESAMENTE REVOCADA**.

- **ENVÍO:** transmitir el JSON original UNA sola vez y registrar ACK/lote literal.
- **PRIMER ESTADO `XML firmado`:** la respuesta del gateway debe entregar el **CDC del documento**. Guardar ese CDC literal y el estado técnico inicial; KuDE puede estar habilitado; **NO es aprobación/rechazo SIFEN**.
- **CONSULTAS POSTERIORES:** volver a consultar EL MISMO documento, sin reenviar JSON ni cambiar el CDC, hasta `Aprobado` o `Rechazado` oficial.
- **ESTADO FINAL:** sólo registrar `Aprobado` o `Rechazado` si ya está asociado un CDC íntegro a ese documento (recibido en XML firmado o en una respuesta fiscal posterior que lo informe). **NUNCA** guardar estado final con CDC NULL. No exigir que cada respuesta sucesiva repita el CDC cuando ya está registrado; exigir que el documento tenga su CDC auténtico.
- **RESPUESTA `XML firmado` o final sin CDC y sin CDC previamente registrado:** guardar la tentativa y respuesta original, clasificar **`RESPUESTA_INVALIDA` / `CDC_AUSENTE` como diagnóstico técnico** (usar un resultado admitido por el contrato SQL existente), **no** declarar XML firmado confirmado ni estado final, mantener seguimiento y reconsulta controlada; si persiste, alertar al operador. No inferir que el proveedor realmente firmó ni reconstruir CDC.
- **CDC AJENO/MALFORMADO/DIFERENTE:** conservar bloqueo de incoherencia, no reemplazar ni fabricar CDC ni usar el retorno para atribuir estado fiscal de otro documento.
- **HISTÓRICO:** toda consulta/erro/resultado bruto con fecha, código y mensaje; distinguir estado técnico, KuDE habilitado y resultado SIFEN. A habilitação do KuDE não finaliza o acompanhamento.

**IMPACTO NO CÓDIGO:** o commit `b17dda189f0b966d43ebedcebb5138c06b3eee11` (R03-01) e sua aprovação estática anterior implementaram a regra ERRADA de final sem CDC; é necessária uma correção focal em `reconciliacion.ts`, no parser se aplicável, na NEX-079 **ainda não aplicada** e nos casos PRO342-R03 e anteriores que passaram a aceitar estado final com CDC NULL. **Preservar R03-02 (conexão), R03-03 (lote), XML firmado→reconsulta→resultado final, histórico e KuDE provisório.** Não alterar NEX-054/062/077 históricos já versionados, nem inventar CDC.

**STATUS:** correção documental da análise, **NÃO é autorização para codificar, rodar testes, SQL, migrations, gateway ou deploy**; implementação aguarda ordem focal separada do responsável.

---

## RECTIFICACIÓN DEFINITIVA — RESPUESTA «XML firmado» Y RECONSULTAS (11/11/2026)

**Decisión expresa del responsable, prioridad sobre TODO el texto anterior:**
- **«XML firmado» es el PRIMER ESTADO de la API/gateway, NO es estado fiscal definitivo.** Un primer resultado `XML firmado` NUNCA significa `Aprobado` ni `Rechazado`.
- **No terminar la consulta después del primer resultado.** El scheduler existente debe VOLVER A CONSULTAR EL MISMO DOCUMENTO tantas veces como permita la política de reintentos hasta recibir del SIFEN **`Aprobado` o `Rechazado`**. Registrar CADA intento y respuesta (HTTP, fecha, estado bruto, código, mensaje, error o estado final). Si hay errores temporales, mantener pendiente y reprogramar; ante bloqueo persistente, alertar al operador, sin inventar respuesta definitiva.
- **«XML firmado» puede traer KuDE habilitado**, pero esa habilitación NO implica aprobación fiscal. No usar el KuDE como prueba de estado final.
- **«XML firmado» debe venir acompañado de un CDC auténtico de ese documento.** Si la API no lo devuelve y tampoco existe CDC previamente informado para el documento, tratar la respuesta como **incompleta/inválida**, registrar la tentativa y continuar el seguimiento; NO fijar estado técnico firmado ni resultado SIFEN. Si lo devuelve, registrar el CDC EXACTO una sola vez. Nunca generarlo, deducirlo o sustituirlo.
- **No reenviar el JSON por necesidad de reconsulta.** Otro documento/JSON tiene el CDC que su propia respuesta de API informe; las consultas repetidas del MISMO documento no crean otro CDC.
- **Estados separados:** `ENVIADO` = ACK del gateway; `XML firmado` = fase inicial/intermedia; `KuDE habilitado` = disponibilidad del PDF; `Aprobado/Rechazado` = decisión final SIFEN. Nunca mezclar.

**Criterios de aceptación vinculantes:** (1) primer retorno XML firmado + CDC se graba como fase inicial, sin marcar final SIFEN; (2) reconsultar mismo documento hasta resultado final o incidencia; (3) Aprobado/Rechazado exige CDC previamente registrado o recibido válidamente para ese documento; (4) XML firmado o final SIN CDC y sin CDC previo es respuesta incompleta: registrar intento sin consolidar, reconsultar; (5) KuDE habilitado no cierra el seguimiento; (6) un solo envío JSON y lote íntegro.

**La regla recién documentada de que el XML firmado implica CDC y un final no se registra con CDC NULL prevalece sobre cualquier frase histórica contradictoria.** Ningún cambio funcional, SQL, test, worker, VM o deploy queda autorizado por esta corrección documental.

---

## 1. La regla de negocio no es complicada

**El CDC del XML firmado lo informa la API; un XML firmado sin CDC es una respuesta inválida para este flujo. «XML firmado» no es final y exige nuevas consultas hasta «Aprobado» o «Rechazado».**

1. NEXIT genera el JSON fiscal del documento, con empresa/punto/número/serie y demás datos que YA utiliza. Lo manda SIN generar ni informar CDC.
2. La API/gateway recibe el JSON y devuelve la respuesta y el lote. El lote se registra **exactamente** como fue recibido, sin reemplazar el RUC por `[omitido]` ni alterar ningún carácter.
3. En la consulta de estado, NEXIT envía **la identidad del documento, sin CDC**. En el primer estado **`XML firmado`**, la API debe informar CDC; **registrarlo EXACTAMENTE**. Sin CDC y sin uno ya registrado, no confirmar firma ni estado final: registrar anomalía y consultar nuevamente. No calcular uno nuevo, completar, enmascarar ni reescribir.
4. El CDC identifica **ese documento fiscal/JSON**. **Si se emite OTRO DOCUMENTO con OTRO JSON, el gateway informará el CDC de ese otro documento**; NEXIT no reutiliza, copia ni calcula por su cuenta el CDC de la factura anterior. Una nueva consulta del MISMO documento NO significa otro JSON ni autoriza sustituir el CDC ya grabado.
5. La consulta de SIFEN continúa hasta recibir el **resultado fiscal informado por la API**, que se conserva con código, mensaje, fecha y estado, sea `Aprobado`, `Rechazado`, error o paso intermedio.
6. `XML firmado` con su CDC confirma la **fase inicial de firma informada por el gateway**, NO aprobación del SIFEN. Conservar CDC y `XML firmado` como estado técnico hasta la respuesta final; **un estado final nunca se registra si el documento sigue sin CDC**.
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
- Grabar el CDC literal informado por la API junto con `XML firmado`; si falta y no existe CDC anterior de ese documento, registrar respuesta incompleta y **NO** consolidar XML firmado ni estado final. Nunca esperar APROBADO para guardar un CDC recibido.
- Registrar cada intento, HTTP, estado/mensaje bruto, código fiscal cuando exista, fecha y resultado técnico.
- Con `XML firmado` **y CDC**, mantener el flujo pendiente y continuar consultas programadas. Sólo registrar `Aprobado`/`Rechazado` final si el documento tiene su CDC auténtico; sin CDC, registrar inconsistencia técnica y continuar seguimiento, nunca inventar estado final.
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
2. `XML firmado` exige el CDC devuelto por la API; grabar ese CDC **exacto** inmediatamente, sin confundir firma con aprobación. `XML firmado` sin CDC y sin CDC previo no se acepta como firma confirmada.
3. Siguiente consulta del MISMO documento no genera otro CDC ni lo sobrescribe.
4. OTRO documento/JSON no copia CDC anterior: registra únicamente CDC que la API le informe para ese documento.
5. `Aprobado` y `Rechazado` sólo se consolidan con CDC existente/autenticado del mismo documento; errores y respuestas sin CDC se guardan como intentos técnicos con código, mensaje y fecha, sin inventar CDC.
6. Consulta manual y automática funcionan con la misma semántica; worker existente, sin cron paralelo.
7. KuDE correcto viene del mismo documento y gateway, no de una factura antigua u otra empresa.
8. Ningún `[omitido]` altera CDC o lote operativo; passwords/tokens siguen ocultos en mensajes/logs.
9. NEX-077/NEX-078 verificadas antes de activar versión dependiente. Sin migraciones por IA sin autorización.
10. Preservar todas las filas históricas. Sin reenvíos ni edición manual de estados fiscales.

## 5. Gobierno

Esta es la **única regla de negocio autorizada**. ChatGPT especifica/audita; Claude SOLO desarrolla cuando el responsable lo autorice. Claude debe leer código completo/actual, uno por vez, publicar SHA y detenerse para auditoría. Ningún test, SQL, migration, consulta al gateway, VM, Docker o deploy queda autorizado aquí.

**PRO-342 P0 permanece abierta; PRO-338-R06 se integra sin crear nuevas complicaciones; PRO-340 continúa bloqueada.**
