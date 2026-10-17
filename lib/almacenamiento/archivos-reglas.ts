/**
 * Reglas de archivos de documentos (política V1 PROPUESTA; el responsable aún no fijó tipos/tamaño/retención): PDF, PNG, JPG,
 * DOCX y XLSX de hasta 10 MB. Módulo PURO (sin Node) para que la interfaz anticipe el mismo criterio que aplica el servidor,
 * que además verifica la firma del contenido (`archivos-privados.ts`).
 */
export const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;

export const TIPOS_PERMITIDOS = [
  { ext: "pdf", mime: "application/pdf", firma: [0x25, 0x50, 0x44, 0x46] },
  { ext: "png", mime: "image/png", firma: [0x89, 0x50, 0x4e, 0x47] },
  { ext: "jpg", mime: "image/jpeg", firma: [0xff, 0xd8, 0xff] },
  { ext: "jpeg", mime: "image/jpeg", firma: [0xff, 0xd8, 0xff] },
  { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", firma: [0x50, 0x4b, 0x03, 0x04] },
  { ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", firma: [0x50, 0x4b, 0x03, 0x04] },
] as const;

export const EXTENSIONES_TEXTO = TIPOS_PERMITIDOS.map((t) => `.${t.ext}`).join(", ");

/** Para el atributo `accept` del selector de archivos. */
export const ACCEPT_ARCHIVOS = TIPOS_PERMITIDOS.map((t) => `.${t.ext}`).join(",");

/** Comprobación previa de nombre y tamaño (la firma del contenido la verifica el servidor). Devuelve el error o null. */
export function validarNombreYTamano(nombre: string, tamano: number): string | null {
  const ext = nombre.includes(".") ? nombre.split(".").pop()!.toLowerCase() : "";

  if (!TIPOS_PERMITIDOS.some((t) => t.ext === ext)) return `Tipo de archivo no permitido. Formatos admitidos: ${EXTENSIONES_TEXTO}.`;
  if (tamano === 0) return "El archivo está vacío.";
  if (tamano > TAMANO_MAXIMO_BYTES) return `El archivo supera el máximo de ${TAMANO_MAXIMO_BYTES / 1024 / 1024} MB.`;

  return null;
}

export function tamanoLegible(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
