/** Documentos de Proveedores: tipos, metadatos (fechas ISO en la API) y validez de un certificado de retención. Lógica pura. */
import { ErrorValidacion } from "@/lib/proveedores/errores";
import { esFechaIsoReal } from "@/lib/proveedores/fechas";

export const TIPOS_DOCUMENTO_PROVEEDOR = ["CONTRATO", "CONSTANCIA_RUC", "CERTIFICADO_BANCARIO", "CERTIFICADO_RETENCION", "LICENCIA", "OTRO"] as const;

export type MetadatosDocumento = {
  tipo: (typeof TIPOS_DOCUMENTO_PROVEEDOR)[number];
  fechaEmision: string | null;
  fechaVencimiento: string | null;
  observacion: string | null;
};

function fecha(valor: unknown, campo: string, etiqueta: string): string | null {
  const t = typeof valor === "string" ? valor.trim() : "";

  if (!t) return null;
  if (!esFechaIsoReal(t)) throw new ErrorValidacion(`${etiqueta} no es una fecha válida (dd/mm/aaaa).`, campo);

  return t;
}

/** Valida y normaliza los metadatos del documento. Nunca trunca: lo que excede un límite se rechaza. */
export function validarMetadatosDocumento(entrada: Record<string, unknown>): MetadatosDocumento {
  const tipo = (typeof entrada.tipo === "string" ? entrada.tipo.trim().toUpperCase() : "") || "OTRO";

  if (!(TIPOS_DOCUMENTO_PROVEEDOR as readonly string[]).includes(tipo)) throw new ErrorValidacion("Seleccione un tipo de documento válido.", "tipo");

  const observacion = typeof entrada.observacion === "string" ? entrada.observacion.trim() : "";

  if (observacion.length > 1000) throw new ErrorValidacion("La observación supera los 1000 caracteres.", "observacion");

  const fechaEmision = fecha(entrada.fechaEmision, "fechaEmision", "La fecha de emisión");
  const fechaVencimiento = fecha(entrada.fechaVencimiento, "fechaVencimiento", "La fecha de vencimiento");

  if (fechaEmision && fechaVencimiento && fechaVencimiento < fechaEmision) {
    throw new ErrorValidacion("La fecha de vencimiento no puede ser anterior a la de emisión.", "fechaVencimiento");
  }

  return { tipo: tipo as MetadatosDocumento["tipo"], fechaEmision, fechaVencimiento, observacion: observacion || null };
}

export type DocumentoParaCertificado = {
  tipo: string;
  tieneArchivo: boolean;
  eliminado: boolean;
  /** ISO o "" */
  fechaVencimiento: string;
};

/** Un certificado de retención es válido si es de ese tipo, tiene archivo, no está eliminado y no venció (vale hasta el final de su día). */
export function certificadoValido(d: DocumentoParaCertificado, hoy: string): boolean {
  return d.tipo === "CERTIFICADO_RETENCION" && d.tieneArchivo && !d.eliminado && (d.fechaVencimiento === "" || d.fechaVencimiento >= hoy);
}
