/**
 * Facturación F-01: Documentos electrónicos (NEX-047). Sin red, sin base de datos y SIN credenciales reales: el cliente del gateway se prueba con un
 * `fetch` simulado y datos sintéticos; la migración y la pantalla se analizan como texto.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { elegirPorEnter } from "@/lib/facturacion/busqueda-rapida";
import { ETIQUETA_SIFEN, estadoSifenDesdeGateway, numeroDocumento } from "@/lib/facturacion/estados";
import { claveToken, consultarDocumentoGateway, enviarDocumentoGateway, interpretarRecepcion, interpretarConsulta, leerCredenciales, limpiarCacheTokens, sanearRespuesta, tamanoCacheTokens, tipoDocConsulta, type FetchLike, type ResultadoEnvio } from "@/lib/facturacion/gateway";
import { calcularItem, calcularSubtotales, numeroDec, parseDec, textoDec } from "@/lib/facturacion/calculo";
import { buscarClientesFactura, buscarProductosFactura, crearFacturaElectronica, leerCuerpoFactura, leerPagina, permisoPrecio, prepararFactura } from "@/lib/facturacion/emision";
import { formatearFechaHoraPy, formatearFechaPy } from "@/lib/formato/listas";
import { emitirFactura, enviarDocumento } from "@/lib/facturacion/envio";
import { CATALOGO_TIPOS_TRANSACCION, CONDICIONES_OPERACION, INDICADORES_PRESENCIA, TIPOS_TRANSACCION, construirPayloadFE, DESCRIPCION_TIPO_DOCUMENTO, FORMAS_PAGO, validarEntradaFE, totalFactura, type EntradaFE, type LineaFE, type ReceptorFE } from "@/lib/facturacion/payload-fe";
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
  cierto("validación: solo PYG y contado; pagos con suma exacta, formas válidas y montos positivos", /guaraníes/.test(errorDe(entradaFE({ moneda: "USD" }))) && /Contado o Crédito/.test(errorDe(entradaFE({ condicion: 3 }))) && /condiciones del crédito/.test(errorDe(entradaFE({ condicion: 2, pagos: [] }))) && /suma de los pagos/.test(errorDe(entradaFE({ pagos: [{ tipo: 1, monto: "10999" }] }))) && /forma de pago no es válida/.test(errorDe(entradaFE({ pagos: [{ tipo: 77, monto: "11000" }] }))) && /Indique la forma de pago/.test(errorDe(entradaFE({ pagos: [] }))));
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

  igual("cuerpo: forma inválida (sin clave, ids no UUID, sin ítems, sin pago) se rechaza antes de tocar la base", [
    typeof leerCuerpoFactura({ ...cuerpo(), claveIdempotencia: "corta" }), typeof leerCuerpoFactura({ ...cuerpo(), clienteId: "x" }), typeof leerCuerpoFactura({ ...cuerpo(), lineas: [] }),
    typeof leerCuerpoFactura({ ...cuerpo(), pagos: [] }), typeof leerCuerpoFactura({ ...cuerpo(), pagos: [{ tipo: 1, monto: "5" }, { tipo: 2, monto: "6" }] }), typeof leerCuerpoFactura(cuerpo()),
  ], ["string", "string", "string", "string", "object", "object"]);

  const parseado = leerCuerpoFactura({ ...cuerpo(), lineas: [{ productoId: PRODUCTO, cantidad: "1", precio: "1", afectacion: 3, tasa: 0 }], empresaId: "otra", total: "1" });

  igual("cuerpo: IVA, afectación, total y empresa enviados por el navegador se IGNORAN; el precio solo se conserva como propuesta (el servidor lo contrasta)", [JSON.stringify(parseado).includes("otra"), JSON.stringify(parseado).includes('"afectacion"'), JSON.stringify(parseado).includes('"total"'), (parseado as { lineas: Array<{ precio: string | null }> }).lineas[0].precio], [false, false, false, "1"]);

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
  cierto("formulario: el navegador envía ids, cantidades y forma de pago; el precio SOLO si difiere del de lista (nunca IVA, total ni afectación), con clave de idempotencia por operación, sin localStorage y con protección de cambios", /claveIdempotencia: clave/.test(formulario) && /crypto\.randomUUID\(\)/.test(formulario) && !/total:|afectacion:|iva:/.test(formulario.slice(formulario.indexOf("const cuerpoFactura"), formulario.indexOf("const cuerpoFactura") + 760)) && /precioModificado\(l\) \? \{ precio: l\.precio \}/.test(formulario) && !/localStorage/.test(formulario) && /useProtegerCambios/.test(formulario));

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
  igual("previa: el resumen trae empresa, sucursal, cliente, líneas con precio/IVA/total y totales calculados por el servidor", [previa.resumen.empresa, previa.resumen.cliente.razonSocial, previa.resumen.lineas[0], previa.resumen.totales.total, previa.resumen.totales.iva10, previa.resumen.formaPago], ["EMPRESA SINTETICA", "EMPRESA SINTETICA SA", { codigo: "P-1", descripcion: "Producto de prueba", unidad: "", cantidad: "1", precio: "11000", precioLista: "11000", precioModificado: false, afectacion: 1, tasa: 10, total: 11000 }, 11000, 1000, "Efectivo"]);
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
  cierto("formulario: modal técnico con fases, HTTP, resultado, mensaje, errores de validación y lote/CDC solo si vienen; aclara que recibido/200 no es aprobado; sin token ni clave", /Detalle técnico del envío/.test(formulario) && !/diagnóstico/i.test(formulario) && /resultado\.lote \?/.test(formulario) && /resultado\.errores\.length > 0/.test(formulario) && /no significan aprobado por SIFEN/.test(formulario) && /Enviando la factura al gateway/.test(formulario) && !/token|password|Authorization|Bearer/i.test(formulario));
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
  igual("pago: Efectivo (iTiPago 1) por el total con la forma exacta de siempre; una forma fuera del catálogo se rechaza en la validación y en el backend", [
    (ejemploFE.FormaPago as Array<Record<string, unknown>>), /forma de pago no es válida/.test(errorDe(entradaFE({ pagos: [{ tipo: 77, monto: "11000" }] }))),
    await rechaza(dbCrear(), cuerpo({ pagos: [{ tipo: 77 }] })),
  ], [[{ iTiPago: 1, dMonTiPag: 107300, cMoneTiPag: "PYG", dTiCamTiPag: null }], true, "422:La forma de pago no es válida."]);

  igual("catálogo del formulario (P1): medios habilitados con reglas implementadas; no se ofrecen retención, anticipo, valores, compensación, permuta, donación, promoción ni consumo interno", Object.keys(FORMAS_PAGO).map(Number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 16, 17, 21, 99]);
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

  // ═ AUD-FE-UX-02: selectores explícitos, precio controlado, cantidades por unidad, fechas dd/MM/yyyy ═══════════════════════════════════════════════
  const cuerpoPrecio = (precio: string | undefined, cantidad = "1") => cuerpo({ lineas: [{ productoId: PRODUCTO, cantidad, ...(precio === undefined ? {} : { precio }) }] });
  const consultasUx: string[] = [];
  const dbConPermiso = (permiso: boolean, productos?: Array<Record<string, unknown>>) => {
    const base = dbCrear({ productos }) as unknown as { query: (s: string, p?: unknown[]) => Promise<unknown> };

    return { async query(sql: string, parametros: unknown[] = []) { consultasUx.push(sql); return /usuario_tiene_permiso/.test(sql) ? { rows: [{ ok: permiso }], rowCount: 1 } : base.query(sql, parametros); } } as never;
  };
  const estadoError = async (p: Promise<unknown>) => { try { await p; return 0; } catch (e) { return (e as { estado?: number }).estado ?? -1; } };

  consultasUx.length = 0;

  const sinPermiso = await estadoError(prepararFactura(dbConPermiso(false), EMPRESA, USUARIO, leerCuerpoFactura(cuerpoPrecio("9000")) as never));

  igual("precio: un precio distinto del de lista SIN permiso FACTURACION_ELECTRONICA.PRECIO se rechaza (403) y se consulta el permiso en el servidor", [sinPermiso, consultasUx.some((q) => /usuario_tiene_permiso/.test(q))], [403, true]);

  const conPermiso = await prepararFactura(dbConPermiso(true), EMPRESA, USUARIO, leerCuerpoFactura(cuerpoPrecio("9000", "2")) as never);

  igual("precio: con permiso, el precio propuesto reemplaza al de lista (IVA incluido, sin sumar IVA otra vez), el servidor recalcula y marca la línea modificada", [conPermiso.resumen.lineas[0].precio, conPermiso.resumen.lineas[0].precioLista, conPermiso.resumen.lineas[0].precioModificado, conPermiso.resumen.totales.total, conPermiso.resumen.totales.iva10, conPermiso.resumen.totales.gravado10], ["9000", "11000", true, 18000, 1636.36363636, 18000]);

  consultasUx.length = 0;

  const igualLista = await prepararFactura(dbConPermiso(false), EMPRESA, USUARIO, leerCuerpoFactura(cuerpoPrecio("11000")) as never);

  igual("precio: un precio igual al de lista no requiere permiso ni se marca como modificado", [igualLista.resumen.lineas[0].precioModificado, consultasUx.some((q) => /usuario_tiene_permiso/.test(q))], [false, false]);
  igual("precio: forma inválida (negativo, texto, más de 4 decimales) se rechaza al leer el cuerpo; cero se rechaza en el servidor (422) aun con permiso", [
    typeof leerCuerpoFactura(cuerpoPrecio("-5")), typeof leerCuerpoFactura(cuerpoPrecio("abc")), typeof leerCuerpoFactura(cuerpoPrecio("1.23456")), typeof leerCuerpoFactura(cuerpoPrecio("1500.5")),
    await estadoError(prepararFactura(dbConPermiso(true), EMPRESA, USUARIO, leerCuerpoFactura(cuerpoPrecio("0")) as never)),
  ], ["string", "string", "string", "object", 422]);
  igual("precio: sin la migración (la consulta del permiso falla) se factura solo a precio de lista", await permisoPrecio({ async query() { throw new Error("la función no existe"); } } as never, EMPRESA, USUARIO), false);
  igual("cantidad: la unidad SIFEN «Unidad» (77) no admite fracciones (422); otra unidad sí admite hasta 4 decimales", [
    await estadoError(prepararFactura(dbConPermiso(false), EMPRESA, USUARIO, leerCuerpoFactura(cuerpoPrecio(undefined, "1.5")) as never)),
    await estadoError(prepararFactura(dbConPermiso(false), EMPRESA, USUARIO, leerCuerpoFactura(cuerpoPrecio(undefined, "2.0")) as never)),
    await estadoError(prepararFactura(dbConPermiso(false, [{ ...filaProducto, unidadSifen: 86 }]), EMPRESA, USUARIO, leerCuerpoFactura(cuerpoPrecio(undefined, "1.5")) as never)),
  ], [422, 0, 0]);

  // Selectores: lista paginada inmediata (sin texto), filtro opcional y paginación en el servidor
  const spyBusq: Array<{ sql: string; p: unknown[] }> = [];
  const dbBusq = { async query(sql: string, p: unknown[] = []) { spyBusq.push({ sql, p }); return { rows: [], rowCount: 0 }; } } as never;
  const listaC = await buscarClientesFactura(dbBusq, EMPRESA, "");
  const listaP = await buscarProductosFactura(dbBusq, EMPRESA, "", { pagina: "3", porPagina: "500" });

  igual("selectores: sin texto se consulta de inmediato (sin mínimo de caracteres) con paginación de servidor: página 1 de 10 para clientes; tamaño acotado a 25 y desplazamiento 50 para productos", [spyBusq.length, spyBusq[0].p, spyBusq[1].p, listaC.pagina, listaP.porPagina, listaP.total], [2, [EMPRESA, "", "%%", 10, 0], [EMPRESA, "", "%%", 25, 50], 1, 25, 0]);
  igual("paginación: valores inválidos vuelven a la página 1 y 10 por página; el tamaño máximo es 25", [leerPagina("x", "y"), leerPagina("0", "-3"), leerPagina("2", "7"), leerPagina(null, "1000")], [{ pagina: 1, porPagina: 10 }, { pagina: 1, porPagina: 10 }, { pagina: 2, porPagina: 7 }, { pagina: 1, porPagina: 25 }]);

  await buscarProductosFactura(dbBusq, EMPRESA, "7891_%");
  await buscarClientesFactura(dbBusq, EMPRESA, "80000005-6");

  igual("filtros: productos por código, descripción, código de barras, GTIN y códigos alternos (comodines escapados); clientes por código, nombre, fantasía y RUC/CI con o sin DV; orden estable y total en la misma consulta", [
    /producto_codigos pc/.test(spyBusq[2].sql) && /p\.codigo_barras/.test(spyBusq[2].sql) && /p\.descripcion_factura/.test(spyBusq[2].sql) && /count\(\*\) OVER\(\)/.test(spyBusq[2].sql) && /ORDER BY t\.descripcion, t\.id/.test(spyBusq[2].sql),
    spyBusq[2].p[2], /c\.numero_documento \|\| '-' \|\| c\.dv/.test(spyBusq[3].sql) && /c\.nombre_fantasia/.test(spyBusq[3].sql) && /ORDER BY c\.razon_social, c\.id LIMIT \$4 OFFSET \$5/.test(spyBusq[3].sql), spyBusq[3].p[1],
  ], [true, "%7891!_!%%", true, "80000005-6"]);

  // Catálogos SIFEN (MT v150): iTipTra D011 completo; habilitados solo los aplicables; iIndPres 1–6; condición y forma de pago separadas
  igual("catálogo iTipTra (MT v150 D011): los 13 códigos normativos documentados; se habilitan 1–4 (venta de mercadería, servicios, mixto, activo fijo)", [Object.keys(CATALOGO_TIPOS_TRANSACCION).map(Number), Object.keys(TIPOS_TRANSACCION).map(Number), Object.keys(TIPOS_TRANSACCION).every((k) => TIPOS_TRANSACCION[Number(k)] === CATALOGO_TIPOS_TRANSACCION[Number(k)])], [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], [1, 2, 3, 4], true]);
  igual("catálogo iIndPres (MT v150 E011): 1–6 completos; el 9 «Otro» exige texto E012 que el JSON funcional no transporta y no se ofrece. iCondOpe: Contado (1) y Crédito (2, MFE-B1); iTiPago: catálogo P1", [Object.keys(INDICADORES_PRESENCIA).map(Number), Object.keys(CONDICIONES_OPERACION).map(Number), Object.keys(FORMAS_PAGO).map(Number)], [[1, 2, 3, 4, 5, 6], [1, 2], [1, 2, 3, 4, 5, 6, 7, 8, 9, 16, 17, 21, 99]]);
  igual("validación: el servidor rechaza un tipo de transacción no habilitado (p. ej. 5 divisas) y la presencia 9", [
    validarEntradaFE({ ...entradaFE(), tipoTransaccion: 5 }).some((m) => /tipo de transacción/.test(m)), validarEntradaFE({ ...entradaFE(), presencia: 9 }).some((m) => /presencia/.test(m)), validarEntradaFE({ ...entradaFE(), tipoTransaccion: 4 }).length,
  ], [true, true, 0]);


  // Fechas dd/MM/yyyy en hora de Paraguay, sin depender del idioma del navegador
  igual("fechas: dd/MM/yyyy y dd/MM/yyyy HH:mm:ss en la hora de Paraguay (UTC-3), también al cruzar el día", [formatearFechaPy("2026-10-12T15:15:46Z"), formatearFechaHoraPy("2026-10-12T15:15:46Z"), formatearFechaHoraPy("2026-10-12T02:00:00Z"), formatearFechaPy("no es fecha")], ["12/10/2026", "12/10/2026 12:15:46", "11/10/2026 23:00:00", "no es fecha"]);

  const docPageUx = leer("app/(private)/documentos/page.tsx");
  const permisoSql = leer("documentacao/banco/nexit/v1/migraciones/NEX-051-facturacion-permiso-precio.sql");
  const reversion51 = leer("documentacao/banco/nexit/v1/scripts/reversion-NEX-051.sql");

  const cuerpoPagina = formulario.slice(formulario.indexOf("export default function NuevaFacturaPage"));
  const css = leer("app/(private)/facturas/nueva/page.module.css");
  const diag = leer("documentacao/banco/nexit/v1/scripts/diagnostico-puntos-expedicion-FE.sql");

  cierto("UX-03 selectores: al abrir listan de inmediato (hook con carga al montar el selector, sin mínimo de caracteres), con filtro opcional y paginación; el formulario en sí no consulta clientes ni productos", /function useListado/.test(formulario) && /function Paginacion/.test(formulario) && !/api\/facturas\/(clientes|productos)/.test(cuerpoPagina) && (formulario.match(/useListado<(Cliente|Producto)>\("\/api\/facturas\/(clientes|productos)"/g) ?? []).length === 2 && !/MIN_BUSQUEDA|al menos \$\{/.test(formulario) && /Filtrar por nombre, RUC, CI o código/.test(formulario) && /Filtrar por código, GTIN o descripción/.test(formulario) && /Buscar cliente por nombre, RUC, CI o código/.test(formulario) && /Añadir producto por código, GTIN o descripción/.test(formulario) && /Búsqueda avanzada/.test(formulario));
  cierto("UX-03 cabecera: sin bloque de número, sin «Se asigna al enviar» ni «la fija el sistema», sin caja grande de fecha; solo «Fecha: dd/MM/yyyy · Moneda: PYG» compacto", !/Se asigna al enviar/.test(formulario) && !/la fija el sistema/.test(formulario) && !/<span>Número<\/span>/.test(formulario) && /Fecha: \{hoy \|\| "—"\} · Moneda: PYG/.test(formulario) && !/Solo se factura al contado/.test(formulario) && !/El servidor recalcula todo/.test(formulario));
  cierto("UX-03 condición y pago: «Condición de la operación» (iCondOpe) y «Forma de pago» (iTiPago) son campos separados, ambos desde el catálogo de la API", /<span>Condición de la operación<\/span>/.test(formulario) && /"Forma de pago"/.test(formulario) && !/Contado · /.test(formulario) && /condiciones: CONDICIONES_OPERACION/.test(leer("app/api/facturas/catalogos/route.ts")));
  cierto("UX-03 diagnóstico: sin sucursales o sin punto se muestra el motivo real (no se inventa ningún punto en la interfaz) y el sistema cuenta las sucursales sin establecimiento SIFEN", /No hay sucursales habilitadas para facturar/.test(formulario) && /no tienen el establecimiento SIFEN cargado/.test(formulario) && /no tiene un punto de expedición activo/.test(formulario) && !/value="002"|"002"/.test(formulario) && /sucursalesSinEstablecimiento/.test(leer("lib/facturacion/emision.ts")));
  cierto("UX-03 punto 002: script de diagnóstico de SOLO LECTURA (sin INSERT/UPDATE/DELETE) y script manual de configuración con establecimiento 001, punto 002, último número 49999 y sin reinicio de un punto existente", !/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i.test(diag.replace(/--.*$/gm, "")) && /fe_puntos_expedicion/.test(diag) && /ultimo_numero/.test(diag) && /documentos_electronicos/.test(diag) && /'002'/.test(leer("documentacao/banco/nexit/v1/scripts/configurar-punto-expedicion-prueba-NEX-048.sql")) && /49999/.test(leer("documentacao/banco/nexit/v1/scripts/configurar-punto-expedicion-prueba-NEX-048.sql")) && /no se reinicia la numeración/.test(leer("documentacao/banco/nexit/v1/scripts/configurar-punto-expedicion-prueba-NEX-048.sql")));
  cierto("UX-03 visual: el indicador activo de Documentos ya no usa contorno negro (currentColor) sino clase propia con acento turquesa; totales con panel claro y bordes suaves", !/currentColor/.test(docPageUx) && /estilos\.kpiActivo/.test(docPageUx) && /\.kpiActivo \{[^}]*#0f9ca5/.test(leer("app/(private)/documentos/page.module.css")) && /\.totalGeneral \{[^}]*#f3fbfb/.test(css.slice(css.lastIndexOf(".totalGeneral {"))));
  cierto("UX-01: selector dedicado de cliente con ficha fiscal (razón social, RUC-DV, tipo de contribuyente, dirección y casa, teléfono, correo, aptitud), cambio de cliente y pendientes que remiten a Clientes sin editar el cadastro", /role="dialog"/.test(formulario) && /Ficha fiscal del cliente/.test(formulario) && /Tipo de contribuyente/.test(formulario) && /Dirección fiscal/.test(formulario) && /0 \(no cargado; se informa 0\)/.test(formulario) && /Cambiar cliente/.test(formulario) && /Regularizar en Clientes/.test(formulario) && /disabled=\{!c\.apto\}/.test(formulario));
  cierto("UX-02: el selector de productos muestra el impedimento exacto (IVA, unidad SIFEN, precio) con enlace a Productos y bloquea «Añadir»", /No se puede facturar: /.test(formulario) && /Corregir en Productos/.test(formulario) && /disabled=\{pr\.length > 0 && !permiteIncompletos\}/.test(formulario) && /sin unidad de medida SIFEN/.test(formulario) && /sin clasificación de IVA/.test(formulario));
  cierto("UX-03: tabla de ítems con producto, afectación, % IVA, unidad, cantidad, precio unitario IVA incluido, subtotal y acciones; cantidad y precio editables, precio solo con permiso", ["Producto", "Afectación IVA", "% IVA", "Unidad", "Cantidad", "Precio unitario (IVA incl.)", "Subtotal"].every((t) => formulario.includes(`>${t}</th>`)) && /puedeEditarPrecio \? \(/.test(formulario) && /Restaurar/.test(formulario) && /aria-invalid=\{cantOk \? undefined : true\}/.test(formulario) && /aria-invalid=\{precOk \? undefined : true\}/.test(formulario));
  cierto("UX-05 (workspace): secciones Operación, Cliente, Detalle, Resumen financiero, Pendientes e Información adicional, total general destacado, barra de acciones con lo que falta, modales con Escape", ["Operación", "Cliente *", "Detalle de la factura *", "Resumen (guaraníes)", "Información adicional", "Pendientes de validación"].every((t) => formulario.includes(t)) && /totalGeneral/.test(formulario) && /Falta: /.test(formulario) && /useEscape/.test(formulario) && /@media \(max-width: 760px\)/.test(leer("app/(private)/facturas/nueva/page.module.css")));
  cierto("UX-04: fechas en dd/MM/yyyy — Documentos usa el campo de fecha local (sin type=\"date\") y el formateador fijo de Paraguay; el formulario muestra la fecha con el mismo formateador", !/type="date"/.test(docPageUx) && /CampoFecha/.test(docPageUx) && /formatearFechaHoraPy/.test(docPageUx) && !/new Date\([^)]*\)\.toLocale/.test(docPageUx) && /formatearFechaPy\(new Date\(\)\)/.test(formulario) && !/type="date"/.test(formulario));
  cierto("UX-06: se conserva Grabar → resumen calculado en el servidor → Enviar factura → modal técnico; el resumen marca los precios modificados", /\/api\/facturas\/previa/.test(formulario) && /Resumen de la factura/.test(formulario) && /Precio modificado \(lista/.test(formulario) && /Detalle técnico del envío/.test(formulario));
  cierto("NEX-051: solo registra el permiso (sin asignarlo a perfiles), exige NEX-048, no se reaplica y su reversión aborta si hay perfiles con el permiso; NEX-047…050 no se tocan", /FACTURACION_ELECTRONICA\.PRECIO/.test(permisoSql) && /NEX-051 requiere NEX-048/.test(permisoSql) && /NEX-051 parece aplicada/.test(permisoSql) && !/perfil_permiso/.test(permisoSql.replace(/--.*$/gm, "")) && /hay perfiles con FACTURACION_ELECTRONICA\.PRECIO asignado/.test(reversion51) && /ABORTA/.test(reversion51));
  cierto("catálogos: la API informa si el usuario puede editar precios (para mostrar el campo); el servidor decide siempre", /puedeEditarPrecio: await permisoPrecio\(/.test(leer("app/api/facturas/catalogos/route.ts")));




  // ══ ENTREGA 01 (AUD-PRODUCTOS-V1 §XXI): solo productos vendibles y con unidad SIFEN vigente llegan a la factura (PRD-A15 / A16 / A02) ═════════════════
  const emisionSrc = leer("lib/facturacion/emision.ts");
  const prodUnidad = (extra: Record<string, unknown>) => [{ ...filaProducto, ...extra }];
  const falla = async (productos: Array<Record<string, unknown>>) => {
    try {
      await prepararFactura(dbCrear({ productos }), EMPRESA, USUARIO, leerCuerpoFactura(cuerpo()) as never);

      return [0, ""] as const;
    } catch (e) {
      return [(e as { estado?: number }).estado ?? -1, (e as Error).message] as const;
    }
  };

  cierto("A15: el catálogo base de la factura exige p.vendible (selector, previa y emisión comparten la misma consulta) y consulta la vigencia SIFEN de la unidad", /WHERE p\.empresa_id = \$1 AND p\.activo AND p\.vendible AND p\.tipo_producto IN/.test(emisionSrc) && /us\.vigente AS "unidadVigente"/.test(emisionSrc) && (emisionSrc.match(/SELECT_PRODUCTOS/g) ?? []).length >= 3);

  llamadasCrear.length = 0;

  const [eNoVendible, mNoVendible] = await falla([]);
  const [eVigenteFalse, mVigenteFalse] = await falla(prodUnidad({ unidadVigente: false }));
  const [eVigenteNula, mVigenteNula] = await falla(prodUnidad({ unidadVigente: null }));
  const [eSinUnidad, mSinUnidad] = await falla(prodUnidad({ unidadSifen: null, unidadVigente: null }));
  const [eOk] = await falla(prodUnidad({ unidadVigente: true }));

  igual("A15: un producto vendible=false (la consulta no lo devuelve) no pasa por la previa ni por la emisión por request directo: 422 y sin reservar número", [eNoVendible, /no está marcado como vendible/.test(mNoVendible), llamadasCrear.some((l) => /fe_documento_crear_fe/.test(l.sql))], [422, true, false]);
  igual("A16/A02: unidad SIFEN no vigente, inexistente en el catálogo o ausente se rechaza (422) con mensaje útil; vigente pasa", [eVigenteFalse, /no está vigente/.test(mVigenteFalse), eVigenteNula, /no existe en el catálogo oficial/.test(mVigenteNula), eSinUnidad, /sin equivalencia SIFEN|equivalencia SIFEN/.test(mSinUnidad), eOk], [422, true, 422, true, 422, true, 0]);

  llamadasCrear.length = 0;

  const emVend = await estadoError(crearFacturaElectronica(dbCrear({ productos: [] }), EMPRESA, USUARIO, leerCuerpoFactura(cuerpo()) as never));

  igual("A15: crearFacturaElectronica con producto no vendible falla antes de fe_documento_crear_fe (idempotencia y numeración intactas)", [emVend, llamadasCrear.some((l) => /fe_documento_crear_fe/.test(l.sql))], [422, false]);
  cierto("selector de la factura: marca «unidad SIFEN no vigente» y bloquea Añadir", /unidad SIFEN no vigente/.test(formulario) && /unidadVigente\?: boolean \| null/.test(formulario));


  // ══ ETAPA A — redesenho visual de Nueva factura electrónica (AUD-FAT-UX-R01): workspace 70/30, búsqueda rápida, ítems responsivos, sin simular edición ═══════════
  const cssFat = leer("app/(private)/facturas/nueva/page.module.css");
  const pagFat = leer("app/(private)/facturas/nueva/page.tsx");
  const cuerpoFat = pagFat.slice(pagFat.indexOf("export default function NuevaFacturaPage"));

  type Ej = { id: string; codigo: string; gtin?: string };
  const ex = (t: Ej, s: string) => t.codigo.toLowerCase() === s.toLowerCase() || t.gtin === s;
  const A: Ej = { id: "a", codigo: "ARR-1", gtin: "7791234567890" }, B: Ej = { id: "b", codigo: "ARR-2" }, C: Ej = { id: "c", codigo: "ARR-3", gtin: "7791234567890" };

  igual("ETAPA A búsqueda rápida (Enter): coincidencia exacta única (código o GTIN) o un único resultado se eligen; varios resultados o dos coincidencias exactas NO eligen el primero; sin resultados informa", [
    elegirPorEnter([A, B], "7791234567890", ex).elegido?.id, elegirPorEnter([A, B], "arr-2", ex).elegido?.id, elegirPorEnter([B], "arr", ex).elegido?.id,
    elegirPorEnter([A, B], "arr", ex), elegirPorEnter([A, C], "7791234567890", ex), elegirPorEnter([], "x", ex),
  ], ["a", "b", "b", { elegido: null, motivo: "VARIOS" }, { elegido: null, motivo: "VARIOS" }, { elegido: null, motivo: "SIN_RESULTADOS" }]);
  cierto("ETAPA A búsqueda rápida: combobox accesible (role combobox/listbox/option, aria-activedescendant), flechas + Enter + Escape, la lista solo se consulta al abrirse y el selector avanzado sigue disponible; no cambia ningún contrato de API", /role="combobox"/.test(pagFat) && /role="listbox"/.test(pagFat) && /role="option"/.test(pagFat) && /aria-activedescendant/.test(pagFat) && /"ArrowDown"/.test(pagFat) && /"ArrowUp"/.test(pagFat) && /"Enter"/.test(pagFat) && /"Escape"/.test(pagFat) && /habilitado = true/.test(pagFat) && /if \(!habilitado\) return;/.test(pagFat) && /setSelector\("cliente"\)/.test(pagFat) && /setSelector\("producto"\)/.test(pagFat) && !/api\/facturas\/(clientes|productos)/.test(cuerpoFat));
  cierto("ETAPA A workspace: panel principal + resumen financiero lateral (≈70/30) fijo en escritorio, con exento/exonerado, bases e IVA 5 % y 10 %, total IVA, total general destacado, condición y forma de pago, pendientes y acción primaria «Revisar y confirmar»", /grid-template-columns: minmax\(0, 1fr\) 340px/.test(cssFat) && /\.resumenPanel \{[^}]*position: sticky/.test(cssFat) && ["Exento", "Exonerado", "Gravado 5 % (IVA incl.)", "IVA 5 %", "Gravado 10 % (IVA incl.)", "IVA 10 %", "Total IVA", "Total general", "Forma de pago", "Pendientes de validación", "Revisar y confirmar"].every((t) => cuerpoFat.includes(t)) && /<aside className=\{estilos\.resumenPanel\}/.test(cuerpoFat));
  cierto("ETAPA A responsividad: un único punto de quiebre de maquetación (1099/1100 px), ítems como tarjetas hasta 900 px (sin desplazamiento horizontal), ajustes a 760 px y barra de acción con total para pantallas medianas y móviles", /@media \(max-width: 1099px\)/.test(cssFat) && /@media \(max-width: 900px\)/.test(cssFat) && /@media \(max-width: 760px\)/.test(cssFat) && /td\[data-label\]::before/.test(cssFat) && /content: attr\(data-label\)/.test(cssFat) && !/min-width: 860px/.test(cssFat) && /\.barraMovil \{[^}]*display: none/.test(cssFat) && /\.barraMovil \{ *display: flex|\.barraMovil \{\s*display: flex/.test(cssFat.slice(cssFat.indexOf("max-width: 1099px"))) && (cuerpoFat.match(/data-label=/g) ?? []).length >= 6);
  cierto("ETAPA A escala del design system: campos de 40 px, valores de 14 px, secciones de 16 px, ningún texto por debajo de 12 px, un solo bloque .totalGeneral (sin sobrescrituras) y sin estilos en línea decorativos", (cssFat.match(/min-height: 40px/g) ?? []).length >= 3 && /\.field select,[^{]*\{[^}]*font-size: 14px/.test(cssFat) && /\.cardHead h2,[^{]*\{[^}]*font-size: 16px/.test(cssFat) && !/font-size: (1[01](\.\d+)?|[0-9](\.\d+)?)px/.test(cssFat) && (cssFat.match(/\.totalGeneral \{/g) ?? []).length === 1 && !/!important[^;]*;[^}]*!important[^;]*;[^}]*!important/.test(cssFat));
  cierto("FAT-UX-R01-05 → MFE-B1: la condición de la operación es un select REAL del catálogo de la API (Contado/Crédito), nunca un select simulado ni un valor fijo: el cuerpo envía la condición elegida", !/<select value="1" onChange=\{\(\) => undefined\}/.test(pagFat) && /aria-label="Condición de la operación" value=\{condicion\}/.test(pagFat) && !/solo al contado; el crédito aún no está disponible/.test(pagFat) && /condicion: Number\(condicion\)/.test(pagFat.slice(pagFat.indexOf("const cuerpoFactura"), pagFat.indexOf("const cuerpoFactura") + 900)));
  cierto("FAT-UX-R01-06: Cancelar apunta a una ruta existente y permitida (/dashboard) y no a /documentos; la confirmación de cambios sin guardar sigue activa (useProtegerCambios intercepta cualquier enlace interno)", existsSync(join(raiz, "app/(private)/dashboard/page.tsx")) && /<Link href="\/dashboard" className=\{`\$\{ui\.secondaryButton\} \$\{estilos\.accionPrincipal\}`\}>Cancelar<\/Link>/.test(pagFat) && !/href="\/documentos"[^>]*>\s*Cancelar/.test(pagFat) && /useProtegerCambios\(sucio\)/.test(pagFat));
  cierto("FAT-UX-R01-07: lenguaje comercial en la experiencia principal (el estado real: borrador sin guardar / enviada con SIFEN pendiente), detalle técnico (fases, HTTP, lote, CDC) solo en un diálogo secundario; sin inventar número, CDC ni aprobación", /Borrador sin guardar/.test(pagFat) && /SIFEN pendiente de consulta/.test(pagFat) && /Ver detalle técnico/.test(pagFat) && /Detalle técnico del envío/.test(pagFat) && !/diagnóstico/i.test(pagFat) && !/Aprobad[oa]/.test(pagFat.replace(/no significan aprobado por SIFEN/g, "").replace(/ni aprobarla/g, "")) && !/<span>Número<\/span>/.test(pagFat));
  cierto("ETAPA A preserva el contrato y las validaciones: Revisar → previa del servidor → Enviar (idempotencia), precio solo con permiso, cantidad entera para unidad 77, mensajes por fila, producto con impedimentos bloqueado y cliente no apto bloqueado", /fetch\("\/api\/facturas\/previa"/.test(pagFat) && pagFat.split('fetch("/api/facturas", { method: "POST"').length === 2 && /puedeEditarPrecio \? \(/.test(pagFat) && /unidadSifen === 77/.test(pagFat) && /filaInvalida/.test(pagFat) && /No se puede facturar: \$\{pr\.join/.test(pagFat) && /habilitado: c\.apto/.test(pagFat) && /disabled=\{!c\.apto\}/.test(pagFat) && /disabled=\{!puedeGuardar\}/.test(pagFat));
  cierto("ETAPA A no toca otros módulos: el redesenho vive solo en la pantalla Nueva factura y en un módulo puro nuevo; ninguna migración, API fiscal, cálculo ni gateway importa la búsqueda rápida", !/busqueda-rapida/.test(leer("lib/facturacion/calculo.ts") + leer("lib/facturacion/emision.ts") + leer("lib/facturacion/envio.ts") + leer("lib/facturacion/gateway.ts") + leer("lib/facturacion/payload-fe.ts")));


  // ══ FAT-E1 — matriz fiscal FE (PYG, contado, efectivo): contrato de claves, receptor, ítems, IVA, pago y serialización con fixtures sintéticas ═══════════════
  const sinFE = (extra: Partial<EntradaFE> = {}) => construirPayloadFE(entradaFE(extra)) as Record<string, unknown>;
  const subFE = (p: Record<string, unknown>) => (p.Subtotales as Array<Record<string, number | null>>)[0];
  const detFE = (p: Record<string, unknown>) => p.Detalles as Array<Record<string, unknown>>;
  const dec = (x: string) => parseDec(x)!;
  const mixto: LineaFE[] = [
    linea({ codigoInterno: "G10", precio: "11000", afectacion: 1, tasa: 10 }),
    linea({ codigoInterno: "G5", precio: "10500", afectacion: 1, tasa: 5 }),
    linea({ codigoInterno: "EXE", precio: "5000", afectacion: 3, tasa: 0 }),
    linea({ codigoInterno: "EXO", precio: "3000", afectacion: 2, tasa: 0 }),
    linea({ codigoInterno: "PAR", precio: "11000", afectacion: 4, tasa: 10, proporcion: "50" }),
  ];
  // Con el parcial de 11.000 (residuo 10⁻⁸) la validación y el constructor se niegan (FAT-E1-R01-01): los valores de referencia usan un parcial sin residuo (10.500 al 50 %).
  const mixtoExacto: LineaFE[] = [...mixto.slice(0, 4), linea({ codigoInterno: "PAR", precio: "10500", afectacion: 4, tasa: 10, proporcion: "50" })];
  const pMixto = sinFE({ lineas: mixtoExacto, pagos: [{ tipo: 1, monto: "40000" }] });
  const CLAVES_ITEM = ["dCodInt", "dGtin", "dDesProSer", "cUniMed", "dCantProSer", "dPUniProSer", "dTotBruOpeItem", "dTotOpeItem", "iAfecIVA", "dPropIVA", "dTasaIVA", "dBasGravIVA", "dLiqIVAItem", "dBasExe"];
  const CLAVES_SUB = ["dSubExe", "dSubExo", "dSub5", "dSub10", "dTotOpe", "dTotDesc", "dTotDescGlotem", "dTotAntItem", "dTotAnt", "dPorcDescTotal", "dDescTotal", "dAnticipo", "dRedon", "dTotGralOpe", "dIVA5", "dIVA10", "dLiqTotIVA5", "dLiqTotIVA10", "dTotIVA", "dBaseGrav5", "dBaseGrav10", "dTBasGraIVA", "dTotalGs"];
  const CLAVES_CABECERA = ["iTiDE", "dInfoEmi", "dInfoFisc", "iTipTra", "iTImp", "cMoneOpe", "dCondTiCam", "dTiCam", "iIndPres", "dFecEmNR", "dInfAdic", "iNatRec", "iTiOpe", "cPaisRec", "iTiContRec", "dRucRec", "dDVRec", "iTipIDRec", "dDTipIDRec", "dNumIDRec", "dNomRec", "dNomFanRec", "dDirRec", "dNumCasRec", "dTelRec", "dCelRec", "dEmailRec", "dEmailAdic", "dEmailAdmin", "dCodCliente", "iCondOpe", "iCondCred", "dPlazoCre", "dCuotas", "Cuotas", "FormaPago", "Detalles", "Subtotales"];

  igual("E1 contrato de claves: cabecera, FormaPago, Detalles y Subtotales producen EXACTAMENTE el conjunto de claves del JSON funcional que Nexit decide enviar (sin localización cDepRec/cDisRec/cCiuRec, sin las 36 claves ausentes); opcionales no aplicables = null", [
    Object.keys(sinFE()).sort(), Object.keys(detFE(sinFE())[0]).sort(), Object.keys(subFE(sinFE())).sort(), Object.keys((sinFE().FormaPago as Array<Record<string, unknown>>)[0]).sort(),
    ["dInfoEmi", "dInfoFisc", "dCondTiCam", "dTiCam", "dFecEmNR", "iCondCred", "dPlazoCre", "dCuotas"].map((k) => sinFE()[k]), sinFE().Cuotas,
  ], [[...CLAVES_CABECERA].sort(), [...CLAVES_ITEM].sort(), [...CLAVES_SUB].sort(), ["cMoneTiPag", "dMonTiPag", "dTiCamTiPag", "iTiPago"], Array(8).fill(null), []]);
  cierto("E1 contrato de claves: ninguna de las 36 claves AUSENTES del inventario AUD-FE-100 ni de localización ni de identidad/numeración (las completa NEX-048 o el gateway) se emite; la omisión frente a null explícito sigue SIN confirmar por el gateway", (() => {
    const p = sinFE();
    const ausentes = ["iCondAnt", "iTipCont", "gRespDE", "gCompPub", "dModCont", "dEntCont", "dAnoCont", "dSecCont", "dFeCodCont", "dComi", "dIVAComi", "cDepRec", "cDisRec", "cCiuRec", "cdc", "dEst", "dPunExp", "dNumDoc", "dSerieNum", "dFeEmiDE"];
    const itemAus = ["dParAranc", "dNCM", "dGtinPq", "cPaisOrig", "dInfItem", "cRelMerc", "dCanQuiMer", "dPorQuiMer", "dCDCAnticipo", "dDescItem", "dPorcDesIt", "dDescGloItem", "dAntPreUniIt", "dAntGloPreUniIt", "gVehNuevo", "dNumLote", "dVencMerc", "dNSerie", "dNumPedi", "dNumSegui", "dNomImp", "dDirImp", "dNumFir", "dNumReg", "dNumRegEntCom"];

    return ausentes.every((k) => !(k in p) && !(k in subFE(p))) && itemAus.every((k) => !(k in detFE(p)[0]));
  })());

  // IVA 5 %, 10 %, exento, exonerado y gravado parcial en una misma factura: valores independientes y coherencia entre ítems y subtotales
  igual("E1 IVA mixto: subtotales con aritmética independiente (5 %, 10 %, exento, exonerado y parcial exacto al 50 % con la NT 13)", (() => { const s = subFE(pMixto); return [s.dSubExe, s.dSubExo, s.dSub5, s.dSub10, s.dTotOpe, s.dTotGralOpe, s.dIVA5, s.dIVA10, s.dLiqTotIVA5, s.dLiqTotIVA10, s.dTotIVA, s.dBaseGrav5, s.dBaseGrav10, s.dTBasGraIVA, s.dTotalGs]; })(),
    [10000, 3000, 10500, 16500, 40000, 40000, 500, 1500, 500, 1500, 2000, 10000, 15000, 25000, 40000]);
  igual("E1 IVA mixto: por ítem — exento y exonerado sin base ni IVA y con proporción 0; gravado con proporción 100; parcial con base exenta", detFE(pMixto).map((d) => [d.iAfecIVA, d.dPropIVA, d.dTasaIVA, d.dBasGravIVA, d.dLiqIVAItem, d.dBasExe, d.dTotOpeItem]),
    [[1, 100, 10, 10000, 1000, 0, 11000], [1, 100, 5, 10000, 500, 0, 10500], [3, 0, 0, 0, 0, 0, 5000], [2, 0, 0, 0, 0, 0, 3000], [4, 50, 10, 5000, 500, 5000, 10500]]);
  cierto("E1 IVA mixto: identidades del MT (F008 = F002+F003+F004+F005, F014 = F008, F017 = F015+F016, F020 = F018+F019, dLiqTotIVA = IVA del tramo) con enteros escalados", (() => {
    const s = subFE(pMixto) as Record<string, number>;
    const e = (k: string) => dec(String(s[k]));

    return e("dTotOpe") === e("dSubExe") + e("dSubExo") + e("dSub5") + e("dSub10") && e("dTotGralOpe") === e("dTotOpe") && e("dTotIVA") === e("dIVA5") + e("dIVA10") && e("dTBasGraIVA") === e("dBaseGrav5") + e("dBaseGrav10") && e("dLiqTotIVA5") === e("dIVA5") && e("dLiqTotIVA10") === e("dIVA10") && e("dTotalGs") === e("dTotGralOpe");
  })());
  igual("E1 gravado parcial: la proporción debe ser mayor que 0 y menor que 100 (validación 154 del MT); 0, 100 y valores no numéricos se rechazan, 50 se acepta", ["0", "100", "abc", "50"].map((p) => validarEntradaFE(entradaFE({ lineas: [linea({ precio: "10500", afectacion: 4, tasa: 10, proporcion: p })], pagos: [{ tipo: 1, monto: "10500" }] })).length > 0), [true, true, true, false]);
  igual("E1 IVA: exento y exonerado exigen tasa 0 y gravado 5 o 10 (validaciones 155–156 del MT)", [[3, 5], [2, 10], [1, 0], [1, 7], [4, 0]].map(([a, t]) => validarEntradaFE(entradaFE({ lineas: [linea({ afectacion: a as 1 | 2 | 3 | 4, tasa: t, proporcion: a === 4 ? "50" : null })] })).some((m) => /tasa de IVA/.test(m))), [true, true, true, true, true]);

  // Ejemplo de referencia del gateway (Gs. 107.300 / IVA 9754,54545454) y serialización exacta del JSON
  const lineasRef = [linea({ codigoInterno: "R1", precio: "24600" }), linea({ codigoInterno: "R2", precio: "24600" }), linea({ codigoInterno: "R3", precio: "58100" })];
  const jsonRef = JSON.stringify(sinFE({ lineas: lineasRef, pagos: [{ tipo: 1, monto: "107300" }] }));

  cierto("E1 ejemplo de referencia: el JSON serializado lleva total 107300, IVA 9754.54545454, base 97545.45454546, pago 107300 como números (sin comillas, sin notación exponencial) y los tres ítems", jsonRef.includes('"dTotGralOpe":107300') && jsonRef.includes('"dTotIVA":9754.54545454') && jsonRef.includes('"dLiqTotIVA10":9754.54545454') && jsonRef.includes('"dBaseGrav10":97545.45454546') && jsonRef.includes('"dMonTiPag":107300') && !/[0-9]e[-+]?[0-9]/.test(jsonRef) && (jsonRef.match(/"dCodInt"/g) ?? []).length === 3);
  igual("E1 serialización: tipos del JSON funcional — dDVRec y dNumCasRec numéricos, RUC y códigos en texto, cantidades y precios numéricos", (() => { const p = sinFE(); const d = detFE(p)[0]; return [typeof p.dDVRec, typeof p.dNumCasRec, typeof p.dRucRec, typeof p.cPaisRec, typeof d.dCantProSer, typeof d.dPUniProSer, typeof d.dCodInt, typeof d.cUniMed]; })(), ["number", "number", "string", "string", "number", "number", "string", "number"]);
  cierto("E1 serialización: un importe que JavaScript no representa sin perder dígitos (≥ 16 cifras significativas) o que caería en notación exponencial (1e-8) se rechaza antes de emitir; los importes normales y los 8 decimales exactos no", /perder precisión/.test(errorDe(entradaFE({ lineas: [linea({ precio: "0.00000001" })], pagos: [{ tipo: 1, monto: "0.00000001" }] }))) && /perder precisión/.test(errorDe(entradaFE({ lineas: [linea({ precio: "999999999.99999999", afectacion: 3, tasa: 0 })], pagos: [{ tipo: 1, monto: "999999999.9999" }] }))) && validarEntradaFE(entradaFE({ lineas: lineasRef, pagos: [{ tipo: 1, monto: "107300" }] })).length === 0 && validarEntradaFE(entradaFE({ lineas: [linea({ precio: "0.5", afectacion: 3, tasa: 0 })], pagos: [{ tipo: 1, monto: "0.5" }] })).length === 0);

  // Cantidades y precios decimales + conciliación ítems ↔ total ↔ pago (FAT-E1-R01-01): sin ajuste, tolerancia ni redondeo inventados
  const valida = (lineas: LineaFE[], monto: string) => validarEntradaFE(entradaFE({ lineas, pagos: [{ tipo: 1, monto }] }));
  const parcialExacto = linea({ codigoInterno: "PX", precio: "10500", afectacion: 4, tasa: 10, proporcion: "50" });

  igual("R01 decimales: cantidades fraccionarias cuyo total cabe en 4 decimales se emiten con pago igual al total; con más de 4 decimales se bloquea con mensaje claro (no se redondea el pago)", [
    valida([linea({ cantidad: "0.25", precio: "100.5", afectacion: 3, tasa: 0 })], "25.125").length,
    valida([linea({ cantidad: "0.3333", precio: "100.5555", afectacion: 3, tasa: 0 })], "33.51514815").join("|").includes("más de 4 decimales"),
    valida([linea({ cantidad: "0.3333", precio: "100.5555", afectacion: 3, tasa: 0 })], "33.5151").join("|").includes("más de 4 decimales"),
    valida([linea({ cantidad: "0.5", precio: "3333.3333", afectacion: 3, tasa: 0 })], "1666.66665").join("|").includes("más de 4 decimales"),
    valida([linea({ cantidad: "2.5", precio: "10000", afectacion: 1, tasa: 10 })], "25000").length,
  ], [0, true, true, true, 0]);
  igual("R01 gravado parcial: con residuo de redondeo (11.000 al 50 % → total 11000.00000001 frente a la suma de ítems 11000) NO se emite y el mensaje explica la causa; sin residuo (10.500 al 50 %) se emite con total, pago y suma de ítems idénticos", (() => {
    const sinResiduo = sinFE({ lineas: [parcialExacto], pagos: [{ tipo: 1, monto: "10500" }] });
    const s = subFE(sinResiduo);

    return [
      valida([parcialExacto], "10500").length, [s.dTotOpe, s.dTotGralOpe, s.dTotalGs, (sinResiduo.FormaPago as Array<Record<string, number>>)[0].dMonTiPag, detFE(sinResiduo)[0].dTotOpeItem],
      valida([linea({ precio: "11000", afectacion: 4, tasa: 10, proporcion: "50" })], "11000").join("|").includes("difiere de la suma de los ítems"),
      valida([linea({ precio: "11000", afectacion: 4, tasa: 10, proporcion: "50" })], "11000.00000001").join("|").includes("difiere de la suma de los ítems"),
      valida(mixto, "40500").length > 0,
    ];
  })(), [0, [10500, 10500, 10500, 10500, 10500], true, true, true]);
  igual("R01 mezcla: la factura mixta sin el parcial con residuo concilia (suma de ítems = F008 = F014 = pago) con IVA 5 %, 10 %, exento y exonerado; añadir el parcial con residuo la bloquea; con el parcial exacto concilia", (() => {
    const sin = mixto.slice(0, 4);
    const con = [...sin, parcialExacto];
    const p = sinFE({ lineas: con, pagos: [{ tipo: 1, monto: "40000" }] });
    const s = subFE(p) as Record<string, number>;

    return [valida(sin, "29500").length, valida(con, "40000").length, [s.dTotOpe, s.dTotGralOpe, (p.FormaPago as Array<Record<string, number>>)[0].dMonTiPag], valida([...sin, mixto[4]], "40500").length > 0];
  })(), [0, 0, [40000, 40000, 40000], true]);
  cierto("R01 barrido determinista: para precios 1–400 de un ítem parcial (50 % y 33,5 %, tasas 5 y 10) la validación acepta SOLO cuando base + IVA + base exenta = valor del ítem; lo aceptado cumple dTotGralOpe = Σ dTotOpeItem = pago; lo rechazado nunca se emite", (() => {
    let aceptados = 0;
    let rechazados = 0;

    for (const [prop, tasa] of [["50", 10], ["50", 5], ["33.5", 10], ["33.5", 5]] as const) {
      for (let p = 1; p <= 400; p++) {
        const precio = String(p);
        const l = linea({ precio, afectacion: 4, tasa, proporcion: prop });
        const r = calcularItem({ cantidad: dec("1"), precioUnitario: dec(precio), afectacion: 4, tasa, proporcion: dec(prop) });
        const concilia = r.baseGravada + r.liquidacion + r.baseExenta === r.totOperacion;
        const errores = valida([l], precio);

        if ((errores.length === 0) !== concilia) return false;
        if (concilia) {
          const pl = sinFE({ lineas: [l], pagos: [{ tipo: 1, monto: precio }] });
          const s = subFE(pl);

          if (s.dTotGralOpe !== p || s.dTotOpe !== p || (pl.FormaPago as Array<Record<string, number>>)[0].dMonTiPag !== p || detFE(pl)[0].dTotOpeItem !== p) return false;
          aceptados++;
        } else rechazados++;
      }
    }

    return aceptados > 0 && rechazados > 0;
  })());
  cierto("R01 invariante sin parcial: con gravado 5 %, 10 %, exento y exonerado el total de la operación es SIEMPRE la suma exacta de los ítems (ningún residuo) para cantidades y precios decimales", (() => {
    for (const afec of [1, 2, 3] as const) {
      for (const [cant, precio] of [["1", "1"], ["3", "1"], ["7", "3333"], ["0.5", "3333.3333"], ["1.2345", "100"], ["0.0001", "9999.9999"], ["12.3456", "7.7777"], ["100", "24600"]]) {
        const tasa = afec === 1 ? 10 : 0;
        const l = linea({ cantidad: cant, precio, afectacion: afec, tasa });
        const total = totalFactura([l])!;
        const r = calcularItem({ cantidad: dec(cant), precioUnitario: dec(precio), afectacion: afec, tasa, proporcion: afec === 1 ? dec("100") : dec("0") });

        if (total !== r.totOperacion) return false;
      }
    }

    return true;
  })());
  igual("R01 pago: debe ser exactamente el total (ni redondeado ni con tolerancia); con total entero la referencia 107.300 / IVA 9754.54545454 sigue emitiéndose", [
    valida(lineasRef, "107300").length, valida(lineasRef, "107299.9999").length > 0, valida(lineasRef, "107300.0001").length > 0, valida(lineasRef, "107300.00000001").length > 0,
    valida([linea({ cantidad: "0.25", precio: "100.5", afectacion: 3, tasa: 0 })], "25.13").length > 0,
  ], [0, true, true, true, true]);
  cierto("R01 el servidor y el payload no ajustan el pago: no existe redondeo de pago ni dRedon distinto de 0; el monto de pago de emision.ts es el total calculado", !/montoPagoDe/.test(leer("lib/facturacion/emision.ts") + leer("lib/facturacion/payload-fe.ts")) && /resolverMontos\(cuerpo\.pagos, objetivo\)/.test(leer("lib/facturacion/emision.ts")) && subFE(sinFE()).dRedon === 0);
  cierto("R01 límites: total ≥ 1.000.000.000.000 se rechaza, 999.999.999.999 se emite; total mínimo 0,0001 se emite y 0,00000001 (no representable) se rechaza", valida([linea({ precio: "1000000000000", afectacion: 3, tasa: 0 })], "1000000000000").join("|").includes("máximo") && valida([linea({ precio: "999999999999", afectacion: 3, tasa: 0 })], "999999999999").length === 0 && valida([linea({ cantidad: "0.0001", precio: "1", afectacion: 3, tasa: 0 })], "0.0001").length === 0 && valida([linea({ precio: "0.00000001", afectacion: 3, tasa: 0 })], "0.00000001").length > 0);
  cierto("R01 idempotencia: la misma entrada produce byte a byte el mismo JSON (orden de claves y valores) en llamadas repetidas, para la referencia y para el parcial exacto", JSON.stringify(sinFE({ lineas: lineasRef, pagos: [{ tipo: 1, monto: "107300" }] })) === JSON.stringify(sinFE({ lineas: lineasRef, pagos: [{ tipo: 1, monto: "107300" }] })) && JSON.stringify(sinFE({ lineas: [parcialExacto], pagos: [{ tipo: 1, monto: "10500" }] })) === JSON.stringify(sinFE({ lineas: [parcialExacto], pagos: [{ tipo: 1, monto: "10500" }] })));
  igual("R01 protección del constructor: construirPayloadFE aplica la validación completa por sí mismo y NO produce JSON con residuo parcial, pago distinto del total, receptor incompleto, precisión no representable ni total de más de 4 decimales; los casos válidos siguen construyéndose", (() => {
    const cae = (e: EntradaFE) => { try { construirPayloadFE(e); return false; } catch (x) { return x instanceof Error && /no es válida/.test(x.message); } };

    return [
      cae(entradaFE({ lineas: [linea({ precio: "11000", afectacion: 4, tasa: 10, proporcion: "50" })], pagos: [{ tipo: 1, monto: "11000" }] })),
      cae(entradaFE({ pagos: [{ tipo: 1, monto: "10999" }] })),
      cae(entradaFE({ receptor: { ...receptor, dv: "" } })),
      cae(entradaFE({ lineas: [linea({ precio: "0.00000001", afectacion: 3, tasa: 0 })], pagos: [{ tipo: 1, monto: "0.00000001" }] })),
      cae(entradaFE({ lineas: [linea({ cantidad: "0.3333", precio: "100.5555", afectacion: 3, tasa: 0 })], pagos: [{ tipo: 1, monto: "33.51514815" }] })),
      cae(entradaFE({ pagos: [{ tipo: 2, monto: "11000" }] })),
      cae(entradaFE()), JSON.stringify(construirPayloadFE(entradaFE())) === JSON.stringify(sinFE()),
    ];
  })(), [true, true, true, true, true, true, false, true]);
  igual("E1 cantidad: hasta 10 dígitos enteros (NT 023, E711) y mayor que cero; con 11 dígitos se rechaza aunque el total quepa", [
    errorDe(entradaFE({ lineas: [linea({ cantidad: "10000000000", precio: "0.01", afectacion: 3, tasa: 0 })], pagos: [{ tipo: 1, monto: "100000000" }] })).includes("10 dígitos enteros"),
    validarEntradaFE(entradaFE({ lineas: [linea({ cantidad: "9999999999", precio: "1", afectacion: 3, tasa: 0 })], pagos: [{ tipo: 1, monto: "9999999999" }] })).length,
    validarEntradaFE(entradaFE({ lineas: [linea({ cantidad: "0.0001", precio: "10000", afectacion: 3, tasa: 0 })], pagos: [{ tipo: 1, monto: "1" }] })).length,
  ], [true, 0, 0]);

  // Unidad SIFEN
  igual("E1 unidad SIFEN (E709, N 1-5): null, 0, negativa, no entera o de 6 dígitos se rechazan; 77 y 99999 se aceptan (la vigencia en el catálogo oficial la verifica el servidor contra unidades_medida_sifen)", [null, 0, -1, 7.5, 100000, 77, 99999].map((u) => validarEntradaFE(entradaFE({ lineas: [linea({ unidadSifen: u })] })).some((m) => /unidad de medida/.test(m))), [true, true, true, true, true, false, false]);

  // Receptor: contribuyente / no contribuyente / Innominado / B2F
  const nc = (extra: Partial<ReceptorFE> = {}): ReceptorFE => ({ ...receptor, naturaleza: 2, tipoOperacion: 2, tipoContribuyente: null, ruc: "", dv: "", tipoDocumentoIdentidad: 1, descripcionTipoDocumento: "", numeroDocumento: "1234567", razonSocial: "JUAN PEREZ", ...extra });

  igual("E1 receptor contribuyente: RUC de 3 a 8 dígitos, DV de exactamente 1 dígito, tipo de contribuyente 1 o 2 (D205) y razón social de 4 a 255", [
    { ruc: "12", dv: "6" }, { ruc: "123456789", dv: "6" }, { ruc: "80000005", dv: "12" }, { ruc: "80000005", dv: "x" }, { ruc: "80000005", dv: "" }, { tipoContribuyente: null }, { razonSocial: "AB" }, { razonSocial: "A".repeat(256) }, { ruc: "80000005", dv: "0", tipoContribuyente: 1, razonSocial: "ABCD" }, { ruc: "300", dv: "9", tipoContribuyente: 2, razonSocial: "A".repeat(255) },
  ].map((r) => validarEntradaFE(entradaFE({ receptor: { ...receptor, ...r } as ReceptorFE })).length > 0), [true, true, true, true, true, true, true, true, false, false]);
  igual("E1 receptor contribuyente: informa RUC, DV numérico y tipo de contribuyente y NO informa documento de identidad (D208/D209/D210)", (() => { const p = sinFE(); return [p.iNatRec, p.iTiContRec, p.dRucRec, p.dDVRec, p.iTipIDRec, p.dDTipIDRec, p.dNumIDRec]; })(), [1, 2, "80000005", 6, null, null, null]);
  igual("E1 receptor no contribuyente: tipo de documento, descripción del catálogo del MT (D209), número y NO RUC ni tipo de contribuyente; códigos 1–6 con su descripción oficial y 9 con la del cadastro", [1, 2, 3, 4, 6].map((c) => { const p = sinFE({ receptor: nc({ tipoDocumentoIdentidad: c }) }); return [p.iTipIDRec, p.dDTipIDRec, p.dNumIDRec, p.dRucRec, p.dDVRec, p.iTiContRec]; }).concat([(() => { const p = sinFE({ receptor: nc({ tipoDocumentoIdentidad: 9, descripcionTipoDocumento: "Registro especial" }) }); return [p.iTipIDRec, p.dDTipIDRec, p.dNumIDRec, p.dRucRec, p.dDVRec, p.iTiContRec]; })()]), [
    [1, "Cédula paraguaya", "1234567", null, null, null], [2, "Pasaporte", "1234567", null, null, null], [3, "Cédula extranjera", "1234567", null, null, null], [4, "Carnet de residencia", "1234567", null, null, null],
    [6, "Tarjeta Diplomática de exoneración fiscal", "1234567", null, null, null], [9, "Registro especial", "1234567", null, null, null],
  ]);
  cierto("E1 receptor no contribuyente: D209 cumple la longitud 9–41 del MT en todo el catálogo; «Otro» exige descripción de 9 a 41 caracteres y el tipo debe ser 1–6 o 9; el número, máximo 20", Object.values(DESCRIPCION_TIPO_DOCUMENTO).every((d) => d.length >= 9 && d.length <= 41) && validarEntradaFE(entradaFE({ receptor: nc({ tipoDocumentoIdentidad: 9, descripcionTipoDocumento: "corto" }) })).length > 0 && validarEntradaFE(entradaFE({ receptor: nc({ tipoDocumentoIdentidad: 9, descripcionTipoDocumento: "A".repeat(42) }) })).length > 0 && validarEntradaFE(entradaFE({ receptor: nc({ tipoDocumentoIdentidad: 9, descripcionTipoDocumento: "A".repeat(41) }) })).length === 0 && validarEntradaFE(entradaFE({ receptor: nc({ tipoDocumentoIdentidad: 7 }) })).length > 0 && validarEntradaFE(entradaFE({ receptor: nc({ numeroDocumento: "1".repeat(21) }) })).length > 0 && validarEntradaFE(entradaFE({ receptor: nc({ numeroDocumento: "1".repeat(20) }) })).length === 0);
  igual("E1 Innominado: B2C con documento «0» y nombre «Sin Nombre» valida y se serializa así (D210/D211, NT 023); otro número o nombre, B2B o tipo distinto se rechazan", (() => {
    const inn = (extra: Partial<ReceptorFE> = {}) => nc({ tipoDocumentoIdentidad: 5, descripcionTipoDocumento: "", numeroDocumento: "0", razonSocial: "Sin Nombre", direccion: "", numeroCasa: "", departamento: "", distrito: "", ciudad: "", ...extra });
    const p = sinFE({ receptor: inn() });

    return [validarEntradaFE(entradaFE({ receptor: inn() })).length, [p.iTipIDRec, p.dDTipIDRec, p.dNumIDRec, p.dNomRec, p.dDirRec, p.dNumCasRec], validarEntradaFE(entradaFE({ receptor: inn({ numeroDocumento: "123" }) })).length > 0, validarEntradaFE(entradaFE({ receptor: inn({ razonSocial: "JUAN PEREZ" }) })).length > 0, validarEntradaFE(entradaFE({ receptor: inn({ tipoOperacion: 1 }) })).length > 0];
  })(), [0, [5, "Innominado", "0", "Sin Nombre", null, null], true, true, true]);
  igual("E1 Innominado y límite fiscal (NT 024, D208c): total 6.999.999 se emite; exactamente 7.000.000 y más se rechazan (límite inclusivo), con pago igual al total", ["6999999", "7000000", "7000001"].map((m) => validarEntradaFE(entradaFE({ receptor: nc({ tipoDocumentoIdentidad: 5, descripcionTipoDocumento: "", numeroDocumento: "0", razonSocial: "Sin Nombre", direccion: "", numeroCasa: "", departamento: "", distrito: "", ciudad: "" }), lineas: [linea({ precio: m, afectacion: 3, tasa: 0 })], pagos: [{ tipo: 1, monto: m }] })).some((e) => /7\.000\.000/.test(e))), [false, true, true]);
  igual("E1 B2F (exterior): requiere dirección del receptor (D213), no informa documento y no exige departamento ni ciudad paraguayos", (() => {
    const b2f = (extra: Partial<ReceptorFE> = {}) => nc({ tipoOperacion: 4, pais: "ARG", tipoDocumentoIdentidad: 2, numeroDocumento: "X1", direccion: "Calle 5", numeroCasa: "", departamento: "", distrito: "", ciudad: "", ...extra });
    const p = sinFE({ receptor: b2f() });

    return [validarEntradaFE(entradaFE({ receptor: b2f() })).length, validarEntradaFE(entradaFE({ receptor: b2f({ direccion: "" }) })).length > 0, [p.iTipIDRec, p.dNumIDRec, p.cPaisRec, p.dDirRec, p.dNumCasRec]];
  })(), [0, true, [null, null, "ARG", "Calle 5", 0]]);
  igual("E1 campos opcionales del receptor: vacío → null; con valor → texto sin espacios sobrantes; número de casa solo de 1 a 6 dígitos (si no, 0, parámetro de prueba aprobado), sin dirección → null", (() => {
    const lleno = sinFE({ receptor: { ...receptor, nombreFantasia: " FANTASIA SA ", telefono: "021123456", celular: "0981123456", email: "x@y.com", emailCopia: "c@y.com", emailFacturacion: "f@y.com", numeroCasa: "1234567" } });
    const vacio = sinFE();

    return [[lleno.dNomFanRec, lleno.dTelRec, lleno.dCelRec, lleno.dEmailRec, lleno.dEmailAdic, lleno.dEmailAdmin, lleno.dNumCasRec], [vacio.dNomFanRec, vacio.dTelRec, vacio.dCelRec, vacio.dEmailAdic, vacio.dEmailAdmin]];
  })(), [["FANTASIA SA", "021123456", "0981123456", "x@y.com", "c@y.com", "f@y.com", 0], [null, null, null, null, null]]);
  igual("E1 dCodCliente (D217, opcional, A 3-15): un código interno de 3 a 15 caracteres se envía; fuera de ese rango no se envía (null) y no se acorta ni se inventa", ["AB", "ABC", "CLI-000001", "A".repeat(15), "A".repeat(16)].map((c) => sinFE({ receptor: { ...receptor, codigo: c } }).dCodCliente), [null, "ABC", "CLI-000001", "A".repeat(15), null]);

  // Cabecera de la operación
  igual("E1 cabecera: iTiDE 1, IVA (iTImp 1), PYG sin tipo de cambio, contado (iCondOpe 1) sin crédito ni cuotas, tipo de transacción y presencia del catálogo, información adicional ≤ 5000 (vacía → null)", (() => { const p = sinFE({ tipoTransaccion: 3, presencia: 4, infoAdicional: "  Nota interna  " }); const v = sinFE(); return [p.iTiDE, p.iTImp, p.cMoneOpe, p.dTiCam, p.iCondOpe, p.iCondCred, p.iTipTra, p.iIndPres, p.dInfAdic, v.dInfAdic, validarEntradaFE(entradaFE({ infoAdicional: "x".repeat(5001) })).length > 0, validarEntradaFE(entradaFE({ infoAdicional: "x".repeat(5000) })).length]; })(), [1, 1, "PYG", null, 1, null, 3, 4, "Nota interna", null, true, 0]);
  igual("E1 cabecera: tipos de transacción no habilitados (5–13), presencia «Otro» (9), condición crédito y moneda extranjera se rechazan en el backend", [5, 8, 13].map((x) => validarEntradaFE(entradaFE({ tipoTransaccion: x })).length > 0).concat([validarEntradaFE(entradaFE({ presencia: 9 })).length > 0, validarEntradaFE(entradaFE({ condicion: 2 })).length > 0, validarEntradaFE(entradaFE({ moneda: "USD" })).length > 0]), [true, true, true, true, true, true]);

  // Ítems: código, GTIN, descripción
  igual("E1 ítem: código interno 1–20, descripción 1–120, GTIN 8/12/13/14 dígitos (opcional); fuera de rango se rechaza", [
    { codigoInterno: "" }, { codigoInterno: "C".repeat(21) }, { codigoInterno: "C".repeat(20) }, { descripcion: "" }, { descripcion: "D".repeat(121) }, { descripcion: "D".repeat(120) }, { gtin: "123456789" }, { gtin: "12345678" }, { gtin: "7791234567890" }, { gtin: "ABC12345" }, { gtin: null },
  ].map((x) => validarEntradaFE(entradaFE({ lineas: [linea(x)] })).length > 0), [true, true, false, true, true, false, true, false, false, true, false]);
  igual("E1 ítem: el GTIN válido se serializa como texto y sin GTIN como null; la descripción se envía sin espacios sobrantes", (() => { const d = detFE(sinFE({ lineas: [linea({ gtin: "7791234567890", descripcion: "  Agua  " }), linea({ gtin: null })], pagos: [{ tipo: 1, monto: "22000" }] })); return [d[0].dGtin, d[0].dDesProSer, d[1].dGtin]; })(), ["7791234567890", "Agua", null]);
  igual("E1 datos fiscales incompletos: producto sin afectación, sin precio, sin unidad o con tasa incoherente, y factura sin ítems, se rechazan sin inventar valores", [
    linea({ afectacion: null }), linea({ precio: "0" }), linea({ precio: "" }), linea({ unidadSifen: null }), linea({ afectacion: 1, tasa: null }),
  ].map((l) => validarEntradaFE(entradaFE({ lineas: [l] })).length > 0).concat([validarEntradaFE(entradaFE({ lineas: [] })).length > 0]), [true, true, true, true, true, true]);
  cierto("E1 la construcción rechaza una entrada inválida en vez de producir un JSON parcial", (() => { try { construirPayloadFE(entradaFE({ lineas: [linea({ unidadSifen: null })] })); return false; } catch (e) { return e instanceof Error && /no es válida/.test(e.message); } })());
  cierto("E1 pago: Efectivo (iTiPago 1) con monto igual al total y forma exacta de cuatro claves; se rechazan formas fuera del catálogo, modalidades sin sus datos, pagos sin monto, y no se emite ninguna clave de tipo de cambio ni de tarjeta", [2, 3, 77, 0].every((x) => validarEntradaFE(entradaFE({ pagos: [{ tipo: x, monto: "11000" }] })).length > 0) && validarEntradaFE(entradaFE({ pagos: [] })).length > 0 && validarEntradaFE(entradaFE({ pagos: [{ tipo: 1, monto: "0" }] })).length > 0 && validarEntradaFE(entradaFE({ pagos: [{ tipo: 1, monto: "11001" }] })).length > 0 && JSON.stringify((sinFE().FormaPago as unknown[])[0]) === JSON.stringify({ iTiPago: 1, dMonTiPag: 11000, cMoneTiPag: "PYG", dTiCamTiPag: null }));

  return fallos;
}
