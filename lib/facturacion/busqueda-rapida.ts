/**
 * Regla pura de la búsqueda rápida de Nueva factura (cliente y producto): qué hacer al presionar Enter con el texto escrito (p. ej. un lector de códigos de barras).
 * Solo se selecciona sin ambigüedad: una única coincidencia EXACTA (código, GTIN o documento) o un único resultado habilitado. Nunca se elige «el primero» entre varios.
 */
export type DecisionEnter<T> = { elegido: T | null; motivo: "" | "SIN_RESULTADOS" | "VARIOS" | "CODIGO_PARECIDO" };

export function elegirPorEnter<T>(habilitados: T[], texto: string, exacto: (t: T, texto: string) => boolean, parecido?: (t: T, texto: string) => boolean): DecisionEnter<T> {
  const t = texto.trim();

  if (habilitados.length === 0) return { elegido: null, motivo: "SIN_RESULTADOS" };

  const iguales = habilitados.filter((x) => exacto(x, t));

  if (iguales.length === 1) return { elegido: iguales[0], motivo: "" };
  // E05: un único resultado cuyo código solo difiere en CEROS INICIALES del texto (001234 vs 1234) es otro código: no se elige solo; el operador lo confirma en la lista.
  if (habilitados.length === 1 && parecido?.(habilitados[0], t)) return { elegido: null, motivo: "CODIGO_PARECIDO" };
  if (habilitados.length === 1) return { elegido: habilitados[0], motivo: "" };

  return { elegido: null, motivo: "VARIOS" };
}

export const MENSAJE_ENTER: Record<"SIN_RESULTADOS" | "VARIOS" | "CODIGO_PARECIDO", string> = {
  CODIGO_PARECIDO: "No hay un código idéntico: el resultado solo difiere en los ceros iniciales. Elíjalo de la lista si es el correcto.",
  SIN_RESULTADOS: "Sin resultados habilitados para ese texto.",
  VARIOS: "Hay varios resultados: elija uno de la lista.",
};

/* ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 * C02 / FAT-D01 — controlador de la búsqueda rápida (clientes y productos). Puro (sin React ni red): temporizadores y peticiones inyectados, probado con secuencias de eventos.
 * Cada cambio de texto INVALIDA al instante (antes del debounce) lista, selección activa y consultas directas; flechas, Enter y clic solo operan sobre resultados de la consulta VIGENTE;
 * respuestas y errores tardíos (también los de la consulta directa de Enter) se descartan si el texto cambió.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export const ESPERA_BUSQUEDA_RAPIDA_MS = 300;
export const MAX_VISIBLES = 8;

export type EstadoBuscador<T> = {
  texto: string;
  /** Texto exacto (recortado) al que corresponden `items`; null mientras no hay resultados vigentes. */
  consulta: string | null;
  items: T[];
  total: number;
  cargando: boolean;
  error: string;
  activo: number;
  aviso: string;
  /** Consulta directa de Enter en curso. */
  buscando: boolean;
};

export type ConfigBuscador<T> = {
  habilitado: (t: T) => boolean;
  exacto: (t: T, texto: string) => boolean;
  /** E05: código distinto que solo difiere en ceros iniciales del texto (no se elige solo con Enter). */
  parecido?: (t: T, texto: string) => boolean;
  titulo: (t: T) => string;
  alElegir: (t: T) => void;
};

