import { NextResponse } from "next/server";

import { denyIfNoPermission, getAccessContext, hasPermission } from "@/lib/auth/permissions";
import { leerStock } from "@/lib/stock/shared";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEMO_MODE = process.env.DEMO_MODE === "true";
const noEncontrado = () => NextResponse.json({ error: "Stock no encontrado." }, { status: 404 });

export async function GET(_request: Request, contexto: { params: Promise<{ id: string }> }) {
  if (!DEMO_MODE && !process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Servicio no disponible: base de datos no configurada." }, { status: 503 });
  }
  if (DEMO_MODE) return noEncontrado();

  const { getCurrentSession } = await import("@/lib/auth/session");
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  const denegado = await denyIfNoPermission(session, "STOCK", "VER");
  if (denegado) return denegado;

  const { id } = await contexto.params;
  if (!UUID.test(id)) return noEncontrado();

  try {
    const { db } = await import("@/lib/db");
    const r = await leerStock(db, session.user.empresaId, id, session.user.id);
    if (!r.stock.length) return noEncontrado();
    // Solo para mostrar u ocultar accesos: cada API vuelve a verificar su propio permiso al operar.
    const acceso = await getAccessContext(session.user, session.demo === true);
    const permisos = { movimientosCrear: hasPermission(acceso, "MOVIMIENTOS", "CREAR"), movimientosVer: hasPermission(acceso, "MOVIMIENTOS", "VER") };

    return NextResponse.json({ item: r.stock[0], monedaBase: r.monedaBase, alcanceParcial: r.alcanceParcial, permisos });
  } catch (error) {
    console.error("Error al cargar stock:", error);
    return NextResponse.json({ error: "No fue posible cargar el stock." }, { status: 500 });
  }
}
