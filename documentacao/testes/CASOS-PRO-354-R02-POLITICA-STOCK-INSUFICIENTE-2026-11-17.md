# PRO-354-R02 — Casos de aceptación y regresión (ESCRITOS, NO EJECUTADOS)

> **Estado:** casos escritos por Claude el 17/11/2026, sin ejecutar. La orden prohíbe ejecutar tests, runner, lint, typecheck, build, SQL, migraciones, VM, Docker, gateway, deploy y merge. NEX-081 está versionada y **no aplicada**. Nada de esto es una homologación.

- **Casos automatizables:** `lib/facturacion/politica-stock-pro354.casos.ts`, del PRO354-01 al PRO354-78. Están registrados en `scripts/casos-clientes/run.js`.
- **Casos anteriores ajustados al nuevo código, sin cambiar lo que verifican:**
  - `stock-e02.casos.ts` E02-36: la previa pasa por `planificarStockConPolitica`, que con TRUE devuelve el mismo plan y el mismo mensaje.
  - `stock-preventivo.casos.ts` PRO330-54 y PRO330-62.
- **Empresas, productos y depósitos:** son sintéticos. Ningún caso depende de CASA MINGO.

## 1. Matriz de la orden R02 → casos

| Requisito de la orden | Casos |
|---|---|
| TRUE por omisión, comportamiento actual exacto (UI, API, SQL y numeración) | 01, 02, 03, 04, 25, 26, 29, 34, 47, 67; E02-36; PRO330-54 |
| FALSE 10/15: salida 10, pendiente 5 | 05, 06, 27, 33 |
| Cero disponible: todo pendiente, ningún movimiento | 07, 08 |
| Suficiente con FALSE: salida normal | 09, 25 |
| Parcial exacto y 0.0001 (4 decimales, sin float) | 06, 10, 41 |
| Líneas repetidas por UUID, servicios excluidos | 11, 12 |
| Límites 999/500 | 32; los 999 de `fe_documento_crear_fe_stock_pendiente` en 55 (fuente) |
| Depósitos: varios con elección, preselección de uno, ninguno, elección ajena, ACL y tenant | 13, 14, 15, 16, 17, 28, 30, 55 |
| Lotes evidenciados (`stock_lotes`) bloqueados | 18, 31, 38, 55, 58 |
| Flag falsificado o política del navegador | 53 (la base relee bajo FOR SHARE), 66 (`false` fijo del servidor), 71 (cuerpo solo `{bloquear}` con CONFIGURAR) |
| Cambio de política o de plan entre previa y emisión | 21, 22, 23, 53, 66 |
| Concurrencia y faltante real | 53, 56, 57, 58 |
| Atomicidad y rollback | 51, 52, 54 (todo dentro de una función/transacción; la preparación vale por `txid_current`) |
| Consulta o reintento sin duplicidad | 57, 66 (FE existente: no se replanifica ni se escriben pendientes) |
| Listado «Bajas pendientes de stock» | 40, 61, 74, 75 |
| Confirmación manual tras reposición (entrada 8, pendiente 5, saldo final 3) | 43, 58, 59 |
| Confirmación bloqueada sin saldo, sin llegar a negativo | 42, 59, 60 |
| FE rechazada, indeterminada o no transmitida bloqueada | 44, 58 |
| TRUE tras pendientes: siguen visibles y confirmables solo con disponible | 61 (el listado no depende de la política), 65 (la reversión rehúsa) |
| Reportes sin doble conteo | Ver sección 2: la salida inmediata y la confirmación son movimientos ordinarios únicos y el pendiente no es movimiento. **Verificación con datos: pendiente del responsable.** |
| Regresión fiscal (PRO-342, CDC, KuDE, gateway, Documentos, NCE) y compras ordinarias | 64, 77 |
| Preflight, verificación, reversión y grants | 63, 65 |
| No hardcodear la empresa piloto | 76 |
| Casos de la matriz R01 sujetos al gate | 78 (lista `CASOS_PENDIENTES_POR_GATE`) |

## 2. Casos manuales para el responsable (base descartable, con NEX-081 aplicada)

Estos casos solo se pueden comprobar con PostgreSQL real y la aplicación. Ejecutarlos requiere autorización expresa.

1. **TRUE por omisión.** Tras aplicar NEX-081, `verificar-NEX-081.sql` da todo `ok = true`. Una FE con 15 pedidos y 10 disponibles se rechaza con el mismo mensaje de hoy y no consume número.
2. **FALSE 10/15.**
   - Con el interruptor desactivado se emite la FE.
   - Hay una SALIDA/VENTA de 10 con clave `FE-STOCK:<doc>:<dep>` y una fila PENDIENTE de 5 en `documento_electronico_stock_pendientes`.
   - `stock_saldos` queda en 0 (nunca negativo). La vista muestra registrado 0 y proyectado −5.
