# ORDEN ÚNICA CLAUDE — NEXIT-T01-FK-R02 / NEX-083 con DOS FK — 23/11/2026

## 0. Decisión y antecedentes vinculantes

**Decisión del responsable tras auditoría ChatGPT:** AMPLIAR EXCLUSIVAMENTE LA AUTORÍA de NEX-083 a **dos tablas** con `empresa_id` sin FK, detectadas y documentadas en Fase 1. Autoriza crear/verificar en código los archivos versionados, NO ejecutarlos manualmente. Prohibido ejecutar SQL/psql/tests/lint/typecheck/build/manual CI, VM/Docker/gateway SIFEN, deploy o merge. Solo observar las ejecuciones automáticas del GitHub Actions al hacer push.

- Repo: `proceit-tech/distribuidora`; PR **#7 DRAFT**; branch `feature/NEXIT-2026-001-banco-demo`.
- Base del nuevo alcance: commit de diagnóstico `0a2fb78bc34b17f798ed015b407ed7f0db5b1dff`; auditoría ChatGPT `documentacao/testes/AUD-CHATGPT-NEXIT-T01-FK-R01-DIAGNOSTICO-2026-11-23.md`.
- `CLAUDE.md` actualizado (nuevo banner superior), esta orden R02 es la **única orden activa**. La R01 se detuvo correctamente en Fase 1 por alcance; NO duplicar trabajo ni repetir la R01.
- Linear PRO-363 en progreso; PRO-62 en progreso, PRO-361 In Review; PRO-357 en Backlog, fuera de alcance.
- HEAD/branch NEX-083: sigue libre en Git al momento de publicar R02. Antes de editar, comprobar HEAD actual, integridad de los dos archivos de diagnóstico ya entregados, verificar NEX-083 sin ocupar y leer la versión COMPLETA más reciente de todos los archivos afectados UNO POR VEZ; STOP si hay cambios paralelos o número ocupado.
- Base de evidencia CI: [nexit-banco-ci 45181332161](https://github.com/proceit-tech/distribuidora/actions/runs/45181332161) aplicó 82 migrations, triggers `actualizado_at` de T01 PASS, segunda aserción T01 línea 45 FK FAIL; [nexit-app-ci 45181332098](https://github.com/proceit-tech/distribuidora/actions/runs/45181332098) PASS. El CI no enumeró cuáles tablas faltan; el diagnóstico ESTÁTICO inventarió **86 con empresa_id, 84 conformes, 2 sin FK**, detector documental NO EJECUTADO.

## 1. Diagnóstico conforme y alcance exacto

Referencias obligatorias: `documentacao/analises/NEXIT-T01-FK-R01-DIAGNOSTICO-FK-EMPRESA-2026-11-23.md`, `documentacao/banco/nexit/v1/scripts/diagnostico-T01-FK-01.sql`, `documentacao/banco/nexit/v1/pruebas/T01-estructura.sql:38–45`, `migraciones/NEX-001-base.sql`, `migraciones/NEX-065-facturacion-estado-por-tipo.sql:41–56`, `migraciones/NEX-081-facturacion-politica-stock-pendientes.sql:195–201`, `migraciones/NEX-082-triggers-actualizado-intenciones-secuencias.sql`, `scripts/reversion-NEX-065.sql`, `scripts/reversion-NEX-081.sql` y el runner `scripts/aplicar-migraciones.sh`.

Crear **una sola nueva migration incremental NEX-083** con **dos** y solo dos FOREIGN KEY validadas a `public.empresas(id)`:

1. `public.fe_estado_previo_nex065(empresa_id)` → `public.empresas(id)`. Nombre explícito estable `fe_estado_previo_nex065_empresa_fk`. Tabla de AUDITORÍA histórica de disponibilidad fiscal FE/NCE: preservar íntegramente su snapshot, PK `(empresa_id,punto_id,tipo_documento)`, SELECT y uso de verificación/reversión de NEX-065. Ya puede contener filas; NO exigir que esté vacía, pero sí 0 huérfanos.
2. `public.fe_stock_pendientes_preparacion(empresa_id)` → `public.empresas(id)`. Nombre `fe_stock_pendientes_preparacion_empresa_fk`. Tabla INTERNA de trabajo por transacción de emisión con stock pendiente, PK `(txid,empresa_id,clave)`. Por seguridad, exigirla VACÍA al instalar, comprobado con bloqueo que excluya escrituras concurrentes. No cambiar su INSERT/SELECT/DELETE ni el motor FE/stock.

La FK simple a empresas es preferible a una compuesta al punto de expedición porque cumple exactamente el invariante `T01` y no crea una dependencia nueva sobre continuidad de puntos fiscales. Revisar impacto de `ON DELETE NO ACTION` (predeterminado) sobre intentos legítimos de eliminación de empresas; si hay flujo vigente que contradiga esta decisión, **STOP con evidencia**, no inventar `ON DELETE CASCADE`, `SET NULL` o excepciones.

## 2. Protecciones obligatorias de NEX-083

- **Gates de esquema**: `public.schema_migrations` contiene NEX-065/081/082 aplicadas y NEX-083 ausente, con precondiciones de integridad de los objetos históricos; ambas tablas existen en `public` como BASE TABLE, columna `empresa_id uuid NOT NULL`, PK con orden/identidad esperados, `public.empresas(id)` es PK/UNIQUE referenciable. Si hay una FK anclada preexistente o conflicto de nombres, una tabla ausente, estado parcial o esquema distinto, **ABORTAR**. No modificar migrations NEX-001..082.
- **Inventario exhaustivo**: reconciliar el diagnóstico estático y el detector de lectura con las dos tablas esperadas. El preflight debe incluir un verificador CATALOGAL exhaustivo que liste las tablas de `public` con `empresa_id` sin FK `conkey[1] = attnum(empresa_id)`, validando que son exactamente esas dos y ninguna más. Si otras aparecen, abortar; no pasar la aserción por excepciones. Al término de NEX-083, verificar que ninguna tabla queda incumpliendo el criterio original de T01.
- **Integridad de datos**: contar huérfanos reales en ambas tablas frente a `empresas.id`, sin imprimir datos privados; abortar ante cualquier referencia huérfana o `empresa_id NULL`, sin backfill, DELETE ni UPDATE. `fe_estado_previo_nex065` NO se vacía; `fe_stock_pendientes_preparacion` debe estar vacía bajo bloqueo antes de crear constraint.
- **Seguridad transaccional**: runner actual aplica migración y registro del checksum SHA-256 en `schema_migrations` con `psql -1`. Usar `SET LOCAL lock_timeout` corto (no global) dentro de esa transacción; NO incluir BEGIN/COMMIT independientes. Evaluar el orden de locks de `empresas` y ambas hijas, para evitar deadlocks con escrituras. Documentar `SHARE ROW EXCLUSIVE` y ventana sin emisión FE/NCE, movimientos ni compras. Si no se puede garantizar un orden seguro, documentar y STOP en vez de imponer bloqueos arbitrarios.
- Las dos FK deben finalizar como `convalidated = true`; no dejar constraints `NOT VALID` pendientes. De usarse `NOT VALID` + `VALIDATE CONSTRAINT`, completar en la misma transacción, con controles posteriores. Sin DML funcional, sin creación/alteración de funciones, grants, índices, PK, triggers o RLS.
- No alterar el histórico fiscal de NEX-065, ni los datos de NEX-081/082, idempotencia o numeración. No eliminar empresas. Revisar que snapshots antiguos sigan accesibles por los scripts de verificación/reversión y que la tabla de preparación permanezca privada para runtime.

## 3. Archivos permitidos: exactamente CINCO NUEVOS

Los **dos archivos de Fase 1 ya están publicados y NO deben duplicarse**: `documentacao/analises/NEXIT-T01-FK-R01-DIAGNOSTICO-FK-EMPRESA-2026-11-23.md` y `documentacao/banco/nexit/v1/scripts/diagnostico-T01-FK-01.sql`. No alterarlos en R02 salvo inconsistencia material comprobada (STOP antes de alterar).

Crear únicamente:

1. `documentacao/banco/nexit/v1/migraciones/NEX-083-fks-empresa-auditoria-preparacion.sql` — migration dos FK, segura y sin DML.
2. `documentacao/banco/nexit/v1/scripts/preflight-NEX-083.sql` — READ ONLY/ROLLBACK, controles FAIL-CLOSED de ambas tablas, 0 huérfanos, tabla de preparación vacía, catálogo exhaustivo y estado de migrations.
3. `documentacao/banco/nexit/v1/scripts/verificar-NEX-083.sql` — READ ONLY/ROLLBACK, comprobar exactamente dos FKs con nombre/columnas/referencias/acciones esperadas, `convalidated=true`, T01 FK natural, esquema/PK y checksums intactos.
4. `documentacao/banco/nexit/v1/scripts/reversion-NEX-083.sql` — manual y protegida: exigir NEX-083 registrada con checksum exacto de archivo y ninguna versión NEX posterior dependiente, dos constraints con definiciones exactas, no parcial; DROP CONSTRAINT solo esas dos (sin CASCADE), sin borrar automáticamente `schema_migrations`; explicar conciliación manual y riesgo de T01 FAIL tras revertir. Reversión NEX-083 debe preceder, en mantenimiento autorizado, a reversión NEX-065 o NEX-081.
5. `documentacao/testes/CASOS-NEXIT-T01-FK-R02-NEX-083-2026-11-23.md` — casos escritos NO EJECUTADOS, para ausencia/presencia de cada FK, checksums, huérfanos de ambas, snapshot NEX-065 no vacío, preparación NEX-081 vacía/no vacía, FK incorrecta o no validada, bloqueo transaccional, rollback, posterior T01, permisos y regresión FE/NCE/stock, salida del CI automática.

Si la Fase 2 evidencia un requisito ajeno a las dos FK, STOP y solicitar orden aparte. No crear archivos extra, herramientas de diagnóstico secundarias o reportes duplicados.

## 4. Reglas de ejecución y entrega

**PROHIBIDO** editar migraciones NEX-001..082, `T01-estructura.sql`, runner, `CLAUDE.md`, workflows o código de aplicación; no tocar FE/NCE, CDC, KuDE, stock, puntos, numeración, políticas, permisos ni gateway. **No ejecutar** SQL, psql, tests, lint, typecheck, build, CI manual, VM, Docker, DB real/efímera, emisión, cancelación, merge o deploy. **CI automático por push permitido** y se deben informar las ejecuciones reales sin interpretarlas como autorización para la VM.

Un único commit y push; reportar SHA completo, archivos cambiados, síntesis de gates, consistencia de FKs y PK, lista de casos NO EJECUTADOS, enlaces y resultados del GitHub Actions automático, riesgos de bloqueos y reversión, restricciones de instalación en VM. Si T01 pasa triggers+FK pero otra aserción falla, informar la falla sin modificarla. **DETENERSE TRAS PUBLICAR PARA AUDITORÍA CHATGPT.** El PR #7 continúa DRAFT, PRO-62 In Progress, PRO-363 In Progress y PRO-357 Backlog hasta la revisión posterior.
