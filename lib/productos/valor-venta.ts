/**
 * PRO-335-R01 F-001 — «Valor a precio venta» del listado de Productos: subtotales por la moneda REAL del precio de referencia, sin conversión cambiaria
 * ni total entre monedas. Aritmética exacta sobre texto (nunca Number). Solo presentación: no altera precios, stock ni impuestos.
 */
import { formatearImporteConMoneda, normalizarMonedaVisual } from "@/lib/formato/monto-visual";
import { multiplicarDecimales, sumarDecimales } from "@/lib/inventario/decimal";

export type EntradaValorVenta = { precioTexto: string | null; stockTexto: string | null; moneda: string | null };
/** moneda "" = el precio no tiene moneda identificada (nunca se le atribuye una). */
export type SubtotalMoneda = { moneda: string; valor: string; productos: number };

const ORDEN: Record<string, number> = { PYG: 0, USD: 1, BRL: 2 };

/** Valor exacto precio × stock de una fila (stock ausente = 0, como el listado); null si el precio no existe o no es decimal. */
export function valorVentaFila(precioTexto: string | null, stockTexto: string | null): string | null {
  if (precioTexto === null) return null;

  return multiplicarDecimales(precioTexto, stockTexto === null || stockTexto.trim() === "" ? "0" : stockTexto);
}

/** Subtotales por moneda (solo productos con precio de referencia). Orden: PYG, USD, BRL, otras alfabéticamente y «sin moneda» al final. */
export function subtotalesValorVenta(filas: EntradaValorVenta[]): SubtotalMoneda[] {
  const grupos = new Map<string, { valores: string[]; productos: number }>();

  for (const f of filas) {
    const valor = valorVentaFila(f.precioTexto, f.stockTexto);

    if (valor === null) continue;

    const moneda = normalizarMonedaVisual(f.moneda) ?? (f.moneda ?? "").trim().toUpperCase();
    const g = grupos.get(moneda) ?? { valores: [], productos: 0 };

    g.valores.push(valor);
    g.productos += 1;
    grupos.set(moneda, g);
  }

  const peso = (m: string) => (m === "" ? 99 : (ORDEN[m] ?? 50));

  return [...grupos.entries()]
    .map(([moneda, g]) => ({ moneda, valor: sumarDecimales(g.valores), productos: g.productos }))
    .sort((a, b) => peso(a.moneda) - peso(b.moneda) || a.moneda.localeCompare(b.moneda));
}

/** Texto del KPI: un importe por moneda («Gs. 100.000 · USD 20,00»); sin moneda → «Sin moneda 5» (valor exacto); sin productos con precio → «—». */
export function textoSubtotalesValorVenta(subtotales: SubtotalMoneda[]): string {
  if (subtotales.length === 0) return "—";

  return subtotales.map((s) => (s.moneda === "" ? `Sin moneda ${formatearImporteConMoneda(s.valor, null)}` : formatearImporteConMoneda(s.valor, s.moneda))).join(" · ");
}
