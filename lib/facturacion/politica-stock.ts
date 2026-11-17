/**
 * PRO-354-R02 — Política por EMPRESA «Bloquear facturación por stock insuficiente» (NEX-081).
 *  · TRUE (predeterminado, y también si NEX-081 no está aplicada): comportamiento actual EXACTO. El plan es el de `asignarStock` y la huella es la misma de siempre.
 *  · FALSE: un producto con disponible insuficiente se factura igual. Se descuenta TODO el disponible (mismo reparto/orden de `asignarStock`) y el resto queda como BAJA PENDIENTE en un depósito propio,
 *    activo, de la sucursal y dentro del alcance del usuario: el elegido por el operador, o el único elegible.
 *  · Bloqueos que no se omiten nunca:
 *    - cantidad inválida;
 *    - producto con control de lotes evidenciado (`stock_lotes`);
 *    - sin depósito elegible, o varios elegibles sin elección.
 *    Un error técnico (base, red, permisos) NO se trata como insuficiencia: se propaga.
 *  · La huella con pendientes incluye la política, las salidas y los pendientes (con su depósito). La base revalida la política bajo bloqueo (`fe_documento_crear_fe_stock_pendiente`).
 * La política se lee SIEMPRE de la base; jamás se toma del navegador.
 */
import { createHash } from "node:crypto";

import type { Pool } from "pg";

import { B, parseDec, textoDec, type Dec } from "@/lib/facturacion/calculo";
import { ErrorFacturacion } from "@/lib/facturacion/shared";
import {
  asignarStock,
  consultarDisponibilidadEnLotes,
  mensajeStockInsuficiente,
  type LineaPlan,
  type LineaStock,
  type PlanStock,
  type ResumenStock,
  resumenStock,
  type SaldoDisponible,
  type SalidaStock,
} from "@/lib/facturacion/stock-fe";
import { formatearDecimalTexto } from "@/lib/formato/decimal-texto";

type Db = Pick<Pool, "query">;
type F = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CERO = B(0);

/** Mensaje para la pantalla cuando la base aún no tiene NEX-081 (interruptor y vista de bajas pendientes). */
export const MENSAJE_SIN_NEX081 = "Esta función requiere la actualización de base de datos NEX-081, que todavía no está aplicada.";
export const MENSAJE_POLITICA_CAMBIO = "La política de stock insuficiente de la empresa cambió desde la revisión. Revise la factura de nuevo.";

export type PoliticaStock = { bloquear: boolean; soportada: boolean };
export type DepositoElegible = { id: string; codigo: string; nombre: string };
export type ContextoFaltante = { bloquear: boolean; depositos: DepositoElegible[]; conLote: Set<string> };
export type BloqueoFaltante = "CANTIDAD_INVALIDA" | "LOTE" | "SIN_DEPOSITO" | "ELEGIR_DEPOSITO";
/** `unidadId` (R02-R02): unidad BASE revisada (UUID) del producto; forma parte de la huella y la base la exige igual a la vigente bajo bloqueo. */
export type PendienteStock = { productoId: string; codigo: string; descripcion: string; depositoId: string; depositoCodigo: string; depositoNombre: string; cantidad: string; unidadId: string | null };
export type LineaPlanPolitica = LineaPlan & { pendiente: string | null; bloqueo: BloqueoFaltante | null };
export type PlanPolitica = {
  bloquear: boolean;
  lineas: LineaPlanPolitica[];
  salidas: SalidaStock[];
  pendientes: PendienteStock[];
  /** Todo el stock alcanza (sin faltante). */
  suficiente: boolean;
  /** Se puede emitir: con TRUE solo si `suficiente`; con FALSE si ningún producto tiene un bloqueo. */
  emitible: boolean;
  huella: string;
  depositos: DepositoElegible[];
};
export type ResumenStockPolitica = ResumenStock & {
  permitirFaltante: boolean;
  pendientes: Array<{ productoId: string; codigo: string; descripcion: string; depositoCodigo: string; depositoNombre: string; cantidad: string }>;
};

/** El dato de la política tal como lo lee la base. La columna ausente (NEX-081 no aplicada) equivale a TRUE: la emisión se comporta como hasta ahora. */
export function interpretarPolitica(v: unknown): PoliticaStock {
  if (v === undefined || v === null) return { bloquear: true, soportada: false };

  return { bloquear: v !== false, soportada: true };
}

