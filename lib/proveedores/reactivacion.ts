/**
 * Reactivación administrativa de una cuenta bancaria desactivada (diccionario §8). Reglas puras + ejecución transaccional.
 * La ruta ya verificó que el actor es administrador de la empresa (RBAC real: isCompanyAdmin); aquí se valida la justificación,
 * el estado de la cuenta y la empresa, con bloqueo de fila. NO aprueba nada, NO reabre revisiones, NO marca principal, NO toca
 * banco, número, titular ni moneda: solo vuelve a activar la cuenta conservando su estado de aprobación previo.
 */
import type { PoolClient } from "pg";

import { ErrorValidacion } from "@/lib/proveedores/errores";
import { registrarEvento } from "@/lib/proveedores/sincronizar";

export function validarJustificacionReactivacion(valor: unknown): string {
  const texto = typeof valor === "string" ? valor.trim() : "";

  if (!texto) throw new ErrorValidacion("La justificación de la reactivación es obligatoria.", "motivo");
  if (texto.length > 1000) throw new ErrorValidacion("La justificación supera los 1000 caracteres.", "motivo");

  return texto;
}

/** Devuelve true cuando la cuenta puede volver a ser pagable al reactivarse (estaba aprobada). */
export async function reactivarCuenta(
  conexion: PoolClient,
  p: { empresaId: string; proveedorId: string; cuentaId: string; usuarioId: string; justificacion: string },
): Promise<{ estadoAprobacion: string; pagable: boolean } | null> {
  const cuenta = await conexion.query(
    "SELECT to_jsonb(t.*) AS fila FROM proveedor_cuentas_bancarias t WHERE id = $1 AND proveedor_id = $2 AND empresa_id = $3 FOR UPDATE",
    [p.cuentaId, p.proveedorId, p.empresaId],
  );

  if (!cuenta.rowCount) return null; // inexistente o de otra empresa/proveedor: indistinguible

  const fila = cuenta.rows[0].fila as Record<string, unknown>;

  if (fila.activa !== false) throw new ErrorValidacion("La cuenta ya está activa: no hay nada que reactivar.", null, 409);

  // Solo se restablece la actividad. es_principal queda como está (false desde la desactivación) y el estado de aprobación no cambia.
  await conexion.query(
    `UPDATE proveedor_cuentas_bancarias
        SET activa = true, desactivada_at = NULL, desactivada_por = NULL, motivo_desactivacion = NULL
      WHERE id = $1 AND proveedor_id = $2 AND empresa_id = $3 AND NOT activa`,
    [p.cuentaId, p.proveedorId, p.empresaId],
  );

  const estado = String(fila.estado_aprobacion);
  const pagable = estado === "APROBADA";

  await registrarEvento(conexion, {
    empresaId: p.empresaId,
    proveedorId: p.proveedorId,
    entidad: "CUENTA",
    entidadId: p.cuentaId,
    accion: "CUENTA_REACTIVADA",
    anterior: { activa: false, estado, principal: fila.es_principal, desactivadaEn: fila.desactivada_at ?? null, desactivadaPor: fila.desactivada_por ?? null, motivoDesactivacion: fila.motivo_desactivacion ?? null },
    nuevo: { activa: true, estado, principal: false, pagable },
    justificacion: p.justificacion,
    usuarioId: p.usuarioId,
  });

  return { estadoAprobacion: estado, pagable };
}
