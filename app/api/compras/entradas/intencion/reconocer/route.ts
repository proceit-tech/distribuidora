import { NextResponse } from "next/server";

import { reconocerEntrada } from "@/lib/compras/entradas";
import { contextoEntradas, respuestaErrorEntrada } from "@/lib/compras/entradas-http";

// E6-A: reconocimiento (ACK) del resultado de una entrada CONFIRMADA. Autenticado, idempotente, NO toca stock; solo después queda libre una entrada nueva. Repetirlo es seguro.
export async function POST(request: Request) {
  let clave = "";

  try {
    clave = String(((await request.json()) as { clave?: unknown }).clave ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }
  if (clave.length < 8 || clave.length > 120) return NextResponse.json({ error: "La clave del registro no es válida." }, { status: 400 });

  const ctx = await contextoEntradas("CREAR");

  if (!ctx.ok) return ctx.respuesta;

  try {
    const r = await reconocerEntrada(ctx.db, ctx.empresaId, ctx.usuarioId, clave);

    return NextResponse.json({ reconocida: true, entrada: { id: r.entradaId, numero: r.numero } });
  } catch (error) {
    return respuestaErrorEntrada(error, "confirmar la recepción");
  }
}
