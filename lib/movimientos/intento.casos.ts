/**
 * MOV-D01 — idempotencia del registro de movimientos: el control real (`crearControlRegistro`) y el clasificador real del POST (`registrarMovimientoResultado`) con promesas y un servidor SIMULADO que reproduce
 * el contrato de NEX-014 (misma clave + misma solicitud → repetido; misma clave + solicitud distinta → rechazo; COMMIT posible aunque la respuesta se pierda). Sin navegador ni PostgreSQL.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { registrarMovimientoResultado } from "@/lib/movimientos/cliente-api";
import { crearControlRegistro, MENSAJE_INDETERMINADO, MENSAJE_SALIDA, type ResultadoRegistro } from "@/lib/movimientos/intento";
import { formularioInicial } from "@/lib/movimientos/formulario";
import type { NuevoMovimientoStock } from "@/types/movimientos-stock";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");
const base = (extra: Partial<NuevoMovimientoStock> = {}): NuevoMovimientoStock => ({ ...formularioInicial("2026-10-19"), productoId: "prod-1", cantidad: 5, depositoDestinoId: "dep-A", motivo: "conteo", ...extra });
const tick = () => new Promise((r) => setTimeout(r, 0));

type Falla = "ninguna" | "perder-respuesta" | "5xx";

/** Servidor simulado (contrato NEX-014): COMMIT siempre ocurre salvo rechazo; la falla afecta solo a la respuesta HTTP. */
function servidor() {
  const guardados = new Map<string, { huella: string; numero: string }>();
  const posts: Array<{ clave: string; cantidad: number; huella: string }> = [];
  let siguiente = 1;
  let falla: Falla = "ninguna";
  let esperar: Promise<void> | null = null;
  const fetchSim = async (_u: string, init: RequestInit) => {
    const cuerpo = JSON.parse(String(init.body)) as NuevoMovimientoStock & { claveIdempotencia: string };
    const { claveIdempotencia: clave, ...solicitud } = cuerpo;
    const huella = JSON.stringify(solicitud);

    posts.push({ clave, cantidad: cuerpo.cantidad, huella });
    if (esperar) await esperar;

    if (!solicitud.productoId) return new Response(JSON.stringify({ error: "Seleccione el producto." }), { status: 400 });

    const previo = guardados.get(clave);
    let resp: Response;

    if (previo) {
      resp = previo.huella === huella ? new Response(JSON.stringify({ movimiento: { numero: previo.numero }, repetido: true }), { status: 200 }) : new Response(JSON.stringify({ error: "la clave de idempotencia ya fue usada con una solicitud distinta" }), { status: 409 });
    } else {
      const numero = `MOV-${String(siguiente++).padStart(6, "0")}`;

      guardados.set(clave, { huella, numero });
      resp = new Response(JSON.stringify({ movimiento: { numero }, repetido: false }), { status: 201 });
    }
    if (falla === "perder-respuesta") throw new TypeError("fetch failed"); // COMMIT hecho, la respuesta no llega
    if (falla === "5xx") return new Response("{}", { status: 504 });

    return resp;
  };

  return {
    guardados, posts, fetchSim,
    fallar: (f: Falla) => { falla = f; },
    retener: () => { let liberar: () => void = () => undefined; esperar = new Promise<void>((r) => { liberar = r; }); return () => { esperar = null; liberar(); }; },
  };
}

