/**
 * PRO-331 (CASA MINGO, ETAPA 1) — Nueva factura: cuatro líneas visibles con rolagem local desde la quinta, columna N° (1..n, solo visual) y foco de vuelta al buscador
 * tras un alta rápida. Lógica REAL probada: helpers puros de detalle-factura-vista.ts y el controlador del buscador rápido (Enter, ceros iniciales, limpieza del texto).
 * El comportamiento en navegador (alto medido, rolagem, foco efectivo) NO se puede ejecutar aquí: se verifica el marcado y las reglas CSS; la revisión visual corresponde al responsable.
 * Casos ESCRITOS, NO EJECUTADOS en la entrega (restricción vigente: sin runner, lint, typecheck ni build).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { crearBuscadorRapido, MENSAJE_ENTER } from "@/lib/facturacion/busqueda-rapida";
import { soloDifierenCerosIniciales } from "@/lib/facturacion/codigo-producto";
import {
  altoMaximoDetalle, desplazamientoParaMostrar, destinoFocoTrasAlta, FILAS_VISIBLES_DETALLE, ID_BUSCADOR_PRODUCTOS, ordinalLinea, puedeVolverAlBuscador,
} from "@/lib/facturacion/detalle-factura-vista";
import { MAX_LINEAS } from "@/lib/facturacion/payload-fe";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");
const sinCom = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

type Prod = { id: string; codigo: string; gtin: string | null; descripcion: string };

export async function verificarCasosDetalleFacturaPro331(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  // ── 1. Cuatro visibles = SOLO presentación; el límite fiscal sigue en 999 ───────────────────────────────────────────────────────────────────────────
  igual("PRO331-01 cuatro líneas visibles y límite fiscal intacto (MAX_LINEAS = 999; ni 4 ni 21 limitan ítems)", [FILAS_VISIBLES_DETALLE, MAX_LINEAS], [4, 999]);

  // ── 2. Alto máximo del contenedor según cantidad de líneas (0/1/4/5/21/50) ────────────────────────────────────────────────────────────────────────
  igual("PRO331-02 con 0, 1 y 4 líneas NO hay límite de alto (sin rolagem vertical)", [altoMaximoDetalle(0, null, 0), altoMaximoDetalle(1, null, 0), altoMaximoDetalle(4, 200, 0)], [null, null, null]);
  igual("PRO331-03 desde la 5.ª línea el alto = inicio de la quinta (cabecera + 4 líneas reales) + bordes/barra horizontal; igual con 21 y 50 líneas", [altoMaximoDetalle(5, 236.4, 0), altoMaximoDetalle(21, 236.4, 2), altoMaximoDetalle(50, 236.4, 17)], [236, 238, 253]);
  igual("PRO331-04 filas de alto variable (stock, pendientes, panel fiscal abierto): el alto sigue a la medida real, sin recortar la 4.ª línea", [altoMaximoDetalle(6, 412, 0), altoMaximoDetalle(6, 980, 0)], [412, 980]);
  igual("PRO331-05 medidas inválidas (sin quinta, 0, negativa, NaN, Infinity) no fijan alto; un extra negativo o NaN se ignora", [altoMaximoDetalle(5, null, 0), altoMaximoDetalle(5, 0, 0), altoMaximoDetalle(5, -10, 0), altoMaximoDetalle(5, Number.NaN, 0), altoMaximoDetalle(5, Number.POSITIVE_INFINITY, 0), altoMaximoDetalle(5, 200, -4), altoMaximoDetalle(5, 200, Number.NaN)], [null, null, null, null, null, 200, 200]);

  // ── 3. Columna N°: posición visual 1..n ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const ordinales = (n: number) => Array.from({ length: n }, (_, i) => ordinalLinea(i));
    const esperado = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

    igual("PRO331-06 ordinales 1..n para 0/1/4/5/21/50 renglones", [0, 1, 4, 5, 21, 50].map((n) => JSON.stringify(ordinales(n)) === JSON.stringify(esperado(n))), [true, true, true, true, true, true]);

    // Tres líneas con claves internas 1, 2, 3; se quita la 2.ª: quedan N° 1 y 2 y las claves internas NO cambian (1 y 3).
    const lineas = [{ clave: 1 }, { clave: 2 }, { clave: 3 }].filter((l) => l.clave !== 2);

    igual("PRO331-07 al eliminar la fila 2 de 3 los ordinales se recalculan (1, 2) y la clave interna se conserva (1, 3): el índice no es ID", [lineas.map((_, i) => ordinalLinea(i)), lineas.map((l) => l.clave)], [[1, 2], [1, 3]]);
  }

  // ── 4. Desplazamiento local para mostrar la línea añadida/incrementada ───────────────────────────────────────────────────────────────────────────
  {
    const vista = { vistaArriba: 100, vistaAlto: 240, cabecera: 36 };

    igual("PRO331-08 línea ya visible: 0 (no mueve el scroll)", desplazamientoParaMostrar({ ...vista, filaArriba: 150, filaAbajo: 200 }), 0);
    igual("PRO331-09 línea nueva debajo del área visible (5.ª, 21.ª, 50.ª): baja exactamente lo necesario", desplazamientoParaMostrar({ ...vista, filaArriba: 330, filaAbajo: 380 }), 40);
    igual("PRO331-10 mismo SKU en una línea de arriba tapada por la cabecera sticky: sube hasta dejarla bajo la cabecera", desplazamientoParaMostrar({ ...vista, filaArriba: 60, filaAbajo: 110 }), -76);
    igual("PRO331-11 fila más alta que el área visible: se alinea arriba (bajo la cabecera)", desplazamientoParaMostrar({ ...vista, filaArriba: 300, filaAbajo: 700 }), 164);
    igual("PRO331-12 sin cabecera visible (vista apilada < 900 px, thead oculto): usa el borde superior del contenedor", desplazamientoParaMostrar({ vistaArriba: 0, vistaAlto: 200, cabecera: 0, filaArriba: -20, filaAbajo: 30 }), -20);
  }

  // ── 5. Destino del foco y no robar foco ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  igual("PRO331-13 destino del foco: rápido normal → buscador; rápido que abre panel fiscal → panel (requiere intervención); avanzado → Cantidad (E01, con o sin panel)", [destinoFocoTrasAlta("rapido", false), destinoFocoTrasAlta("rapido", true), destinoFocoTrasAlta("avanzado", false), destinoFocoTrasAlta("avanzado", true)], ["buscador", "panel", "cantidad", "cantidad"]);
  igual("PRO331-14 el foco solo vuelve al buscador si sigue en él o se perdió; si el operador está en Cantidad/Precio/Descuento/Tab/modal/panel no se le roba", [puedeVolverAlBuscador("buscador"), puedeVolverAlBuscador("ninguno"), puedeVolverAlBuscador("otro")], [true, true, false]);

  // ── 6. Escaneos consecutivos con el controlador REAL: Enter, ceros iniciales, mismo SKU dos veces, texto limpio ───────────────────────────────────────
  {
    const catalogo: Prod[] = [
      { id: "p1", codigo: "000123", gtin: "7840000000017", descripcion: "Producto ceros" },
      { id: "p2", codigo: "456", gtin: null, descripcion: "Producto 456" },
    ];
    const elegidos: string[] = [];
    let estado = { texto: "", aviso: "" };
    const ctl = crearBuscadorRapido<Prod>({
      buscar: async (q) => {
        const t = q.toLowerCase();
        const items = catalogo.filter((p) => p.codigo.toLowerCase().includes(t) || p.gtin === q || t.includes(p.codigo.replace(/^0+/, "")));

        return { items, total: items.length };
      },
      programar: () => null, // el debounce de la lista no interviene en el Enter directo
      cancelar: () => undefined,
      alCambiar: (e) => { estado = { texto: e.texto, aviso: e.aviso }; },
      habilitado: () => true,
      exacto: (p, t) => p.codigo.toLowerCase() === t.toLowerCase() || p.gtin === t,
      parecido: (p, t) => soloDifierenCerosIniciales(p.codigo, t),
      titulo: (p) => p.descripcion,
      alElegir: (p) => { elegidos.push(p.id); },
    });

    ctl.escribir("000123");
    await ctl.enter();
    const tras1 = { ...estado };

    ctl.escribir("000123");
    await ctl.enter();
    const tras2 = { ...estado };

    ctl.escribir("7840000000017");
    await ctl.enter();
    const tras3 = { ...estado };

    igual("PRO331-15 escaneos consecutivos con Enter: código con ceros iniciales, el MISMO SKU otra vez y su GTIN se eligen cada vez (la pantalla suma 1 a la línea existente) y el campo queda LIMPIO tras cada alta", [elegidos, tras1.texto, tras2.texto, tras3.texto, tras1.aviso], [["p1", "p1", "p1"], "", "", "", "«Producto ceros» añadido."]);

    ctl.escribir("123");
    await ctl.enter();
    igual("PRO331-16 «123» NO elige «000123» (solo difieren en ceros iniciales): no hay alta, el texto se conserva y el aviso exige intervención", [elegidos.length, estado.texto, estado.aviso], [3, "123", MENSAJE_ENTER.CODIGO_PARECIDO]);
  }

  // ── 7. Pantalla: marcado de la tabla de edición ───────────────────────────────────────────────────────────────────────────────────────────────────
  const pag = sinCom(leer("app/(private)/facturas/nueva/page.tsx"));
  const css = sinCom(leer("app/(private)/facturas/nueva/page.module.css"));
  const iDetalle = pag.indexOf('aria-labelledby="sec-detalle"');
  const iBuscador = pag.indexOf("<BuscadorProducto alElegir=");
  const iWrap = pag.indexOf("${estilos.tableWrap} ${estilos.detalleScroll}");
  const iFinTabla = pag.indexOf("</table>", iWrap);
  const tabla = pag.slice(iWrap, iFinTabla);
  const iAgregar = pag.indexOf("function agregar(");
  const agregar = pag.slice(iAgregar, pag.indexOf("const agregarRapido", iAgregar));
  const volver = pag.slice(pag.indexOf("function volverAlBuscador("), iAgregar);
  const selector = pag.slice(pag.indexOf("function SelectorProducto("), pag.indexOf("type ItemBusqueda"));

  cierto("PRO331-17 el buscador «Añadir producto…» queda FUERA del contenedor con rolagem (antes de él, en la misma tarjeta Detalle) y el contenedor es solo el de la tabla de edición", iDetalle > 0 && iBuscador > iDetalle && iWrap > iBuscador && !tabla.includes("<BuscadorProducto") && /ref=\{setContenedorDetalle\}/.test(tabla));
  cierto("PRO331-18 columna N° antes de Producto en colgroup, thead y tbody (ordinalLinea(i)), con texto accesible «Número de orden» y data-label para la vista apilada", /<col className=\{estilos\.colOrden\} \/>\s*<col className=\{estilos\.colProducto\} \/>/.test(tabla) && /<th scope="col" className=\{estilos\.orden\}><span aria-hidden="true">N°<\/span><span className="sr-only">Número de orden<\/span><\/th>\s*<th>Producto<\/th>/.test(tabla) && /<td className=\{estilos\.orden\} data-label="N°">\{ordinalLinea\(i\)\}<\/td>\s*<td className=\{estilos\.prod\} data-label="Producto">/.test(tabla));
  cierto("PRO331-19 colSpan ajustado a 9 columnas (fila vacía y panel fiscal), sin restos de 8", (tabla.match(/colSpan=\{9\}/g) ?? []).length === 2 && !/colSpan=\{8\}/.test(tabla) && (tabla.match(/<col className=\{estilos\.col/g) ?? []).length === 9);
  cierto("PRO331-20 la clave interna de la línea NO cambia (key={l.clave}, data-linea={l.clave}) y el ordinal no viaja al servidor ni al cálculo", /<Fragment key=\{l\.clave\}>/.test(tabla) && /<tr data-linea=\{l\.clave\}/.test(tabla) && !/ordinal/i.test(pag.slice(pag.indexOf("const cuerpoFactura = () => ({"), pag.indexOf("const cuerpoFactura = () => ({") + 3000)) && /resumenCalculo\(lineas\.map\(\(l\) => aLineaFE\(l, moneda\)\), descuentoGeneralFE\)/.test(pag));
  cierto("PRO331-21 el alto máximo se mide con las líneas reales (data-linea) y la QUINTA como corte; ResizeObserver lo recalcula (stock, panel fiscal, ancho) y se libera al desmontar", /querySelectorAll<HTMLTableRowElement>\("tbody > tr\[data-linea\]"\)/.test(pag) && /filas\[FILAS_VISIBLES_DETALLE\]/.test(pag) && /altoMaximoDetalle\(filas\.length, inicioQuinta, wrap\.offsetHeight - wrap\.clientHeight\)/.test(pag) && /new ResizeObserver\(medir\)/.test(pag) && /return \(\) => observador\.disconnect\(\)/.test(pag));
  cierto("PRO331-22 sin tope por este cambio: agregar no consulta FILAS_VISIBLES_DETALLE ni 21 ni 999 y el error de MAX_LINEAS sigue en payload-fe", !/FILAS_VISIBLES_DETALLE|\b21\b|MAX_LINEAS|999/.test(agregar) && /if \(e\.lineas\.length > MAX_LINEAS\) errores\.push/.test(leer("lib/facturacion/payload-fe.ts")));

  // ── 8. Pantalla: foco ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  cierto("PRO331-23 el buscador rápido usa agregarRapido (origen «rapido») y el selector avanzado sigue con agregar (origen por defecto «avanzado»)", /<BuscadorProducto alElegir=\{agregarRapido\}/.test(pag) && /const agregarRapido = \(p: Producto\) => \{ agregar\(p, "rapido"\); \};/.test(pag) && /alAgregar=\{agregar\}/.test(pag) && /function agregar\(p: Producto, origen: OrigenAlta = "avanzado"\): number \{/.test(pag));
  cierto("PRO331-24 alta rápida NUEVA: sin foco a Cantidad (lineaAFocar = null) y vuelta al buscador; con panel fiscal el panel conserva el foco", /const destino = destinoFocoTrasAlta\(origen, abrePanel\);/.test(agregar) && /if \(destino === "cantidad"\) lineaAFocar\.current = siguienteClave;\s*else \{\s*lineaAFocar\.current = null;\s*if \(destino === "buscador"\) volverAlBuscador\(siguienteClave\);\s*\}/.test(agregar));
  cierto("PRO331-25 mismo SKU por el buscador: suma una unidad a la línea existente (sumarUnaUnidad, sin duplicar) y vuelve al buscador", /const existente = lineas\.find\(\(l\) => l\.producto\.id === p\.id\);/.test(agregar) && /sumarUnaUnidad\(l\.cantidad\)/.test(agregar) && /if \(destinoFocoTrasAlta\(origen, false\) === "cantidad"\) lineaAFocar\.current = existente\.clave;\s*else \{ lineaAFocar\.current = null; volverAlBuscador\(existente\.clave\); \}/.test(agregar) && /return existente\.clave;/.test(agregar));
  cierto("PRO331-26 el buscador de productos tiene id estable y el foco vuelve SOLO desde volverAlBuscador (sin useEffect que robe el foco al re-renderizar), sin mover la página", /idCampo=\{ID_BUSCADOR_PRODUCTOS\}/.test(pag) && /id=\{idCampo\}/.test(pag) && (pag.match(/getElementById\(ID_BUSCADOR_PRODUCTOS\)/g) ?? []).length === 1 && /getElementById\(ID_BUSCADOR_PRODUCTOS\)/.test(volver) && /campo\.focus\(\{ preventScroll: true \}\)/.test(volver) && ID_BUSCADOR_PRODUCTOS === "buscador-productos-factura");
  cierto("PRO331-27 no roba foco: solo si el foco sigue en el buscador o se perdió (body), y nunca con el campo deshabilitado o desmontado", /puedeVolverAlBuscador\(activo === campo \? "buscador" : !activo \|\| activo === document\.body \? "ninguno" : "otro"\)/.test(volver) && /if \(!campo \|\| !campo\.isConnected \|\| campo\.disabled\) return;/.test(volver));
  cierto("PRO331-28 la búsqueda se limpia en el controlador tras elegir (texto vacío) y el buscador de productos permanece abierto para la siguiente lectura; Enter, GTIN y ceros iniciales intactos", /function seleccionar\(t: T\) \{\s*deps\.alElegir\(t\);\s*api\.escribir\(""\);/.test(leer("lib/facturacion/busqueda-rapida.ts")) && /mantenerAbierto\s*describir=/.test(pag) && /exacto=\{\(p, t\) => p\.codigo\.toLowerCase\(\) === t\.toLowerCase\(\) \|\| p\.gtin === t\}/.test(pag) && /parecido=\{\(p, t\) => soloDifierenCerosIniciales\(p\.codigo, t\)\}/.test(pag));
  cierto("PRO331-29 selector avanzado (E01) intacto: foco y selección en Cantidad al cerrar, campo de cantidad dentro del diálogo y retorno al filtro", /if \(lineaAFocar\.current === null \|\| selector !== null\) return;/.test(pag) && /campo\.focus\(\);\s*campo\.select\(\);/.test(pag) && /const clave = alAgregar\(p\); setUltimo/.test(selector) && /alTerminar=\{\(\) => document\.getElementById\("filtro-productos"\)\?\.focus\(\)\}/.test(selector));
  cierto("PRO331-30 panel fiscal intacto: se abre con el permiso para un producto incompleto, toma el foco al montarse y al cerrarse devuelve el foco al botón «Fiscal/Completar»", /if \(abrePanel\) setEditando\(siguienteClave\);/.test(agregar) && /el\?\.querySelector<HTMLElement>\("select, input"\)\?\.focus\(\{ preventScroll: true \}\)/.test(sinCom(leer("app/(private)/facturas/nueva/ajuste-fiscal-item.tsx"))) && /botonesFiscales\.current\.get\(clave\)\?\.focus\(\)/.test(pag));
  cierto("PRO331-31 la línea añadida/incrementada se muestra con rolagem LOCAL (scrollTop del contenedor, nunca scrollIntoView de la página) y solo si el contenedor rola", /if \(!wrap \|\| !fila \|\| wrap\.scrollHeight <= wrap\.clientHeight\) return;/.test(pag) && /if \(delta !== 0\) wrap\.scrollTop \+= delta;/.test(pag) && !/scrollIntoView/.test(pag.slice(pag.indexOf("function mostrarLineaEnDetalle("), iAgregar)));
  cierto("PRO331-32 stock insuficiente, pendientes fiscales y errores de Cantidad/Precio siguen visibles en su fila (no se esconden por el foco ni por la rolagem)", /<AvisoStockLinea aviso=\{avisoStock\}/.test(tabla) && /estilos\.pendienteLinea/.test(tabla) && /Mayor que 0, hasta 4 decimales/.test(tabla) && /aria-invalid=\{cantOk \? undefined : true\}/.test(tabla));

  // ── 9. CSS ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  cierto("PRO331-33 contenedor con rolagem local en ambos ejes (vertical por alto medido, horizontal cuando hace falta) y sin encadenar la rolagem a la página", /\.tableWrap\.detalleScroll \{\s*overflow: auto;\s*overscroll-behavior: contain;\s*\}/.test(css));
  cierto("PRO331-34 cabecera sticky dentro del contenedor, con fondo opaco y línea inferior", /\.detalleScroll \.itemsCompacta thead th \{\s*position: sticky;\s*top: 0;\s*z-index: 2;\s*background: #f4f8fa;\s*box-shadow: 0 1px 0 #dce6ed;\s*\}/.test(css));
  cierto("PRO331-35 N° angosta (48 px), centrada y tabular; ancho mínimo de la tabla compensado (980 + 48) y Unidad sigue sin partirse como 4.ª columna", /\.colOrden \{ width: 48px; \}/.test(css) && /\.detalleScroll \.itemsCompacta \{\s*min-width: 1028px;\s*\}/.test(css) && /\.itemsCompacta th\.orden,\s*\.itemsCompacta td\.orden \{[^}]*font-variant-numeric: tabular-nums;[^}]*text-align: center;/.test(css) && /\.itemsCompacta td:nth-child\(4\) \{\s*white-space: nowrap;/.test(css) && !/\.itemsCompacta td:nth-child\(3\)/.test(css));
  cierto("PRO331-36 vista apilada (< 900 px): N° en su propia franja con su etiqueta", /@media \(max-width: 900px\) \{[^@]*\.detalleScroll \.items:not\(\.itemsResumen\) td\.orden \{[^}]*grid-column: 1 \/ -1;/.test(css));
  cierto("PRO331-37 el modal Resumen NO cambia: su tabla sigue sin contenedor de rolagem propio, cabecera anclada al cuerpo del modal y sin la clase nueva", /\.resumenTabla \{\s*overflow: visible;\s*max-height: none;\s*\}/.test(css) && /\.resumenTabla \.itemsResumen th \{\s*position: sticky;/.test(css) && !/resumenTabla[^{]*detalleScroll|detalleScroll[^{]*resumen/i.test(css) && (pag.match(/estilos\.detalleScroll/g) ?? []).length === 1);

  return fallos;
}
