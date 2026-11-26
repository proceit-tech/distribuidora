/**
 * PRO-312-R03 / Lote B — Proyección P v1 de NEX-084 (pura, sin base ni red).
 *
 * P resume, con un ESQUEMA CERRADO, los hechos de la respuesta de recepción que la aplicación usó para clasificarla (interpretarRecepcion). NEX-084 la valida contra el documento y el
 * snapshot transmitido, la sanea, la clasifica con su propia réplica (fe_e03_clasificar_recepcion_r05: R-01…R-07) y exige que la clasificación declarada sea la misma; luego coteja los
 * hechos que la respuesta persistida conserva. Aquí:
 *   · construirProyeccion: arma P desde hechosRecepcion (gateway.ts) y la identidad del documento/snapshot; devuelve null + motivo cuando P no puede declararse con certeza
 *     (CUERPO_NO_PROYECTABLE, CREDENCIALES_RESIDUALES o FALLO_LOCAL si la clasificación de P no coincide con la de interpretarRecepcion). Sin P, el cierre queda indeterminado
 *     (D-C02-2-A: evidencia insuficiente → ENVIO_INDETERMINADO, nunca un nuevo POST).
 *   · clasificarProyeccion: réplica exacta de fe_e03_clasificar_recepcion_r05 (misma precedencia de reglas).
 *   · derivarCierre: réplica de fe_e03_r05_derivar_cierre sobre el libro local de la operación (la clasificación esperada que se declara al cerrar).
 * Nada de esto decide un estado fiscal (SIFEN): un ACK del gateway (R-06f / R-06g) es ENVIADO, nunca aprobación.
 */
import { cdcEsCredencial, cdcInformadoPorApi, type ClaseEco, type HechosRecepcion } from "@/lib/facturacion/gateway";

export type Clasificacion = { regla: string; resultado: string; estado_local: "ENVIADO" | "ERROR_ENVIO" | "ENVIO_INDETERMINADO"; error_tipo: "AUTENTICACION" | "RECHAZO" | "TRANSITORIO" | null };
export type MotivoSinProyeccion = "PROYECCION_RECHAZADA" | "CREDENCIALES_RESIDUALES" | "CUERPO_NO_PROYECTABLE" | "FALLO_LOCAL";

export type IdentidadP = { tipo: string; establecimiento: string; punto: string; numero: string; serieEstado: "TEXTO" | "NULO" | "AUSENTE"; serie: string | null };

type EcoP = { n_variantes: number; hay_coincide: boolean; hay_contradice: boolean; hay_no_interpretable: boolean };

export type ProyeccionP = {
  version: 1;
  http: number;
  cuerpo: { json_valido: boolean; raiz_objeto: boolean; bytes: number };
  status: HechosRecepcion["status"];
  token_invalido: boolean;
  duplicado: boolean;
  contador_rechazados_positivo: boolean;
  rechazados: { no_vacia: boolean; propio: boolean; n_entradas: number };
  aceptados: { n_entradas: number; incluye_propio: boolean; con_formato_fiscal: boolean };
  ecos: Record<"dest" | "dpunexp" | "dnumdoc" | "dserienum" | "tipodoc", EcoP>;
  lote: { clase: HechosRecepcion["lote"]["clase"]; clave: string | null; texto: string | null; n_ocurrencias: number };
  cdc: { presente: boolean; valor: string | null; motivo: "NO_TEXTO" | "EXCEDE_LIMITE" | "CARACTER_NUL" | "CREDENCIAL" | null };
  identidad: { tipo: string; establecimiento: string; punto: string; numero: string; serie_estado: IdentidadP["serieEstado"]; serie: string | null };
  lectura: { texto_resultado: string | null; mensaje: string | null; errores_propios: string[]; estado_gateway: string | null; request_id: string | null; campo_problema: string | null };
  clasificacion_app: Clasificacion;
  confianza: { verificados_sql: string[]; cotejables: string[]; confiados_servidor: string[] };
};

export const MAX_BYTES_P = 16384;
const MAX_CONTEO = 32767;
const CAMPOS_ECO = ["dest", "dpunexp", "dnumdoc", "dserienum", "tipodoc"] as const;
const ALIAS_LOTE = new Set(["nrolote", "lote", "numerolote", "nrodelote", "numerodelote"]);

