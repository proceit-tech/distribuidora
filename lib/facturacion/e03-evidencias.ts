/**
 * PRO-312-R03 / Lote B — Vía de envío FE/NCE con evidencia R05 (NEX-084 + NEX-085). Solo servidor.
 *
 * Activación: variable de servidor NEXIT_E03_EVIDENCIAS, APAGADA por omisión. Sin la variable (o con "", "0", "off", "false", "no") la emisión y el envío siguen por la vía vigente
 * (NEX-062 + NEX-080) sin ningún cambio; solo el valor explícito "R05" (mayúsculas o minúsculas) activa esta vía; cualquier otro valor es 503 ANTES de numerar (nunca se elige una vía por
 * error de escritura). La decisión se toma UNA vez por operación en el preflight (configuracionGateway) y viaja en la misma configuración hasta el cierre (ConfigGateway.rutaEnvio).
 *
 * Con R05, por operación:
 *   1) preparación (antes de numerar): NEX-080 + las 10 firmas públicas R05 con sus columnas exactas y EXECUTE, las 32 internas SIN EXECUTE (NEX-085), estado legible y modo ACTIVO;
 *      si algo falta: 503, sin número ni HTTP, y SIN volver a la vía directa;
 *   2) correlación (UUID) y testigo (256 bits aleatorios, base64url) creados aquí, solo en memoria: nunca salen en respuestas, logs, errores ni persistencia (la base guarda su hash);
 *   3) fe_e03_iniciar_envio_r05 (envuelve NEX-062) con la referencia NO secreta de la misma configuración; INDETERMINADO / YA_ENVIADO / no vigente: sin POST;
 *   4) autenticación registrada ANTES de cualquier POST (origen CACHE con HTTP nulo, o HTTP real; OK por HTTP solo con 200);
 *   5) el snapshot se serializa UNA vez (JSON.stringify) y ESE texto exacto se registra (fe_e03_registrar_post_r05: hash y bytes verificados contra los locales) y se transmite;
 *      sin confirmación durable del POST no hay fetch; a lo sumo un fetch por número de POST y proceso (bandera local antes del fetch);
 *   6) cada salida se registra (HTTP_RESPUESTA con P v1 o con el motivo de su ausencia; ERROR_TRANSMISION TIMEOUT/RED); si la vía normal ya no la admite, como salida TARDÍA;
 *   7) segundo POST SOLO tras token inválido acreditado en el POST 1 (salida persistida con P, regla R-01, HTTP 4xx) y renovación forzada por HTTP registrada OK; máximo dos;
 *   8) cierre con fe_e03_cerrar_envio_r05 y la clasificación esperada EXACTA (réplica local de la derivación); evidencia insuficiente → ENVIO_INDETERMINADO (D-C02-2-A);
 *   9) incertidumbre de una escritura SQL (conexión perdida, etc.): se repite la MISMA escritura (idempotente) con límite; agotado, se recupera la operación exacta con
 *      fe_e03_estado_operacion_r05 y se cierra solo con una clasificación derivable coherente con lo intentado o indeterminada; nunca se vuelve a NEX-080 directo ni se reenvía.
 * Nada aquí fija estado_sifen: un ACK del gateway (ENVIADO) no es aprobación SIFEN. Stock, numeración, saldos NCE, impuestos, descuentos y KuDE no se tocan.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { Pool } from "pg";

import {
  autenticarGatewayR05, CONTRATO_FISCAL_ENVIO, credencialesDe, hechosRecepcion, interpretarRecepcion, referenciaConexion, resultadoFiscalSinSecretos, seriePayload, transmitirRecepcionTexto,
  type ConfigGateway, type Dependencias, type DocumentoRecepcion, type FaseEnvio, type ResultadoEnvio, type SalidaTransporte,
} from "@/lib/facturacion/gateway";
import {
  construirProyeccion, derivarCierre, identidadDeSnapshot, MENSAJES_CIERRE, tokenRechazadoPost1, type CierreDerivado, type Clasificacion, type LibroOperacion, type MotivoSinProyeccion, type ProyeccionP, type SalidaLocal,
} from "@/lib/facturacion/e03-proyeccion";
import { ErrorFacturacion, exigirNex080 } from "@/lib/facturacion/shared";

type Db = Pick<Pool, "query">;
type F = Record<string, unknown>;

// ── Bandera ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const VARIABLE_RUTA_E03 = "NEXIT_E03_EVIDENCIAS";
export type RutaEnvio = "VIGENTE" | "R05";

export const MENSAJE_RUTA_INVALIDA =
  "La configuración del servidor para las evidencias de envío no es válida: no se numeró ni se transmitió nada. Avise al administrador.";
export const MENSAJE_R05_NO_DISPONIBLE =
  "Las evidencias de envío están activadas en el servidor pero la base no está preparada (NEX-084/NEX-085, modo o permisos): no se numeró ni se transmitió nada. Avise al administrador.";

const APAGADA = new Set(["", "0", "off", "false", "no"]);

/** Vía de envío según la variable del SERVIDOR (nunca del navegador). Ausente o apagada = VIGENTE; "R05" = R05; otro valor = 503 antes de numerar. */
export function rutaEnvioE03(env: Record<string, string | undefined>): RutaEnvio {
  const valor = env[VARIABLE_RUTA_E03];

  if (valor === undefined) return "VIGENTE";

  const t = valor.trim().toLowerCase();

  if (APAGADA.has(t)) return "VIGENTE";
  if (t === "r05") return "R05";

  throw new ErrorFacturacion(503, MENSAJE_RUTA_INVALIDA);
}

