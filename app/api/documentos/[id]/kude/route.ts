import { NextResponse } from "next/server";

import { prepararFacturacion } from "@/lib/facturacion/servidor";
import { ErrorFacturacion, obtenerKude, respuestaErrorFacturacion } from "@/lib/facturacion/shared";

type Contexto = { params: Promise<{ id: string }> };

// KuDE (PDF) de una FE existente (PRO-194). FACTURACION_ELECTRONICA.VER + alcance de sucursal; el navegador solo envía el ID. `?descargar=1` fuerza la descarga; sin él se muestra en línea.
export async function GET(request: Request, contexto: Contexto) {
  const b = await prepararFacturacion("VER");

  if (!b.ok) return b.respuesta;

  const { id } = await contexto.params;

  try {
    const { pdf, nombre } = await obtenerKude(b.db, b.empresaId, b.usuarioId, id);
    const descargar = new URL(request.url).searchParams.get("descargar") === "1";

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${descargar ? "attachment" : "inline"}; filename="${nombre}"`,
        "Content-Length": String(pdf.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof ErrorFacturacion || (error as { code?: string }).code === "42501") return respuestaErrorFacturacion(error, "obtener el KuDE");
    console.error("Error al obtener el KuDE:", error instanceof Error ? error.name : "desconocido");

    return NextResponse.json({ error: "No fue posible obtener el KuDE del documento." }, { status: 500 });
  }
}
