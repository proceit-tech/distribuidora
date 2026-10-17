import { NextResponse } from "next/server";

import { prepararFacturacion } from "@/lib/facturacion/servidor";
import { leerFacturaOriginal, puntosParaNce } from "@/lib/facturacion/nce";
import { receptorEsInnominado } from "@/lib/facturacion/payload-nce";
import { reconciliarNcePendientes } from "@/lib/facturacion/nce-emision";
import { respuestaErrorFacturacion } from "@/lib/facturacion/shared";

type Contexto = { params: Promise<{ id: string }> };

// Detalle de la factura original con TODAS sus líneas y saldos, motivo permitido y puntos con secuencia NCE. Jamás devuelve el payload completo ni datos del emisor.
export async function GET(_request: Request, contexto: Contexto) {
  const b = await prepararFacturacion("CREAR");

  if (!b.ok) return b.respuesta;

  const { id } = await contexto.params;

  try {
    await reconciliarNcePendientes(b.db, b.empresaId, b.usuarioId, id);

    const fe = await leerFacturaOriginal(b.db, b.empresaId, b.usuarioId, id);
    const { receptor, ...visible } = fe;
    // Solo un indicador booleano derivado del dato fiscal estructurado del snapshot (iTipIDRec = 5, Innominado); el receptor completo nunca sale del servidor.
    const receptorInnominado = receptorEsInnominado(receptor);

    return NextResponse.json({ factura: { ...visible, receptorInnominado }, sucursales: await puntosParaNce(b.db, b.empresaId, b.usuarioId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return respuestaErrorFacturacion(error, "cargar");
  }
}
