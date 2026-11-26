/** Parámetros de paginación de las listas de usuarios y vendedores (acotados; nunca confiar en el navegador). */
export function leerPagina(url: URL): { q: string; pagina: number; porPagina: number } {
  const entero = (v: string | null, def: number, max: number) => {
    const n = Number(v);

    return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : def;
  };

  return { q: (url.searchParams.get("q") ?? "").trim().slice(0, 100), pagina: entero(url.searchParams.get("pagina"), 1, 100000), porPagina: entero(url.searchParams.get("porPagina"), 10, 50) };
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lista de códigos de perfil del cuerpo: arreglo de textos del catálogo (la base valida la pertenencia); sin repetidos. */
export function leerCodigos(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length > 20 || !v.every((x) => typeof x === "string" && /^[A-Z_]{2,40}$/.test(x))) return null;

  return [...new Set(v as string[])];
}
