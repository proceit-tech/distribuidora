import { NextResponse } from "next/server";

import { leerCuerpoFactura, prepararFactura } from "@/lib/facturacion/emision";
import { prepararFacturacion } from "@/lib/facturacion/servidor";
import { respuestaErrorFacturacion } from "@/lib/facturacion/shared";

// «Grabar»: valida y calcula en el servidor y devuelve el resumen para revisar. NO escribe, NO reserva número y NO transmite nada.
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
    const { resumen } = await prepararFactura(b.db, b.empresaId, b.usuarioId, datos);

    return NextResponse.json({ resumen });
  } catch (error) {
    return respuestaErrorFacturacion(error, "revisar");
  }
}
