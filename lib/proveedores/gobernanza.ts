/**
 * Gobernanza de Proveedores (DEC-PRV-01/02/03/06/10): reglas PURAS de las acciones administrativas y de la elegibilidad para
 * nuevas órdenes de compra. La ruta aplica el resultado en una transacción, con permiso específico y auditoría; la edición cadastral
 * común (PUT) no puede cambiar ninguno de estos datos.
 *
 * Contrato para Compras/Pagos (NO implementado aquí; se documenta en el diccionario): al confirmar una orden de compra el
 * servidor debe exigir `proveedor_elegible_para_compra(empresa, proveedor)` (NEX-034) y al pagar una cuenta,
 * `proveedor_cuenta_pagable(empresa, cuenta)` (NEX-035). La elegibilidad no afecta pedidos ni obligaciones anteriores.
 */
import { PORCENTAJE_5_2, decimalExacto } from "@/lib/proveedores/decimal";
import { ErrorValidacion } from "@/lib/proveedores/errores";
import { esFechaIsoReal } from "@/lib/proveedores/fechas";

export type PermisoGobernanza = "HOMOLOGAR" | "EVALUAR_RIESGO" | "BLOQUEAR";

export type AccionGobernanza = "EN_EVALUACION" | "HOMOLOGAR" | "RECHAZAR" | "SUSPENDER" | "RENOVAR" | "EVALUAR_RIESGO" | "BLOQUEAR" | "DESBLOQUEAR";

export const ACCIONES_GOBERNANZA: readonly AccionGobernanza[] = ["EN_EVALUACION", "HOMOLOGAR", "RECHAZAR", "SUSPENDER", "RENOVAR", "EVALUAR_RIESGO", "BLOQUEAR", "DESBLOQUEAR"];

export const NIVELES_EVALUABLES = ["BAJO", "MEDIO", "ALTO", "CRITICO"] as const;

export type EstadoGobernanza = {
  activo: boolean;
  bloqueado: boolean;
  motivoBloqueo: string;
  estadoHomologacion: string;
  /** ISO o "" */
  fechaHomologacion: string;
  fechaVencimientoHomologacion: string;
  nivelRiesgo: string;
  calificacionActual: string | null;
};

export type EntradaAccion = {
  justificacion?: unknown;
  fechaVencimiento?: unknown;
  nivelRiesgo?: unknown;
  calificacion?: unknown;
};

export type ResultadoAccion = {
  permiso: PermisoGobernanza;
  /** columna → valor, listo para el UPDATE */
  cambios: Record<string, unknown>;
  evento: { accion: string; anterior: Record<string, unknown>; nuevo: Record<string, unknown>; justificacion: string };
};

export function permisoDeAccion(accion: AccionGobernanza): PermisoGobernanza {
  if (accion === "EVALUAR_RIESGO") return "EVALUAR_RIESGO";
  if (accion === "BLOQUEAR" || accion === "DESBLOQUEAR") return "BLOQUEAR";

  return "HOMOLOGAR";
}

/** La homologación está vencida si el vencimiento ya pasó (vale hasta el final de ese día) o el estado almacenado es VENCIDO. */
export function homologacionVencida(e: Pick<EstadoGobernanza, "estadoHomologacion" | "fechaVencimientoHomologacion">, hoy: string): boolean {
  if (e.estadoHomologacion === "VENCIDO") return true;

  return e.estadoHomologacion === "HOMOLOGADO" && e.fechaVencimientoHomologacion !== "" && e.fechaVencimientoHomologacion < hoy;
}

/** Elegibilidad para NUEVAS órdenes de compra (DEC-PRV-01/03): activo, no bloqueado, homologado y con homologación vigente. */
export function estadoOperativo(e: EstadoGobernanza, hoy: string): { elegible: boolean; motivos: string[] } {
  const motivos: string[] = [];

  if (!e.activo) motivos.push("El proveedor está inactivo.");
  if (e.bloqueado) motivos.push("El proveedor está bloqueado administrativamente.");
  if (homologacionVencida(e, hoy)) motivos.push("La homologación está vencida: requiere renovación autorizada.");
  else if (e.estadoHomologacion !== "HOMOLOGADO") motivos.push("El proveedor no está homologado.");

  return { elegible: motivos.length === 0, motivos };
}

