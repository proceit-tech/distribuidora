# NEXIT V2 — Auditoría funcional por menú y backlog de evolución
**Fecha:** 2026-10-10 · **Estado:** documento inicial de análisis; NO autoriza implementación ni cambios en V1.  
**Base:** código y menú de la rama `feature/NEXIT-2026-001-banco-demo`, formularios de Clientes, Proveedores, Productos y Listas de precios, y documentación pública de SAP Business One, Odoo y Oracle NetSuite.  
**Leyenda:** **E** = campo/función observado en pantalla o implementación V1; **P** = existe parcialmente o falta probar; **N** = propuesta nueva V2 (no afirmar que está implementada). Prioridades **P0** = necesario para cerrar operación; **P1** = ventaja competitiva / eficiencia; **P2** = evolución posterior.

## 0. Arquitectura y principios obligatorios
- Toda entidad de negocio tiene UUID interno y `empresa_id` UUID, claves foráneas y autorización servidor por empresa; los códigos visibles (empresa = RUC sin DV) son textos independientes de las PK.
- Reutilizar el modelo PostgreSQL, migraciones versionadas, APIs y diseño actual. No retirar campos de V1 por ausencia de tablas; completar modelo mediante migrations.
- Multiempresa, multisucursal y multidepósito. Cada operación debe indicar origen, destino, usuario, fecha, estado y documento referenciado cuando aplique.
- Dinero: separar moneda, tipo de cambio, costo, precio, impuestos, descuentos y redondeos; usar `numeric`, no `float`. Costos de inventario siempre trazables.
- Paraguay: RUC/DV, geografía local, IVA/SIFEN, unidades y moneda Gs.; importaciones/exportaciones deben considerar documentos aduaneros y tributarios **configurables**, sujetos a validación jurídica/fiscal; no asumir que las reglas de otros países aplican en Paraguay.
- Toda futura V2 debe tener criterio de aceptación, permisos, auditoría y exportación/importación XLSX cuando sea pertinente.

## 1. Matriz de estado de los menús actuales
| Menú / ruta | Estado observado en GitHub | Evolución V2 sugerida | Prioridad |
|---|---|---|---|
| Login, sesiones, perfiles | E: login real, UUID y autorización por perfil; no hay gestión completa de usuarios | recuperación de contraseña, MFA opcional, sesiones visibles, dispositivos, auditoría y políticas por rol | P0 |
| Plataforma > Empresas `/administracion/empresas` | P: listado real, sin CRUD global completo | alta, onboarding, estados, planes, sucursales, límites y soporte con acceso delegado auditado | P0 |
| Clientes `/clientes` | E: lista, nuevo, detalle, edición y catálogos reales; edición de hijos incompleta | contactos, direcciones y documentos editables; grupos económicos, crédito, scoring, condiciones por sucursal, precios contratados | P0 |
| Proveedores `/proveedores` | E: lista, nuevo, detalle y edición con hijos | proveedores extranjeros, datos aduaneros, bancos/SWIFT, lead time real, contratos, certificados, evaluación y homologación | P0 |
| Productos `/productos` | E: ficha extensa, familia/línea, GTIN, NCM, stock y costo consultado, apertura de inventario | atributos/variantes, fotos/adjuntos, equivalencias UOM, kits, seriales, empaque, CBM, clasificación arancelaria, fichas multiidioma | P0 |
| Listas de precios `/listas-precio` | E: venta/compra, vigencia, ítems, escalones y reglas, precio referencia | promociones, promociones por canal/volumen/cliente, simulador de margen y aprobación de excepciones | P1 |
| Movimientos `/movimientos` | En desarrollo por Claude al redactar este documento; último código inspeccionado era mock | entradas/salidas, transferencias, ajustes, reversas, trazabilidad, aprobación y conteo cíclico | P0 |
| Stock `/stock` | Mock en revisión: `obtenerStockDemo`, markup demo | saldos reales disponible/reservado/cuarentena/tránsito, ubicaciones y valorización | P0 |
| Dashboard `/dashboard` | Fijo/DEMO; hay enlaces a rutas sin implementación | dashboards operativos con drill-down y KPIs por empresa/sucursal | P1 |
| Reportes `/reportes` | No funcional homologado, ruta referenciada | generador de informes, XLSX/PDF, exportaciones programadas, permisos por dato | P1 |
| Usuarios/Roles `/administracion/usuarios`, `/administracion/roles` | Sin CRUD administrativo V1 comprobado | gestión real, roles jerárquicos, restablecer contraseña, alcance por sucursal/depósito | P0 |
| Compras `/solicitudes`, `/ordenes`, `/recepciones`, `/devoluciones` | Menú definido, oculto/no homologado en V1 | flujo completo RFQ→OC→recepción→factura→devolución | P0 |
| Ventas `/pedidos`, `/ventas`, `/entregas` | Menú definido, oculto/no homologado en V1 | cotización→pedido→reserva→picking→factura→entrega→cobro | P0 |
| Finanzas `/finanzas/*` | Menú definido, no homologado | cuentas por cobrar/pagar, caja, bancos, conciliación, moneda, crédito | P1 |
| Facturación `/facturas`, NC, NR, documentos, SIFEN | Menú definido; integraciones fiscales no homologadas en este ERP | emisión, estados CDC/KuDE, contingencia, notas, conciliación fiscal y monitoreo | P0/P1 |
| Vendedores, Zonas/Rutas, Depósitos, Reposición | Menú definido; sin CRUD confirmado | territorios, rutas, almacenes, reposición y pronóstico | P1 |
| Configuración/Auditoría | Menú definido, aún sin funcionamiento completo | parámetros por empresa, trazas, logs, aprobaciones | P0 |

