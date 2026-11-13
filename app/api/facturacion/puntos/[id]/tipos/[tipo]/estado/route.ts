import { NextResponse } from "next/server";

import { cambiarEstadoTipo, esTipoDocumentoPunto, idPuntoValido, leerEstado, respuestaErrorPunto } from "@/lib/facturacion/puntos";
import { prepararFacturacion } from "@/lib/facturacion/servidor";

type Contexto = { params: Promise<{ id: string; tipo: string }> };

// Activa o desactiva UN tipo de documento en el punto (no toca los demás ni pierde serie/número). Solo con FACTURACION_ELECTRONICA.PUNTOS; la función SQL vuelve a verificarlo todo.
export async function POST(request: Request, contexto: Contexto) {
  const b = await prepararFacturacion("PUNTOS");

  if (!b.ok) return b.respuesta;

  const { id, tipo } = await contexto.params;

  if (!idPuntoValido(id)) return NextResponse.json({ error: "Punto de expedición no encontrado." }, { status: 404 });
  if (!esTipoDocumentoPunto(tipo)) return NextResponse.json({ error: "Tipo de documento no válido." }, { status: 400 });

  let cuerpo: unknown;

  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });

  const activo = leerEstado(cuerpo as Record<string, unknown>);

  if (typeof activo === "string") return NextResponse.json({ error: activo }, { status: 400 });

  try {
    await cambiarEstadoTipo(b.db, b.empresaId, b.usuarioId, id, tipo, activo);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return respuestaErrorPunto(error);
  }
}
