import { createHash } from "node:crypto";

import { estadoSifenDesdeGateway, type EstadoSifen } from "@/lib/facturacion/estados";
import { fetchKudeSeguro, fetchSeguro, validarUrlGateway } from "@/lib/facturacion/gateway-url";

/**
 * Cliente del gateway de facturación electrónica (solo servidor). Contrato OBSERVADO en la especificación c1a8d63 (no inventado):
 *  · POST {base}/api/login          body {ruc, password}            → 200 {status:"success", token}
 *  · POST {base}/api/consulta_de    Bearer; {dEst,dPunExp,dNumDoc,dSerieNum,tipoDoc}
 *        → 200 {status:"success", response:{Estado, FechaRegistro, DE:{CDC, FechaFirma, FechaEnvio, Retorno:{CodRespuesta, Mensaje}, Evento[]}}}
 *        → 400 {status:"error", …"Documento no encontrado"}
 *  · /api/recepcion_de (envío), PDF/KuDE y XML: contrato NO confirmado → no se implementan aquí.
 * Las credenciales salen de variables de entorno del servidor (NEXIT_FE_<REF>_RUC / _PASSWORD); jamás de la base ni del navegador. El token y la
 * clave no se registran ni se devuelven. Todas las dependencias externas (fetch, entorno, reloj) son inyectables para probar sin red.
 */

/** empresaId forma parte de la clave del token en caché: dos empresas nunca comparten sesión del gateway, ni siquiera con la misma referencia. */
/** Referencia lógica que marca «las credenciales están en la base» (fe_gateway_config.credencial_ref). Con ella el modo es EXCLUSIVO: jamás se usan variables de entorno globales como respaldo. */
export const REF_CREDENCIALES_BASE = "NEXIT_DB";

/** `credenciales`: usuario/clave de la API guardados en la base para la empresa (PRO-133, NEX-061); si faltan se usan las variables de entorno NEXIT_FE_<REF>_*. Nunca se serializan ni se devuelven. */
export type ConfigGateway = { empresaId: string; baseUrl: string; credencialRef: string; timeoutMs: number; credenciales?: { ruc: string; password: string } };
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ status: number; text(): Promise<string> }>;
export type Dependencias = { fetch?: FetchLike; env?: Record<string, string | undefined>; ahora?: () => number };

/** Único tipoDoc de consulta observado en el contrato. Los demás tipos NO se envían hasta que se confirme su valor (no se adivina). */
const TIPO_DOC_CONSULTA: Record<string, string | undefined> = { NCE: "NCE", FE: "FE" };

export const tipoDocConsulta = (tipo: string): string | null => TIPO_DOC_CONSULTA[tipo] ?? null;

/**
 * Configuración del gateway leída de la base, VALIDADA en el servidor (la tabla ya tiene CHECK, pero el envío no confía en ello): URL https sin ruta ni credenciales
 * embebidas y tiempo de espera acotado a 1–60 s. null = configuración inutilizable (no se transmite nada).
 */
export function configGatewayValida(empresaId: string, fila: { baseUrl?: unknown; credencialRef?: unknown; timeoutMs?: unknown } | undefined): ConfigGateway | null {
  if (!fila || typeof fila.baseUrl !== "string" || typeof fila.credencialRef !== "string") return null;
  const u = validarUrlGateway(fila.baseUrl);

  // Defensa en profundidad: lo persistido debe estar ya normalizado y cumplir la misma regla que al guardar (https + dominio público, sin IP/ruta/credenciales).
  if (!u.ok || u.url !== fila.baseUrl) return null;

  const t = Number(fila.timeoutMs);

  return { empresaId, baseUrl: fila.baseUrl, credencialRef: fila.credencialRef, timeoutMs: Number.isFinite(t) ? Math.min(60000, Math.max(1000, Math.trunc(t))) : 15000 };
}

/**
 * Credenciales efectivas de la empresa. Con la referencia NEXIT_DB (UI-R01-01) SOLO valen las guardadas en la base para ESA empresa: si faltan, no hay credenciales (nunca se cae a variables de entorno
 * globales, que serían compartidas por todas las empresas). Con cualquier otra referencia (configuración anterior) se usan las variables de entorno de esa referencia.
 */
export function credencialesDe(config: ConfigGateway, env: Record<string, string | undefined> = process.env) {
  if (config.credencialRef === REF_CREDENCIALES_BASE) return config.credenciales && config.credenciales.ruc && config.credenciales.password ? config.credenciales : null;

  return config.credenciales && config.credenciales.ruc && config.credenciales.password ? config.credenciales : leerCredenciales(config.credencialRef, env);
}

export function leerCredenciales(ref: string, env: Record<string, string | undefined> = process.env) {
  if (!/^[A-Z][A-Z0-9_]{0,39}$/.test(ref) || ref === REF_CREDENCIALES_BASE) return null;

  const ruc = env[`NEXIT_FE_${ref}_RUC`]?.trim();
  const password = env[`NEXIT_FE_${ref}_PASSWORD`];

  return ruc && password ? { ruc, password } : null;
}

// ── Saneamiento de la respuesta que se guarda como evidencia ────────────────────────────────────────────────────────────────────────────────────────
const CLAVE_SECRETA = /token|password|contrase|authorization|secret|bearer|apikey|api_key/i;
const MAX_JSON = 30_000;

// Un texto libre del gateway (mensajes, errores) nunca debe llevar una credencial de sesión: se omiten «Bearer …» y los JWT aunque la clave que los contiene sea inocua.
const PATRON_SECRETO = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/g;

export const limpiarTexto = (t: string): string => t.replace(PATRON_SECRETO, "[omitido]");

/** Quita de un resultado (JSON) cualquier aparición literal de los secretos conocidos (clave y token de esta sesión), aunque el gateway los repita en un mensaje. */
export function sinSecretos<T>(valor: T, secretos: string[]): T {
  const utiles = secretos.filter((s) => s.length >= 4);

  if (utiles.length === 0) return valor;

  let texto = JSON.stringify(valor);

  for (const s of utiles) texto = texto.split(JSON.stringify(s).slice(1, -1)).join("[omitido]");

  return JSON.parse(texto) as T;
}

export function sanearRespuesta(valor: unknown, profundidad = 0): unknown {
  if (valor === null || typeof valor === "number" || typeof valor === "boolean") return valor;
  if (typeof valor === "string") return limpiarTexto(valor.length > 1000 ? `${valor.slice(0, 1000)}…` : valor);
  if (profundidad >= 6) return "…";
  if (Array.isArray(valor)) return valor.slice(0, 50).map((v) => sanearRespuesta(v, profundidad + 1));
  if (typeof valor === "object") {
    const salida: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) salida[k] = CLAVE_SECRETA.test(k) ? "[omitido]" : sanearRespuesta(v, profundidad + 1);

    return salida;
  }

  return null;
}

