# AUD-NEXIT-CASA-MINGO-E06-E07-E08-R02 — Reauditoría de PRO-210 / PRO-211

**Fecha:** 21/10/2026  
**Repositorio / branch:** `proceit-tech/distribuidora` / `feature/NEXIT-2026-001-banco-demo`  
**Commits correctivos:** `c4ab4638dcfe6da442734b49ceb2570ede39cd49` (correcciones funcionales) y `0392193f4d08c01c01e083f69675dd177aff7195` (pruebas y extracción de lógica).  
**Auditoría anterior:** `documentacao/testes/AUD-NEXIT-CASA-MINGO-E06-E07-E08-R01-2026-10-21.md`.

## Alcance, método y veredicto

Se leyeron los protocolos actuales `CLAUDE.md` y `documentacao/PROTOCOLO-IA.md`, el progreso pertinente y el checklist CASA MINGO, ambos commits/diffs y los archivos modificados de pantalla, servicio y tests. Se contrastó el contrato de saldo con NEX-062/NEX-070. No se modificó código, no se accedió a VM, PostgreSQL, Docker, gateway ni navegador; no se ejecutaron suites locales por el auditor. Los resultados 26/0, 205/0, 31/0 y 23/0, así como TypeScript/ESLint focales, **son resultados declarados por Claude, no reproducidos de forma independiente**.

**DICTAMEN R02: PRO-210 y PRO-211 CORREGIDOS EN REVISIÓN ESTÁTICA. Sin nuevos defectos funcionales demostrados en el diff auditado. No hay otra implementación autorizada. El gate operativo/homologación sigue PENDIENTE:** el SQL del listado no se ha ejecutado contra PostgreSQL, y las pruebas reales de navegador/gateway/SIFEN aún dependen del responsable humano. **No equivale a homologado ni a puntuación 10/10.**

## Matriz de verificación

| Criterio R01 | Implementación revisada | Evidencia / resultado |
|---|---|---|
| PRO-210 A–D: restaurar cantidad 2 de 5, fracción 2,5, monto 1000, respetar otras líneas | `restaurarEntradas` conserva `entradas`, inicializando solo entradas inexistentes; `page.tsx` la invoca al restaurar y limpia `eliminadas` | `nce-correcciones-r01.casos.ts` ejecuta `eliminarSeleccionadas`, `restaurarEntradas` y `armarCuerpoNce`; cobertura focal adecuada, revisada estáticamente |
| PRO-210 E: precarga de NCE rechazada | `eliminadasPorPrecarga` y precarga conservan valores preexistentes; restaurar no sobrescribe campos de `entradas` | Test de valores de precarga. **Reserva de cobertura:** el test reaplica `eliminadas0` manualmente para verificar las líneas del cuerpo; por sí mismo no demuestra el estado de exclusión resultante del clic real de «Restaurar», que sigue siendo una acción global |
| PRO-210 F: no emitir cuerpo obsoleto | `armarCuerpoNce` y `cuerpoRevisadoVigente` extraídos y utilizados por la pantalla; handlers siguen invalidando `revisado`; `Emitir` envía el cuerpo previamente revisado | Test focal ejecuta las funciones de producción, además de una comprobación textual del enlace de la UI; sin browser real |
| PRO-211 A–G: saldo global exacto; solo aprobadas | `saldoGlobalFe` usa decimal exacto, `leerFacturaOriginal` emplea la función; SQL del listado suma `nce_lineas` y `nce_descuentos` filtrados por `estado_sifen='APROBADO'` | Los tests ejecutan `saldoGlobalFe` con NCE parcial/total/combinada, pendiente, rechazada y decimales. La función **no ejecuta el SQL** de la listagem; el SQL tiene validación estática |
| PRO-211 H: NEX-070 ausente | `hayTablaDescuentos` consulta `to_regclass` y excluye completamente el término SQL de `nce_descuentos` si no existe | Test captura consultas emitidas para ambos estados y verifica ausencia de referencia a tabla faltante |
| PRO-211 I: aislamiento, filtros, orden y paginación | SQL mantiene `empresa_id`, `sucursal_en_alcance`, cliente, búsqueda, `LIMIT/OFFSET` y `count(*) OVER()` | Tests verifican SQL/parámetros, **no la ejecución/resultado del plan SQL** sobre filas reales |
| E08, migraciones e inventario fuera de alcance | Diff correctivo sin cambios en KuDE, gateway, NEX-070 ni inventario | Conforme al alcance |

## Riesgos y pruebas operativas que siguen abiertas

1. **Consulta SQL de PRO-211 no ejecutada en PostgreSQL:** los dobles de `db.query` entregan filas ya calculadas; no prueban que PostgreSQL calcule correctamente `acreditado`, filtro, conteo y paginación. Validar con datos controlados y comprobación de que el saldo real no se consume por NCE pendientes/rechazadas, solamente cuando el responsable autorice la operación.
2. **PRO-210 UI real no probada:** verificar eliminación/restauración de cantidades y montos, revisión vigente y precarga de NCE rechazada en navegador del ambiente operacional, sin asumir que exista staging.
3. **Migraciones NEX-067/068/069/070 y contrato fiscal/gateway:** el estado no aplicado se basa en el último reporte, no en acceso a VM. Su verificación, backup/preflight, ejecución y validación corresponden exclusivamente al responsable humano; el IVA 10% fijo en FE a 5%, exenta/mixta sigue sin certificación fiscal.

## Conclusión / próxima responsabilidad

No solicitar nuevas correcciones al Claude en PRO-210/PRO-211 por esta R02: los defectos R01 están reparados a nivel de código y la mejora de cobertura sí usa los helpers de producción. **Mantener «código corregido, auditoría estática R02 conforme; operación no homologada».** No iniciar E10, otros menús, migrations ni deploy desde una IA. El responsable humano decide el gate de implantación/homologación del sistema real. No marcar tareas Done ni Homologado.
