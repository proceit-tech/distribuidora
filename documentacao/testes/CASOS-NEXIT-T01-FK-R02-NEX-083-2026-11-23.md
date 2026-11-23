# CASOS NEXIT-T01-FK-R02 / NEX-083 — dos FK `empresa_id → empresas(id)` (23/11/2026)

**Estado: casos ESCRITOS, NINGUNO EJECUTADO.** Claude no ejecutó SQL, psql, pruebas, lint, build ni CI manual, y no accedió a VM, Docker, gateway ni base real o efímera. El único resultado de máquina es el GitHub Actions **automático** que dispara el push del commit de esta entrega. Ese resultado no es homologación ni autorización para la VM.

- Orden: `documentacao/ordens/ORD-CLAUDE-NEXIT-T01-FK-R02-NEX-083-DOS-FK-2026-11-23.md` (PRO-363 / PRO-62).
- Diagnóstico de la Fase 1, sin cambios en R02: `documentacao/analises/NEXIT-T01-FK-R01-DIAGNOSTICO-FK-EMPRESA-2026-11-23.md` y `scripts/diagnostico-T01-FK-01.sql`.
- Archivos de R02:
  - `migraciones/NEX-083-fks-empresa-auditoria-preparacion.sql`, con SHA-256 `88de3731ef433c28ff348659831523ef9d1ca1960e29a2b94dd49642c3c4e1cc`.
  - `scripts/preflight-NEX-083.sql`
  - `scripts/verificar-NEX-083.sql`
  - `scripts/reversion-NEX-083.sql`
- Las dos FK esperadas:

| Tabla hija | Constraint | Definición |
|---|---|---|
| `public.fe_estado_previo_nex065` (foto de auditoría de NEX-065, se conserva) | `fe_estado_previo_nex065_empresa_fk` | `FOREIGN KEY (empresa_id) REFERENCES empresas(id)`, NO ACTION / NO ACTION, MATCH SIMPLE, NOT DEFERRABLE, `convalidated = true` |
| `public.fe_stock_pendientes_preparacion` (preparación interna de NEX-081, vacía) | `fe_stock_pendientes_preparacion_empresa_fk` | la misma definición |

## Entorno previsto para una ejecución futura (no realizada)

La ejecución futura usaría una base **descartable**:
- creada con el runner oficial (`scripts/aplicar-migraciones.sh`, `psql -1`), NEX-001…083 y semilla;
- o creada con NEX-001…082 cuando el caso requiera el estado previo.

Cada caso indica la condición de partida, la acción y el resultado esperado. Los códigos `NEX:NEX083_*` aparecen en el `DETAIL` del error, que lleva ERRCODE `P0001`.

## A. Gates de la migración (estado previo NEX-001…082)

