/**
 * PRV-D03 — catálogos geográficos de Direcciones: se distingue un catálogo realmente vacío (HTTP 200 con lista vacía) de un fallo de acceso (401/403), del servicio (5xx / otros códigos) o de conexión.
 * Nunca se transforma un error en «lista vacía». Controlador puro con token: solo la consulta VIGENTE aplica su resultado o su error (los tardíos se descartan). Probado sin navegador.
 */
export type OpcionGeo = { codigo: number; nombre: string };
export type CausaFallo = "sesion" | "permiso" | "servicio" | "conexion";
export type ResultadoCatalogo = { ok: true; lista: OpcionGeo[] } | { ok: false; causa: CausaFallo; mensaje: string };

export const MENSAJES_GEO: Record<CausaFallo, string> = {
  sesion: "Su sesión ha finalizado. Inicie sesión nuevamente para cargar este catálogo.",
  permiso: "No tiene permiso para consultar este catálogo.",
  servicio: "No fue posible cargar el catálogo: falla del servicio.",
  conexion: "No hay conexión con el servidor. Verifique su red e intente de nuevo.",
};

const falla = (causa: CausaFallo, detalle = ""): ResultadoCatalogo => ({ ok: false, causa, mensaje: `${MENSAJES_GEO[causa]}${detalle}` });

export async function leerCatalogo(url: string, buscar: typeof fetch = fetch): Promise<ResultadoCatalogo> {
  let r: Response;

  try {
    r = await buscar(url, { cache: "no-store" });
  } catch {
    return falla("conexion");
  }

  if (r.status === 401) return falla("sesion");
  if (r.status === 403) return falla("permiso");
  if (!r.ok) return falla("servicio", r.status === 500 ? "" : ` (código ${r.status})`);

  try {
    const j = (await r.json()) as { datos?: OpcionGeo[] };

    return { ok: true, lista: Array.isArray(j.datos) ? j.datos : [] };
  } catch {
    return falla("servicio");
  }
}

export type EstadoCatalogo = { clave: string; lista: OpcionGeo[]; error: string; cargando: boolean };

export function crearCargaCatalogo(deps: { pedir: (url: string) => Promise<ResultadoCatalogo>; alEstado: (e: EstadoCatalogo) => void }) {
  let token = 0;

  return {
    async solicitar(clave: string, url: string) {
      const mio = ++token;

      deps.alEstado({ clave, lista: [], error: "", cargando: true });

      const r = await deps.pedir(url);

      if (mio !== token) return;

      deps.alEstado(r.ok ? { clave, lista: r.lista, error: "", cargando: false } : { clave, lista: [], error: r.mensaje, cargando: false });
    },
    /** La clave cambió o el componente se desmontó: lo pendiente deja de valer. */
    invalidar() { token += 1; },
  };
}
