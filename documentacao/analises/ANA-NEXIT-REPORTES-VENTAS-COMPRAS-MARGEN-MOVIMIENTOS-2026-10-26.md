# Análisis funcional y técnico — Reportes operativos (Ventas/Compras), rentabilidad y cantidades de Movimientos
**Fecha:** 26/10/2026 · **Proyecto:** NEXIT / Casa Mingo · **Idioma UI:** español (Paraguay) · **Branch:** `feature/NEXIT-2026-001-banco-demo`

**Origen:** solicitud del cliente de agregar `Informe de Ventas` e `Informe de Compras` en `Reportes operativos`; condicional: «Si es posible algún reporte Gerencial con Costo, Ventas, Ganancias Brutas»; y en `Movimientos de stock` dejar los enteros sin decimales. La captura proporcionada es una **propuesta visual**, NO evidencia de que existan esos reportes. Esta edición es **especificación/análisis**; no declara implementación, pruebas, homologación o migraciones.

## 1. Comparación de ERP reales (referencias oficiales)
- **SAP Business One:** Sales Analysis por productos, grupos, representantes y periodo (anual/mensual/trimestral); Purchase Analysis por proveedor/producto/periodo; Web Client permite análisis de ventas y rentabilidad con detalle. Referencias:
  - https://help.sap.com/docs/SAP_BUSINESS_ONE/68a2e87fb29941b5bf959a184d9c6727/4509430165e16c32e10000000a114a6b.html
  - https://help.sap.com/docs/SAP_BUSINESS_ONE/68a2e87fb29941b5bf959a184d9c6727/0cf99411e2da4260a21dbae8701f23c3.html
  - https://help.sap.com/docs/SAP_BUSINESS_ONE_WEB_CLIENT/2554bf7e9aa347729b0547a737e123ac/65dfd0213c0648868f7678a241412ae4.html
- **Odoo 19:** Sales Analysis por producto, cliente, comercial y periodo; medidas de valor, unidades, margen y pivotes; Purchase Analysis distingue ordenado/recibido, proveedor y evolución. Referencias:
  - https://www.odoo.com/documentation/19.0/applications/essentials/reporting.html
  - https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/purchase/advanced/analyze.html
- **ERPNext:** Sales Analytics, Item/Customer/Salesperson-wise, Gross Profit; compras diferencian Purchase Orders, Receipts, Purchase Invoices y Accounts Payable; cálculo de rentabilidad depende de costo histórico y devoluciones. Referencias:
  - https://docs.frappe.io/erpnext/sales-analytics
  - https://docs.frappe.io/erpnext/buying_reports
  - https://docs.frappe.io/erpnext/accounting-entries

**Conclusión de negocio:** NEXIT debe tener **dos informes de actividad distintos** (`Ventas` y `Compras`) y, condicionado a costeo histórico confiable, un tercero **`Rentabilidad bruta`**. No mezclar ventas facturadas con pedidos, compras con ingresos manuales de stock ni costo actual con costo histórico del producto vendido.

