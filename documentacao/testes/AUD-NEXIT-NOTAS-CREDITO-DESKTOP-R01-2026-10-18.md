# AUD-NEXIT-NOTAS-CREDITO-DESKTOP-R01 — Auditoría individual

**Fecha:** 18/10/2026. **Menú:** Facturación → Notas de crédito. **Ruta:** /notas-credito. **Rama:** feature/NEXIT-2026-001-banco-demo. **Dictamen:** AUDITORÍA ESTÁTICA DOCUMENTADA — HALLAZGOS ABIERTOS — NO HOMOLOGADO. No se autoriza implementación con Claude, código fiscal, SQL, migrations, VM ni deploy.

**Fuentes revisadas:** CLAUDE.md, documentacao/PROTOCOLO-IA.md, PROGRESSO-NEXIT-V1.md (PRO-94/NEX-062/063/065 y NCE UI ETAPA2/R01-R05), REQUISITOS-NCE-V1-EMISION-2026-10-16.md, ESPECIFICACION-NCE-UI-ETAPA2-2026-10-17.md y decisiones Puntos; app/(private)/notas-credito/page.tsx (548 líneas, blob 8bc13ccdb38a42bea315034ddb0b444c3ccd2a69), page.module.css (577, estructura pertinente), layout.tsx; APIs GET clientes, facturas, facturas/[id], correccion/[id], POST previa y POST emisión; lib/facturacion/nce.ts (443, blob 7eb5be2efd044fa5e917071e6322362115bf115f), nce-emision.ts (163), payload-nce.ts (302), nce-entradas.ts, nce-busqueda.ts (160), estados/servidor/gateway; NEX-062-facturacion-nce-v1.sql (609), NEX-065 estado y serie NCE; suites versionadas nce.casos.ts (602) y nce-busqueda.casos.ts (281), LEÍDAS, NO EJECUTADAS.

**Límite:** 0 tests ejecutados por ChatGPT, sin browser/capturas reales, PostgreSQL, VM, Docker, gateway/SIFEN, CI manual, build/lint/tsc ni aplicación de migrations. Auditoría de código versionado, sin comprobar esquema instalado. No se inspeccionó cada selector CSS ni todos los scripts auxiliares. No declarar homologación.

## 1. Función y reglas vinculantes

Emitir NCE directa, SIN borrador, referenciada a FE emitida por NEXIT, aprobada por SIFEN con CDC. Cliente se elige en UI por búsqueda identificada; tipo Innominado (identidad SIFEN=5) no se puede SELECCIONAR en ese flujo, por decisión explícita del responsable. **No agregar nueva prohibición al servicio/API/SQL contra Innominado:** fue excluida expresamente del alcance de MT-01.

Motivos 2 Devolución, 3 Descuento, 4 Bonificación, 8 Ajuste de precio. Una FE conserva motivo fijado por su primera NCE aprobada (aun si fue cancelada más tarde), pero admite NCE sucesivas del mismo motivo hasta agotar el saldo. Cualquier NCE pendiente o indeterminada BLOQUEA nueva emisión. Aprobadas consumen saldo, rechazadas/canceladas/inutilizadas liberan saldos. Rechazada DEFINITIVAMENTE se corrige mediante una NUEVA NCE con nueva numeración, preservando la rechazada original. Devolución usa ítems originales, cantidad y precio/unidad/IVA históricos; motivos 3/4/8 reciben MONTO bruto IVA incluido por línea con cantidad fiscal 1, sin multiplicar por la cantidad original. PYG total entero, USD/BRL con cambio histórico y precisión fiscal exacta.

Permisos FACTURACION_ELECTRONICA.CREAR; empresa/usuario de sesión, sucursal en alcance; FE aprobada y CDC; punto NCE habilitado por tipo e independiente de FE; número NCE de serie atómica (sin serie, después AA…ZZ); payload/receptor fiscal del snapshot persistido, no del catálogo actual. El modal resumen muestra total, IVA, CDC, motivo, punto; emisión utiliza EXACTAMENTE revisado.cuerpo, con comprobación de igualdad contra el formulario, y POST previa no reserva. Estado HTTP gateway/lote no equivale a APROBADO SIFEN. Sin integración automática de Stock.

