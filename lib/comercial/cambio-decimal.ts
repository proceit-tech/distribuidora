/**
 * CC-A05 — cotizaciones como DECIMAL EXACTO (texto), nunca como Number: la columna es numeric(18,6) (12 dígitos enteros y 6 decimales). Funciones puras.
 */
export const MAX_ENTEROS_CAMBIO = 12;
export const MAX_DECIMALES_CAMBIO = 6;

/** Forma canónica de un decimal no negativo escrito como texto («7350.500000» → «7350.5»; «007» → «7»). null si no es un decimal simple. */
export function canonicoDecimal(texto: string): string | null {
  const m = /^(\d+)(?:\.(\d*))?$/.exec(texto.trim());

  if (!m) return null;

  const entera = m[1].replace(/^0+(?=\d)/, "");
  const frac = (m[2] ?? "").replace(/0+$/, "");

  return frac ? `${entera}.${frac}` : entera;
}

/** Igualdad exacta de dos decimales en texto (sin pasar por Number). */
export function igualDecimal(a: string, b: string): boolean {
  const x = canonicoDecimal(a);
  const y = canonicoDecimal(b);

  return x !== null && y !== null && x === y;
}

/** ¿Cabe en numeric(18,6)? (hasta 12 enteros y 6 decimales). */
export function cambioEnAlcance(texto: string): boolean {
  const c = canonicoDecimal(texto);

  if (c === null) return false;

  const [entera, frac = ""] = c.split(".");

  return entera.length <= MAX_ENTEROS_CAMBIO && frac.length <= MAX_DECIMALES_CAMBIO;
}

export const MENSAJE_ALCANCE_CAMBIO = `La cotización excede el máximo permitido (hasta ${MAX_ENTEROS_CAMBIO} dígitos enteros y ${MAX_DECIMALES_CAMBIO} decimales).`;
