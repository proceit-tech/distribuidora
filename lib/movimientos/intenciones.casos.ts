/**
 * MOV-O07 / PRO-188 — recuperación durable de la intención de registro (REQ-MOV-O07, T01…T18). Sin PostgreSQL real ni navegador:
 *  · el control real (`crearControlRegistro`), el cliente real (`reservarIntencionApi` / `ejecutarIntencionApi` / `consultarIntencionApi`), la recuperación real (`recuperarIntencion`) y la orquestación de servidor
 *    real (`reservarIntencion` / `ejecutarIntencion` / `consultarIntencion`) se ejercen contra una BASE SIMULADA que reproduce el contrato de NEX-066 y NEX-014 (índice único parcial, titularidad por empresa+usuario,
 *    bloqueos que serializan K1 y el motor idempotente) con transacciones deshacibles y bloqueos reales entre llamadas concurrentes;
 *  · un adaptador HTTP simulado traduce rutas ↔ funciones con las mismas respuestas que las rutas y puede PERDER la respuesta tras el COMMIT.
 * NO prueban el motor SQL: el SQL de NEX-066 solo se verifica estructuralmente (contrato documentado). Tampoco prueban React ni navegador.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { consultarIntencionApi, ejecutarIntencionApi, reservarIntencionApi } from "@/lib/movimientos/cliente-api";
import { consultarIntencion, ejecutarIntencion, ErrorIntencion, esRechazoDeterminista, reservarIntencion, respuestaDeError, respuestaEjecucion } from "@/lib/movimientos/intenciones";
import { crearControlRegistro, MENSAJE_SALIDA } from "@/lib/movimientos/intento";
import { consultarResultado, recuperarIntencion } from "@/lib/movimientos/recuperacion";
import type { NuevoMovimientoStock } from "@/types/movimientos-stock";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [EMP, EMP2, USR, USR_B, USR_C, PROD, DEP_A, DEP_B] = [U(1), U(2), U(11), U(12), U(13), U(21), U(31), U(32)];
const D = "2026-10-19";

const base = (extra: Partial<NuevoMovimientoStock> = {}): NuevoMovimientoStock =>
  ({ tipo: "ENTRADA", origen: "COMPRA", fecha: D, productoId: PROD, cantidad: 5, costoUnitario: 100, depositoOrigenId: "", depositoDestinoId: DEP_A, lote: "", fechaVencimiento: "", documentoReferencia: "OC-1", motivo: "conteo", observacion: "obs", claveIdempotencia: "", ...extra }) as NuevoMovimientoStock;

type Fila = { id: string; empresa: string; usuario: string; clave: string; snapshot: Record<string, unknown>; huella: string; estado: string; movimientoId: string | null; numero: string | null; creadoAt: Date };
class ErrorPg extends Error {
  constructor(m: string, readonly code: string, readonly detail?: string) {
    super(m);
  }
}

/** Base simulada: contrato de NEX-066 + NEX-014. Las mutaciones se deshacen en ROLLBACK; los bloqueos duran hasta COMMIT/ROLLBACK. */
function bdSimulada() {
  const st = { intenciones: [] as Fila[], movimientos: new Map<string, { id: string; numero: string; creadoPor: string; huella: string }>(), efectosStock: 0, siguiente: 1 };
  const cfg = { permisos: new Set([`${EMP}|${USR}`, `${EMP}|${USR_B}`, `${EMP2}|${USR_C}`]), depositos: new Set([DEP_A, DEP_B]), fallaMotor: null as null | (() => Error), fallarCommit: 0, antesDeCommit: null as null | (() => Promise<void>), ahora: () => new Date() };
  const bloqueos = new Map<string, Promise<void>>();
  const consultas: string[] = [];

  const adquirir = async (clave: string, tx: { liberar: Array<() => void> }) => {
    while (bloqueos.has(clave)) await bloqueos.get(clave);
    let libre: () => void = () => undefined;

    bloqueos.set(clave, new Promise<void>((r) => { libre = r; }));
    tx.liberar.push(() => { bloqueos.delete(clave); libre(); });
  };
  const permiso = (e: string, u: string) => cfg.permisos.has(`${e}|${u}`);
  const hoyLimite = "2026-12-31";

  function conectar() {
    const tx = { abierta: false, deshacer: [] as Array<() => void>, liberar: [] as Array<() => void> };
    const cerrar = (confirma: boolean) => {
      if (!confirma) [...tx.deshacer].reverse().forEach((f) => f());
      tx.deshacer = [];
      tx.liberar.forEach((f) => f());
      tx.liberar = [];
      tx.abierta = false;
    };

    return {
      release() {
        if (tx.abierta) cerrar(false);
      },
      async query(sqlCrudo: string, p: unknown[] = []) {
        const sql = sqlCrudo.replace(/\s+/g, " ").trim();

        consultas.push(sql);
        if (sql === "BEGIN") { tx.abierta = true; return { rows: [] }; }
        if (sql === "COMMIT") {
          if (cfg.antesDeCommit) await cfg.antesDeCommit();
          if (cfg.fallarCommit > 0) { cfg.fallarCommit -= 1; cerrar(false); throw new ErrorPg("conexión cortada durante el COMMIT", "08006"); }
          cerrar(true);

          return { rows: [] };
        }
        if (sql === "ROLLBACK") { cerrar(false); return { rows: [] }; }

        const [empresa, usuario, clave] = p as [string, string, string];
        const necesitaPermiso = () => { if (!permiso(empresa, usuario)) throw new ErrorPg("el usuario no tiene permiso MOVIMIENTOS.CREAR en esta empresa", "42501"); };

        if (/FROM movimiento_intencion_reservar/.test(sql)) {
          necesitaPermiso();
          const snapshot = JSON.parse(p[3] as string) as Record<string, unknown>;

          if (!clave || clave.length < 8) throw new ErrorPg("la clave del registro no es válida", "P0001");
          await adquirir(`u:${empresa}:${usuario}`, tx);
          const huella = JSON.stringify(snapshot);
          const previa = st.intenciones.find((i) => i.empresa === empresa && i.clave === clave);

          if (previa) {
            if (previa.usuario !== usuario || previa.huella !== huella) throw new ErrorPg("la clave del registro no está disponible", "P0001", "NEX:INTENCION_CONFLICTO");

            return { rows: [{ clave: previa.clave, estado: previa.estado, snapshot: previa.snapshot, creado_at: previa.creadoAt, nueva: false }] };
          }
          if (st.intenciones.some((i) => i.empresa === empresa && i.usuario === usuario && i.estado === "RESERVADA")) throw new ErrorPg("hay un registro anterior sin resolver", "P0001", "NEX:INTENCION_PENDIENTE");

          const fila: Fila = { id: `i${st.intenciones.length + 1}`, empresa, usuario, clave, snapshot, huella, estado: "RESERVADA", movimientoId: null, numero: null, creadoAt: cfg.ahora() };

          st.intenciones.push(fila);
          tx.deshacer.push(() => { st.intenciones = st.intenciones.filter((i) => i !== fila); });

          return { rows: [{ clave, estado: "RESERVADA", snapshot, creado_at: fila.creadoAt, nueva: true }] };
        }
        if (/FROM movimiento_intencion_pendiente/.test(sql)) {
          necesitaPermiso();
          const i = st.intenciones.find((x) => x.empresa === empresa && x.usuario === usuario && x.estado === "RESERVADA");

          if (!i) return { rows: [] };
          const evidencia = st.movimientos.get(`${empresa}|${i.clave}`);

          return { rows: [{ clave: i.clave, estado: i.estado, snapshot: i.snapshot, creado_at: i.creadoAt, requiere_revision: cfg.ahora().getTime() - i.creadoAt.getTime() > 7 * 86_400_000, evidencia_numero: evidencia && evidencia.creadoPor === usuario ? evidencia.numero : null }] };
        }
        if (/FROM movimiento_intencion_tomar/.test(sql)) {
          necesitaPermiso();
          const i = st.intenciones.find((x) => x.empresa === empresa && x.usuario === usuario && x.clave === clave);

          if (!i) throw new ErrorPg("registro no encontrado", "P0002");
          await adquirir(`k:${empresa}:${clave}`, tx);

          return { rows: [{ estado: i.estado, snapshot: i.snapshot, numero: i.numero }] };
        }
        if (/FROM productos/.test(sql)) return { rows: [{ modo: "CANTIDAD", controla_stock: true }], rowCount: 1 };
        if (/FROM inventario_registrar_movimiento/.test(sql)) {
          const [emp, usr, tipo, , fecha, orig, dest, lineas, k] = p as [string, string, string, string, string, string | null, string | null, string, string];

          if (!permiso(emp, usr)) throw new ErrorPg("sin permiso", "42501");
          for (const d of [orig, dest]) if (d && !cfg.depositos.has(d)) throw new ErrorPg("el usuario no tiene alcance sobre el depósito", "42501");
          if (fecha > hoyLimite) throw new ErrorPg("la fecha del movimiento no puede ser futura", "P0001");
          const huella = JSON.stringify([tipo, fecha, orig, dest, lineas]);
          const previo = st.movimientos.get(`${emp}|${k}`);

          if (previo) {
            if (previo.huella !== huella) throw new ErrorPg("la clave de idempotencia ya fue usada con una solicitud distinta", "P0001", "NEX:IDEMPOTENCIA_CONFLICTO");

            return { rows: [{ id: previo.id, numero: previo.numero, repetido: true }] };
          }
          if (cfg.fallaMotor) throw cfg.fallaMotor();
          const mov = { id: `m${st.siguiente}`, numero: `MOV-${String(st.siguiente).padStart(6, "0")}`, creadoPor: usr, huella };

          st.siguiente += 1;
          st.efectosStock += 1;
          st.movimientos.set(`${emp}|${k}`, mov);
          tx.deshacer.push(() => { st.movimientos.delete(`${emp}|${k}`); st.efectosStock -= 1; });

          return { rows: [{ id: mov.id, numero: mov.numero, repetido: false }] };
        }
        if (/movimiento_intencion_confirmar/.test(sql)) {
          const [, , k, movimientoId, numero] = p as [string, string, string, string, string];
          const i = st.intenciones.find((x) => x.empresa === empresa && x.usuario === usuario && x.clave === k);
          const evidencia = st.movimientos.get(`${empresa}|${k}`);

          if (!i || !evidencia || evidencia.id !== movimientoId || evidencia.numero !== numero || evidencia.creadoPor !== usuario) throw new ErrorPg("no existe el movimiento original de esta intención", "P0001");
          const antes = { ...i };

          i.estado = "CONFIRMADA";
          i.movimientoId = movimientoId;
          i.numero = numero;
          tx.deshacer.push(() => Object.assign(i, antes));

          return { rows: [] };
        }
        if (/movimiento_intencion_rechazar/.test(sql)) {
          necesitaPermiso();
          const i = st.intenciones.find((x) => x.empresa === empresa && x.usuario === usuario && x.clave === clave);

          if (!i) throw new ErrorPg("registro no encontrado", "P0002");
          if (i.estado !== "RESERVADA") return { rows: [] };
          if (st.movimientos.has(`${empresa}|${clave}`)) throw new ErrorPg("existe un movimiento con esa clave", "P0001", "NEX:INTENCION_NO_RECHAZABLE");
          const antes = { ...i };

          i.estado = "RECHAZADA_DEFINITIVA";
          tx.deshacer.push(() => Object.assign(i, antes));

          return { rows: [] };
        }
        throw new Error("consulta no simulada: " + sql.slice(0, 80));
      },
    };
  }

  return { st, cfg, consultas, db: { connect: async () => conectar() as never } };
}

