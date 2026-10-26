import { NextResponse } from "next/server";

import { catalogosEntrada, listarEntradas } from "@/lib/compras/entradas";
import { contextoEntradas, puedeRegistrarEntradas, respuestaErrorEntrada } from "@/lib/compras/entradas-http";

// E6-A: GET = listado paginado de entradas de Compras (COMPRAS.VER, depósitos en alcance; solo filas de compras_entradas, nunca movimientos COMPRA manuales).
// ?modo=catalogos = proveedores, depósitos, productos y moneda base para «Nueva entrada» (COMPRAS.CREAR). El registro NO es por esta ruta: ver /intencion.
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const catalogos = p.get("modo") === "catalogos";
  const ctx = await contextoEntradas(catalogos ? "CREAR" : "VER");

  if (!ctx.ok) return ctx.respuesta;

  try {
    if (catalogos) return NextResponse.json({ catalogos: await catalogosEntrada(ctx.db, ctx.empresaId, ctx.usuarioId) });

    const datos = await listarEntradas(ctx.db, ctx.empresaId, ctx.usuarioId, {
      q: p.get("q") ?? undefined,
      desde: p.get("desde") ?? undefined,
      hasta: p.get("hasta") ?? undefined,
      proveedorId: p.get("proveedorId") ?? undefined,
      depositoId: p.get("depositoId") ?? undefined,
      estado: p.get("estado") ?? undefined,
      pagina: Number(p.get("pagina") ?? 1),
    });

    return NextResponse.json({ ...datos, permisos: { crear: puedeRegistrarEntradas(ctx.access) } });
  } catch (error) {
    return respuestaErrorEntrada(error, catalogos ? "cargar los catálogos" : "cargar las entradas");
  }
}
