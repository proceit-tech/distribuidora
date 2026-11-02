import { NextResponse } from "next/server";

import { ErrorValidacion } from "@/lib/proveedores/errores";
import { hoyAsuncion } from "@/lib/proveedores/fechas";
import { ACCIONES_GOBERNANZA, permisoDeAccion, resolverAccion, type AccionGobernanza } from "@/lib/proveedores/gobernanza";
import { UUID_RUTA, autorizarProveedores, conTransaccion, noEncontrado, sinPermiso } from "@/lib/proveedores/http";
import { registrarEvento, respuestaError } from "@/lib/proveedores/shared";

type Contexto = { params: Promise<{ id: string }> };

/**
 * Acciones administrativas del proveedor: homologación (aprobar, rechazar, suspender, renovar, pasar a evaluación), evaluación
 * MANUAL de riesgo y bloqueo/desbloqueo. Cada una exige su permiso específico (distinto de EDITAR), una justificación y deja un
 * evento inmutable con el valor anterior y el nuevo. La edición cadastral común no puede cambiar estos datos.
 */
export async function POST(request: Request, contexto: Contexto) {
  const { id } = await contexto.params;

  if (!UUID_RUTA.test(id)) return noEncontrado();

  let cuerpo: Record<string, unknown>;

  try {
    cuerpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }

  const auth = await autorizarProveedores();

  if ("respuesta" in auth) return auth.respuesta;

  const accion = cuerpo.accion as AccionGobernanza;

  if (!ACCIONES_GOBERNANZA.includes(accion)) return NextResponse.json({ error: "La acción solicitada no es válida." }, { status: 400 });

  const permiso = permisoDeAccion(accion);
  const autorizado = permiso === "HOMOLOGAR" ? auth.permisos.homologar : permiso === "EVALUAR_RIESGO" ? auth.permisos.evaluarRiesgo : auth.permisos.bloquear;

  if (!autorizado) return sinPermiso();

  const empresaId = auth.sesion.user.empresaId;
  const usuarioId = auth.sesion.user.id;

  try {
    const resultado = await conTransaccion(async (c) => {
      const r = await c.query(
        `SELECT activo, bloqueado, coalesce(motivo_bloqueo,'') AS motivo, estado_homologacion,
                coalesce(to_char(fecha_homologacion,'YYYY-MM-DD'),'') AS fh,
                coalesce(to_char(fecha_vencimiento_homologacion,'YYYY-MM-DD'),'') AS fv,
                nivel_riesgo, calificacion_actual::text AS calificacion
           FROM proveedores WHERE id = $1 AND empresa_id = $2 FOR UPDATE`,
        [id, empresaId],
      );

      if (!r.rowCount) return null;

      const f = r.rows[0];
      const accionResuelta = resolverAccion(
        accion,
        {
          activo: f.activo,
          bloqueado: f.bloqueado,
          motivoBloqueo: f.motivo,
          estadoHomologacion: f.estado_homologacion,
          fechaHomologacion: f.fh,
          fechaVencimientoHomologacion: f.fv,
          nivelRiesgo: f.nivel_riesgo,
          calificacionActual: f.calificacion,
        },
        { justificacion: cuerpo.justificacion, fechaVencimiento: cuerpo.fechaVencimiento, nivelRiesgo: cuerpo.nivelRiesgo, calificacion: cuerpo.calificacion },
        hoyAsuncion(),
      );

      const cambios = { ...accionResuelta.cambios } as Record<string, unknown>;

      // Autor y fecha del bloqueo (se limpian al desbloquear; la historia queda en los eventos).
      if (accion === "BLOQUEAR") {
        cambios.bloqueado_por = usuarioId;
        cambios.bloqueado_at = new Date().toISOString();
      } else if (accion === "DESBLOQUEAR") {
        cambios.bloqueado_por = null;
        cambios.bloqueado_at = null;
      }

      const columnas = Object.keys(cambios);

      await c.query(`UPDATE proveedores SET ${columnas.map((col, i) => `${col} = $${i + 3}`).join(", ")} WHERE id = $1 AND empresa_id = $2`, [id, empresaId, ...columnas.map((col) => cambios[col])]);
      await registrarEvento(c, {
        empresaId,
        proveedorId: id,
        entidad: "PROVEEDOR",
        entidadId: id,
        accion: accionResuelta.evento.accion,
        anterior: accionResuelta.evento.anterior,
        nuevo: accionResuelta.evento.nuevo,
        justificacion: accionResuelta.evento.justificacion,
        usuarioId,
      });

      return accionResuelta.evento.accion;
    });

    if (resultado === null) return noEncontrado();

    return NextResponse.json({ ok: true, accion: resultado });
  } catch (e) {
    if (e instanceof ErrorValidacion) return NextResponse.json({ error: e.message, campo: e.campo }, { status: e.estado });

    return respuestaError(e, "actualizar");
  }
}