// ── Preparación (readiness) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Las 10 funciones públicas R05 (7 escrituras + 3 lecturas) con sus firmas exactas y las columnas de salida que esta aplicación lee. */
export const FIRMAS_R05: ReadonlyArray<{ firma: string; columnas: readonly string[] }> = [
  { firma: "public.fe_e03_iniciar_envio_r05(uuid,uuid,uuid,boolean,uuid,text,jsonb)", columnas: ["o_resultado", "o_payload", "o_numero", "o_tipo", "o_establecimiento", "o_punto", "o_version", "o_payload_hash", "o_operacion_id", "o_reutilizado", "o_vigente"] },
  { firma: "public.fe_e03_registrar_autenticacion_r05(uuid,uuid,uuid,uuid,text,text,text,text,integer)", columnas: ["o_nro", "o_reutilizado"] },
  { firma: "public.fe_e03_registrar_post_r05(uuid,uuid,uuid,uuid,text,smallint,text)", columnas: ["o_nro_post", "o_almacenamiento", "o_solicitud_sha256", "o_solicitud_bytes", "o_reutilizado"] },
  { firma: "public.fe_e03_registrar_salida_r05(uuid,uuid,uuid,uuid,text,smallint,text,integer,jsonb,boolean,text,jsonb,text)", columnas: ["o_evento_id", "o_regla", "o_cotejo", "o_reutilizado"] },
  { firma: "public.fe_e03_registrar_no_transmitido_r05(uuid,uuid,uuid,uuid,text,text)", columnas: ["o_evento_id", "o_reutilizado"] },
  {
    firma: "public.fe_e03_cerrar_envio_r05(uuid,uuid,uuid,uuid,text,jsonb)",
    columnas: ["o_estado_local", "o_intento_id", "o_regla", "o_reutilizado", "o_fase", "o_resultado", "o_error_tipo", "o_motivo", "o_salida_ultimo_post", "o_http_post", "o_http_autenticacion", "o_lote", "o_cdc", "o_cerrado_at", "o_estado_documento_actual"],
  },
  { firma: "public.fe_e03_registrar_salida_tardia_r05(uuid,uuid,uuid,uuid,text,smallint,text,integer,jsonb,boolean,text,jsonb,text)", columnas: ["o_salida_id", "o_motivo", "o_estado_proyeccion", "o_reutilizado"] },
  { firma: "public.fe_e03_operacion_por_correlacion_r05(uuid,uuid,uuid,uuid)", columnas: ["o_operacion_id", "o_version", "o_vigente", "o_cerrada", "o_creado_at"] },
  {
    firma: "public.fe_e03_estado_operacion_r05(uuid,uuid,uuid,uuid)",
    columnas: [
      "o_operacion_id", "o_version", "o_correlacion_id", "o_creado_at", "o_vigente", "o_motivo_no_vigente", "o_no_transmitido",
      "o_aut1_existe", "o_aut1_origen", "o_aut1_resultado", "o_aut1_http", "o_aut2_existe", "o_aut2_origen", "o_aut2_resultado", "o_aut2_http",
      "o_n_posts", "o_ultimo_post", "o_ultimo_post_id", "o_ultimo_post_almacenamiento", "o_ultimo_post_at",
      "o_salida_ultimo_post", "o_http_ultimo_post", "o_error_transmision", "o_proyeccion_ultimo_post",
      "o_regla_salida", "o_resultado_salida", "o_estado_local_salida", "o_error_tipo_salida", "o_motivo_sin_proyeccion", "o_cotejo_salida", "o_campos_cotejados",
      "o_tardia_tipo", "o_tardia_http", "o_tardia_estado_proyeccion", "o_cierre_derivable", "o_clasificacion_derivable", "o_motivo_no_derivable",
      "o_cerrada", "o_regla", "o_fase", "o_resultado_historico", "o_estado_local_historico", "o_error_tipo", "o_motivo", "o_intento_id", "o_http_post", "o_http_autenticacion",
      "o_lote", "o_cdc", "o_cerrado_at", "o_estado_documento_actual", "o_estado_sifen_actual",
    ],
  },
  { firma: "public.fe_e03_conexion_referencia_r05(uuid,uuid,uuid)", columnas: ["o_conexion", "o_origen", "o_referencia_id", "o_instante", "o_ambigua"] },
];

/** Las 32 internas de NEX-084 que, tras NEX-085, NO tienen EXECUTE para el rol de la aplicación (triggers, ayudantes, P, clasificación, cotejo, derivación y privilegios). */
export const INTERNAS_R05: readonly string[] = [
  "public.nex_e03_r05_estado_guarda()", "public.fe_e03_r05_operacion_inicio_guarda()", "public.fe_e03_r05_evidencia_guarda()", "public.fe_e03_r05_post_grande_guarda()",
  "public.fe_e03_r05_claves_exactas(jsonb,text[])", "public.fe_e03_r05_bool(jsonb)", "public.fe_e03_r05_entero(jsonb,numeric,numeric)", "public.fe_e03_r05_texto(jsonb,integer,boolean)",
  "public.fe_e03_r05_enum(jsonb,text[])", "public.fe_e03_r05_lote_valido(text)", "public.fe_e03_r05_lote_nex080(text)", "public.fe_e03_r05_alterado(jsonb)", "public.fe_e03_r05_astral(text)",
  "public.fe_e03_r05_trim_js(text)", "public.fe_e03_r05_clase_eco(text,jsonb,jsonb,text)", "public.fe_e03_r05_token_mensaje(jsonb)",
  "public.fe_e03_r05_validar_proyeccion(jsonb,integer,text,text,text,text,jsonb)", "public.fe_e03_r05_sanear_proyeccion(jsonb)", "public.fe_e03_clasificar_recepcion_r05(jsonb,text)",
  "public.fe_e03_r05_cotejar(jsonb,jsonb,boolean,boolean)", "public.fe_e03_r05_procesar_proyeccion(jsonb,integer,text,text,text,text,jsonb,jsonb,boolean,boolean)",
  "public.fe_e03_r05_exigir_activo()", "public.fe_e03_r05_preparar(uuid,uuid,uuid)", "public.fe_e03_r05_hash_testigo(text)", "public.fe_e03_r05_operacion(uuid,uuid,uuid,uuid,text)",
  "public.fe_e03_r05_no_vigente(uuid,uuid,uuid,text)", "public.fe_e03_r05_token_rechazado_post1(uuid,uuid,uuid)", "public.fe_e03_r05_posts(uuid,uuid,uuid)",
  "public.fe_e03_r05_ultima_actividad(uuid,uuid,uuid)", "public.fe_e03_r05_abiertas(timestamptz)", "public.fe_e03_r05_derivar_cierre(uuid,uuid,uuid)", "public.nex_aplicar_grants_facturacion_e03_r05()",
];

/**
 * Catálogo en UNA lectura (solo lectura, parámetros): firmas públicas presentes con EXECUTE y columnas de salida exactas; internas presentes y SIN EXECUTE; tabla de estado legible.
 * $1 = firmas públicas, $2 = columnas esperadas de cada una («,»), $3 = internas.
 */
