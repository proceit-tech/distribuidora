import { NextResponse } from "next/server";

import { getAccessContext, hasPermission, denyIfNoPermission } from "@/lib/auth/permissions";
import { opcional, texto } from "@/lib/productos/shared";

// Administración de catálogos de Productos: Categorías, Marcas (NEX-004), Familias y Líneas (NEX-017).
// Tablas existentes; sin migraciones. empresa_id SIEMPRE de la sesión. No hay borrado físico: se inactiva.
// Duplicados (sin distinguir mayúsculas ni espacios extremos): nombre único por empresa (línea: por familia) y
// código único por empresa. Familias/Líneas además tienen índices únicos en BD; Categorías/Marcas no los tienen, por lo
// que la regla se aplica aquí bajo un bloqueo consultivo por empresa+tabla.

export type TipoCatalogo = "categorias" | "marcas" | "familias" | "lineas";
const CFG: Record<TipoCatalogo, { tabla: string; que: string; columnaProducto: string; clave: string; descripcion: boolean }> = {
  categorias: { tabla: "categorias_producto", que: "categoría", columnaProducto: "categoria_id", clave: "categoria", descripcion: false },
  marcas: { tabla: "marcas_producto", que: "marca", columnaProducto: "marca_id", clave: "marca", descripcion: false },
  familias: { tabla: "familias_producto", que: "familia", columnaProducto: "familia_id", clave: "familia", descripcion: true },
  lineas: { tabla: "lineas_producto", que: "línea", columnaProducto: "linea_id", clave: "linea", descripcion: true },
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEMO_MODE = process.env.DEMO_MODE === "true";

class ErrorCatalogo extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function leer(tipo: TipoCatalogo, d: Record<string, unknown>) {
  const nombre = texto(d.nombre, 120);
  if (!nombre) throw new ErrorCatalogo("El nombre es obligatorio.");
  const codigo = opcional(d.codigo, 40);
  const descripcion = CFG[tipo].descripcion ? opcional(d.descripcion, 500) : null;
  if (d.activo !== undefined && typeof d.activo !== "boolean") throw new ErrorCatalogo("El estado no es válido.");
  return { nombre, codigo, descripcion, activo: d.activo as boolean | undefined };
}

async function sesion() {
  const { getCurrentSession } = await import("@/lib/auth/session");
  return getCurrentSession();
}

function fallo(error: unknown, tipo: TipoCatalogo, accion: string) {
  if (error instanceof ErrorCatalogo) return NextResponse.json({ error: error.message }, { status: error.status });
  const pg = error as { code?: string; constraint?: string };
  if (pg.code === "23505") {
    return NextResponse.json({ error: `Ya existe una ${CFG[tipo].que} con ese ${(pg.constraint ?? "").includes("codigo") ? "código" : "nombre"}.` }, { status: 409 });
  }
  if (pg.code === "42501") {
    // nexit_runtime solo tiene SELECT en categorias_producto / marcas_producto (NEX-013); requiere una migración de permisos autorizada.
    return NextResponse.json({ error: "Este catálogo aún no admite escritura en la base de datos (permisos pendientes de migración autorizada)." }, { status: 503 });
  }
  if (pg.code === "23503") return NextResponse.json({ error: "La familia indicada no existe en su empresa o el registro tiene productos vinculados." }, { status: 400 });
  console.error(`Error al ${accion} ${CFG[tipo].que}:`, error);
  return NextResponse.json({ error: `No fue posible ${accion} la ${CFG[tipo].que}.` }, { status: 500 });
}

type Base =
  | { ok: true; session: NonNullable<Awaited<ReturnType<typeof sesion>>>; db: typeof import("@/lib/db")["db"] }
  | { ok: false; respuesta: NextResponse };

async function preparar(accion: "VER" | "CREAR" | "EDITAR"): Promise<Base> {
  if (!DEMO_MODE && !process.env.DATABASE_URL) {
    return { ok: false, respuesta: NextResponse.json({ error: "Servicio no disponible: base de datos no configurada." }, { status: 503 }) };
  }
  if (DEMO_MODE) {
    return accion === "VER"
      ? { ok: false, respuesta: NextResponse.json({ demo: true }) }
      : { ok: false, respuesta: NextResponse.json({ error: "Operación no disponible en modo demo." }, { status: 400 }) };
  }
  const session = await sesion();
  if (!session) return { ok: false, respuesta: NextResponse.json({ error: "Sesión no válida." }, { status: 401 }) };
  const denegado = await denyIfNoPermission(session, "PRODUCTOS", accion);
  if (denegado) return { ok: false, respuesta: denegado };
  const { db } = await import("@/lib/db");
  return { ok: true, session, db };
}

type Fila = Record<string, unknown>;
const proyectar = (tipo: TipoCatalogo, t = "t") => {
  const c = CFG[tipo];
  return `${t}.id, coalesce(${t}.codigo,'') AS codigo, ${t}.nombre, ${c.descripcion ? `coalesce(${t}.descripcion,'')` : `''`} AS descripcion, ${t}.activo` +
    (tipo === "lineas" ? `, ${t}.familia_id AS "familiaId", (SELECT f.nombre FROM familias_producto f WHERE f.empresa_id = ${t}.empresa_id AND f.id = ${t}.familia_id) AS familia` : "") +
    `, (SELECT count(*)::int FROM productos p WHERE p.empresa_id = ${t}.empresa_id AND p.${c.columnaProducto} = ${t}.id) AS productos`;
};

export async function listarCatalogo(tipo: TipoCatalogo, request: Request) {
  const b = await preparar("VER");
  if (!b.ok) return b.respuesta;
  const familiaId = new URL(request.url).searchParams.get("familiaId");
  if (familiaId && (tipo !== "lineas" || !UUID.test(familiaId))) return NextResponse.json({ error: "Familia no válida." }, { status: 400 });
  try {
    const empresaId = b.session.user.empresaId;
    const r = await b.db.query(
      `SELECT ${proyectar(tipo)} FROM ${CFG[tipo].tabla} t WHERE t.empresa_id = $1 ${familiaId ? "AND t.familia_id = $2" : ""} ORDER BY t.nombre`,
      familiaId ? [empresaId, familiaId] : [empresaId],
    );
    const acceso = await getAccessContext(b.session.user, b.session.demo === true);
    return NextResponse.json({
      [tipo]: r.rows,
      permisos: { crear: hasPermission(acceso, "PRODUCTOS", "CREAR"), editar: hasPermission(acceso, "PRODUCTOS", "EDITAR") },
    });
  } catch (error) {
    return fallo(error, tipo, "cargar");
  }
}

type Cliente = { query: (sql: string, p?: unknown[]) => Promise<{ rows: Fila[]; rowCount: number | null }>; release: () => void };

async function enTransaccion<T>(db: { connect: () => Promise<unknown> }, fn: (c: Cliente) => Promise<T>) {
  const c = (await db.connect()) as Cliente;
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

async function verificarDuplicados(c: Cliente, tipo: TipoCatalogo, empresaId: string, d: { nombre: string; codigo: string | null }, familiaId: string | null, excluirId: string | null) {
  const t = CFG[tipo];
  await c.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`${empresaId}:${t.tabla}`]);
  const nom = await c.query(
    `SELECT 1 FROM ${t.tabla} WHERE empresa_id = $1 AND lower(btrim(nombre)) = lower(btrim($2)) AND ($3::uuid IS NULL OR id <> $3)
        ${tipo === "lineas" ? "AND familia_id = $4" : ""} LIMIT 1`,
    tipo === "lineas" ? [empresaId, d.nombre, excluirId, familiaId] : [empresaId, d.nombre, excluirId],
  );
  if (nom.rowCount) throw new ErrorCatalogo(`Ya existe una ${t.que} con ese nombre${tipo === "lineas" ? " en la familia" : ""}.`, 409);
  if (d.codigo) {
    const cod = await c.query(`SELECT 1 FROM ${t.tabla} WHERE empresa_id = $1 AND lower(codigo) = lower($2) AND ($3::uuid IS NULL OR id <> $3) LIMIT 1`, [empresaId, d.codigo, excluirId]);
    if (cod.rowCount) throw new ErrorCatalogo(`Ya existe una ${t.que} con ese código.`, 409);
  }
}

