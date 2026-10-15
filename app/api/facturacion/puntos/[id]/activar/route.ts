import { NextResponse } from "next/server";

import { activarPunto, idPuntoValido, leerActivacion, respuestaErrorPunto } from "@/lib/facturacion/puntos";
import { prepararFacturacion } from "@/lib/facturacion/servidor";

type Contexto = { params: Promise<{ id: string }> };

// Activa un punto tras CONFIRMAR de nuevo el último número emitido (igual al guardado o mayor; nunca menor).
export async function POST(request: Request, contexto: Contexto) {
  const b = await prepararFacturacion("PUNTOS");

  if (!b.ok) return b.respuesta;

  const { id } = await contexto.params;

  if (!idPuntoValido(id)) return NextResponse.json({ error: "Punto de expedición no encontrado." }, { status: 404 });

  let cuerpo: unknown;

  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });

  const datos = leerActivacion(cuerpo as Record<string, unknown>);

  if (typeof datos === "string") return NextResponse.json({ error: datos }, { status: 400 });

  try {
    await activarPunto(b.db, b.empresaId, b.usuarioId, id, datos);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return respuestaErrorPunto(error);
  }
}