| ID | Partida | Acción | Esperado |
|---|---|---|---|
| FK83-A01 | Base NEX-001…082 limpia (foto con N filas válidas y preparación vacía) | Aplicar NEX-083 con el runner | Éxito. Se crean las dos FK con `convalidated = true`. La foto conserva N filas. Se escribe la fila `NEX-083` con el checksum `88de3731…c1cc`. `NOTICE` con N |
| FK83-A02 | Igual que A01 | `psql -f` del archivo SIN `-1` (sin transacción) | Aborta en G0 con `NEX083_SIN_TRANSACCION`. No se crea ninguna FK |
| FK83-A03 | `schema_migrations` sin NEX-082 (o NEX-065/081 ausente) | Aplicar NEX-083 | Aborta en G1 con `NEX083_DEPENDENCIA` |
| FK83-A04 | NEX-065, NEX-081 o NEX-082 registrada con otro checksum | Aplicar NEX-083 | Aborta en G1 con `NEX083_DEPENDENCIA`. En la práctica el runner ya aborta antes, con código 4, por checksum distinto |
| FK83-A05 | Fila `NEX-083` ya registrada | Ejecutar el archivo manualmente dentro de una transacción | Aborta en G1 con `NEX083_YA_REGISTRADA`. El runner, en cambio, la omite como aplicada |
| FK83-A06 | Versión `NEX-084` registrada | Aplicar NEX-083 | Aborta en G1 con `NEX083_ORDEN` |
| FK83-A07 | `fe_stock_pendientes_preparacion` eliminada o convertida en vista | Aplicar | Aborta en G2 con `NEX083_DEPENDENCIA`, sin cast `::regclass` fallido |
| FK83-A08 | Rol ejecutor que no es dueño de las hijas o que no tiene `REFERENCES` en `empresas` | Aplicar | Aborta en G3 con `NEX083_ROL`. No concede nada |
| FK83-A09 | Columna extra, tipo distinto (`empresa_id text`) o NULL permitido en una de las dos tablas | Aplicar | Aborta en G4 con `NEX083_ESTRUCTURA` |
| FK83-A10 | PK de la foto con otro orden u otras columnas, o PK de la preparación distinta | Aplicar | Aborta en G4 con `NEX083_ESTRUCTURA` |
| FK83-A11 | `empresas.id` sin PK de una sola columna | Aplicar | Aborta en G4 con `NEX083_ESTRUCTURA` |
| FK83-A12 | La foto ya tiene una FK manual (cualquier nombre o definición), o una FK `NOT VALID` previa | Aplicar | Aborta en G5 con `NEX083_PREEXISTENTE`. No se reaplica por suposición |
| FK83-A13 | Existe un constraint `fe_stock_pendientes_preparacion_empresa_fk` en otra tabla de `public` | Aplicar | Aborta en G5 con `NEX083_PREEXISTENTE` |
| FK83-A14 | Tercera tabla con `empresa_id` sin FK anclada (tabla sintética creada antes) | Aplicar | Aborta en G6 con `NEX083_INVENTARIO`. El mensaje lista las 3 tablas. No hay corrección parcial |
| FK83-A15 | Una de las 84 tablas conformes pierde su FK (DROP manual) | Aplicar | Aborta en G6 con `NEX083_INVENTARIO` |
| FK83-A16 | La foto tiene 1 fila con `empresa_id` de una empresa inexistente (insertada como superusuario con `session_replication_role = replica`) | Aplicar | Aborta en G7 con `NEX083_HUERFANOS`. La fila NO se borra ni se corrige |
| FK83-A17 | La preparación tiene 1 fila con una empresa válida | Aplicar | Aborta en G7 con `NEX083_PREPARACION_NO_VACIA` |
| FK83-A18 | La preparación tiene 1 fila huérfana | Aplicar | Aborta en G7 con `NEX083_PREPARACION_NO_VACIA`. La vacuidad se comprueba antes de crear la FK |
| FK83-A19 | Foto **no vacía** con todas sus filas válidas (caso real esperado en la VM) | Aplicar | Éxito. Sin DML: el conteo de filas y el md5 del contenido ordenado son idénticos antes y después |
| FK83-A20 | Foto **vacía** (empresa sin puntos de expedición al aplicar NEX-065) | Aplicar | Éxito: la foto no se exige con filas ni vacía |

## B. Bloqueo, concurrencia y atomicidad

| ID | Partida | Acción | Esperado |
|---|---|---|---|
| FK83-B01 | Sesión 2 con transacción abierta que hizo `INSERT` en `fe_stock_pendientes_preparacion` (emisión FE con faltante en curso) | Aplicar NEX-083 | `LOCK … SHARE ROW EXCLUSIVE` espera 5 s y falla con `lock_timeout`. Rollback total: sin FK y sin fila `NEX-083` |
| FK83-B02 | Sesión 2 con transacción abierta que hizo `UPDATE` en `empresas` (ROW EXCLUSIVE) | Aplicar | Falla por `lock_timeout` en el lock de `empresas`. Rollback total |
| FK83-B03 | Sesión 2 hace solo `SELECT … FOR KEY SHARE` sobre `empresas` (la FK de otra tabla al emitir) | Aplicar | No bloquea: ROW SHARE es compatible con SHARE ROW EXCLUSIVE. Éxito |
| FK83-B04 | NEX-083 en curso, ya con los locks tomados | Sesión 2 intenta emitir una FE que escribe la preparación | La sesión 2 espera hasta el COMMIT del runner, sin error. Después, su INSERT valida la FK y tiene éxito |
| FK83-B05 | Orden de locks | Inspeccionar `pg_locks` durante A01 | Orden fijo: foto → preparación → empresas, que coincide con el de ALTER TABLE (hijas antes que padre). ALTER no escala de modo: no se piden locks nuevos tras las validaciones |
| FK83-B06 | Fallo artificial después de la primera FK (por ejemplo, la segunda tabla con huérfano insertado entre G7 y ADD, imposible bajo lock) | Revisión de diseño | Una sola transacción `psql -1`: cualquier error revierte ambas FK y la fila de `schema_migrations`. No existe instalación parcial |
| FK83-B07 | Fallo de la verificación interna (simulado) | Aplicar | `NEX083_VERIFICACION`. Rollback total |

