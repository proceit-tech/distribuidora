import { NextResponse } from "next/server";

import { prepararFacturacion } from "@/lib/facturacion/servidor";
import { leerFacturaOriginal, puntosParaNce } from "@/lib/facturacion/nce";
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
    const { receptor: _receptor, ...visible } = fe;

    void _receptor;

    return NextResponse.json({ factura: visible, sucursales: await puntosParaNce(b.db, b.empresaId, b.usuarioId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return respuestaErrorFacturacion(error, "cargar");
  }
}
