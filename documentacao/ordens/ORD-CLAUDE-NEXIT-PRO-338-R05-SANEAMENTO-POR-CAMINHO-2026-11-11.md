# ORDEN CORRECTIVA CLAUDE — PRO-338-R05 / Rutas fiscales confiables y sanitización segura

**Fecha:** 11/11/2026
**Repositorio:** `proceit-tech/distribuidora`
**Branch:** `feature/NEXIT-2026-001-banco-demo`
**Issue:** [Linear PRO-338](https://linear.app/proceit/issue/PRO-338) · [GitHub #12](https://github.com/proceit-tech/distribuidora/issues/12)
**Commit funcional auditado:** `aa056e34fae19d24a9950610632d6276dbde2134`
**Auditoría vinculante:** [AUDITORÍA PRO-338-R04](../testes/AUD-NEXIT-PRO-338-R04-CDC-SANEAMENTO-POR-CAMINHO-2026-11-11.md)
**Estado:** R04 NO CONFORME; **UN hallazgo R04-F001**. **ÚNICA ORDEN DE CÓDIGO AUTORIZADA: R05 FOCAL**, luego PARAR para ChatGPT. PRO-340 NO autorizada.

## 1. R04-F001: el nombre de un campo NO prueba procedencia fiscal

En `gateway.ts:90–134`, `IDENTIFICADORES_FISCALES` y `esIdentificadorFiscal(clave,valor)` eximen campos llamados `CDC`, `cdcInformado`, `lote`, `dNumDoc` etc. de la sustitución de secretos SI su texto cumple un patrón, **sin validar el camino JSON**. `sanearValor` transmite a los descendientes sólo el nombre de la clave inmediata, no el contexto de ruta. Por eso:
- `respuesta.response.DE.CDC` auténtico se preserva (CORRECTO).
- `respuesta.response.Nota.CDC` arbitrario con 44 dígitos que contienen una contraseña sintética también se preserva (INCORRECTO: no es la ruta fiscal acreditada).
- `respuesta.response.Nota.lote="claveSintetica123"`, con la contraseña igual a ese texto, pasa `FORMATO_LOTE` y se conserva sin omisión (INCORRECTO).
- El permiso de mantener una clave `EEE-PPP-NNNNNNN` cuando está en una lista llamada `Aceptados/Rechazados` tampoco verifica que tal lista se encuentre en la ubicación fiscal oficial; documentar y limitar este caso.

La corrección R04 sí eliminó el bypass anterior de **cualquier texto de 44 dígitos** por forma, pero falta cerrar el bypass **por nombre de propiedad sin procedencia**.

## 2. Corrección limitada — RUTAS y CAMPOS oficiales, no heurísticas globales

1. Leer `CLAUDE.md`, esta orden, la auditoría, y archivo COMPLETO y MÁS RECIENTE **uno por vez**. Inspeccionar `lib/facturacion/gateway.ts` completo, tipos `ResultadoConsulta/ResultadoEnvio`, `interpretarConsulta`, `interpretarRecepcion`, `respuestaParaGuardar`, `sinSecretos`, `resultadoFiscalSinSecretos` y sus casos reales. Verificar los ejemplos exactos del proveedor ya implementados, sin suponer esquemas nuevos.
2. Hacer que la decisión de preservar un identificador sin saneamiento dependa del **origen y la ruta fiscal confiables**, no sólo de `clave+regex`: el CDC operativo de los campos propios tipados `cdc`/`cdcInformado`, el CDC de consulta `respuesta.response.DE.CDC`, y el CDC oficial de recepción/envío en rutas verificadas. Conservar también `dEst/dPunExp/dNumDoc`, serie, código de respuesta, lote real y claves de Aceptados/Rechazados sólo en las rutas oficiales que realmente correspondan, con validación estricta de formato. Si la salida actual usa más de una forma contractual para el CDC en envío, identificarlas por inspección de las funciones reales y cubrirlas con casos; **no inventar rutas**.
3. Para campos no oficiales, incluso con nombres `CDC`, `lote`, `dNumDoc`, `codRespuesta` o listas `Aceptados/Rechazados`, **aplicar saneamiento de textos libres**, incluidos números de 44 dígitos, contraseñas completas o parciales, tokens y Bearer/JWT, preservando seguridad de mensajes, errores y logs. Las listas de texto plano nunca se convierten en rutas fiscales por tener el mismo valor o nombre.
4. Mantener el **CDC auténtico íntegro y exactamente como lo devolvió la API**, sin generar, modificar, completar, reconstruir ni enmascarar valores operacionales. Consulta `/api/consulta_de` NO envía CDC. El CDC inicial sólo se fija tras respuesta verificada; si ya existe y API devuelve otro, NO sobrescribir. Preservar guardas `fe_cdc_coherente`, estados SIFEN, historial y SQL. El fix no debe restablecer la sustitución sobre `JSON.stringify` global, ni tratar de «arreglar» CDC histórico ya mutilado.
5. No modificar la UX `presentacion-sifen.ts` ni las etiquetas que ya distinguen `cdc=NULL` de CDC previo, salvo evidencia clara de otra falla. No tocar worker, NCE, FE/NCE stock, KuDE, impuestos, PRO-339/341, migrations NEX-077/078 ni infraestructura.
6. Preferir **sólo** `lib/facturacion/gateway.ts` y `lib/facturacion/cdc-inmutable-r03.casos.ts`. Si el refactor requiere un helper nuevo, justificar antes de expandir alcance.

## 3. Casos R05 a ESCRIBIR, NO EJECUTAR

Los casos deben ejercitar **funciones REALES** (`sinSecretos`, `consultarDocumentoGateway`, `enviarDocumentoGateway`, `interpretarConsulta`, `interpretarRecepcion`, `consultarEstado`) con `fetch`, env y base SIMULADOS, sin credenciales reales.

Agregar al menos:
- CDC legítimo con contraseña sintética coincidente con RUC, tanto en `resultado.cdc` como en `resultado.respuesta.response.DE.CDC`: valor EXACTO e intacto.
- Campo libre `respuesta.response.Nota.CDC` de 44 dígitos con secreto sintético incluido: redacción del secreto; **NO preservar sólo porque se llame CDC**.
- Campo libre `respuesta.response.Nota.lote` que coincida íntegramente con la contraseña sintética alfanumérica (1–60 chars, formato válido de lote): queda `[omitido]`.
- Otros nombres `dNumDoc`, `codRespuesta`, `cdcInformado` fuera de contrato legítimo y con secreto en mensaje/notas: redactar, no eximir por nombre.
- Listas `respuesta.response.Aceptados/Rechazados` legítimas con claves `EEE-PPP-NNNNNNN` preservadas, versus `respuesta.response.Nota.Aceptados` falsos sin excepción especial; no perder correlación de rechazo.
- CDC legítimo de recepción/envío (todas las variantes soportadas en fuente), `lote` real y eco `dEst/dPunExp/dNumDoc` intactos en rutas oficiales, mensaje libre de 44 dígitos saneado, y no mutación del original.
- Primera consulta `d.cdc=NULL` con `Rechazado/1101/Número de timbrado inválido` asociado al documento y `cdc` íntegro; CDC de otra FE y CDC distinto al previamente registrado siguen protegidos.
- Credencial numérica de 44 dígitos y una credencial corta dentro de un valor numérico de 44 en campo libre; ambos deben ocultarse.
- Actualizar sólo expectativas fuente realmente obsoletas. No considerar prueba de componente React/SQL real ni afirmar que se ejecutó.

## 4. Restricciones, publicación y STOP

**PROHIBIDO:** ejecutar tests/casos/runner, lint, typecheck, build, CI, SQL, migrations, PostgreSQL, VM/Docker, navegador de cliente, gateway real, deploy, reenvío/cancelación o modificación de estados fiscales. No crear worker/monitor alternativo.

Se permite únicamente código y casos **escritos**, no ejecutados. Trabajar un archivo COMPLETO/ACTUAL por vez. Publicar commit y push en la branch autorizada, SHA COMPLETO, lista exacta de archivos, casos escritos/0 ejecutados y explicación del cierre del bypass por ruta fiscal.

**PARAR para auditoría independiente ChatGPT PRO-338-R05. PRO-340 no se inicia.**

**GATES OPERATIVOS:** Las cuatro FE del incidente original requieren evidencia de intento real para atribuir la causa y consulta oficial autorizada posterior si corresponde. NEX-077 (worker) y NEX-078 (límite comercial FE) aún necesitan verificación real de aplicación; activar código dependiente sin NEX-078 provoca 422 a toda FE nueva. La orden no autoriza implantación.
