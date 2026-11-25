# Procedimiento — desactivación coordinada del envío R05

25/11/2026 · PRO-312-R02-C04, corregido en C04-C01 · resuelve R-VM-085-01 · PR #7 Draft.
Script: [`desactivar-envio-r05.sql`](../banco/nexit/v1/scripts/desactivar-envio-r05.sql) (SHA-256 `c831361ae51ef31bd1d90c0be5efb20e8ae631aecf460bfa3f1b74e38373703b`; la revisión C04 original `d6c09c31…3ee8` queda sustituida).
Fuentes: [orden C04](../ordens/ORD-CLAUDE-NEXIT-PRO-312-R02-C04-DESACTIVACION-R05-2026-11-25.md) · [parecer C04](../testes/AUD-CHATGPT-NEXIT-PRO-312-R02-C04-DESACTIVACION-R05-2026-11-25.md) · [orden C04-C01](../ordens/ORD-CLAUDE-NEXIT-PRO-312-R02-C04-C01-DESACTIVACION-R05-2026-11-25.md) · [auditoría NEX-085 (R-VM-085-01)](../testes/AUD-CHATGPT-NEXIT-PRO-312-R02-C03-NEX-085-2026-11-25.md) · [verificación VM 65/65](../testes/AUD-CHATGPT-NEXIT-PRO-312-R02-C03-NEX-085-VM-2026-11-25.md) · [casos C04](../testes/CASOS-NEXIT-PRO-312-R02-C04-DESACTIVACION-R05-2026-11-25.md).

> **Nada de este procedimiento fue ejecutado.** Hoy NO se activa ni se desactiva R05 en la VM. Se ejecuta solo con una orden futura y autorización expresa del responsable, después de la auditoría de C04-C01 y de una homologación en base descartable. Ninguna IA lo ejecuta.

## 1. Qué es y qué no es

- **Es:** el cambio del modo global R05 de `ACTIVO` a `REVERTIDO` con NEX-084 y NEX-085 instaladas. Retira el EXECUTE de `nexit_runtime` en las 7 escrituras R05, conserva las 3 lecturas y conserva la corrección de privilegios de NEX-085.
- **No es:**
  - una reversión de esquema;
  - una reversión de NEX-085 (`reversion-NEX-085.sql` sigue abortando siempre);
  - una reactivación (volver a `ACTIVO` exige una orden futura separada; no hay script de reactivación).
- **`reversion-NEX-084.sql`** sigue intacto y es válido solo en su combinación histórica, es decir, NEX-084 sin migraciones posteriores. Con NEX-085 instalada aborta en su paso P1 (líneas 82–84). **No usarlo, no contornar su guarda y no borrar registros de `schema_migrations`.**
- **Modo SQL vs. instrumentación:**
  - El modo `ACTIVO` en `nex_e03_r05_estado` es la estructura SQL que admite escrituras R05.
  - La activación efectiva del envío R05 es la instrumentación de la aplicación (Lote B), que hoy **no** está activa.
  - Un modo `ACTIVO` sin instrumentación no envía nada. Desactivar la instrumentación es un paso de la aplicación, previo a este script, y no lo hace el SQL.

## 2. Matriz de compatibilidad (versionada en el script)

| Migración | Checksum exacto | Estado en esta revisión (C04-C01) |
|---|---|---|
| NEX-001…NEX-083 | no se comparan | obligatorias, cada una exactamente una vez |
| NEX-084 | `38d45ea661ed5d8f1dc3d43dc6b0f727f8872c6bdd0fbab5745cc7802f5b6854` | obligatoria |
| NEX-085 | `34f57411cef8f17c01f249b6e21e1904c8aa7aecd83718965bcfbadd4b29c7d7` | obligatoria |
| NEX-000, duplicados, versiones fuera del formato canónico `NEX-NNN` | — | **bloquea siempre** |
| Cualquier versión > NEX-085 | — | **no revisada: bloquea** (lista `suc_revisadas` vacía) |

El script valida la secuencia **versión por versión**, no solo la cantidad: una NEX-000 que ocupe el lugar de una versión ausente se rechaza por los dos motivos.

