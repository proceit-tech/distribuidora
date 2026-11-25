# Casos PRO-312-R02-C04 — desactivación coordinada R05 (R-VM-085-01)

25/11/2026 · PR #7 Draft · rama `feature/NEXIT-2026-001-banco-demo` · base `a55678f`.
[Orden](../ordens/ORD-CLAUDE-NEXIT-PRO-312-R02-C04-DESACTIVACION-R05-2026-11-25.md) · [Auditoría NEX-085](AUD-CHATGPT-NEXIT-PRO-312-R02-C03-NEX-085-2026-11-25.md) · [Verificación VM](AUD-CHATGPT-NEXIT-PRO-312-R02-C03-NEX-085-VM-2026-11-25.md) · [Runbook](../infra/PROCEDIMENTO-DESACTIVACION-COORDINADA-R05-2026-11-25.md).

**Estado:** casos ESCRITOS, **NO EJECUTADOS**. El script `desactivar-envio-r05.sql` (SHA-256 `d6c09c31d7e4616fd4ca3ed28b53ae0fb16f2124cbdeebc2ffdbde978d0d3ee8`) no se ejecutó en ninguna base; el CI no lo ejecuta (está fuera de `migraciones/`). No se desactivó ni reactivó R05 en la VM. Los 439 identificadores anteriores (391 de NEX-084 y C03-001…048 de NEX-085) se conservan por referencia; en C03 solo se corrigieron las referencias operativas de C03-026/027/046 indicadas por la orden.

## 1. Archivos

| Archivo | Cambio |
|---|---|
| `documentacao/banco/nexit/v1/scripts/desactivar-envio-r05.sql` | nuevo: script de operador, fuera de migraciones |
| `documentacao/infra/PROCEDIMENTO-DESACTIVACION-COORDINADA-R05-2026-11-25.md` | nuevo: runbook |
| `documentacao/testes/CASOS-NEXIT-PRO-312-R02-C04-DESACTIVACION-R05-2026-11-25.md` | nuevo: este documento |
| `documentacao/banco/nexit/v1/scripts/reversion-NEX-085.sql` | solo comentarios y HINT: apuntan al nuevo procedimiento (misma excepción, READ ONLY, siempre aborta) |
| `documentacao/banco/nexit/v1/scripts/verificar-NEX-085.sql` | solo el comentario de la prueba futura (paso 3) |
| `documentacao/testes/CASOS-NEXIT-PRO-312-R02-C03-NEX-085-2026-11-25.md` | solo C03-026/027/046 y la frase dependiente; los 48 IDs se conservan |

Sin cambios: NEX-001…085 (checksums NEX-084 `38d45ea6…6854` y NEX-085 `34f57411…c7d7`), `reversion-NEX-084.sql`, `verificar-NEX-084.sql`, preflights, runner, wrapper, base, CI, aplicación y `CLAUDE.md`. No se crea NEX-086.

## 2. Matriz de compatibilidad (revisión C04)

| Versión | Checksum | Tratamiento |
|---|---|---|
| NEX-084 | `38d45ea661ed5d8f1dc3d43dc6b0f727f8872c6bdd0fbab5745cc7802f5b6854` | obligatoria |
| NEX-085 | `34f57411cef8f17c01f249b6e21e1904c8aa7aecd83718965bcfbadd4b29c7d7` | obligatoria |
| > NEX-085 o fuera de `NEX-NNN` | — | bloquea salvo par exacto en `suc_revisadas` (hoy vacío) |
| NEX-001…085 | — | exactamente 85 registros |

## 3. Casos C04-001…056 — ESCRITOS, NO EJECUTADOS

Precondición común salvo indicación: base DESCARTABLE `nexit_test_*` con NEX-001…085 aplicadas por el runner y un rol `nexit_runtime` real (no se usa ningún modo CI permisivo: el script exige el rol). Comando: el del runbook §6 sobre esa base.

