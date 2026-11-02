# AUD-NEXIT-FE-DESKTOP-COMPACTO-R01 — Nueva factura desktop compacta

**Fecha:** 21/10/2026  
**Repositorio / branch:** `proceit-tech/distribuidora` / `feature/NEXIT-2026-001-banco-demo`  
**Commit funcional auditado:** `334ab9574c357049829016839cf25d40a09ff861`  
**Requisito:** `documentacao/definicoes/REQ-NEXIT-FE-DESKTOP-COMPACTO-2026-10-21.md`  
**Antecedente:** `documentacao/testes/AUD-NEXIT-KUDE-NCR-FE-UX-R02-2026-10-21.md`

## Método y límites

Se comprobaron el HEAD Git, el diff completo y los archivos reales afectados: `app/(private)/facturas/nueva/page.tsx`, `page.module.css`, `entrega-cliente.tsx`, los cuatro ficheros de pruebas `facturacion.casos.ts`, `rediseno.casos.ts`, `pagos.casos.ts`, `flujo-factura-ux.casos.ts`, y el progreso pertinente. Se leyeron `CLAUDE.md`, `documentacao/PROTOCOLO-IA.md` y los RN/CA del requisito. Se cotejó `app/globals.css` para criterios de box-sizing y ancho de menú.

**No se ejecutaron tests, navegador, VM, SQL, migrations ni deploy.** Las 46/0 comprobaciones UX, regresiones y TypeScript/ESLint focales son resultados declarados por Claude, **no reproducidos** por ChatGPT. Los tests de ancho calculan un ancho estimado por constantes de menú/márgenes; **no miden el scroll real ni un viewport de navegador**.

## Matriz resumida

| Requisito | Evidencia | Resultado |
|---|---|---|
| RN-01/RN-02 bandas compactas Operación y Cliente | `.workspace` es columna, `.cardHead` a 36px, `.cardBody` 10×12, `gridOperacion` minmax 150px | Conforme estático; alto real NO VERIFICADO |
| RN-03 cliente y entrega | Cliente/dirección/acciones en `bandaCliente`, única instancia `EntregaCliente`, opciones conservadas; `title` contiene ayuda fiscal | Conforme estático; legibilidad, tooltip/foco requieren browser |
| RN-04/RN-05 productos y búsqueda | Tabla ancho completo con `colgroup`, siete columnas fijas 766px + Producto flexible; controles y búsqueda conservados | Conforme estático; sin scroll horizontal a 1366/1600/1920 NO VERIFICADO |
| RN-06 pago tras productos | `MediosPago` sin cambios y decisión `disponibilidadPago` no modificada | Conforme estático |
| RN-07/RN-08 descuento y observaciones | Descuento general en banda de tabla, errores visibles, observaciones en `details` con estado `infoAdicional` persistente | Conforme estático |
| RN-09 barra resumen accesible | Barra `sticky bottom:0`; impuestos y pendientes en `details`; acción `Revisar y confirmar` movida a barra y retirada `barraMovil` | **NO CONFORME: F-001**; cobertura visual del sticky no verificada |
| RN-10 revisión/idempotencia | Cuerpo, controlador `crearFlujoRevision`, modal de revisión no modificados | Conforme estático |
| RN-11 errores | Advertencias de cliente, descuento, moneda, línea y pendientes siguen en JSX | Conforme estático; visual NO VERIFICADO |

## Hallazgo FE-UX-C03-F001 — MEDIA — revisión inaccesible a ancho <=1099 px

**Evidencia del código:**
- `app/(private)/facturas/nueva/page.module.css`, regla histórica alrededor de líneas 864–882: `@media (max-width: 1099px) { .accionRevisar { display:none; } .barraMovil { display:flex; } }`.
- En el commit C03 se eliminó del JSX el componente `barraMovil` y solo quedó un botón `Revisar y confirmar` en `barraResumen`, con clases `ui.primaryButton`, `estilos.accionRevisar` (alrededor de `page.tsx:1326`).
- Ninguna regla posterior anula `display:none` para `.accionRevisar` a ese ancho.

**Secuencia y consecuencia:** abrir `Nueva factura` con viewport <=1099px (ventana desktop reducida, tableta u otros); completar cliente, producto y pago; el botón de revisión es escondido por CSS y ya no existe barra móvil que lo reemplace. La pantalla no ofrece el flujo normal para finalizar la factura. No se necesita navegador para demostrar la contradicción de CSS+JSX, aunque la validación visual posterior sigue necesaria.

**Corrección mínima esperada:** retirar/ajustar la antigua regla `accionRevisar{display:none}` y la referencia huérfana de `barraMovil`, sin reintroducir barra doble ni otra emisión. Asegurar que en 1024/1099/1100 el botón permanezca visible/habilitado cuando corresponde; `Cancelar`, impuestos y errores deben continuar accesibles incluso con la barra distribuida en varias filas.

**Pruebas focales:** el CSS final para <=1099 no debe ocultar la única acción; comprobar que el JSX no tiene barra móvil ni clones, que `disabled={!puedeGuardar}` y `onClick={grabar}` permanecen y que los modales de revisión/cuerpo/idempotencia siguen idénticos. Añadir prueba sobre CSS de cascada efectiva, no solamente búsqueda del nuevo bloque; no hacer suite extensa.

## Riesgos no convertidos en defectos por falta de evidencia

1. **Overflow horizontal y altura de filas:** siete columnas suman 766px, pero la medición de ancho útil supone valores de menú y márgenes en vez de renderizar. La columna Acciones mide 120px y contiene hasta dos botones con margen de 10px; puede envolver en ciertas fuentes/zooms. La existencia y magnitud del problema es **NO VERIFICADA** sin captura DESPUÉS a 1366/1600/1920 y zoom real.
2. **Barra sticky:** depende del alto visible, de quiebres de línea y de paneles desplegados. `scroll-margin-bottom:110px` no demuestra por sí solo la ausencia de solapamiento si la barra supera esa altura. Validación por usuario, no corrección especulativa.
3. **Entrega:** la ayuda sobre domicilio fiscal se movió a `title` del `select`; contraste de acceso por teclado y lector de pantalla requiere prueba real. Las opciones conservan su dirección textual.

## Dictamen y siguiente gate

**R01 — CORRECCIÓN SOLICITADA exclusivamente F-001.** No hay otros defectos probados en el diff; la conformidad visual global sigue **PENDIENTE**.

Claude puede corregir solo la regla responsiva residual, realizar pruebas focales, push y PARAR para R02 de ChatGPT. No tocar KuDE FE/NCR, módulos fiscales, pagos, inventario, cálculos, SQL, migraciones ni VM; no homologar ni marcar Done.
