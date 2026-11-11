/**
 * PRO-338-R03 — CDC INMUTABLE: el saneamiento de secretos nunca modifica el CDC informado por la API (consulta y envío). Casos sobre las funciones REALES
 * (consultarDocumentoGateway, enviarDocumentoGateway, consultarEstado → decidirConsulta → parámetros de la función SQL, sinSecretos, alertaConsulta) con `fetch`, entorno y base SIMULADOS.
 * Sin red, sin PostgreSQL y sin credenciales reales. ESCRITOS, NO EJECUTADOS en esta entrega (órdenes PRO-338-R03 y R04). No prueban el gateway ni la SQL reales.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { ETIQUETA_RESULTADO_INTENTO } from "@/lib/facturacion/estados";
import {
  cdcCoherente, consultarDocumentoGateway, enviarDocumentoGateway, esIdentificadorFiscal, limpiarCacheTokens, sinSecretos, type FetchLike, type ResultadoConsulta, type ResultadoEnvio,
} from "@/lib/facturacion/gateway";
import { alertaConsulta, presentacionSifen } from "@/lib/facturacion/presentacion-sifen";
import { consultarEstado } from "@/lib/facturacion/shared";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const USUARIO = "99999999-9999-4999-8999-999999999999";
const DOC = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const RUC = "80000005";
/** Caso del incidente: la clave de la API ES el RUC del emisor, que aparece en las posiciones 3–10 de todo CDC de la empresa. */
const CLAVE_RUC = RUC;
/** Clave sin relación con el CDC (regresión). */
const CLAVE_ALFA = "clave-sintetica-no-real";
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJyMDMifQ.firma-sintetica-r03";
const CONFIG = { empresaId: EMPRESA, baseUrl: "https://gateway.prueba.invalid", credencialRef: "PRUEBA", timeoutMs: 1000 };
const env = (password: string) => ({ NEXIT_FE_PRUEBA_RUC: RUC, NEXIT_FE_PRUEBA_PASSWORD: password });
const FE = { tipo: "FE", establecimiento: "001", puntoExpedicion: "003", numero: "0009020" };
const cdc = (numero: string, seguridad = "123456789") => "01" + RUC + "6" + "001" + "003" + numero + "1" + "20261110" + "1" + seguridad + "0";
const CDC_FE = cdc("0009020");
const CDC_FE_OTRO_CODIGO = cdc("0009020", "987654321");
const CDC_OTRA_FE = cdc("0009021");

function gateway(respuestas: Array<{ status: number; cuerpo: unknown }>) {
  const cola = [...respuestas];
  const cuerpos: Array<Record<string, unknown>> = [];
  const fetchSim: FetchLike = async (url, init) => {
    cuerpos.push(JSON.parse(init.body) as Record<string, unknown>);
    if (url.endsWith("/api/login")) return { status: 200, text: async () => JSON.stringify({ status: "success", token: TOKEN }) };

    const r = cola.shift() ?? { status: 500, cuerpo: {} };

    return { status: r.status, text: async () => JSON.stringify(r.cuerpo) };
  };

  return { fetch: fetchSim, cuerpos };
}

const consultaRespuesta = (estado: string, cdcDe: string | null, cod: string | null, mensaje: string | null, extra: Record<string, unknown> = {}) => ({
  status: "success",
  response: { Estado: estado, FechaRegistro: "2026-11-10 14:06:41", DE: { ...(cdcDe === null ? {} : { CDC: cdcDe }), FechaFirma: "2026-11-10 14:00:00", FechaEnvio: "2026-11-10 14:00:30", Retorno: { CodRespuesta: cod, Mensaje: mensaje } }, ...extra },
});

