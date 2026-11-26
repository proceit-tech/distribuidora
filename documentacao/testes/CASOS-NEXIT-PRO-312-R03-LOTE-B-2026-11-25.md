# Casos PRO-312-R03 / Lote B — integración FE/NCE con evidencias R05

25/11/2026 · PR #7 Draft · rama `feature/NEXIT-2026-001-banco-demo` · sobre `7e927c4`. Actualizado 26/11/2026 por **PRO-312-R03-C01** (sobre `b474866`): corrección focal F-R03-01…04.
[Orden](../ordens/ORD-CLAUDE-NEXIT-PRO-312-R03-LOTE-B-INSTRUMENTACION-R05-2026-11-25.md) · [Runbook de homologación](../infra/PROCEDIMENTO-HOMOLOGACION-LOTE-B-R05-2026-11-25.md) · [Casos C04](CASOS-NEXIT-PRO-312-R02-C04-DESACTIVACION-R05-2026-11-25.md).

**Estado:** 76 casos **R03B-A01…J10** (Lote B) + 30 identificadores nuevos de R03-C01 (**R03B-K01…K13, K05b, L01…L06, M01…M10**), escritos como código en `lib/facturacion/e03-evidencias.casos.ts` y registrados en el runner (`scripts/casos-clientes/run.js`). **No se ejecutaron en esta entrega** (orden: sin pruebas manuales, lint, build, typecheck ni SQL). El CI automático preexistente los ejecuta en el push; su resultado se informa aparte y **no es homologación**.

## 1. Trazabilidad de los 523 identificadores anteriores

| Bloque | IDs | Documento | Estado en Lote B |
|---|---|---|---|
| NEX-084 (R02, R02-C01, R02-C02) | 391 | `CASOS-NEXIT-PRO-312-R02-NEX-084-2026-11-24.md` | sin cambios; solo escritos |
| NEX-085 (C03) | C03-001…048 | `CASOS-NEXIT-PRO-312-R02-C03-NEX-085-2026-11-25.md` | sin cambios; solo escritos |
| Desactivación (C04, C04-C01) | C04-001…084 | `CASOS-NEXIT-PRO-312-R02-C04-DESACTIVACION-R05-2026-11-25.md` | sin cambios; solo escritos |
| **Total anterior** | **523** | | se conservan por referencia; ningún ID se reutiliza ni se modifica |

Acumulado PRO-312 tras Lote B: 523 + 76 = **599** identificadores; tras R03-C01: 599 + 30 = **629**. Los 523 siguen siendo casos de base descartable con `nexit_runtime` real (no los ejecuta el CI de la aplicación); los 106 R03B son casos de aplicación con base y gateway simulados. Ningún ID se renumeró ni se reutilizó.

### 1.1 Expectativas corregidas en R03-C01 (mismo ID, con justificación)

| ID | Antes | Ahora | Por qué |
|---|---|---|---|
| R03B-I01 | una fila de catálogo sin forma (`undefined`) se aceptaba como ausencia → `null` | `AUSENTE` solo con la marca y el estado explícitos; una fila sin forma → 503 | F-R03-01: la ausencia tiene que estar comprobada; nunca se supone |
| R03B-I02…I06 | probaban `continuidadReferenciaR05` con el estado del catálogo dentro | el catálogo lo decide `estadoEstructuraR05` y la referencia exige exactamente una fila (`null` explícito = SIN_REFERENCIA); I06 cubre error de lectura en ambas | separación de la autoridad (F-R03-01); mismo criterio de cada ID |
| R03B-J08 | `continuidadReferenciaR05(` antes del gateway en `consultarEstado` | `conexionParaConsulta(` antes del gateway, sin `conexionParaDocumento(` ni `continuidadNex079(` en la consulta, y NEX-079 solo en la rama `AUSENTE` | la consulta ya no pasa por la regla NEX-079 con 409 previo |

## 2. Qué ejecuta el CI y qué no

