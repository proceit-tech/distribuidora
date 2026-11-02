import { NextResponse } from "next/server";

import { generarPdfTabla, generarXlsxTabla, nombreArchivo } from "@/lib/reportes/export";
import { tablaVentas } from "@/lib/reportes/export-ventas";
import { autorizarReporte } from "@/lib/reportes/guard";
import { leerVentas, parsearFiltrosVentas } from "@/lib/reportes/ventas";

// Exportación del Informe de Ventas a Excel/PDF con los mismos filtros y la misma lectura (snapshot) que la pantalla, sobre TODAS las filas del filtro (no una página).
// Requiere REPORTES.VER y REPORTES.EXPORTAR.
export async function GET(request: Request) {
  const auth = await autorizarReporte(["VER", "EXPORTAR"]);
  if ("response" in auth) return auth.response;
  const { session } = auth;

  const sp = new URL(request.url).searchParams;
  const formato = sp.get("formato");
  if (formato !== "xlsx" && formato !== "pdf") return NextResponse.json({ error: "Formato no válido (xlsx o pdf)." }, { status: 400 });
  const parsed = parsearFiltrosVentas(sp);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const { db } = await import("@/lib/db");
    const r = await leerVentas(db, session.user.empresaId, session.user.id, parsed.filtros, 1, 50, true);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    const tabla = tablaVentas(r);
    const cuerpo = formato === "xlsx" ? generarXlsxTabla(tabla) : generarPdfTabla(tabla);
    return new NextResponse(new Uint8Array(cuerpo), {
      headers: {
        "Content-Type": formato === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf",
        "Content-Disposition": `attachment; filename="${nombreArchivo(tabla, formato)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error al exportar Informe de Ventas:", error);
    return NextResponse.json({ error: "No fue posible exportar el informe." }, { status: 500 });
  }
}
