import { lookup } from "node:dns/promises";
import type { ClientRequest, IncomingMessage } from "node:http";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { isIP } from "node:net";

import type { FetchLike, KudeFetch } from "@/lib/facturacion/gateway";

/**
 * URL base del gateway editable por empresa (G01 / PRO-207) y protección contra SSRF. Dos capas independientes:
 *  1. FORMA (validarUrlGateway): solo https://nombre-de-dominio[:443|:8443], sin ruta, consulta, fragmento ni credenciales; nunca IP literal (v4/v6/decimal/hex), localhost ni sufijos internos.
 *     La misma regla se repite en la función SQL de guardado (NEX-069) y al leer la fila persistida antes de transmitir (configGatewayValida).
 *  2. DESTINO al conectar (PRO-208/209): la conexión HTTPS usa un `lookup` propio que resuelve el nombre UNA vez, valida TODAS las direcciones como públicas (ipNoPublica decodifica IPv6 a bytes) y
 *     entrega al socket solo esas direcciones: la IP verificada es la IP conectada (sin DNS rebinding). Se conserva el hostname original (SNI y certificado) y no se siguen redirecciones.
 */
export const PUERTOS_GATEWAY_PERMITIDOS = [443, 8443] as const;

const SUFIJOS_INTERNOS = ["localhost", "local", "localdomain", "internal", "intranet", "lan", "home", "corp", "private", "onion", "arpa"];
const ETIQUETA = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const TLD = /^([a-z]{2,63}|xn--[a-z0-9-]{2,59})$/;

export type UrlGatewayValida = { ok: true; url: string; host: string } | { ok: false; error: string };

const MENSAJE = "La URL del gateway no es válida: use https://dominio (sin ruta, sin credenciales, sin IP ni direcciones internas).";