## C. Verificación posterior (`verificar-NEX-083.sql`)

| ID | Partida | Esperado |
|---|---|---|
| FK83-C01 | Tras A01 | Sección 1: todas las filas con `ok = true` (controles 11–12, 21–22, 30–32, 40–41, 50, 60–61, 70–71, 80–81) |
| FK83-C02 | FK sustituida por `ON DELETE CASCADE` con el mismo nombre | Control 2x en false y control 30 en false |
| FK83-C03 | FK recreada `NOT VALID` | Controles 2x, 30 y 32 en false |
| FK83-C04 | FK recreada `DEFERRABLE INITIALLY DEFERRED` | Control 2x en false |
| FK83-C05 | FK extra duplicada con otro nombre | Control 31 en false |
| FK83-C06 | Se otorga `GRANT SELECT` sobre la foto a `nexit_runtime` | Control 70 en false. Sin el rol `nexit_runtime`, el control da `ok` |
| FK83-C07 | Fila de `NEX-083` con otro checksum | Control 80 en false |
| FK83-C08 | Sección 3 de la verificación comparada con la sección 2 del preflight | Mismo número de filas de la foto |
| FK83-C09 | Se ejecuta sin ser dueño | Error de permiso en la sección de datos (documentado). No da falsos `ok` |

## D. Preflight (`preflight-NEX-083.sql`)

| ID | Partida | Esperado |
|---|---|---|
| FK83-D01 | Base NEX-001…082 sana | Sección 1 con todas las filas `ok = true`. Sección 3: solo las dos PK. Sección 4: vacía en la ventana |
| FK83-D02 | Base sin `schema_migrations` o sin alguna de las tablas | Filas en false y **sin error**: se usan `query_to_xml` dentro de CASE y el catálogo |
| FK83-D03 | NEX-083 ya aplicada | Controles 5, 30 y 40 en false: no reaplicar |
| FK83-D04 | Huérfano en la foto o preparación no vacía | Control 60 o 61 en false |
| FK83-D05 | Tercera tabla incumplidora | Control 40 en false |
| FK83-D06 | Cualquier ejecución | `BEGIN READ ONLY` … `ROLLBACK`: no escribe nada. Solo devuelve conteos, nunca valores de `empresa_id` |

## E. Reversión (`reversion-NEX-083.sql`, manual, `psql -1`)

| ID | Partida | Acción | Esperado |
|---|---|---|---|
| FK83-E01 | Tras A01, sin versiones posteriores | Ejecutar la reversión | Elimina exactamente las dos FK (sin CASCADE). Las PK quedan intactas, la foto con las mismas filas y la fila `NEX-083` sigue en `schema_migrations`. El NOTICE pide conciliación manual |
| FK83-E02 | Igual que E01 | Ejecutar sin `-1` | Aborta en P0 |
| FK83-E03 | `NEX-083` registrada con otro checksum o no registrada | Ejecutar | Aborta en P1 y no borra nada |
| FK83-E04 | `NEX-084` registrada | Ejecutar | Aborta en P1 por dependencias posteriores |
| FK83-E05 | Una de las dos FK ya eliminada a mano (estado parcial) | Ejecutar | Aborta en P3 por estado mixto |
| FK83-E06 | FK con definición alterada, o una FK extra en la foto | Ejecutar | Aborta en P3 |
| FK83-E07 | Tras E01 | Correr T01 | Falla de nuevo en `T01-estructura.sql:45` (esperado y documentado) |
| FK83-E08 | Tras E01 | Correr `verificar-NEX-083.sql` | Controles 1x, 2x, 30 y 50 en false; control 80 en true (fila no conciliada) |
| FK83-E09 | Tras E01 y conciliación a) (`DELETE … WHERE version='NEX-083' AND checksum=…`, 1 fila) | Volver a correr el runner | Reinstala NEX-083 con todos sus gates (equivale a A01) |
| FK83-E10 | NEX-083 aplicada | Intentar `reversion-NEX-081.sql` o `reversion-NEX-065.sql` primero | Orden de mantenimiento: revertir NEX-083 antes. Si no se hace, el DROP TABLE de la hija elimina implícitamente su FK y `schema_migrations` queda afirmando NEX-083 sin las FK, lo que obliga a conciliar a mano. No se modifican esas reversiones (fuera de alcance) |

