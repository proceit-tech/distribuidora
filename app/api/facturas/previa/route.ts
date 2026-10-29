import { NextResponse } from "next/server";

import { leerCuerpoFactura, prepararFactura } from "@/lib/facturacion/emision";
import { mensajeStockInsuficiente, planificarStock, resumenStock } from "@/lib/facturacion/stock-fe";
import { prepararFacturacion } from "@/lib/facturacion/servidor";
import { ErrorFacturacion, respuestaErrorFacturacion } from "@/lib/facturacion/shared";

// «Grabar»: valida y calcula en el servidor y devuelve el resumen para revisar. NO escribe, NO reserva número y NO transmite nada.
export async function POST(request: Request) {
  const b = await prepararFacturacion("CREAR");

  if (!b.ok) return b.respuesta;

  let cuerpo: unknown;

  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });

  const datos = leerCuerpoFactura(cuerpo as Record<string, unknown>);

  if (typeof datos === "string") return NextResponse.json({ error: datos }, { status: 400 });

  try {
    const { resumen, lineasStock } = await prepararFactura(b.db, b.empresaId, b.usuarioId, datos);
    // E02: el reparto por depósito se calcula y se MUESTRA aquí (sin reservar ni bajar nada); con stock insuficiente la revisión se bloquea.
    const plan = await planificarStock(b.db, b.empresaId, b.usuarioId, datos.sucursalId, lineasStock);

    if (!plan.suficiente) throw new ErrorFacturacion(409, mensajeStockInsuficiente(plan));

    return NextResponse.json({ resumen: plan.lineas.length > 0 ? { ...resumen, stock: resumenStock(plan) } : resumen });
  } catch (error) {
    return respuestaErrorFacturacion(error, "revisar");
  }
}
