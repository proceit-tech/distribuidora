import { NextResponse } from "next/server";

import { buscarProductosFactura } from "@/lib/facturacion/emision";
import { prepararFacturacion } from "@/lib/facturacion/servidor";
import { respuestaErrorFacturacion } from "@/lib/facturacion/shared";

// Búsqueda de productos facturables (mercadería y servicios activos) con precio de referencia, IVA y unidad SIFEN del catálogo de la empresa.
export async function GET(request: Request) {
  const b = await prepararFacturacion("CREAR");

  if (!b.ok) return b.respuesta;

  try {
    return NextResponse.json(await buscarProductosFactura(b.db, b.empresaId, new URL(request.url).searchParams.get("q") ?? "", { pagina: new URL(request.url).searchParams.get("pagina"), porPagina: new URL(request.url).searchParams.get("porPagina") }));
  } catch (error) {
    return respuestaErrorFacturacion(error, "buscar productos para el");
  }
}
