import { respuestaStockCriticoValida } from "@/lib/reportes/stock-critico-plan";
import type { StockCriticoFiltros, StockCriticoRespuestaApi } from "@/types/reportes";

export function queryStringStockCritico(f: StockCriticoFiltros, extra: Record<string, string> = {}) {
  const sp = new URLSearchParams();
  const campos: [string, string][] = [
    ["vista", f.vista], ["q", f.q], ["depositoId", f.depositoId], ["categoriaId", f.categoriaId], ["marcaId", f.marcaId], ["familiaId", f.familiaId],
    ["situacion", f.situacion],
  ];
  for (const [k, v] of campos) if (v) sp.set(k, v);
  for (const [k, v] of Object.entries(extra)) sp.set(k, v);
  return sp.toString();
}

async function mensaje(r: Response, fallback: string) {
  const j = (await r.json().catch(() => null)) as { error?: string } | null;
  return j?.error ?? fallback;
}

/** Consulta la API y valida HTTP y FORMA: ante cualquier falla devuelve error SIN datos (la pantalla descarta lo anterior; nunca se muestra ni se exporta una foto vieja como actual). */
export async function pedirStockCritico(f: StockCriticoFiltros, pagina: number, buscar: (url: string) => Promise<Response> = (u) => fetch(u, { cache: "no-store" })): Promise<{ datos: StockCriticoRespuestaApi | null; error: string }> {
  let r: Response;

  try {
    r = await buscar(`/api/reportes/stock-critico?${queryStringStockCritico(f, { pagina: String(pagina), tamano: "50" })}`);
  } catch {
    return { datos: null, error: "No hubo conexión para generar el reporte." };
  }

  const j = (await r.json().catch(() => null)) as unknown;

  if (!r.ok) return { datos: null, error: `${(j as { error?: string } | null)?.error ?? "No fue posible generar el reporte."} (código ${r.status})` };
  if (!respuestaStockCriticoValida(j)) return { datos: null, error: "La respuesta del reporte no tiene el formato esperado." };

  return { datos: j as StockCriticoRespuestaApi, error: "" };
}

export async function descargarStockCritico(f: StockCriticoFiltros, formato: "xlsx" | "pdf") {
  const r = await fetch(`/api/reportes/stock-critico/exportar?${queryStringStockCritico(f, { formato })}`, { cache: "no-store" });
  if (!r.ok) throw new Error(await mensaje(r, "No fue posible exportar el reporte."));
  const nombre = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? `Stock_Critico.${formato}`;
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
