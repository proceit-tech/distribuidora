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

  const mkDb = (opciones: { baseUrl?: string; fallosRegistrar?: Array<Record<string, unknown> | Error>; noIniciado?: boolean } = {}) => {
    const llamadas: Array<{ sql: string; parametros: unknown[] }> = [];
    const fallos = [...(opciones.fallosRegistrar ?? [])];
    const db = {
      async query(sql: string, parametros: unknown[] = []) {
        llamadas.push({ sql, parametros });

        if (/FROM fe_gateway_config/.test(sql)) return { rows: [{ baseUrl: opciones.baseUrl ?? CONFIG.baseUrl, credencialRef: "PRUEBA", timeoutMs: 1000 }] };
        if (/fe_documento_iniciar_envio/.test(sql)) return { rows: [{ resultado: "INICIADO", payload: PAYLOAD, numero: FE.numero, tipo: "FE", establecimiento: FE.establecimiento, punto: FE.puntoExpedicion }] };
        if (/fe_documento_registrar_envio/.test(sql)) {
          const f = fallos.shift();

          if (f) throw f instanceof Error ? f : Object.assign(new Error("fallo de base"), f);

          return { rows: [{ fe_documento_registrar_envio: "ok" }] };
        }

        return { rows: [] };
      },
    };

    return { db: db as never, llamadas, registros: () => llamadas.filter((l) => /fe_documento_registrar_envio/.test(l.sql)) };
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

  // ── T-E2-09: la base falla DESPUÉS de transmitir
  const falloBase = { code: "08006" };
  const transmitir = async (opciones: Parameters<typeof mkDb>[0]) => {
    limpiarCacheTokens();
    const g = gateway([recepcionOk]);
    const m = mkDb(opciones);
    let cod = 0;
    let respuesta: Awaited<ReturnType<typeof enviarDocumento>> | null = null;

    try { respuesta = await enviarDocumento(m.db, EMPRESA, USUARIO, DOC, { fetch: g.fetch, env: ENV }); } catch (e) { cod = e instanceof ErrorFacturacion ? e.estado : -1; }

    return { g, m, cod, respuesta };
  };
  const a = await transmitir({ fallosRegistrar: [falloBase] });
  const b = await transmitir({ fallosRegistrar: [falloBase, falloBase] });
  const c = await transmitir({ fallosRegistrar: [falloBase, falloBase, falloBase] });
  const d = await transmitir({ fallosRegistrar: [{ code: "42501" }] });
  const e = await transmitir({ fallosRegistrar: [falloBase, { detail: "NEX:ENVIO_NO_INICIADO" }] });

  igual("T-E2-09 crash entre POST y persistencia: un fallo de la base se reintenta una vez con el MISMO resultado (ENVIADO), sin retransmitir", [a.g.posts(), a.m.registros().length, a.cod, a.respuesta?.estadoLocal, a.m.registros()[1].parametros[5]], [1, 2, 0, "ENVIADO", "ENVIADO"]);
  igual("T-E2-09 si el reintento también falla se cierra como ENVIO_INDETERMINADO mínimo (RESPUESTA_INVALIDA, sin cuerpo ni lote) y se devuelve el resultado real del gateway; una sola transmisión", [b.g.posts(), b.m.registros().length, b.m.registros()[2].parametros[4], b.m.registros()[2].parametros[5], b.m.registros()[2].parametros[11], b.m.registros()[2].parametros[14], b.cod], [1, 3, "RESPUESTA_INVALIDA", "ENVIO_INDETERMINADO", null, null, 0]);
  igual("T-E2-09 si la base no responde en ningún intento → 502 explícito «indeterminado» (el documento queda ENVIANDO → indeterminado), nunca éxito ni reenvío", [c.g.posts(), c.m.registros().length, c.cod, c.respuesta], [1, 3, 502, null]);
  igual("T-E2-09 errores de negocio de la función (permiso 42501) no se reintentan; si el primer cierre sí se confirmó pero se perdió la respuesta, el reintento ENVIO_NO_INICIADO se toma como ya guardado", [d.m.registros().length, d.cod === 0, e.m.registros().length, e.cod, e.respuesta?.estadoLocal], [1, false, 2, 0, "ENVIADO"]);

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

  // ── Límites de la etapa
  cierto("FAT-E2 sin worker ni agendador: ningún archivo de envío, consulta ni reconciliación crea intervalos o cron", !leer("lib/facturacion/gateway.ts").match(/setInterval|cron/i) && !leer("lib/facturacion/envio.ts").match(/setInterval|cron/i) && !leer("lib/facturacion/reconciliacion.ts").match(/setInterval|cron/i));

  return fallos;
}
