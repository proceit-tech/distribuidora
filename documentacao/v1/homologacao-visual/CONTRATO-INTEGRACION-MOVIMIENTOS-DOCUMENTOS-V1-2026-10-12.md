# Contrato de integración Movimientos ↔ documentos comerciales y fiscales (Etapa C)

**2026-10-12 · Claude Code.** Auditoría del módulo Movimientos existente y contrato de integración. **Sin automatismos fiscales ni comerciales, sin migration, sin SQL real.** Implementado solo: funciones puras de decisión/validación (`lib/movimientos/documentos.ts`) y sus pruebas. No hay módulo de Facturación/Remisión/Nota de crédito en Nexit V1: nada depende de él.

## 1. Auditoría de lo existente (UI + API + funciones SQL)

| Aspecto | Hallazgo (código y migraciones leídos) | Dictamen |
|---|---|---|
| Escritura de saldos | `stock_saldos`, `inventario_costos`, movimientos y líneas se escriben **solo** con `inventario_registrar_movimiento` / `inventario_anular_movimiento` (SECURITY DEFINER; el rol de la app no escribe saldos). | Conforme |
| Atomicidad | Un movimiento + líneas + saldos + costos en una sola transacción de la función; con la misma `clave_idempotencia` y la MISMA solicitud devuelve el movimiento (huella `huella_solicitud`); con otra solicitud, conflicto (`NEX:IDEMPOTENCIA_CONFLICTO`). Índice único `(empresa_id, clave_idempotencia)`. | Conforme |
| Inmutabilidad y estornos | `movimientos_inventario` rechaza DELETE (trigger); anular crea un movimiento inverso ligado por `anula_a_id` (único por original) y marca el original `ANULADO` (única mutación). Una anulación no se anula; anular exige motivo ≥ 5; una entrada ya consumida no se puede anular. | Conforme (cumple «estorno no elimina el original») |
| Alcance de depósitos | `usuario_puede_deposito` dentro de las funciones; la pantalla de movimientos lista los depósitos con su `permitido`. | Conforme |
| Costos | La entrada/ajuste positivo exige costo explícito («el costo no se inventa»); la salida usa el costo promedio vigente. | Conforme |
| Lotes / unidad identificada | Lote obligatorio para productos por lote; productos `UNIDAD_ETIQUETADA` **no** se pueden mover aún (mensaje explícito, falta soporte en el banco). | Limitación documentada |
| Unidades/conversión | La pantalla mueve en unidad base; no existe conversión por documento. | Limitación: el contrato exige cantidad en unidad base y no estima factores |
| Vínculo con documentos | Solo `documento_referencia` **texto libre** (≤ 120) y `tipo_origen` (`COMPRA`, `VENTA`, `DEVOLUCION`…). No hay vínculo relacional (documento, línea, evento físico). | **Brecha**: no impide que una factura y una remisión del mismo despacho generen dos salidas |
| Saldo negativo | `stock_saldos.cantidad >= 0` (CHECK): ninguna operación deja saldo negativo. | Conforme (política de saldo negativo explícita pendiente si se quisiera permitirlo) |
| Propiedad | Los movimientos desde la UI son `PROPIO`; el stock de terceros existe en saldos pero no se opera por documentos. | Limitación |

## 2. Matriz documento × hecho físico × efecto

| Documento | Hecho físico que lo origina | Efecto | Depósitos | Referencia única |
|---|---|---|---|---|
| Factura de venta | Salida de mercadería **solo si** el momento de baja configurado es «factura» y el despacho no tuvo salida antes | `SALIDA` | origen | evento físico + línea + `SALIDA` |
| Nota de remisión – entrega de venta | Entrega/despacho confirmado | `SALIDA` | origen | idem |
| Nota de remisión – traslado entre depósitos | Despacho confirmado | `TRANSFERENCIA` (origen ≠ destino; en tránsito si se modela) | origen y destino | idem |
| Nota de remisión – otra finalidad | — | **Sin efecto: requiere decisión** | — | — |
| Nota de crédito – devolución física | Retorno **confirmado** (producto, cantidad, condición, depósito, propiedad) | `ENTRADA` | destino | idem + `ENTRADA` |
| Nota de crédito – financiera / descuento / corrección | — | **Ninguno** | — | — |
| Recepción de compra | Mercadería recibida y confirmada | `ENTRADA` (con costo explícito) | destino | idem |
| Factura de compra | — | Ninguno (el documento no es el hecho físico) | — | — |
| Devolución al proveedor | Salida confirmada | `SALIDA` | origen | idem |
| Ajuste / pérdida / avería / cuarentena / reserva | Operación manual autorizada | `AJUSTE_*`, `CUARENTENA`, `RESERVA` con motivo | según tipo | clave manual |
| Estorno | Corrección de un movimiento | Movimiento inverso ligado (`inventario_anular_movimiento`) | — | `anula_a_id` |

