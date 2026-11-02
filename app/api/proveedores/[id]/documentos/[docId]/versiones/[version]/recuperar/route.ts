import { NextResponse } from "next/server";

import { autorizarProveedores, documentoNoEncontrado, exigir, registrarEventoDocumento, respuestaDeErrorDocumento } from "@/lib/proveedores/documentos-http";
import { UUID_RUTA, conTransaccion } from "@/lib/proveedores/http";

type Contexto = { params: Promise<{ id: string; docId: string; version: string }> };

/**
 * Recupera una versión anterior: pasa a ser la VIGENTE sin borrar ninguna otra (la que estaba vigente permanece en el historial y
 * puede volver a recuperarse). Solo PROVEEDORES.EDITAR; el documento no debe estar eliminado.
 */
export async function POST(_request: Request, contexto: Contexto) {
  const { id, docId, version } = await contexto.params;

  if (!UUID_RUTA.test(id) || !UUID_RUTA.test(docId) || !/^\d{1,6}$/.test(version)) return documentoNoEncontrado();

  const auth = await autorizarProveedores();

  if ("respuesta" in auth) return auth.respuesta;

  const denegado = exigir("RECUPERAR_VERSION", auth.permisos, null);

  if (denegado) return denegado;

  const empresaId = auth.sesion.user.empresaId;
  const usuarioId = auth.sesion.user.id;
  const numero = Number(version);

  try {
    const resultado = await conTransaccion(async (c) => {
      const actual = await c.query(
        `SELECT version_vigente, (eliminado_at IS NOT NULL) AS eliminado FROM proveedor_documentos
          WHERE id = $1 AND proveedor_id = $2 AND empresa_id = $3 FOR UPDATE`,
        [docId, id, empresaId],
      );

      if (actual.rowCount !== 1) return "NO_ENCONTRADO" as const;
      if (actual.rows[0].eliminado === true) return "ELIMINADO" as const;
      if (Number(actual.rows[0].version_vigente) === numero) return "YA_VIGENTE" as const;

      const v = await c.query(
        `SELECT almacen_clave, nombre_archivo, tamano_bytes, tipo_mime, sha256 FROM proveedor_documento_versiones
          WHERE documento_id = $1 AND proveedor_id = $2 AND empresa_id = $3 AND version = $4`,
        [docId, id, empresaId, numero],
      );

      if (v.rowCount !== 1) return "NO_ENCONTRADO" as const;

      // Solo se mueve el puntero del documento vigente a esa versión; ningún archivo ni fila del historial se borra.
      await c.query(
        `UPDATE proveedor_documentos
            SET almacen_clave = $4, nombre_archivo = $5, tamano_bytes = $6, tipo_mime = $7, sha256 = $8, url_archivo = NULL, version_vigente = $9
          WHERE id = $1 AND proveedor_id = $2 AND empresa_id = $3`,
        [docId, id, empresaId, v.rows[0].almacen_clave, v.rows[0].nombre_archivo, v.rows[0].tamano_bytes, v.rows[0].tipo_mime, v.rows[0].sha256, numero],
      );
      await registrarEventoDocumento(c, {
        empresaId,
        proveedorId: id,
        documentoId: docId,
        accion: "DOC_RECUPERACION",
        usuarioId,
        anterior: { version: Number(actual.rows[0].version_vigente) },
        nuevo: { version: numero, nombreArchivo: v.rows[0].nombre_archivo },
      });

      return "OK" as const;
    });

    if (resultado === "NO_ENCONTRADO") return documentoNoEncontrado();
    if (resultado === "ELIMINADO") return NextResponse.json({ error: "El documento está eliminado: restáurelo antes de recuperar una versión." }, { status: 409 });
    if (resultado === "YA_VIGENTE") return NextResponse.json({ error: "Esa versión ya es la vigente." }, { status: 409 });

    return NextResponse.json({ ok: true, versionVigente: numero });
  } catch (e) {
    return respuestaDeErrorDocumento(e, "Error al recuperar la versión del documento:");
  }
}
