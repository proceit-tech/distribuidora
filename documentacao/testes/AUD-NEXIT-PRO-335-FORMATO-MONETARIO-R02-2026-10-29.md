# AUD-NEXIT-PRO-335-R02 — Auditoría independiente del correctivo R01 (F-001, F-002, F-003)

**Fecha:** 29/10/2026 · **Auditor:** ChatGPT · **Desarrollador:** Claude.  
**Commit correctivo:** [`dd310116c8bb86425114e41f30741ab7c1cd053b`](https://github.com/proceit-tech/distribuidora/commit/dd310116c8bb86425114e41f30741ab7c1cd053b).  
**Commit original:** [`d2214351d2bf2677b3dc6dc166733aafa6af1a8a`](https://github.com/proceit-tech/distribuidora/commit/d2214351d2bf2677b3dc6dc166733aafa6af1a8a).  
**Issue:** [PRO-335](https://linear.app/proceit/issue/PRO-335) · **R01:** [AUD-NEXIT-PRO-335-R01](AUD-NEXIT-PRO-335-FORMATO-MONETARIO-R01-2026-10-29.md).  
**Tipo de auditoría:** inspección estática del diff, lectura del código completo de los componentes afectados, cálculo decimal compartido, contrato GET de Productos, código de alta/apertura y validación de origen de la moneda del costo. **0 casos, lint, typecheck, build, navegador, PostgreSQL/SQL, VM, Docker, gateway o deploy ejecutados.**

## 1. Dictamen R02

**F-001 corregido estáticamente. F-003 corregido estáticamente. F-002 corregido en vistas de lectura, pero queda un residual funcional de rotulación R02-F004 (MEDIA/ALTA OPERATIVA). PRO-335 PARCIALMENTE CONFORME: NO DONE, NO HOMOLOGADA, NO desplegar.**

El correctivo cambió exactamente **9 archivos** y añadió **18 casos nuevos** en `lib/formato/monto-visual.casos.ts` (identificadores `PRO335-R01-01..18`). Los 74 casos anteriores más 1 en residuales y estos 18 permanecen escritos **sin ejecución**. La auditoría no supone typecheck/CI correctos.

## 2. Matriz verificada

| Hallazgo | Código comprobado en R02 | Veredicto |
|---|---|---|
| F-001 — KPI suma monedas incompatibles | `lib/productos/valor-venta.ts` usa `multiplicarDecimales` + `sumarDecimales`, agrupa `moneda` por cada precio; `listado-productos.tsx` elimina `acc.valorVenta`/última moneda y presenta `textoSubtotalesValorVenta(valorVentaPorMoneda)`. GET sigue exponiendo `precio_venta_referencia::text` y `stock_disponible::text` para conservar precisión. | **CERRADO POR INSPECCIÓN** |
| F-001 — moneda ausente y orden | Sin moneda se muestra «Sin moneda» sin adjudicar PYG/USD; alias PYG/GS se normaliza; subtotales PYG, USD, BRL antes de otras monedas, nunca FX implícito. | Conforme estático |
| F-002 — costo promedio de Inventario y listado | GET `/api/productos` añade `monedaBaseCosto` desde `empresas.moneda_base_codigo`, independiente de `monedaReferencia`; GET `/api/productos/[id]` añade `monedaCostoPromedio`; listado usa `monedaCosto` obtenida del catálogo. | **CERRADO EN LECTURA** |
| F-002 — costo de apertura histórico | GET detalle obtiene `ml.moneda_costo_codigo AS monedaCosto`, pestaña Inventario usa `monedaApertura` para importe leído, no usa la moneda de lista; cuando no hay moneda, exacto sin identificación falsa. | **CERRADO EN LECTURA** |
| F-003 — conversión de límite de crédito | `clientes/[id]/page.tsx::ImporteConversion` pasa moneda origen y destino por separado; `importeVerificable` muestra 0/2 decimales y exacto secundario si difiere. `convertirLimites`, tasa/confirmación, input/POST quedan sin cambios. | **CERRADO POR INSPECCIÓN** |
| Proveedores — compra mínima editable | No se modificó `proveedores/_components/pestanas/compras.tsx`: la política de precisión del campo editable permanece. | Conforme al alcance |
| Casos | 18 nuevos en suite PRO-335; incluye valores por moneda y tests estructurales de GET/UI. | Escritos, **NO ejecutados** |
| NEX-076/PRO-328/330, SIFEN, reportes exportados, DB | Los 9 archivos no alteran SQL, migrations, KuDE/FE/NCE, cálculo comercial persistido ni CSV/XLSX/PDF de reportes. | Sin cambio por diff |
| **R02-F004** — moneda identificada en campo de ALTA editable | `app/(private)/productos/_components/pestanas/inventario.tsx` **líneas 18–19 y 59** continúa tomando `catalogos.monedaReferencia` (lista de precios) para etiqueta `Costo unitario de apertura`. El movimiento de apertura se registra por `lib/productos/shared.ts::registrarInventarioInicial` llamando `inventario_registrar_movimiento` sin pasar moneda propia; la regla de registro NEX-009 toma `empresas.moneda_base_codigo`. Etiqueta puede indicar USD mientras se registra costo en PYG. | **ABIERTO — CORRECTIVO FOCAL NECESARIO** |

## 3. R02-F004 — causa, riesgo y corrección exacta

**Defecto probado:** la etiqueta del campo editable se calcula con `const moneda = catalogos.monedaReferencia ? ...`, mientras en la misma pestaña `monedaPromedio` ya usa `detalle?.monedaCostoPromedio ?? catalogos.monedaBaseCosto`. El costo de alta y su movimiento se registran en la moneda-base de la empresa; su etiqueta debe identificarse desde `catalogos.monedaBaseCosto`, **no** desde la lista de precios. La preservación de la PRECISIÓN del campo editable no exige preservar un rótulo erróneo.

**Ejemplo de negocio:** empresa base `PYG`, lista de venta `USD`. Hoy al crear producto puede verse «Costo unitario de apertura (USD)», aunque la apertura se contabiliza en moneda base PYG. El usuario podría introducir importe calculado mentalmente en USD y provocar un costo inventario equivocado. **No es solo problema cosmético.**

**Corrección mínima autorizada para Claude:**
- En `app/(private)/productos/_components/pestanas/inventario.tsx`, cambiar EXCLUSIVAMENTE el origen monetario del rótulo `Costo unitario de apertura` (modo crear) para `catalogos.monedaBaseCosto` usando el helper `rotulo` ya existente o equivalente. Si la base no viene definida, no afirmar una moneda: mostrar etiqueta sin código; no hacer fallback a `monedaReferencia` (precio de venta).
- Dejar intactos `valor={form.inventarioInicial.costoUnitario}`, `alCambiar`, modo decimal, validaciones de hasta 4 decimales, `lib/productos/shared.ts`, estado/guardado/movimiento, `monedaPromedio`, `monedaApertura`, GET/POST/PATCH, cálculos, inventario y resto de la pestaña.
- En `lib/formato/monto-visual.casos.ts`, actualizar la aserción estructural `PRO335-R01-12` que **hoy exige explícitamente la etiqueta incorrecta** `Costo unitario de apertura${moneda}`; reemplazarla por comprobación de moneda-base y verificar que no usa `catalogos.monedaReferencia`. Añadir caso nuevo de etiqueta/metadata para `base PYG + referencia USD`, `base USD + referencia PYG`, base ausente y preservación del input no redondeado. No fabricar test que afirme ejecución real.
- **Archivos permitidos ÚNICAMENTE:** `app/(private)/productos/_components/pestanas/inventario.tsx` y `lib/formato/monto-visual.casos.ts`. Si se necesita modificar algo fuera, PARAR e informar.
- **No ejecutar** tests, lint, typecheck, build/CI manual, SQL, VM, Docker, gateway, browser ni deploy. Commit+push SHA de SOLO estos archivos, declarar pruebas no ejecutadas, PARA para auditoría ChatGPT R03.

## 4. Gate operativo

La **única** orden correctiva restante en PRO-335 es R02-F004. **PRO-337** es un ticket independiente para tarjeta cortada/títulos del Informe de Ventas y **no está autorizado** hasta dictamen R03 de PRO-335. PRO-328/330 permanecen In Review, NEX-076 versionada/no aplicada; PRO-327 SQL histórico 561 corregido, no repetir.

**Conclusión:** no es necesario volver a escribir PRO-335 de cero, ni reabrir F-001 o F-003 sin prueba nueva. Se requiere SOLO corregir la etiqueta de la moneda del costo inicial, mantener casos con el nuevo comportamiento y auditar R03. **Ninguna ejecución ni homologación derivan de este informe.**
