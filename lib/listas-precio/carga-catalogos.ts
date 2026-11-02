/**
 * Carga verificada de los catálogos del formulario de listas de precios (LPR-D04). Estados explícitos: CARGANDO / ERROR / CONFIGURADO. Solo con CONFIGURADO (HTTP OK y estructura completa, con la moneda base
 * REAL de la empresa) se puede guardar. Nunca se asume PYG ni se convierte un fallo en catálogos vacíos. Función con `fetch` inyectado: se prueba sin navegador.
 */
import type { CatalogoListasPrecio } from "@/types/lista-precio";

export type EstadoCatalogos =
  | { estado: "CARGANDO" }
  | { estado: "ERROR"; mensaje: string }
  | { estado: "CONFIGURADO"; catalogo: CatalogoListasPrecio; puedeVer: boolean };

type Fetch = (url: string) => Promise<Response>;

const LISTAS = ["monedas", "gruposCliente", "zonas", "canales", "clientes", "productos", "listasBase"] as const;

type Cuerpo = { error?: unknown; catalogos?: Record<string, unknown>; permisos?: { ver?: boolean } };

async function leerJson(r: Response): Promise<Cuerpo | null> {
  try {
    return (await r.json()) as Cuerpo;
  } catch {
    return null;
  }
}

export async function cargarCatalogosVerificados(f: Fetch): Promise<EstadoCatalogos> {
  let r: Response;

  try {
    r = await f("/api/listas-precio?modo=catalogos");
  } catch {
    return { estado: "ERROR", mensaje: "No hubo conexión con el servidor para cargar los catálogos." };
  }

  const j = await leerJson(r);

  if (!r.ok) return { estado: "ERROR", mensaje: `${typeof j?.error === "string" && j.error.trim() ? j.error : "No fue posible cargar los catálogos."} (código ${r.status})` };

  const c = j?.catalogos;

  if (!c || typeof c !== "object" || !LISTAS.every((k) => Array.isArray(c[k])) || typeof c.monedaBase !== "string" || c.monedaBase.trim() === "") {
    return { estado: "ERROR", mensaje: "La respuesta de los catálogos no tiene el formato esperado." };
  }

  return { estado: "CONFIGURADO", catalogo: c as unknown as CatalogoListasPrecio, puedeVer: j?.permisos?.ver === true };
}

/** Motivo por el que no se puede guardar (null = se puede). El borrador del formulario nunca se toca. */
export function motivoBloqueoGuardarLista(e: EstadoCatalogos): string | null {
  if (e.estado === "CARGANDO") return "Los catálogos se están cargando. Espere a que terminen; lo escrito se conserva.";
  if (e.estado === "ERROR") return `No se puede guardar porque no se cargaron los catálogos: ${e.mensaje} Lo escrito se conserva; use «Reintentar».`;

  return null;
}
