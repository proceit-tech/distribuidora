# AUDITORÍA INDEPENDIENTE — PRO-338-R04 / CDC inmutable y saneamiento según procedencia

**Fecha:** 11/11/2026
**Commit auditado:** [aa056e34fae19d24a9950610632d6276dbde2134](https://github.com/proceit-tech/distribuidora/commit/aa056e34fae19d24a9950610632d6276dbde2134)
**Issues:** [Linear PRO-338](https://linear.app/proceit/issue/PRO-338) · [GitHub #12](https://github.com/proceit-tech/distribuidora/issues/12)
**Auditoría anterior:** [PRO-338-R03](AUD-NEXIT-PRO-338-R03-CDC-INMUTABLE-SEGURIDAD-2026-11-11.md)
**Método:** revisión ESTÁTICA de diff y archivos completos del SHA (sin ejecutar tests, runner, typecheck, lint, build, CI, SQL, PostgreSQL, gateway, VM, Docker o despliegue).
**VEREDICTO:** **R04 NO CONFORME por R04-F001 (exención de secretos por nombre de campo SIN CAMINO FISCAL CONFIABLE)**. R03-F001 queda corregido en su forma literal (cadenas de 44 dígitos en campos libres) pero queda un bypass equivalente en objetos anidados con nombres de campo fiscal. **No homologar ni desplegar R04**.

## 1. Alcance y cobertura escrita

Commit R04 modifica **EXACTAMENTE 2 archivos**:
1. `lib/facturacion/gateway.ts` — nueva regla `esIdentificadorFiscal` por nombre de campo; preservación restringida de claves numéricas en listas `Aceptados`/`Rechazados`.
2. `lib/facturacion/cdc-inmutable-r03.casos.ts` — **18 verificaciones R04-00..17**, adicionales a **31 R03-00..30**, con R03-21 y R03-23 actualizados. **Ninguna prueba ejecutada.** Los casos de R04 usan funciones reales con `fetch` y DB simuladas y comprueban algunos parámetros de SQL, no PostgreSQL real ni un navegador.

## 2. Conforme estáticamente en R04

- `esIdentificadorFiscal(clave,valor)` ya devuelve `false` para `clave=null`; no preserva cualquier cadena de 44 dígitos **sólo** por su forma. Una lista de textos sin clave y un mensaje de 44 dígitos se someten a `omitirEn`.
- `resultadoFiscalSinSecretos` en consulta y envío mantiene exactamente `cdc` y `cdcInformado` operacionales interpretados de la API. El CDC no se envía en `/api/consulta_de`, no se genera ni se reconstruye.
- `response.DE.CDC` reconocido conserva el CDC en el flujo normal documentado; las etiquetas `CDC_DIVERGENTE` con o sin CDC local permanecen sin cambio; SQL, migration, worker, estados SIFEN y documentos fiscales no fueron tocados.
- Las claves `EEE-PPP-NNNNNNN` se preservan en objetos que sean elementos de una lista llamada `Aceptados` o `Rechazados`, en lugar de cualquier clave de ese formato.
- R04-00..17 incluyen credenciales sintéticas cortas y de 44 dígitos en textos libres y contraste con CDC auténtico. El caso `R04-17` confirma sólo la supresión de la excepción global de 44 dígitos; **no evalúa la procedencia de las claves exentas**.

## 3. HALLAZGO R04-F001 — MEDIA/ALTA seguridad: excepción por clave sin ruta fiscal confiable

**Ubicaciones exactas (`gateway.ts`):**
- `IDENTIFICADORES_FISCALES` (~90–103) incluye `cdc`, `cdcinformado`, `lote`, `nrolote`, `dnumdoc`, `codrespuesta` y otros;
- `esIdentificadorFiscal` (~112–119) hace sólo `normalizarClave(clave)` y verifica `formato.test(valor)`, **sin conocer el camino/parent del dato**;
- `sanearValor` (~124–134) recibe `lista` sólo para claves de objetos, y en recursión de objetos llama `sanearValor(v, secretos, k)`, sin mantener el camino padre; por tanto `esIdentificadorFiscal` no distingue procedencia fiscal auténtica de un objeto libre `Nota` con campo homónimo.

**Demostración lógica SIN ejecutar código (secretos sintéticos):**
1. En una respuesta de consulta, `respuesta.response.Nota.CDC = "44 dígitos que contienen la clave numérica sintética"`. El recorrido llega a `sanearValor(valor, secretos, "CDC")`; `esIdentificadorFiscal("CDC", valor)` devuelve `true` por `CDC_FORMATO`, y se almacena íntegro el supuesto texto libre con la clave. **`respuesta.response.DE.CDC` sí es una ubicación fiscal auténtica y debe seguir intacta.**
2. En `respuesta.response.Nota.lote = "claveSintetica123"` y `secretos=["claveSintetica123"]`, `FORMATO_LOTE` acepta el valor porque tiene formato `[A-Za-z0-9-]` y longitud 1..60. `esIdentificadorFiscal("lote",valor)` devuelve `true`; se omite el saneamiento y la contraseña completa puede ir al historial.
3. Un objeto libre `Nota: {Aceptados:[{"001-003-0009020": ...}]}` recibe la excepción de clave de número fiscal debido al nombre de su lista, sin verificar que sea realmente `respuesta.response.Aceptados`. Se trata de la misma debilidad de falta de ruta. No afirmar aquí que esta tercera variante produjo una fuga real.

**Consecuencia:** el defecto R03-F001 no queda totalmente resuelto en lo que exige la orden R04: la excepción debe estar asociada a **origen y ruta fiscal reconocidos**, no a la coincidencia textual del nombre de una propiedad. En una respuesta JSON de tercero pueden existir objetos libres que imitan campos fiscales. Los ejemplos son realizables con el recorrido estático mostrado y no requieren entorno de producción para explicar el riesgo; **no se ejecutaron reproducciones**.

**Lo que NO se cuestiona:** conservar el CDC fiscal auténtico EXACTO en la ruta `response.DE.CDC` y en los campos operacionales legítimos es obligatorio. No se debe solucionar la fuga ocultando un CDC auténtico, reintroduciendo `JSON.stringify` global ni cambiando estados/CDC SQL.

## 4. Orden focal recomendada — PRO-338-R05

1. Reemplazar la simple allowlist `clave + regex` por un **contrato de rutas fiscales** respaldado por las estructuras reales del gateway. Preservar expresamente los CDCs operacionales tipados y la ruta confirmada `resultado.respuesta.response.DE.CDC` para consulta; para envío, preservar `resultado.respuesta.CDC` y otras ubicaciones sólo si el contrato real lo exige. Respetar los campos de identidad fiscal comprobables. No eximir `Nota.CDC`, `Nota.lote` ni objetos de mensajes libres por nombre coincidente. Contratos genéricos `sinSecretos` deben ser seguros por defecto.
2. Para nombres de campos fiscales en rutas ajenas, aplicar redacción de secretos como a cualquier texto libre, incluidos valores numéricos de 44 dígitos, contraseñas completas y fragmentos. Las claves `EEE-PPP-NNNNNNN` sólo deben quedar exentas en las rutas reales `response.Aceptados/Rechazados` y sus elementos.
3. Mantener inmutables `cdc` y `cdcInformado` operacionales de la API, en consulta y envío, y la evidencia del CDC fiscal auténtico. Preservar protección de tokens, mensajes, errores y logs.
4. Escribir casos de funciones REALES con respuestas simuladas: `DE.CDC` genuino con clave como subcadena, **`Nota.CDC` falso** de 44 dígitos, **`Nota.lote` falso** igual a clave, `Nota.Aceptados` falso, `response.Aceptados/Rechazados` auténticos, `lote` oficial, consulta/envío con estado y CDC coherente, primer CDC NULL, divergencia previa, y pruebas de no mutación. No ejecutar.
5. Cambiar sólo `gateway.ts` y suite focal salvo justificación documentada. Commit+push SHA y PARAR para auditoría R05.

## 5. Gate operacional

**PRO-338 sigue In Review / P0**, no Done ni homologada. El hecho de que R04 esté publicado no repara las cuatro FE reales automáticamente ni prueba la causa específica en la VM: todavía falta cotejar `cdc_informado`, `respuesta.DE.CDC` y la implementación SQL real por medio de una lectura operativa autorizada. No reconstruir CDC, no alterar estados manualmente ni reenviar/consultar gateway productivo sin permiso.

**NEX-077** (reserva de consultas automáticas) y **NEX-078** (límite FE por empresa) aún no tienen estado real de aplicación confirmado. Sin NEX-078, activar versión dependiente causa 422 para FE nuevas. No ejecutar tests, SQL, migration ni deploy desde esta auditoría. **PRO-340 no autorizada.**
