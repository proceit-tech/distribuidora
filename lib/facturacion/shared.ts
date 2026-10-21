import { NextResponse } from "next/server";
import type { Pool } from "pg";

import { ESTADOS_EMAIL, ESTADOS_LOCAL, ESTADOS_SIFEN, GRUPOS_INDICADOR, TIPOS_DOCUMENTO, UMBRAL_REVISION_HORAS, type GrupoIndicador } from "@/lib/facturacion/estados";
import { configGatewayValida, consultarDocumentoGateway, obtenerKudeGateway, type Dependencias, type DependenciasKude } from "@/lib/facturacion/gateway";
import { adjuntarCredencialesDeBase } from "@/lib/facturacion/gateway-credenciales";
import { decidirConsulta } from "@/lib/facturacion/reconciliacion";

/**
 * Documentos electrónicos (NEX-047): lectura paginada en el servidor y consulta de estado al gateway. empresa_id y usuario SIEMPRE de la sesión.
 * Alcance: solo documentos de sucursales dentro del alcance del usuario (sucursal_en_alcance). La escritura pasa por fe_documento_registrar_consulta.
 */

type Db = Pick<Pool, "query">;
type F = Record<string, unknown>;

export const TAMANO_DEFECTO = 20;
export const TAMANO_MAXIMO = 100;

export type ConsultaDocumentos = {
  q?: string;
  tipo?: string;
  sucursal?: string;
  estadoSifen?: string;
  estadoLocal?: string;
  estadoEmail?: string;
  grupo?: string;
  desde?: string;
  hasta?: string;
  orden?: string;
  dir?: string;
  pagina?: number;
  tamano?: number;
};

