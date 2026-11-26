# AUD-NEXIT-FACTURAS-DESKTOP-R01 — Auditoría individual de Facturación → Facturas

**Fecha:** 18/10/2026. **Rama:** feature/NEXIT-2026-001-banco-demo. **Ruta:** /facturas redirige a /facturas/nueva. **Dictamen:** AUDITORÍA ESTÁTICA CON HALLAZGOS ABIERTOS, NO HOMOLOGADO. No se autoriza corrección ni implementación a Claude, migration, SQL o VM.

**Fuentes actualizadas:** CLAUDE.md; documentacao/PROTOCOLO-IA.md; PROGRESSO-NEXIT-V1.md; AUD-FACTURAS-V1.md (antecedentes FAT-X, FAT-E1/E2, FAT-UX, PRO-128); REQUISITOS-FACTURACION-ELECTRONICA-API-EXTERNA-2026-10-12.md; AUD-PRODUCTOS-V1.md y decisiones DEC-PRD-U03/U07/U08/U09/U10; contrato de integración Movimientos/Documentos. Código de menú, /facturas page/layout, /facturas/nueva/page.tsx (1308 líneas, blob c03c66999f95efdaa3e50f305e5547f087dbb8ab), page.module.css (1373 líneas: estructura, breakpoints y componentes relevantes, no cada regla CSS), ajuste-fiscal-item, condicion-credito, medios-pago; GET catalogos/clientes/productos, POST /api/facturas/previa y POST /api/facturas; lib/facturacion/emision.ts (516 líneas, blob c002e02f7f7b7d5bdfc89213e1fe1f7c5b371905), envio.ts (235), payload-fe.ts (444), calculo, credito, pagos, monedas, ajuste-item, ajuste-fiscal, series, gateway, busqueda-rapida, cambios-formulario y pruebas facturacion.casos.ts (1109), series.casos.ts, monedas.casos.ts, além do SQL NEX-048 e referencias NEX-063. Casos existentes LEÍDOS, no ejecutados. **0 pruebas ejecutadas por ChatGPT, sin navegador/VM/PostgreSQL/gateway/SIFEN real/build/lint/CI o deploy**. No inferir migraciones aplicadas ni aprobación SIFEN.

## 1. Función exclusiva del menú y contratos vigentes

El menú permite EMITIR manualmente factura electrónica FE: sucursal/establecimiento, punto de expedición/serie y número referencial, cliente, productos activos vendibles, IVA 5/10/exento/exonerado/parcial, unidad oficial SIFEN, GTIN, cantidad, precio con IVA incluido, PYG/USD/BRL, tipo de cambio, presencia y tipo de transacción, condición contado/crédito a plazo, pago único o múltiple, entrega inicial, resumen validado por servidor y envío al gateway. **No** reemplaza Documentos electrónicos (monitoreo y estados), Puntos (administración de secuencias) ni NCE. **No** modifica stock automáticamente.

**Contratos verificados por lectura:**
- Menú /facturas → /facturas/nueva, layout exige FACTURACION_ELECTRONICA.CREAR; API exige sesión/permiso. Usuario y empresa siempre salen de sesión; las sucursales activas y puntos de secuencia FE activos pertenecen al alcance, el número en pantalla es solo REFERENCIAL. La reserva definitiva corresponde a función SQL con serie propia FE.
- El backend emision.ts:124–134 usa actualmente p.activo AND p.vendible y tipo MERCADERIA/SERVICIO. **FAT-X01 histórico está corregido**; no contabilizarlo de nuevo. Servidor valida que el cliente sea activo, no bloqueado y fiscalmente apto y revalida datos de producto, IVA, unidad SIFEN vigente, precio/moneda y permisos especiales.
- La selección/edición fiscal por línea es permitida con AJUSTE_FISCAL; cambiar precio de catálogo exige PRECIO; guardar clasificación IVA en Productos exige PRODUCTOS.EDITAR y consentimiento por línea. Nunca grabar precio/unidad/GTIN ni descripción al catálogo desde la factura.
- Cuotas suspendidas; crédito a Plazo y entrega inicial opcional. Los medios múltiples de pago están presentes en el código actual (no repetir descripción antigua de sólo Efectivo). Las cantidades monetarias fiscales se calculan en bigint escalado; se bloquea falta de conciliación entre ítems, totales y pagos E608 sin inventar tolerancia/dRedon (corrección FAT-E1-R02). Para moneda extranjera, tipo de cambio F023 calculable y exacto.
- POST /api/facturas/previa valida la operación, calcula desde servidor y **no reserva número ni graba**. POST /api/facturas confirma, hace preflight de credenciales por empresa, crea documento/solicitud inmutable idempotente, reserva número una sola vez y transmite a recepcion_de. ENVIADO o status success+nro_lote sólo indican gateway, **no aprobación SIFEN**. TIMEOUT/red no habilitan reenvío ciego; documentos indeterminados deben consultarse/conciliarse.
- El formulario ya tiene workspace DESKTOP de dos columnas con resumen sticky, modal de revisión, cliente fiscal compacto con detalles, buscadores rápidos + avanzados y confirmación de cambios de moneda/condición con foco. No reabrir vieja auditoría de cinco cards verticales como si fuera el código vigente.

