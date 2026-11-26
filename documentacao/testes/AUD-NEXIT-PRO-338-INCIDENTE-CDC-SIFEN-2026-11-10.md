## RECTIFICACIÓN DE ANÁLISIS — CDC NO SE ENVÍA EN CONSULTA (10/11/2026)

El responsable corrigió una confusión del análisis inicial: **NEXIT jamás envía un CDC al consultar estado**. `POST /api/consulta_de` envía `dEst,dPunExp,dNumDoc,dSerieNum,tipoDoc` y recibe `response.DE.CDC`. **En la PRIMERA CONSULTA no hay CDC registrado en `documentos_electronicos.cdc`**; el primer resultado asociado inequívocamente al documento debe aportar el CDC y, si se confirma la identidad, el estado SIFEN y su código/mensaje, incluido `Rechazado / 1101 / Número de timbrado inválido`.

El término `CDC_DIVERGENTE` no demuestra que haya un CDC previo diferente: las funciones versionadas también lo emiten si el CDC RECIBIDO contradice tipo/EEE/PPP/NNNNNNN. La pantalla `CDC distinto del registrado` es **engañosa** cuando `d.cdc=NULL`. **No interpretar CDC NULL como incoherencia**. La validación de identidad, en cambio, sigue siendo obligatoria para no atribuir respuesta de otra FE. Si el CDC del gateway coincide con el CDC estructuralmente correcto del portal/Excel, el código SQL versionado no debería impedir el rechazo: se debe encontrar exactamente por qué se devolvió `CDC_DIVERGENTE` (CDC recibido, identidad persistida, implementación SQL real o correlación del gateway), no justificar permanentemente el estado Pendiente ni inventar otra causa.

**Rectificación del flujo exigido:** `primera consulta sin CDC local -> respuesta identificable con CDC válido -> validar identidad -> guardar CDC + RECHAZADO/APROBADO y código/mensaje mediante función SQL transaccional -> listar estado confirmado`. No enviar CDC en request, no presuponer que ya existía, ni establecer RECHAZADO sin correlación segura. Evidencia de intento y estado final son ejes distintos, pero no se debe convertir una primera respuesta válida en bloqueo eterno.

La investigación D03 continúa siendo **SOLO DIAGNÓSTICO**, sin ejecución de SQL, gateway ni cambios en producción. Esta aclaración prevalece sobre cualquier redacción anterior que sugiera que el CDC necesariamente se encontraba ya registrado.

---

# INCIDENTE CRÍTICO — PRO-338 / CDC_DIVERGENTE versus rechazo fiscal real

