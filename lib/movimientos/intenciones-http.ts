/**
 * MOV-O07 — comunes de las rutas de intención: sesión, permiso MOVIMIENTOS.CREAR y traducción de errores. Empresa y usuario SOLO de la sesión. Sin base de datos o sin sesión: nunca un checkpoint ni un éxito falsos
 * (DEMO_MODE no autoriza nada real).
 */
import { NextResponse } from "next/server";

import { denyIfNoPermission } from "@/lib/auth/permissions";
import { respuestaDeError } from "@/lib/movimientos/intenciones";

const DEMO_MODE = process.env.DEMO_MODE === "true";

export async function contextoIntencion(): Promise<{ ok: true; empresaId: string; usuarioId: string; db: { connect(): Promise<import("pg").PoolClient> } } | { ok: false; respuesta: NextResponse }> {
  if (DEMO_MODE) return { ok: false, respuesta: NextResponse.json({ error: "Operación no disponible en modo demo." }, { status: 400 }) };
  if (!process.env.DATABASE_URL) return { ok: false, respuesta: NextResponse.json({ error: "Servicio no disponible: base de datos no configurada." }, { status: 503 }) };

  const { getCurrentSession } = await import("@/lib/auth/session");
  const session = await getCurrentSession();

  if (!session) return { ok: false, respuesta: NextResponse.json({ error: "Sesión no válida." }, { status: 401 }) };

  const denegado = await denyIfNoPermission(session, "MOVIMIENTOS", "CREAR");

  if (denegado) return { ok: false, respuesta: denegado };

  const { db } = await import("@/lib/db");

  return { ok: true, empresaId: session.user.empresaId, usuarioId: session.user.id, db };
}

/** Un error de la intención conserva su estado HTTP; cualquier otro es un 500 genérico (sin datos del movimiento ni del SQL). Una respuesta no conclusiva NUNCA libera la intención. */
export function respuestaErrorIntencion(error: unknown) {
  const r = respuestaDeError(error);

  if (r.status === 500) console.error("Error en la intención de movimiento:", error instanceof Error ? error.message : "desconocido");

  return NextResponse.json(r.body, { status: r.status });
}
