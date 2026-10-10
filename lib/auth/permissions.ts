import "server-only";

import { NextResponse } from "next/server";
import { notFound, redirect } from "next/navigation";

import { getCurrentSession, isDemoMode } from "@/lib/auth/session";
import type { AuthSession, AuthUser } from "@/types/auth";

export type AccessContext = {
  /** Códigos RECURSO.ACCION concedidos por los perfiles activos del usuario. */
  permissions: string[];
  /** Algún perfil activo es administrador de la empresa (pasa todas las acciones operacionales). */
  isCompanyAdmin: boolean;
  /** Administrador global de plataforma (tabla administradores_plataforma, solo PROCEIT). */
  isPlatformAdmin: boolean;
};

type AccessRow = {
  es_admin: boolean;
  codigos: string[];
  plataforma: boolean;
};

/**
 * Carga permisos reales desde PostgreSQL. Siempre filtra por la empresa de la sesión.
 * En modo DEMO explícito (DEMO_MODE=true) concede acceso operacional completo, nunca global.
 */
export async function getAccessContext(
  user: AuthUser,
  demo = false,
): Promise<AccessContext> {
  if (demo || isDemoMode()) {
    return { permissions: [], isCompanyAdmin: true, isPlatformAdmin: false };
  }

  const { db } = await import("@/lib/db");
  const result = await db.query<AccessRow>(
    `SELECT COALESCE(bool_or(pf.es_administrador), false) AS es_admin,
            COALESCE(array_agg(DISTINCT pe.codigo) FILTER (WHERE pe.codigo IS NOT NULL), '{}') AS codigos,
            EXISTS (
              SELECT 1
                FROM administradores_plataforma ap
                JOIN empresas e ON e.id = ap.empresa_id
               WHERE ap.usuario_id = u.id AND ap.empresa_id = u.empresa_id
                 AND ap.activo AND e.estado = 'ACTIVA' AND NOT e.es_demo
            ) AS plataforma
       FROM usuarios u
       LEFT JOIN usuario_perfil up
              ON up.usuario_id = u.id AND up.empresa_id = u.empresa_id
       LEFT JOIN perfiles pf
              ON pf.id = up.perfil_id AND pf.empresa_id = u.empresa_id AND pf.activo
       LEFT JOIN perfil_permiso pp
              ON pp.perfil_id = pf.id AND pp.empresa_id = pf.empresa_id
       LEFT JOIN permisos pe ON pe.id = pp.permiso_id
      WHERE u.id = $1 AND u.empresa_id = $2 AND u.estado = 'ACTIVO'
      GROUP BY u.id, u.empresa_id`,
    [user.id, user.empresaId],
  );

  const row = result.rows[0];
  if (!row) {
    return { permissions: [], isCompanyAdmin: false, isPlatformAdmin: false };
  }
  return {
    permissions: row.codigos,
    isCompanyAdmin: row.es_admin,
    isPlatformAdmin: row.plataforma,
  };
}

export function hasPermission(
  access: AccessContext,
  recurso: string,
  accion: string,
) {
  return (
    access.isCompanyAdmin ||
    access.permissions.includes(`${recurso}.${accion}`.toUpperCase())
  );
}

/** Compatibilidad con el código existente. */
export async function userHasPermission(
  user: AuthUser,
  recurso: string,
  accion: string,
) {
  return hasPermission(await getAccessContext(user), recurso, accion);
}

type ApiGuard =
  | { ok: true; session: AuthSession; access: AccessContext }
  | { ok: false; response: NextResponse };

/** Para rutas API: 401 sin sesión, 403 sin permiso. La empresa siempre sale de la sesión. */
export async function guardApi(
  recurso: string,
  accion: string,
): Promise<ApiGuard> {
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Sesión no válida." }, { status: 401 }),
    };
  }
  const access = await getAccessContext(session.user, session.demo === true);
  if (!hasPermission(access, recurso, accion)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "No tiene permiso para esta acción." },
        { status: 403 },
      ),
    };
  }
  return { ok: true, session, access };
}

/** Para páginas del servidor (layouts de módulo): redirige a /login o responde 404. */
export async function guardPage(recurso: string, accion = "VER") {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const access = await getAccessContext(session.user, session.demo === true);
  if (!hasPermission(access, recurso, accion)) notFound();
  return { session, access };
}

export async function guardPlatformPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const access = await getAccessContext(session.user, session.demo === true);
  if (!access.isPlatformAdmin) notFound();
  return { session, access };
}

/** Atajo para rutas API que ya validaron la sesión: devuelve 403 o null. */
export async function denyIfNoPermission(
  session: AuthSession,
  recurso: string,
  accion: string,
): Promise<NextResponse | null> {
  const access = await getAccessContext(session.user, session.demo === true);
  if (hasPermission(access, recurso, accion)) return null;
  return NextResponse.json(
    { error: "No tiene permiso para esta acción." },
    { status: 403 },
  );
}