export const SQL_PREPARACION_R05 = `SELECT
  (SELECT count(*) FROM unnest($1::text[], $2::text[]) AS f(firma, columnas)
    WHERE to_regprocedure(f.firma) IS NOT NULL AND has_function_privilege(to_regprocedure(f.firma)::oid, 'EXECUTE')
      AND (SELECT string_agg(a.nombre, ',' ORDER BY a.orden) FROM pg_proc p, unnest(p.proargnames, p.proargmodes::text[]) WITH ORDINALITY AS a(nombre, modo, orden)
            WHERE p.oid = to_regprocedure(f.firma)::oid AND a.modo = 't') = f.columnas)::integer AS "publicas",
  (SELECT count(*) FROM unnest($3::text[]) AS i(firma) WHERE to_regprocedure(i.firma) IS NOT NULL)::integer AS "internasPresentes",
  (SELECT count(*) FROM unnest($3::text[]) AS i(firma) WHERE to_regprocedure(i.firma) IS NOT NULL AND has_function_privilege(to_regprocedure(i.firma)::oid, 'EXECUTE'))::integer AS "internasExpuestas",
  coalesce(to_regclass('public.nex_e03_r05_estado') IS NOT NULL AND has_table_privilege(to_regclass('public.nex_e03_r05_estado')::oid, 'SELECT'), false) AS "estadoLegible"`;

export const SQL_MODO_R05 = `SELECT modo FROM public.nex_e03_r05_estado WHERE id`;

/**
 * Preparación de la vía R05 ANTES de numerar o transmitir. Cualquier falta (NEX-080, firmas, columnas, EXECUTE de escritura —que NEX-084 retira en modo REVERTIDO—, internas expuestas,
 * estado ilegible, modo distinto de ACTIVO o error de lectura) es 503 sin detalles internos; no hay vuelta a la vía directa. Las guardas SQL vuelven a exigir el modo en cada escritura.
 */
export async function exigirPreparacionR05(db: Db): Promise<void> {
  await exigirNex080(db);

  let lista = false;

  try {
    const c = await db.query(SQL_PREPARACION_R05, [FIRMAS_R05.map((x) => x.firma), FIRMAS_R05.map((x) => x.columnas.join(",")), INTERNAS_R05]);
    const f = c.rows[0] as F | undefined;

    if (f && Number(f.publicas) === FIRMAS_R05.length && Number(f.internasPresentes) === INTERNAS_R05.length && Number(f.internasExpuestas) === 0 && f.estadoLegible === true) {
      const m = await db.query(SQL_MODO_R05);

      lista = m.rows.length === 1 && (m.rows[0] as F).modo === "ACTIVO";
    }
  } catch {
    lista = false;
  }
  if (!lista) throw new ErrorFacturacion(503, MENSAJE_R05_NO_DISPONIBLE);
}

// ── Adaptador SQL (7 escrituras + 3 lecturas; solo funciones públicas, parámetros con tipos exactos, sin DML directo) ──────────────────────────────
export const SQL_R05 = {
  iniciar: `SELECT o_resultado AS "resultado", o_payload AS "payload", o_numero AS "numero", o_tipo AS "tipo", o_establecimiento AS "establecimiento", o_punto AS "punto", o_version AS "version", o_payload_hash AS "payloadHash", o_operacion_id AS "operacionId", o_reutilizado AS "reutilizado", o_vigente AS "vigente" FROM public.fe_e03_iniciar_envio_r05($1::uuid, $2::uuid, $3::uuid, $4::boolean, $5::uuid, $6::text, $7::jsonb)`,
  autenticacion: `SELECT o_nro AS "nro", o_reutilizado AS "reutilizado" FROM public.fe_e03_registrar_autenticacion_r05($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::text, $7::text, $8::text, $9::integer)`,
  post: `SELECT o_nro_post AS "nroPost", o_almacenamiento AS "almacenamiento", o_solicitud_sha256 AS "sha256", o_solicitud_bytes AS "bytes", o_reutilizado AS "reutilizado" FROM public.fe_e03_registrar_post_r05($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::smallint, $7::text)`,
  salida: `SELECT o_evento_id AS "eventoId", o_regla AS "regla", o_cotejo AS "cotejo", o_reutilizado AS "reutilizado" FROM public.fe_e03_registrar_salida_r05($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::smallint, $7::text, $8::integer, $9::jsonb, $10::boolean, $11::text, $12::jsonb, $13::text)`,
  salidaTardia: `SELECT o_salida_id AS "salidaId", o_motivo AS "motivo", o_estado_proyeccion AS "estadoProyeccion", o_reutilizado AS "reutilizado" FROM public.fe_e03_registrar_salida_tardia_r05($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::smallint, $7::text, $8::integer, $9::jsonb, $10::boolean, $11::text, $12::jsonb, $13::text)`,
  noTransmitido: `SELECT o_evento_id AS "eventoId", o_reutilizado AS "reutilizado" FROM public.fe_e03_registrar_no_transmitido_r05($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::text)`,
  cerrar: `SELECT o_estado_local AS "estadoLocal", o_intento_id AS "intentoId", o_regla AS "regla", o_reutilizado AS "reutilizado", o_fase AS "fase", o_resultado AS "resultado", o_error_tipo AS "errorTipo", o_motivo AS "motivo", o_salida_ultimo_post AS "salidaUltimoPost", o_http_post AS "httpPost", o_http_autenticacion AS "httpAutenticacion", o_lote AS "lote", o_cdc AS "cdc", o_cerrado_at AS "cerradoAt", o_estado_documento_actual AS "estadoDocumentoActual" FROM public.fe_e03_cerrar_envio_r05($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::jsonb)`,
  estado: `SELECT o_operacion_id AS "operacionId", o_vigente AS "vigente", o_motivo_no_vigente AS "motivoNoVigente", o_cierre_derivable AS "cierreDerivable", o_clasificacion_derivable AS "clasificacionDerivable", o_motivo_no_derivable AS "motivoNoDerivable", o_cerrada AS "cerrada", o_regla AS "regla", o_fase AS "fase", o_resultado_historico AS "resultadoHistorico", o_estado_local_historico AS "estadoLocalHistorico", o_error_tipo AS "errorTipo", o_motivo AS "motivo", o_http_post AS "httpPost", o_http_autenticacion AS "httpAutenticacion", o_lote AS "lote", o_cdc AS "cdc", o_estado_documento_actual AS "estadoDocumentoActual" FROM public.fe_e03_estado_operacion_r05($1::uuid, $2::uuid, $3::uuid, $4::uuid)`,
  porCorrelacion: `SELECT o_operacion_id AS "operacionId", o_version AS "version", o_vigente AS "vigente", o_cerrada AS "cerrada" FROM public.fe_e03_operacion_por_correlacion_r05($1::uuid, $2::uuid, $3::uuid, $4::uuid)`,
} as const;

