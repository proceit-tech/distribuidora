/**
 * Controladores PUROS de la búsqueda de la pantalla de NCE (AUD-PRO94-NCE-UI-ETAPA2-R01). Sin React ni red: los temporizadores y las peticiones se inyectan, de modo que las carreras
 * (escribir, esperar, Escape, cambiar de cliente, respuestas tardías o con error) se prueban con secuencias de eventos reales en `nce-busqueda.casos.ts`.
 */
import { crearControlListado } from "@/lib/facturacion/nce-entradas";

export const ESPERA_BUSQUEDA_MS = 300;
export const MIN_CARACTERES = 2;

type Programar = (fn: () => void, ms: number) => unknown;
type Cancelar = (t: unknown) => void;

export type EstadoClientes<C> = {
  texto: string;
  /** Texto exacto al que corresponden `items`; null mientras no haya resultados vigentes. */
  consulta: string | null;
  items: C[];
  pagina: number;
  totalPaginas: number;
  abierto: boolean;
  buscando: boolean;
};

export function crearBusquedaClientes<C extends { innominado: boolean }>(deps: {
  buscar: (q: string, pagina: number) => Promise<{ clientes: C[]; pagina: number; totalPaginas: number }>;
  programar: Programar;
  cancelar: Cancelar;
  alCambiar: (e: EstadoClientes<C>) => void;
  alError: (mensaje: string | null) => void;
}) {
  let e: EstadoClientes<C> = { texto: "", consulta: null, items: [], pagina: 1, totalPaginas: 1, abierto: false, buscando: false };
  let token = 0;
  let timer: unknown = null;

  const emitir = (parcial: Partial<EstadoClientes<C>>) => { e = { ...e, ...parcial }; deps.alCambiar(e); };
  const parar = () => { token += 1; if (timer !== null) { deps.cancelar(timer); timer = null; } };

  async function ejecutar(q: string, pagina: number) {
    const mio = ++token;

    emitir({ buscando: true });
    try {
      const r = await deps.buscar(q, pagina);

      if (mio !== token) return;

      emitir({ items: r.clientes, consulta: q, pagina: r.pagina, totalPaginas: r.totalPaginas, buscando: false });
      deps.alError(null);
    } catch (err) {
      if (mio !== token) return;

      emitir({ items: [], consulta: null, buscando: false });
      deps.alError((err as Error).message);
    }
  }

  return {
    estado: () => e,
    /** Cada cambio de texto INVALIDA de inmediato peticiones y resultados anteriores (antes de la espera). */
    escribir(texto: string) {
      parar();

      const q = texto.trim();

      emitir({ texto, items: [], consulta: null, pagina: 1, totalPaginas: 1, buscando: false, abierto: q.length >= MIN_CARACTERES });
      if (q.length >= MIN_CARACTERES) timer = deps.programar(() => { timer = null; void ejecutar(q, 1); }, ESPERA_BUSQUEDA_MS);
    },
    /** Escape: cierra de forma estable; ninguna respuesta pendiente la reabre. */
    cerrar() { parar(); emitir({ abierto: false, buscando: false, items: [], consulta: null }); },
    /** Reapertura EXPLÍCITA (flecha abajo): vuelve a buscar el texto actual. */
    reabrir() {
      const q = e.texto.trim();

      if (q.length < MIN_CARACTERES) return;

      parar();
      emitir({ abierto: true, items: [], consulta: null });
      void ejecutar(q, 1);
    },
    pagina(p: number) { const q = e.texto.trim(); if (q.length >= MIN_CARACTERES && e.abierto) { parar(); void ejecutar(q, p); } },
    /** Resultados que corresponden exactamente al texto actual (nunca los de una consulta anterior). */
    vigentes(): C[] { return e.abierto && !e.buscando && e.consulta !== null && e.consulta === e.texto.trim() ? e.items : []; },
    /** Enter: el primer cliente SELECCIONABLE de la consulta vigente; null si aún no hay consulta vigente. Innominado nunca. */
    primeroElegible(): C | null { return this.vigentes().find((c) => !c.innominado) ?? null; },
    /** Limpia todo (cliente elegido o desmontaje). */
    reiniciar() { parar(); emitir({ texto: "", consulta: null, items: [], pagina: 1, totalPaginas: 1, abierto: false, buscando: false }); },
  };
}

export type RespuestaFacturas<F> = { facturas: F[]; pagina: number; totalPaginas: number };

export function crearBusquedaFacturas<F>(deps: {
  pedir: (clienteId: string, q: string, pagina: number, actualizar: boolean) => Promise<RespuestaFacturas<F>>;
  programar: Programar;
  cancelar: Cancelar;
  alLimpiar: () => void;
  alResultado: (r: RespuestaFacturas<F>) => void;
  alCargando: (b: boolean) => void;
  alError: (mensaje: string | null) => void;
}) {
  const control = crearControlListado({ clienteId: "", q: "", pagina: 1 });
  let timer: unknown = null;
  let cliente = "";

  const cancelarTimer = () => { if (timer !== null) { deps.cancelar(timer); timer = null; } };

  async function cargar(clienteId: string, q: string, pagina: number, actualizar: boolean) {
    const token = control.aplicar({ clienteId, q, pagina });

    deps.alCargando(true);
    try {
      const r = await deps.pedir(clienteId, q, pagina, actualizar);

      if (!control.vigente(token)) return;

      deps.alResultado(r);
      deps.alError(null);
    } catch (err) {
      if (control.vigente(token)) deps.alError((err as Error).message);
    } finally {
      if (control.vigente(token)) deps.alCargando(false);
    }
  }

  return {
    control,
    /** Cambio de contexto (elegir otro cliente, «Cambiar», abrir factura o desmontar): cancela el filtro agendado, invalida lo pendiente y VACÍA la lista al instante. */
    cambiarCliente(id: string | null) {
      cancelarTimer();
      cliente = id ?? "";
      control.aplicar({ clienteId: cliente, q: "", pagina: 1 });
      deps.alCargando(false);
      deps.alLimpiar();
      if (id) void cargar(id, "", 1, true);
    },
    filtrar(q: string) {
      cancelarTimer();
      if (!cliente) return;

      const id = cliente;

      timer = deps.programar(() => { timer = null; if (cliente === id) void cargar(id, q, 1, false); }, ESPERA_BUSQUEDA_MS);
    },
    pagina(q: string, p: number) { cancelarTimer(); if (cliente) void cargar(cliente, q, p, false); },
    /** Pausa (se abre una factura): cancela el filtro agendado e invalida lo pendiente, conservando el cliente y la lista visible. */
    detener() { cancelarTimer(); control.aplicar({ clienteId: cliente, q: "", pagina: 1 }); deps.alCargando(false); },
    cancelar() { cancelarTimer(); control.aplicar({ clienteId: "", q: "", pagina: 1 }); cliente = ""; },
  };
}
