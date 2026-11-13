/**
 * Día preferido de cobro (DEC-CLI-COB-06): preferencia 1–31 guardada tal cual (31 se guarda 31, no 30).
 * Al calcular una fecha en un mes más corto se usa el ÚLTIMO día existente de ese mes (31/abr → 30,
 * 31/feb → 28 ó 29). Utilidad única para los consumidores futuros del módulo de cobranzas; en la V1 no se
 * generan cobros automáticos ni se altera ninguna fecha contractual (p. ej. el vencimiento del crédito temporal).
 */

/** Valida la preferencia: entero 1–31 (rechaza decimales, 0, negativos y texto); vacío = sin preferencia. */
export function validarDiaPreferidoCobro(valor: unknown): { ok: true; dia: number | null } | { ok: false; error: string } {
  if (valor === null || valor === undefined || (typeof valor === "string" && valor.trim() === "")) {
    return { ok: true, dia: null };
  }

  const texto = typeof valor === "string" ? valor.trim() : valor;
  const dia = typeof texto === "number" ? texto : /^[0-9]+$/.test(texto as string) ? Number(texto) : NaN;

  if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
    return { ok: false, error: "El día preferido de cobro debe ser un número entero entre 1 y 31." };
  }

  return { ok: true, dia };
}

/** Último día del mes (mes 1–12; considera años bisiestos). Cálculo en calendario, sin zona horaria. */
export function ultimoDiaDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/** Día efectivo de cobro en un mes: la preferencia, o el último día del mes si el mes es más corto. */
export function diaDeCobroEnMes(diaPreferido: number, anio: number, mes: number): number {
  return Math.min(diaPreferido, ultimoDiaDelMes(anio, mes));
}
