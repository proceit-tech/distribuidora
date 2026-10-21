/**
 * G01-R01 / PRO-208 y PRO-209 — seguridad del DESTINO de las conexiones al gateway:
 *  · ipNoPublica clasifica TODA representación de IPv4 mapeada/incrustada en IPv6 (decimal, hexadecimal, mayúsculas, forma larga) y rechaza por defecto lo que no es unicast global.
 *  · la conexión usa la IP validada: el `lookup` de la conexión resuelve una sola vez, valida todas las direcciones y entrega solo públicas (sin DNS rebinding); conserva el hostname original
 *    (SNI/certificado), no sigue redirecciones y no usa agente compartido. Sin red real: el transporte se simula; el caso «IP privada» se prueba además con node:https real (nunca llega a conectar).
 */
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { request as httpsReal, type RequestOptions } from "node:https";
import { join } from "node:path";
import { Readable } from "node:stream";

import { contador } from "@/lib/clientes/contador-casos";
import { crearFetchKudeSeguro, crearFetchSeguro, crearLookupSeguro, ipNoPublica, type Transporte } from "@/lib/facturacion/gateway-url";

const sinCom = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");

const PUBLICA = "93.184.216.34";
const PUBLICA6 = "2606:4700::1111";
const init = () => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ruc: "r", password: "p" }), signal: new AbortController().signal });

/** Transporte simulado: al enviar, «conecta» como lo hace Node (invoca options.lookup una vez) y registra a qué IP se conectó. */
function transporteFalso(respuesta: { status: number; cuerpo: string; headers?: Record<string, string> } = { status: 200, cuerpo: "{}" }) {
  const registro = { solicitudes: [] as RequestOptions[], conectadoA: [] as string[], cuerpos: [] as string[], destruido: false };
  const t: Transporte = (opciones) => {
    registro.solicitudes.push(opciones);

    const req = new EventEmitter() as EventEmitter & { end(c: string): void };

    req.end = (cuerpo: string) => {
      registro.cuerpos.push(cuerpo);
      (opciones.lookup as unknown as (h: string, o: unknown, cb: (e: Error | null, a?: unknown, f?: number) => void) => void)(String(opciones.hostname), {}, (e, a) => {
        if (e) { req.emit("error", e); return; }

        registro.conectadoA.push(String(a));

        const res = Object.assign(Readable.from([Buffer.from(respuesta.cuerpo)]), { statusCode: respuesta.status, headers: respuesta.headers ?? {} });
        const destruir = res.destroy.bind(res);

        res.destroy = (...x: Parameters<typeof destruir>) => { registro.destruido = true; return destruir(...x); };
        req.emit("response", res);
      });
    };

    return req as never;
  };

  return { t, registro };
}

