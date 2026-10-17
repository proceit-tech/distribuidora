import { NextResponse } from "next/server";

import { prepararFacturacion } from "@/lib/facturacion/servidor";
import { listarFacturasElegibles } from "@/lib/facturacion/nce";
import { reconciliarFacturasPendientes } from "@/lib/facturacion/nce-emision";
import { respuestaErrorFacturacion } from "@/lib/facturacion/shared";

// Facturas APROBADAS (CDC válido) del cliente con saldo por acreditar. Con `actualizar=1` consulta antes, con límites, las FE ya enviadas aún no confirmadas (RN-01).
export async function GET(request: Request) {
  const b = await prepararFacturacion("CREAR");

  if (!b.ok) return b.respuesta;

  const p = new URL(request.url).searchParams;

  try {
    const clienteId = p.get("clienteId") ?? "";

    if (p.get("actualizar") === "1") await reconciliarFacturasPendientes(b.db, b.empresaId, b.usuarioId, clienteId);

    return NextResponse.json(await listarFacturasElegibles(b.db, b.empresaId, b.usuarioId, { clienteId, q: p.get("q") ?? "", pagina: p.get("pagina"), porPagina: p.get("porPagina") }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return respuestaErrorFacturacion(error, "cargar");
  }
}
