import type { Pool } from "pg";

import { SELECT_FILAS, TIPOS } from "@/lib/movimientos/shared";

/**
 * Historial de movimientos: lectura paginada en el servidor, con alcance de depósitos del usuario. Solo SELECT. empresa_id y usuario SIEMPRE de la
 * sesión.
 *
 * Política de alcance (la misma de Stock y Reposición: alcance_depositos = 'TODOS' o depósitos asignados en usuario_deposito, activos o no — el
 * historial de un depósito inactivo no desaparece): un movimiento es visible solo si TODOS los depósitos que referencia (origen y destino) están en el
 * alcance del usuario. Es la misma exigencia que inventario_anular_movimiento aplica a ambos depósitos y evita revelar, en una transferencia, el nombre o
 * las cantidades de un depósito que el usuario no puede ver. Un movimiento sin ningún depósito no se muestra.
 */

type Db = Pick<Pool, "query">;
type F = Record<string, unknown>;

export const TAMANO_DEFECTO = 20;
export const TAMANO_MAXIMO = 100;

export type CampoOrdenHistorial = "movimiento" | "producto" | "deposito" | "cantidad";
export type ConsultaHistorial = { q?: string; tipo?: string; orden?: string; dir?: string; pagina?: number; tamano?: number };

/** $1 = empresa, $2 = usuario (siempre de la sesión). */
export const DEPOSITOS_EN_ALCANCE = `SELECT d.id FROM depositos d JOIN usuarios u ON u.empresa_id = d.empresa_id AND u.id = $2
    WHERE d.empresa_id = $1 AND (u.alcance_depositos = 'TODOS'
       OR EXISTS (SELECT 1 FROM usuario_deposito ud WHERE ud.empresa_id = u.empresa_id AND ud.usuario_id = u.id AND ud.deposito_id = d.id))`;

export const ALCANCE_MOVIMIENTO = `(m.deposito_origen_id IS NOT NULL OR m.deposito_destino_id IS NOT NULL)
    AND (m.deposito_origen_id IS NULL OR m.deposito_origen_id IN (${DEPOSITOS_EN_ALCANCE}))
    AND (m.deposito_destino_id IS NULL OR m.deposito_destino_id IN (${DEPOSITOS_EN_ALCANCE}))`;

const FROM_FILAS = SELECT_FILAS.slice(SELECT_FILAS.indexOf("FROM movimientos_inventario m"));

const ORDEN: Record<CampoOrdenHistorial, string> = {
  movimiento: "m.numero_movimiento",
  producto: "p.descripcion",
  deposito: "coalesce(dde.nombre, dor.nombre, '')",
  cantidad: "l.cantidad",
};

const entero = (v: unknown, defecto: number, min: number, max: number) => {
  const n = Math.floor(Number(v));

  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : defecto;
};

/** Escapa % _ ! para usarlos literalmente en ILIKE ... ESCAPE '!'. */
const comodin = (t: string) => t.replace(/[!%_]/g, (c) => `!${c}`);

/** Normaliza y valida la consulta (valores desconocidos se descartan, nunca llegan a SQL como texto libre). */
export function normalizarConsulta(c: ConsultaHistorial) {
  const tipo = c.tipo && (TIPOS as readonly string[]).includes(c.tipo) ? c.tipo : "";
  const orden = (Object.keys(ORDEN) as CampoOrdenHistorial[]).includes(c.orden as CampoOrdenHistorial) ? (c.orden as CampoOrdenHistorial) : null;

  return {
    q: (c.q ?? "").trim().slice(0, 80),
    tipo,
    orden,
    dir: c.dir === "desc" ? ("desc" as const) : ("asc" as const),
    pagina: entero(c.pagina, 1, 1, 1_000_000),
    tamano: entero(c.tamano, TAMANO_DEFECTO, 1, TAMANO_MAXIMO),
  };
}

function filtros(c: ReturnType<typeof normalizarConsulta>, primerParametro: number) {
  const params: unknown[] = [];
  const cond: string[] = [];

  if (c.tipo) {
    params.push(c.tipo);
    cond.push(`m.tipo_movimiento = $${primerParametro + params.length - 1}`);
  }
  if (c.q) {
    params.push(`%${comodin(c.q)}%`);
    cond.push(
      `concat_ws(' ', m.numero_movimiento, p.codigo, p.descripcion, m.documento_referencia, m.motivo, dor.nombre, dde.nombre, sl.codigo_lote) ILIKE $${primerParametro + params.length - 1} ESCAPE '!'`,
    );
  }

  return { params, sql: cond.length ? ` AND ${cond.join(" AND ")}` : "" };
}