type Sesion = { empresa: string; usuario: string } | null;

/** Adaptador HTTP simulado: mismas respuestas que las rutas (sesión → permiso → función); `perderRespuesta` descarta la respuesta tras ejecutar (el servidor ya terminó). */
function http(bd: ReturnType<typeof bdSimulada>, sesion: () => Sesion, opciones: { perderRespuestaEjecutar?: () => boolean; perderRespuestaReservar?: () => boolean; estadoEjecutar?: () => number | null; sinApi?: () => boolean } = {}) {
  const peticiones: string[] = [];
  const f = async (url: string, init?: RequestInit): Promise<Response> => {
    const metodo = init?.method ?? "GET";

    peticiones.push(`${metodo} ${url}`);
    if (opciones.sinApi?.()) throw new TypeError("fetch failed");
    const s = sesion();
    const respuesta = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

    if (!s) return respuesta(401, { error: "Sesión no válida." });
    if (!bd.cfg.permisos.has(`${s.empresa}|${s.usuario}`)) return respuesta(403, { error: "No tiene permiso para esta acción." });

    try {
      if (url.endsWith("/ejecutar")) {
        const forzado = opciones.estadoEjecutar?.() ?? null;

        if (forzado) return respuesta(forzado, forzado === 401 || forzado === 403 ? { error: "Rechazado antes de consultar la clave." } : "<html>");
        const clave = String((JSON.parse(String(init?.body)) as { clave?: string }).clave);
        const h = respuestaEjecucion(await ejecutarIntencion(bd.db, s.empresa, s.usuario, clave));

        if (opciones.perderRespuestaEjecutar?.()) throw new TypeError("fetch failed");

        return respuesta(h.status, h.body);
      }
      if (metodo === "POST") {
        const r = await reservarIntencion(bd.db, s.empresa, s.usuario, JSON.parse(String(init?.body)) as Record<string, unknown>);

        if (opciones.perderRespuestaReservar?.()) throw new TypeError("fetch failed");

        return respuesta(r.nueva ? 201 : 200, { intencion: r.intencion, nueva: r.nueva });
      }

      return respuesta(200, { intencion: await consultarIntencion(bd.db, s.empresa, s.usuario) });
    } catch (e) {
      if (e instanceof TypeError) throw e;
      const h = respuestaDeError(e);

      return respuesta(h.status, h.body);
    }
  };

  return { f, peticiones };
}

