/**
 * Facturación F-01: Documentos electrónicos (NEX-047). Sin red, sin base de datos y SIN credenciales reales: el cliente del gateway se prueba con un
 * `fetch` simulado y datos sintéticos; la migración y la pantalla se analizan como texto.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { contador } from "@/lib/clientes/contador-casos";
import { ETIQUETA_SIFEN, estadoSifenDesdeGateway, numeroDocumento } from "@/lib/facturacion/estados";
import { consultarDocumentoGateway, interpretarConsulta, leerCredenciales, limpiarCacheTokens, sanearRespuesta, tipoDocConsulta, type FetchLike } from "@/lib/facturacion/gateway";
import { construirConsultas, consultarEstado, ErrorFacturacion, leerDocumentos, normalizarConsulta, respuestaErrorFacturacion } from "@/lib/facturacion/shared";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const USUARIO = "99999999-9999-4999-8999-999999999999";
const DOC = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SUC = "55555555-5555-4555-8555-555555555555";
const CDC = "0".repeat(43) + "7"; // sintético
const SECRETO = "clave-sintetica-no-real";
const TOKEN = "token.sintetico.no-real";
const CONFIG = { baseUrl: "https://gateway.prueba.invalid", credencialRef: "PRUEBA", timeoutMs: 1000 };
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
  igual("tipoDoc de consulta: solo NCE está confirmado; FE/NDE/NRE/AFE no se envían hasta confirmar", ["NCE", "FE", "NDE", "NRE", "AFE"].map(tipoDocConsulta), ["NCE", null, null, null, null]);

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
    await consultarDocumentoGateway(CONFIG, { ...NCE, tipo: "FE" }, { fetch: g5.fetch, env: ENV }),
    await consultarDocumentoGateway(CONFIG, NCE, { fetch: g5.fetch, env: {} }),
    g5.llamadas.length,
  ], [{ sinContrato: "TIPO" }, { sinContrato: "CREDENCIALES" }, 0]);

  // ── Listado: alcance, filtros, paginación y orden en el servidor
  const q = construirConsultas(EMPRESA, USUARIO, { q: "50%_x", tipo: "FE", sucursal: SUC, estadoSifen: "APROBADO", grupo: "PEND_ENVIO", desde: "2026-10-01", hasta: "2026-10-12", orden: "total", dir: "asc", tamano: 500 }, 3);

  cierto("listado: empresa y usuario de la sesión son $1/$2 y el alcance de sucursales se exige en conteo y lista", q.conteo.params[0] === EMPRESA && q.conteo.params[1] === USUARIO && /sucursal_en_alcance\(\$1::uuid, \$2::uuid, d\.sucursal_id\)/.test(q.conteo.sql) && /sucursal_en_alcance\(\$1::uuid, \$2::uuid, d\.sucursal_id\)/.test(q.lista.sql) && /d\.empresa_id = \$1/.test(q.lista.sql));
  igual("listado: filtros como parámetros (nunca concatenados) y comodines del texto escapados", [q.conteo.params.slice(2), /ESCAPE '!'/.test(q.conteo.sql)], [["FE", SUC, "APROBADO", "2026-10-01", "2026-10-12", "%50!%!_x%"], true]);
  cierto("listado: fechas de emisión en hora de Paraguay y el grupo del indicador es un fragmento fijo (no texto del usuario)", /AT TIME ZONE 'America\/Asuncion'/.test(q.conteo.sql) && /d\.estado_local IN \('PENDIENTE_ENVIO','ENVIO_INDETERMINADO','ERROR_ENVIO'\)/.test(q.conteo.sql));
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
    await codigoError(consultarEstado({ async query(sql: string) { return /fe_gateway_config/.test(sql) ? { rows: [CONFIG] } : { rows: [{ ...filaDoc, tipo: "FE" }] }; } } as never, EMPRESA, USUARIO, DOC, { fetch: g6.fetch, env: ENV })),
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
  cierto("NEX-047: un CDC distinto del registrado se anota como CDC_DIVERGENTE sin tocar el documento", /p_cdc <> d\.cdc THEN\s+v_resultado := 'CDC_DIVERGENTE'/.test(fn) && /cdc = coalesce\(d\.cdc, p_cdc\)/.test(fn));
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

  cierto("menú: «Documentos electrónicos» es el primer ítem de Facturación y es la única ruta habilitada del grupo (Facturas y Notas de crédito siguen ocultas hasta F-02/F-03)", bloqueBilling.indexOf('"/documentos"') > 0 && bloqueBilling.indexOf('"/documentos"') < bloqueBilling.indexOf('"/facturas"') && /"\/documentos"/.test(bloqueV1) && !/"\/facturas"|"\/notas-credito"|"\/notas-remision"|"\/sifen"/.test(bloqueV1.slice(0, bloqueV1.indexOf("]);"))));
  cierto("layout: /documentos exige FACTURACION_ELECTRONICA.VER; las rutas de facturas siguen bloqueadas (404)", /guardPage\("FACTURACION_ELECTRONICA", "VER"\)/.test(leer("app/(private)/documentos/layout.tsx")) && /notFound\(\)/.test(leer("app/(private)/facturas/layout.tsx")));
  cierto("APIs: sesión + permiso (VER para leer, EDITAR para consultar) y empresa/usuario de la sesión; nada del cuerpo ni del query decide la empresa", apis.every((a) => /prepararFacturacion\("(VER|EDITAR)"\)/.test(a)) && /prepararFacturacion\("EDITAR"\)/.test(apis[2]) && !/empresaId\s*[:=]\s*(p|params|body)\b/.test(todo) && !/get\("empresa/.test(todo));
  cierto("pantalla: servidor decide filtros/paginación/orden (sin datos fijos, mock ni localStorage) y no llama al gateway desde el navegador", /\/api\/documentos\?/.test(pagina) && !/localStorage|sessionStorage|mock|e-factura-hub|api\/login|consulta_de/i.test(pagina));
  cierto("pantalla: estados separados (SIFEN, envío, e-mail) con texto, detalle con CDC/mensaje/historial de consultas y aviso de PDF/XML no disponibles", /SIFEN: \{ETIQUETA_SIFEN/.test(pagina) && /Envío: \{ETIQUETA_LOCAL/.test(pagina) && /ETIQUETA_EMAIL\[d\.estadoEmail\]/.test(pagina) && /Historial de consultas/.test(pagina) && /descarga no disponible/.test(pagina) && /aria-expanded/.test(pagina) && /aria-pressed/.test(pagina));
  cierto("la consulta de estado solo se ofrece con permiso EDITAR", /editar \? \(/.test(pagina) && /Consultar estado en SIFEN/.test(pagina));
  cierto("sin movimiento de stock ni credenciales en el código; la URL del gateway sale de la configuración por empresa, no del código", !/movimientos_inventario|stock_saldos|inventario_registrar_movimiento/.test(todo) && !/e-factura-hub|gateway-bebidas/i.test(todo + mig) && !/(password|ruc)\s*[:=]\s*["'][^"']{3,}/i.test(todo.replace(/\/\/.*$/gm, "")));
  cierto("sin endpoints de PDF/XML ni de recepción inventados", !/recepcion_de|\/pdf|\/xml|kude/i.test(todo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/PDF\/KuDE/g, "")));

  return fallos;
}