## 2. Matriz funcional de cobertura

| Función | Evidencia actual | Evaluación |
| --- | --- | --- |
| Login/permisos | layout.tsx:4–7 y las seis rutas API, NEX-062 | CREAR en capa de acceso y SQL, empresa de sesión |
| Cliente e Innominado | page.tsx:79–86,263–335; nce-busqueda.ts; nce.ts:203–225 | debounce 300 ms, invalida resultados antiguos; Innominado no seleccionable solo UI |
| Facturas elegibles | page.tsx:87–127,338–376; nce.ts:230–268; GET facturas | APROBADO+CDC+saldo, pendiente etiqueta y bloqueo, paginación/CDC/fecha |
| Abrir factura original | page.tsx:129–156,297–299; GET facturas/[id] | **NCE-D01**: detalle tardío sin invalidación al cambiar cliente |
| Histórico/saldos | nce.ts:80–197; NEX-062:92–104,175–218 | bloquea pendientes, motivo histórico, solo aprobadas consumen |
| Puntos NCE | nce.ts:270–285,323–334; NEX-065 | secuencia NCE activa, tipo por punto, no flujo NRE/NDE/AFE |
| Motivo/ítems/IVA | page.tsx:391–471; payload-nce.ts:119–215 | cantidad devolución vs monto 3/4/8; datos FE persistidos, precisión |
| Revisar/confirmar | page.tsx:186–238,495–535; POST previa | cuerpo revisado exacto; **NCE-D02** respuesta de previa antigua |
| Enviar/idempotencia | nce-emision.ts:21–109; POST /api/notas-credito | SQL bloquea FE, mismo UUID recuperable; **NCE-D03** preflight antes de recuperación |
| Rechazada/corregir | page.tsx:161–180, nce.ts:404–439, GET correccion/[id] | propuesta de nueva NCE, no reenvía rechazada |
| Encontrar NCE después de emitir | page.tsx:230–233; NEX-065:362,379; documentos/page.tsx:100–102 | **NCE-D04** búsqueda por número de siete dígitos ambiguo |
| UI desktop | page.tsx:272–548, CSS layout/modal | 3 etapas, lista 6 col., panel lateral, modal; foco real no verificado |

## 3. Hallazgos NUEVOS del código actual

### NCE-D01 — ALTA — una respuesta tardía puede abrir la factura del cliente anterior

**Evidencia:** page.tsx:129–156 abrirFactura(id) realiza GET asíncrono y al terminar hace setFactura, setSucursales, setEntradas, setMotivo, setSucursalId SIN token/ref, AbortController ni verificación de cliente vigente. Mientras carga, el botón «Cambiar» de cliente (:297–299) no está deshabilitado: cancela listado y setCliente(null), pero NO cancela detalle de FE. Es posible A→Cambiar→B, resolución tardía de GET FE-A y estado cliente=B con factura=FE-A. La validación backend de empresa/sucursal continúa y el resumen identifica FE/CDC; no se comprobó emisión incorrecta real.
**Impacto:** operator puede preparar NCE contra una FE válida pero distinta de la que intenta seleccionar. 
**Cierre:** invalidar inmediatamente GET de detalle al cambiar cliente/FE/ruta de corrección; descartar tanto resultados como errores tardíos de ese contexto. Pruebas con promesas retrasadas, A→B, A→volver y corrección diferente; ninguna FE-A bajo cliente B.

### NCE-D02 — MEDIA — PREVIA antigua puede aparecer tras edición o abandono de factura

**Evidencia:** page.tsx:202–218 captura body C al iniciar POST previa, pero solo deshabilita «Revisar» cuando cargando; cantidad, motivo, punto y «Cambiar factura» siguen editables. Al terminar hace setRevisado sin cotejar versión/contexto actual. La protección de emitir() :220–225 compara body actual contra revisado y RECHAZA si difieren; por tanto NO afirmar que emite cuerpo B con resumen A (error que sí existe en Facturas). El defecto es visual y operativo: modal obsoleto que fuerza nueva revisión.
**Cierre:** bloquear edición o invalidar respuesta de /previa cuando cambia cualquier dato, factura o cliente; mantener comprobación del cuerpo exacto. Tests editar monto, motivo, punto, volver, seleccionar otra FE mientras /previa responde tarde.

