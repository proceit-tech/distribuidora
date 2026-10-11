import { NextResponse } from "next/server";

import { autorizarReporte } from "@/lib/reportes/guard";
import { leerLotes, parsearFiltrosLotes } from "@/lib/reportes/lotes";

// Reporte 5 — Lotes y vencimientos (solo lectura). Requiere REPORTES.VER.
export async function GET(request: Request) {
  const auth = await autorizarReporte(["VER"]);
  if ("response" in auth) return auth.response;
  const { session } = auth;

  const parsed = parsearFiltrosLotes(new URL(request.url).searchParams);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const { db } = await import("@/lib/db");
    const r = await leerLotes(db, session.user.empresaId, session.user.id, parsed.filtros, parsed.pagina, parsed.tamano);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json(r);
  } catch (error) {
    console.error("Error en reporte Lotes y vencimientos:", error);
    return NextResponse.json({ error: "No fue posible generar el reporte." }, { status: 500 });
  }
}
