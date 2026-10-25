import { NextResponse } from "next/server";

import { leerCodigos, UUID } from "@/lib/usuarios/paginacion";
import { prepararAdminEmpresa, respuestaErrorUsuarios } from "@/lib/usuarios/servidor";

type Contexto = { params: Promise<{ id: string }> };

// Asigna el conjunto de perfiles predefinidos del usuario (agrega y retira dentro del catálogo; varios a la vez). Protege al último administrador y revoca las sesiones del usuario.
export async function PUT(request: Request, contexto: Contexto) {
  const b = await prepararAdminEmpresa();

  if (!b.ok) return b.respuesta;

  const { id } = await contexto.params;
  let cuerpo: Record<string, unknown>;

  try {
    cuerpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }

  const perfiles = leerCodigos(cuerpo?.perfiles);

  if (!UUID.test(id) || perfiles === null) return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });

  try {
    await b.db.query("SELECT usr_asignar_perfiles($1::uuid, $2::uuid, $3::uuid, $4::text[])", [b.empresaId, b.actorId, id, perfiles]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return respuestaErrorUsuarios(error);
  }
}
