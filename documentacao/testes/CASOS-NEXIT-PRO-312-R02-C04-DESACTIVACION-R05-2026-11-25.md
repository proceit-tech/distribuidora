# Casos PRO-312-R02-C04 — desactivación coordinada R05 (R-VM-085-01), corregidos en C04-C01

25/11/2026 · PR #7 Draft · rama `feature/NEXIT-2026-001-banco-demo` · C04 sobre `a55678f` (entrega `94c473b`) · C04-C01 sobre `30b423d`.
[Parecer C04](AUD-CHATGPT-NEXIT-PRO-312-R02-C04-DESACTIVACION-R05-2026-11-25.md) · [Orden C04-C01](../ordens/ORD-CLAUDE-NEXIT-PRO-312-R02-C04-C01-DESACTIVACION-R05-2026-11-25.md).
[Orden](../ordens/ORD-CLAUDE-NEXIT-PRO-312-R02-C04-DESACTIVACION-R05-2026-11-25.md) · [Auditoría NEX-085](AUD-CHATGPT-NEXIT-PRO-312-R02-C03-NEX-085-2026-11-25.md) · [Verificación VM](AUD-CHATGPT-NEXIT-PRO-312-R02-C03-NEX-085-VM-2026-11-25.md) · [Runbook](../infra/PROCEDIMENTO-DESACTIVACION-COORDINADA-R05-2026-11-25.md).

**Estado:** casos ESCRITOS, **NO EJECUTADOS**. El script `desactivar-envio-r05.sql` (SHA-256 C04-C01 `c831361ae51ef31bd1d90c0be5efb20e8ae631aecf460bfa3f1b74e38373703b`; la revisión C04 `d6c09c31d7e4616fd4ca3ed28b53ae0fb16f2124cbdeebc2ffdbde978d0d3ee8` queda sustituida) no se ejecutó en ninguna base; el CI no lo ejecuta (está fuera de `migraciones/`). No se desactivó ni reactivó R05 en la VM. Los 439 identificadores anteriores (391 de NEX-084 y C03-001…048 de NEX-085) se conservan por referencia. En C04-C01 se conservan los 56 IDs C04-001…056 (se ajustan las expectativas que cambian, señaladas en §3) y se añaden C04-057…084 (§3b). Los casos deben reproducirse en una base descartable con un rol `nexit_runtime` real.

## 1. Archivos

| Archivo | Cambio |
|---|---|
| `documentacao/banco/nexit/v1/scripts/desactivar-envio-r05.sql` | nuevo: script de operador, fuera de migraciones |
| `documentacao/infra/PROCEDIMENTO-DESACTIVACION-COORDINADA-R05-2026-11-25.md` | nuevo: runbook |
| `documentacao/testes/CASOS-NEXIT-PRO-312-R02-C04-DESACTIVACION-R05-2026-11-25.md` | nuevo: este documento |
| `documentacao/banco/nexit/v1/scripts/reversion-NEX-085.sql` | solo comentarios y HINT: apuntan al nuevo procedimiento (misma excepción, READ ONLY, siempre aborta) |
| `documentacao/banco/nexit/v1/scripts/verificar-NEX-085.sql` | solo el comentario de la prueba futura (paso 3) |
| `documentacao/testes/CASOS-NEXIT-PRO-312-R02-C03-NEX-085-2026-11-25.md` | solo C03-026/027/046 y la frase dependiente; los 48 IDs se conservan |

En C04-C01 solo cambian los tres archivos nuevos de C04 (script, runbook y este documento); C03, `reversion-NEX-085.sql` y `verificar-NEX-085.sql` no se tocan.

Sin cambios: NEX-001…085 (checksums NEX-084 `38d45ea6…6854` y NEX-085 `34f57411…c7d7`), `reversion-NEX-084.sql`, `verificar-NEX-084.sql`, preflights, runner, wrapper, base, CI, aplicación y `CLAUDE.md`. No se crea NEX-086.

## 2. Matriz de compatibilidad (revisión C04-C01)

