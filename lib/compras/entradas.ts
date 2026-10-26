/**
 * E6-A / PRO-325 — servicio de servidor de Compras → Entradas. Identidad y empresa llegan SIEMPRE de la sesión (parámetros), nunca del cliente; K1 no autentica nada.
 * Persistencia (NEX-075, ver documentacao/banco/nexit/v1/docs/PROCEDIMIENTO-NEX-075.md):
 *  · reservarEntrada: valida la forma y reserva K1 + snapshot multi-línea con COMMIT independiente ANTES de cualquier operación de stock (compras_entrada_intencion_reservar).
 *  · ejecutarEntrada: el cliente solo envía K1; dentro de BEGIN … COMMIT, compras_entrada_ejecutar usa el snapshot persistido y registra, en la MISMA transacción, el movimiento ENTRADA/COMPRA con
 *    N líneas por el motor oficial (inventario_registrar_movimiento), los metadatos de compras_entradas (proveedor ↔ movimiento) y la confirmación de la intención. El rechazo definitivo lo decide
 *    y comprueba la base; cualquier otra falla deja la intención pendiente (K1 retenida, sin K2).
 *  · consultarEntradaPendiente / reconocerEntrada: recuperación y ACK, como NEX-066 (Movimientos).
 *  · listarEntradas / leerEntrada / catalogosEntrada: solo SELECT, limitados a la empresa y a los depósitos en alcance del usuario. Importes como texto numeric (sin float).
 * Sin la migración aplicada, `moduloDisponible` es false y las rutas responden 503 (sin datos simulados).
 */
import type { Pool, PoolClient } from "pg";

import { normalizarEntrada, primerError, validarEntrada, type SnapshotEntrada } from "@/lib/compras/entradas-reglas";
import { DEPOSITOS_EN_ALCANCE } from "@/lib/movimientos/historial";

type Db = Pick<Pool, "query"> & { connect(): Promise<PoolClient> };
type Fila = Record<string, unknown>;

export class ErrorEntrada extends Error {
  constructor(mensaje: string, readonly estado: number, readonly extra: Record<string, unknown> = {}) {
    super(mensaje);
  }
}

export type IntencionEntradaDto = { clave: string; estado: string; snapshot: Record<string, unknown>; creadoEn: string; requiereRevision: boolean; evidenciaNumero: string | null; entradaId: string | null };
export type ResultadoEjecucionEntrada = { tipo: "OK"; numero: string; entradaId: string; repetido: boolean } | { tipo: "RECHAZADA"; mensaje: string };

const pg = (e: unknown) => e as { code?: string; message?: string; detail?: string };
const sinVisibilidad = (e: unknown) => pg(e).code === "42501" && pg(e).detail?.startsWith("NEX:INTENCION_SIN_VISIBILIDAD") === true;

export const MENSAJE_SIN_VISIBILIDAD =
  "La entrada anterior no puede recuperarse con los permisos actuales. Se requiere la intervención de un administrador autorizado; la operación sigue guardada y no se habilitó ninguna entrada nueva.";
const errorSinVisibilidad = () => new ErrorEntrada(MENSAJE_SIN_VISIBILIDAD, 403, { sinVisibilidad: true });
const MENSAJE_PENDIENTE = "Hay una entrada anterior sin resolver. Recupérela antes de registrar otra.";
const sinPermiso = () => new ErrorEntrada("No tiene permiso para registrar entradas de compra (requiere Compras y Movimientos).", 403);

/** ¿Está aplicada la estructura de NEX-075? Sin ella el módulo no opera (503), nunca muestra datos ficticios. */
export async function moduloDisponible(db: Pick<Pool, "query">): Promise<boolean> {
  const r = await db.query(
    `SELECT to_regclass('public.compras_entradas') IS NOT NULL AND to_regprocedure('public.compras_entrada_ejecutar(uuid,uuid,text)') IS NOT NULL AS ok`,
  );

  return (r.rows[0] as Fila | undefined)?.ok === true;
}

const dto = (f: Fila): IntencionEntradaDto => ({
  clave: String(f.clave),
  estado: String(f.estado),
  snapshot: f.snapshot as Record<string, unknown>,
  creadoEn: f.creado_at instanceof Date ? f.creado_at.toISOString() : String(f.creado_at),
  requiereRevision: f.requiere_revision === true,
  evidenciaNumero: typeof f.evidencia_numero === "string" ? f.evidencia_numero : null,
  entradaId: typeof f.entrada_id === "string" ? f.entrada_id : null,
});

