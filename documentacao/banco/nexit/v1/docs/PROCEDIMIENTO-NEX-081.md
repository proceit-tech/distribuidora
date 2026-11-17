# PROCEDIMIENTO NEX-081 — Política de stock insuficiente por empresa y bajas pendientes (PRO-354-R02)

> **Estado:** migración VERSIONADA, **NO APLICADA**. Claude no ejecutó nada de este procedimiento (la orden PRO-354-R02 prohíbe SQL, migraciones, VM, Docker, gateway y deploy). Ejecutarlo requiere autorización expresa del responsable.

## Qué hace

| Cambio | Detalle |
|---|---|
| `empresas.bloquear_stock_insuficiente` | `boolean NOT NULL DEFAULT true`. Al aplicar la migración, **todas** las empresas quedan en TRUE, que es el comportamiento actual. Solo cambia con `fe_politica_stock_actualizar`, que exige el permiso `FACTURACION_ELECTRONICA.CONFIGURAR` y registra el evento `FE_POLITICA_STOCK_ACTUALIZADA` en `eventos_seguridad`. |
| `documento_electronico_stock_pendientes` | Tabla nueva, con PK propia. Guarda una fila por FE y producto con faltante: facturado, descontado, pendiente, depósito y estado PENDIENTE o CONFIRMADA. Es inmutable salvo esa única transición. La aplicación no tiene acceso directo. |
| `fe_stock_pendientes_preparacion` | Tabla interna, de una sola transacción. La aplicación no tiene acceso. |
| `fe_stock_baja_documento` | Se redefine con el cuerpo de NEX-067 y tres cambios: lee la preparación, concilia salidas + pendientes = facturado, y una FE con pendientes cuenta como baja ya registrada. **Sin preparación da el mismo resultado que NEX-067.** |
| Funciones nuevas | `fe_politica_stock_actualizar`, `fe_stock_politica_contexto`, `fe_documento_crear_fe_stock_pendiente`, `fe_stock_pendientes_listar` y `fe_stock_pendiente_confirmar`. |
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

## Coexistencia

| Combinación | Resultado |
|---|---|
| App anterior + NEX-081 | Sin cambios: la app llama a la emisión de siempre, la baja sin preparación es idéntica a NEX-067 y todas las empresas están en TRUE. |
| App R02 sin NEX-081 | La política se lee como TRUE (bloquea: comportamiento actual) y nunca se ofrece faltante. El interruptor y la vista «Bajas pendientes de stock» responden 503 («requiere NEX-081»). |
| App R02 + NEX-081, empresa en TRUE | Idéntico al comportamiento actual. |
| App R02 + NEX-081, empresa en FALSE | La FE se emite con faltante pendiente: salida del disponible y pendiente del resto. La confirmación es manual y solo con saldo real suficiente. |

## Reversión (`scripts/reversion-NEX-081.sql`)

- Es **protegida**: se detiene si existe cualquier baja pendiente (abierta o confirmada) o si alguna empresa está en FALSE.
- Restaura literalmente el cuerpo de `fe_stock_baja_documento` de NEX-067 y elimina funciones, triggers, tablas y la columna.
- Antes de ejecutarla, desplegar la versión anterior de la app. Después, borrar la fila `NEX-081` de `schema_migrations`.
