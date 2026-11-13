# AUDITORÍA DE SISTEMAS Y NEGOCIO — PRO-342 / CASA MINGO

**Fecha:** 11/11/2026 · **Auditor responsable:** ChatGPT (análisis funcional, técnico, fiscal y de integraciones) · **Severidad:** P0
**Repositorio:** \`proceit-tech/distribuidora\`, rama \`feature/NEXIT-2026-001-banco-demo\`.
**Objeto:** ENVÍO de FE → ACK/lote → CONSULTA SIFEN → HISTORIA inmutable → CONSULTA AUTOMÁTICA → KuDE.
**Referencias:** [PRO-342](https://linear.app/proceit/issue/PRO-342) · [GitHub #19](https://github.com/proceit-tech/distribuidora/issues/19).
**Fuentes examinadas directamente:** \`envio.ts\`, \`emision.ts\`, \`shared.ts\`, \`gateway.ts\`, \`gateway-credenciales.ts\`, \`configuracion-gateway.ts\`, \`reconciliacion.ts\`, \`estados.ts\`, \`presentacion-sifen.ts\`, \`consulta-automatica.ts\`, \`kude.casos.ts\`; SQL NEX-047, 048, 049, 050, 054, 061, 063, 069, 077, 078; capturas proporcionadas por el responsable. Se verificó también el [Manual Técnico SIFEN v150, §10.1](https://ekuatia.set.gov.py/documents/20123/420592/Manual%2BT%C3%A9cnico%2BVersi%C3%B3n%2B150.pdf/e706f7c7-6d93-21d4-b45b-5d22d07b2d22?t=1687362295907.pdf).
**Límite:** NO hay acceso a DB, VM, lote original ni logs del proveedor; el archivo de Claude \`PRO-342-D01-auditoria-fiscal-integral-casa-mingo.md\` no estaba disponible en GitHub/Linear/archivos accesibles. Esta es una **auditoría propia y completa del CÓDIGO VERSIONADO Y DEL PROCESO DE NEGOCIO**, NO una certificación del estado de producción.
**Ejecución:** **0 tests, 0 lint/build, 0 SQL ejecutado, 0 llamadas al gateway, 0 cambios fiscales, 0 deploy**.

## I. VEREDICTO EJECUTIVO

**NO CONFORME PARA PRODUCCIÓN / HOMOLOGACIÓN DE CASA MINGO.** Hay al menos cuatro brechas estructurales confirmadas por código y una anomalía grave visible: el KuDE asociado a la factura de CASA MINGO mostró un PDF de otro emisor. No es correcto concluir que el JSON se envió a la cuenta equivocada sin probar el destino; sí es correcto afirmar que **la correlación del documento, la evidencia fiscal y el trazado por intento son insuficientes**.

### Evidencia del incidente
- FE NEXIT \`001-001-0000001 (AA)\`, emisión **11/11/2026 09:10:27**, JOSE FRANCO, **PYG 1.000**. Aparece \`Envío: Enviado\`.
- Lote visible: empieza por **\`[omitido]\`**, seguido de \`-1-001-001-0000001-20261111091028-...\`. Ese texto no equivale a la cadena original íntegra que devolvió el gateway; verificar si la columna \`lote\` persistida está igualmente dañada.
- Última consulta **09:30:57**: \`HTTP 200\`, \`XML firmado\`, \`CDC_DIVERGENTE\`; CDC local nulo y \`estado_sifen=SIN_CONSULTA\`. \`XML firmado\` NO equivale a aprobado SIFEN.
- KuDE abierto para \`001-001-0000001 (AA)\`: PDF visible de **DISTRIBUIDORA DEL PARAGUAY S.A.**, con fecha, receptor, moneda/importes distintos de la FE de CASA MINGO.
- Configuración CASA MINGO muestra \`https://gateway.e-factura-hub.com\` y prueba de conexión OK **09:17**, posterior al envío. La prueba llama \`/api/login\`, no \`/api/recepcion_de\`.
- Portal del proveedor filtrado CASA MINGO no muestra esa FE en la captura; pero \`Ocultar pendientes\` estaba marcado, así que **no demuestra ausencia del documento**.
- Cuatro FE anteriores \`001-003-0009018..0009021\` presentan situación similar de divergencia local; en portal/exportación anterior se informaba \`Rechazado — Número de timbrado inválido\`.

## II. FLUJO ACTUAL REAL: QUÉ HACE CADA CAPA

| Etapa | Fuente concreta | Comportamiento comprobado en código |
|---|---|---|
| Selección FE | \`emision.ts::prepararFactura\` / NEX-063 \`fe_documento_crear_fe\` | Valida empresa/sucursal/punto activos; reserva secuencia FE por tipo y serie de manera transaccional; genera payload con \`dEst,dPunExp,dNumDoc,dSerieNum,dFeEmiDE\`. |
| Evidencia JSON | NEX-048 \`documento_electronico_solicitudes\` | Conserva payload original y \`payload_hash\`, no es evidencia de transporte; se reusa con idempotencia. |
| Configuración | \`envio.ts::configuracionGateway\` | Lee \`fe_gateway_config\` por empresa; si \`credencial_ref=NEXIT_DB\`, lee usuario y clave desde DB de esa empresa; si otra ref, usa variables ENV históricas. |
| Transmisión | \`gateway.ts::enviarDocumentoGateway\` | \`POST {baseUrl}/api/login\` y \`POST {baseUrl}/api/recepcion_de\` con JSON completo y Bearer. |
| ACK | \`gateway.ts::interpretarRecepcion\` | \`status='success'\` y \`nro_lote\` no vacío de longitud admisible pueden fijar \`ENVIADO\`; significa que el GATEWAY confirmó recepción, NO que SIFEN aprobó. |
| Persistencia ENVIO | \`envio.ts::cerrarEnvio\`, NEX-050 \`fe_documento_registrar_envio\` | Inserta intento \`ENVIO\` y actualiza estado local, lote, mensaje y CDC cuando procede. En caso de pérdida del ACK de DB, hay ruta indeterminada, sin reenvío ciego. |
| Consulta de estado | \`shared.ts::consultarEstado\`, \`gateway.ts::consultarDocumentoGateway\` | \`POST /api/consulta_de\` con \`dEst,dPunExp,dNumDoc,dSerieNum,tipoDoc\`; **no transmite CDC**. Interpreta \`response.Estado\`, \`DE.CDC\`, código, mensaje. |
| Conciliación y SQL | \`reconciliacion.ts\`, NEX-054/NEX-077 | Valida consistencia parcial del CDC, protege finales confirmados, inserta intento \`CONSULTA\` incluso en anomalía; sólo con respuesta considerada válida actualiza \`estado_sifen\`. |
| Presentación | \`presentacion-sifen.ts\`, \`shared.ts\` | El badge fiscal procede del estado persistido; el historial de intentos y la alerta técnica proceden de otros campos. |
| Planificador | \`instrumentation.ts\`, \`consulta-automatica.ts\`, NEX-077 | Si está habilitado y schema existe, tick de 60 s, hasta 10 documentos, lease token y backoff. No hay prueba de actividad real en VM. |
| KuDE | \`shared.ts::obtenerKude\`, \`gateway.ts::obtenerKudeGateway/interpretarKude\` | Usa **configuración actual** del gateway y consulta identidad de documento con serie; devuelve PDF si \`status=success\` y Base64/PDF sintácticamente válido. No comprueba emisor ni titularidad del PDF. |

## III. HALLAZGOS Y PRIORIDAD

### P0-01 — KuDE ajeno mostrado como propio: CONFIRMADO

**Evidencia:** captura del PDF del emisor Distribuidora bajo cabecera de FE CASA MINGO; \`gateway.ts:813–837::interpretarKude\` devuelve \`{ok:true,pdf}\` con sólo \`status=success\` y verificación sintáctica \`%PDF-/%%EOF\`; \`shared.ts:429–456\` muestra el PDF bajo nombre calculado desde el documento solicitado; no compara emisor, serie, RUC/identidad y respuesta del proveedor. \`kude.casos.ts\` describe expresamente la política histórica PRO-326 de ignorar CDC del gateway.
**Riesgo:** representación gráfica atribuida a un contribuyente incorrecto.
**Regla de negocio requerida:** KuDE genuino de FE/NCE puede consultarse aun sin estado APROBADO ni CDC previo, PERO jamás debe presentarse PDF de otro emisor como propio. La validación debe usar **origen fiable del proveedor / metadatos oficiales / XML vinculado y cuenta autenticada**. Si el proveedor no da prueba de identidad suficiente, la operación debe fallar de forma segura sin atribución; no editar PDF ni inferir titularidad mediante OCR/texto visual. Verificar tratamiento de \`AA\` y colisión de 001/001/0000001 en distintas cuentas.

### P0-02 — Lote/cdc potencialmente mutilados por el saneamiento antiguo: DEFECTO DE CÓDIGO CONFIRMADO; CAUSA EN PRODUCCIÓN PENDIENTE

**Evidencia:** diseño anterior de \`sinSecretos\` reemplazaba ocurrencias de credenciales sobre el resultado completo, antes de persistir. La captura muestra un lote con \`[omitido]\`. El CDC incorpora RUC del emisor (Manual SIFEN v150 §10.1, posiciones 3–10) y la sustitución de una clave coincidente puede producir \`CDC_DIVERGENTE\`.
**No demostrado:** que la contraseña real sea idéntica al RUC ni que la VM use precisamente la versión antigua al momento del incidente. Es una hipótesis fuerte, no un hecho.
**Regla:** el valor operacional \`lote\` y el CDC fiscal sólo pueden provenir íntegros del gateway. Nunca sustituir, reconstruir, inventar o alterar sus caracteres; separar sanear mensajes/logs de datos fiscales operativos. Un intento histórico ya alterado NO se corrige por UPDATE ni por deducción.

### P0-03 — Sin trazabilidad inmutable de destino/usuario de API por intento: CONFIRMADO

\`documento_electronico_intentos\` (NEX-047/049/050) registra timestamps, fases, HTTP, estados, request_id local, lote y evidencia. **NO** vincula a cada intento el \`base_url\`, \`credencial_ref\`, \`credenciales_version\`, usuario API efectivo sin secreto, identidad del emisor contractual ni identificador externo de correlación retornado por gateway. \`fe_gateway_config_log\` registra modificaciones, pero no prueba inequívocamente qué configuración fue realmente usada a las 09:10.
**Regla:** persistir para cada operación la instantánea NO SECRETA de su destino e identidad de conexión (versión config, URL, usuario API/tenant, hash de payload, request correlation), inmutable e independiente de cambios posteriores. Estudiar una migración versionada y prueba de compatibilidad, NUNCA aplicación automática.

### P0-04 — Identidad del CDC insuficiente para multiempresa: CONFIRMADO

\`gateway.ts:495–496::cdcCoherente\` y NEX-047 \`fe_cdc_coherente\` comprueban 44 dígitos, tipo, establecimiento, punto y número, **NO RUC ni DV del emisor**, fecha de emisión ni DV final del CDC. El formato oficial contiene esos atributos (Manual Técnico SIFEN v150 §10.1). El RUC no se debe inferir de \`credenciales.password\` ni necesariamente de \`usuario API\`; debe venir de identidad fiscal persistida y válida del emisor.
**Consecuencia:** un CDC de otro contribuyente con el mismo EEE/PPP/número puede satisfacer la comprobación parcial, permitiendo atribución errónea si el gateway confunde cuentas.
**Regla:** verificar integralmente CDC recibido contra emisor del tenant (RUC/DV), tipo, EEE, PPP, número, fecha pertinente y dígito CDC según especificación vigente, sin **generar** CDC; las validaciones que dependan de normas temporales/fecha de firma requieren aclaración fiscal para no crear falsos negativos. En recepción/respuesta de estado, comparar también con el contrato del gateway y su cuenta autenticada. Mantener la regla \`CDC previo != CDC nuevo\` → nunca sobrescribir.

### P1-05 — Consulta registrada pero estado fiscal no consolidado ni explicado adecuadamente: CONFIRMADO

\`gateway.ts::interpretarConsulta\` extrae \`response.Estado\`. \`estados.ts::estadoSifenDesdeGateway\` no interpreta \`XML firmado\` como aprobado/rechazado; se convierte en \`NO_RECONOCIDO\`. Eso es prudente: no crear un final ficticio. \`reconciliacion.ts\` + NEX-054 registran cada consulta; si CDC resulta divergente, guardan el intento y \`ultima_consulta_resultado=CDC_DIVERGENTE\` pero **no** cambian \`estado_sifen\`.
**Problema de UX/negocio:** el estado principal \`SIN_CONSULTA\` puede persistir aun cuando hay múltiples consultas técnicas. La pantalla debe distinguir de manera inequívoca **último intento**, **último estado bruto informado**, **último estado fiscal confirmado**, **código**, **mensaje**, **hora**, **resultado técnico** y **origen**, sin inventar aprobado/rechazado.
**Regla final:** ante \`Aprobado\`/\`Rechazado\` de la API vinculados de forma segura a la factura, guardar exactamente estado, código y mensaje fiscal. Ante \`XML firmado\`, conservarlo como estado técnico/intermedio y mantener consulta pendiente. Error/timeout NO borra final válido; historial append-only.

### P1-06 — Planificador automático: IMPLEMENTADO, EJECUCIÓN NO COMPROBADA

\`consulta-automatica.ts:151–177\` lo inicia en runtime apropiado si hay DB y flags; \`ejecutarLote\` exige \`fe_consulta_reservar_token\` de NEX-077 y falla cerrado si falta. Tiene 60 s por tick y backoff 1,2,5,10,30,60 minutos. \`refresco-documentos\` sólo actualiza la lista por GET; no consulta SIFEN.
**Pendiente:** verificar **NEX-077 realmente aplicada**, proceso Next.js Node, flags booleanos y logs; no decir que está apagado porque el archivo SQL tiene comentario «NO aplicada». No crear otro scheduler/monitor para «arreglarlo».

### P1-07 — Configuración y serie: CORRECTAS EN FUENTE, OPERACIÓN REAL INDETERMINADA

NEX-063 reserva \`serie='AA'\` y la incluye como \`dSerieNum\` en el JSON inmutable; la consulta KuDE también envía \`dSerieNum\`. El envío y la consulta leen \`fe_gateway_config\` por empresa y \`NEXIT_DB\` separa credenciales de tenants. **Cambiar el punto no altera el gateway.**
Pero: \`Probar conexión\` sólo hace login; éxito a las 09:17 no prueba el ENVIO de las 09:10. No está demostrado si \`gateway.e-factura-hub.com\` es test/prod para esa cuenta, si la VM tenía código viejo, si el gateway diferenció serie o si el PDF equivocado fue devuelto por una sesión/índice histórico del proveedor.

## IV. DECISIÓN DE NEGOCIO: UN SOLO CONTRATO FISCAL EXTREMO A EXTREMO

\`\`\`text
EMPRESA FISCAL + SUCURSAL + PUNTO + SERIE
           |
           v
JSON FISCAL INMUTABLE (identidad, datos, hash, idempotencia)
           |
           v
CONFIG EFECTIVA CAPTURADA (tenant, URL, usuario API, versión)
           |
           v
POST /api/recepcion_de  --> intento ENVIO (hora, HTTP, ACK, lote ORIGINAL)
           |
           v
ENVIADO AL GATEWAY ≠ APROBADO SIFEN
           |
           v
CONSULTA AUTOMÁTICA/MANUAL (mismo tenant, identidad, sin CDC request)
           |
           v
intento CONSULTA SIEMPRE: estado bruto, fecha, CDC recibido, código, mensaje
           |
           +--> IDENTIDAD COHERENTE Y FINAL: APROBADO/RECHAZADO + CDC original
           |
           +--> ESTADO INTERMEDIO: persistir «XML firmado»; nueva consulta programada
           |
           +--> ERROR/CDC AJENO: alerta, no alterar estado final, evidencia inmutable
           |
           v
KUDE DE LA MISMA EMPRESA Y FACTURA; no mostrar PDF ajeno
\`\`\`

**Estados que NUNCA se mezclan:**
- \`estado_local\`: transmisión/ACK del **gateway**;
- \`estado_sifen\`: resultado fiscal confirmado, sólo tras vinculación inequívoca;
- \`resultado/estado_gateway\` de cada intento: evidencia de operación y estados intermedios/errores;
- \`estado_email\`: comunicación separada.

**Invariant fiscal permanente:** el NEXIT **no crea ni modifica CDC** en este contrato de integración. La API/gateway es la fuente. El CDC auténtico, una vez registrado, nunca cambia. Lote y hashes originales tampoco se «reparan». Se conserva toda la secuencia de eventos e intentos históricos.

## V. PRUEBAS DE ACEPTACIÓN A EXIGIR AL DESARROLLO POSTERIOR (NO EJECUTADAS)

1. CASA MINGO y DISTRIBUIDORA con **misma** numeración 001-001-0000001: sólo el emisor fiscal correcto puede asociarse al JSON, CDC, lote y KuDE.
2. FE \`001-001-0000001 (AA)\` versus una \`001-001-0000001\` sin serie: proveedor y aplicación deben demostrar cuál registro se consulta; si no se puede, falla controlada sin PDF de tercero.
3. Cambio de URL/credenciales durante o después del envío: intentos previos retienen destino/usuario API/versión efectivos; no se consulta un lote antiguo contra la cuenta nueva como si fuera el mismo.
4. Credencial sintética idéntica a 8 dígitos del RUC dentro del CDC o lote: **datos operativos inalterados** y textos/logs libres seguros; nunca \`[omitido]\` en lote/CDC fiscal guardado.
5. Primer CDC válido de la API con \`cdc=NULL\`, \`Rechazado/1101/Número de timbrado inválido\`: guarda CDC auténtico, estado RECHAZADO, código, mensaje y hora, sin falsificar ni sobrescribir previo.
6. CDC de otro RUC con igual tipo/EEE/PPP/número: no guardar como propio ni convertir su respuesta en SIFEN final.
7. \`XML firmado\` y otros intermedios: persisten respuesta bruta, código, fecha; quedan pendientes de resultado final sin declarar APROBADO.
8. Timeout, 4xx, 5xx y reintentos: todos tienen intento auditado; \`ENVIO_INDETERMINADO\` nunca hace doble envío automático ni consume nueva serie.
9. Worker 60s con lease NEX-077, múltiples instancias y actor real: sin consulta duplicada, resultado y siguiente ciclo visibles, sin cron paralelo.
10. PDF de KuDE de otro emisor: NEXIT NO lo presenta como CASA MINGO, aun siendo PDF sintácticamente válido.
11. KuDE correcto para FE/NCE rechazada o pendiente: no bloqueado sólo por CDC NULL/estado no aprobado, siempre con titularidad verificada.
12. NEX-078 ausente: no desplegar versión que provoque 422 en todas las FE nuevas; aplicar/verificar esquema mediante procedimiento independiente autorizado.

## VI. CONSULTAS DE SOLO LECTURA PREPARADAS Y REVISADAS CONTRA SQL VERSIONADA — **NO EJECUTAR SIN AUTORIZACIÓN**

**Parámetro:** sustituir \`<UUID_EMPRESA_CASA_MINGO>\` exclusivamente DENTRO del entorno autorizado; no insertar RUC, token, password ni CDC completo en GitHub/Linear. Si falta alguna columna por versión desplegada, DETENER la consulta y verificar el schema antes de adaptar. Las queries siguientes son SELECT de lectura sobre tablas ya identificadas en NEX-047/048/049/050/061/069. No leer ni exportar \`fe_gateway_credenciales.api_password\`.

### Q1 — Estado real de documentos y marcador de lote mutilado
\`\`\`sql
SELECT d.id, d.tipo, d.establecimiento, d.punto_expedicion, d.numero, d.serie,
       d.fecha_emision, d.estado_local, d.estado_sifen,
       d.ultima_consulta_at, d.ultima_consulta_resultado,
       d.estado_gateway_texto, d.cod_respuesta,
       (d.cdc IS NOT NULL) AS cdc_presente,
       length(d.lote) AS largo_lote,
       strpos(coalesce(d.lote,''), '[omitido]') > 0 AS lote_contiene_omitido
FROM public.documentos_electronicos d
WHERE d.empresa_id = '<UUID_EMPRESA_CASA_MINGO>'::uuid AND d.tipo = 'FE'
  AND d.establecimiento = '001'
  AND ((d.punto_expedicion = '001' AND d.numero = '0000001' AND d.serie = 'AA')
    OR (d.punto_expedicion = '003' AND d.numero IN ('0009018','0009019','0009020','0009021')))
ORDER BY d.fecha_emision DESC;
\`\`\`

### Q2 — Historial ENVIO/CONSULTA (sin datos de secretos ni CDC completo)
\`\`\`sql
SELECT d.establecimiento, d.punto_expedicion, d.numero, d.serie,
       i.id AS intento_id, i.tipo, i.fase, i.creado_at, i.resultado,
       i.http_status, i.estado_gateway, i.estado_sifen, i.cod_respuesta,
       length(i.lote) AS largo_lote,
       strpos(coalesce(i.lote,''), '[omitido]') > 0 AS lote_contiene_omitido,
       (i.cdc_informado IS NOT NULL) AS cdc_informado_presente,
       strpos(coalesce(i.respuesta #>> '{response,DE,CDC}', ''), '[omitido]') > 0 AS cdc_json_contiene_omitido,
       i.respuesta #>> '{response,Estado}' AS estado_crudo_consulta,
       i.respuesta #>> '{status}' AS status_cuerpo_gateway,
       i.request_id
FROM public.documento_electronico_intentos i
JOIN public.documentos_electronicos d
  ON d.empresa_id = i.empresa_id AND d.id = i.documento_id
WHERE d.empresa_id = '<UUID_EMPRESA_CASA_MINGO>'::uuid AND d.tipo = 'FE'
  AND d.establecimiento = '001'
  AND ((d.punto_expedicion = '001' AND d.numero = '0000001' AND d.serie = 'AA')
    OR (d.punto_expedicion = '003' AND d.numero IN ('0009018','0009019','0009020','0009021')))
ORDER BY d.numero, i.creado_at, i.id;
\`\`\`

### Q3 — JSON inmutable de la nueva FE: sólo identidad y hash
\`\`\`sql
SELECT s.version, s.creado_at, s.payload_hash,
       s.payload->>'dEst' AS d_est,
       s.payload->>'dPunExp' AS d_punto,
       s.payload->>'dNumDoc' AS d_numero,
       s.payload->>'dSerieNum' AS d_serie,
       s.payload->>'dFeEmiDE' AS fecha_en_payload
FROM public.documento_electronico_solicitudes s
JOIN public.documentos_electronicos d
  ON d.empresa_id = s.empresa_id AND d.id = s.documento_id
WHERE d.empresa_id = '<UUID_EMPRESA_CASA_MINGO>'::uuid
  AND d.tipo = 'FE' AND d.establecimiento = '001'
  AND d.punto_expedicion = '001' AND d.numero = '0000001' AND d.serie = 'AA'
ORDER BY s.version;
\`\`\`

### Q4 — Configuración y cambios 08:45–10:00, sin credenciales
\`\`\`sql
SELECT empresa_id, base_url, credencial_ref, credenciales_version,
       activo, actualizado_at, ultima_prueba_at, ultima_prueba_estado
FROM public.fe_gateway_config
WHERE empresa_id = '<UUID_EMPRESA_CASA_MINGO>'::uuid;

SELECT creado_at, accion,
       detalle->>'base_url' AS base_url_registrada,
       detalle->>'base_url_anterior' AS base_url_anterior,
       detalle->>'url_cambio' AS cambio_url,
       detalle->>'usuario_api_cambio' AS cambio_usuario_api,
       detalle->>'clave_cambio' AS cambio_password
FROM public.fe_gateway_config_log
WHERE empresa_id = '<UUID_EMPRESA_CASA_MINGO>'::uuid
  AND creado_at >= '2026-11-11 08:45:00-03'::timestamptz
  AND creado_at <  '2026-11-11 10:00:00-03'::timestamptz
ORDER BY creado_at;
\`\`\`
**Nota:** las bitácoras de configuración anteriores no demuestran por sí solas qué credencial fue usada en cada transmisión, porque la referencia no se adjunta al intento.

### Q5 — Presencia de funciones/columna crítica
\`\`\`sql
SELECT to_regprocedure('public.fe_consulta_reservar_token(integer,integer,text[])') IS NOT NULL
         AS nex077_reserva_token_presente,
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'empresas' AND column_name = 'fe_max_lineas'
       ) AS nex078_columna_presente;
\`\`\`
La presencia de estas piezas NO certifica por sí sola que todas las migraciones sean equivalentes a las versiones Git; el operador debe revisar versión/huella de definiciones en otro paso controlado.

### Evidencia fuera del banco, también SIN acciones fiscales
- Comprobar SHA/build realmente desplegado en la VM, sin reiniciar ni modificar; no afirmar «versión vieja» sin prueba.
- Registrar existencia del proceso Node/flags del worker como booleanos, y mensajes de desactivación/errores, sin revelar \`DATABASE_URL\`.
- En el proveedor, buscar por cuenta CASA MINGO, serie AA, fechas y lote, **incluidos pendientes**; solicitar aclaración si el PDF de \`/api/kude\` pertenece a DISTRIBUIDORA y si el ambiente es test o producción. Sin reenviar nada.
- Comparar igualdad de contraseña y RUC **sólo mediante comprobación booleana en entorno autorizado**, jamás imprimiendo/exportando clave.

## VII. PROPUESTA CONSOLIDADA DE CORRECCIÓN (NO AUTORIZADA AÚN)

Una especificación funcional única dividida en componentes verificables y con auditoría de cada entrega:
1. **Contrato de correlación de empresa y gateway**: destino efectivo/versionado por intento, identidad de emisor y JSON hash inmutable, antes de cada POST.
2. **Transporte fiel**: lote y CDC exactos del gateway; saneamiento sólo por campo/destino, no por sustitución sobre objetos fiscales, y parser sólo admite rutas contractuales demostradas.
3. **Consulta/reconciliación**: identidad completa del CDC (RUC/DV + identidad de FE) con fuente empresarial confiable, estado bruto + final independientes, histórico exhaustivo e idempotencia.
4. **KuDE vinculado a su emisor**: validación por respuesta/metadatos comprobables del proveedor, incluyendo serie o su mecanismo de identificación; bloqueo seguro de PDF ajeno sin exigir APROBADO.
5. **Worker/operación**: validar NEX-077/078, permisos, frecuencia, logs, homologación controlada y reconciliación de documentos únicamente por nueva respuesta oficial de la API autorizada.

**Criterio de liberación de P0:** ningún documento de tercero visible como propio; ningún lote/CDC modificado; cada intento enlazado a su gateway y usuario API; rechazo/aprobación e histórico correctos, inclusive documento de mismo número en dos emisores; worker confirmado y migrations presentes. Requiere pruebas ejecutadas y confirmación operacional **solo después de autorización explícita**.

**DECISIÓN FINAL DEL AUDITOR:** PRO-342 **P0 ABIERTO; DIAGNÓSTICO ESTÁTICO CONCLUÍDO, CAUSAS OPERATIVAS CONDICIONADAS A EVIDENCIA**. Claude queda en espera de **UNA ORDEN DE DESARROLLO CERRADA** tras leer los datos reales; no pedirle que haga análisis del negocio ni que decida sobre identidad fiscal. PRO-338-R06 suspendida; PRO-340 no iniciada. **Ningún dato, estado o configuración fiscal fue alterado**.