async function familiaDeLaEmpresa(c: Cliente, empresaId: string, familiaId: unknown, exigirActiva: boolean) {
  const id = texto(familiaId);
  if (!UUID.test(id)) throw new ErrorCatalogo("Seleccione la familia de la línea.");
  const f = await c.query(`SELECT activo FROM familias_producto WHERE id = $1 AND empresa_id = $2`, [id, empresaId]);
  if (!f.rowCount) throw new ErrorCatalogo("La familia indicada no existe en su empresa.");
  if (exigirActiva && f.rows[0].activo !== true) throw new ErrorCatalogo("La familia está inactiva; actívela antes de usarla en una línea.");
  return id;
}

export async function crearCatalogo(tipo: TipoCatalogo, request: Request) {
  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }
  const b = await preparar("CREAR");
  if (!b.ok) return b.respuesta;
  const empresaId = b.session.user.empresaId; // nunca del cuerpo
  try {
    const d = leer(tipo, cuerpo);
    const t = CFG[tipo];
    const fila = await enTransaccion(b.db, async (c) => {
      const familiaId = tipo === "lineas" ? await familiaDeLaEmpresa(c, empresaId, cuerpo.familiaId, true) : null;
      await verificarDuplicados(c, tipo, empresaId, d, familiaId, null);
      const cols = ["empresa_id", "codigo", "nombre", ...(t.descripcion ? ["descripcion"] : []), ...(tipo === "lineas" ? ["familia_id"] : []), "activo"];
      const vals = [empresaId, d.codigo, d.nombre, ...(t.descripcion ? [d.descripcion] : []), ...(tipo === "lineas" ? [familiaId] : []), d.activo ?? true];
      const r = await c.query(`INSERT INTO ${t.tabla} (${cols.join(",")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")}) RETURNING id`, vals);
      return (await c.query(`SELECT ${proyectar(tipo)} FROM ${t.tabla} t WHERE t.id = $1 AND t.empresa_id = $2`, [r.rows[0].id, empresaId])).rows[0];
    });
    const etiqueta = t.que.charAt(0).toUpperCase() + t.que.slice(1);
    return NextResponse.json({ message: `${etiqueta} registrada correctamente.`, [t.clave]: fila }, { status: 201 });
  } catch (error) {
    return fallo(error, tipo, "registrar");
  }
}

