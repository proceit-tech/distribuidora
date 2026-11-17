/**
 * PRO-354-R02 — «Bajas pendientes de stock» (NEX-081). Lectura y confirmación MANUAL del faltante de una FE emitida con la política «permitir facturar con stock insuficiente».
 *  · Listado: STOCK.VER y solo los depósitos del alcance del usuario (la función SQL filtra). R01/F002: paginado con total, filtro de sucursal,
 *    referencia fiscal con serie, y cantidades separadas: facturado, descontado al emitir, faltante original, pendiente actual y descontado total.
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
/** R01/F002: tamaños de página admitidos (la función SQL acepta 1..100). */
export const TAMANOS_PAGINA_BAJAS = [25, 50, 100] as const;
export type FiltrosBajasPendientes = {
  estado: EstadoBajaPendiente | null; sucursalId: string | null; depositoId: string | null; buscar: string; pagina: number; porPagina: number;
};
export type BajaPendiente = {
  id: string; documentoId: string;
  /** Identificación fiscal COMPLETA: establecimiento-punto-número y la serie entre paréntesis si existe (dos FE de series distintas pueden tener el mismo número). */
  documento: string; serie: string | null; fechaEmision: string | null; estadoLocal: string; estadoSifen: string;
  productoCodigo: string; productoDescripcion: string; unidad: string; sucursalId: string; sucursalNombre: string;
  depositoId: string; depositoCodigo: string; depositoNombre: string;
  /** Cantidades exactas en texto (numeric, nunca float). */
  facturado: string; descontadoEmision: string; faltanteOriginal: string; pendienteActual: string; descontadoTotal: string;
  saldoRegistrado: string; pendienteAbierto: string; saldoProyectado: string;
  estado: EstadoBajaPendiente; creadoAt: string | null; confirmadoAt: string | null; confirmadoPor: string | null; movimientoNumero: string | null;
  feConfirmable: boolean; conLote: boolean;
};
export type PaginaBajasPendientes = { bajas: BajaPendiente[]; total: number; pagina: number; porPagina: number };
export type OpcionSucursal = { id: string; codigo: string; nombre: string };
export type OpcionDeposito = { id: string; codigo: string; nombre: string; sucursalId: string; activo: boolean };
export type CatalogoFiltrosBajas = { sucursales: OpcionSucursal[]; depositos: OpcionDeposito[] };

const entero = (v: string | null, def: number) => (v === null || v === "" ? def : /^[0-9]{1,6}$/.test(v) ? Number(v) : NaN);

/**
 * Filtros de la URL en forma estricta: estado PENDIENTE|CONFIRMADA|TODOS (por omisión PENDIENTE), sucursal y depósito UUID opcionales, búsqueda ≤ 80,
 * página 1..10000 (el desplazamiento no supera el máximo de la función SQL) y tamaño 25|50|100 (por omisión 25). null = filtro inválido.
 */
export function leerFiltrosBajas(p: URLSearchParams): FiltrosBajasPendientes | null {
  const estado = p.get("estado") ?? "PENDIENTE";
  const sucursal = p.get("sucursal") ?? "";
  const deposito = p.get("deposito") ?? "";
  const buscar = (p.get("buscar") ?? "").trim();
  const pagina = entero(p.get("pagina"), 1);
  const porPagina = entero(p.get("porPagina"), TAMANOS_PAGINA_BAJAS[0]);

  if (!["PENDIENTE", "CONFIRMADA", "TODOS"].includes(estado)) return null;
  if (sucursal !== "" && !UUID.test(sucursal)) return null;
  if (deposito !== "" && !UUID.test(deposito)) return null;
  if (buscar.length > 80) return null;
  if (!Number.isInteger(pagina) || pagina < 1 || pagina > 10000) return null;
  if (!(TAMANOS_PAGINA_BAJAS as readonly number[]).includes(porPagina)) return null;

  return {
    estado: estado === "TODOS" ? null : (estado as EstadoBajaPendiente),
    sucursalId: sucursal === "" ? null : sucursal.toLowerCase(),
    depositoId: deposito === "" ? null : deposito.toLowerCase(),
    buscar, pagina, porPagina,
  };
}

const t = (v: unknown) => (v === null || v === undefined ? null : String(v));
const fecha = (v: unknown) => (v instanceof Date ? v.toISOString() : t(v));

