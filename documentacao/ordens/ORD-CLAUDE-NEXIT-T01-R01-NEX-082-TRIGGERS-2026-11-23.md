# ORDEN ÚNICA CLAUDE — NEXIT-T01-R01 / NEX-082 — 23/11/2026

## 0. Autorización y base

El responsable AUTORIZA EXCLUSIVAMENTE ESCRIBIR una migración SQL incremental para resolver T01 (triggers de actualizado_at), con preflight, verificación, reversión y casos escritos. NO autoriza ejecutar SQL, pruebas manuales, VM, Docker, gateway, despliegue o merge.

Repo proceit-tech/distribuidora; PR #7 DRAFT; branch feature/NEXIT-2026-001-banco-demo. Base HEAD documental auditado b25e00ab8c9976eea810f2755ece36c866edfced; código funcional previo 4227d86954af295f61e776c932a01e7873a271f8. Confirmar HEAD actual y leer archivos completos más recientes UNO POR VEZ antes de cambiar. Si existen cambios paralelos, detenerse.

Orden nueva única y focal, sustituye la cola anterior exclusivamente para T01. NEXIT-CI-R01 ya se auditó CONFORME F001/F002/F003, T01 FAIL. PRO-357 (cobertura del conteo de Movimientos) permanece Backlog SIN autorización para corregirla.

Referencias obligatorias para leer íntegramente:
- documentacao/testes/AUD-CHATGPT-NEXIT-CI-R01-2026-11-23.md
- documentacao/analises/NEXIT-CI-R01-T01-DIAGNOSTICO-ACTUALIZADO-AT-2026-11-23.md
- documentacao/banco/nexit/v1/pruebas/T01-estructura.sql
- documentacao/banco/nexit/v1/migraciones/NEX-001-base.sql
- documentacao/banco/nexit/v1/migraciones/NEX-055-facturacion-triggers-actualizacion.sql
- documentacao/banco/nexit/v1/scripts/reversion-NEX-055.sql
- documentacao/banco/nexit/v1/migraciones/NEX-060-facturacion-secuencias-por-tipo.sql
- documentacao/banco/nexit/v1/migraciones/NEX-066-movimientos-intenciones.sql
- documentacao/banco/nexit/v1/migraciones/NEX-075-compras-entradas.sql
- documentacao/banco/nexit/v1/scripts/aplicar-migraciones.sh
- Examinar también los escritores de NEX-062/063/065, las guardas de inmutabilidad y los grants correspondientes.

CI previo: app https://github.com/proceit-tech/distribuidora/actions/runs/45176204850 (todos los jobs PASS, 6763 comprobaciones); banco https://github.com/proceit-tech/distribuidora/actions/runs/45176204839 (C1 PASS, 1115 comprobaciones PASS, únicamente T01 FAIL). No afirmar CI global verde.

NEX-082 no existe en la rama al 23/11/2026 (última migration NEX-081). Reconfirmar número libre antes de crear; si se ocupa, NO elegir otro por iniciativa propia: detenerse y avisar.

## 1. Tres triggers EXACTOS

Una única migration incremental, sin editar NEX-001..081:
- public.fe_punto_secuencias (NEX-060) -> fe_punto_secuencias_actualizado_trg.
- public.movimientos_intenciones (NEX-066) -> movimientos_intenciones_actualizado_trg.
- public.compras_entradas_intenciones (NEX-075) -> compras_entradas_intenciones_actualizado_trg.

Patrón NEX-055: CREATE TRIGGER <nombre> BEFORE UPDATE ON public.<tabla> FOR EACH ROW EXECUTE FUNCTION public.actualizar_fecha(). La función existente NEX-001 establece NEW.actualizado_at = now(); el trigger no debe alterar ninguna otra columna.

GATES FAIL-CLOSED: verificar que las 3 tablas existen en public como BASE TABLE; que poseen actualizado_at timestamptz; que public.actualizar_fecha() existe con comportamiento esperado; que ninguno de los 3 triggers existe ya. Si falta una tabla, hay un trigger previo, una función inesperada o un estado parcial, abortar la transacción completa. NO usar IF NOT EXISTS, CREATE OR REPLACE TRIGGER ni el barrido global nex_instalar_triggers_actualizacion(); NO crear los de tablas ajenas.

Conservar fe_punto_secuencias_inmutable_trg y el trigger de TRUNCATE: comprobar que el orden de BEFORE UPDATE no altera prohibición de retroceso, tipo/empresa/punto ni identidad fiscal. No cambiar índices K1, únicos, estados, stock, CDC, numeración o data. No crear funciones nuevas. No modificar grants.

