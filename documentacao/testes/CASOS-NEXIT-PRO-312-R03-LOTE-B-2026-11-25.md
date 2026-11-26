# Casos PRO-312-R03 / Lote B — integración FE/NCE con evidencias R05

25/11/2026 · PR #7 Draft · rama `feature/NEXIT-2026-001-banco-demo` · sobre `7e927c4`.
[Orden](../ordens/ORD-CLAUDE-NEXIT-PRO-312-R03-LOTE-B-INSTRUMENTACION-R05-2026-11-25.md) · [Runbook de homologación](../infra/PROCEDIMENTO-HOMOLOGACION-LOTE-B-R05-2026-11-25.md) · [Casos C04](CASOS-NEXIT-PRO-312-R02-C04-DESACTIVACION-R05-2026-11-25.md).

**Estado:** 76 casos nuevos **R03B-A01…J10**, escritos como código en `lib/facturacion/e03-evidencias.casos.ts` y registrados en el runner (`scripts/casos-clientes/run.js`). **No se ejecutaron en esta entrega** (orden: sin pruebas manuales, lint, build, typecheck ni SQL). El CI automático preexistente los ejecuta en el push; su resultado se informa aparte y **no es homologación**.

## 1. Trazabilidad de los 523 identificadores anteriores

| Bloque | IDs | Documento | Estado en Lote B |
|---|---|---|---|
| NEX-084 (R02, R02-C01, R02-C02) | 391 | `CASOS-NEXIT-PRO-312-R02-NEX-084-2026-11-24.md` | sin cambios; solo escritos |
| NEX-085 (C03) | C03-001…048 | `CASOS-NEXIT-PRO-312-R02-C03-NEX-085-2026-11-25.md` | sin cambios; solo escritos |
| Desactivación (C04, C04-C01) | C04-001…084 | `CASOS-NEXIT-PRO-312-R02-C04-DESACTIVACION-R05-2026-11-25.md` | sin cambios; solo escritos |
| **Total anterior** | **523** | | se conservan por referencia; ningún ID se reutiliza ni se modifica |

Acumulado PRO-312 tras Lote B: 523 + 76 = **599** identificadores. Los 523 siguen siendo casos de base descartable con `nexit_runtime` real (no los ejecuta el CI de la aplicación); los 76 nuevos son casos de aplicación con base y gateway simulados.

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
| I. Consulta en la misma cuenta | I01–I06 | Estructura R05 ausente → regla NEX-079 como hoy; presente sin EXECUTE → 503; AMBIGUA o DISTINTA → 409 sin HTTP; MISMA / SIN_REFERENCIA; error de lectura se propaga |
| J. Fuente | J01–J10 | Vía vigente intacta (4 transportes, 2 salidas saneadas); bandera en el preflight; sin fallback a NEX-080 directo; sin DML ni estado SIFEN; SQL solo con funciones públicas y tipos; logs sin parámetros; sin stock, saldos, IVA, KuDE, numeración ni límite de ítems; referencia R05 antes del gateway en la consulta; KuDE sin cambios |

## 4. Criterios para la homologación futura (VM, no ejecutados)

- **Bandera apagada:** emisión y envío idénticos a hoy; la consulta usa la referencia R05 solo si la estructura existe.
- **Bandera encendida:** preparación 503 ante cualquier falta, sin número; con todo listo, cada envío deja operación, autenticación, POST, salida y cierre en NEX-084.
- **Testigo y correlación:** el hash del testigo en la operación; el testigo nunca en tablas, logs ni respuestas.
- **Serialización (D6):** `CUERPO_NO_COINCIDE` = 0 en el diagnóstico D6-c del runbook antes de activar.
- **P y secretos:** `EVIDENCIA_CON_CREDENCIALES` y P rechazadas contadas por día; ningún secreto en P ni en la respuesta.
- **Incertidumbre:** operaciones abiertas > 10 min = 0 tras cada ventana; ningún documento con dos POST salvo R-01.
- **Tardías:** registradas sin cambiar estado ni cierre.
- **Misma cuenta:** ninguna consulta con continuidad DISTINTA o AMBIGUA llega al gateway.

## 5. Limitaciones

- La base simulada responde con los contratos leídos de NEX-084; no reproduce sus guardas (secuencia, modo, cotejo). Un desvío entre esos contratos y el código solo se detecta en la base real.
- La paridad P ↔ `interpretarRecepcion` se comprueba en una matriz de respuestas representativas, no en todas las formas posibles del gateway.
- No hay medición real de tamaños ni de serialización: queda para el runbook (D6-c, D8-B).
