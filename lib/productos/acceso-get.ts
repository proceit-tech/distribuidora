/**
 * PRD-D01 — autorización de GET /api/productos por FINALIDAD, decidida ANTES de conceder la excepción de lectura del alta. Función pura.
 * Solo `modo=catalogos` (y únicamente ese parámetro) admite PRODUCTOS.CREAR además de VER, y para CREAR-only la lista de productos existentes (`catalogos.productos`, política C24 pendiente) NO se
 * devuelve. Cualquier otra consulta (la lista, `modo` vacío o desconocido, parámetros extra) exige VER; combinar `modo=catalogos` con otros parámetros es una consulta inconsistente (400).
 */
export type PermisosProducto = { ver: boolean; crear: boolean };
export type FinalidadGet = "CATALOGOS" | "LISTA" | "INVALIDA";
export type DecisionGet = { tipo: "permitida"; finalidad: FinalidadGet; incluirProductos: boolean } | { tipo: "invalida" } | { tipo: "denegada" };

export function finalidadGet(url: URL): FinalidadGet {
  const p = url.searchParams;
  const claves = [...new Set([...p.keys()])];

  if (p.get("modo") === "catalogos") return claves.length === 1 ? "CATALOGOS" : "INVALIDA";

  return "LISTA";
}

export function decidirGet(url: URL, permisos: PermisosProducto): DecisionGet {
  const finalidad = finalidadGet(url);

  if (finalidad === "INVALIDA") return { tipo: "invalida" };
  if (finalidad === "CATALOGOS") return permisos.ver || permisos.crear ? { tipo: "permitida", finalidad, incluirProductos: permisos.ver } : { tipo: "denegada" };

  return permisos.ver ? { tipo: "permitida", finalidad, incluirProductos: true } : { tipo: "denegada" };
}