export function respuestaParaGuardar(cuerpo: unknown): Record<string, unknown> | null {
  if (cuerpo === undefined) return null;

  const limpio = sanearRespuesta(cuerpo);

  return JSON.stringify(limpio).length > MAX_JSON ? { truncado: true } : (limpio as Record<string, unknown>);
}

// ── Interpretación de la respuesta de consulta (pura) ──────────────────────────────────────────────────────────────────────────────────────────────
export type ResultadoConsulta = {
  resultado: "OK" | "NO_ENCONTRADO" | "ERROR_HTTP" | "TIMEOUT" | "RED" | "RESPUESTA_INVALIDA";
  http: number | null;
  estadoGateway: string | null;
  estadoSifen: EstadoSifen | null;
  cdc: string | null;
  codRespuesta: string | null;
  mensaje: string | null;
  fechaFirma: string | null;
  fechaEnvio: string | null;
  respuesta: Record<string, unknown> | null;
};

const vacio = (resultado: ResultadoConsulta["resultado"], http: number | null, mensaje: string | null): ResultadoConsulta => ({
  resultado, http, estadoGateway: null, estadoSifen: null, cdc: null, codRespuesta: null, mensaje, fechaFirma: null, fechaEnvio: null, respuesta: null,
});

const texto = (v: unknown, max = 500): string | null => {
  const t = typeof v === "string" && v.trim() ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : null;

  return t === null ? null : limpiarTexto(t);
};
const registro = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** No asume que todas las respuestas tienen la misma forma: lo que no esté presente queda en null y lo no interpretable es RESPUESTA_INVALIDA. */
export function interpretarConsulta(http: number, cuerpoTexto: string): ResultadoConsulta {
  let cuerpo: unknown;

  try {
    cuerpo = JSON.parse(cuerpoTexto);
  } catch {
    return vacio(http >= 400 ? "ERROR_HTTP" : "RESPUESTA_INVALIDA", http, "La respuesta del gateway no es JSON.");
  }

  const raiz = registro(cuerpo);
  const guardada = respuestaParaGuardar(cuerpo);

  if (!raiz) return { ...vacio("RESPUESTA_INVALIDA", http, "La respuesta del gateway no tiene la forma esperada."), respuesta: guardada };

  // «Documento no encontrado» no es un rechazo fiscal: el gateway no conoce ese documento (o aún no lo recibió).
  if (http >= 400 && /documento no encontrado/i.test(JSON.stringify(raiz))) {
    return { ...vacio("NO_ENCONTRADO", http, texto(raiz.message) ?? texto(raiz.mensaje) ?? "Documento no encontrado."), respuesta: guardada };
  }
  if (http >= 400) return { ...vacio("ERROR_HTTP", http, texto(raiz.message) ?? texto(raiz.mensaje) ?? `El gateway respondió HTTP ${http}.`), respuesta: guardada };

  const respuesta = registro(raiz.response);
  const estado = respuesta ? texto(respuesta.Estado, 120) : null;

  if (http !== 200 || raiz.status !== "success" || !respuesta || !estado) {
    return { ...vacio("RESPUESTA_INVALIDA", http, "La respuesta del gateway no incluye el estado del documento."), respuesta: guardada };
  }

  const de = registro(respuesta.DE);
  const retorno = de ? registro(de.Retorno) : null;
  const cdc = de ? texto(de.CDC, 60) : null;

  return {
    resultado: "OK",
    http,
    estadoGateway: estado,
    estadoSifen: estadoSifenDesdeGateway(estado),
    cdc: cdc && /^\d{44}$/.test(cdc) ? cdc : null,
    codRespuesta: retorno ? texto(retorno.CodRespuesta, 20) : null,
    mensaje: retorno ? texto(retorno.Mensaje) : null,
    fechaFirma: de ? texto(de.FechaFirma, 60) : null,
    fechaEnvio: de ? texto(de.FechaEnvio, 60) : null,
    respuesta: guardada,
  };
}

// ── Transporte ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
type Respuesta = { ok: true; status: number; texto: string } | { ok: false; motivo: "TIMEOUT" | "RED" };

async function enviar(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number, fetchFn: FetchLike): Promise<Respuesta> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), timeoutMs);

  try {
    const r = await fetchFn(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", ...headers }, body: JSON.stringify(body), signal: control.signal });

    return { ok: true, status: r.status, texto: await r.text() };
  } catch (error) {
    return { ok: false, motivo: control.signal.aborted || (error instanceof Error && error.name === "AbortError") ? "TIMEOUT" : "RED" };
  } finally {
    clearTimeout(timer);
  }
}

// El token se cachea en memoria por EMPRESA + gateway + referencia + huella de las credenciales (SHA-256 de ruc:clave, nunca la clave): cambiar la
// clave o el RUC invalida el token anterior y ninguna empresa puede reutilizar el de otra. Vence con el `exp` del JWT (si lo trae) o a los 10 minutos;
// ante un 401 se renueva una vez. Tamaño acotado (las entradas vencidas se descartan primero, luego la más antigua).
const cacheTokens = new Map<string, { token: string; vence: number }>();
const MAX_TOKENS = 200;

export const claveToken = (config: ConfigGateway, ruc: string, password: string) =>
  [config.empresaId, config.baseUrl, config.credencialRef, createHash("sha256").update(`${ruc}:${password}`).digest("hex")].join("|");

function guardarToken(clave: string, token: string, vence: number, ahora: number) {
  if (cacheTokens.size >= MAX_TOKENS) {
    for (const [k, v] of cacheTokens) if (v.vence <= ahora) cacheTokens.delete(k);
    if (cacheTokens.size >= MAX_TOKENS) cacheTokens.delete(cacheTokens.keys().next().value as string);
  }
  cacheTokens.set(clave, { token, vence });
}

export const tamanoCacheTokens = () => cacheTokens.size;

export const limpiarCacheTokens = () => cacheTokens.clear();

/** Descarta los tokens en caché de UNA empresa (al cambiar sus credenciales). La clave de caché incluye además la huella de las credenciales, así que otra instancia tampoco reutiliza un token viejo. */
export function invalidarTokensEmpresa(empresaId: string): number {
  let n = 0;

  for (const k of [...cacheTokens.keys()]) {
    if (k.startsWith(`${empresaId}|`)) {
      cacheTokens.delete(k);
      n += 1;
    }
  }

  return n;
}

