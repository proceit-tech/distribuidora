import { NextResponse } from "next/server";

import { UUID } from "@/lib/usuarios/paginacion";
import { prepararAdminEmpresa, respuestaErrorUsuarios } from "@/lib/usuarios/servidor";
import { validarDatosUsuario } from "@/lib/usuarios/validacion";

type Contexto = { params: Promise<{ id: string }> };

// Edición de los datos del usuario (nombre, apellido, CI, correo, teléfono; todos obligatorios). No cambia el ID interno, el nombre de usuario, la contraseña, los perfiles, el estado ni el alcance (tienen sus propias acciones).
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

  const datos = validarDatosUsuario(cuerpo);

  if (!datos.ok) return NextResponse.json({ error: Object.values(datos.errores)[0], campos: datos.errores }, { status: 422 });

  try {
    await b.db.query("SELECT usr_actualizar($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8)", [b.empresaId, b.actorId, id, datos.datos.nombre, datos.datos.apellido, datos.datos.ci, datos.datos.email, datos.datos.telefono]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return respuestaErrorUsuarios(error);
  }
}
