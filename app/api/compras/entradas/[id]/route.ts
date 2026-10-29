import { NextResponse } from "next/server";

import { leerEntrada } from "@/lib/compras/entradas";
import { contextoEntradas, respuestaErrorEntrada } from "@/lib/compras/entradas-http";

type Contexto = { params: Promise<{ id: string }> };

// E6-A: detalle de una entrada (COMPRAS.VER). Fuera del alcance de depósitos o de otra empresa la entrada «no existe» (404).
export async function GET(_request: Request, contexto: Contexto) {
  const ctx = await contextoEntradas("VER");

  if (!ctx.ok) return ctx.respuesta;

  const { id } = await contexto.params;

  try {
    const entrada = await leerEntrada(ctx.db, ctx.empresaId, ctx.usuarioId, id);

    if (!entrada) return NextResponse.json({ error: "Entrada no encontrada." }, { status: 404 });

    return NextResponse.json({ entrada });
  } catch (error) {
    return respuestaErrorEntrada(error, "cargar la entrada");
  }
}
