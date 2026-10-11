/** Utilidades HTTP comunes de las rutas de documentos de Clientes (autenticación, permisos y lectura del formulario). */
import { NextResponse } from "next/server";

import { getAccessContext, hasPermission } from "@/lib/auth/permissions";
import { decidirAccesoDocumento, type AccionDocumento, type PermisosClientes } from "@/lib/clientes/permisos-documentos";
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
export function exigir(accion: AccionDocumento, permisos: PermisosClientes, antiguedadClienteMs: number | null): NextResponse | null {
  const decision = decidirAccesoDocumento(accion, permisos, antiguedadClienteMs);

  return decision.permitido ? null : error(decision.mensaje, decision.estado);
}

/** Milisegundos desde la creación del cliente de la EMPRESA de la sesión (null si el cliente no existe en esa empresa). */
export async function antiguedadDelCliente(clienteId: string, empresaId: string): Promise<number | null> {
  const { db } = await import("@/lib/db");
  const r = await db.query(
    "SELECT (EXTRACT(EPOCH FROM (now() - creado_at)) * 1000)::bigint AS ms FROM clientes WHERE id = $1 AND empresa_id = $2",
    [clienteId, empresaId],
  );

  return r.rowCount === 1 ? Number(r.rows[0].ms) : null;
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
