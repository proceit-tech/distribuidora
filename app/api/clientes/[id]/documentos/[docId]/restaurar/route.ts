import { NextResponse } from "next/server";

import { UUID, autorizar, conTransaccion, exigir, noEncontrado, registrarEvento, respuestaDeError } from "@/lib/clientes/documentos-http";

type Contexto = { params: Promise<{ id: string; docId: string }> };

/** Restaura un documento eliminado lógicamente (vuelve a las listas operacionales con su archivo e historial). Solo CLIENTES.EDITAR. */
export async function POST(_request: Request, contexto: Contexto) {
  const { id, docId } = await contexto.params;

  if (!UUID.test(id) || !UUID.test(docId)) return noEncontrado();

  const auth = await autorizar();

  if ("respuesta" in auth) return auth.respuesta;

  const denegado = exigir("RESTAURAR", auth.permisos, null);

  if (denegado) return denegado;

  const empresaId = auth.sesion.user.empresaId;
  const usuarioId = auth.sesion.user.id;

  try {
    const hecho = await conTransaccion(async (c) => {
      const r = await c.query(
        `UPDATE cliente_documentos SET eliminado_at = NULL, eliminado_por = NULL
          WHERE id = $1 AND cliente_id = $2 AND empresa_id = $3 AND eliminado_at IS NOT NULL
          RETURNING version_vigente, nombre_archivo`,
        [docId, id, empresaId],
      );

      if (r.rowCount !== 1) return false;

      await registrarEvento(c, {
        empresaId,
        clienteId: id,
        documentoId: docId,
        accion: "RESTAURACION",
        version: Number(r.rows[0].version_vigente),
        usuarioId,
        detalle: { nombreArchivo: r.rows[0].nombre_archivo },
      });

      return true;
    });

    return hecho ? NextResponse.json({ ok: true }) : noEncontrado();
  } catch (e) {
    return respuestaDeError(e, "Error al restaurar el documento del cliente:");
  }
}
