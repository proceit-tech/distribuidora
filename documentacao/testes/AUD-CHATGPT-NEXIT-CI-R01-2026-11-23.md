# AUD-CHATGPT-NEXIT-CI-R01 — 23/11/2026

**Veredicto:** F001 (C1) **CONFORME en el alcance del correctivo**; F002 (UXR01-46) **CONFORME**; F003 (informe estático T01) **CONFORME**. **NO habilita merge ni implantación: T01 sigue FALLA/BLOQUEANTE.** Hallazgo de cobertura anterior C1-OBS-01 abierto, separado del lote.

## Identidad y alcance

- PR #7 DRAFT, rama `feature/NEXIT-2026-001-banco-demo`, base documental previa `0f72bd9aeeabad19d0d458bd85af96c5584112d5`, commit funcional de Claude `4227d86954af295f61e776c932a01e7873a271f8`.
- Se comparó el SHA de base con el funcional: un único commit, **5 archivos autorizados**: `documentacao/analises/NEXIT-CI-R01-T01-DIAGNOSTICO-ACTUALIZADO-AT-2026-11-23.md` (nuevo), `documentacao/banco/nexit/v1/herramientas/c1-linea-base.json`, `documentacao/banco/nexit/v1/herramientas/verificar-consultas-app.js`, `lib/ci/verificador-consultas.casos.ts`, `lib/facturacion/documentos-ux-r01.casos.ts`. Ningún archivo de lógica empresarial/fiscal, API, consulta productiva, migration, test T01, CSS ni VM alterado.
- Orden rectora: `documentacao/ordens/ORD-CLAUDE-NEXIT-CI-R01-C1-T01-UX-2026-11-23.md`.

## F001 — SQL C1: CONFORME en alcance

- El baseline pasó de **57 a 54 registros** (cuatro entradas añadidas, siete retiradas: seis de `lib/reportes/lotes.ts` que pasan a ser verificables/interpretadas y la identidad anterior de una consulta de `lib/stock/shared.ts`). Cuatro nuevas clasificaciones NO VERIFICABLES llevan id/motivo y justificación de causa en `revisiones`. No se tocaron SQL productivos.
- `--actualizar-linea-base` conserva el historial de revisiones previamente documentado; esta auditoría no valida futuros usos de ese flag ni acepta inclusiones sin nueva revisión.
- Se añadieron seis comprobaciones enfocadas sobre casos de marcador calculado, llamadas entre funciones, las cuatro altas, siete bajas, integración real de lotes y el filtro de stock. El CI del SHA funcional corroboró C1 PASS: 325 consultas literales, 73 reconstruidas con 389 variantes, 11 anfitrionas, 7 interpretadas, **54 NO VERIFICABLES** con cero nuevas/cero obsoletas. El resultado C1 no significa que las 54 SQL dinámicas fueron probadas por PostgreSQL.
- **C1-OBS-01 (riesgo residual previo, no demostrado como defecto SQL):** `lib/movimientos/historial.ts:94`, propiedad `conteo.sql` de `construirConsultas`, compone `SELECT count(*)...${base}` (base incluye `FROM_FILAS` y `f.sql`), y el C1 no reporta ni verifica esa consulta. La lista `historial.ts:96` sí queda catalogada NO VERIFICABLE. Se necesita una etapa separada con autorización para cerrar la cobertura del conteo, con pruebas de la construcción real y sin modificar la consulta funcional por hipótesis. No calificarla como PASS verificado; no afirmar que contiene SQL incorrecto sin evidencia.

## F002 — UXR01-46: CONFORME

- El CSS local de Documentos es importado tanto por `page.tsx` como por `cancelacion-modal.tsx`. Las clases `cancelacionFondo`, `cancelacionCaja`, `campoMotivo` y `campoConfirmacion` están declaradas y utilizadas por el modal; el test previo las confundía con huérfanas.
- El caso nuevo inspecciona archivos TS/TSX consumidores reales con importación explícita, comprueba huérfanas, referencias rotas y accesos calculados, y agrega cinco comprobaciones focales del comportamiento del inventario. No se alteró el diseño, el CSS ni el cancelamiento operativo. CI suite UXR01-46 PASS.

## F003 — T01: DIAGNÓSTICO CONFORME, COMPuERTA ABIERTA/BLOQUEANTE

- El informe documenta omisiones de `<tabla>_actualizado_trg` sobre `compras_entradas_intenciones` (NEX-075), `fe_punto_secuencias` (NEX-060), `movimientos_intenciones` (NEX-066), contrastadas con criterio de `T01-estructura.sql:23–36` y `actualizar_fecha()` de NEX-001.
- NEX-055 cubría exactamente otras tres tablas, no estas. La migración candidata debe ser **nueva e incremental**, con preflight de existencia/duplicidad, protección de locks, rollback y revisión separada de no regresión de secuencias/K1. No ejecutar modificación de esquema ni SQL de escritura hasta autorización expresa. Si el esquema de la VM tiene migrations diferentes de CI, falta verificarlo **solo por operador autorizado**; la frase documental sobre NEX-075 «no aplicada en VM» se basa en documentación histórica, no en consulta actual de la VM.
- La secuencia NEX-082 **no aparece en el árbol de migrations del SHA auditado** (el último nombre listado es NEX-081), pero **no está reservada** ni es evidencia de disponibilidad en VM. Confirmar identificador y cadena de precondiciones en la orden posterior; no aplicar a sistema productivo antes de homologación.
- **Fallo real del CI**: `T01-estructura.sql` sigue en FAIL, es un control correcto y no debe relajarse.

## GitHub Actions observados, sin ejecución del auditor

- [nexit-app-ci run 45176204850](https://github.com/proceit-tech/distribuidora/actions/runs/45176204850): siete jobs SUCCESS; 6.763 comprobaciones, cero fallas e inventario completo en suite de casos.
- [nexit-banco-ci run 45176204839](https://github.com/proceit-tech/distribuidora/actions/runs/45176204839): C1 OK, 1.115 verificaciones PASS, una prueba-grupo FALLA (T01). No informar CI total verde.
- Claude informó no haber ejecutado tests, lint, build, SQL, VM ni DB manualmente. Los checks de CI fueron automáticos. ChatGPT inspeccionó código/documentos/logs de GitHub, **sin ejecutar** aplicación/SQL/pruebas/deploy.

## Decisión y continuación

**Aceptar F001/F002/F003 en alcance de la orden NEXIT-CI-R01; mantener PRO-62 In Progress y PR #7 Draft** por T01 y C1-OBS-01. No abrir correctivo automático por C1-OBS-01, no reabrir motor fiscal PRO-313/342, no fusionar el PR. Próximo paso **sujeto a nueva autorización expresa del responsable**: diseño e implementación versionada de nueva migration de triggers T01 (sin aplicarla en VM), más una tarea separada y acotada de cobertura para `historial.ts:94`. La preparación y prueba en banco efímero se autorizan por separado si el responsable lo decide. La ejecución de una migration en VM nunca está implícita en autorizar su escritura.
