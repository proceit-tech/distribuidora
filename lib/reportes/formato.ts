// Formato compartido por la pantalla y las exportaciones (los valores se ven idénticos en los tres).

export const fmtNum = (v: number) => new Intl.NumberFormat("es-PY", { maximumFractionDigits: 4 }).format(v);

type Estados = { disponible: number; reservado: number; cuarentena: number; transito: number };

/** Desglose del stock de terceros por estado; solo estados con cantidad. Vacío si no hay stock de terceros. */
export function textoTercerosEstados(e: Estados): string {
  const partes: string[] = [];
  if (e.disponible) partes.push(`Disp. ${fmtNum(e.disponible)}`);
  if (e.reservado) partes.push(`Res. ${fmtNum(e.reservado)}`);
  if (e.cuarentena) partes.push(`Cuar. ${fmtNum(e.cuarentena)}`);
  if (e.transito) partes.push(`Trán. ${fmtNum(e.transito)}`);
  return partes.join(" · ");
}

export const TEXTO_PROPIEDAD: Record<string, string> = { PROPIO: "Propio", TERCERO: "Tercero", AMBOS: "Propio y tercero" };

/**
 * Importes monetarios: llegan de PostgreSQL como texto `numeric` (sin pasar por float) y se formatean sin perder precisión.
 * Quita ceros finales (hasta 4 decimales) y usa punto de miles y coma decimal (es-PY). Sin dato => "—".
 */
export function fmtDinero(v: string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(v);
  if (!m) return v;
  const entero = m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const dec = (m[3] ?? "").replace(/0+$/, "");
  return `${m[1]}${entero}${dec ? `,${dec}` : ""}`;
}

/** Cantidades exactas (texto numeric): mismo formato que los importes, sin pasar por Number. Ausente = «n/a» (no aplicable, p. ej. cantidades de unidades distintas). */
export const fmtCantidadTexto = (v: string | null | undefined): string => (v === null || v === undefined ? "n/a" : fmtDinero(v));

/** Desglose del stock de terceros por estado desde textos numeric exactos (solo estados con cantidad). */
export function textoTercerosEstadosTexto(e: { disponible: string; reservado: string; cuarentena: string; transito: string }): string {
  const cero = (v: string) => /^-?0+(\.0+)?$/.test(v);
  const partes: string[] = [];

  if (!cero(e.disponible)) partes.push(`Disp. ${fmtCantidadTexto(e.disponible)}`);
  if (!cero(e.reservado)) partes.push(`Res. ${fmtCantidadTexto(e.reservado)}`);
  if (!cero(e.cuarentena)) partes.push(`Cuar. ${fmtCantidadTexto(e.cuarentena)}`);
  if (!cero(e.transito)) partes.push(`Trán. ${fmtCantidadTexto(e.transito)}`);

  return partes.join(" · ");
}
