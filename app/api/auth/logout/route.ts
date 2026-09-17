import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import {
  getDemoCookieValue,
  getSessionCookieName,
  isDemoMode,
} from "@/lib/auth/session";

export const runtime = "nodejs";

function clearSessionCookie(response: NextResponse) {
  response.cookies.set(getSessionCookieName(), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function POST(request: NextRequest) {
  const value = request.cookies.get(getSessionCookieName())?.value;

  if (isDemoMode() && value === getDemoCookieValue()) {
    const response = NextResponse.json({ ok: true, demo: true });
    clearSessionCookie(response);
    return response;
  }

  const [id, secret, extra] = value?.split(".") ?? [];

  if (id && secret && !extra) {
    await db.query(
      `UPDATE sesiones_usuario
          SET revocada_at = now()
        WHERE id = $1
          AND revocada_at IS NULL
          AND token_hash = crypt($2, token_hash)`,
      [id, secret],
    );
  }

  const response = NextResponse.json({ ok: true, demo: false });
  clearSessionCookie(response);
  return response;
}
