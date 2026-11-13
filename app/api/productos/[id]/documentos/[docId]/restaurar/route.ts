import { NextResponse } from "next/server";

import { autorizarProductos, documentoNoEncontrado, exigir, registrarEventoDocumento, respuestaDeErrorDocumento } from "@/lib/productos/documentos-http";
import { UUID_RUTA, conTransaccion } from "@/lib/productos/http";

type Contexto = { params: Promise<{ id: string; docId: string }> };

/** Restaura un documento eliminado lógicamente (vuelve a las listas con su archivo e historial). Solo PRODUCTOS.EDITAR. */
export async function POST(_request: Request, contexto: Contexto) {
  const { id, docId } = await contexto.params;

  if (!UUID_RUTA.test(id) || !UUID_RUTA.test(docId)) return documentoNoEncontrado();

  const auth = await autorizarProductos();

  if ("respuesta" in auth) return auth.respuesta;

  const denegado = exigir("RESTAURAR", auth.permisos, null);

  if (denegado) return denegado;

  const empresaId = auth.sesion.user.empresaId;
  const usuarioId = auth.sesion.user.id;

  try {
    const hecho = await conTransaccion(async (c) => {
      const r = await c.query(
        `UPDATE producto_documentos SET eliminado_at = NULL, eliminado_por = NULL
          WHERE id = $1 AND producto_id = $2 AND empresa_id = $3 AND eliminado_at IS NOT NULL
          RETURNING version_vigente, nombre_archivo`,
        [docId, id, empresaId],
      );

      if (r.rowCount !== 1) return false;

      await registrarEventoDocumento(c, {
        empresaId,
        productoId: id,
        documentoId: docId,
        accion: "DOC_RESTAURACION",
        usuarioId,
        nuevo: { version: Number(r.rows[0].version_vigente), nombreArchivo: r.rows[0].nombre_archivo },
      });

      return true;
    });

    return hecho ? NextResponse.json({ ok: true }) : documentoNoEncontrado();
  } catch (e) {
    return respuestaDeErrorDocumento(e, "Error al restaurar el documento del producto:");
  }
}