## 2. Menú por menú — campos, funciones y mejoras

### A. Plataforma, empresas, seguridad y organización (P0)
**E:** autenticación multiempresa, empresa UUID, código textual de login; vista global de empresas.
**N — Empresa:** tipo contribuyente, RUC/DV y validación, nombre legal/comercial, país, dirección fiscal, moneda base, zona horaria, logo, contactos técnicos/financieros, estado, plan, fecha de vigencia, prefijos de numeración, comprobantes digitales y almacenamiento.
**N — Operación:** wizard alta empresa → sucursal → depósito → administrador; plantillas de roles; clonación de catálogos permitidos, nunca de movimientos; activación/suspensión reversible.
**N — Usuarios:** nombre y apellido, documento, correo, teléfono, estado, último acceso, sesiones activas, expiración, cambio obligatorio, reestablecimiento sin contraseña previa por administrador autorizado; MFA y auditoría de acceso. Separar rol global de rol empresa.

### B. Clientes (P0)
**E:** naturaleza tributaria, RUC/DV, persona, país, razón social/fantasía, teléfonos/correos, grupo, pago, moneda, lista de precios, crédito, bloqueo comercial, vendedor/zona/ruta, GLN, direcciones, contactos y documentos al crear.
**Brechas concretas:** edición de contactos/direcciones/documentos existentes; proceso formal de desbloqueo de crédito; carga masiva; geocodificación (opt-in).
**N — Campos:** matriz sucursal/dirección entrega, contacto de compras y cuentas a pagar, horarios/ventanas de entrega, límites por moneda, garantías, días de cobranza, responsable comercial, segmento, industria, zona tributaria, canal B2B/B2C, preferencia de comprobante, observaciones privadas y políticas de devolución.
**N — Funciones:** crédito disponible considerando cuentas pendientes + pedidos, condiciones por acuerdo comercial, historial de pedidos/reclamos, precios especiales, historial de cambios, importación XLSX con preview/duplicados, bloqueo por mora sujeto a aprobación.

### C. Proveedores (P0)
**E:** identificación, persona, grupo, país, contactos, direcciones, cuentas bancarias, retenciones, documentos, condición/medio de pago, moneda, homologación, riesgo e Incoterm.
**N — Campos internacionales:** país de expedición/origen, exportador/fabricante, tax ID extranjero, IBAN/SWIFT/BIC, cuenta por moneda, agente de carga, transitario, contacto comercial, Incoterm versión 2020 y lugar convenido, puerto origen/destino, lead time, MOQ, multipack, documentación de origen y certificaciones.
**N — Funciones:** solicitud de cotización a múltiples proveedores, matriz comparativa, aprobación de OC, contratos y precios negociados, scorecard entregas/calidad, vencimiento certificados, reclamos y notas de débito/crédito proveedor, portal proveedor posterior.