### NCE-D03 — MEDIA / riesgo operacional — preflight del gateway antes de buscar documento idempotente ya existente

**Evidencia:** lib/facturacion/nce-emision.ts:67–79 hace await configuracionGateway antes de repeticion(), que recupera operación previa por clave validando FE, motivo, punto, sucursal, observación y líneas. Si la NCE se creó y perdió la respuesta HTTP, y posteriormente sus credenciales están ausentes/no disponibles, el reintento POST puede bloquearse en preflight sin devolver identificación de su documento existente, aunque NO debe reenviarse ciegamente. No hay evidencia de duplicado.
**Cierre:** consulta autorizada solo lectura de la operación ya guardada ANTES de requerir configuración de gateway para generar/transmitir; si no existe operación, exigir configuración; no permitir reutilización de clave con otro contenido ni transmisión de indeterminada. Test respuesta perdida+credenciales eliminadas, colisión clave, otra empresa.

### NCE-D04 — MEDIA — redirección post emisión por número secuencial NO identifica una única NCE

**Evidencia:** NEX-065:362,379 retorna o_numero con lpad de 7 cifras (sin establecimiento, punto, serie). nce-emision.ts:96 y POST /api/notas-credito lo envían como numero. page.tsx:230–233 hace router.push de /documentos?q=numero. Documentos/page.tsx:100–102 interpreta q como FILTRO de texto y no como ID documental. Varias FE/NCE, establecimientos, puntos o series pueden compartir 0000001; la pantalla puede mostrar múltiples coincidencias y no abrir necesariamente el documento recién emitido.
**Cierre:** navegación inequívoca por documentoId (si se implementa ruta con ACL y detalle correcto) o referencia fiscal completa tipo/est/punto/serie/número, con búsqueda compatible. No inventar deep link actualmente existente. Tests FE+NCE mismo número, puntos 001/002, serie sin serie/AA.

**Balance:** **1 ALTA, 3 MEDIAS, 0 BAJAS** nuevas. D03 escenario condicionado; D01/D02/D04 derivan del flujo actual, sin ejecución browser o PG.

## 4. Observaciones y decisiones previamente documentadas (NO sumar como defectos)

- **NCE-O01:** clasificador NEX-062 CONSUME aprobado, LIBRE rechazado/cancelado/inutilizado, BLOQUEA resto, está vigente en fuente. Motivo aprobado permanece fijado aun si luego cancelado (comportamiento documental expreso). No mudar sin decisión.
- **NCE-O02:** Innominado solo bloqueado en selección normal UI por tipo_documento_identidad_sifen=5. La API directa no recibió veto por orden previa del responsable, NO etiquetar exploit ni introducir nueva regla.
- **NCE-O03:** reconciliarNcePendientes consulta ENVIADO SIN_CONSULTA/PENDIENTE con límite 3; indeterminado y NO_RECONOCIDO siguen a flujos de consulta/worker, nunca tratarlos como rechazos automáticos.
- **NCE-O04:** puntos activos con ZZ-9999999 aparecen en combo NCE antes de bloqueo SQL; ya registrado en Puntos como PUN-D02, NO duplicar hallazgo.
- **NCE-O05:** varias lecturas fuera de snapshot en prepararNce, pero fe_documento_crear_nce bloquea FE, valida saldo/motivo/payload y reevalúa. No afirmar exceso fiscal realmente emitido.
- **NCE-O06:** datos fiscales provienen del documento FE persistido y no producto mutable; conservar cargo neto, CDC y histórico inmutable.
- **NCE-O07:** modal role=dialog, fondo inert; sin focus-trap o focus restore explícitos, revisar con browser/teclado antes de afirmar fallo. Sistema solo escritorio.
- **NCE-O08:** representación fiscal de motivos 3/4/8 como cantidad 1, JSON dSerieNum null/ausencia, tipoDoc=NCE y cierre definitivo CDC dependen de prueba real de proveedor; no inventar aprobación SIFEN.
- **NCE-O09:** preservar correcciones previas de búsqueda cliente/factura, UI-01, IVA parcial, NCE USD/BRL/PYG, saldo última versión, límite payload 240k, receptor/ítems fiscales validados por SQL. No reabrir por capturas anteriores.
- **NCE-O10:** corregir rechazada usa GET de propuesta solo tras rechazo definitivo; la respuesta incierta no libera saldo ni autoriza «nueva nota» sin reconciliar.

