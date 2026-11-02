import { NextResponse } from "next/server";

import { enviarDocumento } from "@/lib/facturacion/envio";
import { prepararFacturacion } from "@/lib/facturacion/servidor";
import { leerDocumento, listarIntentos, respuestaErrorFacturacion } from "@/lib/facturacion/shared";

type Contexto = { params: Promise<{ id: string }> };

// Envía un documento YA creado que quedó pendiente o con error de envío (FACTURACION_ELECTRONICA.CREAR). No crea documento ni consume numeración; un envío
// indeterminado se rechaza hasta reconciliarlo. El documento debe estar en el alcance de sucursales del usuario.
export async function POST(request: Request, contexto: Contexto) {
  const b = await prepararFacturacion("CREAR");

  if (!b.ok) return b.respuesta;

  const { id } = await contexto.params;

  try {
    if (!(await leerDocumento(b.db, b.empresaId, b.usuarioId, id))) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });

    // Solo un rechazo por validación del gateway exige confirmación explícita del reenvío (mismo documento y número).
    const cuerpo = (await request.json().catch(() => ({}))) as { confirmarRechazo?: unknown };
    const r = await enviarDocumento(b.db, b.empresaId, b.usuarioId, id, {}, { confirmaRechazo: cuerpo.confirmarRechazo === true });

    return NextResponse.json({ ...r, documentoId: id, documento: await leerDocumento(b.db, b.empresaId, b.usuarioId, id), intentos: await listarIntentos(b.db, b.empresaId, id) });
  } catch (error) {
    return respuestaErrorFacturacion(error, "enviar");
  }
}
