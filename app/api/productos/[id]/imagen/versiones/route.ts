import { NextResponse } from "next/server";

import { autorizarProductos, exigir, productoNoEncontrado, respuestaDeErrorDocumento } from "@/lib/productos/documentos-http";
import { UUID_RUTA } from "@/lib/productos/http";

type Contexto = { params: Promise<{ id: string }> };

/**
 * Historial privado de fotos del producto (NEX-042). Solo PRODUCTOS.EDITAR; siempre dentro de la empresa de la sesión.
 * Nunca devuelve la clave de almacenamiento: las versiones se identifican por su número.
 */
export async function GET(_request: Request, contexto: Contexto) {
  const { id } = await contexto.params;

  if (!UUID_RUTA.test(id)) return productoNoEncontrado();

  const auth = await autorizarProductos();

  if ("respuesta" in auth) return auth.respuesta;

  const denegado = exigir("VER_HISTORIAL", auth.permisos, null);

  if (denegado) return denegado;

  const empresaId = auth.sesion.user.empresaId;

  try {
    const { db } = await import("@/lib/db");
    const producto = await db.query("SELECT imagen_clave FROM productos WHERE id = $1 AND empresa_id = $2", [id, empresaId]);

    if (producto.rowCount !== 1) return productoNoEncontrado();

    const [versiones, eventos] = await Promise.all([
      db.query(
        `SELECT v.version, v.nombre_archivo, v.tamano_bytes, v.tipo_mime, (v.almacen_clave = $3) AS vigente,
                to_char(v.subido_at AT TIME ZONE 'America/Asuncion', 'DD/MM/YYYY HH24:MI') AS subido_en,
                trim(coalesce(u.nombre, '') || ' ' || coalesce(u.apellido, '')) AS subido_por
           FROM producto_imagen_versiones v
           LEFT JOIN usuarios u ON u.empresa_id = v.empresa_id AND u.id = v.subido_por
          WHERE v.producto_id = $1 AND v.empresa_id = $2 ORDER BY v.version DESC`,
        [id, empresaId, producto.rows[0].imagen_clave ?? ""],
      ),
      db.query(
        `SELECT e.accion, e.anterior, e.nuevo, to_char(e.creado_at AT TIME ZONE 'America/Asuncion', 'DD/MM/YYYY HH24:MI:SS') AS cuando,
                trim(coalesce(u.nombre, '') || ' ' || coalesce(u.apellido, '')) AS usuario
           FROM producto_eventos e
           LEFT JOIN usuarios u ON u.empresa_id = e.empresa_id AND u.id = e.usuario_id
          WHERE e.entidad = 'IMAGEN' AND e.producto_id = $1 AND e.empresa_id = $2 ORDER BY e.creado_at DESC, e.id LIMIT 100`,
        [id, empresaId],
      ),
    ]);

    return NextResponse.json({
      versiones: versiones.rows.map((v) => ({
        version: Number(v.version),
        nombreArchivo: String(v.nombre_archivo),
        tamanoBytes: Number(v.tamano_bytes),
        tipoMime: String(v.tipo_mime),
        vigente: v.vigente === true,
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
    return respuestaDeErrorDocumento(e, "Error al leer el historial de fotos del producto:");
  }
}
