/** Metadatos de los documentos de Clientes (tipo, fechas dd/mm/yyyy, observación): validación compartida por la API. */
export const TIPOS_DOCUMENTO_CLIENTE = ["RUC", "CONTRATO", "CREDITO", "EXONERACION", "OTRO"] as const;

export type MetadatosDocumento = {
  tipo: string;
  fechaEmision: string | null; // ISO yyyy-mm-dd
  fechaVencimiento: string | null;
  observacion: string | null;
};

function fecha(valor: unknown, etiqueta: string): string | null {
  const texto = typeof valor === "string" ? valor.trim() : "";

  if (!texto) return null;

  const m = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (!m) throw new Error(`${etiqueta} debe tener el formato dd/mm/yyyy.`);

  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));

  if (d.getUTCFullYear() !== Number(m[3]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[1])) {
    throw new Error(`${etiqueta} no es una fecha válida.`);
  }

  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Valida y normaliza los metadatos. Lanza Error con mensaje para el usuario; nunca trunca. */
export function validarMetadatosDocumento(entrada: Record<string, unknown>): MetadatosDocumento {
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const tipo = texto(entrada.tipo).toUpperCase() || "OTRO";

  if (!(TIPOS_DOCUMENTO_CLIENTE as readonly string[]).includes(tipo)) throw new Error("Existe un tipo de documento de cliente no válido.");

  const observacion = texto(entrada.observacion);

  if (observacion.length > 500) throw new Error("La observación del documento supera los 500 caracteres.");

  const fechaEmision = fecha(entrada.fechaEmision, "La fecha de emisión del documento");
  const fechaVencimiento = fecha(entrada.fechaVencimiento, "La fecha de vencimiento del documento");

  if (fechaEmision && fechaVencimiento && fechaVencimiento < fechaEmision) {
    throw new Error("La fecha de vencimiento del documento no puede ser anterior a su emisión.");
  }

  return { tipo, fechaEmision, fechaVencimiento, observacion: observacion || null };
}
