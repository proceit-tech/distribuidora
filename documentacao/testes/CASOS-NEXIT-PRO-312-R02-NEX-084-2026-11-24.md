# Casos PRO-312-R02 / Lote A — NEX-084 (contrato SQL de envío E03 R05)

**Fecha:** 24/11/2026 · **Orden:** [ORD-CLAUDE-NEXIT-PRO-312-R02-NEX-084](../ordens/ORD-CLAUDE-NEXIT-PRO-312-R02-NEX-084-2026-11-24.md) · **Auditoría base:** [AUD-CHATGPT C02](AUD-CHATGPT-NEXIT-PRO-312-R01-C02-2026-11-24.md) · **Contrato:** [C02](../analises/PRO-312-R01-C02-CONTRATOS-E03-2026-11-24.md), [C01](../analises/PRO-312-R01-C01-DISENO-E03-2026-11-24.md), [R01](../analises/PRO-312-R01-DIAGNOSTICO-INTEGRACION-E03-2026-11-24.md) · **Rama:** `feature/NEXIT-2026-001-banco-demo` (PR #7 Draft) · **Base:** `81e590060cbbc841079e006fa7cf58ab3860b659`.

**Corrección R02-C01 (25/11/2026):** [orden](../ordens/ORD-CLAUDE-NEXIT-PRO-312-R02-C01-NEX-084-2026-11-25.md) · [auditoría](AUD-CHATGPT-NEXIT-PRO-312-R02-NEX-084-2026-11-25.md) · base `6680b3c`. Solo F001–F005, en los mismos cinco archivos. Las expectativas contradictorias de las secciones 1–10 se corrigieron en su lugar (marcadas «R02-C01»); la matriz de hallazgos, firmas, checksum y casos nuevos R02-C01-001…060 están en §11–§13.

**Corrección R02-C02 (25/11/2026):** [orden](../ordens/ORD-CLAUDE-NEXIT-PRO-312-R02-C02-NEX-084-2026-11-25.md) · [auditoría](AUD-CHATGPT-NEXIT-PRO-312-R02-C01-NEX-084-2026-11-25.md) · base `d512754`. Solo los residuos R-C01-01 / R-C01-02 / R-C01-03, en los archivos existentes de NEX-084 que lo requieren (migración, verificar, reversión y este documento; el preflight no cambia). Las expectativas afectadas de §1–§13 se corrigieron por referencia (marcadas «R02-C02»); informe por residuo en §15 y casos nuevos R02-C02-001…052 en §16.

**Estado:** autoría solamente. Ningún caso de este documento fue ejecutado; ningún SQL fue aplicado ni ejecutado por Claude (ni en la VM ni en otra base). El catálogo real de la VM **no** fue verificado. El CI automático del repositorio aplica todas las migraciones versionadas en su base efímera de pruebas: eso es comportamiento existente del runner, no una aplicación autorizada en la VM.

Archivos de este lote (los cinco de la orden):

| Archivo | Naturaleza |
|---|---|
| `documentacao/banco/nexit/v1/migraciones/NEX-084-facturacion-e03-envio-r05.sql` | Migración incremental aditiva (no aplicada) |
| `documentacao/banco/nexit/v1/scripts/preflight-NEX-084.sql` | Solo lectura (`BEGIN READ ONLY` + `ROLLBACK`) |
| `documentacao/banco/nexit/v1/scripts/verificar-NEX-084.sql` | Solo lectura; la reaplicación de privilegios se describe como paso separado y autorizable |
| `documentacao/banco/nexit/v1/scripts/reversion-NEX-084.sql` | Reversión protegida, no destructiva, idempotente |
| este documento | Casos escritos, no ejecutados |

---

## 1. Matriz del contrato SQL

Todas las funciones de escritura son `SECURITY DEFINER`, fijan `search_path = public, pg_temp`, no usan SQL dinámico, exigen `FACTURACION_ELECTRONICA.CREAR` y alcance de sucursal, y siguen el mismo orden de bloqueos (§5). Errores: `ERRCODE P0001` con `DETAIL NEX:*` (permiso: `42501`). Parámetros siempre por *bind*; nunca se interpolan.

| Función | Entrada | Precondición | Salida | Errores propios |
|---|---|---|---|---|
| `fe_e03_iniciar_envio_r05(empresa, usuario, documento, confirma_rechazo, correlacion uuid, testigo text, conexion jsonb)` | correlación previa y testigo secreto del proceso | correlación nueva → llama UNA vez a `fe_documento_iniciar_envio` (NEX-062); correlación existente → no llama a NEX-062 | `o_resultado, o_payload, o_numero, o_tipo, o_establecimiento, o_punto, o_version, o_payload_hash, o_operacion_id, o_reutilizado, o_vigente` | `CORRELACION_INVALIDA`, `TESTIGO_INVALIDO`, `CORRELACION_DISTINTA`, `SOLICITUD_NO_COINCIDE`, `E03_R05_REVERTIDO`; los de NEX-062 (`ENVIO_EN_CURSO`, `ENVIO_INDETERMINADO`, …) pasan sin cambios |
| `fe_e03_registrar_autenticacion_r05(…, operacion, testigo, motivo INICIAL\|RENOVACION_TOKEN, origen HTTP\|CACHE, resultado OK\|ERROR_HTTP\|TIMEOUT\|RED, http)` | sin mensajes ni secretos; OK por HTTP = 200 exacto (R02-C01) | INICIAL antes de cualquier POST; RENOVACION solo con token rechazado COMPROBADO en el POST 1 (`fe_e03_r05_token_rechazado_post1`: salida HTTP 4xx, P validada con `token_invalido`, regla R-01) y sin POST 2 | `o_nro, o_reutilizado` | `AUTENTICACION_DISTINTA`, `EVENTO_CONTRADICTORIO`, `EVENTO_INVALIDO`, `OPERACION_NO_TRANSMITIDA`, vigencia |
| `fe_e03_registrar_post_r05(…, operacion, testigo, nro_post 1..2, texto HTTP exacto)` | antes del `fetch` | vigente; secuencia; POST 1 tras autenticación OK; POST 2 solo tras token rechazado COMPROBADO (misma función) + renovación OK; texto `::jsonb` = snapshot | `o_nro_post, o_almacenamiento EVIDENCIA_NEX072\|POST_GRANDE_R05, o_solicitud_sha256, o_solicitud_bytes, o_reutilizado` | `CUERPO_NO_COINCIDE`, `POST_DISTINTO`, `SOLICITUD_EXCEDE_LIMITE_DEFENSIVO`, `EVENTO_CONTRADICTORIO`, vigencia |
| `fe_e03_registrar_salida_r05(…, nro_post, tipo HTTP_RESPUESTA\|ERROR_TRANSMISION, http, respuesta, truncada, clase TIMEOUT\|RED, proyeccion, motivo_sin_proyeccion)` | P o motivo de su ausencia (exactamente uno) | POST existente; sin tardía; vía normal vigente; P validada contra el snapshot de la versión | `o_evento_id, o_regla, o_cotejo, o_reutilizado` (reutiliza SOLO con equivalencia semántica completa, R02-C01) | `PROYECCION_INVALIDA`, `PROYECCION_EXCEDIDA`, `CLASIFICACION_NO_COINCIDE`, `PROYECCION_INCOHERENTE`, `IDENTIDAD_SNAPSHOT_DISTINTA`, `EVIDENCIA_CON_CREDENCIALES`, `SALIDA_DISTINTA`, `SALIDA_TARDIA_REGISTRADA`, vigencia |
| `fe_e03_registrar_no_transmitido_r05(…, motivo)` | `SIN_CREDENCIALES\|FALLO_LOCAL\|CUERPO_NO_COINCIDE\|SOLICITUD_EXCEDE_LIMITE` | sin POST y sin autenticación fallida | `o_evento_id, o_reutilizado` | `EVENTO_CONTRADICTORIO`, `EVENTO_INVALIDO`, vigencia |
| `fe_e03_cerrar_envio_r05(…, operacion, testigo, clasificacion_esperada {regla, resultado, estado_local, error_tipo})` | **sin** respuesta, lote, CDC ni mensaje libres | vigente (salvo repetición) | `o_estado_local, o_intento_id, o_regla, o_reutilizado, o_fase, o_resultado, o_error_tipo, o_motivo, o_salida_ultimo_post, o_http_post, o_http_autenticacion, o_lote, o_cdc, o_cerrado_at, o_estado_documento_actual` (R02-C01; también en la repetición) | `CIERRE_SIN_EVIDENCIA`, `CIERRE_CONTRADICTORIO`, `CIERRE_DISTINTO`, `INTENTO_NO_IDENTIFICADO`, vigencia |
| `fe_e03_registrar_salida_tardia_r05(…, nro_post, tipo, http, respuesta, truncada, clase, proyeccion, motivo_sin_proyeccion)` (R02-C01: 13 parámetros) | salida que la vía normal ya no admite; HTTP_RESPUESTA con P o motivo (exactamente uno) | POST existente sin salida normal; `fe_e03_r05_no_vigente` ≠ NULL | `o_salida_id, o_motivo, o_estado_proyeccion, o_reutilizado` (huella semántica) | `SALIDA_ADMISIBLE`, `SALIDA_TARDIA_DISTINTA`, `SALIDA_DISTINTA`, `EVIDENCIA_CON_CREDENCIALES` |
| `fe_e03_operacion_por_correlacion_r05(empresa, usuario, documento, correlacion)` (lectura) | — | mismo actor, CREAR, alcance | `o_operacion_id, o_version, o_vigente, o_cerrada, o_creado_at` (sin testigo ni hash) | permiso / documento no encontrado |
| `fe_e03_conexion_referencia_r05(empresa, usuario, documento)` (lectura) | — | CREAR o EDITAR, alcance | `o_conexion, o_origen INTENTO\|OPERACION_R05, o_referencia_id, o_instante, o_ambigua` | permiso / documento no encontrado |
| `fe_e03_estado_operacion_r05(empresa, usuario, documento, operacion)` (lectura, R02-C01 F003; **R02-C02 R-C01-03**) | — | mismo actor, CREAR, alcance (antes de leer) | identidad, versión, correlación, vigencia y motivo de no vigencia, NO_TRANSMITIDO; autenticación inicial y renovación por separado (existencia, origen, resultado, HTTP); POSTs y último POST (id, almacenamiento, instante); salida NORMAL `SIN_POST\|SIN_SALIDA\|ERROR_TRANSMISION\|HTTP_RESPUESTA` con HTTP, clase de error, estado de P, regla, resultado, estado local, tipo de error, motivo sin P, cotejo y campos cotejados; tardía SOLO como observación (tipo, HTTP, estado de su P); clasificación de cierre derivable provisional `{regla, resultado, estado_local, error_tipo}` o no derivable con motivo; cierre histórico (regla, fase, resultado, estado, error, motivo, intento, HTTP POST y autenticación, lote, CDC, fecha) y estado ACTUAL del documento (`estado_local` y `estado_sifen` por separado); sin testigo, hash, payload ni respuesta | permiso / documento no encontrado / `OPERACION_NO_ENCONTRADA` |

**Derivación del cierre** (solo de la evidencia persistida; primera regla aplicable):

| Regla | Evidencia | fase · resultado · estado · error_tipo · HTTP | Mensaje del intento |
|---|---|---|---|
| `NT` | NO_TRANSMITIDO | TRANSMISION · RED · ENVIO_INDETERMINADO · — · NULL | «Error interno durante el envío: el resultado es indeterminado.» (paridad con `envio.ts`) |
| `AUT-1` | sin POST; autenticación 1 fallida | AUTENTICACION · (TIMEOUT\|RED\|ERROR_HTTP) · ERROR_ENVIO · AUTENTICACION · HTTP del login | textos vigentes de `gateway.ts` |
| — | sin POST, sin fallo de login ni NO_TRANSMITIDO | `NEX:CIERRE_SIN_EVIDENCIA` (no se cierra) | — |
| `AUT-2` | último POST = 1 con token rechazado comprobado (HTTP 4xx, P válida, R-01); renovación fallida | AUTENTICACION · resultado de la renovación · ERROR_ENVIO · AUTENTICACION · HTTP de la renovación | textos vigentes |
| `EI-TOKEN-SIN-POST2` | último POST = 1 con token rechazado comprobado; sin renovación fallida ni POST 2 | TRANSMISION · ERROR_HTTP · ENVIO_INDETERMINADO · — · HTTP del POST 1 | evidencia insuficiente |
| `EI-SIN-SALIDA` | último POST sin salida | TRANSMISION · RESPUESTA_INVALIDA · ENVIO_INDETERMINADO · — · NULL | evidencia insuficiente (D-C02-2-A) |
| `ET-TIMEOUT` / `ET-RED` | ERROR_TRANSMISION del último POST | TRANSMISION · TIMEOUT\|RED · ENVIO_INDETERMINADO · — · NULL | textos vigentes de `gateway.ts` |
| `EI-SIN-P` | HTTP_RESPUESTA sin P | TRANSMISION · RESPUESTA_INVALIDA (2xx) o ERROR_HTTP · ENVIO_INDETERMINADO · — · HTTP | evidencia insuficiente (D-C02-2-A) |
| `R-01…R-07` | HTTP_RESPUESTA con P | la de `fe_e03_clasificar_recepcion_r05` (réplica de `interpretarRecepcion`) | `P.lectura.texto_resultado`; lote solo en `R-06f`; CDC = `P.cdc.valor` (nunca decide) |

El intento se escribe con `fe_documento_registrar_envio_r05` (NEX-080, sin cambios) y la conexión del **snapshot de la operación**. Nunca se escribe `estado_sifen`. La respuesta del intento es la de la evidencia (`respuesta_saneada`) o NULL.

## 2. Decisiones

| Decisión | Estado en NEX-084 |
|---|---|
| **D8-B** (cuerpo íntegro > 1 MiB, SHA-256 y bytes por el banco, almacenamiento incremental, sin hash-only ni ruta directa, sin reducir 999 líneas) | Implementada: tabla `…_posts_grandes_r05` (> 1 MiB, ≤ 8 MiB). La evidencia de NEX-072 (≤ 1 MiB) no se modifica. |
| **D-C02-2-A** (evidencia insuficiente → indeterminado con motivo seguro, sin segundo POST, sin cierre paralelo, CDC nunca condición de ACK, CDC-credencial omitido solo en su valor) | Implementada: reglas `EI-*`, `motivo = EVIDENCIA_INSUFICIENTE`, saneado de P (`cdc.motivo = CREDENCIAL`). |
| D4/D5 (ventana de 2 min de NEX-062; recuperación manual) | Sin cambios. |
| D6 (igualdad cuerpo/snapshot decidida por el banco) | Implementada (`::jsonb IS DISTINCT FROM snapshot`). Comportamiento ante snapshots históricos no representables en JavaScript: **pendiente Lote B** (conteo agregado en el preflight §4). |
| D7 (sin HMAC; sin hash del cuerpo bruto de respuesta) | Respetada: hashes solo sobre la respuesta saneada persistida y sobre P. |
| D-C02-4 (KuDE con referencia de conexión) | **Pendiente Lote B**; NEX-084 solo expone `fe_e03_conexion_referencia_r05`. KuDE y consulta manual sin cambios. |
| D-C02-5 (consulta manual durante `ENVIANDO`) | Sin cambios; su efecto queda reflejado en la vigencia (`DOCUMENTO_NO_ENVIANDO`). |
| Gate PRO-309 | Abierto; nada de NEX-084 lo afecta. |

## 3. Objetos exactos

**Tablas** (todas con `empresa_id NOT NULL REFERENCES empresas(id)` salvo la fila de modo; solo altas; sin `actualizado_at`):

| Tabla | Clave | Vínculos compuestos |
|---|---|---|
| `nex_e03_r05_estado` | `id boolean = true` (fila única) | — (configuración de plataforma; DELETE/TRUNCATE prohibidos) |
| `documento_electronico_envio_operaciones_r05` | `operacion_id` (= id del INICIO) | INICIO de NEX-072 por `(empresa, documento, version, id)`; solicitud `(empresa, documento, version)`; actor `(empresa, id)`; `UNIQUE (empresa, correlacion)` |
| `documento_electronico_envio_posts_grandes_r05` | `id` | operación; `UNIQUE (empresa, documento, operacion, nro_post)` |
| `documento_electronico_envio_autenticaciones_r05` | `id` | operación; `UNIQUE (…, operacion, nro)` |
| `documento_electronico_envio_proyecciones_r05` | `id` | operación; evento HTTP_RESPUESTA; `UNIQUE` por evento y por POST |
| `documento_electronico_envio_cierres_r05` | `operacion_id` | operación; evento CIERRE; intento `(empresa, documento, id)`; `UNIQUE` por intento |
| `documento_electronico_envio_salidas_tardias_r05` | `id` | operación; POST normal **o** POST grande (exactamente uno); `UNIQUE` por POST |

**Disparadores:** inmutabilidad (`fe_e03_evidencia_inmutable`, misma regla DEMO de NEX-072) ×12; guarda de modo ×2; `envio_operaciones_r05_inicio_trg` (la raíz debe ser INICIO); `envio_posts_grandes_r05_guarda_trg`; `envio_evidencias_r05_guarda_trg` **sobre la tabla de NEX-072** (solo inserción: eventos de una operación R05 únicamente desde funciones R05; un número de POST no puede estar en ambas tablas). No altera ni desactiva los disparadores de NEX-072.

**Funciones:** 7 de escritura y 3 de lectura (§1; R02-C01 añade `fe_e03_estado_operacion_r05`); ayudantes internos sin EXECUTE para la aplicación (`fe_e03_r05_*`, `fe_e03_clasificar_recepcion_r05`); `nex_aplicar_grants_facturacion_e03_r05()` (nuevo); `nex_aplicar_grants_facturacion_e03()` **redefinido** (§6).

## 4. Justificación del almacenamiento (D8-B)

- NEX-072 limita `solicitud_http_texto` a 1 MiB por CHECK y la tabla está aplicada: no se edita. Los POST ≤ 1 MiB siguen en ella sin cambios de forma.
- **R02-C01 F004 — límite PROVISIONAL.** Un texto HTTP > 8 MiB se rechaza **antes del fetch** (`SOLICITUD_EXCEDE_LIMITE_DEFENSIVO`) y la operación se declara `NO_TRANSMITIDO` con motivo `SOLICITUD_EXCEDE_LIMITE` → cierre `NT` indeterminado, sin transmisión. **No** está demostrado que 8 MiB cubra toda factura válida: la justificación anterior (`pg_column_size(payload) < 262144` de NEX-048 × ~6) era **incorrecta** — `pg_column_size` mide el almacenamiento jsonb (TOAST/compresión), no acota el texto serializado; y el texto canónico de jsonb no es el de `JSON.stringify`. Se retiró. Sin mediciones en esta corrección y sin ampliar el límite (gate B, §10 B-05).
- La tabla nueva guarda el texto íntegro, SHA-256 y bytes UTF-8 calculados por el banco (`convert_to(texto, 'UTF8')`). No hay hash-only, ni ruta directa, ni reducción de líneas (D8-B). Una FE cuyo texto mida ≤ 8 MiB conserva evidencia completa en una de las dos tablas; que toda FE válida de 999 líneas quepa en 8 MiB **no** está demostrado.
- La medición real de 999 líneas (C01-043) **no** se ejecutó; el preflight informa el máximo canónico existente sin contenido.

## 5. Orden de bloqueos

1. Fila única de `nex_e03_r05_estado` **FOR SHARE**; el modo ACTIVO se comprueba **después** de obtenerla (C02-045).
2. Fila del documento **FOR UPDATE** (la misma que toma NEX-062/080).
3. Altas en las tablas.

La reversión toma la misma fila de modo **FOR UPDATE** primero: espera a toda escritura en curso; las posteriores ven REVERTIDO aunque hayan pasado el control de EXECUTE. Ninguna función toma los bloqueos en otro orden; `fe_documento_iniciar_envio` y `fe_documento_registrar_envio_r05` vuelven a pedir el bloqueo del documento ya obtenido (misma transacción).

## 6. Invariantes y ACL

- **Una sola transmisión por número de POST**: el POST se registra antes del fetch; la repetición vigente devuelve `o_reutilizado` (el mismo proceso hace su único fetch si aún no lo hizo); un POST distinto se rechaza; el POST 2 exige token rechazado comprobado (salida HTTP 4xx del POST 1, P validada con `token_invalido`, regla R-01; R02-C01) y renovación OK; nunca tras ACK 2xx, 5xx, TIMEOUT/RED, salida sin P, P rechazada o contradictoria; no hay POST 3.
- **Correlación y testigo**: se persiste solo `SHA-256(testigo)`; la columna `testigo_sha256` no se concede a `nexit_runtime` (privilegio por columnas) y ninguna función la devuelve. Ningún mensaje de error repite el testigo ni su hash. Perder el testigo = ningún POST nuevo de esa operación.
- **Cierre**: derivado de la evidencia; idempotente por operación (huella de la clasificación); un intento por cierre; nunca `estado_sifen`; CDC opaco (NEX-080) sin reglas de forma.
- **P**: esquema cerrado v1, ≤ 16384 bytes reales (`octet_length`), tipos estrictos, rangos (`n_entradas` 0..32767 desde R02-C02 —entradas expandidas de los primeros 50 elementos, conteo saturado—, alias de lote en enum) y coherencia (`token_invalido` = true con 401, false fuera de 4xx; **R02-C02:** con otro 4xx, igual a `esTokenInvalido` recalculado sobre la clave exacta `message` cuando la respuesta persistida lo permite); identidad estrictamente tipada = fila del documento y snapshot transmitido (`serie_estado` TEXTO/NULO/AUSENTE como `seriePayload`); `confianza` exacta (verificados_sql / cotejables / confiados_servidor); clasificación de la aplicación = clasificación SQL; saneada antes de persistir; cotejo de status, ecos, contador, lote, CDC y listas solo cuando el valor llegó íntegro (`campos_cotejados` nunca incluye lo perdido por saneado, truncamiento, redacción, coerción o jsonb). CDC opaco: nunca criterio de ACK.
- **Aislamiento**: toda tabla con `empresa_id` y FK anclada en `empresa_id` (T01); FK compuestas por `(empresa, documento[, version])`.
- **Inmutabilidad**: UPDATE/DELETE/TRUNCATE bloqueados; DELETE solo en reinicio DEMO autorizado (mismo mecanismo de NEX-072).
- **ACL** (`nexit_runtime`): SELECT de las tablas R05 (sin `testigo_sha256`) y de la fila de modo; EXECUTE de las 7 escrituras solo en modo ACTIVO; EXECUTE de las 3 lecturas en ambos modos; sin EXECUTE en ayudantes; **sin EXECUTE en las 3 funciones de escritura de NEX-072** (la aplicación no las usa: camino único R05). Sin escritura directa en ninguna tabla. El EXECUTE de `fe_documento_iniciar_envio` y `fe_documento_registrar_envio_r05` (camino vigente de la aplicación) no se toca.
- **Reaplicación**: ambos ayudantes son idempotentes y los descubre el envoltorio `nex_aplicar_grants_runtime()` (NEX-052), por lo que cualquier reaplicación futura conserva el estado según el modo.

## 7. Transición, coexistencia y limitaciones

- **Lote A no cambia la aplicación.** Tras aplicar NEX-084, `envio.ts` sigue igual (NEX-062 + NEX-080). Las funciones R05 existen sin llamador hasta el Lote B.
- **Operaciones NEX-072 previas** (si las hubiera) no se adoptan como R05; no hay backfill.
- **Marca local `nexit.e03_r05`**: la activan las funciones R05 con `set_config(…, true)` y dura hasta el fin de la transacción. Defensa en profundidad; la garantía principal es que `nexit_runtime` no ejecuta las funciones de NEX-072 ni escribe tablas.
- **Paridad del lote (C02-009, bloqueo B-01)**: `fe_e03_r05_lote_valido` reproduce `FORMATO_LOTE` y `\s` de JavaScript con listas explícitas de puntos de código; NEX-080 usa `[[:cntrl:]]`/`[[:space:]]` del locale. Para un lote con, p. ej., U+0085 o U+00A0 interno/final las dos reglas pueden diferir: el cierre lo registra en `lote_paridad = false` y el intento queda **sin lote** (NEX-080 lo descarta). No se corrige NEX-080 en esta orden.
- **Inicio repetido indeterminado (C02 §3.2)**: con una correlación nueva, NEX-062 devuelve `INDETERMINADO` (vencido > 2 min) **o** lanza `NEX:ENVIO_INDETERMINADO` (ya indeterminado). Ambos significan «sin raíz y sin derecho de POST»; no son idénticos y el contrato no lo afirma. Con una correlación ya registrada se devuelve la operación existente sin volver a llamar a NEX-062.
- **Cotejo parcial (R02-C01 F001 ampliado)**: se cotejan status, ecos (réplica de `claseEco`), contador de rechazados, lote (texto íntegro no astral o entero seguro), CDC transportable y listas propias, cada uno solo si el valor llegó íntegro; claves no ASCII, valores con «[omitido]» o «…», terceros omitidos (`OtrosDocumentosOmitidos`), varias claves de lista o más de una raíz `response` → ese hecho NO se coteja y no figura en `campos_cotejados`. Orden de alias y coerción de JavaScript que jsonb pierde quedan en `confianza.confiados_servidor`. Respuesta truncada, redactada o ausente → `NO_COTEJABLE_*`.
- **Ventana de reversión (R02-C01 F005)**: umbral de actividad SQL 10 min (bajo el bloqueo, un corte) ≠ ventana de drenaje 15 min del operador; confirmaciones obligatorias `backup_verificado`, `instrumentacion_desactivada`, `drenaje_confirmado`, `huerfanas`. Ninguno prueba la ausencia de un proceso vivo; las órfanas se reconocen explícitamente y quedan abiertas.
- **Catálogo de la VM no verificado**: el preflight debe ejecutarse allí antes de aplicar.

## 8. Mapeo de los 191 casos previos

Estado: **P** preservado sin cambios (el lote indicado lo ejecutará cuando corresponda) · **C** corregido por referencia · **S** sustituido. Ninguno ejecutado.

### 8.1 R01 (E03-01…E03-48)

| Casos | Estado | Nota |
|---|---|---|
| E03-01, 02, 04, 07, 08, 09, 14, 15, 18, 19, 20, 21, 23, 26, 28, 31, 33 | P | Cubiertos en SQL por R02-010…R02-045 (Lote A); flujo completo en B |
| E03-03, 06, 10, 13, 22, 27, 30, 32, 42, 43, 44, 48 | P | Lote B (aplicación) |
| E03-34…41, 45, 46 | P | Lote C (lectura/UI) |
| E03-05 | C | Login fallido: sin POST, autenticación 1 registrada con error → cierre `AUT-1`. **No** se registra NO_TRANSMITIDO (la función lo rechaza: R02-031) |
| E03-11 | C | Repetición del cierre con la misma clasificación esperada → `o_reutilizado` (R02-047) |
| E03-12 | C | No existe «respaldo»: todo cierre se deriva de la evidencia (R02-040…046) |
| E03-16 | P | Proyección CDC de NEX-080 sin cambios |
| E03-17 | S | Ya no hay `p_cdc_informado`: el CDC sale de P (R02-043) |
| E03-24 | C | Respuesta > 30 000 caracteres: truncada por la aplicación; P conserva la clasificación; `NO_COTEJABLE_TRUNCADA` (R02-022) |
| E03-25 | S | D8-B: > 1 MiB se transmite con evidencia íntegra (R02-001…004) |
| E03-29 | C | Regla `AUT-2` (R02-045) |
| E03-35 | P | `42501` sin CREAR (R02-060) |
| E03-47 | P | Sin EXECUTE de `fe_e03_cerrar_envio` (R02-063) |

### 8.2 C01 (C01-001…C01-098)

| Casos | Estado | Nota |
|---|---|---|
| C01-001…027 | P | Clasificación R-01…R-07: la de la aplicación (B) y la réplica SQL (`fe_e03_clasificar_recepcion_r05`, A) deben coincidir; R02-020 |
| C01-028 | C | → C02-004 / R02-043 |
| C01-029 | C | → R02-041 (NCE con R-04d; esperada RECHAZO → `CIERRE_CONTRADICTORIO`) |
| C01-030 | S | → C02-001/002 |
| C01-031, 033 | P | R02-022 |
| C01-032, 034 | C | `NO_COTEJABLE_TRUNCADA` / `PROYECCION_INCOHERENTE` (R02-022, R02-023) |
| C01-035, 038 | P | Redacción (R02-026) |
| C01-036 | C | `cdc = {presente: true, valor: null, motivo: CREDENCIAL}` aplicado por el banco (R02-027) |
| C01-037 | C | Lote con forma de credencial → `EVIDENCIA_CON_CREDENCIALES`; la aplicación registra la salida sin P (`CREDENCIALES_RESIDUALES`) → `EI-SIN-P` (R02-028) |
| C01-039 | P | Bytes UTF-8 calculados por el banco (R02-006) |
| C01-040, 041 | C | → C02-027/028; motivo NO_TRANSMITIDO `CUERPO_NO_COINCIDE` (antes `SOLICITUD_NO_REPRESENTABLE`) |
| C01-042 | P | Lote C |
| C01-043 | C | D8-B decidida; la medición sigue sin ejecutarse (preflight §4 informa el máximo existente) |
| C01-044 | P | > 64 KiB → la función exige truncado (R02-024) |
| C01-045, 046 | P | |
| C01-047, 048 | P | Repetición antes del control de vigencia (R02-047, R02-048) |
| C01-049 | C | Sin `p_mensaje`: otra clasificación esperada → `CIERRE_DISTINTO` (R02-049) |
| C01-050 | S | → C02-012/013 |
| C01-051…055 | P | R02-050…052, R02-070 |
| C01-056 | P | Lote C |
| C01-057 | C | Como E03-05 |
| C01-058 | C | `AUT-2`; HTTP = el de la renovación (R02-045) |
| C01-059 | P | R02-014 |
| C01-060 | C | Motivo `FALLO_LOCAL` |
| C01-061 | S | → C02-012/013 |
| C01-062 | C | → C02-018 |
| C01-063 | C | Error `EVENTO_CONTRADICTORIO` (antes `SEGUNDO_POST_NO_PERMITIDO`) (R02-015) |
| C01-064 | P | R02-015 |
| C01-065 | C | La salida se registra sin P (`FALLO_LOCAL`) o no se registra → `EI-SIN-P` / `EI-SIN-SALIDA` (R02-044) |
| C01-066 | C | `nro_post` fuera de 1..2 → `EVENTO_INVALIDO` (R02-016) |
| C01-067…069 | P | Lote C |
| C01-070 | C | Misma salida → `o_reutilizado`; distinta → `SALIDA_DISTINTA` (R02-029) |
| C01-071 | P | `NT` (R02-040) |
| C01-072, 073 | P | Lote B |
| C01-074, 075 | C | → C02-016 |
| C01-076 | C | → C02-033 |
| C01-077 | S | → C02-034 |
| C01-078 | P | R02-055 |
| C01-079, 080 | C | → C02-007 |
| C01-081 | P | R02-021 |
| C01-082 | C | → C02-018/019 |
| C01-083 | P | |
| C01-084 | P | Segunda correlación → `ENVIO_EN_CURSO` de NEX-062 (R02-012) |
| C01-085…090 | P | R02-060…066 |
| C01-091 | C | El preflight no aborta: informa `ok = false` (fila 7); la migración aborta en G1 (R02-080, R02-081) |
| C01-092, 093 | C | → C02-041…045 |
| C01-094 | S | La reversión nunca hace DROP (R02-085) |
| C01-095…098 | P | Lotes B/C |

### 8.3 C02 (C02-001…C02-045)

| Casos | Estado | Nota |
|---|---|---|
| C02-001…008, 010…012, 014…019, 033…036, 041…044 | P | Concretados en R02-* (ver columna «Origen» de §9) |
| C02-009 | C | Se acepta/rechaza como JavaScript en P; la paridad con NEX-080 se **registra** (`lote_paridad`) y queda como bloqueo B-01 (R02-030) |
| C02-013 | C | La vigencia se comprueba antes de reutilizar el POST (R02-013) |
| C02-020…024, 026, 028, 029, 032, 040 | P | Lotes B/C |
| C02-025 | P | `PROYECCION_EXCEDIDA` (R02-019) |
| C02-027 | P | R02-008 |
| C02-030, 031 | S | D8-B: R02-001…004 |
| C02-037 | C | **Corregido** (auditoría C02 §4.3): operación X más reciente sin cierre + intento Y antiguo → referencia **X**, `o_ambigua = false`; con configuración Y el Lote B dará **DISTINTA** (409 sin llamada), no AMBIGUA. AMBIGUA exige una candidata **incierta** distinta de la referencia (R02-057, R02-058) |
| C02-038, 039 | P | R02-056 / Lote B |
| C02-045 | C | El inicio espera el bloqueo de coordinación y falla con `E03_R05_REVERTIDO` (si ya había pasado el EXECUTE) o por falta de EXECUTE (si llega después) (R02-084) |

Total: 191 previos (48 + 98 + 45) mapeados; 0 eliminados sin sustituto.

## 9. Casos nuevos SQL (R02-001…R02-088) — ESCRITOS, NO EJECUTADOS

Fixture común (sintético, base efímera): empresa E1 y E2; usuario U1 (CREAR en E1, sucursal S1), U2 (sin CREAR), U3 (otra sucursal); FE D1 y NCE D2 en `PENDIENTE_ENVIO` con solicitud v1; testigo T1 = 43 caracteres base64url sintéticos; correlación K1; conexión C_X = `{host: "gw-x", credencialRef: "ref-x", credencialesVersion: 1, origenCredenciales: "BASE"}`. Invariantes en todos: sin doble transmisión, CDC no decide, sin `estado_sifen` desde el envío, sin stock, sin secretos, aislamiento por empresa.

| ID | Precondición | Operación | Resultado esperado | Origen |
|---|---|---|---|---|
| R02-001 | D1 con snapshot cuyo texto HTTP mide 1 048 577 bytes (sintético) | `registrar_post_r05` nro 1 | Fila en `posts_grandes_r05`; `o_almacenamiento = POST_GRANDE_R05`; `sha256`/`bytes` = los del banco; ningún POST_INTENTADO en NEX-072 | D8-B |
| R02-002 | Texto de exactamente 1 048 576 bytes | Ídem | POST_INTENTADO en NEX-072 (límite inclusivo) | D8-B |
| R02-003 | Texto de 8 388 609 bytes (relleno de espacios, igual como jsonb) | Ídem | `SOLICITUD_EXCEDE_LIMITE_DEFENSIVO`; nada escrito; la aplicación registra NO_TRANSMITIDO `SOLICITUD_EXCEDE_LIMITE`; cierre `NT` | D8-B |
| R02-004 | FE de 999 líneas sintética (cualquier tamaño ≤ 8 MiB) | Flujo A completo | Evidencia íntegra en una de las dos tablas; sin reducción de líneas; tamaño registrado | C01-043 |
| R02-005 | POST grande registrado | `INSERT` de POST_INTENTADO nro 1 por otra vía (rol propietario, sin marca) | `OPERACION_R05_SOLO_FUNCIONES`; con marca: `EVENTO_CONTRADICTORIO` (número ya usado) | guarda |
| R02-006 | Texto con ñ, ₲ y emoji | `registrar_post_r05` | `o_solicitud_bytes` = longitud UTF-8 real; `sha256` sobre esos bytes | C01-039 |
| R02-007 | Texto con otro orden de claves y espacios, mismo valor | Ídem | Aceptado (igualdad jsonb) | D6 |
| R02-008 | Texto con un número de 20 dígitos distinto en el último dígito | Ídem | `CUERPO_NO_COINCIDE`; sin POST | C02-027 |
| R02-009 | Texto no JSON | Ídem | `CUERPO_NO_COINCIDE` | D6 |
| R02-010 | D1 nuevo, K1 nueva | `iniciar_envio_r05` | INICIO + operación; `o_reutilizado = false`; `o_vigente = true`; documento `ENVIANDO` | C02-014 |
| R02-011 | R02-010 hecho (respuesta del banco perdida) | Repetir con K1, T1, C_X | Misma operación, `o_reutilizado = true`; NEX-062 **no** se llama otra vez (sin segundo INICIO) | C02-014 |
| R02-012 | R02-010 hecho | `iniciar_envio_r05` con K2 nueva | `NEX:ENVIO_EN_CURSO` de NEX-062 | C01-084 |
| R02-013 | POST 1 registrado; la consulta manual convierte D1 a `ENVIADO` | Repetir `registrar_post_r05` nro 1 (mismo cuerpo) | `NEX:DOCUMENTO_NO_ENVIANDO`; sin reutilizar; sin fetch | C02-013 |
| R02-014 | POST 1 con salida HTTP 401 y P válida `token_invalido = true` (R-01); renovación OK | `registrar_post_r05` nro 2 | Aceptado. **R02-C01:** con HTTP 200/500 y P `token_invalido = true` la P se rechaza antes (R02-C01-001/002) y el POST 2 da `EVENTO_CONTRADICTORIO` | C01-059 |
| R02-015 | POST 1 con 500 / con TIMEOUT / sin P / ACK 2xx / salida tardía / sin salida | `registrar_post_r05` nro 2 | `EVENTO_CONTRADICTORIO` (R02-C01: también la renovación) | C01-063/064 |
| R02-016 | — | `registrar_post_r05` nro 3 | `EVENTO_INVALIDO` | C01-066 |
| R02-017 | Sin autenticación 1 OK | `registrar_post_r05` nro 1 | `EVENTO_CONTRADICTORIO` | contrato |
| R02-018 | P con clave extra / `version = 2` / `status = "success"` (minúsculas) / `http` distinto del registrado | `registrar_salida_r05` | `PROYECCION_INVALIDA`; nada escrito | C02-008 |
| R02-019 | P válida de 16 385 bytes (relleno en `lectura`) | Ídem | `PROYECCION_EXCEDIDA` | C02-025 |
| R02-020 | P coherente pero `clasificacion_app` = R-06f cuando los hechos dan R-06a | Ídem | `CLASIFICACION_NO_COINCIDE` | C01-020 |
| R02-021 | P con `identidad.numero` de otro documento | Ídem | `PROYECCION_INVALIDA` | C01-081 |
| R02-022 | Respuesta truncada (`{truncado: true}`) con P R-06f | Ídem + cierre | `cotejo = NO_COTEJABLE_TRUNCADA`; cierre `R-06f` OK | C01-031/033 |
| R02-023 | Respuesta no truncada con `nro_lote = "A"`; P dice lote `"B"` | `registrar_salida_r05` | `PROYECCION_INCOHERENTE` | C01-034 |
| R02-024 | Respuesta saneada ≥ 64 KiB sin truncar | Ídem | `EVENTO_INVALIDO` (enviar truncada) | C01-044 |
| R02-025 | P con `cuerpo.json_valido = false` y respuesta persistida | Ídem | `PROYECCION_INCOHERENTE` | cotejo |
| R02-026 | Respuesta con la clave del gateway en `message` | Ídem | Redactada; `mensaje = 'respuesta con credenciales redactadas'`; `cotejo = NO_COTEJABLE_REDACTADA` | C02-011 |
| R02-027 | P con `cdc.valor` igual a una credencial | Ídem | Persistida con `cdc = {presente: true, valor: null, motivo: CREDENCIAL}`; la regla no cambia | C01-036 |
| R02-028 | P con `lote.texto = "Bearer abcdefgh"` | Ídem | `EVIDENCIA_CON_CREDENCIALES`; reintento sin P motivo `CREDENCIALES_RESIDUALES` aceptado; cierre `EI-SIN-P` | C01-037 |
| R02-029 | Salida registrada | Repetir idéntica / con otro HTTP | `o_reutilizado` / `SALIDA_DISTINTA` | C01-070 |
| R02-030 | P `lote.clase = VALIDO` con texto que termina en U+0085 / U+00A0 / U+FEFF | `registrar_salida_r05` + cierre | U+0085: aceptado (JS); U+00A0/U+FEFF finales: `PROYECCION_INVALIDA`. Si aceptado y NEX-080 lo descarta: `lote_paridad = false`, intento sin lote. **Bloqueo B-01** | C02-009 |
| R02-031 | Autenticación 1 con ERROR_HTTP 401 | `registrar_no_transmitido_r05` | `EVENTO_CONTRADICTORIO` | E03-05 |
| R02-032 | POST 1 registrado | `registrar_no_transmitido_r05` | `EVENTO_CONTRADICTORIO` | contrato |
| R02-033 | NO_TRANSMITIDO registrado | `registrar_autenticacion_r05` / `registrar_post_r05` | `OPERACION_NO_TRANSMITIDA` | contrato |
| R02-034 | NO_TRANSMITIDO registrado | `registrar_post_r05` directo con texto > 1 MiB | Rechazado por la función y por la guarda de POST grande | guarda |
| R02-035 | Autenticación INICIAL con `origen = CACHE`, `http = 200` / **R02-C01:** `origen = HTTP`, `OK`, `http = 201` | `registrar_autenticacion_r05` | `EVENTO_INVALIDO` (CACHE exige HTTP nulo; OK por HTTP exige 200 exacto) | forma |
| R02-036 | RENOVACION_TOKEN sin POST 1 con token inválido | Ídem | `EVENTO_CONTRADICTORIO` | contrato |
| R02-037 | Testigo de 42 caracteres / con `+` | Cualquier escritura | `TESTIGO_INVALIDO` | C02-017 |
| R02-038 | Testigo bien formado distinto de T1 | Cualquier escritura de la operación | `TESTIGO_NO_COINCIDE`; el mensaje no contiene testigo ni hash | C02-017 |
| R02-039 | K1 usada con D1 | `iniciar_envio_r05` con K1 y D2 / con otro testigo / otra conexión | `CORRELACION_DISTINTA` | C02-015 |
| R02-040 | NO_TRANSMITIDO `SIN_CREDENCIALES` | `cerrar_envio_r05` esperada `{NT, RED, ENVIO_INDETERMINADO, null}` | Intento RED/TRANSMISION/indeterminado con el mensaje vigente; `motivo = NO_TRANSMITIDO` | C01-071 |
| R02-041 | NCE D2; P con hechos de R-04f FE | Cierre esperado R-04f | `CIERRE_CONTRADICTORIO` (la regla SQL para NCE es R-04d) | C01-029 |
| R02-042 | P R-06f con lote `L-1`, CDC ausente | Cierre `{R-06f, OK, ENVIADO, null}` | Intento OK, lote `L-1`, `cdc_informado` NULL, `respuesta` = `respuesta_saneada`, conexión = C_X; `lote_paridad = true`; `estado_sifen` sin cambio | C02-001 |
| R02-043 | Igual con `cdc.valor = "X 1"` (opaco) | Cierre | `cdc_informado = "X 1"`; misma regla | C02-004 |
| R02-044 | POST 1 sin salida | Cierre `{EI-SIN-SALIDA, RESPUESTA_INVALIDA, ENVIO_INDETERMINADO, null}` | Indeterminado, `motivo = EVIDENCIA_INSUFICIENTE`, respuesta NULL, sin lote | C02-005 |
| R02-045 | POST 1 con P token inválido; renovación TIMEOUT | Cierre `{AUT-2, TIMEOUT, ERROR_ENVIO, AUTENTICACION}` | Intento fase AUTENTICACION, HTTP nulo, mensaje vigente de login | C01-058 |
| R02-046 | Autenticación 1 ERROR_HTTP 401, sin POST | Cierre `{AUT-1, ERROR_HTTP, ERROR_ENVIO, AUTENTICACION}` | `http_status = 401` | C02-006 |
| R02-047 | Cierre hecho; después consulta APROBADO | Repetir el cierre con la misma clasificación | `o_reutilizado`, mismo intento | C01-047 |
| R02-048 | Cierre hecho; nueva operación vigente | Repetir el cierre antiguo | `o_reutilizado` (se comprueba antes de la vigencia) | C01-048 |
| R02-049 | Cierre hecho | Repetir con otra clasificación | `CIERRE_DISTINTO`; nada escrito | C01-049 |
| R02-050 | Operación obsoleta (hay un INICIO posterior) | Cierre | `OPERACION_NO_VIGENTE` | C01-052 |
| R02-051 | Dos cierres concurrentes | ×2 | Uno inserta; el otro espera el bloqueo del documento y devuelve `o_reutilizado` | C01-051 |
| R02-052 | Sin POST, autenticación OK, sin NO_TRANSMITIDO | Cierre | `CIERRE_SIN_EVIDENCIA` | contrato |
| R02-053 | Operación cerrada indeterminada; llega HTTP del POST 1 | `registrar_salida_tardia_r05` (13 parámetros) | Fila tardía `OPERACION_CERRADA`, FK al POST, `estado_proyeccion` según P; cierre, intento y estado del documento sin cambio | C02-033 |
| R02-054 | Operación vigente | `registrar_salida_tardia_r05` | `SALIDA_ADMISIBLE` | contrato |
| R02-055 | Tardía con P inválida | Ídem | **R02-C01:** fila `PROYECCION_DESCARTADA` con `motivo_descarte` seguro (p. ej. `PROYECCION_INVALIDA`), `proyeccion` NULL; repetición idéntica → `o_reutilizado`; con otra P o sin P → `SALIDA_TARDIA_DISTINTA` | C02-035 |
| R02-056 | D1 sin operaciones R05; intento ENVIO con C_X | `fe_e03_conexion_referencia_r05` | Referencia = intento, `o_ambigua = false` | C02-039 |
| R02-057 | Intento Y (C_Y) antiguo + operación X (C_X) con POST sin cierre, más reciente | Ídem | Referencia = operación X (C_X), `o_ambigua = false` (Lote B: configuración C_Y → DISTINTA, 409) | C02-037 corregido |
| R02-058 | Intento Y (C_Y) **más reciente** + operación X (C_X) con POST sin cierre | Ídem | Referencia = intento Y, `o_ambigua = true` (X es incierta y distinta) | C02-037 corregido |
| R02-059 | Dos candidatas con el mismo instante | Ídem | Desempate por id descendente (orden total) | auditoría §4.3 |
| R02-060 | U2 sin CREAR | Cualquier escritura R05 | `42501` | E03-35 |
| R02-061 | U3 fuera de alcance / documento de E2 | Ídem y lecturas | `DOCUMENTO_NO_ENCONTRADO` | E03-33 |
| R02-062 | `nexit_runtime` | `INSERT/UPDATE/DELETE` directo en tablas R05 y en la evidencia NEX-072 | Denegado | C01-088 |
| R02-063 | `nexit_runtime` | `fe_e03_iniciar_envio` / `registrar_evento` / `cerrar_envio` (NEX-072) | Sin EXECUTE (también tras `nex_aplicar_grants_runtime()`) | E03-47 |
| R02-064 | `nexit_runtime` | `SELECT testigo_sha256 FROM …operaciones_r05` | Denegado; `SELECT correlacion_id` permitido | auditoría |
| R02-065 | Catálogo | T01 (FK en `empresa_id`, sin `actualizado_at`, sin nombres en inglés) | OK | C01-089 |
| R02-066 | Catálogo | Funciones R05 `SECURITY DEFINER` con `search_path` y sin `EXECUTE` dinámico | OK (verificar fila 30) | C01-090 |
| R02-067 | Fila de operación | `UPDATE` / `DELETE` / `TRUNCATE` | Rechazados por la guarda inmutable | C01-055 |
| R02-068 | Reinicio DEMO autorizado activo para E1 | Borrado en cascada de documentos de E1 | Filas R05 de E1 eliminadas; E2 intacta | DEMO |
| R02-069 | Reinicio DEMO no activo | `DELETE` de documento con evidencia | Rechazado por la guarda | DEMO |
| R02-070 | Cierre ligado a un intento | Segundo cierre con el mismo intento | Lo impide `envio_cierres_r05_intento_uk` | C01-054 |
| R02-071 | `nex_e03_r05_estado` | `DELETE` / `TRUNCATE` | `E03_R05_ESTADO_FIJO` | coordinación |
| R02-072 | Rol propietario, sin marca | `INSERT` de HTTP_RESPUESTA para una operación R05 | `OPERACION_R05_SOLO_FUNCIONES` | guarda |
| R02-073 | Operación NEX-072 (no R05) del rol propietario | Eventos NEX-072 | Comportamiento de NEX-072 sin cambios | coexistencia |
| R02-074 | Aplicación vigente sin cambios tras NEX-084 | Envío directo (NEX-062 + NEX-080) | Funciona igual que hoy | C01-085 |
| R02-075 | `lectura` con 4 errores propios / texto de 201 caracteres | `registrar_salida_r05` | `PROYECCION_INVALIDA` | esquema |
| R02-076 | `cuerpo.raiz_objeto = false` con `status = SUCCESS` | Ídem | `PROYECCION_INVALIDA` | esquema |
| R02-077 | `aceptados.incluye_propio = true` y `con_formato_fiscal = false` | Ídem | `PROYECCION_INVALIDA` | esquema |
| R02-078 | `cdc = {presente: true, valor: "1", motivo: "NO_TEXTO"}` | Ídem | `PROYECCION_INVALIDA` (valor y motivo excluyentes) | esquema |
| R02-079 | `http` como texto `"200"` | Ídem | `PROYECCION_INVALIDA` (sin error de conversión crudo) | esquema |
| R02-080 | Preflight sobre una base con NEX-084 registrada | Preflight | Fila 7 `ok = false`; nada escrito | C01-091 |
| R02-081 | Migración con NEX-083 ausente o con otro checksum / sin `psql -1` | Runner | Aborta en G1 / G0 sin cambios | gate |
| R02-082 | Reversión (con las 4 confirmaciones, R02-C01) con operación abierta y evento hace 3 min | Reversión | Aborta («proceso vivo»); modo ACTIVO | C02-042 |
| R02-083 | Dos órfanas antiguas; `-v huerfanas=1` | Reversión | Aborta; con `huerfanas=2` → REVERTIDO; órfanas conservadas | C02-043 |
| R02-084 | Escritura R05 en curso con FOR SHARE; reversión concurrente | Ambas | La reversión espera; la escritura termina; una escritura posterior que ya pasó el EXECUTE falla con `E03_R05_REVERTIDO`; una nueva llamada falla por falta de EXECUTE | C02-045 |
| R02-085 | Reversión con evidencia | Reversión ×2 | Tablas, filas y funciones conservadas; SELECT y lecturas disponibles; la segunda ejecución solo reaplica el ayudante | C02-044 |
| R02-086 | Modo REVERTIDO | `SELECT nex_aplicar_grants_runtime()` | Escrituras R05 y NEX-072 sin EXECUTE; lecturas R05 con EXECUTE | C02-041 |
| R02-087 | Modo REVERTIDO | `verificar-NEX-084.sql` | Filas 70/71 coherentes con el modo | verificación |
| R02-088 | Base sin rol `nexit_runtime` | Migración | Ayudantes retornan sin conceder; resto instalado. **R02-C01:** preflight/verificar con `-v entorno=CI` → ok; sin `entorno` (VM) → control 17 / 5 en `false` | grants |

## 10. Bloqueos para el Lote B (requieren decisión u orden separada)

| ID | Bloqueo |
|---|---|
| B-01 | Paridad Unicode del lote JS ↔ NEX-080 (y longitud: JavaScript cuenta unidades UTF-16; un lote con caracteres astrales no se coteja en SQL, R02-C01) (`[[:cntrl:]]`/`[[:space:]]` del locale). NEX-084 la mide (`lote_paridad`) y no la corrige. Decidir si se ajusta NEX-080 (orden separada) o se acepta que esos lotes no se persistan. |
| B-02 | D6-c: comportamiento ante snapshots históricos no representables por `JSON.stringify` (la igualdad jsonb los rechaza → NO_TRANSMITIDO). Requiere el conteo del preflight §4 y decisión. |
| B-03 | D-C02-4: KuDE con la conexión de referencia R05. |
| B-04 | Integración de la aplicación: generar correlación y testigo antes del inicio; proyección P en `gateway.ts`; uso de `o_reutilizado` con la regla local «un solo fetch»; registro de la salida sin P ante cualquier fallo; uso de la salida tardía. |
| B-05 | **Gate B (R02-C01 F004):** el límite de 8 MiB es PROVISIONAL. Compatibilidad con facturas válidas de 999 ítems no demostrada; tamaño canónico jsonb ≠ serialización JavaScript; precisión D6-c pendiente. Medición real y decisión antes de integrar. |
| B-06 | R02-C01: ecos, listas, lote y CDC ya se cotejan cuando llegan íntegros; quedan confiados al servidor el orden de alias, la coerción de JavaScript y el token inválido dentro de 4xx distinto de 401 (`confianza.confiados_servidor`). |
| B-07 | Reactivación del modo ACTIVO tras una reversión (fuera de este lote). |
| B-08 | Restitución opcional del EXECUTE de las funciones de NEX-072 (hoy retirado por diseño de camino único). |

---

## 11. R02-C01 — matriz de hallazgos (referencias exactas)

Referencias por archivo y línea del estado del commit R02-C01 (`NEX-084` = `documentacao/banco/nexit/v1/migraciones/NEX-084-facturacion-e03-envio-r05.sql`); las líneas vigentes tras R02-C02 están en §15.

| Hallazgo | Corrección | Referencias |
|---|---|---|
| **F001** paridad de P / ACK / POST 2 (ALTA) | `token_invalido` coherente con el HTTP (401 → true; fuera de 4xx → false; resto de 4xx confiado al servidor — **R02-C02 R-C01-01: ahora cotejado sobre `message`, confiado solo si no es cotejable; ver §15**); P contradictoria rechazada ANTES de persistir; renovación y POST 2 solo por `fe_e03_r05_token_rechazado_post1` (salida HTTP 4xx del POST 1 + P validada + regla R-01), misma función en las reglas AUT-2 / EI-TOKEN-SIN-POST2 del cierre; autenticación OK por HTTP = 200 exacto (CACHE igual); esquema cerrado con identidad estrictamente tipada contra el snapshot transmitido (`serie_estado` TEXTO/NULO/AUSENTE), alias de lote en enum, `n_entradas` 0..50 (**R02-C02 R-C01-02: 0..32767 sobre entradas expandidas; ver §15**), `confianza` exacta; cotejo ampliado (status ausente/no texto, ecos con `clase_eco`, contador, lote entero seguro o texto, CDC transportable, listas propias) sin declarar cotejado lo que el saneado, truncamiento, redacción, coerción o jsonb perdieron. P ≤ 16384 bytes; CDC opaco y nunca criterio de ACK; `gateway.ts` y NEX-080 sin cambios | NEX-084 :211 (CHECK 200), :476–569 (`alterado`, `astral`, `trim_js`, `clase_eco`), :570 (validador), :889 (cotejo), :1130 (procesamiento común), :1234 (`token_rechazado_post1`), :1384 (renovación), :1452 (POST 2), :1748–1750 (cierre) |
| **F002** idempotencia de salidas (ALTA) | Salida normal: reutiliza solo con equivalencia semántica completa (versión, tipo, HTTP, clase, SHA-256 y bytes de la respuesta, truncamiento, P canónica, motivo, regla, resultado, estado, tipo de error, cotejo y campos); P que ya no valida → `SALIDA_DISTINTA`. Tardía: estados A `SIN_PROYECCION` / B `PROYECCION_DESCARTADA` (motivo seguro de lista cerrada, sin valores) / C `PROYECCION_VALIDADA` / D `PROYECCION_COTEJADA_PARCIAL`, huella semántica que los incluye; exclusión normal/tardía; una tardía nunca cambia cierre ni estado; D-C02-2-A preservada | NEX-084 :306 (columnas y CHECK de la tardía), :1484 (salida normal), :1823 (salida tardía) |
| **F003** recuperación / verificación (MEDIA) | Cierre con columnas `salida_ultimo_post`, `http_post`, `http_autenticacion` y retorno histórico completo + estado actual (también al repetir); lectura `fe_e03_estado_operacion_r05` con ACL antes de leer y sin testigo/hash/payload/respuesta (**R02-C02 R-C01-03: ampliada para operaciones abiertas; ver §15**); `verificar-NEX-084.sql` §3: 13 controles de integridad de datos (100–112) solo lectura | NEX-084 :265, :1660, :1967; verificar :152–233 |
| **F004** límite 8 MiB (gate B) | Límite PROVISIONAL; retirada la justificación `pg_column_size`; bloqueos del Lote B explícitos; sin mediciones ni ampliación; D8-B intacta | NEX-084 :10–15; preflight :114–116; este documento §4 y §10 B-05 |
| **F005** coherencia preflight / verificación / reversión | Definición ÚNICA de operación abierta y última actividad (`fe_e03_r05_ultima_actividad`, `fe_e03_r05_abiertas`: raíz, eventos NEX-072, POST grandes, autenticaciones, proyecciones, tardías); un corte por ejecución; umbral 10 min ≠ drenaje 15 min; reversión: corte tomado con el bloqueo, informe = valores calculados bajo el bloqueo, confirmaciones `backup_verificado` / `instrumentacion_desactivada` / `drenaje_confirmado` / `huerfanas`; modo VM (estricto, rol obligatorio) vs CI (`-v entorno=CI`); bloqueos, ACTIVO tras el bloqueo, no destructiva, idempotente, sin re-GRANT NEX-072, sin borrar `schema_migrations` | NEX-084 :1257, :1268; preflight :66–67, :81–99; verificar :4–5, :33–34, :136–140; reversión completa |

## 12. Firmas, objetos y checksum

- **Checksum final de NEX-084 (SHA-256 del archivo, R02-C02):** `38d45ea661ed5d8f1dc3d43dc6b0f727f8872c6bdd0fbab5745cc7802f5b6854`. Sincronizado en `verificar-NEX-084.sql` (control 1) y `reversion-NEX-084.sql` (P1). Los valores anteriores `12439af6…` (R02-C01) y `ec59bd92…` (R02) quedan sustituidos; NEX-084 no está aplicada en ninguna base persistente.
- **Escrituras (7):** `fe_e03_iniciar_envio_r05(uuid,uuid,uuid,boolean,uuid,text,jsonb)` · `fe_e03_registrar_autenticacion_r05(uuid,uuid,uuid,uuid,text,text,text,text,integer)` · `fe_e03_registrar_post_r05(uuid,uuid,uuid,uuid,text,smallint,text)` · `fe_e03_registrar_salida_r05(uuid,uuid,uuid,uuid,text,smallint,text,integer,jsonb,boolean,text,jsonb,text)` · `fe_e03_registrar_no_transmitido_r05(uuid,uuid,uuid,uuid,text,text)` · `fe_e03_cerrar_envio_r05(uuid,uuid,uuid,uuid,text,jsonb)` (retorno ampliado) · `fe_e03_registrar_salida_tardia_r05(uuid,uuid,uuid,uuid,text,smallint,text,integer,jsonb,boolean,text,jsonb,text)` (**cambia**: +`motivo_sin_proyeccion`).
- **Lecturas (3):** `fe_e03_operacion_por_correlacion_r05(uuid,uuid,uuid,uuid)` · `fe_e03_conexion_referencia_r05(uuid,uuid,uuid)` · `fe_e03_estado_operacion_r05(uuid,uuid,uuid,uuid)` (**nueva**; R02-C02 amplía su retorno, misma firma de entrada).
- **Ayudantes internos sin EXECUTE para PUBLIC ni `nexit_runtime`:** `fe_e03_r05_validar_proyeccion(jsonb,integer,text,text,text,text,jsonb)` (**cambia**: snapshot en lugar de serie), `fe_e03_r05_cotejar(jsonb,jsonb,boolean,boolean)`, **nuevos** `fe_e03_r05_procesar_proyeccion(jsonb,integer,text,text,text,text,jsonb,jsonb,boolean,boolean)`, `fe_e03_r05_clase_eco(text,jsonb,jsonb,text)`, `fe_e03_r05_alterado(jsonb)`, `fe_e03_r05_astral(text)`, `fe_e03_r05_trim_js(text)`, `fe_e03_r05_token_rechazado_post1(uuid,uuid,uuid)`, `fe_e03_r05_ultima_actividad(uuid,uuid,uuid)`, `fe_e03_r05_abiertas(timestamptz)`; **R02-C02 nuevos:** `fe_e03_r05_token_mensaje(jsonb)` y `fe_e03_r05_derivar_cierre(uuid,uuid,uuid)` (REVOKE de PUBLIC en el ayudante de privilegios; añadidos a `internas` del control 33); los demás de R02 sin cambio de firma.
- **Columnas nuevas:** cierres `salida_ultimo_post`, `http_post`, `http_autenticacion`; tardías `estado_proyeccion`, `motivo_sin_proyeccion`, `motivo_descarte`, `regla`, `resultado`, `estado_local`, `error_tipo`, `cotejo`, `campos_cotejados`. Sin tablas nuevas; T01 (FK en `empresa_id`, sin `actualizado_at`, sin inglés) y disparadores sin cambios.
- **Compatibilidad con la aplicación:** ningún archivo de `app/` ni `lib/` llama funciones `fe_e03_*_r05` (las R05 siguen sin llamador hasta el Lote B); `envio.ts` sigue con NEX-062 + NEX-080. NEX-001…083, `gateway.ts`, FE/NCE, CDC, stock, KuDE y consulta intactos.

## 13. Casos nuevos R02-C01 (R02-C01-001…060) — ESCRITOS, NO EJECUTADOS

Mismo fixture de §9. Total de identificadores: 191 previos + 88 R02 (mapeo preservado; 7 con expectativa corregida en su fila: R02-014, 015, 035, 053, 055, 082, 088) + 60 R02-C01 = **339** (R02-C02 conserva los 339 y corrige por referencia R02-C01-004, 016 y 049; suma 52 en §16 → **391**).

| ID | Hallazgo | Precondición | Operación | Resultado esperado |
|---|---|---|---|---|
| R02-C01-001 | F001 | POST 1; respuesta HTTP 200; P `token_invalido = true` | `registrar_salida_r05` | `PROYECCION_INVALIDA`; nada escrito |
| R02-C01-002 | F001 | HTTP 500; P `token_invalido = true` | Ídem | `PROYECCION_INVALIDA` |
| R02-C01-003 | F001 | HTTP 401; P `token_invalido = false` | Ídem | `PROYECCION_INVALIDA` |
| R02-C01-004 | F001 | **R02-C02:** HTTP 403 con respuesta íntegra `{"status":"error","message":"Token inválido"}`; P `token_invalido = true`, R-01 | Ídem | Aceptado; `token_invalido` en `campos_cotejados`; `confianza.cotejables` contiene `token_invalido_4xx`. (La expectativa anterior —403 aceptado por confianza sin mensaje— queda sustituida: un 403 sin indicación de token determinable da `PROYECCION_INCOHERENTE`, R02-C02-004…007.) |
| R02-C01-005 | F001 | HTTP 401 con P R-01 registrada; renovación OK | `registrar_post_r05` nro 2 | Aceptado |
| R02-C01-006 | F001 | POST 1 con ACK 2xx (R-06f) | `registrar_autenticacion_r05` RENOVACION / POST 2 | `EVENTO_CONTRADICTORIO` ambos |
| R02-C01-007 | F001 | POST 1 con salida HTTP 401 sin P (motivo `PROYECCION_RECHAZADA`) | Renovación / POST 2 | `EVENTO_CONTRADICTORIO`; cierre `EI-SIN-P` |
| R02-C01-008 | F001 | POST 1 con TIMEOUT / RED / sin salida | Renovación / POST 2 | `EVENTO_CONTRADICTORIO` |
| R02-C01-009 | F001 | POST 1 cuya salida solo existe como tardía | POST 2 | `EVENTO_CONTRADICTORIO` (la tardía nunca habilita) |
| R02-C01-010 | F001 | Autenticación `HTTP`, `OK`, 204 | `registrar_autenticacion_r05` | `EVENTO_INVALIDO` (CHECK 200 exacto) |
| R02-C01-011 | F001 | Autenticación `CACHE`, `OK`, HTTP nulo, INICIAL | Ídem | Aceptado (sin cambio) |
| R02-C01-012 | F001 | P con `identidad.serie_estado = TEXTO` y snapshot sin `dSerieNum` | `registrar_salida_r05` | `PROYECCION_INVALIDA` |
| R02-C01-013 | F001 | Snapshot con `dNumDoc` distinto de la fila (manipulado en fixture) | Ídem con P | `IDENTIDAD_SNAPSHOT_DISTINTA` |
| R02-C01-014 | F001 | P con `identidad.numero` número en lugar de texto | Ídem | `PROYECCION_INVALIDA` |
| R02-C01-015 | F001 | P con `lote.clave = "nroLoteX"` (fuera del enum) | Ídem | `PROYECCION_INVALIDA` |
| R02-C01-016 | F001 | **R02-C02:** P con `aceptados.n_entradas = 32768` (fuera de 0..32767) | Ídem | `PROYECCION_INVALIDA`. (51 entradas expandidas de ≤ 50 elementos es válido desde R02-C02: R02-C02-021.) |
| R02-C01-017 | F001 | P con `confianza` sin `confiados_servidor` / con clave extra | Ídem | `PROYECCION_INVALIDA` |
| R02-C01-018 | F001 | Respuesta sin `status`; P `status.presente = true` | Ídem | `PROYECCION_INCOHERENTE` |
| R02-C01-019 | F001 | Respuesta `status: 1`; P `status.clase = OTRO_TIPO` | Ídem | Aceptado; `status` en `campos_cotejados` |
| R02-C01-020 | F001 | Respuesta `status` con «[omitido]» | Ídem | Aceptado; `status` NO en `campos_cotejados` |
| R02-C01-021 | F001 | Respuesta con eco `dNumDoc` distinto; P dice `COINCIDE` | Ídem | `PROYECCION_INCOHERENTE` |
| R02-C01-022 | F001 | Eco con valor terminado en «…» (truncado por saneado) | Ídem | Aceptado; ese eco no se coteja |
| R02-C01-023 | F001 | Clave de raíz no ASCII | Ídem | Ecos, lote, CDC y listas fuera de `campos_cotejados` |
| R02-C01-024 | F001 | `nro_lote: 123` (entero seguro); P `lote.texto = "123"`, `VALIDO` | Ídem | Aceptado; `lote` cotejado |
| R02-C01-025 | F001 | `nro_lote: 1e300`; P `INVALIDO_TIPO` | Ídem | Aceptado; P con `VALIDO` → `PROYECCION_INCOHERENTE` |
| R02-C01-026 | F001 | Lote con carácter astral | Ídem | `lote` no cotejado (B-01) |
| R02-C01-027 | F001 | Dos alias de lote en la raíz | Ídem | Solo `n_ocurrencias` cotejado; orden de alias confiado |
| R02-C01-028 | F001 | CDC presente con «[omitido]» / motivo `CREDENCIAL` | Ídem | `cdc` solo por presencia; regla sin cambio; CDC no decide |
| R02-C01-029 | F001 | `response.OtrosDocumentosOmitidos` presente | Ídem | listas fuera de `campos_cotejados`; `terceros_omitidos` confiado |
| R02-C01-030 | F001 | Lista con entrada propia; P `incluye_propio = false` | Ídem | `PROYECCION_INCOHERENTE` |
| R02-C01-031 | F001 | P de 16 384 bytes exactos / 16 385 | Ídem | Aceptado / `PROYECCION_EXCEDIDA` |
| R02-C01-032 | F002 | Salida con P registrada | Repetir idéntica | `o_reutilizado = true` |
| R02-C01-033 | F002 | Ídem | Repetir con misma respuesta y otra P válida | `SALIDA_DISTINTA`; nada reescrito |
| R02-C01-034 | F002 | Ídem | Repetir sin P (motivo) | `SALIDA_DISTINTA` |
| R02-C01-035 | F002 | Salida sin P motivo A | Repetir con motivo B | `SALIDA_DISTINTA` |
| R02-C01-036 | F002 | Salida con P | Repetir con una P que ahora no valida | `SALIDA_DISTINTA` (no error crudo) |
| R02-C01-037 | F002 | Salida registrada y transacción confirmada; ACK de escritura perdido | Repetir exactamente | `o_reutilizado`; misma proyección |
| R02-C01-038 | F002 | Operación cerrada; tardía sin P con motivo | `registrar_salida_tardia_r05` | `SIN_PROYECCION`, `motivo_sin_proyeccion` |
| R02-C01-039 | F002 | Tardía con P de identidad ajena | Ídem | `PROYECCION_DESCARTADA`, `motivo_descarte = PROYECCION_INVALIDA` (o `IDENTIDAD_SNAPSHOT_DISTINTA`); sin valores de P |
| R02-C01-040 | F002 | Tardía con P válida, respuesta truncada | Ídem | `PROYECCION_VALIDADA`, cotejo `NO_COTEJABLE_TRUNCADA` |
| R02-C01-041 | F002 | Tardía con P válida y respuesta íntegra | Ídem | `PROYECCION_COTEJADA_PARCIAL` |
| R02-C01-042 | F002 | Tardía B registrada | Repetir con la P válida | `SALIDA_TARDIA_DISTINTA` |
| R02-C01-043 | F002 | Tardía registrada | Intentar salida normal del mismo POST | `SALIDA_TARDIA_REGISTRADA` |
| R02-C01-044 | F002 | Tardía con P R-06f (ACK) | Ídem | Cierre, intento, lote, CDC y estado del documento sin cambio |
| R02-C01-045 | F003 | Cierre R-06f hecho | Repetir cierre | Retorno completo: fase, resultado, motivo NULL, `HTTP_RESPUESTA`, `http_post`, `http_autenticacion`, lote, CDC, fecha, estado actual |
| R02-C01-046 | F003 | Cierre `EI-SIN-SALIDA` | Cierre | `o_salida_ultimo_post = SIN_SALIDA`, `o_http_post` NULL (ausencia de evidencia) |
| R02-C01-047 | F003 | Cierre `ET-TIMEOUT` | Cierre | `ERROR_TRANSMISION` (consta que no hubo HTTP) |
| R02-C01-048 | F003 | Cierre `AUT-1` (401) | Cierre | `SIN_POST`, `o_http_autenticacion = 401`, `o_http_post` NULL |
| R02-C01-049 | F003 | Cierre hecho; luego consulta APROBADO | Repetir cierre / `estado_operacion_r05` | Resultado histórico intacto. **R02-C02:** `o_estado_sifen_actual = APROBADO` (estado SIFEN); `o_estado_documento_actual` = `estado_local` del documento tal como lo dejó la consulta, nunca `APROBADO` por esta lectura; ninguno se modifica |
| R02-C01-050 | F003 | U1 con operación propia; U4 con CREAR en S1 | `estado_operacion_r05` por U4 | `OPERACION_NO_ENCONTRADA` (mismo actor) |
| R02-C01-051 | F003 | U2 sin CREAR / U3 fuera de alcance | Ídem | `42501` / `DOCUMENTO_NO_ENCONTRADO` |
| R02-C01-052 | F003 | Cualquier operación | `estado_operacion_r05` | Ninguna columna devuelve testigo, hash, payload ni respuesta |
| R02-C01-053 | F003 | Base con flujos A–D sintéticos válidos | `verificar-NEX-084.sql` §3 | 100–112 con 0 violaciones |
| R02-C01-054 | F003 | Fixture sintético de base efímera con un intento cuya `respuesta` difiere de la evidencia saneada | Ídem | Control 104 > 0 |
| R02-C01-055 | F004 | Texto HTTP de 8 388 609 bytes | `registrar_post_r05` | `SOLICITUD_EXCEDE_LIMITE_DEFENSIVO`; sin fetch (límite provisional; sin medición) |
| R02-C01-056 | F005 | Operación abierta con única actividad reciente en una proyección / en una tardía | `verificar` §2 y reversión | Ambas la cuentan como reciente; la reversión aborta |
| R02-C01-057 | F005 | Reversión sin `-v backup_verificado=SI` (o sin las otras confirmaciones) | Reversión | Aborta antes de bloquear; modo ACTIVO |
| R02-C01-058 | F005 | Dos órfanas, `huerfanas=2`, confirmaciones | Reversión | REVERTIDO; informe = corte y conteos calculados bajo el bloqueo |
| R02-C01-059 | F005 | Preflight / verificar sin `-v entorno` en base sin `nexit_runtime` | Scripts | Control 17 (preflight) / 5 (verificar) `ok = false`; con `entorno=CI` → `true` |
| R02-C01-060 | F005 | Modo REVERTIDO | `nex_aplicar_grants_runtime()` y verificar | 7 escrituras sin EXECUTE; 3 lecturas con EXECUTE; NEX-072 sin re-GRANT; fila NEX-084 en `schema_migrations` |

## 14. Ejecutado por el CI vs. solo escrito

- **Solo escrito (no ejecutado por Claude ni por el CI):** los 391 casos de este documento (339 + 52 R02-C02); `preflight-NEX-084.sql`, `verificar-NEX-084.sql` y `reversion-NEX-084.sql` (el CI no los invoca).
- **Lo que el CI automático del repositorio sí hace** (comportamiento existente, observado tras el push; no es aplicación en la VM): aplica todas las migraciones versionadas, incluida NEX-084, en su base efímera, y corre sus suites existentes (T01, C1, DEMO y demás). Eso prueba que NEX-084 instala y convive con las invariantes del catálogo, no que los contratos de este documento se cumplan.
- Claude no ejecutó SQL, tests, lint, typecheck, build ni CI manual; NEX-084 no se aplicó en la VM.

## 15. R02-C02 — informe por residuo

Referencias por archivo y línea del estado de este commit (`NEX-084` = `documentacao/banco/nexit/v1/migraciones/NEX-084-facturacion-e03-envio-r05.sql`). `gateway.ts`, NEX-080, NEX-001…083, `app/`, `lib/`, runner y CI sin cambios. El preflight no requiere cambio.

### 15.1 R-C01-01 — token 4xx con `message` determinable

- **Causa.** Con un HTTP 4xx distinto de 401, `token_invalido` quedaba confiado al servidor sin mirar la respuesta persistida. Una P con `token_invalido = true` sobre un 403 sin indicación de token pasaba la validación y habilitaba renovación y POST 2 (`fe_e03_r05_token_rechazado_post1`).
- **Corrección.**
  - Nuevo ayudante `fe_e03_r05_token_mensaje(jsonb)` (NEX-084 :890). Recalcula `esTokenInvalido` sobre la clave EXACTA `message` de la respuesta saneada persistida y devuelve true, false o NULL:
    - raíz no objeto, o `message` ausente, null o no texto → false. Es determinable porque `JSON.parse(cuerpo).message` no es texto. El saneado conserva la clave `message` (no es clave secreta) y su tipo en la raíz.
    - texto alterado por el saneado (`[omitido]` o recorte `…`) → NULL.
    - algún carácter fuera de {U+0009–U+000D, U+0020–U+007E, U+00A1–U+00FF} → NULL.
    - en el resto, la expresión normalizada con `translate` y evaluada con `~`.
  - El cotejo (NEX-084 :942, bloque :997) lo evalúa **antes** del retorno por raíz no objeto:
    - resultado determinable distinto de la P → `NEX:PROYECCION_INCOHERENTE`; la P no se persiste;
    - coincidencia → `token_invalido` entra en `campos_cotejados`;
    - NULL → no se coteja.
  - `confianza` (NEX-084 :738): `cotejables` incluye `token_invalido_4xx`; `confiados_servidor` pasa a `token_invalido_4xx_no_cotejable`. Comentario del validador en :616–620. Comentario de la puerta en :1317.
  - La puerta `fe_e03_r05_token_rechazado_post1` (:1320) no cambia: exige P persistida con R-01 y `token_invalido`. Toda P persistida pasó el cotejo, así que un 4xx comprobadamente sin indicación de token deja la salida sin P. Resultado: sin renovación ni POST 2, y el cierre deriva `EI-SIN-P` (D-C02-2-A).
- **Equivalencia demostrada.** Dentro del conjunto admitido:
  - `\s` de JavaScript solo coincide con U+0009–U+000D y U+0020. U+00A0 queda excluido por el conjunto.
  - Sin indicador `u`, la insensibilidad a mayúsculas solo identifica A–Z con a–z y Á con á. Ningún otro carácter del conjunto canoniza a un carácter del patrón.
  - Por eso `translate` (espacios en blanco → espacio; A–Z, Á → a–z, á) seguido de `~` sensible a mayúsculas equivale a `/token\s+(inv[aá]lid|vencid|expirad|no\s+v[aá]lid)|invalid\s+token|token\s+(is\s+)?(invalid|expired)/i`.
  - `chr(193)` y `chr(225)` suponen una base UTF8, que es la codificación del proyecto.
- **Invariantes preservadas:**
  - 401 → true y fuera de 4xx → false los decide el validador.
  - Autenticación OK = HTTP 200; CACHE igual.
  - P ≤ 16384 bytes; CDC opaco; lote literal.
  - F002/F004/F005 sin cambio. La política de reenvío no cambia.
- **Contraejemplos cubiertos:**
  - falso positivo: 403 `{"status":"error"}` con P true;
  - falso negativo: 400 «Token vencido» con P false;
  - `message` null, numérico o genérico;
  - clave `Message` (alias, no exacta);
  - raíz array.
- **Limitación.** Si `message` no es cotejable (sin cuerpo, truncada, redactada, alterada o con caracteres fuera del conjunto), `token_invalido` sigue confiado (`token_invalido_4xx_no_cotejable`), como pide la orden («no cambiar política de reenvío»). Exigir fail-closed también ahí sería una decisión del responsable.
- **Resultado:** corregido en la migración; casos R02-C02-001…020, solo escritos.

### 15.2 R-C01-02 — primeros 50 ELEMENTOS frente a entradas expandidas

- **Causa.** El validador limitaba `n_entradas` a 0..50, pero `entradasPorNumero` toma 50 elementos y expande cada uno en varias entradas. Una lista legítima de 50 elementos con objetos de varias claves daba más de 50 entradas, y la P se rechazaba. El cotejo además acumulaba nombres en un array.
- **Corrección.**
  - Validador: `rechazados.n_entradas` y `aceptados.n_entradas` en 0..32767 (NEX-084 :630, :636).
  - Cotejo (:1159–:1203), mismo algoritmo que el parser sobre `lista.slice(0,50)`:
    - texto → 1 entrada (trim de JS);
    - objeto → 1 entrada por clave (trim de JS);
    - array interno → 1 entrada por índice;
    - null, número y booleano → ignorados.
  - Conteo saturado con `least(…, 32767)`. `propio`, `incluye_propio` y `con_formato_fiscal` se calculan sobre todas las entradas, también después de saturar. No se acumulan nombres.
  - Un array interno persistido con 50 elementos pudo tener más en el original (el saneado recorta a 50). En ese caso `n_entradas` se coteja como cota inferior y el campo es `<lista>.conteo_cota_inferior`.
  - Claves o textos alterados, varias claves alias o terceros retirados → la lista no se coteja.
- **Invariantes preservadas.** Las claves de índice nunca igualan el número fiscal ni tienen formato fiscal, así que solo afectan al conteo. El elemento 51 y siguientes se ignoran igual que en el parser, y el saneado tampoco los conserva. La regla de ACK y de rechazo no cambia.
- **Contraejemplos cubiertos:**
  - 50 elementos → 51 entradas;
  - entrada propia más allá de la 50.ª entrada expandida;
  - elemento 51 propio ignorado;
  - arrays internos y su cota;
  - saturación;
  - null, número y booleano.
- **Limitación.** Con la clave exacta `response`, `redactarAjenos` retira los elementos no propios (arrays y null incluidos) y añade `OtrosDocumentosOmitidos`, así que la lista no se coteja. Arrays internos y null solo llegan cotejables bajo claves alias (p. ej. `Response`). La saturación en el cotejo es inalcanzable con respuestas persistidas: más de 32767 entradas superan los 30000 caracteres del saneado, que queda `{truncado:true}` → `NO_COTEJABLE_TRUNCADA`. El validador sí acota la P.
- **Resultado:** corregido en la migración; casos R02-C02-021…034, solo escritos.

### 15.3 R-C01-03 — recuperación antes del cierre

- **Causa.** `fe_e03_estado_operacion_r05` solo daba el último POST y el cierre histórico. Con la operación abierta no mostraba:
  - las autenticaciones por separado;
  - la regla, resultado, estado local, error, motivo sin P y cotejo de la salida;
  - la clasificación de cierre que el cierre derivaría.

  Además mezclaba la tardía con la salida normal (`TARDIA_*`) y no separaba `estado_local` de `estado_sifen`.
- **Corrección.**
  - **Derivación única.** La lógica de derivación del cierre se movió sin cambios a `fe_e03_r05_derivar_cierre(uuid,uuid,uuid)` (NEX-084 :1747). Es STABLE, no SECURITY DEFINER, sin EXECUTE para PUBLIC (REVOKE :2319) ni para `nexit_runtime`.
    - Devuelve `o_derivable = false` con `o_motivo = CIERRE_SIN_EVIDENCIA` donde antes el cierre lanzaba la excepción.
    - `fe_e03_cerrar_envio_r05` (:1850) la llama (:1908) y lanza la misma excepción `NEX:CIERRE_SIN_EVIDENCIA` si no es derivable.
    - El cierre conserva: bloqueo FOR UPDATE previo, testigo, vigencia, `p_clasificacion_esperada`, NEX-080, evento, fila de cierre, idempotencia y retorno.
  - **Lectura reescrita** (:2109; misma firma de entrada, mismo actor, CREAR y alcance antes de leer):
    - vigencia y `o_motivo_no_vigente`;
    - `o_aut1_*` y `o_aut2_*` por separado: existencia, origen, resultado, HTTP;
    - último POST: número, id del evento NEX-072 o del POST grande, almacenamiento, instante;
    - salida NORMAL con HTTP, clase TIMEOUT/RED, estado de P, regla, resultado, estado local, tipo de error, motivo sin P, cotejo y campos cotejados;
    - tardía solo como observación: tipo, HTTP, estado de su P;
    - `o_cierre_derivable` con `o_clasificacion_derivable` en el formato exacto de `p_clasificacion_esperada`, o `o_motivo_no_derivable` (`CIERRE_SIN_EVIDENCIA` / `OPERACION_CERRADA`);
    - cierre histórico;
    - `o_estado_documento_actual` = `estado_local` y `o_estado_sifen_actual` = `estado_sifen`.
  - **Nunca devuelve** P, respuesta, mensajes del gateway, testigo, su hash ni credenciales.
- **Invariantes preservadas:**
  - Leer no autoriza ningún fetch: la renovación y el POST 2 siguen dependiendo de `fe_e03_r05_token_rechazado_post1` dentro de las escrituras.
  - La clasificación es provisional; el cierre la vuelve a derivar bajo bloqueo.
  - La tardía nunca alimenta el cierre.
  - Ninguna columna de estado se modifica.
- **Contraejemplos cubiertos:**
  - POST 1 HTTP 400 R-01 con ACK SQL perdido antes de renovar;
  - autenticaciones;
  - salida sin P;
  - sin salida;
  - TIMEOUT/RED;
  - ACK; rechazo;
  - sin POST;
  - cerrada; no vigente;
  - tardía.
- **Limitación.** La clasificación provisional de una operación abierta puede cambiar si se registra más evidencia antes del cierre. Es un dato de recuperación, no un resultado.
- **Resultado:** corregido en la migración; casos R02-C02-035…052, solo escritos.

### 15.4 Firmas, scripts y checksum

- **Nuevos ayudantes internos:** `fe_e03_r05_token_mensaje(jsonb)` y `fe_e03_r05_derivar_cierre(uuid,uuid,uuid)`.
  - REVOKE de PUBLIC en el ayudante de privilegios (NEX-084 :2304, :2319).
  - Añadidos a `internas` y al texto del control 33 de `verificar-NEX-084.sql` (:35, :90).
  - Los controles 31 (10 SECURITY DEFINER concedidas) y 63 (sin EXECUTE de runtime en `fe_e03_r05_%`) siguen válidos sin cambio.
- **Firmas de entrada sin cambio:** las 7 escrituras y las 3 lecturas. `fe_e03_estado_operacion_r05` cambia solo su retorno, y no tiene llamador en `app/` ni en `lib/`.
- **Checksum SHA-256 de NEX-084:** `38d45ea661ed5d8f1dc3d43dc6b0f727f8872c6bdd0fbab5745cc7802f5b6854`. Sustituye a `12439af6…` en `verificar-NEX-084.sql` control 1 (:41–:42), `reversion-NEX-084.sql` (:79) y §12.
- **Gate B:** el límite provisional de 8 MiB y D6 quedan intactos y sin mediciones.

## 16. Casos nuevos R02-C02 (R02-C02-001…052) — ESCRITOS, NO EJECUTADOS

Mismo fixture de §9. Para R-C01-01, «íntegra» = respuesta persistida no truncada ni redactada. «Sin P» = la aplicación solo puede registrar la salida con motivo `PROYECCION_RECHAZADA` (R02-C01-007).

| ID | Residuo | Precondición | Operación | Resultado esperado |
|---|---|---|---|---|
| R02-C02-001 | R-C01-01 | POST 1 HTTP 401; P `token_invalido = true`, R-01 | `registrar_salida_r05` | Aceptado (lo decide el validador; `token_invalido` no se recoteja por mensaje) |
| R02-C02-002 | R-C01-01 | HTTP 400 íntegra `{"message":"Token inválido"}`; P true, R-01 | Ídem | Aceptado; `token_invalido` en `campos_cotejados` |
| R02-C02-003 | R-C01-01 | HTTP 403 íntegra `{"message":"invalid token"}`; P true, R-01; renovación OK | `registrar_post_r05` nro 2 | Aceptado (`token_rechazado_post1` = true) |
| R02-C02-004 | R-C01-01 | HTTP 403 íntegra sin clave `message`; P true | `registrar_salida_r05` | `PROYECCION_INCOHERENTE`; nada escrito |
| R02-C02-005 | R-C01-01 | HTTP 403 íntegra `{"message":null}`; P true | Ídem | `PROYECCION_INCOHERENTE` |
| R02-C02-006 | R-C01-01 | HTTP 403 íntegra `{"message":401}`; P true | Ídem | `PROYECCION_INCOHERENTE` |
| R02-C02-007 | R-C01-01 | HTTP 403 íntegra `{"status":"error","message":"Acceso denegado"}`; P true (falso positivo) | Ídem | `PROYECCION_INCOHERENTE` |
| R02-C02-008 | R-C01-01 | HTTP 400 íntegra `{"message":"Token vencido"}`; P false (falso negativo) | Ídem | `PROYECCION_INCOHERENTE` |
| R02-C02-009 | R-C01-01 | Casos 004…007 con P `token_invalido = false` | Ídem | Aceptado; `token_invalido` cotejado |
| R02-C02-010 | R-C01-01 | Tras 004…007: salida sin P | `registrar_autenticacion_r05` RENOVACION / `registrar_post_r05` nro 2 | `EVENTO_CONTRADICTORIO` ambos; cierre `EI-SIN-P` (`ENVIO_INDETERMINADO`) |
| R02-C02-011 | R-C01-01 | HTTP 400 `{"message":"TOKEN   INVÁLIDO"}` (mayúsculas, Á, varios espacios); P true | `registrar_salida_r05` | Aceptado; cotejado |
| R02-C02-012 | R-C01-01 | HTTP 400 `message` «token\texpired» / «token\nis invalid»; P true | Ídem | Aceptado; cotejado |
| R02-C02-013 | R-C01-01 | HTTP 400 `message` «Su token no válido»; P true / P false | Ídem | Aceptado / `PROYECCION_INCOHERENTE` |
| R02-C02-014 | R-C01-01 | HTTP 400 `message` «token inválido» (NBSP) o con un carácter > U+00FF | Ídem con P true o false | Aceptado en ambos; `token_invalido` NO en `campos_cotejados` (no cotejable) |
| R02-C02-015 | R-C01-01 | HTTP 403 `message` con `[omitido]` (secreto saneado) o terminado en «…» (recorte > 1000) | Ídem con P true o false | Aceptado; `token_invalido` no cotejado |
| R02-C02-016 | R-C01-01 | HTTP 403 con respuesta truncada (`{truncado:true}`), redactada o sin cuerpo; P true | Ídem | Aceptado; cotejo `NO_COTEJABLE_*`; `token_invalido` confiado (limitación §15.1) |
| R02-C02-017 | R-C01-01 | HTTP 403 con raíz array `["token inválido"]`; P true | Ídem | `PROYECCION_INCOHERENTE` (determinable false aunque el cotejo termine en `COTEJADO_PARCIAL`) |
| R02-C02-018 | R-C01-01 | HTTP 403 `{"Message":"Token inválido"}` (clave no exacta); P true / P false | Ídem | `PROYECCION_INCOHERENTE` / aceptado |
| R02-C02-019 | R-C01-01 | P con `confianza` de R02-C01 (`token_invalido_4xx` en `confiados_servidor`) | Ídem | `PROYECCION_INVALIDA` |
| R02-C02-020 | R-C01-01 | HTTP 200 o 500 con `{"message":"Token inválido"}`; P false | Ídem | Aceptado; el mensaje no se evalúa fuera de 4xx |
| R02-C02-021 | R-C01-02 | Respuesta íntegra con alias `Response.Aceptados` de 50 elementos: 49 textos + 1 objeto de 2 claves; P `n_entradas = 51` / 50 | Ídem | Aceptado / `PROYECCION_INCOHERENTE` |
| R02-C02-022 | R-C01-02 | Elemento 50 objeto cuya 3.ª clave es el número propio (entrada expandida n.º 52); P `incluye_propio = true` / false | Ídem | Aceptado / `PROYECCION_INCOHERENTE` |
| R02-C02-023 | R-C01-02 | Lista original de 51 elementos con el propio en el 51 (persistida con 50); P `incluye_propio = false`, `n_entradas = 50` | Ídem | Aceptado (elemento 51 ignorado, como el parser) |
| R02-C02-024 | R-C01-02 | Elemento array interno `["a","b","c"]` + texto propio; P `n_entradas = 4`, propio true | Ídem | Aceptado; las claves de índice nunca son propias ni con formato fiscal |
| R02-C02-025 | R-C01-02 | Array interno persistido con 50 elementos; P `n_entradas` ≥ conteo / < conteo | Ídem | Aceptado con campo `<lista>.conteo_cota_inferior` / `PROYECCION_INCOHERENTE` |
| R02-C02-026 | R-C01-02 | Lista `[null, 5, true, " 001-001-0000001 "]` (número propio con espacios) | Ídem | `n_entradas = 1`, propio true (trim de JS) |
| R02-C02-027 | R-C01-02 | P `n_entradas = 32767` / 32768 | Ídem | Aceptado por el validador / `PROYECCION_INVALIDA` |
| R02-C02-028 | R-C01-02 | Respuesta con más de 32767 entradas posibles | Ídem | Saneado `{truncado:true}` → `NO_COTEJABLE_TRUNCADA`; listas no cotejadas (saturación inalcanzable en el cotejo, §15.2) |
| R02-C02-029 | R-C01-02 | ACK por lote (R-06f) con `aceptados` que incluye el propio entre 60 entradas expandidas | Ídem | Aceptado; regla R-06f sin cambio; CDC no decide |
| R02-C02-030 | R-C01-02 | Rechazo propio en `Response.Rechazados` (objeto con 3 claves, una propia) | Ídem | Aceptado con `propio = true`; regla de rechazo sin cambio |
| R02-C02-031 | R-C01-02 | Rechazo ajeno bajo `response` exacta (la aplicación retiró terceros: `OtrosDocumentosOmitidos`) | Ídem | Listas fuera de `campos_cotejados`; `terceros_omitidos` confiado |
| R02-C02-032 | R-C01-02 | Clave de lista con `[omitido]`, texto alterado o dos claves alias | Ídem | Lista no cotejada; nada inventado |
| R02-C02-033 | R-C01-02 | Lista con entradas de formato fiscal ajenas; P `con_formato_fiscal = false` | Ídem | `PROYECCION_INCOHERENTE` |
| R02-C02-034 | R-C01-02 | Salida con P de 51 entradas registrada | Repetir idéntica / con P de 50 | `o_reutilizado` / `SALIDA_DISTINTA` (F002 intacta) |
| R02-C02-035 | R-C01-03 | POST 1 HTTP 400 con P R-01 registrada; el ACK SQL de `registrar_salida_r05` se perdió; sin renovación | `estado_operacion_r05` | Vigente; aut1 OK/200 (HTTP o CACHE); aut2 inexistente; último POST 1, `HTTP_RESPUESTA` 400, `CON_PROYECCION`, regla R-01, cotejo y campos; derivable `{EI-TOKEN-SIN-POST2, ERROR_HTTP, ENVIO_INDETERMINADO, null}` |
| R02-C02-036 | R-C01-03 | Ídem 035 | La aplicación renueva (`registrar_autenticacion_r05` RENOVACION) | Permitido solo por la escritura (puerta `token_rechazado_post1`); la lectura no habilita nada |
| R02-C02-037 | R-C01-03 | Renovación con 401 | `estado_operacion_r05` | `o_aut2_*` = existe, HTTP, ERROR_HTTP, 401; derivable `AUT-2` (fase AUTENTICACION) |
| R02-C02-038 | R-C01-03 | Autenticación inicial fallida, sin POST | Ídem | `o_aut1_*` con resultado y HTTP; `SIN_POST`; derivable `AUT-1` |
| R02-C02-039 | R-C01-03 | Autenticación inicial OK y sin POST | Ídem | `SIN_POST`; `o_cierre_derivable = false`, `o_motivo_no_derivable = CIERRE_SIN_EVIDENCIA` |
| R02-C02-040 | R-C01-03 | POST 1 registrado sin salida | Ídem | `SIN_SALIDA`; derivable `EI-SIN-SALIDA` (ausencia de evidencia) |
| R02-C02-041 | R-C01-03 | POST 1 con TIMEOUT / RED | Ídem | `ERROR_TRANSMISION`, `o_error_transmision` = clase, HTTP nulo; derivable `ET-TIMEOUT` / `ET-RED` |
| R02-C02-042 | R-C01-03 | POST 1 HTTP 403 sin P (`PROYECCION_RECHAZADA`) | Ídem | `SIN_PROYECCION`, `o_motivo_sin_proyeccion`; derivable `EI-SIN-P` |
| R02-C02-043 | R-C01-03 | POST 1 con ACK (R-06f) | Ídem | Regla, resultado, estado local y error de la salida = los de la P; derivable igual |
| R02-C02-044 | R-C01-03 | POST con rechazo propio | Ídem | Ídem con la regla de rechazo |
| R02-C02-045 | R-C01-03 | Operación con `NO_TRANSMITIDO` | Ídem | `o_no_transmitido = true`; derivable `NT` |
| R02-C02-046 | R-C01-03 | Cualquier caso 035…045 | `cerrar_envio_r05` con `o_clasificacion_derivable` como esperada | Cierre aceptado con esa misma clasificación (derivación compartida); sin derivable → `CIERRE_SIN_EVIDENCIA` igual que antes |
| R02-C02-047 | R-C01-03 | Operación cerrada | `estado_operacion_r05` | `o_cerrada = true`; derivable false con `OPERACION_CERRADA`; histórico completo |
| R02-C02-048 | R-C01-03 | Operación abierta superada por otra versión / documento fuera de ENVIANDO | Ídem | `o_vigente = false`, `o_motivo_no_vigente` (`OPERACION_NO_VIGENTE` / `DOCUMENTO_NO_ENVIANDO`); la clasificación se informa pero el cierre la rechaza por vigencia |
| R02-C02-049 | R-C01-03 | Operación sin cierre y ya no vigente; salida normal ausente; tardía HTTP 200 con P (estado C) del último POST | Ídem | `o_salida_ultimo_post = SIN_SALIDA`; `o_tardia_*` = HTTP_RESPUESTA, 200, `PROYECCION_VALIDADA` (observación); derivable `EI-SIN-SALIDA` (la tardía no alimenta el cierre) |
| R02-C02-050 | R-C01-03 | Documento con `estado_sifen = APROBADO` tras consulta | Ídem | `o_estado_sifen_actual = APROBADO`; `o_estado_documento_actual` = `estado_local`; ninguno modificado |
| R02-C02-051 | R-C01-03 | Cualquier operación | Ídem | Ninguna columna devuelve P, respuesta saneada o bruta, mensajes del gateway, testigo, su hash ni credenciales |
| R02-C02-052 | R-C01-03 | U4 (otro actor), U2 sin CREAR, U3 fuera de alcance | Ídem | `OPERACION_NO_ENCONTRADA` / `42501` / `DOCUMENTO_NO_ENCONTRADO`, comprobados antes de leer |