export async function verificarCasosGatewayDestino(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const mensaje = (p: Promise<unknown>) => p.then(() => "OK", (e: Error) => e.message);

  // ── PRO-208: IPv4 mapeada / incrustada en IPv6 ───────────────────────────────────────────────────
  const NO_PUBLICAS = [
    "::ffff:7f00:1", "::ffff:a00:1", "::ffff:c0a8:101", "::FFFF:7F00:1", "0:0:0:0:0:ffff:7f00:1", "0000:0000:0000:0000:0000:ffff:0a00:0001", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:a9fe:a9fe", "::ffff:ac10:1",
    "::ffff:6440:1", "::ffff:c000:201", "::ffff:0:0", "::ffff:e000:1", "::ffff:ffff:ffff", "::7f00:1", "::127.0.0.1", "::a00:1", "64:ff9b::7f00:1", "64:ff9b::a00:1", "2002:7f00:1::", "2002:c0a8:101::1", "2001::1", "2001:0:4136:e378:8000:63bf:3fff:fdd2",
    "fe80::1", "fe80::1%eth0", "fec0::1", "fc00::1", "fd12:3456::1", "ff02::1", "::", "::1", "100::1", "2001:db8::1", "2001:10::1", "2001:2::1", "3fff::1", "1::1", "abc", "", "1.2.3", "::ffff:999.1.1.1",
    "127.0.0.1", "10.1.2.3", "172.16.5.5", "172.31.255.255", "192.168.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1", "192.0.2.1", "192.88.99.1",
  ];

  igual("PRO208 toda representación de IPv4 mapeada/incrustada y toda dirección especial se trata como NO pública (decimal, hexadecimal, mayúsculas, forma larga, compatible, NAT64, 6to4, Teredo, zona)", NO_PUBLICAS.filter((ip) => !ipNoPublica(ip)), []);
  igual("PRO208 las direcciones públicas legítimas (v4, v6 y v4 mapeada de un host público) siguen aceptadas", ["8.8.8.8", "200.85.10.1", "172.32.0.1", "::ffff:808:808", "::ffff:8.8.8.8", PUBLICA6, "2a00:1450:4001::1"].filter((ip) => ipNoPublica(ip)), []);

  // ── PRO-209: la IP validada es la IP conectada ───────────────────────────────────────────────────
  // El resolutor es hostil: la primera respuesta es pública y TODAS las siguientes privadas (rebinding). Con la IP fijada solo importa la primera.
  let resoluciones = 0;
  const rebinding = async () => { resoluciones += 1; return resoluciones === 1 ? [PUBLICA] : ["127.0.0.1"]; };
  const a = transporteFalso();
  const r1 = await crearFetchSeguro(rebinding, a.t)("https://api.proveedor.com/api/login", init());

  igual("PRO209 rebinding (público → privado): la conexión usa EXACTAMENTE la IP validada (una sola resolución) y nunca la segunda respuesta", [a.registro.conectadoA, resoluciones, r1.status], [[PUBLICA], 1, 200]);

  const o = a.registro.solicitudes[0];

  igual("PRO209 se conserva el hostname original (SNI/certificado), puerto, ruta, método, validación de certificado, sin agente compartido, con señal de cancelación y cuerpo exacto", [o.hostname, o.port, o.path, o.method, o.rejectUnauthorized, o.agent, o.signal instanceof AbortSignal, o.protocol, a.registro.cuerpos[0]], ["api.proveedor.com", 443, "/api/login", "POST", true, false, true, "https:", JSON.stringify({ ruc: "r", password: "p" })]);
  cierto("PRO209 no se fija el servername a una IP ni se desactiva la verificación: el hostname es el nombre del dominio de la URL", !("servername" in o) && o.hostname !== PUBLICA);

  const aMixta = transporteFalso();
  const mixta = await mensaje(crearFetchSeguro(async () => [PUBLICA, "::ffff:7f00:1"], aMixta.t)("https://api.proveedor.com/api/login", init()));
  const aMixta6 = transporteFalso();
  const mixtaAAAA = await mensaje(crearFetchSeguro(async () => [PUBLICA, PUBLICA6, "fd00::1"], aMixta6.t)("https://api.proveedor.com/api/login", init()));

  igual("PRO208/209 si CUALQUIERA de las direcciones resueltas (A o AAAA, incluida IPv4-mapeada hexadecimal) no es pública, no se conecta a ninguna", [mixta, mixtaAAAA, aMixta.registro.conectadoA, aMixta6.registro.conectadoA], ["DESTINO_NO_PERMITIDO", "DESTINO_NO_PERMITIDO", [], []]);
  igual("PRO209 un nombre que no resuelve o que resuelve a una lista vacía tampoco conecta", [await mensaje(crearFetchSeguro(async () => [], transporteFalso().t)("https://api.proveedor.com/x", init())), await mensaje(crearFetchSeguro(async () => { throw new Error("ENOTFOUND"); }, transporteFalso().t)("https://api.proveedor.com/x", init()))], ["DESTINO_NO_PERMITIDO", "ENOTFOUND"]);

  // lookup en las dos formas que usa Node (all: true con autoSelectFamily, all: false)
  const lk = crearLookupSeguro(async () => [PUBLICA, PUBLICA6]);
  const formas = await Promise.all([
    new Promise<unknown>((r) => { lk("api.proveedor.com", { all: true }, (e, d) => r([e, d])); }),
    new Promise<unknown>((r) => { lk("api.proveedor.com", {}, (e, d, f) => r([e, d, f])); }),
  ]);

  igual("PRO209 el lookup entrega solo direcciones validadas: lista completa con all:true y la primera con all:false (con su familia)", formas, [[null, [{ address: PUBLICA, family: 4 }, { address: PUBLICA6, family: 6 }]], [null, PUBLICA, 4]]);

  // Node real (sin red): la opción `lookup` está realmente conectada a node:https y una IP privada se rechaza ANTES de abrir ningún socket
  const real = crearFetchSeguro(async () => ["10.0.0.7"], (opciones) => httpsReal(opciones));

  igual("PRO209 con node:https REAL y un nombre que resuelve a una IP privada la conexión falla en el lookup (DESTINO_NO_PERMITIDO) sin llegar a conectar", await mensaje(real("https://api.proveedor.com/api/login", init())), "DESTINO_NO_PERMITIDO");

  // IP literal, esquema y puerto: nunca llegan al transporte
  const b = transporteFalso();
  const literales = await Promise.all(["https://127.0.0.1/api/login", "https://[::ffff:7f00:1]/api/login", "https://[::1]/api/login", "http://api.proveedor.com/api/login", "https://localhost/api/login", "https://api.proveedor.com:8080/api/login", "https://u:p@api.proveedor.com/api/login"].map((u) => mensaje(crearFetchSeguro(async () => [PUBLICA], b.t)(u, init()))));

  igual("PRO209 IP literal (v4/v6/mapeada), http, localhost, puerto no permitido y credenciales en la URL se rechazan antes de crear la solicitud (el resolutor ni se consulta)", [literales.every((m) => m === "DESTINO_NO_PERMITIDO"), b.registro.solicitudes.length], [true, 0]);

  // redirecciones
  const c = transporteFalso({ status: 302, cuerpo: "", headers: { location: "https://10.0.0.1/robar" } });
  const r302 = await crearFetchSeguro(async () => [PUBLICA], c.t)("https://api.proveedor.com/api/login", init());

  igual("PRO209 una redirección 3xx NO se sigue (una sola solicitud, sin segunda conexión) y se devuelve tal cual", [r302.status, c.registro.solicitudes.length, c.registro.conectadoA], [302, 1, [PUBLICA]]);

  // KuDE: mismo transporte y misma garantía
  const k = transporteFalso({ status: 200, cuerpo: "ABCDEFGH", headers: { "content-length": "8" } });
  let resK = 0;
  const kude = await crearFetchKudeSeguro(async () => { resK += 1; return resK === 1 ? [PUBLICA] : ["169.254.169.254"]; }, k.t)("https://api.proveedor.com/api/kude", init());
  const lector = kude.body!.getReader();
  const p1 = await lector.read();
  const p2 = await lector.read();

  await lector.cancel();
  igual("PRO209 KuDE: misma IP fijada bajo rebinding, cabeceras y flujo legibles por trozos, y cancelar destruye la respuesta", [k.registro.conectadoA, kude.status, kude.headers.get("Content-Length"), kude.headers.get("x-otro"), p1.done, Buffer.from(p1.value ?? []).toString(), p2.done, k.registro.destruido], [[PUBLICA], 200, "8", null, false, "ABCDEFGH", true, true]);
  const kPriv = transporteFalso();

  igual("PRO209 KuDE: nombre con una dirección IPv4-mapeada hexadecimal privada no conecta", [await mensaje(crearFetchKudeSeguro(async () => [PUBLICA, "::ffff:a00:1"], kPriv.t)("https://api.proveedor.com/api/kude", init())), kPriv.registro.conectadoA], ["DESTINO_NO_PERMITIDO", []]);

  // estructura: todos los transportes de producción pasan por el lookup seguro; nada usa fetch global ni se resuelve aparte
  const gw = sinCom(leer("lib/facturacion/gateway.ts"));
  const url = sinCom(leer("lib/facturacion/gateway-url.ts"));

  cierto("login/prueba, recepcion_de, consulta_de y KuDE usan fetchSeguro/fetchKudeSeguro (IP fijada); gateway.ts no usa fetch global ni validación de destino separada", (gw.match(/dep\.fetch \?\? fetchSeguro/g) ?? []).length === 4 && /dep\.fetchKude \?\? fetchKudeSeguro/.test(gw) && !/globalThis\.fetch/.test(gw) && !/exigirDestinoPublico/.test(gw));
  cierto("gateway-url.ts no usa fetch global, no sigue redirecciones y la única resolución de nombres ocurre dentro del lookup de la conexión", !/\bfetch\(/.test(url) && !/globalThis/.test(url) && !/exigirDestinoPublico/.test(url) && (url.match(/resolver\(host\)/g) ?? []).length === 1 && /lookup: crearLookupSeguro\(resolver\)/.test(url) && /rejectUnauthorized: true/.test(url) && /agent: false/.test(url));

  return fallos;
}