### D. Productos y catálogos (P0)
**E:** descripción interna/factura, categorías, marcas, familias/líneas, UOM, impuestos, GTIN/códigos, NCM/partida, peso/dimensiones, proveeduría, kit, inventario inicial, precio referencia, control de stock, merma y vencimiento.
**Brechas:** pantallas CRUD de familia/línea/categoría/marca; archivo adjunto real; ubicación preferida por depósito; movimientos de apertura trazados por lote/serie; catálogos de procedencia.
**N — Campos:** subfamilia, temporada, colección, SKU variante (tamaño/color/material), fabricante/país origen, HS/NCM por jurisdicción, presentación/unidad logística, CBM, peso bruto/neto, dimensiones caja/pallet, lote/serie obligatorio, FEFO/FIFO parametrizable, temperatura, frágil/peligroso (con controles), imágenes múltiples, productos equivalentes/sustitutos, unidad de compra/venta con conversión.
**N — Funciones:** importación masiva con validación previa, revisión duplicados por GTIN, historial del costo, lote/caducidad, etiquetas GS1/QR/barcode, combos/kit con costo desglosado, permisos para cambiar datos fiscales.

### E. Listas de precios (P1)
**E:** listas compra/venta, moneda, vigencia, productos, escalones y reglas por cliente/grupo/zona/canal; precio referencia enlazado con Productos.
**N:** pricelist por país/sucursal/canal, descuento con autorización, margen objetivo/mínimo, simulación de precios por costo puesto en depósito y tipo cambio, promociones, bundles, precio futuro programado, listas históricas, aprobación y auditoría de cambios, actualización masiva desde XLSX.
**Regla:** no inventar margen ni alterar precio cuando cambia el costo sin aprobación/configuración.

### F. Compras y abastecimiento (P0)
**N — Menús funcionales:** Requisiciones → Solicitud de cotización/RFQ → Comparación → Orden de compra → Recepción parcial/total → Factura proveedor → Devolución → Reposición.
**Campos OC:** empresa, sucursal, moneda, tipo cambio, proveedor, Incoterm, lugar entrega, depósito, fecha compromiso, condiciones pago, ítems, impuestos, descuento, flete estimado, estado, adjuntos; línea con cantidad pedida/recibida/facturada.
**Controles:** tolerancias recepción, tres vías OC-recepción-factura, aprobaciones por monto, entregas parciales, backorders, devoluciones y proveedor alternativo; movimientos generados por recepción, no ajuste manual.

### G. Importaciones, aduana y costo nacionalizado (P0 diferenciador)
**N — Menú Importaciones:** expedientes; órdenes internacionales; embarques; documentos; despacho aduanero; liquidación de costos; seguimiento de contenedores; recepciones y diferencias.
**Campos expediente:** número interno, proveedor/exportador, comprador/importador, moneda, tasa cambio, Incoterm/lugar, país origen/procedencia, puertos, BL/AWB, naviera/transportista, contenedor, ETD/ETA, agente aduanero, despacho, documentos, ítems, bultos/peso/volumen, seguro, flete, aduana, tasas e impuestos diferenciados, estado y fechas.
**Costo nacionalizado:** distribuir flete, seguro, gastos portuarios, almacenaje, honorarios y otros cargos por cantidad/valor/peso/volumen/manual; presentar FOB/CIF + total costo puesto depósito; diferenciar gastos capitalizables de impuestos recuperables conforme política contable/fiscal validada; no duplicar costos ni reconocer dos veces. Cálculo simulado vs real y conciliación posterior.
**Criterios:** costo unitario trazable por producto/lote/expediente, variación previsto-real y documentos de respaldo, aprobación antes de contabilizar. Pendiente definición fiscal paraguaya.

### H. Exportaciones y comercio exterior (P1 diferenciador)
**N — Menús:** pedido exportación, proforma, packing list, commercial invoice, certificados, aduana, transporte, despacho, entrega, tracking.
**Campos:** exportador, destinatario/importador, país destino, moneda, Incoterm/lugar, HS, origen, peso, volumen, bultos, packing, documentación y estado; integración FE conforme obligaciones aplicables.
**Controles:** precios de exportación, margen moneda/tipo cambio, requisitos documentales configurables por país, permisos, auditoría, aceptación de carga y trazabilidad de entrega.