/** Confianza declarada: listas EXACTAS (mismo orden) que exige fe_e03_r05_validar_proyeccion. */
export const CONFIANZA_P = {
  verificados_sql: ["http", "identidad", "token_invalido_fuera_4xx", "clasificacion"],
  cotejables: ["cuerpo", "status", "token_invalido_4xx", "ecos", "contador_rechazados_positivo", "lote", "cdc", "rechazados", "aceptados"],
  confiados_servidor: ["token_invalido_4xx_no_cotejable", "duplicado", "lectura", "orden_alias", "coercion_js", "terceros_omitidos"],
} as const;

/** serie_estado del snapshot transmitido (= seriePayload): texto → TEXTO; null → NULO; ausente u otro tipo → AUSENTE. */
export function identidadDeSnapshot(tipo: string, establecimiento: string, punto: string, numero: string, snapshot: Record<string, unknown>): IdentidadP {
  const tiene = Object.prototype.hasOwnProperty.call(snapshot, "dSerieNum");
  const s = tiene ? snapshot.dSerieNum : undefined;

  if (tiene && typeof s === "string") return { tipo, establecimiento, punto, numero, serieEstado: "TEXTO", serie: s };
  if (tiene && s === null) return { tipo, establecimiento, punto, numero, serieEstado: "NULO", serie: null };

  return { tipo, establecimiento, punto, numero, serieEstado: "AUSENTE", serie: null };
}

/** Recorte por puntos de código (char_length de PostgreSQL), sin partir un par sustituto. */
const recortar = (t: string, max: number) => Array.from(t).slice(0, max).join("");

// Un texto de lectura con forma de credencial (o caracteres de control / sustitutos sueltos, que el banco no admite) no se declara: queda null. El banco además redacta lo reconocible.
const PARECE_SECRETO = /authorization|password|contrase|token\s*[:=]|secret|api_?key|bearer\s|basic\s+[a-z0-9+/=]{8,}|\beyJ[A-Za-z0-9_-]{8,}/i;
const SUSTITUTO_SUELTO = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const CONTROL_O_SUSTITUTO = new RegExp(`[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]|${SUSTITUTO_SUELTO.source}`);

/**
 * PRO-312-R03-C01 (F-R03-02): los patrones no conocen el VALOR de la clave ni de los tokens de la sesión. Con `secretos` (clave de la API, token inicial y renovado) un texto que ES uno de
 * ellos, o que contiene uno de 4 o más caracteres, tampoco se declara (null, entero: nunca se recorta ni se enmascara una parte). Se decide ANTES de recortar: un secreto partido por el
 * recorte no queda a medias. Solo afecta a textos de lectura (confiados al servidor, opcionales en P); los hechos de la clasificación no cambian.
 */
export function lecturaConSecreto(v: string, secretos: readonly string[]): boolean {
  return secretos.some((s) => typeof s === "string" && s !== "" && (v === s || (s.length >= 4 && v.includes(s))));
}

export function textoLectura(v: string | null | undefined, max: number, secretos: readonly string[] = []): string | null {
  if (typeof v !== "string" || v === "") return null;
  if (PARECE_SECRETO.test(v) || CONTROL_O_SUSTITUTO.test(v) || lecturaConSecreto(v, secretos)) return null;

  return recortar(v, max);
}

function ecosP(ecos: ReadonlyArray<{ clave: string; clase: ClaseEco }>): ProyeccionP["ecos"] {
  const salida = {} as ProyeccionP["ecos"];

  for (const campo of CAMPOS_ECO) {
    const propios = ecos.filter((e) => e.clave === campo);

    salida[campo] = {
      n_variantes: Math.min(propios.length, MAX_CONTEO),
      hay_coincide: propios.some((e) => e.clase === "COINCIDE"),
      hay_contradice: propios.some((e) => e.clase === "CONTRADICE"),
      hay_no_interpretable: propios.some((e) => e.clase === "NO_INTERPRETABLE"),
    };
  }

  return salida;
}