export function filaBajaPendiente(f: F): BajaPendiente {
  return {
    id: String(f.o_id), documentoId: String(f.o_documento_id), documento: String(f.o_documento ?? ""), serie: t(f.o_serie), fechaEmision: fecha(f.o_fecha_emision),
    estadoLocal: String(f.o_estado_local ?? ""), estadoSifen: String(f.o_estado_sifen ?? ""),
    productoCodigo: String(f.o_producto_codigo ?? ""), productoDescripcion: String(f.o_producto_descripcion ?? ""), unidad: String(f.o_unidad ?? ""),
    sucursalId: String(f.o_sucursal_id), sucursalNombre: String(f.o_sucursal_nombre ?? ""),
    depositoId: String(f.o_deposito_id), depositoCodigo: String(f.o_deposito_codigo ?? ""), depositoNombre: String(f.o_deposito_nombre ?? ""),
    // numeric → texto exacto (nunca float).
    facturado: String(f.o_facturado), descontadoEmision: String(f.o_descontado_emision), faltanteOriginal: String(f.o_faltante_original),
    pendienteActual: String(f.o_pendiente_actual), descontadoTotal: String(f.o_descontado_total),
    saldoRegistrado: String(f.o_saldo_registrado), pendienteAbierto: String(f.o_pendiente_abierto), saldoProyectado: String(f.o_saldo_proyectado),
    estado: f.o_estado === "CONFIRMADA" ? "CONFIRMADA" : "PENDIENTE", creadoAt: fecha(f.o_creado_at), confirmadoAt: fecha(f.o_confirmado_at),
    confirmadoPor: t(f.o_confirmado_por), movimientoNumero: t(f.o_movimiento_numero), feConfirmable: f.o_fe_confirmable === true, conLote: f.o_con_lote === true,
  };
}

export class SinNex081Error extends Error {}

const sinNex081 = (error: unknown) => (error as { code?: string }).code === "42883";

export async function listarBajasPendientes(db: Db, empresaId: string, usuarioId: string, filtros: FiltrosBajasPendientes): Promise<PaginaBajasPendientes> {
  try {
    const r = await db.query(
      `SELECT * FROM fe_stock_pendientes_listar($1::uuid, $2::uuid, $3::text, $4::uuid, $5::uuid, $6::text, $7::integer, $8::integer)`,
      [empresaId, usuarioId, filtros.estado, filtros.sucursalId, filtros.depositoId, filtros.buscar, filtros.porPagina, (filtros.pagina - 1) * filtros.porPagina],
    );
    const filas = r.rows as F[];
    // count(*) OVER () viaja en cada fila; una página más allá del final no trae filas y el total se informa como 0 (la vista vuelve a la página 1).
    const total = filas.length > 0 ? Number(filas[0].o_total) : 0;

    return { bajas: filas.map(filaBajaPendiente), total: Number.isFinite(total) ? total : 0, pagina: filtros.pagina, porPagina: filtros.porPagina };
  } catch (error) {
    if (sinNex081(error)) throw new SinNex081Error(MENSAJE_SIN_NEX081_STOCK);
    throw error;
  }
}

