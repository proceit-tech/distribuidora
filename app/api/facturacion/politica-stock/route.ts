import { NextResponse } from "next/server";

import { guardarPoliticaStock, leerPoliticaStock } from "@/lib/facturacion/politica-stock";
import { prepararFacturacion } from "@/lib/facturacion/servidor";
import { respuestaErrorFacturacion } from "@/lib/facturacion/shared";

const SIN_CACHE = { "Cache-Control": "no-store" };

// PRO-354-R02: política «Bloquear facturación por stock insuficiente» de la EMPRESA DE LA SESIÓN (no del comprador). Solo con FACTURACION_ELECTRONICA.CONFIGURAR; la función SQL lo vuelve a verificar.
// `soportada: false` = NEX-081 no aplicada (la emisión se comporta como TRUE y el interruptor no se puede cambiar).
export async function GET() {
  const b = await prepararFacturacion("CONFIGURAR");

  if (!b.ok) return b.respuesta;

  try {
    return NextResponse.json(await leerPoliticaStock(b.db, b.empresaId), { headers: SIN_CACHE });
  } catch (error) {
    return respuestaErrorFacturacion(error, "leer la política de stock del");
  }
}

// Cambio: SOLO `{bloquear: boolean}`. La empresa sale SIEMPRE de la sesión (cualquier otro campo, incluido un empresa_id, se rechaza).
export async function PUT(request: Request) {
  const b = await prepararFacturacion("CONFIGURAR");

  if (!b.ok) return b.respuesta;

  let cuerpo: unknown;

  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo) || Object.keys(cuerpo).some((k) => k !== "bloquear") || typeof (cuerpo as { bloquear?: unknown }).bloquear !== "boolean") {
    return NextResponse.json({ error: "Indique si se bloquea la facturación por stock insuficiente." }, { status: 400 });
  }

  try {
    const r = await guardarPoliticaStock(b.db, b.empresaId, b.usuarioId, (cuerpo as { bloquear: boolean }).bloquear);

    return NextResponse.json({ bloquear: r.bloquear, soportada: true, cambio: r.cambio }, { headers: SIN_CACHE });
  } catch (error) {
    return respuestaErrorFacturacion(error, "guardar la política de stock del");
  }
}
