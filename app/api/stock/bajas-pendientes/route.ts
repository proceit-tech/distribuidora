import { NextResponse } from "next/server";

import { denyIfNoPermission, getAccessContext, hasPermission } from "@/lib/auth/permissions";
import { errorBajaPendiente, leerFiltrosBajas, listarBajasPendientes, listarFiltrosBajas } from "@/lib/stock/bajas-pendientes";

const DEMO_MODE = process.env.DEMO_MODE === "true";
const SIN_CACHE = { "Cache-Control": "no-store" };

// PRO-354-R02: «Bajas pendientes de stock» (SOLO LECTURA). STOCK.VER; la función SQL vuelve a verificarlo y limita a los depósitos del alcance del usuario.
// R01/F002: página con total y catálogo de filtros (sucursales y depósitos autorizados) que no depende de la página ni del filtro aplicado.
export async function GET(request: Request) {
  if (!DEMO_MODE && !process.env.DATABASE_URL) return NextResponse.json({ error: "Servicio no disponible: base de datos no configurada." }, { status: 503 });
  if (DEMO_MODE) {
    return NextResponse.json({ bajas: [], total: 0, pagina: 1, porPagina: 25, filtros: { sucursales: [], depositos: [] }, permisos: { confirmar: false }, demo: true });
  }

  const { getCurrentSession } = await import("@/lib/auth/session");
  const session = await getCurrentSession();

  if (!session) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });

  const denegado = await denyIfNoPermission(session, "STOCK", "VER");

  if (denegado) return denegado;

  const filtros = leerFiltrosBajas(new URL(request.url).searchParams);

  if (!filtros) return NextResponse.json({ error: "Los filtros no son válidos." }, { status: 400 });

  try {
    const { db } = await import("@/lib/db");
    const pagina = await listarBajasPendientes(db, session.user.empresaId, session.user.id, filtros);
    const catalogo = await listarFiltrosBajas(db, session.user.empresaId, session.user.id);
    // Solo para mostrar u ocultar el botón; la confirmación vuelve a verificar MOVIMIENTOS.CREAR y el alcance.
    const acceso = await getAccessContext(session.user, session.demo === true);

    return NextResponse.json({ ...pagina, filtros: catalogo, permisos: { confirmar: hasPermission(acceso, "MOVIMIENTOS", "CREAR") } }, { headers: SIN_CACHE });
  } catch (error) {
    const e = errorBajaPendiente(error);

    if (e.status === 500) console.error("Error al listar bajas pendientes de stock:", error);

    return NextResponse.json({ error: e.error }, { status: e.status, headers: SIN_CACHE });
  }
}
