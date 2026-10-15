# Provisionamiento del gateway de facturación electrónica de PRUEBA (PRO-133)

**Estado:** automatizado y versionado; **NO aplicado en la VM**. Impedimentos reales (AUD-PRO133-R01/R02): Claude Code no tiene acceso SSH/Docker/PostgreSQL autorizado (`CLAUDE.md`) ni acceso al cofre privado con el RUC y la clave del emisor de prueba. No se simuló ninguna instalación. Mientras no se ejecute, la factura responde HTTP 409 antes de reservar número y la pantalla muestra «Sin configurar» con el envío bloqueado.

**Quién ejecuta:** el **agente autorizado** (con acceso a la VM y a la fuente privada de credenciales). No se le pide al responsable escribir SQL ni editar secretos.

## Qué se ejecuta (un solo comando, idempotente y reversible)
`documentacao/banco/nexit/v1/scripts/provisionar-gateway-prueba.sh` (+ `provisionar-gateway-prueba.sql`, invocado por el script):

| Modo | Efecto |
|---|---|
| `--verificar` (por defecto) | Solo lectura: identifica la empresa, el estado de la fila, la presencia de las variables en `app.env` y en el contenedor `app`, y si una ejecución anterior quedó a medias. Sale 0 si está LISTO, 10 si está pendiente. |
| `--aplicar` | **Pre-validaciones sin cambios** (NEX-047 presente, empresa única, credenciales representables y sin conflicto con las preexistentes, `app.env` escribible, Compose válido) → fila de `fe_gateway_config` (verifica privilegio antes) → copia previa de `app.env` (modo 600) y escritura de `NEXIT_FE_<REF>_RUC/PASSWORD` → recreación **solo** de `app` si hizo falta → verificación de que el contenedor recibió el valor **exacto** (sin mostrarlo). |
| `--revertir` | Deshace **solo lo propio** (ver abajo). |

Ejemplo (agente autorizado, en la VM): `NEXIT_PROVISION_RUC=… NEXIT_PROVISION_PASSWORD=… ./provisionar-gateway-prueba.sh --aplicar --razon-social "CASA MINGO"` (o `--credenciales-archivo` con permisos 600). Los valores vienen de la fuente privada del agente; nunca de argumentos, Git, Linear, chat ni logs.

## Garantías
- **Empresa:** se identifica por **razón social** y debe ser **única** (si no, aborta); no se presume ningún código.
- **PostgreSQL:** usuario y base se leen de `POSTGRES_USER`/`POSTGRES_DB` del contenedor de la base (sin rol fijo); el SQL comprueba `INSERT`/`UPDATE` y, si falta, aborta **sin cambios**. Sin `fe_gateway_config` (NEX-047 ausente) devuelve `SIN_NEX047` **antes** de operar (la comprobación está fuera del bloque tipado) y no cambia nada.
- **Formato `env_file` de Docker Compose v2:** los valores se escriben entre **comillas simples** (valor literal: sin interpolación de `$`/`${…}`, sin escapes; `#`, espacios, comillas dobles, barras y `=` se conservan). Los valores **irrepresentables** (vacíos, con comilla simple, CR o LF) se rechazan antes de tocar nada. Tras recrear la app se compara el valor que el contenedor realmente recibió con el entregado. *Limitación de la verificación local:* el parser real de Compose no estaba disponible; las pruebas usan un «docker» simulado con la gramática documentada. La comparación real ocurre al ejecutar en la VM.
- **Permisos:** `app.env`, su copia previa, los temporales y el archivo de estado se crean con modo 600 explícito (`chmod` obligatorio; si falla, aborta). Las copias de seguridad de `app.env` (sufijo `.bak-<fecha>`) contienen secretos: se conservan con 600 y sin política de borrado automática.
- **Reversión de solo lo propio:** el archivo `$STACK/.provisionar-gateway-<REF>.estado` (600, sin secretos) registra qué cambió este provisionador (fila creada/reactivada; variables escritas o preexistentes). `--revertir` solo desactiva la fila si coincide **exactamente** con la URL y la referencia gestionadas **y** fue creada/reactivada por este provisionador; **no** toca una configuración distinta; **no** retira credenciales preexistentes ni compartidas con otra empresa (el SQL informa `COMPARTIDA=<n>`). Sin registro de proveniencia no cambia nada (código 11).
- **Credenciales preexistentes:** si `app.env` ya tiene `NEXIT_FE_<REF>_*` con otros valores, `--aplicar` no los sobrescribe (aborta, decisión humana).
- **Ejecución parcial:** si fallan la copia/escritura de `app.env`, la recreación de la app o la verificación, el script **compensa** (restaura `app.env` desde su copia y desactiva la fila **propia**) y declara «ESTADO FINAL: COMPENSADO» (código 9); nunca informa éxito. Reejecutar `--aplicar` converge; el estado parcial se muestra en `--verificar`.
- **Alcance:** solo `fe_gateway_config` y `app.env`. Sin migrations (exige NEX-047 ya aplicada), sin numeración, sin documentos, **sin login ni envío al gateway**.
- **Datos ya documentados (no se piden de nuevo):** servidor `https://gateway-bebidas-py.e-factura-hub.com`, `POST /api/login`, `/api/recepcion_de`, `/api/consulta_de` (`documentacao/v1/REQUISITOS-FACTURACION-ELECTRONICA-API-EXTERNA-2026-10-12.md`). Convención: `credencial_ref = CASAMINGO` → `NEXIT_FE_CASAMINGO_RUC` y `NEXIT_FE_CASAMINGO_PASSWORD`.

## Estados en la pantalla
`SIN_CONFIGURAR` (lectura correcta sin fila activa), `INVALIDA`, `SIN_CREDENCIALES`, `CONFIGURADO` y `NO_DISPONIBLE` (falló la consulta a la base: no se afirma que falte la configuración). Solo `CONFIGURADO` habilita «Enviar factura». `CONFIGURADO` no prueba conexión ni que el gateway acepte las credenciales; eso solo lo demuestra un login real, que requiere otra autorización.

## Pruebas
Las pruebas versionadas ejecutan el script (bash real) contra un «docker» simulado con credenciales **sintéticas**: idempotencia, abortos sin cambios, valores con caracteres especiales, permisos 600, reversión de lo propio/ajeno/compartido, compensación ante fallos y ausencia de secretos en salidas y argumentos. **No** ejecutan PostgreSQL (el SQL, incluida la guarda `\if` de NEX-047 ausente, queda sin ejecutar) ni el parser real de Compose; no sustituyen una ejecución real en la VM.
