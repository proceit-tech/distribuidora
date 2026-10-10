import type { CatalogoProductos } from "@/types/productos";

/** Lectura del mensaje de error de la API (nunca datos ficticios). */
export async function mensajeError(respuesta: Response, porDefecto: string) {
  try {
    const json = (await respuesta.json()) as { error?: string };
    return json.error || porDefecto;
  } catch {
    return porDefecto;
  }
}

export async function cargarCatalogos(): Promise<CatalogoProductos> {
  const respuesta = await fetch("/api/productos?modo=catalogos", { cache: "no-store" });
  if (!respuesta.ok) {
    throw new Error(await mensajeError(respuesta, "No fue posible cargar los catálogos."));
  }
  const json = (await respuesta.json()) as { catalogos: CatalogoProductos };
  return json.catalogos;
}
