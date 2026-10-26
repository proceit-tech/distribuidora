# Procedimiento NEX-075 — Compras → Entradas (E6-A / PRO-325)

**Estado:** versionada y **NO aplicada**. Ningún agente de IA la aplica. La ejecuta **solo el responsable humano** en la VM, con backup previo, siguiendo `documentacao/infra/PROCEDIMENTO-ATUALIZACAO-AMBIENTE-NEXIT-VM.md` (runner oficial `aplicar-migraciones.sh`, con `--solo-listar` antes). Norma: `documentacao/definicoes/REQ-NEXIT-CM-E6-COMPRAS-ENTRADAS-2026-10-26.md`.

## Qué hace
- **`compras_entradas`**: una fila por entrada, ligada 1:1 (`movimiento_id` único, FK compuesta por empresa) al **único** movimiento `ENTRADA`/`COMPRA` que la registra. Guarda proveedor (id + snapshot código / razón social / documento), fecha operativa, referencia libre, clave y usuario. **No guarda cantidades ni costos**: las líneas y costos reales están en `movimiento_lineas` (motor NEX-014). Inmutable. Es la fuente **exclusiva** de E6-B; los movimientos `COMPRA` manuales anteriores no tienen fila aquí.
- **`compras_entradas_intenciones`**: protocolo durable equivalente a NEX-066 (RESERVADA → CONFIRMADA → reconocimiento, o RECHAZADA_DEFINITIVA comprobada; una pendiente por operador garantizada por índice único) con snapshot de varias líneas. NEX-066 no se modifica ni se comparte.
- **`compras_entrada_ejecutar`**: en **una sola transacción** bloquea la intención, valida proveedor (activo, no bloqueado), productos (activos, con control de stock; **unidad identificada bloqueada**), cantidades (> 0, hasta 4 decimales), costos (expresos ≥ 0; vacío ≠ 0), lotes, y llama a `inventario_registrar_movimiento` (clave de movimiento `COMPRA-ENT:<K1>`); inserta `compras_entradas` y confirma la intención. Si algo falla, **no queda nada** (ni movimiento, ni líneas, ni costos, ni metadatos).
- Permisos de catálogo **`COMPRAS.VER`** y **`COMPRAS.CREAR`** (operacionales). **No se asignan a ningún perfil**: hasta que el responsable los conceda en «Roles y permisos», solo el administrador de empresa opera. El motor sigue exigiendo `MOVIMIENTOS.CREAR` y alcance del depósito.

## Orden obligatorio
1. **Backup** de la base `nexit`.
2. **Pre-verificación (solo lectura):** `docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < documentacao/banco/nexit/v1/scripts/preflight-NEX-075.sql` — la sección 1 debe dar `ok = true`. La sección 4 informa las entradas `COMPRA` manuales existentes, que **no** serán entradas de Compras.
3. **Runner oficial**: `--solo-listar` y revisión de **todas** las pendientes (el runner las aplica en orden). Aplicar solo con autorización expresa.
4. **Verificación (solo lectura):** `... < documentacao/banco/nexit/v1/scripts/verificar-NEX-075.sql` — todas las filas `ok = true`.
5. **Primero la migración, después el código** (build + recreate de `app`). Sin la migración, Compras → Entradas responde **503 «No disponible»** (sin datos ficticios ni registro).

## Reversión segura
`scripts/reversion-NEX-075.sql` (una transacción): **se niega** si ya hay entradas registradas o intenciones pendientes / confirmadas sin reconocer. Si no hay: elimina funciones y tablas; los permisos `COMPRAS.*` se borran del catálogo solo si ningún perfil los tiene. Desplegar antes la versión anterior de la aplicación y después borrar la fila `NEX-075` de `schema_migrations`.

## Límites conocidos
- **Anulación**: no hay acción en Compras. Una entrada se anula solo por el mecanismo oficial de Movimientos (`inventario_anular_movimiento`, `MOVIMIENTOS.ANULAR`); la entrada queda histórica con estado «Anulada» (derivado del movimiento).
- `demo_vaciar_datos` (NEX-012) no se modifica: el vínculo usa `ON DELETE CASCADE` hacia el movimiento y el disparador permite el borrado solo durante el reinicio DEMO.
- No se ejecutó en PostgreSQL real: validación de bloqueos, grants y flujo completo corresponde a la homologación operacional del responsable.

## Homologación dirigida (la ejecuta el responsable)
| # | Caso | Esperado |
|---|---|---|
| C-01 | Tres productos de un proveedor y un depósito | UNA entrada, UN movimiento ENTRADA/COMPRA con 3 líneas; stock y costo promedio por ítem |
| C-02 | Error en la última línea (p. ej. lote con vencimiento distinto) | Rechazo; ningún movimiento, costo ni entrada |
| C-03 | Cortar la red tras confirmar / recargar / doble clic | Se recupera la misma entrada (mismo número); nunca dos incrementos |
| C-04 | Proveedor de otra empresa, depósito fuera del alcance, sin permiso | Prohibido en el servidor |
| C-05 | Costo 0 explícito vs vacío; cantidad 0, negativa o con 5 decimales; producto por serie | 0 aceptado; vacío y demás rechazados |
| C-06 | Anular el movimiento en Movimientos | Movimiento inverso; la entrada figura «Anulada» |
| C-07 | Entrada manual COMPRA anterior / recepciones DEMO | No aparecen en Compras → Entradas |