## 2. Inspección de la rama NEXIT (fuente = Git, NO base de datos operativa)
- `app/(private)/reportes/page.tsx`: solo cinco tarjetas reales: Stock general, Valorización, Kardex, Stock crítico y Lotes. No hay páginas ni endpoints `/reportes/ventas` ni `/reportes/compras`. `lib/navigation/menu.ts` tiene `REPORTES.VER` y rutas permitidas V1; las nuevas rutas deben agregarse de forma coherente a la navegación/autorización existente, sin tocar el catálogo de perfiles.
- `app/(private)/reportes/layout.tsx` y `lib/reportes/guard.ts`: guardas de sesión/empresa/alcance y `REPORTES.VER`, exportar solo con permiso. Patrón disponible en cinco reportes: filtros, paginación, tablas, Excel y PDF, snapshots de lectura y totales PostgreSQL `numeric` como texto.
- `documentacao/banco/nexit/v1/migraciones/NEX-047-facturacion-documentos-electronicos.sql`: `documentos_electronicos` almacena `empresa_id`, `sucursal_id`, `tipo`, `fecha_emision`, `moneda`, `total numeric(20,4)`, `estado_local`, `estado_sifen`; **estados de envío no son estados fiscales definitivos**. Documento de emisiones/payload histórico de FE requiere verificar los esquemas/versiones posteriores antes de informar cantidades o IVA por producto.
- `documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql`: `nce_origen` vincula NCE a FE y `nce_lineas` registra cantidades/montos acreditados por línea; NCE APROBADA consume saldo, NCE pendiente bloquea, rechazada no consume. Para el reporte distinguir fecha de emisión propia de NCE versus FE original, cancelación fiscal y motivos de devolución/descuento/bonificación/ajuste.
- `documentacao/banco/nexit/v1/migraciones/NEX-009-inventario-costos.sql`: `movimientos_inventario` + `movimiento_lineas` tienen `tipo_origen`, `documento_referencia`, `cantidad numeric(18,4)`, costos por línea cuando existen, y `inventario_costos` costo promedio móvil/valor **ACTUAL**. Un movimiento de origen `COMPRA` es entrada de stock, **NO una factura comercial de compra**: faltan vínculos documentales obligatorios a comprobante/ítems/proveedor/IVA, y puede ser movimiento manual.
- `app/(private)/recepciones/page.tsx` utiliza `lib/mocks/recepciones-storage`, y `types/recepciones.ts` incluye `RecepcionDemo`; el menú de Compras/Recepciones está fuera de `V1_HREFS` (no activo). **No comprobado un circuito real completo de compras**. No usar datos `mocks` ni `localStorage` para reportes.
- `lib/formato/listas.ts::formatearCantidad`: usa `Intl.NumberFormat('es-PY', {maximumFractionDigits:2})`. Ya muestra los enteros sin ceros decimales, pero puede redondear `0,0001` a `0` (violación de legibilidad de stock). En `app/(private)/movimientos/page.tsx` se usa para `mov.cantidad`; `app/(private)/movimientos/[id]/page.tsx` lo usa en detalle/lineas. No se encontraron expresiones `toFixed(4)` en esas visualizaciones; verificar otro origen/versionado si usuario ve decimales en la pantalla actual. **No tocar el PostgreSQL ni transformar la cantidad real en entero.**

## 3. Informe de Ventas — alcance funcional propuesto E5, PRO-296

**Ruta:** `Reportes → Reportes operativos → Informe de Ventas` (una tarjeta en índice; la navegación por módulos/permisos existente se mantiene). **Origen:** FE/NCE persistidas del NEXIT, nunca ventas ficticias, pedidos sin facturar ni registros de otra empresa. UI y exportación con mismas cifras exactas.

### Filtros
Periodo local Paraguay (desde/hasta, fecha de emisión del documento y mostrar zona horaria); sucursal autorizada; estado fiscal; tipo FE/NCE; cliente; vendedor **estructurado existente** (no inferirlo de nombre libre); producto/categoría si pueden trazarse líneas; moneda; agrupación: `Resumen`, `Por documento`, `Por producto`, `Por cliente`, `Por vendedor`, `Por mes`. No introducir filtros que el esquema real no pueda sustentar.

### KPI y vista ejecutiva
`Ventas aprobadas (sin IVA)`, `IVA trasladado`, `Total facturado (IVA incl.)`, `Notas de crédito aprobadas (neto e IVA)`, `Ventas netas`, `Cantidad de FE aprobadas`, `Pendientes` y `Rechazadas/canceladas` separados. Totales únicamente de documentos cuyo estado SIFEN definitivo sea APROBADO; si se incluyen ventas `ENVIADO/PENDIENTE` deben ser **sección informativa no sumada**. Para NCE: descontar de neto cuando sea APROBADA, sin deducir dos veces en joins y sin contabilizar NCE rechazada. Los descuentos ya aplicados a precios/FE no se restan otra vez. Separar por moneda (sin sumar PYG/USD) o usar exclusivamente tipo de cambio histórico documentado, nunca inventar.

