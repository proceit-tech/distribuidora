/**
 * Formato es-PY de un importe DECIMAL escrito como texto (PRO-128, UX-30): agrupa miles con punto y separa decimales con coma SIN pasar por `Number`, de modo que lo que se muestra es EXACTAMENTE el decimal
 * que el servidor valida (un importe grande o con 4 decimales no pierde dígitos). Los ceros decimales finales se omiten. Un texto que no es un decimal se devuelve tal cual (no se inventa un valor).
 */
export function formatearDecimalTexto(texto: string | null | undefined): string {
  if (texto === null || texto === undefined) return "—";

  const t = texto.trim();
  const m = /^(-?)(\d{1,30})(?:\.(\d{1,12}))?$/.exec(t);

  if (!m) return texto;

  const entero = m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const frac = (m[3] ?? "").replace(/0+$/, "");

  return `${m[1]}${entero}${frac !== "" ? `,${frac}` : ""}`;
}
