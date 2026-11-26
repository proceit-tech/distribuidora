# AUD-NEXIT-PRO-335-R03 — Auditoría independiente final del correctivo R02-F004

**Fecha:** 29/10/2026 · **Analista/auditor:** ChatGPT · **Desarrollador:** Claude.  
**Commit auditado:** [`b8b448cc324ef759d58612712272847692528964`](https://github.com/proceit-tech/distribuidora/commit/b8b448cc324ef759d58612712272847692528964).  
**Issue:** [PRO-335](https://linear.app/proceit/issue/PRO-335) · **Paquete:** [PRO-329](https://linear.app/proceit/issue/PRO-329).  
**Origen:** [AUD-R01](AUD-NEXIT-PRO-335-FORMATO-MONETARIO-R01-2026-10-29.md), [AUD-R02](AUD-NEXIT-PRO-335-FORMATO-MONETARIO-R02-2026-10-29.md), [ORD-R02-F004](../ordens/ORD-CLAUDE-NEXIT-PRO-335-R02-F004-ROTULO-CUSTO-APERTURA-2026-10-29.md).  
**Límite de certeza:** auditoría EXCLUSIVAMENTE ESTÁTICA del SHA exacto y contratos de lectura/registro relacionados. **0 tests, lint, typecheck, build, consulta PostgreSQL, VM, Docker, gateway, navegador, emisión o deploy ejecutados.**

## 1. Dictamen R03

**CONFORME ESTÁTICAMENTE EN EL ALCANCE DE PRO-335; R02-F004 CERRADO POR INSPECCIÓN. No se detectó defecto nuevo demostrado en el correctivo. NO HOMOLOGADO, NO PRODUCTION-READY, NO DONE.**

La secuencia es:
- Commit original `d2214351d2bf2677b3dc6dc166733aafa6af1a8a`: 22 archivos, 74 casos escritos + 1 residual informado, **no ejecutados**. AUD-R01 detectó F-001 a F-003.
- Correctivo R01 `dd310116c8bb86425114e41f30741ab7c1cd053b`: 9 archivos, +18 casos escritos, **no ejecutados**. AUD-R02 cerró F-001/F-003 y la parte de lectura de F-002, identificando R02-F004 (etiqueta editable con moneda incorrecta).
- Correctivo R02-F004 `b8b448cc324ef759d58612712272847692528964`: **solamente 2 archivos**, +6 casos PRO335-R02-19..24 y actualización del caso PRO335-R01-12, **no ejecutados**. Se ha conservado exactamente la precisión y conducta del input.

**Conteo según entregas:** 74 casos originales nuevos + 1 residual indicado + 18 + 6 = **99 nuevas verificaciones/casos reportados** en el conjunto de entregas, sin contar casos preexistentes ajustados. Este total es suma de reportes, NO prueba de cobertura ni de ejecución exitosa.

## 2. Confirmación del correctivo R02-F004 por código

| Control | Evidencia real de diff y fuente | Resultado |
|---|---|---|
| Archivo permitido de UI | `app/(private)/productos/_components/pestanas/inventario.tsx` cambia exclusivamente etiqueta del campo de alta y quita constante `moneda` basada en lista comercial | CONFORME |
| Origen de moneda del costo | `etiqueta={\`Costo unitario de apertura\${rotulo(catalogos.monedaBaseCosto ?? "")}\`}` toma la moneda BASE de empresa de GET `app/api/productos/route.ts`; `monedaReferencia` es precio comercial y no se usa | CONFORME |
| Empresa PYG / lista USD | Ejemplo de código: `monedaBaseCosto="PYG"` resulta `Costo unitario de apertura (PYG)` aun si `monedaReferencia="USD"` | CONFORME ESTÁTICO |
| Empresa USD / lista PYG | `monedaBaseCosto="USD"` resulta `Costo unitario de apertura (USD)` | CONFORME ESTÁTICO |
| Sin moneda-base disponible | `rotulo("")` devuelve cadena vacía: rótulo sin divisa; no inventa PYG, USD o moneda de precio | CONFORME |
| Input editable | `valor={form.inventarioInicial.costoUnitario}`, `alCambiar={...}`, `modo="decimal"`, `maxLength={19}`, `ayuda` y campo `Cantidad inicial` quedan literalmente intactos en el diff | CONFORME |
| Persistencia fiscal y de stock | `lib/productos/shared.ts::registrarInventarioInicial` sigue invocando `inventario_registrar_movimiento` con texto exacto y sin enviar moneda de lista. NEX-009 toma `empresas.moneda_base_codigo`. Sin SQL nuevo. | SIN REGRESIÓN DIRECTA |
| Casos específicos | `lib/formato/monto-visual.casos.ts` actualiza `PRO335-R01-12`, añade `PRO335-R02-19..24` para base comercial distinta, ausente e input no mutado | ESCRITOS, NO EJECUTADOS |
| Contratos de otras issues | El diff no modifica `PRO-328`, `PRO-330`, NEX-076, `PRO-337`, KuDE, reportes, certificados ni importación SQL de 561 productos | CONFORME POR DIFF |

**Nota técnica de tests:** los casos R02-19..22 extraen una expresión del componente y la evalúan mediante `new Function` dentro del archivo de pruebas. Se inspeccionó el código como texto; **no se ejecutó su compilación ni lint**. Verificar reglas de lint/CSP del runner antes de atribuir ejecución exitosa; no se ha probado una falla. Es preferible mantener pruebas de comportamiento puro sin código dinámico al futuro, pero esto no prueba un defecto del input en producción.

## 3. Estado consolidado PRO-335

| Hallazgo | Estado R03 |
|---|---|
| F-001 — KPI Productos mezclaba divisas | **CERRADO ESTÁTICAMENTE EN R02**: subtotales por moneda sin FX implícito |
| F-002 — moneda de costos y apertura histórica | **CERRADO ESTÁTICAMENTE EN R02**, con rótulo de alta validado en R03 |
| F-003 — confirmación de límites Clientes sin formato | **CERRADO ESTÁTICAMENTE EN R02**: moneda por lado y exacto visible |
| R02-F004 — rótulo moneda comercial en costo de apertura | **CERRADO ESTÁTICAMENTE EN R03** |
| Proveedores `montoMinimoCompra` | Campo EDITABLE no redondeado. Exclusión correcta; no estaba incluido en la regla visual de lectura. |
| Layout de tarjeta `No computan` cortada | **NO IMPLEMENTADO, TICKET SEPARADO [PRO-337](https://linear.app/proceit/issue/PRO-337).** No afirmar corrección por el formato monetario. |

## 4. Gate de calidad pendiente

1. **Ejecutar en ambiente/autorización humana** los casos focales PRO-335, comprobando los nuevos R02-19..24, F001 KPI PYG/USD, F002 empresa base y referencia opuestas, F003 conversión de crédito, negativos, nulos, importes largos y valores fraccionarios.
2. Lint/typecheck/build autorizados y revisión de fallos de runtime, incluido código dinámico en los tests; test de carga y sesión de catálogo por tenant/perfil. La auditoría estática **NO valida** esto.
3. Verificación visual de todas las pantallas con valores monetarios PYG 0/USD 2, modales, resúmenes y partes antes/después; garantizar que cantidades, costo exacto/tasas de cambio, inputs editables y Excel/PDF se mantienen. PDF KuDE lo genera el proveedor, no se altera.
4. No realizar deploy, tests o migrations desde este informe. PRO-328 sigue `In Review`, NEX-076 **NO aplicada**; PRO-330 sigue `In Review` con pruebas pendientes; PRO-327 SQL 561 ya aplicado/poscheck, no repetir.
5. **Claude no tiene otra orden de código activa después de este dictamen R03.** PRO-337 podrá recibir una orden separada de UI/layout bajo autorización explícita. Mantener PRO-335 en **In Review** (no Done) hasta homologación.

**Decisión R03: F-001, F-002, F-003 y R02-F004 CERRADOS POR INSPECCIÓN, sin necesidad de otro correctivo focal a esta hora. Estado global de PRO-335: CONFORME ESTÁTICAMENTE, PENDIENTE DE EJECUCIONES Y HOMOLOGACIÓN.**
