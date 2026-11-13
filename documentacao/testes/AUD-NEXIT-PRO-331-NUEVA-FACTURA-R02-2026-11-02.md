# AUD-NEXIT-PRO-331-R02 — Auditoría independiente de responsive (02/11/2026)

**Commit funcional:** [f6312bb95e3414a2a9e260650282c842995a23dd](https://github.com/proceit-tech/distribuidora/commit/f6312bb95e3414a2a9e260650282c842995a23dd)
**Issue Linear:** [PRO-331](https://linear.app/proceit/issue/PRO-331) · **GitHub:** [#13](https://github.com/proceit-tech/distribuidora/issues/13)
**Referencia de origen:** [AUD-NEXIT-PRO-331-R01](AUD-NEXIT-PRO-331-NUEVA-FACTURA-R01-2026-11-02.md), hallazgo único R01-F001.
**Veredicto:** **CONFORME en revisión estática R02.** Se cierra el hallazgo R01-F001 **solo en código**, sin afirmar homologación visual, ejecución ni despliegue.
**Siguiente orden de desarrollo autorizada:** **PRO-333 exclusivamente**, sin iniciar PRO-334/339.

## 1. Diff de R02 y cobertura de casos

El SHA modifica **exactamente dos archivos**:
- `app/(private)/facturas/nueva/page.module.css`
- `lib/facturacion/detalle-factura-vista.casos.ts`

Se corrigieron aserciones **PRO331-34 y PRO331-35**, se mantuvieron los 37 casos numerados originalmente, y se añadieron **PRO331-38..41**: **41 casos en total**, registrados en el runner heredado de R01 pero **ninguno ejecutado**. No se ejecutaron tests, runner, lint, typecheck, build, CI manual, SQL, PostgreSQL, VM, Docker, navegador, gateway ni despliegue. Las pruebas nuevas verifican reglas y estructura fuente, **no renderizado real** en dispositivos.

## 2. Hallazgo R01-F001 — CONFORME ESTÁTICAMENTE

**Causa anterior:** la regla `.detalleScroll .itemsCompacta { min-width: 1028px; }` era incondicional en el editor; al entrar en diseño de tarjetas `@media (max-width:900px)`, forzaba 1028 px de ancho a un viewport móvil.

**Corrección R02 inspeccionada en CSS completo (líneas 2406–2464):**
- `@media (min-width:901px)`: `min-width: 1028px` en tabla del editor, cabecera `thead th` sticky con fondo/borde, sin alterar el contenedor de scroll `overflow:auto`.
- `@media (max-width:900px)`: `.detalleScroll .itemsCompacta { width:100%; min-width:0; table-layout:auto; }` y `.prod { max-width:none; }`. La especificidad del selector de la nueva regla **supera** el `.itemsCompacta { min-width:980px; }` preexistente (líneas 2024–2026); por tanto no queda anchura mínima rígida de 980/1028 px en modo tarjetas del editor.
- Las reglas previas `@media (max-width:900px)` mantienen `thead display:none`, `table/tbody display:block`, `tr display:grid`, `td display:block` y controles en tarjetas. La nueva celda ordinal `N°` conserva `grid-column:1/-1`, visible y accesible antes de Producto.
- `page.tsx`, `detalle-factura-vista.ts` y el máximo fiscal `MAX_LINEAS=999` **no fueron modificados** en R02: se conservan el cálculo dinámico de las cuatro filas visibles, scroll local a partir de la quinta, buscador fuera del contenedor, foco seguro tras escaneo, modal de resumen, editor fiscal, GTIN y ceros iniciales.
- No hay mutación de código de emisión, payload, servidor, base de datos, informes, KuDE ni estados SIFEN.

**Casos nuevos PRO331-38..41:** se comprueba por lectura de CSS la separación tablet/móvil y desktop; son aserciones estructurales. No prueban dimensiones reales a 360/768/900/901 px ni zoom: esto sigue pendiente de una sesión de homologación autorizada. La combinación `max-width:900px` y `min-width:901px` sigue el cambio de modo ya usado por la página; no se introduce una regresión nueva en los anchos solicitados.

## 3. Límites y decisión de secuencia

- **Conforme estáticamente R02:** sin necesidad de un R03 a partir del hallazgo R01-F001. **NO significa que CASA MINGO ya vea el cambio**, ni autoriza implementación/migration/deploy o pruebas en el cliente.
- **PRO-331 permanece `In Review`**, no `Done`, hasta validar visualmente el editor en escritorio 901+/1366, tablet 900/768 y celular 360, con 1/4/5/21 líneas, scroll, mensajes de stock, teclado/lector y foco. Esa validación es distinta de la auditoría estática.
- **Libera exclusivamente desarrollo PRO-333** (orden numérico de Documentos electrónicos) para Claude, según la [orden maestra CASA MINGO 02/11](../ordens/ORD-CLAUDE-NEXIT-CASA-MINGO-FACTURA-DOCUMENTOS-2026-11-02.md), ETAPA 2, y [GitHub #14](https://github.com/proceit-tech/distribuidora/issues/14). Leer archivo completo y actual **uno por vez**, localizar la query SQL que ordena, hacer solo cambios mínimos a `ORDEN.numero` y/o control de orden si es necesario, respetar paginación, datos fiscales, ceros, ACL, multiempresa y desempates. Casos fuente escritos **sin ejecutar**; commit+push SHA completo, **PARAR para auditoría ChatGPT PRO-333-R01**.
- **PRO-334 y PRO-339 no se activan**. PRO-338 sigue independiente con gates NEX-077/no homologada; PRO-298 y PRO-336 requieren proveedor/operador.
