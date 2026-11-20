# PRE-VM-R02-A-R01 — Correctivo de pruebas sobre `a1180f2` (entrega para auditoría)

- **Fecha:** 19/11/2026.
- **Base:** commit `a1180f20245569b464b07d4283cc3dcdf7025eb9`, CI app run 44510883707 y CI PG run 44510883726.
  - 6.526 comprobaciones; 11 fallos de casos.
  - 3 fallos de PG.
  - 1 error de lint de casos.
- **Alcance:** los ítems 1–10 de la orden PRE-VM-R02-A-R01.
- **Fuera de alcance, sin tocar:**
  - A-26 (PRO334-29, presentación visual).
  - A-29 y C-05 (verificador C1).
  - C-01 (triggers T01).
  - Bloque B (7 errores de lint de la app).
  - NEX-082.
- **Sólo se modificaron archivos de prueba:**
  - `*.casos.ts`
  - `pruebas/T26`
  - el script de la batería descartable (V0)
- **No se tocó:** código funcional, migraciones NEX-001…081, gateway, CDC, KuDE, stock, numeración ni contratos fiscales.
- **Nada ejecutado:** ni tests, ni lint, ni typecheck, ni build, ni SQL, ni CI manual. Sólo se corrió `bash -n` del script y comprobaciones de las expresiones nuevas contra el texto fuente (`node -e` con `fs.readFileSync` y regex; no ejecuta casos ni compila).

## 1. Matriz de correcciones

