import { NextResponse } from "next/server";

import { generarPdfTabla, generarXlsxTabla, nombreArchivo } from "@/lib/reportes/export";
import { tablaKardex } from "@/lib/reportes/export-kardex";
import { autorizarReporte } from "@/lib/reportes/guard";
import { leerKardex, parsearFiltrosKardex } from "@/lib/reportes/kardex";

// Exportación de Kardex de movimientos a Excel/PDF con los mismos filtros de la pantalla. Requiere REPORTES.VER y REPORTES.EXPORTAR.
export async function GET(request: Request) {
  const auth = await autorizarReporte(["VER", "EXPORTAR"]);
  if ("response" in auth) return auth.response;
  const { session } = auth;

  const sp = new URL(request.url).searchParams;
  const formato = sp.get("formato");
  if (formato !== "xlsx" && formato !== "pdf") return NextResponse.json({ error: "Formato no válido (xlsx o pdf)." }, { status: 400 });
  const parsed = parsearFiltrosKardex(sp);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const { db } = await import("@/lib/db");
    const r = await leerKardex(db, session.user.empresaId, session.user.id, parsed.filtros, 1, 50, true);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    const tabla = tablaKardex(r);
    const cuerpo = formato === "xlsx" ? generarXlsxTabla(tabla) : generarPdfTabla(tabla);
    return new NextResponse(new Uint8Array(cuerpo), {
      headers: {
        "Content-Type": formato === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf",
        "Content-Disposition": `attachment; filename="${nombreArchivo(tabla, formato)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error al exportar Kardex de movimientos:", error);
    return NextResponse.json({ error: "No fue posible exportar el reporte." }, { status: 500 });
  }
}
