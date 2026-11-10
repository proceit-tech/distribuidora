/**
 * PRO-331 (CASA MINGO) — Nueva factura: presentación de la tabla de detalle EDITABLE y foco tras un alta rápida. Solo PRESENTACIÓN y FOCO:
 * no cambia líneas, claves internas, cálculo, payload, stock ni el límite fiscal de ítems (MAX_LINEAS = 999 en payload-fe.ts sigue intacto).
 *
 * - Cuatro líneas de producto visibles: con 5 o más, la tabla rola en vertical DENTRO de su contenedor (cabecera sticky); el buscador queda fuera.
 *   «Cuatro» es solo la cantidad de filas visibles, NUNCA un tope de ítems.
 * - Columna N°: posición visual 1..n según el orden actual de la lista; no es ID ni clave de la línea y no viaja al servidor.
 * - Foco: PRO-341 (pedido expreso de CASA MINGO, 10/11/2026) SUSTITUYE la regla de PRO-331 que devolvía el cursor al buscador. Un alta correcta desde el buscador rápido
 *   (código, GTIN, Enter o clic en la lista), sea línea NUEVA o mismo SKU incrementado, lleva el foco a Cantidad de ESA línea con su valor seleccionado; el selector avanzado
 *   conserva su comportamiento (foco a Cantidad al cerrar) y un alta que abre el panel fiscal deja el foco en ese panel (excepción: requiere intervención).
 *   Un alta RECHAZADA (máximo de la empresa) no enfoca ninguna fila: el cursor sigue en el buscador.
 */

/** Filas de producto visibles en la tabla de edición antes de rolar. NO limita la cantidad de ítems de la factura. */
export const FILAS_VISIBLES_DETALLE = 4;

/** id del campo «Añadir producto por código, GTIN o descripción» (buscador rápido de la Nueva factura). */
export const ID_BUSCADOR_PRODUCTOS = "buscador-productos-factura";

/** Posición visual (1, 2, 3…) de la línea según su índice actual en la lista; tras quitar una línea, las siguientes se renumeran solas. */
export const ordinalLinea = (indice: number): number => indice + 1;

/**
 * Alto máximo (px) del contenedor de la tabla de detalle.
 * `inicioQuinta`: distancia entre el borde superior de la tabla y el de la QUINTA línea de producto (= cabecera + cuatro líneas reales, con su alto variable:
 * stock, pendientes fiscales, descuentos, panel fiscal abierto). `extraContenedor`: bordes y barra horizontal del contenedor.
 * Con 4 o menos líneas (o sin medida válida) devuelve null = sin límite, sin rolagem vertical.
 */
export function altoMaximoDetalle(cantidadLineas: number, inicioQuinta: number | null, extraContenedor: number): number | null {
  if (cantidadLineas <= FILAS_VISIBLES_DETALLE) return null;
  if (inicioQuinta === null || !Number.isFinite(inicioQuinta) || inicioQuinta <= 0) return null;

  return Math.round(inicioQuinta + (Number.isFinite(extraContenedor) && extraContenedor > 0 ? extraContenedor : 0));
}

/**
 * Desplazamiento vertical (px, + baja / − sube) que el contenedor debe aplicar para que la línea recién añadida o incrementada quede a la vista bajo la cabecera sticky.
 * 0 si ya está visible. Una fila más alta que el área visible se alinea arriba. Solo mueve el scroll LOCAL de la tabla, nunca la página.
 */
export function desplazamientoParaMostrar(v: { filaArriba: number; filaAbajo: number; vistaArriba: number; vistaAlto: number; cabecera: number }): number {
  const arriba = v.vistaArriba + Math.max(0, v.cabecera);
  const abajo = v.vistaArriba + v.vistaAlto;

  if (v.filaArriba < arriba || v.filaAbajo - v.filaArriba > abajo - arriba) return v.filaArriba - arriba;
  if (v.filaAbajo > abajo) return v.filaAbajo - abajo;

  return 0;
}

/** Origen del alta: buscador rápido (código/GTIN/Enter/clic) o selector avanzado (diálogo multi-alta). */
export type OrigenAlta = "rapido" | "avanzado";

/** A dónde va el foco tras un alta correcta. PRO-341: «buscador» dejó de ser destino de un alta aceptada (solo el rechazo deja el cursor en el buscador). */
export type DestinoFoco = "cantidad" | "panel";

/**
 * - avanzado → «cantidad» (E01: al cerrar el selector, foco y selección en Cantidad de la última línea añadida; sin cambios).
 * - rápido con panel fiscal abierto (producto fiscalmente incompleto y permiso de ajuste) → «panel»: requiere intervención; el panel toma el foco y no se lo quita.
 * - rápido normal (nuevo o mismo SKU sumado) → «cantidad» (PRO-341, sustituye «buscador» de PRO-331): foco y selección en Cantidad de la línea añadida/incrementada.
 */
export function destinoFocoTrasAlta(origen: OrigenAlta, abrePanelFiscal: boolean): DestinoFoco {
  if (origen === "avanzado") return "cantidad";

  return abrePanelFiscal ? "panel" : "cantidad";
}

/** Dónde está el foco del documento al momento de devolverlo. */
export type FocoActual = "buscador" | "ninguno" | "otro";

/**
 * Solo se devuelve el foco al buscador si sigue en él o se perdió (body/null). Si el operador ya está en otro control (Cantidad, Precio, Descuento, Tab, clic,
 * diálogo de búsqueda avanzada, panel fiscal), NO se le roba.
 */
export const puedeVolverAlBuscador = (foco: FocoActual): boolean => foco !== "otro";

/** Dónde está el foco del documento cuando se ejecuta el pedido de foco a Cantidad de un alta rápida. */
export type FocoAntesDeCantidad = "buscador" | "cantidad" | "ninguno" | "otro";

/**
 * PRO-341: el foco a Cantidad tras un alta rápida solo se aplica si el cursor sigue en el buscador (desde donde se hizo el alta), ya está en esa misma Cantidad o se perdió
 * (body/null). Si el operador ya se movió a otro control (Precio, IVA, Descuento, Tab, clic, diálogo, panel fiscal), el pedido es obsoleto y se descarta: no se le roba el foco.
 */
export const puedeEnfocarCantidad = (foco: FocoAntesDeCantidad): boolean => foco !== "otro";