/** Construye las consultas (puro; probado sin base de datos). La ordenación siempre termina en un desempate estable. */
export function construirConsultas(empresaId: string, usuarioId: string, entrada: ConsultaHistorial, pagina: number) {
  const c = normalizarConsulta(entrada);
  const f = filtros(c, 3);
  const base = `${FROM_FILAS} WHERE m.empresa_id = $1 AND ${ALCANCE_MOVIMIENTO}${f.sql}`;
  const principal = c.orden ? `${ORDEN[c.orden]} ${c.dir === "desc" ? "DESC" : "ASC"}, ` : "m.numero_movimiento DESC, ";
  const params = [empresaId, usuarioId, ...f.params];

  return {
    normalizada: c,
    conteo: { sql: `SELECT count(*)::int AS lineas, count(DISTINCT m.id)::int AS movimientos ${base}`, params },
    lista: {
      sql: `${SELECT_FILAS.slice(0, SELECT_FILAS.indexOf("FROM movimientos_inventario m"))}${base} ORDER BY ${principal}m.numero_movimiento DESC, l.creado_at, l.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      params: [...params, c.tamano, (pagina - 1) * c.tamano],
    },
  };
}

export async function leerHistorial(db: Db, empresaId: string, usuarioId: string, entrada: ConsultaHistorial) {
  const pedida = construirConsultas(empresaId, usuarioId, entrada, 1);
  const c = pedida.normalizada;
  const [conteo, resumen] = await Promise.all([
    db.query(pedida.conteo.sql, pedida.conteo.params),
    db.query(
      `SELECT count(*)::int AS movimientos,
              count(*) FILTER (WHERE m.tipo_movimiento = 'ENTRADA')::int AS entradas,
              count(*) FILTER (WHERE m.tipo_movimiento = 'SALIDA')::int AS salidas,
              count(*) FILTER (WHERE m.tipo_movimiento = 'TRANSFERENCIA')::int AS transferencias
         FROM movimientos_inventario m WHERE m.empresa_id = $1 AND ${ALCANCE_MOVIMIENTO}`,
      [empresaId, usuarioId],
    ),
  ]);
  const total = Number((conteo.rows[0] as F).lineas);
  const totalMovimientos = Number((conteo.rows[0] as F).movimientos);
  const totalPaginas = Math.max(1, Math.ceil(total / c.tamano));
  const pagina = Math.min(c.pagina, totalPaginas);
  const consulta = construirConsultas(empresaId, usuarioId, entrada, pagina).lista;
  const filas = total === 0 ? { rows: [] } : await db.query(consulta.sql, consulta.params);

  return {
    movimientos: filas.rows,
    /** Líneas que cumplen el filtro (una fila de la tabla = una línea). */
    total,
    /** Movimientos distintos que cumplen el filtro (un movimiento puede tener varias líneas). */
    totalMovimientos,
    pagina,
    tamano: c.tamano,
    totalPaginas,
    /** Movimientos dentro del alcance del usuario, sin filtros. */
    resumen: resumen.rows[0] as { movimientos: number; entradas: number; salidas: number; transferencias: number },
  };
}

/** ¿El movimiento con ese número existe, está dentro del alcance del usuario y pertenece a su empresa? Sirve para confirmar el aviso de registro. */
export async function movimientoExiste(db: Db, empresaId: string, usuarioId: string, numero: string): Promise<boolean> {
  if (!/^[A-Za-z0-9-]{3,30}$/.test(numero)) return false;

  const r = await db.query(
    `SELECT 1 FROM movimientos_inventario m WHERE m.empresa_id = $1 AND m.numero_movimiento = $3 AND ${ALCANCE_MOVIMIENTO} LIMIT 1`,
    [empresaId, usuarioId, numero],
  );

  return (r.rowCount ?? 0) > 0;
}

/** Líneas de un movimiento dentro del alcance; vacío si no existe, es de otra empresa o referencia un depósito fuera del alcance. */
export async function leerLineasMovimiento(db: Db, empresaId: string, usuarioId: string, id: string) {
  return db.query(`${SELECT_FILAS} WHERE m.empresa_id = $1 AND m.id = $3 AND ${ALCANCE_MOVIMIENTO} ORDER BY l.creado_at, l.id`, [empresaId, usuarioId, id]);
}
