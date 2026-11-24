/**
 * PRO-342-R01 — FLUJO FISCAL INTEGRAL: envío UNA vez → ACK/lote EXACTO → consulta 1 «XML firmado» (intermedia, no final; CDC solo si la API lo informa) → reconsultas automáticas del MISMO
 * documento por el worker existente (NEX-077: lease + token + escalera) → final SOLO con «Aprobado» o «Rechazado» informado por la API. KuDE disponible durante «XML firmado» sin cerrar el
 * seguimiento y sin presentar como propio el PDF de otro documento.
 *
 * Casos sobre las funciones REALES (enviarDocumento, consultarEstado, ejecutarLote, consultarDocumentoGateway, obtenerKudeGateway, interpretarRecepcion, estadoSifenDesdeGateway,
 * seguimientoFiscal, textoConexion) con `fetch`, entorno y base SIMULADOS. La base simulada reproduce las reglas de las funciones SQL (NEX-050 / NEX-077 / NEX-079: reserva con token,
 * programación con token, CDC_DIVERGENTE, estado final solo con CDC coherente, CDC fijado una vez, intentos solo altas); el texto de la migración NEX-079 se verifica por separado.
 * Sin red, sin PostgreSQL, sin gateway ni credenciales reales. ESCRITOS, NO EJECUTADOS en esta entrega (orden PRO-342-R01).
 *
 * PRO-342-R03 / R03-01 retificada (casos ESCRITOS, NO EJECUTADOS): regla fiscal del responsable — un XML firmado SIEMPRE tiene CDC. Los escenarios usan «XML firmado» CON CDC; sin CDC
 * (ni registrado) «XML firmado» y los finales son RESPUESTA_INVALIDA y el seguimiento continúa (nunca final con CDC NULL). El lote del documento solo se fija con ENVIADO (ACK correlacionado).
 * Continuidad: credenciales de ENTORNO nunca MISMA.
 * PRO-342-R04 (casos ESCRITOS, NO EJECUTADOS): «XML firmado» exige CDC en la RESPUESTA ACTUAL aunque el documento ya tenga CDC; CDC leído LITERAL (sin trim) en consulta y ACK; guarda
 * complementaria en NEX-079; iconos independientes Envío · XML/CDC · SIFEN · Correo, primera capa de cuatro datos fiscales y historial técnico en segunda capa (funciones reales + fuente).
 * PRO-342-R05 (casos ACTUALIZADOS, ESCRITOS, NO EJECUTADOS): REGLA DEFINITIVA del responsable — NEXIT NO valida el CDC. La base simulada reproduce ahora las funciones *_r05 de NEX-080 (sin
 * CDC_DIVERGENTE, sin «final exige CDC», sin «XML firmado exige CDC»; CDC literal en el intento y proyección del último informado con traza INICIAL/SIN_CAMBIO/CAMBIO/AUSENTE/
 * NO_PROYECTADO[_OTRO_DOCUMENTO]) y la falla cerrada sin NEX-080 (sin fallback a NEX-079). Los casos R01–R04 que afirmaban bloqueos por CDC se reescribieron con el resultado R05 y se marcan
 * «(actualizado R05)». Se conservan intactos: envío único, ACK/lote literal, XML firmado intermedio + reconsulta, guarda de estado final contradictorio, conexión/continuidad, KuDE por identidad.
 * Matriz R05 completa: lib/facturacion/cdc-dato-api-r05.casos.ts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { CADENCIA_SEGUNDOS, ejecutarLote } from "@/lib/facturacion/consulta-automatica";
import { enviarDocumento } from "@/lib/facturacion/envio";
import { esFaseXmlFirmado, estadoSifenDesdeGateway } from "@/lib/facturacion/estados";
import {
  CONTRATO_FISCAL_ENVIO, cdcCoherente, cdcInformadoPorApi, consultarDocumentoGateway, continuidadConexion, cuerpoKudeGateway, interpretarConsulta, interpretarRecepcion, limpiarCacheTokens, obtenerKudeGateway, referenciaConexion, resultadoFiscalSinSecretos,
  type CuerpoLegible, type DocumentoKude, type FaseEnvio, type FetchLike, type KudeFetch, type ResultadoConsulta,
} from "@/lib/facturacion/gateway";
import { alertaConsulta, avisoSinCdc, detalleFiscalPrimario, iconosEstado, presentacionSifen, resumenFases, seguimientoFiscal, textoConexion } from "@/lib/facturacion/presentacion-sifen";
import { consultarEstado, reiniciarNex080ParaCasos } from "@/lib/facturacion/shared";
import { decidirConsulta } from "@/lib/facturacion/reconciliacion";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const USUARIO = "99999999-9999-4999-8999-999999999999";
const DOC1 = "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1";
const DOC2 = "d2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2";
/** RUC sintético del emisor. Caso del incidente: la clave de la API ES el RUC (aparece dentro del lote y del CDC). */
const RUC = "80000005";
const CLAVE = RUC;
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwcm8zNDIifQ.firma-sintetica-pro342";
const CONFIG = { empresaId: EMPRESA, baseUrl: "https://gateway.prueba.invalid", credencialRef: "PRUEBA", timeoutMs: 1000, credencialesVersion: 3 };
const ENV = { NEXIT_FE_PRUEBA_RUC: RUC, NEXIT_FE_PRUEBA_PASSWORD: CLAVE };
const cdcDe = (numero: string, seguridad = "123456789", ruc = RUC, tipo = "01") => tipo + ruc + "6" + "001" + "001" + numero + "1" + "20261111" + "1" + seguridad + "0";
const CDC1 = cdcDe("0000001");
const CDC1_OTRO = cdcDe("0000001", "987654321");
const CDC2 = cdcDe("0000002");
const CDC1_OTRA_EMPRESA = cdcDe("0000001", "123456789", "80012345");
/** Lote LITERAL con el formato observado (RUC-tipo-EEE-PPP-NNNNNNN-fecha-aleatorio): contiene la clave (= RUC). Nunca debe quedar «[omitido]». */
const LOTE = `${RUC}-1-001-001-0000001-20261111091027-ab12`;

type DocMundo = {
  id: string; tipo: string; establecimiento: string; puntoExpedicion: string; numero: string; serie: string | null; cdc: string | null; estadoLocal: string; estadoSifen: string;
  estadoGatewayTexto: string | null; codRespuesta: string | null; mensajeRespuesta: string | null; fechaFirma: string | null; lote: string | null;
  leaseToken: string | null; proxima: number; consultasAuto: number; ultimaConsultaResultado: string | null; ultimaConsultaAt: number | null;
};
type IntentoMundo = {
  documento: string; tipo: "ENVIO" | "CONSULTA"; resultado: string; http: number | null; estadoGateway: string | null; estadoSifen: string | null; cdcInformado: string | null; lote: string | null; mensaje: string | null;
  respuesta: string | null; conexion: Record<string, unknown> | null; actor: string; cdcProyeccion?: string | null; cdcAnterior?: string | null;
};

const FINALES = ["APROBADO", "RECHAZADO", "CANCELADO", "INUTILIZADO"];
const PENDIENTES = ["SIN_CONSULTA", "PENDIENTE", "NO_RECONOCIDO"];

/**
 * Base simulada con las reglas de las funciones SQL de registro R05 (NEX-080: fe_documento_registrar_envio_r05 / _consulta_r05 / _consulta_flujo_nce_r05 / _consulta_auto_r05, con la reserva y la
 * programación con token de NEX-077). `sinNex080` = las funciones R05 no existen: el catálogo (to_regprocedure) responde «no disponible» y la aplicación falla cerrada antes del gateway.
 */
