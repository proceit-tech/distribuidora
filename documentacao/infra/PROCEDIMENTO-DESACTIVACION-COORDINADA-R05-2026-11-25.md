# Procedimiento — desactivación coordinada del envío R05

25/11/2026 · PRO-312-R02-C04 · resuelve R-VM-085-01 · PR #7 Draft.
Script: [`desactivar-envio-r05.sql`](../banco/nexit/v1/scripts/desactivar-envio-r05.sql) (SHA-256 `d6c09c31d7e4616fd4ca3ed28b53ae0fb16f2124cbdeebc2ffdbde978d0d3ee8`).
Fuentes: [orden C04](../ordens/ORD-CLAUDE-NEXIT-PRO-312-R02-C04-DESACTIVACION-R05-2026-11-25.md) · [auditoría NEX-085 (R-VM-085-01)](../testes/AUD-CHATGPT-NEXIT-PRO-312-R02-C03-NEX-085-2026-11-25.md) · [verificación VM 65/65](../testes/AUD-CHATGPT-NEXIT-PRO-312-R02-C03-NEX-085-VM-2026-11-25.md) · [casos C04](../testes/CASOS-NEXIT-PRO-312-R02-C04-DESACTIVACION-R05-2026-11-25.md).

> **Nada de este procedimiento fue ejecutado.** Hoy NO se activa ni se desactiva R05 en la VM. Se ejecuta solo con una orden futura y autorización expresa del responsable. Ninguna IA lo ejecuta.

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

| Migración | Checksum exacto | Estado en esta revisión (C04) |
|---|---|---|
| NEX-084 | `38d45ea661ed5d8f1dc3d43dc6b0f727f8872c6bdd0fbab5745cc7802f5b6854` | obligatoria |
| NEX-085 | `34f57411cef8f17c01f249b6e21e1904c8aa7aecd83718965bcfbadd4b29c7d7` | obligatoria |
| Cualquier versión > NEX-085, o fuera del formato `NEX-NNN` | — | **no revisada: bloquea** |

El script exige además exactamente 85 registros NEX-001…NEX-085.

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
   - sección 2 de NEX-085 sin filas (cero desvíos por firma).
3. **Registros.**
   - `SELECT version, checksum FROM public.schema_migrations WHERE version >= 'NEX-084' ORDER BY version;` debe devolver exactamente NEX-084 y NEX-085 con sus checksums.
   - `SELECT count(*) FROM public.schema_migrations;` debe dar 85.
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
- reactivación;
- otro cambio de modo;
- despliegues que reactiven la instrumentación.

**Límite del runner:** el script toma `pg_advisory_xact_lock(7340001)`, el mismo bloqueo que el runner toma en la transacción de cada migración. Sin embargo, la reaplicación final del wrapper que hace el runner (`aplicar-migraciones.sh`, líneas 54–58) corre **fuera** de ese bloqueo y no queda cubierta. Por eso la ventana debe ser exclusiva.

Nada protege frente a superusuarios, procesos externos o SQL directo que no respeten este protocolo.

## 5. Confirmaciones del operador (declaraciones, no comprobaciones)

Se escriben a mano en el comando y **nunca se rellenan de antemano** en documentos ni scripts.

| Variable | Significado |
|---|---|
| `backup_verificado=SI` | Hay un backup reciente y se comprobó que restaura. |
| `instrumentacion_desactivada=SI` | El envío R05 está desactivado en **todas** las instancias de la aplicación. |
| `drenaje_confirmado=SI` | Pasaron **15 minutos** desde que se desactivó la instrumentación, o se reiniciaron todas las instancias. |
| `huerfanas=<N>` | Número exacto (entero ≥ 0) de operaciones abiertas antiguas que el responsable reconoce. |

SQL no puede comprobar procesos remotos, y estas declaraciones por sí solas no garantizan que no haya procesos vivos.