export function validarUrlGateway(entrada: unknown): UrlGatewayValida {
  if (typeof entrada !== "string") return { ok: false, error: MENSAJE };

  const t = entrada.trim();

  if (t.length < 12 || t.length > 200 || /[\u0000- \u007f\\@?#%]/.test(t)) return { ok: false, error: MENSAJE };

  const m = /^https:\/\/([A-Za-z0-9.-]+?)(?::([0-9]{1,5}))?\/?$/.exec(t);

  if (!m) return { ok: false, error: MENSAJE };

  const host = m[1].toLowerCase();
  const puerto = m[2] === undefined ? 443 : Number(m[2]);
  const etiquetas = host.split(".");

  if (!(PUERTOS_GATEWAY_PERMITIDOS as readonly number[]).includes(puerto)) return { ok: false, error: MENSAJE };
  if (host.length > 253 || etiquetas.length < 2 || etiquetas.some((e) => !ETIQUETA.test(e))) return { ok: false, error: MENSAJE };

  const tld = etiquetas[etiquetas.length - 1];

  if (!TLD.test(tld) || isIP(host) !== 0 || SUFIJOS_INTERNOS.includes(tld)) return { ok: false, error: MENSAJE };

  return { ok: true, url: `https://${host}${puerto === 443 ? "" : `:${puerto}`}`, host };
}

/** IPv6 → 16 bytes (acepta «::», cola IPv4 punteada y cualquier mayúscula/minúscula). null si no es una IPv6 literal estricta; con zona («%») tampoco vale. */
function bytesIpv6(ip: string): number[] | null {
  if (isIP(ip) !== 6 || ip.includes("%")) return null;

  let texto = ip.toLowerCase();
  const punteada = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(texto);

  if (punteada) {
    const [a, b, c, d] = punteada.slice(1).map(Number);

    texto = `${texto.slice(0, punteada.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const [izq, der, resto] = texto.split("::");

  if (resto !== undefined) return null;

  const g = (t: string) => (t === "" ? [] : t.split(":"));
  const a = g(izq);
  const b = der === undefined ? [] : g(der);
  const relleno = der === undefined ? 0 : 8 - a.length - b.length;

  if ((der === undefined && a.length !== 8) || relleno < (der === undefined ? 0 : 1)) return null;

  const grupos = [...a, ...Array<string>(relleno).fill("0"), ...b];

  if (grupos.length !== 8 || grupos.some((x) => !/^[0-9a-f]{1,4}$/.test(x))) return null;

  return grupos.flatMap((x) => [parseInt(x, 16) >> 8, parseInt(x, 16) & 255]);
}

function ipv4NoPublica(a: number, b: number, c: number): boolean {
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

/**
 * ¿Dirección IP que NO es un destino público? (rechazo por defecto). IPv4: rangos privados, loopback, link-local/metadatos, CGNAT, documentación, benchmarking, multicast y reservados.
 * IPv6 se decodifica a 16 bytes: toda forma de IPv4 incrustada (mapeada ::ffff:0:0/96 en decimal u hexadecimal, compatible ::/96, NAT64 64:ff9b::/96, 6to4 2002::/16, Teredo) se rechaza o se evalúa
 * por su IPv4 real; solo se acepta unicast global 2000::/3 fuera de los bloques de documentación/especiales. Cualquier texto que no sea una IP literal estricta (p. ej. con zona «%») no es público.
 */
export function ipNoPublica(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b, c] = ip.split(".").map(Number);

    return ipv4NoPublica(a, b, c);
  }

  const x = bytesIpv6(ip);

  if (x === null) return true;

  const prefijoCero = x.slice(0, 10).every((v) => v === 0);

  if (prefijoCero && x[10] === 255 && x[11] === 255) return ipv4NoPublica(x[12], x[13], x[14]);   // IPv4 mapeada (cualquier representación)
  if (x.slice(0, 12).every((v) => v === 0)) return true;                                           // ::, ::1 y IPv4 «compatible» ::/96
  if ((x[0] & 0xe0) !== 0x20) return true;                                                         // fuera de 2000::/3 (fc00::/7, fe80::/10, ff00::/8, 64:ff9b::/96, 100::/64, …)

  const w1 = (x[2] << 8) | x[3];

  if (x[0] === 0x20 && x[1] === 0x01) {
    if (w1 === 0 || w1 === 0x0db8 || (w1 & 0xfff0) === 0x0010 || (w1 & 0xfff0) === 0x0020 || w1 === 0x0002) return true;   // Teredo, documentación, ORCHID, benchmarking
  }
  if (x[0] === 0x20 && x[1] === 0x02) return true;                                                  // 6to4 (IPv4 incrustada)
  if (x[0] === 0x3f && x[1] === 0xff && (x[2] & 0xf0) === 0) return true;                           // 3fff::/20 documentación

  return false;
}

/** Resolutor de nombres: devuelve TODAS las direcciones A/AAAA. */
export type Resolver = (host: string) => Promise<string[]>;

const resolverReal: Resolver = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

type LookupCb = (error: NodeJS.ErrnoException | null, address?: string | Array<{ address: string; family: number }>, family?: number) => void;

/**
 * `lookup` de la conexión TLS (PRO-209): se resuelve UNA vez, se validan TODAS las direcciones y se entrega al socket únicamente direcciones ya validadas como públicas. Node conecta exactamente a
 * lo que este callback devuelve (no vuelve a resolver el nombre), de modo que la IP verificada es la IP usada: no hay ventana de DNS rebinding. El nombre original sigue siendo el de la URL (SNI y
 * verificación estándar del certificado contra ese hostname).
 */
export function crearLookupSeguro(resolver: Resolver = resolverReal) {
  return (host: string, opciones: unknown, cb: LookupCb): void => {
    const todas = typeof opciones === "object" && opciones !== null && (opciones as { all?: boolean }).all === true;

    resolver(host).then(
      (direcciones) => {
        if (direcciones.length === 0 || direcciones.some(ipNoPublica)) return cb(Object.assign(new Error("DESTINO_NO_PERMITIDO"), { code: "DESTINO_NO_PERMITIDO" }));

        const lista = direcciones.map((address) => ({ address, family: isIP(address) }));

        return todas ? cb(null, lista) : cb(null, lista[0].address, lista[0].family);
      },
      (error: unknown) => cb(error instanceof Error ? (error as NodeJS.ErrnoException) : new Error("DNS")),
    );
  };
}

type Init = { method: string; headers: Record<string, string>; body: string; signal: AbortSignal };
type RespuestaHttp = { status: number; headers: IncomingMessage["headers"]; res: IncomingMessage };
export type Transporte = (opciones: RequestOptions) => ClientRequest;

/** POST HTTPS con IP fijada (lookup seguro), sin agente compartido, sin redirecciones (Node no las sigue) y con el hostname original para SNI/certificado. */
function solicitar(url: string, init: Init, resolver: Resolver, transporte: Transporte): Promise<RespuestaHttp> {
  const u = new URL(url);
  const v = validarUrlGateway(u.origin);

  // Una IP literal no pasa por `lookup` (Node la usa tal cual): la forma ya la excluye, y aquí se vuelve a comprobar.
  if (!v.ok || u.protocol !== "https:" || u.username !== "" || u.password !== "") return Promise.reject(Object.assign(new Error("DESTINO_NO_PERMITIDO"), { code: "DESTINO_NO_PERMITIDO" }));

  return new Promise<RespuestaHttp>((resolve, reject) => {
    const req = transporte({
      protocol: "https:", hostname: v.host, port: u.port === "" ? 443 : Number(u.port), path: `${u.pathname}${u.search}`, method: init.method,
      headers: { ...init.headers, "Content-Length": String(Buffer.byteLength(init.body)) },
      lookup: crearLookupSeguro(resolver) as RequestOptions["lookup"], agent: false, signal: init.signal, rejectUnauthorized: true,
    });

    req.on("response", (res) => resolve({ status: res.statusCode ?? 0, headers: res.headers, res }));
    req.on("error", reject);
    req.end(init.body);
  });
}

const MAX_RESPUESTA = 25 * 1024 * 1024;

async function leerTexto(res: IncomingMessage): Promise<string> {
  const trozos: Buffer[] = [];
  let total = 0;

  for await (const t of res) {
    const b = Buffer.isBuffer(t) ? t : Buffer.from(t as Uint8Array);

    total += b.length;
    if (total > MAX_RESPUESTA) {
      res.destroy();
      throw new Error("RESPUESTA_DEMASIADO_GRANDE");
    }
    trozos.push(b);
  }

  return Buffer.concat(trozos).toString("utf8");
}

/** fetch de producción (login, prueba, recepcion_de, consulta_de): IP fijada y validada, sin redirecciones. */
export function crearFetchSeguro(resolver: Resolver = resolverReal, transporte: Transporte = (o) => httpsRequest(o)): FetchLike {
  return async (url, init) => {
    const r = await solicitar(url, init, resolver, transporte);

    return { status: r.status, text: () => leerTexto(r.res) };
  };
}

/** fetch de producción del KuDE: mismo transporte con IP fijada; el cuerpo se expone como flujo para el límite durante la recepción. */
export function crearFetchKudeSeguro(resolver: Resolver = resolverReal, transporte: Transporte = (o) => httpsRequest(o)): KudeFetch {
  return async (url, init) => {
    const r = await solicitar(url, init, resolver, transporte);
    const it = r.res[Symbol.asyncIterator]();

    return {
      status: r.status,
      headers: { get: (n) => { const h = r.headers[n.toLowerCase()]; return Array.isArray(h) ? (h[0] ?? null) : (h ?? null); } },
      body: {
        getReader: () => ({
          read: async () => {
            const x = await it.next();

            return x.done ? { done: true } : { done: false, value: new Uint8Array(x.value as Buffer) };
          },
          cancel: async () => { r.res.destroy(); },
        }),
      },
    };
  };
}

export const fetchSeguro: FetchLike = (url, init) => crearFetchSeguro()(url, init);
export const fetchKudeSeguro: KudeFetch = (url, init) => crearFetchKudeSeguro()(url, init);