function fallar(mensaje: string, campo: string | null, estado = 400): never {
  throw new ErrorValidacion(mensaje, campo, estado);
}

function justificacionDe(entrada: EntradaAccion, etiqueta: string): string {
  const t = typeof entrada.justificacion === "string" ? entrada.justificacion.trim() : "";

  if (!t) return fallar(`${etiqueta} es obligatoria.`, "justificacion");
  if (t.length > 1000) return fallar(`${etiqueta} supera los 1000 caracteres.`, "justificacion");

  return t;
}

function vencimientoDe(entrada: EntradaAccion, hoy: string, obligatorio: boolean): string | null {
  const v = entrada.fechaVencimiento;

  if (v === undefined || v === null || v === "") {
    return obligatorio ? fallar("Indique la fecha de vencimiento de la homologación.", "fechaVencimiento") : null;
  }
  if (typeof v !== "string" || !esFechaIsoReal(v.trim())) return fallar("La fecha de vencimiento no es una fecha válida.", "fechaVencimiento");
  if (v.trim() < hoy) return fallar("La fecha de vencimiento no puede ser anterior a hoy.", "fechaVencimiento");

  return v.trim();
}

function transicion(accion: string, e: EstadoGobernanza, permitidos: string[], hoy: string) {
  const efectivo = homologacionVencida(e, hoy) && e.estadoHomologacion === "HOMOLOGADO" ? "VENCIDO" : e.estadoHomologacion;

  if (!permitidos.includes(efectivo)) fallar(`No es posible ${accion} un proveedor en estado «${efectivo.toLowerCase().replace(/_/g, " ")}».`, null, 409);
}

