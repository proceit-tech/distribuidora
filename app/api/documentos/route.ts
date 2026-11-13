import { NextResponse } from "next/server";

import { prepararFacturacion } from "@/lib/facturacion/servidor";
import { leerDocumentos, respuestaErrorFacturacion } from "@/lib/facturacion/shared";

// Listado paginado en el servidor de los documentos electrónicos de la empresa (y de las sucursales en el alcance del usuario).
export async function GET(request: Request) {
  const b = await prepararFacturacion("VER");

  if (!b.ok) return b.respuesta;

  const p = new URL(request.url).searchParams;

  try {
    const datos = await leerDocumentos(b.db, b.empresaId, b.usuarioId, {
      q: p.get("q") ?? undefined,
      tipo: p.get("tipo") ?? undefined,
      sucursal: p.get("sucursal") ?? undefined,
      estadoSifen: p.get("estadoSifen") ?? undefined,
      estadoLocal: p.get("estadoLocal") ?? undefined,
      estadoEmail: p.get("estadoEmail") ?? undefined,
      grupo: p.get("grupo") ?? undefined,
      desde: p.get("desde") ?? undefined,
      hasta: p.get("hasta") ?? undefined,
      orden: p.get("orden") ?? undefined,
      dir: p.get("dir") ?? undefined,
      pagina: p.has("pagina") ? Number(p.get("pagina")) : undefined,
      tamano: p.has("tamano") ? Number(p.get("tamano")) : undefined,
    });

    return NextResponse.json({ ...datos, permisos: b.permisos });
  } catch (error) {
    return respuestaErrorFacturacion(error, "cargar");
  }
}
