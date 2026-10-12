import { NextResponse } from "next/server";

import { leerArchivo } from "@/lib/almacenamiento/archivos-privados";
import { MIME_FOTO } from "@/lib/productos/imagen";
import { autorizarProductos, exigir, productoNoEncontrado, respuestaDeErrorDocumento } from "@/lib/productos/documentos-http";
import { UUID_RUTA } from "@/lib/productos/http";

type Contexto = { params: Promise<{ id: string; version: string }> };

/** Entrega una foto anterior del historial (NEX-042). Solo PRODUCTOS.EDITAR, de la empresa de la sesión; sin caché. */
export async function GET(_request: Request, contexto: Contexto) {
  const { id, version } = await contexto.params;

  if (!UUID_RUTA.test(id) || !/^\d{1,6}$/.test(version)) return productoNoEncontrado();

  const auth = await autorizarProductos();

  if ("respuesta" in auth) return auth.respuesta;

  const denegado = exigir("VER_HISTORIAL", auth.permisos, null);

  if (denegado) return denegado;

  try {
    const { db } = await import("@/lib/db");
    const r = await db.query(
      "SELECT almacen_clave, tipo_mime FROM producto_imagen_versiones WHERE producto_id = $1 AND empresa_id = $2 AND version = $3",
      [id, auth.sesion.user.empresaId, Number(version)],
    );

    if (r.rowCount !== 1) return productoNoEncontrado();

    const contenido = await leerArchivo(r.rows[0].almacen_clave as string);
    const mime = MIME_FOTO.includes(r.rows[0].tipo_mime as string) ? (r.rows[0].tipo_mime as string) : "application/octet-stream";

    return new NextResponse(new Uint8Array(contenido), {
      status: 200,
      headers: { "Content-Type": mime, "Content-Length": String(contenido.length), "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return respuestaDeErrorDocumento(e, "Error al entregar la foto anterior del producto:");
  }
}
