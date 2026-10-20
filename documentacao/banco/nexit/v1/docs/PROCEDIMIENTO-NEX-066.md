# Procedimiento NEX-066 — Intenciones durables de movimientos (PRO-188 / MOV-O07)

**Estado:** versionada y **NO aplicada**. Ningún agente de IA la aplica. Lo ejecuta **solo el responsable humano** en la VM, con backup previo. Definición: `documentacao/definicoes/REQ-MOV-O07-RECUPERACAO-INTENCAO.md`.

## Qué agrega
`movimientos_intenciones` (K1 + snapshot por empresa y usuario), cinco funciones `SECURITY DEFINER` (`movimiento_intencion_reservar | pendiente | tomar | confirmar | rechazar`) y el ayudante de grants `nex_aplicar_grants_movimientos_intenciones()`. No modifica NEX-014 ni el motor `inventario_registrar_movimiento`. El rol `nexit_runtime` solo **ejecuta** las funciones; no accede a la tabla.

## Orden obligatorio
1. **Backup** de la base `nexit` (procedimiento vigente en `documentacao/infra/PROCEDIMENTO-ATUALIZACAO-AMBIENTE-NEXIT-VM.md`).
2. **Pre-verificación (solo lectura):** `docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < documentacao/banco/nexit/v1/scripts/preflight-NEX-066.sql` — todas las filas de la sección 1 deben dar `ok = true`.
3. **Aplicar la migración** con el runner habitual (`scripts/aplicar-migraciones.sh`): una transacción con su fila en `schema_migrations`. **Primero la migración, después el código** de la aplicación (PRO-188): el código nuevo exige estas funciones y **falla cerrado** (no registra movimientos nuevos desde la pantalla) si no existen.
4. **Verificación (solo lectura):** `... < documentacao/banco/nexit/v1/scripts/verificar-NEX-066.sql` — todas las filas `ok = true`.
5. Prueba funcional mínima de un operador con `MOVIMIENTOS.CREAR`: registrar un movimiento y comprobar que aparece su número; recargar la pantalla de «Nuevo movimiento» (debe abrir libre).

## Reversión segura
`scripts/reversion-NEX-066.sql` (una transacción, con backup): **se niega** si hay alguna intención `RESERVADA` (incierta). Resuelva antes cada pendiente: consulte el movimiento original (por la clave) o el rechazo comprobado. Despliegue primero la versión anterior de la aplicación. Conserva una copia de las intenciones resueltas en `movimientos_intenciones_respaldo_nex066`. Después, borrar la fila `NEX-066` de `schema_migrations`.

## Operación y soporte
- Una intención `RESERVADA` de **más de 7 días** se muestra como «requiere revisión»; **nunca se elimina ni libera sola** (no hay tareas programadas). Para resolver una, el responsable consulta el movimiento por la clave: si existe, la pantalla de «Nuevo movimiento» del propio operador confirmará el original con «Reintentar el mismo registro» (idempotente). Si no existe y la operación no debe repetirse, la reconciliación administrativa justificada es una decisión del responsable (fuera de este alcance; no hay descarte desde la interfaz).
- Datos sensibles: el snapshot contiene los campos del formulario (incluidos motivo/observación libres); no contiene credenciales, tokens ni contexto del usuario. Sin acceso directo para la aplicación.
