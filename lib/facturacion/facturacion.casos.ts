/**
 * Facturación F-01: Documentos electrónicos (NEX-047). Sin red, sin base de datos y SIN credenciales reales: el cliente del gateway se prueba con un
 * `fetch` simulado y datos sintéticos; la migración y la pantalla se analizan como texto.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { ETIQUETA_SIFEN, estadoSifenDesdeGateway, numeroDocumento } from "@/lib/facturacion/estados";
import { claveToken, consultarDocumentoGateway, enviarDocumentoGateway, interpretarRecepcion, interpretarConsulta, leerCredenciales, limpiarCacheTokens, sanearRespuesta, tamanoCacheTokens, tipoDocConsulta, type FetchLike, type ResultadoEnvio } from "@/lib/facturacion/gateway";
import { calcularItem, calcularSubtotales, numeroDec, parseDec, textoDec } from "@/lib/facturacion/calculo";
import { crearFacturaElectronica, leerCuerpoFactura, prepararFactura } from "@/lib/facturacion/emision";
import { emitirFactura, enviarDocumento } from "@/lib/facturacion/envio";
import { construirPayloadFE, FORMAS_PAGO, validarEntradaFE, totalFactura, type EntradaFE, type LineaFE, type ReceptorFE } from "@/lib/facturacion/payload-fe";
import { construirConsultas, consultarEstado, ErrorFacturacion, ErrorValidacionFiscal, leerDocumentos, normalizarConsulta, respuestaErrorFacturacion } from "@/lib/facturacion/shared";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const USUARIO = "99999999-9999-4999-8999-999999999999";
const DOC = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SUC = "55555555-5555-4555-8555-555555555555";
const CDC = "05" + "80000005" + "6" + "001" + "001" + "0005996" + "1" + "20261012" + "1" + "123456789" + "0"; // sintético, coherente con NCE 001-001-0005996
const SECRETO = "clave-sintetica-no-real";
const TOKEN = "token.sintetico.no-real";
const CONFIG = { empresaId: EMPRESA, baseUrl: "https://gateway.prueba.invalid", credencialRef: "PRUEBA", timeoutMs: 1000 };
const ENV = { NEXIT_FE_PRUEBA_RUC: "80000005", NEXIT_FE_PRUEBA_PASSWORD: SECRETO };
const NCE = { tipo: "NCE", establecimiento: "001", puntoExpedicion: "001", numero: "0005996", serie: null };

const cuerpoAprobado = {
  status: "success",
  response: { Estado: "Aprobado", FechaRegistro: "2026-10-12 10:00:00", DE: { CDC, FechaFirma: "2026-10-12 09:59:00", FechaEnvio: "2026-10-12 09:59:30", Retorno: { CodRespuesta: "0260", Mensaje: "Aprobado" }, Evento: [] } },
};

type Llamada = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

/** fetch simulado: responde según la ruta; registra cada llamada. */
function gateway(respuestas: { login?: Array<{ status: number; cuerpo: unknown }>; consulta: Array<{ status: number; cuerpo: unknown } | "TIMEOUT" | "RED"> }) {
  const llamadas: Llamada[] = [];
  const login = [...(respuestas.login ?? [{ status: 200, cuerpo: { status: "success", token: TOKEN } }])];
  const consulta = [...respuestas.consulta];
  const fetchSim: FetchLike = async (url, init) => {
    llamadas.push({ url, headers: init.headers, body: JSON.parse(init.body) as Record<string, unknown> });

    if (url.endsWith("/api/login")) {
      const r = login.length > 1 ? login.shift()! : login[0];

      return { status: r.status, text: async () => JSON.stringify(r.cuerpo) };
    }

    const r = consulta.shift();

    if (r === "TIMEOUT") throw Object.assign(new Error("abortado"), { name: "AbortError" });
    if (r === "RED" || !r) throw new Error("ECONNREFUSED");

    return { status: r.status, text: async () => (typeof r.cuerpo === "string" ? r.cuerpo : JSON.stringify(r.cuerpo)) };
  };

  return { fetch: fetchSim, llamadas };
}

