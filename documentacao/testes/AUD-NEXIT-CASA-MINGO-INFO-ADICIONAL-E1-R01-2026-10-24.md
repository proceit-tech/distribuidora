# AUD-NEXIT-CASA-MINGO-INFO-ADICIONAL-E1-R01 — Auditoría independiente

**Fecha:** 24/10/2026  
**Repositorio:** `proceit-tech/distribuidora`  
**Branch:** `feature/NEXIT-2026-001-banco-demo`  
**Commit funcional auditado:** `713acf9de4e9e0614023abe093d1d9bfb792fdf4`  
**Linear:** PRO-93 (FE) y PRO-94 (NCE)  
**Contrato:** `documentacao/definicoes/REQ-NEXIT-CASA-MINGO-CIERRE-V1-2026-10-24.md`.

## Método y restricciones

Se confirmó commit/HEAD y diff, y se leyeron `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, las secciones pertinentes de `PROGRESSO-NEXIT-V1.md`, el requisito, la implementación real en `info-adicional.ts`, `emision.ts`, `nce.ts`, `payload-fe.ts`, `payload-nce.ts`, `entrega.ts`, rutas `app/api/facturas/{previa,route}` y `app/api/notas-credito/{previa,route}`, el controlador `revision-factura.ts`, pruebas E1 y las funciones SQL NEX-062/NEX-070 para el almacenamiento de `nce_origen.observacion`.

**No se ejecutaron las pruebas locales ni PostgreSQL, navegador, proveedor/gateway, VM, Docker, migrations o deploy.** Los resultados `info-adicional-e1 12/0`, `entrega-e04 61/0`, regresiones puntuales y TypeScript/ESLint son **declarados por Claude**, no reproducidos por este auditor.

## Matriz R01

| Criterio E1 | Evidencia | Resultado |
|---|---|---|
| FE: dirección elegida, no domicilio fiscal | `prepararFactura` usa `destino.opcion` después de `resolverEntrega` del servidor y genera `lineaEntrega(resumenEntrega(...))`; `dDirRec` sigue del receptor | CONFORME estático |
| FE/NCE vendedor sesión/empresa | `vendedorDe` consulta `usuarios WHERE empresa_id=$1 AND id=$2`; FE lo usa en `prepararFactura` y NCE en `prepararNce` | CONFORME estático, con F002 |
| Nombre del campo J003 | `construirPayloadFE` y `construirPayloadNCE` envían `dInfAdic` ya existente | CONFORME estático |
| Límite final y error previo | Composición final se mide `>5000`; FE/NCE lanzan 422 sin reservar antes del SQL | CONFORME estático |
| Snapshot de documento creado y reintento | `infoAdicionalPersistida` consulta el primer payload del documento por empresa y clave; SQL NEX-062/NEX-070 persiste la NCE desde `p_payload->>'dInfAdic'` | CONFORME parcial, sin ejecución DB; F003 sobre intervalo previa/envío |
| Corrección de NCE rechazada sin perder observaciones | `propuestaCorreccion` llama `separarObservacion` sobre `nce_origen.observacion`, eliminando cualquier línea final que coincida con regex | **NO CONFORME: F001** |
| Vendedor atribuible inequívocamente | Las observaciones arbitrarias con `Vendedor:` se mezclan con el rótulo generado de la cuenta y se imprimen en un solo texto; prueba E1-06 incluso espera ambos rótulos | **NO CONFORME: F002** |
| Identidad del texto entre previsualización y confirmación | FE `/api/facturas/previa` y `/api/facturas` llaman `prepararFactura` separadamente; NCE `/api/notas-credito/previa` y `/api/notas-credito` llaman `prepararNce` separadamente; nombre de `usuarios` se consulta otra vez. La huella de revisión compara el cuerpo navegador, no el `dInfAdic` reconstruido en servidor | **NO CONFORME: F003** |
| Alcance PDF/gateway/IVA/stock | No se modificaron `/api/kude`, layout, IVA, funciones de creación SQL ni stock | CONFORME en diff |

## E1-F001 — MEDIA — Eliminación de observaciones legítimas en la corrección de NCE rechazadas

**Ubicación:** `lib/facturacion/info-adicional.ts`, `separarObservacion`; `lib/facturacion/nce.ts`, `propuestaCorreccion`. SQL `NEX-062` y `NEX-070` guardan en `nce_origen.observacion` el valor completo `p_payload->>'dInfAdic'` sin marcador de procedencia.

**Defecto reproducible:** `separarObservacion("Entrega especial\nVendedor: Pablo")` devuelve `"Entrega especial"`, aunque `Vendedor: Pablo` puede ser una observación legítima de una NCE histórica creada antes de E1. Igualmente `Dirección de entrega: ...`. Se identifica por el prefijo sin evidencia de ser línea automática. Viola preservación de observaciones.

**Corrección mínima exigida:** nunca eliminar texto del operador si no existe una marca/origen verificable de la línea generada. Proponer una separación confiable entre observaciones crudas y rótulos automáticos, compatible con NCE históricas sin marca. La ambigüedad heredada debe resolverse conservando la observación, no descartándola. Evitar introducir campo alternativo en JSON de proveedor ni migration por defecto. Probar NCE previa a E1 terminada en `Vendedor:` o `Dirección de entrega:`, y NCE E1 rechazada en que la línea automática debe retirarse/recomponerse una sola vez.

## E1-F002 — MEDIA — Etiquetas automáticas pueden confundirse con observaciones manuales

**Ubicación:** `info-adicional.ts`, `componerInfoAdicional`; caso E1-06 en `entrega-e04.casos.ts`.

**Defecto reproducible:** el operador escribe `Vendedor: Otro` como observación y el servidor añade `Vendedor: Juan Pérez`. El KuDE puede mostrar dos vendedores contradictorios sin distinguir el texto libre del emisor validado. El propio test E1-06 considera correcta esa duplicación de rótulo.

**Corrección mínima:** preservar íntegramente la observación, pero renderizarla/identificarla como texto aportado por el operador, separado de los rótulos automáticos autoritativos. No permitir que la observación se interprete como nombre oficial de vendedor ni aceptarla como prueba de que ya se incluyó la línea automática. Sin alterar identidad autentificada y sin reescribir el PDF; todo se resuelve en el texto `dInfAdic`. Probar entrada con rótulos `Vendedor:` y `Dirección de entrega:` y nombres discrepantes.

## E1-F003 — MEDIA — Texto de dInfAdic puede cambiar entre la previa y la emisión sin invalidación de revisión

**Ubicación:** `prepararFactura` y `prepararNce` vuelven a leer `usuarios` en cada solicitud; las rutas de previa y emisión llaman los servicios por separado. `crearControlRevision` garantiza únicamente la identidad del cuerpo enviado por el navegador; vendedor y dirección textual se agregan en servidor y no forman parte de esa huella.

**Reproducción conceptual basada en código:** el operador revisa FE/NCE con usuario `Juan Pérez`; otro administrador modifica `usuarios.nombre` a `Juan Gómez` antes de «Enviar». El cuerpo de la UI no cambió, por lo que la revisión sigue válida; el servidor recompone `Vendedor: Juan Gómez` al crear el documento. En FE también puede cambiar la descripción de una dirección seleccionada entre solicitudes, aun con su ID igual. El snapshot persiste desde la creación, **no desde la previa**. El resumen de revisión tampoco muestra `dInfAdic` compuesto, por lo cual el operador no puede comprobar esa discrepancia.

**Corrección mínima:** asegurar que los datos comerciales autoritativos que se imprimen corresponden a los **efectivamente revisados**; ante cambio entre previa y confirmación, exigir nueva revisión (409), sin confiar en nombre suministrado por navegador y sin cambiar la idempotencia de documentos ya creados. Definir y probar una comprobación/huella del texto final o equivalente segura: nombre y dirección se mantienen estables o revisión se invalida ante cambio. Mantener reenvíos de documentos ya creados con snapshot original, sin reservas extra ni nuevas escrituras no autorizadas.

## Testes focales para R02 (sin suites globales)

- NCE histórica con observación final legítima `Vendedor:`, `Dirección de entrega:`; rechazo/recarga sin pérdida.
- NCE E1 rechazada: observaciones propias preservadas, auto-vendedor anterior retirado y nuevo emisor insertado una vez.
- FE/NCE con texto manual `Vendedor: Otro`; la atribución autenticada permanece inequívoca.
- FE/NCE entre previa/emisión: cambio de nombre usuario; FE cambio de etiqueta/dirección de entrega; exigir revisión vigente o reutilización del snapshot legítimo.
- Retentativa con clave ya emitida mantiene exactamente su `dInfAdic`, aunque cambie usuario/catálogo; no duplicar ni reservar otra numeración.
- Límites J003 5000/5001, tenant/ACL, ausencia de dirección y nombres, `dInfAdic` único en JSON.
- Testes puntuales TS/ESLint y regresiones mínimas de FE/NCE/huella, no build o suites globales.

## Dictamen

**E1-R01: CORRECCIÓN SOLICITADA — tres hallazgos MEDIA.** Las principales funciones E1 están presentes y respetan el nombre del contrato, pero los hallazgos F001/F002/F003 impiden dar por cerrada la auditoría. Las pruebas aprobadas por Claude no cubren estos escenarios. Ningún bloqueo de VM/SQL o gateway fue verificado independientemente.

**Próximo paso:** Claude corrige **sólo F001–F003**, ejecuta pruebas focales, publica commit y **PARA para auditoría ChatGPT E1-R02**. No iniciar E2 Usuarios ni modificar cabecera/layout KuDE, gateway PDF, fiscalidad, stock, numeração, permisos, VM, SQL aplicado o deploy. **NO HOMOLOGADO**, no marcar Done.
