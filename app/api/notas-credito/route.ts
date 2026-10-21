import { NextResponse } from "next/server";

import { prepararFacturacion } from "@/lib/facturacion/servidor";
import { leerCuerpoNce } from "@/lib/facturacion/nce";
import { emitirNce } from "@/lib/facturacion/nce-emision";
import { respuestaErrorFacturacion } from "@/lib/facturacion/shared";

// «Emitir Nota de Crédito» (FACTURACION_ELECTRONICA.CREAR): preflight del gateway, validación, creación idempotente (reserva el número UNA vez bajo bloqueo de la factura original) y envío desde el
// servidor. El HTTP 200 NO implica aprobación SIFEN: el estado fiscal solo lo fija la consulta. empresa y usuario salen de la sesión.
export async function POST(request: Request) {
  const b = await prepararFacturacion("CREAR");

  if (!b.ok) return b.respuesta;

  let cuerpo: unknown;

  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });

  const datos = leerCuerpoNce(cuerpo as Record<string, unknown>);

  if (typeof datos === "string") return NextResponse.json({ error: datos }, { status: 400 });

  try {
    return NextResponse.json(await emitirNce(b.db, b.empresaId, b.usuarioId, datos));
  } catch (error) {
    return respuestaErrorFacturacion(error, "emitir");
  }
}
