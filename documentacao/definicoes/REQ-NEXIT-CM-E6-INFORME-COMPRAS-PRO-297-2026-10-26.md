# E6 / PRO-297 — Informe de Compras — especificación funcional y gate de fuente real
**Fecha:** 26/10/2026. **Proyecto:** NEXIT Casa Mingo V1. **UI:** español (Paraguay), escritorio.
**Estado:** ANALIZADO Y BLOQUEADO PARA IMPLEMENTACIÓN COMERCIAL porque aún NO se ha comprobado una fuente de documentos de compra realmente operativa en la V1. Este documento no autoriza cambios de esquema, formularios de Compras, datos sintéticos ni despliegue.
**Responsables:** ChatGPT analiza/especifica, audita Git y mantiene Linear; Claude SOLO desarrolla con orden técnica formal; titular aprueba ampliación de negocio y homologa ambiente.

## 1. Pedido y alcance
El cliente pidió una tarjeta llamada "Informe de Compras" en "Reportes operativos", acompañando el Informe de Ventas (E5: auditoría estática R03 conforme, datos reales/VM/browser todavía sin homologación). El reporte gerencial de costos y ganancias brutas es OPCIONAL y no forma parte de E6.
Patrones comparativos ERP:
- Odoo 19: https://www.odoo.com/documentation/19.0/es/applications/inventory_and_mrp/purchase/advanced/analyze.html (distingue cantidades ordenadas, recibidas, facturadas; total con/sin impuesto).
- ERPNext: https://docs.frappe.io/erpnext/buying_reports y https://docs.frappe.io/erpnext/purchase-invoice (distingue orden, recepción física, factura y pago).

## 2. Evidencia verificable en GitHub — no inspección del PostgreSQL operativo
- El conjunto documentacao/banco/nexit/v1/migraciones contiene NEX-006 (maestros proveedores), NEX-009 (movimientos stock/costo promedio), NEX-014 (movimientos) y evoluciones hasta NEX-074; en el inventario de 1256 archivos del HEAD 8493c148be474284c5cbe0550b71675e755b0f4d NO aparece ninguna migration V1 de factura del proveedor con sus líneas, documentos de NC de proveedor, ordenes de compra reales ni recepciones comerciales.
- SI existe el modelo conceptual/histórico documentacao/banco/nexit/fontes-historicas/004_compras_inventario.sql con solicitudes_compra, ordenes_compra, recepciones_compra, facturas_proveedor, factura_proveedor_recepciones y devoluciones_proveedor. Pero documentacao/banco/nexit/INVENTARIO-SQL-LEGADO-2026-10-09.md clasifica estos SQL como FUENTES HISTÓRICAS, NO MIGRACIONES APROBADAS O EJECUTADAS. No copiarlos ni dar por hecha su compatibilidad. En ese SQL hay cabecera facturas_proveedor y enlace a recepciones, pero NO se identificó tabla de líneas propias de factura proveedor; no es legítimo atribuir detalle/IVA facturado a líneas de recepción sin reconciliación comprobada.
- app/(private)/recepciones/page.tsx y nuevo/page.tsx dependen de lib/mocks/recepciones-storage.ts, RecepcionDemo y localStorage. El mock llega a invocar crearMovimientoStockDemo con origen COMPRA: no persiste factura comercial real en PostgreSQL, por tanto está prohibido alimentar el Informe de Compras con esa UI.
- lib/navigation/menu.ts propone grupo Compras con permisos COMPRAS.VER, pero sus rutas /solicitudes, /ordenes, /recepciones y /devoluciones no están en V1_HREFS. El grupo oculto y las pestañas "Compras" de proveedores/productos son configuraciones, no documentos de compra registrados.
- NEX-009 movimientos_inventario.tipo_origen permite COMPRA, documento_referencia es texto libre; movimiento_lineas tiene cantidad y costos de inventario, NO proveedor obligatorio, factura proveedor, RUC, IVA fiscal, documento por línea ni vínculo comercial indubitable. inventario_costos es saldo valorizado ACTUAL, no costo histórico de factura de proveedor.
- documentos_electronicos del NEXIT son FE/NCE EMITIDAS en el circuito de ventas y no compras de terceros; nunca reutilizar sus montos en E6.
- Este diagnóstico corresponde SOLO a la rama Git, sin SQL ni acceso al PG real. Si el responsable tiene un módulo/fuente externa ya real, documentar con su contrato antes de decidir.