| Versión | Checksum | Tratamiento |
|---|---|---|
| NEX-084 | `38d45ea661ed5d8f1dc3d43dc6b0f727f8872c6bdd0fbab5745cc7802f5b6854` | obligatoria |
| NEX-085 | `34f57411cef8f17c01f249b6e21e1904c8aa7aecd83718965bcfbadd4b29c7d7` | obligatoria |
| > NEX-085 o fuera de `NEX-NNN` | — | bloquea salvo par exacto en `suc_revisadas` (hoy vacío) |
| NEX-001…083 | — | cada versión exactamente una vez (comprobación versión por versión, no por cantidad) |
| NEX-000, nulos, duplicados, formatos no canónicos | — | bloquean siempre |

## 3. Casos C04-001…056 — ESCRITOS, NO EJECUTADOS

C04-C01 ajustó las expectativas de C04-001, 005, 009, 017, 018, 024, 025, 026, 027, 031, 040, 045, 046, 047 y 051 (mensajes nuevos, código de salida distinto de 0 sin `ON_ERROR_STOP`, conteos R05 y NEX-072 por separado, ACL completa). Los demás no cambian.

Precondición común salvo indicación: base DESCARTABLE `nexit_test_*` con NEX-001…085 aplicadas por el runner y un rol `nexit_runtime` real (no se usa ningún modo CI permisivo: el script exige el rol). Comando: el bloque del runbook §6 sobre esa base (valores tecleados, nunca prellenados).

