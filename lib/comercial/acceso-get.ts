/**
 * CC-D01 — autorización de GET /api/catalogos-comerciales/tipos-cambio por FINALIDAD, antes de conceder la excepción del alta. Función pura.
 * Solo `modo=monedas` (y únicamente ese parámetro) admite LISTAS_PRECIO.CREAR además de VER, y devuelve SOLO las monedas activas (sin PYG) necesarias para registrar una cotización: nada del historial, de los
 * catálogos de canales/zonas, de clientes, listas ni precios. Cualquier otra consulta (la lista, `historial`, `modo` vacío o desconocido, parámetros extra) exige VER; `modo=monedas` repetido o combinado
 * con otros parámetros es inconsistente (400) y nunca se interpreta como otra finalidad.
 */
export type PermisosComercialGet = { ver: boolean; crear: boolean };
export type FinalidadComercial = "MONEDAS" | "LISTA" | "INVALIDA";
export type DecisionComercial = { tipo: "permitida"; finalidad: FinalidadComercial } | { tipo: "invalida" } | { tipo: "denegada" };

export function finalidadComercial(url: URL): FinalidadComercial {
  const p = url.searchParams;
  const claves = [...new Set([...p.keys()])];

  if (p.getAll("modo").length > 1) return "INVALIDA";
  if (p.get("modo") === "monedas") return claves.length === 1 ? "MONEDAS" : "INVALIDA";

  return "LISTA";
}

export function decidirGetComercial(url: URL, permisos: PermisosComercialGet): DecisionComercial {
  const finalidad = finalidadComercial(url);

  if (finalidad === "INVALIDA") return { tipo: "invalida" };
  if (finalidad === "MONEDAS") return permisos.ver || permisos.crear ? { tipo: "permitida", finalidad } : { tipo: "denegada" };

  return permisos.ver ? { tipo: "permitida", finalidad } : { tipo: "denegada" };
}
