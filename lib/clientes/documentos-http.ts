/** Utilidades HTTP comunes de las rutas de documentos de Clientes (autenticación, permisos y lectura del formulario). */
import { NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { getAccessContext, hasPermission } from "@/lib/auth/permissions";
import { decidirAccesoDocumento, type AccionDocumento, type ContextoCargaInicial, type PermisosClientes } from "@/lib/clientes/permisos-documentos";
import { ErrorArchivo, TAMANO_MAXIMO_BYTES } from "@/lib/almacenamiento/archivos-privados";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const error = (mensaje: string, status: number) => NextResponse.json({ error: mensaje }, { status });

export type SesionCliente = { user: { id: string; empresaId: string } };

/** Verifica configuración y sesión y devuelve los permisos CLIENTES del usuario; la decisión por acción la toma `exigir`. */
export async function autorizar(): Promise<{ sesion: SesionCliente; permisos: PermisosClientes } | { respuesta: NextResponse }> {
  if (!process.env.DATABASE_URL) return { respuesta: error("Servicio no disponible: base de datos no configurada.", 503) };

  const { getCurrentSession } = await import("@/lib/auth/session");
  const sesion = await getCurrentSession();

  if (!sesion) return { respuesta: error("Sesión no válida.", 401) };

  const acceso = await getAccessContext(sesion.user, sesion.demo === true);
  const permisos: PermisosClientes = {
    ver: hasPermission(acceso, "CLIENTES", "VER"),
    editar: hasPermission(acceso, "CLIENTES", "EDITAR"),
    crear: hasPermission(acceso, "CLIENTES", "CREAR"),
  };

  return { sesion: sesion as unknown as SesionCliente, permisos };
}

/** Aplica la política de permisos; devuelve una respuesta 403 o null si se permite. */
export function exigir(accion: AccionDocumento, permisos: PermisosClientes, contexto: ContextoCargaInicial | null): NextResponse | null {
  const decision = decidirAccesoDocumento(accion, permisos, contexto);

  return decision.permitido ? null : error(decision.mensaje, decision.estado);
}

/**
 * Estado de la carga inicial del cliente dentro de la EMPRESA de la sesión: ¿lo creó este usuario y sigue abierta?
 * null = el cliente no existe en esa empresa (un cliente ajeno es indistinguible de uno inexistente).
 */
export async function contextoCargaInicial(clienteId: string, empresaId: string, usuarioId: string): Promise<ContextoCargaInicial | null> {
  const { db } = await import("@/lib/db");
  const r = await db.query(
    "SELECT (creado_por IS NOT DISTINCT FROM $3::uuid AND creado_por IS NOT NULL) AS es_creador, carga_documentos_inicial_abierta AS abierta FROM clientes WHERE id = $1 AND empresa_id = $2",
    [clienteId, empresaId, usuarioId],
  );

  return r.rowCount === 1 ? { esCreador: r.rows[0].es_creador === true, cargaInicialAbierta: r.rows[0].abierta === true } : null;
}

/** Lee el multipart limitando el tamaño ANTES de cargarlo en memoria (Content-Length) y de nuevo al validar el archivo. */
export async function leerFormulario(request: Request): Promise<FormData> {
  const largo = Number(request.headers.get("content-length") ?? "0");

  if (largo > TAMANO_MAXIMO_BYTES + 1024 * 1024) {
    throw new ErrorArchivo(`El archivo supera el máximo de ${TAMANO_MAXIMO_BYTES / 1024 / 1024} MB.`, 413);
  }

  try {
    return await request.formData();
  } catch {
    throw new ErrorArchivo("Solicitud inválida: se esperaba un formulario con el archivo.");
  }
}

export function respuestaDeError(e: unknown, contexto: string): NextResponse {
  if (e instanceof ErrorArchivo) return error(e.message, e.estado);

  const pg = e as { code?: string };

  if (e instanceof Error && !pg.code) return error(e.message, 400);

  console.error(contexto, e);

  return error("No fue posible completar la operación con el documento.", 500);
}

export const noEncontrado = () => error("Documento no encontrado.", 404);
export const clienteNoEncontrado = () => error("Cliente no encontrado.", 404);

/** Ejecuta `fn` en una transacción (BEGIN/COMMIT, ROLLBACK ante cualquier error) sobre una conexión del pool. */
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

export type AccionEvento = "CARGA" | "REEMPLAZO" | "EDICION_DATOS" | "ELIMINACION_LOGICA" | "RESTAURACION" | "RECUPERACION_VERSION";

/** Auditoría de documentos (solo altas): usuario, acción, versión y detalle. Va en la MISMA transacción que la acción auditada. */
export async function registrarEvento(
  conexion: PoolClient,
  p: { empresaId: string; clienteId: string; documentoId: string; accion: AccionEvento; version: number | null; usuarioId: string; detalle?: Record<string, unknown> },
): Promise<void> {
  await conexion.query(
    `INSERT INTO cliente_documento_eventos (empresa_id, cliente_id, documento_id, accion, version, usuario_id, detalle)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [p.empresaId, p.clienteId, p.documentoId, p.accion, p.version, p.usuarioId, JSON.stringify(p.detalle ?? {})],
  );
}
