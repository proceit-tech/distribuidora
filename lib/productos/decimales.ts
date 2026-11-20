import { decimalExacto, type ReglaDecimal } from "@/lib/proveedores/decimal";

import { ErrorValidacion } from "@/lib/productos/errores";

/** Escalas de la DDL vigente (NEX-007): numeric(18,4), numeric(18,6) y numeric(7,4). */
export const CANTIDAD_18_4: ReglaDecimal = { enteros: 14, decimales: 4, min: "0" };
export const FACTOR_18_6: ReglaDecimal = { enteros: 12, decimales: 6, min: "0" };
export const PORCENTAJE_7_4: ReglaDecimal = { enteros: 3, decimales: 4, min: "0", max: "100" };

const esCero = (canonico: string) => !/[1-9]/.test(canonico);

/** Decimal exacto como cadena canónica (o null si está vacío). Nunca redondea: lo que excede la escala se rechaza con su campo. */
export function decimal(entrada: unknown, regla: ReglaDecimal, etiqueta: string, campo: string, opciones: { positivo?: boolean } = {}): string | null {
  const r = decimalExacto(entrada, regla, etiqueta);

  if (!r.ok) throw new ErrorValidacion(r.error, campo);
  if (opciones.positivo && r.valor !== null && esCero(r.valor)) throw new ErrorValidacion(`${etiqueta} debe ser mayor que cero.`, campo);

  return r.valor;
}

/** Entero no negativo (o ≥ minimo) como número; vacío → null. */
export function entero(entrada: unknown, etiqueta: string, campo: string, minimo = 0): number | null {
  if (entrada === null || entrada === undefined) return null;

  const texto = typeof entrada === "number" ? String(entrada) : typeof entrada === "string" ? entrada.trim() : "";

  if (texto === "") return null;
  if (!/^\d{1,9}$/.test(texto)) throw new ErrorValidacion(`${etiqueta} debe ser un número entero válido.`, campo);

  const n = Number(texto);

  if (n < minimo) throw new ErrorValidacion(`${etiqueta} no puede ser menor que ${minimo}.`, campo);

  return n;
}

/** Producto exacto de dos decimales canónicos, redondeado al entero más cercano (solo para MOSTRAR valores derivados; nunca se persiste). */
export function productoRedondeado(a: string, b: string): bigint | null {
  const dec = (x: string) => {
    const m = /^(\d+)(?:\.(\d+))?$/.exec(x.trim());

    return m ? { n: BigInt(m[1] + (m[2] ?? "")), e: (m[2] ?? "").length } : null;
  };
  const x = dec(a);
  const y = dec(b);

  if (!x || !y) return null;

  const escala = BigInt("1".padEnd(x.e + y.e + 1, "0"));
  const bruto = x.n * y.n;

  return (bruto + escala / BigInt(2)) / escala;
}
