import { NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { denyIfNoPermission } from "@/lib/auth/permissions";
import { respuestaError } from "@/lib/movimientos/shared";

type Contexto = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEMO_MODE = process.env.DEMO_MODE === "true";

// Anulación por movimiento inverso (el histórico no se edita). Acción crítica: MOVIMIENTOS.ANULAR (solo administradores de la empresa).
export async function POST(request: Request, contexto: Contexto) {
  let cuerpo: Record<string, unknown> = {};
  try {
    cuerpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }
  if (!DEMO_MODE && !process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Servicio no disponible: base de datos no configurada." }, { status: 503 });
  }
  if (DEMO_MODE) return NextResponse.json({ error: "Operación no disponible en modo demo." }, { status: 400 });

  const { getCurrentSession } = await import("@/lib/auth/session");
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  const denegado = await denyIfNoPermission(session, "MOVIMIENTOS", "ANULAR");
  if (denegado) return denegado;

  const { id } = await contexto.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Movimiento no encontrado." }, { status: 404 });
  const motivo = typeof cuerpo.motivo === "string" ? cuerpo.motivo.trim().slice(0, 300) : "";
  const clave = typeof cuerpo.claveIdempotencia === "string" && cuerpo.claveIdempotencia.trim().length >= 8 ? cuerpo.claveIdempotencia.trim().slice(0, 120) : null;

  const { db } = await import("@/lib/db");
  let conexion: PoolClient | undefined;
  try {
    conexion = await db.connect();
    await conexion.query("BEGIN");
    const existe = await conexion.query(`SELECT 1 FROM movimientos_inventario WHERE empresa_id = $1 AND id = $2`, [session.user.empresaId, id]);
    if (!existe.rowCount) {
      await conexion.query("ROLLBACK");
      return NextResponse.json({ error: "Movimiento no encontrado." }, { status: 404 });
    }
    const r = await conexion.query(
      `SELECT o_movimiento_id AS id, o_numero AS numero, o_repetido AS repetido
         FROM inventario_anular_movimiento($1::uuid, $2::uuid, $3::uuid, $4, $5)`,
      [session.user.empresaId, session.user.id, id, motivo, clave],
    );
    await conexion.query("COMMIT");
    const mov = r.rows[0] as { id: string; numero: string };
    return NextResponse.json({ message: `Movimiento anulado con ${mov.numero}.`, movimiento: mov });
  } catch (error) {
    if (conexion) await conexion.query("ROLLBACK").catch(() => undefined);
    return respuestaError(error, "anular");
  } finally {
    conexion?.release();
  }
}
