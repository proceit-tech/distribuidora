/**
 * PRO-312-R03 / Lote B — Casos de la vía de envío FE/NCE con evidencia R05 (lib/facturacion/e03-evidencias.ts, e03-proyeccion.ts, bloque aditivo de gateway.ts, bandera en envio.ts y
 * continuidad de la consulta en shared.ts). Funciones REALES con base y `fetch` SIMULADOS: sin red, sin PostgreSQL, sin credenciales reales (fixtures sintéticos).
 * ESCRITOS, NO EJECUTADOS en esta entrega (orden PRO-312-R03: sin pruebas manuales, lint, build, typecheck ni SQL); el CI automático preexistente los ejecuta. No prueban NEX-084/NEX-085
 * reales: la base simulada responde con los contratos (nombres de columnas y códigos NEX) leídos de la migración; la homologación integrada queda para la VM existente.
 * Identificadores R03B-A… (bandera), B (preparación), C (flujo feliz, testigo, serialización única), D (no transmitido / D8-B), E (POST 2), F (incertidumbre y recuperación),
 * G (salida tardía y P rechazada), H (proyección P), I (continuidad de la consulta), J (fuente).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import {
  enviarDocumentoR05, esIncierto, exigirPreparacionR05, FIRMAS_R05, INTENTOS_SQL, INTERNAS_R05, MENSAJE_R05_NO_DISPONIBLE, MENSAJE_RUTA_INVALIDA, mensajeCierre, nuevoTestigo,
  respuestaRegistrable, rutaEnvioE03, SQL_R05,
} from "@/lib/facturacion/e03-evidencias";
import { construirProyeccion, derivarCierre, identidadDeSnapshot, MAX_BYTES_P, MENSAJES_CIERRE, type LibroOperacion } from "@/lib/facturacion/e03-proyeccion";
import { hechosRecepcion, interpretarRecepcion, limpiarCacheTokens, referenciaConexion, type ConfigGateway, type DocumentoRecepcion, type FetchLike } from "@/lib/facturacion/gateway";
import { continuidadReferenciaR05, ErrorFacturacion, MENSAJE_CONEXION_AMBIGUA, MENSAJE_CONEXION_DISTINTA, MENSAJE_REFERENCIA_R05_SIN_PERMISO, reiniciarNex080ParaCasos } from "@/lib/facturacion/shared";

type F = Record<string, unknown>;

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");
const sinComentariosTs = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const sha256 = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const USUARIO = "99999999-9999-4999-8999-999999999999";
const DOC = "d0312b00-0000-4000-8000-000000000001";
const OP = "0b312b00-0000-4000-8000-0000000000aa";
const TOKEN_A = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJyMDNiLWEifQ.firma-sintetica-a";
const TOKEN_B = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJyMDNiLWIifQ.firma-sintetica-b";
const CLAVE = "Clave-Sintetica-R03B";
const RUC = "80000005";
const PAYLOAD: F = { iTiDE: 1, dEst: "001", dPunExp: "002", dNumDoc: "0000123", dInfAdic: "Venta de prueba", items: [{ dCodInt: "P-1", dCantProSer: 2 }] };

const CONFIG: ConfigGateway = { empresaId: EMPRESA, baseUrl: "https://gateway.prueba.invalid", credencialRef: "PRUEBA", timeoutMs: 1000, credenciales: { ruc: RUC, password: CLAVE }, rutaEnvio: "R05" };
const DOC_REC: DocumentoRecepcion = { tipo: "FE", establecimiento: "001", puntoExpedicion: "002", numero: "0000123", serie: null };

const ACK = { status: 200, cuerpo: { status: "success", message: "Documento recibido", nro_lote: "LOTE-R03B-1" } };
const TOKEN_INVALIDO = { status: 400, cuerpo: { status: "error", message: "Token inválido" } };
const RECHAZO_400 = { status: 400, cuerpo: { status: "error", message: "dRucRec inválido" } };

type Llamada = { fn: string; params: unknown[] };
type Respuesta = { status: number; cuerpo: unknown } | "TIMEOUT" | "RED";
type Opciones = {
  inicio?: F | "INCIERTO" | { error: unknown };
  post?: (nro: number, intento: number) => unknown | null;
  almacenamiento?: string;
  shaDistinto?: boolean;
  salida?: (nro: number, intento: number, params: unknown[]) => unknown | null;
  cerrar?: (intento: number) => unknown | null;
  estado?: F;
  porCorrelacion?: F;
};

/** Base simulada con los CONTRATOS de NEX-084 (nombres de salida en camelCase como los alias de SQL_R05). Registra el orden global de escrituras y llamadas HTTP. */
function mundo(o: Opciones = {}) {
  const llamadas: Llamada[] = [];
  const orden: string[] = [];
  const intentos = new Map<string, number>();
  const cuenta = (k: string) => {
    const n = (intentos.get(k) ?? 0) + 1;

    intentos.set(k, n);

    return n;
  };
  let ultimoHttpAut: unknown = null;
  let ultimoHttpPost: number | null = null;

  const db = {
    async query(sql: string, params: unknown[] = []) {
      const fn = /fe_e03_[a-z_]+_r05/.exec(sql)?.[0] ?? "otra";

      llamadas.push({ fn, params });
      orden.push(`db:${fn}`);

      if (fn === "fe_e03_iniciar_envio_r05") {
        if (o.inicio === "INCIERTO") throw new Error("conexión perdida");
        if (o.inicio && "error" in o.inicio) throw o.inicio.error;

        return { rows: [{ resultado: "INICIADO", payload: PAYLOAD, numero: "0000123", tipo: "FE", establecimiento: "001", punto: "002", version: 1, payloadHash: "h", operacionId: OP, reutilizado: false, vigente: true, ...((o.inicio as F | undefined) ?? {}) }] };
      }
      if (fn === "fe_e03_registrar_autenticacion_r05") {
        ultimoHttpAut = params[8];

        return { rows: [{ nro: params[5] === "INICIAL" ? 1 : 2, reutilizado: false }] };
      }
      if (fn === "fe_e03_registrar_post_r05") {
        const nro = Number(params[5]);
        const e = o.post?.(nro, cuenta(`post${nro}`));

        if (e) throw e;

        const texto = String(params[6]);
        const bytes = Buffer.byteLength(texto, "utf8");

        return { rows: [{ nroPost: nro, almacenamiento: o.almacenamiento ?? (bytes <= 1_048_576 ? "EVIDENCIA_NEX072" : "POST_GRANDE_R05"), sha256: o.shaDistinto ? sha256(`${texto} `) : sha256(texto), bytes, reutilizado: false }] };
      }
      if (fn === "fe_e03_registrar_salida_tardia_r05") return { rows: [{ salidaId: "t1", motivo: "OPERACION_CERRADA", estadoProyeccion: "SIN_P", reutilizado: false }] };
      if (fn === "fe_e03_registrar_salida_r05") {
        const nro = Number(params[5]);
        const e = o.salida?.(nro, cuenta(`salida${nro}`), params);

        if (e) throw e;

        const p = typeof params[11] === "string" ? (JSON.parse(params[11]) as { clasificacion_app?: { regla?: string } }) : null;

        return { rows: [{ eventoId: `e${nro}`, regla: p?.clasificacion_app?.regla ?? null, cotejo: p ? "COINCIDE" : null, reutilizado: false }] };
      }
      if (fn === "fe_e03_registrar_no_transmitido_r05") return { rows: [{ eventoId: "nt", reutilizado: false }] };
      if (fn === "fe_e03_cerrar_envio_r05") {
        const e = o.cerrar?.(cuenta("cerrar"));

        if (e) throw e;

        const c = JSON.parse(String(params[5])) as { regla: string; resultado: string; estado_local: string; error_tipo: string | null };
        const aut = c.regla.startsWith("AUT");

        return {
          rows: [{
            estadoLocal: c.estado_local, intentoId: "i1", regla: c.regla, reutilizado: false, fase: aut ? "AUTENTICACION" : "TRANSMISION", resultado: c.resultado, errorTipo: c.error_tipo,
            motivo: "CODIGO", salidaUltimoPost: null, httpPost: aut ? null : ultimoHttpPost, httpAutenticacion: aut ? ultimoHttpAut : null,
            lote: c.estado_local === "ENVIADO" ? "LOTE-R03B-1" : null, cdc: null, cerradoAt: "2026-11-26T00:00:00Z", estadoDocumentoActual: c.estado_local,
          }],
        };
      }
      if (fn === "fe_e03_estado_operacion_r05") return { rows: o.estado ? [o.estado] : [] };
      if (fn === "fe_e03_operacion_por_correlacion_r05") return { rows: o.porCorrelacion ? [o.porCorrelacion] : [] };

      return { rows: [] };
    },
  };

  return {
    db,
    llamadas,
    orden,
    de: (fn: string) => llamadas.filter((l) => l.fn === fn),
    marcarHttpPost: (s: number | null) => {
      ultimoHttpPost = s;
    },
  };
}

