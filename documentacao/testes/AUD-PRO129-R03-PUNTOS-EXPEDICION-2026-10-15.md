# AUD-PRO129-R03 — protección del establecimiento SIFEN y carrera de alta

**Fecha:** 2026-10-15. **Commit auditado:** `a5b8894ee740c509471b33c198d6f762243367e5`. **Branch oficial:** `feature/NEXIT-2026-001-banco-demo` (HEAD coincidente al iniciar auditoría). **Auditor:** ChatGPT, revisión independiente de SQL, migraciones, pruebas y CI. **Resultado:** R02-01 **CORREGIDO para UPDATE directo de sucursales**. Un caso residual de concurrencia R03-01 exige cierre antes de aplicar el flujo administrativo de puntos en la VM.

## Evidencias verificadas
- Leídos `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, progreso pertinente, AUD-PRO129-R02, diff del SHA, `NEX-057`, nueva `NEX-058-facturacion-establecimiento-protegido.sql`, `T19-nex057-puntos-expedicion.sql`, `T20-concurrencia-puntos.sh` y `reversion-NEX-058.sql`.
- [CI automático 38746273621](https://github.com/proceit-tech/distribuidora/actions/runs/38746273621) **completed/success**. Logs job `116460639262`: **58 migrations** aplicadas en PostgreSQL descartable, **T19 78 PASS**, **T20 11 PASS**, **675 verificaciones PASS y 0 fallas**. No se ejecutó SQL/VM real ni se transmitieron DE desde esta auditoría. Las líneas `ERROR` visibles en logs corresponden a escenarios negativos controlados dentro de una corrida con éxito final; no son evidencia de falla global.
- NEX-058 no altera NEX-048 ni NEX-057, depende explícitamente de la versión de NEX-057 que incluye `fe_punto_identidad_en_uso`; añade triggers en `sucursales` y en `fe_puntos_expedicion`, más reversión. Cambiar establecimiento de sucursal con punto activo/inactivo o documento genera `NEX:ESTABLECIMIENTO_CON_PUNTOS`; sin puntos/documentos se permite. Protección por sucursal, sin unicidad global no autorizada.

## R02-01 — CORREGIDO/ACEPTADO dentro del alcance probado

La función `fe_sucursal_establecimiento_protegido` (NEX-058) protege `BEFORE UPDATE OF establecimiento_sifen` y compara `OLD`/`NEW` con `IS NOT DISTINCT FROM`. Si existen puntos (de cualquier estado) o documentos, bloquea la mutación; permite no-op, cambios de otros campos y reinicio DEMO explícito. Tests T19 correspondientes pasaron en CI. La función de reserva/numeração `fe_documento_crear_fe` y sus triggers permanecen inalterados.

## R03-01 — MEDIO/ALTO, concurrencia no revalidada antes del INSERT del punto

**Código y orden de operaciones observados:**
1. En `NEX-057`, `fe_punto_crear` lee `sucursales.establecimiento_sifen` sin `FOR SHARE` ni otro bloqueo de esa fila; toma advisory lock **por la identidad calculada con ese valor**, consulta `fe_punto_identidad_en_uso` y luego `INSERT` inactivo.
2. En `NEX-058`, el trigger `fe_puntos_expedicion_bloquea_sucursal` solo toma `SELECT … FOR SHARE` **durante el INSERT**, después de que ya se fijó `v_est` y se pasó la verificación fiscal de `fe_punto_crear`. El trigger no devuelve el establecimiento actual ni repite la comprobación de identidad.
3. `T19` verifica cambios directos secuenciales y `T20` solo la concurrencia de alta/activación de la misma identidad, **no la carrera UPDATE de establecimiento vs alta**.

**Intercalación razonable en READ COMMITTED (predicción lógica, no repro en PostgreSQL):**
- Sucursal S1 ya tiene punto `001` de establecimiento `001` (incluso activo); S2, sin puntos, tiene establecimiento `002`.
- Transacción C inicia `fe_punto_crear(S2, codigo=001)` y lee **`002`**. Compara `002-001` y pasa, antes de que ocurra el INSERT.
- Transacción U cambia `S2.establecimiento_sifen` de `002` a `001` y confirma; como S2 todavía no tiene puntos ni documentos, el UPDATE es admisible.
- C realiza el INSERT: el trigger `FOR SHARE` ya ve S2 con `001`, pero **no compara ese valor con `002` ni repite la búsqueda de `001-001`**. Puede quedar registrado un segundo punto **inactivo** con identidad fiscal real `001-001`, aunque `fe_punto_crear` lo habría rechazado si leyera el establecimiento definitivo. La activación de este duplicado seguirá bloqueada por NEX-057 si hay otro activo. No implica dos puntos activos ni CDC duplicado, pero sí **alta administrativa inconsistente y sin función para borrar/mover el punto inactivo**.
- Una carrera completamente simultánea exige barrera temporal determinista y sesiones separadas para verificarla, no puede declararse demostrada solo por análisis estático.

**Criterio mínimo:** estabilizar/validar la lectura de `sucursales.establecimiento_sifen` **antes de fijar la identidad, adquirir advisory lock y comprobar `fe_punto_identidad_en_uso`**, o revalidarla después del lock sobre sucursal y antes de insertar, abortando/reintentando de forma segura cuando cambió. Evitar inversión de locks que cree deadlock. No bloquear la carga excepcional de duplicados históricos utilizada deliberadamente por T19/T20 para ensayar activación; resolver específicamente el camino administrativo `fe_punto_crear`, no solo escondiendo el resultado en la UI. Añadir prueba SQL dirigida con dos sesiones para UPDATE de establecimiento vs alta en ambas órdenes, y verificar que **no queda registro huérfano/duplicado** ni se altera la numeración. Conservar protección de cambio de establecimiento ya existente y NEX-048 intacta.

**Versionado:** NEX-058 ya fue publicada y ejecutada en CI descartable; no hay comprobación de su estado en VM. No asumir que se puede editar/reaplicar ninguna migration instalada. Si el responsable no confirma que NEX-058 esté sin aplicar, preferir nueva NEX-059 incremental para corregir el camino y mantener checksums históricos. Revisar también versión/checksum de NEX-057 **antes** de ejecutar cualquier migration en VM, porque una NEX-057 antigua aplicada no es compatible con la cadena vigente.

## Veredicto y próxima acción
- **Corregido:** R02-01 (alteración directa del establecimiento), R01-01 (dos puntos activos), R01-02 (grants/bitácora).
- **Pendiente específico:** R03-01, carrera UPDATE sucursal/alta que podría crear un punto inactivo duplicado. **No marcar PRO-129 Done ni autorizar aplicación de NEX-058 en la VM hasta prueba dirigida y resolución.** La emisión continúa protegida de duplicación por los controles existentes.
- Claude implementa únicamente corrección focal de concurrencia, test mínimo T20 o similar, commit/push y **para**; no inicia PRO-128, no ejecuta suíte completa/build global/CI manual ni accede VM/PG operativo.
