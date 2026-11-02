# AUD-NEXIT-FE-DIR-PRO-322-R04 — auditoría estática independiente (25/10/2026)

**Resultado: NO CONFORME. PRO-322 continúa In Review; NO desplegar ni emitir FE real.** Esta revisión no ejecutó tests, lint, typecheck, build, SQL, migraciones, VM, gateway ni CI.

## Alcance y fuentes

- Entrega Claude: `831773fb0dbb8e585f75c113295c23d6958921f8` (parent `d499ff1e7be01bc4553ebe7433d0cb9f798c6a8d`). Branch `feature/NEXIT-2026-001-banco-demo` confirmada idéntica antes de la auditoría.
- Diff: `lib/facturacion/emision.ts` (42 líneas cambiadas), `lib/facturacion/info-adicional.ts` (25 líneas añadidas), `lib/facturacion/payload-fe.ts` (4 líneas cambiadas). Comparado contra el código completo, `lib/facturacion/entrega.ts`, catálogos/aptitud fiscal y SQL versionado NEX-047, NEX-048, NEX-060, NEX-063, NEX-067, NEX-068. La branch puede recibir commits documentales nuevos tras la presente auditoría.
- Contrato: `documentacion/definiciones/REQ-NEXIT-FE-DIRECCION-RECEPTOR-INFO-ADICIONAL-2026-10-25.md` §4.2, dirección fiscal paraguaya **íntegra o ausente**; código geográfico sin descripciones NEXIT→gateway, aceptación externa aún pendiente.

## Correcciones estáticamente verificadas

1. **F005-R03, regex del número:** CERRADO estáticamente. Nacional y B2F vuelven a `/^\\d{1,6}$/`; sin generar cero artificial.
2. **Domicilio fiscal nacional:** F004-R02 conserva calle, número, departamento, distrito y ciudad juntos o todos vacíos cuando está legalmente permitido; error 422 para datos parciales, jerarquía nacional validada contra catálogo activo.
3. **Punto:** `payloadHistorico` resuelve el ID único de punto por empresa, sucursal y código persistido `documentos_electronicos.punto_expedicion`. `equivalente` ahora compara cliente, sucursal y punto; si hay cero o múltiples candidatos no declara equivalencia. Cierre parcial de F002-A, con dependencia del catálogo vivo y protección de alcance.
4. **Notas de operador:** `descomponerInfoAdicional` valida estructura generada (un marcador automático, tipos y orden de líneas) y compara observación enviada con la parte original; rechaza estructura indescifrable, marcas repetidas o modificación del texto libre. Preserva el `dInfAdic` completo del snapshot histórico. Mejoría parcial en F002-B sin afectar aquí el código NCE.
5. **Aptitud fiscal:** `prepararFactura` no rechaza la aptitud actual del receptor cuando existe histórico con hash verificado y se propone comparación posterior; FE NUEVA mantiene control de aptitud y catálogo.

## Hallazgos abiertos

### R04-F001 — ALTA — identidad de la entrega NO comprobada, reutilización indebida posible

`lib/facturacion/emision.ts::equivalente` compara `cuerpo.direccionEntregaId` con una línea de texto derivada mediante `opcionesEntrega(...)`, `resumenEntrega` y `lineaEntrega`, NO con el `direccion_id` **inmutable** de `documento_electronico_entregas`. Dos destinos distintos de mismo cliente pueden tener `etiqueta` y dirección iguales (pero IDs diferentes), con el mismo texto: otro ID pasa como equivalente, el payload histórico es reusado, SQL devuelve la FE anterior y NO registra la diferencia. **No es fail-closed; es aceptación indebida.** Por otro lado, si el destino original fue editado/eliminado o dejó de ser elegible, un reintento genuino devuelve 409, contraviniendo PRO-205 (preservación de snapshot). Sin destino, la ausencia de línea en `dInfAdic` tampoco acredita por sí sola ausencia de fila de entrega.

