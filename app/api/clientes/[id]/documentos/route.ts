import { NextResponse } from "next/server";

import { borrarArchivo, guardarArchivo, nuevaClave, validarArchivo } from "@/lib/almacenamiento/archivos-privados";
import { validarMetadatosDocumento } from "@/lib/clientes/documentos";
import { decidirAccesoDocumento } from "@/lib/clientes/permisos-documentos";
import {
  UUID,
  autorizar,
  bloquearContextoCargaInicial,
  clienteNoEncontrado,
  conTransaccion,
  contextoCargaInicial,
  exigir,
  leerFormulario,
  registrarEvento,
  respuestaDeError,
} from "@/lib/clientes/documentos-http";

type Contexto = { params: Promise<{ id: string }> };

/**
 * Carga de un documento NUEVO del cliente (multipart: `archivo` + tipo, fechaEmision, fechaVencimiento, observacion).
 * El archivo va al almacenamiento privado; la base guarda metadatos, la clave interna, la versión 1 y el evento de auditoría
 * en una sola transacción. empresa_id siempre de la sesión.
 */
export async function POST(request: Request, contexto: Contexto) {
  const { id } = await contexto.params;

  if (!UUID.test(id)) return clienteNoEncontrado();

  const auth = await autorizar();

  if ("respuesta" in auth) return auth.respuesta;

  const empresaId = auth.sesion.user.empresaId;
  const usuarioId = auth.sesion.user.id;

  // Permisos ANTES de leer el cuerpo: CLIENTES.EDITAR, o CLIENTES.CREAR solo para el cliente que el propio usuario creó y con la carga inicial abierta.
  let estadoCarga: Awaited<ReturnType<typeof contextoCargaInicial>>;

  try {
    estadoCarga = await contextoCargaInicial(id, empresaId, usuarioId);
  } catch (e) {
    return respuestaDeError(e, "Error al verificar el cliente del documento:");
  }

  if (estadoCarga === null) return clienteNoEncontrado();

  const denegado = exigir("CARGAR", auth.permisos, estadoCarga);

  if (denegado) return denegado;

  let clave: string | null = null;
  let registrado = false;

  try {
    const formulario = await leerFormulario(request);
    const archivo = formulario.get("archivo");

    if (!(archivo instanceof File)) throw new Error("Seleccione el archivo del documento.");

    const meta = validarMetadatosDocumento(Object.fromEntries(formulario.entries()));
    const validado = validarArchivo(archivo.name, await archivo.arrayBuffer());

    clave = nuevaClave(empresaId, id);
    await guardarArchivo(clave, validado.buffer);

    const documentoId = await conTransaccion(async (c) => {
      // F-CLI-10-01: revalidar bajo bloqueo de la fila del cliente (serializa con el cierre de la carga inicial y con la edición).
      const bloqueado = await bloquearContextoCargaInicial(c, id, empresaId, usuarioId);

      if (bloqueado === null) return { rechazo: "Cliente no encontrado.", estado: 404 };

      const decision = decidirAccesoDocumento("CARGAR", auth.permisos, bloqueado);

      if (!decision.permitido) return { rechazo: decision.mensaje, estado: decision.estado };

      const cargaInicial = decision.cargaInicial;
      const r = await c.query(
        `INSERT INTO cliente_documentos
           (empresa_id, cliente_id, tipo, nombre_archivo, url_archivo, almacen_clave, tamano_bytes, tipo_mime, sha256,
            fecha_emision, fecha_vencimiento, observacion, cargado_por, version_vigente)
         VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, $9, $10, $11, $12, 1)
         RETURNING id`,
        [empresaId, id, meta.tipo, validado.nombre, clave, validado.tamano, validado.mime, validado.sha256, meta.fechaEmision, meta.fechaVencimiento, meta.observacion, usuarioId],
      );
      const nuevoId = r.rows[0].id as string;

      await c.query(
        `INSERT INTO cliente_documento_versiones
           (empresa_id, cliente_id, documento_id, version, almacen_clave, nombre_archivo, tamano_bytes, tipo_mime, sha256, subido_por)
         VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, $9)`,
        [empresaId, id, nuevoId, clave, validado.nombre, validado.tamano, validado.mime, validado.sha256, usuarioId],
      );
      await registrarEvento(c, {
        empresaId,
        clienteId: id,
        documentoId: nuevoId,
        accion: "CARGA",
        version: 1,
        usuarioId,
        detalle: { nombreArchivo: validado.nombre, tamanoBytes: validado.tamano, sha256: validado.sha256, cargaInicial },
      });

      return nuevoId;
    });

    if (typeof documentoId !== "string") {
      // Rechazado bajo bloqueo: el archivo nuevo nunca se registró; solo ese archivo se limpia.
      if (clave) await borrarArchivo(clave).catch(() => undefined);

      return NextResponse.json({ error: documentoId.rechazo }, { status: documentoId.estado });
    }

    registrado = true;

    return NextResponse.json({ ok: true, id: documentoId, nombreArchivo: validado.nombre, tamanoBytes: validado.tamano });
  } catch (e) {
    // Solo un archivo que NUNCA llegó a registrarse en la base (la transacción falló) se limpia; los archivos registrados no se borran jamás.
    if (clave && !registrado) await borrarArchivo(clave).catch(() => undefined);

    return respuestaDeError(e, "Error al cargar el documento del cliente:");
  }
}

/**
 * Lista los documentos ELIMINADOS lógicamente del cliente (solo CLIENTES.EDITAR). Los documentos vigentes se leen con el detalle
 * del cliente; los eliminados no aparecen en ninguna lista operacional.
 */
export async function GET(request: Request, contexto: Contexto) {
  const { id } = await contexto.params;

  if (!UUID.test(id)) return clienteNoEncontrado();

  const auth = await autorizar();

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
              to_char(eliminado_at, 'DD/MM/YYYY HH24:MI') AS eliminado_en,
              to_char(fecha_emision, 'DD/MM/YYYY') AS fe, to_char(fecha_vencimiento, 'DD/MM/YYYY') AS fv, observacion
         FROM cliente_documentos
        WHERE empresa_id = $1 AND cliente_id = $2 AND eliminado_at IS NOT NULL
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
        fechaEmision: String(f.fe ?? ""),
        fechaVencimiento: String(f.fv ?? ""),
        observacion: String(f.observacion ?? ""),
      })),
    });
  } catch (e) {
    return respuestaDeError(e, "Error al listar los documentos eliminados:");
  }
}
