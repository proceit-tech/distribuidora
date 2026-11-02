/**
 * CLI-D07 — límites de crédito de la lista como decimal TEXTO (numeric(18,4) de PostgreSQL), nunca `Number`: suma, orden y formato exactos. Aritmética de lib/inventario/decimal.ts
 * (BigInt). Dato ausente o no numérico = «0» (contrato anterior de la lista, que no inventa valores). Las sumas se llevan por moneda; no se convierte ni se mezcla.
 */
import { formatearDecimalTexto } from "@/lib/formato/decimal-texto";
import { compararDecimales, sumarDecimales } from "@/lib/inventario/decimal";

export function limiteTexto(valor: unknown): string {
  if (typeof valor === "number") return Number.isFinite(valor) ? sumarDecimales([String(valor)]) : "0";
  if (typeof valor !== "string") return "0";

  return /^-?\d+(\.\d+)?$/.test(valor.trim()) ? sumarDecimales([valor]) : "0";
}

/** Suma por moneda (clave = moneda o «sin moneda»). */
export function sumarLimitesPorMoneda(filas: ReadonlyArray<{ moneda: string; limiteCredito: string }>): Record<string, string> {
  const r: Record<string, string> = {};

  for (const f of filas) {
    const clave = f.moneda || "sin moneda";

    r[clave] = sumarDecimales([r[clave] ?? "0", f.limiteCredito]);
  }

  return r;
}

export const compararLimites = (a: string, b: string) => compararDecimales(a, b);

/** Formato es-PY sin pasar por Number: separador de miles «.», decimales «,», sin ceros finales. */
export const formatearLimite = (v: string) => formatearDecimalTexto(v);