### I. Movimientos, almacén y stock (P0)
**E/P:** modelo de inventario y vistas de saldo/costo; interfaz Movimientos se está conectando a DB en paralelo; Stock actual todavía exhibe mock.
**N — Movimientos:** recepción, salida, transferencia, ajuste positivo/negativo, anulación/reversa, devolución cliente/proveedor, cuarentena, reservas, stock tránsito, lotes/series, justificación, documento origen, aprobaciones e historial inmutable.
**N — WMS liviano:** depósitos, zonas, pasillos, estantes, bins/ubicaciones, reglas putaway, picking por ola, packing, cross-docking, lector código de barras y GS1, conteo cíclico, inventario físico, tareas móviles, reposición min/max y FEFO.
**Saldos:** físico/disponible/reservado/cuarentena/en tránsito y de terceros, por producto/depósito/ubicación/lote; valor costo separado de venta; evitar `markup demo`.
**Riesgos:** reserva concurrente, movimientos parciales, serial duplicado, transferencia sin recepción destino, costo de devoluciones y stock negativo.

### J. Ventas, distribución y entregas (P0)
**N — Flujo:** cotización → pedido → validación crédito → reserva → picking → packing → despacho → documento fiscal → entrega (POD) → cobranza/devolución.
**Campos pedido:** canal/cliente, RUC, dirección entrega, vendedor, ruta, lista precio, moneda/tipo cambio, promoción, depósito, stock reservado, estado, fecha promesa, prioridad, notas, adjuntos, OC cliente y referencia externa.
**Distribución:** rutas por zona/vehículo/chofer, consolidación de entregas, ventanas horarias, optimización opcional, aplicación móvil POD con firma/foto/hora/GPS (privacidad), entregas fallidas y reintentos, logística inversa; costos por entrega y margen ruta.
**B2B:** pedidos vía portal cliente, catálogo por cliente y límites, integración EDI/API para supermercados, GLN/GTIN y confirmaciones.

### K. Facturación PY/SIFEN y documentos (P0/P1)
**N:** circuito facturas, notas de crédito, notas de remisión, anulaciones/eventos, CDC, KuDE PDF/QR, timbrados/series, estados/reintentos, reconciliación de documentos y ventas; API fiscal externa según arquitectura actual.
**Controles:** no contabilizar venta como aceptada fiscalmente antes de estado correspondiente; duplicados/idempotencia; cierre contra documentos; reglas SIFEN vigentes según validación con proveedor y normativa actual. No trasladar formatos de otros países.

### L. Finanzas y tesorería (P1)
**N:** cuentas por cobrar/pagar, anticipos, cuotas, conciliación bancos y alias, gestión caja/arqueos, multi moneda/tasa histórica, cobranzas, morosidad, conciliación proveedor, costos logísticos y reportes de margen.
**Campos:** documento, fecha, vencimiento, moneda, tasa, cuenta contable, centro de costo, referencia bancaria, estado conciliación.

### M. Dashboard, BI y reportes (P1)
**N — Operación:** ventas, pedidos pendientes, fill-rate/OTIF, quiebres, rotación, cobertura en días, aging de lotes y cuentas, inventario valorizado, margen bruto, diferencias de recepción, compras por proveedor, costos importación previsto-real.
**N — Funciones:** filtros empresa/sucursal/deposito/fecha/canal, drill-down hasta comprobante, XLSX/CSV/PDF, programaciones y permisos de reportes; calidad de datos y alertas.
**Prohibición:** no inventar KPIs ni reemplazar fallo SQL con constantes o demos.

### N. Configuración, integraciones y soporte (P1)
**N:** catálogo editable de familias/líneas/marcas/categorías, monedas/impuestos, unidades, zonas, rutas, países, motivos devolución, estados, parámetros de depósitos, políticas de costo; registro de cambios.
**Integraciones:** API/EDI, importaciones XLSX con mapeo y validación, colas/reintentos idempotentes, webhooks, SIFEN y canales ecommerce; monitoreo de integraciones, errores y reprocesos seguros.

