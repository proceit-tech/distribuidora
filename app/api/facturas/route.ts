import { NextResponse } from "next/server";

import { crearFacturaElectronica, leerCuerpoFactura } from "@/lib/facturacion/emision";
import { prepararFacturacion } from "@/lib/facturacion/servidor";
import { respuestaErrorFacturacion } from "@/lib/facturacion/shared";

// Crea una Factura Electrónica (FACTURACION_ELECTRONICA.CREAR): reserva el número, guarda el documento y su payload inmutable en PENDIENTE_ENVIO.
// No envía nada al gateway. empresa_id y usuario salen de la sesión; precios, IVA, unidad y datos del receptor se leen de los cadastros.
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
    const r = await crearFacturaElectronica(b.db, b.empresaId, b.usuarioId, datos);

    return NextResponse.json(r, { status: r.reutilizado === true ? 200 : 201 });
  } catch (error) {
    return respuestaErrorFacturacion(error, "crear");
  }
}
