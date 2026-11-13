# AUD-NEXIT-PRO-335-R01 — Auditoría independiente de importes monetarios en todas las pantallas

**Fecha:** 29/10/2026 · **Auditor:** ChatGPT · **Autor del código:** Claude.  
**Commit auditado:** [`d2214351d2bf2677b3dc6dc166733aafa6af1a8a`](https://github.com/proceit-tech/distribuidora/commit/d2214351d2bf2677b3dc6dc166733aafa6af1a8a).  
**Issue:** [PRO-335](https://linear.app/proceit/issue/PRO-335) · **paquete:** [PRO-329](https://linear.app/proceit/issue/PRO-329).  
**Especificación:** [orden autorizada PRO-335](../ordens/ORD-CLAUDE-NEXIT-PRO-335-FORMATO-MONETARIO-TODAS-TELAS-2026-10-29.md), [auditoría transversal inicial](../analises/AUD-NEXIT-FORMATO-MONETARIO-TODAS-TELAS-E-LAYOUT-VENTAS-2026-10-29.md).  
**Método:** lectura estática del diff, archivos de presentación, casos fuente, consultas de API de Productos, esquema de moneda y pantallas de Clientes/Proveedores. **NO hubo ejecución de tests, lint, typecheck, build, PostgreSQL, VM, gateway, navegador o despliegue.** Los resultados descritos son deducciones estáticas, nunca homologación real.

## 1. Dictamen

**PARCIALMENTE CONFORME ESTÁTICAMENTE, CON UN DEFECTO DE NEGOCIO ALTO Y DOS OMISIONES VISUALES COMPROBADAS. NO HOMOLOGAR Y NO MARCAR DONE.**

Claude entregó **22 archivos** versionados, con **74 casos nuevos del núcleo PRO-335, 1 caso adicional indicado en residuales**, más ajustes a casos existentes en Dashboard. Todos **NO EJECUTADOS**. Introdujo un formato monetario canónico sobre texto decimal exacto y lo conectó al Informe de Ventas, Valorización, Kardex, Stock Crítico, Documentos, Stock/Movimientos/Compras, Dashboard, Productos parcial y Listas de Precios. `fmtDinero` exacto se preservó para exportación mientras `fmtImporteMoneda` se usa en pantalla, sin redondear `fmtCantidadTexto`; NEX-076, gateway/KuDE, SQL y endpoints no fueron alterados en este commit.

**Los siguientes hallazgos deben resolverse antes de llamar la PRO-335 «todas las pantallas»:**

### F-001 · ALTA · KPI de Productos SUMA MONEDAS DIFERENTES y muestra UNA

**Evidencia:** `app/(private)/productos/_components/listado-productos.tsx` líneas 283–327, especialmente 310–315: `acc.valorVenta += producto.precioVentaReferencia * Number(stockDisponible)`; `acc.monedaValor = producto.monedaPrecioReferencia || acc.monedaValor`. El KPI «Valor a precio venta» (líneas 532–534) muestra `money(resumen.valorVenta, resumen.monedaValor)`.

**Efecto:** productos con `monedaPrecioReferencia` PYG y USD acumulan dos importes inconmensurables y se rotulan con la divisa del último producto. Ejemplo ilustrativo: PYG 100.000 + USD 20 → «USD 100.020,00» o «Gs. 100.020», ambos incorrectos. Este problema existía antes del commit, pero **es inaceptable para la regla PRO-335 que exige moneda real por importe y ninguna mezcla de monedas**. El test estructural PRO335-H10 sólo observa la pestaña de producto, no el KPI de lista.

**Solución funcional obligatoria:** no convertir moneda sin tasa/fecha/contrato explícito. En KPI, **agrupar importes por código monetario real** o, si el espacio no permite, mostrar desglose/estado «Varias monedas: ver detalle» en lugar de un total engañoso. Preservar visibilidad de registros de moneda ausente/ajena como «sin moneda identificada», nunca asignarlos a una arbitraria. Si se modifica la agregación visual, usar los datos ya presentados; no alterar precios persistidos ni impuestos. Evitar JS `Number` para agregar importes exactos `numeric` si existe proyección como texto. **No solucionar convirtiendo USD a PYG de forma implícita.**

### F-002 · ALTA FUNCIONAL / CONTRATO MONETARIO · Costo promedio de Productos NO tiene la misma moneda que la lista de precios

**Evidencia de fuente:**
- `NEX-009-inventario-costos.sql` y `inventario_registrar_linea` seleccionan `empresas.moneda_base_codigo` para valores de costo, y la vista `v_inventario_costos` publica `moneda_base_codigo`.
- `app/api/productos/route.ts` proyecta `cp.costo_promedio` **sin moneda del costo**, y por separado `pr.moneda AS moneda_precio_referencia`.
- `app/api/productos/[id]/route.ts` proyecta `costoPromedio` y lee `coalesce(moneda de lista de referencia, moneda base)` como `monedaReferencia`.
- `app/(private)/productos/_components/pestanas/inventario.tsx` líneas 67, 76 visualiza `costoUnitario` y `costoPromedio` usando **`catalogos.monedaReferencia`**, potencialmente USD por la lista, aunque el costo de inventario es en `moneda_base_codigo`.
- `app/(private)/productos/_components/listado-productos.tsx` línea 753 rotula costo promedio siempre con **`"PYG"`**. Será incorrecto si una empresa tiene moneda base distinta de PYG.

**Solución segura:** resolver explícitamente la **moneda base de la empresa** desde fuente autoritativa para costos (no la divisa de precios de referencia), proyectarla de forma controlada como metadato de solo lectura si el frontend no la posee; renderizar costo promedio y costo de apertura con la divisa efectivamente documentada para cada valor. Confirmar contrato de `movimiento_lineas.moneda_costo_codigo` para costo de apertura y evitar suponer que siempre equivale a moneda de referencia. No hacer conversiones ni cambios en registros de costos. Una modificación mínima de contrato GET puede resultar inevitable: estaba **FUERA de los archivos autorizados en la orden original**; la auditoría no autoriza automáticamente esa edición, requiere orden correctiva explícita con extensión de alcance.

### F-003 · MEDIA · Clientes — conversión de límite de crédito visible sin formato monetario

**Evidencia:** `app/(private)/clientes/[id]/page.tsx` líneas 1898–1918 usa `vistaConversion.limite`, `limiteDestino`, `temporal`, `temporalDestino` como TEXTO bruto con divisa. Es **vista de confirmación de operación comercial**, no los inputs editables.

**Regla:** aplicar el formato monetario 0/2 a la presentación de origen y destino, por su moneda respectiva, **manteniendo también el importe de conversión exacto visible para verificación/confirmación si el valor tiene decimales ocultos**; jamás formatear para guardar, recalcular la conversión, alterar `tasaCambio` ni cambiar `conversionMoneda`. Claude informó que `Clientes` estaba fuera de la lista de edición original: **omisión explicada, no violación de alcance**.

### OB-004 · FUERA DEL CORRECTIVO VISUAL POR SER EDITABLE · Proveedores — monto mínimo de compra

`app/(private)/proveedores/_components/pestanas/compras.tsx` línea 47 es el campo **editable** `form.montoMinimoCompra`, `modo="decimal"`, con regla de entrada «hasta 2 decimales». **No aplicar un formatter de lectura que reescriba o redondee este valor mientras el usuario lo edita.** El requisito PRO-335 excluye explícitamente los campos editables. Solo corresponde formato 0/2 a una **vista de lectura separada** si existe; la pestaña revisada es un formulario. La petición de alterar la escala de entrada (2 → 0 en PYG) **sería una modificación contractual de compras**, fuera del alcance de formato visual. No marcar esta exclusión como incumplimiento por sí sola.

## 2. Controles de no regresión verificados en el diff

| Control | Hallazgo | Estado |
|---|---|---|
| PYG 0, USD/BRL 2 con redondeo textual | `lib/formato/monto-visual.ts` nueva normalización `GS/PYG/USD/BRL` y helpers `formatearImporteMoneda`, `formatearImporteConMoneda` | Conforme estático |
| Negativos, no `-0`, null, inválidos | `partesDecimal/redondear/componer`, casos PRO335-A/B/C | Conforme estático |
| Cantidades exactas | `fmtCantidadTexto` ahora depende de `fmtDecimalExacto`, no de redondeo monetario; ejemplos 0.0001 y 1.2500 cubiertos | Conforme estático |
| Excel/PDF de reportes preservan precisión | `fmtDinero` exporta valor exacto; `lib/reportes/export.ts`, `xlsx.ts` y `pdf.ts` no fueron editados | Conforme por diff |
| Informe de Ventas (seis vistas/estados/anomalías) | `fmtImporteMoneda` recibe la moneda de fila/total, `CeldasImportes` recibe `moneda` | Conforme por inspección |
| Valorización/Kardex/Stock Crítico | Importes conectados con moneda base o de fila; costo unitario exacto disponible en `title`/detalle | Conforme por inspección |
| Documentos Electrónicos | `importe(d)` deja de usar `Number(d.total)`; usa importe textual con divisa del documento | Conforme |
| Dashboard, Stock, Compras, Movimientos | Formatos reutilizados; costo unitario exacto visible en título cuando corresponde | Conforme en archivos tocados |
| Productos | Pestañas editadas, pero KPI agregado mezcla divisas, promedio mal rotulado potencialmente | **NO CONFORME F-001/F-002** |
| Clientes | Conversión de límites se presenta como string original sin el formato 0/2 | **PENDIENTE F-003** |
| Proveedores | Monto mínimo sólo editable en la pestaña inspeccionada; conservar precisión durante edición | Excepción justificada |
| Integridad de ámbito | 22 archivos del commit; sin SQL/migraciones, sin API write, sin cambios de fórmulas fiscales | Conforme por diff |
| Casos | 74 de la orden más uno indicado en residuales, además de ajustes a casos existentes. **0 ejecutados** | No probado |

## 3. Criticidad y decisión

- **F-001 es defecto de negocio comprobado y debe resolverse antes de homologar PRO-335.** No basta cambiar el formato del texto final: la agregación de distintas divisas ya es inválida.
- **F-002 requiere identificar la moneda de COSTO en el metadato de API** (separada de moneda de precio referencial). No asumir siempre PYG o siempre la moneda de lista.
- **F-003 está fuera del alcance autorizado inicial**, pero afecta una vista de lectura monetaria real. Su corrección exige permitir explícitamente la edición del componente `Clientes/[id]` exclusivamente para presentación de la confirmación de conversión, preservando valor exacto y acción de guardado.
- **Proveedores `montoMinimoCompra` editable NO debe modificarse** para cumplir formato visual de lectura. La regla de entrada es otro tema si el usuario la pide.
- **PRO-337 permanece independiente** (tarjeta truncada y títulos de Informe de Ventas): no tocar CSS/layout en un correctivo PRO-335.
- **PRO-328 y PRO-330 continúan In Review**; NEX-076 sólo versionada, sin instalación. PRO-327 SQL histórico 561 ejecutado y poscheck, no reimportar.

**Dictamen final R01: CORRECCIÓN FOCAL NECESARIA EN PRO-335, SIN AUTORIZACIÓN PARA DEPLOY/HOMOLOGACIÓN.** No hubo ejecución de test/build/SQL/VM. Publicar nuevo SHA correctivo y repetir auditoría R02; después decidir PRO-337 por orden independiente.
