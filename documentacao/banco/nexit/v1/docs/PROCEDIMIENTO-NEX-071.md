# Procedimiento NEX-071 — Observación original de la Nota de Crédito (E1-R03 / PRO-292 / PRO-300)

**Estado:** versionada y **NO aplicada**. Ningún agente de IA la aplica. La ejecuta **solo el responsable humano** en la VM, con backup previo, según `documentacao/infra/PROCEDIMENTO-ATUALIZACAO-AMBIENTE-NEXIT-VM.md` (runner oficial `aplicar-migraciones.sh`, `--solo-listar` antes). Requiere NEX-062 y NEX-070.

## Qué hace
- Crea `nce_observaciones_originales` (solo altas, anclada a `nce_origen`, aislada por empresa): la observación **cruda** recibida (sin recortar ni normalizar: espacios y saltos de línea incluidos, puede ser vacía o solo espacios) al crear una NCE nueva. El `dInfAdic` que viaja al proveedor no cambia.
- Crea `fe_documento_crear_nce_obs` (12 parámetros): llama a `fe_documento_crear_nce` **sin modificarla** y, en la misma transacción, registra la observación original solo si la NCE es nueva. Un reenvío con la misma clave no escribe nada.
- Las NCE anteriores **no se reclasifican**: no tienen fila, y la aplicación las trata de forma conservadora (ver abajo).

## Comportamiento de la aplicación
- **Con la migración:** la corrección de una NCE rechazada precarga exactamente la observación original; un reintento con la misma clave solo se acepta si la observación es idéntica a la original (otra distinta → 409).
- **Sin la migración (o NCE anteriores):** la corrección precarga el texto guardado **completo** (puede incluir un «Vendedor:» antiguo; no se borra nada) y el reintento solo se acepta si no hay ningún bloque automático ambiguo (texto guardado = texto enviado); en caso contrario 409 y el operador debe recargar el formulario.
- **Orden:** migración primero, código después (el código detecta la tabla y, si no existe, usa la ruta conservadora y `fe_documento_crear_nce`).

## Orden de ejecución
1. Backup.
2. Pre-verificación (solo lectura): `docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < documentacao/banco/nexit/v1/scripts/preflight-NEX-071.sql` — sección 1 todo `ok = true`.
3. Runner oficial (`--solo-listar`, autorización expresa).
4. Verificación (solo lectura): `... < documentacao/banco/nexit/v1/scripts/verificar-NEX-071.sql` — todo `ok = true`.
5. Desplegar el código.

## Reversión
`scripts/reversion-NEX-071.sql` (una transacción): **se niega** si ya hay filas en `nce_observaciones_originales`; si no, elimina la función y la tabla (no toca `fe_documento_crear_nce`). Antes, desplegar la aplicación anterior; después borrar la fila `NEX-071` de `schema_migrations`.
