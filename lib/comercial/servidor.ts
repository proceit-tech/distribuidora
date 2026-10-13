import { NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { denyIfNoPermission, getAccessContext, hasPermission } from "@/lib/auth/permissions";
import { ErrorComercial, esUuid, validarCatalogoSimple, validarTipoCambio } from "@/lib/comercial/validacion";
import { cambioEnAlcance, igualDecimal, MENSAJE_ALCANCE_CAMBIO } from "@/lib/comercial/cambio-decimal";
import { SQL_VERSION_COMERCIAL, exigirVersionComercial } from "@/lib/comercial/version";
import { normalizarCambio } from "@/lib/listas-precio/calculos";

// Catálogos comerciales (Canales de venta, Zonas comerciales y Tipos de cambio). empresa_id SIEMPRE de la sesión. Permisos: LISTAS_PRECIO
// (VER / CREAR / EDITAR), porque estos catálogos alimentan las listas de precios; no se crean permisos nuevos.
// Canales y zonas: sin borrado (se inactivan). Tipos de cambio: solo altas; corregir = nueva versión; anular = retirar (historial intacto).

export type TipoSimple = "canales" | "zonas";
const CFG: Record<TipoSimple, { tabla: string; columnaLista: string; columnaCliente: string; que: string; femenino: boolean }> = {
  canales: { tabla: "canales_venta", columnaLista: "canal_venta_id", columnaCliente: "canal_venta_id", que: "canal de venta", femenino: false },
  zonas: { tabla: "zonas_comerciales", columnaLista: "zona_comercial_id", columnaCliente: "zona_comercial_id", que: "zona comercial", femenino: true },
};
const DEMO_MODE = process.env.DEMO_MODE === "true";

type Fila = Record<string, unknown>;
type Base =
  | { ok: true; session: NonNullable<Awaited<ReturnType<typeof sesion>>>; db: typeof import("@/lib/db")["db"] }
  | { ok: false; respuesta: NextResponse };

async function sesion() {
  const { getCurrentSession } = await import("@/lib/auth/session");
  return getCurrentSession();
}

export async function preparar(accion: "VER" | "CREAR" | "EDITAR"): Promise<Base> {
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
  const denegado = await denyIfNoPermission(session, "LISTAS_PRECIO", accion);
  if (denegado) return { ok: false, respuesta: denegado };
  const { db } = await import("@/lib/db");
  return { ok: true, session, db };
}

async function permisosDe(b: Extract<Base, { ok: true }>) {
  const acceso = await getAccessContext(b.session.user, b.session.demo === true);
  return { crear: hasPermission(acceso, "LISTAS_PRECIO", "CREAR"), editar: hasPermission(acceso, "LISTAS_PRECIO", "EDITAR") };
}

export function fallo(error: unknown, accion: string) {
  if (error instanceof ErrorComercial) return NextResponse.json({ error: error.message, campo: error.campo }, { status: error.estado });
  const pg = error as { code?: string; constraint?: string; message?: string };
  if (pg.code === "23505") {
    const c = pg.constraint ?? "";
    if (c.includes("tipos_cambio")) return NextResponse.json({ error: "Ya existe una cotización vigente para esa fecha y moneda; use Corregir.", campo: "fecha" }, { status: 409 });
    const campo = c.includes("codigo") ? "codigo" : "nombre";
    return NextResponse.json({ error: `Ya existe un registro con ese ${campo === "codigo" ? "código" : "nombre"}.`, campo }, { status: 409 });
  }
  if (pg.code === "22003") return NextResponse.json({ error: MENSAJE_ALCANCE_CAMBIO, campo: "cambio" }, { status: 400 });
  if (pg.code === "23503") return NextResponse.json({ error: "La moneda indicada no existe.", campo: "monedaCodigo" }, { status: 400 });
  if (pg.code === "42501") return NextResponse.json({ error: "No tiene permiso para esta acción." }, { status: 403 });
  if (pg.code === "P0001") return NextResponse.json({ error: pg.message ?? "La operación no cumple las reglas del catálogo." }, { status: 400 });
  console.error(`Error al ${accion} catálogo comercial:`, error);
  return NextResponse.json({ error: `No fue posible ${accion}.` }, { status: 500 });
}

async function leerCuerpo(request: Request): Promise<Record<string, unknown> | NextResponse> {
  try {
    const c = await request.json();
    if (c && typeof c === "object" && !Array.isArray(c)) return c as Record<string, unknown>;
  } catch {
    // cae al error común
  }
  return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
}

async function enTransaccion<T>(b: Extract<Base, { ok: true }>, fn: (c: PoolClient) => Promise<T>) {
  const c = (await b.db.connect()) as PoolClient;
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

// ── Canales de venta y zonas comerciales ─────────────────────────────────────────────────────────────

const proyectar = (tipo: TipoSimple) =>
  `t.id, t.codigo, t.nombre, t.activo, ${SQL_VERSION_COMERCIAL("t.actualizado_at")} AS version,
   (SELECT count(*)::int FROM listas_precio l WHERE l.empresa_id = t.empresa_id AND l.${CFG[tipo].columnaLista} = t.id)
   + (SELECT count(*)::int FROM lista_precio_reglas r WHERE r.empresa_id = t.empresa_id AND r.referencia_id = t.id AND r.tipo_aplicacion = '${tipo === "canales" ? "CANAL_VENTA" : "ZONA"}') AS usos,
   (SELECT count(*)::int FROM clientes cl WHERE cl.empresa_id = t.empresa_id AND cl.${CFG[tipo].columnaCliente} = t.id) AS clientes`;

export async function listarSimple(tipo: TipoSimple) {
  const b = await preparar("VER");
  if (!b.ok) return b.respuesta;
  try {
    const r = await b.db.query(`SELECT ${proyectar(tipo)} FROM ${CFG[tipo].tabla} t WHERE t.empresa_id = $1 ORDER BY t.nombre`, [b.session.user.empresaId]);
    return NextResponse.json({ [tipo]: r.rows, permisos: await permisosDe(b) });
  } catch (e) {
    return fallo(e, "cargar");
  }
}

async function duplicados(c: PoolClient, tipo: TipoSimple, empresaId: string, d: { codigo: string; nombre: string }, excluirId: string | null) {
  const t = CFG[tipo].tabla;
  await c.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`${empresaId}:${t}`]);
  const n = await c.query(`SELECT 1 FROM ${t} WHERE empresa_id = $1 AND lower(btrim(nombre)) = lower(btrim($2)) AND ($3::uuid IS NULL OR id <> $3) LIMIT 1`, [empresaId, d.nombre, excluirId]);
  if (n.rowCount) throw new ErrorComercial(`Ya existe ${CFG[tipo].femenino ? "una" : "un"} ${CFG[tipo].que} con ese nombre.`, "nombre", 409);
  const k = await c.query(`SELECT 1 FROM ${t} WHERE empresa_id = $1 AND lower(btrim(codigo)) = lower(btrim($2)) AND ($3::uuid IS NULL OR id <> $3) LIMIT 1`, [empresaId, d.codigo, excluirId]);
  if (k.rowCount) throw new ErrorComercial(`Ya existe ${CFG[tipo].femenino ? "una" : "un"} ${CFG[tipo].que} con ese código.`, "codigo", 409);
}

