import { NextResponse } from "next/server";

import { prepararDepositos } from "@/lib/depositos/servidor";
import { enTransaccion, esUuid, listarUsuariosDeposito, respuestaErrorDeposito } from "@/lib/depositos/shared";

type Contexto = { params: Promise<{ id: string; usuarioId: string }> };

// Revoca la autorización de un usuario en el depósito (INVENTARIO.EDITAR). Solo borra el vínculo usuario_deposito: no toca movimientos, saldos ni costos,
// ni cambia el alcance general ni el perfil del usuario.
export async function DELETE(_request: Request, contexto: Contexto) {
  const b = await prepararDepositos("EDITAR");

  if (!b.ok) return b.respuesta;

  const { id, usuarioId } = await contexto.params;

  if (!esUuid(id) || !esUuid(usuarioId)) return NextResponse.json({ error: "Depósito o usuario no encontrado." }, { status: 404 });

  try {
    await enTransaccion(b.db, (c) => c.query(`SELECT public.deposito_usuario_revocar($1::uuid, $2::uuid, $3::uuid, $4::uuid)`, [b.empresaId, b.usuarioId, id, usuarioId]));

    return NextResponse.json({ message: "Autorización revocada.", usuarios: await listarUsuariosDeposito(b.db, b.empresaId, b.usuarioId, id) });
  } catch (error) {
    return respuestaErrorDeposito(error, "revocar la autorización en el");
  }
}