| Id | Tema | Precondición | Operación | Resultado esperado |
|---|---|---|---|---|
| C04-001 | Combinación válida | Modo ACTIVO, 0 operaciones abiertas | Script con confirmaciones `SI` y `huerfanas=0` | Código 0; informe `REVERTIDO`, modo inicial ACTIVO, abiertas 0; luego verificar-NEX-084 41/41 y verificar-NEX-085 24/24 sin desvíos |
| C04-002 | Checksum NEX-084 distinto | Fila NEX-084 con otro checksum | Script | Aborta `NEX-084 no está registrada con el checksum revisado`; sin cambios |
| C04-003 | Checksum NEX-085 distinto | Fila NEX-085 con otro checksum | Script | Aborta `NEX-085 no está registrada…`; sin cambios |
| C04-004 | NEX-085 ausente | Base con NEX-084 sin NEX-085 | Script | Aborta (NEX-085 obligatoria); ese escenario histórico corresponde a `reversion-NEX-084.sql` |
| C04-005 | Recuento de registros | Falta una fila NEX-0xx ≤ 085 | Script | Aborta `se esperaban exactamente 85 registros` |
| C04-006 | Sucesora desconocida | Fila `NEX-086` registrada (descartable) | Script | Aborta `migración(es) posterior(es) sin revisión de compatibilidad: NEX-086 (…)` antes de bloquear la fila de modo |
| C04-007 | Sucesora revisada, hash distinto (futuro) | Revisión futura del script con `NEX-086` en `suc_revisadas`; fila con otro checksum | Script de esa revisión | Aborta: solo el par exacto versión+checksum autoriza |
| C04-008 | Sucesora revisada exacta (futuro) | Ídem con checksum exacto | Script de esa revisión | Pasa la compatibilidad; el resto de controles se aplica igual |
| C04-009 | Versión fuera de formato | Fila `X-001` en `schema_migrations` | Script | Aborta (cerrado por defecto) |
| C04-010 | Sin bypass | Variables extra (`-v permitir=SI`, etc.) | Script | Ignoradas: no existe ningún parámetro que relaje la compatibilidad |
| C04-011 | Rol ausente | Sin `nexit_runtime` | Script | Aborta `no existe el rol nexit_runtime` |
| C04-012 | Firma faltante | Una escritura, lectura, interno, función legada o NEX-062/080 eliminada (descartable) | Script | Aborta con la firma exacta en el mensaje |
| C04-013 | Dueño distinto | Un interno con otro dueño (descartable) | Script | Aborta `dueño distinto del ayudante en: …` |
| C04-014 | Usuario no autorizado | Ejecutar con un rol que no es dueño ni miembro | Script | Aborta antes de la fila de modo |
| C04-015 | Guarda no trigger | Un guarda redefinido con otro retorno | Script | Aborta `los cuatro guardas…` |
| C04-016 | Ayudante vulnerable | Ayudante restaurado al cuerpo de NEX-084 (sin REVOKE de runtime) | Script | Aborta `no es el corregido por NEX-085`; no lo redefine ni lo restaura |
| C04-017 | ACL previa incoherente | GRANT EXECUTE manual a runtime en un interno | Script | Aborta `ACL previa incoherente…`; no hace REVOKE |
| C04-018 | PUBLIC previa | GRANT EXECUTE a PUBLIC en una escritura | Script | Aborta `PUBLIC con EXECUTE en: …` |
| C04-019 | Disparadores | Un disparador R05 deshabilitado | Script | Aborta `se esperaban 17 disparadores…` |
| C04-020 | `abiertas` alterada | Firma con otra salida | Script | Aborta `no tiene la forma de NEX-084` |
| C04-021 | Falta backup | Sin `-v backup_verificado` | Script | Aborta `falta -v backup_verificado=SI`; sin bloqueos tomados |
| C04-022 | Confirmación malformada | `backup_verificado=si` / `instrumentacion_desactivada=YES` | Script | Aborta (solo `SI` exacto) |
| C04-023 | Falta drenaje | Sin `drenaje_confirmado` | Script | Aborta |
| C04-024 | Huérfanas malformadas | `huerfanas=-1`, `1.0`, vacío o texto | Script | Aborta `falta -v huerfanas=<N>` |
| C04-025 | Sin `-1` | Mismo comando sin `-1` | Script | Aborta `lock_timeout local no vigente`; nada escrito |
| C04-026 | Sin `ON_ERROR_STOP` | Comando con `-1` pero sin `ON_ERROR_STOP=1` | Script | Error forzado, transacción abortada, ROLLBACK, `\quit`; sin cambios |
| C04-027 | Entrada por stdin sin `-f -` | `psql -1 … < archivo` | Script | psql no aplica `-1` a stdin: aborta como C04-025 |
| C04-028 | Bloqueo del runner | Otra sesión con `pg_advisory_xact_lock(7340001)` abierto | Script | Espera ≤ 5 s y aborta por `lock_timeout`; sin cambios |
| C04-029 | Runner concurrente | Script en curso con el bloqueo; arrancar el runner | Runner | La transacción de cada migración del runner espera al script (mismo bloqueo); el wrapper final del runner no está cubierto: documentado en §4 del runbook |
| C04-030 | Fila de modo bloqueada | Otra sesión con `FOR UPDATE` en `nex_e03_r05_estado` | Script | Aborta por `lock_timeout` tras ≤ 5 s |
| C04-031 | Escritura R05 concurrente | Sesión A en una escritura R05 (tiene la fila FOR SHARE) sin confirmar | Script | Espera hasta 5 s; si A confirma antes, el script continúa y cuenta su actividad (reciente → aborta) |
| C04-032 | Escritura tras desactivar | C04-001 confirmado; un proceso con testigo vivo llama a una escritura | Escritura como runtime | `permission denied` (sin EXECUTE) o, si ya pasó el control de EXECUTE, `NEX:E03_R05_REVERTIDO` |
| C04-033 | Corte único | Script con operaciones abiertas | Informe | `corte_bajo_bloqueo` es el usado para el conteo; las cifras no se recalculan |
| C04-034 | Frontera 10 min (dentro) | Operación abierta con última actividad = corte − 9 min 59 s | Script | `recientes = 1` → aborta |
| C04-035 | Frontera 10 min (exacta) | Última actividad = corte − 10 min | Script | Cuenta como reciente (definición `>=` de NEX-084) → aborta |
| C04-036 | Frontera 10 min (fuera) | Última actividad = corte − 10 min 1 s | Script | Cuenta como antigua |
| C04-037 | Huérfanas exactas | 2 antiguas, `huerfanas=2` | Script | Pasa; las 2 operaciones siguen abiertas, sin cierre inventado |
| C04-038 | Huérfanas distintas | 2 antiguas, `huerfanas=1` o `3` | Script | Aborta con ambos números; sin cambios |
| C04-039 | Actividad tardía | Antigua con salida tardía registrada hace 2 min | Script | La salida tardía cuenta como actividad (definición única) → reciente → aborta |
| C04-040 | Sin evidencia | Tablas R05 vacías | Script | Pasa; abiertas 0; filas de evidencia 0 |
| C04-041 | Ya REVERTIDO | C04-001 confirmado | Script otra vez con las mismas confirmaciones | Código 0; resultado `YA_REVERTIDO`; `cambiado_at` y `motivo` iguales; ayudante reaplicado; postcondiciones OK |
| C04-042 | REVERTIDO sin confirmaciones | Modo REVERTIDO | Script sin `drenaje_confirmado` | Aborta: el camino idempotente no elude controles |
| C04-043 | REVERTIDO con huérfanas distintas | Modo REVERTIDO, 1 antigua, `huerfanas=0` | Script | Aborta |
| C04-044 | Error en el ayudante | Ayudante que lanza excepción (descartable) | Script | ROLLBACK total: modo sigue ACTIVO, `cambiado_at` sin cambios |
| C04-045 | Postcondición falla | Ayudante modificado para dejar EXECUTE en una escritura (descartable) | Script | Aborta `[post]: escrituras con EXECUTE…`; ROLLBACK total, modo ACTIVO |
| C04-046 | ACL 3/7/32/42 | C04-001 | Consultar privilegios | 3 lecturas con EXECUTE; 0/7 escrituras; 0/32 internos (incluye el guarda global y el ayudante, sin grant option); PUBLIC 0/42 |
| C04-047 | Testigo y DML | C04-001 | Privilegios de runtime | `testigo_sha256` sin SELECT; SELECT por columnas en `operaciones_r05`; sin INSERT/UPDATE/DELETE/TRUNCATE; SELECT en las otras 5 tablas y en `nex_e03_r05_estado` |
| C04-048 | Legado y flujo vigente | C04-001 | Privilegios de runtime | E03 antiguas sin EXECUTE; evidencia NEX-072 solo SELECT; `fe_documento_iniciar_envio` y `fe_documento_registrar_envio_r05` con EXECUTE; la aplicación vigente sigue emitiendo |
| C04-049 | Disparadores y DEMO | C04-001 | Catálogo y reinicio DEMO | 17 disparadores habilitados; inmutabilidad vigente; borrado DEMO como antes |
| C04-050 | Registros y checksums | C04-001 | `schema_migrations` | 85 filas idénticas; NEX-084/085 con sus checksums |
| C04-051 | Evidencia conservada | Operaciones y evidencias existentes | Script + conteos | Mismo número de filas en las 6 tablas R05 y en la evidencia NEX-072 |
| C04-052 | Wrapper ×2 en ACTIVO | Antes de C04-001 | `nex_aplicar_grants_runtime()` dos veces + verificadores | 3 lecturas y 7 escrituras con EXECUTE; 0/32 internos |
| C04-053 | Wrapper ×2 en REVERTIDO | Después de C04-001 | `nex_aplicar_grants_runtime()` dos veces + verificadores | 3 lecturas; 0/7; 0/32; PUBLIC 0/42 (persistencia) |
| C04-054 | Sin reactivación | Modo REVERTIDO | Buscar cualquier camino del script hacia ACTIVO | No existe: el script solo escribe `REVERTIDO`; volver a ACTIVO exige orden separada |
| C04-055 | Sin cambio comercial | C04-001 | Documentos, estados, CDC, lote, stock, FE/NCE | Sin cambios; el script no los lee ni los escribe |
| C04-056 | reversion-NEX-084 con NEX-085 | NEX-084+085 instaladas | `reversion-NEX-084.sql` | Sigue abortando en P1 (sin cambios); no se usa ni se contorna |

