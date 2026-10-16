import { NextResponse } from "next/server";

import { guardarConfiguracion, leerConfiguracion, leerGuardado, respuestaErrorConfiguracion } from "@/lib/facturacion/configuracion-gateway";
import { prepararFacturacion } from "@/lib/facturacion/servidor";

// Configuración del gateway de facturación electrónica de la EMPRESA DE LA SESIÓN (PRO-133): solo con FACTURACION_ELECTRONICA.CONFIGURAR; la función SQL vuelve a verificarlo.
// La respuesta jamás incluye la contraseña de la API: solo si existe una configurada.
export async function GET() {
  const b = await prepararFacturacion("CONFIGURAR");

  if (!b.ok) return b.respuesta;

  try {
    return NextResponse.json(await leerConfiguracion(b.db, b.empresaId, b.usuarioId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return respuestaErrorConfiguracion(error);
  }
}

// Guardar: usuario (RUC) y contraseña; la contraseña en blanco conserva la actual. La empresa sale SIEMPRE de la sesión (cualquier empresa_id enviado se ignora).
export async function PUT(request: Request) {
  const b = await prepararFacturacion("CONFIGURAR");

  if (!b.ok) return b.respuesta;

  let cuerpo: unknown;

  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });

  const datos = leerGuardado(cuerpo as Record<string, unknown>);

  if (typeof datos === "string") return NextResponse.json({ error: datos }, { status: 400 });

  try {
    await guardarConfiguracion(b.db, b.empresaId, b.usuarioId, datos);

    return NextResponse.json(await leerConfiguracion(b.db, b.empresaId, b.usuarioId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return respuestaErrorConfiguracion(error);
  }
}
