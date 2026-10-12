import { NextResponse } from "next/server";

import { denyIfNoPermission, getAccessContext, hasPermission } from "@/lib/auth/permissions";
import { leerEntradasReposicion } from "@/lib/reposicion/datos";

const DEMO_MODE = process.env.DEMO_MODE === "true";

// Solo lectura (STOCK.VER): la reposición es planificación; no registra movimientos, compras ni transferencias.
export async function GET() {
  if (!DEMO_MODE && !process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Servicio no disponible: base de datos no configurada." }, { status: 503 });
  }
  if (DEMO_MODE) return NextResponse.json({ entradas: [], depositos: [], alcanceParcial: false, demo: true });

  const { getCurrentSession } = await import("@/lib/auth/session");
  const session = await getCurrentSession();

  if (!session) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });

  const denegado = await denyIfNoPermission(session, "STOCK", "VER");

  if (denegado) return denegado;

  try {
    const { db } = await import("@/lib/db");
    const datos = await leerEntradasReposicion(db, session.user.empresaId, session.user.id);
    const acceso = await getAccessContext(session.user, session.demo === true);

    return NextResponse.json({ ...datos, permisos: { movimientos: hasPermission(acceso, "MOVIMIENTOS", "CREAR") } });
  } catch (error) {
    console.error("Error al calcular la reposición:", error);

    return NextResponse.json({ error: "No fue posible cargar los datos de reposición." }, { status: 500 });
  }
}
