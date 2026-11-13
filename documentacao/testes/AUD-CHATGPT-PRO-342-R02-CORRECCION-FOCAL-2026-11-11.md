# AUDITORÍA INDEPENDIENTE — PRO-342-R02 / CASA MINGO

**Fecha:** 11/11/2026 · **Commit auditado:** `b34b1c3ad1256dba2ee105f88ed63f326babc037`
**Repositorio/rama:** `proceit-tech/distribuidora` / `feature/NEXIT-2026-001-banco-demo`
**Objeto:** revisión estática integral de cambios R02 contra la orden [PRO-342-R02](../ordens/ORD-CLAUDE-NEXIT-PRO-342-R02-CORRECAO-FOCAL-CORRELACAO-KUDE-CONEXAO-2026-11-11.md) y la especificación [PRO-342](../definicoes/PRO-342-SOLUCAO-UNICA-AUDITORIAS-CONSOLIDADAS-2026-11-11.md).
**Ejecución:** 0 tests, 0 lint/build, 0 SQL/migrations, 0 gateway/VM/Docker, 0 deploy, 0 actualizaciones fiscales. Las pruebas PRO342-R02-* fueron **ESCRITAS, NO EJECUTADAS**. Nada se infiere sobre versión realmente implantada.
**DICTAMEN:** **R02 PARCIALMENTE CONFORME; NO APTA TODAVÍA PARA HOMOLOGACIÓN.** La corrección focal de F001–F004 progresa; dos riesgos de asociación permanecen y se encontró una incompatibilidad preexistente importante con la regla de negocio de resultado final sin CDC. Requiere UNA corrección mínima R03, no rehacer el ciclo fiscal.

## 1. Comportamientos estáticamente CONFORMES — CONSERVAR

| Ítem | Evidencia |
|---|---|
| R02-F002 preflight único | `lib/facturacion/envio.ts::emitirFactura` captura `config` una vez y la pasa a `enviarDocumento(...,{config})`; `nce-emision.ts::emitirNce` también. El envío directo desde Documentos lee configuración una vez por operación. |
| R02-F002 continuidad host/ref/versión DB | `shared.ts:77–105::SQL_CONEXION_ENVIO/conexionParaDocumento` recupera referencia del envío, `gateway.ts::continuidadConexion` compara, y DISTINTA genera ErrorFacturacion(409) antes de llamada externa/registro. El worker usa la misma `consultarEstado`, reprograma tras limitación. |
| R02-F003 lote literal válido | `gateway.ts:704–711` ya no aplica trim al lote, rechaza bordes blancos y caracteres de control como identificador no válido; `NEX-079:187` también. Si invalida, recepción indeterminada y sin lote. |
| R02-F004 fallback SQL | `shared.ts:31–74` consulta pg_catalog.pg_proc ante 42883 y sólo usa firma antigua cuando la sobrecarga NEX-079 no existe; si existe y falla por dependencia interna, propaga error. Se informa `modoRegistro:COMPATIBILIDAD` al consultar manualmente; el historial muestra `conexion` ausente. |
| KuDE sin CDC local | `gateway.ts::correspondenciaKude` deja `NO_VERIFICADO` si CDC respuesta coincide sólo con tipo/EEE/PPP/número y CDC local es NULL. `kude-visor.ts` añade advertencia, título diferente y `-NO-VERIFICADO.pdf`. No atribuye titularidad confirmada ni exige APROBADO. CDC diferente al ya registrado → `NO_CORRESPONDE`. |
| Estado y worker | `XML firmado` → `PENDIENTE` interno; `consulta-automatica.ts` y NEX-077 retienen seguimiento del mismo documento con lease/fencing hasta resultado definitivo. No reenviar JSON. |
| Origen CDC | NEXIT no genera CDC ni lo envía en `consulta_de`; guarda únicamente el CDC recibido por la API y no sustituye otro ya persistido. |
| NEX-079 | Sigue sólo versionada y no aplicada; no se tocó data ni schema real. |

**DEPENDENCIA EXTERNA DEL KuDE:** la igualdad entre CDC que el gateway informó para la factura y CDC del JSON de `/api/kude` sólo vincula DOS METADATOS del proveedor. No prueba por sí sola que el BINARIO PDF esté firmado a nombre del emisor. En R02 se evita presentar como verificado si no hay CDC o metadatos suficientes, y eso es aceptable como tratamiento prudente provisional, pero el proveedor debe confirmar contrato/cuenta/emisor/serie para homologación real. El usuario prohibió inventar algoritmos nuevos de CDC/RUC/DV/fecha, OCR o nuevas cuentas. No reabrir esa decisión.

## 2. Hallazgos no conformes

### R02-F001 / P0 — Se descarta un RECHAZADO fiscal real si la API no informa CDC

**Regla expresa del responsable:** `XML firmado` es estado inicial, NO final. Consultar varias veces hasta `Aprobado` o `Rechazado`, con historial, código y mensaje; **el CDC se registra SOLO si la API lo informa**. No se autoriza crear CDC, ni exigir que `XML firmado` contenga uno.