## 3. Flujos transversales obligatorios para probar diseñando la V2
1. Proveedor extranjero → OC multi moneda → expediente de importación → recibo parcial → costo nacionalizado → stock y costo por lote → precio y margen.
2. Venta a crédito → reserva → picking por depósito → despacho → FE/NR → POD → cobranza → devolución/NC.
3. Producto con lote y vencimiento → entrada → cuarentena → liberación de calidad → FEFO → trazabilidad hacia cliente.
4. Transferencia entre depósitos → despacho origen → tránsito → confirmación destino → conciliación diferencias.
5. Clientes/proveedores/productos por XLSX → validación previa → vista previa → importación idempotente → reporte de errores.
6. Administrador de empresa gestiona colaboradores sin poder ver otras empresas; PROCEIT administra plataforma sin permisos operativos implícitos.

## 4. Epics y dependencias de implementación
| Epic | Resultado mínimo | Dependencias | Prioridad |
|---|---|---|---|
| V2-001 Administración y usuarios | empresas/sucursales/depósitos/usuarios/perfiles operativos | autenticación V1, permisos | P0 |
| V2-002 Catálogos y maestro de producto | CRUD de familia/línea/marca/categoría + carga masiva | NEX-017, Productos | P0 |
| V2-003 Compras/recepciones | OC y recepciones parciales que mueven stock | proveedores, productos, movimientos | P0 |
| V2-004 WMS básico | ubicación, reserva, lotes/series, picking, conteos | Stock/Movimientos V1 | P0 |
| V2-005 Pedidos y distribución | pedido→entrega→POD | clientes, precios, stock, rutas | P0 |
| V2-006 Importaciones | expediente + costos nacionalizados + documentos | OC, stock, costos, moneda | P0 |
| V2-007 SIFEN y facturación | documentos y eventos fiscales coherentes | ventas, cliente, integración FE | P0/P1 |
| V2-008 Exportaciones | proforma/packing/commercial invoice y seguimiento | ventas, productos, logística | P1 |
| V2-009 Finanzas | cartera, pagos, conciliaciones | compras, ventas, facturas | P1 |
| V2-010 Analítica y automatización | KPIs verificables, alertas, integraciones | flujos operativos completos | P1 |
| V2-011 Portal B2B / app reparto | autoservicio y evidencia de entrega | pedidos, precios, logística | P2 |

## 5. Reglas de aceptación de cada futura funcionalidad
- Nombre del menú y ruta; campos obligatorios/opcionales; catálogos y códigos; validaciones front y back.
- Esquema UUID, FKs `empresa_id`, migración reversible cuando sea posible, permisos `VER/CREAR/EDITAR/ANULAR/APROBAR`.
- Workflow con estados, autorizaciones y transacciones; trazabilidad/bitácora; códigos y numeración comerciales.
- Campos de moneda/IVA/costo/stock sin duplicación; tratamiento de concurrencia e idempotencia.
- CSV/XLSX/PDF si aplica; errores claros; estado vacío real y sin datos demostrativos.
- Tests unitarios focalizados + integración real y build, revisión de dos empresas y prueba manual de usuario.

## 6. Ideas de referencia externa — NO son funcionalidades verificadas del Nexit
- **SAP Business One:** landed costs distribuye flete/seguro/aduana entre mercancías importadas y alimenta la valoración de inventario; base para V2-006. Fuente: https://help.sap.com/docs/SAP_BUSINESS_ONE/68a2e87fb29941b5bf959a184d9c6727/44f8c616445241aae10000000a114a6b.html
- **Odoo:** procesos de barcode GS1, lotes y seriales con captura en recepción y despacho; base para WMS V2-004. Fuente: https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/barcode/setup/serial_numbers_lots.html
- **Oracle NetSuite WMS:** costos nacionalizados estimados/reales durante la recepción, incluso por lote/serial; base para V2-006. Fuente: https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_0123125926.html
**Nota:** comparación conceptual, no copia de reglas ni confirmación de compatibilidad fiscal Paraguay.

