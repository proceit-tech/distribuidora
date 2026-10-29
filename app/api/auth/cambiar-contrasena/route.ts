import { NextResponse } from "next/server";

import { getCurrentSession } from "@/lib/auth/session";

export const runtime = "nodejs";

// Cambio de la contraseña PROVISIONAL por el propio usuario autenticado (única acción permitida mientras debe_cambiar_contrasena sea true). empresa_id, usuario y sesión salen SIEMPRE de la sesión; la función SQL
// verifica la contraseña actual (bcrypt en la base), valida la nueva, cierra las demás sesiones y registra el evento. Nunca registra ni devuelve contraseñas.
export async function POST(request: Request) {
  if (process.env.DEMO_MODE === "true" || !process.env.DATABASE_URL) return NextResponse.json({ error: "Servicio no disponible: base de datos no configurada." }, { status: 503 });

  const session = await getCurrentSession();

  if (!session) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });

  let cuerpo: { actual?: unknown; nueva?: unknown };

  try {
    cuerpo = (await request.json()) as typeof cuerpo;
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }
  if (typeof cuerpo?.actual !== "string" || typeof cuerpo?.nueva !== "string" || cuerpo.actual.length > 200 || cuerpo.nueva.length > 200) return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });

  try {
    const { db } = await import("@/lib/db");

    await db.query("SELECT usr_cambiar_contrasena_propia($1::uuid, $2::uuid, $3::uuid, $4, $5)", [session.user.empresaId, session.user.id, session.id, cuerpo.actual, cuerpo.nueva]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const e = error as { code?: string; detail?: string };

    if (e.code === "P0001" && e.detail === "NEX:CONTRASENA_ACTUAL") return NextResponse.json({ error: "La contraseña actual no es correcta." }, { status: 422 });
    if (e.code === "P0001" && e.detail === "NEX:CONTRASENA_INVALIDA") return NextResponse.json({ error: "La contraseña nueva debe tener de 10 a 200 caracteres y ser distinta de la actual y del usuario." }, { status: 422 });
    if (e.code === "42883") return NextResponse.json({ error: "El cambio de contraseña requiere la migración NEX-074 en la base de datos (aún no aplicada)." }, { status: 503 });

    return NextResponse.json({ error: "No fue posible cambiar la contraseña." }, { status: 500 });
  }
}