const ORDEN: Record<string, string[]> = {
  fecha: ["d.fecha_emision"],
  numero: ["d.establecimiento", "d.punto_expedicion", "d.numero"],
  cliente: ["d.receptor_nombre"],
  total: ["d.total"],
  estado: ["d.estado_sifen"],
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const entero = (v: unknown, defecto: number, min: number, max: number) => {
  const n = Math.floor(Number(v));

  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : defecto;
};
/** Escapa % _ ! para usarlos literalmente en ILIKE ... ESCAPE '!'. */
const comodin = (t: string) => t.replace(/[!%_]/g, (c) => `!${c}`);

/** Definición SQL de cada indicador (también sirve de filtro). Un documento puede estar en varios ejes a la vez; nunca se infiere uno de otro. */
export const SQL_GRUPO: Record<GrupoIndicador, string> = {
  PEND_ENVIO: "d.estado_local IN ('PENDIENTE_ENVIO','ENVIANDO','ENVIO_INDETERMINADO','ERROR_ENVIO')",
  PEND_RESPUESTA: "d.estado_local = 'ENVIADO' AND d.estado_sifen IN ('SIN_CONSULTA','PENDIENTE')",
  APROBADO: "d.estado_sifen = 'APROBADO'",
  RECHAZADO: "d.estado_sifen = 'RECHAZADO'",
  EMAIL_ENVIADO: "d.estado_email = 'ENVIADO'",
  EMAIL_ERROR: "d.estado_email = 'ERROR'",
  SIN_EMAIL: "d.estado_email IN ('NO_INFORMADO','SIN_EMAIL')",
};

/** $1 = empresa, $2 = usuario. */
const ALCANCE = "d.empresa_id = $1 AND sucursal_en_alcance($1::uuid, $2::uuid, d.sucursal_id)";

const COLUMNAS_BASE = `SELECT d.id, d.tipo, d.establecimiento, d.punto_expedicion AS "puntoExpedicion", d.numero, d.serie, d.cdc, d.fecha_emision AS "fechaEmision",
       d.sucursal_id AS "sucursalId", s.nombre AS "sucursalNombre", d.receptor_nombre AS "receptorNombre", d.receptor_documento AS "receptorDocumento",
       d.moneda, d.total::text AS total, d.estado_local AS "estadoLocal", d.estado_sifen AS "estadoSifen", d.estado_email AS "estadoEmail",
       d.estado_gateway_texto AS "estadoGatewayTexto", d.cod_respuesta AS "codRespuesta", d.mensaje_respuesta AS "mensajeRespuesta",
       d.fecha_firma_gateway AS "fechaFirma", d.fecha_envio_gateway AS "fechaEnvio", d.ultima_consulta_at AS "ultimaConsultaAt",
       d.ultima_consulta_resultado AS "ultimaConsultaResultado", d.lote, d.envio_error_tipo AS "envioErrorTipo"`;

const DESDE_BASE = `
  FROM documentos_electronicos d JOIN sucursales s ON s.empresa_id = d.empresa_id AND s.id = d.sucursal_id`;

/**
 * NCE (PRO-94, NEX-062): relación con la factura original y motivo, acción «Corregir y emitir nueva» (rechazo DEFINITIVO) y «Requiere revisión» (pendiente de resultado fiscal más de UMBRAL_REVISION_HORAS,
 * valor provisional común: solo etiqueta, no cambia ni libera nada). Si la migración NEX-062 aún no está aplicada se usa la consulta básica (la lista de facturas sigue funcionando).
 */
const COLUMNAS_NCE = `, o.motivo AS "nceMotivo", o.fe_id AS "feId", o.fe_cdc AS "feCdc", fe.establecimiento || '-' || fe.punto_expedicion || '-' || fe.numero || CASE WHEN fe.serie IS NULL THEN '' ELSE ' (' || fe.serie || ')' END AS "feNumero",
       (d.tipo = 'NCE' AND (d.estado_sifen = 'RECHAZADO' OR (d.estado_local = 'ERROR_ENVIO' AND d.envio_error_tipo = 'RECHAZO'))) AS corregible,
       (d.tipo = 'NCE' AND d.estado_local IN ('ENVIADO','ENVIO_INDETERMINADO') AND d.estado_sifen IN ('SIN_CONSULTA','PENDIENTE','NO_RECONOCIDO') AND d.creado_at < now() - interval '${UMBRAL_REVISION_HORAS} hours') AS "requiereRevision"`;
const DESDE_NCE = `${DESDE_BASE}
  LEFT JOIN nce_origen o ON o.empresa_id = d.empresa_id AND o.nce_id = d.id
  LEFT JOIN documentos_electronicos fe ON fe.empresa_id = o.empresa_id AND fe.id = o.fe_id`;

const SELECT = `${COLUMNAS_BASE}${DESDE_BASE}`;
const SELECT_NCE = `${COLUMNAS_BASE}${COLUMNAS_NCE}${DESDE_NCE}`;

/** Falta la migración NEX-062 (tabla o columna inexistente): se reintenta sin la información de NCE. */
const faltaNce = (e: unknown) => ['42P01', '42703'].includes((e as { code?: string })?.code ?? '');

/** Normaliza y valida la consulta: los valores desconocidos se descartan y nunca llegan a SQL como texto libre. */
export function normalizarConsulta(c: ConsultaDocumentos) {
  const en = <T extends string>(v: string | undefined, lista: readonly T[]): T | "" => (v && (lista as readonly string[]).includes(v) ? (v as T) : "");

  return {
    q: (c.q ?? "").trim().slice(0, 80),
    tipo: en(c.tipo, TIPOS_DOCUMENTO),
    sucursal: c.sucursal && UUID.test(c.sucursal) ? c.sucursal : "",
    estadoSifen: en(c.estadoSifen, ESTADOS_SIFEN),
    estadoLocal: en(c.estadoLocal, ESTADOS_LOCAL),
    estadoEmail: en(c.estadoEmail, ESTADOS_EMAIL),
    grupo: en(c.grupo, GRUPOS_INDICADOR),
    desde: c.desde && FECHA.test(c.desde) ? c.desde : "",
    hasta: c.hasta && FECHA.test(c.hasta) ? c.hasta : "",
    orden: Object.keys(ORDEN).includes(c.orden ?? "") ? (c.orden as string) : "",
    dir: c.dir === "asc" ? ("asc" as const) : ("desc" as const),
    pagina: entero(c.pagina, 1, 1, 1_000_000),
    tamano: entero(c.tamano, TAMANO_DEFECTO, 1, TAMANO_MAXIMO),
  };
}

function filtros(c: ReturnType<typeof normalizarConsulta>) {
  const params: unknown[] = [];
  const cond: string[] = [];
  const p = (valor: unknown) => {
    params.push(valor);

    return `$${params.length + 2}`;
  };

  if (c.tipo) cond.push(`d.tipo = ${p(c.tipo)}`);
  if (c.sucursal) cond.push(`d.sucursal_id = ${p(c.sucursal)}`);
  if (c.estadoSifen) cond.push(`d.estado_sifen = ${p(c.estadoSifen)}`);
  if (c.estadoLocal) cond.push(`d.estado_local = ${p(c.estadoLocal)}`);
  if (c.estadoEmail) cond.push(`d.estado_email = ${p(c.estadoEmail)}`);
  if (c.grupo) cond.push(`(${SQL_GRUPO[c.grupo]})`);
  // Fechas de emisión en la hora de Paraguay (día calendario completo, ambos extremos incluidos).
  if (c.desde) cond.push(`d.fecha_emision >= (${p(c.desde)}::date)::timestamp AT TIME ZONE 'America/Asuncion'`);
  if (c.hasta) cond.push(`d.fecha_emision < ((${p(c.hasta)}::date) + 1)::timestamp AT TIME ZONE 'America/Asuncion'`);
  if (c.q) {
    cond.push(`concat_ws(' ', d.establecimiento || '-' || d.punto_expedicion || '-' || d.numero || CASE WHEN d.serie IS NULL THEN '' ELSE ' (' || d.serie || ')' END, d.establecimiento || '-' || d.punto_expedicion || '-' || d.numero, coalesce(d.serie || '-' || d.numero, ''), d.cdc, d.receptor_documento, d.receptor_nombre) ILIKE ${p(`%${comodin(c.q)}%`)} ESCAPE '!'`);
  }

  return { params, sql: cond.length ? ` AND ${cond.join(" AND ")}` : "" };
}

/** Construye las consultas (puro; probado sin base de datos). La ordenación siempre termina en un desempate estable. */
export function construirConsultas(empresaId: string, usuarioId: string, entrada: ConsultaDocumentos, pagina: number, conNce = true) {
  const c = normalizarConsulta(entrada);
  const f = filtros(c);
  const base = `WHERE ${ALCANCE}${f.sql}`;
  const dir = c.dir === "asc" ? "ASC" : "DESC";
  const principal = c.orden ? `${ORDEN[c.orden].map((x) => `${x} ${dir}`).join(", ")}, ` : "d.fecha_emision DESC, ";
  const params = [empresaId, usuarioId, ...f.params];

  return {
    normalizada: c,
    conteo: { sql: `SELECT count(*)::int AS total FROM documentos_electronicos d ${base}`, params },
    lista: {
      sql: `${conNce ? SELECT_NCE : SELECT} ${base} ORDER BY ${principal}d.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      params: [...params, c.tamano, (pagina - 1) * c.tamano],
    },
  };
}

export async function leerDocumentos(db: Db, empresaId: string, usuarioId: string, entrada: ConsultaDocumentos, conNce = true): Promise<ReturnType<typeof leerDocumentosCon>> {
  try {
    return await leerDocumentosCon(db, empresaId, usuarioId, entrada, conNce);
  } catch (error) {
    if (conNce && faltaNce(error)) return leerDocumentosCon(db, empresaId, usuarioId, entrada, false);

    throw error;
  }
}

async function leerDocumentosCon(db: Db, empresaId: string, usuarioId: string, entrada: ConsultaDocumentos, conNce: boolean) {
  const pedida = construirConsultas(empresaId, usuarioId, entrada, 1);
  const c = pedida.normalizada;
  const columnasResumen = GRUPOS_INDICADOR.map((g) => `count(*) FILTER (WHERE ${SQL_GRUPO[g]})::int AS "${g}"`).join(", ");
  const [conteo, resumen, sucursales] = await Promise.all([
    db.query(pedida.conteo.sql, pedida.conteo.params),
    db.query(`SELECT count(*)::int AS total, ${columnasResumen} FROM documentos_electronicos d WHERE ${ALCANCE}`, [empresaId, usuarioId]),
    db.query(
      `SELECT DISTINCT s.id, s.nombre FROM sucursales s JOIN documentos_electronicos d ON d.empresa_id = s.empresa_id AND d.sucursal_id = s.id
        WHERE ${ALCANCE} ORDER BY s.nombre`,
      [empresaId, usuarioId],
    ),
  ]);
  const total = Number((conteo.rows[0] as F).total);
  const totalPaginas = Math.max(1, Math.ceil(total / c.tamano));
  const pagina = Math.min(c.pagina, totalPaginas);
  const consulta = construirConsultas(empresaId, usuarioId, entrada, pagina, conNce).lista;
  const filas = total === 0 ? { rows: [] } : await db.query(consulta.sql, consulta.params);

  return {
    documentos: filas.rows,
    total,
    pagina,
    tamano: c.tamano,
    totalPaginas,
    /** Indicadores sobre TODO lo que el usuario puede ver (sin los filtros de la lista). */
    resumen: resumen.rows[0] as Record<string, number>,
    sucursales: sucursales.rows,
  };
}

export async function leerDocumento(db: Db, empresaId: string, usuarioId: string, id: string) {
  if (!UUID.test(id)) return null;

  try {
    const r = await db.query(`${SELECT_NCE} WHERE ${ALCANCE} AND d.id = $3`, [empresaId, usuarioId, id]);

    return (r.rows[0] as F | undefined) ?? null;
  } catch (error) {
    if (!faltaNce(error)) throw error;

    const r = await db.query(`${SELECT} WHERE ${ALCANCE} AND d.id = $3`, [empresaId, usuarioId, id]);

    return (r.rows[0] as F | undefined) ?? null;
  }
}

/** Intentos (evidencia) del documento, del más reciente al más antiguo, máx. 100. Solo se llama tras comprobar que el documento está en el alcance. */
export async function listarIntentos(db: Db, empresaId: string, documentoId: string) {
  const r = await db.query(
    `SELECT i.id, i.tipo, i.resultado, i.http_status AS "httpStatus", i.request_id AS "requestId", i.estado_gateway AS "estadoGateway", i.estado_sifen AS "estadoSifen", i.fase, i.lote, i.cdc_informado AS "cdcInformado",
            i.cod_respuesta AS "codRespuesta", i.mensaje, i.creado_at AS "creadoAt",
            trim(coalesce(u.nombre, '') || ' ' || coalesce(u.apellido, '')) AS "actorNombre"
       FROM documento_electronico_intentos i JOIN usuarios u ON u.empresa_id = i.empresa_id AND u.id = i.actor_id
      WHERE i.empresa_id = $1 AND i.documento_id = $2 ORDER BY i.creado_at DESC, i.id DESC LIMIT 100`,
    [empresaId, documentoId],
  );

  return r.rows as F[];
}

export class ErrorFacturacion extends Error {
  constructor(
    public estado: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

/** Error de validación fiscal con la lista de motivos (la API los devuelve en `detalles`). */
export class ErrorValidacionFiscal extends ErrorFacturacion {
  constructor(
    estado: number,
    mensaje: string,
    public detalles: string[],
  ) {
    super(estado, mensaje);
  }
}

/**
 * Consulta el estado del documento en el gateway y lo persiste. La llamada HTTP se hace FUERA de cualquier transacción; luego una sola sentencia
 * (fe_documento_registrar_consulta) guarda el intento y actualiza los estados con la fila bloqueada. Un fallo del gateway queda como evidencia y no
 * cambia el estado fiscal. Sin configuración/credenciales/tipo confirmado no se llama a nadie ni se registra un intento ficticio.
 */
export async function consultarEstado(db: Db, empresaId: string, usuarioId: string, id: string, dep: Dependencias = {}, opciones: { flujoNce?: boolean } = {}) {
  const doc = await leerDocumento(db, empresaId, usuarioId, id);

  if (!doc) throw new ErrorFacturacion(404, "Documento no encontrado.");

  const cfg = await db.query(`SELECT base_url AS "baseUrl", credencial_ref AS "credencialRef", timeout_ms AS "timeoutMs" FROM fe_gateway_config WHERE empresa_id = $1 AND activo`, [empresaId]);
  const fila = cfg.rows[0] as { baseUrl: string; credencialRef: string; timeoutMs: number } | undefined;

  if (!fila) throw new ErrorFacturacion(409, "La empresa no tiene configurado el gateway de facturación electrónica.");

  const config = configGatewayValida(empresaId, fila);

  if (!config) throw new ErrorFacturacion(409, "La configuración del gateway de esta empresa no es válida (URL https y tiempo de espera).");

  const bruto = await consultarDocumentoGateway(
    await adjuntarCredencialesDeBase(db, config, usuarioId),
    { tipo: String(doc.tipo), establecimiento: String(doc.establecimiento), puntoExpedicion: String(doc.puntoExpedicion), numero: String(doc.numero), serie: (doc.serie as string | null) ?? null },
    dep,
  );

  if ("sinContrato" in bruto) {
    throw new ErrorFacturacion(
      409,
      bruto.sinContrato === "TIPO" ? "La consulta de este tipo de documento aún no está confirmada con el proveedor." : "Las credenciales del gateway de esta empresa no están configuradas.",
    );
  }

  // Solo una respuesta asociada de forma confiable al documento y coherente con su estado previo puede fijar el estado fiscal (RN-E2-08).
  const r = decidirConsulta({ tipo: String(doc.tipo), establecimiento: String(doc.establecimiento), puntoExpedicion: String(doc.puntoExpedicion), numero: String(doc.numero), cdc: (doc.cdc as string | null) ?? null, estadoSifen: (doc.estadoSifen as string | null) ?? null }, bruto);

  const registrado = await db.query(
    `SELECT ${opciones.flujoNce ? "fe_documento_registrar_consulta_flujo_nce" : "fe_documento_registrar_consulta"}($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb) AS resultado`,
    [empresaId, usuarioId, id, r.resultado, r.http, crypto.randomUUID(), r.estadoGateway, r.estadoSifen, r.cdc, r.codRespuesta, r.mensaje, r.fechaFirma, r.fechaEnvio, r.respuesta ? JSON.stringify(r.respuesta) : null],
  );

  return { resultado: String((registrado.rows[0] as F).resultado), mensaje: r.mensaje };
}

/** Nombre de archivo derivado SOLO de la identidad fiscal del registro, saneado. */
export function nombreArchivoKude(doc: Record<string, unknown>): string {
  const p = (v: unknown) => String(v ?? "").replace(/[^0-9A-Za-z]/g, "");

  return `KuDE-${doc.tipo === "NCE" ? "NCE" : "FE"}-${p(doc.establecimiento)}-${p(doc.puntoExpedicion)}-${p(doc.numero)}${doc.serie ? `-${p(doc.serie)}` : ""}.pdf`;
}

/**
 * KuDE (PDF) de una FE o NCE existente (PRO-194 / E08). Documento por ID dentro de empresa + sucursal de la SESIÓN; identidad fiscal (tipo, establecimiento, punto, número, serie) del registro
 * persistido, nunca del navegador. NO se exige estado fiscal ni CDC previo: se consulta al gateway y se muestra si devuelve un PDF válido de ESE documento (CDC coherente con la identidad y, si hay uno
 * persistido, idéntico). Sin credenciales/config no se llama a nadie. No modifica ningún dato (ni estados, ni intentos, ni numeración).
 */
export async function obtenerKude(db: Db, empresaId: string, usuarioId: string, id: string, dep: DependenciasKude = {}): Promise<{ pdf: Buffer; nombre: string }> {
  const doc = await leerDocumento(db, empresaId, usuarioId, id);

  if (!doc) throw new ErrorFacturacion(404, "Documento no encontrado.");
  if (doc.tipo !== "FE" && doc.tipo !== "NCE") throw new ErrorFacturacion(409, "El KuDE solo está disponible para facturas (FE) y notas de crédito (NCE) electrónicas.");

  const cfg = await db.query(`SELECT base_url AS "baseUrl", credencial_ref AS "credencialRef", timeout_ms AS "timeoutMs" FROM fe_gateway_config WHERE empresa_id = $1 AND activo`, [empresaId]);
  const fila = cfg.rows[0] as { baseUrl: string; credencialRef: string; timeoutMs: number } | undefined;

  if (!fila) throw new ErrorFacturacion(409, "La empresa no tiene configurado el gateway de facturación electrónica.");

  const config = configGatewayValida(empresaId, fila);

  if (!config) throw new ErrorFacturacion(409, "La configuración del gateway de esta empresa no es válida (URL https y tiempo de espera).");

  const r = await obtenerKudeGateway(
    await adjuntarCredencialesDeBase(db, config, usuarioId),
    { tipoDoc: doc.tipo, establecimiento: String(doc.establecimiento), puntoExpedicion: String(doc.puntoExpedicion), numero: String(doc.numero), serie: (doc.serie as string | null) ?? null, cdc: doc.cdc ? String(doc.cdc) : null },
    dep,
  );

  if (!r.ok) {
    const estado = r.codigo === "SIN_CREDENCIALES" ? 409 : r.codigo === "NO_DISPONIBLE" ? 503 : 502;

    throw new ErrorFacturacion(estado, r.mensaje);
  }

  return { pdf: r.pdf, nombre: nombreArchivoKude(doc) };
}

export function respuestaErrorFacturacion(error: unknown, accion: string) {
  if (error instanceof ErrorValidacionFiscal) return NextResponse.json({ error: error.message, detalles: error.detalles }, { status: error.estado });
  if (error instanceof ErrorFacturacion) return NextResponse.json({ error: error.message }, { status: error.estado });

  const pg = error as { code?: string; message?: string; detail?: string };

  if (pg.code === "42501") return NextResponse.json({ error: "No tiene permiso para esta acción." }, { status: 403 });
  if (pg.detail === "NEX:DOCUMENTO_NO_ENCONTRADO") return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
  if (pg.detail === "NEX:IDEMPOTENCIA_CONFLICTO") return NextResponse.json({ error: "La clave de la operación ya se usó con otro contenido. Recargue el formulario e intente de nuevo." }, { status: 409 });
  if (pg.detail === "NEX:ENTREGA_REQUERIDA") return NextResponse.json({ error: "El cliente tiene direcciones de entrega registradas: seleccione la dirección de entrega." }, { status: 409 });
  if (pg.detail === "NEX:ENTREGA_INVALIDA") return NextResponse.json({ error: "La dirección de entrega elegida no pertenece al cliente seleccionado o ya no está disponible. Revise la factura de nuevo." }, { status: 409 });
  if (pg.detail === "NEX:STOCK_INSUFICIENTE") return NextResponse.json({ error: `${pg.message ?? "Stock insuficiente."}. Revise la factura de nuevo.` }, { status: 409 });
  if (pg.detail && /^NEX:STOCK_(REPARTO_INVALIDO|DEPOSITO_NO_AUTORIZADO|PAYLOAD_INVALIDO)$/.test(pg.detail)) return NextResponse.json({ error: "El reparto de stock ya no es válido (depósitos o cantidades cambiaron). Revise la factura de nuevo." }, { status: 409 });
  if (pg.detail && /^NEX:(YA_ENVIADO|ENVIO_INDETERMINADO|ENVIO_EN_CURSO|REENVIO_REQUIERE_CONFIRMACION|TIPO_NO_ENVIABLE|SIN_SOLICITUD|ENVIO_NO_INICIADO)$/.test(pg.detail)) {
    return NextResponse.json({ error: pg.message ?? "El documento no se puede enviar en su estado actual." }, { status: 409 });
  }
  if (pg.detail && /^NEX:(SUCURSAL_INVALIDA|SIN_ESTABLECIMIENTO|CLIENTE_INVALIDO|PUNTO_INVALIDO|SECUENCIA_NO_CONFIGURADA|NUMERACION_AGOTADA|PAYLOAD_INVALIDO|FE_NO_ENCONTRADA|FE_NO_APROBADA|MONEDA_DISTINTA|ASOCIACION_INVALIDA|NCE_PENDIENTE|MOTIVO_FIJADO|MOTIVO_INVALIDO|LINEA_INVALIDA|SALDO_MONTO|SALDO_CANTIDAD|TOTAL_NO_CONCILIA|NCE_RECHAZADA)$/.test(pg.detail)) {
    return NextResponse.json({ error: pg.message ?? "La operación no cumple las reglas de facturación." }, { status: 409 });
  }
  if (pg.code === "P0001") return NextResponse.json({ error: pg.message ?? "La operación no cumple las reglas de facturación." }, { status: 400 });
  if (pg.code === "23505") return NextResponse.json({ error: "El CDC informado ya pertenece a otro documento de la empresa." }, { status: 409 });
  console.error(`Error al ${accion} el documento electrónico:`, error);

  return NextResponse.json({ error: `No fue posible ${accion} el documento electrónico.` }, { status: 500 });
}