/** Réplica exacta de fe_e03_clasificar_recepcion_r05 (NEX-084): misma precedencia R-01 … R-07. */
export function clasificarProyeccion(p: Omit<ProyeccionP, "clasificacion_app"> | ProyeccionP, tipo: string): Clasificacion {
  const problema = CAMPOS_ECO.some((c) => p.ecos[c].hay_contradice || p.ecos[c].hay_no_interpretable);
  const hayEco = p.ecos.dest.n_variantes > 0 || p.ecos.dpunexp.n_variantes > 0 || p.ecos.dnumdoc.n_variantes > 0;
  const ecoOk = !problema && p.ecos.dest.hay_coincide && p.ecos.dpunexp.hay_coincide && p.ecos.dnumdoc.hay_coincide;
  const nce = tipo === "NCE";
  const c = (regla: string, resultado: string, estado_local: Clasificacion["estado_local"], error_tipo: Clasificacion["error_tipo"] = null): Clasificacion => ({ regla, resultado, estado_local, error_tipo });
  const indet = (regla: string, resultado = "ERROR_HTTP") => c(regla, resultado, "ENVIO_INDETERMINADO");
  const http = p.http;

  if (p.token_invalido) return c("R-01", "ERROR_HTTP", "ERROR_ENVIO", "AUTENTICACION");
  if (http < 500 && (p.rechazados.no_vacia || p.contador_rechazados_positivo)) {
    if (p.rechazados.propio && !p.aceptados.incluye_propio && !p.duplicado) return problema ? indet("R-02b") : c("R-02a", "ERROR_HTTP", "ERROR_ENVIO", "RECHAZO");

    return indet("R-02c");
  }
  if (http >= 500) return indet("R-03");
  if (http >= 400) {
    if ([408, 409, 423, 425].includes(http) || p.duplicado) return indet("R-04a");
    if (http === 401 || http === 403) return c("R-04b", "ERROR_HTTP", "ERROR_ENVIO", "AUTENTICACION");
    if (http === 429) return c("R-04c", "ERROR_HTTP", "ERROR_ENVIO", "TRANSITORIO");
    if (nce) return indet("R-04d");
    if (problema) return indet("R-04e");

    return c("R-04f", "ERROR_HTTP", "ERROR_ENVIO", "RECHAZO");
  }
  if (http >= 200 && http <= 299 && p.cuerpo.raiz_objeto) {
    if (p.status === "ERROR") {
      if (nce && !p.duplicado) return indet("R-05a");
      if (p.duplicado) return indet("R-05b");
      if (problema) return indet("R-05d");

      return c("R-05c", "ERROR_HTTP", "ERROR_ENVIO", "RECHAZO");
    }
    if (p.status === "SUCCESS") {
      if (problema) return indet("R-06a", "RESPUESTA_INVALIDA");
      if (hayEco && !ecoOk) return indet("R-06b", "RESPUESTA_INVALIDA");
      if (p.aceptados.con_formato_fiscal && !p.aceptados.incluye_propio) return indet("R-06c", "RESPUESTA_INVALIDA");
      if (p.lote.clase === "INVALIDO_LARGO") return indet("R-06d", "RESPUESTA_INVALIDA");
      if (p.lote.clase === "INVALIDO_FORMATO" || p.lote.clase === "INVALIDO_TIPO") return indet("R-06e", "RESPUESTA_INVALIDA");
      if (p.lote.clase === "VALIDO") return c("R-06f", "OK", "ENVIADO");
      if (ecoOk) return c("R-06g", "OK", "ENVIADO");

      return indet("R-06h", "RESPUESTA_INVALIDA");
    }
  }

  return indet("R-07", "RESPUESTA_INVALIDA");
}

/** Bytes UTF-8 del texto jsonb de P (separadores «, » y «: » de PostgreSQL). */
export function bytesJsonb(v: unknown): number {
  const texto = (x: unknown): string => {
    if (x === null || typeof x !== "object") return JSON.stringify(x);
    if (Array.isArray(x)) return `[${x.map(texto).join(", ")}]`;

    return `{${Object.entries(x as Record<string, unknown>).map(([k, y]) => `${JSON.stringify(k)}: ${texto(y)}`).join(", ")}}`;
  };

  return Buffer.byteLength(texto(v), "utf8");
}

