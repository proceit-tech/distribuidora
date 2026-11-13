# AUDITORÍA INDEPENDIENTE — PRO-341-R01 / Código completo y foco en Cantidad

**Fecha:** 10/11/2026  
**Commit funcional auditado:** [8c7f47b8ffca7597e79bfc4f286b9a63917d6022](https://github.com/proceit-tech/distribuidora/commit/8c7f47b8ffca7597e79bfc4f286b9a63917d6022)  
**Issue Linear:** [PRO-341](https://linear.app/proceit/issue/PRO-341) · **GitHub:** [#18](https://github.com/proceit-tech/distribuidora/issues/18)  
**Auditor:** ChatGPT. Método: inspección de **diff y código completo actual** en SHA; trazado de llamadas `BuscadorProducto` → `BuscadorRapido` → `crearBuscadorRapido` → `agregarRapido` → `agregar`; CSS de detalle, auxiliares, suite de regresión y contratos PRO-331 / PRO-339. **CERO tests, runner, lint, typecheck, build, CI, SQL, PostgreSQL, navegador real, VM, Docker, gateway o deploy ejecutados.**  
**VEREDICTO:** **R01 NO CONFORME por R01-F001 (mensaje de éxito falso tras alta bloqueada).** Código visible y foco en Cantidad **CONFORMES ESTÁTICAMENTE**, pendientes de homologación visual. **ÚNICA ORDEN DE CORRECCIÓN:** PRO-341-R02; PRO-340 no autorizada.

## 1. Archivos cambiados y casos escritos

El commit cambia **exactamente 9 archivos**:
1. `app/(private)/facturas/nueva/page.tsx` — marcado de SKU/GTIN, foco hacia Cantidad;
2. `app/(private)/facturas/nueva/page.module.css` — código completo y ancho mínimo de la tabla desktop;
3. `lib/facturacion/detalle-factura-vista.ts` — contrato de foco;
4. `lib/facturacion/detalle-factura-vista.casos.ts` — casos PRO331 afectados por nuevo requisito;
5. `lib/facturacion/cantidad-e01.casos.ts` — foco del selector avanzado;
6. `lib/facturacion/flujo-factura-ux.casos.ts` — contratos de la pantalla;
7. `lib/facturacion/limite-lineas.casos.ts` — coherencia con PRO-339;
8. `lib/facturacion/codigo-foco-pro341.casos.ts` — **46 nuevos casos PRO341-01..46**;
9. `scripts/casos-clientes/run.js` — registro de nueva suite, sin ejecución.

Los identificadores PRO341-10, 11, 12 se generan dinámicamente con el bucle `for (const [n,maximo] of [["10",21],["11",63],["12",99]])`, por lo que no aparecen como literales individuales; **el conjunto sí abarca 01..46**. Modelos del editor y aserciones de texto **no ejercitan el componente React real** ni su DOM/render/foco/scroll. No fueron ejecutados los casos PRO341 ni los anteriores retocados.

## 2. Requisito A — visualizar código interno completo: CONFORME ESTÁTICAMENTE

- `page.tsx:1417–1424` muestra `producto.codigo` literalmente en `small.codigoProducto > span.codigoValor` y `GTIN` opcional en otro `span.gtinValor`; preserva ceros, alfanuméricos y `title` como ayuda adicional, no como única forma de leer código.
- `page.module.css:2406–2412` sobreescribe la regla genérica `.itemsCompacta .prod small` de `:1430–1436` con selector más específico: `overflow:visible`, `text-overflow:clip`, `white-space:normal`, `overflow-wrap:anywhere`; el código no se trunca con `…` y puede ocupar varias líneas. La descripción `strong` conserva el límite de dos líneas y los avisos stock/fiscales no son el objeto de esa sobrescritura.
- `page.module.css:2435–2457`: `@media (min-width:901px)` mantiene cabecera sticky y exige `min-width:1164px`; las otras columnas de anchura fija suman aproximadamente 964px, reservando al menos 200px teóricos para Producto y liberando `max-width:360px`. A 901/1024px, la tabla puede desplazarse HORIZONTALMENTE dentro de `.detalleScroll {overflow:auto}`; hasta 900px continúan tarjetas con `min-width:0`.
- El cálculo de cuatro filas visibles de PRO-331 usa altura real/quinta fila y `ResizeObserver`, por lo que el wrap del código es compatible según fuente. **Sin browser no se puede afirmar dimensión efectiva, cero overflow global ni legibilidad con zoom o datos reales**.

## 3. Requisito B — foco en Cantidad tras alta rápida: CONFORME ESTÁTICAMENTE

- `detalle-factura-vista.ts:59–64` actualiza explícitamente `destinoFocoTrasAlta("rapido",false)="cantidad"`, reemplazando la preferencia antigua de PRO-331. Sigue `panel` para alta rápida con pendientes fiscales obligatorios; el selector avanzado conserva `cantidad`.
- `page.tsx:911–956` pide foco solo por altas **aceptadas**: nueva fila o SKU existente incrementado. Rechazo por máximo retorna `ALTA_BLOQUEADA` antes de reservar clave y cancela pedido; se preserva la ref sincrónica de líneas y claves únicas de PRO-339-R02.
- `page.tsx:826–855`: un `useEffect` dependiente de `lineas/selector` espera al DOM de la fila, enfoca/selecciona `Cantidad` tras buscar `id=cantidad-<clave>`, desestima petición obsoleta si el operador cambió de control durante alta rápida y espera a cerrar el modal avanzado. El enfoque rápido usa `preventScroll` y el helper de scroll local; panel fiscal obligatorio mantiene su foco independiente.
- El selector avanzado conserva `CantidadAnadido` dentro de diálogo `aria-modal`; la búsqueda de producto por código/GTIN y con ceros iniciales no fue modificada.
- **Advertencia de experiencia de usuario:** después de una alta rápida aceptada el foco ya no queda en el buscador para el siguiente escaneo, por decisión expresa del cliente. No crear retorno automático no solicitado.
- Falta confirmar interacción real con teclado, lector, clicks, latencia del navegador, scroll con 5+ filas, foco y Strict Mode cuando el responsable autorice prueba visual.

## 4. R01-F001 — MEDIA/ALTA UX: el buscador anuncia «añadido» aunque `agregar` rechazó la línea

**RUTA DE CÓDIGO CONCRETA:**
1. `page.tsx:927–932`: `agregar(p,"rapido")` detecta `!puedeAgregarLinea(...,maxLineasFE)`, muestra `avisoLimiteLineas`, limpia pedido de foco y retorna **`ALTA_BLOQUEADA`** sin modificar líneas.
2. `page.tsx:956`: `const agregarRapido = (p:Producto) => { agregar(p,"rapido"); };` **descarta el resultado**. `page.tsx:528–550` declara `BuscadorProducto.alElegir` como `void` y lo transmite al buscador genérico.
3. `page.tsx:343–375` declara `BuscadorRapido.alElegir` como callback `void` (también se usa para clientes y vendedores). `lib/facturacion/busqueda-rapida.ts:54–59,99–103`: `seleccionar(t)` llama `deps.alElegir(t)`, después **siempre** ejecuta `api.escribir("")` y `emitir({aviso:`«${deps.titulo(t)}» añadido.`})` independientemente del resultado. El aviso se renderiza en `page.tsx:461` con `role=status`. Ocurre al escoger de la lista por clic, Enter con opción seleccionada o búsqueda directa por código/GTIN.
4. Resultado: **contradicción visible** entre `role=alert` de la sección Detalle (límite excedido) y `role=status` de la búsqueda (producto «añadido»). El usuario puede dar por registrada una línea que NO aparece en la factura. A diferencia del selector avanzado, que sí verifica `clave === ALTA_BLOQUEADA` antes de mostrar éxito, el buscador rápido **no tiene ese contrato**.
5. **PRO341-10/11/12** ejercitan un **modelo** del rechazo y comprueban contador y foco, NO la cadena real `agregarRapido` → `BuscadorRapido` → controlador ni el aviso. `PRO341-40` solo comprueba que `agregar` devuelve el sentinel antes del foco. Por eso las aserciones fuente podrían indicar conformidad aunque la UI muestre éxito falso.
6. El backend sigue imponiendo el límite efectivo por empresa (PRO-339) y no hay prueba de un documento fiscal emitido fuera de cupo; el defecto es de **feedback de la interfaz**, pero afecta la confianza operacional al registrar ítems.

**ESTADO:** hallazgo **CONFIRMADO por lectura de código**, no reproducido en navegador porque no hubo autorización para ejecutarlo.

### Correctivo único PRO-341-R02 (sin reescribir foco ni CSS)

- Modificar el **contrato del resultado de selección** del buscador de productos, desde `agregar`/`agregarRapido` hasta `BuscadorRapido`/`crearBuscadorRapido`, para distinguir `ACEPTADA` (nueva o SKU existente incrementado) vs `BLOQUEADA` (`ALTA_BLOQUEADA`), y emitir «añadido» **solo** con resultado aceptado. Para el rechazo, mostrar un aviso claro en español (máximo efectivo), sin falso éxito ni anuncio a lectores de pantalla; mantener foco en buscador y sin cambiar Cantidad. Propagar el rechazo de forma tipada/inequívoca, no basarse en truthiness de un sentinel negativo.
- **Preservar el comportamiento existente del buscador genérico para clientes y vendedores**, que también usan `BuscadorRapido` y cuyos callbacks actuales son `void`; no convertir sus selecciones en errores ni cambiar sus flujos por accidente. Si se elige contrato opcional de resultado, diseñar compatibilidad explícita.
- Garantizar que las **tres entradas** (click opción vigente, Enter en opción resaltada y Enter de búsqueda directa async) apliquen la misma condición, con `tokenLista/tokenDirecta` y política de descarte de respuestas tardías intactos; no duplicar selección ni alterar ceros iniciales/GTIN.
- No borrar sin permiso otras funcionalidades: éxito correcto para alta real, mensaje de rechazo legible, reset de búsqueda conforme a decisión UX, y aviso de máximo visible sin mensajes contradictorios.
- Escribir casos nuevos del **controlador real** `crearBuscadorRapido` con callback aceptada y rechazada; modelos independientes no bastan. Casos de 21/63/99, una vaga/doble lectura, SKU ya existente con máximo alcanzado (aceptado), vías clic/Enter/Enter async, respuesta tardía invalidada, compatibilidad cliente/vendedor, foco Cantidad para aceptado/panel fiscal y rechazo sin foco. **No ejecutar**.
- **No tocar** CSS de PRO-341, layouts, foco a Cantidad, `lineasActuales`/claves, PRO-339 backend ni NEX-078, NCE, KuDE, stock, SIFEN, permisos, precios/IVA, `MAX_LINEAS=999`. Si otra ruta resulta imprescindible, justificar antes de expandir la orden.

## 5. Gate de seguridad y secuencia

**PRO-341 permanece `In Review`, no Done/homologada.** Única orden activa: **PRO-341-R02**, con cambios mínimos y parada tras commit+push para auditoría ChatGPT. PRO-340 (pantalla ADMIN) **no autorizada**. **NEX-078 aún no aplicada**: habilitar la versión dependiente sin esa columna causa HTTP 422 para **toda FE nueva**. Su aplicación/validación y deployment requieren aprobación independiente, backup/preflight y ventana controlada; esta auditoría no autoriza SQL, tests, VM, despliegue ni operación real.

**Archivos a consultar completos y actuales, uno por vez:** `lib/facturacion/busqueda-rapida.ts`, `app/(private)/facturas/nueva/page.tsx`, `lib/facturacion/limite-lineas.ts`, las suites relevantes (PRO341 y casos de búsqueda rápida), `scripts/casos-clientes/run.js` si requiere registrar casos. No ejecutar runner, lint, typecheck, build, CI, SQL/migrations, PostgreSQL, Docker/VM, browser cliente ni gateway.
