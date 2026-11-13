/** Utilidades HTTP de las rutas de documentos de Proveedores (formulario multipart, contexto de carga inicial y errores). */
import { NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { ErrorArchivo, TAMANO_MAXIMO_BYTES } from "@/lib/almacenamiento/archivos-privados";
import { ErrorValidacion } from "@/lib/proveedores/errores";
import { autorizarProveedores, sinPermiso, type PermisosProveedores } from "@/lib/proveedores/http";
import { decidirAccesoDocumento, type AccionDocumento, type ContextoCargaInicial } from "@/lib/proveedores/permisos-documentos";
import { registrarEvento } from "@/lib/proveedores/sincronizar";

export { autorizarProveedores, sinPermiso };
export type { PermisosProveedores };

/** Aplica la política de permisos; devuelve la respuesta 403 o null si se permite. */
export function exigir(accion: AccionDocumento, permisos: PermisosProveedores, contexto: ContextoCargaInicial | null): NextResponse | null {
  const decision = decidirAccesoDocumento(accion, permisos, contexto);

  return decision.permitido ? null : NextResponse.json({ error: decision.mensaje }, { status: decision.estado });
}

const CONSULTA_CONTEXTO =
  "SELECT (creado_por IS NOT DISTINCT FROM $3::uuid AND creado_por IS NOT NULL) AS es_creador, carga_documentos_inicial_abierta AS abierta FROM proveedores WHERE id = $1 AND empresa_id = $2";

/** Estado de la carga inicial dentro de la EMPRESA de la sesión: null = el proveedor no existe en esa empresa. */
export async function contextoCargaInicial(proveedorId: string, empresaId: string, usuarioId: string): Promise<ContextoCargaInicial | null> {
  const { db } = await import("@/lib/db");
  const r = await db.query(CONSULTA_CONTEXTO, [proveedorId, empresaId, usuarioId]);

  return r.rowCount === 1 ? { esCreador: r.rows[0].es_creador === true, cargaInicialAbierta: r.rows[0].abierta === true } : null;
}

/**
 * Igual que `contextoCargaInicial` pero DENTRO de la transacción y con bloqueo de la fila del proveedor: se serializa con el cierre de
 * la carga inicial y con la edición (ambas actualizan esa fila), de modo que quien solo tiene PROVEEDORES.CREAR no puede grabar
 * después del cierre (mismo control que F-CLI-10-01).
 */
export async function bloquearContextoCargaInicial(conexion: PoolClient, proveedorId: string, empresaId: string, usuarioId: string): Promise<ContextoCargaInicial | null> {
  const r = await conexion.query(`${CONSULTA_CONTEXTO} FOR UPDATE`, [proveedorId, empresaId, usuarioId]);

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

export function respuestaDeErrorDocumento(e: unknown, contexto: string): NextResponse {
  if (e instanceof ErrorArchivo) return NextResponse.json({ error: e.message }, { status: e.estado });
  if (e instanceof ErrorValidacion) return NextResponse.json({ error: e.message, campo: e.campo }, { status: e.estado });

  console.error(contexto, e);

  return NextResponse.json({ error: "No fue posible completar la operación con el documento." }, { status: 500 });
}

export const documentoNoEncontrado = () => NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
export const proveedorNoEncontrado = () => NextResponse.json({ error: "Proveedor no encontrado." }, { status: 404 });

export type AccionEventoDocumento = "DOC_CARGA" | "DOC_REEMPLAZO" | "DOC_EDICION" | "DOC_ELIMINACION" | "DOC_RESTAURACION" | "DOC_RECUPERACION";

/** Auditoría de documentos en la MISMA transacción que la acción (proveedor_eventos, entidad DOCUMENTO). */
export async function registrarEventoDocumento(
  conexion: PoolClient,
  p: { empresaId: string; proveedorId: string; documentoId: string; accion: AccionEventoDocumento; usuarioId: string; anterior?: unknown; nuevo?: unknown },
) {
  await registrarEvento(conexion, { empresaId: p.empresaId, proveedorId: p.proveedorId, entidad: "DOCUMENTO", entidadId: p.documentoId, accion: p.accion, anterior: p.anterior, nuevo: p.nuevo, usuarioId: p.usuarioId });
}
