import type { Pool } from "pg";

import type { DashboardPeriodo, DashboardRespuesta } from "@/types/dashboard";

// Lectura agregada para el panel. Todo filtrado por empresa_id de la sesión y por los depósitos
// a los que el usuario tiene alcance. Cada sección exige el permiso VER de su módulo de origen.

type Db = Pick<Pool, "query">;

export const PERIODOS: Record<DashboardPeriodo, { dias: number; semanal: boolean }> = {
  "7d": { dias: 7, semanal: false },
  "15d": { dias: 15, semanal: false },
  "30d": { dias: 30, semanal: false },
  "90d": { dias: 90, semanal: true },
};

export type PermisosPanel = { productos: boolean; clientes: boolean; stock: boolean; movimientos: boolean };

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const etiquetaDia = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`;
const sumarDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export async function depositosPermitidos(db: Db, empresaId: string, usuarioId: string) {
  const r = await db.query(
    `SELECT d.id, d.nombre FROM depositos d
      WHERE d.empresa_id = $1 AND d.activo AND usuario_puede_deposito($1::uuid, $2::uuid, d.id)
      ORDER BY d.nombre`,
    [empresaId, usuarioId],
  );
  return r.rows as { id: string; nombre: string }[];
}

export async function leerDashboard(
  db: Db,
  empresaId: string,
  usuarioId: string,
  permisos: PermisosPanel,
  periodo: DashboardPeriodo,
  depositoId: string,
): Promise<DashboardRespuesta | { error: string; status: number }> {
  const depositos = await depositosPermitidos(db, empresaId, usuarioId);
  if (depositoId && !depositos.some((d) => d.id === depositoId)) {
    return { error: "Depósito no permitido.", status: 403 };
  }
  const deps = depositoId ? [depositoId] : depositos.map((d) => d.id);
  const { dias, semanal } = PERIODOS[periodo];

  const hoyR = await db.query(`SELECT to_char(current_date, 'YYYY-MM-DD') AS hoy`);
  const hasta = hoyR.rows[0].hoy as string;
  const desde = sumarDias(hasta, -(dias - 1));

  const emp = (await db.query(`SELECT razon_social AS nombre, moneda_base_codigo AS moneda FROM empresas WHERE id = $1`, [empresaId])).rows[0];

  // Movimientos efectivos: registrados y que no sean la contrapartida de una anulación.
  const MOV_OK = `m.empresa_id = $1 AND m.estado = 'REGISTRADO' AND m.anula_a_id IS NULL`;
  const mp = [empresaId, deps, desde, hasta];

  const [productos, clientes, saldos, valor, lotes, movs, ultimos] = await Promise.all([
    permisos.productos
      ? db.query(`SELECT count(*) FILTER (WHERE activo)::int AS activos, count(*) FILTER (WHERE activo AND controla_stock)::int AS controlan FROM productos WHERE empresa_id = $1`, [empresaId])
      : null,
    permisos.clientes ? db.query(`SELECT count(*) FILTER (WHERE activo)::int AS activos FROM clientes WHERE empresa_id = $1`, [empresaId]) : null,
    permisos.stock
      ? db.query(
          `SELECT p.id, p.descripcion, p.stock_minimo::float8 AS minimo,
                  coalesce(sum(s.cantidad) FILTER (WHERE s.estado_stock = 'DISPONIBLE'), 0)::float8 AS disponible,
                  coalesce(sum(s.cantidad) FILTER (WHERE s.estado_stock = 'CUARENTENA'), 0)::float8 AS cuarentena
             FROM productos p
             LEFT JOIN stock_saldos s ON s.empresa_id = p.empresa_id AND s.producto_id = p.id AND s.propiedad = 'PROPIO' AND s.deposito_id = ANY($2::uuid[])
            WHERE p.empresa_id = $1 AND p.activo AND p.controla_stock
            GROUP BY p.id, p.descripcion, p.stock_minimo`,
          [empresaId, deps],
        )
      : null,
    permisos.stock
      ? db.query(`SELECT coalesce(sum(valor_total), 0)::float8 AS valor, count(DISTINCT producto_id) FILTER (WHERE cantidad_valorizada > 0)::int AS productos FROM inventario_costos WHERE empresa_id = $1 AND deposito_id = ANY($2::uuid[])`, [empresaId, deps])
      : null,
    permisos.stock
      ? db.query(
          `SELECT count(DISTINCT l.id) FILTER (WHERE l.fecha_vencimiento < current_date)::int AS vencidos,
                  count(DISTINCT l.id) FILTER (WHERE l.fecha_vencimiento >= current_date AND l.fecha_vencimiento <= current_date + 30)::int AS por_vencer
             FROM stock_saldos s JOIN stock_lotes l ON l.empresa_id = s.empresa_id AND l.id = s.lote_id
            WHERE s.empresa_id = $1 AND s.cantidad > 0 AND s.deposito_id = ANY($2::uuid[]) AND l.fecha_vencimiento IS NOT NULL`,
          [empresaId, deps],
        )
      : null,
    permisos.movimientos
      ? db.query(
          `SELECT m.fecha_movimiento::text AS fecha,
                  coalesce(sum(l.cantidad) FILTER (WHERE m.tipo_movimiento IN ('ENTRADA','AJUSTE_POSITIVO') AND m.deposito_destino_id = ANY($2::uuid[])), 0)::float8 AS entradas,
                  coalesce(sum(l.cantidad) FILTER (WHERE m.tipo_movimiento IN ('SALIDA','AJUSTE_NEGATIVO') AND m.deposito_origen_id = ANY($2::uuid[])), 0)::float8 AS salidas,
                  count(DISTINCT m.id)::int AS movimientos
             FROM movimientos_inventario m JOIN movimiento_lineas l ON l.empresa_id = m.empresa_id AND l.movimiento_id = m.id
            WHERE ${MOV_OK} AND m.fecha_movimiento BETWEEN $3::date AND $4::date
              AND (m.deposito_origen_id = ANY($2::uuid[]) OR m.deposito_destino_id = ANY($2::uuid[]))
            GROUP BY m.fecha_movimiento`,
          mp,
        )
      : null,
    permisos.movimientos
      ? db.query(
          `SELECT m.id, m.numero_movimiento AS numero, m.tipo_movimiento AS tipo, m.fecha_movimiento::text AS fecha,
                  to_char(m.hora_movimiento, 'HH24:MI') AS hora, min(p.descripcion) AS producto, count(*)::int AS lineas,
                  sum(l.cantidad)::float8 AS cantidad,
                  concat_ws(' → ', dor.nombre, dde.nombre) AS depositos, coalesce(u.usuario, '') AS usuario, m.creado_at
             FROM movimientos_inventario m
             JOIN movimiento_lineas l ON l.empresa_id = m.empresa_id AND l.movimiento_id = m.id
             JOIN productos p ON p.empresa_id = l.empresa_id AND p.id = l.producto_id
             LEFT JOIN depositos dor ON dor.empresa_id = m.empresa_id AND dor.id = m.deposito_origen_id
             LEFT JOIN depositos dde ON dde.empresa_id = m.empresa_id AND dde.id = m.deposito_destino_id
             LEFT JOIN usuarios u ON u.empresa_id = m.empresa_id AND u.id = m.creado_por
            WHERE m.empresa_id = $1 AND (m.deposito_origen_id = ANY($2::uuid[]) OR m.deposito_destino_id = ANY($2::uuid[]))
            GROUP BY m.id, m.numero_movimiento, m.tipo_movimiento, m.fecha_movimiento, m.hora_movimiento, dor.nombre, dde.nombre, u.usuario, m.creado_at
            ORDER BY m.creado_at DESC, m.numero_movimiento DESC LIMIT 6`,
          [empresaId, deps],
        )
      : null,
  ]);

  // Serie por día (o por semana en 90 días), con los intervalos vacíos en cero.
  let serie: DashboardRespuesta["serie"] = null;
  let totMov: { total: number; entradas: number; salidas: number } | null = null;
  if (movs) {
    const porDia = new Map<string, { e: number; s: number; n: number }>();
    for (const r of movs.rows) porDia.set(r.fecha as string, { e: r.entradas, s: r.salidas, n: r.movimientos });
    const paso = semanal ? 7 : 1;
    serie = [];
    totMov = { total: 0, entradas: 0, salidas: 0 };
    for (let i = 0; i < dias; i += paso) {
      let e = 0, s = 0;
      for (let k = 0; k < paso && i + k < dias; k++) {
        const v = porDia.get(sumarDias(desde, i + k));
        if (v) { e += v.e; s += v.s; totMov.total += v.n; }
      }
      totMov.entradas += e; totMov.salidas += s;
      const ini = sumarDias(desde, i);
      serie.push({ etiqueta: etiquetaDia(ini), desde: ini, entradas: e, salidas: s });
    }
  }

  // Stock: niveles por producto y alertas.
  let stock: DashboardRespuesta["stock"] = null;
  const alertas: NonNullable<DashboardRespuesta["alertas"]> = [];
  if (saldos) {
    const filas = saldos.rows as { descripcion: string; minimo: number; disponible: number; cuarentena: number }[];
    const sin = filas.filter((f) => f.disponible <= 0);
    const bajo = filas.filter((f) => f.disponible > 0 && f.minimo > 0 && f.disponible < f.minimo);
    const cuar = filas.filter((f) => f.cuarentena > 0);
    const nombres = (a: typeof filas) => a.slice(0, 2).map((f) => f.descripcion).join(", ") + (a.length > 2 ? "…" : "");
    const disponibles = filas.length - sin.length - bajo.length;
    stock = { controlados: filas.length, disponibles, bajo: bajo.length, sin: sin.length, disponibilidad: filas.length ? Math.round(((filas.length - sin.length) / filas.length) * 100) : null };
    if (sin.length) alertas.push({ clave: "sin-stock", titulo: `${sin.length} ${sin.length === 1 ? "producto sin stock" : "productos sin stock"}`, detalle: nombres(sin), tono: "danger", href: "/stock", cantidad: sin.length });
    if (bajo.length) alertas.push({ clave: "stock-bajo", titulo: `${bajo.length} ${bajo.length === 1 ? "producto con stock bajo" : "productos con stock bajo"}`, detalle: `Por debajo del mínimo: ${nombres(bajo)}`, tono: "warning", href: "/stock", cantidad: bajo.length });
    const lv = lotes?.rows[0] ?? { vencidos: 0, por_vencer: 0 };
    if (lv.vencidos) alertas.push({ clave: "lotes-vencidos", titulo: `${lv.vencidos} ${lv.vencidos === 1 ? "lote vencido" : "lotes vencidos"} con saldo`, detalle: "Revisar y retirar del stock disponible", tono: "danger", href: "/stock", cantidad: lv.vencidos });
    if (lv.por_vencer) alertas.push({ clave: "lotes-por-vencer", titulo: `${lv.por_vencer} ${lv.por_vencer === 1 ? "lote vence" : "lotes vencen"} en 30 días`, detalle: "Con saldo en los depósitos seleccionados", tono: "warning", href: "/stock", cantidad: lv.por_vencer });
    if (cuar.length) alertas.push({ clave: "cuarentena", titulo: `${cuar.length} ${cuar.length === 1 ? "producto en cuarentena" : "productos en cuarentena"}`, detalle: nombres(cuar), tono: "info", href: "/stock", cantidad: cuar.length });
  }

  return {
    empresa: { nombre: emp.nombre as string, moneda: emp.moneda as string },
    periodo: { clave: periodo, desde, hasta, agrupacion: semanal ? "SEMANA" : "DIA" },
    filtros: { depositos, depositoId },
    kpis: {
      productos: productos ? { activos: productos.rows[0].activos, controlanStock: productos.rows[0].controlan } : null,
      clientes: clientes ? { activos: clientes.rows[0].activos } : null,
      inventario: valor ? { valor: valor.rows[0].valor, productosValorizados: valor.rows[0].productos } : null,
      movimientos: totMov,
      stockCritico: stock ? { bajo: stock.bajo, sin: stock.sin } : null,
    },
    serie,
    stock,
    alertas: permisos.stock ? alertas : null,
    ultimos: ultimos
      ? ultimos.rows.map((r) => ({
          id: r.id, numero: r.numero, tipo: r.tipo, fecha: r.fecha, hora: r.hora,
          producto: r.lineas > 1 ? `${r.producto} (+${r.lineas - 1})` : r.producto,
          cantidad: r.cantidad, depositos: r.depositos, usuario: r.usuario,
        }))
      : null,
  };
}
