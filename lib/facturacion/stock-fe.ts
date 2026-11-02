/**
 * E02 (PRO-200) — control de stock y reparto automático entre depósitos al facturar (FE).
 * Reglas (REQ-CASA-MINGO-DECISIONES 5.A): solo cuenta el stock DISPONIBLE y PROPIO de los depósitos ACTIVOS de la sucursal que emite y dentro del alcance del usuario (lo filtra PostgreSQL en
 * `fe_stock_disponibilidad`); la venta por encima del disponible se bloquea; el reparto es automático, determinista y se MUESTRA antes de confirmar; la baja ocurre al emitir, en la misma transacción
 * que la FE (`fe_documento_crear_fe_con_stock`, NEX-067), que REVALIDA bajo bloqueo y concilia con el payload. Todo con Decimal (hasta 4 decimales), sin Number.
 *
 * Precedencia (estable y documentada): depósitos por CÓDIGO ascendente; dentro de un depósito, lotes por vencimiento ascendente (FEFO; sin vencimiento al final) y luego por id de lote.
 * Productos que no controlan stock (servicios) no se consultan ni se bajan.
 */
import { createHash } from "node:crypto";

import type { Pool } from "pg";

import { B, parseDec, textoDec, type Dec } from "@/lib/facturacion/calculo";

type Db = Pick<Pool, "query">;
type F = Record<string, unknown>;

export type LineaStock = { productoId: string; codigo: string; descripcion: string; cantidad: string; controlaStock: boolean };
export type SaldoDisponible = { productoId: string; depositoId: string; depositoCodigo: string; depositoNombre: string; loteId: string | null; loteCodigo: string | null; vencimiento: string | null; disponible: string };
export type SalidaStock = { productoId: string; depositoId: string; depositoCodigo: string; depositoNombre: string; loteId: string | null; loteCodigo: string | null; cantidad: string };
export type LineaPlan = { productoId: string; codigo: string; descripcion: string; requerido: string; disponible: string; faltante: string | null; salidas: SalidaStock[] };
export type PlanStock = { lineas: LineaPlan[]; salidas: SalidaStock[]; suficiente: boolean; huella: string };

/** Resumen para la pantalla (sin identificadores internos de lote/producto): qué sale de dónde, y la huella que el operador aprueba. */
export type ResumenStock = { huella: string; lineas: Array<{ codigo: string; descripcion: string; requerido: string; salidas: Array<{ depositoCodigo: string; depositoNombre: string; loteCodigo: string | null; cantidad: string }> }> };

const CERO = B(0);

function ordenSaldos(a: SaldoDisponible, b: SaldoDisponible): number {
  if (a.depositoCodigo !== b.depositoCodigo) return a.depositoCodigo < b.depositoCodigo ? -1 : 1;
  if (a.depositoId !== b.depositoId) return a.depositoId < b.depositoId ? -1 : 1;
  if (a.vencimiento !== b.vencimiento) {
    if (a.vencimiento === null) return 1;
    if (b.vencimiento === null) return -1;

    return a.vencimiento < b.vencimiento ? -1 : 1;
  }
  const la = a.loteId ?? "";
  const lb = b.loteId ?? "";

  return la === lb ? 0 : la < lb ? -1 : 1;
}

/** Huella canónica del reparto (producto, depósito, lote, cantidad): lo que el operador ve y aprueba es exactamente lo que se bajará. */
export function huellaReparto(salidas: SalidaStock[]): string {
  const canon = [...salidas]
    .map((s) => [s.productoId, s.depositoId, s.loteId ?? "", s.cantidad])
    .sort((x, y) => (x.join("|") < y.join("|") ? -1 : x.join("|") > y.join("|") ? 1 : 0));

  return createHash("sha256").update(JSON.stringify(canon)).digest("hex");
}