const SQL_PENDIENTE = `SELECT o_clave AS clave, o_estado AS estado, o_snapshot AS snapshot, o_creado_at AS creado_at, o_requiere_revision AS requiere_revision,
                              o_evidencia_numero AS evidencia_numero, o_entrada_id AS entrada_id
                         FROM compras_entrada_intencion_pendiente($1::uuid, $2::uuid)`;

/** Valida y devuelve el snapshot canónico + K1 (UUID generado por la pantalla). La fecha de referencia es la de Asunción en el servidor. */
export function prepararReserva(cuerpo: Record<string, unknown>, hoy: string): { clave: string; snapshot: SnapshotEntrada } {
  const clave = typeof cuerpo.clave === "string" ? cuerpo.clave.trim() : "";

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clave)) throw new ErrorEntrada("Falta la clave del registro.", 400);

  const snapshot = normalizarEntrada((cuerpo.entrada && typeof cuerpo.entrada === "object" ? cuerpo.entrada : {}) as Record<string, unknown>);
  const error = primerError(validarEntrada(snapshot, hoy));

  if (error) throw new ErrorEntrada(error, 400);

  return { clave, snapshot };
}

export async function consultarEntradaPendiente(db: Db, empresaId: string, usuarioId: string): Promise<IntencionEntradaDto | null> {
  try {
    const r = await db.query(SQL_PENDIENTE, [empresaId, usuarioId]);

    return r.rows[0] ? dto(r.rows[0] as Fila) : null;
  } catch (e) {
    if (sinVisibilidad(e)) throw errorSinVisibilidad();
    if (pg(e).code === "42501") throw sinPermiso();
    throw e;
  }
}

export async function reservarEntrada(db: Db, empresaId: string, usuarioId: string, cuerpo: Record<string, unknown>, hoy: string): Promise<{ intencion: IntencionEntradaDto; nueva: boolean }> {
  const { clave, snapshot } = prepararReserva(cuerpo, hoy);
  const c = await db.connect();

  try {
    await c.query("BEGIN");
    const r = await c.query(
      `SELECT o_clave AS clave, o_estado AS estado, o_snapshot AS snapshot, o_creado_at AS creado_at, o_nueva AS nueva FROM compras_entrada_intencion_reservar($1::uuid, $2::uuid, $3, $4::jsonb)`,
      [empresaId, usuarioId, clave, JSON.stringify(snapshot)],
    );

    await c.query("COMMIT"); // checkpoint durable: a partir de aquí K1 y el snapshot sobreviven a cualquier fallo posterior

    const f = r.rows[0] as Fila;

    return { intencion: dto({ ...f, requiere_revision: false, evidencia_numero: null, entrada_id: null }), nueva: f.nueva === true };
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);

    const x = pg(e);

    if (sinVisibilidad(e)) throw new ErrorEntrada(MENSAJE_SIN_VISIBILIDAD, 409, { pendiente: true, intencion: null, sinVisibilidad: true });
    if (x.code === "42501") throw sinPermiso();
    if (x.code === "P0001" && x.detail?.startsWith("NEX:INTENCION_PENDIENTE")) {
      let invisible = false;
      const existente = await c.query(SQL_PENDIENTE, [empresaId, usuarioId]).then(
        (r) => (r.rows[0] ? dto(r.rows[0] as Fila) : null),
        (e2) => {
          invisible = sinVisibilidad(e2);

          return null;
        },
      );

      throw new ErrorEntrada(invisible ? MENSAJE_SIN_VISIBILIDAD : MENSAJE_PENDIENTE, 409, { pendiente: true, intencion: existente, ...(invisible ? { sinVisibilidad: true } : {}) });
    }
    if (x.code === "P0001" && x.detail?.startsWith("NEX:INTENCION_CONFLICTO")) throw new ErrorEntrada("La clave del registro no está disponible.", 409);
    if (x.code === "23505") throw new ErrorEntrada(MENSAJE_PENDIENTE, 409, { pendiente: true, intencion: null });
    if (x.code === "P0001") throw new ErrorEntrada(x.message ?? "Los datos de la entrada no son válidos.", 400);
    throw e;
  } finally {
    c.release();
  }
}

