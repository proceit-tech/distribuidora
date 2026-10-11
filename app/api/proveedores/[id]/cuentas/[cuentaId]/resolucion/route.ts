import { NextResponse } from "next/server";

import { columnasDeRevision, planDeResolucion } from "@/lib/proveedores/cuentas";
import { ErrorValidacion } from "@/lib/proveedores/errores";
import { UUID_RUTA, autorizarProveedores, conTransaccion, noEncontrado, sinPermiso } from "@/lib/proveedores/http";
import { registrarEvento, respuestaError } from "@/lib/proveedores/shared";

type Contexto = { params: Promise<{ id: string; cuentaId: string }> };

/**
 * Aprobación o rechazo de una cuenta bancaria nueva, o de la revisión pendiente de una cuenta ya aprobada (DEC-PRV-04).
 * Exige PROVEEDORES.APROBAR_BANCO (distinto de EDITAR). La cuenta aprobada anterior solo cambia cuando se aprueba la revisión,
 * y el antes/después queda en la auditoría. Una sola cuenta principal APROBADA por moneda (DEC-PRV-07).
 */
export async function POST(request: Request, contexto: Contexto) {
  const { id, cuentaId } = await contexto.params;

  if (!UUID_RUTA.test(id) || !UUID_RUTA.test(cuentaId)) return noEncontrado();

  let cuerpo: Record<string, unknown>;

  try {
    cuerpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Los datos enviados no son válidos." }, { status: 400 });
  }

  const auth = await autorizarProveedores();

  if ("respuesta" in auth) return auth.respuesta;
  if (!auth.permisos.aprobarBanco) return sinPermiso();

  const empresaId = auth.sesion.user.empresaId;
  const usuarioId = auth.sesion.user.id;

  try {
    const resultado = await conTransaccion(async (c) => {
      const cuenta = await c.query("SELECT to_jsonb(t.*) AS fila FROM proveedor_cuentas_bancarias t WHERE id = $1 AND proveedor_id = $2 AND empresa_id = $3 FOR UPDATE", [cuentaId, id, empresaId]);

      if (!cuenta.rowCount) return null;

      const fila = cuenta.rows[0].fila as Record<string, unknown>;
      const revision = await c.query("SELECT id, datos FROM proveedor_cuenta_revisiones WHERE cuenta_id = $1 AND empresa_id = $2 AND estado = 'PENDIENTE' FOR UPDATE", [cuentaId, empresaId]);
      const { plan, motivo } = planDeResolucion(cuerpo.decision, String(fila.estado_aprobacion), (revision.rowCount ?? 0) > 0, cuerpo.motivo);

      if (plan === "APROBAR_CUENTA") {
        await c.query("UPDATE proveedor_cuentas_bancarias SET estado_aprobacion = 'APROBADA', aprobado_por = $4, aprobado_at = now(), motivo_resolucion = $5 WHERE id = $1 AND proveedor_id = $2 AND empresa_id = $3", [cuentaId, id, empresaId, usuarioId, motivo]);
        await registrarEvento(c, { empresaId, proveedorId: id, entidad: "CUENTA", entidadId: cuentaId, accion: "CUENTA_APROBADA", anterior: { estado: fila.estado_aprobacion }, nuevo: { estado: "APROBADA", principal: fila.es_principal }, justificacion: motivo, usuarioId });
      } else if (plan === "RECHAZAR_CUENTA") {
        await c.query("UPDATE proveedor_cuentas_bancarias SET estado_aprobacion = 'RECHAZADA', aprobado_por = NULL, aprobado_at = NULL, motivo_resolucion = $4 WHERE id = $1 AND proveedor_id = $2 AND empresa_id = $3", [cuentaId, id, empresaId, motivo]);
        await registrarEvento(c, { empresaId, proveedorId: id, entidad: "CUENTA", entidadId: cuentaId, accion: "CUENTA_RECHAZADA", anterior: { estado: fila.estado_aprobacion }, nuevo: { estado: "RECHAZADA" }, justificacion: motivo, usuarioId });
      } else if (plan === "APROBAR_REVISION") {
        const columnas = columnasDeRevision(revision.rows[0].datos as Record<string, unknown>);
        const antes = Object.fromEntries(columnas.map(([nombre]) => [nombre, fila[nombre] ?? null]));

        await c.query(`UPDATE proveedor_cuentas_bancarias SET ${columnas.map(([n], i) => `${n} = $${i + 4}`).join(", ")}, aprobado_por = $${columnas.length + 4}, aprobado_at = now(), motivo_resolucion = $${columnas.length + 5} WHERE id = $1 AND proveedor_id = $2 AND empresa_id = $3`, [cuentaId, id, empresaId, ...columnas.map(([, v]) => v), usuarioId, motivo]);
        await c.query("UPDATE proveedor_cuenta_revisiones SET estado = 'APROBADA', resuelto_por = $3, resuelto_at = now(), motivo = $4 WHERE id = $1 AND empresa_id = $2", [revision.rows[0].id, empresaId, usuarioId, motivo]);
        await registrarEvento(c, { empresaId, proveedorId: id, entidad: "CUENTA", entidadId: cuentaId, accion: "CUENTA_REVISION_APROBADA", anterior: antes, nuevo: Object.fromEntries(columnas), justificacion: motivo, usuarioId });
      } else {
        await c.query("UPDATE proveedor_cuenta_revisiones SET estado = 'RECHAZADA', resuelto_por = $3, resuelto_at = now(), motivo = $4 WHERE id = $1 AND empresa_id = $2", [revision.rows[0].id, empresaId, usuarioId, motivo]);
        await registrarEvento(c, { empresaId, proveedorId: id, entidad: "CUENTA", entidadId: cuentaId, accion: "CUENTA_REVISION_RECHAZADA", anterior: null, nuevo: revision.rows[0].datos, justificacion: motivo, usuarioId });
      }

      return plan;
    });

    if (resultado === null) return noEncontrado();

    return NextResponse.json({ ok: true, plan: resultado });
  } catch (e) {
    if (e instanceof ErrorValidacion) return NextResponse.json({ error: e.message, campo: e.campo }, { status: e.estado });

    const pg = e as { code?: string; constraint?: string };

    if (pg.code === "23505" && pg.constraint === "proveedor_cuentas_bancarias_principal_moneda_uq") {
      return NextResponse.json({ error: "Ya existe otra cuenta principal aprobada en esa moneda: retire primero su condición de principal." }, { status: 409 });
    }

    return respuestaError(e, "actualizar");
  }
}
