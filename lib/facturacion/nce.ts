import type { Pool } from "pg";

import { B, parseDec, textoDec } from "@/lib/facturacion/calculo";
import { leerCambio } from "@/lib/facturacion/monedas";
import { CAMPOS_RECEPTOR, construirPayloadNCE, esMotivoNce, lineasOriginalesDe, lineasParaSql, MAX_LINEAS_NCE, MOTIVOS_NCE, saldoDe, validarEntradaNce, calcularNce, type EntradaNce, type LineaOriginal, type MotivoNce } from "@/lib/facturacion/payload-nce";
import { numeroDocumento } from "@/lib/facturacion/estados";
import { ErrorFacturacion, ErrorValidacionFiscal } from "@/lib/facturacion/shared";

/**
 * Nota de Crédito Electrónica V1 (PRO-94), lado servidor. empresa_id y usuario SIEMPRE de la sesión; el alcance de sucursal lo exige sucursal_en_alcance en cada consulta y la función SQL
 * fe_documento_crear_nce lo vuelve a verificar. La factura original, su receptor, moneda, cambio e ítems salen del payload PERSISTIDO de la FE (documento_electronico_solicitudes), nunca del cadastro.
 * Los saldos se derivan de nce_lineas + el estado fiscal de cada NCE; la validación definitiva (con bloqueo de la FE) ocurre en SQL: lo calculado aquí sirve para la pantalla y para rechazar pronto.
 */
type Db = Pick<Pool, "query">;
type F = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const iso = (v: unknown): string => (v instanceof Date ? v : new Date(s(v))).toISOString();
const comodin = (t: string) => t.replace(/[!%_]/g, (c) => `!${c}`);
const entero = (v: unknown, defecto: number, min: number, max: number) => {
  const n = Math.floor(Number(v));

  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : defecto;
};

/** Mensaje cuando falta la migración NEX-062 (tablas/funciones inexistentes): nunca se inventan datos. */
export function traducirErrorNce(error: unknown): never {
  const pg = error as { code?: string };

  if (error instanceof ErrorFacturacion) throw error;
  if (pg.code === "42P01" || pg.code === "42883" || pg.code === "42703") throw new ErrorFacturacion(409, "La nota de crédito no está disponible: falta aplicar la migración NEX-062.");

  throw error;
}

/** Cuerpo de «Emitir Nota de Crédito» ya validado en su forma. string = error para el operador. */
export type CuerpoNce = {
  facturaId: string;
  motivo: number;
  sucursalId: string;
  puntoId: string;
  observacion: string;
  claveIdempotencia: string;
  lineas: Array<{ linea: number; cantidad?: string; monto?: string }>;
};

/** Tope conservador (bytes del JSON) frente al CHECK de 262144 bytes de la solicitud persistida (NEX-048). */
export const LIMITE_BYTES_PAYLOAD_NCE = 240000;

export function leerCuerpoNce(c: Record<string, unknown>): CuerpoNce | string {
  if (typeof c.facturaId !== "string" || !UUID.test(c.facturaId)) return "Seleccione la factura original.";
  if (!esMotivoNce(c.motivo)) return "Seleccione el motivo de la nota de crédito.";
  if (typeof c.sucursalId !== "string" || !UUID.test(c.sucursalId) || typeof c.puntoId !== "string" || !UUID.test(c.puntoId)) return "Seleccione la sucursal y el punto de expedición.";
  if (typeof c.claveIdempotencia !== "string" || c.claveIdempotencia.length < 8 || c.claveIdempotencia.length > 120) return "La clave de la operación no es válida; recargue el formulario.";
  if (c.observacion !== undefined && c.observacion !== null && typeof c.observacion !== "string") return "La observación no es válida.";
  if (!Array.isArray(c.lineas) || c.lineas.length === 0) return "Seleccione al menos una línea de la factura.";
  if (c.lineas.length > MAX_LINEAS_NCE) return `Una nota de crédito admite hasta ${MAX_LINEAS_NCE} líneas.`;

  const lineas: CuerpoNce["lineas"] = [];

  for (const x of c.lineas as unknown[]) {
    const l = x as Record<string, unknown> | null;

    if (!l || typeof l !== "object" || !Number.isInteger(l.linea) || (l.linea as number) < 1 || (l.linea as number) > MAX_LINEAS_NCE) return "Una línea de la nota de crédito no es válida.";
    if ((l.cantidad !== undefined && l.cantidad !== null && typeof l.cantidad !== "string") || (l.monto !== undefined && l.monto !== null && typeof l.monto !== "string")) return "Una cantidad o monto no es válido.";

    if (lineas.some((x) => x.linea === l.linea)) return "Una línea de la factura no puede repetirse en la nota de crédito.";

    lineas.push({ linea: l.linea as number, ...(typeof l.cantidad === "string" ? { cantidad: l.cantidad.trim() } : {}), ...(typeof l.monto === "string" ? { monto: l.monto.trim() } : {}) });
  }

  return { facturaId: c.facturaId, motivo: c.motivo as number, sucursalId: c.sucursalId, puntoId: c.puntoId, observacion: typeof c.observacion === "string" ? c.observacion : "", claveIdempotencia: c.claveIdempotencia, lineas };
}