**Resultado del gate A: BLOQUEO COMPROBADO EN LOS ARTEFACTOS V1 VERSIONADOS. No emitir Informe de Compras con KPI comercial hasta identificar/aprobar una fuente de comprobantes trazables.**

## 3. Conceptos de negocio — diferencia imprescindible
- ORDEN DE COMPRA = compromiso/solicitud, no compra facturada.
- RECEPCIÓN = entrada física de bienes, no comprobante comercial ni impuesto de proveedor automáticamente.
- FACTURA DEL PROVEEDOR = compra documentada, reconocida una vez por número/documento, proveedor, empresa y estado válido.
- PAGO A PROVEEDOR = cancelación parcial/total de deuda, jamás otra compra.
- NOTA DE CRÉDITO DEL PROVEEDOR = ajuste comercial documentado, resta una vez, período de su propia fecha.
- DEVOLUCIÓN FÍSICA SIN NC = reversión de stock, NO reducción fiscal automática de facturación proveedor.
No sustituir factura con precio de referencia de productos, costo promedio actual ni entrada con origen COMPRA.

## 4. Contrato mínimo para que el informe sea real
Origen factura de proveedor por empresa/sucursal con:
- proveedor_id y snapshot fiscal del nombre/RUC; tipo/numero de comprobante, timbrado cuando corresponda, fecha de emisión, fecha de registro, moneda, estado comercial real, subtotal antes de IVA, IVA histórico por tasa/exento, descuentos y total con IVA; número único idempotente por empresa/proveedor/tipo/comprobante.
- líneas de factura históricas: ordinal, producto_id opcional (servicio/concepto no inventariado permitido), código/descripción/unidad snapshot, cantidad exacta, precio/costo unitario, descuentos, base imponible, IVA y total de ítem. Comprobante sin líneas reconciliables no debe mostrarse como compra por producto.
- NC del proveedor y vínculos válidos con factura original, montos y líneas; documentos anulados/rechazados/duplicados identificables.
- vínculos opcionales a OC y recepciones con trazabilidad de cantidades facturadas/recibidas; no multiplicar montos al unir 1:N.
- estatus BORRADOR no computa; REGISTRADA/CONFIRMADA y luego PARCIAL_PAGADA/PAGADA (si así se define en flujo operativo aprobado) deben representar UNA compra, no nuevas compras; ANULADA no computa y se informa aparte.
- Valores numeric exactos y datos históricos inmutables/auditables. No inferir IVA por tasa de catálogo actual.
Ningún punto implica autorización automática para implementar nuevos módulos o migrations.

## 5. Indicadores por moneda (sin conversiones inventadas)
- Compras documentadas con IVA = suma facturas proveedor válidas y registradas.
- IVA de compras = IVA histórico realmente informado en esas facturas.
- Compras sin IVA = compras con IVA − IVA compras.
- NC de proveedores con IVA e IVA NC por separado.
- Compras netas con IVA = compras brutas con IVA − NC con IVA.
- IVA neto = IVA compras − IVA NC.
- Compras netas sin IVA = neto con IVA − IVA neto.
- Conteos independientes de documentos válidos, borradores, anulados, anómalos; si no hay fuente NO mostrar cero o totales ficticios.
- Período basado en la fecha del comprobante proveedor; NC imputa a su propia fecha, no al mes de la factura original. La fecha de recepción y la de registro son atributos distintos.
- Mantener PYG/USD/BRL separados, siempre mostrar moneda; nunca sumar saldos multimoneda.

