import { NextResponse } from "next/server";

import { consultarEntradaPendiente, reservarEntrada } from "@/lib/compras/entradas";
import { contextoEntradas, respuestaErrorEntrada } from "@/lib/compras/entradas-http";
import { hoyAsuncion } from "@/lib/listas-precio/calculos";

// E6-A: GET = entrada pendiente del operador (solo lectura); POST = reserva durable de K1 + snapshot multi-línea (COMMIT independiente, ANTES de tocar stock). COMPRAS.CREAR; el motor exige además MOVIMIENTOS.CREAR.
export async function GET() {
  const ctx = await contextoEntradas("CREAR");

  if (!ctx.ok) return ctx.respuesta;

  try {
    return NextResponse.json({ intencion: await consultarEntradaPendiente(ctx.db, ctx.empresaId, ctx.usuarioId) });
  } catch (error) {
    return respuestaErrorEntrada(error, "consultar la entrada pendiente");
  }
}

export async function POST(request: Request) {
  let cuerpo: Record<string, unknown>;

  try {
    cuerpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }

  const ctx = await contextoEntradas("CREAR");

  if (!ctx.ok) return ctx.respuesta;

  try {
    const r = await reservarEntrada(ctx.db, ctx.empresaId, ctx.usuarioId, cuerpo, hoyAsuncion());

    return NextResponse.json({ intencion: r.intencion, nueva: r.nueva }, { status: r.nueva ? 201 : 200 });
  } catch (error) {
    return respuestaErrorEntrada(error, "reservar la entrada");
  }
}
