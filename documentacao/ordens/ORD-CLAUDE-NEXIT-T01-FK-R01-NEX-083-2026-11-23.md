# ORDEN ÚNICA CLAUDE — NEXIT-T01-FK-R01 / PRO-363 — 23/11/2026

## Autorización y contexto obligatorio

Autorización expresa del responsable: **diagnosticar exhaustivamente el incumplimiento FK de T01 y, si la causa queda delimitada, ESCRIBIR una corrección incremental mediante nueva migration, sin ejecutar SQL**. No autoriza VM, banco productivo, migraciones efectivas, pruebas/lint/build/CI manual, gateway SIFEN, despliegue ni merge. El push puede disparar automáticamente los GitHub Actions ya existentes; observar resultados.

- Repositorio: `proceit-tech/distribuidora`, PR #7 DRAFT, rama `feature/NEXIT-2026-001-banco-demo`.
- HEAD de partida auditado: `a48609765f311dd355bc02ec50b98aa6580f11ee` (documento de auditoría). Código de NEX-082: `24bb7022687d6125d6f2326bad744c9ef7b7a029`.
- Linear PRO-363, vinculada a PRO-62. PRO-361 en In Review; PRO-357 en Backlog y NO forma parte de esta orden.
- CI: [nexit-app-ci 45181332098](https://github.com/proceit-tech/distribuidora/actions/runs/45181332098) PASS; [nexit-banco-ci 45181332161](https://github.com/proceit-tech/distribuidora/actions/runs/45181332161) FAIL: M1 aplicó 82 migrations, T01 actualizado_at PASS, pero `T01-estructura.sql:45` falla: «toda tabla con empresa_id tiene una FK anclada en empresa_id (aislamiento referencial)».
- Auditoría oficial: `documentacao/testes/AUD-CHATGPT-NEXIT-T01-R01-NEX-082-2026-11-23.md`.
- Causa concreta documentada: `documentacao/banco/nexit/v1/migraciones/NEX-081-facturacion-politica-stock-pendientes.sql:195-201` crea `public.fe_stock_pendientes_preparacion` con `empresa_id uuid NOT NULL`, PK `(txid, empresa_id, clave)`, pero ninguna FK. **No está demostrado que sea la única tabla incumplidora**.
- Leer antes de cualquier edición la versión completa más reciente de `CLAUDE.md`, esta orden, auditoría anterior, T01, NEX-001, NEX-081, NEX-082, el runner, modelo de preflight, verificación y reversión. Consultar y confirmar el HEAD exacto. Leer un archivo por vez; no sobreescribir modificaciones ajenas.
- Confirmar que NEX-083 continúa libre. Si ya está ocupado o hay cambio incompatible de HEAD, DETENERSE y pedir decisión; no reasignar automáticamente.

## Fase 1 — inventario y diagnóstico completo, sin SQL ejecutado

1. Analizar en fuente todas las definiciones de tablas `public` creadas o alteradas por NEX-001..082 y todos los `ALTER TABLE … FOREIGN KEY`, incluidas estructuras declaradas en `DO $$`, SQL dinámico, herencia y referencias compuestas. Identificar cada tabla base con `empresa_id`, FK anclada en esa columna (primer elemento de `conkey`), FK a `empresas(id)` o a padre de la misma empresa, y migration que la crea/corrige.
2. Elaborar una tabla de evidencias por tabla incumplidora con ruta/linea de origen, constraint/índice existente, cardinalidad potencial, y propuesta mínima. No afirmar que solo existe una sin inventario. Preparar un SQL de **diagnóstico exclusivamente de lectura** que liste TODAS las tablas incumplidoras según el predicado real de `T01-estructura.sql:38–45`, además de FKs existentes, `conkey`, `confkey`, validez de FK `convalidated`, y recuentos agregados pertinentes. No ejecutar el diagnóstico.
3. Si no se puede completar el inventario con la fuente y preparar el detector de catálogo, **STOP tras informe documental**, sin implementar una migration especulativa. Si se identifica MÁS DE UNA tabla o hay alguna exigencia de modelo de aislamiento distinta de la conocida, **STOP y solicitar ampliación de autorización**; no aplicar una solución parcial para engañar T01.

## Fase 2 — corrección autorizada SOLO SI la única incumplidora verificada es fe_stock_pendientes_preparacion

1. Preparar `NEX-083` como **migration incremental nueva** que agregue exactamente UNA FK válida `(empresa_id) REFERENCES public.empresas(id)` a `public.fe_stock_pendientes_preparacion`. El nombre debe ser determinista y no colisionar. La tabla es interna y transitoria por transacción de emisión fiscal; conservar PK y esquema actual, roles, permisos, escrituras/limpieza existentes, idempotencia, stock y FE/NCE. No copiar ni modificar funciones fiscales.
2. **Fail closed:** exigir `schema_migrations` con NEX-081 y NEX-082 registradas y NEX-083 ausente, estructura exacta esperada de tabla y columna, `public.empresas(id)` válida/PK, ninguna FK equivalente ya registrada o conflictiva, ausencia de referencias huérfanas y ausencia de estado parcial. Confirmar rol ejecutor y permisos requeridos sin concederlos. `lock_timeout` transaccional corto y sin configuración global.
3. La FK debe quedar **validada por PostgreSQL** al completar la migration; no aceptar `NOT VALID` permanente ni usar `convalidated=false` como PASS. Si se usa un flujo NOT VALID + VALIDATE para gestionar locks, la validación debe completarse EN LA MISMA transacción y el resultado se comprueba antes de su commit. Valorar explícitamente el bloqueo de `empresas` y la tabla preparatoria durante el alta, y el efecto en la emisión concurrente; documentar ventana sin FE/NCE, movimientos ni compras.
4. La migration NO contiene `BEGIN/COMMIT` particulares: el runner `aplicar-migraciones.sh` ejecuta el archivo y registra su SHA-256 en `schema_migrations` en una transacción `psql -1`. No modificar ni invocar el runner. No tocar datos ni backfill sin autorización explícita. Si existe cualquier fila huérfana, **ABORTAR**, sin corregir datos automáticamente.
5. La reversión manual debe verificar checksum real de NEX-083, identidad exacta de la FK y dependencias/ausencia de versiones posteriores; solo puede retirar la constraint creada, sin `CASCADE` ni eliminación de datos, y sin borrar automáticamente `schema_migrations`. Explicar conciliación del registro y autorización manual. Preflight y postverificación son de solo lectura (BEGIN READ ONLY / ROLLBACK), incluso cuando faltan objetos; comprobar catálogo en vez de SELECT directo de tabla ausente.
6. Mantener inalterado el criterio original T01. El CI debe volver a pasar de forma natural si el inventario está completo. No declarar cierre si otra aserción emerge.

## Archivos autorizados — exactamente seis nuevos si se confirma la fase 2

1. `documentacao/banco/nexit/v1/scripts/diagnostico-T01-FK-01.sql` — inventario completo solo lectura del incumplimiento T01 y FK inválidas, sin ejecutar.
2. `documentacao/banco/nexit/v1/migraciones/NEX-083-fk-empresa-preparacion-stock.sql` — solo una FK, incremental, sin DML.
3. `documentacao/banco/nexit/v1/scripts/preflight-NEX-083.sql` — solo lectura y controles fail-closed.
4. `documentacao/banco/nexit/v1/scripts/verificar-NEX-083.sql` — solo lectura, identidad, validez e integridad de la FK, T01 y checksum.
5. `documentacao/banco/nexit/v1/scripts/reversion-NEX-083.sql` — reversión manual protegida, NO ejecutada.
6. `documentacao/testes/CASOS-NEXIT-T01-FK-R01-NEX-083-2026-11-23.md` — casos escritos NO EJECUTADOS e inventario de evidencia por tabla.

Si se detiene en Fase 1, crear únicamente un informe bajo `documentacao/analises/` más el detector de lectura, detallar el bloqueo y solicitar autorización; no publicar archivos vacíos ni señalar PASS imaginario.

## Restricciones, aceptación y STOP

- PROHIBIDO editar migrations NEX-001..082 o sus checksums; `T01-estructura.sql`; código fiscal, stock, inventario, secuencias, CDC, gateway, KuDE, interfaces, ACL, políticas, permisos o cualquier código de aplicación. No alterar workflows, runner, scripts históricos, `CLAUDE.md` ni herramientas de CI.
- No ejecutar SQL/psql, pruebas/lint/typecheck/build ni CI manual, Docker, VM, PostgreSQL operativo o descartable, gateway SIFEN, emisión/cancelación, deploy o merge. **CI automático disparado por push permitido**: observar y reportar resultados reales de los dos pipelines, separando claramente automatización de ejecución manual.
- Un único lote de archivos nuevos y un commit con SHA completo, tabla de inventario, evidencia de precondiciones, explicación de locks e integridad, diffs, casos escritos no ejecutados, enlaces de CI y bloqueos. Una migration nueva en CI efímero NO acredita instalación/homologación de VM.
- Después del push, **DETENERSE OBLIGATORIAMENTE** para auditoría ChatGPT. No iniciar R02, PRO-357, PRO-313/199/342/354, ni modificar NEX-082 por iniciativa propia.
