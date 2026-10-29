import { NextResponse } from "next/server";

import { ErrorValidacion } from "@/lib/proveedores/errores";
import { UUID_RUTA, autorizarProveedores, conTransaccion, noEncontrado, sinPermiso } from "@/lib/proveedores/http";
import { reactivarCuenta, validarJustificacionReactivacion } from "@/lib/proveedores/reactivacion";
import { respuestaError } from "@/lib/proveedores/shared";

type Contexto = { params: Promise<{ id: string; cuentaId: string }> };

/**
 * Reactivación de una cuenta bancaria desactivada. Exclusiva del ADMINISTRADOR de la empresa (RBAC real: perfil con es_administrador);
 * ni EDITAR ni APROBAR_BANCO bastan. Justificación obligatoria; transacción con bloqueo de la fila; evento CUENTA_REACTIVADA.
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
  if (!auth.permisos.administrador) return sinPermiso();

  try {
    const justificacion = validarJustificacionReactivacion(cuerpo.motivo);
    const resultado = await conTransaccion((c) =>
      reactivarCuenta(c, { empresaId: auth.sesion.user.empresaId, proveedorId: id, cuentaId, usuarioId: auth.sesion.user.id, justificacion }),
    );

    if (resultado === null) return noEncontrado();

    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    if (e instanceof ErrorValidacion) return NextResponse.json({ error: e.message, campo: e.campo }, { status: e.estado });

    return respuestaError(e, "actualizar");
  }
}
