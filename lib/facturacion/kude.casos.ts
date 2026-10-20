/**
 * PRO-194 — KuDE (PDF) de la FE desde Documentos electrónicos. Sin red, sin PostgreSQL y sin navegador: el gateway es un MOCK que responde lo que el contrato PARCIAL permite imaginar (la RESPUESTA real del
 * proveedor NO fue entregada: solo se acepta application/pdf con bytes «%PDF-…%%EOF»; cualquier otro formato se rechaza). La base es simulada (alcance por empresa/sucursal como ALCANCE de leerDocumento).
 * Estos casos prueban la lógica y los límites de seguridad; NO prueban que el proveedor real devuelva un PDF. La pantalla se verifica de forma estructural (no se renderizó React).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { esPdfValido, limpiarCacheTokens, MAX_KUDE_BYTES, type FetchLike, type KudeFetch } from "@/lib/facturacion/gateway";
import { nombreArchivoKude, obtenerKude, tipOpeDePayload } from "@/lib/facturacion/shared";

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

type Doc = { id: string; empresa: string; sucursal: string; tipo: string; establecimiento: string; puntoExpedicion: string; numero: string; serie: string | null; cdc: string | null; estadoSifen: string };
type Resp = { status: number; tipo?: string; bytes?: Buffer; largo?: string; lanza?: "TIMEOUT" | "RED" };
type Comportamiento = Array<(n: number) => Resp> | ((n: number) => Resp);

export async function verificarCasosKude(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(nombre + ": esperado " + JSON.stringify(esperado) + ", obtenido " + JSON.stringify(obtenido));
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  const fe = (id: string, empresa: string, extra: Partial<Doc> = {}): Doc => ({ id, empresa, sucursal: SUC_A, tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0010004", serie: null, cdc: "0".repeat(44), estadoSifen: "APROBADO", ...extra });

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

      n += 1;
      if (r.lanza === "TIMEOUT") { const e = new Error("abortado"); e.name = "AbortError"; throw e; }
      if (r.lanza === "RED") throw new Error("ECONNRESET");

      const cab: Record<string, string> = { "content-type": r.tipo ?? "application/pdf" };

      if (r.largo) cab["content-length"] = r.largo;

      return { status: r.status, headers: { get: (k: string) => cab[k.toLowerCase()] ?? null }, arrayBuffer: async () => { const b = r.bytes ?? PDF; return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; } };
    };

    return { dep: { fetch, fetchKude }, logins, kudes };
  }
  const pdfOk = (): Resp => ({ status: 200 });
  const falla = async (m: ReturnType<typeof mundo>, g: ReturnType<typeof gateway>, empresa: string, usuario: string, id: string) => {
    try {
      await obtenerKude(m.db, empresa, usuario, id, g.dep);

      return { estado: 0, mensaje: "SIN ERROR" };
    } catch (e) {
      return { estado: (e as { estado?: number }).estado ?? -1, mensaje: String((e as Error).message) };
    }
  };
  const SECRETOS = /pass-secreta|TOKEN-|Bearer|RUC-E/;

  // ── 1. FE autorizada: solicitud correcta, PDF íntegro, nombre y ceros ─────────────────────────────────────────────────────────────────────
  {
    limpiarCacheTokens();
    const m = mundo([fe(D(1), E1)]);
    const g = gateway(pdfOk);
    const r = await obtenerKude(m.db, E1, U1, D(1), g.dep);

    igual("KUDE-01: una solicitud POST a {base}/api/kude con el Bearer de la empresa y el cuerpo exacto (ceros a la izquierda, serie null, tipoDoc FE, tipOpe del payload persistido)", [g.kudes.length, g.kudes[0].url, /^Bearer TOKEN-RUC-E1-/.test(g.kudes[0].auth ?? ""), g.kudes[0].body], [1, "https://gw.example.test/api/kude", true, { tipOpe: "4", dEst: "001", dPunExp: "001", dNumDoc: "0010004", dSerieNum: null, tipoDoc: "FE" }]);
    igual("KUDE-02: los bytes del PDF llegan intactos y el nombre sale solo de la identidad fiscal", [Buffer.compare(r.pdf, PDF), r.nombre], [0, "KuDE-FE-001-001-0010004.pdf"]);
    igual("KUDE-03: solo lectura — ninguna escritura en la base (ni estados SIFEN, ni intentos, ni numeración)", m.consultas.some((s) => /\b(INSERT|UPDATE|DELETE)\b|fe_documento_registrar/i.test(s)), false);

    const m2 = mundo([fe(D(2), E1, { serie: "AB", numero: "0000123" })], { payloads: { [D(2)]: { iTiOpe: 2 } } });
    const g2 = gateway(pdfOk);
    const r2 = await obtenerKude(m2.db, E1, U1, D(2), g2.dep);

    igual("KUDE-04: tipOpe NO es constante — otro documento con iTiOpe 2 y serie AB envía «2» y la serie; el nombre incluye la serie", [g2.kudes[0].body.tipOpe, g2.kudes[0].body.dSerieNum, g2.kudes[0].body.dNumDoc, r2.nombre], ["2", "AB", "0000123", "KuDE-FE-001-001-0000123-AB.pdf"]);
  }

  // ── 2. tipOpe: sin dato confiable no hay fallback ─────────────────────────────────────────────────────────────────────────────────────────
  const sinDato: Array<[string, unknown]> = [["sin iTiOpe", {}], ["iTiOpe fuera de dominio", { iTiOpe: 9 }], ["iTiOpe no numérico", { iTiOpe: "x" }], ["sin solicitud persistida", undefined]];

  for (const [nombre, payload] of sinDato) {
    limpiarCacheTokens();
    const m = mundo([fe(D(1), E1)], { payloads: { [D(1)]: payload } });
    const g = gateway(pdfOk);
    const x = await falla(m, g, E1, U1, D(1));

    igual("KUDE-05 [" + nombre + "]: se bloquea (409), no se inventa tipOpe y no se llama al gateway", [x.estado, g.kudes.length, g.logins.length], [409, 0, 0]);
  }
  igual("KUDE-06: tipOpeDePayload acepta 1..4 (número o texto) y nada más", [tipOpeDePayload({ iTiOpe: 1 }), tipOpeDePayload({ iTiOpe: "3" }), tipOpeDePayload({ iTiOpe: 0 }), tipOpeDePayload(null)], ["1", "3", null, null]);

  // ── 3. Aislamiento, alcance y elegibilidad: nunca se llama al gateway ───────────────────────────────────────────────────────────────────────
  {
    const docs = [fe(D(1), E1), fe(D(2), E2), fe(D(3), E1, { sucursal: SUC_B }), fe(D(4), E1, { tipo: "NCE" }), fe(D(5), E1, { estadoSifen: "PENDIENTE" }), fe(D(6), E1, { cdc: null }), fe(D(7), E1, { estadoSifen: "RECHAZADO" })];
    const casos: Array<[string, string, string, string, number]> = [
      ["documento de OTRA empresa", E1, U1, D(2), 404], ["sucursal fuera del alcance del usuario", E1, U1, D(3), 404], ["ID inexistente", E1, U1, D(9), 404], ["ID no válido", E1, U1, "../../etc/passwd", 404],
      ["tipo NCE", E1, U1, D(4), 409], ["FE pendiente", E1, U1, D(5), 409], ["FE aprobada sin CDC", E1, U1, D(6), 409], ["FE rechazada", E1, U1, D(7), 409],
    ];

    for (const [nombre, e, u, id, estado] of casos) {
      limpiarCacheTokens();
      const m = mundo(docs);
      const g = gateway(pdfOk);
      const x = await falla(m, g, e, u, id);

      igual("KUDE-07 [" + nombre + "]: " + String(estado) + " sin llamada externa ni datos ajenos", [x.estado, g.kudes.length, g.logins.length, SECRETOS.test(x.mensaje) || /d0000000|22222222/.test(x.mensaje)], [estado, 0, 0, false]);
    }

    limpiarCacheTokens();
    const gAmplio = gateway(pdfOk);
    const ok = await obtenerKude(mundo(docs).db, E1, U2, D(3), gAmplio.dep);

    igual("KUDE-08: el usuario CON alcance a la otra sucursal sí obtiene su KuDE (decide el alcance, no el rol)", [ok.nombre, gAmplio.kudes.length], ["KuDE-FE-001-001-0010004.pdf", 1]);
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

  // ── 5. Fallas del gateway: error controlado, jamás un archivo falso ─────────────────────────────────────────────────────────────────────────
  {
    const json = (s: number) => (): Resp => ({ status: s, tipo: "application/json", bytes: Buffer.from("{}") });
    const escenarios: Array<[string, Comportamiento, number, string]> = [
      ["401 persistente", json(401), 502, "renovarla"],
      ["timeout", () => ({ status: 0, lanza: "TIMEOUT" }), 502, "Tiempo de espera"],
      ["red caída", () => ({ status: 0, lanza: "RED" }), 503, "comunicarse"],
      ["404", json(404), 502, "no encontró"],
      ["500", () => ({ status: 500, tipo: "text/html", bytes: Buffer.from("<html>error</html>") }), 503, "no está disponible"],
      ["200 con JSON (formato no confirmado)", () => ({ status: 200, tipo: "application/json", bytes: Buffer.from(JSON.stringify({ status: "success", pdf: PDF.toString("base64") })) }), 502, "no está confirmado"],
      ["200 con texto plano llamado PDF", () => ({ status: 200, tipo: "application/pdf", bytes: Buffer.from("esto no es un pdf") }), 502, "no es un PDF válido"],
      ["PDF truncado (sin %%EOF)", () => ({ status: 200, tipo: "application/pdf", bytes: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\n") }), 502, "no es un PDF válido"],
      ["bytes PDF con Content-Type inesperado", () => ({ status: 200, tipo: "text/plain", bytes: PDF }), 502, "no está confirmado"],
      ["PDF declarado demasiado grande", () => ({ status: 200, largo: String(MAX_KUDE_BYTES + 1) }), 502, "excede"],
      ["PDF demasiado grande sin Content-Length", () => ({ status: 200, bytes: Buffer.concat([PDF, Buffer.alloc(MAX_KUDE_BYTES)]) }), 502, "excede"],
    ];

    for (const [nombre, comp, estado, trozo] of escenarios) {
      limpiarCacheTokens();
      const g = gateway(comp);
      const x = await falla(mundo([fe(D(1), E1)]), g, E1, U1, D(1));

      igual("KUDE-11 [" + nombre + "]: error " + String(estado) + " controlado, en español, sin secretos y sin PDF", [x.estado, x.mensaje.includes(trozo), SECRETOS.test(x.mensaje)], [estado, true, false]);
    }

    limpiarCacheTokens();
    const g = gateway([(): Resp => ({ status: 401, tipo: "application/json", bytes: Buffer.from("{}") }), pdfOk]);
    const r = await obtenerKude(mundo([fe(D(1), E1)]).db, E1, U1, D(1), g.dep);

    igual("KUDE-12: un 401 renueva el token UNA vez y la segunda solicitud entrega el PDF", [g.logins.length, g.kudes.length, Buffer.compare(r.pdf, PDF)], [2, 2, 0]);

    limpiarCacheTokens();
    const g2 = gateway(json(401));

    await falla(mundo([fe(D(1), E1)]), g2, E1, U1, D(1));
    igual("KUDE-13: con 401 persistente se renueva una sola vez (no hay bucle)", [g2.logins.length, g2.kudes.length], [2, 2]);
  }

  // ── 6. Utilidades ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  igual("KUDE-14: esPdfValido exige cabecera y %%EOF", [esPdfValido(PDF), esPdfValido(Buffer.from("%PDF-1.4 sin cierre")), esPdfValido(Buffer.from("<html>"))], [true, false, false]);
  igual("KUDE-15: el nombre del archivo se sanea (sin separadores ni comillas)", nombreArchivoKude({ establecimiento: "0/1", puntoExpedicion: "\"001", numero: "../7", serie: null }), "KuDE-FE-01-001-7.pdf");

  // ── 7. Ruta HTTP y pantalla (estructural; React/navegador no se renderizaron) ─────────────────────────────────────────────────────────────────
  const ruta = leer("app/api/documentos/[id]/kude/route.ts");
  const pagina = leer("app/(private)/documentos/page.tsx");
  const shared = leer("lib/facturacion/shared.ts");

  cierto("KUDE-16 ruta: GET autenticado con FACTURACION_ELECTRONICA.VER, solo el ID desde el navegador, application/pdf, nombre del registro, no-store, nosniff, inline o attachment", /prepararFacturacion\("VER"\)/.test(ruta) && /obtenerKude\(b\.db, b\.empresaId, b\.usuarioId, id\)/.test(ruta) && /"Content-Type": "application\/pdf"/.test(ruta) && /inline/.test(ruta) && /attachment/.test(ruta) && /private, no-store/.test(ruta) && /nosniff/.test(ruta) && !/searchParams\.get\("(empresa|tipOpe|url)/.test(ruta));
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
  cierto("KUDE-18 pantalla: Ver KuDE (PDF) y Descargar KuDE solo para FE APROBADA con CDC, un clic a la vez por documento, URL por ID, valida application/pdf, libera el blob y muestra el error en español; XML sigue no disponible", /d\.tipo === "FE" && d\.estadoSifen === "APROBADO" && d\.cdc/.test(pagina) && /Ver KuDE \(PDF\)/.test(pagina) && /Descargar KuDE/.test(pagina) && /if \(abiertos\[d\.id\]\?\.kudeCargando\) return/.test(pagina) && /\/api\/documentos\/\$\{d\.id\}\/kude/.test(pagina) && /application\/pdf/.test(pagina) && /revokeObjectURL/.test(pagina) && /XML: descarga no disponible/.test(pagina) && !/endpoint del proveedor sin confirmar/.test(pagina));

  const ini = shared.indexOf("export async function obtenerKude");
  const fin = shared.indexOf("export function respuestaErrorFacturacion");

  cierto("KUDE-19 el KuDE no escribe en la base (sin INSERT/UPDATE ni fe_documento_registrar en obtenerKude)", ini > 0 && fin > ini && !/fe_documento_registrar|INSERT|UPDATE/.test(shared.slice(ini, fin)));

  limpiarCacheTokens(); // no deja tokens simulados en la caché para otras suites del mismo proceso

  return fallos;
}
