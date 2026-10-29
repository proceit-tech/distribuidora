import { NextResponse } from "next/server";

import { autorizarProductos, exigir, productoNoEncontrado, respuestaDeErrorDocumento } from "@/lib/productos/documentos-http";
import { registrarEvento } from "@/lib/productos/eventos";
import { UUID_RUTA, conTransaccion } from "@/lib/productos/http";

type Contexto = { params: Promise<{ id: string; version: string }> };

/**
 * Recupera una foto anterior: pasa a ser la ÚNICA vigente (productos.imagen_*) sin borrar ninguna otra; la que estaba vigente queda en el historial.
 * Solo PRODUCTOS.EDITAR. No toca imagen_url.
 */
export async function POST(_request: Request, contexto: Contexto) {
  const { id, version } = await contexto.params;

  if (!UUID_RUTA.test(id) || !/^\d{1,6}$/.test(version)) return productoNoEncontrado();

  const auth = await autorizarProductos();

  if ("respuesta" in auth) return auth.respuesta;

  const denegado = exigir("RECUPERAR_VERSION", auth.permisos, null);

  if (denegado) return denegado;

  const empresaId = auth.sesion.user.empresaId;
  const usuarioId = auth.sesion.user.id;
  const numero = Number(version);

  try {
    const resultado = await conTransaccion(async (c) => {
      const actual = await c.query("SELECT imagen_clave, imagen_nombre FROM productos WHERE id = $1 AND empresa_id = $2 FOR UPDATE", [id, empresaId]);

      if (actual.rowCount !== 1) return "NO_ENCONTRADO" as const;

      const v = await c.query(
        `SELECT id, almacen_clave, nombre_archivo, tamano_bytes, tipo_mime, sha256 FROM producto_imagen_versiones
          WHERE producto_id = $1 AND empresa_id = $2 AND version = $3`,
        [id, empresaId, numero],
      );

      if (v.rowCount !== 1) return "NO_ENCONTRADO" as const;
      if (actual.rows[0].imagen_clave === v.rows[0].almacen_clave) return "YA_VIGENTE" as const;

      const anterior = await c.query(
        "SELECT version FROM producto_imagen_versiones WHERE producto_id = $1 AND empresa_id = $2 AND almacen_clave = $3",
        [id, empresaId, actual.rows[0].imagen_clave ?? ""],
      );

      await c.query(
        `UPDATE productos SET imagen_clave = $3, imagen_nombre = $4, imagen_mime = $5, imagen_tamano = $6, imagen_sha256 = $7,
                imagen_actualizada_at = now(), imagen_actualizada_por = $8
          WHERE id = $1 AND empresa_id = $2`,
        [id, empresaId, v.rows[0].almacen_clave, v.rows[0].nombre_archivo, v.rows[0].tipo_mime, v.rows[0].tamano_bytes, v.rows[0].sha256, usuarioId],
      );
      await registrarEvento(c, {
        empresaId,
        productoId: id,
        entidad: "IMAGEN",
        entidadId: v.rows[0].id as string,
        accion: "FOTO_RECUPERADA",
        usuarioId,
        anterior: anterior.rowCount === 1 ? { version: Number(anterior.rows[0].version), nombre: actual.rows[0].imagen_nombre } : null,
        nuevo: { version: numero, nombre: v.rows[0].nombre_archivo },
      });

      return "OK" as const;
    });

    if (resultado === "NO_ENCONTRADO") return productoNoEncontrado();
    if (resultado === "YA_VIGENTE") return NextResponse.json({ error: "Esa foto ya es la vigente." }, { status: 409 });

    return NextResponse.json({ ok: true, versionVigente: numero });
  } catch (e) {
    return respuestaDeErrorDocumento(e, "Error al recuperar la foto anterior del producto:");
  }
}