/** Repeticiones de UNA escritura cuya confirmación es incierta (siempre la MISMA operación, testigo y argumentos: las funciones son idempotentes). */
export const INTENTOS_SQL = 3;

const detalleNex = (e: unknown): string | null => {
  const d = (e as { detail?: unknown } | null)?.detail;

  return typeof d === "string" && d.startsWith("NEX:") ? d.slice(4) : null;
};

/**
 * Confirmación INCIERTA: no se sabe si la escritura se confirmó (conexión perdida o cortada, cancelación, reinicio del servidor, falta de recursos, conflicto de serialización) o el error no
 * trae un SQLSTATE. Los errores de negocio (NEX:…) y de permisos (42501) son definitivos: repetirlos no cambia nada.
 */
export function esIncierto(e: unknown): boolean {
  if (detalleNex(e) !== null) return false;

  const code = (e as { code?: unknown } | null)?.code;

  if (typeof code !== "string" || !/^[0-9A-Z]{5}$/.test(code)) return true;

  return /^(08|40|53|57P)/.test(code);
}

async function conReintento<T>(f: () => Promise<T>): Promise<T> {
  let ultimo: unknown = null;

  for (let i = 0; i < INTENTOS_SQL; i++) {
    try {
      return await f();
    } catch (error) {
      ultimo = error;
      if (!esIncierto(error)) throw error;
    }
  }

  throw ultimo;
}

// Sin parámetros, mensajes ni cuerpos: solo la clase del error (el testigo, el payload y las credenciales nunca se registran en logs).
const registrarFallo = (lugar: string, error: unknown) => {
  const code = (error as { code?: unknown } | null)?.code;

  console.error(`Evidencias de envío (R05): fallo en ${lugar}`, typeof code === "string" ? code : detalleNex(error) ?? "sin código");
};

// ── Resultado de la operación (mismo contrato que la vía vigente) ───────────────────────────────────────────────────────────────────────────────────
export type ResultadoEnvioR05 = {
  numero: string;
  estadoLocal: string;
  errorTipo: string | null;
  resultado: ResultadoEnvio["resultado"];
  http: number | null;
  mensaje: string | null;
  lote: string | null;
  cdc: string | null;
  estadoGateway: string | null;
  errores: string[];
  fases: FaseEnvio[];
};

const MENSAJE_INICIO_INDETERMINADO = "Un envío anterior de este documento quedó sin cerrar: el resultado es indeterminado. Consulte su estado en el gateway antes de reenviar.";
const MENSAJE_INICIO_INCIERTO =
  "No se pudo confirmar el inicio del envío: no se transmitió nada. Si el documento quedó en envío, pasará a indeterminado; consulte su estado antes de reenviar.";
const MENSAJE_SIN_CIERRE =
  "El documento pudo haber sido transmitido pero no se pudo guardar el resultado: es indeterminado. Verifique su estado en el gateway (consulta) antes de reenviar.";
const MENSAJE_NO_VIGENTE =
  "La operación de envío ya no está vigente (el documento quedó indeterminado o fue cerrado por otra operación): no se reenvía. Consulte su estado en el gateway antes de reenviar.";

const RESULTADOS: ReadonlySet<string> = new Set(["OK", "ERROR_HTTP", "TIMEOUT", "RED", "RESPUESTA_INVALIDA"]);
const comoResultado = (v: unknown): ResultadoEnvio["resultado"] => (typeof v === "string" && RESULTADOS.has(v) ? (v as ResultadoEnvio["resultado"]) : "RESPUESTA_INVALIDA");
const textoONulo = (v: unknown): string | null => (typeof v === "string" ? v : null);
const enteroONulo = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);

const VIGENCIA_PERDIDA: ReadonlySet<string> = new Set(["OPERACION_CERRADA", "OPERACION_NO_VIGENTE", "DOCUMENTO_NO_ENVIANDO"]);
const P_RECHAZADA: ReadonlySet<string> = new Set(["PROYECCION_INVALIDA", "PROYECCION_INCOHERENTE", "PROYECCION_EXCEDIDA", "CLASIFICACION_NO_COINCIDE", "IDENTIDAD_SNAPSHOT_DISTINTA"]);

/** Límites de la respuesta guardada: la base rechaza (EVENTO_INVALIDO) una respuesta saneada de 64 KiB o más y no admite NUL ni sustitutos sueltos en jsonb. */
const MAX_BYTES_RESPUESTA = 32768;
const NO_ADMITIDO_JSONB = /\\u0000|\\ud[89ab][0-9a-f]{2}(?!\\ud[c-f][0-9a-f]{2})|(?<!\\ud[89ab][0-9a-f]{2})\\ud[c-f][0-9a-f]{2}/i;
const TRUNCADA = { truncado: true } as const;

/** Respuesta saneada que se registra (la de la vía vigente) y su indicador de truncamiento; se reemplaza por la marca de truncamiento si la base no podría guardarla íntegra. */
export function respuestaRegistrable(respuesta: unknown): { respuesta: unknown; truncada: boolean } {
  if (respuesta === null || respuesta === undefined) return { respuesta: null, truncada: false };

  const texto = JSON.stringify(respuesta);
  const marca = respuesta !== null && typeof respuesta === "object" && !Array.isArray(respuesta) && Object.keys(respuesta).length === 1 && (respuesta as F).truncado === true;

  if (marca || Buffer.byteLength(texto, "utf8") > MAX_BYTES_RESPUESTA || NO_ADMITIDO_JSONB.test(texto)) return { respuesta: TRUNCADA, truncada: true };

  return { respuesta, truncada: false };
}

/** Mensaje del cierre según su regla (la base devuelve el motivo como código, no el texto): mismos textos que la derivación de NEX-084 y que la vía vigente. */
export function mensajeCierre(regla: string, resultado: unknown): string | null {
  if (regla === "NT") return MENSAJES_CIERRE.NT;
  if (regla === "AUT-1" || regla === "AUT-2") return resultado === "TIMEOUT" ? MENSAJES_CIERRE.AUT_TIMEOUT : resultado === "RED" ? MENSAJES_CIERRE.AUT_RED : MENSAJES_CIERRE.AUT_HTTP;
  if (regla === "EI-TOKEN-SIN-POST2") return MENSAJES_CIERRE.TOKEN_SIN_POST2;
  if (regla === "EI-SIN-SALIDA") return MENSAJES_CIERRE.SIN_SALIDA;
  if (regla === "EI-SIN-P") return MENSAJES_CIERRE.SIN_P;
  if (regla === "ET-TIMEOUT") return MENSAJES_CIERRE.ET_TIMEOUT;
  if (regla === "ET-RED") return MENSAJES_CIERRE.ET_RED;

  return null;
}

