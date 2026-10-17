# MATRIZ MAESTRA FE — Nueva factura electrónica: UI × JSON × SQL × SIFEN
**Versión:** MFE-02 · **Fecha:** 15/10/2026 · **Autor de requisitos, auditoría y aceptación estática:** ChatGPT / PROCEIT · **Implementador exclusivo:** Claude Code · **Aprobación operacional:** responsable humano.

> **Carácter:** especificación funcional/fiscal **para implementación incremental**, basada en evidencia identificada, no certificación integral del manual, aprobación fiscal, aceptación del gateway ni autorización de deploy. No se transcriben credenciales, RUC, CDC, firmas ni datos personales de XMLs.

## 0. DECISIÓN DEL RESPONSABLE — PARIDAD DE CAMPOS JSON ↔ MANUAL SIFEN (15/10/2026)

**Confirmación contractual de primera mano del responsable:** El JSON que recibe el gateway **emplea los mismos nombres de campos, los mismos tipos de datos y la misma semántica funcional descritos en el Manual Técnico SIFEN**. El JSON compartido como ejemplo era **una sola factura concreta**, sin campos de Crédito/Plazo/Cuotas, medios alternativos de pago, monedas u otros grupos opcionales/condicionales **porque esa factura no los utilizaba**. **La ausencia en ese ejemplo no significa que el gateway no los soporte.** Esta confirmación **corrige y prevalece** sobre la hipótesis anterior «es necesario un ejemplo específico del proveedor por cada grupo».

**Regla obligatoria de desarrollo:** especificar e implementar los campos faltantes a partir del **Manual v150, Notas Técnicas aplicables, catálogos, obligatoriedad y tipos exactos**; reutilizar las estructuras JSON ya conocidas por el NEXIT (`FormaPago[]`, `Cuotas[]`, `Detalles[]`, `Subtotales[]`) y comprobar, en revisión estática, la correspondencia del grupo/array con el formato del contrato que sí existe. **No inventar traducciones ni nombres alternativos.** Para los campos que el MT califica como N, enviar números con precisión válida; para A, cadenas; fechas según su formato oficial; códigos y dependencias según el catálogo y las condiciones. No insertar placeholders, `null` ni campos de modalidades ajenas para rellenar los 117 del ejemplo.

**Alcance de la confirmación:** resuelve la incertidumbre de **nombres/tipos y de la falta de campos en el ejemplo**; no demuestra una transmisión exitosa del nuevo caso, la conformidad matemática de todos los valores, la firma/XML de salida o la aprobación SIFEN. **No imponer `CONTRATO_GATEWAY_NO_CONFIRMADO` por el mero hecho de que el ejemplo no mostrara Cuotas, tarjeta, cheque, USD o descuentos.** Bloquear antes de emitir **únicamente** si se identifica un defecto normativo, una discrepancia real y específica de serialización/contrato, una obligatoriedad incumplida, una dependencia aún no implementada o un riesgo fiscal ya abierto (P-02/P-11/P-12). Documentar la evidencia exacta del bloqueo; no usar un bloqueo genérico preventivo.

**Autoridad y proceso:** requisitos/matriz pertenecen al ChatGPT; Claude implementa por fase y hace pruebas dirigidas; el responsable controla las emisiones reales y el único PostgreSQL/VM. La decisión de paridad **no autoriza envíos reales por la IA**, no salta la revisión ChatGPT y no permite cambiar migrations históricas.

## 0-A. DECISIÓN DEL RESPONSABLE MFE-03 — factura principal primero (15/10/2026)

**Decisión más reciente, vinculante:** POSPONER Crédito por Cuotas para fase futura. Prioridad: FACTURA PRINCIPAL con **producto completado antes de emitir, medios de pago, PYG/USD/BRL y Crédito por Plazo**. Esta decisión PREVALECE sobre el orden B1→B2→C→D de las secciones 7 y 10 anteriores; esas secciones conservan el inventario histórico, NO la secuencia vigente.

### Estado real (código HEAD f216700e87e4)

| Capacidad | Ya existe | Brecha o decisión |
|---|---|---|
| Contado PYG Efectivo | UI, API, IVA/total, JSON fiscal y NEX-048 | Preservar íntegramente |
| Crédito Plazo | iCondOpe=2, iCondCred=1, dPlazoCre, previa y entrega en Efectivo | Conservar Plazo de 30/60/90 días y aislar de Cuotas; revisar comportamiento de monto inicial |
| Crédito Cuotas | Código, editor y JSON ya añadidos; AUD-MFE-B1-R01 detectó 2 fallas ALTAS | **APLAZADO:** ocultar/deshabilitar selector Y bloquear API de creación para Cuotas antes de reservar número, sin borrar código ni impedir consultar documentos ya creados |
| Medios de pago | FORMAS_PAGO solo Efectivo, un pago en API | Transferencia, cheque, tarjetas crédito/débito, otras modalidades aplicables y mixtos, con grupos condicionales SIFEN y conciliación exacta |
| Monedas | Solo PYG en UI, API y JSON | USD y BRL, tipo de cambio manual PYG por 1 moneda extranjera, fecha, cálculo y snapshot |
| Productos incompletos | Fase A: seleccionar con permiso AJUSTE_FISCAL, ajustar unidad SIFEN, afectación/tasa/proporción IVA, descripción fiscal, GTIN; precio con permiso PRECIO | UX de completar datos en la línea antes de emitir; mostrar todos los obligatorios pendientes, no forzar salir a Productos, validar todo al servidor |
| Guardar en Productos | Solo IVA bajo PRODUCTOS.EDITAR, confirmación y bitácora | Ser transparente: unidad, precio, GTIN y descripción permanecen solo en la factura. No prometer guardar todo; guardar más campos exigiría flujo específico, permisos, auditoría y no alterar unidad base/stock/lista de precio implícitamente |
| Opcionales avanzados | No todos | dInfItem, GTIN paquete, lotes, anticipos y escenarios especiales quedan después; no transformar opcionales en obligatorios generales |

### Secuencia nueva, una tarea Claude por revisión

| Prioridad | Entrega | Alcance y bloqueo de seguridad |
|---|---|---|
| **P0 primero — CORE** | Completar producto dentro de la factura y estabilizar Crédito a Plazo | Editor contextual y resumen de pendientes, permisos, snapshot, mensajes claros, sin crear DE con obligatorios faltantes; mantener Contado. Habilitar SOLO Plazo, deshabilitar Cuotas también en backend y evitar reservar número con POST Cuotas; conservar código para posterior corrección. Entrega inicial en Efectivo y saldo a plazo con conciliación decimal |
| **P1 — PAGOS / PRO-122** | Formas de pago completas | Efectivo, transferencia, cheque, tarjetas y combinaciones; subcampos fiscales solo cuando corresponda, sumas exactas del Contado y de la entrega del Crédito a Plazo; evitar PAN completo/CVV; conservar baseline |
| **P2 — MONEDAS / PRO-123** | Moneda de emisión y cambio | PYG, USD y BRL con tipo de cambio manual, valores/totales en moneda original y equivalente PYG, cotización congelada por documento; precio de lista en moneda ajena NO convertirse sin regla explícita; atender riesgos P-02/P-12 sin alterar IVA FAT-E1 por intuición |
| **P3 — CUOTAS / PRO-121** | Retomar cuotas más adelante | Correcciones AUD-MFE-B1-R01: replay de D0 en D1 no puede bloquearse por vencimiento nuevo; verificar exactitud de Number en dMonCuota y no cambiar valores; comprobación de descripciones E642/E654. Solo al pedirlo expresamente |
| Posterior | PRO-124/125/126 | Descuentos, complementos opcionales, anticipos y modalidades especiales bajo autorizaciones específicas |

### Criterios dirigidos

