import type { CatalogoListasPrecio, ListaPrecioDetalle, ListaPrecioFila, NuevaListaPrecio } from "@/types/lista-precio";

/** Lectura del mensaje de error de la API (nunca datos ficticios). */
async function mensajeError(respuesta: Response, porDefecto: string) {
  try {
    const json = (await respuesta.json()) as { error?: string };
    return json.error || porDefecto;
  } catch {
    return porDefecto;
  }
}

export async function cargarCatalogosListas(): Promise<CatalogoListasPrecio> {
  const r = await fetch("/api/listas-precio?modo=catalogos", { cache: "no-store" });
  if (!r.ok) throw new Error(await mensajeError(r, "No fue posible cargar los catálogos."));
  return ((await r.json()) as { catalogos: CatalogoListasPrecio }).catalogos;
}

export async function cargarListas(): Promise<ListaPrecioFila[]> {
  const r = await fetch("/api/listas-precio", { cache: "no-store" });
  if (!r.ok) throw new Error(await mensajeError(r, "No fue posible cargar las listas de precios."));
  return ((await r.json()) as { listas: ListaPrecioFila[] }).listas;
}

export async function cargarLista(id: string): Promise<ListaPrecioDetalle | null> {
  const r = await fetch(`/api/listas-precio/${id}`, { cache: "no-store" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(await mensajeError(r, "No fue posible cargar la lista de precios."));
  return ((await r.json()) as { lista: ListaPrecioDetalle }).lista;
}

export async function guardarLista(datos: NuevaListaPrecio, id?: string): Promise<void> {
  const r = await fetch(id ? `/api/listas-precio/${id}` : "/api/listas-precio", {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  });
  if (!r.ok) throw new Error(await mensajeError(r, "No fue posible guardar la lista de precios."));
}
