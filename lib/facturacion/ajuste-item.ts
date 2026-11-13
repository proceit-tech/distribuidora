/**
 * Ajuste fiscal de un ítem en la propia factura (PRO-93, Fase A, FE-UX-07/08/09). Módulo PURO (sin red ni base): lo usan el servidor para leer y validar el cuerpo, y la pantalla para
 * calcular los valores efectivos de cada línea. El servidor vuelve a validar TODO (catálogo SIFEN, permisos, coherencia IVA E731/E733/E734, GTIN, longitudes): nada de lo que
 * llega del navegador se acepta por confianza.
 *
 * Alcance: unidad SIFEN (E709), afectación/tasa/proporción de IVA (E731/E734/E733), descripción fiscal (E708) y GTIN (E714) — todos campos que el JSON FE ya transporta
 * (sin ampliar el contrato del gateway). El precio sigue su propio permiso (FACTURACION_ELECTRONICA.PRECIO). dInfItem y demás opcionales de ítem NO se envían (el gateway
 * no los tiene confirmados; ver matriz fiscal FAT-E1).
 */

export type AjusteFiscal = {
  unidadSifen?: number;
  afectacion?: number;
  tasa?: number;
  proporcion?: string | null;
  descripcion?: string;
  gtin?: string | null;
  /** «Guardar también en Productos»: solo la clasificación de IVA (afectación/tasa/proporción). Nunca la unidad ni el precio. */
  guardarClasificacion?: boolean;
};

const CLAVES = ["unidadSifen", "afectacion", "tasa", "proporcion", "descripcion", "gtin", "guardarClasificacion"];

/** Lee y valida la FORMA de un ajuste. undefined = sin ajuste; string = error para el operador. */
export function leerAjuste(crudo: unknown): AjusteFiscal | undefined | string {
  if (crudo === undefined || crudo === null) return undefined;
  if (typeof crudo !== "object" || Array.isArray(crudo)) return "El ajuste fiscal de un ítem no es válido.";

  const o = crudo as Record<string, unknown>;
  const extra = Object.keys(o).find((k) => !CLAVES.includes(k));

  if (extra !== undefined) return "El ajuste fiscal de un ítem contiene un campo no admitido.";

  const a: AjusteFiscal = {};

  if (o.unidadSifen !== undefined) {
    if (typeof o.unidadSifen !== "number" || !Number.isInteger(o.unidadSifen) || o.unidadSifen < 1 || o.unidadSifen > 99999) return "La unidad SIFEN del ítem no es válida.";
    a.unidadSifen = o.unidadSifen;
  }
  if (o.afectacion !== undefined) {
    if (typeof o.afectacion !== "number" || ![1, 2, 3, 4].includes(o.afectacion)) return "La afectación de IVA del ítem no es válida.";
    a.afectacion = o.afectacion;
  }
  if (o.tasa !== undefined) {
    if (typeof o.tasa !== "number" || ![0, 5, 10].includes(o.tasa)) return "La tasa de IVA del ítem debe ser 0, 5 o 10.";
    a.tasa = o.tasa;
  }
  if (o.proporcion !== undefined && o.proporcion !== null) {
    if (typeof o.proporcion !== "string" || !/^\d{1,3}(\.\d{1,4})?$/.test(o.proporcion.trim())) return "La proporción gravada del ítem no es válida (hasta 4 decimales).";
    a.proporcion = o.proporcion.trim();
  } else if (o.proporcion === null) {
    a.proporcion = null;
  }
  if (o.descripcion !== undefined) {
    if (typeof o.descripcion !== "string" || o.descripcion.trim().length < 1 || o.descripcion.trim().length > 120) return "La descripción fiscal del ítem debe tener de 1 a 120 caracteres.";
    a.descripcion = o.descripcion.trim();
  }
  if (o.gtin !== undefined && o.gtin !== null) {
    if (typeof o.gtin !== "string" || (o.gtin.trim() !== "" && !/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(o.gtin.trim()))) return "El GTIN del ítem debe tener 8, 12, 13 o 14 dígitos.";
    a.gtin = o.gtin.trim() === "" ? null : o.gtin.trim();
  } else if (o.gtin === null) {
    a.gtin = null;
  }
  if (o.guardarClasificacion !== undefined) {
    if (typeof o.guardarClasificacion !== "boolean") return "La opción de guardar en Productos no es válida.";
    a.guardarClasificacion = o.guardarClasificacion;
  }

  // La clasificación de IVA viaja COMPLETA (afectación + tasa [+ proporción]) o no viaja: nunca se completa a medias con datos del cadastro.
  const hayIva = a.afectacion !== undefined || a.tasa !== undefined || a.proporcion !== undefined;

  if (hayIva) {
    if (a.afectacion === undefined || a.tasa === undefined) return "Informe la afectación y la tasa de IVA del ítem juntas.";
    if (a.afectacion === 4 && (a.proporcion === undefined || a.proporcion === null)) return "El gravado parcial requiere la proporción gravada.";
    if (a.afectacion !== 4 && a.proporcion !== undefined && a.proporcion !== null) return "La proporción gravada solo se informa con gravado parcial.";
  }
  if (a.guardarClasificacion === true && !hayIva) return "Solo se puede guardar en Productos una clasificación de IVA corregida en esta factura.";

  return Object.keys(a).length > 0 ? a : undefined;
}

