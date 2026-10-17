/**
 * AUD-PRO94-NCE-UI-ETAPA2-R01 — secuencias de INTERACCIÓN (no regex) de la búsqueda de la pantalla de NCE: temporizadores y peticiones simulados con un planificador y promesas controladas.
 * R01-01 (texto nuevo invalida resultados y Enter), R01-02 (cambio de cliente cancela el filtro agendado y nunca mezcla facturas), R01-03 (Escape cierra de forma estable).
 */
import { contador } from "@/lib/clientes/contador-casos";
import { crearBusquedaClientes, crearBusquedaFacturas, type EstadoClientes } from "@/lib/facturacion/nce-busqueda";

type Cli = { id: string; innominado: boolean };
type Fac = { id: string };

function reloj() {
  let n = 0;
  const cola: Array<{ id: number; fn: () => void; vivo: boolean }> = [];

  return {
    programar: (fn: () => void) => { const t = { id: ++n, fn, vivo: true }; cola.push(t); return t.id; },
    cancelar: (id: unknown) => { const t = cola.find((x) => x.id === id); if (t) t.vivo = false; },
    /** Dispara todos los temporizadores vigentes (equivale a dejar pasar los 300 ms). */
    avanzar: () => { for (const t of cola.splice(0)) if (t.vivo) t.fn(); },
    pendientes: () => cola.filter((x) => x.vivo).length,
  };
}

