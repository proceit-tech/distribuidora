# AUD-PRO128-R00 — Auditoría integral PRE-implementación: pantalla × API × PostgreSQL × JSON gateway × SIFEN

**Fecha:** 15/10/2026. **Responsable funcional/auditor:** ChatGPT/PROCEIT. **Issue:** PRO-128. **Estado:** revisión PREVIA y orden cerrada para etapa de UX. **NO es implementación ni homologación fiscal ni de VM.** **Branch:** `feature/NEXIT-2026-001-banco-demo` (tras AUD-PRO129-R05).

## 0. Decisión y alcance
Se realiza una **nueva auditoría de la implementación vigente**, no se copian los diagnósticos «AUSENTE» de AUD-FE-CAMPOS-R01 redactados antes de P0/P1/P2. El usuario pidió todos los campos de la pantalla, todas sus fuentes en base, sus correspondencias SIFEN y JSON, y una pantalla compacta y profesional. Esta auditoría incluye inventario íntegro de las 117 claves del ejemplo propietario al final, **más campos normativos fuera de esas 117 claves**. El ejemplo original no es lista de campos habilitados del gateway.
**Límite:** se inspeccionó código y DDL versionados, requisitos originales y evidencia sanitizada de 13 XML FE; capturas recientes fueron compartidas en chat pero no están versionadas en Git; no hubo ejecución de navegador, VM, SQL operacional ni transmisión API, y el JSON crudo original no se volvió a comparar byte a byte (se usa su inventario documental). El Manual SIFEN v150 es contrato normativo del **XML**; el JSON del gateway es otro nivel, aunque el responsable confirmó correspondencia de **nombres y tipos**. Omisión de descriptor en JSON no prueba omisión en XML final.

