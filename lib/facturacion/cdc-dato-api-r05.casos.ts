/**
 * PRO-342-R05 — REGLA DEFINITIVA DEL RESPONSABLE: NEXIT NO valida el CDC. El CDC es generado e informado por la API del proveedor; NEXIT solo lo recibe, lo guarda EXACTAMENTE como fue
 * informado y lo presenta. Matriz de aceptación y regresión R05 sobre las funciones REALES (cdcInformadoPorApi, interpretarConsulta, interpretarRecepcion, decidirConsulta, consultarEstado,
 * correspondenciaKude, cuerpoKudeGateway, presentación) con `fetch`, entorno y base SIMULADOS, y comprobaciones de TEXTO de la migración NEX-080 y sus scripts.
 * Sin red, sin PostgreSQL y sin credenciales reales (fixtures sintéticos). ESCRITOS, NO EJECUTADOS en esta entrega (orden PRO-342-R05: sin tests, lint, typecheck, build ni SQL).
 * No prueban el gateway, la SQL ni SIFEN reales: la semántica de NEX-080 se verifica como texto y queda pendiente de ejecución en base descartable.
 * PRO-342-R05-R01: sección L = correctivo focal de la auditoría R05 (F001 identidad completa por establecimiento/punto/número/serie/tipo, F002 verificar-NEX-080.sql sin falsos negativos por
 * comentarios, F003 credenciales/tokens nunca persistidos ni expuestos como CDC). ESCRITOS, NO EJECUTADOS (orden R05-R01).
 * PRO-342-R05-R02: sección M = residuales de la auditoría R05-R01 (F001-R identidad completa también antes de atribuir un RECHAZO de FE/NCE; F003-R credencial numérica en la evidencia,
 * marca desde la evidencia y presentación en el historial). ESCRITOS, NO EJECUTADOS (orden R05-R02).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { ETIQUETA_RESULTADO_INTENTO } from "@/lib/facturacion/estados";
import {
  ANOMALIA_CDC_CREDENCIAL, CLAVE_ANOMALIA_NEXIT, CONTRATO_FISCAL_CONSULTA, CONTRATO_FISCAL_ENVIO, cdcEsCredencial, cdcInformadoPorApi, correspondenciaKude, cuerpoKudeGateway, ecoIdentidadConsulta,
  ecoIdentidadContradice, enviarDocumentoGateway, interpretarConsulta, interpretarRecepcion, limpiarCacheTokens, MAX_CDC, resultadoFiscalSinSecretos, seriePayload, sinSecretos, type DocumentoConsulta, type DocumentoRecepcion, type FetchLike,
} from "@/lib/facturacion/gateway";
import { alertaConsulta, avisoProyeccionCdc, avisoSinCdc, detalleFiscalPrimario, iconosEstado } from "@/lib/facturacion/presentacion-sifen";
import { decidirConsulta } from "@/lib/facturacion/reconciliacion";
import { consultarEstado, ErrorFacturacion, FUNCIONES_NEX080, MENSAJE_SIN_NEX080, reiniciarNex080ParaCasos } from "@/lib/facturacion/shared";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");
const sinComentariosSql = (t: string) => t.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
const sinComentariosTs = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

// Tipadas como string (no como literales): R05-E10 compara dos empresas distintas y TypeScript rechaza (TS2367) comparar dos literales sin intersección.
const EMPRESA: string = "11111111-1111-4111-8111-111111111111";
const EMPRESA_B: string = "22222222-2222-4222-8222-222222222222";
const USUARIO = "99999999-9999-4999-8999-999999999999";
const DOC = "d0805000-0000-4000-8000-000000000001";
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJyMDUifQ.firma-sintetica-r05";
const LEASE = "1e05e000-0000-4000-8000-0000000000aa";
const ENV = { NEXIT_FE_PRUEBA_RUC: "80000005", NEXIT_FE_PRUEBA_PASSWORD: "clave-sintetica-no-real" };

/** Ejemplo del responsable (CASA MINGO): FE 001-001-0000002, serie AA. CDC TAL COMO lo informó la API (no se analiza su composición). */
const CASA_MINGO = { tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000002", serie: "AA" };
const CDC_CASA_MINGO = "01800033140001001000000222026111611359499708";

const CDC_44 = "0".repeat(10) + "1".repeat(34);
const CDC_43 = "4".repeat(43);
const CDC_45 = "5".repeat(45);
const CDC_ALFA = "CDC-PROVEEDOR-ABC-0001";
const CDC_ESPACIOS = " 0180000005600100100000022 ";
const CDC_LARGO = "9".repeat(MAX_CDC + 1);

type Doc = DocumentoConsulta;

const respuestaConsulta = (estado: string, cdc: unknown, extra: Record<string, unknown> = {}, deExtra: Record<string, unknown> = {}) => ({
  status: "success",
  response: { Estado: estado, DE: { ...(cdc === undefined ? {} : { CDC: cdc }), FechaFirma: "2026-11-16 11:35:00", Retorno: { CodRespuesta: "0260", Mensaje: "msg" }, ...deExtra }, ...extra },
});
const consulta = (estado: string, cdc: unknown, doc: Doc = CASA_MINGO, extra: Record<string, unknown> = {}, deExtra: Record<string, unknown> = {}) =>
  interpretarConsulta(200, JSON.stringify(respuestaConsulta(estado, cdc, extra, deExtra)), doc);

/** Gateway simulado: login + cola de respuestas de /api/consulta_de; registra cuerpos y URL. */
function gateway(respuestas: unknown[]) {
  const cola = [...respuestas];
  const pedidos: Array<{ url: string; cuerpo: Record<string, unknown> }> = [];
  const fetch: FetchLike = async (url, init) => {
    pedidos.push({ url, cuerpo: JSON.parse(init.body) as Record<string, unknown> });
    if (url.endsWith("/api/login")) return { status: 200, text: async () => JSON.stringify({ status: "success", token: TOKEN }) };

    return { status: 200, text: async () => JSON.stringify(cola.shift() ?? {}) };
  };

  return { fetch, pedidos };
}

/** Base simulada para consultarEstado: NEX-080 presente (o no), documento con su CDC registrado y registro SOLO por las funciones *_r05. */
function base(fila: Record<string, unknown> = {}, opciones: { sinNex080?: boolean } = {}) {
  const registros: Array<{ sql: string; p: unknown[] }> = [];
  const sqls: string[] = [];
  const db = {
    async query(sql: string, p: unknown[] = []) {
      sqls.push(sql);
      if (/to_regprocedure/.test(sql)) return { rows: [{ disponible: !opciones.sinNex080 }] };
      if (/FROM fe_gateway_config/.test(sql)) return { rows: [{ baseUrl: "https://gateway.prueba.invalid", credencialRef: "PRUEBA", timeoutMs: 1000 }] };
      if (/fe_documento_registrar_(consulta|envio)/.test(sql)) {
        if (!/_r05\(/.test(sql)) throw new Error("R05: firma anterior a NEX-080 (no debe usarse)");
        registros.push({ sql, p });

        return { rows: [{ resultado: p[3] }] };
      }

      return { rows: [{ id: DOC, ...CASA_MINGO, cdc: null, estadoSifen: "PENDIENTE", estadoLocal: "ENVIADO", ...fila }] };
    },
  };

  return { db: db as never, registros, sqls };
}

export async function verificarCasosCdcDatoApiR05(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, condicion: boolean) => igual(nombre, condicion, true);

  const gw = leer("lib/facturacion/gateway.ts");
  const gwSinComentarios = sinComentariosTs(gw);
  const reconciliacion = sinComentariosTs(leer("lib/facturacion/reconciliacion.ts"));
  const shared = leer("lib/facturacion/shared.ts");
  const envio = leer("lib/facturacion/envio.ts");
  const pagina = leer("app/(private)/documentos/page.tsx");
  const nex080 = leer("documentacao/banco/nexit/v1/migraciones/NEX-080-facturacion-cdc-dato-api.sql");
  const sql080 = sinComentariosSql(nex080);
  const preflight = leer("documentacao/banco/nexit/v1/scripts/preflight-NEX-080.sql");
  const verificar = leer("documentacao/banco/nexit/v1/scripts/verificar-NEX-080.sql");
  const reversion = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-080.sql");
  const tramo = (t: string, desde: string, hasta: string) => t.slice(t.indexOf(desde), t.indexOf(hasta, t.indexOf(desde) + desde.length));

  // ══ A. Lectura del CDC: dato opaco, literal ═══════════════════════════════════════════════════════════════════════════════════════
  igual("R05-A01 CDC de 44 caracteres: literal", cdcInformadoPorApi(CDC_44), { presente: true, valor: CDC_44, motivo: null });
  igual("R05-A02 CDC de 43 caracteres: literal (sin exigir 44)", cdcInformadoPorApi(CDC_43).valor, CDC_43);
  igual("R05-A03 CDC de 45 caracteres: literal (sin recortar)", cdcInformadoPorApi(CDC_45).valor, CDC_45);
  igual("R05-A04 CDC no numérico: literal (sin exigir dígitos)", cdcInformadoPorApi(CDC_ALFA).valor, CDC_ALFA);
  igual("R05-A05 CDC con espacios al inicio y al final: literal, sin trim", cdcInformadoPorApi(CDC_ESPACIOS).valor, CDC_ESPACIOS);
  igual("R05-A06 CASA MINGO: el CDC informado se conserva exacto", cdcInformadoPorApi(CDC_CASA_MINGO).valor, CDC_CASA_MINGO);
  igual("R05-A07 ausente / null / \"\": no informado (no borra el anterior; ver E)", [cdcInformadoPorApi(undefined), cdcInformadoPorApi(null), cdcInformadoPorApi("")].map((x) => [x.presente, x.valor]), [[false, null], [false, null], [false, null]]);
  igual("R05-A08 número JSON: presente pero NO_TEXTO; no se convierte a texto", cdcInformadoPorApi(1800033140001001), { presente: true, valor: null, motivo: "NO_TEXTO" });
  igual("R05-A09 más de MAX_CDC (256) caracteres: no se recorta; queda solo en la evidencia JSON", [cdcInformadoPorApi(CDC_LARGO).valor, cdcInformadoPorApi(CDC_LARGO).motivo, MAX_CDC], [null, "EXCEDE_LIMITE", 256]);

  // ══ B. Consulta: el estado informado se registra sin condicionarlo al CDC ═════════════════════════════════════════════════════════
  for (const [nombre, cdc] of [["44", CDC_44], ["43", CDC_43], ["45", CDC_45], ["no numérico", CDC_ALFA], ["con espacios", CDC_ESPACIOS], ["CASA MINGO", CDC_CASA_MINGO]] as const) {
    const r = consulta("Aprobado", cdc);

    igual(`R05-B01 [${nombre}] Aprobado con CDC ${nombre}: OK/APROBADO y CDC literal`, [r.resultado, r.estadoSifen, r.cdc], ["OK", "APROBADO", cdc]);
  }
  igual("R05-B02 Aprobado / Rechazado SIN CDC: OK con el estado informado y CDC null (no se inventa)", [consulta("Aprobado", undefined), consulta("Rechazado", undefined)].map((r) => [r.resultado, r.estadoSifen, r.cdc]), [["OK", "APROBADO", null], ["OK", "RECHAZADO", null]]);
  igual("R05-B03 «XML firmado» con o sin CDC: intermedio (PENDIENTE), nunca final ni bloqueado", [consulta("XML firmado", CDC_CASA_MINGO), consulta("XML firmado", undefined)].map((r) => [r.resultado, r.estadoSifen, r.cdc]), [["OK", "PENDIENTE", CDC_CASA_MINGO], ["OK", "PENDIENTE", null]]);
  igual("R05-B04 CDC numérico (no texto) en DE.CDC: el estado se registra igual; el CDC no se convierte", [consulta("Aprobado", 1800033140001001).resultado, consulta("Aprobado", 1800033140001001).cdc], ["OK", null]);
  igual("R05-B05 ruta NO contractual (response.CDC o DE.Nota.CDC): no se toma como CDC", [consulta("Aprobado", undefined, CASA_MINGO, { CDC: CDC_CASA_MINGO }).cdc, consulta("Aprobado", undefined, CASA_MINGO, {}, { Nota: { CDC: CDC_CASA_MINGO } }).cdc], [null, null]);
  igual("R05-B06 eco de identidad CONTRADICTORIO (otro número / establecimiento / serie / tipo): RESPUESTA_INVALIDA sin estado ni CDC (protección contra documentos ajenos, independiente del CDC)", [
    consulta("Aprobado", CDC_CASA_MINGO, CASA_MINGO, { dNumDoc: "0000003" }), consulta("Aprobado", CDC_CASA_MINGO, CASA_MINGO, {}, { dEst: "002" }), consulta("Aprobado", CDC_CASA_MINGO, CASA_MINGO, { dSerieNum: "AB" }), consulta("Aprobado", CDC_CASA_MINGO, CASA_MINGO, { tipoDoc: "ncr" }),
  ].map((r) => [r.resultado, r.estadoSifen, r.cdc]), Array(4).fill(["RESPUESTA_INVALIDA", null, null]));
  igual("R05-B07 eco COINCIDENTE (tipoDoc sin distinguir mayúsculas) o ausente: no bloquea", [ecoIdentidadContradice({ dEst: "001", dPunExp: "001", dNumDoc: "0000002", dSerieNum: "AA", tipoDoc: "fe" }, CASA_MINGO), ecoIdentidadContradice({}, CASA_MINGO), consulta("Aprobado", CDC_CASA_MINGO, CASA_MINGO, { dNumDoc: "0000002" }).resultado], [null, null, "OK"]);
  igual("R05-B08 HTTP 200 sin Estado: RESPUESTA_INVALIDA (nunca final), aunque traiga CDC", [interpretarConsulta(200, JSON.stringify({ status: "success", response: { DE: { CDC: CDC_CASA_MINGO } } }), CASA_MINGO).resultado], ["RESPUESTA_INVALIDA"]);

  // ══ C. Reconciliación: solo la guarda de estado final; ningún bloqueo por CDC ══════════════════════════════════════════════════════
  const doc = (estadoSifen: string, cdc: string | null) => ({ ...CASA_MINGO, cdc, estadoSifen });
  const decide = (d: ReturnType<typeof doc>, r: ReturnType<typeof consulta>) => { const x = decidirConsulta(d, r); return [x.resultado, x.estadoSifen, x.cdc]; };

  igual("R05-C01 final con CDC DISTINTO del registrado: se registra (OK) con el nuevo literal; sin CDC_DIVERGENTE", decide(doc("PENDIENTE", CDC_CASA_MINGO), consulta("Aprobado", CDC_ALFA)), ["OK", "APROBADO", CDC_ALFA]);
  igual("R05-C02 final sin CDC y sin CDC registrado: OK (estado informado, CDC null)", decide(doc("PENDIENTE", null), consulta("Rechazado", undefined)), ["OK", "RECHAZADO", null]);
  igual("R05-C03 estado contradictorio (APROBADO → Rechazado / Pendiente): RESPUESTA_INVALIDA, el estado registrado no cambia", [decide(doc("APROBADO", CDC_CASA_MINGO), consulta("Rechazado", CDC_CASA_MINGO)), decide(doc("APROBADO", CDC_CASA_MINGO), consulta("Pendiente", undefined))].map((x) => [x[0], x[1]]), [["RESPUESTA_INVALIDA", null], ["RESPUESTA_INVALIDA", null]]);
  igual("R05-C04 APROBADO → Cancelado (evolución legítima) y el mismo final: OK", [decide(doc("APROBADO", CDC_CASA_MINGO), consulta("Cancelado", CDC_CASA_MINGO))[1], decide(doc("APROBADO", CDC_CASA_MINGO), consulta("Aprobado", CDC_43))[1]], ["CANCELADO", "APROBADO"]);
  cierto("R05-C05 fuente: reconciliacion.ts no tiene reglas de CDC (sin cdcCoherente, 44 dígitos, CDC_DIVERGENTE ni exigencia de CDC)", !/cdcCoherente|\\d\{44\}|CDC_DIVERGENTE|cdcValido|doc\.cdc|r\.cdc/.test(reconciliacion) && /FINALES/.test(reconciliacion) && /EVOLUCIONES/.test(reconciliacion));

  // ══ D. Recepción (ACK): el CDC no confirma ni descarta la recepción ═══════════════════════════════════════════════════════════════
  const DOC_REC = { tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000002", serie: "AA" };
  const ack = (cuerpo: unknown) => interpretarRecepcion(200, JSON.stringify(cuerpo), [], DOC_REC);

  igual("R05-D01 ACK con lote y CDC de 43 caracteres: ENVIADO, CDC literal (sin validar composición)", [ack({ status: "success", nro_lote: "L-R05", cdc: CDC_43 }).estadoLocal, ack({ status: "success", nro_lote: "L-R05", cdc: CDC_43 }).cdcInformado], ["ENVIADO", CDC_43]);
  igual("R05-D02 ACK sin lote ni eco, con SOLO un CDC: no correlacionado → ENVIO_INDETERMINADO; el CDC queda solo como evidencia", [ack({ status: "success", cdc: CDC_CASA_MINGO }).estadoLocal, ack({ status: "success", cdc: CDC_CASA_MINGO }).lote, ack({ status: "success", cdc: CDC_CASA_MINGO }).cdc, ack({ status: "success", cdc: CDC_CASA_MINGO }).cdcInformado], ["ENVIO_INDETERMINADO", null, null, CDC_CASA_MINGO]);
  igual("R05-D03 ACK con eco del número propio (sin lote): ENVIADO con el CDC literal", [ack({ status: "success", dEst: "001", dPunExp: "001", dNumDoc: "0000002", cdc: CDC_ALFA }).estadoLocal, ack({ status: "success", dEst: "001", dPunExp: "001", dNumDoc: "0000002", cdc: CDC_ALFA }).cdc], ["ENVIADO", CDC_ALFA]);
  igual("R05-D04 ACK con eco de OTRO número: indeterminado (aunque el CDC «parezca» propio)", ack({ status: "success", dEst: "001", dPunExp: "001", dNumDoc: "0000003", cdc: CDC_CASA_MINGO }).estadoLocal, "ENVIO_INDETERMINADO");
  igual("R05-D05 ACK con lote y CDC numérico (no texto): ENVIADO por lote; el CDC no se convierte", [ack({ status: "success", nro_lote: "L-R05", cdc: 123 }).estadoLocal, ack({ status: "success", nro_lote: "L-R05", cdc: 123 }).cdcInformado], ["ENVIADO", null]);
  cierto("R05-D06 fuente: interpretarRecepcion ya no usa cdcCoherente ni CDC_FORMATO; el CDC se lee con cdcInformadoPorApi", (() => { const f = tramo(gwSinComentarios, "export function interpretarRecepcion", "export async function enviarDocumentoGateway"); return !/cdcCoherente|CDC_FORMATO|\\d\{44\}/.test(f) && /cdcInformadoPorApi\(cdcBruto\)\.valor/.test(f); })());
  cierto("R05-D07 fuente: el envío registra por fe_documento_registrar_envio_r05 con UN solo CDC (r.cdcInformado) y sin fallback", /registrarR05\(db, "fe_documento_registrar_envio_r05"/.test(envio) && /r\.lote, r\.cdcInformado, r\.respuesta/.test(envio) && !/registrarConConexion|r\.cdc, r\.cdcInformado/.test(envio));

  // ══ E. Consulta manual / automática / flujo NCE contra la base simulada (funciones *_r05) ══════════════════════════════════════════
  {
    reiniciarNex080ParaCasos();
    limpiarCacheTokens();
    const b = base({ cdc: null, estadoSifen: "SIN_CONSULTA" });
    const g = gateway([respuestaConsulta("Aprobado", CDC_CASA_MINGO)]);
    const r = await consultarEstado(b.db, EMPRESA, USUARIO, DOC, { fetch: g.fetch, env: ENV });
    const pedido = g.pedidos.find((x) => x.url.endsWith("/api/consulta_de"));

    igual("R05-E01 CASA MINGO FE 001-001-0000002 (AA): consulta manual → fe_documento_registrar_consulta_r05 con OK/APROBADO y el CDC EXACTO informado", [r.resultado, /fe_documento_registrar_consulta_r05\(/.test(b.registros[0]?.sql ?? ""), b.registros[0]?.p[3], b.registros[0]?.p[7], b.registros[0]?.p[8]], ["OK", true, "OK", "APROBADO", CDC_CASA_MINGO]);
    igual("R05-E02 identificación del documento = cuenta autenticada + dEst/dPunExp/dNumDoc/dSerieNum/tipoDoc; la solicitud NO lleva CDC", [pedido?.cuerpo, JSON.stringify(pedido?.cuerpo ?? {}).includes(CDC_CASA_MINGO)], [{ dEst: "001", dPunExp: "001", dNumDoc: "0000002", dSerieNum: "AA", tipoDoc: "FE" }, false]);
  }
  {
    // Secuencia completa: 1.ª sin CDC (XML firmado aún sin CDC), intermedia con CDC, final con un CDC DISTINTO: nunca bloquea; cada intento lleva su literal; un CDC ausente no borra (p_cdc NULL).
    limpiarCacheTokens();
    const b = base({ cdc: null, estadoSifen: "PENDIENTE" });
    const g = gateway([respuestaConsulta("XML firmado", undefined), respuestaConsulta("XML firmado", CDC_CASA_MINGO), respuestaConsulta("Aprobado", CDC_ALFA), respuestaConsulta("Aprobado", undefined)]);

    for (let i = 0; i < 4; i++) await consultarEstado(b.db, EMPRESA, USUARIO, DOC, { fetch: g.fetch, env: ENV });
    igual("R05-E03 secuencia ausente → informado → distinto → ausente: [resultado, estado, p_cdc] por intento (sin CDC_DIVERGENTE; la SQL proyecta el último informado y AUSENTE no borra)", b.registros.map((x) => [x.p[3], x.p[7], x.p[8]]), [["OK", "PENDIENTE", null], ["OK", "PENDIENTE", CDC_CASA_MINGO], ["OK", "APROBADO", CDC_ALFA], ["OK", "APROBADO", null]]);
  }
  {
    limpiarCacheTokens();
    const bAuto = base();
    const bFlujo = base();

    await consultarEstado(bAuto.db, EMPRESA, USUARIO, DOC, { fetch: gateway([respuestaConsulta("XML firmado", CDC_43)]).fetch, env: ENV }, { flujoNce: true, leaseToken: LEASE });
    limpiarCacheTokens();
    await consultarEstado(bFlujo.db, EMPRESA, USUARIO, DOC, { fetch: gateway([respuestaConsulta("Rechazado", undefined)]).fetch, env: ENV }, { flujoNce: true });
    igual("R05-E04 consulta automática (worker): fe_documento_registrar_consulta_auto_r05 con el token de la reserva (p[14]) y el CDC literal; «XML firmado» queda PENDIENTE (el worker seguirá consultando)", [/fe_documento_registrar_consulta_auto_r05\(/.test(bAuto.registros[0]?.sql ?? ""), bAuto.registros[0]?.p[14], bAuto.registros[0]?.p[7], bAuto.registros[0]?.p[8]], [true, LEASE, "PENDIENTE", CDC_43]);
    igual("R05-E05 flujo NCE: fe_documento_registrar_consulta_flujo_nce_r05; Rechazado sin CDC se registra OK/RECHAZADO con p_cdc NULL", [/fe_documento_registrar_consulta_flujo_nce_r05\(/.test(bFlujo.registros[0]?.sql ?? ""), bFlujo.registros[0]?.p[3], bFlujo.registros[0]?.p[7], bFlujo.registros[0]?.p[8]], [true, "OK", "RECHAZADO", null]);
  }
  {
    reiniciarNex080ParaCasos();
    limpiarCacheTokens();
    const b = base({}, { sinNex080: true });
    const g = gateway([respuestaConsulta("Aprobado", CDC_CASA_MINGO)]);
    let estado = 0;
    let mensaje = "";

    try { await consultarEstado(b.db, EMPRESA, USUARIO, DOC, { fetch: g.fetch, env: ENV }); } catch (e) { estado = e instanceof ErrorFacturacion ? e.estado : -1; mensaje = e instanceof Error ? e.message : ""; }
    igual("R05-E06 sin NEX-080: falla CERRADA (503) antes del gateway; ninguna llamada externa ni registro; sin fallback a NEX-054/062/077/079", [estado, mensaje === MENSAJE_SIN_NEX080, g.pedidos.length, b.registros.length, b.sqls.some((s) => /fe_documento_registrar/.test(s))], [503, true, 0, 0, false]);
    reiniciarNex080ParaCasos();
  }
  cierto("R05-E07 fuente: exigirNex080 verifica las 4 firmas *_r05 en el catálogo (to_regprocedure) y cachea solo el resultado positivo", FUNCIONES_NEX080.length === 4 && FUNCIONES_NEX080.every((f) => /_r05\(/.test(f)) && /to_regprocedure\(f\) IS NOT NULL/.test(shared) && /export async function exigirNex080/.test(shared));
  cierto("R05-E08 el worker trata la falta de NEX-080 como «limitado» (reprograma; no consulta ni registra un intento ficticio) y no reenvía", /res\.limitados \+= 1/.test(leer("lib/facturacion/consulta-automatica.ts")) && !/enviarDocumento|recepcion_de|iniciar_envio/.test(sinComentariosTs(leer("lib/facturacion/consulta-automatica.ts"))));
  cierto("R05-E09 multiempresa: el documento se lee con la empresa y el usuario de la sesión (leerDocumento) antes de exigir NEX-080 y de llamar al gateway", /const doc = await leerDocumento\(db, empresaId, usuarioId, id\);/.test(shared) && shared.indexOf("const doc = await leerDocumento(db, empresaId, usuarioId, id);") < shared.indexOf("await exigirNex080(db);\n\n  // PRO-342-R02"));
  igual("R05-E10 constante EMPRESA_B solo para documentar el aislamiento (sin uso cruzado en la base simulada)", EMPRESA_B !== EMPRESA, true);

  // ══ F. NEX-080 (texto): elimina restricciones de CDC, conserva seguridad, idempotencia e historial ════════════════════════════════
  const nucleo = tramo(sql080, "FUNCTION public.fe_documento_registrar_consulta_nucleo_r05", "END $$;");
  const registrarEnvio = tramo(sql080, "FUNCTION public.fe_documento_registrar_envio_r05", "END $$;");
  const proyectar = tramo(sql080, "FUNCTION public.fe_cdc_proyectar_r05", "END $$;");
  const crearNce = tramo(sql080, "FUNCTION public.fe_documento_crear_nce", "END $$;");
  const funcionesR05 = [nucleo, registrarEnvio, proyectar, crearNce].join("\n");

  cierto("R05-F01 migración incremental nueva: exige NEX-047/062/070/077/079, no se reaplica y no edita migraciones históricas", /NEX-080 requiere NEX-079/.test(nex080) && /NEX-080 requiere NEX-062 y NEX-070/.test(nex080) && /NEX-080 parece aplicada/.test(nex080));
  cierto("R05-F02 elimina SOLO las restricciones de formato de CDC (fe_cdc_coherente / cdc ~) tras contarlas (2 + 1 + 1) y las respalda en nex080_respaldo antes del DROP", /se esperaban 2, 1 y 1/.test(nex080) && /CREATE TABLE public\.nex080_respaldo/.test(sql080) && sql080.indexOf("INSERT INTO public.nex080_respaldo") < sql080.indexOf("DROP CONSTRAINT %I"));
  cierto("R05-F03 nuevas restricciones = solo límite de transporte 1..256 caracteres (sin 44 dígitos ni composición) en documento, intento y nce_origen", /documentos_electronicos_cdc_texto_chk CHECK \(cdc IS NULL OR char_length\(cdc\) BETWEEN 1 AND 256\)/.test(sql080) && /cdc_informado_texto_chk CHECK \(cdc_informado IS NULL OR char_length\(cdc_informado\) BETWEEN 1 AND 256\)/.test(sql080) && /nce_origen_fe_cdc_texto_chk CHECK \(char_length\(fe_cdc\) BETWEEN 1 AND 256\)/.test(sql080));
  cierto("R05-F04 ninguna función R05 valida el CDC: sin fe_cdc_coherente, sin '[0-9]{44}', sin substr/posiciones y sin anotar CDC_DIVERGENTE", !/fe_cdc_coherente\(|\[0-9\]\{44\}|substr\(|substring\(|:= 'CDC_DIVERGENTE'/.test(funcionesR05));
  cierto("R05-F05 el estado informado se actualiza SIN condición sobre el CDC; luego se proyecta el CDC (fe_cdc_proyectar_r05)", /IF v_resultado = 'OK' THEN\s+UPDATE public\.documentos_electronicos SET\s+estado_sifen = p_estado_sifen/.test(nucleo) && nucleo.indexOf("estado_sifen = p_estado_sifen") < nucleo.indexOf("fe_cdc_proyectar_r05("));
  cierto("R05-F06 proyección: ausente/NULL → AUSENTE (no borra), igual → SIN_CAMBIO, CDC de OTRO documento de la empresa → NO_PROYECTADO_OTRO_DOCUMENTO (estado igual registrado), nuevo → INICIAL / CAMBIO", /IF p_cdc_informado IS NULL THEN\s+RETURN 'AUSENTE'/.test(proyectar) && /IS NOT DISTINCT FROM p_cdc_informado THEN\s+RETURN 'SIN_CAMBIO'/.test(proyectar) && /cdc = p_cdc_informado AND id <> p_documento\) THEN\s+RETURN 'NO_PROYECTADO_OTRO_DOCUMENTO'/.test(proyectar) && /WHEN unique_violation/.test(proyectar) && /'INICIAL' ELSE 'CAMBIO'/.test(proyectar));
  cierto("R05-F07 historial inmutable: el intento guarda cdc_informado literal, cdc_anterior (solo CAMBIO) y cdc_proyeccion; intentos siguen de solo altas", /cdc_informado, cdc_anterior, cdc_proyeccion/.test(nucleo) && /cdc_informado, cdc_anterior, cdc_proyeccion/.test(registrarEnvio) && /documento_electronico_intentos_cdc_cambio_chk CHECK \(\(cdc_proyeccion = 'CAMBIO'\) = \(cdc_anterior IS NOT NULL\)\)/.test(sql080) && /documento_electronico_intentos es de solo altas: no se modifica\./.test(sql080));
  cierto("R05-F08 el CDC del documento solo cambia por la proyección del MISMO documento (variable de transacción) y nunca pasa a NULL", /NEW\.cdc IS NULL OR coalesce\(current_setting\('nex\.r05_proyeccion_cdc', true\), ''\) <> OLD\.id::text/.test(sql080) && /set_config\('nex\.r05_proyeccion_cdc', p_documento::text, true\)/.test(proyectar));
  cierto("R05-F09 respuesta no aceptada (error / contradicción) o envío no ENVIADO: el CDC queda solo como evidencia (NO_PROYECTADO), sin tocar estado ni CDC del documento", /v_proyeccion := CASE WHEN v_cdc IS NOT NULL THEN 'NO_PROYECTADO' END;/.test(nucleo) && /IF p_estado_local = 'ENVIADO' THEN\s+v_proyeccion := public\.fe_cdc_proyectar_r05/.test(registrarEnvio));
  cierto("R05-F10 guarda de estado final independiente del CDC conservada (solo APROBADO → CANCELADO)", /d\.estado_sifen IN \('APROBADO','RECHAZADO','CANCELADO','INUTILIZADO'\)/.test(nucleo) && /d\.estado_sifen = 'APROBADO' AND p_estado_sifen = 'CANCELADO'/.test(nucleo));
  cierto("R05-F11 seguridad multiempresa: permisos (EDITAR/CREAR), documento por empresa con FOR UPDATE, token de lease (AUTO) y SECURITY DEFINER con search_path fijo", /'FACTURACION_ELECTRONICA', 'EDITAR'/.test(nucleo) && /FOR UPDATE/.test(nucleo) && /NEX:LEASE_OBSOLETO/.test(nucleo) && /NEX:ENVIO_NO_INICIADO/.test(registrarEnvio) && (nex080.match(/SECURITY DEFINER SET search_path = public, pg_temp/g) ?? []).length >= 6);
  cierto("R05-F12 idempotencia de envío: el lote se fija una sola vez y solo con ENVIADO (coalesce(lote, v_lote))", /lote = CASE WHEN p_estado_local = 'ENVIADO' THEN coalesce\(lote, v_lote\) ELSE lote END/.test(registrarEnvio));
  cierto("R05-F13 CDC_DIVERGENTE ya no es un resultado de entrada admitido por la función R05 (solo histórico)", /CDC_DIVERGENTE ya no es un resultado que se registre/.test(nex080) && !/'CDC_DIVERGENTE'/.test(nucleo.slice(0, nucleo.indexOf("resultado de consulta no válido"))));
  cierto("R05-F14 grants: privadas (proyección, texto, núcleo, respaldo) sin EXECUTE para nexit_runtime; públicas *_r05 con REVOKE PUBLIC + GRANT runtime; sin INSERT/UPDATE directos", (() => {
    const g = tramo(sql080, "FUNCTION public.nex_aplicar_grants_facturacion_cdc_dato_api", "END $$;");
    return !/GRANT[^;]*(fe_cdc_proyectar_r05|fe_cdc_texto_r05|consulta_nucleo_r05|nex080_respaldo)[^;]*TO nexit_runtime/.test(g) && (g.match(/GRANT EXECUTE ON FUNCTION public\.fe_documento_registrar_\w+_r05/g) ?? []).length === 4 && !/GRANT[^;]*(INSERT|UPDATE|DELETE)/i.test(g) && /REVOKE ALL ON public\.nex080_respaldo FROM nexit_runtime/.test(g);
  })());
  cierto("R05-F15 coexistencia: las firmas anteriores (NEX-054/062/077/079) no se editan ni se borran; la app R05 solo usa *_r05", !/DROP FUNCTION public\.fe_documento_registrar_(consulta|envio)\(/.test(sql080) && !/CREATE OR REPLACE FUNCTION public\.fe_documento_registrar_consulta\(/.test(sql080) && !/"fe_documento_registrar_consulta"|"fe_documento_registrar_envio"/.test(shared + envio));
  cierto("R05-F16 NCE: fe_documento_crear_nce exige FE APROBADA y PRESENCIA del CDC (sin fe_cdc_coherente) y asocia el literal (dCdCDERef = v_fe.cdc)", /v_fe\.estado_sifen <> 'APROBADO' OR v_fe\.cdc IS NULL/.test(crearNce) && !/fe_cdc_coherente/.test(crearNce) && /dCdCDERef/.test(crearNce));
  cierto("R05-F17 preflight de solo lectura (BEGIN READ ONLY … ROLLBACK) y verificación de solo lectura", /BEGIN READ ONLY;/.test(preflight) && /ROLLBACK;/.test(preflight) && /BEGIN READ ONLY;/.test(verificar) && /ROLLBACK;/.test(verificar) && !/\b(INSERT|UPDATE|DELETE|ALTER|DROP)\b/i.test(sinComentariosSql(preflight)));
  cierto("R05-F18 reversión protegida: aborta si hay evidencia R05 (cdc_proyeccion/cdc_anterior) o CDC que las restricciones anteriores no admiten, o respaldo incompleto; restaura desde nex080_respaldo", reversion.indexOf("RAISE EXCEPTION 'Hay intentos con evidencia") > 0 && /las restricciones anteriores no admiten/.test(reversion) && /Respaldo de NEX-080 incompleto/.test(reversion) && reversion.indexOf("RAISE EXCEPTION") < reversion.indexOf("DROP FUNCTION") && /FROM public\.nex080_respaldo WHERE clase = 'FUNCION'/.test(reversion));
  cierto("R05-F19 filas históricas NO se corrigen: la migración no hace UPDATE/DELETE de documentos, intentos ni nce_origen fuera de las funciones", !/^\s*(UPDATE|DELETE FROM) public\.(documentos_electronicos|documento_electronico_intentos|nce_origen)\b/m.test(sql080.replace(/\$\$[\s\S]*?\$\$/g, "")));

  // ══ G. KuDE: identidad sin CDC; el CDC nunca prueba pertenencia; PDF ajeno descartado ═════════════════════════════════════════════
  const kFe = { tipoDoc: "FE" as const, establecimiento: "001", puntoExpedicion: "001", numero: "0000002", serie: "AA", cdcRegistrado: CDC_CASA_MINGO };
  const kNce = { ...kFe, tipoDoc: "NCE" as const, serie: null, cdcRegistrado: null };

  igual("R05-G01 KuDE FE: cuerpo de 5 campos (dEst, dPunExp, dNumDoc, dSerieNum, tipoDoc) sin CDC", cuerpoKudeGateway(kFe), { dEst: "001", dPunExp: "001", dNumDoc: "0000002", dSerieNum: "AA", tipoDoc: "FE" });
  igual("R05-G02 KuDE NCE: 6 campos (tipOpe 4 + identidad + tipoDoc ncr) sin CDC", cuerpoKudeGateway(kNce), { tipOpe: "4", dEst: "001", dPunExp: "001", dNumDoc: "0000002", dSerieNum: null, tipoDoc: "ncr" });
  igual("R05-G03 CASA MINGO: CDC del KuDE IGUAL al registrado → NO_VERIFICADO (el CDC no prueba titularidad; CDC_REGISTRADO inalcanzable)", correspondenciaKude(kFe, CDC_CASA_MINGO), "NO_VERIFICADO");
  igual("R05-G04 CDC del KuDE DISTINTO del registrado (incluso solo por espacios) → descartado como posible PDF ajeno (null → 502)", [correspondenciaKude(kFe, CDC_ALFA), correspondenciaKude(kFe, ` ${CDC_CASA_MINGO}`)], [null, null]);
  igual("R05-G05 KuDE sin CDC en la respuesta, o documento sin CDC registrado y CDC no SIFEN: NO_VERIFICADO (se muestra con advertencia, nunca como verificado)", [correspondenciaKude(kFe, undefined), correspondenciaKude({ ...kFe, cdcRegistrado: null }, CDC_ALFA)], ["NO_VERIFICADO", "NO_VERIFICADO"]);
  cierto("R05-G06 fuente: correspondenciaKude nunca devuelve «CDC_REGISTRADO»", !/return\s+"CDC_REGISTRADO"|\?\s*"CDC_REGISTRADO"/.test(tramo(gwSinComentarios, "export function correspondenciaKude", "export function interpretarKude")));

  // ══ H. NCE: asociación legítima con el CDC literal de la FE ══════════════════════════════════════════════════════════════════════
  cierto("R05-H01 nce.ts exige solo la PRESENCIA del CDC de la FE APROBADA (sin 44 dígitos) y payload-nce.ts lo asocia literal", /typeof f\.cdc !== "string" \|\| f\.cdc === ""/.test(leer("lib/facturacion/nce.ts")) && /typeof cdcOriginal !== "string" \|\| cdcOriginal === ""/.test(leer("lib/facturacion/payload-nce.ts")) && /dCdCDERef: cdcOriginal/.test(leer("lib/facturacion/payload-nce.ts")));
  cierto("R05-H02 NCE ya emitidas no se propagan: NEX-080 no actualiza nce_origen.fe_cdc ni payloads existentes", !/UPDATE public\.nce_origen|UPDATE public\.documento_electronico_solicitudes/.test(sql080));

  // ══ I. Pantalla: CDC literal y avisos informativos (nunca bloqueos) ═════════════════════════════════════════════════════════════
  const iconos = (cdc: string | null, estadoSifen: "APROBADO" | "PENDIENTE" | "RECHAZADO", ultima: string | null = "OK") => iconosEstado({ estadoLocal: "ENVIADO", estadoSifen, estadoEmail: "NO_INFORMADO", cdc, ultimaConsultaResultado: ultima });

  igual("R05-I01 XML/CDC con CDC de 43 caracteres: «CDC informado» (sin juicio de validez)", [iconos(CDC_43, "PENDIENTE")[1].corto, /tal cual/.test(iconos(CDC_43, "PENDIENTE")[1].texto)], ["CDC informado", true]);
  igual("R05-I02 SIFEN Aprobado sin CDC: «SIFEN Aprobado» (sin alerta de integridad) + nota informativa avisoSinCdc", [iconos(null, "APROBADO")[2].corto, iconos(null, "APROBADO")[2].tono, /sin CDC/.test(avisoSinCdc({ estadoSifen: "APROBADO", cdc: null }) ?? ""), avisoSinCdc({ estadoSifen: "APROBADO", cdc: CDC_ALFA })], ["SIFEN Aprobado", "ok", true, null]);
  igual("R05-I03 cambio de CDC informado: aviso INFORMATIVO con el anterior (el documento muestra el nuevo); otro documento / no aceptada también informativos", [/anterior: X-ANTERIOR/.test(avisoProyeccionCdc({ cdcProyeccion: "CAMBIO", cdcAnterior: "X-ANTERIOR" }) ?? ""), avisoProyeccionCdc({ cdcProyeccion: "NO_PROYECTADO_OTRO_DOCUMENTO", cdcAnterior: null }) !== null, avisoProyeccionCdc({ cdcProyeccion: "INICIAL", cdcAnterior: null }), avisoProyeccionCdc({ cdcProyeccion: null, cdcAnterior: null })], [true, true, null, null]);
  igual("R05-I04 CDC_DIVERGENTE solo como registro histórico (pantalla y rótulo)", [/^Registro histórico/.test(alertaConsulta({ ultimaConsultaResultado: "CDC_DIVERGENTE" })?.texto ?? ""), ETIQUETA_RESULTADO_INTENTO.CDC_DIVERGENTE], [true, "Registro histórico: CDC no aceptado por una validación anterior (ya no se aplica)"]);
  igual("R05-I05 rechazo fiscal en rojo con RECHAZADO persistido, con o sin CDC", [detalleFiscalPrimario({ lote: null, cdc: null, fechaFirma: null, codRespuesta: "0160", mensajeRespuesta: "x", estadoSifen: "RECHAZADO" }).rechazo, detalleFiscalPrimario({ lote: "L", cdc: CDC_ALFA, fechaFirma: null, codRespuesta: null, mensajeRespuesta: null, estadoSifen: "RECHAZADO" }).rechazo], [true, true]);
  cierto("R05-I06 detalle: el CDC se muestra completo y literal (pre-wrap, corte de línea) y el historial muestra avisoProyeccionCdc", /whiteSpace: "pre-wrap", overflowWrap: "anywhere"/.test(pagina) && /avisoProyeccionCdc\(i\)/.test(pagina) && /avisoSinCdc\(d\)/.test(pagina) && !/alertaIntegridad|cdcValido/.test(pagina));

  // ══ J. Reportes ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  cierto("R05-J01 Informe de ventas: una NCE ya no se marca NCE_ORIGEN_INVALIDO porque el CDC de la FE cambió (sin comparar fe_cdc_doc con fe_cdc)", !/fe_cdc_doc IS DISTINCT FROM fe_cdc/.test(leer("lib/reportes/ventas.ts")));

  // ══ K. Barrido de dependencias (100%): ninguna validación propia del CDC en recepción, envío, consulta ni estado ═════════════════
  cierto("R05-K01 gateway.ts: el único /^\\d{44}$/ es CDC_FORMATO y solo se usa en el KuDE (correspondenciaKude); cdcCoherente solo en el KuDE", (() => {
    const usos = gwSinComentarios.split("\n").filter((l) => /CDC_FORMATO|cdcCoherente\(/.test(l) && !/^(export )?(const|function) /.test(l.trim()) && !/^export function cdcCoherente/.test(l.trim()));
    const kude = tramo(gwSinComentarios, "export function correspondenciaKude", "export function interpretarKude");
    return usos.every((l) => kude.includes(l.trim()));
  })());
  cierto("R05-K02 shared.ts: CDC_EN_RESPUESTA acepta cualquier texto no vacío (sin 44 dígitos) y los SELECT de intentos exponen cdc_proyeccion / cdc_anterior", !/\\d\{44\}|\[0-9\]\{44\}/.test(sinComentariosTs(shared)) && /cdc_proyeccion/.test(shared) && /cdc_anterior/.test(shared));
  cierto("R05-K03 el saneamiento de secretos se mantiene en la ruta contractual (resultadoFiscalSinSecretos con CDC_TRANSPORTABLE)", /resultadoFiscalSinSecretos/.test(gw) && /cdc: CDC_TRANSPORTABLE/.test(gw) && /"respuesta\.response\.de\.cdc": CDC_TRANSPORTABLE/.test(gw));
  cierto("R05-K04 NEXIT no genera, completa ni reconstruye CDC: ninguna función TS construye un CDC (sin concatenar RUC/DV/código de seguridad)", !/function (generar|construir|calcular|completar)Cdc/i.test(gw + shared + envio));

  // ══ L. PRO-342-R05-R01 — correctivo focal de la auditoría R05 (F001 identidad completa, F002 verificación sin falsos negativos por comentarios, F003 credenciales nunca como CDC) ═══════
  // El CDC sigue SIN validarse (ninguna regla de longitud fiscal, composición, módulo 11 ni CDC_DIVERGENTE): estos casos solo cubren identidad del documento, el script de verificación y secretos.
  {
    // ── F001: ecos explícitos de identidad en la RECEPCIÓN (raíz del ACK) contra establecimiento, punto, número, SERIE y TIPO ──
    const DOC_L = { tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000002", serie: "AA" };
    const ECO = { dEst: "001", dPunExp: "001", dNumDoc: "0000002" };
    const ackL = (cuerpo: unknown, d: DocumentoRecepcion = DOC_L) => interpretarRecepcion(200, JSON.stringify(cuerpo), [], d);
    const est = (cuerpo: unknown, d?: DocumentoRecepcion) => ackL(cuerpo, d).estadoLocal;

    igual("R05-R01-F001-01 ACK success + nro_lote con dSerieNum CONTRADICTORIO («AB» ≠ «AA»): ENVIO_INDETERMINADO, sin lote atribuido (antes ENVIADO)", [est({ status: "success", nro_lote: "L-1", dSerieNum: "AB" }), ackL({ status: "success", nro_lote: "L-1", dSerieNum: "AB" }).lote], ["ENVIO_INDETERMINADO", null]);
    igual("R05-R01-F001-02 ACK success + nro_lote con tipoDoc CONTRADICTORIO («NCE» para una FE): ENVIO_INDETERMINADO", est({ status: "success", nro_lote: "L-1", tipoDoc: "NCE" }), "ENVIO_INDETERMINADO");
    igual("R05-R01-F001-03 eco de tres campos + serie y tipo COINCIDENTES («AA», «FE»/«fe»): ENVIADO", [est({ status: "success", ...ECO, dSerieNum: "AA", tipoDoc: "FE" }), est({ status: "success", ...ECO, dSerieNum: "AA", tipoDoc: "fe" })], ["ENVIADO", "ENVIADO"]);
    igual("R05-R01-F001-04 eco de tres campos coincidentes PERO serie o tipo contradictorios: ENVIO_INDETERMINADO (antes ENVIADO por el eco de tres campos)", [est({ status: "success", ...ECO, dSerieNum: "AB" }), est({ status: "success", ...ECO, tipoDoc: "NCE" })], ["ENVIO_INDETERMINADO", "ENVIO_INDETERMINADO"]);
    igual("R05-R01-F001-05 dSerieNum null = «sin serie»: contradice a un documento con serie «AA»; coincide con un documento sin serie", [est({ status: "success", nro_lote: "L-1", dSerieNum: null }), est({ status: "success", nro_lote: "L-1", dSerieNum: null }, { ...DOC_L, serie: null })], ["ENVIO_INDETERMINADO", "ENVIADO"]);
    igual("R05-R01-F001-06 eco explícito NO interpretable (número, vacío, booleano, objeto), sin normalizar: nunca confirma → ENVIO_INDETERMINADO aunque haya lote", [
      est({ status: "success", nro_lote: "L-1", dNumDoc: 2 }), est({ status: "success", nro_lote: "L-1", dEst: "" }), est({ status: "success", nro_lote: "L-1", dSerieNum: 0 }),
      est({ status: "success", nro_lote: "L-1", tipoDoc: true }), est({ status: "success", nro_lote: "L-1", dPunExp: { v: "001" } }), est({ status: "success", ...ECO, dNumDoc: 2 }),
    ], Array(6).fill("ENVIO_INDETERMINADO"));
    igual("R05-R01-F001-07 la AUSENCIA de eco no es contradicción: success + nro_lote sin ecos sigue ENVIADO (contrato confirmado); un eco null de establecimiento/punto/número/tipo es ausencia", [est({ status: "success", nro_lote: "L-1" }), est({ status: "success", nro_lote: "L-1", dEst: null, tipoDoc: null })], ["ENVIADO", "ENVIADO"]);
    igual("R05-R01-F001-08 serie del documento DESCONOCIDA (no informada): un eco de serie no se puede comparar → indeterminado; sin eco de serie, el lote confirma igual", [est({ status: "success", nro_lote: "L-1", dSerieNum: "AA" }, { tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000002" }), est({ status: "success", nro_lote: "L-1" }, { tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000002" })], ["ENVIO_INDETERMINADO", "ENVIADO"]);
    igual("R05-R01-F001-09 el CDC NO es identidad: un CDC «propio» no salva una serie contradictoria y un CDC de otra composición no impide la confirmación por lote", [est({ status: "success", nro_lote: "L-1", dSerieNum: "AB", cdc: CDC_CASA_MINGO }), est({ status: "success", nro_lote: "L-1", cdc: CDC_ALFA }), ackL({ status: "success", nro_lote: "L-1", cdc: CDC_ALFA }).cdc], ["ENVIO_INDETERMINADO", "ENVIADO", CDC_ALFA]);
    igual("R05-R01-F001-10 claves repetidas con distinta capitalización: basta UNA contradictoria (se recorren todas)", est({ status: "success", nro_lote: "L-1", dSerieNum: "AA", DSERIENUM: "AB" }), "ENVIO_INDETERMINADO");
    igual("R05-R01-F001-11 eco de otro número (regresión R05-D04): sigue indeterminado", est({ status: "success", ...ECO, dNumDoc: "0000003" }), "ENVIO_INDETERMINADO");
    igual("R05-R01-F001-12 seriePayload: la serie sale del payload persistido (dSerieNum texto o null); sin la clave o con otro tipo → desconocida (no se inventa)", [seriePayload({ dSerieNum: "AA" }), seriePayload({ dSerieNum: null }), seriePayload({}), seriePayload({ dSerieNum: 5 }), seriePayload(null)], ["AA", null, undefined, undefined, undefined]);
    cierto("R05-R01-F001-13 fuente: envio.ts pasa la serie del MISMO payload persistido que se transmite (seriePayload(fila.payload)) junto con tipo, establecimiento, punto y número", /numero, serie: seriePayload\(fila\.payload as Record<string, unknown>\) \}/.test(envio) && /tipo: String\(fila\.tipo\), establecimiento: String\(fila\.establecimiento\), puntoExpedicion: String\(fila\.punto\)/.test(envio));
    cierto("R05-R01-F001-14 fuente: la identidad de los ecos no incluye el CDC (ecosIdentidad / claseEco sin «cdc»)", (() => { const f = tramo(gwSinComentarios, "const CAMPOS_ECO_IDENTIDAD", "const identidadConsulta"); return f.length > 0 && !/cdc/i.test(f); })());
  }
  {
    // Envío completo (enviarDocumentoGateway real, fetch simulado): payload con dSerieNum «AA», ACK con lote y serie de OTRO documento.
    limpiarCacheTokens();
    const g = gateway([{ status: "success", nro_lote: "L-R01", dSerieNum: "AB" }]);
    const r = await enviarDocumentoGateway({ empresaId: EMPRESA, baseUrl: "https://gateway.prueba.invalid", credencialRef: "PRUEBA", timeoutMs: 1000 }, { iTiDE: 1, dEst: "001", dPunExp: "001", dNumDoc: "0000002", dSerieNum: "AA" }, { tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000002", serie: "AA" }, { fetch: g.fetch, env: ENV });

    igual("R05-R01-F001-15 envío real: ACK con lote pero serie contradictoria → ENVIO_INDETERMINADO, lote NO atribuido al documento (queda solo en la evidencia), sin reenvío", ["sinContrato" in r ? "SIN" : r.estadoLocal, "sinContrato" in r ? "SIN" : r.lote, g.pedidos.filter((x) => x.url.endsWith("/api/recepcion_de")).length], ["ENVIO_INDETERMINADO", null, 1]);
  }
  {
    // ── F001: ecos explícitos en la CONSULTA (response y response.DE): ya no se ignoran números ni vacíos ──
    const SIN_SERIE: DocumentoConsulta = { ...CASA_MINGO, serie: null };

    igual("R05-R01-F001-16 consulta: eco explícito NO interpretable (dNumDoc numérico, dSerieNum vacío, DE.tipoDoc booleano) → RESPUESTA_INVALIDA sin estado ni CDC (antes se ignoraban)", [
      consulta("Aprobado", CDC_CASA_MINGO, CASA_MINGO, { dNumDoc: 2 }), consulta("Aprobado", CDC_CASA_MINGO, CASA_MINGO, { dSerieNum: "" }), consulta("Aprobado", CDC_CASA_MINGO, CASA_MINGO, {}, { tipoDoc: true }),
    ].map((r) => [r.resultado, r.estadoSifen, r.cdc]), Array(3).fill(["RESPUESTA_INVALIDA", null, null]));
    igual("R05-R01-F001-17 consulta: dSerieNum null contradice a un documento con serie; con un documento sin serie coincide (OK)", [consulta("Aprobado", CDC_CASA_MINGO, CASA_MINGO, { dSerieNum: null }).resultado, consulta("Aprobado", CDC_CASA_MINGO, SIN_SERIE, { dSerieNum: null }).resultado], ["RESPUESTA_INVALIDA", "OK"]);
    igual("R05-R01-F001-18 consulta: ausencia de eco o eco null de establecimiento no bloquea; eco completo coincidente tampoco", [consulta("Aprobado", CDC_ALFA).resultado, consulta("Aprobado", CDC_ALFA, CASA_MINGO, { dEst: null }).resultado, consulta("Aprobado", CDC_ALFA, CASA_MINGO, { dEst: "001", dPunExp: "001", dNumDoc: "0000002", dSerieNum: "AA", tipoDoc: "FE" }).resultado], ["OK", "OK", "OK"]);
    igual("R05-R01-F001-19 ecoIdentidadConsulta distingue CONTRADICE de NO_INTERPRETABLE (la contradicción tiene prioridad) y el mensaje lo dice", [
      ecoIdentidadConsulta({ dSerieNum: "AB" }, CASA_MINGO), ecoIdentidadConsulta({ dNumDoc: 2 }, CASA_MINGO), ecoIdentidadConsulta({ dNumDoc: 2, dEst: "009" }, CASA_MINGO)?.clase,
      /no se puede comparar/.test(consulta("Aprobado", undefined, CASA_MINGO, { dNumDoc: 2 }).mensaje ?? ""), /identifica otro documento/.test(consulta("Aprobado", undefined, CASA_MINGO, { dSerieNum: "AB" }).mensaje ?? ""),
    ], [{ campo: "dSerieNum", clase: "CONTRADICE" }, { campo: "dNumDoc", clase: "NO_INTERPRETABLE" }, "CONTRADICE", true, true]);
    igual("R05-R01-F001-20 regresión R05-B06/B07: contradicciones de texto siguen invalidando; ecos coincidentes o ausentes no", [ecoIdentidadContradice({ dSerieNum: "AB" }, CASA_MINGO), ecoIdentidadContradice({ dEst: "001", dPunExp: "001", dNumDoc: "0000002", dSerieNum: "AA", tipoDoc: "fe" }, CASA_MINGO), ecoIdentidadContradice({}, CASA_MINGO)], ["dSerieNum", null, null]);
  }
  {
    // ── F002: verificar-NEX-080.sql inspecciona LLAMADAS efectivas, no comentarios ──
    const sinTextosSql = (t: string) => t.replace(/'(?:[^']|'')*'/g, "''");
    const limpiar = (src: string) => src.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
    const LLAMADA = /(^|[^a-z0-9_$])"?fe_cdc_coherente"?\s*\(/i;
    const llama = (src: string) => LLAMADA.test(sinTextosSql(limpiar(src)));
    const cuerpo = (nombre: string) => { const i = nex080.indexOf(`CREATE OR REPLACE FUNCTION public.${nombre}(`); const j = nex080.indexOf("$$", nex080.indexOf("AS $$", i) + 5); return i < 0 ? "" : nex080.slice(nex080.indexOf("AS $$", i) + 5, j); };
    const nce = cuerpo("fe_documento_crear_nce");

    cierto("R05-R01-F002-01 el falso negativo existía: el cuerpo REAL de fe_documento_crear_nce en NEX-080 nombra fe_cdc_coherente SOLO en un comentario («antes fe_cdc_coherente»)", nce.length > 1000 && nce.includes("fe_cdc_coherente") && !llama(nce));
    cierto("R05-R01-F002-02 el limpiado (comentarios, luego literales) no ve llamadas en un comentario de línea, de bloque ni en un mensaje; sí en una llamada real", !llama("-- antes fe_cdc_coherente(x)\n/* fe_cdc_coherente(a) */\nRAISE EXCEPTION 'no usar fe_cdc_coherente(y)';") && llama("IF NOT public.fe_cdc_coherente(a, b) THEN RETURN; END IF; -- comentario") && llama('PERFORM "fe_cdc_coherente" (1)'));
    cierto("R05-R01-F002-03 las 7 funciones R05 de NEX-080 no LLAMAN a fe_cdc_coherente ni devuelven CDC_DIVERGENTE en código ejecutable; el trigger lee nex.r05_proyeccion_cdc fuera de comentarios", ["fe_documento_registrar_consulta_nucleo_r05", "fe_documento_registrar_consulta_r05", "fe_documento_registrar_consulta_flujo_nce_r05", "fe_documento_registrar_consulta_auto_r05", "fe_documento_registrar_envio_r05", "fe_cdc_proyectar_r05", "fe_cdc_texto_r05"].every((f) => cuerpo(f).length > 0 && !llama(cuerpo(f)) && !/'CDC_DIVERGENTE'/.test(limpiar(cuerpo(f)))) && /current_setting\s*\(\s*'nex\.r05_proyeccion_cdc'/.test(limpiar(cuerpo("fe_documentos_inmutable"))));
    cierto("R05-R01-F002-04 verificar-NEX-080.sql ya no usa «pg_get_functiondef(…) NOT LIKE '%fe_cdc_coherente%'» ni «LIKE '%nex.r05_proyeccion_cdc%'» sobre el texto completo; limpia prosrc (comentarios → literales) y busca la llamada «fe_cdc_coherente(»", !/pg_get_functiondef/.test(sinComentariosSql(verificar)) && /p\.prosrc/.test(verificar) && /regexp_replace\(regexp_replace\(src, '--\[\^\\n\]\*', ' ', 'g'\), '\/\\\*\.\*\?\\\*\/', ' ', 'g'\)/.test(verificar) && /fe_cdc_coherente"\?\[\[:space:\]\]\*\\\(/.test(verificar));
    cierto("R05-R01-F002-05 verificar-NEX-080.sql prueba su propio detector (comentario/literal NO cuentan; llamada y resultado reales SÍ) y no quita controles: mantiene restricciones, índice, columnas, respaldo, trigger, NCE, funciones R05 y grants", ["MUESTRA_COMENTARIO", "MUESTRA_LLAMADA", "MUESTRA_RESULTADO", "MUESTRA_RESULTADO_COMENTADO", "MUESTRA_PROYECCION_COMENTADA", "sin restricciones de formato/coherencia del CDC en documentos", "límites de transporte 1..256 presentes (3)", "índice único (empresa_id, cdc) conservado", "ningún intento existente modificado", "respaldo: 2 funciones + 4 restricciones", "trigger: el CDC solo cambia por la proyección R05", "fe_documento_crear_nce sin LLAMADAS a fe_cdc_coherente", "funciones R05 (7) sin LLAMADAS", "nexit_runtime ejecuta las 4 funciones públicas R05", "nexit_runtime NO ejecuta las privadas", "nexit_runtime sigue sin UPDATE directo"].every((c) => verificar.includes(c)));
    cierto("R05-R01-F002-06 verificar-NEX-080.sql sigue siendo de SOLO LECTURA: BEGIN READ ONLY … ROLLBACK y sin INSERT/UPDATE/DELETE/ALTER/DROP/CREATE ejecutables (fuera de comentarios y literales)", /BEGIN READ ONLY;/.test(verificar) && /ROLLBACK;\s*$/.test(verificar) && !/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i.test(sinComentariosSql(sinTextosSql(verificar))));
  }
  {
    // ── F003: una credencial devuelta por la API en la ruta del CDC nunca se persiste ni se expone como CDC ──
    const CLAVE = ENV.NEXIT_FE_PRUEBA_PASSWORD;
    const CDC_CON_RUC = "0180000005" + "6".repeat(34); // CDC legítimo que CONTIENE el RUC / una clave numérica corta
    const ENV_NUM = { NEXIT_FE_PRUEBA_RUC: "80000005", NEXIT_FE_PRUEBA_PASSWORD: "80000005" }; // sintético: clave numérica igual al RUC
    const LARGO_NUM = "1234567890123456";
    const ASTRAL_200 = "\u{1F600}".repeat(200);

    igual("R05-R01-F003-01 cdcEsCredencial: clave EXACTA, token EXACTO, «Bearer …», JWT y un secreto alfanumérico largo contenido → credencial", [cdcEsCredencial(CLAVE, [CLAVE, TOKEN]), cdcEsCredencial(TOKEN, [CLAVE, TOKEN]), cdcEsCredencial("Bearer abcdefgh12345678", []), cdcEsCredencial(TOKEN, []), cdcEsCredencial(`x${TOKEN}y`, [CLAVE, TOKEN]), cdcEsCredencial(`pre-${CLAVE}`, [CLAVE])], [true, true, true, true, true, true]);
    igual("R05-R01-F003-02 cdcEsCredencial NO es validación fiscal: un CDC que solo CONTIENE la clave numérica/RUC, un CDC alfanumérico, de 43/45 caracteres o con espacios, y un secreto numérico largo contenido → NO credencial (no se mutila)", [cdcEsCredencial(CDC_CON_RUC, ["80000005"]), cdcEsCredencial(CDC_ALFA, [CLAVE, TOKEN]), cdcEsCredencial(CDC_43, [CLAVE]), cdcEsCredencial(CDC_45, [CLAVE]), cdcEsCredencial(CDC_ESPACIOS, [CLAVE]), cdcEsCredencial(`99${LARGO_NUM}99`, [LARGO_NUM])], [false, false, false, false, false, false]);
    {
      reiniciarNex080ParaCasos();
      limpiarCacheTokens();
      const b = base({ cdc: CDC_CASA_MINGO, estadoSifen: "PENDIENTE" });
      const g = gateway([respuestaConsulta("Aprobado", CLAVE), respuestaConsulta("Rechazado", TOKEN), respuestaConsulta("Aprobado", `Bearer ${TOKEN}`)]);

      for (let i = 0; i < 3; i++) await consultarEstado(b.db, EMPRESA, USUARIO, DOC, { fetch: g.fetch, env: ENV });
      // p[13] = evidencia JSON serializada tal como llega a la función SQL.
      const evidencias = b.registros.map((x) => String(x.p[13] ?? ""));

      igual("R05-R01-F003-03 consulta real: la API devuelve en DE.CDC la clave, el token o «Bearer <token>» → el estado informado se registra igual (OK/APROBADO, OK/RECHAZADO) y p_cdc = NULL (proyección AUSENTE: no borra el CDC anterior)", b.registros.map((x) => [x.p[3], x.p[7], x.p[8]]), [["OK", "APROBADO", null], ["OK", "RECHAZADO", null], ["OK", "APROBADO", null]]);
      cierto("R05-R01-F003-04 consulta real: la evidencia JSON del intento NO contiene la clave ni el token y lleva la marca técnica sin secreto", evidencias.length === 3 && evidencias.every((e) => !e.includes(CLAVE) && !e.includes(TOKEN) && e.includes(`"${CLAVE_ANOMALIA_NEXIT}":"${ANOMALIA_CDC_CREDENCIAL}"`)));
    }
    {
      reiniciarNex080ParaCasos();
      limpiarCacheTokens();
      const b = base({ cdc: null, estadoSifen: "PENDIENTE" });
      const g = gateway([respuestaConsulta("Aprobado", CDC_CON_RUC), respuestaConsulta("Aprobado", "80000005")]);

      for (let i = 0; i < 2; i++) await consultarEstado(b.db, EMPRESA, USUARIO, DOC, { fetch: g.fetch, env: ENV_NUM });
      const ev = b.registros.map((x) => JSON.parse(String(x.p[13] ?? "null")) as { response?: { DE?: { CDC?: unknown } } } | null);

      igual("R05-R01-F003-05 clave numérica = RUC: un CDC que la CONTIENE se registra EXACTO (dato y evidencia, sin «[omitido]» ni marca); un CDC IGUAL a la clave se omite (p_cdc NULL)", [b.registros[0]?.p[8], ev[0]?.response?.DE?.CDC, JSON.stringify(ev[0]).includes(ANOMALIA_CDC_CREDENCIAL), b.registros[1]?.p[8], ev[1]?.response?.DE?.CDC], [CDC_CON_RUC, CDC_CON_RUC, false, null, "[omitido]"]);
    }
    {
      limpiarCacheTokens();
      const g = gateway([{ status: "success", nro_lote: "L-R01", cdc: CLAVE }]);
      const r = await enviarDocumentoGateway({ empresaId: EMPRESA, baseUrl: "https://gateway.prueba.invalid", credencialRef: "PRUEBA", timeoutMs: 1000 }, { iTiDE: 1, dEst: "001", dPunExp: "001", dNumDoc: "0000002", dSerieNum: "AA" }, { tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000002", serie: "AA" }, { fetch: g.fetch, env: ENV });
      const e = "sinContrato" in r ? null : r;

      igual("R05-R01-F003-06 envío real: ACK con lote y la clave en «cdc» → ENVIADO por el lote; cdc y cdcInformado NULL (no llegan a la SQL), evidencia «[omitido]» con la marca técnica y sin la clave en ninguna parte del resultado", [e?.estadoLocal, e?.lote, e?.cdc, e?.cdcInformado, e?.respuesta?.cdc, e?.respuesta?.[CLAVE_ANOMALIA_NEXIT], JSON.stringify(e).includes(CLAVE)], ["ENVIADO", "L-R01", null, null, "[omitido]", ANOMALIA_CDC_CREDENCIAL, false]);
    }
    igual("R05-R01-F003-07 resultadoFiscalSinSecretos: una credencial CORTA exacta (< 4 caracteres, fuera del saneamiento de subcadenas) tampoco se repone como CDC; un CDC distinto sí, literal", [
      resultadoFiscalSinSecretos({ cdc: "a1b", respuesta: { cdc: "a1b" } }, ["a1b", TOKEN], CONTRATO_FISCAL_ENVIO).cdc, resultadoFiscalSinSecretos({ cdc: "a1b", respuesta: { cdc: "a1b" } }, ["a1b", TOKEN], CONTRATO_FISCAL_ENVIO).respuesta.cdc,
      resultadoFiscalSinSecretos({ cdc: CDC_ALFA, respuesta: { cdc: CDC_ALFA } }, ["a1b", TOKEN], CONTRATO_FISCAL_ENVIO).cdc,
    ], [null, "[omitido]", CDC_ALFA]);
    igual("R05-R01-F003-08 sinSecretos con contrato: la exención de la ruta del CDC no conserva un JWT aunque no haya secretos «útiles»; fuera de la ruta del CDC (lote) la exención no cambia", [sinSecretos({ respuesta: { response: { DE: { CDC: TOKEN } } } }, [], CONTRATO_FISCAL_CONSULTA).respuesta.response.DE.CDC, sinSecretos({ lote: "L-1" }, [], CONTRATO_FISCAL_ENVIO).lote], ["[omitido]", "L-1"]);
    igual("R05-R01-F003-09 límite de transporte UNIFORME (caracteres, como CDC_TRANSPORTABLE /u y char_length de la SQL): 200 caracteres astrales (400 unidades UTF-16) se conservan literales en el dato y en la evidencia; 257 caracteres no", [cdcInformadoPorApi(ASTRAL_200).valor === ASTRAL_200, resultadoFiscalSinSecretos({ cdc: ASTRAL_200, respuesta: { cdc: ASTRAL_200 } }, [CLAVE], CONTRATO_FISCAL_ENVIO).respuesta.cdc === ASTRAL_200, cdcInformadoPorApi("\u{1F600}".repeat(MAX_CDC + 1)).motivo, cdcInformadoPorApi(CDC_LARGO).motivo], [true, true, "EXCEDE_LIMITE", "EXCEDE_LIMITE"]);
    cierto("R05-R01-F003-10 fuente: cdcEsCredencial no agrega reglas fiscales al CDC (sin 44 dígitos, módulo 11, composición ni CDC_DIVERGENTE) y gateway.ts sigue sin CDC_DIVERGENTE", (() => { const f = tramo(gwSinComentarios, "export function cdcEsCredencial", "export const MAX_CDC"); return f.length > 0 && !/\\d\{44\}|44|modulo|módulo|cdcCoherente|CDC_FORMATO/.test(f) && !/CDC_DIVERGENTE/.test(gwSinComentarios); })());
    cierto("R05-R01-F003-12 (actualizado R05-R02) historial: un «[omitido]» de evidencia con la marca de credencial NO se presenta como CDC informado (CDC_EN_RESPUESTA lo excluye por la marca, no por formato)", /IS DISTINCT FROM '\$\{ANOMALIA_CDC_CREDENCIAL\}'[\s\S]*? THEN i\.respuesta #>> '\{response,DE,CDC\}' END/.test(shared) && /i\.respuesta ->> '\$\{CLAVE_ANOMALIA_NEXIT\}'/.test(shared));
    igual("R05-R01-F003-11 KuDE sin cambios (pertenencia no se debilita): CDC distinto del registrado sigue descartado (null → 502); igual, NO_VERIFICADO", [correspondenciaKude({ tipoDoc: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000002", serie: "AA", cdcRegistrado: CDC_CASA_MINGO }, CDC_ALFA), correspondenciaKude({ tipoDoc: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000002", serie: "AA", cdcRegistrado: CDC_CASA_MINGO }, CDC_CASA_MINGO)], [null, "NO_VERIFICADO"]);
  }

  // ══ M. PRO-342-R05-R02 — residuales de la auditoría R05-R01 (F001-R identidad también antes de atribuir un RECHAZO; F003-R credencial numérica / evidencia / historial) ════════════
  // F002 aprobado: sin cambios. El CDC sigue SIN validarse y no participa en la identidad.
  {
    // ── F001-R: el rechazo (Rechazados propio, status:error o 4xx) solo se atribuye si ningún eco explícito lo contradice ni es no interpretable ──
    const FE_AA = { tipo: "FE", establecimiento: "001", puntoExpedicion: "001", numero: "0000002", serie: "AA" };
    const NCE_AA = { ...FE_AA, tipo: "NCE" };
    const rechazoPropio = (extra: Record<string, unknown> = {}) => ({ status: "error", message: "Rechazado por validación", rechazados: 1, response: { Aceptados: [], Rechazados: [{ "001-001-0000002": { dRucRec: "RUC inválido" } }] }, ...extra });
    const rec = (http: number, cuerpo: unknown, d: DocumentoRecepcion) => { const r = interpretarRecepcion(http, JSON.stringify(cuerpo), [], d); return [r.estadoLocal, r.errorTipo]; };
    const IND = ["ENVIO_INDETERMINADO", null];
    const RECH = ["ERROR_ENVIO", "RECHAZO"];

    igual("R05-R02-F001R-01 FE, HTTP 400 y 200: Rechazados identifica el número propio pero dSerieNum explícito «AB» (≠ «AA») → ENVIO_INDETERMINADO, no se atribuye el rechazo", [rec(400, rechazoPropio({ dSerieNum: "AB" }), FE_AA), rec(200, rechazoPropio({ dSerieNum: "AB" }), FE_AA)], [IND, IND]);
    igual("R05-R02-F001R-02 NCE «AA», HTTP 400 y 200: Rechazados propio con tipoDoc «FE» o con dSerieNum «AB» → ENVIO_INDETERMINADO (el saldo de la NCE no se libera)", [rec(400, rechazoPropio({ tipoDoc: "FE" }), NCE_AA), rec(200, rechazoPropio({ tipoDoc: "FE" }), NCE_AA), rec(400, rechazoPropio({ dSerieNum: "AB" }), NCE_AA), rec(200, rechazoPropio({ dSerieNum: "AB" }), NCE_AA)], [IND, IND, IND, IND]);
    igual("R05-R02-F001R-03 eco explícito NO interpretable junto a un Rechazados propio (dNumDoc numérico, dEst vacío, dSerieNum booleano) → ENVIO_INDETERMINADO (FE y NCE)", [rec(400, rechazoPropio({ dNumDoc: 2 }), FE_AA), rec(200, rechazoPropio({ dEst: "" }), NCE_AA), rec(400, rechazoPropio({ dSerieNum: true }), FE_AA)], [IND, IND, IND]);
    igual("R05-R02-F001R-04 rechazo propio VÁLIDO se sigue atribuyendo: sin ecos, o con ecos coincidentes (serie «AA», tipo «FE»/«NCE»), en FE y NCE, HTTP 400 y 200", [
      rec(400, rechazoPropio(), FE_AA), rec(200, rechazoPropio(), FE_AA), rec(400, rechazoPropio(), NCE_AA), rec(200, rechazoPropio(), NCE_AA),
      rec(400, rechazoPropio({ dEst: "001", dPunExp: "001", dNumDoc: "0000002", dSerieNum: "AA", tipoDoc: "FE" }), FE_AA), rec(200, rechazoPropio({ dSerieNum: "AA", tipoDoc: "nce" }), NCE_AA),
    ], [RECH, RECH, RECH, RECH, RECH, RECH]);
    igual("R05-R02-F001R-05 FE status:error (sin Rechazados) y 4xx genérico: con serie o tipo contradictorio → indeterminado; sin ecos conservan RECHAZO (política FE anterior)", [rec(200, { status: "error", message: "error", dSerieNum: "AB" }, FE_AA), rec(422, { message: "inválido", tipoDoc: "NCE" }, FE_AA), rec(200, { status: "error", message: "error" }, FE_AA), rec(422, { message: "inválido" }, FE_AA)], [IND, IND, RECH, RECH]);
    igual("R05-R02-F001R-06 la clasificación que no depende de la identidad se conserva aunque haya un eco contradictorio: 401/403 → AUTENTICACION, 429 → TRANSITORIO, 5xx → indeterminado, token inválido → AUTENTICACION", [
      rec(401, { message: "no autorizado", dSerieNum: "AB" }, FE_AA), rec(403, { message: "prohibido", dSerieNum: "AB" }, FE_AA), rec(429, { message: "límite", tipoDoc: "NCE" }, FE_AA), rec(500, rechazoPropio({ dSerieNum: "AB" }), FE_AA), rec(400, { status: "error", message: "Token inválido", dSerieNum: "AB" }, FE_AA),
    ], [["ERROR_ENVIO", "AUTENTICACION"], ["ERROR_ENVIO", "AUTENTICACION"], ["ERROR_ENVIO", "TRANSITORIO"], IND, ["ERROR_ENVIO", "AUTENTICACION"]]);
    igual("R05-R02-F001R-07 el CDC no es identidad: un Rechazados propio sin ecos con un CDC de cualquier composición sigue siendo RECHAZO; un CDC «propio» no salva una serie contradictoria", [rec(400, rechazoPropio({ cdc: CDC_ALFA }), FE_AA), rec(400, rechazoPropio({ cdc: CDC_CASA_MINGO, dSerieNum: "AB" }), FE_AA)], [RECH, IND]);
    igual("R05-R02-F001R-08 el mensaje del indeterminado nombra el campo y dice que no se atribuye el rechazo", /campo «dSerieNum»\) distinto del enviado: no se atribuye el rechazo a este documento/.test(interpretarRecepcion(400, JSON.stringify(rechazoPropio({ dSerieNum: "AB" })), [], FE_AA).mensaje ?? ""), true);
    cierto("R05-R02-F001R-09 fuente: en interpretarRecepcion todo ERROR_ENVIO/RECHAZO pasa por rechazo(), que evalúa los ecos calculados ANTES de la primera atribución; los ecos no incluyen el CDC", (() => {
      const f = tramo(gwSinComentarios, "export function interpretarRecepcion", "export async function enviarDocumentoGateway");
      const usos = f.match(/"ERROR_ENVIO", "RECHAZO"/g) ?? [];
      return usos.length === 1 && /const rechazo = \(texto: string\): ResultadoEnvio => \(doc && problema \?/.test(f) && f.indexOf("const problema = ecoIdentidadProblema(ecos)") < f.indexOf("if (esTokenInvalido(http, cuerpoTexto))") && !/ecosIdentidad\(\[raiz\], \{[^}]*cdc/i.test(f);
    })());
  }
  {
    // Envío real (enviarDocumentoGateway, fetch simulado) de una NCE «AA»: HTTP 400 con Rechazados propio y serie de OTRO documento → no se atribuye el rechazo.
    limpiarCacheTokens();
    const cola: Array<{ status: number; cuerpo: unknown }> = [{ status: 400, cuerpo: { status: "error", message: "Rechazado", rechazados: 1, dSerieNum: "AB", response: { Aceptados: [], Rechazados: [{ "001-001-0000002": { campo: "x" } }] } } }];
    const fetch: FetchLike = async (url) => (url.endsWith("/api/login") ? { status: 200, text: async () => JSON.stringify({ status: "success", token: TOKEN }) } : (() => { const s = cola.shift() ?? { status: 200, cuerpo: {} }; return { status: s.status, text: async () => JSON.stringify(s.cuerpo) }; })());
    const r = await enviarDocumentoGateway({ empresaId: EMPRESA, baseUrl: "https://gateway.prueba.invalid", credencialRef: "PRUEBA", timeoutMs: 1000 }, { iTiDE: 5, dEst: "001", dPunExp: "001", dNumDoc: "0000002", dSerieNum: "AA" }, { tipo: "NCE", establecimiento: "001", puntoExpedicion: "001", numero: "0000002", serie: "AA" }, { fetch, env: ENV });

    igual("R05-R02-F001R-10 envío real de NCE: HTTP 400 + Rechazados propio + serie contradictoria → ENVIO_INDETERMINADO sin errorTipo (no RECHAZO: no se libera saldo ni se reemite)", "sinContrato" in r ? "SIN" : [r.estadoLocal, r.errorTipo], ["ENVIO_INDETERMINADO", null]);
  }
  {
    // ── F003-R: credencial NUMÉRICA en la ruta del CDC, evidencia de respuestas inválidas / HTTP de error y presentación en el historial ──
    const CLAVE = ENV.NEXIT_FE_PRUEBA_PASSWORD;
    const ENV_NUM = { NEXIT_FE_PRUEBA_RUC: "80000005", NEXIT_FE_PRUEBA_PASSWORD: "80000005" }; // sintético: clave numérica igual al RUC
    const marcada = (e: unknown) => JSON.stringify(e).includes(`"${CLAVE_ANOMALIA_NEXIT}":"${ANOMALIA_CDC_CREDENCIAL}"`);
    const consultaSaneada = (http: number, cuerpo: unknown, secretos: string[], doc: Doc = CASA_MINGO) => resultadoFiscalSinSecretos(interpretarConsulta(http, JSON.stringify(cuerpo), doc), secretos, CONTRATO_FISCAL_CONSULTA);
    const deCdc = (r: { respuesta: Record<string, unknown> | null }) => ((r.respuesta?.response as { DE?: { CDC?: unknown } } | undefined)?.DE?.CDC);

    {
      reiniciarNex080ParaCasos();
      limpiarCacheTokens();
      const b = base({ cdc: null, estadoSifen: "PENDIENTE" });
      const g = gateway([respuestaConsulta("Aprobado", 80000005), respuestaConsulta("Aprobado", 1800000050)]);

      for (let i = 0; i < 2; i++) await consultarEstado(b.db, EMPRESA, USUARIO, DOC, { fetch: g.fetch, env: ENV_NUM });
      const ev = b.registros.map((x) => String(x.p[13] ?? ""));
      const de = ev.map((e) => (JSON.parse(e || "null") as { response?: { DE?: { CDC?: unknown } } } | null)?.response?.DE?.CDC);

      igual("R05-R02-F003R-01 consulta real, clave numérica «80000005»: DE.CDC NUMÉRICO 80000005 → la evidencia lo lleva «[omitido]» con la marca técnica y sin la clave; el dato operacional sigue NULL (un número no se convierte en CDC) y el estado se registra", [b.registros[0]?.p[3], b.registros[0]?.p[7], b.registros[0]?.p[8], de[0], marcada(JSON.parse(ev[0] || "null")), /80000005/.test(ev[0] ?? "")], ["OK", "APROBADO", null, "[omitido]", true, false]);
      igual("R05-R02-F003R-02 un CDC numérico que solo CONTIENE la clave numérica (1800000050) se conserva en la evidencia y no se marca (no es regla fiscal; sigue sin proyectarse)", [b.registros[1]?.p[8], de[1], marcada(JSON.parse(ev[1] || "null"))], [null, 1800000050, false]);
    }
    igual("R05-R02-F003R-03 respuesta INVÁLIDA por eco contradictorio con la clave en DE.CDC: resultado RESPUESTA_INVALIDA, CDC null, evidencia «[omitido]» y MARCADA (antes la marca dependía del CDC operacional)", (() => { const r = consultaSaneada(200, respuestaConsulta("Aprobado", CLAVE, { dSerieNum: "AB" }), [CLAVE, TOKEN]); return [r.resultado, r.cdc, deCdc(r), marcada(r.respuesta), JSON.stringify(r).includes(CLAVE)]; })(), ["RESPUESTA_INVALIDA", null, "[omitido]", true, false]);
    igual("R05-R02-F003R-04 HTTP de error (500) cuyo cuerpo trae la clave numérica como DE.CDC (texto y número): evidencia «[omitido]», marcada, sin la clave", [80000005, "80000005"].map((v) => { const r = consultaSaneada(500, respuestaConsulta("Aprobado", v), ["80000005", TOKEN]); return [r.resultado, deCdc(r), marcada(r.respuesta), JSON.stringify(r.respuesta).includes("80000005")]; }), [["ERROR_HTTP", "[omitido]", true, false], ["ERROR_HTTP", "[omitido]", true, false]]);
    igual("R05-R02-F003R-05 credencial CORTA exacta (< 4 caracteres) en DE.CDC de una respuesta inválida: omitida y marcada", (() => { const r = consultaSaneada(200, respuestaConsulta("Aprobado", "a1b", { dNumDoc: "0000009" }), ["a1b", TOKEN]); return [r.resultado, deCdc(r), marcada(r.respuesta)]; })(), ["RESPUESTA_INVALIDA", "[omitido]", true]);
    igual("R05-R02-F003R-06 «Bearer <token>» en DE.CDC de una respuesta inválida (ya omitido por el saneamiento previo de la evidencia): la evidencia queda marcada y sin el token", (() => { const r = consultaSaneada(200, respuestaConsulta("Aprobado", `Bearer ${TOKEN}`, { tipoDoc: "NCE" }), [CLAVE, TOKEN]); return [r.resultado, marcada(r.respuesta), JSON.stringify(r).includes(TOKEN)]; })(), ["RESPUESTA_INVALIDA", true, false]);
    igual("R05-R02-F003R-07 envío: ACK con lote y CDC NUMÉRICO igual a la clave numérica → ENVIADO por el lote, cdcInformado NULL, evidencia «[omitido]» marcada, sin la clave", (() => {
      const r = resultadoFiscalSinSecretos(interpretarRecepcion(200, JSON.stringify({ status: "success", nro_lote: "L-R02", cdc: 80000005 }), [], CASA_MINGO), ["80000005", TOKEN], CONTRATO_FISCAL_ENVIO);
      return [r.estadoLocal, r.lote, r.cdcInformado, r.respuesta?.cdc, marcada(r.respuesta), JSON.stringify(r.respuesta).includes("80000005")];
    })(), ["ENVIADO", "L-R02", null, "[omitido]", true, false]);
    igual("R05-R02-F003R-08 regresión: un CDC de TEXTO legítimo que contiene la clave numérica / RUC sigue literal en el dato y en la evidencia, sin marca; un CDC alfanumérico tampoco se marca", [
      (() => { const r = consultaSaneada(200, respuestaConsulta("Aprobado", "0180000005" + "6".repeat(34)), ["80000005", TOKEN]); return [r.cdc, deCdc(r), marcada(r.respuesta)]; })(),
      (() => { const r = consultaSaneada(200, respuestaConsulta("Aprobado", CDC_ALFA), [CLAVE, TOKEN]); return [r.cdc, marcada(r.respuesta)]; })(),
    ], [["0180000005" + "6".repeat(34), "0180000005" + "6".repeat(34), false], [CDC_ALFA, false]]);
    igual("R05-R02-F003R-09 sinSecretos (API pública) no cambia de forma: devuelve solo el valor saneado (la marca es interna de resultadoFiscalSinSecretos)", sinSecretos({ respuesta: { response: { DE: { CDC: 80000005 } } } }, ["80000005"], CONTRATO_FISCAL_CONSULTA), { respuesta: { response: { DE: { CDC: "[omitido]" } } } });
    cierto("R05-R02-F003R-10 historial: CDC_EN_RESPUESTA no presenta como CDC informado un valor marcado NI uno que contenga el marcador «[omitido]» de NEXIT (también evidencias anteriores sin marca); sin regla de forma del CDC", /IS DISTINCT FROM '\$\{ANOMALIA_CDC_CREDENCIAL\}'\s*AND strpos\(i\.respuesta #>> '\{response,DE,CDC\}', '\[omitido\]'\) = 0 THEN i\.respuesta #>> '\{response,DE,CDC\}' END/.test(shared) && !/\\d\{44\}|\[0-9\]\{44\}/.test(sinComentariosTs(shared)));
    cierto("R05-R02-F003R-11 fuente: la rama NUMÉRICA de la ruta del CDC usa cdcEsCredencial y la marca se decide también desde la evidencia (credencialEnCdc)", /if \(!\(esRutaCdc\(ruta, contrato\) && cdcEsCredencial\(texto, credenciales\)\)\) return valor;/.test(gw) && /const conCredencial = credencialEnCdc \|\|/.test(gw));
  }

  return fallos;
}