**Demostración:**
- `reconciliacion.ts:27–33`: un `Rechazado` con `r.cdc=null` y `doc.cdc=null` se transforma en `RESPUESTA_INVALIDA`.
- `NEX-079:116–121`: el SQL rechaza cualquier estado definitivo sin `coalesce(p_cdc,d.cdc)` válido/coherente.
- `NEX-077:120–124` aplica la misma restricción; NEX-054 manual difiere, pero nunca llega a aplicarla debido al filtro TS anterior.
- El caso `PRO342-06c` comprueba, **incorrectamente contra el negocio**, que `Rechazado` sin CDC mantiene `SIN_CONSULTA`.
**Resultado:** la API puede comunicar un rechazo definitivo con código 1101 sin CDC en esa respuesta; NEXIT lo registra como error técnico en lugar del rechazo, deja el documento elegible y reconsulta indefinidamente. No hay evidencia de que el gateway de CASA MINGO devolviese dicho caso, pero el incumplimiento es estático.
**Corrección de negocio:** si el proveedor devuelve para el documento consultado un rechazo/resultado final real y inequívoco, guardarlo con código/mensaje/hora aunque no haya CDC. CDC queda NULL y sólo se fija si la API lo devuelve auténticamente. No permitir una respuesta ajena con CDC discordante sobreescribir la identidad o estado; no inventar CDC. Revisar TS y las firmas SQL versionadas correspondientes, manteniendo protección contra finales contradictorios, permisos y consultas repetidas de estados intermedios.
**Caso requerido:** `XML firmado` sin CDC → `Rechazado/1101` sin CDC → estado `RECHAZADO`, mensaje, código/hora, CDC NULL, CERO nuevos POSTs de envio, worker deja de reservar el documento. También final `Aprobado` sin CDC con el tratamiento que la API permita; no dar aprobación por simple HTTP 200.

### R02-F002 / P0 — Credenciales ENTORNO no están vinculadas a `credenciales_version` del banco

**Demostración:**
- `gateway.ts::continuidadConexion`: host/ref/origem/versión iguales → `MISMA`; incluso versiones `null/null` → `MISMA`.
- `gateway.ts::credencialesDe/leerCredenciales`: para `credencialRef !== NEXIT_DB`, el usuario/clave se obtienen de `process.env`, que pueden cambiar SIN incrementar `fe_gateway_config.credenciales_version` (NEX-061 versiona cambios guardados en DB, no variables ENV).
- Por tanto, REF, host y versión pueden permanecer iguales mientras cambian las credenciales efectivas, y `conexionParaDocumento` autoriza `consulta_de` y `kude` declarando `MISMA` pese a ser otra cuenta.
**Corrección mínima:** para referencias `ENTORNO`, NO declarar `MISMA` por igualdad de host/ref/versión DB; devolver `SIN_REFERENCIA` (o exigir verificación explícita/segura de la referencia efectiva sin publicar secretos, sólo si existe mecanismo ya documentado y autorizado). Si host/ref cambiaron, sigue `DISTINTA` y 409. Para NEXIT_DB versionada sí puede continuar comprobación actual. No almacenar claves, tokens, RUC o hashes reversibles; no alterar configuración.
**Caso:** mismo host, misma ref, misma versión DB, pero ENV usuario/clave distintos → NUNCA `MISMA`; tampoco `null/null` implica comprobación de identidad.

### R02-F003 / P1 — Un lote de respuesta INDTERMINADA puede fijarse en el documento equivocado

**Demostración:**
- `gateway.ts:714–722`: `base(...)` incluye siempre `loteValido`, incluso `indeterminado()`.
- `gateway.ts:753–762`: si el gateway devuelve un `nro_lote` de forma válida pero un ECO (`dEst/dPunExp/dNumDoc`) o `Aceptados` de otro documento, el resultado es `ENVIO_INDETERMINADO` PERO retiene `r.lote` válido.
- `envio.ts::cerrarEnvio` pasa `r.lote` al registro sin condicionarlo a identidad/ACK confirmados.
- `NEX-079:206–216`: inserta el lote en el intento y actualiza `documentos_electronicos.lote=coalesce(lote,v_lote)` aun si `p_estado_local=ENVIO_INDETERMINADO`; NEX-050:109–117 presenta mismo riesgo en fallback anterior.
**Consecuencia:** un lote íntegro pero perteneciente potencialmente a otro documento puede contaminar el campo principal de la factura. No es el incidente probado, pero viola el requisito de no mezclar documentos.
**Corrección mínima:** guardar **lote principal** sólo ante respuesta de recepción correlacionada (ENVIADO). En resultado indeterminado, dejar en intento/evidencia el valor bruto sin convertirlo en lote confirmado del documento; conservar idempotencia y bloqueo de reenvío. Si el modo antiguo no permite separar sin tocar esquema, el código debe abstenerse de pasar un lote no confiable como el lote del documento. Casos: `success+nro_lote válido+eco ajeno`, `success+nro_lote válido+Aceptados ajeno`, `status:error+ lote`, ninguno debe fijar `documentos_electronicos.lote`.

## 3. Gate de homologación y alcance de ajuste

**CONFORME ESTATICAMENTE:** F002 original (config única em preflight/envio e bloqueio host diferente), F003 original (lote literal), F004 original (fallback 42883), KuDE como PDF NO_VERIFICADO com aviso e sem atribuição fiscal comprovada. Não refazer essas partes.

**AINDA NÃO CONFORME:** F001 novo (final sem CDC), F002 novo (ENTORNO false MISMA), F003 novo (lote indeterminado no documento). Correção FOCAL só nesses pontos, com casos de regressão reais, escritos e sem execução. Não mudar modelo de RUC legal nem criar verificações fiscais extra.

**SEM TESTES EXECUTADOS**, schema NEX-077/078/079 não verificado na VM. NEX-079 não aplicada. Mesmo após correções estáticas, homologação requer autorização separada para testes, schema e evidência do provedor.

**Decisão:** `PRO-342 R02 NÃO CONFORME INTEGRALMENTE`; publicar uma única ordem R03 focal para Claude e reauditar, sem novo monitor/cron/arquitetura.