| # | Hallazgo CI | Archivo | Causa raíz | Corrección | Regla vigente comprobada |
|---|---|---|---|---|---|
| 1 | E04: `ReferenceError: string is not defined` y error de lint en la línea 531 | `entrega-e04.casos.ts` | En R02-A, el reemplazo de `leerCuerpoFactura(...) as CuerpoFactura` por `cuerpoValido(...)` dejó suelta la intersección `& { nombreVendedor?: string }`. Eso es una expresión binaria con un tipo, que falla al parsear y al ejecutarse. Era el único resto de ese reemplazo. | Se restituye `as CuerpoFactura & { nombreVendedor?: string }`. | E1-17 sin cambios |
| 1b | Error de tipo TS7053 (no informado como fallo, pero rompe la compilación de los casos) | `contrato-fe-simulado.casos.ts:58` | La unión de tipos del mapa de vendedores no admitía índice `string`. | Se anota `Record<string, {nombre, apellido, empresaId?}>`. | Sin cambio de comportamiento |
| 2 | Comprobaciones posteriores de E04 | `entrega-e04.casos.ts` | La excepción del ítem 1 abortaba la suite después de E1-17. | Se recuperan al corregir el ítem 1 (ver §3). | — |
| 3 | F-01: `EXCEPCIÓN … número de casa … (D218) … no se reemplaza por 0` | `facturacion.casos.ts` | Tres casos seguían esperando el reemplazo por 0, regla revocada (`payload-fe.ts::erroresDomicilioReceptor`, decisión REQ §4.2): «número de casa» con `""` y `"S/N"` → 0; B2F con número vacío → 0; «campos opcionales» con 7 dígitos → 0. `construirPayloadFE` ahora lanza la excepción, que abortaba la suite. | Ver detalle debajo de la tabla. | D218: de 1 a 6 dígitos, nunca un 0 inventado; nacional completo o vacío; B2F con calle y número obligatorios |
| 4a | PRO-93: «guardar en Productos» ocurre después de reservar y antes de transmitir → `false` | `ajuste-fiscal.casos.ts` | Se buscaba la llamada `enviarDocumento(db, empresaId, usuarioId, documentoId, dep)`. Desde PRO-342-R02 (F002) la llamada es `…, dep, { config })`, la misma configuración del preflight. `indexOf` devolvía -1 y la desigualdad daba falso. | Ver detalle debajo de la tabla. | PRO-93 (orden y aislamiento) + PRO-342-R02 F002 |
| 4b | PRO-128 CA-01 «Operación a la vista» | `rediseno.casos.ts` | El rótulo del combo es «Sucursal / Establecimiento *» (PRO-93 R01: código SIFEN primero). Los otros 8 rótulos, la ausencia de `<details>` y el cambio condicional ya se cumplían. | Se exige el rótulo vigente. | ORD PRO-93 integral §1 |
| 4c | PRO-128 «Operación conserva el cuerpo hacia la API» | `rediseno.casos.ts` | El cuerpo intercala `...(fechaEmision ? { fechaEmision } : {})` entre presencia y moneda (PRO-294 / NEX-073). | Se admite ese segmento en el mismo orden. El resto del cuerpo se exige igual. | PRO-294 |
| 4d | PRO-128 pedirMoneda / pedirCondicion / alertdialog | `rediseno.casos.ts` | 9 de las 10 sub-condiciones se cumplían (diálogo, foco en «Cancelar», Escape, Confirmar). La única que fallaba era `setLineas(...)`: el cambio de moneda usa `aplicarLineas(...)` (PRO-339-R02, alta atómica). | Se exige `aplicarLineas` con la misma regla «sin convertir precios» (precio de lista y descuento conservado). | PRO-339-R02 |
| 4e | E05-31 «Establecimiento NNN» | `visual-codigos-e05.casos.ts` | La lista de sucursales muestra `{s.establecimiento} — {s.nombre}` («001 — Casa central», PRO-93 R01). El formato anterior «nombre · Establecimiento NNN» fue sustituido. Cabecera y revisión siguen usando `etiquetaEstablecimiento`. | Ver detalle debajo de la tabla. | ORD PRO-93 integral §1 |
| 5 | KUDE-21: nombre sin `-NO-VERIFICADO` | `kude.casos.ts` | Desde PRO-342-R05 (gate R05-5), `obtenerKude` no devuelve `CDC_REGISTRADO`. Todo PDF aceptado es NO_VERIFICADO y cada descarga (consulta nueva) se nombra `…-NO-VERIFICADO.pdf` (`kude-visor.ts::nombreSegun`). | Ver detalle debajo de la tabla. | PRO-342-R02/R05 |
| 6 | CORE-04: POST directo con Cuotas `[true,0,true,0,1]` | `credito.casos.ts` | Ver §2. | **Caso sin modificar.** El fallo queda pendiente de la decisión de auditoría. | Matriz FE CORE-04 |
| 7 | T26: `violates check constraint documentos_electronicos_estados_chk` (psql:249) | `pruebas/T26-nex062-nce.sql` | El fixture ZERO-01 insertaba `ENVIO_INDETERMINADO` + `PENDIENTE`. NEX-047 sólo admite un `estado_sifen` distinto de `SIN_CONSULTA` con `estado_local = 'ENVIADO'`. El bloque abortaba. | Ver detalle debajo de la tabla. | NEX-047, NEX-062, NEX-077 |
| 8 | Casos posteriores no evaluados | — | Ver §3. | — | — |
| 9 | V0: el OK no miraba el código de salida | `scripts/ejecutar-pruebas.sh` | El resultado positivo dependía sólo de `count(*) = 0`. Un aborto de la transacción (base no descartable, usuarios presentes, error SQL) podía pasar como OK si el conteo daba 0. | Ver detalle debajo de la tabla. | Entorno descartable |
| 10 | Correcciones anteriores | — | — | Las correcciones de R02-A no se revierten (vendedor, contrato simulado, caché por suite, T25, C-02…C-04). | — |

Detalle de las correcciones más largas:

