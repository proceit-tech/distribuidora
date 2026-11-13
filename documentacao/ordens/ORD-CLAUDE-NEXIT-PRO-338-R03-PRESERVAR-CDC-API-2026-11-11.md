# ORDEN DE DESARROLLO — PRO-338-R03 / Preservar el CDC original informado por la API

**Fecha:** 11/11/2026
**Repositorio:** `proceit-tech/distribuidora`
**Branch:** `feature/NEXIT-2026-001-banco-demo`
**Issue:** [Linear PRO-338](https://linear.app/proceit/issue/PRO-338) · [GitHub #12](https://github.com/proceit-tech/distribuidora/issues/12)
**Autorización:** el responsable ha pedido «mandar o comando para Claude ajustar» después de confirmar la regla CDC INMUTABLE.
**Desarrollo:** Claude. **Auditoría independiente:** ChatGPT. **ÚNICA ORDEN ACTIVA DE DESARROLLO DE CÓDIGO:** PRO-338-R03.
**NO autoriza** ejecutar tests, lint, build, SQL, migraciones, PostgreSQL, gateway real, VM, Docker ni despliegue.

## 0. Invariante fiscal innegociable

**NEXIT NO GENERA, CALCULA, COMPLETA, CORRIGE, ENMASCARA, RECONSTRUYE NI MODIFICA EL CDC.**
- En `POST /api/consulta_de`, NEXIT consulta por `{dEst,dPunExp,dNumDoc,dSerieNum,tipoDoc}` **SIN ENVIAR CDC**.
- El CDC se obtiene EXCLUSIVAMENTE de la respuesta oficial de la API/gateway. Si el documento no tiene CDC previo (`d.cdc IS NULL`), la primera respuesta **auténtica, coherente con identidad fiscal y válida** puede registrarlo tal cual (44 dígitos) junto al estado y mensaje SIFEN, mediante el flujo transaccional existente.
- Si un CDC ya existe y la API devuelve otro diferente, **NO sobrescribirlo**. Guardar evidencia y activar la protección de inconsistencia hasta investigación. No inferir que un CDC recibido diferente autoriza sustitución.
- Ningún mensaje de error, función de saneamiento o copia de log puede alterar el **CDC funcional utilizado para validar/persistir**. La protección de secretos sigue obligatoria en headers, mensajes libres, tokens, contraseñas y logs; los CDC íntegros tienen que tratarse como datos fiscales sujetos a permisos de lectura.
- No reparar historiales ya corrompidos con un CDC inventado, inferido, recuperado de capturas/Excel o completado mediante subcadenas. No ejecutar `UPDATE` de CDC ni `estado_sifen` manualmente.

## 1. Defecto confirmado y corrección focal

**Causa técnica confirmada en fuente** (causalidad exacta para las cuatro FE aún pendiente de SELECT autorizado):
- `lib/facturacion/gateway.ts:79–89`: `sinSecretos<T>()` hace sustitución literal de secretos conocidos sobre TODO `JSON.stringify(valor)`.
- `gateway.ts:341`: `consultarDocumentoGateway` retorna `sinSecretos(interpretarConsulta(...), [credenciales.password, token])`. Si una contraseña/token coincide con una subcadena del CDC de 44 dígitos, el resultado `cdc` puede convertirse en `[omitido]` **antes** de reconciliar.
- `gateway.ts:632`: `enviarDocumentoGateway` aplica el mismo saneamiento global sobre `interpretarRecepcion` y puede mutilar datos/identificadores fiscales allí.
- `reconciliacion.ts` y SQL NEX-054/062/077 validan identidad; un CDC mutilado puede causar `CDC_DIVERGENTE` y bloquear indebidamente un resultado fiscal real `Rechazado / 1101 / Número de timbrado inválido`.

**Implementar** la separación clara entre:
1. **Resultado fiscal operacional INTACTO**, que preserva exactamente el CDC validado y demás identificadores fiscales devueltos, usados por `decidirConsulta`/persistencia e interpretación de recepción.
2. **Copia saneada y con acceso restringido** para logs/mensajes/respuestas auxiliares: filtrar contraseñas, tokens, encabezados de autorización y textos libres POR CAMPO/DESTINO, sin modificar el CDC del objeto operacional, ni expor secretos en logs. No eliminar el saneamiento de seguridad para resolver el error.
3. Garantizar ambos recorridos **consulta y envío** sin alterar el CDC; si `response.DE.CDC` se conserva como parte de evidencia fiscal persistida, debe mantener el valor auténtico sin mutación, con permisos y sin exponer credenciales en otros campos. Revisar cuidadosamente el contrato de `sanearRespuesta`, `interpretarConsulta` y `interpretarRecepcion`, evitando cualquier bypass que copie credenciales al historial.
4. **Preservar estados fiscales:** en primera consulta coherente con `d.cdc=NULL`, el mecanismo existente debe poder registrar el CDC auténtico y el estado devuelto por la API, incluido `RECHAZADO` código 1101, sin falsificar resultado por HTTP 200 y sin relajar la validación `fe_cdc_coherente`. Si hay CDC incompatible o respuesta de otra FE, no tomar ese estado como final.
5. **Mensaje de la lista:** `lib/facturacion/presentacion-sifen.ts` muestra hoy «CDC distinto del registrado» incluso cuando `d.cdc=NULL`. Evitar esa afirmación falsa. Distinguir según evidencia real: si no hay CDC previo, «El CDC informado no corresponde a la identidad fiscal del documento» solo cuando la identidad contradice; si no puede diferenciarse con datos existentes, usar descripción técnica neutral y mostrar detalle del intento. Para CDC ya registrado diferente, sí puede decir «CDC distinto del previamente registrado». Ajustar el consumo en `app/(private)/documentos/page.tsx` solo si necesario, sin cambiar el estado fiscal o la forma de filtrar.
6. Mantener el historial previo **inmutable** y las transiciones idempotentes. No tocar SQL, migrations, CDC de documentos históricos ni emitir/reemitir/anular facturas. Solo una consulta oficial FUTURA con autorización de operación podrá reconciliar eventos históricos legítimamente.

## 2. Pruebas fuente obligatorias: escribir, NO ejecutar

- Caso contraseña igual al RUC dentro del CDC de 44 dígitos, consulta real de `interpretarConsulta` y CDC recibido intacto sin `[omitido]`.
- Contraseña/token coincidiendo con subcadena de CDC de consulta **y de recepción/envío**; ningún identificador fiscal cambia.
- Contraseña/token presente en mensajes libres, headers o logs: se oculta, nunca se filtra; CDC operacional intacto y evidencia accesible sólo por destinos permitidos.
- Consulta sin CDC previo `d.cdc=NULL`, respuesta con CDC coherente, `Rechazado/1101/Número de timbrado inválido`: en el modelo de decisión/persistencia el resultado es aceptable como final, no `CDC_DIVERGENTE`.
- Consulta de documento diferente, CDC de otra FE, CDC previo distinto: NO sobrescritura y alerta; sin registrar estado fiscal final incorrecto.
- CDC nulo/ausente/inválido y estados incompletos: no inventar CDC; continuar tratamiento seguro.
- UI: etiquetas separadas o neutras para `d.cdc=NULL`, `d.cdc` existente, historial y alertas; conservar badges fiscal y mensaje de rechazo confirmado.
- No alterar scanner/FE de pantalla nueva, NCE, KuDE, stock, IVA, numeración, PRO-339/341, ni consulta automática PRO-338.

**Escribir casos sobre funciones REALES** con dependencias simuladas. No bastan solo regex ni una función modelo que no ejercite `consultarDocumentoGateway` y `enviarDocumentoGateway`. No ejecutar runners, Jest/Vitest, lint, typecheck o build.

## 3. Worker, NEX-077 y NEX-078 — GATES SEPARADOS

- `instrumentation.ts` registra `iniciarPlanificador`, tick previsto 60 segundos; su ejecución REAL en VM y las funciones SQL de NEX-077 **no están confirmadas**. No activar el worker, crear otro cron/monitor o tocar su código en esta orden. Entregar notas de verificación operacional posterior.
- NEX-078 está versionada pero su aplicación real **no está verificada**; activar código de límite por empresa sin esa columna **bloquea TODAS las nuevas FE con 422**. NO ejecutar ni alterar esta migration.
- Separar resultado de auditoría estática y validación runtime. El fix fiscal podrá publicarse en branch como código, pero no será habilitado en producción sin gate explícito.

## 4. Protocolo y entrega

Leer `CLAUDE.md`, [auditoría D03](../testes/AUD-NEXIT-PRO-338-D03-SANITIZACION-CDC-2026-11-11.md), fuente actual y esta orden. **Leer el archivo COMPLETO y MÁS RECIENTE UNO POR VEZ antes de modificarlo.** Inspeccionar `gateway.ts`, `reconciliacion.ts`, `shared.ts`, `presentacion-sifen.ts`, `page.tsx` y suites de gateway/consulta/envío; modificar solo los necesarios, con diff pequeño y justificación.

No usar credenciales reales ni acceder al PostgreSQL/VM/gateway. **PROHIBIDO ejecutar** tests, lint, typecheck, build, CI manual, SQL, migrations, DB, Docker/VM, navegador del cliente, gateway real, o deploy. **NO IMPLEMENTAR PRO-340**.

Hacer commit+push en la branch autorizada, con SHA completo, archivos afectados, lista de casos escritos **0 ejecutados**, seguridad de logs, explicación de preservación CDC exacta y riesgos pendientes. **PARAR para auditoría independiente ChatGPT PRO-338-R03** y no empezar otra tarea.
