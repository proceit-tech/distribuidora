import { NextResponse } from "next/server";

import { autorizarProductos, contextoCargaInicial, exigir, productoNoEncontrado, respuestaDeErrorDocumento } from "@/lib/productos/documentos-http";
import { UUID_RUTA } from "@/lib/productos/http";

type Contexto = { params: Promise<{ id: string }> };

/**
 * Cierra la carga inicial de documentos del producto recién creado. Lo llama el flujo de alta al terminar de subir sus archivos;
 * después, quien solo tiene PRODUCTOS.CREAR deja de poder agregar documentos a ese producto.
 * Permiso: PRODUCTOS.EDITAR, o el propio creador con la carga aún abierta. Idempotente para quien puede editar.
 */
export async function POST(_request: Request, contexto: Contexto) {
  const { id } = await contexto.params;

  if (!UUID_RUTA.test(id)) return productoNoEncontrado();

  const auth = await autorizarProductos();

  if ("respuesta" in auth) return auth.respuesta;

  const empresaId = auth.sesion.user.empresaId;

  try {
    const estado = await contextoCargaInicial(id, empresaId, auth.sesion.user.id);

    if (estado === null) return productoNoEncontrado();

    const denegado = exigir("FINALIZAR_CARGA", auth.permisos, estado);

    if (denegado) return denegado;

    const { db } = await import("@/lib/db");

    await db.query("UPDATE productos SET carga_documentos_inicial_abierta = false WHERE id = $1 AND empresa_id = $2", [id, empresaId]);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return respuestaDeErrorDocumento(e, "Error al cerrar la carga inicial de documentos:");
  }
}