export async function verificarCasosFacturacion(): Promise<string[]> {
  const fallos: string[] = [];
  const igual = (nombre: string, obtenido: unknown, esperado: unknown) => {
    contador.n += 1;
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) fallos.push(`${nombre}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(obtenido)}`);
  };
  const cierto = (nombre: string, c: boolean) => igual(nombre, c, true);

  // ── Estados: HTTP 200 no es «aprobado»; solo el texto exacto informado por el gateway
  igual("estado: aprobado/rechazado/cancelado/inutilizado/pendiente (sin importar mayúsculas ni tildes)", ["Aprobado", " aprobado ", "RECHAZADO", "Cancelado", "Inutilizado", "Pendiente"].map(estadoSifenDesdeGateway), ["APROBADO", "APROBADO", "RECHAZADO", "CANCELADO", "INUTILIZADO", "PENDIENTE"]);
  igual("estado: texto desconocido, vacío o no textual queda NO_RECONOCIDO (nunca aprobado)", ["Aprobado con observación", "", "OK", 200, null, undefined].map(estadoSifenDesdeGateway), Array(6).fill("NO_RECONOCIDO"));
  igual("número visible: establecimiento-punto-número (+ serie)", [numeroDocumento({ establecimiento: "001", puntoExpedicion: "002", numero: "0000123" }), numeroDocumento({ establecimiento: "001", puntoExpedicion: "002", numero: "0000123", serie: "AB" })], ["001-002-0000123", "001-002-0000123 (AB)"]);
  cierto("etiquetas: cada estado SIFEN tiene texto de pantalla (no depende solo del color)", Object.keys(ETIQUETA_SIFEN).length === 7);

  // ── Interpretación de la consulta (contrato observado)
  const ok = interpretarConsulta(200, JSON.stringify(cuerpoAprobado));

  igual("consulta OK: estado, CDC, código, mensaje y fechas tal como los informa el gateway", [ok.resultado, ok.estadoSifen, ok.estadoGateway, ok.cdc, ok.codRespuesta, ok.mensaje, ok.fechaFirma, ok.fechaEnvio], ["OK", "APROBADO", "Aprobado", CDC, "0260", "Aprobado", "2026-10-12 09:59:00", "2026-10-12 09:59:30"]);
  igual("consulta: HTTP 200 con estado desconocido NO se aprueba", interpretarConsulta(200, JSON.stringify({ status: "success", response: { Estado: "En proceso" } })).estadoSifen, "NO_RECONOCIDO");
  igual("consulta: respuesta sin forma esperada (sin Estado / sin response / no JSON / arreglo) es RESPUESTA_INVALIDA, no aprobación", [
    interpretarConsulta(200, JSON.stringify({ status: "success", response: {} })).resultado,
    interpretarConsulta(200, JSON.stringify({ status: "success" })).resultado,
    interpretarConsulta(200, "<html>").resultado,
    interpretarConsulta(200, "[]").resultado,
    interpretarConsulta(200, JSON.stringify({ status: "error", response: { Estado: "Aprobado" } })).resultado,
  ], Array(5).fill("RESPUESTA_INVALIDA"));
  igual("consulta: «Documento no encontrado» (HTTP 400) es NO_ENCONTRADO, no un rechazo fiscal", interpretarConsulta(400, JSON.stringify({ status: "error", message: "Documento no encontrado" })), { resultado: "NO_ENCONTRADO", http: 400, estadoGateway: null, estadoSifen: null, cdc: null, codRespuesta: null, mensaje: "Documento no encontrado", fechaFirma: null, fechaEnvio: null, respuesta: { status: "error", message: "Documento no encontrado" } });
  igual("consulta: otros errores HTTP (401/500) son ERROR_HTTP sin estado fiscal", [interpretarConsulta(500, "{}"), interpretarConsulta(401, JSON.stringify({ status: "error", message: "No autorizado" }))].map((r) => [r.resultado, r.estadoSifen]), [["ERROR_HTTP", null], ["ERROR_HTTP", null]]);
  igual("consulta: CDC con formato inválido se descarta (no se guarda un identificador dudoso)", interpretarConsulta(200, JSON.stringify({ status: "success", response: { Estado: "Aprobado", DE: { CDC: "123" } } })).cdc, null);
  igual("consulta: campos ausentes quedan nulos sin romper (forma no uniforme)", (() => { const r = interpretarConsulta(200, JSON.stringify({ status: "success", response: { Estado: "Rechazado" } })); return [r.estadoSifen, r.cdc, r.codRespuesta, r.mensaje, r.fechaFirma]; })(), ["RECHAZADO", null, null, null, null]);

  // ── Saneamiento de la evidencia
  const sucio = sanearRespuesta({ token: TOKEN, a: { Password: SECRETO, Authorization: "Bearer x", ok: 1 }, lista: [{ api_key: "k", dato: "y" }], largo: "x".repeat(1500) }) as Record<string, unknown>;

  igual("saneamiento: claves token/password/authorization/api_key se omiten en cualquier nivel", JSON.stringify(sucio).includes(TOKEN) || JSON.stringify(sucio).includes(SECRETO) || JSON.stringify(sucio).includes("Bearer x"), false);
  igual("saneamiento: conserva datos no sensibles y acota textos largos", [(sucio.a as Record<string, unknown>).ok, String(sucio.largo).length], [1, 1001]);
  cierto("saneamiento: una respuesta enorme se reemplaza por una marca de truncado", JSON.stringify(interpretarConsulta(200, JSON.stringify({ status: "success", response: { Estado: "Aprobado", relleno: Array.from({ length: 50 }, () => "z".repeat(900)) } })).respuesta).length < 30_000);

  // ── Credenciales por entorno
  igual("credenciales: salen de NEXIT_FE_<REF>_RUC/_PASSWORD; sin ellas o con referencia inválida → null", [leerCredenciales("PRUEBA", ENV), leerCredenciales("PRUEBA", {}), leerCredenciales("prueba", ENV), leerCredenciales("A;B", ENV)], [{ ruc: "80000005", password: SECRETO }, null, null, null]);
  igual("tipoDoc de consulta: NCE y FE confirmados; NDE/NRE/AFE no se envían hasta confirmar", ["NCE", "FE", "NDE", "NRE", "AFE"].map(tipoDocConsulta), ["NCE", "FE", null, null, null]);

  // ── Cliente del gateway (fetch simulado)
  limpiarCacheTokens();
  const g1 = gateway({ consulta: [{ status: 200, cuerpo: cuerpoAprobado }, { status: 200, cuerpo: cuerpoAprobado }] });
  const r1 = await consultarDocumentoGateway(CONFIG, NCE, { fetch: g1.fetch, env: ENV });
  const r1b = await consultarDocumentoGateway(CONFIG, NCE, { fetch: g1.fetch, env: ENV });

  igual("gateway: login y consulta a las rutas observadas, en ese orden; el segundo uso reutiliza el token (sin nuevo login)", g1.llamadas.map((l) => l.url.replace(CONFIG.baseUrl, "")), ["/api/login", "/api/consulta_de", "/api/consulta_de"]);
  igual("gateway: el login envía solo ruc y password (de la configuración privada)", g1.llamadas[0].body, { ruc: "80000005", password: SECRETO });
  igual("gateway: la consulta lleva Bearer y exactamente dEst, dPunExp, dNumDoc, dSerieNum (null) y tipoDoc", [g1.llamadas[1].headers.Authorization, g1.llamadas[1].body], [`Bearer ${TOKEN}`, { dEst: "001", dPunExp: "001", dNumDoc: "0005996", dSerieNum: null, tipoDoc: "NCE" }]);
  igual("gateway: el resultado devuelto nunca contiene la clave ni el token", [JSON.stringify([r1, r1b]).includes(SECRETO), JSON.stringify([r1, r1b]).includes(TOKEN)], [false, false]);

  limpiarCacheTokens();
  const g2 = gateway({ login: [{ status: 200, cuerpo: { status: "success", token: TOKEN } }], consulta: [{ status: 401, cuerpo: { status: "error", message: "Token vencido" } }, { status: 200, cuerpo: cuerpoAprobado }] });
  const r2 = await consultarDocumentoGateway(CONFIG, NCE, { fetch: g2.fetch, env: ENV });

  igual("gateway: ante 401 renueva el token UNA vez y reintenta la consulta (solo lectura)", [(r2 as { resultado: string }).resultado, g2.llamadas.map((l) => l.url.replace(CONFIG.baseUrl, ""))], ["OK", ["/api/login", "/api/consulta_de", "/api/login", "/api/consulta_de"]]);

  limpiarCacheTokens();
  const g3 = gateway({ consulta: [{ status: 401, cuerpo: {} }, { status: 401, cuerpo: {} }] });

  igual("gateway: si tras renovar sigue el 401 termina en ERROR_HTTP (no entra en bucle)", [(await consultarDocumentoGateway(CONFIG, NCE, { fetch: g3.fetch, env: ENV }) as { resultado: string }).resultado, g3.llamadas.length], ["ERROR_HTTP", 4]);

  limpiarCacheTokens();
  igual("gateway: tiempo de espera agotado → TIMEOUT; error de red → RED (sin estado fiscal)", [
    (await consultarDocumentoGateway(CONFIG, NCE, { fetch: gateway({ consulta: ["TIMEOUT"] }).fetch, env: ENV }) as { resultado: string }).resultado,
    (await consultarDocumentoGateway(CONFIG, NCE, { fetch: gateway({ consulta: ["RED"] }).fetch, env: ENV }) as { resultado: string }).resultado,
  ], ["TIMEOUT", "RED"]);

  // Aborto real por temporizador: el fetch simulado solo termina cuando recibe la señal.
  limpiarCacheTokens();
  const colgado: FetchLike = (url, init) =>
    url.endsWith("/api/login")
      ? Promise.resolve({ status: 200, text: async () => JSON.stringify({ status: "success", token: TOKEN }) })
      : new Promise((_, rechazar) => init.signal.addEventListener("abort", () => rechazar(Object.assign(new Error("abortado"), { name: "AbortError" }))));

  igual("gateway: el temporizador aborta una consulta colgada", (await consultarDocumentoGateway({ ...CONFIG, timeoutMs: 20 }, NCE, { fetch: colgado, env: ENV }) as { resultado: string }).resultado, "TIMEOUT");

  limpiarCacheTokens();
  const g4 = gateway({ login: [{ status: 401, cuerpo: { status: "error", message: `clave ${SECRETO} inválida` } }], consulta: [] });
  const r4 = await consultarDocumentoGateway(CONFIG, NCE, { fetch: g4.fetch, env: ENV });

  igual("gateway: login rechazado → ERROR_HTTP, no consulta y no filtra el texto del gateway ni la clave", [(r4 as { resultado: string }).resultado, g4.llamadas.length, JSON.stringify(r4).includes(SECRETO)], ["ERROR_HTTP", 1, false]);

  limpiarCacheTokens();
  const g5 = gateway({ consulta: [] });

  igual("gateway: tipo sin contrato confirmado o sin credenciales no llama a nadie", [
    await consultarDocumentoGateway(CONFIG, { ...NCE, tipo: "AFE" }, { fetch: g5.fetch, env: ENV }),
    await consultarDocumentoGateway(CONFIG, NCE, { fetch: g5.fetch, env: {} }),
    g5.llamadas.length,
  ], [{ sinContrato: "TIPO" }, { sinContrato: "CREDENCIALES" }, 0]);

  // ── Listado: alcance, filtros, paginación y orden en el servidor
  const q = construirConsultas(EMPRESA, USUARIO, { q: "50%_x", tipo: "FE", sucursal: SUC, estadoSifen: "APROBADO", grupo: "PEND_ENVIO", desde: "2026-10-01", hasta: "2026-10-12", orden: "total", dir: "asc", tamano: 500 }, 3);

  cierto("listado: empresa y usuario de la sesión son $1/$2 y el alcance de sucursales se exige en conteo y lista", q.conteo.params[0] === EMPRESA && q.conteo.params[1] === USUARIO && /sucursal_en_alcance\(\$1::uuid, \$2::uuid, d\.sucursal_id\)/.test(q.conteo.sql) && /sucursal_en_alcance\(\$1::uuid, \$2::uuid, d\.sucursal_id\)/.test(q.lista.sql) && /d\.empresa_id = \$1/.test(q.lista.sql));
  igual("listado: filtros como parámetros (nunca concatenados) y comodines del texto escapados", [q.conteo.params.slice(2), /ESCAPE '!'/.test(q.conteo.sql)], [["FE", SUC, "APROBADO", "2026-10-01", "2026-10-12", "%50!%!_x%"], true]);
  cierto("listado: fechas de emisión en hora de Paraguay y el grupo del indicador es un fragmento fijo (no texto del usuario)", /AT TIME ZONE 'America\/Asuncion'/.test(q.conteo.sql) && /d\.estado_local IN \('PENDIENTE_ENVIO','ENVIANDO','ENVIO_INDETERMINADO','ERROR_ENVIO'\)/.test(q.conteo.sql));
  igual("listado: tamaño acotado a 100, página 3 → OFFSET 200, orden pedido con desempate estable por id", [q.lista.params.slice(-2), /ORDER BY d\.total ASC, d\.id DESC LIMIT/.test(q.lista.sql)], [[100, 200], true]);
  igual("listado: valores desconocidos se descartan (tipo, estado, grupo, sucursal no UUID, fechas inválidas, orden con inyección)", (() => { const n = normalizarConsulta({ tipo: "XX", estadoSifen: "ok", estadoLocal: "x", estadoEmail: "y", grupo: "z", sucursal: "no-uuid", desde: "12/10/2026", hasta: "2026-13", orden: "fecha; DROP TABLE x", dir: "raro" }); return [n.tipo, n.estadoSifen, n.estadoLocal, n.estadoEmail, n.grupo, n.sucursal, n.desde, n.hasta, n.orden, n.dir]; })(), ["", "", "", "", "", "", "", "", "", "desc"]);
  igual("listado: sin orden pedido se usa la fecha de emisión descendente", /ORDER BY d\.fecha_emision DESC, d\.id DESC/.test(construirConsultas(EMPRESA, USUARIO, {}, 1).lista.sql), true);

  const consultas: Array<{ sql: string; parametros: unknown[] }> = [];
  const dbListado = { async query(sql: string, parametros: unknown[] = []) { consultas.push({ sql, parametros }); return /count\(\*\)::int AS total FROM documentos_electronicos d WHERE d\.empresa_id/.test(sql) && !/FILTER/.test(sql) ? { rows: [{ total: 0 }] } : /FILTER/.test(sql) ? { rows: [{ total: 0 }] } : { rows: [] }; } } as never;
  const vacio = await leerDocumentos(dbListado, EMPRESA, USUARIO, {});

  igual("listado: sin documentos devuelve lista vacía sin pedir la página y los indicadores (todos) se calculan con el alcance", [vacio.documentos, vacio.total, vacio.totalPaginas, consultas.every((c) => /sucursal_en_alcance/.test(c.sql)), consultas.some((c) => /FILTER \(WHERE d\.estado_sifen = 'APROBADO'\)/.test(c.sql))], [[], 0, 1, true, true]);

  // ── Consulta de estado: orquestación y persistencia
  const registrar: Array<unknown[]> = [];
  const filaDoc = { id: DOC, tipo: "NCE", establecimiento: "001", puntoExpedicion: "001", numero: "0005996", serie: null };
  const dbConsulta = (cfg: boolean, doc: boolean) => ({
    async query(sql: string, parametros: unknown[] = []) {
      if (/FROM fe_gateway_config/.test(sql)) return { rows: cfg ? [CONFIG] : [] };
      if (/fe_documento_registrar_consulta/.test(sql)) { registrar.push(parametros); return { rows: [{ resultado: parametros[3] }] }; }

      return { rows: doc ? [filaDoc] : [] };
    },
  }) as never;

  limpiarCacheTokens();
  const g6 = gateway({ consulta: [{ status: 200, cuerpo: cuerpoAprobado }] });
  const c1 = await consultarEstado(dbConsulta(true, true), EMPRESA, USUARIO, DOC, { fetch: g6.fetch, env: ENV });

  igual("consultar: persiste con la función SQL (empresa/usuario de la sesión, resultado, estado, CDC, código) y devuelve el resultado", [c1.resultado, registrar[0].slice(0, 3), registrar[0][3], registrar[0][7], registrar[0][8], registrar[0][9]], ["OK", [EMPRESA, USUARIO, DOC], "OK", "APROBADO", CDC, "0260"]);
  igual("consultar: el cuerpo guardado como evidencia no contiene token ni clave", JSON.stringify(registrar[0]).includes(SECRETO) || JSON.stringify(registrar[0]).includes(TOKEN), false);

  const previo = registrar.length;

  async function codigoError(p: Promise<unknown>) { try { await p; return 0; } catch (e) { return e instanceof ErrorFacturacion ? e.estado : -1; } }

  igual("consultar: documento ajeno/fuera de alcance 404; sin gateway configurado 409; tipo sin contrato 409; sin credenciales 409 — ninguno registra un intento", [
    await codigoError(consultarEstado(dbConsulta(true, false), EMPRESA, USUARIO, DOC, { fetch: g6.fetch, env: ENV })),
    await codigoError(consultarEstado(dbConsulta(false, true), EMPRESA, USUARIO, DOC, { fetch: g6.fetch, env: ENV })),
    await codigoError(consultarEstado({ async query(sql: string) { return /fe_gateway_config/.test(sql) ? { rows: [CONFIG] } : { rows: [{ ...filaDoc, tipo: "AFE" }] }; } } as never, EMPRESA, USUARIO, DOC, { fetch: g6.fetch, env: ENV })),
    await codigoError(consultarEstado(dbConsulta(true, true), EMPRESA, USUARIO, DOC, { fetch: g6.fetch, env: {} })),
    registrar.length - previo,
  ], [404, 409, 409, 409, 0]);

  limpiarCacheTokens();
  const g7 = gateway({ consulta: [{ status: 400, cuerpo: { status: "error", message: "Documento no encontrado" } }] });
  await consultarEstado(dbConsulta(true, true), EMPRESA, USUARIO, DOC, { fetch: g7.fetch, env: ENV });
  igual("consultar: «no encontrado» se registra como NO_ENCONTRADO sin estado SIFEN", [registrar.at(-1)![3], registrar.at(-1)![7]], ["NO_ENCONTRADO", null]);

  const e403 = respuestaErrorFacturacion({ code: "42501" }, "consultar");
  const e404 = respuestaErrorFacturacion({ detail: "NEX:DOCUMENTO_NO_ENCONTRADO" }, "consultar");

  igual("errores de la función SQL → 403 / 404", [e403.status, e404.status], [403, 404]);

  // ── Migración NEX-047 y reversión (análisis del texto; no se ejecuta SQL)
  const mig = leer("documentacao/banco/nexit/v1/migraciones/NEX-047-facturacion-documentos-electronicos.sql");
  const rev = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-047.sql");
  const sinComentarios = mig.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  const fn = sinComentarios.slice(sinComentarios.indexOf("CREATE OR REPLACE FUNCTION public.fe_documento_registrar_consulta"), sinComentarios.indexOf("CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_facturacion"));

  cierto("NEX-047: tablas de documentos, intentos y configuración con empresa y FKs compuestas; estados separados con CHECK (local, SIFEN, e-mail)", /CREATE TABLE public\.documentos_electronicos/.test(mig) && /CREATE TABLE public\.documento_electronico_intentos/.test(mig) && /CREATE TABLE public\.fe_gateway_config/.test(mig) && /estado_local\s+text[^\n]*CHECK \(estado_local IN \('PENDIENTE_ENVIO','ENVIO_INDETERMINADO','ENVIADO','ERROR_ENVIO'\)\)/.test(mig) && /estado_sifen\s+text[^\n]*'NO_RECONOCIDO'/.test(mig) && /estado_email\s+text[^\n]*CHECK \(estado_email IN/.test(mig) && (mig.match(/FOREIGN KEY \(empresa_id,/g) ?? []).length >= 5);
  cierto("NEX-047: unicidad de número fiscal, CDC y clave de idempotencia por empresa", /documentos_electronicos_numero_key ON public\.documentos_electronicos \(empresa_id, tipo, establecimiento, punto_expedicion, numero, coalesce\(serie, ''\)\)/.test(mig) && /documentos_electronicos_cdc_key[^;]*WHERE cdc IS NOT NULL/.test(mig) && /documentos_electronicos_idempotencia_key[^;]*WHERE clave_idempotencia IS NOT NULL/.test(mig));
  cierto("NEX-047: la configuración del gateway no guarda secretos (solo URL HTTPS y referencia de variables de entorno)", !/(password|clave|token|secret|ruc)\s+text/i.test(mig.slice(mig.indexOf("CREATE TABLE public.fe_gateway_config"), mig.indexOf("COMMENT ON TABLE public.fe_gateway_config"))) && /base_url\s+text\s+NOT NULL CHECK \(base_url ~ '\^https:\/\//.test(mig) && /credencial_ref/.test(mig));
  cierto("NEX-047: registros fiscales inmutables (identidad/importes, CDC una vez, intentos de solo altas; DELETE solo en reinicio DEMO)", /NEX:DOCUMENTO_INMUTABLE/.test(mig) && /NEX:CDC_INMUTABLE/.test(mig) && /documento_electronico_intentos es de solo altas/.test(mig) && /nex_reinicio_demo_activo\(OLD\.empresa_id\)/.test(mig) && /BEFORE TRUNCATE/.test(mig));
  cierto("NEX-047: la función exige FACTURACION_ELECTRONICA.EDITAR y sucursal en alcance ANTES de escribir, bloquea el documento (FOR UPDATE) y no cambia el estado fiscal ante errores o «no encontrado»", fn.indexOf("'FACTURACION_ELECTRONICA', 'EDITAR'") > 0 && fn.indexOf("sucursal_en_alcance") > fn.indexOf("FOR UPDATE") && fn.indexOf("FOR UPDATE") < fn.indexOf("INSERT INTO public.documento_electronico_intentos") && fn.indexOf("INSERT INTO public.documento_electronico_intentos") < fn.indexOf("UPDATE public.documentos_electronicos") && /ELSE[\s\S]*SET ultima_consulta_at = now\(\), ultima_consulta_resultado = v_resultado/.test(fn) && !/ELSE[\s\S]*estado_sifen =/.test(fn.slice(fn.indexOf("ELSE"))));
  cierto("NEX-047: un CDC distinto del registrado se anota como CDC_DIVERGENTE sin tocar el documento", /p_cdc <> d\.cdc\) OR NOT public\.fe_cdc_coherente\([^)]*\)\)\s+THEN\s+v_resultado := 'CDC_DIVERGENTE'/.test(fn) && /cdc = coalesce\(d\.cdc, p_cdc\)/.test(fn));
  cierto("NEX-047: el runtime solo lee las tablas y ejecuta la función (sin INSERT/UPDATE/DELETE directos); el envoltorio de grants incluye depósitos y facturación", /GRANT SELECT ON public\.documentos_electronicos, public\.documento_electronico_intentos, public\.fe_gateway_config TO nexit_runtime/.test(mig) && !/GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*TO nexit_runtime/i.test(mig) && /PERFORM public\.nex_aplicar_grants_depositos\(\);\s+PERFORM public\.nex_aplicar_grants_facturacion\(\);/.test(mig));
  cierto("NEX-047: permisos solo VER y EDITAR, sin asignarlos a perfiles; exige NEX-046 y no reaplica", /\('FACTURACION_ELECTRONICA','VER'\), \('FACTURACION_ELECTRONICA','EDITAR'\)/.test(mig) && !/perfil_permiso/.test(sinComentarios) && /sucursal_en_alcance\(uuid,uuid,uuid\)/.test(mig) && /NEX-047 parece aplicada/.test(mig));
  cierto("NEX-047: sin PDF/XML, sin movimiento de stock y sin modificar migraciones previas", !/pdf|xml|kude/i.test(sinComentarios) && !/movimientos_inventario|stock_saldos|inventario_costos/.test(sinComentarios));
  cierto("reversión NEX-047: aborta si hay documentos/intentos o perfiles con el permiso; restaura el envoltorio (con depósitos) y elimina lo creado", /hay documentos electrónicos o intentos registrados/.test(rev) && /recurso = 'FACTURACION_ELECTRONICA'/.test(rev) && /PERFORM public\.nex_aplicar_grants_depositos\(\);\s+END \$\$;/.test(rev) && rev.indexOf("RAISE EXCEPTION") < rev.indexOf("DROP TABLE") && /DROP TABLE IF EXISTS public\.fe_gateway_config/.test(rev) && !/DELETE FROM public\.(documentos_electronicos|documento_electronico_intentos)/.test(rev));
  igual("NEX-047 es la siguiente numeración y NEX-046 no se tocó en esta etapa", [existsSync(join(raiz, "documentacao/banco/nexit/v1/migraciones/NEX-047-facturacion-documentos-electronicos.sql")), /facturaci|FACTURACION_ELECTRONICA|documentos_electronicos/i.test(leer("documentacao/banco/nexit/v1/migraciones/NEX-046-depositos-gestion.sql"))], [true, false]);

  // ── Menú, páginas y APIs
  const menu = leer("lib/navigation/menu.ts");
  const bloqueV1 = menu.slice(menu.indexOf("const V1_HREFS"));
  const bloqueBilling = menu.slice(menu.indexOf('id: "billing"'), menu.indexOf('id: "billing"') + 1200);
  const pagina = leer("app/(private)/documentos/page.tsx");
  const apis = ["app/api/documentos/route.ts", "app/api/documentos/[id]/route.ts", "app/api/documentos/[id]/consultar/route.ts"].map(leer);
  const todo = [pagina, ...apis, leer("lib/facturacion/shared.ts"), leer("lib/facturacion/gateway.ts"), leer("lib/facturacion/servidor.ts"), leer("lib/facturacion/estados.ts")].join("\n");

  cierto("menú: «Documentos electrónicos» es el primer ítem de Facturación, «Facturas» se habilita (permiso CREAR) y Notas de crédito/remisión y Monitor SIFEN siguen ocultos", bloqueBilling.indexOf('"/documentos"') > 0 && bloqueBilling.indexOf('"/documentos"') < bloqueBilling.indexOf('"/facturas"') && /"\/documentos"/.test(bloqueV1) && /"\/facturas"/.test(bloqueV1) && /href: "\/facturas",\s+icon: "invoice",\s+permission: "FACTURACION_ELECTRONICA\.CREAR"/.test(menu) && !/"\/notas-credito"|"\/notas-remision"|"\/sifen"/.test(bloqueV1.slice(0, bloqueV1.indexOf("]);"))));
  cierto("layouts: /documentos exige FACTURACION_ELECTRONICA.VER y /facturas exige CREAR; los mocks de facturas se retiraron", /guardPage\("FACTURACION_ELECTRONICA", "VER"\)/.test(leer("app/(private)/documentos/layout.tsx")) && /guardPage\("FACTURACION_ELECTRONICA", "CREAR"\)/.test(leer("app/(private)/facturas/layout.tsx")) && !existsSync(join(raiz, "app/(private)/facturas/nuevo")) && !existsSync(join(raiz, "app/(private)/facturas/[id]")) && !/facturas-storage|localStorage/.test(leer("app/(private)/facturas/nueva/page.tsx")));
  cierto("APIs: sesión + permiso (VER para leer, EDITAR para consultar) y empresa/usuario de la sesión; nada del cuerpo ni del query decide la empresa", apis.every((a) => /prepararFacturacion\("(VER|EDITAR)"\)/.test(a)) && /prepararFacturacion\("EDITAR"\)/.test(apis[2]) && !/empresaId\s*[:=]\s*(p|params|body)\b/.test(todo) && !/get\("empresa/.test(todo));
  cierto("pantalla: servidor decide filtros/paginación/orden (sin datos fijos, mock ni localStorage) y no llama al gateway desde el navegador", /\/api\/documentos\?/.test(pagina) && !/localStorage|sessionStorage|mock|e-factura-hub|api\/login|consulta_de/i.test(pagina));
  cierto("pantalla: estados separados (SIFEN, envío, e-mail) con texto, detalle con CDC/mensaje/historial de consultas y aviso de PDF/XML no disponibles", /SIFEN: \{ETIQUETA_SIFEN/.test(pagina) && /Envío: \{ETIQUETA_LOCAL/.test(pagina) && /ETIQUETA_EMAIL\[d\.estadoEmail\]/.test(pagina) && /Historial de consultas/.test(pagina) && /descarga no disponible/.test(pagina) && /aria-expanded/.test(pagina) && /aria-pressed/.test(pagina));
  cierto("la consulta de estado solo se ofrece con permiso EDITAR", /editar \? \(/.test(pagina) && /Consultar estado en SIFEN/.test(pagina));
  cierto("sin movimiento de stock ni credenciales en el código; la URL del gateway sale de la configuración por empresa, no del código", !/movimientos_inventario|stock_saldos|inventario_registrar_movimiento/.test(todo) && !/e-factura-hub|gateway-bebidas/i.test(todo + mig) && !/(password|ruc)\s*[:=]\s*["'][^"']{3,}/i.test(todo.replace(/\/\/.*$/gm, "")));
  cierto("sin endpoints de PDF/XML inventados; recepcion_de aparece solo en el cliente del gateway (contrato confirmado), nunca en pantallas ni APIs", !/\/pdf|\/xml|kude|descarga\/|download/i.test(todo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/PDF\/KuDE/g, "")) && !/recepcion_de/.test(pagina + apis.join("\n") + leer("lib/facturacion/shared.ts")) && /\/api\/recepcion_de/.test(leer("lib/facturacion/gateway.ts")));


  // ══ Correcciones de la auditoría de F-01 ═════════════════════════════════════════════════════════════════════════════════════════════════════════
  // 1) Aislamiento del caché de autenticación
  limpiarCacheTokens();
  const EMPRESA_B = "22222222-2222-4222-8222-222222222222";
  const gc = gateway({ consulta: [{ status: 200, cuerpo: cuerpoAprobado }, { status: 200, cuerpo: cuerpoAprobado }, { status: 200, cuerpo: cuerpoAprobado }, { status: 200, cuerpo: cuerpoAprobado }] });

  await consultarDocumentoGateway(CONFIG, NCE, { fetch: gc.fetch, env: ENV });
  await consultarDocumentoGateway({ ...CONFIG, empresaId: EMPRESA_B }, NCE, { fetch: gc.fetch, env: ENV });
  igual("caché: otra empresa con la MISMA referencia y credenciales no reutiliza el token (inicia su propia sesión)", gc.llamadas.filter((l) => l.url.endsWith("/api/login")).length, 2);

  await consultarDocumentoGateway(CONFIG, NCE, { fetch: gc.fetch, env: ENV });
  igual("caché: la misma empresa sí reutiliza su token (sin nuevo login)", gc.llamadas.filter((l) => l.url.endsWith("/api/login")).length, 2);

  await consultarDocumentoGateway(CONFIG, NCE, { fetch: gc.fetch, env: { ...ENV, NEXIT_FE_PRUEBA_PASSWORD: `${SECRETO}-rotada` } });
  igual("caché: cambiar la clave (rotación) invalida el token anterior y obliga a autenticar de nuevo", gc.llamadas.filter((l) => l.url.endsWith("/api/login")).length, 3);

  const k1 = claveToken(CONFIG, "80000005", SECRETO);

  igual("caché: la clave incluye empresa, gateway y referencia, y NUNCA la clave en claro", [k1.startsWith(`${EMPRESA}|${CONFIG.baseUrl}|${CONFIG.credencialRef}|`), k1.includes(SECRETO), k1 === claveToken({ ...CONFIG, empresaId: EMPRESA_B }, "80000005", SECRETO), k1 === claveToken(CONFIG, "80000005", `${SECRETO}x`)], [true, false, false, false]);

  limpiarCacheTokens();
  for (let n = 0; n < 230; n++) await consultarDocumentoGateway({ ...CONFIG, empresaId: `${n}-empresa` }, NCE, { fetch: gateway({ consulta: [{ status: 200, cuerpo: cuerpoAprobado }] }).fetch, env: ENV });
  cierto("caché: tamaño acotado (200 entradas)", tamanoCacheTokens() <= 200);
  limpiarCacheTokens();

  // 2) NEX-047 revisada: integridad
  cierto("NEX-047: el CDC debe ser coherente con la identidad (tipo 01/04/05/06/07, establecimiento, punto y número en las posiciones del MT §10.1) en la tabla y en la consulta", /fe_cdc_coherente\(p_tipo text, p_est text, p_pun text, p_num text, p_cdc text\)/.test(mig) && /WHEN 'FE' THEN '01' WHEN 'AFE' THEN '04' WHEN 'NCE' THEN '05' WHEN 'NDE' THEN '06' WHEN 'NRE' THEN '07'/.test(mig) && /substr\(p_cdc, 12, 3\) = p_est AND substr\(p_cdc, 15, 3\) = p_pun AND substr\(p_cdc, 18, 7\) = p_num/.test(mig) && /documentos_electronicos_cdc_coherente_chk CHECK \(public\.fe_cdc_coherente\(/.test(mig) && /NOT public\.fe_cdc_coherente\(d\.tipo, d\.establecimiento, d\.punto_expedicion, d\.numero, p_cdc\)/.test(fn));
  cierto("NEX-047: el cliente del documento es inmutable (solo valor → NULL durante el reinicio DEMO por la FK SET NULL) y el estado SIFEN exige envío local ENVIADO", /NEW\.cliente_id IS DISTINCT FROM OLD\.cliente_id\s+AND NOT \(OLD\.cliente_id IS NOT NULL AND NEW\.cliente_id IS NULL AND public\.nex_reinicio_demo_activo\(OLD\.empresa_id\)\)/.test(mig) && /documentos_electronicos_estados_chk CHECK \(estado_sifen = 'SIN_CONSULTA' OR estado_local = 'ENVIADO'\)/.test(mig) && /ON DELETE SET NULL \(cliente_id\)/.test(mig));
  cierto("NEX-047: los estados de los intentos y de la última consulta tienen CHECK; la reversión retira la función de coherencia", /estado_sifen\s+text\s+CHECK \(estado_sifen IS NULL OR estado_sifen IN \('PENDIENTE','APROBADO','RECHAZADO','CANCELADO','INUTILIZADO','NO_RECONOCIDO'\)\)/.test(mig) && /documentos_electronicos_consulta_chk/.test(mig) && /DROP FUNCTION IF EXISTS public\.fe_cdc_coherente/.test(rev));

  // ══ F-02: cálculo fiscal ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const D = (t: string) => parseDec(t)!;
  const item = (cant: string, precio: string, afectacion: 1 | 2 | 3 | 4, tasa: 0 | 5 | 10, prop: string) => ({ cantidad: D(cant), precioUnitario: D(precio), afectacion, tasa, proporcion: D(prop) });
  const calc = (entradas: Array<ReturnType<typeof item>>) => calcularSubtotales(entradas.map((entrada) => ({ entrada, resultado: calcularItem(entrada) })));
  const t = (d: bigint) => textoDec(d);

  igual("decimal: análisis estricto (sin coma, signo, exponente, vacío ni más decimales de los permitidos)", ["1,5", "-1", "1e3", "", ".5", "1.123456789", "abc"].map((x) => parseDec(x)), Array(7).fill(null));
  igual("decimal: cantidad con más de 4 decimales se rechaza; precio con 8 se admite; ida y vuelta exacta", [parseDec("1.12345", 4), t(D("24600")), t(D("0.5")), t(D("9754.54545454")), numeroDec(D("107300"))], [null, "24600", "0.5", "9754.54545454", 107300]);

  const ejemplo = calc([item("1", "24600", 1, 10, "100"), item("1", "24600", 1, 10, "100"), item("1", "58100", 1, 10, "100")]);

  igual("cálculo: ejemplo conocido del gateway (24.600 + 24.600 + 58.100 al 10 %) → total 107300 e IVA 9754.54545454", [t(ejemplo.dTotGralOpe), t(ejemplo.dSub10), t(ejemplo.dTotIVA), t(ejemplo.dIVA10), t(ejemplo.dBaseGrav10), t(ejemplo.dTBasGraIVA), t(ejemplo.dSub5), t(ejemplo.dSubExe)], ["107300", "107300", "9754.54545454", "9754.54545454", "97545.45454546", "97545.45454546", "0", "0"]);
  const un5 = calcularItem(item("2", "5250", 1, 5, "100"));

  igual("cálculo: 5 % → base y liquidación exactas por ítem", [t(un5.totOperacion), t(un5.baseGravada), t(un5.liquidacion), t(un5.baseExenta)], ["10500", "10000", "500", "0"]);
  igual("cálculo: exento y exonerado no generan base ni IVA y van a sus subtotales", (() => { const r = calc([item("1", "5000", 3, 0, "0"), item("1", "3000", 2, 0, "0"), item("1", "11000", 1, 10, "100")]); return [t(r.dSubExe), t(r.dSubExo), t(r.dSub10), t(r.dTotOpe), t(r.dTotIVA), t(r.dTBasGraIVA)]; })(), ["5000", "3000", "11000", "19000", "1000", "10000"]);
  const parcial = calcularItem(item("1", "11000", 4, 10, "50"));

  igual("cálculo: gravado parcial (NT 13): base gravada, liquidación y base exenta con las fórmulas de la nota", [t(parcial.baseGravada), t(parcial.liquidacion), t(parcial.baseExenta)], ["5238.0952381", "523.80952381", "5238.0952381"]);
  igual("cálculo: cantidad decimal y precio con decimales (redondeo mitad hacia arriba a 8 decimales)", [t(calcularItem(item("0.5", "3333.333333", 1, 10, "100")).totBruto), t(calcularItem(item("1.2345", "100", 3, 0, "0")).totBruto)], ["1666.6666665", "123.45"]);
  igual("cálculo: el redondeo por ítem es determinista (la liquidación se suma por ítem, no sobre el total)", (() => { const a = calc([item("1", "1", 1, 10, "100"), item("1", "1", 1, 10, "100"), item("1", "1", 1, 10, "100")]); return [t(a.dIVA10), t(a.dTotGralOpe)]; })(), ["0.27272727", "3"]);

  // ── Validación y construcción del payload FE
  const receptor: ReceptorFE = {
    codigo: "CLI-000001", naturaleza: 1, tipoOperacion: 1, tipoContribuyente: 2, pais: "PRY", ruc: "80000005", dv: "6", tipoDocumentoIdentidad: null, descripcionTipoDocumento: "", numeroDocumento: "",
    razonSocial: "EMPRESA SINTETICA SA", nombreFantasia: "", direccion: "Calle 1", numeroCasa: "123", departamento: "1", distrito: "1", ciudad: "1", telefono: "", celular: "", email: "a@b.com", emailCopia: "", emailFacturacion: "",
  };
  const linea = (extra: Partial<LineaFE> = {}): LineaFE => ({ codigoInterno: "P-1", gtin: null, descripcion: "Producto de prueba", unidadSifen: 77, cantidad: "1", precio: "11000", afectacion: 1, tasa: 10, proporcion: null, ...extra });
  const entradaFE = (extra: Partial<EntradaFE> = {}): EntradaFE => ({ moneda: "PYG", tipoTransaccion: 1, presencia: 1, condicion: 1, pagos: [{ tipo: 1, monto: "11000" }], infoAdicional: "", receptor, lineas: [linea()], ...extra });
  const payload = construirPayloadFE(entradaFE()) as Record<string, unknown>;
  const claves = Object.keys(payload);

  igual("validación: una factura completa y coherente no tiene errores", validarEntradaFE(entradaFE()), []);
  cierto("payload: usa los nombres del JSON FE conocido (iTiDE 1, receptor, FormaPago, Detalles, Subtotales) y deja nulos los opcionales no aplicables", ["iTiDE", "iTipTra", "iTImp", "cMoneOpe", "dCondTiCam", "dTiCam", "iIndPres", "dFecEmNR", "iNatRec", "iTiOpe", "cPaisRec", "iTiContRec", "dRucRec", "dDVRec", "dNomRec", "dDirRec", "dNumCasRec", "dEmailRec", "dCodCliente", "iCondOpe", "FormaPago", "Detalles", "Subtotales"].every((k) => claves.includes(k)) && payload.iTiDE === 1 && payload.cMoneOpe === "PYG" && payload.dCondTiCam === null && payload.dTiCam === null && payload.dFecEmNR === null);
  cierto("payload: NO fabrica cdc ni numeración/fecha (los completa la función SQL al reservar el número) ni datos del emisor", !claves.some((k) => ["cdc", "dEst", "dPunExp", "dNumDoc", "dSerieNum", "dFeEmiDE", "dNumTim"].includes(k)));
  igual("payload: ítem con los campos de Detalles y valores calculados (11000 al 10 %: base 10000, IVA 1000)", (payload.Detalles as Array<Record<string, unknown>>)[0], { dCodInt: "P-1", dGtin: null, dDesProSer: "Producto de prueba", cUniMed: 77, dCantProSer: 1, dPUniProSer: 11000, dTotBruOpeItem: 11000, dTotOpeItem: 11000, iAfecIVA: 1, dPropIVA: 100, dTasaIVA: 10, dBasGravIVA: 10000, dLiqIVAItem: 1000, dBasExe: 0 });
  igual("payload: subtotales y pago por el total exacto", [(payload.Subtotales as Array<Record<string, unknown>>)[0].dTotGralOpe, (payload.Subtotales as Array<Record<string, unknown>>)[0].dTotIVA, (payload.Subtotales as Array<Record<string, unknown>>)[0].dTotalGs, payload.FormaPago], [11000, 1000, 11000, [{ iTiPago: 1, dMonTiPag: 11000, cMoneTiPag: "PYG", dTiCamTiPag: null }]]);
  igual("payload: contribuyente informa RUC/DV y NO documento de identidad; no contribuyente informa documento y NO RUC", (() => { const p = construirPayloadFE(entradaFE({ receptor: { ...receptor, naturaleza: 2, tipoOperacion: 2, tipoContribuyente: null, ruc: "", dv: "", tipoDocumentoIdentidad: 1, descripcionTipoDocumento: "Cédula paraguaya", numeroDocumento: "1234567" } })) as Record<string, unknown>; return [payload.dRucRec, payload.iTipIDRec, p.dRucRec, p.iTipIDRec, p.dNumIDRec, p.iTiContRec]; })(), ["80000005", null, null, 1, "1234567", null]);
  igual("payload: B2F (exterior) no informa tipo ni número de documento", (() => { const p = construirPayloadFE(entradaFE({ receptor: { ...receptor, naturaleza: 2, tipoOperacion: 4, tipoContribuyente: null, ruc: "", dv: "", pais: "ARG", tipoDocumentoIdentidad: 2, numeroDocumento: "X1", departamento: "", distrito: "", ciudad: "" } })) as Record<string, unknown>; return [p.iTipIDRec, p.dNumIDRec, p.cPaisRec]; })(), [null, null, "ARG"]);

  const errorDe = (e: EntradaFE) => validarEntradaFE(e).join(" | ");

  cierto("validación: producto sin clasificación de IVA, sin unidad SIFEN o sin precio bloquea la emisión (no se inventa)", /clasificación de IVA/.test(errorDe(entradaFE({ lineas: [linea({ afectacion: null })] }))) && /unidad de medida del producto no tiene equivalencia SIFEN/.test(errorDe(entradaFE({ lineas: [linea({ unidadSifen: null })] }))) && /precio de venta de referencia/.test(errorDe(entradaFE({ lineas: [linea({ precio: "0" })] }))));
  cierto("validación: tasa incoherente con la afectación, gravado parcial sin proporción, GTIN o descripción inválidos", /tasa de IVA/.test(errorDe(entradaFE({ lineas: [linea({ afectacion: 3, tasa: 10 })] }))) && /proporción gravada/.test(errorDe(entradaFE({ lineas: [linea({ afectacion: 4, tasa: 10, proporcion: null })] }))) && /GTIN/.test(errorDe(entradaFE({ lineas: [linea({ gtin: "123" })] }))) && /descripción/.test(errorDe(entradaFE({ lineas: [linea({ descripcion: "x".repeat(121) })] }))));
  cierto("validación: cantidad cero o con más de 4 decimales; sin ítems; más de 999 ítems", /cantidad/.test(errorDe(entradaFE({ lineas: [linea({ cantidad: "0" })] }))) && /cantidad/.test(errorDe(entradaFE({ lineas: [linea({ cantidad: "1.00001" })] }))) && /al menos un ítem/.test(errorDe(entradaFE({ lineas: [] }))) && /999/.test(errorDe(entradaFE({ lineas: Array.from({ length: 1000 }, () => linea()) }))));
  cierto("validación: solo PYG y contado; pagos con suma exacta, formas válidas y montos positivos", /guaraníes/.test(errorDe(entradaFE({ moneda: "USD" }))) && /al contado/.test(errorDe(entradaFE({ condicion: 2 }))) && /suma de los pagos/.test(errorDe(entradaFE({ pagos: [{ tipo: 1, monto: "10999" }] }))) && /forma de pago no es válida/.test(errorDe(entradaFE({ pagos: [{ tipo: 77, monto: "11000" }] }))) && /Indique la forma de pago/.test(errorDe(entradaFE({ pagos: [] }))));
  cierto("validación: transacción y presencia fuera de catálogo", /tipo de transacción/.test(errorDe(entradaFE({ tipoTransaccion: 9 }))) && /indicador de presencia/.test(errorDe(entradaFE({ presencia: 0 }))));
  cierto("validación receptor: contribuyente sin RUC/DV; no contribuyente sin documento; PRY con dirección sin departamento/ciudad", /RUC y dígito verificador/.test(errorDe(entradaFE({ receptor: { ...receptor, dv: "" } }))) && /tipo y número de documento/.test(errorDe(entradaFE({ receptor: { ...receptor, naturaleza: 2, tipoOperacion: 2, ruc: "", dv: "", tipoDocumentoIdentidad: null } }))) && /departamento y ciudad/.test(errorDe(entradaFE({ receptor: { ...receptor, departamento: "" } }))));
  const innominado: ReceptorFE = { ...receptor, naturaleza: 2, tipoOperacion: 2, tipoContribuyente: null, ruc: "", dv: "", tipoDocumentoIdentidad: 5, descripcionTipoDocumento: "Innominado", numeroDocumento: "0", razonSocial: "Sin Nombre", direccion: "", numeroCasa: "", departamento: "", distrito: "", ciudad: "" };

  cierto("validación receptor: Innominado solo en B2C y NO con total ≥ Gs. 7.000.000 (NT 024); por debajo es válido", validarEntradaFE(entradaFE({ receptor: innominado })).length === 0 && /Innominado/.test(errorDe(entradaFE({ receptor: { ...innominado, tipoOperacion: 1 } }))) && /7\.000\.000/.test(errorDe(entradaFE({ receptor: innominado, lineas: [linea({ precio: "7000000" })], pagos: [{ tipo: 1, monto: "7000000" }] }))) && validarEntradaFE(entradaFE({ receptor: innominado, lineas: [linea({ precio: "6999999" })], pagos: [{ tipo: 1, monto: "6999999" }] })).length === 0);
  igual("total de la factura: calculado en el motor y nulo si alguna línea no es calculable", [t(totalFactura([linea(), linea({ precio: "24600", cantidad: "2" })])!), totalFactura([linea({ afectacion: null })]), totalFactura([])], ["60200", null, null]);

  // ── Creación de la factura (servidor) con base simulada
  const PRODUCTO = "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1";
  const CLIENTE = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1";
  const PUNTO = "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1";
  const cuerpo = (extra: Record<string, unknown> = {}) => ({ claveIdempotencia: "clave-de-prueba-0001", sucursalId: SUC, puntoId: PUNTO, clienteId: CLIENTE, tipoTransaccion: 1, presencia: 1, pagos: [{ tipo: 1 }], infoAdicional: "", lineas: [{ productoId: PRODUCTO, cantidad: "1" }], ...extra });
  const filaCliente = { codigo: "CLI-000001", naturaleza_receptor: 1, tipo_operacion: 1, tipo_contribuyente_sifen: 2, pais_codigo: "PRY", tipo_documento_identidad_sifen: null, descripcion_documento_identidad: null, numero_documento: "80000005", dv: "6", razon_social: "EMPRESA SINTETICA SA", nombre_fantasia: null, email: "a@b.com", email_copia: null, email_facturacion: null, telefono: null, celular: null, activo: true, bloqueado_ventas: false, direccion: "Calle 1", numero_casa: "123", departamento_codigo: "1", distrito_codigo: "1", ciudad_codigo: "1" };
  const filaProducto = { id: PRODUCTO, codigo: "P-1", descripcion: "Producto de prueba", unidadSifen: 77, afectacion: 1, proporcion: null, tasa: 10, precio: "11000", monedaPrecio: "PYG", gtin: null };
  const llamadasCrear: Array<{ sql: string; parametros: unknown[] }> = [];
  const dbCrear = (opciones: { cliente?: Record<string, unknown> | null; productos?: Array<Record<string, unknown>>; conflicto?: boolean; aptitudMala?: boolean; sinPunto?: boolean } = {}) => {
    let intentos = 0;

    return {
      async query(sql: string, parametros: unknown[] = []) {
        llamadasCrear.push({ sql, parametros });
        if (/FROM clientes c\s+LEFT JOIN LATERAL/.test(sql)) return { rows: opciones.cliente === null ? [] : [opciones.cliente ?? filaCliente], rowCount: 1 };
        if (/SELECT c\.id, c\.naturaleza_receptor/.test(sql)) return { rows: [{ ...(opciones.cliente ?? filaCliente), id: CLIENTE, tipo_persona: "JURIDICA", tipo_documento: "RUC", pais_codigo: "PRY" }], rowCount: 1 };
        if (/FROM direcciones_cliente/.test(sql)) return { rows: [{ cliente_id: CLIENTE, direccion: "Calle 1", numero_casa: "123", departamento_codigo: "1", distrito_codigo: "1", ciudad_codigo: "1", pais_codigo: "PRY" }], rowCount: 1 };
        if (/FROM referencia_geografica_paises/.test(sql)) return { rows: [{ codigo: "PRY" }], rowCount: 1 };
        if (/FROM sucursales sc JOIN empresas e/.test(sql)) return { rows: opciones.sinPunto ? [] : [{ empresa: "EMPRESA SINTETICA", sucursal: "Casa Central", establecimiento: "001", punto: "002", puntoNombre: "Punto 002" }], rowCount: 1 };
        if (/FROM productos p/.test(sql)) return { rows: opciones.productos ?? [filaProducto], rowCount: 1 };
        if (/fe_documento_crear_fe/.test(sql)) {
          intentos += 1;
          if (opciones.conflicto && intentos === 1) throw Object.assign(new Error("duplicado"), { code: "23505" });

          return { rows: [{ documentoId: DOC, numero: "0000001", reutilizado: intentos > 1 }], rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
      },
    } as never;
  };

  igual("cuerpo: forma inválida (sin clave, ids no UUID, sin ítems, sin pago o con varios) se rechaza antes de tocar la base", [
    typeof leerCuerpoFactura({ ...cuerpo(), claveIdempotencia: "corta" }), typeof leerCuerpoFactura({ ...cuerpo(), clienteId: "x" }), typeof leerCuerpoFactura({ ...cuerpo(), lineas: [] }),
    typeof leerCuerpoFactura({ ...cuerpo(), pagos: [] }), typeof leerCuerpoFactura({ ...cuerpo(), pagos: [{ tipo: 1 }, { tipo: 2 }] }), typeof leerCuerpoFactura(cuerpo()),
  ], ["string", "string", "string", "string", "string", "object"]);

  const parseado = leerCuerpoFactura({ ...cuerpo(), lineas: [{ productoId: PRODUCTO, cantidad: "1", precio: "1", afectacion: 3, tasa: 0 }], empresaId: "otra", total: "1" });

  igual("cuerpo: precio, IVA, total y empresa enviados por el navegador se IGNORAN (solo cuentan ids y cantidades)", [JSON.stringify(parseado).includes("otra"), JSON.stringify(parseado).includes('"precio"'), JSON.stringify(parseado).includes('"afectacion"')], [false, false, false]);

  const creada = await crearFacturaElectronica(dbCrear(), EMPRESA, USUARIO, leerCuerpoFactura(cuerpo()) as never);
  const crear = llamadasCrear.find((l) => /fe_documento_crear_fe/.test(l.sql))!;
  const payloadEnviado = JSON.parse(String(crear.parametros[9])) as Record<string, unknown>;

  igual("creación: llama a fe_documento_crear_fe con empresa/usuario de la sesión, sucursal, punto, clave, cliente, total del servidor y payload sin cdc ni numeración", [creada, crear.parametros.slice(0, 6), crear.parametros[8], "cdc" in payloadEnviado, "dNumDoc" in payloadEnviado, (payloadEnviado.Subtotales as Array<Record<string, unknown>>)[0].dTotGralOpe], [{ documentoId: DOC, numero: "0000001", reutilizado: false }, [EMPRESA, USUARIO, SUC, PUNTO, "clave-de-prueba-0001", CLIENTE], "11000", false, false, 11000]);
  igual("creación: el precio sale del catálogo (11000), no del navegador", (payloadEnviado.Detalles as Array<Record<string, unknown>>)[0].dPUniProSer, 11000);

  const antes = llamadasCrear.length;
  const rechaza = async (db: never, c: Record<string, unknown> = cuerpo()) => { try { await crearFacturaElectronica(db, EMPRESA, USUARIO, leerCuerpoFactura(c) as never); return "sin error"; } catch (e) { return e instanceof ErrorValidacionFiscal ? `${e.estado}:fiscal` : e instanceof ErrorFacturacion ? `${e.estado}:${e.message.slice(0, 40)}` : "otro"; } };

  igual("creación: cliente inexistente 404; producto inexistente/no facturable 422; sin precio en PYG 422; producto sin IVA 422 (con lista de motivos)", [
    (await rechaza(dbCrear({ cliente: null }))).slice(0, 3),
    (await rechaza(dbCrear({ productos: [] }))).slice(0, 3),
    (await rechaza(dbCrear({ productos: [{ ...filaProducto, precio: null }] }))).slice(0, 3),
    await rechaza(dbCrear({ productos: [{ ...filaProducto, afectacion: null }] })),
  ], ["404", "422", "422", "422:fiscal"]);
  cierto("creación: ninguna validación fallida llega a fe_documento_crear_fe (no se consume número)", llamadasCrear.slice(antes).every((l) => !/fe_documento_crear_fe/.test(l.sql)));
  igual("creación: cliente con datos fiscales pendientes (aptitud SIFEN) se rechaza con el detalle", await rechaza(dbCrear({ cliente: { ...filaCliente, dv: "9" } })), "422:fiscal");
  igual("creación: la carrera de la misma clave (23505) se resuelve releyendo el documento ya creado", (await crearFacturaElectronica(dbCrear({ conflicto: true }), EMPRESA, USUARIO, leerCuerpoFactura(cuerpo()) as never)).reutilizado, true);
  igual("creación: forma de pago fuera de catálogo", await rechaza(dbCrear(), cuerpo({ pagos: [{ tipo: 77 }] })), "422:La forma de pago no es válida.");

  // ── NEX-048 y superficie de la emisión
  const m48 = leer("documentacao/banco/nexit/v1/migraciones/NEX-048-facturacion-emision-fe.sql");
  const r48 = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-048.sql");
  const sc48 = m48.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  const f48 = sc48.slice(sc48.indexOf("CREATE OR REPLACE FUNCTION public.fe_documento_crear_fe"), sc48.indexOf("CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_facturacion_emision"));

  cierto("NEX-048: exige NEX-047, no reaplica, crea el permiso CREAR y solo-lectura para el runtime (más EXECUTE de la función)", /NEX-048 requiere NEX-047/.test(m48) && /NEX-048 parece aplicada/.test(m48) && /'FACTURACION_ELECTRONICA\.CREAR'/.test(m48) && /GRANT SELECT ON public\.fe_puntos_expedicion, public\.documento_electronico_solicitudes TO nexit_runtime/.test(m48) && !/GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*TO nexit_runtime/i.test(m48) && !/perfil_permiso/.test(sc48));
  cierto("NEX-048: la creación valida permiso, clave, payload y sucursal ANTES de reservar el número; reserva con FOR UPDATE; el número se escribe en el payload y no se acepta cdc ni dNumDoc del cliente", f48.indexOf("'FACTURACION_ELECTRONICA', 'CREAR'") > 0 && f48.indexOf("NEX:PAYLOAD_INVALIDO") < f48.indexOf("FOR UPDATE") && f48.indexOf("NEX:SUCURSAL_INVALIDA") < f48.indexOf("FOR UPDATE") && f48.indexOf("NEX:CLIENTE_INVALIDO") < f48.indexOf("FOR UPDATE") && f48.indexOf("FOR UPDATE") < f48.indexOf("UPDATE public.fe_puntos_expedicion SET ultimo_numero") && /p_payload \? 'cdc' OR p_payload \? 'dNumDoc'/.test(f48) && /'dEst', v_est, 'dPunExp', v_punto\.codigo, 'dNumDoc', v_numero/.test(f48));
  cierto("NEX-048: idempotencia — misma clave y contenido devuelve el documento SIN consumir número; otro contenido se rechaza; documento y solicitud nacen en la misma transacción", f48.indexOf("clave_idempotencia = p_clave") < f48.indexOf("FOR UPDATE") && /NEX:IDEMPOTENCIA_CONFLICTO/.test(f48) && /s\.entrada_hash = v_entrada/.test(f48) && f48.indexOf("INSERT INTO public.documentos_electronicos") < f48.indexOf("INSERT INTO public.documento_electronico_solicitudes") && /RETURN QUERY SELECT v_previo\.id, v_previo\.numero, true/.test(f48));
  cierto("NEX-048: el total del documento debe coincidir con dTotGralOpe del payload; estado inicial pendiente de envío; sin CDC; sin tocar stock", /\(p_payload->'Subtotales'->0->>'dTotGralOpe'\)::numeric IS DISTINCT FROM p_total/.test(f48) && !/estado_local|estado_sifen/.test(f48.slice(f48.indexOf("INSERT INTO public.documentos_electronicos"), f48.indexOf("RETURNING id INTO v_id"))) && !/cdc/.test(f48.slice(f48.indexOf("INSERT INTO public.documentos_electronicos"), f48.indexOf("RETURNING id INTO v_id"))) && !/movimientos_inventario|stock_saldos/.test(sc48));
  cierto("NEX-048: puntos de expedición con identidad inmutable y numeración que nunca retrocede; solicitudes inmutables; la reversión aborta si hay solicitudes, numeración usada o el permiso asignado", /la numeración de un punto de expedición nunca retrocede/.test(m48) && /NEW\.ultimo_numero < OLD\.ultimo_numero/.test(m48) && /documento_electronico_solicitudes_inmutable_trg/.test(m48) && /hay solicitudes de emisión registradas/.test(r48) && /ultimo_numero > 0/.test(r48) && /FACTURACION_ELECTRONICA\.CREAR/.test(r48) && r48.indexOf("RAISE EXCEPTION") < r48.indexOf("DROP TABLE"));
  cierto("NEX-048: ninguna migración inserta puntos de expedición ni timbrados (la numeración inicial la fija el responsable); el wrapper de grants incluye facturación y emisión", !/INSERT INTO public\.fe_puntos_expedicion/.test(sc48) && /PERFORM public\.nex_aplicar_grants_facturacion\(\);\s+PERFORM public\.nex_aplicar_grants_facturacion_emision\(\);/.test(m48));
  const apiFacturas = leer("app/api/facturas/route.ts");
  const emisionTs = leer("lib/facturacion/emision.ts");
  const formulario = leer("app/(private)/facturas/nueva/page.tsx");

  cierto("API de emisión: exige CREAR y toma empresa/usuario de la sesión; la validación y creación (emision.ts) no conoce el gateway: solo envio.ts transmite", /prepararFacturacion\("CREAR"\)/.test(apiFacturas) && !/gateway/.test(emisionTs.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")) && /enviarDocumentoGateway/.test(leer("lib/facturacion/envio.ts")) && /b\.empresaId, b\.usuarioId/.test(apiFacturas));
  cierto("formulario: el navegador solo envía ids, cantidades y forma de pago (nunca precio, IVA ni total), con clave de idempotencia por operación, sin localStorage y con protección de cambios", /claveIdempotencia: clave/.test(formulario) && /crypto\.randomUUID\(\)/.test(formulario) && !/precio:|total:|afectacion:/.test(formulario.slice(formulario.indexOf("const cuerpoFactura"), formulario.indexOf("const cuerpoFactura") + 520)) && !/localStorage/.test(formulario) && /useProtegerCambios/.test(formulario));

  // ══ F-02 completa: Grabar → resumen → Enviar → envío por el backend ═══════════════════════════════════════════════════════════════════════════════
  const DOC_ENVIO = { tipo: "FE", establecimiento: "001", puntoExpedicion: "002", numero: "0050000" };
  const CDC_FE = "01" + "80000005" + "6" + "001" + "002" + "0050000" + "1" + "20261012" + "1" + "123456789" + "0"; // coherente con DOC_ENVIO
  const PAYLOAD_ENVIO = { iTiDE: 1, dEst: "001", dPunExp: "002", dNumDoc: "0050000", dSerieNum: null, Subtotales: [{ dTotGralOpe: 11000 }] };
  const bodyRecepcion = (g: ReturnType<typeof gateway>) => g.llamadas.filter((l) => l.url.endsWith("/api/recepcion_de"));
  const resultadoDe = (r: unknown) => r as import("@/lib/facturacion/gateway").ResultadoEnvio;

  // ── Interpretación de recepcion_de (sin inventar su forma)
  const exito = interpretarRecepcion(200, JSON.stringify({ status: "success", message: "Documento recibido", cdc: CDC_FE }), [], DOC_ENVIO);
  const sinIdentificar = interpretarRecepcion(200, JSON.stringify({ status: "success", message: "Documento recibido" }), [], DOC_ENVIO);

  igual("recepción: 2xx success con CDC coherente con el documento → recepción confirmada (ENVIADO); el CDC y el mensaje son los informados y no hay estado fiscal", [exito.resultado, exito.estadoLocal, exito.lote, exito.cdc, exito.estadoGateway, exito.mensaje], ["OK", "ENVIADO", null, CDC_FE, null, "Documento recibido"]);
  igual("recepción: 2xx success que NO identifica el documento (solo mensaje, sin lote/CDC/número) NO confirma la recepción → ENVIO_INDETERMINADO", [sinIdentificar.resultado, sinIdentificar.estadoLocal, sinIdentificar.lote, sinIdentificar.cdc, sinIdentificar.errorTipo], ["RESPUESTA_INVALIDA", "ENVIO_INDETERMINADO", null, null, null]);
  igual("recepción: sin conocer el documento enviado ninguna respuesta puede certificar la recepción", interpretarRecepcion(200, JSON.stringify({ status: "success", cdc: CDC_FE })).estadoLocal, "ENVIO_INDETERMINADO");
  igual("recepción: número devuelto (dEst/dPunExp/dNumDoc) igual al enviado confirma; distinto o CDC de otro documento → indeterminado (nunca éxito)", [
    interpretarRecepcion(200, JSON.stringify({ status: "success", data: { dEst: "001", dPunExp: "002", dNumDoc: "0050000" } }), [], DOC_ENVIO).estadoLocal,
    interpretarRecepcion(200, JSON.stringify({ status: "success", data: { dEst: "001", dPunExp: "002", dNumDoc: "0050001" } }), [], DOC_ENVIO).estadoLocal,
    interpretarRecepcion(200, JSON.stringify({ status: "success", cdc: CDC }), [], DOC_ENVIO).estadoLocal,
    interpretarRecepcion(200, JSON.stringify({ status: "success", cdc: CDC }), [], DOC_ENVIO).cdcInformado,
  ], ["ENVIADO", "ENVIO_INDETERMINADO", "ENVIO_INDETERMINADO", CDC]);
  igual("recepción 4xx: 400/422/404 → rechazo seguro (RECHAZO); 401/403 → AUTENTICACION; 429 → TRANSITORIO", [400, 422, 404, 401, 403, 429].map((h) => interpretarRecepcion(h, JSON.stringify({ message: "x" }), [], DOC_ENVIO)).map((r) => [r.estadoLocal, r.errorTipo]), [["ERROR_ENVIO", "RECHAZO"], ["ERROR_ENVIO", "RECHAZO"], ["ERROR_ENVIO", "RECHAZO"], ["ERROR_ENVIO", "AUTENTICACION"], ["ERROR_ENVIO", "AUTENTICACION"], ["ERROR_ENVIO", "TRANSITORIO"]]);
  igual("recepción 4xx ambiguos (408/409/423/425) y mensajes de duplicado/«ya existe» → ENVIO_INDETERMINADO (posible duplicidad), jamás reintentable", [
    ...[408, 409, 423, 425].map((h) => interpretarRecepcion(h, "{}", [], DOC_ENVIO).estadoLocal),
    interpretarRecepcion(400, JSON.stringify({ message: "Documento duplicado" }), [], DOC_ENVIO).estadoLocal,
    interpretarRecepcion(422, JSON.stringify({ errors: ["El documento ya existe"] }), [], DOC_ENVIO).estadoLocal,
    interpretarRecepcion(200, JSON.stringify({ status: "error", message: "Número ya registrado previamente" }), [], DOC_ENVIO).estadoLocal,
  ], Array(7).fill("ENVIO_INDETERMINADO"));
  igual("recepción: el lote solo aparece si la respuesta lo trae (búsqueda tolerante por nombre) y el CDC solo si es válido", (() => { const a = interpretarRecepcion(200, JSON.stringify({ status: "success", data: { NroLote: 12345, CDC: CDC_FE } }), [], DOC_ENVIO); const b = interpretarRecepcion(200, JSON.stringify({ status: "success", cdc: "123" }), [], DOC_ENVIO); return [a.lote, a.cdc, b.cdc]; })(), ["12345", CDC_FE, null]);
  igual("recepción: 2xx con status error → rechazo informado (ERROR_ENVIO) con sus errores de validación", (() => { const r = interpretarRecepcion(200, JSON.stringify({ status: "error", message: "Validación fallida", errors: ["dRucRec inválido", { campo: "dDVRec", detalle: "DV incorrecto" }] })); return [r.resultado, r.estadoLocal, r.mensaje, r.errores.length, r.errores[0]]; })(), ["ERROR_HTTP", "ERROR_ENVIO", "Validación fallida", 2, "dRucRec inválido"]);
  igual("recepción: 4xx → ERROR_ENVIO (no hubo recepción); 5xx → ENVIO_INDETERMINADO; 2xx sin forma reconocible o no JSON → ENVIO_INDETERMINADO", [
    interpretarRecepcion(400, JSON.stringify({ message: "Datos inválidos" })).estadoLocal, interpretarRecepcion(422, "{}").estadoLocal, interpretarRecepcion(500, "boom").estadoLocal,
    interpretarRecepcion(200, "<html>").estadoLocal, interpretarRecepcion(200, JSON.stringify({ ok: true })).estadoLocal, interpretarRecepcion(200, "[]").estadoLocal,
  ], ["ERROR_ENVIO", "ERROR_ENVIO", "ENVIO_INDETERMINADO", "ENVIO_INDETERMINADO", "ENVIO_INDETERMINADO", "ENVIO_INDETERMINADO"]);
  igual("recepción: la respuesta guardada está saneada (sin token ni clave)", JSON.stringify(interpretarRecepcion(200, JSON.stringify({ status: "success", token: TOKEN, password: SECRETO })).respuesta).includes(TOKEN) || JSON.stringify(interpretarRecepcion(200, JSON.stringify({ status: "success", password: SECRETO })).respuesta).includes(SECRETO), false);

  // ── Transporte del envío (fetch simulado)
  limpiarCacheTokens();
  const ge1 = gateway({ consulta: [{ status: 200, cuerpo: { status: "success", message: "ok", lote: "L-77", cdc: CDC_FE } }] });
  const e1 = resultadoDe(await enviarDocumentoGateway(CONFIG, PAYLOAD_ENVIO, DOC_ENVIO, { fetch: ge1.fetch, env: ENV }));

  igual("envío: login y luego POST /api/recepcion_de con Bearer y el payload TAL CUAL se guardó (sin campos añadidos)", [ge1.llamadas.map((l) => l.url.replace(CONFIG.baseUrl, "")), bodyRecepcion(ge1)[0].headers.Authorization, bodyRecepcion(ge1)[0].body], [["/api/login", "/api/recepcion_de"], `Bearer ${TOKEN}`, PAYLOAD_ENVIO]);
  igual("envío: fases autenticación → transmisión (HTTP) → respuesta, lote informado y estado local ENVIADO", [e1.fases.map((f) => `${f.fase}:${f.ok}`), e1.fases[1].http, e1.lote, e1.estadoLocal, e1.faseFinal], [["AUTENTICACION:true", "TRANSMISION:true", "RESPUESTA:true"], 200, "L-77", "ENVIADO", "TRANSMISION"]);
  igual("envío: el resultado nunca contiene clave ni token", [JSON.stringify(e1).includes(SECRETO), JSON.stringify(e1).includes(TOKEN)], [false, false]);

  limpiarCacheTokens();
  const ge2 = gateway({ consulta: [{ status: 401, cuerpo: {} }, { status: 200, cuerpo: { status: "success", cdc: CDC_FE } }] });
  const e2 = resultadoDe(await enviarDocumentoGateway(CONFIG, PAYLOAD_ENVIO, DOC_ENVIO, { fetch: ge2.fetch, env: ENV }));

  igual("envío: ante 401 renueva la sesión UNA vez y reintenta (un 401 no procesó nada)", [e2.estadoLocal, ge2.llamadas.map((l) => l.url.replace(CONFIG.baseUrl, ""))], ["ENVIADO", ["/api/login", "/api/recepcion_de", "/api/login", "/api/recepcion_de"]]);

  limpiarCacheTokens();
  const ge3 = gateway({ consulta: ["TIMEOUT"] });
  const ge4 = gateway({ consulta: ["RED"] });
  const e3 = resultadoDe(await enviarDocumentoGateway(CONFIG, PAYLOAD_ENVIO, DOC_ENVIO, { fetch: ge3.fetch, env: ENV }));
  limpiarCacheTokens();
  const e4 = resultadoDe(await enviarDocumentoGateway(CONFIG, PAYLOAD_ENVIO, DOC_ENVIO, { fetch: ge4.fetch, env: ENV }));

  igual("envío: timeout o error de red DESPUÉS de transmitir → ENVIO_INDETERMINADO (jamás reenvío ciego)", [e3.resultado, e3.estadoLocal, e4.resultado, e4.estadoLocal], ["TIMEOUT", "ENVIO_INDETERMINADO", "RED", "ENVIO_INDETERMINADO"]);

  limpiarCacheTokens();
  const ge5 = gateway({ login: [{ status: 401, cuerpo: { status: "error", message: `clave ${SECRETO}` } }], consulta: [] });
  const e5 = resultadoDe(await enviarDocumentoGateway(CONFIG, PAYLOAD_ENVIO, DOC_ENVIO, { fetch: ge5.fetch, env: ENV }));

  igual("envío: falla de autenticación → nada se transmite, fase AUTENTICACION, ERROR_ENVIO (reintentable) y sin filtrar la clave", [e5.faseFinal, e5.estadoLocal, bodyRecepcion(ge5).length, JSON.stringify(e5).includes(SECRETO), e5.fases[0].ok], ["AUTENTICACION", "ERROR_ENVIO", 0, false, false]);

  limpiarCacheTokens();
  const ge6 = gateway({ consulta: [{ status: 400, cuerpo: { status: "error", message: "dRucRec inválido", errors: ["dRucRec: formato"] } }] });
  const e6 = resultadoDe(await enviarDocumentoGateway(CONFIG, PAYLOAD_ENVIO, DOC_ENVIO, { fetch: ge6.fetch, env: ENV }));

  igual("envío: rechazo 400 del gateway → ERROR_ENVIO con mensaje y errores de validación visibles, HTTP 400, sin lote", [e6.estadoLocal, e6.http, e6.mensaje, e6.errores, e6.lote], ["ERROR_ENVIO", 400, "dRucRec inválido", ["dRucRec: formato"], null]);
  igual("envío: sin credenciales no se llama a nadie", await enviarDocumentoGateway(CONFIG, PAYLOAD_ENVIO, DOC_ENVIO, { fetch: gateway({ consulta: [] }).fetch, env: {} }), { sinContrato: "CREDENCIALES" });

  // ── Previa («Grabar»): sin escrituras ni numeración
  const consultasPrevia: string[] = [];
  const dbPrevia = dbCrear();
  const espia = { async query(sql: string, parametros: unknown[] = []) { consultasPrevia.push(sql); return (dbPrevia as unknown as { query: (s: string, p?: unknown[]) => Promise<unknown> }).query(sql, parametros); } } as never;
  const previa = await prepararFactura(espia, EMPRESA, USUARIO, leerCuerpoFactura(cuerpo()) as never);

  igual("previa: calcula y valida en el servidor sin tocar funciones de escritura ni reservar número", [consultasPrevia.some((q) => /fe_documento_crear_fe|fe_documento_iniciar_envio|fe_documento_registrar|INSERT|UPDATE/i.test(q)), previa.resumen.numero, previa.resumen.punto, previa.resumen.establecimiento], [false, "Se asigna al enviar la factura", "002", "001"]);
  igual("previa: el resumen trae empresa, sucursal, cliente, líneas con precio/IVA/total y totales calculados por el servidor", [previa.resumen.empresa, previa.resumen.cliente.razonSocial, previa.resumen.lineas[0], previa.resumen.totales.total, previa.resumen.totales.iva10, previa.resumen.formaPago], ["EMPRESA SINTETICA", "EMPRESA SINTETICA SA", { codigo: "P-1", descripcion: "Producto de prueba", cantidad: "1", precio: "11000", afectacion: 1, tasa: 10, total: 11000 }, 11000, 1000, "Efectivo"]);
  igual("previa: el JSON a enviar coincide con lo mostrado (mismo total e IVA)", [(previa.payload as unknown as { Subtotales: Array<Record<string, unknown>> }).Subtotales[0].dTotGralOpe, (previa.payload as unknown as { Subtotales: Array<Record<string, unknown>> }).Subtotales[0].dTotIVA], [previa.resumen.totales.total, previa.resumen.totales.iva10]);
  igual("previa: el punto de expedición ajeno/inactivo o la sucursal fuera de alcance se rechaza", await (async () => { try { await prepararFactura(dbCrear({ sinPunto: true }), EMPRESA, USUARIO, leerCuerpoFactura(cuerpo()) as never); return "sin error"; } catch (e) { return e instanceof ErrorFacturacion ? e.estado : -1; } })(), 422);

  // ── Emisión completa: preflight → crear → iniciar → transmitir → registrar
  type SqlEnvio = { sql: string; parametros: unknown[] };
  const mkDb = (o: { cfg?: boolean; inicio?: string; crearError?: string; reutilizado?: boolean; iniciarDetalle?: string } = {}) => {
    const llamadas: SqlEnvio[] = [];
    const base = dbCrear() as unknown as { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[] }> };
    const db = {
      async query(sql: string, parametros: unknown[] = []) {
        llamadas.push({ sql, parametros });
        if (/FROM fe_gateway_config/.test(sql)) return { rows: o.cfg === false ? [] : [{ baseUrl: CONFIG.baseUrl, credencialRef: CONFIG.credencialRef, timeoutMs: 1000 }] };
        if (/fe_documento_crear_fe/.test(sql)) return { rows: [{ documentoId: DOC, numero: "0050000", reutilizado: o.reutilizado === true }] };
        if (/fe_documento_iniciar_envio/.test(sql)) {
          if (o.iniciarDetalle) throw Object.assign(new Error("estado"), { detail: o.iniciarDetalle });

          return { rows: [{ resultado: o.inicio ?? "INICIADO", payload: o.inicio === "INDETERMINADO" ? null : PAYLOAD_ENVIO, numero: "0050000", tipo: "FE", establecimiento: "001", punto: "002" }] };
        }
        if (/fe_documento_registrar_envio/.test(sql)) return { rows: [{ fe_documento_registrar_envio: parametros[5] }] };

        return base.query(sql, parametros);
      },
    } as never;

    return { db, llamadas };
  };
  const ejecutar = (db: never, fetchSim: FetchLike, env: Record<string, string | undefined> = ENV) => emitirFactura(db, EMPRESA, USUARIO, leerCuerpoFactura(cuerpo()) as never, { fetch: fetchSim, env });
  const orden = (l: SqlEnvio[]) => l.map((x) => (/fe_gateway_config/.test(x.sql) ? "config" : /fe_documento_crear_fe/.test(x.sql) ? "crear" : /fe_documento_iniciar_envio/.test(x.sql) ? "iniciar" : /fe_documento_registrar_envio/.test(x.sql) ? "registrar" : "otro")).filter((x) => x !== "otro");

  limpiarCacheTokens();
  const gE = gateway({ consulta: [{ status: 200, cuerpo: { status: "success", message: "Recibido", cdc: CDC_FE } }] });
  const m1 = mkDb();
  const em = await ejecutar(m1.db, gE.fetch);

  igual("emisión: orden config → crear → iniciar envío → registrar envío, con una sola transmisión", [orden(m1.llamadas), bodyRecepcion(gE).length], [["config", "crear", "config", "iniciar", "registrar"], 1]);
  igual("emisión: respuesta con documento, número reservado, estado ENVIADO, HTTP 200, sin lote inventado; CDC solo el informado y coherente", [em.documentoId, em.numero, em.reutilizado, em.estadoLocal, em.resultado, em.http, em.lote, em.cdc, em.fases.length], [DOC, "0050000", false, "ENVIADO", "OK", 200, null, CDC_FE, 3]);
  const reg = m1.llamadas.find((l) => /fe_documento_registrar_envio/.test(l.sql))!;

  igual("emisión: registra fase TRANSMISION, resultado OK, estado ENVIADO, HTTP 200 con empresa/usuario de la sesión; no envía estado SIFEN", [reg.parametros.slice(0, 6), reg.parametros[7], /estado_sifen/i.test(reg.sql)], [[EMPRESA, USUARIO, DOC, "TRANSMISION", "OK", "ENVIADO"], 200, false]);
  igual("emisión: el payload transmitido es exactamente el guardado en la solicitud (el de la base), no uno reconstruido", bodyRecepcion(gE)[0].body, PAYLOAD_ENVIO);

  const antesSql = (db: { llamadas: SqlEnvio[] }) => orden(db.llamadas);
  const mSinCfg = mkDb({ cfg: false });
  const codigo = async (p: Promise<unknown>) => { try { await p; return 0; } catch (e) { return e instanceof ErrorFacturacion ? e.estado : -1; } };

  igual("emisión: sin gateway configurado o sin credenciales NO se reserva número (409 antes de crear)", [await codigo(ejecutar(mSinCfg.db, gateway({ consulta: [] }).fetch)), antesSql(mSinCfg).includes("crear"), await codigo(ejecutar(mkDb().db, gateway({ consulta: [] }).fetch, {}))], [409, false, 409]);

  limpiarCacheTokens();
  const gR = gateway({ consulta: [] });
  const mYa = mkDb({ reutilizado: true, iniciarDetalle: "NEX:YA_ENVIADO" });
  const ya = await ejecutar(mYa.db, gR.fetch);

  igual("emisión: repetir una operación ya enviada devuelve el documento (reutilizado) SIN transmitir de nuevo", [ya.resultado, ya.reutilizado, ya.numero, bodyRecepcion(gR).length, gR.llamadas.length], ["YA_ENVIADO", true, "0050000", 0, 0]);

  igual("emisión: envío en curso o indeterminado → 409 indicando el número, sin transmitir", [
    await codigo(ejecutar(mkDb({ iniciarDetalle: "NEX:ENVIO_EN_CURSO" }).db, gR.fetch)), await codigo(ejecutar(mkDb({ inicio: "INDETERMINADO" }).db, gR.fetch)), gR.llamadas.length,
  ], [409, 409, 0]);

  limpiarCacheTokens();
  const mErr = mkDb();
  const gErr = gateway({ consulta: [{ status: 400, cuerpo: { status: "error", message: "Rechazado", errors: ["x"] } }] });
  const emErr = await ejecutar(mErr.db, gErr.fetch);

  igual("emisión: rechazo del gateway → ERROR_ENVIO persistido con HTTP 400 y errores devueltos para el modal", [emErr.estadoLocal, emErr.http, emErr.errores, mErr.llamadas.find((l) => /fe_documento_registrar_envio/.test(l.sql))!.parametros.slice(3, 8)], ["ERROR_ENVIO", 400, ["x"], ["TRANSMISION", "ERROR_HTTP", "ERROR_ENVIO", "RECHAZO", 400]]);

  limpiarCacheTokens();
  const mTo = mkDb();
  const emTo = await ejecutar(mTo.db, gateway({ consulta: ["TIMEOUT"] }).fetch);

  igual("emisión: timeout al transmitir → ENVIO_INDETERMINADO persistido (no reenvía; el reintento queda bloqueado por la base)", [emTo.estadoLocal, emTo.resultado, mTo.llamadas.find((l) => /fe_documento_registrar_envio/.test(l.sql))!.parametros[5]], ["ENVIO_INDETERMINADO", "TIMEOUT", "ENVIO_INDETERMINADO"]);

  limpiarCacheTokens();
  const mAu = mkDb();
  const emAu = await ejecutar(mAu.db, gateway({ login: [{ status: 401, cuerpo: { status: "error" } }], consulta: [] }).fetch);

  igual("emisión: falla de autenticación → ERROR_ENVIO en fase AUTENTICACION (documento conservado, reintentable)", [emAu.estadoLocal, mAu.llamadas.find((l) => /fe_documento_registrar_envio/.test(l.sql))!.parametros[3], emAu.fases[0].ok], ["ERROR_ENVIO", "AUTENTICACION", false]);

  // ── NEX-049 y reglas de numeración
  const m49 = leer("documentacao/banco/nexit/v1/migraciones/NEX-049-facturacion-envio-fe.sql");
  const r49 = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-049.sql");
  const sc49 = m49.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  const ini49 = sc49.slice(sc49.indexOf("CREATE OR REPLACE FUNCTION public.fe_documento_iniciar_envio"), sc49.indexOf("CREATE OR REPLACE FUNCTION public.fe_documento_registrar_envio"));
  const reg49 = sc49.slice(sc49.indexOf("CREATE OR REPLACE FUNCTION public.fe_documento_registrar_envio"), sc49.indexOf("CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_facturacion_envio"));

  cierto("NEX-049: incremental (no toca 047/048), exige NEX-048, no reaplica; ENVIANDO en el CHECK; lote y envio_iniciado_at; fase en intentos", /NEX-049 requiere NEX-048/.test(m49) && /NEX-049 parece aplicada/.test(m49) && /'PENDIENTE_ENVIO','ENVIANDO','ENVIO_INDETERMINADO','ENVIADO','ERROR_ENVIO'/.test(m49) && /ADD COLUMN envio_iniciado_at timestamptz/.test(m49) && /fase IN \('AUTENTICACION','TRANSMISION','CONSULTA'\)/.test(m49) && !/ENVIANDO/.test(leer("documentacao/banco/nexit/v1/migraciones/NEX-047-facturacion-documentos-electronicos.sql")) && !/envio_iniciado_at/.test(leer("documentacao/banco/nexit/v1/migraciones/NEX-048-facturacion-emision-fe.sql")));
  cierto("NEX-049: iniciar envío exige CREAR, bloquea la fila y solo avanza desde pendiente/error; ya enviado, indeterminado y en curso se rechazan; un ENVIANDO huérfano (>2 min) pasa a indeterminado y se CONFIRMA (RETURN, no excepción)", ini49.indexOf("'FACTURACION_ELECTRONICA', 'CREAR'") > 0 && ini49.indexOf("FOR UPDATE") > ini49.indexOf("'CREAR'") && /NEX:YA_ENVIADO/.test(ini49) && /NEX:ENVIO_INDETERMINADO/.test(ini49) && /NEX:ENVIO_EN_CURSO/.test(ini49) && /interval '2 minutes'/.test(ini49) && /SET estado_local = 'ENVIO_INDETERMINADO'[^;]*;\s+RETURN QUERY SELECT 'INDETERMINADO'/.test(ini49) && /solo se envían facturas electrónicas/.test(ini49));
  cierto("NEX-049: registrar envío exige que el documento esté ENVIANDO, valida resultado↔estado, guarda el intento ANTES de actualizar, fija el CDC solo si es coherente y NUNCA toca estado_sifen", /d\.estado_local <> 'ENVIANDO'/.test(reg49) && /\(p_resultado = 'OK'\) <> \(p_estado_local = 'ENVIADO'\)/.test(reg49) && reg49.indexOf("INSERT INTO public.documento_electronico_intentos") < reg49.indexOf("UPDATE public.documentos_electronicos") && /public\.fe_cdc_coherente\(tipo, establecimiento, punto_expedicion, numero, p_cdc\)/.test(reg49) && !/estado_sifen/.test(reg49.slice(reg49.indexOf("UPDATE public.documentos_electronicos"))));
  cierto("NEX-049: el runtime solo ejecuta las dos funciones; el wrapper de grants las incluye; la reversión aborta si hay envíos y restaura el CHECK anterior", /GRANT EXECUTE ON FUNCTION public\.fe_documento_iniciar_envio\(uuid, uuid, uuid\) TO nexit_runtime/.test(m49) && !/GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*TO nexit_runtime/i.test(m49) && /PERFORM public\.nex_aplicar_grants_facturacion_emision\(\);\s+PERFORM public\.nex_aplicar_grants_facturacion_envio\(\);/.test(m49) && /hay envíos registrados/.test(r49) && r49.indexOf("RAISE EXCEPTION") < r49.indexOf("DROP FUNCTION") && /CHECK \(estado_local IN \('PENDIENTE_ENVIO','ENVIO_INDETERMINADO','ENVIADO','ERROR_ENVIO'\)\)/.test(r49));
  const cfgPunto = leer("documentacao/banco/nexit/v1/scripts/configurar-punto-expedicion-prueba-NEX-048.sql");

  igual("numeración de prueba: ultimo_numero 49999 → primera factura 001-002-0050000 (la reserva suma 1 y rellena a 7 dígitos)", [String(49999 + 1).padStart(7, "0"), /v_num := v_punto\.ultimo_numero \+ 1/.test(m48), /lpad\(v_num::text, 7, '0'\)/.test(m48)], ["0050000", true, true]);
  cierto("script de configuración del punto de prueba: manual, establecimiento 001 / punto 002 / 49999, valida la sucursal, no reinicia un punto existente y no es una migración ni un valor por defecto", /'002'/.test(cfgPunto) && /49999/.test(cfgPunto) && /establecimiento_sifen IS DISTINCT FROM '001'/.test(cfgPunto) && /ya existe: no se reinicia la numeración/.test(cfgPunto) && /set_config\('nexit\.empresa'/.test(cfgPunto) && !/INSERT INTO public\.fe_puntos_expedicion[\s\S]*SELECT/.test(cfgPunto) && !existsSync(join(raiz, "documentacao/banco/nexit/v1/migraciones/NEX-050-puntos.sql")));

  // ── Pantallas
  const apiPrevia = leer("app/api/facturas/previa/route.ts");
  const apiEnviarDoc = leer("app/api/documentos/[id]/enviar/route.ts");
  const docPage = leer("app/(private)/documentos/page.tsx");
  const quitarComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  cierto("formulario: «Grabar» solo llama a la previa; el modal-resumen ofrece «Volver a editar» y «Enviar factura»; solo «Enviar factura» llama a la API de emisión", /onClick=\{grabar\}/.test(formulario) && /fetch\("\/api\/facturas\/previa"/.test(formulario) && /Volver a editar/.test(formulario) && /onClick=\{enviar\}/.test(formulario) && /fetch\("\/api\/facturas", \{ method: "POST"/.test(formulario) && formulario.split('fetch("/api/facturas", { method: "POST"').length === 2 && /role="dialog" aria-modal="true"/.test(formulario) && !/Registrar factura/.test(formulario));
  cierto("formulario: modal técnico con fases, HTTP, resultado, mensaje, errores de validación y lote/CDC solo si vienen; aclara que recibido/200 no es aprobado; sin token ni clave", /Envío al gateway \(diagnóstico de prueba\)/.test(formulario) && /resultado\.lote \?/.test(formulario) && /resultado\.errores\.length > 0/.test(formulario) && /no significan aprobado por SIFEN/.test(formulario) && /Autenticando y transmitiendo/.test(formulario) && !/token|password|Authorization|Bearer/i.test(formulario));
  cierto("formulario: la clave de idempotencia es la misma en cada reintento y el reintento de un documento existente usa el endpoint del documento (no crea ni consume número)", /claveIdempotencia: clave/.test(formulario) && /\/api\/documentos\/\$\{resultado\.documentoId\}\/enviar/.test(formulario) && /resultado\.estadoLocal === "ERROR_ENVIO"/.test(formulario));
  cierto("API: la previa no importa envío ni gateway (no puede escribir ni transmitir); la emisión usa emitirFactura; el reenvío del documento exige CREAR y alcance", !/envio|gateway/i.test(quitarComentarios(apiPrevia)) && /emitirFactura/.test(apiFacturas) && /prepararFacturacion\("CREAR"\)/.test(apiEnviarDoc) && /leerDocumento\(b\.db, b\.empresaId, b\.usuarioId, id\)/.test(apiEnviarDoc));
  cierto("Documentos electrónicos: estado «Enviando», lote, historial con tipo de intento y fase, y botón «Enviar al gateway» solo con permiso CREAR y estado pendiente/error; HTTP 200 de envío no se muestra como aprobado", /ETIQUETA_LOCAL/.test(docPage) && /ENVIANDO: "Enviando"/.test(leer("lib/facturacion/estados.ts")) && /Enviar al gateway/.test(docPage) && /crear && \(d\.estadoLocal === "PENDIENTE_ENVIO" \|\| \(d\.estadoLocal === "ERROR_ENVIO" && d\.envioErrorTipo !== "RECHAZO"\)\)/.test(docPage) && /etiquetaIntento\(i\.tipo, i\.resultado\)/.test(docPage) && /Recepción confirmada por el gateway \(estado fiscal por consultar\)/.test(leer("lib/facturacion/estados.ts")) && /d\.lote \?\? "No informado"/.test(docPage));
  cierto("el envío nunca fija estado_sifen y no mueve stock: ni envio.ts ni la API de envío mencionan estado_sifen/APROBADO ni inventario", !/estado_sifen|APROBADO|movimientos_inventario|stock_saldos/.test(quitarComentarios(leer("lib/facturacion/envio.ts") + apiEnviarDoc + apiFacturas)));

  // ══ Decisiones 47ff44c / AUD-FE-CAMPOS: fixture sintética equivalente al JSON funcional ═════════════════════════════════════════════════════════════
  const lineasEjemplo = [linea({ codigoInterno: "A", precio: "24600" }), linea({ codigoInterno: "B", precio: "24600" }), linea({ codigoInterno: "C", precio: "58100" })];
  const pagoEjemplo = [{ tipo: 1, monto: "107300" }];
  const ejemploFE = construirPayloadFE(entradaFE({ lineas: lineasEjemplo, pagos: pagoEjemplo })) as Record<string, unknown>;
  const subEj = (ejemploFE.Subtotales as Array<Record<string, number>>)[0];

  igual("AUD-FE-01: fixture del JSON funcional — total 107300, IVA 9754.54545454, base 97545.45454546 y dLiqTotIVA10 = IVA (no 0)", [subEj.dTotGralOpe, subEj.dSub10, subEj.dIVA10, subEj.dLiqTotIVA10, subEj.dTotIVA, subEj.dBaseGrav10, subEj.dTBasGraIVA, subEj.dTotalGs, subEj.dLiqTotIVA5, subEj.dIVA5], [107300, 107300, 9754.54545454, 9754.54545454, 9754.54545454, 97545.45454546, 97545.45454546, 107300, 0, 0]);
  igual("AUD-FE-01: ítems del ejemplo (24.600 → base 22363.63636364 / IVA 2236.36363636; 58.100 → 52818.18181818 / 5281.81818182)", (ejemploFE.Detalles as Array<Record<string, number>>).map((d) => [d.dTotOpeItem, d.dBasGravIVA, d.dLiqIVAItem]), [[24600, 22363.63636364, 2236.36363636], [24600, 22363.63636364, 2236.36363636], [58100, 52818.18181818, 5281.81818182]]);
  igual("AUD-FE-01: al 5 % dLiqTotIVA5 = dIVA5 (coherente con el total de IVA)", (() => { const p = construirPayloadFE(entradaFE({ lineas: [linea({ precio: "10500", tasa: 5 })], pagos: [{ tipo: 1, monto: "10500" }] })) as { Subtotales: Array<Record<string, number>> }; return [p.Subtotales[0].dIVA5, p.Subtotales[0].dLiqTotIVA5, p.Subtotales[0].dLiqTotIVA10, p.Subtotales[0].dTotIVA]; })(), [500, 500, 0, 500]);
  igual("AUD-FE-02: dDVRec y dNumCasRec viajan como NÚMERO; RUC sin DV como texto", [typeof ejemploFE.dDVRec, ejemploFE.dDVRec, typeof ejemploFE.dNumCasRec, ejemploFE.dNumCasRec, ejemploFE.dRucRec], ["number", 6, "number", 123, "80000005"]);
  igual("número de casa: se conserva el del cadastro; 0 solo si no hay uno utilizable (primera prueba); sin dirección, null", [
    (construirPayloadFE(entradaFE({ receptor: { ...receptor, numeroCasa: "45" } })) as Record<string, unknown>).dNumCasRec,
    (construirPayloadFE(entradaFE({ receptor: { ...receptor, numeroCasa: "" } })) as Record<string, unknown>).dNumCasRec,
    (construirPayloadFE(entradaFE({ receptor: { ...receptor, numeroCasa: "S/N" } })) as Record<string, unknown>).dNumCasRec,
    (construirPayloadFE(entradaFE({ receptor: { ...receptor, direccion: "", numeroCasa: "" } })) as Record<string, unknown>).dNumCasRec,
  ], [45, 0, 0, null]);
  cierto("AUD-FE-03: no se envían tags de localización no presentes en el JSON funcional (cDepRec/cDisRec/cCiuRec) ni se inventan opcionales", !("cDepRec" in ejemploFE) && !("cDisRec" in ejemploFE) && !("cCiuRec" in ejemploFE));
  igual("pago: solo Efectivo (iTiPago 1) por el total; cualquier otra forma se rechaza en la validación y en el backend", [
    (ejemploFE.FormaPago as Array<Record<string, unknown>>), /forma de pago no es válida/.test(errorDe(entradaFE({ pagos: [{ tipo: 2, monto: "11000" }] }))),
    await rechaza(dbCrear(), cuerpo({ pagos: [{ tipo: 3 }] })),
  ], [[{ iTiPago: 1, dMonTiPag: 107300, cMoneTiPag: "PYG", dTiCamTiPag: null }], true, "422:La forma de pago no es válida."]);

  igual("catálogo del formulario: la lista de formas de pago ofrece únicamente Efectivo", JSON.stringify(FORMAS_PAGO), '{"1":"Efectivo"}');
  cierto("cliente fiscalmente incompleto: la emisión se bloquea con los pendientes de aptitud SIFEN, sin completar valores inventados", /evaluarAptitudCliente/.test(emisionTs) && /datos fiscales pendientes de regularizar/.test(emisionTs));
  // ══ AUD-FE-F02: clasificación segura, control de reenvío, lote/CDC y emisión indeterminada ═══════════════════════════════════════════════════════════
  const regDe = (m: { llamadas: SqlEnvio[] }) => m.llamadas.find((l) => /fe_documento_registrar_envio/.test(l.sql))!.parametros;

  // ENV-01: éxito sin certificar el documento → indeterminado persistido, con lote conservado
  limpiarCacheTokens();
  const mSin = mkDb();
  const emSin = await ejecutar(mSin.db, gateway({ consulta: [{ status: 200, cuerpo: { status: "success", message: "ok" } }] }).fetch);

  igual("ENV-01: éxito del gateway que no identifica el documento → ENVIO_INDETERMINADO persistido (RESPUESTA_INVALIDA), sin lote ni CDC", [emSin.estadoLocal, emSin.resultado, emSin.lote, emSin.cdc, regDe(mSin).slice(3, 8), regDe(mSin)[11]], ["ENVIO_INDETERMINADO", "RESPUESTA_INVALIDA", null, null, ["TRANSMISION", "RESPUESTA_INVALIDA", "ENVIO_INDETERMINADO", null, 200], null]);
  igual("ENV-01: la fase de respuesta del modal NO dice que la recepción esté confirmada", emSin.fases.at(-1), { fase: "RESPUESTA", ok: false, detalle: "Recepción NO confirmada: El gateway respondió sin identificar el documento recibido (sin lote, CDC ni número): no se confirma la recepción; verifique en el gateway antes de reenviar.", http: 200 });

  // PERSISTENCIA lote/CDC: CDC coherente informado → documento y evidencia; CDC ajeno → solo evidencia y documento indeterminado
  limpiarCacheTokens();
  const mOk = mkDb();
  const emOk = await ejecutar(mOk.db, gateway({ consulta: [{ status: 200, cuerpo: { status: "success", lote: "L-5", cdc: CDC_FE } }] }).fetch);

  igual("persistencia: CDC coherente y lote del gateway viajan a la función (p_cdc = p_cdc_informado) y se devuelven; error_tipo nulo", [emOk.estadoLocal, emOk.lote, emOk.cdc, regDe(mOk)[6], regDe(mOk)[11], regDe(mOk)[12], regDe(mOk)[13]], ["ENVIADO", "L-5", CDC_FE, null, "L-5", CDC_FE, CDC_FE]);

  limpiarCacheTokens();
  const mAj = mkDb();
  const emAj = await ejecutar(mAj.db, gateway({ consulta: [{ status: 200, cuerpo: { status: "success", lote: "L-6", cdc: CDC } }] }).fetch);

  igual("persistencia: un CDC que no corresponde al documento NO se guarda en él (p_cdc nulo), queda como evidencia (p_cdc_informado) y el envío es indeterminado", [emAj.estadoLocal, regDe(mAj)[12], regDe(mAj)[13], emAj.cdc], ["ENVIO_INDETERMINADO", null, CDC, null]);

  // ENV-02: rechazo, ambiguos y autenticación
  limpiarCacheTokens();
  const mRz = mkDb();
  const emRz = await ejecutar(mRz.db, gateway({ consulta: [{ status: 422, cuerpo: { message: "Validación", errors: ["dRucRec"] } }] }).fetch);

  igual("ENV-02: 422 de validación → ERROR_ENVIO con causa RECHAZO persistida (reenvío exige confirmación) y número conservado", [emRz.estadoLocal, emRz.errorTipo, regDe(mRz)[6], emRz.numero], ["ERROR_ENVIO", "RECHAZO", "RECHAZO", "0050000"]);

  limpiarCacheTokens();
  const mDu = mkDb();
  const emDu = await ejecutar(mDu.db, gateway({ consulta: [{ status: 409, cuerpo: { message: "Conflicto" } }] }).fetch);

  igual("ENV-02: 409 (posible duplicidad) → ENVIO_INDETERMINADO sin causa de error: no se puede reenviar", [emDu.estadoLocal, emDu.errorTipo, regDe(mDu)[6]], ["ENVIO_INDETERMINADO", null, null]);

  limpiarCacheTokens();
  const mTr = mkDb();
  const emTr = await ejecutar(mTr.db, gateway({ consulta: [{ status: 429, cuerpo: {} }] }).fetch);

  igual("ENV-02: 429 → ERROR_ENVIO TRANSITORIO (reintentable sin confirmación); falla de autenticación → AUTENTICACION", [emTr.errorTipo, regDe(mTr)[6], regDe(mAu)[6]], ["TRANSITORIO", "TRANSITORIO", "AUTENTICACION"]);

  // ENV-02/03: el reenvío tras rechazo solo con confirmación; el indeterminado nunca se reenvía; la API pasa la confirmación solo si es literalmente true
  const mConf = mkDb();
  await enviarDocumento(mConf.db, EMPRESA, USUARIO, DOC, { fetch: gateway({ consulta: [{ status: 200, cuerpo: { status: "success", cdc: CDC_FE } }] }).fetch, env: ENV }, { confirmaRechazo: true });
  const iniciar = (m: { llamadas: SqlEnvio[] }) => m.llamadas.find((l) => /fe_documento_iniciar_envio/.test(l.sql))!.parametros;

  igual("ENV-02: iniciar envío recibe la confirmación explícita (4.º parámetro) solo cuando se pide; por defecto false", [iniciar(mConf)[3], iniciar(mRz)[3]], [true, false]);

  const apiEnviar = leer("app/api/documentos/[id]/enviar/route.ts");

  cierto("ENV-02: la API de reenvío toma la confirmación solo de `confirmarRechazo === true` y exige CREAR y alcance", /confirmaRechazo: cuerpo\.confirmarRechazo === true/.test(apiEnviar) && /prepararFacturacion\("CREAR"\)/.test(apiEnviar));
  igual("ENV-02: REENVIO_REQUIERE_CONFIRMACION se informa como 409 con el número del documento en el flujo de emisión", await codigo(ejecutar(mkDb({ iniciarDetalle: "NEX:REENVIO_REQUIERE_CONFIRMACION" }).db, gateway({ consulta: [] }).fetch)), 409);

  const m50 = leer("documentacao/banco/nexit/v1/migraciones/NEX-050-facturacion-envio-control.sql");
  const r50 = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-050.sql");
  const sc50 = m50.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  const ini50 = sc50.slice(sc50.indexOf("CREATE FUNCTION public.fe_documento_iniciar_envio"), sc50.indexOf("CREATE FUNCTION public.fe_documento_registrar_envio"));
  const reg50 = sc50.slice(sc50.indexOf("CREATE FUNCTION public.fe_documento_registrar_envio"), sc50.indexOf("CREATE OR REPLACE FUNCTION public.nex_aplicar_grants_facturacion_envio"));

  cierto("NEX-050: incremental sobre NEX-049 (no la modifica), exige NEX-049, no reaplica; causa del error acotada y solo válida con ERROR_ENVIO; CDC informado de 44 dígitos como evidencia", /NEX-050 requiere NEX-049/.test(m50) && /NEX-050 parece aplicada/.test(m50) && /envio_error_tipo IN \('AUTENTICACION','RECHAZO','TRANSITORIO'\)/.test(m50) && /envio_error_tipo IS NULL OR estado_local = 'ERROR_ENVIO'/.test(m50) && /cdc_informado ~ '\^\[0-9\]\{44\}\$'/.test(m50) && !/envio_error_tipo|cdc_informado/.test(leer("documentacao/banco/nexit/v1/migraciones/NEX-049-facturacion-envio-fe.sql")));
  cierto("NEX-050: un ERROR_ENVIO por RECHAZO solo se reenvía con p_confirma_rechazo (mismo documento y número, sin generar otro); indeterminado, en curso y ya enviado siguen bloqueados; el ENVIANDO huérfano se confirma como indeterminado (RETURN)", /d\.estado_local = 'ERROR_ENVIO' AND d\.envio_error_tipo = 'RECHAZO' AND NOT coalesce\(p_confirma_rechazo, false\)/.test(ini50) && /NEX:REENVIO_REQUIERE_CONFIRMACION/.test(ini50) && /NEX:ENVIO_INDETERMINADO/.test(ini50) && /NEX:ENVIO_EN_CURSO/.test(ini50) && /NEX:YA_ENVIADO/.test(ini50) && /RETURN QUERY SELECT 'INDETERMINADO'/.test(ini50) && !/fe_documento_crear_fe|ultimo_numero/.test(ini50));
  cierto("NEX-050: registrar envío valida causa↔estado (ERROR_ENVIO exige causa; las demás no), guarda el CDC en el documento solo si es coherente, el informado como evidencia del intento, y nunca toca estado_sifen", /\(p_estado_local = 'ERROR_ENVIO'\) <> \(p_error_tipo IS NOT NULL\)/.test(reg50) && /public\.fe_cdc_coherente\(tipo, establecimiento, punto_expedicion, numero, p_cdc\)/.test(reg50) && /cdc_informado, mensaje, respuesta, actor_id\)/.test(reg50) && !/estado_sifen/.test(reg50.slice(reg50.indexOf("UPDATE public.documentos_electronicos"))));
  cierto("NEX-050: reemplaza las funciones por las firmas nuevas (DROP de las anteriores), concede EXECUTE solo a las nuevas y la reversión aborta si hay causas/CDC informados y restaura NEX-049", /DROP FUNCTION public\.fe_documento_iniciar_envio\(uuid, uuid, uuid\)/.test(m50) && /GRANT EXECUTE ON FUNCTION public\.fe_documento_registrar_envio\(uuid, uuid, uuid, text, text, text, text, integer, text, text, text, text, text, text, jsonb\) TO nexit_runtime/.test(m50) && !/GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*TO nexit_runtime/i.test(m50) && /hay causas de error de envío o CDC informados/.test(r50) && r50.indexOf("RAISE EXCEPTION") < r50.indexOf("DROP FUNCTION") && /CREATE OR REPLACE FUNCTION public\.fe_documento_iniciar_envio\(p_empresa uuid, p_usuario uuid, p_documento uuid\)/.test(r50));

  // PAYLOAD-01: identidad que añade la función SQL (tipos exactos del payload que sale hacia el gateway)
  const crear48 = sc48.slice(sc48.indexOf("v_payload := p_payload || jsonb_build_object"), sc48.indexOf("INSERT INTO public.documentos_electronicos"));

  cierto("PAYLOAD-01: la función SQL completa dEst/dPunExp/dNumDoc como TEXTO de 3/3/7 dígitos (v_est, código del punto, lpad 7), dSerieNum null y dFeEmiDE ISO local; no añade cdc ni otros campos", /'dEst', v_est, 'dPunExp', v_punto\.codigo, 'dNumDoc', v_numero, 'dSerieNum', NULL,/.test(crear48) && /to_char\(now\(\) AT TIME ZONE 'America\/Asuncion', 'YYYY-MM-DD"T"HH24:MI:SS'\)/.test(crear48) && !/cdc/.test(crear48) && /codigo\s+text\s+NOT NULL CHECK \(codigo ~ '\^\[0-9\]\{3\}\$'\)/.test(m48) && /lpad\(v_num::text, 7, '0'\)/.test(m48));

  // UX-01 / ENV-03: Documentos electrónicos y formulario
  cierto("UI: tras un rechazo por validación solo se ofrece reenviar con confirmación y se explica que no se genera otro número; el envío indeterminado muestra la necesidad de verificar en el gateway y NO ofrece reenviar", /Reenviar el mismo documento \(confirmar\)/.test(docPage) && /window\.confirm\(/.test(docPage) && /no se genera otro número/.test(docPage) && /Verifique el documento en el gateway antes de cualquier reenvío/.test(docPage) && !/ENVIO_INDETERMINADO"[^)]{0,80}enviarAlGateway/.test(docPage) && /resultado\.errorTipo !== "RECHAZO"/.test(formulario) && !/token|password|Authorization|Bearer/i.test(formulario + docPage));
  cierto("ENV-03: la consulta de estado de FE usa tipoDoc «FE» (confirmado); NCE se conserva; los demás tipos siguen sin contrato", tipoDocConsulta("FE") === "FE" && tipoDocConsulta("NCE") === "NCE" && tipoDocConsulta("NDE") === null);

  // ═ Contrato confirmado del gateway (fbc691b): consulta FE, success + nro_lote, Rechazados[], Token inválido ═══════════════════════════════════
  const LOTE_REAL = "80020653-1-001-001-0017009-20261012151546-212066495";
  const OK_REAL = { status: "success", message: "Documento recibido correctamente", nro_lote: LOTE_REAL };
  const RZ_REAL = { status: "error", message: "Se detectaron valores inválidos en algunos documentos", aceptados: 0, rechazados: 1, response: { Aceptados: [], Rechazados: [{ "001-002-0050000": { iCondOpe: "Campo obligatorio requerido." } }] } };
  const TK_REAL = { status: "error", message: "Token inválido" };
  const okLote = interpretarRecepcion(200, JSON.stringify(OK_REAL), [], DOC_ENVIO);
  const estadoDe = (http: number, cuerpo: unknown) => interpretarRecepcion(http, JSON.stringify(cuerpo), [], DOC_ENVIO).estadoLocal;

  igual("contrato: success + nro_lote (sin CDC) → recepción confirmada ENVIADO con el lote; no fabrica CDC ni estado SIFEN", [okLote.resultado, okLote.estadoLocal, okLote.lote, okLote.cdc, okLote.estadoGateway, okLote.errorTipo, okLote.mensaje], ["OK", "ENVIADO", LOTE_REAL, null, null, null, "Documento recibido correctamente"]);
  igual("contrato: success con lote vacío o de más de 60 caracteres → indeterminado (no cabe en la restricción SQL) y sin lote truncado", [estadoDe(200, { status: "success", nro_lote: "" }), estadoDe(200, { status: "success", nro_lote: "L".repeat(61) }), interpretarRecepcion(200, JSON.stringify({ status: "success", nro_lote: "L".repeat(61) }), [], DOC_ENVIO).lote], ["ENVIO_INDETERMINADO", "ENVIO_INDETERMINADO", null]);
  igual("contrato: lote con CDC ajeno o con número devuelto distinto → indeterminado aunque haya lote", [estadoDe(200, { ...OK_REAL, cdc: CDC }), estadoDe(200, { ...OK_REAL, dEst: "001", dPunExp: "002", dNumDoc: "0050001" })], ["ENVIO_INDETERMINADO", "ENVIO_INDETERMINADO"]);
  igual("contrato: success con lote pero Aceptados de otro documento → indeterminado; con el propio → ENVIADO", [estadoDe(200, { ...OK_REAL, response: { Aceptados: [{ "001-002-0050009": {} }], Rechazados: [] } }), estadoDe(200, { ...OK_REAL, response: { Aceptados: [{ "001-002-0050000": {} }], Rechazados: [] } })], ["ENVIO_INDETERMINADO", "ENVIADO"]);

  for (const http of [200, 400, 422]) {
    const rz = interpretarRecepcion(http, JSON.stringify(RZ_REAL), [], DOC_ENVIO);

    igual(`contrato: Rechazados[] (HTTP ${http}) → ERROR_ENVIO/RECHAZO con número fiscal, campo y mensaje; sin lote`, [rz.estadoLocal, rz.errorTipo, rz.errores, rz.lote, rz.mensaje], ["ERROR_ENVIO", "RECHAZO", ["001-002-0050000 · iCondOpe: Campo obligatorio requerido."], null, "Se detectaron valores inválidos en algunos documentos"]);
  }
  igual("contrato: Rechazados con número de OTRO documento (o aceptado y rechazado a la vez) no se atribuye → indeterminado, sin errores ajenos", [
    interpretarRecepcion(200, JSON.stringify({ ...RZ_REAL, response: { Aceptados: [], Rechazados: [{ "001-002-0050007": { iCondOpe: "x" } }] } }), [], DOC_ENVIO),
    interpretarRecepcion(200, JSON.stringify({ ...RZ_REAL, response: { Aceptados: [{ "001-002-0050000": {} }], Rechazados: [{ "001-002-0050000": { iCondOpe: "x" } }] } }), [], DOC_ENVIO),
  ].map((r) => [r.estadoLocal, r.errorTipo, r.errores]), [["ENVIO_INDETERMINADO", null, []], ["ENVIO_INDETERMINADO", null, []]]);
  igual("contrato: varios campos rechazados del mismo documento se listan todos", interpretarRecepcion(200, JSON.stringify({ ...RZ_REAL, response: { Rechazados: [{ "001-002-0050000": { iCondOpe: "a", dRucRec: "b" } }] } }), [], DOC_ENVIO).errores, ["001-002-0050000 · iCondOpe: a", "001-002-0050000 · dRucRec: b"]);

  const tk = interpretarRecepcion(400, JSON.stringify(TK_REAL), [], DOC_ENVIO);

  igual("contrato: «Token inválido» con HTTP 400 → ERROR_ENVIO/AUTENTICACION (no RECHAZO)", [tk.estadoLocal, tk.errorTipo, tk.mensaje, tk.http], ["ERROR_ENVIO", "AUTENTICACION", "Token inválido", 400]);
  igual("contrato: un 400 de validación cualquiera sigue siendo RECHAZO (solo el mensaje de token es autorización)", interpretarRecepcion(400, JSON.stringify({ status: "error", message: "dRucRec inválido" }), [], DOC_ENVIO).errorTipo, "RECHAZO");

  limpiarCacheTokens();

  const gTk = gateway({ consulta: [{ status: 400, cuerpo: TK_REAL }, { status: 200, cuerpo: OK_REAL }] });
  const rTk = await enviarDocumentoGateway(CONFIG, PAYLOAD_ENVIO, DOC_ENVIO, { fetch: gTk.fetch, env: ENV }) as ResultadoEnvio;

  igual("contrato: token inválido 400 → nuevo login y UN reintento con token fresco; termina ENVIADO por lote", [gTk.llamadas.map((l) => l.url.split("/api/")[1]), rTk.estadoLocal, rTk.lote, rTk.fases.map((f) => f.fase + ":" + f.ok)], [["login", "recepcion_de", "login", "recepcion_de"], "ENVIADO", LOTE_REAL, ["AUTENTICACION:true", "TRANSMISION:false", "AUTENTICACION:true", "TRANSMISION:true", "RESPUESTA:true"]]);
  limpiarCacheTokens();

  const gTk2 = gateway({ consulta: [{ status: 400, cuerpo: TK_REAL }, { status: 400, cuerpo: TK_REAL }, { status: 200, cuerpo: OK_REAL }] });
  const rTk2 = await enviarDocumentoGateway(CONFIG, PAYLOAD_ENVIO, DOC_ENVIO, { fetch: gTk2.fetch, env: ENV }) as ResultadoEnvio;

  igual("contrato: token inválido persistente → ERROR_ENVIO/AUTENTICACION tras UN solo reintento (2 transmisiones), sin tratarlo como rechazo", [gTk2.llamadas.filter((l) => l.url.endsWith("recepcion_de")).length, rTk2.estadoLocal, rTk2.errorTipo], [2, "ERROR_ENVIO", "AUTENTICACION"]);
  limpiarCacheTokens();

  const gRz = gateway({ consulta: [{ status: 200, cuerpo: RZ_REAL }, { status: 200, cuerpo: OK_REAL }] });
  const rRz = await enviarDocumentoGateway(CONFIG, PAYLOAD_ENVIO, DOC_ENVIO, { fetch: gRz.fetch, env: ENV }) as ResultadoEnvio;

  igual("contrato: el rechazo por validación no renueva el token ni reintenta (una sola transmisión)", [gRz.llamadas.filter((l) => l.url.endsWith("recepcion_de")).length, rRz.errorTipo, rRz.errores], [1, "RECHAZO", ["001-002-0050000 · iCondOpe: Campo obligatorio requerido."]]);
  cierto("contrato: resultados y fases no contienen el token", !JSON.stringify([rTk, rTk2, rRz]).includes(TOKEN));

  limpiarCacheTokens();

  const gCf = gateway({ consulta: [{ status: 400, cuerpo: TK_REAL }, { status: 200, cuerpo: { status: "success" } }] });

  await consultarDocumentoGateway(CONFIG, { tipo: "FE", establecimiento: "001", puntoExpedicion: "002", numero: "0050000", serie: null }, { fetch: gCf.fetch, env: ENV });

  const cuerpoCf = { dEst: "001", dPunExp: "002", dNumDoc: "0050000", dSerieNum: null, tipoDoc: "FE" };

  igual("contrato: consulta_de de FE envía tipoDoc «FE» con dEst/dPunExp/dNumDoc/dSerieNum y renueva el token una vez ante «Token inválido»", [gCf.llamadas.filter((l) => l.url.endsWith("consulta_de")).map((l) => l.body), gCf.llamadas.filter((l) => l.url.endsWith("login")).length], [[cuerpoCf, cuerpoCf], 2]);


  return fallos;
}
