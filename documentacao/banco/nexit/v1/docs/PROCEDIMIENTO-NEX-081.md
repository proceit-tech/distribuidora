# PROCEDIMIENTO NEX-081 — Política de stock insuficiente por empresa y bajas pendientes (PRO-354-R02, corrección R01)

> **Estado:** migración VERSIONADA, **NO APLICADA**. Claude no ejecutó nada de este procedimiento (la orden PRO-354-R02 prohíbe SQL, migraciones, VM, Docker, gateway y deploy). Ejecutarlo requiere autorización expresa del responsable.

## Qué hace

| Cambio | Detalle |
|---|---|
| `empresas.bloquear_stock_insuficiente` | `boolean NOT NULL DEFAULT true`. Al aplicar la migración, **todas** las empresas quedan en TRUE, que es el comportamiento actual. Solo cambia con `fe_politica_stock_actualizar`, que exige el permiso `FACTURACION_ELECTRONICA.CONFIGURAR` y registra el evento `FE_POLITICA_STOCK_ACTUALIZADA` en `eventos_seguridad`. |
| `documento_electronico_stock_pendientes` | Tabla nueva, con PK propia. Guarda una fila por FE y producto con faltante: facturado, descontado, pendiente, depósito y estado PENDIENTE o CONFIRMADA. Es inmutable salvo esa única transición. La aplicación no tiene acceso directo. |
| `fe_stock_pendientes_preparacion` | Tabla interna, de una sola transacción. La aplicación no tiene acceso. |
| `fe_stock_baja_documento` | Se redefine con el cuerpo de NEX-067 y tres cambios: lee la preparación, concilia salidas + pendientes = facturado, y una FE con pendientes cuenta como baja ya registrada. **Sin preparación da el mismo resultado que NEX-067.** |
| Funciones nuevas | `fe_politica_stock_actualizar`, `fe_stock_politica_contexto`, `fe_documento_crear_fe_stock_pendiente`, `fe_stock_pendientes_listar` (paginado, filtro de sucursal), `fe_stock_pendientes_filtros` (catálogo de filtros) y `fe_stock_pendiente_confirmar`. |
| Guardas de integridad (R01) | Triggers en `productos` y `depositos`. Mientras haya una baja PENDIENTE: el producto no cambia de unidad base, no deja de controlar stock y no se inactiva; el depósito no se inactiva ni pasa a ser de terceros. Con cualquier baja vinculada (también confirmada), el depósito no cambia de sucursal. La baja guarda la unidad base y la sucursal con las que nació. |
| Sin cambios | `stock_saldos_cant_chk` (cantidad >= 0), `inventario_costos`, el método de costo promedio, la PK de `documento_electronico_stock_salidas`, `fe_documento_crear_fe_receptor` (NEX-076), el momento de la baja (PRO-310), las FE históricas, NCE, CDC, KuDE, el gateway y la numeración. |

## Dependencias reales

- **Funcionales:**
  - NEX-014: motor de movimientos.
  - NEX-067: baja de la FE, que la migración exige en su versión original.
  - NEX-076: emisión vigente.
  - El envoltorio de grants NEX-037/NEX-052.
- **NEX-080 (PRO-342):** NEX-081 **no la necesita ni la modifica**. Pero el runner aplica las migraciones pendientes **en orden**: si NEX-080 sigue sin aplicar, el runner normal la aplicaría antes de NEX-081.
  - **Gate:** no correr el runner para NEX-081 mientras NEX-080 no tenga su propia autorización.
  - Si se aplica NEX-081 sola, hacerlo con `psql -1 -f` sobre ese archivo, y registrar `NEX-081` en `schema_migrations` igual que en las migraciones anteriores.
- **PRO-310:** no se cambia el momento de la baja. El contrato pendiente de PRO-310 (reserva al enviar, salida al aprobar) sigue siendo incompatible con la baja al emitir y **bloquea el GO de producción** hasta que se reconcilie por separado.

## Orden obligatorio

