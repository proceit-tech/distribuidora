import { ErrorValidacion } from "@/lib/productos/errores";
import type { CatalogoProductos } from "@/types/productos";

/** Error de la API como ErrorValidacion (conserva el campo para enfocarlo en la pantalla). */
export async function errorDeRespuesta(respuesta: Response, porDefecto: string) {
  try {
    const json = (await respuesta.json()) as { error?: string; campo?: string | null };

    return new ErrorValidacion(json.error || porDefecto, json.campo ?? null, respuesta.status);
  } catch {
    return new ErrorValidacion(porDefecto, null, respuesta.status);
  }
}

/** Lectura del mensaje de error de la API (nunca datos ficticios). */
export async function mensajeError(respuesta: Response, porDefecto: string) {
  try {
    const json = (await respuesta.json()) as { error?: string };
    return json.error || porDefecto;
  } catch {
    return porDefecto;
  }
}

export async function cargarCatalogosConPermisos(): Promise<{ catalogos: CatalogoProductos; puedeVer: boolean }> {
  const respuesta = await fetch("/api/productos?modo=catalogos", { cache: "no-store" });
  if (!respuesta.ok) {
    throw new Error(await mensajeError(respuesta, "No fue posible cargar los catálogos."));
  }
  const json = (await respuesta.json()) as { catalogos: CatalogoProductos; permisos?: { ver?: boolean } };
  return { catalogos: json.catalogos, puedeVer: json.permisos?.ver === true };
}

export async function cargarCatalogos(): Promise<CatalogoProductos> {
  return (await cargarCatalogosConPermisos()).catalogos;
}
