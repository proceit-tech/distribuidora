# NEXIT E6 — Decisión normativa: Compras → Entradas e Informe de Compras por entradas
**26/10/2026 | Casa Mingo | idioma UI español Paraguay | prioridad desktop**

## DECISIÓN EXPRESA
El responsable decidió: «somente entradas no menu que vamos criar de compras».
**Origen exclusivo del Informe de Compras:** registros reales hechos en el nuevo módulo **Compras → Entradas**.
- NO crear facturas fiscales de proveedor, recepción DEMO, órdenes de compra, notas de crédito de proveedor, cuentas por pagar, IVA ni margen.
- El título solicitado «Informe de Compras» se mantiene, pero la descripción visible debe ser **«Entradas de mercadería registradas a costo; no representa compras facturadas ni IVA fiscal»**. Los KPIs nunca se llaman «IVA compras» o «facturación de proveedores».
- Implementar en dos entregas auditables: **E6-A** registrar entradas y vincular proveedor/stock, luego **E6-B** leer esas entradas en el informe. No habilitar reportes sin origen real.

## EVIDENCIAS DEL CÓDIGO QUE JUSTIFICAN EL DISEÑO
- NEX-014, inventario_registrar_movimiento: admite hasta 500 líneas en un movimiento, con stock y costos atómicos, idempotencia K1 y permisos MOVIMIENTOS.CREAR y depósito.
- NEX-066 y lib/movimientos/intenciones.ts: el registro manual usa reserva durable, ejecutar y reconocer. **No saltar garantía contra duplicación cuando se pierde respuesta tras COMMIT.**
- NEX-006 proveedores es un maestro real. NEX-009, movimientos_inventario y movimiento_lineas no identifican el proveedor responsable: tipo_origen COMPRA por sí solo NO prueba entrada hecha desde el módulo Compras.
- app/(private)/recepciones y lib/mocks/recepciones-storage.ts son demo/localStorage; prohibidos como fuente.
- Menú Compras está previsto en lib/navigation/menu.ts, pero sus URLs no están habilitadas en V1_HREFS. Habilitar únicamente Compras → Entradas después de implementar servicio real; mantener solicitudes, órdenes, recepciones y devoluciones ocultas.
- SQL histórico 004_compras_inventario.sql NO está aprobado ni aplicado al NEXIT. No incorporarlo.
- Auditoría Git estática: no consultar PostgreSQL/VM, no asumir migrations instaladas.

## E6-A — REGLAS FUNCIONALES DEL REGISTRO
**Menú:** Compras → Entradas → listado, Nueva entrada, detalle. No inventar módulo completo de compras.
**Cabecera de nueva entrada:** fecha operativa, proveedor obligatorio (ID empresa y snapshot de código/nombre/documento), depósito destino permitido, moneda **BASE** empresa mostrada sin edición, referencia de documento libre y opcional, observaciones opcionales. Un comprobante libre es solo referencia, no factura fiscal.
**Líneas:** producto activo real buscable por código/descripción, unidad real, cantidad positiva de hasta 4 decimales, costo unitario introducido expresamente (>=0; vacío NO es cero), total calculado a costo con precisión monetaria del motor. Lotes/vencimiento según control real; bloquear explícitamente productos con unidad identificada hasta soporte del motor. Permitir múltiples productos en una sola entrada.
**Confirmación:** resumen de cabecera, ítems, cantidades y costo total; leyenda visible «Entrada a inventario valorizada, sin validación fiscal de factura». Doble clic, recarga y timeout no pueden producir dos incrementos.
**Persistencia:** una compra entrada tiene exactamente un movimiento NEX-014 de tipo ENTRADA, origen COMPRA, y N líneas en movimiento_lineas. Reutilizar motor oficial de stock/costos; PROHIBIDO INSERT/UPDATE directo stock_saldos o inventario_costos.
**Vínculo del proveedor:** un registro de metadatos de compras_entradas (nombre exacto a revisar) con empresa_id, id, movimiento_id UNIQUE, proveedor_id y nombre/documento snapshot, referencia, fecha operativa, usuario y created_at; FK compuestas por empresa en proveedor y movimiento. **Fuente exclusiva para E6-B**; no clasificar movimientos COMPRA manuales anteriores como compras E6. No duplicar stock ni costo en tabla de metadatos.
**Atomicidad indispensable:** vínculo de proveedor y único movimiento deben confirmarse en la MISMA transacción con líneas y costos, o nada; integrar NEX-066 o protocolo durable equivalente sin relajar su control ni el de NEX-014. Si crear esta atomicidad requiere cambiar funciones que no pueden modificarse con seguridad, **parar como bloqueo y solicitar revisión del analista; NO publicar una entrada funcional incompleta**.
**Unicidad/idempotencia:** K1 ligada a empresa, usuario y snapshot íntegro proveedor/ítems/fecha, recuperación de resultado indeterminado, segundo intento no genera entrada distinta. No permitir editar registro de stock confirmado.
**Anulación:** si es necesaria, únicamente por mecanismo oficial inventario_anular_movimiento con permisos críticos y movimiento inverso, sin delete. Entrada anulada permanece histórica y no suma al reporte; nunca anular únicamente la cabecera.
**Seguridad:** COMPRAS.VER para ver entradas, COMPRAS.CREAR para registrar SI el permiso existe y está concedido; el motor conserva MOVIMIENTOS.CREAR y usuario_puede_deposito. No conceder permisos implícitos, no crear perfil, no modificar catálogo de roles; si permisos actuales impiden operación, informar bloqueo al analista. Empresa/usuario siempre derivan de sesión, proveedores/almacenes tenant-scope.
**Migración incremental:** un vínculo persistente proveedor-movimiento requiere nueva tabla. Claude puede VERSIONAR una migración nueva si imprescindible y documentar preflight/rollback, pero **no puede ejecutarla**. Revisar número NEX libre (no asumir 075), grants y compatibilidad. Si falta en DB operacional, endpoints responden NO DISPONIBLE 503, no vacíos DEMO. El responsable aprueba aplicación después de auditoría.
**Entradas manuales anteriores del menú Movimientos con origen COMPRA** no son esta fuente sin reconciliación expresa del responsable.

