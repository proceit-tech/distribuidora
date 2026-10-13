/**
 * Carga de la pantalla de Catálogos de productos (CAT-A01/A02), separada de React para probarla sin navegador:
 *  · CAT-A01: la lista principal Y los catálogos auxiliares (Familias para Líneas; Categorías para Familias/Líneas) se verifican por HTTP y por forma. Un auxiliar con
 *    401/403/500 o sin la clave esperada NO se convierte en una lista vacía: se informa el error y se bloquean las asociaciones (no se guarda con opciones insuficientes).
 *  · CAT-A02: «compuerta» de respuestas — solo la última solicitud iniciada puede escribir en pantalla; una respuesta lenta de otra pestaña se descarta.
 */
export type TipoCatalogoCarga = "categorias" | "marcas" | "familias" | "lineas";

export type FilaCatalogo = {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  activo: boolean;
  productos: number;
  /** Última modificación (microsegundos, UTC): precondición de la edición (CAT-A06). */
  version?: string;
  familiaId?: string;
  familia?: string;
  categoriaId?: string | null;
  categoria?: string | null;
  /** Categoría: familias vinculadas. Familia: líneas vinculadas. Línea/Marca: 0. Conteo real (no inferido de «productos»). */
  nFamilias?: number;
  nLineas?: number;
};

export type Permisos = { crear: boolean; editar: boolean };

export type ResultadoCarga = {
  filas: FilaCatalogo[];
  permisos: Permisos;
  familias: FilaCatalogo[] | null;
  categorias: FilaCatalogo[] | null;
  /** Error de la lista principal (no hay datos fiables que mostrar). */
  error: string;
  /** Error de un catálogo auxiliar: la lista se muestra, pero no se permite crear ni editar asociaciones. */
  errorAuxiliar: string;
};

type Fetch = (url: string) => Promise<Response>;

async function leerJson<T>(r: Response): Promise<T | null> {
  try {
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

async function auxiliar(f: Fetch, url: string, clave: "familias" | "categorias", nombre: string): Promise<{ filas: FilaCatalogo[] | null; error: string }> {
  let r: Response;

  try {
    r = await f(url);
  } catch {
    return { filas: null, error: `No hubo conexión para cargar ${nombre}.` };
  }

  const j = await leerJson<Record<string, unknown> & { error?: string }>(r);

  if (!r.ok) return { filas: null, error: `${j?.error ?? `No fue posible cargar ${nombre}.`} (código ${r.status})` };
  if (!j || !Array.isArray(j[clave])) return { filas: null, error: `La respuesta de ${nombre} no tiene el formato esperado.` };

  return { filas: j[clave] as FilaCatalogo[], error: "" };
}

export async function cargarCatalogoCompleto(tipo: TipoCatalogoCarga, f: Fetch): Promise<ResultadoCarga> {
  const vacio: ResultadoCarga = { filas: [], permisos: { crear: false, editar: false }, familias: null, categorias: null, error: "", errorAuxiliar: "" };
  const [principal, fam, cat] = await Promise.all([
    f(`/api/productos/${tipo}`).then(
      (r) => ({ r }),
      () => ({ r: null }),
    ),
    tipo === "lineas" ? auxiliar(f, "/api/productos/familias", "familias", "las familias") : Promise.resolve(null),
    tipo === "familias" || tipo === "lineas" ? auxiliar(f, "/api/productos/categorias", "categorias", "las categorías") : Promise.resolve(null),
  ]);

  if (!principal.r) return { ...vacio, error: "No hubo conexión para cargar el catálogo." };

  const j = await leerJson<Record<string, unknown> & { error?: string; permisos?: Permisos }>(principal.r);

  if (!principal.r.ok) return { ...vacio, error: j?.error ?? `No fue posible cargar el catálogo (código ${principal.r.status}).` };
  if (!j || !Array.isArray(j[tipo])) return { ...vacio, error: "La respuesta del catálogo no tiene el formato esperado." };

  const errores = [fam?.error, cat?.error].filter(Boolean) as string[];

  return {
    filas: j[tipo] as FilaCatalogo[],
    permisos: j.permisos ?? { crear: false, editar: false },
    familias: fam?.filas ?? null,
    categorias: cat?.filas ?? null,
    error: "",
    errorAuxiliar: errores.join(" · "),
  };
}

/** Solo la última solicitud iniciada es «vigente»: las anteriores, aunque respondan después, no deben tocar el estado. */
export function crearCompuerta() {
  let n = 0;

  return { nueva: () => ++n, vigente: (id: number) => id === n };
}

/** Texto de la confirmación al inactivar (CAT-A05). null = no hace falta confirmar. Conteos reales, sin cascada. */
export function textoConfirmarInactivacion(tipo: TipoCatalogoCarga, fila: FilaCatalogo): string | null {
  if (!fila.activo) return null;

  const partes: string[] = [];

  if (fila.productos > 0) partes.push(`Tiene ${fila.productos} producto(s) asociado(s) (total, activos e inactivos); conservarán el vínculo.`);
  if (tipo === "categorias" && (fila.nFamilias ?? 0) > 0) {
    partes.push(`Tiene ${fila.nFamilias} familia(s) y ${fila.nLineas ?? 0} línea(s) vinculada(s); NO se inactivan automáticamente y conservan su categoría: revíselas si corresponde.`);
  }
  if (tipo === "familias") partes.push(`Sus líneas${(fila.nLineas ?? 0) > 0 ? ` (${fila.nLineas})` : ""} no se inactivan automáticamente.`);

  return partes.length > 0 ? `¿Inactivar «${fila.nombre}»? ${partes.join(" ")}` : null;
}
