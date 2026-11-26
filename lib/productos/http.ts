/** Utilidades HTTP comunes de las rutas de Productos (sesión, permisos y transacción). */
import { NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { getAccessContext, hasPermission } from "@/lib/auth/permissions";

export const UUID_RUTA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SesionProductos = { user: { id: string; empresaId: string }; demo?: boolean };

export type PermisosProductos = { ver: boolean; crear: boolean; editar: boolean };

const error = (mensaje: string, status: number) => NextResponse.json({ error: mensaje }, { status });

/** Verifica configuración y sesión y devuelve los permisos PRODUCTOS del usuario (la decisión por acción la toma cada ruta). */
export async function autorizarProductos(): Promise<{ sesion: SesionProductos; permisos: PermisosProductos } | { respuesta: NextResponse }> {
  if (process.env.DEMO_MODE === "true") return { respuesta: error("Producto no encontrado.", 404) };
  if (!process.env.DATABASE_URL) return { respuesta: error("Servicio no disponible: base de datos no configurada.", 503) };

  const { getCurrentSession } = await import("@/lib/auth/session");
  const sesion = await getCurrentSession();

  if (!sesion) return { respuesta: error("Su sesión ha finalizado.", 401) };

  const acceso = await getAccessContext(sesion.user, sesion.demo === true);
  const tiene = (accion: string) => hasPermission(acceso, "PRODUCTOS", accion);

  return {
    sesion: sesion as unknown as SesionProductos,
    permisos: { ver: tiene("VER"), crear: tiene("CREAR"), editar: tiene("EDITAR") },
  };
}

export function sinPermiso() {
  return error("No tiene permiso para esta acción.", 403);
}

export function noEncontrado() {
  return error("Producto no encontrado.", 404);
}

export async function conTransaccion<T>(fn: (conexion: PoolClient) => Promise<T>): Promise<T> {
  const { db } = await import("@/lib/db");
  const conexion = await db.connect();

  try {
    await conexion.query("BEGIN");
    const resultado = await fn(conexion);
    await conexion.query("COMMIT");

    return resultado;
  } catch (e) {
    await conexion.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    conexion.release();
  }
}
