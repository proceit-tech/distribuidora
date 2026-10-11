import { NextResponse } from "next/server";

import { borrarArchivo, guardarArchivo, leerArchivo, nuevaClave, validarArchivo } from "@/lib/almacenamiento/archivos-privados";
import { validarMetadatosDocumento } from "@/lib/proveedores/documentos";
import { autorizarProveedores, documentoNoEncontrado, exigir, leerFormulario, registrarEventoDocumento, respuestaDeErrorDocumento } from "@/lib/proveedores/documentos-http";
import { UUID_RUTA, conTransaccion } from "@/lib/proveedores/http";

type Contexto = { params: Promise<{ id: string; docId: string }> };

const idsValidos = (id: string, docId: string) => UUID_RUTA.test(id) && UUID_RUTA.test(docId);

/**
 * Descarga autenticada. Sin parámetros: la versión VIGENTE de un documento no eliminado (PROVEEDORES.VER). Con `?version=n`
 * (versión anterior) o de un documento eliminado lógicamente: solo PROVEEDORES.EDITAR (historial). Siempre con la empresa de la sesión.
 */
export async function GET(request: Request, contexto: Contexto) {
  const { id, docId } = await contexto.params;

  if (!idsValidos(id, docId)) return documentoNoEncontrado();

  const auth = await autorizarProveedores();

  if ("respuesta" in auth) return auth.respuesta;

  const denegado = exigir("DESCARGAR", auth.permisos, null);

  if (denegado) return denegado;

  const versionPedida = new URL(request.url).searchParams.get("version");

  if (versionPedida !== null && !/^\d{1,6}$/.test(versionPedida)) return documentoNoEncontrado();

  try {
    const { db } = await import("@/lib/db");
    const empresaId = auth.sesion.user.empresaId;
    const r = await db.query(
      `SELECT nombre_archivo, almacen_clave, tipo_mime, version_vigente, (eliminado_at IS NOT NULL) AS eliminado
         FROM proveedor_documentos WHERE id = $1 AND proveedor_id = $2 AND empresa_id = $3`,
      [docId, id, empresaId],
    );
    const fila = r.rows[0];

    if (!fila) return documentoNoEncontrado();

    const esVigente = versionPedida === null || Number(versionPedida) === Number(fila.version_vigente);

    if (fila.eliminado === true || !esVigente) {
      const sinHistorial = exigir("VER_HISTORIAL", auth.permisos, null);

      if (sinHistorial) return sinHistorial;
    }

    let clave = fila.almacen_clave as string | null;
    let nombre = fila.nombre_archivo as string;
    let mime = (fila.tipo_mime as string) || "application/octet-stream";

    if (!esVigente) {
      const v = await db.query(
        `SELECT almacen_clave, nombre_archivo, tipo_mime FROM proveedor_documento_versiones
          WHERE documento_id = $1 AND proveedor_id = $2 AND empresa_id = $3 AND version = $4`,
        [docId, id, empresaId, Number(versionPedida)],
      );

      if (v.rowCount !== 1) return documentoNoEncontrado();

      clave = v.rows[0].almacen_clave as string;
      nombre = v.rows[0].nombre_archivo as string;
      mime = (v.rows[0].tipo_mime as string) || mime;
    }

    if (!clave) return NextResponse.json({ error: "Este documento es un enlace anterior (sin archivo almacenado)." }, { status: 404 });

    const contenido = await leerArchivo(clave);

    return new NextResponse(new Uint8Array(contenido), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(contenido.length),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return respuestaDeErrorDocumento(e, "Error al descargar el documento del proveedor:");
  }
}

/**
 * Actualiza los metadatos y, si viene `archivo`, crea una NUEVA VERSIÓN (la anterior se conserva en el historial y puede
 * recuperarse). Solo PROVEEDORES.EDITAR; un documento eliminado debe restaurarse antes. Ninguna versión se borra físicamente.
 */
export async function PUT(request: Request, contexto: Contexto) {
  const { id, docId } = await contexto.params;

  if (!idsValidos(id, docId)) return documentoNoEncontrado();

  const auth = await autorizarProveedores();

  if ("respuesta" in auth) return auth.respuesta;

  const denegado = exigir("EDITAR_DATOS", auth.permisos, null);

  if (denegado) return denegado;

  const empresaId = auth.sesion.user.empresaId;
  const usuarioId = auth.sesion.user.id;
  let claveNueva: string | null = null;
  let registrada = false;

  try {
    const formulario = await leerFormulario(request);
    const meta = validarMetadatosDocumento(Object.fromEntries(formulario.entries()));
    const archivo = formulario.get("archivo");
    const validado = archivo instanceof File && archivo.size > 0 ? validarArchivo(archivo.name, await archivo.arrayBuffer()) : null;

    if (validado) {
      claveNueva = nuevaClave(empresaId, id, "proveedores");
      await guardarArchivo(claveNueva, validado.buffer);
    }

    const resultado = await conTransaccion(async (c) => {
      const actual = await c.query(
        `SELECT version_vigente, nombre_archivo, almacen_clave, tipo, (eliminado_at IS NOT NULL) AS eliminado
           FROM proveedor_documentos WHERE id = $1 AND proveedor_id = $2 AND empresa_id = $3 FOR UPDATE`,
        [docId, id, empresaId],
      );

      if (actual.rowCount !== 1) return "NO_ENCONTRADO" as const;
      if (actual.rows[0].eliminado === true) return "ELIMINADO" as const;

      if (validado && claveNueva) {
        const anterior = Number(actual.rows[0].version_vigente);
        const maxima = await c.query("SELECT COALESCE(MAX(version), 0) AS v FROM proveedor_documento_versiones WHERE documento_id = $1 AND empresa_id = $2", [docId, empresaId]);

        // Documento anterior sin historial (por ejemplo un enlace legado o sin versión 1): se incorpora su versión actual al historial.
        if (Number(maxima.rows[0].v) === 0 && actual.rows[0].almacen_clave) {
          await c.query(
            `INSERT INTO proveedor_documento_versiones
               (empresa_id, proveedor_id, documento_id, version, almacen_clave, nombre_archivo, tamano_bytes, tipo_mime, sha256, subido_por)
             SELECT empresa_id, proveedor_id, id, 1, almacen_clave, nombre_archivo, tamano_bytes, tipo_mime, sha256, cargado_por
               FROM proveedor_documentos WHERE id = $1 AND empresa_id = $2`,
            [docId, empresaId],
          );
        }

        const siguiente = Math.max(Number(maxima.rows[0].v), anterior, actual.rows[0].almacen_clave ? 1 : 0) + 1;

        await c.query(
          `INSERT INTO proveedor_documento_versiones
             (empresa_id, proveedor_id, documento_id, version, almacen_clave, nombre_archivo, tamano_bytes, tipo_mime, sha256, subido_por)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [empresaId, id, docId, siguiente, claveNueva, validado.nombre, validado.tamano, validado.mime, validado.sha256, usuarioId],
        );
        await c.query(
          `UPDATE proveedor_documentos
              SET tipo = $4, nombre_archivo = $5, url_archivo = NULL, almacen_clave = $6, tamano_bytes = $7, tipo_mime = $8, sha256 = $9,
                  fecha_emision = $10, fecha_vencimiento = $11, observacion = $12, cargado_por = $13, version_vigente = $14
            WHERE id = $1 AND proveedor_id = $2 AND empresa_id = $3`,
          [docId, id, empresaId, meta.tipo, validado.nombre, claveNueva, validado.tamano, validado.mime, validado.sha256, meta.fechaEmision, meta.fechaVencimiento, meta.observacion, usuarioId, siguiente],
        );
        await registrarEventoDocumento(c, {
          empresaId,
          proveedorId: id,
          documentoId: docId,
          accion: "DOC_REEMPLAZO",
          usuarioId,
          anterior: { version: anterior, nombreArchivo: actual.rows[0].nombre_archivo },
          nuevo: { version: siguiente, nombreArchivo: validado.nombre, sha256: validado.sha256 },
        });
      } else {
        await c.query(
          `UPDATE proveedor_documentos SET tipo = $4, fecha_emision = $5, fecha_vencimiento = $6, observacion = $7
            WHERE id = $1 AND proveedor_id = $2 AND empresa_id = $3`,
          [docId, id, empresaId, meta.tipo, meta.fechaEmision, meta.fechaVencimiento, meta.observacion],
        );
        await registrarEventoDocumento(c, {
          empresaId,
          proveedorId: id,
          documentoId: docId,
          accion: "DOC_EDICION",
          usuarioId,
          anterior: { tipo: actual.rows[0].tipo },
          nuevo: { tipo: meta.tipo, fechaEmision: meta.fechaEmision, fechaVencimiento: meta.fechaVencimiento },
        });
      }

      return "OK" as const;
    });

    if (resultado === "NO_ENCONTRADO") {
      if (claveNueva) await borrarArchivo(claveNueva).catch(() => undefined);

      return documentoNoEncontrado();
    }

    if (resultado === "ELIMINADO") {
      if (claveNueva) await borrarArchivo(claveNueva).catch(() => undefined);

      return NextResponse.json({ error: "El documento está eliminado: restáurelo antes de modificarlo." }, { status: 409 });
    }

    registrada = true;

    return NextResponse.json({ ok: true, id: docId });
  } catch (e) {
    if (claveNueva && !registrada) await borrarArchivo(claveNueva).catch(() => undefined);

    return respuestaDeErrorDocumento(e, "Error al actualizar el documento del proveedor:");
  }
}

/**
 * EXCLUSIÓN LÓGICA: el documento se oculta de las listas operacionales; el archivo, el historial de versiones y la auditoría se
 * conservan y puede restaurarse. Nunca se borra físicamente nada. Solo PROVEEDORES.EDITAR. Un certificado vinculado a una retención
 * ACTIVA que lo exige no puede eliminarse mientras esté en uso (primero se desactiva o reemplaza la retención).
 */
export async function DELETE(_request: Request, contexto: Contexto) {
  const { id, docId } = await contexto.params;

  if (!idsValidos(id, docId)) return documentoNoEncontrado();

  const auth = await autorizarProveedores();

  if ("respuesta" in auth) return auth.respuesta;

  const denegado = exigir("ELIMINAR", auth.permisos, null);

  if (denegado) return denegado;

  const empresaId = auth.sesion.user.empresaId;
  const usuarioId = auth.sesion.user.id;

  try {
    const resultado = await conTransaccion(async (c) => {
      const enUso = await c.query(
        `SELECT 1 FROM proveedor_retenciones WHERE documento_certificado_id = $1 AND proveedor_id = $2 AND empresa_id = $3 AND activa AND certificado_obligatorio LIMIT 1`,
        [docId, id, empresaId],
      );

      if (enUso.rowCount) return "EN_USO" as const;

      const r = await c.query(
        `UPDATE proveedor_documentos SET eliminado_at = now(), eliminado_por = $4
          WHERE id = $1 AND proveedor_id = $2 AND empresa_id = $3 AND eliminado_at IS NULL
          RETURNING version_vigente, nombre_archivo`,
        [docId, id, empresaId, usuarioId],
      );

      if (r.rowCount !== 1) return "NO_ENCONTRADO" as const;

      await registrarEventoDocumento(c, {
        empresaId,
        proveedorId: id,
        documentoId: docId,
        accion: "DOC_ELIMINACION",
        usuarioId,
        anterior: { version: Number(r.rows[0].version_vigente), nombreArchivo: r.rows[0].nombre_archivo },
      });

      return "OK" as const;
    });

    if (resultado === "EN_USO") {
      return NextResponse.json({ error: "El documento es el certificado de una retención activa: desactive o cambie esa retención antes de eliminarlo." }, { status: 409 });
    }

    return resultado === "OK" ? NextResponse.json({ ok: true, eliminadoLogicamente: true }) : documentoNoEncontrado();
  } catch (e) {
    return respuestaDeErrorDocumento(e, "Error al eliminar el documento del proveedor:");
  }
}