/** Testigo: 256 bits aleatorios en base64url (43 caracteres, formato que acepta fe_e03_r05_hash_testigo). */
export const nuevoTestigo = () => randomBytes(32).toString("base64url");

/** Fases para el modal técnico (mismos textos que la vía vigente). */
function fasesDe(libro: LibroOperacion, transmisiones: Array<SalidaTransporte | null>, cierre: { estadoLocal: string; mensaje: string | null }, mensajesAut: [string | null, string | null]): FaseEnvio[] {
  const fases: FaseEnvio[] = [];

  if (libro.aut1) {
    fases.push(libro.aut1.resultado === "OK" ? { fase: "AUTENTICACION", ok: true, detalle: "Autenticación obtenida." } : { fase: "AUTENTICACION", ok: false, detalle: mensajesAut[0] ?? MENSAJES_CIERRE.AUT_HTTP, http: libro.aut1.http });
  }
  for (let n = 1; n <= transmisiones.length; n++) {
    const t = transmisiones[n - 1];

    if (n === 2 && libro.aut2) {
      fases.push(libro.aut2.resultado === "OK" ? { fase: "AUTENTICACION", ok: true, detalle: "Sesión renovada con el gateway." } : { fase: "AUTENTICACION", ok: false, detalle: mensajesAut[1] ?? MENSAJES_CIERRE.AUT_HTTP, http: libro.aut2.http });
    }
    if (!t) continue;
    if (!t.ok) {
      fases.push({ fase: "TRANSMISION", ok: false, detalle: t.motivo === "TIMEOUT" ? MENSAJES_CIERRE.ET_TIMEOUT : MENSAJES_CIERRE.ET_RED });
    } else if (n === 1 && tokenRechazadoPost1(libro)) {
      fases.push({ fase: "TRANSMISION", ok: false, detalle: `Token rechazado (HTTP ${t.status}); se renueva la sesión.`, http: t.status });
    } else {
      fases.push({ fase: "TRANSMISION", ok: true, detalle: "Solicitud transmitida.", http: t.status });
    }
  }

  const ultimo = transmisiones[transmisiones.length - 1];

  if (ultimo && ultimo.ok) {
    const detalle = cierre.estadoLocal === "ENVIADO"
      ? "El gateway confirmó la recepción del documento. El estado fiscal (SIFEN) aún no está confirmado."
      : cierre.estadoLocal === "ENVIO_INDETERMINADO" ? `Recepción NO confirmada: ${cierre.mensaje ?? "respuesta no concluyente"}` : (cierre.mensaje ?? "Respuesta del gateway");

    fases.push({ fase: "RESPUESTA", ok: cierre.estadoLocal === "ENVIADO", detalle, http: ultimo.status });
  }

  return fases;
}

type Salida = {
  /** Lo registrado en la base para este POST (o null si no se confirmó). */
  local: SalidaLocal | undefined;
  /** Variantes intentadas cuya confirmación quedó incierta (para cotejar la clasificación derivable en la recuperación). */
  candidatas: SalidaLocal[];
  /** Resultado de la vía vigente (interpretarRecepcion, saneado) para presentar mensaje, estado del gateway y errores. */
  res: ResultadoEnvio | null;
  p: ProyeccionP | null;
  tardia: boolean;
};

/**
 * Envía un documento ya creado por la vía R05 (config.rutaEnvio === "R05", decidido en el preflight de ESTA operación). Contrato de salida = el de la vía vigente.
 * Lanza ErrorFacturacion o el error NEX de NEX-062 (YA_ENVIADO, ENVIO_EN_CURSO, …) en los mismos casos que la vía vigente; nunca reenvía un resultado indeterminado.
 */
