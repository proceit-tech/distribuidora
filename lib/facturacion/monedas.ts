import { B, S, parseDec, textoDec, type Dec } from "@/lib/facturacion/calculo";

/**
 * Moneda de la Factura Electrónica y tipo de cambio manual (MFE-03 P2, MT v150 D015–D018, E609–E611, F023). Módulo PURO compartido por el servidor y la pantalla.
 *
 *  · D015 cMoneOpe: PYG, USD o BRL (ISO 4217). Una sola moneda para todo el documento y sus pagos.
 *  · D017 dCondTiCam: SOLO «Global» (1) en esta fase (el cambio por ítem, E725/EA009, queda fuera). D018 dTiCam: 1-5p(0-4) = PYG por UNA unidad de la moneda extranjera (decisión comercial
 *    aprobada 12/10/2026: cotización 100 % manual, en guaraníes por unidad). Obligatorio con USD/BRL; NO se informa en PYG (reglas 1207–1210).
 *  · F023 dTotalGs = F014 × D018 (regla 2385). Con total de ≤ 4 decimales y cambio de ≤ 4 decimales el producto es EXACTO (≤ 8 decimales): jamás se redondea; si no cabe como número
 *    exacto del JSON (1-15p(0-8)), la modalidad se bloquea con el motivo.
 *  · Nunca se convierte un precio de lista: un producto solo toma su precio de referencia si está en la MISMA moneda de la factura; si no, el precio se escribe a mano (permiso PRECIO).
 */

export type Moneda = "PYG" | "USD" | "BRL";
export const MONEDAS_FE: Record<Moneda, { nombre: string; simbolo: string }> = {
  PYG: { nombre: "Guaraníes", simbolo: "Gs." },
  USD: { nombre: "Dólares americanos", simbolo: "US$" },
  BRL: { nombre: "Reales brasileños", simbolo: "R$" },
};
export const esMonedaFE = (m: unknown): m is Moneda => typeof m === "string" && Object.prototype.hasOwnProperty.call(MONEDAS_FE, m);
export const simboloMoneda = (m: string): string => (esMonedaFE(m) ? MONEDAS_FE[m].simbolo : m);

/** D018: 1-5p(0-4): hasta 5 enteros y 4 decimales. */
const CAMBIO = /^\d{1,5}(\.\d{1,4})?$/;

/** Texto de cambio ya normalizado (sin ceros finales) o null si no es un cambio manual válido (>0, ≤ 5 enteros, ≤ 4 decimales). */
export function leerCambio(texto: unknown): string | null {
  if (typeof texto !== "string") return null;

  const t = texto.trim().replace(",", ".");

  if (!CAMBIO.test(t)) return null;

  const d = parseDec(t, 4);

  return d !== null && d > B(0) ? textoDec(d) : null;
}

/** Lee el par moneda/cambio del cuerpo. Sin moneda = PYG (clientes anteriores). string = error para el operador. */
export function leerMonedaYCambio(moneda: unknown, cambio: unknown): { moneda: Moneda; cambio: string | null } | string {
  const m = moneda === undefined || moneda === null || moneda === "" ? "PYG" : moneda;

  if (!esMonedaFE(m)) return "La moneda de la factura no es válida (PYG, USD o BRL).";
  if (m === "PYG") return cambio === undefined || cambio === null || cambio === "" ? { moneda: "PYG", cambio: null } : "Una factura en guaraníes no lleva tipo de cambio.";

  const c = leerCambio(cambio);

  return c === null ? `Indique el tipo de cambio manual: guaraníes por 1 ${m} (mayor que cero, hasta 5 enteros y 4 decimales).` : { moneda: m, cambio: c };
}

/** F023 dTotalGs = F014 × D018, exacto. null si el cambio es inválido. El resultado nunca se redondea (≤ 8 decimales por construcción). */
export function totalEnGuaranies(total: Dec, cambio: string): Dec | null {
  const c = parseDec(cambio, 4);

  if (c === null) return null;

  // Exacto o nada: un resto significaría un redondeo no autorizado.
  return (total * c) % S === B(0) ? (total * c) / S : null;
}

/** ¿El producto de la lista de precios puede usarse como precio de referencia en esta factura? Solo si su moneda ES la de la factura (sin conversión silenciosa). */
export const precioEnMoneda = (monedaPrecio: string | null, moneda: string): boolean => monedaPrecio === moneda;

/** Comparación EXACTA de precios (Decimal, nunca Number): ¿el texto escrito es el mismo precio que el de lista? Un texto inválido jamás es «igual». */
export function mismoPrecio(escrito: string, lista: string | null): boolean {
  const a = parseDec(escrito, 8);
  const b = lista === null ? null : parseDec(lista, 8);

  return a !== null && b !== null && a === b;
}

/** ¿El precio se puede escribir en el JSON como número SIN cambiar su valor? (ida y vuelta exacta; si no, el servidor lo rechaza en vez de usar otro precio). */
export function precioSerializable(texto: string): boolean {
  const d = parseDec(texto, 8);

  return d !== null && String(Number(textoDec(d))) === textoDec(d);
}

/** F023 dTotalGs es `1-15p(0-8)`: hasta 15 dígitos ENTEROS y 8 decimales. Más allá no es un valor fiscal válido (no se trunca ni se redondea: la modalidad se bloquea). */
export const MAX_ENTEROS_F023 = 15;
const LIMITE_F023 = B(Math.pow(10, MAX_ENTEROS_F023)) * S;
export const cabeEnF023 = (d: Dec): boolean => d >= B(0) && d < LIMITE_F023;
