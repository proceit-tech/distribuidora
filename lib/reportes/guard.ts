import "server-only";

import { NextResponse } from "next/server";

import { getAccessContext, hasPermission } from "@/lib/auth/permissions";
import type { AuthSession } from "@/types/auth";

const DEMO_MODE = process.env.DEMO_MODE === "true";

/** Preámbulo común de las rutas de reportes: 503 sin base, 401 sin sesión, 403 sin permiso. */
export async function autorizarReporte(
  acciones: string[],
): Promise<{ session: AuthSession } | { response: NextResponse }> {
  if (!DEMO_MODE && !process.env.DATABASE_URL) {
    return { response: NextResponse.json({ error: "Servicio no disponible: base de datos no configurada." }, { status: 503 }) };
  }
  if (DEMO_MODE) return { response: NextResponse.json({ error: "Los reportes no tienen datos en modo demo." }, { status: 503 }) };

  const { getCurrentSession } = await import("@/lib/auth/session");
  const session = await getCurrentSession();
  if (!session) return { response: NextResponse.json({ error: "Sesión no válida." }, { status: 401 }) };
  const access = await getAccessContext(session.user, session.demo === true);
  if (!acciones.every((a) => hasPermission(access, "REPORTES", a))) {
    return { response: NextResponse.json({ error: "No tiene permiso para esta acción." }, { status: 403 }) };
  }
  return { session };
}