// ── Lectura de la factura original ────────────────────────────────────────────────────────────────────────────

export type EstadoNceFactura = { motivoFijado: number | null; bloqueada: boolean; pendientes: Array<{ id: string; estadoLocal: string; estadoSifen: string }> };

/** Estado de las NCE de una FE: motivo fijado por la primera NCE aprobada (aunque luego se cancele) y si alguna bloquea (pendiente, indeterminada, reenviable, no reconocida). */
export async function estadoNceDeFactura(db: Db, empresaId: string, feId: string): Promise<EstadoNceFactura> {
  const r = await db.query(
    `SELECT o.motivo, n.id, n.estado_local AS "estadoLocal", n.estado_sifen AS "estadoSifen", fe_nce_clasificar(n.estado_local, n.estado_sifen, n.envio_error_tipo) AS clase
       FROM nce_origen o JOIN documentos_electronicos n ON n.empresa_id = o.empresa_id AND n.id = o.nce_id
      WHERE o.empresa_id = $1 AND o.fe_id = $2 ORDER BY n.creado_at, n.id`,
    [empresaId, feId],
  );
  const filas = r.rows as F[];
  const fijado = filas.find((f) => f.estadoSifen === "APROBADO" || f.estadoSifen === "CANCELADO");
  const pendientes = filas.filter((f) => f.clase === "BLOQUEA").map((f) => ({ id: s(f.id), estadoLocal: s(f.estadoLocal), estadoSifen: s(f.estadoSifen) }));

  return { motivoFijado: fijado ? Number(fijado.motivo) : null, bloqueada: pendientes.length > 0, pendientes };
}

export type LineaDetalle = LineaOriginal & {
  unidad: string;
  cantidadAcreditada: string;
  cantidadDisponible: string;
  montoAcreditado: string;
  saldoMonto: string;
  agotada: boolean;
};

export type FacturaOriginal = {
  id: string;
  sucursalId: string;
  numero: string;
  cdc: string;
  fechaEmision: string;
  moneda: string;
  cambio: string | null;
  total: string;
  clienteId: string | null;
  receptorNombre: string;
  receptorDocumento: string | null;
  receptor: Record<string, unknown>;
  lineas: LineaDetalle[];
  motivoFijado: number | null;
  bloqueada: boolean;
  /** Motivos que la pantalla puede ofrecer (el fijado, o los cuatro). */
  motivosPermitidos: number[];
};

