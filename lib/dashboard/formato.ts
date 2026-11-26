import { formatearImporteConMoneda } from "@/lib/formato/monto-visual";

/**
 * F-DASH-07 — importes del Dashboard como DECIMAL en texto (sin pasar por `number`/`float8`). Redondea a `decimales` (mitad hacia arriba, en valor absoluto) con BigInt y formatea es-PY;
 * un texto que no es decimal se devuelve sin inventar valor.
 */
export function redondearDecimalTexto(texto: string, decimales: number): string {
  const m = /^(-?)(\d{1,30})(?:\.(\d{1,12}))?$/.exec(texto.trim());

  if (!m) return texto;

  const frac = (m[3] ?? "").padEnd(decimales + 1, "0");
  let escala = BigInt(`${m[2]}${frac.slice(0, decimales)}`);

  if (Number(frac[decimales] ?? "0") >= 5) escala += BigInt(1);

  const s = escala.toString().padStart(decimales + 1, "0");
  const entero = decimales > 0 ? s.slice(0, s.length - decimales) : s;
  const dec = decimales > 0 ? s.slice(s.length - decimales) : "";
  const negativo = m[1] === "-" && escala !== BigInt(0);

  return `${negativo ? "-" : ""}${entero}${dec ? `.${dec}` : ""}`;
}

/** PRO-335 — importe visual del Dashboard con la semántica única del NEXIT: «Gs. 1.234.567» (PYG 0 decimales), «USD 1.234,50» (USD/BRL 2 fijos); moneda desconocida → valor exacto. */
export function montoTexto(valor: string, moneda: string): string {
  return formatearImporteConMoneda(valor, moneda);
}
