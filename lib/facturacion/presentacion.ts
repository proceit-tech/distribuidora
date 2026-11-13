/**
 * E05 — textos de PRESENTACIÓN de la Factura (no participan en ningún cálculo, validación ni payload).
 *  · Guaraníes sin decimales en pantalla; si los pagos NO coinciden con el total se muestra el decimal EXACTO para no esconder la diferencia.
 *  · «Establecimiento 001» siempre rotulado.
 */
import { formatearDecimalTexto } from "@/lib/formato/decimal-texto";
import { formatearMontoVisual } from "@/lib/formato/monto-visual";

export const etiquetaEstablecimiento = (establecimiento: string): string => `Establecimiento ${establecimiento}`;

export function textoConciliacionPagos(e: { simbolo: string; moneda: string; objetivo: string; suma: string | null; coincide: boolean }): string {
  const vis = (t: string) => (e.coincide ? formatearMontoVisual(t, e.moneda) : formatearDecimalTexto(t));

  if (e.suma === null) return `Revise los montos · a cubrir ${e.simbolo} ${formatearMontoVisual(e.objetivo, e.moneda)}`;

  return `Suma de los pagos ${e.simbolo} ${vis(e.suma)} de ${vis(e.objetivo)}${e.coincide ? " · coinciden" : " · NO coinciden"}`;
}
