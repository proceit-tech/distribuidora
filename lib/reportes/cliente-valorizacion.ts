import { respuestaValorizacionValida } from "@/lib/reportes/valorizacion-cobertura";
import type { ValorizacionFiltros, ValorizacionRespuestaApi } from "@/types/reportes";

export function queryStringValorizacion(f: ValorizacionFiltros, extra: Record<string, string> = {}) {
  const sp = new URLSearchParams();
  const campos: [string, string][] = [
    ["vista", f.vista], ["q", f.q], ["depositoId", f.depositoId], ["categoriaId", f.categoriaId], ["familiaId", f.familiaId],
    ["existencia", f.existencia], ["costo", f.costo], ["cobertura", f.cobertura],
  ];
  for (const [k, v] of campos) if (v) sp.set(k, v);
  for (const [k, v] of Object.entries(extra)) sp.set(k, v);
  return sp.toString();
}

async function mensaje(r: Response, fallback: string) {
  const j = (await r.json().catch(() => null)) as { error?: string } | null;
  return j?.error ?? fallback;
}

/**
 * Consulta la API y valida HTTP y FORMA (RPT-V04): ante red caída, 401/403/500, JSON inválido o respuesta incompleta devuelve error SIN datos, para que la
 * pantalla descarte lo anterior (nunca se muestran ni se exportan totales viejos como si fueran actuales).
 */
export async function pedirValorizacion(f: ValorizacionFiltros, pagina: number, buscar: (url: string) => Promise<Response> = (u) => fetch(u, { cache: "no-store" })): Promise<{ datos: ValorizacionRespuestaApi | null; error: string }> {
  let r: Response;

  try {
    r = await buscar(`/api/reportes/valorizacion?${queryStringValorizacion(f, { pagina: String(pagina), tamano: "50" })}`);
  } catch {
    return { datos: null, error: "No hubo conexión para generar el reporte." };
  }

  const j = (await r.json().catch(() => null)) as unknown;

  if (!r.ok) return { datos: null, error: `${(j as { error?: string } | null)?.error ?? "No fue posible generar el reporte."} (código ${r.status})` };
  if (!respuestaValorizacionValida(j)) return { datos: null, error: "La respuesta del reporte no tiene el formato esperado." };

  return { datos: j, error: "" };
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