`NEX-068-facturacion-direccion-entrega.sql` revoca `SELECT` de `documento_electronico_entregas` para `nexit_runtime` y no introduce una función lectora de `direccion_id`. `fe_entrega_opciones` solo lee destinos vivos; no acredita identidad histórica. No usar ni aceptar texto como clave de identidad; no inventar permisos en runtime. **Dependencia de una autorización humana expresa para versionar migration aditiva:** función `SECURITY DEFINER` de lectura LIMITADA de `direccion_id` de FE ya existente por `empresa_id`, `usuario_id` y `documento_id`/clave, filtrando permiso `FACTURACION_ELECTRONICA.CREAR` y `sucursal_en_alcance`; que devuelva también caso explícito sin entrega (sin fila), sin exponer tablas completas ni otros clientes. Revocar PUBLIC y GRANT EXECUTE específico para `nexit_runtime`; función de solo lectura, sin tocar snapshots históricos, CDC, numeración, NEX-068 o NEX-072. Registrar la migración en una tarea separada antes de instruir su desarrollo/aplicación. **No se autoriza SQL/migration por esta auditoría.**

### R04-F002 — MEDIA — F003 no garantiza reintento frente a cambios de ficha del cliente

La exención de `evaluarAptitudCliente` es real, pero `receptorDe` todavía lanza 409 si `clientes.activo=false` o `bloqueado_ventas=true` y `validarEntradaFE` (sin exención total) rechaza B2F si la dirección actual está vacía, aun con `domicilioHistorico=true`. Por eso no es correcto declarar que CUALQUIER edición posterior del cliente nunca afectará el reintento; hay que decidir cuidadosamente si la desactivación/bloqueo deliberado del cliente debe inhibir la repetición o solo impedir FE nueva, manteniendo reglas de seguridad. **Caso comprobado estáticamente:** B2F ya emitida; dirección actual vacía → 422 previo a la reutilización histórica. No saltar controles sin equivalencia y autorización.

### R04-F003 — MEDIA — histórico no verificable no garantiza conflicto explícito antes de reprocesamiento

Cuando `documentoExiste()=true` pero `payloadHistorico` devuelve `null` por falta de fila/hash diferente, `crearFacturaElectronica` llama `prepararFactura` como FE nueva, ejecutando aptitud, catálogos y otras comprobaciones. Puede devolver 422 u otro error antes del esperado conflicto; solo un caso que llegue al SQL puede detectar `NEX:IDEMPOTENCIA_CONFLICTO`. En un reintento con histórico de integridad no comprobable se debería fallar tempranamente y de manera explícita con conflicto 409, sin consulta de maestros para decidir equivalencia. No consultar ni modificar el documento histórico.

## Riesgos adicionales / no homologación

- `equivalente` compara `operacionComercial` derivada de maestros vivos: modificaciones comerciales posteriores pueden causar 409 en reintentos con la misma intención, aceptable solo como **fail-closed** si no existe dato original fiable, no como garantía de que cualquier reintento histórico funcione.
- `descomponerInfoAdicional` es una validación conservadora de un campo libre, no una identidad fuerte de entrega. **No ampliar la excepción de parsing** para resolver R04-F001.
- Los códigos JSON `cDepRec/cDisRec/cCiuRec` como number y la resolución por el proveedor de las descripciones obligatorias del XML continúan **sin comprobación contractual ni prueba real**. No probar emitiendo FE real sin autorización.
- Ningún test ejecutado por orden del responsable; CI no verificado. No afirmar homologación.

## Decisión operativa y próximo paso

**PRO-322 permanece NO CONFORME / In Review**. Dejar la lectura segura de entrega histórica registrada como dependencia de SQL en issue separado, **sin autorizar versionar/ejecutar migrations ni acceso VM**. Antes de una R05 operativa hace falta resolver esta dependencia y los defectos de F003/retorno 409 en el código. Si la autorización humana de migration no se da, mantener bloqueo; no implementar comparación por texto «equivalente» ni declarar cerrada la integridad de idempotencia. PRO-323, E03-A2/B, E08/E09 y NEX-072 siguen fuera del alcance. Claude no inicia nuevo código automáticamente.

**Clasificación:** F005 cerrado estáticamente; punto controlado; observaciones parcialmente controladas; identidad de entrega abierta ALTA; F003 histórica y conflicto histórico pendiente MEDIA.