/** R01/F002: catálogo de sucursales y depósitos autorizados para los filtros; no depende de la página ni de los filtros aplicados. */
export async function listarFiltrosBajas(db: Db, empresaId: string, usuarioId: string): Promise<CatalogoFiltrosBajas> {
  try {
    const r = await db.query(`SELECT * FROM fe_stock_pendientes_filtros($1::uuid, $2::uuid)`, [empresaId, usuarioId]);
    const sucursales = new Map<string, OpcionSucursal>();
    const depositos: OpcionDeposito[] = [];

    for (const f of r.rows as F[]) {
      const sid = String(f.o_sucursal_id);

      if (!sucursales.has(sid)) sucursales.set(sid, { id: sid, codigo: String(f.o_sucursal_codigo ?? ""), nombre: String(f.o_sucursal_nombre ?? "") });
      depositos.push({ id: String(f.o_deposito_id), codigo: String(f.o_deposito_codigo ?? ""), nombre: String(f.o_deposito_nombre ?? ""), sucursalId: sid, activo: f.o_deposito_activo === true });
    }

    return { sucursales: [...sucursales.values()], depositos };
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
  if (pg.detail && /^NEX:(STOCK_INSUFICIENTE|PENDIENTE_FE_NO_CONFIRMABLE|STOCK_PENDIENTE_LOTE|PENDIENTE_SUCURSAL_DISTINTA|PENDIENTE_UNIDAD_DISTINTA|STOCK_DEPOSITO_NO_AUTORIZADO|STOCK_PENDIENTE_INVALIDO)$/.test(pg.detail)) return { status: 409, error: pg.message ?? "La baja pendiente no se puede confirmar." };

  return { status: 500, error: "No fue posible completar la operación." };
}

/** El botón «Confirmar baja» solo se ofrece si tiene sentido intentarlo. La base vuelve a verificar TODO bajo bloqueo: saldo, estado de la FE, lotes, permiso y alcance. */
export function puedeIntentarConfirmar(b: BajaPendiente, permisoCrear: boolean): { puede: boolean; motivo: string } {
  if (b.estado !== "PENDIENTE") return { puede: false, motivo: "Ya confirmada." };
  if (!permisoCrear) return { puede: false, motivo: "Requiere permiso para crear movimientos." };
  if (!b.feConfirmable) return { puede: false, motivo: "La factura no tiene la recepción confirmada o fue rechazada, cancelada o inutilizada." };
  if (b.conLote) return { puede: false, motivo: "El producto controla lotes: requiere una definición específica." };

  // Comparación decimal EXACTA en texto (saldo registrado ≥ pendiente de ESTA baja).
  if (compararDecimal(b.saldoRegistrado, b.pendienteActual) < 0) return { puede: false, motivo: "Stock disponible insuficiente para confirmar." };

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

/* ---------------------------------------------------------------------------------------------------------------------------------
 * R02-R02/F003-R — Resultado de una CONFIRMACIÓN, separado de los errores de CARGA del listado.
 * · Pertenece a la baja/factura confirmada (no a la consulta): se muestra identificado por la factura aunque los filtros hayan cambiado mientras
 *   el POST estaba en curso (la confirmación sí cambió el stock y el operador debe saberlo).
 * · Una lectura exitosa del listado NO lo borra (solo limpia el error de carga). Se reemplaza al iniciar otra confirmación y se descarta solo
 *   con la acción explícita «Cerrar». Cambiar filtros o página no lo borra.
 * ------------------------------------------------------------------------------------------------------------------------------- */
export type ResultadoConfirmacion = { tipo: "OK" | "ERROR"; bajaId: string; documento: string; texto: string };

export function resultadoConfirmacion(
  b: { id: string; documento: string }, ok: boolean, j: { numero?: string; repetido?: boolean; error?: string },
): ResultadoConfirmacion {
  if (!ok) return { tipo: "ERROR", bajaId: b.id, documento: b.documento, texto: `Factura ${b.documento}: no se confirmó la baja. ${j.error ?? "No fue posible confirmar la baja pendiente."}` };

  return {
    tipo: "OK", bajaId: b.id, documento: b.documento,
    texto: j.repetido ? `Factura ${b.documento}: la baja ya estaba confirmada (movimiento ${j.numero ?? "—"}).` : `Factura ${b.documento}: baja confirmada, movimiento ${j.numero ?? "—"}.`,
  };
}

/* ---------------------------------------------------------------------------------------------------------------------------------
 * R01/F003 — Contexto vigente de la vista. Toda respuesta pertenece a una CONSULTA (filtros + página) y a una GENERACIÓN.
 * La generación sube EN EL MISMO MOMENTO en que cambia la consulta (no al lanzar la lectura después del retardo de la búsqueda), y también
 * para la relectura posterior a una confirmación. Solo se aplica la respuesta de la generación y consulta vigentes; las filas de otra
 * consulta no se muestran ni se pueden accionar.
 * ------------------------------------------------------------------------------------------------------------------------------- */
export type ConsultaBajas = { estado: EstadoBajaPendiente | "TODOS"; sucursal: string; deposito: string; buscar: string; pagina: number; porPagina: number };
export type TicketBajas = { generacion: number; clave: string };

/** Query string canónico (orden fijo, búsqueda recortada, valores vacíos omitidos): también es la clave del contexto. */
export function consultaBajas(c: ConsultaBajas): string {
  const q = new URLSearchParams();
  const buscar = c.buscar.trim();

  q.set("estado", c.estado);
  if (c.sucursal) q.set("sucursal", c.sucursal);
  if (c.deposito) q.set("deposito", c.deposito);
  if (buscar) q.set("buscar", buscar);
  q.set("pagina", String(c.pagina));
  q.set("porPagina", String(c.porPagina));

  return q.toString();
}

export function crearContextoBajas() {
  let generacion = 0;
  let clave = "";

  return {
    /** Llamar en cuanto cambia la consulta: invalida de inmediato toda respuesta anterior. Sin cambio de clave no sube la generación. */
    cambiar(nueva: string): TicketBajas {
      if (nueva !== clave) {
        clave = nueva;
        generacion += 1;
      }

      return { generacion, clave };
    },
    /** Relectura con los filtros VIGENTES (después de confirmar): nueva generación sobre la clave actual, no la de un render anterior. */
    releer(): TicketBajas {
      generacion += 1;

      return { generacion, clave };
    },
    vigente(t: TicketBajas): boolean {
      return t.generacion === generacion && t.clave === clave;
    },
    actual(): TicketBajas {
      return { generacion, clave };
    },
  };
}

/** Texto «Mostrando a–b de N» (sin inventar totales: con 0 filas no hay rango). */
export function rangoPaginaBajas(total: number, pagina: number, porPagina: number, filas: number): string {
  if (total <= 0 || filas <= 0) return "Sin registros";
  const desde = (pagina - 1) * porPagina + 1;

  return `Mostrando ${desde}–${desde + filas - 1} de ${total}`;
}
