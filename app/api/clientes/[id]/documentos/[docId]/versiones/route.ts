import { NextResponse } from "next/server";

import { UUID, autorizar, exigir, noEncontrado, respuestaDeError } from "@/lib/clientes/documentos-http";

type Contexto = { params: Promise<{ id: string; docId: string }> };

/** Historial de versiones de un documento y su auditoría de acciones (solo CLIENTES.EDITAR; siempre dentro de la empresa de la sesión). */
export async function GET(_request: Request, contexto: Contexto) {
  const { id, docId } = await contexto.params;

  if (!UUID.test(id) || !UUID.test(docId)) return noEncontrado();

  const auth = await autorizar();

  if ("respuesta" in auth) return auth.respuesta;

  const denegado = exigir("VER_HISTORIAL", auth.permisos, null);

  if (denegado) return denegado;

  const empresaId = auth.sesion.user.empresaId;

  try {
    const { db } = await import("@/lib/db");
    const documento = await db.query(
      "SELECT version_vigente, (eliminado_at IS NOT NULL) AS eliminado FROM cliente_documentos WHERE id = $1 AND cliente_id = $2 AND empresa_id = $3",
      [docId, id, empresaId],
    );

    if (documento.rowCount !== 1) return noEncontrado();

    const [versiones, eventos] = await Promise.all([
      db.query(
        `SELECT version, nombre_archivo, tamano_bytes, tipo_mime, to_char(subido_at, 'DD/MM/YYYY HH24:MI') AS subido_en, subido_por
           FROM cliente_documento_versiones WHERE documento_id = $1 AND cliente_id = $2 AND empresa_id = $3 ORDER BY version DESC`,
        [docId, id, empresaId],
      ),
      db.query(
        `SELECT accion, version, usuario_id, detalle, to_char(creado_at, 'DD/MM/YYYY HH24:MI:SS') AS cuando
           FROM cliente_documento_eventos WHERE documento_id = $1 AND cliente_id = $2 AND empresa_id = $3 ORDER BY creado_at DESC, id LIMIT 100`,
        [docId, id, empresaId],
      ),
    ]);

    return NextResponse.json({
      versionVigente: Number(documento.rows[0].version_vigente),
      eliminado: documento.rows[0].eliminado === true,
      versiones: versiones.rows.map((v) => ({
        version: Number(v.version),
        nombreArchivo: String(v.nombre_archivo),
        tamanoBytes: Number(v.tamano_bytes),
        tipoMime: String(v.tipo_mime),
        subidoEn: String(v.subido_en),
        subidoPor: (v.subido_por as string | null) ?? null,
      })),
      eventos: eventos.rows.map((e) => ({
        accion: String(e.accion),
        version: e.version === null ? null : Number(e.version),
        usuarioId: (e.usuario_id as string | null) ?? null,
        detalle: e.detalle as Record<string, unknown>,
        cuando: String(e.cuando),
      })),
    });
  } catch (e) {
    return respuestaDeError(e, "Error al leer el historial del documento:");
  }
}