3. **Cero disponible:** la FE se emite sin ningún movimiento y queda un pendiente igual a lo facturado.
4. **Varios depósitos:** sin elegir, «Revisar y confirmar» queda deshabilitado. Al elegir, la previa muestra el depósito. Si se cambia el depósito después de revisar, se exige revisar de nuevo.
5. **Concurrencia:**
   - Dos emisiones simultáneas del mismo producto con FALSE: la segunda espera el bloqueo del saldo y recalcula, o falla con «revise la factura de nuevo». Ningún saldo queda negativo.
   - Si alguien cambia la política a TRUE durante la revisión, la emisión responde 409 (NEX:STOCK_POLITICA_CAMBIO) sin numerar.
6. **Reintento:** repetir el envío con la misma clave devuelve la misma FE, sin otro movimiento ni otro pendiente.
7. **Confirmación:** con una entrada de 8 y un pendiente de 5, «Confirmar baja» crea una SALIDA/VENTA de 5 (clave `FE-STOCK-PEND:<id>`) y el saldo queda en 3. Repetir la confirmación devuelve el mismo movimiento.
8. **Confirmación bloqueada:**
   - Con saldo 4 y pendiente 5: 409 sin cambios.
   - Con FE `RECHAZADO`, `CANCELADO`, `INUTILIZADO`, `NO_RECONOCIDO`, `ENVIO_INDETERMINADO`, `PENDIENTE_ENVIO` o `ERROR_ENVIO`: 409 sin cambios.
9. **Política TRUE con pendientes:** los pendientes siguen visibles y confirmables solo con disponible. La reversión de NEX-081 se rehúsa.
10. **Anulación protegida:** el movimiento de la confirmación no se puede anular manualmente (NEX:MOVIMIENTO_VINCULADO_FE).
11. **Reportes:** Kardex y Movimientos muestran las dos salidas (inmediata y confirmación) una sola vez cada una. El pendiente no aparece como movimiento.
12. **Grants:** `nexit_runtime` no lee las tablas nuevas y solo ejecuta las 6 funciones (R01: más el catálogo de filtros).

## 3. PENDIENTES POR GATE (no simulados ni aprobados)

- **R01-RF07:** saldo físico negativo real. `stock_saldos_cant_chk >= 0` no se modificó.
- **R01-D1:** costo del faltante al emitir.
- **R01-D2:** valor negativo o deuda valorizada en `inventario_costos`.
- **R01-D3:** regularización automática con compras o entradas.
- **Reportes de valorización y Kardex** con el pendiente valorizado.
- **R01-D6:** política final de confirmación por estado fiscal. R02 usa la condición conservadora de la orden.
- **PRO-310:** reserva al envío y salida al aprobar. Es incompatible con la baja al emitir y **bloquea el GO de producción** hasta reconciliarla por separado.

## 4. Correctivo PRO-354-R02-R01 (auditoría AUD-CHATGPT-PRO-354-R02, hallazgos F001–F003)

Casos automatizables nuevos: `PRO354-R01-01` a `PRO354-R01-48` (sección L del mismo archivo). Se actualizaron al contrato R01, sin cambiar lo que verifican: PRO354-40 (filtros con sucursal y página), PRO354-55 (producto y depósito bloqueados antes de validar), PRO354-59 (el saldo lo decide el motor) y PRO354-63 (6 funciones). Todos escritos, **ninguno ejecutado**.

### F001 — Integridad de la baja pendiente

