import { NextResponse } from "next/server";

import { borrarArchivo, guardarArchivo, leerArchivo, nuevaClave, validarArchivo } from "@/lib/almacenamiento/archivos-privados";
import { validarMetadatosDocumento } from "@/lib/clientes/documentos";
import { UUID, autorizar, leerFormulario, noEncontrado, respuestaDeError } from "@/lib/clientes/documentos-http";

type Contexto = { params: Promise<{ id: string; docId: string }> };

const idsValidos = (id: string, docId: string) => UUID.test(id) && UUID.test(docId);

/** Descarga autenticada: solo con sesión y permiso VER, y solo si el documento pertenece a la empresa de la sesión. */
export async function GET(_request: Request, contexto: Contexto) {
  const { id, docId } = await contexto.params;

  if (!idsValidos(id, docId)) return noEncontrado();

  const auth = await autorizar("VER");

  if ("respuesta" in auth) return auth.respuesta;

  try {
    const { db } = await import("@/lib/db");
    const r = await db.query(
      `SELECT nombre_archivo, almacen_clave, tipo_mime FROM cliente_documentos
        WHERE id = $1 AND cliente_id = $2 AND empresa_id = $3`,
      [docId, id, auth.sesion.user.empresaId],
    );
    const fila = r.rows[0];

    if (!fila) return noEncontrado();
    if (!fila.almacen_clave) {
      return NextResponse.json({ error: "Este documento es un enlace anterior (sin archivo almacenado)." }, { status: 404 });
    }

    const contenido = await leerArchivo(fila.almacen_clave as string);
    const nombre = encodeURIComponent(fila.nombre_archivo as string);

    return new NextResponse(new Uint8Array(contenido), {
      status: 200,
      headers: {
        "Content-Type": (fila.tipo_mime as string) || "application/octet-stream",
        "Content-Length": String(contenido.length),
        "Content-Disposition": `attachment; filename*=UTF-8''${nombre}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return respuestaDeError(e, "Error al descargar el documento del cliente:");
  }
}

/** Actualiza los metadatos y, si viene `archivo`, reemplaza el contenido (el archivo anterior se elimina del volumen). */
export async function PUT(request: Request, contexto: Contexto) {
  const { id, docId } = await contexto.params;

  if (!idsValidos(id, docId)) return noEncontrado();

  const auth = await autorizar("MODIFICAR");

  if ("respuesta" in auth) return auth.respuesta;

  const empresaId = auth.sesion.user.empresaId;
  let claveNueva: string | null = null;

  try {
    const formulario = await leerFormulario(request);
    const meta = validarMetadatosDocumento(Object.fromEntries(formulario.entries()));
    const archivo = formulario.get("archivo");
    const { db } = await import("@/lib/db");
    const actual = await db.query(
      "SELECT almacen_clave FROM cliente_documentos WHERE id = $1 AND cliente_id = $2 AND empresa_id = $3",
      [docId, id, empresaId],
    );

    if (actual.rowCount !== 1) return noEncontrado();

    const claveAnterior = (actual.rows[0].almacen_clave as string | null) ?? null;

    if (archivo instanceof File && archivo.size > 0) {
      const validado = validarArchivo(archivo.name, await archivo.arrayBuffer());

      claveNueva = nuevaClave(empresaId, id);
      await guardarArchivo(claveNueva, validado.buffer);
      await db.query(
        `UPDATE cliente_documentos
            SET tipo = $4, nombre_archivo = $5, url_archivo = NULL, almacen_clave = $6, tamano_bytes = $7, tipo_mime = $8, sha256 = $9,
                fecha_emision = $10, fecha_vencimiento = $11, observacion = $12, cargado_por = $13
          WHERE id = $1 AND cliente_id = $2 AND empresa_id = $3`,
        [docId, id, empresaId, meta.tipo, validado.nombre, claveNueva, validado.tamano, validado.mime, validado.sha256, meta.fechaEmision, meta.fechaVencimiento, meta.observacion, auth.sesion.user.id],
      );
      // Solo tras confirmar la base se elimina el archivo reemplazado.
      if (claveAnterior) await borrarArchivo(claveAnterior).catch(() => undefined);
    } else {
      await db.query(
        `UPDATE cliente_documentos SET tipo = $4, fecha_emision = $5, fecha_vencimiento = $6, observacion = $7
          WHERE id = $1 AND cliente_id = $2 AND empresa_id = $3`,
        [docId, id, empresaId, meta.tipo, meta.fechaEmision, meta.fechaVencimiento, meta.observacion],
      );
    }

    return NextResponse.json({ ok: true, id: docId });
  } catch (e) {
    if (claveNueva) await borrarArchivo(claveNueva).catch(() => undefined);

    return respuestaDeError(e, "Error al actualizar el documento del cliente:");
  }
}

/** Elimina el documento (fila + archivo del volumen). Acción explícita del usuario; no hay papelera. */
export async function DELETE(_request: Request, contexto: Contexto) {
  const { id, docId } = await contexto.params;

  if (!idsValidos(id, docId)) return noEncontrado();

  const auth = await autorizar("MODIFICAR");

  if ("respuesta" in auth) return auth.respuesta;

  try {
    const { db } = await import("@/lib/db");
    const r = await db.query(
      "DELETE FROM cliente_documentos WHERE id = $1 AND cliente_id = $2 AND empresa_id = $3 RETURNING almacen_clave",
      [docId, id, auth.sesion.user.empresaId],
    );

    if (r.rowCount !== 1) return noEncontrado();

    const clave = r.rows[0].almacen_clave as string | null;

    if (clave) await borrarArchivo(clave).catch(() => undefined);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return respuestaDeError(e, "Error al eliminar el documento del cliente:");
  }
}