Para incorporar una sucesora:
1. Revisar su compatibilidad: modo, bloqueos, funciones, ACL, recuperación y semántica.
2. Publicar una **nueva revisión auditada** del script con su versión y checksum exactos en `suc_revisadas`.

No hay comodines, rangos, parámetros de bypass ni listas que el operador pueda pasar. No se presume compatibilidad con migraciones que todavía no existen.

## 3. Requisitos previos (todos de solo lectura, antes de la ventana)

En la VM, desde el clon `/home/proceit24/nexit-instalacao` actualizado al commit auditado:

1. **Checksums de archivos.**
   `sha256sum documentacao/banco/nexit/v1/migraciones/NEX-084-*.sql documentacao/banco/nexit/v1/migraciones/NEX-085-*.sql documentacao/banco/nexit/v1/scripts/desactivar-envio-r05.sql`
   Deben coincidir con la matriz y con el SHA del script indicado arriba.
2. **Verificadores.**
   `docker exec -i nexit-db psql -X -U nexit_app -d nexit -v ON_ERROR_STOP=1 -v entorno=VM -f - < documentacao/banco/nexit/v1/scripts/verificar-NEX-084.sql`
   y lo mismo con `verificar-NEX-085.sql`. Resultado esperado:
   - 41/41 y 24/24 `ok = true`;
   - sección 2 de NEX-085 sin filas (cero desvíos por firma, incluida la grant option).
3. **Registros.**
   - `SELECT version, checksum FROM public.schema_migrations WHERE version >= 'NEX-084' ORDER BY version;` debe devolver exactamente NEX-084 y NEX-085 con sus checksums.
   - `SELECT count(*), count(DISTINCT version) FROM public.schema_migrations;` debe dar 85 y 85.
4. **Modo y rol.**
   - `SELECT modo, cambiado_at, motivo FROM public.nex_e03_r05_estado;`
   - `SELECT rolname FROM pg_roles WHERE rolname = 'nexit_runtime';` debe devolver una fila.
5. **Operaciones abiertas.** Usar `verificar-NEX-084.sql` §2, que usa la misma definición `fe_e03_r05_abiertas`, para conocer cuántas abiertas antiguas (más de 10 minutos) existen. Ese número exacto es el que el responsable reconocerá como `huerfanas`.
6. **Backup.** Tener un backup reciente de la base `nexit` con restauración comprobada para **esta** operación. No es un requisito nuevo para las tareas normales de la VM.

Si alguno falla: **no ejecutar.** Diagnosticar con los verificadores; no hacer REVOKE ni GRANT manual.

## 4. Ventana exclusiva de mantenimiento

Durante toda la ventana no puede haber:
- otro runner;
- reaplicación de grants (`nex_aplicar_grants_runtime()` u otros ayudantes);
- DDL;
- reinicio DEMO ni otra escritura en las tablas de evidencia R05 o NEX-072;
- reactivación;
- otro cambio de modo;
- despliegues que reactiven la instrumentación.

**Límite del runner:** el script toma `pg_advisory_xact_lock(7340001)`, el mismo bloqueo que el runner toma en la transacción de cada migración. Sin embargo, la reaplicación final del wrapper que hace el runner (`aplicar-migraciones.sh`, líneas 54–58) corre **fuera** de ese bloqueo y no queda cubierta. Por eso la ventana debe ser exclusiva.

Nada protege frente a superusuarios, procesos externos o SQL directo que no respeten este protocolo.

## 5. Confirmaciones del operador (declaraciones, no comprobaciones)

Las escribe el responsable **en el momento de ejecutar** (§6), **solo después de comprobar** cada condición. Nunca se rellenan de antemano en documentos, scripts ni en el historial del shell.

| Variable | Valor | Significado |
|---|---|---|
| `backup_verificado` | `SI` | Hay un backup reciente y se comprobó que restaura. |
| `instrumentacion_desactivada` | `SI` | El envío R05 está desactivado en **todas** las instancias de la aplicación. |
| `drenaje_confirmado` | `SI` | Pasaron **15 minutos** desde que se desactivó la instrumentación, o se reiniciaron todas las instancias. |
| `huerfanas` | entero ≥ 0, solo dígitos | Número exacto de operaciones abiertas antiguas que el responsable reconoce (§3 paso 5). |

