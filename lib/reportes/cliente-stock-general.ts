import type { StockGeneralFiltros, StockGeneralRespuesta } from "@/types/reportes";

export function queryString(f: StockGeneralFiltros, extra: Record<string, string> = {}) {
  const sp = new URLSearchParams();
  const campos: [string, string][] = [
    ["vista", f.vista], ["q", f.q], ["depositoId", f.depositoId], ["categoriaId", f.categoriaId], ["marcaId", f.marcaId],
    ["familiaId", f.familiaId], ["situacion", f.situacion], ["lote", f.lote], ["existencia", f.existencia],
  ];
  for (const [k, v] of campos) if (v) sp.set(k, v);
  for (const [k, v] of Object.entries(extra)) sp.set(k, v);
  return sp.toString();
}

async function mensaje(r: Response, fallback: string) {
  const j = (await r.json().catch(() => null)) as { error?: string } | null;
  return j?.error ?? fallback;
}

export async function cargarStockGeneral(f: StockGeneralFiltros, pagina: number): Promise<StockGeneralRespuesta> {
  const r = await fetch(`/api/reportes/stock-general?${queryString(f, { pagina: String(pagina), tamano: "50" })}`, { cache: "no-store" });
  if (!r.ok) throw new Error(await mensaje(r, "No fue posible generar el reporte."));
  return (await r.json()) as StockGeneralRespuesta;
}

/** Descarga con los mismos filtros activos; los errores (403, 413…) se muestran sin navegar. */
export async function descargarStockGeneral(f: StockGeneralFiltros, formato: "xlsx" | "pdf") {
  const r = await fetch(`/api/reportes/stock-general/exportar?${queryString(f, { formato })}`, { cache: "no-store" });
  if (!r.ok) throw new Error(await mensaje(r, "No fue posible exportar el reporte."));
  const nombre = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? `Stock_General.${formato}`;
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