export async function enviarDocumentoR05(db: Db, empresaId: string, usuarioId: string, documentoId: string, config: ConfigGateway, dep: Dependencias, confirmaRechazo: boolean): Promise<ResultadoEnvioR05> {
  const correlacion = randomUUID();
  const testigo = nuevoTestigo();
  const conexion = referenciaConexion(config);

  // 3) Inicio correlacionado (misma referencia NO secreta de la configuración del preflight). Repetir con la MISMA correlación y testigo es seguro (la base devuelve la misma operación).
  let inicio: F;

  try {
    inicio = (await conReintento(() => db.query(SQL_R05.iniciar, [empresaId, usuarioId, documentoId, confirmaRechazo, correlacion, testigo, JSON.stringify(conexion)]))).rows[0] as F;
  } catch (error) {
    if (detalleNex(error) !== null || (error as { code?: unknown }).code === "42501") throw error;
    registrarFallo("inicio", error);
    await cerrarInicioIncierto(db, empresaId, usuarioId, documentoId, correlacion, testigo);
    throw new ErrorFacturacion(502, MENSAJE_INICIO_INCIERTO);
  }

  const operacion = typeof inicio?.operacionId === "string" ? inicio.operacionId : null;

  if (!inicio || inicio.resultado !== "INICIADO" || !operacion || !inicio.payload || typeof inicio.payload !== "object" || Array.isArray(inicio.payload) || inicio.vigente !== true) {
    throw new ErrorFacturacion(409, MENSAJE_INICIO_INDETERMINADO);
  }

  const numero = String(inicio.numero);
  const payload = inicio.payload as Record<string, unknown>;
  const tipo = String(inicio.tipo);
  const docRec: DocumentoRecepcion = { tipo, establecimiento: String(inicio.establecimiento), puntoExpedicion: String(inicio.punto), numero, serie: seriePayload(payload) };
  const identidad = identidadDeSnapshot(tipo, docRec.establecimiento, docRec.puntoExpedicion, numero, payload);
  const base = [empresaId, usuarioId, documentoId, operacion, testigo] as const;
  const libro: LibroOperacion = { noTransmitido: false, aut1: null, aut2: null, posts: 0, salidas: [] };
  const transmisiones: Array<SalidaTransporte | null> = [];
  const salidas: Salida[] = [];
  const mensajesAut: [string | null, string | null] = [null, null];
  let perdida = false;

  const escribir = (sql: string, extra: readonly unknown[]) => conReintento(() => db.query(sql, [...base, ...extra]));

  // NO_TRANSMITIDO: solo sin ningún POST registrado (la base lo exige); si no se confirma, la operación se recupera por su estado.
  const noTransmitido = async (motivo: "SIN_CREDENCIALES" | "FALLO_LOCAL" | "CUERPO_NO_COINCIDE" | "SOLICITUD_EXCEDE_LIMITE") => {
    try {
      await escribir(SQL_R05.noTransmitido, [motivo]);
      libro.noTransmitido = true;
    } catch (error) {
      registrarFallo("no transmitido", error);
      perdida = true;
    }
  };

  const registrarAutenticacion = async (nro: 1 | 2, a: Awaited<ReturnType<typeof autenticarGatewayR05>>): Promise<boolean> => {
    try {
      await escribir(SQL_R05.autenticacion, [nro === 1 ? "INICIAL" : "RENOVACION_TOKEN", a.origen, a.resultado, a.http]);
      const registro = { resultado: a.resultado, http: a.http };

      if (nro === 1) libro.aut1 = registro;
      else libro.aut2 = registro;
      if (a.resultado !== "OK") mensajesAut[nro - 1] = a.mensaje;

      return true;
    } catch (error) {
      // Sin confirmación de la autenticación: no hubo POST; el llamador lo registra como no transmitido (nro 1) o el cierre lo deriva (nro 2).
      registrarFallo(`autenticación ${nro}`, error);

      return false;
    }
  };

  // 5) Serialización ÚNICA: estos bytes se registran y se transmiten (nunca se vuelve a serializar).
  const texto = JSON.stringify(payload);
  const bytes = Buffer.byteLength(texto, "utf8");
  const sha = createHash("sha256").update(texto, "utf8").digest("hex");
  const almacenamiento = bytes <= 1_048_576 ? "EVIDENCIA_NEX072" : "POST_GRANDE_R05";
  const fetchHecho = [false, false];

  /** Registra el POST n con confirmación durable y, solo entonces, transmite UNA vez. */
  const postear = async (nro: 1 | 2, token: string): Promise<"TRANSMITIDO" | "NO_TRANSMITIDO" | "SIN_POST"> => {
    let fila: F;

    try {
      fila = (await escribir(SQL_R05.post, [nro, texto])).rows[0] as F;
    } catch (error) {
      const d = detalleNex(error);

      registrarFallo(`POST ${nro}`, error);
      if (nro === 1 && d === "CUERPO_NO_COINCIDE") await noTransmitido("CUERPO_NO_COINCIDE");
      else if (nro === 1 && d === "SOLICITUD_EXCEDE_LIMITE_DEFENSIVO") await noTransmitido("SOLICITUD_EXCEDE_LIMITE");
      else if (d !== null && VIGENCIA_PERDIDA.has(d)) perdida = true;
      else if (nro === 1 && !esIncierto(error)) await noTransmitido("FALLO_LOCAL");
      else perdida = true;

      return libro.noTransmitido ? "NO_TRANSMITIDO" : "SIN_POST";
    }

    libro.posts = nro;
    // Lo registrado debe ser EXACTAMENTE lo que se va a transmitir (hash y bytes del texto, almacenamiento D8-B); si no, no hay fetch.
    if (!fila || enteroONulo(fila.nroPost) !== nro || fila.sha256 !== sha || enteroONulo(fila.bytes) !== bytes || fila.almacenamiento !== almacenamiento) return "SIN_POST";
    if (fetchHecho[nro - 1]) return "SIN_POST";
    fetchHecho[nro - 1] = true;

    let t: SalidaTransporte;

    try {
      t = await transmitirRecepcionTexto(config, token, texto, dep);
    } catch {
      t = { ok: false, motivo: "RED" };
    }
    transmisiones[nro - 1] = t;

    return "TRANSMITIDO";
  };

  /** Registra la salida del POST n (6). Devuelve la salida local confirmada o undefined. */
  const registrarSalida = async (nro: 1 | 2, t: SalidaTransporte, token: string, password: string): Promise<Salida> => {
    const s: Salida = { local: undefined, candidatas: [], res: null, p: null, tardia: false };

    if (!t.ok) {
      const local: SalidaLocal = { tipo: "ERROR_TRANSMISION", clase: t.motivo };

      s.candidatas.push(local);
      await intentarSalida(nro, s, ["ERROR_TRANSMISION", null, null, false, t.motivo, null, null], local);

      return s;
    }
    if (!Number.isInteger(t.status) || t.status < 100 || t.status > 599) return s;

    const res = resultadoFiscalSinSecretos(interpretarRecepcion(t.status, t.texto, [], docRec), [password, token], CONTRATO_FISCAL_ENVIO);
    const reg = respuestaRegistrable(res.respuesta);
    let p: ProyeccionP | null = null;
    let motivo: MotivoSinProyeccion | null = null;

    s.res = res;
    try {
      const hechos = hechosRecepcion(t.status, t.texto, docRec);
      const construida = construirProyeccion({
        http: t.status, cuerpoTexto: t.texto, hechos, identidad,
        app: { resultado: res.resultado, estadoLocal: res.estadoLocal, errorTipo: res.errorTipo },
        lectura: { textoResultado: res.mensaje, estadoGateway: res.estadoGateway, errores: res.errores },
        secretos: [password, token],
      });

      p = construida.p;
      motivo = construida.motivo;
    } catch {
      p = null;
      motivo = "FALLO_LOCAL";
    }

    const conP = (x: ProyeccionP | null): SalidaLocal => ({ tipo: "HTTP_RESPUESTA", http: t.status, clasificacionP: x ? x.clasificacion_app : null, tokenInvalidoP: x ? x.token_invalido : false, textoResultado: x ? x.lectura.texto_resultado : null });
    const variante = (resp: { respuesta: unknown; truncada: boolean }, x: ProyeccionP | null, m: MotivoSinProyeccion | null) =>
      ["HTTP_RESPUESTA", t.status, resp.respuesta === null ? null : JSON.stringify(resp.respuesta), resp.truncada, null, x ? JSON.stringify(x) : null, x ? null : m] as const;

    s.p = p;
    s.candidatas.push(conP(p));

    let r = await intentarSalida(nro, s, variante(reg, p, motivo), conP(p));

    // P rechazada por la base (esquema, coherencia, tamaño, clasificación o identidad): la MISMA salida sin P (D-C02-2-A: el cierre quedará indeterminado).
    if (r !== null && P_RECHAZADA.has(r) && p !== null) {
      s.p = null;
      s.candidatas.push(conP(null));
      r = await intentarSalida(nro, s, variante(reg, null, "PROYECCION_RECHAZADA"), conP(null));
    }
    // Credenciales que la base no pudo redactar (en la respuesta o en P): sin P; si persisten en la respuesta, solo la marca de truncamiento.
    if (r === "EVIDENCIA_CON_CREDENCIALES") {
      s.p = null;
      s.candidatas.push(conP(null));
      r = await intentarSalida(nro, s, variante(reg, null, "CREDENCIALES_RESIDUALES"), conP(null));
      if (r === "EVIDENCIA_CON_CREDENCIALES") r = await intentarSalida(nro, s, variante({ respuesta: TRUNCADA, truncada: true }, null, "CREDENCIALES_RESIDUALES"), conP(null));
    }
    // Respuesta demasiado grande para la base: la marca de truncamiento con la misma P o motivo.
    if (r === "EVENTO_INVALIDO" && !reg.truncada) r = await intentarSalida(nro, s, variante({ respuesta: TRUNCADA, truncada: true }, s.p, s.p ? null : (motivo ?? "PROYECCION_RECHAZADA")), conP(s.p));

    return s;
  };

  /**
   * Una escritura de salida. null = confirmada (o registrada como tardía); otro valor = código NEX definitivo para decidir una variante. Una confirmación INCIERTA agotada no se transforma
   * en otra salida: queda la candidata y la operación se recuperará por su estado.
   */
  const intentarSalida = async (nro: 1 | 2, s: Salida, args: readonly unknown[], local: SalidaLocal): Promise<string | null> => {
    try {
      const fila = (await escribir(SQL_R05.salida, [nro, ...args])).rows[0] as F | undefined;

      // La regla que devuelve la base es la que rige el cierre: si difiere de la local, la salida se trata como sin P (el cierre se deriva igual en la base).
      s.local = local.tipo === "HTTP_RESPUESTA" && local.clasificacionP !== null && fila?.regla !== local.clasificacionP.regla ? { ...local, clasificacionP: null, tokenInvalidoP: false } : local;
      libro.salidas[nro - 1] = s.local;

      return null;
    } catch (error) {
      const d = detalleNex(error);

      if (d !== null && VIGENCIA_PERDIDA.has(d)) {
        // La vía normal ya no la admite: salida TARDÍA del mismo POST (append-only; no cambia estados ni cierre).
        try {
          await escribir(SQL_R05.salidaTardia, [nro, ...args]);
          s.tardia = true;
        } catch (e) {
          registrarFallo(`salida tardía ${nro}`, e);
        }
        perdida = true;

        return null;
      }
      if (d !== null && (P_RECHAZADA.has(d) || d === "EVIDENCIA_CON_CREDENCIALES" || d === "EVENTO_INVALIDO")) return d;
      registrarFallo(`salida ${nro}`, error);
      if (d === "SALIDA_TARDIA_REGISTRADA") perdida = true;

      return "SIN_CONFIRMAR";
    }
  };

  // 2) Credenciales del preflight de ESTA operación; sin ellas: no transmitido.
  const cred = credencialesDe(config, dep.env);
  let token: string | null = null;

  if (!cred) {
    await noTransmitido("SIN_CREDENCIALES");
  } else if (bytes > 8_388_608) {
    // D8-B: por encima del límite defensivo de 8 MiB no se registra ni se transmite (sin truncar ni reducir ítems).
    await noTransmitido("SOLICITUD_EXCEDE_LIMITE");
  } else {
    // 4) Autenticación inicial (caché o HTTP), registrada antes de cualquier POST.
    let a1: Awaited<ReturnType<typeof autenticarGatewayR05>> | null = null;

    try {
      a1 = await autenticarGatewayR05(config, cred, dep, false);
    } catch {
      a1 = null;
    }
    if (!a1 || !(await registrarAutenticacion(1, a1))) await noTransmitido("FALLO_LOCAL");
    else if (a1.resultado === "OK") token = a1.token;

    if (token !== null && (await postear(1, token)) === "TRANSMITIDO") {
      const s1 = await registrarSalida(1, transmisiones[0] as SalidaTransporte, token, cred.password);

      salidas[0] = s1;

      // 7) Segundo POST: solo con token inválido ACREDITADO en el POST 1 (salida persistida con P R-01 y HTTP 4xx) y renovación forzada por HTTP registrada OK.
      const s1l = s1.local;

      if (!perdida && s1l && s1l.tipo === "HTTP_RESPUESTA" && s1l.http >= 400 && s1l.http <= 499 && s1l.clasificacionP?.regla === "R-01" && s1l.tokenInvalidoP) {
        let a2: Awaited<ReturnType<typeof autenticarGatewayR05>> | null = null;

        try {
          a2 = await autenticarGatewayR05(config, cred, dep, true);
        } catch {
          a2 = null;
        }
        // Sin resultado de la renovación (fallo local) no hay POST 2: el cierre queda EI-TOKEN-SIN-POST2.
        if (a2 && (await registrarAutenticacion(2, a2)) && a2.resultado === "OK" && (await postear(2, a2.token)) === "TRANSMITIDO") {
          salidas[1] = await registrarSalida(2, transmisiones[1] as SalidaTransporte, a2.token, cred.password);
        }
      }
    }
  }

  // 8) Cierre durable con la clasificación esperada exacta.
  const presentar = (c: { estadoLocal: string; resultado: unknown; errorTipo: unknown; fase: unknown; regla: unknown; httpPost: unknown; httpAutenticacion: unknown; lote: unknown; cdc: unknown; motivo: unknown }): ResultadoEnvioR05 => {
    const estadoLocal = c.estadoLocal;
    const ultima = salidas[salidas.length - 1];
    // Mensaje, estado del gateway y errores de la respuesta solo si el cierre se rige por su P (misma regla); si no, los textos fijos del cierre.
    const porP = ultima?.res && ultima.p && ultima.local?.tipo === "HTTP_RESPUESTA" && ultima.local.clasificacionP?.regla === c.regla;
    const mensaje = porP ? ultima!.res!.mensaje : mensajeCierre(String(c.regla), c.resultado) ?? "Resultado del envío registrado; consulte el detalle del documento.";

    return {
      numero,
      estadoLocal,
      errorTipo: textoONulo(c.errorTipo),
      resultado: comoResultado(c.resultado),
      http: c.fase === "AUTENTICACION" ? enteroONulo(c.httpAutenticacion) : enteroONulo(c.httpPost),
      mensaje,
      lote: estadoLocal === "ENVIADO" ? textoONulo(c.lote) : null,
      cdc: estadoLocal === "ENVIADO" ? textoONulo(c.cdc) : null,
      estadoGateway: porP ? ultima!.res!.estadoGateway : null,
      errores: porP ? ultima!.res!.errores : [],
      fases: fasesDe(libro, transmisiones, { estadoLocal, mensaje }, mensajesAut),
    };
  };

  const cerrar = async (clasificacion: Clasificacion): Promise<ResultadoEnvioR05> => {
    const fila = (await escribir(SQL_R05.cerrar, [JSON.stringify({ regla: clasificacion.regla, resultado: clasificacion.resultado, estado_local: clasificacion.estado_local, error_tipo: clasificacion.error_tipo })])).rows[0] as F;

    return presentar({ ...fila, estadoLocal: String(fila.estadoLocal) } as Parameters<typeof presentar>[0]);
  };

  const derivado: CierreDerivado | null = perdida ? null : derivarCierre(libro);

  if (derivado) {
    try {
      return await cerrar(derivado.clasificacion);
    } catch (error) {
      registrarFallo("cierre", error);
      // CIERRE_CONTRADICTORIO / incertidumbre: se recupera la operación exacta (nunca NEX-080 directo).
    }
  }

  return recuperar(db, empresaId, usuarioId, documentoId, operacion, libro, salidas, cerrar, presentar);
}

