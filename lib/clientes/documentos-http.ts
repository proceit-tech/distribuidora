/** Utilidades HTTP comunes de las rutas de documentos de Clientes (autenticación, permisos y lectura del formulario). */
import { NextResponse } from "next/server";

import { guardApi } from "@/lib/auth/permissions";
import { ErrorArchivo, TAMANO_MAXIMO_BYTES } from "@/lib/almacenamiento/archivos-privados";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const error = (mensaje: string, status: number) => NextResponse.json({ error: mensaje }, { status });

export type SesionCliente = { user: { id: string; empresaId: string } };

/** Verifica configuración, sesión y permiso. Devuelve la sesión o una respuesta de error lista para retornar. */
export async function autorizar(accion: "VER" | "MODIFICAR"): Promise<{ sesion: SesionCliente } | { respuesta: NextResponse }> {
  if (!process.env.DATABASE_URL) return { respuesta: error("Servicio no disponible: base de datos no configurada.", 503) };

  const primero = await guardApi("CLIENTES", accion === "VER" ? "VER" : "EDITAR");

  if (primero.ok) return { sesion: primero.session };

  // Cargar/reemplazar/eliminar documentos: quien puede EDITAR o CREAR clientes (el alta sube los archivos tras crear el cliente).
  if (accion === "MODIFICAR") {
    const segundo = await guardApi("CLIENTES", "CREAR");

    if (segundo.ok) return { sesion: segundo.session };
  }

  return { respuesta: primero.response };
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
