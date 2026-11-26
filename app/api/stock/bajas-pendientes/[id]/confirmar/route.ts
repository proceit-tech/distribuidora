import { NextResponse } from "next/server";

import { denyIfNoPermission } from "@/lib/auth/permissions";
import { confirmarBajaPendiente, errorBajaPendiente } from "@/lib/stock/bajas-pendientes";

const DEMO_MODE = process.env.DEMO_MODE === "true";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PRO-354-R02: confirmación MANUAL de una baja pendiente (MOVIMIENTOS.CREAR). La función SQL bloquea la fila, verifica alcance, estado de la FE, lotes y saldo real suficiente, y crea la SALIDA/VENTA
// complementaria por el motor ordinario con clave idempotente. Repetir la confirmación devuelve el mismo movimiento (repetido = true). Sin cuerpo: nada del navegador decide cantidades ni depósitos.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!DEMO_MODE && !process.env.DATABASE_URL) return NextResponse.json({ error: "Servicio no disponible: base de datos no configurada." }, { status: 503 });
  if (DEMO_MODE) return NextResponse.json({ error: "No disponible en modo demostración." }, { status: 403 });

  const { getCurrentSession } = await import("@/lib/auth/session");
  const session = await getCurrentSession();

  if (!session) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });

  const denegado = await denyIfNoPermission(session, "MOVIMIENTOS", "CREAR");

  if (denegado) return denegado;

  const { id } = await params;

  if (!UUID.test(id)) return NextResponse.json({ error: "La baja pendiente no existe." }, { status: 404 });

  try {
    const { db } = await import("@/lib/db");

    return NextResponse.json(await confirmarBajaPendiente(db, session.user.empresaId, session.user.id, id.toLowerCase()), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const e = errorBajaPendiente(error);

    if (e.status === 500) console.error("Error al confirmar una baja pendiente de stock:", error);

    return NextResponse.json({ error: e.error }, { status: e.status });
  }
}
