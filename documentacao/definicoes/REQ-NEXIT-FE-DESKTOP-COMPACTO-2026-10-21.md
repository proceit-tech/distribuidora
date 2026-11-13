# NEXIT — REQ-FE-DESKTOP-COMPACTO — Nueva factura como pantalla de operación rápida

**Fecha:** 21/10/2026  
**Área:** Facturación → Facturas → Nueva factura electrónica  
**Motivo:** devolución visual del responsable después de probar la FE premium R02 en el único ambiente operativo: «já funciona, mas o layout está muito grande e não é fácil organizar as coisas».  
**Base funcional:** commits `620ea83d3eb6be24201fd9a3044acdaa4a479a6b` + `e4b9d99c72dd7934a746cf2c648c7bc2a9693efa`; auditoría `documentacao/testes/AUD-NEXIT-KUDE-NCR-FE-UX-R02-2026-10-21.md`.  
**Estado:** definición visual aprobada como objetivo de próxima corrección; implementación solo por Claude bajo orden expresa, auditoría independiente ChatGPT y homologación humana posterior. No homologado.
**Referencias ANTES (adjuntas a la conversación ChatGPT, NO versionadas en Git):** `image(20261021-152906).png` y `image(20261021-152917).png`, capturas 1600px aproximados, 21/10/2026. Contienen datos fiscales del cliente, por lo que no se incorporan a repositorio hasta revisión de privacidad/permiso. Se requieren capturas DESPUÉS humanas con viewport/zoom registrados.

## Diagnóstico reproducible del código actual

- `page.module.css:5-10`: `.workspace` usa dos columnas (`1fr 340px`); `resumenPanel` (líneas ~500) es sticky y contiene muchas filas fiscales, descuento general, cliente, condición, medios, validaciones y acciones, aunque varias ya se ven a la izquierda.
- `.principal` distribuye 5 tarjetas con `gap:14px`; cada `cardHead` tiene `min-height:52px`, `cardBody` padding 16×18. Multiplica scroll y altura de una venta sencilla.
- `tableWrap` hace scroll horizontal (`overflow-x:auto`): con columna derecha fija quedan campos de la factura y acciones fuera de vista en 1600px. La corrección previa redujo el alto de las celdas, pero no recuperó ancho ni resolvió estructura.
- `EntregaCliente` añade dos líneas descriptivas persistentes debajo del selector; `Información adicional` tiene una tarjeta entera con textarea grande aunque sea opcional; `Descuento general` expone párrafo explicativo aun con descuento vacío.
- El sidebar muestra importes exento/exonerado/gravado/IVA aun cuando todos son cero; los datos completos son necesarios pero no requieren presencia permanente.

## Propuesta de distribución (desktop, no mobile)

