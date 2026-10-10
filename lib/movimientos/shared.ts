import { NextResponse } from "next/server";
import type { PoolClient } from "pg";

// Validación y registro de movimientos de inventario. Toda la escritura de stock/costos pasa por
// inventario_registrar_movimiento / inventario_anular_movimiento (el rol de ejecución no escribe saldos directamente).

type Cuerpo = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const TIPOS = [
  "ENTRADA", "SALIDA", "TRANSFERENCIA", "AJUSTE_POSITIVO", "AJUSTE_NEGATIVO",
  "RESERVA", "LIBERACION_RESERVA", "CUARENTENA", "LIBERACION_CUARENTENA",
] as const;
const ORIGENES = ["MANUAL", "COMPRA", "VENTA", "DEVOLUCION", "TRANSFERENCIA", "AJUSTE", "INVENTARIO"];

const CON_ORIGEN = ["SALIDA", "TRANSFERENCIA", "RESERVA", "LIBERACION_RESERVA", "CUARENTENA", "LIBERACION_CUARENTENA", "AJUSTE_NEGATIVO"];
const CON_DESTINO = ["ENTRADA", "TRANSFERENCIA", "AJUSTE_POSITIVO"];
const CON_COSTO = ["ENTRADA", "AJUSTE_POSITIVO"];
/** Tipos que pueden crear un lote nuevo (ingresan stock desde fuera). */
const CREAN_LOTE = ["ENTRADA", "AJUSTE_POSITIVO"];

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function fecha(v: unknown, etiqueta: string) {
  const e = texto(v, 10);
  if (!e) return null;
  const m = e.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error(`${etiqueta} no tiene un formato válido.`);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) throw new Error(`${etiqueta} no es válida.`);
  return e;
}

export type DatosMovimiento = ReturnType<typeof prepararMovimiento>;

export function prepararMovimiento(d: Cuerpo) {
  const tipo = texto(d.tipo, 40).toUpperCase();
  const origen = texto(d.origen, 40).toUpperCase() || "MANUAL";
  if (!(TIPOS as readonly string[]).includes(tipo)) throw new Error("Tipo de movimiento no válido.");
  if (!ORIGENES.includes(origen)) throw new Error("Origen de movimiento no válido.");

  const productoId = texto(d.productoId, 40);
  if (!UUID.test(productoId)) throw new Error("Seleccione un producto.");

  const cantidad = Number(d.cantidad);
  if (!Number.isFinite(cantidad) || cantidad <= 0) throw new Error("La cantidad debe ser mayor que cero.");
  if (Math.abs(cantidad - Math.round(cantidad * 10000) / 10000) > 1e-9) throw new Error("La cantidad admite hasta 4 decimales.");

  const origenId = texto(d.depositoOrigenId, 40);
  const destinoId = texto(d.depositoDestinoId, 40);
  const necesitaOrigen = CON_ORIGEN.includes(tipo);
  const necesitaDestino = CON_DESTINO.includes(tipo);
  if (necesitaOrigen && !UUID.test(origenId)) throw new Error("Seleccione el depósito origen.");
  if (necesitaDestino && !UUID.test(destinoId)) throw new Error("Seleccione el depósito destino.");
  if (tipo === "TRANSFERENCIA" && origenId === destinoId) throw new Error("El depósito origen y destino deben ser diferentes.");

  let costo: number | null = null;
  if (CON_COSTO.includes(tipo)) {
    if (d.costoUnitario === "" || d.costoUnitario === null || d.costoUnitario === undefined) {
      throw new Error("Ingrese el costo unitario de la entrada: el costo no se inventa.");
    }
    costo = Number(d.costoUnitario);
    if (!Number.isFinite(costo) || costo < 0) throw new Error("El costo unitario no es válido.");
  }

  const clave = texto(d.claveIdempotencia, 120);
  if (clave && clave.length < 8) throw new Error("La clave de idempotencia no es válida.");

  return {
    tipo,
    origen,
    fecha: fecha(d.fecha, "La fecha"),
    productoId,
    cantidad,
    costo,
    origenId: necesitaOrigen ? origenId : null,
    destinoId: necesitaDestino ? destinoId : null,
    lote: texto(d.lote, 80),
    vencimiento: fecha(d.fechaVencimiento, "La fecha de vencimiento"),
    documento: texto(d.documentoReferencia, 120) || null,
    motivo: texto(d.motivo, 300) || null,
    observacion: texto(d.observacion, 1000) || null,
    clave: clave || null,
  };
}

/** Resuelve el lote según el modo de control del producto. Devuelve el id del lote o null. */
async function resolverLote(c: PoolClient, empresaId: string, d: DatosMovimiento) {
  const p = await c.query(`SELECT modo_control_stock AS modo, controla_stock FROM productos WHERE empresa_id = $1 AND id = $2`, [empresaId, d.productoId]);
  if (!p.rowCount) throw new Error("El producto no existe en su empresa.");
  const { modo } = p.rows[0] as { modo: string };

  if (modo === "UNIDAD_ETIQUETADA") {
    throw new Error("Los productos con unidad identificada (serie/etiqueta) aún no se pueden mover desde esta pantalla: pendiente de soporte en el banco.");
  }
  if (modo !== "LOTE") {
    if (d.lote) throw new Error("Este producto no se controla por lote.");
    return null;
  }
  if (!d.lote) throw new Error("Ingrese el lote: este producto se controla por lote.");

  const existente = await c.query(
    `SELECT id, to_char(fecha_vencimiento, 'YYYY-MM-DD') AS venc FROM stock_lotes WHERE empresa_id = $1 AND producto_id = $2 AND codigo_lote = $3`,
    [empresaId, d.productoId, d.lote],
  );
  if (existente.rowCount) {
    const l = existente.rows[0] as { id: string; venc: string | null };
    if (d.vencimiento && l.venc && d.vencimiento !== l.venc) throw new Error(`El lote ${d.lote} ya existe con vencimiento ${l.venc}.`);
    return l.id;
  }
  if (!CREAN_LOTE.includes(d.tipo)) throw new Error(`El lote ${d.lote} no existe para este producto.`);
  const nuevo = await c.query(
    `INSERT INTO stock_lotes (empresa_id, producto_id, codigo_lote, fecha_vencimiento) VALUES ($1,$2,$3,$4) RETURNING id`,
    [empresaId, d.productoId, d.lote, d.vencimiento],
  );
  return (nuevo.rows[0] as { id: string }).id;
}