/** Pantalla simulada: control real en modo durable conectado al adaptador HTTP. */
function pantalla(h: ReturnType<typeof http>, prefijo = "") {
  let n = 0;
  const control = crearControlRegistro({
    generarClave: () => `${prefijo}clave-K${++n}-00000000`,
    reservar: (d) => reservarIntencionApi(d, h.f),
    enviar: (d) => ejecutarIntencionApi(d.claveIdempotencia, h.f),
    iniciarRecuperando: true,
  });

  return { control, abrir: () => recuperarIntencion(control, () => consultarIntencionApi(h.f)) };
}

export async function verificarCasosMovimientosIntenciones(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const sesion: { actual: Sesion } = { actual: { empresa: EMP, usuario: USR } };

  // T01: la reserva se confirma ANTES de tocar stock; si falla, no hay movimiento.
  {
    const bd = bdSimulada();
    const h = http(bd, () => sesion.actual, { sinApi: () => true });
    const p = pantalla(h);

    p.control.fijarRecuperacion(null);
    const r = await p.control.registrar(base());

    igual("T01: la reserva falla (API caída) → NO_RESERVADA, ningún efecto de stock ni intención local, y el formulario queda libre", [r.tipo, bd.st.efectosStock, bd.st.intenciones.length, p.control.bloqueado(), h.peticiones.some((x) => x.includes("/ejecutar"))], ["NO_RESERVADA", 0, 0, false, false]);
  }
  {
    const bd = bdSimulada();
    const h = http(bd, () => sesion.actual);
    const p = pantalla(h);

    await p.abrir();
    const orden: string[] = [];
    const original = bd.cfg.antesDeCommit;

    bd.cfg.antesDeCommit = async () => { orden.push(`commit(stock=${bd.st.efectosStock},intenciones=${bd.st.intenciones.length})`); };
    await p.control.registrar(base());
    bd.cfg.antesDeCommit = original;

    igual("T01b: la intención RESERVADA se compromete con 0 efectos de stock (checkpoint previo); luego el segundo COMMIT lleva movimiento + CONFIRMADA en la misma transacción", [orden, bd.st.efectosStock, bd.st.intenciones[0].estado, bd.st.intenciones[0].numero], [["commit(stock=0,intenciones=1)", "commit(stock=1,intenciones=1)"], 1, "CONFIRMADA", "MOV-000001"]);
  }

  // T02/T03: respuesta perdida tras reserva / tras COMMIT → recarga, logout/login → número original sin duplicar.
  {
    const bd = bdSimulada();
    let perder = true;
    const h = http(bd, () => sesion.actual, { perderRespuestaEjecutar: () => perder });
    const p1 = pantalla(h);

    await p1.abrir();
    const r1 = await p1.control.registrar(base());

    igual("T03a: COMMIT hecho y respuesta HTTP perdida → INDETERMINADO; el movimiento ya existe una vez", [r1.tipo, bd.st.efectosStock, bd.st.intenciones[0].estado], ["INDETERMINADO", 1, "CONFIRMADA"]);

    // refresh / cierre / logout-login: nueva pantalla y NUEVA sesión del mismo usuario
    perder = false;
    sesion.actual = null;
    const sinSesion = await pantalla(h).abrir();

    sesion.actual = { empresa: EMP, usuario: USR };
    const p2 = pantalla(h);
    const rec = await p2.abrir();

    igual("T03b/T06: sin sesión la recuperación falla CERRADO (registro bloqueado); tras el nuevo login del mismo usuario la intención ya no está pendiente (se confirmó en el servidor) y el formulario queda libre sin duplicar", [sinSesion.estado, rec.estado, bd.st.efectosStock], ["ERROR", "LIBRE", 1]);
  }
  {
    // T02: reserva hecha pero la respuesta de la ejecución nunca llegó (ni se ejecutó): recarga → recupera K1 y snapshot, nunca K2.
    const bd = bdSimulada();
    const hCaido = http(bd, () => sesion.actual, { estadoEjecutar: () => 503 });
    const p1 = pantalla(hCaido);

    await p1.abrir();
    await p1.control.registrar(base({ cantidad: 7 }));
    const h2 = http(bd, () => sesion.actual);
    const p2 = pantalla(h2);
    const rec = await p2.abrir();

    igual("T02: tras un 5xx en la ejecución y un refresh, se RECUPERAN K1 y el snapshot originales (cantidad 7, fecha original) con el formulario bloqueado; no se genera K2", [rec.estado, rec.estado === "INDETERMINADO" ? rec.formulario.cantidad : null, rec.estado === "INDETERMINADO" ? rec.formulario.fecha : null, p2.control.clave(), p2.control.bloqueado(), bd.st.intenciones.length, bd.st.efectosStock], ["INDETERMINADO", 7, D, "clave-K1-00000000", true, 1, 0]);

    const reintento = await p2.control.registrar(base({ cantidad: 999 }));

    igual("T04: el reintento de la intención recuperada usa K1 y el snapshot PERSISTIDO (no lo que haya en pantalla): un único movimiento con cantidad 7", [reintento.tipo, reintento.tipo === "OK" ? reintento.numero : null, bd.st.efectosStock, bd.st.intenciones[0].estado], ["OK", "MOV-000001", 1, "CONFIRMADA"]);
  }

  // T05/T07: titularidad. Otro usuario de la misma empresa / otra empresa no recupera ni ejecuta K1.
  {
    const bd = bdSimulada();
    const h = http(bd, () => sesion.actual, { estadoEjecutar: () => null });
    const p1 = pantalla(http(bd, () => sesion.actual, { estadoEjecutar: () => 503 }));

    await p1.abrir();
    await p1.control.registrar(base());
    const clave = p1.control.clave()!;

    sesion.actual = { empresa: EMP, usuario: USR_B };
    const verB = await consultarIntencionApi(h.f);
    const ejecutarB = await ejecutarIntencionApi(clave, h.f);
    const reservarMismaClaveB = await reservarIntencionApi({ ...base(), claveIdempotencia: clave }, h.f);

    sesion.actual = { empresa: EMP2, usuario: USR_C };
    const verC = await consultarIntencionApi(h.f);
    const ejecutarC = await ejecutarIntencionApi(clave, h.f);

    sesion.actual = { empresa: EMP, usuario: USR };

    igual("T05/T07: otro usuario de la misma empresa y un usuario de otra empresa NO ven la intención (ausencia neutra), no pueden ejecutarla con K1 (indeterminado, sin movimiento) ni reservar esa clave; K1 no es una credencial", [verB.ok && verB.intencion, verC.ok && verC.intencion, ejecutarB.tipo, ejecutarC.tipo, reservarMismaClaveB.tipo, bd.st.efectosStock], [null, null, "INDETERMINADO", "INDETERMINADO", "FALLO", 0]);
  }

  // T08: dos pestañas intentan reservar simultáneamente → una sola intención incierta; la otra recupera la existente (sin K2).
  {
    const bd = bdSimulada();
    const hA = http(bd, () => sesion.actual, { estadoEjecutar: () => 503 });
    const pA = pantalla(hA);
    const pB = pantalla(hA, "tabB-");

    pA.control.fijarRecuperacion(null);
    pB.control.fijarRecuperacion(null);
    const [rA, rB] = await Promise.all([pA.control.registrar(base({ cantidad: 3 })), pB.control.registrar(base({ cantidad: 4 }))]);
    const tipos = [rA.tipo, rB.tipo].sort();

    igual("T08: dos pestañas del mismo operador reservan a la vez: la base admite UNA sola intención incierta; la otra recibe la pendiente existente (RECUPERADA) y queda bloqueada con la K1 original", [bd.st.intenciones.filter((i) => i.estado === "RESERVADA").length, tipos, new Set([pA.control.clave(), pB.control.clave()]).size === 1], [1, ["INDETERMINADO", "RECUPERADA"], true]);

    const segunda = pantalla(hA);
    const r3 = await segunda.abrir();

    igual("T08b: una tercera visita recupera la misma intención pendiente y NO habilita un registro nuevo", [r3.estado, segunda.control.bloqueado(), bd.st.intenciones.length], ["INDETERMINADO", true, 1]);
  }

  // T09: dos POST concurrentes de la misma K1 → un solo movimiento y un solo efecto de stock.
  {
    const bd = bdSimulada();
    const h = http(bd, () => sesion.actual);

    await reservarIntencionApi({ ...base(), claveIdempotencia: "clave-K1-00000000" }, h.f);
    const [a, b] = await Promise.all([ejecutarIntencionApi("clave-K1-00000000", h.f), ejecutarIntencionApi("clave-K1-00000000", h.f)]);

    igual("T09: dos ejecuciones simultáneas de la misma K1 se serializan (bloqueo de fila): un solo movimiento y un solo efecto de stock; la segunda ve la confirmación («repetido»)", [a.tipo, b.tipo, [a, b].filter((x) => x.tipo === "OK" && x.repetido).length, bd.st.efectosStock, bd.st.movimientos.size], ["OK", "OK", 1, 1, 1]);
  }

  // T10: fallo cerrado de la recuperación; navegación / Back no destruyen el checkpoint del servidor.
  {
    const bd = bdSimulada();
    const caido = http(bd, () => sesion.actual, { sinApi: () => true });
    const p = pantalla(caido);
    const rec = await p.abrir();
    const intento = await p.control.registrar(base());

    igual("T10: si la API de recuperación no está disponible el registro nuevo permanece BLOQUEADO (falla cerrado), sin modo libre y sin enviar nada", [rec.estado, p.control.estado(), intento.tipo, caido.peticiones.filter((x) => x.startsWith("POST")).length, bd.st.efectosStock], ["ERROR", "RECUPERACION_ERROR", "OCUPADO", 0, 0]);

    // El checkpoint vive en el servidor: abandonar la pantalla (Back/enlace) no lo toca.
    const h = http(bd, () => sesion.actual, { estadoEjecutar: () => 503 });
    const p2 = pantalla(h);

    await p2.abrir();
    await p2.control.registrar(base());
    const antes = bd.st.intenciones.map((i) => i.estado);
    const p3 = pantalla(http(bd, () => sesion.actual));

    igual("T10b: tras abandonar la pantalla (sin ningún acceso al servidor) la intención sigue RESERVADA y se recupera en la siguiente apertura", [antes, (await p3.abrir()).estado], [["RESERVADA"], "INDETERMINADO"]);
  }

  // T11: más de 7 días → «requiere revisión»; nunca se libera ni se descarta.
  {
    const bd = bdSimulada();
    const h = http(bd, () => sesion.actual, { estadoEjecutar: () => 503 });
    const p1 = pantalla(h);

    await p1.abrir();
    await p1.control.registrar(base());
    bd.cfg.ahora = () => new Date(Date.now() + 8 * 86_400_000);
    const vieja = await consultarIntencion(bd.db, EMP, USR);
    const p2 = pantalla(http(bd, () => sesion.actual));
    const rec = await p2.abrir();

    igual("T11: con más de 7 días la intención sigue pendiente y bloqueando, marcada «requiere revisión»; no se eliminó ni se liberó K2", [vieja?.requiereRevision, rec.estado, rec.estado === "INDETERMINADO" ? /requiere revisión/.test(rec.mensaje) : null, p2.control.bloqueado(), bd.st.intenciones.length, bd.st.intenciones[0].estado], [true, "INDETERMINADO", true, true, 1, "RESERVADA"]);
  }

  // T12: 400/401/403/409/timeout/5xx/cuerpo ilegible tras indeterminado: nunca RECHAZADA_DEFINITIVA ni K2.
  for (const status of [400, 401, 403, 409, 408, 500, 502, 504]) {
    const bd = bdSimulada();
    let forzar: number | null = 503;
    const h = http(bd, () => sesion.actual, { estadoEjecutar: () => forzar });
    const p = pantalla(h);

    await p.abrir();
    await p.control.registrar(base());
    forzar = status;
    const r = await p.control.registrar(base({ cantidad: 50 }));

    igual(`T12-${status}: tras un resultado indeterminado, un reintento con HTTP ${status} NO libera: sigue INDETERMINADO con K1, sin K2 y sin rechazo definitivo`, [r.tipo, p.control.estado(), p.control.clave(), bd.st.intenciones[0].estado, bd.st.efectosStock], ["INDETERMINADO", "INDETERMINADO", "clave-K1-00000000", "RESERVADA", 0]);
  }

  // T13: confirmada limpia el bloqueo y conserva trazabilidad; rechazo definitivo comprobado libera sin borrar la auditoría.
  {
    const bd = bdSimulada();
    const h = http(bd, () => sesion.actual);
    const p = pantalla(h);

    await p.abrir();
    const ok = await p.control.registrar(base());
    const nueva = await p.control.registrar(base({ cantidad: 2 }));

    igual("T13a: una confirmación libera el bloqueo (puede iniciarse una operación nueva) y conserva la trazabilidad de la primera (CONFIRMADA con su número)", [ok.tipo, nueva.tipo, bd.st.intenciones.map((i) => [i.estado, i.numero]), bd.st.efectosStock], ["OK", "OK", [["CONFIRMADA", "MOV-000001"], ["CONFIRMADA", "MOV-000002"]], 2]);

    const bd2 = bdSimulada();
    const p2 = pantalla(http(bd2, () => sesion.actual));

    await p2.abrir();
    bd2.cfg.fallaMotor = () => new ErrorPg("saldo insuficiente", "P0001");
    const rech = await p2.control.registrar(base());
    const libre = !p2.control.bloqueado();

    bd2.cfg.fallaMotor = null;
    const corregida = await p2.control.registrar(base({ cantidad: 1 }));

    igual("T13b: un rechazo DEFINITIVO comprobado por el servidor (reglas de inventario) libera el formulario, conserva la auditoría (RECHAZADA_DEFINITIVA) y permite una operación nueva con otra clave", [rech.tipo, rech.tipo === "RECHAZADO" ? rech.definitivo : null, libre, corregida.tipo, bd2.st.intenciones.map((i) => i.estado), bd2.st.efectosStock], ["RECHAZADO", true, true, "OK", ["RECHAZADA_DEFINITIVA", "CONFIRMADA"], 1]);
  }

  // T14: la fecha original viaja en el snapshot; la regla de fecha futura se valida con «hoy» solo para intenciones nuevas.
  {
    const bd = bdSimulada();
    const h = http(bd, () => sesion.actual, { estadoEjecutar: () => 503 });
    const p1 = pantalla(h);

    await p1.abrir();
    await p1.control.registrar(base({ fecha: "2026-10-19" }));
    const p2 = pantalla(http(bd, () => sesion.actual));

    await p2.abrir();
    const r = await p2.control.registrar(base({ fecha: "2026-10-20" }));
    const movimientos = [...bd.st.movimientos.values()].map((m) => m.huella);

    igual("T14: con otra fecha de Asunción al reintentar, el movimiento se registra con la fecha ORIGINAL del snapshot (2026-10-19), nunca la de la pantalla", [r.tipo, movimientos.length === 1 && movimientos[0].includes("2026-10-19"), bd.st.intenciones[0].snapshot.fecha], ["OK", true, "2026-10-19"]);
  }

  // T15: la recuperación sustituye el formulario por el snapshot; no se aplica sobre datos editados por el operador (lógica de la pantalla: tocado/inicializado) — ver pruebas de inicialización.
  const pagina = leer("app/(private)/movimientos/nuevo/page.tsx");

  cierto("T15 (estructura): la recuperación marca inicializado/tocado para que catálogos / precarga / respuestas tardías no restauren ni sobrescriban; usa el snapshot del servidor", /inicializado\.current = true;\n\s+tocado\.current = true;\n\s+setForm\(r\.formulario\)/.test(pagina) && /recuperarIntencion\(control\.current, consultarIntencionApi\)/.test(pagina) && /iniciarRecuperando: true/.test(pagina));

  // T16: permisos / depósitos revocados → niega, preserva K1, sin efecto de stock.
  {
    const bd = bdSimulada();
    let forzar: number | null = 503;
    const h = http(bd, () => sesion.actual, { estadoEjecutar: () => forzar });
    const p = pantalla(h);

    await p.abrir();
    await p.control.registrar(base());
    forzar = null;
    bd.cfg.depositos.delete(DEP_A); // alcance de depósito revocado
    const r = await p.control.registrar(base());

    igual("T16a: con el alcance de depósito revocado el reintento se niega (403), K1 se preserva, la intención sigue pendiente y no hay efecto de stock", [r.tipo, p.control.clave(), bd.st.intenciones[0].estado, bd.st.efectosStock], ["INDETERMINADO", "clave-K1-00000000", "RESERVADA", 0]);

    bd.cfg.permisos.delete(`${EMP}|${USR}`); // permiso MOVIMIENTOS.CREAR revocado
    const lectura = await consultarIntencionApi(h.f);

    igual("T16b: con MOVIMIENTOS.CREAR revocado la lectura de la intención se niega (sin payload) y la intención se conserva", [lectura.ok, bd.st.intenciones[0].estado], [false, "RESERVADA"]);
  }

  // T17: DEMO_MODE / sin sesión / sin base: nunca un checkpoint ni un éxito falsos.
  {
    const bd = bdSimulada();
    const h = http(bd, () => null);
    const reserva = await reservarIntencionApi({ ...base(), claveIdempotencia: "clave-K1-00000000" }, h.f);
    const ejecucion = await ejecutarIntencionApi("clave-K1-00000000", h.f);

    igual("T17: sin sesión no se crea ningún checkpoint ni se confirma nada (401: la reserva falla, la ejecución es indeterminada, 0 efectos)", [reserva.tipo, ejecucion.tipo, bd.st.intenciones.length, bd.st.efectosStock], ["FALLO", "INDETERMINADO", 0, 0]);

    const rutaHttp = leer("lib/movimientos/intenciones-http.ts");

    cierto("T17b (estructura): las rutas rechazan DEMO_MODE (400) y la falta de base (503) antes de tocar datos; sin sesión 401; permiso MOVIMIENTOS.CREAR; empresa y usuario de la sesión", /DEMO_MODE\) return \{ ok: false, respuesta: NextResponse\.json\(\{ error: "Operación no disponible en modo demo\." \}, \{ status: 400 \}\)/.test(rutaHttp) && /!process\.env\.DATABASE_URL\) return \{ ok: false.*status: 503/.test(rutaHttp) && /status: 401/.test(rutaHttp) && /denyIfNoPermission\(session, "MOVIMIENTOS", "CREAR"\)/.test(rutaHttp) && /empresaId: session\.user\.empresaId, usuarioId: session\.user\.id/.test(rutaHttp));
  }

  // Consultar resultado y evidencia; liberar solo cuando el servidor ya no tiene la intención.
  {
    const bd = bdSimulada();
    const h = http(bd, () => sesion.actual, { perderRespuestaEjecutar: () => true });
    const p = pantalla(h);

    await p.abrir();
    await p.control.registrar(base()); // COMMIT hecho; respuesta perdida (CONFIRMADA ya en el servidor)
    const hLeer = http(bd, () => sesion.actual);
    const p2 = pantalla(hLeer);

    await p2.abrir();
    // Simula la ventana en la que el movimiento existe pero la intención sigue pendiente (p. ej. ruta directa): evidencia visible.
    bd.st.intenciones[0].estado = "RESERVADA";
    const evidencia = await consultarResultado(p.control, () => consultarIntencionApi(hLeer.f));

    igual("consulta de resultado: muestra el número del movimiento original encontrado (evidencia) sin registrar nada y sin liberar", [/MOV-000001/.test(evidencia.mensaje), evidencia.liberada, bd.st.efectosStock], [true, false, 1]);

    bd.st.intenciones[0].estado = "CONFIRMADA";
    const resuelta = await consultarResultado(p.control, () => consultarIntencionApi(hLeer.f));

    igual("consulta de resultado: si el servidor ya no tiene la intención pendiente (resuelta en otra pestaña/sesión) se libera la local y se remite a Movimientos", [resuelta.liberada, p.control.bloqueado(), /Movimientos/.test(resuelta.mensaje)], [true, false, true]);
  }

  // Clasificación de rechazos del servidor y mensajes de salida.
  igual("rechazo determinista solo para errores del motor (P0001 de reglas, 22xxx/23xxx, validaciones planas); NUNCA permiso, conexión, tiempo, deadlock ni conflicto de idempotencia", [
    esRechazoDeterminista(Object.assign(new Error("saldo"), { code: "P0001" })), esRechazoDeterminista(Object.assign(new Error("x"), { code: "23514" })), esRechazoDeterminista(new Error("El lote L1 no existe para este producto.")),
    esRechazoDeterminista(Object.assign(new Error("perm"), { code: "42501" })), esRechazoDeterminista(Object.assign(new Error("x"), { code: "08006" })), esRechazoDeterminista(Object.assign(new Error("x"), { code: "40P01" })),
    esRechazoDeterminista(Object.assign(new Error("x"), { code: "57014" })), esRechazoDeterminista(Object.assign(new Error("x"), { code: "ECONNRESET" })), esRechazoDeterminista(new Error("Connection terminated unexpectedly")),
    esRechazoDeterminista(Object.assign(new Error("idem"), { code: "P0001", detail: "NEX:IDEMPOTENCIA_CONFLICTO" })),
  ], [true, true, true, false, false, false, false, false, false, false]);
  igual("los mensajes de salida con una intención incierta dicen que PUEDE haberse registrado y que se recupera al volver; nunca «cancelado», «revertido» ni «no registrado»", [/puede/.test(Object.values(MENSAJE_SALIDA).slice(1, 3).join(" ")), /recuper/.test(MENSAJE_SALIDA.ENVIANDO + MENSAJE_SALIDA.INDETERMINADO), /cancel|revert|deshech|no se registr/i.test(Object.values(MENSAJE_SALIDA).join(" "))], [true, true, false]);
  cierto("ErrorIntencion conserva su estado HTTP (409 pendiente / 403 / 404); un error desconocido es un 500 genérico que no revela datos y dice que el movimiento puede haberse registrado", respuestaDeError(new ErrorIntencion("x", 409)).status === 409 && respuestaDeError(new Error("secreto SQL")).status === 500 && !JSON.stringify(respuestaDeError(new Error("secreto SQL")).body).includes("secreto") && /puede haberse registrado/.test(JSON.stringify(respuestaDeError(new Error("x")).body)));

  // T18: contrato SQL y scripts (estructural; no se ejecuta SQL).
  const mig = leer("documentacao/banco/nexit/v1/migraciones/NEX-066-movimientos-intenciones.sql");
  const rev = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-066.sql");
  const pre = leer("documentacao/banco/nexit/v1/scripts/preflight-NEX-066.sql");
  const ver = leer("documentacao/banco/nexit/v1/scripts/verificar-NEX-066.sql");
  const doc = leer("documentacao/banco/nexit/v1/docs/PROCEDIMIENTO-NEX-066.md");

  cierto("T18a SQL: tabla por empresa+usuario con unicidad (empresa, clave), índice único PARCIAL de una sola RESERVADA por empresa+usuario, estados durables sin expiración, FK a usuarios y CHECK de coherencia", /CREATE TABLE public\.movimientos_intenciones/.test(mig) && /CONSTRAINT movimientos_intenciones_clave_uk\s+UNIQUE \(empresa_id, clave\)/.test(mig) && /CREATE UNIQUE INDEX movimientos_intenciones_pendiente_uk ON public\.movimientos_intenciones \(empresa_id, usuario_id\) WHERE estado = 'RESERVADA'/.test(mig) && /estado IN \('RESERVADA', 'CONFIRMADA', 'RECHAZADA_DEFINITIVA'\)/.test(mig) && /FOREIGN KEY \(empresa_id, usuario_id\) REFERENCES public\.usuarios/.test(mig) && /\(estado = 'CONFIRMADA'\) = \(movimiento_id IS NOT NULL AND numero_movimiento IS NOT NULL\)/.test(mig));
  cierto("T18b SQL: cinco funciones SECURITY DEFINER con search_path fijo y permiso MOVIMIENTOS.CREAR; reservar con bloqueo advisory por empresa+usuario y detalle NEX:INTENCION_PENDIENTE; tomar con FOR UPDATE; rechazar solo sin movimiento existente; confirmar exige la evidencia del movimiento; sin cron ni expiración que libere", ["reservar", "pendiente", "tomar", "confirmar", "rechazar"].every((f) => new RegExp(`FUNCTION public\\.movimiento_intencion_${f}\\(`).test(mig)) && (mig.match(/SECURITY DEFINER SET search_path = public, pg_temp/g) ?? []).length === 5 && /pg_advisory_xact_lock\(hashtextextended\('movimientos\.int:'/.test(mig) && /NEX:INTENCION_PENDIENTE/.test(mig) && /clave = p_clave FOR UPDATE/.test(mig) && /NEX:INTENCION_NO_RECHAZABLE/.test(mig) && /m\.clave_idempotencia = p_clave AND m\.creado_por = p_usuario/.test(mig) && !/cron|pg_cron|DELETE FROM public\.movimientos_intenciones|estado = 'EXPIRADA'/i.test(mig) && /interval '7 days'/.test(mig));
  cierto("T18c SQL: el rol de la aplicación solo EJECUTA las funciones (sin acceso a la tabla), ayudante nex_aplicar_grants_* descubierto por el envoltorio, NEX-014 no se modifica y no se ejecuta nada en la VM", /REVOKE ALL ON public\.movimientos_intenciones FROM nexit_runtime/.test(mig) && /GRANT EXECUTE ON FUNCTION public\.movimiento_intencion_reservar\(uuid, uuid, text, jsonb\) TO nexit_runtime/.test(mig) && /nex_aplicar_grants_movimientos_intenciones/.test(mig) && !/CREATE OR REPLACE FUNCTION (public\.)?inventario_registrar_movimiento/.test(mig) && /NO aplicada|NO se reaplica|no se reaplica/.test(mig));
  cierto("T18d scripts: preflight de solo lectura, verificación posterior, reversión que se NIEGA con intenciones inciertas y conserva respaldo, y procedimiento del responsable (backup, orden migración→código, reversión segura, sin descarte)", /BEGIN READ ONLY/.test(pre) && /ROLLBACK;/.test(pre) && /NEX-014 aplicada/.test(pre) && /BEGIN READ ONLY/.test(ver) && /nexit_runtime/.test(ver) && /REVERSIÓN ABORTADA: hay intenciones RESERVADAS/.test(rev) && /movimientos_intenciones_respaldo_nex066/.test(rev) && /docker exec -i nexit-db psql/.test(pre) && /Reversión segura/.test(doc) && /Primero la migración, después el código/.test(doc) && /nunca se elimina ni libera sola/.test(doc));

  // Estructura del servidor: ruta directa no puede eludir la protección; el POST de reserva precede a todo efecto.
  const rutaDirecta = leer("app/api/movimientos/route.ts");
  const srv = leer("lib/movimientos/intenciones.ts");

  cierto("servidor (estructura): la ruta directa POST /api/movimientos rechaza una clave distinta de la intención pendiente (409) y falla cerrado sin NEX-066 (503); la reserva hace COMMIT antes de cualquier motor; la ejecución usa el snapshot persistido y confirma en la MISMA transacción; el COMMIT de la ejecución dudoso nunca marca rechazo", /movimiento_intencion_pendiente\(\$1::uuid, \$2::uuid\)/.test(rutaDirecta) && /pendiente && \(!datos\.clave \|\| datos\.clave !== pendiente\.clave\)/.test(rutaDirecta) && /status: 503/.test(rutaDirecta) && /await c\.query\("COMMIT"\); \/\/ checkpoint durable/.test(srv) && !/registrarMovimiento/.test(srv.slice(srv.indexOf("export async function reservarIntencion"), srv.indexOf("export function esRechazoDeterminista"))) && /datosDeSnapshot\(t\.snapshot as Record<string, unknown>, clave\)/.test(srv) && /movimiento_intencion_confirmar/.test(srv) && /comprometiendo = true;\n\s+await c\.query\("COMMIT"\)/.test(srv) && /if \(comprometiendo\) throw e;/.test(srv));

  return fallos;
}
