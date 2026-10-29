# AUDITORÍA TRANSVERSAL — NEXIT — formato monetario en pantallas y layout de Informe de Ventas

**Fecha:** 29/10/2026 · **Estado:** diagnóstico por lectura estática de código y 3 capturas reales de CASA MINGO.  
**Analista/auditor:** ChatGPT · **Implementación:** Claude únicamente con orden posterior.  
**Repo:** `proceit-tech/distribuidora` · branch `feature/NEXIT-2026-001-banco-demo`.  
**Alcance revisado:** 38 rutas de pantalla/contendedores relevantes y 11 componentes de negocio adicionales (más utilitarios de moneda, inventario, dashboard, reportes y exportadores), consultas estáticas a GitHub; no navegador, VM, PostgreSQL, comandos de test/build ni deploy. Los componentes/rutas que delegan en otros componentes también requieren inventario funcional en homologación; no declarar certificación de 100% de las pantallas sin recorrerlas visualmente.

## 1. Orden de negocio explícita más reciente (sustituye anteriores reglas de presentación)

**Regla PYG:** CUALQUIER **IMPORTE MONETARIO VISUAL** en PYG/Gs./GS se muestra con **cero decimales**, agrupación de millares y redondeo decimal explícito mitad hacia arriba sobre texto de origen: `142090.90909092 → Gs. 142.091`; `1420909.09090908 → Gs. 1.420.909`. No truncar. **Negativo:** `-142090.5 → Gs. -142.091`; nunca mostrar `-0`.

**Regla USD:** importes monetarios de USD se muestran con **máximo dos decimales**, agrupación es-PY y redondeo textual mitad hacia arriba: `1234.56789 → USD 1.234,57`; visualización de centavos `1234.50 → USD 1.234,50` (dos posiciones fijas es compatible con el máximo). **BRL:** conservar dos decimales como regla actual, salvo decisión nueva. Otra moneda no se interpreta en silencio como PYG ni como USD.

**Separación funcional esencial:** este cambio es **únicamente de REPRESENTACIÓN para importes monetarios**. No alterar el numeric exacto del DB, estado de documento, payload SIFEN, impuestos, descuentos, CDC, tipos de cambio, cálculos, precios guardados ni suma de netos. **No calcular diferencias a partir de valores individuales ya redondeados en pantalla**; cada indicador se obtiene del dato exacto previamente agregado. Una diferencia visual de 1 Gs entre componentes redondeados no autoriza alterar valores fiscales.

**Fuera de la regla 0/2:** cantidades fraccionarias de stock/ventas/compras (`1.2500 → 1,25`), porcentajes, cotización, cantidades tributarias, tasa/índice y **campos EDITABLES** de precio, costo, descuento, cambio o cantidad deben conservar precisión autorizada, aunque su resumen SOLO VISUAL aparezca redondeado. Nunca redondear al transferir desde un input al payload. Costo unitario subyacente puede tener hasta 4 decimales; mostrarlo como importe monetario con política visual sin alterar su dato editable, y no perder trazabilidad de la precisión cuando se necesite auditoría.

**Contratos de salida:** no cambiar sin un alcance propio el PDF KuDE firmado/generado por el GATEWAY ni sus bytes (PRO-298/326). XLSX de reportes contiene celdas numéricas exactas; no reemplazarlas por textos `Gs. ...` ni sobrescribir los valores por su representación redondeada. PDF de reportes creado por NEXIT hoy usa formatador exacto sin moneda; requiere una validación adicional y un cambio focal del exportador si el usuario exige el mismo criterio en los PDF; **esta demanda explícita abarca TODAS LAS PANTALLAS, no autoriza reescribir exportadores**.

## 2. Hallazgos confirmados de código

