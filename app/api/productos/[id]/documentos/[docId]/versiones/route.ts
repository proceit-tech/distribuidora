import { NextResponse } from "next/server";

import { autorizarProductos, documentoNoEncontrado, exigir, respuestaDeErrorDocumento } from "@/lib/productos/documentos-http";
import { UUID_RUTA } from "@/lib/productos/http";

type Contexto = { params: Promise<{ id: string; docId: string }> };

/** Historial de versiones de un documento y su auditoría (solo PRODUCTOS.EDITAR; siempre dentro de la empresa de la sesión). */
export async function GET(_request: Request, contexto: Contexto) {
  const { id, docId } = await contexto.params;

  if (!UUID_RUTA.test(id) || !UUID_RUTA.test(docId)) return documentoNoEncontrado();

  const auth = await autorizarProductos();

  if ("respuesta" in auth) return auth.respuesta;

  const denegado = exigir("VER_HISTORIAL", auth.permisos, null);

  if (denegado) return denegado;

  const empresaId = auth.sesion.user.empresaId;

  try {
    const { db } = await import("@/lib/db");
    const documento = await db.query(
      "SELECT version_vigente, (eliminado_at IS NOT NULL) AS eliminado FROM producto_documentos WHERE id = $1 AND producto_id = $2 AND empresa_id = $3",
      [docId, id, empresaId],
    );

    if (documento.rowCount !== 1) return documentoNoEncontrado();

    const [versiones, eventos] = await Promise.all([
      db.query(
        `SELECT v.version, v.nombre_archivo, v.tamano_bytes, v.tipo_mime,
                to_char(v.subido_at AT TIME ZONE 'America/Asuncion', 'DD/MM/YYYY HH24:MI') AS subido_en,
                trim(coalesce(u.nombre, '') || ' ' || coalesce(u.apellido, '')) AS subido_por
           FROM producto_documento_versiones v
           LEFT JOIN usuarios u ON u.empresa_id = v.empresa_id AND u.id = v.subido_por
          WHERE v.documento_id = $1 AND v.producto_id = $2 AND v.empresa_id = $3 ORDER BY v.version DESC`,
        [docId, id, empresaId],
      ),
      db.query(
        `SELECT e.accion, e.anterior, e.nuevo, to_char(e.creado_at AT TIME ZONE 'America/Asuncion', 'DD/MM/YYYY HH24:MI:SS') AS cuando,
                trim(coalesce(u.nombre, '') || ' ' || coalesce(u.apellido, '')) AS usuario
           FROM producto_eventos e
           LEFT JOIN usuarios u ON u.empresa_id = e.empresa_id AND u.id = e.usuario_id
          WHERE e.entidad = 'DOCUMENTO' AND e.entidad_id = $1 AND e.producto_id = $2 AND e.empresa_id = $3 ORDER BY e.creado_at DESC, e.id LIMIT 100`,
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
        subidoPor: String(v.subido_por ?? ""),
      })),
      eventos: eventos.rows.map((e) => ({
        accion: String(e.accion),
        anterior: e.anterior as Record<string, unknown> | null,
        nuevo: e.nuevo as Record<string, unknown> | null,
        usuario: String(e.usuario ?? ""),
        cuando: String(e.cuando),
      })),
    });
  } catch (e) {
    return respuestaDeErrorDocumento(e, "Error al leer el historial del documento:");
  }
}
