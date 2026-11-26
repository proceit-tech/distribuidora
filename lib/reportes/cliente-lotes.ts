import { respuestaLotesValida, validarFiltrosLotes } from "@/lib/reportes/lotes-plan";
import type { LotesFiltros, LotesRespuestaApi } from "@/types/reportes";

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

/** Consulta la API y valida filtros, HTTP y FORMA: ante cualquier falla devuelve error SIN datos (la pantalla descarta lo anterior; nunca se muestra ni se exporta una foto vieja como actual). */
export async function pedirLotes(f: LotesFiltros, pagina: number, buscar: (url: string) => Promise<Response> = (u) => fetch(u, { cache: "no-store" })): Promise<{ datos: LotesRespuestaApi | null; error: string }> {
  let invalido = "";

  try {
    invalido = validarFiltrosLotes(f);
  } catch {
    invalido = "Filtros no válidos.";
  }
  if (invalido) return { datos: null, error: invalido };

  let r: Response;

  try {
    r = await buscar(`/api/reportes/lotes?${queryStringLotes(f, { pagina: String(pagina), tamano: "50" })}`);
  } catch {
    return { datos: null, error: "No hubo conexión para generar el reporte." };
  }

  const j = (await r.json().catch(() => null)) as unknown;

  if (!r.ok) return { datos: null, error: `${(j as { error?: string } | null)?.error ?? "No fue posible generar el reporte."} (código ${r.status})` };
  if (!respuestaLotesValida(j)) return { datos: null, error: "La respuesta del reporte no tiene el formato esperado." };

  return { datos: j as LotesRespuestaApi, error: "" };
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