| ID | Nivel | Archivo / ubicación de referencia | Evidencia / defecto |
|---|---|---|---|
| MON-01 | P0 | `lib/reportes/formato.ts::fmtDinero` | No conoce `moneda`, concatena **todos** los decimales significativos de `numeric`; causa directa de IVA NETO/ventas con 8–12 cifras decimales de las capturas. **NO modificar su semántica global** sin separar `fmtCantidadTexto` (que lo invoca). |
| MON-02 | P0 | `app/(private)/reportes/ventas/page.tsx` | `CeldasImportes` recibe `VentasImportes` sin moneda y llama `fmtDinero` en cada columna; `Resumen`, indicadores PYG/USD, `No computan`, `Anomalías`, 6 vistas, subtotales, FE/NCE y filas con varias monedas usan `fmtDinero` sin contexto de moneda. Requiere pasar `moneda` **por fila/indicador**, no depender del filtro ni del primer dato de la empresa. |
| MON-03 | P1 | `app/(private)/reportes/valorizacion/page.tsx`, `kardex/page.tsx`, `stock-critico/page.tsx` | Mismo `fmtDinero` usado en valor total, costo unitario, costo de movimiento, total de inventario y valor de referencia. Cada vista debe usar moneda real: base de empresa, moneda por registro donde aplique. Mantener cantidades `fmtCantidadTexto`. |
| MON-04 | P1 | `app/(private)/documentos/page.tsx::importe` | `Number(d.total).toLocaleString(...)` convierte numeric textual a JS `Number` y formatea con 0/2 según moneda. Aunque las casas visuales están acotadas, **Number introduce riesgo de pérdida de precisión** en importes grandes; usar formato textual exacto común. |
| MON-05 | P1 | `lib/formato/monto-visual.ts::formatearMontoVisual` | Ya implementa Gs 0 y USD/BRL 2 vía redondeo textual, sin modificar payload; es **candidato a patrón canónico**, requiere pruebas de negativos, valores largos, campos desconocidos y ausencia de dato. `app/(private)/facturas/nueva/page.tsx`, `notas-credito/page.tsx`, `medios-pago.tsx` lo usan en parte. |
| MON-06 | P1 | `lib/inventario/decimal.ts::formatearMontoTexto`, `formatearCostoUnitarioTexto` | `formatearMontoTexto` ya presenta Gs 0 y USD 2 con redondeo textual; `formatearCostoUnitarioTexto` visualiza hasta 4 decimales en AMBAS monedas. Hay duplicación de política; normalizar presentaciones monetarias con cuidado y preservar datos exactos de costos unitarios/edición. |
| MON-07 | P1 | `lib/formato/listas.ts::formatearMonto`, `lib/dashboard/formato.ts::montoTexto`, `lib/listas-precio/calculos.ts::formatoMoneda` | Más formateadores paralelos; algunos usan Number/Intl con 0/2, otros usan BigInt/texto; dashboard y listas de precios no deben calcular ni modificar otro dato por el cambio visual. |
| MON-08 | P1 | `app/(private)/compras/entradas/{page.tsx,nueva/page.tsx,[id]/page.tsx}`, `stock/{page.tsx,[id]/page.tsx}`, `movimientos/[id]/page.tsx` | Valores/entradas/costos y referencias usan formateadores heterogéneos; verificar uniformidad de PYG/USD en filas, subtotales, cabeceras, tarjetas y modales. No afectar multiplicación exacta, entrada de compra, movimiento o valoración de inventario. |
| MON-09 | P1 | `app/(private)/productos/_components/listado-productos.tsx` | Listado de productos usa `formatearMonto` basado en `Number` para precio referencial, stock×precio y costo promedio. Verificar semántica de números, base monetaria, moneda de producto y riesgo por producto fraccionario. |
| MON-10 | P1 | `app/(private)/listas-precio/_components/lista-precio-form.tsx` | `formatoMoneda` tiene 0 PYG/2 otras, pero el mismo módulo usa `redondearMoneda` para **cálculo de precios**. Prohibido cambiar fórmulas para obtener formato. |
| MON-11 | P2 | `app/(private)/dashboard/page.tsx`, `reposicion/page.tsx`, `reportes/stock-general/page.tsx`, `reportes/lotes/page.tsx` | Separar contadores, porcentajes y cantidades de importes; dashboard ya usa `montoTexto` en valorización y `Intl.NumberFormat` para conteos. No convertir conteos/stock en moneda ni eliminar fracciones. |
| MON-12 | P2 | `app/(private)/recepciones/{page.tsx,[id]/page.tsx}` | Implementan `money()` local con Gs 0, pero **usan `lib/mocks/recepciones-storage` (DEMO)**. Identificar explícitamente, no tratar demo como recepción operativa real ni ampliar este alcance a rehacer el módulo. |
| VIS-01 | P0 | `app/(private)/reportes/ventas/page.module.css::.informativo` | `display:grid; grid-template-columns:repeat(auto-fit,minmax(420px,1fr))`: dos tarjetas de anchura limitada para seis columnas. `.informativo > section {overflow:hidden}` combinado con `.tablaChica th,td {white-space:nowrap}` y ancho de tabla `100%` **recorta «Importe informativo» en el borde derecho**. Reproducido por captura de CASA MINGO. |
| VIS-02 | P1 | `app/(private)/reportes/ventas/page.tsx` encabezados de sección | `No computan por estado fiscal` y `Anomalías: aprobados sin información fiscal conciliable` son demasiado largos para un encabezado de tarjeta angosta; texto explicativo y subtítulo ocupan área excesiva. Acortar título y dejar explicación completa en subtítulo legible. |
| VIS-03 | P1 | `components/ui/lista-padrao/reporte.module.css::.summaryGrid`, `.summaryCard strong` y `app/(private)/reportes/ventas/page.tsx` | 5 KPI en cinco columnas a ≥1400px; los importes de 8 decimales consumen espacio y deterioran jerarquía. Corregir moneda primero, después tamaños/espaciado y saltos; no aplicar estilos globales de todos los reportes sin analizar. |
| VIS-04 | P1 | `components/ui/lista-padrao/reporte.module.css::.tableWrap`, `.table` | Tabla de 12+ columnas de Resumen ya tiene scroll horizontal interno; NO confundir su scroll legítimo con **corte por overflow oculto** de «No computan». Mantener encabezados, tabla/filtros y PDF/Excel. |

