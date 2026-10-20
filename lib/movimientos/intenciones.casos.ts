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
import { consultarIntencionApi, ejecutarIntencionApi, reconocerIntencionApi, reservarIntencionApi } from "@/lib/movimientos/cliente-api";
import { consultarIntencion, ejecutarIntencion, ErrorIntencion, esRechazoDeterminista, reconocerIntencion, reservarIntencion, respuestaDeError, respuestaEjecucion, respuestaPostLegado, respuestaReconocimiento } from "@/lib/movimientos/intenciones";
import { crearControlRegistro, MENSAJE_SALIDA } from "@/lib/movimientos/intento";
import { consultarResultado, recuperarIntencion } from "@/lib/movimientos/recuperacion";
import type { NuevoMovimientoStock } from "@/types/movimientos-stock";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [EMP, EMP2, USR, USR_B, USR_C, PROD, DEP_A, DEP_B] = [U(1), U(2), U(11), U(12), U(13), U(21), U(31), U(32)];
const D = "2026-10-19";

const base = (extra: Partial<NuevoMovimientoStock> = {}): NuevoMovimientoStock =>
  ({ tipo: "ENTRADA", origen: "COMPRA", fecha: D, productoId: PROD, cantidad: 5, costoUnitario: 100, depositoOrigenId: "", depositoDestinoId: DEP_A, lote: "", fechaVencimiento: "", documentoReferencia: "OC-1", motivo: "conteo", observacion: "obs", claveIdempotencia: "", ...extra }) as NuevoMovimientoStock;

type Fila = { id: string; empresa: string; usuario: string; clave: string; snapshot: Record<string, unknown>; huella: string; estado: string; movimientoId: string | null; numero: string | null; creadoAt: Date; reconocida: boolean };
class ErrorPg extends Error {
  constructor(m: string, readonly code: string, readonly detail?: string) {
    super(m);
  }
}

