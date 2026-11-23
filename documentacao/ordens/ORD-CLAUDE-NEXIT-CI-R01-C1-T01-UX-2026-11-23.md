# ORDEN ÚNICA CLAUDE — NEXIT-CI-R01 — C1 / UXR01-46 / T01 (23/11/2026)

## 0. Autorización, base y alcance

**Autorización del responsable:** actualizar GitHub y Linear, analizar las fallas verificadas y enviar una instrucción focal a Claude. **Única orden activa después de esta publicación:** NEXIT-CI-R01. Suspender el inicio de órdenes históricas/en cola; PRO-130/131/132-R02 conserva su situación de revisión, sin reabrir secuencias ni declararla homologada. Esta orden no autoriza tareas PRO-313/199 ni reabrir PRO-342/195/354 ni NEXIT productivo.

- Repo: \`proceit-tech/distribuidora\`.
- PR **#7 DRAFT**: https://github.com/proceit-tech/distribuidora/pull/7
- Rama: \`feature/NEXIT-2026-001-banco-demo\`.
- Base de código auditada: \`f15a2b2c2558a654ff4b0992203efe40d6cebef4\`, PRO-313-R01/PRO-199. Antes de editar, comprobar HEAD real, leer los archivos completos más recientes **uno por vez**, identificar diferencias respecto de esta base y detenerse si hay otro trabajo activo incompatible.
- CI automático fallido de esa base: app https://github.com/proceit-tech/distribuidora/actions/runs/44791652107 ; banco https://github.com/proceit-tech/distribuidora/actions/runs/44791651890 .
- GitHub Actions autoejecutó casos del PR. **Claude NO ejecutó manualmente** pruebas, SQL ni build según su entrega; no confundir ambos hechos. Este correctivo conserva la prohibición de ejecutarlos manualmente.

## 1. Diagnóstico independiente, confirmado en logs y fuentes

**F-C1 (P0 / calidad de SQL):** \`nexit-app-ci\`, suite CI verificador C1, falló en el caso «ninguna consulta nueva sin verificar fuera de la línea base y ninguna entrada obsoleta»: esperado \`[0,0,true]\`, obtenido \`[4,7,false]\`. \`nexit-banco-ci\` reportó 463 consultas analizadas, 325 literales válidas, 73 reconstruidas / 389 combinaciones PREPARE sin fallas, 11 anfitrionas válidas, 7 interpretadas / 111 combinaciones, 54 NO VERIFICABLES; **4 nuevas** fuera de la línea base:
1. \`app/api/proveedores/[id]/route.ts:313\` — \`columnas.length + 3\`;
2. \`lib/facturacion/shared.ts:268\` — \`f.sql\`;
3. \`lib/movimientos/historial.ts:96\` — \`SELECT_FILAS.slice(0, SELECT_FILAS.indexOf("FROM movimientos_inventario m"))\`;
4. \`lib/stock/shared.ts:34\` — \`filtro\`.
Siete entradas de línea base ya obsoletas, seis en \`lib/reportes/lotes.ts\` y una en \`lib/stock/shared.ts\`. Fuente: \`documentacao/banco/nexit/v1/herramientas/verificar-consultas-app.js\`, \`c1-linea-base.json\`, \`lib/ci/verificador-consultas.casos.ts\`. **No hay evidencia de cuatro consultas SQL inválidas: es falta de cobertura verificable del analizador/baseline**. No convertir «NO VERIFICABLE» en PASS silencioso.

**F-T01 (P0 / esquema, no corregir con excepción):** \`nexit-banco-ci\`, \`documentacao/banco/nexit/v1/pruebas/T01-estructura.sql:23–36\` detecta realmente \`actualizado_at\` sin \`<tabla>_actualizado_trg\` en:
- \`compras_entradas_intenciones\`;
- \`fe_punto_secuencias\`;
- \`movimientos_intenciones\`.
\`NEX-055\` cubre deliberadamente **sólo** \`fe_gateway_config\`, \`documentos_electronicos\`, \`fe_puntos_expedicion\`, y avisa si quedan otras tablas. \`NEX-060\` crea \`fe_punto_secuencias\` con \`actualizado_at\` y triggers de otras finalidades, pero sin ese trigger específico; esto no demuestra que debamos reemplazar T01. La solución de esquema, si necesaria, exige **nueva migration incremental, reversión y autorización separadas**, con revisión de reglas de inmutabilidad/concurrencia/actualizaciones explícitas. NO escribir SQL ejecutable, alterar T01 para permitir excepciones ni aplicar migrations en esta orden. Documentar causa exacta y propuesta mínima por tabla.

**F-UXR01-46 (P1 / falso positivo del caso):** el test \`lib/facturacion/documentos-ux-r01.casos.ts:202–206\` enumera clases de \`app/(private)/documentos/page.module.css\` y exige que todas aparezcan en \`page.tsx\`. Pero \`cancelacionFondo\`, \`cancelacionCaja\`, \`campoMotivo\`, \`campoConfirmacion\` **se usan efectivamente** en \`app/(private)/documentos/cancelacion-modal.tsx\` importando el mismo módulo CSS. Todas las clases de \`page.tsx\` sí existen en CSS. Ajustar únicamente la cobertura del caso: inventario de clases por archivos consumidores reales (page.tsx + cancelacion-modal.tsx y otros consumidores directos verificados), preservar control de referencias inexistentes/clases huérfanas, contemplar selectores sin confundir números hexadecimales/pseudo-clases. **No cambiar la interfaz ni eliminar el modal/CSS válido para satisfacer el test.**

**Otras pruebas de CI, contexto no bloqueante:** build, typecheck, lint, Docker y PRO-313-R01 pasaron en la ejecución automática; \`nexit-banco-ci\` confirmó instalación de 81 migraciones en banco de pruebas, T19/T21/T24/T27–T34 y otras pruebas pasaron. Ninguna prueba del CI acredita aplicación de SQL, versión de la VM o gateway reales.

## 2. Trabajo autorizado — único lote focal

1. **C1:** leer verificador, línea base y código real de cada una de las cuatro consultas. Identificar por elemento si la expresión es reconstruible de forma exacta, una combinación dinámica cerrada o genuinamente NO VERIFICABLE. Reparar verificador/casos cuando esté justificado; revisar las 7 entradas obsoletas, actualizar la línea base solo mediante procedimiento documentado de identidad/hash y justificación por entrada. No reducir severidad ni añadir comodines a la allowlist, no ocultar SQL malformado, no usar fallback de ámbito global entre archivos, no editar SQL funcional para agradar un parser. Preservar regresiones para nombres homónimos/variantes reales, falsos positivos y falsos negativos.
2. **UXR01-46:** modificar exclusivamente el test de inventario CSS para que considere el consumidor real \`cancelacion-modal.tsx\` además de \`page.tsx\`, sin desactivar la comprobación de clases no definidas y huérfanas. Escribir casos que fallen ante una clase realmente ausente o realmente no usada.
3. **T01:** producir **diagnóstico técnico y propuesta documental**, individual por tabla: migración creadora, función \`actualizar_fecha()\`, triggers existentes, seguridad de crear otro trigger y efectos sobre actualizaciones, inmutabilidad, locks y reversión. Si una solución requiere SQL/migration, **DETENER ESA PARTE** y solicitar autorización separada. No introducir falsos PASS ni alterar definición T01.
4. **Resultado parcial esperado:** C1 y UXR01-46 preparados para PASS en el CI automático; **T01 puede permanecer FAIL hasta decisión de migration**. No etiquetar todo el pipeline como aprobado mientras T01 falle. Cualquier otra falla que aparezca debe informarse, no corregirse fuera de alcance.

## 3. Archivos permitidos y límites

Permitidos con diff estrictamente necesario: \`documentacao/banco/nexit/v1/herramientas/verificar-consultas-app.js\`, \`documentacao/banco/nexit/v1/herramientas/c1-linea-base.json\`, \`lib/ci/verificador-consultas.casos.ts\`, \`lib/facturacion/documentos-ux-r01.casos.ts\` y un solo informe documental bajo \`documentacao/analises/\` si realmente se necesita para T01. Si se necesita otro archivo para los casos del C1, justificar ruta y cambio antes de editar.

**PROHIBIDO:** ejecutar manualmente tests/lint/typecheck/build/CI, SQL/psql/migrations, Docker/VM, gateway/HTTPS SIFEN, emit/consultar/cancelar documentos reales, tocar DB real, alterar migrations históricas/checksums, crear migration ejecutable, generar scripts/monitores adicionales, modificar código comercial/fiscal/stock/KuDE/FE/NCE, cambiar ACL/gates de cancelación, reescribir \`CLAUDE.md\`, hacer merge o deploy. El push activa CI **automático** existente, cuyos resultados debe reportar sin lanzar ejecuciones manuales. No tocar BSERP/FACTUNEX/TERPORT.

## 4. Condiciones de aceptación y entrega

- C1 clasifica de manera auditable las 4 nuevas ocurrencias y 7 obsoletas, sin aprobar código no verificable por mera conveniencia. Inventario C1 y clasificación con evidencia; mantener todas las consultas y comportamientos reales.
- UXR01-46 valida las 4 clases del modal y continúa rechazando referencias ausentes u hojas con clases huérfanas reales.
- T01 conserva el fallo como bloqueante hasta tener una solución segura autorizada. Informe por tabla, impacto y orden propuesta, sin SQL ejecutable.
- Sin pérdida de cobertura de NEXIT, número fiscal, multiempresa, CDC literal API, histórico, idempotencia y stock.
- Publicar **un solo lote**, listado exacto de archivos/diff, conteo de casos añadidos/modificados, SHA completo del commit, enlaces de CI automático y su resultado real, nota «ejecución manual de tests/lint/build/SQL: NO realizada», bloqueos residuales.
- **STOP ABSOLUTO tras publicar** para auditoría independiente de ChatGPT. No iniciar PRO-313, PRO-199, PRO-342, PRO-130/131/132, UX-R02 o implementación de T01, ni declarar Done/homologado.

**Control de cambios:** este documento y la instrucción más reciente expresamente aprobada sustituyen temporalmente la indicación de «orden única activa» de banners históricos anteriores de \`CLAUDE.md\`. Las reglas de seguridad y las dependencias funcionales NO se revocan.
