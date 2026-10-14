/**
 * Regla pura de la búsqueda rápida de Nueva factura (cliente y producto): qué hacer al presionar Enter con el texto escrito (p. ej. un lector de códigos de barras).
 * Solo se selecciona sin ambigüedad: una única coincidencia EXACTA (código, GTIN o documento) o un único resultado habilitado. Nunca se elige «el primero» entre varios.
 */
export type DecisionEnter<T> = { elegido: T | null; motivo: "" | "SIN_RESULTADOS" | "VARIOS" };

export function elegirPorEnter<T>(habilitados: T[], texto: string, exacto: (t: T, texto: string) => boolean): DecisionEnter<T> {
  const t = texto.trim();

  if (habilitados.length === 0) return { elegido: null, motivo: "SIN_RESULTADOS" };

  const iguales = habilitados.filter((x) => exacto(x, t));

  if (iguales.length === 1) return { elegido: iguales[0], motivo: "" };
  if (habilitados.length === 1) return { elegido: habilitados[0], motivo: "" };

  return { elegido: null, motivo: "VARIOS" };
}

export const MENSAJE_ENTER: Record<"SIN_RESULTADOS" | "VARIOS", string> = {
  SIN_RESULTADOS: "Sin resultados habilitados para ese texto.",
  VARIOS: "Hay varios resultados: elija uno de la lista.",
};
