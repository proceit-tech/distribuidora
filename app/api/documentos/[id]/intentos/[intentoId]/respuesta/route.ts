import { NextResponse } from "next/server";

import { prepararFacturacion } from "@/lib/facturacion/servidor";
import { leerRespuestaIntento, respuestaErrorFacturacion } from "@/lib/facturacion/shared";

type Contexto = { params: Promise<{ id: string; intentoId: string }> };

// JSON de respuesta (ya saneado al registrarse) de UN intento del documento (solo lectura, bajo demanda). FACTURACION_ELECTRONICA.VER + alcance de sucursal del documento; el intento se correlaciona por empresa + documento + intento.
export async function GET(_request: Request, contexto: Contexto) {
  const b = await prepararFacturacion("VER");

  if (!b.ok) return b.respuesta;

  const { id, intentoId } = await contexto.params;

  try {
    const intento = await leerRespuestaIntento(b.db, b.empresaId, b.usuarioId, id, intentoId);

    return NextResponse.json({ intento }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return respuestaErrorFacturacion(error, "cargar");
  }
}
