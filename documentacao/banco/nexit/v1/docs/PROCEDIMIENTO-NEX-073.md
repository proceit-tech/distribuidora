# Procedimiento NEX-073 — Fecha de emisión elegida (PRO-93 / PRO-294)

> **BLOQUEO — NO EJECUTAR AÚN (AUD-PRO-93-R01 F002).** Estado: versionada y **NO aplicada**. Ningún agente de IA la aplica. **NO usar el runner oficial** (`aplicar-migraciones.sh`) sin revisar antes la salida de `--solo-listar` y el estado real de `schema_migrations`:
> el runner aplica TODAS las migraciones pendientes en orden y `NEX-072` (evidencia de envíos) también está versionada, sin aplicar y **no autorizada**; igualmente `NEX-074`. Si `--solo-listar` incluye `NEX-072` (o cualquier otra pendiente sin autorización individual del responsable), **ABORTAR**.
> No se debe omitir un archivo, falsear `schema_migrations` ni evitar la verificación de checksums para "aplicar solo esta". Hasta que exista un plan humano de aplicación selectiva, la migración permanece solo en Git. En el repositorio no hay un mecanismo oficial documentado de ejecución selectiva: esto es un **bloqueo de despliegue** a resolver por el responsable.

## Qué hace
- Reemplaza `fe_documento_crear_fe` (misma firma; los envoltorios de stock/entrega/vendedor siguen llamándola sin cambios). Sin la clave de entrada `dFecEmiSol` el comportamiento es idéntico a NEX-065 (`now()`).
- Con `dFecEmiSol` (AAAA-MM-DD, enviada por la aplicación solo cuando la fecha elegida difiere de hoy): valida fecha real, **selección comercial** hoy−30…hoy+5 y **ventana habilitada de transmisión normal** hoy−4…hoy+5 (día local de Asunción), **antes de reservar numeración**; fija `dFeEmiDE` y `documentos_electronicos.fecha_emision` = fecha elegida + hora local de Asunción en que se reserva el número. La clave no queda en el snapshot que se envía al proveedor.
- Crea el marcador `fe_emision_fecha_soportada()`: la aplicación **no envía** una fecha distinta de hoy si el marcador no existe (responde 422 con el motivo), para que la función antigua nunca ignore la fecha en silencio.
- No modifica documentos, numeración, series, stock, entrega ni NCE.

## Regla fiscal aplicada (corrige la premisa anterior)
Fuente: preguntas frecuentes e-Kuatia de la DNIT: transmisión **normal** cuando firma→transmisión ≤ 72 h y emisión→transmisión ≤ 120 h, siendo la emisión **anterior o posterior** a la transmisión. Por eso **no se prohíben las fechas futuras** (+1…+5): al transmitir después de crear el documento la diferencia es ≤ 120 h. En el pasado se habilita hasta −4 días (96 h, 24 h de margen para el envío y un reintento); −5 días ya no deja margen y −6…−30 exceden las 120 h: se bloquean antes de numerar con el motivo («tratamiento extemporáneo no implementado»), nunca se cambian en silencio.
- **Hora:** el operador elige solo la fecha; la hora es la local de Asunción al reservar el número. La aplicación no presume el instante de transmisión (lo ejecuta el gateway).
- **Pendiente de confirmación del responsable:** que el gateway/SIFEN acepte una `dFeEmiDE` futura con la hora local actual, y la cota de −4 días como margen operativo.
- **Idempotencia:** la fecha forma parte del contenido de la clave; un reintento conserva fecha, hash y número y no revalida la fecha ni consume otra numeración.

## Orden de ejecución (cuando exista plan aprobado)
1. Backup.
2. Pre-verificación (solo lectura): `docker exec -i nexit-db psql -U nexit_app -d nexit -v ON_ERROR_STOP=1 < documentacao/banco/nexit/v1/scripts/preflight-NEX-073.sql` — sección 1 todo `ok = true`.
3. Aplicación según el plan humano aprobado (ver el bloqueo de arriba).
4. Verificación (solo lectura): `... < documentacao/banco/nexit/v1/scripts/verificar-NEX-073.sql` — todo `ok = true`.
5. Desplegar el código (migración primero, código después). Sin la migración, la pantalla funciona con la fecha de hoy y bloquea con un mensaje las demás.

## Reversión
`scripts/reversion-NEX-073.sql` (una transacción): restaura la definición de NEX-065 y elimina el marcador. Antes, desplegar la aplicación anterior; después borrar la fila `NEX-073` de `schema_migrations`.
