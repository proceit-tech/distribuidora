# AUD-PRO129-UX-R03 — Reauditoría de disponibilidad por tipo y diagnóstico de migrations

**Fecha:** 2026-10-17. **Estado:** **R02-01 y R02-02 CERRADOS ESTÁTICAMENTE**, sin nuevos hallazgos bloqueantes en el diff; **SIN HOMOLOGACIÓN OPERACIONAL NI VISUAL**.
**SHA auditado:** `496dee01dc4d065bee3f7c8157ea01c0b0aeaa9a` ([commit](https://github.com/proceit-tech/distribuidora/commit/496dee01dc4d065bee3f7c8157ea01c0b0aeaa9a)).
**Comparación funcional:** `30c984b216957f8320f45ff729f4b984e30335bc..496dee01dc4d065bee3f7c8157ea01c0b0aeaa9a`: 3 commits de avance, ningún archivo temporal presente en el diff acumulado; el último commit elimina `.tmp-fx7.js`.
**Normativa:** `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md`, `PROGRESSO-NEXIT-V1.md` (sección UX-R01-01/AUD-PRO129-UX-R02), `documentacao/v1/DECISAO-PUNTOS-TIPOS-SERIES-2026-10-17.md`, `documentacao/testes/AUD-PRO129-PUNTOS-ALTA-TIPO-R02-2026-10-17.md`.
**Ámbito revisado:** `app/(private)/facturacion/puntos/page.tsx`, `lib/facturacion/puntos.ts`, `lib/facturacion/alta-punto.casos.ts`, diff acumulado y progreso. Sin ejecución del navegador, PostgreSQL, VM ni gateway.

## Matriz RN/CA y auditoría

| Requisito o hallazgo | Evidencia comprobada | Veredicto |
|---|---|---|
| R02-01: NRE/NDE/AFE solo configurables | `page.tsx` líneas ~163–170 y ~188–190: `altaEmitible` solo FE/NCE, y `activar: altaEmitible && dAlta.activar`. `guardarTipo` envía `activar:false` para tipos no emitibles. | **CERRADO ESTÁTICAMENTE** |
| R02-01: estados reales | `page.tsx` líneas ~123–132: filtro «Activos» requiere `emitible && punto.activo && tipo.activo`; líneas ~350–374: no emitibles muestran «Configurado · emisión no disponible» antes de la condición «Activo · disponible para emitir» y sin el botón de activar/desactivar tipo. | **CERRADO ESTÁTICAMENTE** |
| R02-01: formularios | `page.tsx` líneas ~445–452 y ~494–499: la opción de dejar tipo disponible solo aparece para FE/NCE; los otros tipos reciben aviso de configuración sin emisión. | **CERRADO ESTÁTICAMENTE** |
| R02-02: función nueva ausente | `lib/facturacion/puntos.ts` líneas ~212–229: si SQLSTATE `42883` y mensaje identifica `fe_punto_alta_tipo`, devuelve 409 y explica falta de **NEX-064**, dependencia NEX-063. | **CERRADO ESTÁTICAMENTE** |
| R02-02: diagnóstico legado | `traducirErrorPunto` líneas ~110–139 retiene error NEX-063 para funciones/columnas anteriores; permisos 42501 y duplicidad NEX:TIPO_DUPLICADO mantienen sus códigos/mensajes. | **CERRADO ESTÁTICAMENTE** |
| CA-04/05B: 001-001 FE + NCE | El flujo de un solo modal y POST, la nueva función `fe_punto_alta_tipo` en NEX-064, validación de duplicidad por tipo y la conservación del punto físico no cambiaron en esta rodada. | **Sin regresión encontrada en el diff**, pendiente prueba de DB |
| CA-08: NRE/NDE/AFE sin emisión | Solo se puede configurar su serie/contador. Ninguna función nueva ni ruta de emisión para esos tipos en el diff. | **Conforme estático** |
| CA-10: pruebas y evidencia | Claude reporta `alta-punto.casos`, `puntos.casos`, `series.casos`, ESLint y tsc sin fallas. `alta-punto.casos` amplió mocks de `42883` y aserciones de TSX/estados, **no** probó servidor PostgreSQL. | **Verificación declarada, no reproducida por auditor** |
| Entrega limpia | Último commit `496dee01dc4d065bee3f7c8157ea01c0b0aeaa9a` solo elimina `.tmp-fx7.js`; el diff acumulado no deja este archivo y no modifica NEX-063/NEX-064, reglas de emisión FE/NCE ni gateway. | **Conforme** |

## Observaciones no bloqueantes, sin ampliar el alcance

- El botón administrativo «Activar/Desactivar punto» persiste también en filas de tipos no emitibles; eso afecta el estado del **punto compartido**, potencialmente habilitando tipos FE/NCE que ya estaban activos, aunque NRE/NDE/AFE sigan sin emisión. La interfaz ya diferencia «punto» y «tipo», y el responsable mantiene el control de activación; verificar claridad de ese comportamiento durante el aceite visual. **No constituye regresión de R02 ni una instrucción de modificar la arquitectura por iniciativa de la IA**.
- Las etiquetas de estado indican **disponibilidad por configuración del punto/tipo**, no validan por sí mismas credenciales ni disponibilidad del gateway. El requisito fiscal del gateway sigue pendiente, sin afirmar homologación.
- Las nuevas verificaciones TypeScript de UI son principalmente inspección textual y mocks. No sustituyen un navegador ni los escenarios reales SQL de T30/T31.

## Estado y decisión

**Conclusión:** **AUD-PRO129-UX-R03 APROBADA EN REVISIÓN ESTÁTICA** del alcance correctivo R02-01/R02-02. **No se autoriza implantación automática, SQL, deploy ni emisión**, y no se declara HOMOLOGADO. No enviar otra ronda de corrección a Claude sin nuevo defecto comprobado.

**Dependencias no verificadas:** NEX-063/064 según estado reportado sin aplicar; T27/T28/T29/T30/T31 sin ejecución real PostgreSQL; `GATEWAY-SERIE-01` no confirmado; capturas ANTES/DEPOIS binárias ausentes en GitHub y falta aprobación visual del responsable. **Solo el responsable humano decide/aplica SQL y deploy en la única VM operacional.** No se inventa ni solicita un entorno de homologación alternativo.

**Siguiente paso:** al solicitarlo el responsable, auditar el procedimiento de aplicación con el estado real de migrations y ofrecer únicamente comandos ya documentados para la VM. Una vez publicado por él, recoger resultado y captura del formulario único seleccionando est.001/punto001/NCE para confirmar que la experiencia real resuelve el defecto original.