/** Coherencia interna que exige fe_e03_r05_validar_proyeccion (sin la parte que depende del banco). Devuelve false si P no se puede declarar con certeza. */
export function proyeccionCoherente(p: ProyeccionP): boolean {
  const lote = p.lote;
  const loteValido = (t: string | null) => t !== null && Array.from(t).length >= 1 && Array.from(t).length <= 60 && !/[\u0000-\u001f\u007f]/.test(t) && !/^\s|\s$/u.test(t);
  const raizNeutra = p.cuerpo.raiz_objeto || (p.status === "AUSENTE" && !p.duplicado && !p.contador_rechazados_positivo && !p.rechazados.no_vacia && p.aceptados.n_entradas === 0
    && lote.clase === "AUSENTE" && !p.cdc.presente && (!p.token_invalido || p.http === 401) && CAMPOS_ECO.every((c) => p.ecos[c].n_variantes === 0));

  return Number.isInteger(p.http) && p.http >= 100 && p.http <= 599
    && (!p.cuerpo.raiz_objeto || p.cuerpo.json_valido)
    && !((p.http === 401 && !p.token_invalido) || ((p.http < 400 || p.http >= 500) && p.token_invalido))
    && (p.rechazados.n_entradas > 0) === p.rechazados.no_vacia && (!p.rechazados.propio || p.rechazados.no_vacia)
    && (!p.aceptados.incluye_propio || p.aceptados.con_formato_fiscal) && (!p.aceptados.con_formato_fiscal || p.aceptados.n_entradas > 0)
    && CAMPOS_ECO.every((c) => (p.ecos[c].hay_coincide || p.ecos[c].hay_contradice || p.ecos[c].hay_no_interpretable) === (p.ecos[c].n_variantes > 0))
    && (lote.clase === "AUSENTE") === (lote.n_ocurrencias === 0) && (lote.clase === "AUSENTE") === (lote.clave === null)
    && (lote.clave === null || ALIAS_LOTE.has(lote.clave))
    && (lote.clase === "VALIDO") === (lote.texto !== null) && (lote.clase !== "VALIDO" || loteValido(lote.texto))
    && (p.cdc.presente || (p.cdc.valor === null && p.cdc.motivo === null)) && (!p.cdc.presente || (p.cdc.valor === null) !== (p.cdc.motivo === null))
    && (p.cdc.valor === null || Array.from(p.cdc.valor).length <= 256)
    && raizNeutra
    && !(p.identidad.serie_estado === "AUSENTE" && (p.ecos.dserienum.hay_coincide || p.ecos.dserienum.hay_contradice))
    && !(p.identidad.tipo !== "FE" && p.identidad.tipo !== "NCE" && (p.ecos.tipodoc.hay_coincide || p.ecos.tipodoc.hay_contradice))
    && p.lectura.errores_propios.length <= 3
    && bytesJsonb(p) <= MAX_BYTES_P;
}

export type EntradaProyeccion = {
  http: number;
  cuerpoTexto: string;
  hechos: HechosRecepcion;
  identidad: IdentidadP;
  /** Clasificación de interpretarRecepcion (la que la vía vigente habría registrado). */
  app: { resultado: string; estadoLocal: string; errorTipo: string | null };
  lectura: { textoResultado: string | null; estadoGateway: string | null; errores: string[] };
  /** Clave de la API y TODOS los tokens de la operación (inicial y renovado): un CDC con forma de credencial se declara CREDENCIAL (sin valor); un lote credencial no se certifica; una lectura con secreto queda null. */
  secretos: string[];
};

/**
 * P v1 desde los hechos de la respuesta, o el motivo por el que no se declara. La clasificación de P DEBE ser la misma que la de interpretarRecepcion (vía vigente): si difiere, no hay P
 * (FALLO_LOCAL) y el cierre queda indeterminado. El lote con forma de credencial no se certifica (CREDENCIALES_RESIDUALES).
 */
