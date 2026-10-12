import { NextResponse } from "next/server";

import { borrarArchivo, guardarArchivo, leerArchivo, nuevaClave } from "@/lib/almacenamiento/archivos-privados";
import { MIME_FOTO } from "@/lib/productos/imagen";
import { validarFoto } from "@/lib/productos/imagen-servidor";
import {
  autorizarProductos,
  bloquearContextoCargaInicial,
  contextoCargaInicial,
  exigir,
  leerFormulario,
  productoNoEncontrado,
  respuestaDeErrorDocumento,
} from "@/lib/productos/documentos-http";
import { registrarEvento } from "@/lib/productos/eventos";
import { UUID_RUTA, conTransaccion } from "@/lib/productos/http";
import { decidirAccesoDocumento } from "@/lib/productos/permisos-documentos";

type Contexto = { params: Promise<{ id: string }> };

/**
 * Foto principal PRIVADA del producto (NEX-041, PRD-REV-04). Es independiente de los documentos técnicos y NO reemplaza al enlace anterior
 * (`imagen_url`, que se conserva). Una sola foto vigente; cambiarla o quitarla NO borra el archivo anterior: queda en la auditoría.
 *   GET    → entrega la imagen (PRODUCTOS.VER), solo de la empresa de la sesión.
 *   POST   → carga o reemplaza (PRODUCTOS.EDITAR, o el creador con CREAR mientras la carga inicial siga abierta).
 *   DELETE → quita la foto vigente (PRODUCTOS.EDITAR).
 */