## F. T01 y regresión de la batería

| ID | Partida | Esperado |
|---|---|---|
| FK83-F01 | Batería `ejecutar-pruebas.sh` sobre NEX-001…083 | `T01-estructura.sql:38-45` sin tablas incumplidoras: deja de fallar por FK. Junto con NEX-082 (triggers), T01 no debería tener más fallas conocidas. Cualquier otra aserción que falle se informa, no se modifica |
| FK83-F02 | V0 de `ejecutar-pruebas.sh` (`DELETE FROM empresas` de las sintéticas 80003314/5469464 en la copia `_prod`) | Sigue pasando: esas empresas no tienen puntos ni secuencias, por lo que tampoco filas en la foto (la foto sale solo de `fe_punto_secuencias`, que ya tiene FK a empresas e inmutabilidad NEX-060/063) |
| FK83-F03 | `demo_eliminar` (NEX-012) sobre una empresa DEMO | Sin cambio funcional: una empresa con filas en la foto ya era imborrable por `fe_punto_secuencias`. La nueva FK no añade bloqueo nuevo |
| FK83-F04 | T24, T29 y T33 (bases propias NEX-001…064/065) | No se afectan: no aplican NEX-083 |
| FK83-F05 | Casos de app (`lib/**/*.casos.ts`) que enumeran migraciones con filtros por prefijo (`< NEX-057`, `NEX-04[34]`, `NEX-0(3[89]\|40)`) | No se afectan por un archivo `NEX-083-*` |

## G. Regresión funcional FE/NCE/stock (diseño; requiere base descartable)

| ID | Partida | Acción | Esperado |
|---|---|---|---|
| FK83-G01 | Política de stock = permitir faltante (NEX-081) | Emitir una FE nueva con faltante vía `fe_documento_crear_fe_stock_pendiente` | INSERT y DELETE de la preparación en la misma transacción. La FK valida `p_empresa` (existe, porque el depósito ya se validó con `empresa_id = p_empresa`). FE emitida y preparación vacía al terminar. Resultado idéntico al previo a NEX-083 |
| FK83-G02 | Reintento idempotente de la misma clave | Repetir G01 | Sin INSERT en la preparación (`v_existe`). Sin cambio |
| FK83-G03 | Política = bloquear (valor por defecto) | Emitir una FE | No toca la preparación. Sin cambio |
| FK83-G04 | Emisión NCE, consulta, KuDE, cancelación y numeración | Flujos habituales | No tocan ninguna de las dos tablas. Sin cambio |
| FK83-G05 | Llamada directa (solo SQL, la app nunca lo hace) con un `p_empresa` inexistente y sin depósitos | `fe_documento_crear_fe_stock_pendiente` | Antes fallaba más tarde, por la FK de `documentos_electronicos`. Ahora puede fallar antes, con `23503` en la preparación. El rollback es igual de total. Único cambio observable, de código de error, documentado |
| FK83-G06 | `UPDATE empresas` de columnas no clave en paralelo a una emisión | Concurrencia | FOR NO KEY UPDATE contra FOR KEY SHARE de la FK: compatibles. Sin espera nueva |
| FK83-G07 | Permisos | `has_table_privilege('nexit_runtime', …)` | Ambas tablas siguen sin privilegios para la aplicación. NEX-083 no hace GRANT/REVOKE, y `nex_aplicar_grants_runtime()` del runner no las expone |

## H. CI automático del push

| ID | Esperado |
|---|---|
| FK83-H01 | `nexit-app-ci` (push y pull_request) en verde, igual que en 0a2fb78: R02 no cambia código de aplicación |
| FK83-H02 | `nexit-banco-ci` aplica NEX-001…083. Se espera que T01 deje de fallar en la línea 45. El resultado real se informa tal cual: no se interpreta como homologación ni como autorización para la VM |

## Restricciones de instalación en la VM (para el responsable)

- Solo con autorización expresa, backup verificado y en una ventana sin emisión FE/NCE, movimientos, entradas de compra ni alta o edición de empresas.
- Secuencia:
  1. NEX-082 ya aplicada.
  2. `preflight-NEX-083.sql`, con todas las filas en `ok`.
  3. Runner oficial.
  4. `verificar-NEX-083.sql`.
- Ejecutar con el rol propietario del esquema.
- Si cualquier gate aborta, no corregir datos a mano. Informar la salida para el análisis.
