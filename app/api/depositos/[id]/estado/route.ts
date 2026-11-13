import { NextResponse } from "next/server";

import { leerCuerpo, prepararDepositos } from "@/lib/depositos/servidor";
import { enTransaccion, esUuid, leerDeposito, respuestaErrorDeposito } from "@/lib/depositos/shared";

type Contexto = { params: Promise<{ id: string }> };

// Activar / inactivar (INVENTARIO.EDITAR). Nunca se elimina. Inactivar con saldo lo rechaza deposito_cambiar_estado.
export async function POST(request: Request, contexto: Contexto) {
  const cuerpo = await leerCuerpo(request);

  if (cuerpo instanceof NextResponse) return cuerpo;

  const b = await prepararDepositos("EDITAR");

  if (!b.ok) return b.respuesta;

  const { id } = await contexto.params;

  if (!esUuid(id)) return NextResponse.json({ error: "Depósito no encontrado." }, { status: 404 });
  if (typeof cuerpo.activo !== "boolean") return NextResponse.json({ error: "Indique el estado del depósito." }, { status: 400 });

  try {
    await enTransaccion(b.db, (c) => c.query(`SELECT public.deposito_cambiar_estado($1::uuid, $2::uuid, $3::uuid, $4::boolean)`, [b.empresaId, b.usuarioId, id, cuerpo.activo]));

    return NextResponse.json({ message: cuerpo.activo ? "Depósito activado." : "Depósito inactivado.", deposito: await leerDeposito(b.db, b.empresaId, b.usuarioId, id) });
  } catch (error) {
    return respuestaErrorDeposito(error, "cambiar el estado del");
  }
}
