/**
 * Serie y número de un documento electrónico (SIFEN MT v150, grupo C: C007 dNumDoc = 7 dígitos; C010 dSerieNum = 2 letras, OPCIONAL). Puro y sin base de datos; es el espejo exacto de
 * fe_serie_orden / fe_secuencia_siguiente de la migración NEX-063 (las dos implementaciones se comparan en las pruebas).
 *
 * Regla (DECISION-PUNTOS-TIPOS-SERIES-2026-10-17, RN-PUN-02): la primera numeración NO lleva serie (`null`, "Sin serie"): 0000001 … 9999999. Agotado 9999999 sin serie sigue AA-0000001; agotada AA,
 * AB-0000001; … AZ → BA; … ZA … ZZ. Agotado ZZ-9999999 se detiene (no se reinicia ni se reutiliza). Nunca se asume «AA» para una identidad nueva.
 */

export const NUMERO_MAXIMO = 9999999;
export const SERIE_ULTIMA = "ZZ";
const SERIE = /^[A-Z]{2}$/;

export type Numeracion = { serie: string | null; numero: number };

export const esSerieValida = (s: unknown): s is string => typeof s === "string" && SERIE.test(s);

/** Orden de las series: sin serie = 0, AA = 1 … AZ = 26, BA = 27 … ZZ = 676. */
export function ordenSerie(serie: string | null): number {
  if (serie === null) return 0;
  if (!SERIE.test(serie)) throw new Error("La serie debe tener dos letras mayúsculas (AA a ZZ).");

  return 1 + (serie.charCodeAt(0) - 65) * 26 + (serie.charCodeAt(1) - 65);
}

/** Serie que sigue a la dada (null → AA, AA → AB, AZ → BA, ZZ → null: no hay más). */
export function serieSiguiente(serie: string | null): string | null {
  if (serie === null) return "AA";
  if (!SERIE.test(serie)) throw new Error("La serie debe tener dos letras mayúsculas (AA a ZZ).");
  if (serie === SERIE_ULTIMA) return null;

  const a = serie.charCodeAt(0);
  const b = serie.charCodeAt(1);

  return b < 90 ? String.fromCharCode(a, b + 1) : String.fromCharCode(a + 1, 65);
}

/**
 * Siguiente numeración a partir de la última (serie actual + último número). 9999999 es un valor final válido: el siguiente es el 0000001 de la serie siguiente. `null` = numeración agotada
 * (ZZ-9999999): hay que detener y escalar, jamás reiniciar.
 */
export function numeracionSiguiente(serie: string | null, ultimo: number): Numeracion | null {
  if (!Number.isInteger(ultimo) || ultimo < 0 || ultimo > NUMERO_MAXIMO) throw new Error("El último número debe ser un entero de 0 a 9999999.");
  ordenSerie(serie); // valida la serie (dos letras A–Z o null) también cuando solo avanza el número
  if (ultimo < NUMERO_MAXIMO) return { serie, numero: ultimo + 1 };

  const s = serieSiguiente(serie);

  return s === null ? null : { serie: s, numero: 1 };
}

/** Texto de la numeración: «0000001» sin serie, «AA-0000001» con serie. */
export function textoNumeracion(serie: string | null, numero: number): string {
  const n = String(numero).padStart(7, "0");

  return serie === null ? n : `${serie}-${n}`;
}

/** Compara dos numeraciones (serie, número): negativo si a < b. */
export function compararNumeracion(a: Numeracion, b: Numeracion): number {
  return ordenSerie(a.serie) - ordenSerie(b.serie) || a.numero - b.numero;
}