/** Valida y resuelve una acción administrativa. Lanza ErrorValidacion si no corresponde o faltan datos obligatorios. */
export function resolverAccion(accion: AccionGobernanza, e: EstadoGobernanza, entrada: EntradaAccion, hoy: string): ResultadoAccion {
  const permiso = permisoDeAccion(accion);
  const anteriorHom = { estadoHomologacion: e.estadoHomologacion, fechaHomologacion: e.fechaHomologacion || null, fechaVencimientoHomologacion: e.fechaVencimientoHomologacion || null };

  switch (accion) {
    case "EN_EVALUACION": {
      const justificacion = justificacionDe(entrada, "La justificación");

      transicion("pasar a evaluación", e, ["PENDIENTE", "RECHAZADO", "SUSPENDIDO", "VENCIDO"], hoy);

      return {
        permiso,
        cambios: { estado_homologacion: "EN_EVALUACION" },
        evento: { accion: "HOMOLOGACION_EN_EVALUACION", anterior: anteriorHom, nuevo: { ...anteriorHom, estadoHomologacion: "EN_EVALUACION" }, justificacion },
      };
    }
    case "HOMOLOGAR": {
      const justificacion = justificacionDe(entrada, "La justificación");
      const vence = vencimientoDe(entrada, hoy, false);

      transicion("homologar", e, ["PENDIENTE", "EN_EVALUACION", "SUSPENDIDO"], hoy);

      const nuevo = { estadoHomologacion: "HOMOLOGADO", fechaHomologacion: hoy, fechaVencimientoHomologacion: vence };

      return {
        permiso,
        cambios: { estado_homologacion: "HOMOLOGADO", fecha_homologacion: hoy, fecha_vencimiento_homologacion: vence },
        evento: { accion: "HOMOLOGACION_APROBADA", anterior: anteriorHom, nuevo, justificacion },
      };
    }
    case "RECHAZAR": {
      const justificacion = justificacionDe(entrada, "El motivo del rechazo");

      transicion("rechazar", e, ["PENDIENTE", "EN_EVALUACION"], hoy);

      return {
        permiso,
        cambios: { estado_homologacion: "RECHAZADO" },
        evento: { accion: "HOMOLOGACION_RECHAZADA", anterior: anteriorHom, nuevo: { ...anteriorHom, estadoHomologacion: "RECHAZADO" }, justificacion },
      };
    }
    case "SUSPENDER": {
      const justificacion = justificacionDe(entrada, "El motivo de la suspensión");

      transicion("suspender", e, ["HOMOLOGADO"], hoy);

      return {
        permiso,
        cambios: { estado_homologacion: "SUSPENDIDO" },
        evento: { accion: "HOMOLOGACION_SUSPENDIDA", anterior: anteriorHom, nuevo: { ...anteriorHom, estadoHomologacion: "SUSPENDIDO" }, justificacion },
      };
    }
    case "RENOVAR": {
      const justificacion = justificacionDe(entrada, "La justificación");
      const vence = vencimientoDe(entrada, hoy, true);

      // Se puede renovar una homologación vigente (anticipada) o vencida; no una pendiente, rechazada o suspendida.
      if (e.estadoHomologacion !== "HOMOLOGADO" && e.estadoHomologacion !== "VENCIDO") {
        fallar(`No es posible renovar un proveedor en estado «${e.estadoHomologacion.toLowerCase().replace(/_/g, " ")}»: homológuelo.`, null, 409);
      }

      const nuevo = { estadoHomologacion: "HOMOLOGADO", fechaHomologacion: hoy, fechaVencimientoHomologacion: vence };

      return {
        permiso,
        cambios: { estado_homologacion: "HOMOLOGADO", fecha_homologacion: hoy, fecha_vencimiento_homologacion: vence },
        evento: { accion: "HOMOLOGACION_RENOVADA", anterior: anteriorHom, nuevo, justificacion },
      };
    }
    case "EVALUAR_RIESGO": {
      const justificacion = justificacionDe(entrada, "La justificación de la evaluación");
      const nivel = typeof entrada.nivelRiesgo === "string" ? entrada.nivelRiesgo.trim().toUpperCase() : "";

      if (!(NIVELES_EVALUABLES as readonly string[]).includes(nivel)) fallar("Seleccione el nivel de riesgo.", "nivelRiesgo");

      const nota = decimalExacto(entrada.calificacion, PORCENTAJE_5_2, "La calificación");

      if (!nota.ok) return fallar(nota.error, "calificacion");

      const anterior = { nivelRiesgo: e.nivelRiesgo, calificacionActual: e.calificacionActual };

      return {
        permiso,
        cambios: { nivel_riesgo: nivel, calificacion_actual: nota.valor },
        evento: { accion: "RIESGO_EVALUADO", anterior, nuevo: { nivelRiesgo: nivel, calificacionActual: nota.valor }, justificacion },
      };
    }
    case "BLOQUEAR": {
      const justificacion = justificacionDe(entrada, "El motivo del bloqueo");

      if (e.bloqueado) fallar("El proveedor ya está bloqueado.", null, 409);

      return {
        permiso,
        cambios: { bloqueado: true, motivo_bloqueo: justificacion },
        evento: { accion: "BLOQUEO", anterior: { bloqueado: false, motivoBloqueo: null }, nuevo: { bloqueado: true, motivoBloqueo: justificacion }, justificacion },
      };
    }
    case "DESBLOQUEAR": {
      const justificacion = justificacionDe(entrada, "El motivo del desbloqueo");

      if (!e.bloqueado) fallar("El proveedor no está bloqueado.", null, 409);

      return {
        permiso,
        cambios: { bloqueado: false, motivo_bloqueo: null },
        evento: { accion: "DESBLOQUEO", anterior: { bloqueado: true, motivoBloqueo: e.motivoBloqueo }, nuevo: { bloqueado: false, motivoBloqueo: null }, justificacion },
      };
    }
  }
}