### Grilla `Detalle de ventas`
Fecha/hora local; tipo y número de documento; CDC cuando exista; estado SIFEN y local; sucursal; cliente/documento; vendedor cuando exista identificación estructurada; producto/código, unidad y cantidad cuando el payload histórico permita rastrearlo; precio/base imponible sin IVA; IVA 5/10/exento; monto total; NCE vinculada y motivo. En `Por documento` una fila por FE/NCE; en `Por producto` una fila por línea; **no duplicar totales de documento por cada línea**. Acción de ver comprobante original si el alcance/permisos lo permiten.

### Criterios operacionales
Server-side ACL por empresa/sucursal, paginación con totales de todos los filtros (no solo página), Excel/PDF con el mismo filtro y resultados, `numeric` exacto sin float, consulta consistente/snapshot, sin interpolación SQL ni exposición cruzada. Definir tratamiento de fechas NCE: criterio primario del periodo = fecha de la NCE, documento original solo para trazabilidad (y distinguir ajustes de períodos anteriores). Antes de implementar, inspeccionar migraciones vigentes/payload real y su histórico, esquemas FE/NCE, `cliente_id` y vendedor, reglas de cancellation, permisos existentes y tests/auditorías. No presumir que todos los documentos del periodo tienen costo ni líneas completas.

## 4. Informe de Compras — **primero puerta de procedencia E6**, PRO-297

**Ruta deseada:** `Reportes → Reportes operativos → Informe de Compras`. **No habilitar tarjeta como enlace funcional hasta disponer de origen verificable**. 
Modelo ERP correcto distingue `Orden de compra` (compromiso), `Recepción` (ingreso físico), `Factura del proveedor` (compra documentada), `Devolución/NC del proveedor` (corrección). No sumar los tres como compras.

### Alcance cuando exista documento de compra real
Filtros: periodo documental, proveedor, sucursal, producto/familia, moneda, estado y fuente. KPIs: `Compras documentadas sin IVA`, `IVA compras`, `Total compras`, `Devoluciones/ajustes`, `Compras netas`, `Órdenes pendientes` y `Recibido no facturado` **solo si las dos últimas fuentes existen**. Vista `Por documento`, `Por proveedor`, `Por producto`, `Por mes`; columnas fecha, comprobante/RUC, proveedor, sucursal, producto/código, cantidad/unidad, costo unitario, descuentos, base imponible, IVA y total, moneda, estado. Comprobante, recepción y stock vinculados con identificadores trazables. Exportaciones Excel/PDF con las mismas reglas de scope/moneda/redondeo y totales.

### Puerta A obligatoria
El Claude debe **inventariar en Git, SIN ejecutar SQL ni VM** si hay realmente tablas, procedimientos y APIs que registren encabezado, ítems, proveedor, total, impuestos, fecha/estado y devolución; comparar migraciones, rutas y acceso V1. Si no existen, **detener la implementación del informe de compras** y documentar dependencias; solicitar decisión empresarial acerca de un flujo comercial de compras mínimo. No simular compras desde `tipo_origen='COMPRA'` ni desde Recepciones DEMO. Una vista de `Entradas de stock con origen compra` podría ser informe OPERATIVO DE INVENTARIO, **no** `Informe de Compras`, y requiere aprobación independiente.
**Puerta B:** recién tras confirmarse fuente real, diseñar query segura, agregaciones y reconciliación. No crear módulo de Compras por iniciativa propia.

## 5. Informe Gerencial — Rentabilidad bruta (CONDICIONAL, no confundir con E5/E6)

Referencia de ERP: `Ventas netas sin IVA − Costo histórico de productos realmente vendidos = Ganancia bruta`. `Margen bruto (%) = Ganancia bruta / Ventas netas sin IVA × 100`, si denominador positivo. `Costo del inventario actual` o `último precio de compra` **no sustituyen** costo al momento de la venta. El coste de un periodo NO es necesariamente `Compras del periodo`.

