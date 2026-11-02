import { B, parseDec, textoDec } from "@/lib/facturacion/calculo";
import { CANTIDAD_FACTURA_OK, normalizarCantidadTexto } from "@/lib/formato/cantidad-campo";

/** Estado de las líneas de la pantalla de NCE (puro, probado sin navegador). */
export type EntradaLinea = { incluida: boolean; valor: string };
export type LineaConSaldo = { linea: number; agotada: boolean; cantidadDisponible: string };

/**
 * Control del listado de facturas (R05-02): recuerda el filtro REALMENTE aplicado (cliente, búsqueda, página) y numera cada petición. Una respuesta solo se aplica si su token sigue vigente; así una
 * búsqueda nueva descarta los resultados tardíos de un filtro anterior (ya sean de una búsqueda manual o del refresco automático) y el refresco siempre relee con el filtro actual.
 */
export type FiltroListado = { clienteId: string; q: string; pagina: number };

export function crearControlListado(inicial: FiltroListado) {
  let filtro = inicial;
  let n = 0;

  return {
    /** Registra un filtro nuevo (búsqueda manual, cambio de página o de cliente) e invalida cualquier petición anterior. */
    aplicar(f: FiltroListado): number { filtro = f; n += 1; return n; },
    /** Filtro vigente y su token, para el refresco automático. */
    leer(): { filtro: FiltroListado; token: number } { return { filtro, token: n }; },
    vigente(token: number): boolean { return token === n; },
  };
}

/** Etiqueta de tributación de una línea (afectación IVA 1 gravado, 2 exonerado, 3 exento, 4 gravado parcial; tasa 0/5/10; proporción en %). */
export function etiquetaIvaLinea(afectacion: number, tasa: number, proporcion: string | null): string {
  if (afectacion === 1) return `Gravado ${tasa}%`;
  if (afectacion === 2) return "Exonerado";
  if (afectacion === 3) return "Exento";
  if (afectacion === 4) return `Gravado parcial ${tasa}%${proporcion ? ` (prop. ${proporcion}%)` : ""}`;

  return "—";
}

/**
 * Estado inicial de las líneas según el motivo (NCE-R01-02): Devolución arranca con TODAS las líneas con saldo incluidas y su cantidad disponible como valor real (se pueden quitar o reducir);
 * las agotadas quedan fuera. Los motivos 3/4/8 arrancan vacíos: no se heredan valores de otro sentido al cambiar de motivo.
 */
export function entradasIniciales(lineas: readonly LineaConSaldo[], motivo: number | ""): Record<number, EntradaLinea> {
  const r: Record<number, EntradaLinea> = {};

  for (const l of lineas) r[l.linea] = motivo === 2 && !l.agotada ? { incluida: true, valor: l.cantidadDisponible } : { incluida: false, valor: "" };

  return r;
}

// ── E06: selección, eliminación y cantidad parcial de las líneas de la nota en preparación ─────────────────────────────────
// «Eliminar seleccionados» quita líneas SOLO de la nota que se está preparando (jamás de la factura original ni del catálogo). Estado puro, probado sin navegador.
export type LineaNota = { linea: number; agotada: boolean; cantidadDisponible: string };

/** Líneas que siguen en la nota (no eliminadas). */
export const lineasVisibles = <T extends { linea: number }>(lineas: readonly T[], eliminadas: ReadonlySet<number>): T[] => lineas.filter((l) => !eliminadas.has(l.linea));

/** «Seleccionar todos»: marca todas las líneas visibles; si ya estaban todas marcadas, desmarca todas. */
export function alternarTodas(lineas: readonly { linea: number }[], eliminadas: ReadonlySet<number>, seleccion: ReadonlySet<number>): Set<number> {
  const v = lineasVisibles(lineas, eliminadas);

  return v.length > 0 && v.every((l) => seleccion.has(l.linea)) ? new Set() : new Set(v.map((l) => l.linea));
}