**Fecha:** 10/11/2026  
**Tipo:** Diagnóstico estático y contraste con evidencia de operador — NO homologación ni corrección ejecutada  
**Issue existente:** [PRO-338](https://linear.app/proceit/issue/PRO-338) / [GitHub #12](https://github.com/proceit-tech/distribuidora/issues/12)  
**Branch auditada:** `feature/NEXIT-2026-001-banco-demo`  
**SEVERIDAD:** P0 para exactitud del estado fiscal de documentos emitidos. **No cambiar estados fiscales automáticamente o a mano sin evidencia correlacionada.**

## 1. Evidencia aportada (10/11)

Se contrastaron tres capturas del operador (lista NEXIT, lista del portal externo y detalle del documento) y su libro Excel `Documentos electrónicos (8).xlsx` (solo lectura de A1:L5).

Cuatro FE del establecimiento 001, punto 003:
- `001-003-0009021` — archivo externo: `Rechazado`, `Número de timbrado inválido`;
- `001-003-0009020` — `Rechazado`, mismo motivo;
- `001-003-0009019` — `Rechazado`, mismo motivo;
- `001-003-0009018` — `Rechazado`, mismo motivo.

El libro contiene un CDC distinto para cada FE, 44 dígitos y **todos estructuralmente coherentes** con tipo `01`, establecimiento `001`, punto `003` y número de siete dígitos. No se copian los CDC íntegros al expediente; quedan disponibles en el archivo del usuario. Esto confirma **coherencia de IDENTIDAD** de los CDCs aportados externamente, NO que sean idénticos a `response.DE.CDC` que NEXIT recibió durante el intento de las 14:06.

**NEXIT muestra** en cada fila `SIFEN: Pendiente de confirmación` + alerta `CDC distinto del registrado`, aunque el historial del intento visible (ej. FE 0009020, 10/11/2026 14:06:41) tiene `HTTP 200`, `Rechazado`, código `1101`, mensaje `Número de timbrado inválido`. El detalle enseña `CDC: Aún no informado`, `estado fiscal registrado: Sin consultar`, última respuesta fiscal válida ausente. La pantalla no registra el rechazo como estado final porque el intento fue clasificado `CDC_DIVERGENTE`.

**Inconsistencia demostrada en el TEXTO de la interfaz:** cuando `d.cdc` es NULL, `CDC distinto del registrado` es una descripción incompleta o engañosa: la clasificación también se activa si el CDC recibido no cuadra con la identidad tipo/EEE/PPP/NNNNNNN, sin ningún CDC registrado previo.

## 2. Flujo de código auditado

- `lib/facturacion/gateway.ts:318–345`: la consulta al gateway usa `POST /api/consulta_de` con `{dEst,dPunExp,dNumDoc,dSerieNum,tipoDoc}`; `:161–183` lee `response.Estado`, `response.DE.CDC` y `response.DE.Retorno.{CodRespuesta,Mensaje}`.
- `lib/facturacion/estados.ts:81–97`: `"Rechazado"` se mapea correctamente a `RECHAZADO`. No es un fallo probado de este mapeo.
- `lib/facturacion/reconciliacion.ts:19–36`: un estado fiscal final exige CDC coherente y no permite sobrescribir finales incompatibles.
- `lib/facturacion/shared.ts:378–414`: `consultarEstado` lee el documento según empresa/sucursal, llama gateway, decide y registra por función SQL `fe_documento_registrar_consulta` o variantes auto/flujo.
- `NEX-047` `fe_cdc_coherente`: CDC 44 dígitos, tipo, posiciones 12–14 EEE, 15–17 PPP, 18–24 número. Los CDCs del Excel cumplen esas comprobaciones.
- `NEX-054`, `NEX-062` (flujo FE/NCE) y `NEX-077` (auto) clasifican `CDC_DIVERGENTE` si `p_cdc <> d.cdc` cuando hay CDC grabado **O** si `NOT fe_cdc_coherente(d.tipo,d.establecimiento,d.punto_expedicion,d.numero,p_cdc)`. En ese caso **no se modifica** `estado_sifen`, `cdc`, `cod_respuesta` ni `mensaje_respuesta` del documento; se conserva el intento.
- `lib/facturacion/presentacion-sifen.ts:17–51` muestra badge del `estado_sifen` PERSISTIDO, no de la respuesta cruda; `CDC_DIVERGENTE` se presenta como alerta aparte.
- `lib/facturacion/shared.ts:255–270` expone en historial `cdc_informado` y fallback del JSON `response.DE.CDC`; se requiere leer esos campos reales para determinar el origen del desacuerdo.

**Deducción condicional con alto respaldo:** SI `d.cdc IS NULL`, los campos `d.tipo/d.establecimiento/d.punto_expedicion/d.numero` son como los listados y `p_cdc` realmente es igual al CDC externo coherente de esa FE, la función SQL VERSIONADA no puede producir `CDC_DIVERGENTE`. Por tanto, faltan evidencias para localizar el defecto: (a) el gateway devolvió un CDC distinto al aportado en el Excel, quizá de otra FE; (b) la identidad del registro NEXIT o la respuesta JSON tienen diferencias; (c) la función aplicada en producción difiere de la fuente actual; o (d) hay otro fallo de correlación. **No atribuir causa única ni falsificar `RECHAZADO`.**

## 3. Servicio de consulta automática — existe en código; actividad REAL NO verificada

**Backend, no frontend:**
- `instrumentation.ts:3–9`: `register()` de Next.js, sólo runtime Node, invoca `iniciarPlanificador()`.
- `lib/facturacion/consulta-automatica.ts:151–177`: agenda `setInterval` cada **60 segundos**, `ejecutarLote` hasta **10** documentos por ciclo, pausa de 500ms. Backoff por documento: **60, 120, 300, 600, 1800, 3600 s** (1/2/5/10/30/60 minutos).
- No arranca si `NEXIT_CONSULTA_AUTOMATICA=0`, `DEMO_MODE=true` o falta `DATABASE_URL`; el flag `globalThis.__nexitConsultaAutomatica` evita doble arranque en un mismo proceso.
- Worker reserva **UN** documento por vez con `fe_consulta_reservar_token`, registra con `fe_documento_registrar_consulta_auto` y programa `fe_consulta_programar_token` (funciones de **NEX-077**). Sin la migration aplicada: advertencia `Consulta automática desactivada: falta la migración NEX-077 (reserva con token).` y ciclo sin consultas. El repositorio dice «versionada, NO aplicada», pero esto **NO es prueba del estado real del PostgreSQL de la VM**.
- `lib/facturacion/refresco-documentos.ts` + `app/(private)/documentos/page.tsx:193–224`: el navegador sólo hace **GET** del listado cada 30/60/120 s si hay pendientes; **no consulta SIFEN**. No confundir refresco visual con worker de gateway.
- Un intento en pantalla fechado a las 14:06 prueba que se registró una consulta, pero NO prueba que fuera ejecutada automáticamente ni que el planificador siga activo (pudo ser manual). Las ventanas de 30/60 min de backoff tampoco implican por sí solas falla.

## 4. Verificaciones OPERATIVAS PENDIENTES (sin acceso a la VM)

No se ejecutó ninguna consulta real ni SQL. **Son verificaciones PARA EL OPERADOR AUTORIZADO, no órdenes para que Claude acceda a producción.**

1. Leer **últimos intentos de CONSULTA por documento** (0009018…0009021), empresa real y sucursal: fecha, `resultado`, `http_status`, `estado_gateway`, `cod_respuesta`, `mensaje`, `cdc_informado`, `respuesta #>> '{response,DE,CDC}'`, `respuesta #>> '{response,DE,Retorno,CodRespuesta}'`, `respuesta #>> '{response,DE,Retorno,Mensaje}'`, `request_id`, `actor_id`. Comparar con CDCs de la hoja y el mismo número de FE. No exponer contraseña, token ni JSON sin saneamiento.
2. Revisar `documentos_electronicos` para los mismos IDs: `empresa_id`, tipo, establecimiento, punto, número, serie, `cdc` y `estado_sifen`, `ultima_consulta_resultado` y tiempo. Comprobar explícitamente `fe_cdc_coherente(..., cdc_gateway)` cuando haya valor real.
3. Verificar en PostgreSQL si las migrations **NEX-054/062/077** están efectivamente aplicadas (tabla de migrations y `to_regprocedure`/columnas; NO asumir por comentario del código); comparar `pg_get_functiondef` con SQL versionado, sin modificarlo.
4. **Estado scheduler:** comprobar en entorno de ejecución (sin revelar valores sensibles) que corre proceso Next.js Node, `NEXT_RUNTIME`, `NEXIT_CONSULTA_AUTOMATICA`, `DEMO_MODE`, presencia de `DATABASE_URL`; logs del proceso de los últimos ciclos: `Consulta automática desactivada`, `Planificador de consultas: error en el ciclo`, `Consulta automática fallida`, `Consulta automática no realizada`, `Consulta automática descartada`.
5. **Programación/reservas**, si NEX-062/077 existen: `proxima_consulta_at`, `consultas_auto`, `consulta_lease_hasta`, `consulta_lease_token`, `estado_local`, `estado_sifen`, y actores con permisos y alcance. Documentos sin actor no se consultan, sólo se reprograman. No abrir un nuevo monitor o cron independiente sin autorización.
6. Gateway: comparar respuesta de `/api/consulta_de` **ya registrada** con salida del portal externo por documento y fecha. Si se requiere nueva consulta remota real, pedir autorización expresa y usar flujo seguro existente; nunca reenviar ni alterar estados manualmente.

## 5. Condiciones de corrección que NO se pueden omitir

- Si CDC e identidad se verifican como coherentes y SIFEN confirmó RECHAZADO código 1101, el resultado fiscal registrado debe pasar por las funciones de persistencia protegidas, y la lista mostrar **SIFEN: Rechazado**, mensaje exacto **Número de timbrado inválido**, fecha y código. No se debe inferir rechazo por HTTP 200 ni por texto sin identidad segura.
- Si el gateway devolvió CDC de OTRA FE, no atribuir ese rechazo a este documento. Mostrar anomalía REAL (CDC recibido vs identidad consultada, fuente y fecha) y preservar estado indeterminado.
- Si no hay CDC local grabado, **no mostrar** el mensaje incorrecto «distinto del registrado» como si hubiera uno; diferenciar «CDC no corresponde a la identidad fiscal del documento» de «CDC difiere del previamente registrado».
- No inventar CDC, no fabricar rechazo, no modificar XML/DE, no emitir/reemitir/cancelar ni tocar numeración, stock, correo, NCE, KuDE o permisos; preservar trazabilidad e inmutabilidad del historial de intentos.
- Antes de activar scheduler o nueva versión, verificar migrations/DDL de esquema y logs, y coordinar con NEX-078 (**también NO verificada/aplicada**: sin ella, versión PRO-339 bloquea TODA FE nueva por HTTP 422).

**Próxima etapa:** [ORDEN CLAUDE DE DIAGNÓSTICO PRO-338-D03](../ordens/ORD-CLAUDE-NEXIT-PRO-338-D03-INCIDENTE-CDC-RECHAZO-WORKER-2026-11-10.md), sin tocar código fiscal hasta obtener la evidencia faltante o reproducir inequívocamente una falla en tests con fuentes. Auditoría ChatGPT posterior y aprobación del responsable antes de ejecutar tests/SQL/deploy.
