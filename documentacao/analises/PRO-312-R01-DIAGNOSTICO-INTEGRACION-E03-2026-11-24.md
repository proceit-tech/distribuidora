# PRO-312-R01 — Diagnóstico de integración E03 (evidencias HTTP y versiones fiscales)

**Fecha:** 24/11/2026 · **Orden:** [ORD-CLAUDE-NEXIT-PRO-312-R01](../ordens/ORD-CLAUDE-NEXIT-PRO-312-R01-EVIDENCIAS-VERSIONES-2026-11-24.md) · **Rama:** `feature/NEXIT-2026-001-banco-demo` (PR #7 Draft) · **Base leída:** `0926601711bac36a018f9cd145e202bea994a76e`.

**Naturaleza:** diagnóstico y diseño técnico, exclusivamente documental. No se modificó código, SQL, migraciones, casos ejecutables, runner ni configuración. No se ejecutaron pruebas, lint, typecheck, build, SQL, gateway, Docker, VM ni CI manual. Todo lo que sigue es **análisis estático** del repositorio en la base indicada: no prueba el estado real de la base de datos de la VM. La afirmación «NEX-001..083 instaladas» proviene de la orden y del registro VM informado por el responsable; Claude no la verificó.

**Fuera de alcance (no iniciado):** PRO-312-R02, PRO-311 (E09, versión V2 tras RECHAZADO), PRO-313/PRO-199 (cancelación), PRO-324, PRO-323, PRO-309/310. No se levantó ningún gate fiscal.

---

## 1. Resumen ejecutivo

1. **NEX-072 está inerte y desactualizada respecto del flujo vigente.** La aplicación envía y registra con `fe_documento_iniciar_envio` (NEX-062) + `fe_documento_registrar_envio_r05` (NEX-080). Ningún módulo llama a `fe_e03_*` (búsqueda en `*.ts`, `*.js`, `*.sql`: solo aparecen en NEX-072 y en comentarios de NEX-073/074).
2. **`fe_e03_iniciar_envio` y `fe_e03_registrar_evento` son reutilizables** con el flujo vigente (envuelven la `fe_documento_iniciar_envio` vigente de NEX-062, no tocan CDC ni lote).
3. **`fe_e03_cerrar_envio` es INCOMPATIBLE con NEX-079/080 y no debe usarse.** Delega en la firma de 15 parámetros de NEX-050 (NEX-072:656), que: recorta y trunca el lote (NEX-050:90), lo atribuye al documento aunque el envío sea indeterminado o de error (NEX-050:110 y 115), valida el CDC con `fe_cdc_coherente` (NEX-050:117), no registra la conexión del intento (NEX-079) ni la proyección R05 del CDC (NEX-080). Además su verificación de recepción (`fe_e03_recepcion_confirmada`, NEX-072:226–318) exige CDC de 44 dígitos coherente (NEX-072:295–296), contradiciendo PRO-342-R05 (CDC dato opaco).
4. **Hace falta una migración incremental nueva** (propuesta: **NEX-084**, a reconfirmar libre antes de crearla) que agregue un cierre R05 (`fe_e03_cerrar_envio_r05`) delegando en `fe_documento_registrar_envio_r05` con `p_conexion`, y una verificación de coherencia de recepción alineada con R05 (sin regla de CDC, lote literal, ecos solo en la raíz). NEX-001..083 quedan intactas.
5. **Hoy toda solicitud es versión 1**: todas las funciones de emisión insertan `version = 1` (NEX-048:162, NEX-060:204, NEX-062:347, NEX-063, NEX-065, NEX-070:281, NEX-073:121, NEX-080:623). La vista «Mostrar todos los reprocesamientos» puede construirse ya, pero mostrará una fila por documento hasta que PRO-311 cree versiones V2. No se inventan versiones históricas.
6. **El JSON registrado y el JSON transmitido son cosas distintas y hoy solo se conserva el registrado.** El POST se serializa dentro de `enviar()` con `JSON.stringify(body)` (gateway.ts:560) a partir del objeto que node-pg reconstruye del `jsonb`; su texto exacto y su hash no se guardan. `payload_hash` (NEX-048) es el SHA-256 del texto `jsonb` canónico, no de los bytes enviados.
7. **Arquitectura recomendada (alternativa A):** reutilizar INICIO/eventos de NEX-072, nuevo cierre R05 en NEX-084, instrumentación en `envio.ts`/`gateway.ts` con serialización única del cuerpo, evento POST_INTENTADO durable antes de cada `fetch`, salida HTTP o error de transmisión después, y cierre atómico con el intento. Sin reenvío ciego: toda incertidumbre (respuesta sin registrar, cierre perdido, timeout) termina en `ENVIO_INDETERMINADO` y se resuelve por consulta, nunca por un segundo POST.
8. **Siguiente etapa recomendada:** PRO-312-R02 = **Lote A** solamente (autoría de NEX-084 + preflight/verificación/reversión + casos SQL escritos), sin aplicarla, con auditoría previa de las decisiones D1–D8 (sección 12).

---

## 2. Inventario leído (archivos completos vigentes, uno por vez)

| Archivo | Líneas | Qué se verificó |
|---|---|---|
| `lib/facturacion/envio.ts` | 251 | Preflight, inicio, transmisión, cierre, recuperación de cierre perdido |
| `lib/facturacion/gateway.ts` | 1260 | `enviar`, token, `enviarDocumentoGateway`, `interpretarRecepcion`, saneamiento, contrato fiscal de envío, referencia de conexión |
| `lib/facturacion/shared.ts` | 678 | NEX-080 obligatoria, `registrarR05`, listado, indicadores, intentos paginados, solicitudes, consulta |
| `lib/facturacion/consulta-automatica.ts` | 179 | Reserva con token, consulta, reprogramación |
| `app/api/documentos/**/route.ts` | — | Listado, detalle, intentos, solicitud, respuesta, enviar, consultar |
| `app/api/facturas/route.ts`, `app/api/notas-credito/route.ts`, `lib/facturacion/nce-emision.ts` | — | Emisión FE/NCE y envío inicial (ambas pasan por `enviarDocumento`) |
| `app/(private)/documentos/page.tsx` | 1366 | KPI, fila, historial técnico, solicitudes, historial de intentos |
| NEX-047, 048, 050, 054, 062, 072, 077, 079, 080 | — | Tablas, firmas, transacciones, grants |
| `documentacao/definicoes/ESPEC-NEXIT-FE-E03-HISTORICO-REPROCESSAMENTOS-R03-2026-10-25.md` | — | Reglas R01–R07 aprobadas |
| `documentacao/testes/AUD-CHATGPT-NEXIT-PRO-312-313-199-324-323-2026-11-24.md` | — | Punto de partida de la revisión focal |

---

## 3. Camino real vigente (FE y NCE)

### 3.1 Emisión y envío inicial

```
UI «Enviar factura» / «Emitir NCE»
  → emitirFactura (envio.ts:211) | emitirNce (nce-emision.ts:84)
      1. configuracionGateway (envio.ts:74): exigirNex080 (shared.ts:49) → config + credenciales (UNA por operación, PRO-342-R02)
      2. crearFacturaElectronica / fe_documento_crear_nce: documento + solicitud version=1 + baja de stock comercial (FE, NEX-067) — idempotente por clave
      3. enviarDocumento (envio.ts:174)
           a. fe_documento_iniciar_envio (NEX-062:358, sentencia autónoma, fila FOR UPDATE)
                → ENVIANDO + payload de la versión MÁS ALTA; ENVIANDO < 2 min ⇒ NEX:ENVIO_EN_CURSO; ENVIANDO ≥ 2 min ⇒ ENVIO_INDETERMINADO (devuelve INDETERMINADO)
           b. enviarDocumentoGateway (gateway.ts:1010), FUERA de transacción:
                login (gateway.ts:619; nunca es POST del documento) → POST /api/recepcion_de (gateway.ts:1031)
                → si token inválido en el 1.er POST: login forzado + 2.º POST (gateway.ts:1040–1043)
                → interpretarRecepcion (gateway.ts:897) → resultadoFiscalSinSecretos (gateway.ts:1055)
           c. cerrarEnvio (envio.ts:136) → fe_documento_registrar_envio_r05 (NEX-080:309) con conexión
                (intento ENVIO + estado_local + lote literal solo con ENVIADO + proyección CDC solo con ENVIADO)
```

- **Reenvío manual** (`POST /api/documentos/[id]/enviar`): mismo `enviarDocumento` con `confirmaRechazo`; solo desde `PENDIENTE_ENVIO`/`ERROR_ENVIO`. Un `RECHAZO` del gateway exige confirmación explícita en FE (NEX-062:395–397) y está prohibido en NCE (NEX-062:391–393). `ENVIO_INDETERMINADO` nunca se reenvía (NEX-062:378–380).
- **Consulta** (manual `consultar/route.ts`, flujo NCE, automática `consulta-automatica.ts:81,111,134`): `consultarEstado` (shared.ts:558) → `fe_documento_registrar_consulta*_r05` (NEX-080:280–305). Solo lectura en el gateway; no reenvía; no toca stock.

### 3.2 Diferenciación de resultados (vigente)

| Resultado | Dónde se decide | `estado_local` | ¿Cambia estado fiscal? |
|---|---|---|---|
| ACK del gateway (status `success` + `nro_lote` o eco del número en la raíz) | gateway.ts:980–996 | `ENVIADO` | **No.** `estado_sifen` solo lo fija la consulta (envio.ts:17) |
| Rechazo técnico del gateway atribuido al documento | gateway.ts:953, 959, 972, 978 | `ERROR_ENVIO` (`RECHAZO`) | No (no es RECHAZADO SIFEN) |
| Autorización/429 | gateway.ts:956, 967, 968, 1027 | `ERROR_ENVIO` (`AUTENTICACION`/`TRANSITORIO`) | No |
| HTTP 5xx, 408/409/423/425, duplicado, ecos ajenos, respuesta ininterpretable | gateway.ts:961–966, 987–1003 | `ENVIO_INDETERMINADO` | No |
| Timeout / red durante el POST | gateway.ts:1033–1039 | `ENVIO_INDETERMINADO` | No |
| Fallo interno tras iniciar | envio.ts:195–202 | `ENVIO_INDETERMINADO` | No |
| Fallo local al registrar | envio.ts:140–165 | `ENVIO_INDETERMINADO` o 502 | No |
| Estado fiscal (`APROBADO`, `RECHAZADO`, intermedio «XML firmado»…) | consulta → NEX-080 núcleo | `ENVIADO` | Sí, solo por consulta |

---

## 4. Funcionalidades existentes (se preservan; no se rehacen)

| Funcionalidad | Fuente vigente |
|---|---|
| JSON fiscal registrado por versión (solo metadatos en el listado, JSON bajo demanda) | shared.ts:456–483; `solicitud/route.ts`; page.tsx:1243–1254 («Solicitud registrada (no necesariamente transmitida)») |
| Historial paginado de intentos (cursor `creado_at`+`id`, 100 por página) | shared.ts:413–527; `intentos/route.ts`; page.tsx:1275–1315 |
| Respuestas JSON saneadas bajo demanda | gateway.ts:350–372, 1055; shared.ts:486–498 |
| Código HTTP, fecha/hora, usuario responsable | `documento_electronico_intentos` (NEX-047:125–142) + `actorNombre` (shared.ts:446) |
| Lote y CDC informado literal + proyección | NEX-080:309–362; shared.ts:434–439 |
| Consulta manual y automática FE/NCE con lease/token | shared.ts:558; consulta-automatica.ts; NEX-077 |
| Concurrencia e idempotencia del envío | NEX-062:358–404 (fila bloqueada, ENVIANDO, 2 min); clave de idempotencia de emisión |
| Continuidad de la cuenta del gateway | gateway.ts:64–112; shared.ts:77–104 |
| Cuatro indicadores por documento (Envío · XML/CDC · SIFEN · Correo) y KPI | page.tsx:874–896; shared.ts:167–176, 290 |
| KuDE sin validación por CDC (C02-C02) y F03 «Cancelado» | gateway.ts:1061–1067; `documentos-copy-operador.ts` |

E01, E02 y E08 no se vuelven a desarrollar.

---

## 5. Compatibilidad de NEX-072 con el flujo vigente

### 5.1 Firmas comparadas

| Función | Firma NEX-072 | Delegada en | Firma vigente usada por la app |
|---|---|---|---|
| `fe_e03_iniciar_envio` | `(uuid, uuid, uuid, boolean)` → `o_resultado, o_payload, o_numero, o_tipo, o_establecimiento, o_punto, o_version, o_payload_hash, o_operacion_id` (NEX-072:325–326) | `fe_documento_iniciar_envio(uuid,uuid,uuid,boolean)` | La MISMA (NEX-062:358, redefinida sobre NEX-050:35). **Compatible.** |
| `fe_e03_registrar_evento` | `(uuid, uuid, uuid, uuid, text, smallint, text, integer, jsonb, boolean, text)` (NEX-072:368–371) | — | Sin equivalente (no existe evidencia por POST). **Compatible** (ver limitaciones 5.3) |
| `fe_e03_cerrar_envio` | `(uuid, uuid, uuid, uuid, text, text, text, text, integer, text, text, text, text, text, text, jsonb)` (NEX-072:548–551) | `fe_documento_registrar_envio` **15 parámetros (NEX-050:82)** | `fe_documento_registrar_envio_r05` **15 parámetros distintos (NEX-080:309)**: sin `p_cdc`, con `p_conexion` (envio.ts:96–97). **Incompatible.** |

### 5.2 Matriz de compatibilidad (con línea y consecuencia)

| ID | Elemento NEX-072 | Regla vigente | Incompatibilidad concreta | Consecuencia si se usara tal cual |
|---|---|---|---|---|
| C-01 | `fe_e03_cerrar_envio` → NEX-050 (072:656) | Registro R05 (NEX-080:309–362) | Cierra con la función anterior a R01/R03/R05 | Se pierde todo lo de NEX-079/080 en ese intento (C-02…C-06) |
| C-02 | NEX-050:90 `left(nullif(btrim(p_lote),''),60)` | Lote literal sin recortar (NEX-079:198–199; NEX-080:317) | Recorta espacios y trunca a 60 | Lote del documento distinto del informado |
| C-03 | NEX-050:110 y 115 (lote en intento y documento sin condición) | Lote solo con ACK `ENVIADO` (NEX-079:219, 227; NEX-080:343, 358) | Atribuye lote de respuesta indeterminada/de error/de otro documento | Regresión PRO-342-R03 (lote ajeno fijado al documento) |
| C-04 | NEX-050:117 `fe_cdc_coherente` | CDC dato opaco, proyección R05 (NEX-080:166–190) | Un CDC no coherente no se proyecta; uno coherente se fija sin traza | Regresión PRO-342-R05; sin `cdc_proyeccion`/`cdc_anterior` |
| C-05 | NEX-050:109–110 (sin `conexion`) | Conexión no secreta por intento (NEX-079:44–61, 218–220) | Intento sin referencia de conexión | `continuidadConexion` = `SIN_REFERENCIA` para ese documento (gateway.ts:94–112): consulta y KuDE pierden la verificación de cuenta |
| C-06 | 072:295–296 CDC `^[0-9]{44}$` + `fe_cdc_coherente` en `fe_e03_recepcion_confirmada` | El CDC no decide la recepción (gateway.ts:986, 998) | Un ACK con CDC opaco (no 44 dígitos o no «coherente») invalida el cierre OK | `NEX:CIERRE_CONTRADICTORIO` (072:616) cuando la app clasificó `ENVIADO`: el cierre falla, el documento queda `ENVIANDO` y a los 2 min `ENVIO_INDETERMINADO` |
| C-07 | 072:620–621 `p_cdc`/`p_cdc_informado` comparados con `btrim` (072:223) | Igualdad literal | CDC con espacios no coincide | Mismo efecto que C-06 |
| C-08 | 072:285–290 lote buscado a cualquier profundidad | Lote solo en la RAÍZ (gateway.ts:781–795, 917) | Un `Nota.lote` anidado cuenta (o invalida) | Divergencia con la app: el banco acepta o rechaza por rutas que la app no reconoce |
| C-09 | 072:302–315 ecos `dEst/dPunExp/dNumDoc` a cualquier profundidad, sin serie ni tipo | Ecos solo de la raíz, incluidos `dSerieNum` y `tipoDoc` (gateway.ts:942–947) | Reglas distintas de identidad | Divergencia; el banco puede confirmar con un eco anidado que la app ignora |
| C-10 | 072:261–282 `OtrosDocumentosOmitidos` ≠ 0 o Aceptados ajenos invalidan | La app confirma si `Aceptados` incluye este número aunque haya otros (gateway.ts:989–991) | Política distinta | ACK válido de la app rechazado por el banco (C-06) |
| C-11 | 072:241 `p_respuesta ? 'truncado'` invalida | La app interpreta el cuerpo bruto y guarda `{truncado:true}` si supera 30 000 caracteres (gateway.ts:135, 366–372) | La evidencia truncada no permite verificar | Cierre OK rechazado en respuestas grandes |
| C-12 | 072:610–612 cierre OK exige `p_fase = 'TRANSMISION'` y 2xx del último POST | Coincide con la app (gateway.ts:1047) | — | Compatible |
| C-13 | 072:624–628 cierre `AUTENTICACION` exige NO_TRANSMITIDO o salida HTTP del último POST | Login fallido antes de POST (gateway.ts:1023–1028) o tras 401 | Compatible si la app registra NO_TRANSMITIDO antes | — |
| C-14 | 072:629–648 fase TRANSMISION sin POST registrado ⇒ contradicción | La app cierra «sin credenciales»/fallo interno como `RED`/`TRANSMISION`/indeterminado (envio.ts:193–202) aunque no haya habido POST | El cierre conservador actual no es expresable | El caso «sin credenciales tras iniciar» debe reformularse (decisión D4) |
| C-15 | 072:634–648 reglas del cierre según la salida del último POST | Respaldo mínimo `RESPUESTA_INVALIDA`/`ENVIO_INDETERMINADO` con `r.http` (envio.ts:155) | Con ERROR_TRANSMISION exige `TIMEOUT`/`RED`; con POST sin salida exige `http` nulo | El respaldo actual puede ser rechazado: hay que derivarlo de la evidencia (sección 7.4) |
| C-16 | 072:415–417 eventos solo con `ENVIANDO` | `ENVIANDO` ≥ 2 min pasa a indeterminado al siguiente intento de inicio (NEX-062:381–388) | Una respuesta tardía no se puede registrar | Evidencia perdida en operaciones lentas (riesgo R-03) |
| C-17 | 072:457–465 cuerpo `::jsonb` igual al snapshot | El cuerpo sale de `JSON.stringify` del objeto que node-pg reconstruye del `jsonb` | Para FE, `payload-fe.ts:163` garantiza números de ida y vuelta exactos; para NCE el payload se completa en SQL (NEX-080:365–633) | Si un numérico no sobrevive a `double` el banco rechaza el POST_INTENTADO (`NEX:CUERPO_NO_COINCIDE`) y el envío no ocurre (cerrado, pero bloquea). **No demostrado**; verificar (D6) |
| C-18 | 072:57 texto ≤ 1 MiB | FE hasta 999 líneas (`MAX_LINEAS`) | Probablemente suficiente; no medido | Si se excede, no se transmite (cerrado) |
| C-19 | 072:675–692 grants; el envoltorio `nex_aplicar_grants_runtime()` (NEX-052) reaplica `nex_aplicar_grants_facturacion_e03()` | — | Revocar `fe_e03_cerrar_envio` en otra migración se deshace al reaplicar grants | Hay que redefinir el ayudante de grants (D3) o bloquear por aplicación |
| C-20 | 072:45–46 `UNIQUE (empresa_id, documento_id, id)` en intentos | NEX-079/080 solo agregan columnas | — | Compatible |
| C-21 | 072:48–95 tabla con FK a empresas, documento, versión, actor e intento | T01/NEX-083 exige FK empresa | Tiene FK a `empresas(id)` (072:51) | Compatible |

### 5.3 Respuestas a las nueve preguntas de la orden (punto 4)

1. **Qué ya existe:** tabla append-only de eventos por operación y versión, con inmutabilidad, unicidades (un CIERRE, un POST por número, una salida por POST, NO_TRANSMITIDO terminal), redacción de secretos en defensa en profundidad, hash y bytes del POST calculados por el banco, vínculo del CIERRE con el intento, grants sin DML directo. `fe_e03_iniciar_envio` y `fe_e03_registrar_evento` son utilizables.
2. **Qué no está conectado:** las tres funciones `fe_e03_*`; ningún POST queda registrado antes del `fetch`; no se conserva el texto exacto transmitido; no hay lectura (API/UI) de la tabla de evidencias.
3. **Qué quedó desactualizado:** `fe_e03_cerrar_envio` (C-01…C-05) y `fe_e03_recepcion_confirmada` (C-06…C-11), anteriores a PRO-342-R01/R03/R05.
4. **Incompatibilidades con NEX-079/080:** C-01 a C-11 y C-19 (detalle en 5.2).
5. **Efecto de usar las funciones antiguas directamente:** regresión de lote literal y atribución de lote (R01/R03), del CDC opaco y su proyección (R05), de la conexión por intento (R01/R02) y cierres fallidos que dejan documentos `ENVIANDO` → `ENVIO_INDETERMINADO` con ACK válido; sin reenvío, pero con documentos bloqueados que exigen reconciliación manual o por consulta.
6. **¿Nueva migración?** Sí: una sola incremental (propuesta NEX-084) con el cierre R05 y la verificación de recepción R05. No se edita NEX-072.
7. **CDC como dato opaco:** el cierre nuevo delega en `fe_documento_registrar_envio_r05` (proyección solo con `ENVIADO`) y su verificación NO contiene regla alguna sobre el CDC; solo exige, si se informa `p_cdc_informado`, igualdad literal con el valor de la raíz de la respuesta persistida.
8. **Lote literal y conexión:** el lote se compara por igualdad exacta contra las claves de lote de la raíz (sin `btrim`), y se persiste por NEX-080 (literal, solo con ACK); la conexión se pasa como `p_conexion` y se normaliza con `fe_intento_conexion_segura` (NEX-079:52–61).
9. **Evitar duplicados:** un POST por evento numerado (072:101, 447–455), una salida por POST (072:102), un CIERRE por operación e idempotente (072:100, 585–590), un CIERRE por intento (072:105), operación vigente única (072:408–411); el envío sigue excluido por la fila bloqueada + `ENVIANDO` (NEX-062:381–388). La app no repite el POST de una operación salvo la renovación de token ya existente (gateway.ts:1040–1043), que queda como POST n.º 2 de la MISMA operación.

---

## 6. Evidencia almacenada hoy y lo que falta

| Dato | Hoy | Falta / observación |
|---|---|---|
| Documento y versión | Documento sí; versión solo en `documento_electronico_solicitudes` (siempre 1) | El intento ENVIO no indica qué versión se transmitió |
| Identidad de la operación | No existe | `operacion_id` (NEX-072) |
| Hash de la solicitud | `payload_hash` = SHA-256 de `payload::text` jsonb (NEX-048:162) | Hash de los bytes UTF-8 efectivamente transmitidos (`solicitud_sha256`, NEX-072:468–470). No son iguales: `jsonb::text` normaliza espacios y orden de claves; `JSON.stringify` no |
| Inicio del envío | `envio_iniciado_at` en el documento (se sobrescribe) | Evento INICIO inmutable |
| Solicitud HTTP intentada | No se guarda | Texto exacto del cuerpo antes del `fetch` (POST_INTENTADO) |
| Respuesta HTTP saneada | Solo la del último POST en el intento de cierre (envio.ts:137) | Una por POST (incluido el 401 previo a la renovación) |
| Código HTTP | Último POST (`http_status`) | Por POST |
| Error de comunicación / timeout | Mensaje en el intento de cierre | Por POST (ERROR_TRANSMISION) |
| Resultado indeterminado | `estado_local` + intento | Igual; con evidencia de por qué |
| Solicitud no transmitida | Solo implícito (fase AUTENTICACION) | NO_TRANSMITIDO explícito |
| Cierre | Intento ENVIO | CIERRE enlazado al intento |
| Conexión | `conexion` en el intento (NEX-079) | Igual (no secreta) |
| Usuario, fecha y hora | `actor_id`, `creado_at` | Igual en cada evento |
| Secretos | Login `{ruc,password}` nunca se guarda; Bearer solo en cabecera; respuesta saneada (gateway.ts:255–348) | Igual: el texto POST es solo el cuerpo fiscal; jamás cabeceras ni el login |

Límites: texto de solicitud ≤ 1 MiB (072:57); respuesta saneada `jsonb` < 64 KiB (072:61; NEX-047:137); la app reemplaza respuestas > 30 000 caracteres por `{truncado:true}` (gateway.ts:371). El `respuesta_sha256` de NEX-072 es el hash del objeto saneado persistido, no del cuerpo HTTP bruto (072:107–109): así debe rotularse.

**No se afirma que un JSON persistido haya sido transmitido.** Para los documentos anteriores a la instrumentación no existe evidencia de transmisión y no se reconstruye (sin backfill, 072:14).

---

## 7. Arquitectura propuesta (E03-A2)

### 7.1 Alternativas evaluadas

| Alternativa | Descripción | Evaluación |
|---|---|---|
| **A (recomendada)** | Reutilizar `fe_e03_iniciar_envio` y `fe_e03_registrar_evento`; nueva migración NEX-084 con `fe_e03_cerrar_envio_r05` (delega en `fe_documento_registrar_envio_r05` + CIERRE) y `fe_e03_recepcion_coherente_r05`; redefinir el ayudante de grants E03 para dejar de conceder el cierre antiguo | Mínima, aditiva, conserva R01/R03/R05, una sola fuente de cierre y estado. Requiere aplicar NEX-084 antes de activar la instrumentación |
| B | Usar NEX-072 tal cual | Rechazada: regresiones C-01…C-11 |
| C | Sin SQL nueva: guardar evidencias dentro de `intentos.respuesta` desde la app | Rechazada: los intentos solo se insertan en el cierre con `ENVIANDO`; no hay registro durable ANTES del POST ni por POST; mezclaría evidencia y estado |
| D | `CREATE OR REPLACE fe_e03_cerrar_envio` en NEX-084 con la misma firma | Desaconsejada: la firma no tiene `p_conexion` y tiene `p_cdc` doble; cambiarla exige `DROP FUNCTION` de un objeto de NEX-072 y altera en el mismo nombre un comportamiento ya auditado |

### 7.2 Contenido propuesto de NEX-084 (sin crear SQL ahora)

1. **Preflight:** exige NEX-072 (tabla + 3 funciones) y NEX-080 (`fe_documento_registrar_envio_r05` con `p_conexion`, `fe_intento_conexion_segura`); aborta si ya está aplicada; verifica que `schema_migrations` no tenga NEX-084.
2. **`fe_e03_recepcion_coherente_r05(p_respuesta jsonb, p_doc …, p_lote text, p_cdc_informado text) → boolean`** (privada): coherencia **mínima, sin reinterpretar**: raíz objeto con `status = "success"`; si `p_lote` no es nulo, igual LITERAL a una clave de lote de la RAÍZ (`nro_lote`, `lote`, `numero_lote`…, misma normalización de nombres que `CLAVES_LOTE_RAIZ`); si no hay lote, eco de la raíz `dEst`/`dPunExp`/`dNumDoc` igual al documento; si `p_cdc_informado` no es nulo, igual LITERAL a la clave `cdc` de la raíz; ninguna regla de forma ni coherencia del CDC; ningún recorrido en profundidad. Es un subconjunto de lo que la app acepta (nunca acepta más).
3. **`fe_e03_cerrar_envio_r05(p_empresa, p_usuario, p_documento, p_operacion, p_fase, p_resultado, p_estado_local, p_error_tipo, p_http, p_request_id, p_estado_gateway, p_mensaje, p_lote, p_cdc_informado, p_respuesta, p_conexion)`**: misma estructura que 072:548–668 (permiso, documento bloqueado, idempotencia por operación, operación vigente, reglas por fase y salida del último POST), sustituyendo la verificación del OK por (2) y la delegación por `fe_documento_registrar_envio_r05(…, p_conexion)`; enlaza el intento insertado y escribe CIERRE en la misma transacción.
4. **Grants:** `CREATE OR REPLACE nex_aplicar_grants_facturacion_e03()` para conceder iniciar/registrar/cerrar_r05 y **revocar** `fe_e03_cerrar_envio` de `nexit_runtime` (así el envoltorio de NEX-052 no la vuelve a conceder; D3). Grant nuevo `nex_aplicar_grants_facturacion_e03_r05()` si se prefiere no redefinir.
5. **Scripts:** `preflight-NEX-084.sql`, `verificar-NEX-084.sql`, `reversion-NEX-084.sql` (reversión protegida: aborta si hay CIERRE R05 registrados). Nota: NEX-072 no tiene scripts propios de preflight/verificación/reversión en `scripts/`.

### 7.3 Secuencia instrumentada (Lote B)

```
0. preflight (igual que hoy) + exigir funciones E03 R05 (fail-closed 503, igual que exigirNex080)
1. fe_e03_iniciar_envio  → INICIADO + o_payload + o_version + o_payload_hash + o_operacion_id     [tx corta]
     · INDETERMINADO/errores: igual que hoy, sin operación ni POST
2. texto = JSON.stringify(o_payload)  — UNA sola serialización; ese mismo texto es el que se envía y se registra
3. login (sin evidencia del cuerpo ni de credenciales)
     · login fallido sin POST previo → registrar NO_TRANSMITIDO(motivo) → cerrar_r05(AUTENTICACION, ERROR_ENVIO/AUTENTICACION)
4. registrar POST_INTENTADO(texto) → nro_post, solicitud_sha256, solicitud_bytes                    [tx corta, ANTES del fetch]
     · si falla: NO se hace el POST; registrar NO_TRANSMITIDO si es posible; cerrar_r05(AUTENTICACION…) o, si el banco no responde, dejar ENVIANDO (→ indeterminado a los 2 min; conservador)
5. fetch(texto exacto, Bearer en cabecera)  — fuera de transacción
6. registrar HTTP_RESPUESTA(status, respuesta saneada) | ERROR_TRANSMISION(TIMEOUT/RED, motivo)     [tx corta]
     · si falla el registro: el resultado de la app se DEGRADA a ENVIO_INDETERMINADO sin HTTP (la cadena tiene un POST sin salida) — nunca se repite el POST
7. token inválido en el 1.er POST: login forzado; si falla → cerrar_r05(AUTENTICACION) (salida HTTP registrada); si no → pasos 4–6 con nro_post = 2
8. cerrar_r05 (intento ENVIO R05 + CIERRE en UNA transacción)
     · reintento 1 vez con la MISMA operación (idempotente: devuelve el CIERRE persistido)
     · respaldo mínimo DERIVADO DE LA EVIDENCIA: POST sin salida → ENVIO_INDETERMINADO, http NULL; ERROR_TRANSMISION → TIMEOUT/RED; HTTP_RESPUESTA → RESPUESTA_INVALIDA con el mismo HTTP
     · si todo falla: 502; el documento queda ENVIANDO y la operación sin CIERRE («operación sin cierre», visible en E03-B); a los 2 min, ENVIO_INDETERMINADO
```

Atomicidad: cada evento es su propia transacción corta (durable antes de seguir); el HTTP nunca está dentro de una transacción; el cierre y el intento son atómicos entre sí. Estado fiscal: ningún evento cambia `estado_sifen`; el ACK solo produce `ENVIADO`.

### 7.4 Recuperación y escenarios de falla

| Falla | Evidencia resultante | Estado | Recuperación |
|---|---|---|---|
| Crash antes de POST_INTENTADO | INICIO sin eventos | `ENVIANDO` → indeterminado a los 2 min | Consulta del documento; nunca reenvío ciego |
| Crash entre POST_INTENTADO y `fetch` | POST sin salida | Igual | Igual (no se sabe si salió) |
| Gateway respondió, falla el registro de la respuesta | POST sin salida | `ENVIO_INDETERMINADO` sin HTTP; lote no se fija | Consulta automática (FE/NCE en `ENVIO_INDETERMINADO` son elegibles, NEX-080:238–241) |
| Respuesta registrada, falla el cierre | Cadena completa sin CIERRE | Reintento idempotente; respaldo derivado; 502 | Igual |
| Cierre confirmado, respuesta perdida | CIERRE persistido | El reintento devuelve el CIERRE (072:585–590) | — |
| Doble clic / dos pestañas | Una sola operación | El 2.º inicio recibe `NEX:ENVIO_EN_CURSO` (NEX-062:382–384) | — |
| Proceso lento supera 2 min y otro usuario reintenta | Operación antigua deja de ser vigente | `ENVIO_INDETERMINADO`; los eventos tardíos se rechazan (`NEX:OPERACION_NO_VIGENTE`/`ENVIO_NO_INICIADO`) | Consulta; riesgo R-03 |
| Sin evidencia histórica | Ninguna fila en la tabla | Sin cambios | La UI muestra «Evidencia de transmisión no disponible» |

---

## 8. Presentación por versiones (E03-B)

### 8.1 Reglas

- **Por defecto:** una fila por documento (consulta actual sin cambios: shared.ts:256–272). Casilla **«Mostrar todos los reprocesamientos»**, desmarcada al abrir.
- **Marcada:** una fila por versión fiscal (`documento_electronico_solicitudes`), **nunca por POST**: `FROM documentos_electronicos d JOIN documento_electronico_solicitudes s` con el mismo `ALCANCE` y filtros (los filtros siguen aplicándose a los datos del documento); orden `…, d.id DESC, s.version DESC`; conteo sobre las filas de versión; paginación por desplazamiento como hoy.
- **Indicadores y KPI:** se siguen calculando sobre `documentos_electronicos` (shared.ts:290), nunca sobre filas de versión: sin duplicación de importes, cantidades ni ventas. La fila de versión muestra el importe en texto secundario o «—» para versiones no vigentes (decisión de presentación de E03-B).
- **Detalle de una versión:** operaciones de envío de esa versión (eventos NEX-072 ordenados por `orden`, agrupados por `operacion_id`), con POST n.º, hash y bytes, HTTP, error, NO_TRANSMITIDO, CIERRE y el intento vinculado. Las **consultas** siguen siendo del documento (historial actual) y no generan filas.
- **Histórico sin evidencia:** intentos ENVIO sin CIERRE vinculado ⇒ «Evidencia de transmisión no disponible (anterior a la instrumentación)». No se atribuyen a una versión ni se reconstruye un POST a partir de la solicitud registrada.
- **Hoy**: como toda solicitud es versión 1, la vista marcada devuelve las mismas filas con la etiqueta «V1». Las versiones V2 dependen de PRO-311 (creación tras RECHAZADO definitivo con matriz legal); no se implementan ni se simulan.
- **NCE «Corregir y emitir nueva»** crea OTRO documento (regla R05 de la ESPEC), no una versión: sigue como fila propia.
- **Se preserva:** cuatro indicadores, lenguaje de operador (C02), KuDE sin validación por CDC (C02-C02), F03 «Cancelado», historial técnico en segunda capa, paginación de intentos, permisos `FACTURACION_ELECTRONICA.VER` y `sucursal_en_alcance`.

### 8.2 Lecturas nuevas propuestas

| Ruta | Permiso | Contenido |
|---|---|---|
| `GET /api/documentos?reprocesamientos=1` | VER + alcance | Filas por versión (mismos filtros y KPI por documento) |
| `GET /api/documentos/[id]/versiones/[version]/envios?cursor=` | VER + alcance (documento resuelto primero, 404 fuera de alcance) | Eventos de la versión, sin textos ni JSON, paginados por `orden` |
| `GET /api/documentos/[id]/versiones/[version]/envios/[eventoId]/solicitud` | VER + alcance | Texto exacto transmitido de UN POST (bajo demanda), con hash y bytes; rótulo «Solicitud transmitida (texto exacto del POST)» distinto de «Solicitud registrada» |
| `GET …/envios/[eventoId]/respuesta` | VER + alcance | Respuesta saneada de UN POST, rotulando que el hash es del objeto saneado |

`nexit_runtime` ya tiene `SELECT` sobre la tabla (072:683); toda lectura filtra `empresa_id` de la sesión y el documento ya resuelto con alcance.

---

## 9. Reglas comerciales (sin cambios)

| Regla | Garantía en el diseño |
|---|---|
| La salida de stock ocurre al emitir | Ocurre en `crearFacturaElectronica`/NEX-067 antes de `enviarDocumento`; E03 no toca emisión |
| El rechazo fiscal no devuelve stock | Ni consultas ni eventos llaman funciones de stock |
| El reenvío no genera otra salida | `enviarDocumento` no crea documento ni movimiento; NEX-084 no toca stock |
| Las consultas no modifican stock | Sin cambios en `consultarEstado` |
| El historial no modifica estados fiscales | Eventos y lecturas no escriben `documentos_electronicos` |
| ACK ≠ aprobación SIFEN | El cierre OK solo produce `ENVIADO`; `estado_sifen` solo por consulta |

PRO-310 sigue cancelada; no se reabre.

---

## 10. Matriz de regresión (casos ESCRITOS, NO EJECUTADOS)

Leyenda: **Ex** = criterio ya cubierto por casos existentes (a preservar); **Nv** = criterio nuevo; Lote = A (SQL), B (instrumentación), C (lectura/UX).

| ID | Caso | Esperado | Tipo | Lote |
|---|---|---|---|---|
| E03-01 | FE envío exitoso (success + `nro_lote`) | INICIO, POST 1, HTTP 200, CIERRE enlazado; `ENVIADO`; lote literal; `estado_sifen` sin cambio | Nv | A/B |
| E03-02 | NCE envío exitoso | Igual que E03-01 para NCE | Nv | A/B |
| E03-03 | ACK no es aprobación | Tras E03-01, `estado_sifen` = `SIN_CONSULTA`; KPI «Pendientes de respuesta» incluye el documento | Ex | B |
| E03-04 | Rechazo técnico del gateway (Rechazados con número propio) | HTTP_RESPUESTA + CIERRE `ERROR_HTTP`/`ERROR_ENVIO`/`RECHAZO`; no es RECHAZADO SIFEN | Nv | A/B |
| E03-05 | Login fallido antes del POST | NO_TRANSMITIDO + CIERRE `AUTENTICACION`; sin POST_INTENTADO; reenvío seguro | Nv | A/B |
| E03-06 | Fallo al registrar POST_INTENTADO | No se llama a `fetch` | Nv | B |
| E03-07 | Timeout del POST | ERROR_TRANSMISION(TIMEOUT) + CIERRE indeterminado sin HTTP; sin segundo POST | Nv | A/B |
| E03-08 | Error de red | Igual con RED | Nv | A/B |
| E03-09 | Respuesta no JSON / malformada | HTTP_RESPUESTA sin objeto; CIERRE `RESPUESTA_INVALIDA`/indeterminado con el mismo HTTP | Nv | A/B |
| E03-10 | Gateway responde 200, falla el registro de la respuesta | Resultado degradado a `ENVIO_INDETERMINADO` sin HTTP; lote no fijado; sin reenvío | Nv | B |
| E03-11 | Pérdida del cierre (respuesta del banco perdida) | Reintento devuelve el CIERRE existente; un solo intento ENVIO | Nv | A/B |
| E03-12 | Cierre fallido dos veces | Respaldo derivado de la evidencia aceptado por el banco | Nv | A/B |
| E03-13 | Cierre imposible | 502; documento `ENVIANDO`; operación sin CIERRE visible | Nv | B/C |
| E03-14 | CDC ausente en el ACK | `ENVIADO`; proyección `AUSENTE` | Nv | A |
| E03-15 | CDC opaco (no 44 dígitos, letras, espacios) en el ACK | `ENVIADO`; CDC literal en intento; sin regla de forma; cierre aceptado | Nv | A |
| E03-16 | CDC distinto del ya registrado | Proyección `CAMBIO` con `cdc_anterior` (NEX-080) | Ex | A |
| E03-17 | `p_cdc_informado` no presente en la raíz de la respuesta | `NEX:CIERRE_CONTRADICTORIO` | Nv | A |
| E03-18 | Lote con espacios internos / alfanumérico | Persistido literal | Ex/Nv | A |
| E03-19 | Lote solo anidado (`Nota.lote`) | No confirma por lote (igual que la app) | Nv | A |
| E03-20 | Lote en respuesta indeterminada | No se fija en el documento | Ex | A |
| E03-21 | Clave/token del gateway repetidos en la respuesta | Redactados; evidencia sin el secreto; `secreto_residual` rechaza sin repetir | Ex/Nv | A/B |
| E03-22 | El texto de POST_INTENTADO no contiene cabeceras ni login | Solo el cuerpo fiscal | Nv | B |
| E03-23 | Hash exacto | `solicitud_sha256` = SHA-256 de los bytes UTF-8 del texto enviado; distinto de `payload_hash` y rotulado | Nv | A/B/C |
| E03-24 | Respuesta > 30 000 caracteres | Comportamiento según D2; nunca un OK sin evidencia verificable | Nv | A/B |
| E03-25 | Solicitud > 1 MiB | No se transmite; mensaje claro | Nv | B |
| E03-26 | Conexión registrada en el intento del cierre | `conexion` presente; continuidad `MISMA` en la consulta | Ex | A |
| E03-27 | Configuración cambiada entre preflight y POST | Se usa la misma configuración (PRO-342-R02) | Ex | B |
| E03-28 | Token inválido en el 1.er POST, 2.º POST OK | POST 1 con HTTP 401, POST 2 con 200, un CIERRE | Nv | A/B |
| E03-29 | Token inválido y renovación fallida | CIERRE `AUTENTICACION` tras salida HTTP | Nv | A/B |
| E03-30 | Doble clic | Un solo INICIO; el segundo recibe 409 en curso | Ex/Nv | B |
| E03-31 | Dos procesos, operación no vigente | Eventos del proceso antiguo rechazados; sin segundo POST | Nv | A |
| E03-32 | Idempotencia de emisión (misma clave) | Mismo documento, sin nueva operación si ya `ENVIADO` | Ex | B |
| E03-33 | Otra empresa | Funciones y lecturas devuelven «documento no encontrado» | Nv | A/C |
| E03-34 | Sucursal fuera de alcance | 404 sin contenido | Nv | C |
| E03-35 | Usuario sin CREAR (envío) / sin VER (lectura) | 42501 / 403 | Ex/Nv | A/C |
| E03-36 | Documento histórico sin evidencias | «Evidencia de transmisión no disponible»; ningún POST inventado | Nv | C |
| E03-37 | Varias transmisiones de una versión (reenvío tras error) | Varias operaciones en la misma versión; una sola fila de versión | Nv | C |
| E03-38 | Sin V2 | Vista marcada = mismas filas con «V1» | Nv | C |
| E03-39 | Casilla desmarcada por defecto | Una fila por documento | Nv | C |
| E03-40 | Filtros y KPI con casilla marcada | KPI idénticos a la vista por documento | Nv | C |
| E03-41 | Paginación estable con versiones | Sin duplicados ni saltos entre páginas | Nv | C |
| E03-42 | Consulta automática vigente | Sin cambios; documentos indeterminados elegibles | Ex | B |
| E03-43 | Stock: una baja comercial al emitir | Exactamente una salida por FE | Ex | B |
| E03-44 | Stock: rechazo, consulta, reenvío | Ninguna salida ni devolución adicional | Ex | B |
| E03-45 | KuDE sin validación por CDC y F03 | Sin cambios | Ex | C |
| E03-46 | Cuatro indicadores y lenguaje de operador | Sin cambios | Ex | C |
| E03-47 | `fe_e03_cerrar_envio` antiguo no concedido a la app | `nexit_runtime` sin EXECUTE tras aplicar grants | Nv | A |
| E03-48 | Payload NCE con numéricos calculados en SQL | POST_INTENTADO aceptado (igualdad `jsonb`) o bloqueo explicado (D6) | Nv | B |

---

## 11. Plan de implementación por lotes (propuesto, no iniciado)

### Lote A — Adaptación SQL incremental

- **Archivos:** `documentacao/banco/nexit/v1/migraciones/NEX-084-facturacion-e03-cierre-r05.sql` (nombre provisional); `scripts/preflight-NEX-084.sql`, `scripts/verificar-NEX-084.sql`, `scripts/reversion-NEX-084.sql`; casos SQL escritos (`documentacao/testes/CASOS-NEXIT-PRO-312-R02-NEX-084-…md` o el formato que indique la orden).
- **Funciones:** nuevas `fe_e03_recepcion_coherente_r05`, `fe_e03_cerrar_envio_r05`; ayudante de grants E03 redefinido o nuevo. Sin tocar NEX-001..083.
- **Dependencias:** NEX-072 y NEX-080 aplicadas (registro VM informado; reconfirmar con `schema_migrations` en el preflight). Reconfirmar que NEX-084 está libre.
- **Criterios:** sin reglas de CDC; lote literal; delegación en `_r05` con conexión; CIERRE idempotente; reglas por salida del último POST idénticas a 072:608–649 salvo el OK; grants sin DML directo; reversión protegida.
- **Riesgos/bloqueos:** aplicación solo por el responsable con backup; NEX-072 sin scripts propios de verificación.
- **Casos:** E03-01…E03-21, E03-23, E03-26, E03-28…E03-31, E03-33, E03-35, E03-47.

### Lote B — Instrumentación del envío

- **Archivos:** `lib/facturacion/envio.ts` (`enviarDocumento`, `cerrarEnvio`, respaldo derivado de la evidencia), `lib/facturacion/gateway.ts` (`enviar` acepta el texto ya serializado; `enviarDocumentoGateway` recibe ganchos `antesDelPost(texto)` / `trasRespuesta(status, respuesta)` / `trasError(motivo)` sin cambiar `interpretarRecepcion` ni el saneamiento), `lib/facturacion/shared.ts` (lista de funciones exigidas, fail-closed), casos nuevos `lib/facturacion/e03-evidencias.casos.ts` y su registro en el runner.
- **Dependencias:** Lote A auditado y NEX-084 aplicada en el entorno de pruebas autorizado.
- **Criterios:** una serialización; POST_INTENTADO durable antes de cada `fetch`; sin POST si falla; ningún POST repetido fuera de la renovación de token; degradación a indeterminado cuando falta evidencia; resultados visibles idénticos a hoy en los caminos felices; NCE por el mismo camino.
- **Riesgos:** latencia adicional (3–4 escrituras cortas por envío); ventana de 2 min (R-03).
- **Casos:** E03-01…E03-13, E03-22…E03-25, E03-27…E03-32, E03-42…E03-44, E03-48.

### Lote C — Lectura y presentación de versiones

- **Archivos:** `lib/facturacion/shared.ts` (`construirConsultas` con modo versiones, lecturas de eventos), `app/api/documentos/route.ts`, rutas nuevas bajo `app/api/documentos/[id]/versiones/[version]/envios/…`, `app/(private)/documentos/page.tsx` y `page.module.css`, `lib/facturacion/documentos-copy-operador.ts`, casos de UX.
- **Dependencias:** Lote B auditado (sin evidencia no hay nada que mostrar salvo «no disponible").
- **Criterios:** casilla desmarcada; una fila por versión, nunca por POST; KPI por documento; paginación y filtros estables; permisos y aislamiento; rótulos «registrada» vs «transmitida»; preservación de E01/E02/E08, KuDE, F03, cuatro indicadores.
- **Casos:** E03-33…E03-41, E03-45, E03-46.

---

## 12. Limitaciones, riesgos y decisiones pendientes

**Limitaciones del diagnóstico:** análisis estático; nada ejecutado; el estado de la base real (NEX-072 aplicada, contenido de la tabla, versiones existentes) no fue verificado por Claude.

**Riesgos:**
- **R-01** Evidencia y estado en transacciones separadas: hay estados intermedios visibles (operación sin cierre); se documentan y se muestran, no se ocultan.
- **R-02** Escrituras adicionales por envío: si el banco falla entre eventos, el resultado se degrada a indeterminado (más reconciliaciones, ningún reenvío).
- **R-03 (preexistente)** Peor caso de una operación: login + POST + login + POST = 4 × `timeout_ms` (hasta 240 s, gateway.ts:32) mayor que la ventana de 2 min de `ENVIANDO` (NEX-062:382): otro inicio puede declarar indeterminado un envío aún en curso. No produce doble POST, pero sí pérdida de evidencia tardía.
- **R-04** Diferencia textual entre JSON registrado y transmitido (serialización); se conserva y se rotula, no se «corrige».

**Decisiones para auditoría/responsable:**
- **D1** Aprobar la alternativa A y el número NEX-084 (reconfirmar libre).
- **D2** Respuesta truncada (> 30 000 caracteres): conservar siempre la raíz contractual (`status`, `message`, claves de lote, `cdc`, `dEst`/`dPunExp`/`dNumDoc`) junto al marcador de truncado, o cerrar como indeterminado.
- **D3** Redefinir el ayudante de grants E03 en NEX-084 para retirar `fe_e03_cerrar_envio` de `nexit_runtime`.
- **D4** «Sin credenciales» o fallo interno antes de cualquier POST: con evidencia puede registrarse como NO_TRANSMITIDO (reenviable) en lugar del indeterminado actual (envio.ts:193–202). Cambia comportamiento visible.
- **D5** Ventana de 2 min frente a 240 s (R-03): mantener, o acotar la operación completa por debajo de la ventana (otro cambio, no de esta orden).
- **D6** Verificar con datos de prueba autorizados que el payload NCE (completado en SQL) se transmite sin pérdida numérica; si no, definir si se envía el texto `jsonb` canónico.
- **D7** Rótulo y alcance del hash de respuesta (objeto saneado) en la UI.
- **D8** Límite de 1 MiB del texto de solicitud frente al máximo de líneas configurable.

---

## 13. Siguiente etapa recomendada

**PRO-312-R02 = Lote A únicamente**: autoría de NEX-084 (cierre R05 y coherencia de recepción R05), preflight/verificación/reversión y casos SQL escritos, sin aplicar en ningún banco, tras la auditoría de este diagnóstico y la resolución de D1–D3. Los lotes B y C quedan bloqueados hasta la auditoría del anterior y la aplicación autorizada de NEX-084. PRO-311 (V2) sigue separada y no es requisito de A/B; solo enriquece C.

**STOP: auditoría ChatGPT.** No se inició PRO-312-R02, PRO-311, PRO-313 ni PRO-199.