Datos a auditar: movimientos `SALIDA / VENTA` vinculados inequívocamente a cada FE y con `movimiento_lineas.costo_total` histórico, stock de salida FE y fecha de reconocimiento, líneas `FE/NCE` aprobadas, costo de servicios/no-stock, ajustes y devoluciones, eventual reversión/cancelación, multimoneda, productos sin cobertura de costo. Documentación `NEX-067` contempla baja de stock al emitir (antes de aprobación fiscal) y NCE V1 **no mueve stock automáticamente**: no presentar margen como contable/definitivo sin reconciliar estas reglas.

**Regla del informe:** si falta costo/relación de algún artículo, marcar `Sin costo confiable`, desglosar cobertura y NO mostrar una rentabilidad general aparentemente exacta sumando solo una parte. No crear tarjeta activa, fórmulas ocultas ni mock. `Ganancias Brutas` fue condicional «si es posible»: preparar viabilidad, no implementar sin decisión expresa y fuente confiable. Restringir visualización de costos a permisos ya aprobados en el sistema; no inventar un nuevo perfil/menú, sí documentar necesidad de autorización a costos gerenciales.

## 6. Movimientos — cantidades sin ceros innecesarios, PRO-295 / PRO-79

**Interpretación segura del pedido:** `1.0000 → 1`, `100.0000 → 100`, `2.5000 → 2,5`, `0.0001 → 0,0001`, `-1.2500 → -1,25` (es-PY, miles con punto). **No** truncar/round a entero: `0,0001 → 0` oculta stock y confunde al operador. Cuatro decimales cuando existen porque `movimiento_lineas.cantidad numeric(18,4)`.

**Código actual confirmado:** `lib/formato/listas.ts::formatearCantidad` ya omite decimales de enteros, pero tiene `maximumFractionDigits:2`. La UI de listado y detalle de Movimientos importa esa función. El pedido quizá se refiere a versión desplegada distinta del Git; no afirmar defecto `1,0000` en la rama actual.

**Acción técnica focal autorizable:** primero identificar íntegramente todos los campos de cantidad de `Movimientos` (listado/detalle y resultado de registro; NO cambiar inputs de captura que admiten 4 decimales) y toda reutilización de `formatearCantidad`. Aplicar **formato de presentación hasta 4 decimales sin ceros finales** solo donde sea pertinente, usando mecanismo que no redondee una fracción representable; revisar exportación relevante si existe. Elegir un helper específico de Movimientos si modificar formatter compartido impactaría pantallas ajenas. No modificar `cantidad` en JSON/API, PostgreSQL, cálculos, validaciones, saldos, movimientos históricos ni `precios`. Preservar cantidades reversas, 0, null, localización y unidad. Sin ejecución de pruebas/VM/deploy por IA.

## 7. Orden de implementación / rastreo existente
- **E4 / PRO-295 y PRO-79:** revisión/apariencia de cantidades de movimientos. Solo cambio dirigido si la discrepancia está comprobada; commit/push; auditoría independiente.
- **E5 / PRO-296 y PRO-108:** `Informe de Ventas` con FE/NCE reales, permisos, exportación y reconciliación. Requiere revisión técnica de fuentes primero. No avanzar mientras E4 no esté auditada, salvo nueva instrucción del responsable.
- **E6 / PRO-297 y PRO-108:** **inspección de fuente de Compras primero**; si no hay proveedor/comprobante/ítems/importe fiscal real, dejar bloqueado sin fingir un informe, documentar alternativa y pedir decisión. No iniciar expansión de módulo Compras.
- **Gerencial:** factibilidad separada, pendiente confirmación; no autoincluirlo en E5/E6.
- Reusar issues existentes, no duplicar; mantener `In Review`/`Todo` según estado real. La homologación visual en el ambiente único corresponde al responsable. La interfaz actual fue auditada en Git, no en navegador.

**Prohibiciones:** no ejecutar tests, lint, build, CI, VM, SQL/migrations/runner, gateway/SIFEN, emisión real o deploy sin autorización; no leer credenciales, no inventar datos ni reportar implementación antes de commits verificados.