| Capa | La ejecuta el CI automático | Qué demuestra | Qué no demuestra |
|---|---|---|---|
| R03B-A…J (runner de casos) | sí (`casos:compilar` + `run.js`) | la lógica de la aplicación contra los contratos de NEX-084 tal como se leyeron (nombres de columnas, códigos `NEX:`), con base y `fetch` simulados | el comportamiento real de NEX-084/085, el gateway real, SIFEN, la red |
| C1 (`verificar-consultas-app.js`) | sí | que cada SQL nuevo (adaptador R05, catálogo, continuidad) se prepara sin error contra el esquema con NEX-001…085 | resultados de esas consultas |
| Tipos, lint, build | sí | compilación y estilo | comportamiento |
| 523 casos anteriores | no | — | — |
| Homologación integrada (VM) | no | — | queda para la VM existente con autorización separada (runbook) |

## 3. Matriz de casos nuevos

| Grupo | IDs | Criterio |
|---|---|---|
| A. Bandera | A01–A03 | Sin variable o con `""`, `0`, `off`, `false`, `no` → vía vigente; `R05` (cualquier caja) → R05; otro valor → 503 antes de numerar |
| B. Preparación | B01–B05 | 10 firmas públicas con columnas exactas y EXECUTE, 32 internas sin EXECUTE, estado legible, modo ACTIVO; cualquier falta, NEX-080 ausente o error de catálogo → 503; la preparación es solo lectura |
| C. Flujo completo | C01–C15 | Orden inicio → login → autenticación registrada → POST registrado → fetch → salida → cierre; correlación UUID; testigo de 256 bits, el mismo en todas las escrituras y ausente del resultado, del gateway y de los logs; serialización única (texto registrado = transmitido); un POST; autenticación HTTP y CACHE (HTTP nulo, sin login); cierre con clasificación exacta; salida con P v1; sin clave ni token en referencia, respuesta o P; ACK ≠ aprobación SIFEN |
| D. No transmitido y D8-B | D01–D08 | Sin credenciales → NT `SIN_CREDENCIALES` sin HTTP; > 8 MiB → NT `SOLICITUD_EXCEDE_LIMITE` antes de autenticar; 1–8 MiB → `POST_GRANDE_R05` y transmisión íntegra; almacenamiento o hash registrado distinto → sin fetch; `CUERPO_NO_COINCIDE` → NT; autenticación 401 → AUT-1 sin POST |
| E. POST 2 | E01–E06 | Solo tras token inválido acreditado (salida persistida 4xx, P R-01) y renovación forzada registrada OK; mismo texto en ambos POST; rechazo de validación sin POST 2; renovación fallida → AUT-2; salida 1 no confirmada → nunca POST 2 |
| F. Incertidumbre y recuperación | F01–F12 | Clasificación incierta/definitiva de errores SQL; POST con registro incierto → sin fetch y sin declarar NT; cierre incierto → estado de la operación → solo clasificación coherente o indeterminada; operación ya cerrada → cierre histórico; no vigente → 409; inicio incierto → por correlación → NT y cierre; error de negocio del inicio se propaga; inicio no INICIADO → 409; timeout → ET-TIMEOUT sin reenvío; logs sin secretos |
| G. Tardías y P rechazada | G01–G06 | Pérdida de vigencia → salida tardía con los mismos argumentos y sin cierre nuevo; P rechazada → la misma salida sin P (`PROYECCION_RECHAZADA`) y EI-SIN-P; credenciales residuales → sin P y marca de truncamiento; respuesta registrable; mensajes de cierre; testigos distintos |
| H. Proyección P | H01–H05 | Paridad R-01…R-07 con `interpretarRecepcion`; lote con forma de credencial → sin P; clasificación distinta → `FALLO_LOCAL`; P v1 ≤ 16384 bytes; derivación local del cierre |
| I. Consulta en la misma cuenta | I01–I06 | Ausencia R05 solo comprobada en el catálogo; fila sin forma → 503; sin EXECUTE → 503; AMBIGUA o DISTINTA → 409 sin HTTP; MISMA / SIN_REFERENCIA (fila explícita nula); error de lectura del catálogo o de la función se propaga |
| K. Consulta integrada (R03-C01, F-R03-01) | K01–K13, K05b | `consultarEstado` y `obtenerKude` reales: envío histórico A + operación R05 B = activa → MISMA sin NEX-079 previo; R05 antigua B vs activa A → 409; AMBIGUA → 409; sin POST (fila nula) → SIN_REFERENCIA; estructura PARCIAL, catálogo vacío/múltiple/sin marca/estado desconocido, función sin una fila válida → 503 sin HTTP; sin EXECUTE → 503; pre-NEX-084 real → NEX-079 como hoy; manual, flujo NCE y automática con la misma autoridad; la consulta no lee bandera ni modo; error de lectura se propaga; KuDE con la regla anterior y sin leer R05; la SQL del catálogo y las 7 tablas = `CREATE TABLE` de NEX-084 |
| L. Secretos conocidos (R03-C01, F-R03-02) | L01–L06 | Clave y token opacos en mensaje y errores libres: ni en P (lectura nula), ni en la respuesta registrada (parámetros SQL), ni en el retorno, ni en logs; lote igual a la clave o al token → respuesta solo con la marca, sin P (`CREDENCIALES_RESIDUALES`), lote no devuelto; POST 2 con el token anterior repetido; credencial corta exacta; clave = RUC con CDC y lote legítimos que contienen el RUC → exactos en respuesta, P y retorno |
| M. HTTP conocido y fases (R03-C01, F-R03-03) | M01–M10 | Estado 200/401/400/500/503 con cuerpo ilegible (timeout o red al leer) → `HTTP_RESPUESTA` con el estado real, sin P (`CUERPO_NO_PROYECTABLE`), sin renovación ni POST 2, cierre EI-SIN-P; sin estado o estado fuera de 100–599 → `ERROR_TRANSMISION` RED; login o renovación con estado y cuerpo ilegible → `ERROR_HTTP` con el estado (nunca OK), AUT-1/AUT-2; AUT-2 sin POST 2 con renovación visible, sin fase RESPUESTA y HTTP de la autenticación; renovación sin registro → no se anuncia; transporte R05 distingue los tres resultados |
| J. Fuente | J01–J10 | Vía vigente intacta (4 transportes, 2 salidas saneadas); bandera en el preflight; sin fallback a NEX-080 directo; sin DML ni estado SIFEN; SQL solo con funciones públicas y tipos; logs sin parámetros; sin stock, saldos, IVA, KuDE, numeración ni límite de ítems; referencia R05 antes del gateway en la consulta; KuDE sin cambios |