/**
 * Inicio con confirmación incierta: la lectura por correlación NO concede ejecución (nunca un POST); si la operación de ESTA correlación existe y sigue vigente, se registra que no se
 * transmitió (FALLO_LOCAL: no hubo fetch) y se cierra (NT → ENVIO_INDETERMINADO) para no dejar el documento «en envío». Cualquier fallo aquí se ignora (NEX-062 lo recupera a los 2 minutos).
 */
async function cerrarInicioIncierto(db: Db, empresaId: string, usuarioId: string, documentoId: string, correlacion: string, testigo: string): Promise<void> {
  try {
    const op = (await conReintento(() => db.query(SQL_R05.porCorrelacion, [empresaId, usuarioId, documentoId, correlacion]))).rows[0] as F | undefined;

    if (!op || typeof op.operacionId !== "string" || op.vigente !== true || op.cerrada === true) return;

    const base = [empresaId, usuarioId, documentoId, op.operacionId, testigo];

    await conReintento(() => db.query(SQL_R05.noTransmitido, [...base, "FALLO_LOCAL"]));
    await conReintento(() => db.query(SQL_R05.cerrar, [...base, JSON.stringify({ regla: "NT", resultado: "RED", estado_local: "ENVIO_INDETERMINADO", error_tipo: null })]));
  } catch (error) {
    registrarFallo("cierre de un inicio incierto", error);
  }
}

