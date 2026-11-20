import { NextResponse } from "next/server";

import { UUID, autorizar, conTransaccion, exigir, noEncontrado, registrarEvento, respuestaDeError } from "@/lib/clientes/documentos-http";

type Contexto = { params: Promise<{ id: string; docId: string; version: string }> };

/**
 * Recupera una versión anterior: pasa a ser la VIGENTE sin borrar ninguna otra (la versión que estaba vigente permanece en el
 * historial y puede volver a recuperarse). Solo CLIENTES.EDITAR; el documento no debe estar eliminado.
 */
export async function POST(_request: Request, contexto: Contexto) {
  const { id, docId, version } = await contexto.params;

  if (!UUID.test(id) || !UUID.test(docId) || !/^\d{1,6}$/.test(version)) return noEncontrado();

  const auth = await autorizar();

  if ("respuesta" in auth) return auth.respuesta;

  const denegado = exigir("RECUPERAR_VERSION", auth.permisos, null);

  if (denegado) return denegado;

  const empresaId = auth.sesion.user.empresaId;
  const usuarioId = auth.sesion.user.id;
  const numero = Number(version);

  try {
    const resultado = await conTransaccion(async (c) => {
      const actual = await c.query(
        `SELECT version_vigente, (eliminado_at IS NOT NULL) AS eliminado FROM cliente_documentos
          WHERE id = $1 AND cliente_id = $2 AND empresa_id = $3 FOR UPDATE`,
        [docId, id, empresaId],
      );

      if (actual.rowCount !== 1) return "NO_ENCONTRADO" as const;
      if (actual.rows[0].eliminado === true) return "ELIMINADO" as const;
      if (Number(actual.rows[0].version_vigente) === numero) return "YA_VIGENTE" as const;

      const v = await c.query(
        `SELECT almacen_clave, nombre_archivo, tamano_bytes, tipo_mime, sha256 FROM cliente_documento_versiones
          WHERE documento_id = $1 AND cliente_id = $2 AND empresa_id = $3 AND version = $4`,
        [docId, id, empresaId, numero],
      );

      if (v.rowCount !== 1) return "NO_ENCONTRADO" as const;

      // Solo se mueve el puntero del documento vigente a esa versión; ningún archivo ni fila del historial se borra.
      await c.query(
        `UPDATE cliente_documentos
            SET almacen_clave = $4, nombre_archivo = $5, tamano_bytes = $6, tipo_mime = $7, sha256 = $8, url_archivo = NULL, version_vigente = $9
          WHERE id = $1 AND cliente_id = $2 AND empresa_id = $3`,
        [docId, id, empresaId, v.rows[0].almacen_clave, v.rows[0].nombre_archivo, v.rows[0].tamano_bytes, v.rows[0].tipo_mime, v.rows[0].sha256, numero],
      );
      await registrarEvento(c, {
        empresaId,
        clienteId: id,
        documentoId: docId,
        accion: "RECUPERACION_VERSION",
        version: numero,
        usuarioId,
        detalle: { desdeVersion: Number(actual.rows[0].version_vigente), aVersion: numero, nombreArchivo: v.rows[0].nombre_archivo },
      });

      return "OK" as const;
    });

    if (resultado === "NO_ENCONTRADO") return noEncontrado();
    if (resultado === "ELIMINADO") return NextResponse.json({ error: "El documento está eliminado: restáurelo antes de recuperar una versión." }, { status: 409 });
    if (resultado === "YA_VIGENTE") return NextResponse.json({ error: "Esa versión ya es la vigente." }, { status: 409 });

    return NextResponse.json({ ok: true, versionVigente: numero });
  } catch (e) {
    return respuestaDeError(e, "Error al recuperar la versión del documento:");
  }
}
