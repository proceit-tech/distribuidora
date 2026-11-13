// Formato compartido por la pantalla y las exportaciones. PRO-335: los importes de PANTALLA usan `fmtImporteMoneda` (moneda por fila); las exportaciones conservan el valor exacto (`fmtDinero`).
import { formatearImporteMoneda } from "@/lib/formato/monto-visual";

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
 * Decimal EXACTO (texto `numeric`, sin pasar por float): quita ceros finales y usa punto de miles y coma decimal (es-PY), SIN redondear. Sin dato => "—".
 * Lo usan las EXPORTACIONES (PDF/Excel conservan la precisión exacta) y, vía `fmtCantidadTexto`, las cantidades. PRO-335: en PANTALLA los importes usan `fmtImporteMoneda`.
 */
function fmtDecimalExacto(v: string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(v);
  if (!m) return v;
  const entero = m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const dec = (m[3] ?? "").replace(/0+$/, "");
  return `${m[1]}${entero}${dec ? `,${dec}` : ""}`;
}

/** Exportaciones: dinero exacto sin moneda (contrato previo, NO usar en pantalla). */
export const fmtDinero = fmtDecimalExacto;

/**
 * PRO-335 — importe MONETARIO en pantalla con la moneda de SU fila/indicador: PYG 0 decimales, USD/BRL 2 fijos, redondeo por texto mitad hacia arriba.
 * Moneda desconocida → valor exacto (no se asume PYG). Ausente => "—". Nunca se usa para cantidades ni para exportaciones.
 */
export const fmtImporteMoneda = (v: string | null | undefined, moneda: string | null | undefined): string => formatearImporteMoneda(v, moneda);

/**
 * Cantidades exactas (texto numeric): sin redondeo monetario (1.2500 → 1,25; 0.0001 → 0,0001), sin pasar por Number. Ausente = «n/a» (no aplicable, p. ej. cantidades de unidades distintas).
 * PRO-335: camino PROPIO, separado del importe monetario.
 */
export const fmtCantidadTexto = (v: string | null | undefined): string => (v === null || v === undefined ? "n/a" : fmtDecimalExacto(v));

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
