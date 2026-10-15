import { NextResponse } from "next/server";

import { crearPunto, leerAltaPunto, listarPuntos, respuestaErrorPunto } from "@/lib/facturacion/puntos";
import { prepararFacturacion } from "@/lib/facturacion/servidor";

// Gestión de puntos de expedición (PRO-129): solo con FACTURACION_ELECTRONICA.PUNTOS; la empresa y el usuario salen de la sesión y la función SQL vuelve a verificar todo.
export async function GET() {
  const b = await prepararFacturacion("PUNTOS");

  if (!b.ok) return b.respuesta;

  try {
    return NextResponse.json({ sucursales: await listarPuntos(b.db, b.empresaId, b.usuarioId) });
  } catch (error) {
    return respuestaErrorPunto(error);
  }
}

// Alta: el punto nace INACTIVO con el último número emitido informado y confirmado; se activa en un segundo paso.
export async function POST(request: Request) {
  const b = await prepararFacturacion("PUNTOS");

  if (!b.ok) return b.respuesta;

  let cuerpo: unknown;

  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });

  const datos = leerAltaPunto(cuerpo as Record<string, unknown>);

  if (typeof datos === "string") return NextResponse.json({ error: datos }, { status: 400 });

  try {
    return NextResponse.json({ id: await crearPunto(b.db, b.empresaId, b.usuarioId, datos) }, { status: 201 });
  } catch (error) {
    return respuestaErrorPunto(error);
  }
}