## 2. Matriz campo/ruta/servicio — estado actual

| Área | Código fuente | Resultado |
| --- | --- | --- |
| Menú/CREAR | lib/navigation/menu.ts:224–225; facturas/layout.tsx:4–6; facturas/page.tsx | Acceso por permiso y redirect |
| Sucursal/punto/serie | nueva/page.tsx:511–547,820–841; emision.ts:28–56,311–328 | FE activa; alcance; secuencia referencial |
| Selección cliente | nueva/page.tsx:110–216,282–419; emision.ts:97–122,216–259 | Aptitud e identidad fiscal; FAT-D01 |
| Selección producto | nueva/page.tsx:217–273,282–439; emision.ts:124–149 | p.vendible backend, GTIN, precio/IVA; FAT-D01 |
| Ítems y fiscal | nueva/page.tsx:956–1093; emision.ts:336–421; payload-fe.ts:337–352 | Validación SIFEN y permisos; GAP preexistente de presentaciones |
| Moneda/crédito/pago | nueva/page.tsx:672–715,843–897; monedas/credito/pagos.ts | USD/BRL, tipo de cambio, crédito/plazo, E608 |
| IVA y suma fiscal | calculo.ts; payload-fe.ts:160–248,318–402 | BigInt 8 decimales; bloqueo de residuales |
| Previa/confirmación | nueva/page.tsx:597–652,1190–1259; POST /api/facturas/previa | FAT-D02: no fija body revisado |
| Emisión gateway | POST /api/facturas; emision.ts:483–499; envio.ts:127–235 | Idempotencia SQL, estados separados; FAT-D03 |
| Snapshot de lectura | emision.ts:311–324,336–475 | FAT-D04: múltiples queries de pool sin una foto |
| Fecha de contexto | nueva/page.tsx:511–520,558,765,1199 | FAT-D05: se fija al cargar |
| Layout desktop | nueva/page.module.css:5–15,295–369,500–522,714–742,863–885 | Nueva composición; captura real pendiente |

## 3. Hallazgos NUEVOS del código actual

### FAT-D01 — ALTA — buscador rápido permite elegir resultados obsoletos mediante Enter

**Evidencia:** nueva/page.tsx:113–135 useListado devuelve datos.items aun cuando datos.clave no coincide con la clave pedida (cargando se marca por separado). BuscadorRapido :286–293 hace items=l.items.slice(0,8) sin invalidarlos. useFiltro :138–152 tarda 300 ms en aplicar el texto B mientras la lista A sigue vigente. teclas :325–339 usa esos items para ArrowDown/Enter incluso cuando l.cargando=true y la lista nueva está visualmente ocultada. elegirConEnter :304–323 tampoco vincula el resultado asíncrono al texto actual, de forma que un GET anterior puede elegir un producto/cliente después de que la búsqueda haya cambiado.
**Riesgo:** búsqueda «A» → usuario escribe «B» y presiona flecha/Enter mientras B espera → el formulario selecciona una fila A, potencialmente válida para backend pero distinta de la intención humana. No se afirma emisión equivocada en VM.
**Cierre:** invalidar inmediatamente items/índice activo al cambiar texto o query y prohibir elegir cualquier resultado cuya clave no sea vigente; el GET directo por Enter debe descartar respuesta tardía. Mantener búsqueda por scanner con coincidencia exacta/resultado único. Test 0/100/300ms, cambio de cliente/producto, paginación, respuesta fuera de orden y error.

