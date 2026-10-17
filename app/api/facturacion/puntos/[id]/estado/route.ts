import { NextResponse } from "next/server";

import { cambiarEstadoPunto, idPuntoValido, leerEstado, respuestaErrorPunto } from "@/lib/facturacion/puntos";
import { prepararFacturacion } from "@/lib/facturacion/servidor";

type Contexto = { params: Promise<{ id: string }> };

// Activa o desactiva el punto ADMINISTRATIVO (NEX-063) sin volver a pedir números: la numeración de cada tipo se confirmó una vez al configurarlo. Solo con FACTURACION_ELECTRONICA.PUNTOS; la función
// SQL vuelve a verificar permiso, alcance y la identidad fiscal (un mismo establecimiento + código no puede estar activo en dos sucursales).
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

  const activo = leerEstado(cuerpo as Record<string, unknown>);

  if (typeof activo === "string") return NextResponse.json({ error: activo }, { status: 400 });

  try {
    await cambiarEstadoPunto(b.db, b.empresaId, b.usuarioId, id, activo);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return respuestaErrorPunto(error);
  }
}
