# Procedimiento NEX-067 — Control y baja de stock al emitir la Factura (PRO-200 / E02)

**Estado:** versionada y **NO aplicada**. Ningún agente de IA la aplica. La ejecuta **solo el responsable humano** en la VM, con backup previo, siguiendo `documentacao/infra/PROCEDIMENTO-ATUALIZACAO-AMBIENTE-NEXIT-VM.md` (runner oficial `aplicar-migraciones.sh`, con `--solo-listar` antes). Requisito: `HANDOFF-CLAUDE-NEXIT-CASA-MINGO-2026-10-20.md` (E02) y `REQ-CASA-MINGO-DECISIONES-NCE-KUDE-2026-10-20.md` §5.A.

## Qué hace
- **Disponibilidad** (`fe_stock_disponibilidad`, solo lectura): stock `DISPONIBLE` y `PROPIO` de depósitos **activos, propios, de la sucursal que emite y dentro del alcance del usuario**. Reservado, cuarentena, tránsito, de terceros, inactivos y de otra sucursal no cuentan.
- **Reparto automático** (en la aplicación, determinista): depósitos por **código ascendente**; dentro del depósito, lotes por **vencimiento ascendente (FEFO)**, sin vencimiento al final. La previa de la factura **muestra** de qué depósito sale cada porción; si el stock no alcanza, la revisión se **bloquea**.
- **Baja al emitir, atómica** (`fe_documento_crear_fe_con_stock`): crea la FE (función existente `fe_documento_crear_fe`, sin cambios) y, **en la misma transacción**, revalida bajo bloqueo (`FOR UPDATE` de costo y saldo, mismo orden que el motor), concilia el reparto con el payload persistido (`dCodInt`/`dCantProSer`) y registra **un movimiento SALIDA/VENTA por depósito** con las líneas del motor de Inventario (costo promedio congelado, valorización). Si algo falla, **no se crea ni la FE ni la baja**.
- **Idempotencia:** clave `FE-STOCK:<documento>:<depósito>` (única) + PK `(empresa, documento, depósito)` en `documento_electronico_stock_salidas`; repetir la emisión, reintentar o hacer doble clic devuelve la FE existente **sin bajar otra vez**.
- **Reparto aprobado:** el envío lleva la huella del reparto revisado; si el stock cambió y el reparto ya no coincide, se exige **revisar de nuevo** (no se sustituye en silencio).
- La FE conserva **una línea fiscal por producto**; cantidades Decimal de hasta 4 decimales (5,5 baja 5,5). Servicios y productos sin control de stock no se tocan. El rol de la aplicación pierde `EXECUTE` sobre `fe_documento_crear_fe` (solo puede emitir por la función atómica) y no accede a la tabla de vínculos. **NEX-014 no se modifica.**
- Facturar **no exige** `MOVIMIENTOS.CREAR`: la autorización es `FACTURACION_ELECTRONICA.CREAR` + alcance de sucursal y de depósito.

## Orden obligatorio
1. **Backup** de la base `nexit` (procedimiento específico acordado por el responsable).
2. **Pre-verificación (solo lectura):** `docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < documentacao/banco/nexit/v1/scripts/preflight-NEX-067.sql` — la sección 1 debe dar `ok = true`. La sección 3 informa cuántos productos controlan stock y **cuántos no tienen ningún saldo disponible** (esos **no podrán venderse** hasta tener stock).
3. **Runner oficial**: `--solo-listar` y revisión de **todas** las pendientes (el runner las aplica en orden; NEX-066 y NEX-067 son independientes entre sí pero ambas se aplicarían si están pendientes). Aplicar solo con autorización expresa.
4. **Verificación (solo lectura):** `... < documentacao/banco/nexit/v1/scripts/verificar-NEX-067.sql` — todas las filas `ok = true`.
5. **Primero la migración, después el código** (build + recreate de `app`): el código nuevo emite solo por `fe_documento_crear_fe_con_stock` y **falla cerrado** (no emite) si la migración no está aplicada.

## Reversión segura
`scripts/reversion-NEX-067.sql` (una transacción): **se niega** si ya existe alguna baja de stock vinculada a una FE (la tabla es la evidencia que une FE y movimientos). Si no hay filas: elimina funciones y tabla y devuelve a la aplicación el permiso sobre `fe_documento_crear_fe`. Desplegar antes la versión anterior de la aplicación y después borrar la fila `NEX-067` de `schema_migrations`.

## Límites conocidos (fuera de E02)
- **Rechazo fiscal definitivo y cancelación SIFEN:** la baja ocurre al emitir; la **reversión automática** (rechazo definitivo / cancelación oficial, idempotente y por los mismos depósitos) es la entrega **E10**. Hasta entonces, una FE rechazada **mantiene** su salida de stock y debe regularizarse con el responsable (movimiento de entrada manual/anulación autorizada del movimiento vinculado en `documento_electronico_stock_salidas`).
- La NCE **no** mueve stock (devolución = entrada separada en Inventario).
- No se ejecutó en PostgreSQL real: la lógica SQL se verificó de forma estructural y por un simulador del contrato; la validación de bloqueos, grants y el flujo completo es de la **homologación operacional** (ver matriz de pruebas en el progreso).

## Homologación dirigida (la ejecuta el responsable; evidencia: stock antes/después y Kardex)
| # | Caso | Esperado |
|---|---|---|
| S-01 | Producto con A=3, B=5; facturar 6 | Resumen muestra A 3 + B 3; al enviar: A=0, B=2; dos movimientos SALIDA/VENTA vinculados a la FE; una línea fiscal de 6 |
| S-02 | Facturar más que el total disponible | Revisión bloqueada con mensaje; sin FE ni movimientos |
| S-03 | Cantidad 5,5 con 5,5 disponibles; luego 5,6 | 5,5 baja exactamente 5,5; 5,6 se bloquea |
| S-04 | Doble clic en «Enviar factura» | Una FE y una sola baja |
| S-05 | Stock con parte reservada/cuarentena/tránsito | Solo el DISPONIBLE cuenta |
| S-06 | Dos operadores facturan el mismo producto a la vez con stock para uno | Una se emite; la otra pide revisar; nunca saldo negativo |
| S-07 | Factura con servicio + mercadería | Solo la mercadería baja |
| S-08 | Usuario sin alcance a uno de los depósitos | Ese depósito no entra en el reparto |
