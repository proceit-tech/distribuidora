import { respuestaKardexValida } from "@/lib/reportes/kardex-plan";
import type { KardexFiltros, KardexRespuestaApi } from "@/types/reportes";

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

/** Consulta la API y valida HTTP y FORMA: ante cualquier falla devuelve error SIN datos (la pantalla descarta lo anterior; nunca se muestra ni se exporta una foto vieja como actual). */
export async function pedirKardex(f: KardexFiltros, pagina: number, buscar: (url: string) => Promise<Response> = (u) => fetch(u, { cache: "no-store" })): Promise<{ datos: KardexRespuestaApi | null; error: string }> {
  let r: Response;

  try {
    r = await buscar(`/api/reportes/kardex?${queryStringKardex(f, { pagina: String(pagina), tamano: "50" })}`);
  } catch {
    return { datos: null, error: "No hubo conexión para generar el reporte." };
  }

  const j = (await r.json().catch(() => null)) as unknown;

  if (!r.ok) return { datos: null, error: `${(j as { error?: string } | null)?.error ?? "No fue posible generar el reporte."} (código ${r.status})` };
  if (!respuestaKardexValida(j)) return { datos: null, error: "La respuesta del reporte no tiene el formato esperado." };

  return { datos: j as KardexRespuestaApi, error: "" };
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
