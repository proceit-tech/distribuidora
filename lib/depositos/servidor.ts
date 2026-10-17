import { NextResponse } from "next/server";

/**
 * Preparación común de las APIs de Depósitos: sesión + permiso INVENTARIO.<acción>. empresa_id y usuario salen SIEMPRE de la sesión, nunca del
 * cuerpo. Los permisos devueltos solo sirven para mostrar u ocultar acciones; cada API y cada función SQL vuelven a verificar el suyo.
 */

const DEMO_MODE = process.env.DEMO_MODE === "true";

export type Base =
  | { ok: true; empresaId: string; usuarioId: string; db: typeof import("@/lib/db")["db"]; permisos: { crear: boolean; editar: boolean; stock: boolean } }
  | { ok: false; respuesta: NextResponse };

export async function prepararDepositos(accion: "VER" | "CREAR" | "EDITAR"): Promise<Base> {
  if (!DEMO_MODE && !process.env.DATABASE_URL) {
    return { ok: false, respuesta: NextResponse.json({ error: "Servicio no disponible: base de datos no configurada." }, { status: 503 }) };
  }
  if (DEMO_MODE) {
    return accion === "VER"
      ? { ok: false, respuesta: NextResponse.json({ depositos: [], sucursales: [], permisos: { crear: false, editar: false }, demo: true }) }
      : { ok: false, respuesta: NextResponse.json({ error: "Operación no disponible en modo demo." }, { status: 400 }) };
  }

  const { getCurrentSession } = await import("@/lib/auth/session");
  const { denyIfNoPermission, getAccessContext, hasPermission } = await import("@/lib/auth/permissions");
  const session = await getCurrentSession();

  if (!session) return { ok: false, respuesta: NextResponse.json({ error: "Sesión no válida." }, { status: 401 }) };

  const denegado = await denyIfNoPermission(session, "INVENTARIO", accion);

  if (denegado) return { ok: false, respuesta: denegado };

  const acceso = await getAccessContext(session.user, session.demo === true);
  const { db } = await import("@/lib/db");

  return {
    ok: true,
    empresaId: session.user.empresaId,
    usuarioId: session.user.id,
    db,
    permisos: { crear: hasPermission(acceso, "INVENTARIO", "CREAR"), editar: hasPermission(acceso, "INVENTARIO", "EDITAR"), stock: hasPermission(acceso, "STOCK", "VER") },
  };
}

export async function leerCuerpo(request: Request): Promise<Record<string, unknown> | NextResponse> {
  try {
    const c = await request.json();

    if (c && typeof c === "object" && !Array.isArray(c)) return c as Record<string, unknown>;
  } catch {
    // cae al error común
  }

  return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
}

export const textoCuerpo = (v: unknown) => (typeof v === "string" ? v : "");
