# AUD-FE-UX-R01 — Nueva factura electrónica: operación, puntos, unidades, IVA y densidad visual

**Fecha:** 15/10/2026. **Solicitante:** responsable NEXIT / PROCEIT. **Estado:** análisis y criterios de aceptación; NO implementado ni homologado. **Branch:** `feature/NEXIT-2026-001-banco-demo`. **Referencia funcional:** matriz MFE-03 vigente, Manual Técnico SIFEN v150 y NT aplicables, NEX-039/043/048/056.

## 1. Evidencia y alcance
Tres capturas de la VM facilitadas en conversación al responsable: (1) `Operación` Crédito a plazo; (2) `Operación` Contado/Efectivo; (3) `Detalle de la factura` con dos productos incompletos. **Las capturas NO están adjuntas/versionadas en GitHub**: queda pendiente su incorporación, si se autoriza, después de revisar datos y privacidad. El contenido del código se contrastó en la branch oficial. Esta AUD no autoriza implementación automática ni despliegue.

**Solicitudes expresas:** dónde registrar punto de expedición; por qué Tipo de transacción e Indicador de presencia están escondidos; pago y productos desproporcionadamente grandes; «Unidad SIFEN» debería decir «Unidad de medida» y listar todas las unidades pertinentes; cambiar IVA 10%↔5% directamente; faltan campos; UI más bonita, compacta y profesional.

## 2. Hallazgos confirmados (UI/API/SQL)

| ID | Hallazgo | Evidencia en Git / efecto | Severidad |
|---|---|---|---|
| FE-UX-R01-01 | Falta gestión visual de puntos de expedición | `emision.ts:catalogosFactura` lee puntos de `fe_puntos_expedicion` y expone solo activos. `page.tsx` muestra error largo sin vínculo a configuración. NEX-048 crea tabla y número protegido pero concede SELECT al runtime; la carga inicial queda para el responsable. No existe en la navegación actual una gestión operativa dedicada del punto. En captura, Casa central (001) tiene 0 puntos activos. | BLOQUEA emisión en esa sucursal |
| FE-UX-R01-02 | Campos ordinarios escondidos | `page.tsx` anida `Tipo de transacción` e `Indicador de presencia` dentro de `<details>` «Parámetros fiscales», pese a que afectan el JSON, pagos admitidos y reglas SIFEN. | UX ALTA |
| FE-UX-R01-03 | Pago demasiado grande | `medios-pago.tsx` usa `fieldset.credito` + `grid` que obliga a un medio Efectivo de una sola opción a ocupar un bloque ancho/alto; controles contextuales y botón alineados de forma poco compacta. | UX ALTA |
| FE-UX-R01-04 | Detalle fiscal se expande por debajo de cada ítem | `page.tsx` inserta un `tr` de ancho completo con `EditorFiscalItem` y `details open` si hay pendientes; multiplica la altura y desplaza el detalle siguiente. | UX ALTA |
| FE-UX-R01-05 | Unidad de medida nombrada técnicamente y catálogo por verificar | `ajuste-fiscal-item.tsx` muestra `Unidad SIFEN`; `emision.ts` hace `SELECT ... FROM unidades_medida_sifen WHERE vigente` **sin LIMIT**. NEX-039 define 34 unidades, NEX-043 agrega 30, total **64 versionadas**, sin garantía de que todas sigan vigentes/cargadas en VM. Unidad física maestra y código de emisión no son lo mismo: no cambiar `unidad_medida_id` de Productos/Stock para completar la factura. | FUNCIONAL / datos |
| FE-UX-R01-06 | Cambio 10% a 5% poco evidente | `ajuste-fiscal-item.tsx`: `ajuste.afectacion=""` significa «del producto»; el select de `Tasa de IVA` solo aparece si `hayIvaAjustado`. Para ajustar únicamente la tasa hay que volver a seleccionar la afectación, aunque el producto ya tenga `Gravado 10 %`. | UX ALTA |
| FE-UX-R01-07 | «Faltan todos los campos» necesita inventario de alcance, no campos de mentira | Básicos del ítem vigentes: descripción, GTIN, unidad, cantidad/precio, afectación/IVA/proporción, total. Matriz MF-020/021/022 tiene DESCUENTOS (D1), ANTICIPOS, lote/serie/vencimiento, `dInfItem`, GTIN empaque, datos especiales (D2/E) **no implementados**. No son simplemente controles escondidos, y no deben agregarse a la pantalla sin backend/validación/JSON. | ALCANCE |

