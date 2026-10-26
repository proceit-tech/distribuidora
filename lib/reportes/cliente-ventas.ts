import { respuestaVentasValida } from "@/lib/reportes/ventas-presentacion";
import type { VentasFiltros, VentasRespuestaApi } from "@/types/reportes";

/** Query string con TODOS los filtros vigentes (las fechas siempre explícitas); los campos propios de una vista solo viajan en esa vista. */
export function queryStringVentas(f: VentasFiltros, extra: Record<string, string> = {}) {
  const sp = new URLSearchParams();
  const campos: [string, string][] = [
    ["vista", f.vista], ["desde", f.desde], ["hasta", f.hasta], ["sucursalId", f.sucursalId], ["tipo", f.tipo], ["moneda", f.moneda], ["q", f.q],
    ["clienteId", f.clienteId], ["vendedor", f.vendedor],
    ["producto", f.vista === "PRODUCTOS" ? f.producto : ""], ["estado", f.vista === "DOCUMENTOS" ? f.estado : ""],
    ["situacion", f.vista === "DOCUMENTOS" && f.situacion !== "TODAS" ? f.situacion : ""],
  ];
  for (const [k, v] of campos) if (v) sp.set(k, v);
  for (const [k, v] of Object.entries(extra)) sp.set(k, v);
  return sp.toString();
}

/** Filtros normalizados por vista: lo que no viaja (producto fuera de Productos, estado/situación fuera de Documentos) queda vacío, para comparar con la respuesta campo a campo. */
export function filtrosVentasNormalizados(f: VentasFiltros): VentasFiltros {
  return {
    ...f,
    // Igual que el servidor: textos recortados (espacios y 80 caracteres) para que la respuesta coincida campo a campo.
    q: f.q.trim().slice(0, 80),
    producto: f.vista === "PRODUCTOS" ? f.producto.trim().slice(0, 80) : "",
    estado: f.vista === "DOCUMENTOS" ? f.estado : "",
    situacion: f.vista === "DOCUMENTOS" ? f.situacion : "TODAS",
  };
}

async function mensaje(r: Response, fallback: string) {
  const j = (await r.json().catch(() => null)) as { error?: string } | null;
  return j?.error ?? fallback;
}

/**
 * Consulta la API y valida HTTP y FORMA: ante red caída, 400/401/403/409/503/500, JSON inválido o respuesta incompleta devuelve error SIN datos (la pantalla descarta lo anterior: nunca se muestran ni
 * se exportan totales viejos como si fueran actuales).
 */
export async function pedirVentas(f: VentasFiltros, pagina: number, buscar: (url: string) => Promise<Response> = (u) => fetch(u, { cache: "no-store" })): Promise<{ datos: VentasRespuestaApi | null; error: string }> {
  let r: Response;

  try {
    r = await buscar(`/api/reportes/ventas?${queryStringVentas(f, { pagina: String(pagina), tamano: "50" })}`);
  } catch {
    return { datos: null, error: "No hubo conexión para generar el informe." };
  }

  const j = (await r.json().catch(() => null)) as unknown;

  if (!r.ok) return { datos: null, error: `${(j as { error?: string } | null)?.error ?? "No fue posible generar el informe."} (código ${r.status})` };
  if (!respuestaVentasValida(j)) return { datos: null, error: "La respuesta del informe no tiene el formato esperado." };

  return { datos: j, error: "" };
}

export async function descargarVentas(f: VentasFiltros, formato: "xlsx" | "pdf") {
  const r = await fetch(`/api/reportes/ventas/exportar?${queryStringVentas(f, { formato })}`, { cache: "no-store" });
  if (!r.ok) throw new Error(await mensaje(r, "No fue posible exportar el informe."));
  const nombre = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? `Informe_Ventas.${formato}`;
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