Total: 56 casos nuevos. Acumulado PRO-312-R02: 439 + 56 = **495** identificadores, todos solo escritos.

## 4. Qué ejecuta el CI y qué no

- **CI automático:** aplica NEX-001…085 y las baterías existentes. **No** ejecuta `desactivar-envio-r05.sql` ni ningún caso C04; su verde no prueba la desactivación.
- **Solo escrito:** C04-001…056.
- **VM:** nada ejecutado. Hoy el modo sigue `ACTIVO` y la instrumentación R05 no está activa. La desactivación solo con orden futura y runbook.

## 5. Limitaciones

- El bloqueo 7340001 coordina solo con quien lo toma; el wrapper final del runner queda fuera: ventana exclusiva obligatoria.
- Las confirmaciones son declaraciones del operador; SQL no ve procesos remotos.
- Ni el drenaje ni el umbral de 10 min prueban la ausencia de un proceso vivo; un proceso tardío recibe `NEX:E03_R05_REVERTIDO` y su salida se concilia por consulta en la misma cuenta.
- La compatibilidad está cerrada a NEX-084+085: cualquier migración futura bloquea hasta una revisión auditada del script.
- Sin protección frente a superusuarios o SQL fuera del protocolo.
- Fuera de alcance y sin cambios: gate B (D6, 8 MiB, 999 ítems, homologación funcional), PRO-309, Lote B/C, PRO-311/313/199/324/323.