## 3. Diseño exigido — distribución

**Conservar identidad NEXIT:** tarjeta Operación, Cliente, Detalle de la factura, Información adicional y resumen lateral con totales. Reordenar/compactar, no cambiar la tipografía ni redibujar la aplicación globalmente.

**Operación visible, sin details:** primera fila sucursal · punto de expedición · condición (Contado/Crédito); segunda fila moneda + tipo de cambio condicional · Tipo de transacción · Indicador de presencia. La etiqueta de establecimiento y número referencial debe seguir visible en pequeño. Todos los campos que el operador necesita elegir deben estar a simple vista. Valores por defecto fiscales actuales se preservan, no se inventan nuevos.

**Crédito:** solo Plazo sigue activo (Cuotas suspendido en UI+API). Reducir controles: Plazo días con accesos 30/60/90, entrega inicial opcional, saldo estimado; mostrar vencimiento compacto y sin avisos largos permanentes. Las reglas de saldo y pagos no cambian.

**Pagos:** con un medio Efectivo, mostrar una fila `Medio de pago [Efectivo] [+ Añadir]`; el total está en el resumen lateral. Con más medios, cada fila `medio | monto | quitar`, con suma/objetivo discretos. Abrir solamente detalles condicionales de cheque/tarjeta/Otro. En Crédito sin entrega inicial no mostrar pago. Mantener 20 medios, controles y errores de validación exacta.

**Detalle:** tabla compacta `Producto | IVA | Unidad | Cantidad | Precio | Subtotal | Acciones` con números alineados. No duplicar «Afectación IVA» y «% IVA» en columnas enormes: usar combinación legible `Gravado 10 %`, `Gravado 5 %`, `Exento`, `Exonerado`, `Gravado parcial 5/10 %`; la semántica fiscal se conserva en campos separados. Se deben distinguir estados válidos, advertencias y bloqueos. Editor de datos fiscales por acción pequeña `Editar datos fiscales` o aviso `Completar`, abriendo panel compacto contextual para el ítem elegido, no una segunda fila gigante permanente para cada producto. En móvil, tarjetas legibles; sin scroll horizontal forzado ni ocultamiento de errores.

**Editor fiscal:** etiquetas de negocio `Unidad de medida`, `IVA`, `Descripción`, `GTIN`; código SIFEN se puede mostrar como dato secundario para trazabilidad, pero el valor `cUniMed` del JSON debe seguir siendo oficial. Campo IVA inicial debe reflejar lo que se factura efectivamente y permitir cambios directos `Gravado 10 %` ↔ `Gravado 5 %`, `Exento`, `Exonerado`, `Gravado parcial 5/10 %`; al elegir parcial abrir proporción obligatoria. Al cambiar categoría actualizar conjuntamente `afectacion`, `tasa`, `proporcion` del `AjusteFiscal` (reglas E731/E733/E734). Opción `Solo esta factura` por defecto, y aclarar que `Guardar también en Productos` persiste **solo clasificación IVA** con permiso; no cambiar unidad de stock ni precio de lista implícitamente.

**Unidades:** mostrar una lista buscable con nombre común, símbolo y código SIFEN en el detalle (p.ej. `Unidad (UNI) · 77`, `Caja (BX) · 131`, `Docena (DOC) · 113`), conservando entradas distintas aunque nombres coincidan (Metro 87/108 no se fusiona ni elige por suposición). Investigar por qué el usuario no ve todas: comparar conteo real de `unidades_medida_sifen` por `vigente`, NEX-039/043 aplicadas, permisos de lectura, respuesta API completa, y renderizado/scroll del componente; **no presumir defecto de datos sin consulta autorizada al responsable**. No hardcodear 64 en UI ni mostrar unidades marcadas no vigentes como seleccionables. Reglas de cantidad según código 77 intactas.

## 4. Punto de expedición: función ADMINISTRATIVA independiente y segura (no botón que inserta 000 por defecto)

