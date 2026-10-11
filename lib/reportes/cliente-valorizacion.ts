import type { ValorizacionFiltros, ValorizacionRespuesta } from "@/types/reportes";

export function queryStringValorizacion(f: ValorizacionFiltros, extra: Record<string, string> = {}) {
  const sp = new URLSearchParams();
  const campos: [string, string][] = [
    ["vista", f.vista], ["q", f.q], ["depositoId", f.depositoId], ["categoriaId", f.categoriaId], ["familiaId", f.familiaId],
    ["existencia", f.existencia], ["costo", f.costo],
  ];
  for (const [k, v] of campos) if (v) sp.set(k, v);
  for (const [k, v] of Object.entries(extra)) sp.set(k, v);
  return sp.toString();
}

async function mensaje(r: Response, fallback: string) {
  const j = (await r.json().catch(() => null)) as { error?: string } | null;
  return j?.error ?? fallback;
}

export async function cargarValorizacion(f: ValorizacionFiltros, pagina: number): Promise<ValorizacionRespuesta> {
  const r = await fetch(`/api/reportes/valorizacion?${queryStringValorizacion(f, { pagina: String(pagina), tamano: "50" })}`, { cache: "no-store" });
  if (!r.ok) throw new Error(await mensaje(r, "No fue posible generar el reporte."));
  return (await r.json()) as ValorizacionRespuesta;
}

export async function descargarValorizacion(f: ValorizacionFiltros, formato: "xlsx" | "pdf") {
  const r = await fetch(`/api/reportes/valorizacion/exportar?${queryStringValorizacion(f, { formato })}`, { cache: "no-store" });
  if (!r.ok) throw new Error(await mensaje(r, "No fue posible exportar el reporte."));
  const nombre = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? `Valorizacion_Inventario.${formato}`;
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
