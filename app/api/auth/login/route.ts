import { isIP } from "node:net";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import {
  createSessionToken,
  getDemoCookieValue,
  getSessionCookieName,
  isDemoMode,
  serializeSessionToken,
  sessionMaxAge,
} from "@/lib/auth/session";

export const runtime = "nodejs";

type LoginRow = {
  id: string;
  empresa_id: string;
  bloqueado_hasta: Date | null;
};

const DEMO_COMPANY_CODE = "casa_mingo";
const DEMO_USERNAME = "admin";
const DEMO_PASSWORD = "admin123";

function clientIp(request: NextRequest) {
  const value = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();

  return value && isIP(value) ? value : null;
}

function userAgent(request: NextRequest) {
  return request.headers.get("user-agent")?.slice(0, 500) ?? null;
}

function setSessionCookie(response: NextResponse, value: string) {
  response.cookies.set(getSessionCookieName(), value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionMaxAge,
  });
}

export async function POST(request: NextRequest) {
  let body: {
    empresa?: unknown;
    usuario?: unknown;
    contrasena?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Solicitud inválida." },
      { status: 400 },
    );
  }

  const empresa =
    typeof body.empresa === "string"
      ? body.empresa.trim().toLowerCase()
      : "";

  const usuario =
    typeof body.usuario === "string"
      ? body.usuario.trim().toLowerCase()
      : "";

  const contrasena =
    typeof body.contrasena === "string"
      ? body.contrasena
      : "";

  if (
    !empresa ||
    !usuario ||
    !contrasena ||
    empresa.length > 30 ||
    usuario.length > 80 ||
    contrasena.length > 200
  ) {
    return NextResponse.json(
      { error: "Empresa, usuario o contraseña inválidos." },
      { status: 400 },
    );
  }

  if (isDemoMode()) {
    const valid =
      empresa === DEMO_COMPANY_CODE &&
      usuario === DEMO_USERNAME &&
      contrasena === DEMO_PASSWORD;

    if (!valid) {
      return NextResponse.json(
        { error: "Usuario o contraseña incorrectos." },
        { status: 401 },
      );
    }

    const response = NextResponse.json({
      ok: true,
      demo: true,
    });

    setSessionCookie(response, getDemoCookieValue());

    return response;
  }

  const ip = clientIp(request);
  const agent = userAgent(request);

  const userResult = await db.query<LoginRow>(
    `SELECT u.id, u.empresa_id, u.bloqueado_hasta
       FROM usuarios u
       JOIN empresas e ON e.id = u.empresa_id
      WHERE lower(e.codigo) = $1
        AND e.activo
        AND lower(u.usuario) = $2
        AND u.estado = 'ACTIVO'
      LIMIT 1`,
    [empresa, usuario],
  );

  const candidate = userResult.rows[0];

  if (
    !candidate ||
    (candidate.bloqueado_hasta &&
      candidate.bloqueado_hasta > new Date())
  ) {
    if (candidate) {
      await db.query(
        `INSERT INTO eventos_seguridad
           (empresa_id, usuario_id, tipo, detalle, ip, user_agent)
         VALUES
           ($1, $2, 'LOGIN_FALLIDO',
            jsonb_build_object('motivo', 'USUARIO_BLOQUEADO'),
            $3::inet, $4)`,
        [candidate.empresa_id, candidate.id, ip, agent],
      );
    }

    return NextResponse.json(
      { error: "Usuario o contraseña incorrectos." },
      { status: 401 },
    );
  }

  const verified = await db.query<LoginRow>(
    `SELECT id, empresa_id, bloqueado_hasta
       FROM usuarios
      WHERE id = $1
        AND password_hash = crypt($2, password_hash)`,
    [candidate.id, contrasena],
  );

  if (!verified.rows[0]) {
    await db.query(
      `UPDATE usuarios
          SET intentos_fallidos = intentos_fallidos + 1,
              bloqueado_hasta = CASE
                WHEN intentos_fallidos + 1 >= 5
                THEN now() + interval '15 minutes'
                ELSE bloqueado_hasta
              END
        WHERE id = $1`,
      [candidate.id],
    );

    await db.query(
      `INSERT INTO eventos_seguridad
         (empresa_id, usuario_id, tipo, detalle, ip, user_agent)
       VALUES
         ($1, $2, 'LOGIN_FALLIDO',
          jsonb_build_object('motivo', 'CREDENCIAL_INVALIDA'),
          $3::inet, $4)`,
      [candidate.empresa_id, candidate.id, ip, agent],
    );

    return NextResponse.json(
      { error: "Usuario o contraseña incorrectos." },
      { status: 401 },
    );
  }

  const token = createSessionToken();
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      "SELECT set_config('app.usuario_id', $1, true), set_config('app.ip', $2, true)",
      [candidate.id, ip ?? ""],
    );

    await client.query(
      `UPDATE usuarios
          SET ultimo_acceso_at = now(),
              intentos_fallidos = 0,
              bloqueado_hasta = NULL
        WHERE id = $1`,
      [candidate.id],
    );

    await client.query(
      `INSERT INTO sesiones_usuario
         (id, usuario_id, token_hash, ip, user_agent, expira_at)
       VALUES
         ($1, $2, crypt($3, gen_salt('bf', 12)),
          $4::inet, $5, now() + interval '8 hours')`,
      [token.id, candidate.id, token.secret, ip, agent],
    );

    await client.query(
      `INSERT INTO eventos_seguridad
         (empresa_id, usuario_id, tipo, ip, user_agent)
       VALUES
         ($1, $2, 'LOGIN_EXITOSO', $3::inet, $4)`,
      [candidate.empresa_id, candidate.id, ip, agent],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const response = NextResponse.json({
    ok: true,
    demo: false,
  });

  setSessionCookie(
    response,
    serializeSessionToken(token.id, token.secret),
  );

  return response;
}