function venceToken(token: string, ahora: number) {
  try {
    const exp = Number((JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { exp?: unknown }).exp);

    if (Number.isFinite(exp) && exp > 0) return exp * 1000 - 60_000;
  } catch {
    // sin exp legible: TTL por defecto
  }

  return ahora + 600_000;
}

type ErrorLogin = { error: true; resultado: "ERROR_HTTP" | "TIMEOUT" | "RED"; http: number | null; mensaje: string };

async function obtenerToken(config: ConfigGateway, ruc: string, password: string, d: Required<Pick<Dependencias, "fetch" | "ahora">>, forzar: boolean): Promise<string | ErrorLogin> {
  const clave = claveToken(config, ruc, password);
  const guardado = cacheTokens.get(clave);

  if (!forzar && guardado && guardado.vence > d.ahora()) return guardado.token;

  const r = await enviar(`${config.baseUrl}/api/login`, {}, { ruc, password }, config.timeoutMs, d.fetch);

  if (!r.ok) return { error: true, resultado: r.motivo, http: null, mensaje: r.motivo === "TIMEOUT" ? "Tiempo de espera agotado al autenticar con el gateway." : "No fue posible comunicarse con el gateway." };

  let token: string | null = null;

  try {
    const j = JSON.parse(r.texto) as { status?: unknown; token?: unknown };

    if (r.status === 200 && j.status === "success" && typeof j.token === "string" && j.token) token = j.token;
  } catch {
    // respuesta no JSON: queda como fallo de autenticación
  }
  if (!token) return { error: true, resultado: "ERROR_HTTP", http: r.status, mensaje: "El gateway rechazó la autenticación (credenciales de la empresa)." };

  guardarToken(clave, token, venceToken(token, d.ahora()), d.ahora());

  return token;
}

export type EstadoPrueba = "OK" | "CREDENCIALES_INVALIDAS" | "NO_DISPONIBLE" | "TIMEOUT";

/**
 * «Probar conexión» (PRO-133): UNA autenticación POST /api/login con las credenciales dadas y NADA más (no consulta ni recibe documentos, no reserva numeración). Devuelve solo una categoría:
 * el token y la clave jamás salen de aquí (ni se guardan en la caché: es una prueba). 200 + {status:"success", token} = OK; 4xx = credenciales rechazadas; red/5xx/otros = no disponible; tiempo agotado = timeout.
 */
export async function probarLoginGateway(config: { baseUrl: string; timeoutMs: number }, ruc: string, password: string, dep: Pick<Dependencias, "fetch"> = {}): Promise<{ estado: EstadoPrueba; http: number | null }> {
  const r = await enviar(`${config.baseUrl}/api/login`, {}, { ruc, password }, config.timeoutMs, dep.fetch ?? fetchSeguro);

  if (!r.ok) return { estado: r.motivo === "TIMEOUT" ? "TIMEOUT" : "NO_DISPONIBLE", http: null };

  try {
    const j = JSON.parse(r.texto) as { status?: unknown; token?: unknown };

    if (r.status === 200 && j.status === "success" && typeof j.token === "string" && j.token) return { estado: "OK", http: r.status };
  } catch {
    // respuesta no JSON
  }

  return { estado: r.status >= 400 && r.status < 500 && r.status !== 404 && r.status !== 408 && r.status !== 429 ? "CREDENCIALES_INVALIDAS" : "NO_DISPONIBLE", http: r.status };
}

/** «Token inválido/vencido» informado por el gateway aunque venga con HTTP 400: es un error de AUTORIZACIÓN (nada se procesó), no un rechazo del documento. */
export function esTokenInvalido(http: number, cuerpoTexto: string): boolean {
  if (http === 401) return true;
  if (http < 400 || http >= 500) return false;

  try {
    const c = JSON.parse(cuerpoTexto) as Record<string, unknown>;

    return typeof c?.message === "string" && /token\s+(inv[aá]lid|vencid|expirad|no\s+v[aá]lid)|invalid\s+token|token\s+(is\s+)?(invalid|expired)/i.test(c.message);
  } catch {
    return false;
  }
}

export type DocumentoConsulta = { tipo: string; establecimiento: string; puntoExpedicion: string; numero: string; serie: string | null };

/** Consulta el estado de UN documento. No lanza por fallos del gateway: devuelve el resultado para que quede como evidencia. */
export async function consultarDocumentoGateway(config: ConfigGateway, doc: DocumentoConsulta, dep: Dependencias = {}): Promise<ResultadoConsulta | { sinContrato: "TIPO" | "CREDENCIALES" }> {
  const tipoDoc = tipoDocConsulta(doc.tipo);

  if (!tipoDoc) return { sinContrato: "TIPO" };

  const credenciales = credencialesDe(config, dep.env);

  if (!credenciales) return { sinContrato: "CREDENCIALES" };

  const d = { fetch: dep.fetch ?? fetchSeguro, ahora: dep.ahora ?? Date.now };
  const cuerpo = { dEst: doc.establecimiento, dPunExp: doc.puntoExpedicion, dNumDoc: doc.numero, dSerieNum: doc.serie, tipoDoc };

  for (const forzar of [false, true]) {
    const token = await obtenerToken(config, credenciales.ruc, credenciales.password, d, forzar);

    if (typeof token !== "string") return vacio(token.resultado, token.http, token.mensaje);

    const r = await enviar(`${config.baseUrl}/api/consulta_de`, { Authorization: `Bearer ${token}` }, cuerpo, config.timeoutMs, d.fetch);

    if (!r.ok) return vacio(r.motivo, null, r.motivo === "TIMEOUT" ? "Tiempo de espera agotado al consultar el gateway." : "No fue posible comunicarse con el gateway.");
    // Token vencido o revocado: se renueva UNA vez y se reintenta (la consulta es de solo lectura, no duplica nada).
    if (esTokenInvalido(r.status, r.texto) && !forzar) continue;

    return sinSecretos(interpretarConsulta(r.status, r.texto), [credenciales.password, token]);
  }

  return vacio("ERROR_HTTP", 401, "El gateway rechazó el token tras renovarlo.");
}

