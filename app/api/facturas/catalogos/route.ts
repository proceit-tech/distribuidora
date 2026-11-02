import { NextResponse } from "next/server";

import { permisoAjusteFiscal, permisoEditarProductos } from "@/lib/facturacion/ajuste-fiscal";
import { catalogosFactura, permisoPrecio } from "@/lib/facturacion/emision";
import { estadoGateway } from "@/lib/facturacion/envio";
import { permisoPuntos } from "@/lib/facturacion/puntos";
import { CONDICIONES_OPERACION, INDICADORES_PRESENCIA, FORMAS_PAGO, CATALOGO_TIPOS_TRANSACCION, SOPORTE_TIPO_TRANSACCION } from "@/lib/facturacion/payload-fe";
import { prepararFacturacion } from "@/lib/facturacion/servidor";
import { respuestaErrorFacturacion } from "@/lib/facturacion/shared";

// Sucursales (en el alcance del usuario, activas y con establecimiento SIFEN) con sus puntos de expedición activos, y las opciones fiscales del formulario.
export async function GET() {
  const b = await prepararFacturacion("CREAR");

  if (!b.ok) return b.respuesta;

  try {
    return NextResponse.json({ ...(await catalogosFactura(b.db, b.empresaId, b.usuarioId)), gateway: await estadoGateway(b.db, b.empresaId), puedeEditarPrecio: await permisoPrecio(b.db, b.empresaId, b.usuarioId), puedeAjustarFiscal: await permisoAjusteFiscal(b.db, b.empresaId, b.usuarioId), puedeEditarProductos: await permisoEditarProductos(b.db, b.empresaId, b.usuarioId), puedeGestionarPuntos: await permisoPuntos(b.db, b.empresaId, b.usuarioId), opciones: { condiciones: CONDICIONES_OPERACION, tiposTransaccion: CATALOGO_TIPOS_TRANSACCION, soporteTipoTransaccion: SOPORTE_TIPO_TRANSACCION, presencias: INDICADORES_PRESENCIA, formasPago: FORMAS_PAGO } });
  } catch (error) {
    return respuestaErrorFacturacion(error, "cargar los catálogos del");
  }
}