export async function ejecutarEntrada(db: Db, empresaId: string, usuarioId: string, clave: string): Promise<ResultadoEjecucionEntrada> {
  const c = await db.connect();
  let comprometiendo = false;

  try {
    await c.query("BEGIN");

    const f = (
      await c.query(
        `SELECT o_estado AS estado, o_entrada_id AS entrada_id, o_numero AS numero, o_repetido AS repetido, o_detalle AS detalle FROM compras_entrada_ejecutar($1::uuid, $2::uuid, $3)`,
        [empresaId, usuarioId, clave],
      )
    ).rows[0] as Fila;

    comprometiendo = true;
    await c.query("COMMIT");

    if (f.estado === "CONFIRMADA") return { tipo: "OK", numero: String(f.numero), entradaId: String(f.entrada_id), repetido: f.repetido === true };

    return { tipo: "RECHAZADA", mensaje: typeof f.detalle === "string" && f.detalle ? f.detalle : "La entrada fue rechazada por las reglas de inventario; no se registró nada." };
  } catch (e) {
    if (comprometiendo) throw e; // el COMMIT pudo haberse efectuado: resultado desconocido, la intención sigue pendiente

    await c.query("ROLLBACK").catch(() => undefined);

    const x = pg(e);

    if (x.code === "P0002") throw new ErrorEntrada("Registro no encontrado.", 404);
    if (sinVisibilidad(e)) throw errorSinVisibilidad();
    if (x.code === "42501") throw new ErrorEntrada("No tiene permiso o alcance sobre el depósito para esta entrada. El registro sigue pendiente.", 403);
    if (x.code === "P0001" && (x.detail?.startsWith("NEX:COMPRA_ENTRADA_INCONSISTENTE") || x.detail?.startsWith("NEX:INTENCION"))) {
      throw new ErrorEntrada("La entrada requiere revisión de un administrador; sigue pendiente y no se registró nada nuevo.", 409);
    }
    throw e;
  } finally {
    c.release();
  }
}

export async function reconocerEntrada(db: Db, empresaId: string, usuarioId: string, clave: string): Promise<{ numero: string; entradaId: string }> {
  const c = await db.connect();

  try {
    await c.query("BEGIN");
    const r = await c.query(`SELECT o_numero AS numero, o_entrada_id AS entrada_id FROM compras_entrada_intencion_reconocer($1::uuid, $2::uuid, $3)`, [empresaId, usuarioId, clave]);

    await c.query("COMMIT");

    const f = r.rows[0] as Fila;

    return { numero: String(f.numero), entradaId: String(f.entrada_id) };
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);

    const x = pg(e);

    if (sinVisibilidad(e)) throw errorSinVisibilidad();
    if (x.code === "42501") throw sinPermiso();
    if (x.code === "P0002") throw new ErrorEntrada("Registro no encontrado.", 404);
    if (x.code === "P0001" && x.detail?.startsWith("NEX:INTENCION_NO_CONFIRMADA")) throw new ErrorEntrada("La entrada todavía no está confirmada; no puede reconocerse.", 409);
    throw e;
  } finally {
    c.release();
  }
}

/** Un error de la entrada conserva su estado HTTP; cualquier otro es un 500 genérico sin datos del SQL. Una respuesta no conclusiva NUNCA libera la intención. */
export function respuestaDeErrorEntrada(error: unknown): { status: number; body: Record<string, unknown> } {
  if (error instanceof ErrorEntrada) return { status: error.estado, body: { error: error.message, ...error.extra } };

  return { status: 500, body: { error: "No fue posible completar la operación. La entrada puede haberse registrado." } };
}

// ── Lectura (solo SELECT) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Visible solo si el depósito destino del movimiento está en el alcance del usuario ($1 empresa, $2 usuario). */
const ALCANCE_ENTRADA = `m.deposito_destino_id IN (${DEPOSITOS_EN_ALCANCE})`;

