import { NextResponse } from "next/server";

import { denyIfNoPermission } from "@/lib/auth/permissions";
import { respuestaCatalogo, validarCatalogo } from "@/lib/productos/catalogos";

// Catálogo auxiliar Familias de producto (NEX-017). Alimenta el select de Productos.
// La pantalla administrativa de familias es un desarrollo posterior; esta API ya respeta empresa_id y permisos.
const DEMO_MODE = process.env.DEMO_MODE === "true";

const sinBase = () =>
  NextResponse.json({ error: "Servicio no disponible: base de datos no configurada." }, { status: 503 });

async function sesionActual() {
  const { getCurrentSession } = await import("@/lib/auth/session");
  return getCurrentSession();
}
async function obtenerDb() {
  const { db } = await import("@/lib/db");
  return db;
}

export async function GET() {
  if (!DEMO_MODE && !process.env.DATABASE_URL) return sinBase();
  if (DEMO_MODE) return NextResponse.json({ familias: [], demo: true });

  const session = await sesionActual();
  if (!session) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  const denegado = await denyIfNoPermission(session, "PRODUCTOS", "VER");
  if (denegado) return denegado;

  try {
    const db = await obtenerDb();
    const r = await db.query(
      `SELECT id, coalesce(codigo,'') AS codigo, nombre, coalesce(descripcion,'') AS descripcion, activo
         FROM familias_producto WHERE empresa_id = $1 ORDER BY nombre`,
      [session.user.empresaId],
    );
    return NextResponse.json({ familias: r.rows });
  } catch (error) {
    console.error("Error al cargar familias:", error);
    return NextResponse.json({ error: "No fue posible cargar las familias." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }
  if (!DEMO_MODE && !process.env.DATABASE_URL) return sinBase();
  if (DEMO_MODE) return NextResponse.json({ error: "Operación no disponible en modo demo." }, { status: 400 });

  const session = await sesionActual();
  if (!session) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  const denegado = await denyIfNoPermission(session, "PRODUCTOS", "CREAR");
  if (denegado) return denegado;

  try {
    const datos = validarCatalogo(cuerpo);
    const db = await obtenerDb();
    const r = await db.query(
      `INSERT INTO familias_producto (empresa_id, codigo, nombre, descripcion) VALUES ($1,$2,$3,$4)
       RETURNING id, coalesce(codigo,'') AS codigo, nombre`,
      [session.user.empresaId, datos.codigo, datos.nombre, datos.descripcion],
    );
    return NextResponse.json({ message: "Familia registrada correctamente.", familia: r.rows[0] }, { status: 201 });
  } catch (error) {
    return respuestaCatalogo(error, "familia");
  }
}
