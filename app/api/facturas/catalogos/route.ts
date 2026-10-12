import { NextResponse } from "next/server";

import { catalogosFactura, permisoPrecio } from "@/lib/facturacion/emision";
import { INDICADORES_PRESENCIA, FORMAS_PAGO, TIPOS_TRANSACCION } from "@/lib/facturacion/payload-fe";
import { prepararFacturacion } from "@/lib/facturacion/servidor";
import { respuestaErrorFacturacion } from "@/lib/facturacion/shared";

// Sucursales (en el alcance del usuario, activas y con establecimiento SIFEN) con sus puntos de expedición activos, y las opciones fiscales del formulario.
export async function GET() {
  const b = await prepararFacturacion("CREAR");

  if (!b.ok) return b.respuesta;

  try {
    return NextResponse.json({ ...(await catalogosFactura(b.db, b.empresaId, b.usuarioId)), puedeEditarPrecio: await permisoPrecio(b.db, b.empresaId, b.usuarioId), opciones: { tiposTransaccion: TIPOS_TRANSACCION, presencias: INDICADORES_PRESENCIA, formasPago: FORMAS_PAGO } });
  } catch (error) {
    return respuestaErrorFacturacion(error, "cargar los catálogos del");
  }
}
