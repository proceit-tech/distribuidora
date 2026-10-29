/**
 * PRO-338 — Consulta AUTOMÁTICA del estado fiscal de FE (además de NCE) y presentación de estados SIFEN / alertas técnicas. Casos dirigidos P338-01…P338-20.
 * Sin red, sin PostgreSQL y SIN credenciales reales: el worker se ejercita con una base y un gateway SIMULADOS (la simulación de la base imita solo lo necesario de las funciones SQL;
 * el comportamiento real de fe_consulta_reservar / fe_documento_registrar_consulta_flujo_nce se verifica como TEXTO de la migración NEX-062). No prueba PostgreSQL, el gateway ni SIFEN reales.
 * NO registrado en el runner global (scripts/casos-clientes/run.js) por orden PRO-338; NO EJECUTADO en la entrega.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { CADENCIA_SEGUNDOS, ejecutarLote, TIPOS_CONSULTA_AUTOMATICA } from "@/lib/facturacion/consulta-automatica";
import { limpiarCacheTokens, type FetchLike } from "@/lib/facturacion/gateway";
import { alertaConsulta, presentacionSifen } from "@/lib/facturacion/presentacion-sifen";
import { decidirConsulta } from "@/lib/facturacion/reconciliacion";
import { SQL_GRUPO } from "@/lib/facturacion/shared";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");

const EMPRESA_A = "11111111-1111-4111-8111-111111111111";
const EMPRESA_B = "22222222-2222-4222-8222-222222222222";
const ACTOR_A = "99999999-9999-4999-8999-999999999999";
const ACTOR_B = "88888888-8888-4888-8888-888888888888";
const DOC_FE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const DOC_NCE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const SECRETO = "clave-sintetica-no-real";
const TOKEN = "token.sintetico.no-real";
const CONFIG = { baseUrl: "https://gateway.prueba.invalid", credencialRef: "PRUEBA", timeoutMs: 1000 };
const ENV = { NEXIT_FE_PRUEBA_RUC: "80000005", NEXIT_FE_PRUEBA_PASSWORD: SECRETO };
// CDC sintéticos de la FE 001-003-0009015 (caso real de regresión) y de OTRO número (divergente).
const CDC_FE = "01" + "80000005" + "6" + "001" + "003" + "0009015" + "1" + "20261029" + "1" + "123456789" + "0";
const CDC_OTRO = "01" + "80000005" + "6" + "001" + "003" + "0009016" + "1" + "20261029" + "1" + "123456789" + "0";
const AHORA = Date.parse("2026-10-29T12:36:21Z");

type RespGw = { status: number; cuerpo: unknown } | "TIMEOUT" | "RED";
type Fila = { o_empresa: string; o_documento: string; o_actor: string | null; o_tipo: string; o_intentos: number };
type Doc = { tipo: string; establecimiento: string; puntoExpedicion: string; numero: string; serie: null; cdc: string | null; estadoSifen: string };

const respuesta = (estado: string | null, cdc: string | null, mensaje: string) => ({
  status: "success",
  response: estado === null ? {} : { Estado: estado, DE: { CDC: cdc, FechaFirma: "2026-10-29 05:44:00", FechaEnvio: "2026-10-29 05:44:38", Retorno: { CodRespuesta: "0160", Mensaje: mensaje } } },
});

function gateway(consultas: RespGw[]) {
  const urls: string[] = [];
  const cola = [...consultas];
  const fetch: FetchLike = async (url) => {
    urls.push(url);

    if (url.endsWith("/api/login")) return { status: 200, text: async () => JSON.stringify({ status: "success", token: TOKEN }) };

    const r = cola.shift();

    if (r === "TIMEOUT") throw Object.assign(new Error("abortado"), { name: "AbortError" });
    if (r === "RED" || !r) throw new Error("ECONNREFUSED");

    return { status: r.status, text: async () => JSON.stringify(r.cuerpo) };
  };

  return { fetch, urls };
}

/** Base simulada del worker: reserva las filas dadas, devuelve configuración por empresa y el documento, y registra cada llamada (la función de registro imita la guarda de CDC divergente). */
function baseSimulada(filas: Fila[], docs: Record<string, Doc>, opciones: { sinConfig?: boolean } = {}) {
  const sql: Array<{ texto: string; params: unknown[] }> = [];
  const registros: Array<{ funcion: string; params: unknown[] }> = [];
  const programados: Array<{ documento: unknown; proxima: unknown; incrementa: unknown }> = [];
  const db = {
    async query(texto: string, params: unknown[] = []) {
      sql.push({ texto, params });

      if (texto.includes("fe_consulta_reservar")) return { rows: filas };
      if (texto.includes("fe_consulta_programar")) { programados.push({ documento: params[1], proxima: params[2], incrementa: params[3] }); return { rows: [] }; }
      if (/FROM fe_gateway_config/.test(texto)) return { rows: opciones.sinConfig ? [] : [{ ...CONFIG, empresaId: params[0] }] };
      if (/fe_documento_registrar_consulta/.test(texto)) {
        const funcion = /fe_documento_registrar_consulta_flujo_nce/.test(texto) ? "flujo" : "manual";
        const d = docs[String(params[2])];
        const cdc = params[8] as string | null;
        const divergente = params[3] === "OK" && cdc !== null && (cdc.slice(17, 24) !== d.numero || (d.cdc !== null && d.cdc !== cdc));

        registros.push({ funcion, params });

        return { rows: [{ resultado: divergente ? "CDC_DIVERGENTE" : params[3] }] };
      }

      const d = docs[String(params[2] ?? params[1] ?? "")] ?? Object.values(docs)[0];

      return { rows: d ? [{ id: params[2], ...d }] : [] };
    },
  };

  return { db, sql, registros, programados };
}

