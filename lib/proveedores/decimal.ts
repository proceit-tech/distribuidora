/**
 * Decimales exactos (sin Number/float): los importes y porcentajes viajan como cadena decimal canónica y se validan por
 * dígitos. Nunca se redondea ni se trunca: un valor con más decimales o más enteros de los permitidos se rechaza.
 */
export type ReglaDecimal = { enteros: number; decimales: number; min?: string; max?: string };

export const MONTO_18_2: ReglaDecimal = { enteros: 16, decimales: 2, min: "0" };
export const PORCENTAJE_5_2: ReglaDecimal = { enteros: 3, decimales: 2, min: "0", max: "100" };

export type ResultadoDecimal = { ok: true; valor: string | null } | { ok: false; error: string };

function escalar(canonico: string, decimales: number): bigint {
  const [entero, fraccion = ""] = canonico.split(".");

  return BigInt(entero + fraccion.padEnd(decimales, "0"));
}

/** Cadena vacía/null → { valor: null }. Acepta cadenas decimales con punto (o un número JS entero/finito representable). */
export function decimalExacto(entrada: unknown, regla: ReglaDecimal, etiqueta: string): ResultadoDecimal {
  if (entrada === null || entrada === undefined) return { ok: true, valor: null };

  let texto: string;

  if (typeof entrada === "number") {
    if (!Number.isFinite(entrada)) return { ok: false, error: `${etiqueta} debe ser un número válido.` };
    texto = String(entrada);
  } else if (typeof entrada === "string") {
    texto = entrada.trim();
  } else {
    return { ok: false, error: `${etiqueta} debe ser un número válido.` };
  }

  if (texto === "") return { ok: true, valor: null };

  const m = /^(\d+)(?:\.(\d+))?$/.exec(texto);

  if (!m) return { ok: false, error: `${etiqueta} debe ser un número válido: solo dígitos y punto decimal, sin separador de miles ni signo.` };

  const entero = m[1].replace(/^0+(?=\d)/, "");
  const fraccion = m[2] ?? "";

  if (entero.length > regla.enteros) return { ok: false, error: `${etiqueta} admite hasta ${regla.enteros} dígitos enteros.` };
  if (fraccion.replace(/0+$/, "").length > regla.decimales) {
    return { ok: false, error: `${etiqueta} admite hasta ${regla.decimales} decimales; no se redondea automáticamente.` };
  }

  const canonico = `${entero}${regla.decimales > 0 ? "." + fraccion.slice(0, regla.decimales).padEnd(regla.decimales, "0") : ""}`;
  const escala = escalar(canonico, regla.decimales);

  if (regla.min !== undefined && escala < escalar(regla.min, regla.decimales)) return { ok: false, error: `${etiqueta} no puede ser menor que ${regla.min}.` };
  if (regla.max !== undefined && escala > escalar(regla.max, regla.decimales)) return { ok: false, error: `${etiqueta} no puede ser mayor que ${regla.max}.` };

  return { ok: true, valor: canonico };
}

/** Compara dos decimales canónicos (misma escala): -1, 0, 1. */
export function compararDecimal(a: string, b: string, decimales = 2): number {
  const x = escalar(a, decimales);
  const y = escalar(b, decimales);

  return x < y ? -1 : x > y ? 1 : 0;
}