/** Gateway simulado: login devuelve TOKEN_A y luego TOKEN_B (o el estado pedido); recepción toma de la cola. */
function gateway(m: ReturnType<typeof mundo>, cola: Respuesta[], login: Array<{ status: number; cuerpo: unknown }> = [{ status: 200, cuerpo: { status: "success", token: TOKEN_A } }, { status: 200, cuerpo: { status: "success", token: TOKEN_B } }]) {
  const pedidos: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  const fetch: FetchLike = async (url, init) => {
    pedidos.push({ url, headers: init.headers, body: init.body });

    if (url.endsWith("/api/login")) {
      m.orden.push("http:login");
      const r = login.length > 1 ? login.shift()! : login[0];

      return { status: r.status, text: async () => JSON.stringify(r.cuerpo) };
    }

    m.orden.push("http:recepcion");
    const r = cola.shift();

    if (r === "TIMEOUT") throw Object.assign(new Error("abortado"), { name: "AbortError" });
    if (r === "RED" || !r) throw new Error("ECONNREFUSED");
    m.marcarHttpPost(r.status);

    return { status: r.status, text: async () => JSON.stringify(r.cuerpo) };
  };

  return { fetch, pedidos, recepciones: () => pedidos.filter((p) => p.url.endsWith("/api/recepcion_de")), logins: () => pedidos.filter((p) => p.url.endsWith("/api/login")) };
}

async function capturarLogs<T>(f: () => Promise<T>): Promise<{ valor: T | null; error: unknown; logs: string }> {
  const original = console.error;
  const lineas: string[] = [];

  console.error = (...a: unknown[]) => {
    lineas.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
  };
  try {
    return { valor: await f(), error: null, logs: lineas.join("\n") };
  } catch (error) {
    return { valor: null, error, logs: lineas.join("\n") };
  } finally {
    console.error = original;
  }
}

const estadoDe = (e: unknown) => (e instanceof ErrorFacturacion ? e.estado : e === null ? null : "OTRO");
const cierreDe = (m: ReturnType<typeof mundo>) => m.de("fe_e03_cerrar_envio_r05").map((l) => JSON.parse(String(l.params[5])) as F);

