# AUD-CHATGPT — NEXIT-T01-FK-R02 / NEX-083 — 23/11/2026

**Dictamen:** **CONFORME EN EL ALCANCE AUTORIZADO Y CI AUTOMÁTICO VERDE**, **NO HOMOLOGADO EN VM**, **NO AUTORIZAR MERGE/DEPLOY/SQL OPERATIVO**. Quedan observaciones de documentación/operación para resolver antes de preparar despliegue, sin necesidad demostrada de modificar lógica fiscal.

## 1. Revisión de versión, inventario y autorización

- Repositorio `proceit-tech/distribuidora`, PR #7 DRAFT, branch `feature/NEXIT-2026-001-banco-demo`.
- Base `ec7da07cf02c627b458d76d1c8595a5644eb2322`, commit funcional Claude **`8c720f2dd4047ce97f43e5d58166778062923d9b`**. `git compare` confirmó un solo commit con **cinco archivos añadidos, cero archivos modificados**. Por tanto NEX-001..082, T01, runner, aplicación, CI workflows y `CLAUDE.md` permanecen intactos en este lote.
- Archivos añadidos: `documentacao/banco/nexit/v1/migraciones/NEX-083-fks-empresa-auditoria-preparacion.sql` (177 líneas), `scripts/preflight-NEX-083.sql` (115), `scripts/verificar-NEX-083.sql` (92), `scripts/reversion-NEX-083.sql` (97), `documentacao/testes/CASOS-NEXIT-T01-FK-R02-NEX-083-2026-11-23.md` (142).
- Orden aprobada: `documentacao/ordens/ORD-CLAUDE-NEXIT-T01-FK-R02-NEX-083-DOS-FK-2026-11-23.md`. Diagnóstico base `0a2fb78bc34b17f798ed015b407ed7f0db5b1dff` (86 tablas de empresa_id, 84 ya conformes, 2 sin FK según análisis de fuente; detector READ ONLY no ejecutado).

## 2. Auditoría estática de NEX-083

- Crea únicamente dos FOREIGN KEY declaradas, simples y explícitas `empresa_id → public.empresas(id)`, con acciones `ON UPDATE NO ACTION / ON DELETE NO ACTION`, MATCH SIMPLE y NOT DEFERRABLE:
  - `fe_estado_previo_nex065_empresa_fk` sobre `fe_estado_previo_nex065`, conservando su snapshot histórico.
  - `fe_stock_pendientes_preparacion_empresa_fk` sobre `fe_stock_pendientes_preparacion`, obligatoriamente vacía al instalar.
- La migration confirma `schema_migrations` NEX-065/081/082 con checksums predefinidos y NEX-083 ausente, tablas y columnas/tipos/PK, rol y permiso REFERENCES, ausencia de FK previas/estado parcial, inventario exacto de las dos tablas, integridad de filas de la foto y preparación vacía, bajo bloqueos. Si falla una condición se aborta en una sola transacción. Sin DML funcional, sin GRANT ni cambios a lógica FE/NCE/stock.
- `SET LOCAL lock_timeout='5s'` y bloqueos explícitos de ambas hijas y `empresas` reducen exposición a esperas; exigen ventana sin escrituras/FE en VM. El runner `aplicar-migraciones.sh` aplica migration y registro de SHA-256 en `schema_migrations` en una transacción `psql -1`. La migration no añade BEGIN/COMMIT propios.
- Postcondición catalogal: dos FK `convalidated=true`, columnas referidas y acciones correctas, cero tablas con `empresa_id` sin FK anclada. Las dos FKs generan triggers de integridad internos de PostgreSQL (no son triggers de aplicación ni se eliminan por separado).
- `preflight-NEX-083.sql` y `verificar-NEX-083.sql` están escritos como BEGIN READ ONLY/ROLLBACK. La reversión exige checksum exacto NEX-083, ambas FK sin estado mixto ni versiones posteriores, y elimina exclusivamente ambas constraints, sin `CASCADE`. Conserva el registro `schema_migrations` para conciliación humana explícita, evitando borrados silenciosos.

