import { NextResponse } from "next/server";

/**
 * Preparación común de las APIs de Facturación: sesión + permiso FACTURACION_ELECTRONICA.<acción>. empresa_id y usuario salen SIEMPRE de la sesión.
 * Los permisos devueltos solo sirven para mostrar u ocultar acciones; la función SQL vuelve a verificar el suyo.
 */

const DEMO_MODE = process.env.DEMO_MODE === "true";

export type Base =
  | { ok: true; empresaId: string; usuarioId: string; db: typeof import("@/lib/db")["db"]; permisos: { editar: boolean; crear: boolean } }
  | { ok: false; respuesta: NextResponse };

export async function prepararFacturacion(accion: "VER" | "EDITAR" | "CREAR" | "PUNTOS" | "CONFIGURAR"): Promise<Base> {
  if (!DEMO_MODE && !process.env.DATABASE_URL) {
    return { ok: false, respuesta: NextResponse.json({ error: "Servicio no disponible: base de datos no configurada." }, { status: 503 }) };
  }
  if (DEMO_MODE) {
    return accion === "VER"
      ? { ok: false, respuesta: NextResponse.json({ documentos: [], demo: true, permisos: { editar: false, crear: false } }) }
      : { ok: false, respuesta: NextResponse.json({ error: "Operación no disponible en modo demo." }, { status: 400 }) };
  }

  const { getCurrentSession } = await import("@/lib/auth/session");
  const { denyIfNoPermission, getAccessContext, hasPermission } = await import("@/lib/auth/permissions");
  const session = await getCurrentSession();

  if (!session) return { ok: false, respuesta: NextResponse.json({ error: "Sesión no válida." }, { status: 401 }) };

  const denegado = await denyIfNoPermission(session, "FACTURACION_ELECTRONICA", accion);

  if (denegado) return { ok: false, respuesta: denegado };

  const acceso = await getAccessContext(session.user, session.demo === true);
  const { db } = await import("@/lib/db");

  return { ok: true, empresaId: session.user.empresaId, usuarioId: session.user.id, db, permisos: { editar: hasPermission(acceso, "FACTURACION_ELECTRONICA", "EDITAR"), crear: hasPermission(acceso, "FACTURACION_ELECTRONICA", "CREAR") } };
}
