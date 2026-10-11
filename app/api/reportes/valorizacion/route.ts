import { NextResponse } from "next/server";

import { autorizarReporte } from "@/lib/reportes/guard";
import { leerValorizacion, parsearFiltrosValorizacion } from "@/lib/reportes/valorizacion";

// Reporte 2 — Valorización de inventario (solo lectura). Requiere REPORTES.VER.
export async function GET(request: Request) {
  const auth = await autorizarReporte(["VER"]);
  if ("response" in auth) return auth.response;
  const { session } = auth;

  const parsed = parsearFiltrosValorizacion(new URL(request.url).searchParams);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const { db } = await import("@/lib/db");
    const r = await leerValorizacion(db, session.user.empresaId, session.user.id, parsed.filtros, parsed.pagina, parsed.tamano);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json(r);
  } catch (error) {
    console.error("Error en reporte Valorización de inventario:", error);
    return NextResponse.json({ error: "No fue posible generar el reporte." }, { status: 500 });
  }
}