Cualquier valor distinto de `SI` exacto (por ejemplo `si`, `YES`, vacío) hace abortar el script.

SQL no puede comprobar procesos remotos, y estas declaraciones por sí solas no garantizan que no haya procesos vivos.

Hay dos umbrales distintos:
- **drenaje:** 15 minutos, lo cumple el operador antes de ejecutar;
- **actividad reciente:** 10 minutos, lo comprueba el script bajo el bloqueo.

## 6. Comando (solo con autorización futura)

Bloque de shell para la VM, desde el clon actualizado. Pide cada valor, valida `huerfanas` y solo entonces llama a psql. No contiene valores prellenados.

```sh
cd /home/proceit24/nexit-instalacao
read -r -p 'backup_verificado (escribir SI solo si se comprobó la restauración): ' BACKUP
read -r -p 'instrumentacion_desactivada (SI solo si está desactivada en todas las instancias): ' INSTR
read -r -p 'drenaje_confirmado (SI solo tras 15 minutos o reinicio de todas las instancias): ' DRENAJE
read -r -p 'huerfanas (número exacto de verificar-NEX-084.sql §2, solo dígitos): ' HUERFANAS
if printf '%s' "$HUERFANAS" | grep -Eqx '[0-9]{1,9}'; then
  docker exec -i nexit-db psql -X -U nexit_app -d nexit -v ON_ERROR_STOP=1 -1 \
    -v backup_verificado="$BACKUP" -v instrumentacion_desactivada="$INSTR" \
    -v drenaje_confirmado="$DRENAJE" -v huerfanas="$HUERFANAS" \
    -f - < documentacao/banco/nexit/v1/scripts/desactivar-envio-r05.sql
  echo "codigo_salida=$?"
else
  echo 'huerfanas no es un entero no negativo: no se ejecuta.'
fi
```

- **Modelo transaccional único: `psql -1` con `-f -`.** El archivo no contiene BEGIN ni COMMIT. psql aplica `-1` solo a `-c`/`-f`; `-f -` lee de la entrada estándar.
- **Aislamiento:** la primera sentencia SQL del archivo es `SET TRANSACTION ISOLATION LEVEL READ COMMITTED` y el script comprueba el aislamiento efectivo antes de tocar catálogo o datos. No depende del valor por defecto del servidor ni de la sesión.
- **Sin `-1` o sin `-f`** (por ejemplo `psql -1 < archivo`): la marca de transacción que el script fija en una sentencia anterior no sobrevive y aborta antes de bloquear. No depende de un `lock_timeout` que la sesión trajera configurado.
- **Sin `ON_ERROR_STOP=1`:** el script lo activa y fuerza un error antes de cualquier bloqueo o escritura, así que psql termina con código distinto de 0 (3) y sin commit.
- `lock_timeout` local de 5 segundos: si otro proceso retiene el bloqueo 7340001 o la fila de modo, el script aborta sin cambios en lugar de esperar indefinidamente.
- Este contrato no protege frente a un operador que altere el archivo, el comando o la sesión.

## 7. Qué hace, en orden (una sola transacción)

1. `SET TRANSACTION ISOLATION LEVEL READ COMMITTED` como primera sentencia y `lock_timeout` local de 5s.
2. Comprueba la transacción única, el aislamiento efectivo `read committed`, el `lock_timeout` y las confirmaciones. Todavía no toma bloqueos ni lee datos.
3. Toma `pg_advisory_xact_lock(7340001)`.
4. Bajo ese bloqueo comprueba:
   - el inventario exacto NEX-001…NEX-085 y la compatibilidad (§2);
   - el rol `nexit_runtime`;
   - las firmas exactas: 31 auxiliares internos, ayudante, 7 escrituras, 3 lecturas, funciones E03 antiguas, camino NEX-062/080, wrapper y base;
   - que los 42 objetos tengan un único dueño y que el usuario sea ese dueño o miembro de su rol;
   - que los 4 guardas sean funciones de disparador;
   - la forma de `fe_e03_r05_abiertas`;
   - que el ayudante sea el **corregido por NEX-085** (32 REVOKE por firma; control por texto, no por hash del cuerpo);
   - las tablas y los 17 disparadores habilitados.