/** Base simulada: contrato de NEX-066 + NEX-014. Las mutaciones se deshacen en ROLLBACK; los bloqueos duran hasta COMMIT/ROLLBACK. */
function bdSimulada() {
  const st = { intenciones: [] as Fila[], movimientos: new Map<string, { id: string; numero: string; creadoPor: string; huella: string }>(), efectosStock: 0, stock: 0, siguiente: 1 };
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
          if (st.intenciones.some((i) => i.empresa === empresa && i.usuario === usuario && !i.reconocida && (i.estado === "RESERVADA" || i.estado === "CONFIRMADA"))) throw new ErrorPg("hay un registro anterior sin resolver", "P0001", "NEX:INTENCION_PENDIENTE");

          const fila: Fila = { id: `i${st.intenciones.length + 1}`, empresa, usuario, clave, snapshot, huella, estado: "RESERVADA", movimientoId: null, numero: null, creadoAt: cfg.ahora(), reconocida: false };

          st.intenciones.push(fila);
          tx.deshacer.push(() => { st.intenciones = st.intenciones.filter((i) => i !== fila); });

          return { rows: [{ clave, estado: "RESERVADA", snapshot, creado_at: fila.creadoAt, nueva: true }] };
        }
        if (/FROM movimiento_intencion_pendiente/.test(sql)) {
          necesitaPermiso();
          const i = st.intenciones.find((x) => x.empresa === empresa && x.usuario === usuario && !x.reconocida && (x.estado === "RESERVADA" || x.estado === "CONFIRMADA"));

          if (!i) return { rows: [] };
          const evidencia = st.movimientos.get(`${empresa}|${i.clave}`);

          return { rows: [{ clave: i.clave, estado: i.estado, snapshot: i.snapshot, creado_at: i.creadoAt, requiere_revision: i.estado === "RESERVADA" && cfg.ahora().getTime() - i.creadoAt.getTime() > 7 * 86_400_000, evidencia_numero: i.estado === "CONFIRMADA" ? i.numero : evidencia && evidencia.creadoPor === usuario ? evidencia.numero : null }] };
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
          const cantidad = Number((JSON.parse(lineas) as Array<{ cantidad: number }>)[0].cantidad);

          st.efectosStock += 1;
          st.stock += cantidad;
          st.movimientos.set(`${emp}|${k}`, mov);
          tx.deshacer.push(() => { st.movimientos.delete(`${emp}|${k}`); st.efectosStock -= 1; st.stock -= cantidad; });

          return { rows: [{ id: mov.id, numero: mov.numero, repetido: false }] };
        }
        if (/FROM movimiento_intencion_reconocer/.test(sql)) {
          necesitaPermiso();
          await adquirir(`u:${empresa}:${usuario}`, tx); // el MISMO bloqueo que reservar: el ACK y la reserva siguiente se serializan
          const i = st.intenciones.find((x) => x.empresa === empresa && x.usuario === usuario && x.clave === clave);

          if (!i) throw new ErrorPg("registro no encontrado", "P0002");
          if (i.estado !== "CONFIRMADA") throw new ErrorPg("solo se reconoce un registro confirmado", "P0001", "NEX:INTENCION_NO_CONFIRMADA");
          const evidencia = st.movimientos.get(`${empresa}|${clave}`);

          if (!evidencia || evidencia.id !== i.movimientoId || evidencia.numero !== i.numero || evidencia.creadoPor !== usuario) throw new ErrorPg("no existe el movimiento original de esta intención", "P0001");
          if (!i.reconocida) {
            i.reconocida = true;
            tx.deshacer.push(() => { i.reconocida = false; });
          }

          return { rows: [{ numero: i.numero }] };
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
function http(bd: ReturnType<typeof bdSimulada>, sesion: () => Sesion, opciones: { perderRespuestaReconocer?: () => boolean; estadoReconocer?: () => number | null; perderRespuestaEjecutar?: () => boolean; perderRespuestaReservar?: () => boolean; estadoEjecutar?: () => number | null; sinApi?: () => boolean } = {}) {
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
      if (url.endsWith("/reconocer")) {
        const forzado = opciones.estadoReconocer?.() ?? null;

        if (forzado) return respuesta(forzado, forzado === 401 || forzado === 403 ? { error: "Rechazado." } : "<html>");
        const clave = String((JSON.parse(String(init?.body)) as { clave?: string }).clave);
        const h = respuestaReconocimiento(await reconocerIntencion(bd.db, s.empresa, s.usuario, clave));

        if (opciones.perderRespuestaReconocer?.()) throw new TypeError("fetch failed");

        return respuesta(h.status, h.body);
      }
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
    reconocer: (c) => reconocerIntencionApi(c, h.f),
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

  // T03 (AUD-R08 / MOV-R08-01): COMMIT con la respuesta HTTP perdida → refresh / nuevo login → se RECUPERAN K1 y el número original; K2 queda bloqueada hasta el reconocimiento (ACK); el ACK no toca stock.
  {
    const bd = bdSimulada();
    let perder = true;
    const h1 = http(bd, () => sesion.actual, { perderRespuestaEjecutar: () => perder });
    const p1 = pantalla(h1);

    await p1.abrir();
    const r1 = await p1.control.registrar(base({ cantidad: 5 })); // pasos 1-4: reserva K1, entrada de 5 unidades, COMMIT en el servidor, respuesta HTTP perdida

    igual("T03-1..4: K1 reservada y ejecutada (entrada de 5), COMMIT en el servidor y respuesta perdida → el cliente queda INDETERMINADO mientras el servidor ya tiene CONFIRMADA y stock = 5", [r1.tipo, bd.st.stock, bd.st.efectosStock, bd.st.intenciones[0].estado, bd.st.intenciones[0].reconocida], ["INDETERMINADO", 5, 1, "CONFIRMADA", false]);

    // pasos 5-7: se cierra la primera instancia; nueva sesión del mismo usuario; se recuperan K1 y el número original
    perder = false;
    sesion.actual = null;
    const sinSesion = await pantalla(h1).abrir();

    sesion.actual = { empresa: EMP, usuario: USR };
    const h2 = http(bd, () => sesion.actual);
    const p2 = pantalla(h2, "s2-");
    const rec = await p2.abrir();

    igual("T03-5..7: tras cerrar la primera instancia y volver a entrar (sin sesión el registro falla cerrado), la nueva pantalla RECUPERA la operación CONFIRMADA con K1 y el número original — nunca LIBRE", [sinSesion.estado, rec.estado, rec.estado === "CONFIRMADA" ? rec.mensaje : null, p2.control.estado(), p2.control.clave(), p2.control.numero(), rec.estado === "CONFIRMADA" ? rec.formulario.cantidad : null], ["ERROR", "CONFIRMADA", "El movimiento MOV-000001 fue registrado correctamente. Falta confirmar la recepción del resultado: pulse «Confirmar recepción» para poder registrar otro movimiento.", "CONFIRMADA", "clave-K1-00000000", "MOV-000001", 5]);

    // paso 8: K2 antes del ACK — local (control bloqueado) y desde OTRA pestaña (la base lo impide)
    const k2Local = await p2.control.registrar(base({ cantidad: 3 }));
    const otraPestana = pantalla(h2, "tabB-");

    otraPestana.control.fijarRecuperacion(null);
    const k2Remota = await otraPestana.control.registrar(base({ cantidad: 3 }));

    igual("T03-8/9: intentar una K2 antes del reconocimiento se rechaza (control local y reserva desde otra pestaña = RECUPERADA con el mismo K1 y número); el stock permanece en 5 y no hay segundo movimiento", [k2Local.tipo, k2Remota.tipo, otraPestana.control.clave(), otraPestana.control.numero(), bd.st.stock, bd.st.efectosStock, bd.st.intenciones.length], ["OCUPADO", "RECUPERADA", "clave-K1-00000000", "MOV-000001", 5, 1, 1]);

    // pasos 10-11: ACK; no altera stock
    const stockAntes = bd.st.stock;
    const ack = await p2.control.reconocer();

    igual("T03-10/11: el reconocimiento (ACK) del movimiento original no altera el stock ni crea movimientos, y libera el control", [ack, bd.st.stock === stockAntes, bd.st.efectosStock, bd.st.intenciones[0].reconocida, p2.control.estado()], [{ ok: true }, true, 1, true, "LIBRE"]);

    // pasos 12-13: solo ahora nace una K2 legítima
    const k2 = await p2.control.registrar(base({ cantidad: 2 }));

    igual("T03-12/13: tras el ACK una operación nueva (K2) es legítima y es la ÚNICA segunda operación: stock 5 + 2 = 7, dos movimientos, dos intenciones", [k2.tipo, bd.st.stock, bd.st.efectosStock, bd.st.intenciones.map((i) => i.estado)], ["OK", 7, 2, ["CONFIRMADA", "CONFIRMADA"]]);
  }

  // AUD-R08: dos pestañas — A ejecuta K1 (COMMIT, respuesta perdida); B consulta y recibe K1 + número; K2 bloqueada hasta el ACK; ACK repetido / concurrente / perdido.
  {
    const bd = bdSimulada();
    const hA = http(bd, () => sesion.actual, { perderRespuestaEjecutar: () => true });
    const pA = pantalla(hA);

    await pA.abrir();
    await pA.control.registrar(base({ cantidad: 4 }));
    const hB = http(bd, () => sesion.actual);
    const pB = pantalla(hB, "tabB-");
    const recB = await pB.abrir();

    igual("AUD-R08 dos pestañas: la pestaña B recibe K1 y el número original (CONFIRMADA), no una pantalla libre; el stock sigue en 4", [recB.estado, pB.control.clave(), pB.control.numero(), pB.control.bloqueado(), bd.st.stock], ["CONFIRMADA", "clave-K1-00000000", "MOV-000001", true, 4]);

    const [a1, a2] = await Promise.all([pB.control.reconocer(), reconocerIntencionApi("clave-K1-00000000", hB.f)]);
    const a3 = await reconocerIntencionApi("clave-K1-00000000", hB.f);

    igual("AUD-R08 ACK concurrente y repetido: ambos tienen éxito (idempotente), una sola marca, sin stock nuevo", [a1, a2, a3, bd.st.intenciones.filter((i) => i.reconocida).length, bd.st.stock, bd.st.efectosStock], [{ ok: true }, { ok: true }, { ok: true }, 1, 4, 1]);

    const pC = pantalla(hB, "tabC-");
    const recC = await pC.abrir();

    igual("AUD-R08: ya reconocida, una nueva visita queda LIBRE y puede iniciar una operación nueva", [recC.estado, pC.control.bloqueado()], ["LIBRE", false]);
  }

  // ACK con respuesta perdida: el servidor ya lo aplicó; repetir es seguro y el control sigue CONFIRMADA hasta la confirmación inequívoca.
  {
    const bd = bdSimulada();
    let perderAck = true;
    const h = http(bd, () => sesion.actual, { perderRespuestaReconocer: () => perderAck });
    const p = pantalla(h);

    await p.abrir();
    await p.control.registrar(base({ cantidad: 6 }));
    const ack1 = await p.control.reconocer();
    const bloqueadoTrasAckPerdido = p.control.bloqueado();
    const k2Bloqueada = await p.control.registrar(base({ cantidad: 1 }));

    perderAck = false;
    const ack2 = await p.control.reconocer();

    igual("AUD-R08 ACK perdido: sin confirmación inequívoca el control sigue CONFIRMADA y bloquea K2; el reintento del ACK es idempotente y libera (stock intacto en 6)", [ack1.ok, bloqueadoTrasAckPerdido, k2Bloqueada.tipo, ack2, p.control.estado(), bd.st.stock, bd.st.efectosStock], [false, true, "OCUPADO", { ok: true }, "LIBRE", 6, 1]);
  }

  // ACK: sesión expirada, otro usuario, permisos revocados y fallas de red.
  {
    const bd = bdSimulada();
    const h = http(bd, () => sesion.actual);
    const p = pantalla(h);

    await p.abrir();
    await p.control.registrar(base({ cantidad: 2 }));
    const hPerdida = http(bd, () => sesion.actual, { perderRespuestaEjecutar: () => true });
    const bd2 = bdSimulada();
    const hx = http(bd2, () => sesion.actual, { perderRespuestaEjecutar: () => true });
    const px = pantalla(hx);

    await px.abrir();
    await px.control.registrar(base({ cantidad: 8 }));
    void hPerdida;

    sesion.actual = null;
    const ackSinSesion = await reconocerIntencionApi("clave-K1-00000000", hx.f);

    sesion.actual = { empresa: EMP, usuario: USR_B };
    const ackOtroUsuario = await reconocerIntencionApi("clave-K1-00000000", hx.f);
    const verOtro = await consultarIntencionApi(hx.f);

    sesion.actual = { empresa: EMP2, usuario: USR_C };
    const ackOtraEmpresa = await reconocerIntencionApi("clave-K1-00000000", hx.f);

    sesion.actual = { empresa: EMP, usuario: USR };
    bd2.cfg.permisos.delete(`${EMP}|${USR}`);
    const ackSinPermiso = await reconocerIntencionApi("clave-K1-00000000", hx.f);

    bd2.cfg.permisos.add(`${EMP}|${USR}`);
    const caido = http(bd2, () => sesion.actual, { sinApi: () => true });
    const ackRed = await reconocerIntencionApi("clave-K1-00000000", caido.f);
    const aunBloqueado = bd2.st.intenciones[0].reconocida === false && (await consultarIntencion(bd2.db, EMP, USR)) !== null;
    const pz = pantalla(http(bd2, () => sesion.actual), "z-");

    await pz.abrir();
    const ackFinal = await pz.control.reconocer();

    igual("AUD-R08 ACK denegado: sin sesión (401), otro usuario de la misma empresa y otra empresa (404 neutro), sin permiso (403) y con la red caída NO liberan nada; el stock no cambia y solo el titular, con acceso, lo logra", [ackSinSesion.ok, ackOtroUsuario.ok, ackOtraEmpresa.ok, ackSinPermiso.ok, ackRed.ok, aunBloqueado, bd2.st.intenciones[0].reconocida === true ? "reconocida" : null, verOtro.ok && verOtro.intencion, ackFinal, bd2.st.stock], [false, false, false, false, false, true, "reconocida", null, { ok: true }, 8]);
  }

  // El ACK solo corresponde a una intención CONFIRMADA: una RESERVADA no puede «reconocerse» (409) y sigue pendiente.
  {
    const bd = bdSimulada();
    const h = http(bd, () => sesion.actual, { estadoEjecutar: () => 503 });
    const p = pantalla(h);

    await p.abrir();
    await p.control.registrar(base());
    const intento = await reconocerIntencionApi("clave-K1-00000000", h.f);

    igual("AUD-R08: reconocer una intención RESERVADA (no confirmada) se rechaza y no libera: sigue pendiente", [intento.ok, bd.st.intenciones[0].estado, bd.st.intenciones[0].reconocida, p.control.bloqueado()], [false, "RESERVADA", false, true]);
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
    const antesAck = await p.control.registrar(base({ cantidad: 2 }));

    await p.control.reconocer();

    const nueva = await p.control.registrar(base({ cantidad: 2 }));

    igual("T13a: una confirmación libera el bloqueo SOLO tras el reconocimiento (antes: OCUPADO) y conserva la trazabilidad de la primera (CONFIRMADA con su número)", [ok.tipo, antesAck.tipo, nueva.tipo, bd.st.intenciones.map((i) => [i.estado, i.numero]), bd.st.efectosStock], ["OK", "OCUPADO", "OK", [["CONFIRMADA", "MOV-000001"], ["CONFIRMADA", "MOV-000002"]], 2]);

    const bd2 = bdSimulada();
    const p2 = pantalla(http(bd2, () => sesion.actual));

    await p2.abrir();
    bd2.cfg.fallaMotor = () => new ErrorPg("saldo insuficiente", "P0001");
    const rech = await p2.control.registrar(base());
    const libre = !p2.control.bloqueado();

    bd2.cfg.fallaMotor = null;
    const corregida = await p2.control.registrar(base({ cantidad: 1 }));
    await p2.control.reconocer();

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

  cierto("AUD-R08 pantalla (estructura): el control recibe `reconocer`; una CONFIRMADA recuperada muestra «Confirmar recepción» y bloquea el envío; tras el OK del servidor se reconoce (ACK) ANTES de navegar y, si el ACK falla, la pantalla sigue CONFIRMADA con el número original; ya no hay descarte", /reconocer: \(clave\) => reconocerIntencionApi\(clave\)/.test(pagina) && /setEstadoRegistro\(r\.estado\)/.test(pagina) && /Confirmar recepción/.test(pagina) && /estadoRegistro === "CONFIRMADA"/.test(pagina) && /const a = await control\.current\.reconocer\(\);/.test(pagina) && /MENSAJE_SIN_ACK\(numero\)/.test(pagina) && !/Descartar este intento/.test(pagina));
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
    bd.st.intenciones[0].reconocida = true;
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

  // ── PRO-190 (AUD-R08 / MOV-R08-02): el POST directo antiguo ya no registra en NINGÚN caso ───────────────────────────────────────────────────────
  // Se importa el manejador REAL de la ruta con sesión / permisos / base simulados que cuentan cualquier uso; en todos los escenarios responde 410 sin leer cuerpo, sin sesión, sin conexión y sin tocar stock.
  {
    const usos = { sesion: 0, permisos: 0, conexiones: 0, consultas: 0 };
    const bd = bdSimulada();
    const modo = { sesion: { empresa: EMP, usuario: USR } as Sesion, permisos: true, sinNex066: false };
    const { NextResponse: NR } = await import("next/server");
    const falsos: Record<string, unknown> = {
      "@/lib/auth/session": { getCurrentSession: async () => { usos.sesion += 1; return modo.sesion ? { user: { id: modo.sesion.usuario, empresaId: modo.sesion.empresa }, demo: false } : null; } },
      "@/lib/auth/permissions": { denyIfNoPermission: async () => { usos.permisos += 1; return modo.permisos ? null : NR.json({ error: "sin permiso" }, { status: 403 }); }, getAccessContext: async () => ({}), hasPermission: () => true },
      "@/lib/db": { db: { connect: async () => { usos.conexiones += 1; return bd.db.connect(); }, query: async () => { usos.consultas += 1; if (modo.sinNex066) throw new ErrorPg("la función no existe", "42883"); return { rows: [] }; } } },
    };
    const previos: Array<[string, NodeJS.Module | undefined]> = [];

    for (const [m, exports] of Object.entries(falsos)) {
      const r = require.resolve(m);

      previos.push([r, require.cache[r]]);
      require.cache[r] = { id: r, filename: r, loaded: true, exports, children: [], paths: [] } as unknown as NodeJS.Module;
    }
    const rutaJs = require.resolve("@/app/api/movimientos/route");

    delete require.cache[rutaJs];

    try {
      const { POST } = (await import("@/app/api/movimientos/route")) as typeof import("@/app/api/movimientos/route");
      const intentar = async (clave: string | null) => {
        const antes = bd.st.stock;
        const r = await (POST as unknown as (r: Request) => Promise<Response>)(new Request("http://x/api/movimientos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...base(), ...(clave ? { claveIdempotencia: clave } : {}) }) } as RequestInit));
        const cuerpo = (await r.json()) as Record<string, unknown>;

        return { status: r.status, flujo: cuerpo.flujo, cambioStock: bd.st.stock !== antes };
      };
      const todos = (rs: Array<{ status: number; flujo: unknown; cambioStock: boolean }>) => rs.every((x) => x.status === 410 && x.flujo === "/api/movimientos/intencion" && !x.cambioStock);

      const sinIntencion = await intentar(null);

      // K1 reservada por el flujo durable; POST legado con la misma K1 y con una K2 distinta
      const hReal = http(bd, () => ({ empresa: EMP, usuario: USR }));

      await reservarIntencionApi({ ...base(), claveIdempotencia: "clave-K1-00000000" }, hReal.f);
      const mismaK1 = await intentar("clave-K1-00000000");
      const otraK2 = await intentar("clave-K2-00000000");
      const concurrentes = await Promise.all([intentar("clave-K3-00000000"), intentar("clave-K3-00000000"), intentar(null)]);

      modo.sinNex066 = true;
      const sinMigracion = await intentar("clave-K4-00000000");

      modo.sinNex066 = false;
      modo.sesion = null;
      const sinSesion = await intentar("clave-K5-00000000");

      modo.sesion = { empresa: EMP, usuario: USR };
      modo.permisos = false;
      const sinPermiso = await intentar("clave-K6-00000000");

      modo.permisos = true;
      modo.sesion = { empresa: EMP, usuario: USR_B };
      const otroUsuario = await intentar("clave-K1-00000000");

      modo.sesion = { empresa: EMP2, usuario: USR_C };
      const otraEmpresa = await intentar("clave-K1-00000000");

      igual("PRO-190: el POST legado responde 410 y NO modifica stock en ningún caso: sin intención, con K1 reservada, con K2, dos llamadas concurrentes, sin NEX-066, sin sesión, sin permiso, otro usuario y otra empresa", [todos([sinIntencion, mismaK1, otraK2, ...concurrentes, sinMigracion, sinSesion, sinPermiso, otroUsuario, otraEmpresa]), bd.st.stock, bd.st.efectosStock, bd.st.intenciones.map((i) => i.estado)], [true, 0, 0, ["RESERVADA"]]);
      igual("PRO-190: la ruta no lee el cuerpo ni consulta sesión, permisos o base (política independiente del contexto): 0 usos en 11 llamadas, de modo que no hay nada que contornear", [usos.sesion, usos.permisos, usos.conexiones, usos.consultas], [0, 0, 0, 0]);

      const polit = respuestaPostLegado();

      igual("PRO-190: la política real indica el flujo durable (reservar → ejecutar → reconocer) y es un 410 explícito", [polit.status, polit.body.flujo, /reserva durable/.test(String(polit.body.error))], [410, "/api/movimientos/intencion", true]);

      // La ruta durable sigue operativa: el flujo reservar → ejecutar → reconocer registra exactamente una vez.
      const h = http(bd, () => ({ empresa: EMP, usuario: USR }));
      const pOk = pantalla(h, "ok-");
      const rec = await pOk.abrir();
      const ej = await ejecutarIntencionApi("clave-K1-00000000", h.f);

      igual("PRO-190: el flujo durable sigue operativo (la K1 reservada se ejecuta una vez por /intencion/ejecutar, con ACK posterior pendiente)", [rec.estado, ej.tipo, bd.st.stock, bd.st.efectosStock], ["INDETERMINADO", "OK", 5, 1]);
    } finally {
      for (const [r, previo] of previos) { if (previo) require.cache[r] = previo; else delete require.cache[r]; }
      delete require.cache[rutaJs];
    }
  }

  // T18: contrato SQL y scripts (estructural; no se ejecuta SQL).
  const mig = leer("documentacao/banco/nexit/v1/migraciones/NEX-066-movimientos-intenciones.sql");
  const rev = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-066.sql");
  const pre = leer("documentacao/banco/nexit/v1/scripts/preflight-NEX-066.sql");
  const ver = leer("documentacao/banco/nexit/v1/scripts/verificar-NEX-066.sql");
  const doc = leer("documentacao/banco/nexit/v1/docs/PROCEDIMIENTO-NEX-066.md");

  cierto("T18a SQL: tabla por empresa+usuario con unicidad (empresa, clave), índice único PARCIAL de UNA sola intención sin resolver o sin reconocer (RESERVADA o CONFIRMADA con reconocida_at NULL), reconocida_at solo en CONFIRMADA, FK a usuarios y CHECK de coherencia", /CREATE TABLE public\.movimientos_intenciones/.test(mig) && /CONSTRAINT movimientos_intenciones_clave_uk\s+UNIQUE \(empresa_id, clave\)/.test(mig) && /CREATE UNIQUE INDEX movimientos_intenciones_pendiente_uk ON public\.movimientos_intenciones \(empresa_id, usuario_id\) WHERE reconocida_at IS NULL AND estado IN \('RESERVADA', 'CONFIRMADA'\)/.test(mig) && /estado IN \('RESERVADA', 'CONFIRMADA', 'RECHAZADA_DEFINITIVA'\)/.test(mig) && /reconocida_at     timestamptz/.test(mig) && /CHECK \(reconocida_at IS NULL OR estado = 'CONFIRMADA'\)/.test(mig) && /FOREIGN KEY \(empresa_id, usuario_id\) REFERENCES public\.usuarios/.test(mig) && /\(estado = 'CONFIRMADA'\) = \(movimiento_id IS NOT NULL AND numero_movimiento IS NOT NULL\)/.test(mig));
  cierto("T18b SQL: seis funciones SECURITY DEFINER con search_path fijo y permiso MOVIMIENTOS.CREAR; reservar con bloqueo advisory por empresa+usuario y pendiente = RESERVADA o CONFIRMADA sin reconocer; pendiente devuelve el número de la CONFIRMADA; reconocer con el MISMO bloqueo advisory, FOR UPDATE, idempotente, exige la evidencia del movimiento y no toca movimientos_inventario; tomar con FOR UPDATE; rechazar solo sin movimiento; sin cron ni expiración", ["reservar", "pendiente", "tomar", "confirmar", "reconocer", "rechazar"].every((fn) => new RegExp(`FUNCTION public\\.movimiento_intencion_${fn}\\(`).test(mig)) && (mig.match(/SECURITY DEFINER SET search_path = public, pg_temp/g) ?? []).length === 6 && (mig.match(/pg_advisory_xact_lock\(hashtextextended\('movimientos\.int:'/g) ?? []).length === 2 && /NEX:INTENCION_PENDIENTE/.test(mig) && /reconocida_at IS NULL AND estado IN \('RESERVADA', 'CONFIRMADA'\)\) THEN\n\s+RAISE EXCEPTION 'hay un registro anterior sin resolver'/.test(mig) && /CASE WHEN i\.estado = 'CONFIRMADA' THEN i\.numero_movimiento/.test(mig) && /NEX:INTENCION_NO_CONFIRMADA/.test(mig) && !/UPDATE public\.movimientos_inventario|INSERT INTO public\.movimientos_inventario|inventario_registrar_movimiento\(/.test(mig.slice(mig.indexOf("movimiento_intencion_reconocer(p_empresa"), mig.indexOf("-- 5) Rechazo"))) && /clave = p_clave FOR UPDATE/.test(mig) && /NEX:INTENCION_NO_RECHAZABLE/.test(mig) && /m\.clave_idempotencia = p_clave AND m\.creado_por = p_usuario/.test(mig) && !/cron|pg_cron|DELETE FROM public\.movimientos_intenciones|estado = 'EXPIRADA'/i.test(mig) && /interval '7 days'/.test(mig));
  cierto("T18c SQL: el rol de la aplicación solo EJECUTA las seis funciones (sin acceso a la tabla), ayudante nex_aplicar_grants_* descubierto por el envoltorio, NEX-014 no se modifica y no se ejecuta nada en la VM", /REVOKE ALL ON public\.movimientos_intenciones FROM nexit_runtime/.test(mig) && /GRANT EXECUTE ON FUNCTION public\.movimiento_intencion_reservar\(uuid, uuid, text, jsonb\) TO nexit_runtime/.test(mig) && /GRANT EXECUTE ON FUNCTION public\.movimiento_intencion_reconocer\(uuid, uuid, text\) TO nexit_runtime/.test(mig) && /nex_aplicar_grants_movimientos_intenciones/.test(mig) && !/CREATE OR REPLACE FUNCTION (public\.)?inventario_registrar_movimiento/.test(mig) && /NO aplicada|NO se reaplica|no se reaplica/.test(mig));
  cierto("T18d scripts: preflight de solo lectura, verificación posterior, reversión que se NIEGA con intenciones inciertas y conserva respaldo, y procedimiento del responsable (backup, orden migración→código, reversión segura, sin descarte)", /BEGIN READ ONLY/.test(pre) && /ROLLBACK;/.test(pre) && /NEX-014 aplicada/.test(pre) && /BEGIN READ ONLY/.test(ver) && /nexit_runtime/.test(ver) && /REVERSIÓN ABORTADA: hay intenciones RESERVADAS \(inciertas\) o CONFIRMADAS sin reconocer/.test(rev) && /reconocida_at IS NULL AND estado IN \('RESERVADA', 'CONFIRMADA'\)/.test(rev) && /DROP FUNCTION IF EXISTS public\.movimiento_intencion_reconocer/.test(rev) && /movimientos_intenciones_respaldo_nex066/.test(rev) && /docker exec -i nexit-db psql/.test(pre) && /Reversión segura/.test(doc) && /Primero la migración, después el código/.test(doc) && /nunca se elimina ni libera sola/.test(doc) && /Reconocimiento \(ACK\)/.test(doc) && /CONFIRMADA. todavía no reconocida|CONFIRMADA\*\* todavía no reconocida|`CONFIRMADA` todavía no reconocida/.test(doc));

  // Estructura del servidor: ruta directa no puede eludir la protección; el POST de reserva precede a todo efecto.
  const srv = leer("lib/movimientos/intenciones.ts");

  cierto("servidor (estructura): la reserva hace COMMIT antes de cualquier motor; la ejecución usa el snapshot persistido y confirma en la MISMA transacción; el COMMIT de la ejecución dudoso nunca marca rechazo; el ACK no invoca el motor", /await c\.query\("COMMIT"\); \/\/ checkpoint durable/.test(srv) && !/registrarMovimiento/.test(srv.slice(srv.indexOf("export async function reservarIntencion"), srv.indexOf("export function esRechazoDeterminista"))) && /datosDeSnapshot\(t\.snapshot as Record<string, unknown>, clave\)/.test(srv) && /movimiento_intencion_confirmar/.test(srv) && /comprometiendo = true;\n\s+await c\.query\("COMMIT"\)/.test(srv) && /if \(comprometiendo\) throw e;/.test(srv) && !/registrarMovimiento/.test(srv.slice(srv.indexOf("export async function reconocerIntencion"), srv.indexOf("export function esRechazoDeterminista"))) && /movimiento_intencion_reconocer\(\$1::uuid, \$2::uuid, \$3\)/.test(srv));

  return fallos;
}