Hay dos umbrales distintos:
- **drenaje:** 15 minutos, lo cumple el operador antes de ejecutar;
- **actividad reciente:** 10 minutos, lo comprueba el script bajo el bloqueo.

## 6. Comando exacto (solo con autorización futura)

```
docker exec -i nexit-db psql -X -U nexit_app -d nexit -v ON_ERROR_STOP=1 -1 \
  -v backup_verificado=SI -v instrumentacion_desactivada=SI -v drenaje_confirmado=SI -v huerfanas=<N> \
  -f - < documentacao/banco/nexit/v1/scripts/desactivar-envio-r05.sql
```

- **Modelo transaccional único: `psql -1`.** El archivo no contiene BEGIN ni COMMIT.
- `-f -` es obligatorio: psql aplica `-1` solo a `-c`/`-f`, y `-f -` lee de la entrada estándar. Si se ejecuta sin `-1`, el primer control aborta antes de tomar bloqueos (el `SET LOCAL` no tiene efecto fuera de una transacción).
- Si falta `ON_ERROR_STOP=1`, el script fuerza un error, la transacción queda abortada y termina en ROLLBACK.
- `lock_timeout` local de 5 segundos: si otro proceso retiene el bloqueo 7340001 o la fila de modo, el script aborta sin cambios en lugar de esperar indefinidamente.

## 7. Qué hace, en orden (una sola transacción)

1. Comprueba las confirmaciones y que `lock_timeout` local sea 5s.
2. Toma `pg_advisory_xact_lock(7340001)`.
3. Bajo ese bloqueo comprueba:
   - la compatibilidad (§2);
   - el rol `nexit_runtime`;
   - las firmas exactas: 31 auxiliares internos, ayudante, 7 escrituras, 3 lecturas, funciones E03 antiguas, camino NEX-062/080, wrapper y base;
   - que los 42 objetos tengan un único dueño y que el usuario sea ese dueño o miembro de su rol;
   - que los 4 guardas sean funciones de disparador;
   - la forma de `fe_e03_r05_abiertas`;
   - que el ayudante sea el **corregido por NEX-085** (32 REVOKE por firma);
   - las tablas y los 17 disparadores habilitados;
   - la ACL previa coherente: internos sin EXECUTE de runtime y PUBLIC sin EXECUTE.
4. Bloquea `nex_e03_r05_estado` con `FOR UPDATE`. Las escrituras R05 toman esa fila con `FOR SHARE` antes del documento, así que el orden de bloqueo se mantiene.
5. Toma **un único corte** con `clock_timestamp()` y cuenta con `fe_e03_r05_abiertas(corte)`, sin redefinirla ni duplicarla:
   - si hay operaciones recientes (> 0), aborta;
   - si las antiguas no coinciden con `huerfanas`, aborta.
6. Cambia el modo:
   - si estaba `ACTIVO`, actualiza `modo`, `cambiado_at` y `motivo` (máximo 300 caracteres, sin datos fiscales);
   - si ya estaba `REVERTIDO`, no toca la fila (idempotente) pero aplica igualmente todas las confirmaciones y recuentos.
7. Reaplica **solo** `public.nex_aplicar_grants_facturacion_e03_r05()`. No lo redefine y no llama al wrapper ni a la base.
8. Comprueba las postcondiciones (§8). Si algo falla, aborta y se hace ROLLBACK total.
9. Muestra el informe: modo, `cambiado_at`, `motivo`, resultado, modo inicial, corte, abiertas, recientes, antiguas y filas de evidencia. Después, `psql -1` hace el COMMIT.

No toca documentos fiscales, estados, CDC, lote, stock, FE/NCE, consulta ni KuDE. No borra ni cierra operaciones, evidencias, proyecciones, cierres, autenticaciones, POST grandes ni salidas tardías, y no toca `schema_migrations`.

Las operaciones huérfanas quedan abiertas en la evidencia, y cada documento sigue la regla vigente de NEX-062 y la recuperación D4/D5 y D-C02-2-A. Si una transmisión no tiene respuesta recuperable, se concilia por consulta en la misma cuenta, nunca con un POST ciego.

