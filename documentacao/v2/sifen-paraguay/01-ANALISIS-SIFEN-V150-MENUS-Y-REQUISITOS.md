# NEXIT V2 — Facturación electrónica Paraguay (SIFEN / e-Kuatia)
**Fecha de análisis:** 2026-10-10
**Fuente primaria:** ZIP entregado por cliente `NT_E_KUATIA_027_MT_V150(1).zip`, que contiene `Manual Técnico Versión 150 - 01-2.pdf`, notas técnicas NT_E_KUATIA_001 a 020 (sin 021 en ZIP), 022 a 027, y un XLSX de referencia geográfica (noviembre 2025).
**Estado:** requerimiento/documentación V2, sin implementar ni alterar V1. Confirmar publicación/vigencia normativa y condiciones con la DNIT/SIFEN antes del desarrollo productivo. Las notas técnicas complementan o actualizan reglas del manual; NO asumir que todos sus códigos son universales.
**Objetivo:** facturas, notas de crédito, notas de remisión, eventos de inutilización, cancelación, nominación, además de choferes y transportistas, sin duplicar maestros y coordinando con Ventas, Productos, Clientes, Entregas e Inventario.

## 1. Inventario real de navegación del Nexit
Se verificó `lib/navigation/menu.ts` en la rama `feature/NEXIT-2026-001-banco-demo`.

| Menú actual | Ruta | Qué hacer | Observación |
|---|---|---|---|
| Maestros > Clientes | `/clientes` | REUTILIZAR | Receptor, RUC/DV, naturaleza, país, tipo operación, direcciones y contactos. Validar reglas SIFEN en emisión, no confundir cliente comercial con receptor de cada DE. |
| Maestros > Productos | `/productos` | REUTILIZAR/AMPLIAR | Descripción fiscal, unidad, tributo, código, GTIN/NCM y precios; no crear segundo maestro fiscal de productos. |
| Maestros > Proveedores | `/proveedores` | REUTILIZAR si corresponde | Un transportista puede ser proveedor, pero no todos son proveedores; mantener rol transportista separado sin duplicar persona. |
| Maestros > Choferes | nueva `/choferes` | AGREGAR | Identidad, documento, nombre, datos opcionales, vínculo con transportista y vigencia. |
| Maestros > Transportistas | nueva `/transportistas` | AGREGAR | Naturaleza, nombre, RUC/DV o identidad según corresponda, contacto, domicilios, choferes y vehículos asociados. |
| Facturación > Facturas | `/facturas` | REUTILIZAR/CONSTRUIR | Emitir FE, detalle, cálculo, validaciones, CDC, estados y KuDE. |
| Facturación > Notas de crédito | `/notas-credito` | REUTILIZAR/CONSTRUIR | Vincular documento origen/CDC, motivo y límites; no permitir sumas de NC sobre documento conforme reglas efectivas. |
| Facturación > Notas de remisión | `/notas-remision` | REUTILIZAR/CONSTRUIR | Responsables de emisión, origen/destino, transportista/chofer/vehículo, mercancías y documento asociado cuando aplique. |
| Facturación > Todos los documentos | `/documentos` | REUTILIZAR | Vista unificada DE/DTE, CDC, estado SIFEN, reenvíos, XML y KuDE. |
| Facturación > Monitor SIFEN | `/sifen` | REUTILIZAR | Cola técnica, respuesta, trazas, errores/reintentos, eventos, idempotencia. |
| Facturación > Eventos SIFEN | nueva `/eventos-sifen` | AGREGAR | Inutilización, cancelación, nominación; y contemplar eventos de actualización del transporte y otros previstos en normativa. |
| Ventas > Pedidos/Ventas/Entregas | `/pedidos`, `/ventas`, `/entregas` | INTEGRAR | Flujo comercial y logística generan propuestas/documentos fiscales sin duplicar captura. |
| Administración > Configuración | `/administracion/configuracion` | AMPLIAR | Timbrado, establecimientos, puntos de expedición, certificado, CSC y parámetros SIFEN por empresa/ambiente, con control de secretos y vigencias. |
| Reportes | `/reportes` | AMPLIAR | Estado de aprobación/rechazo, DE y eventos, cancelaciones, inutilizaciones, conciliación e incidencias. |

