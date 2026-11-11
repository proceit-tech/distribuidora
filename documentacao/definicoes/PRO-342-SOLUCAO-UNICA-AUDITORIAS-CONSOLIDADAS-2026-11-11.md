# PRO-342 — SOLUCIÓN ÚNICA APROBADA EN ANÁLISIS: ENVÍO → LOTE → CONSULTA → HISTORIAL → KuDE

**Fecha:** 11/11/2026 · **Responsable del análisis y reglas de negocio:** ChatGPT / PROCEIT · **Responsable de implementación futura:** Claude.
**Estado:** ESPECIFICACIÓN FUNCIONAL/TÉCNICA INTEGRADA; no es permiso para ejecutar SQL, cambiar código, emitir documentos o desplegar. PRO-342 P0 abierta, PRO-338-R06 incorporada como dependencia técnica aún no liberada, PRO-340 bloqueada.
**Fuente Claude:** [Informe PRO-342-D01](../analises/PRO-342-D01-auditoria-fiscal-integral-casa-mingo.md) · [Complemento](../analises/PRO-342-D01-complemento-roteiro-leitura.md) · [Script de lectura](../banco/nexit/v1/scripts/diagnostico-PRO-342-D01-SOLO-LECTURA.sql), commit 11b4bea86d00fcafcfa516d208440e60d2ff2299.
**Fuente auditor PROCEIT:** [Auditoría integral ChatGPT](../testes/AUD-CHATGPT-PRO-342-AUDITORIA-FUNCIONAL-TECNICA-INTEGRAL-2026-11-11.md); [parecer condicionado anterior](../testes/PARECER-CHATGPT-PRO-342-D01-REVISAO-CONDICIONAL-2026-11-11.md).
**Norma fiscal:** [Manual Técnico SIFEN v150, sección 10.1](https://ekuatia.set.gov.py/documents/20123/420592/Manual%2BT%C3%A9cnico%2BVersi%C3%B3n%2B150.pdf/e706f7c7-6d93-21d4-b45b-5d22d07b2d22?t=1687362295907.pdf), CDC de 44 dígitos. El CDC contiene tipo DE (2), RUC emisor (8), DV emisor (1), establecimiento (3), punto (3), número (7), tipo contribuyente (1), fecha emisión AAAAMMDD (8), tipo emisión (1), código seguridad (9), dígito verificador (1). **NO incluye serie AA**.
**Alcance:** CASA MINGO FE incidente 11/11, sin perder compatibilidad FE/NCE/PRO-326 ni aislamiento multiempresa.

## A. COMPARACIÓN Y DICTAMEN DE LAS DOS AUDITORÍAS

### A1. Coincidencias — HECHOS ESTÁTICOS ACEPTADOS
1. En versiones anteriores a PRO-338-R03, el saneador puede cambiar substrings del lote y CDC por [omitido], si la contraseña aparece dentro del identificador; el código R05 corrige campos operacionales, pero R05-F001/R06 sigue con discrepancia de procedencia del CDC anidado.
2. Falta guardar POR INTENTO el destino efectivo, cuenta API no secreta, ref y versión de credenciales/configuración; el request_id actual es local y no equivale a un ID aceptado por proveedor.
3. Interpretar recepción admite success + lote sin comprobar emisor ni serie; lote aparentemente incluye RUC/EEE/PPP/número, pero la estructura debe confirmarse con proveedor ANTES de tratarla como un contrato obligatorio.
4. La consulta manual NEX-054 no guarda cdc_informado en columna propia aunque conserva evidencia JSON; NEX-077 auto sí puede guardarlo.
5. Los validadores CDC TypeScript y SQL solo cotejan tipo/EEE/PPP/número, NO identidad del RUC/DV del emisor, fecha ni DV final.
6. «XML firmado» no es APROBADO. Un intento CDC_DIVERGENTE puede quedar registrado mientras estado_sifen sigue SIN_CONSULTA: la UI no debe describirlo como «nunca hubo consulta».
7. Worker existe, con cadencia, lease NEX-077 y restricciones; su estado REAL en VM no comprobado.
8. KuDE actual valida estructura PDF, no pertenencia; la vista puede atribuir a CASA MINGO un PDF cuyo emisor visible es distinto. La captura es evidencia de falta de presentación segura, NO de que el JSON se envió a otra cuenta.

### A2. Diferencias y correcciones a la propuesta del Claude — DECISIÓN CHATGPT
- **Emisor de prueba versus emisor fiscal:** hay decisión histórica [REQ 20/10](REQ-CASA-MINGO-DECISIONES-NCE-KUDE-2026-10-20.md) que dejó deliberadamente el logo/nombre DISTRIBUIDORA DEL PARAGUAY en el KuDE de pruebas; [INC 21/10](INC-NEXIT-NCE-KUDE-GATEWAY-2026-10-21.md) documentó RUC de prueba distinto. Por tanto, la imagen NO demuestra por sí sola un cross-tenant real: es compatible con cuenta/entorno de prueba; aún necesita evidencia del proveedor. No autoriza presentar un PDF SIMULADO como documento fiscal real CASA MINGO.
- **Origen RUC decidido:** para PRODUCCIÓN, RUC y DV del emisor legal tienen como fuente única empresas.ruc y empresas.dv; NUNCA credenciales.password, usuario_api ni heurística de lote. Para HOMOLOGACIÓN/TEST, se admite **emisor de prueba autorizado expresamente por empresa y ambiente**, registrado de forma separada, verificado con proveedor y marcado como TEST; no sustituye el RUC legal ni permite mostrar aprobación fiscal real de CASA MINGO. Si el proveedor no acredita el emisor de prueba, NO habilitar esa configuración.
- **KuDE PRO-326:** NO se revoca el derecho a SOLICITAR KuDE legítimo de FE/NCE sin estado APROBADO/CDC local. Se agrega una condición independiente de SEGURIDAD: para visualizar/descargar/atribuir un PDF como fiscal del emisor correcto, comprobar pertenencia mediante metadatos contractuales confiables o prueba del proveedor/DE XML firmado. Un CDC en JSON que coincide es **necesario cuando el proveedor lo entrega**, pero **NO prueba por sí solo el CONTENIDO BINARIO del PDF** ni la SERIE (serie NO forma parte del CDC). Si falta vínculo fiable de PDF con serie/emisor/documento, bloquear atribución/descarga como KuDE fiscal y mostrar mensaje sin PDF ajeno. En modo TEST con emisor distinto verificado, permitir únicamente visualización explícitamente **SIMULADA / NO VÁLIDA FISCALMENTE**, con rótulo persistente y sin confundirla con un KuDE propio; su política de descarga debe ser acordada aparte. La identidad real del emisor debe permanecer inequívoca.
- **CDC antes del resultado final:** rechazar la sugerencia de esperar APROBADO/RECHAZADO obligatoriamente para fijar primer CDC. Según SIFEN, CDC identifica DE aprobado O NO. Si la API devuelve CDC genuino, único, comprobado contra emisor/identidad/fecha y procedencia contractual, puede fijarse **una sola vez desde NULL**, aunque la consulta diga «XML firmado»; NO convertir por eso el estado SIFEN en APROBADO. Un CDC ajeno, no verificable o sintéticamente saneado NUNCA se fija. Si ya existe, jamás reemplazarlo.
- **«XML firmado» técnico:** conservar estado bruto exacto del gateway; UI «En trámite / pendiente de resultado SIFEN». No mapearlo artificialmente al valor fiscal «PENDIENTE» si el SIFEN no lo informó como tal; conservar estado_sifen confirmado de forma independiente (posiblemente SIN_CONSULTA/NO_RECONOCIDO). Códigos de rechazo SIFEN, firma y recepciones de gateway son categorías separadas.
- **Serie AA:** NO exigir que el CDC compruebe AA. Comparar serie con solicitud inmutable y con un dato confiable de respuesta/consulta del proveedor (o cuenta/clave fiscal equivalente si la API lo garantiza). El lote del ejemplo no transporta serie. Sin contrato de desambiguación, NO atribuir KuDE de número coincidente bajo otra serie.
- **Contrato del lote:** el ejemplo real aporta un patrón, pero no prueba que sea obligatorio/estable para todo proveedor. Solicitar confirmación antes de activar rechazo por regex de lote. Si información oficial no permite relacionar cuenta/EEE/PPP/numero/serie, marcar respuesta INDÉTERMINADA y no reenviar automáticamente.
- **Versión VM/senha/URL:** el rótulo antiguo acota el intervalo de versiones plausibles (errata 3eada02), NO identifica el SHA desplegado. [omitido] indica sustitución local probable, NO prueba contraseña=RUC ni cuenta concreta. URL marcada en código como «test» y REQ previa aportan contexto, pero sólo la cuenta/contrato del proveedor confirma el ambiente real actual.

## B. UN SOLO CONTRATO FISCAL POR EMPRESA/AMBIENTE

**Configuración fiscal por empresa y ambiente:**
- empresaId y emisor legal (empresas.ruc/dv, inmutables para documento emitido);
- ambiente: HOMOLOGACION o PRODUCCION, no inferido sólo de URL;
- cuenta de gateway autorizada para ese ambiente: host base, usuario API sin secreto, referencia y versión de credenciales, emisor fiscal autorizado cuando sea un entorno de pruebas (RUC/DV distintos SI Y SOLO SI documentados), hora y evidencia de validación de proveedor;
- la interfaz debe advertir inequívocamente el ambiente activo ANTES de emitir. No permitir credencial test como si fuera producción. La URL genérica de pruebas no debe mostrarse como configuración válida guardada si falta registro.

**Por operación (ENVIO / CONSULTA / KUDE):**
- seleccionar UNA configuración efectiva por operación y congelar su instantánea no secreta al comienzo (no duplicar lecturas en preflight/envío);
- registrar intento append-only con empresa/documento/serie, tipo, timestamps, URL, ambiente, ref, credenciales_version, usuario API, emisor autorizado, hash del payload enviado, fase, HTTP, resultado, código/mensaje, identificador de correlación del proveedor SI EXISTE, e identificador local propio de la llamada. Nunca guardar password/token;
- preservar request JSON fiscal inmutable y hash (no alterar número ni emisor tras reserva); si ambiente/credencial cambia, nuevas consultas/KuDE no reinterpretan el ACK anterior como si fuera de la nueva cuenta. Consultas sobre documentos históricos requieren el ambiente/cuenta original, únicamente si dicha credencial aún está autorizada; de lo contrario pedir intervención humana/proveedor.
- NO efectuar un segundo envío del mismo documento ante ACK incierto. La base actual bloquea reenvío ciego: conservar.

**ENVIO:**
1. validar empresa/emisor/ambiente/punto/serie/NUM contra cuenta de gateway antes de POST; el JSON actual omite RUC/timbrado por contrato: exigir la vinculación confiable al login/proveedor, no agregar campos no documentados al JSON;
2. POST recepcion_de del payload INMUTABLE;
3. recibir ACK y lote ORIGINAL exacto: guardar como datos operativos íntegros, sin pasar por redacción literal. Mensajes, headers, erros e logs sí se sanean por destino. Si hay discrepancia de emisor/identidad, resultado indeterminado y alerta, sin afirmar ENVIADO. Si hay contrato de lote, validar sus segmentos comprobables; serie se valida por otro vínculo contractual;
4. ENVIADO = recepción acreditada por gateway, NO SIFEN aprobado/rechazado.

**CONSULTA:**
1. consultar identidad del documento sin CDC en request, usando cuenta/ambiente confiable correlacionados al envío. No consultar por cuenta distinta silenciosamente;
2. parser solo acepta CDC de ruta contractual comprobada, no de Nota.CDC arbitrario; conservar CDC 44 dígitos literal, verificación según Manual SIFEN v150 (tipo, RUC/DV emisor, EEE/PPP/número, fecha emisión del payload, DV final módulo 11 y formato). No generar CDC;
3. guardar cada intento, su estado bruto, CDC informado literal en columna para consulta MANUAL/AUTO, código, mensaje, HTTP y tiempo; indicar si es consulta técnica válida, fiscal final validada o descartada por identidad;
4. cuando CDC inicial validado venga de API, aceptar NULL→CDC una vez, incluso si estado bruto es intermedio; si CDC distinto del ya almacenado, conservar previo y alertar; si tercero o saneado, no fijar ni actualizar estado final;
5. solo actualizar estado_sifen definitivo tras correlación y respuesta oficial: APROBADO, RECHAZADO, CANCELADO, INUTILIZADO. Si la API indica PENDIENTE oficial, guardarlo como tal; «XML firmado» conserva su propio estado bruto, sin transformación semántica falsa;
6. mantener protecciones de estados finales e historial append-only (sin UPDATE histórico).

**HISTÓRICO / UI:**
- mostrar separadamente «Estado de envío», «Estado informado por proveedor (bruto)», «Último intento técnico», «Estado fiscal SIFEN confirmado» con fechas, HTTP, código/mensaje, empresa, ambiente, serie, lote en vista autorizada e indicadores de evidencias incompletas;
- para registros anteriores con [omitido] o sin procedencia, marcar «identificador histórico incompleto» y permitir conciliación sólo por NUEVA respuesta auténtica del proveedor, preservando los intentos históricos; NUNCA reparar CDC/lote por UPDATE, ni reconstruir strings con contraseñas;
- categorizar error de transporte, validación del proveedor, rechazo fiscal definitivo, estado intermedio y discrepancia de titularidad, sin mezclar categorías.

**WORKER:**
- usar el scheduler/lease ya existente NEX-077, sin crear cron o servicio paralelo; verificar schema, flags y firma de funciones, y mantener backoff; no habilitar sin prueba real de tenant/actor/ambiente y migración.

**KUDE:**
- solicitar FE con cinco campos y NCE con seis campos del contrato confirmado, manteniendo ceros/serie y capacidad de solicitar en cualquier estado;
- registrar intento KUDE no secreto con cuenta y documento, sin almacenar PDF ni CDC fiscal ajeno; validar respuesta del proveedor con identidad de emisor autorizada, tipo, EEE/PPP/número y vínculo de serie+contenido PDF usando prueba contractual. CDC de respuesta se usa para comparación, no para sobrescribir documento;
- mismatch o comprobación insuficiente: NO mostrar el PDF como CASA MINGO ni permitir descargarlo como factura fiscal auténtica; mostrar diagnóstico seguro. En TEST autorizado, rotular visiblemente SIMULACIÓN, sin impacto en SIFEN real y sin atribuir emisión legal a CASA MINGO.

## C. MIGRACIÓN Y ALCANCE ÚNICO DE DESARROLLO

**Un único paquete integrado PRO-342** con UNA migration incremental versionada **NEX-079** (sujeto a comprobar que el número no está ocupado al comenzar el desarrollo); nunca editar NEX-047…078 ya aplicadas ni migrar/ejecutar en VM por la IA.

La NEX-079 debe incluir compatibilidad backward y controles append-only de evidencia:
1. snapshot de origen por intento ENVIO/CONSULTA, y tabla propia de intentos KUDE o registro tipado equivalente, sin guardar PDF ni secretos;
2. registro estructurado de CDC informado también en consultas manuales, código/mensaje, fuente y clasificación técnica, sin alterar estados existentes;
3. configuración explícita de ambiente y emisor autorizado en modo TEST, manteniendo vínculo con empresas.ruc/dv real y restricciones empresa/usuario/permiso;
4. índices, check constraints, RLS/SECURITY DEFINER/grants y validación de procedencia sin fuga cross-tenant, junto a funciones SQL versionadas necesarias para validar identidad antes de fijar CDC o actualizar estado;
5. compatibilidad con NEX-077 (lease/worker) y NEX-078 (máximo líneas): **no lanzar build dependiente si migrations faltan**.

**Código objetivo orientativo a verificar por Claude, archivo completo/latest, uno por vez:** lib/facturacion/gateway.ts, envio.ts, configuracion-gateway.ts, gateway-credenciales.ts, shared.ts, reconciliacion.ts, estados.ts, presentacion-sifen.ts, consulta-automatica.ts; visualizador KuDE y página Documentos; funciones SQL de envío/consulta/NCE auto en NEX-079; test cases reales de gateway, estado, KuDE y persistencia. Otros cambios requieren justificación y autorización.

**NO exigir reescritura total** ni paquetes R06/R07 sucesivos: corregir una sola cadena fiscal con casos de integración end-to-end y hacer una auditoría final integral. Si hay hallazgos, corregir dentro del MISMO alcance PRO-342 y no iniciar PRO-340.

## D. 16 CRITERIOS DE ACEPTACIÓN (CASOS A ESCRIBIR, SIN EJECUCIÓN)

1. CASA MINGO y DISTRIBUIDORA con mismo 001-001-0000001 no comparten CDC, lote ni KuDE.
2. Emisor legal correcto en producción; emisor test distinto sólo en ambiente HOMOLOGACIÓN autorizado y visualmente rotulado.
3. JSON inmutable conserva dEst/dPunExp/dNumDoc/dSerieNum AA/dFeEmiDE y payload_hash; ninguna reemisión duplica.
4. La configuración efectiva queda congelada y su versión/ruta/actor identificados por cada llamada ENVIO/CONSULTA/KUDE.
5. Prueba de login exitosa NO se presenta como validación de recepción ni cuenta fiscal productiva.
6. Lote exacto de gateway preservado aunque senha sintética coincida con RUC; ningún [omitido] en datos fiscales operativos, pero secretos de textos libres protegidos.
7. Un lote de emisor/número diferente no confirma ENVIADO. Si serie no puede comprobarse, no atribuir identidad fiscal sin contrato.
8. CONSULTA nunca envía CDC; origen CDC sólo API en ruta validada. RUC/DV, tipo, EEE/PPP/número, fecha/DV del CDC verificados según SIFEN.
9. Primer CDC auténtico en consulta intermedia puede fijarse una vez; jamás se sobrescribe ni se genera.
10. Aprobado/rechazado definitivo válidos se guardan con fecha/código/mensaje e historial; rechazo de validación de gateway NO se presenta como rechazo final SIFEN.
11. «XML firmado» se ve como estado gateway, con fiscal final no confirmado; ninguna aprobación ficticia.
12. CONSULTA manual y automática guardan cdc_informado estructurado y todas las tentativas incluso error/timeout/CDC ajeno.
13. Worker lease/backoff existente sigue operativo sólo con NEX-077 aplicada, sin cron nuevo ni duplicidad.
14. KuDE FE/NCE propio en no aprobado/sin CDC local puede solicitarse y mostrarse si su pertenencia comprobada; tercero y serie no correlacionada se bloquean como auténticos.
15. Credenciales/config alteradas después no reatribuyen historial previo; estado fiscal previo final no retrocede.
16. NEX-079 versionada y NO ejecutada; NEX-077/078 gates verificados; 0 reenvíos, 0 alteraciones manuales CDC/estados/históricos; pruebas escritas y auditoría final integral antes de homologar.

## E. ANÁLISIS DEL SCRIPT D01 «SOLO LECTURA»

Se inspeccionaron 188 líneas. `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` y `statement_timeout` son correctos y se aplican por sesión; el script por defecto NO ejecuta funciones de escritura. No se ejecutó.

**DOS AJUSTES OBLIGATORIOS ANTES DE EJECUCIÓN (no ejecutar la versión entregada como está):**
- **Sección 11:** consulta agregada de documentos de OTRAS empresas. Aunque sólo muestra conteos, viola minimización y no prueba una colisión en el proveedor. Restringir exclusivamente al tenant CASA MINGO o suprimir. Para colisión del gateway, preguntar al proveedor, no inspeccionar tenants del NEXIT.
- **Sección 13, opcional:** incluye una expresión `replace(d.lote,'[omitido]',c.api_password)` que RECONSTRUYE una cadena de lote mediante credencial, aunque devuelva sólo booleano. Contradice la política de no reconstruir lote/CDC, y manipula un secreto. **NO ejecutar** sección 13. Si es indispensable comprobar una coincidencia contraseña-RUC, hacerlo con mecanismo booleano aislado y autorizado, sin usar lote histórico, tras revisión específica. No otorgar roles extra para leer tabla de credenciales.

**Otras limitaciones:** errores de columnas por migrations faltantes son señales útiles pero no reemplazan verificación de esquema por fase; el comando `git pull --ff-only` del roteiro cambia el clon y no constituye lectura pura de VM, no forma parte del procedimiento aprobado. Un SHA de clon o cadena de texto en build es indicio, no certificado de commit desplegado. No publicar mensajes de gateway potencialmente sensibles sin redacción.

**Resto:** las columnas, funciones, estructura y dependencias de migrations del script están respaldadas por SQL versionada; la consulta manual antigua no llena `cdc_informado`; ruta `response.DE.CDC` es para CONSULTA, no ENVIO; metadata de log de URL depende NEX-069. El script *con los dos cambios anteriores y con autorización expresa* es una base razonable para diagnóstico read-only.

## F. GATES Y PRÓXIMOS PASOS

**Analista ChatGPT:** definió la solución y decide reglas y criterios. El siguiente hito operativo es recibir: SHA/build real, salida de SELECTs TENANT-ONLY corregidos, historial real de intentos, estado real NEX-077/078 y confirmación por proveedor de ambiente, emisor autorizado, lote/serie y correlación del PDF.

**Desarrollador Claude:** no rediagnosticar ni escoger fuente RUC/KuDE; leer esta especificación y los archivos completos/latest, uno por vez. Esperar autorización del responsable para comenzar un único paquete PRO-342 con NEX-079; escribir casos, sin ejecutar tests/SQL/deploy salvo autorización separada. Si la documentación oficial del proveedor no define cómo unir serie/CDC/PDF, PARAR en el punto de dependencia sin inventar validación.

**Operador/proveedor:** sólo con autorización expresa, hacer lecturas y confirmar contrato. No cambiar ambiente, URL, contraseña, serie, CDC, estados ni emitir/reemitir durante diagnóstico.

**VEREDICTO:** auditorías consolidadas, negocio y arquitectura decididos; PRO-342 P0 **NO LIBERADA PARA PRODUCCIÓN**; no ejecutar diagnostico D01 tal como está ni iniciar PRO-340.