export async function verificarCasosCdcInmutableR03(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const consultar = async (password: string, cuerpo: unknown, status = 200) => {
    limpiarCacheTokens();
    const g = gateway([{ status, cuerpo }]);

    return { r: (await consultarDocumentoGateway(CONFIG, { ...FE, serie: null }, { fetch: g.fetch, env: env(password) })) as ResultadoConsulta, g };
  };

  cierto("R03-00 premisa: el CDC del caso es estructuralmente coherente con FE 001-003-0009020 y CONTIENE la clave (RUC) como subcadena", CDC_FE.length === 44 && cdcCoherente(FE, CDC_FE) && CDC_FE.includes(CLAVE_RUC));

  // ── Consulta: clave = RUC contenido en el CDC (incidente 001-003-0009018..21)
  {
    const { r, g } = await consultar(CLAVE_RUC, consultaRespuesta("Rechazado", CDC_FE, "1101", "Número de timbrado inválido"));
    const de = ((r.respuesta as { response: { DE: { CDC: unknown } } }).response.DE);

    igual("R03-01 consulta con clave = RUC: el CDC operacional llega EXACTO (44 dígitos, sin «[omitido]»)", [r.resultado, r.cdc, r.cdc?.includes("[omitido]")], ["OK", CDC_FE, false]);
    igual("R03-02 consulta con clave = RUC: response.DE.CDC de la evidencia guardada también queda EXACTO", de.CDC, CDC_FE);
    igual("R03-03 Rechazado/1101/«Número de timbrado inválido» se interpreta intacto (estado, código y mensaje)", [r.estadoGateway, r.estadoSifen, r.codRespuesta, r.mensaje], ["Rechazado", "RECHAZADO", "1101", "Número de timbrado inválido"]);
    igual("R03-04 la consulta NO envía CDC: solo {dEst,dPunExp,dNumDoc,dSerieNum,tipoDoc}", Object.keys(g.cuerpos[1] ?? {}).sort(), ["dEst", "dNumDoc", "dPunExp", "dSerieNum", "tipoDoc"]);
  }

  // ── Consulta: secretos en textos libres siguen omitidos, CDC intacto
  {
    const { r } = await consultar(CLAVE_RUC, consultaRespuesta("Rechazado", CDC_FE, "1101", `Número de timbrado inválido (usuario ${RUC})`, { Nota: `token ${TOKEN}`, Eco: Number(RUC) }));
    const guardado = JSON.stringify(r.respuesta);

    igual("R03-05 la clave repetida en el mensaje libre se omite; el CDC operacional no cambia", [r.mensaje, r.cdc], ["Número de timbrado inválido (usuario [omitido])", CDC_FE]);
    cierto("R03-06 la evidencia no contiene el token; un número que contiene la clave se omite; el CDC sigue íntegro en DE.CDC", !guardado.includes(TOKEN) && /"Eco":"\[omitido\]"/.test(guardado) && guardado.includes(`"CDC":"${CDC_FE}"`));
  }

  // ── Consulta: regresión con clave sin relación con el CDC
  {
    const a = (await consultar(CLAVE_ALFA, consultaRespuesta("Rechazado", CDC_FE, "1101", "Número de timbrado inválido"))).r;
    const b = (await consultar(CLAVE_RUC, consultaRespuesta("Rechazado", CDC_FE, "1101", "Número de timbrado inválido"))).r;

    igual("R03-07 mismo resultado operacional con clave alfanumérica y con clave = RUC", [a.resultado, a.estadoSifen, a.cdc, a.codRespuesta, a.mensaje], [b.resultado, b.estadoSifen, b.cdc, b.codRespuesta, b.mensaje]);
  }

  // ── consultarEstado (real) → decidirConsulta → parámetros de la función SQL, con base simulada
  const registrar = async (fila: Record<string, unknown>, password: string, cuerpo: unknown) => {
    limpiarCacheTokens();
    const params: unknown[][] = [];
    const db = {
      async query(sql: string, p: unknown[] = []) {
        if (/FROM fe_gateway_config/.test(sql)) return { rows: [{ baseUrl: CONFIG.baseUrl, credencialRef: "PRUEBA", timeoutMs: 1000 }] };
        if (/fe_documento_registrar_consulta/.test(sql)) { params.push(p); return { rows: [{ resultado: p[3] }] }; }

        return { rows: [{ id: DOC, ...FE, serie: null, cdc: null, estadoSifen: "SIN_CONSULTA", ...fila }] };
      },
    };
    const g = gateway([{ status: 200, cuerpo }]);

    await consultarEstado(db as never, EMPRESA, USUARIO, DOC, { fetch: g.fetch, env: env(password) });

    return params[0] ?? [];
  };

  {
    const p = await registrar({}, CLAVE_RUC, consultaRespuesta("Rechazado", CDC_FE, "1101", "Número de timbrado inválido"));

    igual("R03-08 primera consulta (d.cdc NULL) + clave = RUC: a la SQL llegan OK, RECHAZADO, el CDC EXACTO, 1101 y el mensaje (no hay falso CDC_DIVERGENTE en la aplicación)", [p[3], p[7], p[8], p[9], p[10]], ["OK", "RECHAZADO", CDC_FE, "1101", "Número de timbrado inválido"]);
    cierto("R03-09 con ese p_cdc coherente y d.cdc NULL, la condición SQL de divergencia es falsa (fe_cdc_coherente equivalente) y el CDC se registra por coalesce(d.cdc, p_cdc)", cdcCoherente(FE, String(p[8])) && /cdc = coalesce\(d\.cdc, p_cdc\)/.test(leer("documentacao/banco/nexit/v1/migraciones/NEX-054-facturacion-consulta-estado-final.sql")));
  }
  {
    const p = await registrar({}, CLAVE_RUC, consultaRespuesta("Aprobado", CDC_FE, "0260", "Aprobado"));

    igual("R03-10 primera consulta Aprobado con CDC coherente → OK/APROBADO con el CDC exacto", [p[3], p[7], p[8]], ["OK", "APROBADO", CDC_FE]);
  }
  {
    const p = await registrar({}, CLAVE_RUC, consultaRespuesta("Rechazado", CDC_OTRA_FE, "1101", "Número de timbrado inválido"));

    igual("R03-11 CDC de OTRA FE (0009021): se entrega a la SQL tal cual (para anotarlo CDC_DIVERGENTE), sin corregirlo ni sustituirlo", [p[3], p[8], cdcCoherente(FE, String(p[8]))], ["OK", CDC_OTRA_FE, false]);
  }
  {
    const p = await registrar({ cdc: CDC_FE, estadoSifen: "PENDIENTE" }, CLAVE_RUC, consultaRespuesta("Rechazado", CDC_FE_OTRO_CODIGO, "1101", "Número de timbrado inválido"));
    const sql = leer("documentacao/banco/nexit/v1/migraciones/NEX-054-facturacion-consulta-estado-final.sql");

    igual("R03-12 CDC previo registrado y la API informa OTRO: el informado llega íntegro a la SQL", p[8], CDC_FE_OTRO_CODIGO);
    cierto("R03-13 la SQL lo anota CDC_DIVERGENTE (p_cdc <> d.cdc) y nunca sobrescribe el registrado (coalesce(d.cdc, p_cdc) solo con resultado OK)", /\(d\.cdc IS NOT NULL AND p_cdc <> d\.cdc\)/.test(sql) && /IF v_resultado = 'OK' THEN\s+UPDATE/.test(sql) && /cdc = coalesce\(d\.cdc, p_cdc\)/.test(sql));
  }
  {
    const p = await registrar({}, CLAVE_RUC, consultaRespuesta("Rechazado", null, "1101", "Número de timbrado inválido"));

    igual("R03-14 Rechazado SIN CDC y sin CDC previo: RESPUESTA_INVALIDA, sin estado fiscal y sin inventar CDC", [p[3], p[7], p[8]], ["RESPUESTA_INVALIDA", null, null]);
  }
  {
    const p = await registrar({}, CLAVE_RUC, consultaRespuesta("Rechazado", "0180000005600100300090201", "1101", "Número de timbrado inválido"));

    igual("R03-15 CDC inválido (no 44 dígitos): no se completa ni corrige; queda null y la respuesta no fija estado", [p[3], p[8]], ["RESPUESTA_INVALIDA", null]);
  }

  // ── Envío (recepcion_de): clave = RUC contenido en el CDC informado
  {
    limpiarCacheTokens();
    const g = gateway([{ status: 200, cuerpo: { status: "success", message: `Lote recibido para ${RUC}`, nro_lote: "L-901", CDC: CDC_FE, dEst: "001", dPunExp: "003", dNumDoc: "0009020" } }]);
    const r = (await enviarDocumentoGateway(CONFIG, { dEst: "001" }, FE, { fetch: g.fetch, env: env(CLAVE_RUC) })) as ResultadoEnvio;
    const guardado = r.respuesta as Record<string, unknown>;

    igual("R03-16 envío con clave = RUC: cdc y cdcInformado EXACTOS, lote intacto, recepción ENVIADO", [r.estadoLocal, r.cdc, r.cdcInformado, r.lote], ["ENVIADO", CDC_FE, CDC_FE, "L-901"]);
    igual("R03-17 envío: CDC y eco dEst/dPunExp/dNumDoc de la evidencia intactos; la clave en el mensaje libre se omite", [guardado.CDC, guardado.dEst, guardado.dPunExp, guardado.dNumDoc, r.mensaje], [CDC_FE, "001", "003", "0009020", "Lote recibido para [omitido]"]);
    cierto("R03-18 envío: ni el token ni Bearer quedan en el resultado (fases, mensajes, evidencia)", !JSON.stringify(r).includes(TOKEN) && !/Bearer\s+eyJ/.test(JSON.stringify(r)));
  }
  {
    limpiarCacheTokens();
    const g = gateway([{ status: 200, cuerpo: { status: "error", rechazados: 1, response: { Aceptados: [], Rechazados: [{ "001-003-0009020": { dNumTim: `Timbrado inválido (${RUC})` } }] } } }]);
    const r = (await enviarDocumentoGateway(CONFIG, { dEst: "001" }, FE, { fetch: g.fetch, env: env(CLAVE_RUC) })) as ResultadoEnvio;
    const rechazados = ((r.respuesta as { response: { Rechazados: Array<Record<string, unknown>> } }).response.Rechazados);

    igual("R03-19 envío rechazado: la clave «EEE-PPP-NNNNNNN» del documento se conserva y el rechazo se atribuye a ESTE documento", [r.estadoLocal, r.errorTipo, Object.keys(rechazados[0] ?? {})], ["ERROR_ENVIO", "RECHAZO", ["001-003-0009020"]]);
    cierto("R03-20 envío rechazado: la clave repetida en el texto del error se omite", r.errores.every((e) => !e.includes(RUC)) && r.errores.some((e) => e.includes("[omitido]")));
  }

  // ── sinSecretos (función real) — contrato por campo
  {
    const original = { cdc: CDC_FE, cdcInformado: CDC_FE, lote: "L-1", codRespuesta: "1101", mensaje: `x ${RUC} y`, respuesta: { DE: { CDC: CDC_FE }, dNumDoc: "0009020", texto: `clave ${RUC}`, lista: [`a ${RUC}`, CDC_FE] }, http: 200 };
    const copia = JSON.parse(JSON.stringify(original)) as typeof original;
    const s = sinSecretos(original, [CLAVE_RUC, TOKEN, "ab"]);

    // PRO-338-R04: un elemento de lista NO es campo fiscal: aunque tenga forma de CDC, se sanea (antes R03 lo conservaba por su forma: R03-F001).
    igual("R03-21 sinSecretos: CDC en sus CAMPOS (cdc, cdcInformado, DE.CDC), dNumDoc, lote y código se conservan; textos libres y elementos de listas omiten la clave", [s.cdc, s.cdcInformado, s.lote, s.codRespuesta, s.mensaje, s.respuesta.DE.CDC, s.respuesta.dNumDoc, s.respuesta.texto, s.respuesta.lista, s.http], [CDC_FE, CDC_FE, "L-1", "1101", "x [omitido] y", CDC_FE, "0009020", "clave [omitido]", ["a [omitido]", CDC_FE.split(RUC).join("[omitido]")], 200]);
    igual("R03-22 sinSecretos no muta el objeto recibido (devuelve copia)", original, copia);
    igual("R03-23 esIdentificadorFiscal (R04): CDC solo en su campo; sin campo o en texto libre NO; dNumDoc solo con su formato exacto", [esIdentificadorFiscal(null, CDC_FE), esIdentificadorFiscal("CDC", CDC_FE), esIdentificadorFiscal("Mensaje", CDC_FE), esIdentificadorFiscal("dNumDoc", "0009020"), esIdentificadorFiscal("dNumDoc", `n ${RUC}`), esIdentificadorFiscal("Mensaje", RUC)], [false, true, false, true, false, false]);
    igual("R03-24 sinSecretos conserva el contrato anterior para textos (T-E2-15)", sinSecretos({ m: `la clave es ${CLAVE_ALFA}`, n: [CLAVE_ALFA] }, [CLAVE_ALFA, "ab"]), { m: "la clave es [omitido]", n: ["[omitido]"] });
  }

  // ── Fuente: consulta y envío usan el resultado fiscal íntegro; ya no hay reemplazo sobre el JSON serializado
  {
    const gw = leer("lib/facturacion/gateway.ts");

    cierto("R03-25 consulta y envío devuelven resultadoFiscalSinSecretos (2 usos) y sinSecretos ya no reemplaza sobre JSON.stringify", (gw.match(/return resultadoFiscalSinSecretos\(/g) ?? []).length === 2 && !/texto\.split\(JSON\.stringify\(s\)/.test(gw));
  }

  // ── Pantalla: alerta de CDC_DIVERGENTE según exista o no CDC registrado
  {
    const sinCdc = alertaConsulta({ ultimaConsultaResultado: "CDC_DIVERGENTE", cdc: null });
    const conCdc = alertaConsulta({ ultimaConsultaResultado: "CDC_DIVERGENTE", cdc: CDC_FE });

    igual("R03-26 sin CDC registrado: NO dice «distinto del registrado»; dice que no corresponde a la identidad fiscal", [sinCdc?.tipo, sinCdc?.texto, /registrado/.test(sinCdc?.texto ?? "")], ["inconsistencia", "Inconsistencia de consulta: el CDC informado no corresponde a la identidad fiscal del documento", false]);
    igual("R03-27 con CDC registrado: «distinto del previamente registrado» y el registrado se conserva", [conCdc?.tipo, conCdc?.texto, /se conserva/.test(conCdc?.detalle ?? "")], ["inconsistencia", "Inconsistencia de consulta: CDC distinto del previamente registrado", true]);
    igual("R03-28 rótulo del intento en el historial: neutro, sin afirmar CDC previo", ETIQUETA_RESULTADO_INTENTO.CDC_DIVERGENTE, "CDC informado inconsistente con el documento");
    igual("R03-29 la alerta no altera el badge fiscal: sin final sigue «Pendiente»; RECHAZADO confirmado sigue «Rechazado»", [presentacionSifen({ estadoLocal: "ENVIADO", estadoSifen: "SIN_CONSULTA" }).texto, presentacionSifen({ estadoLocal: "ENVIADO", estadoSifen: "RECHAZADO" }).texto], ["Pendiente de confirmación", "Rechazado"]);
    cierto("R03-30 la pantalla pasa el documento (con su cdc) a alertaConsulta", /alertaConsulta\(d\)/.test(leer("app/(private)/documentos/page.tsx")));
  }

  await casosR04(igual, cierto, consultar, registrar);

  return fallos;
}

// ── PRO-338-R04 (R03-F001): la excepción del saneamiento depende del CAMPO fiscal, nunca de la forma del valor ──────────────────────────────────────────────
// Funciones REALES (consultarDocumentoGateway, enviarDocumentoGateway → interpretarConsulta/interpretarRecepcion, consultarEstado → parámetros SQL, sinSecretos) con fetch, entorno
// y base SIMULADOS y credenciales SINTÉTICAS. ESCRITOS, NO EJECUTADOS. No prueban el gateway ni la SQL reales ni los logs del servidor en ejecución.
/** Clave de API sintética de EXACTAMENTE 44 dígitos (no aparece en ningún CDC del caso). */
const CLAVE_44 = "5820193746".repeat(4) + "1357";
/** Texto LIBRE de 44 dígitos (forma de CDC: el de otra FE) que CONTIENE la clave corta = RUC. */
const LIBRE_44_CON_RUC = CDC_OTRA_FE;
const sinRuc = (t: string) => t.split(RUC).join("[omitido]");

type Igual = (nombre: string, obtenido: unknown, esperado: unknown) => void;
type Cierto = (nombre: string, c: boolean) => void;
type Consultar = (password: string, cuerpo: unknown, status?: number) => Promise<{ r: ResultadoConsulta }>;
type Registrar = (fila: Record<string, unknown>, password: string, cuerpo: unknown) => Promise<unknown[]>;

async function casosR04(igual: Igual, cierto: Cierto, consultar: Consultar, registrar: Registrar) {
  cierto("R04-00 premisas: clave de 44 dígitos ajena a los CDC del caso; el texto libre de 44 dígitos contiene el RUC", /^\d{44}$/.test(CLAVE_44) && !CDC_FE.includes(CLAVE_44) && /^\d{44}$/.test(LIBRE_44_CON_RUC) && LIBRE_44_CON_RUC.includes(RUC));

  // ── Consulta: «Mensaje» de 44 dígitos con la clave corta (RUC) dentro
  {
    const { r } = await consultar(CLAVE_RUC, consultaRespuesta("Rechazado", CDC_FE, "1101", LIBRE_44_CON_RUC, { Nota: LIBRE_44_CON_RUC }));
    const de = (r.respuesta as { response: { DE: { CDC: unknown; Retorno: { Mensaje: unknown } }; Nota: unknown } }).response;

    igual("R04-01 consulta, clave = RUC: el mensaje libre de 44 dígitos NO se trata como CDC y oculta la clave; el CDC operacional sigue EXACTO", [r.mensaje, r.mensaje?.includes(RUC), r.cdc], [sinRuc(LIBRE_44_CON_RUC), false, CDC_FE]);
    igual("R04-02 consulta: en la evidencia, response.DE.CDC queda EXACTO y DE.Retorno.Mensaje / Nota (44 dígitos) se sanean", [de.DE.CDC, de.DE.Retorno.Mensaje, de.Nota], [CDC_FE, sinRuc(LIBRE_44_CON_RUC), sinRuc(LIBRE_44_CON_RUC)]);
  }

  // ── Consulta: clave de API de 44 dígitos repetida en campos libres
  {
    const { r } = await consultar(CLAVE_44, consultaRespuesta("Rechazado", CDC_FE, "1101", CLAVE_44, { Nota: CLAVE_44, errores: [CLAVE_44, `detalle ${CLAVE_44}`] }));
    const guardado = JSON.stringify(r.respuesta);

    igual("R04-03 consulta, clave de 44 dígitos: el mensaje que ES la clave queda «[omitido]»; CDC, estado y código intactos", [r.mensaje, r.cdc, r.estadoSifen, r.codRespuesta], ["[omitido]", CDC_FE, "RECHAZADO", "1101"]);
    cierto("R04-04 consulta: la clave de 44 dígitos no aparece en ninguna parte del resultado (Nota, lista de errores, Retorno.Mensaje)", !JSON.stringify(r).includes(CLAVE_44) && !guardado.includes(CLAVE_44) && guardado.includes(`"CDC":"${CDC_FE}"`));
  }

  // ── consultarEstado (real) → parámetros de la función SQL: CDC exacto, mensaje y evidencia saneados
  {
    const p = await registrar({}, CLAVE_RUC, consultaRespuesta("Rechazado", CDC_FE, "1101", LIBRE_44_CON_RUC, { Nota: LIBRE_44_CON_RUC }));

    igual("R04-05 primera consulta (d.cdc NULL): a la SQL llegan OK/RECHAZADO y el CDC EXACTO; p_mensaje (44 dígitos) sin la clave", [p[3], p[7], p[8], p[10]], ["OK", "RECHAZADO", CDC_FE, sinRuc(LIBRE_44_CON_RUC)]);
    cierto("R04-06 la evidencia JSON enviada a la SQL conserva DE.CDC exacto y no contiene el texto libre de 44 dígitos con la clave", String(p[13]).includes(`"CDC":"${CDC_FE}"`) && !String(p[13]).includes(LIBRE_44_CON_RUC));
  }
  {
    const p = await registrar({ cdc: CDC_FE, estadoSifen: "PENDIENTE" }, CLAVE_44, consultaRespuesta("Rechazado", CDC_FE_OTRO_CODIGO, "1101", CLAVE_44));

    igual("R04-07 CDC previo y la API informa OTRO: llega íntegro a la SQL (que no sobrescribe) y la clave de 44 dígitos del mensaje no llega", [p[8], p[10], String(p[13]).includes(CLAVE_44)], [CDC_FE_OTRO_CODIGO, "[omitido]", false]);
  }

  // ── Envío: CDC auténtico en su campo + aviso libre numérico de 44 dígitos con la clave
  {
    limpiarCacheTokens();
    const g = gateway([{ status: 200, cuerpo: { status: "success", message: LIBRE_44_CON_RUC, nro_lote: "L-902", CDC: CDC_FE, dEst: "001", dPunExp: "003", dNumDoc: "0009020", errores: [LIBRE_44_CON_RUC], aviso: LIBRE_44_CON_RUC } }]);
    const r = (await enviarDocumentoGateway(CONFIG, { dEst: "001" }, FE, { fetch: g.fetch, env: env(CLAVE_RUC) })) as ResultadoEnvio;
    const guardado = r.respuesta as Record<string, unknown>;

    igual("R04-08 envío, clave = RUC: cdc / cdcInformado EXACTOS, lote intacto, ENVIADO; el mensaje libre de 44 dígitos oculta la clave", [r.estadoLocal, r.cdc, r.cdcInformado, r.lote, r.mensaje], ["ENVIADO", CDC_FE, CDC_FE, "L-902", sinRuc(LIBRE_44_CON_RUC)]);
    igual("R04-09 envío: en la evidencia el CDC queda exacto y message / aviso / errores (44 dígitos) se sanean", [guardado.CDC, guardado.message, guardado.aviso, guardado.errores], [CDC_FE, sinRuc(LIBRE_44_CON_RUC), sinRuc(LIBRE_44_CON_RUC), [sinRuc(LIBRE_44_CON_RUC)]]);
    cierto("R04-10 envío: ni errores ni fases ni el token contienen la clave/token", r.errores.every((e) => !e.includes(RUC)) && !JSON.stringify(r.fases).includes(RUC) && !JSON.stringify(r).includes(TOKEN));
  }
  {
    limpiarCacheTokens();
    const g = gateway([{ status: 200, cuerpo: { status: "error", rechazados: 1, message: CLAVE_44, response: { Aceptados: [], Rechazados: [{ "001-003-0009020": { dNumTim: CLAVE_44 } }] } } }]);
    const r = (await enviarDocumentoGateway(CONFIG, { dEst: "001" }, FE, { fetch: g.fetch, env: env(CLAVE_44) })) as ResultadoEnvio;
    const rechazados = ((r.respuesta as { response: { Rechazados: Array<Record<string, unknown>> } }).response.Rechazados);

    igual("R04-11 envío rechazado, clave de 44 dígitos: se conserva «001-003-0009020» en Rechazados y el rechazo se atribuye a ESTE documento", [r.estadoLocal, r.errorTipo, Object.keys(rechazados[0] ?? {})], ["ERROR_ENVIO", "RECHAZO", ["001-003-0009020"]]);
    cierto("R04-12 envío rechazado: la clave de 44 dígitos no aparece en mensaje, errores ni evidencia", r.mensaje === "[omitido]" && !JSON.stringify(r).includes(CLAVE_44) && r.errores.some((e) => e.includes("001-003-0009020")));
  }

  // ── sinSecretos (función real): procedencia por campo / estructura
  {
    const original = {
      cdc: CDC_FE, cdcInformado: CDC_FE, mensaje: CLAVE_44, errores: [CLAVE_44, LIBRE_44_CON_RUC], fases: [{ fase: "RESPUESTA", ok: true, detalle: LIBRE_44_CON_RUC }],
      respuesta: { response: { DE: { CDC: CDC_FE, Retorno: { Mensaje: LIBRE_44_CON_RUC } }, Rechazados: [{ "001-003-0009020": { campo: "x" } }], Otro: { "001-003-0009020": "y" } } },
    };
    const copia = JSON.parse(JSON.stringify(original)) as typeof original;
    const s = sinSecretos(original, [CLAVE_44, CLAVE_RUC]);

    igual("R04-13 sinSecretos: cdc, cdcInformado y response.DE.CDC (campos fiscales) EXACTOS aunque contengan la clave (RUC)", [s.cdc, s.cdcInformado, s.respuesta.response.DE.CDC], [CDC_FE, CDC_FE, CDC_FE]);
    igual("R04-14 sinSecretos: mensaje, errores, fases y Retorno.Mensaje de 44 dígitos se sanean (clave de 44 y clave corta)", [s.mensaje, s.errores, s.fases[0]?.detalle, s.respuesta.response.DE.Retorno.Mensaje], ["[omitido]", ["[omitido]", sinRuc(LIBRE_44_CON_RUC)], sinRuc(LIBRE_44_CON_RUC), sinRuc(LIBRE_44_CON_RUC)]);
    const secretoNumero = "0009020";
    const t = sinSecretos(original, [secretoNumero]);

    igual("R04-15 sinSecretos: la clave «EEE-PPP-NNNNNNN» solo se conserva dentro de Rechazados/Aceptados; fuera de esas listas se sanea; el CDC del campo sigue EXACTO", [Object.keys(t.respuesta.response.Rechazados[0] ?? {}), Object.keys(t.respuesta.response.Otro), t.cdc], [["001-003-0009020"], ["001-003-[omitido]"], CDC_FE]);
    igual("R04-16 sinSecretos no muta el objeto recibido", original, copia);
  }

  // ── Fuente: no queda ninguna exención por la sola forma de 44 dígitos
  {
    const gw = leer("lib/facturacion/gateway.ts");
    const funcion = gw.slice(gw.indexOf("export function esIdentificadorFiscal"), gw.indexOf("const omitirEn"));

    cierto("R04-17 esIdentificadorFiscal ya no exime un valor por su forma (sin «CDC_FORMATO.test(valor)) return true»; clave null → false)", !/CDC_FORMATO\.test\(valor\)\)\s*return true/.test(funcion) && /if \(clave === null\) return false;/.test(funcion));
  }
}
