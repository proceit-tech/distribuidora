# PRO-369 / PRO-365-R02-C02-C02 — Entrega Claude (24/11/2026)

Orden: `documentacao/ordens/ORD-CLAUDE-NEXIT-PRO-365-R02-C02-C02-KUDE-SIN-VALIDACION-CDC-2026-11-24.md` (commit dce217d). HEAD inicial autorizado: `59de7bba3b6aa0a1f9aafef33742584434ae13c5`.
PR #7 sigue DRAFT. Casos escritos, no ejecutados manualmente; solo se observa el CI automático del push. **No es homologación visual.**

## Decisión aplicada

Por decisión del responsable se retira la validación adicional de correspondencia del KuDE mediante CDC. NEXIT pide el KuDE por la identidad del documento y presenta el PDF válido que devuelve la API del proveedor, sin clasificarlo como verificado ni como no verificado. El aviso y el título de C02-C01 no se reemplazan por otros equivalentes.

## Cambios por archivo (solo los cinco autorizados)

| Archivo | Cambio |
|---|---|
| `lib/facturacion/gateway.ts` | Se eliminan `correspondenciaKude`, `CorrespondenciaKude`, el código `NO_CORRESPONDE` y su mensaje, la constante `CDC_FORMATO` (solo la usaba el KuDE) y el campo `cdcRegistrado` de `DocumentoKude`. `interpretarKude(http, cuerpo)` ya no lee el CDC de la respuesta; devuelve `{ ok: true, pdf }`. `cdcCoherente` queda exportada sin uso en ningún flujo (la citan casos históricos). |
| `lib/facturacion/shared.ts` | `obtenerKude` ya no pasa el CDC registrado y devuelve el nombre normal `nombreArchivoKude(doc)` (sin `-NO-VERIFICADO.pdf`). Se mantienen lectura por empresa/sucursal, permiso, identidad FE/NCE y continuidad de conexión (409 si cambió). |
| `app/api/documentos/[id]/kude/route.ts` | Se quita la cabecera `X-Nexit-Kude-Correspondencia`. Se conservan autorización VER, `application/pdf`, `Content-Disposition`, `no-store`, `nosniff`, `X-Nexit-Kude-Conexion` y el manejo de errores. URL, método y parámetros sin cambios. |
| `lib/facturacion/kude-visor.ts` | Se eliminan `PertenenciaKude`, `BlobKude`, `pertenenciaDe`, `tituloKude`, `AVISO_KUDE_NO_VERIFICADO` y `nombreSegun`. El estado LISTO ya no lleva pertenencia; la descarga usa el nombre normal. `pedirKudeAlServidor` devuelve el Blob tal cual. Solicitud nueva al abrir/descargar, abortos, revocación y secuencias contra respuestas tardías intactos. |
| `app/(private)/documentos/kude-modal.tsx` | El título es el del documento («KuDE · Factura 001-001-0000003», «KuDE · Nota de crédito …», con serie entre paréntesis si existe). Se quita el aviso. Botones Descargar PDF, Imprimir y Cerrar y el iframe sin cambios. |

Textos visibles: antes «PDF sin verificación — Factura 001-001-0000003» + aviso «No se pudo confirmar…», descarga `KuDE-FE-001-001-0000003-NO-VERIFICADO.pdf`. Ahora «KuDE · Factura 001-001-0000003», sin aviso, descarga `KuDE-FE-001-001-0000003.pdf`.

## Protecciones que permanecen

Identificación de empresa y documento; permisos y alcance de sucursal; continuidad de la cuenta del envío (409 sin llamar al gateway si cambió); tipo, establecimiento, punto, número y serie en la solicitud (FE 5 campos, NCE 6 con `ncr`); validación HTTP, `status: success`, Base64 estricto, PDF íntegro (`%PDF-` … `%%EOF`), límites de tamaño; errores reales; solicitud nueva al abrir y descargar; cierre, abortos y protección contra respuestas tardías. El CDC almacenado y las reglas de envío y consulta fiscal no se modifican.

## Casos de regresión (escritos, no ejecutados manualmente)

Casos actualizados porque contradecían la nueva decisión (cada uno marcado «actualizado C02-C02» con su explicación en el código):

- `kude.casos.ts`: KUDE-02/04/08/21/56, PRO342-R01-K01..K04, NCR-02/03, PRO326-INC-06, PRO326-NCR-04, PRO326-02/03/04/09/10, PRO342-R02-K01..K05, PRO342-R02-C02, PRO342-R02-V01..V03. Cubren FE y NCE con CDC ausente, igual, diferente, de otro emisor, de otro número/tipo, con espacios y no numérico: mismo PDF, nombre normal, sin clasificación y sin escrituras.
- `cdc-dato-api-r05.casos.ts`: R05-G03..G06, R05-K01, R05-R01-F003-11 (ahora con `interpretarKude` real: el CDC no cambia el resultado; un error o un PDF inválido siguen rechazados aunque traigan CDC).
- `flujo-fiscal-pro342.casos.ts`: PRO342-09b..09e y PRO342-R04-F4/UX03.
- `documentos-pro195-r01.casos.ts`: R01-11.
- `documentos-c02-lenguaje-pro365.casos.ts`: C02-T09; los casos F02 de C02-C01 se sustituyen por C02C02-01..06 (título normal, sin aviso/sufijo/clasificación, botones e iframe, descarga con nombre normal y solicitud nueva, abortos y respuestas tardías). Los casos F01 de C02-C01 no cambian.

Casos preservados sin cambios: PDF inválido, Base64 inválido, tamaño excesivo, errores HTTP, cuenta/conexión distinta (PRO342-R02-C01), sin permiso, documento de otra empresa o fuera de alcance (KUDE-07/57, PRO326-05), concurrencia y respuestas tardías del visor.

## Riesgo residual (aceptado por el responsable)

Si el proveedor devolviera un PDF válido de otro documento o de otro emisor para la identidad solicitada, NEXIT ya no lo detecta por CDC y lo muestra y descarga como KuDE del documento. La solicitud sigue saliendo con el token de la cuenta del envío y la identidad exacta del documento; no se afirma que el PDF esté verificado ni que el proveedor garantice la correspondencia.

## Fuera de alcance

F01 (APROBADO con respuesta histórica, bloqueado en C02-C01) y F03 (icono de APROBADO luego cancelado) no se tocan. Sin SQL, migrations, estados fiscales, FE/NCE, stock ni permisos. No se inició R03 ni otra actividad. Sin merge ni deploy. STOP para auditoría ChatGPT.
