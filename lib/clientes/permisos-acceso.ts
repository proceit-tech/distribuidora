/**
 * CLI-D01 — autorización por FINALIDAD de GET /api/clientes. Función pura. Quien solo tiene CLIENTES.CREAR puede leer los catálogos mínimos y la geografía que necesita la alta; la lista de
 * clientes, las fichas y cualquier otro dato de clientes exigen CLIENTES.VER. Nunca se concede un permiso por otro.
 */
export type PermisosCliente = { ver: boolean; crear: boolean };
export type Finalidad = "GEOGRAFIA" | "CATALOGOS" | "LISTA" | "OTRO";

export function finalidadGet(url: URL): Finalidad {
  if (url.searchParams.get("catalogo")) return "GEOGRAFIA";

  const modo = url.searchParams.get("modo");

  if (modo === "catalogos") return "CATALOGOS";
  if (modo === "lista") return "LISTA";

  return "OTRO";
}

export function puedeLeer(finalidad: Finalidad, p: PermisosCliente): boolean {
  if (finalidad === "GEOGRAFIA" || finalidad === "CATALOGOS") return p.ver || p.crear;

  return p.ver;
}
