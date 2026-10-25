import { NextResponse } from "next/server";

import { leerCodigos, leerPagina } from "@/lib/usuarios/paginacion";
import { prepararAdminEmpresa, respuestaErrorUsuarios } from "@/lib/usuarios/servidor";

type F = Record<string, unknown>;

// Usuarios de la empresa de la sesión (administrador de empresa). Nunca incluye administradores de plataforma ni datos de otras empresas; no devuelve hashes.
export async function GET(request: Request) {
  const b = await prepararAdminEmpresa();

  if (!b.ok) return b.respuesta;

  const { q, pagina, porPagina } = leerPagina(new URL(request.url));
  const comodin = `%${q.replace(/[!%_]/g, (c) => `!${c}`)}%`;

  try {
    const r = await b.db.query(
      `SELECT u.id, u.usuario, u.nombre, u.apellido, u.email, u.estado, u.ultimo_acceso_at AS "ultimoAcceso", u.debe_cambiar_contrasena AS "debeCambiarContrasena",
              coalesce(json_agg(json_build_object('codigo', pf.codigo, 'nombre', pf.nombre) ORDER BY pf.nombre) FILTER (WHERE pf.id IS NOT NULL), '[]'::json) AS perfiles,
              u.alcance_sucursales AS "alcanceSucursales", u.alcance_depositos AS "alcanceDepositos",
              (SELECT count(*)::int FROM usuario_sucursal us WHERE us.empresa_id = u.empresa_id AND us.usuario_id = u.id) AS "sucursalesAsignadas",
              (SELECT count(*)::int FROM usuario_deposito ud WHERE ud.empresa_id = u.empresa_id AND ud.usuario_id = u.id) AS "depositosAsignados",
              count(*) OVER() AS total
         FROM usuarios u
         LEFT JOIN usuario_perfil up ON up.empresa_id = u.empresa_id AND up.usuario_id = u.id
         LEFT JOIN perfiles pf ON pf.empresa_id = up.empresa_id AND pf.id = up.perfil_id AND pf.activo
        WHERE u.empresa_id = $1 AND u.estado <> 'BAJA'
          AND NOT EXISTS (SELECT 1 FROM administradores_plataforma ap WHERE ap.empresa_id = u.empresa_id AND ap.usuario_id = u.id AND ap.activo)
          AND ($2 = '' OR u.usuario ILIKE $3 ESCAPE '!' OR u.nombre ILIKE $3 ESCAPE '!' OR coalesce(u.apellido, '') ILIKE $3 ESCAPE '!' OR coalesce(u.email, '') ILIKE $3 ESCAPE '!')
        GROUP BY u.id
        ORDER BY u.nombre, u.apellido, u.id LIMIT $4 OFFSET $5`,
      [b.empresaId, q, comodin, porPagina, (pagina - 1) * porPagina],
    );
    const filas = r.rows as F[];

    return NextResponse.json({ usuarios: filas.map(({ total: _total, ...u }) => u), total: filas.length > 0 ? Number(filas[0].total) : 0, pagina, porPagina });
  } catch (error) {
    return respuestaErrorUsuarios(error);
  }
}

// Alta de un usuario de la empresa con perfiles predefinidos. La contraseña inicial la define el administrador (nunca se genera ni se muestra); el usuario deberá cambiarla.
export async function POST(request: Request) {
  const b = await prepararAdminEmpresa();

  if (!b.ok) return b.respuesta;

  let cuerpo: F;

  try {
    cuerpo = (await request.json()) as F;
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }
  if (!cuerpo || typeof cuerpo !== "object") return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });

  const texto = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : "");
  const perfiles = leerCodigos(cuerpo.perfiles ?? []);

  if (perfiles === null || typeof cuerpo.contrasena !== "string") return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });

  try {
    const r = await b.db.query("SELECT usr_crear($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::text[]) AS id", [b.empresaId, b.actorId, texto(cuerpo.usuario, 80), texto(cuerpo.nombre, 200), texto(cuerpo.apellido, 200), texto(cuerpo.email, 300), cuerpo.contrasena.slice(0, 300), perfiles]);

    return NextResponse.json({ id: (r.rows[0] as F).id }, { status: 201 });
  } catch (error) {
    return respuestaErrorUsuarios(error);
  }
}
