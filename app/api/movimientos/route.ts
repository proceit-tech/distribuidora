import { NextResponse } from "next/server";

import { denyIfNoPermission, getAccessContext, hasPermission } from "@/lib/auth/permissions";
import { leerHistorial, movimientoExiste } from "@/lib/movimientos/historial";
import { respuestaPostLegado } from "@/lib/movimientos/intenciones";

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
        // Los saldos y lotes del catálogo se limitan a los depósitos que el usuario puede operar (igual que la vista de Stock).
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
            WHERE s.empresa_id = $1 AND s.propiedad = 'PROPIO' AND usuario_puede_deposito($1::uuid, $2::uuid, s.deposito_id)
            GROUP BY s.producto_id, s.deposito_id`,
          [empresaId, session.user.id],
        ),
        db.query(
          `SELECT s.producto_id AS "productoId", s.deposito_id AS "depositoId", sl.codigo_lote AS codigo,
                  coalesce(to_char(sl.fecha_vencimiento, 'YYYY-MM-DD'), '') AS "fechaVencimiento", s.estado_stock AS estado, s.cantidad::float8 AS cantidad
             FROM stock_saldos s JOIN stock_lotes sl ON sl.empresa_id = s.empresa_id AND sl.id = s.lote_id
            WHERE s.empresa_id = $1 AND s.cantidad > 0 AND s.propiedad = 'PROPIO' AND usuario_puede_deposito($1::uuid, $2::uuid, s.deposito_id)
            ORDER BY sl.fecha_vencimiento NULLS LAST, sl.codigo_lote`,
          [empresaId, session.user.id],
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

    // Historial paginado en el servidor y limitado a los depósitos que el usuario puede ver (ver lib/movimientos/historial.ts).
    const p = new URL(request.url).searchParams;
    const datos = await leerHistorial(db, empresaId, session.user.id, {
      q: p.get("q") ?? undefined,
      tipo: p.get("tipo") ?? undefined,
      orden: p.get("orden") ?? undefined,
      dir: p.get("dir") ?? undefined,
      pagina: Number(p.get("pagina") ?? 1),
      tamano: Number(p.get("tamano") ?? 20),
    });
    // Confirmación del aviso de registro (?ok=<número>): solo es verdadera si ese movimiento existe y el usuario puede verlo.
    const numero = p.get("confirmar");
    const confirmado = numero ? await movimientoExiste(db, empresaId, session.user.id, numero.trim()) : undefined;

    // Solo para mostrar u ocultar «Nuevo movimiento» (INV-02): POST vuelve a verificar MOVIMIENTOS.CREAR.
    const acceso = await getAccessContext(session.user, session.demo === true);

    return NextResponse.json({ ...datos, ...(numero ? { confirmado } : {}), permisos: { crear: hasPermission(acceso, "MOVIMIENTOS", "CREAR") } });
  } catch (error) {
    console.error("Error al cargar movimientos:", error);
    return NextResponse.json({ error: "No fue posible cargar los movimientos." }, { status: 500 });
  }
}

// MOV-O07 / PRO-190 (AUD-R08): el registro directo QUEDA RETIRADO. Ningún camino puede modificar stock sin que K1 y el snapshot estén confirmados antes en PostgreSQL (NEX-066): el único flujo es
// POST /api/movimientos/intencion (reservar) → POST /api/movimientos/intencion/ejecutar → POST /api/movimientos/intencion/reconocer. Esta ruta responde 410 SIEMPRE, sin leer el cuerpo, sin sesión, sin
// abrir conexión y sin tocar datos (nunca puede registrar, ni siquiera con una clave "reservada": la ejecución exige la intención durable).
export async function POST() {
  const r = respuestaPostLegado();

  return NextResponse.json(r.body, { status: r.status });
}