export function construirProyeccion(e: EntradaProyeccion): { p: ProyeccionP; motivo: null } | { p: null; motivo: MotivoSinProyeccion } {
  const h = e.hechos;
  const secretos = e.secretos.filter((s) => typeof s === "string" && s !== "");
  const cdcInf = cdcInformadoPorApi(h.cdcBruto);
  const cdc: ProyeccionP["cdc"] = cdcInf.valor !== null && cdcEsCredencial(cdcInf.valor, secretos)
    ? { presente: true, valor: null, motivo: "CREDENCIAL" }
    : cdcInf.valor !== null && SUSTITUTO_SUELTO.test(cdcInf.valor) ? { presente: true, valor: null, motivo: "NO_TEXTO" } : { presente: cdcInf.presente, valor: cdcInf.valor, motivo: cdcInf.motivo };

  // Un CDC con un sustituto UTF-16 suelto (que jsonb no admite) no se puede declarar igual al recibido: sin P (la respuesta queda como evidencia y el cierre indeterminado).
  if (cdcInf.valor !== null && cdc.motivo === "NO_TEXTO") return { p: null, motivo: "CUERPO_NO_PROYECTABLE" };
  if (h.lote.texto !== null && cdcEsCredencial(h.lote.texto, secretos)) {
    return { p: null, motivo: "CREDENCIALES_RESIDUALES" };
  }

  const base: Omit<ProyeccionP, "clasificacion_app"> = {
    version: 1,
    http: e.http,
    cuerpo: { json_valido: h.jsonValido, raiz_objeto: h.raizObjeto, bytes: Buffer.byteLength(e.cuerpoTexto, "utf8") },
    status: h.status,
    token_invalido: h.tokenInvalido,
    duplicado: h.duplicado,
    contador_rechazados_positivo: h.contadorRechazadosPositivo,
    rechazados: { no_vacia: h.rechazados.nEntradas > 0, propio: h.rechazados.propio, n_entradas: h.rechazados.nEntradas },
    aceptados: { n_entradas: h.aceptados.nEntradas, incluye_propio: h.aceptados.incluyePropio, con_formato_fiscal: h.aceptados.conFormatoFiscal },
    ecos: ecosP(h.ecos),
    lote: { clase: h.lote.clase, clave: h.lote.clave, texto: h.lote.texto, n_ocurrencias: h.lote.nOcurrencias },
    cdc,
    identidad: { tipo: e.identidad.tipo, establecimiento: e.identidad.establecimiento, punto: e.identidad.punto, numero: e.identidad.numero, serie_estado: e.identidad.serieEstado, serie: e.identidad.serie },
    lectura: {
      // F-R03-02: TODAS las lecturas (también el mensaje ORIGINAL de la respuesta) se filtran con los secretos efectivos antes de recortar y de persistir.
      texto_resultado: textoLectura(e.lectura.textoResultado, 500, secretos),
      mensaje: textoLectura(h.mensaje, 300, secretos),
      errores_propios: e.lectura.errores.map((x) => textoLectura(x, 200, secretos)).filter((x): x is string => x !== null).slice(0, 3),
      estado_gateway: textoLectura(e.lectura.estadoGateway, 120, secretos),
      request_id: null,
      campo_problema: textoLectura(h.campoProblema, 40, secretos),
    },
    confianza: { verificados_sql: [...CONFIANZA_P.verificados_sql], cotejables: [...CONFIANZA_P.cotejables], confiados_servidor: [...CONFIANZA_P.confiados_servidor] },
  };
  const clasificacion = clasificarProyeccion(base, e.identidad.tipo);

  if (clasificacion.resultado !== e.app.resultado || clasificacion.estado_local !== e.app.estadoLocal || clasificacion.error_tipo !== e.app.errorTipo) return { p: null, motivo: "FALLO_LOCAL" };

  const p: ProyeccionP = { ...base, clasificacion_app: clasificacion };

  return proyeccionCoherente(p) ? { p, motivo: null } : { p: null, motivo: "CUERPO_NO_PROYECTABLE" };
}

// ── Réplica de fe_e03_r05_derivar_cierre sobre el libro LOCAL de la operación ────────────────────────────────────────────────────────────────────────

export type SalidaLocal =
  | { tipo: "ERROR_TRANSMISION"; clase: "TIMEOUT" | "RED" }
  | { tipo: "HTTP_RESPUESTA"; http: number; clasificacionP: Clasificacion | null; tokenInvalidoP: boolean; textoResultado: string | null };

export type LibroOperacion = {
  noTransmitido: boolean;
  aut1: { resultado: "OK" | "ERROR_HTTP" | "TIMEOUT" | "RED"; http: number | null } | null;
  aut2: { resultado: "OK" | "ERROR_HTTP" | "TIMEOUT" | "RED"; http: number | null } | null;
  posts: number;
  /** Salida NORMAL registrada de cada POST (índice = número − 1); undefined = sin salida registrada. */
  salidas: Array<SalidaLocal | undefined>;
};