```text
┌── NUEVA FACTURA ─────────────────────────────────────── [Borrador / fecha] ──┐
│ OPERACIÓN [Sucursal | Punto | Condición | Moneda | Tipo | Presencia]         │
│ CLIENTE   [ALES S.A. · RUC · estado]  [Dirección entrega ▼] [Cambiar]       │
├────────────────────────── PRODUCTOS: ANCHO COMPLETO ───────────────────────┤
│ [Buscar por código / GTIN / descripción________________] [Avanzada]         │
│ Producto                  IVA    Unidad Cant Precio  Descuento Subt Acciones │
│ descripción/código/GTIN    ...     ...  ...  ...      ...      ...  Fiscal ✕ │
│ ... filas adicionales, SIN scroll horizontal en escritorio habitual        │
├─────────────────────────────────────────────────────────────────────────────┤
│ PAGO [Efectivo ▼ cubre total] [+ medio]   [Descuento general ▼]             │
│ [Observaciones (opcional) ▼]                                               │
├──── BARRA RESUMEN FINANCIERO ───────────────────────────────────────────────┤
│ [IVA total] [Detalle de impuestos ▾] [TOTAL Gs. X] [Revisar y confirmar]    │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Decisión central:** NO dejar un sidebar permanente de 340px. Usar todo el ancho útil del escritorio para los ítems y un **resumen financiero compacto al pie**, sticky si es seguro y no tapa contenido. Mantener acceso explícito a todos los impuestos y advertencias. No crear un segundo cálculo, usar valores actuales del motor.

## Reglas visuales / funcionales

**RN-01 — Densidad controlada.** Minimizar cajas anidadas: `Operación` y `Cliente` como bandas de formulario compactas; encabezados de secciones alrededor de 36–40px y padding interno de 10–12px cuando la legibilidad lo permita. No empequeñecer controles por debajo de accesibilidad adecuada; usar 34–38px como objetivo razonable para selects/inputs, sin tocar menús externos.

**RN-02 — Configuración de operación.** Mostrar sucursal, punto, condición, moneda, tipo de transacción y presencia con distribución flexible en 1 fila si hay ancho, como máximo 2 filas en escritorio 1366px. `Próximo N.º referencial` como texto compacto, sin forzar altura de toda la fila; con USD/BRL revelar cambio manual/cotización y mensajes correctamente. Mantener explícitos campos obligatorios y errores de SIFEN.

**RN-03 — Cliente/dirección.** Resumen de razón social, RUC/CI, estado `Apto/pendientes` y cambio de cliente en una fila compacta. Ubicar selector `Dirección de entrega` en la banda del cliente sin la caja grande celeste y sin repetir un bloque completo de dirección debajo; conservar texto completo accesible (tooltip/detalle en una acción), selección real/estado async y todo aviso de error. `Ficha fiscal completa` permanece en desplegable. La información «no modifica el domicilio fiscal» sigue disponible en ayuda contextual, no un párrafo repetido permanente.

**RN-04 — Tabla de productos prioritaria.** La tabla usa todo el ancho restante del workspace, sin columna derecha. A ancho útil desktop ~1366/1600 a zoom 100%, lograr columnas visibles de Producto, IVA, Unidad, Cantidad, Precio (IVA incl.), Descuento, Subtotal y Acciones **simultáneamente, sin scroll horizontal**. Optimizar ancho de campos y filas; mantener descripción completa con `title`, código/GTIN legibles en línea secundaria sin pérdida, controles de cantidad/precio/descuento, opción `Fiscal/Completar`, `Quitar`, proporción gravada y avisos. No ocultar botones ni recortar errores; con viewport estrecho donde sea imposible, aceptar scroll de TABLA con acciones visibles o alternativa accesible (no scroll de página horizontal). Objetivo filas normales ~44–56px dependiendo de errores/contenido. No convertir tabla en cards, no rediseñar móvil.

**RN-05 — Búsqueda rápida.** Mantener buscador de producto + búsqueda avanzada alineados en la cabecera compacta, con foco tras agregar, soporte de escáner, selección múltiple y avisos.

**RN-06 — Pago.** Mantenerlo **después de cliente+productos**; disponible solo si cálculo/desc. válidos. Con un solo medio en contado, una fila compacta: medio, monto total cubierto y enlace `+ Agregar otro medio de pago`. Si varios medios o hay crédito/entrega, crecer naturalmente para campos requeridos. No resetear pagos ni alterar conciliación, moneda, cambios, advertencias o flujo.

**RN-07 — Descuento general.** Puede situarse junto al pago o dentro de área compacta separada; control claro y editable de %/monto accesible con un clic. Sin valor, NO mostrar tarjeta de gran altura ni explicación de tres líneas siempre visible. Si hay descuento aplicado o errores, estado/importe y mensajes obligatorios permanecen visibles. Mantener fórmulas fiscales y motor intactos.

**RN-08 — Observaciones.** Sección opcional colapsada inicialmente en una sola línea con `Observaciones (opcional)`. Al expandir, conservar textarea y su contenido (hasta 5000), sin perder datos tras colapsar, ni alterar revisión.

**RN-09 — Resumen inferior.** Cambiar `resumenPanel` por barra/superficie compacta que muestre total general, IVA total, total descuentos si existen, pendientes de validación cuando existan y `Revisar y confirmar` + `Cancelar`. Todos los detalles de exento, exonerado, gravado 5/10, IVA 5/10, pagos, condición, cliente y equivalente en Gs se conservan en `Detalle de impuestos / Resumen completo` expandible o diálogo accesible. No repetir siempre cliente/condición/pago en una columna fija. Sin factura válida mantener visible el bloqueo y motivo. Si sticky, asegurar espacio inferior suficiente: nada queda tapado ni inaccesible con teclado o zoom.

**RN-10 — Mantener la modal de revisión.** No rediseñar `Resumen de la factura` ya corregido en R02, salvo ajuste estrictamente indispensable para nueva barra. Preservar foco/Tab/Shift+Tab/Escape y retorno de foco; huella del cuerpo/stock/idempotencia.

**RN-11 — Estados y errores.** No ocultar ningún error fiscal/de inventario/cliente/cambio/credencial. Seguir usando cálculo y validaciones del servidor. Los errores pueden expandir la densidad de la línea/área a la que pertenecen. La densidad no debe esconder requisitos de SIFEN.

## Criterios de aceptación / evidencias

- **CA-01** A 1600×900, zoom 100%, con factura de 1 y de 3 ítems normales, la tabla presenta todas las columnas y acciones sin scroll horizontal y se aprovecha el ancho; operación/cliente ocupan claramente menos alto que en capturas antes.
- **CA-02** A 1366×768, zoom 100%, no hay scroll horizontal de toda la página; elementos accesibles con teclado y botón `Revisar` sin solapamiento. A 1920×1080 la pantalla no dispersa excesivamente los controles.
- **CA-03** Cambiar sucursal/punto/condición/moneda (incluso extranjera), tipo/presencia; conservar confirmaciones, próximo número, crédito con entrega.
- **CA-04** Cliente apto/no apto, cambio/quitar, búsqueda, múltiples direcciones, dirección sin registro, error al cargar, ficha fiscal expandible; sin mezcla de clientes.
- **CA-05** Ítems de descripción y GTIN largos, filas normales vs con error fiscal, cantidad 2,5, precio, descuentos, % afectación, Fiscal/Quitar; ninguna acción fuera de vista en escritorio normal.
- **CA-06** Sin cliente/sin ítems/descuento inválido → medios no editables; contado/varios medios/crédito y pago de entrega igual que antes; no pierde pagos digitados.
- **CA-07** Descuento general 0/porcentaje/monto/ inválido y observaciones vacías/llenas; acceso y errores correctos sin altura innecesaria.
- **CA-08** Vista fiscal detallada contiene todas bases/IVAs, totales, moneda y equivalente; ningún importe nuevo/alterado, estado `pendientes` visible siempre que exista.
- **CA-09** Resumen modal y envío mantienen el mismo cuerpo revisado, la huella de stock y la protección de doble envío; modal con teclado intacta.
- **CA-10** Después: capturas en navegador **por el responsable** con la misma resolución/zoom y escenarios comparables, archivadas en `documentacao/testes/` o la carpeta visual existente con fecha/commit/estado; el Claude no puede declarar conformidad visual total solo por CSS.

**Fuera de alcance:** KuDE NCR/FE, NCE, API/gateway, contratos fiscales, PDF, numeración, estoque/deposito, SQL/migrations, permisos, motor de IVA/descuentos, otras pantallas o rediseño mobile.

**Archivos orientativos para Claude:** `app/(private)/facturas/nueva/page.tsx`, `page.module.css`, `entrega-cliente.tsx` únicamente si necesita reducir presentación, `medios-pago.tsx` solo si indispensable; tests focales `lib/facturacion/flujo-factura-ux.casos.ts`, `pagos.casos.ts`, `revision-factura.casos.ts` si se toca su presentación. Evitar crear un sistema global de layouts.

**Responsabilidades/gate:** Claude lee HEAD/protocolos/REQ, modifica solo layout, ejecuta tests focales y validación de sintaxis/lint puntual, hace commit/push, PARA para auditoría ChatGPT. Nadie de IA ejecuta VM/SQL/migrations/deploy. Auditoría estática ≠ homologación humana.