export function alternarLinea(seleccion: ReadonlySet<number>, linea: number, marcada: boolean): Set<number> {
  const n = new Set(seleccion);

  if (marcada) n.add(linea); else n.delete(linea);

  return n;
}

/** «Eliminar seleccionados»: pasa las líneas marcadas (y visibles) a eliminadas y vacía la selección. Puede eliminar todas. */
export function eliminarSeleccionadas(lineas: readonly { linea: number }[], eliminadas: ReadonlySet<number>, seleccion: ReadonlySet<number>): { eliminadas: Set<number>; seleccion: Set<number> } {
  const n = new Set(eliminadas);

  for (const l of lineasVisibles(lineas, eliminadas)) if (seleccion.has(l.linea)) n.add(l.linea);

  return { eliminadas: n, seleccion: new Set() };
}

/**
 * ¿La línea forma parte de la nota? Devolución: toda línea no eliminada y con saldo (la cantidad vacía se señala como pendiente). Motivos por monto: solo si se indicó un monto, como hasta ahora
 * (no se heredan valores entre motivos).
 */
export function enNota(esDevolucion: boolean, l: { linea: number; agotada: boolean }, valor: string, eliminadas: ReadonlySet<number>): boolean {
  return !eliminadas.has(l.linea) && !l.agotada && (esDevolucion || valor.trim() !== "");
}

/** Validación de la cantidad a devolver: coma o punto, mayor que cero, hasta 4 decimales y nunca más que el saldo disponible de la factura original. null = válida. */
export function errorCantidadDevolucion(valor: string, disponible: string): string | null {
  const t = normalizarCantidadTexto(valor);

  if (t === "") return "Indique la cantidad a devolver.";

  const c = CANTIDAD_FACTURA_OK.test(t) ? parseDec(t, 4) : null;

  if (c === null || c <= B(0)) return "Cantidad no válida: mayor que cero, hasta 4 decimales (use coma o punto).";

  const d = parseDec(disponible, 8) ?? B(0);

  return c > d ? `Supera el saldo disponible (${textoDec(d)}).` : null;
}

/**
 * «Restaurar» (E06-F001): devuelve las líneas eliminadas a la nota CONSERVANDO lo que el operador había digitado (la eliminación nunca borra `entradas`). Solo una línea sin entrada (precarga especial)
 * recibe su valor inicial; el resto de las líneas queda intacto.
 */
export function restaurarEntradas(entradas: Readonly<Record<number, EntradaLinea>>, eliminadas: ReadonlySet<number>, lineas: readonly LineaConSaldo[], motivo: number | ""): Record<number, EntradaLinea> {
  const base = entradasIniciales(lineas, motivo);
  const n: Record<number, EntradaLinea> = { ...entradas };

  for (const l of eliminadas) if (n[l] === undefined) n[l] = base[l] ?? { incluida: false, valor: "" };

  return n;
}

/** Estado de la nota en preparación que determina el cuerpo enviado al servidor (la pantalla y las pruebas usan la MISMA función). */
export type EstadoCuerpoNce = {
  facturaId: string;
  lineas: readonly LineaNota[];
  motivo: number | "";
  sucursalId: string;
  puntoId: string;
  observacion: string;
  entradas: Readonly<Record<number, EntradaLinea>>;
  eliminadas: ReadonlySet<number>;
  /** Monto del servicio DESCUENTO (texto digitado) o null si no se agregó. */
  descuento: string | null;
  /** Identificador de la sesión de edición (parte de la clave de idempotencia). */
  nonce: string;
};

