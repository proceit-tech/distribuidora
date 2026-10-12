import { createHash } from "node:crypto";

import { estadoSifenDesdeGateway, type EstadoSifen } from "@/lib/facturacion/estados";

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
export type ConfigGateway = { empresaId: string; baseUrl: string; credencialRef: string; timeoutMs: number };
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ status: number; text(): Promise<string> }>;
export type Dependencias = { fetch?: FetchLike; env?: Record<string, string | undefined>; ahora?: () => number };

/** Único tipoDoc de consulta observado en el contrato. Los demás tipos NO se envían hasta que se confirme su valor (no se adivina). */
const TIPO_DOC_CONSULTA: Record<string, string | undefined> = { NCE: "NCE" };

export const tipoDocConsulta = (tipo: string): string | null => TIPO_DOC_CONSULTA[tipo] ?? null;

export function leerCredenciales(ref: string, env: Record<string, string | undefined> = process.env) {
  if (!/^[A-Z][A-Z0-9_]{0,39}$/.test(ref)) return null;

  const ruc = env[`NEXIT_FE_${ref}_RUC`]?.trim();
  const password = env[`NEXIT_FE_${ref}_PASSWORD`];

  return ruc && password ? { ruc, password } : null;
}

// ── Saneamiento de la respuesta que se guarda como evidencia ────────────────────────────────────────────────────────────────────────────────────────
const CLAVE_SECRETA = /token|password|contrase|authorization|secret|bearer|apikey|api_key/i;
const MAX_JSON = 30_000;

export function sanearRespuesta(valor: unknown, profundidad = 0): unknown {
  if (valor === null || typeof valor === "number" || typeof valor === "boolean") return valor;
  if (typeof valor === "string") return valor.length > 1000 ? `${valor.slice(0, 1000)}…` : valor;
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

const texto = (v: unknown, max = 500): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : null);
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

export type DocumentoConsulta = { tipo: string; establecimiento: string; puntoExpedicion: string; numero: string; serie: string | null };

/** Consulta el estado de UN documento. No lanza por fallos del gateway: devuelve el resultado para que quede como evidencia. */
export async function consultarDocumentoGateway(config: ConfigGateway, doc: DocumentoConsulta, dep: Dependencias = {}): Promise<ResultadoConsulta | { sinContrato: "TIPO" | "CREDENCIALES" }> {
  const tipoDoc = tipoDocConsulta(doc.tipo);

  if (!tipoDoc) return { sinContrato: "TIPO" };

  const credenciales = leerCredenciales(config.credencialRef, dep.env);

  if (!credenciales) return { sinContrato: "CREDENCIALES" };

  const d = { fetch: dep.fetch ?? (globalThis.fetch as unknown as FetchLike), ahora: dep.ahora ?? Date.now };
  const cuerpo = { dEst: doc.establecimiento, dPunExp: doc.puntoExpedicion, dNumDoc: doc.numero, dSerieNum: doc.serie, tipoDoc };

  for (const forzar of [false, true]) {
    const token = await obtenerToken(config, credenciales.ruc, credenciales.password, d, forzar);

    if (typeof token !== "string") return vacio(token.resultado, token.http, token.mensaje);

    const r = await enviar(`${config.baseUrl}/api/consulta_de`, { Authorization: `Bearer ${token}` }, cuerpo, config.timeoutMs, d.fetch);

    if (!r.ok) return vacio(r.motivo, null, r.motivo === "TIMEOUT" ? "Tiempo de espera agotado al consultar el gateway." : "No fue posible comunicarse con el gateway.");
    // Token vencido o revocado: se renueva UNA vez y se reintenta (la consulta es de solo lectura, no duplica nada).
    if (r.status === 401 && !forzar) continue;

    return interpretarConsulta(r.status, r.texto);
  }

  return vacio("ERROR_HTTP", 401, "El gateway rechazó el token tras renovarlo.");
}

// ── Envío (recepcion_de) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Contrato CONFIRMADO: POST {base}/api/recepcion_de con Bearer y el JSON de la FE. NO está comprobado el cuerpo de la respuesta: no se inventan campos.
// Clasificación CONSERVADORA (AUD-FE-F02):
//  · «ENVIADO» solo si la respuesta CERTIFICA la recepción de ESTE documento: trae un CDC coherente con su identidad (tipo, establecimiento, punto, número)
//    o devuelve esos tres identificadores y coinciden. Un 2xx con status success que no identifica el documento (p. ej. solo un lote o un mensaje) es
//    ENVIO_INDETERMINADO: se conserva y se muestra lo informado, pero no se da por recibido ni se permite reenviar sin verificar en el gateway.
//  · Un identificador que CONTRADICE al documento (CDC o número ajenos) es indeterminado, nunca éxito.
//  · 4xx: solo es «rechazo seguro» (ERROR_ENVIO) lo que no deja duda de que el gateway no lo procesó; 408/409/423/425 y los mensajes de duplicado o ya
//    existente son ambiguos (posible duplicidad) → ENVIO_INDETERMINADO. 5xx, timeout, red y respuesta ilegible → ENVIO_INDETERMINADO.
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

const comoTexto = (v: unknown, max = 300): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : null);

