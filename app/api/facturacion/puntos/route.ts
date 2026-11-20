import { NextResponse } from "next/server";

import { altaPuntoConTipo, leerAltaPuntoTipo, listarPuntos, respuestaErrorPunto } from "@/lib/facturacion/puntos";
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

// Alta fiscal ÚNICA (NEX-064): punto (nuevo o existente) + un tipo documental con serie, último número y confirmación, en UNA transacción. No se crea nunca un punto sin tipo.
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

  const datos = leerAltaPuntoTipo(cuerpo as Record<string, unknown>);

  if (typeof datos === "string") return NextResponse.json({ error: datos }, { status: 400 });

  try {
    const r = await altaPuntoConTipo(b.db, b.empresaId, b.usuarioId, datos);

    return NextResponse.json(r, { status: r.creado ? 201 : 200 });
  } catch (error) {
    return respuestaErrorPunto(error);
  }
}