export async function verificarCasosMovimientosIntento(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  const nuevoControl = (srv: ReturnType<typeof servidor>) => {
    let n = 0;

    return crearControlRegistro({ generarClave: () => `clave-K${++n}-00000000`, enviar: (d) => registrarMovimientoResultado(d, srv.fetchSim) });
  };
  /** Simula los manejadores de la pantalla: `cambiar`/`cambiarTipo`/onChange salen sin efecto con el control bloqueado. */
  const pantalla = (control: ReturnType<typeof crearControlRegistro>) => {
    const form = base();
    const editar = (campo: keyof NuevoMovimientoStock, valor: unknown) => { if (control.bloqueado()) return false; (form as Record<string, unknown>)[campo] = valor; return true; };

    return { form, editar };
  };

  // 1) y 2) POST K1 pendiente: ningún campo cambia.
  const s1 = servidor();
  const c1 = nuevoControl(s1);
  const p1 = pantalla(c1);
  const soltar = s1.retener();
  const envio1 = c1.registrar(structuredClone(p1.form));

  await tick();
  const intentos = (["cantidad", "tipo", "productoId", "depositoOrigenId", "depositoDestinoId", "costoUnitario", "motivo", "documentoReferencia", "lote", "observacion", "fecha"] as const).map((c) => p1.editar(c, c === "cantidad" ? 99 : "x"));

  igual("1/2: con el POST K1 pendiente la intención bloquea cantidad, tipo, producto, depósitos, costo, motivo, documento, lote, observación y fecha: ningún cambio se aplica y la clave sigue siendo K1", [c1.estado(), intentos.every((x) => x === false), p1.form.cantidad, p1.form.motivo, c1.clave()], ["ENVIANDO", true, 5, "conteo", "clave-K1-00000000"]);

  // 3) Dos submits casi simultáneos: una sola intención.
  const segundo = await c1.registrar(base());
  const tercero = await c1.registrar(base({ cantidad: 7 }));

  igual("3: submits consecutivos mientras hay uno en curso reciben OCUPADO y no inician otra intención ni otro POST", [segundo, tercero, s1.posts.length], [{ tipo: "OCUPADO" }, { tipo: "OCUPADO" }, 1]);
  soltar();
  const ok1 = await envio1;

  igual("9: sin fallas, el sucesso confirmado devuelve el número del servidor y libera la intención (la navegación y la confirmación existentes dependen de este resultado)", [ok1, c1.estado(), c1.bloqueado(), s1.posts.map((p) => p.clave)], [{ tipo: "OK", numero: "MOV-000001", repetido: false }, "LIBRE", false, ["clave-K1-00000000"]]);

  // 4) y 5) COMMIT realizado con la respuesta perdida; reintento con K1 y el MISMO payload.
  const s2 = servidor();
  const c2 = nuevoControl(s2);
  const p2 = pantalla(c2);

  s2.fallar("perder-respuesta");
  const r2 = await c2.registrar(structuredClone(p2.form));

  igual("4: COMMIT hecho con la respuesta HTTP perdida → resultado INDETERMINADO (no «no realizado»): se conserva K1 y el payload, el formulario queda bloqueado y el mensaje avisa que PUEDE haberse registrado", [r2, c2.estado(), c2.bloqueado(), c2.clave(), s2.guardados.size, /PUEDE haberse registrado/.test(MENSAJE_INDETERMINADO)], [{ tipo: "INDETERMINADO", mensaje: MENSAJE_INDETERMINADO }, "INDETERMINADO", true, "clave-K1-00000000", 1, true]);

  const editarTrasFalla = p2.editar("cantidad", 8);

  s2.fallar("ninguna");
  const r2b = await c2.registrar(base({ cantidad: 123, productoId: "otro" })); // aunque la pantalla pase otros datos, el reintento envía el snapshot original

  igual("5/6: el reintento reenvía EXACTAMENTE K1 y el payload original (no el que haya en pantalla), el servidor responde «repetido» y eso confirma la operación original: un solo movimiento físico, sin K2", [editarTrasFalla, s2.posts.map((p) => [p.clave, p.cantidad]), s2.posts[0].huella === s2.posts[1].huella, r2b, s2.guardados.size, c2.estado()], [false, [["clave-K1-00000000", 5], ["clave-K1-00000000", 5]], true, { tipo: "OK", numero: "MOV-000001", repetido: true }, 1, "LIBRE"]);

  // 5b) Varias fallas seguidas (5xx, red) conservan K1; no se genera K2.
  const s3 = servidor();
  const c3 = nuevoControl(s3);

  s3.fallar("5xx");
  const f1 = await c3.registrar(base());
  s3.fallar("perder-respuesta");
  const f2 = await c3.registrar(base());
  s3.fallar("ninguna");
  const f3 = await c3.registrar(base());

  igual("5b: timeout/5xx/pérdida de respuesta repetidos conservan K1 en todos los intentos (nunca K2) y terminan en una sola operación registrada", [f1.tipo, f2.tipo, f3, [...new Set(s3.posts.map((p) => p.clave))], s3.guardados.size], ["INDETERMINADO", "INDETERMINADO", { tipo: "OK", numero: "MOV-000001", repetido: true }, ["clave-K1-00000000"], 1]);

  // 7) K1 con payload distinto no pasa en silencio.
  const s4 = servidor();

  await s4.fetchSim("/api/movimientos", { method: "POST", body: JSON.stringify({ ...base(), claveIdempotencia: "clave-K1-00000000" }) });
  const reuso = await registrarMovimientoResultado({ ...base({ cantidad: 6 }), claveIdempotencia: "clave-K1-00000000" } as NuevoMovimientoStock, s4.fetchSim);

  igual("7: reutilizar K1 con un payload distinto NO se acepta en silencio: el servidor lo rechaza (409) y el cliente lo informa como rechazo; el control nunca reutiliza una clave con otro payload porque el snapshot es inmutable", [reuso.tipo, reuso.tipo === "RECHAZADO" ? reuso.estado : null, s4.guardados.size], ["RECHAZADO", 409, 1]);

  // 8) Validación antes del envío: la pantalla no crea intención; luego envía normalmente. Un rechazo del servidor libera y la clave siguiente es nueva.
  const s5 = servidor();
  const c5 = nuevoControl(s5);
  const p5 = pantalla(c5);

  igual("8a: mientras no se envía (p. ej. falla la validación local) no hay intención: el formulario sigue editable", [c5.estado(), p5.editar("cantidad", 3), p5.form.cantidad], ["LIBRE", true, 3]);

  const rechazo = await c5.registrar(base({ productoId: "" }));
  const corregido = await c5.registrar(base());

  igual("8b: un rechazo del servidor (4xx: nada se grabó) libera el formulario y permite corregir; el nuevo envío usa una clave nueva (K2) legítimamente porque la anterior quedó conclusivamente sin efecto", [rechazo.tipo, c5.bloqueado(), corregido.tipo, s5.posts.map((p) => p.clave), s5.guardados.size], ["RECHAZADO", false, "OK", ["clave-K1-00000000", "clave-K2-00000000"], 1]);

  // D) Nueva intención solo por descarte explícito de la tentativa indeterminada.
  const s6 = servidor();
  const c6 = nuevoControl(s6);

  s6.fallar("perder-respuesta");
  await c6.registrar(base());
  igual("D: tras un resultado indeterminado no hay intención nueva implícita (descartarIndeterminado es la única salida y exige decisión explícita); sin indeterminado no hace nada", [c6.bloqueado(), c6.descartarIndeterminado(), c6.bloqueado(), c6.descartarIndeterminado()], [true, true, false, false]);

  // 10) Mensajes de salida: no afirman cancelación ni reversión.
  const textos = Object.values(MENSAJE_SALIDA).join(" ").toLowerCase();

  igual("10: salir/Cancelar/Volver con un registro en curso o indeterminado advierte que el movimiento PUEDE haberse registrado y remite a Movimientos; nunca dice que se canceló o revirtió", [/puede/.test(textos), /movimientos/.test(textos), /cancel|revert|deshech|anulad/.test(textos)], [true, true, false]);

  // Estructura de la pantalla (complemento).
  const pagina = leer("app/(private)/movimientos/nuevo/page.tsx");

  cierto("pantalla: ya no se limpia ninguna clave al editar; los manejadores cambiar/cambiarTipo/cantidad/costo se niegan con el control bloqueado; los campos van dentro de un fieldset deshabilitado; el submit usa el control (reserva síncrona) y la salida se advierte con el mensaje de intención abierta", !/clave\.current/.test(pagina) && (pagina.match(/if \(control\.current\.bloqueado\(\)\) return;/g) ?? []).length === 4 && /<fieldset disabled=\{bloqueado\}/.test(pagina) && /if \(control\.current\.estado\(\) === "ENVIANDO"\) return;/.test(pagina) && /control\.current\.registrar\(datos\)/.test(pagina) && /useProtegerCambios\(sucio \|\| bloqueado, bloqueado \? MENSAJE_SALIDA/.test(pagina) && /Reintentar el mismo registro/.test(pagina) && /Descartar este intento/.test(pagina));

  return fallos;
}