### FAT-D02 — ALTA — la factura ENVIADA puede no ser la que el operador REVISÓ

**Evidencia:** cuerpoFactura() nueva/page.tsx:598–605 lee el estado React actual. grabar() :609–628 manda cuerpoFactura() a /previa, luego setResumen(r.resumen) sin fijar una versión o el body revisado. La pantalla permanece editable mientras revisando=true: el flag bloquea botones de revisar, NO todos los campos. Si se editan campos durante la espera, al resolver la previa se muestra resumen del body A, pero enviar() :631–638 **vuelve a llamar cuerpoFactura()**, enviando el body B actual; el modal de resumen :1190–1259 no controla igualdad/hash ni congela la entrada. El workspace :802 usa inert sólo para diálogo de cambiar moneda/condición, no al revisar/resumen.
**Riesgo:** al confirmar se emite un documento fiscal validado por servidor pero con cliente, línea/importe/IVA/punto/pagos diferentes de los mostrados en la revisión. **Validación backend preservada**, consentimiento del operador no garantizado.
**Cierre:** fijar body canónico+versión/huella al iniciar previa; bloquear/invalidar revisión ante cambios; enviar exactamente el body revisado o repetir la previa si cambió estado de pantalla o de catálogo/permiso. Test mediante GET previo pausado y edición de línea, cliente, moneda, punto, pago; ninguna reserva sin revisión consistente.

### FAT-D03 — MEDIA — recuperación de idempotencia con catálogo alterado puede fallar

**Evidencia:** envio.ts:195–202 llama crearFacturaElectronica; emision.ts:483–490 hace prepararFactura ANTES de invocar fe_documento_crear_fe. prepararFactura :311–452 relee producto, IVA, precios, cliente, unidad y permisos del catálogo actual. La función SQL de NEX-048:120–125 comprueba clave/hasha sólo cuando se la invoca. Si el primer POST creó FE pero se perdió la respuesta HTTP, un POST idéntico con la misma clave, después de cambiarse producto/precio/cliente, puede fallar antes del lookup de la clave o dar conflicto de hash: la recuperación del documento original no queda garantizada. **No se ha probado duplicación ni mutación del payload anterior; éste permanece protegido**.
**Cierre:** ruta segura de recuperación de documento ya registrado por clave/identidad antes de recalcular desde tablas mutables, preservando verificación de solicitud original y prohibición de reenvío de indeterminado; probar con respuesta perdida y producto editado/desactivado.

### FAT-D04 — MEDIA / riesgo no reproducido — snapshot fiscal no es consistente dentro de una misma preparación

**Evidencia:** emision.ts:311–324 ejecuta receptor, aptitud, productos y punto con Promise.all sobre Pool.query, y después efectúa varias lecturas de permisos, unidades y tipos de cambio :336–475 sin una conexión/transaction de sólo lectura REPEATABLE READ. Frente a cambios concurrentes de un producto o cliente, las fuentes pueden provenir de instantes diferentes. **No reproducido en PostgreSQL y sin evidencia de payload fiscal incorrecto realmente emitido**.
**Cierre:** diseñar snapshot coherente de toda la preparación y revalidación atómica relevante antes de reservar documento, sin usar Promise.all concurrente sobre un cliente transaccional único. Test PG de actualización de IVA/precio/aptitud entre consultas, acceso multiempresa y payload almacenado.

### FAT-D05 — BAJA — fecha de Paraguay queda congelada al montar la pantalla

**Evidencia:** nueva/page.tsx:511–520 carga hoy/hoyIso una vez. :558 usa hoyIso para condiciones del crédito y :765,1199 lo muestra como fecha de la factura. Pestaña abierta pasando las 00:00 de Asunción presenta fecha anterior y validaciones de UI basadas en ella; el servidor usa hoyParaguay actual al revisar/emitir. No demuestra documento emitido con fecha fiscal incorrecta, sólo UX y validación previa posiblemente desalineadas.
**Cierre:** refrescar día al recuperar foco/antes de revisar o devolver fecha oficial de /previa; no inferir fecha desde timezone del browser. Test frontera de medianoche Paraguay, crédito plazo y fecha server.

**Balance NUEVO**: 2 ALTAS + 2 MEDIAS + 1 BAJA = 5 hallazgos. FAT-D03/D04 son riesgos funcionales cuya reproducción real/SQL queda pendiente.

