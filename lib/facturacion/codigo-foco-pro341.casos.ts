/**
 * PRO-341-R01 (CASA MINGO, 10/11/2026) — Nueva factura: código de producto COMPLETO en la tabla y foco en Cantidad tras un alta rápida.
 * Pedido del cliente: «El código de producto no se visualiza todo…» y «al cargar los productos en la factura … se va directamente en cantidad el cursor».
 *
 * - Requisito A (CSS/marcado): código interno y GTIN completos (sin ellipsis/nowrap/recorte, con quiebre), Producto con ancho útil garantizado en modo tabla
 *   (scroll horizontal LOCAL), tarjetas ≤ 900 px sin mínimo artificial; cuatro filas visibles y rolagem local de PRO-331 intactas.
 * - Requisito B (foco): SUSTITUYE la vuelta al buscador de PRO-331. Lógica REAL probada: destinoFocoTrasAlta y puedeEnfocarCantidad con un MODELO del editor que replica
 *   agregar() (ref sincrónica PRO-339-R02, SKU repetido, máximo por empresa, claves únicas) y el efecto de foco (pedido único, descartado si el operador se movió).
 *   El foco efectivo en navegador NO se ejecuta aquí: se inspecciona el código real de page.tsx; la revisión visual corresponde al responsable.
 *
 * Empresas con máximo 21/63/99 son SINTÉTICAS. Casos ESCRITOS, NO EJECUTADOS en la entrega (restricción vigente: sin runner, lint, typecheck ni build).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { destinoFocoTrasAlta, FILAS_VISIBLES_DETALLE, ID_BUSCADOR_PRODUCTOS, puedeEnfocarCantidad, puedeVolverAlBuscador, type OrigenAlta } from "@/lib/facturacion/detalle-factura-vista";
import { agregarSiCabe, ALTA_BLOQUEADA, mensajeAltaBloqueada, puedeAgregarLinea } from "@/lib/facturacion/limite-lineas";
import { MAX_LINEAS } from "@/lib/facturacion/payload-fe";
import { sumarUnaUnidad } from "@/lib/formato/cantidad-campo";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");
const sinCom = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/.*$/gm, "");

type Fila = { clave: number; productoId: string; cantidad: string };

/**
 * Modelo del editor (mismo contrato que page.tsx::agregar + efecto de foco): el borrador vive en una ref sincrónica; `render()` representa el efecto que corre tras el
 * render con la fila ya montada. `activo` es el id del elemento con foco («buscador», «cantidad-N», «precio-N», «panel», «dialogo», «body»).
 */
function editorFoco(maximo: number | null, iniciales: Fila[] = [], incompletos: ReadonlySet<string> = new Set()) {
  let actual = iniciales;
  let siguiente = iniciales.reduce((m, l) => Math.max(m, l.clave), 0) + 1;
  let pedido: number | null = null;
  let origenPedido: OrigenAlta = "avanzado";
  let selectorAbierto = false;
  let activo = "buscador";
  let seleccion: string | null = null;
  let focos = 0;
  const avisos: string[] = [];

  const agregar = (productoId: string, origen: OrigenAlta): number => {
    const existente = actual.find((l) => l.productoId === productoId);

    if (existente) {
      actual = actual.map((l) => (l.clave === existente.clave ? { ...l, cantidad: sumarUnaUnidad(l.cantidad) ?? l.cantidad } : l));
      if (destinoFocoTrasAlta(origen, false) === "cantidad") { pedido = existente.clave; origenPedido = origen; }

      return existente.clave;
    }
    if (!puedeAgregarLinea(actual.length, maximo)) {
      avisos.push(mensajeAltaBloqueada(maximo));
      pedido = null;

      return ALTA_BLOQUEADA;
    }

    const clave = siguiente;

    siguiente = clave + 1;
    actual = agregarSiCabe(actual, { clave, productoId, cantidad: "1" }, maximo);

    const abrePanel = incompletos.has(productoId);
    const destino = destinoFocoTrasAlta(origen, abrePanel);

    if (destino === "cantidad") { pedido = clave; origenPedido = origen; }
    else { pedido = null; activo = "panel"; } // el panel fiscal toma el foco al montarse

    return clave;
  };

  const render = () => {
    if (pedido === null || selectorAbierto) return;

    const fila = actual.find((l) => l.clave === pedido);

    if (!fila) return;

    const clave = pedido;

    pedido = null;
    if (origenPedido === "rapido") {
      const foco = activo === `cantidad-${clave}` ? "cantidad" : activo === "buscador" ? "buscador" : activo === "body" ? "ninguno" : "otro";

      if (!puedeEnfocarCantidad(foco)) return;
    }
    activo = `cantidad-${clave}`;
    seleccion = fila.cantidad;
    focos += 1;
  };

  return {
    agregar, render, avisos,
    lineas: () => actual,
    foco: () => activo,
    seleccion: () => seleccion,
    focos: () => focos,
    pendiente: () => pedido,
    mover: (id: string) => { activo = id; },
    abrirSelector: () => { selectorAbierto = true; activo = "dialogo"; },
    cerrarSelector: () => { selectorAbierto = false; activo = "body"; },
  };
}

