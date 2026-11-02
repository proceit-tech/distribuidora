/**
 * FAT-E2 — envío al gateway, retornos y confirmación fiscal por consulta (T-E2-01…15). Sin red, sin PostgreSQL y sin credenciales reales: `fetch` y la base son simulados.
 * Son simulaciones de la lógica de Nexit; NO prueban el comportamiento real del gateway ni de SIFEN ni de PostgreSQL.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { construirPayloadFE, type EntradaFE, type LineaFE, type ReceptorFE } from "@/lib/facturacion/payload-fe";
import { enviarDocumento } from "@/lib/facturacion/envio";
import {
  cdcCoherente, configGatewayValida, enviarDocumentoGateway, interpretarConsulta, interpretarRecepcion, limpiarCacheTokens, limpiarTexto, sinSecretos, type FetchLike, type ResultadoEnvio,
} from "@/lib/facturacion/gateway";
import { decidirConsulta, type DocumentoReconciliable } from "@/lib/facturacion/reconciliacion";
import { consultarEstado, ErrorFacturacion } from "@/lib/facturacion/shared";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const USUARIO = "99999999-9999-4999-8999-999999999999";
const DOC = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SECRETO = "clave-sintetica-no-real";
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzaW50ZXRpY28ifQ.firma-sintetica";
const CONFIG = { empresaId: EMPRESA, baseUrl: "https://gateway.prueba.invalid", credencialRef: "PRUEBA", timeoutMs: 1000 };
const ENV = { NEXIT_FE_PRUEBA_RUC: "80000005", NEXIT_FE_PRUEBA_PASSWORD: SECRETO };
const FE = { tipo: "FE", establecimiento: "001", puntoExpedicion: "002", numero: "0050000" };
const NUMERO = "001-002-0050000";
const CDC_FE = "01" + "80000005" + "6" + "001" + "002" + "0050000" + "1" + "20261014" + "1" + "123456789" + "0";
const CDC_OTRO = "01" + "80000005" + "6" + "001" + "002" + "0050001" + "1" + "20261014" + "1" + "123456789" + "0";
const PAYLOAD = { iTiDE: 1, dEst: "001", dPunExp: "002", dNumDoc: "0050000", dSerieNum: null, Subtotales: [{ dTotGralOpe: 11000 }] };

type Llamada = { url: string; headers: Record<string, string>; body: Record<string, unknown> };
type Resp = { status: number; cuerpo: unknown } | "TIMEOUT" | "RED";

function gateway(consulta: Resp[], login: Array<{ status: number; cuerpo: unknown }> = [{ status: 200, cuerpo: { status: "success", token: TOKEN } }]) {
  const llamadas: Llamada[] = [];
  const cola = [...consulta];
  const colaLogin = [...login];
  const fetchSim: FetchLike = async (url, init) => {
    llamadas.push({ url, headers: init.headers, body: JSON.parse(init.body) as Record<string, unknown> });

    if (url.endsWith("/api/login")) {
      const r = colaLogin.length > 1 ? colaLogin.shift()! : colaLogin[0];

      return { status: r.status, text: async () => JSON.stringify(r.cuerpo) };
    }

    const r = cola.shift();

    if (r === "TIMEOUT") throw Object.assign(new Error("abortado"), { name: "AbortError" });
    if (r === "RED" || !r) throw new Error("ECONNREFUSED");

    return { status: r.status, text: async () => (typeof r.cuerpo === "string" ? r.cuerpo : JSON.stringify(r.cuerpo)) };
  };

  return { fetch: fetchSim, llamadas, posts: () => llamadas.filter((l) => l.url.endsWith("/api/recepcion_de") || l.url.endsWith("/api/consulta_de")).length };
}

export async function verificarCasosFatE2(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);
  const codigo = async (p: Promise<unknown>) => { try { await p; return 0; } catch (e) { return e instanceof ErrorFacturacion ? e.estado : -1; } };

  // ── T-E2-01 preflight: configuración inutilizable o sin credenciales → nada se transmite
  igual("T-E2-01 configuración del gateway validada en el servidor: solo https sin ruta, referencia y tiempo de espera acotado a 1–60 s", [
    configGatewayValida(EMPRESA, { baseUrl: "http://gw.invalid", credencialRef: "X", timeoutMs: 5000 }), configGatewayValida(EMPRESA, { baseUrl: "https://gw.invalid/ruta", credencialRef: "X", timeoutMs: 5000 }),
    configGatewayValida(EMPRESA, { baseUrl: "https://u:p@gw.invalid", credencialRef: "X", timeoutMs: 5000 }), configGatewayValida(EMPRESA, undefined), configGatewayValida(EMPRESA, { baseUrl: "https://gw.invalid", credencialRef: 7, timeoutMs: 5000 }),
    configGatewayValida(EMPRESA, { baseUrl: "https://gw.invalid:8443", credencialRef: "X", timeoutMs: 0 })?.timeoutMs, configGatewayValida(EMPRESA, { baseUrl: "https://gw.invalid", credencialRef: "X", timeoutMs: 10 ** 9 })?.timeoutMs,
    configGatewayValida(EMPRESA, { baseUrl: "https://gw.invalid", credencialRef: "X", timeoutMs: "abc" })?.timeoutMs, configGatewayValida("E2", { baseUrl: "https://gw.invalid", credencialRef: "X", timeoutMs: 2500 }),
  ], [null, null, null, null, null, 1000, 60000, 15000, { empresaId: "E2", baseUrl: "https://gw.invalid", credencialRef: "X", timeoutMs: 2500 }]);

  /**
   * Base simulada con ESTADO: el documento nace «ENVIANDO» (lo deja fe_documento_iniciar_envio) y un cierre exitoso lo pasa al estado pedido; si ya no está «ENVIANDO» la función
   * lanza ENVIO_NO_INICIADO como la real. Fallos programados: `{ aplica: true }` = el cierre SE CONFIRMA pero se pierde la respuesta (commit confirmado, error al cliente).
   */
  type FalloBase = { code?: string; detail?: string; aplica?: boolean; luego?: string };
  const mkDb = (opciones: { baseUrl?: string; fallosRegistrar?: FalloBase[]; lecturaFalla?: boolean; estadoInicial?: string } = {}) => {
    const llamadas: Array<{ sql: string; parametros: unknown[] }> = [];
    const fallos = [...(opciones.fallosRegistrar ?? [])];
    const guardado = { estado: opciones.estadoInicial ?? "ENVIANDO", lote: null as unknown, mensaje: null as unknown };
    const aplicar = (p: unknown[]) => { guardado.estado = String(p[5]); guardado.lote = p[11]; guardado.mensaje = p[10]; };
    const db = {
      async query(sql: string, parametros: unknown[] = []) {
        llamadas.push({ sql, parametros });

        if (/FROM fe_gateway_config/.test(sql)) return { rows: [{ baseUrl: opciones.baseUrl ?? CONFIG.baseUrl, credencialRef: "PRUEBA", timeoutMs: 1000 }] };
        if (/fe_documento_iniciar_envio/.test(sql)) return { rows: [{ resultado: "INICIADO", payload: PAYLOAD, numero: FE.numero, tipo: "FE", establecimiento: FE.establecimiento, punto: FE.puntoExpedicion }] };
        if (/FROM documentos_electronicos/.test(sql)) {
          if (opciones.lecturaFalla) throw Object.assign(new Error("lectura caída"), { code: "08006" });

          return { rows: [{ estado: guardado.estado }] };
        }
        if (/fe_documento_registrar_envio/.test(sql)) {
          const f = fallos.shift();

          if (guardado.estado !== "ENVIANDO") throw Object.assign(new Error("el documento no está en envío"), { detail: "NEX:ENVIO_NO_INICIADO" });
          if (f) {
            if (f.aplica) aplicar(parametros);
            if (f.luego) guardado.estado = f.luego;

            throw Object.assign(new Error("fallo de base"), f);
          }
          aplicar(parametros);

          return { rows: [{ fe_documento_registrar_envio: "ok" }] };
        }

        return { rows: [] };
      },
    };

    return { db: db as never, llamadas, guardado, registros: () => llamadas.filter((l) => /fe_documento_registrar_envio/.test(l.sql)) };
  };
  const recepcionOk = { status: 200, cuerpo: { status: "success", message: "Documento recibido", nro_lote: "L-901" } } as const;

  limpiarCacheTokens();
  const g1 = gateway([recepcionOk]);
  const d1 = mkDb({ baseUrl: "http://inseguro.invalid" });

  igual("T-E2-01 URL no https en la configuración → 409 y ninguna llamada de red ni de envío a la base", [await codigo(enviarDocumento(d1.db, EMPRESA, USUARIO, DOC, { fetch: g1.fetch, env: ENV })), g1.llamadas.length, d1.llamadas.some((l) => /iniciar_envio/.test(l.sql))], [409, 0, false]);
  const g1b = gateway([recepcionOk]);

  igual("T-E2-01 sin credenciales en el servidor → 409 antes de iniciar el envío (no se consume ni se marca nada)", [await codigo(enviarDocumento(mkDb().db, EMPRESA, USUARIO, DOC, { fetch: g1b.fetch, env: {} })), g1b.llamadas.length], [409, 0]);

  // ── T-E2-02: recepción ≠ aprobación
  limpiarCacheTokens();
  const g2 = gateway([recepcionOk]);
  const d2 = mkDb();
  const e2 = await enviarDocumento(d2.db, EMPRESA, USUARIO, DOC, { fetch: g2.fetch, env: ENV });

  igual("T-E2-02 login + un solo POST de recepción; ENVIADO con lote; la base recibe el cierre una vez y NINGÚN estado SIFEN (la aprobación solo la fija la consulta)", [g2.posts(), e2.estadoLocal, e2.lote, d2.registros().length, /estado_sifen|APROBADO/i.test(d2.registros()[0].sql + JSON.stringify(d2.registros()[0].parametros)), (e2 as Record<string, unknown>).estadoSifen ?? null], [1, "ENVIADO", "L-901", 1, false, null]);

  // ── T-E2-03/04: respuesta sin identidad o con identidad ajena
  const rec = (cuerpo: unknown, doc = FE) => interpretarRecepcion(200, JSON.stringify(cuerpo), [], doc);

  igual("T-E2-03/04 200 sin lote/CDC/número, con CDC de otro documento o con eco de otro número → indeterminado (nunca ENVIADO)", [
    rec({ status: "success", message: "ok" }).estadoLocal, rec({ status: "success", cdc: CDC_OTRO }).estadoLocal, rec({ status: "success", dEst: "001", dPunExp: "002", dNumDoc: "0050001" }).estadoLocal,
    rec({ status: "success", nro_lote: "L-1", cdc: CDC_OTRO }).estadoLocal, rec({ status: "success", nro_lote: "x".repeat(61) }).estadoLocal,
  ], Array(5).fill("ENVIO_INDETERMINADO"));

  // ── T-E2-05/06: rechazos por documento
  const rechazo = (rechazados: unknown[], aceptados: unknown[] = []) => rec({ status: "error", rechazados: rechazados.length, message: "Hay documentos rechazados", response: { Aceptados: aceptados, Rechazados: rechazados } });
  const nuestro = rechazo([{ [NUMERO]: { dRucRec: "RUC inválido", dNomRec: "vacío" } }]);

  igual("T-E2-05 Rechazados identifica NUESTRO número → ERROR_ENVIO/RECHAZO con error por campo (no es un RECHAZADO SIFEN: el estado fiscal no se toca)", [nuestro.estadoLocal, nuestro.errorTipo, nuestro.errores, nuestro.estadoGateway], ["ERROR_ENVIO", "RECHAZO", [`${NUMERO} · dRucRec: RUC inválido`, `${NUMERO} · dNomRec: vacío`], null]);
  igual("T-E2-06 Rechazados solo de otros números, o nuestro número también en Aceptados, o duplicado → indeterminado, nunca atribuye el error ajeno", [
    rechazo([{ "001-002-0050001": { x: "mal" } }]).estadoLocal, rechazo([{ [NUMERO]: { x: "mal" } }], [NUMERO]).estadoLocal, rechazo([{ "001-002-0050001": { x: "mal" } }, { [NUMERO]: { x: "ya existe" } }]).estadoLocal,
  ], ["ENVIO_INDETERMINADO", "ENVIO_INDETERMINADO", "ENVIO_INDETERMINADO"]);

  // ── T-E2-07: 401 / token inválido
  limpiarCacheTokens();
  const g7 = gateway([{ status: 400, cuerpo: { status: "error", message: "Token inválido" } }, { status: 400, cuerpo: { status: "error", message: "Token inválido" } }]);
  const e7 = await enviarDocumentoGateway(CONFIG, PAYLOAD, FE, { fetch: g7.fetch, env: ENV }) as ResultadoEnvio;

  igual("T-E2-07 «Token inválido» (HTTP 400) repetido: renueva UNA vez (2 logins, 2 POST), termina en ERROR_ENVIO/AUTENTICACION sin bucle y sin secretos", [g7.llamadas.length, e7.estadoLocal, e7.errorTipo, JSON.stringify(e7).includes(SECRETO), JSON.stringify(e7).includes(TOKEN)], [4, "ERROR_ENVIO", "AUTENTICACION", false, false]);

  // ── T-E2-08: transporte
  const estados8 = [] as string[];

  for (const r of [{ status: 429, cuerpo: { status: "error", message: "límite" } }, { status: 408, cuerpo: {} }, { status: 409, cuerpo: { message: "duplicado" } }, { status: 500, cuerpo: {} }, { status: 503, cuerpo: "<html>" }, "TIMEOUT", "RED"] as Resp[]) {
    limpiarCacheTokens();
    const g = gateway([r]);
    const x = await enviarDocumentoGateway(CONFIG, PAYLOAD, FE, { fetch: g.fetch, env: ENV }) as ResultadoEnvio;

    estados8.push(`${x.estadoLocal}${x.errorTipo ? `/${x.errorTipo}` : ""}:${g.posts()}`);
  }
  igual("T-E2-08 429 → ERROR_ENVIO/TRANSITORIO; 408, 409 duplicado, 5xx, timeout y red → ENVIO_INDETERMINADO; en todos exactamente una transmisión (jamás reenvío ciego)", estados8, ["ERROR_ENVIO/TRANSITORIO:1", "ENVIO_INDETERMINADO:1", "ENVIO_INDETERMINADO:1", "ENVIO_INDETERMINADO:1", "ENVIO_INDETERMINADO:1", "ENVIO_INDETERMINADO:1", "ENVIO_INDETERMINADO:1"]);

  // ── T-E2-09 / FAT-E2-R01-01: la base falla DESPUÉS de transmitir. La API devuelve SIEMPRE lo que quedó guardado (nunca un ENVIADO que la base no tiene).
  const falloBase: FalloBase = { code: "08006" };
  const transmitir = async (opciones: Parameters<typeof mkDb>[0], cuerpo: Resp = recepcionOk) => {
    limpiarCacheTokens();
    const g = gateway([cuerpo]);
    const m = mkDb(opciones);
    let cod = 0;
    let respuesta: Awaited<ReturnType<typeof enviarDocumento>> | null = null;

    try { respuesta = await enviarDocumento(m.db, EMPRESA, USUARIO, DOC, { fetch: g.fetch, env: ENV }); } catch (e) { cod = e instanceof ErrorFacturacion ? e.estado : -1; }

    return { g, m, cod, respuesta };
  };
  const vista = (x: Awaited<ReturnType<typeof transmitir>>) => [x.respuesta?.estadoLocal ?? null, x.m.guardado.estado, x.g.posts(), x.cod];
  const sinFallo = await transmitir({});
  const unFallo = await transmitir({ fallosRegistrar: [falloBase] });
  const dosFallos = await transmitir({ fallosRegistrar: [falloBase, falloBase] });
  const tresFallos = await transmitir({ fallosRegistrar: [falloBase, falloBase, falloBase] });
  const permiso = await transmitir({ fallosRegistrar: [{ code: "42501" }] });
  const commitPerdido = await transmitir({ fallosRegistrar: [{ ...falloBase, aplica: true }] });
  const commitPerdidoRechazo = await transmitir({ fallosRegistrar: [{ ...falloBase, aplica: true }] }, { status: 400, cuerpo: { status: "error", message: "dRucRec inválido", errors: ["dRucRec: formato"] } });
  const fallbackConfirmadoSinRespuesta = await transmitir({ fallosRegistrar: [falloBase, falloBase, { ...falloBase, aplica: true }] });
  const lecturaCaida = await transmitir({ fallosRegistrar: [{ ...falloBase, aplica: true }], lecturaFalla: true });
  const otroProceso = await transmitir({ fallosRegistrar: [{ ...falloBase, luego: "ENVIADO" }] }, { status: 400, cuerpo: { status: "error", message: "dRucRec inválido", errors: ["dRucRec: formato"] } });

  igual("R01-01 sin fallos y con un fallo recuperado en el reintento: API y base coinciden en ENVIADO, con una sola transmisión", [vista(sinFallo), vista(unFallo), unFallo.m.registros().length, unFallo.respuesta?.lote], [["ENVIADO", "ENVIADO", 1, 0], ["ENVIADO", "ENVIADO", 1, 0], 2, "L-901"]);
  igual("R01-01 fallos consecutivos y cierre mínimo: la base queda ENVIO_INDETERMINADO y la API devuelve ENVIO_INDETERMINADO (jamás ENVIADO), sin lote/CDC/cuerpo y con mensaje; 1 sola transmisión", [vista(dosFallos), dosFallos.respuesta?.resultado, dosFallos.respuesta?.lote, dosFallos.respuesta?.cdc, dosFallos.respuesta?.fases.at(-1)?.ok, dosFallos.m.guardado.lote, /indeterminado/i.test(dosFallos.respuesta?.mensaje ?? "")], [["ENVIO_INDETERMINADO", "ENVIO_INDETERMINADO", 1, 0], "RESPUESTA_INVALIDA", null, null, false, null, true]);
  igual("R01-01 si no hay forma de guardar nada → 502 explícito y la base queda ENVIANDO (a los 2 min pasa a indeterminado); no hay resultado de éxito; 1 sola transmisión", [vista(tresFallos), tresFallos.m.registros().length], [[null, "ENVIANDO", 1, 502], 3]);
  igual("R01-01 error de negocio de la función (permiso) no se reintenta ni se disfraza de éxito", [permiso.m.registros().length, permiso.cod, permiso.respuesta, permiso.m.guardado.estado], [1, -1, null, "ENVIANDO"]);
  igual("R01-01 commit confirmado con respuesta perdida: el reintento recibe ENVIO_NO_INICIADO, se lee el estado real y se devuelve exactamente lo guardado (ENVIADO si se guardó ENVIADO; ERROR_ENVIO/RECHAZO con sus errores si eso se guardó)", [
    vista(commitPerdido), commitPerdido.respuesta?.lote, vista(commitPerdidoRechazo), commitPerdidoRechazo.respuesta?.errorTipo, commitPerdidoRechazo.respuesta?.errores,
  ], [["ENVIADO", "ENVIADO", 1, 0], "L-901", ["ERROR_ENVIO", "ERROR_ENVIO", 1, 0], "RECHAZO", ["dRucRec: formato"]]);
  igual("R01-01 el cierre mínimo se confirmó pero falló la respuesta: se detecta el ENVIO_INDETERMINADO guardado y se informa indeterminado; si la lectura de verificación también falla NUNCA se informa ENVIADO; si otra operación ya dejó ENVIADO se informa ENVIADO", [
    vista(fallbackConfirmadoSinRespuesta), vista(lecturaCaida), lecturaCaida.respuesta?.mensaje?.includes("no confirmado"), vista(otroProceso), otroProceso.respuesta?.mensaje,
  ], [["ENVIO_INDETERMINADO", "ENVIO_INDETERMINADO", 1, 0], ["ENVIO_INDETERMINADO", "ENVIADO", 1, 0], true, ["ENVIADO", "ENVIADO", 1, 0], "El documento figura como enviado (confirmado por otra operación)."]);
  cierto("R01-01 enviarDocumento devuelve el resultado efectivo del cierre (r = await cerrarEnvio) y no recompone el estado desde la respuesta del gateway", /r = await cerrarEnvio\(/.test(leer("lib/facturacion/envio.ts")) && /estadoLocal: r\.estadoLocal/.test(leer("lib/facturacion/envio.ts")));

  // ── T-E2-10/11/12: consulta y reconciliación del estado fiscal
  const docBase: DocumentoReconciliable = { ...FE, cdc: null, estadoSifen: "SIN_CONSULTA" };
  const cuerpoConsulta = (estado: unknown, extra: { cdc?: string; cod?: string; mensaje?: string } = {}) => ({
    status: "success", response: { Estado: estado, DE: { ...(extra.cdc ? { CDC: extra.cdc } : {}), Retorno: { CodRespuesta: extra.cod ?? "0260", Mensaje: extra.mensaje ?? "msg" } } },
  });
  const consulta = (estado: unknown, extra?: Parameters<typeof cuerpoConsulta>[1]) => interpretarConsulta(200, JSON.stringify(cuerpoConsulta(estado, extra)));
  const decision = (doc: DocumentoReconciliable, r: ReturnType<typeof consulta>) => { const x = decidirConsulta(doc, r); return [x.resultado, x.estadoSifen]; };

  igual("T-E2-10 reconciliación pura: Pendiente se acepta sin CDC; Aprobado/Rechazado con CDC coherente se aceptan; Aprobado/Rechazado/Cancelado/Inutilizado SIN CDC (ni guardado) no fijan estado final", [
    decision(docBase, consulta("Pendiente")), decision(docBase, consulta("Aprobado", { cdc: CDC_FE })), decision(docBase, consulta("Rechazado", { cdc: CDC_FE })),
    decision(docBase, consulta("Aprobado")), decision(docBase, consulta("Rechazado")), decision(docBase, consulta("Cancelado")), decision(docBase, consulta("Inutilizado")),
    decision({ ...docBase, cdc: CDC_FE }, consulta("Aprobado")),
  ], [["OK", "PENDIENTE"], ["OK", "APROBADO"], ["OK", "RECHAZADO"], ["RESPUESTA_INVALIDA", null], ["RESPUESTA_INVALIDA", null], ["RESPUESTA_INVALIDA", null], ["RESPUESTA_INVALIDA", null], ["OK", "APROBADO"]]);
  igual("T-E2-12 estado desconocido → NO_RECONOCIDO (nunca aprobado); CDC de otro documento pasa a la función SQL (CDC_DIVERGENTE) sin que Nexit lo apruebe; 400 «no encontrado» y 2xx sin estado no cambian nada", [
    decision(docBase, consulta("Aprobado con observación", { cdc: CDC_FE })), decision(docBase, consulta("Aprobado", { cdc: CDC_OTRO })), cdcCoherente(FE, CDC_OTRO),
    decision(docBase, interpretarConsulta(400, JSON.stringify({ status: "error", message: "Documento no encontrado" }))), decision(docBase, interpretarConsulta(200, JSON.stringify({ status: "success", response: {} }))),
  ], [["OK", "NO_RECONOCIDO"], ["OK", "APROBADO"], false, ["NO_ENCONTRADO", null], ["RESPUESTA_INVALIDA", null]]);
  igual("T-E2-10/11 un estado final ya registrado no retrocede ni cambia: APROBADO → Pendiente/Rechazado/Desconocido se bloquea (queda como evidencia); APROBADO → Cancelado y el mismo estado se aceptan; RECHAZADO es terminal", [
    decision({ ...docBase, estadoSifen: "APROBADO", cdc: CDC_FE }, consulta("Pendiente")), decision({ ...docBase, estadoSifen: "APROBADO", cdc: CDC_FE }, consulta("Rechazado", { cdc: CDC_FE })),
    decision({ ...docBase, estadoSifen: "APROBADO", cdc: CDC_FE }, consulta("???")), decision({ ...docBase, estadoSifen: "APROBADO", cdc: CDC_FE }, consulta("Cancelado", { cdc: CDC_FE })),
    decision({ ...docBase, estadoSifen: "APROBADO", cdc: CDC_FE }, consulta("Aprobado", { cdc: CDC_FE })), decision({ ...docBase, estadoSifen: "RECHAZADO", cdc: CDC_FE }, consulta("Aprobado", { cdc: CDC_FE })),
    decision({ ...docBase, estadoSifen: "PENDIENTE" }, consulta("Aprobado", { cdc: CDC_FE })), decision({ ...docBase, estadoSifen: "NO_RECONOCIDO" }, consulta("Rechazado", { cdc: CDC_FE })),
  ], [["RESPUESTA_INVALIDA", null], ["RESPUESTA_INVALIDA", null], ["RESPUESTA_INVALIDA", null], ["OK", "CANCELADO"], ["OK", "APROBADO"], ["RESPUESTA_INVALIDA", null], ["OK", "APROBADO"], ["OK", "RECHAZADO"]]);

  // Integración con consultarEstado (base y gateway simulados): Pendiente → Aprobado y Rechazado con historial, sin tocar el payload
  const mkConsulta = (fila: Record<string, unknown>) => {
    const registrar: unknown[][] = [];
    const db = {
      async query(sql: string, parametros: unknown[] = []) {
        if (/FROM fe_gateway_config/.test(sql)) return { rows: [{ baseUrl: CONFIG.baseUrl, credencialRef: "PRUEBA", timeoutMs: 1000 }] };
        if (/fe_documento_registrar_consulta/.test(sql)) { registrar.push(parametros); return { rows: [{ resultado: parametros[3] }] }; }

        return { rows: [{ id: DOC, ...FE, serie: null, cdc: null, estadoSifen: "SIN_CONSULTA", ...fila }] };
      },
    };

    return { db: db as never, registrar };
  };
  const consultar = async (fila: Record<string, unknown>, cuerpo: unknown) => {
    limpiarCacheTokens();
    const m = mkConsulta(fila);
    const g = gateway([{ status: 200, cuerpo }]);
    const r = await consultarEstado(m.db, EMPRESA, USUARIO, DOC, { fetch: g.fetch, env: ENV });

    return { r, p: m.registrar[0], g };
  };
  const pendiente = await consultar({}, cuerpoConsulta("Pendiente"));
  const aprobado = await consultar({ estadoSifen: "PENDIENTE" }, cuerpoConsulta("Aprobado", { cdc: CDC_FE, cod: "0260", mensaje: "Aprobado" }));
  const rechazado = await consultar({ estadoSifen: "PENDIENTE" }, cuerpoConsulta("Rechazado", { cdc: CDC_FE, cod: "1234", mensaje: "RUC del receptor inválido" }));
  const sinCdc = await consultar({ estadoSifen: "PENDIENTE" }, cuerpoConsulta("Aprobado"));
  const regresion = await consultar({ estadoSifen: "APROBADO", cdc: CDC_FE }, cuerpoConsulta("Pendiente"));

  igual("T-E2-10 consulta Pendiente → PENDIENTE y luego Aprobado con CDC coherente → APROBADO (solo tras la consulta válida; una consulta por vez, empresa/usuario de la sesión)", [pendiente.r.resultado, pendiente.p[7], aprobado.r.resultado, aprobado.p[7], aprobado.p[8] === CDC_FE, aprobado.p.slice(0, 3), aprobado.g.posts()], ["OK", "PENDIENTE", "OK", "APROBADO", true, [EMPRESA, USUARIO, DOC], 1]);
  igual("T-E2-11 consulta Rechazado con código y mensaje → RECHAZADO fiscal con CodRespuesta/mensaje en el historial; el payload original no se toca (la consulta solo ejecuta registrar_consulta)", [rechazado.p[7], rechazado.p[9], rechazado.p[10]], ["RECHAZADO", "1234", "RUC del receptor inválido"]);
  igual("T-E2-12 Aprobado sin CDC → se anota RESPUESTA_INVALIDA y NO se persiste ningún estado SIFEN; Pendiente sobre un APROBADO no lo regresa", [sinCdc.r.resultado, sinCdc.p[7], regresion.r.resultado, regresion.p[7]], ["RESPUESTA_INVALIDA", null, "RESPUESTA_INVALIDA", null]);

  // ── T-E2-13: aislamiento multiempresa / alcance
  limpiarCacheTokens();
  const gAjeno = gateway([{ status: 200, cuerpo: cuerpoConsulta("Aprobado", { cdc: CDC_FE }) }]);
  const dbAjena = { async query(sql: string) { return /FROM fe_gateway_config/.test(sql) ? { rows: [{ baseUrl: CONFIG.baseUrl, credencialRef: "PRUEBA", timeoutMs: 1000 }] } : { rows: [] }; } } as never;

  igual("T-E2-13 documento ajeno/fuera de alcance → 404 sin llamar al gateway; la sesión (empresa/usuario) decide el SQL del documento", [await codigo(consultarEstado(dbAjena, EMPRESA, USUARIO, DOC, { fetch: gAjeno.fetch, env: ENV })), gAjeno.llamadas.length], [404, 0]);
  const apiEnviar = leer("app/api/documentos/[id]/enviar/route.ts");
  const apiConsultar = leer("app/api/documentos/[id]/consultar/route.ts");

  cierto("T-E2-13 las rutas exigen permiso (CREAR para enviar, EDITAR para consultar) y toman empresa/usuario de la sesión, nunca del cuerpo", /prepararFacturacion\("CREAR"\)/.test(apiEnviar) && /prepararFacturacion\("EDITAR"\)/.test(apiConsultar) && /b\.empresaId, b\.usuarioId/.test(apiEnviar + apiConsultar) && !/cuerpo\.(empresa|usuario)/i.test(apiEnviar + apiConsultar) && /\{ confirmarRechazo\?: unknown \}/.test(apiEnviar));
  cierto("T-E2-13 la ACL y el alcance de sucursal se verifican también en SQL (iniciar/registrar envío y registrar consulta), con FOR UPDATE y sin permitir otra empresa", ["NEX-049-facturacion-envio-fe.sql", "NEX-050-facturacion-envio-control.sql", "NEX-047-facturacion-documentos-electronicos.sql"].every((f) => { const t = leer(`documentacao/banco/nexit/v1/migraciones/${f}`); return /usuario_tiene_permiso/.test(t) && /sucursal_en_alcance/.test(t) && /FOR UPDATE/.test(t); }));

  // ── T-E2-15: respuestas maliciosas
  const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJhIjoiYiJ9.firma-falsa-123";
  const maliciosa = {
    status: "error", rechazados: 2, message: `Falló. Authorization: Bearer ${JWT} clave=${SECRETO}`, token: JWT, password: SECRETO, headers: { Authorization: `Bearer ${JWT}` },
    response: { Aceptados: [], Rechazados: [{ [NUMERO]: { dNomRec: `vacío ${JWT}` } }, { "001-002-0050001": { dNomRec: "NOMBRE PRIVADO DE UN TERCERO", dRucRec: "99999999" } }], Extra: "x".repeat(5000), Profundo: { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } } },
  };
  limpiarCacheTokens();
  const g15 = gateway([{ status: 200, cuerpo: maliciosa }]);
  const e15 = await enviarDocumentoGateway(CONFIG, PAYLOAD, FE, { fetch: g15.fetch, env: ENV }) as ResultadoEnvio;
  const guardado = JSON.stringify(e15);

  igual("T-E2-15 la evidencia guardada no contiene token/JWT/clave (ni en claves ni dentro de mensajes) ni datos de OTROS documentos; conserva el error del propio y cuenta los ajenos", [
    guardado.includes(JWT), guardado.includes(SECRETO), guardado.includes("NOMBRE PRIVADO"), guardado.includes("99999999"), guardado.includes("0050001"),
    (e15.respuesta as { response: { OtrosDocumentosOmitidos?: number } }).response.OtrosDocumentosOmitidos, e15.estadoLocal, e15.errores.length > 0,
  ], [false, false, false, false, false, 1, "ERROR_ENVIO", true]);
  cierto("T-E2-15 textos largos acotados (1000), profundidad limitada y una respuesta enorme se reemplaza por una marca de truncado", guardado.length < 30_000 && !guardado.includes("x".repeat(1001)) && interpretarRecepcion(200, JSON.stringify({ status: "success", lote: "L", datos: Array.from({ length: 5000 }, () => "y".repeat(40)) }), [], FE).respuesta !== null);
  igual("T-E2-15 limpiarTexto/sinSecretos: omiten Bearer, JWT y los secretos literales de la sesión aunque el gateway los repita en un mensaje", [
    limpiarTexto(`x Bearer abcdefgh12345678 y`), limpiarTexto(`jwt ${JWT} fin`), sinSecretos({ m: `la clave es ${SECRETO}`, n: [SECRETO] }, [SECRETO, "ab"]), sinSecretos({ a: 1 }, []),
  ], ["x [omitido] y", "jwt [omitido] fin", { m: "la clave es [omitido]", n: ["[omitido]"] }, { a: 1 }]);
  cierto("T-E2-15 el cliente solo guarda en el documento un CDC coherente y un lote ≤ 60; los mensajes de terceros en pantallas salen de campos saneados", cdcCoherente(FE, CDC_FE) && !cdcCoherente(FE, CDC_OTRO) && /limpiarTexto/.test(leer("lib/facturacion/gateway.ts")));

  // ── T-E2-14: regresión fiscal con los vectores sanitizados de los 13 XML (la evidencia no prueba el JSON de entrada) y FAT-E1
  const receptor: ReceptorFE = {
    codigo: "CLI-000001", naturaleza: 1, tipoOperacion: 1, tipoContribuyente: 2, pais: "PRY", ruc: "80000005", dv: "6", tipoDocumentoIdentidad: null, descripcionTipoDocumento: "", numeroDocumento: "",
    razonSocial: "EMPRESA SINTETICA SA", nombreFantasia: "", direccion: "Calle 1", numeroCasa: "123", departamento: "1", distrito: "1", ciudad: "1", telefono: "", celular: "", email: "a@b.com", emailCopia: "", emailFacturacion: "",
  };
  const linea = (precio: string, cantidad = "1", extra: Partial<LineaFE> = {}): LineaFE => ({ codigoInterno: "P-1", gtin: null, descripcion: "Item sintetico", unidadSifen: 77, cantidad, precio, afectacion: 1, tasa: 10, proporcion: null, ...extra });
  const sub = (lineas: LineaFE[], monto: string) => (construirPayloadFE({ moneda: "PYG", tipoTransaccion: 1, presencia: 1, condicion: 1, pagos: [{ tipo: 1, monto }], infoAdicional: "", receptor, lineas } as EntradaFE).Subtotales as Array<Record<string, number>>)[0];
  const unItem = (total: string) => { const s = sub([linea(total)], total); return [s.dTotGralOpe, s.dBaseGrav10, s.dIVA10, s.dTBasGraIVA]; };
  const entero = (n: number) => Math.round(n);

  igual("T-E2-14 vectores A01–A05 (un ítem al 10 %, presentación en guaraníes enteros del XML): base e IVA redondeados a entero coinciden y base + IVA = total", [13800000, 4300000, 250000, 10000000, 1500000].map((t) => { const [tot, base, iva] = unItem(String(t)); return [tot, entero(base), entero(iva), entero(base) + entero(iva) === tot]; }), [
    [13800000, 12545455, 1254545, true], [4300000, 3909091, 390909, true], [250000, 227273, 22727, true], [10000000, 9090909, 909091, true], [1500000, 1363636, 136364, true],
  ]);
  igual("T-E2-14 vector B08 (un ítem, 8 decimales) coincide exactamente: base 4087963.63636364, IVA 408796.36363636", unItem("4496760"), [4496760, 4087963.63636364, 408796.36363636, 4087963.63636364]);
  igual("T-E2-14 descuento comercial ya aplicado (4 × 4.000 = 16.000): base 14545.45454545 e IVA 1454.54545455 con redondeo mitad hacia arriba en la 8.ª casa (el campo de descuento NO es parte de FE V1)", (() => { const s = sub([linea("4000", "4")], "16000"); return [s.dTotGralOpe, s.dBaseGrav10, s.dIVA10]; })(), [16000, 14545.45454545, 1454.54545455]);
  igual("T-E2-14 referencia 107.300 / IVA 9.754,54545454 intacta y el parcial con residuo (11.000 al 50 %) sigue bloqueado: cálculo y bloqueos de FAT-E1 sin cambios", (() => {
    const s = sub([linea("24600"), linea("24600"), linea("58100")], "107300");
    let bloqueado = false;

    try { sub([linea("11000", "1", { afectacion: 4, proporcion: "50" })], "11000"); } catch { bloqueado = true; }

    return [s.dTotGralOpe, s.dTotIVA, s.dBaseGrav10, bloqueado];
  })(), [107300, 9754.54545454, 97545.45454546, true]);
  cierto("T-E2-14 FAT-E2 no toca el cálculo: calculo.ts y payload-fe.ts no importan nada de gateway/envío/reconciliación", !/from "@\/lib\/facturacion\/(gateway|envio|reconciliacion|shared)"/.test(leer("lib/facturacion/calculo.ts") + leer("lib/facturacion/payload-fe.ts")));

  // ── FAT-E2-R01-02: transiciones del estado SIFEN final protegidas DENTRO de fe_documento_registrar_consulta (NEX-054), tras el bloqueo FOR UPDATE de la fila
  const m47 = leer("documentacao/banco/nexit/v1/migraciones/NEX-047-facturacion-documentos-electronicos.sql");
  const m54 = leer("documentacao/banco/nexit/v1/migraciones/NEX-054-facturacion-consulta-estado-final.sql");
  const rev54 = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-054.sql");
  const funcion = (t: string) => { const i = t.indexOf("CREATE OR REPLACE FUNCTION public.fe_documento_registrar_consulta("); return t.slice(i, t.indexOf("END $$;", i) + 7).replace(/\r/g, ""); };
  const f54 = funcion(m54);

  cierto("NEX-054 SQL: reemplaza SOLO el cuerpo de fe_documento_registrar_consulta con la misma firma (privilegios intactos), exige NEX-047, no se reaplica y no toca tablas, grants ni migraciones previas", /requiere NEX-047/.test(m54) && /parece aplicada/.test(m54) && funcion(m54).split("\n")[1] === funcion(m47).split("\n")[1] && !/\b(ALTER|DROP|CREATE)\s+TABLE|\bGRANT\b|\bREVOKE\b|\bINSERT INTO public\.(?!documento_electronico_intentos)/i.test(m54.replace(/--.*$/gm, "")) && !/NEX-054/.test(m47));
  cierto("NEX-054 SQL: la guarda va DESPUÉS del SELECT … FOR UPDATE de la fila y de la comprobación de CDC, y ANTES de insertar el intento y de actualizar el documento; solo admite el mismo estado final o APROBADO → CANCELADO", (() => {
    const iLock = f54.indexOf("FOR UPDATE"), iCdc = f54.indexOf("CDC_DIVERGENTE"), iGuarda = f54.indexOf("-- NEX-054:"), iIntento = f54.indexOf("INSERT INTO public.documento_electronico_intentos"), iUpdate = f54.indexOf("UPDATE public.documentos_electronicos SET");

    return iLock > 0 && iLock < iCdc && iCdc < iGuarda && iGuarda < iIntento && iIntento < iUpdate
      && /d\.estado_sifen IN \('APROBADO','RECHAZADO','CANCELADO','INUTILIZADO'\)/.test(f54) && /p_estado_sifen = d\.estado_sifen OR \(d\.estado_sifen = 'APROBADO' AND p_estado_sifen = 'CANCELADO'\)/.test(f54)
      && /v_resultado := 'RESPUESTA_INVALIDA'/.test(f54) && /CASE WHEN v_resultado = 'OK' THEN p_estado_sifen END/.test(f54);
  })());
  cierto("NEX-054 SQL: la contradicción queda como evidencia (intento RESPUESTA_INVALIDA con el estado del gateway y mensaje) y solo anota la última consulta; la reversión restaura exactamente el cuerpo de NEX-047 y exige que NEX-054 esté aplicada", /estado_gateway/.test(f54) && /no se modifica el estado fiscal/.test(f54) && funcion(rev54) === funcion(m47) && /NEX-054 no está aplicada/.test(rev54) && !/-- NEX-054:/.test(funcion(rev54)) && /schema_migrations/.test(rev54));

  // Modelo de la función SQL (serializada por el bloqueo de la fila): permite ejercitar consultas concurrentes y respuestas fuera de orden. NO es PostgreSQL.
  const FINALES_MODELO = new Set(["APROBADO", "RECHAZADO", "CANCELADO", "INUTILIZADO"]);
  const modelo = (guarda: boolean) => {
    const doc = { sifen: "SIN_CONSULTA", cdc: null as string | null, intentos: [] as Array<{ resultado: string; estadoSifen: unknown; estadoGateway: unknown }> };
    let cola: Promise<unknown> = Promise.resolve();
    const registrar = (p: unknown[]) => {
      const turno = cola.then(async () => {
        await Promise.resolve();
        let res = String(p[3]);

        if (res === "OK" && p[8] && doc.cdc && p[8] !== doc.cdc) res = "CDC_DIVERGENTE";
        if (guarda && res === "OK" && FINALES_MODELO.has(doc.sifen) && !(p[7] === doc.sifen || (doc.sifen === "APROBADO" && p[7] === "CANCELADO"))) res = "RESPUESTA_INVALIDA";
        doc.intentos.push({ resultado: res, estadoSifen: res === "OK" ? p[7] : null, estadoGateway: p[6] });
        if (res === "OK") { doc.sifen = String(p[7]); doc.cdc ??= (p[8] as string | null); }

        return res;
      });

      cola = turno.catch(() => undefined);

      return turno;
    };
    const db = {
      async query(sql: string, parametros: unknown[] = []) {
        if (/FROM fe_gateway_config/.test(sql)) return { rows: [{ baseUrl: CONFIG.baseUrl, credencialRef: "PRUEBA", timeoutMs: 1000 }] };
        if (/fe_documento_registrar_consulta/.test(sql)) return { rows: [{ resultado: await registrar(parametros) }] };

        return { rows: [{ id: DOC, ...FE, serie: null, cdc: doc.cdc, estadoSifen: doc.sifen }] };
      },
    };

    return { db: db as never, doc };
  };
  const aprobadoGw = cuerpoConsulta("Aprobado", { cdc: CDC_FE });
  const pendienteGw = cuerpoConsulta("Pendiente");
  const rechazadoGw = cuerpoConsulta("Rechazado", { cdc: CDC_FE, cod: "1234", mensaje: "RUC inválido" });
  const canceladoGw = cuerpoConsulta("Cancelado", { cdc: CDC_FE });

  /** Dos consultas que leen el documento a la vez; `primera` registra antes y `segunda` (respuesta lenta del gateway) después. */
  async function carrera(m: ReturnType<typeof modelo>, primera: unknown, segunda: unknown) {
    limpiarCacheTokens();
    let soltar: () => void = () => undefined;
    const compuerta = new Promise<void>((r) => { soltar = r; });
    const gA = gateway([{ status: 200, cuerpo: segunda }]);
    const gB = gateway([{ status: 200, cuerpo: primera }]);
    const lenta: FetchLike = async (url, init) => { if (url.endsWith("/api/consulta_de")) await compuerta; return gA.fetch(url, init); };
    const pLenta = consultarEstado(m.db, EMPRESA, USUARIO, DOC, { fetch: lenta, env: ENV });
    const pRapida = consultarEstado(m.db, EMPRESA, USUARIO, DOC, { fetch: gB.fetch, env: ENV });
    const rapida = await pRapida;

    soltar();

    return [rapida.resultado, (await pLenta).resultado];
  }

  const m1 = modelo(true);
  const o1 = await carrera(m1, aprobadoGw, pendienteGw);
  const m2 = modelo(true);
  const o2 = await carrera(m2, pendienteGw, aprobadoGw);
  const m3 = modelo(true);
  const o3 = await carrera(m3, aprobadoGw, rechazadoGw);
  const m4 = modelo(true);
  const o4 = await carrera(m4, rechazadoGw, aprobadoGw);
  const m5 = modelo(true);
  const o5 = await carrera(m5, aprobadoGw, canceladoGw);
  const m6 = modelo(true);
  const o6 = await carrera(m6, aprobadoGw, cuerpoConsulta("Estado raro", { cdc: CDC_FE }));
  const m7 = modelo(false);
  const o7 = await carrera(m7, aprobadoGw, pendienteGw);

  igual("R01-02 respuesta lenta y obsoleta: Aprobado se registra primero y una consulta Pendiente que leyó el documento antes llega DESPUÉS → el documento sigue APROBADO y la contradicción queda como intento RESPUESTA_INVALIDA sin estado SIFEN", [o1, m1.doc.sifen, m1.doc.intentos.map((i) => i.resultado), m1.doc.intentos.map((i) => i.estadoSifen), m1.doc.intentos[1].estadoGateway], [["OK", "RESPUESTA_INVALIDA"], "APROBADO", ["OK", "RESPUESTA_INVALIDA"], ["APROBADO", null], "Pendiente"]);
  igual("R01-02 orden inverso (Pendiente primero y Aprobado después): ambas se aceptan y el estado final es APROBADO; las dos consultas quedan en el historial", [o2, m2.doc.sifen, m2.doc.intentos.map((i) => i.resultado)], [["OK", "OK"], "APROBADO", ["OK", "OK"]]);
  igual("R01-02 consultas concurrentes con finales distintos: gana la que registra primero y la otra se conserva como evidencia sin modificar el estado (Aprobado/Rechazado y Rechazado/Aprobado)", [o3, m3.doc.sifen, m3.doc.intentos.map((i) => i.resultado), o4, m4.doc.sifen, m4.doc.intentos.map((i) => i.resultado)], [["OK", "RESPUESTA_INVALIDA"], "APROBADO", ["OK", "RESPUESTA_INVALIDA"], ["OK", "RESPUESTA_INVALIDA"], "RECHAZADO", ["OK", "RESPUESTA_INVALIDA"]]);
  igual("R01-02 evolución legítima APROBADO → CANCELADO se acepta; un estado desconocido sobre un APROBADO no lo degrada", [o5, m5.doc.sifen, o6, m6.doc.sifen, m6.doc.intentos.map((i) => i.resultado)], [["OK", "OK"], "CANCELADO", ["OK", "RESPUESTA_INVALIDA"], "APROBADO", ["OK", "RESPUESTA_INVALIDA"]]);
  igual("R01-02 sensibilidad: el MISMO escenario sin la guarda del SQL (modelo sin NEX-054) regresa de APROBADO a PENDIENTE — la regresión que la migración evita", [o7, m7.doc.sifen], [["OK", "OK"], "PENDIENTE"]);
  cierto("R01-02 limitación declarada: el modelo prueba la lógica de la guarda y el orden de bloqueo, NO PostgreSQL real; la ejecución con base descartable (migración, función, concurrencia real) queda pendiente y no se declara aprobada", /NEX-054/.test(leer("PROGRESSO-NEXIT-V1.md")) && /no se declara|NO se declara|no fue ejecutad|NO ejecutad/i.test(leer("PROGRESSO-NEXIT-V1.md")));

  // ── Límites de la etapa
  cierto("FAT-E2 sin worker ni agendador: ningún archivo de envío, consulta ni reconciliación crea intervalos o cron", !leer("lib/facturacion/gateway.ts").match(/setInterval|cron/i) && !leer("lib/facturacion/envio.ts").match(/setInterval|cron/i) && !leer("lib/facturacion/reconciliacion.ts").match(/setInterval|cron/i));

  return fallos;
}
