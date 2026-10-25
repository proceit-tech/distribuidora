import { NextResponse } from "next/server";

import { prepararFacturacion } from "@/lib/facturacion/servidor";
import { leerDocumento, listarIntentos, listarSolicitudes, respuestaErrorFacturacion } from "@/lib/facturacion/shared";

type Contexto = { params: Promise<{ id: string }> };

// Detalle del documento con su historial de intentos. Fuera del alcance de sucursales = 404.
export async function GET(_request: Request, contexto: Contexto) {
  const b = await prepararFacturacion("VER");

  if (!b.ok) return b.respuesta;

  const { id } = await contexto.params;

  try {
    const documento = await leerDocumento(b.db, b.empresaId, b.usuarioId, id);

    if (!documento) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });

    return NextResponse.json({ documento, intentos: await listarIntentos(b.db, b.empresaId, id), solicitudes: await listarSolicitudes(b.db, b.empresaId, id), permisos: b.permisos });
  } catch (error) {
    return respuestaErrorFacturacion(error, "cargar");
  }
}