| Id | Tema | Precondición | Operación | Resultado esperado |
|---|---|---|---|---|
| C04-001 | Combinación válida | Modo ACTIVO, 0 operaciones abiertas | Bloque del runbook §6 con `SI` tecleados y `huerfanas=0` | Código 0 (resultado B); informe `REVERTIDO (pendiente del COMMIT de psql)`, modo inicial ACTIVO, aislamiento `read committed`, abiertas 0, filas R05 y NEX-072 por separado; luego verificar-NEX-084 41/41 y verificar-NEX-085 24/24 sin desvíos |
| C04-002 | Checksum NEX-084 distinto | Fila NEX-084 con otro checksum | Script | Aborta `NEX-084 no está registrada con el checksum revisado`; sin cambios |
| C04-003 | Checksum NEX-085 distinto | Fila NEX-085 con otro checksum | Script | Aborta `NEX-085 no está registrada…`; sin cambios |
| C04-004 | NEX-085 ausente | Base con NEX-084 sin NEX-085 | Script | Aborta (NEX-085 obligatoria); ese escenario histórico corresponde a `reversion-NEX-084.sql` |
| C04-005 | Versión obligatoria ausente | Falta una fila NEX-0xx ≤ 085 (p. ej. NEX-017) | Script | Aborta `faltan versiones obligatorias de NEX-001…NEX-085: NEX-017` (C04-C01: validación por versión, no por cantidad) |
| C04-006 | Sucesora desconocida | Fila `NEX-086` registrada (descartable) | Script | Aborta `migración(es) posterior(es) sin revisión de compatibilidad: NEX-086 (…)` antes de bloquear la fila de modo |
| C04-007 | Sucesora revisada, hash distinto (futuro) | Revisión futura del script con `NEX-086` en `suc_revisadas`; fila con otro checksum | Script de esa revisión | Aborta: solo el par exacto versión+checksum autoriza |
| C04-008 | Sucesora revisada exacta (futuro) | Ídem con checksum exacto | Script de esa revisión | Pasa la compatibilidad; el resto de controles se aplica igual |
| C04-009 | Versión fuera de formato | Fila `X-001` en `schema_migrations` | Script | Aborta `versiones no canónicas o NEX-000 en schema_migrations: 'X-001'` (cerrado por defecto, también aunque estuviera en `suc_revisadas`) |
| C04-010 | Sin bypass | Variables extra (`-v permitir=SI`, etc.) | Script | Ignoradas: no existe ningún parámetro que relaje la compatibilidad |
| C04-011 | Rol ausente | Sin `nexit_runtime` | Script | Aborta `no existe el rol nexit_runtime` |
| C04-012 | Firma faltante | Una escritura, lectura, interno, función legada o NEX-062/080 eliminada (descartable) | Script | Aborta con la firma exacta en el mensaje |
| C04-013 | Dueño distinto | Un interno con otro dueño (descartable) | Script | Aborta `dueño distinto del ayudante en: …` |
| C04-014 | Usuario no autorizado | Ejecutar con un rol que no es dueño ni miembro | Script | Aborta antes de la fila de modo |
| C04-015 | Guarda no trigger | Un guarda redefinido con otro retorno | Script | Aborta `los cuatro guardas…` |
| C04-016 | Ayudante vulnerable | Ayudante restaurado al cuerpo de NEX-084 (sin REVOKE de runtime) | Script | Aborta `no es el corregido por NEX-085`; no lo redefine ni lo restaura |
| C04-017 | ACL previa incoherente | GRANT EXECUTE manual a runtime en un interno | Script | Aborta `ACL previa incoherente con NEX-085 en modo ACTIVO: interno/ayudante con EXECUTE…`; no hace REVOKE |
| C04-018 | PUBLIC previa | GRANT EXECUTE a PUBLIC en una escritura | Script | Aborta `ACL previa incoherente…: PUBLIC con EXECUTE en …` |
| C04-019 | Disparadores | Un disparador R05 deshabilitado | Script | Aborta `se esperaban 17 disparadores…` |
| C04-020 | `abiertas` alterada | Firma con otra salida | Script | Aborta `no tiene la forma de NEX-084` |
| C04-021 | Falta backup | Sin `-v backup_verificado` | Script | Aborta `falta -v backup_verificado=SI`; sin bloqueos tomados |
| C04-022 | Confirmación malformada | `backup_verificado=si` / `instrumentacion_desactivada=YES` | Script | Aborta (solo `SI` exacto) |
| C04-023 | Falta drenaje | Sin `drenaje_confirmado` | Script | Aborta |
| C04-024 | Huérfanas malformadas | `huerfanas=-1`, `1.0`, vacío o texto (pasado a psql sin el bloque del runbook) | Script | Aborta `falta -v huerfanas=N`; con el bloque del runbook el shell ya rechaza el valor antes de psql (C04-076) |
| C04-025 | Sin `-1` | Mismo comando sin `-1` | Script | `SET TRANSACTION`/`SET LOCAL` solo avisan fuera de transacción; el bloque aborta `no corre en una transacción única…` antes de bloquear; nada escrito; código ≠ 0 |
| C04-026 | Sin `ON_ERROR_STOP` | Comando con `-1` pero sin `ON_ERROR_STOP=1` | Script | El script activa ON_ERROR_STOP y fuerza `SELECT 1/0` antes de cualquier SQL de bloqueo: **código de salida distinto de 0 (3)**, sin commit, sin bloqueos tomados (comprobar `pg_locks` desde otra sesión), modo sin cambios |
| C04-027 | Entrada por stdin sin `-f -` | `psql -1 … < archivo` | Script | psql no aplica `-1` a stdin: aborta `no corre en una transacción única…` como C04-025; código ≠ 0 |
| C04-028 | Bloqueo del runner | Otra sesión con `pg_advisory_xact_lock(7340001)` abierto | Script | Espera ≤ 5 s y aborta por `lock_timeout`; sin cambios |
| C04-029 | Runner concurrente | Script en curso con el bloqueo; arrancar el runner | Runner | La transacción de cada migración del runner espera al script (mismo bloqueo); el wrapper final del runner no está cubierto: documentado en §4 del runbook |
| C04-030 | Fila de modo bloqueada | Otra sesión con `FOR UPDATE` en `nex_e03_r05_estado` | Script | Aborta por `lock_timeout` tras ≤ 5 s |
| C04-031 | Escritura R05 concurrente | Sesión A en una escritura R05 (tiene la fila FOR SHARE) sin confirmar | Script | Espera hasta 5 s; si A no confirma, aborta por `lock_timeout`; si A confirma antes, el script continúa con instantáneas nuevas (READ COMMITTED) y cuenta su actividad: reciente → aborta (ver C04-060/061) |
| C04-032 | Escritura tras desactivar | C04-001 confirmado; un proceso con testigo vivo llama a una escritura | Escritura como runtime | `permission denied` (sin EXECUTE) o, si ya pasó el control de EXECUTE, `NEX:E03_R05_REVERTIDO` |
| C04-033 | Corte único | Script con operaciones abiertas | Informe | `corte_bajo_bloqueo` es el usado para el conteo; las cifras no se recalculan |
| C04-034 | Frontera 10 min (dentro) | Operación abierta con última actividad = corte − 9 min 59 s | Script | `recientes = 1` → aborta |
| C04-035 | Frontera 10 min (exacta) | Última actividad = corte − 10 min | Script | Cuenta como reciente (definición `>=` de NEX-084) → aborta |
| C04-036 | Frontera 10 min (fuera) | Última actividad = corte − 10 min 1 s | Script | Cuenta como antigua |
| C04-037 | Huérfanas exactas | 2 antiguas, `huerfanas=2` | Script | Pasa; las 2 operaciones siguen abiertas, sin cierre inventado |
| C04-038 | Huérfanas distintas | 2 antiguas, `huerfanas=1` o `3` | Script | Aborta con ambos números; sin cambios |
| C04-039 | Actividad tardía | Antigua con salida tardía registrada hace 2 min | Script | La salida tardía cuenta como actividad (definición única) → reciente → aborta |
| C04-040 | Sin evidencia R05 | Las 6 tablas R05 vacías y evidencia NEX-072 vacía | Script | Pasa; abiertas 0; `filas_evidencia_r05 = 0` y `filas_evidencia_nex072_legado = 0`. **Corregido en C04-C01:** cero filas R05 no implica cero total; con historial NEX-072 ver C04-062 |
| C04-041 | Ya REVERTIDO | C04-001 confirmado | Script otra vez con las mismas confirmaciones | Código 0; resultado `YA_REVERTIDO`; `cambiado_at` y `motivo` iguales; ayudante reaplicado; postcondiciones OK |
| C04-042 | REVERTIDO sin confirmaciones | Modo REVERTIDO | Script sin `drenaje_confirmado` | Aborta: el camino idempotente no elude controles |
| C04-043 | REVERTIDO con huérfanas distintas | Modo REVERTIDO, 1 antigua, `huerfanas=0` | Script | Aborta |
| C04-044 | Error en el ayudante | Ayudante que lanza excepción (descartable) | Script | ROLLBACK total: modo sigue ACTIVO, `cambiado_at` sin cambios |
| C04-045 | Postcondición falla | Ayudante modificado para dejar EXECUTE en una escritura (descartable) | Script | Aborta `[post]: ACL tras el ayudante distinta de la esperada en REVERTIDO: escritura con EXECUTE…`; la transacción no se confirma, modo ACTIVO |
| C04-046 | ACL 3/7/32/42 | C04-001 | Consultar privilegios efectivos | 3 lecturas con EXECUTE; 0/7 escrituras; 0/32 internos (incluye el guarda global y el ayudante); ninguna `EXECUTE WITH GRANT OPTION` de runtime en los 42 (incluidas las lecturas); PUBLIC 0/42 |
| C04-047 | Testigo, columnas y DML | C04-001 | Privilegios efectivos de runtime | SELECT exactamente en las 10 columnas del ayudante de `operaciones_r05` (ni `testigo_sha256` ni otra; sin SELECT de tabla); sin INSERT/UPDATE/DELETE/TRUNCATE de tabla ni INSERT/UPDATE por columna en las 6 tablas R05, `nex_e03_r05_estado` y la evidencia NEX-072; SELECT en las otras 5 tablas R05, `nex_e03_r05_estado` y NEX-072 |
| C04-048 | Legado y flujo vigente | C04-001 | Privilegios de runtime | E03 antiguas sin EXECUTE; evidencia NEX-072 solo SELECT; `fe_documento_iniciar_envio` y `fe_documento_registrar_envio_r05` con EXECUTE; la aplicación vigente sigue emitiendo |
| C04-049 | Disparadores y DEMO | C04-001 | Catálogo y reinicio DEMO | 17 disparadores habilitados; inmutabilidad vigente; borrado DEMO como antes |
| C04-050 | Registros y checksums | C04-001 | `schema_migrations` | 85 filas idénticas; NEX-084/085 con sus checksums |
| C04-051 | Evidencia conservada | Operaciones y evidencias existentes | Script + conteos | Mismo número de filas, por separado, en las 6 tablas R05 y en la evidencia NEX-072 entre la línea base (bajo FOR UPDATE) y la postcondición; solo cantidades, no contenido |
| C04-052 | Wrapper ×2 en ACTIVO | Antes de C04-001 | `nex_aplicar_grants_runtime()` dos veces + verificadores | 3 lecturas y 7 escrituras con EXECUTE; 0/32 internos |
| C04-053 | Wrapper ×2 en REVERTIDO | Después de C04-001 | `nex_aplicar_grants_runtime()` dos veces + verificadores | 3 lecturas; 0/7; 0/32; PUBLIC 0/42 (persistencia) |
| C04-054 | Sin reactivación | Modo REVERTIDO | Buscar cualquier camino del script hacia ACTIVO | No existe: el script solo escribe `REVERTIDO`; volver a ACTIVO exige orden separada |
| C04-055 | Sin cambio comercial | C04-001 | Documentos, estados, CDC, lote, stock, FE/NCE | Sin cambios; el script no los lee ni los escribe |
| C04-056 | reversion-NEX-084 con NEX-085 | NEX-084+085 instaladas | `reversion-NEX-084.sql` | Sigue abortando en P1 (sin cambios); no se usa ni se contorna |

