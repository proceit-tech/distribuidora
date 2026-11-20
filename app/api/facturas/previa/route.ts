import { NextResponse } from "next/server";

import { leerCuerpoFactura, prepararFactura } from "@/lib/facturacion/emision";
import { mensajePlanNoEmitible, planificarStockConPolitica, resumenStockPolitica } from "@/lib/facturacion/politica-stock";
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
    // PRO-354-R02: si la política de la EMPRESA (leída de la base) permite facturar con stock insuficiente, la revisión muestra la salida inmediata y el faltante pendiente por depósito.
    const plan = await planificarStockConPolitica(b.db, b.empresaId, b.usuarioId, datos.sucursalId, lineasStock, datos.depositosPendiente ?? {});

    if (!plan.emitible) throw new ErrorFacturacion(409, mensajePlanNoEmitible(plan));

    return NextResponse.json({ resumen: plan.lineas.length > 0 ? { ...resumen, stock: resumenStockPolitica(plan) } : resumen });
  } catch (error) {
    return respuestaErrorFacturacion(error, "revisar");
  }
}
