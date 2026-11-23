# AUD-CHATGPT — NEXIT-T01-R01 / NEX-082 — 23/11/2026

**Veredicto:** **CONFORME en el alcance autorizado de autoría y en la corrección de los 3 triggers**, **NO HOMOLOGADO COMO CI COMPLETO**, **NO AUTORIZAR MERGE/DEPLOY/VM**. El control de triggers T01 ya pasó en PostgreSQL efímero; otro control distinto, FK de aislamiento por empresa, sigue FAIL. No confundir conformidad del lote con cierre de PRO-62 o de T01.

## Trazabilidad y diff

- Repo `proceit-tech/distribuidora`, PR #7 DRAFT, rama `feature/NEXIT-2026-001-banco-demo`.
- Base previa `d8167a91bb780c6b8d98477c102ae3848130d23d`; SHA funcional auditado `24bb7022687d6125d6f2326bad744c9ef7b7a029` (un commit; cinco archivos **nuevos**, sin ediciones de migraciones históricas).
- Archivos: `migraciones/NEX-082-triggers-actualizado-intenciones-secuencias.sql`, `scripts/preflight-NEX-082.sql`, `scripts/verificar-NEX-082.sql`, `scripts/reversion-NEX-082.sql`, `documentacao/testes/CASOS-NEXIT-T01-R01-NEX-082-2026-11-23.md`, bajo `documentacao/banco/nexit/v1/` para los cuatro SQL.
- No se cambió `T01-estructura.sql`, aplicación, facturación/stock, runner, NEX-001..081, ni configuración de VM. Los casos de regresión de entrega están escritos, no ejecutados manualmente.

## NEX-082: auditoría del alcance

- Agrega SOLO `BEFORE UPDATE FOR EACH ROW` a `fe_punto_secuencias`, `movimientos_intenciones` y `compras_entradas_intenciones`, función oficial `public.actualizar_fecha()`. No altera datos/grants/índices/CDC/stock/números.
- Guardas de dependencia del esquema, `schema_migrations` NEX-060/066/075 y NEX-082 no registrada, función NEX-001, identidad de los triggers y ausencia de estado parcial; aborta en caso inesperado. Compatibilidad con `fe_punto_secuencias_inmutable_trg` y `fe_punto_secuencias_truncate_trg` protegida. `SET LOCAL lock_timeout = '5s'`; runner aplica migration + registro checksum en una transacción.
- Preflight/verification READ ONLY, reversión manual protegida con exigencia de checksum exacto NEX-082, sin borrar automáticamente registro ni triggers de terceros. Reversión y cambio del registro de migrations requieren autorización expresa y reconciliación operacional.
- El CI automático confirmó instalación de 82 migrations y PASS del chequeo específico de triggers. No demuestra que los escenarios escritos de rollback y concurrencia fueron ejecutados manualmente ni la compatibilidad con la VM operativa.

## Evidencia CI del commit

- [nexit-app-ci 45181332098](https://github.com/proceit-tech/distribuidora/actions/runs/45181332098): siete jobs SUCCESS, incluida la compuerta de liberación de aplicación.
- [nexit-banco-ci 45181332161](https://github.com/proceit-tech/distribuidora/actions/runs/45181332161): M1 instala **82 migrations**, M2/M3 y C1 PASS; **1116 verificaciones PASS / 1 grupo FAIL (T01)**. En el paso T01, no aparece ya fallo de triggers, pero sí `T01-estructura.sql:45 ERROR: FALLA: toda tabla con empresa_id tiene una FK anclada en empresa_id (aislamiento referencial)`.
- PostgreSQL del CI es descartable. Resultado FAIL sigue bloqueante; no afirmar CI total verde.

## Hallazgo nuevo: T01-FK-01 (fuera de NEXIT-T01-R01)

La aserción de `documentacao/banco/nexit/v1/pruebas/T01-estructura.sql:38–45` exige que **cada tabla de public con columna empresa_id** tenga al menos una FOREIGN KEY que comience por empresa_id, para proteger aislamiento referencial.

**Causa concreta demostrada en fuente:** `NEX-081-facturacion-politica-stock-pendientes.sql:195–201` crea `public.fe_stock_pendientes_preparacion` con `empresa_id uuid NOT NULL` y `PRIMARY KEY (txid, empresa_id, clave)`, pero **sin FOREIGN KEY** ni `REFERENCES public.empresas`. La revisión del resto del archivo NEX-081 no encontró ALTER de esa tabla que agregue la FK. Por tanto **esta tabla viola necesariamente el predicado de T01 en una instalación NEX-081/NEX-082 estándar**, salvo que otro archivo/version introduzca FK adicional. El CI no enumera el conjunto completo de tablas faltantes, así que **no está probado que ésta sea la única**. No se diagnostica ni corrige otra tabla por adivinación.

**Importante:** `fe_stock_pendientes_preparacion` es una tabla interna transitoria por transacción de emisión; la ausencia de FK es un riesgo estructural, pero los logs no acreditan datos empresariales contaminados ni comportamiento fiscal incorrecto. Evaluar el impacto de agregar FK en emisión, bloqueos, referencias, transacciones y reversión antes de escribir la corrección.

### Recomendación para futura orden separada, AÚN NO AUTORIZADA

1. Inventariar de forma exhaustiva (solo lectura/CI efímero, con autorización si implica ejecución) **todas** las tablas sin FK anclada en empresa_id, mostrando tabla, FK existente y migration origen, sin tocar datos; cotejar catálogo y fuentes NEX-001..082.
2. Si el único caso es `fe_stock_pendientes_preparacion`, preparar **nueva migration incremental** (número a confirmar libre después NEX-082) que incorpore exclusivamente la FK requerida hacia `public.empresas(id)`, con preflight, backfill **NO** por defecto, check de filas huérfanas, reversión protegida, ventana de emisión, locks y caso de regresión. Si hay varias tablas, decidir alcance y dependencias separadamente, sin cambiar estructura por suposición.
3. **NO** editar NEX-081 ni NEX-082 históricas/checksums, **NO** relajar T01, **NO** añadir excepción por ser tabla temporal en uso; no modificar motor fiscal/stock.
4. Repetir CI automático tras autorización y publicación. Un PASS en CI no habilita migración de VM; el estado actual de NEX-075/081/082 en la VM no ha sido comprobado en esta auditoría.

## Decisión

- Aceptar el lote NEXIT-T01-R01 **en su alcance**: autoría de cinco archivos y solución de tres triggers, con CI de aplicación PASS.
- Mantener **PRO-361 en In Review** (entrega auditada, no homologación de instalación), PRO-62 In Progress, PR #7 DRAFT.
- Registrar aparte T01-FK-01 para futura autorización; no emitir aún orden de implementación de NEX-083 ni iniciar PRO-357.
- ChatGPT realizó revisión documental y lectura de logs GitHub: **no ejecutó SQL, tests, Docker, VM, CI ni gateway**.
