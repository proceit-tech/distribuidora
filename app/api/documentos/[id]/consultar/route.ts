import { NextResponse } from "next/server";

import { prepararFacturacion } from "@/lib/facturacion/servidor";
import { consultarEstado, leerDocumento, listarIntentos, respuestaErrorFacturacion } from "@/lib/facturacion/shared";

type Contexto = { params: Promise<{ id: string }> };

// Reconsulta explícita del estado en el gateway (FACTURACION_ELECTRONICA.EDITAR). Solo lectura en el gateway: repetirla no duplica ningún documento.
export async function POST(_request: Request, contexto: Contexto) {
  const b = await prepararFacturacion("EDITAR");

  if (!b.ok) return b.respuesta;

  const { id } = await contexto.params;

  try {
    const r = await consultarEstado(b.db, b.empresaId, b.usuarioId, id);
    const documento = await leerDocumento(b.db, b.empresaId, b.usuarioId, id);

    // PRO-342-R02: modo de registro (INTEGRAL con NEX-079 / COMPATIBILIDAD sin ella) y continuidad de la conexión con la del envío, para que la pantalla no presente un modo degradado como integral.
    return NextResponse.json({ resultado: r.resultado, mensaje: r.mensaje, modoRegistro: r.modoRegistro, continuidadConexion: r.continuidadConexion, documento, intentos: await listarIntentos(b.db, b.empresaId, id) });
  } catch (error) {
    return respuestaErrorFacturacion(error, "consultar");
  }
}