5. Bloquea `nex_e03_r05_estado` con `FOR UPDATE`. Las escrituras R05 toman esa fila con `FOR SHARE` antes del documento, así que el orden de bloqueo se mantiene. Con el modo inicial ya fijado bajo ese bloqueo, comprueba la **ACL previa completa** (§8, con las 7 escrituras según el modo inicial).
6. Captura la **línea base** de filas de evidencia, R05 y NEX-072 por separado, ya bajo el bloqueo. Como cada sentencia toma una instantánea nueva (READ COMMITTED), incluye toda escritura R05 confirmada mientras se esperaba la fila.
7. Toma **un único corte** con `clock_timestamp()`.
8. Cuenta con `fe_e03_r05_abiertas(corte)`, sin redefinirla ni duplicarla.
9. Si hay operaciones recientes (> 0), aborta. Si las antiguas no coinciden con `huerfanas`, aborta.
10. Cambia el modo:
    - si estaba `ACTIVO`, actualiza `modo`, `cambiado_at` y `motivo` (máximo 300 caracteres, sin datos fiscales);
    - si ya estaba `REVERTIDO`, no toca la fila (idempotente) pero aplica igualmente todas las confirmaciones, recuentos y controles de ACL.
11. Reaplica **solo** `public.nex_aplicar_grants_facturacion_e03_r05()`. No lo redefine y no llama al wrapper ni a la base.
12. Comprueba las postcondiciones (§8). Si algo falla, aborta y la transacción no se confirma.
13. Muestra el informe previo al commit: modo, `cambiado_at`, `motivo`, resultado, modo inicial, aislamiento, corte, abiertas, recientes, antiguas, filas de evidencia R05 y filas NEX-072.
14. `psql -1` hace el COMMIT al terminar el archivo.

No toca documentos fiscales, estados, CDC, lote, stock, FE/NCE, consulta ni KuDE. No borra ni cierra operaciones, evidencias, proyecciones, cierres, autenticaciones, POST grandes ni salidas tardías, y no toca `schema_migrations`.

Las operaciones huérfanas quedan abiertas en la evidencia, y cada documento sigue la regla vigente de NEX-062 y la recuperación D4/D5 y D-C02-2-A. Si una transmisión no tiene respuesta recuperable, se concilia por consulta en la misma cuenta, nunca con un POST ciego.

Un proceso que conserve su testigo e intente escribir después recibe `NEX:E03_R05_REVERTIDO`.

## 8. ACL y postcondiciones (dentro de la transacción)

La misma consulta de privilegios **efectivos** se ejecuta antes del cambio (paso 5) y después del ayudante (paso 12). Cualquier desvío aborta. El script no corrige permisos, no añade GRANT ni REVOKE y no redefine el ayudante.

| Control | Antes del cambio | Después del ayudante |
|---|---|---|
| 3 lecturas | EXECUTE de runtime | EXECUTE de runtime |
| 7 escrituras | `ACTIVO`: EXECUTE de runtime · `REVERTIDO`: sin EXECUTE ni entrada directa | sin EXECUTE ni entrada directa |
| 31 internos + ayudante | sin EXECUTE ni entrada directa de runtime | igual |
| `EXECUTE WITH GRANT OPTION` de runtime en los 42 (incluidas las lecturas) | ninguno | ninguno |
| PUBLIC en los 42 | sin EXECUTE | sin EXECUTE |
| `operaciones_r05` | SELECT exacto en las **10** columnas del ayudante (`operacion_id`, `empresa_id`, `documento_id`, `version`, `correlacion_id`, `actor_id`, `confirma_rechazo`, `conexion`, `payload_hash`, `creado_at`); ninguna otra columna (tampoco `testigo_sha256`); sin SELECT de tabla | igual |
| DML de runtime en las 6 tablas R05, `nex_e03_r05_estado` y la evidencia NEX-072 | sin INSERT/UPDATE/DELETE/TRUNCATE de tabla y sin INSERT/UPDATE por columna | igual |
| SELECT previsto | en las otras 5 tablas R05, `nex_e03_r05_estado` y la evidencia NEX-072 | igual |
| Camino NEX-062/NEX-080 | EXECUTE de runtime | igual |
| Funciones E03 antiguas y ayudante NEX-072 | sin EXECUTE de runtime | igual |