/** Factura original lista para acreditar: aprobada, con CDC, en el alcance del usuario y con su payload persistido. Lanza ErrorFacturacion si no cumple. */
export async function leerFacturaOriginal(db: Db, empresaId: string, usuarioId: string, feId: string): Promise<FacturaOriginal> {
  if (!UUID.test(feId)) throw new ErrorFacturacion(404, "Factura original no encontrada.");

  const r = await db.query(
    `SELECT d.id, d.sucursal_id AS "sucursalId", d.establecimiento, d.punto_expedicion AS "puntoExpedicion", d.numero, d.serie, d.cdc, d.fecha_emision AS "fechaEmision", d.moneda, d.total::text AS total,
            d.cliente_id AS "clienteId", d.receptor_nombre AS "receptorNombre", d.receptor_documento AS "receptorDocumento", d.estado_sifen AS "estadoSifen", sol.payload
       FROM documentos_electronicos d
       JOIN LATERAL (SELECT payload FROM documento_electronico_solicitudes WHERE empresa_id = d.empresa_id AND documento_id = d.id ORDER BY version DESC LIMIT 1) sol ON true
      WHERE d.empresa_id = $1 AND d.id = $2 AND d.tipo = 'FE' AND sucursal_en_alcance($1::uuid, $3::uuid, d.sucursal_id)`,
    [empresaId, feId, usuarioId],
  );
  const f = r.rows[0] as F | undefined;

  if (!f) throw new ErrorFacturacion(404, "Factura original no encontrada.");
  if (f.estadoSifen !== "APROBADO" || !/^\d{44}$/.test(s(f.cdc))) throw new ErrorFacturacion(409, "La factura original debe estar APROBADA por SIFEN y tener su CDC para emitir una nota de crédito.");

  const payload = f.payload as Record<string, unknown>;
  const originales = lineasOriginalesDe(payload);

  if (originales === null) throw new ErrorFacturacion(409, "No se pudo leer el detalle de la factura original enviada: no se emite la nota de crédito.");

  const moneda = s(f.moneda);
  const cambio = moneda === "PYG" ? null : leerCambio(typeof payload.dTiCam === "number" ? String(payload.dTiCam) : s(payload.dTiCam));

  if (moneda !== "PYG" && cambio === null) throw new ErrorFacturacion(409, "La factura original en moneda extranjera no tiene un tipo de cambio legible: no se emite la nota de crédito.");

  const [acreditado, estado, unidades] = await Promise.all([
    db.query(
      `SELECT nl.linea, sum(nl.cantidad)::text AS cantidad, sum(nl.monto)::text AS monto
         FROM nce_lineas nl JOIN documentos_electronicos n ON n.empresa_id = nl.empresa_id AND n.id = nl.nce_id
        WHERE nl.empresa_id = $1 AND nl.fe_id = $2 AND n.estado_sifen = 'APROBADO' GROUP BY nl.linea`,
      [empresaId, feId],
    ),
    estadoNceDeFactura(db, empresaId, feId),
    db.query("SELECT codigo, representacion FROM unidades_medida_sifen WHERE codigo = ANY($1::int[])", [originales.map((o) => o.unidadSifen).filter((u): u is number => u !== null)]),
  ]);
  const porLinea = new Map((acreditado.rows as F[]).map((a) => [Number(a.linea), { cantidad: s(a.cantidad), monto: s(a.monto) }]));
  const simbolos = new Map((unidades.rows as F[]).map((u) => [Number(u.codigo), s(u.representacion)]));
  const lineas: LineaDetalle[] = originales.map((o) => {
    const a = porLinea.get(o.linea) ?? { cantidad: "0", monto: "0" };
    const saldo = saldoDe(o, a);

    return {
      ...o,
      unidad: o.unidadSifen !== null ? (simbolos.get(o.unidadSifen) ?? String(o.unidadSifen)) : "",
      cantidadAcreditada: a.cantidad === "" ? "0" : textoDec(parseDec(a.cantidad, 8) ?? B(0)),
      cantidadDisponible: textoDec(saldo.cantidad),
      montoAcreditado: a.monto === "" ? "0" : textoDec(parseDec(a.monto, 8) ?? B(0)),
      saldoMonto: textoDec(saldo.monto),
      agotada: saldo.monto <= B(0),
    };
  });
  const receptor = Object.fromEntries(CAMPOS_RECEPTOR.map((k) => [k, payload[k] ?? null]));

  return {
    id: s(f.id),
    sucursalId: s(f.sucursalId),
    // R01-03: la serie forma parte del número fiscal (001-001-0000001 y 001-001-0000001 (AA) son facturas distintas).
    numero: numeroDocumento({ establecimiento: s(f.establecimiento), puntoExpedicion: s(f.puntoExpedicion), numero: s(f.numero), serie: f.serie === null || f.serie === undefined ? null : s(f.serie) }),
    cdc: s(f.cdc),
    fechaEmision: iso(f.fechaEmision),
    moneda,
    cambio,
    total: s(f.total),
    clienteId: f.clienteId === null ? null : s(f.clienteId),
    receptorNombre: s(f.receptorNombre),
    receptorDocumento: f.receptorDocumento === null ? null : s(f.receptorDocumento),
    receptor,
    lineas,
    motivoFijado: estado.motivoFijado,
    bloqueada: estado.bloqueada,
    motivosPermitidos: estado.motivoFijado !== null ? [estado.motivoFijado] : [2, 3, 4, 8],
  };
}

