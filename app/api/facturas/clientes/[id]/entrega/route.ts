import { NextResponse } from "next/server";

import { opcionesEntrega } from "@/lib/facturacion/entrega";
import { prepararFacturacion } from "@/lib/facturacion/servidor";
import { respuestaErrorFacturacion } from "@/lib/facturacion/shared";

type Contexto = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Direcciones de entrega ya registradas del cliente (E04). empresa y usuario salen de la SESIÓN; un cliente de otra empresa o sin destinos devuelve lista vacía (sin filtrar información). Solo lectura.
export async function GET(_request: Request, contexto: Contexto) {
  const b = await prepararFacturacion("CREAR");

  if (!b.ok) return b.respuesta;

  const { id } = await contexto.params;

  if (!UUID.test(id)) return NextResponse.json({ error: "Cliente no válido." }, { status: 400 });

  try {
    return NextResponse.json({ opciones: await opcionesEntrega(b.db, b.empresaId, b.usuarioId, id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return respuestaErrorFacturacion(error, "cargar las direcciones de entrega del");
  }
}
