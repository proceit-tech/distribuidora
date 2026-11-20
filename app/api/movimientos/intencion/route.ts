import { NextResponse } from "next/server";

import { consultarIntencion, reservarIntencion } from "@/lib/movimientos/intenciones";
import { contextoIntencion, respuestaErrorIntencion } from "@/lib/movimientos/intenciones-http";

// MOV-O07: GET = intención pendiente del operador (solo lectura, no registra ni anula nada); POST = reserva durable de K1 + snapshot (COMMIT independiente, ANTES de tocar stock).
export async function GET() {
  const ctx = await contextoIntencion();

  if (!ctx.ok) return ctx.respuesta;

  try {
    return NextResponse.json({ intencion: await consultarIntencion(ctx.db, ctx.empresaId, ctx.usuarioId) });
  } catch (error) {
    return respuestaErrorIntencion(error);
  }
}

export async function POST(request: Request) {
  let cuerpo: Record<string, unknown>;

  try {
    cuerpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }

  const ctx = await contextoIntencion();

  if (!ctx.ok) return ctx.respuesta;

  try {
    const r = await reservarIntencion(ctx.db, ctx.empresaId, ctx.usuarioId, cuerpo);

    return NextResponse.json({ intencion: r.intencion, nueva: r.nueva }, { status: r.nueva ? 201 : 200 });
  } catch (error) {
    return respuestaErrorIntencion(error);
  }
}