## E6-B — INFORME DE COMPRAS SOBRE ENTRADAS (ORDEN FUTURA)
**No iniciar en E6-A.** Fuente: solo entradas vinculadas y registradas de E6-A y sus líneas históricas movimiento_lineas; excluir anulaciones y entradas manuales no vinculadas. Título «Informe de Compras» con subtítulo «Entradas registradas a costo — sin IVA fiscal».
KPIs por empresa/moneda base: número de entradas, número de líneas, unidades respetando tipo UM, **valor de entradas a costo histórico** SUM(movimiento_lineas.costo_total), número de entradas anuladas separadas, distribución por proveedor, producto, depósito y mes. No inferir fecha de emisión de facturas de proveedor ni IVA o descuentos fiscales; costos de entrada no son ventas ni lucro.
Filtros: fecha entrada (America/Asuncion), sucursal/depósito en alcance, proveedor, producto, estado, referencia; vistas Resumen, Entradas, Proveedores, Productos, Meses. Una fila monetaria por movimiento para evitar duplicación por joins. XLSX/PDF con filtros y totales de filtro completo, numeric exacto, REPORTES.VER y REPORTES.EXPORTAR, no sumar distintas monedas.
Fuente ausente/registro no conciliable = aviso objetivo/no disponible, no KPI cero inventado. No conectar Recepciones DEMO.

## CASOS DE ACEPTACIÓN OBLIGATORIOS (PARA FUTURA HOMOLOGACIÓN)
1. Tres productos de un proveedor/deposito => UNA entrada con tres líneas, un incremento de stock y costo por ítem.
2. Error en última línea => ROLLBACK integral de movimiento, costos y metadatos.
3. Corte de conexión tras COMMIT => recuperar misma K1/entrada sin duplicar stock.
4. Proveedor otra empresa, depósito fuera del alcance, permiso ausente => prohibición efectiva servidor.
5. Costo 0 explícito vs vacío, cantidades 0/negativas/5 decimales, lotes inválidos y producto de serie => validaciones correctas.
6. Anulación oficial => movimiento inverso, entrada histórica anulada y fuera de agregados activos.
7. Empresa moneda PYG y otra USD => no mezclar costos.
8. Entrada manual previa tipo_origen COMPRA y recepciones DEMO => NO sumar al nuevo Informe.
9. Solo Entradas aparece en menú Compras, sin links activos a funcionalidades DEMO.
10. Sin migration aplicada no declarar sistema listo para operación; sin SQL/VM/test/browser efectuado por IA.

## SECUENCIA, AUTORIDAD, LÍMITES
- **E6-A** implementación de código, UI y migración fuente NO APLICADA; commit/push y PARAR para auditoría del ChatGPT.
- **E6-B** solo con orden posterior del ChatGPT una vez auditado esquema y su vínculo transaccional.
- ChatGPT actualiza GitHub/Linear/órdenes/auditorías. Claude SOLAMENTE desarrolla.
- Prohibido tocar E5 Ventas, FE/NCE, SIFEN, APIs fiscales, cuentas por pagar, ordenes/recepciones demo, costos de salida, otros reportes, perfiles o VM. No ejecutar tests/build/lint/SQL/migrations/CI/deploy/browser sin autorización expresa.
