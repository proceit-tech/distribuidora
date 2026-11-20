import { NextResponse } from "next/server";

import { UUID, autorizar, clienteNoEncontrado, contextoCargaInicial, exigir, respuestaDeError } from "@/lib/clientes/documentos-http";

type Contexto = { params: Promise<{ id: string }> };

/**
 * Cierra la carga inicial de documentos del cliente recién creado (F-CLI-09-03). Lo llama el flujo de alta al terminar de
 * subir sus archivos; después, quien solo tiene CLIENTES.CREAR deja de poder agregar documentos a ese cliente.
 * Permiso: CLIENTES.EDITAR, o el propio creador con la carga aún abierta. Idempotente para quien puede editar.
 */
export async function POST(_request: Request, contexto: Contexto) {
  const { id } = await contexto.params;

  if (!UUID.test(id)) return clienteNoEncontrado();

  const auth = await autorizar();

  if ("respuesta" in auth) return auth.respuesta;

  const empresaId = auth.sesion.user.empresaId;

  try {
    const estado = await contextoCargaInicial(id, empresaId, auth.sesion.user.id);

    if (estado === null) return clienteNoEncontrado();

    const denegado = exigir("FINALIZAR_CARGA", auth.permisos, estado);

    if (denegado) return denegado;

    const { db } = await import("@/lib/db");

    await db.query("UPDATE clientes SET carga_documentos_inicial_abierta = false WHERE id = $1 AND empresa_id = $2", [id, empresaId]);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return respuestaDeError(e, "Error al cerrar la carga inicial de documentos:");
  }
}