Un proceso que conserve su testigo e intente escribir después recibe `NEX:E03_R05_REVERTIDO`.

## 8. Postcondiciones (dentro de la transacción, antes del COMMIT)

| Control | Esperado |
|---|---|
| Modo | `REVERTIDO`. Si ya lo estaba: `cambiado_at` y `motivo` sin cambios |
| 3 lecturas | EXECUTE de runtime |
| 7 escrituras | sin EXECUTE ni entrada directa de runtime |
| 31 internos + ayudante | sin EXECUTE ni entrada directa (ni grant option) de runtime |
| PUBLIC en los 42 | sin EXECUTE |
| Testigo | `testigo_sha256` privado; SELECT solo por columnas en `operaciones_r05` |
| Escritura directa de runtime | ninguna (INSERT/UPDATE/DELETE/TRUNCATE) en las 6 tablas R05 y en `nex_e03_r05_estado` |
| SELECT autorizado | conservado |
| Camino NEX-062/NEX-080 | EXECUTE de runtime conservado |
| Funciones E03 antiguas | restringidas; evidencia NEX-072 solo con SELECT |
| Evidencia | mismo número de filas en las 6 tablas R05 + evidencia NEX-072 |
| Registros | `schema_migrations` idéntico (versiones y checksums) |
| Disparadores | los mismos 17 habilitados |

## 9. Criterios de bloqueo (el script aborta sin cambios)

- Falta alguna confirmación, o `huerfanas` no es un entero.
- Falta `-1`, falta `ON_ERROR_STOP=1`, o `lock_timeout` no está vigente.
- No se obtiene el bloqueo 7340001 ni la fila de modo en 5 segundos.
- NEX-084 o NEX-085 faltan o tienen otro checksum, no hay 85 registros, o hay una sucesora no revisada.
- Falta el rol, una firma, una tabla o un disparador; el dueño es distinto; el usuario no está autorizado; el ayudante no es el corregido; o la ACL previa es incoherente.
- Hay operaciones con actividad reciente, o las huérfanas difieren del número reconocido.
- Falla cualquier postcondición.

## 10. Verificación posterior (independiente, solo lectura)

Solo si psql terminó con **código de salida 0**. El informe mostrado antes del COMMIT no prueba que el commit haya ocurrido.

1. `verificar-NEX-084.sql -v entorno=VM`: **41/41**.
2. `verificar-NEX-085.sql -v entorno=VM`: **24/24** y cero desvíos por firma. Los controles 21 y 22 quedan aplicados al modo `REVERTIDO`.
3. `SELECT modo, cambiado_at, motivo FROM public.nex_e03_r05_estado;`: `REVERTIDO`.
4. Las 85 migraciones con los checksums de NEX-084 y NEX-085 sin cambios.
5. La evidencia sigue íntegra y legible, y las órfanas reconocidas siguen abiertas.

## 11. Recuperación ante errores

- **El script abortó:** psql hace ROLLBACK, así que no cambió nada.
  1. Leer el mensaje `desactivar-envio-r05: …`.
  2. Corregir la causa: esperar el drenaje, recontar las huérfanas, cerrar la ventana a otros procesos o pedir una revisión de compatibilidad.
  3. Repetir solo cuando la causa esté resuelta. **No reintentar a ciegas.**
- **Error después de un commit aparente, o código de salida dudoso:** no repetir ni intentar un REVOKE/GRANT manual. Primero ejecutar los verificadores (§10) y consultar la fila de modo y `schema_migrations`. Después, diagnosticar y pedir instrucción.
- **No restaurar el ayudante anterior a NEX-085, no conceder permisos como recuperación** y no editar migraciones ni registros.

## 12. Reactivación

No está en este procedimiento. Volver a `ACTIVO` requiere una orden futura separada, con su propio script, verificación y auditoría. No se entrega ningún script de reactivación.
