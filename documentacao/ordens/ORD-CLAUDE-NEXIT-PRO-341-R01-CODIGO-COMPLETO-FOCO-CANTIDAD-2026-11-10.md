# ORDEN CLAUDE — PRO-341-R01 / Nueva factura: código completo de producto y foco en Cantidad

**Fecha:** 10/11/2026  
**Repositorio:** `proceit-tech/distribuidora` · **Branch:** `feature/NEXIT-2026-001-banco-demo`  
**Linear:** [PRO-341](https://linear.app/proceit/issue/PRO-341) · **GitHub:** [#18](https://github.com/proceit-tech/distribuidora/issues/18)  
**Origen:** último pedido de CASA MINGO recibido con 2 capturas por WhatsApp: **«El código de producto no se visualiza todo cuando es un poco largo… Si podes ampliar eso para que se vea todo el código»** y **«al cargar los productos en la factura … se va directamente en cantidad el cursor»**.  
**Desarrolla:** Claude. **Audita:** ChatGPT, por SHA antes de cualquier siguiente tarea.  
**Orden activa:** SOLO PRO-341-R01; no activar PRO-340, ni modificar PRO-331/339 fuera de los puntos estrictamente necesarios para sustituir la regla de foco y mantener las suites coherentes.

## 1. Diagnóstico técnico comprobado antes del desarrollo

Se leyó la **versión completa vigente** de estos archivos en la branch:
- `app/(private)/facturas/nueva/page.tsx`: tabla editable, `<strong title={...}>` con nombre, `<small title={...}>` con `codigo` y, si hay, `GTIN`; input Cantidad `id={`cantidad-${l.clave}`}`; handlers `agregar`, `agregarRapido`, `volverAlBuscador`; `lineaAFocar` y efecto de focus/selección; `lineasActuales`, `claveSiguiente`, `aplicarLineas` de PRO-339-R02.
- `app/(private)/facturas/nueva/page.module.css`: `.itemsCompacta .prod small` (~1429–1436) declara `overflow:hidden; text-overflow:ellipsis; white-space:nowrap`, causa directa del código cortado. `.colProducto {width:auto}` + `table-layout:fixed`, otras columnas con anchos fijos y `min-width:1028px` en modo tabla ≥901px crean columna Producto estrecha. `.itemsCompacta .prod {max-width:360px}`. En móvil ≤900px la tabla se convierte en tarjetas al ancho disponible por PRO-331-R02.
- `lib/facturacion/detalle-factura-vista.ts`: `destinoFocoTrasAlta` devuelve `buscador` para rápida normal y `cantidad` para selector avanzado; `panel` para producto con intervención fiscal necesaria.
- `lib/facturacion/detalle-factura-vista.casos.ts`: casos originales PRO331-13, 24, 25, 26, 28, 29 y otros que establecen el **comportamiento antiguo**, y por tanto deberán actualizarse cuidadosamente sin borrarlos silenciosamente. También inspeccionar `lib/facturacion/cantidad-e01.casos.ts` y `lib/facturacion/flujo-factura-ux.casos.ts` para contratos asociados, solo si corresponden.
- `lib/facturacion/limite-lineas.casos.ts`: PRO339-70..86 valida coherencia de altas y estado, sin ejecutar componente React.
- `app/(private)/facturas/nueva/ajuste-fiscal-item.tsx` y `cantidad-anadido.tsx`: reglas de foco fiscal e inline del selector avanzado, importantes para evitar regresiones.

**NO modificar datos fiscales ni códigos de catálogo por un problema de CSS.** El `title` no sustituye la exigencia de ver el código completo en pantalla.

## 2. Requisito A — código completo SIN puntos suspensivos

1. Visualizar **la totalidad del código interno** `producto.codigo` de cada línea, sin truncamiento, incluyendo ceros iniciales y códigos alfanuméricos largos. No mostrar `…` en sustitución del final del código. El operador debe poder leerlo **en la tabla**, no depender de tooltip, hover o copiar valor oculto.
2. **Aumentar el ancho útil de la columna Producto** en escritorio de manera controlada, calculando el espacio de las otras columnas. Evitar que Producto quede con 60–100px mientras IVA, Unidad, Cantidad, Precio, Descuento, Subtotal y Acciones conservan anchos fijos. Se permite incrementar el `min-width` del detalle en **modo tabla** para garantizar un ancho mínimo razonable del producto, con **scroll horizontal LOCAL** en `.detalleScroll` cuando el viewport es menor; no scroll horizontal de toda la página. No reducir ni cortar controles de IVA, Cantidad, precios, descuentos, subtotal o acciones.
3. Si el código supera el ancho útil (p. ej. numérico de 15–20+ dígitos o alfanumérico extendido), **permitir quiebre de línea** dentro de su celda, con `overflow-wrap:anywhere` o equivalente y **sin** `white-space:nowrap`, `text-overflow:ellipsis` ni clipping en el elemento del código. Preferir una clase CSS **exclusiva para el código** para no alterar globalmente `small` de avisos de stock, estado o pendientes fiscales. La descripción puede seguir compactada a dos líneas como antes; el código debe aparecer íntegro. Si se muestran Código + GTIN, distinguirlos visualmente sin concatenar de forma que uno oculte al otro. No quitar ninguno si hoy existe.
4. El cambio de altura de fila por envolver códigos **no** debe romper la regla de PRO-331: 4 filas de producto totalmente visibles antes de scroll vertical local desde la quinta, con `ResizeObserver`, cabecera sticky en escritorio y buscador fuera del contenedor. Asegurar que el foco a Cantidad haga visible la fila dentro del scroll local.
5. En móvil/tablet `≤900px`, preservar tarjetas adaptadas al ancho sin `min-width:1028px` ni scroll lateral artificial; comprobar la cascada CSS de `.itemsCompacta .prod` / `.prod small`. En modo tabla `≥901px`, cabecera sticky, N°, nueve columnas y scroll local siguen accesibles.

## 3. Requisito B — foco en Cantidad tras agregar correctamente

**Cambio FUNCIONAL solicitado por cliente:** reemplaza expresamente la parte de PRO-331 que devolvía el cursor al buscador rápido después de alta aceptada. **NO** se trata de moverlo al buscador otra vez. Esta nueva regla es válida para el **alta rápida por código/GTIN/Enter/clic**, tanto una **nueva línea** como un **SKU ya existente** al que se aumenta cantidad.

1. Tras un alta rápida exitosa, esperar a que exista la fila actualizada, ubicar su `id=`cantidad-${clave}``, **dar foco a su input Cantidad y seleccionar el valor completo** para que el operador introduzca la cantidad directamente sin hacer clic. Si es una fila nueva la cantidad inicialmente es 1; si es una fila repetida, debe seleccionar la cantidad ya incrementada, sin sumar una unidad adicional por el foco.
2. Reutilizar o ajustar el mecanismo vigente `lineaAFocar` y `destinoFocoTrasAlta` con garantía de esperar montaje/actualización. Evitar que `volverAlBuscador` reprograme y sobreescriba el nuevo foco (doble `requestAnimationFrame` incluido). Mantener la búsqueda limpia y el campo de código utilizable cuando el operador vuelva a él.
3. **Selector avanzado:** mientras el diálogo `aria-modal` está abierto, preservar la edición de Cantidad dentro del diálogo (`CantidadAnadido`, E01) y nunca enviar foco al campo de fondo. Al cerrar, enfocar/seleccionar Cantidad de la última línea válida añadida o incrementada, respetando el contrato vigente.
4. **Producto con panel fiscal obligatorio:** el panel fiscal (con selección/validación) debe mantener la prioridad segura del foco mientras requiera completar datos; no forzar el cursor a Cantidad saltándose la intervención fiscal, ni hacer dos focos competidores. Al terminar ese flujo, permitir edición de Cantidad sin interferencias. Explicitar en entrega qué excepción quedó.
5. **Alta rechazada** por máximo variable `empresas.fe_max_lineas`, producto inhabilitado o validación: no cambiar Cantidad, ni enfocar una fila inexistente, ni abrir editor fiscal, ni anunciar «añadido». Preservar feedback correcto y la decisión sincrónica de PRO-339-R02, claves `clave` únicas, SKU repetido, doble escaneo con 1 o 2 cupos.
6. **Evitar robo de foco:** si hay trabajo asíncrono pendiente y el operador ya se movió manualmente a otro campo (Precio, IVA, Descuento, Tab, modal o diálogo), no forzar Cantidad tardíamente. Cualquier pedido de foco obsoleto debe cancelarse o desestimarse. **No introducir `focus()` en cada re-render** ni efectos laterales en el updater de React.
7. Preservar navegación teclado/accesibilidad y scroll local; al enfocar Cantidad en fila 5+, esta debe verse dentro del contenedor sin saltos de la página. En dispositivos táctiles el teclado numérico se abrirá según comportamiento del navegador (`inputMode="decimal"` ya existe).
8. **Compensación explícita de UX:** después del alta rápida, **el cursor deja de estar listo para el escaneo consecutivo** en el buscador; el operador deberá volver al buscador para el siguiente producto. No inventar shortcuts ni reasignación automática a buscador tras una cantidad digitada; son requisitos adicionales no solicitados.

## 4. Pruebas y compatibilidad: ESCRIBIR, NO EJECUTAR

Actualizar de forma controlada los casos de foco de PRO-331 previamente aprobados, con anotación clara de que PRO-341 **sustituye solo la regla foco**. No eliminar las pruebas del scroll, ordinal, protección de foco manual, N° de columnas, scanner/cero inicial, panel fiscal, tarjetas móviles ni PRO-339 sin revisar sus aserciones. Los casos anteriores que exigían `destinoFocoTrasAlta("rapido",false) === "buscador"` deben reflejar el nuevo contrato; esto **no** significa regresión en la ejecución fiscal.

Agregar casos fuente dirigidos para:
- SKU numeric 13/20+ dígitos, cero inicial, alfanumérico largo; código completo/GTIN visible; sin `text-overflow:ellipsis` ni `white-space:nowrap` en elemento específico; descripción compacta y avisos stock intactos.
- Escritorio `901,1024,1366` con Producto suficientemente ancho, controles íntegros y scroll horizontal local cuando sea necesario; móvil `360/768/900` con tarjetas sin scroll global y código completamente visible.
- 1/4/5 filas con código que ocupa 2–3 líneas y `ResizeObserver`, scroll vertical local.
- Código/GTIN+Enter/clic: nueva línea, Cantidad enfocada y valor seleccionado. SKU repetido: mismo número de líneas, cantidad incrementada y seleccionada. Dos altas consecutivas antes de render: clave y foco de última línea real.
- Límite por empresa 21/63/99: rechazo no cambia foco/clave, sin falsas confirmaciones; falta de NEX-078 no activa emisión.
- Selector avanzado: foco permanece en diálogo y al cerrar va a Cantidad correcta; producto con datos fiscales incompletos no pierde obligatoriedad/panel; movimiento manual a otro campo antes de foco tardío no es interceptado.
- Protecciones PRO-331 y PRO-339 de historial/campos/cálculos, sin tocar emisión.

**Pruebas escritas ≠ ejecutadas:** cero runner, tests, lint, typecheck, build, CI, SQL, migrations, PostgreSQL, Docker/VM, gateway, navegador del cliente o deploy. Si hay que modificar algún caso PRO331 existente para no dejarlo obsoleto, actualizar el caso completo y documentar el cambio; no falsear un test ni declarar corrida que no ocurrió.

## 5. Límites de cambios y entrega

**Ámbito preferente:** `app/(private)/facturas/nueva/page.module.css`, `page.tsx`, `lib/facturacion/detalle-factura-vista.ts`, suites fuente de ese módulo y de foco E01, casos nuevos de PRO-341 si procede, `scripts/casos-clientes/run.js` solo para registrar suite nueva (sin ejecutar). Evitar otros archivos. No cambiar `components/ui/lista-padrao` global ni PDF/KuDE.

**NO TOCAR:** backend, API, SQL, migraciones NEX-078, `empresas.fe_max_lineas`/límite comercial variable, FE/NCE, CDC/SIFEN, stock, impuestos/IVA, redondeo, precios, descuentos, permisos, historial o código interno de productos. **NO desarrollar PRO-340.**

**PROTOCOLO:** leer `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md` (si existe), issue PRO-341, esta orden y el archivo **COMPLETO y MÁS RECIENTE**, **uno por vez** antes de analizar/modificar cada uno. No eliminar controles sin aprobación. **Commit+push** en la branch de trabajo, SHA completo y lista de archivos; detallar nuevo foco, CSS, casos escritos vs ejecutados (0), excepción fiscal y riesgo de UX en scanner. **PARAR y solicitar auditoría independiente ChatGPT PRO-341-R01**. Ninguna siguiente issue ni deploy se inicia automáticamente.

**GATE DE PRODUCCIÓN INDEPENDIENTE:** PRO-339/NEX-078 aún pendiente de aplicación; activar versión que lea `fe_max_lineas` sin migration recusa TODA FE nueva con 422. Esta orden no levanta gate, ni autoriza SQL o deployment.