export type CierreDerivado = { clasificacion: Clasificacion; fase: "AUTENTICACION" | "TRANSMISION"; mensaje: string | null };

export const MENSAJES_CIERRE = {
  NT: "Error interno durante el envío: el resultado es indeterminado.",
  TOKEN_SIN_POST2: "Evidencia insuficiente: el token fue rechazado y no consta la renovación ni el reenvío; verifique en el gateway (consulta) antes de reenviar.",
  SIN_SALIDA: "Evidencia insuficiente: no consta la salida del último POST; el gateway pudo haber recibido el documento. Verifique (consulta) antes de reenviar.",
  SIN_P: "Evidencia insuficiente: la respuesta del gateway no pudo verificarse; verifique en el gateway (consulta) antes de reenviar.",
  ET_TIMEOUT: "Tiempo de espera agotado: el gateway pudo haber recibido el documento.",
  ET_RED: "Error de red durante la transmisión: el gateway pudo haber recibido el documento.",
  AUT_TIMEOUT: "Tiempo de espera agotado al autenticar con el gateway.",
  AUT_RED: "No fue posible comunicarse con el gateway.",
  AUT_HTTP: "El gateway rechazó la autenticación (credenciales de la empresa).",
} as const;

/** «Token rechazado en el POST 1» como lo decide fe_e03_r05_token_rechazado_post1: HTTP 4xx con P persistida, regla R-01 y token_invalido. */
export function tokenRechazadoPost1(l: LibroOperacion): boolean {
  const s = l.salidas[0];

  return s !== undefined && s.tipo === "HTTP_RESPUESTA" && s.http >= 400 && s.http <= 499 && s.clasificacionP !== null && s.clasificacionP.regla === "R-01" && s.tokenInvalidoP;
}

/** null = todavía no derivable (CIERRE_SIN_EVIDENCIA). */
export function derivarCierre(l: LibroOperacion): CierreDerivado | null {
  const aut = (a: NonNullable<LibroOperacion["aut1"]>, regla: string): CierreDerivado => ({
    clasificacion: { regla, resultado: a.resultado, estado_local: "ERROR_ENVIO", error_tipo: "AUTENTICACION" },
    fase: "AUTENTICACION",
    mensaje: a.resultado === "TIMEOUT" ? MENSAJES_CIERRE.AUT_TIMEOUT : a.resultado === "RED" ? MENSAJES_CIERRE.AUT_RED : MENSAJES_CIERRE.AUT_HTTP,
  });
  const indet = (regla: string, resultado: string, mensaje: string | null): CierreDerivado => ({ clasificacion: { regla, resultado, estado_local: "ENVIO_INDETERMINADO", error_tipo: null }, fase: "TRANSMISION", mensaje });

  if (l.noTransmitido) return indet("NT", "RED", MENSAJES_CIERRE.NT);
  if (l.posts === 0) return l.aut1 !== null && l.aut1.resultado !== "OK" ? aut(l.aut1, "AUT-1") : null;

  const ultimo = l.posts;
  const salida = l.salidas[ultimo - 1];

  if (ultimo === 1 && tokenRechazadoPost1(l) && l.aut2 !== null && l.aut2.resultado !== "OK") return aut(l.aut2, "AUT-2");
  if (ultimo === 1 && tokenRechazadoPost1(l)) return indet("EI-TOKEN-SIN-POST2", "ERROR_HTTP", MENSAJES_CIERRE.TOKEN_SIN_POST2);
  if (salida === undefined) return indet("EI-SIN-SALIDA", "RESPUESTA_INVALIDA", MENSAJES_CIERRE.SIN_SALIDA);
  if (salida.tipo === "ERROR_TRANSMISION") return indet(`ET-${salida.clase}`, salida.clase, salida.clase === "TIMEOUT" ? MENSAJES_CIERRE.ET_TIMEOUT : MENSAJES_CIERRE.ET_RED);
  if (salida.clasificacionP === null) return indet("EI-SIN-P", salida.http >= 200 && salida.http <= 299 ? "RESPUESTA_INVALIDA" : "ERROR_HTTP", MENSAJES_CIERRE.SIN_P);

  return { clasificacion: salida.clasificacionP, fase: "TRANSMISION", mensaje: salida.textoResultado };
}
