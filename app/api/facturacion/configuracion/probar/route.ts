import { NextResponse } from "next/server";

import { leerPrueba, probarConexion, respuestaErrorConfiguracion } from "@/lib/facturacion/configuracion-gateway";
import { prepararFacturacion } from "@/lib/facturacion/servidor";

// «Probar conexión» (PRO-133): SOLO POST /api/login del gateway con las credenciales informadas o las guardadas. No crea facturas, no reserva numeración, no llama a recepcion_de ni toca documentos.
// Con límite de intentos por empresa. La respuesta trae únicamente el resultado y un mensaje: jamás el token ni la contraseña.
export async function POST(request: Request) {
  const b = await prepararFacturacion("CONFIGURAR");

  if (!b.ok) return b.respuesta;

  let cuerpo: unknown = {};

  try {
    const texto = await request.text();

    cuerpo = texto.trim() === "" ? {} : JSON.parse(texto);
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });

  const datos = leerPrueba(cuerpo as Record<string, unknown>);

  if (typeof datos === "string") return NextResponse.json({ error: datos }, { status: 400 });

  try {
    return NextResponse.json(await probarConexion(b.db, b.empresaId, b.usuarioId, datos), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return respuestaErrorConfiguracion(error);
  }
}