## 4. Brechas PREEXISTENTES, no sumar como hallazgos R01

### FAT-G01 — ALTA FUNCIONAL heredada: presentaciones comerciales de venta sin conversión ni snapshot

**Decisiones ya aprobadas DEC-PRD-U03/U09 y FAT-X03:** un producto tiene unidad-base física y varias presentaciones. Ejemplo 1 Bandeja de 6 UNI = 6 UNI fiscales, cantidad fiscal × precio fiscal preserva el importe/IVA. Cuando la presentación no tiene equivalente oficial SIFEN, convertir automáticamente a código oficial de la unidad-base, nunca inventar cUniMed; registrar presentación, factor, versión y precio comercial histórico. Versión Caja 12→10 usada previamente NO puede sobrescribirse.
**Código actual:** emision.ts:124–134 sólo obtiene productos.unidad_medida_id y unidad SIFEN base; CuerpoFactura emision.ts:151–157 no incluye presentaciónId, versión, factor ni unidad comercial; nueva/page.tsx:34–38/90–94/971–1037 ofrece unidad fiscal ajustable, cantidad y precio pero no selección de presentación ni conversión; emision.ts:355–421 no lee producto_unidades ni valida factor; payload-fe.ts:337–345 emite cUniMed/dCantProSer/dPUniProSer de línea preparada. Ajustar manualmente unidad fiscal no resuelve cálculo del factor.
**Criterio:** modelar precios/factores históricos por presentación, convertir fiscal sin alterar total, serialización SIFEN representable, guardar vínculo/snapshot comercial y fiscal estable para FE/NCE/devoluciones, sin cambiar movimientos de stock por iniciativa propia. Esta BRECHA ya fue registrada en auditorías Productos/Facturas previas y NO cuenta como nueva.

### FAT-G02 — integración FE con salida física de inventario no implementada

Contrato de integración Movimientos/Documentos: no hay vínculo persistente de líneas FE con eventos de stock, ni baja automática ni barrera de baja duplicada por FE, Remisión y Entrega. El usuario debe aprobar cuándo ocurre baja (emisión, entrega, remisión) y depósito/lote/unidad base antes de crear acciones. **No exigir baja en el flujo actual ni afirmar que se realizó**.

### FAT-G03 — contratos del proveedor y limitaciones legales aún no homologadas

FAT-E1-R02 conserva bloqueo de residuos IVA/pago no representables sin tolerancia. Pendencias externas: dSerieNum null vs omisión, D016/E610 de USD/BRL, otras ambigüedades del JSON del gateway, KuDE/XML y aprobación SIFEN real. Gateway status success+nro_lote = transmisión, NO aprobación; CDC/retorno fiscal definitivo solo por consulta coherente. PYG y política de decimales/centavos deben confrontarse con contrato vigente antes de imponer truncamiento adicional.

### FAT-G04 — contraste visual real pendiente

La ficha FAT-UX-R01 de 14/10 describía un formulario vertical anterior. El código actual sí usa workspace desktop con panel de totales sticky y buscadores; NO repetir como vigentes los hallazgos UX resueltos. Capturas históricas de competencia sólo están mapeadas en requisito textual, no como archivos binarios de GitHub; no hacer afirmaciones pixel-a-pixel sin browser real.

## 5. Observaciones adicionales (no bugs nuevos)

1. El número próximo es REFERENCIAL; FE y NCE tienen secuencias independientes por empresa+punto+tipo; transición sin serie→AA→ZZ gestionada por backend.
2. Cliente Innominado en FE está sujeto a condiciones fiscales B2C y límite NT024; NO confundir con decisión del responsable de vetar selección Innominado en la UI de NCE.
3. Prohibir facturar producto no vendible está implementado, superando FAT-X01 histórico.
4. Precios de lista sólo se toman en moneda igual; cambiar moneda borra/prepara montos y pagos bajo confirmación, sin conversión implícita.
5. «Guardar también en Productos» actualiza sólo clasificación de IVA; permiso y bitácora independientes; no repetir guardado en documento reutilizado.
6. Cuotas deshabilitadas y otras formas de pago admitidas por la versión actual; no congelar el sistema a descripción antigua P0 Efectivo exclusivamente.
7. El envío puede quedar grabado antes de perder respuesta HTTP; guiar al operador a recuperación segura por documento, nunca afirmar que error frontend implica ninguna FE.
8. No se inspeccionó estado real de NEX-047/048/060/061/063 ni throughput de 999 ítems; pruebas de carga reales faltantes.
9. No se ejecutó browser desktop real a 1440/1920: verificar foco y accesibilidad del modal, tabla, sticky y selectors sin inventar defectos de CSS.