export async function crearSimple(tipo: TipoSimple, request: Request) {
  const cuerpo = await leerCuerpo(request);
  if (cuerpo instanceof NextResponse) return cuerpo;
  const b = await preparar("CREAR");
  if (!b.ok) return b.respuesta;
  const empresaId = b.session.user.empresaId; // nunca del cuerpo
  try {
    const d = validarCatalogoSimple(cuerpo);
    const fila = await enTransaccion(b, async (c) => {
      await duplicados(c, tipo, empresaId, d, null);
      const r = await c.query(`INSERT INTO ${CFG[tipo].tabla} (empresa_id, codigo, nombre, activo) VALUES ($1,$2,$3,$4) RETURNING id`, [empresaId, d.codigo, d.nombre, d.activo ?? true]);
      return (await c.query(`SELECT ${proyectar(tipo)} FROM ${CFG[tipo].tabla} t WHERE t.id = $1 AND t.empresa_id = $2`, [r.rows[0].id, empresaId])).rows[0];
    });
    return NextResponse.json({ message: `${CFG[tipo].femenino ? "Zona comercial registrada" : "Canal de venta registrado"} correctamente.`, registro: fila }, { status: 201 });
  } catch (e) {
    return fallo(e, "registrar");
  }
}

export async function editarSimple(tipo: TipoSimple, request: Request, id: string) {
  if (!esUuid(id)) return NextResponse.json({ error: "Registro no encontrado." }, { status: 404 });
  const cuerpo = await leerCuerpo(request);
  if (cuerpo instanceof NextResponse) return cuerpo;
  const b = await preparar("EDITAR");
  if (!b.ok) return b.respuesta;
  const empresaId = b.session.user.empresaId;
  try {
    const d = validarCatalogoSimple(cuerpo);
    const fila = await enTransaccion(b, async (c) => {
      const actual = await c.query(`SELECT activo, ${SQL_VERSION_COMERCIAL("actualizado_at")} AS version_actual FROM ${CFG[tipo].tabla} WHERE id = $1 AND empresa_id = $2 FOR UPDATE`, [id, empresaId]);
      if (!actual.rowCount) throw new ErrorComercial("Registro no encontrado.", null, 404);
      // CC-A01: con la fila bloqueada y ANTES de duplicados y de cualquier escritura.
      exigirVersionComercial(cuerpo.version, actual.rows[0].version_actual as string);
      await duplicados(c, tipo, empresaId, d, id);
      await c.query(`UPDATE ${CFG[tipo].tabla} SET codigo = $3, nombre = $4, activo = $5, actualizado_at = clock_timestamp() WHERE id = $1 AND empresa_id = $2`, [id, empresaId, d.codigo, d.nombre, d.activo ?? (actual.rows[0].activo as boolean)]);
      return (await c.query(`SELECT ${proyectar(tipo)} FROM ${CFG[tipo].tabla} t WHERE t.id = $1 AND t.empresa_id = $2`, [id, empresaId])).rows[0];
    });
    return NextResponse.json({ message: "Cambios guardados correctamente.", registro: fila });
  } catch (e) {
    return fallo(e, "actualizar");
  }
}

