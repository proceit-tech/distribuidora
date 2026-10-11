import { NextResponse } from "next/server";

import { denyIfNoPermission } from "@/lib/auth/permissions";
import { SELECT_FILAS } from "@/lib/movimientos/shared";

type Contexto = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEMO_MODE = process.env.DEMO_MODE === "true";
const noEncontrado = () => NextResponse.json({ error: "Movimiento no encontrado." }, { status: 404 });

export async function GET(_request: Request, contexto: Contexto) {
  if (!DEMO_MODE && !process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Servicio no disponible: base de datos no configurada." }, { status: 503 });
  }
  if (DEMO_MODE) return noEncontrado();

  const { getCurrentSession } = await import("@/lib/auth/session");
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  const denegado = await denyIfNoPermission(session, "MOVIMIENTOS", "VER");
  if (denegado) return denegado;

  const { id } = await contexto.params;
  if (!UUID.test(id)) return noEncontrado();

  const { db } = await import("@/lib/db");
  const empresaId = session.user.empresaId;

  try {
    const lineas = await db.query(`${SELECT_FILAS} WHERE m.empresa_id = $1 AND m.id = $2 ORDER BY l.creado_at, l.id`, [empresaId, id]);
    if (!lineas.rowCount) return noEncontrado();
    const vinculos = await db.query(
      `SELECT coalesce((SELECT a.numero_movimiento FROM movimientos_inventario a WHERE a.empresa_id = m.empresa_id AND a.anula_a_id = m.id), '') AS "anuladoPor",
              coalesce((SELECT o.numero_movimiento FROM movimientos_inventario o WHERE o.empresa_id = m.empresa_id AND o.id = m.anula_a_id), '') AS "anulaA"
         FROM movimientos_inventario m WHERE m.empresa_id = $1 AND m.id = $2`,
      [empresaId, id],
    );
    return NextResponse.json({ movimiento: { ...(lineas.rows[0] as object), lineas: lineas.rows, ...(vinculos.rows[0] as object) } });
  } catch (error) {
    console.error("Error al cargar movimiento:", error);
    return NextResponse.json({ error: "No fue posible cargar el movimiento." }, { status: 500 });
  }
}
