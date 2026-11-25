# Casos PRO-312-R02 / Lote A — NEX-084 (contrato SQL de envío E03 R05)

**Fecha:** 24/11/2026 · **Orden:** [ORD-CLAUDE-NEXIT-PRO-312-R02-NEX-084](../ordens/ORD-CLAUDE-NEXIT-PRO-312-R02-NEX-084-2026-11-24.md) · **Auditoría base:** [AUD-CHATGPT C02](AUD-CHATGPT-NEXIT-PRO-312-R01-C02-2026-11-24.md) · **Contrato:** [C02](../analises/PRO-312-R01-C02-CONTRATOS-E03-2026-11-24.md), [C01](../analises/PRO-312-R01-C01-DISENO-E03-2026-11-24.md), [R01](../analises/PRO-312-R01-DIAGNOSTICO-INTEGRACION-E03-2026-11-24.md) · **Rama:** `feature/NEXIT-2026-001-banco-demo` (PR #7 Draft) · **Base:** `81e590060cbbc841079e006fa7cf58ab3860b659`.

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
| `fe_e03_registrar_autenticacion_r05(…, operacion, testigo, motivo INICIAL\|RENOVACION_TOKEN, origen HTTP\|CACHE, resultado OK\|ERROR_HTTP\|TIMEOUT\|RED, http)` | sin mensajes ni secretos | INICIAL antes de cualquier POST; RENOVACION solo con POST 1 + P `token_invalido` y sin POST 2 | `o_nro, o_reutilizado` | `AUTENTICACION_DISTINTA`, `EVENTO_CONTRADICTORIO`, `EVENTO_INVALIDO`, `OPERACION_NO_TRANSMITIDA`, vigencia |
| `fe_e03_registrar_post_r05(…, operacion, testigo, nro_post 1..2, texto HTTP exacto)` | antes del `fetch` | vigente; secuencia; POST 1 tras autenticación OK; POST 2 solo tras token inválido + renovación OK; texto `::jsonb` = snapshot | `o_nro_post, o_almacenamiento EVIDENCIA_NEX072\|POST_GRANDE_R05, o_solicitud_sha256, o_solicitud_bytes, o_reutilizado` | `CUERPO_NO_COINCIDE`, `POST_DISTINTO`, `SOLICITUD_EXCEDE_LIMITE_DEFENSIVO`, `EVENTO_CONTRADICTORIO`, vigencia |
| `fe_e03_registrar_salida_r05(…, nro_post, tipo HTTP_RESPUESTA\|ERROR_TRANSMISION, http, respuesta, truncada, clase TIMEOUT\|RED, proyeccion, motivo_sin_proyeccion)` | P o motivo de su ausencia (exactamente uno) | POST existente; sin tardía; vía normal vigente | `o_evento_id, o_regla, o_cotejo, o_reutilizado` | `PROYECCION_INVALIDA`, `PROYECCION_EXCEDIDA`, `CLASIFICACION_NO_COINCIDE`, `PROYECCION_INCOHERENTE`, `EVIDENCIA_CON_CREDENCIALES`, `SALIDA_DISTINTA`, `SALIDA_TARDIA_REGISTRADA`, vigencia |
| `fe_e03_registrar_no_transmitido_r05(…, motivo)` | `SIN_CREDENCIALES\|FALLO_LOCAL\|CUERPO_NO_COINCIDE\|SOLICITUD_EXCEDE_LIMITE` | sin POST y sin autenticación fallida | `o_evento_id, o_reutilizado` | `EVENTO_CONTRADICTORIO`, `EVENTO_INVALIDO`, vigencia |
| `fe_e03_cerrar_envio_r05(…, operacion, testigo, clasificacion_esperada {regla, resultado, estado_local, error_tipo})` | **sin** respuesta, lote, CDC ni mensaje libres | vigente (salvo repetición) | `o_estado_local, o_intento_id, o_regla, o_reutilizado` | `CIERRE_SIN_EVIDENCIA`, `CIERRE_CONTRADICTORIO`, `CIERRE_DISTINTO`, `INTENTO_NO_IDENTIFICADO`, vigencia |
| `fe_e03_registrar_salida_tardia_r05(…, nro_post, tipo, http, respuesta, truncada, clase, proyeccion)` | salida que la vía normal ya no admite | POST existente sin salida normal; `fe_e03_r05_no_vigente` ≠ NULL | `o_salida_id, o_motivo, o_reutilizado` | `SALIDA_ADMISIBLE`, `SALIDA_TARDIA_DISTINTA`, `SALIDA_DISTINTA`, `EVIDENCIA_CON_CREDENCIALES` |
| `fe_e03_operacion_por_correlacion_r05(empresa, usuario, documento, correlacion)` (lectura) | — | mismo actor, CREAR, alcance | `o_operacion_id, o_version, o_vigente, o_cerrada, o_creado_at` (sin testigo ni hash) | permiso / documento no encontrado |
| `fe_e03_conexion_referencia_r05(empresa, usuario, documento)` (lectura) | — | CREAR o EDITAR, alcance | `o_conexion, o_origen INTENTO\|OPERACION_R05, o_referencia_id, o_instante, o_ambigua` | permiso / documento no encontrado |

**Derivación del cierre** (solo de la evidencia persistida; primera regla aplicable):

| Regla | Evidencia | fase · resultado · estado · error_tipo · HTTP | Mensaje del intento |
|---|---|---|---|
| `NT` | NO_TRANSMITIDO | TRANSMISION · RED · ENVIO_INDETERMINADO · — · NULL | «Error interno durante el envío: el resultado es indeterminado.» (paridad con `envio.ts`) |
| `AUT-1` | sin POST; autenticación 1 fallida | AUTENTICACION · (TIMEOUT\|RED\|ERROR_HTTP) · ERROR_ENVIO · AUTENTICACION · HTTP del login | textos vigentes de `gateway.ts` |
| — | sin POST, sin fallo de login ni NO_TRANSMITIDO | `NEX:CIERRE_SIN_EVIDENCIA` (no se cierra) | — |
| `AUT-2` | último POST = 1 con P `token_invalido`; renovación fallida | AUTENTICACION · resultado de la renovación · ERROR_ENVIO · AUTENTICACION · HTTP de la renovación | textos vigentes |
| `EI-TOKEN-SIN-POST2` | último POST = 1 con P `token_invalido`; sin renovación fallida ni POST 2 | TRANSMISION · ERROR_HTTP · ENVIO_INDETERMINADO · — · HTTP del POST 1 | evidencia insuficiente |
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

**Funciones:** 7 de escritura y 2 de lectura (§1); ayudantes internos sin EXECUTE para la aplicación (`fe_e03_r05_*`, `fe_e03_clasificar_recepcion_r05`); `nex_aplicar_grants_facturacion_e03_r05()` (nuevo); `nex_aplicar_grants_facturacion_e03()` **redefinido** (§6).

## 4. Justificación del almacenamiento (D8-B)

- NEX-072 limita `solicitud_http_texto` a 1 MiB por CHECK y la tabla está aplicada: no se edita. Los POST ≤ 1 MiB siguen en ella sin cambios de forma.
- El snapshot que se transmite está acotado por NEX-048 (`pg_column_size(payload) < 262144`). El texto que la aplicación serializa (`JSON.stringify`) del mismo valor no puede superar ~6 veces el tamaño binario (peor caso: caracteres de control escapados como `\u00XX`); 8 MiB cubre ese máximo con margen. Como el texto debe ser **igual como jsonb** al snapshot, solo un relleno de espacios lo haría crecer más: se rechaza **antes del fetch** (`SOLICITUD_EXCEDE_LIMITE_DEFENSIVO`) y la operación se declara `NO_TRANSMITIDO` con motivo `SOLICITUD_EXCEDE_LIMITE` → cierre `NT` indeterminado, sin transmisión.
- La tabla nueva guarda el texto íntegro, SHA-256 y bytes UTF-8 calculados por el banco (`convert_to(texto, 'UTF8')`). No hay hash-only, ni ruta directa, ni reducción de líneas. Una FE de 999 líneas, cualquiera sea su tamaño ≤ 8 MiB, conserva evidencia completa en una de las dos tablas.
- La medición real de 999 líneas (C01-043) **no** se ejecutó; el preflight informa el máximo canónico existente sin contenido.

## 5. Orden de bloqueos

1. Fila única de `nex_e03_r05_estado` **FOR SHARE**; el modo ACTIVO se comprueba **después** de obtenerla (C02-045).
2. Fila del documento **FOR UPDATE** (la misma que toma NEX-062/080).
3. Altas en las tablas.

La reversión toma la misma fila de modo **FOR UPDATE** primero: espera a toda escritura en curso; las posteriores ven REVERTIDO aunque hayan pasado el control de EXECUTE. Ninguna función toma los bloqueos en otro orden; `fe_documento_iniciar_envio` y `fe_documento_registrar_envio_r05` vuelven a pedir el bloqueo del documento ya obtenido (misma transacción).

## 6. Invariantes y ACL

- **Una sola transmisión por número de POST**: el POST se registra antes del fetch; la repetición vigente devuelve `o_reutilizado` (el mismo proceso hace su único fetch si aún no lo hizo); un POST distinto se rechaza; el POST 2 exige token inválido comprobado por P y renovación OK; no hay POST 3.
- **Correlación y testigo**: se persiste solo `SHA-256(testigo)`; la columna `testigo_sha256` no se concede a `nexit_runtime` (privilegio por columnas) y ninguna función la devuelve. Ningún mensaje de error repite el testigo ni su hash. Perder el testigo = ningún POST nuevo de esa operación.
- **Cierre**: derivado de la evidencia; idempotente por operación (huella de la clasificación); un intento por cierre; nunca `estado_sifen`; CDC opaco (NEX-080) sin reglas de forma.
- **P**: esquema cerrado v1, ≤ 16384 bytes reales (`octet_length`), tipos, rangos y coherencia; identidad = fila del documento; clasificación de la aplicación = clasificación SQL; saneada antes de persistir; cotejo solo de los campos efectivamente preservados (`campos_cotejados`).
- **Aislamiento**: toda tabla con `empresa_id` y FK anclada en `empresa_id` (T01); FK compuestas por `(empresa, documento[, version])`.
- **Inmutabilidad**: UPDATE/DELETE/TRUNCATE bloqueados; DELETE solo en reinicio DEMO autorizado (mismo mecanismo de NEX-072).
- **ACL** (`nexit_runtime`): SELECT de las tablas R05 (sin `testigo_sha256`) y de la fila de modo; EXECUTE de las 7 escrituras solo en modo ACTIVO; EXECUTE de las 2 lecturas en ambos modos; sin EXECUTE en ayudantes; **sin EXECUTE en las 3 funciones de escritura de NEX-072** (la aplicación no las usa: camino único R05). Sin escritura directa en ninguna tabla. El EXECUTE de `fe_documento_iniciar_envio` y `fe_documento_registrar_envio_r05` (camino vigente de la aplicación) no se toca.
- **Reaplicación**: ambos ayudantes son idempotentes y los descubre el envoltorio `nex_aplicar_grants_runtime()` (NEX-052), por lo que cualquier reaplicación futura conserva el estado según el modo.

## 7. Transición, coexistencia y limitaciones

- **Lote A no cambia la aplicación.** Tras aplicar NEX-084, `envio.ts` sigue igual (NEX-062 + NEX-080). Las funciones R05 existen sin llamador hasta el Lote B.
- **Operaciones NEX-072 previas** (si las hubiera) no se adoptan como R05; no hay backfill.
- **Marca local `nexit.e03_r05`**: la activan las funciones R05 con `set_config(…, true)` y dura hasta el fin de la transacción. Defensa en profundidad; la garantía principal es que `nexit_runtime` no ejecuta las funciones de NEX-072 ni escribe tablas.
- **Paridad del lote (C02-009, bloqueo B-01)**: `fe_e03_r05_lote_valido` reproduce `FORMATO_LOTE` y `\s` de JavaScript con listas explícitas de puntos de código; NEX-080 usa `[[:cntrl:]]`/`[[:space:]]` del locale. Para un lote con, p. ej., U+0085 o U+00A0 interno/final las dos reglas pueden diferir: el cierre lo registra en `lote_paridad = false` y el intento queda **sin lote** (NEX-080 lo descarta). No se corrige NEX-080 en esta orden.
- **Inicio repetido indeterminado (C02 §3.2)**: con una correlación nueva, NEX-062 devuelve `INDETERMINADO` (vencido > 2 min) **o** lanza `NEX:ENVIO_INDETERMINADO` (ya indeterminado). Ambos significan «sin raíz y sin derecho de POST»; no son idénticos y el contrato no lo afirma. Con una correlación ya registrada se devuelve la operación existente sin volver a llamar a NEX-062.
- **Cotejo parcial**: ecos, listas y CDC dependen de normalizaciones de JavaScript y no se cotejan en SQL en el Lote A (se declaran en `campos_cotejados`). Respuesta truncada, redactada o ausente → `NO_COTEJABLE_*`.
- **Ventana de reversión**: el tiempo de drenaje (10 min) no prueba la ausencia de un proceso vivo; las órfanas se reconocen explícitamente y quedan abiertas.
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
| R02-014 | POST 1 con P `token_invalido`; renovación OK | `registrar_post_r05` nro 2 | Aceptado | C01-059 |
| R02-015 | POST 1 con 500 / con TIMEOUT / sin P | `registrar_post_r05` nro 2 | `EVENTO_CONTRADICTORIO` | C01-063/064 |
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
| R02-035 | Autenticación INICIAL con `origen = CACHE`, `http = 200` | `registrar_autenticacion_r05` | `EVENTO_INVALIDO` (CACHE exige HTTP nulo) | forma |
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
| R02-053 | Operación cerrada indeterminada; llega HTTP del POST 1 | `registrar_salida_tardia_r05` | Fila tardía `OPERACION_CERRADA`, FK al POST; cierre e intento sin cambio | C02-033 |
| R02-054 | Operación vigente | `registrar_salida_tardia_r05` | `SALIDA_ADMISIBLE` | contrato |
| R02-055 | Tardía con P inválida | Ídem | Fila con `proyeccion` NULL; repetición idéntica → `o_reutilizado`; distinta → `SALIDA_TARDIA_DISTINTA` | C02-035 |
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
| R02-082 | Reversión con operación abierta y evento hace 3 min | Reversión | Aborta («proceso vivo»); modo ACTIVO | C02-042 |
| R02-083 | Dos órfanas antiguas; `-v huerfanas=1` | Reversión | Aborta; con `huerfanas=2` → REVERTIDO; órfanas conservadas | C02-043 |
| R02-084 | Escritura R05 en curso con FOR SHARE; reversión concurrente | Ambas | La reversión espera; la escritura termina; una escritura posterior que ya pasó el EXECUTE falla con `E03_R05_REVERTIDO`; una nueva llamada falla por falta de EXECUTE | C02-045 |
| R02-085 | Reversión con evidencia | Reversión ×2 | Tablas, filas y funciones conservadas; SELECT y lecturas disponibles; la segunda ejecución solo reaplica el ayudante | C02-044 |
| R02-086 | Modo REVERTIDO | `SELECT nex_aplicar_grants_runtime()` | Escrituras R05 y NEX-072 sin EXECUTE; lecturas R05 con EXECUTE | C02-041 |
| R02-087 | Modo REVERTIDO | `verificar-NEX-084.sql` | Filas 70/71 coherentes con el modo | verificación |
| R02-088 | Base sin rol `nexit_runtime` | Migración | Ayudantes retornan sin conceder; resto instalado | grants |

## 10. Bloqueos para el Lote B (requieren decisión u orden separada)

| ID | Bloqueo |
|---|---|
| B-01 | Paridad Unicode del lote JS ↔ NEX-080 (`[[:cntrl:]]`/`[[:space:]]` del locale). NEX-084 la mide (`lote_paridad`) y no la corrige. Decidir si se ajusta NEX-080 (orden separada) o se acepta que esos lotes no se persistan. |
| B-02 | D6-c: comportamiento ante snapshots históricos no representables por `JSON.stringify` (la igualdad jsonb los rechaza → NO_TRANSMITIDO). Requiere el conteo del preflight §4 y decisión. |
| B-03 | D-C02-4: KuDE con la conexión de referencia R05. |
| B-04 | Integración de la aplicación: generar correlación y testigo antes del inicio; proyección P en `gateway.ts`; uso de `o_reutilizado` con la regla local «un solo fetch»; registro de la salida sin P ante cualquier fallo; uso de la salida tardía. |
| B-05 | Medición real de la FE de 999 líneas (C01-043) y confirmación del límite defensivo de 8 MiB con datos reales. |
| B-06 | Cotejo de ecos, listas y CDC en SQL (hoy declarados no cotejados). |
| B-07 | Reactivación del modo ACTIVO tras una reversión (fuera de este lote). |
| B-08 | Restitución opcional del EXECUTE de las funciones de NEX-072 (hoy retirado por diseño de camino único). |
