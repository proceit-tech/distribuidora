# AUDITORÍA INDEPENDIENTE — PRO-338-R03 / CDC inmutable y saneamiento de credenciales

**Fecha:** 11/11/2026
**Commit funcional auditado:** [53c820479b900c37fe0196edb4df1e5d280a1207](https://github.com/proceit-tech/distribuidora/commit/53c820479b900c37fe0196edb4df1e5d280a1207)
**Linear:** [PRO-338](https://linear.app/proceit/issue/PRO-338) · **GitHub:** [#12](https://github.com/proceit-tech/distribuidora/issues/12)
**Método:** auditoría ESTÁTICA del diff, código completo de los archivos relevantes y los casos fuente. **Ningún test, runner, lint, typecheck, build, SQL, consulta de DB/gateway, VM, Docker ni deploy ejecutado.**
**VEREDICTO: R03 NO CONFORME POR UN HALLAZGO DE SEGURIDAD R03-F001.** CDC preservado funcionalmente en los campos principales, pero la excepción de saneamiento permite exponer secretos en campos libres. NO promover ni homologar R03 todavía.

## 1. Archivos y alcance

El commit modifica **6 archivos**:
1. `lib/facturacion/gateway.ts`: `sinSecretos` estructural, `esIdentificadorFiscal`, `resultadoFiscalSinSecretos`, consulta/envío;
2. `lib/facturacion/presentacion-sifen.ts`: alerta según CDC registrado o NULL;
3. `lib/facturacion/estados.ts`: etiqueta neutral del intento;
4. `lib/facturacion/consulta-automatica-fe.casos.ts`: ajuste de casos de etiqueta;
5. `lib/facturacion/cdc-inmutable-r03.casos.ts`: nuevo, **R03-00..R03-30 = 31 verificaciones**;
6. `scripts/casos-clientes/run.js`: registro de suite.

**Todos los casos escritos, ninguno ejecutado.** Los casos de gateway usan funciones REALES con dependencias `fetch` simuladas, y `consultarEstado` con DB simulada; NO ejecutan SQL real ni React/VM.

## 2. Conforme ESTÁTICAMENTE

- `gateway.ts::consultarDocumentoGateway` mantiene `POST /api/consulta_de` con `dEst,dPunExp,dNumDoc,dSerieNum,tipoDoc`, **sin enviar CDC**; `interpretarConsulta` obtiene `response.DE.CDC` y sólo eleva `cdc` operativo si cumple 44 dígitos.
- `resultadoFiscalSinSecretos` conserva el `cdc` operativo y `cdcInformado` de recepción exactamente como fueron interpretados, sin reconstruirlos. `response.DE.CDC` válido también suele conservarse en la estructura de evidencia por el nuevo saneador.
- `consultarEstado → decidirConsulta → fe_documento_registrar_consulta` continúa validando identidad contra tipo/establecimiento/punto/número antes de escribir resultados, con SQL que permite **primer CDC** si `d.cdc=NULL` y evita sobrescribir uno distinto. Ninguna función SQL, migración, CDC real o estado fiscal fue cambiada en este commit.
- `presentacion-sifen.ts::alertaConsulta` diferencia correctamente mensaje `CDC no corresponde a identidad` sin CDC previamente guardado frente a `CDC distinto del previamente registrado` cuando sí existe. `estados.ts` neutraliza etiqueta del historial; `page.tsx` ya pasa el registro completo a `alertaConsulta(d)`. Estado fiscal mostrado sigue siendo sólo el persistido.
- `R03-00..R03-30` cubren consulta/enxío con contraseña sintética coincidente con RUC dentro de CDC, recibo Rechazado/1101, mensaje libre con RUC, otras facturas, CDC previo, no-CDCs, y consola de presentación. Ninguna aserción fue ejecutada.

## 3. HALLAZGO BLOQUEANTE R03-F001 — SECRETOS EN TEXTO LIBRE CON FORMATO DE CDC

**Ubicación exacta:** `lib/facturacion/gateway.ts:103–117`:
```ts
export function esIdentificadorFiscal(clave: string | null, valor: string): boolean {
  if (CDC_FORMATO.test(valor)) return true;
  // ...
}
function sanearValor(valor: unknown, secretos: string[], clave: string | null): unknown {
  if (typeof valor === "string") return esIdentificadorFiscal(clave, valor) ? valor : omitirEn(valor, secretos);
  // ...
}
```

**Demostración lógica SIN ejecutar código:** Si un campo libre como `mensaje`, `Nota` o un elemento de arreglo contiene **una cadena de 44 dígitos** (aun una cadena de texto con la contraseña de API como subcadena), `esIdentificadorFiscal("mensaje", valor)` y `esIdentificadorFiscal(null, valor)` dan `true` sólo por la longitud y forma. `sanearValor` retorna la cadena original sin ocultar las credenciales que puedan estar allí. Si la contraseña propia tiene 44 dígitos, puede salir completa; si tiene 8 y forma una subcadena de esos 44 dígitos, puede salir ese fragmento. No hace falta tener credenciales reales ni gateway para demostrar el camino, y no se expusieron secretos en esta auditoría.

**Riesgo:** el requisito de preservar el **campo CDC fiscal auténtico** se implementó como inmunidad para **cualquier cadena semejante a un CDC, sin verificar la procedencia ni nombre del campo**. Esa inmunidad se aplica también a mensajes de gateway, errores, logs y evidencia guardada. Puede generar fuga de secretos en el historial y las interfaces; incumple el requisito explícito de conservar credenciales ocultas.

**Pruebas faltantes:** R03-00..30 prueban que un CDC real no se mutila y que los textos libres convencionales se saneen, pero NO un texto libre de 44 dígitos que contiene un secreto. Tampoco comprueban `mensaje`/listas con contraseña numérica de 44 dígitos o una credencial numérica corta dentro de un texto libre de 44.

**La corrección NO es reintroducir el reemplazo global:** separar procedencia de la información fiscal confiable de textos arbitrarios. Proteger sólo los campos/caminos fiscales SEMÁNTICAMENTE reconocidos (e.g. `cdc` operativo, `cdcInformado`, `response.DE.CDC`, identificadores con esquema de API realmente documentado), y sanear textos libres, mensajes, errores, claves sensibles y arreglos sin campo fiscal. No confiar sólo en `/^\d{44}$/` para otorgar excepción en todos los valores. El CDC auténtico recibido en el campo fiscal nunca debe modificarse. Una contraseña que coincide con un identificador fiscal auténtico sólo se maneja con separación de contexto y controles de acceso; no debe estar disponible fuera de los destinos fiscales autorizados.

**Corrección autorizable R04:** focal en `gateway.ts` y casos reales `cdc-inmutable-r03.casos.ts` (agregar casos identificados R04); únicamente otras suites fuente si los contratos cambiaron inevitablemente. No tocar campos fiscales, SQL, CDC históricos, estados del banco, worker ni NEX-077/NEX-078.

## 4. Gate de despliegue y evidencia real

- Las cuatro FE `001-003-0009018..0009021` todavía requieren lectura autorizada del intento persistido para demostrar que este bug originó sus `CDC_DIVERGENTE`. Que exista una falla en código NO demuestra su causalidad en esa base; no forzar `RECHAZADO/1101` ni alterar histórico por SQL.
- Un nuevo resultado oficial SIFEN correlacionado podrá, en una operación posterior autorizada, completar el CDC `NULL` con los 44 dígitos EXACTOS devueltos; nunca reconstruir ni inventar valores.
- `instrumentation.ts` e `iniciarPlanificador` existen; NEX-077 aplicada y worker efectivamente corriendo en VM siguen **NO CONFIRMADOS**; no activar worker ni cron alternativo por esta orden.
- NEX-078 sigue gate separado; activar el código dependiente sin la columna `empresas.fe_max_lineas` bloquea FE nuevas con HTTP 422. No autoriza SQL ni deploy.

**Estado:** PRO-338 `In Review`, R03 **NO CONFORME** (seguridad), ordenar **R04 focal** y después parar para auditoría independiente. PRO-340 no autorizada.
