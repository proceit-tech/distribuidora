/**
 * C01 / FAT-D02 — «Enviar factura» envía EXACTAMENTE lo revisado. Secuencias de interacción sobre el flujo puro (promesas controladas, sin red, sin React, sin PostgreSQL): revisar A y enviar A,
 * cambios (cliente, ítem, valor) durante la previa y después de revisar, respuesta obsoleta, cancelar sin enviar y envío duplicado.
 */
import { contador } from "@/lib/clientes/contador-casos";
import { AVISO_CAMBIO, AVISO_SIN_REVISION, crearFlujoRevision, type Revision } from "@/lib/facturacion/revision-factura";

type Cuerpo = { clienteId: string; lineas: Array<{ productoId: string; cantidad: string; precio?: string }>; claveIdempotencia: string };
type Resumen = { total: string };

function diferida<T>() {
  let ok!: (v: T) => void;
  let ko!: (e: Error) => void;
  const p = new Promise<T>((a, b) => { ok = a; ko = b; });

  return { p, ok, ko };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const huella = (c: Cuerpo) => JSON.stringify(c);
const A: Cuerpo = { clienteId: "C1", lineas: [{ productoId: "P1", cantidad: "1" }], claveIdempotencia: "k" };
const BCliente: Cuerpo = { ...A, clienteId: "C2" };
const BItem: Cuerpo = { ...A, lineas: [{ productoId: "P2", cantidad: "1" }] };
const BValor: Cuerpo = { ...A, lineas: [{ productoId: "P1", cantidad: "1", precio: "999" }] };

function montar() {
  const previas: Array<{ cuerpo: Cuerpo; d: ReturnType<typeof diferida<Resumen>> }> = [];
  const envios: Array<{ cuerpo: Cuerpo; d: ReturnType<typeof diferida<{ numero: string }>> }> = [];
  const e = { revision: null as Revision<Resumen> | null, revisando: false, enviando: false, avisos: [] as string[], errores: [] as Array<{ m: string; fase: string }>, resultados: [] as string[] };
  const f = crearFlujoRevision<Resumen, { numero: string }>({
    previa: (c) => { const d = diferida<Resumen>(); previas.push({ cuerpo: c as Cuerpo, d }); return d.p; },
    enviar: (c) => { const d = diferida<{ numero: string }>(); envios.push({ cuerpo: c as Cuerpo, d }); return d.p; },
    alRevisando: (b) => { e.revisando = b; }, alRevision: (r) => { e.revision = r; }, alEnviando: (b) => { e.enviando = b; },
    alResultado: (r) => e.resultados.push(r.numero), alAviso: (m) => e.avisos.push(m), alError: (x, fase) => e.errores.push({ m: (x as Error).message, fase }),
  });

  return { f, previas, envios, e };
}

export async function verificarCasosRevisionFactura(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(nombre + ": esperado " + JSON.stringify(esperado) + ", obtenido " + JSON.stringify(obtenido));
  };

  {
    // 1. Revisar A y emitir exactamente A
    const m = montar();

    m.f.cambio(huella(A));
    void m.f.revisar(A);
    igual("revisar A: la previa lleva el cuerpo A y queda revisando", [m.previas.length, huella(m.previas[0].cuerpo), m.e.revisando], [1, huella(A), true]);
    m.previas[0].d.ok({ total: "100" }); await tick();
    igual("revisar A: queda una revisión vigente de A con su versión y el resumen del servidor", [m.e.revision?.version, m.e.revision?.huella, m.e.revision?.resumen.total, m.e.revisando], [1, huella(A), "100", false]);
    void m.f.enviar();
    igual("enviar A: se envía el MISMO cuerpo revisado (misma identidad de objeto y misma clave de idempotencia)", [m.envios.length, m.envios[0].cuerpo === A, m.envios[0].cuerpo.claveIdempotencia], [1, true, "k"]);
    m.envios[0].d.ok({ numero: "001-001-0000001" }); await tick();
    igual("enviar A: resultado informado, revisión consumida y envío liberado", [m.e.resultados, m.e.revision, m.e.enviando], [["001-001-0000001"], null, false]);
  }

  for (const [nombre, B] of [["cliente", BCliente], ["ítem", BItem], ["valor", BValor]] as const) {
    // 2. Cambio de cliente / ítem / valor con la previa PENDIENTE
    const m = montar();

    m.f.cambio(huella(A));
    void m.f.revisar(A);
    m.f.cambio(huella(B));
    igual("previa pendiente + cambio de " + nombre + ": la revisión se invalida al instante (sin esperar la respuesta) y se avisa", [m.e.revision, m.e.revisando, m.e.avisos], [null, false, [AVISO_CAMBIO]]);
    m.previas[0].d.ok({ total: "100" }); await tick();
    igual("previa pendiente + cambio de " + nombre + ": la respuesta de A llega tarde y se DESCARTA (no hay revisión)", m.e.revision, null);
    void m.f.enviar(); await tick();
    igual("previa pendiente + cambio de " + nombre + ": «Enviar» no emite nada (ni A ni B) y exige revisar de nuevo", [m.envios.length, m.e.avisos[m.e.avisos.length - 1]], [0, AVISO_SIN_REVISION]);
  }

  for (const [nombre, B] of [["cliente", BCliente], ["ítem", BItem], ["valor", BValor]] as const) {
    // 3. Cambio DESPUÉS de revisar
    const m = montar();

    m.f.cambio(huella(A));
    void m.f.revisar(A); m.previas[0].d.ok({ total: "100" }); await tick();
    m.f.cambio(huella(B));
    igual("revisado A + cambio de " + nombre + ": la revisión queda sin efecto y se exige nueva confirmación", [m.e.revision, m.e.avisos], [null, [AVISO_CAMBIO]]);
    void m.f.enviar(); await tick();
    igual("revisado A + cambio de " + nombre + ": «Enviar factura» no reconstruye otro documento (cero envíos)", m.envios.length, 0);
    // la nueva revisión de B sí se puede enviar, y se envía B (no A)
    void m.f.revisar(B); m.previas[1].d.ok({ total: "200" }); await tick();
    void m.f.enviar();
    igual("revisado A + cambio de " + nombre + ": tras revisar B se envía exactamente B", [m.envios.length, m.envios[0].cuerpo === B, huella(m.envios[0].cuerpo)], [1, true, huella(B)]);
  }

  {
    // 4. Respuesta antigua de la previa: dos revisiones solapadas
    const m = montar();

    m.f.cambio(huella(A));
    void m.f.revisar(A);                                  // previa 1 (A) en vuelo
    m.f.cambio(huella(BItem));                            // el operador cambia el ítem
    void m.f.revisar(BItem);                              // previa 2 (B)
    m.previas[0].d.ok({ total: "A-tardío" }); await tick();
    igual("respuesta antigua: la previa de A que llega después de iniciar la de B se descarta", m.e.revision, null);
    m.previas[1].d.ok({ total: "B" }); await tick();
    igual("respuesta antigua: solo la revisión vigente (B) queda disponible", [m.e.revision?.version, m.e.revision?.resumen.total, m.e.revision?.huella], [2, "B", huella(BItem)]);
    void m.f.enviar();
    igual("respuesta antigua: se envía B, nunca A", [m.envios.length, huella(m.envios[0].cuerpo)], [1, huella(BItem)]);

    // error tardío de una previa invalidada: no se muestra
    const n = montar();

    n.f.cambio(huella(A)); void n.f.revisar(A); n.f.cambio(huella(BValor)); void n.f.revisar(BValor);
    n.previas[0].d.ko(new Error("tarde")); await tick();
    igual("respuesta antigua: el error de una previa invalidada no se informa", n.e.errores, []);
    n.previas[1].d.ko(new Error("vigente")); await tick();
    igual("respuesta antigua: el error de la previa vigente sí se informa y libera la revisión", [n.e.errores, n.e.revisando], [[{ m: "vigente", fase: "previa" }], false]);
  }

  {
    // 5. Cancelar (Volver a editar) sin emitir ni consumir número
    const m = montar();

    m.f.cambio(huella(A));
    void m.f.revisar(A); m.previas[0].d.ok({ total: "100" }); await tick();
    m.f.cancelar();
    igual("cancelar: la revisión se olvida y no se hizo ningún envío (no se consume número)", [m.e.revision, m.envios.length], [null, 0]);
    void m.f.enviar(); await tick();
    igual("cancelar: «Enviar» tras cancelar no emite y pide revisar", [m.envios.length, m.e.avisos], [0, [AVISO_SIN_REVISION]]);
    // cancelar con la previa pendiente: su respuesta tardía no crea una revisión
    const n = montar();

    n.f.cambio(huella(A)); void n.f.revisar(A); n.f.cancelar(); n.previas[0].d.ok({ total: "100" }); await tick();
    igual("cancelar con la previa pendiente: la respuesta tardía no deja una revisión enviable", n.e.revision, null);
  }

  {
    // 6. Envío duplicado durante una operación en curso
    const m = montar();

    m.f.cambio(huella(A));
    void m.f.revisar(A); m.previas[0].d.ok({ total: "100" }); await tick();
    void m.f.enviar(); void m.f.enviar(); void m.f.enviar();
    igual("envío duplicado: tres clics seguidos producen UN solo POST", [m.envios.length, m.e.enviando], [1, true]);
    m.envios[0].d.ok({ numero: "N1" }); await tick();
    igual("envío duplicado: un clic posterior al resultado no reenvía (la revisión ya fue consumida)", [m.e.resultados, m.e.enviando], [["N1"], false]);
    void m.f.enviar(); await tick();
    igual("envío duplicado: sin nueva revisión no hay segundo POST", m.envios.length, 1);

    // error de envío: la revisión se descarta y se puede revisar y enviar de nuevo con otro ciclo
    const n = montar();

    n.f.cambio(huella(A)); void n.f.revisar(A); n.previas[0].d.ok({ total: "100" }); await tick();
    void n.f.enviar(); n.envios[0].d.ko(new Error("gateway")); await tick();
    igual("error de envío: se informa, la revisión se descarta y el envío queda liberado", [n.e.errores, n.e.revision, n.e.enviando], [[{ m: "gateway", fase: "envio" }], null, false]);
    void n.f.revisar(A); n.previas[1].d.ok({ total: "100" }); await tick(); void n.f.enviar();
    igual("error de envío: tras revisar de nuevo se puede reintentar (misma clave de idempotencia)", [n.envios.length, n.envios[1].cuerpo.claveIdempotencia], [2, "k"]);
  }

  {
    // C01-R02-01: errores tardíos de una previa invalidada (sin que empiece otra) o cancelada se descartan
    const m = montar();

    m.f.cambio(huella(A));
    void m.f.revisar(A);
    m.f.cambio(huella(BCliente));                       // los datos cambian: la previa A queda invalidada y NO empieza otra
    m.previas[0].d.ko(new Error("error tardío de A")); await tick();
    igual("R02-01: error tardío de una previa invalidada por cambio de datos (sin nueva previa) NO se informa", [m.e.errores, m.e.revisando, m.e.avisos], [[], false, [AVISO_CAMBIO]]);

    const n = montar();

    n.f.cambio(huella(A));
    void n.f.revisar(A);
    n.f.cancelar();                                     // Volver a editar con la previa en vuelo
    n.previas[0].d.ko(new Error("error tras cancelar")); await tick();
    igual("R02-01: error de una previa cancelada NO se informa y la pantalla no queda 'revisando'", [n.e.errores, n.e.revisando, n.e.revision], [[], false, null]);

    const o = montar();

    o.f.cambio(huella(A));
    void o.f.revisar(A);
    o.f.cancelar();
    o.previas[0].d.ok({ total: "tarde" }); await tick();
    igual("R02-01: el resultado exitoso tardío tras cancelar tampoco abre una revisión", [o.e.revision, o.e.errores, o.envios.length], [null, [], 0]);

    const p = montar();

    p.f.cambio(huella(A));
    void p.f.revisar(A);
    p.previas[0].d.ko(new Error("falla vigente")); await tick();
    igual("R02-01: el error de la previa VIGENTE sí se informa y libera la pantalla", [p.e.errores, p.e.revisando], [[{ m: "falla vigente", fase: "previa" }], false]);

    // respuestas fuera de orden: A (v1) y B (v2); A falla tarde, B resuelve
    const q = montar();

    q.f.cambio(huella(A)); void q.f.revisar(A);
    q.f.cambio(huella(BItem)); void q.f.revisar(BItem);
    q.previas[1].d.ok({ total: "B" }); await tick();
    q.previas[0].d.ko(new Error("A tarde")); await tick();
    igual("R02-01: respuestas fuera de orden — el error tardío de A no afecta la revisión vigente de B", [q.e.errores, q.e.revision?.resumen.total, q.e.revisando], [[], "B", false]);
    void q.f.enviar();
    igual("R02-01: y se envía exactamente B", [q.envios.length, huella(q.envios[0].cuerpo)], [1, huella(BItem)]);

    // A tarde con éxito después de que B falló: no crea revisión de A
    const r = montar();

    r.f.cambio(huella(A)); void r.f.revisar(A);
    r.f.cambio(huella(BItem)); void r.f.revisar(BItem);
    r.previas[1].d.ko(new Error("B falla")); await tick();
    r.previas[0].d.ok({ total: "A tarde" }); await tick();
    igual("R02-01: fuera de orden — B falla (se informa) y la respuesta tardía de A no crea revisión", [r.e.errores, r.e.revision], [[{ m: "B falla", fase: "previa" }], null]);
  }

  return fallos;
}