| Escenario | Resultado esperado | Casos |
|---|---|---|
| FE sin stock con faltante 5 UNI; con stock en cero se intenta cambiar la unidad base a CAJA | El cambio se rechaza (409, NEX:PRODUCTO_CON_BAJAS_PENDIENTES) mientras la baja esté PENDIENTE, por cualquier camino de UPDATE. Una baja confirmada no lo impide. | R01-02, R01-16 |
| Producto con baja pendiente: dejar de controlar stock o inactivarlo | Rechazado (409). | R01-03 |
| Depósito vinculado a una baja (abierta o confirmada) movido a otra sucursal | Rechazado (409, NEX:DEPOSITO_CON_BAJAS_PENDIENTES). La historia queda en la sucursal de la FE. | R01-04, R01-16 |
| Depósito con baja abierta: inactivarlo o marcarlo de terceros | Rechazado (409). Sin bajas abiertas se permite como antes (NEX-046). | R01-04 |
| Registro concurrente con un cambio de unidad o de depósito | El registro bloquea producto y depósito (FOR SHARE) antes de validar: el cambio espera o ya se ve. | R01-05 |
| Registro concurrente con una entrada de stock, aunque no exista fila de saldo | El faltante real se comprueba después del candado de numeración de movimientos: la entrada terminó antes (y se ve, NEX:STOCK_PENDIENTE_CON_DISPONIBLE) o espera. | R01-06 |
| Confirmación tras cambios de sucursal o unidad (defensa adicional a las guardas) | 409 NEX:PENDIENTE_SUCURSAL_DISTINTA o NEX:PENDIENTE_UNIDAD_DISTINTA; nunca se convierte la cantidad. | R01-10, R01-17 |
| Confirmación con depósito inactivo/terceros, producto inactivo/sin control o con lotes | 409, sin movimiento. | R01-10, R01-17 |
| Confirmación con stock insuficiente en el momento del bloqueo | El motor rechaza bajo su propio bloqueo; 409 NEX:STOCK_INSUFICIENTE; subtransacción deshecha, nada escrito, jamás saldo negativo. | R01-11, PRO354-59 |
| Dos confirmaciones simultáneas de la misma baja | Una crea el movimiento; la otra devuelve el mismo movimiento como repetido. | R01-12 |
| Confirmación frente a movimientos ordinarios simultáneos | Sin bloquear costo ni saldo antes del motor; orden compatible con NEX-014. | R01-08, R01-09 |
| Permisos | Confirmar exige MOVIMIENTOS.CREAR y alcance del depósito; listar exige STOCK.VER y la sucursal en el alcance. | PRO354-58, R01-21 |
| Motor, numeración, depósitos y cambio de unidad | No se redefinen; sin conversiones ni saldo negativo. | R01-14 |
| Scripts | Preflight, verificación y reversión cubren columnas, guardas, catálogo y la nueva firma del listado. | R01-15 |

### F002 — Listado

| Escenario | Resultado esperado | Casos |
|---|---|---|
| Dos FE AA y AB con el mismo número | Se muestran como `001-001-0000010 (AA)` y `(AB)`; la búsqueda acepta la serie; la referencia del movimiento complementario incluye la serie. | R01-13, R01-22, R01-27 |
| Más de una página | Paginación estable (25/50/100), total real, «Mostrando a–b de N», Anterior/Siguiente. Sin límite fijo de 500. | R01-20, R01-26, R01-30, R01-32 |
| Filtro de sucursal | Solo sucursales del alcance (42501 si no); filtra por la sucursal congelada de la baja. | R01-21, R01-25 |
| Opciones de filtro | Catálogo propio de sucursales y depósitos autorizados, que no desaparece al filtrar ni depende de la página. | R01-24, R01-28, R01-31, R01-32 |
| Baja confirmada | Faltante original conservado, pendiente actual 0, descontado total = emisión + confirmación. | R01-23, R01-27, R01-29 |
| Saldo proyectado | Por producto y depósito; se repite en cada fila del par y nunca se suma. | R01-32 |

### F003 — Respuestas tardías

| Escenario | Resultado esperado | Casos |
|---|---|---|
| Cambio de filtro mientras hay una lectura en vuelo | La consulta anterior queda inválida al instante; sus filas no se muestran ni se accionan. | R01-41, R01-42, R01-45, R01-46 |
| Respuesta del filtro anterior llega después de la actual | Se descarta. | R01-42 |
| Error de una lectura de contexto viejo | No se muestra. | R01-47 |
| Confirmar y cambiar el filtro durante el POST | Al terminar se relee con los filtros vigentes; la lectura anterior no gana. | R01-43, R01-47 |
| Re-render con la misma consulta | No invalida nada. | R01-40, R01-44 |
| Cambio de filtro | Vuelve a la página 1; un depósito de otra sucursal se limpia. Se conservan la confirmación explícita y el resultado idempotente. | R01-48 |

## 5. Correctivo PRO-354-R02-R02 (auditoría AUD-CHATGPT-PRO-354-R02-R01, hallazgos F001-R–F003-R)

Casos escritos en `lib/facturacion/politica-stock-pro354.casos.ts`, sección M (`PRO354-R02-01..26`). **No ejecutados** (orden del responsable). Ningún SQL ni migration aplicado.

### F001-R — Unidad base revisada y lotes

