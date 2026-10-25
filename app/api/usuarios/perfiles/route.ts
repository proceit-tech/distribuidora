import { NextResponse } from "next/server";

import { prepararAdminEmpresa, respuestaErrorUsuarios } from "@/lib/usuarios/servidor";

// Catálogo de los nueve perfiles predefinidos (comunes a todas las empresas). El administrador solo los asigna o retira; no hay creación ni edición de perfiles.
export async function GET() {
  const b = await prepararAdminEmpresa();

  if (!b.ok) return b.respuesta;

  try {
    const r = await b.db.query("SELECT o_id AS id, o_codigo AS codigo, o_nombre AS nombre FROM usr_perfiles_catalogo($1::uuid, $2::uuid)", [b.empresaId, b.actorId]);

    return NextResponse.json({ perfiles: r.rows });
  } catch (error) {
    return respuestaErrorUsuarios(error);
  }
}