## 4. Criterios para la homologación futura (VM, no ejecutados)

- **Bandera apagada:** emisión y envío idénticos a hoy; la consulta usa la referencia R05 solo si la estructura existe.
- **Bandera encendida:** preparación 503 ante cualquier falta, sin número; con todo listo, cada envío deja operación, autenticación, POST, salida y cierre en NEX-084.
- **Testigo y correlación:** el hash del testigo en la operación; el testigo nunca en tablas, logs ni respuestas.
- **Serialización (D6):** el diagnóstico de solo lectura del runbook (§3) concluyente, con `errores = 0` y `distintos = 0`, antes de activar.
- **Tamaño (D8-B):** `max_bytes` observado en el mismo diagnóstico; por encima de 8 MiB o sin resultado concluyente, decisión expresa del responsable.
- **P y secretos:** `EVIDENCIA_CON_CREDENCIALES` y P rechazadas contadas por día; ningún secreto en P ni en la respuesta.
- **Incertidumbre:** operaciones abiertas > 10 min = 0 tras cada ventana; ningún documento con dos POST salvo R-01.
- **Tardías:** registradas sin cambiar estado ni cierre.
- **Misma cuenta:** ninguna consulta con continuidad DISTINTA o AMBIGUA llega al gateway.

## 5. Limitaciones

- La base simulada responde con los contratos leídos de NEX-084; no reproduce sus guardas (secuencia, modo, cotejo). Un desvío entre esos contratos y el código solo se detecta en la base real.
- La paridad P ↔ `interpretarRecepcion` se comprueba en una matriz de respuestas representativas, no en todas las formas posibles del gateway.
- No hay medición real de tamaños ni de serialización. El diagnóstico D6/D8 del runbook (§3) está escrito pero **no se ejecutó**: reproduce el parser jsonb del driver, el `JSON.stringify` real y la igualdad `texto::jsonb = snapshot` de NEX-084, y depende de que el contenedor `nexit-app` resuelva `pg` y de que su conexión pueda leer las solicitudes (si no, bloqueo para decisión). La cota teórica de §4 (orden de 1,5–2 MiB) no es una prueba.
- Los casos K usan una base simulada: confirman la lógica de `consultarEstado` y `obtenerKude` con las respuestas de catálogo y de `fe_e03_conexion_referencia_r05` tal como las define NEX-084, no el catálogo real de la VM.
