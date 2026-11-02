import { NextResponse } from "next/server";

import { prepararFacturacion } from "@/lib/facturacion/servidor";
import { buscarClientesConFacturas } from "@/lib/facturacion/nce";
import { respuestaErrorFacturacion } from "@/lib/facturacion/shared";

// Clientes con facturas aprobadas en el alcance del usuario (PRO-94). empresa y usuario de la sesión.
export async function GET(request: Request) {
  const b = await prepararFacturacion("CREAR");

  if (!b.ok) return b.respuesta;

  const p = new URL(request.url).searchParams;

  try {
    return NextResponse.json(await buscarClientesConFacturas(b.db, b.empresaId, b.usuarioId, p.get("q") ?? "", p.get("pagina"), p.get("porPagina")), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return respuestaErrorFacturacion(error, "cargar");
  }
}