El runner documentacao/banco/nexit/v1/scripts/aplicar-migraciones.sh aplica una migration y su registro SHA-256 en schema_migrations dentro de la MISMA transacción psql -1. Por tanto la nueva migration NO debe introducir BEGIN/COMMIT propios. Establecer lock_timeout LOCAL corto dentro de esa transacción (no cambiar configuración global). Documentar que CREATE TRIGGER requiere SHARE ROW EXCLUSIVE, incompatible con escrituras concurrentes: aplicación futura exige ventana sin emisión FE/NCE, movimientos ni entradas y backup/verificación previa, autorizados por humano aparte.

## 2. ENTREGABLES — cinco archivos nuevos, sin extras

A. documentacao/banco/nexit/v1/migraciones/NEX-082-triggers-actualizado-intenciones-secuencias.sql
    Migration con las precondiciones y los tres triggers exactos, en patrón incremental seguro NEX-055. Sin actualizaciones de filas y sin SQL de operación fuera de alcance.

B. documentacao/banco/nexit/v1/scripts/preflight-NEX-082.sql
    SOLO LECTURA: BEGIN READ ONLY y ROLLBACK, controles individuales que devuelven ok=true/false para existencia de 3 tablas, columnas/tipos, función, ausencia de triggers e identidad de NEX-060/066/075 en schema_migrations; comprobar NEX-082 ausente y detectar estados parciales. No hacer SELECT directo de tabla si puede no existir; usar catálogos. Sin ejecutar.

C. documentacao/banco/nexit/v1/scripts/verificar-NEX-082.sql
    SOLO LECTURA: comprobar por catálogo que existen EXACTAMENTE los 3 triggers no internos, habilitados, BEFORE UPDATE por fila, ejecutan actualizar_fecha() y coexisten con las guardas de secuencia; registrar estado schema_migrations. Detectar trigger con nombre correcto pero definición diferente, instalación incompleta y versiones inesperadas. Sin ejecutar.

D. documentacao/banco/nexit/v1/scripts/reversion-NEX-082.sql
    Reversión MANUAL independiente, NO usada automáticamente por el runner; sólo con autorización humana y backup. Prevalidar estado completo, identidad exacta y evidencia/procedencia de NEX-082; ante estado mixto o no atribuible a NEX-082 ABORTAR. Quitar sólo esos 3 triggers, sin CASCADE ni borrado de datos. Explicar conciliación MANUAL y controlada del registro schema_migrations; no borrarlo automáticamente ni modificar checksum de migraciones históricas. Sin ejecutar.

E. documentacao/testes/CASOS-NEXIT-T01-R01-NEX-082-2026-11-23.md
    Casos escritos y marcados NO EJECUTADOS: preflight faltante de tabla/columna/función, preexistencia y estado parcial, atomización del runner, NEX-082 checksum y no reaplicación, triggers efectivos con UPDATE, fe_punto_secuencias no retrocede y preserva identidad, idempotencia K1, retención de stock y compras, lock_timeout/bloqueos, rollback seguro y T01 en CI efímero. No ejecutar pruebas manuales.

## 3. Restricciones absolutas

NO editar NEX-001..NEX-081 ni sus hashes/checksums, SQL histórico o T01-estructura.sql. NO editar runner, app TypeScript/Next.js, UI, gateway, fiscal FE/NCE/CDC/KuDE, stock, compras, ACL, configuraciones, CI workflows, CLAUDE.md, PRO-357 ni otros issues. NO implementar cancelación PRO-313/199 ni otras tareas.

NO ejecutar pruebas/lint/typecheck/build/SQL/psql/migrations/manual CI, ni inspeccionar/aplicar DB real, VM, Docker, gateway SIFEN, emitir documentos, deploy, merge. GitHub Actions automáticos derivados del push son esperables: observar y reportar sus enlaces/resultados exactos. Si en CI efímero la migration se aplica por runner y T01 pasa, eso NO autoriza aplicarla en VM. El estado de la VM, y en particular la aplicación de NEX-075, NO está confirmado; no inferirlo desde la CI.

## 4. Entrega y STOP

Un único lote/commit de 5 archivos nuevos, reportar HEAD inicial, SHA final, diff/listado, casos documentados, CI automático real, pruebas manuales NO ejecutadas, riesgo/pendencias de deployment. Si alguna comprobación no puede garantizarse sin ejecutar, documentar y STOP. No iniciar R02 ni segunda tarea. PR #7 continúa DRAFT, PRO-62 In Progress. Detenerse tras el push para AUDITORÍA CHATGPT independiente antes de cualquier continuación.
