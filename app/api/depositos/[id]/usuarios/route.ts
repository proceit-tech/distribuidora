import { NextResponse } from "next/server";

import { leerCuerpo, prepararDepositos } from "@/lib/depositos/servidor";
import { enTransaccion, esUuid, leerDeposito, listarUsuariosDeposito, respuestaErrorDeposito } from "@/lib/depositos/shared";

type Contexto = { params: Promise<{ id: string }> };

const noEncontrado = () => NextResponse.json({ error: "Depósito no encontrado." }, { status: 404 });

// Usuarios autorizados de un depósito. Administrar el acceso exige INVENTARIO.EDITAR y que el depósito esté en el alcance de quien consulta/modifica.
// GET lista los usuarios de SU empresa; POST atribuye un usuario con alcance «ASIGNADOS» (deposito_usuario_asignar). Revocar: DELETE en [usuarioId].
export async function GET(_request: Request, contexto: Contexto) {
  const b = await prepararDepositos("EDITAR");

  if (!b.ok) return b.respuesta;

  const { id } = await contexto.params;

  if (!esUuid(id) || !(await leerDeposito(b.db, b.empresaId, b.usuarioId, id))) return noEncontrado();

  try {
    return NextResponse.json({ usuarios: await listarUsuariosDeposito(b.db, b.empresaId, b.usuarioId, id) });
  } catch (error) {
    return respuestaErrorDeposito(error, "cargar los usuarios del");
  }
}

export async function POST(request: Request, contexto: Contexto) {
  const cuerpo = await leerCuerpo(request);

  if (cuerpo instanceof NextResponse) return cuerpo;

  const b = await prepararDepositos("EDITAR");

  if (!b.ok) return b.respuesta;

  const { id } = await contexto.params;

  if (!esUuid(id)) return noEncontrado();
  if (!esUuid(cuerpo.usuarioId)) return NextResponse.json({ error: "Seleccione el usuario." }, { status: 400 });

  const usuarioId = cuerpo.usuarioId;

  try {
    await enTransaccion(b.db, (c) => c.query(`SELECT public.deposito_usuario_asignar($1::uuid, $2::uuid, $3::uuid, $4::uuid)`, [b.empresaId, b.usuarioId, id, usuarioId]));

    return NextResponse.json({ message: "Usuario autorizado en el depósito.", usuarios: await listarUsuariosDeposito(b.db, b.empresaId, b.usuarioId, id) });
  } catch (error) {
    return respuestaErrorDeposito(error, "autorizar al usuario en el");
  }
}
