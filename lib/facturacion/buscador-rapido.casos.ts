/**
 * C02 / FAT-D01 — búsqueda rápida de clientes y productos en Facturas. Secuencias de interacción con planificador y promesas controladas (sin red, sin React, sin PostgreSQL):
 * A → B antes del debounce, flechas/Enter/clic con lista anterior, respuestas y errores HTTP tardíos (también de la consulta directa de Enter), GTIN/código exacto, varias coincidencias,
 * cliente inapto / producto bloqueado y adición consecutiva de productos sin cerrar.
 */
import { contador } from "@/lib/clientes/contador-casos";
import { crearBuscadorRapido, ESPERA_BUSQUEDA_RAPIDA_MS, MENSAJE_ENTER } from "@/lib/facturacion/busqueda-rapida";

type Item = { id: string; ok: boolean; gtin?: string };
type Lote = { items: Item[]; total: number };

function diferida<T>() {
  let ok!: (v: T) => void;
  let ko!: (e: Error) => void;
  const p = new Promise<T>((a, b) => { ok = a; ko = b; });

  return { p, ok, ko };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const lote = (...x: Array<[string, boolean?, string?]>): Lote => ({ items: x.map(([id, ok, gtin]) => ({ id, ok: ok ?? true, gtin })), total: x.length });

function montar() {
  let n = 0;
  const cola: Array<{ id: number; fn: () => void; vivo: boolean }> = [];
  const pedidos: Array<{ q: string; d: ReturnType<typeof diferida<Lote>> }> = [];
  const elegidos: string[] = [];
  const b = crearBuscadorRapido<Item>({
    buscar: (q) => { const d = diferida<Lote>(); pedidos.push({ q, d }); return d.p; },
    programar: (fn) => { const t = { id: ++n, fn, vivo: true }; cola.push(t); return t.id; },
    cancelar: (id) => { const t = cola.find((x) => x.id === id); if (t) t.vivo = false; },
    habilitado: (t) => t.ok, exacto: (t, x) => t.id === x || t.gtin === x, titulo: (t) => t.id,
    alCambiar: () => undefined, alElegir: (t) => elegidos.push(t.id),
  });

  return { b, pedidos, elegidos, avanzar: () => { for (const t of cola.splice(0)) if (t.vivo) t.fn(); }, timers: () => cola.filter((x) => x.vivo).length };
}

export async function verificarCasosBuscadorRapido(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(nombre + ": esperado " + JSON.stringify(esperado) + ", obtenido " + JSON.stringify(obtenido));
  };
  const ids = (m: ReturnType<typeof montar>) => m.b.visibles().map((x) => x.id);

  {
    // A → B antes de los 300 ms
    const m = montar();

    m.b.escribir("al"); m.avanzar(); m.pedidos[0].d.ok(lote(["A1"], ["A2"])); await tick();
    igual("con «al» vigente se ven A1 y A2", ids(m), ["A1", "A2"]);
    m.b.mover(1);
    igual("la flecha abajo resalta A1", m.b.estado().activo, 0);
    m.b.escribir("be");
    igual("A → B: al escribir «be» la lista y la selección de «al» se invalidan al instante (antes del debounce)", [ids(m), m.b.estado().items.length, m.b.estado().activo, m.b.estado().cargando, m.timers()], [[], 0, -1, true, 1]);
    m.b.mover(1); m.b.mover(-1);
    igual("flechas con la lista anterior: no resaltan nada", m.b.estado().activo, -1);
    m.b.elegir({ id: "A1", ok: true });
    igual("clic en un resultado de la consulta anterior no selecciona", m.elegidos, []);
    igual("el debounce se mantiene (una sola búsqueda programada, ninguna petición nueva todavía)", [m.pedidos.length, ESPERA_BUSQUEDA_RAPIDA_MS], [1, 300]);
  }
  {
    // Enter con la lista anterior: consulta directa por «be», nunca elige A1
    const m = montar();

    m.b.escribir("al"); m.avanzar(); m.pedidos[0].d.ok(lote(["A1"], ["A2"])); await tick();
    m.b.mover(1);
    m.b.escribir("be");
    void m.b.enter();
    igual("Enter con la lista anterior y la selección resaltada NO elige A1: lanza la consulta directa de «be»", [m.elegidos, m.pedidos[1].q], [[], "be"]);
    m.pedidos[1].d.ok(lote(["B1"])); await tick();
    igual("Enter: la consulta directa vigente elige B1 (único resultado habilitado)", m.elegidos, ["B1"]);
  }
  {
    // Resultado y error HTTP antiguos de la lista
    const m = montar();

    m.b.escribir("al"); m.avanzar();
    m.b.escribir("be");
    m.pedidos[0].d.ok(lote(["A1"])); await tick();
    igual("respuesta antigua: el resultado de «al» que llega tarde se descarta", [ids(m), m.b.estado().consulta], [[], null]);
    m.avanzar(); m.pedidos[1].d.ko(new Error("HTTP viejo")); await tick();
    igual("la consulta vigente de «be» falla: el error SÍ se informa", [m.b.estado().error, m.b.estado().cargando], ["HTTP viejo", false]);

    const n = montar();

    n.b.escribir("al"); n.avanzar(); n.b.escribir("be"); n.pedidos[0].d.ko(new Error("error antiguo")); await tick();
    igual("error HTTP antiguo: el error de «al» invalidado no se muestra", [n.b.estado().error, n.b.estado().cargando], ["", true]);
  }
  {
    // Consulta directa pendiente y el texto cambia
    const m = montar();

    m.b.escribir("123"); void m.b.enter();
    m.b.escribir("456");
    m.pedidos[0].d.ok(lote(["P123"])); await tick();
    igual("consulta directa: si el texto cambió mientras el HTTP estaba pendiente, el resultado antiguo NO selecciona nada ni muestra aviso", [m.elegidos, m.b.estado().aviso, m.b.estado().buscando], [[], "", false]);

    const n = montar();

    n.b.escribir("123"); void n.b.enter(); n.b.escribir("456");
    n.pedidos[0].d.ko(new Error("error tardío directo")); await tick();
    igual("consulta directa: el error HTTP tardío tampoco se muestra", [n.elegidos, n.b.estado().aviso], [[], ""]);

    const o = montar();

    o.b.escribir("123"); void o.b.enter(); void o.b.enter();
    o.pedidos[0].d.ok(lote(["P1"])); o.pedidos[1].d.ok(lote(["P1"])); await tick();
    igual("dos Enter seguidos: solo la última consulta directa vale (una sola selección)", o.elegidos, ["P1"]);
  }
  {
    // GTIN / código exacto y varias coincidencias
    const m = montar();

    m.b.escribir("7790001"); void m.b.enter();
    m.pedidos[0].d.ok(lote(["PA", true, "7790001"], ["PB", true, "7790002"], ["PC", true, "9990001"])); await tick();
    igual("lector de código: Enter con GTIN exacto entre varios resultados elige solo el exacto", m.elegidos, ["PA"]);

    const n = montar();

    n.b.escribir("arroz"); void n.b.enter();
    n.pedidos[0].d.ok(lote(["PA"], ["PB"])); await tick();
    igual("varias coincidencias sin exacta: Enter NO elige el primero y avisa en español", [n.elegidos, n.b.estado().aviso], [[], MENSAJE_ENTER.VARIOS]);

    const o = montar();

    o.b.escribir("zzz"); void o.b.enter();
    o.pedidos[0].d.ok(lote()); await tick();
    igual("sin resultados: aviso y ninguna selección", [o.elegidos, o.b.estado().aviso], [[], MENSAJE_ENTER.SIN_RESULTADOS]);
  }
  {
    // Cliente inapto / producto bloqueado
    const m = montar();

    m.b.escribir("ju"); m.avanzar(); m.pedidos[0].d.ok(lote(["BLOQ", false], ["OK"])); await tick();
    m.b.elegir({ id: "BLOQ", ok: false });
    igual("clic en un registro bloqueado (cliente inapto / producto no habilitado) no selecciona", m.elegidos, []);
    const bloq = m.b.visibles()[0];

    m.b.elegir(bloq);
    igual("el mismo objeto de la lista vigente, si está bloqueado, tampoco se elige", m.elegidos, []);
    m.b.resaltar(0); void m.b.enter();
    m.pedidos[1].d.ok(lote(["BLOQ", false], ["OK"])); await tick();
    igual("Enter con un bloqueado resaltado no lo elige; la consulta directa descarta los bloqueados y elige el único habilitado", m.elegidos, ["OK"]);

    const n = montar();

    n.b.escribir("solo"); void n.b.enter(); n.pedidos[0].d.ok(lote(["BLOQ", false])); await tick();
    igual("si el único resultado está bloqueado, Enter no lo elige", [n.elegidos, n.b.estado().aviso], [[], MENSAJE_ENTER.SIN_RESULTADOS]);
  }
  {
    // Búsqueda abierta con adición consecutiva
    const m = montar();

    m.b.abrir();
    igual("abrir: primera carga inmediata de la lista", [m.pedidos.length, m.pedidos[0].q], [1, ""]);
    m.b.abrir();
    igual("abrir otra vez con la carga en curso no duplica la petición", m.pedidos.length, 1);
    m.pedidos[0].d.ok(lote(["P1"], ["P2"])); await tick();
    m.b.elegir(m.b.visibles()[0]);
    igual("se añade P1 y el texto/lista se reinician (la lista de P1 deja de ser elegible hasta recargar)", [m.elegidos, m.b.estado().texto, ids(m), m.b.estado().aviso], [["P1"], "", [], "«P1» añadido."]);
    m.b.elegir({ id: "P2", ok: true });
    igual("durante la recarga no se puede añadir con una lista vieja", m.elegidos, ["P1"]);
    m.avanzar(); m.pedidos[1].d.ok(lote(["P2"], ["P3"])); await tick();
    m.b.elegir(m.b.visibles()[0]);
    igual("tras recargar se puede añadir otro producto sin cerrar el buscador (adición consecutiva)", m.elegidos, ["P1", "P2"]);
    igual("al abrir (sin texto) la lista corresponde a la consulta vacía", m.pedidos[0].q, "");
  }
  {
    // Debounce: varias teclas = una sola búsqueda
    const m = montar();

    m.b.escribir("a"); m.b.escribir("ab"); m.b.escribir("abc");
    igual("debounce: tres teclas seguidas dejan un solo temporizador y ninguna petición", [m.timers(), m.pedidos.length], [1, 0]);
    m.avanzar();
    igual("debounce: al vencer se pide solo el texto final", m.pedidos.map((p) => p.q), ["abc"]);
  }

  return fallos;
}
