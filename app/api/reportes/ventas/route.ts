import { NextResponse } from "next/server";

import { getAccessContext, hasPermission } from "@/lib/auth/permissions";
import { autorizarReporte } from "@/lib/reportes/guard";
import { leerVentas, parsearFiltrosVentas } from "@/lib/reportes/ventas";

// Informe de Ventas (E5 / PRO-296, solo lectura). Requiere REPORTES.VER; empresa y usuario SIEMPRE de la sesión (nunca de la query).
export async function GET(request: Request) {
  const auth = await autorizarReporte(["VER"]);
  if ("response" in auth) return auth.response;
  const { session } = auth;

  const parsed = parsearFiltrosVentas(new URL(request.url).searchParams);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const { db } = await import("@/lib/db");
    const r = await leerVentas(db, session.user.empresaId, session.user.id, parsed.filtros, parsed.pagina, parsed.tamano);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    // Solo para mostrar u ocultar la exportación: /exportar vuelve a exigir REPORTES.EXPORTAR en el servidor.
    const acceso = await getAccessContext(session.user, session.demo === true);

    return NextResponse.json({ ...r, permisos: { exportar: hasPermission(acceso, "REPORTES", "EXPORTAR") } });
  } catch (error) {
    console.error("Error en Informe de Ventas:", error);
    return NextResponse.json({ error: "No fue posible generar el informe." }, { status: 500 });
  }
}