export async function editarCatalogo(tipo: TipoCatalogo, request: Request, id: string) {
  if (!UUID.test(id)) return NextResponse.json({ error: "Registro no encontrado." }, { status: 404 });
  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }
  const b = await preparar("EDITAR");
  if (!b.ok) return b.respuesta;
  const empresaId = b.session.user.empresaId;
  try {
    const d = leer(tipo, cuerpo);
    const t = CFG[tipo];
    const fila = await enTransaccion(b.db, async (c) => {
      const actual = await c.query(`SELECT * FROM ${t.tabla} WHERE id = $1 AND empresa_id = $2 FOR UPDATE`, [id, empresaId]);
      if (!actual.rowCount) throw new ErrorCatalogo("Registro no encontrado.", 404);
      const a = actual.rows[0];
      const activo = d.activo ?? (a.activo as boolean);
      let familiaId: string | null = null;
      if (tipo === "lineas") {
        const nueva = cuerpo.familiaId === undefined ? (a.familia_id as string) : texto(cuerpo.familiaId);
        const cambia = nueva !== a.familia_id;
        familiaId = await familiaDeLaEmpresa(c, empresaId, nueva, cambia || (activo && a.activo !== true));
        if (cambia) {
          const usos = await c.query(`SELECT 1 FROM productos WHERE empresa_id = $1 AND linea_id = $2 LIMIT 1`, [empresaId, id]);
          if (usos.rowCount) throw new ErrorCatalogo("La línea tiene productos vinculados; no puede cambiar de familia.", 409);
        }
      }
      await verificarDuplicados(c, tipo, empresaId, d, familiaId, id);
      const sets = ["codigo = $3", "nombre = $4", ...(t.descripcion ? ["descripcion = $5"] : []), ...(tipo === "lineas" ? [`familia_id = $${t.descripcion ? 6 : 5}`] : []), `activo = $${t.descripcion ? (tipo === "lineas" ? 7 : 6) : 5}`];
      const vals = [id, empresaId, d.codigo, d.nombre, ...(t.descripcion ? [d.descripcion] : []), ...(tipo === "lineas" ? [familiaId] : []), activo];
      await c.query(`UPDATE ${t.tabla} SET ${sets.join(", ")} WHERE id = $1 AND empresa_id = $2`, vals);
      return (await c.query(`SELECT ${proyectar(tipo)} FROM ${t.tabla} t WHERE t.id = $1 AND t.empresa_id = $2`, [id, empresaId])).rows[0];
    });
    return NextResponse.json({ message: "Cambios guardados correctamente.", [t.clave]: fila });
  } catch (error) {
    return fallo(error, tipo, "actualizar");
  }
}
