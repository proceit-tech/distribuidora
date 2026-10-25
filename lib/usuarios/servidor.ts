import { NextResponse } from "next/server";

/**
 * Preparación común de las APIs de administración de usuarios de la EMPRESA: sesión + administrador de empresa (RN-08/RN-16). empresa_id y usuario salen SIEMPRE de la sesión; un administrador de plataforma (MASTER)
 * no es un usuario empresarial y no pasa. Las funciones SQL (usr_*) vuelven a verificar al actor.
 */
export type BaseAdmin =
  | { ok: true; empresaId: string; actorId: string; db: typeof import("@/lib/db")["db"] }
  | { ok: false; respuesta: NextResponse };

export async function prepararAdminEmpresa(): Promise<BaseAdmin> {
  if (process.env.DEMO_MODE === "true" || !process.env.DATABASE_URL) {
    return { ok: false, respuesta: NextResponse.json({ error: "Servicio no disponible: base de datos no configurada." }, { status: 503 }) };
  }

  const { getCurrentSession } = await import("@/lib/auth/session");
  const { getAccessContext } = await import("@/lib/auth/permissions");
  const session = await getCurrentSession();

  if (!session) return { ok: false, respuesta: NextResponse.json({ error: "Sesión no válida." }, { status: 401 }) };

  const acceso = await getAccessContext(session.user, session.demo === true);

  if (acceso.isPlatformAdmin || !acceso.isCompanyAdmin) return { ok: false, respuesta: NextResponse.json({ error: "Solo el administrador de la empresa puede gestionar usuarios y perfiles." }, { status: 403 }) };

  const { db } = await import("@/lib/db");

  return { ok: true, empresaId: session.user.empresaId, actorId: session.user.id, db };
}

const MENSAJES: Record<string, string> = {
  "NEX:USUARIO_DUPLICADO": "Ya existe un usuario con ese nombre en la empresa.",
  "NEX:USUARIO_NO_ENCONTRADO": "El usuario no existe en la empresa.",
  "NEX:ULTIMO_ADMIN": "La empresa quedaría sin un administrador activo: asigne antes el perfil de administrador a otro usuario.",
  "NEX:AUTODESACTIVACION": "No puede desactivar su propio usuario.",
  "NEX:USUARIO_BAJA": "Un usuario dado de baja no se puede reactivar.",
  "NEX:PERFIL_INVALIDO": "Alguno de los perfiles no pertenece al catálogo de la empresa.",
  "NEX:ALCANCE_TOTAL": "El usuario tiene alcance total (todas las sucursales y depósitos) y no se modifica desde aquí.",
  "NEX:ALCANCE_INVALIDO": "Alguna sucursal o depósito no existe en la empresa o está inactivo.",
  "NEX:PERFIL_CONFLICTO": "La empresa tiene un perfil heredado que impide completar el catálogo de perfiles. Contacte al soporte.",
};

/** Errores de las funciones usr_* → respuesta HTTP clara (P0001 con detalle NEX:* → 422/409, 42501 → 403; lo demás, 500 genérico sin detalles internos). */
export function respuestaErrorUsuarios(error: unknown): NextResponse {
  const e = error as { code?: string; detail?: string; message?: string };

  if (e.code === "42501") return NextResponse.json({ error: "Solo el administrador de la empresa puede gestionar usuarios y perfiles." }, { status: 403 });
  if (e.code === "P0001" && e.detail?.startsWith("NEX:")) {
    const estado = e.detail === "NEX:USUARIO_DUPLICADO" || e.detail === "NEX:ULTIMO_ADMIN" ? 409 : 422;
    const texto = MENSAJES[e.detail] ?? (e.message ? e.message.charAt(0).toUpperCase() + e.message.slice(1) + "." : "La operación no es válida.");

    return NextResponse.json({ error: texto }, { status: estado });
  }
  if (e.code === "42883" || e.code === "42P01") return NextResponse.json({ error: "La administración de usuarios requiere la migración NEX-074 en la base de datos (aún no aplicada)." }, { status: 503 });

  return NextResponse.json({ error: "No fue posible completar la operación." }, { status: 500 });
}
