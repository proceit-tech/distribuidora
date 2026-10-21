# Procedimiento NEX-068 — Dirección de entrega en la Factura (PRO-200 / E04)

**Estado:** versionada y **NO aplicada**. Ningún agente de IA la aplica. La ejecuta **solo el responsable humano** en la VM, con backup previo, siguiendo `documentacao/infra/PROCEDIMENTO-ATUALIZACAO-AMBIENTE-NEXIT-VM.md` (runner oficial `aplicar-migraciones.sh`, `--solo-listar` antes). **Requiere NEX-067 aplicada antes** (el runner las aplica en orden). Requisito: `REQ-CASA-MINGO-DECISIONES-NCE-KUDE-2026-10-20.md` §7 y `HANDOFF-CLAUDE-NEXIT-CASA-MINGO-2026-10-20.md` (FE-END).

## Qué hace
- **Destinos elegibles** del cliente de la factura (`fe_entrega_opciones`, solo lectura): sus direcciones registradas de tipo **ENTREGA** o **SUCURSAL**, o la marcada **predeterminada de entrega**. La dirección fiscal **no** es un destino por sí misma. No se crean direcciones desde la factura (el alta sigue en *Clientes → Direcciones*).
- **Pantalla (Facturas → Nueva):** al elegir el cliente se cargan SOLO sus destinos; se preselecciona el predeterminado y el operador puede elegir otro. Sin predeterminado y con destinos, **debe elegir uno**. **Sin destinos registrados se factura normalmente** con un aviso informativo y el domicilio fiscal del receptor. Al cambiar de cliente se limpia el destino y una respuesta tardía del cliente anterior no lo restaura.
- **Emisión atómica** (`fe_documento_crear_fe_con_stock_entrega`): llama a la emisión con stock de NEX-067 y, **en la misma transacción**, valida y guarda el destino (`documento_electronico_entregas`: referencia + **fotografía** de la dirección, inmutable). Un destino de otro cliente/empresa, inexistente o ya no elegible → `NEX:ENTREGA_INVALIDA`; cliente con destinos y factura sin destino → `NEX:ENTREGA_REQUERIDA`; en ambos casos **se deshace todo** (FE, numeración y baja de stock). Repetir la emisión (misma clave) devuelve la FE existente y **no** toca el destino original.
- **No cambia:** el domicilio fiscal del receptor, el establecimiento/punto emisor, el payload SIFEN, el KuDE, las reglas fiscales ni el stock. El destino es un dato logístico interno de la factura.
- La aplicación pierde `EXECUTE` sobre la emisión de NEX-067 sin destino (una sola vía de emisión). El ayudante de grants se llama `nex_aplicar_grants_facturacion_stock_entrega` para reaplicarse **después** del de NEX-067.

## Orden obligatorio
1. **Backup** de la base `nexit`.
2. **Pre-verificación (solo lectura):** `docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < documentacao/banco/nexit/v1/scripts/preflight-NEX-068.sql` — sección 1 con `ok = true` (incluye NEX-067). La sección 3 informa cuántos clientes tienen destinos y cuántos **no tienen predeterminado** (el operador deberá elegir).
3. **Runner oficial** (`--solo-listar`, revisión de TODAS las pendientes, autorización expresa).
4. **Verificación (solo lectura):** `... < documentacao/banco/nexit/v1/scripts/verificar-NEX-068.sql` — todas las filas `ok = true`.
5. **Primero la migración, después el código** (build + recreate de `app`): el código nuevo emite solo por la función con destino y **falla cerrado** si la migración no está aplicada.

## Reversión segura
`scripts/reversion-NEX-068.sql` (una transacción): **se niega** si ya hay destinos guardados; si no, elimina funciones y tabla y devuelve a la aplicación el permiso sobre la emisión de NEX-067. Desplegar antes la versión anterior de la aplicación y después borrar la fila `NEX-068` de `schema_migrations`.

## Homologación dirigida (la ejecuta el responsable)
| # | Caso | Esperado |
|---|---|---|
| E-01 | Cliente con 5 direcciones de sucursal | Se ofrecen exactamente esas 5; se puede elegir cualquiera; el domicilio fiscal del receptor no cambia |
| E-02 | Cliente con una predeterminada | Aparece preseleccionada; se puede cambiar; la FE guarda la realmente elegida |
| E-03 | Cliente con destinos y sin predeterminada | Hay que elegir uno antes de «Revisar» |
| E-04 | Cliente sin destinos | Se factura con aviso informativo; no se crea fila de destino ni dirección ficticia |
| E-05 | Cambiar de cliente A → B (también con respuesta lenta) | El destino de A desaparece y nunca se ve ni se guarda en B |
| E-06 | Editar la dirección en Clientes después de facturar | La FE conserva la fotografía original |
| E-07 | Doble clic en «Enviar factura» | Una FE y un solo destino guardado |
