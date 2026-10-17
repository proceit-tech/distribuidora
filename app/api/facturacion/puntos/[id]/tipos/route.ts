import { NextResponse } from "next/server";

import { configurarTipoPunto, idPuntoValido, leerConfiguracionTipo, respuestaErrorPunto } from "@/lib/facturacion/puntos";
import { prepararFacturacion } from "@/lib/facturacion/servidor";

type Contexto = { params: Promise<{ id: string }> };

// Configura (o reconcilia hacia adelante) UN tipo de documento de un punto existente: serie actual (vacía = sin serie) y último número realmente emitido, con una confirmación única. Solo con
// FACTURACION_ELECTRONICA.PUNTOS; la función SQL vuelve a verificar permiso, alcance, tipo, que la numeración (serie + número) no retroceda y no toca los demás tipos.
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

  const datos = leerConfiguracionTipo(cuerpo as Record<string, unknown>);

  if (typeof datos === "string") return NextResponse.json({ error: datos }, { status: 400 });

  try {
    await configurarTipoPunto(b.db, b.empresaId, b.usuarioId, id, datos);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return respuestaErrorPunto(error);
  }
}
