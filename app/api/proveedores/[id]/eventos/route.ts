import { NextResponse } from "next/server";

import { UUID_RUTA, autorizarProveedores, noEncontrado, sinPermiso } from "@/lib/proveedores/http";

type Contexto = { params: Promise<{ id: string }> };

/** Historial de auditoría del proveedor (más recientes primero). Requiere PROVEEDORES.VER y la empresa de la sesión. */
export async function GET(request: Request, contexto: Contexto) {
  const { id } = await contexto.params;

  if (!UUID_RUTA.test(id)) return noEncontrado();

  const auth = await autorizarProveedores();

  if ("respuesta" in auth) return auth.respuesta;
  if (!auth.permisos.ver) return sinPermiso();

  const limite = Math.min(Math.max(Number(new URL(request.url).searchParams.get("limite") ?? "100") || 100, 1), 500);
  const entidad = new URL(request.url).searchParams.get("entidad");

  try {
    const { db } = await import("@/lib/db");
    const r = await db.query(
      `SELECT e.id, e.entidad, e.entidad_id AS "entidadId", e.accion, e.anterior, e.nuevo, e.justificacion,
              to_char(e.creado_at AT TIME ZONE 'America/Asuncion', 'DD/MM/YYYY HH24:MI') AS "fecha",
              trim(coalesce(u.nombre, '') || ' ' || coalesce(u.apellido, '')) AS usuario
         FROM proveedor_eventos e
         LEFT JOIN usuarios u ON u.empresa_id = e.empresa_id AND u.id = e.usuario_id
        WHERE e.empresa_id = $1 AND e.proveedor_id = $2 AND ($3::text IS NULL OR e.entidad = $3)
        ORDER BY e.creado_at DESC, e.id
        LIMIT $4`,
      [auth.sesion.user.empresaId, id, entidad, limite],
    );

    return NextResponse.json({ eventos: r.rows });
  } catch (e) {
    console.error("Error al consultar el historial del proveedor:", e);

    return NextResponse.json({ error: "No fue posible cargar el historial." }, { status: 500 });
  }
}
