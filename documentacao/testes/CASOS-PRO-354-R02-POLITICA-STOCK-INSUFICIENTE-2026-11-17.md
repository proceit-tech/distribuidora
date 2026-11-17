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
12. **Grants:** `nexit_runtime` no lee las tablas nuevas y solo ejecuta las 5 funciones.

## 3. PENDIENTES POR GATE (no simulados ni aprobados)

- **R01-RF07:** saldo físico negativo real. `stock_saldos_cant_chk >= 0` no se modificó.
- **R01-D1:** costo del faltante al emitir.
- **R01-D2:** valor negativo o deuda valorizada en `inventario_costos`.
- **R01-D3:** regularización automática con compras o entradas.
- **Reportes de valorización y Kardex** con el pendiente valorizado.
- **R01-D6:** política final de confirmación por estado fiscal. R02 usa la condición conservadora de la orden.
- **PRO-310:** reserva al envío y salida al aprobar. Es incompatible con la baja al emitir y **bloquea el GO de producción** hasta reconciliarla por separado.
