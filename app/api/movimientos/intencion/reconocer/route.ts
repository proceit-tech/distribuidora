import { NextResponse } from "next/server";

import { reconocerIntencion, respuestaReconocimiento } from "@/lib/movimientos/intenciones";
import { contextoIntencion, respuestaErrorIntencion } from "@/lib/movimientos/intenciones-http";

// MOV-R08-01: reconocimiento (ACK) del resultado de una intención CONFIRMADA. Autenticado (empresa y usuario de la sesión, MOVIMIENTOS.CREAR), idempotente, NO toca stock ni registra nada; solo después queda libre
// una intención nueva. Si la respuesta se pierde, repetirlo es seguro.
export async function POST(request: Request) {
  let clave = "";

  try {
    clave = String(((await request.json()) as { clave?: unknown }).clave ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }
  if (clave.length < 8 || clave.length > 120) return NextResponse.json({ error: "La clave del registro no es válida." }, { status: 400 });

  const ctx = await contextoIntencion();

  if (!ctx.ok) return ctx.respuesta;

  try {
    const h = respuestaReconocimiento(await reconocerIntencion(ctx.db, ctx.empresaId, ctx.usuarioId, clave));

    return NextResponse.json(h.body, { status: h.status });
  } catch (error) {
    return respuestaErrorIntencion(error);
  }
}