**Regla de oro (objetivo del diseño):** para un mismo evento físico y línea debe existir **un solo efecto**.

> **Estado real (AUD-DOC-01): la prevención de baja duplicada por factura + remisión NO existe todavía como garantía persistida.** No hay en el banco ningún vínculo entre documentos, líneas y eventos físicos (solo `documento_referencia` de texto libre), ni hay módulo de documentos conectado a Movimientos. `decidirEfecto` es una función pura que **no está conectada** a la API ni al SQL de movimientos: recibe `efectosPrevios` que debe aportar el llamador (sin verificación en el banco) y solo propone la clave `fis:<evento>:<línea>:<efecto>`. La idempotencia de `inventario_registrar_movimiento` protege únicamente los reintentos de una **misma** solicitud con la misma clave; no relaciona una factura con una remisión. La unicidad «un evento físico = un efecto» solo estará garantizada cuando exista (1) el vínculo persistido de §3 con su `UNIQUE` y (2) la integración transaccional que lo registre junto con el movimiento. Hasta entonces no debe afirmarse que el sistema impide la doble baja.

## 3. Proyecto de vínculo fuerte (NO migrado)

Para cerrar la brecha de §1 sin depender de texto libre, se propone (cuando exista el módulo de documentos y se apruebe el modelo) una tabla de vínculos **sin editar migraciones aplicadas**:

`movimiento_documento_vinculos(id, empresa_id, movimiento_id, movimiento_linea_id, documento_tipo, documento_id, documento_linea_id, evento_fisico_id, efecto, creado_por, creado_at)` con:
- FK compuestas `(empresa_id, movimiento_id)` y `(empresa_id, movimiento_linea_id)`; solo altas;
- `UNIQUE (empresa_id, evento_fisico_id, documento_linea_id|línea física, efecto)` → un efecto por hecho físico, garantizado por el banco;
- índice por `(empresa_id, documento_tipo, documento_id)` para trazabilidad.

No se creó la migration porque (a) los documentos no existen aún en Nexit y (b) el modelo de eventos físicos no está confirmado. La clave de idempotencia determinista es solo un paso preparatorio (protege reintentos de la misma solicitud), **no** sustituye al vínculo persistido. Se numeraría tras NEX-045.

## 4. Contrato de la función de decisión (`lib/movimientos/documentos.ts`)

Entrada: tipo de documento, `documentoId`, `eventoFisicoId`, línea (cantidad **en unidad base** o `null` si no se conoce el factor — nunca se estima —, depósitos, propiedad, lote), finalidad de la remisión, tipo de nota de crédito, confirmaciones (`hechoFisicoConfirmado`, `retornoFisicoConfirmado`), `momentoBajaVenta` y los efectos ya registrados. Salida: `efecto` (`NINGUNO`/`SALIDA`/`ENTRADA`/`TRANSFERENCIA`), motivo, `bloqueos[]` y `claveIdempotencia`. Es una función pura: no registra nada y hoy no tiene ningún llamador. Cualquier caller futuro debe: (1) decidir, (2) validar permisos y alcance de depósitos de la sesión, (3) invocar `inventario_registrar_movimiento` con la clave, (4) conservar el vínculo.

## 5. Decisiones pendientes (no inventadas)

1. **Momento de baja por venta:** factura, remisión o entrega confirmada (`momentoBajaVenta`). Sin valor, la factura queda bloqueada.
2. Finalidades de remisión distintas de entrega y traslado (consignación, muestra, reparación…).
3. Estado de «tránsito» en traslados y quién confirma la recepción en destino.
4. Costo de las entradas por devolución de clientes (costo original vs. promedio vigente) y su efecto en el costo medio.
5. Política de saldo negativo (hoy prohibido por CHECK) y manejo de unidades identificadas (serie/etiqueta).
6. Conversión de unidades por documento (factor aprobado por producto/presentación).
7. Visibilidad y operación de saldos de terceros por documentos.
8. Modelo de documentos (Facturación, Remisión, Nota de crédito, Compras) y de eventos físicos (entrega/recepción).
