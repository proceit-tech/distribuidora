import type { Pool } from "pg";

/**
 * Vendedores (PRO-72 / PRO-307): NO existe una tabla de vendedores. Vendedor = usuario de la empresa con el perfil predefinido VENDEDOR (usuario_perfil → perfiles). Todo se filtra por la empresa de la sesión.
 * Solo lectura; las altas y cambios pasan por las funciones usr_* de NEX-074 (administrador de empresa).
 */
type Db = Pick<Pool, "query">;
type F = Record<string, unknown>;

export const PERFIL_VENDEDOR = "VENDEDOR";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const comodin = (t: string) => t.replace(/[!%_]/g, (c) => `!${c}`);

export type Vendedor = { id: string; usuario: string; nombre: string; apellido: string; nombreCompleto: string; email: string; estado: string; activo: boolean };
/** Datos de contacto/identificación (CI, correo, teléfono): solo para el administrador de la empresa en Maestros → Vendedores; nunca en el selector de la factura. */
export type VendedorConContacto = Vendedor & { ci: string; telefono: string };
/** Lo mínimo que necesita el selector de «Nueva factura»: el ID (usuarios.id) es la identidad; el usuario ayuda a distinguir nombres parecidos. */
export type VendedorSelector = { id: string; usuario: string; nombreCompleto: string };

const nombreCompleto = (nombre: string, apellido: string) => `${nombre} ${apellido}`.replace(/\s+/g, " ").trim();

function aVendedor(f: F): Vendedor {
  return { id: s(f.id), usuario: s(f.usuario), nombre: s(f.nombre), apellido: s(f.apellido), nombreCompleto: nombreCompleto(s(f.nombre), s(f.apellido)), email: s(f.email), estado: s(f.estado), activo: f.estado === "ACTIVO" };
}

const BASE = `FROM usuarios u
   JOIN usuario_perfil up ON up.empresa_id = u.empresa_id AND up.usuario_id = u.id
   JOIN perfiles pf ON pf.empresa_id = up.empresa_id AND pf.id = up.perfil_id AND pf.activo AND pf.codigo = '${PERFIL_VENDEDOR}'
  WHERE u.empresa_id = $1 AND u.estado <> 'BAJA'
    AND NOT EXISTS (SELECT 1 FROM administradores_plataforma ap WHERE ap.empresa_id = u.empresa_id AND ap.usuario_id = u.id AND ap.activo)`;

/** Lista paginada de vendedores de la empresa (filtro por texto y estado). `conContacto` agrega CI, correo y teléfono (solo administrador de empresa); sin él no se leen esas columnas. */
export async function listarVendedores(db: Db, empresaId: string, p: { q: string; estado: "TODOS" | "ACTIVO" | "INACTIVO"; pagina: number; porPagina: number }, conContacto = false) {
  const r = await db.query(
    `SELECT u.id, u.usuario, u.nombre, u.apellido, u.email, u.estado${conContacto ? ", u.ci, u.telefono" : ""}, count(*) OVER() AS total ${BASE}
      AND ($2 = '' OR u.usuario ILIKE $3 ESCAPE '!' OR u.nombre ILIKE $3 ESCAPE '!' OR coalesce(u.apellido, '') ILIKE $3 ESCAPE '!' OR concat_ws(' ', u.nombre, u.apellido) ILIKE $3 ESCAPE '!'${conContacto ? " OR coalesce(u.ci, '') ILIKE $3 ESCAPE '!'" : ""})
      AND ($4 = 'TODOS' OR ($4 = 'ACTIVO' AND u.estado = 'ACTIVO') OR ($4 = 'INACTIVO' AND u.estado <> 'ACTIVO'))
      ORDER BY u.nombre, u.apellido, u.id LIMIT $5 OFFSET $6`,
    [empresaId, p.q, `%${comodin(p.q)}%`, p.estado, p.porPagina, (p.pagina - 1) * p.porPagina],
  );
  const filas = r.rows as F[];

  return { vendedores: filas.map((f): Vendedor | VendedorConContacto => (conContacto ? { ...aVendedor(f), ci: s(f.ci), telefono: s(f.telefono) } : aVendedor(f))), total: filas.length > 0 ? Number(filas[0].total) : 0, pagina: p.pagina, porPagina: p.porPagina };
}

/** Vendedores ACTIVOS para el selector de la factura: solo ID, usuario y nombre (sin CI, correo ni teléfono). Usuarios sin el perfil Vendedor o inactivos no aparecen. */
export async function listarVendedoresActivos(db: Db, empresaId: string, p: { q: string; pagina: number; porPagina: number }) {
  const r = await listarVendedores(db, empresaId, { ...p, estado: "ACTIVO" });

  return { vendedores: r.vendedores.map((v): VendedorSelector => ({ id: v.id, usuario: v.usuario, nombreCompleto: v.nombreCompleto })), total: r.total, pagina: r.pagina, porPagina: r.porPagina };
}

/** Un vendedor ACTIVO de la empresa (por ID) o null: el servidor revalida siempre lo que eligió el navegador. */
export async function vendedorActivo(db: Db, empresaId: string, id: string): Promise<Vendedor | null> {
  const r = await db.query(`SELECT u.id, u.usuario, u.nombre, u.apellido, u.email, u.estado ${BASE} AND u.id = $2 AND u.estado = 'ACTIVO' LIMIT 1`, [empresaId, id]);
  const f = r.rows[0] as F | undefined;

  return f ? aVendedor(f) : null;
}

/** Nombre de un usuario de la empresa (cualquier estado; nunca un administrador de plataforma) o null. Solo para comparar con el texto congelado de una FE ANTERIOR a NEX-074; no habilita a nadie como vendedor. */
export async function nombreDeUsuario(db: Db, empresaId: string, id: string): Promise<{ nombre: string; apellido: string } | null> {
  const r = await db.query(
    `SELECT u.nombre, u.apellido FROM usuarios u WHERE u.empresa_id = $1 AND u.id = $2
        AND NOT EXISTS (SELECT 1 FROM administradores_plataforma ap WHERE ap.empresa_id = u.empresa_id AND ap.usuario_id = u.id AND ap.activo)`,
    [empresaId, id],
  );
  const f = r.rows[0] as F | undefined;

  return f ? { nombre: s(f.nombre), apellido: s(f.apellido) } : null;
}

/** ¿Está aplicada NEX-074 (la base registra el vendedor estructurado de la FE)? */
export async function vendedorFeSoportado(db: Db): Promise<boolean> {
  const r = await db.query("SELECT to_regprocedure('public.fe_documento_crear_fe_vendedor(uuid,uuid,uuid,uuid,text,uuid,text,text,text,numeric,jsonb,jsonb,uuid,uuid)') IS NOT NULL AS ok");

  return (r.rows[0] as F | undefined)?.ok === true;
}
