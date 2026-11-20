# AUD-NEXIT-PRO-331 — Auditoría independiente R01 / Nueva factura

**Fecha:** 02/11/2026
**Commit funcional auditado:** [3829f4c2aaf45a2bc2c668ac0c8eabc7260300dd](https://github.com/proceit-tech/distribuidora/commit/3829f4c2aaf45a2bc2c668ac0c8eabc7260300dd)
**Linear:** [PRO-331](https://linear.app/proceit/issue/PRO-331) · **GitHub:** [#13](https://github.com/proceit-tech/distribuidora/issues/13)
**Método:** revisión estática del diff, archivos completos actuales en el SHA y compatibilidad con CSS responsive/flujo de búsqueda, sin ejecución de pruebas, navegador, compilación ni SQL.
**VEREDICTO:** **R01 NO CONFORME — UN hallazgo visual de regresión responsiva (R01-F001).** Los demás objetivos principales cumplen estáticamente. **No autorizar PRO-333 ni PRO-334 todavía.**

## 1. Alcance verificado

El commit modifica **7 archivos**, exactamente:
- `app/(private)/facturas/nueva/page.module.css`
- `app/(private)/facturas/nueva/page.tsx`
- `lib/facturacion/cantidad-e01.casos.ts`
- `lib/facturacion/detalle-factura-vista.casos.ts` (nuevo, **37 casos PRO331-01..37**)
- `lib/facturacion/detalle-factura-vista.ts` (nuevo, helpers puros)
- `lib/facturacion/flujo-factura-ux.casos.ts`
- `scripts/casos-clientes/run.js`

**Todos los 37 casos están escritos y NO ejecutados.** El commit además los **registró en el runner compartido** `scripts/casos-clientes/run.js`; por tanto NO son casos aislados fuera del runner. No se verificó compatibilidad en ejecución de todas las suites previas. No se hicieron test, lint, typecheck, build, CI manual, SQL, PostgreSQL, VM, Docker, gateway real, navegador ni deploy.

## 2. Cumplimientos estáticos

### Numeración de líneas — conforme

`page.tsx:1316–1345,1351–1360,1465–1469`: nueva columna `N°` antes de Producto, encabezado accesible, ordinal derivado de `ordinalLinea(i)` (posición actual 1..n); nueve columnas / `colSpan=9` para vacío y panel. `key={l.clave}` y `data-linea={l.clave}` conservan identidad. El payload `cuerpoFactura` sigue serializando únicamente producto, cantidad, precio y ajustes, sin ordinal visual. El tope fiscal `MAX_LINEAS=999` no cambia. La petición condicional de 21 sigue independiente (PRO-339).

### Foco al buscador — conforme en código, pendiente de navegador

`page.tsx:341–374,403–419,803–812,854–899,1311–1314`: el buscador de código tiene ID estable; `agregarRapido` distingue del selector avanzado. En alta rápida normal y en suma de SKU duplicado, `volverAlBuscador` vuelve al campo (si el foco no fue llevado por el operador a otro control), con `preventScroll`. El controlador actual `busqueda-rapida.ts` limpia texto tras selección, mantiene Enter/GTIN y la distinción de ceros iniciales. El selector avanzado conserva foco a Cantidad al cerrarse. `ajuste-fiscal-item.tsx:36–41` enfoca el primer control del panel fiscal cuando el producto necesita intervención, sin devolver inmediatamente al buscador. No se puede verificar timing real de requestAnimationFrame ni Tab/screen reader sin navegador.

### Cuatro filas visibles / scroll local — implementación presente, con defecto responsive

`page.tsx:814–836,838–852,1306–1315` observa dimensiones reales de tabla, fija altura por inicio de quinta fila cuando hay 5+ ítems y conserva buscador fuera del contenedor. CSS `.tableWrap.detalleScroll { overflow:auto }` y cabecera sticky en desktop; `ResizeObserver` recalcula alto por texto y avisos de stock. No se modificó la modal Resumen. El comportamiento visual efectivo sigue pendiente de navegador.

## 3. Hallazgo R01-F001 — MEDIA/ALTA DE UX: ancho mínimo de escritorio invade vista móvil en tarjetas

**Evidencia de código:**
- `page.module.css:834–894`: a `max-width:900px`, la tabla de ítems se convierte en **tarjetas apiladas** (`thead display:none`, `table/tbody display:block`, `tr display:grid`), diseño previo para evitar scroll horizontal en tablet y móvil.
- La nueva regla global `page.module.css:2423–2425` establece **`.detalleScroll .itemsCompacta { min-width: 1028px; }`**, sin límite de viewport ni reversión bajo `@media (max-width: 900px)`.
- El contenedor `page.module.css:2406–2409` tiene `overflow:auto`. Por tanto, a 360px/768px el elemento de tarjetas intenta medir **al menos 1028px**, forzando un desplazamiento horizontal donde el diseño anterior apilaba y ajustaba las tarjetas al ancho disponible. Además, el cálculo de alto y el contenido del campo N° se miden sobre una tabla artificialmente ancha, no sobre tarjetas de ancho real.
- **La prueba de fuente PRO331-35 incluso exige `min-width:1028px` incondicional; PRO331-36 solo comprueba la existencia del CSS ordinal móvil y no verifica que el ancho de las tarjetas se adapte al viewport.** Así, los 37 casos no cubren esta regresión.

**Corrección R02 EXCLUSIVAMENTE para este hallazgo:**
1. Mantener ancho mínimo adecuado **solo en modo tabla escritorio**, cuando las columnas realmente lo necesitan; **anularlo para `max-width:900px`** en el editor `detalleScroll`, dejando la tabla/tarjetas al ancho del contenedor, sin scroll horizontal innecesario. Confirmar también el `table-layout` heredado y reglas `display:block/grid` móviles para no cortar controles ni contenido ni ordinal.
2. Mantener `N°` visible en franja anterior al producto en tarjetas móviles, respetando teclado/contraste, y el scroll **vertical** a partir del quinto ítem. Con 1–4 ítems no debe haber vertical propio; conservar el buscador fuera del scroll. Cabecera sticky únicamente en modo de tabla cuando esté visible.
3. Actualizar los casos fuente relevantes (sobre todo PRO331-35/36) para verificar que el mínimo de 1028 no aplica en el modo tarjeta y el ordinal móvil sigue legible; incluir casos estructurales para 360/768/900/901 px y zoom, sin afirmar que se ejecutó en navegador.
4. **No reescribir** el scroll dinámico, foco, buscador, tabla de impuestos, cálculos, NCE, KuDE, stock, serialización, CSS global ni otros módulos; no imponer 21/4 como límite de emisión. No modificar el runner si no es imprescindible para corregir la causa.

**Aceptación:** escritorio mantiene columna N°, sticky, cuatro filas y scroll local desde la quinta; tablet/móvil muestra tarjetas al ancho del contenedor sin desplazamiento horizontal artificial de 1028 px; ordinal y controles visibles; ninguna función fiscal ni foco cambian.

## 4. Bloqueos y secuencia

- Este es un diagnóstico de **CSS estático fundamentado en cascada/breakpoint**; no se ejecutaron navegador ni tests, por tanto no afirmar que el defecto se reprodujo visualmente en dispositivo físico. Aun así, la regla `min-width` contradice el layout responsivo preexistente y debe eliminarse del modo tarjeta antes de dar conforme.
- **PRO-331: `In Review` — R02 pendiente.** No marcar `Done`, no desplegar.
- **Única orden activa:** correctivo **PRO-331-R02 limitado a F001**.
- **PRO-333/334/339:** permanecer **Todo/en cola**, no iniciar antes de auditoría ChatGPT R02.
- Claude debe leer `CLAUDE.md`, orden principal y este informe; abrir versión completa y más reciente **de un archivo por vez**, editar solo el CSS del editor y los casos fuente estrictamente necesarios, escribir casos sin ejecutarlos; commit/push SHA y PARAR.
- No ejecutar pruebas, lint/typecheck/build, SQL, VM, Docker, gateway ni deploy. La homologación visual real y el despliegue de CASA MINGO siguen independientes.