- **#3, D218 (`facturacion.casos.ts`).**
  - «Número de casa (D218)»:
    - positivos: `"45"` → 45 y `"123456"` → 123456;
    - negativos: `""`, `"S/N"`, `"1234567"` y `"12a"` dan el error D218 en la validación y la excepción D218 en el payload;
    - un domicilio totalmente vacío da `null`.
  - B2F:
    - el fixture lleva el número 77, que viaja en el JSON;
    - sin `cDepRec/cDisRec/cCiuRec`;
    - con número vacío o «S/N», error D218.
  - «Campos opcionales»: número de 6 dígitos que se conserva.
- **#4a, PRO-93 (`ajuste-fiscal.casos.ts`).**
  - Se compara contra la llamada vigente.
  - Se exige además que la llamada exista.
  - Se exige que se conserven la idempotencia (`reutilizado → OMITIDO`) y el `try` de la transmisión posterior al guardado.
- **#4e, E05-31 (`visual-codigos-e05.casos.ts`).**
  - Se exige «Establecimiento NNN» en la cabecera (con «· Punto») y en la revisión.
  - Se exige «NNN — nombre» en la lista.
  - Se exige que no vuelva el formato antiguo.
- **#5, KUDE-21 (`kude.casos.ts`).**
  - Se espera el nombre `-NO-VERIFICADO`, y se exige además `pertenencia = NO_VERIFICADA` y el nombre base del visor intacto.
  - Se mantienen:
    - las 3 solicitudes;
    - una URL propia por descarga;
    - Imprimir sin nueva solicitud;
    - «INACTIVA»;
    - 21b (bytes íntegros) y 21c (liberación de URL).
- **#7, T26 (`pruebas/T26-nex062-nce.sql`).**
  - El fixture pasa a `ENVIO_INDETERMINADO` + `SIN_CONSULTA`: es coherente y sigue siendo reservable (NEX-062/077: `ENVIADO|ENVIO_INDETERMINADO` × `SIN_CONSULTA|PENDIENTE|NO_RECONOCIDO`).
  - La aserción «el reservar no cambia el estado fiscal» se refuerza: el estado local y el fiscal siguen siendo `ENVIO_INDETERMINADO / SIN_CONSULTA`.
  - Se conservan lease, actor autorizado y aislamiento.
- **#9, V0 (`scripts/ejecutar-pruebas.sh`).**
  - `RC_V0` se inicializa en 1 y toma el `$?` de psql (`-1`, `ON_ERROR_STOP`).
  - El OK exige `RC_V0 = 0` **y** 0 empresas.
  - La FALLA informa el código de salida y el conteo.

## 2. CORE-04: análisis sin modificar código ni caso

- **Observación.** En el POST directo con Cuotas, `crearFacturaElectronica` hace UNA consulta antes del rechazo (`SELECT 1 … FROM documentos_electronicos WHERE empresa_id = $1 AND clave_idempotencia = $2`).
  - La consulta es de sólo lectura y está filtrada por empresa.
  - Se origina en `const historico = (await documentoExiste()) ? … : null` (`emision.ts`, introducido en `a22e511`, PRO-322-R02 F002).
  - El rechazo de Cuotas ocurre después, dentro de `prepararFactura`.
  - Sin escrituras, sin `fe_documento_crear_fe` (`creaciones() = 0`) y con 422 dirigido; se cumplen los otros cuatro valores esperados.
- **Contradicción interna.** El comentario de `emision.ts` dice que la consulta es «perezosa: se hace después de las validaciones previas (p. ej. Cuotas suspendidas se rechaza sin tocar la base)». Desde PRO-322-R02 eso ya no es cierto: la lectura de existencia se adelantó para decidir `domicilioHistorico` antes de validar el domicilio.
- **Texto contractual.** La matriz maestra FE (`documentacao/v1/MATRIZ-MAESTRA-FE-TELA-JSON-SQL-SIFEN-2026-10-15.md`, CORE-04) exige:
  > «Cuotas no visibles ni aceptadas para nuevas emisiones por POST directo, respuesta dirigida antes de NEX-048, sin romper consulta de documentos históricos».
  - No exige «cero consultas».
  - El valor `malFecha.b.llamadas.length = 0` es una exigencia más estricta del caso (y del comentario), no del contrato.
