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
