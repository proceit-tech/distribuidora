import { NextResponse } from "next/server";

import { UUID } from "@/lib/usuarios/paginacion";
import { prepararAdminEmpresa, respuestaErrorUsuarios } from "@/lib/usuarios/servidor";

type Contexto = { params: Promise<{ id: string }> };
type F = Record<string, unknown>;

// Alcance del usuario (sucursales y depósitos asignados) con las relaciones existentes usuario_sucursal / usuario_deposito. Solo el administrador de la empresa; todo filtrado por la empresa de la sesión.
export async function GET(_request: Request, contexto: Contexto) {
  const b = await prepararAdminEmpresa();

  if (!b.ok) return b.respuesta;

  const { id } = await contexto.params;

  if (!UUID.test(id)) return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });

  try {
    const u = await b.db.query(
      `SELECT u.alcance_sucursales AS "alcanceSucursales", u.alcance_depositos AS "alcanceDepositos" FROM usuarios u
        WHERE u.empresa_id = $1 AND u.id = $2 AND NOT EXISTS (SELECT 1 FROM administradores_plataforma ap WHERE ap.empresa_id = u.empresa_id AND ap.usuario_id = u.id AND ap.activo)`,
      [b.empresaId, id],
    );

    if (u.rows.length === 0) return NextResponse.json({ error: "El usuario no existe en la empresa." }, { status: 404 });

    const s = await b.db.query(
      `SELECT s.id, s.nombre, s.establecimiento_sifen AS establecimiento,
              EXISTS (SELECT 1 FROM usuario_sucursal us WHERE us.empresa_id = s.empresa_id AND us.usuario_id = $2 AND us.sucursal_id = s.id) AS asignada
         FROM sucursales s WHERE s.empresa_id = $1 AND s.activo ORDER BY s.nombre, s.id`,
      [b.empresaId, id],
    );
    const d = await b.db.query(
      `SELECT d.id, d.codigo, d.nombre, d.sucursal_id AS "sucursalId",
              EXISTS (SELECT 1 FROM usuario_deposito ud WHERE ud.empresa_id = d.empresa_id AND ud.usuario_id = $2 AND ud.deposito_id = d.id) AS asignado
         FROM depositos d WHERE d.empresa_id = $1 AND d.activo ORDER BY d.codigo, d.id`,
      [b.empresaId, id],
    );

    return NextResponse.json({ ...(u.rows[0] as F), sucursales: s.rows, depositos: d.rows });
  } catch (error) {
    return respuestaErrorUsuarios(error);
  }
}

// Reemplaza el alcance del usuario por exactamente lo marcado (fail-closed: nunca TODAS/TODOS). La base valida empresa, estado activo y que el usuario no tenga alcance total.
export async function PUT(request: Request, contexto: Contexto) {
  const b = await prepararAdminEmpresa();

  if (!b.ok) return b.respuesta;

  const { id } = await contexto.params;
  let cuerpo: Record<string, unknown>;

  try {
    cuerpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }

  const ids = (v: unknown): string[] | null => (Array.isArray(v) && v.length <= 500 && v.every((x) => typeof x === "string" && UUID.test(x)) ? [...new Set(v as string[])] : null);
  const sucursales = ids(cuerpo?.sucursales);
  const depositos = ids(cuerpo?.depositos);

  if (!UUID.test(id) || sucursales === null || depositos === null) return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });

  try {
    await b.db.query("SELECT usr_asignar_alcance($1::uuid, $2::uuid, $3::uuid, $4::uuid[], $5::uuid[])", [b.empresaId, b.actorId, id, sucursales, depositos]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return respuestaErrorUsuarios(error);
  }
}