## 6. Matriz focal de pruebas futuras (NINGUNA ejecutada en esta ronda)

| ID | Prueba/criterio |
| --- | --- |
| FAT-T01 | A→B en buscador rápido de clientes con flechas/Enter a 0/100/300 ms: no seleccionar A |
| FAT-T02 | A→B en productos por GTIN con scanner; GET Enter tardío no elige A |
| FAT-T03 | Pausar /previa, editar cliente/cantidad/precio/IVA/punto/moneda, revisar: enviar solo contenido aprobado |
| FAT-T04 | Producto/cliente cambian fuera del browser tras previa: confirmar coherencia o nueva revisión |
| FAT-T05 | POST emisión creado con respuesta perdida + cambio posterior del catálogo: recuperar FE original sin duplicación |
| FAT-T06 | Dos POST simultáneos con misma clave y mismo contenido: un documento, un número y un envío real |
| FAT-T07 | Catálogos fiscales modificados concurrentemente durante prepararFactura: snapshot validado |
| FAT-T08 | Producto p.vendible=false directo API → 422 sin número ni transmisión |
| FAT-T09 | Cliente fiscalmente inapto/receptor RUC DV y campos D201–D224, mismo resultado UI/API |
| FAT-T10 | Presentación Caja 12 y Caja 10 versionadas; Bandeja 6 → 6 UNI oficiales, total/IVA exacto |
| FAT-T11 | Ajuste por línea IVA/unidad y permiso AJUSTE_FISCAL; PRECIO y PRODUCTOS.EDITAR independientes |
| FAT-T12 | IVA parcial NT13 con residuos: bloquear escenarios no representables sin dRedon |
| FAT-T13 | PYG contado efectivo, múltiples pagos y crédito a plazo con entrega: E608 y sumas exactas |
| FAT-T14 | Cuotas UI y API directa bloqueadas, sin reservar número |
| FAT-T15 | USD/BRL con F023 exacto, cambio manual/sugerido y límites numéricos; no convertir precio ajeno |
| FAT-T16 | Sucursal/punto FE fuera de alcance, inactivo, sin secuencia; NEX-063 serie/rollover |
| FAT-T17 | Gateway success/nro_lote, timeout, 4xx/5xx, CDC discrepante: separar envío de SIFEN aprobado |
| FAT-T18 | FE Innominado permitido sólo dentro de condiciones legales; sin heredar restricción NCE |
| FAT-T19 | Día cambia en Paraguay con formulario abierto; fecha y crédito coherentes con servidor |
| FAT-T20 | Documento FE no registra automáticamente movimiento ni descuenta Stock |
| FAT-T21 | Browser desktop 1440/1920, 1/30/999 ítems, ancho tabla y foco modal/acciones |
| FAT-T22 | Moneda/condición cambia: cancelación conserva y confirmación limpia solo datos previstos |
| FAT-T23 | Idempotencia después de guardar también IVA en Producto: no duplica bitácora ni cambia FE anterior |
| FAT-T24 | Grabar/previsualizar no reserva secuencia ni crea solicitud, número solo en enviar confirmado |

## 7. Veredicto y siguiente menú

**2 ALTAS NUEVAS + 2 MEDIAS NUEVAS + 1 BAJA NUEVA** por código vigente; **1 ALTA FUNCIONAL heredada** (presentaciones), más otras dependencias estructurales heredadas. No repetir casos FAT-E1/FAT-X01/UX de código antiguo ya corregidos; no confundir riesgo sin ensayo PG con incidente reproducido. **NO HOMOLOGADO**, 0 tests reales, 0 migrations/código funcional, Claude no autorizado. Auditoría global NEXIT sigue en marcha; próximos menús V1 aún pendientes: Facturación → Puntos de expedición y Notas de crédito. Plataforma → Empresas permanece separado; menús ocultos fuera del V1 precisan decisión de alcance.