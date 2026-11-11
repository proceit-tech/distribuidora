# ORDEN CORRECTIVA CLAUDE — PRO-338-R04 / Saneamiento por procedencia sin fuga de secretos

**Fecha:** 11/11/2026
**Repositorio/branch:** `proceit-tech/distribuidora` · `feature/NEXIT-2026-001-banco-demo`
**Linear:** [PRO-338](https://linear.app/proceit/issue/PRO-338) · **GitHub:** [#12](https://github.com/proceit-tech/distribuidora/issues/12)
**Commit R03 auditado:** `53c820479b900c37fe0196edb4df1e5d280a1207`
**Informe vinculante:** [AUD PRO-338-R03](../testes/AUD-NEXIT-PRO-338-R03-CDC-INMUTABLE-SEGURIDAD-2026-11-11.md)
**Veredicto:** R03 **NO CONFORME** por **UN HALLAZGO DE SEGURIDAD R03-F001**; preservar CDC operativo y UX de divergencia ya están conformes estáticamente.
**ÚNICA ORDEN ACTIVA:** R04 focal. PRO-340 NO autorizada. Sin pruebas ni deploy.

## 1. R03-F001 — Por qué el código sigue sin cumplir

En `lib/facturacion/gateway.ts:103–117`, `esIdentificadorFiscal(clave,valor)` retorna `true` **para cualquier cadena de 44 dígitos, independientemente de la clave**. Por eso `sanearValor` se salta `omitirEn` para un valor con apariencia de CDC incluso dentro de `mensaje`, `Nota`, errores o una lista no fiscal. Si ese texto libre contiene la contraseña de API (RUC sintético o clave numérica larga) se guardará/expondrá sin enmascarar. No basta preservar formato de 44 dígitos; hay que verificar la PROCEDENCIA fiscal confiable del valor antes de exceptuarlo de saneamiento.

**NO volver al reemplazo sobre `JSON.stringify` completo**, porque ese fue el defecto de corrupción de CDC del D03.

## 2. Corrección MÍNIMA exigida

1. Leer **CLAUDE.md**, auditoría R03, orden actual, todos los archivos COMPLETOS y ACTUALES **UNO POR VEZ**. Inspeccionar ambos contratos reales `interpretarConsulta`, `consultarDocumentoGateway`, `interpretarRecepcion`, `enviarDocumentoGateway`, `respuestaParaGuardar`, `sanearRespuesta`, `sinSecretos`, `resultadoFiscalSinSecretos`, `cdcCoherente`, mensajes/fases/errores y las suites de gateway.
2. Distinguir **campos de identidad fiscal reconocidos por la API** (p.ej. `ResultadoConsulta.cdc`, `ResultadoEnvio.cdc`/`cdcInformado`, `response.DE.CDC` y campos exactos de número fiscal/CDC contemplados en la estructura del gateway) de **campos libres no confiables** (`mensaje`, `message`, `Nota`, errores, fases, arrays de texto y otras propiedades no documentadas). Sólo los primeros pueden conservarse SIN alteración, porque representan el dato fiscal que la API entregó. La etiqueta de la clave debe estar fundamentada por el recorrido de propiedades/estructura validada, NO sólo por el valor numérico.
3. `sinSecretos` debe sanear por campo/destino incluso cadenas de 44 dígitos en campos libres, o valores numéricos de apariencia fiscal cuando no provienen de campos confiables; una contraseña conocida coincidente total o parcialmente con un texto libre siempre debe omitirse. Mantener el saneamiento de tokens, Bearer/JWT, nombres de campos secretos y mensajes de error, sin mutar el objeto original. Cuidar claves de objetos `Aceptados/Rechazados` con número fiscal `EEE-PPP-NNNNNNN` cuya correlación se requiere; sólo preservarlas en las rutas con contrato inequívoco.
4. **CDC INMUTABLE:** el CDC operativo **jamás** se genera, reconstruye, completa, modifica, enmascara ni sobrescribe por NEXIT; se recibe de la API. El primero sólo se registra si `d.cdc=NULL` y la identidad fiscal es coherente, tal como venía de la API (44 dígitos); si hay uno previo y la API entrega otro, NO reemplazar. También `response.DE.CDC` debe seguir intacto como identificador fiscal auténtico recibido en la respuesta, con controles de acceso, y ambos `consultarDocumentoGateway` y `enviarDocumentoGateway` preservan el valor sin sustituir por `[omitido]`.
5. Evitar una solución que sanee el CDC funcional pero deje otro CDC auténtico mutilado en campos fiscales legítimos o deje la contraseña expuesta en campos libres. Si el contrato trae CDC legítimos en otros campos, documentar ruta exacta y agregar caso; no permitir exención global de cualquier valor de 44 dígitos.
6. Preservar **íntegro PRO-338-R03 ya conforme**: mensajes distintos de `CDC_DIVERGENTE` según CDC previo, `Rechazado/1101/Número de timbrado inválido` cuando identidad válida, protección de estado final/SQL, intento histórico, NCE, KuDE, CDC, `MAX_LINEAS`, stock, IVA, FE, PRO-339/341 y scheduler. No tocar `presentacion-sifen.ts`/`estados.ts`, APIs, SQL ni migraciones si la corrección es sólo en gateway/seguridad y casos.

## 3. Casos fuente OBLIGATORIOS (ESCRIBIR, NO EJECUTAR)

Usar funciones REALES `sinSecretos`, `consultarDocumentoGateway`, `enviarDocumentoGateway`, `interpretarConsulta`, `interpretarRecepcion`, `consultarEstado` con dependencias simuladas; no un modelo nuevo que no ejercite el camino de producción. Mantener R03-00..30 íntegros o ajustar aserciones sólo si realmente incompatibles con el contrato seguro.

Añadir casos dirigidos **R04**:
- `mensaje` con **exactamente 44 dígitos** que contiene una contraseña numérica corta (p. ej. RUC sintético): **debe ocultar la contraseña**, no tratarse como CDC.
- `mensaje`/campo libre con contraseña numérica de 44 dígitos exactos: no mostrar el secreto completo. Con contraseña/token alfanumérico de apariencia fiscal, también ocultar donde corresponda.
- Lista de errores o campo `Nota`/array con texto numérico de 44 dígitos que contiene una credencial: no se exime por patrón.
- Contraste: **`response.DE.CDC` y `cdc` fiscal auténtico** de 44 dígitos que incluyen el RUC/contraseña sintética mantienen **valor idéntico**, mientras un `mensaje` de 44 dígitos con esa misma secuencia se sanea.
- Envío: respuesta de `recepcion_de` con CDC verdadero en campo fiscal + error/aviso libre en formato numérico: preservar CDC y sanear aviso; no perder la identificación `EEE-PPP-NNNNNNN` de `Rechazados`.
- CDC de otra FE vs documento consultado y CDC previo distinto siguen protegidos; ningún UPDATE manual.
- Asegurar que los secretos no aparecen en los textos libres, respuestas de evidencia y logs, y no cambian códigos fiscales válidos/fechas/lotes en rutas declaradas.

Describir claramente cuáles escenarios son **modelos/funciones reales simuladas** y cuáles requieren verificación runtime. No afirmar conformidad de suite sin ejecutarla.

## 4. Prohibiciones y entrega

- **NO ejecutar** tests/casos, runner, lint, typecheck, build, CI manual, SQL/migrations/PostgreSQL, Docker/VM, navegador de cliente, gateway real ni deploy.
- **NO reconstruir CDC antiguos**, no alterar `cdc` ni `estado_sifen` por SQL, no reenviar/consultar SIFEN automáticamente para «reparar» histórico, no iniciar worker ni crear cron/monitor nuevo. NEX-077 y NEX-078 siguen gates separados.
- **PRO-340 queda bloqueada**. No ampliar alcance hacia UI ni servicios.
- Preferir cambios sólo en `lib/facturacion/gateway.ts` y `lib/facturacion/cdc-inmutable-r03.casos.ts`; modificar `scripts/casos-clientes/run.js` sólo si hay una suite adicional que registrar. Reportar previamente razón técnica si hace falta ampliar el alcance.
- Commit+push a la branch autorizada con **SHA COMPLETO**, lista exacta de archivos, casos R04 escritos/0 ejecutados, explicación de por qué ya no se puede filtrar un secreto de texto libre por semejanza con CDC, y **PARAR para auditoría independiente ChatGPT PRO-338-R04**.

**La auditoría R04 sigue siendo estática.** Antes de deploy: evidencia de cuatro FE reales, estado NEX-077/078, prueba runtime y autorización del responsable. No se autoriza en esta orden.
