import { NextResponse } from "next/server";

import { prepararFacturacion } from "@/lib/facturacion/servidor";
import { leerIntentosPagina, respuestaErrorFacturacion } from "@/lib/facturacion/shared";

type Contexto = { params: Promise<{ id: string }> };

// Página del historial de envíos y consultas (sin JSON de respuesta): hasta 100 intentos más antiguos que el cursor. FACTURACION_ELECTRONICA.VER + alcance de sucursal del documento; empresa y usuario salen de la sesión.
export async function GET(request: Request, contexto: Contexto) {
  const b = await prepararFacturacion("VER");

  if (!b.ok) return b.respuesta;

  const { id } = await contexto.params;
  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;

  try {
    const pagina = await leerIntentosPagina(b.db, b.empresaId, b.usuarioId, id, cursor);

    return NextResponse.json(pagina, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return respuestaErrorFacturacion(error, "cargar");
  }
}
