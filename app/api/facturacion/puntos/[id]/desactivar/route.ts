import { NextResponse } from "next/server";

import { desactivarPunto, idPuntoValido, respuestaErrorPunto } from "@/lib/facturacion/puntos";
import { prepararFacturacion } from "@/lib/facturacion/servidor";

type Contexto = { params: Promise<{ id: string }> };

// Desactiva un punto (no se elimina: identidad y numeración monotónica se conservan).
export async function POST(_request: Request, contexto: Contexto) {
  const b = await prepararFacturacion("PUNTOS");

  if (!b.ok) return b.respuesta;

  const { id } = await contexto.params;

  if (!idPuntoValido(id)) return NextResponse.json({ error: "Punto de expedición no encontrado." }, { status: 404 });

  try {
    await desactivarPunto(b.db, b.empresaId, b.usuarioId, id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return respuestaErrorPunto(error);
  }
}