// ── Catálogos de la pantalla ────────────────────────────────────────────────────────────────────────────────────────

/** Clientes de la empresa con facturas aprobadas O ya enviadas y aún sin resultado (se consultarán al seleccionarlos, RN-01) en el alcance del usuario (aunque hoy estén inactivos): paginado. Solo las APROBADAS con CDC son elegibles para la NCE (listarFacturasElegibles). */
export async function buscarClientesConFacturas(db: Db, empresaId: string, usuarioId: string, texto: string, pagina: unknown, porPagina: unknown) {
  const q = texto.trim().slice(0, 80);
  const n = entero(porPagina, 10, 1, 25);
  const p = entero(pagina, 1, 1, 100000);

  try {
    const r = await db.query(
      `SELECT c.id, c.codigo, c.razon_social AS "razonSocial", c.numero_documento AS "numeroDocumento", c.dv, (c.tipo_documento_identidad_sifen = 5) AS innominado, count(*) OVER() AS total
         FROM clientes c
        WHERE c.empresa_id = $1
          AND EXISTS (SELECT 1 FROM documentos_electronicos d WHERE d.empresa_id = c.empresa_id AND d.cliente_id = c.id AND d.tipo = 'FE' AND (d.estado_sifen = 'APROBADO' OR (d.estado_local IN ('ENVIADO', 'ENVIO_INDETERMINADO') AND d.estado_sifen IN ('SIN_CONSULTA', 'PENDIENTE', 'NO_RECONOCIDO'))) AND sucursal_en_alcance($1::uuid, $2::uuid, d.sucursal_id))
          AND ($3 = '' OR concat_ws(' ', c.codigo, c.razon_social, c.nombre_fantasia, c.numero_documento, c.numero_documento || '-' || c.dv) ILIKE $4 ESCAPE '!')
        ORDER BY c.razon_social, c.id LIMIT $5 OFFSET $6`,
      [empresaId, usuarioId, q, `%${comodin(q)}%`, n, (p - 1) * n],
    );
    const filas = r.rows as F[];
    const total = filas.length > 0 ? Number(filas[0].total) : 0;

    return { clientes: filas.map((c) => ({ id: s(c.id), codigo: s(c.codigo), razonSocial: s(c.razonSocial), documento: `${s(c.numeroDocumento)}${c.dv ? `-${s(c.dv)}` : ""}`, innominado: c.innominado === true })), total, pagina: p, totalPaginas: Math.max(1, Math.ceil(total / n)) };
  } catch (error) {
    return traducirErrorNce(error);
  }
}

export type FacturaElegible = { id: string; numero: string; cdc: string; fechaEmision: string; moneda: string; total: string; saldo: string; receptorNombre: string; ncePendiente: boolean };

