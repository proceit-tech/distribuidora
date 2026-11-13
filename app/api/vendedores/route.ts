import { NextResponse } from "next/server";

import { getAccessContext, guardApi } from "@/lib/auth/permissions";
import { leerPagina } from "@/lib/usuarios/paginacion";
import { respuestaErrorUsuarios } from "@/lib/usuarios/servidor";
import { listarVendedores } from "@/lib/usuarios/vendedores";

// Maestros → Vendedores (VENDEDORES.VER): usuarios de la empresa con el perfil Vendedor. Solo lectura; el alta y los cambios los hace el administrador de empresa por /api/usuarios.
export async function GET(request: Request) {
  if (process.env.DEMO_MODE === "true" || !process.env.DATABASE_URL) return NextResponse.json({ error: "Servicio no disponible: base de datos no configurada." }, { status: 503 });

  const g = await guardApi("VENDEDORES", "VER");

  if (!g.ok) return g.response;

  const url = new URL(request.url);
  const estado = url.searchParams.get("estado");

  try {
    const { db } = await import("@/lib/db");
    const acceso = await getAccessContext(g.session.user, g.session.demo === true);

    // CI, correo y teléfono solo para el administrador de la empresa; quien solo tiene VENDEDORES.VER ve usuario, nombre y situación.
    const gestor = acceso.isCompanyAdmin && !acceso.isPlatformAdmin;
    const r = await listarVendedores(db, g.session.user.empresaId, { ...leerPagina(url), estado: estado === "ACTIVO" || estado === "INACTIVO" ? estado : "TODOS" }, gestor);

    return NextResponse.json({ ...r, vendedores: gestor ? r.vendedores : r.vendedores.map((v) => ({ id: v.id, usuario: v.usuario, nombre: v.nombre, apellido: v.apellido, nombreCompleto: v.nombreCompleto, estado: v.estado, activo: v.activo })), puedeGestionar: gestor });
  } catch (error) {
    return respuestaErrorUsuarios(error);
  }
}