function mundo(docs: Partial<DocMundo>[], opciones: { sinNex080?: boolean; baseUrl?: string } = {}) {
  const reloj = { t: Date.parse("2026-11-11T09:30:00Z") };
  const tabla = new Map<string, DocMundo>();

  for (const d of docs) {
    const base: DocMundo = {
      id: DOC1, tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000001", serie: "AA", cdc: null, estadoLocal: "ENVIADO", estadoSifen: "SIN_CONSULTA",
      estadoGatewayTexto: null, codRespuesta: null, mensajeRespuesta: null, fechaFirma: null, lote: null, leaseToken: null, proxima: 0, consultasAuto: 0, ultimaConsultaResultado: null, ultimaConsultaAt: null, ...d,
    };

    tabla.set(base.id, base);
  }

  const intentos: IntentoMundo[] = [];
  const sqls: string[] = [];
  let tokens = 0;
  let iniciados = 0;
  const pgError = (detail: string) => Object.assign(new Error(detail), { code: "P0001", detail });
  const conexionDe = (v: unknown) => (typeof v === "string" ? (JSON.parse(v) as Record<string, unknown>) : null);
  // fe_cdc_texto_r05: literal si es texto no vacío de hasta 256 caracteres; si no, NULL (sin recortar).
  const textoCdc = (v: unknown) => (typeof v === "string" && v !== "" && v.length <= 256 ? v : null);
  // fe_cdc_proyectar_r05: igualdad literal; nunca posiciones ni formato. Índice único (empresa, cdc) conservado: un CDC de OTRO documento no se proyecta.
  const proyectar = (d: DocMundo, cdc: string | null): { proyeccion: string; anterior: string | null } => {
    if (cdc === null) return { proyeccion: "AUSENTE", anterior: null };
    if (d.cdc === cdc) return { proyeccion: "SIN_CAMBIO", anterior: null };
    if ([...tabla.values()].some((o) => o.id !== d.id && o.cdc === cdc)) return { proyeccion: "NO_PROYECTADO_OTRO_DOCUMENTO", anterior: null };

    const anterior = d.cdc;

    d.cdc = cdc;

    return anterior === null ? { proyeccion: "INICIAL", anterior: null } : { proyeccion: "CAMBIO", anterior };
  };

  const registrarConsulta = (modo: "MANUAL" | "FLUJO" | "AUTO", p: unknown[], token: unknown, conexion: unknown) => {
    const d = tabla.get(String(p[2]));

    if (!["OK", "NO_ENCONTRADO", "ERROR_HTTP", "TIMEOUT", "RED", "RESPUESTA_INVALIDA"].includes(String(p[3]))) throw pgError("resultado de consulta no válido");
    if (!d) throw pgError("NEX:DOCUMENTO_NO_ENCONTRADO");
    if (modo === "AUTO" && (token === null || d.leaseToken !== token)) throw pgError("NEX:LEASE_OBSOLETO");
    if (modo !== "MANUAL" && (!["ENVIADO", "ENVIO_INDETERMINADO"].includes(d.estadoLocal) || !PENDIENTES.includes(d.estadoSifen))) throw pgError("NEX:DOCUMENTO_NO_PENDIENTE");

    const pCdc = textoCdc(p[8]);
    const pEstado = (p[7] as string | null) ?? null;
    let resultado = String(p[3]);
    let mensaje = (p[10] as string | null) ?? null;
    let proy: { proyeccion: string | null; anterior: string | null } = { proyeccion: null, anterior: null };

    // Guarda INDEPENDIENTE del CDC: un final registrado no retrocede ni cambia (solo APROBADO → CANCELADO).
    if (resultado === "OK" && FINALES.includes(d.estadoSifen) && !(pEstado === d.estadoSifen || (d.estadoSifen === "APROBADO" && pEstado === "CANCELADO"))) {
      resultado = "RESPUESTA_INVALIDA";
      mensaje = `La consulta informa «${pEstado}» pero el documento ya figura como «${d.estadoSifen}»: no se modifica el estado fiscal.`;
    }
    if (resultado === "OK") {
      d.estadoSifen = String(pEstado);
      d.estadoGatewayTexto = (p[6] as string | null) ?? null;
      d.codRespuesta = (p[9] as string | null) ?? null;
      d.mensajeRespuesta = mensaje;
      d.fechaFirma = (p[11] as string | null) ?? d.fechaFirma;
      d.estadoLocal = "ENVIADO";
      proy = proyectar(d, pCdc);
    } else if (pCdc !== null) {
      proy = { proyeccion: "NO_PROYECTADO", anterior: null };
    }
    intentos.push({
      documento: d.id, tipo: "CONSULTA", resultado, http: (p[4] as number | null) ?? null, estadoGateway: (p[6] as string | null) ?? null, estadoSifen: resultado === "OK" ? pEstado : null,
      cdcInformado: pCdc, lote: null, mensaje, respuesta: (p[13] as string | null) ?? null, conexion: conexionDe(conexion), actor: String(p[1]), cdcProyeccion: proy.proyeccion, cdcAnterior: proy.anterior,
    });
    d.ultimaConsultaResultado = resultado;
    d.ultimaConsultaAt = reloj.t;

    return resultado;
  };

  const db = {
    async query(sql: string, p: unknown[] = []) {
      sqls.push(sql);
      // PRO-342-R05: verificación en el catálogo de las funciones R05 (exigirNex080). Sin NEX-080 no existen y nunca se llama a una firma anterior.
      if (/to_regprocedure/.test(sql)) return { rows: [{ disponible: !opciones.sinNex080 }] };
      if (/fe_documento_registrar_(consulta|envio)/.test(sql) && !/_r05\(/.test(sql)) throw new Error(`R05: la aplicación no debe usar firmas anteriores a NEX-080: ${sql.slice(0, 80)}`);
      if (opciones.sinNex080 && /_r05\(/.test(sql)) throw Object.assign(new Error("function does not exist"), { code: "42883" });
      // PRO-342-R02 (F002): conexión (sin secretos) del último ENVÍO del documento con snapshot, por empresa y documento.
      if (/i\.tipo = 'ENVIO'/.test(sql)) {
        const env = [...intentos].reverse().find((i) => p[0] === EMPRESA && i.documento === p[1] && i.tipo === "ENVIO" && i.conexion !== null);

        return { rows: env ? [{ conexion: env.conexion }] : [] };
      }
      if (/fe_consulta_reservar_token/.test(sql)) {
        const elegido = [...tabla.values()].find((d) => ["ENVIADO", "ENVIO_INDETERMINADO"].includes(d.estadoLocal) && PENDIENTES.includes(d.estadoSifen) && d.proxima <= reloj.t && d.leaseToken === null);

        if (!elegido) return { rows: [] };
        tokens += 1;
        elegido.leaseToken = `00000000-0000-4000-8000-${String(tokens).padStart(12, "0")}`;

        return { rows: [{ o_empresa: EMPRESA, o_documento: elegido.id, o_actor: USUARIO, o_tipo: elegido.tipo, o_intentos: elegido.consultasAuto, o_token: elegido.leaseToken }] };
      }
      if (/fe_consulta_programar_token/.test(sql)) {
        const d = tabla.get(String(p[1]));

        if (!d || d.leaseToken !== p[4]) return { rows: [{ ok: false }] };
        d.proxima = Date.parse(String(p[2]));
        d.leaseToken = null;
        d.consultasAuto += p[3] ? 1 : 0;

        return { rows: [{ ok: true }] };
      }
      if (/FROM fe_gateway_config/.test(sql)) return { rows: [{ baseUrl: opciones.baseUrl ?? CONFIG.baseUrl, credencialRef: "PRUEBA", timeoutMs: 1000, credencialesVersion: "3" }] };
      if (/fe_documento_registrar_consulta_auto_r05/.test(sql)) return { rows: [{ resultado: registrarConsulta("AUTO", p, p[14], p[15]) }] };
      if (/fe_documento_registrar_consulta_flujo_nce_r05/.test(sql)) return { rows: [{ resultado: registrarConsulta("FLUJO", p, null, p[14]) }] };
      if (/fe_documento_registrar_consulta_r05/.test(sql)) return { rows: [{ resultado: registrarConsulta("MANUAL", p, null, p[14]) }] };
      if (/fe_documento_iniciar_envio/.test(sql)) {
        const d = tabla.get(String(p[2]))!;

        if (d.estadoLocal === "ENVIADO") throw pgError("NEX:YA_ENVIADO");
        iniciados += 1;
        d.estadoLocal = "ENVIANDO";

        return { rows: [{ resultado: "INICIADO", payload: { dEst: d.establecimiento, dPunExp: d.puntoExpedicion, dNumDoc: d.numero }, numero: d.numero, tipo: d.tipo, establecimiento: d.establecimiento, punto: d.puntoExpedicion }] };
      }
      if (/fe_documento_registrar_envio_r05/.test(sql)) {
        const d = tabla.get(String(p[2]))!;

        if (d.estadoLocal !== "ENVIANDO") throw pgError("NEX:ENVIO_NO_INICIADO");
        // NEX-080 (= NEX-079 R03 para el lote): el lote solo se registra con ENVIADO. Un ÚNICO parámetro de CDC (p[12], literal): en el intento siempre; en el documento solo con ENVIADO.
        const lote = p[5] === "ENVIADO" && typeof p[11] === "string" && p[11].length >= 1 && p[11].length <= 60 ? p[11] : null;
        const cdc = textoCdc(p[12]);
        const proy = p[5] === "ENVIADO" ? proyectar(d, cdc) : { proyeccion: cdc === null ? null : "NO_PROYECTADO", anterior: null };

        intentos.push({ documento: d.id, tipo: "ENVIO", resultado: String(p[4]), http: (p[7] as number | null) ?? null, estadoGateway: (p[9] as string | null) ?? null, estadoSifen: null, cdcInformado: cdc, lote, mensaje: (p[10] as string | null) ?? null, respuesta: (p[13] as string | null) ?? null, conexion: conexionDe(p[14]), actor: String(p[1]), cdcProyeccion: proy.proyeccion, cdcAnterior: proy.anterior });
        d.estadoLocal = String(p[5]);
        d.lote = d.lote ?? lote;

        return { rows: [{ resultado: p[5] }] };
      }
      if (/AND d\.id = \$3/.test(sql)) {
        const d = tabla.get(String(p[2]));

        return { rows: d ? [{ ...d }] : [] };
      }

      throw new Error(`consulta inesperada: ${sql.slice(0, 80)}`);
    },
  };

  return { db: db as never, tabla, intentos, sqls, reloj, iniciados: () => iniciados, opciones };
}

/** Gateway simulado: login, recepcion_de y consulta_de (cola de respuestas; un elemento `null` = caída de red). Cuenta cada POST por ruta. */
function gateway(o: { recepcion?: { status: number; cuerpo: unknown }; consultas?: Array<{ status: number; cuerpo: unknown } | null> } = {}) {
  const cola = [...(o.consultas ?? [])];
  const posts: Record<string, number> = {};
  const hosts: string[] = [];
  const cuerpos: Array<{ ruta: string; cuerpo: Record<string, unknown> }> = [];
  const fetchSim: FetchLike = async (url, init) => {
    const ruta = new URL(url).pathname;

    hosts.push(new URL(url).host);

    posts[ruta] = (posts[ruta] ?? 0) + 1;
    cuerpos.push({ ruta, cuerpo: JSON.parse(init.body) as Record<string, unknown> });
    if (ruta === "/api/login") return { status: 200, text: async () => JSON.stringify({ status: "success", token: TOKEN }) };
    if (ruta === "/api/recepcion_de") {
      const r = o.recepcion ?? { status: 200, cuerpo: { status: "success", message: "Documento recibido", nro_lote: LOTE } };

      return { status: r.status, text: async () => JSON.stringify(r.cuerpo) };
    }

    const r = cola.shift();

    if (r === null) throw new Error("red caída");

    return { status: r?.status ?? 500, text: async () => JSON.stringify(r?.cuerpo ?? {}) };
  };

  return { fetch: fetchSim, posts, hosts, cuerpos, dep: { fetch: fetchSim, env: ENV } };
}

const consulta = (estado: string, cdc: string | null, extra: { cod?: string | null; mensaje?: string | null; kude?: unknown; fecha?: string } = {}) => ({
  status: 200,
  cuerpo: {
    status: "success",
    response: {
      Estado: estado, FechaRegistro: extra.fecha ?? "2026-11-11 09:30:57", ...(extra.kude === undefined ? {} : { KuDE: extra.kude }),
      DE: { ...(cdc === null ? {} : { CDC: cdc }), FechaFirma: "2026-11-11 09:10:30", FechaEnvio: "2026-11-11 09:10:31", Retorno: { CodRespuesta: extra.cod ?? null, Mensaje: extra.mensaje ?? null } },
    },
  },
});

/** KuDE simulado (contrato confirmado): JSON {status, CDC, kude(Base64)} por streaming. */
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n", "latin1");

function gatewayKude(cdcRespuesta: string | null) {
  const pedidos: Array<Record<string, unknown>> = [];
  const login: FetchLike = async () => ({ status: 200, text: async () => JSON.stringify({ status: "success", token: TOKEN }) });
  const fetchKude: KudeFetch = async (_url, init) => {
    pedidos.push(JSON.parse(init.body) as Record<string, unknown>);
    const texto = JSON.stringify({ status: "success", ...(cdcRespuesta === null ? {} : { CDC: cdcRespuesta }), kude: PDF.toString("base64") });
    let leido = false;
    const body: CuerpoLegible = { getReader: () => ({ read: async () => (leido ? { done: true } : ((leido = true), { done: false, value: new Uint8Array(Buffer.from(texto, "utf8")) })), cancel: async () => undefined }) };

    return { status: 200, headers: { get: () => null }, body };
  };

  return { pedidos, dep: { fetch: login, fetchKude, env: ENV } };
}

export async function verificarCasosFlujoFiscalPro342(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const lote = async (m: ReturnType<typeof mundo>, g: ReturnType<typeof gateway>) => ejecutarLote(m.db, { limite: 1, dep: g.dep, ahora: () => m.reloj.t });
  const avanzar = (m: ReturnType<typeof mundo>, segundos: number) => { m.reloj.t += segundos * 1000; };

  cierto("PRO342-00 premisas: CDC1/CDC2 coherentes con su número, CDC1_OTRO coherente pero distinto, el lote y el CDC contienen la clave (= RUC)", cdcCoherente({ tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000001" }, CDC1) && cdcCoherente({ tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000002" }, CDC2) && CDC1 !== CDC1_OTRO && LOTE.includes(CLAVE) && CDC1.includes(CLAVE));

  // ── 1. Envío ÚNICO, lote EXACTO aunque la clave sintética sea igual al RUC ─────────────────────────────────────────────────
  {
    limpiarCacheTokens();
    const m = mundo([{ estadoLocal: "PENDIENTE_ENVIO" }]);
    const g = gateway();
    const r = await enviarDocumento(m.db, EMPRESA, USUARIO, DOC1, g.dep);
    const env = m.intentos.find((i) => i.tipo === "ENVIO")!;
    const doc = m.tabla.get(DOC1)!;

    igual("PRO342-01a envío: UNA sola transmisión a recepcion_de; ENVIADO (ACK) con el lote EXACTO, sin «[omitido]»", [g.posts["/api/recepcion_de"], r.estadoLocal, r.lote, doc.lote, env.lote], [1, "ENVIADO", LOTE, LOTE, LOTE]);
    igual("PRO342-01b el ACK no fija estado fiscal ni inventa CDC: estado SIFEN sigue «SIN_CONSULTA» y CDC vacío", [doc.estadoSifen, doc.cdc, env.cdcInformado], ["SIN_CONSULTA", null, null]);
    cierto("PRO342-01c la evidencia del envío conserva nro_lote exacto en la raíz (ruta del contrato)", String(env.respuesta).includes(`"nro_lote":"${LOTE}"`));
    igual("PRO342-01d conexión del intento: host y versión de credenciales; jamás RUC/usuario, clave ni token", [env.conexion, JSON.stringify(env.conexion).includes(RUC), JSON.stringify(env.conexion).includes(TOKEN)], [{ host: "gateway.prueba.invalid", credencialRef: "PRUEBA", credencialesVersion: 3, origenCredenciales: "ENTORNO" }, false, false]);

    // Reintento del operador (doble clic): la base informa YA_ENVIADO y NO hay segunda transmisión.
    let segundo = "";

    try {
      await enviarDocumento(m.db, EMPRESA, USUARIO, DOC1, g.dep);
    } catch (e) {
      segundo = String((e as { detail?: string }).detail);
    }
    igual("PRO342-01e un segundo envío del mismo documento no transmite de nuevo (YA_ENVIADO)", [segundo, g.posts["/api/recepcion_de"], m.iniciados()], ["NEX:YA_ENVIADO", 1, 1]);
  }
  {
    // Lote anidado (Nota.nro_lote) con la clave: no es ruta del contrato, no se reconoce como lote y se sanea en la evidencia; el de la raíz queda exacto.
    const r = interpretarRecepcion(200, JSON.stringify({ status: "success", nro_lote: LOTE, Nota: { nro_lote: "otro-lote" } }), [], { tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000001" });
    const anidado = interpretarRecepcion(200, JSON.stringify({ status: "success", response: { nro_lote: LOTE, CDC: CDC1 } }), [], { tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000001" });

    igual("PRO342-01f el lote y el CDC se leen SOLO de la raíz: nro_lote raíz → ENVIADO; anidados (response.*) no se reconocen → indeterminado sin lote ni CDC", [r.estadoLocal, r.lote, anidado.estadoLocal, anidado.lote, anidado.cdcInformado], ["ENVIADO", LOTE, "ENVIO_INDETERMINADO", null, null]);
  }

  // ── 2. Consulta 1 «XML firmado» SIN CDC y con KuDE habilitado → intermedio, sigue elegible ───────────────────────────────────
  {
    limpiarCacheTokens();
    const m = mundo([{ lote: LOTE }]);
    const g = gateway({ consultas: [consulta("XML firmado", CDC1, { kude: "habilitado" }), consulta("XML firmado", CDC1, { kude: "habilitado" })] });
    const r1 = await lote(m, g);
    const doc = m.tabla.get(DOC1)!;
    const i1 = m.intentos[0];

    igual("PRO342-02a (actualizado R03-01) XML firmado CON CDC y KuDE habilitado: intento OK con estado bruto «XML firmado», PENDIENTE (no final) y CDC exacto registrado", [r1.consultados, i1.resultado, i1.estadoGateway, i1.estadoSifen, i1.cdcInformado, doc.estadoSifen, doc.cdc], [1, "OK", "XML firmado", "PENDIENTE", CDC1, "PENDIENTE", CDC1]);
    igual("PRO342-02b se reprograma la siguiente consulta (escalera existente) y se libera el lease", [doc.leaseToken, doc.proxima, doc.consultasAuto], [null, m.reloj.t + CADENCIA_SEGUNDOS[0] * 1000, 1]);
    igual("PRO342-02c antes de vencer el plazo no se vuelve a consultar; vencido, el MISMO documento vuelve a reservarse y consultarse", [(await lote(m, g)).reservados, (avanzar(m, CADENCIA_SEGUNDOS[0]), (await lote(m, g)).consultados), m.intentos.length], [0, 1, 2]);
    igual("PRO342-02d sin reenvío del JSON ni aprobación inventada: 0 POST a recepcion_de; estado sigue PENDIENTE", [g.posts["/api/recepcion_de"] ?? 0, doc.estadoSifen], [0, "PENDIENTE"]);
    const s = seguimientoFiscal({ ...doc, estadoLocal: "ENVIADO", estadoSifen: "PENDIENTE", ultimaConsultaAt: "2026-11-11T09:30:57Z" } as never);

    igual("PRO342-02e pantalla: tres ejes separados; XML firmado = fase intermedia (KuDE puede estar disponible), resultado fiscal pendiente y en seguimiento", [s.final, s.consultando, /fase intermedia/.test(s.ultimoRetorno), /KuDE puede estar disponible/.test(s.ultimoRetorno), /Pendiente/.test(s.resultadoFiscal), /no es aprobación/.test(s.envio)], [false, true, true, true, true, true]);
  }

  // ── 3. Consulta «XML firmado» CON CDC → CDC exacto registrado, la reconsulta continúa ─────────────────────────────────────────
  {
    limpiarCacheTokens();
    const m = mundo([{ lote: LOTE }]);
    const g = gateway({ consultas: [consulta("XML firmado", CDC1), consulta("XML firmado", CDC1)] });

    await lote(m, g);
    const doc = m.tabla.get(DOC1)!;

    igual("PRO342-03a XML firmado con CDC: el CDC informado por la API se registra EXACTO (sin esperar aprobación) y el estado sigue PENDIENTE", [doc.cdc, m.intentos[0].cdcInformado, doc.estadoSifen], [CDC1, CDC1, "PENDIENTE"]);
    avanzar(m, CADENCIA_SEGUNDOS[0]);
    igual("PRO342-03b la reconsulta del mismo documento continúa (el CDC recibido no cierra el seguimiento) y no cambia el CDC", [(await lote(m, g)).consultados, doc.cdc, m.intentos.length], [1, CDC1, 2]);
  }

  // ── 4. «XML firmado» repetido + error transitorio: historial crece, próxima programada, sin reenvío ──────────────────────────
  {
    limpiarCacheTokens();
    const m = mundo([{ lote: LOTE }]);
    const g = gateway({ consultas: [consulta("XML firmado", CDC1), { status: 503, cuerpo: { message: "Servicio no disponible" } }, null, consulta("XML firmado", CDC1)] });
    const proximas: number[] = [];

    for (let k = 0; k < 4; k += 1) {
      await lote(m, g);
      proximas.push(m.tabla.get(DOC1)!.proxima - m.reloj.t);
      avanzar(m, CADENCIA_SEGUNDOS[Math.min(k, CADENCIA_SEGUNDOS.length - 1)]);
    }
    const doc = m.tabla.get(DOC1)!;

    igual("PRO342-04a cuatro consultas = cuatro intentos (OK, ERROR_HTTP 503, RED, OK) con HTTP y estado bruto de cada una", m.intentos.map((i) => [i.resultado, i.http, i.estadoGateway]), [["OK", 200, "XML firmado"], ["ERROR_HTTP", 503, null], ["RED", null, null], ["OK", 200, "XML firmado"]]);
    igual("PRO342-04b cada intento reprograma con la escalera existente (60/120/300/600 s); el estado fiscal sigue PENDIENTE y el lote intacto", [proximas, doc.estadoSifen, doc.lote, doc.consultasAuto], [CADENCIA_SEGUNDOS.slice(0, 4).map((x) => x * 1000), "PENDIENTE", LOTE, 4]);
    igual("PRO342-04c ninguna reconsulta reenvía JSON (0 POST a recepcion_de)", g.posts["/api/recepcion_de"] ?? 0, 0);
  }

  // ── 5. «Aprobado» → final persistido y fin de las consultas normales ──────────────────────────────────────────────────────
  {
    limpiarCacheTokens();
    const m = mundo([{ lote: LOTE }]);
    const g = gateway({ consultas: [consulta("XML firmado", CDC1), consulta("Aprobado", CDC1, { cod: "0260", mensaje: "Aprobado" })] });

    await lote(m, g);
    avanzar(m, CADENCIA_SEGUNDOS[0]);
    await lote(m, g);
    const doc = m.tabla.get(DOC1)!;

    igual("PRO342-05a Aprobado: estado, código, mensaje, fecha de firma y CDC persistidos", [doc.estadoSifen, doc.codRespuesta, doc.mensajeRespuesta, doc.fechaFirma, doc.cdc, doc.estadoGatewayTexto], ["APROBADO", "0260", "Aprobado", "2026-11-11 09:10:30", CDC1, "Aprobado"]);
    avanzar(m, 3600);
    igual("PRO342-05b tras el final la reserva ya no lo elige: no hay más consultas automáticas", [(await lote(m, g)).reservados, m.intentos.length], [0, 2]);
  }

  // ── 6. «Rechazado» 1101 → misma persistencia y parada ──────────────────────────────────────────────────────────────────────
  {
    limpiarCacheTokens();
    const m = mundo([{ lote: LOTE }]);
    const g = gateway({ consultas: [consulta("Rechazado", CDC1, { cod: "1101", mensaje: "Número de timbrado inválido" })] });

    await lote(m, g);
    const doc = m.tabla.get(DOC1)!;

    igual("PRO342-06a Rechazado 1101: estado RECHAZADO, código, mensaje y CDC exactos persistidos", [doc.estadoSifen, doc.codRespuesta, doc.mensajeRespuesta, doc.cdc], ["RECHAZADO", "1101", "Número de timbrado inválido", CDC1]);
    avanzar(m, 3600);
    igual("PRO342-06b tras el rechazo final no hay más consultas automáticas", (await lote(m, g)).reservados, 0);
    igual("PRO342-06c (actualizado R05) un «Rechazado» sin CDC (ni registrado) SE REGISTRA como lo informó la API: OK, RECHAZADO con su código y CDC NULL (no se inventa)", await (async () => {
      limpiarCacheTokens();
      const m2 = mundo([{ lote: LOTE }]);

      await lote(m2, gateway({ consultas: [consulta("Rechazado", null, { cod: "1101", mensaje: "Número de timbrado inválido" })] }));

      return [m2.intentos[0].resultado, m2.tabla.get(DOC1)!.estadoSifen, m2.tabla.get(DOC1)!.codRespuesta, m2.tabla.get(DOC1)!.cdc];
    })(), ["OK", "RECHAZADO", "1101", null]);
  }

  // ── 7. CDC nunca sobrescrito; otra FE recibe SU CDC de la API ─────────────────────────────────────────────────────────────
  {
    limpiarCacheTokens();
    const m = mundo([{ id: DOC1, cdc: CDC1, estadoSifen: "PENDIENTE", estadoGatewayTexto: "XML firmado", lote: LOTE }, { id: DOC2, numero: "0000002", lote: `${RUC}-1-001-001-0000002-20261111091500-cd34`, proxima: 1 }]);
    const g = gateway({ consultas: [consulta("XML firmado", CDC1_OTRO), consulta("XML firmado", CDC2)] });

    await lote(m, g);
    await lote(m, g);
    const d1 = m.tabla.get(DOC1)!;
    const d2 = m.tabla.get(DOC2)!;

    igual("PRO342-07a (actualizado R05) la API informa OTRO CDC para el documento que ya tiene uno: intento OK con el CDC informado exacto; el documento muestra el último informado y el cambio queda trazado (CAMBIO, anterior)", [m.intentos[0].resultado, m.intentos[0].cdcInformado, d1.cdc, m.intentos[0].cdcProyeccion, m.intentos[0].cdcAnterior], ["OK", CDC1_OTRO, CDC1_OTRO, "CAMBIO", CDC1]);
    igual("PRO342-07b la otra FE (otro JSON) recibe SU CDC de la API; no hereda el CDC de la anterior", [d2.cdc, d2.cdc === d1.cdc], [CDC2, false]);
    const fuente = leer("lib/facturacion/gateway.ts") + leer("lib/facturacion/shared.ts") + leer("lib/facturacion/reconciliacion.ts");

    cierto("PRO342-07c sin algoritmos nuevos de CDC/RUC/DV/fecha/dígito: no hay cálculo de módulo 11 ni construcción de CDC en el flujo", !/m[oó]dulo\s*11|modulo11|calcularCdc|generarCdc|construirCdc|digitoVerificador/i.test(fuente));
  }

  // ── 8. Consulta manual y worker: historial, lease y reprogramación sin duplicar entre instancias ──────────────────────────────
  {
    limpiarCacheTokens();
    const m = mundo([{ lote: LOTE }]);
    const g = gateway({ consultas: [consulta("XML firmado", CDC1)] });
    const r = await consultarEstado(m.db, EMPRESA, USUARIO, DOC1, g.dep);
    const sqlManual = m.sqls.find((x) => /fe_documento_registrar_consulta_r05\(/.test(x)) ?? "";

    igual("PRO342-08a (actualizado R05) consulta MANUAL: intento con cdc_informado exacto y conexión (fe_documento_registrar_consulta_r05, 15 parámetros); el documento sigue pendiente", [r.resultado, m.intentos[0].cdcInformado, m.intentos[0].conexion?.host, /\$15::jsonb\) AS resultado/.test(sqlManual), m.tabla.get(DOC1)!.estadoSifen], ["OK", CDC1, "gateway.prueba.invalid", true, "PENDIENTE"]);
    igual("PRO342-08b la consulta manual no toca la programación del worker (proxima/lease intactos)", [m.tabla.get(DOC1)!.proxima, m.tabla.get(DOC1)!.leaseToken], [0, null]);
  }
  {
    // PRO-342-R05: sin NEX-080 no hay modo compatibilidad: la consulta falla CERRADA (503) antes de llamar al gateway y no se registra nada.
    limpiarCacheTokens();
    reiniciarNex080ParaCasos();
    const m = mundo([{ lote: LOTE }], { sinNex080: true });
    const g = gateway({ consultas: [consulta("XML firmado", CDC1)] });
    let estado = 0;

    try {
      await consultarEstado(m.db, EMPRESA, USUARIO, DOC1, g.dep);
    } catch (e) {
      estado = (e as { estado?: number }).estado ?? -1;
    }
    reiniciarNex080ParaCasos();
    igual("PRO342-08c (actualizado R05) sin NEX-080: 503 sin POST a consulta_de, sin intento y sin llamar a ninguna firma anterior (NEX-054/062/077/079)", [estado, g.posts["/api/consulta_de"] ?? 0, m.intentos.length, m.sqls.filter((x) => /fe_documento_registrar_consulta/.test(x)).length], [503, 0, 0, 0]);
  }
  {
    // Dos instancias: A reserva, su lease vence y B reserva el mismo documento con otro token. A no registra ni reprograma; solo B deja evidencia.
    limpiarCacheTokens();
    const m = mundo([{ lote: LOTE }]);
    const g = gateway({ consultas: [consulta("XML firmado", CDC1), consulta("XML firmado", CDC1)] });
    // mundo() expone `db` como `never` (inyectable en cualquier firma); para llamar query() directamente se usa una referencia local tipada (mismo patrón que R04-F03c).
    const dbSim = m.db as unknown as { query: (sql: string, p: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> };
    const reservaA = await dbSim.query("SELECT * FROM fe_consulta_reservar_token(1, $1::integer, $2::text[])", [300, ["FE"]]) as { rows: Array<Record<string, unknown>> };
    const tokenA = String(reservaA.rows[0].o_token);

    m.tabla.get(DOC1)!.leaseToken = null; // lease de A vencido
    await lote(m, g); // B
    let detalleA = "";

    try {
      await consultarEstado(m.db, EMPRESA, USUARIO, DOC1, g.dep, { flujoNce: true, leaseToken: tokenA });
    } catch (e) {
      detalleA = String((e as { detail?: string }).detail);
    }
    const programarA = await dbSim.query("SELECT fe_consulta_programar_token($1::uuid, $2::uuid, $3::timestamptz, $4::boolean, $5::uuid) AS ok", [EMPRESA, DOC1, new Date(m.reloj.t).toISOString(), true, tokenA]) as { rows: Array<{ ok: boolean }> };

    igual("PRO342-08d instancia con token reemplazado: NEX:LEASE_OBSOLETO, no reprograma (false) y solo hay UN intento (el de la instancia vigente)", [detalleA, programarA.rows[0].ok, m.intentos.length], ["NEX:LEASE_OBSOLETO", false, 1]);
    cierto("PRO342-08e no hay un segundo planificador: un solo setInterval en lib/facturacion (consulta-automatica.ts) y el worker sigue usando la reserva con token NEX-077", (leer("lib/facturacion/consulta-automatica.ts").match(/setInterval\(/g) ?? []).length === 1 && /fe_consulta_reservar_token/.test(leer("lib/facturacion/consulta-automatica.ts")));
  }

  // ── 9. KuDE disponible durante «XML firmado»; PRO-365-R02-C02-C02: el CDC devuelto ya no decide la aceptación del PDF ─────────────
  {
    const fe: DocumentoKude = { tipoDoc: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000001", serie: "AA" };
    const nce: DocumentoKude = { tipoDoc: "NCE", establecimiento: "001", puntoExpedicion: "001", numero: "0000003", serie: "AA" };

    igual("PRO342-09a contrato del KuDE intacto: FE cinco campos (tipoDoc FE), NCE seis (tipOpe 4, tipoDoc ncr); el CDC nunca se envía", [Object.keys(cuerpoKudeGateway(fe)), cuerpoKudeGateway(nce)], [["dEst", "dPunExp", "dNumDoc", "dSerieNum", "tipoDoc"], { tipOpe: "4", dEst: "001", dPunExp: "001", dNumDoc: "0000003", dSerieNum: "AA", tipoDoc: "ncr" }]);

    limpiarCacheTokens();
    const k1 = gatewayKude(CDC1);
    const r1 = await obtenerKudeGateway(CONFIG, fe, k1.dep);

    // PRO-365-R02-C02-C02: sin clasificación de pertenencia; el resultado solo trae el PDF.
    igual("PRO342-09b (actualizado C02-C02) documento PENDIENTE (XML firmado): el KuDE se entrega sin exigir aprobación y sin clasificación de pertenencia", [r1.ok, r1.ok ? Object.keys(r1).sort().join(",") : null, k1.pedidos[0]?.dNumDoc], [true, "ok,pdf", "0000001"]);

    limpiarCacheTokens();
    const r2 = await obtenerKudeGateway(CONFIG, fe, gatewayKude(CDC1_OTRA_EMPRESA).dep);

    // Riesgo residual (decisión del responsable): un PDF válido con el CDC de otra empresa ya no se descarta por CDC.
    igual("PRO342-09c (actualizado C02-C02) el gateway devuelve un CDC de OTRA empresa (mismo número): el CDC no condiciona el retorno (PDF entregado)", r2.ok, true);

    limpiarCacheTokens();
    const r3 = await obtenerKudeGateway(CONFIG, fe, gatewayKude(CDC2).dep);

    igual("PRO342-09d (actualizado C02-C02) CDC devuelto de OTRO número: el CDC no condiciona el retorno (PDF entregado)", r3.ok, true);

    limpiarCacheTokens();
    const r4 = await obtenerKudeGateway(CONFIG, fe, gatewayKude(null).dep);

    igual("PRO342-09e (actualizado C02-C02) respuesta sin CDC: PDF mostrado (PRO-326), sin clasificación", [r4.ok, r4.ok ? Object.keys(r4).sort().join(",") : null], [true, "ok,pdf"]);
    igual("PRO342-09f la disponibilidad del KuDE no es estado fiscal: el badge sigue «Pendiente de confirmación» y menciona XML firmado", [presentacionSifen({ estadoLocal: "ENVIADO", estadoSifen: "PENDIENTE", estadoGatewayTexto: "XML firmado" }).texto, /XML firmado/.test(presentacionSifen({ estadoLocal: "ENVIADO", estadoSifen: "PENDIENTE", estadoGatewayTexto: "XML firmado" }).detalle)], ["Pendiente de confirmación", true]);
  }

  // ── 10. Secretos saneados con CDC y lote íntegros; sin reparación de datos antiguos ───────────────────────────────────────────
  {
    limpiarCacheTokens();
    const g = gateway({ consultas: [consulta("XML firmado", CDC1, { mensaje: `Procesado para ${RUC} con token ${TOKEN}` })] });
    const r = (await consultarDocumentoGateway(CONFIG, { tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000001", serie: "AA" }, g.dep)) as ResultadoConsulta;
    const guardado = JSON.stringify(r.respuesta);

    igual("PRO342-10a consulta con clave = RUC: mensaje saneado; CDC operacional y DE.CDC EXACTOS; la consulta no envía CDC", [r.mensaje?.includes(RUC), r.mensaje?.includes(TOKEN), r.cdc, guardado.includes(`"CDC":"${CDC1}"`), Object.keys(g.cuerpos.find((c) => c.ruta === "/api/consulta_de")!.cuerpo).sort()], [false, false, CDC1, true, ["dEst", "dNumDoc", "dPunExp", "dSerieNum", "tipoDoc"]]);
    igual("PRO342-10b estados: «XML firmado» → PENDIENTE; «Aprobado»/«Rechazado» → finales; texto desconocido → NO_RECONOCIDO (nunca aprobado)", [estadoSifenDesdeGateway("XML firmado"), estadoSifenDesdeGateway("xml  firmado".replace("  ", " ")), estadoSifenDesdeGateway("Aprobado"), estadoSifenDesdeGateway("Rechazado"), estadoSifenDesdeGateway("Firmado parcial"), esFaseXmlFirmado("XML Firmado")], ["PENDIENTE", "PENDIENTE", "APROBADO", "RECHAZADO", "NO_RECONOCIDO", true]);
    igual("PRO342-10c referencia de conexión: sin RUC, clave ni token; texto legible para el historial", [JSON.stringify(referenciaConexion({ ...CONFIG, credenciales: { ruc: RUC, password: CLAVE } })).includes(RUC), textoConexion(referenciaConexion(CONFIG))], [false, "gateway.prueba.invalid · credenciales v3 del servidor"]);

    const nex079 = leer("documentacao/banco/nexit/v1/migraciones/NEX-079-facturacion-intentos-conexion-cdc-consulta.sql");
    const sinComentarios = nex079.replace(/--.*$/gm, "");

    cierto("PRO342-10d NEX-079 aditiva: no edita migraciones anteriores, no actualiza ni borra intentos históricos, no repara CDC/lote/estado de documentos existentes fuera de las funciones de registro", /parece aplicada; no se reaplica/.test(nex079) && !/UPDATE public\.documento_electronico_intentos|DELETE FROM/.test(sinComentarios) && (sinComentarios.match(/UPDATE public\.documentos_electronicos/g) ?? []).length === 3 && !/DROP FUNCTION/.test(sinComentarios));
    cierto("PRO342-10e (actualizado R03) NEX-079: la columna conexion rechaza claves de credenciales; el CDC del documento solo se fija con coalesce(d.cdc, p_cdc) y el lote con coalesce(lote, v_lote) SOLO con ENVIADO", /conexion \?\| ARRAY\['password', 'clave', 'token', 'ruc'/.test(nex079) && /cdc = coalesce\(d\.cdc, p_cdc\)/.test(nex079) && /lote = CASE WHEN p_estado_local = 'ENVIADO' THEN coalesce\(lote, v_lote\) ELSE lote END/.test(nex079));
    cierto("PRO342-10f NEX-079: las tres vías de consulta guardan cdc_informado y conexión; la vía AUTO conserva el fencing NEX:LEASE_OBSOLETO y las no manuales exigen documento pendiente", /cdc_informado, cod_respuesta, mensaje, respuesta, actor_id, conexion/.test(nex079) && /NEX:LEASE_OBSOLETO/.test(nex079) && /NEX:DOCUMENTO_NO_PENDIENTE/.test(nex079) && /'MANUAL', p_empresa/.test(nex079) && /'FLUJO', p_empresa/.test(nex079) && /'AUTO', p_empresa/.test(nex079));
  }

  // ══ PRO-342-R02 — correcciones focales F002/F003/F004 (casos ESCRITOS, NO EJECUTADOS) ══════════════════════════════════════════════════════
  const envioShared = leer("lib/facturacion/envio.ts");
  const nceEmision = leer("lib/facturacion/nce-emision.ts");
  const shared = leer("lib/facturacion/shared.ts");

  // ── R02-F003: lote LITERAL (sin trim ni normalización) ────────────────────────────────────────────────────────────────────────────────
  {
    const doc = { tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000001" };
    // Mismo contrato que enviarDocumentoGateway: interpretarRecepcion(http, texto, fases, doc) y, después, el saneamiento con CONTRATO_FISCAL_ENVIO.
    const fases: FaseEnvio[] = [];
    const recep = (lote: unknown, secretos: string[] = []) => resultadoFiscalSinSecretos(interpretarRecepcion(200, JSON.stringify({ status: "success", nro_lote: lote }), fases, doc), secretos, CONTRATO_FISCAL_ENVIO);
    const limpio = recep(LOTE);
    const espacios = recep(` ${LOTE} `);
    const finalEspacio = recep(`${LOTE} `);
    const control = recep(`${LOTE}\u0007`);
    const salto = recep(`${LOTE}\n`);
    const numerico = recep(1234567);
    const parcial = recep(LOTE, [RUC.slice(2, 6)]); // contraseña sintética = PARTE del RUC (aparece dentro del lote)

    igual("PRO342-R02-L01 lote limpio: ENVIADO con el lote EXACTO", [limpio.estadoLocal, limpio.lote], ["ENVIADO", LOTE]);
    igual("PRO342-R02-L02 lote rodeado de espacios (o con espacio final): NO se recorta ni se registra otro valor → ENVIO_INDETERMINADO sin lote y con diagnóstico", [espacios.estadoLocal, espacios.lote, finalEspacio.estadoLocal, finalEspacio.lote, /espacios al inicio o al final/.test(String(espacios.mensaje))], ["ENVIO_INDETERMINADO", null, "ENVIO_INDETERMINADO", null, true]);
    igual("PRO342-R02-L03 lote con caracteres de control (BEL, salto de línea): indeterminado sin lote (no se limpia en silencio)", [control.estadoLocal, control.lote, salto.estadoLocal, salto.lote], ["ENVIO_INDETERMINADO", null, "ENVIO_INDETERMINADO", null]);
    igual("PRO342-R02-L04 lote numérico entero: su texto exacto («1234567»)", [numerico.estadoLocal, numerico.lote], ["ENVIADO", "1234567"]);
    igual("PRO342-R02-L05 contraseña sintética = parte del RUC: el lote operacional queda EXACTO (sin «[omitido]») y la evidencia no lo mutila en la raíz", [parcial.lote, String(parcial.lote).includes("[omitido]"), JSON.stringify(parcial.respuesta).includes(`"nro_lote":"${LOTE}"`)], [LOTE, false, true]);

    // De punta a punta: el gateway devuelve el lote con espacios → el documento NO guarda un lote recortado; una sola transmisión.
    limpiarCacheTokens();
    const m = mundo([{ estadoLocal: "PENDIENTE_ENVIO" }]);
    const g = gateway({ recepcion: { status: 200, cuerpo: { status: "success", message: "Documento recibido", nro_lote: ` ${LOTE} ` } } });
    const r = await enviarDocumento(m.db, EMPRESA, USUARIO, DOC1, g.dep);

    igual("PRO342-R02-L06 envío real con lote « LOTE »: ENVIO_INDETERMINADO, el documento y el intento quedan SIN lote (nunca el recortado) y hubo UNA transmisión", [r.estadoLocal, m.tabla.get(DOC1)!.lote, m.intentos[0].lote, g.posts["/api/recepcion_de"]], ["ENVIO_INDETERMINADO", null, null, 1]);
    cierto("PRO342-R02-L07 fuente: interpretarRecepcion ya no aplica trim al lote; NEX-079 rechaza (NULL) un p_lote con espacios al inicio o al final en lugar de normalizarlo", !/String\(loteBruto\)\.trim\(\)/.test(leer("lib/facturacion/gateway.ts")) && /p_lote !~ '\^\[\[:space:\]\]\|\[\[:space:\]\]\$'/.test(leer("documentacao/banco/nexit/v1/migraciones/NEX-079-facturacion-intentos-conexion-cdc-consulta.sql")));
  }

  // ── R02-F002: UNA configuración por operación de envío; consulta/KuDE solo con la conexión del envío ──────────────────────────────────
  {
    // Cambio de configuración ENTRE el preflight y la transmisión: con la configuración del preflight, enviarDocumento no relee y transmite al host del preflight.
    limpiarCacheTokens();
    const m = mundo([{ estadoLocal: "PENDIENTE_ENVIO" }], { baseUrl: "https://otro-gateway.prueba.invalid" });
    const g = gateway();
    const preflight = { ...CONFIG };

    await enviarDocumento(m.db, EMPRESA, USUARIO, DOC1, g.dep, { config: preflight });
    igual("PRO342-R02-C01 config cambiada entre preflight y POST: no se relee fe_gateway_config, el POST va al host del preflight y el intento registra ESE host (sin secretos)", [m.sqls.filter((x) => /FROM fe_gateway_config/.test(x)).length, g.hosts.every((h) => h === "gateway.prueba.invalid"), m.intentos[0].conexion?.host, JSON.stringify(m.intentos[0].conexion).includes(CLAVE), JSON.stringify(m.intentos[0].conexion).includes(TOKEN)], [0, true, "gateway.prueba.invalid", false, false]);

    limpiarCacheTokens();
    const m2 = mundo([{ estadoLocal: "PENDIENTE_ENVIO" }]);
    const g2 = gateway();

    await enviarDocumento(m2.db, EMPRESA, USUARIO, DOC1, g2.dep);
    igual("PRO342-R02-C02 envío desde «Documentos» (sin preflight): la configuración se lee UNA vez y esa misma es la del POST y la del intento", [m2.sqls.filter((x) => /FROM fe_gateway_config/.test(x)).length, m2.intentos[0].conexion?.host], [1, "gateway.prueba.invalid"]);

    const emitir = envioShared.slice(envioShared.indexOf("export async function emitirFactura"));
    const nce = nceEmision.slice(nceEmision.indexOf("export async function emitirNce"));

    cierto("PRO342-R02-C03 fuente: emitirFactura y emitirNce leen la configuración UNA vez (preflight) y la pasan al envío; enviarDocumento solo la lee si no la recibió", (emitir.match(/configuracionGateway\(/g) ?? []).length === 1 && /enviarDocumento\(db, empresaId, usuarioId, documentoId, dep, \{ config \}\)/.test(emitir) && (nce.match(/configuracionGateway\(/g) ?? []).length === 1 && /enviarDocumento\(db, empresaId, usuarioId, documentoId, dep, \{ config \}\)/.test(nce) && /opciones\.config \?\? \(await configuracionGateway\(/.test(envioShared));
  }
  {
    // Cambio DESPUÉS del envío y antes de consultar: la consulta manual y el worker no consultan con otra conexión (409 / limitado), sin intento inventado ni reenvío.
    limpiarCacheTokens();
    const m = mundo([{ estadoLocal: "PENDIENTE_ENVIO" }]);
    const g = gateway({ consultas: [consulta("XML firmado", CDC1)] });

    await enviarDocumento(m.db, EMPRESA, USUARIO, DOC1, g.dep);
    m.opciones.baseUrl = "https://otro-gateway.prueba.invalid";
    let estado = 0;
    let mensaje = "";

    try {
      await consultarEstado(m.db, EMPRESA, USUARIO, DOC1, g.dep);
    } catch (e) {
      estado = (e as { estado?: number }).estado ?? -1;
      mensaje = String((e as Error).message);
    }
    igual("PRO342-R02-C04 conexión cambiada después del envío: consulta manual 409 «la conexión cambió», sin POST a consulta_de ni intento de consulta, y el estado fiscal no cambia", [estado, /cambió desde que este documento fue enviado/.test(mensaje), g.posts["/api/consulta_de"] ?? 0, m.intentos.filter((i) => i.tipo === "CONSULTA").length, m.tabla.get(DOC1)!.estadoSifen], [409, true, 0, 0, "SIN_CONSULTA"]);

    const lw = await lote(m, g);

    igual("PRO342-R02-C05 el worker tampoco consulta con la otra conexión: lo cuenta como «limitado», reprograma sin contar intento y no reenvía JSON", [lw.reservados, lw.limitados, lw.consultados, g.posts["/api/consulta_de"] ?? 0, g.posts["/api/recepcion_de"], m.tabla.get(DOC1)!.leaseToken, m.tabla.get(DOC1)!.consultasAuto], [1, 1, 0, 0, 1, null, 0]);

    // Con la conexión original restablecida, la misma reconsulta continúa (MISMA) y registra la conexión del intento.
    m.opciones.baseUrl = undefined;
    const r = await consultarEstado(m.db, EMPRESA, USUARIO, DOC1, g.dep);

    // PRO-342-R03: CONFIG usa credenciales de ENTORNO (PRUEBA): misma host/referencia/versión NO prueba la misma cuenta → SIN_REFERENCIA (antes MISMA).
    igual("PRO342-R02-C06 (actualizado R03) conexión original con credenciales de entorno: la consulta continúa en modo INTEGRAL con continuidad SIN_REFERENCIA (nunca MISMA); la conexión registrada no contiene secretos", [r.continuidadConexion, r.modoRegistro, m.intentos.filter((i) => i.tipo === "CONSULTA")[0].conexion?.host, JSON.stringify(m.intentos).includes(TOKEN)], ["SIN_REFERENCIA", "INTEGRAL", "gateway.prueba.invalid", false]);
  }
  {
    // Documento histórico SIN snapshot NEX-079: no se presume conexión equivocada; se consulta y se informa SIN_REFERENCIA.
    limpiarCacheTokens();
    const m = mundo([{ lote: LOTE }], { baseUrl: "https://otro-gateway.prueba.invalid" });
    const r = await consultarEstado(m.db, EMPRESA, USUARIO, DOC1, gateway({ consultas: [consulta("XML firmado", CDC1)] }).dep);

    igual("PRO342-R02-C07 sin snapshot de conexión del envío (anterior a NEX-079): consulta realizada con continuidad SIN_REFERENCIA (compatibilidad honesta, no se inventa conflicto)", [r.resultado, r.continuidadConexion], ["OK", "SIN_REFERENCIA"]);
    cierto("PRO342-R02-C08 fuente: la conexión del envío se lee por empresa_id Y documento_id de la sesión (sin cruzar tenants) y sin columnas de credenciales; DISTINTA lanza 409 antes de llamar al gateway", /i\.empresa_id = \$1 AND i\.documento_id = \$2 AND i\.tipo = 'ENVIO'/.test(shared) && !/password|token/i.test(shared.slice(shared.indexOf("export const SQL_CONEXION_ENVIO"), shared.indexOf("export const MENSAJE_CONEXION_DISTINTA"))) && /continuidad === "DISTINTA"\) throw new ErrorFacturacion\(409, MENSAJE_CONEXION_DISTINTA\)/.test(shared));
    const cont = (envio: unknown, version: number | null, host = "gateway.prueba.invalid") => continuidadConexion(envio, { host, credencialRef: "PRUEBA", credencialesVersion: version, origenCredenciales: "ENTORNO" });
    const snap = { host: "gateway.prueba.invalid", credencialRef: "PRUEBA", credencialesVersion: 3, origenCredenciales: "ENTORNO" };

    igual("PRO342-R02-C09 (actualizado R03) continuidadConexion con credenciales de ENTORNO: igual → SIN_REFERENCIA (nunca MISMA); host/versión/referencia distinta → DISTINTA; sin snapshot o versión no comparable → SIN_REFERENCIA", [cont(snap, 3), cont(snap, 4), cont(snap, 3, "otro.prueba.invalid"), cont({ ...snap, credencialRef: "OTRA" }, 3), cont(null, 3), cont({ ...snap, credencialesVersion: null }, 3), cont({ ...snap, credencialesVersion: null }, null)], ["SIN_REFERENCIA", "DISTINTA", "DISTINTA", "DISTINTA", "SIN_REFERENCIA", "SIN_REFERENCIA", "SIN_REFERENCIA"]);
  }

  // ── R02-F004 → PRO-342-R05: ya NO hay retroceso a la firma anterior; sin NEX-080 todo falla CERRADO antes del gateway ──────────────────
  {
    limpiarCacheTokens();
    reiniciarNex080ParaCasos();
    const m = mundo([{ lote: LOTE }], { sinNex080: true });
    const g = gateway({ consultas: [consulta("XML firmado", CDC1)] });
    const lw = await lote(m, g);

    reiniciarNex080ParaCasos();
    igual("PRO342-R02-F01 (actualizado R05) worker sin NEX-080: el documento cuenta como «limitado», se reprograma sin intento, sin POST a consulta_de y sin firmas anteriores", [lw.reservados, lw.limitados, lw.consultados, g.posts["/api/consulta_de"] ?? 0, m.intentos.length, m.tabla.get(DOC1)!.leaseToken, m.sqls.filter((x) => /fe_documento_registrar_consulta/.test(x)).length], [1, 1, 0, 0, 0, null, 0]);

    limpiarCacheTokens();
    reiniciarNex080ParaCasos();
    const m3 = mundo([{ estadoLocal: "PENDIENTE_ENVIO" }], { sinNex080: true });
    const g3 = gateway();
    let estado = 0;

    try {
      await enviarDocumento(m3.db, EMPRESA, USUARIO, DOC1, g3.dep);
    } catch (e) {
      estado = (e as { estado?: number }).estado ?? -1;
    }
    reiniciarNex080ParaCasos();
    igual("PRO342-R02-F03 (actualizado R05) envío sin NEX-080: 503 ANTES de iniciar el envío: sin transmisión, sin ENVIANDO, sin intento; el documento sigue PENDIENTE_ENVIO", [estado, g3.posts["/api/recepcion_de"] ?? 0, m3.iniciados(), m3.intentos.length, m3.tabla.get(DOC1)!.estadoLocal], [503, 0, 0, 0, "PENDIENTE_ENVIO"]);
    cierto("PRO342-R02-F04 (actualizado R05) fuente: sin fallback (ni SQL_SOBRECARGA_NEX079 ni modo COMPATIBILIDAD); consultarEstado llama exigirNex080 antes de la conexión y del gateway; configuracionGateway (preflight de emisión/envío) también",
      !/SQL_SOBRECARGA_NEX079|"COMPATIBILIDAD"|registrarConConexion/.test(shared) && /await exigirNex080\(db\);\s*\n\s*\n\s*\/\/ PRO-342-R02: la consulta usa la MISMA conexión/.test(shared) && /export async function configuracionGateway[\s\S]{0,200}await exigirNex080\(db\);/.test(envioShared) && /modoRegistro/.test(leer("app/api/documentos/[id]/consultar/route.ts")));
  }

  cierto("PRO342-R02-F05 (actualizado R05) pantalla: ya no existe el aviso de modo compatibilidad; se mantiene la conexión no verificable y el historial muestra «Conexión: no registrada (intento anterior a NEX-079)»", !/modoRegistro === "COMPATIBILIDAD"/.test(leer("app/(private)/documentos/page.tsx")) && /continuidadConexion === "SIN_REFERENCIA"/.test(leer("app/(private)/documentos/page.tsx")) && /Conexión: no registrada \(intento anterior a NEX-079\)/.test(leer("app/(private)/documentos/page.tsx")));


  // ══ PRO-342-R03 — R03-01 retificada (final solo con CDC), continuidad con credenciales de entorno y lote solo con ACK correlacionado (casos ESCRITOS, NO EJECUTADOS) ══════════════════════

  // ── R03-01 (retificada): XML firmado SIEMPRE tiene CDC; nunca un final con CDC NULL ──────────────────────────────────────────────────────
  {
    // Criterios 1 y 2: «XML firmado» SIN CDC → inconsistencia (no confirma la firma), seguimiento continúa; luego «XML firmado» CON CDC → CDC exacto, sigue consultando.
    limpiarCacheTokens();
    const m = mundo([{ lote: LOTE }]);
    const g = gateway({ consultas: [consulta("XML firmado", null, { kude: "habilitado" }), consulta("XML firmado", CDC1)] });

    await lote(m, g);
    const doc = m.tabla.get(DOC1)!;

    igual("PRO342-R03-F01 (actualizado R05) «XML firmado» SIN CDC: se registra como lo informó la API (OK, PENDIENTE intermedio, CDC NULL sin inventar, proyección AUSENTE); el seguimiento continúa y se reprograma la reconsulta", [m.intentos[0].resultado, m.intentos[0].estadoGateway, m.intentos[0].estadoSifen, m.intentos[0].cdcInformado, m.intentos[0].cdcProyeccion, doc.estadoSifen, doc.cdc, doc.proxima > m.reloj.t, doc.leaseToken], ["OK", "XML firmado", "PENDIENTE", null, "AUSENTE", "PENDIENTE", null, true, null]);
    avanzar(m, CADENCIA_SEGUNDOS[0]);
    await lote(m, g);
    igual("PRO342-R03-F02 la reconsulta del MISMO documento recibe «XML firmado» CON CDC: CDC exacto registrado, PENDIENTE (intermedio, no aprobación) y sigue elegible; sin reenvío del JSON", [m.intentos[1].resultado, doc.cdc, doc.estadoSifen, doc.estadoGatewayTexto, doc.proxima > m.reloj.t, g.posts["/api/recepcion_de"] ?? 0], ["OK", CDC1, "PENDIENTE", "XML firmado", true, 0]);
  }
  for (const [fin, cod, mensaje, esperado] of [["Aprobado", "0260", "Aprobado", "APROBADO"], ["Rechazado", "1101", "Número de timbrado inválido", "RECHAZADO"]] as const) {
    // Criterios 3 y 4: «XML firmado» con CDC → reconsulta → final que NO repite el CDC: se consolida con el CDC ya registrado del mismo documento.
    limpiarCacheTokens();
    const m = mundo([{ lote: LOTE }]);
    const g = gateway({ consultas: [consulta("XML firmado", CDC1), consulta(fin, null, { cod, mensaje, fecha: "2026-11-11 09:40:12" })] });

    await lote(m, g);
    avanzar(m, CADENCIA_SEGUNDOS[0]);
    await lote(m, g);
    const doc = m.tabla.get(DOC1)!;

    igual(`PRO342-R03-F03 [${fin}] XML firmado con CDC → «${fin}» sin repetir CDC: final ${esperado} con código, mensaje y fecha de firma; el CDC registrado se mantiene EXACTO`, [m.intentos.map((i) => [i.resultado, i.estadoSifen]), doc.estadoSifen, doc.codRespuesta, doc.mensajeRespuesta, doc.fechaFirma, doc.cdc, doc.lote], [[["OK", "PENDIENTE"], ["OK", esperado]], esperado, cod, mensaje, "2026-11-11 09:10:30", CDC1, LOTE]);
    avanzar(m, 3600);
    igual(`PRO342-R03-F04 [${fin}] tras el final el worker deja de consultar; ninguna consulta reenvió el JSON`, [(await lote(m, g)).reservados, m.intentos.length, g.posts["/api/recepcion_de"] ?? 0], [0, 2, 0]);
  }
  {
    // Criterio 5 (actualizado R05): final sin CDC disponible → se registra tal cual lo informó la API, con CDC NULL; por la función R05 (nunca la firma antigua NEX-054).
    limpiarCacheTokens();
    const m = mundo([{ lote: LOTE, estadoSifen: "PENDIENTE" }]);
    const r = await consultarEstado(m.db, EMPRESA, USUARIO, DOC1, gateway({ consultas: [consulta("Aprobado", null, { cod: "0260", mensaje: "Aprobado" })] }).dep);
    const doc = m.tabla.get(DOC1)!;
    const registro = [...m.sqls].reverse().find((x) => /fe_documento_registrar_consulta/.test(x)) ?? "";

    igual("PRO342-R03-F05 (actualizado R05) consulta manual «Aprobado» SIN CDC: OK, APROBADO con código, CDC NULL (no inventado), registrado por fe_documento_registrar_consulta_r05", [r.resultado, m.intentos[0].resultado, m.intentos[0].estadoSifen, doc.estadoSifen, doc.codRespuesta, doc.cdc, /fe_documento_registrar_consulta_r05\(/.test(registro)], ["OK", "OK", "APROBADO", "APROBADO", "0260", null, true]);
  }
  {
    // PRO-342-R05: CDC con «otra numeración» sin CDC registrado: NEXIT no valida composición/posiciones; el estado y el CDC se registran como los informó la API.
    limpiarCacheTokens();
    const m = mundo([{ lote: LOTE }]);

    await lote(m, gateway({ consultas: [consulta("Rechazado", CDC2, { cod: "1101", mensaje: "Número de timbrado inválido" })] }));
    const doc = m.tabla.get(DOC1)!;

    igual("PRO342-R03-F06a (actualizado R05) «Rechazado» con un CDC cuyas posiciones no coinciden con el número: OK, RECHAZADO y el CDC literal registrado (INICIAL); sin CDC_DIVERGENTE", [m.intentos[0].resultado, m.intentos[0].cdcInformado, doc.estadoSifen, doc.cdc, doc.leaseToken, m.intentos[0].cdcProyeccion], ["OK", CDC2, "RECHAZADO", CDC2, null, "INICIAL"]);

    // PRO-342-R05: CDC distinto del registrado en una respuesta aceptada: se registra el estado y el documento muestra el nuevo CDC (traza CAMBIO).
    limpiarCacheTokens();
    const m2 = mundo([{ lote: LOTE, cdc: CDC1, estadoSifen: "PENDIENTE" }]);

    await lote(m2, gateway({ consultas: [consulta("Rechazado", CDC1_OTRO, { cod: "1101", mensaje: "Número de timbrado inválido" })] }));
    igual("PRO342-R03-F06b (actualizado R05) «Rechazado» con CDC distinto del registrado: OK, RECHAZADO; el documento muestra el último CDC informado y el intento guarda el anterior (CAMBIO)", [m2.intentos[0].resultado, m2.tabla.get(DOC1)!.estadoSifen, m2.tabla.get(DOC1)!.cdc, m2.intentos[0].cdcProyeccion, m2.intentos[0].cdcAnterior], ["OK", "RECHAZADO", CDC1_OTRO, "CAMBIO", CDC1]);

    // PRO-342-R05: CDC de 25 caracteres (no 44): dato opaco, se registra literal con el estado informado.
    limpiarCacheTokens();
    const m3 = mundo([{ lote: LOTE }]);

    await lote(m3, gateway({ consultas: [consulta("Rechazado", "0180000005600100100000011", { cod: "1101", mensaje: "Número de timbrado inválido" })] }));
    igual("PRO342-R03-F06c (actualizado R05) «Rechazado» con CDC de 25 caracteres: OK, RECHAZADO y CDC registrado literal (sin validar longitud)", [m3.intentos[0].resultado, m3.tabla.get(DOC1)!.estadoSifen, m3.tabla.get(DOC1)!.cdc], ["OK", "RECHAZADO", "0180000005600100100000011"]);
  }
  {
    // HTTP 200 sin estado: pendiente (no final); se reprograma.
    limpiarCacheTokens();
    const m = mundo([{ lote: LOTE }]);

    await lote(m, gateway({ consultas: [{ status: 200, cuerpo: { status: "success", response: { DE: { Retorno: { CodRespuesta: null, Mensaje: null } } } } }] }));
    const doc = m.tabla.get(DOC1)!;

    igual("PRO342-R03-F07 HTTP 200 SIN estado: RESPUESTA_INVALIDA, el documento sigue pendiente (SIN_CONSULTA) y se reprograma la reconsulta", [m.intentos[0].resultado, m.intentos[0].http, doc.estadoSifen, doc.proxima > m.reloj.t, doc.leaseToken], ["RESPUESTA_INVALIDA", 200, "SIN_CONSULTA", true, null]);

    // Un final ya registrado no retrocede ni cambia por una consulta posterior sin CDC.
    limpiarCacheTokens();
    const m2 = mundo([{ lote: LOTE, estadoSifen: "RECHAZADO", codRespuesta: "1101", mensajeRespuesta: "Número de timbrado inválido" }]);
    const r = await consultarEstado(m2.db, EMPRESA, USUARIO, DOC1, gateway({ consultas: [consulta("Aprobado", null, { cod: "0260", mensaje: "Aprobado" })] }).dep);

    igual("PRO342-R03-F08 documento ya RECHAZADO y la API informa «Aprobado» sin CDC: RESPUESTA_INVALIDA; el estado, código y mensaje registrados no cambian", [r.resultado, m2.tabla.get(DOC1)!.estadoSifen, m2.tabla.get(DOC1)!.codRespuesta, m2.tabla.get(DOC1)!.mensajeRespuesta], ["RESPUESTA_INVALIDA", "RECHAZADO", "1101", "Número de timbrado inválido"]);
  }
  {
    const doc = { tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000001", cdc: null as string | null, estadoSifen: "PENDIENTE" };
    const rc = (estadoGateway: string, cdc: string | null): ResultadoConsulta => ({ resultado: "OK", http: 200, estadoGateway, estadoSifen: estadoSifenDesdeGateway(estadoGateway), cdc, codRespuesta: "1101", mensaje: "m", fechaFirma: null, fechaEnvio: null, respuesta: null });
    const d = (x: typeof doc, r: ResultadoConsulta) => { const y = decidirConsulta(x, r); return [y.resultado, y.estadoSifen, y.cdc]; };
    const conCdc = { ...doc, cdc: CDC1 };

    // PRO-342-R05: decidirConsulta ya no tiene NINGUNA condición sobre el CDC; solo la guarda de estado final contradictorio.
    igual("PRO342-R03-F09 (actualizado R05) decidirConsulta (pura): con o sin CDC (en la respuesta o registrado), Rechazado/Aprobado/«XML firmado» → OK con el CDC de la respuesta tal cual (o null); solo un final contrario a uno registrado → RESPUESTA_INVALIDA", [
      d(doc, rc("Rechazado", null)), d(doc, rc("Aprobado", null)), d(doc, rc("XML firmado", null)), d(doc, rc("XML firmado", CDC1)),
      d(conCdc, rc("Rechazado", null)), d(conCdc, rc("XML firmado", null)), d(doc, rc("Rechazado", CDC2)), d({ ...conCdc, estadoSifen: "RECHAZADO" }, rc("Aprobado", null)),
    ], [["OK", "RECHAZADO", null], ["OK", "APROBADO", null], ["OK", "PENDIENTE", null], ["OK", "PENDIENTE", CDC1], ["OK", "RECHAZADO", null], ["OK", "PENDIENTE", null], ["OK", "RECHAZADO", CDC2], ["RESPUESTA_INVALIDA", null, null]]);

    const nex079 = leer("documentacao/banco/nexit/v1/migraciones/NEX-079-facturacion-intentos-conexion-cdc-consulta.sql");
    const sinComentarios = nex079.replace(/--.*$/gm, "");

    cierto("PRO342-R03-F10 (histórico; la aplicación R05 ya no usa NEX-079) NEX-079 (no aplicada): un final exige CDC válido y coherente (coalesce(p_cdc, d.cdc) IS NULL OR NOT fe_cdc_coherente → RESPUESTA_INVALIDA), como NEX-062/077; CDC_DIVERGENTE y el CDC fijado una vez se conservan", /coalesce\(p_cdc, d\.cdc\) IS NULL OR NOT public\.fe_cdc_coherente/.test(sinComentarios) && !/IS NOT NULL AND NOT public\.fe_cdc_coherente/.test(sinComentarios) && /cdc = coalesce\(d\.cdc, p_cdc\)/.test(sinComentarios) && /CDC_DIVERGENTE/.test(sinComentarios));
    const rec = leer("lib/facturacion/reconciliacion.ts");

    cierto("PRO342-R03-F11 (actualizado R05) reconciliacion.ts: sin bloqueos por CDC (ni «final sin CDC», ni «XML firmado sin CDC»); conserva la guarda de final contradictorio; no calcula, completa ni valida CDC", /FINALES\.has\(previo\)/.test(rec) && /EVOLUCIONES/.test(rec) && !/esFaseXmlFirmado\(|sinCdc|r\.cdc === null/.test(rec) && !/fe_cdc_coherente|cdcCoherente|calcular|generar/i.test(rec));
  }

  // ── R03-03: el lote del documento SOLO con ACK correlacionado (ENVIADO) ────────────────────────────────────────────────────────────────────
  {
    const doc = { tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000001" };
    const recep = (cuerpo: unknown, http = 200) => interpretarRecepcion(http, JSON.stringify(cuerpo), [], doc);
    const ecoAjeno = recep({ status: "success", nro_lote: LOTE, dEst: "001", dPunExp: "001", dNumDoc: "0000002" });
    const aceptadoAjeno = recep({ status: "success", nro_lote: LOTE, response: { Aceptados: ["001-001-0000002"], Rechazados: [] } });
    const error = recep({ status: "error", message: "Error de validación", nro_lote: LOTE });
    const propio = recep({ status: "success", message: "Documento recibido", nro_lote: LOTE });

    igual("PRO342-R03-L01 success + nro_lote válido + eco fiscal de OTRO documento: ENVIO_INDETERMINADO y SIN lote del documento", [ecoAjeno.estadoLocal, ecoAjeno.lote], ["ENVIO_INDETERMINADO", null]);
    igual("PRO342-R03-L02 success + nro_lote válido + Aceptados de OTRO documento: ENVIO_INDETERMINADO y SIN lote del documento", [aceptadoAjeno.estadoLocal, aceptadoAjeno.lote], ["ENVIO_INDETERMINADO", null]);
    igual("PRO342-R03-L03 status:error con nro_lote: no es ACK de recepción → sin lote del documento", [error.estadoLocal === "ENVIADO", error.lote], [false, null]);
    igual("PRO342-R03-L04 éxito propio correcto: ENVIADO con el lote EXACTO", [propio.estadoLocal, propio.lote], ["ENVIADO", LOTE]);

    // De punta a punta: el lote de una respuesta que no es ACK del documento no queda en documentos_electronicos.lote ni en el lote del intento; una sola transmisión, sin reenvío.
    const casos: Array<[string, unknown]> = [
      ["eco de otro documento", { status: "success", nro_lote: LOTE, dEst: "001", dPunExp: "001", dNumDoc: "0000002" }],
      ["Aceptados de otro documento", { status: "success", nro_lote: LOTE, response: { Aceptados: ["001-001-0000002"], Rechazados: [] } }],
      ["status:error con lote", { status: "error", message: "Error de validación", nro_lote: LOTE }],
    ];

    for (const [nombre, cuerpo] of casos) {
      limpiarCacheTokens();
      const m = mundo([{ estadoLocal: "PENDIENTE_ENVIO" }]);
      const g = gateway({ recepcion: { status: 200, cuerpo } });
      const r = await enviarDocumento(m.db, EMPRESA, USUARIO, DOC1, g.dep);

      igual(`PRO342-R03-L05 envío real [${nombre}]: no ENVIADO, el documento y el intento quedan SIN lote y hubo UNA transmisión`, [r.estadoLocal === "ENVIADO", r.lote, m.tabla.get(DOC1)!.lote, m.intentos[0].lote, g.posts["/api/recepcion_de"]], [false, null, null, null, 1]);
    }

    // Timeout sin ACK: indeterminado, sin lote y sin reenvío automático.
    limpiarCacheTokens();
    const m = mundo([{ estadoLocal: "PENDIENTE_ENVIO" }]);
    const g = gateway();
    const fetchCaido: FetchLike = async (url, init) => {
      if (new URL(url).pathname === "/api/recepcion_de") {
        g.posts["/api/recepcion_de"] = (g.posts["/api/recepcion_de"] ?? 0) + 1;
        throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
      }

      return g.fetch(url, init);
    };
    const r = await enviarDocumento(m.db, EMPRESA, USUARIO, DOC1, { fetch: fetchCaido, env: ENV });

    igual("PRO342-R03-L06 timeout sin ACK: ENVIO_INDETERMINADO, sin lote en el documento ni en el intento, UNA transmisión y sin reenvío automático", [r.estadoLocal, r.lote, m.tabla.get(DOC1)!.lote, m.intentos[0]?.lote ?? null, g.posts["/api/recepcion_de"]], ["ENVIO_INDETERMINADO", null, null, null, 1]);

    // Éxito propio de punta a punta: lote fijado intacto.
    limpiarCacheTokens();
    const m2 = mundo([{ estadoLocal: "PENDIENTE_ENVIO" }]);

    await enviarDocumento(m2.db, EMPRESA, USUARIO, DOC1, gateway().dep);
    igual("PRO342-R03-L07 éxito propio: documento e intento con el lote EXACTO", [m2.tabla.get(DOC1)!.lote, m2.intentos[0].lote], [LOTE, LOTE]);

    // PRO-342-R05: sin retroceso a firmas anteriores; el envío se registra con fe_documento_registrar_envio_r05 (UN parámetro de CDC + conexión = 15 parámetros).
    limpiarCacheTokens();
    const m3 = mundo([{ estadoLocal: "PENDIENTE_ENVIO" }]);

    await enviarDocumento(m3.db, EMPRESA, USUARIO, DOC1, gateway({ recepcion: { status: 200, cuerpo: casos[0][1] } }).dep);
    const reg = m3.sqls.filter((x) => /fe_documento_registrar_envio/.test(x));

    igual("PRO342-R03-L08 (actualizado R05) respuesta de otro documento: el lote tampoco se fija; registro por fe_documento_registrar_envio_r05 con 15 parámetros y conexión", [m3.tabla.get(DOC1)!.lote, m3.intentos[0].lote, m3.intentos[0].conexion?.host, reg.length, /fe_documento_registrar_envio_r05\([\s\S]*\$15::jsonb\) AS resultado/.test(reg[0] ?? ""), /\$16/.test(reg[0] ?? "")], [null, null, "gateway.prueba.invalid", 1, true, false]);
    cierto("PRO342-R03-L09 fuente: interpretarRecepcion entrega lote solo con ENVIADO; NEX-079 inserta el lote del intento y fija el del documento solo con p_estado_local = 'ENVIADO'", /lote: estado === "ENVIADO" \? loteValido : null/.test(leer("lib/facturacion/gateway.ts")) && /CASE WHEN p_estado_local = 'ENVIADO' THEN v_lote END/.test(leer("documentacao/banco/nexit/v1/migraciones/NEX-079-facturacion-intentos-conexion-cdc-consulta.sql")));
  }

  // ── R03-02: credenciales de ENTORNO nunca MISMA; NEXIT_DB con versión conocida igual → MISMA ───────────────────────────────────────────────────
  {
    // Dos claves de entorno distintas con mismo host/referencia/versión: la consulta no puede afirmar la misma cuenta.
    limpiarCacheTokens();
    const m = mundo([{ estadoLocal: "PENDIENTE_ENVIO" }]);

    await enviarDocumento(m.db, EMPRESA, USUARIO, DOC1, gateway().dep);
    limpiarCacheTokens();
    const g2 = gateway({ consultas: [consulta("XML firmado", CDC1)] });
    const r = await consultarEstado(m.db, EMPRESA, USUARIO, DOC1, { fetch: g2.fetch, env: { ...ENV, NEXIT_FE_PRUEBA_PASSWORD: "otra-clave-sintetica-r03" } });

    igual("PRO342-R03-C01 credenciales de ENTORNO con otra clave (mismo host/referencia/versión): continuidad SIN_REFERENCIA (nunca MISMA); la conexión registrada no guarda clave, token ni RUC", [r.resultado, r.continuidadConexion, JSON.stringify(m.intentos).includes("otra-clave-sintetica-r03"), JSON.stringify(m.intentos.map((i) => i.conexion)).includes(RUC), JSON.stringify(m.intentos).includes(TOKEN)], ["OK", "SIN_REFERENCIA", false, false, false]);

    // Host cambiado: 409 aun con credenciales de entorno.
    m.opciones.baseUrl = "https://otro-gateway.prueba.invalid";
    let estado = 0;

    try {
      await consultarEstado(m.db, EMPRESA, USUARIO, DOC1, gateway({ consultas: [consulta("XML firmado", CDC1)] }).dep);
    } catch (e) {
      estado = (e as { estado?: number }).estado ?? -1;
    }
    igual("PRO342-R03-C02 host cambiado después del envío: 409 (DISTINTA) también con credenciales de entorno", estado, 409);

    const ent = (envio: unknown, version: number | null) => continuidadConexion(envio, { host: "gateway.prueba.invalid", credencialRef: "PRUEBA", credencialesVersion: version, origenCredenciales: "ENTORNO" });
    const snapEnt = { host: "gateway.prueba.invalid", credencialRef: "PRUEBA", credencialesVersion: 3, origenCredenciales: "ENTORNO" };
    const bas = (envio: unknown, version: number | null, host = "gw.prueba.invalid") => continuidadConexion(envio, { host, credencialRef: "NEXIT_DB", credencialesVersion: version, origenCredenciales: "BASE" });
    const snapBase = { host: "gw.prueba.invalid", credencialRef: "NEXIT_DB", credencialesVersion: 3, origenCredenciales: "BASE" };

    igual("PRO342-R03-C03 ENTORNO: misma versión → SIN_REFERENCIA; versión null/null → SIN_REFERENCIA; versión cambiada → DISTINTA", [ent(snapEnt, 3), ent({ ...snapEnt, credencialesVersion: null }, null), ent(snapEnt, 4)], ["SIN_REFERENCIA", "SIN_REFERENCIA", "DISTINTA"]);
    igual("PRO342-R03-C04 NEXIT_DB (BASE): misma versión conocida → MISMA; versión alterada → DISTINTA; versión ausente → SIN_REFERENCIA (no es prueba); host cambiado → DISTINTA; origen distinto → DISTINTA", [bas(snapBase, 3), bas(snapBase, 4), bas(snapBase, null), bas({ ...snapBase, credencialesVersion: null }, 3), bas(snapBase, 3, "otro.prueba.invalid"), bas({ ...snapBase, origenCredenciales: "ENTORNO" }, 3)], ["MISMA", "DISTINTA", "SIN_REFERENCIA", "SIN_REFERENCIA", "DISTINTA", "DISTINTA"]);
    igual("PRO342-R03-C05 referenciaConexion: NEXIT_DB → origen BASE; credenciales de entorno → ENTORNO; nunca incluye usuario, clave, token ni hash", [referenciaConexion({ ...CONFIG, credencialRef: "NEXIT_DB" }).origenCredenciales, referenciaConexion(CONFIG).origenCredenciales, Object.keys(referenciaConexion(CONFIG)).sort()], ["BASE", "ENTORNO", ["credencialRef", "credencialesVersion", "host", "origenCredenciales"]]);
    // PRO-365-R02-C02: la advertencia se conserva con texto llano en textoConsultaOperador (documentos-copy-operador.ts), que la pantalla usa tras «Consultar estado».
    cierto("PRO342-R03-C06 (actualizado PRO-365-R02-C02) pantalla: tras «Reconsultar» la continuidad SIN_REFERENCIA se informa como no comprobada (misma cuenta del envío)",
      /const texto = textoConsultaOperador\(j\.resultado, j\.continuidadConexion\);/.test(leer("app/(private)/documentos/page.tsx")) && /continuidad === "SIN_REFERENCIA" \? " Aviso: no se pudo comprobar que la consulta usara la misma cuenta del envío\."/.test(leer("lib/facturacion/documentos-copy-operador.ts")));
  }

  // ══ PRO-342-R04 — matriz de la reauditoría integral (sección 4). Casos ESCRITOS, NO EJECUTADOS ═══════════════════════════════════════════════════════
  // Ya cubiertos por casos vigentes de este archivo (se mantienen): A1/A5 → PRO342-01*, R02-L*, 10a; A2 → R03-L06; A3 → R03-L01..L05; B1 → 03a/R03-F02; B2 → R03-F01;
  // B6 → R03-F06a/b; C1/C2 → R03-F03/F04; C3 → R03-F05; C4 → R03-F08; C5 → R03-F07; D3/D4/D7 → 04a/R03-F04/08*; E1/E4 → 09*/kude.casos R02-K05. A4 → nce/kude casos INT-01.
  // D1/D2/D5/D6 (NEX-077/079 aplicadas en PostgreSQL real, dos instancias reales) y E6/F9 (prueba del proveedor, captura real de NEXIT) NO son simulables aquí: gates de homologación.
  type VistaDoc = Parameters<typeof iconosEstado>[0] & Parameters<typeof detalleFiscalPrimario>[0];
  const vista = (x: Partial<VistaDoc>): VistaDoc => ({ estadoLocal: "ENVIADO", estadoSifen: "PENDIENTE", estadoEmail: "NO_INFORMADO", cdc: null, ultimaConsultaResultado: null, envioErrorTipo: null, lote: null, fechaFirma: null, codRespuesta: null, mensajeRespuesta: null, ...x });
  const deMundo = (d: DocMundo, extra: Partial<VistaDoc> = {}) => vista({ estadoLocal: d.estadoLocal as never, estadoSifen: d.estadoSifen as never, cdc: d.cdc, ultimaConsultaResultado: d.ultimaConsultaResultado, lote: d.lote, fechaFirma: d.fechaFirma, codRespuesta: d.codRespuesta, mensajeRespuesta: d.mensajeRespuesta, ...extra });
  const ejes = (v: VistaDoc) => iconosEstado(v).map((i) => [i.eje, i.simbolo, i.tono]);
  const pagina = leer("app/(private)/documentos/page.tsx");
  const css = leer("app/(private)/documentos/page.module.css");

  // ── R04-F01 / B3: «XML firmado» SIN CDC en la respuesta ACTUAL con CDC ya registrado ─────────────────────────────────────────────────────────────
  {
    limpiarCacheTokens();
    const m = mundo([{ lote: LOTE, cdc: CDC1, estadoSifen: "PENDIENTE", estadoGatewayTexto: "XML firmado", codRespuesta: null, mensajeRespuesta: null, fechaFirma: "2026-11-11 09:10:30" }]);
    const g = gateway({ consultas: [consulta("XML firmado", null, { kude: "habilitado" }), consulta("Rechazado", null, { cod: "1101", mensaje: "Número de timbrado inválido" })] });

    await lote(m, g);
    const doc = m.tabla.get(DOC1)!;

    igual("PRO342-R04-B3a (actualizado R05) worker: «XML firmado» SIN CDC en la respuesta actual con CDC ya registrado → OK/PENDIENTE (intermedio); el CDC previo NO se borra (AUSENTE), reconsulta reprogramada y sin reenvío",
      [m.intentos[0].resultado, m.intentos[0].cdcProyeccion, m.intentos[0].estadoSifen, m.intentos[0].cdcInformado, doc.cdc, doc.estadoSifen, doc.estadoGatewayTexto, doc.fechaFirma, doc.ultimaConsultaResultado, doc.proxima > m.reloj.t, doc.leaseToken, g.posts["/api/recepcion_de"] ?? 0],
      ["OK", "AUSENTE", "PENDIENTE", null, CDC1, "PENDIENTE", "XML firmado", "2026-11-11 09:10:30", "OK", true, null, 0]);
    avanzar(m, CADENCIA_SEGUNDOS[0]);
    await lote(m, g);
    igual("PRO342-R04-B3b la reconsulta siguiente del MISMO documento recibe «Rechazado» final sin repetir CDC: se consolida con el CDC YA registrado (regla del responsable), código y mensaje exactos",
      [m.intentos[1].resultado, doc.estadoSifen, doc.cdc, doc.codRespuesta, doc.mensajeRespuesta, g.posts["/api/consulta_de"], g.posts["/api/recepcion_de"] ?? 0], ["OK", "RECHAZADO", CDC1, "1101", "Número de timbrado inválido", 2, 0]);

    limpiarCacheTokens();
    const m2 = mundo([{ lote: LOTE, cdc: CDC1, estadoSifen: "PENDIENTE", estadoGatewayTexto: "XML firmado" }]);
    const r = await consultarEstado(m2.db, EMPRESA, USUARIO, DOC1, gateway({ consultas: [consulta("XML firmado", null)] }).dep);

    igual("PRO342-R04-B3c (actualizado R05) consulta manual «XML firmado» sin CDC actual con CDC registrado: OK por la función R05; CDC registrado intacto y estado PENDIENTE",
      [r.resultado, m2.intentos[0].resultado, m2.tabla.get(DOC1)!.cdc, m2.tabla.get(DOC1)!.estadoSifen], ["OK", "OK", CDC1, "PENDIENTE"]);
  }
  {
    const doc = { tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000001", cdc: CDC1 as string | null, estadoSifen: "PENDIENTE" };
    const rc = (estadoGateway: string, cdc: string | null): ResultadoConsulta => ({ resultado: "OK", http: 200, estadoGateway, estadoSifen: estadoSifenDesdeGateway(estadoGateway), cdc, codRespuesta: null, mensaje: null, fechaFirma: null, fechaEnvio: null, respuesta: null });
    const y = decidirConsulta(doc, rc("XML firmado", null));

    igual("PRO342-R04-B3d (actualizado R05) decidirConsulta (pura): con CDC registrado, «XML firmado» sin CDC actual → OK (sin mensaje de bloqueo), también con otra caja/espacios; «XML firmado» + CDC → OK; «Aprobado» sin CDC → OK/APROBADO",
      [y.resultado, /^CDC ausente en XML firmado/.test(String(y.mensaje)), decidirConsulta(doc, rc(" xml FIRMADO ", null)).resultado, decidirConsulta(doc, rc("XML firmado", CDC1)).resultado, decidirConsulta(doc, rc("Aprobado", null)).estadoSifen],
      ["OK", false, "OK", "OK", "APROBADO"]);
    igual("PRO342-R04-B6 (actualizado R05) decidirConsulta: «XML firmado» con CDC DISTINTO del registrado → OK con el CDC literal (la SQL R05 lo proyecta con traza CAMBIO)", [decidirConsulta(doc, rc("XML firmado", CDC1_OTRO)).resultado, decidirConsulta(doc, rc("XML firmado", CDC1_OTRO)).cdc], ["OK", CDC1_OTRO]);
    cierto("PRO342-R04-F01 (actualizado R05) fuente reconciliacion.ts: la regla «XML firmado exige CDC» y la de «final exige CDC» fueron retiradas (REGLA DEFINITIVA: NEXIT no valida el CDC)",
      !/esFaseXmlFirmado\(r\.estadoGateway\)|sinCdc|CDC ausente en XML firmado/.test(leer("lib/facturacion/reconciliacion.ts")) && /NEXIT NO valida el CDC/.test(leer("lib/facturacion/reconciliacion.ts")));
  }
  {
    // B6 de punta a punta (actualizado R05): «XML firmado» con otro CDC sobre documento con CDC → OK; se proyecta el último informado y el anterior queda trazado.
    limpiarCacheTokens();
    const m = mundo([{ lote: LOTE, cdc: CDC1, estadoSifen: "PENDIENTE", estadoGatewayTexto: "XML firmado" }]);

    await lote(m, gateway({ consultas: [consulta("XML firmado", CDC1_OTRO)] }));
    igual("PRO342-R04-B6b (actualizado R05) worker: «XML firmado» con CDC distinto del registrado → OK (CDC informado exacto), el documento muestra el nuevo, el intento guarda el anterior (CAMBIO) y sigue pendiente", [m.intentos[0].resultado, m.intentos[0].cdcInformado, m.tabla.get(DOC1)!.cdc, m.tabla.get(DOC1)!.estadoSifen, m.intentos[0].cdcProyeccion, m.intentos[0].cdcAnterior], ["OK", CDC1_OTRO, CDC1_OTRO, "PENDIENTE", "CAMBIO", CDC1]);
  }

  // ── R04-F02 / B4-B5: CDC LITERAL, sin trim ni normalización ─────────────────────────────────────────────────────────────────────────────────────
  {
    const ic = (estado: string, cdc: unknown) => {
      const r = interpretarConsulta(200, JSON.stringify({ status: "success", response: { Estado: estado, DE: { CDC: cdc, FechaFirma: "2026-11-11 09:10:30", Retorno: { CodRespuesta: "1101", Mensaje: "Número de timbrado inválido" } } } }));

      return [r.resultado, r.estadoSifen, r.cdc];
    };
    const malos: unknown[] = [` ${CDC1}`, `${CDC1} `, `${CDC1}\n`, `\t${CDC1}`, CDC1.slice(0, 43), `${CDC1}0`, `A${CDC1.slice(1)}`, Number(CDC1)];

    igual("PRO342-R04-B5a interpretarConsulta: «XML firmado» con CDC exacto → OK/PENDIENTE y el MISMO texto de 44 dígitos (sin tocar)", ic("XML firmado", CDC1), ["OK", "PENDIENTE", CDC1]);
    igual("PRO342-R04-B5b (actualizado R05) interpretarConsulta: «XML firmado» con CDC de cualquier forma (espacios/salto/tab en extremos, 43 o 45 dígitos, letra) → OK/PENDIENTE con el MISMO texto, sin recortar; un número JSON no se convierte (CDC null) y NO invalida el estado", malos.map((c) => ic("XML firmado", c)), malos.map((c) => ["OK", "PENDIENTE", typeof c === "string" ? c : null]));
    igual("PRO342-R04-B5c (actualizado R05) interpretarConsulta: final «Rechazado»/«Aprobado» con CDC con espacios → OK con el final y el CDC literal (sin recorte)", [ic("Rechazado", ` ${CDC1} `), ic("Aprobado", `${CDC1} `)], [["OK", "RECHAZADO", ` ${CDC1} `], ["OK", "APROBADO", `${CDC1} `]]);
    igual("PRO342-R04-B5d (actualizado R05) interpretarConsulta: «XML firmado» sin campo CDC (ausente o vacío) → OK sin CDC (ya no se bloquea después)", [ic("XML firmado", undefined), ic("XML firmado", null), ic("XML firmado", "")], [["OK", "PENDIENTE", null], ["OK", "PENDIENTE", null], ["OK", "PENDIENTE", null]]);
    igual("PRO342-R04-B5e (actualizado R05) cdcInformadoPorApi (reemplaza cdcLiteral): todo texto no vacío se conserva literal; ausente/null/\"\" = no informado; número JSON presente pero NO_TEXTO (no se convierte)", [cdcInformadoPorApi(CDC1), cdcInformadoPorApi(` ${CDC1}`), cdcInformadoPorApi(undefined), cdcInformadoPorApi(null), cdcInformadoPorApi(""), cdcInformadoPorApi(Number(CDC1))], [{ presente: true, valor: CDC1, motivo: null }, { presente: true, valor: ` ${CDC1}`, motivo: null }, { presente: false, valor: null, motivo: null }, { presente: false, valor: null, motivo: null }, { presente: false, valor: null, motivo: null }, { presente: true, valor: null, motivo: "NO_TEXTO" }]);

    const docR = { tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000001" };
    const ack = (cdc: unknown) => interpretarRecepcion(200, JSON.stringify({ status: "success", message: "Documento recibido", nro_lote: LOTE, cdc }), [], docR).cdcInformado;

    igual("PRO342-R04-B5f (actualizado R05) interpretarRecepcion: el CDC de la raíz del ACK se lee LITERAL — exacto, con espacios o de 43 caracteres se conserva tal cual; número JSON → null (no se convierte); sin CDC → null", [ack(CDC1), ack(` ${CDC1} `), ack(CDC1.slice(0, 43)), ack(Number(CDC1)), ack(undefined)], [CDC1, ` ${CDC1} `, CDC1.slice(0, 43), null, null]);
    const gw = leer("lib/facturacion/gateway.ts");

    cierto("PRO342-R04-F02 (actualizado R05) fuente gateway.ts: el CDC no pasa por texto() ni .trim(); consulta y ACK usan cdcInformadoPorApi (dato opaco) y cdcLiteral ya no existe", /const cdc = cdcInformadoPorApi\(de\?\.CDC\)\.valor;/.test(gw) && /const cdcInformado = cdcInformadoPorApi\(cdcBruto\)\.valor;/.test(gw) && !/texto\(de\.CDC/.test(gw) && !/cdcBruto\.trim\(\)/.test(gw) && !/function cdcLiteral/.test(gw));

    // B4 de punta a punta (actualizado R05): CDC con espacios en «XML firmado» con CDC local existente: se guarda literal y se proyecta (traza CAMBIO).
    limpiarCacheTokens();
    const m = mundo([{ lote: LOTE, cdc: CDC1, estadoSifen: "PENDIENTE", estadoGatewayTexto: "XML firmado" }]);

    await lote(m, gateway({ consultas: [consulta("XML firmado", ` ${CDC1} `)] }));
    igual("PRO342-R04-B4 (actualizado R05) worker: «XML firmado» con CDC con espacios y CDC local existente → OK; el intento guarda el texto EXACTO (sin trim) y el documento muestra ese último informado (CAMBIO, anterior trazado)", [m.intentos[0].resultado, m.intentos[0].cdcInformado, m.tabla.get(DOC1)!.cdc, m.tabla.get(DOC1)!.estadoSifen, m.intentos[0].cdcProyeccion, m.intentos[0].cdcAnterior], ["OK", ` ${CDC1} `, ` ${CDC1} `, "PENDIENTE", "CAMBIO", CDC1]);
  }

  // ── R04-F03: guarda complementaria en NEX-079 (versionada, NO aplicada) — HISTÓRICA en R05: la aplicación usa solo las funciones *_r05 de NEX-080 ───────────────────────────────────────────────────────────────────────────
  {
    const nex079 = leer("documentacao/banco/nexit/v1/migraciones/NEX-079-facturacion-intentos-conexion-cdc-consulta.sql").replace(/--.*$/gm, "");
    const guarda = nex079.slice(nex079.indexOf("p_estado_sifen = 'PENDIENTE' AND lower(btrim(coalesce(p_estado_gateway"), nex079.indexOf("INSERT INTO public.documento_electronico_intentos (empresa_id, documento_id, tipo, resultado"));

    cierto("PRO342-R04-F03a (histórico, sin uso en R05) NEX-079: «XML firmado» PENDIENTE sin CDC literal de 44 dígitos EN LA RESPUESTA (p_cdc) → RESPUESTA_INVALIDA aunque d.cdc exista (la guarda no usa coalesce con d.cdc); va antes del INSERT y solo anota el intento",
      guarda.length > 0 && /p_cdc IS NULL OR p_cdc !~ '\^\[0-9\]\{44\}\$'/.test(guarda) && !/coalesce\(p_cdc, d\.cdc\)/.test(guarda) && /v_resultado := 'RESPUESTA_INVALIDA'/.test(guarda) && /CDC ausente en XML firmado/.test(guarda));
    cierto("PRO342-R04-F03b (histórico, sin uso en R05) NEX-079 sigue sin DROP FUNCTION, sin tocar migraciones previas, con las MISMAS 3 escrituras de documentos (UPDATE OK / UPDATE solo última consulta / UPDATE envío), guarda de finales con coalesce y sin btrim del CDC",
      !/DROP FUNCTION/i.test(nex079) && (nex079.match(/UPDATE public\.documentos_electronicos/g) ?? []).length === 3 && /coalesce\(p_cdc, d\.cdc\) IS NULL OR NOT public\.fe_cdc_coherente/.test(nex079) && !/btrim\(p_cdc|trim\(p_cdc/.test(nex079));

    limpiarCacheTokens();
    const m = mundo([{ lote: LOTE, cdc: CDC1, estadoSifen: "PENDIENTE", estadoGatewayTexto: "XML firmado" }]);
    const db = m.db as unknown as { query: (sql: string, p: unknown[]) => Promise<{ rows: Array<{ resultado: string }> }> };
    const resultadoSql = await db.query("SELECT public.fe_documento_registrar_consulta_r05($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb) AS resultado", [EMPRESA, USUARIO, DOC1, "OK", 200, null, "XML firmado", "PENDIENTE", null, null, null, null, null, null, JSON.stringify({ host: "gateway.prueba.invalid" })]);

    igual("PRO342-R04-F03c (actualizado R05) llamada DIRECTA a la función R05 (simulada) con «XML firmado» PENDIENTE y p_cdc NULL sobre documento con CDC: OK; el CDC registrado NO se borra (AUSENTE) y el estado sigue PENDIENTE", [resultadoSql.rows[0].resultado, m.tabla.get(DOC1)!.cdc, m.tabla.get(DOC1)!.estadoSifen, m.intentos[0].estadoSifen, m.intentos[0].cdcProyeccion], ["OK", CDC1, "PENDIENTE", "PENDIENTE", "AUSENTE"]);
  }

  // ── R04-UX01: cuatro iconos independientes (funciones reales) ────────────────────────────────────────────────────────────────────────────────────
  {
    // F2: el caso del proveedor de punta a punta — XML firmado + CDC → Rechazado 1101 → Enviado ✓ · XML ✓ · SIFEN ✕ · Correo neutro.
    limpiarCacheTokens();
    const m = mundo([{ lote: LOTE }]);
    const g = gateway({ consultas: [consulta("XML firmado", CDC1), consulta("Rechazado", null, { cod: "1101", mensaje: "Número de timbrado inválido" })] });

    await lote(m, g);
    avanzar(m, CADENCIA_SEGUNDOS[0]);
    await lote(m, g);
    const v = deMundo(m.tabla.get(DOC1)!);
    const iconos = iconosEstado(v);
    const fiscal = detalleFiscalPrimario(v);

    igual("PRO342-R04-F2a XML firmado + CDC → Rechazado final: ENVÍO ✓ verde, XML/CDC archivo ✓ azul, SIFEN ✕ rojo, CORREO neutro — cuatro estados que coexisten", ejes(v), [["envio", "check", "ok"], ["xml", "archivoCheck", "info"], ["sifen", "cruz", "error"], ["correo", "correo", "neutro"]]);
    igual("PRO342-R04-F2b (texto SIFEN actualizado R05) tooltip/aria de cada icono nombra su eje y no mezcla aprobación: XML firmado «No es aprobación SIFEN»; envío «No es aprobación SIFEN»; correo «independiente del estado SIFEN»", [iconos[0].texto.startsWith("Envío:"), /No es aprobación SIFEN/.test(iconos[0].texto), iconos[1].texto.startsWith("XML/CDC:"), /No es aprobación SIFEN/.test(iconos[1].texto), /rechazo fiscal informado por la API/.test(iconos[2].texto), /independiente del estado SIFEN/.test(iconos[3].texto)], [true, true, true, true, true, true]);
    igual("PRO342-R04-F3/F5 (actualizado R05) primera capa: SOLO lote literal, CDC exacto, fecha de firma de la API y «código · mensaje» exactos; rojo por RECHAZADO persistido (sin condición de CDC); cabecera «Enviado · CDC informado · SIFEN Rechazado» (PRE-VM-R02-A, D3: el eje XML/CDC dice «CDC informado»; la presencia del CDC no prueba la firma del XML)",
      [fiscal, resumenFases(v)], [{ lote: LOTE, cdc: CDC1, fechaFirma: "2026-11-11 09:10:30", mensaje: "1101 · Número de timbrado inválido", rechazo: true }, "Enviado · CDC informado · SIFEN Rechazado"]);
  }
  {
    igual("PRO342-R04-F1 (actualizado R05) siempre CUATRO iconos en orden fijo Envío · XML/CDC · SIFEN · Correo, con símbolos distintos por estado (el color nunca es la única señal); APROBADO sin CDC ya no usa «!» (5 símbolos distintos)",
      [iconosEstado(vista({})).map((i) => i.nombre), new Set(([["APROBADO", CDC1], ["RECHAZADO", CDC1], ["PENDIENTE", null], ["CANCELADO", CDC1], ["APROBADO", null]] as const).map(([e, c]) => iconosEstado(vista({ estadoSifen: e, cdc: c }))[2].simbolo).concat(iconosEstado(vista({ estadoLocal: "PENDIENTE_ENVIO", estadoSifen: "SIN_CONSULTA" }))[2].simbolo)).size],
      [["Envío", "XML/CDC", "SIFEN", "Correo"], 5]);
    igual("PRO342-R04-F1b Aprobado con CDC: SIFEN ✓ verde y XML ✓ azul (XML firmado nunca es verde)", ejes(vista({ estadoSifen: "APROBADO", cdc: CDC1, estadoEmail: "ENVIADO" })), [["envio", "check", "ok"], ["xml", "archivoCheck", "info"], ["sifen", "check", "ok"], ["correo", "correoCheck", "ok"]]);
    igual("PRO342-R04-F1c pendiente sin CDC: SIFEN reloj ámbar, XML archivo-reloj gris (sin CDC), envío ✓", ejes(vista({ estadoSifen: "PENDIENTE" })), [["envio", "check", "ok"], ["xml", "archivoReloj", "neutro"], ["sifen", "reloj", "aviso"], ["correo", "correo", "neutro"]]);
    igual("PRO342-R04-F1d envío indeterminado: ENVÍO «!» ámbar (no confirmado) y SIFEN pendiente; no transmitido: envío/SIFEN «−» gris", [ejes(vista({ estadoLocal: "ENVIO_INDETERMINADO", estadoSifen: "SIN_CONSULTA" })).slice(0, 3), ejes(vista({ estadoLocal: "PENDIENTE_ENVIO", estadoSifen: "SIN_CONSULTA" })).slice(0, 3)],
      [[["envio", "alerta", "aviso"], ["xml", "archivoReloj", "neutro"], ["sifen", "reloj", "aviso"]], [["envio", "guion", "neutro"], ["xml", "archivoReloj", "neutro"], ["sifen", "guion", "neutro"]]]);
    const rechazoGateway = iconosEstado(vista({ estadoLocal: "ERROR_ENVIO", envioErrorTipo: "RECHAZO", estadoSifen: "SIN_CONSULTA" }));

    igual("PRO342-R04-A4 rechazo por validación del GATEWAY (envío): ENVÍO ✕ rojo «no es un rechazo SIFEN» y SIFEN «−» sin información (nunca ✕ fiscal)", [rechazoGateway[0].simbolo, rechazoGateway[0].tono, /no es un rechazo SIFEN/.test(rechazoGateway[0].texto), rechazoGateway[2].simbolo], ["cruz", "error", true, "guion"]);
    const tecnico = vista({ estadoSifen: "PENDIENTE", cdc: CDC1, ultimaConsultaResultado: "ERROR_HTTP" });

    igual("PRO342-R04-F1e error técnico de consulta SIN rechazo fiscal: SIFEN sigue reloj ámbar (no ✕), XML ✓ con CDC registrado, aviso técnico aparte (alertaConsulta «tecnica»)", [iconosEstado(tecnico)[2].simbolo, iconosEstado(tecnico)[1].simbolo, alertaConsulta(tecnico)?.tipo], ["reloj", "archivoCheck", "tecnica"]);
    igual("PRO342-R04-F1f (texto actualizado R05) última respuesta inconsistente (RESPUESTA_INVALIDA o CDC_DIVERGENTE histórico): XML/CDC archivo «!» ámbar, conservando el CDC registrado", [iconosEstado(vista({ cdc: CDC1, ultimaConsultaResultado: "RESPUESTA_INVALIDA" }))[1].simbolo, iconosEstado(vista({ cdc: CDC1, ultimaConsultaResultado: "CDC_DIVERGENTE" }))[1].tono, /Se conserva el CDC registrado/.test(iconosEstado(vista({ cdc: CDC1, ultimaConsultaResultado: "CDC_DIVERGENTE" }))[1].texto)], ["archivoAlerta", "aviso", true]);
    igual("PRO342-R04-F1g correo independiente: e-mail con error en un documento APROBADO → SIFEN ✓ y CORREO ✕; e-mail enviado en RECHAZADO → SIFEN ✕ y CORREO ✓; pendiente → reloj", [ejes(vista({ estadoSifen: "APROBADO", cdc: CDC1, estadoEmail: "ERROR" })).slice(2), ejes(vista({ estadoSifen: "RECHAZADO", cdc: CDC1, estadoEmail: "ENVIADO" })).slice(2), ejes(vista({ estadoEmail: "PENDIENTE" }))[3]],
      [[["sifen", "check", "ok"], ["correo", "correoCruz", "error"]], [["sifen", "cruz", "error"], ["correo", "correoCheck", "ok"]], ["correo", "reloj", "aviso"]]);
    igual("PRO342-R04-C6 Cancelado/Inutilizado con CDC: SIFEN símbolo neutro «prohibido» (no verde, no rojo)", [ejes(vista({ estadoSifen: "CANCELADO", cdc: CDC1 }))[2], ejes(vista({ estadoSifen: "INUTILIZADO", cdc: CDC1 }))[2]], [["sifen", "prohibido", "neutro"], ["sifen", "prohibido", "neutro"]]);
    // F10 (actualizado R05): final informado por la API sin CDC → se presenta tal cual (✓ / ✕) con una nota INFORMATIVA, ya no «alerta de integridad»; función pura.
    const legado = vista({ estadoSifen: "APROBADO", cdc: null });

    igual("PRO342-R04-F10 (actualizado R05) estado final APROBADO/RECHAZADO con CDC NULL: SIFEN ✓ verde / ✕ rojo como lo informó la API, nota informativa avisoSinCdc (no alerta de integridad); el objeto de entrada no cambia", [iconosEstado(legado)[2].simbolo, iconosEstado(legado)[2].tono, iconosEstado(vista({ estadoSifen: "RECHAZADO", cdc: null }))[2].simbolo, /sin CDC/.test(String(avisoSinCdc(legado))) && !/integridad/i.test(String(avisoSinCdc(legado))), avisoSinCdc(vista({ estadoSifen: "APROBADO", cdc: CDC1 })), legado.estadoSifen, legado.cdc, detalleFiscalPrimario({ ...legado, estadoSifen: "RECHAZADO" }).rechazo],
      ["check", "ok", "cruz", true, null, "APROBADO", null, true]);
    igual("PRO342-R04-F7 primera capa devuelve lote y CDC SIN tocarlos (copia íntegra: guiones, mayúsculas, longitud); sin datos → null («No informado» en pantalla), nunca inventados", [detalleFiscalPrimario(vista({ lote: LOTE, cdc: CDC1 })).lote === LOTE, detalleFiscalPrimario(vista({ lote: LOTE, cdc: CDC1 })).cdc === CDC1, detalleFiscalPrimario(vista({})), detalleFiscalPrimario(vista({ mensajeRespuesta: "Número de timbrado inválido" })).mensaje],
      [true, true, { lote: null, cdc: null, fechaFirma: null, mensaje: null, rechazo: false }, "Número de timbrado inválido"]);
  }

  // ── R04-UX01/UX02/UX03: pantalla (fuente) — iconos, accesibilidad, primera/segunda capa, KuDE y no regresión ─────────────────────────────────────
  {
    // PRO-195-UX-R01: la fila suma la clase de selección.
    const fila = pagina.slice(pagina.indexOf("<tr className={clases(ui.row, CLASE_FILA_TIPO[d.tipo], marcado && estilos.filaMarcada)} data-tipo={d.tipo}>"), pagina.indexOf("{det ? (\n                      <tr"));
    // PRE-VM-R02-B-R03: desde PRE-VM-R02-B la celda Eventos usa <Fragment key={o.nombre}>…</Fragment> ANTES de «PRIMERA CAPA», y el primer «</Fragment>» del archivo quedaba antes del inicio:
    // `detalle` salía vacío. El bloque se delimita ahora desde «PRIMERA CAPA» hasta el cierre del Fragment EXTERNO de la fila (<Fragment key={d.id}>), buscado DESPUÉS del inicio y con la misma
    // indentación que su apertura (no un Fragment interno). Se verifica la delimitación antes de usarla; las comprobaciones siguientes no cambian.
    const aperturaFila = pagina.indexOf("<Fragment key={d.id}>");
    const sangriaFila = aperturaFila >= 0 ? pagina.slice(pagina.lastIndexOf("\n", aperturaFila) + 1, aperturaFila) : "";
    const inicioDetalle = pagina.indexOf("PRIMERA CAPA");
    const finDetalle = inicioDetalle >= 0 ? pagina.indexOf(`\n${sangriaFila}</Fragment>`, inicioDetalle) : -1;
    const detalle = inicioDetalle >= 0 && finDetalle > inicioDetalle ? pagina.slice(inicioDetalle, finDetalle) : "";
    const primera = detalle.slice(0, detalle.indexOf("SEGUNDA CAPA"));
    const segunda = detalle.slice(detalle.indexOf("SEGUNDA CAPA"));
    cierto("PRO342-R04-UX00 delimitación del detalle: existe la apertura del Fragment externo de la fila, «PRIMERA CAPA» está después de ella, su cierre (misma indentación) está después de «PRIMERA CAPA»; «SEGUNDA CAPA» está dentro y después de «PRIMERA CAPA»; ningún bloque extraído queda vacío",
      aperturaFila >= 0 && sangriaFila !== "" && /^ +$/.test(sangriaFila) && inicioDetalle > aperturaFila && finDetalle > inicioDetalle
      && detalle.indexOf("SEGUNDA CAPA") > 0 && detalle.startsWith("PRIMERA CAPA") && primera.length > 0 && segunda.startsWith("SEGUNDA CAPA") && segunda.length > "SEGUNDA CAPA".length
      && !/<Fragment key=\{d\.id\}>/.test(detalle));

    // PRO-365 (sustituye la regla PRO-195-UX-R01 punto 4, rechazada por el responsable): la fila vuelve a mostrar los CUATRO iconos independientes (+ «!» si hay aviso),
    // sin texto grande de estado; la segunda capa los repite con su nombre, pero ya no es el único sitio.
    cierto("PRO342-R04-UX01a (actualizado PRO-365) lista: la celda Estado muestra los cuatro iconos de iconosEstado (+ «!» si hay aviso), sin texto principal ni cápsulas «SIFEN: …», «Envío: …», e-mail o «Requiere revisión»; la segunda capa los repite con su grupo accesible",
      /const fases = iconosEstado\(d\);/.test(pagina) && /\{fases\.map\(\(i\) => \(/.test(fila) && !/estadoPrincipalFila|\{estado\.texto\}/.test(pagina) && /\{avisoFila \? \(/.test(fila) && !/SIFEN: \{|Envío: \{|ETIQUETA_EMAIL|>Requiere revisión</.test(fila) &&
      /iconosEstado\(d\)\.map\(\(i\) => \(/.test(segunda) && /aria-label=\{`Estados técnicos de \$\{numeroDocumento\(d\)\}`\}/.test(segunda));
    // PRO-342-UX-R01 (puntos 3 y 5): sin nombre repetido bajo cada icono; tooltip visual fijo a la ventana (no recortado por el scroll de la tabla) en vez de ::after.
    cierto("PRO342-R04-F8a (actualizado UX-R01, PRO-365-R02-C02) accesibilidad: cada icono es role=img con nombre accesible (etiqueta con el eje, o el texto), enfocable por teclado/toque (tabIndex 0) y abre el tooltip con hover, foco y toque; SVG aria-hidden; sin nombre corto repetido",
      /role="img"\s+tabIndex=\{0\}\s+aria-label=\{etiqueta \?\? texto\}/.test(pagina) && /onMouseEnter=\{\(e\) => tip\.mostrar\(e\.currentTarget, texto\)\}/.test(pagina) && /onFocus=\{\(e\) => tip\.mostrar\(e\.currentTarget, texto\)\}/.test(pagina) && /onClick=\{\(e\) => tip\.mostrar\(e\.currentTarget, texto\)\}/.test(pagina) && /<span className=\{estilos\.iconoCirculo\} aria-hidden="true">/.test(pagina) && !/iconoNombre|icono\.nombre/.test(pagina));
    cierto("PRO342-R04-F8b (actualizado PRO-195) CSS: tooltip fijo (.tooltip position: fixed) y ya no ::after; foco visible; área táctil ≥ 36px; alto contraste (forced-colors) con borde; versión móvil; sin CSS global",
      /\.tooltip \{\s*position: fixed;/.test(css) && !/::after|data-tip/.test(css) && /\.icono:focus-visible \{/.test(css) && /min-width: 36px;\s*min-height: 36px;/.test(css) && /@media \(forced-colors: active\) \{\s*\.iconoCirculo/.test(css) && /@media \(max-width: 640px\)/.test(css) && !/iconoCirculo|tooltip/.test(leer("components/ui/lista-padrao/lista.module.css")) /* actualizado PRO-365: área táctil 36px en los cuatro iconos de la fila */);
    // PRO-365: la fila vuelve a tener cuatro iconos ⇒ leyenda ÚNICA sobre la tabla (no por fila); en la segunda capa cada eje sigue con su nombre (NOMBRE_EJE).
    cierto("PRO342-R04-F8c (actualizado PRO-365) leyenda única sobre la tabla con los cuatro ejes en orden (Envío · XML/CDC · SIFEN · Correo) y nombres junto al icono en la segunda capa",
      (pagina.match(/className=\{estilos\.leyendaEstados\}/g) ?? []).length === 1 && !/leyendaEstados/.test(fila) && /<strong>\{NOMBRE_EJE\[i\.eje\]\}:<\/strong> \{i\.corto\}/.test(segunda));
    // PRO-365-R02-C02: «Mensaje» ya no es incondicional; la cuarta fila es «Motivo del rechazo» y SOLO con RECHAZADO persistido (respuestaFiscal).
    cierto("PRO342-R04-F5 (actualizado PRO-195, PRO-365-R02-C02) primera capa: «Nro lote», «CDC», «Fecha firma» y, solo si hay rechazo, «Motivo del rechazo» en rojo (sin «Mensaje» genérico); «Sin información» si falta",
      (primera.match(/<dt /g) ?? []).length === 4 && /Nro lote<\/dt>/.test(primera) && /"CDC de la nota de crédito" : "CDC"/.test(primera) && /Fecha firma<\/dt>/.test(primera) && !/>Mensaje<\/dt>/.test(primera) && /\{respuesta\.motivo \? \(/.test(primera) && /<dt className=\{ui\.muted\}>\{respuesta\.motivo\.etiqueta\}<\/dt>/.test(primera) && /<dd className=\{estilos\.mensajeRechazo\}>\{respuesta\.motivo\.valor\}<\/dd>/.test(primera) && /d\.lote \?\? "Sin información"/.test(primera) && /fiscal\.cdc \?\? "Sin información"/.test(primera) && /fiscal\.fechaFirma \? fechaGateway\(fiscal\.fechaFirma\) : "Sin información"/.test(primera) && !/describirConsulta|verRespuesta|Historial de envíos/.test(primera));
    cierto("PRO342-R04-F7b botones Copiar de lote y CDC con aria-label, copia EXACTA por navigator.clipboard.writeText(valor), feedback «Copiado» y aviso aria-live; error de copia visible sin alterar datos",
      /aria-label="Copiar número de lote" onClick=\{\(\) => void copiar\(d, "lote", fiscal\.lote as string\)\}/.test(primera) && /aria-label="Copiar CDC" onClick=\{\(\) => void copiar\(d, "cdc", fiscal\.cdc as string\)\}/.test(primera) && /await navigator\.clipboard\.writeText\(valor\);/.test(pagina) && /"Copiado" : "Copiar"/.test(primera) && /aria-live="polite"/.test(primera));
    cierto("PRO342-R04-F6 segunda capa «Historial técnico (n)» CERRADA por defecto (tecnico: false) con aria-expanded/aria-controls; dentro quedan seguimiento, último intento, JSON de solicitud/respuesta, historial completo, conexión y paginación",
      /tecnico: false, copiado: "" \};/.test(pagina) && /aria-expanded=\{det\.tecnico\} aria-controls=\{`tecnico-\$\{d\.id\}`\}/.test(detalle) /* UX-R01: el control queda en la barra de acciones */ && /Historial técnico \(/.test(detalle) && /\{det\.tecnico \? \(/.test(segunda) &&
      ["seguimiento.envio", "Último intento de consulta", "verSolicitud(d, sol)", "verRespuesta(d, i)", "Historial de envíos y consultas", "Conexión: no registrada (intento anterior a NEX-079)", "cargarAnteriores(d)", "XML: descarga no disponible"].every((t) => segunda.includes(t) && !primera.includes(t)));
    cierto("PRO342-R04-UX02 (actualizado PRO-195) abrir la fila y la segunda capa NO consultan al gateway: alternar solo hace GET /api/documentos/{id}; alternarTecnico no hace fetch; «Consultar estado en SIFEN» sigue siendo una acción explícita (de la fila) con permiso EDITAR",
      /fetch\(`\/api\/documentos\/\$\{d\.id\}`, \{ cache: "no-store" \}\)/.test(pagina.slice(pagina.indexOf("async function alternar"), pagina.indexOf("// E01 (PRO-314): JSON registrado"))) && !/fetch/.test(pagina.slice(pagina.indexOf("function alternarTecnico"), pagina.indexOf("function verSolicitud"))) && /const acciones = accionesFila\(kudeDisponible\(d\), \{ editar \}/.test(pagina) /* PRE-VM-R02-A: se calcula antes del <tr> (PRO-195-UX-R01) y la fila lo usa */ && /acciones\.filter\(\(a\) => a\.visible\)/.test(fila) && /Consultar estado en SIFEN/.test(fila) && !/reconsultar/.test(detalle));
    cierto("PRO342-R04-F4/UX03 (actualizado PRO-195) KuDE: la acción se llama «Consultar KuDE» y es UN icono en la fila (sin duplicado en el detalle), condicionada por kudeDisponible (permiso, no estado fiscal); no aparece «Ver KuDE»; (actualizado C02-C02) la modal ya no tiene aviso de PDF no verificado",
      /etiqueta=\{`Consultar KuDE \(PDF\) de \$\{doc\}/.test(fila) && !/abrirKude/.test(primera) && !/Ver KuDE/.test(pagina) && (pagina.match(/kudeDisponible\(d\)/g) ?? []).length === 1 && !/AVISO_KUDE_NO_VERIFICADO/.test(leer("app/(private)/documentos/kude-modal.tsx")));
    cierto("PRO342-R04-UX01b no regresión: filtros (tipo, sucursal, estado SIFEN, fechas, búsqueda), indicadores, orden por columnas, paginación, refresco GET, colores FE/NCE, acciones de envío/NCE y avisos de consulta siguen presentes",
      ["ESTADOS_SIFEN.map", "setBusqueda(e.target.value)", "INDICADORES.map", '<ThOrdenable titulo="Estado" campo="estado"' /* actualizado PRO-195 */, "setPagina(paginaMostrada + 1)", "iniciarRefresco", "CLASE_FILA_TIPO[d.tipo]", "CLASE_DETALLE_TIPO[d.tipo]", "enviarAlGateway(d)", "Corregir y emitir nueva", "avisoSinCdc(d)", "alertaConsulta(d)"].every((t) => pagina.includes(t)));
  }

  return fallos;
}