/** Política de la EMPRESA de la sesión. `to_jsonb(e)` permite leerla sin fallar cuando la columna todavía no existe; ningún otro error se oculta. */
export async function leerPoliticaStock(db: Db, empresaId: string): Promise<PoliticaStock> {
  const r = await db.query(`SELECT to_jsonb(e) -> 'bloquear_stock_insuficiente' AS v FROM empresas e WHERE e.id = $1::uuid`, [empresaId]);

  // Sin fila no hay política que permita nada: se aplica la regla de siempre (bloquear). La empresa de la sesión ya fue verificada por la autenticación y la SQL vuelve a verificarla.
  return interpretarPolitica(r.rows.length === 0 ? undefined : (r.rows[0] as F).v);
}

/** Cambio auditado en la base (FACTURACION_ELECTRONICA.CONFIGURAR, bloqueo de la fila de la empresa, evento en eventos_seguridad). Sin NEX-081 responde 503. */
export async function guardarPoliticaStock(db: Db, empresaId: string, usuarioId: string, bloquear: boolean): Promise<{ bloquear: boolean; cambio: boolean }> {
  try {
    const r = await db.query(`SELECT o_bloquear AS bloquear, o_cambio AS cambio FROM fe_politica_stock_actualizar($1::uuid, $2::uuid, $3::boolean)`, [empresaId, usuarioId, bloquear]);
    const f = r.rows[0] as F;

    return { bloquear: f.bloquear === true, cambio: f.cambio === true };
  } catch (error) {
    if ((error as { code?: string }).code === "42883") throw new ErrorFacturacion(503, MENSAJE_SIN_NEX081);
    throw error;
  }
}

/** Depósitos elegibles para el faltante y productos con lotes (lectura SQL con permiso FE.CREAR y sucursal en alcance). */
export async function leerContextoFaltante(db: Db, empresaId: string, usuarioId: string, sucursalId: string, productoIds: string[]): Promise<ContextoFaltante> {
  const r = await db.query(
    `SELECT o_bloquear AS bloquear, o_depositos AS depositos, o_con_lote::text[] AS "conLote" FROM fe_stock_politica_contexto($1::uuid, $2::uuid, $3::uuid, $4::uuid[])`,
    [empresaId, usuarioId, sucursalId, [...new Set(productoIds)]],
  );
  const f = (r.rows[0] ?? {}) as F;
  const depositos = Array.isArray(f.depositos)
    ? (f.depositos as F[]).filter((d) => typeof d.id === "string").map((d) => ({ id: String(d.id).toLowerCase(), codigo: String(d.codigo ?? ""), nombre: String(d.nombre ?? "") }))
    : [];

  return { bloquear: f.bloquear !== false, depositos, conLote: new Set(Array.isArray(f.conLote) ? (f.conLote as string[]).map((x) => x.toLowerCase()) : []) };
}

/** Elección del depósito del faltante por producto (`{productoId: depositoId}`), en forma ESTRICTA; null si la forma es inválida. Ausente ⇒ {}. */
export function leerDepositosPendiente(v: unknown): Record<string, string> | null {
  if (v === undefined || v === null) return {};
  if (typeof v !== "object" || Array.isArray(v)) return null;

  const fuera: Record<string, string> = {};
  const entradas = Object.entries(v as F);

  if (entradas.length > 999) return null;
  for (const [p, d] of entradas) {
    if (!UUID.test(p) || typeof d !== "string" || !UUID.test(d)) return null;
    fuera[p.toLowerCase()] = d.toLowerCase();
  }

  return fuera;
}

/** Huella con faltante: política + salidas + pendientes (con depósito), en orden canónico. Nunca coincide con la de TRUE: un cambio de política exige revisar de nuevo. */
export function huellaConFaltante(salidas: SalidaStock[], pendientes: PendienteStock[]): string {
  const orden = (x: string[], y: string[]) => (x.join("|") < y.join("|") ? -1 : x.join("|") > y.join("|") ? 1 : 0);
  const s = salidas.map((x) => [x.productoId, x.depositoId, x.loteId ?? "", x.cantidad]).sort(orden);
  // R02-R02: la unidad base revisada integra la huella: si cambia entre la previa y la emisión, la emisión exige revisar de nuevo.
  const p = pendientes.map((x) => [x.productoId, x.depositoId, x.cantidad, x.unidadId ?? ""]).sort(orden);

  return createHash("sha256").update(JSON.stringify(["POLITICA:PERMITIR_FALTANTE", s, p])).digest("hex");
}

