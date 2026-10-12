import { NextResponse } from "next/server";
import type { Pool, PoolClient } from "pg";

import { DEPOSITOS_EN_ALCANCE } from "@/lib/movimientos/historial";

/**
 * Gestión de Depósitos (NEX-046). empresa_id y usuario SIEMPRE de la sesión. Toda escritura pasa por las funciones SQL deposito_crear /
 * deposito_editar / deposito_cambiar_estado (el rol de la aplicación no escribe en depositos); la API valida además el permiso INVENTARIO.*.
 * Sin exclusión física: se inactiva. El código es inmutable. Lectura: depósitos del alcance del usuario, activos o no (el histórico se conserva).
 */

type Db = Pick<Pool, "query">;
type F = Record<string, unknown>;

export * from "@/lib/depositos/validacion";

const SELECT_DEPOSITOS = `
  SELECT d.id, d.codigo, d.nombre, d.activo, d.sucursal_id AS "sucursalId", s.nombre AS "sucursalNombre", s.codigo AS "sucursalCodigo",
         EXISTS (SELECT 1 FROM movimientos_inventario m WHERE m.empresa_id = d.empresa_id AND (m.deposito_origen_id = d.id OR m.deposito_destino_id = d.id)) AS "conMovimientos",
         EXISTS (SELECT 1 FROM stock_saldos sa WHERE sa.empresa_id = d.empresa_id AND sa.deposito_id = d.id AND sa.cantidad <> 0) AS "conSaldo"
    FROM depositos d JOIN sucursales s ON s.empresa_id = d.empresa_id AND s.id = d.sucursal_id`;

/** Depósitos del alcance del usuario (activos e inactivos). $1 empresa, $2 usuario. */
export async function listarDepositos(db: Db, empresaId: string, usuarioId: string) {
  const [depositos, sucursales] = await Promise.all([
    db.query(`${SELECT_DEPOSITOS} WHERE d.empresa_id = $1 AND d.id IN (${DEPOSITOS_EN_ALCANCE}) ORDER BY d.activo DESC, d.nombre`, [empresaId, usuarioId]),
    // Sucursales que el usuario puede usar al crear/editar: activas y dentro de su alcance (la función SQL lo vuelve a exigir).
    db.query(
      `SELECT s.id, s.codigo, s.nombre, s.activo FROM sucursales s JOIN usuarios u ON u.empresa_id = s.empresa_id AND u.id = $2
        WHERE s.empresa_id = $1 AND (u.alcance_sucursales = 'TODAS'
              OR EXISTS (SELECT 1 FROM usuario_sucursal us WHERE us.empresa_id = u.empresa_id AND us.usuario_id = u.id AND us.sucursal_id = s.id))
        ORDER BY s.nombre`,
      [empresaId, usuarioId],
    ),
  ]);

  return { depositos: depositos.rows as F[], sucursales: sucursales.rows as F[] };
}

export async function leerDeposito(db: Db, empresaId: string, usuarioId: string, id: string) {
  const r = await db.query(`${SELECT_DEPOSITOS} WHERE d.empresa_id = $1 AND d.id = $3 AND d.id IN (${DEPOSITOS_EN_ALCANCE})`, [empresaId, usuarioId, id]);

  return (r.rows[0] as F | undefined) ?? null;
}

export async function enTransaccion<T>(db: { connect: () => Promise<PoolClient> }, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await db.connect();

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

/** Errores de las funciones SQL → respuesta HTTP en español. */
export function respuestaErrorDeposito(error: unknown, accion: string) {
  const pg = error as { code?: string; message?: string; detail?: string; constraint?: string };

  if (pg.code === "42501") return NextResponse.json({ error: "No tiene permiso para esta acción." }, { status: 403 });
  if (pg.detail === "NEX:DEPOSITO_NO_ENCONTRADO") return NextResponse.json({ error: "Depósito no encontrado." }, { status: 404 });
  if (pg.detail === "NEX:DEPOSITO_CODIGO_DUPLICADO" || pg.code === "23505") return NextResponse.json({ error: "Ya existe un depósito con ese código.", campo: "codigo" }, { status: 409 });
  if (pg.detail === "NEX:DEPOSITO_CON_SALDO") return NextResponse.json({ error: pg.message ?? "El depósito aún tiene saldo.", campo: "estado" }, { status: 409 });
  if (pg.code === "P0001") return NextResponse.json({ error: pg.message ?? "La operación no cumple las reglas de depósitos." }, { status: 400 });
  if (pg.code === "22P02" || pg.code === "23503") return NextResponse.json({ error: "Los datos del depósito no son válidos para su empresa." }, { status: 400 });
  console.error(`Error al ${accion} depósito:`, error);

  return NextResponse.json({ error: `No fue posible ${accion} el depósito.` }, { status: 500 });
}
