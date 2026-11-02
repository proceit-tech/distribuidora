# Procedimiento NEX-070 — Servicio DESCUENTO en la Nota de Crédito (PRO-200 / E07)

**Estado:** versionada y **NO aplicada**. Ningún agente de IA la aplica. La ejecuta **solo el responsable humano** en la VM, con backup previo, según `documentacao/infra/PROCEDIMENTO-ATUALIZACAO-AMBIENTE-NEXIT-VM.md` (runner oficial `aplicar-migraciones.sh`, `--solo-listar` antes). **No depende de NEX-066…069**, pero el runner aplica en orden TODAS las pendientes: revisar el listado.

## Qué hace
- Crea `nce_descuentos` (solo altas, anclada a `nce_origen`): monto acreditado por el servicio fijo **DESCUENTO** de una NCE de motivo 3 (Descuento) o 4 (Bonificación).
- Reemplaza `fe_documento_crear_nce` (misma firma y grants): acepta un elemento `{"servicio": true, "monto": …}` como **único** ítem en motivos 3/4. Valida el ítem del payload con el mismo rigor que una línea original: código y descripción `DESCUENTO`, sin GTIN, unidad 77, cantidad 1, precio unitario = monto, gravado, tasa 10, proporción 100, importes derivados recalculados.
- **Saldo global** de la FE: Σ `dTotOpeItem` originales − (NCE aprobadas por líneas + por DESCUENTO), bajo el bloqueo `FOR UPDATE` de la FE. Limita al DESCUENTO y también a las notas por línea posteriores. No cambian CDC de asociación, receptor, motivo fijado, NCE pendiente, numeración, idempotencia ni totales.
- **Sin stock:** el servicio no toca movimientos ni inventario.
- **Orden:** primero la migración, después el código. Sin ella la pantalla no ofrece el botón y el servidor responde 409 antes de reservar numeración.

## Riesgo fiscal que debe validar el responsable (no es una certificación)
El IVA 10% fijo es **decisión comercial**. Con una FE original a 5%, exenta o mixta el ítem DESCUENTO igual va gravado al 10% (sin prorrateo): verificar con el SIFEN/gateway reales si lo acepta antes de producción. No se crea ningún documento ficticio si el proveedor lo rechaza.

## Orden
1. Backup.
2. Pre-verificación (solo lectura): `docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < documentacao/banco/nexit/v1/scripts/preflight-NEX-070.sql` — sección 1 todo `ok = true`.
3. Runner oficial (`--solo-listar`, autorización expresa).
4. Verificación (solo lectura): `... < documentacao/banco/nexit/v1/scripts/verificar-NEX-070.sql` — todo `ok = true`.
5. Desplegar el código.

## Reversión
`scripts/reversion-NEX-070.sql` (una transacción): **se niega** si ya existe alguna NCE con DESCUENTO; si no, restaura la función de NEX-065 y elimina la tabla. Antes, desplegar la aplicación anterior a E07; después borrar la fila `NEX-070` de `schema_migrations`.

## Homologación dirigida (la ejecuta el responsable)
| # | Caso | Esperado |
|---|---|---|
| D-01 | FE aprobada con 3 productos → NCE Descuento → `+ Agregar DESCUENTO` | Fila DESCUENTO (cant. 1, IVA 10%); emitir queda bloqueado mientras haya líneas originales |
| D-02 | `Seleccionar todos` + `Eliminar seleccionados`, monto 10.000 → Revisar → Emitir | NCE con un solo ítem DESCUENTO; FE original intacta; CDC asociado correcto |
| D-03 | Monto mayor al saldo disponible | Error en pantalla y en servidor; no se reserva número |
| D-04 | Bonificación con DESCUENTO | Igual que D-02 con motivo 4 |
| D-05 | Repetir el envío (doble clic / reintento) | Misma NCE, un solo número |
| D-06 | FE origen a 5% o exenta | Registrar la respuesta real del gateway/SIFEN (riesgo de IVA fijo 10%) |
| D-07 | Segunda NCE sobre la misma FE | Respeta saldo global y motivo fijado |
| D-08 | Inventario | Sin ningún movimiento de stock |