/** Facturas aprobadas del cliente con saldo por acreditar, más recientes primero. Las que tienen una NCE pendiente se listan DESHABILITADAS («NCE pendiente»); las agotadas no aparecen. */
export async function listarFacturasElegibles(db: Db, empresaId: string, usuarioId: string, e: { clienteId: string; q?: string; pagina?: unknown; porPagina?: unknown }) {
  if (!UUID.test(e.clienteId)) throw new ErrorFacturacion(400, "Seleccione un cliente.");

  const bruto = (e.q ?? "").trim().slice(0, 80);
  // GAP-02: un CDC pegado con espacios o guiones (44 dígitos) se busca como CDC completo.
  const soloDigitos = bruto.replace(/[\s-]/g, "");
  const q = /^\d{44}$/.test(soloDigitos) ? soloDigitos : bruto;
  const n = entero(e.porPagina, 10, 1, 25);
  const p = entero(e.pagina, 1, 1, 100000);

  try {
    const r = await db.query(
      `WITH base AS (
         SELECT d.id, d.establecimiento || '-' || d.punto_expedicion || '-' || d.numero || CASE WHEN d.serie IS NULL THEN '' ELSE ' (' || d.serie || ')' END AS numero, d.cdc, d.fecha_emision, d.moneda, d.total::text AS total, d.receptor_nombre,
                (SELECT coalesce(sum((x.v->>'dTotOpeItem')::numeric), 0) FROM jsonb_array_elements(sv.payload->'Detalles') x(v)) AS original,
                (SELECT coalesce(sum(nl.monto), 0) FROM nce_lineas nl JOIN documentos_electronicos nn ON nn.empresa_id = nl.empresa_id AND nn.id = nl.nce_id
                  WHERE nl.empresa_id = d.empresa_id AND nl.fe_id = d.id AND nn.estado_sifen = 'APROBADO') AS acreditado,
                EXISTS (SELECT 1 FROM nce_origen o JOIN documentos_electronicos nn ON nn.empresa_id = o.empresa_id AND nn.id = o.nce_id
                         WHERE o.empresa_id = d.empresa_id AND o.fe_id = d.id AND fe_nce_clasificar(nn.estado_local, nn.estado_sifen, nn.envio_error_tipo) = 'BLOQUEA') AS pendiente
           FROM documentos_electronicos d
           -- ZERO-03: UNA sola versión fiscal (la última, igual que leerFacturaOriginal y fe_documento_crear_nce) antes de sumar sus Detalles; nunca la suma de todas las versiones.
           CROSS JOIN LATERAL (SELECT so.payload FROM documento_electronico_solicitudes so WHERE so.empresa_id = d.empresa_id AND so.documento_id = d.id ORDER BY so.version DESC LIMIT 1) sv
          WHERE d.empresa_id = $1 AND d.tipo = 'FE' AND d.estado_sifen = 'APROBADO' AND d.cdc IS NOT NULL AND d.cliente_id = $3 AND sucursal_en_alcance($1::uuid, $2::uuid, d.sucursal_id)
            AND ($4 = '' OR concat_ws(' ', d.establecimiento || '-' || d.punto_expedicion || '-' || d.numero || CASE WHEN d.serie IS NULL THEN '' ELSE ' (' || d.serie || ')' END, d.establecimiento || '-' || d.punto_expedicion || '-' || d.numero, coalesce(d.serie || '-' || d.numero, ''), d.cdc, to_char(d.fecha_emision AT TIME ZONE 'America/Asuncion', 'DD/MM/YYYY'), to_char(d.fecha_emision AT TIME ZONE 'America/Asuncion', 'YYYY-MM-DD')) ILIKE $5 ESCAPE '!'))
       SELECT *, (original - acreditado)::text AS saldo, count(*) OVER() AS total_filas FROM base WHERE original - acreditado > 0 ORDER BY fecha_emision DESC, id DESC LIMIT $6 OFFSET $7`,
      [empresaId, usuarioId, e.clienteId, q, `%${comodin(q)}%`, n, (p - 1) * n],
    );
    const filas = r.rows as F[];
    const total = filas.length > 0 ? Number(filas[0].total_filas) : 0;
    const facturas: FacturaElegible[] = filas.map((f) => ({
      id: s(f.id), numero: s(f.numero), cdc: s(f.cdc), fechaEmision: iso(f.fecha_emision), moneda: s(f.moneda), total: s(f.total), saldo: textoDec(parseDec(s(f.saldo), 8) ?? B(0)),
      receptorNombre: s(f.receptor_nombre), ncePendiente: f.pendiente === true,
    }));

    return { facturas, total, pagina: p, totalPaginas: Math.max(1, Math.ceil(total / n)) };
  } catch (error) {
    return traducirErrorNce(error);
  }
}

