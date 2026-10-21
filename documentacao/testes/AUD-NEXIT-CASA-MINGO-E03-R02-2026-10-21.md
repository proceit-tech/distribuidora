# AUD-NEXIT-CASA-MINGO-E03-R02 — Limpieza de descuentos monetarios al cambiar moneda

**Auditoría:** 21/10/2026  
**Commit auditado:** `7031c3aac33a36ee3a68d70e37664ee3ddb3297a`  
**Base:** `684768a1e98235ed6f98f2bc3681b5f6fa2a0807`  
**Hallazgo previo:** PRO-204 / E03-R01-F001, MEDIA.
**Fuente de requisitos:** `documentacao/testes/AUD-NEXIT-CASA-MINGO-E03-R01-2026-10-21.md`, PRO-124, PRO-200.
**Protocolos consultados:** `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md` y tramos pertinentes de `PROGRESSO-NEXIT-V1.md` en el commit auditado.

## Dictamen

**PRO-204 / F-001 — CORREGIDA ESTÁTICAMENTE. E03 apta para avanzar en DESARROLLO; NO homologada.**

Revisado el diff, las funciones puras y el cableado de la página de Facturas. **No se encontraron hallazgos ALTA/MEDIA nuevos en este parche**. Queda pendiente prueba humana en navegador para confirmar foco/teclado/diálogo y prueba real del gateway/SIFEN para verificar la aceptación fiscal de la E03; la NEX-067 permanece NO aplicada y sin autorización de despliegue. No marcar `Done` ni `Homologado`.

## Matriz RN/CA → implementación → prueba → resultado

| RN/criterio | Evidencia directa en commit 7031c3aa | Prueba declarada por Claude | Dictamen |
| --- | --- | --- | --- |
| Detectar descuentos de tipo MONTO con valor | `lib/facturacion/descuentos.ts`: `tieneDescuentoMonto` distingue MONTO digitado de porcentaje y MONTO vacío | R02-01 | Conforme |
| Limpiar MONTO por ítem y general al confirmar | `descuentosTrasCambioMoneda` retorna nuevas estructuras con `valor:""` y conserva `modo`; `cambiarMoneda` actualiza cada línea por `clave` y el descuento general | R02-02, R02-07, R02-09 | Conforme estático |
| Mantener descuentos PORCENTAJE | `limpiar` devuelve el descuento original si no es MONTO digitado | R02-03, R02-07 | Conforme |
| Advertir pérdidas antes de confirmar | `pedirMoneda` calcula `perdidos`; `perdidasAlCambiarMoneda` lista cantidades de ítems y descuento general; diálogo abierto si lista no vacía | R02-05/06/09 | Conforme estático |
| Cancelar/Escape no modifica descuento ni moneda | `cerrarConfirmacion` no llama `cambiarMoneda`; la modificación ocurre solo cuando `confirmarCambio` acepta o no hay pérdida | R02-04/09 | Conforme estático; navegador no ejecutado |
| No convertir monedas silenciosamente | `descuentosTrasCambioMoneda` limpia MONTO, sin multiplicar por tipos de cambio; precios y cambio siguen usando flujo anterior | R02-02/07/08 | Conforme |
| Mantener IVA, payload, stock E02 | Diff modifica solo helpers/cableado/tests y progreso; no modifica `calculo.ts`, `payload-fe.ts`, `stock-fe.ts`, `emision.ts` ni SQL | R02-10, regresiones declaradas | Conforme al diff |
| PYG→USD, USD→BRL, BRL→PYG, USD→PYG | Código de UI es genérico para cada cambio de moneda | R02-05 en 4 etiquetas | Conforme de forma estructural; prueba de transiciones reales no efectuada |

## Consideraciones y límites (sin nuevo ticket)

- `descuentosTrasCambioMoneda` devuelve copias para MONTO, no muta los valores previos. El mapa por `clave` asegura que el descuento de una línea permanezca asociado al producto correcto al actualizar precios. **La interfaz no fue renderizada en navegador.**
- El bloque R02-05 itera cuatro nombres de conversiones, pero repite los mismos argumentos de `perdidasAlCambiarMoneda`; **no son cuatro simulaciones de eventos reales de UI**. Es aceptable para esta revisión estática porque la lógica de cambio es compartida; registrar prueba humana de cada moneda durante homologación.
- No se observa que el reset monetario altere la fórmula EA002/EA003/EA004 ni la baja de stock (se mantiene por cantidad). El total se recalcula con el motor existente cuando cambian precios/moneda/descuentos, preservando invalidación de revisión anterior.
- El algoritmo de descuento global MONTO de E03 todavía requiere aceptación real del gateway/SIFEN. No homologar fiscalmente a partir de mocks/NT 001 únicamente.
- No modificar NEX-067, no ejecutar SQL en VM desde IA, no confundir aprobación técnica con disponibilidad operacional.

## Pruebas declaradas, no reproducidas por el auditor

- `descuentos-e03`: **47** verificaciones, **0** fallas (13 nuevas).
- Regresiones: facturacion 271; rediseno 90; monedas 84; credito 91; pagos 77; revision-factura 42; stock-e02 61; visual-v1 29; cantidad-e01 16; ajuste-fiscal 41; fat-e2 44; todas 0 fallas, según Claude.
- TypeScript puntual y ESLint puntual, según Claude: sin errores.
- **Auditor no ejecutó** Node, tests, build, CI, PostgreSQL, gateway, SIFEN, Docker, VM ni navegador.

## Gate

**E03-R02 APROBADA ESTÁTICAMENTE.** Puede comenzar **E04 — elección de direcciones de entrega** en una única entrega aislada bajo PRO-200, respetando `CLAUDE.md` y `PROTOCOLO-IA.md`, con pruebas dirigidas, commit/push y PARADA para auditoría E04-R01. **Prohibido** desplegar, aplicar NEX-067 o marcar E03 como homologada por esta aprobación. La homologación de E01–E03 corresponde al responsable humano en la VM cuando autorice la implantación.