/** Reparto puro: requerimientos agregados por producto contra los saldos disponibles. No muta nada. */
export function asignarStock(lineas: LineaStock[], saldos: SaldoDisponible[]): PlanStock {
  const porProducto = new Map<string, { linea: LineaStock; total: Dec; invalida: boolean }>();

  for (const l of lineas) {
    if (!l.controlaStock) continue;

    const c = parseDec(l.cantidad, 4);
    const previo = porProducto.get(l.productoId);

    if (previo) {
      previo.total += c ?? CERO;
      previo.invalida = previo.invalida || c === null;
    } else {
      porProducto.set(l.productoId, { linea: l, total: c ?? CERO, invalida: c === null });
    }
  }

  const planes: LineaPlan[] = [];
  const salidas: SalidaStock[] = [];

  for (const { linea, total, invalida } of porProducto.values()) {
    const propios = saldos.filter((s) => s.productoId === linea.productoId).sort(ordenSaldos);
    let disponible = CERO;

    for (const s of propios) disponible += parseDec(s.disponible, 4) ?? CERO;

    let resto = total;
    const propias: SalidaStock[] = [];

    for (const s of propios) {
      if (resto <= CERO) break;

      const d = parseDec(s.disponible, 4) ?? CERO;
      const toma = d < resto ? d : resto;

      if (toma <= CERO) continue;
      propias.push({ productoId: s.productoId, depositoId: s.depositoId, depositoCodigo: s.depositoCodigo, depositoNombre: s.depositoNombre, loteId: s.loteId, loteCodigo: s.loteCodigo, cantidad: textoDec(toma) });
      resto -= toma;
    }

    const suficiente = !invalida && total > CERO && resto <= CERO;

    planes.push({ productoId: linea.productoId, codigo: linea.codigo, descripcion: linea.descripcion, requerido: textoDec(total), disponible: textoDec(disponible), faltante: suficiente ? null : textoDec(total > disponible ? total - disponible : CERO), salidas: suficiente ? propias : [] });
    if (suficiente) salidas.push(...propias);
  }

  return { lineas: planes, salidas, suficiente: planes.every((p) => p.faltante === null), huella: huellaReparto(salidas) };
}

export function mensajeStockInsuficiente(plan: PlanStock): string {
  const falta = plan.lineas.filter((l) => l.faltante !== null);
  const detalle = falta.map((l) => `«${l.descripcion}» (${l.codigo}): pedido ${l.requerido}, disponible ${l.disponible}`).join("; ");

  return `Stock insuficiente en los depósitos autorizados de la sucursal. ${detalle}. Reduzca la cantidad o regularice el stock antes de facturar.`;
}

export function resumenStock(plan: PlanStock): ResumenStock {
  return {
    huella: plan.huella,
    lineas: plan.lineas.map((l) => ({ codigo: l.codigo, descripcion: l.descripcion, requerido: l.requerido, salidas: l.salidas.map((s) => ({ depositoCodigo: s.depositoCodigo, depositoNombre: s.depositoNombre, loteCodigo: s.loteCodigo, cantidad: s.cantidad })) })),
  };
}

/** Saldos disponibles (SOLO LECTURA) de los productos pedidos, ya filtrados por PostgreSQL (disponible/propio, depósitos activos de la sucursal y del alcance del usuario). */
export async function consultarDisponibilidad(db: Db, empresaId: string, usuarioId: string, sucursalId: string, productoIds: string[]): Promise<SaldoDisponible[]> {
  if (productoIds.length === 0) return [];

  const r = await db.query(
    `SELECT o_producto_id AS "productoId", o_deposito_id AS "depositoId", o_deposito_codigo AS "depositoCodigo", o_deposito_nombre AS "depositoNombre", o_lote_id AS "loteId", o_lote_codigo AS "loteCodigo",
            o_vencimiento::text AS vencimiento, o_disponible::text AS disponible
       FROM fe_stock_disponibilidad($1::uuid, $2::uuid, $3::uuid, $4::uuid[])`,
    [empresaId, usuarioId, sucursalId, productoIds],
  );

  return (r.rows as F[]).map((f) => ({
    productoId: String(f.productoId), depositoId: String(f.depositoId), depositoCodigo: String(f.depositoCodigo), depositoNombre: String(f.depositoNombre),
    loteId: f.loteId === null || f.loteId === undefined ? null : String(f.loteId), loteCodigo: f.loteCodigo === null || f.loteCodigo === undefined ? null : String(f.loteCodigo),
    vencimiento: f.vencimiento === null || f.vencimiento === undefined ? null : String(f.vencimiento), disponible: String(f.disponible),
  }));
}

/** Consulta y reparte. Sin productos que controlen stock no consulta nada (servicios). */
export async function planificarStock(db: Db, empresaId: string, usuarioId: string, sucursalId: string, lineas: LineaStock[]): Promise<PlanStock> {
  const controladas = lineas.filter((l) => l.controlaStock);

  if (controladas.length === 0) return asignarStock([], []);

  // PRO-330 R01-F001: tandas de ≤ 500 UUID únicos (NEX-067 devuelve vacío con más de 500); mismo cálculo y mismo reparto.
  const saldos = await consultarDisponibilidadEnLotes(db, empresaId, usuarioId, sucursalId, controladas.map((l) => l.productoId));

  return asignarStock(lineas, saldos);
}