// ── Tipos de cambio ──────────────────────────────────────────────────────────────────────────────────

const COLUMNAS_CAMBIO = `c.id, to_char(c.fecha, 'YYYY-MM-DD') AS fecha, c.moneda_codigo AS "monedaCodigo", c.cambio::text AS cambio, c.version, c.vigente,
  coalesce(c.motivo, '') AS motivo, to_char(c.creado_at AT TIME ZONE 'America/Asuncion', 'DD/MM/YYYY HH24:MI') AS "creadoEn",
  trim(coalesce(u.nombre, '') || ' ' || coalesce(u.apellido, '')) AS "creadoPor",
  coalesce(to_char(c.retirado_at AT TIME ZONE 'America/Asuncion', 'DD/MM/YYYY HH24:MI'), '') AS "retiradoEn"`;

export async function listarCambios(request: Request) {
  const b = await preparar("VER");
  if (!b.ok) return b.respuesta;
  const historial = new URL(request.url).searchParams.get("historial") === "1";
  try {
    const empresaId = b.session.user.empresaId;
    const [filas, monedas] = await Promise.all([
      b.db.query(
        `SELECT ${COLUMNAS_CAMBIO} FROM tipos_cambio c LEFT JOIN usuarios u ON u.empresa_id = c.empresa_id AND u.id = c.creado_por
          WHERE c.empresa_id = $1 ${historial ? "" : "AND c.vigente"} ORDER BY c.fecha DESC, c.moneda_codigo, c.version DESC`,
        [empresaId],
      ),
      b.db.query(`SELECT codigo, nombre, coalesce(simbolo, '') AS simbolo FROM monedas WHERE activo = true AND codigo <> 'PYG' ORDER BY codigo`),
    ]);
    return NextResponse.json({ tiposCambio: filas.rows, monedas: monedas.rows, permisos: await permisosDe(b) });
  } catch (e) {
    return fallo(e, "cargar");
  }
}

