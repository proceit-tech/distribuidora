# AUDITORÍA INDEPENDIENTE — PRO-338-D03 / Sanitización que puede modificar el CDC fiscal

**Fecha:** 11/11/2026  
**Proyecto:** NEXIT, branch `feature/NEXIT-2026-001-banco-demo`  
**Linear:** [PRO-338](https://linear.app/proceit/issue/PRO-338) · [GitHub #12](https://github.com/proceit-tech/distribuidora/issues/12)  
**Origen:** diagnóstico reportado por Claude `PRO-338-D03-diagnostico-cdc-divergente.md` (no encontrado en la branch ni entre los archivos accesibles al auditor; se contrastaron sus conclusiones informadas por el responsable con el código vigente, no se auditó el documento completo).
**Método:** lectura estática de `lib/facturacion/gateway.ts`, `lib/facturacion/reconciliacion.ts`, `lib/facturacion/shared.ts`, fuentes SQL NEX-054/077 y scheduler. **Ningún test, SQL, llamada HTTP real, login, cambio de estado o deploy ejecutado**.
**VEREDICTO:** **DEFECTO DE CÓDIGO CONFIRMADO; CAUSALIDAD PARA LAS CUATRO FE AÚN NO DEMOSTRADA.** No aprobar ejecución/implantación ni atribución automática de estado fiscal.

## 1. Defecto confirmado con evidencia de fuente

1. `gateway.ts:141–183`: `interpretarConsulta` extrae `response.DE.CDC` y, si cumple `^[0-9]{44}$`, lo guarda como `ResultadoConsulta.cdc`; también lee `response.Estado`, `Retorno.CodRespuesta` y `Mensaje`.
2. `gateway.ts:78–89`: `sinSecretos<T>(valor,secretos)` hace `JSON.stringify(valor)` y reemplaza literalmente **cada aparición** de la contraseña de API y token en todo el texto JSON por `[omitido]`, sin distinguir las propiedades fiscales de las evidencias de log:
```ts
for (const s of utiles) texto = texto.split(JSON.stringify(s).slice(1, -1)).join("[omitido]");
```
3. `gateway.ts:318–345`: `consultarDocumentoGateway` envía la identidad `{dEst,dPunExp,dNumDoc,dSerieNum,tipoDoc}`, **sin CDC**, e inmediatamente retorna `sinSecretos(interpretarConsulta(...), [credenciales.password,token])` en `:341`. Por tanto, si `credenciales.password` (longitud >=4) aparece dentro de una cadena CDC de 44 dígitos, se modifica **el campo funcional `cdc`**, no solamente la copia de respuesta usada para auditoría. La sustitución también puede modificar `response.DE.CDC` y otros campos que contengan esa secuencia.
4. `shared.ts:392–412`: `consultarEstado` pasa ese resultado YA saneado a `decidirConsulta` y a SQL como `p_cdc`. `reconciliacion.ts:27–32` devuelve para evidencia un CDC incompatible sin convertirlo en otro; `NEX-054:47–50` y `NEX-077:115–118` registran `CDC_DIVERGENTE` si `p_cdc IS NOT NULL` y no supera `fe_cdc_coherente` (o contradice CDC previo), sin consolidar RECHAZADO/APROBADO. El texto `[omitido]` insertado en el CDC causa exactamente esta rama.
5. `gateway.ts:625–632` también devuelve `sinSecretos(res,...)` tras `interpretarRecepcion` de **envío**, por lo que una solución mínima debe preservar también identificadores fiscales válidos en ese flujo, sin exponer tokens/contraseñas en mensajes u otros datos de log.

**Cadena causal CONDICIONAL confirmada:** contraseña (>=4 caracteres) coincide con subcadena del CDC -> `sinSecretos` reemplaza dentro de `cdc` -> `p_cdc` contiene `[omitido]` -> `fe_cdc_coherente` falla -> SQL anota `CDC_DIVERGENTE` y deja la FE sin estado fiscal final. No requiere que `d.cdc` hubiera existido previamente. El defecto es real incluso si las cuatro FE tuvieran otra causa.

## 2. Correlación de las cuatro FE — PENDIENTE DE EVIDENCIA

El usuario aportó cuatro facturas `001-003-0009018..0009021`, visibles como `Rechazado / 1101 / Número de timbrado inválido` en referencia externa y `CDC_DIVERGENTE`/pendiente en NEXIT. **No se ejecutó SELECT sobre producción**; tampoco se verificó qué contraseña exacta se configuró (no solicitar ni divulgar la contraseña). El código hace plausible que contraseña igual al RUC numérico pueda ocultar parte del CDC, pero no se declara que tal coincidencia sea un hecho del ambiente real.

**Evidencia decisiva de solo lectura por operador autorizado:**
- Último `documento_electronico_intentos` `tipo='CONSULTA'` de cada FE, empresa/sucursal validada; observar `respuesta #>> '{response,DE,CDC}'` y/o `cdc_informado` con control de acceso. Identificar si aparece el literal `[omitido]` en la cadena del CDC, sin exponer credenciales ni el JSON íntegro en el ticket.
- Comprobar si el mismo resultado de intento tiene `estado_gateway='Rechazado'`, `cod_respuesta='1101'`, `mensaje='Número de timbrado inválido'`, estado fiscal persistido y resultado `CDC_DIVERGENTE`, correlacionados con la misma FE.
- Si `[omitido]` aparece, la destrucción de un identificador fiscal por la sanitización está demostrada en el intento. Para probar su origen exacto, verificar coincidencia **sin imprimir secretos** en un entorno autorizado; no publicar contraseña, CDC completo ni tokens.
- Si NO aparece, no se descarta la posibilidad de divergencia por otro camino o ausencia de campo saneado; comparar identidad real, texto completo de la respuesta y SQL aplicado frente a SQL versionado. No convertir un SELECT negativo en prueba de que el defecto no exista.
- La versión SQL y funciones de producción (NEX-050/062/077), así como el estado real de la NEX-077, siguen sin verificación. El comentario `NO aplicada` en un archivo Git NO constituye lectura de la VM.

## 3. Corrección técnica PROPUESTA, NO IMPLEMENTADA

**Principio obligatorio:** los campos fiscales usados por reglas de negocio (`cdc`, `cdcInformado`, números, códigos y estados del gateway) no deben pasar por una sustitución global que los muta. Separar el **resultado de interpretación y validación fiscal íntegro** de la **copia saneada para historial/logs**. No desactivar protección contra secretos: sanitizar por tipo de campo los mensajes de error, tokens, cabeceras, credenciales y texto libre, sin alterar CDC/identificadores fiscales validados. Si la contraseña coincide literalmente con parte del CDC (p. ej. RUC usado como clave), tratar la necesidad de almacenar ese identificador obligatorio y la higiene de credenciales por separado, con controles de acceso y posible rotación de clave aprobada; no imprimir secretos en logs. Asegurar el mismo contrato en `consultarDocumentoGateway` y `enviarDocumentoGateway`, sin modificar la información de terceros por efectos colaterales.

**Tests fuente a escribir antes de próxima auditoría (sin ejecutar aún):** contraseña como subcadena del CDC, contraseña igual a RUC, token coincidente con campo fiscal, CDC sin coincidencia, campos libres que sí contienen contraseña, cliente/vendedor/otros destinos no afectados, envío y consulta; `Rechazado` 1101 con primer CDC coherente y `d.cdc=NULL`, CDC de OTRA factura, CDC anterior diferente, y comprobación de que `respuesta` no filtra secretos. La aserción debe probar el código REAL y la ruta de persistencia; no un modelo puro que evita `sinSecretos`.

**Histórico:** las respuestas antiguas con `[omitido]` son evidencia dañada por sanear; **no reconstruir CDC por conjetura ni reescribir intentos históricos**. Cuando el código se corrija y se obtenga autorización operativa, una nueva consulta oficial debidamente correlacionada puede devolver el CDC íntegro y permitir reconciliar la factura. Nunca usar el rechazo externo como `UPDATE` manual ni reemitir/rechazar sin correlación.

**UI:** diferenciar `CDC no corresponde a identidad fiscal` de `CDC distinto del previamente registrado` cuando éste exista; si `cdc IS NULL`, no afirmar que CDC era previamente almacenado.

## 4. Scheduler y gates

`instrumentation.ts` llama `iniciarPlanificador`, pero sólo en runtime Node y si no está deshabilitado: `NEXIT_CONSULTA_AUTOMATICA != '0'`, `DEMO_MODE != 'true'` y `DATABASE_URL` presente. `consulta-automatica.ts` corre cada 60 s, hasta 10 documentos por lote; necesita las funciones de reserva/registro/programación con lease token de **NEX-077**. El archivo SQL de NEX-077 dice **«versionada, NO aplicada»**, pero el estado real de la DB no fue comprobado. **No afirmar como hecho que el worker de producción está apagado**. Verificar logs de inicialización/errores y existencia de funciones por lectura autorizada. No introducir un nuevo monitor ni activar un segundo scheduler.

**NEX-078** también sigue con gate de aplicación no verificada y bloquea FE nuevas al activar código dependiente sin la columna.

**ESTADO:** PRO-338 sigue `In Review` con incidente P0; se puede **aprobar el diagnóstico estático de vulnerabilidad a corrupción de CDC** y solicitar evidencia para confirmar el incidente. La implementación del fix deberá recibir orden específica autorizada. **No ejecutar SQL, tests, migrations, gateway real, VM ni deploy desde esta auditoría; no habilitar PRO-340.**