1. **Backup** completo (pg_dump) y registro del SHA de la aplicación que corre en la VM.
2. **Preflight:** `scripts/preflight-NEX-081.sql`. Es de solo lectura. Cualquier fila con `ok = false` significa NO APLICAR.
3. **Aplicar** `migraciones/NEX-081-facturacion-politica-stock-pendientes.sql` en una transacción, en una ventana sin emisiones en curso. Ver el gate de NEX-080 más arriba.
4. **Verificar:** `scripts/verificar-NEX-081.sql`. Todas las filas deben dar `ok = true`.
5. **Desplegar** la aplicación PRO-354-R02.

## Bloqueos y concurrencia (R01)

- **Registro del faltante:** fila de la empresa (FOR SHARE), producto y depósito de cada pendiente (FOR SHARE) → emisión vigente (FE, numeración fiscal, baja del disponible) → candado de numeración de movimientos de la empresa (`movimientos.numero:`, NEX-011) → comprobación de que no queda disponible. Toda entrada de stock toma ese mismo candado antes de tocar costos y saldos, así que una entrada simultánea terminó antes (y se ve) o espera, aunque todavía no exista fila de saldo.
- **Confirmación:** candado propio de la baja → fila de la baja (FOR UPDATE) → FE (FOR SHARE) → depósito y producto (FOR SHARE) → motor ordinario (`inventario_registrar_movimiento`: clave, numeración, costo, saldo). Ya **no** se bloquean costo ni saldo antes del motor, para no invertir su orden.
- Los FOR SHARE no se bloquean entre sí; solo esperan a las funciones de administración (cambio de unidad base, edición o cambio de estado del depósito), que toman una sola fila y no esperan nada más. Si aun así PostgreSQL detectara un interbloqueo, aborta una de las transacciones completas, sin efectos parciales.
- Las lecturas suponen el aislamiento por defecto (READ COMMITTED), que es el de la aplicación.

### Corrección R02-R02

- **Unidad base revisada:** cada pendiente que envía la aplicación lleva `unidad_medida_id` (UUID de la unidad base con la que preparó la factura; no el código SIFEN). El registro la compara con la vigente bajo el FOR SHARE del producto **antes** de reservar numeración fiscal (`NEX:STOCK_PENDIENTE_UNIDAD_CAMBIO`, 409) y la guarda tal cual. Un reintento idempotente compara también la unidad. La aplicación y NEX-081 deben ser de la misma revisión: un pendiente sin unidad se rechaza (falla cerrada).
- **Lotes:** la evidencia de `stock_lotes` se vuelve a comprobar después del candado `movimientos.numero:` y antes de insertar cada pendiente.
- **Historial:** listado y filtros usan `deposito_en_alcance` (NEX-046, alcance histórico, depósitos activos o no): una baja confirmada sigue visible tras inactivar su depósito. La confirmación sigue exigiendo depósito activo y en el alcance operativo (`usuario_puede_deposito`). La reversión no cambia (mismas firmas; `deposito_en_alcance` pertenece a NEX-046).

## Coexistencia

| Combinación | Resultado |
|---|---|
| App anterior + NEX-081 | Sin cambios: la app llama a la emisión de siempre, la baja sin preparación es idéntica a NEX-067 y todas las empresas están en TRUE. |
| App R02 sin NEX-081 | La política se lee como TRUE (bloquea: comportamiento actual) y nunca se ofrece faltante. El interruptor y la vista «Bajas pendientes de stock» responden 503 («requiere NEX-081»). |
| App R02 + NEX-081, empresa en TRUE | Idéntico al comportamiento actual. |
| App R02 + NEX-081, empresa en FALSE | La FE se emite con faltante pendiente: salida del disponible y pendiente del resto. La confirmación es manual y solo con saldo real suficiente. |

## Reversión (`scripts/reversion-NEX-081.sql`)

- Es **protegida**: se detiene si existe cualquier baja pendiente (abierta o confirmada) o si alguna empresa está en FALSE.
- Restaura literalmente el cuerpo de `fe_stock_baja_documento` de NEX-067 y elimina funciones, triggers (incluidas las guardas de `productos` y `depositos`), tablas y la columna.
- Antes de ejecutarla, desplegar la versión anterior de la app. Después, borrar la fila `NEX-081` de `schema_migrations`.
