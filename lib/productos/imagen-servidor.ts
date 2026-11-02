/** Validación de la foto en el servidor: reglas de archivos privados (firma, tamaño) y además PNG o JPG. */
import { ErrorArchivo, validarArchivo, type ArchivoValidado } from "@/lib/almacenamiento/archivos-privados";
import { EXTENSIONES_FOTO, MIME_FOTO } from "@/lib/productos/imagen";

export function validarFoto(nombre: string, contenido: ArrayBuffer | Buffer): ArchivoValidado {
  const v = validarArchivo(nombre, contenido);

  if (!MIME_FOTO.includes(v.mime)) throw new ErrorArchivo(`La foto debe ser ${EXTENSIONES_FOTO.join(", ")}.`);

  return v;
}
