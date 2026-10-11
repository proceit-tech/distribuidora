import { NextResponse } from "next/server";

import { borrarArchivo, guardarArchivo, nuevaClave, validarArchivo } from "@/lib/almacenamiento/archivos-privados";
import { validarMetadatosDocumento } from "@/lib/clientes/documentos";
import { UUID, autorizar, clienteNoEncontrado, leerFormulario, respuestaDeError } from "@/lib/clientes/documentos-http";

type Contexto = { params: Promise<{ id: string }> };

/**
 * Carga de un documento del cliente (multipart: `archivo` + tipo, fechaEmision, fechaVencimiento, observacion).
 * El archivo va al almacenamiento privado; la base guarda solo metadatos y la clave interna. empresa_id siempre de la sesión.
 */
export async function POST(request: Request, contexto: Contexto) {
  const { id } = await contexto.params;

  if (!UUID.test(id)) return clienteNoEncontrado();

  const auth = await autorizar("MODIFICAR");

  if ("respuesta" in auth) return auth.respuesta;

  const empresaId = auth.sesion.user.empresaId;
  let clave: string | null = null;

  try {
    const formulario = await leerFormulario(request);
    const archivo = formulario.get("archivo");

    if (!(archivo instanceof File)) throw new Error("Seleccione el archivo del documento.");

    const meta = validarMetadatosDocumento(Object.fromEntries(formulario.entries()));
    const validado = validarArchivo(archivo.name, await archivo.arrayBuffer());
    const { db } = await import("@/lib/db");
    const cliente = await db.query("SELECT 1 FROM clientes WHERE id = $1 AND empresa_id = $2", [id, empresaId]);

    if (cliente.rowCount !== 1) return clienteNoEncontrado();

    clave = nuevaClave(empresaId, id);
    await guardarArchivo(clave, validado.buffer);

    const r = await db.query(
      `INSERT INTO cliente_documentos
         (empresa_id, cliente_id, tipo, nombre_archivo, url_archivo, almacen_clave, tamano_bytes, tipo_mime, sha256,
          fecha_emision, fecha_vencimiento, observacion, cargado_por)
       VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [empresaId, id, meta.tipo, validado.nombre, clave, validado.tamano, validado.mime, validado.sha256, meta.fechaEmision, meta.fechaVencimiento, meta.observacion, auth.sesion.user.id],
    );

    return NextResponse.json({ ok: true, id: r.rows[0].id as string, nombreArchivo: validado.nombre, tamanoBytes: validado.tamano });
  } catch (e) {
    // Si la base falló después de escribir el archivo, no queda un archivo huérfano.
    if (clave) await borrarArchivo(clave).catch(() => undefined);

    return respuestaDeError(e, "Error al cargar el documento del cliente:");
  }
}
