/**
 * Entrega y ventas: frecuencia × días (D-13, decisiones del responsable 2026-10-11, preguntas 10 y 9).
 *  - SEMANAL y QUINCENAL: los días de la semana son OBLIGATORIOS (≥ 1).
 *  - DIARIA: usa los días de la semana que se seleccionen (sin exigencia adicional).
 *  - MENSUAL: se solicita el DÍA DEL MES (entero 1–31), obligatorio con esa frecuencia. El comportamiento de los días 29–31 en meses
 *    más cortos NO está definido (requiere especificación antes de operacionalizar entregas): solo se guarda la preferencia, no se
 *    genera calendario ni se asume «último día».
 *  - A_DEMANDA: sin calendario obligatorio (ni días ni día del mes).
 * Los días de la semana son 1–7 (1 = lunes … 7 = domingo), sin repetidos. Sin frecuencia no se impone nada (coherencia no aprobada).
 */
export const FRECUENCIAS_ENTREGA = ["DIARIA", "SEMANAL", "QUINCENAL", "MENSUAL", "A_DEMANDA"] as const;

const REQUIEREN_DIAS = new Set(["SEMANAL", "QUINCENAL"]);
const ETIQUETA: Record<string, string> = { SEMANAL: "semanal", QUINCENAL: "quincenal" };

/** Interpreta el día del mes (número o texto): entero 1–31, o null si está vacío. Devuelve NaN si no es un entero válido. */
export function leerDiaMes(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;

  const texto = typeof valor === "number" ? String(valor) : typeof valor === "string" ? valor.trim() : "";

  if (texto === "") return null;
  if (!/^\d{1,2}$/.test(texto)) return Number.NaN;

  const dia = Number(texto);

  return dia >= 1 && dia <= 31 ? dia : Number.NaN;
}

/** Devuelve el mensaje de error o null. `dias` son los días de la semana 1–7 elegidos; `diaMes` solo se admite con MENSUAL. */
export function validarFrecuenciaYDias(frecuencia: string | null | undefined, dias: readonly number[], diaMes?: unknown): string | null {
  const f = (frecuencia ?? "").trim().toUpperCase();

  if (f !== "" && !(FRECUENCIAS_ENTREGA as readonly string[]).includes(f)) return "La frecuencia de entrega no es válida.";
  if (dias.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) return "Los días de entrega deben estar entre 1 y 7.";
  if (new Set(dias).size !== dias.length) return "Los días de entrega no pueden repetirse.";
  if (REQUIEREN_DIAS.has(f) && dias.length === 0) {
    return `Con frecuencia de entrega ${ETIQUETA[f]} seleccione al menos un día de entrega.`;
  }

  const dia = leerDiaMes(diaMes);

  if (Number.isNaN(dia)) return "El día del mes de entrega debe ser un número entero entre 1 y 31.";
  if (f === "MENSUAL" && dia === null) return "Con frecuencia de entrega mensual indique el día del mes (1 a 31).";
  if (f !== "MENSUAL" && dia !== null) return "El día del mes de entrega solo aplica a la frecuencia mensual.";

  return null;
}