// ── Lado del navegador: estado de edición por línea y valores efectivos ──────────────────────────────────────────────────────────────────────────

export type ProductoBase = {
  unidadSifen: number | null; unidadVigente?: boolean | null; afectacion: number | null; tasa: number | null; proporcion: string | null; precio: string | null; monedaPrecio: string | null;
  descripcion: string; gtin: string | null;
};

/** Estado de los campos de la línea tal como los escribe el operador (texto vacío = «usar el cadastro»). */
export type GtinModo = "cadastro" | "informar" | "sin";
export type AjusteUI = { unidadSifen: string; afectacion: string; tasa: string; proporcion: string; descripcion: string; gtin: string; gtinModo: GtinModo; guardar: boolean };

export const AJUSTE_VACIO: AjusteUI = { unidadSifen: "", afectacion: "", tasa: "", proporcion: "", descripcion: "", gtin: "", gtinModo: "cadastro", guardar: false };

export type Efectivos = { unidadSifen: number | null; afectacion: number | null; tasa: number | null; proporcion: string | null; descripcion: string; gtin: string | null };

const entero = (t: string): number | null => (/^\d{1,5}$/.test(t.trim()) ? Number(t.trim()) : null);

export function hayIvaAjustado(a: AjusteUI): boolean {
  return a.afectacion.trim() !== "";
}

export function valoresEfectivos(p: ProductoBase, a: AjusteUI): Efectivos {
  const iva = hayIvaAjustado(a);

  return {
    unidadSifen: a.unidadSifen.trim() !== "" ? entero(a.unidadSifen) : p.unidadSifen,
    afectacion: iva ? entero(a.afectacion) : p.afectacion,
    tasa: iva ? (a.tasa.trim() !== "" ? entero(a.tasa) : null) : p.tasa,
    proporcion: iva ? (entero(a.afectacion) === 4 && a.proporcion.trim() !== "" ? a.proporcion.trim() : null) : p.proporcion,
    descripcion: a.descripcion.trim() !== "" ? a.descripcion.trim() : p.descripcion,
    // Tres estados distintos: usar el GTIN del producto, informar otro, o NO informar GTIN en esta factura (E714 es opcional: el producto no cambia).
    gtin: a.gtinModo === "sin" ? null : a.gtinModo === "informar" ? (a.gtin.trim() !== "" ? a.gtin.trim() : null) : p.gtin,
  };
}

/** Pendientes fiscales de una línea con sus valores efectivos (el precio de la línea se valida aparte). */
export function problemasFiscales(p: ProductoBase, a: AjusteUI, precioLinea: string, moneda: string = "PYG"): string[] {
  const e = valoresEfectivos(p, a);
  const m: string[] = [];

  if (e.afectacion === null) m.push("sin clasificación de IVA");
  else if (e.tasa === null) m.push("falta la tasa de IVA");
  else if ((e.afectacion === 1 || e.afectacion === 4) && e.tasa !== 5 && e.tasa !== 10) m.push("la tasa de IVA debe ser 5 % o 10 %");
  else if ((e.afectacion === 2 || e.afectacion === 3) && e.tasa !== 0) m.push("exonerado/exento lleva tasa 0 %");
  else if (e.afectacion === 4 && (e.proporcion === null || !(Number(e.proporcion) > 0 && Number(e.proporcion) < 100))) m.push("falta la proporción gravada (mayor que 0 y menor que 100)");
  if (e.unidadSifen === null) m.push("sin unidad de medida SIFEN");
  else if (a.unidadSifen.trim() === "" && p.unidadVigente === false) m.push("unidad SIFEN no vigente");
  if (a.gtinModo === "informar" && a.gtin.trim() === "") m.push("falta el GTIN (o elija «Sin GTIN»)");
  else if (e.gtin !== null && !/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(e.gtin)) m.push("GTIN inválido");
  if (e.descripcion.trim().length < 1 || e.descripcion.length > 120) m.push("descripción fiscal de 1 a 120 caracteres");
  if (!/^\d{1,12}(\.\d{1,4})?$/.test(precioLinea) || !(Number(precioLinea) > 0)) m.push(`sin precio de venta en ${moneda === "PYG" ? "guaraníes" : moneda}`);

  return m;
}

/** ¿El producto del cadastro, tal cual, se puede facturar? (si no, necesita ajuste en la línea o corrección en Productos). */
export function productoIncompleto(p: ProductoBase, moneda: string = "PYG"): boolean {
  return problemasFiscales(p, AJUSTE_VACIO, p.monedaPrecio === moneda && p.precio !== null ? p.precio : "", moneda).length > 0;
}