**Estado real:** estas rutas están definidas en el menú, pero las funciones de Facturación permanecen ocultas/no homologadas en la V1 de acuerdo con el código inspeccionado. NO etiquetarlas como operativas.

## 2. Documento fuente — campos técnicos comprobados
Se inspeccionó texto del Manual Técnico v150 entregado:
- **E10.4 / E980-E999: campos de transportista.** `iNatTrans` (E981, naturaleza contribuyente/no contribuyente), `dNomTrans` (E982), `dRucTrans` (E983), `dDVTrans` (E984), tipo/descripción/número de identidad (`iTipIDTrans` E985, `dDTipIDTrans` E986, `dNumIDTrans` E987), nacionalidad `cNacTrans` E988 y descripción E989; **`dNumIDChof` E990 y `dNomChof` E991**, domicilio fiscal `dDomFisc` E992, dirección chofer `dDirChof` E993, agente `dNombAg` E994. Sus requerimientos son *condicionales*; NO marcar todo obligatorio.
- **Eventos de actualización del transporte:** en grupo GET, `GET003 dMotEv` incluye 1=cambio local de entrega, 2=cambio de chofer, 3=cambio transportista, 4=cambio vehículo. Vinculado al CDC. Por ello registrar **snapshot** de chofer, transportista y vehículo al emitir una NR; cambios posteriores del maestro no modifican un DTE existente.
- **Eventos de cancelación e inutilización:** el manual tiene grupos específicos de formato del evento; la inutilización de numeración es distinta de cancelar un documento existente. Implementar flujos separados, con validaciones, usuario, motivo, serie/número y respuesta SIFEN.
- **Evento nominación:** existen anexos/notas técnicas relacionados, particularmente NT 014/015/027. Para FE nominada debe relacionarse el receptor y documento original según sus campos y validaciones; no tratar nominación como edición directa de FE aceptada.
- **NR:** revisar grupos E9/E10 para datos de transporte y salida/entrega, así como `E504 dDesRespEmiNR` para descripción del responsable de emisión. La responsabilidad y obligatoriedad dependen de tipo de documento y transporte.
- **XLSX de referencia geográfica:** fuente de códigos para catálogos (departamento/distrito/ciudad); validar lectura, nombre y vigencia antes de cargar/actualizar catálogos del Nexit.

## 3. Especificación funcional propuesta — módulos de Facturación
### 3.1 Configuración fiscal por empresa/sucursal
UUID empresa, RUC/DV, razón social, actividad económica, establecimientos, puntos de expedición, timbrados, series, rangos/numeración, fechas de vigencia, certificado digital y CSC, ambiente test/producción, autorizaciones y parámetros del proveedor/API de FE. Numeración concurrente por serie con garantía anti duplicado. Separar credenciales del front y permisos de emisión/consulta. Registro histórico de cambio de timbrado.

### 3.2 Facturas electrónicas
Cabecera: emisor/sucursal/establecimiento/punto, receptor (vínculo a Clientes con snapshot fiscal), fecha/hora, naturaleza operación, condición de venta, pago, moneda/tipo cambio, lista de precios, descuento, observaciones, documento comercial origen. Líneas: producto UUID, código/descr. fiscal, unidad, cantidad, precio, impuesto, exento/gravado/IVA, descuentos y totales precisos. Flujo: borrador → validar → generar DE/XML → firmar/enviar por integración → consultar estado → aceptar/rechazar → generar/consultar KuDE. Estados locales y estados técnicos SIFEN explícitamente separados. No inventar CDC ni marcar aprobado sin respuesta del sistema fiscal.

### 3.3 Notas de crédito electrónicas
Buscar FE original por número/CDC; asociar documento exigido; motivo fiscal, líneas, cantidades/valores a acreditar, impuestos, totales, fechas. Validación de acumulación de NC para no exceder monto permitido y no vincular receptor/DE incorrectos. Considerar NC parciales y múltiples. Registro de devolución de inventario **solo si** el flujo de negocio lo exige; NC monetaria no mueve stock automáticamente.

