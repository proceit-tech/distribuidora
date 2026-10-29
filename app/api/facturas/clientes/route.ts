import { NextResponse } from "next/server";

import { buscarClientesFactura } from "@/lib/facturacion/emision";
import { prepararFacturacion } from "@/lib/facturacion/servidor";
import { respuestaErrorFacturacion } from "@/lib/facturacion/shared";

// Búsqueda de clientes facturables de la empresa de la sesión (activos y no bloqueados), con su aptitud SIFEN.
export async function GET(request: Request) {
  const b = await prepararFacturacion("CREAR");

  if (!b.ok) return b.respuesta;

  try {
    return NextResponse.json(await buscarClientesFactura(b.db, b.empresaId, new URL(request.url).searchParams.get("q") ?? "", { pagina: new URL(request.url).searchParams.get("pagina"), porPagina: new URL(request.url).searchParams.get("porPagina") }));
  } catch (error) {
    return respuestaErrorFacturacion(error, "buscar clientes para el");
  }
}