export async function registrarMovimiento(c: PoolClient, empresaId: string, usuarioId: string, d: DatosMovimiento) {
  const lote = await resolverLote(c, empresaId, d);
  const linea: Record<string, unknown> = { producto_id: d.productoId, cantidad: d.cantidad, propiedad: "PROPIO" };
  if (d.costo !== null) linea.costo_unitario = d.costo;
  if (lote) linea.lote_id = lote;

  const r = await c.query(
    `SELECT o_movimiento_id AS id, o_numero AS numero, o_repetido AS repetido
       FROM inventario_registrar_movimiento($1::uuid, $2::uuid, $3, $4, $5::date, $6::uuid, $7::uuid, $8::jsonb, $9, NULL, $10, $11, $12)`,
    [empresaId, usuarioId, d.tipo, d.origen, d.fecha, d.origenId, d.destinoId, JSON.stringify([linea]), d.clave, d.motivo, d.observacion, d.documento],
  );
  return r.rows[0] as { id: string; numero: string; repetido: boolean };
}

export function respuestaError(error: unknown, accion: string) {
  console.error(`Error al ${accion} movimiento:`, error);
  const pg = error as { code?: string; message?: string; detail?: string };
  if (pg.code === "42501") return NextResponse.json({ error: "No tiene permiso o alcance sobre el depósito para esta operación." }, { status: 403 });
  if (pg.code === "P0001") {
    const status = pg.detail?.startsWith("NEX:IDEMPOTENCIA_CONFLICTO") || pg.detail === "NEX:YA_ANULADO" ? 409 : 400;
    return NextResponse.json({ error: pg.message ?? "Operación rechazada por las reglas de inventario." }, { status });
  }
  if (pg.code === "23505") return NextResponse.json({ error: "El movimiento ya existe (clave repetida)." }, { status: 409 });
  if (pg.code === "23503" || pg.code === "23514" || pg.code === "22P02" || pg.code === "22007" || pg.code === "22003") {
    return NextResponse.json({ error: "Los datos del movimiento no son válidos para su empresa." }, { status: 400 });
  }
  if (pg.code) return NextResponse.json({ error: `No fue posible ${accion} el movimiento.` }, { status: 500 });
  return NextResponse.json({ error: error instanceof Error ? error.message : `No fue posible ${accion} el movimiento.` }, { status: 400 });
}

/** SELECT común de filas (una por línea) con nombres resueltos; siempre se filtra por m.empresa_id. */
export const SELECT_FILAS = `
  SELECT m.id, l.id AS "lineaId", m.numero_movimiento AS numero, m.tipo_movimiento AS tipo, m.tipo_origen AS origen, m.estado,
         to_char(m.fecha_movimiento, 'YYYY-MM-DD') AS fecha, to_char(m.hora_movimiento, 'HH24:MI') AS hora,
         l.producto_id AS "productoId", p.codigo AS "productoCodigo", p.descripcion AS "productoDescripcion",
         coalesce(um.nombre, '') AS "unidadMedidaNombre",
         coalesce(m.deposito_origen_id::text, '') AS "depositoOrigenId", coalesce(dor.nombre, '') AS "depositoOrigenNombre",
         coalesce(m.deposito_destino_id::text, '') AS "depositoDestinoId", coalesce(dde.nombre, '') AS "depositoDestinoNombre",
         l.cantidad::float8 AS cantidad, l.costo_unitario::float8 AS "costoUnitario", l.costo_total::float8 AS "costoTotal",
         coalesce(l.moneda_costo_codigo, '') AS "monedaCosto",
         coalesce(sl.codigo_lote, '') AS lote, coalesce(to_char(sl.fecha_vencimiento, 'YYYY-MM-DD'), '') AS "fechaVencimiento",
         l.propiedad, coalesce(m.documento_referencia, '') AS "documentoReferencia", coalesce(m.motivo, '') AS motivo,
         coalesce(m.observacion, '') AS observacion, coalesce(u.usuario, '') AS usuario, m.creado_at AS "creadoEn"
    FROM movimientos_inventario m
    JOIN movimiento_lineas l ON l.empresa_id = m.empresa_id AND l.movimiento_id = m.id
    JOIN productos p ON p.empresa_id = l.empresa_id AND p.id = l.producto_id
    LEFT JOIN unidades_medida um ON um.id = p.unidad_medida_id
    LEFT JOIN stock_lotes sl ON sl.empresa_id = l.empresa_id AND sl.id = l.lote_id
    LEFT JOIN depositos dor ON dor.empresa_id = m.empresa_id AND dor.id = m.deposito_origen_id
    LEFT JOIN depositos dde ON dde.empresa_id = m.empresa_id AND dde.id = m.deposito_destino_id
    LEFT JOIN usuarios u ON u.empresa_id = m.empresa_id AND u.id = m.creado_por`;
