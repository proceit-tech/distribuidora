import { NextResponse } from "next/server";

import { prepararDepositos } from "@/lib/depositos/servidor";
import { esUuid, leerDeposito, listarEventosAcceso, respuestaErrorDeposito } from "@/lib/depositos/shared";

type Contexto = { params: Promise<{ id: string }> };

// Historial de atribuciones y revocaciones del depósito (auditoría de solo altas). Mismo control que administrar el acceso: INVENTARIO.EDITAR y depósito
// dentro del alcance de quien consulta; fuera del alcance = 404. empresa_id y usuario salen de la sesión.
export async function GET(_request: Request, contexto: Contexto) {
  const b = await prepararDepositos("EDITAR");

  if (!b.ok) return b.respuesta;

  const { id } = await contexto.params;

  if (!esUuid(id) || !(await leerDeposito(b.db, b.empresaId, b.usuarioId, id))) return NextResponse.json({ error: "Depósito no encontrado." }, { status: 404 });

  try {
    return NextResponse.json({ eventos: await listarEventosAcceso(b.db, b.empresaId, b.usuarioId, id) });
  } catch (error) {
    return respuestaErrorDeposito(error, "cargar el historial de acceso del");
  }
}