const FROM_ENTRADAS = `
    FROM compras_entradas e
    JOIN movimientos_inventario m ON m.empresa_id = e.empresa_id AND m.id = e.movimiento_id
    LEFT JOIN depositos d ON d.empresa_id = m.empresa_id AND d.id = m.deposito_destino_id
    LEFT JOIN usuarios u ON u.empresa_id = e.empresa_id AND u.id = e.creado_por
    LEFT JOIN LATERAL (SELECT count(*)::int AS lineas, sum(l.costo_total)::text AS total, max(l.moneda_costo_codigo) AS moneda
                         FROM movimiento_lineas l WHERE l.empresa_id = m.empresa_id AND l.movimiento_id = m.id) t ON true`;

const SELECT_ENTRADA = `SELECT e.id, m.id AS "movimientoId", m.numero_movimiento AS numero, m.estado, to_char(e.fecha_operativa, 'YYYY-MM-DD') AS fecha,
         e.proveedor_id AS "proveedorId", e.proveedor_codigo AS "proveedorCodigo", e.proveedor_nombre AS "proveedorNombre", e.proveedor_documento AS "proveedorDocumento",
         m.deposito_destino_id AS "depositoId", coalesce(d.codigo, '') AS "depositoCodigo", coalesce(d.nombre, '') AS "depositoNombre",
         coalesce(e.referencia, '') AS referencia, coalesce(m.observacion, '') AS observacion, coalesce(u.usuario, '') AS usuario, e.creado_at AS "creadoEn",
         t.lineas, coalesce(t.total, '0') AS "costoTotal", coalesce(t.moneda, '') AS moneda`;

export const TAMANO_LISTA = 20;
export const ESTADOS_ENTRADA = ["REGISTRADO", "ANULADO"] as const;

export type ConsultaEntradas = { q?: string; desde?: string; hasta?: string; proveedorId?: string; depositoId?: string; estado?: string; pagina?: number };