## 3b. Casos C04-057…084 (C04-C01) — ESCRITOS, NO EJECUTADOS

Misma precondición común. «Aborta» implica: código de salida distinto de 0, sin commit, modo, ACL y evidencia sin cambios (comprobado después en solo lectura).

| Id | Hallazgo | Tema | Precondición | Operación | Resultado esperado |
|---|---|---|---|---|---|
| C04-057 | F-C04-01 | Sesión con REPEATABLE READ por defecto | `ALTER ROLE <operador> SET default_transaction_isolation = 'repeatable read'` (descartable) | C04-001 | `SET TRANSACTION` fija READ COMMITTED; informe `aislamiento = read committed`; código 0 |
| C04-058 | F-C04-01 | Sesión con SERIALIZABLE por defecto | Ídem con `serializable` (también vía `PGOPTIONS`) | C04-001 | Igual que C04-057 |
| C04-059 | F-C04-01 | `SET TRANSACTION` no es la primera sentencia | `psql -1 -c 'SELECT 1' -f -` (una consulta antes del archivo) | Script | `SET TRANSACTION ISOLATION LEVEL must be called before any query` → código ≠ 0 antes de bloquear; sin cambios |
| C04-060 | F-C04-01 | Escritor confirma actividad reciente durante la espera | Sesión A (runtime, modo ACTIVO) inicia una escritura R05: toma la fila FOR SHARE, inserta actividad y espera 2 s antes de confirmar; el script arranca durante esa espera, con la sesión en REPEATABLE READ por defecto | Script | El script espera la fila; A confirma; la línea base y `fe_e03_r05_abiertas` ven la actividad de A (instantáneas nuevas): `recientes ≥ 1` → aborta; no hay instantánea obsoleta |
| C04-061 | F-C04-01 | Escritor cierra antes del bloqueo | Sesión A registra el cierre de su operación y confirma mientras el script espera la fila; no quedan otras abiertas | Script con `huerfanas=0` | La operación cerrada no cuenta como abierta; la línea base (bajo FOR UPDATE) ya incluye las filas de A; postcondición de conteos igual → **sin falso desvío**; código 0 |
| C04-062 | F-C04-01 | Historial NEX-072 con R05 vacío | Evidencia NEX-072 con N > 0 filas; tablas R05 vacías | C04-001 | Pasa; `filas_evidencia_r05 = 0` y `filas_evidencia_nex072_legado = N`; ambas iguales antes y después |
| C04-063 | F-C04-01 | Actividad no coordinada bajo el bloqueo (límite) | Superusuario inserta una fila de evidencia NEX-072 entre la línea base y la postcondición (descartable, con pausa instrumentada) | Script | Aborta `[post]: cambió el número de filas de evidencia… NEX-072 N→N+1`; documentado como límite de ventana no exclusiva, no como protección general |
| C04-064 | F-C04-02 | Grant option en una lectura | `GRANT EXECUTE ON FUNCTION fe_e03_estado_operacion_r05(…) TO nexit_runtime WITH GRANT OPTION` | Script | Aborta `ACL previa incoherente…: EXECUTE WITH GRANT OPTION de runtime en …estado_operacion_r05…`; no hace REVOKE |
| C04-065 | F-C04-02 | Grant option en una escritura (ACTIVO) y en un interno | Ídem sobre una escritura; aparte, sobre `fe_e03_r05_bool(jsonb)` | Script | Aborta en ambos con el objeto en el mensaje |
| C04-066 | F-C04-02 | SELECT inesperado | `GRANT SELECT (testigo_sha256) ON documento_electronico_envio_operaciones_r05 TO nexit_runtime` | Script | Aborta `SELECT no autorizado en operaciones_r05.testigo_sha256` |
| C04-067 | F-C04-02 | SELECT autorizado faltante | `REVOKE SELECT (payload_hash) ON … FROM nexit_runtime` | Script | Aborta `falta SELECT autorizado en operaciones_r05.payload_hash` |
| C04-068 | F-C04-02 | SELECT de tabla | `GRANT SELECT ON documento_electronico_envio_operaciones_r05 TO nexit_runtime` | Script | Aborta `SELECT de tabla de runtime en operaciones_r05` (y columnas no autorizadas) |
| C04-069 | F-C04-02 | INSERT/UPDATE por columna en R05 | `GRANT UPDATE (motivo) ON nex_e03_r05_estado TO nexit_runtime`; aparte `GRANT INSERT (operacion_id) ON documento_electronico_envio_cierres_r05 TO nexit_runtime` | Script | Aborta `privilegio UPDATE/INSERT de tabla o por columna de runtime en …` |
| C04-070 | F-C04-02 | INSERT/UPDATE por columna en NEX-072 | `GRANT UPDATE (<una columna>) ON documento_electronico_envio_evidencias TO nexit_runtime` | Script | Aborta con la tabla NEX-072 en el mensaje |
| C04-071 | F-C04-02 | DML de tabla en NEX-072 | `GRANT DELETE` y, aparte, `GRANT TRUNCATE` en la evidencia NEX-072 | Script | Aborta `privilegio de tabla DELETE/TRUNCATE de runtime en …evidencias` |
| C04-072 | F-C04-02 | Escrituras sin EXECUTE con modo ACTIVO | Modo ACTIVO; `REVOKE EXECUTE` de una escritura | Script | Aborta `escritura sin EXECUTE de runtime (modo ACTIVO)` antes del cambio |
| C04-073 | F-C04-02 | Escrituras con EXECUTE con modo REVERTIDO | Modo REVERTIDO; `GRANT EXECUTE` a runtime en una escritura | Script | Aborta `escritura con EXECUTE o entrada directa de runtime (modo REVERTIDO)` en la ACL previa; el camino idempotente no la repara |
| C04-074 | F-C04-02 | Error antes del ayudante | Huérfanas distintas (como C04-038) | Script | Aborta antes del UPDATE y del ayudante; modo, `cambiado_at`, ACL y evidencia iguales que antes |
| C04-075 | F-C04-02 | Error después del ayudante | Ayudante modificado (descartable) que concede `SELECT (testigo_sha256)` | Script | Aborta en `[post]`; la transacción no se confirma: modo ACTIVO, ACL previa intacta (comprobada después) |
| C04-076 | F-C04-03 | Comando del runbook | Bloque §6 copiado tal cual | Teclear `huerfanas` = `-1`, `1 `, `abc` o vacío | El shell muestra `huerfanas no es un entero…` y no llama a psql; con `0` llama a psql; el documento no contiene `<N>` ni `SI` prellenados en el comando |
| C04-077 | F-C04-03 | Confirmación tecleada distinta | Bloque §6 con `si`, `Sí` o vacío en una confirmación | Script | Aborta con la confirmación que falta; código ≠ 0 |
| C04-078 | F-C04-03 | Sin `ON_ERROR_STOP` y sin `-1` | Ambos ausentes | Script | Código distinto de 0 por el error forzado; ninguna sentencia de bloqueo ejecutada |
| C04-079 | F-C04-03 | `lock_timeout` preconfigurado sin `-1` | `PGOPTIONS='-c lock_timeout=5s'`, sin `-1` | Script | Aborta igual por la marca de transacción (no depende de `lock_timeout`) |
| C04-080 | F-C04-03 | Conexión perdida antes del commit | `pg_terminate_backend` del script mientras espera la fila de modo | Script | Código ≠ 0; tratar como **resultado C**: no repetir; consulta de solo lectura muestra modo ACTIVO y ACL sin cambios |
| C04-081 | F-C04-03 | ACK del COMMIT perdido | El servidor confirma y la conexión cliente se corta antes de recibir la respuesta (proxy TCP en el descartable que corta tras el `COMMIT`) | Script | Código ≠ 0 o salida truncada; **resultado C**: no repetir; la consulta de solo lectura muestra `REVERTIDO`; verificadores en operación autorizada; nunca GRANT/REVOKE |
| C04-082 | Inventario | NEX-000 sustituye una versión ausente | Borrar NEX-017 y registrar NEX-000 (descartable): siguen 85 filas | Script | Aborta `versiones no canónicas o NEX-000…: 'NEX-000'` (y faltaría NEX-017) aunque la cantidad sea 85 |
| C04-083 | Inventario | Duplicados y formatos no canónicos | Tabla de registros sin clave única (descartable) con `NEX-017` dos veces; aparte `nex-017`, `NEX-17`, `' NEX-017'` | Script | Aborta `versiones duplicadas…: NEX-017 ×2`; los otros con `versiones no canónicas…` y el valor entre comillas |
| C04-084 | Inventario | Inventario exacto e idempotencia | NEX-001…085 exactas, modo REVERTIDO tras C04-001 | Script otra vez | Pasa la compatibilidad; resultado `YA_REVERTIDO…`; ACL previa en REVERTIDO coherente; `cambiado_at` y `motivo` iguales; código 0 |

