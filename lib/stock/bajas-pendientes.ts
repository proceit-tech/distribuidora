/**
 * PRO-354-R02 — «Bajas pendientes de stock» (NEX-081). Lectura y confirmación MANUAL del faltante de una FE emitida con la política «permitir facturar con stock insuficiente».
 *  · Listado: STOCK.VER y solo los depósitos del alcance del usuario (la función SQL filtra).
 *    Saldo registrado = disponible propio real. Proyectado = registrado − pendientes abiertos: es SOLO informativo, un negativo no es saldo físico ni contable.
 *  · Confirmación: MOVIMIENTOS.CREAR y alcance del depósito, con bloqueo e idempotencia.
 *    Genera una SALIDA/VENTA por el motor ordinario, solo con saldo real suficiente y con la FE enviada sin rechazo, cancelación ni inutilización.
 *    La reposición no confirma sola.
 * Sin NEX-081 las funciones no existen (42883): se responde 503 con un mensaje claro, nunca datos inventados.
 */
import type { Pool } from "pg";

type Db = Pick<Pool, "query">;
type F = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MENSAJE_SIN_NEX081_STOCK = "Las bajas pendientes de stock requieren la actualización de base de datos NEX-081, que todavía no está aplicada.";

export type EstadoBajaPendiente = "PENDIENTE" | "CONFIRMADA";
export type FiltrosBajasPendientes = { estado: EstadoBajaPendiente | null; depositoId: string | null; buscar: string };
export type BajaPendiente = {
  id: string; documentoId: string; documento: string; fechaEmision: string | null; estadoLocal: string; estadoSifen: string;
  productoCodigo: string; productoDescripcion: string; depositoId: string; depositoCodigo: string; depositoNombre: string;
  facturado: string; descontado: string; pendiente: string; saldoRegistrado: string; pendienteAbierto: string; saldoProyectado: string;
  estado: EstadoBajaPendiente; creadoAt: string | null; confirmadoAt: string | null; confirmadoPor: string | null; movimientoNumero: string | null;
  feConfirmable: boolean; conLote: boolean;
};

/** Filtros de la URL en forma estricta: estado PENDIENTE|CONFIRMADA|todos (por omisión PENDIENTE), depósito UUID opcional y búsqueda ≤ 80. null = filtro inválido. */
export function leerFiltrosBajas(p: URLSearchParams): FiltrosBajasPendientes | null {
  const estado = p.get("estado") ?? "PENDIENTE";
  const deposito = p.get("deposito") ?? "";
  const buscar = (p.get("buscar") ?? "").trim();

  if (!["PENDIENTE", "CONFIRMADA", "TODOS"].includes(estado)) return null;
  if (deposito !== "" && !UUID.test(deposito)) return null;
  if (buscar.length > 80) return null;

  return { estado: estado === "TODOS" ? null : (estado as EstadoBajaPendiente), depositoId: deposito === "" ? null : deposito.toLowerCase(), buscar };
}

const t = (v: unknown) => (v === null || v === undefined ? null : String(v));
const fecha = (v: unknown) => (v instanceof Date ? v.toISOString() : t(v));

export function filaBajaPendiente(f: F): BajaPendiente {
  return {
    id: String(f.o_id), documentoId: String(f.o_documento_id), documento: String(f.o_documento ?? ""), fechaEmision: fecha(f.o_fecha_emision),
    estadoLocal: String(f.o_estado_local ?? ""), estadoSifen: String(f.o_estado_sifen ?? ""),
    productoCodigo: String(f.o_producto_codigo ?? ""), productoDescripcion: String(f.o_producto_descripcion ?? ""),
    depositoId: String(f.o_deposito_id), depositoCodigo: String(f.o_deposito_codigo ?? ""), depositoNombre: String(f.o_deposito_nombre ?? ""),
    // numeric → texto exacto (nunca float).
    facturado: String(f.o_facturado), descontado: String(f.o_descontado), pendiente: String(f.o_pendiente),
    saldoRegistrado: String(f.o_saldo_registrado), pendienteAbierto: String(f.o_pendiente_abierto), saldoProyectado: String(f.o_saldo_proyectado),
    estado: f.o_estado === "CONFIRMADA" ? "CONFIRMADA" : "PENDIENTE", creadoAt: fecha(f.o_creado_at), confirmadoAt: fecha(f.o_confirmado_at),
    confirmadoPor: t(f.o_confirmado_por), movimientoNumero: t(f.o_movimiento_numero), feConfirmable: f.o_fe_confirmable === true, conLote: f.o_con_lote === true,
  };
}