// ── Envío (recepcion_de) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Contrato CONFIRMADO (fbc691b): POST {base}/api/recepcion_de con Bearer y el JSON de la FE. Respuestas reales del proveedor:
//  · Recepción: {status:"success", message, nro_lote} → «ENVIADO» (el gateway recibió el documento; sin CDC, que NO se fabrica; NO es aprobación SIFEN).
//    Sigue indeterminado si no hay lote, CDC ni número, si el lote excede 60 caracteres o si hay identificadores que contradicen al documento.
//  · Rechazo: {status:"error", rechazados, response:{Aceptados[], Rechazados:[{"EEE-PPP-NNNNNNN":{campo:mensaje}}]}} → ERROR_ENVIO/RECHAZO solo si
//    Rechazados identifica ESTE documento por su número fiscal (nunca se atribuye el error de otro); si no, indeterminado.
//  · «Token inválido» (incluso con HTTP 400) es AUTORIZACIÓN: se renueva la sesión UNA vez; si persiste, ERROR_ENVIO/AUTENTICACION (no es rechazo).
//  · Un CDC coherente o el eco de dEst/dPunExp/dNumDoc también certifican la recepción. 4xx ambiguos (408/409/423/425, duplicados), 5xx, timeout,
//    red y respuesta ilegible → ENVIO_INDETERMINADO.
// Un HTTP 2xx significa «el gateway respondió», NUNCA «aprobado por SIFEN»: estado_sifen solo lo fija la consulta de estado.

export type EstadoLocalEnvio = "ENVIADO" | "ERROR_ENVIO" | "ENVIO_INDETERMINADO";
/** Causa de un ERROR_ENVIO: define si el reenvío es seguro (AUTENTICACION/TRANSITORIO) o exige confirmación explícita (RECHAZO). */
export type ErrorTipoEnvio = "AUTENTICACION" | "RECHAZO" | "TRANSITORIO";
export type FaseEnvio = { fase: "AUTENTICACION" | "TRANSMISION" | "RESPUESTA"; ok: boolean; detalle: string; http?: number | null };
export type DocumentoRecepcion = { tipo: string; establecimiento: string; puntoExpedicion: string; numero: string };

export type ResultadoEnvio = {
  resultado: "OK" | "ERROR_HTTP" | "TIMEOUT" | "RED" | "RESPUESTA_INVALIDA";
  /** Fase en la que terminó el intento (para el historial). */
  faseFinal: "AUTENTICACION" | "TRANSMISION";
  estadoLocal: EstadoLocalEnvio;
  /** Solo con ERROR_ENVIO. */
  errorTipo: ErrorTipoEnvio | null;
  http: number | null;
  mensaje: string | null;
  lote: string | null;
  /** CDC coherente con el documento (el único que se guarda en el documento). */
  cdc: string | null;
  /** CDC tal como lo informó el gateway (44 dígitos), coherente o no: queda como evidencia del intento. */
  cdcInformado: string | null;
  estadoGateway: string | null;
  errores: string[];
  respuesta: Record<string, unknown> | null;
  fases: FaseEnvio[];
};

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");
const CLAVES_LOTE = new Set(["lote", "nrolote", "numerolote", "nrodelote", "numerodelote"]);
const CLAVES_RESPUESTA = new Set(["response"]);
const CLAVES_ERRORES = new Set(["errors", "errores", "validaciones", "validationerrors", "erroresvalidacion"]);
const CLAVES_MENSAJE = new Set(["message", "mensaje", "msg"]);
const CLAVES_CDC = new Set(["cdc"]);
const CLAVES_ESTADO = new Set(["estado"]);
const DUPLICADO = /duplicad|ya existe|ya fue|already|exist[ea]|registrad[oa] previamente|repetid/i;
const CODIGO_TIPO: Record<string, string> = { FE: "01", AFE: "04", NCE: "05", NDE: "06", NRE: "07" };

/** Mismo criterio que fe_cdc_coherente (SQL): tipo de DE y posiciones de establecimiento, punto y número (MT v150 §10.1). */
export function cdcCoherente(doc: DocumentoRecepcion, cdc: string): boolean {
  return /^\d{44}$/.test(cdc) && cdc.slice(0, 2) === CODIGO_TIPO[doc.tipo] && cdc.slice(11, 14) === doc.establecimiento && cdc.slice(14, 17) === doc.puntoExpedicion && cdc.slice(17, 24) === doc.numero;
}

function buscar(v: unknown, claves: Set<string>, profundidad = 0): unknown {
  if (profundidad > 5 || v === null || typeof v !== "object") return undefined;
  if (Array.isArray(v)) {
    for (const x of v.slice(0, 20)) {
      const r = buscar(x, claves, profundidad + 1);

      if (r !== undefined) return r;
    }

    return undefined;
  }
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (claves.has(norm(k)) && x !== null && x !== undefined && x !== "") return x;
  for (const x of Object.values(v as Record<string, unknown>)) {
    const r = buscar(x, claves, profundidad + 1);

    if (r !== undefined) return r;
  }

  return undefined;
}

const comoTexto = (v: unknown, max = 300): string | null => {
  const t = typeof v === "string" && v.trim() ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : null;

  return t === null ? null : limpiarTexto(t);
};

