import { NextResponse } from "next/server";

import { getAccessContext, hasPermission } from "@/lib/auth/permissions";
import { autorizarReporte } from "@/lib/reportes/guard";
import { leerStockCritico, parsearFiltrosStockCritico } from "@/lib/reportes/stock-critico";

// Reporte 4 — Stock crítico y reposición (solo lectura). Requiere REPORTES.VER.
export async function GET(request: Request) {
  const auth = await autorizarReporte(["VER"]);
  if ("response" in auth) return auth.response;
  const { session } = auth;

  const parsed = parsearFiltrosStockCritico(new URL(request.url).searchParams);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const { db } = await import("@/lib/db");
    const r = await leerStockCritico(db, session.user.empresaId, session.user.id, parsed.filtros, parsed.pagina, parsed.tamano);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    // Solo para mostrar u ocultar la exportación: /exportar vuelve a exigir REPORTES.EXPORTAR en el servidor.
    const acceso = await getAccessContext(session.user, session.demo === true);

    return NextResponse.json({ ...r, permisos: { exportar: hasPermission(acceso, "REPORTES", "EXPORTAR") } });
  } catch (error) {
    console.error("Error en reporte Stock crítico y reposición:", error);
    return NextResponse.json({ error: "No fue posible generar el reporte." }, { status: 500 });
  }
}
