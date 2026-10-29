import { NextResponse } from "next/server";

import { prepararFacturacion } from "@/lib/facturacion/servidor";
import { propuestaCorreccion } from "@/lib/facturacion/nce";
import { respuestaErrorFacturacion } from "@/lib/facturacion/shared";

type Contexto = { params: Promise<{ id: string }> };

// «Corregir y emitir nueva»: propuesta (FE, motivo, líneas) tomada de una NCE rechazada definitivamente. Solo lectura; no modifica ni reenvía la rechazada.
export async function GET(_request: Request, contexto: Contexto) {
  const b = await prepararFacturacion("CREAR");

  if (!b.ok) return b.respuesta;

  const { id } = await contexto.params;

  try {
    return NextResponse.json(await propuestaCorreccion(b.db, b.empresaId, b.usuarioId, id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return respuestaErrorFacturacion(error, "preparar");
  }
}