function diferida<T>() {
  let ok!: (v: T) => void;
  let ko!: (e: Error) => void;
  const p = new Promise<T>((a, b) => { ok = a; ko = b; });

  return { p, ok, ko };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export async function verificarCasosBusquedaNce(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(nombre + ": esperado " + JSON.stringify(esperado) + ", obtenido " + JSON.stringify(obtenido));
  };

  // ── Clientes ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  function clientes() {
    const t = reloj();
    const pedidos: Array<{ q: string; pagina: number; d: ReturnType<typeof diferida<{ clientes: Cli[]; pagina: number; totalPaginas: number }>> }> = [];
    const errores: Array<string | null> = [];
    let ultimo: EstadoClientes<Cli> | null = null;
    const b = crearBusquedaClientes<Cli>({
      buscar: (q, pagina) => { const d = diferida<{ clientes: Cli[]; pagina: number; totalPaginas: number }>(); pedidos.push({ q, pagina, d }); return d.p; },
      programar: t.programar, cancelar: t.cancelar, alCambiar: (e) => { ultimo = e; }, alError: (m) => errores.push(m),
    });

    return { b, t, pedidos, errores, ultimo: () => ultimo };
  }
  const lote = (...ids: string[]) => ({ clientes: ids.map((id) => ({ id, innominado: id.startsWith("INN") })), pagina: 1, totalPaginas: 1 });

  {
    // R01-01 (a): «al» con resultados A; se escribe «be» y se pulsa Enter ANTES de los 300 ms → no se elige el cliente de la consulta anterior
    const c = clientes();

    c.b.escribir("al"); c.t.avanzar(); c.pedidos[0].d.ok(lote("A1", "A2")); await tick();
    igual("R01-01: con «al» vigente, Enter elige el primero seleccionable de ESA consulta", c.b.primeroElegible()?.id, "A1");
    c.b.escribir("be");
    igual("R01-01: al cambiar el texto a «be» los resultados anteriores se invalidan al instante (sin esperar el debounce)", [c.b.vigentes().length, c.b.estado().items.length, c.b.primeroElegible()], [0, 0, null]);
    igual("R01-01: Enter durante el debounce no selecciona nada", c.b.primeroElegible(), null);
    igual("R01-01: solo se programó la búsqueda de «be» (la de «al» ya se había ejecutado)", [c.pedidos.length, c.t.pendientes()], [1, 1]);
    c.t.avanzar();
    igual("R01-01: mientras «be» está en curso Enter tampoco selecciona", c.b.primeroElegible(), null);
    c.pedidos[1].d.ok(lote("B1")); await tick();
    igual("R01-01: con «be» vigente Enter elige B1, nunca A1", c.b.primeroElegible()?.id, "B1");
  }
  {
    // R01-01 (b): una petición anterior que llega TARDE no repuebla la lista
    const c = clientes();

    c.b.escribir("al"); c.t.avanzar();          // petición 0 en vuelo
    c.b.escribir("be");                          // invalida la 0 y agenda la «be»
    c.pedidos[0].d.ok(lote("A1")); await tick(); // llega tarde
    igual("R01-01: la respuesta tardía de «al» se descarta (lista vacía, sin consulta vigente)", [c.b.estado().items.length, c.b.estado().consulta, c.b.primeroElegible()], [0, null, null]);
    c.t.avanzar(); c.pedidos[1].d.ok(lote("B1")); await tick();
    igual("R01-01: solo la consulta vigente «be» queda asociada a la lista", [c.b.estado().consulta, c.b.estado().items.map((x) => x.id)], ["be", ["B1"]]);
    // un fallo de la consulta anterior tampoco ensucia el estado vigente
    c.b.escribir("ca"); c.t.avanzar(); c.b.escribir("de");
    c.pedidos[2].d.ko(new Error("red")); await tick();
    igual("R01-01: el error de una consulta invalidada se ignora", c.errores.filter((m) => m !== null), []);
  }
  {
    // Innominado nunca es elegible con Enter; si es el único resultado no se elige nada
    const c = clientes();

    c.b.escribir("in"); c.t.avanzar(); c.pedidos[0].d.ok(lote("INN1", "C2")); await tick();
    igual("Innominado: Enter salta al Innominado y elige el primer cliente identificado", c.b.primeroElegible()?.id, "C2");
    c.b.escribir("inn"); c.t.avanzar(); c.pedidos[1].d.ok(lote("INN1")); await tick();
    igual("Innominado: si solo hay Innominado, Enter no selecciona", c.b.primeroElegible(), null);
  }
  {
    // R01-03: Escape con la petición en vuelo, con el temporizador pendiente y con resultados mostrados
    const c = clientes();

    c.b.escribir("al"); c.t.avanzar();
    c.b.cerrar();
    c.pedidos[0].d.ok(lote("A1")); await tick();
    igual("R01-03: Escape con la petición en curso cierra y la respuesta tardía NO reabre ni repuebla", [c.b.estado().abierto, c.b.estado().items.length, c.b.primeroElegible()], [false, 0, null]);

    const d = clientes();

    d.b.escribir("al"); d.b.cerrar(); d.t.avanzar();
    igual("R01-03: Escape antes del debounce cancela la búsqueda agendada (no se hace ninguna petición)", [d.pedidos.length, d.b.estado().abierto], [0, false]);

    const e = clientes();

    e.b.escribir("al"); e.t.avanzar(); e.pedidos[0].d.ok(lote("A1")); await tick();
    e.b.cerrar();
    igual("R01-03: Escape con resultados los cierra de forma estable (lista vacía, Enter inerte)", [e.b.estado().abierto, e.b.estado().items.length, e.b.primeroElegible()], [false, 0, null]);
    e.t.avanzar(); await tick();
    igual("R01-03: nada vuelve a abrirla sin una acción explícita", [e.b.estado().abierto, e.pedidos.length], [false, 1]);
    e.b.reabrir(); e.pedidos[1].d.ok(lote("A1")); await tick();
    igual("R01-03: la flecha abajo reabre buscando de nuevo el texto actual", [e.b.estado().abierto, e.pedidos[1].q, e.b.primeroElegible()?.id], [true, "al", "A1"]);
    e.b.cerrar(); e.b.escribir("alb");
    igual("R01-03: escribir de nuevo vuelve a abrir (aria-expanded refleja la visibilidad real)", e.b.estado().abierto, true);
  }
  {
    // errores de red de la consulta vigente
    const c = clientes();

    c.b.escribir("al"); c.t.avanzar(); c.pedidos[0].d.ko(new Error("sin red")); await tick();
    igual("error de red vigente: sin resultados elegibles y mensaje informado", [c.b.primeroElegible(), c.errores.filter((m) => m !== null)], [null, ["sin red"]]);
  }

  // ── Facturas ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  function facturas() {
    const t = reloj();
    const pedidos: Array<{ cliente: string; q: string; actualizar: boolean; d: ReturnType<typeof diferida<{ facturas: Fac[]; pagina: number; totalPaginas: number }>> }> = [];
    let lista: Fac[] = [];
    const errores: Array<string | null> = [];
    const b = crearBusquedaFacturas<Fac>({
      pedir: (cliente, q, _p, actualizar) => { const d = diferida<{ facturas: Fac[]; pagina: number; totalPaginas: number }>(); pedidos.push({ cliente, q, actualizar, d }); return d.p; },
      programar: t.programar, cancelar: t.cancelar, alLimpiar: () => { lista = []; }, alResultado: (r) => { lista = r.facturas; }, alCargando: () => undefined, alError: (m) => errores.push(m),
    });

    return { b, t, pedidos, errores, lista: () => lista };
  }
  const fl = (...ids: string[]) => ({ facturas: ids.map((id) => ({ id })), pagina: 1, totalPaginas: 1 });

  {
    // R01-02 (a): filtro agendado + «Cambiar» → el temporizador NO dispara
    const f = facturas();

    f.b.cambiarCliente("A"); f.pedidos[0].d.ok(fl("FA1")); await tick();
    igual("R01-02: al elegir el cliente A se cargan sus facturas (con actualización)", [f.pedidos[0].cliente, f.pedidos[0].actualizar, f.lista().map((x) => x.id)], ["A", true, ["FA1"]]);
    f.b.filtrar("123");
    igual("R01-02: el filtro queda agendado", f.t.pendientes(), 1);
    f.b.cambiarCliente(null);
    igual("R01-02: «Cambiar» cancela el temporizador y vacía la lista al instante", [f.t.pendientes(), f.lista().length], [0, 0]);
    f.t.avanzar(); await tick();
    igual("R01-02: pasado el tiempo no se hace ninguna petición del cliente anterior", f.pedidos.length, 1);
  }
  {
    // R01-02 (b): A→B con la respuesta de A tardía y la carga de B con error
    const f = facturas();

    f.b.cambiarCliente("A");                      // petición 0 (A) en vuelo
    f.b.cambiarCliente("B");                      // petición 1 (B); la lista se vacía
    f.pedidos[0].d.ok(fl("FA1")); await tick();   // A llega tarde
    igual("R01-02: la respuesta tardía de A no aparece bajo B", f.lista().length, 0);
    f.pedidos[1].d.ko(new Error("falla B")); await tick();
    igual("R01-02: si la carga de B falla, la lista queda VACÍA (nunca con facturas de A) y se informa el error", [f.lista().length, f.errores.filter((m) => m !== null)], [0, ["falla B"]]);
  }
  {
    // R01-02 (c): filtro agendado de A y elección de B → solo carga B
    const f = facturas();

    f.b.cambiarCliente("A"); f.pedidos[0].d.ok(fl("FA1")); await tick();
    f.b.filtrar("x");
    f.b.cambiarCliente("B");
    f.t.avanzar(); await tick();
    igual("R01-02: elegir B cancela el filtro agendado de A (solo existe la carga inicial de B)", f.pedidos.map((p) => p.cliente), ["A", "B"]);
    f.pedidos[1].d.ok(fl("FB1")); await tick();
    igual("R01-02: B muestra únicamente sus facturas", f.lista().map((x) => x.id), ["FB1"]);
  }
  {
    // filtro normal y apertura de una factura (detener)
    const f = facturas();

    f.b.cambiarCliente("A"); f.pedidos[0].d.ok(fl("FA1")); await tick();
    f.b.filtrar("12"); f.t.avanzar();
    igual("filtro vigente: tras el debounce se pide con el texto y sin actualización forzada", [f.pedidos[1].cliente, f.pedidos[1].q, f.pedidos[1].actualizar], ["A", "12", false]);
    f.b.filtrar("123"); f.b.detener();
    f.t.avanzar(); f.pedidos[1].d.ok(fl("FX")); await tick();
    igual("abrir una factura detiene el filtro agendado y descarta la respuesta pendiente (la lista visible no cambia)", [f.pedidos.length, f.lista().map((x) => x.id)], [2, ["FA1"]]);
  }

  return fallos;
}
