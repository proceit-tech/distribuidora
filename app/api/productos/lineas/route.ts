import { NextResponse } from "next/server";

import { denyIfNoPermission } from "@/lib/auth/permissions";
import { respuestaCatalogo, validarCatalogo } from "@/lib/productos/catalogos";
import { texto } from "@/lib/productos/shared";

// Catálogo auxiliar Líneas de producto (NEX-017): cada línea pertenece a una familia de la misma empresa.
// GET ?familiaId=<uuid> filtra por familia. La pantalla administrativa de líneas es un desarrollo posterior.
const DEMO_MODE = process.env.DEMO_MODE === "true";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export async function GET(request: Request) {
  if (!DEMO_MODE && !process.env.DATABASE_URL) return sinBase();
  if (DEMO_MODE) return NextResponse.json({ lineas: [], demo: true });

  const session = await sesionActual();
  if (!session) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  const denegado = await denyIfNoPermission(session, "PRODUCTOS", "VER");
  if (denegado) return denegado;

  const familiaId = new URL(request.url).searchParams.get("familiaId");
  if (familiaId && !UUID.test(familiaId)) {
    return NextResponse.json({ error: "Familia no válida." }, { status: 400 });
  }

  try {
    const db = await obtenerDb();
    const r = await db.query(
      `SELECT id, familia_id AS "familiaId", coalesce(codigo,'') AS codigo, nombre, coalesce(descripcion,'') AS descripcion, activo
         FROM lineas_producto WHERE empresa_id = $1 AND ($2::uuid IS NULL OR familia_id = $2) ORDER BY nombre`,
      [session.user.empresaId, familiaId],
    );
    return NextResponse.json({ lineas: r.rows });
  } catch (error) {
    console.error("Error al cargar líneas:", error);
    return NextResponse.json({ error: "No fue posible cargar las líneas." }, { status: 500 });
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
    const familiaId = texto(cuerpo.familiaId);
    if (!UUID.test(familiaId)) throw new Error("Seleccione la familia de la línea.");
    const db = await obtenerDb();
    const r = await db.query(
      `INSERT INTO lineas_producto (empresa_id, familia_id, codigo, nombre, descripcion) VALUES ($1,$2,$3,$4,$5)
       RETURNING id, familia_id AS "familiaId", coalesce(codigo,'') AS codigo, nombre`,
      [session.user.empresaId, familiaId, datos.codigo, datos.nombre, datos.descripcion],
    );
    return NextResponse.json({ message: "Línea registrada correctamente.", linea: r.rows[0] }, { status: 201 });
  } catch (error) {
    return respuestaCatalogo(error, "línea");
  }
}