### 3.4 Notas de remisión electrónicas
Fecha emisión/inicio traslado, motivo de traslado, emisor/responsable, direcciones origen/destino y referencia logística, productos/quantidades/unidades, depósito, transportista, chofer, vehículo, tipo de transporte y documento referenciado cuando corresponde; validar E9/E10. Puede originarse de entrega/pedido, transferencia entre depósitos, devolución u otro proceso admitido. **No duplicar movimiento físico** si ya se generó por Entregas/Inventario. Preparar actualización de transporte como evento, no reescribir NR ya emitida.

### 3.5 Eventos SIFEN
- **Inutilización:** rangos o números que no se usaron, establecimiento/punto/timbrado, motivo, validación de no emisión y respuesta oficial.
- **Cancelación:** CDC/documento emitido, motivo, usuario autorizante, estado/aceptación del evento, efectos comerciales/stock/financieros definidos por política y normativa; no borrar XML.
- **Nominación:** identificación del receptor de FE originalmente emitida en condición que admite nominación, CDC original, datos tributarios/identificación requeridos y seguimiento respuesta. No implementar como simple editar factura.
- **Actualización transporte:** motivo, CDC NR, datos afectados, validaciones condicionales; historial de eventos, respuestas y auditoría.
- Diseñar arquitectura extensible para otros eventos previstos y definir matriz de plazos/estados/códigos en anexo técnico antes de programar.

### 3.6 Catálogos de choferes/transportistas
**Chofer:** UUID, empresa_id, nombre/apellido, tipo/número de documento, país/nacionalidad, dirección, teléfono y estado. Licencia de conducir, categoría y vencimiento son **propuesta de gestión logística**, NO afirmar que E990/E991 exijan licencia. Posibilidad de asignación a distintos transportistas y vehículos según política.
**Transportista:** UUID, empresa_id, naturaleza fiscal, razón social/nombre, RUC y DV condicionales, documento alternativo según naturaleza, nacionalidad/país, dirección/domicilio, contactos, responsable, modalidad, estado. Permitir vínculo opcional a `proveedores.id` sin confundir entidades ni reutilizar a la fuerza.
**Vehículos (recomendado):** placa/matrícula, tipo, capacidad, titular, chofer, transportista, vigencia, documentación operativa y estado; revisar reglas E10.3.

## 4. Diseño de UX y menú sugerido (español)
- **Maestros:** Clientes · Proveedores · Productos · Listas de precios · **Choferes** · **Transportistas** (vehículos como submenú logístico, si se aprueba).
- **Facturación:** **Emitir factura** · **Emitir nota de crédito** · **Emitir nota de remisión** · Todos los documentos · **Eventos SIFEN** [Inutilización, Cancelación, Nominación, Actualización de transporte] · Monitor SIFEN.
- Evitar duplicados entre menú ventas/entregas y menú facturación: el registro comercial conserva referencia al documento fiscal; anulación de DE no equivale a eliminar operación comercial.
- Configuración fiscal en Administración, vinculada a empresa/sucursal; solo administradores autorizados.

## 5. Arquitectura de integración propuesta
Se debe definir si Nexit emite por **API externa del servicio fiscal PROCEIT** o conexión directa SIFEN; la arquitectura previa del Nexit prevé API externa. No asumir que el ZIP incluye credenciales/endpoints del proveedor privado.
Modelo: `documentos_electronicos`, `documento_lineas`, `documento_asociados`, `documento_eventos_sifen`, `integracion_sifen_solicitudes`/`respuestas` **solo si** no existe equivalente en DB, con UUID y `empresa_id`, CDC único cuando corresponda, XML/KuDE en almacenamiento seguro, payload de auditoría, respuesta del proveedor, estados, reintentos idempotentes.
Validar cada documento contra el catálogo/campos aplicables de v150 y NT vigentes sin replicar esquemas imprecisos en UI. Moneda/impuestos por decimal exacto. Nunca registrar éxito antes de respuesta válida.

