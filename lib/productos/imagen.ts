/** Foto principal del producto: solo PNG y JPG (mismas reglas de firma, tamaño y almacenamiento privado que los documentos). Lógica pura, apta para el navegador. */
export const MIME_FOTO: readonly string[] = ["image/png", "image/jpeg"];
export const EXTENSIONES_FOTO = [".png", ".jpg", ".jpeg"] as const;
export const ACCEPT_FOTO = EXTENSIONES_FOTO.join(",");

/** Comprobación previa para el navegador: extensión admitida y tamaño (el servidor verifica además la firma). */
export function errorDeFoto(nombre: string, tamano: number, maximo: number): string | null {
  const ext = nombre.includes(".") ? `.${nombre.split(".").pop()!.toLowerCase()}` : "";

  if (!(EXTENSIONES_FOTO as readonly string[]).includes(ext)) return `La foto debe ser ${EXTENSIONES_FOTO.join(", ")}.`;
  if (tamano === 0) return "El archivo está vacío.";
  if (tamano > maximo) return `El archivo supera el máximo de ${maximo / 1024 / 1024} MB.`;

  return null;
}