function listaErrores(v: unknown): string[] {
  if (v === undefined || v === null) return [];

  const items = Array.isArray(v) ? v : typeof v === "object" ? Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${typeof x === "string" ? x : JSON.stringify(sanearRespuesta(x))}`) : [v];

  return items.slice(0, 20).map((x) => (typeof x === "string" ? x.slice(0, 300) : JSON.stringify(sanearRespuesta(x)).slice(0, 300)));
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
  const errores = raiz ? listaErrores(buscar(raiz, CLAVES_ERRORES)) : [];
  const duplicado = DUPLICADO.test([mensaje ?? "", ...errores].join(" "));
  const base = (r: ResultadoEnvio["resultado"], estado: EstadoLocalEnvio, errorTipo: ErrorTipoEnvio | null, texto: string | null): ResultadoEnvio => ({
    ...resultadoEnvioVacio(r, "TRANSMISION", estado, errorTipo, http, texto, fases),
    respuesta: cuerpo === undefined ? null : respuestaParaGuardar(cuerpo),
    lote: raiz ? comoTexto(buscar(raiz, CLAVES_LOTE), 60) : null,
    cdcInformado,
    estadoGateway: raiz ? comoTexto(buscar(raiz, CLAVES_ESTADO), 120) : null,
    errores,
  });
  const indeterminado = (texto: string, r: ResultadoEnvio["resultado"] = "RESPUESTA_INVALIDA") => base(r, "ENVIO_INDETERMINADO", null, texto);

  if (http >= 500) return indeterminado(mensaje ?? `El gateway respondió HTTP ${http}.`, "ERROR_HTTP");
  if (http >= 400) {
    // Ambiguos: pudo haberse procesado o ya existir (posible duplicidad) → nunca reintentable sin verificar.
    if ([408, 409, 423, 425].includes(http) || duplicado) return indeterminado(mensaje ?? `El gateway respondió HTTP ${http}: el documento pudo haberse procesado o ya existir.`, "ERROR_HTTP");
    if (http === 401 || http === 403) return base("ERROR_HTTP", "ERROR_ENVIO", "AUTENTICACION", mensaje ?? `El gateway rechazó la autorización (HTTP ${http}).`);
    if (http === 429) return base("ERROR_HTTP", "ERROR_ENVIO", "TRANSITORIO", mensaje ?? "El gateway limitó la frecuencia de solicitudes (HTTP 429).");

    return base("ERROR_HTTP", "ERROR_ENVIO", "RECHAZO", mensaje ?? `El gateway rechazó la solicitud (HTTP ${http}).`);
  }
  if (http >= 200 && http < 300 && raiz) {
    if (raiz.status === "error") {
      return duplicado ? indeterminado(mensaje ?? "El gateway informó un error de duplicidad.", "ERROR_HTTP") : base("ERROR_HTTP", "ERROR_ENVIO", "RECHAZO", mensaje ?? "El gateway informó un error.");
    }
    if (raiz.status === "success") {
      const eco = { est: comoTexto(buscar(raiz, new Set(["dest"])), 10), pun: comoTexto(buscar(raiz, new Set(["dpunexp"])), 10), num: comoTexto(buscar(raiz, new Set(["dnumdoc"])), 10) };
      const hayEco = eco.est !== null || eco.pun !== null || eco.num !== null;
      const ecoOk = doc !== undefined && eco.est === doc.establecimiento && eco.pun === doc.puntoExpedicion && eco.num === doc.numero;

      if (doc && cdcInformado && !cdcCoherente(doc, cdcInformado)) return indeterminado("El CDC informado por el gateway no corresponde al documento enviado: verifique en el gateway antes de reenviar.");
      if (doc && hayEco && !ecoOk) return indeterminado("El número de documento devuelto por el gateway no coincide con el enviado: verifique en el gateway antes de reenviar.");
      if (doc && ((cdcInformado && cdcCoherente(doc, cdcInformado)) || ecoOk)) return { ...base("OK", "ENVIADO", null, mensaje), cdc: cdcInformado };

      return indeterminado("El gateway respondió sin identificar el documento recibido (sin CDC ni número): no se confirma la recepción; verifique en el gateway antes de reenviar.");
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
  const credenciales = leerCredenciales(config.credencialRef, dep.env);

  if (!credenciales) return { sinContrato: "CREDENCIALES" };

  const d = { fetch: dep.fetch ?? (globalThis.fetch as unknown as FetchLike), ahora: dep.ahora ?? Date.now };
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
    if (r.status === 401 && !forzar) {
      fases.push({ fase: "TRANSMISION", ok: false, detalle: "Token rechazado (HTTP 401); se renueva la sesión.", http: 401 });
      continue;
    }

    fases.push({ fase: "TRANSMISION", ok: true, detalle: "Solicitud transmitida.", http: r.status });

    const res = interpretarRecepcion(r.status, r.texto, fases, doc);
    const detalle = res.estadoLocal === "ENVIADO"
      ? "El gateway confirmó la recepción del documento. El estado fiscal (SIFEN) aún no está confirmado."
      : res.estadoLocal === "ENVIO_INDETERMINADO" ? `Recepción NO confirmada: ${res.mensaje ?? "respuesta no concluyente"}` : (res.mensaje ?? "Respuesta del gateway");

    fases.push({ fase: "RESPUESTA", ok: res.estadoLocal === "ENVIADO", detalle, http: r.status });

    return res;
  }

  return resultadoEnvioVacio("ERROR_HTTP", "AUTENTICACION", "ERROR_ENVIO", "AUTENTICACION", 401, "El gateway rechazó el token tras renovarlo.", fases);
}