## 7. Preguntas de negocio por resolver antes de especificar V2
1. ¿Importación y exportación son para todas las empresas o módulos opcionales por compañía? ¿Cuál tipo de mercadería y régimen?
2. ¿Costo oficial: promedio móvil, FIFO, por lote o configurable? ¿Cómo tratar impuestos recuperables, diferencias de cambio y gastos posteriores?
3. ¿Stock negativo se prohíbe siempre? ¿Permisos de ajuste y anulaciones?
4. ¿Qué variantes exigen serie, lote, vencimiento, control sanitario y ubicación?
5. ¿Ventas al costo aplica precio al cliente, contabilización de costo o reporte?
6. ¿Qué integraciones son prioritarias: SIFEN, SEPSA, SAP B1, portal B2B, ecommerce, bancos?
7. ¿Operación de picking/reparto en móvil y sin conexión?
8. ¿Quién aprueba compras, descuentos, créditos y movimientos de alto importe?

## 8. Próxima revisión
Este es un **backlog fundamentado**, no una especificación cerrada. Pendiente auditar en profundidad los componentes de Stock/Movimientos después de los cambios de Claude, todos los módulos aún ocultos y el estado real de administración/usuarios y reportes. No trasladar las propuestas de V2 a V1 sin aprobación del responsable.

## 9. Decisión aprobada — importación masiva de Productos por Excel (2026-10-10)
**Estado: requisito funcional V2 aprobado; aún NO implementado.**
- En `Productos`, agregar acciones **Descargar plantilla** y **Cargar Excel**, preservando **Nuevo producto** y el formulario actual.
- La plantilla `.xlsx` incluye columnas de los campos soportados por el alta/edición de producto (identificación, descripciones, categoría/familia/línea, unidad, impuestos, procedencia, GTIN, proveedor, costos y, cuando corresponda, inventario inicial). Hoja de instrucciones y valores permitidos; distinguir obligatorios, opcionales y solo alta.
- El usuario carga el `.xlsx`. El servidor valida formato, dimensiones, encabezados, campos obligatorios, tipos, referencias a catálogos y duplicados. Se identifica el producto existente por **código interno dentro de la empresa autenticada**; no por descripción. La coincidencia GTIN con código distinto se informa como conflicto y no se sobreescribe automáticamente. La clave funcional exacta debe verificarse con el esquema antes de desarrollar.
- **Regla confirmada por el propietario:** se permiten **ALTAS y ACTUALIZACIONES** en una misma importación, pero **nada se persiste antes de visualizar un resumen y confirmar explícitamente**.
- Previsualización de cambios a nivel fila y campo: **NUEVO**, **ACTUALIZACIÓN** (antes → después), **SIN CAMBIOS**, **ERROR/CONFLICTO**. Mostrar conteos y poder filtrar errores; los campos vacíos **no eliminan datos existentes por defecto**; borrado explícito requiere mecanismo/documentación específicos.
- No cambiar SKU/código interno ni datos críticos por coincidencia dudosa. Para registros existentes preservar UUID, vínculos y trazabilidad; para nuevos generar UUID en DB. Nunca modificar manualmente saldos o inventario histórico como parte de una actualización del maestro. El **inventario inicial** solo puede registrarse mediante función/movimiento oficial y reglas de apertura, sin duplicarlo si se reimporta.
- Tras confirmación, procesar con transacciones e idempotencia (identificador de carga y hash/versión de filas), comprobando que la previsualización no esté obsoleta. Validar permisos **PRODUCTOS.CREAR** y **PRODUCTOS.EDITAR** según tipo de fila, y siempre `empresa_id` de la sesión.
- Entregar reporte Excel descargable con cada fila, acción, resultado, código y errores. Definir política de confirmación parcial vs total antes de desarrollar; por defecto no modificar filas inválidas y no afirmar importación completa.
- Pruebas de aceptación: descarga plantilla, alta, actualización con diff, fila sin cambios, duplicados en archivo, GTIN en conflicto, FK inválida, campo vacío, aislamiento empresa A/B, usuario sin permiso, repetición del archivo sin duplicar ni reabrir stock, archivo alterado después de preview y reporte final.
- **Pendiente de diseño:** política transaccional del lote, límite de filas/tamaño, tratamiento de creación automática de catálogos (recomendación: rechazar referencias desconocidas inicialmente), y actualización de imágenes/adjuntos.
