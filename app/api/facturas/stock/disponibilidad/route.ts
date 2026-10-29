import { NextResponse } from "next/server";

import { prepararFacturacion } from "@/lib/facturacion/servidor";
import { ErrorFacturacion, respuestaErrorFacturacion } from "@/lib/facturacion/shared";
import { consultarDisponibilidadEnLotes, evaluarDisponibilidadPreventiva } from "@/lib/facturacion/stock-fe";
import { LIMITE_CUERPO_DISPONIBILIDAD, leerSolicitudDisponibilidad, lineasParaStock, productosParaStock, sucursalParaStock } from "@/lib/facturacion/stock-preventivo";

const SIN_CACHE = { "Cache-Control": "no-store" };
const json = (cuerpo: unknown, status = 200) => NextResponse.json(cuerpo, { status, headers: SIN_CACHE });
const sinCache = (r: NextResponse) => {
  r.headers.set("Cache-Control", "no-store");

  return r;
};

// PRO-330: verificación ANTICIPADA de stock al cargar líneas de «Nueva factura». SOLO LECTURA: no escribe, no reserva, no numera y no firma reparto; la previa y la emisión revalidan todo.
// Empresa y usuario salen de la sesión; sucursal, productos y `controla_stock` se leen de la base. Responde solo requerido/disponible/faltante por producto (sin depósitos, lotes ni costos).
export async function POST(request: Request) {
  const b = await prepararFacturacion("CREAR");

  if (!b.ok) return sinCache(b.respuesta);

  let cuerpo: unknown;

  try {
    const texto = await request.text();

    if (texto.length > LIMITE_CUERPO_DISPONIBILIDAD) return json({ error: "La solicitud es demasiado grande." }, 400);
    cuerpo = JSON.parse(texto);
  } catch {
    return json({ error: "Los datos enviados no son válidos." }, 400);
  }

  const solicitud = leerSolicitudDisponibilidad(cuerpo);

  if (typeof solicitud === "string") return json({ error: solicitud }, 400);
  // Sin líneas: nada que verificar (la pantalla limpia el estado), sin consultas.
  if (solicitud.lineas.length === 0) return json({ sucursalId: solicitud.sucursalId, suficiente: true, productos: [] });

  try {
    if (!(await sucursalParaStock(b.db, b.empresaId, b.usuarioId, solicitud.sucursalId))) throw new ErrorFacturacion(403, "La sucursal elegida no está disponible para su usuario.");

    const lineas = lineasParaStock(solicitud, await productosParaStock(b.db, b.empresaId, solicitud.lineas.map((l) => l.productoId)));

    if (!lineas) throw new ErrorFacturacion(422, "Uno o más ítems no se pueden facturar. Quítelos de la factura y vuelva a buscarlos.");

    // Solo los productos que controlan stock (según la base) consultan saldo, en tandas de ≤ 500 UUID; los servicios quedan SIN_CONTROL.
    const saldos = await consultarDisponibilidadEnLotes(b.db, b.empresaId, b.usuarioId, solicitud.sucursalId, lineas.filter((l) => l.controlaStock).map((l) => l.productoId));

    return json({ sucursalId: solicitud.sucursalId, ...evaluarDisponibilidadPreventiva(lineas, saldos) });
  } catch (error) {
    if (error instanceof ErrorFacturacion || (error as { code?: string }).code === "42501") return sinCache(respuestaErrorFacturacion(error, "verificar el stock del"));
    console.error("Error al verificar el stock de la factura:", error);

    // Error técnico: distinto de una insuficiencia verdadera (la pantalla muestra «No se pudo verificar el stock» y permite reintentar).
    return json({ error: "No se pudo verificar el stock en este momento. Reintente." }, 503);
  }
}