/** Cuerpo `ajuste` que viaja al servidor: solo lo que el operador cambió respecto del cadastro. undefined = nada que ajustar. */
export function ajusteParaEnvio(p: ProductoBase, a: AjusteUI): AjusteFiscal | undefined {
  const o: AjusteFiscal = {};
  const e = valoresEfectivos(p, a);

  if (a.unidadSifen.trim() !== "" && e.unidadSifen !== null && e.unidadSifen !== p.unidadSifen) o.unidadSifen = e.unidadSifen;
  if (hayIvaAjustado(a) && e.afectacion !== null && e.tasa !== null && (e.afectacion !== p.afectacion || e.tasa !== p.tasa || e.proporcion !== p.proporcion)) {
    o.afectacion = e.afectacion; o.tasa = e.tasa; o.proporcion = e.afectacion === 4 ? e.proporcion : null;
    if (a.guardar) o.guardarClasificacion = true;
  }
  if (a.descripcion.trim() !== "" && a.descripcion.trim() !== p.descripcion) o.descripcion = a.descripcion.trim();
  // «Sin GTIN» viaja como null EXPLÍCITO (distinto de «no ajustar»); solo si el producto tenía GTIN (si no, no hay nada que cambiar).
  if (a.gtinModo === "sin" && p.gtin !== null) o.gtin = null;
  else if (a.gtinModo === "informar" && a.gtin.trim() !== "" && a.gtin.trim() !== p.gtin) o.gtin = a.gtin.trim();

  return Object.keys(o).length > 0 ? o : undefined;
}

// ── Selección de productos: pendientes fiscales y de precio SEPARADOS, cada uno con su permiso (AUD-MFE-P2-R01-02) ─────────────────────────────────

export type PermisosProducto = { puedeAjustarFiscal: boolean; puedeEditarPrecio: boolean };

/** Pendientes del producto tal como está en el cadastro: fiscales (IVA, unidad SIFEN) y de precio (sin precio de lista en la MONEDA de la factura). */
export function pendientesProducto(p: Pick<ProductoBase, "afectacion" | "unidadSifen" | "unidadVigente" | "precio" | "monedaPrecio">, moneda: string): { fiscales: string[]; precio: string[] } {
  const fiscales: string[] = [];

  if (p.afectacion === null) fiscales.push("sin clasificación de IVA");
  if (p.unidadSifen === null) fiscales.push("sin unidad de medida SIFEN");
  else if (p.unidadVigente === false) fiscales.push("unidad SIFEN no vigente");

  return { fiscales, precio: p.precio === null || p.monedaPrecio !== moneda ? [`sin precio de venta en ${moneda === "PYG" ? "guaraníes" : moneda}`] : [] };
}

/**
 * ¿Se puede AÑADIR el producto a la factura? Los pendientes fiscales se completan en la línea solo con FACTURACION_ELECTRONICA.AJUSTE_FISCAL; la falta de precio en la moneda solo con
 * FACTURACION_ELECTRONICA.PRECIO. Cada permiso cubre únicamente lo suyo: quien tiene PRECIO y no AJUSTE_FISCAL puede añadir un producto fiscalmente válido con lista en otra moneda y
 * escribir el precio, pero NO se le abre la edición de IVA, unidad, descripción ni GTIN. El servidor vuelve a verificar todo.
 */
export function decidirProducto(p: Parameters<typeof pendientesProducto>[0], moneda: string, permisos: PermisosProducto): { habilitado: boolean; fiscales: string[]; precio: string[]; mensaje: string | undefined; corregirEnProductos: boolean } {
  const { fiscales, precio } = pendientesProducto(p, moneda);
  const bloqueoFiscal = fiscales.length > 0 && !permisos.puedeAjustarFiscal;
  const bloqueoPrecio = precio.length > 0 && !permisos.puedeEditarPrecio;
  const habilitado = !bloqueoFiscal && !bloqueoPrecio;
  const completables = [...(fiscales.length > 0 && permisos.puedeAjustarFiscal ? fiscales : []), ...(precio.length > 0 && permisos.puedeEditarPrecio ? precio : [])];
  const bloqueos = [...(bloqueoFiscal ? fiscales : []), ...(bloqueoPrecio ? precio : [])];

  return {
    habilitado, fiscales, precio,
    mensaje: bloqueos.length > 0
      ? `No se puede facturar: ${bloqueos.join(", ")}.${bloqueoPrecio ? " Escribir el precio requiere el permiso de precio." : ""}${bloqueoFiscal ? " Completar datos fiscales requiere el permiso de ajuste fiscal." : ""}`
      : completables.length > 0 ? `Pendiente de completar: ${completables.join(", ")}. Se completa en la línea de la factura.` : undefined,
    corregirEnProductos: bloqueoFiscal,
  };
}
