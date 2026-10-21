/**
 * PRO-194 — KuDE (PDF) de la FE desde Documentos electrónicos. Sin red, sin PostgreSQL y sin navegador. SOLO la respuesta externa del gateway es un MOCK, con el contrato REAL confirmado por el responsable:
 * HTTP 200 + JSON {status:"success", CDC, kude:<PDF en Base64>}. La orquestación del servidor (obtenerKude → obtenerKudeGateway) y el controlador del visor (crearControladorVisor, el mismo que usa la modal)
 * son los reales; la base es simulada (alcance por empresa/sucursal como ALCANCE de leerDocumento). React no se renderizó: la modal solo refleja el controlador (verificación estructural).
 * E08: FE y NCE, sin tipOpe y sin exigir estado fiscal ni CDC previo.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { decodificarBase64Estricto, esPdfValido, leerCuerpoLimitado, limpiarCacheTokens, MAX_KUDE_BYTES, type FetchLike, type KudeFetch } from "@/lib/facturacion/gateway";
import { crearControladorVisor, pedirKudeAlServidor } from "@/lib/facturacion/kude-visor";
import { nombreArchivoKude, obtenerKude } from "@/lib/facturacion/shared";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");
const E1 = "11111111-1111-4111-8111-111111111111";
const E2 = "22222222-2222-4222-8222-222222222222";
const U1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const U2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SUC_A = "s1";
const SUC_B = "s2";
const D = (n: number) => "d0000000-0000-4000-8000-00000000000" + String(n);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "latin1");
const PDF_B = Buffer.from("%PDF-1.4\n2 0 obj<<>>endobj\ntrailer<<DOC-B>>\n%%EOF\n", "latin1");
// CDC coherente con la identidad del documento (tipo 01 FE / 05 NCE, establecimiento, punto y número en sus posiciones). E08: el CDC devuelto por el gateway debe serlo.
const CODIGO_TIPO: Record<string, string> = { FE: "01", NCE: "05" };
const cdcDe = (tipo: string, est: string, punto: string, numero: string) => CODIGO_TIPO[tipo] + "800000017" + est + punto + numero + "1" + "20261016" + "1" + "123456789" + "0";
const CDC = cdcDe("FE", "001", "001", "0010004");
const AUTO = "AUTO";
const CDC_B = "1".repeat(44);

type Doc = { id: string; empresa: string; sucursal: string; tipo: string; establecimiento: string; puntoExpedicion: string; numero: string; serie: string | null; cdc: string | null; estadoSifen: string };
type Resp = { status: number; tipo?: string; bytes?: Buffer; json?: unknown; largo?: string; lanza?: "TIMEOUT" | "RED"; flujo?: "infinito"; trozo?: number };
type RegistroFlujo = { cancelado: boolean; leidos: number };

function flujoDe(r: Resp, registro: RegistroFlujo): ReadableStream<Uint8Array> {
  const trozo = r.trozo ?? 65536;

  if (r.flujo === "infinito") {
    return new ReadableStream<Uint8Array>({ pull(c) { registro.leidos += trozo; c.enqueue(new Uint8Array(trozo).fill(97)); }, cancel() { registro.cancelado = true; } });
  }

  const b = r.bytes ?? Buffer.from(JSON.stringify(r.json ?? {}));
  let pos = 0;

  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (pos >= b.length) { c.close(); return; }
      const fin = Math.min(pos + trozo, b.length);

      registro.leidos += fin - pos;
      c.enqueue(new Uint8Array(b.subarray(pos, fin)));
      pos = fin;
    },
    cancel() { registro.cancelado = true; },
  });
}
type Comportamiento = Array<(n: number) => Resp> | ((n: number) => Resp);

const ok = (extra: Record<string, unknown> = {}, pdf: Buffer = PDF, cdc: string = AUTO): Resp => ({ status: 200, json: { status: "success", CDC: cdc, kude: pdf.toString("base64"), ...extra } });

export async function verificarCasosKude(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(nombre + ": esperado " + JSON.stringify(esperado) + ", obtenido " + JSON.stringify(obtenido));
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  const fe = (id: string, empresa: string, extra: Partial<Doc> = {}): Doc => ({ id, empresa, sucursal: SUC_A, tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0010004", serie: null, cdc: CDC, estadoSifen: "APROBADO", ...extra });
  const nce = (id: string, empresa: string, extra: Partial<Doc> = {}): Doc => fe(id, empresa, { tipo: "NCE", numero: "0000007", cdc: cdcDe("NCE", "001", "001", "0000007"), ...extra });

  function mundo(docs: Doc[], opciones: { payloads?: Record<string, unknown>; sinConfig?: Set<string>; sinCredenciales?: Set<string> } = {}) {
    const consultas: string[] = [];
    const alcance: Record<string, Set<string>> = { [E1 + "|" + U1]: new Set([SUC_A]), [E1 + "|" + U2]: new Set([SUC_A, SUC_B]), [E2 + "|" + U1]: new Set([SUC_A]) };
    const db = {
      async query(sql: string, p: unknown[] = []) {
        consultas.push(sql);
        if (/FROM documentos_electronicos/.test(sql)) {
          const d = docs.find((x) => x.empresa === p[0] && x.id === p[2] && alcance[String(p[0]) + "|" + String(p[1])]?.has(x.sucursal));

          return { rows: d ? [d] : [] };
        }
        if (/FROM documento_electronico_solicitudes/.test(sql)) {
          const id = String(p[1]);
          const payload = opciones.payloads && id in opciones.payloads ? opciones.payloads[id] : { iTiOpe: 4 };

          return { rows: payload === undefined ? [] : [{ payload }] };
        }
        if (/FROM fe_gateway_config/.test(sql)) return { rows: opciones.sinConfig?.has(String(p[0])) ? [] : [{ baseUrl: "https://gw.example.test", credencialRef: "NEXIT_DB", timeoutMs: 5000 }] };
        if (/fe_gateway_credenciales_leer/.test(sql)) return { rows: opciones.sinCredenciales?.has(String(p[0])) ? [] : [{ ruc: p[0] === E1 ? "RUC-E1" : "RUC-E2", password: p[0] === E1 ? "pass-secreta-1" : "pass-secreta-2" }] };
        throw new Error("consulta inesperada: " + sql.slice(0, 60));
      },
    };

    return { db: db as never, consultas };
  }

  type Llamada = { url: string; auth: string | null; body: Record<string, unknown> };
  function gateway(comportamiento: Comportamiento) {
    const logins: string[] = [];
    const kudes: Llamada[] = [];
    const flujos: RegistroFlujo[] = [];
    let n = 0;
    const fetch: FetchLike = async (url, init) => {
      if (url.endsWith("/api/login")) {
        const b = JSON.parse(init.body) as { ruc: string };

        logins.push(b.ruc);

        return { status: 200, text: async () => JSON.stringify({ status: "success", token: "TOKEN-" + b.ruc + "-" + String(logins.length) }) };
      }
      throw new Error("ruta inesperada " + url);
    };
    const fetchKude: KudeFetch = async (url, init) => {
      kudes.push({ url, auth: init.headers.Authorization ?? null, body: JSON.parse(init.body) as Record<string, unknown> });
      const f = typeof comportamiento === "function" ? comportamiento : comportamiento[Math.min(n, comportamiento.length - 1)];
      const r = f(n);
      const pedido = JSON.parse(init.body) as { dEst: string; dPunExp: string; dNumDoc: string; tipoDoc: string };

      if (r.json && (r.json as { CDC?: unknown }).CDC === AUTO) r.json = { ...(r.json as object), CDC: cdcDe(pedido.tipoDoc, pedido.dEst, pedido.dPunExp, pedido.dNumDoc) };
      n += 1;
      if (r.lanza === "TIMEOUT") { const e = new Error("abortado"); e.name = "AbortError"; throw e; }
      if (r.lanza === "RED") throw new Error("ECONNRESET");

      const cab: Record<string, string> = { "content-type": r.tipo ?? "application/json" };

      if (r.largo) cab["content-length"] = r.largo;

      const registro: RegistroFlujo = { cancelado: false, leidos: 0 };

      flujos.push(registro);

      return { status: r.status, headers: { get: (k: string) => cab[k.toLowerCase()] ?? null }, body: flujoDe(r, registro) };
    };

    return { dep: { fetch, fetchKude }, logins, kudes, flujos };
  }
  const pdfOk = (): Resp => ok();
  const falla = async (m: ReturnType<typeof mundo>, g: ReturnType<typeof gateway>, empresa: string, usuario: string, id: string) => {
    try {
      await obtenerKude(m.db, empresa, usuario, id, g.dep);

      return { estado: 0, mensaje: "SIN ERROR" };
    } catch (e) {
      return { estado: (e as { estado?: number }).estado ?? -1, mensaje: String((e as Error).message) };
    }
  };
  const SECRETOS = /pass-secreta|TOKEN-|Bearer|RUC-E/;

  // ── 1. Contrato real: JSON {status, CDC, kude(Base64)} → PDF íntegro ─────────────────────────────────────────────────────────────────────────
  {
    limpiarCacheTokens();
    const m = mundo([fe(D(1), E1)]);
    const g = gateway(pdfOk);
    const r = await obtenerKude(m.db, E1, U1, D(1), g.dep);

    igual("KUDE-01: una solicitud POST a {base}/api/kude con el Bearer de la empresa y el cuerpo EXACTO de cinco campos (ceros a la izquierda, serie null, tipoDoc FE) y SIN tipOpe", [g.kudes.length, g.kudes[0].url, /^Bearer TOKEN-RUC-E1-/.test(g.kudes[0].auth ?? ""), JSON.stringify(g.kudes[0].body)], [1, "https://gw.example.test/api/kude", true, JSON.stringify({ dEst: "001", dPunExp: "001", dNumDoc: "0010004", dSerieNum: null, tipoDoc: "FE" })]);
    igual("E08-01: la consulta del KuDE no lee la solicitud/payload persistido (no hay tipOpe)", m.consultas.some((q) => /documento_electronico_solicitudes/.test(q)), false);
    igual("KUDE-02: la respuesta JSON con status success, CDC correcto y Base64 se decodifica y el PDF llega INTACTO; el nombre sale solo de la identidad fiscal", [Buffer.compare(r.pdf, PDF), r.nombre], [0, "KuDE-FE-001-001-0010004.pdf"]);
    igual("KUDE-03: solo lectura — ninguna escritura en la base (ni estados SIFEN, ni intentos, ni numeración)", m.consultas.some((s) => /\b(INSERT|UPDATE|DELETE)\b|fe_documento_registrar/i.test(s)), false);

    const m2 = mundo([fe(D(2), E1, { serie: "AB", numero: "0000123", cdc: cdcDe("FE", "001", "001", "0000123") })]);
    const g2 = gateway(pdfOk);
    const r2 = await obtenerKude(m2.db, E1, U1, D(2), g2.dep);

    igual("KUDE-04: otro documento con serie AB envía la serie y su número (sin tipOpe); el nombre incluye la serie", [g2.kudes[0].body.tipOpe, g2.kudes[0].body.dSerieNum, g2.kudes[0].body.dNumDoc, r2.nombre], [undefined, "AB", "0000123", "KuDE-FE-001-001-0000123-AB.pdf"]);

    const gMin = gateway(() => ({ status: 200, json: { status: "success", cdc: CDC, kude: PDF.toString("base64") } }));

    igual("KUDE-04b: el campo CDC también se acepta en minúsculas y exige igualdad exacta con el CDC persistido", (await obtenerKude(mundo([fe(D(1), E1)]).db, E1, U1, D(1), gMin.dep)).pdf.length, PDF.length);
  }

  // ── 2. E08: el KuDE se solicita para FE y NCE sin exigir estado fiscal ni CDC previo ─────────────────────────────────────────────────────
  {
    const estados = ["APROBADO", "PENDIENTE", "RECHAZADO", "CANCELADO", "ENVIADO"];

    for (const tipo of ["FE", "NCE"]) {
      for (const estado of estados) {
        limpiarCacheTokens();

        const mk = tipo === "FE" ? fe : nce;
        const m = mundo([mk(D(1), E1, { estadoSifen: estado })]);
        const g = gateway(pdfOk);
        const r = await obtenerKude(m.db, E1, U1, D(1), g.dep);

        igual("E08-02 [" + tipo + " " + estado + "]: se consulta al gateway y se entrega el PDF (el estado fiscal no condiciona)", [r.pdf.length, g.kudes.length, g.kudes[0].body.tipoDoc, r.nombre.startsWith("KuDE-" + tipo + "-")], [PDF.length, 1, tipo, true]);
      }
    }

    // Sin CDC persistido: se acepta el CDC coherente que devuelve el gateway; uno incoherente (otro tipo, número u otra empresa) se descarta
    limpiarCacheTokens();

    const sinCdc = await obtenerKude(mundo([fe(D(1), E1, { cdc: null, estadoSifen: "PENDIENTE" })]).db, E1, U1, D(1), gateway(pdfOk).dep);

    igual("E08-03 FE sin CDC persistido y sin aprobar: el PDF válido con CDC coherente se muestra", sinCdc.pdf.length, PDF.length);

    const incoherentes: Array<[string, string]> = [["CDC de una NCE para una FE", cdcDe("NCE", "001", "001", "0010004")], ["CDC de otro número", cdcDe("FE", "001", "001", "0010005")], ["CDC de otro punto", cdcDe("FE", "001", "002", "0010004")], ["CDC de otro establecimiento", cdcDe("FE", "002", "001", "0010004")], ["CDC con formato inválido", "123"]];

    for (const [nombre, cdc] of incoherentes) {
      limpiarCacheTokens();

      const x = await falla(mundo([fe(D(1), E1, { cdc: null })]), gateway(() => ok({}, PDF, cdc)), E1, U1, D(1));

      igual("E08-03 [" + nombre + ", sin CDC persistido]: se descarta (502) y no se entrega el PDF", [x.estado, x.mensaje.includes("no corresponde a este documento")], [502, true]);
    }

    // NCE: tipoDoc NCE con los identificadores de la propia NCE, mismo contrato de cinco campos
    limpiarCacheTokens();

    const gN = gateway(pdfOk);
    const rN = await obtenerKude(mundo([nce(D(1), E1, { serie: "AB", numero: "0000007", cdc: null })]).db, E1, U1, D(1), gN.dep);

    igual("E08-04 NCE: solo cambia tipoDoc a «NCE» y los identificadores son los de la NCE; nombre propio; sin tipOpe", [JSON.stringify(gN.kudes[0].body), rN.nombre], [JSON.stringify({ dEst: "001", dPunExp: "001", dNumDoc: "0000007", dSerieNum: "AB", tipoDoc: "NCE" }), "KuDE-NCE-001-001-0000007-AB.pdf"]);

    // Con CDC persistido, una divergencia con el devuelto se rechaza aunque sea coherente con la identidad
    limpiarCacheTokens();

    const div = await falla(mundo([fe(D(1), E1, { cdc: cdcDe("FE", "001", "001", "0010004").slice(0, 43) + "1" })]), gateway(pdfOk), E1, U1, D(1));

    igual("E08-05 CDC persistido distinto del devuelto: divergencia rechazada (502), sin entregar el PDF", [div.estado, div.mensaje.includes("no corresponde a este documento")], [502, true]);

    // Otros tipos (NDE/AFE...) siguen sin KuDE
    limpiarCacheTokens();

    const gT = gateway(pdfOk);
    const xt = await falla(mundo([fe(D(1), E1, { tipo: "NDE" })]), gT, E1, U1, D(1));

    igual("E08-06 un tipo distinto de FE/NCE responde 409 sin llamar al gateway", [xt.estado, gT.kudes.length, gT.logins.length], [409, 0, 0]);
  }

  // ── 3. Aislamiento, alcance y elegibilidad: nunca se llama al gateway ───────────────────────────────────────────────────────────────────────
  {
    const docs = [fe(D(1), E1), fe(D(2), E2), fe(D(3), E1, { sucursal: SUC_B }), fe(D(4), E1, { tipo: "NDE" }), nce(D(5), E2)];
    const casos: Array<[string, string, string, string, number]> = [
      ["documento de OTRA empresa", E1, U1, D(2), 404], ["sucursal fuera del alcance del usuario", E1, U1, D(3), 404], ["ID inexistente", E1, U1, D(9), 404], ["ID no válido", E1, U1, "../../etc/passwd", 404],
      ["tipo no soportado (NDE)", E1, U1, D(4), 409], ["NCE de OTRA empresa", E1, U1, D(5), 404],
    ];

    for (const [nombre, e, u, id, estado] of casos) {
      limpiarCacheTokens();
      const g = gateway(pdfOk);
      const x = await falla(mundo(docs), g, e, u, id);

      igual("KUDE-07 [" + nombre + "]: " + String(estado) + " sin llamada externa ni datos ajenos", [x.estado, g.kudes.length, g.logins.length, SECRETOS.test(x.mensaje) || /d0000000|22222222/.test(x.mensaje)], [estado, 0, 0, false]);
    }

    limpiarCacheTokens();
    const gAmplio = gateway(pdfOk);
    const otro = await obtenerKude(mundo(docs).db, E1, U2, D(3), gAmplio.dep);

    igual("KUDE-08: el usuario CON alcance a la otra sucursal sí obtiene su KuDE (decide el alcance, no el rol)", [otro.nombre, gAmplio.kudes.length], ["KuDE-FE-001-001-0010004.pdf", 1]);
  }

  // ── 4. Credenciales y configuración por empresa; dos empresas no comparten token ─────────────────────────────────────────────────────────────
  {
    limpiarCacheTokens();
    const m = mundo([fe(D(1), E1), fe(D(2), E2)]);
    const g = gateway(pdfOk);

    await obtenerKude(m.db, E1, U1, D(1), g.dep);
    await obtenerKude(m.db, E2, U1, D(2), g.dep);
    igual("KUDE-09: cada empresa se autentica con SUS credenciales y usa SU token (sin reutilizar el de la otra)", [g.logins, g.kudes[0].auth?.includes("RUC-E1"), g.kudes[1].auth?.includes("RUC-E2")], [["RUC-E1", "RUC-E2"], true, true]);

    const variantes: Array<[string, { sinCredenciales?: Set<string>; sinConfig?: Set<string> }]> = [["sin credenciales", { sinCredenciales: new Set([E1]) }], ["sin configuración del gateway", { sinConfig: new Set([E1]) }]];

    for (const [nombre, op] of variantes) {
      limpiarCacheTokens();
      const g3 = gateway(pdfOk);
      const x = await falla(mundo([fe(D(1), E1)], op), g3, E1, U1, D(1));

      igual("KUDE-10 [" + nombre + "]: 409 en español y sin llamada externa", [x.estado, g3.kudes.length, g3.logins.length, /gateway/.test(x.mensaje)], [409, 0, 0, true]);
    }
  }

  // ── 5. Respuestas inválidas del gateway: error controlado, jamás un archivo ni un documento ajeno ───────────────────────────────────────────
  {
    const json = (s: number) => (): Resp => ({ status: s, tipo: "application/json", bytes: Buffer.from("{}") });
    const noPdf = Buffer.from("esto no es un pdf").toString("base64");
    const escenarios: Array<[string, Comportamiento, number, string]> = [
      ["CDC distinto (documento ajeno)", () => ok({}, PDF_B, CDC_B), 502, "no corresponde a este documento"],
      ["sin CDC en la respuesta", () => ({ status: 200, json: { status: "success", kude: PDF.toString("base64") } }), 502, "no corresponde a este documento"],
      ["status distinto de success", () => ({ status: 200, json: { status: "error", CDC, kude: PDF.toString("base64") } }), 502, "no entregó un resultado válido"],
      ["cuerpo que no es JSON", () => ({ status: 200, bytes: PDF, tipo: "application/pdf" }), 502, "no entregó un resultado válido"],
      ["Base64 inválido", () => ok({ kude: "***no-es-base64***" }), 502, "no devolvió un PDF válido"],
      ["Base64 vacío", () => ok({ kude: "" }), 502, "no devolvió un PDF válido"],
      ["kude ausente", () => ({ status: 200, json: { status: "success", CDC } }), 502, "no devolvió un PDF válido"],
      ["kude no es texto", () => ok({ kude: 123 }), 502, "no devolvió un PDF válido"],
      ["Base64 válido pero no es PDF", () => ok({ kude: noPdf }), 502, "no devolvió un PDF válido"],
      ["PDF truncado (sin %%EOF)", () => ok({ kude: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\n").toString("base64") }), 502, "no devolvió un PDF válido"],
      ["con prefijo data:", () => ok({ kude: "data:application/pdf;base64," + PDF.toString("base64") }), 502, "no devolvió un PDF válido"],
      ["JSON declarado demasiado grande", () => ({ status: 200, largo: String(MAX_KUDE_BYTES * 2), json: {} }), 502, "excede"],
      ["PDF decodificado mayor al límite", () => ok({ kude: Buffer.concat([PDF.subarray(0, PDF.length - 6), Buffer.alloc(MAX_KUDE_BYTES), Buffer.from("\n%%EOF\n")]).toString("base64") }), 502, "excede"],
      ["401 persistente", json(401), 502, "renovarla"],
      ["timeout", () => ({ status: 0, lanza: "TIMEOUT" }), 502, "Tiempo de espera"],
      ["red caída", () => ({ status: 0, lanza: "RED" }), 503, "comunicarse"],
      ["404", json(404), 502, "no está disponible en el gateway"],
      ["500", () => ({ status: 500, tipo: "text/html", bytes: Buffer.from("<html>error</html>") }), 503, "no está disponible"],
    ];

    for (const [nombre, comp, estado, trozo] of escenarios) {
      limpiarCacheTokens();
      const g = gateway(comp);
      const x = await falla(mundo([fe(D(1), E1)]), g, E1, U1, D(1));

      igual("KUDE-11 [" + nombre + "]: error " + String(estado) + " controlado, en español, sin secretos, sin CDC ni contenido y sin PDF", [x.estado, x.mensaje.includes(trozo), SECRETOS.test(x.mensaje) || x.mensaje.includes(CDC) || x.mensaje.includes("JVBER")], [estado, true, false]);
    }

    limpiarCacheTokens();
    const g = gateway([json(401), pdfOk]);
    const r = await obtenerKude(mundo([fe(D(1), E1)]).db, E1, U1, D(1), g.dep);

    igual("KUDE-12: un 401 renueva el token UNA vez y la segunda solicitud entrega el PDF", [g.logins.length, g.kudes.length, Buffer.compare(r.pdf, PDF)], [2, 2, 0]);

    limpiarCacheTokens();
    const g2 = gateway(json(401));

    await falla(mundo([fe(D(1), E1)]), g2, E1, U1, D(1));
    igual("KUDE-13: con 401 persistente se renueva una sola vez (no hay bucle)", [g2.logins.length, g2.kudes.length], [2, 2]);
  }

  // ── 6. Utilidades ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  igual("KUDE-14: esPdfValido exige cabecera y %%EOF; el Base64 se decodifica de forma estricta", [esPdfValido(PDF), esPdfValido(Buffer.from("%PDF-1.4 sin cierre")), esPdfValido(Buffer.from("<html>")), decodificarBase64Estricto(PDF.toString("base64"))?.equals(PDF), decodificarBase64Estricto("abc"), decodificarBase64Estricto("")], [true, false, false, true, null, null]);
  igual("KUDE-15: el nombre del archivo se sanea (sin separadores ni comillas)", nombreArchivoKude({ establecimiento: "0/1", puntoExpedicion: "\"001", numero: "../7", serie: null }), "KuDE-FE-01-001-7.pdf");

  // ── 7. Visor: controlador REAL contra la orquestación real del servidor (mock solo del gateway) ────────────────────────────────────────────
  type Pendiente = { id: string; resolver: (b: Blob) => void; rechazar: (e: Error) => void; signal: AbortSignal };

  function visorSimulado(modo: "directo" | "manual", g?: ReturnType<typeof gateway>, m?: ReturnType<typeof mundo>, usuario = U1, empresa = E1) {
    const pendientes: Pendiente[] = [];
    const llamadas: string[] = [];
    const urls = new Map<string, Blob>();
    const revocadas: string[] = [];
    const acciones: string[] = [];
    const diferidas: Array<() => void> = [];
    let contadorUrl = 0;
    const visor = crearControladorVisor({
      obtener: (id, signal) => {
        llamadas.push(id);
        if (modo === "directo") return obtenerKude(m!.db, empresa, usuario, id, g!.dep).then((r) => new Blob([new Uint8Array(r.pdf)], { type: "application/pdf" }));

        return new Promise<Blob>((resolver, rechazar) => { pendientes.push({ id, resolver, rechazar, signal }); });
      },
      crearUrl: (b) => { contadorUrl += 1; const u = "blob:nexit/" + String(contadorUrl); urls.set(u, b); return u; },
      revocarUrl: (u) => { revocadas.push(u); urls.delete(u); },
      descargar: (u, n) => { acciones.push("descargar:" + u + ":" + n); },
      imprimir: () => { acciones.push("imprimir"); },
      diferir: (fn) => { diferidas.push(fn); },
    });

    return { visor, pendientes, llamadas, urls, revocadas, acciones, diferidas };
  }
  const docVisor = (id: string, num = "0010004") => ({ id, titulo: "KuDE · Factura 001-001-" + num, nombre: "KuDE-FE-001-001-" + num + ".pdf" });
  const descargaDe = (e: ReturnType<ReturnType<typeof crearControladorVisor>["estado"]>) => (e.fase === "LISTO" ? e.descarga : null);
  const bytesDe = async (b: Blob | undefined) => (b ? Buffer.from(await b.arrayBuffer()) : Buffer.alloc(0));

  {
    limpiarCacheTokens();
    const g = gateway(pdfOk);
    const v = visorSimulado("directo", g, mundo([fe(D(1), E1)]));
    const fases: string[] = [];

    v.visor.suscribir(() => fases.push(v.visor.estado().fase));
    await v.visor.abrir(docVisor(D(1)));
    const e = v.visor.estado();

    igual("KUDE-20 visor: abrir recorre CARGANDO → LISTO con el título de la factura y el PDF íntegro llega al visor como Blob", [fases, e.fase === "LISTO" ? e.titulo : null, e.fase === "LISTO" ? (await bytesDe(v.urls.get(e.url))).equals(PDF) : null], [["CARGANDO", "LISTO"], "KuDE · Factura 001-001-0010004", true]);

    // PRO-197: «Descargar PDF» hace una consulta NUEVA al backend/gateway (distinta de la usada para mostrar). Una apertura + dos descargas = TRES llamadas a /api/kude.
    await v.visor.descargar();
    await v.visor.descargar();
    v.visor.imprimir();
    igual("KUDE-21 visor: una apertura y dos descargas = TRES solicitudes a /api/kude; cada descarga usa su propia URL temporal y su PDF íntegro; Imprimir usa el PDF mostrado (sin nueva solicitud)", [g.kudes.length, v.llamadas.length, v.acciones, descargaDe(v.visor.estado())], [3, 3, ["descargar:blob:nexit/2:KuDE-FE-001-001-0010004.pdf", "descargar:blob:nexit/3:KuDE-FE-001-001-0010004.pdf", "imprimir"], "INACTIVA"]);
    igual("KUDE-21b visor: los PDF descargados son los bytes del gateway y las URL temporales de descarga se liberan después (sin persistir nada)", [(await bytesDe(v.urls.get("blob:nexit/2"))).equals(PDF), v.diferidas.length], [true, 2]);
    v.diferidas.forEach((fn) => fn());
    igual("KUDE-21c visor: ejecutadas las liberaciones diferidas solo queda la URL del PDF mostrado", [v.revocadas, [...v.urls.keys()]], [["blob:nexit/2", "blob:nexit/3"], ["blob:nexit/1"]]);

    v.visor.cerrar();
    igual("KUDE-22 visor: cerrar revoca la URL, libera el Blob y deja el estado CERRADO sin datos", [v.visor.estado().fase, v.revocadas.includes("blob:nexit/1"), v.urls.size], ["CERRADO", true, 0]);
    await v.visor.descargar();
    v.visor.imprimir();
    igual("KUDE-22b visor: con el visor cerrado, descargar e imprimir no hacen nada (ni solicitudes)", [v.acciones.length, g.kudes.length], [3, 3]);

    // Abrir y cerrar DOS veces el mismo documento = DOS llamadas externas distintas (sin caché ni reutilización).
    const antes = g.kudes.length;

    await v.visor.abrir(docVisor(D(1)));
    v.visor.cerrar();
    await v.visor.abrir(docVisor(D(1)));
    igual("KUDE-23 visor: cada apertura del mismo documento hace una consulta NUEVA al gateway (2 aperturas más = 2 solicitudes a /api/kude; ninguna URL anterior se reutiliza)", [g.kudes.length - antes, g.kudes.every((k) => k.url === "https://gw.example.test/api/kude"), v.urls.size], [2, true, 1]);
    v.visor.cerrar();
  }

  {
    // Cerrar durante la consulta: nada se presenta después.
    const v = visorSimulado("manual");
    const p = v.visor.abrir(docVisor(D(1)));

    v.visor.cerrar();
    v.pendientes[0].resolver(new Blob([new Uint8Array(PDF)]));
    await p;
    igual("KUDE-24 visor: cerrar durante la consulta aborta la solicitud y una respuesta tardía no presenta ni crea ninguna URL", [v.pendientes[0].signal.aborted, v.visor.estado().fase, v.urls.size, v.revocadas.length], [true, "CERRADO", 0, 0]);

    // Error tardío tras cerrar tampoco reabre nada.
    const v2 = visorSimulado("manual");
    const p2 = v2.visor.abrir(docVisor(D(1)));

    v2.visor.cerrar();
    v2.pendientes[0].rechazar(new Error("tarde"));
    await p2;
    igual("KUDE-24b visor: un error tardío tras cerrar tampoco abre ni cambia nada", v2.visor.estado().fase, "CERRADO");
  }

  {
    // Factura A → B: el PDF de A nunca aparece en la modal de B.
    const v = visorSimulado("manual");
    const pA = v.visor.abrir(docVisor(D(1), "0010004"));
    const pB = v.visor.abrir(docVisor(D(2), "0010005"));

    v.pendientes[1].resolver(new Blob([new Uint8Array(PDF_B)]));
    await pB;
    v.pendientes[0].resolver(new Blob([new Uint8Array(PDF)])); // A llega tarde
    await pA;
    const e = v.visor.estado();

    igual("KUDE-25 visor: al pasar de la factura A a la B, la respuesta tardía de A se descarta y la modal B muestra SOLO el PDF de B", [e.fase === "LISTO" ? e.titulo : e.fase, e.fase === "LISTO" ? (await bytesDe(v.urls.get(e.url))).equals(PDF_B) : null, v.urls.size, v.pendientes[0].signal.aborted], ["KuDE · Factura 001-001-0010005", true, 1, true]);

    // Orden inverso: A responde antes que B y B sigue siendo el vigente.
    const w = visorSimulado("manual");
    const wA = w.visor.abrir(docVisor(D(1)));
    const wB = w.visor.abrir(docVisor(D(2), "0010005"));

    w.pendientes[0].resolver(new Blob([new Uint8Array(PDF)]));
    await wA;
    igual("KUDE-25b visor: la respuesta de A llegada primero no sustituye a B, que sigue cargando", w.visor.estado().fase, "CARGANDO");
    w.pendientes[1].resolver(new Blob([new Uint8Array(PDF_B)]));
    await wB;
    igual("KUDE-25c visor: después B se presenta con su propio PDF", (() => { const e = w.visor.estado(); return e.fase === "LISTO" && e.docId === D(2); })(), true);
  }

  {
    // Error → Reintentar = solicitud nueva; un doble clic accidental no duplica.
    limpiarCacheTokens();
    const g = gateway([() => ({ status: 503, tipo: "text/html", bytes: Buffer.from("x") }), pdfOk]);
    const v = visorSimulado("directo", g, mundo([fe(D(1), E1)]));

    await v.visor.abrir(docVisor(D(1)));
    const err = v.visor.estado();

    igual("KUDE-26 visor: ante un error del gateway muestra el mensaje en español, sin secretos, y no hay PDF ni descarga", [err.fase, err.fase === "ERROR" && /no está disponible/.test(err.mensaje), err.fase === "ERROR" && SECRETOS.test(err.mensaje), v.urls.size], ["ERROR", true, false, 0]);
    await v.visor.reintentar();
    igual("KUDE-27 visor: «Reintentar» hace una NUEVA solicitud al gateway y entrega el PDF", [g.kudes.length, v.visor.estado().fase], [2, "LISTO"]);
    v.visor.cerrar();
    await v.visor.reintentar();
    igual("KUDE-27b visor: reintentar fuera de un error no hace nada", [v.visor.estado().fase, v.llamadas.length], ["CERRADO", 2]);

    const m = visorSimulado("manual");

    void m.visor.abrir(docVisor(D(1)));
    void m.visor.abrir(docVisor(D(1)));
    igual("KUDE-28 visor: un segundo clic accidental sobre el MISMO documento mientras carga no genera otra solicitud", m.llamadas.length, 1);
    m.visor.cerrar();
  }

  {
    // Visor + permisos/aislamiento: usuario/empresa/sucursal sin autorización no obtienen PDF.
    const docs = [fe(D(1), E1), fe(D(2), E2), fe(D(3), E1, { sucursal: SUC_B })];
    const casos: Array<[string, string, string, string]> = [["otra empresa", E1, U1, D(2)], ["sucursal sin alcance", E1, U1, D(3)], ["usuario sin vínculo con la empresa", E2, U2, D(2)]];

    for (const [nombre, e, u, id] of casos) {
      limpiarCacheTokens();
      const g = gateway(pdfOk);
      const v = visorSimulado("directo", g, mundo(docs), u, e);

      await v.visor.abrir(docVisor(id));
      igual("KUDE-29 visor [" + nombre + "]: la modal muestra el error, NO hay PDF y no se llamó al gateway", [v.visor.estado().fase, v.urls.size, g.kudes.length, g.logins.length], ["ERROR", 0, 0, 0]);
    }
  }

  {
    // Solicitud real del cliente al servidor de NEXIT (fetch simulado): solo viaja el ID, sin caché del navegador y con la señal de aborto.
    const llamadas: Array<{ url: string; init: RequestInit }> = [];
    const respuesta = (status: number, tipo: string, cuerpo: string | Uint8Array) => (async (url: string, init?: RequestInit) => { llamadas.push({ url, init: init ?? {} }); return new Response(cuerpo as BodyInit, { status, headers: { "content-type": tipo } }); }) as unknown as typeof fetch;
    const control = new AbortController();
    const blob = await pedirKudeAlServidor(D(1), control.signal, respuesta(200, "application/pdf", new Uint8Array(PDF)));

    igual("KUDE-30 cliente: GET a /api/documentos/{id}/kude con no-store y señal de aborto; el Blob conserva los bytes", [llamadas[0].url, llamadas[0].init.cache, llamadas[0].init.signal === control.signal, (await bytesDe(blob)).equals(PDF)], ["/api/documentos/" + D(1) + "/kude", "no-store", true, true]);

    const errores: Array<[string, typeof fetch, string]> = [
      ["403 con mensaje", respuesta(403, "application/json", JSON.stringify({ error: "No tiene permiso para esta acción." })), "No tiene permiso para esta acción."],
      ["502 sin cuerpo útil", respuesta(502, "text/html", "<html>"), "No fue posible obtener el KuDE."],
      ["200 que no es PDF", respuesta(200, "application/json", "{}"), "El servidor no devolvió un PDF válido."],
    ];

    for (const [nombre, f, mensaje] of errores) {
      let obtenido = "";

      try { await pedirKudeAlServidor(D(1), new AbortController().signal, f); obtenido = "SIN ERROR"; } catch (e) { obtenido = (e as Error).message; }
      igual("KUDE-31 cliente [" + nombre + "]: error en español y sin Blob", obtenido, mensaje);
    }
  }

  // ── 7b. PRO-196: el límite del cuerpo se aplica DURANTE la recepción (flujo), con o sin Content-Length ─────────────────────────────────────
  {
    const LIM = Math.ceil((MAX_KUDE_BYTES * 4) / 3) + 8192;
    const TROZO = 256 * 1024;
    const flujoLeer = (r: Resp) => { const reg: RegistroFlujo = { cancelado: false, leidos: 0 }; return { reg, cuerpo: flujoDe(r, reg) }; };

    const n = flujoLeer({ status: 200, bytes: Buffer.from("x".repeat(500_000)), trozo: 4096 });
    const t1 = await leerCuerpoLimitado(n.cuerpo, LIM);

    igual("KUDE-40 flujo normal (varios trozos): se lee completo y no se cancela", [t1?.length, n.reg.cancelado], [500_000, false]);

    const ex = flujoLeer({ status: 200, flujo: "infinito", trozo: TROZO });
    const t2 = await leerCuerpoLimitado(ex.cuerpo, LIM);

    igual("KUDE-41 flujo excesivo (infinito): se CANCELA la lectura al superar el límite y se leyó como máximo el límite más unos pocos trozos (no el cuerpo completo)", [t2, ex.reg.cancelado, ex.reg.leidos <= LIM + 4 * TROZO], [null, true, true]);

    const fin = flujoLeer({ status: 200, bytes: Buffer.alloc(LIM + 1, 98), trozo: TROZO });

    igual("KUDE-42 flujo finito apenas por encima del límite: null y cancelado; justo en el límite: se acepta", [await leerCuerpoLimitado(fin.cuerpo, LIM), fin.reg.cancelado, (await leerCuerpoLimitado(flujoLeer({ status: 200, bytes: Buffer.alloc(LIM, 99), trozo: TROZO }).cuerpo, LIM))?.length], [null, true, LIM]);
    igual("KUDE-42b sin cuerpo (null) se interpreta como vacío", await leerCuerpoLimitado(null, 10), "");

    // A través de obtenerKude (transporte real): sin Content-Length, con Content-Length FALSO, con Content-Length excesivo y flujo normal grande.
    const casos: Array<[string, Resp]> = [
      ["sin Content-Length, flujo sin fin", { status: 200, flujo: "infinito", trozo: TROZO }],
      ["Content-Length FALSO (declara poco, envía sin fin)", { status: 200, flujo: "infinito", trozo: TROZO, largo: "100" }],
      ["Content-Length excesivo declarado", { status: 200, flujo: "infinito", trozo: TROZO, largo: String(LIM + 1) }],
      ["cuerpo finito excesivo sin Content-Length", { status: 200, bytes: Buffer.alloc(LIM + 5, 97), trozo: TROZO }],
    ];

    for (const [nombre, resp] of casos) {
      limpiarCacheTokens();
      const g = gateway(() => resp);
      const x = await falla(mundo([fe(D(1), E1)]), g, E1, U1, D(1));
      const reg = g.flujos[0];

      igual("KUDE-43 [" + nombre + "]: 502 «excede el tamaño», lectura cancelada, memoria acotada y sin PDF", [x.estado, x.mensaje.includes("excede"), reg.cancelado || nombre.startsWith("cuerpo finito"), reg.leidos <= LIM + 4 * TROZO], [502, true, true, true]);
    }


    // PDF grande legítimo (varios MB, sin Content-Length, en trozos) sigue funcionando y llega intacto.
    limpiarCacheTokens();
    const grande = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(6 * 1024 * 1024, 32), Buffer.from("\n%%EOF\n")]);
    const gGrande = gateway(() => ok({}, grande, CDC));
    const rGrande = await obtenerKude(mundo([fe(D(1), E1)]).db, E1, U1, D(1), gGrande.dep);

    igual("KUDE-44 un PDF legítimo de 6 MB recibido por trozos y sin Content-Length llega intacto y sin cancelar", [rGrande.pdf.equals(grande), gGrande.flujos[0].cancelado], [true, false]);

    // Un error del flujo en mitad de la lectura es un fallo controlado (no una excepción) y el timeout sigue vigente.
    limpiarCacheTokens();
    const gErr: ReturnType<typeof gateway> = gateway(() => ({ status: 0, lanza: "RED" }));
    const xErr = await falla(mundo([fe(D(1), E1)]), gErr, E1, U1, D(1));

    igual("KUDE-45 un corte de red durante la solicitud es un error controlado", [xErr.estado, /comunicarse/.test(xErr.mensaje)], [503, true]);
  }

  // ── 7c. PRO-197: «Descargar PDF» = consulta nueva, con carga, error, cancelación y cambio de documento ────────────────────────────────────
  {
    limpiarCacheTokens();
    const g = gateway([pdfOk, () => ({ status: 503, tipo: "text/html", bytes: Buffer.from("x") }), pdfOk]);
    const v = visorSimulado("directo", g, mundo([fe(D(1), E1)]));

    await v.visor.abrir(docVisor(D(1)));
    const fasesDescarga: string[] = [];

    v.visor.suscribir(() => { const e = v.visor.estado(); if (e.fase === "LISTO") fasesDescarga.push(e.descarga); });
    await v.visor.descargar(); // 503
    const e1 = v.visor.estado();

    igual("KUDE-50 descarga con error: el visor SIGUE mostrando el PDF, informa el error en español y no descarga nada", [fasesDescarga, e1.fase === "LISTO" ? e1.descarga : null, e1.fase === "LISTO" && /no está disponible/.test(e1.mensajeDescarga), v.acciones, e1.fase === "LISTO" && SECRETOS.test(e1.mensajeDescarga)], [["CARGANDO", "ERROR"], "ERROR", true, [], false]);
    await v.visor.descargar(); // reintento → nueva solicitud, éxito
    igual("KUDE-51 reintentar la descarga hace otra solicitud al gateway y completa", [g.kudes.length, v.acciones.length, descargaDe(v.visor.estado())], [3, 1, "INACTIVA"]);
    v.visor.cerrar();

    // Doble clic en «Descargar PDF» mientras prepara: una sola solicitud.
    const m = visorSimulado("manual");
    const pa = m.visor.abrir(docVisor(D(1)));

    m.pendientes[0].resolver(new Blob([new Uint8Array(PDF)]));
    await pa;
    const d1 = m.visor.descargar();
    const d2 = m.visor.descargar();

    igual("KUDE-52 doble clic en «Descargar PDF»: una sola solicitud nueva y el botón queda en CARGANDO", [m.llamadas.length, descargaDe(m.visor.estado())], [2, "CARGANDO"]);
    m.pendientes[1].resolver(new Blob([new Uint8Array(PDF)]));
    await Promise.all([d1, d2]);
    igual("KUDE-52b completa una sola descarga", m.acciones, ["descargar:blob:nexit/2:KuDE-FE-001-001-0010004.pdf"]);
    m.visor.cerrar();

    // Cerrar durante la descarga: se aborta y NO se completa en la interfaz.
    const c = visorSimulado("manual");
    const pc = c.visor.abrir(docVisor(D(1)));

    c.pendientes[0].resolver(new Blob([new Uint8Array(PDF)]));
    await pc;
    const dc = c.visor.descargar();

    c.visor.cerrar();
    c.pendientes[1].resolver(new Blob([new Uint8Array(PDF)])); // llega tarde
    await dc;
    igual("KUDE-53 cerrar durante la descarga: la solicitud se aborta, no se descarga nada, no se crea ninguna URL nueva y el visor queda CERRADO", [c.pendientes[1].signal.aborted, c.acciones, c.visor.estado().fase, c.urls.size, c.diferidas.length], [true, [], "CERRADO", 0, 0]);

    // Error tardío tras cerrar: tampoco cambia nada.
    const c2 = visorSimulado("manual");
    const pc2 = c2.visor.abrir(docVisor(D(1)));

    c2.pendientes[0].resolver(new Blob([new Uint8Array(PDF)]));
    await pc2;
    const dc2 = c2.visor.descargar();

    c2.visor.cerrar();
    c2.pendientes[1].rechazar(new Error("tarde"));
    await dc2;
    igual("KUDE-53b un error tardío de la descarga tras cerrar no reabre ni cambia el estado", c2.visor.estado().fase, "CERRADO");

    // Cambio de factura A → B durante la descarga de A: el PDF de A jamás se descarga ni aparece en B.
    const t = visorSimulado("manual");
    const pa1 = t.visor.abrir(docVisor(D(1), "0010004"));

    t.pendientes[0].resolver(new Blob([new Uint8Array(PDF)]));
    await pa1;
    const dA = t.visor.descargar();
    const pb = t.visor.abrir(docVisor(D(2), "0010005"));

    t.pendientes[1].resolver(new Blob([new Uint8Array(PDF)])); // descarga de A llega tarde
    await dA;
    t.pendientes[2].resolver(new Blob([new Uint8Array(PDF_B)]));
    await pb;
    const eb = t.visor.estado();

    igual("KUDE-54 cambiar de factura durante la descarga de A: la solicitud de A se aborta, no se descarga nada y la modal B muestra SOLO el PDF de B sin rastro de descarga", [t.pendientes[1].signal.aborted, t.acciones, eb.fase === "LISTO" ? [eb.titulo, eb.descarga, (await bytesDe(t.urls.get(eb.url))).equals(PDF_B)] : eb.fase, t.diferidas.length], [true, [], ["KuDE · Factura 001-001-0010005", "INACTIVA", true], 0]);
    // Una descarga posterior en B usa el documento B.
    const dB = t.visor.descargar();

    t.pendientes[3].resolver(new Blob([new Uint8Array(PDF_B)]));
    await dB;
    igual("KUDE-54b la descarga siguiente pertenece al documento B (id y nombre)", [t.llamadas[3], t.acciones.map((a) => a.split(":").slice(3).join(":"))], [D(2), ["KuDE-FE-001-001-0010005.pdf"]]);
    t.visor.cerrar();
  }

  {
    // De extremo a extremo con la orquestación real: otra empresa / sucursal sin alcance no obtienen descarga; CDC ajeno se descarta; nada se persiste.
    limpiarCacheTokens();
    const docs = [fe(D(1), E1), fe(D(2), E2), fe(D(3), E1, { sucursal: SUC_B })];
    const g = gateway(pdfOk);
    const mm = mundo(docs);
    const v = visorSimulado("directo", g, mm);

    await v.visor.abrir(docVisor(D(1)));
    await v.visor.descargar();
    igual("KUDE-55 descarga autorizada: dos solicitudes con el token y la identidad de LA empresa del usuario; CDC verificado en cada una; sin escrituras en la base", [g.kudes.length, g.kudes.every((k) => /^Bearer TOKEN-RUC-E1-/.test(k.auth ?? "")), mm.consultas.some((q) => /\b(INSERT|UPDATE|DELETE)\b|fe_documento_registrar/i.test(q))], [2, true, false]);
    v.visor.cerrar();

    const gAjeno = gateway([pdfOk, () => ok({}, PDF_B, CDC_B)]);
    const vA = visorSimulado("directo", gAjeno, mundo(docs));

    await vA.visor.abrir(docVisor(D(1)));
    await vA.visor.descargar(); // el gateway devuelve el KuDE de OTRO documento
    const eA = vA.visor.estado();

    igual("KUDE-56 si en la descarga el gateway devuelve un CDC ajeno se descarta: error en la modal, nada se descarga", [eA.fase === "LISTO" ? eA.descarga : null, eA.fase === "LISTO" && /no corresponde/.test(eA.mensajeDescarga), vA.acciones], ["ERROR", true, []]);
    vA.visor.cerrar();

    for (const [nombre, id] of [["otra empresa", D(2)], ["sucursal sin alcance", D(3)]] as Array<[string, string]>) {
      const gx = gateway(pdfOk);
      const vx = visorSimulado("directo", gx, mundo(docs));

      await vx.visor.abrir(docVisor(id));
      igual("KUDE-57 [" + nombre + "]: ni se muestra ni se descarga y no hay llamadas al gateway", [vx.visor.estado().fase, gx.kudes.length, vx.acciones.length], ["ERROR", 0, 0]);
      await vx.visor.descargar();
      igual("KUDE-57b [" + nombre + "]: «Descargar» sin PDF mostrado no hace nada", [gx.kudes.length, vx.acciones.length], [0, 0]);
    }
  }

  // ── 8. Ruta HTTP y pantalla/modal (estructural; React/navegador no se renderizaron) ───────────────────────────────────────────────────────
  const ruta = leer("app/api/documentos/[id]/kude/route.ts");
  const pagina = leer("app/(private)/documentos/page.tsx");
  const modal = leer("app/(private)/documentos/kude-modal.tsx");
  const shared = leer("lib/facturacion/shared.ts");

  cierto("KUDE-16 ruta: GET autenticado con FACTURACION_ELECTRONICA.VER, solo el ID desde el navegador, application/pdf, nombre del registro, no-store, nosniff, inline o attachment", /prepararFacturacion\("VER"\)/.test(ruta) && /obtenerKude\(b\.db, b\.empresaId, b\.usuarioId, id\)/.test(ruta) && /"Content-Type": "application\/pdf"/.test(ruta) && /inline/.test(ruta) && /attachment/.test(ruta) && /private, no-store/.test(ruta) && /nosniff/.test(ruta) && !/searchParams\.get\("(empresa|tipOpe|url)/.test(ruta) && /console\.error\("Error al obtener el KuDE:", error instanceof Error \? error\.name : "desconocido"\)/.test(ruta) && !/console\.log/.test(ruta));
  {
    const previo = { d: process.env.DATABASE_URL, m: process.env.DEMO_MODE };

    delete process.env.DATABASE_URL;
    delete process.env.DEMO_MODE;
    const mod = await import("@/app/api/documentos/[id]/kude/route");
    const res = await mod.GET(new Request("http://x/api/documentos/" + D(1) + "/kude"), { params: Promise.resolve({ id: D(1) }) });

    if (previo.d !== undefined) process.env.DATABASE_URL = previo.d;
    if (previo.m !== undefined) process.env.DEMO_MODE = previo.m;
    igual("KUDE-17 ruta real: sin base de datos configurada responde 503 sin PDF", [res.status, res.headers.get("content-type")?.includes("application/json")], [503, true]);
  }
  cierto("KUDE-18 pantalla: «Ver KuDE (PDF)» para FE y NCE (sin condicionar el estado fiscal), abre la modal por el controlador (sin window.open), usa el cliente del servidor por ID y libera al desmontar", /kudeDisponible\(d\)/.test(pagina) && /Ver KuDE \(PDF\)/.test(pagina) && !/window\.open/.test(pagina) && /crearControladorVisor\(/.test(pagina) && /pedirKudeAlServidor\(id, signal\)/.test(pagina) && /URL\.createObjectURL/.test(pagina) && /URL\.revokeObjectURL/.test(pagina) && /<KudeModal controlador=\{visor\}/.test(pagina) && /XML: descarga no disponible/.test(pagina) && !/endpoint del proveedor sin confirmar/.test(pagina));
  cierto("KUDE-18b modal: diálogo accesible (role=dialog, aria-modal, título «KuDE · Factura …»), Descargar PDF (con estado de preparación y error) / Imprimir / Cerrar, Reintentar en error, Escape cierra, foco atrapado y devuelto, visor desmontado al cerrar, iframe solo con la URL temporal", /role="dialog"/.test(modal) && /aria-modal="true"/.test(modal) && /Descargar PDF/.test(modal) && />Imprimir</.test(modal) && />Cerrar</.test(modal) && /Reintentar/.test(modal) && /Preparando descarga/.test(modal) && /controlador\.descargar\(\)/.test(modal) && /e\.key === "Escape"/.test(modal) && /e\.key !== "Tab"/.test(modal) && /previo\?\.focus/.test(modal) && /estado\.fase === "CERRADO"\) return null/.test(modal) && /src=\{estado\.url\}/.test(modal) && /controlador\.cerrar\(\)/.test(modal) && !/localStorage|sessionStorage|indexedDB/.test(modal + pagina + leer("lib/facturacion/kude-visor.ts")));
  {
    const ini = shared.indexOf("export async function obtenerKude");
    const fin = shared.indexOf("export function respuestaErrorFacturacion");

    cierto("KUDE-19 el KuDE no escribe en la base ni usa caché (sin INSERT/UPDATE, fe_documento_registrar, Map ni memoización en obtenerKude)", ini > 0 && fin > ini && !/fe_documento_registrar|INSERT|UPDATE|new Map|cache/i.test(shared.slice(ini, fin)));
  }

  limpiarCacheTokens(); // no deja tokens simulados en la caché para otras suites del mismo proceso

  return fallos;
}
