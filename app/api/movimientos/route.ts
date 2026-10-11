import { NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { denyIfNoPermission } from "@/lib/auth/permissions";
import { prepararMovimiento, registrarMovimiento, respuestaError, SELECT_FILAS } from "@/lib/movimientos/shared";

// Solo DEMO explícito usa respuestas simuladas. La falta de DATABASE_URL NUNCA activa datos ficticios.
const DEMO_MODE = process.env.DEMO_MODE === "true";

const sinBase = () =>
  NextResponse.json({ error: "Servicio no disponible: base de datos no configurada." }, { status: 503 });

async function sesionActual() {
  const { getCurrentSession } = await import("@/lib/auth/session");
  return getCurrentSession();
}
async function obtenerDb() {
  const { db } = await import("@/lib/db");
  return db;
}

export async function GET(request: Request) {
  if (!DEMO_MODE && !process.env.DATABASE_URL) return sinBase();
  if (DEMO_MODE) return NextResponse.json({ movimientos: [], demo: true });

  const session = await sesionActual();
  if (!session) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  const denegado = await denyIfNoPermission(session, "MOVIMIENTOS", "VER");
  if (denegado) return denegado;

  const db = await obtenerDb();
  const empresaId = session.user.empresaId;
  const soloCatalogos = new URL(request.url).searchParams.get("modo") === "catalogos";

  try {
    if (soloCatalogos) {
      const [depositos, productos, stock, lotes, moneda] = await Promise.all([
        db.query(
          `SELECT d.id, d.codigo, d.nombre, usuario_puede_deposito($1::uuid, $2::uuid, d.id) AS permitido
             FROM depositos d WHERE d.empresa_id = $1 AND d.activo ORDER BY d.nombre`,
          [empresaId, session.user.id],
        ),
        db.query(
          `SELECT p.id, p.codigo, p.descripcion, coalesce(um.nombre, '') AS "unidadMedidaNombre", p.modo_control_stock AS "modoControl"
             FROM productos p LEFT JOIN unidades_medida um ON um.id = p.unidad_medida_id
            WHERE p.empresa_id = $1 AND p.activo AND p.controla_stock ORDER BY p.descripcion`,
          [empresaId],
        ),
        db.query(
          `SELECT s.producto_id AS "productoId", s.deposito_id AS "depositoId",
                  coalesce(sum(s.cantidad) FILTER (WHERE s.estado_stock = 'DISPONIBLE'), 0)::float8 AS disponible,
                  coalesce(sum(s.cantidad) FILTER (WHERE s.estado_stock = 'RESERVADO'), 0)::float8 AS reservado,
                  coalesce(sum(s.cantidad) FILTER (WHERE s.estado_stock = 'CUARENTENA'), 0)::float8 AS cuarentena,
                  coalesce(sum(s.cantidad) FILTER (WHERE s.estado_stock = 'TRANSITO'), 0)::float8 AS transito,
                  max(ic.costo_promedio)::float8 AS "costoPromedio"
             FROM stock_saldos s
             LEFT JOIN inventario_costos ic ON ic.empresa_id = s.empresa_id AND ic.producto_id = s.producto_id AND ic.deposito_id = s.deposito_id
            WHERE s.empresa_id = $1 AND s.propiedad = 'PROPIO'
            GROUP BY s.producto_id, s.deposito_id`,
          [empresaId],
        ),
        db.query(
          `SELECT s.producto_id AS "productoId", s.deposito_id AS "depositoId", sl.codigo_lote AS codigo,
                  coalesce(to_char(sl.fecha_vencimiento, 'YYYY-MM-DD'), '') AS "fechaVencimiento", s.estado_stock AS estado, s.cantidad::float8 AS cantidad
             FROM stock_saldos s JOIN stock_lotes sl ON sl.empresa_id = s.empresa_id AND sl.id = s.lote_id
            WHERE s.empresa_id = $1 AND s.cantidad > 0 AND s.propiedad = 'PROPIO' ORDER BY sl.fecha_vencimiento NULLS LAST, sl.codigo_lote`,
          [empresaId],
        ),
        db.query(`SELECT moneda_base_codigo AS moneda FROM empresas WHERE id = $1`, [empresaId]),
      ]);

      type Fila = Record<string, unknown> & { productoId: string; depositoId: string };
      const porProducto = new Map<string, Fila[]>();
      for (const s of stock.rows as Fila[]) porProducto.set(s.productoId, [...(porProducto.get(s.productoId) ?? []), s]);
      const lotesPorProducto = new Map<string, Fila[]>();
      for (const l of lotes.rows as Fila[]) lotesPorProducto.set(l.productoId, [...(lotesPorProducto.get(l.productoId) ?? []), l]);

      return NextResponse.json({
        catalogos: {
          depositos: depositos.rows,
          productos: (productos.rows as Array<{ id: string }>).map((p) => ({
            ...p,
            stock: (porProducto.get(p.id) ?? []).map(({ productoId: _p, ...resto }) => resto),
            lotes: (lotesPorProducto.get(p.id) ?? []).map(({ productoId: _p, ...resto }) => resto),
          })),
          monedaBase: (moneda.rows[0] as { moneda?: string } | undefined)?.moneda ?? "PYG",
        },
      });
    }

    const r = await db.query(
      `${SELECT_FILAS} WHERE m.empresa_id = $1 ORDER BY m.numero_movimiento DESC, l.creado_at DESC LIMIT 2000`,
      [empresaId],
    );
    return NextResponse.json({ movimientos: r.rows });
  } catch (error) {
    console.error("Error al cargar movimientos:", error);
    return NextResponse.json({ error: "No fue posible cargar los movimientos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }

  if (!DEMO_MODE && !process.env.DATABASE_URL) return sinBase();
  if (DEMO_MODE) return NextResponse.json({ error: "Operación no disponible en modo demo." }, { status: 400 });

  const session = await sesionActual();
  if (!session) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  const denegado = await denyIfNoPermission(session, "MOVIMIENTOS", "CREAR");
  if (denegado) return denegado;

  const db = await obtenerDb();
  let conexion: PoolClient | undefined;

  try {
    const datos = prepararMovimiento(cuerpo);
    conexion = await db.connect();
    await conexion.query("BEGIN");
    const mov = await registrarMovimiento(conexion, session.user.empresaId, session.user.id, datos);
    await conexion.query("COMMIT");
    return NextResponse.json(
      { message: mov.repetido ? `El movimiento ${mov.numero} ya estaba registrado.` : `Movimiento ${mov.numero} registrado correctamente.`, movimiento: { id: mov.id, numero: mov.numero }, repetido: mov.repetido },
      { status: mov.repetido ? 200 : 201 },
    );
  } catch (error) {
    if (conexion) await conexion.query("ROLLBACK").catch(() => undefined);
    return respuestaError(error, "registrar");
  } finally {
    conexion?.release();
  }
}
