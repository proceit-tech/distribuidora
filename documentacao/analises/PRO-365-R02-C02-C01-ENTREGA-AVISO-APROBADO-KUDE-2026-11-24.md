# PRO-369 / PRO-365-R02-C02-C01 — Entrega Claude (24/11/2026)

Orden: `documentacao/ordens/ORD-CLAUDE-NEXIT-PRO-365-R02-C02-C01-AVISO-APROBADO-KUDE-2026-11-24.md` · Auditoría origen: `documentacao/testes/AUD-CHATGPT-NEXIT-PRO-365-R02-C02-2026-11-24.md`.
HEAD inicial: `c730fd4ebd44e9efcd11f5575ed0dddeb807a721`. PR #7 sigue DRAFT. **No es homologación visual.** Casos escritos, no ejecutados manualmente; solo se observa el CI automático del push.

## Resumen

| Hallazgo | Estado | Archivos |
|---|---|---|
| F01 — APROBADO con respuesta histórica | **BLOQUEADO** (datos existentes no permiten distinguir con seguridad una respuesta anterior de la vigente) | ninguno de código; caso forzado C02-11a corregido; caso de evidencia C02C01-F01 |
| F02 — título y aviso del PDF KuDE NO_VERIFICADO | **Implementado** (solo textos) | `lib/facturacion/kude-visor.ts` |

## F01 — bloqueo documentado

**Evidencia (fuente SQL versionada):** en `NEX-080::fe_documento_registrar_consulta_nucleo_r05` (mismo patrón en NEX-054, NEX-062, NEX-077, NEX-079):

- Con resultado `OK` se ejecuta un único `UPDATE` que fija `estado_sifen = p_estado_sifen`, `cod_respuesta = p_cod_respuesta` y `mensaje_respuesta = v_mensaje` **juntos**.
- Una respuesta que contradice un estado final pasa a `RESPUESTA_INVALIDA` y el `UPDATE` de la rama `ELSE` solo toca `ultima_consulta_at/ultima_consulta_resultado`: el código y el mensaje del documento **no cambian**.
- La función de envío solo hace `coalesce(v_mensaje, mensaje_respuesta)` antes de cualquier consulta.

**Consecuencia:** con `estado_sifen = APROBADO`, los campos `codRespuesta`/`mensajeRespuesta` del documento son los de la respuesta que registró la aprobación. No existe fecha ni correlación por campo que permita afirmar que un código (p. ej. 1109) es una respuesta **anterior**. El historial de intentos (con fecha por intento) está en la segunda capa, se pagina y carga a demanda: usarlo en la primera capa sería una correlación no garantizada. Tampoco hay contrato que clasifique 0260 / 1109.

**Decisión:** conforme a la orden («si los campos existentes no permiten distinguir con seguridad… DETENER F01»), no se agrega la nota «Hay una respuesta anterior para revisar en el historial.», no se cambia `respuestaFiscal` ni `page.tsx`, y no se usa ninguna heurística por código o texto.

**Caso corregido:** C02-11a ya no fuerza PASS sobre el escenario APROBADO + 1109 (`apViejo` retirado). Se mantiene APROBADO normal; el escenario histórico queda documentado como BLOQUEADO.

**Alternativa NO implementada (para decisión del responsable/ChatGPT):** (a) persistir en una migración nueva la fecha o el intento que originó `cod_respuesta`, o (b) mostrar en APROBADO una línea neutra puramente informativa con el código/mensaje registrado con la aprobación, sin afirmar incongruencia. Ninguna está autorizada en C02-C01.

Comportamiento actual (sin cambios) verificado por casos: APROBADO + 0260 → sin aviso; APROBADO sin mensaje → sin aviso; RECHAZADO + 1109 → «Motivo del rechazo: 1109 · …»; PENDIENTE → nota C02 que remite al historial.

## F02 — textos antes / después

| | Antes | Después |
|---|---|---|
| Título NO_VERIFICADA | `PDF devuelto por el gateway — pertenencia NO verificada (Factura 001-001-0000003)` | `PDF sin verificación — Factura 001-001-0000003` (número dinámico del documento real; NCE: `PDF sin verificación — Nota de crédito …`) |
| Aviso | «El gateway devolvió este PDF para el número de documento solicitado, pero NEXIT no puede comprobar que pertenezca a este documento ni a esta empresa: el documento aún no tiene un CDC informado por la API con el cual compararlo, o la respuesta no trajo CDC. Verifique el emisor, la fecha y los importes del PDF antes de usarlo; no lo entregue como KuDE de este documento si no coinciden.» | «No se pudo confirmar que este PDF corresponda a esta factura. Revise la empresa emisora, el número, la fecha y los importes antes de utilizarlo. Si los datos no coinciden, no lo entregue como KuDE.» |
| Título VERIFICADA | `KuDE · Factura 001-001-0000003` | sin cambios |

## Protecciones intactas (evidencia en casos C02C01-08..12)

- `pertenenciaDe`: solo la marca `"VERIFICADA"` verifica; Blob sin marca o con otro valor → NO_VERIFICADA.
- `nombreSegun`: descarga `-NO-VERIFICADO.pdf` sin cambios.
- Visor: misma solicitud `/api/documentos/{id}/kude`, abortos, `revocarUrl`, secuencia contra respuestas tardías, cierre.
- Modal (`kude-modal.tsx`, no modificado): aviso `role="alert"` condicionado a `noVerificado`, mismo iframe y misma URL del PDF.
- Historial técnico de la segunda capa sin cambios. Sin cambios de API, SQL, permisos, estados, CDC, gateway, FE/NCE, stock.

## Casos escritos (no ejecutados manualmente)

`lib/facturacion/documentos-c02-lenguaje-pro365.casos.ts`: C02-11a actualizado; C02C01-01..12 y C02C01-F01 (bloqueo con evidencia).
`lib/facturacion/kude.casos.ts`: PRO342-R02-V02 actualizado al nuevo texto (misma protección: título no-KuDE sin verificación, aviso presente, VERIFICADA sin cambios, Blob sin marca = NO_VERIFICADA).

## Limitaciones

- El aviso dice «esta factura» también para una NCE: la constante es compartida y el texto fue fijado literalmente por el responsable. El título sí distingue «Nota de crédito».
- F03 (icono verde en APROBADO luego cancelado) fuera de alcance.
- Sin revisión visual en navegador ni homologación.

## CI automático

Ver mensaje de entrega en el hilo (resultado del run disparado por el push).

## Alcance

No se inició C02-C02 ni R03. Sin merge, deploy, VM, SQL, ni ejecución manual de tests/lint/typecheck/build. STOP para auditoría ChatGPT.
