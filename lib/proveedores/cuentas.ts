/** Resolución de aprobación bancaria (DEC-PRV-04/07): reglas puras; la ruta las aplica en una transacción con APROBAR_BANCO y auditoría. */
import { ErrorValidacion } from "@/lib/proveedores/errores";

export type DecisionCuenta = "APROBAR" | "RECHAZAR";
export type PlanCuenta = "APROBAR_CUENTA" | "RECHAZAR_CUENTA" | "APROBAR_REVISION" | "RECHAZAR_REVISION";

export function planDeResolucion(decision: unknown, estadoCuenta: string, hayRevisionPendiente: boolean, motivo: unknown): { plan: PlanCuenta; motivo: string | null } {
  if (decision !== "APROBAR" && decision !== "RECHAZAR") throw new ErrorValidacion("Indique si aprueba o rechaza la cuenta.", "decision");

  const texto = typeof motivo === "string" ? motivo.trim() : "";

  if (texto.length > 1000) throw new ErrorValidacion("El motivo supera los 1000 caracteres.", "motivo");
  if (decision === "RECHAZAR" && !texto) throw new ErrorValidacion("El motivo del rechazo es obligatorio.", "motivo");

  if (estadoCuenta === "PENDIENTE") {
    return { plan: decision === "APROBAR" ? "APROBAR_CUENTA" : "RECHAZAR_CUENTA", motivo: texto || null };
  }
  if (estadoCuenta === "APROBADA" && hayRevisionPendiente) {
    return { plan: decision === "APROBAR" ? "APROBAR_REVISION" : "RECHAZAR_REVISION", motivo: texto || null };
  }
  if (estadoCuenta === "APROBADA") throw new ErrorValidacion("La cuenta ya está aprobada y no tiene cambios pendientes.", null, 409);

  throw new ErrorValidacion("La cuenta fue rechazada: debe corregirse para volver a presentarla a aprobación.", null, 409);
}

/** Columnas que una revisión aprobada puede aplicar a la cuenta (lista cerrada; nunca columnas de estado ni de identidad). */
export const COLUMNAS_REVISABLES = [
  "banco",
  "sucursal_banco",
  "titular",
  "documento_titular",
  "tipo_cuenta",
  "numero_cuenta",
  "moneda_codigo",
  "alias_cuenta",
  "codigo_swift",
  "iban",
  "es_principal",
] as const;

/** Filtra y devuelve solo las columnas permitidas de los datos propuestos. */
export function columnasDeRevision(datos: Record<string, unknown>): Array<[string, unknown]> {
  return COLUMNAS_REVISABLES.filter((c) => c in datos).map((c) => [c, datos[c] ?? null]);
}
