import { NextResponse } from "next/server";

import { ejecutarIntencion, respuestaEjecucion } from "@/lib/movimientos/intenciones";
import { contextoIntencion, respuestaErrorIntencion } from "@/lib/movimientos/intenciones-http";

// MOV-O07: ejecuta (o repite, de forma idempotente) la intención del operador con SU K1 y el snapshot persistido; el cliente solo envía la clave. 200 = movimiento confirmado (número original, `repetido` si ya
// existía); 422 + `resuelta: "RECHAZADA"` = rechazo DEFINITIVO comprobado (nada se registró); cualquier otra respuesta NO es conclusiva y deja la intención pendiente.
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
    const r = await ejecutarIntencion(ctx.db, ctx.empresaId, ctx.usuarioId, clave);

    const h = respuestaEjecucion(r);

    return NextResponse.json(h.body, { status: h.status });
  } catch (error) {
    return respuestaErrorIntencion(error);
  }
}
