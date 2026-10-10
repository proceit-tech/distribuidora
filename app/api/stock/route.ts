import { NextResponse } from "next/server";

import { denyIfNoPermission } from "@/lib/auth/permissions";
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
    return NextResponse.json(await leerStock(db, session.user.empresaId, null));
  } catch (error) {
    console.error("Error al cargar stock:", error);
    return NextResponse.json({ error: "No fue posible cargar el stock." }, { status: 500 });
  }
}