/** Cuerpo de «Revisar»/«Emitir» a partir del estado de la nota. null si falta el motivo. La clave de idempotencia cambia con cualquier cambio de contenido (líneas, valores, motivo, punto, observación, DESCUENTO). */
export function armarCuerpoNce(e: EstadoCuerpoNce) {
  if (e.motivo === "") return null;

  const esDevolucion = e.motivo === 2;
  const lineas = e.descuento !== null ? [] : e.lineas.filter((l) => enNota(esDevolucion, l, e.entradas[l.linea]?.valor ?? "", e.eliminadas)).map((l) => ({ linea: l.linea, ...(esDevolucion ? { cantidad: normalizarCantidadTexto(e.entradas[l.linea]?.valor ?? "") } : { monto: (e.entradas[l.linea]?.valor ?? "").trim() }) }));
  const firma = JSON.stringify([e.facturaId, e.motivo, e.puntoId, e.observacion.trim(), lineas, e.descuento === null ? null : normalizarCantidadTexto(e.descuento)]);
  let h1 = 5381;
  let h2 = 52711;

  for (let i = 0; i < firma.length; i += 1) {
    h1 = ((h1 * 33) ^ firma.charCodeAt(i)) >>> 0;
    h2 = ((h2 * 31) + firma.charCodeAt(i)) >>> 0;
  }

  return { facturaId: e.facturaId, motivo: e.motivo, sucursalId: e.sucursalId, puntoId: e.puntoId, observacion: e.observacion.trim(), lineas, ...(e.descuento !== null ? { servicio: { monto: normalizarCantidadTexto(e.descuento) } } : {}), claveIdempotencia: `nce-${e.nonce}-${h1.toString(36)}${h2.toString(36)}` };
}

/** Corrección de una NCE rechazada (devolución): las líneas de la factura que NO estaban en la nota rechazada quedan eliminadas de la nota en preparación. Otros motivos no eliminan nada. */
export function eliminadasPorPrecarga(lineas: readonly { linea: number }[], motivo: number, lineasPrecarga: readonly { linea: number }[]): Set<number> {
  return motivo === 2 ? new Set(lineas.filter((l) => !lineasPrecarga.some((x) => x.linea === l.linea)).map((l) => l.linea)) : new Set();
}

// ── E07: servicio fijo DESCUENTO (motivos 3/4) ───────────────────────────────────────────────────────────────────────────────
/** El botón «+ Agregar DESCUENTO» solo existe en Descuento y Bonificación, con el servicio disponible (NEX-070) y sin haberlo agregado ya. */
export const puedeAgregarDescuento = (motivo: number | "", disponible: boolean, agregado: boolean): boolean => (motivo === 3 || motivo === 4) && disponible && !agregado;

/** Validación del monto del DESCUENTO: positivo, sin decimales en guaraníes (hasta 4 en otras monedas) y nunca mayor que el saldo disponible para crédito. null = válido. */
export function errorMontoDescuento(valor: string, moneda: string, saldo: string): string | null {
  const t = normalizarCantidadTexto(valor);

  if (t === "") return "Indique el monto del descuento.";

  const m = /^\d{1,15}(\.\d{1,4})?$/.test(t) && (moneda !== "PYG" || !t.includes(".")) ? parseDec(t, 4) : null;

  if (m === null || m <= B(0)) return moneda === "PYG" ? "Monto no válido: mayor que cero y sin decimales en guaraníes." : "Monto no válido: mayor que cero, hasta 4 decimales.";

  const s = parseDec(saldo, 8) ?? B(0);

  return m > s ? `Supera el saldo disponible para crédito (${textoDec(s)}).` : null;
}

/** Con el servicio DESCUENTO la nota contiene SOLO ese ítem: cuántas líneas originales siguen en la nota (no eliminadas y con saldo) y por tanto bloquean la emisión. */
export const lineasOriginalesPendientes = (lineas: readonly { linea: number; agotada: boolean }[], eliminadas: ReadonlySet<number>): number => lineas.filter((l) => !eliminadas.has(l.linea) && !l.agotada).length;

/** ¿El cuerpo revisado sigue siendo EXACTAMENTE el de la nota actual? Solo entonces «Emitir» puede enviar el cuerpo ya validado por el servidor; cualquier cambio exige revisar de nuevo. */
export const cuerpoRevisadoVigente = (revisado: unknown, actual: unknown): boolean => revisado !== null && actual !== null && JSON.stringify(revisado) === JSON.stringify(actual);