const FE_ENVIADA: Doc = { tipo: "FE", establecimiento: "001", puntoExpedicion: "003", numero: "0009015", serie: null, cdc: null, estadoSifen: "SIN_CONSULTA" };
const NCE_ENVIADA: Doc = { tipo: "NCE", establecimiento: "001", puntoExpedicion: "001", numero: "0005996", serie: null, cdc: null, estadoSifen: "PENDIENTE" };
const fila = (documento: string, tipo: string, extra: Partial<Fila> = {}): Fila => ({ o_empresa: EMPRESA_A, o_documento: documento, o_actor: ACTOR_A, o_tipo: tipo, o_intentos: 0, ...extra });
const sinPausa = { dormir: async () => undefined, ahora: () => AHORA };

export async function verificarCasosPro338(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  const sinComentarios = (t: string) => t.replace(/--.*$/gm, "");
  const nex062 = sinComentarios(leer("documentacao/banco/nexit/v1/migraciones/NEX-062-facturacion-nce-v1.sql"));
  const reservar = nex062.slice(nex062.indexOf("FUNCTION public.fe_consulta_reservar"), nex062.indexOf("FUNCTION public.fe_consulta_programar"));
  const programar = nex062.slice(nex062.indexOf("FUNCTION public.fe_consulta_programar"), nex062.indexOf("FUNCTION public.fe_punto_secuencia_configurar"));
  const flujo = nex062.slice(nex062.indexOf("FUNCTION public.fe_documento_registrar_consulta_flujo_nce"), nex062.indexOf("FUNCTION public.nex_aplicar_grants_facturacion_nce"));
  const auto = leer("lib/facturacion/consulta-automatica.ts");
  const instr = leer("instrumentation.ts");
  const pagina = leer("app/(private)/documentos/page.tsx");
  const css = leer("app/(private)/documentos/page.module.css");
  const rutaManual = leer("app/api/documentos/[id]/consultar/route.ts");
  const shared = leer("lib/facturacion/shared.ts");

  // ── P338-01 FE enviada, SIFEN no final, sin navegador: el worker la consulta (flujo) y programa la siguiente contando el intento
  {
    limpiarCacheTokens();
    const gw = gateway([{ status: 200, cuerpo: respuesta("Pendiente", null, "En proceso") }]);
    const b = baseSimulada([fila(DOC_FE, "FE")], { [DOC_FE]: FE_ENVIADA });
    const r = await ejecutarLote(b.db as never, { ...sinPausa, dep: { fetch: gw.fetch, env: ENV } });

    igual("P338-01: el worker (servidor, sin navegador) consulta la FE y la registra con la función del flujo", [r.reservados, r.consultados, r.fallidos, b.registros.map((x) => x.funcion), b.registros[0]?.params.slice(0, 3)], [1, 1, 0, ["flujo"], [EMPRESA_A, ACTOR_A, DOC_FE]]);
    igual("P338-01: programa la próxima consulta según la cadencia y cuenta el intento", b.programados, [{ documento: DOC_FE, proxima: new Date(AHORA + CADENCIA_SEGUNDOS[0] * 1000).toISOString(), incrementa: true }]);
    cierto("P338-01: la reserva pide FE (y NCE) al SQL", JSON.stringify(b.sql[0].params[2]) === JSON.stringify(["NCE", "FE"]) && TIPOS_CONSULTA_AUTOMATICA.includes("FE"));
    cierto("P338-01: el planificador lo arranca instrumentation.ts en el runtime Node (no depende de un navegador ni de una petición)", /NEXT_RUNTIME !== "nodejs"/.test(instr) && /iniciarPlanificador\(\)/.test(instr) && /setInterval\(/.test(auto) && !/refresco-documentos/.test(auto));
  }

  // ── P338-02 NCE: conserva la automatización (misma función del flujo, mismo actor)
  {
    limpiarCacheTokens();
    const gw = gateway([{ status: 200, cuerpo: respuesta("Pendiente", null, "En proceso") }]);
    const b = baseSimulada([fila(DOC_NCE, "NCE")], { [DOC_NCE]: NCE_ENVIADA });
    const r = await ejecutarLote(b.db as never, { ...sinPausa, dep: { fetch: gw.fetch, env: ENV } });

    igual("P338-02: la NCE se sigue consultando con la función del flujo NCE", [r.consultados, b.registros.map((x) => x.funcion)], [1, ["flujo"]]);
    cierto("P338-02: las reconciliaciones propias de NCE siguen intactas (dos llamadas flujoNce en nce-emision)", (leer("lib/facturacion/nce-emision.ts").match(/flujoNce: true/g) ?? []).length === 2);
  }

  // ── P338-03 dos workers: lease + SKIP LOCKED en la base, un solo planificador por proceso
  cierto("P338-03: la reserva bloquea con FOR UPDATE SKIP LOCKED y fija lease; solo toma documentos sin lease vigente", /FOR UPDATE SKIP LOCKED/.test(reservar) && /SET consulta_lease_hasta = now\(\) \+ make_interval\(secs => p_lease_segundos\)/.test(reservar) && /coalesce\(d\.consulta_lease_hasta, '-infinity'\) < now\(\)/.test(reservar));
  cierto("P338-03: un único setInterval, protegido por bandera global y sin solapar ciclos (enCurso); no hay otro planificador", (auto.match(/setInterval\(/g) ?? []).length === 1 && /__nexitConsultaAutomatica/.test(auto) && /if \(enCurso\) return;/.test(auto));

  // ── P338-04 FE no transmitida: no se consulta; badge gris
  cierto("P338-04: la reserva solo admite ENVIADO / ENVIO_INDETERMINADO con estado SIFEN no final", /d\.estado_local IN \('ENVIADO', 'ENVIO_INDETERMINADO'\) AND d\.estado_sifen IN \('SIN_CONSULTA', 'PENDIENTE', 'NO_RECONOCIDO'\)/.test(reservar));
  igual("P338-04: FE no transmitida → gris «Aún sin transmitir»; enviando → gris «Sin información»", [presentacionSifen({ estadoLocal: "PENDIENTE_ENVIO", estadoSifen: "SIN_CONSULTA" }), presentacionSifen({ estadoLocal: "ERROR_ENVIO", estadoSifen: "SIN_CONSULTA" }).texto, presentacionSifen({ estadoLocal: "ENVIANDO", estadoSifen: "SIN_CONSULTA" }).texto].map((x) => (typeof x === "string" ? x : `${x.tono}:${x.texto}`)), ["sinTransmitir:Aún sin transmitir", "Aún sin transmitir", "Sin información"]);

  // ── P338-05 FE enviada sin respuesta → amarillo
  igual("P338-05: enviada / envío indeterminado sin resultado final → amarillo «Pendiente de confirmación» (conserva el estado registrado en el detalle)", [
    presentacionSifen({ estadoLocal: "ENVIADO", estadoSifen: "SIN_CONSULTA" }).tono,
    presentacionSifen({ estadoLocal: "ENVIADO", estadoSifen: "PENDIENTE" }).tono,
    presentacionSifen({ estadoLocal: "ENVIO_INDETERMINADO", estadoSifen: "NO_RECONOCIDO" }).tono,
    presentacionSifen({ estadoLocal: "ENVIADO", estadoSifen: "SIN_CONSULTA" }).texto,
    /Sin consultar/.test(presentacionSifen({ estadoLocal: "ENVIADO", estadoSifen: "SIN_CONSULTA" }).detalle),
  ], ["pendiente", "pendiente", "pendiente", "Pendiente de confirmación", true]);

  // ── P338-06 / P338-07 respuesta correlacionada: verde / rojo
  {
    limpiarCacheTokens();
    const gw = gateway([{ status: 200, cuerpo: respuesta("Aprobado", CDC_FE, "Aprobado") }]);
    const b = baseSimulada([fila(DOC_FE, "FE")], { [DOC_FE]: FE_ENVIADA });

    await ejecutarLote(b.db as never, { ...sinPausa, dep: { fetch: gw.fetch, env: ENV } });
    igual("P338-06: respuesta Aprobado con CDC coherente → se registra OK/APROBADO con ese CDC", [b.registros[0]?.params[3], b.registros[0]?.params[7], b.registros[0]?.params[8]], ["OK", "APROBADO", CDC_FE]);
  }
  igual("P338-06/07: solo el estado PERSISTIDO pinta verde o rojo", [presentacionSifen({ estadoLocal: "ENVIADO", estadoSifen: "APROBADO" }), presentacionSifen({ estadoLocal: "ENVIADO", estadoSifen: "RECHAZADO" })].map((x) => `${x.tono}:${x.texto}`), ["aprobado:Aprobado", "rechazado:Rechazado"]);
  {
    limpiarCacheTokens();
    const gw = gateway([{ status: 200, cuerpo: respuesta("Rechazado", CDC_FE, "RUC del receptor inexistente") }]);
    const b = baseSimulada([fila(DOC_FE, "FE")], { [DOC_FE]: FE_ENVIADA });

    await ejecutarLote(b.db as never, { ...sinPausa, dep: { fetch: gw.fetch, env: ENV } });
    igual("P338-07: rechazo correlacionado (CDC coherente) → OK/RECHAZADO", [b.registros[0]?.params[3], b.registros[0]?.params[7]], ["OK", "RECHAZADO"]);
  }
  cierto("P338-07: la SQL del flujo exige CDC válido y coherente para registrar un estado final", /p_estado_sifen IN \('APROBADO', 'RECHAZADO', 'CANCELADO', 'INUTILIZADO'\)/.test(flujo) && /fe_cdc_coherente\(d\.tipo, d\.establecimiento, d\.punto_expedicion, d\.numero, coalesce\(p_cdc, d\.cdc\)\)/.test(flujo));

  // ── P338-08 HTTP 200 sin estado SIFEN: no aprobar
  {
    limpiarCacheTokens();
    const gw = gateway([{ status: 200, cuerpo: respuesta(null, null, "") }]);
    const b = baseSimulada([fila(DOC_FE, "FE")], { [DOC_FE]: FE_ENVIADA });

    await ejecutarLote(b.db as never, { ...sinPausa, dep: { fetch: gw.fetch, env: ENV } });
    igual("P338-08: HTTP 200 sin Estado → RESPUESTA_INVALIDA, sin estado fiscal; la fila sigue amarilla con alerta técnica", [b.registros[0]?.params[3], b.registros[0]?.params[7], presentacionSifen({ estadoLocal: "ENVIADO", estadoSifen: "SIN_CONSULTA" }).tono, alertaConsulta({ ultimaConsultaResultado: "RESPUESTA_INVALIDA" })?.tipo], ["RESPUESTA_INVALIDA", null, "pendiente", "tecnica"]);
  }

  // ── P338-09 Rechazado + CDC_DIVERGENTE (regresión FE 001-003-0009015): fiscal amarillo + alerta técnica roja
  {
    limpiarCacheTokens();
    const gw = gateway([{ status: 200, cuerpo: respuesta("Rechazado", CDC_OTRO, "Certificado digital no vigente al momento de firma del DE") }]);
    const b = baseSimulada([fila(DOC_FE, "FE")], { [DOC_FE]: FE_ENVIADA });
    const r = await ejecutarLote(b.db as never, { ...sinPausa, dep: { fetch: gw.fetch, env: ENV } });

    igual("P338-09: la respuesta «Rechazado» con CDC de otro documento llega a la SQL, que la anota CDC_DIVERGENTE (simulado) y el worker no lo trata como fallo", [r.consultados, r.fallidos, b.registros[0]?.params[8]], [1, 0, CDC_OTRO]);
  }
  cierto("P338-09: la SQL del flujo convierte un CDC incoherente en CDC_DIVERGENTE y en ese caso NO actualiza estado_sifen", /v_resultado := 'CDC_DIVERGENTE'/.test(flujo) && /IF v_resultado = 'OK' THEN\s+UPDATE public\.documentos_electronicos SET\s+estado_sifen = p_estado_sifen/.test(flujo) && /CASE WHEN v_resultado = 'OK' THEN p_estado_sifen END/.test(flujo));
  {
    const filaReal = { estadoLocal: "ENVIADO" as const, estadoSifen: "SIN_CONSULTA" as const, ultimaConsultaResultado: "CDC_DIVERGENTE" };
    const p = presentacionSifen(filaReal);
    const a = alertaConsulta(filaReal);

    igual("P338-09: FE 001-003-0009015 → «SIFEN: Pendiente de confirmación» (amarillo) + «Inconsistencia de consulta: CDC distinto del registrado» (alerta técnica roja, separada)", [p.tono, p.texto, a?.tipo, a?.texto], ["pendiente", "Pendiente de confirmación", "inconsistencia", "Inconsistencia de consulta: CDC distinto del registrado"]);
    cierto("P338-09: el KPI «Rechazados» solo cuenta estado_sifen = RECHAZADO (no la anomalía técnica)", SQL_GRUPO.RECHAZADO === "d.estado_sifen = 'RECHAZADO'");
  }

  // ── P338-10 certificado no vigente + identidad no confiable: sin rechazo fiscal; mensaje visible
  {
    limpiarCacheTokens();
    const gw = gateway([{ status: 200, cuerpo: respuesta("Rechazado", null, "Certificado digital no vigente al momento de firma del DE") }]);
    const doc = { ...FE_ENVIADA, cdc: null };
    const b = baseSimulada([fila(DOC_FE, "FE")], { [DOC_FE]: doc });

    await ejecutarLote(b.db as never, { ...sinPausa, dep: { fetch: gw.fetch, env: ENV } });
    igual("P338-10: «Rechazado» sin CDC que identifique el documento → RESPUESTA_INVALIDA (decidirConsulta), sin estado fiscal; el mensaje del certificado se conserva", [b.registros[0]?.params[3], b.registros[0]?.params[7], /Certificado digital no vigente/.test(JSON.stringify(b.registros[0]?.params[13] ?? ""))], ["RESPUESTA_INVALIDA", null, true]);
    cierto("P338-10: el detalle de la fila muestra el historial con mensaje, CDC informado y JSON de respuesta", /i\.cdcInformado/.test(pagina) && /i\.mensaje/.test(pagina) && /verRespuesta\(d, i\)/.test(pagina));
  }

  // ── P338-11 timeout / red / error HTTP: persistencia y backoff; sin reenvío
  {
    limpiarCacheTokens();
    const gw = gateway(["TIMEOUT"]);
    const b = baseSimulada([fila(DOC_FE, "FE", { o_intentos: 3 })], { [DOC_FE]: FE_ENVIADA });

    await ejecutarLote(b.db as never, { ...sinPausa, dep: { fetch: gw.fetch, env: ENV } });
    igual("P338-11: timeout → se registra TIMEOUT, se reprograma con backoff (4.º escalón) y nunca se llama a un endpoint de envío", [b.registros[0]?.params[3], b.programados[0]?.proxima, b.programados[0]?.incrementa, gw.urls.every((u) => u.endsWith("/api/login") || !/envi|recep|lote/i.test(u))], ["TIMEOUT", new Date(AHORA + CADENCIA_SEGUNDOS[3] * 1000).toISOString(), true, true]);
    igual("P338-11: TIMEOUT / RED / ERROR_HTTP son alertas técnicas (ámbar), no rechazo", ["TIMEOUT", "RED", "ERROR_HTTP"].map((x) => alertaConsulta({ ultimaConsultaResultado: x })?.tipo), ["tecnica", "tecnica", "tecnica"]);
    cierto("P338-11: el worker no importa ni llama funciones de envío", !/enviarDocumento|enviarDocumentoGateway|iniciar_envio/.test(auto));
  }

  // ── P338-12 estado terminal seguido de respuesta tardía: no regresa
  {
    const tardia = decidirConsulta({ tipo: "FE", establecimiento: "001", puntoExpedicion: "003", numero: "0009015", cdc: CDC_FE, estadoSifen: "APROBADO" }, { resultado: "OK", http: 200, estadoGateway: "Rechazado", estadoSifen: "RECHAZADO", cdc: CDC_FE, codRespuesta: null, mensaje: null, fechaFirma: null, fechaEnvio: null, respuesta: null });

    igual("P338-12: respuesta tardía contradictoria con APROBADO → RESPUESTA_INVALIDA", tardia.resultado, "RESPUESTA_INVALIDA");
    cierto("P338-12: la SQL del flujo rechaza documentos ya finales (DOCUMENTO_NO_PENDIENTE) y la reserva no los elige", /NEX:DOCUMENTO_NO_PENDIENTE/.test(flujo) && /d\.estado_sifen NOT IN \('SIN_CONSULTA', 'PENDIENTE', 'NO_RECONOCIDO'\)/.test(flujo));
  }

  // ── P338-13 actor / credencial ausentes: no se inventa consulta; se registra la limitación
  {
    limpiarCacheTokens();
    const gw = gateway([]);
    const sinActor = baseSimulada([fila(DOC_FE, "FE", { o_actor: null })], { [DOC_FE]: FE_ENVIADA });
    const r1 = await ejecutarLote(sinActor.db as never, { ...sinPausa, dep: { fetch: gw.fetch, env: ENV } });
    const sinCfg = baseSimulada([fila(DOC_FE, "FE", { o_intentos: 2 })], { [DOC_FE]: FE_ENVIADA }, { sinConfig: true });
    const avisos: unknown[][] = [];
    const warnOriginal = console.warn;

    console.warn = (...a: unknown[]) => { avisos.push(a); };
    const r2 = await ejecutarLote(sinCfg.db as never, { ...sinPausa, dep: { fetch: gw.fetch, env: ENV } }).finally(() => { console.warn = warnOriginal; });
    const sinCred = baseSimulada([fila(DOC_FE, "FE")], { [DOC_FE]: FE_ENVIADA });
    const r3 = await ejecutarLote(sinCred.db as never, { ...sinPausa, dep: { fetch: gw.fetch, env: {} } });

    igual("P338-13: sin actor autorizado → sinActor, sin consulta ni registro, reprograma sin contar intento", [r1.sinActor, r1.consultados, sinActor.registros.length, sinActor.programados.map((p) => p.incrementa)], [1, 0, 0, [false]]);
    igual("P338-13: sin gateway configurado → limitados, sin registro de intento, sin contar intento; queda aviso operativo sin secretos", [r2.limitados, r2.fallidos, sinCfg.registros.length, sinCfg.programados.map((p) => p.incrementa), avisos.length, JSON.stringify(avisos).includes(SECRETO)], [1, 0, 0, [false], 1, false]);
    igual("P338-13: sin credenciales → limitados y ninguna llamada al gateway", [r3.limitados, sinCred.registros.length, gw.urls.length], [1, 0, 0]);
  }

  // ── P338-14 varias empresas/sucursales: sin cruce
  {
    limpiarCacheTokens();
    const gw = gateway([{ status: 200, cuerpo: respuesta("Pendiente", null, "") }, { status: 200, cuerpo: respuesta("Pendiente", null, "") }]);
    const b = baseSimulada([fila(DOC_FE, "FE"), fila(DOC_NCE, "NCE", { o_empresa: EMPRESA_B, o_actor: ACTOR_B })], { [DOC_FE]: FE_ENVIADA, [DOC_NCE]: NCE_ENVIADA });

    await ejecutarLote(b.db as never, { ...sinPausa, dep: { fetch: gw.fetch, env: ENV } });
    igual("P338-14: cada documento se consulta con la empresa y el actor de SU reserva (configuración leída por empresa)", [b.registros.map((x) => x.params.slice(0, 3)), b.sql.filter((x) => /FROM fe_gateway_config/.test(x.texto)).map((x) => x.params[0])], [[[EMPRESA_A, ACTOR_A, DOC_FE], [EMPRESA_B, ACTOR_B, DOC_NCE]], [EMPRESA_A, EMPRESA_B]]);
    cierto("P338-14: el actor de la reserva es de la MISMA empresa, ACTIVO y con la sucursal en alcance", (reservar.match(/u\.empresa_id = e\.empresa_id/g) ?? []).length === 2 && (reservar.match(/sucursal_en_alcance\(e\.empresa_id, u\.id, e\.sucursal_id\)/g) ?? []).length === 2 && /sucursal_en_alcance\(p_empresa, p_usuario, d\.sucursal_id\)/.test(flujo));
  }

  // ── P338-15 consulta manual autorizada: conservada
  cierto("P338-15: la consulta manual sigue con EDITAR y la función original (sin flujoNce), y la pantalla la ofrece y relee la lista", /prepararFacturacion\("EDITAR"\)/.test(rutaManual) && !/flujoNce/.test(rutaManual) && /Consultar estado en SIFEN/.test(pagina) && /\{editar \? \(/.test(pagina) && /setRecarga\(\(n\) => n \+ 1\)/.test(pagina.slice(pagina.indexOf("async function reconsultar"), pagina.indexOf("async function enviarAlGateway"))));

  // ── P338-16 reinicio del proceso: lease vencido recupera el documento
  cierto("P338-16: un lease vencido vuelve a ser elegible y programar libera el lease; si programar falla, el lease vence solo", /coalesce\(d\.consulta_lease_hasta, '-infinity'\) < now\(\)/.test(reservar) && /consulta_lease_hasta = NULL/.test(programar) && /el lease vence solo/.test(auto));

  // ── P338-17 filtros e indicadores: estado fiscal real
  cierto("P338-17: indicadores y filtros siguen basados en estado_sifen real; la presentación no se usa en SQL", SQL_GRUPO.APROBADO === "d.estado_sifen = 'APROBADO'" && SQL_GRUPO.RECHAZADO === "d.estado_sifen = 'RECHAZADO'" && !/presentacion-sifen/.test(shared) && /ESTADOS_SIFEN\.map/.test(pagina));
  cierto("P338-17: «Requiere revisión» (solo etiqueta) también para FE pendiente", /d\.tipo IN \('FE','NCE'\) AND d\.estado_local IN \('ENVIADO','ENVIO_INDETERMINADO'\)/.test(shared));

  // ── P338-18 color por tipo (PRO-334) independiente del estado fiscal
  cierto("P338-18: el estado fiscal va en cápsula; la fila no se colorea y la presentación no depende del tipo", /<tr className=\{ui\.row\}>/.test(pagina) && !/tipo/.test(leer("lib/facturacion/presentacion-sifen.ts").split("export function presentacionSifen")[1].split("\n")[0]) && /\.sifen \{/.test(css));
  igual("P338-18: FE y NCE con el mismo estado reciben el mismo tono", presentacionSifen({ estadoLocal: "ENVIADO", estadoSifen: "PENDIENTE" }).tono, "pendiente");

  // ── P338-19 accesibilidad: texto siempre presente, contraste, sin desborde
  cierto("P338-19: el badge dice «SIFEN: …» con texto; el icono de alerta es decorativo (aria-hidden) y el texto de la alerta está presente", /SIFEN: \{sifen\.texto\}/.test(pagina) && /aria-hidden="true" className=\{estilos\.alertaIcono\}/.test(pagina) && /\{alerta\.texto\}/.test(pagina));
  cierto("P338-19: cápsulas y alertas con max-width 100% y corte de palabras (360/768/1366 px y zoom); colores con borde y fondo", [".sifen {", ".alertaInconsistencia,", ".avisoInconsistencia,"].every((sel) => { const t = css.slice(css.indexOf(sel), css.indexOf("}", css.indexOf(sel))); return /overflow-wrap: anywhere/.test(t); }) && /\.sifen \{[^}]*max-width: 100%/.test(css) && /\.sifenPendiente \{[^}]*border-color/.test(css));
  igual("P338-19: sin consultas o con la última consulta OK no hay alerta (una alerta antigua no se muestra como actual)", [alertaConsulta({ ultimaConsultaResultado: null }), alertaConsulta({ ultimaConsultaResultado: "OK" })], [null, null]);

  // ── P338-20 KuDE sin CDC / RECHAZADO: comportamiento previo
  cierto("P338-20: el acceso al KuDE sigue decidido por kudeDisponible y abrirKude, sin depender del tono fiscal", /kudeDisponible\(d\) \?/.test(pagina) && /onClick=\{\(\) => abrirKude\(d\)\}/.test(pagina) && !/kude/i.test(leer("lib/facturacion/presentacion-sifen.ts")));
  igual("P338-20: RECHAZADO sin CDC sigue siendo «Rechazado» (estado persistido), sin alerta si la última consulta fue OK", [presentacionSifen({ estadoLocal: "ENVIADO", estadoSifen: "RECHAZADO" }).tono, alertaConsulta({ ultimaConsultaResultado: "OK" })], ["rechazado", null]);
  igual("Cancelado / Inutilizado conservan su estado propio (no se presentan como rechazo)", [presentacionSifen({ estadoLocal: "ENVIADO", estadoSifen: "CANCELADO" }), presentacionSifen({ estadoLocal: "ENVIADO", estadoSifen: "INUTILIZADO" })].map((x) => `${x.tono}:${x.texto}`), ["anulado:Cancelado", "anulado:Inutilizado"]);

  return fallos;
}
