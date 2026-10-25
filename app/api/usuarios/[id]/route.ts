import { NextResponse } from "next/server";

import { UUID } from "@/lib/usuarios/paginacion";
import { prepararAdminEmpresa, respuestaErrorUsuarios } from "@/lib/usuarios/servidor";

type Contexto = { params: Promise<{ id: string }> };

// Edición de los datos autorizados del usuario (nombre, apellido, correo). El nombre de usuario y la contraseña no se cambian aquí.
export async function PATCH(request: Request, contexto: Contexto) {
  const b = await prepararAdminEmpresa();

  if (!b.ok) return b.respuesta;

  const { id } = await contexto.params;
  let cuerpo: Record<string, unknown>;

  try {
    cuerpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }
  if (!UUID.test(id) || !cuerpo || typeof cuerpo !== "object") return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });

  const texto = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : "");

  try {
    await b.db.query("SELECT usr_actualizar($1::uuid, $2::uuid, $3::uuid, $4, $5, $6)", [b.empresaId, b.actorId, id, texto(cuerpo.nombre, 200), texto(cuerpo.apellido, 200), texto(cuerpo.email, 300)]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return respuestaErrorUsuarios(error);
  }
}
