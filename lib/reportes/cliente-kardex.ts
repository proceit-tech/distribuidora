import type { KardexFiltros, KardexRespuesta } from "@/types/reportes";

export function queryStringKardex(f: KardexFiltros, extra: Record<string, string> = {}) {
  const sp = new URLSearchParams();
  const campos: [string, string][] = [
    ["vista", f.vista], ["q", f.q], ["depositoId", f.depositoId], ["tipo", f.tipo], ["usuarioId", f.usuarioId], ["documento", f.documento],
    ["estado", f.estado], ["estadoStock", f.estadoStock], ["lote", f.lote], ["desde", f.desde], ["hasta", f.hasta],
  ];
  for (const [k, v] of campos) if (v) sp.set(k, v);
  for (const [k, v] of Object.entries(extra)) sp.set(k, v);
  return sp.toString();
}

async function mensaje(r: Response, fallback: string) {
  const j = (await r.json().catch(() => null)) as { error?: string } | null;
  return j?.error ?? fallback;
}

export async function cargarKardex(f: KardexFiltros, pagina: number): Promise<KardexRespuesta> {
  const r = await fetch(`/api/reportes/kardex?${queryStringKardex(f, { pagina: String(pagina), tamano: "50" })}`, { cache: "no-store" });
  if (!r.ok) throw new Error(await mensaje(r, "No fue posible generar el reporte."));
  return (await r.json()) as KardexRespuesta;
}

export async function descargarKardex(f: KardexFiltros, formato: "xlsx" | "pdf") {
  const r = await fetch(`/api/reportes/kardex/exportar?${queryStringKardex(f, { formato })}`, { cache: "no-store" });
  if (!r.ok) throw new Error(await mensaje(r, "No fue posible exportar el reporte."));
  const nombre = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? `Kardex_Movimientos.${formato}`;
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
