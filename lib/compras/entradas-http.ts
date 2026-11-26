/**
 * E6-A — comunes de las rutas de Compras → Entradas: sesión, permiso COMPRAS.<acción>, disponibilidad de la estructura (NEX-075) y traducción de errores. Empresa y usuario SOLO de la sesión.
 * Sin base de datos, en modo DEMO o sin la migración aplicada: 503 «No disponible» (nunca listas vacías ni éxitos simulados).
 */
import { NextResponse } from "next/server";
import type { Pool } from "pg";

import { getAccessContext, hasPermission, type AccessContext } from "@/lib/auth/permissions";
import { moduloDisponible, respuestaDeErrorEntrada } from "@/lib/compras/entradas";

const DEMO_MODE = process.env.DEMO_MODE === "true";

export const MENSAJE_NO_DISPONIBLE = "Compras → Entradas no está disponible: la base de datos todavía no tiene la estructura de entradas (pendiente de aplicación por el responsable).";

export async function contextoEntradas(
  accion: "VER" | "CREAR",
): Promise<{ ok: true; empresaId: string; usuarioId: string; access: AccessContext; db: Pool } | { ok: false; respuesta: NextResponse }> {
  if (DEMO_MODE) return { ok: false, respuesta: NextResponse.json({ error: "Compras → Entradas no está disponible en modo demo.", noDisponible: true }, { status: 503 }) };
  if (!process.env.DATABASE_URL) return { ok: false, respuesta: NextResponse.json({ error: "Servicio no disponible: base de datos no configurada.", noDisponible: true }, { status: 503 }) };

  const { getCurrentSession } = await import("@/lib/auth/session");
  const session = await getCurrentSession();

  if (!session) return { ok: false, respuesta: NextResponse.json({ error: "Sesión no válida." }, { status: 401 }) };

  const access = await getAccessContext(session.user, session.demo === true);

  if (!hasPermission(access, "COMPRAS", accion)) return { ok: false, respuesta: NextResponse.json({ error: "No tiene permiso para esta acción." }, { status: 403 }) };

  const { db } = await import("@/lib/db");

  try {
    if (!(await moduloDisponible(db))) return { ok: false, respuesta: NextResponse.json({ error: MENSAJE_NO_DISPONIBLE, noDisponible: true }, { status: 503 }) };
  } catch (error) {
    console.error("Error al comprobar Compras → Entradas:", error instanceof Error ? error.message : "desconocido");

    return { ok: false, respuesta: NextResponse.json({ error: "No fue posible comprobar el módulo de entradas." }, { status: 500 }) };
  }

  return { ok: true, empresaId: session.user.empresaId, usuarioId: session.user.id, access, db };
}

/** Registrar exige COMPRAS.CREAR y, en el motor, MOVIMIENTOS.CREAR: solo para mostrar u ocultar «Nueva entrada» (el servidor vuelve a verificar todo). */
export const puedeRegistrarEntradas = (access: AccessContext) => hasPermission(access, "COMPRAS", "CREAR") && hasPermission(access, "MOVIMIENTOS", "CREAR");

export function respuestaErrorEntrada(error: unknown, accion: string) {
  const r = respuestaDeErrorEntrada(error);

  if (r.status === 500) console.error(`Error al ${accion} (Compras → Entradas):`, error instanceof Error ? error.message : "desconocido");

  return NextResponse.json(r.body, { status: r.status });
}