/**
 * Plan con la política aplicada (lógica PURA). Con `contexto.bloquear` el plan es EXACTAMENTE el de `asignarStock` (misma huella).
 * Con FALSE, un producto suficiente conserva su reparto. Un producto insuficiente y válido:
 *  · toma TODO su disponible en el orden de `asignarStock` (FEFO/depósito);
 *  · deja el resto pendiente en el depósito resuelto (elección válida, o el único elegible).
 */
export function aplicarPolitica(lineas: LineaStock[], saldos: SaldoDisponible[], contexto: ContextoFaltante, elecciones: Record<string, string> = {}): PlanPolitica {
  const base = asignarStock(lineas, saldos);

  if (contexto.bloquear) {
    return {
      bloquear: true,
      lineas: base.lineas.map((l) => ({ ...l, pendiente: null, bloqueo: null })),
      salidas: base.salidas,
      pendientes: [],
      suficiente: base.suficiente,
      emitible: base.suficiente,
      huella: base.huella,
      depositos: [],
    };
  }

  // Cantidades inválidas por UUID (mismo criterio de `asignarStock`: una cantidad inválida invalida el producto entero).
  const invalidas = new Set<string>();
  const totales = new Map<string, Dec>();

  for (const l of lineas) {
    if (!l.controlaStock) continue;

    const c = parseDec(l.cantidad, 4);

    if (c === null || c <= CERO) invalidas.add(l.productoId);
    totales.set(l.productoId, (totales.get(l.productoId) ?? CERO) + (c ?? CERO));
  }

  const lineasPlan: LineaPlanPolitica[] = [];
  const salidas: SalidaStock[] = [];
  const pendientes: PendienteStock[] = [];
  // Unidad base revisada por producto (la misma en líneas repetidas del mismo UUID).
  const unidades = new Map(lineas.filter((l) => l.controlaStock).map((l) => [l.productoId, l.unidadId ?? null] as const));

  for (const l of base.lineas) {
    if (l.faltante === null) {
      lineasPlan.push({ ...l, pendiente: null, bloqueo: null });
      salidas.push(...l.salidas);
      continue;
    }

    const total = totales.get(l.productoId) ?? CERO;
    let bloqueo: BloqueoFaltante | null = null;
    let deposito: DepositoElegible | null = null;

    if (invalidas.has(l.productoId) || total <= CERO) bloqueo = "CANTIDAD_INVALIDA";
    else if (contexto.conLote.has(l.productoId)) bloqueo = "LOTE";
    else if (contexto.depositos.length === 0) bloqueo = "SIN_DEPOSITO";
    else {
      const elegido = elecciones[l.productoId];

      deposito = contexto.depositos.find((d) => d.id === elegido) ?? (contexto.depositos.length === 1 ? contexto.depositos[0] : null);
      if (deposito === null) bloqueo = "ELEGIR_DEPOSITO";
    }

    if (bloqueo !== null || deposito === null) {
      lineasPlan.push({ ...l, salidas: [], pendiente: null, bloqueo: bloqueo ?? "ELEGIR_DEPOSITO" });
      continue;
    }

    // Todo el disponible del producto (la suma es < requerido: es insuficiente); mismo orden que `asignarStock` reproduce al recorrer los saldos.
    const propias = asignarStock([{ productoId: l.productoId, codigo: l.codigo, descripcion: l.descripcion, cantidad: l.disponible, controlaStock: true }], saldos).lineas[0]?.salidas ?? [];
    const pendiente = total - (parseDec(l.disponible, 4) ?? CERO);

    lineasPlan.push({ ...l, salidas: propias, pendiente: textoDec(pendiente), bloqueo: null });
    salidas.push(...propias);
    pendientes.push({ productoId: l.productoId, codigo: l.codigo, descripcion: l.descripcion, depositoId: deposito.id, depositoCodigo: deposito.codigo, depositoNombre: deposito.nombre, cantidad: textoDec(pendiente), unidadId: unidades.get(l.productoId) ?? null });
  }

  const emitible = lineasPlan.every((l) => l.bloqueo === null);

  return {
    bloquear: false,
    lineas: lineasPlan,
    salidas,
    pendientes,
    suficiente: base.suficiente,
    emitible,
    huella: pendientes.length > 0 ? huellaConFaltante(salidas, pendientes) : base.huella,
    depositos: contexto.depositos,
  };
}