- **Decisión.** Siguiendo la orden, no se modifica el código funcional ni se relaja el caso. CORE-04 seguirá fallando (1 fallo conocido) hasta que la auditoría elija:
  - **(A) Ajustar sólo el caso al contrato.** Se exigiría que la única consulta previa al rechazo sea esa lectura de idempotencia, de sólo lectura y por empresa: sin escrituras, sin `fe_documento_crear_fe` y con 422 dirigido.
  - **(B) Orden funcional focal.** En `crearFacturaElectronica`, rechazar Cuotas antes de la lectura de existencia, y alinear el comentario. Requiere autorización de código funcional (`emision.ts`) y revisar que no altere el reintento idempotente de una FE histórica.
- **Recomendación:** (A). La regla contractual (rechazo antes de NEX-048) se cumple, y (B) toca un camino de idempotencia ya auditado.

## 3. Comprobaciones recuperadas

- **E04 (`entrega-e04`):** dejan de abortar todas las comprobaciones posteriores a E1-17:
  - E1-18 en adelante;
  - EN-* restantes;
  - todo el bloque PRO-328 (PRO328-01…5x), incluidos los rechazos D218 de la dirección seleccionada (PRO328-30/31);
  - el bloque estructural SQL/emisión (EN-53).
- **F-01 (`facturacion`):** dejan de abortar todas las comprobaciones posteriores al caso de número de casa (AUD-FE-03 en adelante):
  - pago, NEX-048/049/050;
  - E1 (receptor, innominado, B2F, opcionales);
  - catálogos y contrato de cabecera.
- **T26:** se recuperan las comprobaciones de ZERO-01 (W01, lease, W03 con creador bloqueado, estado fiscal) y el bloque ZERO-02 (FX01…FX06).
- **V0:** el OK ahora también certifica que la limpieza terminó sin error.

## 4. Revisión estática de los casos antes no evaluados

- Se buscaron en las zonas antes abortadas de `facturacion.casos.ts` y `entrega-e04.casos.ts` las expectativas que cambiaron en rondas anteriores:
  - `setLineas`;
  - rótulo «Sucursal *»;
  - firma de `enviarDocumento` de 5 argumentos;
  - nombres de KuDE sin «-NO-VERIFICADO»;
  - `CDC_REGISTRADO` / `cdcCoherente`;
  - número de casa → 0;
  - vendedor = usuario emisor.
- No se encontró otra expectativa obsoleta. La referencia «CDC informado de 44 dígitos» de NEX-050 comprueba el texto de una migración histórica inmutable, y se mantiene.
- Los fixtures de receptor de las demás suites FE (pagos, monedas, crédito, descuentos, rediseño) usan números de casa válidos. Esas suites ya se evaluaban en CI.

## 5. Limitaciones

- Nada se ejecutó. El resultado depende del CI de GitHub Actions.
- **Resultado esperado por el análisis:**
  - Casos: quedan corregidos 8 de los 11 fallos: F-01, PRO-93, PRO-128 ×3, KUDE-21, E04 y E05-31. Siguen fallando 3: CORE-04, pendiente de decisión (§2); PRO334-29 (A-26) y el verificador C1 (A-29), los dos fuera de alcance.
  - Lint de casos: queda corregido el error nuevo de la línea 531 de E04.
  - PG: de los 3 fallos, sólo T26 estaba en alcance y queda corregido. T01 (C-01, triggers) y C1 (C-05) siguen fallando: están fuera de alcance.
  - V0: no fallaba; se endurece su criterio de OK.
  - El bloque B (7 errores de lint de la app) no se toca.
- Las suites que vuelven a correr completas (E04 desde E1-18; F-01 desde AUD-FE-03; T26 ZERO-01/02) pueden mostrar fallos que estaban ocultos por el aborto. La revisión estática del §4 no los encontró, pero no sustituye la ejecución.