Además, después del ayudante:

| Control | Esperado |
|---|---|
| Modo | `REVERTIDO`. Si ya lo estaba: `cambiado_at` y `motivo` sin cambios |
| Evidencia | mismo **número** de filas que la línea base, por separado en las 6 tablas R05 y en la evidencia NEX-072 (igualdad de cantidades, no de contenido) |
| Registros | `schema_migrations` idéntico (versiones y checksums) |
| Disparadores | los mismos 17 habilitados |

## 9. Criterios de bloqueo (el script aborta sin cambios)

- Falta `ON_ERROR_STOP=1`, falta `-1` o `-f`, el aislamiento efectivo no es READ COMMITTED, o `lock_timeout` no está vigente.
- Falta alguna confirmación, no es `SI` exacto, o `huerfanas` no es un entero.
- No se obtiene el bloqueo 7340001 ni la fila de modo en 5 segundos.
- Falta alguna versión de NEX-001…NEX-085, hay NEX-000, duplicados o versiones no canónicas, NEX-084 o NEX-085 tienen otro checksum, o hay una sucesora no revisada.
- Falta el rol, una firma, una tabla o un disparador; el dueño es distinto; el usuario no está autorizado; o el ayudante no es el corregido.
- La ACL previa no coincide con §8.
- Hay operaciones con actividad reciente, o las huérfanas difieren del número reconocido.
- Falla cualquier postcondición, incluido un cambio en el número de filas de evidencia bajo el bloqueo (actividad no coordinada).

## 10. Interpretar el resultado

Ni el informe mostrado antes del COMMIT ni el código de salida por sí solos prueban lo que quedó en el servidor. Hay tres resultados distintos:

- **A. Aborto confirmado antes del commit.** psql muestra un error `desactivar-envio-r05: …` dentro de la transacción y termina con código distinto de 0, y la conexión no se perdió. No hubo commit y no cambió nada. Seguir §11.
- **B. Commit confirmado.** psql termina con código 0 y sin errores. Aun así, hacer la verificación posterior independiente:
  1. `verificar-NEX-084.sql -v entorno=VM`: **41/41**.
  2. `verificar-NEX-085.sql -v entorno=VM`: **24/24** y cero desvíos por firma. Los controles 21 y 22 quedan aplicados al modo `REVERTIDO`.
  3. `SELECT modo, cambiado_at, motivo FROM public.nex_e03_r05_estado;`: `REVERTIDO`.
  4. Las 85 migraciones con los checksums de NEX-084 y NEX-085 sin cambios.
  5. La evidencia sigue íntegra y legible, y las huérfanas reconocidas siguen abiertas.
- **C. Resultado desconocido.** Se perdió la conexión, se perdió la confirmación del COMMIT, la salida quedó truncada o es ambigua, o el código no es 0 sin un error claro del script. El servidor **pudo** haber confirmado. Seguir §11.

## 11. Recuperación

- **Resultado A (aborto confirmado):**
  1. Leer el mensaje `desactivar-envio-r05: …`.
  2. Corregir la causa: esperar el drenaje, recontar las huérfanas, cerrar la ventana a otros procesos o pedir una revisión de compatibilidad.
  3. Repetir solo cuando la causa esté resuelta. **No reintentar a ciegas.**
- **Resultado C (desconocido):**
  1. **No repetir** el script.
  2. Consultar en solo lectura el modo vigente: `SELECT modo, cambiado_at, motivo FROM public.nex_e03_r05_estado;`.
  3. Consultar los privilegios efectivos y la evidencia en solo lectura.
  4. Ejecutar los verificadores (§10 B) solo dentro de una operación futura autorizada.
  5. Revisar los registros de psql y de PostgreSQL.
  6. Diagnosticar y pedir una decisión antes de cualquier otra acción.
- En ningún caso: no hacer REVOKE/GRANT manual como recuperación, no restaurar el ayudante anterior a NEX-085 y no editar migraciones ni registros.

## 12. Reactivación

No está en este procedimiento. Volver a `ACTIVO` requiere una orden futura separada, con su propio script, verificación y auditoría. No se entrega ningún script de reactivación.
