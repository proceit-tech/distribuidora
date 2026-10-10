import type { CatalogoProveedores } from "@/types/proveedores";

/** Lectura del mensaje de error que devuelve la API (nunca datos ficticios). */
export async function mensajeError(respuesta: Response, porDefecto: string) {
  try {
    const json = (await respuesta.json()) as { error?: string };
    return json.error || porDefecto;
  } catch {
    return porDefecto;
  }
}

export async function cargarCatalogos(): Promise<CatalogoProveedores> {
  const respuesta = await fetch("/api/proveedores?modo=catalogos", { cache: "no-store" });
  if (!respuesta.ok) {
    throw new Error(await mensajeError(respuesta, "No fue posible cargar los catálogos."));
  }
  const json = (await respuesta.json()) as { catalogos: CatalogoProveedores };
  return json.catalogos;
}