/**
 * Plan autoritativo (previa y emisión).
 *  · Con stock suficiente: el plan de siempre (la política no cambia nada y no se consulta).
 *  · Con insuficiencia: se lee la política de la base; el contexto de depósitos/lotes se consulta SOLO si la política permite el faltante.
 */
export async function planificarStockConPolitica(
  db: Db, empresaId: string, usuarioId: string, sucursalId: string, lineas: LineaStock[], elecciones: Record<string, string> = {},
): Promise<PlanPolitica> {
  const controladas = lineas.filter((l) => l.controlaStock);
  const saldos = controladas.length > 0 ? await consultarDisponibilidadEnLotes(db, empresaId, usuarioId, sucursalId, controladas.map((l) => l.productoId)) : [];
  const base = asignarStock(lineas, saldos);
  const bloquea: ContextoFaltante = { bloquear: true, depositos: [], conLote: new Set() };

  if (base.suficiente || (await leerPoliticaStock(db, empresaId)).bloquear) return aplicarPolitica(lineas, saldos, bloquea, elecciones);

  const contexto = await leerContextoFaltante(db, empresaId, usuarioId, sucursalId, base.lineas.filter((l) => l.faltante !== null).map((l) => l.productoId));

  return aplicarPolitica(lineas, saldos, contexto, elecciones);
}

/** Mensaje del bloqueo (409). Con TRUE es el mensaje de siempre de PRO-330/E02. */
export function mensajePlanNoEmitible(plan: PlanPolitica): string {
  if (plan.bloquear) return mensajeStockInsuficiente({ lineas: plan.lineas, salidas: plan.salidas, suficiente: plan.suficiente, huella: plan.huella } satisfies PlanStock);

  const partes = plan.lineas.filter((l) => l.bloqueo !== null).map((l) => {
    const datos = `solicitado ${formatearDecimalTexto(l.requerido)}, disponible ${formatearDecimalTexto(l.disponible)}`;

    switch (l.bloqueo) {
      case "LOTE":
        return `${l.codigo} controla lotes: su faltante no puede quedar pendiente (${datos})`;
      case "SIN_DEPOSITO":
        return `${l.codigo}: no hay un depósito propio y activo de la sucursal, dentro de su alcance, para registrar el faltante (${datos})`;
      case "ELEGIR_DEPOSITO":
        return `${l.codigo}: elija el depósito donde queda pendiente el faltante (${datos})`;
      default:
        return `${l.codigo}: la cantidad no es válida`;
    }
  });

  return `No se puede facturar con faltante de stock: ${partes.join("; ")}.`;
}

/** Resumen para la revisión: salidas inmediatas por depósito y faltante pendiente por producto. */
export function resumenStockPolitica(plan: PlanPolitica): ResumenStockPolitica {
  const r = resumenStock({ lineas: plan.lineas, salidas: plan.salidas, suficiente: plan.suficiente, huella: plan.huella });

  return {
    ...r,
    permitirFaltante: !plan.bloquear,
    pendientes: plan.pendientes.map((p) => ({ productoId: p.productoId, codigo: p.codigo, descripcion: p.descripcion, depositoCodigo: p.depositoCodigo, depositoNombre: p.depositoNombre, cantidad: p.cantidad })),
  };
}

/** Pendientes para la función SQL (forma estricta: producto_id, deposito_id, cantidad texto). */
// R02-R02: cada pendiente lleva la unidad base revisada; sin ella la base rechaza (falla cerrada).
export const pendientesSql = (plan: PlanPolitica) => plan.pendientes.map((p) => ({ producto_id: p.productoId, deposito_id: p.depositoId, cantidad: p.cantidad, unidad_medida_id: p.unidadId }));