Total C04 tras C04-C01: 56 + 28 = **84** casos (C04-001…084). Acumulado PRO-312-R02: 439 + 84 = **523** identificadores, todos solo escritos.

## 3c. Matriz de hallazgos C04-C01

| Hallazgo | Corrección en el script | Runbook | Casos |
|---|---|---|---|
| F-C04-01 aislamiento y línea base | `SET TRANSACTION ISOLATION LEVEL READ COMMITTED` como primera sentencia; comprobación de `transaction_isolation`; línea base de evidencia movida a después de `FOR UPDATE`; R05 y NEX-072 contadas por separado; reutiliza `fe_e03_r05_abiertas` sin cambios | §6, §7 pasos 1, 5–9, §8 | C04-031, 040, 051, 057–063 |
| F-C04-02 ACL completa | una consulta de privilegios efectivos antes del cambio (según modo inicial, bajo la fila) y después del ayudante: grant option en los 42, PUBLIC, 32 internos, 3 lecturas, 7 escrituras por modo, SELECT exacto de 10 columnas con `pg_attribute`/`has_column_privilege`, DML de tabla y por columna en R05, estado y NEX-072, SELECT previsto, NEX-062/080, legado | §8 | C04-017, 018, 045–047, 064–075 |
| F-C04-03 errores y resultado | `ON_ERROR_STOP` activado antes del error forzado (código ≠ 0); marca de transacción que no depende de `lock_timeout`; informe marcado como previo al commit; resultados A/B/C | §6, §10, §11 | C04-024–027, 076–081 |
| Inventario de migraciones | versión por versión NEX-001…085; rechaza NEX-000, duplicados, no canónicas; checksums NEX-084/085; sucesoras cerradas | §2, §9 | C04-005, 009, 082–084 |

