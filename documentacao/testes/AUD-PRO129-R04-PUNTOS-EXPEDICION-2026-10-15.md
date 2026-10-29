# AUD-PRO129-R04 — NEX-059, cierre de carrera UPDATE establecimiento vs alta

**Fecha:** 2026-10-15. **SHA auditado:** `01968aeb1b42831d901515a09cb461b1ca0979c7`. **Rama oficial:** `feature/NEXIT-2026-001-banco-demo`. **Resultado:** **corrección SQL técnicamente conforme**, pero **CI FALLÓ por dos expectativas incorrectas en T20**: no cerrar PRO-129 ni aplicar migrations en VM hasta corrección localizada y CI sin fallas.

## Fuentes y límites de verificación
Se consultaron protocolos `CLAUDE.md` y `documentacao/PROTOCOLO-IA.md`, AUD-PRO129-R03, `PROGRESSO-NEXIT-V1.md`, diff, NEX-057/058/059, la reversión de NEX-059 y los escenarios de concurrencia T20. **GitHub Actions automático [run 38772249575](https://github.com/proceit-tech/distribuidora/actions/runs/38772249575)** se consultó una vez. El job `116550799473` terminó `failure`; **59 migrations instaladas** con éxito en PostgreSQL descartable, T19 **78 PASS**, T11/T17 PASS; T20 **FALLA** por los dos asserts detallados más abajo. Total del reporte: **665 verificaciones PASS; 1 prueba T20 con falla**, sin ejecución en VM/PG operacional ni gateway real por el auditor. Los tests focales, mutación y tsc/ESLint de Claude son reportados, no reejecutados por ChatGPT.

## R03-01 — revisión del código: CORREGIDO

La función reemplazada por NEX-059 conserva firma, `SECURITY DEFINER`, `search_path`, permisos, confirmación, validación de secuencia, bitácora y comprobación de identidad. Ahora realiza `SELECT establecimiento_sifen, activo ... FOR SHARE` sobre la fila de `sucursales` **antes** de obtener `v_est` definitivo, tomar `fe_punto_bloquear_identidad`, comprobar `fe_punto_identidad_en_uso` e insertar el punto inactivo. `FOR SHARE` choca con el UPDATE de establecimiento y dura hasta fin de transacción. Las dos secuencias de carrera A/B del T20 se completaron hasta sus comprobaciones finales, sin errores de lock, timeout o deadlock reportados. El camino de UPDATE conserva el trigger de NEX-058. La prueba de comportamiento no indica pérdida de número, emisión ni punto huérfano. **No se identificó motivo para modificar otra vez la lógica fiscal**.

NEX-059 es **incremental**, no edita NEX-001..058. Comprueba las funciones de dependencia `fe_punto_crear`, `fe_sucursal_establecimiento_protegido` y `fe_punto_identidad_en_uso`; marca la función con `COMMENT NEX-059` para prevención de doble aplicación, y el script de reversión restaura expresamente el cuerpo NEX-057 (reabre la carrera; solo uso manual autorizado).

## AUD-PRO129-R04-01 — TESTE, CORRECCIÓN MENOR OBLIGATORIA

[CI run 38772249575, job 116550799473](https://github.com/proceit-tech/distribuidora/actions/runs/38772249575): `T20-concurrencia-puntos.sh` retorna:

- `orden A: ... (obtenido=7/false, esperado=7/f)`
- `órdenes A y B: ... (obtenido=10/true, esperado=10/t)`

Las consultas `SELECT ultimo_numero||'/'||activo` convierten el boolean a texto mediante concatenación, que genera **`false`/`true`**, no la representación tabular `f`/`t`. El valor numérico **sí coincide**. **Reparación mínima:** cambiar las dos expectativas de `T20-concurrencia-puntos.sh` a `7/false` y `10/true` (o hacer cast y formato explícito y coherente). Mantener las otras verificaciones del T20 (dos órdenes, bloqueo real, mensajes, no punto huérfano ni documento) intactas. No modificar NEX-059 ni crear NEX-060 por este fallo de test.

**Criterio de cierre:** commit/push con solo corrección de T20 (y progreso canónico si amerita); validación sintáctica y test focal, después **CI automático** con T20 + T19 aprobado sin fallas; pausa para AUD-PRO129-R05. Claude NO debe lanzar ni monitorizar manualmente el CI ni ejecutar suite completa/build global.

## Condición de homologación operativa

NEX-057 fue **editada en Git** después de su primera publicación; siguen **desconocidos en VM** los registros/checksums reales de NEX-056/057/058/059. La NEX-059 requiere la versión corregida de NEX-057; si el histórico real contiene la primera NEX-057, no se deben aplicar ciegamente las migrations siguientes. El responsable humano confirmará `schema_migrations`, diferencias/checksums, backup y el ambiente del gateway antes de cualquier deploy o emisión. Ninguna migration se aplicó en VM durante esta auditoría. Los últimos números emitidos por otros sistemas se siguen confirmando manualmente.

**Veredicto:** NEX-059 **APROBADA EN REVISIÓN ESTÁTICA**, pero **PRO-129 sigue In Review por CI rojo de T20**. PRO-128 no iniciada por Claude; no autorizada en esta respuesta, a la espera de aceptación final de PRO-129.