## 6. Diseño del Reporte futuro (cuando se apruebe fuente)
Ubicación: Reportes → Reportes operativos → Informe de Compras, DESKTOP. Reusar guards/reportes existentes: REPORTES.VER, REPORTES.EXPORTAR, empresa/sucursal desde sesión y sucursal_en_alcance en servidor, snapshot lectura consistente, export XLSX/PDF y paginación con totales de TODOS los filtros.
Filtros: desde/hasta, sucursal autorizada, proveedor, tipo/estado, moneda, producto/código, referencia/número documento, agrupación.
Vistas:
1. RESUMEN: KPIs documentales por moneda, estado e incidencias.
2. DOCUMENTOS: 1 fila por comprobante, fecha, proveedor, RUC, número, total con IVA, IVA, neto, estado y moneda.
3. PRODUCTOS: líneas FACTURADAS originales, cantidades por UM sin sumar unidades diferentes, costo unitario histórico, IVA y monto, NC identificadas; no usar recepción como línea de factura sin prueba.
4. PROVEEDORES: sumar por identificador real y snapshot, no por similitud de nombre.
5. MESES: período de emisión propio de factura/NC.
Si se quiere analizar compras pendientes y recibidas, incluir más adelante bloques separados de OC y recepción cuando existan fuentes; NO sumarlas al indicador de compra facturada.
Exportaciones y pantalla comparten filtros/reglas/numeric y reportan datos incompletos sin convertirlos en cero. Error 401/403 si tenant/permiso incorrectos; si falta fuente, no habilitar tarjeta sin ruta/datos reales.

## 7. Tres alternativas de origen, a decidir por el responsable
A. Integración a fuente externa ya real: exigir evidencia de documentos, ítems, IVA, NC y estados, con conexión/aprobación independiente.
B. Registro mínimo de facturas/NC recibidas de proveedores dentro del NEXIT: módulo transaccional nuevo + schema/migrations/seguridad; EXPANSIÓN DE ALCANCE, requiere autorización separada antes de orden para Claude.
C. Reporte operativo DISTINTO «Entradas de stock con origen COMPRA», basado en movimientos de inventario: mostrar solo cantidad/costo de entradas y calidad de referencia, sin afirmar IVA ni compra facturada. Debe tener nombre distinto y aceptación expresa.

**Sin elección aprobada o datos confiables, E6 sigue BLOQUEADA: no construir código de Informe de Compras ficticio y no activar tarjeta.**

## 8. Criterios futuros de aceptación (NO ejecutados)
- Orden 100 unidades, 2 recepciones 40+60, 1 factura por 100: 1 única compra, no triple conteo.
- 2 facturas parciales independientes: contabilizar 2 documentos distintos; pagos parciales no duplican.
- Factura sin recepción previa o de servicio: cuenta si documento válido, no exigir entrada a stock.
- Recepción DEMO o COMPRA manual sin factura: no cuenta como compra documentada.
- NC del proveedor octubre de compra septiembre: reduce octubre; devolución de stock sin NC no reduce compra fiscal.
- IVA 5/10/exento, dos monedas y proveedores con documentos repetidos: trazabilidad/conciliación sin doble conteo.
- Multiempresa/sucursal, permisos, exportaciones, documento de proveedor sin líneas, migración ausente: falla explícita, no fuga ni datos falsos.

## 9. Gobernanza y restricción
No iniciar migrations/SQL, VM, Docker, tests/build/lint/CI, navegador, despliegue, integración fiscal ni cambios de perfiles sin aprobación. No tocar E5 Ventas, Stock ni movimientos operativos para simular facturas proveedor. ChatGPT mantiene Linear/Git de reglas y auditorías; Claude exclusivamente desarrollo mediante orden autorizada.
