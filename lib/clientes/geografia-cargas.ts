/**
 * CLI-D03 — cargas geográficas (Departamento → Distrito → Ciudad) por dirección con IDENTIDAD ESTABLE (`clave`, nunca el índice de un arreglo) y tokens por dirección: cambiar departamento, distrito
 * o país, o quitar la dirección, invalida las respuestas y los errores pendientes de esa dirección. Puro (sin React ni red); la precarga de edición usa los mismos tokens, de modo que una
 * precarga antigua no puede reemplazar la selección posterior del operador.
 */
export type OpcionGeografica = { codigo?: string | number; nombre: string };

export function crearCargasGeograficas(deps: {
  pedirDistritos: (departamento: string) => Promise<OpcionGeografica[]>;
  pedirCiudades: (departamento: string, distrito: string) => Promise<OpcionGeografica[]>;
  alDistritos: (clave: string, opciones: OpcionGeografica[]) => void;
  alCiudades: (clave: string, opciones: OpcionGeografica[]) => void;
  alError: (mensaje: string) => void;
}) {
  const tokens = new Map<string, { d: number; c: number }>();
  const t = (clave: string) => {
    let x = tokens.get(clave);

    if (!x) { x = { d: 0, c: 0 }; tokens.set(clave, x); }

    return x;
  };
  const msg = (e: unknown, defecto: string) => (e instanceof Error && e.message ? e.message : defecto);

  async function cargarCiudades(clave: string, departamento: string, distrito: string) {
    const mio = ++t(clave).c;

    try {
      const r = await deps.pedirCiudades(departamento, distrito);

      if (tokens.has(clave) && mio === t(clave).c) deps.alCiudades(clave, r);
    } catch (e) {
      if (tokens.has(clave) && mio === t(clave).c) deps.alError(msg(e, "No fue posible cargar las ciudades."));
    }
  }

  async function cargarDistritos(clave: string, departamento: string): Promise<boolean> {
    const mio = ++t(clave).d;

    try {
      const r = await deps.pedirDistritos(departamento);
      const vigente = tokens.has(clave) && mio === t(clave).d;

      if (vigente) deps.alDistritos(clave, r);

      return vigente;
    } catch (e) {
      if (tokens.has(clave) && mio === t(clave).d) deps.alError(msg(e, "No fue posible cargar los distritos."));

      return false;
    }
  }

  return {
    async elegirDepartamento(clave: string, departamento: string) {
      const x = t(clave);

      x.c += 1; // la ciudad pendiente de un distrito anterior deja de valer
      deps.alCiudades(clave, []);
      deps.alDistritos(clave, []);

      if (!departamento) { x.d += 1; return; }

      await cargarDistritos(clave, departamento);
    },
    async elegirDistrito(clave: string, departamento: string, distrito: string) {
      t(clave).c += 1;
      deps.alCiudades(clave, []);

      if (!distrito || !departamento) return;

      await cargarCiudades(clave, departamento, distrito);
    },
    /** Cambio de país: se descarta toda carga pendiente y los catálogos de esa dirección. */
    cambiarPais(clave: string) {
      const x = t(clave);

      x.d += 1;
      x.c += 1;
      deps.alDistritos(clave, []);
      deps.alCiudades(clave, []);
    },
    /** Precarga de una dirección ya guardada (distritos y, si hay distrito, ciudades). Compite con las elecciones del operador mediante los mismos tokens. */
    async precargar(clave: string, departamento: string, distrito: string) {
      const antesC = t(clave).c;
      const vigente = await cargarDistritos(clave, departamento);

      // si el operador eligió otro departamento/distrito mientras tanto, la precarga de ciudades ya no vale
      if (!vigente || !distrito || t(clave).c !== antesC) return;

      await cargarCiudades(clave, departamento, distrito);
    },
    /** La dirección se quitó: nada pendiente puede transferirse a otra. */
    quitar(clave: string) {
      tokens.delete(clave);
      deps.alDistritos(clave, []);
      deps.alCiudades(clave, []);
    },
  };
}