Pruebas pendientes: todas. Ningún caso se ejecutó; su ejecución requiere una autorización separada en base descartable con runtime real.

## 4. Qué ejecuta el CI y qué no

- **CI automático:** aplica NEX-001…085 y las baterías existentes. **No** ejecuta `desactivar-envio-r05.sql` ni ningún caso C04; su verde no prueba la desactivación.
- **Solo escrito:** C04-001…084.
- **VM:** nada ejecutado. Hoy el modo sigue `ACTIVO` y la instrumentación R05 no está activa. La desactivación solo con orden futura y runbook.

## 5. Limitaciones

- El bloqueo 7340001 coordina solo con quien lo toma; el wrapper final del runner queda fuera: ventana exclusiva obligatoria.
- Las confirmaciones son declaraciones del operador; SQL no ve procesos remotos.
- Ni el drenaje ni el umbral de 10 min prueban la ausencia de un proceso vivo; un proceso tardío recibe `NEX:E03_R05_REVERTIDO` y su salida se concilia por consulta en la misma cuenta.
- La compatibilidad está cerrada a NEX-084+085: cualquier migración futura bloquea hasta una revisión auditada del script.
- Sin protección frente a superusuarios o SQL fuera del protocolo.
- Un código de salida distinto de 0 no prueba que no hubo commit (corte después del commit y antes del ACK): resultado C del runbook §10, sin repetir el script.
- Los conteos de evidencia comparan cantidad, no contenido; las comprobaciones del cuerpo del ayudante buscan fragmentos, no un hash completo.
- Fuera de alcance y sin cambios: gate B (D6, 8 MiB, 999 ítems, homologación funcional), PRO-309, Lote B/C, PRO-311/313/199/324/323.
