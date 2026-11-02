import { NextResponse } from "next/server";

import { prepararFacturacion } from "@/lib/facturacion/servidor";
import { respuestaErrorFacturacion } from "@/lib/facturacion/shared";
import { leerPagina } from "@/lib/usuarios/paginacion";
import { listarVendedoresActivos } from "@/lib/usuarios/vendedores";

// Vendedores ACTIVOS de la empresa de la sesión para elegir en «Nueva factura» (quien factura, FACTURACION_ELECTRONICA.CREAR). Solo usuarios con el perfil Vendedor; nunca de otra empresa.
export async function GET(request: Request) {
  const b = await prepararFacturacion("CREAR");

  if (!b.ok) return b.respuesta;

  try {
    return NextResponse.json(await listarVendedoresActivos(b.db, b.empresaId, leerPagina(new URL(request.url))));
  } catch (error) {
    return respuestaErrorFacturacion(error, "buscar vendedores para el");
  }
}