/** Sucursales del alcance con sus puntos ACTIVOS que tienen la secuencia NCE confirmada. `sinSecuencia` cuenta los puntos activos todavía sin ella (hay que configurarlos en Puntos de expedición). */
export async function puntosParaNce(db: Db, empresaId: string, usuarioId: string) {
  const r = await db.query(
    `SELECT sc.id, sc.nombre, sc.establecimiento_sifen AS establecimiento,
            coalesce(json_agg(json_build_object('id', p.id, 'codigo', p.codigo, 'nombre', p.nombre, 'ultimoNumero', q.ultimo_numero, 'serie', q.serie) ORDER BY p.codigo) FILTER (WHERE q.ultimo_numero IS NOT NULL AND q.activo), '[]'::json) AS puntos,
            count(p.id) FILTER (WHERE q.ultimo_numero IS NULL OR NOT q.activo)::int AS "sinSecuencia"
       FROM sucursales sc
       LEFT JOIN fe_puntos_expedicion p ON p.empresa_id = sc.empresa_id AND p.sucursal_id = sc.id
       LEFT JOIN fe_punto_secuencias q ON q.empresa_id = p.empresa_id AND q.punto_id = p.id AND q.tipo_documento = 'NCE'
      WHERE sc.empresa_id = $1 AND sc.activo AND sc.establecimiento_sifen IS NOT NULL AND sucursal_en_alcance($1::uuid, $2::uuid, sc.id)
      GROUP BY sc.id ORDER BY sc.nombre`,
    [empresaId, usuarioId],
  );

  return (r.rows as F[]).map((x) => ({ id: s(x.id), nombre: s(x.nombre), establecimiento: s(x.establecimiento), puntos: x.puntos as Array<{ id: string; codigo: string; nombre: string; ultimoNumero: number; serie: string | null }>, sinSecuencia: Number(x.sinSecuencia) }));
}

// ── Preparación (validación + payload) y emisión ──────────────────────────────────────────────────────────────────

export type PreparacionNce = {
  fe: FacturaOriginal;
  entrada: EntradaNce;
  payload: Record<string, unknown>;
  lineasSql: Array<{ linea: number; cantidad: string; monto: string }>;
  totalTexto: string;
  resumen: {
    factura: { numero: string; cdc: string; fechaEmision: string };
    motivo: { codigo: number; nombre: string };
    punto: string;
    moneda: string;
    cambio: string | null;
    observacion: string;
    lineas: Array<{ linea: number; codigo: string; descripcion: string; unidad: string; cantidad: string; precioUnitario: string; monto: string; afectacion: number; tasa: number; proporcion: string }>;
    totales: { exento: string; exonerado: string; gravado5: string; gravado10: string; iva5: string; iva10: string; totalIva: string; total: string };
    numero: string;
  };
};

/**
 * Valida TODO lo que se puede validar sin reservar numeración y construye el payload. No escribe nada. Errores 409/422 antes de la reserva (RN-17).
 */