/** Clasificaciones derivables coherentes con lo INTENTADO: el libro confirmado y cada variante de salida cuya confirmación quedó incierta. */
function clasificacionesCoherentes(libro: LibroOperacion, salidas: Salida[]): Clasificacion[] {
  const res: Clasificacion[] = [];
  const agregar = (l: LibroOperacion) => {
    const d = derivarCierre(l);

    if (d) res.push(d.clasificacion);
  };

  agregar(libro);
  salidas.forEach((s, i) => {
    for (const c of s.candidatas) agregar({ ...libro, posts: Math.max(libro.posts, i + 1), salidas: Object.assign([...libro.salidas], { [i]: c }) });
  });

  return res;
}

const mismaClasificacion = (a: unknown, b: Clasificacion) => {
  const x = a as F | null;

  return !!x && x.regla === b.regla && x.resultado === b.resultado && x.estado_local === b.estado_local && (x.error_tipo ?? null) === b.error_tipo;
};

/**
 * 9) Recuperación de la operación EXACTA (operación + testigo en memoria) tras una confirmación incierta o un cierre contradictorio:
 *   · ya cerrada → se informa el cierre histórico;
 *   · derivable y coherente con lo intentado, o indeterminada → se cierra con ESA clasificación (repetición segura);
 *   · no vigente → 409 indeterminado; nada confiable → 502. Nunca un POST nuevo ni la vía NEX-080 directa.
 */
async function recuperar(
  db: Db, empresaId: string, usuarioId: string, documentoId: string, operacion: string, libro: LibroOperacion, salidas: Salida[],
  cerrar: (c: Clasificacion) => Promise<ResultadoEnvioR05>,
  presentar: (c: { estadoLocal: string; resultado: unknown; errorTipo: unknown; fase: unknown; regla: unknown; httpPost: unknown; httpAutenticacion: unknown; lote: unknown; cdc: unknown; motivo: unknown }) => ResultadoEnvioR05,
): Promise<ResultadoEnvioR05> {
  let e: F | undefined;

  try {
    e = (await conReintento(() => db.query(SQL_R05.estado, [empresaId, usuarioId, documentoId, operacion]))).rows[0] as F | undefined;
  } catch (error) {
    registrarFallo("estado de la operación", error);
    throw new ErrorFacturacion(502, MENSAJE_SIN_CIERRE);
  }
  if (!e) throw new ErrorFacturacion(502, MENSAJE_SIN_CIERRE);

  if (e.cerrada === true && typeof e.estadoLocalHistorico === "string") {
    return presentar({ estadoLocal: e.estadoLocalHistorico, resultado: e.resultadoHistorico, errorTipo: e.errorTipo, fase: e.fase, regla: e.regla, httpPost: e.httpPost, httpAutenticacion: e.httpAutenticacion, lote: e.lote, cdc: e.cdc, motivo: e.motivo });
  }
  if (e.vigente !== true) throw new ErrorFacturacion(409, MENSAJE_NO_VIGENTE);

  const c = e.cierreDerivable === true ? (e.clasificacionDerivable as F | null) : null;

  if (c && (c.estado_local === "ENVIO_INDETERMINADO" || clasificacionesCoherentes(libro, salidas).some((x) => mismaClasificacion(c, x)))) {
    try {
      return await cerrar({ regla: String(c.regla), resultado: String(c.resultado), estado_local: c.estado_local as Clasificacion["estado_local"], error_tipo: (c.error_tipo ?? null) as Clasificacion["error_tipo"] });
    } catch (error) {
      registrarFallo("cierre recuperado", error);
    }
  }

  throw new ErrorFacturacion(502, MENSAJE_SIN_CIERRE);
}
