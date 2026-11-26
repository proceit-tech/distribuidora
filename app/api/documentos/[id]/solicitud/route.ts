import { NextResponse } from "next/server";

import { prepararFacturacion } from "@/lib/facturacion/servidor";
import { leerSolicitudJson, respuestaErrorFacturacion } from "@/lib/facturacion/shared";

type Contexto = { params: Promise<{ id: string }> };

// JSON fiscal registrado de UNA versión de solicitud (solo lectura, bajo demanda). FACTURACION_ELECTRONICA.VER + alcance de sucursal del documento; empresa y usuario salen de la sesión. Fuera de alcance = 404 sin contenido.
export async function GET(request: Request, contexto: Contexto) {
  const b = await prepararFacturacion("VER");

  if (!b.ok) return b.respuesta;

  const { id } = await contexto.params;

  try {
    const solicitud = await leerSolicitudJson(b.db, b.empresaId, b.usuarioId, id, new URL(request.url).searchParams.get("version"));

    return NextResponse.json({ solicitud }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return respuestaErrorFacturacion(error, "cargar");
  }
}