const filas = (n: number): Fila[] => Array.from({ length: n }, (_, i) => ({ clave: i + 1, productoId: `p-${i + 1}`, cantidad: "1" }));

/** Ancho (px) de una columna `.colX { width: Npx; }`: vale la ÚLTIMA declaración del archivo (cascada). */
function anchoColumna(css: string, clase: string): number {
  const todas = [...css.matchAll(new RegExp(`\\.${clase} \\{ width: (\\d+)px; \\}`, "g"))];

  return todas.length ? Number(todas[todas.length - 1][1]) : Number.NaN;
}

export async function verificarCasosCodigoFocoPro341(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  // ── 1. Reglas puras del foco ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  igual("PRO341-01 destino tras alta aceptada: rápido normal → Cantidad (sustituye «buscador» de PRO-331); rápido con panel fiscal → panel; avanzado → Cantidad",
    [destinoFocoTrasAlta("rapido", false), destinoFocoTrasAlta("rapido", true), destinoFocoTrasAlta("avanzado", false), destinoFocoTrasAlta("avanzado", true)], ["cantidad", "panel", "cantidad", "cantidad"]);
  igual("PRO341-02 el pedido de foco a Cantidad se aplica desde el buscador, la misma Cantidad o sin foco (body); se descarta si el operador está en otro control",
    [puedeEnfocarCantidad("buscador"), puedeEnfocarCantidad("cantidad"), puedeEnfocarCantidad("ninguno"), puedeEnfocarCantidad("otro")], [true, true, true, false]);
  igual("PRO341-03 la vuelta al buscador (solo para el alta rechazada) conserva su protección contra robo de foco", [puedeVolverAlBuscador("buscador"), puedeVolverAlBuscador("ninguno"), puedeVolverAlBuscador("otro")], [true, true, false]);

  // ── 2. Modelo: alta rápida nueva / SKU repetido / altas consecutivas ─────────────────────────────────────────────────────────────────────────────────
  {
    const ed = editorFoco(null);
    const c = ed.agregar("p-a", "rapido");

    ed.render();
    igual("PRO341-04 código/GTIN + Enter (o clic) con línea NUEVA: una fila, foco en su Cantidad con «1» seleccionado; el foco NO vuelve al buscador", [c, ed.lineas().length, ed.foco(), ed.seleccion()], [1, 1, "cantidad-1", "1"]);

    ed.mover("buscador");
    const c2 = ed.agregar("p-a", "rapido");

    ed.render();
    igual("PRO341-05 mismo SKU por el buscador: MISMA cantidad de filas, cantidad incrementada a 2 y seleccionada en la Cantidad de ESA fila", [c2, ed.lineas().length, ed.lineas()[0].cantidad, ed.foco(), ed.seleccion()], [1, 1, "2", "cantidad-1", "2"]);

    ed.render();
    ed.render();
    igual("PRO341-06 re-renders posteriores no vuelven a enfocar ni suman unidades (pedido único, se consume al usarse; el foco no suma cantidad)", [ed.focos(), ed.lineas()[0].cantidad, ed.pendiente()], [2, "2", null]);
  }
  {
    const ed = editorFoco(null, filas(3));
    const a = ed.agregar("x", "rapido");
    const b = ed.agregar("y", "rapido");

    ed.render();
    igual("PRO341-07 dos altas rápidas antes del re-render: claves distintas y el foco va a la Cantidad de la ÚLTIMA línea real", [a, b, ed.lineas().length, ed.foco(), ed.focos()], [4, 5, 5, "cantidad-5", 1]);
  }
  {
    const ed = editorFoco(null, filas(2));

    ed.agregar("z", "rapido");
    ed.agregar("p-1", "rapido");
    ed.render();
    igual("PRO341-08 SKU nuevo y luego SKU existente antes del re-render: el foco va a la fila incrementada (última acción) con su cantidad seleccionada", [ed.lineas().length, ed.foco(), ed.seleccion()], [3, "cantidad-1", "2"]);
  }
  {
    const ed = editorFoco(null, filas(6));

    ed.agregar("nuevo", "rapido");
    ed.render();
    igual("PRO341-09 alta rápida con 6 líneas (fila 7, dentro de la rolagem local): foco a Cantidad de la 7.ª", [ed.lineas().length, ed.foco()], [7, "cantidad-7"]);
  }

  // ── 3. Modelo: rechazo por máximo de la empresa (21/63/99) ─────────────────────────────────────────────────────────────────────────────────────────
  for (const [n, maximo] of [["10", 21], ["11", 63], ["12", 99]] as const) {
    const ed = editorFoco(maximo, filas(maximo));
    const r = ed.agregar("otro", "rapido");

    ed.render();
    igual(`PRO341-${n} máximo ${maximo} lleno: alta rápida de SKU nuevo rechazada (ALTA_BLOQUEADA), sin fila nueva, sin foco en fila inexistente; el cursor sigue en el buscador y hay aviso del máximo (no «añadido»)`,
      [r, ed.lineas().length, ed.foco(), ed.focos(), ed.avisos], [ALTA_BLOQUEADA, maximo, "buscador", 0, [mensajeAltaBloqueada(maximo)]]);
  }
  {
    const ed = editorFoco(21, filas(20));
    const a = ed.agregar("n1", "rapido");
    const b = ed.agregar("n2", "rapido");

    ed.render();
    igual("PRO341-13 1 cupo y doble escaneo antes del re-render: entra solo el primero, el segundo se rechaza y CANCELA el pedido pendiente (no hay dos focos ni foco tardío); clave no consumida",
      [a, b, ed.lineas().length, ed.foco(), ed.focos(), ed.pendiente()], [21, ALTA_BLOQUEADA, 21, "buscador", 0, null]);

    const c = ed.agregar("p-3", "rapido");

    ed.render();
    igual("PRO341-14 en el máximo exacto, el SKU existente sí se incrementa y recibe el foco (sin fila nueva ni aviso nuevo)", [c, ed.lineas().length, ed.foco(), ed.seleccion(), ed.avisos.length], [3, 21, "cantidad-3", "2", 1]);
  }
  {
    const ed = editorFoco(63, filas(61));
    const a = ed.agregar("n1", "rapido");
    const b = ed.agregar("n2", "rapido");

    ed.render();
    igual("PRO341-15 2 cupos y doble escaneo: ambas entran con claves únicas y el foco va a la última (63)", [a !== b, ed.lineas().length, new Set(ed.lineas().map((l) => l.clave)).size, ed.foco()], [true, 63, 63, "cantidad-63"]);
  }

  // ── 4. Modelo: robo de foco, selector avanzado y panel fiscal ──────────────────────────────────────────────────────────────────────────────────────
  {
    const ed = editorFoco(null, filas(2));

    ed.agregar("nuevo", "rapido");
    ed.mover("precio-1");
    ed.render();
    ed.render();
    igual("PRO341-16 el operador se movió a Precio (o IVA, Descuento, Tab) antes del efecto: el pedido se descarta y NO se aplica después en otro render", [ed.foco(), ed.focos(), ed.pendiente()], ["precio-1", 0, null]);
  }
  {
    const ed = editorFoco(null, filas(1));

    ed.agregar("nuevo", "rapido");
    ed.mover("body");
    ed.render();
    igual("PRO341-17 foco perdido (body) al momento del efecto: Cantidad de la línea nueva recibe el foco", ed.foco(), "cantidad-2");
  }
  {
    const ed = editorFoco(null, filas(1));

    ed.abrirSelector();
    ed.agregar("a1", "avanzado");
    ed.agregar("a2", "avanzado");
    ed.render();
    const conDialogo = ed.foco();

    ed.cerrarSelector();
    ed.render();
    igual("PRO341-18 selector avanzado: con el diálogo abierto el foco NO sale al fondo; al cerrar va a la Cantidad de la última línea añadida", [conDialogo, ed.foco(), ed.seleccion()], ["dialogo", "cantidad-3", "1"]);
  }
  {
    const ed = editorFoco(null, filas(1), new Set(["incompleto"]));

    ed.agregar("incompleto", "rapido");
    ed.render();
    igual("PRO341-19 producto fiscalmente incompleto (con permiso): el panel fiscal conserva el foco obligatorio; no hay pedido a Cantidad ni dos focos competidores", [ed.foco(), ed.focos(), ed.pendiente(), ed.lineas().length], ["panel", 0, null, 2]);

    ed.mover("buscador");
    ed.agregar("p-1", "rapido");
    ed.render();
    igual("PRO341-20 terminado el panel, la siguiente alta rápida vuelve a llevar el foco a Cantidad sin interferencias", ed.foco(), "cantidad-1");
  }

  // ── 5. Pantalla: código completo (marcado) ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  const pag = sinCom(leer("app/(private)/facturas/nueva/page.tsx"));
  const css = sinCom(leer("app/(private)/facturas/nueva/page.module.css"));
  const iWrap = pag.indexOf("${estilos.tableWrap} ${estilos.detalleScroll}");
  const tabla = pag.slice(iWrap, pag.indexOf("</table>", iWrap));
  const iProd = tabla.indexOf('<td className={estilos.prod} data-label="Producto">');
  const celdaProd = tabla.slice(iProd, tabla.indexOf('<td data-label="IVA">', iProd));

  cierto("PRO341-21 la celda Producto muestra el código en un elemento EXCLUSIVO (.codigoProducto) con código y GTIN en spans distintos (ninguno oculta al otro); el title se conserva como ayuda extra",
    /<small className=\{estilos\.codigoProducto\} title=\{`\$\{l\.producto\.codigo\}\$\{l\.producto\.gtin \? ` · GTIN \$\{l\.producto\.gtin\}` : ""\}`\}>/.test(celdaProd)
    && /<span className=\{estilos\.codigoValor\}>\{l\.producto\.codigo\}<\/span>/.test(celdaProd)
    && /\{l\.producto\.gtin \? <span className=\{estilos\.gtinValor\}> · GTIN \{l\.producto\.gtin\}<\/span> : null\}/.test(celdaProd));
  cierto("PRO341-22 el código se muestra TAL CUAL (ceros iniciales, alfanumérico): sin slice/substring/trim/padStart/Number/parseInt sobre producto.codigo en la celda",
    !/producto\.codigo\.(slice|substring|substr|trim|padStart|replace)|Number\(l\.producto\.codigo|parseInt\(l\.producto\.codigo/.test(celdaProd));
  cierto("PRO341-23 la descripción sigue compacta (strong con title) y los avisos de stock y pendientes fiscales siguen en la misma celda, tras el código",
    /<strong title=\{l\.producto\.descripcion\}>\{l\.producto\.descripcion\}<\/strong>/.test(celdaProd) && celdaProd.indexOf("codigoProducto") < celdaProd.indexOf("estilos.pendienteLinea") && celdaProd.indexOf("codigoProducto") < celdaProd.indexOf("<AvisoStockLinea"));
  cierto("PRO341-24 el lector de códigos sigue igual: exacto por código/GTIN y ceros iniciales con soloDifierenCerosIniciales", /exacto=\{\(p, t\) => p\.codigo\.toLowerCase\(\) === t\.toLowerCase\(\) \|\| p\.gtin === t\}/.test(pag) && /parecido=\{\(p, t\) => soloDifierenCerosIniciales\(p\.codigo, t\)\}/.test(pag));

  // ── 6. CSS: sin ellipsis en el código, ancho útil de Producto, modos tabla/tarjeta ─────────────────────────────────────────────────────────────────
  const reglaCodigo = /\.itemsCompacta \.prod small\.codigoProducto \{([^}]*)\}/.exec(css)?.[1] ?? "";
  const seccion331 = css.slice(css.indexOf(".tableWrap.detalleScroll {"));
  const iTabla = seccion331.indexOf("@media (min-width: 901px) {");
  const iTarjeta = seccion331.indexOf("@media (max-width: 900px) {");
  const modoTabla = iTabla >= 0 && iTarjeta > iTabla ? seccion331.slice(iTabla, iTarjeta) : "";
  const modoTarjeta = iTarjeta >= 0 ? seccion331.slice(iTarjeta) : "";

  cierto("PRO341-25 el elemento del código NO tiene ellipsis, nowrap ni recorte: white-space normal, text-overflow clip, overflow visible y quiebre overflow-wrap:anywhere",
    reglaCodigo !== "" && /white-space: normal;/.test(reglaCodigo) && /text-overflow: clip;/.test(reglaCodigo) && /overflow: visible;/.test(reglaCodigo) && /overflow-wrap: anywhere;/.test(reglaCodigo) && !/nowrap|ellipsis|hidden/.test(reglaCodigo));
  cierto("PRO341-26 la anulación es más específica que la regla genérica (.itemsCompacta .prod small) y va DESPUÉS en el archivo; la regla genérica y las de stock/pendientes siguen intactas (no se toca small global)",
    css.indexOf(".itemsCompacta .prod small.codigoProducto {") > css.indexOf(".itemsCompacta .prod small {") && /\.itemsCompacta \.prod small \{[^}]*white-space: nowrap;/.test(css)
    && /\.itemsCompacta \.prod small\.pendienteLinea \{\s*white-space: normal;/.test(css) && /\.itemsCompacta \.prod small\.stockOk \{\s*white-space: normal;/.test(css) && !/(^|\})\s*small\s*\{/.test(css));
  {
    const antes = css.slice(0, css.indexOf(".itemsCompacta .prod small.codigoProducto {"));
    const profundidad = (antes.match(/\{/g) ?? []).length - (antes.match(/\}/g) ?? []).length;

    cierto("PRO341-27 la regla del código está FUERA de media queries (profundidad de llaves 0): vale en tabla (≥ 901 px) y en tarjetas (≤ 900 px)", antes.length > 0 && profundidad === 0);
  }

  const fijas = ["colOrden", "colIva", "colUnidad", "colCantidad", "colPrecio", "colDescuento", "colSubtotal", "colAcciones"].map((c) => anchoColumna(css, c));
  const sumaFijas = fijas.reduce((a, b) => a + b, 0);
  const minimoTabla = Number(/\.detalleScroll \.itemsCompacta \{\s*min-width: (\d+)px;\s*\}/.exec(modoTabla)?.[1] ?? Number.NaN);
  const productoCon = (contenedor: number) => Math.max(contenedor, minimoTabla) - sumaFijas;

  igual("PRO341-28 columnas fijas vigentes (N° 48, IVA 150, Unidad 88, Cantidad 96, Precio 140, Descuento 190, Subtotal 120, Acciones 132 = 964) y mínimo de tabla 1164 → 200 px útiles para Producto (antes ~64)", [fijas, sumaFijas, minimoTabla, minimoTabla - sumaFijas], [[48, 150, 88, 96, 140, 190, 120, 132], 964, 1164, 200]);
  igual("PRO341-29 escritorio 901 / 1024 / 1366 / 1600 px de contenedor: Producto nunca baja de 200 px; con más ancho toma TODO el sobrante (ningún control fijo se reduce)", [901, 1024, 1366, 1600].map(productoCon), [200, 200, 402, 636]);
  igual("PRO341-30 scroll horizontal LOCAL cuando el contenedor es menor que la tabla (901/1024 px) y ninguno a 1366 px", [901, 1024, 1366].map((w) => w < minimoTabla), [true, true, false]);
  cierto("PRO341-31 el scroll horizontal ocurre en .detalleScroll (overflow:auto, overscroll contain), nunca en la página; Producto sin tope de 360 px en modo tabla y colProducto sigue auto",
    /\.tableWrap\.detalleScroll \{\s*overflow: auto;\s*overscroll-behavior: contain;\s*\}/.test(css) && /\.detalleScroll \.itemsCompacta \.prod \{\s*max-width: none;\s*\}/.test(modoTabla) && /\.colProducto \{ width: auto; \}/.test(css));
  cierto("PRO341-32 móvil/tablet 360 / 768 / 900 px (tarjetas): sin mínimo artificial (min-width 0, width 100%), sin anchos fijos de 3+ dígitos y la celda Producto ocupa toda la tarjeta, así el código completo cabe partiéndose",
    /\.detalleScroll \.itemsCompacta \{\s*width: 100%;\s*min-width: 0;\s*table-layout: auto;\s*\}/.test(modoTarjeta) && !/(?:min-)?width:\s*\d{3,}px/.test(modoTarjeta) && /\.detalleScroll \.itemsCompacta \.prod \{\s*max-width: none;\s*\}/.test(modoTarjeta) && /\.items:not\(\.itemsResumen\) td\.prod \{\s*grid-column: 1 \/ -1;/.test(css));
  cierto("PRO341-33 el mínimo de tabla existe UNA vez, solo en modo tabla, y la cabecera sticky sigue allí", (css.match(/min-width: 1164px/g) ?? []).length === 1 && !/1028px/.test(css) && /position: sticky;/.test(modoTabla) && !/position: sticky/.test(modoTarjeta));
  cierto("PRO341-34 código numérico de 13 / 22 dígitos, con ceros iniciales o alfanumérico largo sin espacios: puede ocupar 2–3 líneas (sin line-clamp, max-height ni height en el elemento del código; quiebre dentro de la palabra permitido)",
    !/line-clamp|max-height|height:|word-break: keep-all/.test(reglaCodigo) && /\.itemsCompacta \.prod strong,\s*\.itemsCompacta \.prod small \{\s*overflow-wrap: anywhere;/.test(css));

  // ── 7. Filas de varias líneas: cuatro visibles y rolagem desde la quinta (PRO-331) ─────────────────────────────────────────────────────────────────
  cierto("PRO341-35 1/4/5 filas con código en 2–3 líneas: el alto se sigue midiendo con las filas REALES (quinta como corte) y ResizeObserver recalcula al cambiar el alto",
    FILAS_VISIBLES_DETALLE === 4 && /filas\[FILAS_VISIBLES_DETALLE\]/.test(pag) && /new ResizeObserver\(medir\)/.test(pag) && /observador\.observe\(tabla\)/.test(pag));

  // ── 8. Pantalla: foco a Cantidad (código real) ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const iEfecto = pag.indexOf("const claveFoco = lineaAFocar.current;");
  const efecto = pag.slice(iEfecto, pag.indexOf("}, [selector, lineas]);", iEfecto));
  const iAgregar = pag.indexOf("function agregar(");
  const agregar = pag.slice(iAgregar, pag.indexOf("const agregarRapido", iAgregar));

  cierto("PRO341-36 el efecto de foco corre tras el render con la fila montada (deps [selector, lineas]), consume el pedido ANTES de enfocar y no hace nada sin pedido o con el selector abierto",
    iEfecto > 0 && /if \(claveFoco === null \|\| selector !== null\) return;/.test(efecto) && /if \(!campo\) return;\s*lineaAFocar\.current = null;/.test(efecto) && efecto.indexOf("lineaAFocar.current = null;") < efecto.indexOf("campo.focus("));
  cierto("PRO341-37 alta rápida: solo si el foco sigue en el buscador / en esa Cantidad / perdido (puedeEnfocarCantidad); luego focus sin mover la página, select() del valor y rolagem LOCAL a la fila",
    /if \(origenFoco\.current === "rapido"\) \{/.test(efecto) && /activo\.id === ID_BUSCADOR_PRODUCTOS \? "buscador"/.test(efecto) && /if \(!puedeEnfocarCantidad\(foco\)\) return;\s*campo\.focus\(\{ preventScroll: true \}\);\s*campo\.select\(\);\s*mostrarLineaEnDetalle\(claveFoco\);/.test(efecto) && !/scrollIntoView/.test(efecto));
  cierto("PRO341-38 selector avanzado (E01) sin el filtro del alta rápida: focus + select de Cantidad al cerrar", /return;\s*\}\s*campo\.focus\(\);\s*campo\.select\(\);\s*$/.test(efecto.trimEnd() + "\n"));
  cierto("PRO341-39 agregar: SKU repetido y línea nueva piden foco a Cantidad registrando el origen; el alta aceptada ya NO llama volverAlBuscador (solo el rechazo)",
    /if \(destinoFocoTrasAlta\(origen, false\) === "cantidad"\) \{ lineaAFocar\.current = existente\.clave; origenFoco\.current = origen; \}/.test(agregar)
    && /if \(destino === "cantidad"\) \{ lineaAFocar\.current = siguienteClave; origenFoco\.current = origen; \}\s*else lineaAFocar\.current = null;/.test(agregar)
    && (agregar.match(/volverAlBuscador\(/g) ?? []).length === 1 && /if \(origen === "rapido"\) volverAlBuscador\(ALTA_BLOQUEADA\);/.test(agregar));
  cierto("PRO341-40 alta rechazada: limpia el pedido de foco y retorna ALTA_BLOQUEADA ANTES de reservar clave, abrir panel o pedir Cantidad",
    /setAvisoLimiteLineas\(mensajeAltaBloqueada\(maxLineasFE\)\);\s*lineaAFocar\.current = null;/.test(agregar) && agregar.indexOf("return ALTA_BLOQUEADA;") < agregar.indexOf("const siguienteClave = claveSiguiente.current;") && agregar.indexOf("return ALTA_BLOQUEADA;") < agregar.indexOf("if (abrePanel) setEditando(siguienteClave);") && agregar.indexOf("return ALTA_BLOQUEADA;") < agregar.indexOf("lineaAFocar.current = siguienteClave;"));
  cierto("PRO341-41 sin efectos en actualizadores de React ni focus en cada render: ningún focus/lineaAFocar dentro de aplicarLineas((ls) => …), y sin setTimeout de foco",
    !/aplicarLineas\(\(ls\) => [^;]*(focus|lineaAFocar|origenFoco|volverAlBuscador)/.test(pag) && !/setTimeout\([^)]*focus/.test(pag) && (pag.match(/campo\.focus\(/g) ?? []).length === 3);
  cierto("PRO341-42 PRO-339-R02 intacta: borrador y clave en refs sincrónicas, aplicarLineas fija el valor, y la decisión usa lineasActuales.current",
    /const nuevas = cambio\(lineasActuales\.current\);\s*lineasActuales\.current = nuevas;\s*setLineas\(nuevas\);/.test(pag) && /const lineas = lineasActuales\.current;/.test(agregar) && /claveSiguiente\.current = siguienteClave \+ 1;/.test(agregar));
  cierto("PRO341-43 panel fiscal obligatorio: con abrePanel se abre (setEditando) y no se pide Cantidad; el editor fiscal sigue tomando el foco al montarse",
    /if \(abrePanel\) setEditando\(siguienteClave\);/.test(agregar) && /el\?\.querySelector<HTMLElement>\("select, input"\)\?\.focus\(\{ preventScroll: true \}\)/.test(sinCom(leer("app/(private)/facturas/nueva/ajuste-fiscal-item.tsx"))));
  cierto("PRO341-44 Cantidad del selector avanzado (CantidadAnadido) se edita dentro del diálogo y al terminar vuelve al filtro; el input de fondo conserva id y teclado decimal",
    /<CantidadAnadido [\s\S]*?alTerminar=\{\(\) => document\.getElementById\("filtro-productos"\)\?\.focus\(\)\}/.test(pag) && /campo\.current\?\.focus\(\)/.test(sinCom(leer("app/(private)/facturas/nueva/cantidad-anadido.tsx"))) && /id=\{`cantidad-\$\{l\.clave\}`\}\s*inputMode="decimal"/.test(tabla));
  cierto("PRO341-45 el buscador sigue limpio y usable al volver (id estable, mantenerAbierto, controlador limpia el texto tras elegir); sin atajo nuevo que devuelva el foco tras digitar la cantidad",
    /idCampo=\{ID_BUSCADOR_PRODUCTOS\}/.test(pag) && /mantenerAbierto\s*describir=/.test(pag) && /deps\.alElegir\(t\);\s*api\.escribir\(""\);/.test(leer("lib/facturacion/busqueda-rapida.ts")) && !/onKeyDown=\{[^}]*ID_BUSCADOR_PRODUCTOS/.test(tabla) && ID_BUSCADOR_PRODUCTOS === "buscador-productos-factura");
  igual("PRO341-46 límite fiscal común intacto (MAX_LINEAS = 999) y cuatro filas visibles no son tope", [MAX_LINEAS, FILAS_VISIBLES_DETALLE], [999, 4]);

  return fallos;
}
