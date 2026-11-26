import { NextResponse } from "next/server";

import { ejecutarEntrada } from "@/lib/compras/entradas";
import { contextoEntradas, respuestaErrorEntrada } from "@/lib/compras/entradas-http";

// E6-A: ejecuta (o repite, de forma idempotente) la entrada del operador con SU K1 y el snapshot persistido; el cliente solo envía la clave. 200 = entrada confirmada (número original, `repetido` si ya
// existía); 422 + `resuelta: "RECHAZADA"` = rechazo DEFINITIVO comprobado por la base (nada se registró); cualquier otra respuesta NO es conclusiva y deja la entrada pendiente.
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
    const r = await ejecutarEntrada(ctx.db, ctx.empresaId, ctx.usuarioId, clave);

    if (r.tipo === "RECHAZADA") return NextResponse.json({ error: r.mensaje, resuelta: "RECHAZADA" }, { status: 422 });

    return NextResponse.json({ resuelta: "CONFIRMADA", entrada: { id: r.entradaId, numero: r.numero }, repetido: r.repetido });
  } catch (error) {
    return respuestaErrorEntrada(error, "registrar la entrada");
  }
}
