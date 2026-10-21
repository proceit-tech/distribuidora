import { NextResponse } from "next/server";

import { borrarArchivo, guardarArchivo, nuevaClave, validarArchivo } from "@/lib/almacenamiento/archivos-privados";
import { validarMetadatosDocumento } from "@/lib/proveedores/documentos";
import {
  autorizarProveedores,
  bloquearContextoCargaInicial,
  contextoCargaInicial,
  exigir,
  leerFormulario,
  proveedorNoEncontrado,
  registrarEventoDocumento,
  respuestaDeErrorDocumento,
} from "@/lib/proveedores/documentos-http";
import { UUID_RUTA, conTransaccion } from "@/lib/proveedores/http";
import { decidirAccesoDocumento } from "@/lib/proveedores/permisos-documentos";

type Contexto = { params: Promise<{ id: string }> };

/**
 * Carga de un documento NUEVO del proveedor (multipart: `archivo` + tipo, fechaEmision, fechaVencimiento [ISO], observacion).
 * El archivo va al almacenamiento privado; la base guarda metadatos, clave interna, versión 1 y el evento de auditoría en una sola
 * transacción. La autorización (EDITAR, o CREAR del creador con la carga inicial abierta) se verifica antes de recibir el archivo y se
 * REVALIDA dentro de la transacción bajo bloqueo de la fila del proveedor. empresa_id siempre de la sesión.
 */
export async function POST(request: Request, contexto: Contexto) {
  const { id } = await contexto.params;

  if (!UUID_RUTA.test(id)) return proveedorNoEncontrado();

  const auth = await autorizarProveedores();

  if ("respuesta" in auth) return auth.respuesta;

  const empresaId = auth.sesion.user.empresaId;
  const usuarioId = auth.sesion.user.id;
  let previo: Awaited<ReturnType<typeof contextoCargaInicial>>;

  try {
    previo = await contextoCargaInicial(id, empresaId, usuarioId);
  } catch (e) {
    return respuestaDeErrorDocumento(e, "Error al verificar el proveedor del documento:");
  }

  if (previo === null) return proveedorNoEncontrado();

  const denegado = exigir("CARGAR", auth.permisos, previo);

  if (denegado) return denegado;

  let clave: string | null = null;
  let registrado = false;

  try {
    const formulario = await leerFormulario(request);
    const archivo = formulario.get("archivo");

    if (!(archivo instanceof File)) return NextResponse.json({ error: "Seleccione el archivo del documento." }, { status: 400 });

    const meta = validarMetadatosDocumento(Object.fromEntries(formulario.entries()));
    const validado = validarArchivo(archivo.name, await archivo.arrayBuffer());

    clave = nuevaClave(empresaId, id, "proveedores");
    await guardarArchivo(clave, validado.buffer);

    const resultado = await conTransaccion(async (c) => {
      const bloqueado = await bloquearContextoCargaInicial(c, id, empresaId, usuarioId);

      if (bloqueado === null) return { rechazo: "Proveedor no encontrado.", estado: 404 };

      const decision = decidirAccesoDocumento("CARGAR", auth.permisos, bloqueado);

      if (!decision.permitido) return { rechazo: decision.mensaje, estado: decision.estado };

      const r = await c.query(
        `INSERT INTO proveedor_documentos
           (empresa_id, proveedor_id, tipo, nombre_archivo, url_archivo, almacen_clave, tamano_bytes, tipo_mime, sha256,
            fecha_emision, fecha_vencimiento, observacion, cargado_por, version_vigente)
         VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, $9, $10, $11, $12, 1)
         RETURNING id`,
        [empresaId, id, meta.tipo, validado.nombre, clave, validado.tamano, validado.mime, validado.sha256, meta.fechaEmision, meta.fechaVencimiento, meta.observacion, usuarioId],
      );
      const nuevoId = r.rows[0].id as string;

      await c.query(
        `INSERT INTO proveedor_documento_versiones
           (empresa_id, proveedor_id, documento_id, version, almacen_clave, nombre_archivo, tamano_bytes, tipo_mime, sha256, subido_por)
         VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, $9)`,
        [empresaId, id, nuevoId, clave, validado.nombre, validado.tamano, validado.mime, validado.sha256, usuarioId],
      );
      await registrarEventoDocumento(c, {
        empresaId,
        proveedorId: id,
        documentoId: nuevoId,
        accion: "DOC_CARGA",
        usuarioId,
        nuevo: { version: 1, tipo: meta.tipo, nombreArchivo: validado.nombre, tamanoBytes: validado.tamano, sha256: validado.sha256, cargaInicial: decision.cargaInicial },
      });

      return { id: nuevoId };
    });

    if ("rechazo" in resultado) {
      await borrarArchivo(clave).catch(() => undefined); // solo el archivo nuevo que nunca se registró

      return NextResponse.json({ error: resultado.rechazo }, { status: resultado.estado });
    }

    registrado = true;

    return NextResponse.json({ ok: true, id: resultado.id, nombreArchivo: validado.nombre, tamanoBytes: validado.tamano });
  } catch (e) {
    // Solo un archivo que NUNCA llegó a registrarse se limpia; los archivos registrados no se borran jamás.
    if (clave && !registrado) await borrarArchivo(clave).catch(() => undefined);

    return respuestaDeErrorDocumento(e, "Error al cargar el documento del proveedor:");
  }
}

/** Lista los documentos ELIMINADOS lógicamente del proveedor (solo PROVEEDORES.EDITAR). Los vigentes vienen con la ficha. */
export async function GET(request: Request, contexto: Contexto) {
  const { id } = await contexto.params;

  if (!UUID_RUTA.test(id)) return proveedorNoEncontrado();

  const auth = await autorizarProveedores();

  if ("respuesta" in auth) return auth.respuesta;

  const denegado = exigir("VER_HISTORIAL", auth.permisos, null);

  if (denegado) return denegado;

  if (new URL(request.url).searchParams.get("eliminados") !== "1") {
    return NextResponse.json({ error: "Indique eliminados=1 para listar los documentos eliminados." }, { status: 400 });
  }

  try {
    const { db } = await import("@/lib/db");
    const r = await db.query(
      `SELECT id, tipo, nombre_archivo, tamano_bytes, tipo_mime, version_vigente,
              to_char(eliminado_at AT TIME ZONE 'America/Asuncion', 'DD/MM/YYYY HH24:MI') AS eliminado_en,
              coalesce(to_char(fecha_emision, 'YYYY-MM-DD'), '') AS fe, coalesce(to_char(fecha_vencimiento, 'YYYY-MM-DD'), '') AS fv, coalesce(observacion, '') AS observacion
         FROM proveedor_documentos
        WHERE empresa_id = $1 AND proveedor_id = $2 AND eliminado_at IS NOT NULL
        ORDER BY eliminado_at DESC, id`,
      [auth.sesion.user.empresaId, id],
    );

    return NextResponse.json({
      documentos: r.rows.map((f) => ({
        id: f.id as string,
        tipo: String(f.tipo),
        nombreArchivo: String(f.nombre_archivo),
        tamanoBytes: f.tamano_bytes === null ? null : Number(f.tamano_bytes),
        tipoMime: String(f.tipo_mime ?? ""),
        version: Number(f.version_vigente),
        eliminadoEn: String(f.eliminado_en),
        fechaEmision: String(f.fe),
        fechaVencimiento: String(f.fv),
        observacion: String(f.observacion),
      })),
    });
  } catch (e) {
    return respuestaDeErrorDocumento(e, "Error al listar los documentos eliminados:");
  }
}