- **CORE-01:** agregar producto sin unidad SIFEN, clasificación IVA o precio; marcar exactamente lo pendiente; completar en la misma línea (permisos vigentes), previa válida solo al completar; servidor 422 antes de la secuencia si falta un obligatorio.
- **CORE-02:** guardar solo en documento no cambia Productos; guardar IVA exige confirmación/permisos y bitácora única; no editar unidad de stock ni lista de precio por detrás; replay no revierte modificaciones de terceros.
- **CORE-03:** Crédito Plazo 30/60/90 días, entrega 0 o menor que total, forma Efectivo de entrega si aplica; cambiar a Contado limpia datos de crédito; payload idempotente.
- **CORE-04:** Cuotas no visibles ni aceptadas para nuevas emisiones por POST directo, respuesta dirigida antes de NEX-048, sin romper consulta de documentos históricos.
- **PAGO-01:** medio único Efectivo idéntico al baseline; transferencia, cheque, tarjeta y combinaciones con datos exigidos por modalidad SIFEN; suma sin residuos y sin reservar número en error.
- **PAGO-02:** Crédito Plazo con varios medios de entrega: la suma es el anticipo de pago inicial, no el saldo financiado.
- **MON-01:** PYG no exige cambio; USD/BRL requieren cambio >0 y snapshot de tasa/fecha; total en Gs y moneda original concilian con precisión decimal.
- **MON-02:** cambiar tasa comercial después de emitir no altera la tasa ni los importes del documento previo; garantizar idempotencia y multiempresa.

**Proceso:** ChatGPT especifica y audita. Claude implementa primero solo P0, test básicos de la funcionalidad y sus invariantes; commit/push y parar. P1/P2 no están simultáneamente autorizadas. No suites completas, build general, CI manual/monitorización, VM/PG operativo ni envíos reales por IA. Fuente funcional sigue Manual SIFEN con paridad nombres/tipos JSON confirmada. NEX-056 sigue sin comprobación de instalación en VM.

## 1. Fuentes, precedencia y límites verificables