export async function prepararNce(db: Db, empresaId: string, usuarioId: string, cuerpo: CuerpoNce): Promise<PreparacionNce> {
  let fe: FacturaOriginal;

  try {
    fe = await leerFacturaOriginal(db, empresaId, usuarioId, cuerpo.facturaId);
  } catch (error) {
    return traducirErrorNce(error);
  }

  if (fe.bloqueada) throw new ErrorFacturacion(409, "La factura tiene una nota de crédito pendiente de resultado: espere su resolución antes de emitir otra.");
  if (fe.motivoFijado !== null && fe.motivoFijado !== cuerpo.motivo) throw new ErrorFacturacion(409, `Esta factura ya tiene una nota de crédito aprobada con el motivo «${MOTIVOS_NCE[fe.motivoFijado]}»: no se mezclan motivos.`);

  const punto = await db.query(
    `SELECT p.codigo, q.ultimo_numero AS ultimo, q.activo AS "tipoActivo", sc.establecimiento_sifen AS establecimiento
       FROM fe_puntos_expedicion p JOIN sucursales sc ON sc.empresa_id = p.empresa_id AND sc.id = p.sucursal_id
       LEFT JOIN fe_punto_secuencias q ON q.empresa_id = p.empresa_id AND q.punto_id = p.id AND q.tipo_documento = 'NCE'
      WHERE p.empresa_id = $1 AND p.id = $2 AND p.sucursal_id = $3 AND sc.activo AND sc.establecimiento_sifen IS NOT NULL AND sucursal_en_alcance($1::uuid, $4::uuid, sc.id)`,
    [empresaId, cuerpo.puntoId, cuerpo.sucursalId, usuarioId],
  );
  const pf = punto.rows[0] as F | undefined;

  if (!pf) throw new ErrorFacturacion(422, "La sucursal o el punto de expedición no son válidos (inactivos, sin establecimiento SIFEN o fuera de su alcance).");
  if (pf.ultimo === null) throw new ErrorFacturacion(422, "El punto de expedición no tiene la secuencia de Nota de Crédito confirmada: configúrela en Puntos de expedición antes de emitir.");
  if (pf.tipoActivo !== true) throw new ErrorFacturacion(422, "El tipo «Nota de crédito» no está activo en este punto de expedición: actívelo en Puntos de expedición antes de emitir.");

  const porLinea = new Map(fe.lineas.map((l) => [l.linea, l]));
  const desconocidas = cuerpo.lineas.filter((l) => !porLinea.has(l.linea));

  if (desconocidas.length > 0) throw new ErrorFacturacion(422, "Una línea seleccionada no pertenece a la factura original.");

  const entrada: EntradaNce = {
    motivo: cuerpo.motivo,
    moneda: fe.moneda,
    cambio: fe.cambio,
    observacion: cuerpo.observacion,
    lineas: cuerpo.lineas.map((l) => {
      const d = porLinea.get(l.linea) as LineaDetalle;

      return { original: d, acreditado: { cantidad: d.cantidadAcreditada, monto: d.montoAcreditado }, ...(l.cantidad !== undefined ? { cantidad: l.cantidad } : {}), ...(l.monto !== undefined ? { monto: l.monto } : {}) };
    }),
  };
  const errores = validarEntradaNce(entrada);

  if (errores.length > 0) throw new ErrorValidacionFiscal(422, "La nota de crédito no cumple las reglas fiscales.", errores);

  const payload = construirPayloadNCE(entrada, fe.receptor, fe.cdc);

  // La solicitud se guarda en documento_electronico_solicitudes.payload con CHECK pg_column_size(payload) < 262144 (NEX-048). Con muchas líneas el JSON puede excederlo: se avisa ANTES (mensaje claro,
  // sin intentar crear) en vez de fallar dentro de la función SQL. Umbral conservador sobre el JSON UTF-8.
  if (Buffer.byteLength(JSON.stringify(payload), "utf8") > LIMITE_BYTES_PAYLOAD_NCE) throw new ErrorFacturacion(422, "La nota de crédito tiene demasiadas líneas para un solo documento electrónico. Divídala en dos notas de crédito (cada una sobre líneas distintas).");
  const calculo = calcularNce(entrada);

  return {
    fe,
    entrada,
    payload,
    lineasSql: lineasParaSql(entrada),
    totalTexto: calculo.totalTexto,
    resumen: {
      factura: { numero: fe.numero, cdc: fe.cdc, fechaEmision: fe.fechaEmision },
      motivo: { codigo: cuerpo.motivo, nombre: MOTIVOS_NCE[cuerpo.motivo] },
      punto: `${s(pf.establecimiento)}-${s(pf.codigo)}`,
      moneda: fe.moneda,
      cambio: fe.cambio,
      observacion: cuerpo.observacion.trim(),
      lineas: calculo.items.map((i) => ({
        linea: i.linea, codigo: i.original.codigoInterno, descripcion: i.original.descripcion, unidad: (porLinea.get(i.linea) as LineaDetalle).unidad, cantidad: textoDec(i.cantidad), precioUnitario: textoDec(i.precio), monto: i.montoTexto,
        afectacion: i.original.afectacion, tasa: i.original.tasa, proporcion: i.original.proporcion,
      })),
      totales: calculo.totales,
      numero: "Se asigna al emitir la nota de crédito",
    },
  };
}