async function monedaValida(c: PoolClient, codigo: string) {
  const m = await c.query(`SELECT activo FROM monedas WHERE codigo = $1`, [codigo]);
  if (!m.rowCount) throw new ErrorComercial("La moneda no existe.", "monedaCodigo");
  if (m.rows[0].activo !== true) throw new ErrorComercial("La moneda está inactiva.", "monedaCodigo");
}

const claveBloqueo = (empresaId: string, fecha: string, moneda: string) => `${empresaId}:tipos_cambio:${fecha}:${moneda}`;

export async function crearCambio(request: Request) {
  const cuerpo = await leerCuerpo(request);
  if (cuerpo instanceof NextResponse) return cuerpo;
  const b = await preparar("CREAR");
  if (!b.ok) return b.respuesta;
  const empresaId = b.session.user.empresaId;
  const usuarioId = b.session.user.id;
  try {
    const d = validarTipoCambio(cuerpo);
    const fila = await enTransaccion(b, async (c) => {
      await monedaValida(c, d.monedaCodigo);
      await c.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [claveBloqueo(empresaId, d.fecha, d.monedaCodigo)]);
      const vigente = await c.query(`SELECT 1 FROM tipos_cambio WHERE empresa_id = $1 AND fecha = $2 AND moneda_codigo = $3 AND vigente`, [empresaId, d.fecha, d.monedaCodigo]);
      if (vigente.rowCount) throw new ErrorComercial("Ya existe una cotización vigente para esa fecha y moneda; use Corregir.", "fecha", 409);
      // Si hubo una anulada, la nueva alta continúa su numeración de versiones (el historial no se pisa).
      const v = await c.query(`SELECT coalesce(max(version), 0) + 1 AS version FROM tipos_cambio WHERE empresa_id = $1 AND fecha = $2 AND moneda_codigo = $3`, [empresaId, d.fecha, d.monedaCodigo]);
      const r = await c.query(
        `INSERT INTO tipos_cambio (empresa_id, fecha, moneda_codigo, cambio, version, creado_por) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [empresaId, d.fecha, d.monedaCodigo, d.cambio, Number(v.rows[0].version), usuarioId],
      );
      return (await c.query(`SELECT ${COLUMNAS_CAMBIO} FROM tipos_cambio c LEFT JOIN usuarios u ON u.empresa_id = c.empresa_id AND u.id = c.creado_por WHERE c.id = $1 AND c.empresa_id = $2`, [r.rows[0].id, empresaId])).rows[0];
    });
    return NextResponse.json({ message: "Tipo de cambio registrado correctamente.", registro: fila }, { status: 201 });
  } catch (e) {
    return fallo(e, "registrar");
  }
}

/** Corregir = retirar la versión vigente y registrar la siguiente con la nueva cotización (fecha y moneda no cambian). */
export async function corregirCambio(request: Request, id: string) {
  if (!esUuid(id)) return NextResponse.json({ error: "Registro no encontrado." }, { status: 404 });
  const cuerpo = await leerCuerpo(request);
  if (cuerpo instanceof NextResponse) return cuerpo;
  const b = await preparar("EDITAR");
  if (!b.ok) return b.respuesta;
  const empresaId = b.session.user.empresaId;
  const usuarioId = b.session.user.id;
  try {
    const nuevo = normalizarCambio(typeof cuerpo.cambio === "string" ? cuerpo.cambio : typeof cuerpo.cambio === "number" ? String(cuerpo.cambio) : "");
    if (nuevo === null) throw new ErrorComercial("Ingrese una cotización mayor que cero (hasta 6 decimales).", "cambio");
    if (!cambioEnAlcance(nuevo)) throw new ErrorComercial(MENSAJE_ALCANCE_CAMBIO, "cambio");
    const motivo = typeof cuerpo.motivo === "string" && cuerpo.motivo.trim() ? cuerpo.motivo.trim() : null;
    if (motivo && motivo.length > 200) throw new ErrorComercial("El motivo no puede superar los 200 caracteres.", "motivo");
    const fila = await enTransaccion(b, async (c) => {
      const actual = await c.query(`SELECT fecha, to_char(fecha, 'YYYY-MM-DD') AS fecha_iso, moneda_codigo, cambio::text AS cambio, version, vigente FROM tipos_cambio WHERE id = $1 AND empresa_id = $2 FOR UPDATE`, [id, empresaId]);
      if (!actual.rowCount) throw new ErrorComercial("Registro no encontrado.", null, 404);
      const a = actual.rows[0] as { fecha_iso: string; moneda_codigo: string; cambio: string; version: number; vigente: boolean };
      if (!a.vigente) throw new ErrorComercial("Esa versión ya fue retirada; corrija la cotización vigente de la fecha.", null, 409);
      if (igualDecimal(a.cambio, nuevo)) throw new ErrorComercial("La cotización no cambió.", "cambio", 409);
      await c.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [claveBloqueo(empresaId, a.fecha_iso, a.moneda_codigo)]);
      await c.query(`UPDATE tipos_cambio SET vigente = false, retirado_por = $3, retirado_at = now() WHERE id = $1 AND empresa_id = $2`, [id, empresaId, usuarioId]);
      const r = await c.query(
        `INSERT INTO tipos_cambio (empresa_id, fecha, moneda_codigo, cambio, version, motivo, creado_por) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [empresaId, a.fecha_iso, a.moneda_codigo, nuevo, Number(a.version) + 1, motivo, usuarioId],
      );
      return (await c.query(`SELECT ${COLUMNAS_CAMBIO} FROM tipos_cambio c LEFT JOIN usuarios u ON u.empresa_id = c.empresa_id AND u.id = c.creado_por WHERE c.id = $1 AND c.empresa_id = $2`, [r.rows[0].id, empresaId])).rows[0];
    });
    return NextResponse.json({ message: "Cotización corregida: la versión anterior se conserva en el historial.", registro: fila });
  } catch (e) {
    return fallo(e, "corregir");
  }
}

export async function anularCambio(id: string) {
  if (!esUuid(id)) return NextResponse.json({ error: "Registro no encontrado." }, { status: 404 });
  const b = await preparar("EDITAR");
  if (!b.ok) return b.respuesta;
  const empresaId = b.session.user.empresaId;
  try {
    const hecho = await enTransaccion(b, async (c) => {
      const r = await c.query(`SELECT vigente FROM tipos_cambio WHERE id = $1 AND empresa_id = $2 FOR UPDATE`, [id, empresaId]);
      if (!r.rowCount) throw new ErrorComercial("Registro no encontrado.", null, 404);
      if (r.rows[0].vigente !== true) throw new ErrorComercial("Esa cotización ya estaba anulada o reemplazada.", null, 409);
      await c.query(`UPDATE tipos_cambio SET vigente = false, retirado_por = $3, retirado_at = now() WHERE id = $1 AND empresa_id = $2`, [id, empresaId, b.session.user.id]);
      return true;
    });
    return NextResponse.json({ ok: hecho, message: "Cotización anulada. El registro se conserva en el historial." });
  } catch (e) {
    return fallo(e, "anular");
  }
}

export type { Fila };
