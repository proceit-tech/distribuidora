# Provisionamiento del gateway de facturación electrónica de PRUEBA (PRO-133)

**Estado:** automatizado y versionado; **NO aplicado en la VM**. Impedimentos reales (AUD-PRO133-R01): Claude Code no tiene acceso SSH/Docker/PostgreSQL autorizado (`CLAUDE.md`) ni acceso al cofre privado con el RUC y la clave del emisor de prueba. No se simuló ninguna instalación. Mientras no se ejecute, la factura responde HTTP 409 antes de reservar número y la pantalla muestra «Sin configurar» con el envío bloqueado.

**Quién ejecuta:** el **agente autorizado** (con acceso a la VM y a la fuente privada de credenciales). No se le pide al responsable escribir SQL ni editar secretos.

## Qué se ejecuta (un solo comando, idempotente y reversible)
`documentacao/banco/nexit/v1/scripts/provisionar-gateway-prueba.sh` (+ `provisionar-gateway-prueba.sql`, invocado por el script):

| Modo | Efecto |
|---|---|
| `--verificar` (por defecto) | Solo lectura: identifica la empresa, el estado de la fila y la presencia de las variables en `app.env` y en el contenedor `app`. Sale 0 si está LISTO, 10 si está pendiente. |
| `--aplicar` | (1) Verifica Docker, `app.env`, la identidad de PostgreSQL y el privilegio de escritura **antes** de cambiar nada; (2) crea/confirma la fila de `fe_gateway_config` de la empresa; (3) escribe `NEXIT_FE_<REF>_RUC/PASSWORD` en `app.env` (copia previa con marca de tiempo, modo 600); (4) recrea **solo** `app` si hizo falta; (5) verifica la presencia de las dos variables en el contenedor sin mostrar valores. |
| `--revertir` | Desactiva (no borra) la fila, retira las dos variables de `app.env` (con copia) y recrea `app`. |

Ejemplo (agente autorizado, en la VM): `NEXIT_PROVISION_RUC=… NEXIT_PROVISION_PASSWORD=… ./provisionar-gateway-prueba.sh --aplicar --razon-social "CASA MINGO"` (o `--credenciales-archivo` con permisos 600). Los valores vienen de la fuente privada del agente; nunca de argumentos, Git, Linear, chat ni logs.

## Garantías
- **Empresa:** se identifica por **razón social** y debe ser **única** (si no, aborta con la lista de coincidencias); no se presume ningún código.
- **PostgreSQL:** usuario y base se leen de `POSTGRES_USER`/`POSTGRES_DB` del contenedor de la base (sin rol fijo); el SQL comprueba `INSERT`/`UPDATE` sobre `fe_gateway_config` y, si falta, aborta **sin cambios**.
- **Idempotencia:** repetir `--aplicar` no duplica filas, no copia `app.env` ni recrea `app` si todo ya está correcto. Una configuración **distinta** ya existente no se sustituye (aborta: decisión humana).
- **Alcance:** solo `fe_gateway_config` y `app.env`. Sin migrations (exige NEX-047 ya aplicada), sin numeración, sin documentos, **sin login ni envío al gateway**.
- **Datos ya documentados (no se piden de nuevo):** servidor `https://gateway-bebidas-py.e-factura-hub.com`, `POST /api/login`, `/api/recepcion_de`, `/api/consulta_de` (`documentacao/v1/REQUISITOS-FACTURACION-ELECTRONICA-API-EXTERNA-2026-10-12.md`). Convención: `credencial_ref = CASAMINGO` → `NEXIT_FE_CASAMINGO_RUC` y `NEXIT_FE_CASAMINGO_PASSWORD`.

## Estados en la pantalla
`SIN_CONFIGURAR` (lectura correcta sin fila activa), `INVALIDA`, `SIN_CREDENCIALES`, `CONFIGURADO` y `NO_DISPONIBLE` (falló la consulta a la base: no se afirma que falte la configuración). Solo `CONFIGURADO` habilita «Enviar factura». `CONFIGURADO` no prueba conexión ni que el gateway acepte las credenciales; eso solo lo demuestra un login real, que requiere otra autorización.

## Pruebas
Las pruebas versionadas ejecutan el script contra un «docker» simulado con credenciales **sintéticas** (idempotencia, abortos sin cambios, ausencia de secretos en salidas y argumentos, reversión). No sustituyen una ejecución real en la VM.