export async function verificarCasosE03EvidenciasR03(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, condicion: boolean) => igual(nombre, condicion, true);
  const enviar = (m: ReturnType<typeof mundo>, g: ReturnType<typeof gateway>, config: ConfigGateway = CONFIG, env: Record<string, string | undefined> = {}) =>
    capturarLogs(() => enviarDocumentoR05(m.db as never, EMPRESA, USUARIO, DOC, config, { fetch: g.fetch, env }, false));

  // ══ A. Bandera del servidor ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  igual("R03B-A01 sin variable, vacía, 0, off, false o no → vía VIGENTE (apagada por omisión)", [{}, { NEXIT_E03_EVIDENCIAS: "" }, { NEXIT_E03_EVIDENCIAS: "0" }, { NEXIT_E03_EVIDENCIAS: "off" }, { NEXIT_E03_EVIDENCIAS: "FALSE" }, { NEXIT_E03_EVIDENCIAS: " no " }].map((e) => rutaEnvioE03(e)), ["VIGENTE", "VIGENTE", "VIGENTE", "VIGENTE", "VIGENTE", "VIGENTE"]);
  igual("R03B-A02 «R05» (mayúsculas o minúsculas) → vía R05", [rutaEnvioE03({ NEXIT_E03_EVIDENCIAS: "R05" }), rutaEnvioE03({ NEXIT_E03_EVIDENCIAS: "r05" })], ["R05", "R05"]);
  igual("R03B-A03 valor no reconocido («1», «true», «R04») → 503 antes de numerar, sin elegir vía", ["1", "true", "R04"].map((v) => {
    try {
      rutaEnvioE03({ NEXIT_E03_EVIDENCIAS: v });

      return "SIN_ERROR";
    } catch (e) {
      return e instanceof ErrorFacturacion ? `${e.estado}:${e.message === MENSAJE_RUTA_INVALIDA}` : "OTRO";
    }
  }), ["503:true", "503:true", "503:true"]);

  // ══ B. Preparación (readiness) antes de numerar ══════════════════════════════════════════════════════════════════════════════════════════════
  const dbPreparacion = (f: F | null, modo: unknown, nex080 = true) => ({
    consultas: [] as string[],
    async query(sql: string) {
      this.consultas.push(sql);
      if (/bool_and\(to_regprocedure/.test(sql)) return { rows: [{ disponible: nex080 }] };
      if (/internasExpuestas/.test(sql)) {
        if (f === null) throw new Error("sin permiso de catálogo");

        return { rows: [f] };
      }
      if (/nex_e03_r05_estado WHERE id/.test(sql)) return { rows: modo === undefined ? [] : [{ modo }] };

      return { rows: [] };
    },
  });
  const LISTO = { publicas: FIRMAS_R05.length, internasPresentes: INTERNAS_R05.length, internasExpuestas: 0, estadoLegible: true };
  const preparar = async (db: ReturnType<typeof dbPreparacion>) => {
    reiniciarNex080ParaCasos();
    try {
      await exigirPreparacionR05(db as never);

      return "OK";
    } catch (e) {
      return e instanceof ErrorFacturacion ? `${e.estado}:${e.message === MENSAJE_R05_NO_DISPONIBLE}` : `${(e as ErrorFacturacion).estado ?? "OTRO"}`;
    }
  };
  igual("R03B-B01 10 firmas públicas exactas, 32 internas presentes sin EXECUTE, estado legible y modo ACTIVO → preparada", await preparar(dbPreparacion(LISTO, "ACTIVO")), "OK");
  igual("R03B-B02 inventario exacto: 10 funciones públicas (7 escrituras + 3 lecturas) y 32 internas", [FIRMAS_R05.length, INTERNAS_R05.length, new Set(INTERNAS_R05).size], [10, 32, 32]);
  igual("R03B-B03 faltas → 503 sin detalles: firma o columnas distintas, interna ausente, interna con EXECUTE, estado ilegible, modo REVERTIDO, sin fila de modo, error de catálogo", [
    await preparar(dbPreparacion({ ...LISTO, publicas: 9 }, "ACTIVO")),
    await preparar(dbPreparacion({ ...LISTO, internasPresentes: 31 }, "ACTIVO")),
    await preparar(dbPreparacion({ ...LISTO, internasExpuestas: 1 }, "ACTIVO")),
    await preparar(dbPreparacion({ ...LISTO, estadoLegible: false }, "ACTIVO")),
    await preparar(dbPreparacion(LISTO, "REVERTIDO")),
    await preparar(dbPreparacion(LISTO, undefined)),
    await preparar(dbPreparacion(null, "ACTIVO")),
  ], ["503:true", "503:true", "503:true", "503:true", "503:true", "503:true", "503:true"]);
  igual("R03B-B04 sin NEX-080 → 503 (la preparación R05 exige NEX-080 primero)", (await preparar(dbPreparacion(LISTO, "ACTIVO", false))).startsWith("503"), true);
  {
    const db = dbPreparacion(LISTO, "ACTIVO");

    await preparar(db);
    cierto("R03B-B05 la preparación es SOLO lectura de catálogo y modo (sin funciones de escritura R05 ni DML)", db.consultas.every((s) => !/fe_e03_(iniciar|registrar|cerrar)|INSERT|UPDATE|DELETE/i.test(s)));
  }

  // ══ C. Flujo completo: autenticación registrada, serialización única, POST registrado antes del fetch, salida con P y cierre exacto ═════════
  limpiarCacheTokens();
  {
    const m = mundo();
    const g = gateway(m, [ACK]);
    const r = await enviar(m, g);
    const res = r.valor;
    const inicio = m.de("fe_e03_iniciar_envio_r05")[0];
    const testigo = String(inicio?.params[5]);
    const texto = JSON.stringify(PAYLOAD);

    igual("R03B-C01 ACK con lote correlacionado → ENVIADO (OK, HTTP 200, lote) sin estado SIFEN", [res?.estadoLocal, res?.resultado, res?.http, res?.lote, res?.estadoGateway, res?.numero], ["ENVIADO", "OK", 200, "LOTE-R03B-1", null, "0000123"]);
    igual("R03B-C02 orden: inicio → login → autenticación registrada → POST registrado → fetch de recepción → salida → cierre", m.orden, [
      "db:fe_e03_iniciar_envio_r05", "http:login", "db:fe_e03_registrar_autenticacion_r05", "db:fe_e03_registrar_post_r05", "http:recepcion", "db:fe_e03_registrar_salida_r05", "db:fe_e03_cerrar_envio_r05",
    ]);
    cierto("R03B-C03 correlación = UUID nuevo; testigo = 256 bits en base64url (43 caracteres)", /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(String(inicio?.params[4])) && /^[A-Za-z0-9_-]{43}$/.test(testigo));
    cierto("R03B-C04 el MISMO testigo y la misma operación en todas las escrituras posteriores", m.llamadas.filter((l) => l.fn !== "fe_e03_iniciar_envio_r05").every((l) => l.params[3] === OP && l.params[4] === testigo));
    cierto("R03B-C05 el testigo no sale: ni en el resultado, ni en el gateway (cuerpo/encabezados), ni en logs", !JSON.stringify(res).includes(testigo) && !JSON.stringify(g.pedidos).includes(testigo) && !r.logs.includes(testigo));
    igual("R03B-C06 serialización ÚNICA: el texto registrado en el POST es byte a byte el transmitido (y es JSON.stringify del snapshot)", [m.de("fe_e03_registrar_post_r05")[0]?.params[6], g.recepciones()[0]?.body], [texto, texto]);
    igual("R03B-C07 un solo POST y un solo fetch de recepción con el token de la autenticación registrada", [m.de("fe_e03_registrar_post_r05").length, g.recepciones().length, g.recepciones()[0]?.headers.Authorization], [1, 1, `Bearer ${TOKEN_A}`]);
    igual("R03B-C08 autenticación registrada: INICIAL, origen HTTP, OK, HTTP 200", m.de("fe_e03_registrar_autenticacion_r05")[0]?.params.slice(5), ["INICIAL", "HTTP", "OK", 200]);
    igual("R03B-C09 cierre con la clasificación esperada EXACTA (R-06f)", cierreDe(m), [{ regla: "R-06f", resultado: "OK", estado_local: "ENVIADO", error_tipo: null }]);
    const salida = m.de("fe_e03_registrar_salida_r05")[0]?.params ?? [];

    igual("R03B-C10 salida HTTP_RESPUESTA con P v1 (sin motivo), respuesta no truncada", [salida[5], salida[6], salida[7], salida[9], salida[10], typeof salida[11], salida[12]], [1, "HTTP_RESPUESTA", 200, false, null, "string", null]);
    cierto("R03B-C11 ni la clave de la API ni el token aparecen en la referencia de conexión, la respuesta registrada o P", ![inicio?.params[6], salida[8], salida[11]].some((x) => typeof x === "string" && (x.includes(CLAVE) || x.includes(TOKEN_A))));
    igual("R03B-C12 la referencia de conexión del inicio es la NO secreta de la misma configuración", inicio?.params[6], JSON.stringify(referenciaConexion(CONFIG)));
    igual("R03B-C13 fases con los textos de la vía vigente", res?.fases.map((f) => [f.fase, f.ok]), [["AUTENTICACION", true], ["TRANSMISION", true], ["RESPUESTA", true]]);
    cierto("R03B-C14 el ACK nunca es aprobación SIFEN: el resultado no trae estado fiscal y el mensaje lo aclara", !JSON.stringify(res).includes("APROBADO") && (res?.fases[res.fases.length - 1]?.detalle ?? "").includes("aún no está confirmado"));

    // Segunda operación sin limpiar la caché: autenticación por CACHE (HTTP nulo), sin login.
    const m2 = mundo();
    const g2 = gateway(m2, [ACK]);

    await enviar(m2, g2);
    igual("R03B-C15 token en caché: autenticación registrada con origen CACHE y HTTP nulo, sin llamada de login", [m2.de("fe_e03_registrar_autenticacion_r05")[0]?.params.slice(5), g2.logins().length], [["INICIAL", "CACHE", "OK", null], 0]);
  }

  // ══ D. No transmitido, límites D8-B y fallos antes del fetch ══════════════════════════════════════════════════════════════════════════════════
  limpiarCacheTokens();
  {
    const m = mundo();
    const g = gateway(m, [ACK]);
    const r = await enviar(m, g, { ...CONFIG, credenciales: undefined });

    igual("R03B-D01 sin credenciales: NO_TRANSMITIDO SIN_CREDENCIALES, sin login ni POST, cierre NT indeterminado", [m.de("fe_e03_registrar_no_transmitido_r05").map((l) => l.params[5]), g.pedidos.length, m.de("fe_e03_registrar_post_r05").length, cierreDe(m), r.valor?.estadoLocal], [["SIN_CREDENCIALES"], 0, 0, [{ regla: "NT", resultado: "RED", estado_local: "ENVIO_INDETERMINADO", error_tipo: null }], "ENVIO_INDETERMINADO"]);
    igual("R03B-D02 mensaje del cierre NT = texto fijo (la base devuelve un código, no un mensaje)", r.valor?.mensaje, MENSAJES_CIERRE.NT);
  }
  {
    const grande = { ...PAYLOAD, dInfAdic: "x".repeat(8_400_000) };
    const m = mundo({ inicio: { payload: grande } });
    const g = gateway(m, [ACK]);

    await enviar(m, g);
    igual("R03B-D03 D8-B: más de 8 MiB → NO_TRANSMITIDO SOLICITUD_EXCEDE_LIMITE antes de autenticar, registrar o transmitir (sin truncar ni quitar ítems)", [m.de("fe_e03_registrar_no_transmitido_r05").map((l) => l.params[5]), g.pedidos.length, m.de("fe_e03_registrar_post_r05").length], [["SOLICITUD_EXCEDE_LIMITE"], 0, 0]);
  }
  {
    const mediano = { ...PAYLOAD, dInfAdic: "y".repeat(2_000_000) };
    const m = mundo({ inicio: { payload: mediano } });
    const g = gateway(m, [ACK]);

    await enviar(m, g);
    igual("R03B-D04 D8-B: entre 1 MiB y 8 MiB → almacenamiento POST_GRANDE_R05 verificado y transmitido íntegro", [g.recepciones().length, g.recepciones()[0]?.body.length === JSON.stringify(mediano).length], [1, true]);

    const m2 = mundo({ inicio: { payload: mediano }, almacenamiento: "EVIDENCIA_NEX072" });
    const g2 = gateway(m2, [ACK]);

    await enviar(m2, g2);
    igual("R03B-D05 almacenamiento registrado distinto del esperado (D8-B) → sin fetch, cierre EI-SIN-SALIDA", [g2.recepciones().length, cierreDe(m2).map((c) => c.regla)], [0, ["EI-SIN-SALIDA"]]);
  }
  {
    const m = mundo({ shaDistinto: true });
    const g = gateway(m, [ACK]);

    await enviar(m, g);
    igual("R03B-D06 hash registrado distinto del texto local → sin fetch (no se transmite lo no registrado)", [g.recepciones().length, cierreDe(m).map((c) => c.regla)], [0, ["EI-SIN-SALIDA"]]);
  }
  {
    const m = mundo({ post: () => Object.assign(new Error("no coincide"), { code: "P0001", detail: "NEX:CUERPO_NO_COINCIDE" }) });
    const g = gateway(m, [ACK]);

    await enviar(m, g);
    igual("R03B-D07 CUERPO_NO_COINCIDE en el registro del POST → NO_TRANSMITIDO, sin fetch de recepción, cierre NT", [m.de("fe_e03_registrar_no_transmitido_r05").map((l) => l.params[5]), g.recepciones().length, cierreDe(m).map((c) => c.regla)], [["CUERPO_NO_COINCIDE"], 0, ["NT"]]);
  }
  limpiarCacheTokens();
  {
    const m = mundo();
    const g = gateway(m, [ACK], [{ status: 401, cuerpo: { status: "error", message: "credenciales" } }]);
    const r = await enviar(m, g);

    igual("R03B-D08 autenticación rechazada (HTTP 401): registrada, sin POST, cierre AUT-1 ERROR_ENVIO/AUTENTICACION con el HTTP de la autenticación", [m.de("fe_e03_registrar_autenticacion_r05")[0]?.params.slice(5), g.recepciones().length, cierreDe(m), r.valor?.http], [["INICIAL", "HTTP", "ERROR_HTTP", 401], 0, [{ regla: "AUT-1", resultado: "ERROR_HTTP", estado_local: "ERROR_ENVIO", error_tipo: "AUTENTICACION" }], 401]);
  }

  // ══ E. POST 2 solo tras token inválido acreditado ═════════════════════════════════════════════════════════════════════════════════════════════
  limpiarCacheTokens();
  {
    const m = mundo();
    const g = gateway(m, [TOKEN_INVALIDO, ACK]);
    const r = await enviar(m, g);

    igual("R03B-E01 token inválido acreditado en el POST 1 (4xx, P R-01) → renovación forzada registrada → POST 2 con el token nuevo → ENVIADO", [r.valor?.estadoLocal, g.recepciones().map((p) => p.headers.Authorization), m.de("fe_e03_registrar_autenticacion_r05").map((l) => l.params.slice(5))], ["ENVIADO", [`Bearer ${TOKEN_A}`, `Bearer ${TOKEN_B}`], [["INICIAL", "HTTP", "OK", 200], ["RENOVACION_TOKEN", "HTTP", "OK", 200]]]);
    igual("R03B-E02 los dos POST transmiten el MISMO texto registrado (sin volver a serializar)", [...new Set([...m.de("fe_e03_registrar_post_r05").map((l) => l.params[6]), ...g.recepciones().map((p) => p.body)])], [JSON.stringify(PAYLOAD)]);
    igual("R03B-E03 salida 1 con regla R-01 y salida 2 con R-06f; máximo dos POST", [m.de("fe_e03_registrar_salida_r05").map((l) => (JSON.parse(String(l.params[11])) as { clasificacion_app: { regla: string } }).clasificacion_app.regla), m.de("fe_e03_registrar_post_r05").map((l) => l.params[5])], [["R-01", "R-06f"], [1, 2]]);
  }
  limpiarCacheTokens();
  {
    const m = mundo();
    const g = gateway(m, [RECHAZO_400, ACK]);
    const r = await enviar(m, g);

    igual("R03B-E04 rechazo 400 que no es de token → sin renovación ni POST 2; cierre R-04f RECHAZO", [g.recepciones().length, g.logins().length, cierreDe(m), r.valor?.errorTipo], [1, 1, [{ regla: "R-04f", resultado: "ERROR_HTTP", estado_local: "ERROR_ENVIO", error_tipo: "RECHAZO" }], "RECHAZO"]);
  }
  limpiarCacheTokens();
  {
    const m = mundo();
    const g = gateway(m, [TOKEN_INVALIDO, ACK], [{ status: 200, cuerpo: { status: "success", token: TOKEN_A } }, { status: 500, cuerpo: {} }]);

    await enviar(m, g);
    igual("R03B-E05 renovación fallida → sin POST 2; cierre AUT-2 (autenticación)", [g.recepciones().length, cierreDe(m).map((c) => [c.regla, c.error_tipo])], [1, [["AUT-2", "AUTENTICACION"]]]);
  }
  limpiarCacheTokens();
  {
    const m = mundo({ salida: (nro) => (nro === 1 ? new Error("conexión perdida") : null) });
    const g = gateway(m, [TOKEN_INVALIDO, ACK]);
    const r = await enviar(m, g);

    igual("R03B-E06 salida del POST 1 sin confirmación durable → nunca POST 2 (el token rechazado no está acreditado); sin reenvío", [g.recepciones().length, m.de("fe_e03_registrar_salida_r05").length, estadoDe(r.error) === null ? r.valor?.estadoLocal : estadoDe(r.error)], [1, INTENTOS_SQL, "ENVIO_INDETERMINADO"]);
  }

  // ══ F. Incertidumbre SQL y recuperación de la operación exacta ═══════════════════════════════════════════════════════════════════════════════
  igual("R03B-F01 incierto = conexión/serialización/recursos o sin SQLSTATE; definitivo = NEX:… y 42501", [
    esIncierto({ code: "08006" }), esIncierto({ code: "40001" }), esIncierto({ code: "53300" }), esIncierto({ code: "57P01" }), esIncierto(new Error("x")),
    esIncierto({ code: "23505" }), esIncierto({ code: "42501" }), esIncierto({ code: "P0001", detail: "NEX:OPERACION_CERRADA" }),
  ], [true, true, true, true, true, false, false, false]);
  limpiarCacheTokens();
  {
    const m = mundo({ post: () => new Error("conexión perdida"), estado: { operacionId: OP, vigente: true, cierreDerivable: false, cerrada: false } });
    const g = gateway(m, [ACK]);
    const r = await enviar(m, g);

    igual("R03B-F02 registro del POST incierto (reintentos agotados) → sin fetch, NO se declara no transmitido, recuperación sin cierre → 502", [m.de("fe_e03_registrar_post_r05").length, g.recepciones().length, m.de("fe_e03_registrar_no_transmitido_r05").length, estadoDe(r.error)], [INTENTOS_SQL, 0, 0, 502]);
  }
  limpiarCacheTokens();
  {
    const m = mundo({ cerrar: (n) => (n <= INTENTOS_SQL ? new Error("conexión perdida") : null), estado: { operacionId: OP, vigente: true, cerrada: false, cierreDerivable: true, clasificacionDerivable: { regla: "R-06f", resultado: "OK", estado_local: "ENVIADO", error_tipo: null } } });
    const g = gateway(m, [ACK]);
    const r = await enviar(m, g);

    igual("R03B-F03 cierre incierto → estado de la operación → clasificación derivable COHERENTE con lo intentado → se cierra con ella; sin nuevo POST", [r.valor?.estadoLocal, m.de("fe_e03_cerrar_envio_r05").length, m.de("fe_e03_estado_operacion_r05").length, g.recepciones().length], ["ENVIADO", INTENTOS_SQL + 1, 1, 1]);
  }
  limpiarCacheTokens();
  {
    const m = mundo({ cerrar: (n) => (n <= INTENTOS_SQL ? new Error("conexión perdida") : null), estado: { operacionId: OP, vigente: true, cerrada: false, cierreDerivable: true, clasificacionDerivable: { regla: "R-06f", resultado: "OK", estado_local: "ENVIADO", error_tipo: null } } });
    const g = gateway(m, [RECHAZO_400]);
    const r = await enviar(m, g);

    igual("R03B-F04 clasificación derivable NO coherente con lo intentado (rechazo local vs ENVIADO) → no se cierra con ella: 502", [estadoDe(r.error), m.de("fe_e03_cerrar_envio_r05").length], [502, INTENTOS_SQL]);
  }
  limpiarCacheTokens();
  {
    const m = mundo({ cerrar: (n) => (n <= INTENTOS_SQL ? new Error("conexión perdida") : null), estado: { operacionId: OP, vigente: true, cerrada: false, cierreDerivable: true, clasificacionDerivable: { regla: "EI-SIN-SALIDA", resultado: "RESPUESTA_INVALIDA", estado_local: "ENVIO_INDETERMINADO", error_tipo: null } } });
    const g = gateway(m, [ACK]);
    const r = await enviar(m, g);

    igual("R03B-F05 clasificación derivable INDETERMINADA → se acepta (D-C02-2-A) y se cierra", [r.valor?.estadoLocal, cierreDe(m).slice(-1)[0]?.regla], ["ENVIO_INDETERMINADO", "EI-SIN-SALIDA"]);
  }
  limpiarCacheTokens();
  {
    const m = mundo({ cerrar: () => new Error("conexión perdida"), estado: { operacionId: OP, vigente: true, cerrada: true, estadoLocalHistorico: "ENVIADO", resultadoHistorico: "OK", regla: "R-06f", fase: "TRANSMISION", httpPost: 200, lote: "LOTE-R03B-1" } });
    const g = gateway(m, [ACK]);
    const r = await enviar(m, g);

    igual("R03B-F06 la operación ya estaba cerrada (cierre confirmado sin respuesta) → se presenta el cierre histórico", [r.valor?.estadoLocal, r.valor?.lote, r.valor?.http], ["ENVIADO", "LOTE-R03B-1", 200]);
  }
  limpiarCacheTokens();
  {
    const m = mundo({ cerrar: () => new Error("conexión perdida"), estado: { operacionId: OP, vigente: false, cerrada: false } });
    const g = gateway(m, [ACK]);
    const r = await enviar(m, g);

    igual("R03B-F07 operación no vigente → 409 indeterminado, sin reenvío", [estadoDe(r.error), g.recepciones().length], [409, 1]);
  }
  {
    const m = mundo({ inicio: "INCIERTO", porCorrelacion: { operacionId: OP, version: 1, vigente: true, cerrada: false } });
    const g = gateway(m, [ACK]);
    const r = await enviar(m, g);
    const correlacion = m.de("fe_e03_iniciar_envio_r05")[0]?.params[4];

    igual("R03B-F08 inicio incierto → lectura por la MISMA correlación → NO_TRANSMITIDO FALLO_LOCAL y cierre NT; 502 sin HTTP", [estadoDe(r.error), g.pedidos.length, m.de("fe_e03_operacion_por_correlacion_r05")[0]?.params[3] === correlacion, m.de("fe_e03_registrar_no_transmitido_r05").map((l) => l.params[5]), cierreDe(m).map((c) => c.regla)], [502, 0, true, ["FALLO_LOCAL"], ["NT"]]);
  }
  {
    const error = Object.assign(new Error("ya enviado"), { code: "P0001", detail: "NEX:YA_ENVIADO" });
    const m = mundo({ inicio: { error } });
    const g = gateway(m, [ACK]);
    const r = await enviar(m, g);

    igual("R03B-F09 error de negocio de NEX-062 en el inicio (YA_ENVIADO) → se propaga tal cual, sin HTTP", [r.error === error, g.pedidos.length], [true, 0]);
  }
  {
    const m = mundo({ inicio: { resultado: "INDETERMINADO", vigente: false } });
    const g = gateway(m, [ACK]);
    const r = await enviar(m, g);

    igual("R03B-F10 inicio no INICIADO (envío anterior sin cerrar) → 409 sin autenticar ni transmitir", [estadoDe(r.error), g.pedidos.length, m.llamadas.length], [409, 0, 1]);
  }
  limpiarCacheTokens();
  {
    const m = mundo();
    const g = gateway(m, ["TIMEOUT"]);
    const r = await enviar(m, g);

    igual("R03B-F11 timeout del POST → salida ERROR_TRANSMISION TIMEOUT registrada, cierre ET-TIMEOUT indeterminado; sin reenvío automático", [m.de("fe_e03_registrar_salida_r05")[0]?.params.slice(6, 11), cierreDe(m).map((c) => [c.regla, c.estado_local]), g.recepciones().length, r.valor?.mensaje], [["ERROR_TRANSMISION", null, null, false, "TIMEOUT"], [["ET-TIMEOUT", "ENVIO_INDETERMINADO"]], 1, MENSAJES_CIERRE.ET_TIMEOUT]);
  }
  limpiarCacheTokens();
  {
    const m = mundo({ post: () => new Error("conexión perdida"), estado: { operacionId: OP, vigente: true, cierreDerivable: false, cerrada: false } });
    const g = gateway(m, [ACK]);
    const r = await enviar(m, g);

    cierto("R03B-F12 logs de fallos: solo el lugar y la clase (sin testigo, clave, token ni payload)", r.logs.length > 0 && ![CLAVE, TOKEN_A, String(m.de("fe_e03_iniciar_envio_r05")[0]?.params[5]), "Venta de prueba"].some((s) => r.logs.includes(s)));
  }

  // ══ G. Salida tardía y P rechazada ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  limpiarCacheTokens();
  {
    const m = mundo({
      salida: () => Object.assign(new Error("cerrada"), { code: "P0001", detail: "NEX:OPERACION_CERRADA" }),
      estado: { operacionId: OP, vigente: false, cerrada: true, estadoLocalHistorico: "ENVIO_INDETERMINADO", resultadoHistorico: "RESPUESTA_INVALIDA", regla: "EI-SIN-SALIDA", fase: "TRANSMISION" },
    });
    const g = gateway(m, [ACK]);
    const r = await enviar(m, g);

    igual("R03B-G01 operación cerrada por otra vía antes de registrar la salida → se registra como TARDÍA (mismos argumentos), sin cierre nuevo; se presenta el histórico", [m.de("fe_e03_registrar_salida_tardia_r05").length, JSON.stringify(m.de("fe_e03_registrar_salida_tardia_r05")[0]?.params) === JSON.stringify(m.de("fe_e03_registrar_salida_r05")[0]?.params), m.de("fe_e03_cerrar_envio_r05").length, r.valor?.estadoLocal], [1, true, 0, "ENVIO_INDETERMINADO"]);
  }
  limpiarCacheTokens();
  {
    const m = mundo({ salida: (_, intento) => (intento === 1 ? Object.assign(new Error("P"), { code: "P0001", detail: "NEX:CLASIFICACION_NO_COINCIDE" }) : null) });
    const g = gateway(m, [ACK]);
    const r = await enviar(m, g);
    const segunda = m.de("fe_e03_registrar_salida_r05")[1]?.params ?? [];

    igual("R03B-G02 P rechazada por la base → la MISMA salida sin P (motivo PROYECCION_RECHAZADA) y cierre EI-SIN-P indeterminado (D-C02-2-A)", [segunda[11], segunda[12], cierreDe(m), r.valor?.lote], [null, "PROYECCION_RECHAZADA", [{ regla: "EI-SIN-P", resultado: "RESPUESTA_INVALIDA", estado_local: "ENVIO_INDETERMINADO", error_tipo: null }], null]);
  }
  limpiarCacheTokens();
  {
    const m = mundo({ salida: (_, intento) => (intento <= 2 ? Object.assign(new Error("cred"), { code: "P0001", detail: "NEX:EVIDENCIA_CON_CREDENCIALES" }) : null) });
    const g = gateway(m, [ACK]);

    await enviar(m, g);
    const ultima = m.de("fe_e03_registrar_salida_r05").slice(-1)[0]?.params ?? [];

    igual("R03B-G03 credenciales residuales → sin P y, si persisten, solo la marca de truncamiento", [ultima[8], ultima[9], ultima[11], ultima[12], cierreDe(m).map((c) => c.regla)], [JSON.stringify({ truncado: true }), true, null, "CREDENCIALES_RESIDUALES", ["EI-SIN-P"]]);
  }
  igual("R03B-G04 respuesta registrable: normal intacta; >32 KiB, NUL o marca previa → marca de truncamiento", [
    respuestaRegistrable({ a: 1 }), respuestaRegistrable({ a: "z".repeat(40_000) }).truncada, respuestaRegistrable({ a: "\u0000" }).truncada, respuestaRegistrable({ truncado: true }).truncada, respuestaRegistrable(null),
  ], [{ respuesta: { a: 1 }, truncada: false }, true, true, true, { respuesta: null, truncada: false }]);
  igual("R03B-G05 mensajes de cierre por regla (la base devuelve código)", [mensajeCierre("NT", "RED"), mensajeCierre("AUT-1", "TIMEOUT"), mensajeCierre("EI-SIN-P", "ERROR_HTTP"), mensajeCierre("R-06f", "OK")], [MENSAJES_CIERRE.NT, MENSAJES_CIERRE.AUT_TIMEOUT, MENSAJES_CIERRE.SIN_P, null]);
  cierto("R03B-G06 testigos distintos por operación (aleatorios)", nuevoTestigo() !== nuevoTestigo());

  // ══ H. Proyección P: paridad con interpretarRecepcion (vía vigente) ═════════════════════════════════════════════════════════════════════════
  const identidad = identidadDeSnapshot("FE", "001", "002", "0000123", PAYLOAD);
  const proyectar = (http: number, cuerpo: unknown) => {
    const texto = typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo);
    const res = interpretarRecepcion(http, texto, [], DOC_REC);
    const c = construirProyeccion({ http, cuerpoTexto: texto, hechos: hechosRecepcion(http, texto, DOC_REC), identidad, app: { resultado: res.resultado, estadoLocal: res.estadoLocal, errorTipo: res.errorTipo }, lectura: { textoResultado: res.mensaje, estadoGateway: res.estadoGateway, errores: res.errores }, secretos: [CLAVE, TOKEN_A] });

    return c.p ? c.p.clasificacion_app.regla : `SIN_P:${c.motivo}`;
  };
  igual("R03B-H01 matriz de paridad: misma clasificación que la vía vigente en cada regla", [
    proyectar(200, ACK.cuerpo), proyectar(200, { status: "success", dEst: "001", dPunExp: "002", dNumDoc: "0000123" }), proyectar(200, { status: "success", message: "ok" }),
    proyectar(400, TOKEN_INVALIDO.cuerpo), proyectar(401, { message: "x" }), proyectar(403, { message: "x" }), proyectar(429, { message: "x" }), proyectar(409, { message: "x" }),
    proyectar(400, RECHAZO_400.cuerpo), proyectar(500, { message: "x" }), proyectar(200, "no es json"),
  ], ["R-06f", "R-06g", "R-06h", "R-01", "R-01", "R-04b", "R-04c", "R-04a", "R-04f", "R-03", "R-07"]);
  igual("R03B-H02 lote con forma de credencial (igual a la clave) → sin P (CREDENCIALES_RESIDUALES); el cierre no certifica la recepción", proyectar(200, { status: "success", nro_lote: CLAVE }), "SIN_P:CREDENCIALES_RESIDUALES");
  {
    const texto = JSON.stringify(ACK.cuerpo);
    const res = interpretarRecepcion(200, texto, [], DOC_REC);
    const c = construirProyeccion({ http: 200, cuerpoTexto: texto, hechos: hechosRecepcion(200, texto, DOC_REC), identidad, app: { resultado: "ERROR_HTTP", estadoLocal: "ERROR_ENVIO", errorTipo: "RECHAZO" }, lectura: { textoResultado: res.mensaje, estadoGateway: null, errores: [] }, secretos: [] });

    igual("R03B-H03 clasificación de P distinta de la de la vía vigente → sin P (FALLO_LOCAL), nunca se declara otra", c.motivo, "FALLO_LOCAL");
  }
  {
    const texto = JSON.stringify(ACK.cuerpo);
    const res = interpretarRecepcion(200, texto, [], DOC_REC);
    const c = construirProyeccion({ http: 200, cuerpoTexto: texto, hechos: hechosRecepcion(200, texto, DOC_REC), identidad, app: { resultado: res.resultado, estadoLocal: res.estadoLocal, errorTipo: res.errorTipo }, lectura: { textoResultado: res.mensaje, estadoGateway: res.estadoGateway, errores: res.errores }, secretos: [] });

    igual("R03B-H04 P v1: versión 1, confianza con listas exactas y tamaño ≤ 16384 bytes", [c.p?.version, c.p?.confianza.verificados_sql.length, Buffer.byteLength(JSON.stringify(c.p), "utf8") <= MAX_BYTES_P], [1, 4, true]);
  }
  const libro = (x: Partial<LibroOperacion>): LibroOperacion => ({ noTransmitido: false, aut1: { resultado: "OK", http: 200 }, aut2: null, posts: 0, salidas: [], ...x });
  const R01 = { regla: "R-01", resultado: "ERROR_HTTP", estado_local: "ERROR_ENVIO" as const, error_tipo: "AUTENTICACION" as const };
  igual("R03B-H05 derivación local del cierre (réplica de NEX-084)", [
    derivarCierre(libro({ noTransmitido: true }))?.clasificacion.regla,
    derivarCierre(libro({ aut1: { resultado: "TIMEOUT", http: null } }))?.clasificacion.regla,
    derivarCierre(libro({ posts: 1 }))?.clasificacion.regla,
    derivarCierre(libro({ posts: 1, salidas: [{ tipo: "ERROR_TRANSMISION", clase: "RED" }] }))?.clasificacion.regla,
    derivarCierre(libro({ posts: 1, salidas: [{ tipo: "HTTP_RESPUESTA", http: 502, clasificacionP: null, tokenInvalidoP: false, textoResultado: null }] }))?.clasificacion.resultado,
    derivarCierre(libro({ posts: 1, salidas: [{ tipo: "HTTP_RESPUESTA", http: 400, clasificacionP: R01, tokenInvalidoP: true, textoResultado: null }] }))?.clasificacion.regla,
    derivarCierre(libro({ posts: 0 })),
  ], ["NT", "AUT-1", "EI-SIN-SALIDA", "ET-RED", "ERROR_HTTP", "EI-TOKEN-SIN-POST2", null]);

  // ══ I. Continuidad de la conexión para CONSULTAR (referencia R05) ════════════════════════════════════════════════════════════════════════════
  const BASE: ConfigGateway = { empresaId: EMPRESA, baseUrl: "https://gateway.prueba.invalid", credencialRef: "NEXIT_DB", credencialesVersion: 3, timeoutMs: 1000, credenciales: { ruc: RUC, password: CLAVE } };
  const dbReferencia = (estado: unknown, fila: F | null) => ({
    consultas: [] as string[],
    async query(sql: string) {
      this.consultas.push(sql);
      if (/"referenciaR05"/.test(sql)) return { rows: estado === undefined ? [{}] : [{ referenciaR05: estado }] };
      if (/fe_e03_conexion_referencia_r05\(\$1/.test(sql)) return { rows: fila ? [fila] : [] };

      return { rows: [] };
    },
  });
  const continuidad = async (db: ReturnType<typeof dbReferencia>) => {
    try {
      return await continuidadReferenciaR05(db as never, EMPRESA, USUARIO, DOC, BASE);
    } catch (e) {
      return e instanceof ErrorFacturacion ? `${e.estado}:${e.message === MENSAJE_CONEXION_AMBIGUA ? "AMBIGUA" : e.message === MENSAJE_CONEXION_DISTINTA ? "DISTINTA" : e.message === MENSAJE_REFERENCIA_R05_SIN_PERMISO ? "SIN_PERMISO" : "OTRO"}` : "OTRO";
    }
  };
  {
    const ausente = dbReferencia("AUSENTE", null);

    igual("R03B-I01 estructura R05 ausente (anterior a NEX-084) → null: rige la continuidad de NEX-079 como hoy, sin leer la función", [await continuidad(ausente), ausente.consultas.length, await continuidad(dbReferencia(undefined, null))], [null, 1, null]);
  }
  igual("R03B-I02 estructura presente sin EXECUTE → 503 (sin fallback)", await continuidad(dbReferencia("SIN_PERMISO", null)), "503:SIN_PERMISO");
  igual("R03B-I03 referencia AMBIGUA → 409", await continuidad(dbReferencia("LISTA", { conexion: referenciaConexion(BASE), ambigua: true })), "409:AMBIGUA");
  igual("R03B-I04 referencia DISTINTA (otro host) → 409", await continuidad(dbReferencia("LISTA", { conexion: referenciaConexion({ ...BASE, baseUrl: "https://otro.prueba.invalid" }), ambigua: false })), "409:DISTINTA");
  igual("R03B-I05 misma conexión (base, misma versión) → MISMA; sin referencia → SIN_REFERENCIA", [await continuidad(dbReferencia("LISTA", { conexion: referenciaConexion(BASE), ambigua: false })), await continuidad(dbReferencia("LISTA", { conexion: null, ambigua: false }))], ["MISMA", "SIN_REFERENCIA"]);
  {
    const db = { async query() { throw Object.assign(new Error("caída"), { code: "08006" }); } };
    let codigo: unknown = "SIN_ERROR";

    try {
      await continuidadReferenciaR05(db as never, EMPRESA, USUARIO, DOC, BASE);
    } catch (e) {
      codigo = (e as { code?: unknown }).code;
    }
    igual("R03B-I06 error de lectura → se propaga (nunca se supone ausencia)", codigo, "08006");
  }

  // ══ J. Fuente: vía vigente intacta, sin fallback, sin DML ni estado SIFEN ═══════════════════════════════════════════════════════════════════
  const gw = leer("lib/facturacion/gateway.ts");
  const envio = sinComentariosTs(leer("lib/facturacion/envio.ts"));
  const shared = sinComentariosTs(leer("lib/facturacion/shared.ts"));
  const evid = sinComentariosTs(leer("lib/facturacion/e03-evidencias.ts"));
  const proy = sinComentariosTs(leer("lib/facturacion/e03-proyeccion.ts"));
  const tramo = (t: string, desde: string, hasta: string) => t.slice(t.indexOf(desde), t.indexOf(hasta, t.indexOf(desde) + desde.length));

  igual("R03B-J01 gateway.ts: la vía vigente conserva sus 4 transportes y sus 2 salidas saneadas (bloque R05 aditivo)", [(gw.match(/dep\.fetch \?\? fetchSeguro/g) ?? []).length, (gw.match(/return resultadoFiscalSinSecretos\(/g) ?? []).length], [4, 2]);
  cierto("R03B-J02 envio.ts: la bandera se decide en el preflight (antes de numerar) y exige la preparación R05", /if \(rutaEnvioE03\(dep\.env \?\? process\.env\) === "R05"\) \{\s*await exigirPreparacionR05\(db\);\s*return \{ \.\.\.conCredenciales, rutaEnvio: "R05" \};/.test(envio));
  cierto("R03B-J03 envio.ts: con R05 el envío va SOLO a la vía R05 (return), sin volver a NEX-080 directo", /if \(config\.rutaEnvio === "R05"\) return enviarDocumentoR05\(/.test(envio));
  cierto("R03B-J04 e03-evidencias.ts: sin fe_documento_registrar_envio (sin fallback), sin estado SIFEN, sin DML directo", !/fe_documento_registrar_envio|\bestado_sifen\b|APROBADO|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM/i.test(evid));
  cierto("R03B-J05 SQL R05: solo funciones públicas fe_e03_*_r05 y cada parámetro con tipo explícito", Object.values(SQL_R05).every((s) => /FROM public\.fe_e03_[a-z_]+_r05\(/.test(s) && !/\$\d+(?!\d|::)/.test(s)));
  cierto("R03B-J06 sin logs con parámetros: los fallos se registran solo con lugar y código", !/console\.(log|info|warn)/.test(evid) && (evid.match(/console\.error\(/g) ?? []).length === 1);
  cierto("R03B-J07 sin stock, numeración, saldos, impuestos ni KuDE en la vía R05", !/\bstock|movimientos_inventario|\bkude|\bsaldo|fe_documento_crear|\biva\b/i.test(`${evid}\n${proy}`));
  cierto("R03B-J08 consulta: la referencia R05 se evalúa antes de llamar al gateway", (() => {
    const c = tramo(shared, "export async function consultarEstado", "export async function obtenerKude");

    return c.indexOf("continuidadReferenciaR05(") > 0 && c.indexOf("continuidadReferenciaR05(") < c.indexOf("consultarDocumentoGateway(");
  })());
  cierto("R03B-J09 KuDE sin cambios: conexionParaDocumento y obtenerKude no usan la referencia R05", !/continuidadReferenciaR05|fe_e03_conexion_referencia_r05/.test(tramo(shared, "async function conexionParaDocumento", "export const SQL_REFERENCIA_R05_DISPONIBLE")) && !/continuidadReferenciaR05/.test(tramo(shared, "export async function obtenerKude", "\n}\n")));
  cierto("R03B-J10 el límite de 999 ítems y la numeración no se tocan desde la vía R05", !/999|fe_max_lineas|MAX_LINEAS|numeracion|secuencia/i.test(`${evid}\n${proy}`));

  return fallos;
}
