/**
 * PRO-342-R01 — FLUJO FISCAL INTEGRAL: envío UNA vez → ACK/lote EXACTO → consulta 1 «XML firmado» (intermedia, no final; CDC solo si la API lo informa) → reconsultas automáticas del MISMO
 * documento por el worker existente (NEX-077: lease + token + escalera) → final SOLO con «Aprobado» o «Rechazado» informado por la API. KuDE disponible durante «XML firmado» sin cerrar el
 * seguimiento y sin presentar como propio el PDF de otro documento.
 *
 * Casos sobre las funciones REALES (enviarDocumento, consultarEstado, ejecutarLote, consultarDocumentoGateway, obtenerKudeGateway, interpretarRecepcion, estadoSifenDesdeGateway,
 * seguimientoFiscal, textoConexion) con `fetch`, entorno y base SIMULADOS. La base simulada reproduce las reglas de las funciones SQL (NEX-050 / NEX-077 / NEX-079: reserva con token,
 * programación con token, CDC_DIVERGENTE, estado final solo con CDC coherente, CDC fijado una vez, intentos solo altas); el texto de la migración NEX-079 se verifica por separado.
 * Sin red, sin PostgreSQL, sin gateway ni credenciales reales. ESCRITOS, NO EJECUTADOS en esta entrega (orden PRO-342-R01).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { CADENCIA_SEGUNDOS, ejecutarLote } from "@/lib/facturacion/consulta-automatica";
import { enviarDocumento } from "@/lib/facturacion/envio";
import { esFaseXmlFirmado, estadoSifenDesdeGateway } from "@/lib/facturacion/estados";
import {
  cdcCoherente, consultarDocumentoGateway, continuidadConexion, cuerpoKudeGateway, interpretarRecepcion, limpiarCacheTokens, obtenerKudeGateway, referenciaConexion,
  type CuerpoLegible, type DocumentoKude, type FetchLike, type KudeFetch, type ResultadoConsulta,
} from "@/lib/facturacion/gateway";
import { presentacionSifen, seguimientoFiscal, textoConexion } from "@/lib/facturacion/presentacion-sifen";
import { consultarEstado } from "@/lib/facturacion/shared";

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
type IntentoMundo = { documento: string; tipo: "ENVIO" | "CONSULTA"; resultado: string; http: number | null; estadoGateway: string | null; estadoSifen: string | null; cdcInformado: string | null; lote: string | null; mensaje: string | null; respuesta: string | null; conexion: Record<string, unknown> | null; actor: string };

const FINALES = ["APROBADO", "RECHAZADO", "CANCELADO", "INUTILIZADO"];
const PENDIENTES = ["SIN_CONSULTA", "PENDIENTE", "NO_RECONOCIDO"];

/** Base simulada con las reglas de las funciones SQL de registro (NEX-050 / NEX-077 / NEX-079). `sinNex079` = las sobrecargas con p_conexion no existen (42883). */
function mundo(docs: Partial<DocMundo>[], opciones: { sinNex079?: boolean; faltaDependenciaInterna?: boolean; catalogoIlegible?: boolean; baseUrl?: string } = {}) {
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
  const coherente = (d: DocMundo, c: string) => cdcCoherente({ tipo: d.tipo, establecimiento: d.establecimiento, puntoExpedicion: d.puntoExpedicion, numero: d.numero }, c);
  const pgError = (detail: string) => Object.assign(new Error(detail), { code: "P0001", detail });
  const conexionDe = (v: unknown) => (typeof v === "string" ? (JSON.parse(v) as Record<string, unknown>) : null);

  const registrarConsulta = (modo: "MANUAL" | "FLUJO" | "AUTO", p: unknown[], token: unknown, conexion: unknown) => {
    const d = tabla.get(String(p[2]));

    if (!d) throw pgError("NEX:DOCUMENTO_NO_ENCONTRADO");
    if (modo === "AUTO" && (token === null || d.leaseToken !== token)) throw pgError("NEX:LEASE_OBSOLETO");
    if (modo !== "MANUAL" && (!["ENVIADO", "ENVIO_INDETERMINADO"].includes(d.estadoLocal) || !PENDIENTES.includes(d.estadoSifen))) throw pgError("NEX:DOCUMENTO_NO_PENDIENTE");

    const pCdc = (p[8] as string | null) ?? null;
    const pEstado = (p[7] as string | null) ?? null;
    let resultado = String(p[3]);
    let mensaje = (p[10] as string | null) ?? null;

    if (resultado === "OK" && pCdc !== null && ((d.cdc !== null && pCdc !== d.cdc) || !coherente(d, pCdc))) resultado = "CDC_DIVERGENTE";
    if (resultado === "OK" && FINALES.includes(d.estadoSifen) && !(pEstado === d.estadoSifen || (d.estadoSifen === "APROBADO" && pEstado === "CANCELADO"))) resultado = "RESPUESTA_INVALIDA";
    if (resultado === "OK" && pEstado && FINALES.includes(pEstado) && !((pCdc ?? d.cdc) && coherente(d, String(pCdc ?? d.cdc)))) {
      resultado = "RESPUESTA_INVALIDA";
      mensaje = `La consulta informa «${pEstado}» sin un CDC válido y coherente con el documento: no se modifica el estado fiscal.`;
    }

    intentos.push({
      documento: d.id, tipo: "CONSULTA", resultado, http: (p[4] as number | null) ?? null, estadoGateway: (p[6] as string | null) ?? null, estadoSifen: resultado === "OK" ? pEstado : null,
      cdcInformado: pCdc && /^\d{44}$/.test(pCdc) ? pCdc : null, lote: null, mensaje, respuesta: (p[13] as string | null) ?? null, conexion: conexionDe(conexion), actor: String(p[1]),
    });
    if (resultado === "OK") {
      d.estadoSifen = String(pEstado);
      d.estadoGatewayTexto = (p[6] as string | null) ?? null;
      d.cdc = d.cdc ?? pCdc;
      d.codRespuesta = (p[9] as string | null) ?? null;
      d.mensajeRespuesta = mensaje;
      d.fechaFirma = (p[11] as string | null) ?? d.fechaFirma;
      d.estadoLocal = "ENVIADO";
    }
    d.ultimaConsultaResultado = resultado;
    d.ultimaConsultaAt = reloj.t;

    return resultado;
  };

  const db = {
    async query(sql: string, p: unknown[] = []) {
      sqls.push(sql);
      const conConexion = /fe_documento_registrar_(consulta|envio)/.test(sql) && (/\$15::jsonb\) AS resultado/.test(sql) || /\$16::jsonb\) AS resultado/.test(sql));

      // sinNex079: la sobrecarga NEX-079 no existe (42883). faltaDependenciaInterna: la sobrecarga EXISTE pero una función que usa no (42883 por migración defectuosa).
      if ((opciones.sinNex079 || opciones.faltaDependenciaInterna) && conConexion) throw Object.assign(new Error("function does not exist"), { code: "42883" });
      // PRO-342-R02 (F004): verificación en el catálogo de la sobrecarga NEX-079 (nombre + cantidad de argumentos con jsonb al final).
      if (/pg_catalog\.pg_proc/.test(sql)) {
        if (opciones.catalogoIlegible) throw Object.assign(new Error("permission denied for pg_proc"), { code: "42501" });

        return { rows: [{ existe: !opciones.sinNex079 }] };
      }
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
      if (/fe_documento_registrar_consulta_auto/.test(sql)) return { rows: [{ resultado: registrarConsulta("AUTO", p, p[14], conConexion ? p[15] : null) }] };
      if (/fe_documento_registrar_consulta_flujo_nce/.test(sql)) return { rows: [{ resultado: registrarConsulta("FLUJO", p, null, conConexion ? p[14] : null) }] };
      if (/fe_documento_registrar_consulta/.test(sql)) return { rows: [{ resultado: registrarConsulta("MANUAL", p, null, conConexion ? p[14] : null) }] };
      if (/fe_documento_iniciar_envio/.test(sql)) {
        const d = tabla.get(String(p[2]))!;

        if (d.estadoLocal === "ENVIADO") throw pgError("NEX:YA_ENVIADO");
        iniciados += 1;
        d.estadoLocal = "ENVIANDO";

        return { rows: [{ resultado: "INICIADO", payload: { dEst: d.establecimiento, dPunExp: d.puntoExpedicion, dNumDoc: d.numero }, numero: d.numero, tipo: d.tipo, establecimiento: d.establecimiento, punto: d.puntoExpedicion }] };
      }
      if (/fe_documento_registrar_envio/.test(sql)) {
        const d = tabla.get(String(p[2]))!;

        if (d.estadoLocal !== "ENVIANDO") throw pgError("NEX:ENVIO_NO_INICIADO");
        const lote = typeof p[11] === "string" && p[11].length >= 1 && p[11].length <= 60 ? p[11] : null;

        intentos.push({ documento: d.id, tipo: "ENVIO", resultado: String(p[4]), http: (p[7] as number | null) ?? null, estadoGateway: (p[9] as string | null) ?? null, estadoSifen: null, cdcInformado: (p[13] as string | null) ?? null, lote, mensaje: (p[10] as string | null) ?? null, respuesta: (p[14] as string | null) ?? null, conexion: conConexion ? conexionDe(p[15]) : null, actor: String(p[1]) });
        d.estadoLocal = String(p[5]);
        d.lote = d.lote ?? lote;
        d.cdc = d.cdc === null && typeof p[12] === "string" && coherente(d, p[12]) ? p[12] : d.cdc;

        return { rows: [{ fe_documento_registrar_envio: p[5] }] };
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
    const g = gateway({ consultas: [consulta("XML firmado", null, { kude: "habilitado" }), consulta("XML firmado", null, { kude: "habilitado" })] });
    const r1 = await lote(m, g);
    const doc = m.tabla.get(DOC1)!;
    const i1 = m.intentos[0];

    igual("PRO342-02a XML firmado sin CDC: intento OK registrado con estado bruto «XML firmado», PENDIENTE (no final), CDC vacío", [r1.consultados, i1.resultado, i1.estadoGateway, i1.estadoSifen, i1.cdcInformado, doc.estadoSifen, doc.cdc], [1, "OK", "XML firmado", "PENDIENTE", null, "PENDIENTE", null]);
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
    const g = gateway({ consultas: [consulta("XML firmado", null), { status: 503, cuerpo: { message: "Servicio no disponible" } }, null, consulta("XML firmado", null)] });
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
    igual("PRO342-06c un «Rechazado» sin CDC (ni registrado) NO se toma como final: RESPUESTA_INVALIDA y sigue pendiente", await (async () => {
      limpiarCacheTokens();
      const m2 = mundo([{ lote: LOTE }]);

      await lote(m2, gateway({ consultas: [consulta("Rechazado", null, { cod: "1101", mensaje: "Número de timbrado inválido" })] }));

      return [m2.intentos[0].resultado, m2.tabla.get(DOC1)!.estadoSifen];
    })(), ["RESPUESTA_INVALIDA", "SIN_CONSULTA"]);
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

    igual("PRO342-07a la API informa OTRO CDC para el documento que ya tiene uno: intento CDC_DIVERGENTE con el CDC informado exacto; el registrado NO cambia", [m.intentos[0].resultado, m.intentos[0].cdcInformado, d1.cdc], ["CDC_DIVERGENTE", CDC1_OTRO, CDC1]);
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
    const sqlManual = m.sqls.find((x) => /fe_documento_registrar_consulta\(/.test(x)) ?? "";

    igual("PRO342-08a consulta MANUAL: intento con cdc_informado exacto y conexión (sobrecarga NEX-079 de 15 parámetros); el documento sigue pendiente", [r.resultado, m.intentos[0].cdcInformado, m.intentos[0].conexion?.host, /\$15::jsonb\) AS resultado/.test(sqlManual), m.tabla.get(DOC1)!.estadoSifen], ["OK", CDC1, "gateway.prueba.invalid", true, "PENDIENTE"]);
    igual("PRO342-08b la consulta manual no toca la programación del worker (proxima/lease intactos)", [m.tabla.get(DOC1)!.proxima, m.tabla.get(DOC1)!.leaseToken], [0, null]);
  }
  {
    limpiarCacheTokens();
    const m = mundo([{ lote: LOTE }], { sinNex079: true });
    const g = gateway({ consultas: [consulta("XML firmado", null)] });
    const r = await consultarEstado(m.db, EMPRESA, USUARIO, DOC1, g.dep);

    igual("PRO342-08c (actualizado R02) sin NEX-079 (42883 y la sobrecarga NO está en el catálogo): firma anterior, el intento no se pierde (sin conexión) y se informa MODO COMPATIBILIDAD", [m.intentos.length, m.intentos[0].conexion, m.sqls.filter((x) => /fe_documento_registrar_consulta/.test(x)).length, m.sqls.filter((x) => /pg_catalog\.pg_proc/.test(x)).length, r.modoRegistro], [1, null, 2, 1, "COMPATIBILIDAD"]);
  }
  {
    // Dos instancias: A reserva, su lease vence y B reserva el mismo documento con otro token. A no registra ni reprograma; solo B deja evidencia.
    limpiarCacheTokens();
    const m = mundo([{ lote: LOTE }]);
    const g = gateway({ consultas: [consulta("XML firmado", null), consulta("XML firmado", null)] });
    const reservaA = await m.db.query("SELECT * FROM fe_consulta_reservar_token(1, $1::integer, $2::text[])", [300, ["FE"]]) as { rows: Array<Record<string, unknown>> };
    const tokenA = String(reservaA.rows[0].o_token);

    m.tabla.get(DOC1)!.leaseToken = null; // lease de A vencido
    await lote(m, g); // B
    let detalleA = "";

    try {
      await consultarEstado(m.db, EMPRESA, USUARIO, DOC1, g.dep, { flujoNce: true, leaseToken: tokenA });
    } catch (e) {
      detalleA = String((e as { detail?: string }).detail);
    }
    const programarA = await m.db.query("SELECT fe_consulta_programar_token($1::uuid, $2::uuid, $3::timestamptz, $4::boolean, $5::uuid) AS ok", [EMPRESA, DOC1, new Date(m.reloj.t).toISOString(), true, tokenA]) as { rows: Array<{ ok: boolean }> };

    igual("PRO342-08d instancia con token reemplazado: NEX:LEASE_OBSOLETO, no reprograma (false) y solo hay UN intento (el de la instancia vigente)", [detalleA, programarA.rows[0].ok, m.intentos.length], ["NEX:LEASE_OBSOLETO", false, 1]);
    cierto("PRO342-08e no hay un segundo planificador: un solo setInterval en lib/facturacion (consulta-automatica.ts) y el worker sigue usando la reserva con token NEX-077", (leer("lib/facturacion/consulta-automatica.ts").match(/setInterval\(/g) ?? []).length === 1 && /fe_consulta_reservar_token/.test(leer("lib/facturacion/consulta-automatica.ts")));
  }

  // ── 9. KuDE disponible durante «XML firmado»; un PDF ajeno no se presenta como propio ──────────────────────────────────────
  {
    const fe: DocumentoKude = { tipoDoc: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000001", serie: "AA", cdcRegistrado: null };
    const nce: DocumentoKude = { tipoDoc: "NCE", establecimiento: "001", puntoExpedicion: "001", numero: "0000003", serie: "AA", cdcRegistrado: null };

    igual("PRO342-09a contrato del KuDE intacto: FE cinco campos (tipoDoc FE), NCE seis (tipOpe 4, tipoDoc ncr); el CDC nunca se envía", [Object.keys(cuerpoKudeGateway(fe)), cuerpoKudeGateway(nce)], [["dEst", "dPunExp", "dNumDoc", "dSerieNum", "tipoDoc"], { tipOpe: "4", dEst: "001", dPunExp: "001", dNumDoc: "0000003", dSerieNum: "AA", tipoDoc: "ncr" }]);

    limpiarCacheTokens();
    const k1 = gatewayKude(CDC1);
    const r1 = await obtenerKudeGateway(CONFIG, fe, k1.dep);

    // PRO-342-R02 (F001): sin CDC registrado no hay prueba de pertenencia → NO_VERIFICADO (se entrega con advertencia; nunca «identidad confirmada»).
    igual("PRO342-09b (actualizado R02) documento PENDIENTE (XML firmado, sin CDC registrado): el KuDE se entrega sin exigir aprobación, pero NO_VERIFICADO", [r1.ok, r1.ok ? r1.correspondencia : null, k1.pedidos[0]?.dNumDoc], [true, "NO_VERIFICADO", "0000001"]);

    limpiarCacheTokens();
    const r2 = await obtenerKudeGateway(CONFIG, { ...fe, cdcRegistrado: CDC1 }, gatewayKude(CDC1_OTRA_EMPRESA).dep);

    igual("PRO342-09c CDC registrado y el gateway devuelve el PDF de OTRA empresa (mismo número): se DESCARTA (NO_CORRESPONDE) y el mensaje no expone el CDC", [r2.ok, r2.ok ? null : r2.codigo, r2.ok ? null : r2.mensaje.includes(CDC1_OTRA_EMPRESA)], [false, "NO_CORRESPONDE", false]);

    limpiarCacheTokens();
    const r3 = await obtenerKudeGateway(CONFIG, fe, gatewayKude(CDC2).dep);

    igual("PRO342-09d sin CDC registrado y PDF de OTRO número: se DESCARTA (NO_CORRESPONDE)", [r3.ok, r3.ok ? null : r3.codigo], [false, "NO_CORRESPONDE"]);

    limpiarCacheTokens();
    const r4 = await obtenerKudeGateway(CONFIG, { ...fe, cdcRegistrado: CDC1 }, gatewayKude(null).dep);

    igual("PRO342-09e (actualizado R02) respuesta sin CDC: PDF mostrado (PRO-326) como NO_VERIFICADO aunque haya CDC registrado", [r4.ok, r4.ok ? r4.correspondencia : null], [true, "NO_VERIFICADO"]);
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
    cierto("PRO342-10e NEX-079: la columna conexion rechaza claves de credenciales; el CDC del documento solo se fija con coalesce(d.cdc, p_cdc) y el lote con coalesce(lote, v_lote)", /conexion \?\| ARRAY\['password', 'clave', 'token', 'ruc'/.test(nex079) && /cdc = coalesce\(d\.cdc, p_cdc\)/.test(nex079) && /lote = coalesce\(lote, v_lote\)/.test(nex079));
    cierto("PRO342-10f NEX-079: las tres vías de consulta guardan cdc_informado y conexión; la vía AUTO conserva el fencing NEX:LEASE_OBSOLETO y las no manuales exigen documento pendiente", /cdc_informado, cod_respuesta, mensaje, respuesta, actor_id, conexion/.test(nex079) && /NEX:LEASE_OBSOLETO/.test(nex079) && /NEX:DOCUMENTO_NO_PENDIENTE/.test(nex079) && /'MANUAL', p_empresa/.test(nex079) && /'FLUJO', p_empresa/.test(nex079) && /'AUTO', p_empresa/.test(nex079));
  }

  // ══ PRO-342-R02 — correcciones focales F002/F003/F004 (casos ESCRITOS, NO EJECUTADOS) ══════════════════════════════════════════════════════
  const envioShared = leer("lib/facturacion/envio.ts");
  const nceEmision = leer("lib/facturacion/nce-emision.ts");
  const shared = leer("lib/facturacion/shared.ts");

  // ── R02-F003: lote LITERAL (sin trim ni normalización) ────────────────────────────────────────────────────────────────────────────────
  {
    const doc = { tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000001" };
    const recep = (lote: unknown, secretos: string[] = []) => interpretarRecepcion(200, JSON.stringify({ status: "success", nro_lote: lote }), secretos, doc);
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

    igual("PRO342-R02-C06 conexión original: la consulta continúa con continuidad MISMA y modo INTEGRAL; la conexión registrada no contiene secretos", [r.continuidadConexion, r.modoRegistro, m.intentos.filter((i) => i.tipo === "CONSULTA")[0].conexion?.host, JSON.stringify(m.intentos).includes(TOKEN)], ["MISMA", "INTEGRAL", "gateway.prueba.invalid", false]);
  }
  {
    // Documento histórico SIN snapshot NEX-079: no se presume conexión equivocada; se consulta y se informa SIN_REFERENCIA.
    limpiarCacheTokens();
    const m = mundo([{ lote: LOTE }], { baseUrl: "https://otro-gateway.prueba.invalid" });
    const r = await consultarEstado(m.db, EMPRESA, USUARIO, DOC1, gateway({ consultas: [consulta("XML firmado", null)] }).dep);

    igual("PRO342-R02-C07 sin snapshot de conexión del envío (anterior a NEX-079): consulta realizada con continuidad SIN_REFERENCIA (compatibilidad honesta, no se inventa conflicto)", [r.resultado, r.continuidadConexion], ["OK", "SIN_REFERENCIA"]);
    cierto("PRO342-R02-C08 fuente: la conexión del envío se lee por empresa_id Y documento_id de la sesión (sin cruzar tenants) y sin columnas de credenciales; DISTINTA lanza 409 antes de llamar al gateway", /i\.empresa_id = \$1 AND i\.documento_id = \$2 AND i\.tipo = 'ENVIO'/.test(shared) && !/password|token/i.test(shared.slice(shared.indexOf("export const SQL_CONEXION_ENVIO"), shared.indexOf("export const MENSAJE_CONEXION_DISTINTA"))) && /continuidad === "DISTINTA"\) throw new ErrorFacturacion\(409, MENSAJE_CONEXION_DISTINTA\)/.test(shared));
    const cont = (envio: unknown, version: number | null, host = "gateway.prueba.invalid") => continuidadConexion(envio, { host, credencialRef: "PRUEBA", credencialesVersion: version, origenCredenciales: "ENTORNO" });
    const snap = { host: "gateway.prueba.invalid", credencialRef: "PRUEBA", credencialesVersion: 3, origenCredenciales: "ENTORNO" };

    igual("PRO342-R02-C09 continuidadConexion: misma → MISMA; host/versión/referencia distinta → DISTINTA; sin snapshot o versión no comparable → SIN_REFERENCIA", [cont(snap, 3), cont(snap, 4), cont(snap, 3, "otro.prueba.invalid"), cont({ ...snap, credencialRef: "OTRA" }, 3), cont(null, 3), cont({ ...snap, credencialesVersion: null }, 3), cont({ ...snap, credencialesVersion: null }, null)], ["MISMA", "DISTINTA", "DISTINTA", "DISTINTA", "SIN_REFERENCIA", "SIN_REFERENCIA", "MISMA"]);
  }

  // ── R02-F004: el retroceso a la firma anterior SOLO si la sobrecarga NEX-079 no existe ────────────────────────────────────────────────
  {
    limpiarCacheTokens();
    const m = mundo([{ lote: LOTE }], { faltaDependenciaInterna: true });
    let codigo = "";

    try {
      await consultarEstado(m.db, EMPRESA, USUARIO, DOC1, gateway({ consultas: [consulta("XML firmado", null)] }).dep);
    } catch (e) {
      codigo = String((e as { code?: string }).code);
    }
    igual("PRO342-R02-F01 sobrecarga NEX-079 PRESENTE pero dependencia interna ausente (42883): el error se propaga, NO se registra en modo compatibilidad ni se pierde/inventa historial", [codigo, m.intentos.length, m.sqls.filter((x) => /fe_documento_registrar_consulta/.test(x)).length], ["42883", 0, 1]);

    limpiarCacheTokens();
    const m2 = mundo([{ lote: LOTE }], { sinNex079: true, catalogoIlegible: true });
    let codigo2 = "";

    try {
      await consultarEstado(m2.db, EMPRESA, USUARIO, DOC1, gateway({ consultas: [consulta("XML firmado", null)] }).dep);
    } catch (e) {
      codigo2 = String((e as { code?: string }).code);
    }
    igual("PRO342-R02-F02 si el catálogo no se puede leer, tampoco hay retroceso: se propaga el 42883 original", [codigo2, m2.intentos.length], ["42883", 0]);

    limpiarCacheTokens();
    const m3 = mundo([{ estadoLocal: "PENDIENTE_ENVIO" }], { sinNex079: true });
    const g3 = gateway();

    await enviarDocumento(m3.db, EMPRESA, USUARIO, DOC1, g3.dep);
    igual("PRO342-R02-F03 envío sin NEX-079: modo compatibilidad (intento ENVIO registrado sin conexión, lote exacto) y la consulta posterior queda SIN_REFERENCIA (no DISTINTA)", [m3.intentos[0].conexion, m3.intentos[0].lote, (await consultarEstado(m3.db, EMPRESA, USUARIO, DOC1, gateway({ consultas: [consulta("XML firmado", null)] }).dep)).continuidadConexion], [null, LOTE, "SIN_REFERENCIA"]);
    cierto("PRO342-R02-F04 fuente: registrarConConexion consulta el catálogo (SQL_SOBRECARGA_NEX079) antes de retroceder y propaga el error si la sobrecarga existe; la consulta manual informa modoRegistro y la ruta lo devuelve", /db\.query\(SQL_SOBRECARGA_NEX079/.test(shared) && /if \(sobrecargaExiste\) \{[\s\S]{0,300}throw error;/.test(shared) && /modoRegistro: "COMPATIBILIDAD"/.test(shared) && /modoRegistro/.test(leer("app/api/documentos/[id]/consultar/route.ts")));
  }

  cierto("PRO342-R02-F05 pantalla: tras «Reconsultar» se informa el modo compatibilidad (sin NEX-079) y la conexión no verificable; el historial muestra «Conexión: no registrada» cuando el intento no la tiene", /modoRegistro === "COMPATIBILIDAD"/.test(leer("app/(private)/documentos/page.tsx")) && /continuidadConexion === "SIN_REFERENCIA"/.test(leer("app/(private)/documentos/page.tsx")) && /Conexión: no registrada \(anterior a NEX-079 o modo compatibilidad\)/.test(leer("app/(private)/documentos/page.tsx")));

  return fallos;
}