## 3. Distribución de formatos detectada por área (sin cambios de código)

- **Ventas E5 / PRO-296:** 5 KPI por moneda, alertas de estado, anomalías, 6 vistas, subtotales y totales de documentos, ventas por producto/cliente/vendedor/mes. Deben recibir contexto `moneda` por registro. PYG nunca mostrará 8 decimales fiscales en sus valores VISUALES.
- **Otros reportes:** Valorización (monto base), Kardex (moneda por movimiento), Stock Crítico (moneda propia), Stock General/Lotes (cantidades; no importes salvo nuevos campos), índice.
- **Facturación:** Nueva factura, nota de crédito, documentos electrónicos, modales y componentes de medios de pago; preservar inputs/precios exactos, tipo de cambio y PDF proveedor.
- **Inventario:** Stock General/Detalle, Movimientos General/Detalle/Alta, Reposición, Compras Entradas y Recepciones. Separar saldo/cantidad/costo unitario y moneda base.
- **Maestros comerciales:** Productos (listado, edición, pestañas), listas de precio (listado/edición), catálogo, clientes y proveedores. Los últimos no deben recibir cambios si no presentan dinero: inventario de cero impacto también es válido.
- **Dashboard:** monetización de valoración distinta de indicadores de cantidad/conteo.

## 4. Layout exigido para Informe de Ventas

1. **Nunca cortar** las columnas `Tipo | Estado fiscal | Moneda | Documentos | Enviados sin aprobación | Importe informativo`. Preferir tarjetas a ancho completo en contenedor insuficiente o grilla con cambio de 1 a 2 columnas solo si ambas tablas caben; un wrapper `overflow-x:auto` dentro de la tarjeta debe existir incluso en desktop, con scrollbar visible/accesible, no `overflow:hidden` que silencie el dato. No exigir desplazamiento horizontal de toda la página.
2. Reducir texto de títulos a **«Documentos no computados»** y **«Anomalías fiscales»**. Conservar la explicación en línea secundaria corta (sin perder significados SIFEN: excluidos de netos; aprobados sin JSON conciliable). Título compacto (~13px) y subtítulo más discreto, respetando contraste y altura adaptable. No sustituir términos fiscales por abreviaturas ambiguas.
3. El importe de `Importe informativo` usa la moneda de SU fila; recorte nunca confundido con cero. Si hay 2 monedas/estados, todas las filas y columnas deben ser visibles.
4. Tarjetas KPI con nombres legibles y valores 0/2 decimales compactos; PDF/Excel, layout de tablas de detalle y filtros conservados. Mismo comportamiento en 360, 768, 1024, 1366, 1600 y 1920px; navegadores modernos, zoom 125% y 200%.
5. Evitar `text-overflow:ellipsis` para cifras fiscales, tamaños desbordados, títulos enormes, overlay, scroll global horizontal o altura fija que recorte filas.

## 5. Validación funcional y trazabilidad

- Probar en código el formato de `0, -0, 0.499999, 0.5, -0.5, 142090.90909092, 1420909.09090908, 999999.99999999` en PYG y `1.234, 1.235, -1.235, 1234.5, 1234.56789` en USD, BRI/BRL cuando aplique, números enormes como TEXTO, null y inválidos (no fabricar saldo ni dato).
- PYG 0 y USD ≤2 para todos los **importes visibles**; cantidades como 0,0001 conservadas; moneda por fila para pantallas mixtas; signo de FE/NCE intacto; datos exactos en API/DB/JSON/XML/SIFEN y en exportaciones XLSX.
- Comparar KPI Resumen ventas con tabla Resumen, Documentos, Producto, Clientes, Vendedores, Meses, fechas/filtros de período y estado fiscal. Nunca sumar valores visuales redondeados como nueva fuente del total.
- Señalar en auditoría diferencias deliberadas de costo unitario de alta precisión y tasas: diferenciarlas de moneda del valor TOTAL.
- Evidencia visual de cada módulo o al menos captura/registro de checklist por pantalla, incluidas anchuras y zoom. **Los hallazgos de código están comprobados, no hay auditoría browser ejecutada ni homologación.**
- Prioridad: 1) normalizar visualización monetaria y casos por moneda (PRO-335 actualizado); 2) layout Informe Ventas (issue propio); 3) pruebas/homologación autorizadas. Ejecutar **una orden de código por vez**, pedir SHA y auditoría estática independiente al concluir.

**No se ha corregido ninguna pantalla, ni autorizado build/test/VM/deploy en esta auditoría.**
