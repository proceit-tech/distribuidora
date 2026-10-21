import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import type { FetchLike } from "@/lib/facturacion/gateway";

/**
 * URL base del gateway editable por empresa (G01 / PRO-207) y protección contra SSRF. Dos capas independientes:
 *  1. FORMA (validarUrlGateway): solo https://nombre-de-dominio[:443|:8443], sin ruta, consulta, fragmento ni credenciales; nunca IP literal (v4/v6/decimal/hex), localhost ni sufijos internos.
 *     La misma regla se repite en la función SQL de guardado (NEX-069) y al leer la fila persistida antes de transmitir (configGatewayValida).
 *  2. DESTINO al conectar (fetchSeguro): el nombre se resuelve y se rechaza si CUALQUIER dirección es privada, loopback, link-local, metadatos, CGNAT, multicast o reservada; sin redirecciones.
 * Limitación conocida: entre la resolución y la conexión TCP un DNS malicioso podría cambiar de respuesta (rebinding); se mitiga con TTL/validación en cada llamada, no con fijación de IP.
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

/** ¿Dirección IP no enrutable públicamente? (v4 y v6, incluidas las v4 mapeadas en v6). */
export function ipNoPublica(ip: string): boolean {
  const mapeada = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  const dir = mapeada ? mapeada[1] : ip;

  if (isIP(dir) === 4) {
    const [a, b, c] = dir.split(".").map(Number);

    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (isIP(dir) === 6) {
    const l = dir.toLowerCase();

    return l === "::" || l === "::1" || /^f[cd]/.test(l) || /^fe[89ab]/.test(l) || /^ff/.test(l) || /^2001:0?db8/.test(l) || /^64:ff9b/.test(l) || /^100:/.test(l);
  }

  return true;
}

type Resolver = (host: string) => Promise<string[]>;

const resolverReal: Resolver = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

/** Verifica el destino ANTES de conectar. Lanza si el nombre no resuelve o si alguna dirección no es pública. */
export async function exigirDestinoPublico(url: string, resolver: Resolver = resolverReal): Promise<void> {
  const v = validarUrlGateway(new URL(url).origin);

  if (!v.ok) throw new Error("DESTINO_NO_PERMITIDO");

  const direcciones = await resolver(v.host);

  if (direcciones.length === 0 || direcciones.some(ipNoPublica)) throw new Error("DESTINO_NO_PERMITIDO");
}

/** fetch de producción: valida el destino y NO sigue redirecciones (una 3xx nunca lleva las credenciales a otro host). */
export function crearFetchSeguro(resolver: Resolver = resolverReal, base: typeof fetch = globalThis.fetch): FetchLike {
  return async (url, init) => {
    await exigirDestinoPublico(url, resolver);

    return base(url, { ...init, redirect: "manual" });
  };
}

export const fetchSeguro: FetchLike = (url, init) => crearFetchSeguro()(url, init);
