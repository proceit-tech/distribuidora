import { NextResponse } from "next/server";

import { denyIfNoPermission, getAccessContext, hasPermission } from "@/lib/auth/permissions";
import { leerLineasMovimiento } from "@/lib/movimientos/historial";

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
    // Fuera del alcance de depósitos del usuario el movimiento «no existe» (404), igual que uno de otra empresa.
    const lineas = await leerLineasMovimiento(db, empresaId, session.user.id, id);
    if (!lineas.rowCount) return noEncontrado();
    const vinculos = await db.query(
      `SELECT coalesce((SELECT a.numero_movimiento FROM movimientos_inventario a WHERE a.empresa_id = m.empresa_id AND a.anula_a_id = m.id), '') AS "anuladoPor",
              coalesce((SELECT o.numero_movimiento FROM movimientos_inventario o WHERE o.empresa_id = m.empresa_id AND o.id = m.anula_a_id), '') AS "anulaA"
         FROM movimientos_inventario m WHERE m.empresa_id = $1 AND m.id = $2`,
      [empresaId, id],
    );
    // Solo para mostrar u ocultar la acción de anular; la API de anulación y la función SQL verifican su propio permiso y alcance.
    const acceso = await getAccessContext(session.user, session.demo === true);

    return NextResponse.json({
      movimiento: { ...(lineas.rows[0] as object), lineas: lineas.rows, ...(vinculos.rows[0] as object) },
      permisos: { anular: hasPermission(acceso, "MOVIMIENTOS", "ANULAR"), crear: hasPermission(acceso, "MOVIMIENTOS", "CREAR") },
    });
  } catch (error) {
    console.error("Error al cargar movimiento:", error);
    return NextResponse.json({ error: "No fue posible cargar el movimiento." }, { status: 500 });
  }
}
