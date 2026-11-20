import { NextResponse } from "next/server";

import { UUID } from "@/lib/usuarios/paginacion";
import { prepararAdminEmpresa, respuestaErrorUsuarios } from "@/lib/usuarios/servidor";

type Contexto = { params: Promise<{ id: string }> };

// Activa o desactiva (bloquea) a un usuario de la empresa. Desactivar revoca sus sesiones; no se puede desactivar a uno mismo ni al último administrador.
export async function POST(request: Request, contexto: Contexto) {
  const b = await prepararAdminEmpresa();

  if (!b.ok) return b.respuesta;

  const { id } = await contexto.params;
  let cuerpo: Record<string, unknown>;

  try {
    cuerpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }
  if (!UUID.test(id) || typeof cuerpo?.activo !== "boolean") return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });

  try {
    await b.db.query("SELECT usr_cambiar_estado($1::uuid, $2::uuid, $3::uuid, $4::boolean)", [b.empresaId, b.actorId, id, cuerpo.activo]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return respuestaErrorUsuarios(error);
  }
}
