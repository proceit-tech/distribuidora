/**
 * AUD-PRO94-NCE-UI-ETAPA2-R01 — secuencias de INTERACCIÓN (no regex) de la búsqueda de la pantalla de NCE: temporizadores y peticiones simulados con un planificador y promesas controladas.
 * R01-01 (texto nuevo invalida resultados y Enter), R01-02 (cambio de cliente cancela el filtro agendado y nunca mezcla facturas), R01-03 (Escape cierra de forma estable).
 */
import { contador } from "@/lib/clientes/contador-casos";
import { crearBusquedaClientes, crearBusquedaFacturas, crearCargaCorreccion, crearCargaDetalle, type EstadoClientes } from "@/lib/facturacion/nce-busqueda";

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
    igual("abrir una factura detiene el filtro agendado y descarta la respuesta pendiente (la lista del filtro anterior ya no se ofrece; al volver se recarga)", [f.pedidos.length, f.lista().map((x) => x.id)], [2, []]);
  }

  // ── R02-01: filtro de facturas q1 → q2 ────────────────────────────────────────────────────────────────────────────────────────────────────────
  function facturas2() {
    const t = reloj();
    const pedidos: Array<{ q: string; pagina: number; d: ReturnType<typeof diferida<{ facturas: Fac[]; pagina: number; totalPaginas: number }>> }> = [];
    const e = { lista: [] as Fac[], cargando: false, errores: [] as Array<string | null> };
    const b = crearBusquedaFacturas<Fac>({
      pedir: (_c, q, pagina) => { const d = diferida<{ facturas: Fac[]; pagina: number; totalPaginas: number }>(); pedidos.push({ q, pagina, d }); return d.p; },
      programar: t.programar, cancelar: t.cancelar, alLimpiar: () => { e.lista = []; }, alResultado: (r) => { e.lista = r.facturas; }, alCargando: (v) => { e.cargando = v; }, alError: (m) => e.errores.push(m),
    });

    return { b, t, pedidos, e };
  }

  {
    // q1 ya cargado y visible; se escribe q2: la lista de q1 desaparece y no es seleccionable ANTES de los 300 ms
    const f = facturas2();

    f.b.cambiarCliente("A"); f.pedidos[0].d.ok(fl("FA0")); await tick();
    f.b.filtrar("123"); f.t.avanzar(); f.pedidos[1].d.ok(fl("FA-123")); await tick();
    igual("R02-01: con el filtro 123 la tabla ofrece FA-123", f.e.lista.map((x) => x.id), ["FA-123"]);
    f.b.filtrar("999");
    igual("R02-01: al escribir 999 la lista de 123 se vacía al instante y se marca cargando (sin factura seleccionable del filtro anterior)", [f.e.lista.length, f.e.cargando, f.t.pendientes()], [0, true, 1]);
    igual("R02-01: el filtro vigente para el refresco automático ya es 999 y el token anterior quedó inválido", [f.b.control.leer().filtro.q, f.b.control.vigente(2)], ["999", false]);
  }
  {
    // q1 aún pendiente: su respuesta tardía (también un error) no repuebla ni ensucia el estado de q2
    const f = facturas2();

    f.b.cambiarCliente("A"); f.pedidos[0].d.ok(fl("FA0")); await tick();
    f.b.filtrar("123"); f.t.avanzar();            // petición de 123 en vuelo
    f.b.filtrar("999");                            // antes de 300 ms
    f.pedidos[1].d.ok(fl("FA-123")); await tick(); // llega tarde
    igual("R02-01: la respuesta tardía de 123 se descarta durante el debounce de 999", [f.e.lista.length, f.e.cargando], [0, true]);
    f.t.avanzar();                               // se ejecuta 999 (pedidos[2])
    f.b.filtrar("9999"); f.pedidos[2].d.ko(new Error("tarde")); await tick();
    igual("R02-01: un error tardío del filtro anterior no se informa ni apaga el estado cargando de la consulta vigente", [f.e.errores.filter((m) => m !== null), f.e.cargando], [[], true]);
    f.t.avanzar(); f.pedidos[3].d.ok(fl("FA-9999")); await tick();
    igual("R02-01: solo la consulta vigente (9999) llena la tabla", [f.e.lista.map((x) => x.id), f.e.cargando, f.pedidos[3].q], [["FA-9999"], false, "9999"]);
  }
  {
    // refresco automático: usa el filtro vigente (q2) y su respuesta solo vale con el token actual
    const f = facturas2();

    f.b.cambiarCliente("A"); f.pedidos[0].d.ok(fl("FA0")); await tick();
    f.b.filtrar("777");
    const { filtro, token } = f.b.control.leer();
    igual("R02-01: el refresco automático lee el filtro digitado (777), no el anterior", [filtro.q, filtro.clienteId], ["777", "A"]);
    f.b.filtrar("888");
    igual("R02-01: una respuesta del refresco obtenida con el token de 777 ya no es vigente tras escribir 888", f.b.control.vigente(token), false);
  }
  {
    // paginación con respuesta pendiente (facturas): la página anterior ya no se acepta y la selección queda bloqueada hasta que llega la pedida
    const f = facturas2();

    f.b.cambiarCliente("A"); f.pedidos[0].d.ok({ facturas: [{ id: "P1" }], pagina: 1, totalPaginas: 3 }); await tick();
    f.b.pagina("", 2);
    igual("R02-01: al pedir la página 2 se bloquea la selección (cargando) y se envía la página 2", [f.e.cargando, f.pedidos[1].pagina], [true, 2]);
    f.b.pagina("", 3);
    f.pedidos[1].d.ok({ facturas: [{ id: "P2" }], pagina: 2, totalPaginas: 3 }); await tick();
    igual("R02-01: la respuesta tardía de la página 2 se descarta cuando ya se pidió la 3", [f.e.lista.map((x) => x.id), f.e.cargando], [["P1"], true]);
    f.pedidos[2].d.ok({ facturas: [{ id: "P3" }], pagina: 3, totalPaginas: 3 }); await tick();
    igual("R02-01: llega la página 3 y se habilita", [f.e.lista.map((x) => x.id), f.e.cargando], [["P3"], false]);
  }
  {
    // filtro A → cambio a cliente B durante el debounce: el filtro de A no se ejecuta y B carga limpio
    const f = facturas2();

    f.b.cambiarCliente("A"); f.pedidos[0].d.ok(fl("FA0")); await tick();
    f.b.filtrar("123"); f.b.cambiarCliente("B"); f.t.avanzar(); await tick();
    igual("R02-01: A → B durante el debounce del filtro: solo se pide la carga inicial de B y la lista está vacía", [f.pedidos.length, f.e.lista.length], [2, 0]);
  }

  // ── OBS-R02-03: paginación de clientes ───────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const c = clientes();

    c.b.escribir("al"); c.t.avanzar(); c.pedidos[0].d.ok({ clientes: [{ id: "A1", innominado: false }], pagina: 1, totalPaginas: 3 }); await tick();
    igual("OBS-R02-03: con la página 1 vigente Enter elige A1", c.b.primeroElegible()?.id, "A1");
    c.b.pagina(2);
    igual("OBS-R02-03: al pedir la página 2 los clientes de la página 1 dejan de ser elegibles (lista vacía, Enter inerte)", [c.b.estado().items.length, c.b.vigentes().length, c.b.primeroElegible(), c.b.estado().buscando], [0, 0, null, true]);
    c.b.pagina(3);
    c.pedidos[1].d.ok({ clientes: [{ id: "B1", innominado: false }], pagina: 2, totalPaginas: 3 }); await tick();
    igual("OBS-R02-03: la respuesta tardía de la página 2 se descarta si ya se pidió la 3", [c.b.estado().items.length, c.b.estado().pagina], [0, 1]);
    c.pedidos[2].d.ok({ clientes: [{ id: "INN9", innominado: true }, { id: "C1", innominado: false }], pagina: 3, totalPaginas: 3 }); await tick();
    igual("OBS-R02-03: la página 3 vigente se puede elegir por teclado y el Innominado sigue bloqueado", [c.b.estado().pagina, c.b.primeroElegible()?.id], [3, "C1"]);
  }

  // ── C03 / NCE-D01: detalle de la factura ──────────────────────────────────────────────────────────────────────────────────────────────────────
  type Det = { factura: string };
  function detalle() {
    const pedidos: Array<{ id: string; d: ReturnType<typeof diferida<Det>> }> = [];
    const e = { cargando: false, aplicado: [] as Array<{ factura: string; ctx: string }>, errores: [] as string[], historial: [] as boolean[] };
    const c = crearCargaDetalle<Det, string>({
      pedir: (id) => { const d = diferida<Det>(); pedidos.push({ id, d }); return d.p; },
      alCargando: (b) => { e.cargando = b; e.historial.push(b); }, alResultado: (r, ctx) => e.aplicado.push({ factura: r.factura, ctx }), alError: (m) => e.errores.push(m),
    });

    return { c, pedidos, e };
  }

  {
    // 1. Abrir A → cambiar de cliente (invalidar) → llega A tarde
    const x = detalle();

    void x.c.abrir("FA", "ctxA");
    igual("detalle: «Cargando…» durante la apertura", x.e.cargando, true);
    x.c.invalidar();                                  // se elige el cliente B
    igual("cambiar de cliente: se apaga «Cargando…» del detalle invalidado", x.e.cargando, false);
    x.pedidos[0].d.ok({ factura: "FA" }); await tick();
    igual("la respuesta tardía de la factura A NO llena el formulario del cliente B", x.e.aplicado, []);

    // 2. Error tardío de A
    const y = detalle();

    void y.c.abrir("FA", "ctxA"); y.c.invalidar(); y.pedidos[0].d.ko(new Error("error de A")); await tick();
    igual("el error tardío de A después de cambiar de cliente no se muestra", [y.e.errores, y.e.cargando], [[], false]);
  }
  {
    // 3. Respuestas fuera de orden: A y B
    const x = detalle();

    void x.c.abrir("FA", "A");
    void x.c.abrir("FB", "B");
    x.pedidos[1].d.ok({ factura: "FB" }); await tick();
    igual("fuera de orden: B (vigente) se aplica y apaga «Cargando…»", [x.e.aplicado, x.e.cargando], [[{ factura: "FB", ctx: "B" }], false]);
    x.pedidos[0].d.ok({ factura: "FA" }); await tick();
    igual("fuera de orden: la respuesta tardía de A no sobrescribe a B", x.e.aplicado, [{ factura: "FB", ctx: "B" }]);

    const y = detalle();

    void y.c.abrir("FA", "A"); void y.c.abrir("FB", "B");
    y.pedidos[0].d.ok({ factura: "FA" }); await tick();
    igual("fuera de orden: A llega primero (obsoleta) y NO se aplica ni apaga «Cargando…» de B", [y.e.aplicado, y.e.cargando], [[], true]);
    y.pedidos[1].d.ok({ factura: "FB" }); await tick();
    igual("fuera de orden: luego B se aplica", [y.e.aplicado, y.e.cargando], [[{ factura: "FB", ctx: "B" }], false]);

    // el finally de una consulta antigua no modifica el estado de la vigente (error de A después de abrir B)
    const z = detalle();

    void z.c.abrir("FA", "A"); void z.c.abrir("FB", "B");
    z.pedidos[0].d.ko(new Error("A falla")); await tick();
    igual("el finally/error de A no apaga «Cargando…» de B ni informa error", [z.e.cargando, z.e.errores], [true, []]);
  }
  {
    // 4. Cancelar / volver mientras carga
    const x = detalle();

    void x.c.abrir("FA", "A"); x.c.invalidar(); x.pedidos[0].d.ok({ factura: "FA" }); await tick();
    igual("volver a la lista con el detalle cargando: la respuesta tardía no abre la factura", [x.e.aplicado, x.e.cargando], [[], false]);

    // invalidar sin detalle en vuelo no apaga la carga de otras listas
    const y = detalle();

    y.c.invalidar();
    igual("invalidar sin detalle en vuelo no toca «Cargando…» (no pisa la carga de la lista de facturas)", y.e.historial, []);
  }
  {
    // 5. Corrección de otra NCE rechazada con consulta pendiente
    const x = detalle();

    void x.c.abrir("FA", "corrección-1");
    x.c.invalidar();                                   // cambia el parámetro «corregir»
    void x.c.abrir("FB", "corrección-2");
    x.pedidos[0].d.ok({ factura: "FA" }); x.pedidos[1].d.ok({ factura: "FB" }); await tick();
    igual("cambiar a otra corrección con consulta pendiente: solo se aplica la factura y la precarga de la corrección vigente", x.e.aplicado, [{ factura: "FB", ctx: "corrección-2" }]);
  }
  {
    // 6. Petición vigente con éxito y con error
    const x = detalle();

    void x.c.abrir("FA", "A"); x.pedidos[0].d.ok({ factura: "FA" }); await tick();
    igual("vigente con éxito: se aplica con su contexto y se apaga «Cargando…»", [x.e.aplicado, x.e.cargando, x.e.historial], [[{ factura: "FA", ctx: "A" }], false, [true, false]]);

    const y = detalle();

    void y.c.abrir("FA", "A"); y.pedidos[0].d.ko(new Error("No se pudo cargar")); await tick();
    igual("vigente con error: el error legítimo se informa y se apaga «Cargando…»", [y.e.errores, y.e.aplicado, y.e.cargando], [["No se pudo cargar"], [], false]);
  }

  // ── C03-R02-01: propuesta de corrección + apertura de la factura comparten contexto ───────────────────────────────────────────────────────────
  type Prop = { facturaId: string; numeroRechazado: string };
  function correccion() {
    const props: Array<{ id: string; d: ReturnType<typeof diferida<Prop>> }> = [];
    const dets: Array<{ id: string; d: ReturnType<typeof diferida<Det>> }> = [];
    const e = { avisos: [] as string[], errores: [] as string[], aplicado: [] as Array<{ factura: string; ctx: string }>, cargando: false };
    const det = crearCargaDetalle<Det, string>({
      pedir: (id) => { const d = diferida<Det>(); dets.push({ id, d }); return d.p; },
      alCargando: (b) => { e.cargando = b; }, alResultado: (r, ctx) => e.aplicado.push({ factura: r.factura, ctx }), alError: (m) => e.errores.push(m),
    });
    const cor = crearCargaCorreccion<Prop>({
      pedir: (id) => { const d = diferida<Prop>(); props.push({ id, d }); return d.p; },
      alPropuesta: (p) => e.avisos.push(p.numeroRechazado),
      abrir: (facturaId, p) => det.abrir(facturaId, p.numeroRechazado),
      alError: (m) => e.errores.push(m),
    });
    const invalidar = () => { cor.invalidar(); det.invalidar(); };

    return { cor, det, props, dets, e, invalidar };
  }

  {
    // 1. Propuesta A pendiente → se elige el cliente B → la respuesta de A se ignora (no hay aviso ni apertura)
    const x = correccion();

    void x.cor.cargar("NCE-A");
    x.invalidar();
    x.props[0].d.ok({ facturaId: "FA", numeroRechazado: "NCE-A" }); await tick();
    igual("propuesta A pendiente + cambio de cliente: la respuesta tardía se descarta (sin aviso y sin abrir la factura A)", [x.e.avisos, x.dets.length, x.e.aplicado], [[], 0, []]);

    // 2. Error de A ignorado
    const y = correccion();

    void y.cor.cargar("NCE-A"); y.invalidar(); y.props[0].d.ko(new Error("error de la propuesta A")); await tick();
    igual("propuesta A pendiente + cambio de cliente: el error tardío no se muestra", y.e.errores, []);
  }
  {
    // 3. Cambiar de la corrección A a la B: solo B
    const x = correccion();

    void x.cor.cargar("NCE-A");
    x.invalidar();                                       // cambia el parámetro «corregir»
    void x.cor.cargar("NCE-B");
    x.props[0].d.ok({ facturaId: "FA", numeroRechazado: "NCE-A" }); await tick();
    x.props[1].d.ok({ facturaId: "FB", numeroRechazado: "NCE-B" }); await tick();
    igual("de la corrección A a la B: solo se abre la factura de B", [x.dets.map((d) => d.id), x.e.avisos], [["FB"], ["NCE-B"]]);
    x.dets[0].d.ok({ factura: "FB" }); await tick();
    igual("de la corrección A a la B: solo se aplica la factura y la precarga de B", x.e.aplicado, [{ factura: "FB", ctx: "NCE-B" }]);
  }
  {
    // 4. Propuesta vigente → abre su factura con su contexto
    const x = correccion();

    void x.cor.cargar("NCE-A");
    x.props[0].d.ok({ facturaId: "FA", numeroRechazado: "NCE-A" }); await tick();
    igual("propuesta vigente: aviso con su referencia y apertura de SU factura", [x.e.avisos, x.dets.map((d) => d.id), x.e.cargando], [["NCE-A"], ["FA"], true]);
    x.dets[0].d.ok({ factura: "FA" }); await tick();
    igual("propuesta vigente: la factura se aplica con la precarga de la propuesta", [x.e.aplicado, x.e.cargando], [[{ factura: "FA", ctx: "NCE-A" }], false]);

    const y = correccion();

    void y.cor.cargar("NCE-A"); y.props[0].d.ko(new Error("propuesta inexistente")); await tick();
    igual("propuesta vigente con error legítimo: se informa y no se abre ninguna factura", [y.e.errores, y.dets.length], [["propuesta inexistente"], 0]);
  }
  {
    // 5. La propuesta A ya cargó y el detalle A está pendiente → cambio de cliente
    const x = correccion();

    void x.cor.cargar("NCE-A");
    x.props[0].d.ok({ facturaId: "FA", numeroRechazado: "NCE-A" }); await tick();
    x.invalidar();
    x.dets[0].d.ok({ factura: "FA" }); await tick();
    igual("propuesta A cargada + detalle pendiente + cambio de cliente: el detalle tardío no llena el formulario y se apaga «Cargando…»", [x.e.aplicado, x.e.cargando], [[], false]);
  }
  {
    // 6. Flujo normal sin corrección: el detalle funciona solo y el contexto no afecta a una apertura posterior
    const x = correccion();

    x.invalidar();                                        // elegir cliente sin corrección en curso
    void x.det.abrir("FN", "normal"); x.dets[0].d.ok({ factura: "FN" }); await tick();
    igual("flujo normal cliente/factura (sin corrección): la apertura vigente se aplica con su contexto", [x.e.aplicado, x.e.cargando, x.props.length], [[{ factura: "FN", ctx: "normal" }], false, 0]);
  }

  return fallos;
}