- `Configuración fiscal → Puntos de expedición` debe existir como página y API protegidas, o integrarse a la configuración administrativa existente cuando realmente implementada. La factura exhibe un **enlace contextual real** `Configurar punto de expedición` solo a un usuario autorizado; sin permiso se muestra «Solicite al administrador fiscal». **Nunca enlace roto** ni botón inerte.
- Autorizar alta de punto con empresa/sucursal y establecimiento configurados; código 3 dígitos; nombre; activo; **último número YA emitido** (inclusive documentos desde otros sistemas/gateway), informado y confirmado por operador fiscal responsable. No iniciar automáticamente en 0 cuando haya documentos previos; no asumir que punto 001 siempre comienza en 0000001.
- **Protección:** `fe_puntos_expedicion` tiene clave única `(empresa_id,sucursal_id,codigo)`, trigger de empresa/sucursal/código inmutables, `ultimo_numero` no retrocede, prohíbe eliminar; preserve. Control de alcance por sucursal, permisos (administrador de empresa/permiso fiscal explícito), validación de colisiones, auditoría, confirmación de datos sensibles de numeración. El rol runtime solo tiene SELECT: crear operación SQL incremental `SECURITY DEFINER` o patrón existente, con autorizaciones reales; una migration NUEVA (NEX-057 o siguiente libre verificada) si necesaria, nunca editar NEX-048. La emisión `fe_documento_crear_fe` continúa única autoridad de incremento y bloqueo.
- `Timbrado` y credenciales son responsabilidad/configuración del gateway conforme contrato conocido: no inventar autorización automática SIFEN desde UI ni exponer contraseñas. No prometer configuración completa sin confirmar campos de timbrado necesarios.

## 5. Campos de factura adicionales — diferencia entre oculto y no implementado

- **Ya existentes, mostrar mejor:** tipo de transacción D011; presencia E011; moneda/cambio D015/D018; IVA E731/E733/E734; unidad E709; descripción E708; GTIN E706; medios de pago E606 y condicionales; crédito Plazo.
- **No implementados actualmente (nuevas entregas funcionales, NO solo CSS):** descuentos por ítem/globales MF-020 (PRO-124); `dInfItem`, GTIN del empaque, país de origen, lotes/series/vencimiento/seguimiento y anticipos MF-021/022 (PRO-125); sectoriales y casos especiales MF-023 (PRO-126). Realizar inventario con nombre exacto SIFEN, tipo, condición, origen, permisos, API, SQL/snapshot y JSON antes de autorizar cada grupo. No introducir controles visuales inertes ni hacer obligatorios campos que el MT marca opcionales.
- **Reglas pendientes:** P-02/P-11/P-12 no se «corrigen» con refactor CSS; Cuotas suspendido.

## 6. Criterios de aceptación dirigida

**UX-01** Vista 1440/1024/768/375: tarjetas compactas, datos operativos visibles, no scroll horizontal, resumen y acción accesibles, sin exceso de altura de pago único y productos completos. Presentar ANTES/DEPOIS por resoluciones; registrar fecha, SHA, navegador/zoom. Capturas no se declaran versionadas si no están realmente en Git.

**UX-02** Punto inexistente: mensaje breve + acceso administrable válido; sin permisos no expone edición. Alta fiscal autorizada registra código y último número verificado; no edita identidad ni retrocede secuencia. Vínculo/endpoint funcional y prueba puntual del bloqueo.

**UX-03** Catálogo: listar todas las entradas vigentes reales sin límite artificial, permitir encontrar Caja/Docena cuando estén activas, preservar códigos duplicados de nombre sin confusión. Si falla, reportar número de entradas presentes sin suponer 64 en la VM.

**UX-04** IVA: cambiar directamente Gravado 10→5, 5→10, Exento/Exonerado y parcial proporcional. Test UI→POST→validación→JSON del campo correcto; subtotal/IVA coherentes FAT-E1. Sin permiso `AJUSTE_FISCAL` no ofrece modificación.

**UX-05** Pago Efectivo único minimalista; transferencia/cheque/tarjetas/mixtos siguen funcionales, campos condicionales presentes y error en su fila. No reintroducir `Number` para conciliación.

**UX-06** Validación no numera con unidad/IVA inválidos; no crea configuración fiscal sin autorización. Tenant y RLS/funciones SQL preservados; `PYG/Contado/Efectivo`, `Crédito Plazo`, USD/BRL/FX, pagos P1/P2, idempotencia y gateway FAT-E2 sin regresión.

**Regla de ejecución:** análisis escrito por ChatGPT; Claude implementa una única etapa autorizada, con tests **básicos dirigidos**, commit/push y PAUSA para auditoría. No suíte completa/build general/CI manual/VM/PG operativo; ningún documento fiscal real transmitido por IA. **Separar entrega UI/IVA/catálogo (sin SQL si bastan código y API existente) de gestión de puntos (SQL incremental + backend + admin UI), que tiene riesgo de numeración.**