/** Crea la NCE (documento + payload inmutable + relación con la FE, número reservado UNA vez) de forma idempotente. Solo se llama al CONFIRMAR. */
export async function crearNotaCredito(db: Db, empresaId: string, usuarioId: string, cuerpo: CuerpoNce, prep: PreparacionNce) {
  const llamar = () =>
    db.query(
      `SELECT o_documento_id AS "documentoId", o_numero AS numero, o_reutilizado AS reutilizado FROM fe_documento_crear_nce($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::uuid, $7::integer, $8::jsonb, $9, $10::numeric, $11::jsonb)`,
      [empresaId, usuarioId, cuerpo.sucursalId, cuerpo.puntoId, cuerpo.claveIdempotencia, cuerpo.facturaId, cuerpo.motivo, JSON.stringify(prep.lineasSql), prep.fe.moneda, prep.totalTexto, JSON.stringify(prep.payload)],
    );

  try {
    return (await llamar()).rows[0] as F;
  } catch (error) {
    // Carrera de la misma clave: la otra transacción ya la confirmó; releer devuelve su documento (o el conflicto si el contenido difiere).
    if ((error as { code?: string }).code === "23505") return (await llamar()).rows[0] as F;

    return traducirErrorNce(error);
  }
}

/** Propuesta de corrección a partir de una NCE RECHAZADA definitivamente: precarga la FE, el motivo y las líneas SOLO como nueva propuesta (se revalida todo al emitir). */
export async function propuestaCorreccion(db: Db, empresaId: string, usuarioId: string, nceId: string) {
  if (!UUID.test(nceId)) throw new ErrorFacturacion(404, "Nota de crédito no encontrada.");

  try {
    const r = await db.query(
      `SELECT n.id, n.sucursal_id AS "sucursalId", n.establecimiento, n.punto_expedicion AS "puntoExpedicion", n.numero, n.serie, n.estado_local AS "estadoLocal", n.estado_sifen AS "estadoSifen", n.envio_error_tipo AS "envioErrorTipo",
              o.fe_id AS "feId", o.motivo, o.observacion,
              (SELECT p.id FROM fe_puntos_expedicion p WHERE p.empresa_id = n.empresa_id AND p.sucursal_id = n.sucursal_id AND p.codigo = n.punto_expedicion) AS "puntoId"
         FROM documentos_electronicos n JOIN nce_origen o ON o.empresa_id = n.empresa_id AND o.nce_id = n.id
        WHERE n.empresa_id = $1 AND n.id = $2 AND n.tipo = 'NCE' AND sucursal_en_alcance($1::uuid, $3::uuid, n.sucursal_id)`,
      [empresaId, nceId, usuarioId],
    );
    const n = r.rows[0] as F | undefined;

    if (!n) throw new ErrorFacturacion(404, "Nota de crédito no encontrada.");

    const rechazada = n.estadoSifen === "RECHAZADO" || (n.estadoLocal === "ERROR_ENVIO" && n.envioErrorTipo === "RECHAZO");

    if (!rechazada) throw new ErrorFacturacion(409, "Solo una nota de crédito rechazada definitivamente se puede corregir y emitir de nuevo.");

    const lineas = await db.query("SELECT linea, cantidad::text AS cantidad, monto::text AS monto FROM nce_lineas WHERE empresa_id = $1 AND nce_id = $2 ORDER BY linea", [empresaId, nceId]);

    return {
      facturaId: s(n.feId),
      motivo: Number(n.motivo),
      sucursalId: s(n.sucursalId),
      puntoId: n.puntoId === null ? null : s(n.puntoId),
      observacion: n.observacion === null ? "" : s(n.observacion),
      numeroRechazado: numeroDocumento({ establecimiento: s(n.establecimiento), puntoExpedicion: s(n.puntoExpedicion), numero: s(n.numero), serie: n.serie === null || n.serie === undefined ? null : s(n.serie) }),
      lineas: (lineas.rows as F[]).map((l) => ({ linea: Number(l.linea), cantidad: textoDec(parseDec(s(l.cantidad), 8) ?? B(0)), monto: textoDec(parseDec(s(l.monto), 8) ?? B(0)) })),
    };
  } catch (error) {
    return traducirErrorNce(error);
  }
}

export { esMotivoNce, MOTIVOS_NCE };
export type { MotivoNce };
