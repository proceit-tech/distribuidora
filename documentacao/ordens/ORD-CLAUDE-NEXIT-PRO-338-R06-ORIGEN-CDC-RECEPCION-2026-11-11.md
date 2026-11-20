# ORDEN CORRECTIVA CLAUDE — PRO-338-R06 / Origen fiscal del CDC en recepción

**Fecha:** 11/11/2026
**Repositorio:** `proceit-tech/distribuidora` · branch `feature/NEXIT-2026-001-banco-demo`
**Issue:** [Linear PRO-338](https://linear.app/proceit/issue/PRO-338) · [GitHub #12](https://github.com/proceit-tech/distribuidora/issues/12)
**SHA auditado:** `75ea4523d9685e7a1b1cf9eebc1a018f7192be03`
**Auditoría obligatoria:** [AUD PRO-338-R05](../testes/AUD-NEXIT-PRO-338-R05-CDC-ANIDADO-EVIDENCIA-2026-11-11.md)
**Estado:** R05 NO CONFORME por **R05-F001**, un único conflicto parser/saneamiento en CDC anidado. **ÚNICA ORDEN DE AJUSTE: R06 FOCAL**, condicionada a confirmar procedencia fiscal del gateway. No autoriza SQL, pruebas ejecutadas, producción ni PRO-340.

## Regla innegociable

**NEXIT NUNCA GENERA, COMPLETA, MODIFICA, ENMASCARA, RECONSTRUYE NI SOBRESCRIBE ARBITRARIAMENTE UN CDC FISCAL RECIBIDO DE LA API.** La consulta `/api/consulta_de` no manda CDC; el primer CDC oficial puede registrarse sólo tras validar identidad. Un CDC previo diferente se conserva y se alerta. La evidencia de un CDC identificado como fiscal auténtico debe representar el MISMO valor exacto que la columna operacional, sin reemplazar sus dígitos por `[omitido]`. Los secretos se protegen por destino y contexto, no mutilando identificadores fiscales.

## 1. Causa confirmada por auditoría estática

- `gateway.ts::interpretarRecepcion` usa `buscar(raiz, CLAVES_CDC)`, un recorrido recursivo **sin ruta acreditada**, que acepta un CDC de `response.CDC` o incluso potencialmente `Nota.CDC`, si cumple 44 dígitos. Después lo utiliza para `cdcInformado` y, en un éxito con lote/identidad coherente, para `cdc`.
- `CONTRATO_FISCAL_ENVIO` protege el CDC operacional y el `CDC` raíz de la respuesta, pero NO la ruta `resultado.respuesta.response.CDC`.
- `R05-13` simula `status:success, nro_lote:L-906, response:{CDC:CDC_FE}` con contraseña igual a la subcadena RUC del CDC y espera **contradictoriamente** `r.cdc/r.cdcInformado=CDC_FE` PERO `r.respuesta.response.CDC` con `[omitido]`. Esto **no cumple** la regla CDC inmutable si ese campo se está usando como origen de dato fiscal.
- El esquema real/documentado del gateway **no acredita aún** que `response.CDC` sea campo oficial de recepción. **NO agregar rutas arbitrarias al contrato solo para hacer pasar el test**: podría conservar secretos en Nota/errors. No se ha demostrado que el proveedor use ese camino en producción.

## 2. Diagnóstico de procedencia ANTES de implementar

Leer `CLAUDE.md`, el informe R05, `gateway.ts` y `cdc-inmutable-r03.casos.ts` **COMPLETOS, ACTUALES y UNO A LA VEZ**. Inspeccionar contratos de `/api/recepcion_de` ya en repo: ejemplos reales/documentación, `interpretarRecepcion`, `buscar`, `cdcCoherente`, `resultadoFiscalSinSecretos`, `redactarAjenos`, historial, `CONTRATO_FISCAL_ENVIO`. Distinguir fuentes oficiales de campos libres o copias ajenas.

- **Si `response.CDC` está probado como campo oficial:** aceptar esa ubicación únicamente en ese contexto y con identidad validada, y preservarla íntegra en resultado OPERACIONAL y evidencia fiscal por ruta acreditada; `Nota.CDC` y rutas no autorizadas se sanean y NUNCA se promueven a CDC.
- **Si NO está probado:** NO usar un `CDC` arbitrario descubierto mediante `buscar` recursivo como identificador fiscal autorizado; adoptar tratamiento conservador (sin CDC confirmado, estado indeterminado si la respuesta requiere CDC para certificar identidad), documentar los efectos y **PARAR antes de cambiar semántica fiscal si la decisión depende de contrato/proveedor que falta**. La copia de texto no confiable puede ocultarse/omitirse explícitamente con trazabilidad de sanitización, sin fingir que es una copia intacta de CDC fiscal.
- No inventar camino oficial, CDC, documento, estado SIFEN ni respuesta del gateway. Preservar flujo documentado de éxito con `nro_lote` aun sin CDC, conforme la regla actual que separa recepción del gateway y aprobación SIFEN. Si se necesita alterar esa semántica, solicitar aprobación específica antes.

## 3. Corrección y casos, SOLO si el contrato es suficiente

Implementar correspondencia explícita entre **ruta fuente identificada por parser** y **rutas fiscales preservadas del saneador**. Evitar que `buscar` acepte un CDC de `Nota.CDC`, `errores.CDC` u otra ruta no oficial como `cdcInformado`. Si el CDC oficial está presente y validado, registrar exactamente los 44 dígitos y preservar la procedencia en evidencia, sin privilegios de saneamiento para campos libres.

**Actualizar obligatoriamente R05-13:** ya no puede declarar conforme que el CDC aceptado por el parser se convierta en `[omitido]` en evidencia. Escribir casos R06 sobre funciones reales con `fetch`/DB simulados para CDC en raíz de recepción, origen anidado acreditado/no acreditado, `Nota.CDC` falso, primer CDC null, CDC anterior diferente, contraseña coincidente con RUC y texto libre de 44 dígitos, respuestas con `nro_lote` sin CDC, campo auténtico vs copia omitida con indicador de redacción, y no mutación. Preservar todos los R03/R04/R05 conformes (textos, falsos Aceptados/Rechazados, privacidad de secretos).

Ámbito preferente: **solo `lib/facturacion/gateway.ts` y `lib/facturacion/cdc-inmutable-r03.casos.ts`**. No modificar SQL, migrations, backend de facturación, fechas, stock, NCE, KuDE, `presentacion-sifen.ts`, worker NEX-077 ni política NEX-078. Cualquier otro cambio exige justificación de necesidad, sin ejecutarlo sin aprobación.

## 4. Entrega y parada

**No ejecutar** pruebas, runner, lint, typecheck, build, CI manual, SQL, PostgreSQL, VM, gateway real, navegadores de cliente, migrations, Docker ni deploy. No alterar CDC históricos ni estados fiscales manualmente, no reconstruir desde Excel, no enviar/reemitir/cancelar documentos. PRO-340 no autorizada.

Si la procedencia oficial es demostrable y la corrección focal puede realizarse, **commit+push SHA completo** en la branch autorizada, informar archivos/casos escritos **0 ejecutados**, cobertura de CDC exacto y secretos, y **PARAR para auditoría ChatGPT PRO-338-R06**.

**Si no existe contrato verificable para una ruta anidada, STOP con diagnóstico preciso y evidencia faltante, sin adoptar esa ruta como oficial ni forzar validación de un CDC desconocido.** La decisión de arquitectura debe pasar por el responsable y nueva auditoría.

**Gate producción vigente:** NEX-077 (worker) no comprobada activa; NEX-078 no comprobada aplicada, riesgo 422 en todas las FE nuevas si se activa código dependiente sin schema. Esta orden no levanta ninguno de los gates.
