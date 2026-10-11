import { ErrorValidacion } from "@/lib/proveedores/errores";
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

/** Error de la API con el campo (ruta) al que corresponde, si lo indica; la pantalla lo enfoca y abre su pestaña. */
export async function errorDeRespuesta(respuesta: Response, porDefecto: string): Promise<ErrorValidacion> {
  try {
    const json = (await respuesta.json()) as { error?: string; campo?: string | null };

    return new ErrorValidacion(json.error || porDefecto, json.campo ?? null, respuesta.status);
  } catch {
    return new ErrorValidacion(porDefecto, null, respuesta.status);
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
