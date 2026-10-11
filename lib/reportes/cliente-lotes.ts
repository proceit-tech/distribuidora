import type { LotesFiltros, LotesRespuesta } from "@/types/reportes";

export function queryStringLotes(f: LotesFiltros, extra: Record<string, string> = {}) {
  const sp = new URLSearchParams();
  const campos: [string, string][] = [
    ["vista", f.vista], ["q", f.q], ["lote", f.lote], ["depositoId", f.depositoId], ["categoriaId", f.categoriaId], ["marcaId", f.marcaId], ["familiaId", f.familiaId],
    ["clase", f.clase], ["existencia", f.existencia], ["horizonte", String(f.horizonte)], ["vencDesde", f.vencDesde], ["vencHasta", f.vencHasta],
  ];
  for (const [k, v] of campos) if (v) sp.set(k, v);
  for (const [k, v] of Object.entries(extra)) sp.set(k, v);
  return sp.toString();
}

async function mensaje(r: Response, fallback: string) {
  const j = (await r.json().catch(() => null)) as { error?: string } | null;
  return j?.error ?? fallback;
}

export async function cargarLotes(f: LotesFiltros, pagina: number): Promise<LotesRespuesta> {
  const r = await fetch(`/api/reportes/lotes?${queryStringLotes(f, { pagina: String(pagina), tamano: "50" })}`, { cache: "no-store" });
  if (!r.ok) throw new Error(await mensaje(r, "No fue posible generar el reporte."));
  return (await r.json()) as LotesRespuesta;
}

export async function descargarLotes(f: LotesFiltros, formato: "xlsx" | "pdf") {
  const r = await fetch(`/api/reportes/lotes/exportar?${queryStringLotes(f, { formato })}`, { cache: "no-store" });
  if (!r.ok) throw new Error(await mensaje(r, "No fue posible exportar el reporte."));
  const nombre = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? `Lotes_Vencimientos.${formato}`;
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
