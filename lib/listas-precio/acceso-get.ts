/**
 * LPR-D01 — autorización de GET /api/listas-precio por FINALIDAD, antes de conceder la excepción del alta. Función pura.
 * Solo `modo=catalogos` (y únicamente ese parámetro) admite LISTAS_PRECIO.CREAR además de VER; para CREAR-only la respuesta es MÍNIMA (sin clientes, productos con costos/precios ni listas existentes: política
 * de visibilidad pendiente). Cualquier otra consulta (la lista, `modo` vacío o desconocido, parámetros extra) exige VER; `modo=catalogos` combinado con otros parámetros es inconsistente (400).
 */
export type PermisosListas = { ver: boolean; crear: boolean };
export type FinalidadGetListas = "CATALOGOS" | "LISTA" | "INVALIDA";
export type DecisionGetListas = { tipo: "permitida"; finalidad: FinalidadGetListas; completo: boolean } | { tipo: "invalida" } | { tipo: "denegada" };

export function finalidadGetListas(url: URL): FinalidadGetListas {
  const p = url.searchParams;
  const claves = [...new Set([...p.keys()])];

  // `modo` repetido (p. ej. modo=catalogos&modo=lista) es ambiguo: inconsistente.
  if (p.getAll("modo").length > 1) return "INVALIDA";
  if (p.get("modo") === "catalogos") return claves.length === 1 ? "CATALOGOS" : "INVALIDA";

  return "LISTA";
}

export function decidirGetListas(url: URL, permisos: PermisosListas): DecisionGetListas {
  const finalidad = finalidadGetListas(url);

  if (finalidad === "INVALIDA") return { tipo: "invalida" };
  if (finalidad === "CATALOGOS") return permisos.ver || permisos.crear ? { tipo: "permitida", finalidad, completo: permisos.ver } : { tipo: "denegada" };

  return permisos.ver ? { tipo: "permitida", finalidad, completo: true } : { tipo: "denegada" };
}
