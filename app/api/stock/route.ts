import { NextResponse } from "next/server";

import { denyIfNoPermission, getAccessContext, hasPermission } from "@/lib/auth/permissions";
import { leerStock } from "@/lib/stock/shared";

const DEMO_MODE = process.env.DEMO_MODE === "true";

// Solo lectura: el stock cambia únicamente por movimientos (/api/movimientos).
export async function GET() {
  if (!DEMO_MODE && !process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Servicio no disponible: base de datos no configurada." }, { status: 503 });
  }
  if (DEMO_MODE) return NextResponse.json({ stock: [], monedaBase: "PYG", demo: true });

  const { getCurrentSession } = await import("@/lib/auth/session");
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  const denegado = await denyIfNoPermission(session, "STOCK", "VER");
  if (denegado) return denegado;

  try {
    const { db } = await import("@/lib/db");
    const datos = await leerStock(db, session.user.empresaId, null, session.user.id);
    // Solo para mostrar u ocultar atajos (INV-02): cada API vuelve a verificar su propio permiso al operar.
    const acceso = await getAccessContext(session.user, session.demo === true);
    const permisos = { movimientosCrear: hasPermission(acceso, "MOVIMIENTOS", "CREAR"), movimientosVer: hasPermission(acceso, "MOVIMIENTOS", "VER") };

    return NextResponse.json({ ...datos, permisos });
  } catch (error) {
    console.error("Error al cargar stock:", error);
    return NextResponse.json({ error: "No fue posible cargar el stock." }, { status: 500 });
  }
}
