import { NextResponse } from "next/server";

import { configurarSecuenciaNce, idPuntoValido, leerActivacion, respuestaErrorPunto } from "@/lib/facturacion/puntos";
import { prepararFacturacion } from "@/lib/facturacion/servidor";

type Contexto = { params: Promise<{ id: string }> };

// Configura o actualiza la secuencia NCE de un punto EXISTENTE (PRO-94): el administrador de puntos informa y confirma el último número realmente emitido de las notas de crédito. Solo con
// FACTURACION_ELECTRONICA.PUNTOS; la función SQL vuelve a verificar permiso, alcance, que la numeración no retroceda y no toca la secuencia de facturas.
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

  if (typeof datos === "string") return NextResponse.json({ error: datos.replace("antes de activar el punto", "para guardar la secuencia") }, { status: 400 });

  try {
    await configurarSecuenciaNce(b.db, b.empresaId, b.usuarioId, id, datos);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return respuestaErrorPunto(error);
  }
}
