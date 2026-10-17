import { NextResponse } from "next/server";

import { prepararFacturacion } from "@/lib/facturacion/servidor";
import { leerCuerpoNce, prepararNce } from "@/lib/facturacion/nce";
import { respuestaErrorFacturacion } from "@/lib/facturacion/shared";

// «Revisar» la nota de crédito: valida todo y devuelve el resumen del modal final. NO escribe, NO reserva numeración, NO transmite.
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

  const datos = leerCuerpoNce(cuerpo as Record<string, unknown>);

  if (typeof datos === "string") return NextResponse.json({ error: datos }, { status: 400 });

  try {
    const prep = await prepararNce(b.db, b.empresaId, b.usuarioId, datos);

    return NextResponse.json({ resumen: prep.resumen }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return respuestaErrorFacturacion(error, "revisar");
  }
}
