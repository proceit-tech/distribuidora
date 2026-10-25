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

    return NextResponse.json({
      ...(await listarVendedores(db, g.session.user.empresaId, { ...leerPagina(url), estado: estado === "ACTIVO" || estado === "INACTIVO" ? estado : "TODOS" })),
      puedeGestionar: acceso.isCompanyAdmin && !acceso.isPlatformAdmin,
    });
  } catch (error) {
    return respuestaErrorUsuarios(error);
  }
}