function listaErrores(v: unknown): string[] {
  if (v === undefined || v === null) return [];

  const items = Array.isArray(v) ? v : typeof v === "object" ? Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${typeof x === "string" ? x : JSON.stringify(sanearRespuesta(x))}`) : [v];

  return items.slice(0, 20).map((x) => limpiarTexto(typeof x === "string" ? x.slice(0, 300) : JSON.stringify(sanearRespuesta(x)).slice(0, 300)));
}

/** Una entrada de Rechazados/Aceptados: objeto {"EEE-PPP-NNNNNNN": {campo: mensaje}} (o con el número como texto). */
function entradasPorNumero(lista: unknown): { numero: string; detalle: unknown }[] {
  if (!Array.isArray(lista)) return [];

  const out: { numero: string; detalle: unknown }[] = [];

  for (const it of lista.slice(0, 50)) {
    if (typeof it === "string") out.push({ numero: it.trim(), detalle: null });
    else if (it && typeof it === "object") for (const [k, v] of Object.entries(it as Record<string, unknown>)) out.push({ numero: k.trim(), detalle: v });
  }

  return out;
}

/**
 * La evidencia guardada de un envío no conserva los datos de OTROS documentos que el gateway mencione en Aceptados/Rechazados (mensajes de terceros): solo la entrada del
 * documento propio y el conteo de las ajenas. Sin número propio se descartan todas las entradas (solo el conteo).
 */
function redactarAjenos(cuerpo: unknown, numeroFiscal: string | null): unknown {
  const raiz = registro(cuerpo);
  const resp = raiz ? registro(raiz.response) : null;

  if (!raiz || !resp) return cuerpo;

  const nueva: Record<string, unknown> = { ...resp };
  let ajenos = 0;

  for (const [k, v] of Object.entries(resp)) {
    if (!["aceptados", "rechazados"].includes(norm(k)) || !Array.isArray(v)) continue;

    const propias: unknown[] = [];

    for (const it of v) {
      const nombres = typeof it === "string" ? [it.trim()] : it && typeof it === "object" ? Object.keys(it as Record<string, unknown>).map((x) => x.trim()) : [];

      if (numeroFiscal !== null && nombres.length > 0 && nombres.every((n) => n === numeroFiscal)) propias.push(it);
      else ajenos++;
    }
    nueva[k] = propias;
  }
  if (ajenos > 0) nueva.OtrosDocumentosOmitidos = ajenos;

  return { ...raiz, response: nueva };
}

const textoCampo = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(sanearRespuesta(v)));

/** «NNN-NNN-NNNNNNN: campo — mensaje» por cada validación fallida de UN documento. */
function erroresDeEntrada(e: { numero: string; detalle: unknown }): string[] {
  const d = e.detalle;

  if (d && typeof d === "object" && !Array.isArray(d)) return Object.entries(d as Record<string, unknown>).slice(0, 40).map(([campo, msg]) => limpiarTexto(`${e.numero} · ${campo}: ${textoCampo(msg)}`.slice(0, 300)));
  if (Array.isArray(d)) return d.slice(0, 40).map((m) => limpiarTexto(`${e.numero}: ${textoCampo(m)}`.slice(0, 300)));

  return [limpiarTexto(d === null || d === undefined ? `${e.numero}: rechazado por el gateway` : `${e.numero}: ${textoCampo(d)}`.slice(0, 300))];
}

const resultadoEnvioVacio = (
  resultado: ResultadoEnvio["resultado"], faseFinal: ResultadoEnvio["faseFinal"], estadoLocal: EstadoLocalEnvio, errorTipo: ErrorTipoEnvio | null, http: number | null, mensaje: string | null, fases: FaseEnvio[],
): ResultadoEnvio => ({ resultado, faseFinal, estadoLocal, errorTipo: estadoLocal === "ERROR_ENVIO" ? errorTipo : null, http, mensaje, lote: null, cdc: null, cdcInformado: null, estadoGateway: null, errores: [], respuesta: null, fases });

/**
 * Interpreta la respuesta de recepcion_de sin suponer su forma (ver la política conservadora arriba). `doc` identifica el documento enviado; sin él ninguna
 * respuesta puede certificar la recepción.
 */
export function interpretarRecepcion(http: number, cuerpoTexto: string, fases: FaseEnvio[] = [], doc?: DocumentoRecepcion): ResultadoEnvio {
  let cuerpo: unknown;

  try {
    cuerpo = JSON.parse(cuerpoTexto);
  } catch {
    cuerpo = undefined;
  }

  const raiz = cuerpo && typeof cuerpo === "object" && !Array.isArray(cuerpo) ? (cuerpo as Record<string, unknown>) : null;
  const cdcTexto = raiz ? comoTexto(buscar(raiz, CLAVES_CDC), 60) : null;
  const cdcInformado = cdcTexto && /^\d{44}$/.test(cdcTexto) ? cdcTexto : null;
  const mensaje = raiz ? comoTexto(buscar(raiz, CLAVES_MENSAJE)) : null;
  const resp = raiz ? Object.entries(raiz).find(([k, v]) => CLAVES_RESPUESTA.has(norm(k)) && v && typeof v === "object" && !Array.isArray(v))?.[1] as Record<string, unknown> | undefined : undefined;
  const lista = (nombre: string) => entradasPorNumero(resp ? Object.entries(resp).find(([k]) => norm(k) === nombre)?.[1] : undefined);
  const rechazados = lista("rechazados");
  const aceptados = lista("aceptados");
  const numeroFiscal = doc ? `${doc.establecimiento}-${doc.puntoExpedicion}-${doc.numero}` : null;
  const propio = rechazados.find((e) => e.numero === numeroFiscal);
  const loteBruto = raiz ? buscar(raiz, CLAVES_LOTE) : undefined;
  const loteTexto = typeof loteBruto === "string" || typeof loteBruto === "number" ? String(loteBruto).trim() : "";
  const loteValido = loteTexto !== "" && loteTexto.length <= 60 ? loteTexto : null;
  const errores = propio && !aceptados.some((e) => e.numero === numeroFiscal) ? erroresDeEntrada(propio) : raiz ? listaErrores(buscar(raiz, CLAVES_ERRORES)) : [];
  const duplicado = DUPLICADO.test([mensaje ?? "", ...errores].join(" "));
  const base = (r: ResultadoEnvio["resultado"], estado: EstadoLocalEnvio, errorTipo: ErrorTipoEnvio | null, texto: string | null): ResultadoEnvio => ({
    ...resultadoEnvioVacio(r, "TRANSMISION", estado, errorTipo, http, texto, fases),
    respuesta: cuerpo === undefined ? null : respuestaParaGuardar(redactarAjenos(cuerpo, numeroFiscal)),
    lote: loteValido,
    cdcInformado,
    estadoGateway: raiz ? comoTexto(buscar(raiz, CLAVES_ESTADO), 120) : null,
    errores,
  });
  const indeterminado = (texto: string, r: ResultadoEnvio["resultado"] = "RESPUESTA_INVALIDA") => base(r, "ENVIO_INDETERMINADO", null, texto);
  // INT-01: una NCE solo se da por RECHAZADA (y libera su saldo) cuando Rechazados la identifica por su propio número fiscal (línea de arriba). Un 4xx genérico o un status:error sin esa identidad
  // NO prueba que el gateway rechazó ESTA nota: queda indeterminada (bloquea el saldo y no se reenvía). La factura conserva su política anterior.
  const esNce = doc?.tipo === "NCE";
  const textoSinIdentidad = (t: string) => `${t} No identifica de forma inequívoca esta nota de crédito: verifique en el gateway antes de reemitir.`;

  // Token inválido/vencido (incluso con HTTP 400): error de AUTORIZACIÓN; el gateway no procesó nada, no es un rechazo del documento.
  if (esTokenInvalido(http, cuerpoTexto)) return base("ERROR_HTTP", "ERROR_ENVIO", "AUTENTICACION", mensaje ?? "El gateway rechazó la autorización (token inválido).");
  if (http < 500 && (rechazados.length > 0 || (raiz && Number(raiz.rechazados) > 0))) {
    // Rechazo por validación: solo se atribuye al documento si Rechazados lo identifica por su número fiscal (nunca el error de otro documento).
    if (propio && !aceptados.some((e) => e.numero === numeroFiscal) && !duplicado) return base("ERROR_HTTP", "ERROR_ENVIO", "RECHAZO", mensaje ?? "El gateway rechazó el documento por validación.");

    return indeterminado("El gateway informó rechazos que no identifican de forma inequívoca este documento: verifique en el gateway antes de reenviar.", "ERROR_HTTP");
  }
  if (http >= 500) return indeterminado(mensaje ?? `El gateway respondió HTTP ${http}.`, "ERROR_HTTP");
  if (http >= 400) {
    // Ambiguos: pudo haberse procesado o ya existir (posible duplicidad) → nunca reintentable sin verificar.
    if ([408, 409, 423, 425].includes(http) || duplicado) return indeterminado(mensaje ?? `El gateway respondió HTTP ${http}: el documento pudo haberse procesado o ya existir.`, "ERROR_HTTP");
    if (http === 401 || http === 403) return base("ERROR_HTTP", "ERROR_ENVIO", "AUTENTICACION", mensaje ?? `El gateway rechazó la autorización (HTTP ${http}).`);
    if (http === 429) return base("ERROR_HTTP", "ERROR_ENVIO", "TRANSITORIO", mensaje ?? "El gateway limitó la frecuencia de solicitudes (HTTP 429).");

    if (esNce) return indeterminado(textoSinIdentidad(mensaje ?? `El gateway respondió HTTP ${http}.`), "ERROR_HTTP");

    return base("ERROR_HTTP", "ERROR_ENVIO", "RECHAZO", mensaje ?? `El gateway rechazó la solicitud (HTTP ${http}).`);
  }
  if (http >= 200 && http < 300 && raiz) {
    if (raiz.status === "error") {
      if (esNce && !duplicado) return indeterminado(textoSinIdentidad(mensaje ?? "El gateway informó un error."), "ERROR_HTTP");

      return duplicado ? indeterminado(mensaje ?? "El gateway informó un error de duplicidad.", "ERROR_HTTP") : base("ERROR_HTTP", "ERROR_ENVIO", "RECHAZO", mensaje ?? "El gateway informó un error.");
    }
    if (raiz.status === "success") {
      const eco = { est: comoTexto(buscar(raiz, new Set(["dest"])), 10), pun: comoTexto(buscar(raiz, new Set(["dpunexp"])), 10), num: comoTexto(buscar(raiz, new Set(["dnumdoc"])), 10) };
      const hayEco = eco.est !== null || eco.pun !== null || eco.num !== null;
      const ecoOk = doc !== undefined && eco.est === doc.establecimiento && eco.pun === doc.puntoExpedicion && eco.num === doc.numero;

      if (doc && cdcInformado && !cdcCoherente(doc, cdcInformado)) return indeterminado("El CDC informado por el gateway no corresponde al documento enviado: verifique en el gateway antes de reenviar.");
      if (doc && hayEco && !ecoOk) return indeterminado("El número de documento devuelto por el gateway no coincide con el enviado: verifique en el gateway antes de reenviar.");
      const ajenos = aceptados.filter((e) => /^\d{3}-\d{3}-\d{7}$/.test(e.numero));

      if (doc && ajenos.length > 0 && !ajenos.some((e) => e.numero === numeroFiscal)) return indeterminado("El gateway aceptó documentos que no incluyen este número: verifique en el gateway antes de reenviar.");
      if (doc && loteTexto.length > 60) return indeterminado("El número de lote informado por el gateway excede el largo admitido: verifique en el gateway antes de reenviar.");
      // Contrato confirmado: success + nro_lote no vacío = recepción del documento por el gateway (sin CDC). No es aprobación SIFEN.
      if (doc && loteValido) return { ...base("OK", "ENVIADO", null, mensaje), cdc: cdcInformado };
      if (doc && ((cdcInformado && cdcCoherente(doc, cdcInformado)) || ecoOk)) return { ...base("OK", "ENVIADO", null, mensaje), cdc: cdcInformado };

      return indeterminado("El gateway respondió sin identificar el documento recibido (sin lote, CDC ni número): no se confirma la recepción; verifique en el gateway antes de reenviar.");
    }
  }

  return indeterminado("La respuesta del gateway no se pudo interpretar; el documento pudo haber sido recibido.");
}

/**
 * Autentica y transmite UN documento ya reservado y persistido. No lanza por fallos del gateway: devuelve el resultado y las fases para el registro y
 * el modal técnico. Sin credenciales no se llama a nadie. El 401 de recepcion_de (token vencido) se renueva UNA vez: un 401 no procesó nada.
 */
export async function enviarDocumentoGateway(
  config: ConfigGateway, payload: Record<string, unknown>, doc: DocumentoRecepcion, dep: Dependencias = {},
): Promise<ResultadoEnvio | { sinContrato: "CREDENCIALES" }> {
  const credenciales = credencialesDe(config, dep.env);

  if (!credenciales) return { sinContrato: "CREDENCIALES" };

  const d = { fetch: dep.fetch ?? fetchSeguro, ahora: dep.ahora ?? Date.now };
  const fases: FaseEnvio[] = [];

  for (const forzar of [false, true]) {
    const token = await obtenerToken(config, credenciales.ruc, credenciales.password, d, forzar);

    if (typeof token !== "string") {
      fases.push({ fase: "AUTENTICACION", ok: false, detalle: token.mensaje, http: token.http });

      // Nada se transmitió: es seguro reintentar más tarde.
      return resultadoEnvioVacio(token.resultado, "AUTENTICACION", "ERROR_ENVIO", "AUTENTICACION", token.http, token.mensaje, fases);
    }
    fases.push({ fase: "AUTENTICACION", ok: true, detalle: forzar ? "Sesión renovada con el gateway." : "Autenticación obtenida." });

    const r = await enviar(`${config.baseUrl}/api/recepcion_de`, { Authorization: `Bearer ${token}` }, payload, config.timeoutMs, d.fetch);

    if (!r.ok) {
      const m = r.motivo === "TIMEOUT" ? "Tiempo de espera agotado: el gateway pudo haber recibido el documento." : "Error de red durante la transmisión: el gateway pudo haber recibido el documento.";

      fases.push({ fase: "TRANSMISION", ok: false, detalle: m });

      return resultadoEnvioVacio(r.motivo, "TRANSMISION", "ENVIO_INDETERMINADO", null, null, m, fases);
    }
    if (esTokenInvalido(r.status, r.texto) && !forzar) {
      fases.push({ fase: "TRANSMISION", ok: false, detalle: `Token rechazado (HTTP ${r.status}); se renueva la sesión.`, http: r.status });
      continue;
    }

    fases.push({ fase: "TRANSMISION", ok: true, detalle: "Solicitud transmitida.", http: r.status });

    const res = interpretarRecepcion(r.status, r.texto, fases, doc);
    const detalle = res.estadoLocal === "ENVIADO"
      ? "El gateway confirmó la recepción del documento. El estado fiscal (SIFEN) aún no está confirmado."
      : res.estadoLocal === "ENVIO_INDETERMINADO" ? `Recepción NO confirmada: ${res.mensaje ?? "respuesta no concluyente"}` : (res.mensaje ?? "Respuesta del gateway");

    fases.push({ fase: "RESPUESTA", ok: res.estadoLocal === "ENVIADO", detalle, http: r.status });

    return sinSecretos(res, [credenciales.password, token]);
  }

  return resultadoEnvioVacio("ERROR_HTTP", "AUTENTICACION", "ERROR_ENVIO", "AUTENTICACION", 401, "El gateway rechazó el token tras renovarlo.", fases);
}

// ── KuDE (PDF) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Contrato CONFIRMADO por el responsable (PRO-194 / E08): POST {base}/api/kude con Bearer y FE: {dEst, dPunExp, dNumDoc, dSerieNum, tipoDoc:"FE"}; NCE: {tipOpe:"4", …, tipoDoc:"ncr"} (ver cuerpoKudeGateway) → HTTP 200, JSON {status:"success", kude:<PDF en Base64, «JVBER…»>}.
// PRO-326: el KuDE se pide por la identidad del documento (tipo, establecimiento, punto, número, serie); el CDC NO participa: no se exige en la respuesta, no se compara y, si llega, se ignora y no se guarda.
// Se exige status «success», Base64 estricto y un PDF íntegro («%PDF-» … «%%EOF», ≤ 10 MB). Nada se guarda (ni Base64 ni PDF) y los errores no incluyen el CDC ni el contenido. No se sigue ninguna URL.
export const MAX_KUDE_BYTES = 10 * 1024 * 1024;
const MAX_KUDE_JSON = Math.ceil((MAX_KUDE_BYTES * 4) / 3) + 8192;
export type CuerpoLegible = { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(motivo?: unknown): Promise<void> } };
export type KudeFetch = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ status: number; headers: { get(nombre: string): string | null }; body: CuerpoLegible | null }>;
export type DependenciasKude = { fetch?: FetchLike; fetchKude?: KudeFetch; env?: Record<string, string | undefined>; ahora?: () => number };
/** Identidad del documento para el KuDE (FE o NCE). Sin CDC (PRO-326): ni el persistido ni el devuelto condicionan el PDF. */
export type DocumentoKude = { tipoDoc: "FE" | "NCE"; establecimiento: string; puntoExpedicion: string; numero: string; serie: string | null };
export type CodigoErrorKude = "SIN_CREDENCIALES" | "AUTENTICACION" | "TIMEOUT" | "NO_DISPONIBLE" | "NO_ENCONTRADO" | "FORMATO_NO_CONFIRMADO" | "PDF_INVALIDO" | "DEMASIADO_GRANDE" | "SOLICITUD_RECHAZADA" | "PROHIBIDO" | "REDIRECCION";
/**
 * ÚNICA transformación del documento interno al contrato EXTERNO de POST /api/kude (confirmado con HTTP 200 en Postman). El tipo interno (FE/NCE) no cambia; solo la solicitud al gateway:
 *  · FE  → {dEst, dPunExp, dNumDoc, dSerieNum, tipoDoc: "FE"} (cinco campos, sin tipOpe).
 *  · NCE → {tipOpe: "4", dEst, dPunExp, dNumDoc, dSerieNum, tipoDoc: "ncr"} (seis campos; «ncr» en minúsculas; NUNCA «NCE»).
 * Los identificadores se transmiten como texto (ceros iniciales intactos) y la serie nula como null.
 */
export function cuerpoKudeGateway(doc: DocumentoKude): Record<string, string | null> {
  const id = { dEst: doc.establecimiento, dPunExp: doc.puntoExpedicion, dNumDoc: doc.numero, dSerieNum: doc.serie };

  return doc.tipoDoc === "NCE" ? { tipOpe: "4", ...id, tipoDoc: "ncr" } : { ...id, tipoDoc: "FE" };
}

export type ResultadoKude = { ok: true; pdf: Buffer } | { ok: false; codigo: CodigoErrorKude; http: number | null; mensaje: string };

/**
 * Resumen SEGURO de lo que respondió el gateway ante un error (para el diagnóstico del operador): solo el texto del campo message/mensaje/error de un JSON, sin CDC (44 dígitos), sin cadenas largas tipo
 * Base64/JWT, sin caracteres de control y acotado a 160 caracteres. Nunca devuelve el cuerpo crudo, credenciales ni tokens.
 */
export function resumenUpstreamSeguro(cuerpoTexto: string | null): string {
  if (!cuerpoTexto) return "";

  let m = "";

  try {
    const j = JSON.parse(cuerpoTexto) as Record<string, unknown>;
    const v = [j?.message, j?.mensaje, j?.error, j?.msg].find((x) => typeof x === "string" && x.trim() !== "");

    m = typeof v === "string" ? v : "";
  } catch {
    m = "";
  }

  return m
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\d{44}/g, "[CDC]")
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[…]")
    .replace(/[A-Za-z0-9+/=]{60,}/g, "[…]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

const falloKude = (codigo: CodigoErrorKude, http: number | null, mensaje: string): ResultadoKude => ({ ok: false, codigo, http, mensaje });
const MSG_INVALIDO = "El KuDE de este documento no está disponible: el gateway no devolvió un PDF válido (fue descartado).";

/** ¿Son bytes de un PDF completo? Cabecera «%PDF-» y marca «%%EOF» en el último kilobyte. */
export function esPdfValido(b: Buffer): boolean {
  return b.length > 8 && b.subarray(0, 5).toString("latin1") === "%PDF-" && b.subarray(Math.max(0, b.length - 1024)).toString("latin1").includes("%%EOF");
}

/** Decodifica Base64 ESTÁNDAR estricto (sin prefijo data:, sin caracteres ajenos, relleno correcto). Devuelve null si no es válido o está vacío. */
export function decodificarBase64Estricto(texto: string): Buffer | null {
  const limpio = texto.replace(/[\r\n]/g, "");

  if (limpio.length < 8 || limpio.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(limpio)) return null;

  const b = Buffer.from(limpio, "base64");

  return b.length > 0 ? b : null;
}

/**
 * Interpreta la respuesta de /api/kude {status, kude(Base64)} del documento solicitado por su identidad. PRO-326: no se exige estado fiscal ni CDC; un CDC/cdc en la respuesta se ignora (no se compara
 * con el persistido, con la identidad ni con otros documentos, y no se devuelve ni se guarda). Basta status «success» y un PDF íntegro.
 */
export function interpretarKude(http: number, cuerpoTexto: string): ResultadoKude {
  let j: Record<string, unknown> | null = null;

  try {
    const v = JSON.parse(cuerpoTexto) as unknown;

    j = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    j = null;
  }
  if (!j || j.status !== "success") return falloKude("FORMATO_NO_CONFIRMADO", http, "El KuDE de este documento no está disponible: el gateway no entregó un resultado válido" + (resumenUpstreamSeguro(cuerpoTexto) ? " (" + resumenUpstreamSeguro(cuerpoTexto) + ")." : "."));

  if (typeof j.kude !== "string" || j.kude.length === 0) return falloKude("PDF_INVALIDO", http, MSG_INVALIDO);
  if (j.kude.length > MAX_KUDE_JSON) return falloKude("DEMASIADO_GRANDE", http, "El archivo recibido del gateway excede el tamaño permitido y fue descartado.");

  const pdf = decodificarBase64Estricto(j.kude);

  if (!pdf || !esPdfValido(pdf)) return falloKude("PDF_INVALIDO", http, MSG_INVALIDO);
  if (pdf.length > MAX_KUDE_BYTES) return falloKude("DEMASIADO_GRANDE", http, "El archivo recibido del gateway excede el tamaño permitido y fue descartado.");

  return { ok: true, pdf };
}

type RespuestaKude = { ok: true; status: number; texto: string | null } | { ok: false; motivo: "TIMEOUT" | "RED" };

/** Lee el cuerpo por trozos y lo CANCELA en cuanto supera `max` bytes (devuelve null). Nunca acumula más de `max` + un trozo. */
export async function leerCuerpoLimitado(cuerpo: CuerpoLegible | null, max: number): Promise<string | null> {
  if (!cuerpo) return "";

  const lector = cuerpo.getReader();
  const trozos: Buffer[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await lector.read();

    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > max) {
      trozos.length = 0;
      await lector.cancel().catch(() => undefined);

      return null;
    }
    trozos.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
  }

  return Buffer.concat(trozos).toString("utf8");
}

async function enviarKude(url: string, token: string, body: unknown, timeoutMs: number, fetchFn: KudeFetch): Promise<RespuestaKude> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), timeoutMs);

  try {
    const r = await fetchFn(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: control.signal });
    const declarado = Number(r.headers.get("content-length"));

    // Una respuesta que declara más de lo permitido ni siquiera se lee (se cancela el flujo).
    if (Number.isFinite(declarado) && declarado > MAX_KUDE_JSON) {
      await r.body?.getReader().cancel().catch(() => undefined);

      return { ok: true, status: r.status, texto: null };
    }

    // El límite se aplica DURANTE la recepción: Content-Length ausente o falso no sirve de excusa para cargar todo el cuerpo en memoria.
    return { ok: true, status: r.status, texto: await leerCuerpoLimitado(r.body, MAX_KUDE_JSON) };
  } catch (error) {
    return { ok: false, motivo: control.signal.aborted || (error instanceof Error && error.name === "AbortError") ? "TIMEOUT" : "RED" };
  } finally {
    clearTimeout(timer);
  }
}

/** Solicita el KuDE de UN documento. SIEMPRE llama al gateway (sin caché ni reutilización). Solo lectura (repetirlo no duplica nada). No lanza por fallos del gateway; nunca devuelve tokens, CDC ni el cuerpo del proveedor. */
export async function obtenerKudeGateway(config: ConfigGateway, doc: DocumentoKude, dep: DependenciasKude = {}): Promise<ResultadoKude> {
  const credenciales = credencialesDe(config, dep.env);

  if (!credenciales) return falloKude("SIN_CREDENCIALES", null, "Las credenciales del gateway de esta empresa no están configuradas.");

  const d = { fetch: dep.fetch ?? fetchSeguro, ahora: dep.ahora ?? Date.now };
  const fetchKude = dep.fetchKude ?? fetchKudeSeguro;
  const cuerpo = cuerpoKudeGateway(doc);

  for (const forzar of [false, true]) {
    const token = await obtenerToken(config, credenciales.ruc, credenciales.password, d, forzar);

    if (typeof token !== "string") {
      return token.resultado === "TIMEOUT" || token.resultado === "RED"
        ? falloKude(token.resultado === "TIMEOUT" ? "TIMEOUT" : "NO_DISPONIBLE", null, token.resultado === "TIMEOUT" ? "Tiempo de espera agotado al autenticar con el gateway." : "No fue posible comunicarse con el gateway.")
        : falloKude("AUTENTICACION", token.http, "El gateway rechazó la autenticación (credenciales de la empresa).");
    }

    const r = await enviarKude(`${config.baseUrl}/api/kude`, token, cuerpo, config.timeoutMs, fetchKude);

    if (!r.ok) return r.motivo === "TIMEOUT" ? falloKude("TIMEOUT", null, "Tiempo de espera agotado al solicitar el KuDE al gateway.") : falloKude("NO_DISPONIBLE", null, "No fue posible comunicarse con el gateway.");

    const textoCorto = r.texto ? r.texto.slice(0, 2000) : "";

    if (esTokenInvalido(r.status, textoCorto) && !forzar) continue; // token vencido: se renueva UNA vez (solicitud de solo lectura)
    if (r.status === 401 || esTokenInvalido(r.status, textoCorto)) return falloKude("AUTENTICACION", r.status, "El gateway rechazó la sesión de la empresa tras renovarla.");
    const detalle = resumenUpstreamSeguro(r.texto);
    const con = (base: string) => `${base} (HTTP ${r.status}${detalle ? `: ${detalle}` : ""})`;

    // Diagnóstico por clase de respuesta del gateway (sin exponer token, credenciales, CDC completo ni el cuerpo).
    if (r.status === 404) return falloKude("NO_ENCONTRADO", 404, con("El KuDE de este documento no está disponible en el gateway: no lo encuentra"));
    if (r.status >= 500 || r.status === 408 || r.status === 429) return falloKude("NO_DISPONIBLE", r.status, "El gateway no está disponible en este momento. Intente nuevamente en unos minutos.");
    if (r.status === 403) return falloKude("PROHIBIDO", 403, con("El gateway no autoriza a estas credenciales a obtener el KuDE de este documento"));
    if (r.status === 400 || r.status === 422) return falloKude("SOLICITUD_RECHAZADA", r.status, con("El gateway rechazó la solicitud del KuDE (el documento puede no estar firmado o aceptado en el gateway)"));
    if (r.status >= 300 && r.status < 400) return falloKude("REDIRECCION", r.status, con("El gateway respondió con una redirección que no se sigue por seguridad"));
    if (r.status !== 200) return falloKude("FORMATO_NO_CONFIRMADO", r.status, con("El KuDE de este documento no está disponible: respuesta inesperada del gateway"));
    if (r.texto === null) return falloKude("DEMASIADO_GRANDE", r.status, "El archivo recibido del gateway excede el tamaño permitido y fue descartado.");

    return interpretarKude(r.status, r.texto);
  }

  return falloKude("AUTENTICACION", 401, "El gateway rechazó el token tras renovarlo.");
}
