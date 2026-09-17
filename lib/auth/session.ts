import "server-only";

import { randomBytes, randomUUID } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import type { AuthSession } from "@/types/auth";

const COOKIE_NAME =
  process.env.SESSION_COOKIE_NAME || "distribunex_session";

const SESSION_HOURS = 8;
const DEMO_COOKIE_VALUE = "demo-casa-mingo";

type SessionRow = {
  session_id: string;
  expira_at: Date;
  usuario_id: string;
  empresa_id: string;
  sucursal_id: string | null;
  nombre: string;
  apellido: string;
  usuario: string;
  email: string | null;
  perfiles: string[] | null;
};

export function isDemoMode() {
  return process.env.DEMO_MODE === "true";
}

export function getSessionCookieName() {
  return COOKIE_NAME;
}

export function getDemoCookieValue() {
  return DEMO_COOKIE_VALUE;
}

export function createSessionToken() {
  return {
    id: randomUUID(),
    secret: randomBytes(32).toString("base64url"),
  };
}

export function serializeSessionToken(
  id: string,
  secret: string,
) {
  return `${id}.${secret}`;
}

function parseSessionToken(value?: string) {
  if (!value) {
    return null;
  }

  const [id, secret, extra] = value.split(".");

  if (!id || !secret || extra) {
    return null;
  }

  return { id, secret };
}

function createDemoSession(): AuthSession {
  return {
    id: "demo-session",
    expiraAt: new Date(
      Date.now() + SESSION_HOURS * 60 * 60 * 1000,
    ),
    demo: true,
    user: {
      id: "demo-admin",
      empresaId: "demo-casa-mingo",
      sucursalId: "demo-casa-central",
      nombre: "Administrador",
      apellido: "Demo",
      usuario: "admin",
      email: "demo@casamingo.local",
      perfiles: ["ADMIN"],
    },
  };
}

export async function getCurrentSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(COOKIE_NAME)?.value;

  if (isDemoMode() && cookieValue === DEMO_COOKIE_VALUE) {
    return createDemoSession();
  }

  const token = parseSessionToken(cookieValue);

  if (!token) {
    return null;
  }

  const result = await db.query<SessionRow>(
    `SELECT
       s.id AS session_id, s.expira_at,
       u.id AS usuario_id, u.empresa_id, u.sucursal_id,
       u.nombre, u.apellido, u.usuario, u.email,
       array_remove(array_agg(DISTINCT p.codigo), NULL) AS perfiles
     FROM sesiones_usuario s
     JOIN usuarios u ON u.id = s.usuario_id
     LEFT JOIN usuario_perfil up ON up.usuario_id = u.id
     LEFT JOIN perfiles p ON p.id = up.perfil_id AND p.activo
     WHERE s.id = $1
       AND s.revocada_at IS NULL
       AND s.expira_at > now()
       AND s.token_hash = crypt($2, s.token_hash)
       AND u.estado = 'ACTIVO'
       AND (u.bloqueado_hasta IS NULL OR u.bloqueado_hasta <= now())
     GROUP BY s.id, s.expira_at, u.id, u.empresa_id, u.sucursal_id,
              u.nombre, u.apellido, u.usuario, u.email`,
    [token.id, token.secret],
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    id: row.session_id,
    expiraAt: row.expira_at,
    user: {
      id: row.usuario_id,
      empresaId: row.empresa_id,
      sucursalId: row.sucursal_id,
      nombre: row.nombre,
      apellido: row.apellido,
      usuario: row.usuario,
      email: row.email,
      perfiles: row.perfiles ?? [],
    },
  };
}

export async function requireSession() {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

export const sessionMaxAge = SESSION_HOURS * 60 * 60;
