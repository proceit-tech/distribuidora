# ORDEN CORRECTIVA — PRO-331-R02 / Nueva factura

**Fecha:** 02/11/2026
**Commit R01 auditado:** `3829f4c2aaf45a2bc2c668ac0c8eabc7260300dd`
**Referencias:** [Auditoría ChatGPT R01](../testes/AUD-NEXIT-PRO-331-NUEVA-FACTURA-R01-2026-11-02.md) · [Linear PRO-331](https://linear.app/proceit/issue/PRO-331) · [GitHub #13](https://github.com/proceit-tech/distribuidora/issues/13).
**Verdicto R01:** No conforme por **UN** hallazgo de responsive. Todos los demás requisitos están conformes estáticamente; no reimplementarlos.

## Problema que debe corregirse (R01-F001)

En `app/(private)/facturas/nueva/page.module.css:2423–2425`, la regla global
```css
.detalleScroll .itemsCompacta { min-width: 1028px; }
```
obliga a la tabla a medir al menos **1028px** incluso en tablet/móvil (**<=900px**), donde ya existe un diseño responsive con `thead display:none`, `table/tbody display:block` y `tr display:grid`. Esa anchura del modo escritorio genera scroll horizontal artificial y rompe la disposición de tarjetas adaptadas al viewport. Los casos fuente PRO331-35/36 no verifican este conflicto, y PRO331-35 afirma que el min-width debe ser incondicional.

## Instrucción precisa

1. Leer primero el `CLAUDE.md`, el protocolo IA y la auditoría íntegra. Traer la **versión completa y más reciente** de cada archivo, **uno por vez**, antes de modificarlo.
2. Corregir **solo CSS responsive local del editor de Nueva factura**, de modo que la tabla desktop pueda conservar su ancho técnico mínimo cuando haga falta y, en `max-width:900px`, los productos en tarjetas **no** tengan un mínimo artificial de 1028px y queden al ancho disponible. Revisar también interacción de `table-layout:fixed` con `display:block/grid`, sin reescribir el layout original; garantizar que las tarjetas y sus inputs se puedan usar a 360 y 768px, así como a breakpoint 900px. En 901px, modo tabla desktop mantiene scroll horizontal LOCAL si el ancho es insuficiente.
3. Conservar el ordinal N° (visible arriba del producto en modo tarjeta), scroll vertical propio desde el quinto ítem (0–4 sin scroll interno vertical), buscador fuera del scroll, sticky header solo en presentación tabular, comportamiento de foco/Enter/GTIN/ceros, selector avanzado, editor fiscal, stock y modal Resumen.
4. Actualizar **solamente los casos fuente necesarios** para corregir la aserción PRO331-35 que exige `min-width:1028px` en todas las vistas y ampliar cobertura para estructura CSS de 360/768/900/901px; los casos de pruebas no son evidencia de navegador. No realizar cambios de integración con runner salvo necesidad imprescindible, no añadir funcionalidades.
5. NO tocar `MAX_LINEAS=999`; petición de 21 corresponde a PRO-339. NO tocar facturación, API, SQL, fiscal, CDC, KuDE, PRO-338, PRO-333/334/339, CSS general, bases ni otros módulos.

## Entrega

**PROHIBIDO ejecutar** tests, casos fuente, lint, typecheck, build, CI manual, SQL, migrations, PostgreSQL, VM, Docker, gateway, navegador de cliente o deploy.

Publicar **un commit+push focal R02**, informar SHA completo y todos los archivos alterados, qué caso fuente se añadió/corrigió y que hubo **cero ejecuciones**. **PARAR inmediatamente para auditoría independiente ChatGPT PRO-331-R02.** No comenzar PRO-333 ni PRO-334 hasta ese parecer.

**Estado actual:** PRO-331 In Review, NO homologada; PRO-333 y PRO-334 en cola.