## 6. Reglas cruzadas para revisar contra módulos existentes
1. **Clientes → FE/Nominación:** naturaleza, B2B/B2C, RUC/DV, tipo ID/país y snapshots; no usar nombre de fantasía como razón social fiscal.
2. **Productos → FE/NC/NR:** descripción fiscal, unidad/IVA/códigos; no duplicar maestro; verificar conversiones UOM.
3. **Pedidos/Ventas → FE:** origen comercial, condición/pago, estado y regla de emisión única; evitar doble facturación.
4. **Entregas/Depósitos/Movimientos → NR:** dirección, transportista/chofer, tránsito, documento y movimientos independientes/conciliables.
5. **Devoluciones → NC:** devolución material vs ajuste monetario, cantidades e impuesto original.
6. **Administración → SIFEN:** timbrado por empresa/ambiente/sucursal, certificación y accesos.
7. **Monitor → Documentos/Eventos:** errores recuperables, reenvío seguro, no repetir CDC/numero, registro de rechazo y seguimiento.

## 7. Criterios de aceptación y prioridad
**P0:** configurar fiscal, emitir FE/NC/NR con integración real, asociaciones, estados, XML/KuDE, numeración, maestro de chofer/transportista, cancelar/inutilizar/nominación con validaciones, auditoría y permisos.
**P1:** actualización datos transporte, vehículos, alertas vencimiento timbrado/documentos, reconciliación y reportes.
**P2:** integraciones transportistas, comprobante entrega, automatización logística e importación masiva de catálogos.

Pruebas mínimas: emisor/receptor válido/inválido, NC parcial/excesiva, NR con transportista/chofer, numeración bajo concurrencia, evento duplicado e idempotencia, errores de firma/envío, estados rechazados/aceptados, reintentos, aislamiento entre empresas, permisos, fiscal separado de inventario, generación KuDE y ciclo completo desde venta.

## 8. Riesgos y preguntas por definir
- ¿Emisión siempre por la API externa PROCEIT, o algunas empresas conectan directamente al SIFEN?
- ¿Módulos de facturación serán parte obligatoria del ERP o habilitados por empresa?
- ¿Se factura en sucursal/deposito del pedido, o se elige expedición?
- ¿NC de devolución se vincula siempre con movimiento de inventario?
- ¿Quién puede aprobar cancelación/inutilización/nominación y qué flujo de autorización exige?
- ¿Choferes, vehículos y transportistas son maestros por empresa o compartidos dentro de un grupo empresarial?
- ¿Qué catálogos y NT están vigentes en producción en la fecha de despliegue?
- ¿La API externa devuelve XML firmado, CDC, KuDE y los eventos o debemos gestionar parte localmente?

## 9. Trazabilidad documental
Fuente aportada: ZIP de 28 archivos, incluidos 26 PDFs de notas técnicas, 1 manual PDF y 1 XLSX geográfico. Los campos E980-E994 y evento GET003 están extraídos del texto del manual. La clasificación de módulos, rutas, UX, estructuras PostgreSQL y prioridades son **diseño Nexit propuesto**, no disposiciones textuales del manual. Se recomienda añadir un inventario y matriz exacta grupo/campo/condición/versión de todas las NT antes de generar validadores XML.

## 10. Decisión de alcance V1/V2 — Facturación (2026-10-10)
**Decisión aprobada:** el módulo Facturación electrónica se desarrollará en **Nexit V2**, no en V1. En V1 debe permanecer fuera de `V1_HREFS`, sin páginas operativas simuladas ni botones hacia `/facturas/nuevo` (se retiró el botón «Emitir factura» de Dashboard en commit `8829b0d`). No se inicia la implementación fiscal durante el cierre y la homologación de V1.

En V2 se desarrollará como módulo real sobre esta especificación SIFEN: emisión de facturas, notas de crédito y notas de remisión; documentos electrónicos y KuDE; monitor, estados, rechazos, reintentos y eventos aplicables; numeración/timbrados y certificados; perfiles, aislamiento por empresa, integración con ventas/stock según alcance aprobado. Los requisitos y los flujos se validarán contra normativa vigente al momento de implementar. Quedan abiertas las decisiones de integración API externa versus conexión directa y las demás preguntas de la sección 8; esta decisión de fase no las resuelve.