## 1. Fuentes de verdad y precedencia
- **Norma:** [Manual Técnico SIFEN v150, DNIT](https://www.dnit.gov.py/documents/20123/420592/Manual%2BT%C3%A9cnico%2BVersi%C3%B3n%2B150.pdf/e706f7c7-6d93-21d4-b45b-5d22d07b2d22?t=1687362295907), sobre todo D1/D3/E1/E6/E7/E8/EA/F/J; [NT 023](https://ekuatia.set.gov.py/documents/20123/420595/NT_E_KUATIA_023_MT_V150.pdf/9580922b-5dd5-60f9-4857-ae66a757898f?t=1724956850006) (E711 1-10p(0-8); unidades 111–140), [portal oficial de NT](https://ekuatia.set.gov.py/en/web/e-kuatia/documentacion-tecnica), [XSD v150 publicados](https://ekuatia.set.gov.py/sifen/xsd/). Notas específicas por modalidad requieren revisión de vigencia; NO declarar que todo el paquete NT o cada regla ha sido validado byte a byte.
- **Contrato propietario y decisiones:** `documentacao/v1/REQUISITOS-FACTURACION-ELECTRONICA-API-EXTERNA-2026-10-12.md`, `documentacao/v1/MATRIZ-MAESTRA-FE-TELA-JSON-SQL-SIFEN-2026-10-15.md`, `documentacao/v1/AUD-FE-CAMPOS-TELA-JSON-BANCO-MT150-2026-10-15.md`, `documentacao/v1/EVIDENCIAS-FISCAIS-FE-13-XML-2026-10-14.md` y `documentacao/v1/homologacao-visual/AUD-FE-UX-OPERACION-PUNTOS-UNIDADES-IVA-2026-10-15.md`.
- **UI actual:** `app/(private)/facturas/nueva/page.tsx`, `ajuste-fiscal-item.tsx`, `medios-pago.tsx`, `condicion-credito.tsx`, `page.module.css`; **API:** `app/api/facturas/{catalogos,productos,clientes,previa}/route.ts` y `app/api/facturas/route.ts`, además de `app/api/facturacion/puntos/`.
- **Lógica:** `lib/facturacion/{emision,ajuste-item,ajuste-fiscal,calculo,credito,pagos,monedas,payload-fe,envio,gateway,servidor,puntos}.ts`; **DDL:** NEX-039/040/043/045/047/048/049/050/051/054/055/056/057/058/059, además de catálogos y clientes. No significa que estas migrations estén aplicadas en la VM.
- **Gobernanza:** `CLAUDE.md` y `documentacao/PROTOCOLO-IA.md`; ChatGPT define/audita, Claude implementa sólo etapa autorizada, responsable opera PostgreSQL/VM y homologa. Sólo tests básicos dirigidos, nunca suite/build global/CI manual salvo autorización expresa.

## 2. Matriz ejecutiva campo a campo — pantalla, API, DB, JSON, norma y acción PRO-128
| ID | Pantalla/condición de visualización | Fuente real API / PostgreSQL | Campo SIFEN → JSON/API | Diagnóstico actual y acción UX exigida |
|---|---|---|---|---|
| UX-01 | Sucursal autorizada activa | `catalogosFactura` → `sucursales`, `sucursal_en_alcance` | C/D `dEst` por NEX-048 | Selector compacto, establecimiento no editable; mantener validación de alcance y errores por campo. |
| UX-02 | Punto de expedición y próximo N° referencial | `fe_puntos_expedicion`, `ultimo_numero`; PRO-129 ruta `/facturacion/puntos` | `dPunExp`, `dNumDoc`, `dSerieNum`, `dFeEmiDE` inyectados NEX-048 | Mostrar punto y enlace contextual **real** al admin autorizado; falta punto no habilita emisión; no editar secuencia ni insertar punto desde FE. |
| UX-03 | Tipo de transacción | `opciones.tiposTransaccion` de `TIPOS_TRANSACCION` | D011 `iTipTra` (D012 descriptor XML dependiente) | **Hoy escondido en details**. Hacer visible al lado de presencia. Habilitados 1–4; 5–13 sólo modalidad fiscal completa en etapas posteriores. |
| UX-04 | Indicador de presencia | `opciones.presencias` de `INDICADORES_PRESENCIA` | E011 `iIndPres` (E012 Otro=9 si aplicable) | **Hoy escondido**. Mostrar 1–6; 9 no habilitado hasta texto y regla en UI/API/JSON. Preserve compatibilidad con pago bancario 16. |
| UX-05 | Impuesto de operación | código FE `iTImp=1`, impuestos de producto | D013 `iTImp` | IVA 1 es automático en FE ordinaria; NO inventar selector ISC/Renta, casos especiales fuera del escopo. |
| UX-06 | Moneda de documento | selector PYG/USD/BRL, `tipos_cambio` por empresa, FX manual | D015 `cMoneOpe`, D017 `dCondTiCam`, D018 `dTiCam`, F023 `dTotalGs` | Mantener cambio PYG por 1 extranjero, mostrar sólo si corresponde; revalidar precios/saldos al cambiar, nunca convertir precio ocultamente. |
| UX-07 | Fecha/hora emisión vs fecha referencial | hora local mostrada, NEX-048 `fecha_emision=now()` al reservar | `dFeEmiDE` C, se añade SQL sólo al emitir | No introducir edición de fecha ni «competencia» sin definición fiscal. La fecha UI es indicativa y se confirma con servidor. |
| UX-08 | Contado/Crédito | `iCondOpe` de `CONDICIONES_OPERACION`; `condicion-credito.tsx` | E601 `iCondOpe`, crédito E641/E643/E645 | Select visible compacto; con Crédito desplegar **sólo Plazo** con días 30/60/90 y entrega inicial opcional; sin entrega NO mostrar pagos. |
| UX-09 | Cuotas | `credito.ts`, `CUOTAS_HABILITADAS=false` en UI y servidor | E641/644, Cuotas E650–654 | **SUSPENDIDAS (PRO-121/P3)**. No reactivar UI/API pese a código residual; no crear calendarios contables. |
| UX-10 | Pago Efectivo único | `medios-pago.tsx`, `pagos.ts` | E605 y `FormaPago[]`: E606 `iTiPago`, E608 `dMonTiPag`, E609 `cMoneTiPag` | Cambiar fieldset enorme por fila compacta, monto implícito total; **mantener EXACTAMENTE cuatro claves del JSON baseline Efectivo/PYG**. |
| UX-11 | Pagos combinados y entrega inicial | `pagos.ts` suma BigInt y `credito.ts` | E645 entrega / E606-611 pagos (E611 extranjero) | Filas medio/monto/quitar y resumen de suma exacta; cheque, tarjeta, Otro sólo campos condicionales; no mostrar PAN/CVV. Hasta 20 medios, no añadir restricciones nuevas. |
| UX-12 | Cliente y aptitud fiscal | `clientes`, `direcciones_cliente`, `evaluarAptitudCliente` | D201–D224 receptor; JSON `iNatRec`,`iTiOpe`,`dRucRec`,`dDVRec`,`dNomRec`, direcciones/documentos | Buscar por código/nombre/RUC/CI, card compacta de receptor; ficha fiscal collapsible de **lectura**, pendiente con link Clientes; no inventar receptor. |
| UX-13 | Productos: búsqueda ágil y permisos | `productos`, `producto_codigos`, `v_producto_precio_referencia`, permiso CREAR/PRECIO/AJUSTE_FISCAL | E701 `dCodInt`, E706 `dGtin`, E708 `dDesProSer` | Búsqueda rápida + avanzada preservadas, añadir ítems incompletos sólo si permiso corrige su pendencia específica; mensajes cortos. |
| UX-14 | Unidad de medida por línea | `unidades_medida.unidad_sifen_codigo` → `unidades_medida_sifen(codigo,representacion,descripcion,vigente)`, NEX-039/043 | E709 `cUniMed` NUM, E710 `dDesUniMed` desc XML | Renombrar **Unidad de medida**, mostrar código/símbolo/nombre fiscal en un selector BUSCABLE sin truncar; no alterar unidad física/stock. Verificar 64 versionadas vs vigentes VM antes de concluir faltantes. |
| UX-15 | IVA por ítem: afectación/tasa | `productos.afectacion_iva`, `proporcion_gravada_iva`, `impuestos.porcentaje`; ajuste JSON y NEX-056 | E731 `iAfecIVA`, E732 descriptor XML, E733 `dPropIVA`, E734 `dTasaIVA`, E735/736 cálculos | **Eliminar paso oculto**: selector directo Gravado 10 %, Gravado 5 %, Exento, Exonerado, Gravado parcial (5/10 + proporción); mapear 1/2/3/4 y valores sin introducir 0 falso. |
| UX-16 | Cambiar IVA y guardar en maestro | permisos `FACTURACION_ELECTRONICA.AJUSTE_FISCAL` y `PRODUCTOS.EDITAR`; bitácora `producto_clasificacion_fiscal_log` (NEX-056) | `ajuste.afectacion/tasa/proporcion` → JSON `iAfecIVA,dTasaIVA,dPropIVA` | Cambio en la factura por defecto. Guardar también en Productos **sólo clasificación IVA**, explícito, bitácora; sin permiso opción desabilitada, servidor 403. |
| UX-17 | Cantidad | `lineas.cantidad` → `leerCuerpoFactura`, `calculo.ts` y regla unidad 77 | E711 `dCantProSer` | Compactar input; cantidad 77 entera; norma NT023 admite hasta 8 decimales pero restricción comercial actual NEXIT 4 — no ampliar sin revisión total. |
| UX-18 | Precio unitario (IVA incluido) | precio vigente `v_producto_precio_referencia` en **misma** moneda, permiso PRECIO | E721 `dPUniProSer`; E723/EA008 derivados | Input compacto, etiqueta precio lista/modificado discreta y Restaurar; usar comparación Decimal, nunca descartar cambios por JS Number; 403 y 422 conservados. |
| UX-19 | Descripción fiscal e GTIN opcionales | `ajuste-item.ts`, `producto_codigos`, permiso AJUSTE_FISCAL | E708 `dDesProSer`, E706 `dGtin`; GTIN empaque E707 **no soportado** | Editor contextual sólo para ítem seleccionado, GTIN modo cadastro/informar/sin, 8/12/13/14. No confundir E706 con E714. |
| UX-20 | Cantidad/IVA/Subtotal/valores por línea | `calculo.ts` BigInt, `resumenCalculo`, preview backend | E722/EA008, E735/E736, `Detalles[]` | Grid `Producto | IVA | Unidad | Cantidad | Precio | Subtotal | Acciones` compacta; NO duplicar editor fiscal gigante debajo de cada ítem. |
| UX-21 | Descuento individual/global | **NO existe** contrato operativo en `CuerpoFactura` ni campos del builder, totales descuentos=0 | EA002–EA004, F008–F010, `dDescItem`, `dPorcDesIt`, `dDescGloItem` | **FUERA PRO-128**: PRO-124/D1; no simular descuento ni habilitar campo sin cálculo/snapshot/JSON. |
| UX-22 | Anticipos y vinculación CDC | **NO implementado** en UI, API y builder | `iCondAnt`, `dCDCAnticipo`, anticipos EA/F | **FUERA PRO-128**: PRO-125/D2, exige referencia verificable y compatibilidad fiscal. |
| UX-23 | Lote, serie, vencimiento, GTIN paquete, origen, dInfItem | **NO implementados** como campos fiscales en `CuerpoFactura` y `Detalles[]` | E707, E712/713, E714, E750–760, otros E702/703 | **FUERA PRO-128**: PRO-125/D2. No declarar «ocultos» ni inventar persistencia. |
| UX-24 | Sectorial/B2G/importación/vehículo | Sólo FE IVA ordinaria; no modelos completos especializados | iTipTra 5–13, `gCompPub`, `gVehNuevo`, `dNCM`, etc. | **FUERA PRO-128**: PRO-126/E; reglas especiales y NT026. No habilitar por mostrar selector. |
| UX-25 | Observaciones cabecera | state `infoAdicional` → JSON gateway `dInfAdic` y snapshot | **J003 `dInfAdic`**, fuera firma y **NO enviado ao SIFEN**, puede ir DE/KuDE | Campo compacto; preservar envío al **gateway** como contrato, pero NO afirmar que SIFEN valida esta clave; nunca confundir con G002 (error en matriz previa). |
| UX-26 | Subtotales/IVA/moneda y contravalor | `calculo.ts`, `payload-fe.ts`, JSONB snapshot NEX-048, documento total/moneda NEX-047 | F001–F023, `Subtotales[]` y F023 extranjero | Resumen lectura compacta con importe exacto formateado **sin Number para redondear/mostrar cifra grande**, P-02/P-11/P-12 pendientes; no reformular fiscales. |
| UX-27 | Guardar/revisar/confirmar/enviar | `/api/facturas/previa` y POST `/api/facturas`; `emision.ts` + `envio.ts` | `iTiDE=1`, JSON completo, NEX-048 en reserva, GW `/api/recepcion_de` | Preview nunca reserva número; enviar tras confirmación, idempotencia; resultado HTTP ≠ APROBADO; no cambiar estado fiscal con éxito local. |
| UX-28 | Estados/consulta/CDC/bitácora | `documentos_electronicos`, `documento_electronico_intentos`, `documento_electronico_solicitudes`, gateway | CDC respuesta; estado desde `/api/consulta_de` | Mantener UI de progreso/errores sin datos secretos, mantener referencia documentos, no inventar CDC. |
| UX-29 | Protección de cambios sin guardar | `useProtegerCambios`, estado `sucio` en `page.tsx` | No campo SIFEN; integridad UX | **DEFECTO REAL:** `sucio` sólo mira cliente, líneas y observaciones; cambios sólo en sucursal/punto/moneda/FX/tipo/presencia/condición/pago no quedan cubiertos. Vigilar TODOS los valores con semántica dirty/reset, no falsos positivos por defaults cargados. |
| UX-30 | Precisión en presentación | `gs(Number(...))` y `Number` en resumen, FX, importes de pago y precio lista | No modificar cálculo normativo ni tipo JSON | **RIESGO DE REPRESENTACIÓN:** preservar visualmente el mismo decimal que backend acepta; formateo decimal de string/BigInt sin pérdida, pruebas en importes altos. No normalizar/recalcular moneda. |
| UX-31 | Densidad visual/a11y/responsive | `page.module.css`, `MediosPago`, `EditorFiscalItem`, `.items`, `.resumenPanel` | No campo fiscal | A 1440/1024/768/375: compactación razonable, teclado, roles/labels, scroll y focus, error por campo, acción visible, sin ocultar selector ni duplicar totales. Capturas ANTES/DEPUÉS sólo si hay navegador; no alegarlas versionadas. |

## 3. Contrato exacto de selección de IVA y unidad
1. **Selector IVA visible por producto autorizado:** `Usar clasificación del producto` (valor efectivo), `Gravado 10 %` (= E731=1, E734=10, E733=100), `Gravado 5 %` (=1,5,100), `Exento` (=3,0,0), `Exonerado` (=2,0,0), `Gravado parcial 10 %` (=4,10,proporción requerida >0 y <100), `Gravado parcial 5 %` (=4,5, proporción requerida). El ajuste debe traducirse a **afectación+tasa juntas**, evitando que cambiar sólo `tasa` se ignore porque `ajuste.afectacion` sigue vacía. Respetar fórmula y bloqueo P-11, y que `dPropIVA` sea numérica en JSON; si se elige igual al maestro, no enviar ajuste redundante.
2. **Unidad:** selector buscable que muestra nombre, símbolo y código **de la misma entrada**, no fusionar dos códigos con mismo texto. Filtrar sólo `vigente`, exponer por API todas las filas vigentes (query actual no tiene LIMIT), comprobar catálogo real contra NEX-039 (34) + NEX-043 (30) en VM **sólo por responsable**. Para ajustar el código en FE se requiere `AJUSTE_FISCAL`. `Unidad de medida` es etiqueta visible; número E709 continúa en JSON y E710 descriptivo lo debe construir el gateway conforme contrato/XML, sin inventar cambio de payload.
3. **Campos adicionales:** no agregar campos de descuentos/anticipos/lotes/ítems especiales sólo porque en el ejemplo existan claves con null o el XML los permita. Se documentan y podrán implementarse en PRO-124/125/126 con contrato integral UI+API+SQL snapshot+JSON+reglas SIFEN. No se exige ni se pide un nuevo JSON por cada modalidad: nombres/tipos MT ya confirmados por el responsable.

## 4. Flujo UX deseado — sin campos gigantes
**Operación:** dos filas compactas con Sucursal · Punto · Condición · Moneda y Tipo de transacción · Indicador de presencia · Câmbio cuando extranjero. Mostrar próxima numeración sólo como informativa, no editar. **Pago:** un único Efectivo debe ocupar una sola fila tipo/monto implícito/añadir; otros medios añaden fila tipo+monto y muestran sólo cheque/tarjeta/Otro pertinentes; Crédito Plazo compacto. **Cliente:** búsqueda y resumen de ficha con acceso a detalles sólo cuando se solicite. **Productos:** tabla compacta; IVA 10/5 directo accesible desde fila, acción editar fiscal abre **un** panel contextual bien dimensionado, no `<tr>` adicional permanente por línea. **Resumen:** total, base/IVA y estado conciso; evitar cajas de advertencias repetidas; resumen y confirmación siguen teniendo todos los datos relevantes.
**No limpiar datos al abrir/cerrar el editor**, no perder foco después de cambiar IVA, preservar keyboard Enter/búsqueda, permisos y datos condicionales. Cambiar condición o moneda debe advertir limpiamente cuando borra información previamente digitada, sin conversión silenciosa. Evitar controles no funcionales.

## 5. Matriz de integración y no regresión — qué realmente se envía
| Capa | Campo/contrato | Evidencia concreta de código/DDL | Qué no puede cambiar PRO-128 |
|---|---|---|---|
| UI → API | `claveIdempotencia`, `sucursalId`, `puntoId`, `clienteId`, `tipoTransaccion`, `presencia`, `moneda`, `cambio`, `condicion/credito`, `pagos[]`, `lineas[].productoId/cantidad/precio/ajuste`, `infoAdicional` | `page.tsx:cuerpoFactura`, `emision.ts:leerCuerpoFactura` | Payload de request igual o compatível; nenhum campo novo só visual. |
| API → SQL | Cliente/Itens/permiso, `puntos` ativos, `unidades_medida_sifen`, IVA e preços oficiais | `emision.ts:prepararFactura`, NEX-039/040/043/045/051/056/057..059 | Não mudar ACL, multiempresa, acesso/sucursal/point nem conversão de preços. |
| SQL → JSON imutável | `documentos_electronicos.moneda/total`, `documento_electronico_solicitudes.payload`, `payload_hash`, chave idempotente, nº/fecha | NEX-047/048, `fe_documento_crear_fe` | Preservar snapshot, número, sequência, hash, data e estados separados. |
| JSON gateway → XML SIFEN | `FormaPago[]`, `Detalles[]`, `Subtotales[]`, cabecera e receptor; enriquecimento desc oficiais | `payload-fe.ts`, MT v150, exemplo proprietário parcial | Não adicionar nem omitir chave fiscal por mero layout. Descritores E710, E732, D016/E610 FX e outros precisam comprovação no gateway/XML, **não são automaticamente inputs UI**. |
| Gateway → status NEXIT | `/api/login`, `/api/recepcion_de`, `/api/consulta_de`, CDC/lote/resposta | `gateway.ts`, `envio.ts`, NEX-049/050/054/055 | HTTP 200/ENVIADO não é APROBADO; manter erro, retry e consulta sem duplicidade. |

## 6. Inventario completo de las 117 claves históricas del JSON — nueva lectura en código actual
**Origen:** sección §5 de `MATRIZ-MAESTRA-FE-TELA-JSON-SQL-SIFEN-2026-10-15.md` (inventario de un JSON parcial aportado); contraste **estático y automatizado** contra literal de `construirPayloadFE` y cuerpo de `payload-fe.ts` de la branch, complementado por NEX-048 y fases conocidas. **Los estados de esta columna identifican presencia funcional aproximada, NO obligatoriedad, validez matemática ni generación incondicional**. `JSON construido`=propiedad explícita en el código; `JSON condicional` sólo si la modalidad; `JSON=0` significa función aún ausente, no implementación; `Sin clave en builder` requiere regla por campo y puede ser opcional/no aplica. `SQL` reservado/completado por NEX-048; `GATEWAY` en respuesta. Los códigos D1/D2/E corresponden a trabajos posteriores, no controles ocultos. Esta no es una tabla de 117 inputs.

| # | Bloque JSON | Campo | Estado verificable hoy / origen | Fase de contrato |
|---:|---|---|---|---|
| 001 | Cabecera | `cdc` | GATEWAY | 0 |
| 002 | Cabecera | `dInfoEmi` | JSON null | P |
| 003 | Cabecera | `dInfoFisc` | JSON null | P |
| 004 | Cabecera | `dInfAdic` | JSON construído | 0 |
| 005 | Cabecera | `dEst` | SQL | 0 |
| 006 | Cabecera | `dPunExp` | SQL | 0 |
| 007 | Cabecera | `dNumDoc` | SQL | 0 |
| 008 | Cabecera | `dSerieNum` | SQL | P |
| 009 | Cabecera | `dFeEmiDE` | SQL | P |
| 010 | Cabecera | `iTipTra` | JSON construído | E |
| 011 | Cabecera | `iTImp` | JSON construído | E |
| 012 | Cabecera | `cMoneOpe` | JSON construído | C |
| 013 | Cabecera | `dCondTiCam` | JSON construído | C |
| 014 | Cabecera | `dTiCam` | JSON construído | C |
| 015 | Cabecera | `iCondAnt` | D2 ausente | D2 |
| 016 | Cabecera | `iTipCont` | Especial/sem fluxo | P |
| 017 | Cabecera | `gRespDE` | Especial/sem fluxo | P |
| 018 | Cabecera | `iNatRec` | JSON construído | 0 |
| 019 | Cabecera | `iTiOpe` | JSON construído | 0 |
| 020 | Cabecera | `cPaisRec` | JSON construído | 0 |
| 021 | Cabecera | `iTiContRec` | JSON construído | 0 |
| 022 | Cabecera | `dRucRec` | JSON construído | 0 |
| 023 | Cabecera | `dDVRec` | JSON construído | 0 |
| 024 | Cabecera | `iTipIDRec` | JSON construído | 0 |
| 025 | Cabecera | `dDTipIDRec` | JSON construído | 0 |
| 026 | Cabecera | `dNumIDRec` | JSON construído | 0 |
| 027 | Cabecera | `dNomRec` | JSON construído | 0 |
| 028 | Cabecera | `dNomFanRec` | JSON construído | 0 |
| 029 | Cabecera | `dDirRec` | JSON construído | 0 |
| 030 | Cabecera | `dNumCasRec` | JSON construído | 0 |
| 031 | Cabecera | `dTelRec` | JSON construído | 0 |
| 032 | Cabecera | `dCelRec` | JSON construído | 0 |
| 033 | Cabecera | `dEmailRec` | JSON construído | 0 |
| 034 | Cabecera | `dEmailAdic` | JSON construído | 0 |
| 035 | Cabecera | `dEmailAdmin` | JSON construído | 0 |
| 036 | Cabecera | `dCodCliente` | JSON construído | 0 |
| 037 | Cabecera | `iIndPres` | JSON construído | E |
| 038 | Cabecera | `dFecEmNR` | JSON null | E |
| 039 | Cabecera | `gCompPub` | Especial/sem fluxo | E |
| 040 | Cabecera | `iCondOpe` | JSON construído | B1 |
| 041 | Cabecera | `iCondCred` | JSON condicional | B1 |
| 042 | Cabecera | `dPlazoCre` | JSON condicional | B1 |
| 043 | Cabecera | `dCuotas` | JSON condicional | B1 |
| 044 | Cabecera | `dModCont` | Especial/sem fluxo | E |
| 045 | Cabecera | `dEntCont` | Especial/sem fluxo | E |
| 046 | Cabecera | `dAnoCont` | Especial/sem fluxo | E |
| 047 | Cabecera | `dSecCont` | Especial/sem fluxo | E |
| 048 | Cabecera | `dFeCodCont` | Especial/sem fluxo | E |
| 049 | Cabecera | `iTiDE` | JSON construído | 0 |
| 050 | FormaPago | `iTiPago` | JSON construído | B2 |
| 051 | FormaPago | `dMonTiPag` | JSON construído | B2 |
| 052 | FormaPago | `cMoneTiPag` | JSON construído | C |
| 053 | FormaPago | `dTiCamTiPag` | JSON construído | C |
| 054 | Detalles | `dCodInt` | JSON construído | 0 |
| 055 | Detalles | `dParAranc` | D2 ausente | D2 |
| 056 | Detalles | `dNCM` | D2 ausente | D2 |
| 057 | Detalles | `dGtin` | JSON construído | A |
| 058 | Detalles | `dGtinPq` | D2 ausente | D2 |
| 059 | Detalles | `dDesProSer` | JSON construído | A |
| 060 | Detalles | `cUniMed` | JSON construído | A |
| 061 | Detalles | `dCantProSer` | JSON construído | 0 |
| 062 | Detalles | `cPaisOrig` | D2 ausente | D2 |
| 063 | Detalles | `dInfItem` | D2 ausente | D2 |
| 064 | Detalles | `cRelMerc` | Sem chave no builder | E |
| 065 | Detalles | `dCanQuiMer` | Sem chave no builder | E |
| 066 | Detalles | `dPorQuiMer` | Sem chave no builder | E |
| 067 | Detalles | `dCDCAnticipo` | D2 ausente | D2 |
| 068 | Detalles | `dPUniProSer` | JSON construído | 0 |
| 069 | Detalles | `dTotBruOpeItem` | JSON construído | 0 |
| 070 | Detalles | `dDescItem` | D1 ausente | D1 |
| 071 | Detalles | `dPorcDesIt` | D1 ausente | D1 |
| 072 | Detalles | `dDescGloItem` | D1 ausente | D1 |
| 073 | Detalles | `dAntPreUniIt` | D2 ausente | D2 |
| 074 | Detalles | `dAntGloPreUniIt` | D2 ausente | D2 |
| 075 | Detalles | `dTotOpeItem` | JSON construído | D1 |
| 076 | Detalles | `iAfecIVA` | JSON construído | A |
| 077 | Detalles | `dPropIVA` | JSON construído | A |
| 078 | Detalles | `dTasaIVA` | JSON construído | A |
| 079 | Detalles | `dBasGravIVA` | JSON construído | 0 |
| 080 | Detalles | `dLiqIVAItem` | JSON construído | 0 |
| 081 | Detalles | `gVehNuevo` | Especial/sem fluxo | E |
| 082 | Detalles | `dBasExe` | JSON construído | 0 |
| 083 | Detalles | `dNumLote` | D2 ausente | D2 |
| 084 | Detalles | `dVencMerc` | D2 ausente | D2 |
| 085 | Detalles | `dNSerie` | D2 ausente | D2 |
| 086 | Detalles | `dNumPedi` | D2 ausente | D2 |
| 087 | Detalles | `dNumSegui` | D2 ausente | D2 |
| 088 | Detalles | `dNomImp` | Sem chave no builder | E |
| 089 | Detalles | `dDirImp` | Sem chave no builder | E |
| 090 | Detalles | `dNumFir` | Sem chave no builder | E |
| 091 | Detalles | `dNumReg` | Sem chave no builder | E |
| 092 | Detalles | `dNumRegEntCom` | Sem chave no builder | E |
| 093 | Subtotales | `dSubExe` | JSON construído | 0 |
| 094 | Subtotales | `dSubExo` | JSON construído | 0 |
| 095 | Subtotales | `dSub5` | JSON construído | 0 |
| 096 | Subtotales | `dSub10` | JSON construído | 0 |
| 097 | Subtotales | `dTotOpe` | JSON construído | D1 |
| 098 | Subtotales | `dTotDesc` | JSON=0 (não suportado) | D1 |
| 099 | Subtotales | `dTotDescGlotem` | JSON=0 (não suportado) | D1 |
| 100 | Subtotales | `dTotAntItem` | JSON=0 (não suportado) | D2 |
| 101 | Subtotales | `dTotAnt` | JSON=0 (não suportado) | D2 |
| 102 | Subtotales | `dPorcDescTotal` | JSON=0 (não suportado) | D1 |
| 103 | Subtotales | `dDescTotal` | JSON=0 (não suportado) | D1 |
| 104 | Subtotales | `dAnticipo` | JSON=0 (não suportado) | D2 |
| 105 | Subtotales | `dRedon` | JSON=0 (não suportado) | P |
| 106 | Subtotales | `dComi` | Especial/sem fluxo | E |
| 107 | Subtotales | `dTotGralOpe` | JSON construído | 0 |
| 108 | Subtotales | `dIVA5` | JSON construído | 0 |
| 109 | Subtotales | `dIVA10` | JSON construído | 0 |
| 110 | Subtotales | `dLiqTotIVA5` | JSON construído | P |
| 111 | Subtotales | `dLiqTotIVA10` | JSON construído | P |
| 112 | Subtotales | `dIVAComi` | Especial/sem fluxo | E |
| 113 | Subtotales | `dTotIVA` | JSON construído | 0 |
| 114 | Subtotales | `dBaseGrav5` | JSON construído | 0 |
| 115 | Subtotales | `dBaseGrav10` | JSON construído | 0 |
| 116 | Subtotales | `dTBasGraIVA` | JSON construído | 0 |
| 117 | Subtotales | `dTotalGs` | JSON cond. PYG/FX | P |

## 7. Campos adicionales normativos que no están en las 117 claves / que el XML completa
| Grupo oficial | Campos adicionales a los 117 | Estado y responsabilidad |
|---|---|---|
| D1 moneda/operación | D012 `dDesTiTra`, D016 `dDesMoneOpe` | Descriptores del XML conforme códigos; no afirmar que gateway USD/BRL derivó D016 sin resultado. |
| E1 presencia | E012 `dDesIndPres` para `Otro=9` | Código 9 no habilitado en NEXIT; se requiere condición y texto antes de mostrarlo. |
| E8 unidades e IVA | E710 `dDesUniMed` (desc 1–10, referencia E709); E732 `dDesAfecIVA` (referencia E731) | Obligatorios XML según MT. Builder JSON actual pasa códigos, **no** estos descriptores; verificar derivación del gateway/resultado XML, no inventar claves ni textos en PRO-128. |
| E6 pagos | E607 `dDesTiPag`; E610 `dDMoneTiPag`; E622 `dDesDenTarj`; condicionales cheque E631/632, tarjeta E621/E626 | Implementados como claves JSON en medios habilitados cuando hay texto fiscal conocido; Efectivo/PYG baseline de 4 claves; USD/BRL E610 pendiente de gateway. |
| E8 receptor/item | E713 `dDesPaisOrig`, E716 `dDesRelMerc`, E714 `dInfItem`, E707 `dGtinPq` | Campos de grupos opcionales/especiales D2, no UI ni builder actual; no extender sin modalidad. |
| J fuera de firma | J003 `dInfAdic` | Se envía al JSON gateway por contrato comercial, pero Manual ordena **NO enviarlo al SIFEN**; verificar tratamiento en la transformación a XML para SIFEN/KuDE. **No es G002**. |
| E711 cantidad | NT023 `dCantProSer` hasta 8 decimales | Restricción comercial NEXIT hasta 4; si se solicita 8, reabrir integridad de UI/API/Decimal/JSON en fase separada. |

## 8. Evidencia de aceptación (antes / después, segunda auditoría AUD-PRO128-R01)
| CA | Test focal mínimo | Evidencia requerida |
|---|---|---|
| CA-01 | Operación: cambio tipo/presencia/moneda, condición Plazo, punto, permisos; visible a primera vista | Campo UI → `cuerpoFactura` → API `leerCuerpoFactura` → `iTipTra/iIndPres/iCondOpe` JSON; dirty protection. |
| CA-02 | Una FE Contado PYG Efectivo, una Crédito Plazo sin entrega y una con entrega | JSON baseline 4 claves efectivo, crédito sin `FormaPago` cuando sin entrega, exactitud de conciliación y sin cuota. |
| CA-03 | IVA de producto 10→5, 5→10, Exento, Exonerado y parcial 5/10 con proporción | Mapeo E731/E733/E734; `calculo.ts` y `payload-fe.ts` idénticos; si residuo P-11, bloqueo fiscal actual conservado. |
| CA-04 | Permisos AJUSTE_FISCAL × PRECIO × PRODUCTOS.EDITAR y producto incompleto | Sin escalamiento de permisos, 403/422 y sólo IVA maestro con bitácora, sin cambio físico de unidad. |
| CA-05 | Unidades: todas vigentes en catálogo, seleccionar `Caja 131/BX`, `Docena 113/DOC`, otro código igual descripción | `GET /api/facturas/catalogos` sin truncamiento, `cUniMed` exacto en JSON, fuente/descripcion visibles. No declarar 64 filas en VM. |
| CA-06 | Cheque/tarjeta/mixtos, crédito entrega inicial y moneda USD/BRL FX | Campos condicionales y suma Decimal; F023 exacto, no precio convertido, no tarjetas sensibles. |
| CA-07 | Guardar/preview/confirmar y recuperación tras cerrar editor | Prevía sin numeración, cambios no perdidos y alert de modificaciones aisladas; idempotencia en envío. |
| CA-08 | Importes grandes y diferencia Decimal 0,0001 en precio/pago/totales | UI muestra mismo valor semántico validado por servidor, nunca redondea silenciosamente con `Number`. |
| CA-09 | Dispositivos 1440/1024/768/375px, teclado, modal y focus | Screenshots ANTES/DEPUÉS reales únicamente si entorno accesible; si no, código revisado y capturas manuales pendentes. |
| CA-10 | Descuentos, anticipos, lotes, Cuotas, operaciones especiales | No aparecen controles editables falsos, ni alteran payload baseline; pendientes identificadas por fase separada. |

## 9. Puertas que no se pueden declarar cerradas aquí
- **P-02** valor `dTotalGs` en PYG JSON vs XML, **P-11** IVA parcial/residuo NT13, **P-12** `dLiqTotIVA5/10`; **D016/E610 USD/BRL** y los descriptores E710/E732, omisión/null y `dInfAdic` J003 en transformación al XML dependen de pruebas de gateway/contrato y no se resuelven por estética.
- **No instalado en VM:** NEX-056 y NEX-057/058/059 requieren comprobación real por el responsable de `schema_migrations`, checksums, backup y secuencia, sobre todo NEX-057 editada tras publicación. No desplegar de forma presuntiva.
- **No emitir como ensayo automático:** ambiente del gateway (homologación/producción), punto/timbrado/último número externo, identidad de emisor y reporte SIFEN deben ser comprobados por el responsable humano.

## 10. Implementación autorizable — PRO-128 únicamente
Claude debe sincronizar rama, leer protocolos/progreso, este documento y referencias oficiales pertinentes, ejecutar **únicamente UX-01..UX-31 en su vertiente de reorganización/compactación, IVA directo, catálogo de unidades, dirty state y formateo de la UI**, conservando contrato UI→API→snapshot→JSON y protecciones existentes; si detecta una incompatibilidad que requiere motor/migration, **detener y documentar el bloqueo** en vez de introducir cambios fiscales de otro alcance. No abrir PRO-124/125/126 ni Cuotas. Testes básicos focalizados, commit/push SHA completo y **PAUSA para AUD-PRO128-R01**; ChatGPT reaudita campo a campo antes de VM. Sin migrations nuevas por estética, sin cambio API externo/SQL/permiso, sin suite completa/build general/CI manual ni acceso de IA a VM/PG real/gateway.