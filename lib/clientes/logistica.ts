/**
 * Entrega y ventas: frecuencia × días de entrega (D-13, decisión del responsable 2026-10-11, pregunta 10).
 * Aprobado: los días son OBLIGATORIOS para frecuencia SEMANAL y QUINCENAL; la frecuencia DIARIA usa los días que se
 * seleccionen; para MENSUAL y A_DEMANDA no hay exigencia aprobada y NO se inventa ninguna. Los días válidos son 1–7
 * (1 = lunes … 7 = domingo), sin repetidos. Sin frecuencia no se impone nada sobre los días (coherencia no aprobada).
 */
export const FRECUENCIAS_ENTREGA = ["DIARIA", "SEMANAL", "QUINCENAL", "MENSUAL", "A_DEMANDA"] as const;

const REQUIEREN_DIAS = new Set(["SEMANAL", "QUINCENAL"]);
const ETIQUETA: Record<string, string> = { SEMANAL: "semanal", QUINCENAL: "quincenal" };

/** Devuelve el mensaje de error o null. `dias` son los números 1–7 elegidos. */
export function validarFrecuenciaYDias(frecuencia: string | null | undefined, dias: readonly number[]): string | null {
  const f = (frecuencia ?? "").trim().toUpperCase();

  if (f !== "" && !(FRECUENCIAS_ENTREGA as readonly string[]).includes(f)) return "La frecuencia de entrega no es válida.";
  if (dias.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) return "Los días de entrega deben estar entre 1 y 7.";
  if (new Set(dias).size !== dias.length) return "Los días de entrega no pueden repetirse.";
  if (REQUIEREN_DIAS.has(f) && dias.length === 0) {
    return `Con frecuencia de entrega ${ETIQUETA[f]} seleccione al menos un día de entrega.`;
  }

  return null;
}
