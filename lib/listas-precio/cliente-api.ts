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

/** LPR-D02: las listas y los permisos de la sesión del servidor (la pantalla solo ofrece «Nueva lista» con CREAR). */
export async function cargarListasConPermisos(): Promise<{ listas: ListaPrecioFila[]; puedeCrear: boolean }> {
  const r = await fetch("/api/listas-precio", { cache: "no-store" });
  if (!r.ok) throw new Error(await mensajeError(r, "No fue posible cargar las listas de precios."));
  const j = (await r.json()) as { listas: ListaPrecioFila[]; permisos?: { crear?: boolean } };

  return { listas: j.listas, puedeCrear: j.permisos?.crear === true };
}

export async function cargarListas(): Promise<ListaPrecioFila[]> {
  return (await cargarListasConPermisos()).listas;
}

/** LPR-D02: la ficha y el permiso EDITAR de la sesión del servidor (sin él, consulta). */
export async function cargarListaConPermisos(id: string): Promise<{ lista: ListaPrecioDetalle; puedeEditar: boolean } | null> {
  const r = await fetch(`/api/listas-precio/${id}`, { cache: "no-store" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(await mensajeError(r, "No fue posible cargar la lista de precios."));
  const j = (await r.json()) as { lista: ListaPrecioDetalle; permisos?: { editar?: boolean } };

  return { lista: j.lista, puedeEditar: j.permisos?.editar === true };
}

export async function cargarLista(id: string): Promise<ListaPrecioDetalle | null> {
  return (await cargarListaConPermisos(id))?.lista ?? null;
}

export async function guardarLista(datos: NuevaListaPrecio, id?: string): Promise<void> {
  const r = await fetch(id ? `/api/listas-precio/${id}` : "/api/listas-precio", {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string; campo?: string | null };

    throw Object.assign(new Error(j.error || "No fue posible guardar la lista de precios."), { campo: j.campo ?? null });
  }
}