## 3. Evidencia de CI del commit de código

- [nexit-banco-ci run 45193311381](https://github.com/proceit-tech/distribuidora/actions/runs/45193311381): **SUCCESS**. El log verificó **M1: 83 migrations aplicadas**, **M2: 83 ya aplicadas / 0 cambios**, **M3: rechazo por checksum**, **T01: OK (8 verificaciones)**, T19/T21/T24/T27/T28/T29/T30/T32/T33, R2 y C1 OK. Total **1.125 PASS, 0 grupos con fallo** en ese runner.
- [nexit-app-ci run 45193311410](https://github.com/proceit-tech/distribuidora/actions/runs/45193311410): **SUCCESS**, siete jobs incluida puerta de liberación, lint, typecheck, casos y build Docker/Next.js.
- Hay segunda pareja de runs exitosos del mismo SHA (`45193292855` banco y `45193292756` app). Son resultados de GitHub Actions automáticos, **no homologación funcional ni simulación del estado de VM**.
- Claude declaró que no ejecutó manualmente SQL, tests, lint/build/CI, Docker ni VM; esta auditoría revisó archivos y logs mediante GitHub sin ejecutar ninguno.

## 4. Observaciones residuales

**OBS-083-01 (documentación, no bloquea CI):** la entrega afirma **70 casos documentados**, pero el archivo `CASOS-NEXIT-T01-FK-R02-NEX-083-2026-11-23.md` contiene **66 IDs únicos** `FK83-*`: A=20, B=7, C=9, D=6, E=10, F=5, G=7, H=2. Todos están escritos como NO EJECUTADOS. Corregir el conteo comunicado, no inventar cuatro casos ni modificar una migration por esta diferencia. La batería de CI tiene sus propias verificaciones automáticas: no atribuir los 66 casos manuales a CI.

**OBS-083-02 (preflight operativo, no probado):** `preflight-NEX-083.sql:81` marca `ok=false` si el `lock_timeout` de la sesión ya es `5s`. Es una condición circunstancial de configuración y **no indica incompatibilidad de esquema**, pues la migration aplica `SET LOCAL lock_timeout='5s'` bajo el runner. En ese entorno válido, el preflight podría bloquear innecesariamente la instalación. Conviene revisar su clasificación como control informativo o sustituirla por precondición relevante en una orden documental separada antes de usarlo en VM; sin ejecución SQL no está homologado. No eliminar protecciones ni aplicar por fuera del runner.
  
**OBS-083-03 (homologación VM pendiente):** el CI ejecutó las 83 migrations desde una base descartable. Sigue sin verificarse con evidencia actual la cadena NEX-065/075/080/081/082 en la VM, los datos históricos/huerfanos y la disponibilidad de ventana/backup. El preflight está escrito y no ejecutado. Un rollout con migrations pendientes anteriores puede afectar más módulos que estas dos FK; exige análisis de alcance y orden completo, actor, backup y autorización humana independiente.

**OBS-083-04 (reversión protegida, no ejecutada en CI específica):** el rollback NEX-083 está escrito con guardas, pero sus escenarios de estado parcial/procedencia, concurrencia, y reversión manual permanecen **no ejecutados**. El CI general que pasó no constituye prueba de todos esos 66 casos.

## 5. Decisión de auditoría

**Aceptar NEXIT-T01-FK-R02 / NEX-083 en alcance y CI**. Mantener PRO-363 en **In Review** a falta de prevalidación/decisión de instalación, PRO-62 In Progress y PR #7 DRAFT. PRO-357 (brecha cobertura de consulta de conteo) queda Backlog fuera de orden, PRO-361 In Review. No iniciar correctivo de código ni ejecutar SQL/VM/gateway/deploy/merge por iniciativa propia.

**Próximo gate, sujeto a autorización nueva:** evaluación de implantación controlada, lectura de versiones efectivamente aplicadas en VM y preflight de solo lectura por operador, comparación de checksums y copia de seguridad; luego autorizar por separado ejecución de migrations dentro de ventana. Tratar OBS-083-02 antes de confiar en preflight como compuerta operacional.