export class SinNex081Error extends Error {}

const sinNex081 = (error: unknown) => (error as { code?: string }).code === "42883";

export async function listarBajasPendientes(db: Db, empresaId: string, usuarioId: string, filtros: FiltrosBajasPendientes): Promise<BajaPendiente[]> {
  try {
    const r = await db.query(
      `SELECT * FROM fe_stock_pendientes_listar($1::uuid, $2::uuid, $3::text, $4::uuid, $5::text)`,
      [empresaId, usuarioId, filtros.estado, filtros.depositoId, filtros.buscar],
    );

    return (r.rows as F[]).map(filaBajaPendiente);
  } catch (error) {
    if (sinNex081(error)) throw new SinNex081Error(MENSAJE_SIN_NEX081_STOCK);
    throw error;
  }
}

export async function confirmarBajaPendiente(db: Db, empresaId: string, usuarioId: string, pendienteId: string): Promise<{ movimientoId: string; numero: string; repetido: boolean }> {
  try {
    const r = await db.query(`SELECT o_movimiento_id AS id, o_numero AS numero, o_repetido AS repetido FROM fe_stock_pendiente_confirmar($1::uuid, $2::uuid, $3::uuid)`, [empresaId, usuarioId, pendienteId]);
    const f = (r.rows[0] ?? {}) as F;

    return { movimientoId: String(f.id), numero: String(f.numero), repetido: f.repetido === true };
  } catch (error) {
    if (sinNex081(error)) throw new SinNex081Error(MENSAJE_SIN_NEX081_STOCK);
    throw error;
  }
}

/** Respuesta de error de la vista (sin filtrar mensajes internos). Las reglas de negocio de NEX-081 devuelven su propio texto. */
export function errorBajaPendiente(error: unknown): { status: number; error: string } {
  if (error instanceof SinNex081Error) return { status: 503, error: error.message };

  const pg = error as { code?: string; message?: string; detail?: string };

  if (pg.code === "42501") return { status: 403, error: "No tiene permiso para esta acción o el depósito está fuera de su alcance." };
  if (pg.detail === "NEX:PENDIENTE_NO_ENCONTRADO") return { status: 404, error: "La baja pendiente no existe." };
  if (pg.detail && /^NEX:(STOCK_INSUFICIENTE|PENDIENTE_FE_NO_CONFIRMABLE|STOCK_PENDIENTE_LOTE)$/.test(pg.detail)) return { status: 409, error: pg.message ?? "La baja pendiente no se puede confirmar." };

  return { status: 500, error: "No fue posible completar la operación." };
}

/** El botón «Confirmar baja» solo se ofrece si tiene sentido intentarlo. La base vuelve a verificar TODO bajo bloqueo: saldo, estado de la FE, lotes, permiso y alcance. */
export function puedeIntentarConfirmar(b: BajaPendiente, permisoCrear: boolean): { puede: boolean; motivo: string } {
  if (b.estado !== "PENDIENTE") return { puede: false, motivo: "Ya confirmada." };
  if (!permisoCrear) return { puede: false, motivo: "Requiere permiso para crear movimientos." };
  if (!b.feConfirmable) return { puede: false, motivo: "La factura no tiene la recepción confirmada o fue rechazada, cancelada o inutilizada." };
  if (b.conLote) return { puede: false, motivo: "El producto controla lotes: requiere una definición específica." };

  // Comparación decimal EXACTA en texto (saldo registrado ≥ pendiente de ESTA baja).
  if (compararDecimal(b.saldoRegistrado, b.pendiente) < 0) return { puede: false, motivo: "Stock disponible insuficiente para confirmar." };

  return { puede: true, motivo: "" };
}

/** Compara dos decimales no negativos o negativos en texto, sin float. */
export function compararDecimal(a: string, b: string): number {
  const escala = (x: string): bigint => {
    const neg = x.trim().startsWith("-");
    const [e, d = ""] = x.trim().replace(/^-/, "").split(".");
    const v = BigInt((e || "0") + (d + "0000").slice(0, 4));

    return neg ? -v : v;
  };
  const x = escala(a);
  const y = escala(b);

  return x === y ? 0 : x < y ? -1 : 1;
}
