import { NextResponse } from "next/server";

import { getAccessContext, hasPermission } from "@/lib/auth/permissions";
import { PERIODOS, leerDashboard } from "@/lib/dashboard/shared";
import type { DashboardPeriodo } from "@/types/dashboard";

const DEMO_MODE = process.env.DEMO_MODE === "true";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Solo lectura. Requiere DASHBOARD.VER; cada sección exige además el permiso VER de su módulo.
export async function GET(request: Request) {
  if (!DEMO_MODE && !process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Servicio no disponible: base de datos no configurada." }, { status: 503 });
  }
  if (DEMO_MODE) return NextResponse.json({ error: "El panel no tiene datos en modo demo." }, { status: 503 });

  const { getCurrentSession } = await import("@/lib/auth/session");
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  const access = await getAccessContext(session.user, session.demo === true);
  if (!hasPermission(access, "DASHBOARD", "VER")) {
    return NextResponse.json({ error: "No tiene permiso para esta acción." }, { status: 403 });
  }

  const url = new URL(request.url);
  const periodo = (url.searchParams.get("periodo") ?? "7d") as DashboardPeriodo;
  if (!(periodo in PERIODOS)) return NextResponse.json({ error: "Período no válido." }, { status: 400 });
  const depositoId = url.searchParams.get("depositoId") ?? "";
  if (depositoId && !UUID.test(depositoId)) return NextResponse.json({ error: "Depósito no válido." }, { status: 400 });

  try {
    const { db } = await import("@/lib/db");
    const r = await leerDashboard(
      db, session.user.empresaId, session.user.id,
      {
        productos: hasPermission(access, "PRODUCTOS", "VER"),
        clientes: hasPermission(access, "CLIENTES", "VER"),
        stock: hasPermission(access, "STOCK", "VER"),
        movimientos: hasPermission(access, "MOVIMIENTOS", "VER"),
      },
      periodo, depositoId,
    );
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json(r);
  } catch (error) {
    console.error("Error al cargar el panel:", error);
    return NextResponse.json({ error: "No fue posible cargar el panel." }, { status: 500 });
  }
}
