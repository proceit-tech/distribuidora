import { NextResponse } from "next/server";

import { leerCuerpoFactura } from "@/lib/facturacion/emision";
import { emitirFactura } from "@/lib/facturacion/envio";
import { prepararFacturacion } from "@/lib/facturacion/servidor";
import { respuestaErrorFacturacion } from "@/lib/facturacion/shared";

// «Enviar factura» (FACTURACION_ELECTRONICA.CREAR): confirma la operación, registra la intención de forma idempotente (reserva el número UNA vez), genera el
// payload final y transmite a recepcion_de desde el servidor. El HTTP 200 de esta API no implica aprobación SIFEN: el resultado trae el estado de envío y
// las fases; el estado fiscal solo lo fija la consulta de estado. empresa_id y usuario salen de la sesión.
export async function POST(request: Request) {
  const b = await prepararFacturacion("CREAR");

  if (!b.ok) return b.respuesta;

  let cuerpo: unknown;

  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });

  const datos = leerCuerpoFactura(cuerpo as Record<string, unknown>);

  if (typeof datos === "string") return NextResponse.json({ error: datos }, { status: 400 });

  try {
    return NextResponse.json(await emitirFactura(b.db, b.empresaId, b.usuarioId, datos));
  } catch (error) {
    return respuestaErrorFacturacion(error, "enviar");
  }
}
