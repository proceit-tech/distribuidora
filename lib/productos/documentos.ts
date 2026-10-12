/** Documentos de Productos: tipos y metadatos (fechas ISO en la API). Lógica pura. */
import { ErrorValidacion } from "@/lib/productos/errores";
import { esFechaIsoReal } from "@/lib/proveedores/fechas";

export const TIPOS_DOCUMENTO_PRODUCTO = ["FICHA_TECNICA", "HOJA_SEGURIDAD", "CERTIFICADO", "IMAGEN", "OTRO"] as const;

export type MetadatosDocumento = {
  tipo: (typeof TIPOS_DOCUMENTO_PRODUCTO)[number];
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

  if (!(TIPOS_DOCUMENTO_PRODUCTO as readonly string[]).includes(tipo)) throw new ErrorValidacion("Seleccione un tipo de documento válido.", "tipo");

  const observacion = typeof entrada.observacion === "string" ? entrada.observacion.trim() : "";

  if (observacion.length > 1000) throw new ErrorValidacion("La observación supera los 1000 caracteres.", "observacion");

  const fechaEmision = fecha(entrada.fechaEmision, "fechaEmision", "La fecha de emisión");
  const fechaVencimiento = fecha(entrada.fechaVencimiento, "fechaVencimiento", "La fecha de vencimiento");

  if (fechaEmision && fechaVencimiento && fechaVencimiento < fechaEmision) {
    throw new ErrorValidacion("La fecha de vencimiento no puede ser anterior a la de emisión.", "fechaVencimiento");
  }

  return { tipo: tipo as MetadatosDocumento["tipo"], fechaEmision, fechaVencimiento, observacion: observacion || null };
}