## 5. Casos de aceptación futuros (NO ejecutados)

| ID | Criterio |
| --- | --- |
| NCE-T01 | Permisos CREAR y aislamiento empresa/sucursal en GET/POST/SQL |
| NCE-T02 | Buscar cliente 2+ caracteres, Innominado no seleccionable UI, sin veto añadido API |
| NCE-T03 | Buscar FE por fecha/número/CDC, invalidación rápida de q anterior y paginación |
| NCE-T04 | GET FE-A pendiente → Cambiar y seleccionar cliente B → resultado A descartado (D01) |
| NCE-T05 | Abrir FE-A y FE-B fuera de orden, error A tardío no desplaza FE-B |
| NCE-T06 | POST PREVIA pendiente → editar/volver/cambiar FE → no presentar modal obsoleto (D02) |
| NCE-T07 | Emitir exactamente revisado, edición posterior bloquea POST hasta nueva PREVIA |
| NCE-T08 | FE aprobada y CDC, otros estados no elegibles; pendiente NCE bloquea emisión |
| NCE-T09 | Motivo único histórico aprobado, varias del mismo, cancelada libera monto, rechazada libera saldo |
| NCE-T10 | Devolución fraccionaria, precio/unidad/IVA originales, cantidad+monto disponibles |
| NCE-T11 | Descuento/Bonificación/Ajuste por línea con cantidad=1 y precio=monto bruto |
| NCE-T12 | IVA 5/10/exento/parcial, PYG entero, USD/BRL cambio FE y precisión 4/8 |
| NCE-T13 | Dos NCE concurrentes sobre misma FE: lock impide doble consumo |
| NCE-T14 | Misma clave idempotente reusa identidad; distinto punto/FE/motivo/lineas da conflicto |
| NCE-T15 | Respuesta HTTP perdida + credenciales quitadas devuelve ruta de recuperación segura sin reenviar (D03) |
| NCE-T16 | FE y NCE mismo punto/número independiente; tipo NCE inactivo bloqueado y no consume contador |
| NCE-T17 | Rechazada definitiva → corregir y emitir NUEVA NCE, número distinto y saldo correcto |
| NCE-T18 | CDC faltante/incoherente y respuesta ambigua mantienen estado/bloqueo hasta consulta válida |
| NCE-T19 | Navegar a recién emitida mediante ID o referencia única, no solo 0000001 (D04) |
| NCE-T20 | 1440/1920 desktop, 1/50/999 líneas, teclado/foco/modal/tablas y mensajes |
| NCE-T21 | Payload >240k bytes falla 422 antes de número y el saldo intacto |
| NCE-T22 | NRE/NDE/AFE config no habilita NCE de otro tipo |
| NCE-T23 | Versiones sucesivas de FE: saldo y receptor de UNA versión persistida coherente |
| NCE-T24 | Consulta automática y manual usan actor autorizado, gateway recibido ≠ SIFEN aprobado |

## 6. Estado global y cierre

Menu **Notas de crédito auditado estaticamente**, **1 ALTA + 3 MEDIAS nuevas**, 10 observaciones y 24 pruebas dirigidas futuras, todas sin ejecutar. No se probó emisión real ni se modificó código, SQL, VM, gateway o configuraciones. **NO HOMOLOGADO, Claude no autorizado**.

Con esta entrada, **22 entradas V1 activas** quedaron documentadas estáticamente según el control de menús previo, sin equivaler a homologación global. La secuencia de menús ACTIVOS pendientes que llevaba este control queda agotada; **Plataforma → Empresas** es flujo separado y los menús ocultos requieren decisión del responsable. No cerrar auditoría general ni liberar implementación sin instrucción posterior expresa.