- **MT:** [Manual Técnico DNIT SIFEN v150 oficial](https://www.dnit.gov.py/documents/20123/420592/Manual%2BT%C3%A9cnico%2BVersi%C3%B3n%2B150.pdf/e706f7c7-6d93-21d4-b45b-5d22d07b2d22?t=1687351495907), especialmente D1 D011–D019 (tipo, moneda), D3 D200–224 (receptor), E7 E600–659 (pago/crédito), E8 E700–899 (ítems), EA002–009 (descuentos/anticipos), F001–037 (totales) y reglas de validación asociadas. **NT**: [portal de documentación técnica e-Kuatia](https://ekuatia.set.gov.py/en/web/e-kuatia/documentacion-tecnica), [XSD oficiales](https://ekuatia.set.gov.py/sifen/xsd/). NT 023 afecta precisión de E711; NT 026 cambia obligatoriedad DNCP B2G; comprobar vigencia actual en cada entrega. **NT 021 falta en el ZIP original**: no declararla examinada.
- **Contrato proveedor (confirmación del responsable):** nombres y tipos de campos JSON se corresponden con el Manual SIFEN; el JSON aportado representa un caso concreto, no una lista de todas las modalidades. Su inventario de **117 claves** y las **36 AUSENTE** son evidencia **de ese ejemplo y del código de ese momento**, no razón para declarar que el gateway desconoce los demás grupos. Esta matriz confronta documentación y builder sin relectura byte a byte del JSON original. Mantener diferenciados el **objeto JSON de envío**, el **XML que produce el gateway** y la respuesta SIFEN: paridad de campos no equivale a homologación de valores XML.
- **Código UI/servidor:** `app/(private)/facturas/nueva/{page.tsx,ajuste-fiscal-item.tsx}`, `app/api/facturas/*`, `lib/facturacion/{payload-fe,emision,calculo,ajuste-item,ajuste-fiscal,envio,gateway,estados}.ts`. **DDL:** NEX-047…056 versionadas; FE reserva con NEX-048 y gateway SIFEN externo; timbrado del emisor gestionado por gateway, **no por formulario NEXIT**.
- **Evidencias comerciales:** 13 XMLs de FE sanitizados agregadamente en `EVIDENCIAS-FISCAIS-FE-13-XML-2026-10-14.md`: 2 facturas a crédito; 27/47 ítems del conjunto B con descuento; **no prueban entrada JSON, uso USD/BRL, gravado parcial ni aceptación gateway de esta implementación**.
- **Decisión previa:** `homologacao-visual/DECISAO-LISTAS-PRECIO-CAMBIO-MANUAL-2026-10-12.md` aprueba `Fecha, Moneda, Cambio` manual expresado en **PYG por 1 moneda extranjera**. No crear compra/venta, proveedor automático ni conversiones arbitrarias.
- **Diagnóstico antecedente:** `AUD-FE-CAMPOS-TELA-JSON-BANCO-MT150-2026-10-15.md`, `MATRIZ-FISCAL-FE-E1-2026-10-14.md`, auditoría `AUD-PRO93-FA-R02` (aceptó exclusivamente 2 correcciones de la Fase A).
- **Estado real humano conocido:** banco operativo tenía 55 migrations hasta NEX-055; NEX-056 existe y pasa pruebas en PG16 descartable de CI, **no probada instalada en la VM**. Toda futura DDL debe ser **NEX-057 o superior**, sin editar migrations ya aplicadas.

## 2. Principios de UX, motor fiscal y almacenamiento (obligatorios)

1. **No rediseñar el layout aceptado:** tarjetas `Operación`, `Cliente`, `Detalle`, `Información adicional` y resumen lateral; compactación/responsividad y revisión `Grabar/Previa → Confirmar/Enviar`. Expandir con campos y subpaneles **condicionales**, no crear encabezado único gigante ni repetir en cada ítem campos que pueden derivarse. Mostrar validaciones por campo y pendientes en resumen.
2. **No todos los 117 campos se editan.** Roles: `UI` = operador; `CLI` cliente/ficha; `PROD` maestro o corrección por factura; `SUC/PUN` configuración fiscal; `MON` catálogo de cotización y snapshot; `CALC` motor decimal; `SQL` reserva/ID/huella; `GW` integrador; `FISCAL/ESPECIAL/B2G` solo con condición verdadera. La UI puede mostrar lectura/revisión de datos automáticos, pero no editarlos indebidamente.
3. **Niveles de obligación:** `O` siempre obligatorio para caso aplicable; `C` obligatorio **si se activa el grupo/condición**, `V` opcional validado si se informa; `X` no aplica en ese tipo, **no enviar** conforme MT/XSD (gateway puede necesitar regla propia distinta). La palabra `GERADO` en inventario solo significa que la clave existe, **no** que el valor/tipo/fórmula sean correctos.
4. **Persistencia fiscal:** snapshot de entrada con valores aceptados + JSON enviado e identificadores/huellas; datos comerciales modificables en Productos solo por opción explícita, permisos y bitácora. Preferir extender tablas específicas de condiciones/pagos/cuotas/tasas con `empresa_id` y FKs por tenant en **migrations nuevas** si consulta/índices/historia lo justifican; un JSONB inmutable de emisión no sustituye por sí solo modelos de cobranza o movimientos contables. **No crear obligación financiera/cuentas a cobrar automáticamente**: falta diseño comercial y autorización.
5. **Validación doble:** UI para ergonomía + servidor **autoridad**; decimal exacto, moneda/IVA/tasas, vigencia de impuestos/unidades, sucursal/alcance, permiso y consistencia referencial. Al aceptar no alterar retroactivamente precios, stock, IVA de otro documento o clave idempotente; NEX-048 reserva una vez y FAT-E2 no equipara `ENVIADO` con `APROBADO`.
6. **Paridad JSON/MT confirmada:** los campos ausentes del ejemplo se implementan con **los mismos nombres, tipos y reglas condicionales del MT SIFEN**, sin exigir nuevos JSON de muestra para cada forma de pago, crédito, moneda o descuento. Validar forma del JSON, grupos repetibles, obligatoriedad y respuestas mediante pruebas dirigidas. **No bloquear Enviar por ausencia de campo en el ejemplo.** Bloquear solo por un fallo/condición real y específico (código faltante, campos requeridos, cálculo, autorización, serialización comprobada o P-02/P-11/P-12), documentándolo. Esto no autoriza una transmisión real por IA.
7. **Incompatibilidades conocidas sin cambio automático:** P-01 omisión vs null, **P-02 `dTotalGs`**, **P-11 IVA parcial/residuos**, **P-12 `dLiqTotIVA5/10`**. No redondear, truncar, fijar 0 ni reformular NT13 por intuición; conservar baseline y documentar cuándo se bloquea.
8. **Política de pruebas:** por defecto **solo tests básicos/direccionados de funcionalidad y sus invariantes cercanas**. Suite integral, build general, lint/tsc global, CI manual **solo a pedido expreso** del responsable. Push puede disparar CI automático: no deshabilitar workflows, tampoco hacer polling esperando.

## 3. Matriz de interfaz + reglas condicionales (requisito de comportamiento; idioma UI español PY)

| ID | Sección y campos de UI | Campos normativos / JSON esperado | Cuándo se muestra y obligación | Origen, persistencia, API | Validación y criterio de aceptación | Entrega |
|---|---|---|---|---|---|---|
| MF-001 | Sucursal, establecimiento (lectura) | `dEst` / C y D | Sucursal elegida O; establecimiento asignado automáticamente | `sucursales`, alcance usuario; NEX-048 | Solo autorizada, activa, código válido; no otro tenant ni número arbitrario | 0 |
| MF-002 | Punto expedición, próximo N° (referencial) | `dPunExp`, `dNumDoc`, `dSerieNum` | Punto activo O; número visible NO editable | `fe_puntos_expedicion`, NEX-048 | Sin punto: bloquear con motivo; no crear ni reiniciar contador; número real es el reservado | A/0 |
| MF-003 | Fecha/hora emisión vs `Competencia` | `dFeEmiDE` y campo de período **solo si hay norma/negocio** | Emisión automática según servidor; competencia no decidida | Fecha NEX-048 `now()`; campo competencia requeriría diseño propio | No permitir retrofechar emisión ni usar mes comercial como sustituto de fecha fiscal; pendiente aclaración | P |
| MF-004 | Tipo de transacción | `iTipTra` D011 | O en FE; 1–4 hoy; 5–13 por caso | Formulario/catálogo + snapshot | Tipo compatible con ítems, afectación/receptor, no habilitar compra/autofactura como simple venta | E |
| MF-005 | Tipo impuesto / presencia | `iTImp` D013; `iIndPres` E011 | IVA=1 hoy; presencia O; Otro=9 requiere texto | Fiscal y formulario | No exponer opción cuyo grupo condicional aún no se construye | 0/E |
| MF-006 | Condición operación | `iCondOpe` E601 | O: `Contado=1` / `Crédito=2` | API acepta explicitamente condición; nunca hardcodear 1 tras B1 | Cambio condición limpia campos inapplicables, prevía recalcula y envía grupo correcto | B1 |
| MF-007 | Crédito: Plazo / Cuotas | `iCondCred` E641, `dPlazoCre` E643, `dCuotas` E644 | C cuando Crédito; Plazo necesita texto `30 días` 2–15; Cuotas necesita entero 1–3 dígitos | Modelo de condiciones y snapshot | No informar E640/E641 en Contado; no informar plazo si es Cuota y viceversa | B1 |
| MF-008 | Cuotas: valor, moneda, fecha vencimiento | Grupo E650: `dMonCuota` E651, `dVencCuo` E652, `cMoneCuo` E653 y descripción E654 | C con Crédito+Cuotas; fecha E652 opcional en MT, **requerida por UX comercial** si se decide cronograma | Tabla de cuotas de factura o snapshot estructurado, no cuentas por cobrar automáticas | Cantidad de filas coincide con E644; sumas exactas del crédito neto de entrega inicial cuando corresponda; no fechas inválidas | B1 |
| MF-009 | Entrega inicial y sus medios | `dMonEnt` E645, E605 E606–E611 | C si Crédito+entrega; 0/ausente sin E605 crédito | Pago inicial como grupo separado de cuotas | E645 y pagos iniciales concilian sin duplicar monto; nombres/tipos SIFEN en JSON confirmados por responsable | B1/B2 |
| MF-010 | Medios de pago (lista repetible) | `FormaPago[]` ↔ `gPaConEIni`, `iTiPago` E606, `dMonTiPag` E608 | O en Contado, C en entrega inicial Crédito; catálogo 1–21/99 | UI lista + backend sumas Decimal + snapshot | No limitar a 1; montos no negativos, suma exacta; no enviar pago contado como cuota a crédito | B2 |
| MF-011 | Datos cheque | `gPagCheq` E630, `dNumCheq` E631, `dBcoEmi` E632 | C **solo** `iTiPago=2` | Subformulario cheque; detalles en snapshot fiscal (no imprimir a otros usuarios innecesariamente) | N° cheque 8 caracteres con 0 a izquierda; banco 4–20; no grupo para otro medio | B2 |
| MF-012 | Datos tarjeta | `gPagTarCD` E620, `iDenTarj` E621, `iForProPa` E626 y condicionados E622–629 | C para códigos 3/4; otros medios sin este grupo | Marca/procesadora/POS/autorización; solo últimos 4 dígitos si se informa | No solicitar PAN completo ni CVV; verificar RUC/DV procesadora cuando se informa | B2 |
| MF-013 | Otros pagos y pago bancario | E606 códigos 5–21/99; descripción E607, campos H según condición | Solo opciones con reglas realmente implementadas; `iTiPago=16` exige presencia bancaria E011=5 en FE | Catálogo/versionado SIFEN, control UI | Cada código habilitado tiene validación específica de tipos y obligatorios; no habilitar 99 sin descripción | B2/E |
| MF-014 | Moneda de factura | `cMoneOpe` D015 (PYG/USD/BRL), `dCondTiCam` D017 | O; campo cambio C si ≠ PYG | Monedas activas y tabla Tipos de cambio manual | Cambio de moneda invalida precios calculados y revisión; no convertir de forma implícita | C |
| MF-015 | Tipo de cambio, total equivalente Gs | `dTiCam` D018 / `dTiCamIt` E725 / F023 `dTotalGs` | Si moneda extranjera; primera ampliación **global D017=1**, no por ítem hasta soporte | Selección cotización Fecha+Moneda+Cambio, posible edición manual permissionada, snapshot por documento | Cambio PYG/1 moneda >0 y precisión MT; impuesto/totales recalculados con Decimal; F023 P-02 verificada con GW | C |
| MF-016 | Moneda por forma de pago / cuota | E609–611 y E653–654 | C cuando moneda pago/cuota no PYG; restricción de moneda compartida en el documento según MT | Snapshot tasa de pago y/o de cuota; sin conversiones ocultas | No generar E611 para PYG; aplicar reglas oficiales de moneda/cambio y probar cálculo. Bloquear solo discrepancia real | C |
| MF-017 | Cliente y ficha fiscal | D201–D224: naturaleza, tipo operación, país, documento, RUC/DV, nombre, dirección/contactos | Cliente O; ficha editable solo desde Productos/Clientes o flujo permiso definido | `clientes`, direcciones, catálogo; snapshot receptor | B2B/B2C/B2G/B2F/Innominado por norma y NT; sin valores falsos; errores descriptivos | 0 |
| MF-018 | Buscar/seleccionar producto; descripción; código/GTIN | E701, E706, E708, E709 | ≥1 línea; datos del maestro con ajuste fiscal de Fase A | Productos/precios/unidades/impuestos; snapshots | Permisos `AJUSTE_FISCAL`, `PRECIO`; `Sin GTIN` explícito; sin cambio de maestro salvo confirmación IVA | A |
| MF-019 | Cantidad, precio, IVA, afectación, proporción | E711, E721, E731, E733, E734 | Cada línea O, parcial si aplica | Recalcular servidor; IVA incluido; Decimal | Unidad 77 sin fracción; tasa/afectación coherentes; P-11 parcial con residuo sigue bloqueado | 0/A |
| MF-020 | Descuento individual / global | `dDescItem` EA002, `dPorcDesIt` EA003, `dDescGloItem` EA004 | V cuando hay descuento; campos por línea, global visible en sección totales | UI + motor decimal, total y bases IVA actualizados, snapshot original y descuento | El descuento particular es por unidad, y el global se aplica en cada ítem conforme manual; concilia cantidad, neto, IVA, F009/F010 | D1 |
| MF-021 | Anticipos y FE vinculada | `iCondAnt`, `dCDCAnticipo`, EA006–007 y F011–012/F034 | C cuando hay anticipo real | Selector DE original autorizado, CDC válido, valor restante y snapshot | No permitir anticipo que excede importe/referencial, ni usar CDC extranjero; verificar gateway | D2 |
| MF-022 | Datos opcionales por ítem (colapsable) | E702–703, E707, E712–714, lotes/serie/vencimiento, pedido/seguimiento | V solo si mercadería/sector aplica | Datos producto, lote/serie inventario o captura fiscal autorizada, snapshot | Distinguir `dInfItem` E714 de `dGtin` E706, longitud/fecha/catálogo; no hacer reserva de stock | D2 |
| MF-023 | Sectorial/vehículo/importación/B2G | `gVehNuevo`, `gCompPub`, `dDncp*`, `dNomImp` etc | C exclusivamente por operación, norma y nota técnica | Solo abrir subgrupo especializado autorizado | Evitar exigir DNCP de manera genérica; revisar NT026, XSD y JSON proveedor | E |
| MF-024 | Información adicional cabecera | `dInfAdic` G002 | V, vacío ⇒ null/omit según contrato | UI + snapshot | Hasta 5000 y saneamiento seguro | 0 |
| MF-025 | Resumen, IVA, subtotales, moneda | E/F, `Subtotales[]`, F023 | Siempre lectura previa y recap en modal | `calculo.ts`, `payload-fe.ts`; compare snapshot | Σ líneas = total, Σ pago=total contado o entrega inicial, bases/IVA sin flotantes; P-02/P-11/P-12 no inventar solución | 0/B/C/D |
| MF-026 | Guardar/previsualizar/Enviar/Consultar | `recepcion_de` y `consulta_de`, snapshots | Previa sin reservar, Enviar solo tras consentimiento | NEX-047…056 + FAT-E2; gateway token protegido | Idempotencia documento **y** master producto, estados separados; ningún éxito HTTP implica APROBADO | 0 |
| MF-027 | Fecha/período de competencia | Sin clave JSON confirmada | **BLOQUEADO POR DEFINICIÓN**: término puede ser mes de prestación o fecha de emisión | No añadir columna/field antes de confirmar; se puede trabajar en otras fases | Preguntar al responsable una sola vez y documentar decisión | P |

**Fuera del objetivo de esta matriz FE ordinaria:** crear AFE, NCE/NDE/NR a partir del formulario FE; módulos de inventario/contabilidad automática; exportación, contratación pública integral, reservas de stock, homologación SIFEN por mock.

## 4. Mapa de obligatoriedad por operación (MT v150 vs regla comercial)

| Contexto real | Obligatorio MT/XSD | Regla NEXIT propuesta | Prohibido / alerta |
|---|---|---|---|
| FE normal Contado PYG Efectivo | `iCondOpe=1`, un `gPaConEIni` con tipo/monto/moneda y receptor/ítems válidos | Conservar exactamente el baseline PYG/Efectivo hasta nuevo módulo auditado | No emitir `gPagCred` ni tasa de cambio PYG |
| FE Contado con 2+ medios | Múltiples `gPaConEIni` (0–999), cada uno E606/E608/E609; E611 condicional | Suma de montos exactamente total | Construir `FormaPago[]` con campos/tipos SIFEN correctos; sin exigir un ejemplo extra para esta modalidad |
| FE Crédito a Plazo | `gPagCred`, `iCondCred=1`, `dPlazoCre` | Capturar cantidad/unidad de plazo, mostrar vencimiento estimado si se define; derivar texto fiscal de 2–15 | No mandar `dCuotas` ni `Cuotas[]` si es Plazo |
| FE Crédito por Cuotas | `gPagCred`, `iCondCred=2`, `dCuotas`, grupo `gCuotas` E650 | Número de cuotas corresponde a filas, monto por cuota y vencimiento; política producto exigir fecha aun siendo opcional MT | No mandar `dPlazoCre`; no generar cuantías que excedan total |
| FE Crédito con entrega inicial | `dMonEnt` si hay entrega, `gPaConEIni` si E645 existe | Importe inicial + saldo financiado = total (en misma moneda y política de redondeo) | No informar pago total de Contado si solo hubo anticipo |
| FE pago Cheque | `gPagCheq` E630–E632 solo si E606=2 | Campos número/banco visibles y obligatorios | Nunca mandar `gPagCheq` para Efectivo |
| FE pago tarjeta crédito/débito | `gPagTarCD` con E621/E626 y condiciones de procesadora | Datos de marca/POS, opcionales pertinentes, últimos cuatro dígitos | No solicitar tarjeta completa/CVV |
| FE moneda extranjera | D017 obligatorio, D018 global si D017=1; F023 conforme MT si ≠PYG | PYG, USD, BRL; tipo de cambio manual snapshot, contravalor Gs | No mandar D017/D018/F023 en XML para PYG; **JSON gateway distinto P-02** |
| FE con descuentos | EA002/EA003 por ítem, EA004 global cuando aplica, subtotales correspondientes | Registrar precio original y descuentos, bases/IVA recalculados | No reducir IVA sin reducir líquido fiscal; no asumir prorrateo global |
| FE mercancía con GTIN | E706 si tiene GTIN; E707 si paquete lo tiene | GTIN de Fase A con alternativa `Sin GTIN` solo para DE | No confundir código E714 (información por ítem) |
| FE B2G | Campos propios, NT026 actualiza obligatoriedad DNCP | Grupo específico tras validación | No exigir antiguo E704/E705 a toda factura ni asumir exclusión sin revisar vigencia |
| FE con IVA parcial | E731/733/734, fórmula NT13 | Mantener política de bloqueo documentada P-11 cuando no concilia | Sin redondeos correctivos arbitrarios |

## 5. Inventario exhaustivo de las 117 claves del JSON recibido (base documental)

- **Se mantuvo el orden, nombre, grupo y estado original** de `AUD-FE-100`. El estado `GERADO`/`AUSENTE` es **el diagnóstico de esa auditoría base**, no una verificación de frescura después de cada nuevo commit ni señal de incompatibilidad del gateway. El ejemplo NO contenía los campos de operaciones que no se usaron. El implementador debe comparar las claves pertinentes con el builder actual. `RETORNO GATEWAY` y `NEX-048` pertenecen a otras capas.
- Las 36 `AUSENTE` no son 36 campos obligatorios para una FE de mercancía estándar: varios son opcionales o exclusivos de otras operaciones. **Esos nombres/tipos del MT se deben utilizar cuando apliquen; su ausencia en el ejemplo no representa un bloqueo contractual.** No generar claves `null` solo para hacer coincidir el inventario.
- **Entrega:** `0` línea base que se preserva; `A` Fase A versionada; `B1` crédito; `B2` pagos; `C` monedas; `D1` descuento; `D2` opcionales/anticipos; `E` casos especiales; `P` bloquear cambio hasta evidencia. Metadatos de origen/entrega/regla son análisis de especificación basado en contratos citados; el hecho de que aparezca `GERADO` no homologa valores.

| Nº | Bloque | Clave JSON ejemplo | Estado AUD-FE-100 | Origen responsable | Entrega | Regla funcional / fiscal y verificación |
|---:|---|---|---|---|---|---|
| 001 | Cabecera | `cdc` | RETORNO GATEWAY | GW/AUTO | 0 | CDC proveniente de respuesta fiable y vinculada al documento; nunca inventarlo en el formulario. |
| 002 | Cabecera | `dInfoEmi` | GERADO | GW/AUTO | P | Texto fiscal del emisor; hoy null; confirmar propietario, no copiar textos de ejemplos. |
| 003 | Cabecera | `dInfoFisc` | GERADO | GW/AUTO | P | Texto fiscal del emisor; hoy null; confirmar propietario. |
| 004 | Cabecera | `dInfAdic` | GERADO | UI | 0 | Observaciones comerciales editables; máximo 5000 caracteres; se guarda en snapshot. |
| 005 | Cabecera | `dEst` | NEX-048 | SUC/SQL | 0 | Establecimiento SIFEN de sucursal autorizada; inmutable en DE. |
| 006 | Cabecera | `dPunExp` | NEX-048 | PUN/SQL | 0 | Punto de expedición activo de la sucursal; jamás crear o poner 001 arbitrario. |
| 007 | Cabecera | `dNumDoc` | NEX-048 | SQL | 0 | Número secuencial reservado exactamente una vez; sin edición libre. |
| 008 | Cabecera | `dSerieNum` | NEX-048 | SQL/GW | P | Serie nula hoy; decidir solamente con identidad/contrato real, sin copiar referencia. |
| 009 | Cabecera | `dFeEmiDE` | NEX-048 | SQL | P | Fecha/hora de emisión se fija al reservar; editarla exige decisión fiscal explícita distinta de competencia. |
| 010 | Cabecera | `iTipTra` | GERADO | UI | E | Catálogo 1–13; habilitados 1–4; 5–13 requieren reglas fiscales particulares, sin activación masiva. |
| 011 | Cabecera | `iTImp` | GERADO | FISCAL | E | Tipo de impuesto hoy IVA=1; activar otras alternativas solo si se desarrolla flujo y validación propia. |
| 012 | Cabecera | `cMoneOpe` | GERADO | UI/MON | C | Elegir PYG/USD/BRL habilitadas; una sola moneda de operación en todo el DE. |
| 013 | Cabecera | `dCondTiCam` | GERADO | UI/MON | C | Condición del cambio 1 global o 2 por ítem; para PYG no informar; V1 ampliada propone global primero. |
| 014 | Cabecera | `dTiCam` | GERADO | MON | C | Tasa global positiva PYG por unidad de moneda extranjera; obligatoria si D017=1. |
| 015 | Cabecera | `iCondAnt` | AUSENTE | UI/FISCAL | D2 | Anticipo global o por ítem solo si flujo vinculado a FE de anticipo válida; sin supuestos. |
| 016 | Cabecera | `iTipCont` | AUSENTE | EMISOR/GW | P | Dato del emisor según Manual, no copiar atributo del receptor ni poner a mano en la factura. |
| 017 | Cabecera | `gRespDE` | AUSENTE | EMISOR/GW | P | Grupo de responsable de generación, si aplica al contrato; no crear valores ficticios. |
| 018 | Cabecera | `iNatRec` | GERADO | CLI | 0 | Naturaleza contribuyente/no contribuyente desde cliente; validar D201. |
| 019 | Cabecera | `iTiOpe` | GERADO | CLI | 0 | B2B/B2C/B2G/B2F; ajustar campos condicionales por naturaleza y operación. |
| 020 | Cabecera | `cPaisRec` | GERADO | CLI | 0 | País de residencia desde ficha fiscal; catálogo oficial. |
| 021 | Cabecera | `iTiContRec` | GERADO | CLI | 0 | Tipo de contribuyente PF/PJ si corresponde; no exigir en no contribuyente. |
| 022 | Cabecera | `dRucRec` | GERADO | CLI | 0 | RUC sin DV, únicamente para receptor contribuyente y condición aplicable. |
| 023 | Cabecera | `dDVRec` | GERADO | CLI | 0 | DV separado validado; JSON del gateway usa número; preservar tipo del contrato. |
| 024 | Cabecera | `iTipIDRec` | GERADO | CLI | 0 | Tipo de documento de receptor no contribuyente si corresponde; no ofrecer en B2F salvo norma. |
| 025 | Cabecera | `dDTipIDRec` | GERADO | CLI | 0 | Descripción catálogo según D209; si Otro respetar longitud. |
| 026 | Cabecera | `dNumIDRec` | GERADO | CLI | 0 | Número de identificación condicional; no generar número ficticio. |
| 027 | Cabecera | `dNomRec` | GERADO | CLI | 0 | Razón social/nombre validado; Innominado solo en supuestos admitidos. |
| 028 | Cabecera | `dNomFanRec` | GERADO | CLI | 0 | Nombre de fantasía opcional si existe; no inventar. |
| 029 | Cabecera | `dDirRec` | GERADO | CLI | 0 | Dirección fiscal desde direcciones_cliente; obligatoria en escenarios específicos, no ocultar pendientes. |
| 030 | Cabecera | `dNumCasRec` | GERADO | CLI | 0 | Número de casa numérico del JSON o 0 según decisión de prueba; no sobrescribir ficha. |
| 031 | Cabecera | `dTelRec` | GERADO | CLI | 0 | Teléfono con formato/longitud fiscal; opcional por MT. |
| 032 | Cabecera | `dCelRec` | GERADO | CLI | 0 | Celular validado; opcional. |
| 033 | Cabecera | `dEmailRec` | GERADO | CLI | 0 | Correo principal del receptor; opcional fiscal. |
| 034 | Cabecera | `dEmailAdic` | GERADO | CLI | 0 | Correo adicional desde ficha; no autogenerar. |
| 035 | Cabecera | `dEmailAdmin` | GERADO | CLI | 0 | Correo administrativo desde ficha; no autogenerar. |
| 036 | Cabecera | `dCodCliente` | GERADO | CLI | 0 | Código interno solo cuando cumple longitud 3–15. |
| 037 | Cabecera | `iIndPres` | GERADO | UI | E | Indicadores 1–6 activos; 9 Otro solo con texto adicional normativo. |
| 038 | Cabecera | `dFecEmNR` | GERADO | FISCAL | E | Fecha ligada a remisión u otra condición; no habilitar sin uso y contrato. |
| 039 | Cabecera | `gCompPub` | AUSENTE | B2G | E | Grupo contrataciones públicas cuando aplica; revisar NT026 y normativa vigente, no exigencia general. |
| 040 | Cabecera | `iCondOpe` | GERADO | UI | B1 | 1 Contado / 2 Crédito, control editable con validación de modalidad. |
| 041 | Cabecera | `iCondCred` | GERADO | UI | B1 | Solo Crédito: 1 Plazo / 2 Cuota; jamás informar en Contado. |
| 042 | Cabecera | `dPlazoCre` | GERADO | UI | B1 | Solo Crédito+Plazo; texto fiscal de 2–15, por ejemplo 30 días, no solo número sin unidad. |
| 043 | Cabecera | `dCuotas` | GERADO | UI | B1 | Solo Crédito+Cuotas; número 1–3 dígitos; debe coincidir con filas Cuotas reales. |
| 044 | Cabecera | `dModCont` | AUSENTE | B2G | E | Modalidad de contratación pública específica; pendiente soporte legal/contrato. |
| 045 | Cabecera | `dEntCont` | AUSENTE | B2G | E | Entidad pública contratante específica; pendiente soporte legal/contrato. |
| 046 | Cabecera | `dAnoCont` | AUSENTE | B2G | E | Año de contrato público específico; pendiente soporte legal/contrato. |
| 047 | Cabecera | `dSecCont` | AUSENTE | B2G | E | Secuencia de contrato público específica; pendiente soporte legal/contrato. |
| 048 | Cabecera | `dFeCodCont` | AUSENTE | B2G | E | Fecha de codificación de contrato público si aplica; validar con NT actual. |
| 049 | Cabecera | `iTiDE` | GERADO | SQL/CONST | 0 | Factura electrónica = 1; no reutilizar este formulario para NCE/AFE. |
| 050 | FormaPago | `iTiPago` | GERADO | UI | B2 | Tipo pago catálogo 1–21/99; habilitar por tratamiento probado, no todo automáticamente. |
| 051 | FormaPago | `dMonTiPag` | GERADO | SERV | B2 | Importe por medio: conciliación estricta de suma en Contado o entrega inicial de Crédito; Decimal. |
| 052 | FormaPago | `cMoneTiPag` | GERADO | MON/SERV | C | Moneda del pago según contrato; cambiar moneda requiere tasa de pago y reglas fiscales. |
| 053 | FormaPago | `dTiCamTiPag` | GERADO | MON/SERV | C | Tipo de cambio del pago solo cuando moneda pago distinta de PYG; prohibido informar para PYG. |
| 054 | Detalles | `dCodInt` | GERADO | PROD | 0 | Código interno de producto 1–20; inmutable en snapshot y consistente con ficha. |
| 055 | Detalles | `dParAranc` | AUSENTE | PROD/FISCAL | D2 | Partida arancelaria opcional cuando aplica; validar catálogo/formato antes de habilitar. |
| 056 | Detalles | `dNCM` | AUSENTE | PROD/FISCAL | D2 | NCM cuando aplica a mercaderías; opcional en FE ordinaria. |
| 057 | Detalles | `dGtin` | GERADO | PROD/UI | A | GTIN producto opcional, 3 modos: del cadastro / otro / sin GTIN; E706, NO E714. |
| 058 | Detalles | `dGtinPq` | AUSENTE | PROD/UI | D2 | GTIN del paquete E707 opcional, no confundir con GTIN producto ni unidad. |
| 059 | Detalles | `dDesProSer` | GERADO | PROD/UI | A | Descripción fiscal por ítem 1–120, permite ajuste solo documento. |
| 060 | Detalles | `cUniMed` | GERADO | PROD/UI | A | Código oficial vigente de unidad SIFEN E709; no modificar unidad base/stock con ajuste. |
| 061 | Detalles | `dCantProSer` | GERADO | UI | 0 | Cantidad >0; NEXIT actual 4 decimales, NT023 hasta 8; autorización separada para ampliar. |
| 062 | Detalles | `cPaisOrig` | AUSENTE | PROD/UI | D2 | País de origen si se informa y se valida catálogo; descr. asociada según norma. |
| 063 | Detalles | `dInfItem` | AUSENTE | UI | D2 | Información adicional por ítem E714, 1–500 caracteres; opcional y colapsable. |
| 064 | Detalles | `cRelMerc` | AUSENTE | FISCAL | E | Quiebra/merma C002 específico, no agregar a FE corriente sin tipo que aplique. |
| 065 | Detalles | `dCanQuiMer` | AUSENTE | FISCAL | E | Cantidad de quiebra/merma, solo si evento/DE correspondiente. |
| 066 | Detalles | `dPorQuiMer` | AUSENTE | FISCAL | E | Porcentaje quiebra/merma, solo si corresponde. |
| 067 | Detalles | `dCDCAnticipo` | AUSENTE | FISCAL | D2 | CDC antecedente de FE de anticipo verificable; solo si modalidad aplicable. |
| 068 | Detalles | `dPUniProSer` | GERADO | PROD/UI | 0 | Precio unitario con IVA en moneda elegida; permiso PRECIO, decimales exactos. |
| 069 | Detalles | `dTotBruOpeItem` | GERADO | CALC | 0 | Cantidad por precio con precisión decimal y consistencia matemática. |
| 070 | Detalles | `dDescItem` | AUSENTE | UI/CALC | D1 | Descuento particular por unidad de ítem; no aplicar sobre total arbitrariamente. |
| 071 | Detalles | `dPorcDesIt` | AUSENTE | UI/CALC | D1 | Porcentaje relacionado a dDescItem; coherencia con precio unitario. |
| 072 | Detalles | `dDescGloItem` | AUSENTE | UI/CALC | D1 | Descuento global aplicado a cada ítem según MT, NO prorrateo global asumido. |
| 073 | Detalles | `dAntPreUniIt` | AUSENTE | FISCAL | D2 | Anticipo específico por unidad con referencia y moneda correctas. |
| 074 | Detalles | `dAntGloPreUniIt` | AUSENTE | FISCAL | D2 | Anticipo global por unidad coherente con antecedente y distribución. |
| 075 | Detalles | `dTotOpeItem` | GERADO | CALC | D1 | Líquido después de descuentos/anticipos aplicables, base de IVA. |
| 076 | Detalles | `iAfecIVA` | GERADO | PROD/UI | A | Afectación IVA por ítem (gravado/exonerado/exento/parcial) bajo permiso específico. |
| 077 | Detalles | `dPropIVA` | GERADO | PROD/UI | A | Proporción gravada; válida/obligatoria condicional en IVA parcial. |
| 078 | Detalles | `dTasaIVA` | GERADO | PROD/UI | A | Tasa 0/5/10 coherente con afectación; valida el servidor. |
| 079 | Detalles | `dBasGravIVA` | GERADO | CALC | 0 | Base gravada calculada según MT+NT13; P-11 bloquea residuos no conciliables. |
| 080 | Detalles | `dLiqIVAItem` | GERADO | CALC | 0 | IVA por ítem 8 decimales, no float ni truncamiento indiscriminado. |
| 081 | Detalles | `gVehNuevo` | AUSENTE | ESPECIAL | E | Grupo vehículo nuevo: solo casos especiales, no en FE ordinaria. |
| 082 | Detalles | `dBasExe` | GERADO | CALC | 0 | Base exenta por ítem, derivada, no editable. |
| 083 | Detalles | `dNumLote` | AUSENTE | PROD/UI | D2 | Lote comercial/fiscal si corresponde, desde inventario o ajuste de factura sin inventar trazabilidad. |
| 084 | Detalles | `dVencMerc` | AUSENTE | PROD/UI | D2 | Vencimiento mercancía, si existe y aplica; validar fecha coherente. |
| 085 | Detalles | `dNSerie` | AUSENTE | PROD/UI | D2 | Número de serie cuando aplica; distinguir serie fiscal de serie de producto. |
| 086 | Detalles | `dNumPedi` | AUSENTE | OPERACION | D2 | Pedido de origen si existe; no exigir para FE manual sin pedido. |
| 087 | Detalles | `dNumSegui` | AUSENTE | OPERACION | D2 | Número de seguimiento si aplica, no inventar. |
| 088 | Detalles | `dNomImp` | AUSENTE | ESPECIAL | E | Nombre importador cuando aplica al régimen especial. |
| 089 | Detalles | `dDirImp` | AUSENTE | ESPECIAL | E | Dirección importador cuando aplica. |
| 090 | Detalles | `dNumFir` | AUSENTE | ESPECIAL | E | Número de firma/registro régimen específico cuando aplica. |
| 091 | Detalles | `dNumReg` | AUSENTE | ESPECIAL | E | Registro sectorial específico cuando aplica. |
| 092 | Detalles | `dNumRegEntCom` | AUSENTE | ESPECIAL | E | Registro de entidad comercial cuando aplica. |
| 093 | Subtotales | `dSubExe` | GERADO | CALC | 0 | Subtotal exento; suma de detalles con afectación exenta. |
| 094 | Subtotales | `dSubExo` | GERADO | CALC | 0 | Subtotal exonerado; suma de detalles exonerados. |
| 095 | Subtotales | `dSub5` | GERADO | CALC | 0 | Subtotal gravado al 5%, según base comercial fiscal y descuento. |
| 096 | Subtotales | `dSub10` | GERADO | CALC | 0 | Subtotal gravado al 10%, según base comercial fiscal y descuento. |
| 097 | Subtotales | `dTotOpe` | GERADO | CALC | D1 | Total de operación antes de descuentos/anticipos; controlar conciliación. |
| 098 | Subtotales | `dTotDesc` | GERADO | CALC | D1 | Total descuentos particulares por ítem; 0 si no hay. |
| 099 | Subtotales | `dTotDescGlotem` | GERADO | CALC | D1 | Total descuentos globales ítem; 0 si no hay. |
| 100 | Subtotales | `dTotAntItem` | GERADO | CALC | D2 | Total anticipos específicos ítem; 0 si no hay. |
| 101 | Subtotales | `dTotAnt` | GERADO | CALC | D2 | Total anticipos globales; 0 si no hay. |
| 102 | Subtotales | `dPorcDescTotal` | GERADO | CALC | D1 | Porcentaje de descuentos fiscales, derivado según MT. |
| 103 | Subtotales | `dDescTotal` | GERADO | CALC | D1 | Total descuentos, derivado y coherente. |
| 104 | Subtotales | `dAnticipo` | GERADO | CALC | D2 | Total anticipo, derivado y vinculado a documentos válidos. |
| 105 | Subtotales | `dRedon` | GERADO | CALC | P | Redondeo fiscal SEDECO/F013; P-11 no resuelto, no usar para disimular diferencias. |
| 106 | Subtotales | `dComi` | AUSENTE | ESPECIAL | E | Comisión de modalidad especial; no emitir sin soporte de cálculo y contrato. |
| 107 | Subtotales | `dTotGralOpe` | GERADO | CALC | 0 | Total general F014 = suma precisa de ítems tras descuentos/anticipos; idempotencia. |
| 108 | Subtotales | `dIVA5` | GERADO | CALC | 0 | IVA 5% calculado, NT13 y conciliación de centésimas. |
| 109 | Subtotales | `dIVA10` | GERADO | CALC | 0 | IVA 10% calculado, NT13 y conciliación de centésimas. |
| 110 | Subtotales | `dLiqTotIVA5` | GERADO | CALC/GW | P | P-12: JSON gateway funcional difiere del sentido XML SIFEN F036; NO modificar por intuición. |
| 111 | Subtotales | `dLiqTotIVA10` | GERADO | CALC/GW | P | P-12: JSON gateway funcional difiere del sentido XML SIFEN F037; NO modificar por intuición. |
| 112 | Subtotales | `dIVAComi` | AUSENTE | ESPECIAL | E | IVA sobre comisión, solo si actividad aplica y contrato está validado. |
| 113 | Subtotales | `dTotIVA` | GERADO | CALC | 0 | IVA total, reconciliar bases y componentes según fórmula vigente. |
| 114 | Subtotales | `dBaseGrav5` | GERADO | CALC | 0 | Base gravada 5% por ítem/total. |
| 115 | Subtotales | `dBaseGrav10` | GERADO | CALC | 0 | Base gravada 10% por ítem/total. |
| 116 | Subtotales | `dTBasGraIVA` | GERADO | CALC | 0 | Total bases gravadas 5/10. |
| 117 | Subtotales | `dTotalGs` | GERADO | CALC/GW | P | P-02: XML PYG no incluye F023; JSON del gateway sí lo tiene; verificar semántica por moneda y proveedor. |

## 6. Campos normativos adicionales NO cubiertos por el inventario JSON de 117 claves

**Decisión del responsable MFE-02:** estos campos **no aparecieron en el JSON de ejemplo porque la operación no los requería**. El gateway acepta el **mismo nombre y tipo de campo definidos por el Manual SIFEN**. Claude debe implementar los campos cuando se cumpla su obligatoriedad condicional y preservar los grupos/arrays JSON ya documentados (`Cuotas[]`, `FormaPago[]`, etc.); revisar estructura exacta de cada grupo sin inventar renombres. La falta de ejemplo NO implica incompatibilidad ni bloquea la implementación.

| Referencia MT | Campo/grupo | Estado/condición según MT | Tratamiento de la interfaz / origen | Validación de la implementación |
|---|---|---|---|---|
| E602 | `dDCondOpe` | Descripción según E601 | Derivar del catálogo, NO campo editable | Confirmar si gateway deriva |
| E642 | `dDCondCred` | Descripción Plazo/Cuota | Derivar de E641 | Confirmar mapping JSON |
| E645 | `dMonEnt` | Opcional entrega inicial de Crédito | Editar bajo crédito, autoriza pagos de entrega E605 | Mismo nombre/tipo MT, verificar presencia condicional |
| E650–654 | `gCuotas`, `dMonCuota`, `dVencCuo`, `cMoneCuo`, `dDMoneCuo` | Condición E641=2; vencimiento opcional MT | Grade: número, monto, vencimiento, moneda | Serializar como `Cuotas[]` según patrón existente, claves hijas idénticas a MT y valores tipados |
| E607 | `dDesTiPag` | Descripción del medio E606 | Derivar catálogo para cada medio | Verificar serializador proveedor |
| E610 | `dDMoneTiPag` | Descripción moneda E609 | Derivar catálogo moneda | Verificar |
| E620–629 | Grupo tarjeta + E621/E622/E623/E624/E625/E626/E627/E628/E629 | Solo medio 3/4 | Marca/procesadora/POS, autorización, últimos 4 si aplica | Completar todos los obligatorios condicionales y verificar sus tipos, sin bloqueo por ejemplo ausente |
| E630–632 | `gPagCheq`, `dNumCheq`, `dBcoEmi` | Solo medio 2 | Nº 8 y banco 4–20 | Completar todos los obligatorios condicionales y verificar sus tipos |
| D012/D014/D016 | `dDesTipTra`, `dDesTImp`, `dDesMoneOpe` | Descripciones codeadas | Derivar no dejar edición | Verificar gateway |
| E710/E713 | `dDesUniMed`, `dDesPaisOrig` | Descripciones unidad/país | Catálogos al instante de emisión | Verificar gateway |
| E725 | `dTiCamIt` | Si cambio por ítem D017=2 | **Fuera de primera ampliación C**: global primero | Habilitar después de implementar y probar modo de cambio por ítem |
| E704/E705 | `dDncpG`, `dDncpE` | B2G, sujetas NT026 | Solo caso de contratación pública autorizado | Revisar NT vigente |
| G002 | `dInfAdic` | Texto opcional cabecera | Ya soportado; máximo 5000 | Mantener |
| H012/H013 | Datos retención/crédito fiscal | Medio E606=10 / tipo D011=12 | Subgrupo especializado, no pago común | Solo operación especial autorizada |

## 7. Entregas a Claude con dependencias, entregables, criterios y prohibiciones

| Orden | Identificador | Contenido Claude (código/SQL/UX) | Dependencia real | Aceptación por ChatGPT | Iniciar |
|---|---|---|---|---|---|
| 0 | MFE-A | Mantener ajustes fiscales, snapshot e idempotencia ya aceptados | NEX-056 versionada; no instalar por IA | No regresiones en Fase A | **Base**, no reescribir |
| 1 | **MFE-B1** | Condición Contado/Crédito; plazo/cuotas, entrega inicial en efectivo si se implementa integralmente; E640/E650, JSON `Cuotas[]` con claves/tipos MT, snapshot inmutable | **Paridad JSON↔MT confirmada por responsable**; no se exige otro ejemplo de Crédito. B2 conserva los demás medios de pago | Pruebas dirigidas plazo, 1/3 cuotas, suma, tipos, omisión en Contado, permisos, emisión idempotente y baseline PYG | **Primera tarea Claude** |
| 2 | MFE-B2 | Catálogo y subformularios efectivo, transferencia, cheque, tarjeta, múltiples medios y entrega inicial; E605/E620/E630; revisar los demás códigos 1–21/99 por modalidad | MFE-B1 contratos y estructuras reutilizables; mismos nombres/tipos SIFEN en JSON, sin exigir JSON de ejemplo extra | Pago 2+ medios, cheque, tarjeta, 99 condicional, suma exacta, token no expuesto | Tras auditoría B1 |
| 3 | MFE-C | PYG/USD/BRL; cotización manual; cambio por documento; PYG equivalente; precisión y moneda de cuotas/pago | MFE-B2 pagos + catálogo Tipos de cambio; nombres/tipos MT confirmados, **P-02/P-12 valores** aún por conciliar | 3 monedas, cambiabilidad segura, snapshot, redondeo, mismo DE, no quebrar PYG | Tras auditoría B2 |
| 4 | MFE-D1 | Descuentos por línea/global EA002–004; totais F009–010 y recalculo IVA | MFE-C aprobada; NT13/descuentos con mismos nombres/tipos JSON y MT | Ítems con descuentos múltiples, 27 de XML sanitizados como referencia numérica, IVA y cero descuento regresión | Tras auditoría C |
| 5 | MFE-D2 | Opcionales `dInfItem`, origen, paquete GTIN, lote/venc./serie/pedido; anticipos con CDC solo al obtener flujo probado | MFE-D1 + contrato por campo | Campos opcionales invisibles cuando no aplican, longitud, no inventar lote ni asociar CDC | Tras auditoría D1 |
| 6 | MFE-E | Transacciones especiales 5–13, tipos de impuestos especiales, B2G, vehículo/importación, quiebra/merma | Por operación: prueba normativa + contrato proveedor + alcance comercial | Cada caso individual y aislado con su propio criterio | Solo con nueva autorización de operaciones |

**Definición de terminado por fase:** (a) columnas UI/JSON/API/SQL del grupo cubiertas; (b) tests **dirigidos** incluidos permiso/multiempresa, cálculo, grupos exigidos/omitidos y regresión PYG/Contado/Efectivo; (c) documentación de contrato cuando no pueda enviarse; (d) commit/push SHA y parada para auditoría ChatGPT; (e) sin migrations sobre VM, sin deploy ni envío real. Un input visual funcionando con backend aún fijo = **NO ACEPTADO**.

## 8. Escenarios de aceptación que Claude debe implementar de manera dirigida, por fase

| ID | Escenario | Resultado esperado |
|---|---|---|
| CA-01 | PYG/Contado/Efectivo básico ya soportado | JSON, totales, NEX-048, permiso, FAT-E2 e idempotencia **idénticos** al baseline |
| CA-02 | Sin punto activo o sucursal de otra empresa | Mensaje claro y bloqueo, sin fabricar punto/numéro |
| CA-03 | Crédito Plazo 30 días | E601=2 E641=1 E643=`30 días`; no E644/E650; monto íntegro como crédito |
| CA-04 | Crédito 3 cuotas que suman total | E641=2 E644=3, 3 cuotas E650 cada valor/moneda/vencimiento, total exacto |
| CA-05 | Crédito cuotas con total discordante o fechas inválidas | Error dirigido, no reservar número |
| CA-06 | Cambiar crédito a Contado | Limpiar campos E640/E650 en cliente y payload, conservar datos no fiscales necesarios |
| CA-07 | Crédito con entrega inicial | Pago inicial real más cuotas = total, sin contarlo dos veces |
| CA-08 | Contado Efectivo + Transferencia | Dos registros pago; suma exacta, no duplicar base IVA |
| CA-09 | Cheque sin número/banco | Bloqueo y mensaje por campo; grupo E630 solo si cheque |
| CA-10 | Tarjeta con datos mínimos y marca Otro | E620 condicional, descripción, procesamiento y últimos 4 si se informa; sin PAN ni CVV |
| CA-11 | Medio 16 con presencia no bancaria | Bloqueo E606=16 ⇒ E011=5 (FE) |
| CA-12 | USD con tipo de cambio global | D015=USD D017=1 D018 positivo y contravalor PYG exacto; snapshot fijo |
| CA-13 | PYG con D017/D018/E611 | No enviar esas claves fiscales en XML PYG; JSON proveedor conforme su contrato |
| CA-14 | BRL sin cotización o tasa 0 | Bloqueo; ningún número reservado |
| CA-15 | Cambio de tasa después de emitir | DE antiguo conserva tasa y totales; jamás actualizarlo |
| CA-16 | 1 ítem con descuento unitario, IVA 10% | Descuento reduce neto comercial y base/IVA con algoritmo validado |
| CA-17 | Descuento global sobre ítems con impuestos distintos | Aplicación por ítem, no prorrateo aproximado; suma exacta |
| CA-18 | Gravad[o] parcial generando residuo P-11 | Bloqueo previo conocido; no solución artificial |
| CA-19 | Sin descuento/anticipos | Regresión `0` y campos como en base actual; no inferir obligatorio nuevo |
| CA-20 | `dInfItem` >500 / país inválido / lote inventado | Error / no exportar datos inválidos |
| CA-21 | Cliente sin documento legal exigido por la modalidad | Bloqueo, no crear RUC/identificación ficticios |
| CA-22 | Repetir FE tras edición IVA del producto por tercero | No modificar producto, bitácora ni reenviar documento |
| CA-23 | Estado indeterminado y error del gateway | No reintento ciego, historial correcto, no marcar SIFEN APROBADO |
| CA-24 | Cambio de una fila luego de previa | Invalidar previa y su confirmación; nuevo hash para distinta intención |
| CA-25 | Cambio de empresa/permiso fiscal en sesión | Ninguna fila ni precio de otro tenant ni grupo fiscal sin permiso |
| CA-26 | JSON construido con campos del MT no presentes en la factura ejemplo | Validar nombres, tipos, grupos condicionales y envío según implementación; **no** bloquear solo por falta del campo en el ejemplo. Si existe fallo específico comprobado, bloquearlo y documentar |
| CA-27 | Gtin E706 ausente explícito vs E714 información por ítem | Claves distintas, sin sustitución semántica |
| CA-28 | P-02 / P-12 inalterados por expansión de fases | Evidencias preservadas, sin afirmar aprobación real |

## 9. Bloqueos de evidencia y decisiones del responsable (no disimular)

| ID | Pregunta / evidencia faltante | Estado / política |
|---|---|---|
| G-01 | **Paridad de nombres/tipos JSON para Crédito Plazo, Crédito Cuotas y entrega inicial** | **CONFIRMADA por responsable MFE-02.** Implementar y probar grupos/arrays condicionales a partir del Manual sin pedir otro JSON de ejemplo. No bloquear `Enviar` solo por ausencia del ejemplo; no ejecutar transmisión real desde IA. |
| G-02 | Nombres/tipos de cheque, tarjeta, múltiples medios, retención y descripciones | **CONFIRMADOS para correspondencia al MT**. Falta implementar/validar los requeridos por cada tipo; solo bloquear modalidades aún no implementadas o defectuosas. |
| G-03 | Nombres/tipos JSON USD/BRL y conversión | **Paridad MT confirmada**. Las **discrepancias de valores** P-02 `dTotalGs` y P-12 `dLiqTotIVA5/10` siguen abiertas por diferencia documentada entre JSON de muestra y XML; no atribuirles resolución por paridad de nombres. |
| G-04 | Gravado parcial y descuentos con redondeos NT13/P-11 | Pendiente crítica. Mantener bloqueo donde hay residuo. |
| G-05 | `Competencia` quiere decir período comercial del servicio o edición de fecha de emisión fiscal | **No decidido.** No codificar ese campo; no impide MFE-B1. |
| G-06 | `Composición`: información fiscal opcional (`dInfItem`) o lista de componentes/BOM del producto | **No decidido.** No crear BOM automático en FE. |
| G-07 | Timbrado/puntos de expedición y última numeración del emisor | Datos humanos verificados por empresa/ambiente; sin seed inventado. |
| G-08 | Versión normativamente más nueva que MT150+NT027, **NT021** no archivada, XSD e interpretación de campos especiales | Revalidar antes de activar nuevos casos. |
| G-09 | Aprobación para actividades especiales 5–13, ISC/Renta, exportación/B2G y anticipo con DE de origen | No presumida por pedido de completar FE normal; separar alcance. |
| G-10 | NEX-056 real y cualquier nueva DDL futura | Solo el humano aplica en VM con backup y verificación; nunca Claude ni ChatGPT. |

## 10. Contrato de responsabilidad y siguiente acción

**ChatGPT** es dueño de esta matriz; antes de cada fase compara MT/NT, JSON proveedor, UI, API y DDL y publica los criterios de prueba y auditoría. **Claude Code** solo implementa **una fase autorizada** sin reinterpretar requisitos de negocio ya cerrados ni iniciar nuevas fases por su cuenta. **Responsable humano** define cuestiones de negocio abiertas, aprueba envíos reales y opera VM/PG.

**Orden inicial Claude:** ejecutar únicamente **MFE-B1 — Crédito (Plazo / Cuotas)**; implementar los campos obligatorios/condicionales frontend/backend, serializar **los mismos nombres y tipos SIFEN** en `Cuotas[]`, preservar snapshot e idempotencia y crear DDL incremental solo si imprescindible. **NO bloquear Enviar por el mero hecho de que el JSON de ejemplo no incluía Crédito**; sí bloquear defectos concretos de implementación o riesgos fiscales comprobados. Pruebas dirigidas, SHA, parar a auditoría. **No iniciar MFE-B2/C/D/E**. No aplicar NEX-056 ni ninguna migration en VM.
