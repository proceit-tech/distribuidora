/**
 * PRV-R03-01 — autorización de GET /api/proveedores por FINALIDAD, decidida ANTES de conceder la excepción de lectura del alta. Función pura.
 * Solo los catálogos mínimos (`modo=catalogos`) y la geografía válida (`catalogo` conocido, sin `modo`) admiten PROVEEDORES.CREAR además de VER. Cualquier otra consulta que pueda devolver proveedores
 * (la lista, un `catalogo` vacío o desconocido, combinaciones inconsistentes) exige VER o se rechaza; nunca se atiende con solo CREAR.
 */
export type PermisosProveedor = { ver: boolean; crear: boolean };
export const CATALOGOS_GEOGRAFICOS = ["paises", "departamentos", "distritos", "ciudades"] as const;
export type FinalidadGet = "GEOGRAFIA" | "CATALOGOS" | "LISTA" | "INVALIDA";
export type DecisionGet = { tipo: "permitida"; finalidad: FinalidadGet } | { tipo: "invalida" } | { tipo: "denegada" };

export function finalidadGet(url: URL): FinalidadGet {
  const p = url.searchParams;

  if (p.has("catalogo")) {
    const valor = p.get("catalogo") ?? "";

    // `catalogo` vacío, sin valor o desconocido, o junto a `modo`, es inconsistente: no cae a la lista.
    if (!(CATALOGOS_GEOGRAFICOS as readonly string[]).includes(valor) || p.has("modo")) return "INVALIDA";

    return "GEOGRAFIA";
  }

  return p.get("modo") === "catalogos" ? "CATALOGOS" : "LISTA";
}

export function decidirGet(url: URL, permisos: PermisosProveedor): DecisionGet {
  const finalidad = finalidadGet(url);

  if (finalidad === "INVALIDA") return { tipo: "invalida" };
  if (finalidad === "GEOGRAFIA" || finalidad === "CATALOGOS") return permisos.ver || permisos.crear ? { tipo: "permitida", finalidad } : { tipo: "denegada" };

  return permisos.ver ? { tipo: "permitida", finalidad } : { tipo: "denegada" };
}

/** Solo la finalidad LISTA puede devolver filas de proveedores; geografía y catálogos nunca. */
export const puedeDevolverProveedores = (f: FinalidadGet) => f === "LISTA";