/** Forma que recibe PostgreSQL (`fe_documento_crear_fe_con_stock`): [{producto_id, deposito_id, lote_id, cantidad}]. */
export const asignacionesSql = (plan: PlanStock) => plan.salidas.map((s) => ({ producto_id: s.productoId, deposito_id: s.depositoId, lote_id: s.loteId, cantidad: s.cantidad }));

/**
 * PRO-330 — consulta ANTICIPADA (solo lectura) al cargar líneas en «Nueva factura». Reutiliza `consultarDisponibilidad` (fe_stock_disponibilidad, NEX-067) y `asignarStock` tal cual:
 * no hay otra fórmula de saldo. NEX-067 devuelve VACÍO con más de 500 UUID (no error), así que se consulta en tandas de hasta 500 y se agregan los saldos en memoria antes de UNA sola asignación;
 * nunca se trunca ni se confunde «sin respuesta» con «saldo cero». Es referencial: la previa y la emisión siguen con `planificarStock`, `repartoHuella` y la revalidación SQL bajo bloqueo.
 */
export const LOTE_DISPONIBILIDAD = 500;

export function lotesDe<T>(xs: T[], tam = LOTE_DISPONIBILIDAD): T[][] {
  const lotes: T[][] = [];

  for (let i = 0; i < xs.length; i += tam) lotes.push(xs.slice(i, i + tam));

  return lotes;
}

/** Saldos (SOLO LECTURA) de cualquier cantidad de productos: tandas secuenciales de ≤ 500 UUID únicos. Sin productos no consulta. */
export async function consultarDisponibilidadEnLotes(db: Db, empresaId: string, usuarioId: string, sucursalId: string, productoIds: string[]): Promise<SaldoDisponible[]> {
  const saldos: SaldoDisponible[] = [];

  for (const lote of lotesDe([...new Set(productoIds)])) saldos.push(...(await consultarDisponibilidad(db, empresaId, usuarioId, sucursalId, lote)));

  return saldos;
}

export type EstadoStockPreventivo = "SUFICIENTE" | "INSUFICIENTE" | "SIN_CONTROL";
export type ProductoStockPreventivo = { productoId: string; codigo: string; descripcion: string; controlaStock: boolean; requerido: string; disponible: string | null; faltante: string | null; estado: EstadoStockPreventivo };

/**
 * Resultado por UUID (una entrada por producto, en el orden de su primera línea): requerido = suma EXACTA de sus líneas; disponible/faltante salen de `asignarStock`.
 * Sin control de stock (flag del servidor): SIN_CONTROL con disponible y faltante null (no es «saldo cero»). Las cantidades deben llegar ya validadas (> 0, hasta 4 decimales).
 */
export function evaluarDisponibilidadPreventiva(lineas: LineaStock[], saldos: SaldoDisponible[]): { suficiente: boolean; productos: ProductoStockPreventivo[] } {
  const plan = asignarStock(lineas, saldos);
  const porPlan = new Map(plan.lineas.map((l) => [l.productoId, l] as const));
  const sinControl = new Map<string, { linea: LineaStock; total: Dec }>();
  const orden: string[] = [];

  for (const l of lineas) {
    if (!orden.includes(l.productoId)) orden.push(l.productoId);
    if (l.controlaStock) continue;

    const previo = sinControl.get(l.productoId);
    const c = parseDec(l.cantidad, 4) ?? CERO;

    if (previo) previo.total += c;
    else sinControl.set(l.productoId, { linea: l, total: c });
  }

  const productos: ProductoStockPreventivo[] = [];

  for (const id of orden) {
    const p = porPlan.get(id);

    if (p) {
      productos.push({ productoId: id, codigo: p.codigo, descripcion: p.descripcion, controlaStock: true, requerido: p.requerido, disponible: p.disponible, faltante: p.faltante, estado: p.faltante === null ? "SUFICIENTE" : "INSUFICIENTE" });
      continue;
    }

    const s = sinControl.get(id);

    if (s) productos.push({ productoId: id, codigo: s.linea.codigo, descripcion: s.linea.descripcion, controlaStock: false, requerido: textoDec(s.total), disponible: null, faltante: null, estado: "SIN_CONTROL" });
  }

  return { suficiente: productos.every((p) => p.estado !== "INSUFICIENTE"), productos };
}