export async function GET(_request: Request, contexto: Contexto) {
  const { id } = await contexto.params;

  if (!UUID_RUTA.test(id)) return productoNoEncontrado();

  const auth = await autorizarProductos();

  if ("respuesta" in auth) return auth.respuesta;

  const denegado = exigir("DESCARGAR", auth.permisos, null);

  if (denegado) return denegado;

  try {
    const { db } = await import("@/lib/db");
    const r = await db.query("SELECT imagen_clave, imagen_mime FROM productos WHERE id = $1 AND empresa_id = $2", [id, auth.sesion.user.empresaId]);

    if (r.rowCount !== 1) return productoNoEncontrado();
    if (!r.rows[0].imagen_clave) return NextResponse.json({ error: "El producto no tiene foto cargada." }, { status: 404 });

    const contenido = await leerArchivo(r.rows[0].imagen_clave as string);
    const mime = MIME_FOTO.includes(r.rows[0].imagen_mime as string) ? (r.rows[0].imagen_mime as string) : "application/octet-stream";

    return new NextResponse(new Uint8Array(contenido), {
      status: 200,
      headers: { "Content-Type": mime, "Content-Length": String(contenido.length), "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return respuestaDeErrorDocumento(e, "Error al entregar la foto del producto:");
  }
}

export async function POST(request: Request, contexto: Contexto) {
  const { id } = await contexto.params;

  if (!UUID_RUTA.test(id)) return productoNoEncontrado();

  const auth = await autorizarProductos();

  if ("respuesta" in auth) return auth.respuesta;

  const empresaId = auth.sesion.user.empresaId;
  const usuarioId = auth.sesion.user.id;
  let previo: Awaited<ReturnType<typeof contextoCargaInicial>>;

  try {
    previo = await contextoCargaInicial(id, empresaId, usuarioId);
  } catch (e) {
    return respuestaDeErrorDocumento(e, "Error al verificar el producto de la foto:");
  }

  if (previo === null) return productoNoEncontrado();

  const denegado = exigir("CARGAR", auth.permisos, previo);

  if (denegado) return denegado;

  let clave: string | null = null;
  let registrada = false;

  try {
    const formulario = await leerFormulario(request);
    const archivo = formulario.get("archivo");

    if (!(archivo instanceof File)) return NextResponse.json({ error: "Seleccione la foto del producto." }, { status: 400 });

    const foto = validarFoto(archivo.name, await archivo.arrayBuffer());

    clave = nuevaClave(empresaId, id, "productos");
    await guardarArchivo(clave, foto.buffer);

    const resultado = await conTransaccion(async (c) => {
      const bloqueado = await bloquearContextoCargaInicial(c, id, empresaId, usuarioId);

      if (bloqueado === null) return { rechazo: "Producto no encontrado.", estado: 404 };

      const decision = decidirAccesoDocumento("CARGAR", auth.permisos, bloqueado);

      if (!decision.permitido) return { rechazo: decision.mensaje, estado: decision.estado };

      const anterior = await c.query("SELECT imagen_nombre, imagen_sha256, imagen_tamano FROM productos WHERE id = $1 AND empresa_id = $2", [id, empresaId]);

      await c.query(
        `UPDATE productos SET imagen_clave = $3, imagen_nombre = $4, imagen_mime = $5, imagen_tamano = $6, imagen_sha256 = $7,
                imagen_actualizada_at = now(), imagen_actualizada_por = $8
          WHERE id = $1 AND empresa_id = $2`,
        [id, empresaId, clave, foto.nombre, foto.mime, foto.tamano, foto.sha256, usuarioId],
      );
      await registrarEvento(c, {
        empresaId,
        productoId: id,
        entidad: "IMAGEN",
        accion: "FOTO_ACTUALIZADA",
        usuarioId,
        anterior: anterior.rows[0]?.imagen_nombre ? { nombre: anterior.rows[0].imagen_nombre, sha256: anterior.rows[0].imagen_sha256, tamanoBytes: Number(anterior.rows[0].imagen_tamano) } : null,
        nuevo: { nombre: foto.nombre, sha256: foto.sha256, tamanoBytes: foto.tamano, cargaInicial: decision.cargaInicial },
      });

      return { ok: true as const };
    });

    if ("rechazo" in resultado) {
      await borrarArchivo(clave).catch(() => undefined); // solo el archivo nuevo que nunca se registró

      return NextResponse.json({ error: resultado.rechazo }, { status: resultado.estado });
    }

    registrada = true;

    return NextResponse.json({ ok: true, nombre: foto.nombre, tamanoBytes: foto.tamano });
  } catch (e) {
    // Solo un archivo que NUNCA llegó a registrarse se limpia; los archivos registrados no se borran jamás.
    if (clave && !registrada) await borrarArchivo(clave).catch(() => undefined);

    return respuestaDeErrorDocumento(e, "Error al cargar la foto del producto:");
  }
}

export async function DELETE(_request: Request, contexto: Contexto) {
  const { id } = await contexto.params;

  if (!UUID_RUTA.test(id)) return productoNoEncontrado();

  const auth = await autorizarProductos();

  if ("respuesta" in auth) return auth.respuesta;

  const denegado = exigir("ELIMINAR", auth.permisos, null);

  if (denegado) return denegado;

  const empresaId = auth.sesion.user.empresaId;
  const usuarioId = auth.sesion.user.id;

  try {
    const hecho = await conTransaccion(async (c) => {
      const r = await c.query("SELECT imagen_nombre, imagen_sha256, imagen_tamano FROM productos WHERE id = $1 AND empresa_id = $2 AND imagen_clave IS NOT NULL FOR UPDATE", [id, empresaId]);

      if (r.rowCount !== 1) return false;

      await c.query(
        `UPDATE productos SET imagen_clave = NULL, imagen_nombre = NULL, imagen_mime = NULL, imagen_tamano = NULL, imagen_sha256 = NULL,
                imagen_actualizada_at = NULL, imagen_actualizada_por = NULL
          WHERE id = $1 AND empresa_id = $2`,
        [id, empresaId],
      );
      await registrarEvento(c, {
        empresaId,
        productoId: id,
        entidad: "IMAGEN",
        accion: "FOTO_ELIMINADA",
        usuarioId,
        anterior: { nombre: r.rows[0].imagen_nombre, sha256: r.rows[0].imagen_sha256, tamanoBytes: Number(r.rows[0].imagen_tamano) },
      });

      return true;
    });

    return hecho ? NextResponse.json({ ok: true, archivoConservado: true }) : NextResponse.json({ error: "El producto no tiene foto cargada." }, { status: 404 });
  } catch (e) {
    return respuestaDeErrorDocumento(e, "Error al quitar la foto del producto:");
  }
}