export function crearBuscadorRapido<T>(deps0: {
  buscar: (q: string) => Promise<{ items: T[]; total: number }>;
  programar: (fn: () => void, ms: number) => unknown;
  cancelar: (t: unknown) => void;
  alCambiar: (e: EstadoBuscador<T>) => void;
} & ConfigBuscador<T>) {
  // La configuración (moneda, permisos, callbacks de la pantalla) puede cambiar entre renders: `configurar` la actualiza sin recrear el controlador.
  let deps = deps0;

  let e: EstadoBuscador<T> = { texto: "", consulta: null, items: [], total: 0, cargando: false, error: "", activo: -1, aviso: "", buscando: false };
  let tokenLista = 0;
  let tokenDirecta = 0;
  let timer: unknown = null;
  let enCurso = false;

  const emitir = (p: Partial<EstadoBuscador<T>>) => { e = { ...e, ...p }; deps.alCambiar(e); };
  const parar = () => { tokenLista += 1; tokenDirecta += 1; enCurso = false; if (timer !== null) { deps.cancelar(timer); timer = null; } };
  const mensaje = (x: unknown) => (x instanceof Error ? x.message : "No fue posible buscar.");
  const visibles = () => (e.consulta !== null && e.consulta === e.texto.trim() && !e.cargando ? e.items.slice(0, MAX_VISIBLES) : []);

  async function listar(q: string) {
    const mio = ++tokenLista;

    enCurso = true;
    emitir({ cargando: true, error: "" });
    try {
      const r = await deps.buscar(q);

      if (mio !== tokenLista || q !== e.texto.trim()) return;

      enCurso = false;
      emitir({ items: r.items, total: r.total, consulta: q, cargando: false, error: "", activo: -1 });
    } catch (err) {
      if (mio !== tokenLista || q !== e.texto.trim()) return;

      enCurso = false;
      emitir({ items: [], total: 0, consulta: q, cargando: false, error: mensaje(err), activo: -1 });
    }
  }

  function seleccionar(t: T) {
    deps.alElegir(t);
    api.escribir("");
    emitir({ aviso: `«${deps.titulo(t)}» añadido.` });
  }

  const api = {
    estado: () => e,
    configurar(c: ConfigBuscador<T>) { deps = { ...deps, ...c }; },
    visibles,
    /** Cada cambio de texto invalida de inmediato lista, selección activa y consultas pendientes; la búsqueda se reprograma con el debounce. */
    escribir(texto: string) {
      parar();

      const q = texto.trim();

      emitir({ texto, consulta: null, items: [], total: 0, cargando: true, error: "", activo: -1, aviso: "", buscando: false });
      timer = deps.programar(() => { timer = null; void listar(q); }, ESPERA_BUSQUEDA_RAPIDA_MS);
    },
    /** Al abrir la lista: primera carga inmediata si no hay consulta vigente ni una en curso. */
    abrir() { if (e.consulta === null && timer === null && !enCurso) void listar(e.texto.trim()); },
    /** Flechas: solo sobre resultados vigentes. */
    mover(delta: 1 | -1) {
      const n = visibles().length;

      if (n === 0) return;

      emitir({ activo: delta === 1 ? Math.min(e.activo + 1, n - 1) : Math.max(e.activo - 1, 0) });
    },
    resaltar(i: number) { if (i >= 0 && i < visibles().length) emitir({ activo: i }); },
    /** Clic: solo un resultado vigente y habilitado de la lista actual. */
    elegir(t: T) { if (visibles().includes(t) && deps.habilitado(t)) seleccionar(t); },
    /**
     * Enter: con opción resaltada vigente la elige; si no, consulta el texto actual y elige solo con coincidencia exacta o un único resultado habilitado (lector de código de barras / GTIN).
     * Si el texto cambia mientras la consulta está pendiente, su resultado o error se descartan y no selecciona nada.
     */
    async enter() {
      const v = visibles();

      if (e.activo >= 0 && v[e.activo] && deps.habilitado(v[e.activo])) { seleccionar(v[e.activo]); return; }

      const texto = e.texto.trim();

      if (!texto) return;

      const mio = ++tokenDirecta;

      emitir({ buscando: true, aviso: "" });
      try {
        const r = await deps.buscar(texto);

        if (mio !== tokenDirecta || texto !== e.texto.trim()) return;

        emitir({ buscando: false });

        const decision = elegirPorEnter(r.items.filter(deps.habilitado), texto, deps.exacto, deps.parecido);

        if (decision.elegido) seleccionar(decision.elegido);
        else if (decision.motivo) emitir({ aviso: MENSAJE_ENTER[decision.motivo] });
      } catch (err) {
        if (mio !== tokenDirecta || texto !== e.texto.trim()) return;

        emitir({ buscando: false, aviso: mensaje(err) });
      }
    },
    /**
     * C02-R02-01: Escape o pérdida de foco. Invalida la lista pendiente, el temporizador y la consulta directa de Enter: ningún resultado ni error posterior al cierre selecciona, añade o se informa;
     * se limpian la opción resaltada y «Buscando…». El texto se conserva; al reabrir se hace una consulta nueva.
     */
    cerrar() { parar(); emitir({ consulta: null, items: [], total: 0, cargando: false, error: "", activo: -1, buscando: false }); },
    reiniciar() { parar(); emitir({ texto: "", consulta: null, items: [], total: 0, cargando: false, error: "", activo: -1, aviso: "", buscando: false }); },
  };

  return api;
}
