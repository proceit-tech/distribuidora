# ORDEN ÚNICA CLAUDE — PRO-342 P0 / Diagnóstico integral del circuito fiscal FE (CASA MINGO)

**Fecha:** 11/11/2026
**Linear:** [PRO-342](https://linear.app/proceit/issue/PRO-342)
**GitHub:** [#19](https://github.com/proceit-tech/distribuidora/issues/19)
**Fuente obligatoria:** [AUDITORÍA P0 INTEGRAL](../testes/AUD-NEXIT-P0-FLUJO-FISCAL-INTEGRAL-ENVIO-CONSULTA-KUDE-2026-11-11.md).
**Repositorio y rama:** `proceit-tech/distribuidora`, `feature/NEXIT-2026-001-banco-demo`.
**TIPO DE ORDEN:** **SOLO DIAGNÓSTICO TOTAL** — sin modificar código ni ejecutar pruebas, SQL, gateway, VM o deploy.
**ÚNICO TRABAJO ACTIVO:** PRO-342. PRO-338-R06 CDC anidado queda EN ESPERA del diagnóstico integral; PRO-340 bloqueada. Al terminar, PARAR para ChatGPT. La fuente de código actual se contrasta siempre con SHA real de la versión desplegada cuando el responsable aporte evidencia.

## 1. Problema que NO se puede fragmentar

**Capturas 11/11/2026 del responsable:**
- FE `001-001-0000001 (AA)`, 09:10:27, JOSE FRANCO, PYG 1.000 → «Envío: Enviado» y lote visible con prefijo **`[omitido]`**.
- Consulta 09:30:57 → HTTP 200, `XML firmado`, `CDC distinto del registrado`, CDC local `Aún no informado`, `Estado fiscal registrado: Sin consultar`. El resultado bruto y el resultado consolidado divergen: no confundir estado intermedio `XML firmado` con aprobación.
- Configuración CASA MINGO `https://gateway.e-factura-hub.com`, usuario API `80003314`, prueba de login exitosa 09:17 (**DESPUÉS** del envío). Una prueba de login NO demuestra el envío a la cuenta adecuada.
- Modal KuDE `001-001-0000001 (AA)` devuelve PDF de **DISTRIBUIDORA DEL PARAGUAY S.A.**, de otra fecha, emisor, receptor y valores. Otro KuDE `001-003-0009020` sí corresponde a CASA MINGO.
- Portal E-FacturaHub CASA MINGO muestra 5 documentos rechazados; FE nueva no visible con filtros actuales y «Ocultar pendientes» activo. No afirmar que no existe sin búsqueda integral del proveedor.

**Objetivo:** demostrar de extremo a extremo qué pasó al JSON de la FE, qué cuenta/URL lo recibió, qué lote real devolvió el gateway, qué estado retornó cada consulta y por qué el PDF es ajeno, y dejar un diseño de corrección integral y verificable. **No nuevos parches Rxx antes de esto.**

## 2. Orden de lectura de fuentes — archivos COMPLETOS y MÁS RECIENTES, UNO POR VEZ

A. Configuración efectiva y credenciales: `lib/facturacion/configuracion-gateway.ts`, `lib/facturacion/envio.ts::configuracionGateway`, `lib/facturacion/gateway-credenciales.ts`, `lib/facturacion/gateway.ts::configGatewayValida/credencialesDe/claveToken`; SQL NEX-061/NEX-069, `fe_gateway_config`, `fe_gateway_credenciales` (SIN extraer clave), `fe_gateway_config_log`. Confirmar si UI y envío leen la misma config de empresa, diferencia entre `NEXIT_DB` y referencia antigua por variables de entorno, cambios 09:10–09:17. Marcar que config actual ≠ prueba de config histórica.
B. Emisión/serie/JSON: `lib/facturacion/emision.ts`, `payload-fe.ts`, `puntos.ts`, `series.ts`, SQL NEX-063 `fe_documento_crear_fe` y `fe_secuencia_reservar`; comparar `dEst,dPunExp,dNumDoc,dSerieNum='AA',dFeEmiDE` del JSON versionado contra identidad del documento. **No cambiar secuencia**.
C. Envío: `envio.ts::emitirFactura/enviarDocumento/cerrarEnvio`, `gateway.ts::enviarDocumentoGateway/interpretarRecepcion/resultadoFiscalSinSecretos`, SQL NEX-050 `fe_documento_iniciar_envio/fe_documento_registrar_envio`. Confirmar qué quiere decir ENVIADO, qué actor y requestID local se registra, si se conserva el lote original sin mutilarlo y la limitación de no guardar origen efectivo/versión de credenciales de cada intento. Analizar si se aceptó un lote del gateway sin correlación inequívoca emisor/serie.
D. Consulta: `gateway.ts::consultarDocumentoGateway/interpretarConsulta`, `shared.ts::consultarEstado`, `reconciliacion.ts::decidirConsulta`, `estados.ts::estadoSifenDesdeGateway`, SQL NEX-047/054/062/077. CDC sólo procede de la API, es INMUTABLE; consulta NO envía CDC. Verificar por qué `XML firmado` y/o `Rechazado` quedó en `CDC_DIVERGENTE`, diferenciando CDC corrompido `[omitido]`, CDC del emisor ajeno, identidad local distinta y SQL desplegada vieja. **Advertencia:** `fe_cdc_coherente` y `cdcCoherente` SOLO comparan tipo/EEE/PPP/número y omiten el RUC emisor; comparar contra identidad confiable sin alterar CDC.
E. Scheduler: `instrumentation.ts`, `consulta-automatica.ts`, NEX-077; distinguir refresco de lista de consulta real. Verificar estado de proceso/migrations por evidencia que aporte responsable; NO crear otro monitor/cron.
F. KuDE: `shared.ts::obtenerKude`, `gateway.ts::cuerpoKudeGateway/obtenerKudeGateway/interpretarKude`, `kude-visor.ts`, `kude.casos.ts`, orden PRO-326. Confirmar request por identidad completa con serie AA, URL/usuario usados y aceptación de cualquier PDF sintácticamente válido; investigar colisión 001-001-0000001 sin serie y otro emisor. **El proveedor debe demostrar de qué cuenta/identidad proviene el PDF.** Diferenciar KuDE disponible aunque SIFEN rechace de KuDE perteneciente a un tercero (nunca presentar como propio). No presumir que hace falta CDC para abrir KuDE; reglas PRO-326 de no exigir aprobación se conservan, la pertenencia sí debe garantizarse mediante verificación acordada.

## 3. SELECTs SOLO LECTURA — preparar para operador, NO EJECUTAR

El responsable autoriza explícitamente la eventual ejecución desde su propio entorno, fuera de esta orden. Ejecutar jamás con Claude ni sobre VM/PG sin permiso. Usar vistas restringidas a CASA MINGO y atributos **no secretos**; sustituir `'<UUID_EMPRESA>` por ID verdadero leído por operador.

### 3.1. Identidad documento, estado, lote y serie
```sql
SELECT d.id, d.empresa_id, d.sucursal_id, d.tipo, d.establecimiento,
       d.punto_expedicion, d.numero, d.serie, d.fecha_emision,
       d.estado_local, d.estado_sifen, d.ultima_consulta_resultado,
       d.ultima_consulta_at, d.estado_gateway_texto, d.cod_respuesta,
       (d.cdc IS NOT NULL) AS tiene_cdc, length(d.lote) AS largo_lote,
       position('[omitido]' IN coalesce(d.lote,'')) > 0 AS lote_mutilado
FROM public.documentos_electronicos d
WHERE d.empresa_id = '<UUID_EMPRESA>'::uuid AND d.tipo = 'FE'
  AND ((d.establecimiento='001' AND d.punto_expedicion='001' AND d.numero='0000001' AND d.serie='AA')
    OR (d.establecimiento='001' AND d.punto_expedicion='003' AND d.numero IN ('0009018','0009019','0009020','0009021')))
ORDER BY d.fecha_emision DESC;
```

### 3.2. Tentativas de envío/consulta, sin JSON crudo/credenciales/CDC completo
```sql
SELECT d.establecimiento, d.punto_expedicion, d.numero, d.serie,
       i.id AS intento_id, i.tipo, i.creado_at, i.resultado, i.fase,
       i.http_status, i.estado_gateway, i.estado_sifen, i.cod_respuesta,
       left(coalesce(i.mensaje,''), 120) AS mensaje_resumido,
       length(i.lote) AS largo_lote,
       position('[omitido]' IN coalesce(i.lote,'')) > 0 AS lote_mutilado,
       (i.cdc_informado IS NOT NULL) AS cdc_informado_presente,
       position('[omitido]' IN coalesce(i.respuesta #>> '{response,DE,CDC}','')) > 0 AS cdc_json_mutilado,
       i.respuesta #>> '{response,Estado}' AS estado_gateway_json,
       i.respuesta #>> '{status}' AS status_http_body
FROM public.documento_electronico_intentos i
JOIN public.documentos_electronicos d ON d.empresa_id=i.empresa_id AND d.id=i.documento_id
WHERE d.empresa_id = '<UUID_EMPRESA>'::uuid AND d.tipo='FE'
  AND ((d.establecimiento='001' AND d.punto_expedicion='001' AND d.numero='0000001' AND d.serie='AA')
    OR (d.establecimiento='001' AND d.punto_expedicion='003' AND d.numero IN ('0009018','0009019','0009020','0009021')))
ORDER BY d.numero, i.creado_at, i.id;
```
**Aviso:** si el mensaje contiene token, nunca copiarlo fuera de entorno autorizado. En lo posible reportar sólo código/estado/si aparece el texto 1101, sin texto crudo.

### 3.3. Configuración ACTUAL y bitácora 09:10–09:17, sin password
```sql
SELECT empresa_id, base_url, credencial_ref, credenciales_version, activo,
       actualizado_at, ultima_prueba_at, ultima_prueba_estado
FROM public.fe_gateway_config
WHERE empresa_id = '<UUID_EMPRESA>'::uuid;

SELECT accion, creado_at, detalle->>'base_url' AS url,
       detalle->>'base_url_anterior' AS url_anterior,
       detalle->>'url_cambio' AS url_cambio,
       detalle->>'usuario_api_cambio' AS usuario_cambio,
       detalle->>'clave_cambio' AS clave_cambio
FROM public.fe_gateway_config_log
WHERE empresa_id = '<UUID_EMPRESA>'::uuid
  AND creado_at >= '2026-11-11 08:45:00-03'::timestamptz
  AND creado_at <= '2026-11-11 10:00:00-03'::timestamptz
ORDER BY creado_at;
```
La bitácora NO prueba por sí sola qué URL/token se utilizó 09:10, porque cada intento no tiene snapshot.

### 3.4. JSON de emisión — sólo campos de identidad, NO payload completo
```sql
SELECT s.version, s.creado_at, s.payload_hash,
       s.payload->>'dEst' AS d_est,
       s.payload->>'dPunExp' AS d_pun_exp,
       s.payload->>'dNumDoc' AS d_num_doc,
       s.payload->>'dSerieNum' AS d_serie_num,
       s.payload->>'dFeEmiDE' AS fecha_de
FROM public.documento_electronico_solicitudes s
JOIN public.documentos_electronicos d ON d.empresa_id=s.empresa_id AND d.id=s.documento_id
WHERE d.empresa_id = '<UUID_EMPRESA>'::uuid
  AND d.tipo='FE' AND d.establecimiento='001'
  AND d.punto_expedicion='001' AND d.numero='0000001' AND d.serie='AA'
ORDER BY s.version DESC;
```

### 3.5. Verificación de funciones SQL en la base REAL, sin ejecución de migrations
Preparar lectura de `to_regprocedure()`, existencia de columnas NEX-077/NEX-078 y hash/versiones de las definiciones `fe_documento_registrar_envio`, `fe_documento_registrar_consulta`, `fe_documento_registrar_consulta_auto`, `fe_gateway_config_guardar`, `fe_documento_crear_fe`. **No** ejecutar `CREATE`, `ALTER`, `UPDATE` o `SELECT` que invoquen funciones que escriben. Validar configuración de proceso sólo por estado booleano y logs ya disponibles.

### 3.6. Proveedor — preguntas factuales, sin llamar ni reenviar
Solicitar (solo si el responsable autoriza) al soporte gateway el lote original de las 09:10:28, qué API usuario/empresa lo recibió, hash o identificador del JSON fiscal, EEE/PPP/NNNNNNN/AA, retorno SIFEN posterior, fecha/estado, y por qué `/api/kude` para `001-001-0000001` con `AA` bajo credenciales CASA MINGO devuelve PDF del RUC de DISTRIBUIDORA. Preguntar si distingue `dSerieNum` y cuenta autenticada. No compartir passwords, tokens, certificados ni completos datos de cliente.

## 4. Regla de seguridad y semántica esperada

**No introducir un nuevo CDC** salvo el informado por la API y verificado por identidad completa (incluyendo EMISOR si existe fuente confiable); si ya está fijado, no reemplazar por otro. No reinterpretar `XML firmado` como aprobado. El ACK de lote es estado de recepción del gateway, no estado SIFEN. Cada intento de envío y consulta debe ser auditable: respuesta/timestamp/HTTP/estado/código/lote íntegro, destino/versión de config y actor sin exponer secretos. **Toda evidencia inmutable**; no reescritura de historial.

KuDE no exige CDC/APROBADO, pero jamás debe presentar PDF de otro emisor como suyo. La regla antigua PRO-326 de aceptar cualquier PDF válido exige nueva decisión específica de correlación debido al incidente; no cambiarla tácitamente sin validar proveedor.

## 5. ENTREGA ÚNICA / STOP

Claude entrega **un informe D01 completo** con:
1. Cronología de la factura nueva y cuatro anteriores, separando hechos de capturas, verificación de código fuente y evidencia real pendiente.
2. Diagrama de secuencia del flujo `config → JSON/serie → login → recepcion_de → lote/ACK → intento ENVIO → consulta_de → estado/histórico → kude`.
3. Matriz de código/SQL con archivos, funciones, campos exactos, reglas cumplidas/fallidas.
4. Respuestas a 6 preguntas: ¿cuál config real a las 09:10? ¿quién recibió y devolvió el lote? ¿hubo corrupción del lote? ¿qué CDC/estado devolvió la consulta? ¿worker realmente activo? ¿quién emitió el KuDE?
5. Resultados de SELECTs solamente SI el operador autorizado los proporcionó. Si faltan, marcar **NO COMPROBADO**, nunca inventar.
6. UNA propuesta técnica integral priorizada con alcance mínimo, contratos proveedor que faltan y plan de pruebas reales previa homologación, sin tocar código hasta aprobación explícita.

**STOP después del informe D01**. No hacer commit funcional, no modificar schema/SQL/datos, no ejecutar tests, CI, VM, HTTP ni desplegar. **PRO-338-R06 y PRO-340 bloqueadas hasta revisión P0**.
