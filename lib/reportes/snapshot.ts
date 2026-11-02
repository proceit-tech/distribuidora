import type { Pool, PoolClient } from "pg";

// Lectura con snapshot fijo, compartida por los informes que necesitan coherencia entre totales, filas, catálogos y hora de UNA solicitud.

export type DbConexion = Pick<Pool, "connect">;
export type Cliente = Pick<PoolClient, "query">;

/**
 * Ejecuta `fn` con UNA conexión dedicada dentro de una transacción de solo lectura con snapshot fijo (REPEATABLE READ): todas las consultas de `fn` ven el
 * mismo instante lógico aunque otro proceso modifique inventario_costos o stock_saldos. Siempre libera la conexión (también ante error).
 */
export async function conSnapshotLectura<T>(db: DbConexion, fn: (c: Cliente) => Promise<T>): Promise<T> {
  const cliente = await db.connect();

  try {
    await cliente.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");

    const r = await fn(cliente);

    await cliente.query("COMMIT");

    return r;
  } catch (e) {
    try {
      await cliente.query("ROLLBACK");
    } catch {
      // la conexión ya falló: se libera igualmente y se propaga el error original
    }

    throw e;
  } finally {
    cliente.release();
  }
}