const comodin = (t: string) => t.replace(/[!%_]/g, (ch) => `!${ch}`);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Filtros normalizados (valores desconocidos se descartan; nunca llegan a SQL como texto libre). Puro. */
export function construirConsultaEntradas(empresaId: string, usuarioId: string, c: ConsultaEntradas) {
  const params: unknown[] = [empresaId, usuarioId];
  const cond: string[] = ["e.empresa_id = $1", ALCANCE_ENTRADA];
  const agregar = (sql: (n: number) => string, valor: unknown) => {
    params.push(valor);
    cond.push(sql(params.length));
  };
  const q = (c.q ?? "").trim().slice(0, 80);

  if (c.desde && ISO.test(c.desde)) agregar((n) => `e.fecha_operativa >= $${n}::date`, c.desde);
  if (c.hasta && ISO.test(c.hasta)) agregar((n) => `e.fecha_operativa <= $${n}::date`, c.hasta);
  if (c.proveedorId && UUID.test(c.proveedorId)) agregar((n) => `e.proveedor_id = $${n}::uuid`, c.proveedorId);
  if (c.depositoId && UUID.test(c.depositoId)) agregar((n) => `m.deposito_destino_id = $${n}::uuid`, c.depositoId);
  if (c.estado && (ESTADOS_ENTRADA as readonly string[]).includes(c.estado)) agregar((n) => `m.estado = $${n}`, c.estado);
  if (q) agregar((n) => `concat_ws(' ', m.numero_movimiento, e.referencia, e.proveedor_codigo, e.proveedor_nombre, e.proveedor_documento) ILIKE $${n} ESCAPE '!'`, `%${comodin(q)}%`);

  const pagina = Math.min(1_000_000, Math.max(1, Math.floor(Number(c.pagina) || 1)));
  const where = ` WHERE ${cond.join(" AND ")}`;

  return {
    pagina,
    conteo: { sql: `SELECT count(*)::int AS total FROM compras_entradas e JOIN movimientos_inventario m ON m.empresa_id = e.empresa_id AND m.id = e.movimiento_id${where}`, params },
    lista: (p: number) => ({
      sql: `${SELECT_ENTRADA}${FROM_ENTRADAS}${where} ORDER BY e.fecha_operativa DESC, m.numero_movimiento DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      params: [...params, TAMANO_LISTA, (p - 1) * TAMANO_LISTA],
    }),
  };
}

export async function listarEntradas(db: Pick<Pool, "query">, empresaId: string, usuarioId: string, consulta: ConsultaEntradas) {
  const q = construirConsultaEntradas(empresaId, usuarioId, consulta);
  const total = Number(((await db.query(q.conteo.sql, q.conteo.params)).rows[0] as Fila).total);
  const totalPaginas = Math.max(1, Math.ceil(total / TAMANO_LISTA));
  const pagina = Math.min(q.pagina, totalPaginas);
  const lista = q.lista(pagina);
  const filas = total === 0 ? [] : (await db.query(lista.sql, lista.params)).rows;

  return { entradas: filas, total, pagina, tamano: TAMANO_LISTA, totalPaginas };
}

/** Detalle con sus líneas (del motor); null si no existe, es de otra empresa o su depósito está fuera del alcance. */
export async function leerEntrada(db: Pick<Pool, "query">, empresaId: string, usuarioId: string, id: string) {
  if (!UUID.test(id)) return null;

  const cab = await db.query(`${SELECT_ENTRADA},
         coalesce((SELECT a.numero_movimiento FROM movimientos_inventario a WHERE a.empresa_id = m.empresa_id AND a.anula_a_id = m.id), '') AS "anuladoPor"
    ${FROM_ENTRADAS} WHERE e.empresa_id = $1 AND e.id = $3::uuid AND ${ALCANCE_ENTRADA}`, [empresaId, usuarioId, id]);

  if (!cab.rowCount) return null;

  const entrada = cab.rows[0] as Fila;
  const lineas = await db.query(
    `SELECT l.id, l.producto_id AS "productoId", p.codigo AS "productoCodigo", p.descripcion AS "productoDescripcion", coalesce(um.nombre, '') AS "unidadMedidaNombre",
            l.cantidad::text AS cantidad, l.costo_unitario::text AS "costoUnitario", l.costo_total::text AS "costoTotal", coalesce(l.moneda_costo_codigo, '') AS moneda,
            coalesce(sl.codigo_lote, '') AS lote, coalesce(to_char(sl.fecha_vencimiento, 'YYYY-MM-DD'), '') AS "fechaVencimiento"
       FROM movimiento_lineas l
       JOIN productos p ON p.empresa_id = l.empresa_id AND p.id = l.producto_id
       LEFT JOIN unidades_medida um ON um.id = p.unidad_medida_id
       LEFT JOIN stock_lotes sl ON sl.empresa_id = l.empresa_id AND sl.id = l.lote_id
      WHERE l.empresa_id = $1 AND l.movimiento_id = $2::uuid
      ORDER BY p.codigo, l.id`,
    [empresaId, entrada.movimientoId],
  );

  return { ...entrada, lineasDetalle: lineas.rows };
}

/** Catálogos de la nueva entrada: proveedores activos no bloqueados, depósitos activos en alcance, productos activos con control de stock y la moneda base (sin edición). */
export async function catalogosEntrada(db: Pick<Pool, "query">, empresaId: string, usuarioId: string) {
  const [proveedores, depositos, productos, moneda] = await Promise.all([
    db.query(
      `SELECT p.id, p.codigo, p.razon_social AS nombre, coalesce(p.nombre_fantasia, '') AS fantasia,
              p.tipo_documento || ' ' || p.numero_documento || CASE WHEN p.dv IS NOT NULL THEN '-' || p.dv ELSE '' END AS documento
         FROM proveedores p WHERE p.empresa_id = $1 AND p.activo AND NOT p.bloqueado ORDER BY p.razon_social`,
      [empresaId],
    ),
    db.query(
      `SELECT d.id, d.codigo, d.nombre FROM depositos d
        WHERE d.empresa_id = $1 AND d.activo AND usuario_puede_deposito($1::uuid, $2::uuid, d.id) ORDER BY d.nombre`,
      [empresaId, usuarioId],
    ),
    db.query(
      `SELECT p.id, p.codigo, p.descripcion, coalesce(um.nombre, '') AS "unidadMedidaNombre", p.modo_control_stock AS "modoControl"
         FROM productos p LEFT JOIN unidades_medida um ON um.id = p.unidad_medida_id
        WHERE p.empresa_id = $1 AND p.activo AND p.controla_stock ORDER BY p.descripcion`,
      [empresaId],
    ),
    db.query(`SELECT moneda_base_codigo AS moneda FROM empresas WHERE id = $1`, [empresaId]),
  ]);

  return {
    proveedores: proveedores.rows,
    depositos: depositos.rows,
    productos: productos.rows,
    monedaBase: String((moneda.rows[0] as Fila | undefined)?.moneda ?? ""),
  };
}
