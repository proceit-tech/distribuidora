# AUD-CHATGPT — diagnóstico NEXIT-T01-FK-R01 / PRO-363 — 23/11/2026

**Resultado:** diagnóstico de Fase 1 **CONFORME por inspección estática**. Es correcto que el alcance anterior (una tabla) era insuficiente: el inventario identifica **dos tablas creadas sin FK anclada en empresa_id**. **No se ejecutó** el detector contra PostgreSQL, ni pruebas, SQL, CI manual, VM o gateway. La conclusión exhaustiva de 86 tablas es resultado del inventario del Claude y **no está corroborada por consulta de catálogo ejecutada**; verificarla con CI automático y su evidencia al publicar.

## Fuente auditada

- Commit `0a2fb78bc34b17f798ed015b407ed7f0db5b1dff`, PR #7 DRAFT, dos archivos nuevos: `documentacao/analises/NEXIT-T01-FK-R01-DIAGNOSTICO-FK-EMPRESA-2026-11-23.md` (165 líneas) y `documentacao/banco/nexit/v1/scripts/diagnostico-T01-FK-01.sql` (125 líneas), BEGIN READ ONLY/ROLLBACK, no escrito para alterar datos.
- El diagnóstico static reporta 103 tablas, 86 con empresa_id, 84 con FK y 2 incumplidoras. Su detector prepara comparación literal con `T01-estructura.sql:38–45` y catálogo `pg_class/pg_attribute/pg_constraint` para enumerar tablas, validación de FKs y huérfanos, y diferenciar tablas inesperadas.
- `NEX-065-facturacion-estado-por-tipo.sql:41–56` crea `public.fe_estado_previo_nex065` con `empresa_id uuid NOT NULL`, PK `(empresa_id,punto_id,tipo_documento)` y **ninguna FK**. La carga procede de JOIN `fe_punto_secuencias`/ `fe_puntos_expedicion` por `empresa_id`. Tabla de foto de auditoría, sin acceso de runtime; se usa en verificaciones/reversión de NEX-065.
- `NEX-081-facturacion-politica-stock-pendientes.sql:195–201` crea `public.fe_stock_pendientes_preparacion`, `empresa_id uuid NOT NULL`, PK `(txid,empresa_id,clave)` y **ninguna FK**. Es tabla de preparación interna usada exclusivamente durante una emisión con stock pendiente. La función fiscal crea y elimina su fila en la misma transacción; no se permite acceso directo a runtime.
- La comprobación T01 requiere `conkey[1] = attnum(empresa_id)`: una FK simple `(empresa_id) REFERENCES public.empresas(id)` satisface el criterio en ambas tablas. No se necesita agregar FK compuesta fiscal (que podría retener otras dependencias innecesarias) ni alterar T01.

## Recomendación auditada para ampliación de alcance

Se recomienda autorizar **solo la autoría** de NEX-083 incremental para exactamente ambas FK, más diagnóstico, preflight/verification READ ONLY, reversión protegida y casos documentados NO EJECUTADOS. **No aplicación en VM**, ninguna edición histórica o app; el push dispara CI automático habitual.

Requisitos críticos:
1. Preflight fail-closed y catálogo: verificar que no existan otros incumplimientos ni FKs previas; NEX-065, NEX-081 y NEX-082 registradas; ambas tablas/columnas/PK/estructura correctas; empresas(id) referenciable; sin filas huérfanas o estado parcial. El detector de catálogo NO se ejecutó: si el CI revela otros casos, no forzar PASS ni extender alcance por iniciativa propia.
2. La foto `fe_estado_previo_nex065` tiene filas históricas: verificar huerfanos y posibles efectos de nuevas restricciones sobre la eliminación de empresas (por defecto NO ACTION). No borrar ni corregir empresas, fotos ni stock.
3. La preparación `fe_stock_pendientes_preparacion` debe estar vacía para instalación; el alta de FK requiere coordinación con ventana sin emisión y bloqueos de tabla hija + `empresas`.
4. Las dos FKs deben quedar VALIDATED (no NOT VALID permanente); un solo runner transaction + checksum + lock_timeout local corto; sin cambiar lógica FE/NCE, numeración, idempotencia, grants o funciones.
5. Reversiones NEX-065/NEX-081 borran las respectivas tablas hijas, lo cual eliminaría sus FK; por control de cadena de migration, revertir NEX-083 primero y conciliar schema_migrations de forma autorizada. No modificar los scripts históricos. En caso de versiones posteriores o procedencia dudosa, STOP.
6. El CI automático del commit de NEX-082 (nexit-app-ci 45181332098 SUCCESS; nexit-banco-ci 45181332161 T01 FK FAIL) es evidencia; un eventual PASS del CI nuevo no acredita VM homologada.

**Dictamen:** PRO-363 puede avanzar con una orden **nueva y explícita** de alcance ampliado a dos FKs. La orden histórica restringida a una tabla se debe conservar como antecedente, no editar silenciosamente. No autoriza merge/deploy/SQL operativo ni iniciar PRO-357.