| Escenario | Esperado | Caso |
|---|---|---|
| El plan con faltante lleva la unidad base (UUID) de la línea y la envía a la base | `unidadId` = `unidad_medida_id` = U1 | R02-01 |
| Cambio de unidad base entre la previa y la emisión (misma cantidad y depósito) | La huella cambia; la emisión responde 409 «revisar de nuevo» | R02-02 |
| Líneas repetidas del mismo UUID | Un pendiente con la unidad del producto | R02-03 |
| Producto sin unidad base conocida | Viaja `null`; la base rechaza (falla cerrada) | R02-04, R02-07 |
| Sin cambio | Misma huella | R02-05 |
| Override SIFEN legítimo en la línea | No altera la unidad base revisada (`p.unidad_medida_id`) | R02-06 |
| Cambio entre la preparación y la base | Unidad vigente leída bajo FOR SHARE ≠ revisada → `NEX:STOCK_PENDIENTE_UNIDAD_CAMBIO` (409) **antes** de reservar numeración | R02-08, R02-12 |
| Misma equivalencia SIFEN con otro UUID | Es un cambio (comparación por UUID, sin conversión) | R02-09 |
| La unidad guardada en el pendiente | La revisada (igual a la vigente bajo bloqueo) | R02-10 |
| Reintento idempotente con otra unidad | `NEX:IDEMPOTENCIA_CONFLICTO`, sin escribir | R02-11 |
| Lote creado por una entrada concurrente | Se re-comprueba `stock_lotes` tras el candado `movimientos.numero:` y antes de insertar | R02-13 |

### F002-R — Historial con depósito inactivo

| Escenario | Esperado | Caso |
|---|---|---|
| Baja confirmada, depósito inactivado después, alcance autorizado | Sigue visible en el listado y en el filtro (rotulado «(inactivo)») | R02-14, R02-15, R02-17 |
| Alcance del depósito revocado | No se ve | R02-16 |
| Otra empresa | No se ve | R02-16 |
| Confirmar en depósito inactivo | Rechazado (alcance operativo + depósito activo, MOVIMIENTOS.CREAR) | R02-18 |
| Guardas de inactivación | Sin cambios | R02-19 |
| Scripts NEX-081 | Preflight, verificación, reversión y procedimiento actualizados | R02-20 |

### F003-R — Resultado de la confirmación vs. error de carga

| Escenario | Esperado | Caso |
|---|---|---|
| POST 409 y luego GET 200 | El motivo del rechazo se conserva (identificado por factura); la lectura solo limpia el error de carga | R02-21, R02-22, R02-23 |
| Cambio de filtros durante el POST (éxito o error) | El resultado se muestra igual, con su factura; cambiar filtros no lo borra | R02-24 |
| A→B→A con respuesta tardía | La lectura vieja se descarta (generación y clave) | R02-25 |
| Acciones mientras carga o confirma | Bloqueadas; iniciar otra confirmación reemplaza el resultado; «Cerrar» lo descarta | R02-26 |

## 6. Correctivo PRO-354-R02-R03 (auditoría AUD-CHATGPT-PRO-354-R02-R02, hallazgo V001 del verificador)

Solo cambian `scripts/verificar-NEX-081.sql` y estos casos. La migration NEX-081 y el código funcional quedan como en R02-R02. Casos en la sección N de `lib/facturacion/politica-stock-pro354.casos.ts` (`PRO354-R02-R03-01..13`), **no ejecutados**; el script tampoco se ejecutó.

El verificador ya no busca posiciones sobre `pg_get_functiondef` (que conserva comentarios). Igual que `verificar-NEX-080.sql`, limpia `prosrc`: primero comentarios (código ejecutable, con literales) y luego literales (código sin textos, para llamadas y orden).

| Escenario | Esperado | Caso |
|---|---|---|
| Código real de NEX-081: comentario que nombra `fe_documento_crear_fe_receptor` antes del marcador | El falso negativo existía; con el limpiado, unidad y lotes dan true | R02-R03-01, 02 |
| Muestra: comentario antes del marcador, orden correcto | true / true | R02-R03-03 |
| Muestra: comparación de unidad después de reservar numeración | false | R02-R03-04 |
| Muestra: comparación de unidad solo en un literal | false | R02-R03-05 |
| Muestra: segunda comprobación de lotes solo comentada | false | R02-R03-06 |
| Muestra: segunda comprobación de lotes antes del candado | false | R02-R03-07 |
| Sin posiciones sobre `pg_get_functiondef` ni conteo de textos | Limpiado de `prosrc` como NEX-080 | R02-R03-08 |
| Filas de unidad/lotes y detectores | Predicados de orden sobre `crear`; detectores deben dar true | R02-R03-09 |
| Controles similares del mismo script | Confirmación, candado, alcance histórico y baja sobre código ejecutable | R02-R03-10 |
| Ningún control quitado ni forzado | Se conservan todos los demás controles | R02-R03-11 |
| Solo lectura | `BEGIN READ ONLY … ROLLBACK`, sin escrituras ejecutables | R02-R03-12 |
| Migration sin cambios | El orden aprobado en R02-R02 se conserva | R02-R03-13 |
